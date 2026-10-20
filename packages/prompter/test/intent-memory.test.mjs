import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BIAS_MAX,
  BIAS_MIN,
  MAX_TERMS,
  MEMORY_CONTRACT,
  MIN_OBSERVATIONS,
  MIN_TERM_OBSERVATIONS,
  addTurnDuration,
  decay,
  emptyMemory,
  feedback,
  feedbackOf,
  memorySummary,
  observe,
  semanticProfile,
  semanticSupport,
  tokensOf,
  validateMemory,
  weightsFrom,
} from '../assets/intent-memory.js';

/**
 * Das Intent-Gedächtnis: Zählung über alle Läufe und der Gewichtsfaktor daraus.
 * Reiner Kern — kein I/O, keine Uhr (die Zeit kommt als Argument), kein Modell.
 * Die Tests prüfen Rechnung und Grenzen, nicht die Datei.
 */

const NOW = '2026-10-18T12:00:00.000Z';

/** Eine Beobachtung in der Form, die der Host schreibt. */
const seen = (patternId, classification, extra = {}) => ({
  patternId,
  classification,
  score: 1,
  features: [],
  ...extra,
});

test('Gedächtnis: leerer Stand trägt den Vertrag und null Zählungen', () => {
  const memory = emptyMemory(NOW);
  assert.equal(memory.contract, MEMORY_CONTRACT);
  assert.equal(memory.runs, 0);
  assert.equal(memory.lastSeen, NOW);
  assert.deepEqual(memory.patterns, {});
  assert.deepEqual(memory.classes, {});
});

test('Gedächtnis: ein fremder Vertrag macht die Ablage unbrauchbar (fail-closed)', () => {
  const checked = validateMemory({ contract: 'shinon.andere/v1', runs: 99 });
  assert.equal(checked.foreign, true);
  assert.equal(checked.memory.contract, MEMORY_CONTRACT);
  assert.equal(checked.memory.runs, 0, 'kein fremder Stand wird übernommen');
});

test('Gedächtnis: unlesbare Einträge fallen einzeln weg und werden gezählt', () => {
  const checked = validateMemory({
    contract: MEMORY_CONTRACT,
    runs: 4,
    patterns: {
      gut: { seen: 3, up: 1, down: 0, scoreSum: 4, durationMs: 900, last: NOW },
      kaputt: { seen: 0 },
      auch_kaputt: 'kein objekt',
    },
    classes: { TRANSFORM: 2, CHAT: 0 },
    features: { pfad: 3 },
  });
  assert.equal(checked.foreign, false);
  assert.equal(checked.dropped, 2);
  assert.deepEqual(Object.keys(checked.memory.patterns), ['gut']);
  assert.deepEqual(checked.memory.classes, { TRANSFORM: 2 }, 'Null-Zählungen bleiben nicht stehen');
  assert.deepEqual(checked.memory.features, { pfad: 3 });
});

test('Gedächtnis: jeder Turn wird verbucht — auch der ohne Treffer', () => {
  let memory = emptyMemory(NOW);
  memory = observe(memory, seen('tests', 'MULTI_STEP_TASK', { features: ['imperativ', 'pfad'] }), NOW);
  memory = observe(memory, seen(null, 'UNDEFINED', { score: 0 }), NOW);

  assert.equal(memory.runs, 2);
  assert.equal(memory.patterns.tests.seen, 1);
  assert.equal(memory.patterns.tests.scoreSum, 1);
  assert.equal(memory.unmatched, 1, 'der Turn ohne Pattern ist Information');
  assert.equal(memory.classes.MULTI_STEP_TASK, 1);
  assert.equal(memory.classes.UNDEFINED, 1);
  assert.equal(memory.features.imperativ, 1);
  assert.equal(memory.features.pfad, 1);
});

test('Gedächtnis: observe ist rein — die Eingabe bleibt unverändert', () => {
  const before = emptyMemory(NOW);
  const snapshot = JSON.stringify(before);
  const after = observe(before, seen('refactor', 'TRANSFORM'), NOW);
  assert.equal(JSON.stringify(before), snapshot);
  assert.notEqual(after, before);
  // Zweimal dieselbe Beobachtung auf demselben Stand ergibt denselben Stand.
  assert.deepEqual(
    observe(before, seen('refactor', 'TRANSFORM'), NOW),
    observe(before, seen('refactor', 'TRANSFORM'), NOW),
  );
});

