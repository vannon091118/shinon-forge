# Dev-Tagebuch — was passiert ist, nicht was geplant war

> **Status:** current — erzählte Timeline des Repos, jede Aussage an einen Commit-Bereich und an einen Pfad gebunden, der heute noch steht. **Stand:** 2026-10-20
> **Einstieg:** `AGENTS.md`

Dieses Dokument ersetzt die verstreuten Akten: Changelogs, Audits, Analysen, Messreihen. Es
ist **keine Liste**. Es erzählt in Tageskapiteln, was wir wollten, was uns dabei passiert
ist, und was davon heute noch im Baum steht. Der Beleg ist jeweils ein SHA-Bereich aus
`git log` und ein Pfad, den man aufschlagen kann.

Zwei Regeln für dieses Dokument:

1. **Kein Eintrag ohne Pfad.** „Erledigt" ohne Datei, Check oder Probe ist eine Behauptung
   und gehört in den Abschnitt *Was die Akten falsch behaupten*.
2. **Nichts wird geglättet.** Wo ein Beleg nicht mehr einzeln nachweisbar ist, steht
   `nicht mehr einzeln belegbar` daneben — das ist ehrlicher als eine erfundene Zeile.

Der Prüfschritt `diaryIssues()` (`scripts/lib/diary.mjs`) liest dieses Dokument bei jedem
statischen Gate und jedem Build: ein Kapitel ohne echten Anker, ein Anker mit falschem
Datum, ein toter Pfad oder eine fehlende Tagesreihe sind rot. Das Tagebuch kann deshalb
nicht verrotten, ohne dass die Kette stehen bleibt.

---

## Warum überhaupt

Die Kurzidee steht in [`IDEA.md`](../IDEA.md); der Roh-Export, aus dem sie gezogen
wurde, ist mit dem Schnitt vom 2026-10-20 entfallen (`git show 6fbe41d:docs/archive/IDEA-raw-export.md`). Sie ist in einem Satz
erzählt: DSH liefert Harness, Laufzeit und Oberfläche — Shinon legt die verbindlichen
Schichten darum, in denen Fähigkeiten explizit aktiviert werden, Datenflüsse prüfbare
Verträge tragen und Aussagen über den eigenen Zustand an beobachtbare Evidenz gebunden
bleiben. Drei Sätze aus dem Roh-Export sind seither nicht weich geworden: **Beleg vor
Behauptung**, **Grenzen vor Aktion**, **eine Quelle und prüfbare Nähte**.

Was daraus praktisch wurde, war eine Entscheidung gegen den bequemen Weg: kein neuer
Modellkern, kein Fork der Oberfläche, sondern ein Profil, das DSH-Bundles aktiviert, und
Gates, die jede Zusage an eine Datei binden. Der Preis war von Anfang an sichtbar — ein
Repo, dessen Werkzeug und Dokumentation zusammen mehr Zeilen haben als das Produkt.

**Anker:** `ffbf721..e1640c6` · Tag: 38 Commits · Belege: `IDEA.md`, `README.md`, `package.json`

---

## 2026-10-07 — Verträge vor Verhalten

Der erste Tag war kein Produkttag, sondern ein Ordnungstag. `ffbf721` legte das
Grundgerüst: bootfähig, Brand-Overlay, Gate-Engine, Verträge. Danach entstanden die
Schichten in der Reihenfolge, in der man sie prüfen kann — Persona im System-Prompt
(`d9b10f9`), Events (`6fbe41d`), Markers (`76cad57`), Commit-Wächter (`44a4d14`) — und
erst dann der Prompter in neun Phasen: Hook als echter DSH-Hook (`6432bb3`), One-Shot mit
Host-Validierung (`c56f031`), MIN/MID/MAX als Vertrag statt Prosa (`24b10ac`), ein
einziger Eingang (`8ee8ddd`), dann der Project Index in vier Stufen (`849fa4f` bis
`9464c2d`) und zum Schluss die Zusagen des Plans als Tests (`b0e52c9` bis `e1640c6`).

Die Überraschung des Tages war keine technische, sondern eine über uns selbst: die Phasen
ließen sich bauen, weil der Plan sie **vorher** als Vertrag formuliert hatte. Was fehlte,
war die Gegenprobe — wie oft eine Zusage nur im Kopf des Schreibers existierte, zeigte
sich erst am 2026-10-08.

Heute stehen dafür `packages/hook/index.js`, `packages/prompter/index.js`,
`packages/project-index/index.js` und `packages/markers/index.js`.

**Anker:** `ffbf721..e1640c6` · Tag: 38 Commits · Belege: `packages/hook/index.js`, `packages/prompter/index.js`, `packages/markers/index.js`

---

## 2026-10-08 — Der Plan hielt nicht, und das war nützlich

§13, §14 und §15 des Plans mussten **am selben Tag** repariert werden: die Formen griffen
nicht vollständig (`c03d309`), Rang 3 der Kontextsuche fehlte in der Praxis (`ab901ab`),
und die Markierung des Projektkontexts war vom Inhalt selbst aufhebbar (`b9bde82`). Dazu
kamen zwei Befunde, die die Richtung änderten: der Event-Spine trug **erfundene**
Carrier-Aliase (`2264cf9`), und die echten DSH-Carrier-Namen plus eine benannte
Ignorier-Liste kamen erst danach (`d9e62a0`). Ab hier galt: eine Naht wird gegen die
echte Laufzeit geprüft, nicht gegen die Vorstellung davon.

Nebenbei entstanden Dashboard-Sichtbarkeit (`b7937d3`), der Codemon-Aufstieg in drei
Schritten (`5206468`, `4d0811f`, `3a7a5d8`) und die ersten Refactor-Slices mit Tabellen
statt If-Leitern (`fe1dfdc`).

Heute: `packages/events/index.js`, `packages/dashboard/client.js`,
`packages/codingmon/assets/mechanik.js`.

**Anker:** `c03d309..fe1dfdc` · Tag: 25 Commits · Belege: `packages/events/index.js`, `packages/dashboard/client.js`, `packages/codingmon/assets/mechanik.js`

---

## 2026-10-09 — Aus Recherche wurden Skills, nicht Code

Sieben Commits, kein Produktcode im Kern. Eine Recherche zum Goal-Prompt-Toast wurde zu
zwei Skills (`a3dac26`, `41bbf77`), eine Cordis-Recherche zu einem dritten (`2ba2b0d`),
dazu drei Tempo-Skills (`b87cfb7`). Die eine technische Zusage des Tages: die
Carrier-Nutzlast liegt unter `data`, und der Port **steht nicht fest** (`096b587`) — der
erste Satz einer Regel, die später als DSH-Pin zurückkam.

Die Lehre war unangenehm: wir hatten an einem Tag mehr Wissen aufgeschrieben als
gebaut. Ein Teil davon wurde später zu `AGENTS.md`, ein Teil zu
`.agents/skills/`, und ein Teil war nach zwei Wochen nicht mehr einzeln belegbar.

Heute: `.agents/skills/`, `packages/events/index.js`.

**Anker:** `4a887ed..41bbf77` · Tag: 7 Commits · Belege: `packages/events/index.js`, `packages/seams/assets/seams.js`

---

## 2026-10-10 — Ein Baum, der bootete, ohne zu stimmen

Der Tag begann mit einer Reparatur: Profil-YAML, Schemastery-Ketten, Persona-Asset, drei
Pakete nicht eingecheckt (`abf4f2a`). Danach fiel der nächste stille Fehler — `@shinon/core`
besetzte einen Single-Slot des Vendors, der Workspace-Picker war tot (`af086b0`). Zwei
Reload-Helfer ohne Aufrufer flogen raus (`8aad05e`), ein `bin/shinon.mjs`-Stub ebenfalls
(`1b203ba`), die DSH-Auflösung bekam **eine** Wahrheit (`d19f843`).

Der lehrreichste Commit war `fe97825`: `gate:test` war rot, und der Fix war **kein**
Test-Fix, sondern ein vervollständigter Lock-Baum. Ein rotes Gate, das man durch
Teständerung grün macht, ist ein kaputtes Messgerät. `45619c6` zog dieselbe Lehre für
`dsh-update` nach: offline heißt `UNGEPRÜFT`, nicht „keine Updates".

Heute: `scripts/dsh-update.mjs`, `scripts/gate/tests/`, `package-lock.json`.

**Anker:** `abf4f2a..91c7e4f` · Tag: 12 Commits · Belege: `scripts/dsh-update.mjs`, `package-lock.json`, `bin/shinon.mjs`

---

## 2026-10-11 — Der pnpm-Rückweg, gemessen statt beschlossen

Der Tag mit 35 Commits begann mit einem Ordner, der groß schrieb: `Docs/` wurde `docs/`
(`0630350`). Danach die Idiome — eine Quelle für Settings-Registrierung und
Locale-Fallback (`0d95691`, `b7399a2`), die Markers-Naht (`6e5f26d`), die Gate-Suite
(`57a5ebe`), der Herkunftsbeleg für den vendorten DSH (`37bbbcc`).

Der eigentliche Streit des Tages war pnpm. Erst wurde die Invariante durchgesetzt
(`b06afbf`), dann kam der Rückbau (`e3e2576`): sechs getrackte pnpm-Dateien gelöscht,
`packageManager` entfernt, die zwei echten Aufrufe auf npm umgestellt. **Warum npm und
nicht pnpm** war keine Geschmacksfrage: die Profil-Abhängigkeiten sind `link:`-Ziele, und
ein `npm install --dry-run` mit einem einzelnen `link:`-Eintrag endet mit Exit 1
(`EUNSUPPORTEDPROTOCOL`) — gemessen außerhalb des Repos, nicht vermutet. Deshalb gibt es
seither **keinen** Auto-Install im Profil; der Profiltest sagt sichtbar, wenn die
Auflösung fehlt. Offen blieb damals die `workspace:*`-Bindung; sie ist bis heute offen.

Am selben Tag wurde der Codemon-Kampf neu gebaut (`5ae2e77`) und die Scoring-Schicht in
K0–K5 gelegt (`aa5a8d6` bis `27ebe13`).

Heute: `scripts/pack-test.mjs`, `scripts/lib/repo.mjs` (`pnpmIssues`),
`packages/scoring/index.js`, `package.json`.

**Anker:** `0630350..c32288c` · Tag: 35 Commits · Belege: `scripts/pack-test.mjs`, `scripts/lib/repo.mjs`, `packages/scoring/index.js`

---

## 2026-10-12 — Eine Regel, die zurückkam

Der Tag begann mit Skills-Dokumenten (`e94bc02`), ging über einen TypeScript-Gate, der
später zum Dauer-Skip wurde (`7ff21da`, `78c420c`), und endete mit `0.3.0` (`3add487`).
Der Commit, der hängen blieb, war `3f2a55c`: **die Wort-Regel wurde wieder eingeführt** —
150+ Wörter, ein harter Datenbeleg, ein Bildsprache-Marker. Sie war vorher schon einmal da
und zwischenzeitlich verschwunden; dass sie zurückkam, sagt mehr über den Wächter als über
die Regel.

Am selben Tag wurden Tests umbenannt, nicht abgeschwächt (`a3b3cbb`, `eb3e6ec`), und die
Skill-Selektion bekam eine Priorität für ausdrücklich genannte Skills (`cfc778f`).

Heute: `.githooks/`, `scripts/lib/commit-text.mjs`, `scripts/commit-guard.mjs`.

**Anker:** `e94bc02..3f2a55c` · Tag: 18 Commits · Belege: `scripts/lib/commit-text.mjs`, `scripts/commit-guard.mjs`, `.githooks`

---

## 2026-10-13 — Der Key-Router auf dem Draht

Der Index-Scan bekam deterministische Ordnung und benannte Ausschlüsse (`bf003a2`), der
Prompter einen eigenen Runtime-Index (`83948d5`), und dann geschah das, was vorher nur
behauptet war: `83df12d` bewies den Key-Router **auf dem Draht** — echter Request,
gewählter Schlüssel, Rotation nach 429. `92a5f66` holte den Provider-Override in die
Route nach.

`f2fb796` heilte 33 defekte Verweise auf 24 und erklärte die lebende Doku zur grünen
Wiese. `f3bf75d` setzte `0.4.0` und die kanonische Roadmap. Der Audit Phase B
(`d0d9786`) maß Umgebung, Kette und Verträge nach und legte den Befund datiert ab — der
Beginn der Gewohnheit, Messungen mit Datum zu versehen statt sie zu erinnern.

Heute: `packages/key-router/index.js`, `scripts/gate/tests/`, `docs/ROADMAP.md`.

**Anker:** `83948d5..f3bf75d` · Tag: 11 Commits · Belege: `packages/key-router/index.js`, `docs/ROADMAP.md`, `scripts/gate/policy.json`

---

## 2026-10-14 — Eine Produktlinie, die nur auf Papier begann

Neun Commits, davon sechs Dokumente: das Mobile-First-Prototyp-Projekt samt CI-Gates wurde
geplant (`09cb2eb`, `b0af4b5`, `db213c3`, `382f7b6`). Dazu kamen der Umbau-Auftrag
„XP an Completions, Trajectory als Probe, Zahlen bei einem Eigentümer" (`7cf2d08`) und die
Synchronisierung von README und `AGENTS.md` (`970eec5`).

Das Muster wiederholte sich hier zum zweiten Mal: eine ganze Linie entstand zuerst als
Dokument. Diesmal war es ehrlicher beschriftet — als Plan, nicht als Ergebnis.

Heute: `docs/ROADMAP.md`, `packages/codingmon/assets/trajectory-core.js`.

**Anker:** `9d7a924..59a86a4` · Tag: 9 Commits · Belege: `docs/ROADMAP.md`, `packages/popup/assets/trajectory-core.js`

---

## 2026-10-15 — Ein Commit, ein Profil

`34163aa` ist der einzige Commit des Tages: ein isoliertes, testbares DSH-Profil für
mobil. Kein Produktverhalten, aber ein Beweis — dass die Profil-Mechanik trägt, ohne den
Hauptbaum zu berühren.

Heute: `profiles/mobile/`, `scripts/shinon-profile-test.mjs`.

**Anker:** `34163aa` · Tag: 1 Commit · Belege: `scripts/shinon-profile-test.mjs`, `profiles/shinon/package.json`

---

## 2026-10-16 — Der Prompter zerfällt in Module

`d93a01f` zerlegte den Prompter in eigenständige Module und ließ den Einstieg nur noch
Signale an DSH reichen. Das war der Anfang der `assets/`-Kerne, die heute die
importfreien Tests in CI tragen. `cb65ed5` abonnierte den Narrative-Kanal im Prompter und
setzte `mobile` inaktiv; `059470e`/`b82674c` stellten das Standardmodell um.

