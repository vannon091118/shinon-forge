#!/usr/bin/env node
/**
 * scoring-block-learning.test.mjs — das Lernen im Ledger (Phase 3) als Weg.
 *
 * Signal → Gewicht → Neustart → Retraction, nach dem Muster von
 * `scripts/gate/tests/scoring-memory.test.mjs`, aber mit gefälschter Ablage
 * statt der echten SQLite (kein DSH nötig).
 *
 * WARUM HIER und nicht in `packages/scoring/test/`: dieser Weg fährt die
 * → Kanon: docs/COMMENT-KANON.md#k-702219ebf3d6
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCKS_DECISION_CHANNEL,
  Config,
  INDEX_STORE_CONTRACT,
  INDEX_STORE_SERVICE,
  LEDGER_NAMESPACE,
  WEIGHTS_CONTRACT,
  WEIGHTS_SERVICE,
  apply,
} from '../../../packages/scoring/index.js';

/** Die Ausgabe der Pakete auffangen — der Grund steht in den Asserts. */
const noise = [];
for (const level of ['log', 'warn', 'error']) {
  console[level] = (...args) => noise.push({ level, text: args.map(String).join(' ') });
}

/** Gefälschte Ablage in der Form der Index-Ablage (Vertrag + load/save). */
function fakeStore(saved = new Map()) {
  return {
    saved,
    service: {
      contract: INDEX_STORE_CONTRACT,
      load: (namespace) => {
        if (!saved.has(namespace)) return { ok: false, error: 'NO_SUCH_NAMESPACE' };
        return { ok: true, state: saved.get(namespace) };
      },
      save: (namespace, state) => {
        saved.set(namespace, state);
        return { ok: true };
      },
    },
  };
}

/** Der Host, wie das Scoring ihn sieht: Bus + Dienste, sonst nichts. */
function fakeHost(store) {
  const handlers = new Map();
  const services = new Map();
  const ctx = {
    on: (name, handler) => {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) ?? []).filter((entry) => entry !== handler));
    },
    emit: (name, ...args) => {
      for (const handler of handlers.get(name) ?? []) handler(...args);
    },
    provide: (name, value) => {
      services.set(name, value);
      return () => services.delete(name);
    },
    get: (name) => services.get(name),
  };
  ctx.provide(INDEX_STORE_SERVICE, store.service);
  return { ctx, services };
}

const mount = (store) => {
  const host = fakeHost(store);
  const api = apply(host.ctx, Config({}));
  return { host, api };
};

const envelope = (event_type, session_id = 's1') => ({ event_type, session_id });
const decision = (blocks, session_id = 's1') => ({ session_id, blocks });
const rating = (messageId, value, sessionId = 's1') => [
  envelope('feedback.rated', sessionId),
  { session_id: sessionId, item: { messageId, rating: value } },
];
const retract = (messageId, sessionId = 's1') => [
  envelope('feedback.retracted', sessionId),
  { session_id: sessionId, messageId },
];
const turnEnd = (kind, turn = 1, sessionId = 's1') => [
  envelope('turn.end', sessionId),
  { session_id: sessionId, turn, reason: { kind } },
];
const noted = (sessionId = 's1') => [
  envelope('feedback.noted', sessionId),
  { session_id: sessionId, text: 'eine Bemerkung ohne Pol' },
];

