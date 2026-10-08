# Starter-Plan — DSH als native App (Roadmap + Stand)

> Status: **PLAN + TEILS UMGESETZT** (Stufe 1 scharf, Stufen 2–4 Konzepte).
> Diese Datei ist der **einzige Anker** für jeden Agenten, der am Starter arbeitet —
> damit niemand Stale vermutet: jeder Abschnitt trägt einen **Stand** + **Datum**.
> Liest ein anderer Agent nur diese Datei: nichts wird geraten, alles ist markiert.

## Der eine Satz
DSH ist extern installiert (`@deepseek-ai/dsh` via npm, installiert `0.2.0-rc.2`,
Repo-Pin `0.2.1-alpha.1`) und ein **Node-CLI mit eingebautem Webserver**. Unsere
Cordis-Bundles + `profiles/shinon` erweitern ihn. Die Ziel-App zeigt dieselbe
Web-Oberfläche **ohne den Chromium-Overhead**: System-Webview statt Browser-Tab,
später native Erweiterungen + sauberes Install/Uninstall.

## Warum (für jeden, der nur liest)
DSH shippt heute: Browser (Chromium) + Node + unsere `client.js`-Bundles.
- Der spürbare Overhead ist das **gebundene Chromium** (~90–130 MB, Multi-Prozess).
- **Ehrliche Zahl (gemessen, kein Marketing):** Binary sinkt mit Tauri ~80%
  (323→57 MB, BetterStack-Side-by-Side); **RAM nur ~15%** (128→109 MB), weil DSHs
  eigener Node-Prozess in JEDEM Ansatz bleibt. → Wer Ressourcen will: **dsh-Production-
  Build + ein dsh-Prozess für alle Fenster** bringt mehr als der Webview-Wechsel.
- "Unbequem" ist kein Zufall: Electron kauft Rendering-Konsistenz (1 Chromium =
  identische Pixel auf Win/mac/Linux) + Sandboxing. Tauri-System-Webview rendert mit
  **3 Engines** (WebView2/WebKit/WebKitGTK) — `backdrop-filter`, `:has()`, WebRTC
  fallen auf WebKitGTK teils durch. Der Konsistenz-Verzicht ist der Preis, den wir
  bewusst zahlen.

## Die 4 Stufen (jede abgeschlossen für sich — NICHT parallel)

| Stufe | Was | Stand |
|---|---|---|
| **1 — 1-Click-Open** | `npm run open` startet DSH (`--no-open`, trusted-host) und öffnet die tokenisierte READY-URL im Systembrowser | ✅ **SCHARF** (2026-10-08) — `scripts/open.mjs` + npm-Entry `open` |
| **2 — Tauri-Shell** | System-Webview zeigt denselben dsh-Port; Chromium-Overhead weg; eigene Cargo-Crate `starter/`, **einmal** pro Shell-Änderung kompiliert, UI bleibt statisches Vite-Build | 📐 **KONZEPT** — Archi-Entscheid getroffen (Tauri v2 + dsh-Sidecar + Loopback), noch nicht gebaut |
| **3 — Verbundene Shell** | DSH-Grenzen sprengen: Tauri-Commands/Events für alles, was ein Cordis-Plugin nicht darf (native Rechte, Filesystem, Multi-Fenster, System-Dialoge). DSH/Plugin-Registry bleibt Primary, die Shell ist der Ausbreiter. | 📐 **KONZEPT** — Flip-Punkt: Loopback-HTTP (Default, 0 DSH-Änderung) vs. reines IPC (bräuchte non-HTTP-Transport in DSH → erst Spike) |
| **4 — Install/Uninstall** | Windows: **NSIS** (Tauri-Default-Installer), Linux: **AppImage + .deb** (nativ aus Tauri). Komplett ohne Terminal. | 📐 **PLAN** — kommt explizit **NACH** der Shell (Ressourcen-Sparen hat Vorrang) |

## Stufe 1 — was genau scharf ist (Stand: 2026-10-08)
- `scripts/open.mjs`: spawn `dsh --profile shinon --no-open --trusted-host localhost
  --trusted-host 127.0.0.1` mit `DSH_HOME=$Repo`, wartet auf die READY-Zeile
  `dsh web: http://…/?token=…` (gleicher Regex wie in `scripts/stages.mjs`), gibt die
  URL an `xdg-open`/`open`/`start` weiter. Ctrl-C / End des dsh-Prozesses beendet den
  Wrapper, kein Orphan-Kind.
- `package.json`: neuer Script-Entry `"open": "node scripts/open.mjs"`.
- **Wiederverwendung, keine Neuerfindung:** Profilname aus `repo.activeProfile` (dev-Skript,
  eine Quelle), `dsh` via `findOnPath` aus `lib/yaml.mjs` — beide Libs stehen im Repo.
- **Keine neuen Dependencies**, keine Gate-Änderung, die 265+ gate-Tests bleiben unangetastet.

## Tauri-Konzept (Stufe 2) — die zwei Flip-Punkte, wo man drehen kann
1. **Transport:** Default = Loopback-HTTP zum dsh-Host (null DSH-Änderung, lokaler
   127.0.0.1-Port ist **kein** Overhead). Want null Port → dsh braucht einen
   `file://`/IPC-Mode → **erst Spike**, dann Tauri-Events als Kanal.
2. **Rust vs. Go:** A = Tauri v2 (Rust, empfohlen, Ökosystem + NSIS/AppImage/Deb gratis).
   B = Wails (Go, identisches Modell, kein Rust). Nur wenn "kein Web-Rendering
   überhaupt" gilt: C/D/E (Flutter/native/TUI) — dann **stirbt der ganze Cordis-Client**,
   das ist ein eigener Abzweig, nicht dieser Plan.

## Stale-Schutz (Regel für jeden Agenten)
- Jede Stufe ist **abgeschlossen**, bevor die nächste beginnt. Stufe 2 wird NIE auf
  halbfertigem Stufe-1-Build gebaut.
- Ein Agent, der hier weiterarbeitet: **erster** act = diesen Stand-Abschnitt (oder die
  `Docs/probes/`) aktualisieren, **danach** Code anrühren. Stale-Vermutung verboten —
  der Stand steht oben, nicht im Gedächtnis.
- Parallel laufende Arbeit (task-router, prompter, goal, untrusted-regionen) gehört
  NICHT zu diesem Plan — die ist eigene Spur, eigene Commits. Mixen verboten.
