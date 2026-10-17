<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="assets/banner.svg" alt="Shinon Forge — Built on DSH. Forged differently." width="100%">

<br/>

<!-- STATUS BOARD — Zahlen sind hier bewusst NICHT wiederholt; Eigentümer ist docs/ZAHLEN.md -->
<a href="https://github.com/vannon091118/shinon-forge/releases"><img src="https://img.shields.io/badge/version-v0.4.0-7B2FF7?style=for-the-badge&logo=git&logoColor=white" alt="Version (Spiegel von package.json, Zahl: docs/ZAHLEN.md §1)"/></a>&nbsp;
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-6B7280?style=for-the-badge" alt="MIT"/></a>&nbsp;
<a href="package.json"><img src="https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node (Spiegel von package.json, Zahl: docs/ZAHLEN.md §1)"/></a>&nbsp;
<a href="docs/INDEX.md"><img src="https://img.shields.io/badge/DOKU-INDEX-1D4ED8?style=for-the-badge&logo=readthedocs&logoColor=white" alt="Doku-Index"/></a>&nbsp;
<a href="docs/ZAHLEN.md"><img src="https://img.shields.io/badge/ZAHLEN-belegt-10B981?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Zahlen"/></a>

<br/><br/>

<a href="#-quickstart"><img src="https://img.shields.io/badge/%E2%96%B6%20QUICKSTART-7C3AED?style=for-the-badge" alt="Quickstart"/></a>&nbsp;
<a href="#-pakete"><img src="https://img.shields.io/badge/%F0%9F%A7%A9%20PAKETE-1D4ED8?style=for-the-badge" alt="Pakete"/></a>&nbsp;
<a href="#-architektur"><img src="https://img.shields.io/badge/%F0%9F%9B%A0%20ARCHITEKTUR-059669?style=for-the-badge" alt="Architektur"/></a>&nbsp;
<a href="#-projektstatus"><img src="https://img.shields.io/badge/%F0%9F%93%8A%20STATUS-DC2626?style=for-the-badge" alt="Status"/></a>

</div>

---

> **Status:** current — Einstieg in das Repository. **Stand:** 2026-10-17
> **Dokumentation:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

---

> **🇩🇪 / 🇬🇧 Dieses README ist bilingual.** Prosa-Sektionen gibt es auf Deutsch und
> Englisch; Tabellen, Baum und Statusblock gelten für beide Sprachen gemeinsam.
> **🇩🇪 / 🇬🇧 This README is bilingual.** Prose sections come in German and English;
> tables, tree and status block are shared.
>
> **Harte Zahlen stehen nicht in dieser Datei.** Sie haben genau einen Eigentümer:
> [`docs/ZAHLEN.md`](docs/ZAHLEN.md) — jede mit dem Befehl, der sie erzeugt.
> **Hard numbers do not live in this file.** They have a single owner:
> [`docs/ZAHLEN.md`](docs/ZAHLEN.md), each with the command that produces it.

---

## 🇩🇪 Was ist Shinon Forge?

**Ein Harness ist die Maschine. Shinon Forge ist das Cockpit.**

Shinon Forge ist ein unabhängiger Fork des **DeepSeek Harness (DSH)**. DSH liefert den
Kern: Agent-Loop, Tools, Sessions, Provider-Adapter, ein Plugin-System auf
**Cordis**-Basis. Wir bauen darauf die Schicht, die man tatsächlich anfasst.

Kein Neubau, kein Fremdcode, der hineingepfuscht wird. Wir besetzen DSHs eigene Slots
(`sidebar.brand.mark`, `conversation.hero.brand.mark`, `main`, `sidebar.panellist`)
statt Code zu patchen: *„Everything is a plugin."* Was DSH nicht anbietet, bauen wir
nicht daneben — wir bauen es darauf.

Ein Paket ist genau ein Ordner unter `packages/`, ein Bundle ist ein Paket mit
`dsh.bundle.patch`, und das kanonische Profil ist `profiles/shinon`. **Wie viele**
Pakete es gibt, welche davon aktiv sind und wie viele Layer das Profil hat, steht
gemessen in [`docs/ZAHLEN.md`](docs/ZAHLEN.md) — nicht in Fließtext.

## 🇬🇧 What is Shinon Forge?

