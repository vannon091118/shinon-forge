#!/usr/bin/env node
/**
 * Signaltests des Scorings (K5) — die Ohren.
 *
 * Was hier belegt wird, ist der ganze Weg ohne Browser, ohne DSH, ohne
 * Schlüssel und ohne Netz: ein internes Ereignis (so, wie der Spine es
 * liefert) hinein, ein Scorecard-Wert heraus. Dazu die Zusagen, die die
 * Schicht von einer Vermutung unterscheiden:
 *
 *   - Nur was in der Signaltabelle steht, erzeugt ein Signal (fail-closed).
 *   - Menschen-Text zählt nur mit der Marke `data.source.kind === 'user'`;
 *     Harness-Text mit demselben Ereignistyp zählt nicht.
 *   - Wiederholung wird am INHALT gemessen, nicht an der Uhr.
 *   - Ein Widerruf rechnet exakt: die Zeile fällt weg, die Tafel wird aus dem
 *     Rest nachgerechnet — der Wert ist danach wieder der von vorher.
 *   - Kein Deckel, kein Zähler-Limit, keine Sekundenregel — auch nicht als
 *     vergessene Zahl in der Tabelle.
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
const read = (name) => JSON.parse(readFileSync(join(DIR, '../assets/', name), 'utf8'));
const scoring = read('scoring-state.json');
const profile = read('technical-profile.json');
const triggers = read('skill-triggers.json');
const rules = read('signal-rules.json');
const contracts = { scoring, profile, triggers };

const collectorOf = () => core.createSignalCollector({ contracts, rules });

const envelope = (event_type, session_id = 'sess-1') => ({ event_type, session_id, timestamp: '2026-10-11T10:00:00.000Z' });

/** Ein menschliches Sitzungsereignis in der gemessenen Form (data.source.kind). */
const human = (text, { id = 'msg-1', kind = 'user', sessionId = 'sess-1' } = {}) => ({
  envelope: envelope('message.received', sessionId),
  payload: { session_id: sessionId, data: { id, source: { kind }, content: [{ type: 'text', text }] } },
});

const rating = (messageId, value, sessionId = 'sess-1') => ({
  envelope: envelope('feedback.rated', sessionId),
  payload: { session_id: sessionId, item: { messageId, rating: value } },
});

const retract = (messageId, sessionId = 'sess-1') => ({
  envelope: envelope('feedback.retracted', sessionId),
  payload: { session_id: sessionId, messageId },
});

const turnEnd = (kind, turn = 1, sessionId = 'sess-1') => ({
  envelope: envelope('turn.end', sessionId),
  payload: { session_id: sessionId, turn, reason: { kind } },
});

const note = (sessionId = 'sess-1') => ({
  envelope: envelope('feedback.noted', sessionId),
  payload: { session_id: sessionId, category: 'task-result', text: 'gute Arbeit' },
});

const QUESTION = 'Prüfe bitte die Scoring Schicht und die Signaltabelle im Paket';

// ── 1. Der ganze Weg: Signal rein, Wert raus ─────────────────────────────────

test('scoring-signale: eine wiederholte Frage wird zur Korrektur (Wert sinkt)', () => {
  const collector = collectorOf();
  const first = collector.observe(human(QUESTION).envelope, human(QUESTION).payload);
  assert.equal(first.outcome.reason, 'FIRST_QUESTION');
  assert.deepEqual(first.scorecard.scores, { correctness: 0.5, trust: 0.5 });

  const again = human('Prüfe bitte die Scoring Schicht und die Signaltabelle', { id: 'msg-2' });
  const second = collector.observe(again.envelope, again.payload);
  assert.equal(second.outcome.signal, 'rephrase');
  assert.equal(second.outcome.event.type, 'feedback.correction');
  // Genau das, was der Replay aus demselben Ereignis rechnet — nicht mehr und nicht weniger.
  const expected = core.replay(contracts, core.initialState(scoring), [
    { type: 'feedback.correction', payload: { session_id: 'sess-1', correction: 'wiederholung:frage' } },
  ]);
  assert.deepEqual(second.scorecard, expected.scorecard);
  assert.equal(second.scorecard.scores.correctness, 0.41);
});

test('scoring-signale: ein themenfremder Menschen-Text erzeugt kein Signal', () => {
  const collector = collectorOf();
  collector.observe(human(QUESTION).envelope, human(QUESTION).payload);
  const other = human('Baue eine Dashboard Anzeige für Vertrauen und Tendenzen', { id: 'msg-2' });
  const result = collector.observe(other.envelope, other.payload);
  assert.equal(result.outcome.reason, 'DIFFERENT_TOPIC');
  assert.equal(result.outcome.event, null);
  assert.deepEqual(result.scorecard.scores, { correctness: 0.5, trust: 0.5 });
});

