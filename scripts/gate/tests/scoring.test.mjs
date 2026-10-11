#!/usr/bin/env node
/**
 * Tests des Scorings-Gates (K4).
 *
 * Zwei Ebenen wie bei Spine und Persona:
 *   1. Die reinen Prüffunktionen gegen die echten Verträge (fehlerfrei) und
 *      gegen gezielte Vertragsbrüche (jeder Bruch wird benannt).
 *   2. Die Laufzeitgrenze am echten Code (kein Schreiben/Handeln) plus
 *      Mutationsproben, die verbotene Aufrufe und fremde Pfade erkennen.
 *
 * Läuft mit `node --test` — kein node_modules, kein DSH, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SCORING_CONTRACT_ID,
  PROFILE_CONTRACT_ID,
  TRIGGERS_CONTRACT_ID,
  FORBIDDEN_TOKENS,
  staticIssues,
  scopeIssues,
  contractIssues,
} from '../plugins/scoring.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scoring = JSON.parse(readFileSync(join(ROOT, 'packages/scoring/assets/scoring-state.json'), 'utf8'));
const profile = JSON.parse(readFileSync(join(ROOT, 'packages/scoring/assets/technical-profile.json'), 'utf8'));
const triggers = JSON.parse(readFileSync(join(ROOT, 'packages/scoring/assets/skill-triggers.json'), 'utf8'));
const spine = JSON.parse(readFileSync(join(ROOT, 'packages/events/assets/event-spine.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

const sourcesOf = () => [
  { file: 'packages/scoring/index.js', source: readFileSync(join(ROOT, 'packages/scoring/index.js'), 'utf8') },
  { file: 'packages/scoring/client.js', source: readFileSync(join(ROOT, 'packages/scoring/client.js'), 'utf8') },
  { file: 'packages/scoring/assets/scoring-core.js', source: readFileSync(join(ROOT, 'packages/scoring/assets/scoring-core.js'), 'utf8') },
];

// ── 1. Echte Verträge ────────────────────────────────────────────────────────

test('scoring: die echten Verträge sind fehlerfrei und tragen die drei Namen', () => {
  assert.equal(scoring.contract, SCORING_CONTRACT_ID);
  assert.equal(profile.contract, PROFILE_CONTRACT_ID);
  assert.equal(triggers.contract, TRIGGERS_CONTRACT_ID);
  assert.deepEqual(contractIssues(scoring, profile, triggers, spine, 'scoring-state.json'), []);
});

test('scoring: der echte Laufzeitcode schreibt nichts und bleibt im Scope', () => {
  assert.deepEqual(staticIssues(sourcesOf()), []);
  assert.deepEqual(scopeIssues(sourcesOf()), []);
});

// ── 2. Trigger-Vertrag fail-closed ───────────────────────────────────────────

test('scoring: ein erfundener Event-Typ wird gemeldet', () => {
  const broken = clone(scoring);
  broken.events['mood.changed'] = { payload: ['session_id'], delta: {} };
  assert.ok(
    contractIssues(broken, profile, triggers, spine, 'x.json').some((issue) => issue.includes('mood.changed')),
  );
});

test('scoring: eine vom Spine abweichende Nutzlast wird gemeldet', () => {
  const broken = clone(scoring);
  broken.events['feedback.correction'].payload = ['session_id', 'correction', 'erfunden'];
  assert.ok(
    contractIssues(broken, profile, triggers, spine, 'x.json').some((issue) => issue.includes('feedback.correction')),
  );
});

test('scoring: unbekannte Dimension, Stufe und Skill werden gemeldet', () => {
  const dimension = clone(triggers);
  dimension.triggers[0].dimension = 'charisma';
  assert.ok(
    contractIssues(scoring, profile, dimension, spine, 'x.json').some((issue) => issue.includes('charisma')),
  );

  const relation = clone(triggers);
  relation.triggers[2].relation = 'seelenverwandt';
  assert.ok(
    contractIssues(scoring, profile, relation, spine, 'x.json').some((issue) => issue.includes('seelenverwandt')),
  );

  const skill = clone(triggers);
  skill.triggers[0].skill = 'hypnose';
  assert.ok(
    contractIssues(scoring, profile, skill, spine, 'x.json').some((issue) => issue.includes('hypnose')),
  );
});

test('scoring: doppelte Trigger-id und Überschreitung von maxTriggers werden gemeldet', () => {
  const doubled = clone(triggers);
  doubled.triggers.push({ ...clone(triggers.triggers[0]) });
  assert.ok(
    contractIssues(scoring, profile, doubled, spine, 'x.json').some((issue) => issue.includes('doppelt')),
  );

  const capped = clone(profile);
  capped.limits.maxTriggers = 2;
  assert.ok(
    contractIssues(scoring, capped, triggers, spine, 'x.json').some((issue) => issue.includes('maxTriggers')),
  );
});

test('scoring: lockerer Decay und fehlendes Kühlen werden gemeldet', () => {
  const decay = clone(scoring);
  decay.decay.rate = 0.5;
  assert.ok(
    contractIssues(decay, profile, triggers, spine, 'x.json').some((issue) => issue.includes('decay.rate')),
  );

  const cooling = clone(scoring);
  cooling.cooling.interval = 1;
  assert.ok(
    contractIssues(cooling, profile, triggers, spine, 'x.json').some((issue) => issue.includes('cooling.interval')),
  );
});

// ── 3. Laufzeitgrenze ────────────────────────────────────────────────────────

test('scoring: ein Schreib-/Modellaufruf im Scoring-Code wird erkannt', () => {
  const sources = sourcesOf();
  assert.ok(
    staticIssues([...sources, { file: 'x.js', source: "writeFileSync('./assets/scoring-state.json', 'x');" }]).some(
      (issue) => issue.includes('writeFileSync'),
    ),
  );
  assert.ok(
    staticIssues([...sources, { file: 'x.js', source: 'ctx.llm.complete();' }]).some((issue) =>
      issue.includes('ctx.llm'),
    ),
  );
  // Jedes Token der Verbotsliste wird als echter Aufruf erkannt (kommentar- und stringblind).
  for (const token of FORBIDDEN_TOKENS) {
    const found = staticIssues([{ file: 'x.js', source: `void f(${token}"x");` }]);
    assert.ok(
      found.some((issue) => issue.includes(token)),
      `${token} wurde nicht erkannt (${JSON.stringify(found)})`,
    );
  }
});

test('scoring: ein Pfad außerhalb der bekannten Dateien wird erkannt', () => {
  const sources = sourcesOf();
  assert.ok(
    scopeIssues([...sources, { file: 'x.js', source: "readFileSync('./assets/geheim.json', 'utf8');" }]).some(
      (issue) => issue.includes('geheim.json'),
    ),
  );
  assert.ok(
    scopeIssues([...sources, { file: 'x.js', source: "import x from '../events/index.js';" }]).some((issue) =>
      issue.includes('verlässt das Paket'),
    ),
  );
});
