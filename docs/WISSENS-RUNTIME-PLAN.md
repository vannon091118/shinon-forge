# WISSENS-RUNTIME-PLAN — Implementierungsplan zur persistenten Wissens-Runtime

> **Status:** current (Plan, noch nicht implementiert) · **Stand:** 2026-10-20
> **Audit-Basis:** Code-Stand `fbe0980`, verifiziert in diesem Klon auf
> `725c07d` (Code unverändert, nur Doku-Commit darüber).
> **Offene Arbeit:** [`ROADMAP.md`](ROADMAP.md) K8 — diese Datei ist der Weg
> dorthin, keine zweite Roadmap.
> **Zahlen:** [`ZAHLEN.md`](ZAHLEN.md) §2 (Baselines) · **Regeln:**
> [`../AGENTS.md`](../AGENTS.md) · **Fundamente:**
> [`ARCHITEKTUR.md`](ARCHITEKTUR.md), [`CI-UND-GATES.md`](CI-UND-GATES.md)

**Leitentscheidung:** Shinon behält DSH, den Projektindex und den Prompter.
Ergänzt wird eine versionierte Faktenebene mit Lebenszyklus,
Abhängigkeiten, Invalidierung, Konfliktbehandlung und einem Runtime-seitigen
Snapshot. Der Prompter formuliert weiterhin den Auftrag; die Runtime stellt
sicher, dass geprüftes Wissen unabhängig von seiner Formulierung beim
Hauptmodell ankommt.

---

## 0. Verifikationsregister (geprüft 2026-10-20 auf `725c07d`)

Jede Stelle wurde im aktuellen HEAD erneut gelesen. Funde mit **Absichts-
Charakter** sind markiert (†), weil sie den Plan begrenzen:

