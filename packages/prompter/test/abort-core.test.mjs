/**
 * @shinon/prompter — abort-core.test.mjs
 *
 * Die Abbruchquote als Rechnung, geprüft an der ECHTEN Regeldatei und an den
 * neun Turns des Leitstands (`docs/probes/e2e-leitstand-2026-10-19.md`): vier
 * angenommen, fünf verworfen — davon vier Formatfehler und ein Abbruch bei 15 s.
 * Kein DSH, kein Modell, kein Netz.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ABORT_CONTRACT,
  UNCLASSIFIED,
  abortCounts,
  abortLabel,
  abortRecord,
  abortSummary,
  classifyAbort,
  reasonIds,
} from '../assets/abort-core.js';

const TABLE = JSON.parse(readFileSync(new URL('../assets/abort-reasons.json', import.meta.url), 'utf8'));

const rejected = (reasons, extra = {}) => ({ outcome: 'rejected', reasons, result: null, ...extra });
const accepted = (extra = {}) => ({ outcome: 'accepted', reasons: [], result: {}, ...extra });

test('die Regeldatei nennt Vertrag und Gründe in Prioritätsreihenfolge', () => {
  assert.equal(TABLE.contract, 'shinon.abort-reasons/v1');
  assert.deepEqual(reasonIds(TABLE), [
    'TIMEOUT', 'LEERER_STREAM', 'UNGUELTIGES_JSON', 'KEIN_JSON', 'SALVAGE', 'FEHLENDE_ROUTE', 'ABGEBROCHEN',
  ]);
});

test('Timeout wird erkannt — am Fehlernamen UND am abgebrochenen Stream', () => {
  assert.equal(classifyAbort(rejected(['LLM_FAILED:TimeoutError']), TABLE).id, 'TIMEOUT');
  // Der Leitstand-Fall: der Stream endet mit `aborted`, der Datensatz trägt
  // aber nur NO_JSON. Ohne das Finish-Feld wäre das ein Formatfehler.
  const aborted = rejected(['NO_JSON'], { failure: { finish: { kind: 'aborted', failure: { message: 'Request was aborted' } } } });
  assert.equal(classifyAbort(aborted, TABLE).id, 'TIMEOUT');
  assert.equal(classifyAbort(aborted, TABLE).label, 'Timeout');
});

test('die übrigen Gründe werden getrennt, nicht gesammelt', () => {
  assert.equal(classifyAbort(rejected(['INVALID_JSON']), TABLE).id, 'UNGUELTIGES_JSON');
  assert.equal(classifyAbort(rejected(['NO_JSON']), TABLE).id, 'KEIN_JSON');
  assert.equal(classifyAbort(rejected(['EMPTY_STREAM']), TABLE).id, 'LEERER_STREAM');
  // Ein abgebrochener Strom ist ein Timeout, auch wenn nichts ankam.
  assert.equal(
    classifyAbort(rejected(['EMPTY_STREAM'], { failure: { finish: { kind: 'aborted' } } }), TABLE).id,
    'TIMEOUT',
  );
  assert.equal(classifyAbort(rejected(['NO_ROUTE']), TABLE).id, 'FEHLENDE_ROUTE');
  assert.equal(classifyAbort(rejected(['NO_LLM_SERVICE']), TABLE).id, 'FEHLENDE_ROUTE');
  assert.equal(classifyAbort(rejected(['LLM_FAILED:Error']), TABLE).id, 'ABGEBROCHEN');
  assert.equal(classifyAbort(accepted({ salvage: { reason: 'NO_JSON', chars: 12, answerChars: 20 } }), TABLE).id, 'SALVAGE');
});

test('kein Abbruch ohne Abbruch', () => {
  assert.equal(classifyAbort(accepted(), TABLE), null);
  assert.equal(classifyAbort({ outcome: 'unavailable', reasons: ['MODE_NEEDS_CONTEXT'] }, TABLE).id, UNCLASSIFIED);
  assert.equal(classifyAbort(null, TABLE), null);
});

test('Zähler und Übergabe nennen genau einen Grund', () => {
  assert.deepEqual(abortCounts(rejected(['NO_JSON']), TABLE), { KEIN_JSON: 1 });
  assert.deepEqual(abortCounts(accepted(), TABLE), {});
  assert.deepEqual(abortRecord(rejected(['NO_JSON']), TABLE), {
    abort: { id: 'KEIN_JSON', label: 'Keine JSON-Antwort', rank: 3 },
    abort_counts: { KEIN_JSON: 1 },
  });
});

test('Gleichstand entscheidet die Tabellenpriorität — nicht die Eingabereihenfolge', () => {
  // `rank` reist im Datensatz; die zweite Faltung (Popup) sortiert damit gleich.
  assert.equal(classifyAbort(rejected(['NO_JSON']), TABLE).rank, 3, 'KEIN_JSON steht an Position 3');
  assert.equal(classifyAbort(accepted({ salvage: { chars: 1 } }), TABLE).rank, 4);
  assert.equal(classifyAbort({ outcome: 'other' }, TABLE).rank, TABLE.reasons.length, 'unklassifiziert steht hinten');

  const tie = [rejected(['INVALID_JSON']), rejected(['NO_JSON'])];
  assert.equal(abortSummary(tie, TABLE).top, 'UNGUELTIGES_JSON', 'TIMEOUT..UNGÜLTIGES_JSON steht vor KEIN_JSON');
  assert.equal(abortSummary([...tie].reverse(), TABLE).top, 'UNGUELTIGES_JSON', 'die Reihenfolge entscheidet nichts');
});

test('Leitstand: 5 Ausfälle in 9 Turns, Top-Grund ist der häufigste', () => {
  // docs/probes/e2e-leitstand-2026-10-19.md: 9 Turns, 4 angenommen, 5 verworfen
  // (Turn 2 INVALID_JSON, Turn 3 abgebrochen bei 15 s, Turn 4 + zwei weitere NO_JSON).
  const turns = [
    accepted(),
    rejected(['INVALID_JSON']),
    rejected(['NO_JSON'], { failure: { finish: { kind: 'aborted', failure: { message: 'Request was aborted' } } } }),
    rejected(['NO_JSON']),
    accepted(),
    accepted(),
    rejected(['NO_JSON']),
    rejected(['NO_JSON']),
    accepted(),
  ];
  const summary = abortSummary(turns, TABLE);
  assert.equal(summary.contract, ABORT_CONTRACT);
  assert.equal(summary.turns, 9);
  assert.equal(summary.aborts, 5);
  assert.equal(summary.quote, 5 / 9);
  assert.equal(summary.top, 'KEIN_JSON');
  assert.equal(summary.topLabel, 'Keine JSON-Antwort');
  assert.deepEqual(summary.counts, { UNGUELTIGES_JSON: 1, TIMEOUT: 1, KEIN_JSON: 3 });
  assert.equal(abortLabel(summary), 'abort=5/9 top=KEIN_JSON');
});

test('die Quote ist reihenfolge-unabhängig und zählt Trace-Einträge gleich', () => {
  const turns = [accepted(), rejected(['NO_JSON']), rejected(['NO_JSON']), rejected(['LLM_FAILED:TimeoutError'])];
  const forward = abortSummary(turns, TABLE);
  const backward = abortSummary([...turns].reverse(), TABLE);
  assert.equal(forward.quote, backward.quote);
  assert.equal(forward.top, backward.top);

  const trace = turns.map((record) => ({ outcome: record.outcome, ...abortRecord(record, TABLE) }));
  assert.deepEqual(abortSummary(trace, TABLE), forward);
});

test('ein neuer Grund ist ein Dateneintrag — kein Code', () => {
  const extended = {
    ...TABLE,
    reasons: [
      { id: 'RATE_LIMIT', label: 'Anbieter-Limit', match: { reasonsAny: ['RATE_LIMITED'] } },
      ...TABLE.reasons,
    ],
  };
  assert.equal(classifyAbort(rejected(['RATE_LIMITED']), extended).id, 'RATE_LIMIT');
  assert.deepEqual(abortCounts(rejected(['RATE_LIMITED']), extended), { RATE_LIMIT: 1 });
  assert.equal(abortSummary([rejected(['RATE_LIMITED'])], extended).topLabel, 'Anbieter-Limit');
});

test('ohne Tabelle bleibt der Abbruch sichtbar, aber unklassifiziert', () => {
  const summary = abortSummary([rejected(['NO_JSON'])], null);
  assert.equal(summary.aborts, 1);
  assert.equal(summary.top, UNCLASSIFIED);
  assert.equal(summary.quote, 1);
});

test('leere Liste: Quote 0, kein Top-Grund, kein Log-Label', () => {
  assert.deepEqual(abortSummary([], TABLE), {
    contract: ABORT_CONTRACT,
    turns: 0,
    aborts: 0,
    quote: 0,
    top: null,
    topLabel: null,
    counts: {},
  });
  assert.equal(abortLabel(abortSummary([], TABLE)), '');
});
