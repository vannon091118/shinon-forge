#!/usr/bin/env node
/**
 * Tests der Gate-Engine-Logik (reine Funktionen, kein Repo-Zustand).
 * Läuft mit `node --test` — kein node_modules nötig.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSlice, shouldRun, shouldRunLocal, normalizePluginResult, failureCode, pluginFromModule } from '../engine.mjs';
import { parsePolicy, validateCoverage, validateLocalSubset } from '../policy.mjs';

const policy = {
  version: 1,
  engine: {
    always: ['manifest', 'contract'],
    local: ['manifest'],
    slices: { 'dead-package': { prefixes: ['packages/'] } },
  },
};

test('matchesSlice: prefixes', () => {
  assert.equal(matchesSlice('packages/core/index.js', { prefixes: ['packages/'] }), true);
  assert.equal(matchesSlice('scripts/x.mjs', { prefixes: ['packages/'] }), false);
});

test('matchesSlice: contains', () => {
  assert.equal(matchesSlice('a/b/combat/c.ts', { contains: ['/combat/'] }), true);
  assert.equal(matchesSlice('a/b/combat.ts', { contains: ['/combat/'] }), false);
});

test('shouldRun: always läuft immer', () => {
  assert.equal(shouldRun('manifest', [], false, policy), true);
});

test('shouldRun: Slice nur bei passendem Diff', () => {
  assert.equal(shouldRun('dead-package', ['packages/x/index.js'], false, policy), true);
  assert.equal(shouldRun('dead-package', ['README.md'], false, policy), false);
});

test('shouldRun: forceFull überschreibt Slices', () => {
  assert.equal(shouldRun('dead-package', [], true, policy), true);
});

test('shouldRunLocal: nur die lokale Menge', () => {
  assert.equal(shouldRunLocal('manifest', policy), true);
  assert.equal(shouldRunLocal('contract', policy), false);
});

test('pluginFromModule: ein Modul ohne check() wird zum benannten Befund statt zu einer Lücke', () => {
  const plugin = pluginFromModule({ id: 'stumm' }, 'stumm.mjs');
  assert.equal(plugin.id, 'stumm');
  const result = plugin.check({});
  assert.equal(result.status, 'fail');
  assert.ok(result.issues.some((issue) => issue.includes('stumm.mjs') && issue.includes('check()')));
});

test('pluginFromModule: ein echtes check() bleibt unverändert', () => {
  const check = () => [{ issue: 'x' }];
  const plugin = pluginFromModule({ id: 'echt', check }, 'echt.mjs');
  assert.equal(plugin.check, check);
});

test('parsePolicy: akzeptiert gültige Policy', () => {
  assert.deepEqual(parsePolicy(policy).errors, []);
});

test('parsePolicy: lehnt falsche Version ab', () => {
  assert.equal(parsePolicy({ ...policy, version: 2 }).errors.length, 1);
});

test('validateCoverage: Plugin ohne Trigger und Trigger ohne Plugin', () => {
  const errs = validateCoverage(policy, ['manifest', 'orphan']);
  assert.ok(errs.some((e) => e.includes('orphan')));
  assert.ok(errs.some((e) => e.includes('contract')));
});

test('validateLocalSubset: local muss Teilmenge von always sein', () => {
  const bad = { version: 1, engine: { always: ['manifest'], local: ['contract'], slices: {} } };
  assert.equal(validateLocalSubset(bad).length, 1);
  assert.equal(validateLocalSubset(policy).length, 0);
});

test('failureCode names a failed or throwing gate in one stable code', () => {
  assert.equal(failureCode('dead-package'), 'GATE_DEAD_PACKAGE_FAILED');
  assert.equal(failureCode('typescript', 'THREW'), 'GATE_TYPESCRIPT_THREW');
  assert.equal(failureCode('  host half  '), 'GATE_HOST_HALF_FAILED');
});

test('normalizePluginResult preserves legacy arrays and distinguishes NOT_APPLICABLE', () => {
  assert.deepEqual(normalizePluginResult([]), { issues: [], status: 'pass', detail: '' });
  assert.deepEqual(normalizePluginResult(['broken']), { issues: ['broken'], status: 'pass', detail: '' });
  assert.deepEqual(
    normalizePluginResult({ status: 'not-applicable', detail: 'no TypeScript source yet', issues: [] }),
    { status: 'not-applicable', detail: 'no TypeScript source yet', issues: [] },
  );
  assert.equal(normalizePluginResult({ status: 'not-applicable', issues: ['real error'] }).issues.length, 1);
  assert.equal(normalizePluginResult({ status: 'unknown', issues: [] }).status, 'fail');
  assert.equal(normalizePluginResult({ malformed: true }).status, 'fail');
});