test('Gedächtnis: Rückmeldung wird aus dem Text gelesen — und nur eindeutig', () => {
  assert.equal(feedbackOf('passt, genau so'), 'up');
  assert.equal(feedbackOf('nein, das ist falsch'), 'down');
  assert.equal(feedbackOf('weiter so'), 'up');
  assert.equal(feedbackOf('mach das anders'), null, '„anders“ allein ist keine Rückmeldung');
  assert.equal(feedbackOf('nochmal bitte'), 'down', '„nochmal“ heißt: es hat nicht getragen');
  assert.equal(feedbackOf('Bau ein neues Feature'), null);
  assert.equal(feedbackOf(''), null);
  assert.equal(feedbackOf(null), null);
});

test('Gedächtnis: up/down zählen je Pattern und global', () => {
  let memory = observe(emptyMemory(NOW), seen('tests', 'MULTI_STEP_TASK'), NOW);
  memory = feedback(memory, 'tests', 'up', NOW);
  memory = feedback(memory, 'tests', 'down', NOW);
  assert.equal(memory.patterns.tests.up, 1);
  assert.equal(memory.patterns.tests.down, 1);
  assert.deepEqual(memory.feedback, { up: 1, down: 1 });
  // Unbekanntes Pattern: keine erfundene Zeile.
  assert.deepEqual(feedback(memory, 'gibt-es-nicht', 'up'), memory);
  assert.deepEqual(feedback(memory, 'tests', 'vielleicht'), memory);
});

test('Gedächtnis: Altern senkt die Zählung, löscht aber nie ein Pattern', () => {
  let memory = observe(emptyMemory(NOW), seen('tests', 'MULTI_STEP_TASK'), NOW);
  for (let index = 0; index < 5; index += 1) memory = observe(memory, seen('tests', 'MULTI_STEP_TASK'), NOW);
  const decayed = decay(memory, 0.5);
  assert.equal(decayed.patterns.tests.seen, 3, '6 Beobachtungen × 0.5, gerundet');
  assert.equal(decayed.runs, memory.runs, 'die Gesamtzahl der Läufe bleibt');
  const hard = decay(memory, 0.01);
  assert.equal(hard.patterns.tests.seen, 1, 'ein Pattern verschwindet nicht aus der Gesamtlaufzeit');
});

test('Gedächtnis: Gewichte brauchen Beobachtungen — sonst neutral', () => {
  const memory = observe(emptyMemory(NOW), seen('tests', 'MULTI_STEP_TASK'), NOW);
  assert.deepEqual(weightsFrom(memory), {}, `unter ${MIN_OBSERVATIONS} Beobachtungen wird nichts behauptet`);
});

test('Gedächtnis: viel Zustimmung hebt, viel Korrektur senkt — begrenzt', () => {
  let up = emptyMemory(NOW);
  let down = emptyMemory(NOW);
  for (let index = 0; index < 10; index += 1) {
    up = observe(up, seen('tests', 'MULTI_STEP_TASK'), NOW);
    up = feedback(up, 'tests', 'up', NOW);
    down = observe(down, seen('tests', 'MULTI_STEP_TASK'), NOW);
    down = feedback(down, 'tests', 'down', NOW);
  }
  const upBias = weightsFrom(up).tests;
  const downBias = weightsFrom(down).tests;
  assert.ok(upBias > 1, `Zustimmung hebt (${upBias})`);
  assert.ok(downBias < 1, `Korrektur senkt (${downBias})`);
  assert.ok(upBias <= BIAS_MAX && downBias >= BIAS_MIN, 'der Faktor bleibt im Band');
  // Ohne jede Rückmeldung bleibt es exakt neutral.
  let neutral = emptyMemory(NOW);
  for (let index = 0; index < 10; index += 1) neutral = observe(neutral, seen('tests', 'MULTI_STEP_TASK'), NOW);
  assert.deepEqual(weightsFrom(neutral), {});
});

test('Gedächtnis: die Laufzeit wird nachgetragen und gemittelt', () => {
  let memory = observe(emptyMemory(NOW), seen('tests', 'MULTI_STEP_TASK'), NOW);
  memory = observe(memory, seen('tests', 'MULTI_STEP_TASK'), NOW);
  memory = addTurnDuration(memory, 'tests', 400);
  memory = addTurnDuration(memory, 'tests', 600);
  assert.equal(memory.patterns.tests.durationMs, 1000);
  const summary = memorySummary(memory);
  assert.equal(summary.avgTurnMs, 500, '1000 ms auf zwei Treffer');
  assert.equal(summary.runs, 2);
  assert.equal(summary.patterns, 1);
  // Unbekanntes Pattern oder kaputte Dauer: keine Änderung.
  assert.deepEqual(addTurnDuration(memory, 'gibt-es-nicht', 100), memory);
  assert.deepEqual(addTurnDuration(memory, 'tests', -5), memory);
});

