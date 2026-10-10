# ARCHITECTURE_MAP — Phase A (rekonstruiert, nicht behauptet)

> **Status:** current — Phase-A-Audit, lesend erhoben am 2026-10-10. **Stand:** 2026-10-10
> **Einstieg:** `Docs/INDEX.md` · **Zahlen:** `Docs/ZAHLEN.md`

## 0. Vorab: Was dieses Repo NICHT ist (Befund A-ARCH-00, kritisch)
Der Auftrag spricht von SH-Overhaul-Modifikation, Zielspiel, Mod-Loader, Tauri-Desktop-Oberfläche mit Rust-Backend.
**Widerlegt für diesen Baum:**
- `grep -ri tauri|cargo|Silent Hill|mod loader|\.esp` → nur DSH-Treffer + `Docs/STARTER-PLAN.md`-Konzepttext; `glob **/{Cargo.toml,tauri.conf*,src-tauri/**,*.rs}` → 0 Dateien; `ls starter src-tauri *.rs` → nicht vorhanden — BESTÄTIGT.
- Was existiert: **DeepSeek-Harness-(DSH)-Overlay**: 19 Cordis-Bundles `@shinon/*` unter `packages/`, kanonisches DSH-Profil `profiles/shinon`, Gate-Engine, Build-Pipeline. Tauri ist **Stufe 2 = Konzept** (`Docs/STARTER-PLAN.md`: „noch nicht gebaut"), scharf ist nur Stufe 1 (`scripts/open.mjs` öffnet Systembrowser) + `.desktop`-Starter (`scripts/desktop-launcher.mjs`, schreibt nach `~/.local/share/applications/`).
- „Standalone" ist hier unbelegt: Profile brauchen installiertes DSH + Modellschlüssel (`SHINON_API_KEY`); kein Mod-Paket-, kein Spiel-, kein Offline-Produkt-Beleg. Produktentscheidung OFFEN.

## 1. Einstiegspunkte (alle BESTÄTIGT statisch)
| Einstieg | Kette |
|---|---|
| `npm run dev` | `DSH_HOME=$PWD dsh --profile shinon` → DSH-CLI (extern) → `profiles/shinon/package.json` (`dsh.profile.bundles`, 20 Layer) → Bundle-Patches → `profiles/shinon/cordis.patch.yml` (User-Ebene) → Host `apply(ctx,config)` / Client `__ModuleLoader__.load` |
| `npm run open` | `scripts/open.mjs`: spawnt obiges mit `--no-open --trusted-host …`, wartet auf READY-Zeile, `xdg-open/open/start` |
| `npm test` | codingmon → `dsh-test` → `validate-test` → `pack-test` → `dsh-profile-test` (stoppt beim 1. Fehler) |
| `npm run build` | `scripts/build.mjs`: re-validiert (Quelle `scripts/lib/repo.mjs`), regeneriert `dist/` |
| `npm run gate*` | `scripts/gate/engine.mjs` + 18 Plugins (`scripts/gate/plugins/*.mjs`), Slices in `policy.json` |
| `bin/shinon.mjs` | **verwaist**: nur Logs, kein `bin`-Feld, kein Script verweist darauf (Befund A-INV-03) |

## 2. Modulgrenzen
- Paket = Ordner `packages/<dir>/`; Pflicht: `index.js` (Host: Schemastery-`Config` + `apply`), `client.js` (UI: `__ModuleLoader__.load` + Slots/Styles/Locale), `cordis.patch.yml` (genau 1 `insert`), `package.json` (Manifest). Alle 19 Pakete besitzen alle vier — BESTÄTIGT (`dsh-test` 98/0 in dieser Umgebung).
- Regel: Pakete importieren einander NICHT (Ausnahme: dokumentierte **Quell-Zwillinge** in `repo.mjs::SOURCE_TWINS`, 4 Regeln mit Besitzer+Spiegel, byte-/literal-geprüft). Gemeinsame Logik: `scripts/lib/`. Client-Bundles sind self-contained (`require('react')`, keine Imports) — die `uebergabe`-Namen stehen als Literale + Drift-Test.
- Datenfluss: `profiles/shinon/package.json` (Aktivierung) → Paket-Patch (Layer) → Profil-User-Ebene (Overrides: prompter-Route, task-router-Schwelle, project-index-`verify`, LLM-Routen, `ui-brand-official disabled`) → `ctx`-Config → `apply()` → Client `inject(slots/styles/locale) → register(...)`.

## 3. Abhängigkeitsgraph (statisch, BESTÄTIGT)
- `@shinon/*` untereinander: **keine** Kanten in `dependencies/peerDependencies` (alle 19 `name`-Treffer sind Eigen-Namen, keine Querverweise) — azyklisch per Konstruktion, `dependencyIssues` grün.
- Host-shared: `SHARED_DEPS = ['@deepseek-ai/schemastery']`, muss in peer+dev jedes Pakets stehen (Gate-Regel).
- Profil: 20 Layer = 14× `@shinon/*` + 6× fremd (`dsh-base`, `dsh-web-app`, 4× `dsh-experimental-*`); 5 Pakete inaktiv (`key-router`, `narrative`, `openapi`, `popup`, `shinon-forge`) — für `openapi` dokumentiert begründet, für 4 ohne Grund (bekannt, `Docs/ZAHLEN.md`).
- Verdrahtungs-Traps (aus AGENTS.md + Tests, hier nur referenziert, nicht erneut bewiesen): `ctx.provide` auf ROOT erreicht kein Sibling-`inject` (provide aus Plugin-Fiber); `Context` hat kein `dispose` (fiber disposen); Typert verwirft realm-fremde Objekte (`vm`-Kontext → serialisieren); Client-Remote-Beiträge brauchen Mount aus kompilierter Liste (`petRemoteContribution()` + Sender vorhanden, Mount nur im Test).

## 4. Doppelt / verwaist / tot (Verdacht, mit Status)
- 6× kopierter `settings.configure`-Block (`dashboard`, `token-usage`, `tooltip`, `better-errors`, `openapi`, `core`) — im Code per TODO selbst als Duplikat markiert → TEILWEISE BESTÄTIGT (statisch sichtbar, Laufzeit-Wirkung UNGEPRÜFT).
- 3× Reload-Helfer, keiner kanonisch → BESTÄTIGT (Dateiliste), Wirkung UNGEPRÜFT.
- `bin/shinon.mjs`, `packages/shinon-forge/*.tgz`, `profiles/web` (Altbestand ohne `@shinon/*`), inaktive Pakete ohne Aktivierungsgrund → BESTÄTIGT existent, Entscheidung OFFEN.
- Echte Tot-Code-Aussagen (nicht erreichbare Pfade) sind ohne Laufzeit-Boot **UNGEPRÜFT** — kein Modul wird in Phase A gelöscht.
