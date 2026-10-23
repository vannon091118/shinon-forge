/** Teil 1/2 von persona-state.test.mjs — Fixtures stehen in `persona-state-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fingerprintRoot } from '../../../packages/seams/assets/seams.js';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import {
  EVENT_TYPES as SPINE_EVENTS,
} from '../plugins/events-spine.mjs';
import {
  PERSONA_EVENT_TYPES,
  STATE_FIELDS,
  hostSource,
  hostText,
  runtimeBoundaryIssues,
  stateContractIssues,
  staticIssues,
} from '../plugins/persona.mjs';
import { quiet } from './helpers/console.mjs';
import { PACKAGE_DIR, REPO_ROOT, ASSET_FILE, contract, clone, loadBundle, bundle, createHost, baseConfig, connect, storeCore, fakeStore, decision, scoringTendency, contextDir, contextFixture, projectSection, foreignProject, withoutEnv, routeRequest, sseRequest } from './persona-state-fixtures.mjs';

test('persona: der echte Zustandsvertrag ist fehlerfrei', () => {
  assert.deepEqual(stateContractIssues(contract, 'persona-state.json'), []);
});
test('persona: die Übergänge sind genau die Event-Typen, die die Persona modelliert', () => {
  assert.deepEqual(Object.keys(contract.transitions).sort(), [...PERSONA_EVENT_TYPES].sort());
});
test('persona: jeder modellierte Typ ist ein Typ des Spines, und die Lücke ist benannt', () => {
  // Teilmenge, nicht Gleichheit: der Spine spricht fünfundzwanzig Typen, die
  // Persona zehn. Ein Typ, den die Persona einführt und der Spine nicht kennt,
  // wäre eine zweite Sprache — und muss rot sein.
  for (const type of PERSONA_EVENT_TYPES) {
    assert.ok(SPINE_EVENTS.includes(type), `${type} ist kein Event-Typ des Spines`);
  }
  assert.ok(SPINE_EVENTS.length > PERSONA_EVENT_TYPES.length, 'der Spine muss mehr Typen kennen als die Persona modelliert');
  // Die nicht modellierten Typen sind namentlich benannt, damit die Lücke eine
  // Entscheidung bleibt und nicht still wächst.
  assert.deepEqual(
    SPINE_EVENTS.filter((type) => !PERSONA_EVENT_TYPES.includes(type)).sort(),
    [
      'developer.message',
      'feedback.approval',
      'feedback.correction',
      'feedback.noted',
      'feedback.rated',
      'feedback.retracted',
      'inbox.spliced',
      'request.header',
      'session.titled',
      'step.end',
      'step.start',
      'system.message',
      'turn.end',
      'turn.start',
      'workspace.changed',
    ],
  );
});
test('persona: fehlender Übergang wird gemeldet', () => {
  const broken = clone(contract);
  delete broken.transitions['gate.failed'];
  assert.ok(stateContractIssues(broken, 'x.json').some((issue) => issue.includes('gate.failed')));
});
test('persona: ein Mood ohne Stimme wird gemeldet', () => {
  const broken = clone(contract);
  delete broken.voice.blocked;
  assert.ok(stateContractIssues(broken, 'x.json').some((issue) => issue.includes('voice.blocked')));
});
test('persona: eine Stimme ohne Mood (toter Text) wird gemeldet', () => {
  const broken = clone(contract);
  broken.voice['pseudonym'] = 'nie erreichbar';
  assert.ok(stateContractIssues(broken, 'x.json').some((issue) => issue.includes('pseudonym')));
});
test('persona: falscher Vertragsname, leere Capabilities und fehlende Grenze werden gemeldet', () => {
  const wrongName = clone(contract);
  wrongName.contract = 'shinon.persona/v2';
  assert.ok(stateContractIssues(wrongName, 'x.json').some((issue) => issue.includes('persona-state/v1')));

  const noCaps = clone(contract);
  noCaps.baseline.capabilities = [];
  assert.ok(stateContractIssues(noCaps, 'x.json').some((issue) => issue.includes('capabilities')));

  const noLimit = clone(contract);
  noLimit.limits.maxEvents = 0;
  assert.ok(stateContractIssues(noLimit, 'x.json').some((issue) => issue.includes('maxEvents')));

  const noForbidden = clone(contract);
  noForbidden.forbidden = ['project_write'];
  assert.ok(stateContractIssues(noForbidden, 'x.json').some((issue) => issue.includes('autonomous_action')));
});
test('persona: der echte Laufzeitcode enthält keine autonome Aktion', () => {
  // Die Grenze gilt fuer die ganze Host-Seite (index.js + assets/*.js) — der
  // Laufzeitcode der Persona liegt seit 2026-10-23 in eigenen Kernen.
  assert.deepEqual(runtimeBoundaryIssues(hostSource(PACKAGE_DIR)), []);
});
test('persona: Modell-/Tool-/Schreibaufrufe werden erkannt', () => {
  const parts = hostSource(PACKAGE_DIR);
  for (const injected of ['ctx.llm.complete()', 'ctx.tools.run("x")', "writeFileSync('/tmp/x', 'y')", 'execSync("rm -rf /")']) {
    const found = runtimeBoundaryIssues([...parts, { file: 'assets/probe.js', source: injected }]);
    assert.ok(found.some((issue) => issue.includes('verbotener Aufruf')), `${injected} nicht erkannt`);
    // Der Befund nennt die Fundstelle, nicht nur das Paket.
    assert.ok(found.some((issue) => issue.startsWith('assets/probe.js')), `${injected}: Fundstelle fehlt`);
  }
});
test('persona: ein Kommentar über die Grenze ist kein Verstoß', () => {
  const source = `${hostText(PACKAGE_DIR)}\n// ctx.llm wird hier nie gerufen, writeFileSync auch nicht\n`;
  assert.deepEqual(staticIssues(source, 'index.js'), []);
});
test('persona: ein fehlendes Zustandsfeld im Code wird erkannt', () => {
  const source = hostText(PACKAGE_DIR).replaceAll('uncertainty', 'unsicherheit');
  assert.ok(staticIssues(source, 'index.js').some((issue) => issue.includes('uncertainty')));
});
test('persona: Baseline ist der dokumentierte Ausgangszustand', () => {
  const state = bundle.initialState(contract);
  assert.deepEqual(Object.keys(state), STATE_FIELDS);
  assert.deepEqual(state, {
    identity: 'Shinon',
    stance: 'critical',
    uncertainty: 'explicit',
    mood: 'idle',
    capabilities: ['analysis', 'verification'],
    limitations: [],
    relation: 'known',
  });
});
test('persona: jeder statische Übergang ergibt den dokumentierten Zustand', () => {
  const expected = {
    'session.created': ['curious', []],
    'message.received': ['curious', []],
    'message.completed': ['focused', []],
    'claim.created': ['focused', ['no_verified_evidence']],
    'tool.requested': ['working', []],
    'tool.completed': ['focused', []],
    'gate.passed': ['focused', []],
    'gate.failed': ['concerned', ['gate_failed']],
    'action.blocked': ['blocked', ['action_blocked']],
  };
  for (const [eventType, [mood, limitations]] of Object.entries(expected)) {
    const result = bundle.deriveState(contract, bundle.initialState(contract), eventType);
    assert.equal(result.changed, true, `${eventType} änderte nichts`);
    assert.equal(result.state.mood, mood, `${eventType} → falscher Mood`);
    assert.deepEqual(result.state.limitations, limitations, `${eventType} → falsche Limitations`);
  }
});
test('persona: unbekanntes Event ändert nichts (fail-closed, kein Raten)', () => {
  const before = bundle.initialState(contract);
  const result = bundle.deriveState(contract, before, 'mood.changed');
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'UNKNOWN_EVENT');
  assert.deepEqual(result.state, before);
});
test('persona: gate.failed setzt eine Limitation, gate.passed nimmt sie zurück', () => {
  const failed = bundle.deriveState(contract, bundle.initialState(contract), 'gate.failed');
  assert.deepEqual(failed.state.limitations, ['gate_failed']);
  const passed = bundle.deriveState(contract, failed.state, 'gate.passed');
  assert.deepEqual(passed.state.limitations, []);
  assert.equal(passed.state.mood, 'focused');
});
test('persona: session.created setzt den Zustand zurück', () => {
  let state = bundle.initialState(contract);
  for (const type of ['claim.created', 'action.blocked', 'gate.failed']) state = bundle.deriveState(contract, state, type).state;
  assert.ok(state.limitations.length >= 2);
  state = bundle.deriveState(contract, state, 'session.created').state;
  assert.deepEqual(state.limitations, []);
  assert.equal(state.mood, 'curious');
});
test('persona: relation.updated liest die Stufe aus dem Event (nur lesend)', () => {
  const start = bundle.initialState(contract);
  assert.equal(start.relation, 'known');

  const trusted = bundle.deriveState(contract, start, 'relation.updated', { relation: 'trusted' });
  assert.equal(trusted.changed, true);
  assert.equal(trusted.state.relation, 'trusted');
  assert.equal(trusted.state.mood, start.mood, 'kein statischer Stimmungswechsel');

  const same = bundle.deriveState(contract, trusted.state, 'relation.updated', { relation: 'trusted' });
  assert.equal(same.changed, false, 'dieselbe Stufe ist keine Änderung');

  const unknown = bundle.deriveState(contract, start, 'relation.updated', { relation: 'trust+1' });
  assert.equal(unknown.changed, false);
  assert.equal(unknown.reason, 'UNKNOWN_RELATION');
  assert.deepEqual(unknown.state, start);

  // Der echte Pfad: die Stufe wird gelesen, aber der Block behauptet sie NICHT.
  const host = connect();
  host.dispatch('shinon/event', { event_type: 'relation.updated', relation: 'anchor' });
  assert.equal(host.liveOf().includes('anchor'), false, 'keine Beziehungsstufe im Live-Block');
  assert.match(host.liveOf(), /Arbeitsmodus:/, 'der Block steht trotzdem');
  host.dispose();
});
test('Live-Block: genau drei Aussagen — Arbeitsmodus, Ton, besondere Reaktion', () => {
  const state = bundle.initialState(contract);
  const text = bundle.renderLiveContext({ contract, state, tone: null });
  assert.match(text, /^## Shinon aktuell\n\n/);
  assert.match(text, /Arbeitsmodus: du bist gerade bereit\./);
  assert.equal(text.includes('Ton:'), false, 'ohne Ton keine Zeile');
  assert.equal(text.includes('Besondere Reaktion'), false, 'ohne Stimmung keine Zeile');
  // NAMENTLICH: eine neue Stimmung ohne Zeile faellt auf, statt still zu bleiben.
  const lines = [['idle', 'bereit'], ['curious', 'neugierig auf den Auftrag'], ['focused', 'an einer Sache dran'], ['working', 'mitten in einer Aufgabe'], ['concerned', 'bei einem Risiko'], ['blocked', 'an einem Blocker']];
  for (const [mood, line] of lines) {
    assert.match(bundle.renderLiveContext({ contract, state: { ...state, mood }, tone: null }), new RegExp(`Arbeitsmodus: du bist gerade ${line}\\.`), `${mood} fehlt`);
  }
  // Fail-closed: ein unbekannter Mood und ein fehlender Zustand behaupten nichts.
  assert.equal(bundle.renderLiveContext({ contract, state: { ...state, mood: 'gleichgueltig' }, tone: null }), null);
  assert.equal(bundle.renderLiveContext({ contract, state: null, tone: null }), null);
});
test('persona: apply registriert die stabilen Abschnitte und EINEN dynamischen Kanal', () => {
  const host = connect();
  const names = host.sections.map((entry) => entry.name);
  for (const name of ['shinon:identity', 'shinon:epistemic', 'shinon:change-classes', 'shinon:determinism', 'shinon:report']) {
    assert.ok(names.includes(name), `${name} fehlt (${names.join(', ')})`);
  }
  // Der Zustand ist KEIN Abschnitt mehr — fuenf trugen ihn in fuenf Gewaendern.
  for (const gone of ['shinon:state', 'shinon:tendency', 'shinon:user-lage', 'shinon:narrative-arc', 'shinon:augenhoehe', 'shinon:discipline']) {
    assert.equal(names.includes(gone), false, `${gone} doppelt den Live-Block`);
  }
  assert.equal(host.contexts.length, 1, 'genau ein dynamischer Kanal');
  assert.equal(host.liveContext().name, 'shinon:persona-live');
  assert.equal(host.liveContext().order, 300);
  assert.match(host.liveOf(), /Arbeitsmodus: du bist gerade bereit/);
  host.dispose();
});
test('persona: ein Event aktualisiert den Live-Block, nicht die Abschnittsliste', () => {
  const host = connect();
  // Acht stabile Abschnitte — NAMENTLICH, damit ein neuer auffaellt.
  assert.deepEqual([...host.sections.map((entry) => entry.name)].sort(), [
    'shinon:change-classes', 'shinon:commitments', 'shinon:determinism', 'shinon:epistemic',
    'shinon:identity', 'shinon:memory', 'shinon:report', 'shinon:self-model',
  ].sort());
  const before = host.sections.length;

  assert.ok(host.dispatch('shinon/event', { event_type: 'gate.failed', session_id: 'sess-1' }));
  assert.match(host.liveOf(), /Arbeitsmodus: du bist gerade bei einem Risiko/);
  assert.equal(host.sections.length, before, 'ein Event erzeugt keinen Abschnitt');
  assert.equal(host.contexts.length, 1, 'genau ein Live-Kanal');

  host.dispatch('shinon/event', { event_type: 'gate.passed' });
  assert.match(host.liveOf(), /Arbeitsmodus: du bist gerade an einer Sache dran/);
  assert.equal(host.sections.length, before);
  host.dispose();
});
test('persona: unbekanntes Event lässt den Live-Block unberührt', () => {
  const host = connect();
  const before = host.liveOf();
  const count = host.sections.length;
  host.dispatch('shinon/event', { event_type: 'nicht.definiert' });
  host.dispatch('shinon/event', {});
  host.dispatch('shinon/event', 'kein objekt');
  assert.equal(host.liveOf(), before);
  assert.equal(host.sections.length, count);
  host.dispose();
});
test('persona: der Fake-Host kennt on, inject und nur LESENDE Abfragen — nichts anderes', () => {
  const host = connect();
  // `get` ist dazugekommen, als die Tendenz gelesen wurde (Zug 5) — und es ist
  // LESEND. Der Host bleibt ohne jede Faehigkeit zum Handeln: kein Modell, kein
  // Werkzeug, kein Schreiben. Der zweite Leser ist der `webServer`, an dem die
  // Pruef-Route haengt; er bekommt nur `register`, nie einen Aufruf.
  assert.deepEqual(Object.keys(host.ctx).sort(), ['get', 'inject', 'on', 'provide']);
  for (const call of host.calls) {
    assert.ok(/^(on|inject|effect|getSectionOrder|section|context|get|child\.get|provide):?/.test(call), `unerwarteter Aufruf: ${call}`);
  }
  assert.ok(host.calls.includes('on:shinon/event'));
  assert.ok(host.calls.some((call) => call === 'inject:systemPrompt'));
  // Die Abschnitte sind Getter: erst die Assembly fragt Ton und Ablage. Genau
  // das wird hier ausgeloest — die Zusicherung gilt dem fertigen Prompt, nicht
  // der Registrierung.
  for (const section of host.sections) void section.text;
  void host.liveOf();
  // Und die Abfragen fragen genau nach Ton, Ablage und Webserver — nach nichts
  // anderem. Die Ablage ist LESEND geholt und dient zwei eigenen Namensraeumen
  // (Selbstmodell, Gedaechtnis); die Persona schreibt keine Projektdatei.
  assert.deepEqual(
    [...new Set(host.calls.filter((call) => call.startsWith('get:')))].sort(),
    [`get:${bundle.INDEX_STORE_SERVICE}`, `get:${bundle.SCORING_SERVICE}`].sort(),
  );
  assert.deepEqual(
    [...new Set(host.calls.filter((call) => call.startsWith('child.get:')))].sort(),
    ['child.get:webServer'],
  );
  host.dispose();
});
test('Selbstmodell: Laufzeitspuren werden zur Ablage — und ein NEUSTART liest sie wieder', () => {
  const store = fakeStore();
  const first = connect({ [bundle.INDEX_STORE_SERVICE]: store }, { identityScope: 'global' });
  const rootA = REPO_ROOT, rootB = join(REPO_ROOT, 'packages'), namespace = (root) => `${bundle.SELF_MODEL_NAMESPACE}/${fingerprintRoot(root).rootId}`;
  assert.equal(first.sections.some((entry) => entry.name === 'shinon:self-model'), true);
  const observe = (host, root) => host.handlers.get('agent/pre-step')(
    { agent: { session: { header: { cwd: root } } } }, () => host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, decision()),
  );
  for (let i = 0; i < 3; i += 1) observe(first, rootA);
  observe(first, rootB);
  const read = (root) => store.load(namespace(root)).state?.memos?.find((memo) => memo?.id === bundle.SELF_MODEL_MEMO_ID)?.model;
  assert.equal(read(rootA).runs, 3);
  assert.equal(read(rootB).runs, 1);
  first.dispose();

  const second = connect({ [bundle.INDEX_STORE_SERVICE]: store }, { identityScope: 'global' });
  observe(second, rootA);
  observe(second, rootB);
  assert.equal(read(rootA).runs, 4, 'Root B hat Root A nicht ersetzt');
  assert.equal(read(rootB).runs, 2, 'Root B wird unabhaengig weitergefuehrt');
  const text = second.sections.find((entry) => entry.name === 'shinon:self-model')?.text ?? '';
  assert.match(text, /Läufe: 4 \(4 angenommen/);
  second.dispose();
  store.close();
});
test('Selbstmodell: ohne Ablage bleibt der Prompt ehrlich leer — keine erfundene Erinnerung', () => {
  // Kein Dienst, kein Gedaechtnis: der Abschnitt ist registriert, traegt aber
  // keinen Text. Nach einem Beleg im Prozess steht die Zahl da — und die Ablage
  // fehlt trotzdem, statt still irgendwohin zu schreiben.
  const host = connect();
  const before = host.sections.find((entry) => entry.name === 'shinon:self-model')?.text ?? '';
  assert.equal(before, '');
  host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, decision());
  assert.deepEqual([...new Set(host.calls.filter((call) => call.startsWith('get:')))].sort(), [
    `get:${bundle.INDEX_STORE_SERVICE}`,
    `get:${bundle.SCORING_SERVICE}`,
  ]);
  host.dispose();
});
test('persona: nach dispose kommen keine Events mehr an', () => {
  const host = connect();
  host.dispatch('shinon/event', { event_type: 'message.received' });
  assert.match(host.liveOf(), /neugierig auf den Auftrag/);
  host.dispose();
  assert.equal(host.dispatch('shinon/event', { event_type: 'gate.failed' }), false);
  assert.match(host.liveOf(), /neugierig auf den Auftrag/, 'der Block friert ein, statt weiterzulaufen');
});
test('persona: zwei Hosts führen getrennte Zustände', () => {
  const a = connect();
  const b = connect();
  a.dispatch('shinon/event', { event_type: 'action.blocked' });
  assert.match(a.liveOf(), /Arbeitsmodus: du bist gerade an einem Blocker/);
  assert.match(b.liveOf(), /Arbeitsmodus: du bist gerade bereit/);
  a.dispose();
  b.dispose();
});
test('Tendenz: dieselben Haltungen auf beiden Seiten', () => {
  const fromScoring = scoringTendency.stances.map((stance) => stance.id).sort();
  const fromPersona = Object.keys(contract.tendency.voices).sort();
  assert.deepEqual(fromPersona, fromScoring,
    'eine Haltung ohne Klang waere stumm, ein Klang ohne Haltung erfunden');
});
test('Ton: Tonalitaet und Anker kommen aus dem Vertrag — sonst keine Zeile', () => {
  const state = bundle.initialState(contract);
  const text = bundle.renderLiveContext({ contract, state, tone: { stance: 'kritisch', tendencies: [{ klasse: 'korrektur', stufe: 'hoch' }] } });
  assert.match(text, /^Ton: trocken und direkt\. Anker: /m);
  assert.match(text, /Widerspruch ohne Umweg/);
  // Die Stufen des Scorings sind NICHT der Prompt: die Zeile traegt Tonalitaet
  // und Anker, keine Tabellenwerte.
  assert.equal(text.includes('korrektur hoch'), false);

  // Kein Ton, unbekannte Haltung, kaputte Form: es wird NICHTS behauptet.
  const ohne = bundle.renderLiveContext({ contract, state, tone: null });
  for (const tone of [null, { stance: null }, { stance: '' }, { stance: 'siegesgewiss' }, 'kritisch']) {
    assert.equal(bundle.renderLiveContext({ contract, state, tone }), ohne, `Ton behauptet bei ${JSON.stringify(tone)}`);
  }
});
