import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  INTENT_CLASSES,
  INTENT_PRIORITY,
  UNDEFINED,
  expandPrompt,
  resolveIntent,
} from '../assets/intent-resolver.js';

/**
 * Der Vertrag des Runtime-Resolvers (P2): die Klasse kommt aus dem TEXT, nicht
 * aus einer Modellantwort. Kein Modellaufruf, kein I/O im Modul — diese Datei
 * liest nur die ECHTEN Pattern-Daten, damit die Tests nicht auf einer Kopie
 * gruen werden.
 */
const RULES = JSON.parse(readFileSync(new URL('../assets/intent-rules.json', import.meta.url), 'utf8'));

const classOf = (text) => resolveIntent(text, RULES).classification;

// ── 1. Die fuenf Klassen kommen deterministisch aus den Pattern-Daten ────────

test('Resolver: jede der fuenf Klassen ist ohne Modell ableitbar', () => {
  const cases = [
    { text: 'hallo wie gehts', expected: 'CHAT', pattern: 'chat' },
    { text: 'erklär mir den code', expected: 'LOOKUP', pattern: 'read-code' },
    { text: 'refaktoriere den prompter gruendlich', expected: 'TRANSFORM', pattern: 'refactor' },
    { text: 'schreib tests fuer scoring', expected: 'MULTI_STEP_TASK', pattern: 'tests' },
    { text: 'baue das ueber wochen auf dauer', expected: 'LONG_RUNNING_GOAL', pattern: 'long-running-goal' },
  ];
  for (const { text, expected, pattern } of cases) {
    const resolved = resolveIntent(text, RULES);
    assert.equal(resolved.classification, expected, text);
    assert.equal(resolved.patternId, pattern, `${text}: der Treffer ist der bestehende Pattern`);
    assert.equal(resolved.reason, 'MATCHED');
    // Zweimal dieselbe Eingabe ist zweimal dieselbe Antwort.
    assert.deepEqual(resolveIntent(text, RULES), resolved, `${text}: deterministisch`);
  }
});

test('Resolver: die Pattern-Daten sind die EINZIGE Quelle — kein Trigger steht im Code', () => {
  // Jedes Ergebnis nennt eine Pattern-Id, die es in `intent-rules.json` gibt;
  // der Resolver fuehrt keine zweite Liste. Eine erfundene Id waere hier rot.
  const ids = new Set(RULES.patterns.map((pattern) => pattern.id));
  for (const text of ['hallo', 'erklär mir den code', 'refaktoriere das', 'schreib tests', 'auf dauer']) {
    assert.ok(ids.has(resolveIntent(text, RULES).patternId), text);
  }
  assert.equal(RULES.patterns.every((p) => INTENT_CLASSES.includes(p.classification)), true, 'jede Datenklasse ist im Vokabular');
});

// ── 2. Feste Prioritaet: der staerkste Auftrag gewinnt ──────────────────────

test('Resolver: die Prioritaet ist total und fest', () => {
  assert.deepEqual(Object.keys(INTENT_PRIORITY).sort(), [...INTENT_CLASSES].sort());
  assert.equal(INTENT_PRIORITY.LONG_RUNNING_GOAL > INTENT_PRIORITY.MULTI_STEP_TASK, true);
  assert.equal(INTENT_PRIORITY.MULTI_STEP_TASK > INTENT_PRIORITY.TRANSFORM, true);
  assert.equal(INTENT_PRIORITY.TRANSFORM > INTENT_PRIORITY.LOOKUP, true);
  assert.equal(INTENT_PRIORITY.LOOKUP > INTENT_PRIORITY.CHAT, true);
});

test('Resolver: ein starker Auftrag schlaegt einen schwachen — nicht die Reihenfolge der Daten', () => {
  // Enthaelt Smalltalk UND einen Mehrschritt-Auftrag: der Auftrag gewinnt.
  assert.equal(classOf('danke, jetzt schreib tests fuer scoring'), 'MULTI_STEP_TASK');
  // Refactor (TRANSFORM) plus Test-Auftrag (MULTI_STEP_TASK): der Auftrag gewinnt.
  assert.equal(classOf('refaktoriere und schreib tests'), 'MULTI_STEP_TASK');
  // Die Reihenfolge der Pattern-Zeilen dreht das Ergebnis nicht.
  const reversed = { ...RULES, patterns: [...RULES.patterns].reverse() };
  assert.equal(resolveIntent('refaktoriere und schreib tests', reversed).classification, 'MULTI_STEP_TASK');
});

