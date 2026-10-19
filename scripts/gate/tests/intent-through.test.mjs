/**
 * Gate: die Intent-Kette VON ENDE ZU ENDE.
 *
 * Einzelne Tests gibt es für jeder Stufe; dieser fährt sie hintereinander mit
 * demselben Text: Resolver (Klasse) → Modus (der Kontextvertrag) → Expansion
 * (was in den Prompt geht) → Router (Ziel oder linear). Die Kette ist der Ort,
 * an dem ein Fehler still wird: eine Klasse, die der Router nicht kennt, sieht
 * wie „linear" aus; eine Frage mit Expansion sieht wie eine Aufgabe aus.
 *
 * Beide Pakete werden direkt importiert (kein DSH, kein Profil), weil das Gate
 * den BAUM prüft. Der Router zieht sein Schemastery aus `node_modules` — dieser
 * Test läuft deshalb im Gate, nicht in `test:prompter`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expandPrompt, resolveIntent, UNDEFINED } from '../../../packages/prompter/assets/intent-resolver.js';
import { INTENT_CLASSES as PROMPTER_CLASSES, MODES, resolveMode } from '../../../packages/prompter/assets/mode-core.js';
import { INTENT_CLASSES as ROUTER_CLASSES, SOURCE_CONTRACT, decide } from '../../../packages/task-router/index.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RULES = JSON.parse(readFileSync(`${ROOT}packages/prompter/assets/intent-rules.json`, 'utf8'));

const CASES = [
  // Text, Klasse, Expansion erwartet, Router-Ausgang
  { text: 'hallo', classification: 'CHAT', expands: false, goal: false },
  { text: 'wie funktioniert der project index?', classification: 'LOOKUP', expands: false, goal: false },
  { text: 'refaktoriere den index', classification: 'TRANSFORM', expands: true, goal: false },
  { text: 'über wochen jede nacht die tests verbessern', classification: 'LONG_RUNNING_GOAL', expands: false, goal: true },
  // Kein Trigger, keine Klasse, kein Ziel: der Fail-closed-Fall der Kette.
  { text: 'baue eine neue seite', classification: UNDEFINED, expands: false, goal: false },
];

test('das Vokabular der beiden Pakete ist dasselbe', () => {
  assert.deepEqual(PROMPTER_CLASSES, ROUTER_CLASSES, 'Prompter und Router kennen verschiedene Klassen');
});

test('jede Klasse hat einen Modus, in dem sie laufen kann', () => {
  assert.ok(MODES.length >= 3, 'zu wenige Modi');
  for (const mode of MODES) {
    const contract = resolveMode(mode);
    assert.equal(typeof contract.needsContext, 'boolean', `${mode}: needsContext fehlt`);
    assert.ok(Array.isArray(contract.forbids), `${mode}: forbids fehlt`);
  }
  assert.equal(resolveMode('MAX').needsContext, true, 'MAX braucht Kontext');
  assert.equal(resolveMode('MIN').needsContext, false, 'MIN braucht keinen');
});

test('Text → Klasse → Expansion → Router, für jeden Fall', () => {
  for (const entry of CASES) {
    const resolution = resolveIntent(entry.text, RULES);
    assert.equal(resolution.classification, entry.classification, `${entry.text}: ${resolution.patternId || resolution.reason}`);

    const expanded = expandPrompt(entry.text, resolution);
    if (entry.expands) {
      assert.ok(expanded.startsWith(entry.text), `${entry.text}: der Prompt wurde ersetzt statt erweitert`);
      assert.ok(expanded.includes('# Aufgabe'), `${entry.text}: Expansion fehlt`);
      assert.ok(expanded.length > entry.text.length);
    } else {
      assert.equal(expanded, entry.text, `${entry.text}: ohne Expansion muss der Text wortgleich bleiben`);
    }

    // Eine Frage trägt nie einen Zusatz — sonst erfindet der Agent seine Aufgabe.
    if (resolution.question) assert.equal(resolution.expansion, '');

    const decision = decide({
      contract: SOURCE_CONTRACT,
      intentClassification: resolution.classification,
      rawLength: entry.text.length,
    });
    assert.equal(typeof decision.goal, 'boolean');
    assert.equal(decision.goal, entry.goal, `${entry.text}: ${decision.reason}`);
    assert.equal(decision.intent, resolution.classification === UNDEFINED ? UNDEFINED : resolution.classification);
  }
});

test('die Reihenfolge der Regeln ändert die Kette nicht', () => {
  const reversed = { ...RULES, patterns: [...RULES.patterns].reverse() };
  for (const entry of CASES) {
    const forward = resolveIntent(entry.text, RULES);
    const backward = resolveIntent(entry.text, reversed);
    assert.equal(backward.classification, forward.classification, `${entry.text}: Klasse dreht mit der Datenreihenfolge`);
    assert.equal(backward.patternId, forward.patternId, `${entry.text}: Pattern dreht mit der Datenreihenfolge`);
  }
});

test('jede mögliche Klasse endet in genau einem Router-Ausgang', () => {
  for (const classification of [...ROUTER_CLASSES, UNDEFINED, '', 'FREMD']) {
    const decision = decide({ contract: SOURCE_CONTRACT, intentClassification: classification, rawLength: 120 });
    assert.equal(typeof decision.goal, 'boolean', `${classification}: kein Ausgang`);
    assert.ok(decision.weight >= 0, `${classification}: Gewicht fehlt`);
    assert.ok(decision.reason.length > 0, `${classification}: ohne Grund`);
    if (classification === 'FREMD') assert.match(decision.reason, /^UNKNOWN_CLASS/, 'eine fremde Klasse ist kein Ziel');
  }
});
