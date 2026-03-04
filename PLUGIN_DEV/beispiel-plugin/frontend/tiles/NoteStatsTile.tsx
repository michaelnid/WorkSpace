import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../frontend/src/context/AuthContext';

interface Note {
    id: number;
}

export default function NoteStatsTile() {
    const [count, setCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;

        async function load() {
            try {
                const res = await apiFetch('/api/plugins/example/notes');
                if (!active) return;
                if (!res.ok) {
                    setError(true);
                    return;
                }

                const notes = await res.json() as Note[];
                setCount(Array.isArray(notes) ? notes.length : 0);
                setError(false);
            } catch {
                if (!active) return;
                setError(true);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        void load();
        return () => {
            active = false;
        };
    }, []);

    if (loading) {
        return <div className="text-muted">Laden...</div>;
    }

    if (error) {
        return <div className="text-muted">Notiz-Statistik konnte nicht geladen werden.</div>;
    }

    return (
        <div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>{count}</div>
            <p className="text-muted mt-md">
                {count === 1
                    ? 'Notiz im aktiven Mandanten'
                    : 'Notizen im aktiven Mandanten'}
            </p>
        </div>
    );
}
