# MIKE WorkSpace - Plugin-Entwicklungshandbuch

Dieses Dokument beschreibt die aktuellen, verbindlichen Anforderungen für Plugins in MIKE.
Stand: entsprechend dem aktuellen Core-Code (Mandantensystem, Admin-Refactoring, Audit-Filter).

---

## 1. Zielbild

Plugins erweitern MIKE WorkSpace um fachliche Module.  
Wichtig: Der Mandanten-Switcher betrifft in erster Linie **Plugin-Businessdaten** (Unternehmensdaten, Dokumente, Datensätze im Plugin), nicht die globale Admin-Grundverwaltung.

---

## 2. Struktur eines Plugins

```text
plugins/
  mein-plugin/
    plugin.json
    backend/
      index.ts
      routes.ts
      migrations/
        001_create_tables.ts
    frontend/
      index.tsx
      pages/
        ItemList.tsx
```

Hinweis: Plugin-Ordner mit führendem Unterstrich (z. B. `_example`) gelten als Templates.
Sie werden weder in die Frontend-Plugin-Registry aufgenommen noch vom zentralen `build.sh` als Release-Plugin paketiert.
Das offizielle Referenz-Template liegt unter `PLUGIN_DEV/beispiel-plugin`.

---

## 3. `plugin.json`

### 3.1 Felder (Ist-Stand)

### Vom Loader zwingend benötigt

- `id`
- `backend_entry` – **muss innerhalb des Plugin-Verzeichnisses liegen** (Pfade wie `../../` werden blockiert)

### Für Frontend-Registry zwingend benötigt

- `frontend_entry`

### Für Runtime/Qualität zwingend empfohlen

- `name`
- `version`
- `description`
- `author`
- `dependencies`
- `permissions`

### Dokumentationsfelder (intern verbindlich, technisch aktuell nicht vollständig erzwungen)

- `schema`
- `api`
- `provides`
- `uses`

### Optional/Legacy-Metadaten

- `nav_icon`
- `nav_label`
- `nav_order`
- `settings_page`

Hinweis: Die Sidebar-Navigation kommt technisch aus `frontend/index.tsx` (`navItems`), nicht direkt aus `plugin.json`.

### 3.2 Beispiel

```json
{
  "id": "mein-plugin",
  "name": "Mein Plugin",
  "version": "1.0.0",
  "description": "Beschreibung",
  "author": "Team",
  "dependencies": [],
  "backend_entry": "backend/index.ts",
  "frontend_entry": "frontend/index.tsx",
  "permissions": [
    "mein-plugin.view",
    "mein-plugin.create",
    "mein-plugin.edit",
    "mein-plugin.delete"
  ],
  "schema": {
    "mein_plugin_items": {
      "description": "Haupttabelle",
      "columns": {
        "id": { "type": "increments", "primary": true },
        "tenant_id": { "type": "integer", "unsigned": true, "nullable": false, "references": "tenants.id" },
        "name": { "type": "string", "length": 200, "nullable": false },
        "created_at": { "type": "timestamp", "nullable": false, "default": "now()" }
      }
    }
  },
  "api": [
    { "method": "GET", "path": "/items", "permission": "mein-plugin.view", "description": "Items lesen" }
  ],
  "provides": ["mein-plugin.item.created"],
  "uses": {}
}
```

---

## 4. Mandantenregeln (sehr wichtig)

### 4.1 Scope des Mandanten-Switchers

- Der aktive Mandant kommt aus `request.user.tenantId`.
- Plugin-Businessdaten müssen mandantengetrennt sein.
- Core-Admin-Bereiche (Benutzer, Rollen, globale Einstellungen, globales Audit) sind davon entkoppelt.

### 4.2 Pflicht für Plugin-Datenmodell

- Jede plugin-eigene Business-Tabelle hat `tenant_id` (FK auf `tenants.id`).
- Jede Abfrage und jede Mutation muss mandantengetrennt sein.
- **Nutze immer die zentralen Tenant-Helpers** (ab v1.13.0):

| Helper | Zweck |
|---|---|
| `fastify.scopedQuery(query, request)` | Fügt automatisch `.where('tenant_id', ...)` hinzu. Super-Admin (*) sieht alles. |
| `fastify.scopedInsert(data, request)` | Setzt `tenant_id` automatisch aus dem JWT-Token. |
| `fastify.requireTenantId(request)` | Gibt Tenant-ID zurück oder wirft Fehler. |
| `fastify.isSuperAdmin(request)` | Prüft ob User Super-Admin ist (Permission `*`). |

```ts
// ✅ RICHTIG – scopedQuery nutzen:
const items = await fastify.scopedQuery(fastify.db('mein_plugin_items'), request)
  .orderBy('created_at', 'desc');

// ❌ FALSCH – manueller tenant_id-Filter (fehleranfällig):
const items = await fastify.db('mein_plugin_items')
  .where('tenant_id', request.user.tenantId)
  .orderBy('created_at', 'desc');
```

### 4.3 Cross-Plugin im Mandantenkontext

- Joins auf fremde Plugin-Tabellen nur mit konsistentem Tenant-Filter.
- Keine mandantenübergreifenden Plugin-Joins.

---

## 5. Backend-Implementierung

### 5.1 `backend/index.ts`

```ts
import { FastifyInstance } from 'fastify';
import routes from './routes.js';

export default async function meinPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(routes);
}
```

### 5.2 `backend/routes.ts` (Beispiel, tenant-sicher)

```ts
import { FastifyInstance } from 'fastify';

export default async function routes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/items', {
    preHandler: [fastify.requirePermission('mein-plugin.view')]
  }, async (request, reply) => {
    // scopedQuery filtert automatisch nach tenant_id
    const items = await fastify.scopedQuery(fastify.db('mein_plugin_items'), request)
      .orderBy('created_at', 'desc');
    return reply.send(items);
  });

  fastify.post('/items', {
    preHandler: [fastify.requirePermission('mein-plugin.create')]
  }, async (request, reply) => {
    const { name } = request.body as { name: string };

    // scopedInsert setzt tenant_id automatisch
    const [id] = await fastify.db('mein_plugin_items').insert(
      fastify.scopedInsert({ name, created_at: new Date() }, request)
    );

    await fastify.audit.log({
      action: 'mein-plugin.item.created',
      category: 'plugin',
      entityType: 'mein_plugin_items',
      entityId: id,
      newState: { name },
      pluginId: 'mein-plugin'
    }, request);

    return reply.status(201).send({ id });
  });
}
```

### 5.3 Migration (tenant-fähig)

```ts
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('mein_plugin_items', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('name', 200).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['tenant_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mein_plugin_items');
}
```

### 5.4 Plugin-Lifecycle-Hooks (ab v1.14.0)

Plugins können optionale Lifecycle-Hooks exportieren:

```ts
// backend/index.ts
import { FastifyInstance } from 'fastify';

export default async function meinPlugin(fastify: FastifyInstance): Promise<void> {
  // Normale Plugin-Registrierung...
}

/** Wird beim erstmaligen Laden aufgerufen */
export async function onInstall(fastify: FastifyInstance, db: any): Promise<void> {
  console.log('Plugin erstmalig installiert!');
  // z.B. Initialwerte in die DB schreiben
}

/** Wird bei Version-Upgrade aufgerufen */
export async function onUpgrade(fastify: FastifyInstance, db: any, fromVersion: string): Promise<void> {
  console.log(`Upgrade von ${fromVersion}`);
  // z.B. Daten-Migrationen, Cleanup
}

/** Wird bei Deinstallation aufgerufen */
export async function onUninstall(fastify: FastifyInstance, db: any): Promise<void> {
  console.log('Plugin wird deinstalliert');
  // z.B. Plugin-Daten bereinigen
}
```

**Regeln:**
- Hooks sind **optional** – nur exportieren was gebraucht wird
- Fehler in Hooks werden geloggt, blockieren aber den Prozess nicht
- `fromVersion` bei `onUpgrade` kommt aus der `plugins.installed_version` Spalte
- Migrationen laufen **vor** den Lifecycle-Hooks
- `onUninstall` wird beim Entfernen über den Update-Flow ausgeführt (nicht beim Aktivieren/Deaktivieren per Toggle)

### 5.5 Request-Validation mit Zod (ab v1.14.0)

Der Core stellt `fastify.validation.validateBody()`, `validateQuery()` und `validateParams()` als preHandler bereit:

```ts
const { z, validateBody } = fastify.validation;

const createItemSchema = z.object({
  name: z.string().min(1, 'Name darf nicht leer sein').max(200),
  description: z.string().optional(),
  priority: z.number().min(1).max(5).optional(),
});

fastify.post('/items', {
  preHandler: [
    fastify.requirePermission('mein-plugin.create'),
    validateBody(createItemSchema),
  ]
}, async (request, reply) => {
  // Validierte Daten – typsicher!
  const data = (request as any).validated;
  // data.name → string, data.description → string | undefined
});
```

**Fehlerformat bei 422:**
```json
{
  "error": "Validierungsfehler",
  "details": {
    "name": ["Name darf nicht leer sein"],
    "priority": ["Zahl muss mindestens 1 sein"]
  }
}
```

### 5.6 WebSocket Push (ab v1.14.0)

Plugins können Live-Updates an verbundene Clients senden:

```ts
// An einen bestimmten User
fastify.ws.sendToUser(userId, {
  type: 'mein-plugin.item.updated',
  data: { id: 42, name: 'Neu' }
});

// An alle Clients eines Mandanten
fastify.ws.sendToTenant(tenantId, {
  type: 'mein-plugin.refresh',
  data: {}
});

// An alle verbundenen Clients
fastify.ws.broadcast({
  type: 'mein-plugin.announcement',
  data: { message: 'Wartung in 5 Minuten' }
});

// Anzahl aktiver Clients
const active = fastify.ws.clientCount();
```

