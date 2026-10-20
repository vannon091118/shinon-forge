# E2E-Stresstest „Leitstand" — welche Shinon-Systeme greifen wirklich?

> **Status:** current — Messbericht eines echten 9-Turn-Laufs in der DSH-Oberfläche; Befunde benannt, Grenzen benannt. · **Stand:** 2026-10-19
> **Belege:** `docs/probes/leitstand-probe-vor-audit-2026-10-19.json`,
> `docs/probes/leitstand-probe-final-2026-10-19.json`,
> `docs/probes/leitstand-mutations-2026-10-19.json`,
> `docs/probes/leitstand-report-2026-10-19.json`
> **Harness:** `scripts/e2e/probe.mjs`, `scripts/e2e/mutate.mjs`, `scripts/e2e/report.mjs`, Protokoll `scripts/e2e/scenario.json`.
> Alle Zahlen dieses Dokuments stammen aus diesem Lauf; sie sind **keine** Aussage über
> den Repo-Bestand (der steht in `docs/ZAHLEN.md`).

## 1. Was gefahren wurde

Ein echtes Projekt (`BRIEF.md`: Dispositionsoberfläche für eine Kurierflotte, Node ≥ 22,
keine Laufzeitabhängigkeiten) in einem echten DSH-Prozess:

| Punkt | Wert |
|---|---|
| DSH | gepinnter Pin aus `node_modules/.bin/dsh --profile shinon`, Port 3099 |
| Home | `/mnt/work/projects/leitstand-home` (geseedet, `.env` verlinkt) |
| Workspace | `default-workspace` |
| Modell | `agnes/agnes-2.5-flash` |
| Turns | 9 (159 Steps, 19,6 Mio. Token, Cache-Treffer 91 %) |
| Ergebnis | 25 Dateien, `npm test` Exit 0, **103 Tests** |
| Pflanzen | 6 Inkonsistenzen zwischen den Turns, 2 strukturelle Befunde |

Der Lauf ist kein Skript-Test: die Chat-Schritte wurden in der Oberfläche gefahren,
`probe`/`mutate`/`report` lesen danach die Quellen, die unabhängig vom Chat existieren
(Index-SQLite, Ledger-SQLite, Session-Store, Prozesslog inkl. stderr).

## 2. Was die Systeme tatsächlich taten

Legende: **AUS** = registriert sich für diesen Workspace nicht · **SICHTBAR** = aktiviert,
keine Spur im Lauf · **SPUR** = Log-Zeile belegt eine Entscheidung · **WIRKUNG** = am
Artefakt messbar. Kein Paket erreichte **WIRKUNG**.

| Paket | Klasse | Beleg aus dem Lauf |
|---|---|---|
| project-index | SPUR (veraltet) | Lauf **einmal** beim Mount: 1 Datei (BRIEF.md), 6 Symbole, 2 Chunks. Am Ende: **1 von 25** Dateien. `resolveContext('Welche Dateien regeln die Zustandsmaschine und die Kapazitaet?')` → **0 Dateien, 0 Symbole, `tokens: null`**. |
| prompter | SPUR (Wirkung nicht belegt) | 9 Traces, **9× `intent=UNDEFINED`**, 0 Pattern-Treffer bei 92 Patterns. 4 One-Shot-Antworten angenommen, **5 verworfen** (`NO_JSON`/`INVALID_JSON`, einmal `Request was aborted`; `timeoutMs: 15000`). Eine Auswahl der 23 Bausteine ist im Log nicht belegt (keine Zeile nennt sie). |
| scoring | SPUR (global) | 70 Score-Zeilen in **22 Sitzungen**, davon **9** aus diesem Lauf (eine je Turn) — alle `signal=accept`, `reason=completed`. Beim Boot: „Stand geladen: 61 Signale, 23 offene Sitzungen" aus **fremden** Projekten. Kein `workspace`/`root_id` im Datensatz (`workspaceField: false`). |
| persona | **AUS** | `[shinon-persona] … ist nicht das Shinon-Projekt — Persona-Abschnitte werden NICHT registriert`. In einem echten Projekt gibt es keine Persona. |
| task-router | SPUR | 9× `linearer Turn (INTENT_UNDEFINED)`; keine Ziel-Erkennung, kein Micro-State. |
| hook | SICHTBAR | `registriert auf agent/pre-step (verdict=allow, trace=an)` — keine Entscheidung im Lauf. |
| events | SPUR | 12 Signale gebunden; `authority NONE`; zwei `UNKNOWN_SIGNAL` (`job/registered`, `job/settled`). |
| narrative | SICHTBAR | aktiviert (50 Ereignisse Hot, Freeze 20), kein Ereignis im Projekt sichtbar. |
| key-router | SICHTBAR | „2 Anbieter, 2 Plätze", kein Override. |
| markers / traceability / token-usage / popup / dashboard / tooltip / core / locale-de / better-errors | SICHTBAR | Aktivierungszeile, danach keine messbare Wirkung auf Dateien oder Antworten. |
| codingmon | SICHTBAR | Pet-Spiegel aktiv, kein Stand; kein Einfluss auf die Arbeit. |
| openapi, mobile | nicht im Profil | `dsh.inactive` in den Manifesten. |

