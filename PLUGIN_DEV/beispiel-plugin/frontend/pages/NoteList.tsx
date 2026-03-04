import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../../../../frontend/src/context/AuthContext';
import { PermissionGate } from '../../../../frontend/src/components/PermissionGate';

interface Note {
    id: number;
    title: string;
    content: string;
    created_at: string;
}

async function readError(res: Response, fallback: string): Promise<string> {
    try {
        const data = await res.json() as { error?: string };
        if (data?.error) return data.error;
    } catch {
        // no-op
    }
    return fallback;
}

export default function NoteList() {
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    const loadNotes = async (showLoader = false) => {
        if (showLoader) setLoading(true);
        try {
            const res = await apiFetch('/api/plugins/example/notes');
            if (res.ok) {
                setNotes(await res.json());
                setError('');
            } else {
                setError(await readError(res, 'Notizen konnten nicht geladen werden.'));
            }
        } catch {
            setError('Notizen konnten nicht geladen werden.');
        } finally {
            if (showLoader) setLoading(false);
        }
    };

    useEffect(() => {
        void loadNotes(true);
    }, []);

    const createNote = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('Titel ist erforderlich.');
            return;
        }

        setSaving(true);
        try {
            const res = await apiFetch('/api/plugins/example/notes', {
                method: 'POST',
                body: JSON.stringify({ title, content }),
            });

            if (!res.ok) {
                setError(await readError(res, 'Notiz konnte nicht erstellt werden.'));
                return;
            }

            setTitle('');
            setContent('');
            setError('');
            await loadNotes();
        } catch {
            setError('Notiz konnte nicht erstellt werden.');
        } finally {
            setSaving(false);
        }
    };

    const deleteNote = async (id: number) => {
        if (!confirm('Notiz wirklich löschen?')) return;
        try {
            const res = await apiFetch(`/api/plugins/example/notes/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                setError(await readError(res, 'Notiz konnte nicht gelöscht werden.'));
                return;
            }
            setError('');
            await loadNotes();
        } catch {
            setError('Notiz konnte nicht gelöscht werden.');
        }
    };

    if (loading) return <div className="text-muted">Laden...</div>;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Notizen</h1>
                <p className="page-subtitle">Beispiel-Plugin mit mandantengetrennter Datenhaltung</p>
            </div>

            {error && (
                <div
                    className="modal-alert"
                    style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)', marginBottom: 'var(--space-md)' }}
                >
                    {error}
                </div>
            )}

            <div className="card mb-md">
                <div className="card-title mb-md">Neue Notiz</div>
                <PermissionGate
                    permission="example.create"
                    fallback={<p className="text-muted">Keine Berechtigung zum Erstellen von Notizen.</p>}
                >
                    <form onSubmit={createNote}>
                        <div className="form-group">
                            <input
                                className="form-input"
                                placeholder="Titel"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <textarea
                                className="form-input"
                                placeholder="Inhalt (optional)"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={3}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Speichern...' : 'Notiz speichern'}
                        </button>
                    </form>
                </PermissionGate>
            </div>

            <div className="card">
                {notes.length === 0 ? (
                    <p className="text-muted">Noch keine Notizen vorhanden.</p>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Titel</th>
                                    <th>Inhalt</th>
                                    <th>Erstellt</th>
                                    <th className="text-right">Aktionen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {notes.map((note) => (
                                    <tr key={note.id}>
                                        <td><strong>{note.title}</strong></td>
                                        <td className="text-muted">{note.content?.substring(0, 80)}{note.content?.length > 80 ? '...' : ''}</td>
                                        <td className="text-muted">{new Date(note.created_at).toLocaleString('de-DE')}</td>
                                        <td className="text-right">
                                            <PermissionGate permission="example.delete" fallback={<span className="text-muted">-</span>}>
                                                <button className="btn btn-danger btn-sm" onClick={() => deleteNote(note.id)}>
                                                    Löschen
                                                </button>
                                            </PermissionGate>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
