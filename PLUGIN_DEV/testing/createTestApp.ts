/**
 * Plugin Test Framework
 *
 * Erstellt eine isolierte Fastify-Testinstanz mit gemockten Core-Services.
 * Plugin-Entwickler koennen damit Unit-Tests ohne echte DB/Server schreiben.
 *
 * Nutzung:
 * ```ts
 * import { createTestApp } from '../testing/createTestApp.js';
 *
 * const { fastify, db } = await createTestApp({
 *   pluginPath: './plugins/mein-plugin',
 * });
 *
 * const res = await fastify.inject({ method: 'GET', url: '/items' });
 * expect(res.statusCode).toBe(200);
 *
 * await fastify.close();
 * ```
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface TestAppOptions {
    /** Pfad zum Plugin-Backend-Modul (relativ oder absolut) */
    pluginPath?: string;
    /** Test-User fuer Authentication-Mock */
    testUser?: {
        userId: number;
        username: string;
        tenantId: number;
        permissions: string[];
        sessionId?: number;
    };
    /** Initiale Testdaten (Tabellenname → Zeilen) */
    seedData?: Record<string, Record<string, any>[]>;
}

interface MockDatabase {
    _tables: Record<string, Record<string, any>[]>;
    (table: string): MockQueryBuilder;
}

interface MockQueryBuilder {
    where: (...args: any[]) => MockQueryBuilder;
    orWhere: (...args: any[]) => MockQueryBuilder;
    first: () => Promise<any>;
    select: (...args: any[]) => MockQueryBuilder;
    insert: (data: any) => Promise<number[]>;
    update: (data: any) => Promise<number>;
    delete: () => Promise<number>;
    count: (...args: any[]) => MockQueryBuilder;
    orderBy: (...args: any[]) => MockQueryBuilder;
    limit: (n: number) => MockQueryBuilder;
    offset: (n: number) => MockQueryBuilder;
    join: (...args: any[]) => MockQueryBuilder;
    clone: () => MockQueryBuilder;
}

function createMockDB(seedData: Record<string, Record<string, any>[]> = {}): MockDatabase {
    const tables: Record<string, Record<string, any>[]> = { ...seedData };

    const db = function (table: string): MockQueryBuilder {
        if (!tables[table]) tables[table] = [];
        let _data = tables[table];
        let _wheres: Array<{ field: string; op: string; value: any }> = [];
        let _limit = -1;
        let _offset = 0;

        function applyFilters(): Record<string, any>[] {
            let result = [..._data];
            for (const w of _wheres) {
                result = result.filter((row) => {
                    if (w.op === '=') return row[w.field] === w.value;
                    if (w.op === 'like') {
                        const pattern = w.value.replace(/%/g, '.*');
                        return new RegExp(pattern, 'i').test(String(row[w.field] || ''));
                    }
                    if (w.op === '>') return row[w.field] > w.value;
                    if (w.op === '<') return row[w.field] < w.value;
                    return true;
                });
            }
            if (_offset > 0) result = result.slice(_offset);
            if (_limit > 0) result = result.slice(0, _limit);
            return result;
        }

        const builder: MockQueryBuilder = {
            where(...args: any[]) {
                if (typeof args[0] === 'function') {
                    // Nested where – just call the function
                    args[0].call(builder);
                } else if (args.length === 2) {
                    _wheres.push({ field: args[0], op: '=', value: args[1] });
                } else if (args.length === 3) {
                    _wheres.push({ field: args[0], op: args[1], value: args[2] });
                }
                return builder;
            },
            orWhere(...args: any[]) {
                // Simplified: treat as additional where for testing
                if (args.length >= 2) {
                    _wheres.push({ field: args[0], op: args.length === 3 ? args[1] : '=', value: args.length === 3 ? args[2] : args[1] });
                }
                return builder;
            },
            async first() { return applyFilters()[0] || null; },
            select() { return builder; },
            async insert(data: any) {
                const nextId = Math.max(0, ..._data.map(r => r.id || 0)) + 1;
                const record = { id: nextId, ...data };
                _data.push(record);
                return [nextId];
            },
            async update(data: any) {
                const rows = applyFilters();
                for (const row of rows) {
                    const idx = _data.indexOf(row);
                    if (idx !== -1) _data[idx] = { ...row, ...data };
                }
                return rows.length;
            },
            async delete() {
                const rows = applyFilters();
                for (const row of rows) {
                    const idx = _data.indexOf(row);
                    if (idx !== -1) _data.splice(idx, 1);
                }
                return rows.length;
            },
            count() {
                return {
                    ...builder,
                    async first() {
                        return { count: applyFilters().length };
                    },
                } as any;
            },
            orderBy() { return builder; },
            limit(n: number) { _limit = n; return builder; },
            offset(n: number) { _offset = n; return builder; },
            join() { return builder; },
            clone() {
                const cloned = db(table);
                // Copy filters
                for (const w of _wheres) {
                    cloned.where(w.field, w.op, w.value);
                }
                return cloned;
            },
        };

        return builder;
    } as MockDatabase;

    db._tables = tables;
    (db as any).schema = {
        hasTable: async () => true,
        hasColumn: async () => true,
        createTable: async () => { },
        alterTable: async () => { },
    };
    (db as any).raw = async () => [{}];
    (db as any).fn = { now: () => new Date() };

    return db;
}