**Client-Verbindung:**
```js
const ws = new WebSocket(`ws://${location.host}/api/ws?token=${jwtToken}`);
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // msg.type = 'mein-plugin.item.updated'
  // msg.data = { id: 42, name: 'Neu' }
};
```

### 5.7 Enhanced Audit Log (ab v1.14.0)

Statt manuell `previousState`/`newState` zu bauen, nutze `auditChange()`:

```ts
// ❌ ALT – manuell Before/After:
const prev = await fastify.db('items').where('id', id).first();
await fastify.db('items').where('id', id).update(changes);
await fastify.audit.log({
  action: 'item.updated',
  category: 'plugin',
  previousState: prev,
  newState: changes,
}, request);

// ✅ NEU – auditChange (automatisch):
await fastify.auditChange({
  table: 'mein_plugin_items',
  id: itemId,
  action: 'mein-plugin.item.updated',
  category: 'plugin',
  changes: { name: 'Neuer Name', priority: 3 },
  request,
  pluginId: 'mein-plugin',
});
```

**Was `auditChange` automatisch macht:**
1. Holt den aktuellen Stand aus der DB
2. Berechnet den Diff (nur tatsächlich geänderte Felder)
3. Maskiert sensitive Felder (`password_hash` → `***`)
4. Loggt `previousState`, `newState` und `changedFields[]`
5. Überspringt den Log wenn nichts geändert wurde

### 5.8 CRUD-Generator (ab v1.15.0)

Ein Aufruf generiert 5 vollständige REST-Endpoints:

```ts
export default async function meinPlugin(fastify) {
  const { z } = fastify.validation;

  fastify.createCrudRoutes({
    table: 'mein_plugin_items',
    prefix: '/items',
    permission: 'mein-plugin',        // → .view, .create, .edit, .delete
    pluginId: 'mein-plugin',
    schema: z.object({
      name: z.string().min(1).max(200),
      priority: z.number().min(1).max(5).optional(),
    }),
    searchFields: ['name'],            // ?search=xyz
    defaultSort: { column: 'created_at', order: 'desc' },
    beforeCreate: (data, request) => ({ ...data, extra: 'wert' }),
    afterDelete: (id, request) => console.log(`Gelöscht: ${id}`),
  });
}
```

**Generierte Endpoints:**

| Method | Pfad | Beschreibung |
|--------|------|-------------|
| `GET` | `/items` | Liste mit Paginierung, Suche, Sortierung |
| `GET` | `/items/:id` | Einzelner Datensatz |
| `POST` | `/items` | Erstellen (Zod-validiert) |
| `PUT` | `/items/:id` | Update mit auditChange-Diff |
| `DELETE` | `/items/:id` | Löschen mit Audit-Log |

Eingebaut: Tenant-Scoping, Rechteprüfung, 422-Validation, Audit-Logging, LIKE-Wildcard-Escaping.

> **Sicherheitshinweis:** Der CRUD-Generator escaped SQL-Wildcards (`%`, `_`) in Suchbegriffen automatisch. **Plugins mit manuellen LIKE-Queries** müssen dies selbst sicherstellen:
>
> ```ts
> // ✅ RICHTIG – Wildcards escapen:
> const safeTerm = search.replace(/[%_\\]/g, '\\$&');
> query.where('name', 'like', `%${safeTerm}%`);
>
> // ❌ FALSCH – User-Input direkt in LIKE:
> query.where('name', 'like', `%${search}%`);
> ```

### 5.9 Plugin-Storage (ab v1.15.0)

Tenant-scoped Datei-Speicher für Plugins:

```ts
// Speichern
const file = await fastify.storage.save({
  pluginId: 'mein-plugin',
  filename: 'report.pdf',
  data: pdfBuffer,
  request,
  metadata: { type: 'report', year: 2026 },
});
// file.id → UUID referenz

// Lesen
const buffer = await fastify.storage.get(file.id);

// Auflisten (nur eigener Mandant)
const files = await fastify.storage.list('mein-plugin', request);

// Löschen
await fastify.storage.delete(file.id);
```

Pfad: `uploads/plugins/<pluginId>/<tenantId>/<uuid>.<ext>`

### 5.10 PDF-Export (ab v1.15.0)

Leichtgewichtiger PDF-Generator (kein Puppeteer):

```ts
// Einfache Tabelle
const pdf = await fastify.pdf.generateTable({
  title: 'Inventarliste',
  headers: ['Nr', 'Bezeichnung', 'Bestand'],
  rows: [['1', 'Schraube M8', '500'], ['2', 'Mutter M8', '320']],
  footer: 'Stand: ' + new Date().toLocaleDateString('de-DE'),
});

// Als Download senden
reply.header('Content-Type', 'application/pdf');
reply.header('Content-Disposition', 'attachment; filename="inventar.pdf"');
return reply.send(pdf);

// Oder im Storage ablegen
await fastify.storage.save({
  pluginId: 'mein-plugin',
  filename: 'inventar.pdf',
  data: pdf,
  request,
});
```

### 5.11 Plugin-Testing (ab v1.15.0)

Test-Framework mit gemockten Core-Services:

```ts
import { createTestApp } from '../testing/createTestApp.js';
import { describe, it, expect } from 'vitest';

describe('Mein Plugin', () => {
  it('listet Items auf', async () => {
    const { fastify } = await createTestApp({
      pluginPath: './plugins/mein-plugin',
      testUser: { userId: 1, username: 'admin', tenantId: 1, permissions: ['*'], sessionId: 1 },
      seedData: {
        mein_plugin_items: [
          { id: 1, name: 'Test', tenant_id: 1 },
        ],
      },
    });

    const res = await fastify.inject({ method: 'GET', url: '/items' });
    expect(res.statusCode).toBe(200);

    await fastify.close();
  });
});
```

**Gemockt:** DB (in-memory), Auth, Permissions, Audit, Events, WebSocket, Storage, PDF.

---

## 6. Frontend-Implementierung

### 6.1 `frontend/index.tsx` (Registry-Exports)

```tsx
import { lazy } from 'react';

const ItemList = lazy(() => import('./pages/ItemList'));

export const routes = [
  { path: 'mein-plugin', component: ItemList, permission: 'mein-plugin.view' }
];

export const navItems = [
  {
    label: 'Mein Plugin',
    icon: 'MP',
    path: '/mein-plugin',
    permission: 'mein-plugin.view',
    order: 100
  }
];
```

Hinweis:

- `routes` und `navItems` müssen Arrays sein.
- `icon` ist als `string` typisiert – **immer SVG-Strings verwenden, keine Emojis!**
- Wenn `route.permission` fehlt, versucht der Core die Permission über passendes `navItem.path` aufzulösen.

#### SVG-Icon Richtlinien

> **Regel:** Im gesamten Projekt werden **keine Emojis** als Icons verwendet. Stattdessen nutzen wir **Inline-SVG-Strings** im Feather-Icon-Stil.

**Template für ein Icon:**

```tsx
const myIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><!-- SVG-Pfade hier --></svg>';
```

**Häufig verwendete Icons (Copy & Paste):**

```tsx
// Benutzer
const userIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

// Mehrere Benutzer
const usersIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

// Plus
const plusIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

// Ordner
const folderIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

// Datei
const fileIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

// Paket/Box
const boxIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';

// Einstellungen/Zahnrad
const settingsIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// Mail
const mailIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
```

**Regeln:**
- Größe: `width="16" height="16"` (Standard) oder `width="18" height="18"` (Card-Titel)
- ViewBox: immer `viewBox="0 0 24 24"`
- Styling: `fill="none" stroke="currentColor" stroke-width="2"`
- Referenz: [feathericons.com](https://feathericons.com) für weitere Icons

#### Untermenüs (Gruppierung)

Plugins mit mehreren Seiten können ihre Menüpunkte unter einem ausklappbaren Gruppenmenü zusammenfassen:

```tsx
// SVG-Icon als String (Feather-Style, 16x16)
const usersIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
const fileIcon  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
const boxIcon   = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';

export const navItems = [
    { label: 'Kunden',     icon: usersIcon, path: '/erp/kunden',     group: 'ERP', groupIcon: boxIcon, groupOrder: 50, order: 10, permission: 'erp.view' },
    { label: 'Rechnungen', icon: fileIcon,  path: '/erp/rechnungen', group: 'ERP', order: 20, permission: 'erp.view' },
    { label: 'Lager',      icon: boxIcon,   path: '/erp/lager',      group: 'ERP', order: 30, permission: 'erp.view' },
];
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `group` | `string?` | Gruppenname – Items mit gleichem Namen werden zusammengefasst |
| `groupIcon` | `string?` | SVG-Icon-String der Gruppe (nur 1x pro Gruppe setzen) |
| `groupOrder` | `number?` | Sortierung der Gruppe relativ zu anderen Top-Level-Items |

> **Wichtig:** Verwende **keine Emojis** als Icons! Nutze immer **Inline-SVG-Strings** im Feather-Style (siehe Abschnitt "SVG-Icon Richtlinien" weiter unten).

**Ergebnis in der Sidebar:**
```
▶ ERP              ← ausklappbar
   Kunden
   Rechnungen
   Lager
```

**Verhalten:**
- Ohne `group` → normaler Top-Level-Menüpunkt (rückwärtskompatibel)
- Gruppe klappt automatisch auf, wenn eine Child-Route aktiv ist
- Auf-/Zu-Zustand wird im `localStorage` gespeichert
- Cross-Plugin-Gruppen sind möglich (gleicher `group`-Name)

### 6.2 Dashboard-Kacheln aus Plugins

Plugins können zusätzlich Kacheln für das Haupt-Dashboard bereitstellen.

Empfohlene Struktur:

```text
frontend/
  index.tsx
  pages/
    ItemList.tsx
  tiles/
    ItemTile.tsx
```

```tsx
import { lazy } from 'react';

const ItemTile = lazy(() => import('./tiles/ItemTile'));

export const dashboardTiles = [
  {
    id: 'mein-plugin-overview',
    title: 'Mein Plugin',
    description: 'Übersicht für den aktiven Mandanten',
    component: ItemTile,
    permission: 'mein-plugin.view',
    order: 220,
    defaultSize: 'small',
    defaultVisible: true
  }
];
```

Feldbedeutung von `dashboardTiles`:

