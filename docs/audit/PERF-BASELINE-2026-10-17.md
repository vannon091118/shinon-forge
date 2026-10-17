# Performance-Baseline und gebündeltes Index-Öffnen (F1) und Referenz-Matcher (F2)

> **Status:** current — Baseline je lokalem Schritt, die daraus abgeleiteten Umbauten (Meta-Batch, `forgetFile`-Skip, Referenz-Matcher) und ihre Wirkungsmessung. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md` (Bestand) · **Rohdaten:** [`docs/probes/perf-baseline.json`](../probes/perf-baseline.json) und [`docs/probes/index-cold-breakdown.json`](../probes/index-cold-breakdown.json)

Gemessen am Arbeitsbaum auf `main` bei `1fd90f9c85b247d41e6299ca3c9f251a759e556f`
(schmutzig: die Dateien dieser Slices sind noch nicht committet), Node `22.23.3`,
gepinntes `dsh 0.2.1-alpha.1`, 6 Kerne AMD FX-6300. **Vorher** (Last 6,51 / 7,47 /
6,78) stand der Baum unverändert; danach wurden **drei** Stellen in
`packages/project-index/assets/index-core.js` mit je eigener Messung geändert,
alle am selben Tag: (1) sieben `setMeta`-Aufrufe im Öffnen → `setMetaMany`, eine
Transaktion (F1, Last 4,57 / 4,55 / 5,60), (2) der `forgetFile`-Skip gegen den
leeren Index (F2, bauminstabile Fixture), (3) der Referenz-Matcher — einmal je
Lauf gebaut, nicht je Datei (dieser Abschnitt, §2.1 und §5.1).

## 1. Was gemessen wurde

Jeder Fall läuft auf **derselben** Fixture: der Repo-Baum selbst (428 indexierbare
Dateien), die eingefrorene Scoring-Fixture, ein synthetischer Prompt (kein
Repo-Inhalt) und eine feste `agent/pre-step`-Nutzlast. Je Stichprobe `reps`
Operationen, die Zeit durch `reps` geteilt; P50/P95 mit linearer Interpolation;
2 Aufwärmläufe. `index-cold` hat **7** statt 25 Läufe (jeder Lauf schreibt eine neue
~20-MB-SQLite-Datei), im Bericht als `runs: 7` geführt.

| Fall | was | Art | blockiert den Loop | teilt Zustand |
|---|---|---|---|---|
| `workspace-resolve` | `resolveWorkspaceRoot` + `fingerprintRoot` | rein | nein | nein |
| `file-scan` | `listFiles` über den Baum | synchrones FS-Lesen | **ja** | nein (nur lesend) |
| `index-open` | `openIndex` + `close` auf vorhandener Datei | SQLite schreiben | **ja** | **ja** (Indexdatei) |
| `index-cold` | `openIndex` + `updateIndex` auf leerer Datei | SQLite schreiben + Parsen | **ja** | **ja** (neue Datei) |
| `index-warm` | dasselbe, nichts verändert | SQLite schreiben | **ja** | **ja** (Indexdatei) |
| `scoring-replay` | `replay` über den ganzen Signalstrom | rein | nein | nein |
| `one-shot-local` | `enhanceGuarded` gegen lokalen Fake-Strom | async nur am Provider | nein | nein |
| `one-shot-fallback` | derselbe Weg, Provider wirft (429) | async nur am Provider | nein | nein |
| `agent-pre-step` | `readStep` + `stepIssues` + Envelope + Prüfung | rein | **ja** (im Host) | nein |

**Nicht gemessen:** die Modellantwort und das Netz, der DSH-Host-Turn, Browser/UI.
Der echte Turn ist damit `NOT_VERIFIED` — er ist auch nicht der Gegenstand dieser
Frage. Ebenso wenig der Gate-Runner: ein serieller Gate-Lauf ist keine Turn-Latenz
und steht deshalb nicht in dieser Tabelle.

## 2. Die Baseline (nach dem Umbau, Stand F2)

Einheit: **ms je Operation**. `n` = Stichproben. Die Tabelle trägt den Baum
**nach** beiden Produktionsänderungen (Meta-Batch F1, `forgetFile`-Skip F2); die
jeweiligen Vorwerte stehen in §4 und §5.

| Fall | n | min | P50 | P95 | max | sd | Größe der Eingabe |
|---|---|---|---|---|---|---|---|
| `workspace-resolve` | 25 | 0,006 | 0,007 | 0,008 | 0,008 | 0,001 | Repo-Root |
| `file-scan` | 25 | 2,912 | **3,937** | 9,862 | 12,100 | 2,316 | 430 Dateien |
| `index-open` | 25 | 125,4 | **166,6** | 201,9 | 225,9 | 21,7 | 430 Dateien, 21,2 MB DB |
| `index-cold` | 7 | 8075,5 | **8478,5** | 9378,7 | 9523,5 | 499,2 | 4,01 MB gelesen, 424 Dateien geschrieben |
| `index-warm` | 25 | 225,7 | **350,6** | 931,9 | 1531,4 | 280,1 | 0 Bytes gelesen, 0 geschrieben |
| `scoring-replay` | 25 | 0,085 | **0,121** | 0,164 | 0,206 | 0,027 | 7 Datensätze |
| `one-shot-local` | 25 | 0,096 | **0,120** | 0,138 | 0,168 | 0,017 | Request 1282 B ≈ 320 Token |
| `one-shot-fallback` | 25 | 0,034 | **0,038** | 0,048 | 0,061 | 0,006 | 67 B |
| `agent-pre-step` | 25 | 0,244 | **0,266** | 0,281 | 0,285 | 0,010 | 20 Nachrichten |

Jede Stichprobe trug denselben Fingerabdruck (`stability.stable: true`, ein
distinkter Wert je Fall): Dateizahl 430, `written` 424 kalt und 0 warm, derselbe
Scorecard-Digest, `accepted`, `LLM_FAILED:ProviderError`, derselbe `event_id`. Die
Zahlen sind also nicht aus verschiedenen Zuständen gemittelt.

Abgeleitet, **nicht** als eigener Fall gemessen: `index-warm` minus `index-open`
ist der Anteil des Spaziergangs über 430 unveränderte Dateien (Stempelprüfung,
`touches`-Abgleich, ein Commit) — hier 184 ms; die Streuung beider Fälle ist
größer als dieser Unterschied, siehe §5.

## 2.1 Die Baseline nach dem Referenz-Matcher

Einheit: **ms je Operation**. `n` = Stichproben. Rohdaten: derselbe Befehl wie
in §7, Stand 2026-10-17 nach dem Matcher-Umbau (§5.1). Vorherwerte der F2-Streie
stehen im Absatz über der Tabelle.

| Fall | n | min | P50 | P95 | max | sd | Größe der Eingabe |
|---|---|---|---|---|---|---|---|
| `workspace-resolve` | 25 | 0,006 | **0,006** | 0,007 | 0,007 | 0,000 | Repo-Root |
| `file-scan` | 25 | 2,562 | **3,372** | 4,667 | 6,829 | 0,881 | 434 Dateien |
| `index-open` | 25 | 158,2 | **167,2** | 182,5 | 208,6 | 9,5 | 434 Dateien, 21,2 MB DB |
| `index-cold` | 7 | 2949,8 | **3095,7** | 3637,3 | 3796,1 | 262,1 | 4,04 MB gelesen, 428 Dateien geschrieben |
| `index-warm` | 25 | 250,9 | **283,7** | 313,8 | 359,2 | 20,5 | 0 Bytes gelesen, 0 geschrieben |
| `scoring-replay` | 25 | 0,099 | **0,140** | 0,241 | 0,246 | 0,041 | 7 Datensätze |
| `one-shot-local` | 25 | 0,094 | **0,107** | 0,136 | 0,150 | 0,013 | Request 1282 B ≈ 320 Token |
| `one-shot-fallback` | 25 | 0,029 | **0,037** | 0,050 | 0,054 | 0,006 | 67 B |
| `agent-pre-step` | 25 | 0,239 | **0,269** | 0,325 | 0,340 | 0,026 | 20 Nachrichten |

Jede Stichprobe trug denselben Fingerabdruck (`stability.stable: true`, ein
distinkter Wert je Fall): Dateizahl 434, `written` 428 kalt und 0 warm, derselbe
Scorecard-Digest, `accepted`, `LLM_FAILED:ProviderError`, dieselbe `event_id`.
Der Spaziergang (`index-warm` − `index-open`) ist gegenüber §2 von 184 ms auf
117 ms gefallen, und der Kaltlauf von 8478,5 auf **3095,7 ms** (−5382,8 ms,
−63 %); die absolute Höhe bleibt lastabhängig (Vergleichsläufe anssonst im selben
Tag: 2978,6 und 3159,2 ms, geringere Last), der kontrollierte Teil steht in
§5.1. Der Baum hatte zu diesem Stand 434 indexierbare Dateien (die Test- und
Skriptzeilen dieses Slices mitgezählt); §2 trägt die F2-Streie bei 430.

## 3. Was synchron ist, was Zustand teilt, was unabhängig ist

- **Synchron und billig:** `workspace-resolve` (6 µs), `scoring-replay` (0,13 ms),
  `one-shot-local` (0,11 ms), `agent-pre-step` (0,27 ms). Diese vier können den
  Eventloop nicht messbar belegen, und keiner von ihnen teilt Zustand — sie sind
  bereits frei parallelisierbar, nur lohnt es nicht.
- **Synchron und teuer:** `file-scan` (3,4 ms) liest nur, schreibt nichts; er ist
  der billigste Teil des Indexwegs. `index-open`, `index-warm` und `index-cold`
  laufen **im aufrufenden Thread** und schreiben in **dieselbe** SQLite-Datei.
  Zwei solche Läufe gleichzeitig sind kein Speedup, sondern ein `busy_timeout`:
  der Engpass ist ein Schreiber, nicht fehlende Nebenläufigkeit.
- **Schon ausgelagert:** der Profil-Mount schiebt den Startscan über
  `runIndexInWorker` aus dem Loop (Beleg: `scripts/index-scan-cost.mjs`). Er
  blockiert den Agenten also nicht — er kostet 9,7 s CPU/IO, bevor Kontext
  verfügbar ist. Das ist die eigentliche Frage, nicht „wie viele Worker?".
- **Der One-Shot** ist nur an der Provider-Grenze asynchron; alles davor und
  danach (Request bauen, Chunks zusammensetzen, Vertrag prüfen) kostet 0,11 ms.
  Ein Fallback kostet 0,04 ms — der Fehlerpfad ist nicht der Engpass.

## 4. Der Engpass, der Kandidat und seine Wirkung

Der Indexweg ist um **vier Größenordnungen** teurer als alles andere: 9,7 s für
428 Dateien (≈ 23 ms je Datei, 20,5 MB Ausgabe aus 3,97 MB Eingabe). Der
Dateiscan ist daran mit 3,4 ms beteiligt — 0,03 %. Wohin die Sekunden im
Einzelnen gehen, steht in §5: nicht ins Lesen.

Auffällig war der Festpreis des Öffnens: er hängt nicht am Inhalt (eine
Drei-Dateien-Datenbank öffnete im selben Zeitfenster ebenso langsam wie die
20-MB-Datei). Die Ursache war zählbar: `openIndex` setzte sieben Meta-Zeilen —
4× Fassung, 3× Root — in **sieben eigenen Transaktionen**, und jede Transaktion
ist auf dieser Maschine ein fsync. Die gepaarte Diagnose misst beide Varianten
abwechselnd in derselben Schleife, gleiche Zeilenzahl, dieselben Pragmas; im
letzten Lauf: **735,3 ms** für sieben einzelne Commits (644,0–917,5 ms) gegen
**133,8 ms** für eine Transaktion (n = 5).

**Umgesetzt:** `openIndex` schreibt seine Meta-Zeilen jetzt über `setMetaMany` in
einer Transaktion (`packages/project-index/assets/index-core.js`). Gepinnt von
`scripts/gate/tests/project-index.test.mjs`: alle sieben Schlüssel sind danach da,
und im Rumpf von `openIndex` steht kein einzelner `setMeta`-Commit mehr. Folge
der Transaktion: die Fassung wird ganz oder gar nicht gesetzt — ein Abbruch mitten
im Öffnen hinterlässt keine halb gesetzten Meta-Werte mehr.

| Fall | vorher P50 | nachher P50 | Δ |
|---|---|---|---|
| `index-open` | 912,2 ms | 276,1 ms | **−636,1 ms** |
| `index-warm` | 801,3 ms | 360,0 ms | −441,3 ms |
| `index-cold` | 10610,0 ms | 9698,7 ms | −911,3 ms |
| `file-scan` (Kontrolle, unverändert) | 5,112 ms | 3,380 ms | −1,7 ms |
| `scoring-replay` (Kontrolle) | 0,128 ms | 0,128 ms | ±0 |
| `agent-pre-step` (Kontrolle) | 0,270 ms | 0,267 ms | −0,003 ms |

**Wie belastbar das ist:** der unveränderte Dateiscan fiel ebenfalls (5,1 → 3,4 ms),
ein Teil des Rückgangs ist also Last. Unabhängig davon ist die **gepaarte**
Diagnose im selben Lauf: sieben Commits 735,3 ms gegen eine Transaktion 133,8 ms —
und genau diese sieben Commits macht das Öffnen nicht mehr. Die Mikro-Fälle als
Kontrolle stehen still (0,128 → 0,128; 0,270 → 0,267). Ein zweiter Nachher-Lauf bei
niedrigerer Last (3,46) ergab `index-open` **168,0 ms**; die absoluten Zahlen
schwanken mit der Last und mit der fsync-Latenz dieses Rechners (die Diagnose
maß auf unverändertem Code 342,7 ms in einem und 735,3 ms in einem anderen Lauf). Der **kontrollierte** Teil ist die gepaarte Diagnose; der Vorher/Nachher-
Vergleich ist eine Messung auf einer geteilten Maschine, kein A/B im Labor. Für
eine stabile Absolutzahl ist derselbe Befehl auf einer ruhigen Maschine zu
wiederholen.

**Nicht empfohlen:** eine Background-Queue oder mehr Parallelität. Der teure Teil
ist ein einziger Schreiber; eine Queue würde die Wartezeit nur verschieben.

## 5. Zerlegung des Kaltlaufs (gemessen)

Die Frage aus §4 war offen: 9,7 s für 428 Dateien — Lesen, Parsen oder Schreiben?
Gemessen mit [`scripts/index-cold-cost.mjs`](../../scripts/index-cold-cost.mjs): derselbe
Kaltlauf, die SQLite-Zeit über einen Proxy um die **echte** Verbindung, jede
JS-Phase einzeln mit den exportierten Funktionen des Kerns in der Reihenfolge von
`indexFile`. Fixture: 424 Dateien, 4,01 MB gelesen, 1758 Referenznamen, 2 Läufe.

| Phase | ms | Anteil |
|---|---|---|
| Referenzen scannen (`findReferences`) | 4905,4 | **46,4 %** |
| SQLite im Update (Inserts, Deletes, Commit) | 2693,1 | **25,5 %** |
| Index anlegen (Schema + Meta, erster Lauf) | 1334,8 | 12,6 % |
| Regex je Datei kompilieren | 403,2 | 3,8 % |
| Redigieren / Secret-Scan (beide Runden) | 347,8 | 3,3 % |
| Extrahieren (Symbole, Kanten, Chunks) | 76,9 | 0,7 % |
| Lesen (beide Durchgänge) | 59,0 | 0,6 % |
| SHA-256 (beide Hashes je Datei) | 46,5 | 0,4 % |
| stat je Datei | 10,2 | 0,1 % |
| nicht zugeordnet (Schleife, Zeilenaufbau, Proxy, GC) | 696,3 | 6,6 % |
| **Gesamt** | **10573,3** | 100 % |

Dazu die SQLite-Posten einzeln: `commit` 908,5 ms, `delete:chunks_fts` 1004,4 ms,
`insert:references` ~405 ms, `insert:chunks_fts` ~142 ms, `prepare` ~107 ms; alle
übrigen Inserts und Deletes zusammen unter 100 ms.

**Das Lesen trägt nichts.** Beide Durchgänge zusammen 59 ms (0,6 %), beide Hashes
46 ms (0,4 %) — der Baum liegt im Page-Cache, und 4 MB sind keine Arbeit. Die
Sekunden stecken in zwei Posten: dem **Referenzdurchgang** (Regex über 1757 Namen,
je Datei neu gebaut und Zeile für Zeile gescannt: 5,3 s mit der Kompilierung) und
den **SQLite-Schreibvorgängen** (2,7 s im Update plus 1,3 s für das Anlegen des
Schemas).

### Kandidaten (gemessen, nicht gebaut)

1. **Referenzdurchgang, 5,3 s.** `findReferences` baut für **jede** Datei ein
   Alternations-Regex aus bis zu 1757 Namen (Kompilierung 403 ms) und scannt dann
   jede Zeile. Der Name-Satz ist innerhalb eines Laufs konstant — einmal bauen
   spart die 403 ms; die 4,9 s Scan brauchen einen anderen Weg (Datei einmal
   tokenisieren, Bezeichner gegen ein `Set` schneiden). Das ist der größte Hebel.
2. **`forgetFile` auf leerem Index, ~1,0 s.** Je Datei laufen neun `delete`s, die
   nichts finden; das FTS-`delete` allein kostet 1004 ms (9,5 %) — mehr als Lesen,
   Hashen, Redigieren und Extrahieren zusammen (530 ms). Der Dateidurchgang weiß,
   ob es eine Vorzeile gibt (`before === undefined`).
3. **Schema-Anlage, ~0,73 s.** Neun `SCHEMA`-Statements werden einzeln ausgeführt:
   gepaarte Diagnose **727,9 ms einzeln gegen 83,2 ms in einer Transaktion** —
   dasselbe Muster wie die sieben `setMeta`-Commits aus §4.
4. **Kein Kandidat:** doppeltes Lesen und doppeltes Hashen (zusammen 0,1 s), das
   Redigieren (0,35 s), das Extrahieren (0,08 s). Sie stehen hier als gemessene
   Absage, nicht als Aufgabe.

**Grenzen der Zerlegung:** die Phasen wurden nacheinander gemessen, der echte Lauf
verzahnt sie je Datei; die 6,6 % „nicht zugeordnet“ sind der Fehlerterm dieser
Methode (Schleife, Zeilenaufbau, die Proxy-Schicht selbst, GC). Die Summe erklärt
den Lauf bis auf 0,6 %, aber die Anteile sind keine Physik: Last und fsync-Latenz
verschieben sie (der Vergleichslauf davor: 10,15 s gesamt, Referenzen 48,3 %,
SQLite 24,0 %).

### Umgesetzt worden (F2): „forgetFile“-Skip gegen leeren Index

Aus dieser Zerlegung ist **eine** Produktionsänderung bedient (F2 erlaubt
höchstens eine): `indexFile` löscht seine neun Zeilengruppen nur noch, wenn der
Durchgang weiß, dass die Datei schon Zeilen hatte (`known: before !== undefined`).
Es liegt kein Cache und keine Queue vor — aber es entfällt nachweislich Arbeit.
Zwei Stellen in [`packages/project-index/assets/index-core.js`](../../packages/project-index/assets/index-core.js),
gepinnt von `scripts/gate/tests/project-index.test.mjs` (der Aufruf übergibt das
Wissen, und `indexFile` leert nur bei `options.known !== false`); die Verhaltens-
zusage „geänderte Datei wird vor dem Neuschreiben geleert“ bleibt als eigener
Test bestehen.

Vorher/Nachher auf **identischer** Fixture (Baumkopie ohne `.git`, `node_modules`
und `dist`, vom selben Instrument gemessen, 3 Läufe je Seite, Last 5,8):

| | vorher | nachher | Δ |
|---|---|---|---|
| Kaltlauf gesamt (P50) | 10056,7 ms | **8759,6 ms** | −1297,1 ms (−12,9 %) |
| SQLite im Update | 2318,4 ms | 1398,7 ms | −919,7 ms |
| `delete:chunks_fts` | 1002,5 ms | **0 ms** | Kategorie entfällt |
| Referenzdurchgang | 4999,8 ms | 5148,1 ms | +148,3 ms (Last) |
| Index anlegen | 893,5 ms | 964,4 ms | +70,9 ms (Last) |

Der A/B-Bericht nennt den Median (n = 3); P50/P95 aus dem anschließenden
Vollstand des Instrumentes: `index-cold` **P50 8478,5 / P95 9378,7 ms** (7 Kaltläufe,
430 Dateien, Last 4,45). Vor F2 lag dasselbe Feld bei 9698,7 ms.

**Output-Diff:** beide Index-Dateien zeilenweise verglichen — `files` 423 / 423,
`symbols` 3438 / 3438, `edges` 1051 / 1051, `references` 64303 / 64303,
`touches` 246 / 246, `chunks` 2095 / 2095, `secret_findings` 15 / 15, `meta` 9 / 9.
Der einzige Zeilenunterschied ist `meta.updated_at_ms` (Laufzeitstempel),
ausgeklammert als Lauflage. Zählungen und Inhalt sind **identisch**.

**Fehler/Fallback:** keine im Kaltlauf (kein Netz, kein Modell); die Baseline
behält die Fehlerpfade `one-shot-fallback` P50 0,038 ms und `LLM_FAILED:ProviderError`. **Requestgröße:** 4 011 908 Bytes gelesen je Kaltlauf, FTS-Spalte `body` in beiden Indizes gleich. Kein Cache, keine Queue, keine Parallelisierung; Workspace-Root und Fassung sind die der bestehenden Index-Datei.

### Umgesetzt (dritter Umbau desselben Tags): der Referenz-Matcher, einmal je Lauf

**Ursprung:** Kandidat 1 der obigen Zerlegung — der Referenzdurchgang baute den
Alternations-Regex über bis zu 1760 Namen **je Datei** (Kompilierung 400,8 ms,
Scan 4876,1 ms im Vorher-Instrument) statt einmal je Lauf. Der Umbau in
`packages/project-index/assets/index-core.js`: **vor** der Implementierung
steht das Verhalten als Test in `scripts/gate/tests/project-index.test.mjs`
über drei Zusagen (TDD-Rot: 2 neue Tests rot, 49 grün).
**Vertrag:** `createReferenceMatcher(names)` liefert einen Matcher mit `.scan(text)`,
der für reine Wort-Namen (`/^[A-Za-z0-9_]+$/`) jeden Texttoken gegen ein `Set`
prüft (ein Legacy-`\b`-Treffer an reinen Wortnamen ist exakt der Tokenaufruf) und
sonst den **einmal gebauten** Legacy-Ausdruck fährt. Die Vorbehandlung ist
dieselbe wie in `findReferences` (`slice(0, MAX_REFERENCE_NAMES)` **vor** dem
`RESERVED_WORDS`-Filter); `findReferences` selbst bleibt als Export und als
Diagnosephase im Instrument.

**Grün später:** dieselbe Testdatei **51/51** (Exit 0), und die Äquivalenz am
echten Baum (`scripts/index-match-eq.mjs`): 428 Dateien, **0 Zeilendiff** —
Legacy, Matcher und die gespeicherte Tabelle `references` tragen je 64 681
zeilenidentische Einträge.

**Wirkung, kontrolliert im selben Instrument:** Legacy-Referenzweg (diagnose,
nach dem Umbau gemessen) Kompilierung 401,9 + Scan 6045,7 = **6447,6 ms** gegen
Matcher Bauen 0,4 + Scan 231,4 = **231,8 ms** (−96,4 %). Der integrierte
Kaltlauf fällt von 8478,5 (§2, F2-Stand) auf **3095,7** (§2.1); gleiches
Instrument zu geringerer Last: 2978,6 und 3159,2 ms.

**Neue Zerlegung** (Instrument, 428 Dateien, oberste Zahl = Median aus 2 Läufen,
Rohdaten [`docs/probes/index-cold-breakdown.json`](../probes/index-cold-breakdown.json)):

| Phase | ms | Anteil |
|---|---|---|
| SQLite im Update (Inserts, Deletes, Commit) | 1292,1 | **40,9 %** |
| Index anlegen (Schema + Meta, erster Lauf) | 900,9 | 28,5 % |
| Redigieren / Secret-Scan (beide Runden) | 365,7 | 11,6 % |
| **Referenzen scannen (Matcher je Datei)** | 231,4 | **7,3 %** |
| Extrahieren (Symbole, Kanten, Chunks) | 85,1 | 2,7 % |
| Lesen (beide Durchgänge) | 62,6 | 2,0 % |
| SHA-256 (beide Hashes je Datei) | 52,2 | 1,7 % |
| Regex je Lauf kompilieren (Matcher gebaut, einmal) | 0,4 | 0,0 % |
| stat je Datei | 6,4 | 0,2 % |
| nicht zugeordnet (Schleife, Zeilenaufbau, Proxy, GC) | 162,5 | 5,1 % |
| **Gesamt** | **3159,2** | 100 % |

**Grenze:** der Baum wuchs zwischen den Messtabellen auf 434 Dateien (§2 trägt
430) — die Test- und Skriptzeilen dieses Slices sind mitindiziert; der
kontrollierte Teil ist der instrumentengepaarte Legacy-/Matcher-Vergleich, der
Vorwert des Kaltlaufs gilt vom F2-Stand, die Lastwarnung von §4 gilt unverändert.

## 6. Grenzen dieser Baseline

- **Last:** 6,5–7,5 vorher, 3,5–5,6 nachher, auf 6 Kernen. Die Streuung ist groß
  (im Vorher-Lauf sd bis über 70 % des P50 bei `index-warm`, nachher bis 33 %), und
  die Fälle wurden nacheinander gemessen: ein Vergleich **zwischen** Fällen über
  verschiedene Zeitfenster ist unterhalb der Streuung nicht interpretierbar. Im
  Vorher-Lauf war `index-warm` (801 ms) sogar kleiner als `index-open` (912 ms),
  obwohl warm mehr Arbeit enthält — genau deshalb stehen hier P50 **und**
  min/max/sd und die gepaarte Diagnose.
- **fsync-dominiert:** die absolute Höhe ist eine Eigenschaft dieses Rechners
  (virtuelle Platte unter Last: ein Commit 0,13–1,2 s). Auf einer ruhigen NVMe
  werden dieselben Codepfade deutlich kleinere Zahlen zeigen; übertragbar ist die
  **Struktur** (1 Commit je Öffnen statt 7, 1 je Update, 422 Schreibvorgänge je
  Kaltlauf).
- **Kein Modell:** Turn-Latenz, 429-Verhalten am echten Provider und Token usage
  sind `NOT_VERIFIED`. Der lokale Anteil daran ist mit 0,03–0,13 ms gemessen und
  damit als Engpass ausgeschlossen.
- **Nicht angefasst:** `openLedger` committet seine zwei Meta-Zeilen weiterhin
  einzeln — dasselbe Muster, aber außerhalb dieser Messung und dieses Auftrags.
- **Keine Inhalte:** der Bericht trägt Pfade, Zählungen, Bytegrößen und Digests —
  keinen Prompttext, keinen Dateiinhalt, keinen Schlüssel. Der Test prüft das.

## 7. Befehle

```bash
npm run perf:baseline -- --runs 25 --cold-runs 7 --warmup 2 --out docs/probes/perf-baseline.json
npm run index:cold-cost -- --runs 2 --out docs/probes/index-cold-breakdown.json
node scripts/run-with-node.mjs node --test scripts/gate/tests/project-index.test.mjs
node --test scripts/gate/tests/perf-stats.test.mjs
```
