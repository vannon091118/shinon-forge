import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { laneIssues, summaryCounts, verdict } from '../test-lanes.mjs';

/**
 * Der Riegel an der Testline: jede Datei genau einer Bahn, jede Grenze eine
 * Zahl — und `cancelled` zählt wie `fail`. Der Echtbaum ist der erste Fall;
 * die übrigen bauen kleine Bäume, weil ein fehlender Eintrag sonst nur
 * auffällt, wenn jemand zufällig eine Datei anlegt.
 */

function fixture({ lanes, limits = { fast: 20000, slow: 600000 }, files = [], registry = true }) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-lanes-'));
  mkdirSync(join(root, 'tests'));
  for (const name of files) writeFileSync(join(root, 'tests', name), '');
  if (registry) {
    writeFileSync(join(root, 'test-lanes.json'), JSON.stringify({ contract: 'shinon.gate-lanes/v1', limits, lanes }));
  }
  return root;
}

test('Echtbaum: jede Testdatei gehört genau einer Bahn', () => {
  assert.deepEqual(laneIssues(), []);
});

test('fehlende Registry ist ein Befund, kein stiller Lauf', () => {
  const root = fixture({ registry: false });
  try {
    assert.match(laneIssues(root).join('\n'), /Registry fehlt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dieselbe Datei in zwei Bahnen ist rot', () => {
  const root = fixture({
    lanes: { fast: ['a.test.mjs'], slow: ['a.test.mjs'] },
    files: ['a.test.mjs'],
  });
  try {
    assert.match(laneIssues(root).join('\n'), /UND/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ein Eintrag ohne Datei ist rot', () => {
  const root = fixture({ lanes: { fast: ['fehlt.test.mjs'], slow: [] }, files: [] });
  try {
    assert.match(laneIssues(root).join('\n'), /existiert nicht/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('eine Datei ohne Bahn ist rot', () => {
  const root = fixture({ lanes: { fast: [], slow: [] }, files: ['neu.test.mjs'] });
  try {
    assert.match(laneIssues(root).join('\n'), /gehört keiner Bahn/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('eine Grenze, die keine Zahl ist, ist rot', () => {
  const root = fixture({
    lanes: { fast: ['a.test.mjs'], slow: [] },
    limits: { fast: 'bald', slow: 600000 },
    files: ['a.test.mjs'],
  });
  try {
    assert.match(laneIssues(root).join('\n'), /keine gültige Grenze/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('TAP: cancelled und fail sind rot, ein vollständiger Lauf ist grün', () => {
  const green = summaryCounts('# tests 7\n# pass 7\n# fail 0\n# cancelled 0\n');
  assert.equal(verdict(green), null);
  assert.match(verdict(summaryCounts('# tests 7\n# pass 5\n# fail 0\n# cancelled 2\n')), /abgebrochen/);
  assert.match(verdict(summaryCounts('# tests 7\n# pass 6\n# fail 1\n# cancelled 0\n')), /rot/);
  assert.match(verdict(summaryCounts('kein Bericht')), /ungeprüft/);
});
