# PAKETE — Nachschlagewerk zu `packages/`

> **Status:** current · **Stand:** 2026-10-20
>
> Erzählt, was jedes Paket tut. **Wie viele** Pakete es gibt, welche aktiv
> sind und wie viele Bundle-Layer das Profil hat, steht gemessen in
> [`ZAHLEN.md`](ZAHLEN.md) §1 — diese Datei zählt nicht selbst.
> Die kompakte Tabelle mit Profil-Status steht im [`../README.md`](../README.md).
>
> Grundform jedes Pakets: `index.js` (Host), `client.js` (Web-Bundle),
> `cordis.patch.yml` (Konfiguration), `package.json` — Details:
> [`ARCHITEKTUR.md`](ARCHITEKTUR.md) §2.

## Auf einen Blick

| Paket | Rolle | Tests | Naht |
|---|---|---|---|
| `better-errors` | Fehleranzeige mit deutschen Meldungen (Config-Ebene, ohne Logik) | — | — |
| `codingmon` | Pet-/Kampf-System mit dauerhaftem Zustand | ✅ (7) | Client→Host |
| `core` | Branding-Overlay: Sidebar-, Hero-Marke, Farbverlauf, Pulse | — | Slots |
| `dashboard` | Status-Panel; liest echte `workspaces`/`sessions`-Dienste | — | Slots |
| `events` | Event-Spine: beobachten, normalisieren, validieren, emittieren | ✅ | `@shinon/seams` |
| `hook` | Host-Seitige Event-Beobachtung (`agent/pre-step`), Replay-Fixture | ✅ (1) | `@shinon/seams` |
| `key-router` | Key-Pool mit 429-Rotation | ✅ (1) | Tools |
| `locale-de` | Deutsche Sprache, Namespace `shinon` | — | — |
| `markers` | Marker-Spiegel im nativen Side Panel | — | Config-Global |
| `mobile` | Viewport-Unterstützung für das Mobile-Profil — **bewusst inaktiv** | — | — |
| `narrative` | Chronicle, Arcs, Relationships, Composite State | ✅ (1) | `@shinon/seams` |
| `openapi` | API-Vertrag (`openapi.yaml`) ohne Server — **bewusst inaktiv** | — | — |
| `persona` | Persona-Schicht im DSH-System-Prompt | — | `@shinon/seams`, HTTP |
| `popup` | Fortschritts-Overlay über dem Composer | ✅ (1) | Slots |
| `project-index` | Persistenter Projektindex (files, symbols, edges, FTS) | — | `@shinon/seams`, SQLite |
| `prompter` | One-Shot-Prompt-Enhancer am `agent/pre-step` | ✅ (18) | `@shinon/seams` |
| `scoring` | Scorecard lesend (nie schreibend), deterministisches Replay | ✅ (4) | `@shinon/seams` |
| `seams` | Importfreier Naht-Kern (Digests, Kanäle, Contracts) — Bibliothek, **inaktiv** | — | — |
| `task-router` | goal/no-goal-Policy aus der Prompter-Klassifikation | — | `@shinon/seams` |
| `token-usage` | Turn- und Sitzungs-Token im Sidebar-Fuß | ✅ (1) | Ereignisse |
| `tooltip` | Styles für erweiterte Tooltips (keine Logik) | — | — |
| `traceability` | Flüchtige Tool-Call-Toasts im Chat | ✅ (1) | Config-Global |

Die Spalte „Tests" nennt die `test/*.test.mjs`-Dateien des Pakets; die
Auslöser stehen in [`CI-UND-GATES.md`](CI-UND-GATES.md) §3.

## UI-Schichten

**`@shinon/core`** — Branding-Overlay: besetzt `sidebar.brand.mark`,
`conversation.hero.brand.mark` und verwandte Slots; brandName, Farbverlauf,
Pulse. Assets: Icon und Persona-Bilder. Reines Overlay, keine Logik.

**`@shinon/locale-de`** — Deutsche Lokalisierung des Clients (Registrierung
`de → en`), Namespace `shinon`. Config leer; andere Sprachen sind bewusst
nicht im Umfang.

**`@shinon/tooltip`** — Styles für erweiterte Tooltips, bewusst **ohne**
Tooltip-Logik. `tooltipDelay` hat noch keinen Konsumenten — offene Arbeit
steht in [`ROADMAP.md`](ROADMAP.md).

**`@shinon/popup`** — Fortschritts-Overlay im
`conversation.composer.dock`: faltet das Ereignisfenster der Sitzung
(Schritt, offene Aufrufe, zuletzt benutztes Werkzeug) und übersetzt den
Text über `locale-de`. Kern logik (`trajectory-core`) importfrei und
getestet.

**`@shinon/traceability`** — Flüchtige Toasts unten rechts: Tool-Calls mit
Ergebnis, Schritte und Fehler als Benachrichtigung. Der Host legt die
Grenzen als `window.__SHINON_TRACEABILITY_CONFIG__` aus.

**`@shinon/markers`** — Marker-Spiegel (Element-Marker-System) im nativen
Side Panel. Der Vertrag liegt als `marker-model.json` vor; der Client sieht
nur, was der Host als `window.__DSH_MARKERS_CONFIG__` ausgibt.

**`@shinon/dashboard`** — Status-Panel mit zentralem Konfig-Dashboard
(fixes Rendering, Config leer). Liest die echten `workspaces`- und
`sessions`-Dienste von DSH, nicht einen Nachbau.