| Beleg | Befund |
|---|---|
| `packages/prompter/assets/enhancer.js:422` | † `salvageProse` gibt `preservedIntent: true` hartcodiert zurück |
| `packages/prompter/assets/result-contract.js:124-128` | † Unbekannte Referenzen nur `console.warn` — Verwerfen wurde früher als „zu aggressiv" bewusst entfernt |
| `packages/prompter/assets/pre-step.js:509-513` | Ersatztext ist `enhancedPrompt`, Task-Brief wird über `appendTaskBrief` angehängt |
| `packages/project-index/assets/index-core.js:2212-2216` | † `constraints: []` — benannte Lücke; „ein erfundener Eintrag wäre schlimmer als ein leerer" |
| `packages/project-index/assets/index-core.js:1797-1800` | † `symbols_digest` wird im Warm-Pfad **bewusst nicht** fortgeschrieben: Referenzdurchgang genau einmal (Kaltlauf), nicht je Abfrage |
| `packages/project-index/assets/index-core.js:998-1000` | Versionssprung verwirft `MEMORY_TABLE` statt Migration |
| `packages/project-index/assets/index-core.js:1764-1772` | `refreshReferences` baut Matcher aus **allen** Symbolen |
| `packages/project-index/assets/index-core.js:2019` | `rankContextCandidates` lädt je Abfrage alle Pfade |
| `packages/prompter/assets/provenance.js:119-121` | `canPromote` verbietet Klassenwechsel bereits (nur `from === to`) |
| `packages/prompter/assets/capability-map.js:237-250` | Task-Brief (`<task_brief>`, Klasse `DERIVED`, „keine Wahrheit") — Integrationsmuster für den Wissensblock |
| `packages/persona/index.js:811-817` | † DSH `systemPrompt.assemble` läuft **vor** `agent/pre-step`; Assembly übergibt `context` an `section.text(context)` — Zeitfenster für System-Prompt-Sections |
| `docs/ZAHLEN.md` §2 | Baselines Turn 2026-10-20: One-Shot 328 Zeichen bei 11 078 in / 230 out, 41 Dateien / 23 925 B Indexkontext, 2 selbst gelesene Dateien (Index-Rang 1 und 2), Provenienz 40/0 |

## 1. Leitplanken (das, was der Plan nie tut)

1. Kein Neubau: `index-core`, `provenance`, `capability-map`,
   `intent-resolver` und der Task-Brief-Mechanismus bleiben Fundamente.
2. `†`-Befunde werden **nicht still umgedreht**: der `symbols_digest`-Takt
   wird geplant (Zug 2, Revalidierungs-Tick), nicht in jeden Warm-Pfad
   gezwungen; die Warn-Politik von `result-contract` wird zum **Modus**
   (streng im wissensgebundenen Weg), nicht zum Default-Flip.
3. Das LLM setzt nie `status` selbst; Statusübergänge sind reine Funktionen
   (`canPromote`-Muster).
4. Budget ist Guardrail mit Abbruch und Befund — nie stille Kürzung
   (PROPAKT: „fail loud, never truncate silent").
5. Jeder Zug endet mit einer Probe im `docs/probes/`-Format, die
   **Korrektheit und Aufwand** misst; Baselines aus `ZAHLEN.md` §2.

## 2. Zug 1 — Vertrag und Speicher

**Ziel:** `contracts/facts.json` plus additiver Store; noch keine
automatische Wahrheitsbehauptung.

| Aufgabe | Wo | Abnahme |
|---|---|---|
| Fakten-Vertrag schreiben: `id` (Hash aus `scope/subject/predicate/value`), `kind` ∈ `FACT/DERIVED/DECISION/PROPOSAL/CONFLICT`, `status` ∈ `DISCOVERED/EXTRACTED/VALIDATING/VALID/STALE/DISPUTED/SUPERSEDED/REJECTED`, `sources` im `parsePointer`-Format plus Quellrevision, `dependsOn` | neu `docs/contracts/facts.json` (additiv) | Gate `contracts` (7-Punkt-Form) akzeptiert die Datei |
| Lebenszyklus als reine Funktionen: Übergangstabelle, Zyklenverbot, `canPromote`-Erbe (kein Hochstufen durch Klassenwechsel) | neue Asset-Datei im Faktenpaket | `node:test`-Suite: jeder illegale Übergang wird rot |
| Store-Entscheidung treffen: **a)** dieselbe SQLite wie der Index (`facts`, `fact_sources`, `fact_deps` neben `files/symbols/edges/memory`) oder **b)** getrennte, referenzierte Faktendatei. Messkriterien: Transaktionsgrenzen, Kopplung, Migrationssicherheit. Ergebnis als Probe dokumentieren | `packages/project-index` bzw. neues `packages/facts` | Entscheidungsprobe: beide Varianten booten, `pack-test` grün |
| Ablage über `shinon_index_store`-Kanal (Muster: `scoring/index.js:23-30`), eigene `FACTS_VERSION` **mit Migrationspfad** — kein Tabellen-Werfen wie `index-core.js:998-1000` | Faktenpaket | Migrations-Test: Sprung von v1 nach v2 behält Fakten |

**Risiko dieser Zug-Grenze:** nichts davon berührt `index-core.js` — falls
ein Gate rot wird, war die Zug-Grenze zu weit.

## 3. Zug 2 — Extraktion und Invalidierung

**Ziel:** quellenspezifische Extraktoren, Abhängigkeitsgraph, gezielte
STALE-Kaskade; Revalidierungs-Takt statt Stillstand.

