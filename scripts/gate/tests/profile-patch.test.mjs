import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { composePatch, fragmentNames, patchDrift } from '../../profile-patch.mjs';

/**
 * Der Profilpatch ist generiert. Dieser Riegel prüft die drei Eigenschaften,
 * die die Ableitung tragen: die Reihenfolge ist lexikographisch und explizit,
 * die Datei ist bytegleich die Verkettung, und jeder Eintrag kommt genau
 * einmal vor. Ein fehlender Eintrag wäre sonst ein stiller Config-Verlust —
 * das Profil bootet weiter, nur mit anderen Werten.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TARGET = join(ROOT, 'profiles/shinon/cordis.patch.yml');
const FRAGMENTS = join(ROOT, 'profiles/shinon/fragments');

const ENTRY_ORDER = [
  'shinon-task-router',
  'shinon-project-index',
  'system-prompt',
  'agent-instructions',
  'ui-brand-official',
  'ui-settings-general',
  'llm-pi-ai',
  'agent-default-model',
  'agent-preset-registry',
  'ui-chat',
  'permission',
  'shinon-narrative',
  'shinon-persona',
  'shinon-prompter',
  'shinon-popup',
  'shinon-key-router',
  'shinon-traceability',
  'subagent',
  'subagent-model-selection-settings',
];

test('die Fragmente sind geordnet, nicht leer und bytegleich verkettet', () => {
  const names = fragmentNames();
  assert.deepEqual(names, [...names].sort(), 'Reihenfolge ist lexikographisch');
  assert.equal(names[0], '00-header.yml');
  for (const name of names) {
    const text = readFileSync(join(FRAGMENTS, name), 'utf8');
    assert.ok(text.trim() !== '', `${name} ist leer`);
    assert.ok(text.endsWith('\n'), `${name} endet ohne Zeilenumbruch`);
  }
  assert.equal(readFileSync(TARGET, 'utf8'), composePatch());
  assert.equal(patchDrift(), null);
});

test('jeder Patch-Eintrag steht genau einmal und in der belegten Reihenfolge', () => {
  const ids = [...readFileSync(TARGET, 'utf8').matchAll(/^- id: (\S+)$/gm)].map((match) => match[1]);
  assert.deepEqual(ids, ENTRY_ORDER);
  assert.equal(new Set(ids).size, ids.length, 'kein Eintrag doppelt');
});
