import { config } from '../core/config.js';
import { getDatabase } from '../core/database.js';
import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import http from 'http';
import https from 'https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'zlib';
import type { FastifyInstance } from 'fastify';

const execFileAsync = promisify(execFile);

// =============================================
// TYPES
// =============================================

export type UpdateBranch = 'main' | 'dev' | 'experimental';

interface VersionInfo {
    version: string;
    changelog: string;
    released_at: string;
    artifact_url?: string;
    name?: string;
    description?: string;
    author?: string;
    dependencies?: string[];
    tar_sha256?: string;
}

interface GitHubRelease {
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    prerelease: boolean;
    assets: GitHubAsset[];
}

interface GitHubAsset {
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
}

interface GitHubCommit {
    sha: string;
    commit: {
        message: string;
        author: {
            name: string;
            date: string;
        };
    };
}

interface CatalogEntry {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    dependencies: string[];
}

export interface InstalledPluginInfo {
    pluginId: string;
    name: string;
    version: string;
    isActive: boolean;
    installedAt: string | null;
}

export interface UpdateProgressEvent {
    message: string;
    progress?: number;
}

interface UpdateInstallOptions {
    onProgress?: (event: UpdateProgressEvent) => void;
    fastify?: FastifyInstance;
}

interface PluginManifest {
    backend_entry?: string;
}

interface PluginLifecycleHooks {
    onUninstall?: (fastify: FastifyInstance, db: any) => Promise<void> | void;
}

export interface UpdateCheckResult {
    branch: UpdateBranch;
    available: boolean;
    current: {
        version: string;
        commitHash?: string;
    };
    remote?: {
        version?: string;
        commitHash?: string;
        commitMessages?: { message: string; hash: string; date: string }[];
        changelog?: string;
        releaseName?: string;
        publishedAt?: string;
    };
    updateCommand: string;
}

export interface BackupEntry {
    fileName: string;
    branch: string;
    sizeBytes: number;
    createdAt: string;
    restoreCommand: string;
}

// =============================================
// GITHUB API HELPERS
// =============================================

function getGitHubApiUrl(): string {
    return config.update.url.replace(/\/+$/, '');
}

function parseGitHubVersion(tagName: string): string {
    return tagName.replace(/^v/i, '');
}

async function fetchGitHubJson<T>(endpoint: string): Promise<T | null> {
    const url = `${getGitHubApiUrl()}/${endpoint}`;
    try {
        const res = await fetch(url, {
            headers: {
                accept: 'application/vnd.github+json',
                'user-agent': 'MIKE-WorkSpace-Updater/2.0',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (!res.ok) {
            console.error(`[Updater] GitHub API ${res.status} für ${url}`);
            return null;
        }
        return await res.json() as T;
    } catch (err) {
        console.error(`[Updater] GitHub API Fehler für ${url}:`, err);
        return null;
    }
}

// =============================================
// GIT LOCAL HELPERS
// =============================================

async function getLocalCommitHash(): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: config.app.rootDir });
        return stdout.trim() || null;
    } catch {
        return null;
    }
}

async function getLocalBranch(): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: config.app.rootDir });
        return stdout.trim() || null;
    } catch {
        return null;
    }
}

// =============================================
// BRANCH SETTING (DB)
// =============================================

export async function getUpdateBranch(): Promise<UpdateBranch> {
    try {
        const db = getDatabase();
        const setting = await db('settings')
            .where({ key: 'update.branch' })
            .whereNull('tenant_id')
            .first();
        if (!setting?.value_encrypted) return 'main';
        // Branch ist unverschluesselt gespeichert (kein Geheimnis)
        const raw = String(setting.value_encrypted).trim();
        if (['main', 'dev', 'experimental'].includes(raw)) {
            return raw as UpdateBranch;
        }
        // Fallback: Versuche entschluesselten Wert
        try {
            const { decrypt } = await import('../core/encryption.js');
            const decrypted = decrypt(raw).trim();
            if (['main', 'dev', 'experimental'].includes(decrypted)) {
                return decrypted as UpdateBranch;
            }
        } catch {
            // Kein verschluesselter Wert
        }
        return 'main';
    } catch {
        return 'main';
    }
}

