# Roadmap — wohin das Repo geht

> **Status:** plan — die einzige Liste offener Arbeit: Release-Ziele, Abnahmen, zurückgestellte Punkte. **Stand:** 2026-10-22
> **Einstieg:** `AGENTS.md` · **Zahlen:** `docs/ZAHLEN.md`

Regeln dieser Datei: kein Punkt ohne Abnahme (Befehl oder beobachtbares Ergebnis),
keine Zahl außer Datum und SHA (Bestand und Messungen stehen ausschließlich in
`docs/ZAHLEN.md`), keine erledigte Arbeit (die steht in `docs/TAGEBUCH.md`).
Ein Punkt zählt als erledigt, sobald Befehl, Exit-Code und Ergebnis in einem Beleg
stehen — Code ohne belegten Lauf ist offen. `UNGEPRÜFT` ist kein Pass.

## 1. Versionsordnung (eine Regel, zwei Zeilen)

- **Root** (`package.json`, Lock-Kopf in `package-lock.json` trägt denselben Wert):
  Semver auf der `0.x`-Linie. **Minor** = ein Feature-Batch mit neuen Zusagen und
  neuen Tests. **Patch** = Korrekturen und Doku ohne neue Zusagen. Ein Bump ist ein
  Commit wie jeder andere: mit Trailer, Wächter und grünem CI-Lauf — kein Nebenkanal.
- **Pakete** (`packages/*/package.json`): genau zwei Zeilen, und sie werden
  **nicht** einzeln gebumpt. `1.0.0` für ausgelieferte Pakete, `0.1.0` für
  Vorbereitung (`dsh.inactive` im eigenen Manifest) — entschieden vom Paket
  selbst, geprüft vom `doctor` (`scripts/gate/plugins/doctor.mjs`).

## 1.5 Release-Freeze v0.4.0 (kanonische Entscheidung, 2026-10-17)

**Release-Umfang eingefroren:** Wenn `v0.4.0` freigegeben wird, unterstützt es genau
einen Installationsweg — den **Quellklon** (`git clone`, `npm ci`,
`npm run profile:links`, Profil-Dump, UI-Start und `shinon doctor` read-only).
Der Freeze ist eine Entscheidung, kein Messwert: **kein Feature-Wunsch wird
nachträglich in v0.4.0 gezogen.** `shinon update`, persistentes
`shinon autoupdate`, `.deb`, Live-429-Rotation mit zwei echten Schlüsseln,
Mobile/Android, Desktop-Shell, Rust-/Single-Binary-Port, Vollbenchmark und
QoL-Top-10 sind **kein** v0.4.0-Umfang.

**Werkzeuge im Baum, außerhalb des Urteils:** `scripts/install-user.mjs` (`npm run
install:user`), `npm run verify:install` und `scripts/backup-retention.mjs`
existieren als Bediener-Werkzeuge mit eigenen Gate-Tests — sie sind noch kein
belegter Release-Installationsweg. Dasselbe gilt für den Paketbau
(`npm run deb` / `npm run win`, CI in `.github/workflows/package-build.yml`):
der Code für `.deb` und Windows-ZIP steht im Baum, der Freeze gilt unberührt,
und ein Paket ist erst dann ein Release-Installationsweg, wenn ein echter
Install auf einem echten System belegt ist (Beleg: `docs/probes/`). Namensgrenze: `npm run install:user update`
pflegt ein Nutzer-Installat, `npm run update` prüft den DSH-Upstream —
`shinon update` (Forge-Selbstupdate) bleibt Folgearbeit.

**Reihenfolge:** S0 → S1 → S2 → S3 → S4 → S5 → S6. Kein Slice zieht Arbeit aus
v0.5.0 vor, auch nicht „schnell zwischendurch“.

### Slice-Abnahmen (Pflicht, Abnahme, Beleg, Stand)

