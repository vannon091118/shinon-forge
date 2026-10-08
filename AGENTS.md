# Shinon Forge

An independent fork of the DeepSeek Harness (DSH). It ships 7 `@shinon/*` Cordis
plugin bundles under `packages/`, enabled by the canonical profile `profiles/shinon`.
Correctness is checked statically by the gate and distribution tests below — the
profile boot test also runs `dsh --profile shinon --dump-config` against an
installed DSH. No git history yet; DSH is `upstream`.

## Dev environment
- Node `^22.19.0 || >=24` and pnpm `11.7.0` on PATH (packageManager is pinned).
- `pnpm pack`/`npm` are invoked by the tests — both must be installed.
- DSH `0.2.1-alpha.1` is installed (`dsh --version`) and pinned in the root
  `package.json`; `npm run dev` and the profile test need it on PATH. Run with
  `DSH_HOME=$PWD` (the `dev` script does this).
- `package-lock.json` is versioned, and there is no `pnpm-workspace.yaml` (the root
  `package.json` uses the unsupported `workspaces` field; pnpm warns about it).
  Fresh-checkout installs stay non-reproducible anyway: installs run through pnpm
  and there is no `pnpm-lock.yaml`, so the npm lockfile pins npm's resolution, not
  the pnpm run.

## Build & test
Run from repo root:
- `npm test` → `node --test packages/codingmon/test/*.test.mjs && dsh-test.mjs &&
  validate-test.mjs && pack-test.mjs && dsh-profile-test.mjs` (die schnellen Einzeltests
  laufen zuerst, damit eine kaputte Tabelle vor `pack-test` auffällt). Dieselben Tests
  laufen in `.github/workflows/commit-guard.yml` auf jedem Push/PR.
- `node scripts/dsh-test.mjs` → static gate: manifest, name contract, `index.js`,
  `client.js`, `cordis.patch.yml`, legacy-guard, profile resolution (exit 0/1).
- `node scripts/pack-test.mjs` → per-package distribution test: `pnpm pack` → unpack →
  isolated `npm install` → load. Optional `--keep` retains `/tmp` work dirs for debugging.
- `node scripts/dsh-profile-test.mjs` → boots `dsh --profile shinon --dump-config` and
  asserts all 8 bundle layers resolve.
- `npm run test:codingmon` → `node --test packages/codingmon/test/*.test.mjs`: isolated
  tests for the Codemon core math (damage dictionaries, weighted loot RNG, ability and
  lineage tables), the compositor rule for its keyframes and the E2E pass
  (`durchstich.test.mjs`: the real client bundle in a vm with a fake clock). No DSH, no
  browser, no model, and no install needed once `index.js` only re-exports the core
  (`assets/mechanik.js`); runs in well under a second.
  `uebergabe.test.mjs` is the ONE exception: it boots the real Typert gateway, the storage
  family and both Cordis roots out of the pinned `node_modules`, so it needs them and skips
  VISIBLY (reason in the test name) without them — same rule as the store test.
- `node --test scripts/gate/tests/codingmon-store.test.mjs` → the durable pet store
  against the real DSH storage family in a real Cordis context (needs `dsh` on PATH and
  the bundled packages resolvable; skips visibly otherwise). Runs inside `gate:test`.
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
  Two extra directories are allowed next to them and nothing else: `assets/` (runtime
  helpers, shipped into `dist/` like project-index's index core and codingmon's
  pet-store) and `test/` (package-local tests, not shipped). Pure mechanics belong in
  an `assets/` core WITHOUT bare imports (project-index: the worker; codingmon:
  `assets/mechanik.js`): only then can their unit tests run in CI, which has no
  `node_modules`. `index.js` re-exports that core, so the public names stay the same.
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
- A Client -> Host seam keeps its names in ONE place: `packages/codingmon/assets/uebergabe.js`
  (package, service key, wire namespace, method, endpoint, field list). `index.js` re-exports
  it, `assets/pet-remote.js` imports it — but `client.js` CANNOT: a client bundle is
  self-contained (it pulls React through `require`, not `import`). So the bundle carries the
  names as LITERALS and `packages/codingmon/test/uebergabe.test.mjs` compares both sides
  character by character. Never let a literal drift; extend that assertion instead.

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
- A Client -> Host endpoint needs someone to SELECT it. Host-side `./typert` discovery exists
  (`dsh-typert-loader`), but the browser client mounts its Remote contributions from a
  hardcoded COMPILED list in `@deepseek-ai/dsh-api-remotes` (25 entries, `$mount`), so an
  out-of-tree bundle cannot register itself. codingmon therefore ships the contribution
  (`petRemoteContribution()` in `assets/pet-remote.js`) plus the drift-tested sender, but a
  client composition must still mount it; `test/uebergabe.test.mjs` mounts it itself, and
  that is the measurable part.
