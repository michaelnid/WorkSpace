import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Fehlende Umgebungsvariable: ${key}`);
    }
    return value;
}

function optionalEnv(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
}

function optionalBoolEnv(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
    const pb = b.split('.').map((part) => parseInt(part, 10) || 0);
    const max = Math.max(pa.length, pb.length);
    for (let i = 0; i < max; i++) {
        const va = pa[i] || 0;
        const vb = pb[i] || 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
    }
    return 0;
}

function readBackendPackageVersion(): string | null {
    try {
        const packagePath = path.resolve(__dirname, '../../package.json');
        const raw = fs.readFileSync(packagePath, 'utf8');
        const parsed = JSON.parse(raw);
        const version = typeof parsed?.version === 'string' ? parsed.version.trim() : '';
        return version || null;
    } catch {
        return null;
    }
}

function resolveAppVersion(defaultVersion: string): string {
    const envVersion = (process.env.APP_VERSION || '').trim();
    const packageVersion = readBackendPackageVersion();

    if (envVersion && packageVersion) {
        return compareVersions(packageVersion, envVersion) >= 0 ? packageVersion : envVersion;
    }
    if (packageVersion) return packageVersion;
    if (envVersion) return envVersion;
    return defaultVersion;
}

export const config = {
    db: {
        host: requireEnv('DB_HOST'),
        port: parseInt(optionalEnv('DB_PORT', '3306'), 10),
        name: requireEnv('DB_NAME'),
        user: requireEnv('DB_USER'),
        password: requireEnv('DB_PASSWORD'),
    },

    encryption: {
        key: requireEnv('ENCRYPTION_KEY'),
    },

    jwt: {
        secret: requireEnv('JWT_SECRET'),
        accessExpiry: optionalEnv('JWT_ACCESS_EXPIRY', '15m'),
        refreshExpiry: optionalEnv('JWT_REFRESH_EXPIRY', '7d'),
        cookieSecure: optionalEnv('COOKIE_SECURE', 'auto'),
    },

    server: {
        port: parseInt(optionalEnv('PORT', '3000'), 10),
        env: optionalEnv('NODE_ENV', 'production'),
    },

    update: {
        url: optionalEnv('UPDATE_URL', 'https://api.github.com/repos/michaelnid/WorkSpace'),
        requireHash: optionalBoolEnv('UPDATE_REQUIRE_HASH', true),
        backupDir: optionalEnv('UPDATE_BACKUP_DIR', ''),
        maxBackups: { main: 5, dev: 5, experimental: 10 } as Record<string, number>,
    },

    backup: {
        encryptionKey: optionalEnv('BACKUP_ENCRYPTION_KEY', ''),
    },

    documents: {
        storageProvider: optionalEnv('DOCUMENT_STORAGE_PROVIDER', 'local'),
        maxFileSizeMb: parseInt(optionalEnv('DOCUMENT_MAX_FILE_SIZE_MB', '25'), 10),
        allowAllMimeTypes: optionalBoolEnv('DOCUMENT_ALLOW_ALL_MIME_TYPES', false),
    },

    app: {
        version: resolveAppVersion('1.19.1'),
        // App-Root: eine Ebene oberhalb von backend/ (funktioniert in src und dist)
        rootDir: path.resolve(__dirname, '../../..'),
        pluginsDir: path.resolve(__dirname, '../../../plugins'),
        uploadsDir: path.resolve(__dirname, '../../../uploads'),
    },
} as const;

export function generateRandomKey(bytes: number = 32): string {
    return randomBytes(bytes).toString('hex');
}
