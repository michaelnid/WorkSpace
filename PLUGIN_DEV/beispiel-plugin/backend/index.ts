import type { FastifyInstance } from 'fastify';
import routes from './routes.js';

export default async function examplePlugin(fastify: FastifyInstance): Promise<void> {
    await fastify.register(routes);
}