Die Nebenwirkung war größer als der Anlass: mit den Modulen wurde sichtbar, welche
Entscheidungen im Prompter eigentlich **Daten** waren (Blöcke, Intents, Modi) und welche
Code.

Heute: `packages/prompter/assets/`, `packages/narrative/index.js`.

**Anker:** `a441c38..b82674c` · Tag: 5 Commits · Belege: `packages/prompter/assets/blocks.json`, `packages/narrative/index.js`, `packages/prompter/assets/intent-rules.json`

---

## 2026-10-17 — Abnahme am echten Klon (S3–S6), und der Tag, an dem der Plan ehrlich wurde

Fünfzig Commits. Zuerst die Verträge: Workspace-Identität S1 (`ad9cda7`), der Project
Index daran gebunden (`fe51f88`), ein Größenbudget mit benanntem Ausschlussgrund
(`5099353`), und die Korrektur, die eine ganze Klasse von Fehlern schloss — **Fragen
werden nicht erweitert und nicht als Auftrag etikettiert** (`ffdd9d9`, `13e4819`).

Dann die Abnahme, und sie ist der Grund, warum dieses Kapitel so lang ist:

- **S3** (`6f12159`): frischer Klon, `npm ci`, Dump, UI-Start, Gates — jeder Schritt mit
  Exit-Code. Der Klon lief, weil das Lockfile die Quelle ist.
- **S4** (`dd18824`): `shinon doctor` wurde ein echter Unterbefehl, read-only, mit
  stabilen Exit-Codes — vorher gab es nur ein statisches Gate, das wie eine Diagnose
  aussah. `7918ae5` hatte genau das vorher festgehalten: der Release-Text stellte den
  Umfang wie eine Freigabe dar, obwohl der Befehl fehlte.
- **S5** (`c30112c`, `4db4006`): Version, Tag-Stand, Lockfile, Workflow, Quellarchiv
  zweimal gebaut und byte-identisch verglichen. Der Befund war unbequem und blieb stehen:
  **`v0.4.0` fehlt bis heute** — `git tag` führt nur `v0.2.0`, `v0.3.0` und fünf
  `runtime-*`-Tags.
- **S6** (`4db4006`): Audit grün (0 Schwachstellen), Modellturn **blockiert** —
  damals fehlte jeder Schlüssel — und der verlinkte CI-Run **rot** mit offener
  Ursache (Job-Log ohne Admin-Rechte nicht lesbar, lokal derselbe Baum grün). Der
  Tag blieb deshalb verweigert. Der Satz „ohne Schlüssel kein Modellturn" war
  korrekt und ist heute überholt: `.env` liegt im Root (präsent, Modus 600, nie
  gelesen, nie ausgegeben).

Daneben: eine Schemastery-Fassung statt 114 Kopien (`944f9aa`), die Injection-Runtime mit
eigenem Selektionsvertrag (`c00c2fe`, `cb448c2`), das dauerhafte Scoring-Ledger
(`e17d62d`), das DSH-Pin-Prinzip (`bccdba6`) und die Zusammenlegung aller abgeschlossenen
Doku in ein Archiv (`87fc5fe`).

Heute: `bin/shinon.mjs`, `scripts/doctor.mjs`, `docs/probes/store-cost.json`,
`scripts/dsh-target-versions.json`, `packages/prompter/assets/selection.js`.

**Anker:** `8c9da4e..1fd90f9` · Tag: 50 Commits · Belege: `scripts/doctor.mjs`, `docs/probes/store-cost.json`, `scripts/dsh-target-versions.json`, `packages/prompter/assets/selection.js`

---

## 2026-10-18 — Aufräumen, und das erste echte No-Go

`23eee83` machte DSH `0.2.1-rc.2` zur einen Sollquelle mit einem Prüfer
(`scripts/check-dsh-versions.mjs`). `af10a0d` zeigte den Intent-Trace live im Panel.
Dann `df57983`: ein Index, kein totes Paket, ehrliche Gates — der erste Aufräumtag, an dem
Löschen als Fortschritt galt.

Der wichtigste Beschluss war eine Absage. `docs/audit/G2-NOGO-2026-10-17.md` sagt **NO-GO**
für einen Gate-DAG: die Wartezeit war nicht der Engpass (der Index-Kaltlauf war es), und
eine passende Orchestrierung existierte bereits (`c9a7556`). Ein No-Go mit Messung ist
mehr wert als drei gebaute Features — es hat den Bau von etwas verhindert, das nur
komplizierter ausgesehen hätte.

