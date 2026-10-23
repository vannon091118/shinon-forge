# ARCHITEKTUR — wie der Baum hängt

> **Status:** current · **Stand:** 2026-10-20
>
> Erzählt, was der Code tut. Harte Zahlen (Paketanzahl, Bundle-Zählungen,
> Layer) stehen in [`ZAHLEN.md`](ZAHLEN.md) §1; Regeln für Änderungen in
> [`../AGENTS.md`](../AGENTS.md). Die Kurzfassung steht im README — hier ist
> die Tiefe.

## 1. Schichtmodell

```text
┌────────────────────────────────────────────────────────────┐
│ DSH (@deepseek-ai/dsh, gepinnt in package.json +           │
│ scripts/dsh-target-versions.json)                          │
│ Laufzeit: Agent-Loop, Tools, Sessions, Provider-Adapter,   │
│ Cordis-Kernel, Plugin-Loader, Web-UI                       │
└───────────────────────────┬────────────────────────────────┘
                            │ Slots · Events · Bundles
┌───────────────────────────▼────────────────────────────────┐
│ SHINON FORGE (@shinon/* als DSH-Plugins)                   │
│ besetzt DSH-Slots statt Code zu patchen                    │
└───────┬───────────────┬───────────────┬────────────────────┘
        │               │               │
   Governance        UI-Schichten    Daten/Dienste
   scripts/gate/     core, popup,    project-index,
   Gate-Engine,      markers,        scoring, narrative,
   Commit-Guard,     tooltip,        key-router, codingmon
   Hooks, CI         traceability,   …
                     locale-de,
                     dashboard, persona, prompter, …
```

Die eine Regel (verbindlich, [`../AGENTS.md`](../AGENTS.md)): **DSH ist die
Laufzeit, wir bauen Schichten darauf — kein zweiter Kernel daneben.** Fremden
Code zu patchen ist verboten (`legacy-guard`-Gate erzwingt das Fehlen von
`dsh-mod`); besetzt werden DSHs eigene Slots (`sidebar.brand.mark`,
`conversation.hero.brand.mark`, `main`, `sidebar.panellist`,
`agent/pre-step`, …).

Eine zweite Kopie der CLI liegt **nicht** im Baum: die Fassung ist über Sollquelle,
Lock, Installat und `dsh --version` belegt (`npm run check:dsh-versions`).

## 2. Paket-Anatomie

Ein Paket **ist** ein Ordner unter `packages/`; der Ortsname ist der
Package-Scope-Name (`packages/prompter` → `@shinon/prompter`). Vier
Rollendateien sind Pflicht:

| Datei | Rolle |
|---|---|
| `package.json` | Name, Version, `dsh`-Metadaten (Platform, inactive-Flag) |
| `index.js` | **Host-Hälfte**: läuft in DSHs Node-Prozess, registriert Slots, Services, HTTP-Routen |
| `client.js` | **Client-Hälfte**: wird ins Web-UI-Bundle gezogen (Plattform `web`) |
| `cordis.patch.yml` | Konfigurationsschema und Werte, die das Profil überschreibt |

Dazu erlaubt: `assets/` (z. B. importfreie Kerne wie
`packages/key-router/assets/pool-core.js`, Sprites, Regel-JSON), `test/`
(`node:test`-Dateien `*.test.mjs`) und benannte Ausnahmen. Struktur-Riegel:
eine Klasse pro Datei; `@shinon/seams` ist die einzige dokumentierte Ausnahme.
Idiome (Shared-Code-Muster) werden mit `npm run idioms` generiert; der
`host-half`/`client-half`-Gate prüft die generierten Fassungen gegen die Quelle.