**A harness is the machine. Shinon Forge is the cockpit.**

Shinon Forge is an independent fork of the **DeepSeek Harness (DSH)**. DSH provides the
core: agent loop, tools, sessions, provider adapters, a plugin system on **Cordis**.
We build the layer you actually touch on top of it.

Not a rewrite, no foreign code jammed in. We occupy DSH's own slots
(`sidebar.brand.mark`, `conversation.hero.brand.mark`, `main`, `sidebar.panellist`)
instead of patching code: *"Everything is a plugin."* What DSH does not offer, we do not
build beside it — we build on top of it.

One package is exactly one folder under `packages/`, a bundle is a package with
`dsh.bundle.patch`, and the canonical profile is `profiles/shinon`. **How many**
packages exist, which are active and how many profile layers there are is measured in
[`docs/ZAHLEN.md`](docs/ZAHLEN.md) — not in prose.

---

## ▶ Quickstart

> **Release-Ziel v0.4.0:** der eingefrorene Umfang sieht **einen** Installationsweg
> vor — den Quellklon mit den Befehlen unten. Der Freeze ist keine Freigabe: die
> Abnahme aus `PLAN.md` §9.1 ist noch nicht vollständig. `shinon doctor` ist seit
> 2026-10-17 ein eigener read-only CLI-Unterbefehl (S4 belegt: Test
> `scripts/gate/tests/doctor-cli.test.mjs`, Probelauf Exit 0). `shinon update`, persistentes
> `shinon autoupdate` und ein `.deb` als unterstützter Release-Installationsweg sind
> **nicht** v0.4.0-Umfang (Folgearbeit: `docs/ROADMAP.md` §1.5). Ein global
> installiertes `dsh` ist nicht der getestete Weg: das Repo pinnt seine DSH-Fassung
> selbst (`node_modules/.bin` vor dem PATH, Zahl: `docs/ZAHLEN.md` §1).

```bash
# 1. Dieses Repo klonen
git clone https://github.com/vannon091118/shinon-forge.git
cd shinon-forge

# 2. Wurzel-Abhängigkeiten aus dem Lockfile (npm ist die einzige Paketquelle)
npm ci

# 3. Profil-Links setzen: `profiles/shinon` bindet seine Bundles mit `link:` —
#    npm lehnt das außerhalb des Root-Workspace-Modells ab (EUNSUPPORTEDPROTOCOL).
#    Das Werkzeug ist idempotent und verweigert Fremdpfade mit Exit 2.
npm run profile:links
#    Prüfen ohne zu schreiben:  node scripts/profile-links.mjs --check

# 4. Prüfen, ob das Profil auflöst   → in diesem Durchlauf ausgeführt: Exit 0
                                         (Layer und Bundles: docs/ZAHLEN.md §2)
DSH_HOME=$PWD ./node_modules/.bin/dsh --profile shinon --dump-config

# 5. Booten (Web-UI)   → im Frischklon mit HTTP 200 belegt, siehe docs/S3-FRESH-d8999ab.md
DSH_HOME=$PWD ./node_modules/.bin/dsh --profile shinon
```

Schritt 4 ist belegt (`node scripts/shinon-profile-test.mjs`, Exit 0, Zahl: `docs/ZAHLEN.md` §2).
Schritte 2, 3 und 5 sind am 2026-10-17 in einem frischen Klon mit Exit-Codes belegt:
`docs/S3-FRESH-d8999ab.md` (`npm ci` Exit 0, 29 Links Exit 0, UI HTTP 200 mit 41 314 Bytes
HTML). Für Schritte, die einen Modellschlüssel oder einen Browser brauchen, gibt
es hier keinen Beleg — sie stehen in `docs/ZAHLEN.md` §4 unter „nicht geprüft“.

`shinon doctor` ist seit 2026-10-17 die read-only Diagnose für v0.4.0: `bin/shinon.mjs`
reicht `doctor` an `scripts/doctor.mjs` weiter (nie an DSH), mit stabilen Codes 0/1/2
und Schlüsseln nur als Anwesenheit. Das statische Gate `doctor`
(`scripts/gate/plugins/doctor.mjs`) prüft daneben weiter die Repo-Konsistenz. S4 ist
belegt (Test + Probelauf Exit 0); S5/S6 bleiben offen, also gilt v0.4.0 weiter als nicht
abgenommen. `npm run update` bleibt der **DSH-Upstream**-Updater und
aktualisiert nicht Shinon Forge.