test('scoring-signale: Harness-Text zählt nicht, auch wenn er wie eine Frage aussieht', () => {
  const collector = collectorOf();
  collector.observe(human(QUESTION).envelope, human(QUESTION).payload);
  // Gemessen: AGENTS.md-Kontext und Runtime-Kontext reisen als user/message mit
  // derselben Form — nur kind unterscheidet sie.
  for (const kind of ['agent-instructions', 'runtime-context', 'agent']) {
    const harness = human(QUESTION, { id: 'harness', kind });
    const result = collector.observe(harness.envelope, harness.payload);
    assert.equal(result.outcome.reason, 'NOT_HUMAN', `${kind} wurde als Mensch gelesen`);
    assert.deepEqual(result.scorecard.scores, { correctness: 0.5, trust: 0.5 });
  }
  // Und der Merkzettel hat sich NICHT gemerkt, was der Harness geschrieben hat.
  assert.equal(collector.session('sess-1').previousQuestion, QUESTION);
});

test('scoring-signale: Urteil, Akzeptanz und Abbruch wirken nach ihrer Stärke', () => {
  const collector = collectorOf();
  const positive = rating('ans-1', 'positive');
  const approved = collector.observe(positive.envelope, positive.payload);
  assert.equal(approved.outcome.signal, 'copy');
  assert.equal(approved.outcome.factor, 1);
  assert.equal(approved.scorecard.scores.correctness, 0.56);

  const negative = rating('ans-2', 'negative');
  const corrected = collector.observe(negative.envelope, negative.payload);
  assert.equal(corrected.outcome.signal, 'selffix');
  assert.equal(corrected.outcome.factor, 2, 'ein negatives Urteil wiegt doppelt');

  const accepted = collector.observe(turnEnd('completed', 7).envelope, turnEnd('completed', 7).payload);
  assert.equal(accepted.outcome.signal, 'accept');
  assert.equal(accepted.outcome.factor, 0.5, 'der reguläre Abschluss ist die schwächste Zustimmung');

  const aborted = collector.observe(turnEnd('aborted', 8).envelope, turnEnd('aborted', 8).payload);
  assert.equal(aborted.outcome.signal, 'dismiss');
});

// ── 2. Widerruf rechnet exakt ────────────────────────────────────────────────

test('scoring-signale: der Widerruf nimmt genau die Wertung zurück', () => {
  const collector = collectorOf();
  const before = collector.scorecard();

  const positive = rating('ans-1', 'positive');
  collector.observe(positive.envelope, positive.payload);
  assert.equal(collector.scorecard().scores.correctness, 0.56);

  const gone = collector.observe(retract('ans-1').envelope, retract('ans-1').payload);
  assert.equal(gone.outcome.kind, 'retract');
  assert.equal(gone.removed, 1);
  assert.deepEqual(gone.scorecard, before, 'nach dem Widerruf ist die Tafel wieder die von vorher');
  assert.equal(gone.scorecard.scores.correctness, 0.5);
});

test('scoring-signale: ein zweites Urteil ersetzt das erste (DSH: create or replace)', () => {
  const collector = collectorOf();
  collector.observe(...Object.values(rating('ans-1', 'negative')));
  assert.equal(collector.stats().records, 1);
  collector.observe(...Object.values(rating('ans-1', 'positive')));
  assert.equal(collector.stats().records, 1, 'dieselbe messageId trägt genau eine Zeile');
  assert.equal(collector.records()[0].signal, 'copy');
  // Ein Widerruf räumt beide Zustände des Urteils ab.
  collector.observe(...Object.values(retract('ans-1')));
  assert.equal(collector.stats().records, 0);
  assert.deepEqual(collector.scorecard().scores, { correctness: 0.5, trust: 0.5 });
});

// ── 3. Fail-closed: was nichts ändert, ändert nichts ─────────────────────────

test('scoring-signale: unbekannte Ereignisse und unvollständige Urteile ändern nichts', () => {
  const collector = collectorOf();
  const before = collector.scorecard();

  const unknown = collector.observe(envelope('mood.changed'), { session_id: 'sess-1' });
  assert.ok(unknown.outcome.reason.startsWith('UNKNOWN_SOURCE'));
  assert.deepEqual(unknown.scorecard, before);

  const withoutSession = collector.observe({ event_type: 'feedback.rated' }, { item: { messageId: 'a', rating: 'positive' } });
  assert.equal(withoutSession.outcome.reason, 'NO_SESSION');
  assert.deepEqual(withoutSession.scorecard, before);

  const weirdRating = collector.observe(...Object.values(rating('a', 'vielleicht')));
  assert.ok(weirdRating.outcome.reason.startsWith('UNKNOWN_RATING'));
  assert.deepEqual(weirdRating.scorecard, before);

  const weirdTurn = collector.observe(...Object.values(turnEnd('error', 3)));
  assert.ok(weirdTurn.outcome.reason.startsWith('UNHANDLED_REASON'));
  assert.deepEqual(weirdTurn.scorecard, before);

  const emptyRetract = collector.observe(envelope('feedback.retracted'), { session_id: 'sess-1' });
  assert.ok(emptyRetract.outcome.reason.startsWith('MISSING_SUBJECT'));
  assert.deepEqual(emptyRetract.scorecard, before);

  assert.equal(collector.stats().scored, 0);
});

