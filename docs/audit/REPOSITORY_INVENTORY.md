# REPOSITORY_INVENTORY — Phase A (read-only)

> **Status:** current — Phase-A-Audit, lesend erhoben am 2026-10-10. **Stand:** 2026-10-10
> **Einstieg:** `Docs/INDEX.md` · **Zahlen:** `Docs/ZAHLEN.md`

## 1. Root, Branch, Commit
- Root (gemessen `git rev-parse --show-toplevel`): `/home/vannon/Dokumente/Projekte/Shinon-forge` — BESTÄTIGT.
- Branch: `main`, Commit: `af086b0` („Workspace-Picker reparieren …"), Tags: `backup-20261008-233725-tag`, `v0.2.0`, `v0.3.0` — BESTÄTIGT (`git log --oneline -15`, `git tag --list`).
- Zweite Worktree (nicht angefasst): `/home/vannon/Schreibtisch/copilot-worktrees/Shinon-forge/copilot-prewarm-shiny-doodle` (detached `fe1dfdc`) — BESTÄTIGT (`git worktree list`).
- Submodules: keine. Stash: leer. `git status` zeigt **31 modifizierte Dateien + 2 untracked**, alle NICHT von diesem Audit (Audit hat keine Datei geändert außer `docs/audit/` neu) — BESTÄTIGT.

## 2. Uncommitted Changes (fremd, geschützt — nicht anfassen)
- Modifiziert (Auswahl, voll in `git diff --name-only`): `Docs/ZAHLEN.md`, `Docs/probes/brand-render.json`, 6× `packages/*/package.json` (`better-errors`, `core`, `events`, `project-index`, `prompter`, `task-router`, `token-usage`, `tooltip`), 12× `packages/*/client.js`, `packages/{codingmon,core,markers,tooltip}/index.js`, `profiles/web/cordis.patch.yml`, `.freebuff/project-id` (gelöscht im Worktree).
- Stichprobe Diff: `packages/*/package.json` `meta.title/description` String → `{en,de}`-Objekt (z. B. `core`, `tooltip`) — nur beobachtet, nicht bewertet.
- Untracked: `scripts/branding-check.mjs` (Chromium-Messharness für Branding), `scripts/gate/tests/client-activation.test.mjs` (Aktivierungs-Wache, wird in `Docs/ZAHLEN.md` §2.1 zitiert, aber weder in `package.json`-Scripts noch in `policy.json` verdrahtet) — BESTÄTIGT.
- `.gitignore`: `node_modules/`, `dist/`, `sessions/`, `storages/`, `.credentials.yaml`, `logs/` u. a. — `node_modules/` (190+ `@deepseek-ai/*`-Pakete) und `dist/` existieren lokal als Artefakte, sind aber kein Source — BESTÄTIGT.

## 3. Baum ( surveying, keine `node_modules`-Volltexte)
- `packages/`: **19** Ordner (`better-errors`, `codingmon`, `core`, `dashboard`, `events`, `hook`, `key-router`, `locale-de`, `markers`, `narrative`, `openapi`, `persona`, `popup`, `project-index`, `prompter`, `shinon-forge`, `task-router`, `token-usage`, `tooltip`). Jeder enthält `index.js`, `client.js`, `cordis.patch.yml`, `package.json`; `assets/` in den meisten; `test/` nur `codingmon`, `hook`; `fixtures/` nur `hook`; `README.md` nur `narrative`, `shinon-forge`; Sonderressource nur `openapi/openapi.yaml`; Sonderfall `packages/shinon-forge/shinon-shinon-forge-0.1.0.tgz` (gepacktes Tarball im Source-Baum — Befund A-INV-01).
- `profiles/`: `shinon` (kanonisch), `headless` (One-shot), `web` (Altbestand, kein `@shinon/*`).
- `scripts/`: `dsh-test.mjs`, `validate-test.mjs`, `pack-test.mjs`, `dsh-profile-test.mjs`, `build.mjs`, `open.mjs`, `stages.mjs`, `desktop-launcher.mjs`, `commit-guard.mjs`, `install-hooks.mjs`, `panel-check.mjs`, `branding-check.mjs` (untracked), 3× Reload-Helfer (`dsh_reload.js`, `dsh_reload.mjs`, `reload.mjs` — keiner kanonisch, Befund A-INV-02), `gate/` (Engine + 18 Plugins + 19 Tests), `lib/` (7 Module, darunter `repo.mjs` als Single Source).
- `bin/shinon.mjs`: 5× `console.log`-Stub, **kein** `bin`-Feld in `package.json` — verwaister Einstiegspunkt (Befund A-INV-03).
- `starter/`, `src-tauri/`, `*.rs`, `Cargo.toml`, `tauri.conf.*`: **existieren nicht** (Befund A-INV-04, siehe ARCHITECTURE_MAP §0).
- `dist/`: generiert (`manifest.json`, `profile.json`, `packages/`), gitignoriert.

## 4. Umgebung dieser Messung (wichtig für Matrix)
- `node --version`: **v18.19.1** (Repo verlangt `^22.19.0 || >=24.0.0`) — pnpm 11.7.0 startet nicht (`requires at least Node.js v22.13`); `~/.nvm/versions/node/v24.21.0` existiert, wurde aber in diesem Audit NICHT umgeschaltet (nur dokumentiert).
- `dsh`: **nicht im PATH** (`which dsh` leer) — alle Boot-/Profil-/Install-Prüfungen sind hier BLOCKIERT.
- `@deepseek-ai/schemastery`: im Root-`node_modules` vorhanden? `packages/codingmon/index.js`-Import schlägt fehl (`ERR_MODULE_NOT_FOUND`) — de-facto nicht auflösbar (Befund A-ENV-01).