Daneben enthält der Baum Bediener-Werkzeuge (`npm run install:user`,
`npm run verify:install`, `npm run backup:retention`); der eingefrorene
v0.4.0-Abnahmeweg bleibt der Quellklon, bis `PLAN.md` §9.1 einen weiteren
Slice belegt.

---

## 🔌 Boot und Schlüssel

`DSH_HOME` ist **nicht** das Repo-Root. Der Grund ist gemessen: DSH liest
`$DSH_HOME/AGENTS.md` als benutzerglobale Anweisung in jeder Sitzung — mit dem Baum als
Home wurde dessen `AGENTS.md` zur globalen Anweisung fremder Projekte. Der Starter legt
das Home deshalb im Zustandsordner an (`dev-dsh-home`, im Installat `dsh-home`) und
verlinkt hinein, was zusammengehört: `profiles/`, `sessions/`, `logs/`, `.env` und
`.credentials.yaml`. Die Anweisungsdatei bleibt draußen; sie wird als Projektanweisung
geladen, wenn die Sitzung in diesem Repo läuft, und sonst gar nicht.

Wer das Home selbst setzt, setzt es absolut (`DSH_HOME=/pfad`); ein relativer Wert wird
abgelehnt. Ein fremder Link im Home wird gemeldet, nie überschrieben.

**Wo was liegt** — eine Quelle ist `scripts/lib/paths.mjs` (Namen entstehen dort einmal):
(`package.json` mit `dsh.profile.bundles` und `cordis.patch.yml` — ein
`pnpm-workspace.yaml` führt dieses Repo nicht mehr, Schritt 3.5/A1).
Der Schlüssel gehört **nie** ins Repo — im Profil steht nur der Referenzname
(`apiKeyEnv`), das Secret kommt aus der Umgebung:

```bash
export SHINON_API_KEY="…"
node bin/shinon.mjs --profile headless "Sag nur: OK"
```

Ohne gesetzte Variable schlägt der Aufruf fail-closed fehl (beabsichtigt). In der
Web-UI bestimmt die bewusst gewählte Modellroute den benötigten Schlüssel: ein
Schlüssel für die Profil-Standardroute Agnes ersetzt zum Beispiel
`DEEPSEEK_API_KEY` nicht, wenn du gezielt eine DeepSeek-Route auswählst.
`MISSING_CREDENTIAL` nennt die aktive Route und ihre fehlende Referenz. Wenn diese
Auswahl beabsichtigt ist, konfiguriere genau dieses Credential über den
Credentials-Dienst oder die passende Umgebungsvariable; war sie unbeabsichtigt,
wähle das gewünschte Modell zurück. Gehe nicht von einem automatischen Wechsel zur
Standardroute aus. Ob eine Route in deiner Umgebung antwortet, hängt an deinem
Schlüssel und ist deshalb **nicht** Teil der belegten Zusagen dieses Repos.

---

## 🧩 Pakete

Ein Paket ist ein Ordner unter `packages/`. Vier Rollendateien sind Pflicht
(`index.js`, `client.js`, `cordis.patch.yml`, `package.json`); zusätzlich erlaubt sind
`assets/`, `test/` und benannte Ausnahmen — die **eine** verbindliche Aussage dazu
steht in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §2.