// ── 3. Enthaltung: unklar ist UNDEFINED, nie eine geratene Klasse ───────────

test('Resolver: unklare Eingabe ist UNDEFINED — mit benanntem Grund', () => {
  for (const text of ['mach was', 'xyz', 'das da oben', 'irgendwas mit dem zeug']) {
    const resolved = resolveIntent(text, RULES);
    assert.equal(resolved.classification, UNDEFINED, text);
    assert.equal(resolved.matched, false, text);
    assert.equal(INTENT_CLASSES.includes(resolved.classification), false, 'UNDEFINED ist keine Klasse');
  }
  assert.equal(resolveIntent('mach was', RULES).reason, 'NO_MATCH');
});

test('Resolver: fehlende Daten und leerer Text sind UNDEFINED, kein Wurf', () => {
  assert.equal(resolveIntent('', RULES).reason, 'EMPTY');
  assert.equal(resolveIntent('   ', RULES).classification, UNDEFINED);
  assert.equal(resolveIntent('schreib tests', null).reason, 'NO_RULES');
  assert.equal(resolveIntent('schreib tests', {}).reason, 'NO_RULES');
  assert.equal(resolveIntent('schreib tests', { patterns: 'nein' }).reason, 'NO_RULES');
});

test('Resolver: eine unbekannte Klasse in den Daten ist kein Treffer', () => {
  const foreign = { patterns: [{ id: 'vibe', label: 'Vibe', trigger: ['mach vibe'], classification: 'VIBE', expansion: 'x' }] };
  const resolved = resolveIntent('mach vibe', foreign);
  assert.equal(resolved.classification, UNDEFINED);
  assert.equal(resolved.reason, 'UNKNOWN_CLASS', 'der Grund nennt den Datenfehler');
});

// ── 4. Fragen: klassifiziert, aber NIE erweitert ───────────────────────────

test('Resolver: eine Frage ist LOOKUP und bekommt keinen Aufgabe-Block', () => {
  const question = resolveIntent('Ist "fix den bug" der richtige Trigger?', RULES);
  assert.equal(question.classification, 'LOOKUP');
  assert.equal(question.question, true);
  assert.equal(question.expansion, '');
  assert.equal(expandPrompt('Ist "fix den bug" der richtige Trigger?', question), 'Ist "fix den bug" der richtige Trigger?');
});

test('Resolver: eine Frage ohne Pattern will eine Antwort — kein Goal', () => {
  const resolved = resolveIntent('warum ist der test broken?', RULES);
  assert.equal(resolved.classification, 'LOOKUP');
  assert.equal(resolved.reason, 'QUESTION');
  assert.equal(resolved.matched, false, 'kein Pattern behauptet einen Auftrag');
});

test('Resolver: Smalltalk bleibt Smalltalk, auch als Frage', () => {
  assert.equal(classOf('hallo, wie geht es dir?'), 'CHAT');
});

// ── 5. Ganze Phrase, nicht Substring — und die Expansion ist ein Angebot ────

test('Resolver: Trigger sind ganze Phrasen — Testament ist kein Test', () => {
  assert.equal(resolveIntent('Testament schreiben', RULES).matched, false);
  assert.equal(resolveIntent('docker compose starten', RULES).matched, false);
  assert.equal(resolveIntent('der Test ist rot', RULES).classification, UNDEFINED);
});

test('Resolver: die Expansion haengt den Auftrag an, sie ersetzt ihn nicht', () => {
  const resolved = resolveIntent('schreib tests fuer scoring', RULES);
  const expanded = expandPrompt('schreib tests fuer scoring', resolved);
  assert.ok(expanded.startsWith('schreib tests fuer scoring'));
  assert.ok(expanded.includes('# Aufgabe'));
  // Ohne Expansion kommt der Text wortgleich zurueck — fail-closed.
  assert.equal(expandPrompt('hallo', resolveIntent('hallo', RULES)), 'hallo');
  assert.equal(expandPrompt('hallo', null), 'hallo');
});
