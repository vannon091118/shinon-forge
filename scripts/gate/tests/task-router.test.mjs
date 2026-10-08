#!/usr/bin/env node
/**
 * Abnahmetest des Task Routers (@shinon/task-router) — Phase 5, Plan §16.
 *
 * §16 in einem Satz: „Das LLM liefert eine Klassifikation. Die Runtime
 * entscheidet." Genau das wird hier gemessen — und die zwei Dinge, die dabei
 * schiefgehen koennen, werden getrennt geprueft:
 *
 *   1. DAS VOKABULAR. Der Router und der Enhancer fuehren dieselbe Liste. Kein
 *      Paket importiert das andere; die Uebereinstimmung wird hier von AUSSEN
 *      gepinnt. Zwei Listen, die auseinanderlaufen, waeren ein stiller Fehler:
 *      der Router wuerde jede Klasse des Enhancers als unbekannt verwerfen.
 *   2. DIE POLICY. Die Tabelle aus §16 (CHAT/LOOKUP/TRANSFORM linear,
 *      MULTI_STEP_TASK/LONG_RUNNING_GOAL Kandidat) ist eine ZAHLENTABELLE plus
 *      Schwelle, und die Entscheidung ist eine reine Funktion. Damit ist sie
 *      ohne Modell, ohne Netz und ohne Zustand nachpruefbar.
 *
 * Drei Ebenen, bewusst getrennt:
 *   a. Die Daten: Vokabular, Gewichte, Schwelle — und ihre Uebereinstimmung
 *      zwischen beiden Paketen.
 *   b. Die Entscheidung als reine Funktion: die Verhaltenstabelle aus §16, die
 *      Schwelle als POLICY (heben und senken aendert das Ergebnis, ohne Code
 *      anzufassen) und die Fail-closed-Faelle (kein Etikett -> kein Kandidat).
 *   c. Der ECHTE Durchlauf: beide Bundles haengen an EINEM echten
 *      Cordis-Context, gefahren wird der echte Waterfall `agent/pre-step`, der
 *      Enhancer emittiert seinen validierten Datensatz auf dem echten Bus, und
 *      der Router entscheidet daraus. Der Modell-Provider ist zwangslaeufig eine
 *      Attrappe (extern, braucht Zugangsdaten); alles andere ist echt.
 *
 * Kein Netz, kein Modell, kein node_modules im Repo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';

const PACKAGES = ['prompter', 'task-router'];
const ROOT = new URL('../../../', import.meta.url);

/**
 * Beide Bundles isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation.
 * Beide liegen in EINEM Arbeitsverzeichnis, damit ein einziger Shim genuegt —
 * die Pakete importieren einander nicht, also braucht keines das andere.
 */
async function loadBundles() {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
  const require = createRequire(join(root, 'package.json'));
  const work = mkdtempSync(join(tmpdir(), 'shinon-router-test-'));
  for (const name of PACKAGES) {
    cpSync(new URL(`packages/${name}/`, ROOT), join(work, name), { recursive: true });
  }
  const shim = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  const loaded = {};
  for (const name of PACKAGES) loaded[name] = await import(pathToFileURL(join(work, name, 'index.js')).href);
  return { loaded, work, require };
}

const { loaded, work } = await loadBundles();
process.on('exit', () => {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* Aufraeumen ist Beiwerk */
  }
});
const prompter = loaded.prompter;
const router = loaded['task-router'];

const dshRequire = createRequire(join(dshRoot(), 'package.json'));
const { Context } = await import(pathToFileURL(dshRequire.resolve('@deepseek-ai/cordis')).href);
/**
 * Die ECHTE Goal-Domaene der installierten Fassung — fuer den API-Pin (§17:
 * „Die tatsaechlichen API-Namen muessen aus der installierten DSH-Version
 * geprueft werden") und fuer die echten Fehlertypen in den Attrappen.
 */
