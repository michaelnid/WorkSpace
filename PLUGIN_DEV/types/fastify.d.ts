/**
 * MIKE WorkSpace – Backend Type Definitions
 *
 * Kopiere diese Datei in dein Plugin-Projekt fuer TypeScript-Autocompletion.
 * Diese Typen beschreiben die Fastify-Instanz mit allen Core-Decorators.
 */

import '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';

type AuditCategory = 'auth' | 'data' | 'admin' | 'plugin';

interface CrudOptions {
    table: string;
    prefix: string;
    permission: string;
    pluginId: string;
    schema: import('zod').ZodSchema<any>;
    searchFields?: string[];
    defaultSort?: { column: string; order: 'asc' | 'desc' };
    selectFields?: string[];
    maxPageSize?: number;
    beforeCreate?: (data: Record<string, any>, request: FastifyRequest) => Record<string, any> | Promise<Record<string, any>>;
    beforeUpdate?: (data: Record<string, any>, request: FastifyRequest) => Record<string, any> | Promise<Record<string, any>>;
    afterCreate?: (id: number, data: Record<string, any>, request: FastifyRequest) => void | Promise<void>;
    afterDelete?: (id: number, request: FastifyRequest) => void | Promise<void>;
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: {
            userId: number;
            username: string;
            permissions: string[];
            tenantId: number;
            tenantIds: number[];
            sessionId: number;
        };
        user: {
            userId: number;
            username: string;
            permissions: string[];
            tenantId: number;
            tenantIds: number[];
            sessionId: number;
        };
    }
}

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        db: import('knex').Knex;

        audit: {
            log: (entry: {
                action: string;
                category: AuditCategory;
                entityType?: string;
                entityId?: string | number;
                previousState?: any;
                newState?: any;
                pluginId?: string;
                tenantId?: number | null;
            }, request?: FastifyRequest) => Promise<void>;
            withAudit: (
                tableName: string,
                entityId: string | number,
                action: string,
                category: Exclude<AuditCategory, 'auth'>,
                operation: () => Promise<void>,
                userId: number | null,
                request?: FastifyRequest,
                pluginId?: string
            ) => Promise<void>;
        };

        auditChange: (opts: {
            table: string;
            id: string | number;
            action: string;
            category: AuditCategory;
            changes: Record<string, any>;
            request: FastifyRequest;
            pluginId?: string;
            entityType?: string;
        }) => Promise<void>;

        requirePermission: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        getTenantId: (request: FastifyRequest) => number | null;
        scopedQuery: <T extends import('knex').Knex.QueryBuilder>(query: T, request: FastifyRequest, column?: string) => T;
        scopedInsert: (data: Record<string, any>, request: FastifyRequest, column?: string) => Record<string, any>;
        requireTenantId: (request: FastifyRequest) => number;
        isSuperAdmin: (request: FastifyRequest) => boolean;

        encrypt: (plainText: string) => string;
        decrypt: (encryptedPayload: string) => string;

        validation: {
            z: typeof import('zod').z;
            validateBody: <T>(schema: import('zod').ZodSchema<T>) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
            validateQuery: <T>(schema: import('zod').ZodSchema<T>) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
            validateParams: <T>(schema: import('zod').ZodSchema<T>) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        };

        createCrudRoutes: (opts: CrudOptions) => void;

        events: {
            emit: (opts: {
                event: string;
                data?: Record<string, any>;
                userId?: number | null;
                tenantId?: number | null;
                pluginId?: string;
                request?: FastifyRequest;
            }) => Promise<void>;
            on: (event: string, handler: (data: any, meta: any) => Promise<void> | void) => void;
            off: (event: string, handler: (data: any, meta: any) => Promise<void> | void) => void;
            listenerCount: (event?: string) => number;
        };

        notify: {
            send: (userId: number, payload: {
                title: string;
                message?: string;
                link?: string;
                type?: 'info' | 'success' | 'warning' | 'error';
                pluginId?: string;
                tenantId?: number | null;
            }) => Promise<number>;
            sendToMany: (userIds: number[], payload: {
                title: string;
                message?: string;
                link?: string;
                type?: 'info' | 'success' | 'warning' | 'error';
                pluginId?: string;
                tenantId?: number | null;
            }) => Promise<void>;
        };

        scheduler: {
            register: (opts: {
                id: string;
                name: string;
                cron: string;
                handler: () => Promise<void> | void;
                pluginId?: string;
            }) => Promise<void>;
            unregister: (taskId: string) => Promise<void>;
            stopAll: () => void;
        };

        mail: {
            send: (opts: {
                to: string | string[];
                subject: string;
                text?: string;
                html?: string;
                template?: string;
                data?: Record<string, any>;
            }) => Promise<void>;
            isConfigured: () => boolean;
        };

        ws: {
            sendToUser: (userId: number, message: { type: string; data: any }) => void;
            sendToTenant: (tenantId: number, message: { type: string; data: any }) => void;
            broadcast: (message: { type: string; data: any }) => void;
            clientCount: () => number;
        };

        storage: {
            save: (opts: {
                pluginId: string;
                filename: string;
                data: Buffer;
                request: FastifyRequest;
                metadata?: Record<string, any>;
            }) => Promise<{
                id: string;
                pluginId: string;
                tenantId: number;
                filename: string;
                path: string;
                size: number;
                createdAt: Date;
                metadata?: Record<string, any>;
            }>;
            get: (fileId: string) => Promise<Buffer | null>;
            getInfo: (fileId: string) => Promise<{
                id: string;
                pluginId: string;
                tenantId: number;
                filename: string;
                path: string;
                size: number;
                createdAt: Date;
                metadata?: Record<string, any>;
            } | null>;
            list: (pluginId: string, request: FastifyRequest) => Promise<Array<{
                id: string;
                pluginId: string;
                tenantId: number;
                filename: string;
                path: string;
                size: number;
                createdAt: Date;
                metadata?: Record<string, any>;
            }>>;
            delete: (fileId: string) => Promise<boolean>;
        };

        pdf: {
            generate: (opts: {
                title?: string;
                content: any[];
                footer?: string;
                pageSize?: 'A4' | 'A3' | 'LETTER';
                pageOrientation?: 'portrait' | 'landscape';
                styles?: Record<string, any>;
            }) => Promise<Buffer>;
            generateTable: (opts: {
                title: string;
                headers: string[];
                rows: string[][];
                footer?: string;
            }) => Promise<Buffer>;
        };
    }
}
