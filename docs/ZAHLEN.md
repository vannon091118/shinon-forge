# Zahlen — Shinon Forge

> **Status:** current — **einziger Eigentümer** aller harten Zahlen dieses Repos. **Stand:** 2026-10-20
> **Einstieg:** `AGENTS.md` · gemessen mit Node v22.23.3 und npm 10.9.9, dsh `0.2.1-rc.2` (Repo, zuerst im PATH)

Regel: **Kein anderes Dokument nennt eine dieser Zahlen.** README und `AGENTS.md`
verweisen hierher. Wer eine Zahl ändert, ändert den Messweg
(hier oder in `scripts/sync-zahlen.mjs`) — nicht die Zahl im Dokument.

## 1. Bestand

Dieser Block wird **gemessen, nicht gepflegt**: `npm run zahlen:sync` schreibt ihn aus dem
Baum, `npm run zahlen:check` vergleicht ohne zu schreiben (Exit 1 bei Abweichung). Alles
außerhalb der Marker ist Prosa und bleibt unberührt. Die Historie einer Zeile steht in
`git log` und `docs/TAGEBUCH.md`, nicht in der Zelle.

<!-- zahlen:bestand:start -->
| Zahl | Wert | Befehl (Eigentümer) | Exit |
|---|---|---|---|
| Pakete unter `packages/` | 23 | `ls packages \| wc -l` | 0 |
| Profile unter `profiles/` | 3 | `git ls-files profiles \| cut -d/ -f2 \| sort -u \| wc -l` | 0 |
| Bundle-Layer im Profil `shinon` | 25 | `node -p "require('./profiles/shinon/package.json').dsh.profile.bundles.length"` | 0 |
| davon eigene (`@shinon/*`) | 20 | dieselbe Liste, gefiltert auf `@shinon/` | 0 |
| davon fremde | 5 | dieselbe Liste, Rest | 0 |
| Pakete **nicht** im Profil (erklären sich selbst via `dsh.inactive`) | 3 (mobile, openapi, seams) | Manifeste unter `packages/*/package.json` lesen | 0 |
| Version des Repos | `0.4.0` | `node -p "require('./package.json').version"` | 0 |
| Paketversionen | 22× `1.0.0`, 1× `0.1.0` | `node -e "…"` über `packages/*/package.json` | 0 |
| DSH-Pin im Root-Manifest | `0.2.1-rc.2` | `node -p "require('./package.json').dependencies['@deepseek-ai/dsh']"` | 0 |
| Schemastery (deklariert) | `3.18.5` | `node -p "require('./package.json').dependencies['@deepseek-ai/schemastery']"` | 0 |
| Node (`engines.node`) | `^22.19.0 \|\| >=24.0.0` | `node -p "JSON.stringify(require('./package.json').engines)"` | 0 |
| pnpm-Artefakte (getrackt) | 0 | `git ls-files '*pnpm-workspace.yaml' '*pnpm-lock.yaml' \| wc -l` (Aufrufe: Gate-Prüfung „pnpm-Reste“) | 0 |
| Markdown-Dokumente (getrackt) | 32 | `git ls-files '*.md' \| wc -l` | 0 |
| Verträge unter `docs/contracts/` | 13 | `ls docs/contracts/*.json \| wc -l` | 0 |
| Proben unter `docs/probes/` | 44 | `ls docs/probes/*.json \| wc -l` | 0 |
| Generierte Idiom-Blöcke | 17 Blöcke in 13 Dateien | `npm run idioms:check` (Exit 0) | 0 |
| Vendorte Dateien unter `vendor/` | 22 | `find vendor -type f \| wc -l` | 0 |
| Build (`dist/packages/`) | 23 Pakete, 222 Dateien, 1926865 Bytes | `npm run build` (Exit 0) | 0 |
<!-- zahlen:bestand:end -->

Die Zahl der Profil-Layer und der aktivierten Pakete **steht nicht in der Doku**,
sondern in `profiles/shinon/package.json` (`dsh.profile.bundles`); der Befehl oben
liest genau diese Datei.

### 1.1 Umgebung (gemessen, nicht aus dem Baum ableitbar)

