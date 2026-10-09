# Anpassungsplan — Goal-Prompt-Toast (Prompt-Injektion sichtbar zwischen zwei Turns)

Datum: 2026-10-09. Status: **Plan, nichts implementiert.** Dieses Dokument
übersetzt die Recherche des Chat-Turns in konkrete Änderungen: was an welcher
Stelle geändert wird und warum genau dort.

## 0. Quellen (aus dem Chat)

| Was | Wo |
|---|---|
| Bug-Klassen & Cordis-Mechaniken (Post-Mortems 0001–0004, Defensive Patterns) | `Docs/research/2026-10-09-cordis-dsh-recherche.md` |
| Machbarkeits-Urteil + Bauplan (Slots, Session-Events, „model-visible means logged") | `Docs/research/2026-10-09-goal-prompt-toast-machbarkeit.md` |
| Regeln für Cordis-Ausreizen, Bug-Muster, Dev-Workflow | `.agents/skills/{cordis-architektur,dsh-bug-muster,dsh-dev-workflow}/SKILL.md` |

## 1. Repo-Prüfung (gegen die Recherche-Behauptungen verifiziert)

| Seam | Fundstelle | Befund |
|---|---|---|
| `systemPrompt.section()`-Muster inkl. Disposer | `packages/persona/index.js:437` (`ctx.inject(['systemPrompt'], …)`, `sp.section({ name, order, text })`) | **bestätigt** — kopierbares Muster |
| Prompter MAX + Index | `packages/prompter/index.js` (`INDEX_SERVICE 'shinon_index_query'`, `INDEX_CONTRACT 'shinon.project-index/query-v1'`, MAX `needsContext: true`) | **bestätigt** |
| Anzeige-Seam ist **reserviert** | `packages/prompter/client.js` („Ein späteres Panel darf hier andocken und die Entscheidungen aus `shinon/prompter/decision` zeigen"), `DECISION_CHANNEL` in `index.js:79` | **bestätigt** — der Toast hat schon seinen Platz |
| Host→Client-Kanal funktioniert im Bundle | `packages/task-router/client.js:36` (`ctx.on(DECISION_CHANNEL, …)` im Client, Kanal-Name als duplizierte Konstante) | **bestätigt** — Muster existiert, kein Neuland |
| Toast-Rendering im Client | `packages/markers/client.js` (`.__mk_toast` + `say()`, Auto-Hide 3,2 s) | **bestätigt** — DOM-Overlay-Muster |
| Goal-Anbindung ohne eigene Rundenschleife | `packages/task-router/index.js` (`GOAL_SERVICE 'goals'`, `goals.create(…, { maxGoalRounds })`, Round-Driver-Vertrag) | **bestätigt** |
| Trigger-Signale | `packages/popup/index.js` (`TRIGGER_SIGNALS`, `PRE_STEP_EVENT 'agent/pre-step'` in `prompter/index.js:76`) | **bestätigt** |
| Profil-Bundles | `profiles/shinon/package.json` (u. a. `@shinon/prompter`, `@shinon/project-index`, `@shinon/task-router`; `@shinon/popup` bewusst **nicht**) | **bestätigt** |
| Verträge/Name-Contract | `scripts/lib/repo.mjs` (`expected()`, `PATCH_KEYS`, `SHARED_DEPS`) | **bestätigt** |
| Paketgrenze | `Docs/ARCHITECTURE.md` §2: **Pakete kennen sich nicht gegenseitig** | entscheidend für §2A |

## 2. Was wie angepasst werden muss

### A. Host — `packages/prompter/index.js` erweitern (KEIN neues Paket)

**Warum hier:** die Verbotsregel „Pakete kennen sich nicht" würde ein neues
`@shinon/goal-toast` zur Kopplung zwingen (es bräuchte prompters Text und
Index-Kontext). Der Anzeige-Seam `shinon/prompter/decision` ist in prompter selbst
reserviert — das Feature gehört an seinen Eigentümer.

1. **Capability-Slice „Nur Suchen & Planen" als Daten.** Analog
   `REQUIREMENT_OPERATIONS` (`index.js:103`) eine Op-Liste `PLAN_OPERATIONS`
   (Suchen/Lesen/Planen) führen; jede Schreib-Op steht im Verbot — die
   Mutation-Probe-Regel aus `Docs/probes/prompter-modi.json` gilt weiter:
   Op-Liste und erzeugter Prompt lesen dieselbe Quelle, kein handgeschriebener
   Text. `INTENT_CLASSES` (`index.js:193`) kennt bereits `LONG_RUNNING_GOAL` —
   der Slice greift dort (Entscheidung siehe §4).
2. **Injektion wie `persona/index.js:437`:** `ctx.inject(['systemPrompt'], (child) => …)`
   + `sp.section({ name: 'shinon:prompter:plan-slice', order, text })`, Disposer
   einsammeln und beim Unmount ausführen. Reihenfolge über die reservierten
   Order-Names (`getSectionOrder`, siehe `prompts/README.md`), keine Magie-Zahlen.
   **Cordis-Regel:** jede Registrierung ist ein reversibler Effekt
   (`.agents/skills/cordis-architektur`) — `ctx.effect`/Rückgabe von `apply`.
3. **Sichtbarkeit:** bei jeder (de)aktivierten Injektion
   `ctx.emit(DECISION_CHANNEL, payload)` — Payload als **Feldliste-Vertrag** wie
   `packages/codingmon/assets/uebergabe.js` (eine Quelle, Host + Client-Literal
   zeichenweise verglichen). Vorschlag: `decision` (aufgenommen/verworfen),
   `reason`, `sectionName`, `intent`, `planOnly`, `at` (ISO).
4. **Timing „zwischen 2 Turns":** der Enhancer hängt schon am Schritt
   (`PRE_STEP_EVENT`); `agent/pre-step` ist ein **Wasserfall** — jeder Listener
   muss `next()` aufrufen (`Docs/research/2026-10-09-cordis-dsh-recherche.md` §2/§5).
   Die Section wird je Step eingesammelt (`ctx.systemPrompt`), eine Injektion
   zwischen Runde N und N+1 wirkt also ab N+1 — kein eigener Timer.
5. **Ehrlichkeits-Regel:** „model-visible means logged" — die Injektion erscheint
   als `system/message`-History; kein zweiter Speicher, keine zweite Wahrheit.

### B. Client — `packages/prompter/client.js` (Platzhalter → Toast)

1. **Kanal hören** wie `packages/task-router/client.js:36`: `ctx.on(DECISION_CHANNEL, …)`
   mit duplizierter Konstante (bewusst, siehe Kommentar dort) — **plus Drift-Test**:
   Host-Konstante vs. Client-Literal zeichenweise vergleichen (Muster
   `packages/codingmon/test/uebergabe.test.mjs`). Nie still ändern.
2. **Toast rendern**, zwei Optionen (Entscheidung §4):
   - **DOM-Overlay** nach Muster `packages/markers/client.js` (`__mk_toast`,
     `say()`, Auto-Hide) — schnell, self-contained, aber außerhalb der DSH-UI;
   - **Slot-Eintrag** in `conversation.chat.turnTail` (Turn-Grenze) oder
     `conversation.composer.dock` (Slot-Map: out-of-tree kann nur **deklarierte**
     Keys befüllen, `ctx.slots.inject(key, cb)`; Kardinalität am installierten DSH
     mit `cordis_inspect what:"client"` prüfen).
3. **Sichtbarkeit** beibehalten: Registry-Eintrag `window.__shinonPlugins` +
   `shinon:plugin`-Event (Konvention aus beiden Client-Hälften).

### C. Profil — `profiles/shinon/cordis.patch.yml`

- Config-Werte für die neue Funktion (z. B. `toast: true`, `planOnly: true`,
  `toastDurationMs`) als **Override im Profil**, Schema-Defaults im Paket
  (`Docs/ARCHITECTURE.md` §5: wirksame Werte leben im Profileintrag).
- Patch-Schema beachten: nur bekannte Keys (`PATCH_KEYS`), `insert` mit `id`+`name`;
  nach der Änderung `dsh --profile shinon --dump-config` lesen (Gate prüft `!!js` nicht).

### D. Tests & Probes

| Was | Wo |
|---|---|
| Plan-Slice-Vertrag (kein Schreib-Op im erzeugten Prompt; MIN ⊂ MID ⊂ MAX bleibt) | `scripts/gate/tests/prompter-contract.test.mjs` erweitern |
| Kanal-Drift Host↔Client (Literal-Vergleich) | neu: `packages/prompter/test/` oder Gate-Test nach `uebergabe`-Muster |
| Probe für den Toast-Fall (Claim/Expect/Evidence/Verdict wie bestehende Probes) | `Docs/probes/prompter-toast.json` |
| Regel geändert? → Fixture beweist Gate **und** Build rot | `scripts/validate-test.mjs` |

### E. Docs & Hygiene

- `README.md`: Status-Eintrag der Funktion (*Planned* → erst mit Nachweis *Verified*).
- `AGENTS.md`: kurzer Pointer auf `.agents/skills/` und `Docs/research/` — sonst
  finden Nachfolger die Recherche nicht (optional, aber billig).
- Commit-Regeln: Vannon-Trailer, keine AI-Footers (`Docs/COMMIT-REGELN.md`).

## 3. Reihenfolge & Verifikation

1. A.1–A.2 (Op-Liste + Injektion) mit Unit-Tests → `node --test packages/prompter/test/*.test.mjs`.
2. A.3 + B.1 (Kanal + Drift-Test) → `node --test packages/codingmon/test/uebergabe.test.mjs` (Muster).
3. B.2 (Toast) + C (Profil).
4. `npm test` (Gate → Fixtures → pack → Profil), dann `npm run build` wenn `dist/` gewünscht.
5. Browser-Sichtprüfung: Toast zwischen Runde N und N+1, Auto-Hide, Reload zeigt
   nichts Falsches (Toast ist Hinweis, das Log ist die Wahrheit).

## 4. Offene Entscheidungen (vor Implementierung zu treffen)

1. **Toast-Rendering:** DOM (Muster markers) vs. Slot `conversation.chat.turnTail` —
   abhängig von der Kardinalität am installierten DSH (`cordis_inspect`).
2. **Geltungsbereich des Plan-Slice:** nur bei `LONG_RUNNING_GOAL` (empfohlen) oder
   global — global würde einfache CHAT-Runden unnötig knebeln.
3. **Feature-Flag:** Config-Schalter (empfohlen) vs. immer an.
4. **Ob der Slice auch Modell-Tools begrenzt:** „Nur Suchen und Planen" ehrlich
   erzwingen heißt DSH-Permissions/Approval (Permission-Presets), nicht Prompt-Prosa
   (`defensive-patterns.md`: untrusted output). Wer nur den Prompt schränkt, bekommt
   eine Bitte, keine Sperre.

## 5. Harte Grenzen (Kurzfassung, Details im Machbarkeitsdokument)

- Keine neuen Slot-Keys out-of-tree (compile-time `SlotMap`); Remote-Liste kompiliert.
- Kein `export default` neben der Namespace-Form (Post-Mortem 0001), `inject` Pflicht.
- Docs-Stand Upstream-`master` ≠ DSH `0.2.1-alpha.1` — API-Namen vor der Umsetzung
  gegen die installierte Fassung prüfen (Probe-Muster: `Docs/probes/goal-integration.json`).
