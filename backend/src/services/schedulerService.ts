import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cron, { ScheduledTask } from 'node-cron';
import { getDatabase } from '../core/database.js';

interface SchedulerTaskOptions {
    id: string;
    name: string;
    cron: string;
    handler: () => Promise<void> | void;
    pluginId?: string;
}

interface SchedulerApi {
    register: (opts: SchedulerTaskOptions) => Promise<void>;
    unregister: (taskId: string) => Promise<void>;
    stopAll: () => void;
}

const activeTasks = new Map<string, ScheduledTask>();

async function schedulerPlugin(fastify: FastifyInstance): Promise<void> {
    const db = getDatabase();

    const scheduler: SchedulerApi = {
        async register(opts: SchedulerTaskOptions): Promise<void> {
            if (!cron.validate(opts.cron)) {
                console.error(`[Scheduler] Ungueltige Cron-Expression fuer '${opts.id}': ${opts.cron}`);
                return;
            }

            // In DB registrieren/aktualisieren
            const existing = await db('scheduled_tasks').where('task_id', opts.id).first();
            if (existing) {
                await db('scheduled_tasks').where('task_id', opts.id).update({
                    name: opts.name,
                    cron_expression: opts.cron,
                    plugin_id: opts.pluginId || null,
                });
            } else {
                await db('scheduled_tasks').insert({
                    task_id: opts.id,
                    name: opts.name,
                    cron_expression: opts.cron,
                    plugin_id: opts.pluginId || null,
                    is_active: true,
                });
            }

            // Bestehenden Task stoppen falls vorhanden
            if (activeTasks.has(opts.id)) {
                activeTasks.get(opts.id)!.stop();
                activeTasks.delete(opts.id);
            }

            // Task nur starten wenn is_active
            const taskRecord = await db('scheduled_tasks').where('task_id', opts.id).first();
            if (taskRecord && !taskRecord.is_active) {
                console.log(`[Scheduler] Task '${opts.id}' registriert aber deaktiviert`);
                return;
            }

            const task = cron.schedule(opts.cron, async () => {
                const startedAt = new Date();
                const runId = (await db('scheduled_task_runs').insert({
                    task_id: opts.id,
                    started_at: startedAt,
                    status: 'running',
                }))[0];

                try {
                    await opts.handler();
                    const finishedAt = new Date();
                    await db('scheduled_task_runs').where('id', runId).update({
                        status: 'success',
                        finished_at: finishedAt,
                        duration_ms: finishedAt.getTime() - startedAt.getTime(),
                    });
                    await db('scheduled_tasks').where('task_id', opts.id).update({
                        last_run_at: finishedAt,
                    });
                } catch (error: any) {
                    const finishedAt = new Date();
                    await db('scheduled_task_runs').where('id', runId).update({
                        status: 'error',
                        finished_at: finishedAt,
                        duration_ms: finishedAt.getTime() - startedAt.getTime(),
                        error_message: error?.message || String(error),
                    });
                    console.error(`[Scheduler] Fehler in Task '${opts.id}':`, error?.message);
                }
            });

            activeTasks.set(opts.id, task);
            console.log(`[Scheduler] Task '${opts.id}' registriert (${opts.cron})`);
        },

        async unregister(taskId: string): Promise<void> {
            if (activeTasks.has(taskId)) {
                activeTasks.get(taskId)!.stop();
                activeTasks.delete(taskId);
            }
            await db('scheduled_tasks').where('task_id', taskId).delete();
            console.log(`[Scheduler] Task '${taskId}' entfernt`);
        },

        stopAll(): void {
            for (const [id, task] of activeTasks) {
                task.stop();
                console.log(`[Scheduler] Task '${id}' gestoppt`);
            }
            activeTasks.clear();
        },
    };

    fastify.decorate('scheduler', scheduler);

    // Core-Task: Alte Task-Runs aufraeumen (aelter als 30 Tage)
    await scheduler.register({
        id: 'core.cleanup-task-runs',
        name: 'Task-Run-History bereinigen',
        cron: '0 3 * * *', // Taeglich um 03:00
        handler: async () => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const deleted = await db('scheduled_task_runs')
                .where('started_at', '<', thirtyDaysAgo)
                .delete();
            if (deleted > 0) {
                console.log(`[Scheduler] ${deleted} alte Task-Runs bereinigt`);
            }
        },
    });

    console.log('[Scheduler] Service initialisiert');
}

// Admin-Routen fuer Scheduler-Verwaltung (ohne fp!)
export async function schedulerRoutes(fastify: FastifyInstance): Promise<void> {
    const db = getDatabase();

    // GET /api/admin/scheduler – Alle Tasks
    fastify.get('/scheduler', async (request, reply) => {
        const tasks = await db('scheduled_tasks').orderBy('created_at', 'desc');
        // Letzten Run pro Task holen
        const enriched = await Promise.all(tasks.map(async (task: any) => {
            const lastRun = await db('scheduled_task_runs')
                .where('task_id', task.task_id)
                .orderBy('started_at', 'desc')
                .first();
            const runCount = await db('scheduled_task_runs')
                .where('task_id', task.task_id)
                .count('id as count')
                .first();
            return {
                ...task,
                last_run: lastRun || null,
                total_runs: runCount?.count || 0,
            };
        }));
        return reply.send(enriched);
    });

    // PUT /api/admin/scheduler/:taskId/toggle – Aktivieren/Deaktivieren
    fastify.put('/scheduler/:taskId/toggle', async (request, reply) => {
        const { taskId } = request.params as { taskId: string };
        const task = await db('scheduled_tasks').where('task_id', taskId).first();
        if (!task) return reply.status(404).send({ error: 'Task nicht gefunden' });

        const newState = !task.is_active;
        await db('scheduled_tasks').where('task_id', taskId).update({ is_active: newState });

        // Task zur Laufzeit stoppen/starten ist nicht moeglich ohne Re-Register,
        // daher Info zurueckgeben und Neustart empfehlen
        return reply.send({
            success: true,
            is_active: newState,
            message: newState
                ? 'Task aktiviert (wird nach Neustart ausgefuehrt)'
                : 'Task deaktiviert (wird nach Neustart nicht mehr ausgefuehrt)',
        });
    });

    // GET /api/admin/scheduler/:taskId/runs – Run-History
    fastify.get('/scheduler/:taskId/runs', async (request, reply) => {
        const { taskId } = request.params as { taskId: string };
        const runs = await db('scheduled_task_runs')
            .where('task_id', taskId)
            .orderBy('started_at', 'desc')
            .limit(50);
        return reply.send(runs);
    });
}

export default fp(schedulerPlugin, { name: 'schedulerService' });
