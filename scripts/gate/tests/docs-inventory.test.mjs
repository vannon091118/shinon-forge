#!/usr/bin/env node
/**
 * scripts/gate/tests/docs-inventory.test.mjs — die zwei Nachschlagewerke bleiben
 * vollständig.
 *
 * `docs/PAKETE.md` und `docs/SCRIPTS.md` sind Versprechen: „hier steht, was es
 * gibt". T5-7 hat gemessen, dass drei Pakete und zwei Skripte fehlten — beide
 * Dateien waren also still veraltet. Der Test zieht die Grenze dort, wo die
 * Datei sie selbst zieht:
 *
 *   1. Jedes Verzeichnis unter `packages/` steht in `PAKETE.md`.
 *   2. Jedes Top-Level-Skript unter `scripts/*.mjs` steht in `SCRIPTS.md`.
 *   3. Jeder dort genannte `.mjs`-Pfad existiert (relativ zu `scripts/`, `bin/`
 *      oder dem Repo-Root).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('jedes Paket steht in docs/PAKETE.md', () => {
  const text = read('docs/PAKETE.md');
  const dirs = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
  const missing = dirs.filter((dir) => !text.includes(`\`${dir}\``));
  assert.deepEqual(missing, [], `nicht in PAKETE.md: ${missing.join(', ')}`);
});

test('jedes Top-Level-Skript steht in docs/SCRIPTS.md', () => {
  const text = read('docs/SCRIPTS.md');
  const scripts = readdirSync(join(ROOT, 'scripts'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name);
  const missing = scripts.filter((name) => !text.includes(name));
  assert.deepEqual(missing, [], `nicht in SCRIPTS.md: ${missing.join(', ')}`);
});

test('jeder in SCRIPTS.md genannte Skript-Pfad existiert', () => {
  const text = read('docs/SCRIPTS.md');
  const tokens = [...text.matchAll(/`([A-Za-z0-9_][A-Za-z0-9_./-]*\.mjs)`/g)].map((match) => match[1]);
  const broken = [...new Set(tokens)].filter((token) => {
    if (token.startsWith('packages/') || token.startsWith('docs/') || token.startsWith('.github/')) return false;
    return !['', 'scripts', 'bin', 'scripts/gate', 'scripts/assets', 'scripts/e2e'].some((base) => existsSync(join(ROOT, base, token)));
  });
  assert.deepEqual(broken, [], `Pfad ohne Datei: ${broken.join(', ')}`);
});
