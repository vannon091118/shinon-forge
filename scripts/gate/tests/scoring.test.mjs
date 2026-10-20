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
  SIGNAL_RULES_CONTRACT_ID,
  TENDENCY_RULES_CONTRACT_ID,
  TENDENCY_MECHANISMS,
  SIGNAL_IDS,
  FORBIDDEN_RULE_KEYS,
  FORBIDDEN_TOKENS,
  STORE_VERBS,
  staticIssues,
  scopeIssues,
  contractIssues,
  signalRuleIssues,
  tendencyRuleIssues,
  outcomeIssues,
  poleOfSignal,
  resolveMechanism,
} from '../plugins/scoring.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scoring = JSON.parse(readFileSync(join(ROOT, 'packages/scoring/assets/scoring-state.json'), 'utf8'));
const profile = JSON.parse(readFileSync(join(ROOT, 'packages/scoring/assets/technical-profile.json'), 'utf8'));
const triggers = JSON.parse(readFileSync(join(ROOT, 'packages/scoring/assets/skill-triggers.json'), 'utf8'));
const spine = JSON.parse(readFileSync(join(ROOT, 'packages/events/assets/event-spine.json'), 'utf8'));
const rules = JSON.parse(readFileSync(join(ROOT, 'packages/scoring/assets/signal-rules.json'), 'utf8'));
const tendency = JSON.parse(readFileSync(join(ROOT, 'packages/scoring/assets/tendency-rules.json'), 'utf8'));
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

// ── 4. Signal-Vertrag (K5) ───────────────────────────────────────────────────

test('scoring: die echte Signaltabelle ist fehlerfrei und deckt die Plan-Tabelle', () => {
  assert.equal(rules.contract, SIGNAL_RULES_CONTRACT_ID);
  assert.deepEqual(signalRuleIssues(rules, scoring, spine, 'signal-rules.json'), []);
  assert.deepEqual(Object.keys(rules.signals).sort(), [...SIGNAL_IDS].sort());
  // Die neue Datei ist eine bekannte Scoring-Datei — kein Befund im Pfad-Scope.
  assert.deepEqual(scopeIssues([...sourcesOf(), { file: 'x.js', source: "readFileSync('./assets/signal-rules.json', 'utf8');" }]), []);
});

test('scoring: ein fremder Vertragsname und fehlende Zeilen werden gemeldet', () => {
  const wrong = clone(rules);
  wrong.contract = 'shinon.irgendwas/v1';
  assert.ok(signalRuleIssues(wrong, scoring, spine, 'x.json').some((issue) => issue.includes('scoring.irgendwas') || issue.includes('signal-rules/v1')));

  const missing = clone(rules);
  delete missing.signals.rephrase;
  const issues = signalRuleIssues(missing, scoring, spine, 'x.json');
  assert.ok(issues.some((issue) => issue.includes('Signal rephrase fehlt')));
  assert.ok(issues.some((issue) => issue.includes('genau 7 Zeilen')));
});

test('scoring: eine achte Zeile und ein beobachtbares Signal ohne Zulieferer werden gemeldet', () => {
  const extra = clone(rules);
  extra.signals.charisma = { observable: true, source: 'feedback.rated', type: 'feedback.approval', strength: 'low', subject: 'message', label: 'x' };
  assert.ok(signalRuleIssues(extra, scoring, spine, 'x.json').some((issue) => issue.includes('steht nicht in der Plan-Tabelle')));

  // Ohne turn.end hat 'accept' keinen Zulieferer mehr — eine Fähigkeit, die nie entsteht.
  const orphan = clone(rules);
  delete orphan.sources['turn.end'];
  assert.ok(signalRuleIssues(orphan, scoring, spine, 'x.json').some((issue) => issue.includes('Signal accept ist als beobachtbar geführt')));
});

test('scoring: eine beobachtbare Zeile ohne Typ, Stärke, Label oder Betreff wird gemeldet', () => {
  for (const key of ['type', 'strength', 'label', 'subject']) {
    const broken = clone(rules);
    delete broken.signals.copy[key];
    assert.ok(
      signalRuleIssues(broken, scoring, spine, 'x.json').some((issue) => issue.includes(`signals.copy.${key}`)),
      `${key} fehlt und wurde nicht gemeldet`,
    );
  }
  const foreignType = clone(rules);
  foreignType.signals.copy.type = 'feedback.erfunden';
  assert.ok(signalRuleIssues(foreignType, scoring, spine, 'x.json').some((issue) => issue.includes('feedback.erfunden')));
});