export async function setUpdateBranch(branch: UpdateBranch): Promise<void> {
    const db = getDatabase();
    // Branch ist kein Geheimnis — unverschlüsselt speichern
    const existing = await db('settings')
        .where({ key: 'update.branch' })
        .whereNull('tenant_id')
        .first();
    if (existing) {
        await db('settings').where({ id: existing.id }).update({
            value_encrypted: branch,
            category: 'system',
        });
    } else {
        await db('settings').insert({
            key: 'update.branch',
            value_encrypted: branch,
            category: 'system',
            tenant_id: null,
        });
    }
}

// =============================================
// UPDATE CHECK INTERVAL (DB)
// =============================================

export async function getUpdateCheckInterval(): Promise<number> {
    try {
        const db = getDatabase();
        const setting = await db('settings')
            .where({ key: 'update.check_interval_seconds' })
            .whereNull('tenant_id')
            .first();
        if (!setting?.value_encrypted) return 7200; // Default: 2 Stunden
        try {
            const { decrypt } = await import('../core/encryption.js');
            const decrypted = decrypt(String(setting.value_encrypted)).trim();
            const parsed = parseInt(decrypted, 10);
            return Number.isFinite(parsed) && parsed >= 3600 ? parsed : 7200;
        } catch {
            const parsed = parseInt(String(setting.value_encrypted).trim(), 10);
            return Number.isFinite(parsed) && parsed >= 3600 ? parsed : 7200;
        }
    } catch {
        return 7200;
    }
}

export async function setUpdateCheckInterval(seconds: number): Promise<void> {
    const db = getDatabase();
    // Intervall ist kein Geheimnis — unverschlüsselt speichern
    const value = Math.max(3600, Math.round(seconds));
    const existing = await db('settings')
        .where({ key: 'update.check_interval_seconds' })
        .whereNull('tenant_id')
        .first();
    if (existing) {
        await db('settings').where({ id: existing.id }).update({
            value_encrypted: String(value),
            category: 'system',
        });
    } else {
        await db('settings').insert({
            key: 'update.check_interval_seconds',
            value_encrypted: String(value),
            category: 'system',
            tenant_id: null,
        });
    }
}

// =============================================
// CORE UPDATE CHECK (Multi-Branch)
// =============================================

export async function checkCoreUpdate(branch?: UpdateBranch): Promise<UpdateCheckResult> {
    const activeBranch = branch || await getUpdateBranch();
    const currentVersion = config.app.version;
    const localCommitHash = await getLocalCommitHash();

    const current = {
        version: currentVersion,
        commitHash: localCommitHash || undefined,
    };

    const updateCommand = generateUpdateCommand(activeBranch);

    if (activeBranch === 'experimental') {
        return checkExperimentalUpdate(current, updateCommand);
    }

    // main oder dev: Release-basiert
    if (activeBranch === 'dev') {
        return checkDevUpdate(current, updateCommand);
    }

    return checkMainUpdate(current, updateCommand);
}

async function checkMainUpdate(
    current: { version: string; commitHash?: string },
    updateCommand: string,
): Promise<UpdateCheckResult> {
    const release = await fetchGitHubJson<GitHubRelease>('releases/latest');
    if (!release) {
        return { branch: 'main', available: false, current, updateCommand };
    }

    const remoteVersion = parseGitHubVersion(release.tag_name);
    const available = compareVersions(remoteVersion, current.version) > 0;

    return {
        branch: 'main',
        available,
        current,
        remote: {
            version: remoteVersion,
            changelog: release.body || '',
            releaseName: release.name || '',
            publishedAt: release.published_at || '',
        },
        updateCommand,
    };
}

async function checkDevUpdate(
    current: { version: string; commitHash?: string },
    updateCommand: string,
): Promise<UpdateCheckResult> {
    // Alle Releases holen, nach Pre-Releases filtern
    const releases = await fetchGitHubJson<GitHubRelease[]>('releases?per_page=20');
    if (!releases || releases.length === 0) {
        return { branch: 'dev', available: false, current, updateCommand };
    }

    // Neuestes Pre-Release finden
    const preRelease = releases.find((r) => r.prerelease === true);
    if (!preRelease) {
        return { branch: 'dev', available: false, current, updateCommand };
    }

    const remoteVersion = parseGitHubVersion(preRelease.tag_name);
    const available = compareVersions(remoteVersion, current.version) > 0;

    return {
        branch: 'dev',
        available,
        current,
        remote: {
            version: remoteVersion,
            changelog: preRelease.body || '',
            releaseName: preRelease.name || '',
            publishedAt: preRelease.published_at || '',
        },
        updateCommand,
    };
}

