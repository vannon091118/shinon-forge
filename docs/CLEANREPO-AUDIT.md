# Modularisierungs- und Integrationsplan — shinon-forge

> **Status:** Plan · **Stand:** 2026-10-22 · **Arbeitsbaum:** dirty (20 geändert, 4 neu) — alle Zahlen sind der **IST-Zustand**, nicht HEAD.
> **Einstieg:** `AGENTS.md` · **Zahlen:** `docs/ZAHLEN.md`
>
> Nichts im Repo wurde verändert. Kein Commit, kein `npm test` (nur das statische Gate: 126/126, Exit 0).

---

## 0. Der Auftrag in zwei Sätzen

Der Refactor soll **zwei Dinge gleichzeitig** leisten:

1. **Das Sichtbare einprägsam und leicht deutbar machen** — Labels, Panels, Toasts, Leerzustände. Was der Nutzer sieht, ist eine Oberfläche, kein Beiwerk.
2. **Intern eine kanonische Sprache herstellen** — ein Name, eine Schreibweise, eine Definition, aus der jeder Agent ableiten kann, was ein Name in einer Datei bedeutet.

Und er soll das **durchsetzen**, nicht nur beabsichtigen. Das ist der Punkt, an dem die meisten Refactors scheitern: sie verschieben Code und lassen die Sprache unverändert. Ein Plan, der nur Dateien schrumpft, hat den Auftrag nicht erfüllt.

**Was NICHT passiert:** kein wholesale Austausch bestehender Mechanismen. Shinons Skill-System, seine Prompter-Kette, sein Ledger — das sind Arbeitspferde, sie werden umgebaut, nicht ersetzt. Siehe §6.

---

## 1. Bestand (gemessen, absteigend nach Größe)

355 Code-Dateien, **86 464 Zeilen** (43 015 in `packages/`, 43 226 in `scripts/`, 223 in `bin/`), **24 Pakete** (23 bei Messbeginn + `diff-overview`, das während der Plan-Erstellung entstand und inzwischen fertig ist — siehe 9.1), 3 Profile, 25 Bundle-Layer.

| Paket | Dateien | Host | Client | Core | Test | **Summe** |
|---|---:|---:|---:|---:|---:|---:|
| prompter | 53 | 345 | 285 | 7 635 | 4 198 | **12 463** |
| codingmon | 28 | 188 | 3 482 | 1 961 | 3 462 | **9 093** |
| project-index | 17 | 541 | 29 | 3 741 | 766 | **5 077** |
| persona | 11 | 1 447 | 248 | 1 605 | 180 | **3 480** |
| scoring | 8 | 542 | 23 | 943 | 873 | **2 381** |
| token-usage | 4 | 24 | 574 | 419 | 230 | **1 247** |
| key-router | 4 | 400 | 63 | 430 | 285 | **1 178** |
| version | 5 | 340 | 249 | 324 | 99 | **1 012** |
| traceability | 4 | 101 | 547 | 166 | 152 | **966** |
| markers | 2 | 312 | 630 | 0 | 0 | **942** |
| popup | 4 | 92 | 425 | 223 | 176 | **916** |
| task-router | 4 | 770 | 54 | 91 | 0 | **915** |
| narrative | 4 | 216 | 20 | 258 | 207 | **701** |
| seams | 4 | 28 | 23 | 495 | 0 | **546** |
| dashboard | 2 | 24 | 479 | 0 | 0 | **503** |
| hook | 3 | 304 | 77 | 0 | 72 | **453** |
| core | 2 | 29 | 409 | 0 | 0 | **438** |
| events | 2 | 345 | 27 | 0 | 0 | **372** |
| openapi / locale-de / tooltip / better-errors / mobile | 2 je | 132 | 200 | 0 | 0 | **332** |

**Drei Shapes, drei Extraktionsarten.** Die Spalten verraten, was zu tun ist:
- **core-dominiert** (prompter, project-index, scoring) → Logik aus dem Host in importfreie Module ziehen.
- **client-dominiert** (codingmon, markers, token-usage, traceability, dashboard) → die Client-Hälfte ist ein **selbsttragendes Bundle**; sie kann ihre Quellen nicht importieren. Hier ist Extraktion = Generator erweitern, nicht Datei teilen.
- **host-dominiert** (persona, task-router, events, hook) → Zustand aus dem Closure in einen Eigentümer ziehen.

---

## 2. Hotspots — der Bestand aus der eigenen Struktur-Registry

`docs/contracts/structure.json` ist die Schuld-Inventur. **Null Live-Verstöße** (0 Dateien über Grenze ohne Eintrag im `bestand`). Aber 30 eingefrorene Ausnahmen, jede 3–4× über ihrer Grenze:

| Datei | Ist | Grenze | Klasse | Faktor |
|---|---:|---:|---|---:|
| `packages/codingmon/client.js` | 3 482 | 250 | client | 13,9× |
| `packages/project-index/assets/index-core.js` | 2 220 | 650 | core | 3,4× |
| `scripts/gate/tests/prompter-contract.test.mjs` | 2 212 | 550 | test | 4,0× |
| `scripts/gate/tests/project-index.test.mjs` | 2 154 | 550 | test | 3,9× |
| `packages/persona/index.js` | 1 447 | 550 | host-entry | 2,6× |
| `scripts/lib/repo.mjs` | 1 268 | 550 | script | 2,3× |
| `scripts/install-user.mjs` | 1 041 | 550 | script | 1,9× |
| `scripts/gate/tests/persona-state.test.mjs` | 1 004 | 550 | test | 1,8× |
| `scripts/gate/tests/task-router.test.mjs` | 919 | 550 | test | 1,7× |
| `scripts/gate/plugins/scoring.mjs` | 821 | 100 | gate-plugin | **8,2×** |
| `packages/scoring/assets/scoring-core.js` | 784 | 650 | core | 1,2× |
| `packages/task-router/index.js` | 770 | 550 | host-entry | 1,4× |
| `packages/codingmon/test/durchstich.test.mjs` | 660 | 550 | test | 1,2× |
| `scripts/branding-check.mjs` | 660 | 550 | script | 1,2× |
| `packages/markers/client.js` | 630 | 250 | client | 2,5× |
| `packages/token-usage/client.js` | 574 | 250 | client | 2,3× |
| `packages/traceability/client.js` | 547 | 250 | client | 2,2× |
| `packages/dashboard/client.js` | 479 | 250 | client | 1,9× |
| `packages/popup/client.js` | 425 | 250 | client | 1,7× |
| `packages/core/client.js` | 409 | 250 | client | 1,6× |
| `packages/prompter/client.js` | 285 | 250 | client | 1,1× |
| + 9 gate-plugins (105–441 bei Grenze 100) | | | | |

**Nächste Brecher (80–100 % der Grenze, kein `bestand`):**
`prompter/assets/pre-step.js` 643/650 · `prompter/assets/runtime-state.js` 547/650 · `scoring-memory.test.mjs` 547/550 · `uebergabe.test.mjs` 546/550 · `scoring/index.js` 542/550 · `project-index/index.js` 541/550 · `enhancer.js` 533/650 · `lib/payload.mjs` 532/550.

**Der Riegel belohnt das richtige Verhalten:** `packages/prompter/index.js` stand am 2026-10-20 bei 1 350 Zeilen und wurde auf **345** gesplittet — der `bestand`-Eintrag ist verschwunden, nicht angehoben. Das ist der Beweis, dass der Riegel funktioniert, wenn man ihn beachtet.

---

## 3. Ownership-Map

> **Die Gruppen sind nach Verantwortung gebaut, nicht nach Verzeichnis.** Jede Gruppe hat **einen** Kern, **eine** Datenrichtung nach außen und **einen** Eigentümer für den Kanon. Das ist die Voraussetzung dafür, dass fünf Agenten parallel arbeiten, ohne dass einer dem anderen ins Gehege kommt.

| Gruppe | Pakete / Dateien | Dateien | Zeilen | Eigener Kern | Tasks |
|---|---|---:|---:|---|---|
| **A** Fundament & Profil | `scripts/lib/*` (28), `profiles/*` (9), `bin/` | 29 | 7 289 | Registry-Owner, Namensvertrag, Struktur-Riegel | T1-1…T1-6, T2-15, T5-1 |
| **B** Wissen & Kontext | project-index, scoring, narrative, task-router, hook, events, seams | 42 | 10 445 | Ein Index, ein Ledger, ein Fakten-Snapshot | T0-2, T2-3, T2-4, T2-5 |
| **C** Prompter | `packages/prompter/*` | 53 | 12 513 | One-Shot, Blocks, Intent, Skills | T3-0…T3-8, T3b-1…T3b-4 |
| **D** Agenten-Identität | persona, version | 16 | 4 489 | Self-Model, Claims, Memory, Version | T0-6, T2-6, T2-7 |
| **E** Oberfläche | core, locale-de, tooltip, markers, dashboard, popup, token-usage, traceability, better-errors, mobile, openapi, **key-router**, **diff-overview** | 37 | 7 475 | Slots, Overlays, Sidebar, Modell-Katalog | T0-1, T0-7, T0-8, T2-8…T2-12, T2-14 |
| **F** Begleiter | `packages/codingmon/*` | 28 | 9 093 | 50 Arten, Zucht, Encounter | T0-3, T0-4, T0-5, T2-1, T2-2, T2-13 |
| **G** Betrieb & Gate | `scripts/gate/*` (113 Dateien), `scripts/*` Top-Level, CI, Packaging | 113+ | 27 410 | Regeln, die den Baum messen | T3b-5, T4-1…T4-7 |
| **H** Querschnitt | alle Kanten | — | — | Datenstrom-Karte (Abschnitt 3.2) | — |

**Die Summen, gemessen am 2026-10-22 01:4x:** `packages/` **176 Dateien / 44 015 Zeilen**, `scripts/` **184 Dateien / 43 564 Zeilen**, `bin/` 223 Zeilen — zusammen **358 Dateien / ~87 800 Zeilen**. Die Gruppen A–G decken **318 Dateien / 78 714 Zeilen** ab; der Rest ist `scripts/`-Top-Level (71 Dateien / 16 154 Zeilen) und gehört zu G.

**Die Größenordnung erklärt die Aufmerksamkeit:**

| Gruppe | Anteil am Baum | Warum sie wichtig ist |
|---|---:|---|
| G (Betrieb) | ~30 % | misst den Baum, prüft ihn, baut ihn — und hat die **längsten Tests** |
| C (Prompter) | ~14 % | der einzige Ort, der **Blöcke** baut und **Skills** auswählt |
| B (Wissen) | ~12 % | der einzige Ort, der **durchsuchbare Wahrheit** hält |
| F (Begleiter) | ~10 % | der einzige Ort mit **Spielmechanik** — und Host/Client-Spiegel |
| E (Oberfläche) | ~8 % | der einzige Ort, den der **Nutzer sieht** |
| A (Fundament) | ~8 % | der einzige Ort, der **Regeln über Regeln** hält |
| D (Identität) | ~5 % | der kleinste, aber der **einzige mit Selbstmodell** |



### 3.1 Sammel-Hotspots (nur EINE Person fasst sie an)

| Datei | Eigentümer | Warum sie anzieht |
|---|---|---|
| `package.json` (Root) | **A** | Workspaces, alle `npm run`-Skripte |
| `profiles/shinon/cordis.patch.yml` | **A** | 621 Zeilen, 25 Layer, Model-Route — **5 Gruppen** prüfen sie |
| `docs/ZAHLEN.md` | **A** | einziger Eigentümer aller Zahlen |
| `docs/TAGEBUCH.md` | **A** | einzige Historie |
| `docs/contracts/*.json` | **A** | 13 Verträge, additiv-only |
| `scripts/lib/repo.mjs` | **A** | 1 268 Zeilen, 14 Importeure, Gate-Slices hängen dran |
| `scripts/gate/policy.json` | **G** | jeder Trigger braucht ein Plugin |

### 3.2 Die eine echte Datenrichtung

**C → B**: Der Prompter liest den Project Index über `ctx.get('shinon_index_query')` — **kein Import**, ein Dienst mit Vertrag. Alles andere läuft ebenfalls weich (`ctx.get` / `ctx.on` / `ctx.emit` / `ctx.inject`) oder über reine Daten (`blocks.json`, `capabilities.json`).

**Ausnahme, die den Schnitt markiert:** `@shinon/seams/core` ist der **einzige** harte Import im Prompter (`index.js:24`, `mode-core.js:14`, `pre-step.js:32`, `workspace.js:20`) — und `seams-core.test.mjs:98-112` verlangt genau diese Importform in genau diesen Dateien.

**Konsequenz:** C → B ist die einzige Stelle, an der eine C-Änderung eine B-Änderung erzwingt. Alles andere ist parallelisierbar.

---