| Paket | Rolle | Profil |
|---|---|---|
| **[@shinon/core](packages/core)** | Branding-Overlay: Sidebar- und Hero-Marke, Farbverlauf, Pulse | ✅ |
| **[@shinon/persona](packages/persona)** | Shinon als Persona-Schicht im DSH-System-Prompt | ✅ |
| **[@shinon/locale-de](packages/locale-de)** | Deutsche Sprache, Namespace `shinon` | ✅ |
| **[@shinon/tooltip](packages/tooltip)** | Styles für erweiterte Tooltips (keine Tooltip-Logik) | ✅ |
| **[@shinon/events](packages/events)** | Hook/Event-Spine: beobachten, normalisieren, validieren, emittieren | ✅ |
| **[@shinon/hook](packages/hook)** | Event-Beobachtung auf der Host-Seite, Replay-Fixture | ✅ |
| **[@shinon/markers](packages/markers)** | Marker-Spiegel (Brutalord-Regeln) im nativen Side Panel | ✅ |
| **[@shinon/dashboard](packages/dashboard)** | Status-Panel; liest die echten `workspaces`/`sessions`-Dienste | ✅ |
| **[@shinon/prompter](packages/prompter)** | One-Shot Prompt-Enhancer am `agent/pre-step` (Route im Profil leer) | ✅ |
| **[@shinon/task-router](packages/task-router)** | liest die validierte Klassifikation des Enhancers | ✅ |
| **[@shinon/project-index](packages/project-index)** | persistenter Projektindex (files, symbols, edges, FTS) außerhalb des Repos | ✅ |
| **[@shinon/scoring](packages/scoring)** | Scoring-Schicht: Scorecard lesen, nie schreiben (Decay, Relation, Signal-Ohren) | ✅ |
| **[@shinon/codingmon](packages/codingmon)** | Pet-/Kampf-System mit dauerhaftem Zustand und Client→Host-Naht | ✅ |
| **[@shinon/key-router](packages/key-router)** | Key-Pool mit 429-Rotation: Werkzeuge `key_router_status`/`key_router_rotate`/`key_router_probe`, Provider-Override für konfigurierte Credentials-Referenzen; echte Provider-Rotation mit realen Schlüsseln nicht live geprüft | ✅ |
| **[@shinon/narrative](packages/narrative)** | Chronicle, Arcs, Relationships, Composite State (Zug 5 aktiviert) | ✅ |
| **[@shinon/shinon-forge](packages/shinon-forge)** | Memory Sync, Global Runner, Engine Adapters | — |
| **[@shinon/better-errors](packages/better-errors)** | Config-Ebene ohne Logik: `apply()` loggt nur | ✅ |
| **[@shinon/token-usage](packages/token-usage)** | zeigt im Sidebar-Fuß die Token-Zahl des JÜNGSTEN Turns (aus dessen eigenen Ereignissen gefaltet, dieselbe Zahl wie DSHs Turn-Zeile) und im Titel daneben die Sitzungssumme (DSH-Sitzungs-Projektion `tokenUsage`, dieselbe Zahl wie DSHs Fußpille) | ✅ |
| **[@shinon/openapi](packages/openapi)** | Vertrag (`openapi.yaml`) vorhanden, **kein** Server — bewusst nicht aktiviert | — |
| **[@shinon/mobile](packages/mobile)** | minimale Viewport-Unterstützung für das erste Android-Runtime-Profil — Vorbereitung, bewusst nicht aktiviert | — |
| **[@shinon/popup](packages/popup)** | Fortschritts-Overlay im `conversation.composer.dock`: faltet das Ereignisfenster der Sitzung (Schritt, offene Aufrufe, zuletzt benutztes Werkzeug) und übersetzt den Text aus `locale-de` | ✅ |
| **[@shinon/traceability](packages/traceability)** | flüchtige Toasts im Chat: Tool-Calls mit Ergebnis, Schritte und Fehler als Benachrichtigung | ✅ |

Die Spalte „Profil“ ist gemessen aus `profiles/shinon/package.json` (Zahl: `docs/ZAHLEN.md` §1).
`mobile`, `openapi` und `shinon-forge` stehen nicht darin — bei `openapi` ist das eine
dokumentierte Entscheidung (`docs/ARCHITECTURE.md` §4), bei `shinon-forge` ein Verdikt
(es startet fremde Engines; `PLAN.md` §3.12.1), bei `mobile` Vorbereitung
(`0.1.0`, Weg ins Mobile-Profil). Alle drei tragen selbst
`"dsh": { "inactive": true }` im eigenen Manifest (`dead-package`-Gate).
Alle Pakete sind eingecheckt; ob ein Paket aktiv ist, entscheidet
allein `dsh.profile.bundles` im Profil (Bestandszahlen: `docs/ZAHLEN.md` §1).

---

## 🛠 Architektur