- The in-process carrier seam is `installConnection(ctx, { transport })` from
  `@deepseek-ai/dsh-client-connection/client` (the browser client passes
  `globalThis.__DSH_TRANSPORT__`); the transport's `rpc.call` reaches the host through the
  `/api` interceptor the gateway registers with `ctx.connection.rpc.intercept`, and a DEFINED
  `rpc.open` is what marks an in-process carrier (the WebSocket mux stays off). Two measured
  traps: `ctx.provide` on a ROOT context does not fire a sibling's `ctx.inject` — provide from
  inside a plugin fiber; and a Cordis `Context` has no `dispose` (dispose `ctx.fiber`).
- `dsh-client-connection` ships its client half ONLY as a browser bundle
  (`window.__ModuleLoader__.load`) with `.d.ts` beside it; `dsh-api-gateway` and
  `dsh-typert-registry` also ship unbundled ESM under `lib/types/client/` (reachable only by
  path, past the exports map). Load the bundle through `__ModuleLoader__` when you need it in
  Node — see `test/uebergabe.test.mjs`.
- Typert validates wire values with `Object.getPrototypeOf(value)` against ITS `Object.prototype`,
  so a value built in another realm (a `vm` context) is rejected even when it is plain JSON.
  A carrier must cross that boundary the way a real one does (serialize).
- Several `package.json` files differ between the staged (git index) and working tree;
  `git status` will show both new and modified files. The live files are the working tree.

## Commit rules (fail-closed)
- Every commit message ends with the Vannon trailer:
  `created by VANNON — Volatile Agent Needing No Other Nonsense, Never Overly Nice, Never Average Vibe`
- Forbidden: any AI footer (`Generated with Codebuff 🤖`,
  `Co-Authored-By: Codebuff <noreply@codebuff.com>`, Claude/ChatGPT/Copilot/Gemini/…),
  `powered by …`, emoji signatures — and `co-authored-by:` at all.
- Once per clone: `npm run hooks:install` (prepare-commit-msg swaps, commit-msg blocks).
  Check with `npm run commit:guard -- --ci | --last n | --range a..b | --all`.
- CI (`.github/workflows/commit-guard.yml`) runs on every push/PR with no filter; an
  unresolvable range falls back to the **full** history, never to a narrower one.
  Rules, enforcement and commands: `Docs/COMMIT-REGELN.md`. Single source of the
  patterns and the trailer: `scripts/lib/commit-text.mjs`.

## Session memory (all agents)

Load the canonical agent memory before starting work — prompt, hard rules, gates G0–G7,
what may be done autonomously, the release-required list and the exception catalogue:

- Page: `🧠 Agent Memory — Prompt & Anweisungen`
  https://app.notion.com/p/3f3eb55a5817811bb969e001c9fa2d94
- Local copy: `~/.agents/AGENTS.md` (generated, never edit by hand)
- Marker: `MEMORY-VERSION: sha256:cbb7352b53893298bb9f0713ce3cf3cd1baa8b948ad33db6ad2ebcb8918273a1`
- Refresh / check: `node ~/.agents/notion-agent/memory-sync.mjs sync` (or `verify`)

The marker must match between the page and every local copy; a copy with a different marker is
stale and must be re-synced before working. Rules that exist only in a chat transcript are never
current.
