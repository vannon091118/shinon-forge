/**
 * Abnahme für T5b-4: Slot-IDs folgen `<name>-<purpose>`.
 *
 * Der Riegel muss OHNE den Echtbaum rot sein — sonst misst der Test nur, dass
 * heute alles gut aussieht. Jeder Fall kippt genau eine Regel; dazu zwei
 * Grenzfälle, die GRÜN bleiben müssen: eine ID in einer Datei-Konstante (die
 * halbe Bake steht so da) und derselbe Eintrag in zwei Slots (ein Panel hängt
 * legitim an `main` und `sidebar.panellist`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, slotIds } from '../plugins/slot-ids.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function baum(dir, text) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-slot-ids-'));
  mkdirSync(join(root, 'packages', dir), { recursive: true });
  writeFileSync(join(root, 'packages', dir, 'client.js'), text);
  return root;
}

const ctx = (root, dir = 'a') => ({ root, packages: [{ dir }] });

test('Echtbaum: jede Slot-ID folgt `shinon-<name>-<purpose>`', async () => {
  const { readdirSync } = await import('node:fs');
  const packages = readdirSync(join(ROOT, 'packages')).map((dir) => ({ dir }));
  assert.deepEqual(check({ root: ROOT, packages }), []);
});

test('eine ID ohne shinon-Präfix oder mit Großbuchstaben ist rot', () => {
  const root = baum('a', "ctx.slots.register({ name: 'main', id: 'Panel_Oben' }, P);\n");
  try {
    const issues = check(ctx(root));
    assert.equal(issues.length, 1);
    assert.match(issues[0], /id = Panel_Oben folgt nicht `shinon-<name>-<purpose>`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ein Bezeichner, den die Datei nicht als Literal definiert, ist rot', () => {
  const root = baum('a', "ctx.slots.register({ name: 'main', key: OTHER_ID }, P);\n");
  try {
    assert.match(check(ctx(root))[0], /key OTHER_ID ist keine Zeichenkette/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Kommentare und Konstanten: die Erklärung zählt nicht, die Konstante schon', () => {
  const text = [
    "// ctx.slots.register({ name: 'main', key: 'FALSCH' })",
    '/** key: \'auch falsch\' */',
    "const PANEL_ID = 'shinon-codingmon';",
    "ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, P));",
    "ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID }, P));",
  ].join('\n');
  const root = baum('a', text);
  try {
    assert.deepEqual(check(ctx(root)), [], 'kein Befund — Kommentare zählen nicht, gleiche ID in zwei Slots ist erlaubt');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slotIds() liefert Feld und aufgelösten Wert', () => {
  const found = slotIds("const X = 'shinon-x-y';\nctx.slots.register({ name: 's', key: X, id: 'shinon-a-b' }, P);");
  assert.deepEqual(found, [
    { field: 'key', value: 'shinon-x-y', resolved: true },
    { field: 'id', value: 'shinon-a-b', resolved: true },
  ]);
});
