# Zahlen — Shinon Forge

> **Status:** current — **einziger Eigentümer** aller harten Zahlen dieses Repos. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · gemessen mit Node v22.23.3 und npm 10.9.9, dsh `0.2.1-alpha.1` (Repo, zuerst im PATH)

Regel: **Kein anderes Dokument nennt eine dieser Zahlen.** README, `AGENTS.md` und
`docs/ARCHITECTURE.md` verweisen hierher. Wer eine Zahl ändert, ändert den Messweg
(hier oder in `scripts/sync-zahlen.mjs`) — nicht die Zahl im Dokument.

## 1. Bestand

Dieser Block wird **gemessen, nicht gepflegt**: `npm run zahlen:sync` schreibt ihn aus dem
Baum, `npm run zahlen:check` vergleicht ohne zu schreiben (Exit 1 bei Abweichung). Alles
außerhalb der Marker ist Prosa und bleibt unberührt. Die Historie einer Zeile steht in
`git log` und `docs/archive/`, nicht in der Zelle.

<!-- zahlen:bestand:start -->
| Zahl | Wert | Befehl (Eigentümer) | Exit |
|---|---|---|---|
| Pakete unter `packages/` | 22 | `ls packages \| wc -l` | 0 |
| Profile unter `profiles/` | 3 | `git ls-files profiles \| cut -d/ -f2 \| sort -u \| wc -l` | 0 |
| Bundle-Layer im Profil `shinon` | 24 | `node -p "require('./profiles/shinon/package.json').dsh.profile.bundles.length"` | 0 |
| davon eigene (`@shinon/*`) | 19 | dieselbe Liste, gefiltert auf `@shinon/` | 0 |
| davon fremde | 5 | dieselbe Liste, Rest | 0 |
| Pakete **nicht** im Profil (erklären sich selbst via `dsh.inactive`) | 3 (mobile, openapi, shinon-forge) | Manifeste unter `packages/*/package.json` lesen | 0 |
| Version des Repos | `0.4.0` | `node -p "require('./package.json').version"` | 0 |
| Paketversionen | 20× `1.0.0`, 2× `0.1.0` | `node -e "…"` über `packages/*/package.json` | 0 |
| DSH-Pin im Root-Manifest | `0.2.1-alpha.1` | `node -p "require('./package.json').dependencies['@deepseek-ai/dsh']"` | 0 |
| Schemastery (deklariert) | `~3.18.5-alpha.1` | `node -p "require('./package.json').dependencies['@deepseek-ai/schemastery']"` | 0 |
| Node (`engines.node`) | `^22.19.0 \|\| >=24.0.0` | `node -p "JSON.stringify(require('./package.json').engines)"` | 0 |
| pnpm-Artefakte (getrackt) | 0 | `git ls-files '*pnpm-workspace.yaml' '*pnpm-lock.yaml' \| wc -l` (Aufrufe: Gate-Prüfung „pnpm-Reste“) | 0 |
| Markdown-Dokumente (getrackt) | 76 | `git ls-files '*.md' \| wc -l` | 0 |
| Verträge unter `docs/contracts/` | 6 | `ls docs/contracts/*.json \| wc -l` | 0 |
| Proben unter `docs/probes/` | 29 | `ls docs/probes/*.json \| wc -l` | 0 |
| Generierte Idiom-Blöcke | 16 Blöcke in 12 Dateien | `npm run idioms:check` (Exit 0) | 0 |
| Vendorte Dateien unter `vendor/` | 22 | `find vendor -type f \| wc -l` | 0 |
| Build (`dist/packages/`) | 22 Pakete, 185 Dateien, 1528266 Bytes | `npm run build` (Exit 0) | 0 |
<!-- zahlen:bestand:end -->

Die Zahl der Profil-Layer und der aktivierten Pakete **steht nicht in der Doku**,
sondern in `profiles/shinon/package.json` (`dsh.profile.bundles`); der Befehl oben
liest genau diese Datei.

### 1.1 Umgebung (gemessen, nicht aus dem Baum ableitbar)

| Zahl | Wert | Befehl | Exit |
|---|---|---|---|
| Node (ausgeführt) | **v22.23.3** | `node --version` (über `scripts/run-with-node.mjs`) | 0 |
| npm | **10.9.9** | `npm --version` | 0 |
| DSH im PATH, Repo zuerst | **0.2.1-alpha.1** (der Pin) | `./node_modules/.bin/dsh --version` | 0 |
| DSH global daneben | **0.2.0-rc.2** — darf abweichen; keine Zusage hängt an dieser Fassung | `dsh --version` ohne `node_modules/.bin` im PATH | 0 |
| Node-Range des Repos | `^22.19.0 \|\| >=24.0.0` | `node -p "JSON.stringify(require('./package.json').engines)"` | 0 |

## 2. Prüfläufe (Ist-Zustand 2026-10-17)

Jede Zeile nennt das Ergebnis **dieses** Durchgangs, den Befehl und seinen Exit-Code.
Ein älterer Wert steht nur in §2.1 als Beleg mit Datum und ist keine zweite gültige Zahl.