test('scoring: eine nicht beobachtbare Zeile braucht einen Grund und keinen Typ', () => {
  const withoutReason = clone(rules);
  withoutReason.signals.nextq.reason = '';
  assert.ok(signalRuleIssues(withoutReason, scoring, spine, 'x.json').some((issue) => issue.includes('keinen Grund')));

  const withType = clone(rules);
  withType.signals.nextq.type = 'feedback.approval';
  withType.signals.nextq.strength = 'low';
  assert.ok(signalRuleIssues(withType, scoring, spine, 'x.json').some((issue) => issue.includes('darf trotzdem keinen Typ')));
});

test('scoring: eine Quelle außerhalb des Spines oder ohne nativen Typ wird gemeldet', () => {
  const unknown = clone(rules);
  unknown.sources['mood.changed'] = { native: 'mood/changed', kind: 'note', signal: null };
  assert.ok(signalRuleIssues(unknown, scoring, spine, 'x.json').some((issue) => issue.includes('mood.changed steht nicht im Spine')));

  const alien = clone(rules);
  alien.sources['feedback.rated'].native = 'feedback/message-gibt-es-nicht';
  assert.ok(signalRuleIssues(alien, scoring, spine, 'x.json').some((issue) => issue.includes('ist im Carrier nicht abgebildet')));

  const unmapped = clone(rules);
  delete unmapped.sources['message.received'];
  assert.ok(signalRuleIssues(unmapped, scoring, spine, 'x.json').some((issue) => issue.includes('Signal rephrase ist als beobachtbar geführt')));
});

test('scoring: eine Quelle, die ein nicht beobachtbares Signal nennt, wird gemeldet', () => {
  const broken = clone(rules);
  broken.sources['feedback.rated'].byRating = { positive: 'adopt', negative: 'selffix' };
  assert.ok(signalRuleIssues(broken, scoring, spine, 'x.json').some((issue) => issue.includes('als nicht beobachtbar führt')));
});

test('scoring: ein Deckel, ein Zähler-Limit oder eine Sekundenregel wird gemeldet', () => {
  assert.ok(FORBIDDEN_RULE_KEYS.includes('trustCeiling'));
  for (const key of ['trustCeiling', 'maxPublishedSignalsPerSession', 'windowSeconds']) {
    const broken = clone(rules);
    broken.limits[key] = key === 'trustCeiling' ? 0.8 : 10;
    const issues = signalRuleIssues(broken, scoring, spine, 'x.json');
    assert.ok(issues.some((issue) => issue.includes(key)), `${key} wurde nicht gemeldet`);
    assert.ok(issues.some((issue) => issue.includes('verboten')), `${key}: Grund fehlt`);
  }
});

test('scoring: ein nicht-numerischer oder fehlender Stärke-Faktor wird gemeldet', () => {
  const broken = clone(rules);
  broken.limits.strengths.high = 'doppelt';
  assert.ok(signalRuleIssues(broken, scoring, spine, 'x.json').some((issue) => issue.includes('limits.strengths.high')));
});

// ── 5. Tendenz-Vertrag (Zug 3) ───────────────────────────────────────────────

test('scoring: die echten Tendenz-Regeln sind fehlerfrei und in der Whitelist', () => {
  assert.equal(tendency.contract, TENDENCY_RULES_CONTRACT_ID);
  assert.deepEqual(tendencyRuleIssues(tendency, rules, scoring, 'tendency-rules.json'), []);
  // Die neue Datei ist eine bekannte Scoring-Datei — der Pfad-Scope kennt sie.
  assert.deepEqual(
    scopeIssues([...sourcesOf(), { file: 'x.js', source: "readFileSync('./assets/tendency-rules.json', 'utf8');" }]),
    [],
  );
});