Dazu kamen die Codingmon-Zucht-Progression (PR #20, `1985b8b`) und die
Storage-Nachrüstung (`4525301`).

Heute: `scripts/check-dsh-versions.mjs`, `docs/probes/perf-baseline.json`,
`packages/codingmon/assets/`, `packages/popup/client.js`.

**Anker:** `a2a5d4d..4525301` · Tag: 17 Commits · Belege: `scripts/check-dsh-versions.mjs`, `packages/codingmon/assets/mechanik.js`, `docs/probes/perf-baseline.json`

---

## 2026-10-19 — Zwei Regeln, die sich selbst abschafften

Der Kommentar-Kanon war die aufwendigste Regel dieses Repos: 286 Kommentarblöcke wurden
aus ihrem Code gerissen und in eine 8.548-Zeilen-Datei gelegt, im Code blieb ein Zeiger.
`5274bff` löste ihn auf — 282 Zeiger in 174 Dateien wurden durch den Volltext ersetzt
(+3.377 / −359 Zeilen), Datei, Werkzeug, Gate-Plugin, Trigger und Test verschwanden mit.
Die Regel, die ersetzt wurde, war die 10-LOC-Kappung: **ein Kommentar, der woanders steht,
erklärt nichts.** Heute steht in `AGENTS.md` das Gegenteil — kein Längenlimit.

`3662593` entschärfte die Release-Automatik. Sie war wie ein Ventil, das bei jedem Druck
öffnet: das Startskript verlangte „Commit+push nach jedem Task", der Workflow hing an
`push: branches: [main]`, und jeder Push erzeugte Tag, Release und einen Commit im
Schwesterrepo — belegt durch `runtime-974e512` auf `origin/main`. Jetzt startet der
Release-Lauf nur über `workflow_dispatch`; die fünf `runtime-*`-Tags von damals stehen
noch da. Derselbe Commit band die sechs Skills und `AGENTS.md` an **eine** Quelle und
führte `docs-status` ein.

Daneben: Selbstmodell aus Laufzeitspuren (`7a04959`), Persona-Prüf-Panel (`50f95ab`),
Intent-Gedächtnis v2 (`dfef8cc`), `SALVAGED_PROSE` je Sitzung (`d5f731e`, `89ab4a7`).

Heute: `AGENTS.md`, `scripts/lib/commit-text.mjs`, `.github/workflows/release.yml`,
`packages/persona/index.js`. (Das dort eingeführte Gate `docs-status` ist am
2026-10-20 mit seinen Dokumenten gefallen — siehe *Der Schnitt*.)

**Anker:** `dfef8cc..ca6aa62` · Tag: 17 Commits · Belege: `AGENTS.md`, `.github/workflows/release.yml`, `packages/persona/index.js`, `.agents/skills/shinon-dev-workflow/SKILL.md`

---

## 2026-10-20 — Sechzehn Zwillinge werden einer, und die Wissens-Runtime bekommt einen Ort

Dieses Kapitel ist der Tag, an dem der Baum umgebaut, ausgeliefert, mit Skills versorgt
und um eine Wissens-Runtime erweitert wurde. Es steht als **ein** Tageskapitel da, weil das
Tagebuch einen Tag nicht in acht Kapitel zerlegt — die Abschnitte darunter sind Etappen
desselben Tages, nicht eigene Tage.

**Anker:** `4a1bc31..ae0991d` · Tag: die zweite Hälfte des Tages in einem Bereich · Belege: `packages/task-router/assets/goal-budget.js`, `packages/task-router/assets/intent-policy.js`, `docs/probes/h5-entscheidung.json`, `docs/contracts/structure.json`, `packages/project-index/assets/facts-core.js`, `docs/contracts/facts.json`

`d0691b2` gab dem Main-Agenten eine Fähigkeitskarte und einen Aufgabenbrief. Dann die
drei Wellen: Riegel, Matrix, Form (`09827dc`), die gemessene Abbruchquote (`5ab788e`),
der warme Index ohne Dauerbeobachter (`7c2d8b9`), die Modellroute, die dem Nutzer gehört
(`d040498`).

Der große Schnitt war `541682f`: sechs Host↔Host-Regeln standen doppelt im Baum — als
bytegleiche `zwilling:`-Region oder als Literal, zusammengehalten von `SOURCE_TWINS`. Sie
liegen jetzt **einmal** in `packages/seams/assets/seams.js` (`@shinon/seams/core`,
importfrei) und werden von `events`, `hook`, `prompter`, `project-index`, `task-router`,
`narrative`, `persona` und `scoring` importiert. Der Umbau fand dabei drei Kopien, die
**keine Regel kannte**: ein zweites `resolveWorkspaceRoot` in der Persona (andere
Semantik, gleicher Name — heißt jetzt `declaredWorkspaceRoot`), den Kanal als viertes
Literal im Task-Router und denselben Kanal noch einmal im Scoring. Genau das ist der
Unterschied zwischen einer Liste und einer Prüfung: die Liste hätte die drei nie gefunden.

Der Riegel dagegen ist `hostMirrorIssues()` — er prüft das Gegenteil einer
Zwillings-Regel, nämlich dass die Definition nirgends sonst steht. `SOURCE_TWINS` führt
heute noch **10** Regeln, alle Client-Spiegel (Stufe 2).

Am selben Tag bekam der Baum seinen **Kanon**: eine Tabelle in `AGENTS.md`, eine
Registry in `docs/contracts/canon.json` und ein Schritt `canonIssues()`, der bei jedem
statischen Gate und jedem Build prüft, dass jeder Name genau eine Definition und genau
eine Schreibweise hat. Unterwegs fielen drei echte Abweichungen auf: das Panel-Global
hieß `__shinon_plugins`, während die Registry `__shinonPlugins` hieß — zwei Rollen
(Map und Objekt-Tabelle) unter scheinbar einem Namen, jetzt `__shinonPlugins` und
`__shinonPluginCatalog`; der Router schrieb `__shinon_task_router`, jetzt
`__shinonTaskRouter`; und ein Vertrag trug `one-shot-journal/v1` statt der kanonischen
Form `<sache>-v1`. Alle drei sind reine Umbenennungen — kein Verhalten hat sich
geändert; die Gate-Suite (767 Tests, davon 8 neue für den Kanon) lief danach grün.

Heute: `packages/seams/assets/seams.js`, `packages/seams/assets/seams.json`,
`scripts/gate/tests/seams-core.test.mjs`, `scripts/lib/repo.mjs`,
`docs/contracts/canon.json`.

### Die Wellen, die danach kamen

Der Kanon und der Struktur-Riegel waren an diesem Tag noch **ungebucht** — sie
standen im Arbeitsbaum, waehrend die Doku sie schon beschrieb. Erst am Abend
wurden sie zu Commits, und das aenderte ihre Beweislage: `c0d99cf` schnitt die
Akten (73 Dateien, 10040 Zeilen) und reparierte 35 Verweise; `a2a80f4` gab dem
Tagebuch seinen Riegel (`scripts/lib/diary.mjs`) und nahm ihm damit die
Moeglichkeit, sich selbst zu glauben; `38b66cc` buchte den Kanon samt Registry
und den drei Umbenennungen; `68d7b14` setzte die Struktur-Grenzen (die Zahl der benannten
Bestandsdateien steht in `docs/ZAHLEN.md` §1.2, nicht hier); `89f6daa` loeste den ersten davon ein, indem der
Prompter-Einstieg von 1350 auf 256 Zeilen schrumpfte und Lauf, Zustand und
Ausgang eigene Module bekamen; `ca10572` zog die Zahlen nach.

Was dabei gelernt wurde, steht nicht in den Commit-Nachrichten: der Struktur-
Riegel verlangt, dass der Bestand **sinkt**, nicht dass er passt — die
Reihenfolge der Commits ist deshalb Teil der Aussage. Und der Tagebuch-Riegel
haette den Tag ohne diesen Abschnitt rot gelassen, weil er fuer jeden Tag mit
Commits ein Kapitel verlangt: die Geschichte ist hier keine Beigabe, sondern
eine der Bedingungen, unter denen der Baum ueberhaupt gruen sein darf.

Den Abschluss machte die Pruefung selbst: auf `fdb1cdd` lief `npm run gate:test`
mit Exit 0 — 780 Tests, 780 bestanden, 0 uebersprungen — und `npm test` mit Exit 0
(4 gelaufen, 19 geskippt, 0 fehlgeschlagen), beide mit frischem `XDG_STATE_HOME`
und gelesenem Exit-Status statt behauptetem. Die 767 aus dem Kanon-Abschnitt
waren der Stand von `38b66cc`; die beiden heute gebuchten Suiten legen die
Differenz dazu. Deshalb steht die Zahl hier mit ihrem Commit und nicht als
absolute Wahrheit neben sich: eine Testzahl ohne den Stand, an dem sie gemessen
wurde, ist wie ein Thermometer ohne Datum.

Der gepushte Stand war damit aber nur halb belegt: `npm run build`, `npm run
test:full`, `npm run gate:full` und `pack-test` waren auf `4529db7` nie
gelaufen. Der erste volle Durchgang machte sofort einen echten Fehler sichtbar,
und zwar einen, den kein Test behauptet hatte — die Regel-Fixtures kopieren
`scripts`, `packages`, `profiles` und `package.json`, aber nicht `docs`. Seit
dem Kanon und dem Struktur-Riegel liegen die Registries in `docs/contracts/`;
im Fixture fehlten sie, und die unveraenderte Kontrolle war rot, obwohl am Baum
nichts falsch war. Eine Kontrollgruppe ohne ihren Massstab misst nur sich
selbst. Die Ursache war die Kopierliste, nicht die Regel: `1a5b1d4` nimmt
`docs` in `SOURCES` auf, und die Fixtures stehen wieder bei neun von neun.

Derselbe Commit macht aus dem Profiltest einen Ladebeweis statt eines
Aufloesungsbeweises: ein eigener Prozess mit dem Profilverzeichnis als cwd loest
`@shinon/prompter` ueber den Profil-Link auf `packages/prompter/index.js` auf,
laedt die drei geteilten Module und danach `@shinon/seams/core` aus dem
Root-`node_modules`. Vorher wusste nur der Dump, dass die Layer existieren;
jetzt weiss es der Prozess, der sie laedt — eine Aufloesung ist wie ein
Strassenschild, das Laden ist der Weg. Die Zaehlungen aller vier Laeufe stehen
in `docs/ZAHLEN.md` §2, jeder mit Exit 0; die einzige Ausnahme bleibt die
Branding-Messung, die ohne Chromium sichtbar uebersprungen wird.

Der Tag endet mit dem Beleg, den keine Pruefung ersetzen kann: **ein echter
Modellturn** ueber das Profil `shinon`, Route `prompter/agnes-2.5-flash`, im
Modus Read Only, Frage nach Zeilenobergrenze und Klasse aus
`docs/contracts/structure.json`. Er lief durch: erster sichtbarer Text nach
2 963 ms, fertige Antwort nach 33 s, zwei Schritte, und die Antwort stimmt
(550, `core`). Die Token-, Latenz- und Indexzahlen stehen mit Route und
Zeitstempel in `docs/ZAHLEN.md` — hier steht, was sie bedeuten.

Der warme Index hat in diesem Lauf **geliefert**: `context_source=index` im
Tracesatz, 41 Dateien, 38,97 ms Median, und die zwei Dateien, die das Modell
dann selbst las (`structure.json`, `pre-step.js`), standen auf Platz eins und
zwei. Das ist die Trefferquote, die zaehlt: nicht wie viele Chunks im Kontext
liegen, sondern ob die richtigen darunter sind. Beim Boot hatte der Index 434
Dateien gelesen, eine wegen Groesse uebersprungen und drei Zugangsdateien nie
geladen — die Grenze ist benannt, nicht still.

Der Prompter hat den Prompt ersetzt (One-Shot angenommen, 4 444 ms, 11 078
Token hinein) und diesmal `intent=LOOKUP` erkannt statt `UNDEFINED` wie in
allen neun Turns des Leitstand-Laufs vom 19. — die Faehigkeitskarte hatte fuer
diese Frage allerdings keinen Treffer (`brief=KEIN_TREFFER`), weil sie die
Frage nach dem Struktur-Riegel nicht kennt. Ein Nein an der richtigen Stelle.

Die **Abbruchstrecke griff nicht**, und das ist das ehrliche Ergebnis: `abort=0/1`,
null Abbrueche in einem Turn, 4 444 von 15 000 ms verbraucht. Eine Strecke, die
nicht ausgeloest wird, ist nicht geprueft, nur bereit — der Zaehler steht im
Trace, die Bedingung trat nicht ein. Wer sie unter Last sehen will, braucht
einen zweiten Turn; dieser Pass durfte genau einen fahren.

Der **Begleiter** hat seine Abnahme: `shinon_codingmon_store` wird im echten
Cordis-Root unter `shinon.codingmon/store-v1` bereitgestellt (4 von 4 Faellen,
kein Skip), der laufende Host meldet „Spiegel aktiv — Domain codingmon_pet v1,
Empfaenger codingmon/writeSnapshot", und ueber `shinon.capabilities/v1` ist der
Dienst auffindbar: die Frage „Wo lebt der Begleiter (Pet)?" trifft
`pet-und-begleiter`, der Brief nennt Dienst und Vertrag. Was **nicht** passierte:
ein Stand ging nicht ueber die Leitung — der Browser haengt seine Remote-
Beitraege aus einer kompilierten Liste ein (`@deepseek-ai/dsh-api-remotes`), und
diese Liste kennt `codingmon` nicht. Der Dienst ist da, der Anrufer fehlt; die
Luecke steht seit dem 2026-10-19 in `AGENTS.md` und ist hier zum ersten Mal an
einem echten Lauf ablesbar. Eine Ablage ohne Anruf ist wie ein Briefkasten ohne
Einwurf — er ist vorhanden, leer und gepflegt.

Heute zusaetzlich: `scripts/lib/diary.mjs`, `scripts/lib/canon.mjs`,
`scripts/lib/structure.mjs`, `docs/contracts/structure.json`,
`packages/prompter/assets/pre-step.js`, `packages/prompter/assets/runtime-state.js`,
`packages/prompter/assets/trace-report.js`, `scripts/gate/tests/prompter-split.test.mjs`.

**Anker:** `d0691b2..1a5b1d4` · Tag: 17 Commits bis `1a5b1d4` · Belege: `packages/seams/assets/seams.js`, `packages/seams/assets/seams.json`, `scripts/gate/tests/seams-core.test.mjs`, `docs/contracts/structure.json`, `packages/prompter/assets/pre-step.js`

### Der Befund am Abend: die Vision gegen den Code-Kern

Der Tag hatte mit dem echten Turn angefangen und endete mit einer Frage, die
die vorherige Arbeit von oben sieht: **was ist der Kern des Codes heute, und wo
weicht er von der Vision ab?** Nicht als Absicht, sondern als Befund mit
Pfaden — die Vision aus dem Roh-Export (`git show ffbf721:IDEA.md`), dem
historischen Plan und dem Schichtenplan; der Ist-Stand aus dem Baum.

Das Ergebnis ist unbequem und präzise: die **Form** ist präziser als die
Vision — alle Verträge unter `docs/contracts/` tragen die sieben Punkte, die
Gate-Engine ist echt, Replay, Provenienz, Narrative, Self-Model und Gedächtnis
sind gebaut. Die **Substanz** ist eine Ebene zu dünn: es gibt kein Organ, das
fragt, ob eine Aussage wahr ist; die Haltung, die das Verhalten steuert, kommt
aus dem Scoring und die Persona liest sie nur; eine Aktivierungs-Wahrheit gibt
es nicht — der Katalogeintrag trägt den Status „beobachtet". Und zwei Kästchen
des DoD-Plans waren in keiner offenen Liste, bis sie heute Abend wieder in
`docs/ROADMAP.md` standen.

Das ist keine Kritik an der Arbeit, sondern ihre Vermessung: der Abstand
zwischen dem, was der Baum kann, und dem, was die Figur sein sollte, ist an
drei Stellen messbar — und an der vierten (der fehlenden Urteilsschicht) ist
er nur als Abwesenheit messbar. Das steht jetzt in `docs/VISION-ABGLEICH.md`,
jeder Befund mit Pfad und Zeile, jeder Abwesenheitsbefund mit dem Befehl, mit
dem man ihn nachzählen kann.

**Anker:** `d0691b2..1a5b1d4` · Tag: 17 Commits bis `1a5b1d4` · Belege: `docs/VISION-ABGLEICH.md`, `docs/ROADMAP.md`, `docs/INDEX.md`, `packages/persona/index.js`, `packages/prompter/assets/pre-step.js`

### Die Installationspakete: eine Nutzlast, zwei Huellen

Die Frage des Tages war eine Bestandsaufnahme: welche Start-, Update-,
Installations- und Deinstallationswege gibt es ueberhaupt, welche sind aktiv,
welche sind veraltet — und wie wird daraus ein Installer, der auf Windows wie
auf Mint traegt? Die Antwort fiel unangenehm aus, weil sie zwei Luecken
zeigte, die im Baum niemandem auffielen: `scripts/deb-build.mjs` baute ein
`.deb`, dessen `postinst` beim Installieren ein `npm ci` nachlud und das
`Depends: nodejs` (>= 22.19.0) verlangte — genau die Stelle, an der Mint mit
seinem aelteren Node haengen bleibt, weil der Start spaeter an `engines`
scheitert und nicht an der Installation. Fuer Windows gab es kein Artefakt,
keinen Menueeintrag, keinen Zeitplan.

Die Antwort darauf ist eine Nutzlast und zwei Huellen. Die Nutzlast
(`scripts/lib/payload.mjs`) traegt den Code, die Produktionsabhaengigkeiten aus
dem Lockfile, die **mitgelieferte Node-Laufzeit** und die Starter; die Huellen
(`scripts/lib/huelle.mjs`) tragen nur Text — Debian-`control`, `postinst`,
Menueeintrag und PATH-Starter auf der einen Seite, `install.ps1` und
`uninstall.ps1` auf der anderen. Drei Regeln fallen daraus zwangslaeufig ab:
das Paket traegt seine Laufzeit (kein `Depends: nodejs`), der `postinst`
installiert **nichts** nach (kein Netz beim Installieren), und das
Windows-Archiv wird auf einem Windows-Bauhost gebaut, weil die
Abhaengigkeiten plattformgebunden sind — auf Linux gebaut, traegt es
Linux-Binaerdateien und faellt erst auf dem fremden Rechner auf. Das Skript
verweigert diesen Bau darum ausserhalb von Windows.

Der Beleg ist ein gemessener, kein behaupteter: das Paket wurde gebaut
(122,5 MiB), entpackt, gestartet und ueber HTTP befragt. `shinon --check`
meldete „startfaehig" mit der Laufzeit aus dem Paket (v22.19.0), `shinon
doctor` endete mit 0 Befunden, der Serverstart brachte 29 Paket-Bundles auf
127.0.0.1:3099, die Oberfläche antwortete mit HTTP 200 und 44109 Bytes, und
die Client-Haelften kamen aus dem Archiv (core 67613 Bytes, codingmon 129964
Bytes). Das Bild liegt in `docs/probes/paket-deb-boot-2026-10-20.png`, der
Messbericht in `docs/probes/pakete-2026-10-20.md`.

Drei Fehler kamen beim Messen heraus, nicht beim Planen. Der erste: der
Windows-Weg kopierte in sich selbst, wenn der Benutzer das Archiv direkt in
den Zielordner entpackte — der Vergleich lief gegen das Elternverzeichnis.
Der zweite: der Form-Test im Gate baute das volle Paket mit `npm ci` und
brauchte 140 Sekunden; das hung die uebrigen (parallel laufenden) Tests aus
— sieben DSH-abhaengige Testdateien fielen dabei um, gemessen. Der dritte:
`dpkg-deb -c` lieferte 54000 Zeilen und sprengte den Standardpuffer. Alle
drei sind behoben, und die Beweise stehen in `scripts/gate/tests/
packaging.test.mjs` (9 Faelle) und `scripts/gate/tests/desktop-integration.test.mjs`.

Der vierte Befund ist der unangenehmste: waehrend dieser Arbeit hat ein
paralleler Thread den Branch gewechselt und dabei den Arbeitsbaum
verworfen — die Arbeit war nur als Stash wieder da. Sie steht jetzt in einem
eigenen Worktree (`git worktree add`), damit ein Branch-Wechsel eines
fremden Threads nicht wieder den halben Tag frisst. Als Nebenbefund: zwei
Auschecken desselben Repos teilen sich ein DSH-Home, und die Seeding-Regel
verweigert dann korrekt den fremden Link. Beides gehoert in die Hand des
Menschen, nicht in eine stille Ueberschreibung.

---

### Der Skill-Lebenszyklus: ein Weg, nicht zwei

Die Lernzettel (`generated-skills/*.json`) waren eine zweite Wahrheitsquelle neben
`.agents/skills/*/SKILL.md`. Zwei Zettel wurden in `shinon-dev-workflow` und
`shinon-bug-muster` konsolidiert, die Originale liegen unter
`docs/probes/skill-lifecycle-migration/` (Migrationsprobe `docs/probes/skill-lifecycle-migration.json`).
Die automatische Dublettenprüfung fand dabei **keine** Dublette (`BELEG_ZU_DUENN`); die Zuordnung
war eine manuelle Entscheidung und steht so in der Probe.

Neu: `packages/prompter/assets/skill-lifecycle-core.js` (reiner Kern: Prüfung, Fingerabdruck,
Konsolidierung, Rendern), `skill-lifecycle.js` (Host: Ereignisse, Puffer je Sitzung, begrenzte
Queue, One-Shot-Extraktion, atomares Schreiben nach `.agents/skills`, Ledger unter `.shinon/`),
Regeln in `skill-lifecycle-rules.json` (`shinon.skill-lifecycle/v1`). Das Config-Feld
`skillLifecycle` ist im Schema **aus** (Vorgabe `false`); das Profil `profiles/shinon` schaltet es ein.

Gemessen: `test:prompter` 228/228 Exit 0 (198 Bestand + 30 neu), `test:scoring` 50/50 Exit 0,
`gate:test` 792/795 — der `.deb`-Test bleibt rot (`dpkg-deb -c` liefert 65 508 Einträge, 9,35 MB
Listing; der Test erlaubt kein `node_modules` im Paket, der Payload enthält aber 62 005 solcher Einträge).
Das ist Packaging-Arbeit außerhalb dieses Schritts und wurde nicht angefasst.
`npm test` PASS Exit 0, Profil-Boot `shinon-profile-test` 4/4 Exit 0.

Nicht gemessen: ein echter Modellturn mit Lernauslösung und Veröffentlichung im laufenden DSH.
Der Host-Test fährt die Pfade mit einem Fake-LLM; die DSH-Entdeckung ist über den nativen
Skill-Provider gemessen (`scripts/gate/tests/skill-discovery.test.mjs`, 42 ms bis zum Katalog).

### Wissens-Runtime, Zug 1: Fakten bekommen einen eigenen Ort

Die Wissens-Runtime beginnt mit dem Vertrag, nicht mit dem Feature. `docs/contracts/facts.json`
trägt sieben Regeln in der 7-Punkt-Form: Lebenszyklus, Kennung, Quelle, Klasse,
Abhängigkeit, Speicher und Konflikt. Die Gegenprobe ist gelaufen: eine Kopie ohne
`invariant` macht das Gate `contracts` rot (`Verdict: FAIL`), danach war die Probe-Datei
wieder gelöscht.

Der Kern `packages/project-index/assets/facts-core.js` ist importfrei und hält die
Übergangstabelle: **16 erlaubte von 64 Paaren**, `SUPERSEDED` und `REJECTED` sind Enden,
und `VALID` erreicht `REJECTED` nur über `DISPUTED` — ein gültiger Fakt wird nicht still
verworfen. Ein Akteur ist Pflicht, `model` ist keiner. Die Kennung ist ein FNV-1a-Hash aus
Scope, Subjekt, Prädikat und Wert, damit dieselbe Aussage über Läufe hinweg gleich heißt.

Der Speicher liegt in einer **eigenen** Datei (`facts.sqlite`), nicht in der des Index.
Gemessen, nicht gewählt (`docs/probes/facts-store-entscheidung.json`): In der gemeinsamen
Datei überlebt die Faktzeile einen Index-Versionssprung nur, weil `facts` nicht in
`PRIMARY_TABLES` steht; die Indexzeile selbst geht verloren (1 → 0), und der Rebuild läuft
mit `vacuum` über dieselbe Datei (29,1 ms gegen 5,87 ms bei eigener Datei). Zwei
Lebenszyklen brauchen zwei Versionsleitern: `pragma user_version` für die Fakten,
`meta.schema_version` für den abgeleiteten Index.

`packages/project-index/test/facts.test.mjs` prüft 15 Fälle, darunter alle 64 Statuspaare,
alle 25 Klassenpaare, jede Zeigerform, Persistenz über einen Neustart, das Zyklenverbot und
eine echte Migration v1 → v2: der alte Fakt behält Status und Quellen, die neue Tabelle
kommt daneben. Kein Migrationsschritt enthält `drop table` oder `delete from`; eine Datei
mit neuerer Fassung wird abgelehnt statt geraten.

### Wissens-Runtime, Zug 2: Quellen bekommen Extraktoren, Fakten ein Verfallsdatum

Zug 2 trennt zwei Fragen, die vorher eine waren: **woher** ein Fakt stammt und **ob**
seine Quelle sich inhaltlich geändert hat. `packages/project-index/assets/facts-extract.js`
kennt genau drei Quellen — Vertragsdatei, Commit-Nachricht, Index-Symbole. Es gibt keinen
generischen Fallback: eine unbekannte Quelle ist `QUELLE_UNBEKANNT` und liefert nichts.
Grenzen sind laut, nicht still — ein Wert über 400 Zeichen fällt mit `WERT_ZU_LANG` heraus,
statt gekürzt zu werden, und eine Quelle über 40 Fakten meldet den Rest als
`BUDGET_ERSCHOEPFT`. Jeder erzeugte Fakt trägt Zeiger und Revision seiner Quelle und
startet als `DISCOVERED`; die Extraktion erfindet keine Herkunft.

`facts-invalidate.js` dreht die Abhängigkeitskanten um: ändert sich eine Quelle, werden
erst ihre direkten Fakten stale und dann alles, was auf ihnen steht. Ein Zyklus ist ein
Befund (`ZYKLUS`), keine Endlosschleife. Revalidierung hängt am Extraktions-Hash, nicht an
der Revision: derselbe Inhalt nach neuer Revision macht den Fakt wieder `VALID`; ein
fehlender oder abweichender Hash lässt ihn `STALE`.

Die Kaskade war zuerst langsam, und die Messung sagt warum: 208,01 ms für 200 Fakten, weil
`markStale` je Zeile eine eigene Transaktion öffnete und damit je Zeile ein fsync zahlte.
Gebündelt in einer Transaktion sind es 10,2 ms bei demselben Ergebnis — 200 von 200 Fakten
stale, 0 übersprungen (`docs/probes/facts-invalidierung.json`).

`packages/project-index/test/facts-pipeline.test.mjs` prüft 11 Fälle, darunter beide
Mutationen, auf die es ankommt: ein abweichender Hash revalidiert **nicht**, und ein
unabhängiger Fakt bleibt nach der Änderung einer fremden Quelle `VALID`.

### Wissens-Runtime, Zug 3: der Block kommt aus der Runtime, nicht aus dem Modell

Zug 3 schließt die Lücke, die den ganzen Plan trägt: geprüftes Wissen muss beim
Hauptmodell ankommen, auch wenn der One-Shot nichts davon erwähnt. `facts-snapshot.js`
kompiliert Intent, Fähigkeiten, gültige Fakten, Constraints, Revisionen und offene
Konflikte zu **einem** deterministischen Snapshot; nur `VALID` kommt hinein, alles andere
steht als Auslassung mit Grund daneben. Das Budget bricht ab (`BUDGET_UEBERSCHRITTEN` mit
Soll und Ist), statt still zu kürzen.

Der Prompter liest den Snapshot über den Dienst `shinon_facts_snapshot`
(`shinon.facts/snapshot-v1`) — er öffnet die Faktendatei nicht selbst, weil Pakete nicht
ineinandergreifen. `knowledge-block.js` rendert daraus `<project_facts>` und
`<constraints>`; `pre-step.js` hängt den Block am **Ende** der Nutzernachricht an, über
dieselbe Identitäts-Ersetzung wie den Veredler-Text. Damit gilt er in allen Ausgängen:
angenommen, abgelehnt, übersprungen, Direktpfad. Fehlt der Dienst oder wirft er, bleibt der
Prompt unverändert und der Grund steht im Entscheidungsdatensatz.

Gemessen (`docs/probes/facts-snapshot.json`): 60 Fakten kompilieren in 1,39 ms, rendern in
0,39 ms zu 4 418 Zeichen, 100 Kompilierungen in 9,45 ms. Der Handoff ist im echten
`agent/pre-step` mit Fake-LLM und Fake-Dienst in allen vier Ausgängen geprüft — der Block
steht im **finalen** `messages`-Array, nicht nur im Log.

Der Projekt-Index bietet jetzt eine **dritte** schmale Fähigkeit an; die beiden Gate-Tests,
die die Naht pinnen, sind additiv erweitert (`shinon_facts_snapshot` mit genau `contract`
und `snapshot`). Keine bestehende Naht wurde geweitet.

### Wissens-Runtime, Zug 4: Widersprüche bleiben stehen, Prüfungen werden belegt

Zug 4 führt zusammen, was zusammengehört, und lässt stehen, was sich widerspricht.
`facts-reconcile.js` gruppiert nach Scope, Subjekt und Prädikat: gleicher Wert ergibt **einen**
Eintrag mit allen Quellen, verschiedene Werte ergeben einen offenen Konflikt mit beiden
Seiten, sortiert nach Autorität aus dem Pfad — Vertrag (3) vor Code (2) vor Prosa (1). Die
Autorität kommt aus dem Ort, nicht aus der Zeit; ein Zeitstempel entscheidet hier nichts.

Dazu kommen gezielte Post-Checks: aus Auftrag und Änderungsbereich folgt eine deterministische
Liste (`paket:<name>`, `gate:contracts`, `gate:profile`, `tests:pakete`), und ihr Ergebnis
wird ein Fakt der Klasse **JUDGEMENT** mit Quellenzeiger und Zeitpunkt im Wert — eine
begrenzte Aussage über eine Prüfung, keine Wahrheit über das Projekt.

Die strenge Ergebnisprüfung ist ein **Modus**, kein neuer Default: `acceptance()` verwirft
im wissensgebundenen Weg (`strictFacts`) eine unbekannte Referenz mit
`UNRESOLVED_REFERENCE:<pfad>`; ohne Faktenblock bleibt es beim bisherigen `console.warn`.
Der Modus hängt am Snapshot, nicht an einer Einstellung: `pre-step.js` liest den Snapshot
vor dem One-Shot und schaltet ihn nur dann ein.

### Wissens-Runtime, Zug 5: ein Vorschlag wird nicht durch Wiederholung wahr

Der Claim-Lebenszyklus liegt in `packages/persona/assets/claim-core.js` und ist rein:
`proposed → accepted/rejected → superseded`, mit einer Tabelle, die den Akteur prüft.
**Nur `human` oder `review` nimmt an**; `scoring` darf Signale liefern und Vorschläge
machen, aber keine Überzeugung setzen. Ein Claim startet immer als `proposed`, ein Beleg
ist Pflicht, und gleiche Belege zählen nicht doppelt (Deckel 9).

Die Urteilsschicht spricht `ALLOW` oder `DENY` mit sortierten Gründen: ein ungelöster
Sicherheitskonflikt sperrt die **betroffene** Aktion (gleicher Scope), nicht das ganze
Projekt; ein nur vorgeschlagener Claim trägt keine Aktion (`CLAIM_NICHT_AKZEPTIERT`).
`judgementRecord` trägt Vertrag, Aktion, Urteil, Gründe und die Zahl der Claims — keinen
Claim-Text.

Die Brücke in die vorhandenen Module ist absichtlich dünn: `adoptClaim` legt einen Claim
als **Vorschlag** im bestehenden `proposals`-Feld des Gedächtnisses ab und übernimmt
`accepted` nur bei `decidedBy` human oder review — sonst bleibt es `proposed` mit dem
Grund `NICHT_ENTSCHIEDEN`. `observeJudgement` schreibt nur Kürzel wie `urteil:DENY` in die
Gründe des Selbstmodells; ein fehlendes Urteil zählt als DENY, nie als ALLOW. Damit hat die
Persona weiterhin genau eine Wahrheit, und die Scoring bleibt eine Signalquelle.

### Autonomie: die Fortsetzung bekommt eine Grenze, die Aktivierung eine Bedingung

Der Autonomie-Schritt war der letzte offene Punkt aus §17: eine automatisch aktivierte
Fortsetzung ist eine Entscheidung über **fremdes** Budget — jede Runde ist ein vollständiger
Agentenschritt mit Modellaufrufen. Bis heute ging `maxGoalRounds` aus der Config ungeprüft
an DSH: ein Profilwert von `0` oder von einer Million wäre still durchgereicht worden, und
niemand hätte am Entscheidungsdatensatz gesehen, dass die Fortsetzung nicht das tut, was
dasteht. `goalRoundsVerdict` prüft die Zahl jetzt **vor** dem `create` — keine Zahl oder
kleiner als 1 heißt `ROUNDS_UNGUELTIG`, über der Obergrenze `ROUNDS_ZU_HOCH`. Gekappt wird
nichts: ein still gekürzter Wert behauptete später eine andere Rundenzahl als die, mit der
DSH wirklich läuft. Shinons Obergrenze liegt bei 12 Runden gegen DSHs 256; die Zahl ist
eine Entscheidung im Profil, keine Konstante im Paket.

Die zweite Hälfte ist unangenehmer, weil sie nichts baut: **H5 ist nicht gemessen.**
Benchmark 4.6 aus `docs/ROADMAP.md` §2.3 verlangt Aufgaben-Set, DSH-Baseline und einen
Shinon-Messwert — keines davon existiert in diesem Baum. Also bleibt `activate: false`
stehen, und das ist die Entscheidung, nicht ihr Fehlen. `docs/probes/h5-entscheidung.json`
schreibt genau das auf, mit `verdict: NOT_MEASURED`. Damit die Zusage nicht nur im Text
steht, liest `scripts/gate/tests/task-router-h5.test.mjs` **beide** Dateien und vergleicht
sie: solange die Probe `NOT_MEASURED` sagt, darf im Profil kein `activate: true` stehen —
und umgekehrt muss ein belegtes H5 den Schalter einschalten. Die Gegenprobe ist gefahren:
mit `activate: true` im Profil wird der Test rot, danach zurückgespielt.

Nebenbei hat der Zug eine Grenze sichtbar gemacht, die vorher nur im Vertrag stand:
`packages/task-router/index.js` stand auf seinem eingefrorenen Bestand von 797 Zeilen und
wäre mit der Runden-Policy auf 833 gewachsen. Statt den Eintrag zu erhöhen, sind zwei
Eigentümer ausgezogen — `assets/goal-budget.js` (Default, Obergrenze, Prüfung) und
`assets/intent-policy.js` (§16-Vokabular und Gewichte). Beide sind importfrei; `index.js`
re-exportiert die Namen wortgleich und steht jetzt bei 770 Zeilen. Der Eintrag in
`docs/contracts/structure.json` ist auf 770 gesenkt, weil er nur sinken darf.

Belege: `npm run gate:test` **801 pass, 0 fail, 2 sichtbar geskippt, Exit 0**;
`npm test` **PASS, Exit 0**; `task-router.test.mjs` + `task-router-h5.test.mjs` **31 von
31 grün**. Grenze, benannt: es gibt weiterhin keinen Modellturn mit echtem Schlüssel, also
keine Aussage darüber, ob eine automatische Fortsetzung besser arbeitet — nur darüber,
dass sie begrenzt ist und eine bestehende Absicht nicht überschreibt.

---

## 2026-10-21 — Der Stand, der in der Ecke steht

Dieser Tag hat dem installierten Shinon beigebracht, zu sagen, was er ist. Vorher stand
nirgends, welcher Commit lief — nach einem Update, einem Rollback oder einem Handgriff
in den Klon war das eine Vermutung, und eine Vermutung, die man fuer einen Zustand
haelt, ist schlimmer als eine Luege, weil sie keiner nachfragt.

**Anker:** `dd5d319`, `a090ab7`, `bfc7001`, `2c493ed` · Belege: `packages/version/index.js`, `packages/version/client.js`, `packages/version/assets/version-probe.js`, `scripts/lib/desktop-entry.mjs`, `scripts/lib/payload.mjs`, `scripts/gate/tests/version-package.test.mjs`, `assets/icon.svg`, `assets/banner.svg`, `assets/readme-banner.svg`, `README.md`, `scripts/desktop-launcher.mjs`, `scripts/lib/huelle.mjs`, `packages/prompter/assets/capabilities.json`, `docs/probes/h5-entscheidung.json`, `packages/persona/assets/interaction-core.js`, `packages/prompter/assets/skill-lifecycle.js`, `scripts/gate/tests/spine-wiring.test.mjs`, `packages/codingmon/assets/data/codingmon-50.json`, `packages/codingmon/assets/katalog.js`, `packages/codingmon/assets/zucht.js`, `packages/codingmon/assets/migration.js`, `packages/codingmon/test/katalog.test.mjs`, `packages/codingmon/test/zucht-core.test.mjs`, `scripts/assets/build-codingmon.mjs`, `docs/contracts/structure.json`, `packages/codingmon/assets/art`, `scripts/assets/build-sprites.mjs`, `packages/codingmon/test/sprites.test.mjs`, `docs/probes/codingmon-sprites.json`

Das neue Paket `@shinon/version` hat drei Schichten, und die Trennung ist der eigentliche
Inhalt: die Messung fragt `git` und liest den Bau-Schatten, die Formel rechnet daraus
eine Zeile, einen Tooltip und einen Updatesatz — ohne Uhr und ohne Netz —, und der
Client malt das Ergebnis in die untere rechte Ecke. Der Host schiebt seinen Zustand
ueber `webserver/index-inject` als `window.__DSH_VERSION_INFO__` in die Seite; die Route
`/shinon/version` liefert denselben Zustand fuer den Klick. Der Klick startet
`scripts/install-user.mjs auto` — Kandidat bauen, dort abnehmen, erst bei gruem Urteil
umschalten. Bewusst **nicht** `update --force`: ein Update, das dem laufenden Prozess die
`node_modules` unter den Fuessen wegzieht, ist kein Update, sondern ein Ausfall mit
Ansage.

Damit die Aussage auch fuer ein installiertes Paket gilt, traegt die Nutzlast jetzt einen
Bau-Schatten: `scripts/lib/payload.mjs` schreibt `.shinon-build.json` mit Commit, Zeit
und Herkunft, und `packages/version/assets/version-probe.js` liest dieselbe Datei. Ein
Paket ohne Git-Baum kann so wenigstens sagen, aus welchem Commit es gebaut wurde. Der
Dateiname ist ein Literal auf beiden Seiten — `scripts/gate/tests/version-package.test.mjs`
vergleicht ihn, samt der Probe, dass ein gedrehter Name im Client rot wird.

Der zweite Teil des Tages betraf das Setup. Die Desktop-Eintraege hatten zwei Erzeuger
(den Entwickler-Launcher und das Nutzer-Installat) und damit zwei Regeln; jetzt gibt es
eine: `scripts/lib/desktop-entry.mjs` baut, schreibt, prueft und entfernt sie, und
`scripts/install-user.mjs` ruft sie nach der Abnahme auf. Fuer die Deinstallation war der
Weg schon da — sie entfernt den Eintrag ueber genau denselben Launcher.

Belegt: `npm test` Exit 0, statisches Gate 126/126, Verteilungs-Test 92/92,
Profiltest 4/4 mit 20 Paket-Bundles, `packages/version/test/version.test.mjs` 8/8 und
`scripts/gate/tests/version-package.test.mjs` 7/7.

Der Tag hatte noch eine zweite Baustelle, und sie kam aus dem Auftrag selbst: das
Nutzer-Installat ist ein KLON und hat `.git` — die Regel „der Entwicklerbaum hat `.git`,
ein Installat nicht" galt nur fuer das Paket unter `/opt`. Das Installat erkannte sich
damit als Entwicklerbaum, nahm dessen Home und stolperte ueber dessen Verknuepfungen;
die Abnahme blieb rot (`shinon --check Exit 2`). Der Zustand des Installats entscheidet
die Frage jetzt (`scripts/lib/paths.mjs`, `isInstallat()`), und
`scripts/gate/tests/paths.test.mjs` pinnt beide Faelle: dieser Baum registriert, dieser
nicht.

Ausserhalb des Baums war dieser Tag ein Aufräumtag: drei Altbestaende wurden geloescht
(der 70 Commits alte Klon unter `~/Projekte`, das Duplikat auf der SSD und der
Notiz-Scratch), die Draft-PRs wurden geschlossen, und uebrig bleiben `main` und der
CodingMon-Zweig.


Dieser Tag hat dem Repo sein Gesicht gegeben und dabei dem Versprechen widersprochen, das
die Doku seit dem ersten Commit trug. Das alte README war ein Statusblatt in Prosa: eine
Fassungszahl im Abzeichen, ein Quickstart, eine Pakettabelle, ein Schluss mit „Projekt
Status" — und dazwischen der Satz, ein Harness sei eine Maschine. Das war nicht falsch.
Es war nur eine Anleitung fuer jemanden, der das Repo bereits kannte. Wer zum ersten Mal
hineinlaeuft, bekam statt eines Grundes eine Inventarliste.

Der neue Text rechnet ab. Er beginnt mit den drei Forumstabs, in denen jemand erklaert,
sein Agent habe die Codebase analysiert, und endet dort, wo die Frage wirklich laeuft:
was dieses Werkzeug tut, was es ausdruecklich **nicht** tut, wie man es installiert, ohne
dass die Zeilen an den Pfaden des Nutzers scheitern, und welche sieben Fragen man hat,
bevor man die erste stellt. Die harte Abgrenzung ist der Kern: kein Refactoring im
Hintergrund, kein Ersatz fuer Tests, keine erfundenen Zahlen, keine Cloud. Ein Agent,
der ohne Schluessel laeuft, sagt `MISSING_CREDENTIAL` und nennt die aktive Route — er
wechselt nicht still auf eine andere. Zwei Sprachsektionen tragen dieselben Aussagen:
der deutsche Teil den Ton, der englische dieselben Sache nuechtern. Die Zahlen bleiben
dort, wo sie hingehoeren — `docs/ZAHLEN.md` — und das Abzeichen im README nennt keine
Fassung mehr, sondern verweist auf ihren Besitzer.

Zu der Prosa kamen drei Bilder, alle handgemacht und alle als SVG im Baum unter
`assets/`: `assets/icon.svg` (Amboss und Hammer, quadratisch — es ist ein App-Symbol, kein
Ladezettel) ersetzt das breite Banner als Menue-Icon, `assets/banner.svg` traegt die Marke
und drei Zeilen ohne Zahlen, `assets/readme-banner.svg` ist das Terminalfenster, in dem
ein Agent ehrlich Auskunft gibt. Alle drei wurden in Chromium gerendert und angesehen, in
64, 128 und 256 Pixeln; der Icon-Satz las sich erst nach einer Trennung der Geometrie
als Amboss mit Hammer statt als Klumpen.


Der Tag hatte noch eine zweite, unangenehme Seite: der Baum war an zwei Stellen rot, und
beide Stellen waren ehrlich. Der `plugin-idioms`-Test pruft, dass jede Host-Haelfte
genau einmal `settings.configure` registriert — er verglich dabei die **gesamte**
Aufrufliste und verlangte damit nebenbei, dass eine Host-Haelfte ausser der
Settings-Registrierung nichts tun darf. Der Versionsspiegel mountet aber eine Route; sein
`inject ["webServer"]` stand in der Liste und machte den Test rot. Der Test wurde nicht
geweicht, sondern praeziser: er misst jetzt die Registrierung selbst — genau ein
`inject ["settings"]`, genau ein `configure {"auto":false} fiber=ROOT_FIBER`, genau ein
Effekt — und zaehlt die Settings-Injektionen ausdruecklich. Die Paket-Haelfte haengt
sich ausserdem an `ctx.interval` (der aktuelle Name des Cordis-Timers) statt an den
abgeschwaechten Alias `ctx.setInterval`; fehlt der Timer-Dienst, uebernimmt der globale
Timer mit `unref` und eigener Aufraeumung.

Und die Fuenf Proben aus dem 2026-10-20-Zug trugen die Pflichtform des `probe-twin`-Gates
nicht: `id`, `claim`, `targets` und `expect` fehlten, `result` und `verdict` auch. Sie
bekamen diese Felder additiv, ohne dass eine Messung angefasst wurde. Die H5-Probe
verliert dabei ihr `verdict: NOT_MEASURED` — das war eine Vermischung zweier Dinge: das
Falsify_Me-Verdikt sagt, was als naechstes passiert (`RESEARCH: messen`), die Messlage
sagt, ob ueberhaupt ein Messwert vorliegt. Beide zu vermischen hiesse: eine fehlende
Messung sieht wie eine Entscheidung aus. Die Probe traegt die Messlage jetzt in
`messwert_status`, das Gate liest dort, und der Test
`scripts/gate/tests/task-router-h5.test.mjs` folgt der Messlage statt der Schalterlage.

Dasselbe gilt fuer die Faehigkeitskarte: `@shinon/version` war dort nicht genannt, und
`scripts/gate/tests/capabilities.test.mjs` verlangt, dass **jedes** Paket mindestens
einmal einen Eigentuemer hat. Der Eintrag `versionsstand-sichtbar` kam additiv dazu — mit
der Naht `__DSH_VERSION_INFO__` woertlich im Eigentuemer-Paket. Beim ersten Lauf war er
trotzdem rot: die Frage enthielt keinen ihrer eigenen Begriffe, also fand
`matchCapability` nichts und die Zuordnung blieb leer. Die Frage nennt den Begriff jetzt
im Text, und die Karte ist wieder eine Landkarte und kein Wunschzettel.

Der Abend brachte dann noch die unangenehmste Sorte Befund: drei Verdrahtungen, die
nicht kaputt waren, sondern **taub**. Keine Ausnahme, kein roter Test, keine Zeile im
Log — nur Wirkungen, die ausblieben, und ein Zustand, der sich nie bewegte. Gefunden
wurden sie nicht durch Lesen, sondern durch Fahren: die drei Pfade wurden mit den
echten Bundles, der echten `apply()`-Schnittstelle und dem echten Event-Spine
nachgestellt, und danach war die Ursache jedes Mal eine falsche Annahme ueber die Form,
in der die Welt ankommt.

Die erste: die Persona las den Text einer menschlichen Nachricht als String. DSH
schreibt `user/message` aber als Blockliste (`content: [{ type: 'text', text }]`), und
auf dem Kanal heisst das Ereignis `message.received`. Der Leser bekam also `''` —
User-Lage, Anrede und der Gedaechtnis-Beleg fielen still aus, waehrend der Abschnitt
selbst munter weiter im Prompt stand. Bezahlt hat das niemand mit einem Fehler, sondern
mit einem Prompt, der sich ruhig anfuehlte und nichts ueber den Menschen wusste. Das
Lesen liegt jetzt in `packages/persona/assets/interaction-core.js`, importfrei, und der
Host verlor dabei 25 Zeilen (1526 → 1501 im Commit `a090ab7`).

Die zweite war ein Kanal, der nicht der gemeinte war. Der Skill-Lebenszyklus haengt an
`shinon/event`, dort tragen die Ereignisse aber die normalisierten Namen (`turn.end`,
`feedback.rated`, `message.received`). Verglichen wurde mit den ROHEN (`turn/end`,
`feedback/message-put`) — auf diesem Kanal erscheinen sie nie. Der Lebenszyklus konnte
deshalb nie feuern; kein Skill entstand, und niemand vermisste ihn, weil ein
Lebenszyklus, der nicht laeuft, genauso aussieht wie einer, der nichts zu lernen fand.

Die dritte war die klassische Einbahnstrasse: `relation.updated` hatte drei Konsumenten
(Persona-Zustand, Narrative Engine, Scoring) und keinen Produzenten. Die Beziehung stand
damit fuer immer auf `known` und `fresh_pair` — eine gebaute Schicht, die nur gelesen
wurde. Die Persona bietet jetzt den Dienst `shinon_persona_relation`, den Vertrag
`shinon.persona-relation/v1` und die Route `/shinon/persona/relation` an; geprueft wird
gegen die Stufen des Zustandsvertrags, emittiert wird nur das Signal, und ohne Sitzung
bleibt die Route fail-closed (`MISSING_SESSION`). Ein Automatismus ist das ausdruecklich
nicht: die Stufe setzt ein Mensch.

Der Test, der diese drei Luecken haelt, faehrt keinen nachgebauten Kanal:
`scripts/gate/tests/spine-wiring.test.mjs` laedt die echten Bundles in ein Isolat und
schickt echte Sitzungsereignisse durch den Spine. Er prueft die Blockliste (User-Lage
„frustriert“, Anrede „wer bist du“, Gedaechtnis-Beleg), den Lebenszyklus (drei
abgeschlossene Zuege schreiben den Skill, eine negative Bewertung erzeugt nach 1,5 s
einen Korrektur-Auftrag) und die Beziehung (Route → Dienst → Signal → Persona und
Narrative, `known`/`fresh_pair` wird zu `trusted`/`established_duo`).

Belegt: `npm test` Exit 0 (statisches Gate 126/126), `npm run gate:test` 812/812,
`npm run gate:full` 23 Gates gruen, `npm run test:full` Exit 0 (Paket-Suiten 46/50/13/
240/13/13/17/12, Fixtures 9, Distribution 92, Profilboot 4/4), `npm run build` Exit 0
(23 Pakete, 221 Dateien, 1 919 370 Bytes) und `npm run zahlen:check` deckungsgleich.
Nach dem Verdrahtungs-Commit am Abend: `npm run gate:test` 827/827, statisches Gate
126/126, `gate --full` 23 Gates gruen, `npm run build` Exit 0 (222 Dateien,
1 926 865 Bytes) und `zahlen:check` deckungsgleich.

### Der CodingMon-Zug kommt auf main, und zwar als Puzzleteile

Der 50-Arten-Zug lag drei Tage still, während `main` weiterlief. Der Abstand sah
groß aus: der Zweig war sieben Commits voraus und vierzehn hinterher, und ein
blinder Merge hätte den neuen `main` wieder zerlegt. Gemessen wurde er nicht
nach Commitzahl, sondern nach Datei: der Abgleich des Merge-Commits gegen seinen
zweiten Elternteil ergab 24 Dateien und 5703 Zeilen — alles `packages/codingmon`,
der Generator `scripts/assets/build-codingmon.mjs` und ein Gate-Test. Die 488
Dateien, die der Vergleich gegen den ersten Elternteil zeigt, sind die
Hauptgeschichte, die der Merge mitträgt, und keine neue Arbeit.

Übernommen wurde deshalb pfadweise, nicht als Merge. Der Grund ist nicht
Geschmack: `docs/ZAHLEN.md` im Zweig trug einen ungelösten Konfliktmarker
(`<<<<<<< HEAD`, Zeile 37) im generierten Bestandsblock und Zahlen, die von
einem anderen Baum stammen. Ein solcher Block gehört dem Generator, nicht dem
Branch — `npm run zahlen:sync` schreibt ihn, also wurde er neu geschrieben.
Die drei Commits, die zwischen dem Zweig und dem heutigen `main` lagen, haben
`packages/codingmon` nicht angefasst (`git diff --name-only 4afcd6a fe1bba2 --
packages/codingmon` ist leer), der Konfliktpunkt lag also woanders.

Die Daten kommen aus EINER Quelle: `packages/codingmon/assets/data/codingmon-50.json`
mit 50 Arten, 101 Fähigkeiten, 50 Lineage-Einträgen, Elementchart, Buffs und
Loottable. Gelesen wird sie nur über `assets/katalog.js`; die Zucht liegt in
`assets/zucht.js`, `assets/zucht-glueck.js` und `assets/zucht-xp.js`, der Zufall in
`assets/zufall.js`, die Migration alter Stände in `assets/migration.js`, und
`assets/leiter.js` trägt die gedeckelte lineare Kurve (D49) neben der verzweigten
Nachkommenauswahl (D48). Dass der Client nichts davon doppelt führt, ist
behauptet und gemessen: `node scripts/assets/build-codingmon.mjs --check` vergleicht
die Datenregionen des Bundles gegen die JSON-Quelle und bricht bei Drift ab.

Zwei Zahlen des Struktur-Riegels mussten dabei steigen, und das ist die
unangenehme Hälfte des Tages. `packages/codingmon/client.js` wuchs mit dem
Zucht-Spiegel von 1988 auf 2371 Zeilen. Teilen geht hier nicht: eine Client-Hälfte
ist ein selbsttragendes Bündel, sie kann nicht relativ importieren, und genau
deshalb trägt die Klasse `client` einen eigenen Bestand statt einer Grenze, die
sie nie erreicht. Die Alternative — 380 Zeilen lebende Spiellogik löschen, damit
eine Zahl hält — wäre die schlechtere Lüge. `packages/codingmon/test/durchstich.test.mjs`
wuchs von 777 auf 784 Zeilen, weil die Paritätstests jetzt 50 statt 10 Spezies
prüfen. Beide Zahlen stehen in `docs/contracts/structure.json` mit dieser
Herleitung, und der Regeltext nennt die Ausnahme jetzt ausdrücklich, statt sie zu
verschweigen.

Der 214 Zeilen lange Implementierungsvertrag aus dem Oktober ist dabei entfallen:
er beschrieb einen Plan („Produktionscode ist noch nicht integriert"), den der
Zweig selbst widerlegt. Was daran bindend bleibt, steht als zwei Zeilen in
`docs/ROADMAP.md` §2.2.

Belegt: `npm run test:codingmon` PASS Exit 0 mit 63 von 63 Tests (vor der Übernahme
46), `node scripts/assets/build-codingmon.mjs --check` Exit 0 mit „50 Arten, 101
Fähigkeiten", `npm run gate:test` 887/887, statisches Gate 10 gelaufen und 0
fehlgeschlagen, `npm run build` Exit 0, `npm run zahlen:check` Exit 0.

Offen bleibt und in `docs/ROADMAP.md` §2.2 benannt: der visuelle Nachweis im
echten Browser, ein Installationsnachweis auf einem echten System und die
Fangen des Branchs — Picker-ID gegen Species-ID, HP-Balken gegen effektive
Werte, `wildLimit`/`idleAfterMs` gegen eine Config, die sie wirklich
durchreicht, die Animationsfolge gegen die tatsächlichen Präsentationszustände
und der Spritespiegel je kanonischer Art-ID.

### Die Fangen des Branchs — fünf Zusagen, jede mit einem Befund

Der Plan nannte fünf Fangen, und keine davon war Zierde. Sie waren der Grund, warum
der Zweig drei Tage still lag: der Code sah fertig aus und war es an fünf Stellen
nicht. Die Befunde stehen hier, weil sie das Bild vom fertigen Feature korrigieren.

**Der Picker im Panel-Kopf tat nichts.** Er trug `creature.id` in seinen Optionen
(`c1`, `c2`) und rief eine Funktion auf, die eine *Art*-ID (`nullpointer`,
`deadlock`) erwartete. `pickSpecies('c2')` fand keine Art, also tat es nichts und
gab `null` zurueck — ohne Fehler, ohne Meldung: der Auswahl-Knopf sah aus, als
waere er tot. Zwei IDs, zwei Bedeutungen, und die Verwechslung war still. Jetzt
ruft der Kopf `selectCreature`, und die Fenster-API haelt die Trennung ausdruecklich:
`api.pick` nimmt eine Art, `api.selectCreature` nimmt eine Kreatur, und jede
Verwechslung liefert `null`.

**Drei Ansichten, zwei Zahlen.** Die XP-Leiste und die Arena rechneten die
*Basislleiter*, das Panel und der Kampf die *effektiven* Werte (mit Zuchtbonus). Wer
züchtete, sah in der Leiste eine kleinere Zahl als im Kampf — und die Leiste war
die, die man liest. Jetzt kommt das Hoechst-HP aus einer Fachfunktion
(`effectiveStatsFor`), und die Eskalationszeile sagt ausdruecklich „Basislleiter",
weil sie etwas anderes zeigt.

**Zwei Konfigurationsfelder ohne Leser.** `wildLimit: 3` und `idleAfterMs: 4000`
standen in `packages/codingmon/cordis.patch.yml` und versprachen mehrere wilde Pets
und ein Idle-Zeitfenster. Das Schema in `packages/codingmon/index.js` kennt beide
Feldnamen nicht, und im Browser gab es keinen Weg, sie zu setzen. Ein
Patch-Feld ohne Leser ist eine Zusage ohne Erfuellung: die Felder sind weg, und ein
Test verhindert, dass ein Feld ohne Leser wieder entsteht.

**Der Spritespiegel zeigte die falsche Art.** `gridSvg` sprang bei einer Art ohne
eigenes Gitter direkt auf `SPECIES_IDS[0]` — NullPointer. Vierzig der fuenfzig Arten
sahen aus wie NullPointer, gleichgueltig ob sie zu einem anderen Elementkreis
gehoerten. Die Aufloesung lautet jetzt: eigenes Gitter, sonst das Gitter der
*Familie*, sonst der Notfall. Sie steht in einer Funktion (`resolveGridKey`), ist
ueber die Fenster-API ablesbar (`api.spriteFor`) und damit pruefbar.

**Die Animationen kannten keinen Zustand.** Die Figel lief herum, wenn kein Kampf
offen war, und stand still, wenn einer offen war — auch dann, wenn gerade ein Zug
lief. Der Praesentationszustand ist jetzt *abgeleitet* (`presentationState`):
`idle`, `combat`, `action`, `victory`, `defeat`, `flee`. Die Reihenfolge ist die
Aussage: die Sperre zuerst, denn waehrend eines Zuges steht der Gegner oft noch
gar nicht. Das Ergebnis ist ein Fenster von 1,6 Sekunden, kein Zustand — eine alte
Schlacht darf nicht ewig als Sieg herumstehen. Und der Schalter fuer reduzierte
Bewegung verliert gegen die neuen Regeln nicht mehr: er hatte eine niedrigere
Spezifitaet als `data-state` und war deshalb schon vorher wirkungslos.

Der Test dazu liegt in `packages/codingmon/test/praesentation.test.mjs` (14
Zusagen), und die gemeinsame Attrappe ist nach `packages/codingmon/test/harness.mjs`
gewandert, damit Durchstich und Zusagen dieselbe fahren — ein zweiter
Kopie-Aufbau wuerde zwei Wahrheiten erzeugen. `packages/codingmon/test/durchstich.test.mjs`
ist dadurch von 784 auf 660 Zeilen GESUNKEN, `packages/codingmon/client.js` waechst
auf 2486 Zeilen (Bestand in `docs/contracts/structure.json` entsprechend gemessen
und im Regeltext benannt).

Belegt: `npm run test:codingmon` PASS Exit 0 mit 77 von 77 Tests (vorher 63),
`npm test` Exit 0, `npm run zahlen:check` Exit 0.

### Ein Bild je Art — 50 Sprites, die es vorher nicht gab

Die 50 Arten waren am Tag zuvor da, ihre Bilder nicht: zehn Arten hatten
handgezeichnete 32x32-Gitter, die anderen vierzig zeigten die Figur ihrer
Familie. Das war ehrlich (der Rueckfall hiess Rueckfall), aber es hiess auch:
IndexImp und BoundaryBeast sahen gleich aus, obwohl der Katalog sie als zwei
Arten mit zwei Rollen fuehrt. Die Kunst lag die ganze Zeit daneben — das
CodingMon-50-ArtPack bringt eine SVG-Datei je Art.

**Die Entscheidung, die den Ausschlag gab:** das Gitter ist eine
Identitaetsaussage (fuenf Farben, alle Arten violett) und taugt bei 16 px fuer
die Marke; eine Illustration traegt bei 64 px die Art. Deshalb zeigen Arena,
wilder Gegner und Kampf jetzt die Kunst, und die kleine Marke im Panel bleibt
Pixel art. Kein Familien-Fallback mehr in der Anzeige, aber auch keine
weggeraeumte Regel: `resolveGridKey` bleibt im Code, weil eine 51. Art ohne
Bild sonst wieder auf der ersten Art der Liste landen wuerde.

**Der Befund, den man dem Markup nicht ansieht:** alle 50 Dateien definieren
dieselben vier IDs — `body`, `metal`, `core`, `glow`. Unveraendert
teingebettet, gewaenne im Browser die erste Definition, und 49 Arten wuerden mit
den Farben einer Art gezeichnet: ein stiller Fehler, der wie Kunst aussieht.
Der Generator setzt deshalb `cm-<art>-` vor jede ID, schreibt jeden
`url(#…)`-Verweis mit um und verweigert eine Datei, deren Verweis aus der
eigenen Datei herauszeigt. Geprueft wird das im Buendel, nicht im Gefuehl: 200
Definitionen, jede genau einmal.

**Der Drift, den die Kunst braucht:** der Katalog
(`packages/codingmon/assets/data/codingmon-50.json`) ist die Liste, die Dateien
sind die Antwort — in beide Richtungen. Eine Art ohne Datei ist rot, eine Datei
ohne Art ist rot, und die Einbettung in `client.js` ist deckungsgleich mit dem,
was `buildArt()` aus den Dateien baut. Wer eine Art umbenennt, ohne ihr Bild
mitzunehmen, merkt es beim naechsten Lauf.

Zwei Kleinigkeiten, die Absicht sind und deshalb hier stehen: die Kunst traegt
`aria-hidden` statt des ArtPack-`aria-label`, weil der Name im Panel ohnehin als
Text daneben steht und zweimal vorlesen Laerm ist; und die Rueckseite ist eine
Spiegelung, keine zweite Zeichnung — das ArtPack malt eine Ansicht je Art, und
eine erfundene Rueckseite waere eine Luege mit schoenen Linien.

Der Preis ist gemessen und benannt: 50 Dateien mit 199 KB, im Buendel 202 000
Zeichen, eine Zeile je Art (damit der Diff lesbar bleibt).
`packages/codingmon/client.js` waechst dadurch auf 2587 Zeilen und 433 KB; die
Zahl steht in `docs/contracts/structure.json` im Bestand und im Regeltext, wie
es die Client-Haelfte verlangt. Dass eine Client-Haelfte nicht teilbar ist, gilt
auch fuer Daten.

Belegt: `npm run test:codingmon` PASS Exit 0 mit **84 von 84** Tests (vorher 77;
12 davon im Sprite-Vertrag), `npm test` Exit 0 (statisch 126 bestanden),
`npm run gate:full` PASS 23/23, `npm run zahlen:check` Exit 0, `npm run build`
Exit 0 (dist traegt 50 Kunstdateien). Browser: die Galerie aus
`api.spriteMarkup()` des echten Bundles in Chromium — 100 SVG-Elemente, keines
ohne Flaeche, `observoid` fuellt mit `url("#cm-observoid-body")`, also der
eigenen Definition (`docs/probes/codingmon-sprites-2026-10-21-familien.png`,
Zahlen in `docs/probes/codingmon-sprites.json`). **Nicht** gemessen: das
Rendering im DSH-Panel selbst — das gehoert zur Buehne (B09/BROWSER-01) und
braucht einen laufenden Host; der Mint-Smoke bleibt ebenfalls offen.

### Der Encounter lernt falten — und der Schluessel zeigt, wo er liegt

S4 ist der Slice, der keine Buehne baut, sondern die Bedingung dafuer: einen
Zustand, der aus Ereignissen folgt. Die Buehne selbst (S5) wuerde sonst eine
Animation malen und den Fortschritt daraus ableiten — genau die Umkehrung, die
den Plan unbrauchbar macht. Also zuerst der Vertrag: eine Tabelle mit **20
Ereignissen** in 492 Zeilen und eine Funktion, die nichts tut als falten.

**Warum das CodingMon-Paket.** Der Encounter ist kein zweites Spiel. Begleiter,
Gegnerwahl (`arenaFor`) und Praesentationszustand (`presentationState`) liegen
schon hier; die Buehne zeigt den Kampf des Pets gegen die diagnostische Rolle
der Aufgabe. Ein Encounter-Zustand in `@shinon/popup` haette die Tier-Seite von
der Tier-Anzeige getrennt — dafuer gibt es keinen Grund, nur eine Naht mehr.

**Eine Tabelle, alles andere abgeleitet.** `packages/codingmon/assets/encounter.js`
traegt in `ENCOUNTER_EVENTS` je Ereignis: Namen, Quelle (Art, Referenz,
Besitzer-Paket), die erlaubten Herkunftsstaende, den Zielzustand, die
Payload-Allowlist und die Wirkung. Die Source Map ist daraus abgeleitet
(`Object.fromEntries` ueber dieselbe Tabelle) — keine zweite Liste, die
auseinanderlaufen kann. Die
Zustaende sind geschlossen: `closed → preflight → running → validating →
{completed, rejected, aborted, recoverable-error} → compact`.

**Was der Reducer NICHT kann, ist die eigentliche Zusage.** Keine Uhr, kein DOM,
kein Netz, kein `Math.random`, kein Import. Ein Test liest den Quelltext und
verbietet genau das — nicht als Stilfrage, sondern weil eine Funktion, die die
Uhr liest, ohne Host nicht pruefbar ist und mit Host nicht reproduzierbar.
Derselbe `(Zustand, Ereignis)`-Paar ergibt immer denselben naechsten Zustand;
das steht als eigener Test da.

**Was passiert, wenn etwas nicht passt** — jeder Fall hat seinen Namen:
`IGNORED` bei unbekanntem Typ und doppelter `eventId` (derselbe Zustand zurueck,
identisch, nicht kopiert), `REJECTED` bei kaputter Huelle, gefaelschter Quelle,
fremdem Turn, unerlaubtem Payload-Feld und unerlaubtem Uebergang. Verspaetete
Ereignisse nach dem Terminal kommen nicht mehr durch, ausser der Bergung und dem
Skill-Vorschlag — und beide sind Unterzustaende: sie aendern den Status nicht.
`turn.completed` ohne Ergebnisvertrag ergibt `neutral`, nicht `gewonnen`.

**Der Schluessel, und wo er wirklich liegt.** Der Auftrag verlangte, den
Startweg mit aufzunehmen — und die Messung hat eine alte Annahme korrigiert:
`.env` in diesem Repo ist eine **Vorlage**, elf Namen mit leeren Werten. Der
Arbeitsschluessel liegt im Zugangsspeicher des DSH-Homes
(`$DSH_HOME/.credentials.yaml`, Abschnitt `refs:`) — dort loest DSH die per
`apiKeyEnv` adressierten Namen auf. `shinon --check` und `shinon doctor` melden
jetzt Name und QUELLE (`Umgebung`, `.env`, `Zugangsdatei des DSH-Homes`) und
lesen den Wert nie; ein leerer Eintrag zaehlt nicht als Schluessel. Was dieser
Leser bewusst **nicht** anfasst: `records:` — dort stehen die beiden zur
Rotation offenen Geheimnisse (Session-Cookie, Zugriffstoken).

Die Reihenfolge ist nicht geraten, sondern im gepinnten Anbieter gelesen
(`node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js`, Kopfkommentar):
`$DSH_HOME/.credentials.yaml` schlaegt die geerbte Umgebung, die schlaegt
`<cwd>/.env`, die schlaegt `$DSH_HOME/.env`. Genau deshalb traegt der Seeder das
Home: die Datei im Home ist dieselbe wie im Baum, und der Speicher gewinnt
gegen jede Shell, die nichts exportiert hat. Der Wert selbst bleibt bei allen
vier Quellen ungedruckt — gemeldet wird der Name, der gewinnt.

Belegt: `npm run test:codingmon` PASS Exit 0 mit **107 von 107** Tests (vorher
84; 23 im Encounter-Vertrag), `npm test` Exit 0 (statisch 126), `npm run
gate:test` 889/889, `npm run gate:full` PASS 23/23, `npm run build` Exit 0,
`npm run zahlen:check` Exit 0. Zahlen und Grenzen: `docs/probes/encounter-contract.json`.
**Nicht** gemessen: die Verdrahtung an echte Laufzeit-Signale und die Buehne im
Composer-Dock (S5/B02) — der Vertrag ist die Grundlage, nicht der Beweis.

### Die Buehne haelt nichts — sie fragt den Reducer

S5 ist der Slice, in dem der Vertrag aus S4 zum ersten Mal auf einem Bildschirm
steht. Die Versuchung war klar umrissen: eine Komponente mit `useState`, ein
paar Phasen, Animationen dazwischen — und schon haette die Anzeige ihren
eigenen Fortschritt. Stattdessen gilt: der Encounter-Zustand ist genau der
Rueckgabewert von `reduceEncounter`, jede Aenderung geht durch ihn, und die
Buehne liest ihn beim Rendern. Das Protokoll daneben (Typ, Ausgang, Grund) ist
Eingabe-Gedaechtnis, keine zweite Wahrheit.

**Der Spiegel, der keiner ist.** Das Bundle kann `assets/` nicht importieren.
Die Wahl stand zwischen einem zweiten Reducer im Browser (zwei Wahrheiten, die
auseinanderlaufen — genau der Fehler, den die Repo-Regel verbietet) und einem
generierten Block. `scripts/assets/build-encounter-client.mjs` schneidet den
Kern aus `assets/encounter.js` heraus, streicht nur die Kommentare, laesst den
Code zeichengleich und schreibt ihn zwischen zwei Marker. `--check` und der
Test vergleichen Block UND Verhalten: dieselbe Folge durch beide Fassungen
ergibt denselben Zustand, dieselbe Absage, denselben Grund. 390 Zeilen im
Bundle, aber eine Quelle.

**Was der Playtest gefunden hat, waehrend er das tat, was ein Erstnutzer tut.**
Drei Dinge, die kein Unit-Test behauptet hatte:

1. **Die Vertragsluecke.** Ein Abbruch im Vorflug landete im Terminal
   `aborted` — und der Zustand wusste nicht mehr, ob er im Vorflug oder in der
   Pruefung abgebrochen wurde. Die Buehne haette raten muessen (sie tat es
   zuerst: jedes Terminal markierte „Pruefung“). Die Reparatur sitzt in der
   Tabelle, nicht in der Buehne: `lastPhase` traegt den Zustand, aus dem der
   letzte Wechsel kam; Beobachtungen (`to: null`) schreiben die Spur nicht um,
   alte Staende ohne das Feld bleiben gueltig.
2. **Der Doppelklick.** In den ersten Millisekunden steht der Status noch auf
   `closed`, waehrend der Uebungszug schon laeuft. Ein zweiter Klick haette
   einen zweiten Satz Timer mit fremder `turnId` gestartet — der Reducer haette
   jedes zweite Ereignis als `FOREIGN_TURN` abgewiesen, und der Nutzer saehe
   eine Absage fuer seinen eigenen Klick. Jetzt ist `encounterTimers.size` die
   Wache, und ein Test faehrt zwei Starts hintereinander.
3. **Die Sprache.** „1 Ereignisse“ und `Pruefung` in einer Oberflaeche, die
   sonst „Faehigkeiten“ und „Rueckzug“ schreibt: ein Plural-Helfer und echte
   Umlaute, dazu deutsche Bilanzworte statt `contract-passed` im Satz (der
   Vertragsname bleibt im `title`).

**Was die Messung im schmalen Dock gezeigt hat.** Bei 280, 340 und 480 px
kein horizontaler Ueberlauf (`scrollWidth == clientWidth` fuer Kopf, Schiene
und Karte); die Metazeile bricht um, statt zu klemmen. Zwei Zustandsszenarien
wurden durchgeklickt: voller Lauf (Vorflug -> Lauf -> Pruefung -> Abschluss ->
verdichtet, 14 Ereignisse) und Abbruch nach 1,2 s (Schiene bleibt auf dem
Vorflug, Knopf wird „Neu“). Ein Neuladen mitten im Lauf hinterlaesst keinen
Phantomzustand: die Buehne startet wieder auf `closed`, ohne Timer.

Belegt: `npm run test:codingmon` PASS mit **124 von 124** Tests (vorher 107;
17 neu: 16 Buehne/Spiegel, einer fuer `lastPhase`), `npm test` Exit 0,
`npm run build` Exit 0 (289 Dateien, 2 679 693 Bytes), `npm run gate:full`
PASS 23/23. Der Playtest lief durch das ECHTE Bundle in Chromium mit einem
DOM-Schreib-Schema fuer die Elementbaeume (kein React): gemessen sind Zustaende,
Klassen, Breiten und Klicks, **nicht** das Rendern im DSH-Dock. Offen bleiben
deshalb: echte Host-Signale (der Uebungszug ist kein Modell-Turn), der
React-Pfad und die Live-Abnahme am Dev-Server. Zahlen und Screenshots:
`docs/probes/encounter-stage.json`.

### Das Pre-Flight-Deck zeigt, was es weiss — und was nicht

S6 liest B04 aus dem Planarchiv: ein Deck vor jedem Token-Burn mit Aufgabe,
Tendenz, Konflikten, gezogenen Bloecken, Faktenquellen, Route und Budget, dazu
ein Eingriffsfenster, nach dem ein Klick nicht mehr wirkt. Der Bau hat sich an
die vorhandene Wahrheit gehalten, statt eine neue zu erfinden: das Deck ist eine
Ansicht von `encounter` und schreibt nur ueber `encounter.block.selected`
zurueck, durch denselben Reducer. Kein neues Ereignis, keine zweite Liste.

**Was fehlt, steht da.** Tendenz, Konflikte, Faktenquellen und Budget haben in
diesem Slice keine Quelle. Sie als `nicht gemeldet` / `nicht gemessen`
anzuzeigen ist die einzige ehrliche Antwort; eine erfundene Zahl waere genau
die Sorte Fortschritt, die der Plan verbietet. Die Route dagegen gibt es — sie
wandert im Uebungszug VOR `preflight.ready`, damit das Deck sie vor dem Lauf
zeigt und nicht danach.

**Das Fenster ist ein Fenster, kein Timer-Trick.** Mit `preflight.ready` oeffnet
sich das Deck, zwei Sekunden lang ist es schaltbar, der Knopf heisst «Lauf
starten», der Timeout ist der Default-Pfad: es geht mit genau der Auswahl
weiter, die der Zustand traegt. Danach ist die Auswahl eingefroren — der
Schalter ist `disabled`, das Deck sagt «Aenderungen zu spaet», und
`toggleBlock` gibt `null` statt still zu wirken. Ein Abbruch im offenen Fenster
schliesst es und laesst keinen Timer stehen.

**Der Playtest durch das echte Bundle** (Chromium, DOM-Schreibschema, kein
React) hat das Deck im Vorflug mit allen sieben Zeilen gezeigt und gemessen:
Aufgabe `Reparatur · fix`, Fakten `3 VALID · 1 UNTRUSTED · 0 UNKNOWN ·
snap-uebung`, Route `lokal / uebungszug`, Tendenz/Konflikte/Quellen/Budget
sichtbar absent. Ein Klick auf den Block-Schalter nahm `enhancer-system-policy`
aus der Auswahl (8 Ereignisse, `preflight.blocks` = eine ID, Etikett `data-on`
= `off`); «Lauf starten» startete den Lauf mit genau dieser Auswahl, das Deck
wechselte auf «Aenderungen zu spaet», der Schalter wurde `disabled` und
`toggleBlock` gab `null`. Der Timeout-Pfad lief ohne Eingriff mit den beiden
Default-Bloecken. Ein Neuladen im offenen Fenster ergab wieder `closed`, ohne
Deck und ohne Timer. Bei 340 px kein Ueberlauf (Deck, Raster und Blockzeile
`scrollWidth == clientWidth`).

Ein Befund aus dem Bau, der die Beschriftung betraf: der Knopf hiess zuerst
«Anfrage starten», waehrend im selben Deck «kein Modellaufruf» steht. Er heisst
jetzt «Lauf starten» — ein Knopf, der eine Anfrage behauptet, die nicht
rausgeht, waere die stille Luege, die B04 verhindern soll.

Belegt: `npm run test:codingmon` PASS mit **130 von 130** Tests (vorher 124;
sechs neu im Deck), `npm test` Exit 0, `npm run build` Exit 0, `npm run
gate:full` PASS 23/23, `npm run zahlen:check` Exit 0. **B04 bleibt offen:** der
Request-Diff, die Tokenkosten des Preview-Schritts und ein echter Modellaufruf
vor/nach dem Fenster sind ohne Prompter-Anbindung nicht messbar; das Deck ist
die Anzeige- und Bedienhaelfte. Zahlen und Screenshots:
`docs/probes/preflight-deck.json`.

### Der Katalog kommt vom Anbieter, nicht aus dem Profil

Die statische Modellliste war eine Abschrift, und Abschriften veralten. Der
Key-Router liest sie jetzt beim Start am Anbieter selbst (`fetchCatalog`):
`baseUrl + probePath`, oeffentliche Listen ohne `Authorization`, ein Fehler als
`fehler` im Status statt als erfundene Zahl. Der Live-Wert steht neben dem
statischen (`declared`), damit der Unterschied sichtbar bleibt.

Der echte Boot misst `[shinon-key-router] Katalog openrouter: 469 Modelle live
(0 statisch)`; derselbe Abruf direkt gegen den Anbieter ergibt 469 Eintraege.
Fuer Agnes und Prompter steht `HTTP 401` im Log — nicht, weil der Abruf kaputt
ist, sondern weil der Router seine Pools aus den Startumgebungs-Schichten
liest und `.env` die Namen leer fuehrt. Der Weg vom DSH-Zugangsspeicher in den
Pool ist die offene S12-Arbeit; ohne ihn bleibt der Live-Abruf auf
oeffentliche Listen beschraenkt.

Bewusst NICHT gebaut: ein Schreiben in das Settings-Dokument des
`llm-pi-ai`-Adapters. Der DSH-Modellwaehler liest von dort, und ein zweiter
Schreiber waere genau die zweite Wahrheit, die dieses Repo vermeidet — die
Models-Seite besitzt diesen Schreibweg bereits. Der Router-Katalog ist die
Antwort des Anbieters, keine Konfigurationsaenderung.

### Der echte Turn zeigt, wo das Deck noch nicht greift

Vor dem naechsten Bauversuch stand die Frage, ob die B04-Kette im echten
Dev-Server ueberhaupt traegt. Sie traegt nicht — und der Turn zeigt genau, an
welcher Stelle. Das ist der wertvollere Befund als ein weiteres Deck-Feature.

**Der Start laedt den Schluessel selbst.** `shinon --check` meldet beide Namen
als gesetzt, mit der QUELLE (Zugangsdatei des DSH-Homes) und ohne Wert. Die
gleichnamigen Zeilen in `./.env` existieren, sind aber leer: die Datei ist eine
Vorlage, nicht der Ort des Schluessels. Der Irrtum ist damit belegt statt
vermutet. Im Serverlog steht kein Schluessel — 0 Treffer fuer das uebliche
`sk-`-Muster mit Laenge; die zwei `sk-`-Treffer sind das Wort `task-router`.

**Ein echter Turn lief durch.** Prompt „Antworte nur mit dem Wort: OK", im UI
als abgeschlossen gemeldet, Hauptroute `prompter/agnes-3.0-flash`. Davor lief
der One-Shot-Prompter auf `agnes/agnes-2.5-flash` mit gemessenen Tokens und
gemessener Dauer. Das ist der Beweis, dass der Pfad bis zum Anbieter steht —
und zugleich der Beweis, dass der Preview zu spaet kommt.

**Die drei offenen Glieder.** (a) Der One-Shot ruft ein Modell auf, BEVOR
irgendein Deck sichtbar ist; das Deck lebt nur im Uebungszug. Ein
Zero-Cost-Preview vor jedem Modellaufruf existiert nicht. (b) Die
Blockauswahl endet im lokalen Reducer: `encounterToggleBlock` schickt ein
Ereignis an `reduceEncounter`, kein Host-Aufruf, keine Ablage, kein Dienst.
(c) Der Prompter ruft `selectBlocks` ohne `includeIds`; er kann eine
Deck-Auswahl also gar nicht lesen. Ein Request-Diff ist strukturell
unmoeglich — nicht ungemessen, sondern nicht vorhanden. Wer das anders
darstellt, baut um das Problem herum.

**Die Buehne dagegen steht.** Im echten Dock erscheint sie, sobald eine
Sitzung existiert (in der leeren Sitzung rendert der Slot nicht — der fruehere
Eindruck „nicht gemountet" war ein Messfehler, kein Befund). Der Uebungszug
laeuft im echten Client bis zur Bilanz. Screenshot und Messungen:
`docs/probes/preflight-live.json`.

**Nebenbefund Modellliste.** `agnes` traegt eine statische Liste im Profil,
`openrouter` nur einen Schluesselnamen ohne baseURL und ohne Modelle. Der
Adapter bezieht `listModels()` aus dem Settings-Dokument und verwirft
dynamische Katalog-Aktualisierung ausdruecklich. Live-Discovery gibt es als
Host-Operation und Models-Seite; sie schreibt in das Dokument, sie erweitert
den Katalog nicht. „Live-Fetch bestimmt die Liste" ist deshalb eine
Schreib-/UI-Aufgabe, keine Adapter-Aufgabe.

**Schluessel-Hygiene.** Im Chat genannte Schluessel wurden nicht gespeichert,
nicht in eine Datei geschrieben und nicht committet; sie sind als exponiert zu
behandeln und zu rotieren. Ein Beleg, der einen Wert braucht, ist kein Beleg.

---

## Der Schnitt vom 2026-10-20 — was fiel, was es las, was blieb

**Was fiel:** 73 Dateien. `docs/audit/` (9), `docs/analysis/` (2), `docs/archive/`
(50, samt `legacy-goose-prompts/`, `legacy-profiles/web/` und `session-eval-2026-10-17/`),
die Messpapiere `docs/S3-*` (3), `docs/S4-DOCTOR`, `docs/S5-RELEASE`,
`docs/S6-MODELLTURN-AUDIT-CI`, `docs/S6-RUNBOOK`, dazu `docs/INDEX.md`,
`docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`, `docs/CI.md`, `docs/PR-PROMOTION.md`,
`docs/DSH-RC2-INTEGRATION.md` und `docs/SCAN-2026-10-17.md`. Danach trägt `docs/` vier
Prosadokumente — Tagebuch, Zahlen, Roadmap, Commit-Regeln — und zwei Verzeichnisse, die
etwas liest: `contracts/` und `probes/`.

**Warum diese und nicht andere:** jede von ihnen war eine zweite Fassung von etwas, das
hier schon steht. Das Tagebuch trägt ihre Aussagen, aber an einem Commit-Anker statt an
einem Datum; wer den alten Wortlaut braucht, holt ihn mit `git show <sha>:<pfad>` aus der
Historie — genau das ist der Unterschied zwischen „gelöscht" und „verloren".

**Was sie las — und wohin es zeigt:** der Schnitt war erst fertig, als jeder Leser
umgebogen war. Gefunden und repariert: `scripts/perf-baseline.mjs`,
`scripts/index-cold-cost.mjs` und `packages/project-index/assets/index-core.js` zeigen
jetzt auf `docs/probes/perf-baseline.json` bzw. `docs/probes/index-cold-breakdown.json`
(die Proben, die diese Läufe selbst schreiben); `bin/shinon.mjs` nennt keinen
Audit-Dateinamen mehr, sondern den behobenen Zustand; `scripts/scale-check.mjs`,
`README.md`, `AGENTS.md`, `scripts/gate/plugins/probe-twin.mjs` und
`scripts/gate/tests/contracts.test.mjs` zeigen auf `AGENTS.md`; `.github/workflows/release.yml`
und die `README`-Belege auf dieses Tagebuch; `packages/narrative/README.md`,
`packages/narrative/cordis.patch.yml`, `packages/tooltip/index.js` und die sechs
Skills unter `.agents/skills/` tragen ihre Quellen ohne toten Pfad; die zwei
Probe-JSONs haben sechs Nennungen des alten Messpapiers gegen ihre eigenen Pfade
getauscht; `docs/ZAHLEN.md`, `docs/ROADMAP.md` und `docs/COMMIT-REGELN.md` nennen
`AGENTS.md` als Einstieg und dieses Tagebuch als Geschichte.

**Was mitging:** das Gate `docs-status`. Es hatte genau einen Gegenstand — die Menge der
Dokumente, die der Schnitt entfernt hat — und wäre danach eine Hülle über vier Dateien
gelaufen. Seine Aufgabe („wer eine Zusage ändert, ändert den Beleg, nicht nur den Satz")
steht jetzt in `AGENTS.md` und wird von `diaryIssues()` mechanisch geprüft: ein Kapitel
ohne Commit und Pfad ist rot. `scripts/gate/policy.json` führt den Eintrag nicht mehr,
`node scripts/gate/policy.mjs` bleibt Exit 0.

**Was absichtlich stehen blieb:** `packages/events/assets/replay/session-created.json`
trägt in einer zitierten Nutzerkorrektur den Satz „falscher Pfad, richtig:
docs/INDEX.md". Das ist kein Verweis, sondern ein Beispieltext in einer Fixture — ihn
umzuschreiben hieße, eine Aufzeichnung zu frisieren; kein Leser löst ihn auf.

**Anker:** `541682f` · Belege: `docs/TAGEBUCH.md`, `AGENTS.md`, `scripts/gate/policy.json`, `packages/events/assets/replay/session-created.json`

---

## Was die Akten falsch behaupten

Jede Zeile ist eine Behauptung, die einmal in einem Dokument stand, was der Baum **heute**
zeigt, und der Commit, der sie widerlegt oder überholt hat. Das ist der Grund, warum
dieses Tagebuch keine Erfolgsliste ist.

| Behauptung (Quelle) | Was der Baum heute zeigt | SHA |
|---|---|---|
| `docs/audit/ORDNUNG-2026-10-18.md` §C3: die Workspace-Identität sei ein bytegleicher Zwilling mit `zwilling:workspace-identitaet`-Region | beide Dateien re-exportieren nur noch `@shinon/seams/core`; es gibt keine solche Region — `packages/prompter/assets/workspace.js`, `packages/project-index/assets/workspace.js` | `541682f` |
| `docs/audit/ORDNUNG-2026-10-18.md`: sechzehn Host-Zwillinge werden von `SOURCE_TWINS` zusammengehalten | `SOURCE_TWINS.length === 10`, und keine Regel spiegelt mehr in eine Host-Hälfte — `scripts/lib/repo.mjs` | `541682f` |
| `docs/S6-MODELLTURN-AUDIT-CI-2026-10-17.md`: ohne Schlüssel ist kein Modellturn möglich | `.env` liegt im Root und wird vom geseedeten Home verlinkt (nur Anwesenheit geprüft, Wert nie gelesen) — der Blocker ist heute eine Prozessfrage, keine fehlende Datei — `scripts/lib/dsh-home.mjs` | `4db4006` |
| `AGENTS.md` (vor dem 2026-10-19): das Repo-Root ist `DSH_HOME` | das Home liegt unter dem Zustandsordner (`dev-dsh-home`) und wird aus dem Baum geseedet — `scripts/lib/dsh-home.mjs`, `scripts/lib/paths.mjs` | `c9a7556` |
| `.agents/skills/` (vor `3662593`): `npm test` fährt den Gesamtstack | `test` läuft statisches Gate + `gate --local`, der volle Lauf heißt `test:full` — `package.json` | `3662593` |
| `.agents/skills/` (vor `3662593`): `dashboard` ist ein Platzhalter | die Client-Hälfte liest die echten `workspaces`/`sessions`-Dienste — `packages/dashboard/client.js`, Beleg `docs/probes/workspace-list.json` | `3662593` |
| `docs/COMMENT-KANON.md` (gelöscht): Kommentare über 10 Zeilen werden ausgelagert | es gibt kein Längenlimit; `scripts/comment-limit.mjs` und sein Gate-Plugin existieren nicht mehr — `AGENTS.md` | `5274bff` |
| `docs/archive/CHANGELOG.md` (2026-10-11): pnpm bleibt die Paketquelle, die Bindung ist offen | null getrackte pnpm-Dateien, kein `packageManager`; die `workspace:*`-Bindung ist weiter offen — `package.json`, `package-lock.json` | `e3e2576` |
| `docs/INDEX.md` (Fassung 2026-10-19): 90 getrackte Markdown-Dateien, 699 Gate-Tests | heute 74 `.md` unter `docs/` und 759 Gate-Tests — `scripts/gate/tests/` | `541682f` |
| `docs/S5-RELEASE-2026-10-17.md`: Tag `v0.4.0` fehlt und braucht eine Freigabe | **stimmt weiterhin** — `git tag` zeigt `v0.2.0`, `v0.3.0` und fünf `runtime-*`; der Satz ist nicht widerlegt, sondern offen — `docs/ROADMAP.md` | `c30112c` |
| `shinon-forge-implementierungsplan.md` §27: „Definition of Done — Shinon Runtime v1" — 23 Kästchen als fertiges System | zwei Kästchen sind nirgends gebaut und standen bis zum 2026-10-20 in **keiner** offenen Liste: Capability Router und Browser Vision (das Paket `packages/vision-fallback/` gibt es nicht) — sie stehen jetzt in `docs/ROADMAP.md` §2.2 | `c0d99cf` |
| `docs/FOUNDATION-PLAN.md` (L0): Telemetrie macht `token-usage` **echt** — das Panel ist eine View über Telemetrie, nicht „📊 --" | `packages/token-usage/index.js` loggt in `apply()` und tut sonst nichts; das Paket war vom ersten Commit an so — `packages/token-usage/index.js` | `ffbf721` |

Wo eine Zeile keine Quelle mehr hat (weil das Dokument in einer früheren Aufräumwelle
verschwand), steht der Pfad, der die Behauptung heute trägt — nicht ein erfundenes Zitat.

## 2026-10-22 — Ein Panel, das nur die Zahlen zeigt, und eine Leiste, die wieder atmet

**Was am Ende wirklich passiert ist:** Der Datei-Browser zeigt jetzt, was sich im
Arbeitsbaum geändert hat — im Kopf erst nur `+712 −306 · 42`, auf Klick die
scrollbare Liste, je Datei ihre Hunks mit Marken. Das Panel rechnet keinen Diff:
`node_modules/diff` liegt nur transitiv im Baum, kein Workspace-Manifest
deklariert es, also fragt das Paket `git` (`status --porcelain`, `diff --numstat
HEAD`, `diff --unified=2 HEAD -- <pfad>`) und deklariert **keine** neue
Abhängigkeit. Was Git nicht vergleicht (unversioniert, binär), zählt nicht mit und
trägt seinen Grund; eine Grenze meldet sich als `truncated: {soll, ist}` — nie
stilles Kürzen. Belege: 14/14 im Gate-Test, 13/13 im Kern, Chip am laufenden Host
auf 3085. Die Client-Hälfte steht mit **249** Zeilen unter der 250er-Grenze der
`client`-Klasse; keine Anhebung, kein Bestandseintrag.

**Zwei Sätze aus dem laufenden Host, die zu Fixes wurden:** Das Prüf-Panel zeigte
„1 Auflage · 1 entschieden" und sonst nichts — jetzt steht der entschiedene
Vorschlag mit Ausgang und Behauptung da. Und der Prompter hatte aus „Wer bist du?"
einen `<task_brief>` über Identität und Vorschlags-Review gemacht; eine Frage wird
klassifiziert, aber nie erweitert (`brief_reason: FRAGE`).

**Die Leiste:** Acht Panel-Knöpfe drückten die Workspace-Liste aus einem 736-px-
Fenster. Marker, Prompter, Persona und Popup treten aus `sidebar.panellist` aus;
ihre Zahlen stehen als Widget-Zeilen in `@shinon/widget-dock` (ein Streifen, drei
Zeilen, gespeist aus den kanonisch registrierten Globals). Dashboard und Codingmon
bleiben Panels — sie brauchen die Fläche. Ein Werkzeugkasten, in dem jeder
Schraubendreher eine eigene Schublade hat, findet nichts; drei Zeilen finden mehr.

**Was offen bleibt:** der Screenshot der aufgeklappten Liste (die Seite verlor nach
dem Reload die Sitzung), und der Modell-Wähler zeigt weiter nur eine Route — im
Boot stehen `Katalog agnes: HTTP 401` und `prompter: HTTP 401` bei
`openrouter: 468 Modelle live`.

**Nachtrag zum Preflight-Merge:** Der Workflow wurde nicht nur umbenannt, sondern auf sein Verhalten geprüft. Der Vertrag weist nach, dass teure Jobs direkt vom günstigen Preflight abhängen, dass Dummy-Kommandos unter gültig klingenden Jobnamen rot werden und dass die finale Abnahme fehlende, übersprungene oder fehlgeschlagene Jobs nicht als Erfolg auslegt. Ein erster grüner Lauf machte außerdem zwei Historie-Skips sichtbar; die doppelte Realbaumprüfung wurde entfernt und der echte Tagebuch-Check im Schnellpfad auf vollständige Git-Historie festgelegt. Der kanonische Checker wurde anschließend auf eine einzige Implementierung zurückgeführt. PR #23 wurde nach 21/21 erfolgreichen Jobs squash-gemergt.

**Anker:** `8f4a7ea8f6e639525a312e61a88d8910bdc23e7e` · Belege: `.github/workflows/commit-guard.yml`, `scripts/lib/preflight/documentation.mjs`, `scripts/lib/preflight/fixes.mjs`, `scripts/gate/tests/preflight-docs.test.mjs`, `scripts/gate/tests/diary.test.mjs`, `scripts/shinon-test.mjs`, `docs/CHANGELOG.md`

**Nachtrag vom selben Tag — Branch-Integration und Testline:** Der offene PR #22
(`work/dsh-provenance-docs`) trug zwei Doku-Korrekturen, die vier Commits hinter `main`
lagen; sie sind als `0ad4618` und `88a37ab` linear übernommen. Die vier
Dependabot-Zweige #24–#27 waren ebenfalls überholt und ließen sich nicht konfliktfrei
mergen; ihre Versionshebung steht jetzt direkt in `package-build.yml`,
`runtime-release.yml` und `release.yml` (`checkout@v7`, `setup-node@v7`,
`upload-artifact@v7`, `download-artifact@v8`). Der Paketbau weckt die drei Bauhosts
nicht mehr für einen reinen Doku-Push (`paths-ignore`), und eine `concurrency`-Gruppe
je Ref beendet überholte `main`-Bauten — wie ein Paketbote, der nur losfährt, wenn
sich das Paket geändert hat.

Die Testline wurde nicht umgebaut, sondern gemessen und geschärft: 95
Gate-Testdateien, 948 Tests, 0 rot, 0 geskippt, 14 s; die langsamste Datei
`source-write.test.mjs` braucht 5,8 s, keine liegt über 10 s. `npm test` bleibt bei
3 s, der Profiltest löst 27 Layer (22 Repo-Bundles) in 4/4 Zusagen. `gate:test`
bricht jetzt bei 20 s ab (`--test-timeout=20000`), und ein roter Lauf nennt
`GATE_<ID>_FAILED`/`STATIC_<STEP>_FAILED` statt nur einer Zeile Prosa. Die alte
Existenz-Zusage im Narrative-Test liest jetzt den Vertrag und prüft Zustände und
Verbotsliste. Die Testzeit-Regel in `AGENTS.md` steht wieder als Regel da; die
gemessenen Zahlen und die leere Ausnahmeliste stehen ausschließlich in
`docs/ZAHLEN.md` §2. Der Dev-Server bootete auf Port 3000 mit 27 Layern, lieferte
die UI mit Token als HTTP 200 (46 264 Bytes) und verweigerte ohne Token (401) sowie
bei fremdem Origin (403).

**Anker:** `8f4a7ea8f6e639525a312e61a88d8910bdc23e7e` · Belege: `.github/workflows/package-build.yml`, `.github/workflows/release.yml`, `.github/workflows/runtime-release.yml`, `scripts/gate/engine.mjs`, `scripts/shinon-test.mjs`, `scripts/gate/tests/narrative.test.mjs`, `AGENTS.md`, `docs/ZAHLEN.md`, `docs/CHANGELOG.md`