const goalPackage = await import(pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-goal')).href);
const { GoalError } = goalPackage;

function quiet(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

/** Ein Prompter-Datensatz in der Form, die der Enhancer wirklich emittiert. */
const prompterRecord = (over = {}) => ({
  contract: prompter.CONTRACT,
  mode: 'MID',
  outcome: 'accepted',
  reasons: [],
  context: 'not-applicable',
  intentClassification: 'TRANSFORM',
  uncertainties: [],
  references: [],
  rawLength: 64,
  enhancedLength: 60,
  ...over,
});

const LONG = 'x'.repeat(64);

// ── a. Vokabular und die Naht zwischen den beiden Paketen ───────────────────

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

// ── b. Die Verhaltenstabelle aus §16 und die Schwelle als Policy ────────────

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

// ── c. Der echte Durchlauf: Enhancer → Router an EINEM Bus ──────────────────

/** Nutzer-Nachricht in der Form, die der Loop fuehrt (TextBlock + id + source). */
const userMessage = (text) => ({ id: 'm-1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });
const stepPayload = (messages) => ({ agent: { session: { id: 'sess-1' } }, messages, turn: 1, step: 1, signal: new AbortController().signal });
const loopDefault = (claimed) => () => Promise.resolve({ kind: 'enter', messages: claimed });

function fakeLlm(behaviour) {
  const calls = [];
  return {
    calls,
    stream(options) {
      calls.push(options);
      const text = typeof behaviour === 'function' ? behaviour(options) : behaviour;
      if (text instanceof Error) throw text;
      return (async function* streamChunks() {
        yield { type: 'text-delta', index: 0, text };
      })();
    },
  };
}

const result = (over = {}) => JSON.stringify({
  enhancedPrompt: 'Bitte baue die zwoelf neuen Module und teste sie danach gruendlich.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
  intentClassification: 'TRANSFORM',
  ...over,
});

/**
 * BEIDE Bundles an EINEM echten Cordis-Context. Damit laeuft die Naht wirklich:
 * der Enhancer emittiert seinen validierten Datensatz auf dem echten Bus, und
 * der Router liest ihn dort.
 */
function chain({ prompterConfig = {}, routerConfig = {}, llm, goals, routerFirst = false } = {}) {
  const ctx = new Context();
  const decisions = [];
  const prompterRecords = [];
  ctx.provide('llm', llm);
  if (goals !== undefined) ctx.provide(router.GOAL_SERVICE, goals);
  ctx.on(prompter.DECISION_CHANNEL, (record) => prompterRecords.push(record));
  ctx.on(router.DECISION_CHANNEL, (decision) => decisions.push(decision));
  // Die Bundles ueber ihre apply()-Schnittstelle an den ECHTEN Context haengen:
  // derselbe Bus, derselbe Waterfall, derselbe Schemastery — und der Disposer
  // ist so der, den das Paket wirklich zurueckgibt.
  const mountPrompter = () => quiet(() => prompter.apply(ctx, prompter.Config({ provider: 'test-route', model: 'test-model', ...prompterConfig })));
  const mountRouter = () => quiet(() => router.apply(ctx, router.Config({ ...routerConfig })));
  // `routerFirst` dreht die Registrierungsreihenfolge um: die Zuordnung von
  // Agent und Absicht darf nicht an einer Reihenfolge haengen.
  const [first, second] = (routerFirst ? [mountRouter, mountPrompter] : [mountPrompter, mountRouter]).map((mount) => mount());
  return {
    ctx,
    decisions,
    prompterRecords,
    prompterDispose: routerFirst ? second : first,
    routerDispose: routerFirst ? first : second,
  };
}

const RAW = 'bitte baue die zwoelf neuen module und teste sie danach gruendlich';

/**
 * Eine Attrappe des ECHTEN Goal-Dienstes: genau die Methoden, die der Router
 * aufruft, mit derselben Signatur (`get(agent)`, `create(agent, request)`) und
 * den echten Fehlertypen aus der installierten Fassung.
 */
function fakeGoals({ current = undefined, fail = null } = {}) {
  const calls = { get: [], create: [] };
  return {
    calls,
    get(agent) {
      calls.get.push(agent);
      if (fail === 'get') throw new GoalError('agent nicht live', 'GOAL_AGENT_NOT_LIVE');
      return current;
    },
    create(agent, request) {
      calls.create.push({ agent, request });
      if (fail === 'create') throw new GoalError('schon vorhanden', 'GOAL_ALREADY_EXISTS');
      return {
        id: 'goal-1',
        revision: 1,
        phase: 'active',
        activation: 'armed',
        objective: request.objective,
        maxGoalRounds: request.maxGoalRounds ?? 256,
        roundsStarted: 0,
      };
    },
  };
}

test('Kette: die validierte Klassifikation des Enhancers entscheidet den Router', async () => {
  const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
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
  const llm = fakeLlm(result({ intentClassification: 'TRANSFORM' }));
  const first = chain({ llm });
  await first.ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload([userMessage(RAW)]), loopDefault([userMessage(RAW)]));
  assert.equal(first.decisions.length, 1);
  assert.equal(first.decisions[0].outcome, 'linear');
  assert.equal(first.decisions[0].reason, 'BELOW_THRESHOLD:0<2');
  first.prompterDispose();
  first.routerDispose();

  // Ohne Modellroute laeuft der Enhancer nicht (NO_ROUTE) — dann gibt es keine
  // Klassifikation, und der Router erfindet keine: KEIN Goal-Workflow.
  const idle = fakeLlm(result());
  const second = chain({ prompterConfig: { provider: '', model: '' }, llm: idle });
  await second.ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload([userMessage(RAW)]), loopDefault([userMessage(RAW)]));
  assert.equal(idle.calls.length, 0, 'ohne Route kein Aufruf');
  assert.equal(second.prompterRecords.length, 1);
  assert.equal(second.prompterRecords[0].intentClassification, null, 'keine Klassifikation ohne Ergebnis');
  assert.equal(second.decisions.length, 1);
  assert.equal(second.decisions[0].outcome, 'linear');
  assert.equal(second.decisions[0].reason, 'NO_CLASSIFICATION', 'das Etikett fehlt — also kein Kandidat, ohne zu raten');
  second.prompterDispose();
  second.routerDispose();
});

test('Kette: die Schwelle aus der Konfiguration wirkt bis in den Datensatz', async () => {
  const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
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
  const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
  const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm });
  routerDispose();
  const claimed = [userMessage(RAW)];

  await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(decisions.length, 0, 'kein Zuhoerer, keine Entscheidung');
  prompterDispose();
});

