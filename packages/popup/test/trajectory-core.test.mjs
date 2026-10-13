#!/usr/bin/env node
/**
 * Popup-Kern (Zug 6) — ohne DSH, ohne Netz, ohne Modell, ohne node_modules.
 *
 * Belegt wird, was der Kern VERSPRICHT, und zwar an der GEMESSENEN Ereignisform
 * (`@deepseek-ai/dsh-session/lib/types/types.d.ts`, installierte Fassung):
 *
 *   - Das Fenster liefert `{ type: 'event', event }`; Chunks und Fremdes fallen weg.
 *   - Ein `turn/start` setzt die Lesart zurück, ein `turn/end` schließt sie ab.
 *   - Ein `tool/call` ist offen, bis sein `tool/result` es über
 *     `data.message.source.callId` schließt — der laufende Aufruf ist der jüngste
 *     offene.
 *   - Ohne `callId` wird NICHTS geschlossen (kein Raten).
 *   - Die Werkzeugliste ist gedeckelt (das Fenster wächst unbegrenzt).
 *
 * Läuft mit `node --test` (`npm test`) — kein DSH, kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY_KIND, TRAJECTORY_CONTRACT, TOOL_HISTORY_LIMIT, eventsOf, foldTrajectory, progressReading } from '../assets/trajectory-core.js';

const entry = (event) => ({ type: ENTRY_KIND, event });
const turnStart = (turn = 1) => entry({ type: 'turn/start', data: { turn } });
const turnEnd = (turn = 1) => entry({ type: 'turn/end', data: { turn } });
const stepStart = (step) => entry({ type: 'step/start', data: { turn: 1, step } });
const call = (callId, name) => entry({ type: 'tool/call', data: { turn: 1, step: 1, callId, name, arguments: '{}' } });
const result = (callId) => entry({ type: 'tool/result', data: { turn: 1, step: 1, message: { source: { callId } } } });

test('popup: der Vertragsname steht im Kern', () => {
  assert.equal(TRAJECTORY_CONTRACT, 'shinon.popup/trajectory-v1');
});

test('popup: nur echte Ereignisse zählen — Chunks und Fremdes fallen weg', () => {
  const entries = [
    { type: 'chunk', chunk: { type: 'text-delta', text: 'hallo' } },
    null,
    'kein objekt',
    { type: 'event' },
    turnStart(1),
    { type: ENTRY_KIND, event: { type: 'step/start', data: { step: 4 } } },
  ];
  assert.equal(eventsOf(entries).length, 2);
  assert.deepEqual(eventsOf(null), []);
  assert.deepEqual(eventsOf('kein array'), []);
});

test('popup: ohne Ereignisse ist die Lesart leer und inaktiv', () => {
  const reading = foldTrajectory([]);
  assert.deepEqual(reading, { turn: null, step: 0, calls: 0, open: 0, running: null, tools: [], active: false });
  assert.deepEqual(foldTrajectory(undefined), reading);
});

test('popup: ein offener Aufruf ist der laufende — sein result schließt ihn', () => {
  const reading = foldTrajectory([turnStart(2), stepStart(1), call('c1', 'read'), call('c2', 'bash')]);
  assert.equal(reading.active, true);
  assert.equal(reading.turn, 2);
  assert.equal(reading.step, 1);
  assert.equal(reading.calls, 2);
  assert.equal(reading.open, 2);
  assert.equal(reading.running, 'bash', 'der jüngste offene Aufruf läuft');
  assert.deepEqual(reading.tools, ['read', 'bash']);

  const after = foldTrajectory([turnStart(2), call('c1', 'read'), call('c2', 'bash'), result('c2')]);
  assert.equal(after.open, 1);
  assert.equal(after.running, 'read', 'nach dem Abschluss läuft der ältere weiter');
  assert.equal(after.calls, 2, 'die Zahl der Aufrufe fällt nicht zurück');
});

test('popup: ein turn/end schließt die Lesart ab', () => {
  const reading = foldTrajectory([turnStart(1), call('c1', 'read'), turnEnd(1)]);
  assert.equal(reading.active, false);
  assert.equal(reading.turn, null);
  assert.equal(reading.open, 0, 'ein beendeter Turn lässt keinen Aufruf offen');
  assert.equal(reading.running, null);
});

test('popup: ein neuer Turn setzt die Lesart zurück', () => {
  const reading = foldTrajectory([turnStart(1), call('c1', 'read'), stepStart(3), turnStart(2), call('c2', 'bash')]);
  assert.equal(reading.turn, 2);
  assert.equal(reading.step, 0, 'ein neuer Turn beginnt bei Schritt 0');
  assert.equal(reading.calls, 1, 'die Aufrufe gehören zum neuen Turn');
  assert.deepEqual(reading.tools, ['bash']);
});

test('popup: ein step/start ohne data.step zählt weiter statt zu springen', () => {
  const reading = foldTrajectory([turnStart(1), entry({ type: 'step/start', data: {} }), entry({ type: 'step/start', data: {} })]);
  assert.equal(reading.step, 2);
});

test('popup: ohne callId wird nichts geschlossen — der Aufruf bleibt offen', () => {
  const reading = foldTrajectory([
    entry({ type: 'tool/call', data: { name: 'nicht-zuordenbar' } }),
    entry({ type: 'tool/result', data: { message: { source: {} } } }),
  ]);
  assert.equal(reading.calls, 1);
  assert.equal(reading.open, 1, 'ohne Zuordnung gibt es keine Evidenz für Abschluss — also offen');
  assert.equal(reading.running, 'nicht-zuordenbar', 'der Name IST da, also wird er genannt');
});

test('popup: ein Aufruf ohne Namen wird gezählt, aber nicht benannt', () => {
  const reading = foldTrajectory([
    entry({ type: 'tool/call', data: {} }),
    entry({ type: 'tool/call', data: { callId: 'c1', name: 'read' } }),
  ]);
  assert.equal(reading.calls, 2);
  assert.equal(reading.open, 2);
  assert.equal(reading.running, 'read', 'ein namenloser Aufruf verdeckt keinen benannten');
});

test('popup: die Werkzeugliste ist gedeckelt (das Fenster wächst unbegrenzt)', () => {
  const entries = [turnStart(1)];
  for (let index = 0; index < TOOL_HISTORY_LIMIT + 5; index += 1) entries.push(call(`c${index}`, `tool${index}`));
  const reading = foldTrajectory(entries);
  assert.equal(reading.calls, TOOL_HISTORY_LIMIT + 5, 'gezählt wird alles');
  assert.equal(reading.tools.length, TOOL_HISTORY_LIMIT, 'behalten wird der Deckel');
  assert.equal(reading.tools[reading.tools.length - 1], `tool${TOOL_HISTORY_LIMIT + 4}`);
});

test('popup: die Lesart ist ein Sprach-Schluessel plus Zahlen — keine Sprache im Kern', () => {
  assert.deepEqual(progressReading(null), { key: null, values: { step: 0, open: 0, calls: 0, tool: null } });
  const active = foldTrajectory([turnStart(1), stepStart(2), call('c1', 'read')]);
  const reading = progressReading(active);
  assert.equal(reading.key, 'popup.running');
  assert.deepEqual(reading.values, { step: 2, open: 1, calls: 1, tool: 'read' });
  assert.equal(progressReading(foldTrajectory([])).key, null, 'ohne Vorgang gibt es keinen Text');
  assert.equal(progressReading(foldTrajectory([turnStart(1), turnEnd(1)])).key, null, 'ein beendeter Turn ist kein Vorgang');
});

test('popup: gleiches Fenster, gleiche Lesart (keine Uhr, kein Zufall)', () => {
  // Der CODE, nicht der Kommentar: der Kommentar nennt genau diese Namen, um zu
  // sagen, dass sie fehlen.
  const code = String(foldTrajectory).concat(String(eventsOf));
  assert.equal(/Math\.random|Date\.now|new Date\(/.test(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false, 'keine Zufallsquelle, keine Uhr');
  const entries = [turnStart(1), call('c1', 'read'), result('c1')];
  assert.deepEqual(foldTrajectory(entries), foldTrajectory(entries));
});
