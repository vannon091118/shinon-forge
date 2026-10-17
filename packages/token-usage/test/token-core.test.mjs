#!/usr/bin/env node
/**
 * token-core.test.mjs — die reine Rechnung der Token-Anzeige.
 *
 * Läuft ohne `node_modules`, ohne DSH und ohne Browser (`node --test
 * packages/token-usage/test/*.test.mjs`, eingebunden in `npm test`). Geprüft wird
 * die Regel des Besitzers (`packages/token-usage/assets/token-core.js`):
 *
 *   1. FALTUNG eines Turns aus seinen eigenen dauerhaften Ereignissen
 * → Kanon: docs/COMMENT-KANON.md#k-b554efc2dd9a
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKEN_USAGE_KEY,
  billedInputTokens,
  deriveTurnUsage,
  formatCacheHitPercent,
  formatTokens,
  groupedDigits,
  sessionReading,
  turnReading,
  turnSliceOf,
} from '../assets/token-core.js';

/** Ein dauerhafter Sitzungs-Eintrag in der Form des Clients: `{ type: 'event', event }`. */
const durable = (type, seq, data) => ({ type: 'event', event: { type, seq, time: 1_760_000_000_000 + seq, data } });
/** Eine client-only Zeile (Live-Chunk): `{ type: 'transient', event }` — keine dauerhafte Beweislage. */
const transient = (seq, data) => ({ type: 'transient', event: { type: 'assistant/live-chunk', seq, time: 1, data } });

/** Eine vollständige Anbieter-Usage; die Buckets sind die disjunkten prompt-seitigen. */
const usage = (inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, extra = {}) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  ...extra,
});

/** Ein schlichter, vollständiger Turn: ein Schritt, eine Nachricht mit exakter Summe. */
const TURN_ONE = [
  durable('turn/start', 1, { turn: 1 }),
  durable('step/start', 2, { turn: 1, step: 1 }),
  durable('assistant/message', 3, {
    turn: 1,
    step: 1,
    message: { source: { provider: 'agnes', model: 'agnes-3.0-flash' } },
    usage: usage(1000, 500, 3000, 200, { totalTokens: 4700 }),
    stream: [],
  }),
  durable('step/end', 4, { turn: 1, step: 1 }),
  durable('turn/end', 5, { turn: 1, reason: { kind: 'stop' } }),
];

/** Ein Turn mit zwei Versuchen: der erste Versuch scheitert, DSH versucht es neu. */
const TURN_RETRY = [
  durable('turn/start', 1, { turn: 2 }),
  durable('step/start', 2, { turn: 2, step: 1 }),
  durable('assistant/attempt', 3, {
    turn: 2,
    step: 1,
    attemptId: 'a1',
    stream: [{ type: 'chunk', chunk: { type: 'usage', usage: usage(10, 5, 0, 0) } }],
  }),
  durable('llm/retry', 4, { turn: 2, step: 1 }),
  durable('llm/retry-started', 5, { turn: 2, step: 1 }),
  durable('assistant/attempt', 6, {
    turn: 2,
    step: 1,
    attemptId: 'a2',
    stream: [{ type: 'chunk', chunk: { type: 'usage', usage: usage(20, 5, 0, 0) } }],
  }),
  durable('step/end', 7, { turn: 2, step: 1 }),
  durable('turn/end', 8, { turn: 2, reason: { kind: 'stop' } }),
];

const eventsOf = (turn) => turn.map((entry) => entry.event);

test('der Projektions-Schlüssel ist der Name, den DSH selbst führt', () => {
  assert.equal(TOKEN_USAGE_KEY, 'tokenUsage');
});

test('die drei Prompt-Buckets werden addiert, die Ausgabe kommt dazu', () => {
  const sit = { uncachedInputTokens: 5700, cacheReadTokens: 12200, cacheWriteTokens: 300, outputTokens: 512 };
  assert.equal(billedInputTokens(sit), 18200);
});

