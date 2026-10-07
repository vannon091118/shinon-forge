# Shinon Forge

An independent fork of the DeepSeek Harness (DSH). It ships 7 `@shinon/*` Cordis
plugin bundles under `packages/`, enabled by the canonical profile `profiles/shinon`.
Correctness is checked statically by the gate and distribution tests below — the
profile boot test also runs `dsh --profile shinon --dump-config` against an
installed DSH. No git history yet; DSH is `upstream`.

## Dev environment
- Node `^22.19.0 || >=24` and pnpm `11.7.0` on PATH (packageManager is pinned).
- `pnpm pack`/`npm` are invoked by the tests — both must be installed.
- DSH `0.2.0-rc.2` is installed (`dsh --version`); `npm run dev` and the profile
  test need it on PATH. Run with `DSH_HOME=$PWD` (the `dev` script does this).
- No lockfile and no `pnpm-workspace.yaml` (the root `package.json` uses the
  unsupported `workspaces` field; pnpm warns about it). Fresh-checkout installs are
  not reproducible.

## Build & test
Run from repo root:
- `npm test` → `dsh-test.mjs && validate-test.mjs && pack-test.mjs && dsh-profile-test.mjs`
- `node scripts/dsh-test.mjs` → static gate: manifest, name contract, `index.js`,
  `client.js`, `cordis.patch.yml`, legacy-guard, profile resolution (exit 0/1).
- `node scripts/pack-test.mjs` → per-package distribution test: `pnpm pack` → unpack →
  isolated `npm install` → load. Optional `--keep` retains `/tmp` work dirs for debugging.
- `node scripts/dsh-profile-test.mjs` → boots `dsh --profile shinon --dump-config` and
  asserts all 8 bundle layers resolve.
- `npm run build` → `node scripts/build.mjs`: re-validates everything, then wipes and
  regenerates `dist/` (`manifest.json`, `profile.json`, `dist/packages/*`).
- `npm run gate` / `gate:local` / `gate:full` → modular gate engine
  (`scripts/gate/engine.mjs`): slice-selected checks, one plugin per capability. Sits
  alongside `npm test`, does not replace it.
- `npm run gate:test` → `node --test scripts/gate/tests/*.test.mjs` (pure gate logic).
- `npm run dev` → `dsh --profile shinon`.
- `npm run update` → `node scripts/dsh-update.mjs` (upstream DSH refresh; see Pitfalls).
- `npm run sync` → `git fetch upstream && git merge upstream/main`.

## Conventions
- A package is identified by its folder: `packages/<dir>/`. All names derive from it and
  must agree in four places — this is the enforced "name contract":
  - `packages/<dir>/package.json` `name` → `@shinon/<dir>`
  - `packages/<dir>/cordis.patch.yml` `id` → `shinon-<dir>`
  - `packages/<dir>/cordis.patch.yml` `name` → `@shinon/<dir>`
  - `packages/<dir>/client.js` `__ModuleLoader__.load({ id })` → `@shinon/<dir>`
  - `profiles/<name>/cordis.patch.yml` `id`/`name` → same as the package patch.
- Each bundle is exactly 4 files: `index.js` (host: Schemastery `Config` + `apply(ctx,
  config)`), `client.js` (UI: `__ModuleLoader__.load` + slots/styles/locale),
  `cordis.patch.yml` (activation: a single `insert` entry), `package.json` (manifest).
  No runtime logic in `package.json`; no config schema in `client.js`.
- The active profile is read from the `dev` script's `--profile <name>` (single source of
  truth); do not duplicate it. Effective config values live in the profile entry, not in
  packages; packages hold only schema defaults.
- Host-shared deps (`SHARED_DEPS` in `scripts/lib/repo.mjs`, currently
  `@deepseek-ai/schemastery`) must be declared in BOTH `peerDependencies` and
  `devDependencies` of every package.
- Schemastery 3.18.4 has no `z.enum` — model enums as `z.union([z.const('a'), z.const('b')])`.
- If a contract changes, edit it in `scripts/lib/repo.mjs` (the shared source) — never in
  `dsh-test.mjs` or `build.mjs` directly.
- Client-internal slot ids follow `<name>-<purpose>` (e.g. `shinon-core-brand`,
  `shinon-info-banner`). Packages don't reference each other; shared logic goes in
  `scripts/lib/`.

## Pitfalls
- `dist/` is generated — never hand-edit it; `npm run build` regenerates it wholesale.
- The legacy string `dsh-mod` must not appear in any runtime artifact
  (`index.js`/`client.js`/`cordis.patch.yml`, profiles) — the gate's legacy-guard fails on it.
- `scripts/gate/policy.json` must stay in sync with `scripts/gate/plugins/*.mjs`:
  `policy.mjs` exits 1 if a plugin has no trigger or a trigger has no plugin file.
- `node scripts/dsh-update.mjs` hardcodes a DSH install path
  (`/home/vannon/.local/opt/node-v22.23.3-.../@deepseek-ai/dsh`) and uses `--profile web`
  for install — it's not wired to the `shinon` profile; treat its output as advisory.
- Three reload helpers exist (`scripts/dsh_reload.js`, `dsh_reload.mjs`, `reload.mjs`);
  none is documented as canonical. Don't assume which to use.
- Dashboard, token-usage, better-errors, and openapi are placeholders (static UI or config
  only, no server/logic) — openapi is not enabled in the profile, and the `dead-package`
  gate will flag any *other* package missing from the profile.
- Several `package.json` files differ between the staged (git index) and working tree;
  `git status` will show both new and modified files. The live files are the working tree.
