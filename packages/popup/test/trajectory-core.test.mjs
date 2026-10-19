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
import { ENTRY_KIND, TRAJECTORY_CONTRACT, TOOL_HISTORY_LIMIT, eventsOf, foldAborts, foldTrajectory, progressReading } from '../assets/trajectory-core.js';

/** Keine Prompter-Entscheidung gelesen: die Quote ist leer, nicht geraten. */
const NO_ABORTS = { turns: 0, aborts: 0, quote: 0, top: null, topLabel: null, counts: {} };

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
  assert.deepEqual(reading, { turn: null, step: 0, calls: 0, open: 0, running: null, tools: [], active: false, aborts: NO_ABORTS });
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

test('popup: die Abbruchquote kommt aus denselben Entscheidungen wie das Panel', () => {
  // Die Einträge sind der Fensterspiegel des Prompters (`abort` trägt den
  // klassifizierten Grund). Der Kern kennt KEINEN Grund beim Namen — er liest
  // nur `id`/`label`; genau deshalb braucht ein neuer Grund keine Client-Änderung.
  const entries = [
    { outcome: 'accepted', abort: null },
    { outcome: 'rejected', abort: { id: 'KEIN_JSON', label: 'Keine JSON-Antwort', rank: 3 } },
    { outcome: 'rejected', abort: { id: 'TIMEOUT', label: 'Timeout', rank: 0 } },
    { outcome: 'rejected', abort: { id: 'KEIN_JSON', label: 'Keine JSON-Antwort', rank: 3 } },
    // Ein Grund, den es in `abort-reasons.json` noch nicht gibt: er zählt,
    // ohne dass diese Datei angefasst wird.
    { outcome: 'rejected', abort: { id: 'RATE_LIMIT', label: 'Anbieter-Limit', rank: 7 } },
  ];
  const reading = foldTrajectory([], TOOL_HISTORY_LIMIT, entries);
  assert.equal(reading.aborts.turns, 5);
  assert.equal(reading.aborts.aborts, 4);
  assert.equal(reading.aborts.quote, 0.8);
  assert.equal(reading.aborts.top, 'KEIN_JSON');
  assert.equal(reading.aborts.topLabel, 'Keine JSON-Antwort');
  assert.deepEqual(reading.aborts.counts, { KEIN_JSON: 2, TIMEOUT: 1, RATE_LIMIT: 1 });

  // Gleichstand entscheidet der `rank` aus dem Datensatz — dieselbe Rangfolge
  // wie im Host, ohne dass das Popup `abort-reasons.json` kennt.
  const tie = [
    { outcome: 'rejected', abort: { id: 'KEIN_JSON', label: 'Keine JSON-Antwort', rank: 3 } },
    { outcome: 'rejected', abort: { id: 'TIMEOUT', label: 'Timeout', rank: 0 } },
  ];
  assert.equal(foldAborts(tie).top, 'TIMEOUT');
  assert.equal(foldAborts([...tie].reverse()).top, 'TIMEOUT', 'die Reihenfolge entscheidet nichts');

  // Ohne Einträge bleibt die Quote leer statt „0 %".
  assert.deepEqual(foldAborts([]), NO_ABORTS);
  assert.deepEqual(foldAborts(undefined), NO_ABORTS);
  // Ein Eintrag ohne Ausgang ist keine Entscheidung — er zählt nicht als Turn.
  assert.deepEqual(foldAborts([{ abort: { id: 'KEIN_JSON' } }, 'kein objekt']), NO_ABORTS);
});

test('popup: gleiches Fenster, gleiche Lesart (keine Uhr, kein Zufall)', () => {
  // Der CODE, nicht der Kommentar: der Kommentar nennt genau diese Namen, um zu
  // sagen, dass sie fehlen.
  const code = String(foldTrajectory).concat(String(eventsOf));
  assert.equal(/Math\.random|Date\.now|new Date\(/.test(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false, 'keine Zufallsquelle, keine Uhr');
  const entries = [turnStart(1), call('c1', 'read'), result('c1')];
  assert.deepEqual(foldTrajectory(entries), foldTrajectory(entries));
});
