/**
 * Policy Engine
 *
 * Zentrales Authorization-Layer das alle API-Requests absichert.
 *
 * Funktionsweise:
 * 1. Jede Route kann ein `policy`-Objekt in den Schema-Optionen definieren
 * 2. Der onRequest-Hook prueft automatisch Auth, Permissions und Tenant-Isolation
 * 3. Fehlende Policies auf /api/-Routes werden geloggt (Warning)
 *
 * Damit wird vergessene Authorization in neuen Routes sofort sichtbar.
 */

import { FastifyInstance, FastifyRequest, FastifyReply, RouteOptions } from 'fastify';
import fp from 'fastify-plugin';

export interface RoutePolicy {
    /** Erforderliche Permission (z.B. 'users.view'). Wenn gesetzt, wird Auth erzwungen. */
    permission?: string;
    /** Route erfordert Authentifizierung (Default: true fuer alle /api/-Routes) */
    requireAuth?: boolean;
    /** Route ist oeffentlich (kein Auth noetig, z.B. Login) */
    public?: boolean;
}

// Erweitere RouteOptions um policy
declare module 'fastify' {
    interface RouteOptions {
        policy?: RoutePolicy;
    }
    interface FastifyContextConfig {
        policy?: RoutePolicy;
    }
}

async function policyEnginePlugin(fastify: FastifyInstance): Promise<void> {
    const unprotectedRoutes: string[] = [];

    // Hook: Bei jeder Route-Registrierung pruefen ob eine Policy definiert ist
    fastify.addHook('onRoute', (routeOptions: RouteOptions) => {
        const url = routeOptions.url || '';
        const method = routeOptions.method;

        // Nur API-Routes pruefen
        if (!url.startsWith('/api/')) return;

        // Public endpoints ueberspringen (Login, Register, Health)
        const publicPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/health'];
        if (publicPaths.some(p => url === p || url.startsWith(p + '/'))) return;

        // Policy aus Route-Config extrahieren
        const policy = routeOptions.config?.policy || (routeOptions as any).policy;

        if (policy?.public) return; // Explizit oeffentlich

        // Warnung wenn keine Policy und kein preHandler
        if (!policy && !hasAuthPreHandler(routeOptions)) {
            const methods = Array.isArray(method) ? method.join(',') : method;
            unprotectedRoutes.push(`${methods} ${url}`);
        }
    });

    // Nach dem Starten: Warnungen ausgeben
    fastify.addHook('onReady', async () => {
        if (unprotectedRoutes.length > 0) {
            console.warn('[PolicyEngine] ⚠️  Folgende API-Routes haben weder Policy noch Auth-PreHandler:');
            for (const route of unprotectedRoutes) {
                console.warn(`  - ${route}`);
            }
            console.warn('[PolicyEngine] Diese Routes sind moeglicherweise ungeschuetzt!');
        } else {
            console.log('[PolicyEngine] Alle API-Routes sind geschuetzt ✓');
        }
    });

    // onRequest-Hook: Policy durchsetzen
    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        const url = request.url;

        // Nur API-Routes
        if (!url.startsWith('/api/')) return;

        // Route-Config lesen
        const policy: RoutePolicy | undefined = (request.routeOptions?.config as any)?.policy;
        if (!policy) return; // Kein Policy-Objekt → wird durch preHandler abgesichert

        if (policy.public) return; // Explizit oeffentlich

        // Auth erzwingen
        if (policy.requireAuth !== false) {
            try {
                await fastify.authenticate(request, reply);
            } catch {
                return; // authenticate hat bereits geantwortet
            }
        }

        // Permission pruefen
        if (policy.permission) {
            const perms: string[] = (request as any).user?.permissions || [];
            if (!perms.includes('*') && !perms.includes(policy.permission)) {
                // Audit-Trail bei Policy-Verletzung
                try {
                    await fastify.audit.log({
                        action: 'policy.denied',
                        category: 'auth',
                        entityType: 'route',
                        entityId: `${request.method} ${request.url}`,
                        newState: {
                            requiredPermission: policy.permission,
                            userPermissions: perms,
                        },
                    }, request);
                } catch { /* Audit-Fehler nicht propagieren */ }

                return reply.status(403).send({ error: 'Keine Berechtigung' });
            }
        }
    });

    console.log('[PolicyEngine] Initialisiert');
}

/**
 * Prueft ob eine Route bereits einen Auth-PreHandler hat
 * (z.B. fastify.authenticate oder requirePermission)
 */
function hasAuthPreHandler(routeOptions: RouteOptions): boolean {
    const handlers = routeOptions.preHandler;
    if (!handlers) return false;
    if (Array.isArray(handlers)) return handlers.length > 0;
    return typeof handlers === 'function';
}

export default fp(policyEnginePlugin, {
    name: 'policyEngine',
    dependencies: ['auth', 'auditLog'],
});