| Lauf | Ergebnis | Exit | Befehl |
|---|---|---|---|
| Volle Kette | **Exit 0** — Paket-Suiten → statisches Gate → Fixtures → Distribution → Profilboot, in dieser Reihenfolge | 0 | `npm test` |
| Gate (statisch) | **117** bestanden, **0** fehlgeschlagen | 0 | `npm test` bzw. `node scripts/run-with-node.mjs scripts/shinon-test.mjs` |
| Regel-Fixtures | **9** bestanden, **0** fehlgeschlagen (Kontrolle + 8 Regelbrüche, je Gate *und* Build rot) | 0 | `node scripts/run-with-node.mjs scripts/validate-test.mjs` |
| Distributionstest | **88** bestanden, **0** fehlgeschlagen (22 Pakete × 4 Stufen) | 0 | `npm test` bzw. `scripts/pack-test.mjs` |
| Profiltest | **3** bestanden, **0** fehlgeschlagen — **24** Layer, **19** Repo-Bundles | 0 | `node scripts/run-with-node.mjs scripts/shinon-profile-test.mjs` |
| Profil-Dump im echten Boot | **60** Layer-Köpfe, **210** Einträge; `shinon-task-router.activate: false`, `permission.defaultPreset: workspace-write`, `agent-default-model: agnes/agnes-2.5-flash` | 0 | `DSH_HOME=$PWD ./node_modules/.bin/dsh --profile shinon --dump-config` |
| Frischklon-Repro S3 | Klon @ `d8999ab` Exit 0, `npm ci` Exit 0, 29 Links Exit 0, Dump 60/210 Exit 0, Build 185 Dateien Exit 0, UI HTTP 200 (41 314 Bytes HTML, ohne Token 401), gate 546/546 | 0 | `docs/S3-FRESH-d8999ab.md` |
| Gate-Engine `--full` | **22** Gates gelaufen, **21** grün, **1** `NOT_APPLICABLE` (`typescript`: keine First-Party-TS-Datei), **0** fehlgeschlagen, **0** geskippt; Branding ohne Flag sichtbar übersprungen | 0 | `npm run gate:full` |
| Gate-Tests | **546** Tests, **546** grün, **0** rot, **0** übersprungen — davon 2 für den Prompter-Trace-Kanal (Literal-Pin, Fenster-Spiegel), 4 für die S1-Wurzelbindung (fremde Root wird verworfen, keine Migration aus fremdem Index, Prompter und Project Index antworten gleich, der Entscheidungsdatensatz nennt Identität und Quelle), 3 für die eine schemastery-Fassung (Manifest-Gleichheit, Harness-Range, genau ein Lock-Eintrag), 1 dafür, dass nur der Nutzertext einen Skill ausdrücklich nennt — die Intent-Expansion nicht — und 6 für `shinon doctor` S4 (eigener Unterbefehl, stabile Codes, read-only, presence-only, Hilfe, Fehlerpfade) | 0 | `npm run gate:test` |
| Codingmon-Tests | **46** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:codingmon` |
| Scoring-Tests (Kern, Signale, Ablage, Block-Gewichte) | **50** bestanden, **0** rot, **0** übersprungen — importfrei, läuft in CI ohne `npm ci`; die Host-Naht des Lernens fährt `scripts/gate/tests/scoring-block-learning.test.mjs` | 0 | `npm run test:scoring` |
| Token-Usage-Tests | **13** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:token` |
| Prompter-Tests (Zettel, Laufzeit-Index, Skills, Selektor, Vorschlag, Selektionsvertrag, Workspace-Vertrag) | **115** bestanden, **0** rot, **0** übersprungen — davon 6 für das Index-Größenbudget (`ZU_GROSS`, `BUDGET_ERSCHOEPFT`, Determinismus, Doppelzählung) und 11 für den Workspace-Vertrag S1 (eine Quelle, Cross-Workspace, `FOREIGN_ROOT`, Pfadgrenzen, Symlink-Grenze beim Lesen mit interner Positivprobe, stale Entfernung, Skills-Entkopplung, Referenzen) | 0 | `npm run test:prompter` |
| Narrative-Tests (Kern) | **9** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:narrative` |
| Popup-Tests (Faltung des Sitzungsfensters) | **12** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:popup` |
| Key-Router-Tests (Pool-Kern) | **17** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:key-router` |
| Traceability-Tests | **12** bestanden, **0** rot, **0** übersprungen | 0 | `npm run test:traceability` |
| Idiom-Blöcke | **16** Blöcke in **12** Dateien, deckungsgleich mit `scripts/lib/plugin-idioms.mjs` | 0 | `npm run idioms:check` |
| Build (`dist/`) | **22** Pakete, **185** Dateien, **1 528 266** Bytes | 0 | `npm run build` |
| Bestands-Block dieser Datei | deckungsgleich mit dem Baum | 0 | `npm run zahlen:check` |

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
| Skalierungslauf (Kopie + 20 Pakete = 39) | 2026-10-11 | 6 von 6 Stufen grün, ≈ 98 s | [docs/archive/SKALIERUNG_2026-10-11.md](archive/SKALIERUNG_2026-10-11.md) |
| Frischer Klon: `npm install` + `npm start -- --check` | 2026-10-13 | 731 Pakete, Lockfile byteidentisch, ohne `pnpm`/globales `dsh` | [PLAN.md](../PLAN.md) Schritt 3.4/3.5 |
| CI-Lauf (Branch-Stand `bf003a2`) | 2026-10-13 | 14 Jobs grün, Conclusion `success` | Run `38474747771` in der Actions-API |

## 3. Rote Befunde

In diesem Durchgang: **keine** im abschließenden Lauf. `npm test`, `npm run gate:test`,
`npm run gate:full` und `npm run build` enden mit Exit 0; es gibt keinen Skip und keinen
`NOT_APPLICABLE`-Befund außer `typescript` (es existiert weiterhin keine
First-Party-TypeScript-Datei).

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
`git log` (Commit-Nachricht mit Datenbeleg) und in `docs/archive/` (abgeschlossene
Nachweise und Übergaben). Diese Datei trägt nur den heutigen Ist-Zustand.
