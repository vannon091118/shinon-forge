<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="assets/banner.svg" alt="Shinon Forge — Built on DSH. Forged differently." width="100%">

<br/>

<!-- STATUS BOARD -->
<a href="https://github.com/vannon091118/shinon-forge/releases"><img src="https://img.shields.io/badge/version-v0.2.0-7B2FF7?style=for-the-badge&logo=git&logoColor=white" alt="Version"/></a>&nbsp;
<a href="#-build--test"><img src="https://img.shields.io/badge/gate-14%2F14-10B981?style=for-the-badge&logo=githubactions&logoColor=white" alt="Gate"/></a>&nbsp;
<a href="#-build--test"><img src="https://img.shields.io/badge/tests-96%20PASS-10B981?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Tests"/></a>&nbsp;
<a href="#-boot"><img src="https://img.shields.io/badge/boot-EXIT%200-00E5FF?style=for-the-badge&logo=terminal&logoColor=white" alt="Boot"/></a>&nbsp;
<a href="#-plugins"><img src="https://img.shields.io/badge/bundles-7-F107A3?style=for-the-badge&logo=puzzle&logoColor=white" alt="Bundles"/></a>&nbsp;
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-6B7280?style=for-the-badge" alt="MIT"/></a>

<br/><br/>

<a href="#-quickstart"><img src="https://img.shields.io/badge/%E2%96%B6%20QUICKSTART-7C3AED?style=for-the-badge" alt="Quickstart"/></a>&nbsp;
<a href="#-plugins"><img src="https://img.shields.io/badge/%F0%9F%A7%A9%20PLUGINS-1D4ED8?style=for-the-badge" alt="Plugins"/></a>&nbsp;
<a href="#-architektur"><img src="https://img.shields.io/badge/%F0%9F%9B%A0%20ARCHITEKTUR-059669?style=for-the-badge" alt="Architektur"/></a>&nbsp;
<a href="#-roadmap"><img src="https://img.shields.io/badge/%F0%9F%97%BA%20ROADMAP-DC2626?style=for-the-badge" alt="Roadmap"/></a>

</div>

---

> **🇩🇪 / 🇬🇧 Dieses README ist bilingual.** Jede Sektion gibt es auf Deutsch und Englisch.
> **🇩🇪 / 🇬🇧 This README is bilingual.** Every section comes in German and English.

---

## 🇩🇪 Was ist Shinon Forge?

**Ein Harness ist die Maschine. Shinon Forge ist das Cockpit.**

Shinon Forge ist ein unabhängiger Fork des **DeepSeek Harness (DSH)** — und schreibt sich
offen in die erste Zeile, wo es herkommt. DSH liefert den Kern: Agent-Loop, Tools, Sessions,
Provider-Adapter, ein Plugin-System auf **Cordis**-Basis. Wir bauen darauf die Schicht, die
man tatsächlich anfasst.

Kein Neubau. Kein Fremdcode, der hineingepfuscht wird. **Sieben eigene Bundles**, die sich in
DSH einklinken, weil DSH genau dafür gebaut ist: *„Everything is a plugin."*

> **Das Prinzip: ein Overlay, kein Fork-Zoo.**
> Wir besetzen DSHs eigene Slots (`sidebar.brand.mark`, `conversation.hero.brand.mark`),
> statt Code zu patchen. Was DSH nicht anbietet, bauen wir nicht daneben — wir bauen es
> *darauf*.

## 🇬🇧 What is Shinon Forge?

**A harness is the machine. Shinon Forge is the cockpit.**

Shinon Forge is an independent fork of the **DeepSeek Harness (DSH)** — and it says so
openly in the first line. DSH provides the core: agent loop, tools, sessions, provider
adapters, a plugin system built on **Cordis**. We build the layer you actually touch.

Not a rewrite. No foreign code jammed in. **Seven first-party bundles** that hook into DSH
because DSH was designed for exactly that: *"Everything is a plugin."*

> **The principle: an overlay, not a fork zoo.**
> We occupy DSH's own slots (`sidebar.brand.mark`, `conversation.hero.brand.mark`) instead
> of patching code. What DSH doesn't offer, we don't build beside it — we build *on top*.

---

## ▶ Quickstart

```bash
# 1. DSH installieren (falls noch nicht da)
npm install -g @deepseek-ai/dsh

# 2. Dieses Repo klonen
git clone https://github.com/vannon091118/shinon-forge.git
cd shinon-forge

# 3. Profil-Dependencies auflösen (out-of-tree-Profil)
(cd profiles/shinon && pnpm install)

# 4. Prüfen, ob das Profil auflöst
DSH_HOME=$PWD dsh --profile shinon --dump-config   # → EXIT 0

# 5. Booten
DSH_HOME=$PWD dsh --profile shinon
```