test('Gedächtnis: die Zusammenfassung trägt nur Zahlen, keinen Text', () => {
  const memory = observe(emptyMemory(NOW), seen('bugfix', 'MULTI_STEP_TASK', { features: ['pfad'] }), NOW);
  const summary = memorySummary(memory);
  assert.deepEqual(Object.keys(summary).sort(), ['avgTurnMs', 'classifiedTerms', 'feedback', 'matched', 'patterns', 'runs', 'terms', 'unclaimed', 'unmatched']);
  assert.equal(JSON.stringify(summary).includes('bugfix'), false, 'keine Pattern-Namen in der Kurzfassung');
});

test('Gedächtnis: ein kaputter Stand wird nicht zur Autorität', () => {
  assert.equal(memorySummary(null), null);
  assert.deepEqual(weightsFrom(null), {});
  assert.deepEqual(weightsFrom({ patterns: 'nein' }), {});
  const broken = validateMemory({ contract: MEMORY_CONTRACT, patterns: null, runs: 'zwei' });
  assert.equal(broken.memory.runs, 0);
  assert.deepEqual(broken.memory.patterns, {});
});

// ── Das Lexikon: gelernte Semantik über die Gesamtlaufzeit ──────────────────
//
// Der zweite Lernweg neben der Rückmeldung: jeder Treffer benennt eine Klasse,
// also darf er seine Begriffe dieser Klasse zuschlagen. Das Ergebnis ist ein
// Begriffsprofil — Begriff → Klasse —, das den nächsten Lauf beeinflusst.

test('Lexikon: Begriffe eines Treffers werden der Klasse zugeschlagen', () => {
  let memory = emptyMemory(NOW);
  memory = observe(memory, seen('tests', 'MULTI_STEP_TASK', { text: 'Schreib Tests fuer das Scoring Modul' }), NOW);
  assert.deepEqual(memory.terms.tests, { MULTI_STEP_TASK: 1 });
  assert.deepEqual(memory.terms.scoring, { MULTI_STEP_TASK: 1 });
  assert.equal(memory.terms.das, undefined, 'Funktionswörter sind keine Begriffe');
  assert.equal(memory.terms.der, undefined);
});

test('Lexikon: Smalltalk lehrt die Semantik nicht', () => {
  const memory = observe(emptyMemory(NOW), seen('chat', 'CHAT', { text: 'hallo wie geht es dir' }), NOW);
  assert.deepEqual(memory.terms, {}, 'ein Gruß trägt keine Auftragssemantik');
});

test('Lexikon: was keine Regel beansprucht, bleibt als Begriff sichtbar', () => {
  let memory = emptyMemory(NOW);
  memory = observe(memory, seen(null, 'UNDEFINED', { score: 0, text: 'irgendwas mit dem zeug und dem kram' }), NOW);
  assert.equal(memory.unmatched, 1);
  assert.equal(memory.unclaimed.irgendwas, 1);
  assert.equal(memory.unclaimed.zeug, 1);
  assert.deepEqual(memory.terms, {}, 'ein Treffer ohne Pattern lehrt keine Klasse');
});

test('Lexikon: erst ab MIN_TERM_OBSERVATIONS behauptet ein Begriff eine Klasse', () => {
  let memory = emptyMemory(NOW);
  const text = 'refaktoriere die struktur im modul';
  memory = observe(memory, seen('refactor', 'TRANSFORM', { text }), NOW);
  assert.deepEqual(semanticProfile(memory), {}, `eine Beobachtung ist unter ${MIN_TERM_OBSERVATIONS}`);
  memory = observe(memory, seen('refactor', 'TRANSFORM', { text }), NOW);
  const profile = semanticProfile(memory);
  assert.equal(profile.struktur.classification, 'TRANSFORM');
  assert.equal(profile.struktur.confidence, 1);
});

test('Lexikon: die Mehrheitsklasse gewinnt, die Konfidenz ist ihr Anteil', () => {
  let memory = emptyMemory(NOW);
  const text = 'parser schreiben fuer die datei';
  memory = observe(memory, seen('parser', 'MULTI_STEP_TASK', { text }), NOW);
  memory = observe(memory, seen('parser', 'MULTI_STEP_TASK', { text }), NOW);
  memory = observe(memory, seen('lookup-content', 'LOOKUP', { text }), NOW);
  const profile = semanticProfile(memory);
  assert.equal(profile.parser.classification, 'MULTI_STEP_TASK');
  assert.equal(profile.parser.confidence, 0.667, '2 von 3 Beobachtungen');
});

