# Fundament-Plan — Shinon Forge auf der DSH-Architektur

> Status: PLAN (Entwurf, zum Freigeben). Nicht: implementiert.
> Regel: DSH/Cordis ist das Fundament. Wir bauen Schichten DARAUF.
> Aus fremden Repos übernehmen wir nur Invarianten/Prinzipien — keinen Fremdcode.

## Abgleich mit dem Repo-Report (verifiziert 2026-10-07)
Jede Report-Behauptung gegen die echten Bäume geprüft — nicht übernommen, belegt:

| Report-Block | Quelle | Verdict | Beleg |
|---|---|---|---|
| **S1 Shinon Gate Engine** | Feed-the-Floor-Bleed `scripts/shinon/` | ✅ **ECHT & stark** | `engine.mjs` (157 Z), `policy.json` (12 Gates, slices/local/always), 12 Plugins, `lib/commit-text.mjs`, eigene Tests + `docs/`. JS, node-only, CI-Job `shinon.yml`. **Reifste, direkteste Vorlage.** |
| S4 Contract Schema 7-Punkt | propsa `bausteine/` | ✅ echt (nur Prinzip) | 7 Verträge, 4 Zustände. Ist Form/Disziplin, kein Runtime-Code. |
| A1 Probe/Twin | Falsify_Me | ✅ echt (Prinzip) | Probe-Vertrag, Thinker/Validator/Twin, Verdicts. |
| A5 Provenance | DOKI | ✅ echt (Prinzip) | CONTRACT v2, 7-Punkt, „derived ≠ authority". |
| **S2 Live Plugin Registry** | Syx_Bridge `core/Translation/plugin-registry.js` | ❌ **falsch einsortiert** | Es ist ein **Game**-Registry (`setActiveGame`/`getActivePlugin`) für die Übersetzungs-Pipeline. **DSH/Cordis hat die Plugin-Registry bereits** (Bundles/Profiles) → **kein Gap.** Nicht porten. |
| A2 SnipWar Chain Controller | SnipWar `addons/mcp/runtime/autonomy/mcp_chain_controller.gd` | ⚠️ **Port, kein Adopt** | **GDScript/Godot-Addon** (`runtime_chain_*` nicht in JS belegt). Nicht drop-in. Konzept: gut. Code: nicht. |
| A4 LIMEN Provider Plane | `limen` (privat) | ⚠️ **Port, kein Adopt + Überlappung** | **Python** (`src/limen/`, pyproject; routing/key_pool/pipeline/resilience/queue). Deckt teils **L1 Router** ab → Doppelarbeit vermeiden. Nur Konzept (Key-Pool, Retry-After, Backoff+Jitter, Audit, correlation IDs). |
| A3 HTTP Router | Syx_Bridge `core/GUI/server-*.js` | ⚠️ echt, aber später | Express-artige Routen + SSE existieren. Aber `openapi` ist nicht im Profil; DSH-Web-App bringt eigenes HTTP. Niedrige Priorität. |
| **S3 Consistency Doctor** | Syx_Bridge `core/scripts/check_consistency.js` | ✅ **existiert** | + `check_ssot_consistency.js`, `check_vendor_drift.js`. Muster `checkX(opts) → issues[]` korrekt. Idee gut, aber an Syx-SSOT gekoppelt → Konzept übernehmen. |
| **B1 LLM_Core_V1 Kernel** | LLM_Core_V1 `kernel/*.js` (Branch **master**) | ✅ **echt** | `rng.js` (69 Z), `patches.js` (112 Z), `persistence.js`, `store.js`, `schema.js`, `stableStringify.js` + 30 Gate-/Test-Skripte. JS, node-only. Später für deterministische Primitives. |

**Übersehen vom Report** (im Baum vorhanden, nicht erwähnt): `Promtguard`,
`syxcraft-commit-layer`, `Pipelie_Run`, `LLM_Safe_BioLab_Sim`, `isaac-rl`,
`League-of-lit`, `sim` — vor späteren Wellen sichten.

