/**
 * Gate: der Prompter-Schnitt (2026-10-20) haelt seine Zusagen.
 *
 * `index.js` war 1350 Zeilen und trug Lauf, Zustand und Ausgabe in einer Datei.
 * Geteilt wurde die INNENflaeche, nicht die Aussenflaeche — dieser Test pinnt
 * genau das, was ein Abnehmer merken wuerde, wenn es kaputtginge:
 *
 *   1. Die OEFFENTLICHE FLAECHE ist unveraendert: dieselben 99 Namen, und zwar
 *      aus denselben Modulen re-exportiert. Ein Name, der beim Verschieben
 *      verloren geht, bricht hier — nicht erst beim Abnehmer.
 *   2. KEIN ZYKLUS: die drei Eigentuemer-Module importieren `index.js` nie.
 *      Die Richtung ist `index → Modul`; nur so bleibt die Verdrahtung oben.
 *   3. EIN ZUSTANDS-EIGENTUEMER: das Runtime-Objekt wird an genau EINER Stelle
 *      gebaut (`loadRuntime` in `assets/runtime-state.js`), und nur dort wird
 *      eine Datei gelesen oder geschrieben. Die Verdrahtung liest keine.
 *
 * Der Test liest Quelltext statt zu importieren: das Gate laeuft in CI ohne
 * `npm ci`, und `index.js` braucht `@deepseek-ai/schemastery` beim Laden. Eine
 * Pruefung, die nur mit Installat laeuft, waere keine Zusage fuer CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../../../packages/prompter/', import.meta.url));
const read = (rel) => readFileSync(`${DIR}${rel}`, 'utf8');

const INDEX = read('index.js');
const LAUF = read('assets/pre-step.js');
const ZUSTAND = read('assets/runtime-state.js');
const AUSGANG = read('assets/trace-report.js');

/** Die 99 Namen, die `@shinon/prompter` vor dem Schnitt exportierte — und danach. */
const FLAECHE = [
  'ABORT_CONTRACT', 'BLOCKS_CONTRACT', 'BLOCKS_PATH', 'CAPABILITIES_CONTRACT', 'CONTEXT_CONTRACT',
  'CONTEXT_TAG', 'CONTRACT', 'Config', 'ContextSchema', 'DECISION_CHANNEL', 'DEFAULT_TOTAL_BUDGET',
  'INDEX_BUDGET_TOKENS', 'INDEX_CONTRACT', 'INDEX_INJECT', 'INDEX_SERVICE', 'INDEX_STORE_CONTRACT',
  'INDEX_STORE_SERVICE', 'INTENT_CLASSES', 'LEARNED_CONTRACT', 'LEARNED_DEFAULT_PATH',
  'MAX_SALVAGE_SESSIONS', 'MAX_UNCERTAINTY', 'MIN_UNCERTAINTY', 'MODES', 'MODE_CAPABILITIES',
  'MODE_DELTAS', 'NOTES_DIR_DEFAULT', 'NOTE_RULES_CONTRACT', 'NOTE_RULES_PATH', 'OPERATION_LABELS',
  'OUTCOME_EFFECTS', 'POLICIES', 'PRE_STEP_EVENT', 'PROPOSE_CONTRACT', 'PROPOSE_SERVICE',
  'PROVENANCE_CONTRACT', 'REQUIREMENT_OPERATIONS', 'ResultSchema', 'SALVAGE_CONTRACT',
  'SALVAGE_MEMO_ID', 'SALVAGE_NAMESPACE', 'SCORING_SERVICE', 'SCORING_SERVICE_CONTRACT',
  'SELECTION_CONTRACT', 'SELF_QUESTION_MARKERS', 'SKILLS_DIR_DEFAULT', 'SKILL_RULES_CONTRACT',
  'SKILL_RULES_PATH', 'STAND_CONTRACT', 'TRACE_ENDPOINT', 'TRACE_GLOBAL', 'UNTRUSTED_RULE',
  'WEIGHTS_CONTRACT', 'WEIGHTS_SERVICE', 'acceptance', 'apply', 'blockSelectTokens',
  'buildEnhancerRequest', 'buildHaystack', 'candidateBlocks', 'collectStream', 'contextTokens',
  'decisionBlocks', 'duplicateVsBlocks', 'effectiveRoute', 'emptySalvage', 'inject', 'loadContext',
  'loadNoteRules', 'loadSkillRules', 'matchBlock', 'mergeLearnedBlocks', 'parseNote', 'parseResult',
  'parseSelection', 'readNotes', 'readPrompt', 'readSkills', 'renderCandidates', 'renderContext',
  'renderSkillsBlock', 'renderStand', 'replacePrompt', 'resolveReferences', 'reviewNotes',
  'salvageCountOf', 'selectBlocks', 'selectNotes', 'selectSkills', 'selectionSystemBrief', 'standFor',
  'standTrace', 'tokens', 'validateBlockCore', 'validateLearnedFile', 'validateProposalShell',
  'validateRegistry', 'validateSalvage', 'withSalvageCount',
];