async function checkExperimentalUpdate(
    current: { version: string; commitHash?: string },
    updateCommand: string,
): Promise<UpdateCheckResult> {
    // Letzte 10 Commits vom experimental-Branch holen
    const commits = await fetchGitHubJson<GitHubCommit[]>('commits?sha=experimental&per_page=10');
    if (!commits || commits.length === 0) {
        return { branch: 'experimental', available: false, current, updateCommand };
    }

    const latestCommit = commits[0];
    const available = Boolean(current.commitHash && latestCommit.sha !== current.commitHash);

    const commitMessages = commits.map((c) => ({
        message: c.commit.message.split('\n')[0] || '', // Nur erste Zeile
        hash: c.sha.slice(0, 8),
        date: c.commit.author.date || '',
    }));

    return {
        branch: 'experimental',
        available,
        current,
        remote: {
            commitHash: latestCommit.sha,
            commitMessages,
            publishedAt: latestCommit.commit.author.date || '',
        },
        updateCommand,
    };
}

// =============================================
// CHANGELOG HISTORY
// =============================================

export async function getChangelogHistory(branch?: UpdateBranch): Promise<{
    releases?: { version: string; name: string; body: string; publishedAt: string; prerelease: boolean }[];
    commits?: { message: string; hash: string; date: string }[];
}> {
    const activeBranch = branch || await getUpdateBranch();

    if (activeBranch === 'experimental') {
        const commits = await fetchGitHubJson<GitHubCommit[]>('commits?sha=experimental&per_page=30');
        if (!commits) return { commits: [] };
        return {
            commits: commits.map((c) => ({
                message: c.commit.message.split('\n')[0] || '',
                hash: c.sha.slice(0, 8),
                date: c.commit.author.date || '',
            })),
        };
    }

    const releases = await fetchGitHubJson<GitHubRelease[]>('releases?per_page=15');
    if (!releases) return { releases: [] };

    const filtered = activeBranch === 'dev'
        ? releases.filter((r) => r.prerelease)
        : releases.filter((r) => !r.prerelease);

    return {
        releases: filtered.map((r) => ({
            version: parseGitHubVersion(r.tag_name),
            name: r.name || '',
            body: r.body || '',
            publishedAt: r.published_at || '',
            prerelease: r.prerelease,
        })),
    };
}

// =============================================
// UPDATE COMMAND GENERATION
// =============================================

function generateUpdateCommand(branch: UpdateBranch): string {
    return `sudo bash /opt/mike-workspace/update.sh --branch ${branch}`;
}

// =============================================
// BACKUP LIST
// =============================================

export async function getBackupsList(branch?: UpdateBranch): Promise<BackupEntry[]> {
    const entries: BackupEntry[] = [];
    const branches: UpdateBranch[] = branch ? [branch] : ['main', 'dev', 'experimental'];
    const backupBase = config.update.backupDir || path.join(config.app.rootDir, 'backups', 'pre-update');
    console.log(`[Updater] getBackupsList: backupBase=${backupBase}, rootDir=${config.app.rootDir}`);
    for (const b of branches) {
        const branchDir = path.join(backupBase, b);
        try {
            const files = await fs.readdir(branchDir);
            for (const fileName of files) {
                if (!fileName.endsWith('.zip')) continue;
                const filePath = path.join(branchDir, fileName);
                try {
                    const stat = await fs.stat(filePath);
                    entries.push({
                        fileName,
                        branch: b,
                        sizeBytes: stat.size,
                        createdAt: stat.birthtime.toISOString(),
                        restoreCommand: `sudo bash /opt/mike-workspace/restore.sh ${filePath}`,
                    });
                } catch {
                    // Datei nicht lesbar
                }
            }
        } catch (err) {
            console.log(`[Updater] Backup-Verzeichnis nicht lesbar: ${branchDir}`, err);
        }
    }

    // Neueste zuerst sortieren
    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return entries;
}

// =============================================
// PLUGIN UPDATES
// =============================================

export async function checkPluginUpdates(): Promise<{ pluginId: string; current: string; remote: VersionInfo; available: boolean }[]> {
    const db = getDatabase();
    const installedPlugins = await db('plugins').select('*');
    const results = [];

    for (const plugin of installedPlugins) {
        const remote = await fetchPluginVersionInfo(`${plugin.plugin_id}/version.json`);
        if (!remote) continue;

        const available = compareVersions(remote.version, plugin.version) > 0;
        results.push({
            pluginId: plugin.plugin_id,
            current: plugin.version,
            remote,
            available,
        });
    }

    return results;
}