// ── d. §17: die Aktivierung ueber DSHs vorhandenen Goal-Mechanismus ────────

/**
 * §17 verlangt zwei Dinge, die man nicht glauben, sondern nachsehen kann:
 *   (a) „Nicht selbst implementieren: while (goal.active)" — der eigene Code
 *       enthaelt keine Schleife, keinen Timer und keinen Goal-Zustand.
 *   (b) „Die tatsaechlichen API-Namen muessen aus der installierten DSH-Version
 *       geprueft werden" — der Dienst, den wir aufrufen, existiert dort mit
 *       genau diesen Methoden, und DSHs eigene Rundenobergrenze ist 256.
 */
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
  const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
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

test('§17: eine vorhandene Absicht wird NIE automatisch ueberschrieben', async () => {
  const llm = fakeLlm(result({ intentClassification: 'LONG_RUNNING_GOAL' }));
  const goals = fakeGoals({ current: { id: 'mensch-1', revision: 7, phase: 'paused' } });
  const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm, goals, routerConfig: { activate: true } });
  const payload = stepPayload([userMessage(RAW)]);

  await ctx.waterfall(prompter.PRE_STEP_EVENT, payload, loopDefault(payload.messages));

  assert.deepEqual(goals.calls.create, [], 'kein create, kein Ueberschreiben');
  assert.equal(decisions[0].outcome, 'goal', 'die Entscheidung bleibt ein Kandidat');
  assert.equal(decisions[0].activated, false);
  assert.equal(decisions[0].activation, 'GOAL_EXISTS:paused', 'und der Grund nennt die Phase');
  prompterDispose();
  routerDispose();
});