**Aktiv ist nicht der Baum, sondern das Profil:** ob ein Paket läuft,
entscheidet allein `dsh.profile.bundles` in `profiles/<profil>/package.json`.
Pakete, die bewusst aus sind (`openapi`, `mobile`, `seams`), tragen selbst
`"dsh": { "inactive": true }` — das `dead-package`-Gate kontrolliert genau
diese Paarung (kein Bundle ohne Manifest-Eintrag, kein aktives Paket ohne Bundle).

## 3. Profile

Profile leben in `profiles/` und sind die **Verdrahtung**: sie wählen Bundles
und überschreiben per `cordis.patch.yml` die Paket-Konfiguration (Welches Modell,
welcher Schlüsselname, welche Schwellen — Pakete selbst nennen nie einen
Modellnamen).

| Profil | Zweck |
|---|---|
| `profiles/shinon` | kanonisches Web-Profil: alle aktiven Pakete, Prompter-Route, Key-Router-Backoff, Task-Router-Schwelle, Permission-Default |
| `profiles/headless` | One-shot-Konsole (`node bin/shinon.mjs --profile headless "…"`), minimale Bundle-Menge |
| `profiles/mobile` | erstes Android-Runtime-Profil (Viewport-Unterstützung, `agnes`-Route) — Vorbereitung |

Die Bundles binden per `link:` — deshalb `npm run profile:links` nach jedem
`npm ci` (idempotent; Fremdpfade scheitern mit Exit 2).

## 4. Boot-Kette

```text
npm start / npm run dev
  └─ bin/shinon.mjs
       ├─ 1. Node heilen: engines-Range + node:sqlite-Rauchtest (lib/runtime.mjs),
       │    ggf. Re-Exec mit verifiziertem Node
       ├─ 2. DSH auflösen (lib/dsh.mjs): Repo-Installat → vendor/ → PATH,
       │    Herkunft wird genannt; Profilname aus repo.activeProfile(),
       │    CLI --profile gewinnt
       ├─ 3. DSH_HOME seeden (lib/dsh-home.mjs): profiles/, sessions/, logs/,
       │    .env, .credentials.yaml als Links in den Zustandsordner
       └─ 4. spawn: node <dsh bin.js> --profile … (+ Signalweiterleitung)
```

`DSH_HOME` ist **nicht** das Repo-Root: DSH liest `$DSH_HOME/AGENTS.md` als
benutzerglobale Anweisung; das Repo-`AGENTS.md` wird deshalb als
Projektanweisung geladen, wenn die Sitzung hier läuft — sonst nicht. Wer das
Home selbst setzt, setzt es absolut; ein fremder Link im Home wird gemeldet,
nie überschrieben (Details: [`SETUP.md`](SETUP.md) §3).

`shinon doctor` und `--check` zweigen **vor** DSH ab und laufen gegen
`scripts/doctor.mjs` — der Start selbst ist niemals der Diagnoseweg.

## 5. Ereignis-Spine

Die Pakete reden nicht direkt miteinander, sie hängen an einer Spine:

| Schicht | Paket | Aufgabe |
|---|---|---|
| Naht-Kern | `@shinon/seams` | importfreier Kern: Digests, Kanäle, Contracts (`@shinon/seams/core`); selbst inaktiv — reine Bibliothek |
| Beobachtung/Normalisierung | `@shinon/events` | DSH-Signale beobachten, normalisieren, validieren, emittieren; **fail-closed**: unbekanntes Event wird verworfen, nicht geraten |
| Host-Einstieg | `@shinon/hook` | echter DSH-Entry-Point: Waterfall-Listener auf `agent/pre-step` (Phase 1); Replay-Fixture als Testbasis |

Acht Pakete hängen an `@shinon/seams`; die Ereignisliste ist ein Vertrag
([`contracts/events.json`](contracts/events.json), 19 Typen mit
Fixture-Replay — Gate `events-spine`).

**Grenzen statt Globalen:** was der Client sehen darf, legt der Host als
benanntes Config-Global aus, z. B. `window.__DSH_MARKERS_CONFIG__` (markers)
oder `window.__SHINON_TRACEABILITY_CONFIG__` (traceability). Vertrag:
[`contracts/markers.json`](contracts/markers.json).