Der Prompter hat in 4 von 9 Turns den Prompt wirklich ersetzt — aber alle vier
Entscheidungen liefen mit `intent=UNDEFINED` und einem Kontext aus **einer** Datei.
Die fünf Ausfälle sind benannt (siehe §5), nicht still.

## 3. Die gepflanzten Inkonsistenzen

Eingebaut zwischen den Turns, ohne Hinweis an das Modell. „Erkannt" heißt: ein späterer
Turn nennt die Stelle oder repariert sie; „Quelle" sagt, **wer** den Fund trug.

| # | Pflanze (nach Turn) | Erkannt | Repariert | Quelle | Beleg |
|---|---|---|---|---|---|
| 1 | `delete-test`: Testdatei wird Stub, `npm test` bleibt grün | Turn 2 | Turn 8 | Modell | Turn 2 nennt Datei/Zeile; Turn 8 stellt 14 Tests wieder her |
| 2 | `comment-contradiction`: Kommentar „volle Kapazität wird abgelehnt" gegen `>` im Code | **nein** | nein | — | steht nach Turn 9 unverändert in `src/domain/assignment.js:34` |
| 3 | `duplicate-rule`: zweite Übergangstabelle mit falschem Ziel | Turn 9 | Turn 9 | Modell | Turn 9 nennt `src/domain/shipment-regeln.js` und löscht sie |
| 4 | `etag-ignore`: `If-Match` wird ignoriert | Turn 8 | Turn 8 | **Abnahme** | 103 Tests bleiben grün; erst der echte Server zeigt 200 statt 409 |
| 5 | `innerhtml`: `entry.by` landet in `innerHTML` | Turn 7 | Turn 7 | **Test** | `test/web.test.mjs` fällt mit Exit 1 (XSS-Regel) |
| 6 | `todo-contradiction`: README sagt „Kapazitätsprüfung ist optional" | Turn 9 | **nein** | Modell | Turn 9 nennt sie „irreführend", der Satz bleibt stehen |

Quote: **5 von 6 erkannt, 4 von 6 repariert.** Zwei Widersprüche überleben den Audit:
der Code-Kommentar und die README-Zusage.

Zwei strukturelle Befunde kamen ohne Pflanze dazu:

- **`test/api.test.mjs` prüft eine Kopie.** Die Datei definiert `bootServer()` mit eigenem
  Handler und importiert `src/api/server.js` nie. 103 grüne Tests beweisen für die
  ausgelieferte API **nichts**; der ETag-Fehler (Pflanze 4) überlebte sie.
- **`GET /shipments/:id` liefert keinen Verlauf.** Der Abnahmelauf (Turn 8) fand es;
  die Tests nicht. Die Detailansicht ist damit auf den Verlauf aus PATCH-Antworten
  angewiesen.

## 4. Warum der Index blind ist

