# DSH-Mod Plan - DeepSeek Harness Customisierung

> Hinweis: Historischer Planungsstand. Die Pakete heißen heute `@shinon/*` und liegen als `packages/<name>/`; das kanonische Profil ist `profiles/shinon`.

## Zielsetzung
Ein modifiziertes DSH mit deutscher native Sprache, vorinstallierten QoL-Plugins, eigenem Design, OpenAPI-Konfiguration und Tooltips. Das System soll einfach updatbar sein, um immer die neueste DSH-Version nutzen zu können.

## Architektur-Entscheidung
- **Plugin-basiert**: Alle Mods sind eigene Cordis-Bundles im Workspace
- **Patch-Datei**: `~/.dsh/profiles/web/cordis.patch.yml` wird durch das Bundle erweitert
- **Workspace**: Alle Plugins unter `packages/` mit eigenem `package.json`
- **Updater**: `node tools/update.mjs` pullt Änderungen und führt `plugin_manager install_bundle` aus

---

## Phase 1: Basis-Infrastruktur (Sofort)

### 1.1 Projektstruktur
```
/home/vannon/Schreibtisch/dsh/
├── packages/
│   ├── core/                  # Kern-Plugin (Design, Branding)
│   ├── locale-de/             # Deutsche Sprache
│   ├── tooltip/               # Tooltips für alle Tools
│   ├── dashboard/             # Dashboard
│   ├── better-errors/         # Bessere Fehler
│   ├── token-usage/           # Token-Anzeige
│   └── openapi/               # OpenAPI Konfiguration
├── tools/
│   └── update.mjs              # Update-Script
├── cordis.patch.yml            # Profil-Patch (wird generiert)
└── README.md                   # Dokumentation
```

### 1.2 Update-Strategie
```javascript
// tools/update.mjs
// 1. Prüfe DSH Version
// 2. Pull Änderungen aus dem Repo
// 3. Installiere/updated die Bundles
// 4. Lade Profil neu
```

---

## Phase 2: Kern-Plugins (MVP)

### 2.1 core - Eigenes Design
- **Host**: Branding-Änderungen, Theme-Token Overrides
- **Client**: Custom CSS über `styles.insert()`
- **Slots**: `sidebar.brand.mark`, `sidebar.brand.name`, `shell.overlay`
- **Features**:
  - Custom Logo im Sidebar
  - Farbschema basierend auf `--dsw-alias-brand-primary`
  - Dark/Light Mode Support

### 2.2 locale-de - Deutsche Sprache
- **Plugin**: `@deepseek-ai/dsh-client-locale` aktivieren
- **Config**: `language: 'de'` in cordis.patch.yml
- **Ergänzung**: Eigene deutsche Übersetzungen für Tooltips und UI-Texte
- **Slot**: `settings.general.item` für Spracheinstellung

### 2.3 tooltip - Tooltips
- **Mechanismus**: `conversation.input.overlay` Slot nutzen
- **Feature**: Tool-Tooltips bei Hover
- **Config**: `showTooltips: true`
- **Integration**: Mit `@deepseek-ai/dsh-client-ui-tool` kombinieren

### 2.4 openapi - OpenAPI Konfiguration
- **Host Service**: REST API für Plugin-Konfiguration
- **Client UI**: Settings-Page in `settings.section`
- **Features**:
  - JSON-Schema Validierung
  - Export/Import Konfiguration
  - Version-Tracking

---

## Phase 3: QoL-Plugins

### 3.1 shinon-qol-quickactions
- **Slot**: `conversation.composer.dock`
- **Features**: Schnellzugriff auf häufige Commands
- **Config**: Benutzerdefinierte Shortcuts

### 3.2 shinon-qol-sessionmanager
- **Slot**: `sidebar.workspaces`
- **Features**: Verbesserte Session-Verwaltung
- **Integration**: Mit `@deepseek-ai/dsh-jobs-local`

### 3.3 shinon-qol-dashboard
- **Slot**: `main` mit key `dashboard`
- **Features**: Zentrale Konfigurations-Dashboard
- **Zugang**: Über `sidebar.panellist`

---

## Phase 4: Dashboard & Konfiguration

### 4.1 Konfigurations-Dashboard
- **Plugin**: `shinon-dashboard`
- **Slot**: `main` (key: 'dashboard')
- **Features**:
  - Plugin-Status Übersicht
  - Einzelfach-Konfiguration
  - Theme-Anpassung
  - Sprachwechsel
  - Export/Import Settings

### 4.2 Einfache Config-Möglichkeiten
- **YAML vs JSON**: Dashboard bietet beide Formate
- **Validierung**: Echtzeit-Feedback
- **Rollback**: Änderungen rückgängig machen

---

## Technische Details

### Plugin-Struktur (Template)
```
packages/<name>/
├── package.json
├── index.js              # Host half
├── client.js             # Client half (React)
├── cordis.patch.yml      # Bundle patch
├── locale/
│   ├── en.json
│   └── de.json
├── assets/
│   └── icon.svg
└── README.md
```

### package.json Template
```json
{
  "name": "@shinon/<plugin-name>",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/en.json": "./locale/en.json",
    "./locale/de.json": "./locale/de.json",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-conversation"]
    }
  },
  "meta": {
    "title": "Shinon Forge - <Name>",
    "description": "Beschreibung des Plugins"
  },
  "icon": "./assets/icon.svg"
}
```

### cordis.patch.yml Template
```yaml
- insert:
    - id: shinon-<name>
      name: '@shinon/<plugin-name>'
      config:
        # Plugin-spezifische Config
```

---

## Update-Strategie

### 1. DSH Version prüfen
```bash
dsh --version
```

### 2. Workspace syncen
```bash
cd /home/vannon/Schreibtisch/dsh
git pull  # oder manuell Dateien aktualisieren
```

### 3. Plugins neu installieren
```bash
node tools/update.mjs
```

### 4. Profil neu laden
- HMR automatische Aktualisierung (falls aktiv)
- Oder: Browser refresh

---

## Priority Matrix

| Phase | Plugin | Aufwand | Nutzen | Priority |
|-------|--------|---------|--------|----------|
| 1 | shinon-core | Niedrig | Hoch | P0 |
| 1 | shinon-locale-de | Niedrig | Hoch | P0 |
| 2 | tooltip | Mittel | Hoch | P1 |
| 2 | shinon-openapi | Hoch | Mittel | P2 |
| 3 | shinon-qol-* | Mittel | Hoch | P2 |
| 4 | shinon-dashboard | Hoch | Hoch | P3 |

---

## Nächste Schritte

1. [ ] Projektstruktur erstellen
2. [ ] shinon-core Plugin bauen (Branding)
3. [ ] shinon-locale-de Plugin bauen (Deutsch)
4. [ ] update.mjs Script erstellen
5. [ ] Erste Plugins installieren und testen
6. [ ] Dokumentation schreiben

---

## Notes

- **FCC**: Unklar was genau gemeint ist (vielleicht ein anderes DSH-Fork/Mod?)
- **Native Sprache**: `@deepseek-ai/dsh-client-locale` unterstützt bereits DE
- **Tooltips**: Müssen via Custom Plugin oder `client-ui-tool` Konfiguration
- **OpenAPI**: Eigenes Plugin mit REST Endpoint
- **Dashboard**: Über `main` Slot mit key 'dashboard'