| Aufgabe | Wo | Abnahme |
|---|---|---|
| Extraktoren nach PRISM-Muster: quellenspezifisch, **kein** generischer Fallback (Vertragsdateien, Commit-Trailer, Index-Symbole) | Faktenpaket | Probe: identische Quelle ⇒ identischer Fakten-Hash (deterministisch) |
| STALE-Kaskade: geänderte Quellstempel (`dev:ino:size:mtime:ctimeNs`, `index-core.js:525-539`) ⇒ direkte Fakten `STALE`, DFS über `fact_deps` nur an tatsächliche Nachfolger, Zyklenverbot | Faktenpaket | mutate-Test (Muster `scripts/e2e/mutate.mjs`): eine Änderung ⇒ genau die erwarteten Nachfolger stale, fail-closed |
| Revalidierung: identischer Extraktions-Hash nach Änderung ⇒ sofort wieder `VALID`; **nicht** bei ungeklärter Revision (Entwurf §5) | Faktenpaket | Test mit absichtlich veralteter Revision: bleibt `STALE` |
| `symbols_digest`-Takt: der bewusste Eine-Kaltlauf-Entscheidung (`index-core.js:1797-1800`) bleibt; ergänzt wird ein **periodischer Revalidierungs-Tick** (PROPAKT-Tick-Muster), der Digest und Fakten-Revisionen in einem geplanten Durchgang auffrischt statt je Abfrage | `index-core`-Naht minimal, Faktenpaket | Probe: Tick erzeugt `fact.stale`-Ereignisse; Warm-Pfad-Latenz bleibt bei gemessener Baseline (38,97 ms Median) |

## 4. Zug 3 — Snapshot und Handoff

**Ziel:** deterministischer Compiler, revisionsgebundener Cache,
Runtime-Wissensblock, unabhängig vom Prompter-Text.

| Aufgabe | Wo | Abnahme |
|---|---|---|
| Snapshot-Compiler: Intent (`intent-resolver`) → Capability (`matchCapability`, `MEHRDEUTIG` bleibt erlaubt) → Fakten nach Scope + Abhängigkeitsclosure → `constraints` aus Vertragsdateien, Commit-Regeln, Gate-Ergebnissen, offenen `CONFLICT`-Fakten (füllt die benannte Lücke `index-core.js:2212-2216` ehrlich) | Faktenpaket + `prompter/assets` | Probe: Snapshot enthält Fakten, Constraints, Konflikte, Quellrevisionen; `probe-twin`-Form |
| Turn-/Snapshot-Cache: Schlüssel = `hash(intent, features, fact-id:revision-Liste, extractorVersion, regelVersion)`. Cache-Hit ersetzt One-Shot nur bei vollständig unveränderten Inputs (Entwurf §14); veraltete Treffer per Mutationstest sichern | Faktenpaket | mutate-Test: eine Revision ändern ⇒ Cache-Miss, kein Wiederverwenden |
| Wissensblock `<project_facts>` + `<constraints>` im Muster des Task-Briefs (`capability-map.js:237-250`), montiert in `pre-step.js` aus **Runtime-Code** neben `enhancedPrompt` (`:509-513`) — nie aus dem, was das LLM übernimmt; wird auch dann angehängt, wenn der Prompter Fakten nicht erwähnt | `pre-step.js` (minimaler Eingriff) | Probe: Hauptmodell-Zitat-Test — der Block ist im finalen `messages`-Array nachweisbar, unabhängig vom LLM-Ergebnis |
| Optional, getrennt zu prüfen: System-Prompt-Section-Weg über DSH-Assembly (`section.text(context)`, Zeitfenster vor `agent/pre-step`, `persona/index.js:811-817`) für sessionsgebundene Baseline-Fakten | nur Messung, kein Umbau | Entscheidungsprobe: Section vs. `pre-step`-Anhang — Token- und Zeitvergleich; Standard bleibt `pre-step` |

## 5. Zug 4 — Reconciliation und Post-Checks

**Ziel:** Konflikte nach Autorität, strengere Ergebnisverträge, Turn-Abnahme.

