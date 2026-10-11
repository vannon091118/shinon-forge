#!/usr/bin/env node
/**
 * Replay-Tests des Scorings (K3).
 *
 * Nach dem Vorbild von @shinon/events (replayPath-Fixture als Orakel):
 * derselbe Strom bei gleichem Start ergibt dieselbe Scorecard, dieselbe
 * Injektion, denselben Digest. Dazu: Decay-Handrechnung, Kühl-Intervall,
 * fail-closed und die Importfreiheit des Kerns (kein node_modules nötig).
 *
 * Läuft mit `node --test` (`npm run test:scoring`) — kein DSH, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as core from '../assets/scoring-core.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const scoring = JSON.parse(readFileSync(join(DIR, '../assets/scoring-state.json'), 'utf8'));
const profile = JSON.parse(readFileSync(join(DIR, '../assets/technical-profile.json'), 'utf8'));
const triggers = JSON.parse(readFileSync(join(DIR, '../assets/skill-triggers.json'), 'utf8'));
const fixture = JSON.parse(readFileSync(join(DIR, '../assets/replay/scoring-demo.json'), 'utf8'));
const contracts = { scoring, profile, triggers };

const approval = (text) => ({ type: 'feedback.approval', payload: { session_id: 'sess-1', approval: text } });

// ── 1. Fixture-Orakel ────────────────────────────────────────────────────────

test('scoring: die Fixture wird scorecard-, injektions- und digestgleich reproduziert', () => {
  const result = core.replay(contracts, fixture.initial, fixture.stream);
  assert.deepEqual(result.scorecard, fixture.expected.scorecard);
  assert.deepEqual(result.injection, fixture.expected.injection);
  assert.equal(result.digest, fixture.expected.digest);
});

// ── 2. Determinismus ─────────────────────────────────────────────────────────

test('scoring: gleicher Strom + gleicher Start = identisches Ergebnis', () => {
  const first = core.replay(contracts, fixture.initial, fixture.stream);
  const second = core.replay(contracts, fixture.initial, fixture.stream);
  assert.deepEqual(first, second);
  assert.equal(first.digest, fixture.expected.digest);
});

test('scoring: anderer Strom, anderer Digest — gleiche Eingabe, gleicher Digest', () => {
  const changed = core.replay(contracts, fixture.initial, [...fixture.stream, approval('noch eins')]);
  assert.notEqual(changed.digest, fixture.expected.digest);
  const repeat = core.replay(contracts, fixture.initial, [...fixture.stream, approval('noch eins')]);
  assert.equal(changed.digest, repeat.digest);
});

// ── 3. Decay-Handrechnung ────────────────────────────────────────────────────

test('scoring: Zustimmung hebt correctness um das Delta (0.5 → 0.56)', () => {
  const { state } = core.applyEvent(contracts, core.initialState(scoring), approval('so passt es'));
  assert.equal(state.scores.correctness, 0.56);
  assert.equal(state.scores.trust, 0.53);
});

test('scoring: altes Evidence verblasst — zweite Zustimmung decays vor dem Delta (0.6188)', () => {
  let state = core.initialState(scoring);
  state = core.applyEvent(contracts, state, approval('eins')).state;
  state = core.applyEvent(contracts, state, approval('zwei')).state;
  // Decay: 0.56 + (0.5 − 0.56) × 0.02 = 0.5588, dann +0.06 = 0.6188.
  assert.equal(state.scores.correctness, 0.6188);
});

test('scoring: Korrekturen wiegen schwerer als Zustimmung (asymmetrisch, konservativ)', () => {
  const up = core.applyEvent(contracts, core.initialState(scoring), approval('gut')).state;
  const down = core.applyEvent(contracts, core.initialState(scoring), {
    type: 'feedback.correction',
    payload: { session_id: 'sess-1', correction: 'falsch' },
  }).state;
  assert.equal(up.scores.correctness, 0.56);
  assert.equal(down.scores.correctness, 0.41);
});

// ── 4. Kühl-Intervall ────────────────────────────────────────────────────────

test('scoring: 1–2 Signale ändern noch keine Veröffentlichung (Sparsitätsschutz)', () => {
  let state = core.initialState(scoring);
  state = core.applyEvent(contracts, state, approval('eins')).state;
  assert.equal(state.scores.correctness, 0.56);
  assert.deepEqual(state.published, { correctness: 0.5, trust: 0.5 });
  state = core.applyEvent(contracts, state, approval('zwei')).state;
  assert.deepEqual(state.published, { correctness: 0.5, trust: 0.5 });
});

test('scoring: das 3. Signal veröffentlicht — die Injektion liest nur Veröffentlichtes', () => {
  let state = core.initialState(scoring);
  for (const word of ['eins', 'zwei', 'drei']) state = core.applyEvent(contracts, state, approval(word)).state;
  assert.deepEqual(state.published, state.scores);
  assert.equal(state.signalsSincePublish, 0);
});

// ── 5. Fail-closed ───────────────────────────────────────────────────────────

test('scoring: unbekanntes Event ändert nichts, wird aber gezählt', () => {
  const before = core.initialState(scoring);
  const result = core.applyEvent(contracts, before, { type: 'mood.changed', payload: { session_id: 'sess-1' } });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'UNKNOWN_EVENT');
  assert.deepEqual({ ...result.state, ignored: 0 }, { ...before, ignored: 0 });
  assert.equal(result.state.ignored, 1);
});

test('scoring: fehlender Payload-Schlüssel und unbenannte Relation werden verworfen', () => {
  const before = core.initialState(scoring);
  const missing = core.applyEvent(contracts, before, { type: 'feedback.approval', payload: { session_id: 'sess-1' } });
  assert.equal(missing.changed, false);
  assert.ok(missing.reason.startsWith('MISSING_PAYLOAD:'));
  const relation = core.applyEvent(contracts, before, {
    type: 'relation.updated',
    payload: { session_id: 'sess-1', relation: 'trust+1' },
  });
  assert.equal(relation.changed, false);
  assert.ok(relation.reason.startsWith('UNKNOWN_RELATION:'));
  // Auch Decay lief nicht: Rohwerte sind byte-identisch zum Anfang.
  assert.deepEqual(relation.state.scores, before.scores);
});

test('scoring: benannte Relation wird gesetzt', () => {
  const { state } = core.applyEvent(contracts, core.initialState(scoring), {
    type: 'relation.updated',
    payload: { session_id: 'sess-1', relation: 'anchor' },
  });
  assert.equal(state.relation, 'anchor');
  assert.equal(state.signals, 1);
});

// ── 6. Trigger ───────────────────────────────────────────────────────────────

test('scoring: ohne Anlass keine Injektion (Anfangszustand)', () => {
  const result = core.replay(contracts, core.initialState(scoring), []);
  assert.deepEqual(result.injection, { trigger: null, skill: null, text: '', reason: 'NO_TRIGGER' });
});

test('scoring: ein Skill außerhalb des Technik-Profils wird übersprungen', () => {
  const foreign = {
    ...triggers,
    triggers: [{ id: 'fremd', dimension: 'correctness', op: 'below', threshold: 0.9, skill: 'gibt-es-nicht', text: 'x' }],
  };
  const result = core.replay({ scoring, profile, triggers: foreign }, fixture.initial, fixture.stream);
  assert.equal(result.injection.trigger, null);
  assert.equal(result.injection.reason, 'NO_TRIGGER');
});

test('scoring: readScore liest, Unbekanntes ergibt null', () => {
  assert.equal(core.readScore({ dimensions: { a: 0.7 } }, 'a'), 0.7);
  assert.equal(core.readScore({ dimensions: { a: 0.7 } }, 'b'), null);
  assert.equal(core.readScore(null, 'a'), null);
});

// ── 7. Kern-Reinheit ─────────────────────────────────────────────────────────

test('scoring: der Kern hat keine Imports und keine Zufalls-/Zeit-/Netzquellen', () => {
  // Kommentarblind wie die Spine-/Persona-Scanner: die Regel darf genannt werden.
  const raw = readFileSync(join(DIR, '../assets/scoring-core.js'), 'utf8');
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/^\s*import[\s(]/m.test(source), 'der Kern darf keine Imports tragen (CI ohne node_modules)');
  for (const token of ['Math.random', 'Date.now', 'fetch(', 'require(']) {
    assert.ok(!source.includes(token), `verboten im reinen Kern: ${token}`);
  }
});