test('§17: ohne Dienst, ohne Schalter oder ohne lebenden Agenten entsteht kein Goal', async () => {
  const cases = [
    { name: 'Dienst fehlt', goals: undefined, routerConfig: { activate: true }, activation: 'NO_GOAL_SERVICE', creates: 0 },
    { name: 'Schalter aus', goals: fakeGoals(), routerConfig: {}, activation: 'ACTIVATION_DISABLED', creates: 0 },
    // Der Agent ist nicht der lebende dieser Registry: DSH lehnt schon das Lesen
    // ab, also wird gar nicht erst erzeugt.
    { name: 'Agent nicht live', goals: fakeGoals({ fail: 'get' }), routerConfig: { activate: true }, activation: 'GOAL_ERROR:GOAL_AGENT_NOT_LIVE', creates: 0 },
    // Hier WIRD erzeugt und DSH lehnt ab — der Versuch ist sichtbar, das Goal nicht.
    { name: 'DSH lehnt ab', goals: fakeGoals({ fail: 'create' }), routerConfig: { activate: true }, activation: 'GOAL_ERROR:GOAL_ALREADY_EXISTS', creates: 1 },
  ];
  for (const { name, goals, routerConfig, activation, creates } of cases) {
    const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
    const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm, goals, routerConfig });
    const payload = stepPayload([userMessage(RAW)]);

    await ctx.waterfall(prompter.PRE_STEP_EVENT, payload, loopDefault(payload.messages));

    assert.equal(decisions.length, 1, name);
    assert.equal(decisions[0].outcome, 'goal', `${name}: die ENTSCHEIDUNG gilt unabhaengig von der Aktivierung`);
    assert.equal(decisions[0].activated, false, name);
    assert.equal(decisions[0].activation, activation, name);
    assert.equal(decisions[0].goalId, '', name);
    if (goals !== undefined) assert.equal(goals.calls.create.length, creates, `${name}: Versuche vs. Goals`);
    prompterDispose();
    routerDispose();
  }

  // Ohne vorgemerkten Schritt ist die Zuordnung nicht geraten: kein Goal.
  const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
  const goals = fakeGoals();
  const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm, goals, routerConfig: { activate: true } });
  ctx.emit(prompter.DECISION_CHANNEL, { contract: prompter.CONTRACT, session_id: 'unbekannt', intentClassification: 'MULTI_STEP_TASK', rawLength: 128 });
  assert.equal(decisions[0].activation, 'NO_LIVE_AGENT');
  assert.deepEqual(goals.calls.create, []);
  prompterDispose();
  routerDispose();
});

test('§17: die Zuordnung haengt nicht an der Registrierungsreihenfolge', async () => {
  // Der Router merkt sich Agent und Absicht am Wasserfall VOR der Entscheidung,
  // weil der Enhancer seinen Datensatz erst nach dem Durchlauf emittiert. Diese
  // Eigenschaft wird gemessen, statt sie anzunehmen — mit umgedrehter
  // Reihenfolge der beiden Bundles.
  for (const routerFirst of [false, true]) {
    const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
    const goals = fakeGoals();
    const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm, goals, routerConfig: { activate: true }, routerFirst });
    const payload = stepPayload([userMessage(RAW)]);

    await ctx.waterfall(prompter.PRE_STEP_EVENT, payload, loopDefault(payload.messages));

    assert.equal(decisions[0]?.activation, 'ACTIVATED', `routerFirst=${routerFirst}`);
    assert.equal(goals.calls.create.length, 1, `routerFirst=${routerFirst}`);
    prompterDispose();
    routerDispose();
  }
});