| Aufgabe | Wo | Abnahme |
|---|---|---|
| Autoritätstabelle im Vertrag: Ist-Zustand Code > README-Prosa; Soll-Zustand bestätigte Entscheidung/Vertrag > Code; Revision, dann Evidenz als Zusatz | `contracts/facts.json` | Test: dieselbe Fragestellung an README- und Code-Quelle ⇒ dokumentierte Entscheidung |
| Reconciliation: identischer kanonischer Hash ⇒ mergen (eine Aussage, mehrere Quellen); echter Widerspruch ⇒ `CONFLICT` bleibt sichtbar und **muss** im Snapshot erscheinen | Faktenpaket | mutate-Test: Widerspruch einspeisen ⇒ `CONFLICT` im Snapshot, keine stille Auswahl |
| Ergebnisvertrag schärfen **als Modus**: unbekannte/stale Faktenreferenzen werden im wissensgebundenen Weg `reasons`-Eintrag statt `console.warn` (`result-contract.js:124-128`); `salvageProse`-Ergebnisse erhalten `preservedIntent: false` und Stufe `SALVAGED` (`enhancer.js:422`); Default-Verhalten des nicht-wissensgebundenen Wegs bleibt unverändert | `result-contract.js`, `enhancer.js` | bestehende Prompter-Tests (18) grün; neue Tests: strenger Modus lehnt ab, lockerer Modus wie bisher |
| Post-Hoc-Prüfung: aus Auftrag + Änderungsbereich betroffene Invarianten und paketbezogene Gates ableiten (`--only`-Muster); Resultat als Fakt (`JUDGEMENT`) mit Evidenztyp, nicht als unbeschränkte Wahrheit | Faktenpaket + Gate-Naht | mutate-Test: verletzte Invariant ⇒ nächster Turn bekommt den `CONFLICT`/`JUDGEMENT` |

## 6. Messprogramm (jeder Zug, Proben-Format `docs/probes/`)

| Metrik | Baseline (ZAHLEN §2) | Nachweis |
|---|---|---|
| One-Shot-Token je Turn | 11 078 in / 230 out | Sinken bei unveränderter Aufgabe + Cache-Hit-Rate |
| Selbst gelesene Dateien (Hauptmodell) | 2 (Rang 1/2 des Index) | Sinken ohne Qualitätsverlust |
| Warm-Pfad-Latenz | 38,97 ms Median | darf in Zug 2/3 nicht steigen |
| Provenienz-Verstöße | 0 von 40 | bleibt 0, auch mit Faktenblock |
| Invalidierung | — (neu) | richtige STALE-Menge je Änderung; Null-Drift via erweitertem `index:match-eq` |
| Konflikte | — (neu) | erkannt = Soll aus mutate-Tests |
| Integrität | — (neu) | 0 stille Kürzungen, 0 falsche Cache-Treffer |

Die Vergleichswerte (11 078 / 328 / 2) sind **vorläufig** und vor jedem
Erfolgsversprechen mit denselben Aufgaben und Cache-Bedingungen zu
reproduzieren.

## 7. Roadmap-Einbettung (Zuordnung zu [`ROADMAP.md`](ROADMAP.md))

Der Plan ist **keine zweite offene Liste** — er ordnet sich den
bestehenden Punkten zu:

