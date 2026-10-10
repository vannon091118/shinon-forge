# DEPENDENCY_FINDINGS — Phase A (Beweismittel, keine Wertung)

> **Status:** current — Phase-A-Audit, lesend erhoben am 2026-10-10. **Stand:** 2026-10-10
> **Einstieg:** `Docs/INDEX.md` · **Zahlen:** `Docs/ZAHLEN.md`

| ID | Schwere | Befund | Beleg | Status |
|---|---|---|---|---|
| A-INV-01 | mittel | `packages/shinon-forge/shinon-shinon-forge-0.1.0.tgz` liegt als Build-Artefakt im Source-Baum | `ls packages/shinon-forge/` | BESTÄTIGT |
| A-INV-02 | niedrig | 3 Reload-Helfer (`dsh_reload.js`, `dsh_reload.mjs`, `reload.mjs`), keiner dokumentiert kanonisch; alle defaulten auf `~/.dsh/profiles/web`, nicht auf `profiles/shinon` | Dateiliste + `grep DSH_HOME scripts/dsh_reload* scripts/reload.mjs` | BESTÄTIGT |
| A-INV-03 | mittel | `bin/shinon.mjs` ist ein `console.log`-Stub ohne `bin`-Feld in `package.json` und ohne Script-Verweis: der Name `shinon` als CLI ist vorgetäuscht | `cat bin/shinon.mjs` + `node -p require('./package.json').bin` → undefined | BESTÄTIGT |
| A-INV-04 | kritisch | Keine Tauri-/Rust-/Spiel-Integration im Baum (siehe ARCHITECTURE_MAP §0) | `glob Cargo/tauri/*.rs` → 0; `ls starter src-tauri` → fehlt | BESTÄTIGT (Negativbefund, reproduzierbar) |
| A-ENV-01 | hoch | Diese Umgebung: Node v18 (verlangt ≥22.19), pnpm startet nicht, `dsh` fehlt, `schemastery` nicht auflösbar → alle Boot-/Install-Tests BLOCKIERT | `node --version`, `pnpm --version`, `which dsh`, `npm run test:codingmon`-Skips | BESTÄTIGT |
| A-WT-01 | hoch | 31 fremde modifizierte Dateien + 2 untracked im Arbeitsbaum (u. a. `meta.{title,description}` String→`{en,de}` in 8 Manifesten, 12 Client-Hälften, `profiles/web`-Patch) — geschützt, nicht von diesem Audit; jede Reparatur muss dagegen rebasen | `git status --short`, `git diff --stat`, Stichprobe `git diff packages/core/package.json` | BESTÄTIGT |
| A-DUP-01 | mittel | 6× identischer `settings.configure`-Block (per TODO im Code selbst benannt) | `packages/dashboard/index.js:17` + TODO-Scan (9 TODOs, alle `[DSH-Refactor]`) | TEILWEISE BESTÄTIGT |
| A-LEG-01 | niedrig | Legacy-String `dsh-mod`: 0 Treffer in Runtime-Artefakten | `grep -rn dsh-mod packages/*/… profiles/shinon/` → leer; `dsh-test` Legacy-Guard grün | BESTÄTIGT |
| A-PROF-01 | mittel | `profiles/web` ist Altbestand (nur fremde Bundles, kein `@shinon/*`); Arbeitsbaum ändert ihn uncommitted — Absicht unbekannt | `cat profiles/web/cordis.patch.yml` + `git diff --name-only` | BESTÄTIGT existent, Absicht OFFEN |
| A-INACT-01 | mittel | 4 inaktive Pakete ohne verzeichneten Grund (`key-router`, `narrative`, `popup`, `shinon-forge`); `openapi` begründet inaktiv | `profiles/shinon/package.json` vs `ls packages`; `Docs/ARCHITECTURE.md` §8 | BESTÄTIGT |

Interpretation vs. Beobachtung: Die Tabelle oben ist Beobachtung. Hypothese (nicht belegt): Die `{en,de}`-Manifest-Änderungen im Arbeitsbaum könnten die Gate-Regel `manifestIssues` (keine Aussage über `meta`-Form) passieren, aber externe Verbraucher (Plugin-Manager-Titelanzeige) sind UNGEPRÜFT.