test('§17: ohne Sitzung im Datensatz wird nicht geraten', async () => {
  const linear = fakeLlm(result({ intentClassification: 'TRANSFORM' }));

  // Kontrolle: genau EINE Vormerkung — die Zuordnung ist eindeutig, also wird
  // ein Datensatz ohne session_id angenommen.
  const single = chain({ llm: linear, goals: fakeGoals(), routerConfig: { activate: true } });
  const one = stepPayload([userMessage(RAW)]);
  await single.ctx.waterfall(prompter.PRE_STEP_EVENT, one, loopDefault(one.messages));
  single.ctx.emit(prompter.DECISION_CHANNEL, { contract: prompter.CONTRACT, intentClassification: 'MULTI_STEP_TASK', rawLength: 128 });
  assert.equal(single.decisions[1].activation, 'ACTIVATED', 'eine eindeutige Vormerkung genuegt');
  single.prompterDispose();
  single.routerDispose();

  // Zwei Sitzungen vorgemerkt, ein Datensatz ohne Sitzung: jede Zuordnung waere
  // geraten — und ein geratenes Goal ist schlimmer als keines.
  const goals = fakeGoals();
  const many = chain({ llm: linear, goals, routerConfig: { activate: true } });
  const first = stepPayload([userMessage(RAW)]);
  const second = { ...stepPayload([userMessage(RAW)]), agent: { session: { id: 'sess-2' } } };
  await many.ctx.waterfall(prompter.PRE_STEP_EVENT, first, loopDefault(first.messages));
  await many.ctx.waterfall(prompter.PRE_STEP_EVENT, second, loopDefault(second.messages));
  many.ctx.emit(prompter.DECISION_CHANNEL, { contract: prompter.CONTRACT, intentClassification: 'MULTI_STEP_TASK', rawLength: 128 });
  assert.equal(many.decisions[2].outcome, 'goal', 'die Entscheidung faellt trotzdem');
  // Und der Grund ist ein ANDERER als „kein lebender Agent": es sind zwei. Eine
  // Zuordnung waere geraten, und das darf man dem Datensatz ansehen.
  assert.equal(many.decisions[2].activation, 'STEP_AMBIGUOUS', 'aber ohne geratene Zuordnung');
  assert.deepEqual(goals.calls.create, [], 'kein Goal aus einer Vermutung');
  many.prompterDispose();
  many.routerDispose();
});

test('§17: der Dienst darf SPAETER kommen — wie im echten Boot', async () => {
  // Im echten Profil stellt DSH die Goal-Domaene erst nach unseren Layern bereit
  // (gemessen: der Sichtbarkeitscheck beim Mounten meldete "nicht sichtbar",
  // obwohl die Domaene aktiv ist). Deshalb wird der Dienst JE ENTSCHEIDUNG
  // gesucht — dieser Test faehrt genau diese Reihenfolge.
  const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
  const goals = fakeGoals();
  const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm, routerConfig: { activate: true } });
  // Erst hier — nach dem Mounten beider Bundles.
  ctx.provide(router.GOAL_SERVICE, goals);
  const payload = stepPayload([userMessage(RAW)]);

  await ctx.waterfall(prompter.PRE_STEP_EVENT, payload, loopDefault(payload.messages));

  assert.equal(decisions[0].activation, 'ACTIVATED', 'ein spaet bereitgestellter Dienst wird gefunden');
  assert.equal(goals.calls.create.length, 1);
  prompterDispose();
  routerDispose();
});

test('§17: die Absicht ist die MENSCHLICHE Nachricht, und eine tote Sitzung ist keine Quelle', async () => {
  const llm = fakeLlm(result({ intentClassification: 'MULTI_STEP_TASK' }));
  const goals = fakeGoals();
  const { ctx, decisions, prompterDispose, routerDispose } = chain({ llm, goals, routerConfig: { activate: true } });
  // Gemischter Batch wie im echten Betrieb: Harness-Kontext davor und dahinter.
  const payload = stepPayload([
    { id: 'h-1', role: 'user', content: [{ type: 'text', text: 'Agent instructions: du bist ein Helfer.' }], source: { kind: 'harness' } },
    userMessage(RAW),
    { id: 'h-2', role: 'user', content: [{ type: 'text', text: 'Kontext: 3 neue Werkzeugergebnisse' }], source: { kind: 'tool' } },
  ]);

  await ctx.waterfall(prompter.PRE_STEP_EVENT, payload, loopDefault(payload.messages));
  assert.equal(goals.calls.create[0].request.objective, RAW, 'Harness-Text ist keine Absicht');

  // Lifecycle: eine beendete Sitzung ist keine Quelle mehr.
  ctx.emit(router.DISPOSED_EVENT, { agent: payload.agent });
  ctx.emit(prompter.DECISION_CHANNEL, { contract: prompter.CONTRACT, session_id: 'sess-1', intentClassification: 'MULTI_STEP_TASK', rawLength: 128 });
  assert.equal(decisions[1].activation, 'NO_LIVE_AGENT', 'nach dem Ende der Sitzung wird nicht mehr aktiviert');
  assert.equal(goals.calls.create.length, 1, 'kein zweites Goal');
  prompterDispose();
  routerDispose();
});

