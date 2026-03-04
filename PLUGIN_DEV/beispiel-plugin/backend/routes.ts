import type { FastifyInstance } from 'fastify';

interface NotePayload {
    title?: string;
    content?: string;
}

interface NoteParams {
    id: string;
}

function parseNoteId(id: string): number | null {
    const parsed = Number.parseInt(id, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

export default async function routes(fastify: FastifyInstance): Promise<void> {
    // Auth für alle Routen
    fastify.addHook('preHandler', fastify.authenticate);

    // GET /api/plugins/example/notes
    fastify.get('/notes', {
        preHandler: [fastify.requirePermission('example.view')],
    }, async (request, reply) => {
        const notes = await fastify.scopedQuery(fastify.db('example_notes'), request)
            .select('id', 'title', 'content', 'created_at')
            .orderBy('created_at', 'desc');
        return reply.send(notes);
    });

    // POST /api/plugins/example/notes
    fastify.post('/notes', {
        preHandler: [fastify.requirePermission('example.create')],
    }, async (request, reply) => {
        const { title, content } = request.body as NotePayload;
        const normalizedTitle = title?.trim();

        if (!normalizedTitle) {
            return reply.status(400).send({ error: 'Titel ist erforderlich' });
        }

        const [id] = await fastify.db('example_notes').insert(fastify.scopedInsert({
            title: normalizedTitle,
            content: content?.trim() || '',
            created_by: request.user.userId,
            created_at: new Date(),
        }, request));

        const current = await fastify.scopedQuery(fastify.db('example_notes'), request)
            .where({ id })
            .first();

        await fastify.audit.log({
            action: 'example.note.created',
            category: 'plugin',
            entityType: 'example_notes',
            entityId: id,
            newState: current,
            pluginId: 'example',
        }, request);

        return reply.status(201).send(current);
    });

    // PUT /api/plugins/example/notes/:id
    fastify.put('/notes/:id', {
        preHandler: [fastify.requirePermission('example.edit')],
    }, async (request, reply) => {
        const { id } = request.params as NoteParams;
        const { title, content } = request.body as NotePayload;
        const noteId = parseNoteId(id);

        if (!noteId) {
            return reply.status(400).send({ error: 'Ungültige Notiz-ID' });
        }

        const previous = await fastify.scopedQuery(fastify.db('example_notes'), request).where({ id: noteId }).first();
        if (!previous) return reply.status(404).send({ error: 'Notiz nicht gefunden' });

        const updates: Record<string, string> = {};

        if (title !== undefined) {
            const normalizedTitle = title.trim();
            if (!normalizedTitle) {
                return reply.status(400).send({ error: 'Titel darf nicht leer sein' });
            }
            updates.title = normalizedTitle;
        }
        if (content !== undefined) {
            updates.content = content.trim();
        }

        if (Object.keys(updates).length === 0) {
            return reply.status(400).send({ error: 'Keine Änderungen übergeben' });
        }

        await fastify.scopedQuery(fastify.db('example_notes'), request).where({ id: noteId }).update(updates);
        const current = await fastify.scopedQuery(fastify.db('example_notes'), request).where({ id: noteId }).first();

        await fastify.audit.log({
            action: 'example.note.updated',
            category: 'plugin',
            entityType: 'example_notes',
            entityId: noteId,
            previousState: previous,
            newState: current,
            pluginId: 'example',
        }, request);

        return reply.send(current);
    });

    // DELETE /api/plugins/example/notes/:id
    fastify.delete('/notes/:id', {
        preHandler: [fastify.requirePermission('example.delete')],
    }, async (request, reply) => {
        const { id } = request.params as NoteParams;
        const noteId = parseNoteId(id);

        if (!noteId) {
            return reply.status(400).send({ error: 'Ungültige Notiz-ID' });
        }

        const note = await fastify.scopedQuery(fastify.db('example_notes'), request).where({ id: noteId }).first();
        if (!note) return reply.status(404).send({ error: 'Notiz nicht gefunden' });

        await fastify.scopedQuery(fastify.db('example_notes'), request).where({ id: noteId }).delete();

        await fastify.audit.log({
            action: 'example.note.deleted',
            category: 'plugin',
            entityType: 'example_notes',
            entityId: noteId,
            previousState: note,
            pluginId: 'example',
        }, request);

        return reply.send({ success: true });
    });
}