test('scoring: fremder Tendenz-Vertrag, Deckel und unbekannter Mechanismus werden gemeldet', () => {
  const wrong = clone(tendency);
  wrong.contract = 'shinon.tendenz/v9';
  assert.ok(tendencyRuleIssues(wrong, rules, scoring, 'x.json').some((issue) => issue.includes('shinon.tendency-rules/v1')));

  const capped = clone(tendency);
  capped.mechanisms.trustCeiling = { label: 'Deckel', where: 'scoring-state.json#decay' };
  const cappedIssues = tendencyRuleIssues(capped, rules, scoring, 'x.json');
  assert.ok(cappedIssues.some((issue) => issue.includes('trustCeiling') && issue.includes('verboten')));
  assert.ok(cappedIssues.some((issue) => issue.includes('kein benannter Mechanismus')));

  const invented = clone(tendency);
  invented.mechanisms.magic = { label: 'Magie', where: 'scoring-state.json#decay' };
  assert.ok(tendencyRuleIssues(invented, rules, scoring, 'x.json').some((issue) => issue.includes('mechanisms.magic')));
});

test('scoring: ein Mechanismus ohne auflösenden Ort wird gemeldet', () => {
  const missing = clone(tendency);
  delete missing.mechanisms.retract;
  assert.ok(tendencyRuleIssues(missing, rules, scoring, 'x.json').some((issue) => issue.includes('mechanisms.retract fehlt')));

  const noWhere = clone(tendency);
  noWhere.mechanisms.weight.where = '';
  assert.ok(tendencyRuleIssues(noWhere, rules, scoring, 'x.json').some((issue) => issue.includes('ohne Ort')));

  const wrongFile = clone(tendency);
  wrongFile.mechanisms.forget.where = 'signal-rules.json#limits.strengths';
  assert.ok(tendencyRuleIssues(wrongFile, rules, scoring, 'x.json').some((issue) => issue.includes('erwartet wird scoring-state.json')));

  const dangling = clone(tendency);
  dangling.mechanisms.forget.where = 'scoring-state.json#gibtsnicht';
  assert.ok(tendencyRuleIssues(dangling, rules, scoring, 'x.json').some((issue) => issue.includes('löst im Vertrag nicht auf')));
});

test('scoring: eine Klasse mit falschem Pol, Doppelung, Lücke oder erfundenem Signal wird gemeldet', () => {
  const alien = clone(tendency);
  alien.classes[0].signals = ['selffix', 'erfunden'];
  assert.ok(tendencyRuleIssues(alien, rules, scoring, 'x.json').some((issue) => issue.includes('dieses Signal gibt es nicht')));

  const invisible = clone(tendency);
  invisible.classes[0].signals = ['selffix', 'adopt'];
  assert.ok(tendencyRuleIssues(invisible, rules, scoring, 'x.json').some((issue) => issue.includes('nicht beobachtbar')));

  // Der Pol kommt aus dem Vorzeichen des Deltas, nicht aus dem Namen: eine
  // Klasse, die ihren Pol falsch herum trägt, wird gemeldet.
  const flipped = clone(tendency);
  flipped.classes[0].pole = 'positive';
  assert.ok(tendencyRuleIssues(flipped, rules, scoring, 'x.json').some((issue) => issue.includes('aber selffix schiebt negative')));

  const twice = clone(tendency);
  twice.classes[0].signals = ['selffix', 'rephrase', 'dismiss'];
  twice.classes[1].signals = ['copy', 'accept', 'selffix'];
  assert.ok(tendencyRuleIssues(twice, rules, scoring, 'x.json').some((issue) => issue.includes('genau EINEN Pol')));

  // Ein beobachtbares Signal ohne Klasse: die Tendenz rechnet daran vorbei.
  const gap = clone(tendency);
  gap.classes[1].signals = ['copy'];
  assert.ok(tendencyRuleIssues(gap, rules, scoring, 'x.json').some((issue) => issue.includes('accept speist keine Klasse')));

  const badPole = clone(tendency);
  badPole.classes[0].pole = 'neutral';
  assert.ok(tendencyRuleIssues(badPole, rules, scoring, 'x.json').some((issue) => issue.includes('classes[1].pole')));
});

