import { useEffect, useState } from 'react';
import { apiFetch } from '../../context/AuthContext';

interface AuditEntry {
    id: number;
    user_id: number | null;
    user_username: string | null;
    action: string;
    category: string;
    entity_type: string | null;
    entity_id: string | null;
    previous_state: any;
    new_state: any;
    ip_address: string | null;
    user_agent: string | null;
    plugin_id: string | null;
    tenant_id: number | null;
    tenant_name?: string | null;
    created_at: string;
}

export default function AuditLog() {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [tenants, setTenants] = useState<Array<{ id: number; name: string }>>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('');
    const [tenantFilter, setTenantFilter] = useState('');
    const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

    const loadTenants = async () => {
        const res = await apiFetch('/api/admin/tenants');
        if (!res.ok) return;
        const data = await res.json();
        setTenants(data.map((tenant: any) => ({ id: Number(tenant.id), name: tenant.name })));
    };

    const loadEntries = async () => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page), limit: '50' });
        if (category) params.set('category', category);
        if (tenantFilter) params.set('tenantId', tenantFilter);

        const res = await apiFetch(`/api/admin/audit-log?${params}`);
        if (res.ok) {
            const data = await res.json();
            setEntries(data.entries);
            setTotal(data.total);
        }
        setLoading(false);
    };

    useEffect(() => {
        void loadTenants();
    }, []);

    useEffect(() => {
        void loadEntries();
    }, [page, category, tenantFilter]);

    const loadDetail = async (id: number) => {
        const res = await apiFetch(`/api/admin/audit-log/${id}`);
        if (res.ok) setSelectedEntry(await res.json());
    };

    const renderDiff = (previous: any, current: any) => {
        if (!previous && !current) return <span className="text-muted">Keine Daten</span>;

        const allKeys = new Set([
            ...Object.keys(previous || {}),
            ...Object.keys(current || {}),
        ]);

        return (
            <div className="diff-container">
                {Array.from(allKeys).map((key) => {
                    const prev = previous?.[key];
                    const curr = current?.[key];
                    const changed = JSON.stringify(prev) !== JSON.stringify(curr);

                    if (!changed) return null;

                    return (
                        <div key={key}>
                            {prev !== undefined && (
                                <div className="diff-row diff-removed">
                                    <span className="diff-key">{key}:</span>
                                    <span>- {JSON.stringify(prev)}</span>
                                </div>
                            )}
                            {curr !== undefined && (
                                <div className="diff-row diff-added">
                                    <span className="diff-key">{key}:</span>
                                    <span>+ {JSON.stringify(curr)}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const categoryColors: Record<string, string> = {
        auth: 'badge-info',
        admin: 'badge-warning',
        data: 'badge-success',
        plugin: 'badge-info',
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Audit-Log</h1>
                <p className="page-subtitle">{total} Einträge insgesamt</p>
            </div>

            <div className="card mb-md">
                <div className="flex gap-md">
                    <select
                        className="form-input"
                        style={{ width: 'auto' }}
                        value={category}
                        onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                    >
                        <option value="">Alle Kategorien</option>
                        <option value="auth">Auth</option>
                        <option value="admin">Admin</option>
                        <option value="data">Daten</option>
                        <option value="plugin">Plugin</option>
                    </select>
                    <select
                        className="form-input"
                        style={{ width: 'auto' }}
                        value={tenantFilter}
                        onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">Alle Mandanten</option>
                        {tenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Zeitpunkt</th>
                                <th>Benutzer</th>
                                <th>Kategorie</th>
                                <th>Aktion</th>
                                <th>Entität</th>
                                <th>Mandant</th>
                                <th>IP</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="text-center text-muted">Laden...</td></tr>
                            ) : entries.map((entry) => (
                                <tr key={entry.id}>
                                    <td className="text-muted">{new Date(entry.created_at).toLocaleString('de-DE')}</td>
                                    <td>{entry.user_username || 'System'}</td>
                                    <td><span className={`badge ${categoryColors[entry.category] || 'badge-info'}`}>{entry.category}</span></td>
                                    <td><code style={{ fontSize: 'var(--font-size-xs)' }}>{entry.action}</code></td>
                                    <td className="text-muted">
                                        {entry.entity_type ? `${entry.entity_type} #${entry.entity_id}` : '-'}
                                    </td>
                                    <td className="text-muted">{entry.tenant_name || '-'}</td>
                                    <td className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{entry.ip_address || '-'}</td>
                                    <td>
                                        <button className="btn btn-secondary btn-sm" onClick={() => loadDetail(entry.id)}>
                                            Detail
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {total > 50 && (
                    <div className="flex-between mt-md">
                        <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                            Seite {page} von {Math.ceil(total / 50)}
                        </span>
                        <div className="flex gap-sm">
                            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                Zurück
                            </button>
                            <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(page + 1)}>
                                Weiter
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selectedEntry && (
                <div className="modal-overlay" onClick={() => setSelectedEntry(null)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Detail: {selectedEntry.action}</h2>
                            <button className="modal-close" onClick={() => setSelectedEntry(null)} aria-label="Schließen">×</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', fontSize: 'var(--font-size-sm)' }}>
                            <div><strong>Benutzer:</strong> {selectedEntry.user_username || 'System'}</div>
                            <div><strong>IP:</strong> {selectedEntry.ip_address || '-'}</div>
                            <div><strong>Entität:</strong> {selectedEntry.entity_type} #{selectedEntry.entity_id}</div>
                            <div><strong>Zeitpunkt:</strong> {new Date(selectedEntry.created_at).toLocaleString('de-DE')}</div>
                            <div><strong>Mandant:</strong> {selectedEntry.tenant_name || '-'}</div>
                            <div><strong>Kategorie:</strong> {selectedEntry.category}</div>
                        </div>

                        {(selectedEntry.previous_state || selectedEntry.new_state) && (
                            <div className="mt-md">
                                <strong style={{ fontSize: 'var(--font-size-sm)' }}>Änderungen:</strong>
                                <div className="mt-md">
                                    {renderDiff(selectedEntry.previous_state, selectedEntry.new_state)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
