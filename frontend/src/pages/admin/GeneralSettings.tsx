import { useState, useEffect, Suspense, useMemo } from 'react';
import { apiFetch, useAuth } from '../../context/AuthContext';
import { pluginRegistry } from '../../pluginRegistry';

interface Setting {
    id: number;
    key: string;
    value_encrypted: string | null;
    category: string;
    plugin_id: string | null;
}

export default function GeneralSettings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const res = await apiFetch('/api/admin/settings');
        if (res.ok) setSettings(await res.json());
        setLoading(false);
    };

    const hasPermission = (permission?: string): boolean => {
        if (!permission) return true;
        if (!user) return false;
        return user.permissions.includes('*') || user.permissions.includes(permission);
    };

    const pluginsWithSettings = useMemo(
        () => pluginRegistry.filter(
            (entry) => entry.settingsPanel && hasPermission(entry.settingsPanel.permission)
        ),
        [user]
    );

    if (loading) return <div className="text-muted">Laden...</div>;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Einstellungen</h1>
                <p className="page-subtitle">Systemeinstellungen und Plugin-Konfiguration</p>
            </div>

            {settings.length > 0 && (
                <div className="card">
                    <div className="card-title">Systemeinstellungen</div>
                    <div className="table-container mt-md">
                        <table>
                            <thead>
                                <tr>
                                    <th>Schlüssel</th>
                                    <th>Kategorie</th>
                                    <th>Plugin</th>
                                    <th>Wert</th>
                                </tr>
                            </thead>
                            <tbody>
                                {settings.map((setting) => (
                                    <tr key={setting.id}>
                                        <td><code>{setting.key}</code></td>
                                        <td><span className="badge badge-info">{setting.category}</span></td>
                                        <td className="text-muted">{setting.plugin_id || 'Core'}</td>
                                        <td className="text-muted">***verschlüsselt***</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {pluginsWithSettings.map((entry) => {
                const SettingsComponent = entry.settingsPanel!.component;
                return (
                    <div key={`settings-${entry.id}`} className="card" style={{ marginTop: 'var(--space-lg)' }}>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                            <span className="badge badge-info">Plugin</span>
                            {entry.name}
                        </div>
                        <div style={{ marginTop: 'var(--space-md)' }}>
                            <Suspense fallback={<div className="text-muted">Plugin-Einstellungen werden geladen...</div>}>
                                <SettingsComponent />
                            </Suspense>
                        </div>
                    </div>
                );
            })}

            <EmailSettingsCard />
        </div>
    );
}

function EmailSettingsCard() {
    const [provider, setProvider] = useState('none');
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState('587');
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPassword, setSmtpPassword] = useState('');
    const [smtpSecure, setSmtpSecure] = useState('true');
    const [fromAddress, setFromAddress] = useState('');
    const [fromName, setFromName] = useState('');
    const [saving, setSaving] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [emailLoading, setEmailLoading] = useState(true);

    useEffect(() => {
        loadEmailSettings();
    }, []);

    const loadEmailSettings = async () => {
        try {
            const res = await apiFetch('/api/admin/email/settings');
            if (res.ok) {
                const data = await res.json();
                setProvider(data.provider || 'none');
                setSmtpHost(data.smtp_host || '');
                setSmtpPort(data.smtp_port || '587');
                setSmtpUser(data.smtp_user || '');
                setSmtpPassword(data.smtp_password || '');
                setSmtpSecure(data.smtp_secure || 'true');
                setFromAddress(data.from_address || '');
                setFromName(data.from_name || '');
            }
        } catch { /* */ }
        setEmailLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await apiFetch('/api/admin/email/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    provider,
                    smtp_host: smtpHost,
                    smtp_port: smtpPort,
                    smtp_user: smtpUser,
                    smtp_password: smtpPassword,
                    smtp_secure: smtpSecure,
                    from_address: fromAddress,
                    from_name: fromName,
                }),
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'E-Mail-Einstellungen gespeichert' });
            } else {
                const err = await res.json().catch(() => ({ error: 'Fehler' }));
                setMessage({ type: 'error', text: err.error || 'Fehler beim Speichern' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Netzwerkfehler' });
        }
        setSaving(false);
    };

    const handleTest = async () => {
        if (!testEmail.trim()) return;
        setTesting(true);
        setMessage(null);
        try {
            const res = await apiFetch('/api/admin/email/test', {
                method: 'POST',
                body: JSON.stringify({ to: testEmail }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: data.message || 'Test-E-Mail gesendet' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Fehler beim Senden' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Netzwerkfehler' });
        }
        setTesting(false);
    };

    if (emailLoading) return null;

    return (
        <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                E-Mail-Konfiguration
            </div>

            {message && (
                <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 'var(--space-md)' }}>
                    {message.text}
                </div>
            )}

            <div style={{ marginTop: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
                <div className="form-group">
                    <label className="form-label">Provider</label>
                    <select className="form-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                        <option value="none">Nicht konfiguriert</option>
                        <option value="smtp">SMTP</option>
                        <option value="m365">Microsoft 365 (bald verfügbar)</option>
                    </select>
                </div>

                {provider === 'smtp' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 'var(--space-md)' }}>
                            <div className="form-group">
                                <label className="form-label">SMTP Host</label>
                                <input className="form-input" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Port</label>
                                <input className="form-input" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                            <div className="form-group">
                                <label className="form-label">Benutzername</label>
                                <input className="form-input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@example.com" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Passwort</label>
                                <input className="form-input" type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder="••••••" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">TLS/SSL</label>
                            <select className="form-input" value={smtpSecure} onChange={(e) => setSmtpSecure(e.target.value)}>
                                <option value="true">Ja (empfohlen)</option>
                                <option value="false">Nein</option>
                            </select>
                        </div>
                    </>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                    <div className="form-group">
                        <label className="form-label">Absender-Adresse</label>
                        <input className="form-input" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="noreply@firma.de" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Absender-Name</label>
                        <input className="form-input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="MIKE System" />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Speichern...' : 'Speichern'}
                    </button>

                    {provider !== 'none' && (
                        <>
                            <input
                                className="form-input"
                                style={{ maxWidth: 250 }}
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                placeholder="test@firma.de"
                            />
                            <button className="btn" onClick={handleTest} disabled={testing || !testEmail.trim()}>
                                {testing ? 'Sende...' : 'Test-E-Mail senden'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
