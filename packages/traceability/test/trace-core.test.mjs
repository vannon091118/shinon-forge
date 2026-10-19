#!/usr/bin/env node
/**
 * Traceability-Kern — ohne DSH, ohne Netz, ohne Modell, ohne node_modules.
 *
 * Belegt, was der Kern VERSPRICHT, und zwar an der gemessenen Ereignisform
 * (`@deepseek-ai/dsh-session`, dieselbe wie popup):
 *
 *   - Das Fenster liefert `{ type: 'event', event }`; Chunks und Fremdes fallen weg.
 *   - `tool/call` oeffnet, `tool/result` schliesst ueber
 *     `data.message.source.callId` — OHNE callId wird NICHTS geschlossen.
 *   - Ein geschlossener Datensatz wird fertig, statt ein zweiter zu entstehen.
 *   - Deduplizierung ueber callId, Deckelung auf `maxVisible`, juengste zuerst.
 *   - Der Kern ist SPRACHFREI: er liefert Schluessel und Werte, keine Toatetexte.
 *
 * Laeuft mit `node --test` (`npm test`) — kein DSH, kein node_modules.
 *
 * Die BYTEGLEICHHEIT dieser Region zur Client-Haelfte traegt die Zwillings-Regel
 * `zwilling:trace-toasts` in `scripts/lib/repo.mjs` (geprueft von Gate und
 * Build) — hier steht nur die Rechnung, nicht noch einmal ihr Textabgleich.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRY_KIND,
  TOAST_CONTRACT,
  TOAST_DEFAULTS,
  WINDOW_LIMIT,
  isRecord,
  eventsOf,
  foldToasts,
} from '../assets/trace-core.js';

const entry = (event) => ({ type: ENTRY_KIND, event });
const call = (callId, name, time = '2026-10-16T23:30:00.000Z') =>
  entry({ type: 'tool/call', time, data: { callId, name } });
const result = (callId, success = true, time = '2026-10-16T23:30:01.000Z') =>
  entry({ type: 'tool/result', time, data: { success, message: { source: { callId } } } });
const step = (turn, step) => entry({ type: 'step/start', time: 'T', data: { turn, step } });
const failure = (message) => entry({ type: 'agent/error', time: 'T', data: { error: { message } } });

test('traceability: Vertrag und Grenzen sind feste Werte', () => {
  assert.equal(TOAST_CONTRACT, 'shinon.traceability/toast-v1');
  assert.deepEqual(TOAST_DEFAULTS, { enabled: true, maxVisible: 3, duration: 4000 });
  assert.equal(WINDOW_LIMIT, 500);
  assert.equal(ENTRY_KIND, 'event');
});

test('traceability: nur echte Fenstereintraege werden gelesen', () => {
  const entries = [
    entry({ type: 'tool/call', data: { callId: 'a', name: 'read' } }),
    { type: 'chunk', data: {} },
    { type: 'event', event: 'kein objekt' },
    null,
    'text',
  ];
  assert.equal(eventsOf(entries).length, 1);
  assert.deepEqual(eventsOf(undefined), []);
  assert.deepEqual(eventsOf(null), []);
  assert.equal(isRecord({}), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord([1]), false);
});

test('traceability: das Fenster wird gedeckelt (es wachst unbegrenzt)', () => {
  const many = Array.from({ length: 600 }, (_unused, index) =>
    entry({ type: 'tool/call', time: String(index), data: { callId: `c${index}`, name: 'bash' } }));
  const read = eventsOf(many);
  assert.equal(read.length, WINDOW_LIMIT);
  assert.equal(read[0].time, '100');
});

test('traceability: tool/call oeffnet, tool/result schliesst denselben Datensatz', () => {
  const toasts = foldToasts([call('c1', 'read'), result('c1')], 3);
  assert.equal(toasts.length, 1, 'ein geschlossener Aufruf bleibt EIN Toat');
  assert.equal(toasts[0].kind, 'tool-result');
  assert.equal(toasts[0].key, 'toast.tool_ok');
  assert.equal(toasts[0].tone, 'success');
  assert.equal(toasts[0].callId, 'c1');
  assert.equal(toasts[0].ts, '2026-10-16T23:30:01.000Z');
});

test('traceability: ein fehlgeschlagener Aufruf wird rot, nicht gruen', () => {
  const [toast] = foldToasts([call('c1', 'bash'), result('c1', false)], 3);
  assert.equal(toast.key, 'toast.tool_failed');
  assert.equal(toast.tone, 'error');
  assert.equal(toast.kind, 'tool-result');
});

test('traceability: ohne callId wird NICHTS geschlossen (kein Raten)', () => {
  const toasts = foldToasts([call('c1', 'read'), result(null)], 3);
  assert.equal(toasts.length, 2, 'der offene Aufruf bleibt offen, das Ergebnis ist ein zweiter Toat');
  // Die Liste ist umgekehrt: der juengste Datensatz steht oben.
  assert.equal(toasts[0].kind, 'tool-result');
  assert.equal(toasts[1].kind, 'tool-call');
  assert.equal(toasts[0].callId, null);
});

test('traceability: ein Ergebnis ohne offenen Aufruf traegt die gekuerzte Kennung', () => {
  const [toast] = foldToasts([result('call_abcdefghij')], 3);
  assert.equal(toast.key, 'toast.tool_ok');
  assert.deepEqual(toast.values, { id: 'call_abc' }, 'acht Zeichen: call_abc');
});

test('traceability: Schritt und Fehler bekommen eigene Toats mit Werten', () => {
  const [stepToast] = foldToasts([step(2, 40)], 3);
  assert.equal(stepToast.key, 'toast.step');
  assert.equal(stepToast.kind, 'step');
  assert.equal(stepToast.tone, 'muted');
  assert.deepEqual(stepToast.values, { step: 40, turn: 2 });

  const [errorToast] = foldToasts([failure('x'.repeat(80))], 3);
  assert.equal(errorToast.key, 'toast.error');
  assert.equal(errorToast.tone, 'error');
  assert.equal(errorToast.values.message.length, 61, 'Text auf 60 Zeichen plus Auslassung');
  assert.ok(errorToast.values.message.endsWith('…'));
});

test('traceability: doppelte Kennungen zaehlen einmal', () => {
  const toasts = foldToasts([call('c1', 'read'), call('c1', 'read'), result('c1')], 5);
  assert.equal(toasts.length, 1);
});

test('traceability: gedeckelt auf maxVisible, die juengsten stehen oben', () => {
  const entries = Array.from({ length: 5 }, (_unused, index) => call(`c${index}`, `tool${index}`));
  const toasts = foldToasts(entries, 2);
  assert.equal(toasts.length, 2);
  assert.equal(toasts[0].callId, 'c4', 'der juestige zuerst');
  assert.equal(toasts[1].callId, 'c3');
});

test('traceability: eine Grenze ohne Zahl faellt auf den Vertrag zurueck', () => {
  const entries = Array.from({ length: 5 }, (_unused, index) => call(`c${index}`, `tool${index}`));
  assert.equal(foldToasts(entries, undefined).length, TOAST_DEFAULTS.maxVisible);
  assert.equal(foldToasts(entries, 0).length, TOAST_DEFAULTS.maxVisible);
  assert.equal(foldToasts(entries, Number.NaN).length, TOAST_DEFAULTS.maxVisible);
});

test('traceability: der Kern bleibt sprachfrei — Schluessel, keine Toatetexte', () => {
  const toasts = foldToasts(
    [call('c1', 'read'), result('c1'), step(1, 1), failure('boom')],
    10,
  );
  const allowed = /^toast\.[a-z_]+$/;
  for (const toast of toasts) {
    assert.match(toast.key, allowed, 'ein Schluessel, kein Satz');
    assert.equal(typeof toast.values, 'object');
    assert.ok(['warn', 'success', 'error', 'muted'].includes(toast.tone), 'ein Ton, keine Farbe');
    for (const value of Object.values(toast.values)) {
      assert.notEqual(typeof value, 'object', 'nur Rohtexte und Zahlen als Werte');
    }
  }
});