## 6. Typische Datenflüsse

**Prompt-Veredelung (One-Shot):**
`hook` fängt `agent/pre-step` → `prompter` sendet den Prompt als Kind-Aufruf
**ohne Tools** an seine (im Profil konfigurierte) Route → Host validiert die
Antwort (Form, Grenzen; Abbruchgründe: [`contracts/abort.json`](contracts/abort.json))
→ validierte Klassifikation geht an `task-router`, der deterministisch
goal/no-goal entscheidet und den DSH-Goal-State nutzt (kein eigener Loop).
Regeln dazu: `.agents/skills/` (vom Prompter via `skillsPath` geladen),
Zettelprüfung: `npm run notes:check`.

**Projektwissen:**
`project-index` baut einen persistenten Index (Dateien, Symbole, Kanten,
FTS5) in SQLite **außerhalb des Repos**, inkrementell über
mtime/Size/sha256, worker-fähig. `scoring` liest die Scorecard (nie
schreibend, deterministisches Replay, Ablage über den Project-Index-Dienst);
`narrative` faltet aus der Event-Historie deterministisch Chronicle, Arcs,
Relationships und Composite State.

**Sichtbarkeit im UI:** `popup` (Fortschritts-Overlay über dem Composer),
`traceability` (flüchtige Tool-Call-Toasts), `token-usage` (Turn-Token aus
den eigenen Ereignissen gefaltet, Sitzungssumme aus der DSH-Projektion
`tokenUsage`), `markers` (Marker-Spiegel im Side Panel), `dashboard`
(Status-Panel, liest die echten `workspaces`/`sessions`-Dienste),
`codingmon` (Pet-System mit dauerhaftem Zustand und Client→Host-Naht).

**Schlüssel:** `key-router` hält einen Key-Pool mit 429-Rotation und
Eskalationsdelays; der Kern ist importfrei (`assets/pool-core.js`).
Sicherheitsvertrag: keine Schlüsselpräfixe in Logs. Welche Route läuft,
entscheidet das Profil; welche Schlüssel existieren, die Umgebung
([`SETUP.md`](SETUP.md) §4).

**Persona/Sprache:** `persona` (System-Prompt-Schicht, Self-Model,
Memory-Contracts, HTTP-Routen `/shinon/persona/*`), `locale-de` (deutsche
Übersetzungen, Namespace `shinon`), `core` (Branding-Overlay in Sidebar,
Hero, Conversation), `tooltip`/`better-errors`/`dashboard` (Config-Ebenen).

## 7. Governance

Alles oben Genannte wird von `scripts/gate/` bewacht: eine modulare
Gate-Engine mit Plugins, getriggert über `scripts/gate/policy.json` (always /
lokal per Hook / Slice-Trigger auf geänderte Pfade). Dazu: Commit-Regeln
(`scripts/commit-guard.mjs`, Hooks, CI), statische Gates
(`shinon-test`, `validate-test`, `pack-test`, `shinon-profile-test`) und
Sonden (`docs/probes/`, erzeugt u. a. von `perf-baseline`,
`index-cold-cost`, `s6-turn`). Vollständig: [`CI-UND-GATES.md`](CI-UND-GATES.md).

## 8. Wo was liegt (eine Quelle)

Pfade und Namen entstehen einmal — in `scripts/lib/paths.mjs`. Wer dort einen
Namen braucht, importiert ihn, statt ihn zu schreiben. Weitere
Bibliotheksskripte: `lib/repo.mjs` (Repository-Modell), `lib/model-route.mjs`
(Routen-Formprüfung), `lib/secrets.mjs` (Tresor-Disziplin der
Nutzer-Installation), `lib/commit-policy*.mjs` (Commit-Regeln als Code —
Musterquelle für `COMMIT-REGELN.md`).