`packages/project-index/index.js` startet den Lauf **einmal** nach dem Mount
(`setImmediate` → `start()`), es gibt keinen Watcher und keinen Reindex bei
`shinon_index_query`. In einem Chat, der das Projekt erst **baut**, ist der Index damit
ab dem zweiten Turn veraltet: er beschreibt den Baum von Turn 0.

Gemessen: Boot 01:08 (1 Datei), Ende 02:12 (**25 Dateien**), Index unverändert 1 Datei.
Die Abfrage zu Zustandsmaschine und Kapazität liefert `[]` — MAX arbeitet also mit
leerem Kontext, obwohl der Baum voller Antworten ist. Das ist der größte Einzelbefund
des Laufs: der Project Index ist vorhanden, grün und ohne Einfluss.

## 5. Die fünf benannten Ausfälle des Prompters

Aus `stderr` des Laufs (die Zeilen stehen dort, nicht in `stdout`):

1. `[shinon-prompter] verworfene One-Shot-Antwort (INVALID_JSON), 1072 Zeichen` — Turn 2.
2. `(NO_JSON) … Finish: reason={"kind":"aborted","failure":{"message":"Request was aborted"}}` — Turn 3, Abbruch bei 15 s.
3. `(NO_JSON)` — Turn 4, nach 735 Zeichen.
4. Zwei weitere Verwürfe ohne verwertbares JSON (insgesamt 5 in 9 Turns).
5. Der Trace nennt nur `accepted|rejected`, **nicht** den Grund; der Grund steht eine
   Zeile darüber im Log und ist im Panel nicht sichtbar.

Der Enhancer läuft mit `maxTokens: 0` (kein Limit) und `timeoutMs: 15000`. Turn 1
brauchte 11,9 s und kam durch; der nächste lange Lauf wurde abgebrochen und endete als
`NO_JSON`. Fünf Ausfälle in neun Turns sind bei diesem Tempo kein Ausnahmefall.

## 6. Was das für „grün" heißt

Grün ist in diesem Lauf dreierlei, und nur eins davon bedeutet etwas:

| Grün | Bedeutung |
|---|---|
| `npm test` 103/103 | prüft die Tests, die da sind — nicht die API, nicht den Verlauf |
| Logzeilen `Aktiviert` | das Paket ist geladen — nicht, dass es etwas bewirkt |
| Abnahme gegen den echten Server | fand ETag-Fehler und fehlenden Verlauf |

Die Inkonsistenzen wurden gefunden von: dem Modell beim eigenen Lesen (2), einem
Projekt-Test (1), dem Abnahmelauf (1) — und in **keinem** Fall durch injizierten
Shinon-Kontext. Das ist keine Aussage über die Idee der Systeme, sondern über ihren
Zustand in diesem Lauf: der Index ist eingefroren, der Enhancer fällt in der Hälfte der
Turns aus, die Persona ist außerhalb ihres Repos bewusst aus.

## 7. Grenzen

- Eine Sitzung, ein Modell, ein Workspace — keine Statistik, ein Befund.
- Die Web-Oberfläche wurde nicht in einem echten Browser bedient; geprüft wurden
  Dateibestand, Tests und Server-Antworten.
- Die Pflanzen sind bewusst „menschlich" (Kopie, Kommentar, Doku-Satz), aber von Hand
  gesetzt; ein echter Teamverlauf hat andere Drift.
- `probe.mjs` liest den Index-Cache und den Ledger des **Hosts**; ein Lauf mit anderem
  `XDG_*` braucht die passenden Pfade als Argument.

## 8. Wiederholung

```
node scripts/e2e/probe.mjs  --workspace <projekt> --out probe.json
node scripts/e2e/mutate.mjs --case <id> --root <projekt> [--dry-run|--list]
node scripts/e2e/report.mjs --workspace <projekt> --log <stdout> --log-stderr <stderr> \
     --store <session.json> --mutations <mutations.json> --out report.json
```

`mutate.mjs` ist fail-closed: ein fehlender Anker endet mit Exit 1 und schreibt nichts.
`report.mjs` verlässt sich auf keine Modellaussage; fehlt eine Quelle, steht der Grund im
Feld statt einer Zahl.
