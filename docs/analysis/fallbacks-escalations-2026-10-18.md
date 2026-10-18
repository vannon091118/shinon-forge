# Shinon-Forge: Fallbacks und Eskalationen — vom Binären zum Benannten

> **Status:** current — Analyse der Fehlerpfade und Eskalationsketten, gegen den
> Baum geprüft. **Stand:** 2026-10-19 (Erstfassung 2026-10-18).
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`
>
> Jede Aussage unten ist an `HEAD` (`7a04959`) nachgemessen, nicht aus dem Plan
> abgeschrieben. Wo eine Zahl eine eigene Quelle hat (Stempel-Probe,
> Signal-Tabelle), steht der Pfad daneben — dort wird sie gepflegt, nicht hier.

## 1. Fallbacks im Prompter (`packages/prompter/`)

### 1.1 Sieben benannte Ausfälle statt eines stummen

`enhance()` und `enhanceGuarded()` in `packages/prompter/assets/enhancer.js`
unterscheiden heute sieben Ausfälle. Vorher waren sie stumm — der Code unterschied
sie nicht, und ein Fail-open nannte keinen Grund.

| Ursache | Code-Pfad | Grund im Ergebnis |
|---------|-----------|-------------------|
| 429/Provider-Fehler | `ctx.llm.stream()` wirft `ProviderError` | `LLM_FAILED:ProviderError` |
| Zeitlimit | `AbortSignal.timeout` / `AbortSignal.any` bricht ab | `LLM_FAILED:TimeoutError` |
| Keine Route | `config.provider` oder `config.model` leer | `NO_ROUTE` |
| Kein LLM-Dienst | `ctx.llm.stream` fehlt | `NO_LLM_SERVICE` |
| Kein JSON | `parseResult()` findet keine Klammer | `NO_JSON` |
| Falsches JSON | `JSON.parse()` wirft | `INVALID_JSON` |
| Kaputter Aufruf | `enhanceGuarded()` fängt | `INTERNAL_ERROR:<Name>` |

Dazu kommt der Erfolgspfad der Rettung: eine übernommene Prosa-Antwort endet als
`outcome: 'accepted'` mit `reasons: ['SALVAGED_PROSE']` — nicht als Veredelung mit
JSON-Feldern. **Beleg:** `packages/prompter/test/enhancer-guards.test.mjs`
(Testnamen nennen den Grund, z. B. „Zeitlimit: der Abbruch endet als
LLM_FAILED:TimeoutError").

### 1.2 Fail-open wird bedienbar

Bei jeder Ablehnung sammelt der Enhancer Diagnose:

- **Chunk-Zählung** (`collectStreamStats`): trennt „leerer Stream" von „falsches Format".
- **Finish-Grund und Usage**: `reason=stop` gegen `reason=(keine)`.
- **Rohtext-Log**: die verworfene Antwort steht auf stderr, gedeckelt auf 6000 Zeichen.
- **Anfrage-Kurzform** (`describeRequest`): Route, System-/Nutzergröße, Grenzen.

### 1.3 Retry: genau EIN Aufruf

```js
// packages/prompter/test/enhancer-guards.test.mjs
assert.equal(fake.calls.length, 1, 'der Enhancer wiederholt nicht selbst — die Retry-Zahl ist 1');
```

Die Wiederholung gehört `llm-retry`. Der Key-Router beobachtet 429 nur und gibt
weiter; sein Kommentar nennt den Grund ausdrücklich: „wer hier eingriffe, baute
eine zweite Wiederholungs-Logik über denselben Fehler"
(`packages/key-router/index.js`, `stopErrors`).

### 1.4 Prosa-Rettung — und ihre offene Kante

Wenn das Modell statt JSON auf Deutsch antwortet, rettet `salvageProse()` den
Text: Zaun entfernen, Vorrede entfernen, Anführungszeichen entfernen, mindestens
acht Zeichen mit Buchstaben. Danach der **Anker-Check**: mindestens 35 % der
Wörter (vier Buchstaben und mehr) des Roh-Prompts müssen im geretteten Text
stehen, sonst bleibt es beim Verwerfen.

**Gemessen an `HEAD` (2026-10-18), und das ist eine offene Kante:** steht ein
Füllwort vor der Vorrede, greift `PROSE_PREAMBLE` nicht, weil der Ausdruck mit
`^` verankert ist. Der Anker-Check besteht trotzdem, weil der Auftrag im Text
vorkommt — also wird die **ganze** Antwort übernommen, samt „Klar! Hier ist dein
verbesserter Prompt:". Aus der Rettung wird damit ein Fail-open, das eine
Plauderei an die Stelle des Prompts setzt. Beispiel:

```
salvageProse('Klar! Hier ist dein verbesserter Prompt: teste das', 'teste das')
→ 'Klar! Hier ist dein verbesserter Prompt: teste das'
```

Kein Test pinnt diesen Fall. Solange er offen ist, gilt: die Rettung ist besser
als ein leerer Prompt, aber sie ist kein Beweis, dass der Text eine Veredelung ist.

## 2. Eskalation durch den Task Router (`packages/task-router/`)

### 2.1 Deterministische Threshold-Entscheidung

```js
// packages/task-router/index.js
export const INTENT_WEIGHTS = { CHAT: 0, LOOKUP: 0, TRANSFORM: 0, MULTI_STEP_TASK: 2, LONG_RUNNING_GOAL: 3 };
export const DEFAULT_THRESHOLD = 2;
export const DEFAULT_MIN_RAW_LENGTH = 24;
```

`DECISION_RULES` prüft der Reihe nach und nennt den ersten Grund, der greift:
`NO_RECORD`, `FOREIGN_RECORD`, `NO_CLASSIFICATION`, `INTENT_UNDEFINED`,
`UNKNOWN_CLASS:<x>`, `BELOW_THRESHOLD:<w><<t>`, `NO_GOAL_WEIGHT`,
`BELOW_MIN_RAW_LENGTH:<n><<m>`, `GOAL_CANDIDATE:<class>`. Nur der letzte erzeugt
ein Goal; alle anderen stufen auf `linear` zurück.

**Zwei gemessene Beispiele, die den Unterschied zeigen:**

| Eingabe | Länge | Klasse | Ergebnis |
|---|---|---|---|
| `test schreiben` | 14 | `MULTI_STEP_TASK` | `BELOW_MIN_RAW_LENGTH:14<24` — die Längenregel greift |
| `fix den test` | 12 | `UNDEFINED` | `INTENT_UNDEFINED` — die Längenregel kommt nie zum Zug |

Das zweite Beispiel ist kein Router-Fehler, sondern eine Lücke in
`packages/prompter/assets/intent-rules.json`: „fix den test" trifft kein Pattern,
obwohl „test schreiben" es tut.

### 2.2 `activate=false`: sicherer Start

```yaml
# profiles/shinon/cordis.patch.yml
- id: shinon-task-router
  config: { threshold: 2, minRawLength: 24, activate: false, maxGoalRounds: 6 }