## Der eigentliche Kern-Fund: `Shinon_Agent/interface-specs/`
Der Report will eine „Convergence-Schicht bauen" — **sie existiert schon**, als
Contract-Suite mit ehrlichem Status (Details: `Docs/REPO-ANALYSIS.md`):
ShinonLLM(0) → Promtguard(1) → KARMA(2) → goal-chain(2b) → LIMEN(3),
Handoffs HOFF-0001…0008, State(SQLite)/Audit(JSONL)-Trennung, Claim-Status-Mapping.
Reifegrad dort selbst markiert: LIMEN `IMPLEMENTED`, KARMA `PARTIAL`,
ShinonLLM `NOT_IMPLEMENTED` (Handoff). **Contracts reif, Laufzeit-Verbindung fehlt.**

## Mapping Control Plane → DSH (die zentrale Entscheidung)
| Control-Plane | DSH-Äquivalent | Wir bauen |
|---|---|---|
| SHINON (Character) | Prompt-Section / Persona-Bundle | `@shinon/persona` (später) |
| PROMTGUARD (Claims) | Claims-Plugin | Claims-Modell aus Contract, JS |
| KARMA (FalsificationGate) | Gate-Plugin | `@shinon/verify` — **wertvollster Teil** |
| GOAL-CHAIN (Skills/TIDs) | DSH-Subagent + Skills | **existiert** — nicht doppelt bauen |
| LIMEN (Key/429/Retry) | DSH-LLM-Adapter | Konzept in `@shinon/router` |
| DOKI (Provenance) | querschnittliche Invariante | Regel + Audit-Schema |
| Audit (JSONL) | DSH-Session-Log | **existiert** — nutzen, nicht neu |

## Warum DSH-primär, nicht Frankenstein
DSH liefert bereits die Primitiven, die ein eigenes Framework liefern würde:
append-only Session-Log + Trajectory, Plugin-Registry/Events, Subagent-Vertrag,
`ctx.llm`, Sandbox, Profiles/Bundles. Ein zweiter Kernel (Karma/DOKI/LIMEN)
daneben wäre genau der Frankenstein. Wir nehmen daraus nur **Invarianten,
Contracts und Disziplin** — als Regeln, die unsere Bundles/`scripts` testen.

## WAVE 0 — Governance-Fundament ✅ GEBAUT (2026-10-07)
`scripts/gate/` — modularer Gate-Runner, abgeleitet aus Feed-the-Floor-Bleed,
**nicht kopiert**. Die Plugins rufen `scripts/lib/repo.mjs` direkt (eine Quelle).
- `engine.mjs` (Diff-Slicing, Modi `--local`/`--full`/`--release`), `policy.json`
  (`always`/`local`/`slices`), `policy.mjs` (Policy-Validierung + Deckungsgleichheit
  Policy ↔ Plugin-Dateien), `plugins/*.mjs` (10 Gates), `tests/engine.test.mjs`.
- Kommandos: `npm run gate` / `gate:local` / `gate:full` / `gate:test`.
- **Verifiziert:** 10 Gate-Tests grün; `--full` 10/10 PASS; `--local` 7 laufen,
  3 geskippt; Negativtest (kaputtes Paket) → FAIL mit Exit 1; Altbestand grün
  (`npm test` 37/9/28/3, `npm run build`).

## WAVE 2 — Hook/Event-Spine ✅ GEBAUT (2026-10-07)
`packages/events/` — `@shinon/events`, der Beobachtungs-/Emissions-Spine, der den
Zyklus aus der Analyse als erste Runtime-Schicht trägt: Signale beobachten →
normalisieren → validieren → emittieren. Neun Event-Typen, Envelope mit acht
Pflichtfeldern, Vertrag als Daten (`assets/event-spine.json`), Replay-Fixture
(`assets/replay/session-created.json`).
- **Fail-closed für Events, fail-open für den Host:** ein Event, das den Vertrag
  verletzt, wird nie emittiert (Grund + Zähler statt stillem Durchlauf); ein
  Handler wirft nie zurück in den beobachteten Prozess.
- **Nicht-Autonomie ist geprüft, nicht behauptet:**
  `scripts/gate/plugins/events-spine.mjs` lehnt Schreib-/Ausführungs-/Modell-/
  Netzaufrufe im Laufzeitcode statisch ab.