| Slice | Pflicht (Abnahme) | Beleg | Stand |
|---|---|---|---|
| S0 Freeze | Freeze dokumentiert; v0.5.0-Liste vollständig | diese Datei (§1.5, §2) | belegt |
| S1 Workspace | Prompter und Project Index beantworten dieselbe Workspace-Frage; fremde Root abgelehnt, `..`/Symlink-Ausbruch gestoppt, Veraltetes entfernt — jede Probe wird bei Mutation rot | `npm run test:prompter`, `npm run gate:test` | belegt |
| S2 Kontext | Eine Quelle je Schritt; Budget vor dem Modellaufruf; Provenienz (Workspace, Quelle, Pfade, Budget) im Datensatz, ohne Prompt-Text und ohne Schlüsselwerte | `npm run test:prompter`, Gate-Naht `context-wiring`, `docs/probes/index-konsolidierung.json` | belegt |
| S3 Quellklon | Frischer Klon ohne globales DSH: nur die dokumentierten Befehle bis zum UI-Start | `docs/TAGEBUCH.md`, 2026-10-17 (`d8999ab`) | belegt |
| S4 Doctor | `shinon doctor` als Laufzeit-Unterbefehl, read-only, stabile Exitcodes, Schlüssel nur als Anwesenheit | `docs/TAGEBUCH.md`, 2026-10-17 (`dd18824`) | belegt |
| S5 Schranke | Alle Gates grün, Version/Tag/Lock konsistent, Quellarchiv + SHA-256 | `docs/TAGEBUCH.md`, 2026-10-17 (`c30112c`) | teils — **offen:** Tag `v0.4.0` + Schranken-Lauf darauf |
| S6 Go/No-Go | Echter Modellturn mit lokalem Schlüssel, Security-/Dependency-Audit, finale Doku, CI-Run-ID des Release-Bumps | `docs/TAGEBUCH.md`, 2026-10-17 (`4db4006`) · Gate-Lauf `39711072872` | **offen** — Audit und aktueller Gate-Lauf grün; echter Modellturn, finale Release-Doku und CI-Lauf des Release-Bumps offen |

## 2. Offene Punkte (vollständig — alles andere ist Folgearbeit oder zurückgestellt)

### 2.1 v0.4.0-Rest (Release-pflichtig)

- **S5-Schluss:** Tag `v0.4.0` setzen, Schranken-Lauf darauf (Workflow, Tag, Archiv) — erst dann ist S5 belegt.
- **S6-Schluss:** echter Modellturn mit lokalem Schlüssel (Boot, Urteil, Widerruf, Host-Ende, Neustart, ohne Schlüsselwert im Text; Protokoll unter `docs/probes/`), finale Release-Doku, CI-Run-ID des Release-Bumps. Der Audit-Gate-Lauf `39711072872` auf Commit `e2cf66a` ist grün, ersetzt aber nicht den Release-Bump-Lauf.

### 2.2 v0.5.0-Kandidaten (keine Versprechen — was landet, entscheidet der Betreiber)