```

Bei `activate: false` beurteilt der Router weiter jede Eingabe und emittiert
`shinon/task-router/decision` mit `outcome: 'goal'` oder `'linear'` — aber
`activateGoal()` kehrt mit `ACTIVATION_DISABLED` zurück, bevor `ctx.goals`
angefasst wird. Ein bereits bestehendes Goal wird nie überschrieben.

### 2.3 Eskalationskette

```
Prompt → Intent-Resolver (Runtime, kein Modell) → Task Router (DECISION_RULES)
                                                      ↓ GOAL_CANDIDATE + activate: true
                                        ctx.goals.create(agent, { objective, maxGoalRounds })
                                                      ↓
                                        DSH-Runden (DSH erlaubt 256, Shinon 6)
                                                      ↓
                                        Agent-Teams/Subagenten — nur wenn das Profil sie lädt
```

Die letzten beiden Glieder sind **bedingt**, nicht automatisch: der Agent-Team-
Baustein steht in `profiles/shinon/package.json`, und `activate: false` hält die
Kette heute an. `maxGoalRounds: 6` ist Shinons Stop-Policy gegen die 256 Runden,
die DSH selbst zulässt.

## 3. Kontext-Erhalt durch den Index (`packages/project-index/`)

### 3.1 MAX: Datei ODER Index — die Datei gewinnt

MAX war an eine JSON-Datei gebunden (`contextPath`); ohne sie blieb der Modus
gesperrt (`MODE_NEEDS_CONTEXT`). Heute ist der Index eine zweite Quelle über
`ctx.provide`:

```js
// packages/project-index/index.js
ctx.provide(QUERY_SERVICE, createQueryService({ indexFile: file, workspaceRoot: options.root }))
```

Der Prompter fragt ohne Import (Paket-Isolation) und prüft den Vertrag. Die
Gründe sind gestaffelt und werden im Entscheidungsdatensatz geführt:

| Lage | Grund |
|---|---|
| kein Dienst angeboten | `MODE_NEEDS_CONTEXT` |
| Dienst da, aber `resolveContext` liefert `null` | `MODE_NEEDS_INDEX` |
| fremder Vertrag oder unlesbare Antwort | `CONTEXT_INVALID` |

**Wichtig:** eine vorhandene Kontextdatei gewinnt weiterhin gegen den Dienst
(`scripts/gate/tests/context-wiring.test.mjs`, „MAX: eine Datei gewinnt gegen den
Dienst"). Der Index ist die zweite Quelle, kein Ersatz.

### 3.2 Paket-Isolation

`@shinon/prompter` importiert `@shinon/project-index` nicht. Die Naht sind zwei
Literale — Dienstname `shinon_index_query`, Vertragsname
`shinon.project-index/query-v1` — gepinnt von
`scripts/gate/tests/context-wiring.test.mjs` auf beiden Seiten.

### 3.3 Änderungserkennung

Die Politik ist `verify: stamp` (Vorgabe des Pakets, im Profil ausdrücklich
gesetzt): neben Größe und mtime entscheidet der Inode-Stempel (Gerät, Inode,
Größe, mtime, ctime). Belege und Grenzen stehen in
`docs/probes/project-index-stempel.json` — dort auch die Zahlen: sechs von sechs
zurückgesetzten Änderungen erkannt, 24 921 gelesene Bytes (2 % des Baums) statt
eines Vollaufs, `verify: changed` erkennt null von sechs. Der eine `stat` mehr ist
im Median nicht messbar (58,7 ms gegen 58,6 ms); `verify: all` kostet 100,1 ms
und liest jedes Mal alles. Grenze: ein Stempel ist kein Inhaltsnachweis.

## 4. Persona und Lernen

### 4.1 Events und Narrative: kein Reset pro Turn

Der Spine (`packages/events/index.js`) beobachtet, normalisiert, validiert und
emittiert auf `shinon/event` — mit sha256-Digest und kanonischem JSON. Das
Narrative (`packages/narrative/index.js`) liest denselben Strom, führt seinen
Zustand im Speicher und emittiert `shinon/narrative/state`.

Präzise: der Zustand bleibt über **Turns** erhalten, über einen **Neustart**
nicht — er wird beim Mount neu aufgebaut. Persistent ist nur, was in einer Ablage
liegt (siehe 4.3).

### 4.2 Signale: fünf gewertet, eines gezählt, zwei ausdrücklich nicht

Die Tabelle steht in `packages/scoring/assets/signal-rules.json`; sie ist die
Quelle, nicht dieses Dokument. `native` ist der DSH-Ereignistyp, aus dem das
Signal entsteht.

| Signal | `native` | Art | Stärke |
|---|---|---|---|
| `copy` (Zustimmung per Bewertung) | `feedback/message-put` | `feedback.approval` | medium |
| `selffix` (Ablehnung per Bewertung) | `feedback/message-put` | `feedback.correction` | high |
| `rephrase` (Frage kommt wieder) | `user/message` | `feedback.correction` | medium |
| `accept` (Turn endet regulär) | `turn/end` | `feedback.approval` | low |
| `dismiss` (Abbruch oder Widerruf) | `turn/end`, `feedback/message-delete` | `feedback.correction` | medium |
| `noted` (Bemerkung) | `feedback/record` | — | keine: gezählt, nie gewertet |
| `adopt`, `nextq` | — | — | `observable: false`, wird nicht geraten |

Die Stärke ist eine Kategorie, kein Delta: `high` verdoppelt das Basis-Delta,
`medium` lässt es, `low` halbiert es (`limits.strengths` in derselben Datei). Die
Zahlen „+0.06 / −0.05 / +0.03" stammen aus dem K5-Plan
(`docs/archive/session-eval-2026-10-17/k5-plan-report.md`) und sind Basis-Deltas
der Scorecard — nicht das, was das Scoring heute je Signal ausgibt. Der Widerruf
ist exakt: `feedback.retracted` nimmt die Zeile zurück, die dieselbe `messageId`
eingebracht hat, und die Tafel wird aus dem Rest neu gerechnet.

### 4.3 Persona: Zustand, Stimme — und seit dem Selbstmodell auch Gedächtnis

Die Grenze der Persona steht in `packages/persona/index.js`: Identity sind
statische Abschnitte (Config-Werte), State wird aus den Events des Spines
abgeleitet (`deriveState`, kein Modell), Voice ist eine Stimme je Mood aus dem
Zustandsvertrag. Der Mood kommt aus den Events, nicht aus einer Modellmeinung.

Das Narrative ist ein **eigener** Kanal: die Persona hört auf
`shinon/narrative/state` und rendert daraus den Abschnitt `shinon:narrative-arc`.
Sie übernimmt den Composite ausdrücklich **nicht** in ihren Mood — gelesen, nicht
umgedeutet.

Seit dem Selbstmodell (`packages/persona/assets/self-model.js`) gibt es zusätzlich
Gedächtnis über den Prozess hinaus: Ausgänge des Veredlers und Fehlerarten werden
gezählt, eine Grenze entsteht ab drei Beobachtungen, eine offene Frage ab zwei,
Alterung nimmt beides zurück. Gespeichert wird das Modell als Dokument
`self-model` im Namensraum `shinon.persona-self/v1` der Ablage
`shinon_index_store` — dieselbe Ablage wie das Scoring, eigener Raum, und die
Persona schreibt weiterhin keine Projektdatei. Im Prompt steht der Abschnitt
`shinon:self-model`; die Leiste im Client liest `__shinonPersonaState` und die
Route `/shinon/persona/state`. Ohne einen einzigen Lauf bleibt der Abschnitt
leer, statt einen Satz zu erfinden.

## 5. Gesamtbild

### Vorher (typisches LLM-Verhalten)

```
Eingabe → Modell → JSON parse → OK oder Absturz
```

### Nachher (Shinon)

```
Eingabe → Intent-Resolver (Runtime) → Task Router (DECISION_RULES, neun Gründe)
    ↓