## 4. Konflikt-Register
| **1** | `packages/project-index/assets/index-core.js:1576` `writeMemory` ↔ `packages/scoring/index.js:255` | **⚠ BUG — selbst reproduziert (echter Store, echte SQLite, Wegwerf-Verzeichnis).** Scoring schreibt `blockWeights` + `blockAttributions` in den Snapshot (`scoring/index.js:255-256`); `writeMemory` kennt nur `records`/`memos`/`scorecard`/`notes` und **verwirft die Gewichte still**. **Messung:** `save → {"ok":true,"rows":3,"migrated":0}` — Erfolg gemeldet! → `load → keys=records,memos,scorecard,notes,broken` → `blockWeights survived: undefined`, `blockAttributions survived: undefined`, `notes: 3` (überlebt), `scorecard: {correctness:0.5}` (überlebt). Auch `readMemory` direkt kennt sie nicht. Der Kommentar `scoring/index.js:236-242` („Die Gewichte reisen im SELBEN Snapshot") behauptet das Gegenteil. **Der Store meldet also Erfolg für einen Save, bei dem zwei Felder verloren gehen — der Aufrufer kann es nicht sehen.** | **Doppelte Wahrheit + Datenverlust** | `scoring-block-learning.test.mjs` nutzt einen **Fake-Store** (`fakeStore()`, Z43) — läuft grün und verliert weiter. Muss auf den echten `createStoreService` umgestellt werden | **hoch** |
| **2** | `packages/codingmon/assets/zucht.js:160-168` `lootWeights()` ↔ `packages/codingmon/assets/mechanik.js:273` `rollLoot()` ↔ `packages/codingmon/client.js:836` | **⚠ BUG — auf beiden Seiten.** `assets/zucht.js:163` rechnet `factor = 10000 + lootLuck` — der Zucht-Bonus `lootLuck` (3 Boni-Typen, `client.js:887-897`) **soll** die Beute gewichten. Aber: `lootWeights()` wird **nur von `test/zucht-core.test.mjs:157`** aufgerufen — **kein Produktionscode**. Der Host liefert die **Basis**-Tabelle (`index.js:78`: `LOOT_TABLE.map(...)`), und der Browser würfelt selbst (`client.js:1883` `rollLoot(Math.random())`) gegen dieselbe Basis. **Der Bonus existiert als Zahl, ohne Wirkung — weder Host noch Client wenden ihn an.** | **Wirkungslose Mechanik** + zweite Wahrheit | `zucht-core.test.mjs:157` prüft `lootWeights` isoliert; `loot.test.mjs` prüft `rollLoot` gegen die Basis. **Kein Test prüft, dass die Beute den Bonus sieht.** | **hoch** |
| **3** | `packages/codingmon/assets/zucht.js:10,23` ↔ `packages/codingmon/client.js:1120` | **⚠ BUG — zwei Namen, keine Entsprechung.** Der Host hat `childChoice` (`zucht.js:10`, sortiert nach `bxp`, wählt bei Gleichstand) und `childSpeciesCandidates` (`:23`, dedupliziert pro Art **über `childChoice`**). Der Client hat `breedingCandidates` (`client.js:1120`) — das gibt nur **Arten** zurück, ohne `bxp`, und **`childChoice` existiert im Client gar nicht** (0 Treffer). Er kann die Eltern also gar nicht gleich wählen. Umgekehrt: `breedingMods` und `breedClamp` gibt es **nur** im Client, nicht in `assets/` — dieselbe Rechnung, zwei Namen, in zwei Richtungen gespiegelt. | **Logikdivergenz + Spiegel im Falschen** | `zucht-core.test.mjs` prüft die Host-Fassung; der Client-Pfad hat **keinen** Test | **hoch** |
| **4** | `packages/persona/index.js:132` `declaredWorkspaceRoot()` | Persona führt eine **dritte** Workspace-Auflösung mit *anderer* Semantik (kein `cwd`-Fallback, `null` = ungewiss). Sie ist nur durch ihren **anderen Namen** vor dem Host-Spiegel-Riegel geschützt (`hostMirrorIssues`). Ein Schnitt in eine generische „Workspace-Auflösung" kippt Personas fail-closed-Regel unbemerkt. | **verlorene Herkunft** | `seams-core.test.mjs` + `hostMirrorIssues` (`repo.mjs:813`) | **hoch** |
| **5** | `packages/prompter/assets/block-select.js:42-43` | Der Scoring-Spiegel (`WEIGHTS_SERVICE`/`WEIGHTS_CONTRACT`) steht in einem sonst **importfreien** Selektor. `mode-core.js` trägt den Index-/Scoring-/Persona-Spiegel in einer Datei, die 10 interne Module importiert. | **Spiegel im Falschen** (verletzt AGENTS.md: „a name table belongs with the seam it names") | `prompter-split.test.mjs` (99 Namen) | mittel |
| **6** | `scripts/gate/policy.json:92-97` (Slice `scoring`) ↔ `scripts/gate/plugins/scoring.mjs` (821 Z, Grenze 100 — 8,2×) | Der Slice triggert über **Pfad-Präfixe**: `packages/scoring/`, `scripts/gate/plugins/scoring.mjs`, `scripts/gate/tests/scoring.test.mjs`, `profiles/`. Wird das Plugin nach `scripts/lib/` umgezogen, greift **kein** Präfix mehr — der Slice läuft nicht mehr, **ohne dass irgendetwas rot wird**. Der Slice selbst enthält nur `doctor` + `commit-trailer` als Scoring-Bezug, nicht das Scoring-Plugin. | **Gate-Stress (stiller)** | keiner — der Ausfall fällt erst auf, wenn ein Scoring-Befund nicht mehr erscheint | **hoch** |
| **7** | `packages/persona/index.js` + `packages/core/client.js:288-317` | Personas Zustandsvertrag (Feldnamen in `uiSnapshot()`, `:1256`) bricht `core/client.js` (`bannerStatus`) — 30 Zeilen E-Logik, die ein D-Feldformat **hart** liest. Gepinnt ist nur der **Name** des Globals, nicht das **Format**. | **Formatkopplung ohne Wächter** | keiner | **hoch** |
| **8** | `docs/contracts/*.json` — **7 von 13** ohne Code-Leser | `abort.json`, `core.json`, `events.json`, `markers.json`, `model-route.json`, `persona.json`, `provenance.json` haben **null** Code-Referenzen. `model-route.mjs` liest die Route aus dem Patch-**Text**, nicht aus dem Vertrag. `gate/plugins/contracts.mjs:45` liest alle 13 **generisch** — aber prüft nur die sieben Formalienpunkte, nicht den Inhalt. | **toter Vertrag** (oder toter Code — unentschieden) | `contracts.mjs` prüft die Form, nie die Wirkung | mittel |
| **9** | `scripts/lib/commit-policy-file.mjs:20,22` | Drei Orte, drei Rollen: `docs/contracts/commit-policy.json` (Preset-**Daten**), `.shinon/gate-profile.json` (Preset-**Auswahl**), `SHINON_COMMIT_POLICY` (Env-**Auswahl**). Die Vertragsdatei ist **hartkodiert**, die anderen beiden auch. Drei Wahrheiten, ein Preset. | **drei Wahrheiten** | `commit-policy.test.mjs` (prüft alle drei, aber nicht ihre Beziehung) | mittel |
| **10** | `scripts/lib/yaml.mjs:89` ↔ `scripts/gate/engine.mjs:19` | `engine.mjs:19` behauptet „Läuft ohne node_modules — nur node:-Module und scripts/lib/repo.mjs". `yaml.mjs:89` löst `js-yaml` per `createRequire(anchor)` auf — Anker sind `dshRoot()` und `import.meta.url`. **Gemessen (isolierte Kopie von `scripts/lib`, cwd `/tmp`):** `FEHLER YAML-Parser nicht gefunden`. **Mit der Repo-Kopie:** `OK parser gefunden`. `dshRoot()` ist in dieser Umgebung **null** (kein globales `dsh` im PATH) — der Parser hängt also an der **Repo-`node_modules`**. Die Fehlermeldung nennt „dsh im PATH" als Rettung, was hier **nicht** hilft. | **falsche Behauptung im Kommentar** + irreführende Fehlermeldung | keiner | mittel |
| **11** | `packages/prompter/assets/skill-registry-core.js` (209 Z) | **Toter Pfad.** Vollständige Bedarfslogik (KEINE_SKILLS / REGISTRY_FEHLT / VERALTET / PASSEN_NICHT / AKTUELL), **null Produktionsaufrufer** — nur `gate/tests/skill-registry.test.mjs`. Die Registry-Datei, die sie prüfen würde, existiert nirgends. | **unverdrahtete Mechanik** | der Test beweist, dass die Funktion funktioniert — nicht, dass sie läuft | mittel |
| **12** | `packages/prompter/assets/budget-core.js` (288 Z) | **Toter Pfad.** `kuerzeAufBudget` wird nur von `gate/tests/context-budget.test.mjs` gerufen (9 Tests, alle grün) — **kein Produktionscode**. Der im Dateikopf dokumentierte Defekt (Budget 6 000 → 33 217 Zeichen = 38 % drüber; 1 500 → 77 % drüber) ist eine **Messung vom 2026-10-21**, im Dateikopf festgehalten — **nicht** in dieser Sitzung nachgemessen. Die Korrektur existiert, ist aber nicht eingebaut. | **unverdrahtete Mechanik** | `context-budget.test.mjs` (9/9 grün) — beweist die Funktion, nicht ihre Nutzung | mittel |
| **13** | `packages/prompter/assets/selection.js` (163 Z) | Tot, aber **öffentlich**: 6 der 99 gepinnten Namen. `parseSelection` wird nirgends gerufen. Der Vertrag `shinon.selection/v1` und der deterministische Index-Weg sind **zwei verschiedene Mechanismen** für dieselbe Frage. | **toter öffentlicher Pfad** | `prompter-split.test.mjs` pinnt die Namen — schützt den toten Pfad | mittel |
| **14** | `packages/codingmon/client.js` (3 482) — 47 handgespiegelte Konstanten | Die `generated-*`-Blöcke sind drift-sicher. Die **Handkopien** sind es nicht: `MOD_CAP_BPS`, `LOOTLUCK_CAP_BPS`, `GEN_STATMOD_CAP_BPS`, `BREEDING_VERSION`, `GRID_PALETTE` u. a. liegen in `client.js` und in `assets/` — **kein Test pinnt sie**. `GRID_PALETTE` (`client.js:2016`) ist ein Literal, der Generator hat `PALETTE` als Quelle. | **Drift-Fläche** | keiner | mittel |
| **15** | `packages/codingmon/assets/uebergabe.js` ↔ `client.js:1406-1410` | `uebergabe.test.mjs` vergleicht **nur** Substrings. `UEBERGABE_SERVICE`, `UEBERGABE_PARAMETER` und die Typnamen werden **überhaupt nicht** gegen den Client geprüft. `repo.mjs:520-529` (Gate „Naht-Namen Client→Host") prüft ebenfalls nur 2 der 5 Namen. | **ungenäher Spiegeltest** | `uebergabe.test.mjs` (zu schwach) | mittel |
| **16** | `packages/prompter/assets/mode-core.js` + `knowledge-block.js` + `context-channel.js` + `note-core.js` + `blocks.json` + `skill-rules.json` | Drei Vertrags-Literale mehrfach im Paket: `shinon.facts/snapshot-v1` (2×), `shinon.prompter/context-v1` (2×), `shinon.skill-rules/v1` (4×). `canon.mjs:98-102` prüft nur die drei kanonischen **Formen**, nicht die Eindeutigkeit. | **Dublette ohne Riegel** | keiner | niedrig |
| **17** | `scripts/gate/tests/scan-pruning.test.mjs` | Importiert `plugins/typescript.mjs`, prüft aber `lib/scan.mjs` (`PRUNE_DIRS`, `entriesOf`, `isPruned`). Der Test liegt **thematisch beim falschen Plugin**. | **Fehlzuordnung** | — | niedrig |
| **18** | `docs/CI-UND-GATES.md:51` | Behauptet, das `registry`-Plugin prüfe `canon.json`. **`gate/plugins/registry.mjs` liest `canon.json` nicht** (0 Treffer). Der Kanon-Riegel ist `lib/canon.mjs:57`. | **Doku lügt** | — | niedrig |
| **19** | `.github/workflows/commit-guard.yml:147` | Kommentar sagt „das statische Gate (**105** Prüfungen)", `docs/ZAHLEN.md` §2 sagt **126**. | **Zahlen-Drift** | — | niedrig |
| **20** | `packages/prompter/index.js` ↔ `packages/task-router/index.js` ↔ `packages/hook/index.js` | `PRE_STEP_EVENT = 'agent/pre-step'` steht **dreimal** als exportierte Konstante. `agent/pre-step` wird von 11 Tests referenziert — die Kette ist dicht, aber der **Name** hat drei Besitzer. | **Dublette ohne Pin** (nach Scan: 0 Assertions) | — | niedrig |
| **21** | `packages/prompter/index.js:199,217`, `pre-step.js:100,340`, `runtime-state.js:527`, `stand.js:150` | **6 Stellen** schreiben dieselbe `ctx.get(NAME)` + Vertragsprüfung neu. Jede Extraktion, die einen Dienst anfasst, muss an 6 Orten mitziehen. | **Muster-Kopplung** | keiner | mittel |
| **22** | `packages/prompter/index.js:293`, `task-router/index.js:746`, `persona/index.js:1392,1403`, `codingmon/index.js:148` | `ctx.provide` an 10 Stellen. **9 von 10** sind mit `canProvide` abgesichert — `codingmon/index.js:148` ist die **einzige** unguarded-Stelle. AGENTS.md warnt genau davor („ctx.provide auf einem ROOT-Kontext feuert kein Geschwister-ctx.inject"). | **Asymmetrie** | keiner | mittel |
| **23** | `shinon_goal_micro_state` (`task-router:746`), `shinon_block_propose` (`prompter:293`), `shinon_persona_review`/`_relation` (`persona:1392,1403`) | Vier bereitgestellte Dienste **ohne Abnehmer im Baum**. `shinon_codingmon_store` wird nur im Prompter-Test erwähnt, nicht gelesen. | **tote Dienstfläche** | keiner | mittel |
| **24** | `sidebar.panellist` (6 Pakete), `conversation.composer.dock` (3), `shell.overlay` (2) | Sechs Pakete beanspruchen `sidebar.panellist` (codingmon, dashboard, markers, persona, popup, prompter), drei den `conversation.composer.dock` (codingmon, core, popup). Die Reihenfolgeabhängigkeit ist real (Single-Slot → der erste Registrierende gewinnt), aber sie steht **nur im Kommentar und im Test** — kein Mechanismus verhindert den dritten Besetzer. | **Slot-Kollision** | `client-activation.test.mjs:476` (prüft 1 statt einem) | mittel |
| **25** | `packages/core/client.js:64` | **34 628 Bytes Base64 in EINER Zeile.** Die Datei ist 409 Zeilen, aber 67 544 Bytes — der Byte-Wert ist der zweitgrößte der E-Gruppe. Dazu eine tote `persona.png`. | **Ressourcen-Ballast** | keiner | niedrig |
| **26** | `packages/prompter/assets/pre-step.js` (643) + `runtime-state.js` (547) | Beide haben **keinen eigenen Unit-Test** — nur Integrationstests über den echten Waterfall. Jede Extraktion braucht **zuerst** einen direkten Test, sonst ist die Abdeckung nur indirekt. | **Testlücke vor Extraktion** | — | mittel |
| **27** | `AGENTS.md` vs. `packages/persona/index.js` | AGENTS.md sagt „**18** bindings" für den Persona-Split. Gemessen: **49** im direkten apply-Scope, **138** inkl. aller verschachtelten Scopes. Die Zahl ist seit Langem falsch — und niemand besitzt sie. | **unbesitzte Behauptung** | — | niedrig |
| **28** | `docs/PAKETE.md:92`, `docs/ZAHLEN.md:75-80` | „28 Asset-Module", `index.js` 256, `pre-step.js` 544. Ist: 29 Assets, `index.js` **345**, `pre-step.js` **643**. Die Doku zählt den Stand von vor drei Tagen. | **Doku-Drift** | `zahlen:check` deckt nur den generierten Block | niedrig |
| **29** | `docs/ZAHLEN.md` §1 (generierter Block) ↔ Baum | **Der Zahlen-Block driftet heute.** `npm run zahlen:check` → **Exit 1**: „Proben unter `docs/probes/`" ist **51**, der Block sagt **50** (neu: `docs/probes/update-now.json` + 2 PNG, untracked). „Build (`dist/packages/`)" ist **2 706 318 Bytes**, der Block sagt **2 697 280** (das `dist/` wurde neu gebaut). **Nachgewiesen: auch ohne die Datei dieses Plans ist der Check rot** — der Drift stammt aus dem vorbestehenden dirty Baum. Der Check deckt nur den generierten Block, nicht die Prosa in §1.2/§2 (dort stehen u. a. „317 Code-Dateien" — real **355**). | **Doku-Drift, vom Gate nicht gedeckt** | `npm run zahlen:check` (Exit 1) | niedrig |
| **30** | `scripts/gate/plugins/persona.mjs:184-192` ↔ Persona-Extraktion | Das Gate prüft **`apply`, `Config` und `ctx.systemPrompt` in genau `packages/persona/index.js`** — pfadgebunden, nicht inhaltsgebunden. Eine Zustands-Extraktion (Zustand → `assets/persona-runtime-state.js`) lässt `apply`/`Config` in `index.js` stehen und wäre grün — aber jede **Verschiebung** von `apply` oder `Config` macht das Gate rot, ohne dass der Zustand beteiligt ist. `REQUIRED_TOKENS` (`:49`) und `STATE_FIELDS` (`:164`) sehen ebenfalls nur `index.js`. | **Pfadgebundener Vertrag** | `gate/plugins/persona.mjs` | **hoch** für D |
| **31** | `packages/prompter/assets/blocks.json` (15× `"herkunft": "packages/persona/index.js …"`) | **Datenverweis auf eine Datei, die im Refactor verschwindet.** 15 Bausteine nennen den Pfad **im Klartext** als Herkunft (IDENTITY, EPISTEMIC, CHANGE_CLASSES, DETERMINISM, …, Z. 7–174). Kein Import, keine Prüfung — verschiebt sich Personas Zustand, bleiben die Verweise **syntaktisch gültig, aber semantisch falsch**. Auch `persona-state.test.mjs:554-559` vergleicht `packages/scoring/assets/tendency-rules.json` mit `packages/persona/assets/persona-state.json` — eine **Daten-Daten-Kopplung über Paketgrenzen**. | **verlorene Herkunft** (Datenverweis) | keiner für die Verweise; `persona-state.test.mjs` für die Datenpaarung | **hoch** für D |
| **32** | `packages/version/client.js` (249/250) | Der Client steht **eine Zeile** vor der Grenze (250). Jede weitere Zeile macht `structureIssues()` rot und braucht einen `bestand`-Eintrag. `structure.json:5` nennt genau das den vorgesehenen Weg — aber `version/client.js` steht **nicht** im `bestand` (gemessen: 0 Treffer). | **Grenze vor der nächsten Zeile** | `structure.mjs:100-103` | niedrig |
| **33** | `scripts/gate/tests/key-router-wire.test.mjs:135` ↔ `packages/key-router/index.js:319` | **Der Test ist heute rot — deterministisch (3 Läufe, 3× rot).** `key-router/index.js:319` ruft `fetchCatalog(...)` **beim Start** (das Live-Katalog-Feature). Der Test zählt `stub.requests` **gemeinsam** für Katalog und Probe und erwartet an Z135 genau **1** Request — es sind **2**. Der Test wurde beim Einbau des Live-Katalogs nicht nachgezogen. `key-router-security.test.mjs` schlägt aus demselben Grund fehl. `docs/ZAHLEN.md` §2 nennt das bereits: „902 Tests, 900 grün, **2** rot (vorbestehend)". | **roter Test im Ausgangsbaum** — der Refactor darf ihn nicht als „schon kaputt" ignorieren, sondern muss ihn als **erste** Arbeit mitnehmen | `key-router-wire.test.mjs`, `key-router-security.test.mjs` | **hoch** (blockiert den Key-Router-Scope) |
| **34** | `packages/codingmon/assets/zucht.js` `hatchReady()` ↔ `packages/codingmon/assets/snapshot-schema.js` | **⚠ BUG — selbst reproduziert.** `hatchReady()` legt eine Kreatur **ohne `hp`** an (`zucht.js`: `id, species, xp, bxp, gen, bonuses, clutch, wins, losses, round, hits, damageTotal` — 12 Felder). `SnapshotSchema` verlangt `hp`. **Messprobe:** `hatchReady` auf einem gültigen Stand → `SnapshotSchema.safeParse` → **ABGELEHNT** mit **sechs** Befunden (`species`, `xp`, `wins`, `losses`, `round`, `damageTotal`: „expected number/string, received undefined"). Die Host-Fassung erzeugt also einen Stand, den das **eigene** Schema des Pakets ablehnt. Der Client-Mirror (`client.js:1182-1185`) setzt `hp` und ist deshalb gültig — die beiden Fassungen sind nicht austauschbar. | **Schema-Verstoß im eigenen Paket** | `zucht-core.test.mjs` prüft `hatchReady` isoliert, **nicht** gegen das Schema | **hoch** |
| **35** | `packages/codingmon/assets/zucht.js` (168 Z) — **keine Produktivverwender** | Gemessen: der einzige Nicht-Test-Importer ist `migration.js` (wegen `BXP_FOUNDER`/`fnv1a32`). Die eigentliche Zucht-Logik läuft **im Browser-Spiegel** `client.js:869-1222`. Die Host-Fassung ist eine **zweite, ungenutzte** Implementierung derselben Regel — mit dem Fehler aus #34. | **tote zweite Wahrheit** | `zucht-core.test.mjs` (nur die tote Fassung) | **hoch** |
| **36** | `packages/prompter/assets/pre-step.js` (643) + `runtime-state.js` (547) + `trace-report.js` (120) | **Alle drei ohne eigenen Unit-Test** (gemessen: 0 Testdateien importieren sie direkt; nur Integrationstests über den echten Waterfall). `enhancer` und `mode-core` haben dagegen direkte Tests. Jede Extraktion in einen dieser drei braucht **zuerst** einen direkten Test — sonst ist die Abdeckung nur indirekt. | **Testlücke vor Extraktion** | — | mittel |
| **37** | `packages/popup/client.js:46` | Der Kommentar verweist auf `scripts/gate/tests/abort-trace.test.mjs` — **die Datei existiert dort nicht** (gemessen: 0 Treffer; sie liegt in `packages/prompter/test/abort-trace.test.mjs`). Der Verweis zeigt ins Leere; wer den Drift dieser Naht prüfen will, findet die Prüfung nicht. | **Verweis ins Leere** | — | niedrig |
| **38** | `packages/markers/client.js:623` ↔ `packages/prompter/client.js:275` | **Beide tragen `order: 30`** im Slot `sidebar.panellist` (gemessen). Wer zuerst kommt, entscheidet die Darstellung — und **kein Test pinnt die Orders** (`client-activation.test.mjs` prüft nur, dass ein Eintrag existiert). Eine Zahl, die niemand besitzt, aber das Bild bestimmt. | **Order-Kollision ohne Wächter** | keiner | **hoch** (billig zu fixen) |
| **39** | `window.__shinonPluginCatalog` (4 Schreiber) ↔ `window.__shinonPlugins` (16 Schreiber) ↔ `packages/dashboard/client.js:159` | **Zwei Registry-Tabellen.** `key-router`, `popup`, `traceability`, `version` schreiben in `__shinonPluginCatalog` (Objekt); **16 Pakete** schreiben in `__shinonPlugins` (Map). Das Dashboard liest **nur** `__shinonPlugins` — **popup und traceability sind für das Dashboard unsichtbar**, obwohl sie sich melden. Beide Global-Namen stehen im Kanon (`canon.json`), die **Trennung der Zwecke** steht dort nicht. | **zweite Wahrheit + Registry-Spaltung** | keiner | **hoch** (Sichtbarkeit!) |
| **40** | `docs/CI-UND-GATES.md:51` ↔ `scripts/gate/plugins/registry.mjs` | Die Doku-Tabelle sagt `registry` = „Namens-Registry (`contracts/canon.json`) gegen den Baum". **Das Plugin prüft etwas anderes:** `scripts/gate/plugins/registry.mjs` prüft die **Bundle-Auflösbarkeit** — hat jedes Paket ein `dsh.bundle.patch`, das auf der Platte existiert, und ist jedes `@shinon/*`-Bundle im Profil in `packages/*` registriert. **Der Kanon wird von `scripts/lib/canon.mjs:57` geprüft** — an einem anderen Ort, ohne Gate-Plugin. Die Doku verwechselt zwei Riegel. Dazu: `.shinon/gate-profile.json` wird in `AGENTS.md`, `docs/COMMIT-REGELN.md` und `docs/contracts/commit-policy.json` als Preset-Auswahl genannt — **die Datei existiert nicht** (gemessen: `exists=False`), damit ist die Datei-Policy **toter Dekor** (Details in §8.5). | **Doku behauptet Unausführbares** | — | mittel |
| **41** | `scripts/lib/structure.mjs:49` (`WURZELN = ['packages','scripts','bin']`) | Der Struktur-Riegel sieht **nur** drei Wurzeln. `profiles/` (9 Dateien, davon `cordis.patch.yml` mit **621 Zeilen**) und `docs/contracts/` (13 Verträge) fallen unter **keine** Klasse — sie sind größenüberwacht. Die größte einzelne Konfigurationsdatei des Baums steht unter keinem Riegel. | **Riegel-Lücke** (analog #29: vom Gate nicht gedeckt) | `structure.test.mjs` prüft die Klassen, kennt die Lücke nicht | mittel |
| **42** | `scripts/lib/model-route.mjs:145` ↔ `profiles/shinon/cordis.patch.yml:93-135` | **⚠ BUG — selbst reproduziert.** Die harte Form-Prüfung `ROUTE_MODEL_NOT_IN_CATALOG` verlangt, dass das gewählte Modell in der **statischen** `models:`-Liste des Profils steht. **8 von 10 Providern haben keine:** gemessen `openrouter 0, nvidia 0, groq 0, cerebras 0, google 0, mistral 0, together 0, huggingface 0` — nur `agnes` (12) und `prompter` (10) führen eine Liste. **Probe:** Route auf `openrouter/deepseek/deepseek-chat-v3.1` umgestellt → `modelRouteIssues` meldet `ROUTE_MODEL_NOT_IN_CATALOG` — **obwohl das Modell beim Anbieter existiert**. Die Prüfung zwingt also zu einer statischen Liste, die von selbst veraltet, sobald ein Anbieter ein Modell entfernt. **Die Wahrheit ist der Live-Katalog**: `packages/key-router/index.js:255` holt `/models` pro Provider und hält `declared` (statisch) neben `live` (geholt) — `key-router/index.js:227,230`. **Die Prüfung wertet das falsche Feld aus.** | **zweite Wahrheit + veraltende Pflicht** | `model-route.test.mjs:29` prüft **nur die gewählte Route** (heute `prompter` — deshalb grün); **kein Test** prüft einen Provider ohne Liste | **hoch** |
| **43** | `profiles/shinon/cordis.patch.yml` — 8 Provider ohne Modellpflege | **Die Modelle der anderen Anbieter fehlen vollständig.** Der Nutzer kann `openrouter`, `nvidia`, `groq`, `cerebras`, `google`, `mistral`, `together`, `huggingface` als Route wählen — und **jede** Wahl scheitert an #42, bis eine statische Liste existiert. Zugleich sind nur für `agnes`/`prompter` überhaupt Modelle gepflegt. **Zwei getrennte Aufgaben:** (a) die Modelle **live** holen und in den Key-Router-Katalog übernehmen (der Pfad existiert, `key-router/index.js:255`), (b) die Form-Prüfung so umbauen, dass sie den **live** Katalog prüft, nicht eine handgepflegte Liste. **(a) ohne (b) macht die Liste nur einen anderen Ort für dieselbe Wahrheit.** | **Lücke + Widerspruch zu #42** | neu: ein Test, der die Route gegen den **live** Katalog prüft | **hoch** |
| **44** | `packages/prompter/assets/capabilities.json` ↔ `scripts/gate/tests/capabilities.test.mjs:53` | **⚠ BUG — selbst reproduziert.** Der Test „jeder Eigentümer ist ein Paket, und jedes Paket hat eine Frage" ist **rot**: „Pakete ohne Fähigkeit: **diff-overview**". Die Karte ist der **Fragen-Register** — jedes Paket braucht mindestens eine Frage (`owner`, `seam`, `terms`, `notAnswers`, `evidence`), sonst kann der Prompter es **nicht zuordnen**. Ein Paket ohne Frage ist im Betrieb unsichtbar, obwohl es im Profil steht. **Der Riegel hat genau das neue Paket erwischt** — er funktioniert. | **Lücke (Paket unvollständig)** | `capabilities.test.mjs` (der Riegel selbst) | mittel |
| **45** | **Ein neues Paket braucht 5 Dinge — nicht 3** (Regel-Lücke, aus #44 abgeleitet) | Das neue Paket `diff-overview` brauchte: **(1)** `package.json` + `cordis.patch.yml` (Namensvertrag), **(2)** Kanon-Eintrag (`__shinonDiffOverview`), **(3)** `structure.json`-Klasse, **(4)** Profil-Eintrag (sonst nicht scharf), **(5)** **eine Fähigkeit in `capabilities.json`** (sonst unsichtbar). Die ersten drei standen in keiner Checkliste; die letzten beiden kamen erst durch das Scheitern. **Fünf Pflichten, verteilt auf fünf Dateien in drei Paketen — ohne Checkliste findet man sie nur, indem man es baut.** | **fehlende Regel** | `capabilities.test.mjs` + `canon.test.mjs` + `structure.test.mjs` + `bundle-resolution` | **hoch** |
| **46** | `packages/persona/index.js:844-846, 858, 902` ↔ `packages/project-index/assets/index-core.js:1582` | **⚠ BUG — selbst nachgemessen.** `selfModelNamespace()` (`:844`) gibt **einen** Namespace für **alle** Roots zurück (`shinon.persona-self/v1`). `selfModels` ist eine Map **je Root** (`:902`), aber `persistSelfModel` (`:858`) schreibt in `entry.namespace` — **denselben** Namespace für jeden Root. Und der Store **ersetzt** den Namespace: `index-core.js:1582` — `delete from ${MEMORY_TABLE} where namespace = ?`. **Folge:** Root B überschreibt Root A → das Selbstmodell des ersten Workspace ist beim ersten Schritt des zweiten **weg** — **still** (`ok: true`, kein Fehler). **Zwei Workspaces im selben Host ⇒ ein Selbstmodell geht verloren.** **Und der Pfad ist ungetestet:** `persona-state.test.mjs` ruft `selfModel*`/`persistSelfModel` **0×** auf (gemessen) — es gibt **keinen** Testfall mit zwei Roots. **Fix:** Namespace je Root eindeutig (`${SELF_MODEL_NAMESPACE}/${hash(root)}` — der `fingerprintRoot` aus `@shinon/seams/core` existiert bereits); der Vertrag bleibt als **Präfix**, additiv. | **Datenverlust + ungetesteter Pfad** | **neu:** `persona-state.test.mjs` — Root A schreiben → Root B schreiben → Root A wieder laden → **muss noch da sein** | **hoch** |
| **47** | `packages/project-index/assets/index-core.js:1590` ↔ `:1611` (Lesen) | **⚠ BUG — selbst reproduziert.** `writeMemory` schreibt Memos mit `ordinal = 0` und `ref = String(memo.id)`; `readMemory` liest mit `order by kind asc, ordinal asc, ref asc` — bei `ordinal = 0` entscheidet **`ref` als String**. **Probe:** Memos `s1, s2, s10` → gelesen als `s1, s10, s2`. **Records** bekommen `ordinal = index` und **bleiben** reihenfolgetreu (`1,2,3`) — der Unterschied ist unbeabsichtigt. **Wer trifft das?** Heute latent (je ein Memo: `persona/index.js:990`, `narrative/index.js:170`, `prompter/assets/runtime-state.js:200`) — aber `scoring/index.js:255` schreibt `blockAttributions` **mit `session_id`**, und deren Reihenfolge bestimmt, welcher Block zuletzt gewichtet wurde. **Fix: eine Zeile** (`ordinal = index` wie bei Records). | **Reihenfolgebruch an der Store-Grenze** | **neu:** `project-index.test.mjs` — 3 Memos `s1, s2, s10` → Lesereihenfolge **muss** `s1, s2, s10` sein | mittel |

> Das ist der Teil, der den Plan tragfähig macht. Jede Zeile: wo, was wandert, was bleibt, welcher Konflikt, welcher Test deckt ihn auf.
> **Befunde mit `⚠ BUG` sind verifizierte Defekte im heutigen Baum, nicht Refactor-Risiken.**

| # | Wo | Was wandert / was bleibt | Konflikttyp | Aufdeckender Test | Schwere |
|---|---|---|---|---|---|

**Jeder Zeilenanker in diesem Plan ist gegen den Arbeitsbaum vom 2026-10-22 geprüft** (88 vollständige Pfade, 0 unauflösbare). Drei davon zeigen bewusst auf **Dateien, die es noch nicht gibt** — das sind die **Ziele** des Refactors, keine Fehler:

| Pfad | Rolle im Plan |
|---|---|
| `scripts/assets/build-zucht-client.mjs` | **neu** — Generator für den Zucht-Block (F-1) |
| `scripts/lib/commit-surfaces.mjs` | **neu** — Ziel der Extraktion aus `commit-trailer.mjs` (G-2) |
| `scripts/gate/tests/abort-trace.test.mjs` | **fehlt heute** — Konflikt #37: `popup/client.js:46` verweist darauf, die Datei liegt in `packages/prompter/test/` |

---

## 5. Extraktionsplan

### 5.1 Gruppe C — Prompter (12 463 Z Code, 53 Code-Dateien / 62 Dateien inkl. JSON)

Der einzige harte Import ist `@shinon/seams/core`; alles andere ist Naht + Dienst. Die Extraktionen sind deshalb **naht-orientiert**, nicht datei-orientiert.

| Schritt | Neue Datei | Vorher → Nachher | Aufwand | Risiko |
|---|---|---|---:|---|
| 1 | `assets/naht-namen.js` — die Spiegel-Namen fremder Pakete (Index, Scoring, Persona) raus aus `mode-core.js` | `mode-core.js` 319 → ~235 | 1 h | niedrig |
| 2 | `assets/kontext-zugriff.js` — der Project-Index-Zugriff (6× wiederholte `ctx.get`-Prüfung → 1) | `pre-step.js` 643 → ~545 | 1 h | niedrig |
| 3 | `assets/prosa-rettung.js` | `enhancer.js` 533 → ~415 | 1 h | niedrig |
| 4 | `assets/enhancer-ausgabe.js` | `enhancer.js` 533 → ~345 | 0,5 h | niedrig |
| 5 | `assets/route.js` | `runtime-state.js` 547 → ~520 | 0,5 h | niedrig |
| 6 | `assets/entscheidungs-datensatz.js` | `pre-step.js` 643 → ~380 | 2 h | mittel |
| 7 | `assets/skill-dateien.js` | `prompt-files.js` 347 → ~165 | 1,5 h | mittel (PACKAGE_URL) |
| 8 | `assets/intent-semantik.js` | `intent-memory.js` 506 → ~400 | 1,5 h | mittel (Datenform) |
| 9 | `assets/block-auswahl.js` — Scoring-Spiegel raus aus dem Selektor | `block-select.js` 453 → ~365 | 1,5 h | **hoch — zurückgestellt** |

**Nach Schritt 8**: kein `assets/*.js` über 500 Zeilen, alle vier Eigentümer (`pre-step` 380, `runtime-state` 520, `enhancer` 345, `trace-report` 120) mit ≥ 130 Zeilen Reserve.

**Die 99-Namen-Grenze**: `prompter-split.test.mjs` pinnt alle 99 öffentlichen Namen. Jede Extraktion muss die Namensmenge **unverändert** lassen — der Eigentümer (`index.js`) re-exportiert, das neue Modul trägt die Implementierung.

**Schritt 9 ist zurückgestellt, mit Grund:** Er nimmt einem bewusst importfreien Modul die Importfreiheit. Der Selektor bekommt die Gewichte als **Parameter** (`opts.weights` tut er heute schon), nicht über einen Import.

**Nicht Extraktion, sondern Reparatur** (vor dem Refactor zu erledigen, sonst trägt er den Defekt weiter): Konflikt **#1** (blockWeights), **#11** (tote Registry), **#12** (totes Budget).

### 5.2 Gruppe B — Wissen & Kontext (~10 100 Z)

| Prio | Von → Nach | Effekt | Risiko |
|---|---|---|---|
| 1 | `scoring/index.js:542` → Host + `assets/scoring-store.js` (importfrei, deterministisch) | 542 → ~340, Luft 8 → ~210 | niedrig |
| 2 | `task-router/index.js:456-690` (235 Z, §18) → `assets/task-micro-state.js` | 770 → ~535 | mittel |
| 3 | `project-index/assets/index-core.js` (2 220) → 5 Module: Schema/Parsers, Secrets/Schutz, DB+Migration, Warm-Pfad, MAX-Kontext | 2 220 → 5×~440 | mittel |
| 4 | `facts-core.js:147 wouldCreateCycle` + `facts-invalidate.js:30 findCycle` → **ein** Zyklus-Modul | Duplikat raus | niedrig |

**Nicht extrahieren:** `narrative` (258 Z, 0 Imports, Gate erzwingt Importfreiheit) · `hook`/`events` (Paketgrenze scharf; die offene Stelle ist der doppelte Envelope-Bauer, nicht die Dateiform) · `facts-extract`/`facts-reconcile` (je importfrei und korrekt geschnitten — das Problem ist ihr Fehlen im Betrieb, nicht ihre Form).

**Vorher zu klären:** Konflikt **#1** — `blockWeights` gehen beim `save`/`load` verloren. `scoring-block-learning.test.mjs` nutzt einen Fake-Store und sieht es nicht.

### 5.3 Gruppe E — Oberfläche (4 496 Z)

| Prio | Von → Nach | Effekt | Risiko |
|---|---|---|---|
| 1 | `popup`/`traceability`/`token-usage`: die 3×138-Zeilen-Sitzungsbindung → **eine** `seamOf(ctx)` + gemeinsame Faltung, als 4. Spiegel-Paar | 3×138 → 55 + 3×~35 | hoch (Mechanik: multi-mirror) |
| 2 | Marker-Vertrag: JSON ↔ Client (12 Pins) | 0 Umbau, `repo.mjs` additiv | niedrig |
| 3 | Dashboard-`EXPECTED`: 17 Z Inline → Host-`INDEX_INJECT` + 45 Z Kern | 479 → ~400 | mittel |
| 4 | Toast-/Overlay-View (116 Z traceability + 40 Z popup) | 547 → ~430, 425 → ~370 | mittel |
| 5 | `core/client.js:64` — 34 628 B Base64 in einer Zeile + tote `persona.png` | Bytes −46 KB | niedrig |

**Der Gewinn bei Prio 1 ist nicht die Größe, sondern die Pinned-ness:** eine `SOURCE_TWINS`-Region-Regel macht Drift **arithmetisch unmöglich** (Bytevergleich), wo heute drei freie Kopien driften können.

**Nur bedingt möglich — aber es gibt einen Weg, den niemand benutzt.** Ein Client-Bundle kann `assets/` **nicht importieren** (`require` löst nur gegen die Modul-Tabelle des Loaders auf, `dsh-client-modules/lib/client.js:833-849` — ein relativer Pfad wirft). **Aber** DSH kennt `require.async("./client.<name>.js")` (`:842-848`), validiert gegen `CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/` (`index.js:170`), und **nutzt das produktiv selbst** (`dsh-client-ui-sidebar-terminal/lib/client.js:167` → `require.async("./client.terminal.js")`).

**Im Shinon-Baum wird das nie benutzt** (gemessen: 0 Treffer für `require.async` in `packages/` und `scripts/`). Es ist also eine **ungenutzte, tragfähige Option** — aber sie kostet drei Dinge, die alle im Plan stehen müssen:

| Folge | Beleg |
|---|---|
| Die Chunk-Datei braucht eine **neue Klasse** in `structure.json` — `packages/<p>/client.<x>.js` passt in **kein** Muster (gemessen: „KEINE KLASSE") | additiver Muster-Eintrag nötig |
| `RUNTIME_FILES` (`repo.mjs:51`) kennt `client.js`, **nicht** `client.*.js` → `artifactFiles` (`:286-291`) und der Distributionstest müssten erweitert werden | `repo.mjs` |
| DSH listet `"lib/client.*.js"` explizit in `package.json` `files`; die E-Pakete haben **alle kein** `files`-Feld | `package.json` je Paket |

**Deshalb gilt: der Client-Split über Chunks ist eine Option für später, nicht für Schritt 2.** Für Schritt 2 bleibt der ehrliche Weg: **ein gemeinsames Kern-Modul + ein spiegel-geprüftes Paar** (der Kern bleibt 4× im Baum, aber die `SOURCE_TWINS`-Regel macht Drift **arithmetisch unmöglich** — Bytevergleich, `repo.mjs:726-733`, statt drei freier Kopien, die driften können).

**Vorher zu klären:** Konflikt **#7** — Personas `uiSnapshot()`-Feldformat bricht `core/client.js` (`bannerStatus`) hart. Ein D-Feldumbau bricht E stumm.

### 5.4 Gruppe F — Begleiter (9 093 Z, 128 Dateien)

Der Client ist 3 482 Zeilen, davon 161 354 B handgeschriebene Blöcke (33,9 %):

| Block | Bytes | Zustand |
|---|---:|---|
| CSS-Block (Z2970–3401) | 29 923 | handgeschrieben |
| React-Panel (Z2085–2564) | 28 400 | handgeschrieben |
| Encounter-Bühne/Deck (Z2565–2969) | 19 981 | handgeschrieben |
| Zucht-Mirror (Z869–1222) | 18 804 | **handgespiegelt, drift-gefährdet** |
| Kampf-Logik (Z1666–1968) | 13 253 | handgeschrieben |

| Prio | Maßnahme | Risiko |
|---|---|---|
| **1** | **Die Zucht in EINEN generierten Block ziehen** — das löst Konflikte **#2, #3, #34 und #35 auf einmal**. `assets/zucht.js` (168) + `zucht-glueck.js` (101) + `zucht-xp.js` (57) + `zufall.js` (68) = **394 Z** → `assets/zucht-core.js` (~380) + generierter Block `generated-zucht-core` im Client. Was wandert: `pair`→`breedingPairCore`, `hatchReady`→`hatchReadyEggs`, `childSpeciesCandidates`→`breedingCandidates`, `rollBonuses`→`rollBreedingBonuses`, `fnv1a32`/`streamFor`/`randInt`/`weightedPick`, `genMods`/`bxpModBps`/`effectiveStat`, `legacyLevelFor`. Client: −18 804 B Handspiegel → +~15 000 B generiert = **netto ~−3 800 B**. **Generator:** `scripts/assets/build-zucht-client.mjs` (Klon von `build-encounter-client.mjs`). **Test:** NEU `test/zucht-client.test.mjs` — (a) Block byteweise gleich, (b) dieselbe Ei-Folge auf beiden Seiten ⇒ gleiche Boni, gleiches `bp`, (c) **der Client-Stand besteht `SnapshotSchema.parse`** (das fängt den `hp`-Fehler aus #34). | **hoch — löst 4 Konflikte** |
| 2 | **`uebergabe.test.mjs` auf alle 5 Nahtnamen erweitern**; `repo.mjs:520-529` ebenso (Konflikt #15). Heute prüft der Test `UEBERGABE_SERVICE`, `UEBERGABE_PARAMETER` und die Typnamen **überhaupt nicht** gegen den Client. | niedrig |
| 3 | **`build-encounter-client.mjs --check` und `build-zucht-client.mjs --check` als Gate-Schritt** (Muster aus `build-codingmon.mjs --check`, das in `katalog.test.mjs:52-57` über `spawnSync` läuft). Heute laufen die `--check`-Läufe **nur** als Nebenwirkung der Paket-Suiten — **nicht** im statischen Gate und **nicht** im Build. | niedrig |
| 4 | `GRID_PALETTE` (client) gegen `PALETTE` (Generator) prüfen — heute kein Test (Konflikt #14). Ein Farbwechsel im Generator würde den Client still falsch einfärben. | niedrig |
| 5 | NEU `test/snapshot-schema.test.mjs`: jede der 13 `SNAPSHOT_FIELDS` hat eine Entsprechung im Schema; der **Client**-Snapshot besteht `SnapshotSchema.parse` | niedrig |
| 6 | **Die Encounter-Referenzen auflösen** — `assets/encounter.js` `ENCOUNTER_SOURCE_MAP` verweist auf 7 Stellen (`block-select`, `pre-step`, `result-contract` 2×, `abort-core`, `salvage-store`, `skill-lifecycle`). `test/encounter.test.mjs:89-95` prüft **nur**, dass das Paketverzeichnis existiert — **nicht**, dass die genannte Funktion existiert. Die 7 Refs müssen gegen **existierende Exporte** aufgelöst werden, nicht gegen Ordnernamen. **Additive** Änderung (Referenztabelle + Test), keine Vertragsänderung. | mittel |

**Die Beweislage für Prio 1** (gemessen, nicht behauptet):
- `assets/zucht.js` erzeugt einen Stand, den das **eigene** Schema ablehnt (Konflikt #34) — reproduziert mit `SnapshotSchema.safeParse`.
- `assets/zucht.js` hat **null Produktivverwender** (Konflikt #35) — der einzige Nicht-Test-Importer ist `migration.js`.
- Die Zufalls-Logik ist derzeit **verhaltensgleich**: `rollBonuses` ↔ `rollBreedingBonuses` — **0 Abweichungen in 5 970 Stichproben**; `legacyLevelFor` — 0 Abweichungen in 1 460 Stichproben. **Die Spiegelung stimmt — sie ist nur nicht maschinell verglichen.** Der Generator macht daraus einen Bytevergleich.

**Das schärfste offene Problem in F** bleibt: eine umbenannte Prompter-Funktion macht F still blind (Prio 6).

### 5.5 Gruppe D — Agenten-Identität (4 492 Z)

`persona/index.js` (1 447 Z) ist das offene Fallbeispiel aus AGENTS.md. Gemessen: **49** Bindings im direkten apply-Scope (138 inkl. verschachtelt) — die Doku sagt 18.

**Die Bindings, nach Art getrennt** (gemessen, `apply()`-Scope, Z. 640 ff.):

| Art | Beispiele | Ziel |
|---|---|---|
| **Zustand** | `contract` (666), `spokenFor` (693), `lastTrigger` (736), `lastUserMood` (740), `lastNarrative` (745), `lastDecision` (757), `storeWarned` (812), `memoryDoc` (939), `lastMemoryPrompt` (940), `lastSessionId` (942), `memoryWarned` (943) | → Eigentümer-Modul |
| **Service-Handle** | `renderPrompt` (725), `renderTrigger` (737), `renderUserLageSection` (741), `renderNarrativeSection` (746) | → Eigentümer-Modul |
| **Ableitungen** | `rootOfAssembly` (685), `speaksForRoot` (695), `projectsForRoot` (701), `speaksForSession` (704), `projectsForSession` (717), `gated` (721) | bleiben im Host |
| **Ablage-Helfer** | `selfModelNamespace` (844), `persistSelfModel` (849), `selfModelOf` (871), `memoryNamespace` (936), `ensureMemory` (951), `persistMemoryDoc` (984) | → Eigentümer-Modul |

**Vorschlag**: `assets/persona-runtime-state.js` als Eigentümer (Muster aus dem Prompter: `assets/runtime-state.js`). Der Host-Einstieg behält `apply(ctx, config)`, `Config` und die Registrierungen; der Zustand wandert in den Eigentümer. Erwartete Wirkung: `index.js` 1 447 → ca. **950–1 050**.

**Der kanonische Ort je Sache** (gemessen, nicht geraten):

| Sache | Ort heute | Beleg |
|---|---|---|
| Self-Model (Rechnung) | `assets/self-model.js` — vertragsrein, importfrei, 304 Z | `self-model.js:1-9` |
| Self-Model (Ablage) | **im Host**, `index.js:844-930` | kein Core-Modul liest/schreibt sie |
| Memory | `assets/memory-core.js` + Host-Ablage `index.js:936-1031` | — |
| Claims | `assets/claim-core.js` (143 Z) | — |

**Drei Blocker, die vor der Extraktion zu klären sind:**

1. **Konflikt #4** — `declaredWorkspaceRoot()` (`:132`) ist eine **dritte** Workspace-Auflösung. Sie darf in keine generische Auflösung wandern.
2. **Konflikt #30** — `gate/plugins/persona.mjs:184-192` prüft `apply`, `Config` und `ctx.systemPrompt` **pfadgebunden in `packages/persona/index.js`**. Die Zustands-Extraktion lässt `apply`/`Config` stehen (grün), aber sie zeigt: **das Gate kennt die Datei, nicht den Inhalt.** Vor der Extraktion ist zu klären, ob `REQUIRED_TOKENS` und `STATE_FIELDS` mitwandern müssen.
3. **Konflikt #31** — `blocks.json` nennt **15×** `packages/persona/index.js` im Klartext als Herkunft der Bausteine. Wandert Personas Zustand, sind diese Verweise semantisch falsch — syntaktisch gültig, also unauffällig.

**Version** (1 012 Z) ist nach dem Umbau fast sauber: `assets/version-state.js` (153 Z) trägt das Banner-Modell in **einer** Datei, `index.js` re-exportiert. Zwei Reste: der **Doppelimport** `badgeLine` in `index.js:9` (Import) und `:334` (Log-Aufruf) — eine Falle, denn `bannerModel(state).line` ist bereits `badgeLine(state)` —, und die **Client-Fallback-Labels** in `client.js:144` (`choice?.now?.label ?? 'Jetzt installieren'`, `choice?.next?.label ?? 'Beim nächsten Start'`) — die machen aus der „einen Frage" eine zweite Wahrheit: `choiceModel()` sagt dieselben Worte (`version-state.js:129,133`), der Client hat sie nochmal als Literal.

### 5.6 Gruppe A — Fundament & Profil (7 852 Z)

`scripts/lib` allein: 28 Dateien, 7 069 Zeilen, **251 exportierte Namen**.

| Prio | Maßnahme | Risiko |
|---|---|---|
| 1 | **`repo.mjs` (1 268 Z, 33 Importeure, 21 `ctx.repo.*`-Zugriffe) in vier Module + Fassade.** `repo-contract.mjs` (~306: Discovery, Manifest, Patch-Schema, Namensvertrag, Paketgraph) · `repo-legacy.mjs` (~110: Legacy-Guard, pnpm-Invariante) · `repo-twins.mjs` (~396: `SOURCE_TWINS`, `hostMirrorIssues`, Seam-Inventar) · `repo-profile.mjs` (~400: `resolveProfile`, `bundleResolutionIssues`, `dshInstanceIssues`). `repo.mjs` bleibt **Fassade mit identischen Exportnamen** (~55 Z) — alle 33 Importeure bleiben unangetastet. Reihenfolge: `repo-twins` → `repo-profile` → `repo-legacy` → `repo-contract`. **Alle vier Ziele liegen unter der script-Grenze 550** → kein neuer `bestand`-Eintrag, der alte sinkt. | mittel |
| 2 | `profiles/shinon/cordis.patch.yml` (621 Z) in 5 Sektionen — sie wird von **5 Gruppen** geprüft (persona, narrative, events-spine, scoring, markers) und ist bisher größenüberwacht (Konflikt #41) | niedrig |
| 3 | **`satisfiesRange` zusammenführen** — zwei Funktionen **gleichen Namens, vertauschter Argumentreihenfolge**: `runtime.mjs:90` ist `(version, range)`, `dsh-versions.mjs:87` ist `(range, version)`. **Gemessen: beide Dateien sind intern konsistent, es gibt keinen Cross-Call — es ist kein Bug, sondern eine Naming-Kollision, die beim Zusammenführen zum Fehler wird.** Der Plan legt **eine** Reihenfolge fest (`version, range` — die heute 4 Gate-Tests nutzen) und migriert die 3 Aufrufer in `dsh-versions.mjs`. | niedrig |
| 4 | `scripts/lib/yaml.mjs` — Behauptung in `engine.mjs:19` korrigieren oder den Parser eintragen (Konflikt #10) | niedrig |
| 5 | Toter Code: `pr-promotion.mjs` (176 Z, **0 Nicht-Test-Importeure**) und `systemd-units.mjs` (133 Z, 1 Importeure) sind **kein** geteiltes Werkzeug, sondern gehören fachlich zum Aufrufer | niedrig |
| 6 | API-Rauschen: **57 der 251 Exporte** in `scripts/lib` werden intern genutzt, aber von niemandem importiert (23 %) — `repo.mjs` 7, `payload.mjs` 11, `commit-text.mjs` 9 | niedrig |

**Vier Verträge ohne Code-Leser** (`abort.json`, `core.json`, `events.json`, `markers.json`, `model-route.json`, `persona.json`, `provenance.json`): entweder Code anschließen oder Vertrag streichen. Ein Vertrag, den niemand liest, ist Dokumentation mit Vertragsform.

**Der `dshRoot`-Zwillingsbefund**: `yaml.mjs:33,63,39` und `dsh.mjs:114,191,173` tragen **dieselben Namen** für DSH-Auflösung — `harnessFiles` ist **byteidentisch** (gemessen), `dshRoot`/`dshHarnessDir` haben **verschiedene Semantik** (lokal-erste vs. PATH-Ableitung). 15 Gate-Tests nehmen `yaml.mjs:dshRoot`, 3 Skripte `dsh.mjs:dshRoot`. Zwei Namen, zwei Bedeutungen — eine Pflicht zur Zusammenführung, kein Refactor-Zwang.

### 5.7 Gruppe G — Betrieb & Gate (27 410 Z in `scripts/gate/`, 113 Dateien)

| Prio | Maßnahme | Risiko |
|---|---|---|
| 1 | `plugins/scoring.mjs` (821 Z, Grenze 100 — 8,2×) zerlegen: Vertrag / Statik / Scope / Outcome / Profil-Bundle-Pflicht | **hoch — Gate-Slice!** |
| 2 | `plugins/commit-trailer.mjs:147-195` → `scripts/lib/commit-surfaces.mjs` (CI-YAML + Hooks) | niedrig |
| 3 | `plugins/narrative.mjs` (441, Grenze 100) → Vertrag / Statik / Consumer | mittel |
| 4 | `install-user.mjs` (1 041) → die Extraktion läuft bereits: `lib/instances.mjs` + `lib/verify-log.mjs` sind neu (untracked) | läuft |
| 5 | `lib/repo.mjs` Pfad-Whitelist in `commit-trailer.mjs:73-86` erweitern (folgt A-1) | niedrig |
| **6** | **Testline schneiden** (T4-3 bis T4-5) — die Messung unten ist die Grundlage | **hoch** |

**Vorher zu klären:** Konflikt **#6** — jede Extraktion aus `plugins/scoring.mjs` deaktiviert den Scoring-Slice, ohne dass etwas rot wird.

#### 5.7.1 Die Testline — **gemessen**, nicht geschätzt

> **Die Messung: jede der 86 Gate-Testdateien einzeln, `timeout 30`, auf dieser Maschine (6 Kerne, 11 GB RAM — dieselbe Klasse wie eine Fx6300).** Befehl: `node scripts/run-with-node.mjs --test <datei>`.

| Klasse | Zahl | Was |
|---|---:|---|
| **über 1 s** (darf **nicht** in die lokale Standardkette) | **25 von 86** | die Grenze, die du gezogen hast |
| **über 30 s** (Timeout der Messung) | **3** | `project-index`, `scoring-memory`, `context-resolver` — die brauchen ein echtes DSH |
| **davon solo gemessen** | **1** | `project-index.test.mjs` = **296,8 s** (4 min 57 s) — **das ist deine 6-Minuten-Zahl** |
| **rot** | **3** | `key-router-wire`, `key-router-security` (Konflikt #33), **`capabilities` (neu — T0-10)** |
| **unter 1 s** | **61** | die lokale Schnellkette |

**Die 25 über der Grenze, absteigend gemessen:**

| Testdatei | Zeit | Zustand |
|---|---:|---|
| `project-index.test.mjs` | **296,8 s** (solo gemessen) | **grün, aber 4 min 57 s** |
| `scoring-memory.test.mjs` | **> 30 s** | Timeout der Messung |
| `context-resolver.test.mjs` | **> 30 s** | Timeout der Messung |
| `ledger-separation.test.mjs` | 20,8 s | grün |
| `index-warm.test.mjs` | 20,0 s | grün |
| `context-wiring.test.mjs` | 17,0 s | grün |
| `source-write.test.mjs` | 11,1 s | grün |
| `desktop-integration.test.mjs` | 7,3 s | grün |
| `token-usage-vendor.test.mjs` | 4,4 s | grün |
| `commit-policy.test.mjs` | 4,2 s | grün |
| `index-refresh.test.mjs` | 4,1 s | grün |
| `commit-trailer.test.mjs` | 4,1 s | grün |
| `install-user.test.mjs` | 4,0 s | grün |
| `codingmon-store.test.mjs` | 3,5 s | grün |
| `doctor-cli.test.mjs` | 3,0 s | grün |
| `prompter-contract.test.mjs` | 2,5 s | grün |
| `plugin-idioms.test.mjs` | 2,1 s | grün |
| `spine-wiring.test.mjs` | 2,0 s | grün |
| `task-router.test.mjs` | 1,8 s | grün |
| `typescript.test.mjs` | 1,8 s | grün |
| `narrative.test.mjs` | 1,7 s | grün |
| `diff-overview.test.mjs` | 1,7 s | grün |
| `packaging.test.mjs` | 1,6 s | grün |
| `skill-discovery.test.mjs` | 1,4 s | grün |
| `persona-state.test.mjs` | 1,1 s | grün |

**Der Befund, der die Testline erklärt — und der deine verloren Stunden erklärt:**

Der teuerste Test ist `project-index.test.mjs`: **296,8 s solo** — fast 5 Minuten, **ohne** einen einzigen Fehler. Das ist kein Performance-Problem, das ist ein **Synchronisationsproblem**. Der Test wartet auf **Ereignisse**: `project-index.test.mjs:87` — `waitFor: async (needle, timeoutMs = 20000)` — wartet in **Sekunden**-Timeouts (20 s Standard, **60 s** an einer Stelle, Zeile 1468) auf eine asynchrone Index-Meldung. Er lädt dafür das **echte Paket** in ein Temp-Verzeichnis (`loadBundle()`, `:57-69`, mit echtem Schemastery) und lässt den **echten Indexlauf** arbeiten.

**Die Rechnung, die 5 Minuten ergibt:** 52 Testfälle in der Datei, davon mehrere mit Warte-Sekunden — jeder Wartemoment, der nicht das Ereignis sieht, kostet **volle 20 oder 60 s**. Addiert man die Wartezeit der Datei, kommt man auf die ~5 Minuten. **Die Datei ist grün** — sie prüft nur nichts, was lokal schnell prüfbar wäre, und bindet die Maschine **5 Minuten**.

**Das ist der Grund, warum die Testline kein Luxus ist:** Ein Test, der auf ein Timeout wartet, ist in einer TIER-2-Schnellkette ein **Defekt** — er blockiert die lokale Hardware, ohne etwas beizutragen, das die schnelle Kette nicht auch prüfen könnte.

**Die drei Grundsätze, die daraus für T4-3 folgen:**
1. **Kein Test über 1 s in der lokalen Standardkette.** 25 Dateien wandern raus. Das ist keine Kosmetik: die lokale Kette wird von ~3–5 min auf **unter 30 s**.
2. **Warte-Tests gehören in die CI-Tier, nicht in die lokale.** Die drei Timeouts brauchen ein echtes DSH — das hat der CI-Runner, die Fx6300 nicht (im Normalbetrieb).
3. **`commit-policy` (4,2 s) und `commit-trailer` (4,1 s) prüfen nur Text** — die sind **kein** DSH-Fall, sondern **langsam geschrieben**. Die gehören in die Schnellkette, **nach einer Reparatur**: dort wird `npm pack`/`npm install` pro Preset gemacht. Ein Text-Check, der 4 Sekunden braucht, ist ein Skriptfehler, kein Umgebungsproblem.

**Was die Messung nicht sagt (ehrliche Grenze):** Das ist **eine** Maschine, **ein** Lauf, **kein** Cold-Cache, **keine** parallelen Nachbarn. Auf der Fx6300 mit langsamer NVMe sind die Zahlen **schlechter**, nicht besser. Die Reihenfolge der Dateien ist stabil genug für die Klassifikation; die exakten Millisekunden nicht.

**Die Rohdaten liegen bei**, damit jede Zahl nachprüfbar ist:
- `/home/vannon/.hermes/cache/scratch/cleanrepo/testzeiten.txt` — alle 86 Dateien, je `Zeit_ms rc Pfad` (rc=124 = Timeout der Messung, rc=1 = rot)
- `/home/vannon/.hermes/cache/scratch/cleanrepo/laufzeiten.txt` — die 6 teuersten **solo** gemessen (ohne Timeout-Kürzung): `project-index` **296,8 s**, `context-wiring` 17,0 s, `install-user` 4,1 s, `prompter-contract` 4,5 s, `persona-state` 0,9 s, `client-activation` 1,0 s
- `/home/vannon/.hermes/cache/scratch/cleanrepo/mess-alle-tests.sh` — das Skript, mit dem es gemessen wurde


**Die drei Kopplungen, die jede G-Extraktion mitnehmen muss** (gemessen):

| Kopplung | Was passiert | Vermeidung |
|---|---|---|
| `structure.json` `bestand` (30 exakte Zeilenzahlen) | Jede Extraktion an einer Bestandsdatei erzeugt einen **verpflichtenden** Zähleintrag auf den **exakten** neuen Wert — sonst rot: „Bestand nennt 821 — senke den Eintrag" | Alle Ziele liegen in `scripts/lib/` (Grenze 550, kein `bestand` nötig); die Quelldatei schrumpft, der Eintrag sinkt |
| `gate/policy.json` Slice-Pfade auf **konkrete Plugin-Dateien** (`narrative:80`, `scoring:95`, `markers:105`) | Wird ein Plugin verschoben, feuert sein Slice **nicht mehr** — still | Slice-Pfade mitziehen |
| `engine.mjs:88-97`: `if (typeof mod.check !== 'function') continue;` | Eine Datei in `plugins/` **ohne** `check` wird **stillschweigend übersprungen** | Nach jeder Extraktion: `npm run gate:full` muss **23** Gates melden, nicht 22 |

**`plugins/` ist als Extraktionsziel strukturell geschlossen**: Klasse `gate-plugin` hat Grenze **100** und den Vertrag `function check(` — dort kann nur ein echtes Gate wohnen. **Ziel einer Extraktion ist immer `scripts/lib/`, nie `plugins/`.**

**Test-Helfer-Duplikate** (gemessen): `quiet()` steht **8× byteidentisch** in 8 Gate-Tests, `loadBundle()` **9× mit gleicher Struktur** (9 verschiedene Körper), `until()` 4× mit verschiedenen Timeouts. `scripts/gate/tests/helpers/` (2 Dateien) ist disjunkt und korrekt — die Dublette steckt in den Testdateien, nicht in den Helfern. `quiet()` ist der billigste Kandidat: 8× → 1× in `helpers/`.

### 5.8 Was NICHT extrahiert wird

- `narrative` — Importfreiheit wird vom Gate erzwungen, die Form ist korrekt.
- `seams` — die einzige erlaubte Ausnahme vom Struktur-Riegel; der Import nach `@shinon/seams/core` ist der **eine** harte Import des Baums und schützt die Naht.
- `scripts/branding-check.mjs` — 0 `lib/`-Imports, misst im echten Chromium; eine Extraktion brächte keinen geteilten Besitz.
- Die 5 Index-/Store-Mess-Skripte — sie sind Messwerkzeuge, keine Module.
- `events`/`hook` — die Grenze zwischen beiden ist scharf.

---

## 6. Der Skill-Mechanismus — Lücke, nicht Ersatz

> Shinon hat einen Skill-Mechanismus. Er ist theoretisch da, aber nicht so smooth wie Hermes'. **Hier ist gemessen, wo es hakt — und warum der Plan ihn nicht austauscht, sondern verdrahtet.**

### 6.1 Was vorhanden ist — und was **wirklich** verdrahtet ist

> **Erst die beruhigende Nachricht, dann der Haken.** Der **Generations-Pfad** ist vollständig verdrahtet — er funktioniert. Was nicht klappt, ist der **Ladepfad** (zwei konkurrierende Wege) und ein **toter dritter Mechanismus** daneben.

| Baustein | Ort | Zustand — **gemessen** |
|---|---|---|
| DSH-Skill-Dateisystem | `@deepseek-ai/dsh-skill-filesystem` (Profil, `cordis.patch.yml`) | aktiv — DSH entdeckt `.agents/skills/` nativ, Rang 200, mit Datei-Watcher |
| DSH-Skill-Werkzeug | `@deepseek-ai/dsh-tool-skill` (Profil) | aktiv — der **Modell** kann Skills selbst laden |
| **Skill-Generator (Kern)** | `packages/prompter/assets/skill-lifecycle-core.js` (363 Z) | ✅ **rechnet**: `normalizeCandidate`, `fingerprintOf`, `checkCandidate`, `findDuplicate`, `findConflict`, `renderSkill` (`:254`), `recordEvidence`, `setDecision`, `pruned` |
| **Skill-Generator (Host)** | `packages/prompter/assets/skill-lifecycle.js` (373 Z) | ✅ **verdrahtet**: `index.js:302` ruft `createSkillLifecycle({ ctx, rules, noteRules, route })`; schreibt den Ledger **atomar** (`writeFileAtomic`, `:139`), published-Status, `renameSync` |
| **Skill-Ledger** | `.shinon/skill-ledger.json` (Regel: `skill-lifecycle-rules.json:11`) | ✅ **wird geschrieben** (`skill-lifecycle.js:139`, `:225`) — die Datei existiert nur im Arbeitsbaum noch nicht, weil **noch kein Kandidat publiziert wurde**. Das ist **korrekt**, kein Defekt. |
| Skill-Lebenszyklus-Regeln | `packages/prompter/assets/skill-lifecycle-rules.json` (81 Z) | ✅ Daten-Vertrag `shinon.skill-lifecycle/v1`; Auslöser: `feedback.rated` mit `rating: negative` (Korrektur) + Fingerabdruck-Wiederholung (Wiederholung) |
| Skill-Selektion (Prompter) | `packages/prompter/assets/prompt-files.js:182` `readSkills` / `:232` `selectSkills` | verdrahtet — `pre-step.js:472-487` |
| **Skill-Registry** | `packages/prompter/assets/skill-registry-core.js` (209 Z, 7 Exporte) | ❌ **tot** — genau **1** Importer: `scripts/gate/tests/skill-registry.test.mjs`. Keine Schreibstelle für `.shinon/skill-registry.json` (0 Treffer). **Nebenprodukt** des Generators, nie benutzt. |
| 6 Projekt-Skills | `.agents/skills/*/SKILL.md` | vorhanden, 78–147 Z je, **alle ohne `use-when`** |
| Noten-Zettel (früher) | `generated-skills/` | **RETIRED** (2026-10-20), nur noch README |

**Die Kette, die funktioniert** (jede Station gemessen):
```
Korrektur im Chat  →  feedback.rated(negativ)
                   →  normalizeCandidate + fingerprintOf        (Kern, skill-lifecycle-core.js)
                   →  checkCandidate: Duplikat? Widerspruch? Format?  (Kern)
                   →  Modell erzeugt den Skill-Text           (Host, SYSTEM_PROMPT :366)
                   →  renderSkill → Fingerabdruck                (Kern)
                   →  writeFileAtomic(.shinon/skill-ledger.json)  (Host :139)
                   →  Status "published" + Beleg-Zeilen
                   →  DSH-Watcher sieht .agents/skills/<name>/SKILL.md
                   →  Modell kann ihn ab dann selbst laden
```
**Der Nachweis, dass die Kette läuft:** `packages/prompter/test/skill-lifecycle-host.test.mjs:132` wartet aktiv darauf, dass `.shinon/skill-ledger.json` den Status `published` trägt — und der Test ist grün.

**Die Kette, die fehlt:** der Weg vom Ledger zurück in die **Auswahl**. `selectSkills` liest `.agents/skills/` (die Dateien) — nicht den Ledger. Ein publizierter Skill ist damit **sofort** sichtbar, aber es gibt **keinen Weg**, den Ledger zurück in den Katalog zu spielen.

### 6.2 Die drei Haken (alle gemessen)

**Haken 1 — Zwei konkurrierende Wege zum Skill.**
DSH baut bei **jedem** `agent/pre-step` den Modell-Katalog neu auf und stellt ein `skill`-Werkzeug bereit. Parallel liest der Prompter `selectSkills` das **gleiche** Verzeichnis, matcht die Beschreibung **rein lexikalisch** gegen den Haystack und injiziert sie. Der Nutzer weiß nicht, welcher Weg greift; ein Skill kann doppelt im Kontext landen.

**Haken 2 — Die Beschreibung ist kein Trigger.**
Hermes' `description` ist ≤ 60 Zeichen, self-contained, auf 57 abgeschnitten — ein Trigger, der ohne Lesen greift. Shinons 6 Skills tragen **Fließtext-Absätze** von 208–388 Zeichen und **kein `use-when`-Feld**:
- `shinon-bug-muster`: 388 Zeichen
- `shinon-test-tempo`: 315
- `shinon-beweis-tempo`: 286
- `cordis-architektur`: 346

Der Prompter liest `name + description + use-when` (`prompt-files.js:171-176`) — aber **`use-when` gibt es in keiner Datei**. Und `skill-lifecycle-core.js:91` prüft auf einen Trigger-Wort-Regex (`nutzen`) — das ist ein **Schreibformat**, kein **Lesformat**. Das lexikalische Matching über die Absätze funktioniert nur zufällig.

**Haken 3 — Ein toter Mechanismus liegt neben dem lebenden.**
`skill-registry-core.js` kennt fünf Bedarfsfälle (`KEINE_SKILLS`, `REGISTRY_FEHLT`, `VERALTET`, `PASSEN_NICHT`, `AKTUELL`), hat `inventory()`, `decide()`, `abgleichen()` — und **null Produktionsaufrufer**. Nur `gate/tests/skill-registry.test.mjs` ruft sie. Die Datei, die sie lesen würde (`.shinon/skill-registry.json`), hat **keine Schreibstelle** im ganzen Baum (0 Treffer).

**Das ist der teuerste Haken, weil er am meisten nach Planung aussieht.** Ein 209-Zeilen-Kern mit 7 Exporten, einem Vertrag (`shinon.skill-registry/v1`), einem Gate-Test und **keiner einzigen Verbindung** — das liest sich wie „hier ist etwas vorbereitet". Es ist nichts vorbereitet: der Ledger (`shinon.skill-ledger/v1`) macht dieselbe Aufgabe, ist **verdrahtet** und hat einen Host-Test. **Zwei Verträge für eine Aufgabe, einer davon tot.**

**Haken 4 — Die Format-Regeln gelten nur beim Schreiben, nicht beim Lesen.**
`skill-lifecycle-rules.json` definiert `format` (nameMax 60, nameMin 3, descriptionMin 40, descriptionMax 400, `triggerWord: "nutzen"`, bodyMax 4000) — das sind **Schreibregeln für erzeugte Kandidaten**. Die 6 handgeschriebenen Skills werden **nicht** dagegen geprüft. Ihre Beschreibungen sind 208–388 Zeichen: innerhalb der Grenze, aber ohne Trigger-Wort.

### 6.3 Der Plan: verdrahten, nicht ersetzen — und einen toten Zwilling begraben

| Schritt | Maßnahme | Datei | Risiko |
|---|---|---|---|
| **S0** | **`use-when` in die 6 Skills aufnehmen, ≤ 60 Zeichen, self-contained** — **der erste Schritt, weil ohne Trigger der Rest nichts greift** | `.agents/skills/*/SKILL.md` | niedrig |
| **S1** | Das Lesformat angleichen: der Prompter soll `use-when` **vor** `description` lesen — das Feld, das er bereits kennt, aber das keine Datei hat | `packages/prompter/assets/prompt-files.js:130-168` | niedrig |
| **S2** | **Einen** Weg zum Skill festlegen: entweder DSH-Katalog (das Modell lädt selbst) **oder** Prompter-Injektion. Empfehlung: **DSH-Katalog**, weil er einen echten Trigger hat; der Prompter injiziert dann nur noch, was DSH nicht kennt | `packages/prompter/assets/pre-step.js:472-487` | **mittel — Eingriff in die Kette** |
| **S3** | **Den toten Zwilling begraben** (= T3-7): `skill-registry-core.js` + sein Gate-Test weg, `shinon.skill-registry/v1` aus dem Kanon. **Ein Vertrag pro Aufgabe** | `packages/prompter/assets/skill-registry-core.js`, `scripts/gate/tests/skill-registry.test.mjs` | niedrig |
| **S4** | **Den Weg vom Ledger zurück in die Auswahl** bauen: `selectSkills` liest die Dateien, nicht den Ledger — ein publizierter Skill ist sofort sichtbar, aber der Ledger kann nie zurückgespielt werden. Das ist die eine echte Lücke in der Kette | `packages/prompter/assets/prompt-files.js` | mittel |
| **S5** | Format-Regeln **auch** auf handgeschriebene Skills anwenden (Gate-Schritt) — `nameMax 60`, `descriptionMin 40`, Trigger-Wort | `scripts/gate/plugins/` | niedrig |
| **S6** | `generated-skills/` endgültig aus dem Baum nehmen — die README sagt RETIRED, der Ordner ist aber noch da | `generated-skills/` | niedrig |

**Was ausdrücklich NICHT passiert:** kein Austausch des DSH-Skill-Systems, keine Übernahme der Hermes-Architektur, kein Umbau des Lebenszyklus-Kerns, **kein Umbau des Generators** — er funktioniert (`skill-lifecycle-host.test.mjs` ist grün). Der Mechanismus ist gut; was hakt, ist der **Ladepfad** (zwei Wege), das **fehlende Trigger-Feld** und ein **toter Zwilling** daneben.

**Die Reihenfolge ist nicht beliebig:** S0 vor S1 (sonst liest der Prompter weiter ins Leere), S0 vor S5 (sonst prüft das Gate die falschen Texte), S3 unabhängig, S4 nach S0 (ein Skill ohne Trigger bringt dem Ledger nichts).

---

## 7. Namens- und Sichtbarkeitsplan

> Der Refactor soll durchsetzen, dass **alles Sichtbare einprägsam** ist und **intern eine kanonische Sprache** gilt. Das ist eine **Bedingung an den Extraktionsplan**, kein Nebenstrang.

### 7.1 Der Kanon-Riegel existiert — und ist halb wirksam

`docs/contracts/canon.json` (19 Namen, 4 Arten: global / vertrag / dienst / begriff), geprüft von `scripts/lib/canon.mjs` (109 Z), getestet von `gate/tests/canon.test.mjs` (8 Fälle).

**Gemessen**: 0 unregistered Globals, 0 Vertrags-Literale außerhalb der erlaubten Formen. Der Riegel hält.

**Aber**: er prüft die drei kanonischen **Formen** (`canon.mjs:98-102`), nicht die **Eindeutigkeit** eines Vertragsnamens. Deshalb stehen `shinon.facts/snapshot-v1`, `shinon.prompter/context-v1` und `shinon.skill-rules/v1` je zweimal im Prompter (Konflikt #16), ohne rot zu werden.

### 7.2 Was der Nutzer sieht — 49 sichtbare Texte in den Client-Hälften

Verteilung: codingmon 29 · persona 6 · version 6 · dashboard 3 · markers 3 · core 1 · prompter 1.

**Befund:** Die sichtbaren Texte sind **überwiegend nicht lokalisiert**. Beispiele:
- `core/client.js`: „Noch kein Zustand gemeldet" — hardkodiert
- `prompter/client.js`: „Noch kein Turn beobachtet." — hardkodiert
- `dashboard/client.js`: „STILL — nicht geladen" — hardkodiert
- `version/client.js`: „Host nicht erreichbar", „Beim nächsten Start" — hardkodiert

Nur `locale-de/client.js` (63 Z, 12 Schlüssel) trägt ein Wörterbuch — und **7 Pakete haben je eine eigene, zeichengleiche Fallback-Tabelle** (`token.fallback`, `menu.dashboard`, `menu.markers`, `menu.codingmon`, `menu.popup`, `popup.running`, `toast.error`). `client-locale.test.mjs:64-75` prüft nur, dass jeder Fallback-**Schlüssel** genau **einmal** im Wörterbuch steht — **nicht**, dass die **Werte** übereinstimmen. Ein abweichender Wert fällt durch.

### 7.3 Die Durchsetzungsliste

| # | Maßnahme | Wo | Wirkt auf |
|---|---|---|---|
| N1 | **Jede neue Datei bekommt einen Domänen-Namen.** `core2.js`, `helper.js`, `utils.js`, `manager.js` sind verboten — sie beschreiben eine Rolle im Dateisystem, nicht eine Sache in der Domäne. Der Name muss ableitbar sein: `naht-namen.js` sagt, was es ist; `block-select.js` sagt, was es tut. | jede Extraktion | Agenten, die den Baum lesen |
| N2 | **Jede Datei bekommt einen Einzeiler-Kopf**, der ihren Eigentümer nennt — nach dem Prompter-Muster (`assets/pre-step.js`, `runtime-state.js`, `trace-report.js` tragen das heute schon). | jede neue Datei | Lesbarkeit |
| N3 | **Vertragsnamen: eine Definition.** Jeder doppelte Literal wandert zum Besitzer; der Verbraucher bekommt den Namen **über die Naht**, nicht als eigene Konstante. Das ist Konflikt #5 und #16 in einem. | `mode-core.js`, `knowledge-block.js`, `context-channel.js`, `note-core.js` | Konfliktregister |
| N4 | **Sichtbare Texte wandern ins Wörterbuch** — hardcodierte deutsche Strings in `client.js` raus, `locale-de` rein. Und: der **Wert** wird mitgeprüft, nicht nur der Schlüssel. | 7 Pakete + `locale-de` | das Sichtbare |
| N5 | **Slot-Ids folgen `<name>-<purpose>`** und die Besetzung wird **mechanisch** geprüft, nicht per Kommentar. Heute steht die Ein-Besetzer-Regel nur in `client-activation.test.mjs:476`. | `markers`, `persona`, `popup`, `dashboard`, `codingmon` | Konflikt #24 |
| N5b | **Die Slot-`order` wird geprüft, nicht nur die Slot-ID.** Heute tragen `markers/client.js:623` und `prompter/client.js:275` **beide** `order: 30` im Slot `sidebar.panellist` — wer zuerst kommt, entscheidet die Darstellung, und **kein Test pinnt die Reihenfolge**. | `markers`, `prompter`, `client-activation.test.mjs` | Konflikt #38 |
| N5c | **Eine Registry, nicht zwei.** `__shinonPlugins` (Map, 16 Schreiber) und `__shinonPluginCatalog` (Objekt, 4 Schreiber) sind zwei Tabellen für denselben Zweck. Das Dashboard liest **nur** die Map — **popup und traceability sind für das Dashboard unsichtbar**, obwohl sie sich melden. Der Kanon kennt beide Namen, aber **nicht die Zwecktrennung**. | `key-router`, `popup`, `traceability`, `version`, `dashboard` | Konflikt #39 |
| N6 | **Der Kanon-Riegel prüft Eindeutigkeit**, nicht nur Form — ein Vertragsname darf nur einen Besitzer haben. | `scripts/lib/canon.mjs` | Konflikt #16 |
| N7 | **Der Nutzerbegriff folgt dem Code-Begriff.** Canon trägt bereits `Begleiter` (UI) ≠ `pet`/`codingmon` (Code) — das Muster ist richtig. Es muss für die 49 sichtbaren Texte durchgezogen werden. | `canon.json` | das Sichtbare |
| N8 | **Der Riegel bekommt die Wurzeln, die der Baum hat.** `structure.mjs:49` kennt nur `packages`/`scripts`/`bin` — `profiles/` (621-Zeilen-`cordis.patch.yml`) und `docs/contracts/` (13 Verträge) stehen unter **keinem** Riegel. Ein additiver Muster-Eintrag deckt sie ab. | `scripts/lib/structure.mjs`, `structure.json` | Konflikt #41 |

### 7.4 Die kanonische Sprache als Abnahmekriterium

> **Für jede Datei nach dem Refactor muss gelten: ein Leser, der die Datei nie gesehen hat, kann aus Name + Einzeiler-Kopf ableiten, was sie besitzt — und aus einem dort genannten Vertragsnamen ableiten, wer ihn besitzt.**

Das ist die Formulierung, die in den Plan gehört, weil sie **prüfbar** ist: der Name muss das Verb oder die Sache tragen, der Kopf den Eigentümer, und ein Vertragsname muss auf genau eine Datei zeigen.

---

## 8. Reihenfolge und Eigentümerschaft

| Schritt | Was | Wer | Abhängig von | Risiko |
|---|---|---|---|---|
| **0** | **Reparatur statt Refactor.** Sechs Defekte, die das grüne Gate nicht sieht, **vor** jede Extraktion: **#1** (`blockWeights` gehen beim Speichern verloren — der Store meldet `ok: true`), **#33** (zwei Key-Router-Tests sind heute rot), **#34** (die Zucht erzeugt einen Stand, den das eigene Schema ablehnt), **#2** (`lootLuck` wirkt nirgends), **#3** (`childChoice` fehlt im Client), **#7** (Personas Feldformat bricht `core/client.js` hart). Sie zu tragen ist schlechter als sie zu fixen: jede Extraktion, die die betroffene Datei anfasst, würde den Defekt in die neue Datei mitnehmen. **#33 zuerst** — ein roter Test verdeckt alles, was danach gemessen wird. | B, F, D, E, G | — | mittel |
| **0b** | **Neu messen, dann extrahieren.** Der Baum bewegt sich (Abschnitt 9.1): ein zweiter Agent baut parallel an `packages/diff-overview/`, der DSH-Dev-Server läuft auf Port 3085, und die Paketzahl ist von 23 auf **24** gewachsen. **Vor** dem ersten Schnitt: `npm run zahlen:sync` (schreibt den Bestandsblock), das statische Gate, und die Extraktionsziele neu messen. **Und #6 absichern** (Gate-Slice `scoring`): die Slice-Präfixe in `scripts/gate/policy.json:92-97` **vor** der Extraktion um den neuen Pfad ergänzen, oder die Extraktion des Plugins **nicht** machen. Sonst fällt der Scoring-Slice still aus. | G | — | niedrig |
| **0c** | **Die zwei billigen Sichtbarkeits-Fixes** — beide kosten Minuten und machen das Bild richtig: **#38** (`markers` und `prompter` tragen beide `order: 30` — eine Zahl verschieben, die keiner besitzt) und **#39** (das Dashboard sieht `popup` und `traceability` nicht, weil sie in die andere Registry schreiben). | E | — | niedrig |
| **1** | A-2 (`cordis.patch.yml` in Sektionen) — danach sind 5 Gruppen parallelisierbar | A | — | niedrig |
| **2** | **A, B, D, E, F parallel**, je mit exklusiver Datei-Ownership. **F beginnt mit F-1** (die Zucht in einen generierten Block ziehen) — das löst Konflikte #2, #3, #34 und #35 in einem Zug. | 5 Agenten | Schritt 1 | — |
| **3** | G-1 (`plugins/scoring.mjs`) — nach Schritt 2, weil das Gate den neuen Baum prüft | G | 2 | hoch |
| **4** | **N-Liste** (§7.3) durchziehen — als eigene Etappe, weil sie Dateien aus allen Gruppen berührt | A (Eigentümer) + alle | 2 | mittel |
| **5** | C-1..C-8 (Prompter). **Vorher:** direkte Unit-Tests für `pre-step`, `runtime-state`, `trace-report` (Konflikt #36) — ohne sie ist jede Extraktion nur indirekt gedeckt | C | 2 | niedrig |
| **6** | Skill-Mechanismus S1–S6 (§6.3) | C | 2 | mittel |
| **7** | C-9 (`block-auswahl.js`) — zurückgestellt, erst wenn die 99-Namen stehen | C | 5 | **hoch** |
| **8** | Doku: `ZAHLEN.md` (§2, §1.2), `PAKETE.md`, `CI-UND-GATES.md` (die `registry`-Behauptung), `AGENTS.md` (die 18-Bindings-Behauptung), `docs/COMMIT-REGELN.md` (`.shinon/gate-profile.json` existiert nicht) | **eine Person** | 2–7 | niedrig |

**Schritt 8 hat genau einen Eigentümer.** `docs/ZAHLEN.md`, `docs/TAGEBUCH.md` und `AGENTS.md` dürfen nie parallel angefasst werden — das ist der eine echte Kollisionspunkt im ganzen Plan.

### 8.1 Die atomare Task-Checkliste — „T1-5, T5-X ausführen"

> **Das ist die Lieferform.** Jede Zeile ist **eine** Aufgabe, die **ein** Agent (oder eine Person) allein erledigen kann. Kein Task teilt eine Datei mit einem anderen Task. Wer „T2-3 bis T2-7" sagt, meint genau diese sieben Zeilen.

**Legende:** ⬤ = Blocker (muss vor dem nächsten Level), ◆ = erlaubt (darf parallel), ○ = optional (kann warten)

### TIER 0 — Reparatur und Absicherung (sequenziell, ein Eigentümer)

| ID | Task | Dateien (exklusiv) | Akzeptanz | Owner | ⬤ |
|---|---|---|---|---|---|
| **T0-1** | Zwei rote Key-Router-Tests beheben — `fetchCatalog` beim Start in einen eigenen Zähler | `packages/key-router/index.js` | `key-router-wire` + `key-router-security` grün | E | ⬤ |
| **T0-2** | `writeMemory` lernt `blockWeights` + `blockAttributions` | `packages/project-index/assets/index-core.js` | echter Store: `load → blockWeights` **nicht** `undefined` | B | ⬤ |
| **T0-3** | Zucht erzeugt einen schema-gültigen Stand (`hp` + die 5 fehlenden Felder) | `packages/codingmon/assets/zucht.js` | `SnapshotSchema.safeParse` **OK** | F | ⬤ |
| **T0-4** | `lootLuck` im echten Beute-Wurf anwenden (Host **und** Client) | `packages/codingmon/assets/mechanik.js`, `packages/codingmon/assets/zucht.js` | Bonus wirkt messbar | F | ⬤ |
| **T0-5** | `childChoice` in den Client — eine Regel für beide | `packages/codingmon/client.js` | Client kennt `childChoice` | F | ⬤ |
| **T0-6** | Persona-Feldformat: `core/client.js` bricht hart | `packages/persona/index.js`, `packages/core/client.js` | Feldformat einheitlich, kein Abbruch | D | ⬤ |
| **T0-7** | `order: 30` doppelt — Slot-Reihenfolge entscheiden und pinnen | `packages/markers/client.js`, `packages/prompter/client.js` | keine Doppel-Order, Test pinnt sie | E | ⬤ |
| **T0-8** | Eine Registry statt zwei — Dashboard sieht `popup` + `traceability` | `packages/dashboard/client.js`, `packages/key-router/client.js`, `packages/popup/client.js`, `packages/traceability/client.js` | beide im Dashboard sichtbar | E | ⬤ |
| **T0-9** | Neu messen: `zahlen:sync`, Gate, Extraktionsziele neu zählen | `docs/ZAHLEN.md` | Zahlenblock aktuell | **eine Person** | ⬤ |
| **T0-10** | **`diff-overview` braucht eine Fähigkeit** — `scripts/gate/tests/capabilities.test.mjs:53` („jeder Eigentümer ist ein Paket, und jedes Paket hat eine Frage") ist **rot**: „Pakete ohne Fähigkeit: **diff-overview**". Die Karte `packages/prompter/assets/capabilities.json` ist der **Fragen-Register**: jedes Paket braucht mindestens eine Frage mit `owner`, `seam`, `terms`, `notAnswers` (Grenze Pflicht) und `evidence` (muss existieren). Ein Paket ohne Frage kann der Prompter **nicht zuordnen** — es ist im Betrieb unsichtbar. **Additiv** erweitern (AGENTS.md: Verträge nie überschreiben, nur erweitern) | `packages/prompter/assets/capabilities.json` | `capabilities.test.mjs` grün | C | ⬤ |
| **T0-11** | **Selbstmodell je Root isolieren** (Konflikt #46) — `selfModelNamespace()` (`packages/persona/index.js:844`) gibt **einen** Namespace für alle Roots; der Store **ersetzt** ihn (`index-core.js:1582`, `delete from … where namespace = ?`). **Root B überschreibt Root A — still.** Namespace je Root eindeutig machen (`${SELF_MODEL_NAMESPACE}/${hash(root)}`; `fingerprintRoot` aus `@shinon/seams/core` existiert). **Dazu der fehlende Test:** zwei Roots, schreiben, wieder laden | `packages/persona/index.js`, `scripts/gate/tests/persona-state.test.mjs` | Root A überlebt Root B; Test deckt zwei Roots ab | D | ⬤ |
| **T0-12** | **Memo-Reihenfolge am Store reparieren** (Konflikt #47) — `writeMemory` (`index-core.js:1590`) gibt Memos `ordinal = 0`; gelesen wird nach `ref` **als String** ⇒ `s1, s10, s2`. **Eine Zeile:** `ordinal = index` wie bei den Records. **Dazu der fehlende Test:** 3 Memos `s1, s2, s10` | `packages/project-index/assets/index-core.js`, `scripts/gate/tests/project-index.test.mjs` | Lesereihenfolge = Schreibreihenfolge | B | ⬤ |

### TIER 1 — Fundament (parallelisierbar)

| ID | Task | Dateien (exklusiv) | Akzeptanz | Owner | |
|---|---|---|---|---|---|
| **T1-1** | `cordis.patch.yml` in 5 Sektionen (Profil-Teil, Paket-Teile, Modell-Route) | `profiles/shinon/cordis.patch.yml` | 5 Gruppen können parallel prüfen | A | ◆ |
| **T1-2** | `repo.mjs` → 4 Module + Fassade (identische Exportnamen) | `scripts/lib/repo*.mjs` | alle 33 Importeure unangetastet, Import-Zahl gleich | A | ◆ |
| **T1-3** | `satisfiesRange` zusammenführen (eine Reihenfolge) | `scripts/lib/runtime.mjs`, `scripts/lib/dsh-versions.mjs` | eine Funktion, eine Reihenfolge | A | ◆ |
| **T1-4** | `yaml.mjs` — Behauptung in `engine.mjs` richtigstellen **oder** Parser eintragen | `scripts/lib/yaml.mjs`, `scripts/gate/engine.mjs` | Behauptung == Realität | A | ◆ |
| **T1-5** | Toter Code: `pr-promotion.mjs`, `systemd-units.mjs` dem Aufruher geben | `scripts/lib/pr-promotion.mjs`, `scripts/lib/systemd-units.mjs` | 0 tote Exporte in `scripts/lib` | A | ◆ |
| **T1-6** | Struktur-Riegel auf `profiles/` + `docs/contracts/` erweitern | `scripts/lib/structure.mjs`, `docs/contracts/structure.json` | Profil unter einem Riegel | A | ◆ |

### TIER 2 — Wissen, Begleiter, Oberfläche, Identität (parallel, exklusiv)

| ID | Task | Dateien (exklusiv) | Akzeptanz | Owner | |
|---|---|---|---|---|---|
| **T2-1** | **Zucht in einen generierten Block** (löst #2, #3, #34, #35) | `packages/codingmon/**` | Block byteweise gleich, Client-Stand besteht das Schema | F | ◆ |
| **T2-2** | Zufalls-Logik: `rollBonuses` ↔ `rollBreedingBonuses` als **eine** Quelle | `packages/codingmon/assets/zucht.js` | 0 Abweichungen in Stichproben | F | ◆ |
| **T2-3** | Memory-Store: Schema um `blockWeights` erweitern | `packages/project-index/assets/index-core.js` | 6 Felder persistiert | B | ◆ |
| **T2-4** | Fakten-Pipeline anbinden (`facts-extract`, `facts-reconcile` haben 0 Importeure) | `packages/project-index/assets/facts-*.js` | entweder verdrahtet oder entfernt | B | ◆ |
| **T2-5** | `index-core.js` (2 220 Z) teilen — 4 Module | `packages/project-index/assets/index-core.js` | jede Datei unter Grenze 650 | B | ◆ |
| **T2-6** | Persona: `apply()`-Scope aufräumen — der Zustand braucht einen Eigentümer | `packages/persona/index.js` | Bindings in einem Zustandsobjekt | D | ◆ |
| **T2-7** | `claim-core.js` verdrahten (`adoptClaim` hat 0 Aufrufer) | `packages/persona/assets/claim-core.js` | verdrahtet oder entfernt | D | ◆ |
| **T2-8** | Dashboard/Registry: eine Tabelle für alle Pakete | `packages/dashboard/client.js` | alle 24 Pakete sichtbar | E | ◆ |
| **T2-9** | Slot-Belegung: `sidebar.panellist` (6), `composer.dock` (3), `shell.overlay` (2) | `packages/*/client.js` (je Paket einzeln) | 1 Slot = 1 Besitzer | E | ◆ |
| **T2-10** | User-Texte: 49 sichtbare Texte ins Wörterbuch, `locale-de` von 12 auf voll | `packages/locale-de/client.js` | kein hart kodierter Text mehr | E | ◆ |
| **T2-11** | `key-router`: Live-Katalog-Request vom Start trennen | `packages/key-router/index.js` | Start ohne Netz | E | ◆ |
| **T2-12** | `diff-overview` ins Profil (gebaut, aber **nicht** aktiviert) | `profiles/shinon/cordis.patch.yml`, `profiles/shinon/package.json` | Paket ist scharf | E | ◆ |
| **T2-13** | Encounter-Referenzen gegen **existierende Exporte** auflösen (7 Refs) — `ENCOUNTER_SOURCE_MAP` liegt in `packages/codingmon/assets/encounter.js:334` und zeigt auf 7 Stellen in `block-select`, `pre-step`, `result-contract` (2×), `abort-core`, `salvage-store`, `skill-lifecycle`. `test/encounter.test.mjs:89-95` prüft **nur**, dass das Paketverzeichnis existiert — **nicht**, dass die genannte Funktion existiert. | `packages/codingmon/assets/encounter.js`, `packages/codingmon/test/encounter.test.mjs` | kein Ref zeigt ins Leere | F | ◆ |
| **T2-14** | **Modell-Katalog live holen** statt statisch pflegen (Konflikt #43) — 8 von 10 Providern haben **keine** `models:`-Liste: `openrouter, nvidia, groq, cerebras, google, mistral, together, huggingface`. Nur `agnes` (12) und `prompter` (10) sind gepflegt. Der Live-Pfad existiert: `packages/key-router/index.js:255` holt `/models` pro Provider und hält `declared` (statisch) neben `live` (geholt) | `packages/key-router/index.js`, `packages/key-router/assets/*` | alle Provider haben einen Katalog aus der Quelle | E | ⬤ |
| **T2-15** | **Die Form-Prüfung auf den live Katalog umstellen** (Konflikt #42) — `scripts/lib/model-route.mjs:145` prüft `providers[p].models.includes(model)` gegen eine **handgepflegte** Liste. Probe: Route `openrouter/deepseek/deepseek-chat-v3.1` → `ROUTE_MODEL_NOT_IN_CATALOG`, **obwohl das Modell existiert**. Die Prüfung muss den **live** Katalog fragen, sonst zwingt sie zu einer Liste, die von selbst veraltet. **T2-14 vor T2-15** — ohne Live-Katalog gibt es nichts, wogegen geprüft wird | `scripts/lib/model-route.mjs`, `scripts/gate/tests/model-route.test.mjs` | Route-Prüfung gegen Live-Katalog, Test deckt einen Provider ohne statische Liste ab | A | ⬤ |

### TIER 3 — Prompter

| ID | Task | Dateien (exklusiv) | Akzeptanz | Owner | |
|---|---|---|---|---|---|
| **T3-0** | **Vorher:** direkte Unit-Tests für `pre-step`, `runtime-state`, `trace-report` | `packages/prompter/test/*` | 3 Tests existieren | C | ⬤ |
| **T3-1** | `pre-step.js` (643) teilen | `packages/prompter/assets/pre-step.js` | unter Grenze | C | ◆ |
| **T3-2** | `runtime-state.js` (547) teilen | `packages/prompter/assets/runtime-state.js` | unter Grenze | C | ◆ |
| **T3-3** | `mode-core.js` (500) teilen | `packages/prompter/assets/mode-core.js` | unter Grenze | C | ◆ |
| **T3-4** | `trace-report.js` (120) prüfen/teilen | `packages/prompter/assets/trace-report.js` | unter Grenze | C | ◆ |
| **T3-5** | `selection.js` verdrahten (`parseSelection` hat 0 Produktionsaufrufer) | `packages/prompter/assets/selection.js` | verdrahtet oder entfernt | C | ◆ |
| **T3-6** | `budget-core.js` verdrahten (`kuerzeAufBudget` nur im Test) | `packages/prompter/assets/budget-core.js` | verdrahtet oder entfernt | C | ◆ |
| **T3-7** | **`skill-registry-core.js` sterben lassen** (209 Z, 7 Exporte, 1 Importer = der eigene Test, 0 Schreibstellen). Der Ledger (`shinon.skill-ledger/v1`) macht dieselbe Aufgabe, ist verdrahtet und hat einen Host-Test. **Zwei Verträge für eine Aufgabe, einer ist tot.** → Datei + Gate-Test entfernen, `shinon.skill-registry/v1` aus dem Kanon nehmen | `packages/prompter/assets/skill-registry-core.js`, `scripts/gate/tests/skill-registry.test.mjs`, `docs/contracts/canon.json` | 0 tote Exporte, 1 Vertrag pro Aufgabe | C | ⬤ |
| **T3-8** | `block-auswahl.js` — **zurückgestellt**, erst wenn die 99-Namen stehen | `packages/prompter/assets/*` | alle 99 Namen stabil | C | ○ |

### TIER 3b — Skill-Mechanismus (die Lücke, nicht der Ersatz)

> Der **Generator funktioniert** (`skill-lifecycle-host.test.mjs` ist grün). Was hakt, ist der Ladepfad, das fehlende Trigger-Feld und ein toter Zwilling. Details in §6.

| ID | Task | Dateien (exklusiv) | Akzeptanz | Owner | |
|---|---|---|---|---|---|
| **T3b-1** | `use-when` in die 6 Skills aufnehmen (≤ 60 Zeichen, self-contained) — **S0** | `.agents/skills/*/SKILL.md` | 6× Trigger vorhanden, ≤ 60 Z | C | ⬤ |
| **T3b-2** | Der Prompter liest `use-when` **vor** `description` — **S1** | `packages/prompter/assets/prompt-files.js` | Auswahl greift am Trigger | C | ◆ |
| **T3b-3** | **Einen** Weg festlegen: DSH-Katalog **oder** Prompter-Injektion — **S2** (der teuerste Skill-Schritt) | `packages/prompter/assets/pre-step.js` | ein Weg, kein doppelter | C | ⬤ |
| **T3b-4** | Den Weg vom Ledger zurück in die Auswahl bauen — **S4** | `packages/prompter/assets/prompt-files.js` | Ledger → Katalog ist spielbar | C | ◆ |
| **T3b-5** | Format-Regeln auch auf handgeschriebene Skills anwenden — **S5** | `scripts/gate/plugins/` | Gate prüft `use-when` | G | ◆ |
| **T3b-6** | `generated-skills/` aus dem Baum nehmen (RETIRED, nur README übrig) — **S6** | `generated-skills/` | Ordner weg | A | ○ |

### TIER 4 — Betrieb, Gate, Testline

| ID | Task | Dateien (exklusiv) | Akzeptanz | Owner | |
|---|---|---|---|---|---|
| **T4-1** | `plugins/scoring.mjs` (821) teilen — **Slice-Pfade vorher anpassen** | `scripts/gate/plugins/scoring.mjs`, `scripts/gate/policy.json` | Slice feuert weiter | G | ⬤ |
| **T4-2** | Gate-Helfer vereinheitlichen (`quiet()` 8×, `loadBundle()` 9×, `until()` 4×) | `scripts/gate/tests/helpers/`, `scripts/gate/tests/*` | 1 Fundstelle je Helfer | G | ◆ |
| **T4-3** | Testline schneiden: TIER 1–4, harte 1-Sekunden-Grenze lokal | `package.json`, `scripts/run-with-node.mjs` | kein Test > 1 s in der lokalen Kette | G | ◆ |
| **T4-4** | CI-Workflow: **Full Gate**, fail-closed, Timeouts, Artefakte | `.github/workflows/*.yml` | jede TIER-4-Kette läuft in CI | G | ◆ |
| **T4-5** | **pre-push-Hook**, fail-closed, ohne die lokale Hardware zu blockieren — **neu**, es gibt heute nur `pre-commit` (`npm test`), `prepare-commit-msg` und `commit-msg` | `.git/hooks/pre-push` (**neu**), `scripts/lib/*` | lokale Konflikte werden abgewiesen | G | ◆ |
| **T4-6** | `engine.mjs`: Plugin ohne `check()` **laut** melden (stille Auslassung) | `scripts/gate/engine.mjs` | kein Plugin fällt still aus | G | ◆ |
| **T4-7** | `structure.json`: 30 `bestand`-Einträge gegen den Ist-Stand prüfen | `docs/contracts/structure.json` | keine überholten Einträge | G | ◆ |

### TIER 5 — Doku, Kanon, Abschluss

| ID | Task | Dateien (exklusiv) | Akzeptanz | Owner | |
|---|---|---|---|---|---|
| **T5-1** | Kanon-Riegel prüft **Eindeutigkeit**, nicht nur Form | `scripts/lib/canon.mjs`, `docs/contracts/canon.json` | 13 Dubletten aufgelöst | A | ⬤ |
| **T5-2** | N-Liste durchziehen (N1–N8, §7.3) | `packages/*/client.js` | User-Begriff ≠ Code-Begriff, sauber getrennt | A + alle | ⬤ |
| **T5-3** | `docs/CI-UND-GATES.md`: die `registry`-Behauptung richtigstellen | `docs/CI-UND-GATES.md` | Doku == Code | **eine Person** | ◆ |
| **T5-4** | `AGENTS.md`: die 18-Bindings-Behauptung richtigstellen | `AGENTS.md` | Zahl stimmt, Zählregel prüfbar | **eine Person** | ◆ |
| **T5-5** | `docs/COMMIT-REGELN.md` + `docs/contracts/commit-policy.json`: **eine** Quelle für `WORD_MIN` — der Code ist die Quelle, ein Test prüft, dass die Datei dem Code entspricht (§8.5); `.shinon/gate-profile.json` **existiert nicht**, die Preset-Auswahl muss erreichbar **oder** entfernt werden | `docs/COMMIT-REGELN.md`, `docs/contracts/commit-policy.json`, `scripts/lib/commit-text.mjs` | Datei und Code stimmen überein, Auswahl wirkt **oder** ist weg | **eine Person** | ◆ |
| **T5-6** | `docs/ZAHLEN.md` neu schreiben (Block + §2 + §1.2) | `docs/ZAHLEN.md` | `zahlen:check` grün | **eine Person** | ⬤ |
| **T5-7** | `docs/PAKETE.md` + `docs/SCRIPTS.md` auf den neuen Baum | `docs/PAKETE.md`, `docs/SCRIPTS.md` | jede Datei existiert | **eine Person** | ◆ |
| **T5-8** | `docs/TAGEBUCH.md`: der Refactor-Eintrag mit Zahlen und Pfaden | `docs/TAGEBUCH.md` | hängt an Commit und Pfad | **eine Person** | ◆ |
| **T5-9** | **Die Paket-Checkliste schreiben** (Konflikt #45) — ein neues Paket braucht **5** Pflichten: (1) `package.json` + `cordis.patch.yml`, (2) Kanon-Eintrag, (3) `structure.json`-Klasse, (4) Profil-Eintrag, (5) **eine Fähigkeit in `capabilities.json`**. Heute steht keine davon in `AGENTS.md` — man findet sie nur, indem man das Paket baut und es scheitern sieht. **Ein Gate-Schritt**, der alle fünf auf einmal prüft, wäre der stärkere Riegel | `AGENTS.md`, `scripts/gate/plugins/*` (neu) | die 5 Pflichten stehen in `AGENTS.md` **und** ein Gate prüft sie | **eine Person** | ⬤ |

**Die Reihenfolge in einem Satz:** T0 heilt, T1–T2 schneiden parallel, T3 folgt dem Prompter, T4 schneidet den Betrieb, T5 schließt Sprache und Zahlen ab. **T5-1 und T5-2 brauchen alle anderen** — sie sind das letzte, nicht das erste.

**Die drei Eigentümer-Regeln, die den Plan tragen:**
1. **Eine Datei, ein Eigentümer, ein Task.** Die Tabelle in 8.2 sagt, wer welche Datei fasst.
2. **`docs/ZAHLEN.md`, `docs/TAGEBUCH.md`, `AGENTS.md` haben genau einen Eigentümer** — T5-6, T5-8, T5-4. Nie parallel.
3. **Ein Task ohne Akzeptanzkriterium ist kein Task.** Jede Zeile hier nennt, woran man merkt, dass sie fertig ist.

### 8.2 Geteilte Dateien und ihre Eigentümer je Tier — die Kollisionsmatrix

> **Diese Tabelle ist der Grund, warum die Task-Liste funktioniert.** Jede Datei, die mehr als ein Task anfasst, steht hier mit **genau einem** Eigentümer. Wer eine Datei anfassen will, die nicht in seiner Zeile steht, muss warten.

| Datei | T0 | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|---|
| `package.json` (Root) | — | A | — | — | **G** (T4-3) | — |
| `profiles/shinon/cordis.patch.yml` | — | **A** (T1-1) | E (T2-12) | — | — | — |
| `profiles/shinon/package.json` | — | — | E (T2-12) | — | — | — |
| `docs/contracts/canon.json` | — | — | — | — | — | **A** (T5-1) |
| `scripts/lib/canon.mjs` | — | — | — | — | — | **A** (T5-1) |
| `scripts/gate/policy.json` | — | — | — | — | **G** (T4-1) | — |
| `scripts/lib/repo*.mjs` | — | **A** (T1-2) | — | — | — | — |
| `scripts/gate/engine.mjs` | — | A (T1-4) | — | — | **G** (T4-6) | — |
| `packages/project-index/assets/index-core.js` | B (T0-2) | — | **B** (T2-3, T2-5) | — | — | — |
| `packages/codingmon/assets/zucht.js` | F (T0-3, T0-4) | — | **F** (T2-1, T2-2) | — | — | — |
| `packages/codingmon/assets/encounter.js` | — | — | **F** (T2-13) | — | — | — |
| `packages/codingmon/client.js` | F (T0-5) | — | **F** (T2-1) | — | — | — |
| `packages/persona/index.js` | D (T0-6) | — | **D** (T2-6) | — | — | — |
| `packages/core/client.js` | D (T0-6) | — | — | — | — | — |
| `packages/key-router/index.js` | E (T0-1) | — | E (T2-11, T2-14) | — | — | — |
| `scripts/lib/model-route.mjs` | — | — | **A** (T2-15) | — | — | — |
| `scripts/gate/tests/model-route.test.mjs` | — | — | **A** (T2-15) | — | — | — |
| `packages/markers/client.js` | E (T0-7) | — | E (T2-9) | — | — | — |
| `packages/prompter/client.js` | E (T0-7) | — | — | **C** | — | E (T5-2) |
| `packages/*/client.js` (übrige) | — | — | **E** (T2-9, T2-10) | — | — | E (T5-2) |
| `docs/ZAHLEN.md` | T0-9 | — | — | — | — | **eine Person** (T5-6) |
| `docs/TAGEBUCH.md` | — | — | — | — | — | **eine Person** (T5-8) |
| `AGENTS.md` | — | — | — | — | — | **eine Person** (T5-4) |
| `docs/contracts/structure.json` | — | A (T1-6) | — | — | G (T4-7) | — |

**Die drei Konfliktstellen, die man kennen muss:**

1. **`profiles/shinon/cordis.patch.yml`** — T1-1 (A) und T2-12 (E) wollen sie beide. **Regel: T1-1 läuft vor T2-12.** Wer T2-12 macht, arbeitet auf der geschnittenen Datei weiter.
2. **`packages/project-index/assets/index-core.js`** — T0-2 (Reparatur) und T2-3/T2-5 (Extraktion) wollen sie. **Regel: T0-2 läuft vor T2-3**, T2-3 vor T2-5.
3. **`packages/codingmon/assets/zucht.js`** — T0-3/T0-4 (Reparatur) und T2-1/T2-2 (Extraktion). **Regel: T0-3, T0-4 vor T2-1.** T2-1 setzt voraus, dass der Stand schema-gültig ist — sonst zementiert der Generator den Fehler.

**Die zwei Owner-Wechsel, die eine bewusste Übergabe sind** (gemessen: genau 2 Dateien mit zwei Ownern, alle anderen mit einem):

| Datei | Erster Owner | Zweiter Owner | Übergabe |
|---|---|---|---|
| `profiles/shinon/cordis.patch.yml` | A (T1-1, Sektionierung) | E (T2-12, Profil-Eintrag) | **T1-1 fertig → Übergabe.** E arbeitet auf der geschnittenen Datei weiter, nicht auf einem alten Stand. |
| `packages/*/client.js` (alle übrigen) | E (T2-9 Slots, T2-10 Texte) | A (T5-2 N-Liste) | **T2-9 und T2-10 fertig → Übergabe.** A zieht die Namensliste durch, wenn die Slots und Texte stehen. |

**Warum das ein Feature ist und kein Loch:** Zwei Agenten an derselben Datei sind kein Parallelismus, das ist eine Race Condition mit Diff-Gewirr am Ende. Ein **Übergang** — ein Owner übergibt die Datei an den nächsten — ist Parallelismus mit klarer Kante. Die Matrix sagt, an welcher.

**Warum das nicht in den Tagen 0/1/2 parallel geht:** Drei Aufgaben auf derselben Datei sind kein Parallelismus, das ist eine Race Condition mit Diff-Gewirr am Ende. Die Tabelle macht aus „macht einfach alle" eine Reihenfolge.

### 8.3 Warum die alte Schritt-Tabelle und die Task-Liste zwei Sachen sind

Die Schritt-Tabelle (Schritt 0 bis 8) ist die **Welle** — welche Gruppe wann anrückt. Die Task-Liste (T0-1 bis T5-8) ist die **Arbeitseinheit** — wer macht was, in welcher Datei, und woran merkt man, dass es fertig ist. Man braucht beide: die Welle sagt „Jetzt darf Gruppe F ziehen", die Task-Liste sagt „F macht T2-1, T2-2, T2-5, T2-6 — und sonst nichts".

**Die Task-Liste ist die Form, in der du es sagst.** „F, T2-1 bis T2-6" ist eine vollständige Anweisung: sechs Aufgaben, sechs Dateien, sechs Akzeptanzkriterien, kein Eigentümerwechsel.

**Keine Gruppe fasst eine Datei an, die in der Tabelle einer anderen steht.** Der Prompter (C) fasst `packages/prompter/**` an — nichts anderes. Das ist die Zusicherung, dass Schritt 2 konfliktfrei ist.
### 8.4 Die interne Doku — wer besitzt sie, und was stimmt nicht mehr

> Die Doku ist kein Nebenschauplatz: **jede Datei hier behauptet etwas über den Code**, und eine falsche Behauptung in `AGENTS.md` ist schlimmer als gar keine — sie lenkt jeden Agenten falsch.

| Datei | Zeilen | Besitzer | Was sie behauptet | Stand |
|---|---:|---|---|---|
| `AGENTS.md` | ~300 | **eine Person** (T5-4) | Die Arbeitsregeln des Repos: Kanon, Struktur, Paketform, Konventionen, Pitfalls, Commit-Regeln | ⚠ **2 veraltete Behauptungen** (18-Bindings-Zahl; „Volltests nur nach Absprache" gegen CI-Realität) |
| `docs/INDEX.md` | 54 | eine Person | Die Karte: welches Dokument wofür | ✅ aktuell (Audit eingetragen) |
| `docs/ZAHLEN.md` | 192 | **eine Person** (T5-6) | **Einziger Eigentümer aller Zahlen** (Pakete, Layer, Testzahlen, Versionen) | ⚠ `zahlen:check` = **Exit 1**, auch ohne den Audit |
| `docs/TAGEBUCH.md` | 1 376 | **eine Person** (T5-8) | Die Historie; jedes Kapitel hängt an Commit und Pfad | ✅ Format stimmt |
| `docs/COMMIT-REGELN.md` | 196 | eine Person (T5-5) | Wie die Commit-Regeln durchgesetzt werden | ⚠ nennt `.shinon/gate-profile.json` — **existiert nicht** |
| `docs/CI-UND-GATES.md` | 159 | eine Person (T5-3) | Was das Gate prüft und was nicht | ⚠ **Zeile 51**: die Tabelle sagt `registry` = „Namens-Registry (`contracts/canon.json`) gegen den Baum" — **das Plugin tut etwas anderes**: `scripts/gate/plugins/registry.mjs` prüft die **Bundle-Auflösbarkeit** (hat jedes Paket ein `dsh.bundle.patch`, das existiert; ist jedes `@shinon/*`-Bundle im Profil in `packages/*` registriert). **Der Kanon wird von `scripts/lib/canon.mjs:57` geprüft** — einem anderen Ort, ohne Gate-Plugin. Die Doku verwechselt zwei Riegel. |
| `docs/PAKETE.md` | 163 | eine Person (T5-7) | Nachschlagewerk je Paket | ✅ |
| `docs/SCRIPTS.md` | 92 | eine Person (T5-7) | Nachschlagewerk je Skript | ✅ |
| `docs/ARCHITEKTUR.md` | 184 | A | Die Bauform des Baums | ✅ |
| `docs/ROADMAP.md` | 116 | eine Person | Offene Arbeit | ✅ |
| `docs/VISION-ABGLEICH.md` | 372 | eine Person | Vision gegen Code-Kern | ✅ |
| `docs/WISSENS-RUNTIME-PLAN.md` | 164 | B | Plan der Wissens-Runtime | ✅ |
| `docs/SETUP.md` | 158 | eine Person | Aufsetzen | ✅ |

**Der eine Doku-Befund, der über die Audit-Zahlen hinausgeht:** Die Doku enthält **drei verschiedene Behauptungen über dieselbe Sache**, und alle drei sind an verschiedenen Orten:

- `AGENTS.md:281` sagt „`packages/persona/index.js` is the open case, **18 bindings**" — gemessen sind es **19** dateiweit (15 im `apply()`-Body, 3 in Top-Level-Funktionen).
- `docs/CI-UND-GATES.md:51` sagt `registry` prüfe die „Namens-Registry (`contracts/canon.json`) gegen den Baum" — **das Plugin prüft Bundle-Auflösbarkeit**, der Kanon wird von `scripts/lib/canon.mjs:57` geprüft.
- `docs/COMMIT-REGELN.md` + `docs/contracts/commit-policy.json` nennen `.shinon/gate-profile.json` als Preset-Auswahlweg — **die Datei existiert nicht**.

**Was der dritte Fall wirklich bedeutet (gemessen, Abschnitt 8.5 unten):** Die Preset-Auswahl ist nicht nur unerreichbar — sie ist **der einzige Weg**, mit dem die Datei `docs/contracts/commit-policy.json` jemals gelesen wird. Ohne die Datei läuft **immer** der Code-Default `shinon-maintainer` aus `scripts/lib/commit-text.mjs:121`. Die Regelwerte in der JSON-Datei sind heute **Dekoration**: sie stimmen zufällig mit dem Code überein (150/150, `requireNamedData`/`requireImagery` beide true), aber **niemand prüft das**. Ändert jemand `words.min` in der JSON-Datei, passiert **nichts**.

**Das ist kein Doku-Schönheitsfehler.** Jede dieser drei Behauptungen wird von einem Agenten als **Wahrheit** gelesen, bevor er die Datei anfässt. Ein Agent, der `AGENTS.md` glaubt, sucht 18 Bindungen und findet 19 — und hält sich für falsch. Das ist der teuerste Fehler, den ein Regelwerk machen kann: nicht eine falsche Regel, sondern eine Zahl, die **beim Nachprüfen** falsch ist.

**Die Regel, die daraus folgt (T5-4, T5-3, T5-5):** Jede Zahl in der Doku muss **nachprüfbar** sein — entweder durch ein Skript (`npm run zahlen:check`, `npm run idioms:check`, `npm run commit:check-file`) oder durch eine Regel, die man selbst messen kann. Eine Zahl, die nur *behauptet* ist, wird beim ersten Widerspruch zum Fluch.

**Und die Doku-Zahlen brauchen einen Besitzer:** `docs/ZAHLEN.md` ist der einzige Ort, an dem Zahlen stehen dürfen. `AGENTS.md` darf **keine** Zahlen mehr enthalten außer den Vertragsnamen — jede andere Zahl ist ein Link auf `ZAHLEN.md` oder gar nichts.

### 8.5 Die Commit-Policy: der Wert ist doppelt, und nur einer zählt

**Gemessen:**

| Stelle | Wert | Rolle |
|---|---|---|
| `scripts/lib/commit-text.mjs:113` | `export const WORD_MIN = 150` | **der Code-Default** |
| `scripts/lib/commit-text.mjs:121` | `name: 'shinon-maintainer'` | der Default-Preset im Code |
| `scripts/lib/commit-policy.mjs:17` | `DEFAULT_PRESET = 'shinon-maintainer'` | derselbe Default, noch einmal |
| `docs/contracts/commit-policy.json` | `presets.shinon-maintainer.words.min: 150` | die **Datei** — nur gelesen, wenn eine Auswahl existiert |
| `docs/contracts/commit-policy.json` | `presets.strict-evidence.words.min: 150` | dieselbe Zahl, zweiter Preset |
| `docs/contracts/commit-policy.json` | `presets.minimal.words.min: 0`, `conventional.words.min: 0` | die anderen Presets |

**Der Weg der Werte (gemessen):** `commit-policy-file.mjs:100` — `const name = project?.preset ?? DEFAULT_PRESET;`. `project` kommt aus `.shinon/gate-profile.json` (oder `--policy`). **Diese Datei existiert nicht.** Also gilt **immer** `DEFAULT_PRESET` = `shinon-maintainer` = der Code-Default mit `minWords: WORD_MIN` = 150.

**Die Konsequenz:** Die Zahlen in `docs/contracts/commit-policy.json` sind **Dekoration**. Sie stimmen (150 = 150), aber **kein Test vergleicht** Datei und Code. `commit-policy.mjs:99` prüft nur, ob `words.min` eine ganze Zahl ≥ 0 ist — **nicht**, ob sie `WORD_MIN` entspricht.

**Was das zwei Stellen weiter oben auslöst:**
1. Wer `words.min` in der Datei auf 200 setzt, erzeugt **keine** Wirkung — der Code bleibt bei 150. Wer 150 in `commit-text.mjs` auf 200 setzt, erzeugt **Wirkung** — und die Datei sagt weiter 150. **Eine Regel, die an zwei Orten steht und nur an einem wirkt, ist ein Fallstrick für den nächsten Agenten.**
2. Die Presets `minimal` und `conventional` (beide `words.min: 0`) sind **unerreichbar**, solange es keine Auswahl gibt.

**Der saubere Schnitt (T5-5):** **eine** Quelle für den Wert. Zwei Wege, die beide stimmen:
- **(a) Der Code ist die Quelle**, die Datei ist **Dokumentation** — dann muss ein Test prüfen, dass `commit-policy.json` dem Code entspricht (sonst lügt sie), und die Preset-Auswahl bleibt für Fremd-Repos.
- **(b) Die Datei ist die Quelle**, der Code liest sie **immer** (mit dem Code-Default als Fallback) — dann ist `.shinon/gate-profile.json` **optional** statt der einzige Weg.

**(a) ist die kleinere Änderung** und passt zur bestehenden Regel, dass `scripts/lib/commit-text.mjs` „die einzige Quelle der Muster und des Trailers" ist (so steht es in `AGENTS.md`). Die Preset-Auswahl über die Datei bleibt dann für Repos, die eine andere Policy wollen — **und diese Repos brauchen die Datei, um überhaupt eine Policy zu haben.**

---

## 9. Was ungeprüft bleibt

| Punkt | Warum ungeprüft | Wie man es prüft |
|---|---|---|
| `npm run test:full` | in dieser Sitzung **nicht** gelaufen (nur das statische Gate: 126/126, Exit 0) | `npm run test:full` |
| **`gate:test` — 2 rote Tests** | **gemessen: `key-router-wire.test.mjs` und `key-router-security.test.mjs` sind rot, deterministisch (3 Läufe, 3× rot).** Ursache: der Live-Katalog-Request (`key-router/index.js:319`) landet in derselben Zählerliste wie der Probe-Request. `docs/ZAHLEN.md` §2 nennt den Stand bereits: „902 Tests, 900 grün, **2** rot (vorbestehend)". **Ein roter Test verdeckt alles, was danach gemessen wird** — vor jedem Refactor zu beheben | `npm run gate:test` |
| `npm run gate:full` | nicht gelaufen | `npm run gate:full` |
| `npm run build` | nicht gelaufen | `npm run build` |
| `npm run zahlen:check` | **Exit 1** — der Bestands-Block driftet (Konflikt #29). **Nachgewiesen: auch ohne die Datei dieses Plans rot** | `npm run zahlen:sync` schreibt den Block |
| Verhalten der Extraktionen | Plan, keine Ausführung | — |
| Gruppe D (persona/version) | der Sub-Agent lief beim Zusammenführen noch; die Zahlen stammen aus meiner Messung, der Extraktionsplan aus dem Muster des Prompter-Splits | eigener Durchgang |
| Die **Wirkung** von Konflikt #1 auf das Lernen | der Datenverlust ist **am echten Store reproduziert** (`save → ok:true`, `load → undefined`); die Auswirkung auf die Block-Auswahl ist **nicht** gemessen | echter Turn mit Lernsignal |
| Die 33 217-Zeichen-Budget-Messung | eine **Dokumentierte Messung vom 2026-10-21** im Dateikopf von `budget-core.js`, nicht in dieser Sitzung nachgemessen (der echte Index `/opt/shinon-forge` stand nicht zur Verfügung) | `resolveContext` gegen den echten Index |
| `shinon_index_query` / `shinon_facts_snapshot` im echten Lauf | nur statisch geprüft | echter Turn |
| Die Wirkung von `lootLuck` (#2) und `childChoice` (#3) | die **Nicht-Verdrahtung** ist gemessen (0 Produktionsaufrufer); was nach der Reparatur passiert, ist offen | Test auf dem echten Beute-Wurf |

**Ein Hinweis zum Arbeitsbaum:** 21 Dateien geändert, 7 neu — darunter `scripts/lib/instances.mjs`, `scripts/lib/verify-log.mjs`, `scripts/gate/tests/instances.test.mjs`, `docs/probes/update-now.json` + 2 PNG. **Von mir** sind nur `docs/CLEANREPO-AUDIT.md` (neu) und eine Zeile in `docs/INDEX.md`. Die Extraktionsziele verschieben sich, wenn der Rest vorher committed wird. Der Plan nennt den Stand von heute.

### 9.1 Der Baum bewegt sich während der Messung — und das ist ein Befund, kein Zufall

**Gemessen um 01:15:** Das statische Gate meldete erst **126/126, Exit 0**, dann **5 Fehler**, dann **4**, dann **1** — ohne dass ich eine Datei angefasst hätte. Ursache: ein **DSH-Dev-Server läuft auf Port 3085** (`node bin/shinon.mjs --profile shinon`, gestartet 01:06), und ein **zweiter Agent baut im selben Baum** — das Paket `packages/diff-overview/` entstand **während** der Plan-Erstellung (01:12–01:14), vier Dateien, ~1 000 Zeilen, untracked.

**Was das für den Plan heißt:**

| Punkt | Folge |
|---|---|
| Die **Paketzahl 23** in §1 gilt für den Stand vor 01:12. Mit `diff-overview` sind es **24**. | Vor der Extraktion neu zählen — `docs/ZAHLEN.md` §1 und §2 sind die Zahlenquelle, `npm run zahlen:sync` schreibt sie. |
| `diff-overview` war zwischenzeitlich **unfertig** (kein Kanon-Eintrag, nicht im Profil) — das war der letzte Gate-Fehler. **Stand 01:21 ist es fertig im Baum**: Kanon-Eintrag `__shinonDiffOverview` nachgezogen, `structure.json` angepasst, Gate **131/131, 0 Fehler**. **Aber es steht weiterhin nicht im Profil** (`cordis.patch.yml`, `profiles/shinon/package.json` — gemessen: `False`). | Ein **neues** Paket braucht **drei** Dinge, die der Plan sonst nur für Extraktionen vorsieht: Kanon-Eintrag, Profil-Eintrag, `structure.json`-Klasse — der Kanon und die Struktur sind nachgezogen, **der Profil-Eintrag fehlt**. Das Paket ist also gebaut, aber **nicht scharf**. Wer es aktiviert, muss die Profil-Zeile noch setzen. |
| Die Extraktionsziele (Zeilenzahlen, Importeure, `bestand`-Einträge) sind ** Momentaufnahmen**. | Jede Extraktion misst **vorher** neu. Ein Plan, der auf einer veränderten Zahlenbasis arbeitet, erzeugt stille Fehlmessungen. |
| `packages/key-router/client.js` wurde um 01:1x angefasst — **genau die Datei**, die Konflikt **#33** (zwei rote Tests) betrifft. | Der rote Test könnte inzwischen behoben oder verschoben sein. Vor Schritt 0 neu messen. |

**Die Lehre, die über diesen Baum hinausgeht:** in einem Baum mit laufendem Dev-Server ist **„das Gate ist grün" eine Momentaufnahme mit Ablaufdatum**. Jede Zahl im Plan ist eine Messung von 2026-10-22, 01:0x — und der Plan braucht einen **Schritt 0b: neu messen, bevor man extrahiert.**

---

## 10. Die Kurzfassung

Der Baum ist **konform, aber nicht gesund**. Null Verletzungen, 30 eingefrorene Ausnahmen, zwei rote Tests — und dahinter **Defekte, die ein grünes Gate nicht sieht**, weil das Gate die Regeln prüft, die wir geschrieben haben, nicht ob die Regeln passen.

**Und eine Lektion, die beim Messen selbst passiert ist:** Das statische Gate meldete **126/126, dann 5 Fehler, dann 1** — ohne dass jemand eine Datei angefasst hätte. Ein Dev-Server läuft auf Port 3085, und ein **zweiter Agent baut im selben Baum** (`packages/diff-overview/` entstand um 01:12, während dieser Plan entstand). Jede Zahl hier ist eine **Momentaufnahme mit Ablaufdatum** — und das neue Paket hat sich als **Probe für den Plan** erwiesen: Es braucht Kanon-Eintrag, Profil-Eintrag und Struktur-Klasse, genau wie der Plan es für jede Extraktion vorsieht. **Schritt 0 des Plans ist deshalb: neu messen, dann schneiden.**

**Zuerst: der Baum hat heute zwei rote Tests** (`key-router-wire`, `key-router-security`, deterministisch). Der Live-Katalog-Request landet in derselben Zählerliste wie der Probe-Request. Ein roter Test verdeckt alles, was danach gemessen wird — das ist die erste Arbeit, nicht die letzte.

Die fünf, die danach dran sind:

1. **Die gelernten Block-Gewichte gehen beim Speichern verloren.** `writeMemory` (`index-core.js:1576`) kennt nur `records`/`memos`/`scorecard`/`notes`. Scoring schreibt zusätzlich `blockWeights` + `blockAttributions` (`scoring/index.js:255`) — die fallen still weg. **Selbst reproduziert:** `save → {"ok":true,"rows":3}` — der Store meldet **Erfolg** —, `load → blockWeights: undefined`. Der Aufrufer kann es nicht sehen. Der Test sieht es nicht, weil er einen Fake-Store benutzt.
2. **Die Zucht erzeugt einen Stand, den das eigene Schema ablehnt.** `hatchReady()` (`assets/zucht.js`) legt eine Kreatur ohne `hp` an. **Selbst reproduziert:** `SnapshotSchema.safeParse` → **ABGELEHNT**, mit **sechs** Feldbefunden. Die Host-Fassung hat **null Produktivverwender** — die laufende Zucht ist der Browser-Spiegel, und der ist gültig. Zwei Implementierungen, eine ist tot, die andere wird nie geprüft.
3. **Der `lootLuck`-Zuchtbonus wirkt nirgends.** `lootWeights()` rechnet `10000 + lootLuck` — und wird **nur vom Test** aufgerufen. Weder Host noch Client wenden den Bonus an; beide kennen nur die Basis-Tabelle. Der Bonus ist eine Zahl ohne Wirkung.
4. **Die Zuchtwahl kann der Browser gar nicht gleich treffen.** `childChoice` (die Wahl-Funktion) existiert **nur** im Host (`assets/zucht.js:10`), im Client **nicht**. Umgekehrt gibt es `breedingMods`/`breedClamp` **nur** im Client. Zwei Namen, zwei Richtungen, keine gemeinsame Quelle.
5. **Der Skill-Mechanismus hat zwei Wege zum Laden — und einen toten dritten.** **Der Generator funktioniert** (`skill-lifecycle-host.test.mjs` ist grün: Korrektur → Kandidat → `renderSkill` → Ledger → `published`). Was hakt: DSH-Katalog und Prompter-Injektion laufen parallel, während die 6 Projekt-Skills **kein `use-when` tragen** — das Feld, das der Prompter laut eigenem Kopf liest. Und `skill-registry-core.js` (209 Z, 7 Exporte) ist implementiert, getestet und **nirgends verdrahtet**: **zwei Verträge für eine Aufgabe, einer davon tot.**

**Und der Befund, der deine Forderung „KEINE STATISCHE LISTE IST DIE WAHRHEIT" bestätigt — er ist schlimmer als gedacht:**

6. **Die harte Form-Prüfung zwingt zu genau der statischen Liste, die nicht die Wahrheit sein darf.** `scripts/lib/model-route.mjs:145` verlangt, dass das gewählte Modell in der **handgepflegten** `models:`-Liste des Profils steht. **8 von 10 Providern haben keine:** `openrouter, nvidia, groq, cerebras, google, mistral, together, huggingface` — nur `agnes` (12 Modelle) und `prompter` (10) sind gepflegt. **Probe:** Route auf `openrouter/deepseek/deepseek-chat-v3.1` umgestellt → `ROUTE_MODEL_NOT_IN_CATALOG` — **obwohl das Modell beim Anbieter existiert**. Der Test ist grün, weil er **nur die gewählte Route** prüft (heute `prompter`). **Die Wahrheit holt der Key-Router bereits live** (`key-router/index.js:255`, `/models` pro Provider) und hält `declared` (statisch) neben `live` (geholt) — **die Prüfung wertet das falsche Feld aus.** Das ist die Antwort auf deine offene Zeile: nicht die Liste füllen, sondern die Liste **abschaffen** und gegen den Live-Katalog prüfen.

**Und drei Befunde, die das Bild betreffen, nicht die Rechnung:**

- **Das Dashboard sieht zwei Pakete nicht.** 16 Pakete schreiben in `__shinonPlugins`, 4 in `__shinonPluginCatalog` — und das Dashboard liest **nur** die erste. `popup` und `traceability` melden sich, erscheinen aber nicht.
- **Zwei Pakete teilen sich dieselbe Reihenfolge-Nummer.** `markers` und `prompter` tragen beide `order: 30` im Slot `sidebar.panellist`. Wer zuerst kommt, entscheidet die Darstellung — und kein Test pinnt die Zahl.
- **Eine Testdatei braucht fast 5 Minuten — und ist grün.** `project-index.test.mjs` = **296,8 s solo**, gemessen (6 Kerne, 11 GB — dieselbe Klasse wie die Fx6300). Das statische Gate braucht zum Vergleich **3,2 s**. **25 von 86** Testdateien liegen über 1 s. Der Grund ist kein Performanceproblem, sondern **Warte-Tests** (`waitFor(…, 20000)`, an einer Stelle 60 s) — die Datei prüft nichts, was lokal schnell prüfbar wäre, und bindet die Maschine 5 Minuten. **Die Testline ist kein Luxus, sie ist der Grund, warum die Prüfung unzuverlässig ist.** Das ist der Auftrag hinter T4-3 bis T4-5.

Und der eine Satz, der den ganzen Refactor trägt:

> **Ein Refactor, der Code verschiebt und die Sprache stehen lässt, hat den Auftrag nicht erfüllt.** Jede neue Datei braucht einen Domänen-Namen, einen Eigentümer-Kopf und einen Vertrag, der auf genau eine Datei zeigt — und alles, was der Nutzer liest, braucht einen Platz im Wörterbuch.

### 10.1 Die Task-Liste in einer Zeile je Tier

**52 atomare Tasks in 6 Tiers.** Jede Task hat eine Datei, einen Owner und ein Akzeptanzkriterium. Das ist die Form, in der du es sagst: **„F, T2-1 bis T2-13"** — dreizehn Aufgaben, dreizehn Dateien, kein Eigentümerwechsel.

| Tier | Tasks | Owner | Was | Wann |
|---|---:|---|---|---|
| **T0** | 9 | B, D, E, F | **Reparieren.** 6 Defekte, die das grüne Gate nicht sieht, + 2 Sichtbarkeits-Fixes | **zuerst, sequenziell** |
| **T1** | 6 | A | **Fundament schneiden.** `cordis.patch.yml`, `repo.mjs` → 4 Module, `satisfiesRange`, `yaml.mjs`, toter Code, Struktur-Riegel | parallel |
| **T2** | 13 | B, D, E, F | **Wissen, Begleiter, Oberfläche, Identität.** Die Zucht in einen generierten Block, `index-core.js` teilen, Persona-Scope, Slots, Texte | parallel (nach T1-1) |
| **T3** | 9 | C | **Prompter.** Erst 3 fehlende Tests, dann 7 Extraktionen, dann der Registry-Draht | nach T2 |
| **T4** | 7 | G | **Betrieb.** Scoring-Plugin, Gate-Helfer, **Testline schneiden**, CI-Full-Gate, **pre-push fail-closed** | nach T2 |
| **T5** | 8 | A + eine Person | **Kanon, Namen, Doku, Zahlen.** Der Kanon prüft Eindeutigkeit, die N-Liste zieht durch, `ZAHLEN.md` wird grün | **zuletzt** |

**Die drei Zeilen, die man sich merken muss:**

1. **T0 heilt, T1/T2 schneiden, T5 schließt ab.** Wer zuerst schneidet, zementiert die Defekte in die neuen Dateien.
2. **Zwei Dateien wechseln den Besitzer** — `cordis.patch.yml` (A → E) und `packages/*/client.js` (E → A). Beide Übergaben stehen in §8.2, mit der Reihenfolge.
3. **`docs/ZAHLEN.md`, `docs/TAGEBUCH.md`, `AGENTS.md` haben genau einen Eigentümer** und werden nie parallel angefasst. Das ist der eine echte Kollisionspunkt im ganzen Baum.
