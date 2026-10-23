#!/usr/bin/env node
/**
 * Tendenz- und Gewichtungstests des Scorings (Zug 3) — die Rechnung.
 *
 * Was hier belegt wird, ist der Kern ohne Browser, ohne DSH und ohne Netz:
 *
 *   - GEWICHTUNG: die Stärke eines Signals (`high`/`medium`/`low`) wird über
 *     `limits.strengths` in einen Faktor übersetzt und skaliert das Basis-Delta
 *     des Vertrags. Keine zweite Delta-Tabelle, kein Laufzeit-Parameter.
 *   - WIDERRUF: eine zurückgenommene Zeile fällt aus dem Protokoll, und die
 *     Tafel wird aus dem Rest NACHGERECHNET — exakt der Wert von vorher.
 *   - BETREFF: jede Zeile trägt ihren Betreff (Sitzung + Kennung), deshalb
 *     trifft späte Kritik dieselbe Aufgabe und ein zweites Urteil ERSETZT die
 *     erste Zeile; `judgementOf` ist die Leseseite davon.
 *   - TENDENZ: aus dem Protokoll abgeleitet, datengetrieben (Klassen, Stufen,
 *     Haltungen aus `tendency-rules.json`), deterministisch — und unter
 *     `minSignals` wird NICHTS behauptet.
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
const tendency = read('tendency-rules.json');
const contracts = { scoring, profile, triggers };

const collectorOf = () => core.createSignalCollector({ contracts, rules });
const envelope = (event_type, session_id = 'sess-1') => ({ event_type, session_id, timestamp: '2026-10-12T10:00:00.000Z' });
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
/** Eine Antwort, die die Sitzung gesehen hat — Voraussetzung fuer ein Urteil. */
const answer = (messageId, sessionId = 'sess-1') => ({
  envelope: envelope('message.completed', sessionId),
  payload: { session_id: sessionId, message: { id: messageId } },
});
const sawAnswer = (collector, messageId, sessionId = 'sess-1') => collector.observe(answer(messageId, sessionId).envelope, answer(messageId, sessionId).payload);

// ── 1. Gewichtung: eine Übersetzung, aus den Daten ───────────────────────────

test('scoring-tendenz: der Faktor kommt aus der Tabelle, nicht aus dem Code', () => {
  assert.equal(core.strengthFactor(rules, 'high'), 2);
  assert.equal(core.strengthFactor(rules, 'medium'), 1);
  assert.equal(core.strengthFactor(rules, 'low'), 0.5);
  // Unbekannte Stufe oder fehlende Tabelle: der Vertragswert 1, kein geratener Faktor.
  assert.equal(core.strengthFactor(rules, 'gigantisch'), 1);
  assert.equal(core.strengthFactor(undefined, 'high'), 1);
  assert.equal(core.strengthFactor({ limits: { strengths: { high: 0 } } }, 'high'), 1);
});

test('scoring-tendenz: die Stärke skaliert das Basis-Delta auf dem ganzen Weg', () => {
  const judged = (id, value) => {
    const collector = collectorOf();
    sawAnswer(collector, id);
    const event = rating(id, value);
    return collector.observe(event.envelope, event.payload);
  };
  // high (2×): Basis −0.09 → −0.18
  assert.equal(judged('a', 'negative').scorecard.scores.correctness, 0.32);
  // medium (1×): +0.06
  assert.equal(judged('a', 'positive').scorecard.scores.correctness, 0.56);
  // low (0.5×) traegt die abgeleitete Wiederholung — der regulaere Abschluss
  // ist seit SH-LEARN-01 gar keine Wertung mehr.
  assert.equal(core.strengthFactor(rules, rules.signals.rephrase.strength), 0.5);
  assert.equal(rules.signals.accept.observable, false);
  assert.equal(rules.signals.dismiss.observable, false);
});

// ── 2. Widerruf: exakt, mit Betreff ──────────────────────────────────────────

