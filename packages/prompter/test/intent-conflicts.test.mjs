/**
 * @shinon/prompter — intent-conflicts.test.mjs
 *
 * Die Konfliktmatrix gegen die ECHTE Regeldatei und die Auflösungsregel gegen
 * synthetische Regeln, deren Reihenfolge absichtlich gegen die Priorität steht.
 * Kein DSH, kein Modell, kein Netz.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONFLICT_KINDS,
  INTENT_CONFLICTS_CONTRACT,
  compareTriggers,
  conflictMatrix,
  resolutionOf,
} from '../assets/intent-conflicts.js';
import { INTENT_PRIORITY, resolveIntent } from '../assets/intent-resolver.js';

const RULES = JSON.parse(readFileSync(new URL('../assets/intent-rules.json', import.meta.url), 'utf8'));
const MATRIX = conflictMatrix(RULES);

const pattern = (id, classification, trigger, expansion = '') => ({ id, label: id, classification, trigger, expansion });

test('die Matrix nennt Vertrag, Bestand und die vier Arten', () => {
  assert.equal(MATRIX.contract, INTENT_CONFLICTS_CONTRACT);
  assert.equal(MATRIX.patterns, 92, 'die Pattern-Zahl ist gewachsen — Matrix neu lesen, nicht Zahl anpassen');
  assert.equal(MATRIX.triggers, 402);
  assert.deepEqual(Object.keys(MATRIX.counts), [...CONFLICT_KINDS]);
  assert.deepEqual(MATRIX.unknownClasses, []);
});

test('die echte Datei hat genau eine exakte Doppelung, und sie ist benannt', () => {
  const exact = MATRIX.conflicts.filter((conflict) => conflict.kind === 'EXAKT');
  assert.equal(exact.length, 1, `exakte Doppelungen: ${exact.length}`);
  assert.equal(exact[0].a.trigger, 'wie funktioniert');
  assert.deepEqual([exact[0].a.id, exact[0].b.id].sort(), ['how-works', 'read-code']);
  // Beide sind TRANSFORM: die Klasse kann den Gleichstand nicht lösen. Das ist
  // der harmlose Fall — der Resolver entscheidet ihn über Erfahrung und ID, und
  // der Test hält fest, dass es NICHT zwei verschiedene Klassen sind.
  assert.equal(exact[0].sameClass, true, 'die beiden Patterns gehören derselben Klasse');
  assert.equal(resolutionOf(exact[0]).rule, 'KLASSE');
  assert.equal(resolutionOf(exact[0]).winner, null);
});

test('Präfix und Teilwort werden getrennt, nicht als „Overlap" gesammelt', () => {
  const kinds = new Set(MATRIX.conflicts.map((conflict) => conflict.kind));
  assert.ok(kinds.has('PRAEFIX'), 'keine Präfix-Überlappung gefunden');
  assert.ok(kinds.has('TEILWORT'), 'keine Teilwort-Überlappung gefunden');
});

test('die Matrix ist deterministisch und reihenfolge-unabhängig', () => {
  const again = conflictMatrix(RULES);
  assert.deepEqual(again.counts, MATRIX.counts);
  const reversed = conflictMatrix({ patterns: [...RULES.patterns].reverse() });
  assert.deepEqual(reversed.counts, MATRIX.counts, 'die Reihenfolge der Regeln darf die Befunde nicht ändern');
});

test('eine synthetische Datei zeigt alle vier Arten', () => {
  const rules = {
    patterns: [
      pattern('kurz', 'TRANSFORM', ['prüfe']),
      pattern('lang', 'LOOKUP', ['prüfe die tests']),
      pattern('doppelt-a', 'TRANSFORM', ['gleich'], 'denselben Zusatz'),
      pattern('doppelt-b', 'LOOKUP', ['gleich'], 'denselben Zusatz'),
      pattern('teil-a', 'CHAT', ['abc']),
      pattern('teil-b', 'CHAT', ['xabcx']),
    ],
  };
  const matrix = conflictMatrix(rules);
  assert.equal(matrix.counts.PRAEFIX, 1, JSON.stringify(matrix.conflicts));
  assert.equal(matrix.counts.EXAKT, 1);
  assert.equal(matrix.counts.TEILWORT, 1);
  assert.equal(matrix.counts.EXPANSION, 1);

  const praefix = matrix.conflicts.find((conflict) => conflict.kind === 'PRAEFIX');
  assert.deepEqual([praefix.a.trigger, praefix.b.trigger].sort(), ['prüfe', 'prüfe die tests']);
  assert.equal(resolutionOf(praefix).rule, 'PHRASE_LAENGE');
  assert.equal(resolutionOf(praefix).winner, 'lang');

  const expansion = matrix.conflicts.find((conflict) => conflict.kind === 'EXPANSION');
  assert.equal(expansion.sameExpansion, true);
  assert.equal(expansion.expansion, 'denselben Zusatz');
  assert.deepEqual(resolutionOf(expansion), { rule: 'KEINE', winner: null });
});

test('die Rangfolge: Länge, dann Klasse, dann ID — total und stabil', () => {
  const short = { trigger: 'baue', id: 'a', classification: 'MULTI_STEP_TASK' };
  const long = { trigger: 'baue eine seite', id: 'b', classification: 'CHAT' };
  assert.equal(compareTriggers(long, short), -1, 'die längere Phrase gewinnt, auch gegen die höhere Klasse');
  assert.equal(compareTriggers(short, long), 1);

  const sameLengthHigh = { trigger: 'baue', id: 'z', classification: 'MULTI_STEP_TASK' };
  const sameLengthLow = { trigger: 'mach', id: 'a', classification: 'CHAT' };
  assert.equal(compareTriggers(sameLengthHigh, sameLengthLow), -1, 'bei gleicher Länge entscheidet die Klasse');

  const tie = { trigger: 'baue', id: 'b', classification: 'CHAT' };
  const tieOther = { trigger: 'mach', id: 'a', classification: 'CHAT' };
  assert.equal(compareTriggers(tie, tieOther), 1, 'gleiche Klasse: die ID ist die letzte Ordnung');
  assert.equal(compareTriggers(tie, tie), 0);
});

test('der Resolver nimmt die LÄNGSTE Phrase, nicht die höchste Klasse', () => {
  const rules = {
    patterns: [
      pattern('kurz', 'MULTI_STEP_TASK', ['prüfe']),
      pattern('lang', 'LOOKUP', ['prüfe die tests']),
    ],
  };
  const resolution = resolveIntent('prüfe die tests', rules, { heuristics: false });
  assert.equal(resolution.classification, 'LOOKUP', 'die längere Phrase gewinnt gegen die höhere Klasse');
  assert.equal(resolution.patternId, 'lang');
  assert.ok(INTENT_PRIORITY.MULTI_STEP_TASK > INTENT_PRIORITY.LOOKUP, 'die Priorität ist weiterhin die zweite Stufe');
});

test('bei gleicher Phrasenlänge entscheidet die Klasse', () => {
  const rules = {
    patterns: [
      pattern('chat', 'CHAT', ['hallo welt']),
      pattern('ziel', 'LONG_RUNNING_GOAL', ['hallo welt']),
    ],
  };
  const resolution = resolveIntent('hallo welt', rules, { heuristics: false });
  assert.equal(resolution.patternId, 'ziel');
  assert.equal(resolution.classification, 'LONG_RUNNING_GOAL');
});

test('die Reihenfolge der Regeln entscheidet nichts', () => {
  const rules = {
    patterns: [
      pattern('a', 'CHAT', ['gleiche phrase']),
      pattern('b', 'TRANSFORM', ['gleiche phrase']),
    ],
  };
  const forward = resolveIntent('gleiche phrase', rules, { heuristics: false });
  const backward = resolveIntent('gleiche phrase', { patterns: [...rules.patterns].reverse() }, { heuristics: false });
  assert.equal(forward.patternId, backward.patternId);
  assert.equal(forward.classification, backward.classification);
});

test('eine Frage trägt nie eine Expansion — auch nicht die längste Phrase', () => {
  const resolution = resolveIntent('wie funktioniert der project index?', RULES);
  assert.equal(resolution.classification, 'LOOKUP');
  assert.equal(resolution.question, true);
  assert.equal(resolution.expansion, '', 'die Frage darf ihren eigenen Auftrag nicht erfinden');
});