export async function getInstalledPlugins(): Promise<InstalledPluginInfo[]> {
    const db = getDatabase();
    const rows = await db('plugins')
        .select('plugin_id', 'name', 'version', 'is_active', 'installed_at')
        .orderBy('name', 'asc')
        .orderBy('plugin_id', 'asc');

    return rows.map((row: any) => ({
        pluginId: String(row.plugin_id),
        name: String(row.name || row.plugin_id),
        version: String(row.version || '0.0.0'),
        isActive: Boolean(row.is_active),
        installedAt: row.installed_at ? new Date(row.installed_at).toISOString() : null,
    }));
}

export async function installPlugin(pluginId: string, options?: UpdateInstallOptions): Promise<{ success: boolean; version?: string; error?: string }> {
    const progress = (message: string, value?: number): void => {
        options?.onProgress?.({ message, progress: value });
    };

    try {
        // Plugin-ID Validierung: Nur alphanumerisch, Bindestrich, Unterstrich erlaubt
        if (!pluginId || /[^a-zA-Z0-9\-_]/.test(pluginId) || pluginId.includes('..')) {
            throw new Error(`Ungueltige Plugin-ID: '${pluginId}'`);
        }

        progress(`Pruefe Metadaten fuer Plugin ${pluginId}`, 5);
        const requestToken = createUpdateRequestToken();
        const versionInfo = await fetchPluginVersionInfo(`${pluginId}/version.json`, requestToken);
        if (!versionInfo) {
            throw new Error(`Version fuer Plugin '${pluginId}' nicht gefunden`);
        }

        progress(`Lade Plugin ${pluginId} v${versionInfo.version}`, 20);
        const tmpDir = path.join(config.app.rootDir, 'tmp');
        await fs.mkdir(tmpDir, { recursive: true });
        const tarPath = path.join(tmpDir, `plugin-${pluginId}.tar.gz`);

        const artifactUrl = versionInfo.artifact_url || resolvePluginUrl(`${pluginId}/latest.tar.gz`);
        const archiveBuffer = await downloadRawBinary(artifactUrl);
        if (!isTarGzipBuffer(archiveBuffer)) {
            throw new Error(`Artefakt ist kein gueltiges .tar.gz (Plugin: ${pluginId})`);
        }

        progress('Pruefe Plugin-Integritaet', 45);
        verifyDownloadedArtifact({
            artifactName: `plugin-${pluginId}`,
            archiveBuffer,
            expectedHash: versionInfo.tar_sha256,
        });

        progress('Schreibe Plugin-Datei', 55);
        await writeBufferToFile(archiveBuffer, tarPath);

        // Plugin-Verzeichnis erstellen
        progress('Bereite Plugin-Verzeichnis vor', 60);
        const pluginDir = path.join(config.app.pluginsDir, pluginId);
        await fs.mkdir(pluginDir, { recursive: true });

        // Entpacken
        progress('Entpacke Plugin-Dateien', 70);
        await execFileAsync('tar', ['-xzf', tarPath, '-C', pluginDir]);

        // plugin.json lesen
        progress('Lese Plugin-Metadaten', 75);
        const manifestPath = path.join(pluginDir, 'plugin.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

        // In DB registrieren
        progress('Aktualisiere Plugin in der Datenbank', 85);
        const db = getDatabase();
        const existing = await db('plugins').where('plugin_id', pluginId).first();
        if (existing) {
            await db('plugins').where('plugin_id', pluginId).update({
                version: manifest.version,
                name: manifest.name,
            });
        } else {
            await db('plugins').insert({
                plugin_id: pluginId,
                name: manifest.name,
                version: manifest.version,
                is_active: true,
                installed_at: new Date(),
            });
        }

        // Plugin-Migrationen ausfuehren
        const migrationsDir = path.join(pluginDir, 'backend', 'migrations');
        if (fss.existsSync(migrationsDir)) {
            progress('Fuehre Plugin-Migrationen aus', 90);
            await db.migrate.latest({
                directory: migrationsDir,
                tableName: `knex_migrations_${pluginId}`,
                loadExtensions: ['.js'],
            });
        }

        // Aufraumen
        progress('Raeume temporaere Dateien auf', 95);
        await fs.rm(tmpDir, { recursive: true, force: true });

        // Neustart anfordern
        progress('Plugin-Update abgeschlossen, Server startet neu', 100);
        setTimeout(() => process.exit(0), 1000);

        return { success: true, version: manifest.version || versionInfo.version };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updatePlugin(pluginId: string, options?: UpdateInstallOptions): Promise<{ success: boolean; version?: string; error?: string }> {
    // Update ist identisch zu install (ueberschreibt bestehende Dateien)
    return installPlugin(pluginId, options);
}

export async function removePlugin(pluginId: string, options?: UpdateInstallOptions): Promise<{ success: boolean; error?: string }> {
    const progress = (message: string, value?: number): void => {
        options?.onProgress?.({ message, progress: value });
    };

    try {
        const normalizedPluginId = normalizePluginId(pluginId);
        progress(`Pruefe Plugin ${normalizedPluginId}`, 5);

        const db = getDatabase();
        const existing = await db('plugins').where('plugin_id', normalizedPluginId).first();
        if (!existing) {
            return { success: false, error: `Plugin '${normalizedPluginId}' ist nicht installiert` };
        }
        const pluginDir = resolvePluginDirectory(normalizedPluginId);

        progress('Pruefe Plugin-Lifecycle-Hooks', 12);
        if (options?.fastify) {
            const hooks = await loadPluginLifecycleHooksForRemoval(normalizedPluginId, pluginDir);
            if (hooks.onUninstall) {
                progress('Fuehre onUninstall-Hook aus', 17);
                try {
                    await hooks.onUninstall(options.fastify, db);
                } catch (err) {
                    console.error(`[Updater] onUninstall-Fehler fuer Plugin '${normalizedPluginId}':`, err);
                }
            }
        }

        progress('Entferne Plugin-Permissions und Zuweisungen', 20);
        await db('permissions').where('plugin_id', normalizedPluginId).delete();

        progress('Entferne plugin-spezifische Einstellungen', 35);
        await db('settings').where('plugin_id', normalizedPluginId).delete();

        progress('Entferne Plugin aus Installationsliste', 50);
        await db('plugins').where('plugin_id', normalizedPluginId).delete();

        progress('Bereinige Migrations-Tracking', 65);
        const migrationTable = `knex_migrations_${normalizedPluginId}`;
        const migrationLockTable = `${migrationTable}_lock`;
        await db.schema.dropTableIfExists(migrationLockTable);
        await db.schema.dropTableIfExists(migrationTable);

        progress('Entferne Plugin-Dateien', 80);
        await fs.rm(pluginDir, { recursive: true, force: true });

        progress('Plugin entfernt, Server startet neu', 100);
        setTimeout(() => process.exit(0), 1000);

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// =============================================
// PLUGIN-LISTE (ORDNERBASIERT)
// =============================================

export async function getRemoteCatalog(): Promise<CatalogEntry[]> {
    const fromIndex = await fetchCatalogFromIndexFile();
    if (fromIndex.length > 0) return fromIndex;
    return discoverCatalogFromDirectoryListing();
}

// =============================================
// VERSION VERGLEICH
// =============================================

function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);

    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const va = pa[i] || 0;
        const vb = pb[i] || 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
    }
    return 0;
}

function normalizePluginId(pluginId: string): string {
    const normalized = String(pluginId || '').trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
        throw new Error('Ungueltige Plugin-ID');
    }
    return normalized;
}

function resolvePluginDirectory(pluginId: string): string {
    const pluginRoot = path.resolve(config.app.pluginsDir);
    const target = path.resolve(pluginRoot, pluginId);
    const rootWithSep = pluginRoot.endsWith(path.sep) ? pluginRoot : `${pluginRoot}${path.sep}`;
    if (!target.startsWith(rootWithSep)) {
        throw new Error('Ungueltiger Plugin-Pfad');
    }
    return target;
}

async function resolvePluginBackendImportPath(pluginDir: string, backendEntry: string): Promise<string> {
    const normalizedPluginDir = path.resolve(pluginDir);
    const entryPath = path.join(normalizedPluginDir, backendEntry);
    const resolvedEntry = path.resolve(normalizedPluginDir, backendEntry);
    if (!resolvedEntry.startsWith(`${normalizedPluginDir}${path.sep}`) && resolvedEntry !== normalizedPluginDir) {
        throw new Error('Backend-Entry liegt ausserhalb des Plugin-Verzeichnisses');
    }

    const ext = path.extname(backendEntry);
    const candidates: string[] = [];
    if (ext === '.ts' || ext === '.tsx') {
        candidates.push(entryPath.replace(/\.(ts|tsx)$/i, '.js'));
    }
    if (!ext) {
        candidates.push(`${entryPath}.js`, `${entryPath}.mjs`, `${entryPath}.cjs`, `${entryPath}.ts`);
    }
    candidates.push(entryPath);

    for (const candidate of [...new Set(candidates)]) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            // pruefe naechsten Kandidaten
        }
    }

    throw new Error(`Backend-Entry nicht gefunden (${backendEntry})`);
}