```text
                    ┌─────────────────────────┐
                    │          DSH            │   Runtime: Loop, Tools,
                    │  (Agent = Model+Harness)│   Sessions, Provider, Cordis
                    └────────────┬────────────┘
                                 │  Slots · Events · Bundles
                    ┌────────────▼────────────┐
                    │      SHINON FORGE       │   Overlay: Brand, Sprache,
                    │   @shinon/* Bundles     │   UI-Schichten, Governance
                    └────────────┬────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
   Governance               Branding                  Schichten
   scripts/gate/            packages/core             locale-de, tooltip,
   Gates + Slices           Slots statt Patches       dashboard, events …
```

**Regel:** DSH ist die Laufzeit, wir bauen Schichten darauf — kein zweiter Kernel
daneben. Verbindlich: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 📊 Projektstatus

Statusklassen — Befehle stehen hier, Belege in `docs/ZAHLEN.md`:

- **Verified** — in einem belegten Durchlauf ausgeführt und **Exit 0 gesehen** (Zeitpunkt und Zählung je Beleg: [`docs/ZAHLEN.md`](docs/ZAHLEN.md) §2).
- **Rot** — in diesem Durchlauf ausgeführt und **nicht** Exit 0; der Befund steht in
  [`docs/ZAHLEN.md`](docs/ZAHLEN.md) §3.
- **Nicht geprüft** — kein Exit-0-Beleg aus diesem Durchlauf (auch wenn es früher lief).

| Bereich | Status 2026-10-10 | Beleg |
|---|---|---|
| Namensvertrag, Manifeste, Syntax, Legacy-Guard, Ressourcen, Komposition | **Verified** | `node scripts/shinon-test.mjs` → Exit 0 |
| Regel-Fixtures (Gate **und** Build müssen rot werden) | **Verified** | `node scripts/validate-test.mjs` → Exit 0 |
| Profil `profiles/shinon` auflösbar (alle Layer, alle eigenen Bundles) | **Verified** | `node scripts/shinon-profile-test.mjs` → Exit 0 |
| Marker-Regeln in Vertrag + Host + Client | **Verified** | `node --test scripts/gate/tests/markers.test.mjs` → Exit 0 |
| Event-Spine gegen die eingefrorene Fixture | **Verified** | `node --test scripts/gate/tests/events-spine.test.mjs` → Exit 0 |
| Codemon-Kernmathematik, Kompositor-Regel, Client-Durchstich im vm | **Verified** | `npm run test:codingmon` → Exit 0 (überspringt sichtbar, was DSH-Bausteine braucht) |
| Distributionstest (`npm pack` → Isolat → Load) | **Verified** | `node scripts/pack-test.mjs` → Exit 0 |
| Web-UI-Boot in Chromium + Panel-Beleg | **Verified** | `dsh --profile shinon` + `node scripts/panel-check.mjs --url … --token …` → Exit 0 |
| Gate-Engine `--full` | **Verified** (alle Gates grün; die Versions-Regel folgt aus dem Manifest des Pakets, Undeklariertes bleibt rot) | `npm run gate:full` → Exit 0 |
| Gate-Tests (reine Gate-Logik) | **Verified** (braucht Node ≥ 22 und Repo-`dsh` zuerst im PATH — Details: `docs/ZAHLEN.md` §2) | `node --test scripts/gate/tests/*.test.mjs` → Exit 0 |
| Skalierung: Kopie des Baums plus Klon-Pakete (`--plugins N`, Standard im Skript) durch die ganze Kette | **Verified** | `npm run scale:check` → Exit 0 |
| Volle Kette | **Verified** | `npm run test:full` → Exit 0 (nur CI/auf Zuruf; lokal läuft `npm test`) |
| Echter Modellaufruf | **Nicht geprüft** | `docs/ZAHLEN.md` §4 |

Zählungen, Exit-Codes und die Ursachen jedes roten Befunds stehen **nur** in
[`docs/ZAHLEN.md`](docs/ZAHLEN.md) §2/§3.

---

## ⚙ Build & Test

Die Befehle aus `package.json` (`scripts`), in der Reihenfolge, in der man sie braucht — Auswahl, vollständig ist die Datei selbst:

