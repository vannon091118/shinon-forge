# Zahlen — Shinon Forge

> **Status:** current — **einziger Eigentümer** aller harten Zahlen dieses Repos. **Stand:** 2026-10-12
> **Einstieg:** `docs/INDEX.md` · gemessen mit Node v22.23.3 und npm 10.9.9 (einzige Paketquelle seit Schritt 3.5), dsh `0.2.1-alpha.1` (Repo, zuerst im PATH)

Regel: **Kein anderes Dokument nennt eine dieser Zahlen.** README, `AGENTS.md` und
`docs/ARCHITECTURE.md` verweisen hierher. Wer eine Zahl ändert, ändert sie hier und
führt den genannten Befehl aus; wer eine Zahl zitiert, zitiert diese Tabelle.

Jede Zeile ist gemessen, nicht aus älteren
Dokumenten übernommen; §1 und die Zeilen, die der Durchgang vom 2026-10-11 bewegt hat,
tragen dessen Messung (Nachweis: [docs/audit/UMBAU_2026-10-11.md](audit/UMBAU_2026-10-11.md)). Was in diesem Durchlauf **repariert** wurde, steht mit
Vorher/Nachher-Messung in §2; was rot geblieben ist, in §3.

**Umfang:** Diese Tabelle besitzt die Zahlen, die den **Zustand dieses Repos**
beschreiben (Bestand, Prüfläufe, Versionen, Verweise). Zahlen über **fremde** Dinge —
Fassungen der DSH-Installation, Einträge in fremden Paketen, Parameter eines Testkorpus —
gehören zur jeweiligen Aussage und nicht hierher; sie werden an der Stelle genannt, an
der sie gemessen wurden.

## 1. Bestand

