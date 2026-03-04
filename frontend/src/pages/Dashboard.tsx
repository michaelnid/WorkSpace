import { Suspense, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, useAuth } from '../context/AuthContext';
import { pluginRegistry, type PluginDashboardTile } from '../pluginRegistry';

type TileSize = 'small' | 'medium' | 'large';

interface TileLayout {
    order: number;
    size: TileSize;
    visible: boolean;
}

type DashboardLayoutState = Record<string, TileLayout>;

interface DashboardTileDefinition {
    key: string;
    title: string;
    description?: string;
    permission?: string;
    defaultOrder: number;
    defaultSize: TileSize;
    defaultVisible: boolean;
    render?: () => ReactNode;
    component?: PluginDashboardTile['component'];
}

const TILE_SIZE_SEQUENCE: TileSize[] = ['small', 'medium', 'large'];
const TILE_SIZE_LABEL: Record<TileSize, string> = {
    small: 'Klein',
    medium: 'Mittel',
    large: 'Groß',
};

function isTileSize(value: unknown): value is TileSize {
    return value === 'small' || value === 'medium' || value === 'large';
}

function cloneLayout(layout: DashboardLayoutState): DashboardLayoutState {
    return JSON.parse(JSON.stringify(layout)) as DashboardLayoutState;
}

function normalizeLayoutResponse(tiles: unknown): DashboardLayoutState {
    if (!tiles || typeof tiles !== 'object' || Array.isArray(tiles)) {
        return {};
    }

    const normalized: DashboardLayoutState = {};
    for (const [tileKey, rawConfig] of Object.entries(tiles as Record<string, unknown>)) {
        if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) continue;
        const config = rawConfig as Record<string, unknown>;
        normalized[tileKey] = {
            order: Number.isFinite(Number(config.order)) ? Math.max(0, Math.round(Number(config.order))) : 0,
            size: isTileSize(config.size) ? config.size : 'medium',
            visible: config.visible !== false,
        };
    }

    return normalized;
}

function resolveTileLayout(tile: DashboardTileDefinition, layout: DashboardLayoutState): TileLayout {
    const stored = layout[tile.key];
    return {
        order: stored?.order ?? tile.defaultOrder,
        size: stored?.size ?? tile.defaultSize,
        visible: stored?.visible ?? tile.defaultVisible,
    };
}