async function loadPluginLifecycleHooksForRemoval(pluginId: string, pluginDir: string): Promise<PluginLifecycleHooks> {
    const manifestPath = path.join(pluginDir, 'plugin.json');

    try {
        const rawManifest = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(rawManifest) as PluginManifest;
        const backendEntry = typeof manifest.backend_entry === 'string' ? manifest.backend_entry.trim() : '';
        if (!backendEntry) return {};

        const importPath = await resolvePluginBackendImportPath(pluginDir, backendEntry);
        const pluginModule = await import(pathToFileURL(importPath).href);
        return { onUninstall: pluginModule.onUninstall };
    } catch (err) {
        console.warn(`[Updater] Konnte Lifecycle-Hooks fuer '${pluginId}' nicht laden:`, err);
        return {};
    }
}

function resolveUpdateUrl(relativePath: string): string {
    if (/^https?:\/\//i.test(relativePath)) {
        return relativePath;
    }
    const cleanBase = config.update.url.replace(/\/+$/, '');
    const cleanPath = relativePath.replace(/^\/+/, '');
    return `${cleanBase}/${cleanPath}`;
}

/**
 * Loest Plugin-URLs auf. Nutzt PLUGIN_URL wenn gesetzt,
 * sonst Fallback auf UPDATE_URL/plugins/.
 */