| ROADMAP-Punkt | Beziehung zum Plan |
|---|---|
| §2.2 **K8 Fakten-Store** („Konsolidierung, hartes Limit; Ablage liegt bereit") | Der Plan **ist** der konkrete Weg zu K8: Zug 1 = Vertrag und Speicher, Zug 2 = Extraktion und Invalidierung. „Hartes Limit" wird zum Guardrail-Prinzip: Budget bricht mit Befund ab, kürzt nie still (Zug 3, H5). K8 gilt erst als erledigt, wenn die Abnahmen der vier Züge belegt sind. |
| §2.2 **`LAST_VERIFIED_FACT` (§19)** | Wird **aufgenommen, nicht ersetzt**: Loop Guard / Progress Evaluator bleibt alleiniger Produzent; im Plan wird daraus ein Fakt (`kind` mit gepinntem Produzenten, `status` über die Lebenszyklus-Maschine). Die Gate-Pflichten (Ereignis, Produzent, Herkunft, fail-closed-Fälle) wandern in `contracts/facts.json` und werden in Zug 4 geprüft. |
| §2.2 **Architektur-Folge C4** (Prompt-Schichten zu einem Assembler) | Zug 3 setzt daran **an**: die Drei-Teile-Montage in `pre-step.js` ist die erste konkrete Assembler-Arbeit. C4 bleibt eigenständiger Punkt, berührt aber dieselbe Stelle — der C4-Schnitt und Zug 3 sind vor Beginn in ihrer Reihenfolge abzustimmen, nicht parallel zu bauen. |
| §2.2 **P2** (Katalog-Snapshot statt Einzelprüfungen) | Gleiche Bewegung wie Zug 2/3: geplante Snapshots statt Einzel-Prüfungen. Die P2-Gate-Idee wird in Zug 4 (Post-Hoc-Prüfung) wiederverwendet, nicht neu erfunden. |
| §2.3 **Benchmarks 4.1–4.6** (zurückgestellt, gated) | Der Plan **aktiviert die Gating-Bedingung**: offene Prüfung §10.3 (Reproduktion der Baselines mit festem Aufgaben-Set) **ist** 4.1. Bis 4.1 belegt ist, darf Zug 3 nur **Korrektheit** (unabhängiger Transport, Cache-Sicherheit) behaupten — **kein** Einsparungs-Versprechen. |
| §1.5/§2.1 **S5-Schluss, S6-Schluss** | Vorrangregel: der Plan zieht keine Arbeit aus dem v0.4.0-Freeze und beginnt erst mit oder nach §2.1. Jede Zug-Abnahme läuft wie jeder andere Commit über Hooks und CI. |
| §2.2 **Persona-Einstieg teilen** | Abhängigkeit **nur** für die optionale Section-Messung (§10.2): bevor an der Persona-Assembly Sections berührt werden, steht dort der Zustands-Eigentümer auf dem Programm. Der Standard-Weg (Runtime-Anhang in `pre-step`) hat diese Abhängigkeit **nicht**. |
| §2.2 **K7b**, Codingmon-Folge, Mobile, Live-429-Rotation | **Nicht** Teil des Plans — sie bleiben eigenständige Punkte. Einzige Berührung: der spätere K7b-Schreibweg sollte dieselben Fakten-IDs aus Zug 1 nutzen; die Entscheidung darüber bleibt offen und steht im Plan nicht. |

## 8. Nicht-Ziele

Kein universeller State-Store (Zuständigkeiten bleiben getrennt, Verbindung
nur über fail-closed Events: `fact.extracted`, `fact.stale`,
`fact.conflict`, additiv in `contracts/events.json`); kein Ersatz des
Prompter-LLM; kein pauschaler Token-Deckel als Architekturprinzip; keine
SimHash/Jaccard-Faktenzusammenführung (höchstens Kandidatenvorschlag vor der
Konfliktprüfung); keine Zeitstempel-Gewinner-Regel.

## 9. Abnahmekriterium (Gesamt)

Wenn sich eine relevante Datei, Regel oder bestätigte Entscheidung ändert,
muss Shinon nachvollziehbar bestimmen können: welche Fakten direkt betroffen
sind, welche abgeleiteten Fakten und Snapshots stale werden, welche
Konflikte ungelöst bleiben, welche Regeln und Belege für den nächsten Turn
gelten, welche gezielten Prüfungen nötig sind — und ob der
Runtime-Wissensblock tatsächlich unverändert bis zum Hauptmodell gelangt.

## 10. Offene Prüfungen (vor Zug 1-Ende)

1. **Speicherort:** dieselbe SQLite oder getrennte Faktendatei —
   Entscheidung an Transaktionsgrenzen und Kopplung messen, nicht wählen.
2. **Assembly-Zeitfenster:** sessionsgebundene Baseline-Fakten als
   System-Prompt-Section (vor `agent/pre-step`) messen; Standard ist und
   bleibt der `pre-step`-Anhang.
3. **Reproduktion der Baselines** (11 078 / 328 / 2) mit festem Aufgaben-Set
   vor Zug 3.