**`@shinon/token-usage`** — Sidebar-Fuß zeigt die Token-Zahl des
**jüngsten Turns** (aus dessen eigenen Ereignissen gefaltet — dieselbe Zahl
wie DSHs Turn-Zeile); im Titel daneben die Sitzungssumme (DSH-Projektion
`tokenUsage`, dieselbe Zahl wie DSHs Fußpille). Kern in
`assets/token-core.js`, importfrei.

## Agenten-Schicht

**`@shinon/persona`** — Shinon als Persona-Schicht im DSH-System-Prompt:
Self-Model, Memory-Contracts, HTTP-Routen `/shinon/persona/*`. Das größte
Host-Modul des Baums. Der Projektkontext kommt aus `.shinon/project-context.md`
(keine Secrets).

**`@shinon/prompter`** — One-Shot-Prompt-Enhancer am `agent/pre-step`:
Kinderaufruf **ohne Tools**, danach Host-Validierung (Form und Grenzen;
Abbruchgründe: [`contracts/abort.json`](contracts/abort.json)). Die Route
sitzt im Profil; Fallback `agnes`. Meiste Tests des Baums; 28
Asset-Module; lädt Agenten-Regeln aus `.agents/skills/`
(`shinon-dev-workflow`, `shinon-beweis-tempo`, `cordis-architektur` u. a.)
via `skillsPath`. Zettel-Dienst: `generated-skills/` mit `npm run notes:check`.

**`@shinon/task-router`** — liest die validierte Klassifikation des
Prompters und entscheidet deterministisch goal/no-goal (Schwelle im
Profil). Nutzt den DSH-Goal-State — kein zweiter Loop.

**`@shinon/better-errors`** — Config-Ebene ohne Logik: `apply()` loggt nur;
deutsche Meldungen für Fehlerbilder.

## Naht und Beobachtung

**`@shinon/seams`** — importfreier Naht-Kern (`@shinon/seams/core`):
Digests, Kanäle, Contracts. Selbst `dsh.inactive` — reine Bibliothek und
die **einzige** erlaubte Ausnahme vom Struktur-Riegel „eine Klasse pro
Datei". Acht Pakete hängen daran.

**`@shinon/events`** — Event-Spine: DSH-Signale beobachten, normalisieren,
validieren, emittieren. **Fail-closed**: ein unbekanntes Event wird
verworfen, nicht geraten. Authority `NONE`. Vertrag:
[`contracts/events.json`](contracts/events.json), Fixture-Replay im
`events-spine`-Gate.

**`@shinon/hook`** — der echte DSH-Entry-Point: Waterfall-Listener auf
`agent/pre-step` (Phase 1). Die Replay-Fixture ist die Testbasis
(`npm run test:hook`).

## Wissen und Dienste

**`@shinon/project-index`** — persistenter Projektindex außerhalb des
Repos: Dateien, Symbole, Kanten, FTS5 in SQLite; inkrementell über
mtime/Size/sha256; worker-fähig. Verifikations-Stempel im Profil
(`verify:stamp`).

**`@shinon/scoring`** — Scorecard **lesend, nie schreibend**;
deterministisches Replay; Ablage über den Project-Index-Dienst. Decay,
Relationen, Signal-Ohren.

**`@shinon/narrative`** — Narrative Engine: faltet aus der Event-Historie
deterministisch Chronicle, Arcs, Relationships und Composite State (Zug 5
aktiviert). Eigenes README im Paket.

**`@shinon/codingmon`** — Gamification-Pet: 1 XP je Token, Level, Werte,
Attacken, Idle-Kämpfe; dauerhafter Zustand, SVG-Sprites, Naht
Client→Host. Größtes Client-Bundle des Baums. Seit dem CodingMon-50-Zug
kommen 50 Arten aus EINER Quelle (`assets/data/codingmon-50.json`, gelesen
über `assets/katalog.js`), Zucht mit Eier-Ledger (`assets/zucht.js`,
`assets/zucht-glueck.js`, `assets/zucht-xp.js`), Snapshot-Schema v3
(`assets/snapshot-schema.js`) und die Migration alter Stände
(`assets/migration.js`) dazu. Kein relatives Importieren im Client: was er
braucht, spiegelt er und prüft es gegen den Host (`test/uebergabe.test.mjs`,
`test/durchstich.test.mjs`).

**`@shinon/key-router`** — Multi-API-Key-Pool mit 429-Rotation und
Eskalationsdelays; Kern importfrei in `assets/pool-core.js`. Werkzeuge
`key_router_status` / `key_router_rotate` / `key_router_probe`;
Provider-Override für konfigurierte Credentials-Referenzen.
Sicherheitsvertrag: **keine Schlüsselpräfixe in Logs**. Echte
Provider-Rotation mit realen Schlüsseln ist nicht live geprüft (steht so in
[`ZAHLEN.md`](ZAHLEN.md) §4).

## Bewusst aus / vorbereitend

**`@shinon/openapi`** — stabiler API-Vertrag (`openapi.yaml`), **kein**
Server. Dokumentierte Entscheidung ([`../AGENTS.md`](../AGENTS.md),
Conventions); trägt `dsh.inactive`.

**`@shinon/mobile`** — minimale Viewport-Unterstützung für das erste
Android-Runtime-Profil; Vorbereitung (`0.1.0`), nicht aktiviert, ebenfalls
`dsh.inactive`.