| Zahl | Wert | Befehl | Exit |
|---|---|---|---|
| Node (ausgeführt) | **v22.23.3** | `node --version` (über `scripts/run-with-node.mjs`) | 0 |
| npm | **10.9.9** | `npm --version` | 0 |
| DSH im PATH, Repo zuerst | **0.2.1-rc.2** (der Pin) | `./node_modules/.bin/dsh --version` | 0 |
| DSH global daneben | **0.2.0-rc.2** — darf abweichen; keine Zusage hängt an dieser Fassung | `dsh --version` ohne `node_modules/.bin` im PATH | 0 |
| Node-Range des Repos | `^22.19.0 \|\| >=24.0.0` | `node -p "JSON.stringify(require('./package.json').engines)"` | 0 |

### 1.2 Struktur (Klassen, Grenzen, Bestand)

Die Grenzen stehen **nicht** hier, sondern in `docs/contracts/structure.json` — dort
zusammen mit der Messung, aus der sie folgen. Diese Datei nennt nur, was der Riegel
heute zählt (`node scripts/shinon-test.mjs`, Schritt „Struktur“):

| Zahl | Wert | Befehl | Exit |
|---|---|---|---|
| Code-Dateien unter `packages/` + `scripts/` + `bin/` | **317** | `find packages scripts bin -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) \| grep -vE '(^\|/)(node_modules\|dist\|dev-dsh-home\|\.git)(/\|$)' \| wc -l` — dieselbe Auswahl wie `codeDateien()` in `scripts/lib/structure.mjs` | 0 |
| Klassen | **6** (host-entry, client, core, test, gate-plugin, script) | dieselbe Registry lesen | 0 |
| Benannte Bestandsdateien (über ihrer Klassengrenze) | **30** | Registry lesen (`bestand`) | 0 |
| Dateien ohne Klasse | **0** | `npm test` (Schritt „Struktur“) | 0 |
| Verstöße gegen den Contract der Klasse | **0** | `npm test` (Schritt „Struktur“) | 0 |

Die Herleitung der Grenze ist Teil der Registry (`herleitung`): 3 × Median der Klasse,
auf 50 gerundet, mindestens 100 — gemessen am 2026-10-20. Wer eine Datei über die
Grenze bringt, trägt sie **namentlich** in `bestand` ein; der Eintrag darf danach nur
sinken. Genau das prüft `scripts/gate/tests/structure.test.mjs` (8 Fälle: Echtbaum
plus sieben Mutationen), und `npm run build` fährt denselben Schritt.

Der Riegel hat 2026-10-20 seinen ersten Bestandseintrag **eingelöst**: der
Prompter-Einstieg lag mit 1350 Zeilen über der Grenze (550) und steht jetzt bei
**256** — der Eintrag ist aus `bestand` verschwunden, nicht angehoben. Die Probe
dazu: 300 angehängte Zeilen machen ihn mit *„558 Zeilen über der Grenze 550"*
rot, danach ist er wieder grün. Die drei neuen Module liegen bei 544
(`assets/pre-step.js`), 547 (`assets/runtime-state.js`) und 120
(`assets/trace-report.js`) Zeilen; zusammen 1466 statt 1350, weil die drei
Modulköpfe und die getrennten Import-Listen dazukommen — geteilt, nicht
aufgebläht.

## 2. Prüfläufe (Ist-Zustand 2026-10-21)

Jede Zeile nennt das Ergebnis **dieses** Durchgangs, den Befehl und seinen Exit-Code.
Ein älterer Wert steht nur in §2.1 als Beleg mit Datum und ist keine zweite gültige Zahl.