- **Beweis:** `npm run gate:test` 43/43 (davon 21 Events-Tests), Replay über die
  echte `apply()`-Schnittstelle: 9 Envelopes deckungsgleich, 4 Verwerfungsfälle
  ohne Emission. Mount belegt: `dsh --profile shinon --dump-config` (dsh
  0.2.0-rc.2) listet den Layer `shinon-events` — `dsh-profile-test` 3/3.
  **Nicht bewiesen:** das Verhalten gegen ein echtes, laufendes DSH-Signal
  (der Boot belegt Auflösung und Mount, nicht die Emission) — deshalb
  `NOT_VERIFIED` im Vertrag.
- Offen: Carrier-Typnamen (`message.created`, `tool.requested`, …) gegen ein
  echtes DSH bestätigen; danach `verifiedTypes` erweitern und die Probe
  `events-spine-dsh-wiring` von `PLAN` auf `WRITE` ziehen.

## Fundament — Schichten (jede = ein sauberes 4-File-Cordis-Bundle)
Alle als `packages/<dir>/`, automatisch von Discovery+Gate erkannt; 4-Wege-Namens-
vertrag + `@deepseek-ai/schemastery` in peer+dev (SHARED_DEPS), sonst rot.

```
LAYER 0  @shinon/telemetry   fail-OPEN   (Beobachtung)
   - DSH session/event → TokenUsage → append-only, deterministischer Event-Log
   - kein Modell/Netz, keine Schreibzugriffe ins Projekt
   - macht token-usage ECHT (Panel = View über Telemetrie, nicht "📊 --")
   - Invariante: annotiert nur, mutiert State nie (DOKI: derived ≠ authority)

LAYER 1  @shinon/router      fail-OPEN   (Dispatch-Policy)
   - LLM-Judge (Billigmodell) fast/smart + Fallback-Chain
   - Scoring + Fehler-Taxonomie neu abgeleitet (Syx_Bridge/LIMEN-Prinzip)
   - Key-Pool / Retry-After / Backoff+Jitter als Konzept aus LIMEN (nicht Python)
   - DSH-Hooks: agent/pre-step, agent/request, agent/request-error,
     ctx.llm.stream() — VERIFIZIEREN vor Wiring

LAYER 2  @shinon/verify      (Verifikation; fail-closed wo ein Verdict gate't)
   - FalsificationGate (KARMA-Contract) + Probe/Twin (Falsify_Me) — NEU in JS
   - Claims-Lifecycle: unverified→supported→confirmed | refuted | conflicted
   - Verdict-Vokabular PLAN/RESEARCH/ASK/WRITE
   - Provider-/HTTP-Fehler → lesbarer DE-Text + Action (translateHttpError-Prinzip)

LAYER 3  @shinon/dashboard   fail-OPEN   (Präsentation)
   - konsumiert Telemetrie(L0): Provider-Health, per-Session Token/Kosten,
     aktive Pakete (ersetzt "5 aktiv" hardkodiert); liest DSH-Log, keine Fremddateien
```

## Expresslich NICHT porten (Anti-Frankenstein)
- **Zweite Runtime** — KARMA/LIMEN/DOKI/PRISM nicht als Kernel neben DSH.
- **Syx_Bridge `plugin-registry.js`** — Game/Translation-Registry, DSH hat Registry.
- **Syx_Bridge `Translation/router.js` + `provider-registry.js`** — an Übersetzung
  gekoppelt (Garbage-Batches, AUDITOR/POLISHER, 10 Mod-Provider). Nur Fehler-
  Taxonomie + Scoring als Prinzip neu ableiten.
- **PRISM-Python-Parsers** — DSH loggt Sessions selbst.
- **SnipWar `mcp_chain_controller.gd`** — GDScript/Godot, nicht JS.
- **LIMEN `src/limen/**` (Python)** — Konzept ja, Code nein; L1 überlappt.
- **karma/DOKI-Kernel** — DSH/Cordis ist der Kernel.
- **`Shinon_Agent/.agents/skills`-Dump** (7676 Dateien Fremd-Skills) — nicht ins Repo.
- **Parallel-Persistenz** (eigene SQLite-Welten) — DSH-Session-Log ist der Audit.

