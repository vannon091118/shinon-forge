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

## 2026-10-20 — Sechzehn Zwillinge werden einer

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

**Anker:** `4a1bc31` · Belege: `scripts/lib/payload.mjs`, `scripts/lib/huelle.mjs`, `scripts/deb-build.mjs`, `scripts/win-build.mjs`, `.github/workflows/package-build.yml`, `scripts/gate/tests/packaging.test.mjs`, `docs/probes/pakete-2026-10-20.md`

---

## 2026-10-20 — Der Skill-Lebenszyklus: ein Weg, nicht zwei

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

## 2026-10-20 — Wissens-Runtime, Zug 1: Fakten bekommen einen eigenen Ort

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

## 2026-10-20 — Wissens-Runtime, Zug 2: Quellen bekommen Extraktoren, Fakten ein Verfallsdatum

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

## 2026-10-20 — Wissens-Runtime, Zug 3: der Block kommt aus der Runtime, nicht aus dem Modell

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