test('scoring-tendenz: der Widerruf rechnet exakt nach — der Wert ist der von vorher', () => {
  const collector = collectorOf();
  sawAnswer(collector, 'ans-1');
  sawAnswer(collector, 'ans-2');
  const before = collector.observe(rating('ans-1', 'positive').envelope, rating('ans-1', 'positive').payload);
  const middle = rating('ans-2', 'negative');
  collector.observe(middle.envelope, middle.payload);
  // Ein Turn-Ende ist eine Beobachtung und schreibt KEINE Zeile (SH-LEARN-01).
  const third = turnEnd('completed', 7);
  collector.observe(third.envelope, third.payload);
  assert.equal(collector.records().length, 2);

  const undo = retract('ans-2');
  const result = collector.observe(undo.envelope, undo.payload);
  assert.equal(result.removed, 1, 'genau eine Zeile faellt weg');
  assert.equal(collector.records().length, 1);
  // Die Nachrechnung aus dem Rest ist genau das, was der Replay aus dem Rest rechnet.
  const expected = core.replay(contracts, core.initialState(scoring), collector.records().map((record) => record.event));
  assert.deepEqual(result.scorecard, expected.scorecard);
  // Sie ist der Wert aus der EINEN Restzeile: das Lob von ans-1 gilt weiter,
  // das Urteil ueber ans-2 ist aus dem Protokoll verschwunden.
  assert.equal(result.scorecard.scores.correctness, before.scorecard.scores.correctness, 'die verbleibende Zeile traegt den Wert');
  assert.equal(result.scorecard.scores.correctness, 0.56);
  const again = retract('ans-2');
  assert.equal(collector.observe(again.envelope, again.payload).removed, 0, 'ein zweiter Widerruf trifft nichts mehr');
});

test('scoring-tendenz: späte Kritik trifft DIESELBE Aufgabe und ersetzt sie', () => {
  const collector = collectorOf();
  sawAnswer(collector, 'ans-1');
  sawAnswer(collector, 'ans-2');
  const early = rating('ans-1', 'positive');
  collector.observe(early.envelope, early.payload);
  collector.observe(rating('ans-2', 'positive').envelope, rating('ans-2', 'positive').payload);
  const late = rating('ans-1', 'negative');
  const result = collector.observe(late.envelope, late.payload);
  assert.equal(result.outcome.replaces, true);
  assert.equal(result.outcome.subject, 'ans-1');
  assert.equal(collector.records().length, 2, 'die zweite Zeile zur selben Antwort ersetzt die erste');
  assert.equal(collector.judgementOf('ans-1').signal, 'selffix');
  assert.equal(collector.judgementOf('ans-2').signal, 'copy');
  assert.equal(collector.judgementOf('ans-3'), null, 'ohne Zeile keine Zuordnung');
  assert.equal(collector.judgementOf(''), null);
  assert.equal(collector.judgementOf(undefined), null);
});

test('scoring-tendenz: der Betreff trägt die Sitzung mit — fremde Sitzung, fremde Zuordnung', () => {
  const collector = collectorOf();
  sawAnswer(collector, 'ans-1', 'sess-1');
  sawAnswer(collector, 'ans-1', 'sess-2');
  collector.observe(rating('ans-1', 'positive', 'sess-1').envelope, rating('ans-1', 'positive', 'sess-1').payload);
  collector.observe(rating('ans-1', 'negative', 'sess-2').envelope, rating('ans-1', 'negative', 'sess-2').payload);
  assert.equal(collector.records().length, 2, 'zwei Sitzungen sind zwei Urteile');
  const removed = retract('ans-1', 'sess-2');
  assert.equal(collector.observe(removed.envelope, removed.payload).removed, 1);
  assert.equal(collector.judgementOf('ans-1').signal, 'copy', 'die Zeile der anderen Sitzung bleibt');
});

// ── 3. Tendenz: datengetrieben, deterministisch, fail-closed ─────────────────

const record = (signal, session_id = 'sess-1', subject = null) => ({ session_id, subject, signal, kind: 'score', factor: 1, event: {}, detail: {} });

