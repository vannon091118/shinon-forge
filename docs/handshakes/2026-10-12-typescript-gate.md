# Handshake — TypeScript Gate

> **Status:** implementation pushed; hosted CI result to be recorded after the workflow run.  
> **Date:** 2026-10-12  
> **Scope:** `vannon091118/shinon-forge`

## Goal

Integrate TypeScript checking into the existing Gate Engine without migrating the JavaScript runtime or duplicating architecture checks.

## Implementation

- `typescript@7.0.2` is a direct, exact-pinned development dependency with lockfile metadata.
- `tsconfig.json` enables strict checking and `noEmit`; it includes `.ts`, `.tsx`, `.mts`, and `.cts`.
- `scripts/gate/plugins/typescript.mjs` verifies the exact installed compiler pin, strict config invariants, compiler diagnostics, and that every first-party TypeScript file is in the compiler program.
- Vendor declarations, installed dependencies and build/coverage output are excluded from the first-party inventory.
- The current repository has no first-party TypeScript sources. The plugin reports `NOT_APPLICABLE` explicitly after validating the compiler and configuration; it does not call an empty program a real typecheck PASS.
- `--only typescript` and `npm run typecheck` run the same plugin through the existing engine.
- The plugin is included in the `always` and `local` policy lists; CI runs `npm run typecheck`.

## Falsification coverage

- Inventory tests cover all four extensions and vendor/dependency/build exclusions.
- Configuration tests reject weakened strictness, emission, missing source patterns and missing exclusions.
- A compiler integration test uses a temporary project: a valid type passes, a deliberate `number → string` mismatch fails, and an excluded first-party TS file is detected.
- Engine tests distinguish `NOT_APPLICABLE` from ordinary `PASS`.

## Boundaries

This is gate infrastructure, not a JavaScript-to-TypeScript migration. The existing lexical source scanner remains unchanged. The gate invokes the pinned compiler CLI and does not depend on the legacy compiler API.

## Validation record

- Local test command and result: recorded after running the suite.
- GitHub Actions result for the implementation commit: recorded after hosted CI finishes.