test('ein vollständiger Turn faltet zu genau der Zahl, die DSH meldet', () => {
  const folded = deriveTurnUsage(eventsOf(TURN_ONE));
  assert.deepEqual(folded, {
    uncachedInputTokens: 1000,
    outputTokens: 500,
    totalTokens: 4700,
    cacheReadTokens: 3000,
    cacheWriteTokens: 200,
    routes: [{ provider: 'agnes', model: 'agnes-3.0-flash' }],
  });
  // 3000 von 4200 Prompt-Token = 71,43 % → eine Stelle, wie DSHs Turn-Offenlegung.
  const reading = turnReading(folded, 1);
  assert.equal(reading.label, '4.7K tok · 71.4 % aus Cache');
  assert.equal(
    reading.detail,
    'Turn 1: 4.700 insgesamt · 4.200 Prompt (3.000 aus dem Cache, 1.000 neue Eingabe, 200 Cache-Schreiben) · 500 Ausgabe · agnes/agnes-3.0-flash',
  );
});

test('mehrere Versuche eines Turns werden summiert — die Neuversuche zählen mit', () => {
  const folded = deriveTurnUsage(eventsOf(TURN_RETRY));
  assert.equal(folded.totalTokens, 40);
  assert.equal(folded.uncachedInputTokens, 30);
  assert.equal(folded.outputTokens, 10);
  assert.equal(folded.cacheReadTokens, 0);
  assert.equal(folded.routes, undefined, 'ohne Anbieter an JEDEM Versuch wird keine Route behauptet');
});

test('fehlt eine Lebenslauf-Grenze, ist die Offenlegung nicht verfügbar — nicht geschätzt', () => {
  const withoutEnd = eventsOf(TURN_ONE).slice(0, -1);
  assert.equal(deriveTurnUsage(withoutEnd), undefined, 'ohne turn/end gibt es keinen vollständigen Turn');
  const withoutStart = eventsOf(TURN_ONE).slice(1);
  assert.equal(deriveTurnUsage(withoutStart), undefined, 'ohne turn/start fehlt der Bezug');
  assert.equal(deriveTurnUsage([]), undefined, 'ein leeres Fenster ist kein Turn');
  const noSample = eventsOf(TURN_ONE).map((event) =>
    event.type === 'assistant/message' ? { ...event, data: { ...event.data, usage: undefined } } : event);
  assert.equal(deriveTurnUsage(noSample), undefined, 'ohne Usage-Probe wird nichts erfunden');
});

test('eine widersprüchliche oder unsichere Probe kostet die ganze Offenlegung', () => {
  const withUsage = (patch) =>
    eventsOf(TURN_ONE).map((event) =>
      event.type === 'assistant/message' ? { ...event, data: { ...event.data, usage: usage(...patch) } } : event);
  // Exakte Summe passt nicht zu den Buckets: 9999 statt 4200 Prompt-Token.
  assert.equal(deriveTurnUsage(withUsage([1000, 500, 3000, 200, { totalTokens: 9999 }])), undefined);
  // Negative Zahl ist keine Zählung.
  assert.equal(deriveTurnUsage(withUsage([-1, 500, 3000, 200])), undefined);
  // Denken kann nicht größer als die Ausgabe sein.
  assert.equal(deriveTurnUsage(withUsage([1000, 500, 3000, 200, { reasoningTokens: 501 }])), undefined);
  // Ohne Cache-Buckets fehlt die vollständige Prompt-Seite — sie wird nicht als 0 angenommen.
  assert.equal(deriveTurnUsage(eventsOf(TURN_ONE).map((event) =>
    event.type === 'assistant/message'
      ? { ...event, data: { ...event.data, usage: { inputTokens: 1000, outputTokens: 500 } } }
      : event)), undefined);
});

test('die Reihenfolge der Ereignisse ist bindend', () => {
  const swapped = eventsOf(TURN_ONE);
  assert.equal(deriveTurnUsage([swapped[0], swapped[2], swapped[1], ...swapped.slice(3)]), undefined, 'message vor step/start');
  assert.equal(deriveTurnUsage([...swapped, ...eventsOf(TURN_ONE)]), undefined, 'zwei Turns in einem Slice');
});