| Befehl | Wirkung |
|---|---|
| `npm test` | schneller lokaler Pfad (Sekunden): statisches Gate + lokale Engine-Slices — die einzige Option für den Alltag; stoppt beim ersten Fehler |
| `npm run test:full` | volle Kette (nur CI/auf Zuruf): Codingmon-Tests → Gate → Fixtures → Distribution → Profil (stoppt beim ersten Fehler) |
| `node scripts/shinon-test.mjs` | statisches Gate: Manifest, Namensvertrag, `index.js`, `client.js`, `cordis.patch.yml`, Legacy-Guard, Quell-Zwillings-Drift, Profil |
| `node scripts/validate-test.mjs` | Regel-Fixtures: jede Regel muss Gate **und** Build rot werden |
| `node scripts/pack-test.mjs` | Distribution je Paket: `npm pack` → entpacken → isoliert installieren → laden |
| `node scripts/shinon-profile-test.mjs` | Profiltest: `dsh --profile shinon --dump-config`, alle Layer |
| `npm run gate` / `gate:local` / `gate:full` | modulare Gate-Engine (Slices / lokal / alle Gates) |
| `npm run gate:test` | reine Gate-Logik (kein DSH nötig) |
| `npm run test:codingmon` / `test:hook` | paketlokale Tests |
| `npm run build` | regeneriert `dist/` (Manifest, Profil, Paketkopien) |
| `npm run dev` / `dev:web` / `open` | DSH mit dem Profil starten (Web-UI) |
| `npm start [-- …]` · `shinon [-- …]` | der Einstieg ([`bin/shinon.mjs`](bin/shinon.mjs), auch als `bin`-Feld im Manifest): heilt Node ≥ 22 selbst, findet `dsh` auch außerhalb des PATH und **nennt dessen Herkunft**, startet das Profil; `--check` prüft nur die Startfähigkeit. `scripts/start.mjs` bleibt als kompatibler Aufruf und importiert dieselbe Umsetzung |
| `npm run verify:panel` | Panel-Beleg über `scripts/panel-check.mjs` (braucht jsdom) |
| `npm run install:user` | Nutzer-Installat mit Abnahme: `install`/`update`/`rollback`/`status`/`history`/`auto`/`units`/`selftest`/`uninstall` (`scripts/install-user.mjs`) |
| `npm run uninstall:user` | Rückweg: Timer und Desktop-Verknüpfung weg, Zugangsdateien in einen Tresor (0600) — `--purge` löscht sie stattdessen, `--keep-checkout` lässt den Baum stehen. Die nächste Installation setzt den Tresor zurück und überschreibt nie einen neueren Stand (`scripts/lib/secrets.mjs`) |
| `npm run verify:install` | read-only Selbsttest eines bestehenden Stands: Check, Doctor, Boot, HTTP-Nachweis (Exit 0 nur bei 4/4) |
| `npm run backup:retention` | Aufbewahrung des Sicherungsordners (`--keep`, `--max-age`, `--dry-run`, `--json`; jede Anwendung protokolliert) |
| `npm run profile:links` | Profil-Links setzen/prüfen (idempotent, Fremdpfade Exit 2) |
| `npm run stages` | Startstufen/Ready-Zeile aus `scripts/open.mjs` nachvollziehen |
| `npm run scale:check` | Skalierungsnachweis: Kopie des Baums + `--plugins N` neue Klon-Pakete durch Idiome, Gate, `gate:full`, Gate-Tests, Distribution und Build — braucht Node ≥ 22, eigener Lauf — weder `npm test` noch `test:full` (`N` und sein Standard: `scripts/scale-check.mjs`) |
| `npm run commit:guard -- …` | Commit-Regeln prüfen (`--ci`, `--last n`, `--range`, `--all`) |
| `npm run hooks:install` | Git-Hooks aktivieren (einmal pro Klon) |
| `npm run update` | echte Registry-Prüfung (Maximum nach Semver) ins kanonische Profil; offline UNGEPRÜFT statt „keine Updates"; Install-Pfad live ungeprüft |
| `npm run desktop:launcher` | Desktop-Starter (Konzept, siehe [`docs/STARTER-PLAN.md`](docs/STARTER-PLAN.md)) |

---

## 🗺 Offene Arbeit (gemessen, nicht gewünscht)

- **Rote Prüfläufe beheben** — Reihenfolge und Ursachen: [`docs/ZAHLEN.md`](docs/ZAHLEN.md) §3.
  Einer ist Umgebungsarbeit (`schemastery` fehlt im Root, deshalb wird
  `codingmon-store` rot statt zu überspringen), einer ist ein bewusstes Verhalten
  (`message-ingress` verweigert die Zusage gegen eine ungeprüfte DSH-Fassung).