test('lernen: Signal wertet die gemerkte Auswahl — im selben Ledger wie das Protokoll', () => {
  const store = fakeStore();
  const { host, api } = mount(store);

  // Die vierte Naht ist schmal: eine Operation, geprüfter Vertrag.
  const weights = host.services.get(WEIGHTS_SERVICE);
  assert.deepEqual(Object.keys(weights).sort(), ['contract', 'read']);
  assert.equal(weights.contract, WEIGHTS_CONTRACT);
  assert.equal(weights.read(), null, 'leer heißt null — wie der Ton');

  // Ohne gemerkte Auswahl wertet selbst ein Urteil nichts.
  api.observe(...rating('m0', 'positive'));
  assert.equal(weights.read(), null, 'keine Auswahl, keine Wertung');

  host.ctx.emit(BLOCKS_DECISION_CHANNEL, decision(['persona-report', 'persona-epistemic']));
  api.observe(...rating('m1', 'positive'));
  assert.deepEqual(weights.read(), {
    'persona-report': { up: 1, down: 0 },
    'persona-epistemic': { up: 1, down: 0 },
  });

  // Turn-Ende trägt denselben Schritt weiter (schwache Zustimmung).
  api.observe(...turnEnd('completed'));
  assert.deepEqual(weights.read()['persona-report'], { up: 2, down: 0 });

  // Die Gewichte reisen im selben Snapshot wie das Protokoll — ein Feld mehr,
  // kein neues Backend, kein neuer Namensraum.
  const snapshot = store.saved.get(LEDGER_NAMESPACE);
  assert.ok(snapshot.records.length > 0, 'das Protokoll reist mit');
  assert.deepEqual(snapshot.blockWeights['persona-report'], { up: 2, down: 0 });
  assert.ok(snapshot.blockAttributions.some((entry) => entry.subject === 'm1' && entry.polarity === 'up'));
});

test('lernen: Neustart stellt wieder her — Widerruf nimmt exakt zurück', () => {
  const store = fakeStore();
  const first = mount(store);
  first.host.ctx.emit(BLOCKS_DECISION_CHANNEL, decision(['persona-report']));
  first.api.observe(...rating('m1', 'positive'));
  assert.deepEqual(first.host.services.get(WEIGHTS_SERVICE).read()['persona-report'], { up: 1, down: 0 });
  first.api.dispose();

  // Neustart: derselbe Speicher, neuer Host — die Gewichte sind wieder da.
  const second = mount(store);
  const weights = second.host.services.get(WEIGHTS_SERVICE);
  assert.deepEqual(weights.read()['persona-report'], { up: 1, down: 0 }, 'Neustart ohne Gedächtnis');

  // Späte Kritik ersetzt statt zu stapeln (dieselbe Zuordnung wie im Protokoll).
  second.host.ctx.emit(BLOCKS_DECISION_CHANNEL, decision(['persona-report']));
  second.api.observe(...rating('m1', 'negative'));
  assert.deepEqual(weights.read()['persona-report'], { up: 0, down: 1 }, 'ersetzt, nicht gestapelt');

  // Widerruf: die Zeile fällt weg, die Wertung mit ihr — exakt.
  second.api.observe(...retract('m1'));
  assert.equal(weights.read(), null, 'zurückgenommen heißt leer, nicht nullig');
  second.api.dispose();
});

test('lernen: Bemerkung und Unbekanntes werten nie', () => {
  const store = fakeStore();
  const { host, api } = mount(store);
  const weights = host.services.get(WEIGHTS_SERVICE);

  host.ctx.emit(BLOCKS_DECISION_CHANNEL, decision(['persona-report']));
  api.observe(...noted());
  assert.equal(weights.read(), null, 'Bemerkung ohne Pol');

  // Unbrauchbare Auswahl (keine Ids) und fehlende Sitzung: nichts zu werten.
  // Eigene Sitzungen je Fall — die gemerkte Auswahl einer anderen Sitzung
  // gilt dort weiter und darf hier nicht hineinspielen.
  host.ctx.emit(BLOCKS_DECISION_CHANNEL, decision(['', 42, null], 's9'));
  api.observe(...rating('m9', 'positive', 's9'));
  assert.equal(weights.read(), null, 'ohne Ids keine Zuordnung');

  host.ctx.emit(BLOCKS_DECISION_CHANNEL, { session_id: '', blocks: ['persona-report'] });
  api.observe(...rating('m8', 'positive', 's8'));
  assert.equal(weights.read(), null, 'ohne Sitzung keine Zuordnung');
  api.dispose();
});