| Feld | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `id` | `string` | Ja | Kachel-ID innerhalb des Plugins (z. B. `overview`) |
| `title` | `string` | Ja | Titel im Dashboard |
| `description` | `string` | Nein | Untertitel/Beschreibung |
| `component` | `lazy(...)` React-Komponente | Ja | Inhalt der Kachel |
| `permission` | `string` | Nein | Optionaler Rechte-Check für Sichtbarkeit |
| `order` | `number` | Nein | Start-Reihenfolge (Default) |
| `defaultSize` | `'small' | 'medium' | 'large'` | Nein | Startgröße (Default: `medium`) |
| `defaultVisible` | `boolean` | Nein | Start-Sichtbarkeit (Default: `true`) |

Regeln:

- `id` ist pro Plugin eindeutig.
- `component` ist eine lazy geladene React-Komponente.
- `permission` ist optional, aber empfohlen.
- Größe: `small`, `medium`, `large`.
- Reihenfolge/Sichtbarkeit sind nur Default-Werte; Benutzer können im Dashboard alles individuell anpassen.
- Der Core erzeugt den technischen Schlüssel je Kachel als `plugin.<pluginId>.<tileId>`.
- Wenn ein Benutzer die `permission` nicht hat, wird die Kachel für diesen Benutzer nicht angezeigt.
- Der Mandanten-Switch wirkt auf die von der Kachel geladenen Plugin-Daten (über normale API-Endpunkte).
- Layout-Speicherung erfolgt zentral im Core pro Benutzerkonto (`/api/auth/dashboard-layout`), nicht im Plugin selbst.

Beispiel für eine Kachel-Komponente:

```tsx
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../frontend/src/context/AuthContext';

export default function ItemTile() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      const res = await apiFetch('/api/plugins/mein-plugin/items');
      if (!res.ok || !active) return;
      const items = await res.json() as Array<{ id: number }>;
      setCount(items.length);
    }

    void load();
    return () => { active = false; };
  }, []);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-2xl)' }}>{count}</div>
      <p className="text-muted mt-md">Einträge im aktiven Mandanten</p>
    </div>
  );
}
```

### 6.3 UI-Rechte

- Für Buttons/Aktionen im Frontend weiterhin `PermissionGate` verwenden.
- Keine rein clientseitige Sicherheitslogik; Backend-Checks sind Pflicht.

### 6.4 Cross-Plugin Extension Tiles

Plugins können Kacheln nicht nur auf dem **Haupt-Dashboard** bereitstellen (→ `dashboardTiles`), sondern auch in den Ansichten **anderer Plugins**. So kann z. B. ein Ticketsystem eine „Offene Tickets"-Kachel auf der Kunden-Detailseite eines Kunden-Plugins anzeigen, ohne dass das Kunden-Plugin Code des Ticketsystems kennen muss.

#### Konzept

```text
  Ticketsystem-Plugin                    Kunden-Plugin
  ┌──────────────────┐                  ┌──────────────────────┐
  │ extensionTiles   │                  │ Kunden-Detail Page   │
  │ ┌──────────────┐ │   registriert   │ ┌──────────────────┐ │
  │ │ targetSlot:  │─┼────────────────►│ │ useExtensionTiles│ │
  │ │ 'kunden.     │ │      bei        │ │ ('kunden.detail')│ │
  │ │  detail'     │ │   Build-Zeit    │ │ → rendert Kachel │ │
  │ └──────────────┘ │                  │ └──────────────────┘ │
  └──────────────────┘                  └──────────────────────┘
```

- **Provider-Plugin** (z. B. Ticketsystem): Exportiert `extensionTiles` mit einem `targetSlot`.
- **Consumer-Plugin** (z. B. Kunden): Ruft `useExtensionTiles(slotName)` auf und rendert die fremden Kacheln.
- **Core**: Sammelt alle `extensionTiles` beim Build in der Plugin-Registry.

#### Provider-Seite: `extensionTiles` exportieren

Im `frontend/index.tsx` des Plugins, das Kacheln **bereitstellt**:

```tsx
import { lazy } from 'react';

const TicketsTile = lazy(() => import('./tiles/CustomerTicketsTile'));

export const extensionTiles = [
    {
        id: 'customer-tickets',
        targetSlot: 'kunden.detail',
        title: 'Offene Tickets',
        description: 'Tickets zu diesem Kunden',
        component: TicketsTile,
        permission: 'tickets.view',
        order: 100,
        defaultSize: 'medium',
    },
];
```

Felder:

| Feld | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `id` | `string` | Ja | Kachel-ID innerhalb des Plugins |
| `targetSlot` | `string` | Ja | Slot-Name im Ziel-Plugin (z. B. `kunden.detail`) |
| `title` | `string` | Ja | Titel der Kachel |
| `description` | `string` | Nein | Beschreibung/Untertitel |
| `component` | `lazy(...)` React-Komponente | Ja | Inhalt der Kachel |
| `permission` | `string` | Nein | Rechte-Check für Sichtbarkeit |
| `order` | `number` | Nein | Sortierreihenfolge (aufsteigend) |
| `defaultSize` | `'small' | 'medium' | 'large'` | Nein | Startgröße |

#### Consumer-Seite: Slot rendern mit `useExtensionTiles`

Im Plugin, das fremde Kacheln **empfängt** (z. B. Kunden-Plugin, Kunden-Detail-Page):

```tsx
import { Suspense } from 'react';
import { useExtensionTiles } from '../../../../frontend/src/hooks/useExtensionTiles';

export default function CustomerDetail({ customerId }: { customerId: string }) {
    const extensionTiles = useExtensionTiles('kunden.detail');

    return (
        <div>
            <h1>Kundendetails</h1>
            {/* ... eigene Plugin-Inhalte ... */}

            {/* Extension-Kacheln anderer Plugins */}
            {extensionTiles.length > 0 && (
                <div className="dashboard-grid mt-lg">
                    {extensionTiles.map((tile) => {
                        const TileComponent = tile.component;
                        return (
                            <section
                                key={tile.key}
                                className={`card dashboard-tile dashboard-tile-${tile.defaultSize || 'medium'}`}
                            >
                                <div className="dashboard-tile-header">
                                    <div className="card-title">{tile.title}</div>
                                    {tile.description && (
                                        <p className="dashboard-tile-subtitle">{tile.description}</p>
                                    )}
                                </div>
                                <div className="dashboard-tile-body">
                                    <Suspense fallback={<div className="text-muted">Laden...</div>}>
                                        <TileComponent />
                                    </Suspense>
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
```

#### Slot-Naming-Konvention

Slots werden nach dem Schema `<plugin-id>.<ansicht>` benannt:

| Slot-Name | Wo wird gerendert |
|---|---|
| `kunden.detail` | Kunden-Detailseite |
| `kunden.list` | Kunden-Listenansicht (Sidebar) |
| `tickets.detail` | Ticket-Detailseite |
| `projekte.overview` | Projekt-Übersicht |

Ein Plugin kann beliebig viele Slots definieren. Der Slot existiert implizit, sobald `useExtensionTiles(slotName)` aufgerufen wird.

#### Best Practices

1. **`dependencies` in `plugin.json` deklarieren**: Ein Plugin, das `extensionTiles` mit `targetSlot: 'kunden.detail'` exportiert, sollte `"dependencies": ["kunden"]` in `plugin.json` haben.
2. **`provides` / `uses` dokumentieren**: Provider: `"provides": ["kunden.detail.slot"]`. Consumer: `"uses": { "kunden": ["kunden.detail.slot"] }`.
3. **Permissions setzen**: Immer `permission` angeben, damit Benutzer ohne Rechte die Kachel nicht sehen.
4. **Kontext-Daten**: Kacheln laden ihre Daten über eigene API-Endpoints. Für kontextabhängige Kacheln (z. B. Tickets eines bestimmten Kunden) wird empfohlen, den Kontext über URL-Parameter oder einen Context-Provider zu übergeben.
5. **Fehlende Ziel-Plugins**: Wenn das Ziel-Plugin nicht installiert ist, werden die `extensionTiles` zwar registriert, aber nie gerendert – kein `useExtensionTiles`-Aufruf, kein Rendering. Das ist sicher.

### 6.5 Plugin-Einstellungen

Plugins können ein eigenes Einstellungs-Panel auf der Admin-Seite **Administration → Einstellungen** bereitstellen. Jedes Plugin bekommt dort eine eigene Karte.

#### Backend-API

Die Core-API bietet zwei Endpoints zum Lesen und Schreiben von Plugin-Settings:

| Methode | Endpoint | Beschreibung |
|---|---|---|
| `GET` | `/api/admin/settings/plugin/:pluginId` | Alle Einstellungen des Plugins (entschlüsselt) |
| `PUT` | `/api/admin/settings/plugin/:pluginId` | Eine Einstellung speichern (`{ key, value }`) |

Beide Endpoints benötigen die Permission `settings.manage`. Werte werden serverseitig verschlüsselt gespeichert.

#### Frontend: `settingsPanel` exportieren

Im `frontend/index.tsx` des Plugins:

```tsx
import { lazy } from 'react';

export const settingsPanel = {
    component: lazy(() => import('./pages/SettingsPanel')),
    permission: 'settings.manage',
};
```

#### Beispiel: Settings-Panel-Komponente

```tsx
// plugins/mein-plugin/frontend/pages/SettingsPanel.tsx
import { useState, useEffect } from 'react';
import { apiFetch } from '../../../../frontend/src/context/AuthContext';

const PLUGIN_ID = 'mein-plugin';

export default function SettingsPanel() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const res = await apiFetch(`/api/admin/settings/plugin/${PLUGIN_ID}`);
        if (res.ok) setSettings(await res.json());
    };

    const saveSetting = async (key: string, value: string) => {
        setSaving(true);
        setMessage('');
        const res = await apiFetch(`/api/admin/settings/plugin/${PLUGIN_ID}`, {
            method: 'PUT',
            body: JSON.stringify({ key, value }),
        });
        setSaving(false);
        if (res.ok) {
            setSettings((prev) => ({ ...prev, [key]: value }));
            setMessage('Gespeichert');
            setTimeout(() => setMessage(''), 2000);
        }
    };

    return (
        <div>
            <div className="form-group">
                <label className="form-label">API-Schlüssel</label>
                <input
                    type="text"
                    className="form-input"
                    value={settings['api_key'] || ''}
                    onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                    onBlur={() => saveSetting('api_key', settings['api_key'] || '')}
                />
            </div>
            <div className="form-group">
                <label className="form-label">Max. Einträge</label>
                <input
                    type="number"
                    className="form-input"
                    value={settings['max_entries'] || '100'}
                    onChange={(e) => setSettings({ ...settings, max_entries: e.target.value })}
                    onBlur={() => saveSetting('max_entries', settings['max_entries'] || '100')}
                />
            </div>
            {message && <p className="text-success mt-sm">{message}</p>}
            {saving && <p className="text-muted mt-sm">Speichern...</p>}
        </div>
    );
}
```

