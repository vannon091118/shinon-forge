#!/usr/bin/env node
/**
 * Tests des E2E-Harness: `mutate.mjs` ist fail-closed — ein fehlender Anker
 * schreibt nichts und endet mit Exit 1. Kein Repo-Zustand, kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../e2e/mutate.mjs', import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'shinon-e2e-'));
  mkdirSync(join(root, 'src/domain'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });
  writeFileSync(join(root, 'src/domain/shipment.js'), "const T = { angelegt: ['zugewiesen'] };\nexport const ziel = 'zugewiesen';\n");
  writeFileSync(join(root, 'src/domain/assignment.js'), 'const weightExceeded = a > b;\nif (weightExceeded) { throw new Error("x"); }\n');
  writeFileSync(join(root, 'test/domain.test.mjs'), "test('x', () => {});\n");
  return root;
}

const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('mutate: --list nennt jede Fall-ID', () => {
  const result = run(['--list']);
  assert.equal(result.status, 0);
  for (const id of ['delete-test', 'duplicate-rule', 'comment-contradiction', 'innerhtml']) {
    assert.match(result.stdout, new RegExp(`^${id}\\t`, 'm'), `${id} fehlt in --list`);
  }
});

test('mutate: fehlender Anker endet mit Exit 1 und schreibt nichts', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-e2e-leer-'));
  const result = run(['--case', 'duplicate-rule', '--root', root]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Mutation NICHT angewendet/);
  assert.deepEqual(readdirSync(root), [], 'der leere Baum bleibt leer');
});

test('mutate: vorhandener Anker schreibt genau die neue Datei', () => {
  const root = fixture();
  const result = run(['--case', 'duplicate-rule', '--root', root]);
  assert.equal(result.status, 0);
  assert.ok(existsSync(join(root, 'src/domain/shipment-regeln.js')));
  assert.match(readFileSync(join(root, 'src/domain/shipment-regeln.js'), 'utf8'), /unterwegs/);
});

test('mutate: --dry-run nennt den Fall und laesst den Baum unveraendert', () => {
  const root = fixture();
  const result = run(['--case', 'delete-test', '--root', root, '--dry-run']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry-run/);
  assert.match(readFileSync(join(root, 'test/domain.test.mjs'), 'utf8'), /\btest\(/);
});
