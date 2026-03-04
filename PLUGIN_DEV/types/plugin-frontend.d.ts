/**
 * MIKE WorkSpace – Frontend Plugin Types
 *
 * Diese Typen beschreiben das Interface, das jedes Plugin
 * in seiner frontend/index.tsx exportieren muss.
 */

import type { ComponentType, LazyExoticComponent } from 'react';

// --- Routen ---

export interface PluginRoute {
    path: string;
    component: LazyExoticComponent<ComponentType<any>>;
    permission?: string;
}

// --- Navigation ---

export interface PluginNavItem {
    label: string;
    icon: string;              // Inline-SVG-String (KEIN Emoji!)
    path: string;
    permission?: string;
    order: number;
    group?: string;            // Gruppenname fuer Untermenue
    groupIcon?: string;        // SVG-Icon der Gruppe
    groupOrder?: number;       // Sortierung der Gruppe
}

// --- Dashboard-Tiles ---

export interface PluginDashboardTile {
    id: string;
    title: string;
    description?: string;
    component: LazyExoticComponent<ComponentType<any>>;
    permission?: string;
    order?: number;
    defaultSize?: 'small' | 'medium' | 'large';
    defaultVisible?: boolean;
}

// --- Extension-Tiles (Fremdseiten-Erweiterungen) ---

export interface PluginExtensionTile {
    id: string;
    targetSlot: string;        // z.B. 'dashboard.detail' oder Plugin-Slot
    title: string;
    description?: string;
    component: LazyExoticComponent<ComponentType<any>>;
    permission?: string;
    order?: number;
    defaultSize?: 'small' | 'medium' | 'large';
}

// --- Settings-Panel ---

export interface PluginSettingsPanel {
    component: LazyExoticComponent<ComponentType<any>>;
    permission?: string;
}

// --- Suche ---

export interface PluginSearchResult {
    title: string;
    description?: string;
    path: string;
    icon?: string;             // Inline-SVG-String
}

export interface PluginSearchProvider {
    label: string;
    search: (query: string) => Promise<PluginSearchResult[]>;
    permission?: string;
}

// --- Quick Actions ---

export interface PluginQuickAction {
    id: string;                // Format: pluginId.action-name
    label: string;
    icon?: string;             // Inline-SVG-String (KEIN Emoji!)
    keywords?: string[];       // Suchbegriffe
    permission?: string;
    execute: () => void | Promise<void>;
}

// --- Registry-Eintrag (was der Core von jedem Plugin erwartet) ---

export interface PluginRegistryEntry {
    id: string;
    name: string;
    routes: PluginRoute[];
    navItems: PluginNavItem[];
    dashboardTiles: PluginDashboardTile[];
    extensionTiles: PluginExtensionTile[];
    settingsPanel?: PluginSettingsPanel;
    searchProvider?: PluginSearchProvider;
    quickActions?: PluginQuickAction[];
}