| Zahl | Wert | Befehl (Eigentümer) | Exit |
|---|---|---|---|
| Pakete unter `packages/` | **20** (die Zeile war um ein Paket veraltet — `packages/scoring` ist hinzugekommen; nachgemessen am 2026-10-11 mit dem genannten Befehl) | `ls packages \| wc -l` | 0 |
| Profile unter `profiles/` | **2** (`shinon`, `headless`; `web` am 2026-10-11 nach `docs/archive/legacy-profiles/web/` archiviert — ein Laufzeitrest `profiles/web/.plugin-manager/` liegt noch untracked da) | `git ls-files profiles \| cut -d/ -f2 \| sort -u \| wc -l` | 0 |
| Bundle-Layer im Profil `shinon` | **21** (am 2026-10-12 nachgemessen; die Zeile stand auf 20 — `@shinon/narrative` ist mit Zug 5 AKTIV geworden), vorher am 2026-10-11 mit 20 gemessen; die Zeile hat sich am 2026-10-11 dreimal bewegt: `dsh-experimental-schedule-bundle` entfernt (nicht installiert, in keiner Lock-Datei, kein `# == `-Kopf im Dump — die Ebene konnte sich nicht auflösen, Schritt 2.4), `dsh-experimental-voice-input-bundle` entfernt (der **einzige** First-Use-Download, A4/C7, Schritt 3.1 — Begründung: [docs/audit/DSH_SUBSET_3-1.md](audit/DSH_SUBSET_3-1.md) §5), danach `dsh-experimental-inspector-profile` **hinzugefügt** (nicht in diesem Durchgang; ein zweiter Schreiber hat die Zeile am 2026-10-11 um 01:18 gesetzt — Verdikt offen, §7 desselben Dokuments) | `node -p "require('./profiles/shinon/package.json').dsh.profile.bundles.length"` | 0 |
| davon eigene (`@shinon/*`) | **16** (am 2026-10-12 nachgemessen: `@shinon/narrative` ist dazugekommen; die Zeile stand auf 15) | `node -p "require('./profiles/shinon/package.json').dsh.profile.bundles.filter(b=>b.startsWith('@shinon/')).length"` | 0 |
| davon fremde | **5** (`@deepseek-ai/dsh-base`, `dsh-web-app`, `dsh-experimental-auto-review`, `dsh-experimental-agent-team-profile`, `dsh-experimental-inspector-profile`) | dieselbe Liste | 0 |
| Vendorte Dateien unter `vendor/` | **22** (20 Paketdateien aus `@deepseek-ai/dsh@0.2.1-alpha.2` + `MANIFEST.json` + `MODIFICATIONS.md`; Herkunft und `sha256` je Datei: [vendor/dsh/MANIFEST.json](vendor/dsh/MANIFEST.json)) | `find vendor -type f \| wc -l` | 0 |
| Pakete **nicht** im Profil | **4** (`key-router`, `openapi`, `popup`, `shinon-forge`) — am 2026-10-12 nachgemessen; `narrative` ist aus der Liste heraus (Zug 5 aktiviert es, `dsh.inactive` ist aus dem Manifest entfernt). Die vier erklären ihre Zurückstellung selbst (`"dsh": { "inactive": true }` im eigenen Manifest, gelesen von `dead-package`) | `ls packages` gegen die Liste oben | 0 |
| Version des Repos | **0.2.0** | `node -p "require('./package.json').version"` | 0 |
| Paketversionen | **18× `1.0.0`, 2× `0.1.0`** (am 2026-10-12 nachgemessen; `0.1.0`: `key-router`, `shinon-forge` — `narrative` führt mit der Aktivierung `1.0.0`) — verteilt **ohne** zentrale Liste: die Zeile folgt aus dem eigenen Manifest (`dsh.inactive` darf `0.1.0` führen, sonst `1.0.0`; Regel im `doctor`) | `node -e "for (const d of require('fs').readdirSync('packages')) console.log(require('./packages/'+d+'/package.json').version)"` | 0 |
| DSH installiert | **0.2.0-rc.2** | `dsh --version` | 0 |
| DSH-Pin im Root-Manifest | **0.2.1-alpha.1** | `node -p "require('./package.json').dependencies['@deepseek-ai/dsh']"` | 0 |
| Schemastery (deklariert) | `~3.18.4` | `node -p "require('./package.json').dependencies['@deepseek-ai/schemastery']"` | 0 |
| Node | `^22.19.0 \|\| >=24.0.0` (Paketmanager: **npm**, kein `packageManager`-Feld mehr) | `node -p "JSON.stringify(require('./package.json').engines)"` | 0 |
| pnpm-Dateien im Baum | **0** (am 2026-10-11 gelöscht: `pnpm-workspace.yaml`, `profiles/{shinon,headless}/{pnpm-workspace,pnpm-lock}.yaml`, das `pnpm-workspace.yaml` des archivierten `web`-Profils). Geprüft wird seit dem 2026-10-11 vom Gate gegen die zwei Artefaktnamen, nicht per `grep pnpm`: ein `pnpm-workspace.yaml`, das UPSTREAMs `initProfile` bei `dsh plugin add` selbst anlegt, macht `npm test` rot | `node scripts/dsh-test.mjs` (Prüfung „pnpm-Reste") | 0 |
| pnpm-**Aufrufe** im Code | **0** (A1; die zwei echten Aufrufe — `pnpm install` in `dsh-profile-test.mjs`, `pnpm pack` in `pack-test.mjs` — sind durch npm ersetzt). Nennungen: **21** in `scripts/` — Kommentare, Meldungstexte und die Mustertabelle der Prüfung selbst; ein *Wort* ist kein Befund, ein Prozess-/Script-Aufruf schon | Aufrufe: Gate-Prüfung „pnpm-Reste" (`node scripts/dsh-test.mjs`); Nennungen: `git grep -c -i pnpm -- scripts` | 0 |
| Markdown-Dokumente im Baum | **54** (am 2026-10-12 nachgemessen: `generated-skills/README.md` ist dazugekommen; davon 6 unter `.agents/skills/`, 3 unter `vendor/` — die zwei fremden READMEs des vendorten Pakets und unser Änderungslog —; enthält die 16 Nachweis-Dokumente unter `docs/audit/`) | `find . -name '*.md' -not -path './node_modules/*' -not -path './attachments/*' -not -path './dist/*' \| wc -l` | 0 |
| Verträge unter `docs/contracts/` | **6** | `ls docs/contracts \| wc -l` | 0 |
| Proben unter `docs/probes/` | **28** (die Zeile stand auf 27; die Messung der Ablage-Kosten kam als `store-cost.json` hinzu) | `ls docs/probes \| wc -l` | 0 |
| Generierte Plugin-Bausteine (Idiome) | **12** Blöcke in **11** Dateien, **0** handgepflegte Kopien (eine Quelle: `scripts/lib/plugin-idioms.mjs`; die Werte je Block stehen in der Startmarke der Datei, nicht in einer Tabelle im Gate) | `npm run idioms:check` | 0 |
| Verweise in Markdown, die nicht auflösen | **0** (**665** Verweise geprüft (am 2026-10-12 nachgemessen; die Zeile stand auf 659 — die Zettel-Doku und die Konzept-Abschnitte kamen hinzu) — seit dem Doku-Zug sieht der Lauf `docs/`, `packages/` und `vendor/`) | Prüfbefehl in `docs/INDEX.md` §4 | 0 |

Die Zahl der Profil-Layer und der aktivierten Pakete **steht nicht in der Doku**,
sondern in `profiles/shinon/package.json` (`dsh.profile.bundles`); die Befehle oben
lesen genau diese Datei.

## 2. Prüfläufe (Ist-Zustand 2026-10-11; Zeilen ohne neuen Lauf tragen den Stand 2026-10-10)

| Lauf | Ergebnis | Exit | Befehl |
|---|---|---|---|
| Gate (statisch) | 105 bestanden, **0** fehlgeschlagen (am 2026-10-11 um fuenf Prüfungen der Signaltabelle gewachsen) | 0 | `node scripts/dsh-test.mjs` |
| Regel-Fixtures | 9 bestanden, **0** fehlgeschlagen | 0 | `node scripts/validate-test.mjs` |
| Profiltest | 3 bestanden, **0** fehlgeschlagen (21 Layer, 16 Repo-Bundles; am 2026-10-12 nachgemessen — die Zeile stand auf 20/15) | 0 | `node scripts/dsh-profile-test.mjs` |
| Profil-Konfiguration im echten Dump | 55 Layer-Köpfe / 205 Einträge (Repo-`dsh@0.2.1-alpha.1` zuerst im PATH; das globale `0.2.0-rc.2` liefert dieselben Köpfe, aber 201 Einträge — Fassungsfalle, [docs/audit/DSH_SUBSET_3-1.md](audit/DSH_SUBSET_3-1.md) §6), `shinon-task-router.activate: false`, `permission.defaultPreset: workspace-write` (Preset `workspace-write: {sandbox: workspace-write, approval: ask}`), `agent-default-model: agnes/agnes-2.5-flash`, `ui-settings-general.welcomeNoticeVersion: 2026-09-28.1` (als String gelesen) | 0 | `DSH_HOME=$PWD dsh --profile shinon --dump-config` |
| Spike Produktprofil `resolvedProfile` (Schritt 3.3) | **11** Zusagen, **11** grün (3 Bündel gelöst und gemountet, `fiber.state === 2`, `profileContext.dir` = Spike-Verzeichnis, kein Schlüsselwert in der Ausgabe) | 0 | `node scripts/spike-resolved-profile.mjs` (Repo-`dsh` zuerst im PATH) |
| Frischer Klon: `npm install` + `npm start` (Schritt 3.4) | **731** Pakete installiert, Start **ohne** `dsh` im PATH (`command -v dsh` → NEIN), Herkunft `Repo-Installat`, dsh `0.2.1-alpha.1` | 0 | in einer Arbeitsbaum-Kopie ohne `node_modules`/`dist`/`logs`: `npm install`, dann `env -i … npm start -- --check` |
| Frischer Klon ohne pnpm-Spuren (Schritt 3.5) | **0** pnpm-Dateien im Klon, kein `packageManager`-Feld, **731** Pakete, Lockfile nach dem Install **byteidentisch** zum getrackten, `npm start -- --check` grün (`pnpm` und `dsh` nicht im PATH) | 0 | in einer Arbeitsbaum-Kopie ohne `profiles/`: `npm install`, dann `env -i … npm start -- --check` |
| Vendoring `vendor/dsh` (Schritt 3.2) | **20** Dateien verglichen, **0** Abweichungen gegen das Registry-Tarball (Dateiliste und `sha256` je Datei identisch; Manifest: [vendor/dsh/MANIFEST.json](vendor/dsh/MANIFEST.json)) | 0 | `npm pack @deepseek-ai/dsh@0.2.1-alpha.2` → entpacken → Datei-für-Datei-Vergleich |
| Distributionstest (jetzt `npm pack`, Schritt 3.5) | **80** bestanden, **0** fehlgeschlagen (20 Pakete × 4 Stufen) in **7,7 s** (Pool 6; der sequenzielle Lauf vor dem Umbau ≈ 22 s) | 0 | `node scripts/pack-test.mjs` |
| Build (`dist/`) | 20 Pakete, 158 Dateien, **1257599** Bytes (am 2026-10-12 nachgemessen; die Dateizahl wuchs um 5 — `narrative-core.js`, die verlängerte Vertragsdatei und die neuen `assets/`-Dateien der Zettel) | 0 | `npm run build` |
| **Skalierungslauf** (Kopie des Baums + **20** neue Pakete = 39, alle selbst als `dsh.inactive` erklärt): Idiom-Schreiber → statisches Gate → Gate-Engine `--full` → Gate-Tests → Distributionstest → Build | **6 von 6** Stufen grün — Gate **200** bestanden/0, `gate:full` 18 grün/0, Gate-Tests **328**/0, Distribution **156**/0, Build 39 Pakete/196 Dateien; Dauer ≈ 98 s | 0 | `npm run scale:check` (Nachweis: [docs/audit/SKALIERUNG_2026-10-11.md](audit/SKALIERUNG_2026-10-11.md)) |
| Gate-Engine `--full` | **19** Gates gelaufen, **19** grün, 0 fehlgeschlagen, 0 geskippt (am 2026-10-12 ueber **20** Paketen nachgemessen — dieselbe Gate-Zahl, ein Paket mehr im Baum: `@shinon/narrative` ist aktiv, `dead-package` bleibt grün); die Branding-Stufe meldet ohne Flag einen sichtbaren Skip, mit `--branding` läuft sie (siehe nächste Zeile) | 0 | `npm run gate:full` |
| Branding-Wirkung im echten Chromium | **28** bestanden, **0** fehlgeschlagen (ausgeliefertes `dist/packages/core/client.js`, `/usr/bin/google-chrome`) | 0 | `npm run branding` · `node scripts/gate/engine.mjs --full --branding` |
| Gate-Tests | **400** bestanden, 0 rot, 0 übersprungen (am 2026-10-12 um 40 Zusagen gewachsen: 4 des Tendenz-Vertrags und die Pflege der Mechanismen-Orte im `scoring`-Gate, 5 des Stand-Blocks im Abnahmetest des Veredlers, 8 der Zettel-Regeln und des Befehls, 4 der Tendenz in der Persona, 1 des Tons als schmale Faehigkeit — dazu die nachgezogenen Erwartungen an die Import-Kanten; die Zeile stand auf 360) | 0 | `node --test scripts/gate/tests/*.test.mjs` mit Node v22.23.3 und Repo-`dsh` (0.2.1-alpha.1) zuerst im PATH |
| Scoring-Tests (Kern + Signale + Ablage) | **42** bestanden, 0 rot, 0 übersprungen (am 2026-10-12 nachgemessen; die Zeile stand auf 32 — die Tendenz-Regeln kamen als eigene Datei hinzu) | 0 | `npm run test:scoring` |
| Prompter-Tests (Zettel-Kern) | **12** bestanden, **0** rot (Form, Thema-Marke, Auswahl-Reihenfolge, die drei Pruefungen, der gerenderte Stand) — ohne node_modules | 0 | `npm run test:prompter` |
| Narrative-Tests (Kern) | **9** bestanden, **0** rot (Mood-Tabelle statt Wuerfel, Erzaehler aus dem Ereignis, zweimal derselbe Strom = derselbe Composite, Arc-Wechsel an der Schwelle, Chronik ohne Uhr) — ohne node_modules | 0 | `npm run test:narrative` |
| Client-Aktivierung + Marke (Wache 1–3) | 6 bestanden, **0** rot | 0 | `node --test scripts/gate/tests/client-activation.test.mjs` |
| Client-Locale + `ctx`-Zugriff (Schritt 2.6) | 6 bestanden, **0** rot (3 Zusagen dieser Datei + 3 der Nachbarwachen im selben Lauf) | 0 | `node --test scripts/gate/tests/client-locale.test.mjs` |
| Codingmon-Tests | **46** bestanden, **0** rot, 0 übersprungen (am 2026-10-12 nachgemessen; die Zeile stand auf 32) | 0 | `npm run test:codingmon` |
| Marker-Tests | **27** bestanden, 0 rot (davon 6 für die Naht der wirksamen Grenzen, Schritt 2.3) | 0 | `node --test scripts/gate/tests/markers.test.mjs` |
| Events-Spine-Tests | 26 bestanden, 0 rot | 0 | `node --test scripts/gate/tests/events-spine.test.mjs` |
| Panel-Beleg gegen die laufende UI | 7 bestanden, **0** fehlgeschlagen | 0 | `node scripts/panel-check.mjs --url http://127.0.0.1:3085 --token <token>` |
| **Lebender Boot mit echtem Modell-Turn** (Zug 2, live, 2026-10-11) | `dsh --profile shinon` aus der CLI (Port **3099**, die 3080 war vom fremden Dev-Server belegt), echte Antwort von `agnes-3.0-flash` („bereit", 7 s, 18,2K Token); **Urteil** über die echte UI (`Good response` → Kategorie `Task result` → `Submit`) steht als Protokollzeile `signal=copy` in der SQLite des Projekt-Index; **Widerruf** über dieselbe UI nimmt genau diese Zeile zurück (Scorecard exakt zurück auf `0.53 / 0.515`); Host-Ende per SIGTERM; **nächster Host lädt den Stand** (`Stand geladen: 1 Signale, 1 offene Sitzungen, 0 Bemerkungen`) und schreibt weiter — ein dritter Host lud `3 Signale`, danach standen dort `5` | 0 | `DSH_HOME=$PWD dsh --profile shinon --no-open --port 3099` + Preview-Browser (Bedienung durch den Agenten) |
| **Kosten der Ablage bei vielen Signalen** (2026-10-11) | mit dem ECHTEN Dienst und dem ECHTEN Sammler: `writeMemory` 58,6 ms (10 Zeilen) -> 91,8-100,0 ms (1 000) -> 500,2-517,0 ms (20 000), ueber 1 000 Zeilen also **0,03 ms je Zeile**; ein Schreiben kostet ~291 ms Oeffnen — davon **306 ms in vier Metatransaktionen** — plus 34-126 ms Checkpoint plus den eigentlichen Schreibvorgang. Je Signal **571,3 ms** (n=10) / **793,8 ms** (n=100) / **652,6 ms** (n=1 000) im Neuschreiben — die Kosten wachsen NICHT mit dem Protokoll (96 -> 432 KiB) — gegen **46,8 / 54,7 / 48,0 ms** beim Anhaengen (12x/15x/14x). In der Ganzkette sind **99,6 %** (100 Signale) bzw. **98,6 %** (500 Signale) der Zeit die Ablage (48 261,5 von 48 470,1 ms bzw. 264 982,9 von 268 793,1 ms; dieselben Laeufe ohne Ablage 58,3 ms / 815,7 ms). Auf einer KOPIE der laufenden Datei (12 959 744 Bytes): 619-767 ms je `save`. ENTSCHEIDUNG: inkrementelles Anhaengen ist als Antwort auf die Zeilenzahl nicht noetig; der Hebel waere der feste Preis je Aufruf (gehaltener Index, Metaschreibungen nur bei Aenderung) | 0 | `node scripts/store-cost.mjs --signals 10,100,1000 --chain 100,500 --rows 10,100,1000,5000,20000` (Belege: [docs/probes/store-cost.json](probes/store-cost.json)) |
| Volle Kette (Schritt 3.5/3.7) | **durchgelaufen** — Codingmon-Tests 32/32 → Gate 100/0 → Fixtures 9/0 → Distribution 76/0 → Profiltest 3/0, unter einem PATH **ohne `pnpm` und ohne globales `dsh`** (`command -v pnpm` → NEIN, `command -v dsh` → NEIN; Node v22.23.3, npm 10.9.9, das Repo-`dsh` kommt aus `node_modules/.bin`). Unter Node v18 reißt dieselbe Kette an der Codingmon-Naht (`getRandomValues`) — Umgebungs-Rot, kein Code-Rot | 0 | `env -i … npm test` |

**Warum `gate:test` früher rot war und jetzt grün ist:** der Baum war unvollständig installiert —
`node_modules/@deepseek-ai/dsh` und `node_modules/@deepseek-ai/schemastery` fehlten auf oberster
Ebene (nur verschachtelte Kopien lagen vor), dazu 18 verschachtelte Pakete unter
`node_modules/@deepseek-ai/dsh/node_modules/` (alle im Lock verzeichnet). Vervollständigt am
2026-10-10 exakt nach Lock (`.ignored`-Kopie für `schemastery@3.18.4`, Registry-Tarballs für
`dsh@0.2.1-alpha.1` + 18 verschachtelte, alle versionsgeprüft) — kein Test, kein Lock, kein
Manifest angefasst. Voraussetzung für Grün (alle drei nötig, alle gemessen): Node ≥ 22
(`node:sqlite`, `parseEnv` — unter v18 stirbt schon der Import), `dsh@0.2.1-alpha.1` aus dem
Repo zuerst im PATH (vor einem fremden globalen `dsh`, sonst misst `message-ingress` die
falsche Fassung), vollständiger Lock-Baum. Unter der Standard-Shell (Node v18, ohne PATH)
bleibt der Lauf rot — das ist dann Umgebungs-Rot, kein Code-Rot.

**Volle Kette:** `npm test` führt Codingmon-Tests → Scoring-Tests (Kern + Signale) →
Gate → Fixtures → Distribution → Profil in dieser Reihenfolge aus (`package.json`) und lief in diesem Durchlauf
vollständig durch (Exit 0) — damit läuft auch `dsh-profile-test` innerhalb von
`npm test` mit.

### 2.1 Repariert in diesem Durchlauf (jeweils mit Vorher/Nachher-Messung)

| Befund | vorher | nachher | Beleg |
|---|---|---|---|
| `gate:test`: unvollständiger Lock-Baum (Top-Level `dsh` + `schemastery` fehlten, 18× `dsh/node_modules` fehlten), falsche Toolchain (Node v18, fremdes `dsh@0.2.0-rc.2` zuerst im PATH) | 150 bestanden, 7 Dateien rot, 5 übersprungen (162), Exit 1 | Baum lock-exakt vervollständigt, Lauf mit Node v22 + Repo-`dsh@0.2.1-alpha.1` zuerst im PATH: **306/306, Exit 0** (kein Test geändert) | `node --test scripts/gate/tests/*.test.mjs` |
| `doctor`: gehaltene Versionsaufteilung (`1.0.0`×16, `0.1.0`×3) als Befund gemeldet, obwohl erlaubt genannt | `gate:full` 17 grün, 1 rot, Exit 1 | zuerst als `EXPECTED_VERSIONS` deklariert (Standard + drei begründete Ausnahmen): `gate:full` 18 grün, Exit 0; undeklarierte Abweichungen weiter rot (5 Negativproben) — seit dem Skalierungslauf (Zeile darunter) **ohne** diese Liste, abgeleitet aus dem eigenen Manifest | `npm run gate:full` + isolierter `check()`-Nachweis |
| **Skalierung: drei zentrale Handlisten im Gate** — Idiom-Regionen (`host-half`/`client-half`), `KNOWN_INACTIVE` (`dead-package`), `EXPECTED_VERSIONS` (`doctor`); dazu Bestandszahlen in `plugin-idioms.test.mjs` und der lineare Distributionstest | mit 39 Paketen (20 neue, jedes vollständig konform): 60 + 5 + 1 Befunde, 3 Gate-Tests rot; Distributionstest 19 Pakete ≈ 22 s sequenziell | mit 39 Paketen: `node scripts/dsh-test.mjs` 200/0, `gate:full` 18/0, Gate-Tests 328/0, Distribution 156/0, `build` 39 Pakete — **je neuem Paket kein Eingriff außerhalb seines Ordners** (Ausnahme, genannt und nötig: eine Zeile im Wörterbuch von `@shinon/locale-de`, wenn das Paket einen Menü-Text zeigt); Distributionstest 39 Pakete in 13,5 s | `npm run scale:check` ([docs/audit/SKALIERUNG_2026-10-11.md](audit/SKALIERUNG_2026-10-11.md)) |
| `profiles/shinon/cordis.patch.yml`: `config:MAX` statt `config:` — die Datei war **kein gültiges YAML**, das Profil lud nicht | Gate `97 bestanden, 1 fehlgeschlagen`, Exit 1 | Gate `98 bestanden, 0 fehlgeschlagen`, Exit 0 | `node scripts/dsh-test.mjs` |
| [packages/shinon-forge](packages/shinon-forge) `index.js`: Ketten wie `.default(false).describe(...)` und `.optional()` — die deklarierte Schemastery-Fassung (`3.18.4`, §1) hat `description` statt `describe`, `required(false)` statt `optional`, und `default(...)` beendet die Kette | Distributionstest `75 bestanden, 1 fehlgeschlagen`, Exit 1 (`TypeError: z.boolean(...).default(...).describe is not a function`) | `76 bestanden, 0 fehlgeschlagen`, Exit 0 | `node scripts/pack-test.mjs` |
| [packages/core/client.js](packages/core/client.js): die WebP lag im Paket, wurde aber per `document.baseURI` adressiert — DSH liefert Plugin-Ressourcen aber nur unter `/plugins/<id>/client*.js` (`@deepseek-ai/dsh-client-modules`, `CLIENT_CHUNK`) | Browser: `GET /assets/persona.webp → 404`, `naturalWidth 0` | WebP als data-URI im self-contained Bundle: `naturalWidth 260 × 460`, kein 404 in der Netzwerkliste | Chromium gegen `dsh --profile shinon` + `node scripts/panel-check.mjs` |
| `key-router`, `narrative`, `shinon-forge` waren `git status`-untracked, standen aber im Root-`devDependencies`-Anspruch nicht — und fehlten dort wirklich | `doctor`: 4 Befunde (3× fehlende `devDependencies`, Drift) | eingecheckt; `doctor`: **1** Befund (nur Drift, §3.1) | `git status --porcelain`, `npm run gate:full` |
| [packages/core/client.js](packages/core/client.js): `@shinon/core` belegte `conversation.hero.workspace` — ein **Single-Slot**. Gemessen im Browser: der Slot enthielt danach nur noch `.shinon-bg`, der Vendor-Besetzer `WorkspacePicker` war verdrängt; der Klick auf „Choose workspace“ wechselte nur noch `aria-expanded` und öffnete **kein** Menü. Der Slot ist jetzt frei, das Branding hängt an `conversation.hero.brand.mark` (unserem eigenen Slot) | Slot-Inhalt: `div.shinon-bg` (kein Picker), Klick ohne Menü | Slot-Inhalt: Vendor-Picker; Klick öffnet `Default workspace`, `brutalord-the-feral-cycle`, `Shinon-forge`, `Add workspace…`, und `Add workspace…` öffnet den Host-Ordnerdialog (zenity auf `DISPLAY=:0`) | Chromium gegen `dsh --profile shinon` + Prozess-Beobachtung |
| [packages/scoring/index.js](packages/scoring/index.js): die Zeile über die Ablage fiel beim MOUNTEN und behauptete dort „kein Gedaechtnis … der Stand bleibt im Speicher" — obwohl der Index (der die Ablage bereitstellt) erst NACH dem Scoring mountet und derselbe Lauf danach in genau diese Ablage schrieb | im echten Boot stand Zeile 23 „kein Gedaechtnis", während Zeile 21 derselben Ausgabe „Ablage `shinon_index_store` bereitgestellt" meldete und das erste Urteil in der SQLite landete (Zeile vorher/nachher in [docs/probes/store-cost.json](probes/store-cost.json)) | die Zeile fällt jetzt, wenn die Frage **entschieden** ist: gefunden → sofort genannt; nicht gefunden → beim ersten echten Gebrauch (dort liegt der Blick hinter allen Mounts); ein Boot ohne ein einziges Signal nennt sie gar nicht. Gemessen im echten Boot: beim Mounten **0**× „kein Gedaechtnis", mit dem ersten Signal `Ablage: shinon_index_store (shinon.project-index/store-v1, Namensraum shinon.scoring/ledger-v1)` | `npm run test:scoring` **32/32** und `node --test scripts/gate/tests/scoring-memory.test.mjs scripts/gate/tests/context-wiring.test.mjs scripts/gate/tests/scoring-signals.test.mjs` **23/23** (kein Test geändert), dazu der Boot oben |
| Doku-Pfade auf das alte Verzeichnis packages/shion-forge (fünf Stellen) und auf die geplante, nicht existierende Datei starter/README.md (zwei Stellen) | Prüfbefehl aus `docs/INDEX.md` §4: 2 defekt | 0 defekt | Prüfbefehl in `docs/INDEX.md` §4 |
| [packages/core/client.js](packages/core/client.js): das Background-Branding (Persona-WebP) hing an `conversation.hero.brand.mark`. Der Slot wird aber INNEN in die **34px-Hitbox** der Hero-Zeile gerendert (`ui-conversation`, `HeroShell` — `renderSlot("conversation.hero.brand.mark", {size:34}, {fallback: <HeroFish/>})`); ein `position:absolute; inset:0` deckt darin nur die Hitbox und nicht das Fenster — das Bild war unsichtbar, und ausserhalb der leeren Session existierte es gar nicht | gerendert, aber nicht sichtbar (Bild in einer 34px-Inline-Box eingesperrt) | eigener Eintrag in `shell.overlay` — dem frame-weiten Layer („Frame-wide floating layer, above every column and outside their scroll containers. Deliberately generic and unowned", client-ui-layout; Host: `.overlayLayer` = `position:absolute; inset:0; z-index:20; pointer-events:none`), `id: shinon-background`, `order: 0`, click-through | `node --test scripts/gate/tests/client-activation.test.mjs` (Wache 3b: `shell.overlay` genau 1 Eintrag, id/order, gerendertes `<img class=shinon-bg__persona src=data:image/webp;base64,…>`; Wache 3a: der Data-URI ist **byte-identisch** mit [packages/core/assets/persona.webp](packages/core/assets/persona.webp), RIFF/WEBP geprueft) |
| Die Laufanzeige („Arbeitet") trug DeepSeeks Wal: `ui-chat` setzt in `[data-chat-running]` eine leere Spanne mit `background: currentColor` und der Wal-**APNG als CSS-Maske** (`mask:url(data:image/apng…)`) plus einen statischen Wal als SVG daneben | DeepSeeks Wal-Animation (APNG-Maske) | Shinons Zeichen als Maske (dieselbe Geometrie wie die Marke, aus DEMSELBEN `MARK`-Objekt abgeleitet), Shinons Farbverlauf als Fuellung und eine eigene Bewegung (`@keyframes shinon-running-drift`, 1.8s); der statische Wal ist versteckt, `prefers-reduced-motion` schaltet die Bewegung ab | `node --test scripts/gate/tests/client-activation.test.mjs` (Wache 3a: Override-Regel, `background: var(--shinon-gradient)`, eigene Keyframes, Wal-SVG aus, Reduced-Motion; die Maske enthaelt alle vier Pfade des `MARK`-Objekts und **kein** `apng`/`whale`) |
| Marken-Konflikt: `@shinon/core` **und** `@shinon/codingmon` belegten beide `sidebar.brand.mark` und `conversation.hero.brand.mark` — Single-Slots, deren Besetzer die Ladeordnung entscheidet; die Sidebar zeigte deshalb das Pixel-Sprite aus 1x1-`<rect>` statt einer gezeichneten Marke | 2 Besetzer je Marken-Slot; die Marke im Toggle-`<button>` der Sidebar (`ui-sidebar` rendert `sidebar.brand.mark` in seinen Knopf) war ein `<rect>`-Sprite | genau **ein** Besetzer je Slot: `@shinon/core` mit einem **neu gezeichneten** Zeichen (Ring + Funke + zwei Fluegel, nur Kurven, **kein** `<rect>`); codingmon besetzt keinen Marken-Slot mehr und gibt auch keine Marke heraus (das Pet bleibt in seinen eigenen Flaechen; die Fenster-Naht `window.__codingmon` traegt nur noch den ZUSTAND — die frueher dort angebotene Naht `PetMark` hatte keinen Leser und wurde am 2026-10-11 gestrichen, E2) | `node --test scripts/gate/tests/client-activation.test.mjs` (Wache 3b: je Slot genau 1 Besetzer, kein `img`, kein `rect`, genau 4 Pfade) — Mutationsprobe: der zweite Besetzer zurueck ⇒ `2 Besetzer statt einem`, Exit 1 |
| Suche nach einem EIGENEN Fehler-/Stat-Screen mit Original-Branding: drei Griffe fanden keinen. `statscreen`/`StatScreen` (0 Treffer in allen Vendor-Bundles), `Something went wrong` (nur Text des Plugin-Managers und des Kontos), `Failed to load plugins` (0 Treffer); `FishLogo` und `BrandWordmark` werden ausschliesslich als **Sidebar-Fallbacks** benutzt (je 1 Aufrufstelle), und der Status „Into the Unknown" ist ausschliesslich `hero.headline` der leeren Session — also genau die Komponente, deren Wal-Fallback jetzt neutralisiert ist | offene Frage „welcher Screen traegt Original-Branding?" | gebrandete Flaechen sind die zwei Marken-Slots (belegt: 0 Fremd-SVG mehr), der Hero-Fallback und der Boot-Text des Hosts auf der Konsole (`dsh-app-boot`, kein HTML-Screen) | `grep -rln` ueber `node_modules/@deepseek-ai/*/lib/*.js` (0 Treffer fuer `Failed to load plugins`/`statscreen`) |
| Die Marken-Slots sind Single-Slots **mit Fallback** (`FishLogo`/`HeroFish`): gibt ein Besetzer auf, haengt dort wieder DeepSeeks Fisch. Gemessen an der gelieferten Fassung: beide Fallbacks rendern ein **direktes** `<svg>`-Kind (`dsh-client-ui-primitives`, `FishLogo`), und die drei Klassen-Teile kommen nur an diesen Stellen vor (Sidebar `railMark`/`brandMark`, Hero `fishHitbox` — je 3 Vorkommen im ganzen Vendor-Bundle) | kein Schutz — ein abgedankter Besetzer zeigte die Alt-Marke | das Bundle versteckt an den drei Marken-Stellen jedes fremde SVG (`[class*="railMark"|"brandMark"|"fishHitbox"] > svg:not(.shinon-mark)`), solange es geladen ist | `node --test scripts/gate/tests/client-activation.test.mjs` (Wache 3a: alle drei Fallback-Regeln stehen im ausgelieferten CSS) |

## 3. Rote Befunde (in diesem Durchlauf gemessen, **nicht** repariert)

Eintraege mit dem Vermerk **REPARIERT** wurden nach der Messung dieses Durchlaufs
behoben; die uebrigen Befunde sind offen.

1. **`doctor` (in `gate:full`) — REPARIERT (2026-10-10, Regel am 2026-10-11 ersetzt)**:
   Versions-Drift über Pakete — `1.0.0`×16, `0.1.0`×3
   ([packages/key-router](packages/key-router),
   [packages/narrative](packages/narrative),
   [packages/shinon-forge](packages/shinon-forge), Zahlen in §1). Der Doctor meldete die
   gehaltene Aufteilung als Befund (obwohl sein Text sie „erlaubt" nannte) und ließ
   deshalb `gate:full` rot werden. Zuerst als `EXPECTED_VERSIONS`
   in [scripts/gate/plugins/doctor.mjs](scripts/gate/plugins/doctor.mjs) deklariert —
   **seit dem Skalierungslauf vom 2026-10-11 ohne diese Liste**: die Zeile eines Pakets
   folgt aus seinem eigenen Manifest (ein `dsh.inactive`-Paket darf die
   Vorbereitungs-Zeile führen, ein ausgeliefertes führt die Auslieferungs-Zeile), jede
   andere Abweichung bleibt rot (Negativproben: `tooltip@9.9.9`, neues Paket `@0.2.0`,
   `narrative@1.0.0` je genau 1 Befund mit Paketnamen). Keine Paketversion wurde
   angefasst. Belegt: `npm run gate:full` → 18/18, Exit 0; `npm run scale:check` →
   20 zusätzliche Pakete ohne einen Befund.
2. **Client-Boot bricht ab — REPARIERT (2026-10-10, zweiter Pass)**: Die drei Client-Haelften `@shinon/markers`, `@shinon/dashboard`, `@shinon/codingmon` meldeten
   beim Laden `failed` — der Browser zeigt „Failed to load plugins … web boot: 3 entries
   did not activate“. Ursache: diese Dateien lasen `ctx.locale`, waehrend ihr `inject`
   nur `['slots']` nennt; der Cordis-Context ist ein Proxy und wirft bei einem nicht
   injizierten Dienst (`cannot get property "locale" without inject`), also galt der
   Eintrag als nicht aktiviert. Betroffen waren **fuenf** Haelfte: dieselbe Zeile stand
   auch in [packages/popup](packages/popup) und [packages/token-usage](packages/token-usage)
   (im Browserbericht war die Liste nur abgeschnitten). Reparatur: `ctx.get?.('locale')`
   — die dokumentierte optionale Abfrage („`ctx.get(name)` performs optional lookup“,
   `dsh-cordis-client-runner/lib/client.js`) statt `ctx.locale`; die deutsche Tabelle
   bleibt der Fallback. Belegt mit `node --test scripts/gate/tests/client-activation.test.mjs`:
   vorher 5× `apply warf — cannot get property "locale" without inject` (u. a. an
   [dashboard/client.js:448](packages/dashboard/client.js#L448)), nachher 4/4 gruen;
   dieselbe Wache steht als statischer Scan (inject-Abdeckung) in derselben Datei und
   laeuft ohne Abhaengigkeiten in CI. Ein **vollstaendiger** `dsh --profile shinon`-Boot
   ist hier weiterhin nicht messbar (CLI nicht installiert, §4).
3. **Gate-Tests — REPARIERT (2026-10-10)**: 7 Dateien rot (`context-resolver`, `context-wiring`,
   `hook-pre-step`, `message-ingress`, `project-index`, `prompter-contract`, `task-router`) —
   Ursachen `dshRoot() ist null` (kein `dsh` im PATH), fehlendes Top-Level-`schemastery` und
   18 fehlende verschachtelte Pakete unter `dsh/node_modules` (darunter
   `dsh-api-session-controller`, das `message-ingress` braucht). Dazu die Fassungsfalle:
   ein fremdes globales `dsh@0.2.0-rc.2` zuerst im PATH lässt `message-ingress` gegen die
   ungeprüfte Fassung messen — der Test **verweigert** die Zusage dann zu Recht, statt sie
   still weiterzuführen. Reparatur: Baum exakt nach Lock vervollständigt (2 Top-Level +
   18 verschachtelt, alle versionsgeprüft), Lauf mit Node v22 und Repo-`dsh@0.2.1-alpha.1`
   zuerst im PATH. Kein Test geändert, kein Skip erfunden. Belegt: 306/306, Exit 0.
4. **`probe-twin` (in `gate:full`) — REPARIERT (2026-10-10)**: [docs/probes/secret-protection.json](docs/probes/secret-protection.json)
   trug in der Probe `…-rotation-ausserhalb-des-repos` `result: "OFFEN"`; das Gate-Vokabular
   ([scripts/gate/plugins/probe-twin.mjs](scripts/gate/plugins/probe-twin.mjs)) kennt nur
   `BESTAETIGT`, `WIDERSPRUCH`, `UNKLAR` (unveraendert). Gemessen vorher: `npm run gate:full`
   → 18 gelaufen, 17 gruen, Exit 1. Eingefuehrt hat den Wert der eigene Commit `91c7e4f`
   (2026-10-10, „Secret-Flanke geschlossen: Nachweis + Rotation als Pflicht") — Beleg:
   `git log -S'"OFFEN"' -- Docs/probes/secret-protection.json` nennt genau diesen Commit;
   das Plugin stammt aus `ffbf721` (2026-10-07) und wurde nicht angefasst. Reparatur: der
   **Vertragsbegriff mit derselben Bedeutung** — `result: "UNKLAR"` (weder bestaetigt noch
   widerlegt; die Probe wurde nicht ausgefuehrt und keine Rotations-/Kopienstelle ist von
   hier aus einsehbar). `verdict: WRITE` und der Beweistext bleiben wortgleich („NICHT
   AUSGEFUEHRT", die Grenze, der naechste Schritt „Rotation durchfuehren"); geaendert wurde
   ein Token. Negativbeweis mit unveraenderter Regel: `VIELLEICHT`, `OPEN`, `OFFEN`,
   `GEPRUEFT`, `bestaetigt` erzeugen je **genau einen** Befund, die drei Vertragswerte je
   null; im Baum 83 Proben, **0** vertragsfremde Werte; Regel-Test `contracts.test.mjs`
   12/12 gruen. Gemessen nachher: `npm run gate:full` → **18/18, Exit 0**. Kein Skip, keine
   Ausnahme, kein gelockertes Vokabular.

## 4. In diesem Durchlauf **nicht** geprüft (kein Exit-0-Beleg vorhanden)

- **Kein** echter Modell-Aufruf steht mehr aus: der Arbeits-Schlüssel liegt in `.env` (gitignoriert, `chmod 600`), und der Turn ist oben gemessen — inklusive Urteil, Widerruf, Host-Ende und Neustart. Was aussteht, ist etwas anderes: dass ein SCHREIBENDER Zug des Agenten über diese Kette läuft (bisher nur Bewertungen und Turn-Enden).
- `npm run verify:panel` **Stufe 3** (Rendering von `dist/packages/markers/client.js` in
  jsdom) braucht `jsdom`, `react`, `react-dom` aus einem fremden `node_modules`; hier nicht
  ausführbar. Stufe 1 + 2 dieses Skripts liefen dagegen gegen die laufende UI und sind in
  §2 belegt.
- Ob die drei inaktiven Pakete (`key-router`, `narrative`, `shinon-forge`) ins Profil
  sollen, wurde hier **nicht** entschieden.
- **Lebender Boot (Nachtrag 2026-10-11):** der Boot ist jetzt gefahren (`dsh --profile shinon
  --no-open --port 3099`, §2) — die Seitenleiste zeigte `Shinon Dashboard`, `Codingmon`,
  `Shinon Marker` und `Prompter`, die Texte waren deutsch, das Pet meldete `LV 19 · 182.000 XP`.
  Weiterhin **ungemessen im Augenschein**: ob der Browser die Override-Spezifitaet des
  Laufanzeige-Blocks genau so aufloest (Zusage: `[data-attribut] [class*="…"]` schlaegt
  die gelieferte Klassen-Regel), ob `shell.overlay` im echten `AppFrame` der richtige
  Platz fuer eine 17%-Ebene ist (der Layer liegt mit `z-index:20` ueber den Spalten) und ob
  das Hintergrundbild (Persona-WebP) sichtbar rendert — die Bewertung des Urteils und die
  Ablage waren das Ziel dieses Laufs, nicht die Marke.
- `dist/` ist **gitignoriert** (`.gitignore`: `dist/`): der Build ist ein lokaler Beleg
  (Exit 0, 19 Pakete, 96 Dateien), kein Artefakt dieses Repos.

Ältere Belege (Proben, Verträge) tragen ihr eigenes Datum und stehen unter
`docs/probes/` bzw. `docs/contracts/` — sie sind **keine** Quelle für aktuelle Zahlen.