test('scoring-signale: eine Sitzungsbemerkung wird gezählt, aber nie gewertet', () => {
  const collector = collectorOf();
  const before = collector.scorecard();
  const result = collector.observe(note().envelope, note().payload);
  assert.equal(result.outcome.kind, 'note');
  assert.equal(result.outcome.reason, 'OBSERVED_ONLY');
  assert.deepEqual(result.scorecard, before);
  assert.equal(collector.stats().noted, 1);
  assert.equal(collector.stats().records, 0);
});

test('scoring-signale: Signale ohne interne Quelle lassen sich nicht erzeugen', () => {
  const collector = collectorOf();
  // Die Tabelle führt die drei Zeilen ausdrücklich als nicht beobachtbar.
  for (const id of ['adopt', 'nextq']) {
    assert.equal(rules.signals[id].observable, false, `${id} müsste nicht beobachtbar sein`);
    assert.ok(rules.signals[id].reason.length > 0, `${id} braucht einen Grund`);
  }
  // Auch ein handgebautes Ereignis auf ein erfundenes Signal bleibt folgenlos.
  const result = collector.observe(envelope('shinon/feedback/copy'), { session_id: 'sess-1', approval: 'x' });
  assert.ok(result.outcome.reason.startsWith('UNKNOWN_SOURCE'));
  assert.ok(!collector.records().some((record) => ['adopt', 'nextq'].includes(record.signal)));
});

// ── 4. Zustand je Sitzung wird aufgeräumt ────────────────────────────────────

test('scoring-signale: der Merkzettel je Sitzung ist begrenzt und wird aufgeräumt', () => {
  const collector = collectorOf();
  collector.observe(...Object.values(human(QUESTION, { sessionId: 'sess-a' })));
  collector.observe(...Object.values(human(QUESTION, { sessionId: 'sess-b' })));
  assert.deepEqual(collector.sessions().sort(), ['sess-a', 'sess-b']);
  assert.equal(collector.session('sess-a').previousQuestion, QUESTION);

  // Ein neues Sitzungsereignis setzt genau diese Sitzung zurück.
  collector.observe({ event_type: 'session.created', session_id: 'sess-a' }, { session_id: 'sess-a' });
  assert.equal(collector.session('sess-a').previousQuestion, '');
  assert.equal(collector.session('sess-b').previousQuestion, QUESTION);

  // Der Host kann aufräumen; die Evidenz (das Protokoll) bleibt davon unberührt.
  const records = collector.stats().records;
  assert.equal(collector.forgetSession('sess-b'), true);
  assert.equal(collector.session('sess-b'), null);
  assert.equal(collector.stats().records, records, 'Aufräumen des Merkzettels löscht keine Evidenz');

  collector.dispose();
  assert.deepEqual(collector.sessions(), []);
  assert.equal(collector.stats().records, 0);
});

// ── 5. Die Tabelle ist deckelfrei und der Kern bleibt rein ───────────────────

test('scoring-signale: die Tabelle trägt keinen Deckel, kein Limit und keine Sekundenregel', () => {
  const keys = [];
  const walk = (value) => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      keys.push(key);
      walk(entry);
    }
  };
  walk(rules);
  for (const forbidden of ['trustCeiling', 'rateLimit', 'maxPublishedSignalsPerSession', 'maxSignalsPerSession', 'windowSeconds', 'maxAgeSeconds']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} gehört nicht in die Signaltabelle`);
  }
  // Und was ein Faktor ist, ist eine Zahl — keine Grenze.
  assert.deepEqual(Object.keys(rules.limits.strengths).sort(), ['high', 'low', 'medium']);
});

test('scoring-signale: der Kern bleibt importfrei und zeit-/zufallsfrei', () => {
  const raw = readFileSync(join(DIR, '../assets/scoring-core.js'), 'utf8');
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/^\s*import[\s(]/m.test(source), 'der Kern darf keine Imports tragen (CI ohne node_modules)');
  for (const token of ['Math.random', 'Date.now', 'fetch(', 'require(']) {
    assert.ok(!source.includes(token), `verboten im reinen Kern: ${token}`);
  }
});

test('scoring-signale: Ueberlappung misst Inhalt (nicht Laenge) und ist deterministisch', () => {
  const a = core.overlapOf(QUESTION, 'Prüfe bitte die Scoring Schicht und die Signaltabelle', 3);
  assert.ok(a.shared >= 3 && a.ratio >= 0.6);
  assert.deepEqual(core.overlapOf('a b', 'c d'), { shared: 0, ratio: 0 });
  const repeat = core.overlapOf(QUESTION, 'Prüfe bitte die Scoring Schicht und die Signaltabelle', 3);
  assert.deepEqual(a, repeat);
  // Wörter unter der Mindestlänge zählen nicht; Füllwörter zählen mit — das ist
  // die benannte Grenze der einfachen Überlappung (Verfeinerung: Index, eigener Zug).
  assert.deepEqual(core.normalizeTokens('und in zu der', 3), ['und', 'der']);
});