- **Encounter-Vertrag (S4 / B03, 2026-10-21):** der Zustand der späteren Bühne folgt aus Ereignissen, nicht aus einer Animation. `packages/codingmon/assets/encounter.js` ist die EINE Definition — Tabelle `ENCOUNTER_EVENTS` mit Name, Herkunft, erlaubten Zuständen, Zielzustand und Payload-Allowlist je Ereignis; die Source Map ist daraus abgeleitet (keine zweite Liste), und `reduceEncounter(state, event)` ist eine reine Funktion ohne Uhr, DOM, Netz oder Zufall. Der Test `packages/codingmon/test/encounter.test.mjs` (23 Zusagen in `npm run test:codingmon`) fährt jedes Ereignis einmal durch den Reducer, friert den Eingabezustand tief ein, prüft Identität bei `IGNORED`/`REJECTED` und vergleicht jeden nativen Quellverweis gegen `packages/events/assets/event-spine.json` sowie jeden internen gegen einen Paketordner im Baum. Offen bleibt die Verdrahtung an echte Signale und die Bühne selbst (S5, B02) — der Vertrag ist die Grundlage, nicht der Beweis. Beleg: `docs/probes/encounter-contract.json`.
- **Encounter-Bühne (S5 / B02, 2026-10-21):** die Bühne steht im `conversation.composer.dock` (`id: shinon-encounter-stage`) und hält **keinen** zweiten Zustand: was `reduceEncounter` zurückgibt, ist der Zustand, und jedes Ereignis geht durch ihn. Weil das Bundle `assets/` nicht importieren kann, liegt der Kern als **generierter** Block in `client.js` (`scripts/assets/build-encounter-client.mjs`, Kommentare gestrichen, Code zeichengleich; `--check` und `test/encounter-client.test.mjs` vergleichen Block und Verhalten beider Fassungen). Bedienung: ein sichtbarer Leerzustand mit „Zug starten“, ein **Übungszug** aus 14 Vertragsereignissen (650 ms je Schritt, ausdrücklich als lokal erzeugt gekennzeichnet), „Abbrechen“ und „Neu“. Der Playtest hat eine **Vertragslücke** gefunden und geschlossen: ein Terminal wusste nicht, *wo* es endete — `state.lastPhase` trägt jetzt den Zustand, aus dem der letzte Wechsel kam, damit die Vier-Stufen-Schiene einen Abbruch im Vorflug nicht als Prüfungsabbruch verkauft; zwei weitere Befunde (Doppelklick startete einen zweiten Zug mit fremder `turnId`; „1 Ereignisse“/`Pruefung` in der Oberfläche) sind behoben und getestet. Belegt mit `npm run test:codingmon` (124/124), `npm test` Exit 0, `npm run build` Exit 0 und einem Playtest durch das echte Bündel in Chromium (Screenshots und Messungen in `docs/probes/encounter-stage.json`). **Offen:** echte Host-Signale (der Übungszug ist kein Modell-Turn), das Rendern im echten DSH-Dock (React, Layout, 60 fps) und damit die Live-Abnahme am Dev-Server.
- **Pre-Flight-Deck (S6 / B04, 2026-10-21):** das Deck steht im Vorflug als Teil der Bühne und zeigt die sieben Angaben aus B04 aus dem **Reducer-Zustand** — Aufgabe, Tendenz, Konflikte, Fakten (plus Quellen), Route, Budget und die Wissensblöcke. Wo der Vertrag heute keine Quelle hat (Tendenz, Konflikte, Faktenquellen, Budget), steht sichtbar „nicht gemeldet“/„nicht gemessen“; es wird keine Zahl erfunden. Das Eingriffsfenster öffnet mit `preflight.ready` und schließt nach 2 s (Default-Pfad, unveränderte Auswahl) oder per „Lauf starten“. Blockwahl ist ein `encounter.block.selected` durch den Reducer; nach `run.started` ist sie eingefroren, das Deck sagt „Änderungen zu spät“ und der Schalter ist `disabled`. Die Route steht jetzt **vor** dem Ready im Ereignisstrom, damit das Deck sie vor dem Lauf zeigt. Belegt mit `npm run test:codingmon` (130/130), `npm test`, `npm run build`, `npm run gate:full` und einem Playtest durch das echte Bündel in Chromium (Deck-Text, Klick auf den Block-Schalter, Einfrieren, Timeout-Pfad, Neuladen im offenen Fenster, 340 px ohne Überlauf; Screenshots in `docs/probes/preflight-deck.json`). **B04 bleibt offen:** der Deck-Slice belegt die Anzeige und die Bedienung, nicht den Request-Diff, die Tokenkosten des Preview-Schritts oder einen Modellaufruf vor/nach dem Fenster — dafür fehlt die Prompter-Anbindung, und der Übungszug ist kein Modell-Turn.
- **Live-Modellkatalog (2026-10-21):** der Key-Router liest den Katalog beim Start aus dem Anbieter statt aus dem Profil (`fetchCatalog` in `assets/pool-core.js`, Quellen in `Config.catalogProviders`, oeffentliche Listen ohne `Authorization`). Gemessen im echten Boot: `Katalog openrouter: 469 Modelle live (0 statisch)`; derselbe Abruf direkt ergibt 469 Eintraege. Die statische Liste bleibt als `declared` daneben stehen, der Status nennt `live`/`declared`/`source` und im Fehlerfall den Grund (kein Schluessel im Text). Offen: Agnes und Prompter antworten `HTTP 401`, weil der Router seine Pools aus den Startumgebungs-Schichten liest und `.env` die Namen leer fuehrt — der Weg vom DSH-Zugangsspeicher in den Pool fehlt (S12). Der DSH-Modellwaehler liest weiterhin das Settings-Dokument; der Router-Katalog ist die Antwort des Anbieters, keine zweite Schreibwahrheit. Beleg: `docs/probes/live-model-catalog.json`.
- **Pre-Flight-Deck im echten Turn (S6-Live, 2026-10-21):** der echte Dev-Server-Turn ist gemessen, die von B04 verlangte Kette aber **widerlegt**. Was traegt: der Start laedt den Schluessel selbst (gemeldet als Anwesenheit und Quelle, nie als Wert), ein Turn lief gegen den echten Anbieter, und die Buehne steht im echten Composer-Dock, sobald eine Sitzung existiert. Was fehlt, an drei Stellen: (a) vor der Inferenz liegt **kein** Preview — der One-Shot-Prompter ruft in `agent/pre-step` ein Modell auf und laeuft vor dem Haupt-Request; das Deck ist nur im Uebungszug sichtbar. (b) `encounterToggleBlock` endet im lokalen Reducer; die Auswahl verlaesst den Browser nicht, es gibt keinen Host-Dienst und keine Persistenz. (c) `blockSelection` ruft `selectBlocks` ohne `includeIds` auf, der Prompter liest also keine Deck-Auswahl. Ein Request-Diff ist damit strukturell unmoeglich. **Nebenbefund Modellliste:** `agnes` traegt eine statische Liste, `openrouter` nur `apiKeyEnv` ohne baseURL/Modelle; der pi-ai-Adapter liefert `listModels()` aus dem Settings-Dokument und verwirft katalogseitige Dynamic-Refresh. Live-Discovery existiert nur als Schreiboperation der Models-Seite. Beleg: `docs/probes/preflight-live.json`, Screenshot `docs/probes/s6-live-dock.png`. Offen: Preview-Gate vor dem One-Shot, Deck->Host-Naht, `includeIds` im Prompter, Live-Modell-Fetch.
- **Installationspakete** (v0.5.0, per Freeze §1.5 **kein** v0.4.0-Umfang): eine Nutzlast, zwei Hüllen — `.deb` für Linux Mint/Ubuntu (selbsttragend: Prod-Abhängigkeiten aus dem Lockfile + mitgelieferte Node-Laufzeit, `postinst` ohne Netz, **kein** `Depends: nodejs`) und ein Windows-ZIP (`shinon.cmd` portabel, `install.ps1` für PATH + Startmenü, `uninstall.ps1`). Gebaut wird in der CI (`.github/workflows/package-build.yml`: Linux- und Windows-Bauhost getrennt, weil die Abhängigkeiten plattformgebunden sind), nicht auf der Entwickler-Maschine. Offen: der belegte Install-Nachweis auf einem echten Mint-System (die CI baut, ein Mensch installiert) und der Windows-Pendant-Nachweis; beides steht in `docs/probes/`.
- Live-429-Rotation gegen den echten Anbieter mit echten Schlüsseln (Kette bis zum Loopback-Draht ist belegt).
- Mobile-first-Prototyp: eigenes schlankes Mobile-Profil, responsive Client-Schicht, Profil-/UI-/Security-CI-Gates, validierte Android-Runtime-Strategie (Details aus dem gefalteten Mobile-Plan: zuerst Profil + Web-UI im Repo, App-Shell erst nach reproduzierbarem Android-Proof; kein globaler Paket-Cut vor Messung; Fremdvergleich `dsh-io/dsh-mobile` als Spike prüfen).
- `LAST_VERIFIED_FACT` (§19): Loop Guard / Progress Evaluator als alleiniger Produzent, Gate pinnt Ereignis, Produzent, Herkunft und fail-closed-Fälle. Produzenten-Regel wird im Wissens-Runtime-Plan (`docs/WISSENS-RUNTIME-PLAN.md`, Zug 4) als Fakt mit gepinntem Produzenten fortgeführt.
- Codingmon-Folge: Ereignis-Adapter an echten Lauf-Ereignissen (6.1/6.2-Rest), Kampfende am Agent-Ende (6.4).
- **CodingMon 50** (in `main` übernommen am 2026-10-21, aus `feat/codingmon-50-zucht-visual-gamification`): 50 Arten aus EINER kanonischen Quelle (`packages/codingmon/assets/data/codingmon-50.json`, gelesen nur über `assets/katalog.js`), Zucht mit verzweigter Nachkommenauswahl (D48), gedeckelte lineare Stat-Kurve mit Wechsel der Belohnung (D49), Snapshot-Schema v3 mit Roster und Eier-Ledger, Migration in `assets/migration.js`, Client-Spiegel im selbsttragenden Bündel. Die fünf Fangen des Zweigs sind am 2026-10-21 geschlossen und in `packages/codingmon/test/praesentation.test.mjs` festgenagelt (14 Zusagen): der Picker im Panel-Kopf waehlt eine Kreatur statt still nichts zu tun, das Hoechst-HP ist an Leiste, Arena und Kampf eine Zahl, die Konfiguration kennt kein Feld ohne Leser, der Spritespiegel faellt auf die Familie statt auf die erste Art, und der Praesentationszustand (`idle`/`combat`/`action`/`victory`/`defeat`/`flee`) ist abgeleitet statt gesetzt. **B09 ist seit demselben Tag geschlossen** (S3): jede der 50 Arten hat eine eigene Kunstdatei (`packages/codingmon/assets/art/<art>.svg`, aus dem CodingMon-50-ArtPack), der Generator `scripts/assets/build-sprites.mjs` schreibt sie mit art-eigenen Farb-IDs in das selbsttragende Bündel, und `packages/codingmon/test/sprites.test.mjs` prüft die Deckung gegen `codingmon-50.json` in beide Richtungen (keine Art ohne Datei, keine Datei ohne Art), die Eindeutigkeit der IDs im ganzen Bündel und dass jede Art auf `art:<art>` auflöst statt auf eine Familie. Der Gitter-Rückfall bleibt im Code und getestet, weil eine 51. Art ohne Bild sonst wieder auf einer fremden Figur landen würde; die 16-px-Marke bleibt Pixel art, weil eine 512er-Illustration bei 16 px zur Soße wird. Offen bis zur Abnahme: der visuelle Nachweis der Bühne im echten DSH-Browser (Animationsbudget, 60 fps) und ein Installationsnachweis auf einem echten System; die Engine-Seite ist mit `npm run test:codingmon` (seit S4: 107 Tests, Exit 0) belegt. Kein v0.4.0-Umfang.
- Bedienung ohne Doku (7.1), Lokalisierung ohne Fallback-Tabellen (7.2), QoL-Liste mit Status je Punkt (7.3, wartet auf die Nutzerliste), Design aus Token-Datei (7.4).
- Scoring-Folge: K8 Fakten-Store (Weg konkretisiert in `docs/WISSENS-RUNTIME-PLAN.md`, Züge 1–4 mit Probe je Zug; Konsolidierung, hartes Limit; Ablage liegt bereit), K7b taktische Skill-Erzeugung (Schreibweg bricht K4 — braucht Entscheidung; Ablage `generated-skills/` steht).
- **Urteilsschicht** (L2 des historischen Plans; Befund in `docs/VISION-ABGLEICH.md` §3 A): der Fakten-Store aus K8 ist die untere Hälfte — es fehlt das Organ, das daraus ein **Urteil** macht. Abnahme: eine Behauptung überquert eine Paketgrenze, ihr Status hebt sich von `unverified` auf `supported` ohne menschliche Bestätigung, ein `CONFLICT` erscheint im Snapshot **und verweigert die Aktion**.
- **Zwei DoD-Punkte, die in keiner offenen Liste standen** (Befund `docs/VISION-ABGLEICH.md` §3 F): Capability Router (Phase 8 — alternative Fähigkeitspfade nach Priorität auflösen) und Browser Vision (Phase 9, `packages/vision-fallback/`). Sie stehen hier, damit sie nicht verschwinden; **keine Zusagen** — was landet, entscheidet der Betreiber.
- `profiles/`-Umbau auf Code-Konfiguration (3.6) — nur wenn ein fremder Boot daraus liest/schreibt; derzeit angehalten.
- Overlay-MVP (3.8) — blockiert, bis die drei Upstream-Punkte entschieden sind (Slot-Definition, Launcher-only-Patch, Remote-Listen-Extensibilität).
- Onboarding (Eignerentscheidung): keine fest verdrahteten Modell-/Provider-Defaults — der Nutzer entscheidet beim Einstieg, ob der Prompter dasselbe Modell und denselben Schlüssel nutzt oder eigene; Anker ist die DSH-seitige API-Key-Abfrage beim First-Start.
- Persona-Einstieg teilen (Voraussetzung, nicht der Schnitt): `packages/persona/index.js`
  hält 1500 Zeilen und 18 `let`-Bindungen in EINEM `apply`-Closure — der Prompter-Schnitt
  (2026-10-20) ging, weil dort schon ein `runtime`-Objekt der alleinige Zustand war. Hier
  steht zuerst der Zustands-Eigentümer auf dem Programm; erst danach dieselbe Teilung.
  Danach die **Eigentümerfrage**: heute steuert die Haltung das Verhalten
  (`packages/prompter/assets/pre-step.js` liest sie aus dem Scoring), und die Persona liest
  denselben Dienst nur — ob die Persona den Zustand besitzt oder nur darstellt, ist eine
  Betreiberentscheidung (Befund `docs/VISION-ABGLEICH.md` §3 B).