test('Lexikon: die Stützung zählt nur passende Klassen und ist gedeckelt', () => {
  let memory = emptyMemory(NOW);
  const text = 'parser schreiben fuer die datei';
  for (let index = 0; index < 4; index += 1) {
    memory = observe(memory, seen('parser', 'MULTI_STEP_TASK', { text }), NOW);
  }
  const profile = semanticProfile(memory);
  const support = semanticSupport(profile, text, 'MULTI_STEP_TASK');
  assert.ok(support > 0, 'der gelernte Begriff stützt seine Klasse');
  assert.ok(support <= 0.6, `gedeckelt (${support})`);
  assert.equal(semanticSupport(profile, text, 'TRANSFORM'), 0, 'fremde Klasse bekommt nichts');
  assert.equal(semanticSupport(profile, 'voellig anderer text', 'MULTI_STEP_TASK'), 0);
  assert.equal(semanticSupport(null, text, 'MULTI_STEP_TASK'), 0);
  assert.equal(semanticSupport(profile, text, ''), 0);
});

test('Lexikon: Altern lässt Begriffe sichtbar, aber leichter werden', () => {
  let memory = emptyMemory(NOW);
  const text = 'parser schreiben fuer die datei';
  for (let index = 0; index < 4; index += 1) {
    memory = observe(memory, seen('parser', 'MULTI_STEP_TASK', { text }), NOW);
  }
  const before = semanticSupport(semanticProfile(memory), text, 'MULTI_STEP_TASK');
  const decayed = decay(memory, 0.5);
  assert.equal(decayed.terms.parser.MULTI_STEP_TASK, 2);
  const after = semanticSupport(semanticProfile(decayed), text, 'MULTI_STEP_TASK');
  assert.ok(after > 0 && after < before, `gealtert, aber nicht weg (${after} < ${before})`);
  // Unbeanspruchte Begriffe sind ein Hinweis, kein Bestand — sie dürfen fallen.
  let hint = observe(emptyMemory(NOW), seen(null, 'UNDEFINED', { text: 'irgendwas mit dem zeug' }), NOW);
  hint = decay(hint, 0.4);
  assert.deepEqual(hint.unclaimed, {}, 'ein Hinweis ohne Wiederholung verschwindet');
});

test('Lexikon: die Ablage trägt es über den Neustart — Form geprüft, Fremdes fällt weg', () => {
  let memory = emptyMemory(NOW);
  const text = 'parser schreiben fuer die datei';
  for (let index = 0; index < 3; index += 1) {
    memory = observe(memory, seen('parser', 'MULTI_STEP_TASK', { text }), NOW);
  }
  memory = observe(memory, seen(null, 'UNDEFINED', { text: 'irgendwas mit dem zeug' }), NOW);
  // Der Weg, den der Host geht: JSON raus, JSON rein.
  const checked = validateMemory(JSON.parse(JSON.stringify(memory)));
  assert.equal(checked.foreign, false);
  assert.equal(checked.dropped, 0);
  assert.deepEqual(checked.memory.terms, memory.terms, 'das Lexikon überlebt den Neustart');
  assert.deepEqual(checked.memory.unclaimed, memory.unclaimed);
  assert.equal(semanticProfile(checked.memory).parser.classification, 'MULTI_STEP_TASK');
});

test('Lexikon: kaputte Einträge fallen einzeln weg und werden gezählt', () => {
  const checked = validateMemory({
    contract: MEMORY_CONTRACT,
    terms: {
      gut: { TRANSFORM: 2 },
      leer: { TRANSFORM: 0 },
      keinobjekt: 'nein',
      nullklasse: { '': 3 },
    },
    unclaimed: { irgendwas: 2, nullwert: 0 },
  });
  assert.equal(checked.dropped, 3, 'leer, keinobjekt, leere Klasse');
  assert.deepEqual(Object.keys(checked.memory.terms), ['gut']);
  assert.deepEqual(checked.memory.unclaimed, { irgendwas: 2 });
});

test('Lexikon: der Deckel hält — neue Begriffe laufen in einen Eimer', () => {
  let memory = emptyMemory(NOW);
  for (let index = 0; index < MAX_TERMS + 5; index += 1) {
    memory = observe(memory, seen('tests', 'MULTI_STEP_TASK', { text: `begriff${index}xyz` }), NOW);
  }
  assert.equal(Object.keys(memory.terms).length, MAX_TERMS + 1, 'Deckel plus Eimer');
  assert.ok(memory.terms['<overflow>'].MULTI_STEP_TASK >= 5, 'der Überhang ist sichtbar, nicht verschluckt');
});

test('Lexikon: Begriffe werden wie im Resolver zerlegt', () => {
  assert.deepEqual([...tokensOf('Schreib Tests fürs Scoring-Modul!')].sort(), ['modul', 'schreib', 'scoring', 'tests']);
  assert.deepEqual([...tokensOf('der die das')], []);
  assert.deepEqual([...tokensOf(null)], []);
  assert.deepEqual([...tokensOf('abc')], [], 'zu kurz ist kein Begriff');
});