One-Shot-Enhancer → sieben Ausfälle benannt, Diagnose, Prosa-Rettung (mit offener Kante)
    ↓
Project Index → MAX-Kontext: Datei gewinnt, Index ist die zweite Quelle
    ↓
Events/Spine → Narrative (im Prozess) und Persona-Zustand (aus Events)
    ↓
Selbstmodell (belegt, persistent) → Abschnitt shinon:self-model
    ↓
Scoring: fünf Signale gewertet, eines gezählt, zwei nicht beobachtbar
    ↓
Agent-Teams/Goals — nur bei GOAL_CANDIDATE und activate: true
```

### Warum das robuster ist

1. **Jeder Fehlerpfad hat einen Namen** — kein „irgendwas ist schiefgegangen".
2. **Fail-closed statt Raten** — unbekannte Zustände werden gemeldet; was nicht
   beobachtbar ist (`adopt`, `nextq`), wird nicht erfunden.
3. **Kein Modell für Klassifikation** — Intent ist eine Runtime-Entscheidung.
4. **Kontext geht nicht verloren** — der Index wird über den Stempel konsistent
   gehalten, und eine Datei bleibt eine gültige erste Quelle.
5. **Kontinuität hat zwei Formen** — Narrative über Turns, Selbstmodell über
   Neustarts. Die zweite ist die belastbare.
6. **Lernen ist deterministisch** — Gewichte aus Ereignissen, nicht aus
   Modellannahmen.

### Grenzen, die dazugehören

- Fragen werden klassifiziert, aber nie expandiert — das ist Absicht, sonst
  beantwortet der Agent seine eigene erfundene Aufgabe.
- `fix den test` klassifiziert nicht (siehe 2.1); die Pattern-Tabelle hat dort
  eine Lücke.
- Die Prosa-Rettung kann eine Plauderei übernehmen (1.4); der Fall ist offen und
  nicht gepinnt.
- `activate: false` hält die Eskalationskette an — beurteilt wird, gehandelt nicht.
- Der Narrative-Zustand ist pro Prozess; nur das Selbstmodell überlebt den Neustart.

## Code-Referenzen

| Aspekt | Datei | Symbol |
|---|---|---|
| Fehlergründe | `packages/prompter/assets/enhancer.js` | `enhance`, `enhanceGuarded` |
| Prosa-Rettung | `packages/prompter/assets/enhancer.js` | `salvageProse`, `PROSE_PREAMBLE` |
| Fehlerpfade (Test) | `packages/prompter/test/enhancer-guards.test.mjs` | `enhanceGuarded()` |
| Router-Gewichte | `packages/task-router/index.js` | `INTENT_WEIGHTS`, `DEFAULT_THRESHOLD`, `DEFAULT_MIN_RAW_LENGTH` |
| Entscheidungstabelle | `packages/task-router/index.js` | `DECISION_RULES` |
| Goal-Aktivierung | `packages/task-router/index.js` | `activateGoal`, `GOAL_SERVICE` |
| Context-Service | `packages/project-index/index.js` | `createQueryService`, `ctx.provide(QUERY_SERVICE, …)` |
| Event-Spine | `packages/events/index.js` | `loadContract`, Emission auf `shinon/event` |
| Narrative | `packages/narrative/index.js` | `advance`, `STATE_CHANNEL` |
| Signal-Tabelle | `packages/scoring/assets/signal-rules.json` | `sources`, `signals`, `limits.strengths` |
| Selbstmodell | `packages/persona/assets/self-model.js` | `observeDecision`, `observeError`, `selfModelSummary` |
| Persona-Naht | `packages/persona/index.js` | `UI_STATE_GLOBAL`, `UI_STATE_ROUTE`, `SELF_MODEL_NAMESPACE` |
| Stempel-Belege | `docs/probes/project-index-stempel.json` | Messung und Grenzen |

---

**Ergebnis:** Shinon ersetzt die Binärität „Modell antwortet / Modell versagt"
durch benannte Fehlerpfade, deterministische Entscheidungen und zwei Formen von
Kontinuität — und lässt die offenen Kanten stehen, statt sie zu überschreiben.