- Architektur-Folge aus dem Audit: Workspace-Twin zusammenlegen (C3), Prompt-Schichten zu einem Assembler (C4), `preset shinon` statt `cordis`, Katalog-Snapshot statt Einzelprüfungen (P2).
- Vendor-Baum zu Hash-Manifest verdichten (B5); `.session-eval/`-Zweck klären (B7-Rest; K5-Offenpunkte aus dem Report: Scope-Erkennung, Fehler-Turn-Signal, K7a-Kopplung — siehe Archiv).

### 2.25 Refactor-Plan vom 2026-10-23 (offen — Etappen 0–3 sind belegt)

Die Etappen 0–3 des freigegebenen Plans sind mit `7d8229b` umgesetzt und belegt:
Baseline, Testbahnen/CI, Prompt-Ressourcen samt Vorgabedaten und der aus zehn
Fragmenten generierte Profilpatch. Offen sind die folgenden Etappen; jede Zeile
nennt ihre Abnahme, und keine gilt ohne Exit-Code und benannten Lauf.

- **Etappe 4 — Host-Monolithen teilen:** `scripts/lib/repo.mjs` (Fassade plus
  Eigentümer-Module, identische Exportnamen), `scripts/install-user.mjs`,
  `packages/persona/index.js` (Zustand als `assets/persona-runtime-state.js`,
  danach `apply`) und `packages/task-router/index.js` (§16 als
  `assets/decision-core.js`, §18 als `assets/micro-state.js`) sind **belegt
  geteilt** (`521421b`, `docs/TAGEBUCH.md` 2026-10-23). **Offen bleibt allein die
  Entscheidung zu `packages/scoring/index.js`:** 540 Zeilen liegen unter der
  550er-Grenze der Klasse, ein Schnitt wäre nur ehrlich, wenn zwei Eigentümer
  drinstecken — heute trägt `apply` die Ablage, das Lernen, den Ton und die
  Gewichte als einen Zustand. Ein Schnitt dort braucht zuerst den Nachweis, dass
  es zwei Zustände sind, nicht zwei Abschnitte.
  Abnahme: `scripts/gate/tests/source-scan.test.mjs` und die Paket-Suiten ohne
  verlorenen Export; `npm test` Exit 0; jede Datei unter ihrer Klassengrenze.
