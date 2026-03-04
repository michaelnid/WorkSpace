/**
 * Health-Check Endpoint
 * GET /api/health – Öffentlich (keine Authentifizierung)
 */

import { FastifyInstance } from 'fastify';
import { getDatabase } from '../core/database.js';
import { config } from '../core/config.js';
import fs from 'fs/promises';

const startedAt = Date.now();

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/health', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (_request, reply) => {
        const checks: Record<string, any> = {
            status: 'ok',
            version: config.app.version,
            uptime: Math.floor((Date.now() - startedAt) / 1000),
            timestamp: new Date().toISOString(),
        };

        // DB-Check
        try {
            const db = getDatabase();
            await db.raw('SELECT 1');
            checks.database = 'ok';
        } catch {
            checks.database = 'error';
            checks.status = 'degraded';
        }

        // Disk-Check (uploads)
        try {
            const stats = await fs.stat(config.app.uploadsDir);
            checks.uploads = stats.isDirectory() ? 'ok' : 'missing';
        } catch {
            checks.uploads = 'missing';
        }

        const statusCode = checks.status === 'ok' ? 200 : 503;
        return reply.status(statusCode).send(checks);
    });
}
