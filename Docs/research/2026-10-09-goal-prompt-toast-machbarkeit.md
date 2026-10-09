# Machbarkeits-Check: Prompt-Injektion während eines Goals als Toast zwischen zwei Turns

Datum: 2026-10-09. Auftrag: **online prüfen**, ob eine Prompt-Injektion während eines
Goals dem Nutzer sichtbar als Toast zwischen zwei Turns angezeigt werden kann —
erzeugt vom Prompter (Modus MAX) mit Projekt-Index, Wirkung **nur Suchen und Planen**.
Dieses Dokument ist Recherche + Plan (**nur Suchen und Planen — nichts implementiert**).

**Interpretation:** „zwischen 2 Turms" wird als **zwischen zwei Turns** gelesen; „Turm"
kommt in Repo und DSH-Doku nicht vor, Turn-Grenzen sind dagegen ein dokumentiertes
Konzept (`turn/*`-Session-Events). „nur Suchen und Planen" wird doppelt bedient:
(a) als Wirkungs-Slice der Injektion, (b) als Arbeitsauftrag für diesen Check.

## Kurzurteil

**Ja, machbar — und der Architektur-Weg ist schmaler, als er aussieht.** Drei Kernsätze
der DSH-Doku decken den ganzen Fall ab:

1. **„Model-visible means logged."** (`docs/architecture.md`) — jede modellsichtbare
   Eingabe muss aus dem Log rekonstruierbar sein; Prompt-Text reist ohnehin als
   `system/message`-History mit geloggten Replacements. Die Injektion ist damit
   **von sich aus ein dokumentiertes Ereignis** — die Sichtbarkeit braucht keinen
   zweiten Kanal.
2. **„Add UI or editor integration → drive `ctx.agents` and render from `session/event`"**
   (`docs/architecture.md`) — der offizielle UI-Weg: Client rendert aus Session-Events.
   Genau daraus speist sich der Toast.
3. **`ctx.systemPrompt` „collects prompt sections and model-facing tool schemas for
   each step"** (`docs/capability-seams.md`) — Sections werden **je Step** eingesammelt;
   eine Injektion zwischen zwei Turns wirkt ab dem nächsten Step, und der Toast zur
   Turn-Grenze hat ein scharfes Timing-Fenster.

## Online-Belege (deepseek-ai/deepseek-harness, Stand `master`)

| Befund | Quelle |
|---|---|
| Session-Events sind dauerhafte Fakten, Broadcast über `session/event`; nutzen, wenn es Reload überleben soll | `docs/architecture.md` |
| `turn/*`, `step/*` sind dauerhafte Session-Events → **Turn-Grenzen sind beobachtbar** | `docs/architecture.md` |
| `agent/pre-step` ist ein **Wasserfall** (Listener muss `next()` aufrufen) und entscheidet den akzeptierten Input je Step; Retries wiederholen weder Assembly noch pre-step | `docs/architecture.md` |
| Prompt reist nur als `system/message`-History; leeres Rendering löscht aktive System-Nodes, Updates werden geloggt | `docs/architecture.md` (Decision `2026-09-02-system-prompt-as-surface-node`) |
| `goal/change` ist ein dauerhaftes Session-Event je Mutation; `goal/changed` (`emit`, agent-scoped) folgt dem Commit | `docs/subsystems/goal.md` |
| Round-Driver: Runden kommen von `agent/status`-idle + `goal/changed`; `agent.followup(<goal_round>-Prompt)`, Limit `defaultMaxGoalRounds` 256 (Shinon: 6) | Repo-Probe `Docs/probes/goal-integration.json` (gelesen in DSH 0.2.0-rc.2) |
| Slot-Hierarchie: **`conversation.chat.turnTail`** (Turn-Ende), `conversation.input.overlay`, **`shell.overlay` → `shell.quota-notice`** (Notice-Overlay), `conversation.composer.dock`, `conversation.plan-review.actions`, `conversation.input.plan` | `docs/subsystems/slots.md` |
| Slots: Feature-Plugins tragen via `ctx.slots.register()` bei, fremde Slots via `ctx.slots.inject(key, cb)`; **neue Slot-Keys sind compile-time in `SlotMap` deklariert** — out-of-tree kann befüllen, nicht deklarieren | `docs/subsystems/slots.md` |
| Remote: Streaming nur als deklarierte Remote-Methoden; Session-Event-Streams „must not masquerade as Remote methods" | `docs/api-gateway.md` |
| Goal-Typen: `GoalView` inkl. `roundsStarted`, `maxGoalRounds`, `activation`; Block-Reason mit `code` + `message` | `docs/subsystems/goal.md` |

## Repo-Belege (Shinon Forge)