export async function createTestApp(opts: TestAppOptions = {}): Promise<{
    fastify: FastifyInstance;
    db: MockDatabase;
}> {
    const testUser = {
        userId: 1,
        username: 'testuser',
        tenantId: 1,
        permissions: ['*'],
        sessionId: 1,
        ...(opts.testUser || {}),
    };

    const db = createMockDB(opts.seedData);

    const fastify = Fastify({ logger: false });

    // Core Decorators mocken
    fastify.decorate('db', db);
    fastify.decorate('authenticate', async () => { });
    fastify.decorate('requirePermission', (_perm: string) => {
        return async (_request: FastifyRequest, _reply: FastifyReply) => { };
    });
    fastify.decorate('getTenantId', () => testUser.tenantId);
    fastify.decorate('requireTenantId', () => testUser.tenantId);
    fastify.decorate('isSuperAdmin', () => testUser.permissions.includes('*'));
    fastify.decorate('scopedQuery', <T>(query: T) => query);
    fastify.decorate('scopedInsert', (data: Record<string, any>) => ({
        ...data,
        tenant_id: testUser.tenantId,
    }));

    // Audit Mock
    const auditLogs: any[] = [];
    fastify.decorate('audit', {
        log: async (entry: any) => { auditLogs.push(entry); },
        getLogs: () => auditLogs,
    });
    fastify.decorate('auditChange', async (opts: any) => {
        auditLogs.push({ type: 'change', ...opts });
    });

    // EventBus Mock
    const eventHandlers: Record<string, Function[]> = {};
    fastify.decorate('events', {
        emit: async (opts: any) => {
            const handlers = eventHandlers[opts.event] || [];
            for (const h of handlers) await h(opts.data, opts);
        },
        on: (event: string, handler: Function) => {
            if (!eventHandlers[event]) eventHandlers[event] = [];
            eventHandlers[event].push(handler);
        },
    });

    // WebSocket Mock
    fastify.decorate('ws', {
        sendToUser: () => { },
        sendToTenant: () => { },
        broadcast: () => { },
        clientCount: () => 0,
    });

    // Storage Mock
    const storedFiles: Record<string, Buffer> = {};
    fastify.decorate('storage', {
        save: async (opts: any) => {
            const id = `test-${Date.now()}`;
            storedFiles[id] = opts.data;
            return { id, filename: opts.filename, size: opts.data.length };
        },
        get: async (id: string) => storedFiles[id] || null,
        getInfo: async () => null,
        list: async () => [],
        delete: async (id: string) => { delete storedFiles[id]; return true; },
    });

    // PDF Mock
    fastify.decorate('pdf', {
        generate: async () => Buffer.from('mock-pdf'),
        generateTable: async () => Buffer.from('mock-pdf'),
    });

    // Request-User injizieren
    fastify.addHook('onRequest', async (request) => {
        (request as any).user = testUser;
    });

    // Plugin laden falls Pfad angegeben
    if (opts.pluginPath) {
        try {
            const plugin = await import(opts.pluginPath);
            await fastify.register(plugin.default || plugin);
        } catch (err) {
            console.error('[TestApp] Plugin konnte nicht geladen werden:', err);
        }
    }

    await fastify.ready();

    return { fastify, db };
}
