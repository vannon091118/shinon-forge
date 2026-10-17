# G1 — Orchestrierung: Entscheidung am echten Boot

> **Status:** current — Capabilities/Gaps gegen den geladenen Profil-Dump; keine Codeänderung in diesem Slice. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

**Entscheidung: NO SCHEDULER.** Für Multi-Schritt-Orchestrierung gibt es bereits
eine geladene, native Runtime-Kette an DSH (Goal-Domäne, Round-Driver,
Subagent-Familie, Hintergrund-Jobs). Eine zweite Orchestrierung darüber wäre
ein zweiter Owner für dieselben Zustände. Der Schalter
`shinon-task-router.activate` bleibt `false`, bis ein echter Goal-Runden-Test
am gepinnten DSH existiert — der fehlt heute belegt und gehört zu S6
(Mitteilung in PLAN.md §9.1), nicht zu diesem Slice.

## 1. Messbefehl (Runtime, nicht Lockfile)

Vertragsdateien sind keine Aktivierung — deshalb am **geladenen** Profil
gemessen, über den dokumentierten Startpfad (geseedetes Home, Repo-`dsh`
vor im PATH):

```bash
export PATH="$PWD/node_modules/.bin:$PATH"
export DSH_HOME=/home/vannon/.local/state/shinon/dev-dsh-home
dsh --profile shinon --dump-config > /tmp/g1-dump.txt   # Exit 0, 1572 Zeilen
```

Alle in §2 genannten Bundles stehen in dieser Datei als eigenständige
Layer-Köpfe; die Zeilennummern beziehen sich auf genau diesen Lauf.

## 2. Capability-/Gap-Tabelle

| Capability | Owner (geladen, Zeile im Dump) | Reale Aktivierung | Reproduzierbarer Nachweis | Unbefriedete Lücke | Kleinste Lösung |
|---|---|---|---|---|---|
| Goal-Domäne incl. Runden (Stop, Limit, Fehlerbehandlung) | `@deepseek-ai/dsh-goal` (277), `…-goal-round-driver` (279), `…-command-goal` (282), `…-tool-goal` (418), `…-client-ui-goal` (672) | aktiv geladen; die Policies §16/§17/§18 liegen in `packages/task-router` | `docs/probes/goal-integration.json` — echter Boot, Datensatz an echtem Cordis-Context | Ein echter Goal-Runden-Test am gepinnten DSH fehlt; er braucht einen echten Modellturn — derselbe Bedarf wie S6 | S6-Modellturn (`AGNES_API_KEY`), **keine** Orchestrierung |
| Subagent-Kette (spawn/fork, Kontrolle, Tools, UI) | `@deepseek-ai/dsh-subagent` (347), `…-spawn-in-process` (349), `…-fork-in-process` (353), `…tool-subagent-control` (358) und `/list-agents` (361), `tool-subagent` (364)/`-fork` (371), `client-ui-subagent` (664), `ui-settings-subagent` (690), `model-selection-settings` (496) | aktiv geladen | 00F: Kriterium 5, `BATCH0-ABNAHME-2026-10-17.md` — Werkzeugebene gemessen (`job_list` → `subagent-1 belongs to another session`, `unknown job job-9999`) | Echter Subagent-Turn fehlt (Session-Fence ist als Ursache widerlegt) | echter Lauf gegen `subagent`-Tool (S6-Abhängigkeit) |
| Hintergrund-Jobs | `@deepseek-ai/dsh-jobs-local` (56), `…tool-jobs` (237), `…api-job-controller` (528), `…ui-jobs` (668); `backgroundMode: continuable` (369) bzw. `one-shot` (376) | aktiv geladen | derselbe Dump | – | – |
| Goal-Kandidat ← Klassifikation | `@shinon/task-router` (1476) | **aus** — `activate: false` (1481), `threshold: 2` (1479), `maxGoalRounds: 6` (1482) | `scripts/gate/tests/task-router.test.mjs`: Policy-Rechenblätter `GOAL_CANDIDATE:…`, Herkunftsprüfung, Substanzgrenze, Vokabular — alles an echtem Kontext | Kein echter Runden-Test an gepinntem DSH (wäre Voraussetzung für `activate=true`) | derselbe echte Modellturn wie oben; **kein** neuer Schalter, **kein** neuer Dienst |
| Micro-State (fünf Felder) | `@shinon/task-router` (dasselbe Bundle, gleiche Mount-Stelle) | Angabe leer; Fakt-Schlitz ohne Quelle | `docs/probes/goal-micro-state.json` §1–§3 (Projektion, kein Caching-Schreiber) | Evidenzquelle fehlt — 6 Mutationsproben grün über `LAST_VERIFIED_FACT` = leer | nur Modellturn-Ergebnis füllt sie |
| Modellschicht | Provider mit `apiKeyEnv: SHINON_API_KEY` u. a. (Dump 82/85/88/91/94) | Route im Profil | derselbe Dump; `docs/S6-MODELLTURN-AUDIT-CI-2026-10-17.md` §1 (kein Schlüssel im Baum) | Echter Modellturn — NOT_VERIFIED, gleicher S6-Blocker | S6 |

## 3. Lifecycle, Stop, Duplicate-Guard, Fehler, Writer-Konflikte

- **Lifecycle/Stop:** der Round-Driver stoppt bei `agent/disposed` und am
  `round-limit`;belegt durch `docs/probes/goal-integration.json` (Methoden-, Event- und
  Fehlernamen aus der installierten Fassung `@deepseek-ai/dsh-goal` gelesen,
  nicht aus Vermutungstexten).
- **Duplicate-Guard:** `GOAL_EXISTS:*` / `GOAL_ALREADY_EXISTS` (Probe
 aktivierung-und-grenzen an echtem `GoalError`); die einzige Schreibstelle an
  Goal-State ist `goals.create` in `activateGoal`; alle Schreibmethoden der
  Goal-Domäne berührt die Projektion nicht (`docs/probes/goal-micro-state.json`:
  genau eine `get`-Operation, leerer Mutation-Zähler).
- **Fehlerzustände:** `GOAL_ERROR:<code>` / `NO_GOAL_SERVICE` /
  `ACTIVATION_DISABLED` als benannte Ablegungen aus dem eigenen Code; sie
  blockieren nichts, sie melden — Service fehlt, dann bleibt es beim
  Lesepfad (fail-closed).
- **Writer-Konflikte:** es gibt genau **einen** Ziel-Owner für Goal-State
  (`goals.create`); alle anderen Möglichen Lesepfade (Micro-State,
  Auswertung durch `shinon-codingmon` aus `shinon.task-router/micro-state-v1`
  — gelesen in `packages/codingmon/client.js`) sind rein lesend.

## 4. Verknüpfung mit 00F

00F (`BATCH0-ABNAHME-2026-10-17.md`, Kriterium 5) belegte die Job-Registry auf
Werkzeugebene mit einem echten Besitzer-Agenten und widerlegte die
Session-Fence als Ursache; der offene Punkt dort ist der **echte** Subagent-Turn.
Das passt zur Lücke in Zeile „Subagent-Kette" oben — kein Argument für einen
neuen Scheduler, sondern der Nachweis, dass die Fähigkeit existiert und nur der
Laufbeleg fehlt (derselbe Modellturn-Bedarf wie S6).
