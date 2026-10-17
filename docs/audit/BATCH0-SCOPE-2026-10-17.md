# Batch 0 — Scope-Isolation und Runtime-Baseline (gemessen)

> **Status:** current — Befunde und Abhilfen dieses Durchgangs; jede Zeile nennt den ausgeführten Befehl. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md` (einziger Eigentümer harter Zahlen)

Gemessen gegen den Arbeitsbaum auf `main` bei `1fd90f9` (Ausgangspunkt), Node
`v22.23.3`, gepinntes `dsh 0.2.1-alpha.1` aus `node_modules/.bin`. Es wurden
**nur** die unten genannten Befehle ausgeführt; was nicht lief, steht als offen.

## 1. Befunde

Spalten wie im Auftrag: Befund-ID, SHA, Beweisart, Befehl/Probe, Exit, Ergebnis, Änderung, offen.

| ID | SHA | Beweisart | Befehl / Probe | Exit | Ergebnis | Änderung | Offen |
|---|---|---|---|---|---|---|---|
| B0-1 | `1fd90f9` | AKTUELLER CODEBEFUND | `packages/persona/index.js`: `isShinonProject()` + `join(process.cwd(), projectContextPath)` | – | Persona-Scope kam vom Host-CWD, nicht vom Session-Workspace | Scope aus `workspaceRoot`/`SHINON_WORKSPACE_ROOT`, sonst unklar ⇒ keine Persona | Sitzungs-CWD ungemessen — Abnahme 00G: **FAIL**, siehe [`BATCH0-ABNAHME-2026-10-17.md`](BATCH0-ABNAHME-2026-10-17.md) |
| B0-2 | `1fd90f9` | AKTUELLER CODEBEFUND am Loader | `node_modules/@deepseek-ai/dsh-agent-instructions/lib/index.js` (`USER_GLOBAL_FILE = "AGENTS.md"`, `join(config.dshHome, …)`) | – | Repo-`AGENTS.md` lief als benutzerglobale Anweisung in fremden Sitzungen mit | Home getrennt + geseedet, ohne Anweisungsdatei | — |
| B0-3 | `1fd90f9` | MESSUNG | `DSH_HOME=<Home> dsh --profile shinon --dump-config` gegen `DSH_HOME=<Repo>` | 0 / 0 | identischer Baum nach Pfad-Normalisierung | Profiltest bootet gegen geseedetes Home | — |
| B0-4 | `1fd90f9` | MESSUNG | `--dump-config`, Zeile `provider`/`model` | 0 | effektiv `agnes/agnes-2.5-flash`; `AGENTS.md` behauptete 3.0 | `AGENTS.md` korrigiert | echter Turn nicht gefahren |
| B0-5 | `1fd90f9` | AKTUELLER CODEBEFUND | `node_modules/@deepseek-ai/dsh-tool-bash/lib/index.js` (Parameter `description`, `command`, `timeoutMs`, `workdir`) | – | nur „description vor command“; keine „Befehl zuerst“-Variante im Pin | keine | A/B braucht Pin-Änderung |
| B0-6 | `1fd90f9` | AKTUELLER CODEBEFUND | `packages/key-router/index.js` (nur `key_router_rotate/status/probe`); `grep -rln key_router node_modules/@deepseek-ai` | 0 | 0 Treffer außerhalb des Pakets: Tool-Anbieter, kein Teil des LLM-Pfads | keine | echte 429-Rotation ungemessen |
| B0-7 | `1fd90f9` | MESSUNG (nur Namen) | Präsenzprüfung in `.env` und Prozessumgebung | 0 | nur `AGNES_API_KEY` vorhanden; Enhancer läuft über Fallback `agnes` | keine | „no credential“ hier nicht reproduziert |
| B0-8 | `1fd90f9` | NICHT REPRODUZIERT | — | – | `unknown job` aus den Logs nicht nachgestellt | keine | echter Job-Lauf am Pin nötig |

## 2. Was geändert wurde

- `packages/persona/index.js`: Scope kommt aus `workspaceRoot` (absolut oder relativ zu
  `cwd`) oder `SHINON_WORKSPACE_ROOT`; beide unklar ⇒ **keine** Persona, **kein**
  Event-Handler. `projectContextPath` wird gegen dieses Root aufgelöst, nie gegen `cwd`.
- `scripts/lib/dsh-home.mjs` (neu): seedet das Home aus dem Baum (`profiles`, `sessions`,
  `logs`, `.env`, `.credentials.yaml` als Verknüpfungen), idempotent, fremde Links werden
  gemeldet und nie überschrieben. `AGENTS.md` wird bewusst **nicht** verlinkt.
- `scripts/lib/paths.mjs`: `dshHome()` gibt nie den Baum aus (Entwicklerbaum mit `.git` ⇒
  `dev-dsh-home`, Installat ⇒ `dsh-home`).
- `bin/shinon.mjs`, `scripts/open.mjs`: seeden vor dem Start; `npm run dev`/`dev:web`
  laufen über `bin/shinon.mjs` (ein Startpfad, `--profile` aus dem `dev`-Eintrag gilt).
- `scripts/install-user.mjs`: die Boot-Abnahme setzt `SHINON_INSTALL_ROOT` statt
  `DSH_HOME=<Installat>` — sonst wäre die `AGENTS.md` des Installats wieder global.
- `scripts/shinon-profile-test.mjs`: bootet gegen ein temporäres, geseedetes Home
  (derselbe Weg wie der Starter) und räumt es auf.

## 3. Tests (neu/angepasst)

| Datei | Zusage |
|---|---|
| `scripts/gate/tests/dsh-home.test.mjs` | Seed idempotent, fremder Link blockiert, `AGENTS.md` erreicht das Home nicht; **echter** `discoverBaselineInstructionFiles` des Pins: fremde Sitzung ohne Repo-Anweisung, Repo mit |
| `scripts/gate/tests/persona-state.test.mjs` | fremder Workspace ⇒ keine Abschnitte/Handler; unklarer Scope ⇒ aus; `SHINON_WORKSPACE_ROOT` allein entscheidet; Repo behält seine Persona |
| `scripts/gate/tests/persona-prompt.test.mjs` | derselbe Nachweis am **echten** `dsh-system-prompt`-Dienst: im Fremdprojekt kein `shinon:*`-Abschnitt und keine Marke im Prompt |
| `scripts/gate/tests/paths.test.mjs` | Home ist nie der Baum; `runtimeEnv` trägt das getrennte Home |

## 4. Läufe

| Befehl | Exit | Ergebnis |
|---|---|---|
| `npm run gate:test` | 0 | 597/597 |
| `npm test` | 0 | Verdict PASS (10 gelaufen, 13 geskippt, 1 nicht anwendbar) |
| `npm run gate:full` | 0 | 23 gelaufen, 0 fehlgeschlagen, 1 nicht anwendbar |
| `npm run test:full` | 0 | vollständige Kette bis Profil-Boot 3/3, 0 `❌`/`not ok` im Protokoll |
| `npm run zahlen:check` | 0 | Bestands-Block aktuell |
| `npm run build` | 0 | 22 Pakete, 185 Dateien |
| `node scripts/shinon-profile-test.mjs` | 0 | 24 Layer, 19 Paket-Bundles, 3/3 |
| `node bin/shinon.mjs --check` | 0 | `DSH_HOME=<state>/shinon/dev-dsh-home`, Profil `shinon`, `dsh 0.2.1-alpha.1` |

## 5. Grenzen dieses Durchgangs

- Kein echter Modell-Turn: Schema-/Modell-A/B (0D) und Enhancer-/429-Pfad (0E) sind
  damit **nicht** gemessen, nur ihre Konfiguration und ihr Code.
- ~~Kein echter Modell-Turn~~ → nachgetragen in 00E: die Fehlerpfade sind als
  Verhalten gemessen, der echte Turn bleibt **NOT_VERIFIED** (kein
  `PROMPTER_API_KEY`, keine Budgetfreigabe).
- ~~`unknown job` nicht reproduziert~~ → nachgetragen in 00F: auf Werkzeugebene
  reproduziert; offen ist nur, welcher der drei Kandidaten im historischen Lauf griff.
- Ein bestehender, nicht shinon-fremder Zustand bleibt: `SHINON_WORKSPACE_ROOT` muss für
  Persona gesetzt sein (der `dev`-Eintrag tut das); ein Installat ohne diese Variable
  startet ohne Persona — absichtlich fail-closed. Dass dieselbe Variable prozessweit
  gilt, ist der P0-Befund der Abnahme (00G).