#### Settings im Backend lesen

Plugins können ihre eigenen Settings im Backend über die `settings`-Tabelle lesen:

```ts
const setting = await fastify.db('settings')
    .where({ key: 'api_key', plugin_id: 'mein-plugin' })
    .whereNull('tenant_id')
    .first();

const value = setting?.value_encrypted
    ? fastify.decrypt(setting.value_encrypted)
    : null;
```


### 6.6 Globale Suche

Die globale Suche (Cmd+K / Ctrl+K) im Top Bar sucht über alle Plugins hinweg. Plugins können ihre eigenen Daten als Suchergebnisse bereitstellen.

#### Frontend: `searchProvider` exportieren

Im `frontend/index.tsx` des Plugins:

```tsx
import { apiFetch } from '../../../../frontend/src/context/AuthContext';

export const searchProvider = {
    label: 'Tickets',              // Gruppenname in den Suchergebnissen
    permission: 'tickets.view',    // Nur Benutzer mit dieser Berechtigung sehen Ergebnisse
    search: async (query: string) => {
        const res = await apiFetch(`/api/plugins/ticketsystem/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return [];
        return (await res.json()).map((t: any) => ({
            title: t.nummer,
            description: t.betreff,
            path: `/tickets/${t.id}`,
        }));
    },
};
```

#### Rückgabeformat

Die `search(query)`-Funktion muss ein `Promise<PluginSearchResult[]>` zurückgeben:

```ts
interface PluginSearchResult {
    title: string;        // Haupttext (z. B. "TK-2024-001")
    description?: string; // Nebentext (z. B. "Druckerproblem Büro 3")
    path: string;         // Navigations-Pfad (z. B. "/tickets/42")
    icon?: string;        // Optional: SVG-Icon-String (Feather-Style, kein Emoji!)
}
```

#### Daten ausschließen

Wenn ein Plugin **keine** Suchergebnisse liefern soll, exportiere einfach keinen `searchProvider`. Die globale Suche ignoriert Plugins ohne diesen Export.

#### Backend: Such-Endpoint

Plugins müssen ihren eigenen Such-Endpoint bereitstellen:

```ts
// plugins/mein-plugin/backend/routes.ts
fastify.get('/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q || q.length < 2) return reply.send([]);

    const results = await fastify.db('mein_plugin_tabelle')
        .where('title', 'like', `%${q}%`)
        .limit(5)
        .select('id', 'title', 'preview');

    return reply.send(results);
});
```


---

### 6.7 Event Bus (Plugin-zu-Plugin-Kommunikation)

Der Core stellt einen in-process Event Bus bereit, über den Plugins miteinander kommunizieren können:

```ts
// Event senden
fastify.events.emit({
    event: 'mein-plugin.bestellung.erstellt',
    data: { bestellungId: 42, kunde: 'ACME' },
    request, // optional – befüllt userId/tenantId automatisch
});

// Event empfangen (im register-Hook)
fastify.events.on('erp.rechnung.erstellt', async (payload, meta) => {
    console.log(`Rechnung erstellt von User ${meta.userId}`, payload);
});
```

**Vordefinierte Core-Events:**

| Event | Daten |
|---|---|
| `user.created` | `{ userId, username, email }` |
| `user.updated` | `{ userId, username }` |
| `user.deleted` | `{ userId, username }` |
| `webhook.created` | `{ webhookId, name }` |

**Wildcard-Listener:** `fastify.events.on('*', handler)` empfängt alle Events (intern für Webhooks genutzt).

---

### 6.8 Webhooks

Webhooks werden vom Admin konfiguriert und reagieren automatisch auf Event-Bus-Events.

**Admin-Endpoints:** (Permission: `webhooks.manage`)

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/admin/webhooks` | Alle Webhooks |
| `POST` | `/api/admin/webhooks` | Webhook erstellen |
| `PUT` | `/api/admin/webhooks/:id` | Bearbeiten |
| `DELETE` | `/api/admin/webhooks/:id` | Löschen |
| `GET` | `/api/admin/webhooks/:id/logs` | Letzte 50 Logs |
| `POST` | `/api/admin/webhooks/:id/test` | Test-Event senden |

**Event-Matching:** Webhooks unterstützen exakte und Wildcard-Events:
- `user.created` – nur dieses Event
- `user.*` – alle user-Events
- `*` – alle Events

**Signatur:** Jeder POST enthält `X-Webhook-Signature: sha256=<hmac>` für Verifizierung.

**Sicherheitshinweise:**
- Webhook-URLs müssen extern erreichbar sein (keine internen IPs wie `192.168.x`, `10.x`, `localhost`)
- Webhook-Secrets werden verschlüsselt in der Datenbank gespeichert
- Payloads enthalten **keine** internen Metadaten (`userId`, `tenantId`) – nur die Event-Daten
- Webhooks sind mandantengetrennt: Events eines Mandanten triggern nur dessen Webhooks

---

### 6.9 Benachrichtigungen

Plugins können In-App-Benachrichtigungen an Benutzer senden:

```ts
// Einzelner Benutzer
await fastify.notify.send(userId, {
    title: 'Neue Bestellung',
    message: 'Bestellung #42 ist eingegangen',
    link: '/erp/bestellungen/42',
    type: 'success', // 'info' | 'success' | 'warning' | 'error'
    pluginId: 'erp',
});

// Mehrere Benutzer
await fastify.notify.sendToMany([1, 2, 3], {
    title: 'System-Update',
    type: 'info',
});
```

**Frontend:** Die Glocke in der Top-Bar zeigt automatisch neue Benachrichtigungen via SSE (Server-Sent Events).

> **Wichtig:** Der `link`-Parameter muss ein relativer Pfad sein (z.B. `/erp/bestellungen/42`). Externe URLs oder `javascript:` werden aus Sicherheitsgründen ignoriert.

> **Architektur-Hinweis (`fp()` vs. Routen):** Der Notification-Decorator (`fastify.notify`) verwendet `fastify-plugin` (`fp()`), damit er in allen Plugin-Kontexten zugänglich ist. Die HTTP-Routen (`/notifications`, `/notifications/stream`, etc.) sind jedoch **ohne** `fp()` registriert. Der Grund: `fp()` bricht die Fastify-Kapselung auf – Routen, die mit `fp()` gewrappt werden, verlieren den `prefix` aus `fastify.register()`. **Plugins müssen dieses Muster einhalten:** Decorators mit `fp()`, Routen **ohne** `fp()`.

**API-Endpoints:**

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/auth/notifications` | Letzte 30 Benachrichtigungen + Unread-Count |
| `PUT` | `/api/auth/notifications/:id/read` | Als gelesen markieren |
| `PUT` | `/api/auth/notifications/read-all` | Alle als gelesen |
| `GET` | `/api/auth/notifications/stream` | SSE-Stream für Echtzeit |

---

### 6.10 Quick Actions

Plugins können Aktionen registrieren, die in der globalen Suche (⌘K / Ctrl+K) erscheinen:

```tsx
const boxIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';

export const quickActions = [
    {
        id: 'erp.neue-bestellung',
        label: 'Neue Bestellung erstellen',
        icon: boxIcon,
        keywords: ['bestellen', 'order', 'neu'],
        permission: 'erp.orders.create',
        execute: () => window.location.href = '/erp/bestellungen/neu',
    },
];
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | `string` | Eindeutige Action-ID (Format: `pluginId.action-name`) |
| `label` | `string` | Anzeigename in der Suche |
| `icon` | `string?` | Inline-SVG-String (Feather-Style, **kein Emoji**) |
| `keywords` | `string[]?` | Suchbegriffe (für Matching) |
| `permission` | `string?` | Required Permission |
| `execute` | `() => void` | Wird bei Klick ausgeführt |

#### Modal direkt öffnen via Quick Action

