#!/usr/bin/env node
/**
 * Signaltests des Scorings (K5) — die Ohren.
 *
 * Was hier belegt wird, ist der ganze Weg ohne Browser, ohne DSH, ohne
 * Schlüssel und ohne Netz: ein internes Ereignis (so, wie der Spine es
 * liefert) hinein, ein Scorecard-Wert heraus. Dazu die Zusagen, die die
 * Schicht von einer Vermutung unterscheiden:
 *
 * → Kanon: docs/COMMENT-KANON.md#k-897a5dd7deb9
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

  // Ein neues Sitzungsereignis SCHLIESSEN diese Sitzung ab: der Merkzettel geht
  // (und es entsteht keine leere Hülle — sonst sammelte sich über die Laufzeit
  // eine Zeile je Sitzung an), die andere Sitzung bleibt unberührt.
  collector.observe({ event_type: 'session.created', session_id: 'sess-a' }, { session_id: 'sess-a' });
  assert.equal(collector.session('sess-a'), null, 'eine abgeschlossene Sitzung hinterlässt keinen Merkzettel');
  assert.equal(collector.session('sess-b').previousQuestion, QUESTION);
  // Und dieselbe Frage gilt danach wieder als erste Frage, nicht als Wiederholung.
  const reopened = collector.observe(...Object.values(human(QUESTION, { id: 'msg-neu', sessionId: 'sess-a' })));
  assert.equal(reopened.outcome.reason, 'FIRST_QUESTION');

  // Der Host kann aufräumen; die Evidenz (das Protokoll) bleibt davon unberührt.
  const records = collector.stats().records;
  assert.equal(collector.forgetSession('sess-b'), true);
  assert.equal(collector.session('sess-b'), null);
  assert.equal(collector.stats().records, records, 'Aufräumen des Merkzettels löscht keine Evidenz');

  collector.dispose();
  assert.deepEqual(collector.sessions(), []);
  assert.equal(collector.stats().records, 0);
});

// ── 4b. Die Ablage: der Kern MELDET, der Host schreibt ───────────────────────

/** Ein Sammler mit einem Sink, der die Meldungen mitschreibt (der Host in klein). */
const collectorWithSink = () => {
  const seen = [];
  const collector = core.createSignalCollector({ contracts, rules, onPersist: (snapshot) => seen.push(snapshot) });
  return { collector, seen };
};

test('scoring-ablage: der Kern meldet seinen Stand, statt ihn zu schreiben', () => {
  const { collector, seen } = collectorWithSink();
  assert.equal(seen.length, 0, 'ohne Ereignis kein Schreibvorgang');

  collector.observe(...Object.values(rating('ans-1', 'positive')));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].why, 'score', 'der Grund steht mit dabei');
  assert.equal(seen[0].records.length, 1);
  assert.equal(seen[0].records[0].subject, 'ans-1', 'die Zuordnung geht mit in die Ablage');
  assert.deepEqual(seen[0].scorecard, collector.scorecard(), 'gemeldet wird die Tafel, die gilt');

  // Eine Bemerkung ändert die Tafel nicht, aber den Stand — also wird sie gemeldet.
  collector.observe(...Object.values(note()));
  assert.equal(seen.at(-1).why, 'note');
  assert.equal(seen.at(-1).notes, 1);

  // Ein unbekanntes Ereignis ändert nichts — und wird deshalb nicht gemeldet.
  const before = seen.length;
  collector.observe(envelope('mood.changed'), { session_id: 'sess-1' });
  assert.equal(seen.length, before, 'kein Schreibvorgang ohne Änderung');

  // Der Widerruf meldet den Stand OHNE die Zeile — die Ablage trägt die Wahrheit.
  collector.observe(...Object.values(retract('ans-1')));
  assert.equal(seen.at(-1).why, 'retract');
  assert.equal(seen.at(-1).records.length, 0);
});

test('scoring-ablage: der geladene Stand trägt den ganzen Weg (Neustart im Kern)', () => {
  const source = collectorOf();
  source.observe(...Object.values(rating('ans-1', 'positive')));
  source.observe(...Object.values(human(QUESTION)));
  const snapshot = source.state();
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.memos.length, 1);

  // Ein frischer Sammler, derselbe Stand: gleiche Tafel, gleiches Protokoll,
  // gleicher Merkzettel — und der Widerruf wirkt danach genauso exakt.
  const fresh = collectorOf();
  assert.deepEqual(fresh.hydrate(snapshot), { records: 1, memos: 1, rejected: 0 });
  assert.deepEqual(fresh.scorecard(), source.scorecard());
  assert.equal(fresh.state().records[0].subject, 'ans-1');
  assert.equal(fresh.session('sess-1').previousQuestion, QUESTION);
  fresh.observe(...Object.values(retract('ans-1')));
  assert.deepEqual(fresh.scorecard().scores, { correctness: 0.5, trust: 0.5 });
});

test('scoring-ablage: ein fremder Stand wird gezählt und fallengelassen (fail-closed)', () => {
  const source = collectorOf();
  source.observe(...Object.values(rating('ans-1', 'positive')));
  source.observe(...Object.values(human(QUESTION)));
  const good = source.state();
  assert.equal(good.memos.length, 1, 'ein Merkzettel mit Frage ist ein Stand');

  const fresh = collectorOf();
  const adopted = fresh.hydrate({
    ...good,
    records: [good.records[0], { nur: 'unsinn' }, null],
    memos: [...good.memos, { ohne: 'id' }],
  });
  // Drei Fremdkörper: zwei ohne Ereignisform (darunter ein null) und einer ohne Sitzung.
  assert.deepEqual(adopted, { records: 1, memos: 1, rejected: 3 }, 'was keine Zeile ist, wird gezählt');
  assert.equal(fresh.stats().dropped, 3, 'und ist nicht still verschwunden');
  assert.equal(fresh.scorecard().scores.correctness, 0.56, 'die eine echte Zeile wird gerechnet');
  // Ein ganz fremder Stand ergibt einen leeren, aber laufenden Sammler.
  const stranger = collectorOf();
  assert.deepEqual(stranger.hydrate({ records: 'kein Feld', memos: 7 }), { records: 0, memos: 0, rejected: 0 });
  assert.deepEqual(stranger.scorecard().scores, { correctness: 0.5, trust: 0.5 });
});

test('scoring-ablage: das Ende des Hosts schließt die Sitzungen und wird gemeldet', () => {
  const { collector, seen } = collectorWithSink();
  collector.observe(...Object.values(human(QUESTION)));
  assert.equal(seen.at(-1).why, 'memo', 'der Merkzettel geht in die Ablage');
  const before = seen.length;

  assert.equal(collector.closeAllSessions(), 1);
  assert.equal(seen.length, before + 1, 'das Ende des Hosts wird gemeldet');
  assert.equal(seen.at(-1).why, 'session-end');
  assert.equal(seen.at(-1).memos.length, 0, 'kein Merkzettel überlebt das Ende');
  assert.equal(seen.at(-1).records.length, 0, 'und es wird nichts erfunden');

  // Nichts offen, nichts zu melden: ein leeres Aufräumen ist keine Änderung.
  assert.equal(collector.closeAllSessions(), 0);
  assert.equal(seen.length, before + 1);
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