| Befund | Ort |
|---|---|
| Prompter-Modi MIN ⊂ MID ⊂ MAX als Daten-Vertrag; **MAX = `needsContext: true`** mit `INDEX_CONTRACT 'shinon.project-index/query-v1'` — „mit Index" ist genau MAX | `packages/prompter/index.js` |
| MAX_OPS: `context.project`, `references.code`, `constraints.existing`, `dependencies.use`, `touches.known`, `uncertainties.name`; Requirement-Änderungen in **jedem** Modus verboten | `packages/prompter/index.js`, `Docs/probes/prompter-modi.json` |
| Ein-Job-Child über `ctx.llm.stream()` (One-Shot, „hand-built one-shot") — Prompt-Erzeugung ohne den Hauptagenten zu stören | `Docs/probes/prompter-one-shot.json` |
| Trigger-Muster Host→UI: `agent/pre-step` / `user/message` / `session/event` → Kanal-Emitt (`shinon/trajectory`); der Client ist heute Fassade (Overlay „braucht eine Entscheidung — Slot, Felder, Anzahl") | `packages/popup/{index,client}.js` |
| **Toast-Präzedenz im Client**: `__mk_toast` + `say()` mit Auto-Hide (3,2 s) — DOM-Overlay, self-contained | `packages/markers/client.js` |
| Zielbild nicht selbst bauen: `ctx.goals` nutzen, keine Rundenschleife im eigenen Code | `Docs/probes/goal-integration.json`, `Docs/FOUNDATION-PLAN.md` |

## Bauplan (geplant, nicht implementiert)

1. **Injektion erzeugen (Host):** Prompter **MAX** mit `project-index`-Kontext
   (`shinon.project-index/query-v1`) erzeugt den Text-Block; der Fähigkeitsvertrag
   bleibt wie er ist (keine requirement-ändernde Op). „Nur Suchen und Planen" wird
   als **Capability-Slice** beschrieben — und ehrlich abgesichert über DSH
   Permissions/Approval (Permission-Presets), nicht über Prompt-Prosa allein
   (Prompt ist kein Sicherheitsboundary, `defensive-patterns.md`).
2. **Injektion anbringen (Host):** `ctx.systemPrompt.section({ name, order, text })`
   als **reversibler Effekt** (`ctx.effect`/Rückgabe) — Abschnitt zwischen zwei
   Steps ein- und wieder auszuhängen; Sections werden je Step eingesammelt, die
   Wirkung beginnt am nächsten Step. Reserved Order-Names wie in
   `prompts/README.md` (`getSectionOrder`), keine Magie-Zahlen.
3. **Timing „zwischen 2 Turns":** Trigger-Set = `turn/*`-Session-Events /
   `agent/status`-idle (Round-Grenze) + `goal/changed` als Kontext; alternativ
   `agent/pre-step` (Wasserfall! `next()` ist Pflicht) für Vor-dem-Step-Feinschliff.
   Der One-Shot-Lauf des Prompters selbst darf die laufende Runde nicht stören
   (`ctx.llm`-Child, siehe One-Shot-Probe).
4. **Sichtbarkeit (Client):** Toast rendert **aus dem Session-Event**, das die
   Injektion festhält („model-visible means logged") — offizieller Weg
   „render from `session/event`", kein zweiter Push-Kanal, kein Remote-Eintrag nötig.
   Zwei Rendering-Optionen:
   - **Slot:** Eintrag in `conversation.chat.turnTail` (Turn-Grenze) oder Notice im
     Overlay-Umfeld (`shell.overlay`-Familie) — Slotseitig via
     `ctx.slots.inject(key, cb)` in **bereits deklarierte** Keys;
   - **DOM-Toast:** Muster `packages/markers/client.js` (`__mk_toast`, Auto-Hide),
     gespeist aus dem Session-Event — schneller machbar, weniger DSH-nativ.
5. **Kapselung:** neues Bundle `packages/<dir>/` (4-Datei-Vertrag) ODER Erweiterung
   von `@shinon/prompter` + kleiner Client-Hälfte; Naht-Namen wie in
   `assets/uebergabe.js` an EINER Stelle halten (Drift-Test-Muster).
6. **„Nur Suchen und Planen" härten:** Capability-Slice in den Prompt-Vertrag
   aufnehmen (Op-Liste wie `MODE_CAPABILITIES`) **und** über DSH-Approval/-Presets
   erzwingen; Plan-Fläche existiert im Client bereits (`conversation.input.plan`,
   `conversation.plan-review.actions`).

## Verifikationsplan (am installierten DSH nachmessen — hier nicht möglich)

- `dsh --profile shinon --dump-config` + echtes Boot: wirkt ein zwischen Steps
  eingehängter `systemPrompt.section`-Effekt ab dem nächsten Step und wird das
  Ausschalten als leeres `system/message`-Replacement geloggt?
- `cordis_inspect what:"client"`: Kardinalität von `conversation.chat.turnTail`,
  `shell.overlay`/`shell.quota-notice`, `conversation.composer.dock` — welche
  nehmen eigene Einträge auf (list vs. single)?
- Turn-Grenze beobachten: feuern `turn/*`-Events zwischen zwei Goal-Runden im
  Klartext (Runden-IDs ↔ `GoalView.roundsStarted`)?
- Sichtbarkeit am echten Browser: Toast erscheint zwischen Runde N und N+1 und
  verschwindet (Auto-Hide), Reload zeigt ihn aus dem Log erneut.

## Harte Grenzen & Risiken

- **Keine neuen Slot-Keys out-of-tree:** `SlotMap` ist compile-time; nur befüllen
  (`slots.inject`/`register`) in deklarierte Keys. Ein brandneuer „Toast-Slot" müsste
  upstream oder über eine DOM-Overlay-Brücke wie `markers` entstehen.
- **Remote-Liste ist kompiliert** (25 Einträge): RPC-Wege des Browser-Clients sind
  für out-of-tree Bundles zu; Session-Event-Weg und Slots sind es nicht.
- **Host→Client-Push ohne Session-Event** ist der Weg, den `popup` heute geht —
  und der Client rendert ihn nicht (Fassade). Nicht als Muster kopieren; besser:
  Event in den Log-Stream stellen, wo ihn der Client schon hört.
- **Toast ≠ Zustand:** Bei zwei schnellen Runden kann ein Toast verpasst werden;
  der Wahrheitsgehalt bleibt das Log (`goal/change`, `system/message`). Toast ist
  Hinweis, nicht Speicher.
- **Docs-Stand vs. installiertes DSH:** Gelesen wurde Upstream-`master`; das Repo
  pinnt `0.2.1-alpha.1` (Probes stammen aus 0.2.0-rc.2). API-Namen vor Umsetzung
  gegen die installierte Fassung prüfen — siehe Verifikationsplan.