- **Etappe 5 — Client-Quellen:** die handgespiegelten Client-Blöcke (Codingmon,
  Encounter, Zucht) auf Quellfragmente plus Generator umstellen; `--check` muss
  bytegleich sein, und der jeweilige Client-Test muss die erzeugte Fassung fahren.
  Abnahme: `node scripts/assets/build-*.mjs --check` Exit 0, `npm run test:codingmon`
  Exit 0.
- **Etappe 6 — Gate-Tests nach Fachbereich:** die großen Dateien
  (`client-activation`, `context-wiring`, `scoring`, `persona`) entlang ihrer
  Eigentümer teilen, ohne eine Zusage zu verlieren; jede neue Datei gehört genau
  einer Bahn in `scripts/gate/test-lanes.json`.
  Abnahme: `npm run gate:test` grün mit unveränderter Testzahl, `npm run gate:test:slow`
  grün.
- **Etappe 7 — Rest der Funktionslücken:** Tooltip- und Narrative-Client prüfen,
  `selection.js` verdrahten oder entfernen (T3-5), `skill-registry-core.js`
  entscheiden, die vier Constructor-/Vertragsstellen aus dem Audit schließen.
  Abnahme: je Lücke ein Gate-Test mit einer Mutation, die rot wird.
- **Etappe 8 — restliche Audit-Tiers:** die offenen Zeilen aus
  `docs/CLEANREPO-AUDIT.md` §8.1 abarbeiten (u. a. T2-6, T2-7, T3-0, T3-5, T3-6)
  und die Audit-Tabelle auf den gemessenen Stand ziehen.
  Abnahme: `npm run gate:test` Exit 0, `npm test` Exit 0, Audit-Zeile mit Beleg.