function resolvePluginUrl(relativePath: string): string {
    if (/^https?:\/\//i.test(relativePath)) {
        return relativePath;
    }
    const pluginBase = config.update.pluginUrl.trim();
    const cleanPath = relativePath.replace(/^\/+/, '');
    if (pluginBase) {
        return `${pluginBase.replace(/\/+$/, '')}/${cleanPath}`;
    }
    // Fallback: UPDATE_URL + plugins/ Prefix
    return resolveUpdateUrl(`plugins/${cleanPath}`);
}

function createUpdateRequestToken(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function withCacheBust(url: string, cacheBust?: string): string {
    if (!cacheBust) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}cb=${encodeURIComponent(cacheBust)}`;
}

async function discoverCatalogFromDirectoryListing(): Promise<CatalogEntry[]> {
    try {
        const pluginsRootUrl = resolvePluginUrl('');
        const res = await fetch(pluginsRootUrl);
        if (!res.ok) return [];

        const html = await res.text();
        const pluginIds = extractDirectoryNames(html, pluginsRootUrl);
        if (pluginIds.length === 0) return [];

        const entries: CatalogEntry[] = [];
        for (const pluginId of pluginIds) {
            const fromVersion = await loadCatalogEntryFromVersion(pluginId);
            if (fromVersion) entries.push(fromVersion);
        }

        return entries.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    } catch {
        return [];
    }
}

async function fetchCatalogFromIndexFile(): Promise<CatalogEntry[]> {
    try {
        const res = await fetch(resolvePluginUrl('index.json'), {
            headers: {
                'accept-encoding': 'identity',
                'cache-control': 'no-cache',
                pragma: 'no-cache',
            },
        });
        if (!res.ok) return [];

        const payload = await res.json() as unknown;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];

        const plugins = (payload as Record<string, unknown>).plugins;
        if (!Array.isArray(plugins)) return [];

        const entries: CatalogEntry[] = [];
        for (const row of plugins) {
            if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
            const item = row as Record<string, unknown>;
            const id = typeof item.id === 'string' ? item.id.trim() : '';
            if (!id) continue;

            const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id;
            const description = typeof item.description === 'string' ? item.description.trim() : '';
            const version = typeof item.version === 'string' ? item.version.trim() : '';
            if (!version) continue;
            const author = typeof item.author === 'string' ? item.author.trim() : '';
            const dependencies = normalizeStringArray(item.dependencies);

            entries.push({ id, name, description, version, author, dependencies });
        }

        return entries.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    } catch {
        return [];
    }
}

async function loadCatalogEntryFromVersion(pluginId: string): Promise<CatalogEntry | null> {
    const payload = await fetchPluginVersionInfo(`${pluginId}/version.json`);
    if (!payload) return null;

    return {
        id: pluginId,
        name: payload.name?.trim() || pluginId,
        description: payload.description?.trim() || '',
        version: payload.version,
        author: payload.author?.trim() || '',
        dependencies: normalizeStringArray(payload.dependencies),
    };
}

function extractDirectoryNames(html: string, pluginsRootUrl: string): string[] {
    const found = new Set<string>();
    const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null = null;
    let pluginsBasePath = '/plugins/';

    try {
        const root = new URL(pluginsRootUrl);
        pluginsBasePath = root.pathname.endsWith('/') ? root.pathname : `${root.pathname}/`;
    } catch {
        // Fallback bleibt /plugins/
    }

    while ((match = hrefRegex.exec(html)) !== null) {
        const rawHref = match[1] || '';
        if (!rawHref) continue;

        let pathname = '';
        try {
            const resolved = new URL(rawHref, pluginsRootUrl);
            pathname = resolved.pathname || '';
        } catch {
            pathname = rawHref.split('#')[0].split('?')[0];
        }

        if (!pathname) continue;

        // Nur Eintraege innerhalb des Plugin-Roots zulassen.
        if (!pathname.startsWith(pluginsBasePath)) continue;

        const relativePath = pathname.slice(pluginsBasePath.length).replace(/^\/+/, '').trim();
        if (!relativePath) continue;

        const parts = relativePath.split('/').filter(Boolean);
        if (parts.length === 0) continue;
        const segment = decodeURIComponent(parts[0] || '').trim();
        if (!segment) continue;
        if (segment === '.' || segment === '..') continue;
        if (!/^[a-zA-Z0-9._-]+$/.test(segment)) continue;
        if (['icons', 'cgi-bin'].includes(segment.toLowerCase())) continue;

        // Dateilinks ohne Unterpfad ignorieren, Verzeichnislinks (auch ohne Slash) zulassen.
        if (parts.length === 1) {
            const lower = segment.toLowerCase();
            const fileExtensions = ['.json', '.txt', '.html', '.htm', '.gz', '.zip', '.xml', '.php', '.md'];
            if (fileExtensions.some((ext) => lower.endsWith(ext))) continue;
        }

        found.add(segment);
    }

    return Array.from(found.values()).sort((a, b) => a.localeCompare(b, 'de'));
}

function normalizeVersionInfo(raw: unknown): VersionInfo | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const input = raw as Record<string, unknown>;

    const version = typeof input.version === 'string' ? input.version.trim() : '';
    if (!version) return null;

    const normalized: VersionInfo = {
        version,
        changelog: typeof input.changelog === 'string' ? input.changelog : '',
        released_at: typeof input.released_at === 'string' ? input.released_at : '',
    };

    if (typeof input.artifact_url === 'string' && input.artifact_url.trim()) {
        normalized.artifact_url = input.artifact_url.trim();
    }

    if (typeof input.name === 'string' && input.name.trim()) normalized.name = input.name.trim();
    if (typeof input.description === 'string') normalized.description = input.description.trim();
    if (typeof input.author === 'string') normalized.author = input.author.trim();
    if (Array.isArray(input.dependencies)) normalized.dependencies = normalizeStringArray(input.dependencies);

    if (typeof input.tar_sha256 === 'string' && /^[a-f0-9]{64}$/i.test(input.tar_sha256.trim())) {
        normalized.tar_sha256 = input.tar_sha256.trim().toLowerCase();
    }

    return normalized;
}

async function fetchVersionInfo(relativePath: string, cacheBust?: string): Promise<VersionInfo | null> {
    try {
        const res = await fetch(withCacheBust(resolveUpdateUrl(relativePath), cacheBust), {
            headers: {
                'accept-encoding': 'identity',
                'cache-control': 'no-cache',
                pragma: 'no-cache',
            },
        });
        if (!res.ok) return null;
        const payload = await res.json() as unknown;
        return normalizeVersionInfo(payload);
    } catch {
        return null;
    }
}

/** Plugin-spezifische Version-Info — nutzt PLUGIN_URL */
async function fetchPluginVersionInfo(relativePath: string, cacheBust?: string): Promise<VersionInfo | null> {
    try {
        const res = await fetch(withCacheBust(resolvePluginUrl(relativePath), cacheBust), {
            headers: {
                'accept-encoding': 'identity',
                'cache-control': 'no-cache',
                pragma: 'no-cache',
            },
        });
        if (!res.ok) return null;
        const payload = await res.json() as unknown;
        return normalizeVersionInfo(payload);
    } catch {
        return null;
    }
}

async function writeBufferToFile(content: Buffer, filePath: string): Promise<void> {
    await pipeline(Readable.from(content), createWriteStream(filePath));
}

function verifyDownloadedArtifact(params: {
    artifactName: string;
    archiveBuffer: Buffer;
    expectedHash?: string;
}): void {
    const { artifactName, archiveBuffer, expectedHash } = params;
    const sha256 = createHash('sha256').update(archiveBuffer).digest('hex');

    if (config.update.requireHash && !expectedHash) {
        throw new Error(`Hash-Pruefung erforderlich, aber kein Hash fuer '${artifactName}' vorhanden`);
    }
    if (expectedHash && expectedHash !== sha256) {
        throw new Error(`Hash-Pruefung fehlgeschlagen fuer '${artifactName}' (erwartet ${expectedHash.slice(0, 12)}..., erhalten ${sha256.slice(0, 12)}...)`);
    }
}

function normalizeStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

async function downloadRawBinary(url: string, redirectCount: number = 0): Promise<Buffer> {
    if (redirectCount > 5) {
        throw new Error('Zu viele Redirects beim Artefakt-Download');
    }

    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    return await new Promise<Buffer>((resolve, reject) => {
        const req = client.request(parsed, {
            method: 'GET',
            headers: {
                accept: 'application/gzip, application/octet-stream, */*',
                'accept-encoding': 'identity',
                'cache-control': 'no-cache',
                pragma: 'no-cache',
                'user-agent': 'MIKE-WorkSpace-Updater/2.0',
            },
        }, (res) => {
            const status = res.statusCode || 0;

            if ([301, 302, 303, 307, 308].includes(status)) {
                const location = res.headers.location;
                res.resume();
                if (!location) {
                    reject(new Error('Redirect ohne Location beim Artefakt-Download'));
                    return;
                }
                const nextUrl = new URL(location, parsed).toString();
                downloadRawBinary(nextUrl, redirectCount + 1).then(resolve).catch(reject);
                return;
            }

            if (status < 200 || status >= 300) {
                res.resume();
                reject(new Error(`Download fehlgeschlagen (${status})`));
                return;
            }

            const chunks: Buffer[] = [];
            const contentEncoding = typeof res.headers['content-encoding'] === 'string'
                ? res.headers['content-encoding'].toLowerCase().trim()
                : '';
            res.on('data', (chunk: Buffer | string) => {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            });
            res.on('end', () => {
                const rawBuffer = Buffer.concat(chunks);
                try {
                    if (!contentEncoding || contentEncoding === 'identity') {
                        resolve(rawBuffer);
                        return;
                    }

                    const decodedBuffer = decodeTransferEncoding(rawBuffer, contentEncoding);

                    // Einige Hosts markieren .tar.gz faelschlich als content-encoding=gzip,
                    // obwohl der Body bereits direkt die finale .tar.gz-Datei ist.
                    if (isTarGzipBuffer(decodedBuffer)) {
                        resolve(decodedBuffer);
                        return;
                    }
                    if (isTarGzipBuffer(rawBuffer)) {
                        resolve(rawBuffer);
                        return;
                    }

                    resolve(decodedBuffer);
                } catch {
                    if (isTarGzipBuffer(rawBuffer)) {
                        resolve(rawBuffer);
                        return;
                    }
                    reject(new Error(`Nicht unterstuetzte oder fehlerhafte Transport-Kompression: ${contentEncoding || 'unbekannt'}`));
                }
            });
            res.on('error', reject);
        });

        req.setTimeout(30000, () => {
            req.destroy(new Error('Timeout beim Artefakt-Download'));
        });
        req.on('error', reject);
        req.end();
    });
}

function decodeTransferEncoding(buffer: Buffer, contentEncoding: string): Buffer {
    if (!contentEncoding || contentEncoding === 'identity') {
        return buffer;
    }

    if (contentEncoding === 'gzip' || contentEncoding === 'x-gzip') {
        return gunzipSync(buffer);
    }

    if (contentEncoding === 'deflate') {
        return inflateSync(buffer);
    }

    if (contentEncoding === 'br') {
        return brotliDecompressSync(buffer);
    }

    throw new Error(`Unbekannte Transport-Kompression: ${contentEncoding}`);
}

function isTarGzipBuffer(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}