| Lauf | Ergebnis | Exit | Befehl |
|---|---|---|---|
| Volle Kette | **Exit 0** — Paket-Suiten → statisches Gate → Fixtures → Distribution → Profilboot, in dieser Reihenfolge (nur CI/auf Zuruf); zusammengesetzt aus **8** Paket-Suiten (46/50/13/240/13/13/17/12 Tests), Gate **126**, Fixtures **9**, Distribution **92**, Profilboot **4** | 0 | `npm run test:full` |
| Schneller Pfad (lokal) | **Exit 0** — statisches Gate + lokale Engine-Slices, in dieser Reihenfolge | 0 | `npm test` |
| Gate (statisch) | **126** bestanden, **0** fehlgeschlagen | 0 | `npm test` bzw. `node scripts/run-with-node.mjs scripts/shinon-test.mjs` |
| Regel-Fixtures | **9** bestanden, **0** fehlgeschlagen (Kontrolle + 8 Regelbrüche, je Gate *und* Build rot); die Kopie trägt `docs/`, weil Kanon und Struktur dort ihre Registries lesen | 0 | `node scripts/run-with-node.mjs scripts/validate-test.mjs` |
| Distributionstest | **92** bestanden, **0** fehlgeschlagen (23 Pakete × 4 Stufen; jedes Isolat bekommt seine lokalen `@shinon/*`-Abhängigkeiten als Tarball daneben) | 0 | `npm test` bzw. `scripts/pack-test.mjs` |
| Profiltest | **4** bestanden, **0** fehlgeschlagen — **25** Layer, **20** Repo-Bundles; der vierte Fall ist ein Ladebeweis, kein Auflösungsbeweis: eigener Prozess mit `profiles/shinon` als cwd, `@shinon/prompter` über den Profil-Link, die drei geteilten Prompter-Module und `@shinon/seams/core` aus dem Root-`node_modules` | 0 | `node scripts/run-with-node.mjs scripts/shinon-profile-test.mjs` |
| Profil-Dump im echten Boot | **58** Layer-Köpfe, **215** Einträge; `shinon-task-router.activate: false`, `permission.defaultPreset: workspace-write`, `agent-default-model: prompter/agnes-2.5-flash` (die gespeicherte Wahl des Nutzers — der Config-Editor schreibt sie in die Profil-Ebene, ein Dump kann je Installation abweichen) | 0 | `DSH_HOME=$PWD ./node_modules/.bin/dsh --profile shinon --dump-config` |
| Frischklon-Repro S3 | Klon @ `d8999ab` Exit 0, `npm ci` Exit 0, 29 Links Exit 0, Dump 60/210 Exit 0, Build 185 Dateien Exit 0, UI HTTP 200 (41 314 Bytes HTML, ohne Token 401), gate 546/546 | 0 | `docs/TAGEBUCH.md`, Kapitel 2026-10-17 (Commit `d8999ab`) |
| Gate-Engine `--full` | **23** Gates gelaufen, **23** grün, **1** `NOT_APPLICABLE` (`typescript`: keine First-Party-TS-Datei), **0** fehlgeschlagen, **0** geskippt; Branding ohne Flag sichtbar übersprungen | 0 | `npm run gate:full` |
| Gate-Tests | **812** Tests, **812** grün, **0** rot, **0** geskippt — 10 für die Installationspakete (die mitgelieferte Node-Fassung ist die Untergrenze aus `engines.node`, die Archivnamen sind die offiziellen, die Starter suchen sich selbst, das `.deb` zwingt kein System-Node und lädt nichts nach, der Windows-Weg lädt nichts nach und kennt Install und Deinstallation, die Nutzlast trägt Code und relative Bundle-Links, die Windows-Nutzlast trägt ihre Helfer und keine Verknüpfung, der Windows-Weg kopiert nicht in sich selbst, und der Paketbau gehört in die CI, und der Paketbau nimmt das npm, das zu diesem Node gehört) — 5 für den Prompter-Schnitt (die 99 öffentlichen Namen unverändert, die drei Eigentümer-Module mit genau ihren Exporten, kein Modul importiert `index.js`, das Runtime-Objekt hat einen Erzeuger und nur der berührt Dateien, jeder Kopf nennt seinen Eigentümer; Mutationsprobe: ein gestrichener Name macht den ersten Fall rot) und 8 für den Struktur-Riegel (Echtbaum: jede Datei hat eine Klasse, keine reißt ihre Grenze, jeder Bestand stimmt; sieben Mutationen: über der Grenze, ohne Klasse, Client mit Schema, Host ohne `apply`, wachsender Bestand, sinkender Bestand, toter Bestandseintrag samt fehlender Registry) und 8 für den Kanon (echter Baum, Registry-Form, fünf Mutationen) und 12 für das Dev-Tagebuch (Kapitel je Commit-Tag, Anker-SHA mit Datum, Bereichsreihenfolge, lebender Belegpfad, Akten-Tabellenzeile, sieben Mutationsproben) — 6 für den Secrets-Tresor (Sammlung, Bericht ohne Werte, Modus 0600, fail-closed, Wiederherstellung, Idempotenz) und 4 für `uninstall` (Tresor, `--purge`, `--keep-checkout`, leerer Ort) — davon 2 für den Prompter-Trace-Kanal (Literal-Pin, Fenster-Spiegel), 4 für die S1-Wurzelbindung (fremde Root wird verworfen, keine Migration aus fremdem Index, Prompter und Project Index antworten gleich, der Entscheidungsdatensatz nennt Identität und Quelle), 3 für die eine schemastery-Fassung (Manifest-Gleichheit, Harness-Range, genau ein Lock-Eintrag), 1 dafür, dass nur der Nutzertext einen Skill ausdrücklich nennt — die Intent-Expansion nicht — und 6 für `shinon doctor` S4 (eigener Unterbefehl, stabile Codes, read-only, presence-only, Hilfe, Fehlerpfade), 16 für das Nutzer-Installat (Befehlsoberfläche, `auto`-Staging-Verweigerung, `units`-Timer ohne systemd, read-only `selftest` mit Stufen und `--json`) und 6 für die Backup-Aufbewahrung (Obergrenzen, jüngste unantastbar, Dry-Run, Protokoll, Exit-2-Verweigerung), 1 für die Symlink-Grenze des Project-Index (Ausbruch wird nicht gelesen), 1 für die Propsa-Form der Commit-Policy (ganz oder gar nicht), 3 für das Probe-Journal und den immer aktiven One-Shot (JSONL-Zeile, angenommener Lauf schreibt nichts, ausdrücklicher Kurzweg), 5 für das Prüf-Panel der Persona (Literale beider Seiten, Anzeige mit Belegzahl, POST-Entscheidung, SSE statt Intervall, fremder Vertrag fail-closed), 1 dafür, dass eine Antwort auf den Auftrag den Prompt nicht ersetzt, und 2 für die Prüf-Route im echten Bundle (GET zeigt Belege, POST entscheidet genau einmal; der Prüf-Stand reist als eigenes SSE-Ereignis und wird geschoben) 2 für den dauerhaften `SALVAGED_PROSE`-Zaehler (die Zahl ueberlebt einen Neustart, leerer Namensraum und fremder Stand sind fail-closed) 6 für die Fähigkeitskarte (jede Frage genau ein Eigentümer, jedes Paket mindestens einmal genannt, Beleg existiert, Naht wörtlich im Eigentümer, Brief unter der Grenze) 13 für Welle 1 (3 Hook-Riegel gegen §1-Drift und für die Installer-Vorlage, 5 Intent-Durchgängigkeit von Text über Klasse, Modus und Expansion bis zum Router, 5 Modellroute als Form samt Vergleich des schlanken Extraktors mit js-yaml, dazu 2 für den Schlüsselnamen aus der gewählten Route bis in den S6-Preflight, 5 für den Host-Naht-Kern (Identität statt Kopie, importfreier Kern, nur Client-Spiegel in `SOURCE_TWINS`, gerader Gate-Schritt, Mutationsprobe) 2 für die Abbruchquote (ein Fenster-Global statt zweitem Kanal, Quote und häufigster Grund im gerenderten Prompter-Panel) und 7 für den warmen Project Index (sechs Schlüssel, kalt gegen warm, geänderte Datei bei gleicher Größe und zurückgesetzter mtime, neue Datei, gelöschte Datei, ohne refresh, leere Abfrage) | 0 | `npm run gate:test` |
| Codingmon-Tests | **46** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:codingmon` |
| Scoring-Tests (Kern, Signale, Ablage, Block-Gewichte) | **50** bestanden, **0** rot, **0** übersprungen — importfrei, läuft in CI ohne `npm ci`; die Host-Naht des Lernens fährt `scripts/gate/tests/scoring-block-learning.test.mjs` | 0 | `npm run test:scoring` |
| Token-Usage-Tests | **13** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:token` |
| Index warm (Abfrage) | kalt **3 134 ms** (Kaltlauf **3 106 ms** für **490** Dateien, 4 746 913 B gelesen; erster Treffer +27 ms; zweiter Lauf 4 010 ms — Streuung des Kaltlaufs) gegen warm **7,0 ms** Median (5,6–18,7 ms aus 20 Abfragen, **12** Kandidaten geprüft, **0 B** gelesen); Trefferquote direkt nach einer Dateiänderung bei gleicher Größe und zurückgesetzter mtime: **1/1 frisch** (1 Datei neu gelesen, 102 473 B, 217 ms) | 0 | `npm run index:warm` |
| Prompter-Tests (Zettel, Skills, Selektor, Vorschlag, Selektionsvertrag, Workspace-Identität, Provenienz, Fähigkeitskarte) | **240** bestanden, **0** rot, **0** übersprungen — der Laufzeit-Index entfiel mit der Konsolidierung (6 Größenbudget-Tests und 4 seiner Workspace-Tests ersatzlos gestrichen; `FOREIGN_ROOT`, Symlink-Grenze und `.agents`-Entkopplung prüft jetzt der Project-Index); 4 neue fuer den `SALVAGED_PROSE`-Kern (Form, Deckel, Fortschreibung, Trennung je Sitzung); 14 neue fuer die Provenienz-Leiter (10 Kern, 4 Trace); 17 neue fuer die Fähigkeitskarte (16 Kern: Zuordnung, Gleichstand, Wortgrenzen, Form, Nahtform, Brief, Grenze; 1 Trace: Brief im Prompt, Eigentümer in der Spur); 10 neue fuer die Intent-Konfliktmatrix und die Rangfolge (vier Konfliktarten, längste Phrase vor Klasse, Gleichstand, Datenreihenfolge, Frage ohne Expansion); 15 neue fuer die Abbruchquote (11 Kern: Grundtrennung, Rangfolge, Gleichstand, Quote, neuer Grund als Dateneintrag, Leitstand 5 von 9; 2 Trace: Grund und Zähler im Datensatz, dieselben Felder im Fensterspiegel; 2 Enhancer: der leere Strom ist ein eigener Grund, und sein Abbruch-Finish reist als Daten) | 0 | `npm run test:prompter` |
| Narrative-Tests (Kern) | **13** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:narrative` |
| Popup-Tests (Faltung des Sitzungsfensters) | **13** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:popup` |
| Key-Router-Tests (Pool-Kern) | **17** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:key-router` |
| Traceability-Tests | **12** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:traceability` |
| Idiom-Blöcke | **17** Blöcke in **13** Dateien, deckungsgleich mit `scripts/lib/plugin-idioms.mjs` | 0 | `npm run idioms:check` |
| Build (`dist/`) | **23** Pakete, **221** Dateien, **1 919 370** Bytes | 0 | `npm run build` |
| Bestands-Block dieser Datei | deckungsgleich mit dem Baum | 0 | `npm run zahlen:check` |
| Echter Modellturn (2026-10-20, 04:22, Profil `shinon`, Port 3099) | **1** Turn, **2** Schritte, **33 s** bis zur fertigen Antwort, erster sichtbarer Text nach **2 963 ms**; **52,2K** Token, Cache-Treffer **16 %**, **90** tok/s; Antwort sachlich richtig (Grenze **550**, Klasse `core` — genau die zwei Dateien, die das Modell selbst las) | 0 | UI `http://127.0.0.1:3099`, Modus Read Only, Route `prompter/agnes-2.5-flash` (Label „Shinon 2.5 Flash") |
| Prompter in diesem Turn | One-Shot **angenommen** (328 Zeichen, 11 078 in / 230 out, **4 444 ms**), `intent=LOOKUP`, `features=frage+pfad`, `brief=KEIN_TREFFER`, Provenienz **40** Einträge / **0** Verstöße, `abort=0/1` (kein Abbruch ausgelöst) | 0 | Host-Log des Turns (`[shinon-prompter] One-Shot …`, `Trace: …`) |
| Warmer Index in diesem Turn | `context_source=index`, Budget 6 000 Token; Abfrage **38,97 ms** Median (37,36–56,95 ms aus 5), **41** Dateien, **23 925** B, **200** Symbole; **2/2** Treffer (die zwei gebrauchten Dateien stehen auf Platz 1 und 2); Refresh **32** Kandidaten per Stempel geprüft, **0** gelesen, **5 ms**. Index beim Boot: **434** Dateien, 4 139 446 B, **1** übersprungen (`package-lock.json`, ZU_GROSS), **3** nie gelesen (Zugangsdateien), **15** Fundstellen redigiert | 0 | `resolveContext` gegen eine Kopie des Live-Index (`~/.cache/shinon/indexes/ba59feaaf87abd85/index.sqlite`), Prompt und Budget des Turns |
| Begleiter-Dienst im Host | `shinon_codingmon_store` unter `shinon.codingmon/store-v1` im echten Cordis-Root bereitgestellt (**4/4** Fälle, **0** übersprungen); im laufenden Host „Spiegel aktiv — Domain codingmon_pet v1, Empfänger codingmon/writeSnapshot"; über `shinon.capabilities/v1` auffindbar (Frage „Wo lebt der Begleiter (Pet)?" → `pet-und-begleiter`, Brief 353 Zeichen, nennt Dienst und Vertrag, 0 Befunde) | 0 | `node --test scripts/gate/tests/codingmon-store.test.mjs` (mit Repo-`dsh` im PATH); Live-Log; `matchCapability` auf `packages/prompter/assets/capabilities.json` |

**Warum die Umgebung zählt:** `gate:test` und `npm test` brauchen Node ≥ 22 (`node:sqlite`)
und den Repo-`dsh` vor einem fremden globalen `dsh`; `scripts/run-with-node.mjs` setzt
`node_modules/.bin` vor den PATH und re-exect bei Bedarf auf eine verifizierte Node ≥ 22.
Ein nacktes `node --test …` bleibt der ungeschützte Weg und ist kein Beleg.

### 2.1 Ältere Belege (Datum, in diesem Durchgang **nicht** wiederholt)

| Beleg | Datum | Zahl | Nachweis |
|---|---|---|---|
| Echter Boot mit echtem Modell-Turn (Urteil, Widerruf, Host-Ende, Neustart) | 2026-10-11 | Antwort in 7 s, 18,2K Token; Scorecard exakt zurück auf `0.53 / 0.515`; nächster Host lädt 1 Signal | [docs/probes/store-cost.json](probes/store-cost.json) |
| Kosten der Ablage bei vielen Signalen | 2026-10-11 | 58,6 ms (10 Zeilen) → 500,2–517,0 ms (20 000); 0,03 ms je Zeile; 99,6 % der Kette ist Ablage | [docs/probes/store-cost.json](probes/store-cost.json) |
| Startscan des Projektindex (353 Dateien) | 2026-10-13 | kalt 2627 ms, unverändert 21 ms, Mount 1 ms, Worker-Bericht 2856 ms | [docs/probes/project-index-startscan.json](probes/project-index-startscan.json) |
| Branding-Wirkung im echten Chromium | 2026-10-13 | 28 bestanden, 0 fehlgeschlagen | `npm run branding` (braucht `dist/` und Browser) |
| Skalierungslauf (Kopie + 20 Pakete) | 2026-10-11 | 6 von 6 Stufen grün | `npm run scale:check` (Kopfkommentar; das damalige Protokoll fiel mit dem Cut) |
| Frischer Klon: `npm install` + `npm start -- --check` | 2026-10-13 | 731 Pakete, Lockfile byteidentisch, ohne `pnpm`/globales `dsh` | `docs/TAGEBUCH.md`, Kapitel 2026-10-11 |
| CI-Lauf (Branch-Stand `bf003a2`) | 2026-10-13 | 14 Jobs grün, Conclusion `success` | Run `38474747771` in der Actions-API |

## 3. Rote Befunde

In diesem Durchgang: **keine** im abschließenden Lauf. `npm test`, `npm run gate:test`,
`npm run gate:full` und `npm run build` enden mit Exit 0; der einzige Skip mit
System ist `typescript` (`NOT_APPLICABLE`, es existiert weiterhin keine
First-Party-TypeScript-Datei) — kein Rot, kein stiller Skip, kein sichtbarer Skip mehr (die vier
`codingmon-store`-Skips entfallen, seit `@deepseek-ai/dsh-storage-json` als
fünftes Zielpaket an der Wurzel steht und die `uebergabe`-Naht die
rc.2-Mechanik fährt: `RemoteAccessService`, Browser-Bündel `client.browser.js`,
Owner-Peer mit Signal).

**Ein benannter Flake, behoben statt verdeckt:** der Gate-Test
`Zeitstempel: verify=stamp schliesst die Luecke, ohne den Baum zu lesen` war in zwei von
vier vollen `gate:test`-Läufen rot (`caught.suspicious` 0 statt 1), einzeln aber grün.
Ursache ist die `ctime`-Auflösung dieser Umgebung: nach `writeFileSync` + zurückgesetzter
`mtime` blieb `ctimeNs` in einer Kontrollprobe außerhalb des Repos **identisch** — eine
Kontrollprobe mit 5 ms Pause und erneutem `utimes` zeigte den nächsten Tick (gemessen:
4 ms Schrittweite). Der Test wartet jetzt (maximal 500 ms) auf den nächsten `ctime`-Tick,
statt die Zusage zu senken: `suspicious === 1` und „ctime unterscheidet sich" stehen
unverändert im Test. Zwei volle Läufe danach: **535/535**, `0` rot; mit dem zusätzlichen
S1-Ablage-Test danach **536/536**, `0` rot.

**Zweiter beobachteter Flake (nicht reproduziert):** im selben Durchgang war ein
`npm test`-Lauf rot in `packages/codingmon/test/uebergabe.test.mjs`
(`Zusage: nur turn/end mit reason=completed zaehlt XP-Completions in readActivity`,
0 statt 4), also in der echten DSH-Storage-Familie. Einzeln (`npm run test:codingmon`)
und in zwei folgenden `npm test`-Läufen war die Datei **46/46** grün; die Änderung dieses
Durchgangs berührt `codingmon` nicht. Der Test ist damit lastempfindlich und bleibt als
Beobachtung stehen — nicht als behoben behauptet.

Offen **außerhalb** der Gates (kein Rot, nur ungemessen):

1. **429-Rotation gegen die laufende Route mit echten Schlüsseln** — der Draht-Test
   (`scripts/gate/tests/key-router-wire.test.mjs`) beweist Auswahl → Kopfzeilen → 429 →
   anderer Schlüssel gegen einen Loopback-Stub, nicht gegen den Anbieter.
2. **Gefüllter Key-Pool im echten Boot** — der Router liest seit dem 2026-10-13 die
   Startumgebung (Prozess, Projekt-`.env`, Benutzer-`.env`); ob DSH den `.env`-Wert vor
   die Plugin-Ebene exportiert, ist nicht gemessen.
3. **Popup-Overlay im Browser** — der Baum ist geprüft (React-Attrappe + Aktivierung am
   echten Cordis-Proxy), das sichtbare Malen im `composer.dock` nicht.
4. **Ein schreibender Agentenzug über die Kette** — bisher sind Bewertungen und
   Turn-Enden gemessen, kein schreibender Zug.

## 4. In diesem Durchgang **nicht** geprüft

- `npm run branding`: braucht gebautes `dist/` und Chromium; der letzte Lauf steht in §2.1.
- `npm run scale:check`: kopiert den Baum und fügt Klon-Pakete hinzu, ist bewusst nicht
  Teil von `npm test`; der letzte Lauf steht in §2.1.
- `node scripts/panel-check.mjs`: braucht einen laufenden Host und dessen Token.
- Ein echter Modell-Turn: der Arbeits-Schlüssel liegt in `.env`, der Lauf wurde in diesem
  Durchgang nicht wiederholt (§2.1).
- `npm run typecheck`: `NOT_APPLICABLE` — es gibt keine First-Party-TypeScript-Datei.

## 5. Historie

Reparaturen, Ursachen und Vorher/Nachher-Messungen stehen **nicht** hier, sondern in
`git log` (Commit-Nachricht mit Datenbeleg) und in `docs/TAGEBUCH.md`. Diese Datei
trägt nur den heutigen Ist-Zustand.