### 2.26 Befunde aus der Fremdprojekt-Sitzung `session-04a3db92` (2026-10-23, offen)

Gemessen an einer echten Sitzung im Fremdprojekt `codingmon-workspace`
(Preset `shinon`, Route `openrouter`/`nvidia/nemotron-3.5-super-vl:free`):

- **Erledigt (dieser Stand):** fremde `AGENTS.md` als `<system-reminder>` im
  Prompt und zwei englische System-Sätze vor der deutschen Persona. Antwort:
  `SHINON.md` als einzige Anweisungsdatei (Profilfragment
  `15-anweisungen.yml`, Pflichtblock im Runtime-Context), englische
  Harness-Identität aus, deutscher `personaPrefix`.
  Abnahme: `scripts/gate/tests/shinon-md.test.mjs` 9/9, Profil-Dump zeigt
  `includeHarnessIdentity: false` und `instructionFileCandidates: [SHINON.md]`.
- **Offen — Client-Panels ohne Workspace-Schranke:** Persona-Abschnitte sind
  pro Sitzung am Workspace gated (belegt), aber die Browser-Panels
  (CodingMon-Workbench u. a.) montieren unterschiedslos in jeder Sitzung.
  Abnahme: ein Gate-Test, der im Fremdprojekt keine Shinon-Panels montiert
  sieht — plus die Architektur-Entscheidung, woher der Client den
  Sitzungs-Workspace kennt.