// ── e. §18: Goal Micro-State — die zusätzliche Projektion ──────────────────

/** Ein GoalView in der Form der installierten DSH-Fassung (Felder unten gepinnt). */
const goalView = (over = {}) => ({
  id: 'goal-1',
  revision: 3,
  objective: 'bitte baue die zwoelf neuen module und teste sie danach gruendlich',
  phase: 'active',
  maxGoalRounds: 6,
  roundsStarted: 2,
  createdAt: 1728000000000,
  updatedAt: 1728000600000,
  activation: 'armed',
  ...over,
});

/** Umschlag plus die fünf Felder aus §18 — Reihenfolge der Sortierung. */
const stateKeys = ['CURRENT_BLOCKER', 'CURRENT_STATE', 'LAST_VERIFIED_FACT', 'NEXT_ACTION', 'OBJECTIVE', 'contract'];

test('§18: die fünf Felder wortgleich — und der Datensatz trägt sonst nichts', () => {
  assert.deepEqual(
    router.MICRO_STATE_FIELDS,
    ['OBJECTIVE', 'CURRENT_STATE', 'LAST_VERIFIED_FACT', 'CURRENT_BLOCKER', 'NEXT_ACTION'],
    'wortgleich und in der Reihenfolge des Plans',
  );
  assert.equal(router.MICRO_STATE_CONTRACT, 'shinon.task-router/micro-state-v1');
  assert.equal(router.MICRO_STATE_SERVICE, 'shinon_goal_micro_state');

  const state = router.projectMicroState(goalView());
  assert.deepEqual(Object.keys(state).sort(), stateKeys);
  // Genau die Zusage aus §18 — die kleinste Form der „keine zweiten
  // autoritativen Session-Historie“ ist die Feldmenge selbst: kein
  // Zeitstempel, keine Rundenliste, keine Nachrichten, kein Verlauf.
  assert.equal(router.MicroStateSchema(state).contract, router.MICRO_STATE_CONTRACT);
  assert.equal(state.OBJECTIVE, 'bitte baue die zwoelf neuen module und teste sie danach gruendlich');
});

