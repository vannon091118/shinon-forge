#!/usr/bin/env node
/**
 * block-weights.test.mjs — der Lern-Kern (Phase 3) als Vertrag.
 *
 * Gepinnt wird: Polarität je Signal (Urteil, Turn-Ende; Bemerkung ohne Pol),
 * Zählen und exaktes Zurücknehmen, Rang 0 für Unbekannt, Formprüfung mit
 * Zählung statt Raten. Tabellen, wo sie lesbarer sind als Verzweigungen.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig
 * (der Kern hat keine Imports — dieselbe Regel wie scoring-core).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyAttribution,
  cleanBlockIds,
  emptyWeights,
  polarityOf,
  rankScore,
  readWeights,
  reverseAttribution,
  validateAttribution,
  validateWeights,
} from '../assets/block-weights.js';

test('polaritaet: nur was einen Pol hat, wird gewertet', () => {
  const cases = [
    // [signal, erwartet] — Urteil, Turn-Ende, Widerruf-Ziele und der Rest.
    ['copy', 'up'],
    ['accept', 'up'],
    ['selffix', 'down'],
    ['rephrase', 'down'],
    ['dismiss', 'down'],
    ['note', null],
    ['adopt', null],
    ['nextq', null],
    ['unbekannt', null],
    [null, null],
    [undefined, null],
    [42, null],
  ];
  for (const [signal, expected] of cases) {
    assert.equal(polarityOf(signal), expected, `Polarität von ${JSON.stringify(signal)}`);
  }
});

test('zaehlen: Zustimmung hoch, Korrektur runter — Unbekanntes ändert nichts', () => {
  let weights = emptyWeights();
  weights = applyAttribution(weights, ['a', 'b'], 'up');
  weights = applyAttribution(weights, ['a'], 'down');
  assert.deepEqual(weights, { a: { up: 1, down: 1 }, b: { up: 1, down: 0 } });
  // Kein Pol, keine Ids, keine Änderung — fail-closed in drei Richtungen.
  assert.deepEqual(applyAttribution(weights, ['a'], null), weights);
  assert.deepEqual(applyAttribution(weights, ['a'], 'vielleicht'), weights);
  assert.deepEqual(applyAttribution(weights, null, 'up'), weights);
  assert.deepEqual(applyAttribution(weights, ['', 42, 'a', 'a'], 'up'), {
    a: { up: 2, down: 1 },
    b: { up: 1, down: 0 },
  });
});

test('zuruecknehmen: exakt, mit Boden, ohne Null-Zeilen', () => {
  const attribution = { session_id: 's', subject: 'm1', blocks: ['a', 'b'], polarity: 'up' };
  let weights = applyAttribution(applyAttribution(emptyWeights(), ['a', 'b'], 'up'), ['a'], 'down');
  weights = reverseAttribution(weights, attribution);
  assert.deepEqual(weights, { a: { up: 0, down: 1 } }, 'b fällt als Null-Zeile weg, a behält sein down');
  weights = reverseAttribution(weights, { ...attribution, polarity: 'down', blocks: ['a'] });
  assert.deepEqual(weights, {}, 'leere Gewichte verschwinden ganz');
  // Unbekanntes kehrt nichts um — auch nicht unter null.
  assert.deepEqual(reverseAttribution(weights, null), {});
  assert.deepEqual(reverseAttribution(weights, { ...attribution, blocks: ['fremd'] }), {});
});

test('rang: Differenz für Bekannte, 0 für den Rest', () => {
  const weights = { a: { up: 3, down: 1 }, b: { up: 0, down: 2 } };
  assert.equal(rankScore(weights, 'a'), 2);
  assert.equal(rankScore(weights, 'b'), -2);
  for (const unknown of ['fremd', '', null, undefined, 42]) {
    assert.equal(rankScore(weights, unknown), 0);
  }
  assert.equal(rankScore(null, 'a'), 0);
  assert.equal(rankScore({ a: { up: -1, down: 'x' } }, 'a'), 0, 'kaputte Zähler lesen sich als 0');
});

test('formpruefung: nur die Form, gezählt statt geraten', () => {
  const { weights, dropped } = validateWeights({
    a: { up: 2, down: 0 },
    leer: { up: 0, down: 0 },
    negativ: { up: -1, down: 0 },
    text: { up: 'viel', down: 0 },
    keinObjekt: 42,
    '': { up: 1, down: 0 },
  });
  assert.deepEqual(weights, { a: { up: 2, down: 0 } });
  assert.equal(dropped, 4);
  assert.deepEqual(validateWeights(null), { weights: {}, dropped: 0 });
  assert.deepEqual(validateWeights([]), { weights: {}, dropped: 0 });
});

test('zuordnung: Sitzung + Betreff + Ids + Polarität, sonst nichts', () => {
  const valid = { session_id: 's', subject: 'm1', blocks: ['a', 'a', ''], polarity: 'up' };
  assert.deepEqual(validateAttribution(valid), { session_id: 's', subject: 'm1', blocks: ['a'], polarity: 'up' });
  for (const broken of [
    null,
    { session_id: 's', subject: 'm1', blocks: ['a'], polarity: 'vielleicht' },
    { session_id: 's', subject: '', blocks: ['a'], polarity: 'up' },
    { session_id: 's', subject: 'm1', blocks: [], polarity: 'up' },
    { session_id: 's', subject: 'm1', blocks: 'a', polarity: 'up' },
  ]) {
    assert.equal(validateAttribution(broken), null, `fällt durch: ${JSON.stringify(broken)}`);
  }
});

test('lesen: leer heißt null — wie der Ton', () => {
  assert.equal(readWeights({}), null);
  assert.equal(readWeights(null), null);
  assert.deepEqual(readWeights({ a: { up: 1, down: 0 } }), { a: { up: 1, down: 0 } });
});

test('ids: entdoppelt, ohne Leere, gedeckelt', () => {
  assert.deepEqual(cleanBlockIds(['a', '', null, 'a', 'b']), ['a', 'b']);
  assert.deepEqual(cleanBlockIds('kein-array'), []);
  const many = Array.from({ length: 50 }, (_, index) => `block-${index}`);
  assert.equal(cleanBlockIds(many).length, 30, 'Deckel statt Wachstum');
});
