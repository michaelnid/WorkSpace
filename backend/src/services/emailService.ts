import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { getDatabase } from '../core/database.js';
import { encrypt, decrypt } from '../core/encryption.js';

interface SendMailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    template?: string;
    data?: Record<string, any>;
}

interface EmailApi {
    send: (opts: SendMailOptions) => Promise<void>;
    isConfigured: () => boolean;
}

interface EmailSettings {
    provider: 'none' | 'smtp' | 'm365';
    smtp_host?: string;
    smtp_port?: string;
    smtp_user?: string;
    smtp_password?: string;
    smtp_secure?: string;
    from_address?: string;
    from_name?: string;
}

async function getEmailSettings(): Promise<EmailSettings> {
    const db = getDatabase();
    const rows = await db('settings')
        .where('plugin_id', 'core.email')
        .select('key', 'value_encrypted');

    const settings: any = { provider: 'none' };
    for (const row of rows) {
        try {
            // Passwort ist verschluesselt
            if (row.key === 'smtp_password' && row.value_encrypted) {
                settings[row.key] = decrypt(row.value_encrypted);
            } else {
                settings[row.key] = row.value_encrypted;
            }
        } catch {
            settings[row.key] = row.value_encrypted;
        }
    }
    return settings;
}

async function emailPlugin(fastify: FastifyInstance): Promise<void> {
    const mail: EmailApi = {
        async send(opts: SendMailOptions): Promise<void> {
            const settings = await getEmailSettings();

            if (settings.provider === 'none') {
                throw new Error('E-Mail-Versand nicht konfiguriert. Bitte unter Administration > Einstellungen konfigurieren.');
            }

            if (settings.provider === 'smtp') {
                // SMTP-Versand (wird spaeter mit nodemailer implementiert)
                throw new Error('SMTP-Versand ist noch nicht implementiert. Kommt in einer zukuenftigen Version.');
            }

            if (settings.provider === 'm365') {
                // Microsoft 365 Connector (wird spaeter implementiert)
                throw new Error('Microsoft 365 E-Mail-Connector ist noch nicht implementiert.');
            }

            throw new Error(`Unbekannter E-Mail-Provider: ${settings.provider}`);
        },

        isConfigured(): boolean {
            // Synchrone Kurzpruefung - fuer UI-Anzeige
            return false; // Wird spaeter async geloest
        },
    };

    fastify.decorate('mail', mail);
    console.log('[E-Mail] Service initialisiert (Stub)');
}

// Admin-Routen fuer E-Mail-Einstellungen (ohne fp!)
export async function emailRoutes(fastify: FastifyInstance): Promise<void> {
    const db = getDatabase();

    const SETTINGS_KEYS = ['provider', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_secure', 'from_address', 'from_name'];

    // GET /api/admin/email/settings
    fastify.get('/email/settings', async (request, reply) => {
        const settings = await getEmailSettings();
        // Passwort maskieren
        if (settings.smtp_password) {
            settings.smtp_password = '••••••';
        }
        return reply.send(settings);
    });

    // PUT /api/admin/email/settings
    fastify.put('/email/settings', async (request, reply) => {
        const body = request.body as Record<string, any>;

        for (const key of SETTINGS_KEYS) {
            if (body[key] === undefined) continue;
            if (body[key] === '••••••') continue; // Maskiertes Passwort nicht ueberschreiben

            let value = String(body[key]);

            // Passwort verschluesseln
            if (key === 'smtp_password' && value) {
                value = encrypt(value);
            }

            const existing = await db('settings')
                .where({ key, plugin_id: 'core.email' })
                .first();

            if (existing) {
                await db('settings')
                    .where({ key, plugin_id: 'core.email' })
                    .update({ value_encrypted: value });
            } else {
                await db('settings').insert({
                    key,
                    value_encrypted: value,
                    category: 'email',
                    plugin_id: 'core.email',
                });
            }
        }

        await fastify.audit.log({
            action: 'email.settings.updated',
            category: 'admin',
            entityType: 'settings',
        }, request);

        return reply.send({ success: true });
    });

    // POST /api/admin/email/test
    fastify.post('/email/test', async (request, reply) => {
        const { to } = request.body as { to?: string };
        if (!to) {
            return reply.status(400).send({ error: 'Empfaenger-Adresse (to) ist erforderlich' });
        }

        try {
            await fastify.mail.send({
                to,
                subject: 'MIKE Test-E-Mail',
                text: 'Dies ist eine Test-E-Mail von MIKE WorkSpace.',
            });
            return reply.send({ success: true, message: 'Test-E-Mail gesendet' });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });
}

export default fp(emailPlugin, { name: 'emailService' });
