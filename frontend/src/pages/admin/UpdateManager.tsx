import { useState, useEffect } from 'react';
import { apiFetch } from '../../context/AuthContext';
import { useModal, useToast } from '../../components/ModalProvider';

interface CoreUpdate {
    available: boolean;
    current: string;
    remote?: { version: string; changelog: string; released_at: string };
}

interface PluginUpdate {
    pluginId: string;
    current: string;
    remote: { version: string; changelog: string; released_at: string };
    available: boolean;
}

interface RemotePluginEntry {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
}

interface InstalledPlugin {
    pluginId: string;
    name: string;
    version: string;
    isActive: boolean;
    installedAt: string | null;
}

interface UpdateTaskLogEntry {
    at: string;
    level: 'info' | 'success' | 'error';
    message: string;
}

interface UpdateTaskPayload {
    id: string;
    type: 'core' | 'plugin-install' | 'plugin-update' | 'plugin-remove';
    target: string;
    status: 'queued' | 'running' | 'success' | 'error';
    progress: number;
    createdAt: string;
    updatedAt: string;
    version?: string;
    error?: string;
    logs: UpdateTaskLogEntry[];
}

export default function UpdateManager() {
    const modal = useModal();
    const toast = useToast();
    const [core, setCore] = useState<CoreUpdate | null>(null);
    const [plugins, setPlugins] = useState<PluginUpdate[]>([]);
    const [remotePlugins, setRemotePlugins] = useState<RemotePluginEntry[]>([]);
    const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState<string | null>(null);
    const [task, setTask] = useState<UpdateTaskPayload | null>(null);

    const checkUpdates = async () => {
        setLoading(true);
        const res = await apiFetch('/api/admin/updates/check');
        if (res.ok) {
            const data = await res.json();
            setCore(data.core);
            setPlugins(Array.isArray(data.plugins) ? data.plugins : []);
            setRemotePlugins(Array.isArray(data.catalog) ? data.catalog : []);
            setInstalledPlugins(Array.isArray(data.installedPlugins) ? data.installedPlugins : []);
        }
        setLoading(false);
    };

    const compareVersions = (a: string, b: string): number => {
        const pa = a.split('.').map((v) => Number(v) || 0);
        const pb = b.split('.').map((v) => Number(v) || 0);
        const max = Math.max(pa.length, pb.length);
        for (let i = 0; i < max; i++) {
            if ((pa[i] || 0) > (pb[i] || 0)) return 1;
            if ((pa[i] || 0) < (pb[i] || 0)) return -1;
        }
        return 0;
    };

    const waitForCoreRestartAndRefresh = async (targetVersion: string) => {
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
                const res = await apiFetch('/api/admin/updates/check');
                if (!res.ok) continue;
                const payload = await res.json();
                const current = String(payload?.core?.current || '');
                if (current && compareVersions(current, targetVersion) >= 0) {
                    window.location.reload();
                    return;
                }
            } catch {
                // Während Neustart sind Fehler erwartbar.
            }
        }
        await checkUpdates();
    };

    const pollTask = async (taskId: string): Promise<UpdateTaskPayload | null> => {
        const deadline = Date.now() + 10 * 60_000;
        while (Date.now() < deadline) {
            try {
                const res = await apiFetch(`/api/admin/updates/tasks/${taskId}`);
                if (res.ok) {
                    const payload = await res.json();
                    const currentTask = payload?.task as UpdateTaskPayload | undefined;
                    if (currentTask) {
                        setTask(currentTask);
                        if (currentTask.status === 'success' || currentTask.status === 'error') {
                            return currentTask;
                        }
                    }
                }
            } catch {
                // Bei Neustart kurzzeitige Fehler ignorieren.
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        return null;
    };

    const waitForUpdatesEndpoint = async () => {
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
                const res = await apiFetch('/api/admin/updates/check');
                if (!res.ok) continue;
                const data = await res.json();
                setCore(data.core);
                setPlugins(Array.isArray(data.plugins) ? data.plugins : []);
                setRemotePlugins(Array.isArray(data.catalog) ? data.catalog : []);
                setInstalledPlugins(Array.isArray(data.installedPlugins) ? data.installedPlugins : []);
                return;
            } catch {
                // Während Restart sind kurzzeitige Fehler normal.
            }
        }
        await checkUpdates();
    };

    useEffect(() => { checkUpdates(); }, []);

    const installCore = async () => {
        const ok = await modal.confirm({ title: 'Core-Update installieren', message: 'Der Server wird neu gestartet. Fortfahren?', confirmText: 'Installieren', variant: 'warning' });
        if (!ok) return;
        setInstalling('core');
        setTask(null);
        try {
            const res = await apiFetch('/api/admin/updates/install-core', { method: 'POST' });
            const data = await res.json();
            if (!res.ok || !data?.success || !data?.taskId) {
                toast.error(data?.error || 'Core-Update konnte nicht gestartet werden');
                return;
            }

            const finalTask = await pollTask(String(data.taskId));
            if (!finalTask) {
                toast.error('Update-Status konnte nicht vollständig abgerufen werden.');
                return;
            }
            if (finalTask.status === 'error') {
                toast.error(finalTask.error || 'Core-Update fehlgeschlagen');
                return;
            }

            const targetVersion = String(finalTask.version || core?.remote?.version || '');
            await modal.alert({ title: 'Update erfolgreich', message: `Update auf v${targetVersion || '-'} erfolgreich.\nServer startet neu. Die Seite aktualisiert sich automatisch.`, variant: 'success' });
            if (targetVersion) {
                await waitForCoreRestartAndRefresh(targetVersion);
            } else {
                await checkUpdates();
            }
        } finally {
            setInstalling(null);
        }
    };

    const installPlugin = async (pluginId: string) => {
        const ok = await modal.confirm({ title: 'Plugin installieren', message: `Plugin "${pluginId}" installieren? Server wird neu gestartet.`, confirmText: 'Installieren', variant: 'warning' });
        if (!ok) return;
        setInstalling(pluginId);
        setTask(null);
        try {
            const res = await apiFetch(`/api/admin/updates/install-plugin/${pluginId}`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok || !data?.success || !data?.taskId) {
                toast.error(data?.error || `Plugin ${pluginId} konnte nicht gestartet werden`);
                return;
            }

            const finalTask = await pollTask(String(data.taskId));
            if (!finalTask) {
                toast.error('Update-Status konnte nicht vollständig abgerufen werden.');
                return;
            }
            if (finalTask.status === 'error') {
                toast.error(finalTask.error || `Plugin ${pluginId} konnte nicht installiert werden`);
                return;
            }

            toast.success(`Plugin ${pluginId} erfolgreich installiert. Server startet neu.`);
            await waitForUpdatesEndpoint();
        } finally {
            setInstalling(null);
        }
    };

    const updatePlugin = async (pluginId: string) => {
        const ok = await modal.confirm({ title: 'Plugin aktualisieren', message: `Plugin "${pluginId}" aktualisieren? Server wird neu gestartet.`, confirmText: 'Aktualisieren', variant: 'warning' });
        if (!ok) return;
        setInstalling(pluginId);
        setTask(null);
        try {
            const res = await apiFetch(`/api/admin/updates/update-plugin/${pluginId}`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok || !data?.success || !data?.taskId) {
                toast.error(data?.error || `Plugin ${pluginId} konnte nicht gestartet werden`);
                return;
            }

            const finalTask = await pollTask(String(data.taskId));
            if (!finalTask) {
                toast.error('Update-Status konnte nicht vollständig abgerufen werden.');
                return;
            }
            if (finalTask.status === 'error') {
                toast.error(finalTask.error || `Plugin ${pluginId} konnte nicht aktualisiert werden`);
                return;
            }

            toast.success(`Plugin ${pluginId} erfolgreich aktualisiert. Server startet neu.`);
            await waitForUpdatesEndpoint();
        } finally {
            setInstalling(null);
        }
    };

    const removePlugin = async (pluginId: string) => {
        const ok = await modal.confirm({ title: 'Plugin entfernen', message: `Plugin "${pluginId}" wirklich entfernen? Der Server wird neu gestartet.`, confirmText: 'Entfernen', variant: 'danger' });
        if (!ok) return;
        setInstalling(`remove-${pluginId}`);
        setTask(null);
        try {
            const res = await apiFetch(`/api/admin/updates/remove-plugin/${pluginId}`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok || !data?.success || !data?.taskId) {
                toast.error(data?.error || `Plugin ${pluginId} konnte nicht gestartet werden`);
                return;
            }

            const finalTask = await pollTask(String(data.taskId));
            if (!finalTask) {
                toast.error('Update-Status konnte nicht vollständig abgerufen werden.');
                return;
            }
            if (finalTask.status === 'error') {
                toast.error(finalTask.error || `Plugin ${pluginId} konnte nicht entfernt werden`);
                return;
            }

            toast.success(`Plugin ${pluginId} erfolgreich entfernt. Server startet neu.`);
            await waitForUpdatesEndpoint();
        } finally {
            setInstalling(null);
        }
    };

    if (loading) return <div className="text-muted">Prüfe auf Updates...</div>;

    const pluginUpdatesById = new Map(plugins.map((entry) => [entry.pluginId, entry]));
    const installedPluginIds = new Set(installedPlugins.map((entry) => entry.pluginId));
    const installableRemotePlugins = remotePlugins.filter((entry) => !installedPluginIds.has(entry.id));
    const installedPluginsSorted = [...installedPlugins].sort((a, b) => a.name.localeCompare(b.name, 'de'));

    return (
        <div>
            <div className="flex-between">
                <div className="page-header">
                    <h1 className="page-title">Updates</h1>
                    <p className="page-subtitle">Core-Framework und Plugins aktualisieren</p>
                </div>
                <button className="btn btn-secondary" onClick={checkUpdates}>Erneut prüfen</button>
            </div>

            {/* Core Update */}
            <div className="card mb-md">
                <div className="flex-between">
                    <div>
                        <div className="card-title">Core-Framework</div>
                        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                            Aktuelle Version: <strong>v{core?.current}</strong>
                        </p>
                    </div>
                    {core?.available && core.remote ? (
                        <div style={{ textAlign: 'right' }}>
                            <span className="badge badge-success mb-md">v{core.remote.version} verfügbar</span>
                            <br />
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={installCore}
                                disabled={installing !== null}
                            >
                                {installing === 'core' ? 'Installiere...' : 'Update installieren'}
                            </button>
                        </div>
                    ) : (
                        <span className="badge badge-info">Aktuell</span>
                    )}
                </div>
                {core?.available && core.remote?.changelog && (
                    <div className="mt-md" style={{ fontSize: 'var(--font-size-sm)', background: 'var(--color-bg)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}>
                        <strong>Changelog:</strong><br />{core.remote.changelog}
                    </div>
                )}
            </div>

            {task && (
                <div className="card mb-md">
                    <div className="flex-between mb-md">
                        <div className="card-title">Update-Status</div>
                        {task.status === 'success' ? (
                            <span className="badge badge-success">Erfolgreich</span>
                        ) : task.status === 'error' ? (
                            <span className="badge badge-warning">Fehler</span>
                        ) : (
                            <span className="badge badge-info">Läuft</span>
                        )}
                    </div>

                    <div style={{ width: '100%', height: 10, borderRadius: 999, background: 'var(--color-bg)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                        <div
                            style={{
                                width: `${Math.max(0, Math.min(100, task.progress || 0))}%`,
                                height: '100%',
                                background: task.status === 'error' ? 'var(--color-danger)' : 'var(--color-primary)',
                                transition: 'width 180ms ease',
                            }}
                        />
                    </div>

                    <p className="text-muted mt-md" style={{ fontSize: 'var(--font-size-sm)' }}>
                        {task.progress}% • {
                            task.type === 'core'
                                ? 'Core-Update'
                                : task.type === 'plugin-install'
                                    ? `Plugin ${task.target} installieren`
                                    : task.type === 'plugin-update'
                                        ? `Plugin ${task.target} aktualisieren`
                                        : `Plugin ${task.target} entfernen`
                        }
                    </p>

                    <div style={{ marginTop: 'var(--space-md)', maxHeight: 220, overflowY: 'auto', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm)' }}>
                        {task.logs.map((entry, index) => (
                            <div key={`${entry.at}-${index}`} style={{ fontSize: 'var(--font-size-xs)', color: entry.level === 'error' ? 'var(--color-danger)' : entry.level === 'success' ? 'var(--color-success)' : 'var(--color-text-muted)', marginBottom: 6 }}>
                                <strong style={{ color: 'var(--color-text-muted)' }}>{new Date(entry.at).toLocaleTimeString('de-DE')}</strong> {entry.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Installierte Plugins */}
            <div className="card mb-md">
                <div className="card-title mb-md">Installierte Plugins</div>
                {installedPluginsSorted.length === 0 ? (
                    <p className="text-muted">Keine Plugins installiert.</p>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr><th>Plugin</th><th>Name</th><th>Status</th><th>Installiert</th><th>Verfügbar</th><th>Aktionen</th></tr>
                            </thead>
                            <tbody>
                                {installedPluginsSorted.map((plugin) => {
                                    const updateState = pluginUpdatesById.get(plugin.pluginId);
                                    const hasUpdate = Boolean(updateState?.available);
                                    return (
                                        <tr key={plugin.pluginId}>
                                            <td><strong>{plugin.pluginId}</strong></td>
                                            <td>{plugin.name}</td>
                                            <td>{plugin.isActive ? <span className="badge badge-success">Aktiv</span> : <span className="badge badge-warning">Inaktiv</span>}</td>
                                            <td>v{plugin.version}</td>
                                            <td>{hasUpdate ? <span className="badge badge-success">v{updateState?.remote.version}</span> : <span className="badge badge-info">Aktuell</span>}</td>
                                            <td style={{ display: 'flex', gap: 8 }}>
                                                {hasUpdate && (
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => updatePlugin(plugin.pluginId)}
                                                        disabled={installing !== null}
                                                    >
                                                        {installing === plugin.pluginId ? 'Aktualisiere...' : 'Aktualisieren'}
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => removePlugin(plugin.pluginId)}
                                                    disabled={installing !== null}
                                                >
                                                    {installing === `remove-${plugin.pluginId}` ? 'Entferne...' : 'Entfernen'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Verfügbare Plugins (aus Plugin-Unterordnern) */}
            <div className="card">
                <div className="card-title mb-md">Verfügbare Plugins</div>
                {installableRemotePlugins.length === 0 ? (
                    <p className="text-muted">Keine weiteren Plugins verfügbar.</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-md)' }}>
                        {installableRemotePlugins.map((entry) => (
                            <div key={entry.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
                                <div style={{ fontWeight: 600 }}>{entry.name}</div>
                                <p className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 4 }}>{entry.description}</p>
                                <div className="flex-between mt-md">
                                    <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>v{entry.version} • {entry.author}</span>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => installPlugin(entry.id)}
                                        disabled={installing !== null}
                                    >
                                        {installing === entry.id ? 'Installiere...' : 'Installieren'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