test('scoring-tendenz: die Tendenz folgt den Klassen, Stufen und Haltungen der Tabelle', () => {
  const ledger = [record('selffix'), record('selffix'), record('copy')];
  const derived = core.deriveTendency(tendency, ledger);
  assert.equal(derived.contract, 'shinon.tendency-rules/v1');
  assert.equal(derived.ready, true);
  assert.equal(derived.signals, 3);
  assert.deepEqual(derived.counts, { korrektur: 2, zustimmung: 1 });
  assert.deepEqual(derived.shares, { korrektur: 0.6667, zustimmung: 0.3333 });
  assert.deepEqual(derived.levels, { korrektur: 'hoch', zustimmung: 'mittel' });
  assert.equal(derived.stance, 'kritisch');
  assert.equal(derived.reason, null);
});

test('scoring-tendenz: unter minSignals wird NICHTS behauptet', () => {
  const thin = core.deriveTendency(tendency, [record('selffix'), record('selffix')]);
  assert.equal(thin.ready, false);
  assert.equal(thin.stance, null, 'ohne genug Evidenz keine Haltung');
  assert.equal(thin.reason, 'THIN_EVIDENCE:2/3');
  const empty = core.deriveTendency(tendency, []);
  assert.equal(empty.ready, false);
  assert.equal(empty.stance, null);
  assert.deepEqual(empty.counts, { korrektur: 0, zustimmung: 0 });
});

test('scoring-tendenz: was keine Klasse kennt, färbt die Tendenz nicht', () => {
  const ledger = [record('selffix'), record('selffix'), record('copy'), record('adopt'), record('nextq'), record('erfunden')];
  const derived = core.deriveTendency(tendency, ledger);
  // Zwei Zahlen: das Protokoll ist sechs Zeilen lang, die Evidenz sind drei.
  assert.equal(derived.signals, 6, 'die Summe des Protokolls bleibt ehrlich');
  assert.equal(derived.counted, 3, 'die Anteile rechnen nur über gelesene Signale');
  assert.equal(derived.unmatched, 3);
  assert.deepEqual(derived.shares, { korrektur: 0.6667, zustimmung: 0.3333 });
  assert.equal(derived.stance, 'kritisch');
  // Und ein Signal, das die Tabelle NICHT als beobachtbar führt, zählt nicht mit.
  assert.equal(rules.signals.adopt.observable, false);
  assert.equal(rules.signals.nextq.observable, false);
});

test('scoring-tendenz: dieselben Zeilen ergeben dieselbe Tendenz — und die Zeilen bleiben unberührt', () => {
  // Drei ausdrueckliche Urteile und eine Wiederholung: der Abschluss eines
  // Turns steht seit SH-LEARN-01 in keiner Klasse mehr.
  const ledger = [record('copy'), record('copy'), record('copy'), record('rephrase')];
  const before = JSON.stringify(ledger);
  const first = core.deriveTendency(tendency, ledger);
  const second = core.deriveTendency(tendency, ledger);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(ledger), before, 'die Ableitung liest nur');
  assert.equal(first.levels.zustimmung, 'hoch'); // 3 von 4
  assert.equal(first.stance, 'zustimmend');
});

test('scoring-tendenz: die Tendenz entsteht aus dem echten Protokoll des Sammlers', () => {
  const collector = collectorOf();
  for (const id of ['ans-1', 'ans-2', 'ans-3']) sawAnswer(collector, id);
  collector.observe(rating('ans-1', 'negative').envelope, rating('ans-1', 'negative').payload);
  // Ein Abbruch zaehlt NICHT als Korrektur — die Tendenz steht auf Urteilen.
  collector.observe(turnEnd('aborted', 4).envelope, turnEnd('aborted', 4).payload);
  collector.observe(rating('ans-2', 'negative').envelope, rating('ans-2', 'negative').payload);
  collector.observe(rating('ans-3', 'negative').envelope, rating('ans-3', 'negative').payload);
  const derived = core.deriveTendency(tendency, collector.records());
  assert.equal(derived.ready, true);
  assert.deepEqual(derived.counts, { korrektur: 3, zustimmung: 0 });
  assert.equal(derived.stance, 'kritisch');
  // Widerruf EINER dieser Zeilen: die Tendenz wird dünn und behauptet nichts mehr.
  const undo = retract('ans-1');
  collector.observe(undo.envelope, undo.payload);
  const after = core.deriveTendency(tendency, collector.records());
  assert.equal(after.ready, false);
  assert.equal(after.stance, null);
  assert.equal(after.reason, 'THIN_EVIDENCE:2/3');
});