---

## 🔌 Boot

Das Repo-Root ist das `DSH_HOME`: dort liegt `profiles/shinon` als echtes DSH-Profil
(`package.json` mit `dsh.profile.bundles`, `cordis.patch.yml`, `pnpm-workspace.yaml`).
Das Modell läuft über den `pi-ai`-Adapter — OpenRouter oder jeder OpenAI-kompatible Gateway.

**Wichtig — der Key gehört nie ins Repo:**

```bash
# Im Profil steht nur der REFERENZNAME (apiKeyEnv: SHINON_API_KEY).
# Das Secret kommt aus der Umgebung:
export SHINON_API_KEY="sk-or-..."
DSH_HOME=$PWD dsh --profile headless "Sag nur: OK"   # → OK, exit 0
```

Ohne gesetzte Variable schlägt der Aufruf **fail-closed** fehl (`MISSING_CREDENTIAL`) —
lieber laut als still falsch.

---

## 🧩 Plugins

Sieben Bundles, jedes genau vier Dateien (`index.js`, `client.js`, `cordis.patch.yml`,
`package.json`):

| Bundle | Rolle |
|---|---|
| **@shinon/core** | Branding-Overlay: Sidebar- & Hero-Marke, Farbverlauf |
| **@shinon/locale-de** | Deutsche Sprache, Namespace `shinon` |
| **@shinon/tooltip** | Erweiterte Tooltips |
| **@shinon/dashboard** | Status-Panel |
| **@shinon/better-errors** | Bessere Fehlermeldungen |
| **@shinon/token-usage** | Token-/Kosten-Anzeige |
| **@shinon/openapi** | REST-Schicht (bewusst **nicht** aktiviert) |

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
                    │   7 × @shinon/* Bundles │   UI-Schichten, Governance
                    └────────────┬────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
   Governance               Branding                  Schichten
   scripts/gate/            packages/core             locale-de, tooltip,
   14 Checks · slices       Slots statt Patches       dashboard, errors…
```

**Regel:** DSH ist die Laufzeit. Wir bauen Schichten darauf — kein zweiter Kernel daneben.
Verbindliche Konventionen: [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md).

---

## 📊 Projektstatus

Dieser Teil beschreibt den **tatsächlichen** Stand. Statusklassen:

- **Verified** – durch ausführbare Checks in `npm test` belegt (Exit 0)
- **Experimental** – Code vorhanden, aber nicht zur Laufzeit verifiziert
- **Planned** – noch nicht implementiert

| Feature | Status | Beleg / Lücke |
|---|---|---|
| Namensvertrag der 7 Plugins (`@shinon/*`) | Verified | Gate: `package.json` ↔ Patch-id/name ↔ Profil-Bundle ↔ ModuleLoader-id ↔ Exports |
| Paket-Struktur, Syntax, Exports | Verified | Gate |
| Distribution: `pnpm pack` → Isolat → Load für alle 7 Pakete | Verified | `npm test` → `scripts/pack-test.mjs` (28 Checks) |
| Patch-Schema: YAML, Struktur, Typen, required Keys | Verified | Gate + Build, Fixture je Regel in `scripts/validate-test.mjs` |
| Ressourcen: jede Manifest-/Config-Referenz existiert und parst | Verified | Gate + Build, Fixture „fehlende Ressource“ |
| Komposition: keine doppelten Patch-ids, Paketgraph ohne Zyklus | Verified | Gate + Build, Fixtures „doppelte ID“/„Zyklus“ |
| Profil `profiles/shinon` auflösbar (8 Layer, 6 Paket-Bundles) | Verified | `scripts/dsh-profile-test.mjs` (`--dump-config`, Exit 0) |
| Echter Modell-Boot (headless, OpenRouter/pi-ai) | Verified | `dsh --profile headless "…"` → Exit 0, verifiziert 2026-10-07 |
| Gate-Engine (`scripts/gate/`, 14 Checks, Slice-fähig) | Verified | `npm run gate:full` 14/14, `gate:test` 22/22 |
| Vertragsform (7-Punkt) + Probe/Twin (Anti-Vakuum) | Verified | `Docs/contracts/`, `Docs/probes/`, Gate-Plugins |
| Build-Pipeline (`npm run build`) | Verified | `dist/` mit `manifest.json`, `profile.json`, 7 Paketkopien |
| Core-Branding im laufenden Web-Client | **Verified** | `dsh --profile shinon` → `.shinon-mark` ×2 im DOM, Wortmarke `SHINON`, Farbverlauf aktiv (Screenshot 2026-10-07) |
| Web-UI Chat-Turn (echtes Modell) | **Verified** | `Completed in 5s`, `WEBUI_OK`, `Usage 7.9K tok` — kein `MISSING_CREDENTIAL` |
| Deutsche Sprache (`packages/locale-de`) | Experimental | registriert Sprache `de`; UI-Texte nicht vollständig geprüft |
| Tooltips (`packages/tooltip`) | Experimental | nur Styles, keine Tooltip-Logik |
| Dashboard / Token-Usage / Better-Errors | Planned | statische Platzhalter |
| OpenAPI-Server (`packages/openapi`) | Planned | Vertrag vorhanden, Server fehlt; bewusst nicht aktiviert |
| Compatibility-Test gegen DSH | Planned | das Gate prüft eigene Verträge, nicht die DSH-API |

---

## ⚙ Build & Test

```bash
# Volle Kette: Gate + Regel-Fixtures + Distribution + Profiltest
npm test

# Einzeln
node scripts/dsh-test.mjs          # statisches Gate (37 Checks)
node scripts/validate-test.mjs     # Vertrags-/Struktur-Fixtures
node scripts/pack-test.mjs         # Distribution: pack → Isolat → load (28 Checks)
node scripts/dsh-profile-test.mjs  # bootet das Profil, prüft alle Layer

# Modularer Gate-Runner (slice-fähig)
npm run gate:full                  # 14 Checks
npm run gate:test                  # reine Gate-Logik (22 Tests)

# Artefakte
node scripts/build.mjs             # regeneriert dist/
```

---

## 🗺 Roadmap

- [x] **Gate-Engine** — modularer Runner, 14 Checks, Diff-Slicing
- [x] **Out-of-tree-Profil** — `dsh --profile shinon --dump-config` → EXIT 0
- [x] **Echter Boot** — headless über OpenRouter/pi-ai, EXIT 0
- [x] **Vertragsform** — 7-Punkt-Verträge, 4 Zustände, maschinell geprüft
- [x] **Doctor + Registry** — Drift-Erkennung, Bundle-Auflösung
- [x] **Probe/Twin** — Struktur-Prüfer, Anti-Vakuum, Vokabular
- [ ] **Live-Indikator** — `conversation.input.activity`, animierte Plugin-Layer
- [ ] **Narrativsystem** — `/pets`, Level, narrative Beziehungen, Lernen
- [ ] **Evil-Twin-Protokoll** — zweite Stimme, maus-nativ

---

## 📚 Struktur

```
Shinon-forge/
├── packages/                  # jedes Paket = ein Plugin: @shinon/<ordner>
│   ├── core/                  # Branding & Design (Overlay)
│   ├── locale-de/             # Deutsche Sprache
│   ├── tooltip/               # Tooltips (nur Styles)
│   ├── dashboard/             # Dashboard (Platzhalter-Panel)
│   ├── better-errors/         # Bessere Fehler (Platzhalter)
│   ├── token-usage/           # Token-Anzeige (Platzhalter)
│   └── openapi/               # OpenAPI (Vertrag ja, Server nein, nicht im Profil)
├── Docs/
│   ├── ARCHITECTURE.md        # Namespace-Regel, Paketgrenzen, Profil-Vertrag
│   ├── FOUNDATION-PLAN.md     # Fundament-Plan auf der DSH-Architektur
│   ├── REPO-ANALYSIS.md       # Analyse der Schwester-Repos
│   ├── contracts/             # 7-Punkt-Verträge mit Status
│   └── probes/                # Falsifikations-Proben
├── profiles/
│   ├── shinon/                # Kanonisches DSH-Profil
│   └── headless/              # One-shot-Profil (Modell-Route)
├── scripts/
│   ├── dsh-test.mjs           # Gate: Manifest, Patch-Schema, Ressourcen, Komposition
│   ├── gate/                  # modularer Gate-Runner + Plugins
│   ├── lib/                   # repo.mjs (eine Validierungsquelle), yaml.mjs
│   └── build.mjs              # Artefakte nach dist/
└── assets/banner.svg
```

---

## 🔗 Referenzen

- [DSH Architektur](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Schemastery Config](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.md)
- [Locale Plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/locale/README.md)
- [Plugin Manager](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)

---

<div align="center">

**Powered by DSH. Developed by a solo dev on an FX-6300.**

`@shinon/*` · MIT · Node `^22.19.0 || >=24`

</div>

# shinon-forge
