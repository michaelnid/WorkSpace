import { lazy } from 'react';

const NoteList = lazy(() => import('./pages/NoteList'));
const NoteStatsTile = lazy(() => import('./tiles/NoteStatsTile'));

export const routes = [
    { path: 'example', component: NoteList, permission: 'example.view' },
];

export const navItems = [
    {
        label: 'Notizen',
        icon: 'N',
        path: '/example',
        permission: 'example.view',
        order: 200,
        // Optionale Untermenü-Gruppierung:
        // group: 'Mein Plugin',       // Gruppenname in der Sidebar
        // groupIcon: '📦',            // Icon der Gruppe (nur 1x pro Gruppe nötig)
        // groupOrder: 100,            // Sortierung der Gruppe
    },
];

export const dashboardTiles = [
    {
        id: 'notes-overview',
        title: 'Notizen',
        description: 'Anzahl der Notizen im aktiven Mandanten',
        component: NoteStatsTile,
        permission: 'example.view',
        order: 220,
        defaultSize: 'small',
        defaultVisible: true,
    },
];

// Cross-Plugin Extension Tiles
// Kacheln, die in den Ansichten anderer Plugins angezeigt werden.
// Aktivieren, wenn ein Ziel-Plugin mit dem entsprechenden Slot existiert.
//
// export const extensionTiles = [
//     {
//         id: 'recent-notes',
//         targetSlot: 'kunden.detail',
//         title: 'Letzte Notizen',
//         description: 'Notizen zu diesem Kunden',
//         component: lazy(() => import('./tiles/NoteStatsTile')),
//         permission: 'example.view',
//         order: 100,
//         defaultSize: 'medium',
//     },
// ];

// Plugin-Einstellungen
// Wenn aktiviert, erscheint dieses Panel auf der Admin-Einstellungsseite.
//
// export const settingsPanel = {
//     component: lazy(() => import('./pages/SettingsPanel')),
//     permission: 'settings.manage',
// };

// Globale Suche
// Ermöglicht es dem Plugin, Ergebnisse in der globalen Suche bereitzustellen.
//
// export const searchProvider = {
//     label: 'Notizen',
//     permission: 'example.view',
//     search: async (query: string) => {
//         const res = await apiFetch(`/api/plugins/example/search?q=${encodeURIComponent(query)}`);
//         if (!res.ok) return [];
//         return (await res.json()).map((item: any) => ({
//             title: item.title,
//             description: item.preview,
//             path: `/example/notes/${item.id}`,
//         }));
//     },
// };
