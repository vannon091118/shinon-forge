#!/usr/bin/env node
/**
 * scripts/gate/tests/package-checklist.test.mjs — die vier Pflichten eines Pakets.
 *
 * Der Test baut einen Miniatur-Baum mit genau einem Paket und entfernt je Fall
 * EINE Pflicht. Damit ist jede der vier Zeilen an einem roten Befund belegt und
 * nicht nur behauptet:
 *
 *   P1 Paketdateien, P2 Struktur-Klasse, P3 Profil oder `dsh.inactive`,
 *   P4 Fähigkeit mit `owner`.
 *
 * Der echte Baum läuft mit — dort sind alle 24 Pakete grün.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as repo from '../../lib/repo.mjs';
import { check } from '../plugins/package-checklist.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const CLASSES = [{ id: 'host-entry', muster: '^packages/[^/]+/index\\.js$', grenze: 550 }];

/** Ein Baum mit einem Paket; jede Option lässt genau eine Pflicht weg. */
function tree({ patch = true, klassen = CLASSES, bundles = ['@shinon/x'], capOwner = 'x', inactive = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-checklist-'));
  const write = (rel, text) => {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text, 'utf8');
  };
  write('package.json', JSON.stringify({ name: '@shinon/fixture' }));
  write('packages/x/package.json', JSON.stringify({ name: '@shinon/x', ...(inactive ? { dsh: { inactive: true } } : {}) }));
  if (patch) write('packages/x/cordis.patch.yml', 'id: shinon-x\n');
  write('packages/x/index.js', 'export function apply() {}\n');
  write('docs/contracts/structure.json', JSON.stringify({ contract: 'shinon.structure/v1', klassen }));
  write('packages/prompter/assets/capabilities.json', JSON.stringify({ contract: 'shinon.capabilities/v1', capabilities: [{ id: 'frage', owner: capOwner }] }));
  write('profiles/shinon/package.json', JSON.stringify({ dsh: { profile: { bundles } } }));
  return root;
}

const CTX = (root) => ({
  root: {},
  packages: [{ dir: 'x', manifest: JSON.parse(JSON.stringify({ name: '@shinon/x' })) }],
  repo: { ROOT: root, activeProfile: () => 'shinon' },
});

function run(options) {
  const root = tree(options);
  try {
    return check(CTX(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('der echte Baum erfüllt alle vier Pflichten', () => {
  assert.deepEqual(check({ root: repo.readRoot(), packages: repo.discover(), repo }), []);
});

test('P1: fehlender cordis.patch.yml ist ein Befund', () => {
  const issues = run({ patch: false });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^packages\/x: P1 cordis\.patch\.yml fehlt/);
});

test('P2: keine Struktur-Klasse ist ein Befund', () => {
  const issues = run({ klassen: [] });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^packages\/x: P2 keine Klasse/);
});

test('P3: weder Profil noch dsh.inactive ist ein Befund', () => {
  const issues = run({ bundles: [] });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^packages\/x: P3 weder im Profil/);
});

test('P3: dsh.inactive macht den Profil-Eintrag entbehrlich', () => {
  const root = tree({ bundles: [], inactive: true });
  try {
    const ctx = CTX(root);
    ctx.packages[0].manifest = { name: '@shinon/x', dsh: { inactive: true } };
    assert.deepEqual(check(ctx), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('P4: keine Fähigkeit mit eigenem owner ist ein Befund', () => {
  const issues = run({ capOwner: 'anderes' });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^packages\/x: P4 keine Fähigkeit/);
});
