/** Teil 1/2 von task-router.test.mjs — Fixtures stehen in `task-router-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { quiet } from './helpers/console.mjs';
import { PACKAGES, ROOT, loadBundles, loaded, work, prompter, router, dshRequire, Context, goalPackage, GoalError, prompterRecord, LONG, userMessage, stepPayload, loopDefault, fakeLlm, result, chain, RAW, TRANSFORM_RAW, fakeGoals, goalView, stateKeys } from './task-router-fixtures.mjs';

test('Naht: der Router fuehrt wortgleich das Vokabular und den Vertrag des Enhancers', () => {
  // Kein Paket importiert das andere; die Uebereinstimmung ist eine Zusage und
  // wird deshalb von AUSSEN gepinnt. Liefen die Listen auseinander, verwarf der
  // Router jede Klasse des Enhancers als unbekannt — und niemand saehe es.
  assert.deepEqual(router.INTENT_CLASSES, prompter.INTENT_CLASSES);
  assert.deepEqual(router.INTENT_CLASSES, ['CHAT', 'LOOKUP', 'TRANSFORM', 'MULTI_STEP_TASK', 'LONG_RUNNING_GOAL']);
  assert.equal(router.SOURCE_CONTRACT, prompter.CONTRACT);
  assert.equal(router.SOURCE_CHANNEL, prompter.DECISION_CHANNEL);
  assert.equal(router.Config({}).sourceChannel, prompter.DECISION_CHANNEL, 'der Default beobachtet den echten Kanal');
});
test('Vertrag: jeder Ausgang nennt Klasse, Rechnung und Grund — vollstaendig', () => {
  const cases = [
    { name: 'Kandidat', record: prompterRecord({ intentClassification: 'LONG_RUNNING_GOAL' }), outcome: 'goal', prompt: LONG },
    { name: 'linear', record: prompterRecord({ intentClassification: 'CHAT' }), outcome: 'linear', prompt: LONG },
    { name: 'kein Datensatz', record: null, outcome: 'linear', prompt: '' },
  ];
  for (const { name, record, outcome } of cases) {
    const decision = router.decide(record, {});
    const emitted = router.DecisionSchema(router.buildDecision(decision));
    assert.equal(emitted.contract, router.CONTRACT, name);
    assert.equal(emitted.outcome, outcome, name);
    assert.ok(router.OUTCOMES.includes(emitted.outcome), name);
    assert.ok(typeof emitted.reason === 'string' && emitted.reason.length > 0, `${name}: eine Entscheidung ohne Grund ist nicht nachpruefbar`);
    assert.equal(typeof emitted.weight, 'number', name);
    assert.equal(typeof emitted.threshold, 'number', name);
    assert.equal(JSON.stringify(emitted).includes('x'.repeat(20)), false, `${name}: kein Prompt-Text im Datensatz`);
  }
  // required() ueberall: ein fehlendes Feld ist ein Fehler, nicht eine Luecke.
  assert.throws(() => router.DecisionSchema({ contract: router.CONTRACT, outcome: 'goal' }));
  assert.throws(() => router.DecisionSchema({ ...router.buildDecision(router.decide(prompterRecord({ intentClassification: 'CHAT' }))), reason: '' }));
  assert.throws(() => router.DecisionSchema({ ...router.buildDecision(router.decide(prompterRecord())), outcome: 'vielleicht' }));
});
test('Verhalten: genau die Tabelle aus §16 — drei linear, zwei Kandidaten', () => {
  const table = [
    { intent: 'CHAT', goal: false, reason: 'BELOW_THRESHOLD:0<2' },
    { intent: 'LOOKUP', goal: false, reason: 'BELOW_THRESHOLD:0<2' },
    { intent: 'TRANSFORM', goal: false, reason: 'BELOW_THRESHOLD:0<2' },
    { intent: 'MULTI_STEP_TASK', goal: true, reason: 'GOAL_CANDIDATE:MULTI_STEP_TASK' },
    { intent: 'LONG_RUNNING_GOAL', goal: true, reason: 'GOAL_CANDIDATE:LONG_RUNNING_GOAL' },
  ];
  for (const { intent, goal, reason } of table) {
    const decision = router.decide(prompterRecord({ intentClassification: intent, rawLength: LONG.length }), {});
    assert.equal(decision.goal, goal, `${intent}: ${decision.reason}`);
    assert.equal(decision.reason, reason, intent);
    assert.equal(decision.intent, intent, intent);
  }
  // Die Gewichte SIND die Tabelle; die Schwelle trennt sie.
  assert.deepEqual(router.INTENT_WEIGHTS, { CHAT: 0, LOOKUP: 0, TRANSFORM: 0, MULTI_STEP_TASK: 2, LONG_RUNNING_GOAL: 3 });
  assert.equal(router.DEFAULT_THRESHOLD, 2);
  assert.equal(router.DEFAULT_MIN_RAW_LENGTH, 24);
  for (const intent of router.INTENT_CLASSES) {
    assert.equal(router.INTENT_WEIGHTS[intent] >= router.DEFAULT_THRESHOLD, ['MULTI_STEP_TASK', 'LONG_RUNNING_GOAL'].includes(intent), intent);
  }
});
test('Schwelle: sie ist POLICY — heben und senken aendert das Ergebnis ohne Codeaenderung', () => {
  const multi = prompterRecord({ intentClassification: 'MULTI_STEP_TASK', rawLength: LONG.length });
  const long = prompterRecord({ intentClassification: 'LONG_RUNNING_GOAL', rawLength: LONG.length });

  // Senken: auch die Null-Klassen werden Kandidaten — die Schwelle ist der
  // einzige Unterschied, nicht die Klasse.
  assert.equal(router.decide(multi, { threshold: 0 }).goal, true);
  assert.equal(router.decide(multi, { threshold: 1 }).goal, true);
  assert.equal(router.decide(multi, { threshold: 2 }).goal, true);
  // Heben: der Mehrschritt-Auftrag faellt zurueck, die langfristige Absicht nicht.
  assert.equal(router.decide(multi, { threshold: 3 }).goal, false);
  assert.equal(router.decide(multi, { threshold: 3 }).reason, 'BELOW_THRESHOLD:2<3');
  assert.equal(router.decide(long, { threshold: 3 }).goal, true);
  assert.equal(router.decide(long, { threshold: 4 }).goal, false);
  // Eine unbrauchbare Grenze faellt auf den Default zurueck statt auf "alles durch".
  for (const broken of [NaN, undefined, null, 'zwei', Infinity]) {
    assert.equal(router.decide(multi, { threshold: broken }).threshold, router.DEFAULT_THRESHOLD, String(broken));
  }
});
test('Substanzgrenze: ein Zweiwortsatz wird zurueckgestuft, an der Grenze entscheidet sie exakt', () => {
  const raw = 'baue alles'; // 10 Zeichen
  const short = router.decide(prompterRecord({ intentClassification: 'MULTI_STEP_TASK', rawLength: raw.length }), {});
  assert.equal(short.goal, false, 'ein Etikett allein macht keinen Mehrschritt-Auftrag');
  assert.equal(short.reason, `BELOW_MIN_RAW_LENGTH:${raw.length}<24`);

  // Die Grenze selbst ist scharf: 23 -> linear, 24 -> Kandidat.
  assert.equal(router.decide(prompterRecord({ intentClassification: 'MULTI_STEP_TASK', rawLength: 23 }), {}).goal, false);
  assert.equal(router.decide(prompterRecord({ intentClassification: 'MULTI_STEP_TASK', rawLength: 24 }), {}).goal, true);
  // Fehlende oder unbrauchbare Laenge ist die STRENGSTE Richtung: eine Zahl, die
  // niemand gemessen hat, wird zu 0 — nicht zu "unendlich lang".
  for (const broken of [undefined, null, NaN, 'lang', Infinity, -5]) {
    const record = prompterRecord({ intentClassification: 'MULTI_STEP_TASK' });
    record.rawLength = broken;
    const decision = router.decide(record, {});
    assert.equal(decision.goal, false, `rawLength=${String(broken)}: ${decision.reason}`);
    assert.equal(decision.rawLength, 0, `rawLength=${String(broken)} wird nicht durchgereicht`);
  }
});
test('Fail-closed: ohne gueltiges Etikett gibt es keinen Kandidaten', () => {
  const record = prompterRecord({ intentClassification: 'MULTI_STEP_TASK', rawLength: LONG.length });
  const cases = [
    { name: 'kein Datensatz', value: null, reason: 'NO_RECORD' },
    { name: 'undefined', value: undefined, reason: 'NO_RECORD' },
    { name: 'kein Objekt', value: 'MULTI_STEP_TASK', reason: 'NO_RECORD' },
    { name: 'fremder Vertrag (nacktes Etikett)', value: { intentClassification: 'MULTI_STEP_TASK', rawLength: LONG.length }, reason: 'FOREIGN_RECORD' },
    { name: 'fremder Vertrag (anderer Name)', value: { ...record, contract: 'shinon.irgendwas/v1' }, reason: 'FOREIGN_RECORD' },
    { name: 'keine Klasse', value: { ...record, intentClassification: undefined }, reason: 'NO_CLASSIFICATION' },
    { name: 'leere Klasse', value: { ...record, intentClassification: '' }, reason: 'NO_CLASSIFICATION' },
    { name: 'Klasse kein String', value: { ...record, intentClassification: 7 }, reason: 'NO_CLASSIFICATION' },
    { name: 'erfundene Klasse', value: { ...record, intentClassification: 'VIBE' }, reason: 'UNKNOWN_CLASS:VIBE' },
    // Die Enthaltung des Resolvers ist KEINE Klasse: sie wird benannt, nie
    // als Kandidat gelesen — auch dann nicht, wenn jemand sie einschmuggelt.
    { name: 'ausdrueckliche Enthaltung', value: { ...record, intentClassification: 'UNDEFINED' }, reason: 'INTENT_UNDEFINED' },
  ];
  for (const { name, value, reason } of cases) {
    const decision = router.decide(value, {});
    assert.equal(decision.goal, false, name);
    assert.equal(decision.reason, reason, name);
    assert.ok(router.DecisionSchema(router.buildDecision(decision)), name);
  }
});
test('Das Etikett ist notwendig, nicht ausreichend — es kann nichts erzwingen', () => {
  // Was das Modell auch behauptet: die Entscheidung faellt in `decide`, aus
  // Daten. Ein Datensatz mit der staerksten Klasse und einer hohen Schwelle
  // ergibt linear; ein Datensatz ohne Etikett ergibt linear; ein Datensatz ohne
  // Herkunft ergibt linear. Kein Eingabefeld kann `goal: true` erzwingen.
  const strong = prompterRecord({ intentClassification: 'LONG_RUNNING_GOAL', rawLength: LONG.length });
  assert.equal(router.decide(strong, { threshold: 4 }).goal, false);
  assert.equal(router.decide({ ...strong, preservedIntent: false, addedRequirements: ['x'] }, {}).goal, true, 'die Entscheidung haengt an Klasse und Substanz, nicht an Behauptungen des Modells');
  const forged = { ...strong, intentClassification: 'MULTI_STEP_TASK', goal: true, outcome: 'goal' };
  assert.equal(router.decide(forged, { threshold: 3 }).goal, false, 'ein mitgeschicktes goal-Feld aendert die Entscheidung nicht');

  // Und aus dem Etikett allein entsteht auch kein Goal: die Aktivierung (§17)
  // braucht den Schalter UND einen lebenden Agenten UND einen vorhandenen
  // Dienst. Der Default des Pakets ist aus — ein kopiertes Paket erzeugt
  // nichts von selbst.
  assert.equal(router.Config({}).activate, false, 'ohne Profilwert wird nicht aktiviert');
  const host = { get: () => ({ create: () => ({ id: 'x' }) }) };
  assert.equal(router.activateGoal(host, router.Config({}), { pending: new Map() }, strong).reason, 'ACTIVATION_DISABLED');
  assert.equal(router.activateGoal(host, router.Config({ activate: true }), { pending: new Map() }, strong).reason, 'NO_LIVE_AGENT');
  assert.equal(router.OUTCOMES.join(','), 'goal,linear', 'und nur diese zwei Ausgaenge');
});
test('Kette: die Runtime-Klasse entscheidet den Router — nicht das Modell', async () => {
  // Das Modell BEHAUPTET hier CHAT; der Text ist ein Mehrschritt-Auftrag. Der
  // Resolver des Prompters klassifiziert vor dem One-Shot, also steht im
  // Datensatz MULTI_STEP_TASK — und der Router entscheidet darauf.
  const llm = fakeLlm(result({ intentClassification: 'CHAT' }));
  const { ctx, decisions, prompterRecords, prompterDispose, routerDispose } = chain({ llm });
  const claimed = [userMessage(RAW)];

  await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(prompterRecords.length, 1, 'genau ein Enhancer-Datensatz');
  assert.equal(prompterRecords[0].intentClassification, 'MULTI_STEP_TASK');
  assert.equal(decisions.length, 1, 'genau eine Router-Entscheidung pro Schritt');
  const decision = decisions[0];
  assert.equal(decision.outcome, 'goal');
  assert.equal(decision.intent, 'MULTI_STEP_TASK');
  assert.equal(decision.reason, 'GOAL_CANDIDATE:MULTI_STEP_TASK');
  assert.equal(decision.weight, 2);
  assert.equal(decision.threshold, 2);
  assert.equal(decision.rawLength, prompterRecords[0].rawLength, 'dieselbe Laenge, die der Enhancer gemessen hat');
  assert.deepEqual(
    Object.keys(decision).sort(),
    ['activated', 'activation', 'contract', 'goalId', 'intent', 'maxGoalRounds', 'minRawLength', 'outcome', 'rawLength', 'reason', 'threshold', 'weight'],
  );
  assert.equal(decision.activated, false, 'ohne Schalter entsteht kein Goal');
  assert.equal(decision.activation, 'ACTIVATION_DISABLED');
  prompterDispose();
  routerDispose();
});
test('Kette: linear bleibt linear, und ohne Route gibt es gar keinen Kandidaten', async () => {
  // TRANSFORM -> linearer Turn, obwohl der Enhancer gelaufen ist.
  const llm = fakeLlm(result());
  const first = chain({ llm });
  await first.ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload([userMessage(TRANSFORM_RAW)]), loopDefault([userMessage(TRANSFORM_RAW)]));
  assert.equal(first.decisions.length, 1);
  assert.equal(first.decisions[0].outcome, 'linear');
  assert.equal(first.decisions[0].reason, 'BELOW_THRESHOLD:0<2');
  first.prompterDispose();
  first.routerDispose();

  // Ohne Modellroute laeuft der Enhancer nicht (NO_ROUTE) — die KLASSE steht
  // trotzdem: sie kommt aus dem Resolver, nicht aus der Modellantwort. Der
  // Router entscheidet also auch ohne einen einzigen Modellaufruf.
  const idle = fakeLlm(result());
  const second = chain({ prompterConfig: { provider: '', model: '' }, llm: idle });
  await second.ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload([userMessage(RAW)]), loopDefault([userMessage(RAW)]));
  assert.equal(idle.calls.length, 0, 'ohne Route kein Aufruf');
  assert.equal(second.prompterRecords.length, 1);
  assert.equal(second.prompterRecords[0].intentClassification, 'MULTI_STEP_TASK', 'die Klasse haengt nicht am Modell');
  assert.equal(second.decisions.length, 1);
  assert.equal(second.decisions[0].outcome, 'goal', 'der Kandidat steht auch ohne One-Shot');
  assert.equal(second.decisions[0].activation, 'ACTIVATION_DISABLED', 'Kandidat ja, Goal nein — der Schalter fehlt');
  second.prompterDispose();
  second.routerDispose();
});
test('Kette: die Schwelle aus der Konfiguration wirkt bis in den Datensatz', async () => {
  const llm = fakeLlm(result());
  const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm, routerConfig: { threshold: 3 } });
  const claimed = [userMessage(RAW)];

  await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].outcome, 'linear', 'gehobene Schwelle stuft denselben Datensatz zurueck');
  assert.equal(decisions[0].threshold, 3, 'die geltende Schwelle steht im Datensatz');
  prompterDispose();
  routerDispose();
});
test('Der Router mutiert nichts: genau ein Lesedienst, kein Schreibweg, nur ein Datensatz', async () => {
  // Ein Host, der jede schreibende Absicht sichtbar macht. BIS §18 haengte die
  // Zusage („Das LLM darf nicht alleine Goal-State mutieren“) daran, dass es
  // GAR KEINEN provide gibt — das war ein Stellvertreter: Abwesenheit ist kein
  // Beweis. §18 bringt genau EINEN Dienst mit (die Projektion), und der direkte
  // Beweis, dass er nur LIEST, steht im §18-Lesetest: eine Attrappe, auf der
  // jede Schreibmethode wirft und mitzaehlt. Hier bleibt die Zusage, was sie
  // immer war: kein Schreiben von Zustand und genau eine Meldung.
  const seen = { on: [], emit: [], set: [], provide: [], handlers: new Map() };
  const host = {
    on: (name, handler) => {
      seen.on.push(name);
      seen.handlers.set(name, handler);
      return () => seen.on.push(`dispose:${name}`);
    },
    emit: (name, payload) => seen.emit.push({ name, payload }),
    set: (name, value) => seen.set.push({ name, value }),
    provide: (name, value) => seen.provide.push({ name, value }),
  };
  const dispose = quiet(() => router.apply(host, router.Config({})));
  const listener = seen.handlers.get(router.SOURCE_CHANNEL);

  listener(prompterRecord({ intentClassification: 'LONG_RUNNING_GOAL', rawLength: LONG.length }));

  // Drei Listener, jeder mit einer Aufgabe: der Wasserfall merkt Agent und
  // Absicht vor, der Eingang entscheidet, das Lifecycle-Ereignis raeumt weg.
  assert.deepEqual(seen.on, [router.PRE_STEP_EVENT, router.SOURCE_CHANNEL, router.DISPOSED_EVENT], 'genau diese drei Kanaele');
  assert.deepEqual(seen.set, [], 'kein Schreiben von Zustand');
  assert.deepEqual(seen.provide.map((entry) => entry.name), [router.MICRO_STATE_SERVICE], 'genau EIN Dienst, und er ist die Projektion selbst (§18)');
  assert.equal(seen.provide[0].value.contract, router.MICRO_STATE_CONTRACT, 'und er traegt seinen Vertrag');
  assert.equal(seen.emit.length, 1, 'genau eine Meldung');
  assert.equal(seen.emit[0].name, router.DECISION_CHANNEL);
  assert.equal(seen.emit[0].payload.outcome, 'goal');
  dispose();
  assert.ok(seen.on.includes(`dispose:${router.SOURCE_CHANNEL}`), 'dispose meldet ab');
});
test('Der Listener kann den Schritt nicht mitreissen: jede Form von Unsinn ist ein Ausgang', () => {
  const hostile = [
    undefined, null, 0, -1, NaN, 'MULTI_STEP_TASK', true, [], () => {}, Symbol('x'),
    { contract: prompter.CONTRACT, intentClassification: { toString: () => 'CHAT' } },
    { contract: prompter.CONTRACT, intentClassification: 'MULTI_STEP_TASK', rawLength: Number.MAX_VALUE },
  ];
  for (const value of hostile) {
    const decision = router.decide(value, {});
    assert.equal(typeof decision.goal, 'boolean', String(typeof value));
    assert.equal(Number.isFinite(decision.rawLength), true, 'die Laenge im Datensatz ist immer eine fassbare Zahl');
    assert.equal(Number.isFinite(decision.weight) && Number.isFinite(decision.threshold), true, String(typeof value));
  }

  // Ein werfendes emit ist ein Zuhoerer-Problem, kein Schritt-Problem.
  const seen = {};
  const host = { on: (name, handler) => { seen.handler = handler; return () => {}; }, emit: () => { throw new Error('Zuhoerer kaputt'); } };
  quiet(() => router.apply(host, router.Config({ trace: false })));
  assert.doesNotThrow(() => seen.handler(prompterRecord({ intentClassification: 'MULTI_STEP_TASK', rawLength: LONG.length })));

  // Und ohne ctx.on wird gar nicht registriert — laut, nicht still.
  const errors = [];
  const saved = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const dispose = router.apply({}, router.Config({}));
    assert.equal(typeof dispose, 'function');
  } finally {
    console.error = saved;
  }
  assert.ok(errors.some((line) => line.includes('ctx.on fehlt')), 'die Nicht-Registrierung wird benannt');
});
test('Laden: nach dispose entscheidet nichts mehr', async () => {
  const llm = fakeLlm(result());
  const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm });
  routerDispose();
  const claimed = [userMessage(RAW)];

  await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(decisions.length, 0, 'kein Zuhoerer, keine Entscheidung');
  prompterDispose();
});
test('§17: der eigene Code enthaelt keinen Goal-Mechanismus, und die aufgerufene API existiert', () => {
  const source = readFileSync(new URL('../../../packages/task-router/index.js', import.meta.url), 'utf8');
  // Kommentare raus: die ERKLAERUNG darf `while (goal.active)` zitieren, der
  // Code darf es nicht enthalten. Prosa ist keine Implementierung.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const verboten of ['while (', 'for (;;', 'setInterval', 'setTimeout', 'queueMicrotask']) {
    assert.equal(code.includes(verboten), false, `kein eigener Goal-/Schritt-Mechanismus: ${verboten}`);
  }
  assert.equal(code.includes('goal.active'), false, 'kein eigener Goal-Zustand');

  // Der Dienstname und die Methoden, die wir wirklich aufrufen.
  assert.equal(router.GOAL_SERVICE, 'goals', 'ctx.goals — so deklariert DSH den Dienst');
  assert.equal(router.PRE_STEP_EVENT, 'agent/pre-step');
  assert.ok(code.includes('ctx.get(GOAL_SERVICE)'), 'der Dienst wird ueber ctx.get gelesen (ohne Injektionszwang)');
  const service = goalPackage.default;
  assert.equal(typeof service?.prototype?.get, 'function', 'ctx.goals.get(agent) existiert');
  assert.equal(typeof service?.prototype?.create, 'function', 'ctx.goals.create(agent, request) existiert');
  assert.equal(typeof GoalError, 'function', 'GoalError ist der Fehlertyp der Domaene');

  // DSHs Rundenobergrenze ist 256 — die kleinere Zahl ist SHINONS Stop-Policy.
  const resolved = service.Config({});
  assert.equal(resolved.defaultMaxGoalRounds, 256, 'DSHs Default, gemessen');
  assert.ok(router.DEFAULT_MAX_GOAL_ROUNDS < resolved.defaultMaxGoalRounds, 'Shinons Policy ist die engere Grenze');
  assert.equal(router.Config({ activate: true }).activate, true);
  assert.equal(router.Config({}).activate, false, 'ein kopiertes Paket aktiviert nichts von selbst');
});
test('§17: ein Kandidat wird zu einem echten Goal — mit der rohen Absicht und Shinons Runde', async () => {
  const llm = fakeLlm(result());
  const goals = fakeGoals();
  const { ctx, decisions, prompterRecords, prompterDispose, routerDispose } = chain({ llm, goals, routerConfig: { activate: true } });
  const payload = stepPayload([userMessage(RAW)]);

  await ctx.waterfall(prompter.PRE_STEP_EVENT, payload, loopDefault(payload.messages));

  assert.equal(goals.calls.create.length, 1, 'genau ein DSH-Goal fuer einen Kandidaten');
  assert.equal(goals.calls.create[0].agent, payload.agent, 'die EXAKTE Agenten-Instanz, keine nachgebaute Identitaet');
  assert.equal(goals.calls.create[0].request.objective, RAW, 'die ABSICHT des Menschen — nicht der veredelte Prompt');
  assert.equal(goals.calls.create[0].request.maxGoalRounds, router.DEFAULT_MAX_GOAL_ROUNDS, 'Shinons Stop-Policy reist mit');
  assert.equal(prompterRecords[0].session_id, 'sess-1', 'die Zuordnung kommt aus dem Datensatz des Enhancers');

  const decision = decisions[0];
  assert.equal(decision.outcome, 'goal');
  assert.equal(decision.activated, true);
  assert.equal(decision.activation, 'ACTIVATED');
  assert.equal(decision.goalId, 'goal-1');
  assert.equal(decision.maxGoalRounds, router.DEFAULT_MAX_GOAL_ROUNDS, 'die geltende Grenze steht im Datensatz');
  assert.deepEqual(goals.calls.get.length, 1, 'vor dem Erzeugen wird nach einem vorhandenen Goal gefragt');
  prompterDispose();
  routerDispose();
});
