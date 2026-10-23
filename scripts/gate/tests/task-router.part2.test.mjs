/** Teil 2/2 von task-router.test.mjs — Fixtures stehen in `task-router-fixtures.mjs`. */
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

test('§17: eine vorhandene Absicht wird NIE automatisch ueberschrieben', async () => {
  const llm = fakeLlm(result());
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
    const llm = fakeLlm(result());
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
  const llm = fakeLlm(result());
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
    const llm = fakeLlm(result());
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
  const linear = fakeLlm(result());

  // Kontrolle: genau EINE Vormerkung — die Zuordnung ist eindeutig, also wird
  // ein Datensatz ohne session_id angenommen.
  const single = chain({ llm: linear, goals: fakeGoals(), routerConfig: { activate: true } });
  const one = stepPayload([userMessage(TRANSFORM_RAW)]);
  await single.ctx.waterfall(prompter.PRE_STEP_EVENT, one, loopDefault(one.messages));
  single.ctx.emit(prompter.DECISION_CHANNEL, { contract: prompter.CONTRACT, intentClassification: 'MULTI_STEP_TASK', rawLength: 128 });
  assert.equal(single.decisions[1].activation, 'ACTIVATED', 'eine eindeutige Vormerkung genuegt');
  single.prompterDispose();
  single.routerDispose();

  // Zwei Sitzungen vorgemerkt, ein Datensatz ohne Sitzung: jede Zuordnung waere
  // geraten — und ein geratenes Goal ist schlimmer als keines.
  const goals = fakeGoals();
  const many = chain({ llm: linear, goals, routerConfig: { activate: true } });
  const first = stepPayload([userMessage(TRANSFORM_RAW)]);
  const second = { ...stepPayload([userMessage(TRANSFORM_RAW)]), agent: { session: { id: 'sess-2' } } };
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
  const llm = fakeLlm(result());
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
  const llm = fakeLlm(result());
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