## Konfiguration & Aktivierung
- `profiles/shinon/cordis.patch.yml` führt aktuell 6 Pakete (openapi bewusst
  draußen). L0–L3 nur aktiv, wenn je ein `insert`-Eintrag ergänzt wird — dann
  prüft das Profil-Gate den 4-Wege-Namen.
- Schemastery 3.18.4 kennt kein `z.enum` → `z.union([z.const('a'), …])`.

## Reihenfolge & „fertig"
**Wichtige Einsicht aus der Contract-Verifikation:** Die Pipeline ist **noch nie
End-to-End gelaufen** (0 Handoffs, 0 Runs, 0 verified Claims). Deshalb ist der
erste echte Beweis nicht „alles bauen", sondern **ein Handoff real zum Laufen
bringen** — das ist die kleinste Sache, die die ganze Kette beweist.

0. **Wave 0 Gate-Engine** — sofort, JS, node-only, kein DSH. Gate + pack-test grün.
1. **L0 telemetry** — reine Logik (`node:test`); DSH-Wiring als markierter
   Adapter = NOT_VERIFIED bis manuell gegen DSH geprüft.
2. **L1 router** — Scoring+Taxonomie deterministisch testen; Judge-Chain;
   DSH-Hooks erst nach Verifikation.
3. **L2 verify** — FalsificationGate + Claims-Lifecycle (fail-closed).
   **Erster echter Nachweis:** ein Claim läuft `unverified → supported` über eine
   DSH-Bundle-Grenze. Das ist der Beweis, der in `Shinon_Agent` fehlt.
4. **L3 dashboard** — View, ersetzt Hardcodes.
- Jedes Bundle: `node scripts/dsh-test.mjs` grün (heute 37/0) +
  `node scripts/pack-test.mjs` grün. Status nur mit ausführbarem Nachweis.

## Pitfalls
- **VERIFIZIERT 2026-10-07:** DSH **ist** installiert (`dsh 0.2.0-rc.2`,
  `dsh --profile shinon --dump-config` läuft). Die Hooks sind belegt:
  `agent/request` kann **provider+model vor dem Dispatch überschreiben**,
  `ctx.agents.create()/resume()` ist die öffentliche Agent-API,
  `session/event` + `Session.append()` existieren, und `session-telemetry-otel`,
  `session-stats`, `llm-retry` sind bereits DSH-Layer → L0/L1 sind machbar.
- `package.json` `test` läuft die Kette `dsh-test → validate-test → pack-test →
  dsh-profile-test`. Das neue `npm run gate` ist **zusätzlich**, ersetzt nichts.
- Drei reload-Helfer (`dsh_reload.js/.mjs`, `reload.mjs`) — kanonischen festlegen.
- `dsh-update.mjs`: hardcodierter DSH-Pfad + `--profile web`, nicht `shinon`.
- `scripts/gate/`-Policy muss deckungsgleich mit `plugins/*.mjs` bleiben —
  `policy.mjs` bricht mit Exit 1 ab, wenn ein Plugin keinen Trigger hat.
- Schemastery 3.18.4: kein `z.enum` → `z.union([z.const('a'), …])`.
- Neue Bundles erst nach `insert` in `profiles/shinon/cordis.patch.yml` aktiv;
  `dead-package`-Gate meldet sonst „tot und nicht als inaktiv dokumentiert".

## Offen / Entscheidung
- Wave 0 ✅ erledigt. Nächster Schritt: **L0 telemetry** (reine Logik sofort;
  DSH-Wiring jetzt verifizierbar, da DSH installiert ist).
- `interface-specs`-Contracts nach `Docs/contracts/` spiegeln als kanonische Quelle?
- L2 `@shinon/verify`: als DSH-Tool (Gate) oder reine Lib + Hook?
- `@shinon/persona` (Character-Layer aus `shinon.contract.json`) — später oder nie?
- L0: `session-telemetry-otel`/`session-stats` sind schon DSH-Layer — eigenes
  Telemetrie-Bundle bauen oder darauf aufsetzen?
