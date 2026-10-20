/**
 * Gate: der Kanon hält — ein Name, eine Schreibweise, eine Definition.
 *
 * Was hier geprüft wird, und warum es ohne die Umstellung rot wäre:
 *
 *   1. Der ECHTE Baum besteht `canonIssues`: jede registrierte Definition trägt
 *      ihren Namen wortgleich, keine verbotene Schreibweise steht im Code, jedes
 *      Browser-Global ist registriert, jedes Vertrags-Literal hält eine der drei
 *      kanonischen Formen.
 *   2. Die Registry ist vollständig: jede Zeile nennt Art, Name und Definition.
 *   3. Mutationsproben auf einem Miniatur-Baum: unregistriertes Global, verbotene
 *      Schreibweise, gebrochene Vertragsform, fehlende Definition, Definition
 *      ohne den Namen.
 *
 * Der Schritt liest nur; er schreibt nichts und startet nichts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as canon from '../../lib/canon.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (file) => readFileSync(file, 'utf8');

const REGISTRY = {
  contract: 'shinon.canon/v1',
  formen: {
    vertrag: [
      '^shinon\\.[a-z0-9-]+/[a-z0-9-]+-v[0-9]+$',
      '^shinon\\.[a-z0-9-]+/v[0-9]+$',
      '^shinon\\.[a-z0-9-]+/unloaded$',
    ],
    global: '^__shinon[A-Za-z0-9]+$',
  },
  namen: [
    { art: 'global', kanonisch: '__shinonPlugins', definiert_in: 'packages/core/client.js' },
    {
      art: 'vertrag',
      kanonisch: 'shinon.scoring/ledger-v1',
      definiert_in: 'packages/scoring/index.js',
      verboten: ['shinon.scoring/ledger/v1'],
    },
  ],
};

/** Miniatur-Baum: Registry plus die Dateien, die als Definition genannt werden. */
function tree(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-canon-'));
  const write = (rel, text) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  write(canon.CANON_FILE, JSON.stringify(REGISTRY, null, 2));
  write('packages/core/client.js', "const registry = (window.__shinonPlugins ??= new Map());\n");
  write('packages/scoring/index.js', "export const LEDGER_NAMESPACE = 'shinon.scoring/ledger-v1';\n");
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return root;
}

function withTree(files, fn) {
  const root = tree(files);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('der echte Baum hält den Kanon', () => {
  assert.deepEqual(canon.canonIssues(ROOT), []);
});

test('jede Registry-Zeile nennt Art, Name und Definition', () => {
  const registry = JSON.parse(read(join(ROOT, canon.CANON_FILE)));
  assert.ok(Array.isArray(registry.namen) && registry.namen.length > 0);
  for (const entry of registry.namen) {
    assert.ok(entry.art, `art fehlt: ${JSON.stringify(entry)}`);
    assert.ok(entry.kanonisch, `kanonisch fehlt: ${JSON.stringify(entry)}`);
    assert.ok(entry.definiert_in, `definiert_in fehlt: ${JSON.stringify(entry)}`);
    assert.ok(read(join(ROOT, entry.definiert_in)).includes(entry.kanonisch), `${entry.kanonisch} steht nicht in ${entry.definiert_in}`);
  }
  for (const art of ['global', 'vertrag', 'dienst', 'begriff']) {
    assert.ok(registry.namen.some((entry) => entry.art === art), `keine Zeile der Art ${art}`);
  }
});

test('ein unregistriertes Browser-Global ist rot', () => {
  withTree({ 'packages/hook/client.js': 'window.__shinonFremd = 1;\n' }, (root) => {
    const issues = canon.canonIssues(root);
    assert.ok(issues.some((issue) => issue.includes('__shinonFremd') && issue.includes('ohne Definition')), issues.join('\n'));
  });
});

test('eine verbotene Schreibweise ist rot', () => {
  withTree({ 'packages/scoring/client.js': "const x = 'shinon.scoring/ledger/v1';\n" }, (root) => {
    const issues = canon.canonIssues(root);
    assert.ok(issues.some((issue) => issue.includes('verbotene Schreibweise')), issues.join('\n'));
  });
});

test('eine gebrochene Vertragsform ist rot', () => {
  withTree({ 'packages/hook/index.js': "export const CONTRACT = 'shinon.hook/pre-step/v1';\n" }, (root) => {
    const issues = canon.canonIssues(root);
    assert.ok(issues.some((issue) => issue.includes('shinon.hook/pre-step/v1') && issue.includes('kanonische Vertragsform')), issues.join('\n'));
  });
});

test('eine fehlende Definition ist rot', () => {
  withTree({}, (root) => {
    rmSync(join(root, 'packages/scoring/index.js'));
    const issues = canon.canonIssues(root);
    assert.ok(issues.some((issue) => issue.includes('definiert_in') && issue.includes('existiert nicht')), issues.join('\n'));
  });
});

test('eine Definition ohne den Namen ist rot', () => {
  withTree({ 'packages/scoring/index.js': "export const LEDGER_NAMESPACE = 'shinon.etwas/v1';\n" }, (root) => {
    const issues = canon.canonIssues(root);
    assert.ok(issues.some((issue) => issue.includes('traegt den Namen nicht')), issues.join('\n'));
  });
});

test('eine fehlende Registry ist rot', () => {
  withTree({}, (root) => {
    rmSync(join(root, canon.CANON_FILE));
    const issues = canon.canonIssues(root);
    assert.ok(issues.some((issue) => issue.includes(canon.CANON_FILE) && issue.includes('fehlt')), issues.join('\n'));
  });
});