Wenn eine Aktion ein Modal öffnen soll (z.B. „Eintrag erstellen"), navigiere mit Query-Parameter `?action=create`:

```tsx
// Quick Action Definition
{
    id: 'erp.neue-bestellung',
    label: 'Neue Bestellung erstellen',
    icon: boxIcon,
    permission: 'erp.orders.create',
    execute: () => navigate('/erp/bestellungen?action=create'),
}
```

```tsx
// In der Zielseite: URL-Parameter auswerten und Modal öffnen
import { useSearchParams } from 'react-router-dom';

const [searchParams, setSearchParams] = useSearchParams();

useEffect(() => {
    if (searchParams.get('action') === 'create' && !loading) {
        openCreateModal();
        setSearchParams({}, { replace: true }); // Parameter sauber entfernen
    }
}, [loading, searchParams]);
```

> **Wichtig:** Den URL-Parameter nach dem Öffnen des Modals immer mit `replace: true` entfernen, damit bei Browser-Back kein erneutes Modal-Öffnen passiert.


---

### 6.11 Modale & Toasts (Core UI)

Das Core-Framework stellt einheitliche Dialoge und Benachrichtigungen bereit.
**Plugins dürfen kein `alert()` oder `confirm()` verwenden** – stattdessen die folgenden Hooks nutzen.

Beide Hooks sind über den `<ModalProvider>` in `App.tsx` global verfügbar und können in jeder React-Komponente verwendet werden.

#### Bestätigungsdialog (`useModal().confirm`)

Ersetzt `window.confirm()`. Gibt ein `Promise<boolean>` zurück (`true` = bestätigt, `false` = abgebrochen/Escape).

```tsx
import { useModal } from '../components/ModalProvider';

function MyComponent() {
    const modal = useModal();

    const handleDelete = async () => {
        const ok = await modal.confirm({
            title: 'Eintrag löschen',
            message: 'Diesen Eintrag wirklich löschen?\nDiese Aktion kann nicht rückgängig gemacht werden.',
            confirmText: 'Löschen',      // optional, default "OK"
            cancelText: 'Abbrechen',     // optional, default "Abbrechen"
            variant: 'danger',           // optional, default "info"
        });
        if (!ok) return;
        // Löschen ausführen...
    };
}
```

**ConfirmOptions:**

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `title` | `string` | — | Titel im Modal-Header |
| `message` | `string` | — | Nachricht (`\n` für Zeilenumbrüche) |
| `confirmText` | `string?` | `"OK"` | Text des Bestätigen-Buttons |
| `cancelText` | `string?` | `"Abbrechen"` | Text des Abbrechen-Buttons |
| `variant` | `ModalVariant?` | `"info"` | Farbschema und Icon (siehe Tabelle) |

#### Info-Modal (`useModal().alert`)

Ersetzt `window.alert()`. Gibt ein `Promise<void>` zurück, das resolved wenn der Benutzer schließt.

```tsx
await modal.alert({
    title: 'Update erfolgreich',
    message: 'Server startet neu. Die Seite aktualisiert sich automatisch.',
    variant: 'success',           // optional, default "info"
    buttonText: 'Verstanden',    // optional, default "OK"
});
```

**AlertOptions:**

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `title` | `string` | — | Titel im Modal-Header |
| `message` | `string` | — | Nachricht (`\n` für Umbrüche) |
| `variant` | `ModalVariant?` | `"info"` | Farbschema und Icon |
| `buttonText` | `string?` | `"OK"` | Text des Schließen-Buttons |

#### Varianten (`ModalVariant`)

| Variant | Icon | Farbe | Verwendung |
|---|---|---|---|
| `info` | ℹ️ | Blau (Primary) | Neutrale Hinweise |
| `success` | ✅ | Grün | Erfolgsbestätigungen |
| `warning` | ⚠️ | Orange | Warnungen (z.B. Serverrestart) |
| `danger` | ⚠️ | Rot | Destruktive Aktionen (Löschen, Entfernen) |
| `error` | ❌ | Rot | Fehlermeldungen |

Bei `danger`/`error` wird der Bestätigen-Button automatisch rot eingefärbt (`btn-danger`).

#### Toast-Nachrichten (`useToast`)

Nicht-blockierende Benachrichtigungen, die automatisch verschwinden. Ideal für Feedback nach Aktionen.

```tsx
import { useToast } from '../components/ModalProvider';

function MyComponent() {
    const toast = useToast();

    const handleSave = async () => {
        try {
            await saveData();
            toast.success('Erfolgreich gespeichert');
        } catch {
            toast.error('Fehler beim Speichern');
        }
    };
}
```

| Methode | Auto-Dismiss | Verwendung |
|---|---|---|
| `toast.success(msg)` | 4 Sekunden | Erfolgreiche Aktionen |
| `toast.info(msg)` | 4 Sekunden | Neutrale Hinweise |
| `toast.warning(msg)` | 6 Sekunden | Warnungen |
| `toast.error(msg)` | 6 Sekunden | Fehler |

**Verhalten:**
- Max. 5 Toasts gleichzeitig (älteste werden verdrängt)
- Position: unten rechts, gestapelt mit Slide-in Animation
- Klick auf Toast oder ×-Button schließt sofort

#### Keyboard-Support (Modale)

| Taste | Confirm-Modal | Alert-Modal |
|---|---|---|
| `Enter` | Bestätigt | Schließt |
| `Escape` | Bricht ab (= false) | Schließt |

#### CSS-Klassen für Plugin-Modale

Wenn Plugins eigene Modale (nicht über `useModal`) erstellen, **müssen** die folgenden CSS-Klassen verwendet werden:

| CSS-Klasse | Beschreibung |
|---|---|
| `.modal-overlay` | Halbtransparenter Hintergrund, zentriert Inhalt |
| `.modal-card` | Modal-Container mit Background, Border, Shadow, Padding |
| `.modal-header` | Header mit Titel und Close-Button (flex, space-between) |
| `.modal-close` | Runder ×-Button |
| `.modal-actions` | Footer mit Buttons (`display: flex; gap; margin-top`) |
| `.modal-grid` | 2-Spalten Grid für Formulare |
| `.modal-alert` | Alert-Box innerhalb eines Modals |

> ⚠️ **Nicht** `.modal-content`, `.modal-body` oder `.modal-footer` verwenden – diese Klassen existieren nicht im CSS und erzeugen fehlende Backgrounds und fehlenden Button-Abstand.

```tsx
// Richtig: Plugin-eigenes Modal
<div className="modal-overlay" onClick={onClose}>
    <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
            <h3>Titel</h3>
            <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {/* Inhalt */}
        <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
            <button className="btn btn-primary" onClick={onSave}>Speichern</button>
        </div>
    </div>
</div>
```

> **Wichtig:** `alert()` und `confirm()` des Browsers sind **verboten** – sie blockieren den Thread, sehen auf jedem OS unterschiedlich aus und verhindern jegliches Custom-Styling.

---

### 6.12 Scheduled Tasks (Cron-Jobs)

Plugins können wiederkehrende Aufgaben registrieren:

```ts
// In der Backend-Plugin-Registrierung:
await fastify.scheduler.register({
    id: 'mein-plugin.taeglich-bereinigen',  // Muss einzigartig sein
    name: 'Alte Einträge bereinigen',
    cron: '0 3 * * *',                      // Täglich um 03:00
    pluginId: 'mein-plugin',
    handler: async () => {
        const db = getDatabase();
        await db('mein_plugin_logs')
            .where('created_at', '<', new Date(Date.now() - 30 * 86400000))
            .delete();
    },
});
```

**Cron-Expressions:**

| Expression | Bedeutung |
|---|---|
| `* * * * *` | Jede Minute |
| `0 * * * *` | Jede Stunde |
| `0 3 * * *` | Täglich um 03:00 |
| `0 8 * * 1-5` | Mo–Fr um 08:00 |
| `0 0 1 * *` | Monatlich am 1. |

**Features:**
- Tasks werden in der DB persistiert (`scheduled_tasks`)
- Jeder Lauf wird mit Status/Dauer protokolliert (`scheduled_task_runs`)
- Admin kann Tasks über UI aktivieren/deaktivieren
- Fehler in Handlern werden geloggt, der Task läuft weiter
- Core-Task `core.cleanup-task-runs` bereinigt Runs älter als 30 Tage

**Admin-API:**

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/admin/scheduler` | Alle Tasks mit letztem Run |
| PUT | `/api/admin/scheduler/:taskId/toggle` | Task aktivieren/deaktivieren |
| GET | `/api/admin/scheduler/:taskId/runs` | Run-History (letzte 50) |

**Beim Plugin-Entfernen:**
```ts
await fastify.scheduler.unregister('mein-plugin.taeglich-bereinigen');
```

---

### 6.13 E-Mail-Service

Der Core stellt einen E-Mail-Service bereit, der von Plugins zum Versenden von E-Mails genutzt werden kann:

```ts
// Einfache Text-E-Mail
await fastify.mail.send({
    to: 'kunde@firma.de',
    subject: 'Neue Rechnung',
    text: 'Ihre Rechnung R-2026-042 ist bereit.',
});

// HTML-E-Mail mit mehreren Empfängern
await fastify.mail.send({
    to: ['admin@firma.de', 'buchhaltung@firma.de'],
    subject: 'Monatsbericht',
    html: '<h1>Bericht</h1><p>Details im Anhang.</p>',
    text: 'Bericht – Details im Anhang.', // Fallback für Text-only Clients
});

// Fehlerbehandlung
try {
    await fastify.mail.send({ to: 'test@firma.de', subject: 'Test', text: 'Hallo' });
} catch (error) {
    // "E-Mail-Versand nicht konfiguriert" oder Versandfehler
    console.warn('E-Mail fehlgeschlagen:', error.message);
}

// Prüfen ob E-Mail konfiguriert ist (für bedingte Logik)
if (!fastify.mail.isConfigured()) {
    // Nur In-App-Benachrichtigung senden
    await fastify.notify.send(userId, { title: 'Info', message: 'Bericht fertig' });
}
```

**`send()` Parameter:**

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `to` | `string \| string[]` | ✅ | Empfänger (einzeln oder Array) |
| `subject` | `string` | ✅ | Betreff |
| `text` | `string` | – | Plaintext-Body |
| `html` | `string` | – | HTML-Body (bevorzugt wenn vorhanden) |
| `template` | `string` | – | Template-Name (zukünftig) |
| `data` | `Record<string, any>` | – | Template-Variablen (zukünftig) |

**Konfiguration:** Die E-Mail-Einstellungen werden über **Administration > Einstellungen > E-Mail-Konfiguration** verwaltet.

**Provider:**

| Provider | Status | Beschreibung |
|---|---|---|
| `none` | Standard | Nicht konfiguriert – `send()` wirft Fehler |
| `smtp` | Verfügbar | Direkte SMTP-Verbindung (Host, Port, TLS, Login) |
| `m365` | Geplant | Microsoft 365 Graph API (kommt in zukünftiger Version) |

**Admin-API:**

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/admin/email/settings` | Aktuelle E-Mail-Settings (Passwort maskiert) |
| PUT | `/api/admin/email/settings` | Settings aktualisieren |
| POST | `/api/admin/email/test` | Test-E-Mail senden (`{ to: "test@firma.de" }`) |

> **Hinweis:** SMTP-Passwörter werden verschlüsselt in der Datenbank gespeichert. Bei API-Abfrage wird `••••••` zurückgegeben.

---

### 6.14 Core UI-Komponenten

Der Core stellt wiederverwendbare React-Komponenten für konsistentes Plugin-UI bereit:

#### DataTable

```tsx
import DataTable, { DataTableColumn } from '@/components/ui/DataTable';

const columns: DataTableColumn[] = [
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} label={val} /> },
    { key: 'created_at', label: 'Erstellt', render: (val) => new Date(val).toLocaleDateString('de') },
];

<DataTable
    columns={columns}
    data={items}
    loading={isLoading}
    searchable
    onRowClick={(row) => navigate(`/detail/${row.id}`)}
    actions={<ExportButton url="/api/mein-plugin/export" filename="export.csv" />}
/>
```

**DataTable Props:**

| Prop | Typ | Beschreibung |
|---|---|---|
| `columns` | `DataTableColumn[]` | Spaltendefinitionen mit `key`, `label`, optional `render`, `sortable`, `width` |
| `data` | `any[]` | Datenzeilen |
| `loading` | `boolean` | Ladeindikator |
| `searchable` | `boolean` | Suchfeld anzeigen (Default: `true`) |
| `pageSize` | `number` | Einträge pro Seite (Default: `20`) |
| `onRowClick` | `(row) => void` | Klick-Handler für Zeilen |
| `actions` | `ReactNode` | Aktionsbuttons in der Toolbar (z.B. ExportButton) |
| `emptyMessage` | `string` | Text wenn keine Daten |

#### FormField

```tsx
import FormField from '@/components/ui/FormField';

<FormField label="Firmenname" name="company" value={name} onChange={setName} required error={errors.company} />
<FormField label="Kategorie" type="select" options={[{ value: 'a', label: 'Option A' }]} value={cat} onChange={setCat} />
<FormField label="Beschreibung" type="textarea" value={desc} onChange={setDesc} rows={5} />
<FormField label="Passwort" type="password" value={pw} onChange={setPw} hint="Mindestens 12 Zeichen" />
```

**FormField Props:**

| Prop | Typ | Beschreibung |
|---|---|---|
| `label` | `string` | Label-Text (Pflicht) |
| `name` | `string` | Input-Name/ID (Default: aus label generiert) |
| `type` | `'text' \| 'email' \| 'password' \| 'number' \| 'textarea' \| 'select'` | Input-Typ (Default: `'text'`) |
| `value` | `string \| number` | Aktueller Wert |
| `onChange` | `(value: string) => void` | Change-Handler |
| `required` | `boolean` | Zeigt roten * nach Label |
| `disabled` | `boolean` | Deaktiviert das Feld |
| `error` | `string` | Fehlermeldung (rot, unter dem Feld) |
| `hint` | `string` | Hinweistext (grau, unter dem Feld) |
| `placeholder` | `string` | Platzhaltertext |
| `options` | `{ value: string; label: string }[]` | Optionen für `type="select"` |
| `rows` | `number` | Zeilen für `type="textarea"` (Default: 3) |
| `children` | `ReactNode` | Custom-Input (ersetzt das Standard-Input) |

#### StatusBadge

```tsx
import StatusBadge from '@/components/ui/StatusBadge';

<StatusBadge status="success" label="Aktiv" />
<StatusBadge status="error" label="Fehler" />
<StatusBadge status="warning" label="Ausstehend" />
<StatusBadge status="info" label="Info" />
<StatusBadge status="neutral" label="Entwurf" />
```

#### DateRangePicker

```tsx
import DateRangePicker from '@/components/ui/DateRangePicker';

<DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} label="Zeitraum" />
```

**DateRangePicker Props:**

| Prop | Typ | Beschreibung |
|---|---|---|
| `from` | `string` | Start-Datum (ISO: `YYYY-MM-DD`) |
| `to` | `string` | End-Datum (ISO: `YYYY-MM-DD`) |
| `onChange` | `(from: string, to: string) => void` | Wird bei jeder Änderung aufgerufen |
| `label` | `string` | Optionales Label |

**Eingebaute Presets:** Heute, Diese Woche, Diesen Monat, Letzte 30 Tage, Dieses Jahr.

#### EntitySearch

```tsx
import EntitySearch from '@/components/ui/EntitySearch';

<EntitySearch
    endpoint="/api/auth/search"
    labelKey="name"
    valueKey="id"
    value={selectedId}
    displayValue={selectedName}
    onChange={(id, item) => setSelected(item)}
    label="Kunde"
    placeholder="Kunde suchen..."
/>
```

**EntitySearch Props:**

| Prop | Typ | Beschreibung |
|---|---|---|
| `endpoint` | `string` | API-URL (Query wird als `?q=...` angehängt) |
| `labelKey` | `string` | Feld für die Anzeige (Default: `'name'`) |
| `valueKey` | `string` | Feld für den Wert (Default: `'id'`) |
| `value` | `string \| number \| null` | Aktuell ausgewählter Wert |
| `displayValue` | `string` | Angezeigter Text im Input |
| `onChange` | `(id, item) => void` | Callback bei Auswahl (`null` bei Clear) |
| `label` | `string` | Optionales Label |
| `placeholder` | `string` | Platzhaltertext |
| `required` | `boolean` | Pflichtfeld-Markierung |
| `disabled` | `boolean` | Deaktiviert das Feld |
| `minChars` | `number` | Min. Zeichen vor API-Abfrage (Default: 2) |

Debounced API-Suche (300ms) mit Dropdown, Clear-Button und Lade-Spinner. Erwartet ein Array oder `{ results: [] }` von der API.

---

### 6.15 CSV/Excel Export

#### Backend: CSV generieren

```ts
import { generateCSV, CsvColumn } from '../core/csvExport.js';

// In einer Route:
fastify.get('/export', async (request, reply) => {
    const data = await db('my_table').select('*');

    const columns: CsvColumn[] = [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'E-Mail' },
        { key: 'created_at', label: 'Erstellt am' },
        { key: 'amount', label: 'Betrag', format: (v) => v?.toFixed(2).replace('.', ',') },
    ];

    const csv = generateCSV(columns, data);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="export.csv"');
    return reply.send(csv);
});
```

**CSV-Features:**
- UTF-8 BOM für korrekte Umlaute in Excel
- Semikolon als Trennzeichen (DE-Standard)
- Automatische Datumsformatierung
- Escape von Sonderzeichen und Zeilenumbrüchen
- Custom-Formatter pro Spalte

#### Frontend: ExportButton

```tsx
import ExportButton from '@/components/ui/ExportButton';

<ExportButton url="/api/mein-plugin/export" filename="kunden-export.csv" label="Exportieren" />
```

**ExportButton Props:**

| Prop | Typ | Beschreibung |
|---|---|---|
| `url` | `string` | API-Endpunkt der CSV liefert |
| `filename` | `string` | Download-Dateiname (Default: `'export.csv'`) |
| `label` | `string` | Button-Text (Default: `'CSV Export'`) |
| `className` | `string` | CSS-Klasse (Default: `'btn btn-sm'`) |
| `disabled` | `boolean` | Deaktiviert den Button |

Zeigt automatisch Ladezustand.

#### Frontend: useExport Hook

Für benutzerdefinierte Export-Logik ohne den ExportButton:

```tsx
import { useExport } from '@/hooks/useExport';

const { exportCSV, loading, error } = useExport();

<button onClick={() => exportCSV('/api/mein-plugin/export', 'daten.csv')} disabled={loading}>
    {loading ? 'Exportiere...' : 'CSV herunterladen'}
</button>
{error && <span className="text-danger">{error}</span>}
```

**useExport Rückgabe:**

| Feld | Typ | Beschreibung |
|---|---|---|
| `exportCSV` | `(url: string, filename?: string) => Promise<void>` | Startet den Download |
| `loading` | `boolean` | `true` während des Downloads |
| `error` | `string \| null` | Fehlermeldung (oder `null`) |

---

## 7. Verfügbare Core-APIs (tatsächlich vorhanden)

| API | Zugriff | Zweck |
|---|---|---|
| Datenbank | `fastify.db` | Knex-Zugriff |
| Auth-Guard | `fastify.authenticate` | Login-Pflicht |
| Permission-Guard | `fastify.requirePermission('perm')` | Rechteprüfung |
| Tenant-Scoping | `fastify.scopedQuery/scopedInsert` | Mandanten-Isolation für DB-Zugriffe |
| Tenant-Helper | `fastify.requireTenantId()/isSuperAdmin()` | Tenant-Kontext prüfen |
| Audit-Log | `fastify.audit.log(entry, request)` | Audit-Eintrag |
| Audit-Diff | `fastify.auditChange(opts)` | Auto Before/After-Diff |
| Event Bus | `fastify.events.emit/on` | Plugin-Events |
| Benachrichtigungen | `fastify.notify.send(userId, payload)` | In-App-Notifications |
| Scheduler | `fastify.scheduler.register(opts)` | Cron-Jobs registrieren |
| E-Mail | `fastify.mail.send(opts)` | E-Mail-Versand |
| WebSocket | `fastify.ws.sendToUser/sendToTenant/broadcast` | Live-Updates an Clients |
| Plugin-Storage | `fastify.storage.save/get/list/delete` | Tenant-scoped Dateiablage |
| PDF-Export | `fastify.pdf.generate(...)` | PDF-Erzeugung im Backend |
| Validation | `fastify.validation.validateBody(schema)` | Zod-PreHandler |
| CRUD-Generator | `fastify.createCrudRoutes(opts)` | Vollständige CRUD-Endpoints |
| Verschlüsselung | `fastify.encrypt/decrypt` | AES-256-GCM Helper |
| User-Kontext | `request.user` | `userId`, `username`, `permissions`, `tenantId`, `tenantIds`, `sessionId` |

---

## 8. Core-Dokumentenverwaltung (für Plugins)

Der Core stellt eine zentrale Dokument-API bereit.  
Plugins sollten Upload/Download/ACL nicht mehr selbst neu implementieren.

### 8.1 Core-Endpoints

| Endpoint | Zweck | Mindest-Permission |
|---|---|---|
| `POST /api/documents/upload` | Datei hochladen inkl. ACL | `documents.upload` |
| `GET /api/documents` | Dokumente listen (mit Filtern) | `documents.view` |
| `GET /api/documents/:id` | Dokument-Metadaten lesen | `documents.view` |
| `GET /api/documents/:id/download` | Datei herunterladen | `documents.view` |
| `DELETE /api/documents/:id` | Dokument löschen (Soft-Delete) | `documents.delete` |
| `POST /api/documents/:id/restore` | Gelöschtes Dokument wieder aktivieren | `documents.manage` |
| `PUT /api/documents/:id/access` | ACL/Access-Mode ändern | `documents.manage` |
| `POST /api/documents/:id/links` | Dokument mit Entität verknüpfen | `documents.link` |
| `DELETE /api/documents/:id/links/:linkId` | Verknüpfung löschen | `documents.link` |

### 8.2 Upload-Felder (multipart/form-data)

- `file` (Pflicht)
- `title` (optional)
- `description` (optional)
- `pluginId` (optional, für Plugin-Dokumente empfohlen)
- `entityType` (optional, z. B. `invoice`)
- `entityId` (optional, z. B. `INV-2026-001`)
- `linkLabel` (optional)
- `requiredPermissions` (optional; JSON-Array oder CSV)
- `accessMode` (optional: `any` oder `all`; Default `any`)

### 8.3 Sicherheitsmodell (wichtig)

1. Dokumente sind immer mandantengebunden.
2. Zugriff erfolgt über ACL (`requiredPermissions`) + Access-Mode (`any`/`all`).
3. Für Plugin-Dokumente ACL immer explizit setzen, z. B. `buchhaltung.view`.
4. Wenn `pluginId` gesetzt ist und keine ACL übergeben wird, versucht der Core Plugin-View-Rechte (`*.view`) als Fallback.
5. Ohne auflösbare Plugin-Permissions wird der Upload abgelehnt.
6. Soft-Delete markiert das Dokument als gelöscht; die Datei bleibt für Restore erhalten.

Beispiel:
Wenn ein Benutzer keine Buchhaltungs-Permission hat, kann er Rechnungs-PDFs aus diesem Plugin nicht sehen oder herunterladen.

### 8.4 Beispiel (Rechnung hochladen)

```ts
const form = new FormData();
form.append('file', file);
form.append('pluginId', 'buchhaltung');
form.append('entityType', 'invoice');
form.append('entityId', invoiceNumber);
form.append('title', `Rechnung ${invoiceNumber}`);
form.append('requiredPermissions', JSON.stringify(['buchhaltung.view']));
form.append('accessMode', 'any');

await fetch('/api/documents/upload', {
  method: 'POST',
  credentials: 'include',
  body: form
});
```

### 8.5 Hinweise für Plugins

- Bei Listenansichten mit `pluginId` + `entityType` + `entityId` filtern.
- Im Plugin keine Dateipfade speichern, sondern Dokument-ID oder Entitätslink.
- Der Storage-Provider ist abstrahiert (`local` heute, später z. B. S3/MinIO/NAS).

### 8.6 Backup-Kompatibilität (Pflicht für Plugins)

- Der Core erstellt ein Voll-Backup der kompletten Datenbank und des gesamten `uploads`-Ordners.
- Plugin-Tabellen in der Hauptdatenbank werden automatisch mitgesichert und wiederhergestellt.
- Plugin-Dokumente sind automatisch im Backup, wenn sie über die Core-Dokumentenverwaltung oder allgemein unter `uploads` gespeichert sind.
- Dateispeicher außerhalb von `uploads` (z. B. externe Pfade, S3-Buckets, NAS-Mounts) sind nicht automatisch Teil des ZIP-Backups.
- Für externe Speicher muss das Plugin eine eigene Export-/Import-Strategie dokumentieren und bereitstellen.
- Empfehlung: Für Dateien immer die Core-Dokumenten-API nutzen, damit Rechte, Mandantenbezug und Backup konsistent bleiben.

---

## 9. Audit-Log Verhalten (aktuell)

- Audit ist global sichtbar (Admin-Bereich), mit optionalem Mandantenfilter.
- Plugin-Aktionen sollten immer mit `request` an `fastify.audit.log(..., request)` geloggt werden.
- Dadurch wird `tenant_id` im Audit korrekt gesetzt.

---

## 10. Verbindliche Regeln

### Pflicht

1. Jede schreibende Aktion loggt Audit.
2. Jede Plugin-Businesstabelle hat `tenant_id`.
3. Jede Query/Mutation ist tenant-scoped.
4. Alle schreibenden und lesenden Endpunkte sind mit Auth + Permission geschützt.
5. Tabellen haben Plugin-Prefix (`mein_plugin_*`).
6. `plugin.json` ist konsistent gepflegt (`schema/api/provides/uses` als Projektstandard).
7. Cross-Plugin-Zugriffe nur mit sauberer `dependencies`/`uses`-Deklaration.
8. Für Plugin-Dokumente ACL setzen (`requiredPermissions`, z. B. `mein-plugin.view`).

### Nicht erlaubt

1. Eigene Auth-Mechanismen außerhalb des Core.
2. Direkte DB-Verbindungen außerhalb von `fastify.db`.
3. Mandantenübergreifende Plugin-Businessabfragen.
4. Undokumentierte Endpunkte/Tabellen.

---

## 10. Sicherheitsrichtlinien für Plugins

Der Core implementiert umfangreiche Sicherheitsmaßnahmen. Plugins **müssen** diese Richtlinien einhalten, damit die Gesamtsicherheit gewährleistet bleibt.

### 10.1 Passwort-Anforderungen

Der Core validiert alle Passwörter serverseitig. Wenn dein Plugin über die Admin-API Benutzer anlegt oder Passwörter ändert, gelten folgende Regeln:

| Regel | Anforderung |
|---|---|
| Mindestlänge | **10 Zeichen** |
| Großbuchstaben | Mindestens 1 (`A-Z`) |
| Kleinbuchstaben | Mindestens 1 (`a-z`) |
| Ziffern | Mindestens 1 (`0-9`) |
| Sonderzeichen | Mindestens 1 (z.B. `!@#$%^&*`) |

Bei Verstoß gibt die API `422 Unprocessable Entity` mit einer deutschen Fehlermeldung zurück.

```ts
// Beispiel: Benutzer-Erstellung via Admin-API
const res = await apiFetch('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
        username: 'max.mustermann',
        email: 'max@firma.de',
        password: 'SicheresPasswort1!', // Mindestens 10 Zeichen, Groß/Klein/Zahl/Sonderzeichen
        roleIds: [3],
        tenantIds: [1],
    }),
});
if (res.status === 422) {
    const { error } = await res.json();
    // error = 'Passwort muss mindestens 10 Zeichen lang sein'
}
```

### 10.2 Security Headers (Helmet)

Der Core aktiviert `@fastify/helmet` mit folgenden Standardeinstellungen:

| Header | Wert | Bedeutung |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Verhindert MIME-Type-Sniffing |
| `X-Frame-Options` | `SAMEORIGIN` | Klickjacking-Schutz |
| `Strict-Transport-Security` | HSTS-Header | Erzwingt HTTPS |
| `X-DNS-Prefetch-Control` | `off` | DNS-Prefetch deaktiviert |
| `Referrer-Policy` | `no-referrer` | Keine Referrer-Information |
| `X-Permitted-Cross-Domain-Policies` | `none` | Keine Cross-Domain-Policies |

**Content-Security-Policy (CSP) ist deaktiviert**, da das Frontend separat ausgeliefert wird. Plugins können daher Inline-Scripts und externe Ressourcen laden, ohne CSP-Violations zu verursachen.

> **Hinweis:** Plugins, die eigene HTTP-Responses mit `reply.raw.writeHead()` erstellen (z.B. SSE-Streams), erhalten die Helmet-Header **nicht** automatisch. Diese Responses sollten keine sensiblen Daten ohne zusätzliche Prüfung senden.

### 10.3 Eingabevalidierung

Der Core schützt vor SQL-Injection durch den Knex-ORM – Plugins **müssen** denselben Schutz einhalten:

```ts
// ✅ RICHTIG: Knex-Query-Builder (parametrisiert)
const items = await db('items').where('tenant_id', tenantId).where('name', search);

// ✅ RICHTIG: Knex-raw mit Platzhaltern
const result = await db.raw('SELECT * FROM items WHERE name LIKE ?', [`%${search}%`]);

// ❌ FALSCH: String-Interpolation in SQL
const result = await db.raw(`SELECT * FROM items WHERE name = '${search}'`); // SQL-INJECTION!
```

### 10.4 Shell-Befehle

Plugins die externe Prozesse starten **müssen** `execFile` statt `exec` verwenden:

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

// ✅ RICHTIG: execFile (kein Shell, kein Injection-Risiko)
await execFileAsync('tar', ['-xzf', archivePath, '-C', targetDir]);

// ❌ FALSCH: exec mit String-Interpolation (Shell-Injection!)
await execAsync(`tar -xzf "${archivePath}" -C "${targetDir}"`);
```

`execFile` umgeht die Shell komplett – Argumente werden als Array übergeben und können keine Befehle einschleusen.

### 10.5 Verschlüsselung sensibler Daten

Der Core verschlüsselt sensible Daten mit AES-256-GCM (E-Mail, Namen, MFA-Secrets).  
Plugins nutzen dafür die Decorator `fastify.encrypt()` und `fastify.decrypt()`:

```ts
// Sensitive Daten vor dem Speichern verschlüsseln
const encryptedToken = fastify.encrypt(apiToken);
await db('plugin_settings').insert({ key: 'api_token', value: encryptedToken });

// Beim Lesen entschlüsseln
const setting = await db('plugin_settings').where('key', 'api_token').first();
const apiToken = setting?.value ? fastify.decrypt(setting.value) : null;
```

> **Wichtig:** Sensible Daten wie API-Keys, Tokens oder persönliche Informationen **müssen** verschlüsselt werden. Plaintext-Speicherung sensibler Daten ist ein Sicherheitsverstoß.

### 10.6 Backup-Kompatibilität

Der Core entfernt automatisch `users.password_hash` aus Backup-Exporten.

Wichtig für Plugins:
- Core-Tabellen mit bekannten Feldern (`users`, `settings`) werden beim Export/Import intern entschlüsselt bzw. re-verschlüsselt.
- Plugin-Tabellen werden als Rohdaten gesichert (keine automatische Feld-Transformation durch den Core).
- Speichere sensible Plugin-Daten deshalb direkt verschlüsselt in der DB (`fastify.encrypt()`), damit sie auch im Backup verschlüsselt bleiben.

Eine Registrierung in einer zentralen `ENCRYPTED_FIELDS`-Map ist für externe Plugins nicht vorgesehen.

### 10.7 SSRF-Schutz

Plugins die externe URLs aufrufen (z.B. Webhooks, API-Calls) **müssen** private IP-Adressen blockieren:

```ts
// Der Core macht dies automatisch für Webhooks:
// 1. Hostname-Validierung: localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, etc. werden blockiert
// 2. DNS-Rebinding-Schutz: Nach DNS-Auflösung wird die Ziel-IP erneut gegen private Bereiche geprüft
// 3. HTTPS-Pflicht: In Produktion werden HTTP-URLs automatisch abgelehnt
//
// Plugins mit eigenen HTTP-Calls sollten dasselbe Muster implementieren:
// ❌ Nicht erlaubt: 127.0.0.1, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x, localhost, [::1]
// ❌ Auch nach DNS-Auflösung blockiert (DNS-Rebinding)
```

> **Wichtig:** Einfache String-Checks auf Hostnamen reichen **nicht** aus. Ein Angreifer kann eine Domain registrieren die auf eine interne IP auflöst (DNS-Rebinding). Immer `dns.promises.lookup()` verwenden und die aufgelöste IP prüfen.

### 10.8 `fastify-plugin` (fp) – Korrekte Verwendung

Dies ist ein häufiger Fastify-Fehler. `fp()` bricht die Fastify-Kapselung auf:

```ts
// ✅ RICHTIG: Decorator mit fp() – global zugänglich
import fp from 'fastify-plugin';

async function myDecorator(fastify: FastifyInstance) {
    fastify.decorate('myService', { doSomething: () => {} });
}
export default fp(myDecorator, { name: 'myService' });

// ✅ RICHTIG: Routen OHNE fp() – respektieren den Prefix
export async function myRoutes(fastify: FastifyInstance) {
    fastify.get('/items', async (req, reply) => { /* ... */ });
}

// In server.ts:
await fastify.register(myDecorator);                     // Decorator global
await fastify.register(myRoutes, { prefix: '/api/my' });  // Routen mit Prefix
```

```ts
// ❌ FALSCH: Routen mit fp() gewrappt – Prefix geht verloren!
export default fp(async function(fastify) {
    fastify.get('/items', handler); // → wird als /items statt /api/my/items registriert!
}, { name: 'myPlugin' });
```

**Faustregel:** `fp()` nur für Decorators/Services. Routen **niemals** mit `fp()` wrappen.

### 10.9 Rate Limiting

Der Core implementiert globales Rate Limiting:

| Scope | Limit | Zeitfenster |
|---|---|---|
| Global | 100 Requests | 1 Minute |
| Login | 5 Versuche | 1 Minute |
| Account-Sperre | Nach 10 Fehlversuchen | 15 Minuten |

Plugins erben das globale Rate Limiting automatisch. Für besonders sensitive Endpunkte können Plugins zusätzliche Limits konfigurieren.

---

## 11. Checkliste vor Release

### Manifest

- [ ] `id`, `backend_entry`, `frontend_entry` korrekt
- [ ] `permissions` vollständig
- [ ] `schema`, `api`, `provides`, `uses` dokumentiert
- [ ] `dependencies` korrekt

### Backend

- [ ] Tenant-Scoping in allen Queries/Mutations
- [ ] Audit für Create/Update/Delete vorhanden
- [ ] Rechteprüfung an allen Routen
- [ ] Migrationen sauber mit `up/down`

### Frontend

- [ ] `routes` + `navItems` exportiert
- [ ] Optional: `dashboardTiles` exportiert (falls Dashboard-Kacheln bereitgestellt werden)
- [ ] UI-Aktionen per `PermissionGate` geschützt
- [ ] API-Aufrufe laufen über Core-Auth (`credentials: include`)
- [ ] Falls Dokumente genutzt werden: Core-Dokumenten-API + ACL (`requiredPermissions`) verwendet

### Integration

- [ ] Plugin startet bei aktivem Status fehlerfrei
- [ ] Dependencies sind installiert und aktiv
- [ ] Plugin funktioniert bei Mandantenwechsel korrekt
- [ ] Plugin-Daten und Plugin-Dateien sind Backup-kompatibel (DB + `uploads`)

### Sicherheit

- [ ] Kein `exec()` – nur `execFile()` für externe Prozesse
- [ ] SQL-Queries nur über Knex-Query-Builder oder `db.raw()` mit Platzhaltern
- [ ] Sensible Daten (API-Keys, Tokens) sind verschlüsselt gespeichert (`fastify.encrypt()`)
- [ ] Keine `fp()`-Wrapper um Routen (nur für Decorators)
- [ ] Keine internen IPs in ausgehenden HTTP-Calls (SSRF-Schutz)
- [ ] Passwort-Anforderungen bei User-Erstellung beachtet (min. 10 Zeichen, Groß/Klein/Zahl/Sonderzeichen)
- [ ] Keine Verwendung von `dangerouslySetInnerHTML` oder `innerHTML`

---

## 13. Update-Pakete (verbindlicher Standard)

Plugin-Updates werden pro Plugin-Unterordner veroeffentlicht.
Zusaetzlich kann ein automatisch erzeugter `plugins/index.json` Feed ausgeliefert werden (fuer Server ohne Directory-Listing):

```text
plugins/
  index.json
  <plugin-id>/
    latest.tar.gz
    version.json
```

Wichtig:

- Es gibt **keinen manuell gepflegten** zentralen Katalog mehr.
- `plugins/index.json` wird im Build automatisch aus allen Plugin-Unterordnern generiert.
- Der Core liest zuerst `plugins/index.json`; falls nicht vorhanden, nutzt er Directory-Listing (`plugins/`) und `version.json`.
- Dadurch kann jedes Team sein Plugin unabhaengig releasen, ohne eine gemeinsame Katalog-Datei manuell zu bearbeiten.

### 13.1 Felder in `version.json` (Plugin)

Pflicht:

- `version`
- `changelog`
- `released_at`
- `tar_sha256`
- `name`

Empfohlen:

- `description`
- `author`
- `dependencies`
- `artifact_url` (z. B. eine direkte Download-URL zum GitHub Release Asset)

Beispiel:

```json
{
  "version": "1.2.3",
  "changelog": "Release v1.2.3",
  "released_at": "2026-02-21T12:00:00Z",
  "artifact_url": "https://github.com/michaelnid/WorkSpace/releases/download/v1.2.3/buchhaltung-1.2.3.tar.gz",
  "name": "Buchhaltung",
  "description": "Rechnungen und Belege verwalten",
  "author": "Team Finance",
  "dependencies": [],
  "tar_sha256": "2f62f19e1f2a2f79b3a53b8458f8bd3d0a5d4b2e8f60e40b9ce2eb87f8b2478c"
}
```

### 13.2 Integritaetspruefung

Der Core verifiziert beim Installieren/Aktualisieren:

1. SHA256-Hash (`tar_sha256`) des geladenen Artefakts

Hinweis:

- Wenn `artifact_url` gesetzt ist, laedt der Core genau dieses Artefakt.
- Ohne `artifact_url` nutzt der Core als Fallback `latest.tar.gz`.

Relevante Umgebungsvariablen am Zielsystem:

- `UPDATE_REQUIRE_HASH=true|false` (Default: `true`)
- `UPDATE_URL=<GitHub API URL>` (Default: `https://api.github.com/repos/michaelnid/WorkSpace`)

### 13.3 Release-Ablauf fuer Plugin-Entwickler

1. Plugin bauen und als `latest.tar.gz` in `plugins/<plugin-id>/` veroeffentlichen.
2. `version.json` mit Metadaten + `tar_sha256` erzeugen.
3. Upload als GitHub Release Asset unter `github.com/michaelnid/WorkSpace/releases`.

> **Tipp:** `build-plugin.sh` erledigt Schritte 1-2 automatisch.

Damit ist das Plugin automatisch updatefaehig, ohne zentrale Katalog-Pflege.

### 13.4 Installationsstatus im Admin-Updatebereich

Der Updatebereich unterscheidet jetzt klar zwischen:

- **Installierte Plugins** (aus der lokalen Tabelle `plugins`)
- **Verfügbare Plugins** (aus Remote-Feed `plugins/index.json` oder Directory-Listing)

Konsequenzen für Plugin-Entwickler:

- Ein Plugin gilt als "installiert", wenn es in der lokalen `plugins`-Tabelle registriert ist.
- Bereits installierte Plugins werden **nicht** mehr als "Installieren"-Kachel in "Verfügbare Plugins" angeboten.
- Updates werden nur angeboten, wenn die Remote-Version größer als die installierte Version ist.

### 13.5 Plugin entfernen (Deinstallation)

Der Core unterstützt Deinstallation über den Admin-Updatebereich.

Beim Entfernen eines Plugins macht der Core:

1. Entfernen der plugin-spezifischen Permissions (`permissions.plugin_id = <plugin-id>`)
2. Entfernen plugin-spezifischer Einstellungen (`settings.plugin_id = <plugin-id>`)
3. Entfernen des Plugin-Eintrags aus `plugins`
4. Entfernen der Plugin-Dateien unter `plugins/<plugin-id>/`
5. Neustart des Servers

Wichtig:

- Deinstallation entfernt **nicht automatisch** plugin-spezifische Business-Daten aus eigenen Tabellen.
- Falls ein Plugin vollständige Datenbereinigung benötigt, muss dies als eigener administrativer Prozess dokumentiert werden.
- Nutze deshalb stabile `plugin_id`-Werte; ein späteres Umbenennen einer Plugin-ID wird wie ein anderes Plugin behandelt.

### 13.6 Update-/Install-/Remove-Status und Logs (UI)

Core- und Plugin-Operationen laufen als asynchrone Update-Tasks mit Live-Status:

- Status: `queued`, `running`, `success`, `error`
- Fortschritt in Prozent
- laufende Logzeilen (z. B. Download, Hash-Prüfung, Entpacken, Migration, Cleanup)

Für Plugin-Entwickler bedeutet das:

- `version.json` und Artefakte müssen konsistent sein (sonst klare Fehler im Live-Log)
- eindeutige, nachvollziehbare `changelog`-Texte helfen beim Betrieb
- bei Fehlern sieht der Admin sofort, in welchem Schritt der Prozess stoppt
