#!/usr/bin/env node
/**
 * comment-canon — die Regel „höchstens 10 LOC Kommentar“ hält, und sie frisst
 * keine Zäune. Der zweite Teil ist keine Vorsicht: ein früherer Lauf nahm die
 * Zwillings-Marke `#region zwilling:…` mit, die Region fiel weg und
 * `lastHumanMessage` war nicht mehr definiert (61 rote Gate-Tests, 2026-10-17).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMIT, fixAll, scan, trimBlock } from '../../comment-limit.mjs';

const roots = [];
const tree = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-comment-canon-'));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
};

test('ein Block über 10 Zeilen wird gefunden, genau 10 nicht', () => {
  const root = tree({
    'packages/x/index.js': `// ${'a'.repeat(1)}\n${Array.from({ length: LIMIT - 1 }, (_, i) => `// ${i}`).join('\n')}\nexport const a = 1;\n`,
    'packages/x/client.js': `// ${'b'.repeat(1)}\n${Array.from({ length: LIMIT }, (_, i) => `// ${i}`).join('\n')}\nexport const b = 1;\n`,
  });
  const found = scan(root);
  assert.equal(found.length, 1, 'genau der überlange Block');
  assert.equal(found[0].file, join('packages', 'x', 'client.js'));
  assert.equal(found[0].len, LIMIT + 1);
});

test('Zwillings-Marken sind Zäune: sie werden nie gekürzt oder verschluckt', () => {
  const root = tree({
    'packages/x/index.js': [
      '// #region zwilling:probe — Besitzer: packages/x/index.js',
      ...Array.from({ length: 14 }, (_, i) => `// Zeile ${i}`),
      'export const a = 1;',
      '// #endregion zwilling:probe',
      '',
    ].join('\n'),
  });
  const before = readFileSync(join(root, 'packages/x/index.js'), 'utf8');
  fixAll(root);
  const after = readFileSync(join(root, 'packages/x/index.js'), 'utf8');
  assert.ok(after.includes('#region zwilling:probe'), 'die Startmarke steht noch');
  assert.ok(after.includes('#endregion zwilling:probe'), 'die Endmarke steht noch');
  assert.ok(after.includes('export const a = 1;'), 'der Code unter dem Block steht noch');
  assert.ok(after.length < before.length, 'der Überhang ist gekürzt');
});

test('Kürzen erhält den Blockabschluss und den Code darunter', () => {
  const root = tree({
    'packages/x/index.js': ['/**', ...Array.from({ length: 12 }, (_, i) => ` * ${i}`), ' */', 'export const a = 1;', ''].join('\n'),
  });
  const removed = fixAll(root);
  const after = readFileSync(join(root, 'packages/x/index.js'), 'utf8');
  assert.equal(removed, 1);
  assert.ok(!after.includes('\n * 11'), 'der Überhang ist weg');
  assert.ok(after.includes(' */'), 'der JSDoc-Block ist geschlossen');
  assert.ok(after.includes('export const a = 1;'), 'der Code darunter ist unberührt');
  assert.equal(scan(root).length, 0, 'danach ist der Baum kanonisch');
});

test('der Zeiger ist inhaltsdeterministisch: wortgleiche Spiegel bekommen denselben Anker', () => {
  const block = ['/**', ...Array.from({ length: 12 }, (_, i) => ` * ${i}`), ' */'];
  const one = trimBlock(block, 'k-abc');
  const two = trimBlock([...block], 'k-abc');
  assert.deepEqual(one, two);
  assert.ok(one.length <= LIMIT, `höchstens ${LIMIT} Zeilen`);
  assert.ok(one.some((line) => line.includes('→ Kanon: docs/COMMENT-KANON.md#k-abc')));
});

test('der echte Baum ist kanonisch', () => {
  const found = scan();
  assert.deepEqual(found.map((v) => `${v.file}:${v.len}`), [], 'kein Block über dem Kanon');
});
