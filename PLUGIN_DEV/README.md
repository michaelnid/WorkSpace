# MIKE Plugin Developer Kit

Dieses Verzeichnis enthaelt alles, was du brauchst um Plugins fuer die MIKE WorkSpace zu entwickeln.

## Inhalt

| Datei/Ordner | Beschreibung |
|---|---|
| `PLUGIN_DEV_GUIDE.md` | Vollstaendige Plugin-Entwicklungsdokumentation |
| `types/` | TypeScript-Typdefinitionen fuer Backend und Frontend |
| `beispiel-plugin/` | Lauffaehiges Beispiel-Plugin mit Build-Script (kopieren & anpassen) |

Hinweis: Das Root-Verzeichnis `plugins/` ist fuer aktive Plugins reserviert. Templates liegen nur in `PLUGIN_DEV/`.

## Schnellstart

### 1. Beispiel-Plugin kopieren

```bash
cp -R beispiel-plugin/ mein-plugin/
cd mein-plugin/
```

### 2. `plugin.json` anpassen

```json
{
  "id": "mein-plugin",
  "name": "Mein Plugin",
  "version": "1.0.0",
  "description": "Beschreibung...",
  "author": "Dein Name",
  "backend_entry": "backend/index.ts",
  "frontend_entry": "frontend/index.tsx"
}
```

### 3. Entwickeln

- **Backend**: Routen in `backend/routes.ts`, Fastify-Instanz mit `db`, `scopedQuery/scopedInsert`, `validation`, `createCrudRoutes`, `audit`, `scheduler`, `mail`, `ws`, `storage`, `pdf`
- **Frontend**: React-Seiten in `frontend/pages/`, Navigation in `frontend/index.tsx`
- **Typen**: Kopiere `types/` in dein Plugin fuer TypeScript-Autocompletion

### 4. Build

```bash
# Optional, falls dein Backend TypeScript nutzt:
# npm install --save-dev typescript

# Plugin bauen:
bash build-plugin.sh
```

**Ausgabe in `dist/`:**
```
dist/
+-- mein-plugin-1.0.0.tar.gz   <- Versioniertes Artefakt
+-- latest.tar.gz               <- Alias
+-- version.json                <- Metadaten + Hash
```

### 5. Deploy

Upload des `dist/`-Inhalts als GitHub Release Asset:
```
github.com/michaelnid/WorkSpace/releases
```

## Wichtige Regeln

- **Keine Emojis** als Icons - nutze Inline-SVG-Strings (siehe Guide "SVG-Icon Richtlinien")
- **Keine SQL-Strings** - nutze Knex Query Builder
- **Permissions pflegen** - ueber `permissions` in `plugin.json` (Core registriert diese automatisch)
- **Tenant-Isolation** - immer `fastify.scopedQuery(...)` / `fastify.scopedInsert(...)` verwenden

## Dokumentation

Die vollstaendige Dokumentation findest du in `PLUGIN_DEV_GUIDE.md`. Wichtige Kapitel:

| Kapitel | Thema |
|---|---|
| 2 | Plugin-Struktur und `plugin.json` |
| 3 | Backend-API (Routen, Datenbank, Permissions) |
| 4 | Frontend (Seiten, Navigation, Dashboard-Tiles) |
| 6 | Erweiterte Features (Suche, Modals, Scheduler, E-Mail, UI-Komponenten) |
| 9 | Sicherheit (Input-Validierung, RBAC, SQL-Injection) |
| 13 | Update-Pakete und Release-Ablauf |