test('nur der jüngste VOLLSTÄNDIGE Turn wird gezeigt — Live-Zeilen zählen nicht', () => {
  const open = [durable('turn/start', 6, { turn: 2 }), durable('step/start', 7, { turn: 2, step: 1 }), transient(8, { attemptId: 'a3', turn: 2, step: 1, chunk: { type: 'text', text: 'läuft' } })];
  const slice = turnSliceOf([...TURN_ONE, ...open]);
  assert.equal(slice.turn, 1, 'ein Turn ohne turn/end ist keine Beweislage');
  assert.deepEqual(slice.events, eventsOf(TURN_ONE));

  const second = [...TURN_ONE, ...TURN_RETRY];
  const newest = turnSliceOf(second);
  assert.equal(newest.turn, 2);
  assert.deepEqual(newest.events, eventsOf(TURN_RETRY), 'nur die Ereignisse DIESES Turns');
  assert.equal(turnSliceOf([]), undefined);
  assert.equal(turnSliceOf(undefined), undefined);
  assert.equal(turnSliceOf([transient(1, { attemptId: 'a1', turn: 1, step: 1, chunk: { type: 'text', text: 'x' } })]), undefined);
});

test('Cache-Prozente runden halbe Werte auf und verfehlen 100 nie knapp', () => {
  assert.equal(formatCacheHitPercent(12200, 18200, 0), '67');
  assert.equal(formatCacheHitPercent(12200, 18200, 1), '67');
  assert.equal(formatCacheHitPercent(1250, 10000, 0), '13', '12,5 % → 13');
  assert.equal(formatCacheHitPercent(0, 5000, 0), '0');
  assert.equal(formatCacheHitPercent(5000, 5000, 0), '100', 'nur der volle Treffer heisst 100');
  assert.equal(formatCacheHitPercent(0, 0, 0), null, 'ohne Prompt-Token keine Prozentzahl');
  // Der Rand, an dem die alte Kopie log: ein Teil-Treffer, der auf 100 runden würde.
  assert.equal(formatCacheHitPercent(9950, 10000, 1), '99.5');
  assert.equal(formatCacheHitPercent(9999, 10000, 0), '99.99');
  assert.equal(formatCacheHitPercent(9999, 10000, 1), '99.99');
  assert.equal(formatCacheHitPercent(99999, 100000, 0), '99.999');
});

test('die Sitzungs-Anzeige rechnet die Prompt-Seite aus den drei Buckets', () => {
  const measured = { uncachedInputTokens: 5700, cacheReadTokens: 12200, cacheWriteTokens: 300, outputTokens: 512 };
  const reading = sessionReading(measured);
  assert.equal(reading.totalTokens, 18712);
  assert.equal(reading.cacheHitPercent, '67');
  assert.equal(reading.label, '18.7K tok · 67 % aus Cache · Sitzung');
  assert.equal(
    reading.detail,
    'Sitzung: 18.712 insgesamt · 12.200 aus dem Cache · 5.700 neue Eingabe · 512 Ausgabe',
  );
  assert.equal(sessionReading(undefined), null);
  assert.equal(sessionReading({ uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }), null);
});

test('eine Anzeige ohne berechnete Token behauptet keine Null', () => {
  assert.equal(turnReading(undefined, 1), null);
  assert.equal(turnReading({ uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, totalTokens: 0 }, 1), null);
  // Ein Turn, der nur Ausgabe trug: keine Prozentzahl (null), aber eine ehrliche Zeile.
  const outputOnly = turnReading({ uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 10, totalTokens: 10 }, 1);
  assert.equal(outputOnly.cacheHitPercent, null);
  assert.equal(outputOnly.detail, 'Turn 1: 10 insgesamt · 0 Prompt (0 aus dem Cache, 0 neue Eingabe) · 10 Ausgabe');
});

test('kompakte und ausgeschriebene Zahlen folgen der Form der DSH-Pille', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(1000), '1K');
  assert.equal(formatTokens(18200), '18.2K');
  assert.equal(formatTokens(1234567), '1.2M');
  assert.equal(formatTokens(-1), null);
  assert.equal(formatTokens(Number.NaN), null);
  assert.equal(groupedDigits(18200), '18.200');
  assert.equal(groupedDigits(7), '7');
});

test('die Rechnung liest nur — sie verändert den Stand nicht', () => {
  const before = JSON.stringify(TURN_ONE);
  deriveTurnUsage(eventsOf(TURN_ONE));
  turnSliceOf(TURN_ONE);
  turnReading(deriveTurnUsage(eventsOf(TURN_ONE)), 1);
  sessionReading({ uncachedInputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3, outputTokens: 4 });
  assert.equal(JSON.stringify(TURN_ONE), before);
});