- **Versionsangleich der Pakete**: die Zeile folgt aus dem eigenen Manifest (`dsh.inactive`
  darf `0.1.0` führen, sonst `1.0.0`) — die gemessene Verteilung steht in
  `docs/ZAHLEN.md` §1; das statische Gate `doctor` ist grün, der gleichnamige Laufzeit-Unterbefehl ist seit 2026-10-17 implementiert und belegt (v0.4.0-S4).
- **Nicht aktivierte Pakete** (`mobile`, `openapi`, `shinon-forge`): alle drei sind entschieden, nicht
  vergessen — `mobile` ist Vorbereitung für das Mobile-Profil, `openapi` hat einen Vertrag ohne Server, `shinon-forge` startet fremde Engines.
  `key-router` und `popup` sind am 2026-10-13 aktiviert worden (Overlay bzw. Pool-Werkzeuge).
  Offen bleibt nur die Live-Probe der 429-Rotation gegen den echten Anbieter mit
  echten Schlüsseln; die Pool-/Override-Kette bis zum Loopback-Draht ist getestet.
- **Native App** (Stufe 1 scharf, 2–4 Konzept): [`docs/STARTER-PLAN.md`](docs/STARTER-PLAN.md).
- **Belege nachziehen**, wo nur ältere Messungen existieren: `docs/probes/` nennt je
  Probe sein Datum.

---

## 📚 Struktur

```text
Shinon-forge/
├── packages/                  # jedes Paket = ein Ordner: @shinon/<ordner>  (Anzahl: docs/ZAHLEN.md §1)
│   ├── core/ persona/ locale-de/ tooltip/ events/ hook/ markers/ dashboard/
│   ├── prompter/ task-router/ project-index/ codingmon/ key-router/ narrative/ popup/
│   ├── better-errors/ token-usage/
│   └── openapi/ shinon-forge/ # bewusst nicht im Profil (Entscheidung bzw. Verdikt)
├── profiles/
│   ├── shinon/                # kanonisches Profil (dsh.profile.bundles, cordis.patch.yml)
│   └── headless/              # One-shot-Profil (Modell-Route)
├── docs/
│   ├── INDEX.md               # Einstieg + Statusregel für jedes Dokument
│   ├── ZAHLEN.md              # einziger Eigentümer aller harten Zahlen
│   ├── ARCHITECTURE.md        # Namespace, Paketgrenzen, Profil-Vertrag
│   ├── COMMIT-REGELN.md       # Commit-Regeln und Durchsetzung
│   ├── STARTER-PLAN.md        # native App (plan)
│   ├── S*-Protokolle (S3/S4/S5/S6: Release-Belege 2026-10-17, current)
│   ├── contracts/             # Verträge (JSON, mit Statusfeld)
│   ├── probes/                # Falsifikations-Proben (JSON, mit Datum)
│   ├── archive/               # archivierte Altfassungen (u. a. IDEA-raw-export.md)
│   ├── audit/                 # laufende Nachweise (transient, wandern nach Abschluss ins Archiv)
│   └── archive/               # abgeschlossene Stände + importierte Fremdtexte (u. a. legacy-goose-prompts)
├── IDEA.md · shinon-forge-implementierungsplan.md   # current bzw. historical (Statusblock im Kopf)
├── scripts/                   # Gate-Engine, Build, Tests, Helfer (gate/, lib/, *.mjs)
├── assets/banner.svg
└── profiles/shinon/          # out-of-tree-Profil (package.json, cordis.patch.yml, cordis.yml)
```

Jede Datei in `docs/` trägt einen Statusblock; die vollständige Liste steht in
[`docs/INDEX.md`](docs/INDEX.md) §3.

---

## 🔗 Referenzen (extern, hier nicht geprüft)

- [DSH Architektur](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Schemastery Config](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.md)
- [Locale Plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/locale/README.md)
- [Plugin Manager](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)

---

<div align="center">

**Powered by DSH. Developed by a solo dev on an FX-6300.**

`@shinon/*` · MIT · Node-Fassung und alle weiteren Zahlen: `docs/ZAHLEN.md` §1

</div>
