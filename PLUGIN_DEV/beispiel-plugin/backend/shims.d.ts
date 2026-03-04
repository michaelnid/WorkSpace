/**
 * Fallback-Typen fuer Standalone-Builds des Beispiel-Plugins.
 *
 * Wenn in einem frischen Plugin-Projekt noch keine eigenen node_modules
 * mit fastify/knex installiert sind, verhindert diese Datei TS2307-Fehler
 * bei der Kompilierung ueber build-plugin.sh.
 */

declare module 'fastify' {
    interface FastifyInstance {
        [key: string]: any;
    }
}

declare module 'knex' {
    interface Knex {
        [key: string]: any;
    }
}