test('§18: die Projektion spiegelt den autoritativen Zielzustand — Phase für Phase', () => {
  // FeldFORMEN aus der INSTALLIERTEN Fassung gelesen (types.d.ts von
  // dsh-goal), nicht aus dem Gedächtnis — §17 verlangt das für die API, und
  // dieselbe Nahtstelle gilt hier: ein umbenanntes Feld bei DSH fiel sonst
  // still auf eine leere Projektion.
  const typesPath = join(dirname(dshRequire.resolve('@deepseek-ai/dsh-goal')), 'types', 'types.d.ts');
  const types = readFileSync(typesPath, 'utf8');
  for (const pin of [
    'readonly objective: string',
    'readonly phase: GoalPhase',
    'readonly blockedReason?: GoalBlockReason',
    'readonly activation: GoalActivation',
    "type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'",
  ]) {
    assert.ok(types.includes(pin), `Feld/Form der installierten Fassung: ${pin}`);
  }

  const objective = 'die Entwuerfe pruefen und dann die Freigabe anfragen';
  const active = router.projectMicroState(goalView({ objective }));
  assert.equal(active.OBJECTIVE, objective, 'wortgleich, nie veraedelt');
  assert.equal(active.CURRENT_STATE, 'active');
  assert.equal(active.CURRENT_BLOCKER, '');
  assert.equal(active.NEXT_ACTION, 'ROUND', 'die naechste Runde faehrt DSHs Round-Driver, nicht wir');

  assert.equal(router.projectMicroState(goalView({ activation: 'disarmed' })).NEXT_ACTION, 'NONE', 'ohne automatische Weiterfahrt keine Runden-Empfehlung');
  assert.equal(router.projectMicroState(goalView({ phase: 'paused' })).NEXT_ACTION, 'RESUME');
  assert.equal(router.projectMicroState(goalView({ phase: 'complete' })).NEXT_ACTION, 'NONE');

  // Blockiert: der Grund kommt wortgleich aus DSH, und die Empfehlung ist der
  // MENSCH — §17 verbietet, die Blockade selbst zu heben.
  const blocked = router.projectMicroState(goalView({ phase: 'blocked', blockedReason: { code: 'needs-human', message: 'Wartet auf Freigabe' } }));
  assert.equal(blocked.CURRENT_STATE, 'blocked');
  assert.equal(blocked.CURRENT_BLOCKER, 'needs-human: Wartet auf Freigabe');
  assert.equal(blocked.NEXT_ACTION, 'HUMAN');

  // Blockiert OHNE Grund: DSH liefert keinen — die Zeile bleibt leer, statt
  // einen Grund zu raten; die Empfehlung bleibt der Mensch.
  const reasonless = router.projectMicroState(goalView({ phase: 'blocked' }));
  assert.equal(reasonless.CURRENT_BLOCKER, '');
  assert.equal(reasonless.NEXT_ACTION, 'HUMAN');

  // Kein Ziel: benannt, nicht gemischt.
  const none = router.projectMicroState(null);
  assert.equal(none.CURRENT_STATE, 'NO_GOAL');
  assert.equal(none.OBJECTIVE, '');
  assert.equal(none.NEXT_ACTION, 'NONE');

  // Ein unlesbarer View ist KEIN Zielzustand: „vorhanden“ und „lesbar“ sind
  // zwei Aussagen, und nur die zweite darf hier fallen. Benannt statt gemischt.
  for (const corrupt of [{ objective: 'da' }, 'phase-als-text', 42, []]) {
    const state = router.projectMicroState(corrupt);
    assert.equal(state.CURRENT_STATE, 'UNAVAILABLE', JSON.stringify(corrupt));
    assert.equal(state.OBJECTIVE, '', JSON.stringify(corrupt));
    assert.equal(state.NEXT_ACTION, 'NONE', JSON.stringify(corrupt));
  }

  // Eine unbekannte künftige Phase wird gespiegelt (autoritativ!) und kostet
  // jede Empfehlung — fail-closed in die Richtung „nichts raten“.
  const future = router.projectMicroState(goalView({ phase: 'archived' }));
  assert.equal(future.CURRENT_STATE, 'archived');
  assert.equal(future.NEXT_ACTION, 'NONE');
});

test('§18: LAST_VERIFIED_FACT kommt aus der benannten Quelle — leer statt erfunden', () => {
  const view = goalView();
  // Ohne Quelle: leer. Die Projektion leitet keinen Fakt aus dem Zielzustand
  // ab — und schon gar nicht aus dem Modelltext.
  assert.equal(router.projectMicroState(view).LAST_VERIFIED_FACT, '');
  assert.equal(router.projectMicroState(null).LAST_VERIFIED_FACT, '');

  // Benannte Quelle: wortgleich und unveraendert.
  const fact = 'Build gruen (Lauf 42, 17 von 17)';
  assert.equal(router.projectMicroState(view, { fact }).LAST_VERIFIED_FACT, fact);

  // Kein Merker: jede Projektion ist eine Momentaufnahme — der dritte Aufruf
  // sieht nicht den ersten. Genau das verlangt §18 („keine zweite
  // autoritative Session-Historie“).
  assert.equal(router.projectMicroState(view, { fact: 'zweiter Fakt' }).LAST_VERIFIED_FACT, 'zweiter Fakt');
  assert.equal(router.projectMicroState(view).LAST_VERIFIED_FACT, '');

  // Nicht-Strings sind keine Quelle — auch nicht mit toString().
  for (const bogus of [null, undefined, 42, ['Fakt'], { toString: () => 'Fakt' }]) {
    assert.equal(router.projectMicroState(view, { fact: bogus }).LAST_VERIFIED_FACT, '', String(bogus));
  }
});