/** Alle Namen, die eine Datei exportiert — deklariert oder re-exportiert. */
function exporte(text) {
  const names = new Set();
  for (const match of text.matchAll(/export \{([^}]*)\}(?: from '[^']+')?;/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim();
      if (name !== '') names.add(name.split(' as ').pop().trim());
    }
  }
  for (const match of text.matchAll(/export (?:const|function|async function|class) (\w+)/g)) {
    names.add(match[1]);
  }
  return names;
}

test('die oeffentliche Flaeche ist nach dem Schnitt dieselbe', () => {
  assert.deepEqual([...exporte(INDEX)].sort(), [...FLAECHE].sort());
});

test('die drei Eigentuemer-Module exportieren genau ihre Aufgabe', () => {
  assert.deepEqual([...exporte(LAUF)].sort(), ['onPreStep', 'readPrompt']);
  assert.deepEqual([...exporte(ZUSTAND)].sort(), [
    'countSalvage', 'effectiveRoute', 'journalRejectedAnswer', 'loadRuntime', 'persistIntentMemory', 'proposeBlock', 'recordIntent',
  ]);
  assert.deepEqual([...exporte(AUSGANG)], ['reportTrace']);
});

test('die Richtung ist index → Modul: kein Modul importiert index.js', () => {
  for (const [name, text] of [['pre-step.js', LAUF], ['runtime-state.js', ZUSTAND], ['trace-report.js', AUSGANG]]) {
    assert.ok(!/from '\.\.\/index\.js'/.test(text), `${name} importiert index.js — Zyklus statt Schichtung`);
    assert.ok(!/from '\.\/index\.js'/.test(text), `${name} importiert index.js — Zyklus statt Schichtung`);
  }
});

test('der Zustand hat EINEN Erzeuger, und nur er beruehrt Dateien', () => {
  const erzeuger = [INDEX, LAUF, AUSGANG].flatMap((text) => [...text.matchAll(/const runtime = \{/g)]).length;
  assert.equal(erzeuger, 0, 'nur runtime-state.js baut das Runtime-Objekt');
  assert.ok(/export function loadRuntime\(/.test(ZUSTAND));
  for (const [name, text] of [['index.js', INDEX], ['pre-step.js', LAUF], ['trace-report.js', AUSGANG]]) {
    assert.ok(!/readFileSync|writeJsonFile|appendJsonLine/.test(text), `${name} schreibt oder liest eine Datei — das gehoert zu runtime-state.js`);
  }
});

test('jede Datei nennt ihren Eigentuemer im Kopf', () => {
  for (const [name, text, owner] of [
    ['index.js', INDEX, 'NAHT'],
    ['assets/pre-step.js', LAUF, 'LAUF'],
    ['assets/runtime-state.js', ZUSTAND, 'ZUSTAND'],
    ['assets/trace-report.js', AUSGANG, 'AUSGANG'],
  ]) {
    assert.match(text.slice(0, 400), new RegExp(`Eigentuemer: ${owner}`), `${name} nennt seinen Eigentuemer nicht`);
  }
});