- **Offen — veredelte Nachricht als Nutzertext:** der angenommene One-Shot
  ersetzt die Nutzernachricht durch die veredelte Fassung (`replacePrompt`);
  im Transkript steht dann der Prompter-Text als eigene Nachricht. Vertraglich
  korrekt, aber überraschend. Abnahme: Kennzeichnung ersetzter Nachrichten
  oder ein Schalter `alwaysEnhance` je Sitzung — mit gepinntem Vertragstest.
- **Offen — Laufzeit kleiner Aufgaben:** Turn 3 brauchte ~10 Minuten für 12
  Schritte bei 50 Tool-Aufrufen (Repo-Analyse durchs Modell). Kein Code-Befund
  — der Index antwortet in Millisekunden; die Zeit liegt im Modell und den
  Werkzeugrunden. Abnahme: Messung mit Token-/Zeit-Budget je Turn, kein Gefühl.

### 2.27 Trennung forge_DEV / Shinon-forge (2026-10-23, erledigt mit Folgepunkt)

- **Erledigt (dieser Stand):** `isShinonProjectAt` und das `isInside`-Gatter sind
  ersatzlos gestrichen — die Persoenlichkeit ist global (jede zugewiesene Sitzung
  bekommt sie: Haltung, Ton, Beziehung, Erinnerungen, Live-Block, Ablauf), der
  Projekt-Kontext bleibt je Workspace (Datei, projektspezifische Erinnerungen und
  Auflagen per `scopeOfProposal`, Selbstmodell je Root). `SHINON.md` ist Vorlage
  (`SHINON.md.example`, keine Anweisung); `.commit-msg.tmp` ent-trackt;
  Auslastungs-Werkzeug nach `scripts/dev/` verlagert; stehende Regel in
  `AGENTS.md` („Identität — forge_DEV und Shinon-forge“).
  Abnahme: `persona-state.test.mjs` 46/46, `persona-prompt.test.mjs` 19/19,
  `persona-live-context.test.mjs` 5/5, neuer Bereichs-Test in
  `persona-memory.test.mjs`, `npm test` Exit 0 (131 Schritte), `gate:test`
  908/908, `zahlen:check` Exit 0.
- **Offen — Wissens-Runtime mit Forge-Pfaden:** `authorityRank`/`deriveChecks`
  (`packages/project-index/assets/facts-reconcile.js`) kennen den Forge-Baum als
  Literal (`docs/contracts/`, `packages/`, `scripts/`, `bin/`, `profiles/`).
  Abnahme: Tabelle als Daten (Vertrag, additiv), Aufrufer übergibt sie; kein
  Forge-Pfad als Literal im Produkt — mit gepinntem Verhaltenstest.

### 2.28 Orchestrator-Etappen 2–5 (2026-10-23, erledigt)

Der Turn-Vertrag (`shinon.turn/v1`), die Umstellung aller Host-Hälften auf
den Orchestrator, die Datei-Teilungen (Etappe 3) und seit diesem Stand auch die
Client-Montage samt Vertrags-Flip (Etappen 4–5) sind belegt; das Gate ist
scharf, und jede Zeile nennt ihre Abnahme.