test('scoring: Stufen ohne Ende bei 0, steigende Stufen und dünne Haltungen werden gemeldet', () => {
  const open = clone(tendency);
  open.levels = [{ id: 'hoch', minShare: 0.5 }, { id: 'niedrig', minShare: 0.2 }];
  assert.ok(tendencyRuleIssues(open, rules, scoring, 'x.json').some((issue) => issue.includes('bei 0 liegen')));

  const rising = clone(tendency);
  rising.levels = [{ id: 'niedrig', minShare: 0 }, { id: 'hoch', minShare: 0.5 }];
  assert.ok(tendencyRuleIssues(rising, rules, scoring, 'x.json').some((issue) => issue.includes('absteigend')));

  const doubled = clone(tendency);
  doubled.levels = [{ id: 'hoch', minShare: 0.5 }, { id: 'hoch', minShare: 0 }];
  assert.ok(tendencyRuleIssues(doubled, rules, scoring, 'x.json').some((issue) => issue.includes('doppelt')));

  // Eine Haltung, die auf nichts passt, und eine Bedingung ohne Klasse/Stufe.
  const always = clone(tendency);
  always.stances = [{ id: 'wach', when: { korrektur: 'hoch' } }];
  assert.ok(tendencyRuleIssues(always, rules, scoring, 'x.json').some((issue) => issue.includes('bedingungslos')));

  const ghost = clone(tendency);
  ghost.stances = [{ id: 'wach', when: { charisma: 'gigantisch' } }, { id: 'neutral' }];
  const ghostIssues = tendencyRuleIssues(ghost, rules, scoring, 'x.json');
  assert.ok(ghostIssues.some((issue) => issue.includes('Klasse "charisma"')));
  assert.ok(ghostIssues.some((issue) => issue.includes('Stufe "gigantisch"')));

  const thin = clone(tendency);
  thin.minSignals = 0;
  assert.ok(tendencyRuleIssues(thin, rules, scoring, 'x.json').some((issue) => issue.includes('minSignals')));
});

test('scoring: der Pol eines Signals kommt aus dem Delta des Vertrags', () => {
  assert.equal(poleOfSignal(scoring, rules.signals.copy), 'positive');
  assert.equal(poleOfSignal(scoring, rules.signals.selffix), 'negative');
  assert.equal(poleOfSignal(scoring, { type: 'feedback.erfunden' }), null);
  assert.equal(poleOfSignal({ events: { 'feedback.neutral': { delta: { trust: 0 } } } }, { type: 'feedback.neutral' }), null);
});

// ── 6. Der eine Ausgang (Zusage) ─────────────────────────────────────────────

test('scoring: der echte Host hat genau einen Ausgang und genau ein load', () => {
  assert.deepEqual(outcomeIssues(sourcesOf()), []);
  assert.ok(TENDENCY_MECHANISMS.forget === 'scoring-state.json');
  assert.deepEqual(resolveMechanism('signal-rules.json#sources.feedback.retracted', { 'signal-rules.json': rules }), rules.sources['feedback.retracted']);
  assert.equal(resolveMechanism('signal-rules.json#gibtsnicht', { 'signal-rules.json': rules }), undefined);
  assert.equal(resolveMechanism('ohne-raute', { 'signal-rules.json': rules }), undefined);
});

test('scoring: ein zweites save, ein zweites load und jedes weitere Schreibverb werden gemeldet', () => {
  const host = () => [{ file: 'packages/scoring/index.js', source: readFileSync(join(ROOT, 'packages/scoring/index.js'), 'utf8') }];
  const withLine = (line) => [...host(), { file: 'packages/scoring/index.js', source: line }];
  const only = (sources) => outcomeIssues(sources);

  // Zwei `save` in EINER Datei: der zweite Weg. ANGEFÜGT statt ersetzt — die
  // Probe hängt an der Zusage (genau ein Ausgang), nicht am Wortlaut einer
  // Zeile; ein umbenannter Speicherpfad darf den Test nicht still entwaffnen.
  const hostSource = readFileSync(join(ROOT, 'packages/scoring/index.js'), 'utf8');
  const doubleSave = `${hostSource}\ntarget.save('x', 1);\n`;
  assert.ok(only([{ file: 'packages/scoring/index.js', source: doubleSave }]).some((issue) => issue.includes('genau 1 `save`')));

  const doubleLoad = `${hostSource}\ntarget.load('y');\n`;
  assert.ok(only([{ file: 'packages/scoring/index.js', source: doubleLoad }]).some((issue) => issue.includes('genau 1 `load`')));

  for (const verb of STORE_VERBS) {
    const found = only(withLine(`store.${verb}('x');`));
    assert.ok(found.some((issue) => issue.includes(verb)), `${verb} wurde nicht erkannt`);
  }
});