function NotificationTileContent() {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<{ id: number; title: string; type: string; link?: string; is_read: boolean; created_at: string }[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        apiFetch('/api/auth/notifications').then(async (res) => {
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications?.slice(0, 5) || []);
                setUnreadCount(data.unreadCount || 0);
            }
        }).catch(() => { });
    }, []);

    const typeColor: Record<string, string> = { info: 'var(--color-primary)', success: '#22c55e', warning: '#f59e0b', error: '#ef4444' };

    const timeAgo = (d: string) => {
        const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
        if (mins < 1) return 'gerade eben';
        if (mins < 60) return `vor ${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `vor ${hrs}h`;
        return `vor ${Math.floor(hrs / 24)}d`;
    };

    return (
        <div>
            {unreadCount > 0 && (
                <div style={{ marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                    <span className="badge badge-primary">{unreadCount} ungelesen</span>
                </div>
            )}
            {notifications.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>Keine Benachrichtigungen</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {notifications.map((n) => (
                        <div
                            key={n.id}
                            onClick={() => n.link?.startsWith('/') && navigate(n.link)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '4px 0', cursor: n.link ? 'pointer' : 'default',
                                opacity: n.is_read ? 0.6 : 1,
                            }}
                        >
                            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, backgroundColor: n.is_read ? 'transparent' : (typeColor[n.type] || 'var(--color-primary)') }} />
                            <span style={{ fontSize: 'var(--font-size-sm)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: n.is_read ? 400 : 600 }}>{n.title}</span>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>{timeAgo(n.created_at)}</span>
                        </div>
                    ))}
                </div>
            )}
            <button
                onClick={() => navigate('/notifications')}
                style={{ marginTop: 'var(--space-sm)', background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', padding: 0 }}
            >
                Alle Benachrichtigungen →
            </button>
        </div>
    );
}

export function Dashboard() {
    const { user } = useAuth();
    const [layout, setLayout] = useState<DashboardLayoutState>({});
    const [editSnapshot, setEditSnapshot] = useState<DashboardLayoutState | null>(null);
    const [loadingLayout, setLoadingLayout] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dragTileKey, setDragTileKey] = useState<string | null>(null);
    const [error, setError] = useState('');

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    const welcomeName = fullName || user?.displayName || user?.username || 'Benutzer';

    const coreTiles = useMemo<DashboardTileDefinition[]>(() => ([
        {
            key: 'core.system-status',
            title: 'Systemstatus',
            description: 'Core-Dienststatus',
            defaultOrder: 10,
            defaultSize: 'small',
            defaultVisible: true,
            render: () => (
                <span className="badge badge-success">● Online</span>
            ),
        },
        {
            key: 'core.plugins',
            title: 'Aktive Plugins',
            description: 'Geladene Frontend-Module',
            defaultOrder: 20,
            defaultSize: 'small',
            defaultVisible: true,
            render: () => (
                <p className="text-muted">
                    {pluginRegistry.length} aktive Plugin-Module
                </p>
            ),
        },
        {
            key: 'core.current-user',
            title: 'Benutzer',
            description: 'Aktuelle Anmeldung',
            defaultOrder: 30,
            defaultSize: 'small',
            defaultVisible: true,
            render: () => (
                <p className="text-muted">
                    Eingeloggt als <strong>{welcomeName}</strong>
                </p>
            ),
        },
        {
            key: 'core.notifications',
            title: 'Benachrichtigungen',
            defaultOrder: 40,
            defaultSize: 'medium',
            defaultVisible: true,
            render: () => <NotificationTileContent />,
        },
    ]), [welcomeName]);

    const pluginTiles = useMemo<DashboardTileDefinition[]>(
        () => pluginRegistry.flatMap((entry, entryIndex) =>
            entry.dashboardTiles.map((tile, tileIndex) => ({
                key: `plugin.${entry.id}.${tile.id}`,
                title: tile.title,
                description: tile.description || `Kachel aus Plugin "${entry.name}"`,
                permission: tile.permission,
                defaultOrder: tile.order ?? (200 + entryIndex * 100 + tileIndex),
                defaultSize: tile.defaultSize || 'medium',
                defaultVisible: tile.defaultVisible !== false,
                component: tile.component,
            }))
        ),
        []
    );

    const hasPermission = (permission?: string): boolean => {
        if (!permission) return true;
        if (!user) return false;
        return user.permissions.includes('*') || user.permissions.includes(permission);
    };

    const allTiles = useMemo(
        () => [...coreTiles, ...pluginTiles].filter((tile) => hasPermission(tile.permission)),
        [coreTiles, pluginTiles, user]
    );

    const tileByKey = useMemo(
        () => new Map(allTiles.map((tile) => [tile.key, tile])),
        [allTiles]
    );

    const orderedTiles = useMemo(
        () => allTiles
            .map((tile) => ({ tile, config: resolveTileLayout(tile, layout) }))
            .sort((a, b) => (a.config.order - b.config.order) || a.tile.title.localeCompare(b.tile.title)),
        [allTiles, layout]
    );

    const visibleTiles = useMemo(
        () => orderedTiles.filter((entry) => entry.config.visible),
        [orderedTiles]
    );

    const managementTiles = useMemo(
        () => [...orderedTiles]
            .sort((a, b) => a.tile.title.localeCompare(b.tile.title, 'de', { sensitivity: 'base' })),
        [orderedTiles]
    );

    useEffect(() => {
        let active = true;

        async function loadLayout() {
            setLoadingLayout(true);
            try {
                const res = await apiFetch('/api/auth/dashboard-layout');
                if (!active) return;
                if (!res.ok) {
                    setError('Dashboard-Einstellungen konnten nicht geladen werden.');
                    setLayout({});
                    return;
                }

                const data = await res.json() as { tiles?: unknown };
                setLayout(normalizeLayoutResponse(data.tiles));
                setError('');
            } catch {
                if (!active) return;
                setError('Dashboard-Einstellungen konnten nicht geladen werden.');
                setLayout({});
            } finally {
                if (active) {
                    setLoadingLayout(false);
                }
            }
        }

        void loadLayout();
        return () => {
            active = false;
        };
    }, [user?.id]);

    const updateTileLayout = (tileKey: string, updater: (current: TileLayout) => TileLayout) => {
        setLayout((prev) => {
            const tile = tileByKey.get(tileKey);
            if (!tile) return prev;
            const current = resolveTileLayout(tile, prev);
            return {
                ...prev,
                [tileKey]: updater(current),
            };
        });
    };

    const toggleTileVisibility = (tileKey: string) => {
        setLayout((prev) => {
            const tile = tileByKey.get(tileKey);
            if (!tile) return prev;

            const current = resolveTileLayout(tile, prev);
            if (current.visible) {
                return {
                    ...prev,
                    [tileKey]: {
                        ...current,
                        visible: false,
                    },
                };
            }

            const maxVisibleOrder = allTiles.reduce((max, candidate) => {
                const cfg = resolveTileLayout(candidate, prev);
                return cfg.visible ? Math.max(max, cfg.order) : max;
            }, -1);

            return {
                ...prev,
                [tileKey]: {
                    ...current,
                    visible: true,
                    order: maxVisibleOrder + 1,
                },
            };
        });
    };

    const changeTileSize = (tileKey: string, direction: -1 | 1) => {
        updateTileLayout(tileKey, (current) => {
            const currentIndex = TILE_SIZE_SEQUENCE.indexOf(current.size);
            const nextIndex = Math.min(
                TILE_SIZE_SEQUENCE.length - 1,
                Math.max(0, currentIndex + direction)
            );
            return {
                ...current,
                size: TILE_SIZE_SEQUENCE[nextIndex],
            };
        });
    };

    const reorderVisibleTiles = (orderedKeys: string[]) => {
        setLayout((prev) => {
            const next = { ...prev };
            orderedKeys.forEach((tileKey, index) => {
                const tile = tileByKey.get(tileKey);
                if (!tile) return;
                const current = resolveTileLayout(tile, prev);
                next[tileKey] = {
                    ...current,
                    order: index,
                };
            });
            return next;
        });
    };

    const handleDropOnTile = (targetTileKey: string) => {
        if (!dragTileKey || dragTileKey === targetTileKey) return;

        const orderedKeys = visibleTiles.map((entry) => entry.tile.key);
        const sourceIndex = orderedKeys.indexOf(dragTileKey);
        const targetIndex = orderedKeys.indexOf(targetTileKey);
        if (sourceIndex === -1 || targetIndex === -1) return;

        const reordered = [...orderedKeys];
        reordered.splice(sourceIndex, 1);
        reordered.splice(targetIndex, 0, dragTileKey);
        reorderVisibleTiles(reordered);
    };

    const startEditing = () => {
        setEditSnapshot(cloneLayout(layout));
        setEditMode(true);
        setError('');
    };

    const cancelEditing = () => {
        if (editSnapshot) {
            setLayout(editSnapshot);
        }
        setEditMode(false);
        setEditSnapshot(null);
        setDragTileKey(null);
    };

    const saveLayout = async () => {
        setSaving(true);
        try {
            const res = await apiFetch('/api/auth/dashboard-layout', {
                method: 'PUT',
                body: JSON.stringify({ tiles: layout }),
            });

            if (!res.ok) {
                setError('Dashboard-Einstellungen konnten nicht gespeichert werden.');
                return;
            }

            const data = await res.json() as { tiles?: unknown };
            setLayout(normalizeLayoutResponse(data.tiles));
            setEditMode(false);
            setEditSnapshot(null);
            setDragTileKey(null);
            setError('');
        } catch {
            setError('Dashboard-Einstellungen konnten nicht gespeichert werden.');
        } finally {
            setSaving(false);
        }
    };

    if (loadingLayout) {
        return <div className="text-muted">Dashboard wird geladen...</div>;
    }

    return (
        <div>
            <div className="page-header dashboard-page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Willkommen zurück, {welcomeName}!</p>
                </div>

                <div className="dashboard-edit-actions">
                    {!editMode ? (
                        <button className="btn btn-secondary" onClick={startEditing}>
                            Bearbeiten
                        </button>
                    ) : (
                        <>
                            <button className="btn btn-secondary" onClick={cancelEditing} disabled={saving}>
                                Abbrechen
                            </button>
                            <button className="btn btn-primary" onClick={saveLayout} disabled={saving}>
                                {saving ? 'Speichern...' : 'Speichern'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="modal-alert" style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)', marginBottom: 'var(--space-md)' }}>
                    {error}
                </div>
            )}

            {editMode && (
                <div className="card dashboard-edit-panel">
                    <div className="card-title">Kachelverwaltung</div>
                    <p className="text-muted mt-md">
                        Kacheln ein- oder ausblenden, Größe ändern und per Drag & Drop neu sortieren.
                    </p>
                    <div className="dashboard-toggle-grid mt-md">
                        {managementTiles.map(({ tile, config }) => (
                            <label key={`toggle-${tile.key}`} className="dashboard-toggle-item">
                                <input
                                    type="checkbox"
                                    checked={config.visible}
                                    onChange={() => toggleTileVisibility(tile.key)}
                                />
                                <span className="dashboard-toggle-title">{tile.title}</span>
                                <span className={`badge ${config.visible ? 'badge-success' : 'badge-warning'}`}>
                                    {config.visible ? 'Sichtbar' : 'Ausgeblendet'}
                                </span>
                                <span className="text-muted">{TILE_SIZE_LABEL[config.size]}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {visibleTiles.length === 0 ? (
                <div className="card">
                    <p className="text-muted">Keine sichtbaren Kacheln. Im Bearbeiten-Modus können Kacheln wieder eingeblendet werden.</p>
                </div>
            ) : (
                <div className="dashboard-grid">
                    {visibleTiles.map(({ tile, config }) => {
                        const TileComponent = tile.component;
                        return (
                            <section
                                key={tile.key}
                                className={`card dashboard-tile dashboard-tile-${config.size}${editMode ? ' dashboard-tile-editing' : ''}${dragTileKey === tile.key ? ' dashboard-tile-dragging' : ''}`}
                                draggable={editMode}
                                onDragStart={() => setDragTileKey(tile.key)}
                                onDragOver={(event) => {
                                    if (!editMode) return;
                                    event.preventDefault();
                                }}
                                onDrop={(event) => {
                                    if (!editMode) return;
                                    event.preventDefault();
                                    handleDropOnTile(tile.key);
                                    setDragTileKey(null);
                                }}
                                onDragEnd={() => setDragTileKey(null)}
                            >
                                <div className="dashboard-tile-header">
                                    <div>
                                        <div className="card-title">{tile.title}</div>
                                        {tile.description && (
                                            <p className="dashboard-tile-subtitle">{tile.description}</p>
                                        )}
                                    </div>

                                    {editMode && (
                                        <div className="dashboard-tile-edit-controls">
                                            <button
                                                className="btn btn-secondary btn-sm icon-only-btn"
                                                onClick={() => changeTileSize(tile.key, -1)}
                                                title="Verkleinern"
                                                aria-label="Verkleinern"
                                            >
                                                -
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm icon-only-btn"
                                                onClick={() => changeTileSize(tile.key, 1)}
                                                title="Vergrößern"
                                                aria-label="Vergrößern"
                                            >
                                                +
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => toggleTileVisibility(tile.key)}
                                            >
                                                Ausblenden
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="dashboard-tile-body">
                                    {TileComponent ? (
                                        <Suspense fallback={<div className="text-muted">Kachel wird geladen...</div>}>
                                            <TileComponent />
                                        </Suspense>
                                    ) : (
                                        tile.render?.()
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
