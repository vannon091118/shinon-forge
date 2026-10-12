# Handshake — TypeScript Gate

> **Status:** implemented, pushed, and verified by GitHub Actions.  
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

- GitHub Actions run: [Shinon Commit Guard #38195941529](https://github.com/vannon091118/shinon-forge/actions/runs/38195941529) — **success**.
- Gate suite: `407 passed, 0 failed, 0 skipped`; the real-compiler fixture passed for valid TypeScript, rejected the deliberate `TS2322` type mismatch, and detected a first-party file omitted from the compiler program.
- Additional CI test steps: Codemon `46 passed, 0 failed, 0 skipped`; Scoring `42 passed, 0 failed, 0 skipped`.
- TypeScript gate: **PASS / NOT_APPLICABLE**. The compiler version, strict configuration, and source inventory were verified; the application currently contains no first-party TypeScript files. This is explicitly not claimed as a successful application typecheck.
- Commit checked by the CI run: `7ff21da38a7faf54b56224d6dd128ddf4b824260`.