- **Etappe 4 — Client-Montage (erledigt):** `scripts/lib/embed-blocks.mjs` ist
der gemeinsame Block-Leser/-Schreiber (vorher trug `build-sprites.mjs` seine
eigene Kopie), `scripts/assets/split-client.mjs` zerlegt ein Handbundle
**einmalig** an Deklarationen der obersten Ebene, und `scripts/build-client.mjs`
setzt die Hälften aus `packages/<dir>/assets/client/*.js` zusammen. Acht
Bundles sind umgestellt (codingmon 3 523 Zeilen in 17 Teilen, markers 638/4,
token-usage 583/3, traceability 548/3, dashboard 487/3, popup 423/3, core
418/3, prompter 289/2 — zusammen 38 Teile, Median 179, Maximum 514); die
`GENERIERT aus …`-Kopfmarke steht in genau diesen acht Dateien. Die Einbetter
(`build-sprites --embed`, `build-codingmon --write`,
`build-encounter-client`) schreiben in die QUELLTEILE und finden ihren Block per
`findBlockFile`, nicht über einen verdrahteten Dateinamen.
Abnahme: `node scripts/build-client.mjs --check --all` Exit 0 (8/8
bytegleich), `npm run test:codingmon` 137/137 (17,0 s), `npm run build` Exit 0
(23 Pakete, 317 Dateien).
- **Etappe 5 — Vertrags-Flip (erledigt):** `bestand` und `bestandAusnahmen`
sind aus `docs/contracts/structure.json` gelöscht, jede Klasse behält ihre
gemessene Grenze, die neue Klasse `client-source` (600) trägt die Quellteile.
Die zwei Regeltexte stehen in `AGENTS.md`: „keine handgeschriebene Datei über
ihrer Klassengrenze“ (ein GENERIERTER Text ist frei, weil seine Grenze die
Bytegleichheit ist) und „Bus und Datenübergabe über den Orchestrator,
Turn-Reihenfolge aus `shinon.turn/v1`“. Ein GENERIERTER Kopf befreit nur im
Kopfkommentar und nur die Client-Hälfte — jede andere Klasse mit der Marke ist
ein Befund, weil dort kein Generator sie bytegleich nachrechnen könnte.
Abnahme: `npm test` Exit 0 (127 Schritte), `npm run zahlen:sync` und
`zahlen:check` Exit 0, `npm run build` Exit 0, `npm run test:full` Exit 0.
- **Nachbesserung aus dem Review (erledigt):** der Review fand drei echte
Fehler, alle mit Test gepinnt. (a) `split-client.mjs` schnitt mitten durch
generierte Blöcke — der Encounter-Kern lag quer über zwei Teile, und der erste
Generatorlauf verschluckte die Teile-Marken; der Splitter sperrt jetzt JEDE
Markenfamilie (`// >>> …`/`// <<< …`, `// #region`) und bricht bei
unbalancierten Marken ab. (b) `build-sprites.mjs` schrieb in einen verdrahteten
Teilenamen (`10-daten.js`), den es nicht gibt — die Einbetter suchen ihren
Block jetzt (`findBlockFile`, genau ein Treffer). (c) die GENERIERT-Marke galt
für jede Datei in den ersten 40 Zeilen, also auch für einen Testfixtur-String,
und befreite damit eine beliebige große Datei von der Grenze; sie gilt jetzt
nur im Kopfkommentar und nur für die Client-Hälfte. Geschützt durch
`scripts/gate/tests/client-montage.test.mjs` (11 Fälle: Echtbaum,
Miniatur-Baum, verschluckende Marke, unbalancierter Split) und
`scripts/gate/tests/structure.test.mjs` (14 Fälle).
- **Weiterhin offen:** Etappe 6 (Gate-Tests nach Fachbereich — mit Etappe 3
erledigt, siehe `docs/CHANGELOG.md`), Etappe 7 (Rest der Funktionslücken) und
Etappe 8 (restliche Audit-Tiers aus `docs/CLEANREPO-AUDIT.md` §8.1).

### 2.3 Zurückgestellt (gated — wird erst bei erfüllter Bedingung gebaut)

- Benchmarks und Metriken (4.1–4.6): Aufgaben-Set, DSH-Baseline, Shinon-Messung, Feature-Entscheidung mit Messwert.
- Desktop (5.1–5.3, A10): Tauri-Shell, Shell-Protokoll, Single-Binary — Stufe 1 (`npm run open`) ist scharf; der Rest wartet auf die Engine-Messung und die A10-Entscheidung (Electron vs. Tauri vs. TUI).
- Engine-Port (8.1–8.4): nur bei positivem 4.1-Befund und eingefrorenen Verträgen.
- Commit `487c559`-Bewertung: gegenstandslos — der Stand ist committet und gemessen (siehe `docs/TAGEBUCH.md`, 2026-10-10); ein Verdikt über einen Arbeitsbaum von 2026-10-10 baut nichts mehr.

## 3. `1.0.0`-Kriterien

`1.0.0` heißt: jedes Profil-Paket ist ausgeliefert (kein `dsh.inactive` ohne
begründetes Verdikt), der Task-Router ist per H5 entschieden, die
Live-Verifikation 3.9 ist grün belegt, und die Branch-Regel im Wächter
(`scripts/commit-guard.mjs`) ist scharf — nicht nur gebaut.

## 4. Was kein Release ist

Kein einzelner Commit, keine grüne Momentaufnahme ohne Run-ID, keine Doku ohne
Messbefehl. Wer eine Fassung behauptet, nennt Commit-SHA, CI-Run-ID und den
lokalen Gate-Exit — alles andere ist ein Wunsch mit Versionsnummer.
