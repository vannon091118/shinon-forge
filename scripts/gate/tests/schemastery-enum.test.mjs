#!/usr/bin/env node
/**
 * scripts/gate/tests/schemastery-enum.test.mjs — der Riegel hinter der
 * `z.enum`-Regel aus `AGENTS.md`.
 *
 * Der Test fährt den ECHTEN Baum (dort stehen zwei Kommentare ÜBER die Regel,
 * die kein Befund sind) und drei Mutationen auf einem Miniatur-Baum:
 *
 *   1. ein `z.enum(` in `index.js` ⇒ genau ein Befund mit Pfad und Zeile,
 *   2. derselbe Aufruf in einem Kommentar ⇒ kein Befund,
 *   3. derselbe Aufruf in `assets/*.js` (dort importiert `zod`, nicht
 *      Schemastery) ⇒ kein Befund.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as repo from '../../lib/repo.mjs';
import { check } from '../plugins/schemastery-enum.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Ein Miniatur-Baum: `files` ist Pfad → Inhalt, relativ zur Wurzel. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-enum-'));
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
  return root;
}

const packagesOf = (...dirs) => dirs.map((dir) => ({ dir }));

test('der echte Baum ist grün — die beiden Erklärungen sind Kommentare, keine Verstöße', () => {
  assert.deepEqual(check({ root: ROOT, packages: repo.discover() }), []);
});

test('ein z.enum in einer Host-Hälfte ist ein Befund mit Pfad und Zeile', () => {
  const root = fixture({
    'packages/bad/index.js': "import { z } from '@deepseek-ai/schemastery';\nconst Config = z.object({\n  mode: z.enum(['a', 'b']),\n});\n",
  });
  try {
    const issues = check({ root, packages: packagesOf('bad') });
    assert.equal(issues.length, 1);
    assert.match(issues[0], /^packages\/bad\/index\.js:3: z\.enum/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('derselbe Aufruf in einem Kommentar bleibt grün', () => {
  const root = fixture({
    'packages/ok/index.js': "import { z } from '@deepseek-ai/schemastery';\n/** Schemastery kennt kein z.enum(...) — deshalb z.union. */\nconst Config = z.object({ mode: z.union([z.const('a'), z.const('b')]) });\n// z.enum(['a']) waere hier falsch.\n",
  });
  try {
    assert.deepEqual(check({ root, packages: packagesOf('ok') }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('assets/*.js ist nicht Gegenstand — dort gilt zod, und zod hat z.enum', () => {
  const root = fixture({
    'packages/zod/assets/schema.js': "import { z } from 'zod';\nexport const S = z.enum(['a', 'b']);\n",
  });
  try {
    assert.deepEqual(check({ root, packages: packagesOf('zod') }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
