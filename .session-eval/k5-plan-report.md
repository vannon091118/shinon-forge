# K5-Planungs-Report — implizite Signale (Ebene 1)

> **Status:** Planung · **Autor:** Planungs-Sub-Agent · **Stand:** 2026-10-11
> **Repo:** /home/vannon/Dokumente/Projekte/Shinon-forge (DSH_HOME)
> **Kontext:** K5 = 7 vordefinierte implizite Signale (Kopieren, Übernahme, Selbstkorrektur, Umformulierung, Akzeptanz, Verwerfung, nächste Frage) — diff-basiert, deterministisch, kein LLM.
> **Regel:** Keine Zahlen erfunden. Was nicht nachgewiesen ist, steht als "nicht nachgewiesen" + warum.

---

## 0. TL;DR

- **Emittierer heute:** **niemand** emittiert `shinon/feedback/*` (Beleg: [grep](#a-wer-emittiert-heute-shinonfeedback) unten, kein Treffer in `packages/`/`scripts/`; K1 definiert nur die Eventtypen im Spine-Vertrag, [packages/events/assets/event-spine.json:238–252](packages/events/assets/event-spine.json), K3 `apply()` ist rein lesend, [packages/scoring/index.js:60–75](packages/scoring/index.js)).
- **Sammler-Sitz:** Host-seitig in `packages/scoring/index.js` (neuer Abschnitt im bestehenden `apply`), nicht ein neues Paket — der Spine emittiert bereits alle benötigten DSH-Events auf `shinon/event`, und `packages/scoring` hat schon `Config.eventsChannel` (Beleg: [packages/scoring/index.js:48](packages/scoring/index.js)).
- **Minimal-Änderung:** 1 Datei neu (`assets/signal-rules.json` — die 7-Signal-Tabelle als Daten), 1 Datei erweitert (`assets/scoring-core.js` + re-export in `index.js`, die Signale in `feedback.*`-Events übersetzt), 2 Dateien Gate (WRITABLE_ASSETS + Konfig-Prüfung), 2 Dateien Tests. `scoring-state.json`/`technical-profile.json`/`skill-triggers.json` **unverändert**.
- **Kopieren/Verwerfung sind Lücken:** kein DSH-Log-Event dafür; brauche eine UI-Plugin-Registry-Quelle (Beleg: §3.1).
- **Gated-Maschinen (Risiko):** Trust zieht in den simulierten Sessions auf 0.92–0.93 durch alleinige tool-calls + turn/end-completed, ohne inhaltliche Korrektur — das ist exakt der Gamed-Trust-Fall, den `SCORING-KONZEPT.md` §2.1 als "Reward-Sparsität" benennt.

---

## 1. Code-Ist

### A. Wer emittiert heute `shinon/feedback/*`?

**Niemand.**

| Suche | Beleg | Ergebnis |
|---|---|---|
| `shinon/feedback` (Signatur, Spine) | [packages/events/assets/event-spine.json:52–53](packages/events/assets/event-spine.json), [event-spine.mjs:80–82](scripts/gate/plugins/events-spine.mjs) | Typen *deklariert* (K1). `source: "shinon.feedback"` im Spine-Vertrag heißt: ein solches Event erwartet einen Emitter mit genau dieser Signatur — **aber es steht nirgendwo im Repo `ctx.emit('shinon/feedback/…')`**. |
| `ctx.emit` im ganzen Repo | [grep](#grep-beleg) | `prompter`, `task-router`, `narrative`, `popup`, `events`, `hook`, `markers` — **alle emittieren auf eigene Kanäle** (`shinon/prompter/decision`, `shinon/narrative/state`, `shinon/event`, …). Kein einziger Aufruf auf `shinon/feedback/*`. |
| `ctx.on('shinon/feedback/…')` | [grep](#grep-beleg) | Kein Treffer. Die Abnehmer-Seite ist leer. |
| `scoring`-Paket | [packages/scoring/index.js:60–75](packages/scoring/index.js) | `apply()` lädt nur die drei Verträge, loggt die Dimensionen und *gibt sie zurück*. `void ctx;` (Zeile 68) — der Host-Kontext wird nicht einmal berührt. Es gibt keinen `ctx.on`, keinen `ctx.emit`, keinen `ctx.inject`. |
| `events`-Paket | [packages/events/index.js:312–355](packages/events/index.js) | Der Spine **emittiert** `ctx.emit(config.emitChannel, envelope, payload)` (Zeile 326) auf `shinon/event` — aber die *Signal-Seite* (Zeile 345: `signals = Object.keys(contract.signals)`) wird durch `subscribe` abonniert. Die `shinon/feedback/*`-Signale fehlen in `contract.signals` (nur `shinon/session/created`, `shinon/message/*`, `shinon/tool/*`, `shinon/gate/*`, `shinon/action/blocked` — Beleg: [event-spine.json:42–54](packages/events/assets/event-spine.json)). Sie stehen im Spine als *Vertrags-Typen*, aber nicht als abonentbare Signale. |

**Schluss:** K1 (Eventtypen) + K3 (Kernel) + K4 (Gate) sind gebaut. **K5 (Emittierung) ist die Lücke, die der Report schließt.** Die Emitter-Seite ist `void ctx;` — ein bewusster K3-Stub, genau der Platz, an dem K5 andockt.

### B. Wo im Host/Client könnte der K5-Sammler sitzen?

**Antwort: Host-seitig, in `packages/scoring/index.js` — nicht im Client.**

Warum Host, nicht Client:

1. **Der K3-Kern ist bewusst lesend/rein** ([packages/scoring/index.js:8–12](packages/scoring/index.js)): "reines Replay: Anfangszustand + Event-Strom → Scorecard". K5 soll denselben Strom *speisen* — das ist ein Zustrom, kein Zustand. Das gehört in den Host, der den `ctx.on('shinon/event')`-Listener schon hat (Beleg: [scoring/index.js:48](packages/scoring/index.js) `Config.eventsChannel`).
2. **Client-Registry ist für *andere* Signale da** (UI-Plugin-Registry, Beleg: [packages/dashboard/client.js:40–46](packages/dashboard/client.js) — `window.__shinonPlugins` registriert `kind: 'client'`-Plugins). Der K5-Sammler braucht *keine* UI-Registry: er liest DSH-Events, die der Spine emittiert — kein Browser nötig.
3. **Client ist die einzige Quelle für `Kopieren`/`Verwerfung`** (Clipboard-Events, DOM-MutationObserver) — das ist eine *andere* Komponente, nicht der K5-Kern. Sie emittiert dann `shinon/feedback/copy`/`shinon/feedback/dismiss` über denselben Kanal. (Beleg: §3.1.)

**Konkret:**

- **K5-Emittierer (Sammler):** `packages/scoring/index.js` — neuer Abschnitt in `apply()`:
  - `ctx.on(config.eventsChannel, handler)` — Handler liest die Spine-Envelopes.
  - Für jede envelope: prüft `event_type` gegen die 7-Signal-Tabelle (Daten in `assets/signal-rules.json`).
  - Emittiert `ctx.emit('shinon/feedback/approval', { session_id, approval: <text> })` bzw. `ctx.emit('shinon/feedback/correction', { session_id, correction: <text> })`.
  - **Wichtig:** Die Emitter-Seite ist K5-eigen — K3 bleibt *reine* Replay. K5 *übersetzt* Roh-Signale in Feedback-Events, die K3 dann *konserviert*. Das sind zwei getrennte Zuständigkeiten: K5 = Sammler/Emittierer, K3 = Scorecard-Verwerter. Das Gate (K4) prüft nur K3 (lesend, statisch) — K5 ist neu und muss *neu* in den Gated-Scope.

- **Kopieren-Quelle (UI-Plugin-Registry):** `packages/scoring/client.js` (heute ein Platzhalter, Beleg: [packages/scoring/client.js:1–23](packages/scoring/client.js)). Neuaufbau:
  - Hängt sich an die DSH-UI-Primitives an (`use-copy-feedback` und `writeClipboard`, Beleg: [node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/use-copy-feedback.d.ts](node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/use-copy-feedback.d.ts), [clipboard.d.ts](node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/clipboard.d.ts)).
  - Registriert sich in `window.__shinonPlugins` (dieselbe Konvention wie [packages/events/client.js:18–22](packages/events/client.js)) unter `kind: 'client'`.
  - Emittiert `shinon/feedback/copy` über einen `ctx.emit`-Aufruf (Client-Seite).

### C. Minimal-Änderungsplan (welche Datei wird erstellt/geändert, ohne Code)

**Neu zu erstellen (1):**

| Datei | Zweck |
|---|---|
| `packages/scoring/assets/signal-rules.json` | Die 7-Signal-Tabelle aus [SCORING-KONZEPT.md §2.1](docs/SCORING-KONZEPT.md) als *Daten* (kein Code): Signalid → `{ type: 'feedback.approval' \| 'feedback.correction', strength: 'high' \| 'medium' \| 'low', source: 'host' \| 'ui' }`. Fail-closed: Signal nicht in Tabelle = nicht erkannt. |

**Zu ändern (4):**

| Datei | Änderung |
|---|---|
| `packages/scoring/index.js` | (1) `Config` um `rulesPath: z.string().default('./assets/signal-rules.json')` erweitern. (2) `apply()` um einen neuen Abschnitt: `ctx.on(config.eventsChannel, …)` + Emittierung auf `shinon/feedback/*`. (3) `export` um die neue `emitSignal(envelope, rules)`-Funktion (reine Übersetzung). |
| `packages/scoring/assets/scoring-core.js` | (1) Neue reine Funktion `translateSignal(envelope, rules)` → `{ event, reason }` (fail-closed: unbekannt = `{ event: null, reason: 'UNKNOWN' }`). (2) `export`-Liste in [index.js:16–25](packages/scoring/index.js) um `translateSignal` ergänzen. **Kein** `Math.random`, **kein** `Date.now`, **kein** `fetch` (K3-Regel bleibt). |
| `scripts/gate/plugins/scoring.mjs` | (1) `WRITABLE_ASSETS` um `assets/signal-rules.json` erweitern (aktuell: [scoring.mjs:34–38](scripts/gate/plugins/scoring.mjs)). (2) `READABLE_ASSETS` (Zeile 41) erbt automatisch. (3) `contractIssues` (Zeile 112) um eine Prüfung: jede Signal-Quelle im `signal-rules.json` muss eine bekannte `source` haben (`host`/`ui`), jedes `type` muss in `scoring.events` stehen. |
| `scripts/gate/tests/scoring.test.mjs` | Neue Tests: (a) `translateSignal` gegen echte Verträge = fehlerfrei. (b) `translateSignal` mit unbekanntem Signal = fail-closed. (c) `scopeIssues` erkennt `assets/signal-rules.json` als bekannte Datei (nicht mehr "ist keine bekannte Scoring-Datei"). (d) `staticIssues` auf `index.js`/`scoring-core.js` bleibt sauber (K5-Code darf keine `writeFileSync`/`Math.random`). |

**Unverändert (3 + Tests):**

- `packages/scoring/assets/scoring-state.json` — die Delta-Werte (correction −0.09/−0.05, approval +0.06/+0.03) sind **Basis**-Deltas. Die *Stärke*-Faktoren (high/medium/low) multiplizieren diese — das steht in [SCORING-KONZEPT.md §2.1](docs/SCORING-KONZEPT.md), und die K3-`applyEvent` kennt nur die Basis. **Offen-Punkt:** K5 muss entweder die Deltas *direkt* emittieren (Signal→exakter Delta-Wert) oder die K3-`applyEvent` um Stärke erweitern. **Empfehlung:** K5 emittiert den exakten Delta-Wert (feste Tabelle), K3 bleibt unverändert. (Beleg: §3.3.)
- `packages/scoring/assets/technical-profile.json`
- `packages/scoring/assets/skill-triggers.json`
- `packages/scoring/test/replay.test.mjs`

**Grenzenlage (Client):** `packages/scoring/client.js` — heute ein leeres Placeholder-Bundle (Beleg: [scoring/client.js:1–23](packages/scoring/client.js)). K5 *braucht* den Client nur für `Kopieren`/`Verwerfung` (UI-Registry). Wenn die UI-Registry fehlt (fail-closed), emittiert K5 diese beiden Signale *nie* — das ist der gewünschte Zustand. Der Client-Build ist eine *Sonderphase* von K5, nicht ein Hauptpfad.

---

## 2. Log-Analyse (tiefer als der Vorab-Scan)

> Datenquelle: `.session-eval/logs-decompressed/*.jsonl` (17 Sessions, DSH-Session v4).
> Methode: Python-Scan über `user/message`, `assistant/message` (stopReason), `turn/end`, `tool/call`.
> Definitionen (exakt wie der Vorab-Scan):
> - **Umformulierung (rephr):** `user/message` mit `source.kind == 'user'` *und* Zeitdifferenz < 90 s zum vorherigen `assistant/message` mit `stopReason == 'stop'`.
> - **Übernahme (adopt):** `tool/call` mit `name ∈ {write, edit}` *nach* dem vorherigen `assistant stop` (Zeit größer).
> - **Akzeptanz (acc):** `turn/end` mit `reason.kind == 'completed'` (nicht `error`, nicht `aborted`, nicht `interrupted`).

### 2.1 Pro-Session-Belege (seq + Text-Auszug)

**Session `74e2b11a` (45 recs, 2 user-messages, 1 rephr, 0 adopt, 2 acc)**

- **Umformulierung** (seq40, +83 s nach stop): `"Wird kein Cordis, aber das Proaktive ist schon mal richtig. Wir fangen aber bei 0 an, das heißt erstmal \"Kreative Phase\" – ich hab nämlich noch gar keinen Plan…"` — *Beleg: [74e2b11a seq40](.session-eval/logs-decompressed/__home__vannon__Dokumente__Projekte__Shinon-forge__sessions__--home-vannon-Dokumente-deepseek-harness-default-workspace--__session-74e2b11a-c935-46a4-a862-8bc92f8dd7b9__session.v4.jsonl.zstd.jsonl)*
- **Ebene-2-Fakt (Memory):** seq16 `"Shinon, hast du Lust, etwas Neues zu bauen?"` — *nicht* deklarativer Fakt, sondern eine *Anfrage* → Memory-Kandidat: "User möchte kreative Phasen, nicht strikte Task-Definitionen" (geleitet, nicht belegt — **Offen**).
- **Ebene-3-Fakt (Skill):** *"Kreative Phase = bei 0 anfangen, ohne Plan"* — **nicht nachgewiesen** als Skill, nur als *implizite* Präferenz in der Umformulierung.
- **Akzeptanz:** 2× `turn/end reason.kind == 'completed'` (seq35, seq43).

**Session `57b7febf` (1015 recs, 3 user-messages, 0 rephr, 20 adopt, 4 acc)**

- **Umformulierung:** keine (die 3 user-messages sind > 90 s nach dem letzten stop oder ohne stop davor).
- **Ebene-2-Fakt:** seq31 `"Ich kann kein Repository lesen oder bewerten, da ich keinen Zugriff auf Dateisysteme oder Repositorien habe…"` — *Korrektur durch den User*: Shinon hat behauptet, kein Repo lesen zu können, der User widerspricht (DSH *hat* `read`-Tools). → **taktischer Skill** (Ebene 3): "User erwartet DSH-Tool-Nutzung (read/grep), keine leeren Behauptungen über fehlende Zugriff".
- **Ebene-2-Fakt:** seq179 `"Analysiere bitte vier technische Probleme: 1. Ist Promter MAX aktiv? 2. … 4. … NUR ANALYSE, keine Lösungen."` → *Memory* (Ebene 2): "User bevorzugt reine Analyse ohne Lösungs-Vorschläge" (geleitet — **Offen**).
- **Übernahme:** 20× `tool/call name=write|edit` nach `stop` — *Beleg: Log-Seq, 20 aufeinanderfolgende tool-calls, von seq22 bis seq1015*.
- **Akzeptanz:** 4× `turn/end reason.kind == 'completed'` (seq24, seq174, seq227, seq347).

**Session `88b60337` (1039 recs, 21 user-messages, 14 rephr, 14 adopt, 21 acc)**

- **Umformulierung** (14 Fälle, Beispiele):
  - seq310 +45 s: `"Prüfe bitte lokale Branches, sind mehr als main?"`
  - seq323 +71 s: `"Lokales Main-Branch auf origin/main neu aufsetzen. Promter fixen, Scoring-Schicht sowie Umbau auf Changes prüfen."`
  - seq720 +32 s: `"Sag mir, was die Scoring-Liste bringen soll."`
  - seq737 +36 s: `"👍/👎 pro Antwort: Ich arbeite täglich mit LLM-Agents jedes Herstellers und habe diese Reaktionen höchstens aus Missclicks gegeben."` — **Ebene-3-Skill (Korrektur):** "User korrigiert die Scoring-Signal-Logik: 👍/👎 sind *Korrektur*-Signale, keine *Zustimmung*-Signale — sie kommen aus Missclicks."
  - seq895 +32 s: `"Fasse zusammen"` — **Umformulierung**: User will eine *Zusammenfassung*, nicht den nächsten Schritt → *Korrektur* (Ebene 1, Signal 4).
- **Ebene-2-Fakt:** seq745 `"Das ist schon besser. Die implizierte Signal-Erkennung würde Shionon in die Lage versetzen, die 'menschliche' Schicht besser zu simulieren und sich gleichzeitig an den Workflow des Nutzers anzupassen. Wichtig ist jedoch, dass die Arbeitsweise und die Gesprächsvorlieben des Nutzers getrennt bleiben."` → *Memory*: "User will getrennte Ebenen: Arbeitsweise (Scorecard) vs. Gesprächsvorlieben (Memory)" (belegt — **Ebene 2**, nicht 3).
- **Ebene-3-Skill:** seq981 `"Mir fällt gerade noch etwas ein: Die implizierten Signale sollten möglichst umfassend im Voraus ausgearbeitet werden, damit wir kein Scaffolding betreiben müssen."` → *taktischer Skill*: "Beim nächsten relevanten Task: Signale vorher ausarbeiten, kein Scaffolding".
- **Ebene-3-Skill:** seq1020 `"Spawne einen Planungs-Sub-Agent, der den Code überprüft, Web Search nutzt, um Tabellen aufzubauen, und zusätzlich meine Logs auswertet…"` → *taktischer Skill*: "Bei Planungs-Aufgabe: Sub-Agent mit Web-Search + Log-Analyse".
- **Akzeptanz:** 21× `turn/end reason.kind == 'completed'` (Beleg: [88b60337 turn/end scan](#21-pro-session-belege)).
- **Verwerfung (Signal 6):** *nicht nachgewiesen* — kein `turn/end reason.kind == 'rejected'` (DSH-Session v4 hat keinen `rejected`-Reason). `aborted reason.kind == 'user'` (seq363, seq844) ist eine *Abbruch*-Aktion, kein *Verwerfen* der Antwort.

**Session `c4cba376` (906 recs, 9 user-messages, 2 rephr, 17 adopt, 5 acc)**

- **Umformulierung:**
  - seq45 +34 s: `"püffe erstmal all installierten"` (Korrektur durch Umformulierung: "prüfe alle installierten").
  - seq522 +26 s: `"Ziehe alle Commits lokal"` (neue Frage, anderer Scope → *nächste Frage*, Signal 7, nicht Signal 4).
- **Ebene-3-Skill:** seq327 `"@shinon/hook fehlt meta.title — eine Zeile in package.json reicht; aktuell zeigt der Plugin-Manager einen Leerstring. 10 Bundles haben kein Icon — …"` → *Pitfall-Skill*: "Bei Plugin-Audit: `meta.title` und `Icon` prüfen, nicht nur Funktionalität".
- **Akzeptanz:** 5× `turn/end reason.kind == 'completed'`.
- **Verwerfung:** nicht nachgewiesen (keine `rejected`-Reason).

**Session `00690f8f` (808 recs, 6 user-messages, 6 rephr, 20 adopt, 5 acc)**

- **Umformulierung** (6 Fälle, alle < 90 s nach stop):
  - seq473 +5 s: `"promter soll aktiv ie goals anpasssen und auf max parralel mitlesen was der agent macht und findet um das autonome gol sinnvoll zu gestalten"`
  - seq565 +5 s: `"shinon-prompter] Aktiviert — registriert auf agent/pre-step (mode=MIN, agnes/agnes-2.0-flash, context=absent…)"` — *nicht* eine echte User-Nachricht (enthält Host-Logzeilen), **Abbruch-Korrektur** durch den User.
  - seq594 +6 s: `"behebe das promter soll Immer aktiv sein aber user input speichern zwecks verbesserung"`
  - seq663 +6 s: `"workspace ist immernoch nicht ausswählbar"` — *Korrektur*: "das Problem ist immer noch da".
  - seq672 +24 s: `"codemon isst nicht aktiv in dieser sesion ie läuf"`
  - seq737 +6 s: `"A 🌐 1-Click: http://127.0.0.1:3082/?token=…"` — *Korrektur*: "das ist der Link, den du gebraucht hast".
- **Ebene-2-Fakt:** seq473+seq594 zusammen: "User will prompter *aktiv* (mode=MIN reicht nicht) und will *User-Input speichern zur Verbesserung*" → *Memory*: "User bevorzugt proaktiven Prompter + Input-Verfolgung".
- **Akzeptanz:** 5× `turn/end reason.kind == 'completed'`.

### 2.2 Scorecard-Simulation (pro Session, exakte scoring-core.js-Regeln)

> Regeln: [scoring-state.json](packages/scoring/assets/scoring-state.json) (decay rate 0.02, cooling interval 3, initial correctness 0.5 / trust 0.5, clamp 0–1).
> Deltas: correction (medium) −0.09/−0.05, approval (medium) +0.06/+0.03, approval (low) +0.03/+0.02.
> **Annahme (dokumentiert, nicht belegt):** Pro Session werden die Signale in der Reihenfolge *rephr → adopt → acc* angewandt (alle rephr zuerst, dann alle adopt, dann alle acc). Jede Anwendung ist ein `applyEvent` mit *vorher* Decay.
> **Bezug zum Vorab-Scan:** Die Summen pro Session (1, 24, 49, 24, 31) unterscheiden sich um ±1 vom Vorab-Gesamt (3, 24, 48, 24, 30) — Ursache: mein `acc`-Zähler nimmt nur `reason.kind == 'completed'` (60 Akzeptanzen über 17 Sessions), der Vorab-Scan hat wahrscheinlich `aborted`/`interrupted` mitgezählt. **Die Summe über alle 17 Sessions ist identisch (172), die pro-Session-Verteilung ist ±1.**

| Session | rephr | adopt | acc | final_correctness | final_trust | relation |
|---|---|---|---|---|---|---|
| `74e2b11a` | 1 | 0 | 2 | 0.5324 | 0.5114 | known |
| `57b7febf` | 0 | 20 | 4 | **1.0000** | 0.9231 | known |
| `88b60337` | 14 | 14 | 21 | **1.0000** | 0.9332 | known |
| `c4cba376` | 2 | 17 | 5 | **1.0000** | 0.8435 | known |
| `00690f8f` | 6 | 20 | 5 | 0.9372 | 0.7725 | known |

**Kontrollrechnung (gegen Golden-Test [replay.test.mjs:55–77](packages/scoring/test/replay.test.mjs)):**
- 1× correction: 0.41/0.45 ✓ (Zeile 76: `correctness 0.41`).
- 1× approval-medium: 0.56/0.53 ✓ (Zeile 57: `correctness 0.56`).
- 1× approval-low: 0.53/0.52 ✓.
- 2× correction: 0.3218/0.401 (nicht im Golden-Test, aber nachvollziehbar).

**relation bleibt `known`:** kein `relation.updated` in den Logs (Beleg: [grep](#a-wer-emittiert-heute-shinonfeedback) — keine Emitter-Seite). `relation.initial == 'known'` aus [scoring-state.json:33](packages/scoring/assets/scoring-state.json).

### 2.3 Kopieren/Verwerfung: offene Lücke

- **Kopieren (Signal 1):** *nicht nachgewiesen* im DSH-Session-Log. Kein `clipboard`-Event, keine `copy`-DOM-Mutation im v4-Log (Beleg: [node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/clipboard.d.ts](node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/clipboard.d.ts) — DSH hat *nur* `writeClipboard`, kein Lese-Event). Die DSH-UI-Primitives kennen `use-copy-feedback` (ein Hook für den *Copy*-Button im Code-Block), aber *kein* DOM-Event, das ein fremdes Copy (Ctrl+C) erfasst. → **Braucht eine UI-Plugin-Registry-Erweiterung** (neues `@shinon/scoring`-Client-Plugin, Beleg: §3.1).
- **Verwerfung (Signal 6):** *nicht nachgewiesen* — DSH-Session v4 hat keinen `turn/end reason.kind == 'rejected'`. Die *nächstenkandidaten* sind `turn/end reason.kind == 'aborted' (reason.kind == 'user')` (2× in 88b60337: seq363, seq844; 1× in 00690f8f) — aber `aborted` ist eine *Abbruch*-Aktion (User drückt Stop), kein *Verwerfen* der Antwort. **Offen-Punkt:** Was ist die exakte Erkennungsregel für Verwerfung? (Beleg: [SCORING-KONZEPT.md §2.1](docs/SCORING-KONZEPT.md) — "Element entfernt, Task nicht fortgeführt". Das ist eine *UI*-Erkenntnis, kein DSH-Log-Event.)

---

## 3. K5-Umsetzungsplan

### 3.1 Konkrete Datei-Liste (neu + geändert), Reihenfolge, Abhängigkeiten

| # | Datei | Aktion | Abhängigkeit |
|---|---|---|---|
| 1 | `packages/scoring/assets/signal-rules.json` | **NEU** | — (Daten-Datei) |
| 2 | `packages/scoring/assets/scoring-core.js` | **ÄNDERN** | (1) |
| 3 | `packages/scoring/index.js` | **ÄNDERN** | (2) |
| 4 | `scripts/gate/plugins/scoring.mjs` | **ÄNDERN** | (3) |
| 5 | `scripts/gate/tests/scoring.test.mjs` | **ÄNDERN** | (4) |
| 6 | `packages/scoring/test/replay.test.mjs` | **ÄNDERN** (neue Testfälle für `translateSignal`) | (2) |
| 7 | `packages/scoring/client.js` | **ÄNDERN** (UI-Plugin-Registry für Kopieren/Verwerfung — *Sonderphase*, siehe §3.2) | (3) |

**Reihenfolge:** (1) → (2) → (3) → (4) + (5) parallel → (6) parallel → (7) danach.

**Abhängigkeiten:** (1) ist Daten (kein Code). (2) ist der reine Kern (CI-frei). (3) ist der Host-Emittierer. (4)/(5) sind das Gate (prüft (3)). (6) sind die Kern-Tests. (7) ist der Client-Registry (braucht (3) für den Kanal).

### 3.2 Gate-Änderung in `scripts/gate/plugins/scoring.mjs`

- `WRITABLE_ASSETS` (Zeile 34) um `'assets/signal-rules.json'` erweitern. `READABLE_ASSETS` (Zeile 41) erbt automatisch.
- `contractIssues` (Zeile 112) um eine Prüfung: (a) `signal-rules.json` muss das `contract`-Feld `shinon.signal-rules/v1` tragen. (b) Jedes Signal muss `type ∈ {feedback.approval, feedback.correction}` + `strength ∈ {high, medium, low}` + `source ∈ {host, ui}` tragen. (c) Jedes `type` muss in `scoring-state.json → events` stehen (fail-closed: ein erfundener Typ = Fehler).
- `scopeIssues` (Zeile 88) ändert sich *nicht* — die Pfad-Prüfung bleibt, sie erkennt jetzt `assets/signal-rules.json` als bekannte Datei (weil `READABLE_ASSETS` die neue Datei enthält).
- **Neu:** `staticIssues` (Zeile 70) — `index.js` enthält jetzt `ctx.on` + `ctx.emit` (K5-Emittierung). Die `FORBIDDEN_TOKENS`-Liste (Zeile 47) muss *nicht* erweitert werden — `ctx.on`/`ctx.emit` sind *erlaubt* (das ist der ganze Punkt von K5: der Emitter-Seite). **Aber:** die `FORBIDDEN_TOKENS` prüft `writeFileSync`, `fetch(`, `Math.random`, `Date.now` — **alle bleiben verboten**, auch im K5-Code. (Beleg: [scoring.mjs:47–65](scripts/gate/plugins/scoring.mjs).)
- `check()` (Zeile 225) — `ctx.repo.activeProfile` (Zeile 268) bleibt: das Profil muss `@shinon/scoring` laden (Zeile 271). K5 ändert *nichts* am Profil (das Paket ist schon aktiv, Beleg: [profiles/shinon/package.json](profiles/shinon/package.json), §1 von AGENTS.md).

### 3.3 Test-Planung

**`packages/scoring/test/` (neue Datei: `translate.test.mjs`):**

| Test | Aspekt |
|---|---|
| `translateSignal: echte Verträge sind fehlerfrei` | Die 7-Signal-Tabelle + die drei Vertrags-Dateien → jede `translateSignal`-Aufforderung (mit `envelope`) liefert ein gültiges `feedback.*`-Event (Beleg: [scoring-state.json](packages/scoring/assets/scoring-state.json) + [technical-profile.json](packages/scoring/assets/technical-profile.json) + [skill-triggers.json](packages/scoring/assets/skill-triggers.json)). |
| `translateSignal: unbekanntes Signal = fail-closed` | `envelope` mit `event_type` nicht in der `signal-rules.json` → `{ event: null, reason: 'UNKNOWN' }`. |
| `translateSignal: fehlende `source`-Dimension = fail-closed` | Signal ohne `source` → `{ event: null, reason: 'MISSING_SOURCE' }`. |
| `translateSignal: die 7 Signale, je eines, erzeugen die erwarteten Events` | Jedes Signal (Kopieren, Übernahme, …) → exakt ein `feedback.approval`/`feedback.correction` mit `session_id` + `approval`/`correction` (Beleg: [scoring-state.json:10–15](packages/scoring/assets/scoring-state.json) — Payload = `session_id` + `approval` oder `correction`). |
| `translateSignal: die Delta-Werte sind die exakten (Stärke × Basis)` | (a) `Kopieren` (high) → `approval` mit Delta +0.12/+0.06. (b) `Übernahme` (low) → `approval` mit Delta +0.03/+0.02. (c) `Umformulierung` (medium) → `correction` mit Delta −0.09/−0.05. **Das ist die K5-eigene Rechenregel** — K3 (scoring-core) kennt nur die *Basis*-Deltas (Beleg: [scoring-state.json:11](packages/scoring/assets/scoring-state.json)). K5 *übersetzt* (Signal → Delta), K3 *konserviert* (Delta → Scorecard). |

**`scripts/gate/tests/scoring.test.mjs` (Erweiterung der existierenden Datei):**

| Test | Aspekt |
|---|---|
| `scoring: die echte signal-rules.json ist fehlerfrei` | `contractIssues(scoring, profile, triggers, spine, 'scoring-state.json', signalRules)` → `[]`. |
| `scoring: ein erfundener Signal-Typ wird gemeldet` | `signalRules` mit `type: 'feedback.reject'` (nicht im Spine) → `contractIssues` meldet. |
| `scoring: ein Pfad außerhalb der bekannten Dateien (mit signal-rules) wird erkannt` | `scopeIssues([...sources, { file: 'x.js', source: "readFileSync('./assets/geheim.json', …)" }])` → meldet. |
| `scoring: der K5-Code (index.js) darf `writeFileSync`/`Math.random` nicht enthalten` | `staticIssues` auf `index.js` → `[]` (dass *neue* K5-Zeilen die `FORBIDDEN_TOKENS` *nicht* triggern). |

### 3.4 `signal-rules.json` (Inhalt, als Daten)

```json
{
  "contract": "shinon.signal-rules/v1",
  "note": "Die 7-Signal-Tabelle aus docs/SCORING-KONZEPT.md §2.1 als Daten. Signal nicht in Tabelle = nicht erkannt (fail-closed). Die Delta-Werte sind die exakten (Stärke × Basis-Delta aus scoring-state.json).",
  "signals": {
    "copy":       { "type": "feedback.approval",    "strength": "high",   "source": "ui",   "delta": { "correctness": +0.12, "trust": +0.06 }, "note": "Copy-Event auf ein ausgegebenes Element (UI-Registry)." },
    "adopt":      { "type": "feedback.approval",    "strength": "low",    "source": "host", "delta": { "correctness": +0.03, "trust": +0.02 }, "note": "write/edit-Tool nach stop (DSH-Carrier: tool/call name ∈ {write, edit}, time > last_stop)." },
    "selffix":    { "type": "feedback.correction",  "strength": "high",   "source": "ui",   "delta": { "correctness": −0.18, "trust": −0.10 }, "note": "User ändert ausgegebenen Text/Code selbst (UI-Registry, DOM-MutationObserver). Nicht nachgewiesen im DSH-Log — Lücke." },
    "rephrase":   { "type": "feedback.correction",  "strength": "medium", "source": "host", "delta": { "correctness": −0.09, "trust": −0.05 }, "note": "user/message (kind=user) < 90 s nach assistant stop (DSH-Carrier: user/message time, assistant/message stopReason)." },
    "accept":     { "type": "feedback.approval",    "strength": "medium", "source": "host", "delta": { "correctness": +0.06, "trust": +0.03 }, "note": "turn/end reason.kind == 'completed' (DSH-Carrier: turn/end reason)." },
    "dismiss":    { "type": "feedback.correction",  "strength": "high",   "source": "ui",   "delta": { "correctness": −0.18, "trust": −0.10 }, "note": "Element entfernt, Task nicht fortgeführt (UI-Registry). Nicht nachgewiesen im DSH-Log — Lücke." },
    "nextq":      { "type": "feedback.approval",    "strength": "low",    "source": "host", "delta": { "correctness": +0.02, "trust": +0.02 }, "note": "Neue user/message, *anderer* Scope (DSH-Carrier: user/message diff). Nicht implementiert — Scope-Erkennung fehlt (Offen-Punkt)." }
  }
}
```

**Offen-Punkt:** `nextq` (nächste Frage, Signal 7) braucht eine *Scope-Erkennung* ("anderer Scope") — die K5-Daten-Datei kann *notieren*, dass das Signal existiert, aber die *Erkennung* (host-seitig) fehlt, bis es eine scope-diff-Regel gibt. **Empfehlung:** `nextq` in der ersten K5-Fassung *nicht* emittieren (fail-closed: "nicht in der Tabelle = nicht erkannt"), sondern erst in K5.1, wenn die Scope-Erknung steht. (Beleg: [SCORING-KONZEPT.md §2.1](docs/SCORING-KONZEPT.md) — "was nicht in der Tabelle steht, wird nicht erkannt".)

### 3.5 K7-Lade-Regel (noch nicht da — explizit benannt)

[SCORING-KONZEPT.md §3](docs/SCORING-KONZEPT.md) (Umsetzungsplan): **K7a** ist die Lade-Regel ("wer lädt welchen Skill vor dem nächsten Task"). K7a *hängt* an K6 (Trigger/Lade-Korrektur), und K6 hängt an K5 + K8. **K5 (dieser Report) ist der erste Schritt.** K7a ist *nicht* Teil von K5 — die Lade-Regel ist ein separater Plan (K7a-Report). K5 emittiert die *Signale*, K7a *lädt die Skills*. (Beleg: [SCORING-KONZEPT.md §3, Zeile 238–242](docs/SCORING-KONZEPT.md).)

---

## 4. Risiken

### R1. Rauschen (Umformulierung vs. echte Korrektur)
**Beleg:** Die 14 `rephrase`-Signale in `88b60337` (Bezug: §2.1) sind *alle* `user/message (kind=user)` < 90 s nach `stop` — aber *nicht alle* sind echte Korrekturen. seq895 `"Fasse zusammen"` ist eine *Umspannung* (neuer Scope), keine *Korrektur* (gleiches Scope, andere Form). Die K5-Erkennungsregel "user/message < 90 s nach stop = rephrase" zieht *alle* 14 auf den *correction*-Delta (−0.09/−0.05), während seq895 eigentlich `nextq` (Signal 7, *nächste Frage*) sein sollte. **Risiko:** Eine Session mit 14 "Korrekturen" (davon ~4 echte Umspannungen) zieht `correctness` auf 0.59 — *unter* der initialen 0.5, obwohl die meisten nicht Korrekturen sind.
**Abhilfe (explizit in K5.1, nicht K5.0):** Die Scope-Erkennung (Signal 7, `nextq`) ist die Abhilfe — *deshalb* ist `nextq` in §3.4 als Offene-Lücke markiert. Solange sie fehlt, ist `rephrase` (Signal 4) *zu breit* — die 90-s-Regel erfasst auch echte Umspannungen. **K5.0 emittiert `rephrase` trotzdem (fail-open auf die Erkennung), aber der *Delta* ist der *medium*-Korrektur (−0.09/−0.05), nicht der *high* (−0.18/−0.10).** Das ist die konservativere Wahl (Beleg: [SCORING-KONZEPT.md §2.1](docs/SCORING-KONZEPT.md) — "Korrekturen wiegen stärker als Zustimmungen").

### R2. Fehlende clipboard-Quelle
**Beleg:** [node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/clipboard.d.ts](node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/clipboard.d.ts) — DSH hat *nur* `writeClipboard` (Schreiben), kein `copy`-DOM-Event. Die DSH-UI-Primitives kennen `use-copy-feedback` (Hook für den *Copy*-Button im Code-Block), aber *kein* globales DOM-Event für Ctrl+C. → **Kopieren (Signal 1) und Selbstkorrektur (Signal 3) sind *nicht* über DSH-Log-Events erkennbar.** Sie brauchen eine *UI-Plugin-Registry*-Erweiterung (neues `@shinon/scoring`-Client-Plugin, Beleg: §3.1, Zeile 7). **Risiko:** Wenn die UI-Registry fehlt (fail-closed), emittiert K5 diese Signale *nie* — das ist der *gewünschte* Zustand (fail-closed, kein Raten). **Aber:** Die *Simulation* (Zeile §2.2) zieht *kein* Kopieren/Selbstkorrektur ein (weil es im DSH-Log nicht nachgewiesen ist) — die Simulation ist eine *Untergrenze* für `correctness`/`trust`.

### R3. K7-Lade-Regel (noch nicht da)
**Beleg:** [SCORING-KONZEPT.md §3, Zeile 241](docs/SCORING-KONZEPT.md) — K7a hängt an K6, K6 hängt an K5. **Risiko:** K5 *emittiert* die Signale, aber *wer liest sie?* (a) K3 (Scorecard) — ja, die `feedback.*`-Events fließen in `applyEvent`. (b) K7a (Lade-Regel) — *noch nicht gebaut*. Bis K7a steht, ist K5 ein *Emittierer ohne Abnehmer* (außer K3). **Das ist kein Fehler — es ist der *Plan* (K5 → K6 → K7a).** (Beleg: [SCORING-KONZEPT.md §3](docs/SCORING-KONZEPT.md) — "K5 zuerst — ohne Signale keine Daten. K8 danach. K6 dann. K7a vor K7b".)

### R4. Gamed-Maschinen (Trust hochziehen)
**Beleg (eigene Simulation, §2.2):** `57b7febf`: 0 rephr, 20 adopt, 4 acc → `correctness 1.0000`, `trust 0.9231`. `88b60337`: 14 rephr, 14 adopt, 21 acc → `correctness 1.0000`, `trust 0.9332`. **Risiko:** Ein *Bot* (oder ein *Gamed-*User), der *nur* `tool/call name=write` nach `stop` und `turn/end completed` produziert, ohne *jemanden zu korrigieren*, zieht `trust` auf 0.92–0.93 — *weil* die `adopt`-Deltas (approval-low, +0.03/+0.02) und `acc`-Deltas (approval-medium, +0.06/+0.03) *summiert* die Dimensionen auf 1.0 schieben (clamp). **Die Asymmetrie (Korrekturen wiegen schwerer, Beleg: [SCORING-KONZEPT.md §2.1](docs/SCORING-KONZEPT.md)) hilft *nicht* gegen einen *reinen* Approval-Strom — es gibt *keine* Korrektur in der Session, also keine Asymmetrie, die greift.**
**Abhilfe (explizit, K5.1):** (a) **Kopieren-Quellen (UI) sind die Gegenkennzahl** — ein *Copy*-Event (high, +0.12/+0.06) wiegt *mehr* als ein *adopt* (low, +0.03/+0.02), aber ein *Copy* ist *beweiskräftiger* als ein *write* (der User hat *aktiv* kopiert, nicht nur *passiv* weitergeschrieben). Die K5-Unterscheidung "Copy > adopt" ist die *einzige* Gegenmittel gegen Gamed-Trust — aber sie *bringt* auch *mehr* Trust für *gute* Sessions (Beleg: §2.2). (b) **K7 (Skill-Improvement)** — ein *Skill*-Pitfall ("User korrigiert mich nie, ich ziehe Trust nur durch tool-calls") wäre die *taktische* Erkenntnis, die K7 *aus* den K5-Signalen *erzeugt*. **K5.0 ist der *erste* Schritt; Gamed-Maschinen sind ein *K7*-Problem, kein K5-Problem.** (Beleg: [SCORING-KONZEPT.md §1](docs/SCORING-KONZEPT.md) — "Skill-Improvement ist die Arbeit des *arbeitenden Modells* (Shinon)".)

### R5. `turn/end` mit `reason.kind == 'error'` (Fehlende Akzeptanz)
**Beleg:** `57b7febf` hat 1× `turn/end reason.kind == 'error'` (MISSING_CREDENTIAL, Beleg: [57b7febf turn/end scan](#21-pro-session-belege)). Die K5-Akzeptanz-Regel (`acc`) nimmt *nur* `reason.kind == 'completed'` (Beleg: §2, Definitionen). **Risiko:** Ein *Fehler* (kein `completed`) ist *weder* `acc` noch eine *Korrektur* — er wird *still* ignoriert (fail-closed, kein Raten). **Das ist korrekt** (Beleg: [SCORING-KONZEPT.md §2.1](docs/SCORING-KONZEPT.md) — "was nicht in der Tabelle steht, wird nicht erkannt"). **Offen-Punkt:** Soll ein `error`-turn *eine eigene* Korrektur sein? (Beleg: nicht in der 7-Signal-Tabelle — **nicht nachgewiesen** als K5-Signal, sondern als K5.1/Offen-Punkt.)

---

## 5. Was nicht geklärt werden konnte (1–2 Sätze)

1. **Die exakte Erkennungsregel für `dismiss` (Verwerfung, Signal 6) und `copy` (Kopieren, Signal 1) fehlt im DSH-Session-Log v4** — es gibt kein `clipboard`-Event und kein `turn/end reason.kind == 'rejected'`; beide Signale brauchen eine UI-Plugin-Registry, die in der installierten DSH-Fassung nicht existiert (Beleg: §2.3). *Offen, Vannon entscheidet.*
2. **Die K7-Lade-Regel (K7a) hängt an K5, ist aber ein *separater* Report** — K5 emittiert die *Signale*, K7a *lädt die Skills*; die *Kopplung* (wer liest die Scorecard, um einen Skill zu laden) ist nicht Teil dieses Reports (Beleg: [SCORING-KONZEPT.md §3](docs/SCORING-KONZEPT.md)). *Offen, K7a-Report folgt.*

---

## Anhang: Grep-Beleg (wer emittiert `shinon/feedback/*`?)

```bash
grep -rn "shinon/feedback\|ctx.emit\|ctx.on" packages/ scripts/ \
  | grep -v node_modules | grep -v "\.git/"
```

**Ergebnis (zusammengefasst, voller Output in `.session-eval/tmp/k5-grep.log`):**
- `ctx.emit`-Treffer: `prompter`, `task-router`, `narrative`, `popup`, `events`, `hook`, `markers` — **keiner** auf `shinon/feedback/*`.
- `ctx.on('shinon/feedback/…')`-Treffer: **keiner**.
- `shinon/feedback`-Treffer: nur in [event-spine.json:52–53](packages/events/assets/event-spine.json) (Signatur) und [events-spine.mjs:80–82](scripts/gate/plugins/events-spine.mjs) (Gate) — **kein Emitter**.

**Schluss:** *Niemand* emittiert heute `shinon/feedback/*`. K5 (dieser Report) ist die *erste* Emitter-Seite.

---

## Anhang: Korrektur der Übernahme-Messung (Lead-Review, 2026-10-11)

**Befund:** Die im §2 verwendete „Übernahme"-Zählung (Signal #2, 79 Fälle) ist **methodisch
ungültig**. Die gezählten `tool/call name=write|edit`-Events sind **Agenten-eigene** Tool-Calls
(das Modell schreibt Code), keine User-Übernahmen. Im DSH-Session-v4-Format existiert kein
Event „User hat den Agent-Output übernommen/editiert" — das wäre eine Client-UI-Ebene, die in
den Session-Logs nicht auftaucht.

**Konsequenz:**
- Signal #2 (Übernahme) ist aus den Logs **nicht ableitbar** — genauso wie Kopieren (#1),
  Selbstkorrektur (#3) und Verwerfung (#6). Alle vier brauchen eine UI-Plugin-Registry-Quelle.
- **Log-gültig sind nur:** Umformulierung (#4, rephrase < 90 s) und Akzeptanz (#5, turn/end
  completed). Nächste Frage (#7) braucht Scope-Erkennung, fehlt → ebenfalls nicht log-gültig.

**Korrekt-Simulation (nur rephrase + acceptance, exakte scoring-core.js-Regeln, decay 0.02 vor
Delta, round4, clamp, initial 0.5):**

| Session | rephr | acc | corr | trust | sig |
|---|---|---|---|---|---|
| 74e2b11a | 1 | 2 | 0.5324 | 0.5114 | 3 |
| 57b7febf | 0 | 4 | 0.7329 | 0.6164 | 4 |
| 5f7d6b94 | 4 | 7 | 0.5923 | 0.5293 | 11 |
| 88b60337 | 13 | 21 | 1.0000 | 0.6914 | 34 |
| a7d79bf4 | 1 | 2 | 0.5324 | 0.5114 | 3 |
| b023e7a8 | 2 | 5 | 0.6271 | 0.5546 | 7 |
| da62f7d6 | 0 | 0 | 0.5000 | 0.5000 | 0 |
| dee92b34 | 1 | 2 | 0.5324 | 0.5114 | 3 |
| f41931fc | 1 | 2 | 0.5324 | 0.5114 | 3 |
| 3950473e | 0 | 0 | 0.5000 | 0.5000 | 0 |
| 00690f8f | 5 | 5 | 0.3974 | 0.4270 | 10 |
| 0cda21b8 | 0 | 1 | 0.5600 | 0.5300 | 1 |
| 1bdbda17 | 0 | 0 | 0.5000 | 0.5000 | 0 |
| c4cba376 | 2 | 5 | 0.6271 | 0.5546 | 7 |
| d2c879e6 | 1 | 1 | 0.4718 | 0.4810 | 2 |
| e959bc2a | 0 | 0 | 0.5000 | 0.5000 | 0 |
| ef8d1df9 | 2 | 3 | 0.5087 | 0.4950 | 5 |
| **GESAMT** | **33** | **60** | — | — | **93** |

**Gamed-Trust-Korrektur:** Mit log-gültigen Signalen fällt trust **nicht** auf 0.92–0.93.
Der höchste Wert ist `88b60337` mit 0.6914 (13 Umformulierungen + 21 Akzeptanzen). Der
„Gamed-Trust"-Befund des ursprünglichen §2.2 beruht auf den ungültigen Übernahme-Zählungen
und ist damit **hinfällig** — das ist eine günstigere Nachricht: K5.0 (nur rephrase + acc)
produziert moderate Trust-Werte, kein Gamed-Trigger-Risiko bei der autonomy-Schwelle 0.7,
mit Ausnahme von `88b60337` (0.69, knapp unter 0.7).

**Offen bleibt:** Die vier UI-Signale (Kopieren, Übernahme, Selbstkorrektur, Verwerfung)
brauchen eine **DSH-Client-UI-Registry-Quelle**, die in der installierten Fassung fehlt
(Blocker-Kandidat). K5.0 emittiert sie nie (fail-closed).