test('§18: die Projektion liest nur — jede Schreibmethode des Ziel-Dienstes bleibt unberührt', () => {
  // Der DIREKTE Beweis statt des frueheren Stellvertreters („kein provide“):
  // eine Attrappe, auf der JEDE Schreibmethode wirft und sich mitzaehlt.
  const calls = { get: 0, mutated: [] };
  const view = goalView();
  const hostile = {
    get() {
      calls.get += 1;
      return view;
    },
  };
  for (const verb of ['create', 'edit', 'pause', 'resume', 'complete', 'block', 'clear', 'disarm']) {
    hostile[verb] = () => {
      calls.mutated.push(verb);
      throw new Error(`geschrieben: ${verb}`);
    };
  }
  const service = router.createMicroStateService({ get: (name) => (name === router.GOAL_SERVICE ? hostile : undefined) });

  const state = service.state({ session: { id: 'sess-1' } });
  assert.equal(state.CURRENT_STATE, 'active', 'gelesen, nicht geschrieben');
  assert.equal(calls.get, 1, 'genau EINE Leseoperation je Aufruf');
  assert.deepEqual(calls.mutated, [], 'keine Schreibmethode wurde auch nur berührt');

  // Fehler beim Lesen sind KEIN Zielzustand — „ich kann nicht lesen“ ≠ „es
  // gibt keins“. Beide fail-closed, aber sie sagen verschiedene Dinge.
  const throwing = router.createMicroStateService({
    get: () => {
      throw new GoalError('agent nicht live', 'GOAL_AGENT_NOT_LIVE');
    },
  }).state({ session: { id: 'sess-1' } });
  assert.equal(throwing.CURRENT_STATE, 'UNAVAILABLE', 'Lesefehler ≠ kein Ziel');
  assert.equal(throwing.OBJECTIVE, '');

  // Ohne Ziel-Dienst und ohne ctx.get gleichfalls benannt, ohne Wurf.
  assert.equal(router.createMicroStateService({ get: () => undefined }).state(null).CURRENT_STATE, 'UNAVAILABLE');
  assert.equal(router.createMicroStateService({}).state({ session: { id: 'sess-1' } }).CURRENT_STATE, 'UNAVAILABLE');
});

test('§18: am echten Context angeboten, frisch gelesen, beim Dispose wieder frei', async () => {
  const llm = fakeLlm(result());
  const view = goalView();
  const goals = fakeGoals({ current: view });
  const { ctx, prompterDispose, routerDispose } = chain({ llm, goals });

  const service = ctx.get(router.MICRO_STATE_SERVICE);
  assert.ok(service, 'der Router hat beim Mounten angeboten — am ECHTEN Cordis-Context');
  assert.equal(service.contract, router.MICRO_STATE_CONTRACT);
  assert.equal(typeof service.state, 'function');

  const first = service.state({ session: { id: 'sess-1' } });
  assert.deepEqual(Object.keys(first).sort(), stateKeys);
  assert.equal(first.CURRENT_STATE, 'active');
  assert.equal(first.OBJECTIVE, view.objective);

  // FRISCH gelesen statt cacht: derselbe Dienst, zwischen den beiden Aufrufen
  // geaenderter autoritativer Zustand — die zweite Antwort ist die zweite
  // Wahrheit, und die erste bleibt, was sie war: eine Momentaufnahme.
  view.phase = 'blocked';
  view.blockedReason = { code: 'needs-human', message: 'Wartet auf Freigabe' };
  const second = service.state({ session: { id: 'sess-1' } });
  assert.equal(second.CURRENT_STATE, 'blocked');
  assert.equal(second.CURRENT_BLOCKER, 'needs-human: Wartet auf Freigabe');
  assert.equal(second.NEXT_ACTION, 'HUMAN');
  assert.equal(first.CURRENT_STATE, 'active', 'die erste Antwort ist keine Zeile in einem Verlauf geworden');

  // Nach dispose ist das Angebot wieder frei (die Release-Funktion, die der
  // Context an provide zurueckgibt).
  routerDispose();
  assert.equal(ctx.get(router.MICRO_STATE_SERVICE), undefined, 'dispose gibt den Dienst wieder frei');
  prompterDispose();
});
