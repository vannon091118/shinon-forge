import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripComments } from '../../lib/source-scan.mjs';

const root = new URL('../../../packages/', import.meta.url);
const registration = /ctx\.slots\.register\(\s*\{\s*name:\s*(['"])(.*?)\1([\s\S]*?)\}\s*,/g;

function orderedSlots(rows) {
  const seen = new Map(), collisions = [];
  for (const row of rows) {
    const key = `${row.slot}\0${row.order}`;
    if (seen.has(key)) collisions.push([seen.get(key), row]);
    else seen.set(key, row);
  }
  return collisions;
}

function registeredOrders() {
  const rows = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    let source;
    try { source = stripComments(readFileSync(new URL(`${entry.name}/client.js`, root), 'utf8')); } catch { continue; }
    for (const match of source.matchAll(registration)) {
      const order = /\border:\s*(\d+)/.exec(match[3]);
      if (order) rows.push({ slot: match[2], order: Number(order[1]), file: `${entry.name}/client.js` });
    }
  }
  return rows;
}

test('Client-Slots haben je Slot keine doppelte numerische Order', () => {
  const rows = registeredOrders();
  assert.ok(rows.length > 0, 'der Scan hat keine geordneten Slot-Registrierungen gefunden');
  const duplicates = orderedSlots(rows);
  assert.deepEqual(duplicates, [], `doppelte Slot-Orders: ${JSON.stringify(duplicates)}`);
});

test('die Kollisionswache erkennt dieselbe Order im selben Slot, erlaubt andere Slots', () => {
  assert.equal(orderedSlots([
    { slot: 'main', order: 10 }, { slot: 'sidebar.panellist', order: 10 },
    { slot: 'main', order: 10 },
  ]).length, 1);
});
