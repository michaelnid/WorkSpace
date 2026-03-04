export default function Changelog() {
    const entries = [
        {
            version: '1.15.11',
            date: '2026-02-25',
            changes: [
                'Benutzerverwaltung: Benutzer können direkt im Bearbeiten-Modal gelöscht werden',
                'Löschen-Button mit Bestätigungsdialog (Danger-Variante) und Benutzername',
            ],
        },
        {
            version: '1.15.10',
            date: '2026-02-25',
            changes: [
                'Sicherheit: XSS-Fix in Globaler Suche – Backend-Daten werden nicht mehr als HTML gerendert',
                'Sicherheit: SQL-Wildcard-Injection-Schutz in Suche und CRUD-Generator (LIKE-Escaping)',
                'Sicherheit: Content Security Policy (CSP) über Helmet aktiviert',
                'Sicherheit: Verschlüsselung optimiert – scrypt nur noch einmal beim Start (HMAC-Key-Ableitung)',
                'Sicherheit: .env-Dateien in .gitignore aufgenommen',
                'Auth: Session-ID im JWT-Payload für präzisere Session-Verwaltung',
                'Auth: createRefreshSession-Helper für konsistente Token-Erstellung',
                'Auth: Logout widerruft Session gezielt per sessionId und tokenHash',
                'Plugin Dev Guide: Sicherheitshinweis für LIKE-Wildcard-Escaping bei manuellen Queries',
                'Plugin Dev Guide: sessionId in User-Kontext dokumentiert',
            ],
        },
        {
            version: '1.15.9',
            date: '2026-02-25',
            changes: [
                'Login: Authenticator- und Recovery-Code in einem einzigen Eingabefeld',
                'Backend: Automatischer Recovery-Code-Fallback wenn TOTP fehlschlägt',
            ],
        },
        {
            version: '1.15.8',
            date: '2026-02-25',
            changes: [
                'Profil: Eigenes Passwort ändern mit Validierung (mind. 10 Zeichen, Groß-/Klein, Zahl, Sonderzeichen)',
                'Profil: Anzeigename aus Profilinformationen entfernt',
                'MFA-Setup: Secret als kopierbarer Text unter dem QR-Code für manuelle Eingabe',
            ],
        },
        {
            version: '1.15.7',
            date: '2026-02-25',
            changes: [
                'MFA-Verwaltung: Neues Modal-Popup mit Step-by-Step-Wizard (Setup → QR → Verify → Backup-Codes)',
                'MFA: Recovery-Codes als PDF-Export mit professionellem Layout',
                'MFA: Deaktivierung ebenfalls im Modal mit Passwort-Bestätigung',
                'Session-Management: Layout-Fix – Grid mit festen Mindestbreiten und sauberen Abständen',
            ],
        },
        {
            version: '1.15.6',
            date: '2026-02-25',
            changes: [
                'Session-Management: Redesign mit Grid-Layout, Akzent-Strich und Uppercase-Labels',
            ],
        },
        {
            version: '1.15.5',
            date: '2026-02-25',
            changes: [
                'Session-Management: Eigene Sitzung widerrufen → sofortiger Logout + Redirect zu Login',
            ],
        },
        {
            version: '1.15.4',
            date: '2026-02-25',
            changes: [
                'Session-Management: Einklappbare Benutzer-Kacheln mit Avatar und Zusammenfassung',
                'Session-Details (IP, Browser, Zeitraum) erst nach Klick sichtbar',
            ],
        },
        {
            version: '1.15.3',
            date: '2026-02-25',
            changes: [
                'Aktive Sitzungen: ip_address und user_agent werden jetzt in refresh_tokens gespeichert',
                'Session-Management zeigt IP, Browser und Zeitpunkt korrekt an',
                'Migration 013: Spalten ip_address/user_agent zu refresh_tokens hinzugefügt',
            ],
        },
        {
            version: '1.15.2',
            date: '2026-02-25',
            changes: [
                'Plugin-Lifecycle: onUninstall-Hook wird beim Entfernen über den Updater ausgeführt',
                'Core-Decorators: encrypt/decrypt, validation (Zod), createCrudRoutes als Fastify-Decorator verfügbar',
                'PLUGIN_DEV: Typdefinitionen komplett überarbeitet (229 Zeilen, alle Decorators)',
                'PLUGIN_DEV: Guide aktualisiert – Decorator-Zugriff statt direkter Imports',
                'Build-Plugin: TSC-Suche über mehrere Pfade, strikte Fehlerbehandlung',
                'Dashboard: Redundanter Untertitel bei Benachrichtigungs-Kachel entfernt',
            ],
        },
        {
            version: '1.15.1',
            date: '2026-02-25',
            changes: [
                'AuditCategory-Typisierung: category-Feld auf gültige Werte beschränkt (auth/data/admin/plugin)',
                'PDF-Export: ESM-kompatibel via createRequire, korrekte Roboto-TTF-Fontpfade',
                'WebSocket: WebSocketLike-Interface statt direkter ws-Abhängigkeit',
                'Build: TSC-Strict – Build bricht bei Compile-Fehlern sofort ab',
                'Build: Plugin-Ordner mit _-Prefix werden als Templates ignoriert',
                'PLUGIN_DEV: Referenz-Template in PLUGIN_DEV/beispiel-plugin dokumentiert',
            ],
        },
        {
            version: '1.15.0',
            date: '2026-02-25',
            changes: [
                'CRUD-Generator: createCrudRoutes() generiert 5 Endpoints mit Tenant-Scoping, Zod, Audit',
                'Plugin-Storage: Tenant-scoped Datei-Verwaltung (save/get/delete/list)',
                'PDF-Export: Leichtgewichtiger HTML→PDF Generator (pdfmake)',
                'ConfirmDialog: Bestätigungsdialog mit Danger/Warning-Varianten',
                'Pagination: Seitennavigation mit Ellipsis und Prev/Next',
                'Plugin-Test-Framework: createTestApp() mit gemockter DB, Auth, Audit',
            ],
        },
        {
            version: '1.14.0',
            date: '2026-02-25',
            changes: [
                'Health-Check: /api/health mit DB-Ping, Uptime, Disk-Status',
                'Rate Limiting: Strikte Profile (strict 3/min, upload 10/5min) für kritische Routen',
                'Zod Validation: validateBody/Query/Params preHandler mit 422-Fehlerformat',
                'Plugin-Lifecycle: onInstall(), onUpgrade(fromVersion), onUninstall() Hooks',
                'WebSocket: Echtzeit-Push (Notifications, Events) über @fastify/websocket',
                'Session-Management: Aktive Sitzungen einsehen und widerrufen (Admin)',
                'Enhanced Audit Log: auditChange() Helper mit Auto-Diff (Before/After)',
            ],
        },
        {
            version: '1.13.0',
            date: '2026-02-25',
            changes: [
                'Tenant-Query-Helper: Zentraler scopedQuery() für automatische Mandanten-Isolation',
                'Policy Engine: Zentrales Authorization-Layer erkennt ungeschützte API-Routes',
                'Backup-Verschlüsselung: AES-256-GCM Encryption-at-Rest (BACKUP_ENCRYPTION_KEY)',
                'Testpyramide: 51 Unit- und Security-Tests (Vitest) für Auth, SSRF, Encryption, Permissions',
            ],
        },
        {
            version: '1.12.3',
            date: '2026-02-25',
            changes: [
                'Webhook-Verwaltung: Bugfix 404 (fp-Prefix-Encapsulation)',
                'Plugin Developer Kit: Eigener PLUGIN_DEV Ordner mit Typdefinitionen, Beispiel-Plugin und Dokumentation',
                'Plugin-Signatur: Pflichtfeld in Dokumentation aktualisiert',
            ],
        },
        {
            version: '1.12.2',
            date: '2026-02-25',
            changes: [
                'Globale Suche: Alle Admin-Bereiche als Quick Actions (Benutzer, Rollen, Mandanten, Updates, Dokumente, Backup, Einstellungen, Audit, Webhooks)',
                'Globale Suche: Feather-Style SVG-Icons statt Emojis',
                'E-Mail-Konfiguration: Bugfix Settings-API (value_encrypted), SVG-Icon statt Emoji',
                'Einstellungen: Leere Systemeinstellungen-Karte ausgeblendet',
                'Ed25519: Public Key als Default in config.ts (kein manueller .env-Eintrag noetig)',
                'Build: Automatische Signatur-Erkennung (.signing-key.pem)',
            ],
        },
        {
            version: '1.12.1',
            date: '2026-02-25',
            changes: [
                'E-Mail-Konfiguration: Einstellungskachel in Admin > Einstellungen',
                'E-Mail: Provider-Auswahl (SMTP/M365), SMTP-Felder, Test-E-Mail-Funktion',
                'Ed25519: Signaturprüfung für Updates aktiviert',
            ],
        },
        {
            version: '1.12.0',
            date: '2026-02-25',
            changes: [
                'Scheduled Tasks: Cron-Job-System für wiederkehrende Aufgaben (node-cron)',
                'Scheduler-API: fastify.scheduler.register/unregister mit DB-Persistenz und Run-History',
                'Core-Task: Automatische Bereinigung alter Task-Runs (30 Tage)',
                'E-Mail-Service: Einstellungs-API mit verschlüsselter Passwortspeicherung',
                'E-Mail: Admin-Kachel mit Provider-Auswahl (none/smtp/m365) und Test-Button',
                'Core UI: DataTable-Komponente mit Sortierung, Suche und Pagination',
                'Core UI: FormField, StatusBadge, DateRangePicker und EntitySearch',
                'CSV-Export: generateCSV() mit BOM, Semikolon und Datumsformatierung',
                'CSV-Export: ExportButton-Komponente und useExport-Hook',
                'Plugin Dev Guide: Neue Sektionen 6.12–6.15 und erweiterte Core-API-Tabelle',
            ],
        },
        {
            version: '1.11.2',
            date: '2026-02-25',
            changes: [
                'Webhook SSRF: DNS-Rebinding-Schutz mit IP-Validierung nach DNS-Auflösung',
                'Webhook HTTPS: HTTP-URLs werden in Produktion automatisch blockiert',
                'Update-Signaturen: Signaturprüfung ist jetzt standardmäßig aktiviert',
                'Update-Artefakte: Absolute URLs in artifact_path werden abgelehnt (Same-Origin)',
                'Admin-Explorer: HTML/SVG/XML-Dateien werden als Download erzwungen (XSS-Schutz)',
                'Plugin Dev Guide: Webhook-SSRF und HTTPS-Richtlinien aktualisiert',
            ],
        },
        {
            version: '1.11.1',
            date: '2026-02-25',
            changes: [
                'Zip-Slip-Schutz: Backup-Import validiert Dateipfade gegen Path Traversal',
                'Plugin-ID-Validierung: Nur alphanumerische Zeichen, Bindestrich und Unterstrich erlaubt',
                'Webhook-CRUD: Mandanten-Isolation auf alle Operationen (GET/PUT/DELETE/Logs/Test)',
                'Admin-Seed: Zufälliges Einmalpasswort statt statischem Passwort bei Neuinstallation',
                'Notification-Routen: fp()-Architektur-Fix (Routen respektieren jetzt den Prefix)',
                'Plugin Dev Guide: Neuer Abschnitt 10 Sicherheitsrichtlinien (10.1–10.9)',
                'Plugin Dev Guide: Sicherheits-Checkliste in Release-Prüfung ergänzt',
            ],
        },
        {
            version: '1.11.0',
            date: '2026-02-25',
            changes: [
                'Passwort-Validierung: Serverseitige Prüfung (min. 10 Zeichen, Groß/Klein/Zahl/Sonderzeichen)',
                'Security Headers: @fastify/helmet mit X-Content-Type-Options, HSTS, X-Frame-Options',
                'Shell-Injection-Schutz: exec() durch execFile() ersetzt',
                'Refresh-Token-Cleanup: Automatische Bereinigung bei Serverstart',
                'Backup-Sicherheit: password_hash aus Exporten entfernt',
                'trustProxy: Auf 127.0.0.1 in Produktion eingeschränkt',
                'Upload-Limits: Synchronisiert mit DOCUMENT_MAX_FILE_SIZE_MB',
                'Updater: npm ci nach tar-Extraktion für neue Abhängigkeiten',
            ],
        },
        {
            version: '1.10.0',
            date: '2026-02-24',
            changes: [
                'Event Bus: Plugin-zu-Plugin-Kommunikation über fastify.events.emit/on',
                'Benachrichtigungssystem: Glocke in der Top-Bar, SSE-Echtzeit, fastify.notify.send()',
                'Webhook-System: CRUD-Verwaltung, HMAC-signierte HTTP-Zustellung bei Events',
                'Quick Actions: Plugin-erweiterbare Aktionen in der globalen Suche (⌘K)',
                'Neue Permissions: webhooks.manage, notifications.view',
                'Plugin Dev Guide: 4 neue Sektionen (6.7-6.10) und erweiterte Core-API-Tabelle',
            ],
        },
        {
            version: '1.9.21',
            date: '2026-02-24',
            changes: [
                'Sidebar-Untermenüs: Plugins können Menüpunkte unter ausklappbaren Gruppen zusammenfassen',
                'PluginNavItem erweitert: Neue Felder group, groupIcon, groupOrder für Gruppierung',
                'Gruppen-State wird im localStorage gespeichert, klappt automatisch bei aktiver Route auf',
                'Plugin Dev Guide: Untermenü-Dokumentation mit Beispiel in Sektion 6.1',
            ],
        },
        {
            version: '1.9.20',
            date: '2026-02-24',
            changes: [
                'Globale Top-Bar: Neue Leiste oberhalb des Content-Bereichs mit zentraler Suche und Mandantenswitcher',
                'Globale Suche: Cmd+K / Ctrl+K Shortcut, durchsucht Seiten, Benutzer und Mandanten',
                'Plugin-Suche: Plugins können eigene Suchergebnisse über searchProvider bereitstellen',
                'Mandantenswitcher: Von der Sidebar in die Top-Bar verschoben',
                'Such-API: Neuer Endpoint GET /api/auth/search mit Permission-Filterung',
                'Plugin Dev Guide: Neue Sektion 6.6 zur globalen Suche',
            ],
        },
        {
            version: '1.9.19',
            date: '2026-02-24',
            changes: [
                'Plugin-Einstellungen: Plugins können eigene Settings-Panels auf der Admin-Einstellungsseite bereitstellen',
                'Settings-API: Neue Endpoints GET/PUT /api/admin/settings/plugin/:pluginId für Plugin-spezifische Einstellungen',
                'Einstellungsseite: Zeigt Plugin-Panels unterhalb der Systemeinstellungen in eigenen Karten',
                'Plugin-Registry: settingsPanel-Export wird beim Build automatisch gesammelt',
                'Plugin Dev Guide: Neue Sektion 6.5 mit Settings-API und Beispiel-Komponente',
            ],
        },
        {
            version: '1.9.18',
            date: '2026-02-24',
            changes: [
                'Cross-Plugin Extension Tiles: Plugins können Kacheln in Ansichten anderer Plugins bereitstellen',
                'Neues PluginExtensionTile-Interface mit targetSlot zur Plugin-übergreifenden Kachel-Injektion',
                'useExtensionTiles Hook: Consumer-Plugins rendern fremde Kacheln an benannten Slots',
                'Plugin-Registry: Generator sammelt extensionTiles automatisch beim Build',
                'Plugin Dev Guide: Neue Sektion 6.4 mit Provider/Consumer-Anleitung und Best Practices',
                'Beispiel-Plugin: Kommentierte extensionTiles-Vorlage als Referenz',
            ],
        },
        {
            version: '1.9.17',
            date: '2026-02-22',
            changes: [
                'Plugin-Deinstallation: Plugins können über den Admin-Updatebereich entfernt werden',
                'Installierte Plugins: Eigene Tabelle mit Status, Version und Aktionen (Aktualisieren/Entfernen)',
                'Verfügbare Plugins: Bereits installierte Plugins werden aus der Installationsliste gefiltert',
                'Plugin-Remove: Bereinigung von Permissions, Settings, Migrations-Tracking und Plugin-Dateien',
                'Update-Tasks: plugin-remove als neuer Task-Typ mit Progress-Tracking',
                'UI: Restart-Polling nach Plugin-Install/Update/Remove für nahtlose Aktualisierung',
                'UI: Verbesserte Status-Anzeige im Update-Task-Panel (Install/Update/Entfernen)',
                'Sicherheit: normalizePluginId und resolvePluginDirectory mit Path-Traversal-Schutz',
            ],
        },
        {
            version: '1.9.16',
            date: '2026-02-21',
            changes: [
                'Update-Test: Validierung des Self-Update-Mechanismus über den Download-Server',
                'Update-Tasks: Asynchrone Updates mit Progress-Tracking und Live-Log im Frontend',
                'Fortschrittsbalken und Statusanzeige für Core- und Plugin-Updates',
                'Auto-Refresh nach Core-Neustart mit Versions-Polling',
                'Versionierte Artefakt-Pfade (artifact_path) für cache-sichere Downloads',
                'Fallback-Download: Automatischer Rückfall auf latest.tar.gz bei Fehler',
                'Raw-Binary-Download via http/https mit Redirect-Handling und Transport-Dekompression',
                'GZip-Magic-Byte-Validierung für heruntergeladene Artefakte',
                'Version wird automatisch aus package.json aufgelöst (resolveAppVersion)',
            ],
        },
        {
            version: '1.9.0',
            date: '2026-02-21',
            changes: [
                'Update-Integrität: SHA-256-Hash-Prüfung für Core- und Plugin-Downloads',
                'Ed25519-Signatur: Optionale kryptographische Signaturprüfung für Updates',
                'Build: Automatische SHA-256-Berechnung und optionale Signatur in version.json',
                'Katalog entfernt: Kein zentrales index.json/catalog.json mehr, Plugin-Erkennung via Directory-Listing',
                'Updater: Komplett überarbeitet mit Integritätsprüfung, Signatur-Payload und Public-Key-Caching',
                'Config: UPDATE_REQUIRE_HASH, UPDATE_REQUIRE_SIGNATURE und UPDATE_SIGNING_PUBLIC_KEY',
                'Install: UPDATE_REQUIRE_HASH=true als Standard in .env',
                'Plugin Dev Guide: Neuer Standard für Update-Pakete ohne zentralen Katalog dokumentiert',
                'Core-Version auf 1.9.0 angehoben',
            ],
        },
        {
            version: '1.8.0',
            date: '2026-02-21',
            changes: [
                'Encryption at Rest: E-Mail, Anzeigename, Vor-/Nachname werden verschlüsselt in der DB gespeichert',
                'E-Mail-Hash: Deduplizierung und Suche über SHA-256-Hash ohne Entschlüsselung',
                'Rollenverwaltung: Neue Admin-Seite zum Erstellen, Bearbeiten und Löschen von Rollen',
                'Rollen: Super-Admin zeigt alle Berechtigungen, ist nicht bearbeitbar/löschbar',
                'Rollen: Validierung von Rollennamen (Duplikate, Pflichtfeld) und Berechtigungs-IDs',
                'Einzelrechte pro Benutzer: Zusätzliche Berechtigungen additiv zu Rollen vergeben',
                'Benutzerverwaltung: Einzelrechte-Spalte in Tabelle, Checkbox-Grid im Modal',
                'Audit-Log: tenantId kann pro Eintrag überschrieben werden (z. B. null für globale Aktionen)',
                'Backup: Verschlüsselte Profilfelder werden beim Export entschlüsselt und Import re-verschlüsselt',
                'Plugin-Katalog: Neues index.json-Format mit automatischer Generierung aus Plugin-Unterordnern',
                'Updater: Unterstützt latestTarPath/versionPath aus Katalog und Legacy-Fallback',
                'Seed: Admin-User wird mit verschlüsselter E-Mail und email_hash angelegt',
                'Install: Admin-User-Passwort wird via UPDATE statt INSERT gesetzt',
                'Core-Version auf 1.8.0 angehoben',
            ],
        },
        {
            version: '1.7.0',
            date: '2026-02-21',
            changes: [
                'Datei-Explorer: Verzeichnisse und Dateien durchsuchen (lokal und externe Speicherorte)',
                'Datei-Download/Vorschau: Inline-Anzeige für PDF, Bilder und Text direkt aus dem Explorer',
                'Storage-Binding: Aktiven Speicherort (lokal/extern) konfigurieren und umschalten',
                'Pfad-Sicherheit: Path-Traversal-Schutz für alle Explorer-Anfragen',
                'MIME-Erkennung: Automatische Content-Type-Zuordnung nach Dateiendung',
                'Admin-Home: Kachel-Layout für Admin-Übersicht mit Beschreibungen',
                'Admin-Shell: Zurück-Link mit Icon-Styling',
                'Core-Version auf 1.7.0 angehoben',
            ],
        },
        {
            version: '1.6.0',
            date: '2026-02-21',
            changes: [
                'Dokumentenspeicher: Admin-Seite zur Verwaltung von lokalen und externen Speicherorten',
                'Externe Verzeichnisse: Konfigurierbare Ordner (NAS, Netzlaufwerke) mit Statusprüfung',
                'Storage-API: GET/PUT /api/admin/documents/storage für Speicherkonfiguration',
                'Admin-Navigation: Neuer Tab "Dokumente" in der Admin-Shell',
                'Plugin-Entwicklungshandbuch: Backup-Kompatibilität als Pflichtanforderung dokumentiert',
                'Core-Version auf 1.6.0 angehoben',
            ],
        },
        {
            version: '1.5.0',
            date: '2026-02-21',
            changes: [
                'Backup: Encryption-Passthrough - Super-Admin-MFA-Geheimnisse bleiben beim Export verschlüsselt',
                'Backup: Vollständiger Upload-Reset vor Import (sauberer Zustand)',
                'Backup: Scope-Metadaten (full/tenant) in meta.json für Kompatibilitätsprüfung',
                'Backup: Globaler Export/Import ohne Mandantenbindung',
                'Auth: Login-Seite überspringt unnötigen /me-Refresh (schnellerer Seitenaufbau)',
                'Auth: Content-Type wird nur bei vorhandenem Body gesetzt (vermeidet leere JSON-Header)',
                'BackupRestore: Bessere Fehlermeldungen bei Export-/Importfehlern',
                'BackupRestore: Import nutzt jetzt apiFetch mit korrektem FormData-Handling',
                'Dashboard: Kachelverwaltung alphabetisch sortiert für bessere Übersicht',
                'Core-Version auf 1.5.0 angehoben',
            ],
        },
        {
            version: '1.4.0',
            date: '2026-02-21',
            changes: [
                'Dashboard: Frei konfigurierbares Kachel-System mit Drag & Drop, Größenänderung und Sichtbarkeitssteuerung',
                'Dashboard-Layout: Benutzerspezifische Speicherung der Kachelanordnung (API /api/auth/dashboard-layout)',
                'Plugin-Kacheln: Plugins können eigene Dashboard-Kacheln bereitstellen (dashboardTiles-Export)',
                'Dokumentenverwaltung: Zentrale Core-API für Datei-Upload, Download, ACL und Entitätsverknüpfung',
                'Dokument-Berechtigungen: Feingranulare ACL mit requiredPermissions und accessMode (any/all)',
                'Beispiel-Plugin: Vollständig überarbeitet mit Fehlerbehandlung, PermissionGate und Dashboard-Kachel',
                'Rollen-System: Automatische Rechte-Synchronisation bei neuen Core-Permissions (ensureRolePermissions)',
                'Backup: Erweitert um Mandanten, Dashboard-Layouts und Dokument-Tabellen',
                'Plugin-Entwicklungshandbuch: Komplett überarbeitet mit Dokumenten-API und Dashboard-Kacheln',
                'Sidebar auf 300px verbreitert',
                'Core-Version auf 1.4.0 angehoben',
            ],
        },
        {
            version: '1.3.0',
            date: '2026-02-21',
            changes: [
                'Benutzerverwaltung: Komplett überarbeitetes Modal mit Vor-/Nachname, Anzeigename, Rollen und Mandanten',
                'Benutzer erstellen: Mandanten-Pflicht bei Neuanlage, automatische Default-Tenant-Zuweisung',
                'Admin: Benutzer werden global geladen (nicht mehr mandantengebunden)',
                'Mandanten löschen: Sichere Löschung mit Benutzerprüfung und Fallback-Zuweisung',
                'Mandanten-Benutzer: Neue API zum Abrufen der Benutzer eines Mandanten',
                'Audit-Log: Mandantenname in Liste und Detail, Filter nach Mandant',
                'Einstellungen: Globale Einstellungen statt mandantengebunden',
                'Dashboard: Begrüßung mit vollem Namen (Vor-/Nachname bevorzugt)',
                'Core-Version auf 1.3.0 angehoben',
            ],
        },
        {
            version: '1.2.0',
            date: '2026-02-21',
            changes: [
                'Sidebar: Neuer Logout-Button mit SVG-Icon statt Text',
                'Benutzerpanel: Kompakteres Layout mit Avatar, Name und Logout-Icon',
                'Profil: Klick auf Benutzerpanel öffnet die Profilseite',
                'PluginManager entfernt: Plugin-Verwaltung wird über Updates abgewickelt',
                'FormData-Support: API-Fetch unterstützt jetzt Datei-Uploads (Avatar)',
            ],
        },
        {
            version: '1.1.0',
            date: '2026-02-21',
            changes: [
                'Mandantenfähigkeit: Mehrmandanten-System mit Mandantenwechsel in der Sidebar',
                'Tenant-Switcher: Schneller Wechsel zwischen zugewiesenen Mandanten',
                'Mandantenverwaltung: Neue Admin-Seite zum Erstellen und Bearbeiten von Mandanten',
                'Benutzerverwaltung: Mandanten-Zuweisung pro Benutzer',
                'Profilseite: Eigenes Profil mit Anzeigename und Avatar-Upload',
                'Avatar-System: Profilbild-Upload (JPG, PNG, WEBP, GIF, max. 5 MB)',
                'Backup/Restore: Mandantengetrennte Sicherung und Wiederherstellung',
                'Audit-Log: Mandantengetrennte Protokollierung',
                'Einstellungen: Mandantengetrennte Konfiguration',
                'Admin-Navigation: Neues Admin-Shell-Layout mit horizontaler Tab-Navigation',
                'Sidebar: SVG-Icons statt Emojis für konsistentes Design',
                'UI: Korrekte deutsche Umlaute (ü, ö, ä) in allen Oberflächen',
                'Plugin-System: Mandantenpflicht in der Plugin-Dokumentation verankert',
            ],
        },
        {
            version: '1.0.0',
            date: '2026-02-20',
            changes: [
                'Erstveröffentlichung der MIKE WorkSpace',
                'Dashboard mit Systemstatus, aktiven Plugins und Benutzerinfo',
                'Benutzerverwaltung mit Rollen und Berechtigungen (RBAC)',
                'Rollenverwaltung mit feingranularen Permissions',
                'Zwei-Faktor-Authentifizierung (MFA) mit TOTP und Recovery-Codes',
                'Sicherheitseinstellungen: Passwort-Policies und Brute-Force-Schutz',
                'Plugin-System: Installierbare Erweiterungen mit eigenem Backend und Frontend',
                'Update-Manager: Core- und Plugin-Updates über die Weboberfläche',
                'Backup und Restore: Vollständige Datensicherung als ZIP-Download',
                'Audit-Log: Lückenlose Protokollierung aller Admin-Aktionen',
                'Allgemeine Einstellungen: Key-Value-Konfiguration mit Verschlüsselung',
                'PHPMyAdmin-Integration über die Sidebar',
                'Automatischer Installer für Debian/Ubuntu-Server',
                'Systemd-Service mit automatischem Neustart',
                'Nginx Reverse-Proxy mit optionalem SSL (Let\'s Encrypt)',
            ],
        },
    ];

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Changelog</h1>
                <p className="page-subtitle">Versionshistorie und Änderungen</p>
            </div>

            <div style={{ maxWidth: 720 }}>
                {entries.map((entry, i) => (
                    <div key={entry.version} className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                        <div className="flex-between" style={{ marginBottom: 'var(--space-md)' }}>
                            <div>
                                <span style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>v{entry.version}</span>
                                {i === 0 && (
                                    <span className="badge badge-success" style={{ marginLeft: 'var(--space-sm)' }}>Aktuell</span>
                                )}
                            </div>
                            <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>{entry.date}</span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 'var(--space-lg)', lineHeight: 1.8 }}>
                            {entry.changes.map((change, j) => (
                                <li key={j} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                                    {change}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}
