#!/usr/bin/env node
/**
 * Tests der Persona (Identity, State, Voice).
 *
 * Wie beim Event-Spine: zwei Ebenen.
 *   1. Vertrag + reine Ableitung (deriveState, renderStateContext) — ohne alles.
 *   2. Der echte Bundle-Pfad: Event → Zustand → System-Context. Das Paket wird
 *      in ein temporäres Verzeichnis kopiert, mit einem Schemastery-Stub
 *      versehen und über seine echte apply()-Schnittstelle an einen Fake-Host
 *      gehängt, der nur `on` (Events) und `inject` (System-Prompt) kennt.
 *
 * Damit ist die Nicht-Aktions-Grenze nicht nur behauptet: der Host hat gar
 * keine andere API, und die Tests würden bei jedem Zugriff darauf werfen.
 *
 * Läuft mit `node --test` — kein node_modules, kein DSH, kein Netz.
 */
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
  stateContractIssues,
  staticIssues,
} from '../plugins/persona.mjs';
import { quiet } from './helpers/console.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/persona/', import.meta.url));
/** Die Wurzel des Repos, in dem dieses Paket liegt — der EINE erlaubte Persona-Scope. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ASSET_FILE = join(PACKAGE_DIR, 'assets/persona-state.json');

const contract = JSON.parse(readFileSync(ASSET_FILE, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Bundle isoliert laden: Kopie + Schemastery-Stub (nur Config-Konstruktion). */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-persona-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  provideSeamCore(work);
  const stub = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-stub', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(stub, 'index.js'), 'const p = new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : p), apply: () => p, construct: () => p });\nexport default p;\n');
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

const bundle = await loadBundle();

/**
 * Fake-Host: kennt ausschließlich `on` (Events) und `inject` (System-Prompt).
 * Jeder Zugriff auf etwas anderes wirft — genau das ist die Grenze.
 */
function createHost(services = {}) {
  const handlers = new Map();
  const sections = [];
  const calls = [];
  const provided = {};
  const child = {
    // Der echte Cordis-Kontext kann lesen (`get`); die Persona nutzt das NUR,
    // um den `webServer` fuer ihre Routen zu holen — nie zum Handeln.
    get(name) {
      calls.push(`child.get:${name}`);
      return services[name];
    },
    effect(run) {
      calls.push('effect');
      const dispose = run();
      return () => dispose?.();
    },
    systemPrompt: {
      getSectionOrder(name) {
        calls.push(`getSectionOrder:${name}`);
        return name === 'DEPLOYMENT_PERSONA_PREFIX' ? 10 : 9000;
      },
      section({ name, order, text }) {
        calls.push(`section:${name}`);
        // Der echte Dienst loest `text` bei JEDER Assembly auf. Der Fake tut
        // dasselbe ueber einen Getter: sonst saehe ein Test nach einer Annahme
        // noch den alten Text und wuerde die Wirkung nicht messen koennen.
        const entry = {
          name,
          order,
          get text() { return typeof text === 'function' ? text({}) : text; },
        };
        sections.push(entry);
        return () => {
          const at = sections.indexOf(entry);
          if (at >= 0) sections.splice(at, 1);
        };
      },
    },
  };
  const ctx = {
    on(name, handler) {
      calls.push(`on:${name}`);
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    inject(names, callback) {
      calls.push(`inject:${names.join(',')}`);
      callback(child);
    },
    // Die EINE optionale Leseabfrage, die der echte Host auch hat (Zug 5: der
    // Ton des Scorings). Sie ist LESEND und nur da, wenn ein Test etwas anbietet:
    // ohne Dienste gibt es nichts zu holen, und kein Test kann darueber handeln.
    get(name) {
      calls.push(`get:${name}`);
      return services[name];
    },
    // Die Pruef-Naht wird vom Host angeboten, nicht von aussen gesetzt.
    provide(name, service) {
      calls.push(`provide:${name}`);
      provided[name] = service;
      return () => { delete provided[name]; };
    },
  };
  const dispatch = (channel, payload) => {
    const handler = handlers.get(channel);
    if (handler) handler(payload);
    return handler !== undefined;
  };
  const stateSection = () => sections.find((entry) => entry.name === 'shinon:state');
  const stateOf = () => bundle.stateFromContext(stateSection()?.text ?? '');
  return { ctx, handlers, sections, calls, provided, dispatch, stateSection, stateOf };
}
/** Die Config, die jeder Aufbau teilt — ein Test kann einzelne Werte ersetzen. */
const baseConfig = {
  statePath: './assets/persona-state.json',
  eventsChannel: 'shinon/event',
  includeAugenhoehe: true,
  identity: 'IDENT',
  epistemic: 'EPI',
  changeClasses: 'CC',
  determinism: 'DET',
  discipline: 'DISC',
  report: 'REP',
  // Scope ausdrücklich benannt: die Tests laufen IM Shinon-Repo, nicht „irgendwo“.
  workspaceRoot: REPO_ROOT,
};

const connect = (services = {}, overrides = {}) =>
  quiet(() => {
    const host = createHost(services);
    const dispose = bundle.apply(host.ctx, { ...baseConfig, ...overrides });
    return { ...host, dispose };
  });

// ── 1. Vertrag ───────────────────────────────────────────────────────────────

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

// ── 2. Nicht-Aktions-Grenze ──────────────────────────────────────────────────

test('persona: der echte Laufzeitcode enthält keine autonome Aktion', () => {
  const source = readFileSync(join(PACKAGE_DIR, 'index.js'), 'utf8');
  assert.deepEqual(staticIssues(source, 'index.js'), []);
});

test('persona: Modell-/Tool-/Schreibaufrufe werden erkannt', () => {
  const source = readFileSync(join(PACKAGE_DIR, 'index.js'), 'utf8');
  for (const injected of ['ctx.llm.complete()', 'ctx.tools.run("x")', "writeFileSync('/tmp/x', 'y')", 'execSync("rm -rf /")']) {
    assert.ok(staticIssues(`${source}\n${injected};`, 'index.js').some((issue) => issue.includes('verbotener Aufruf')), `${injected} nicht erkannt`);
  }
});

test('persona: ein Kommentar über die Grenze ist kein Verstoß', () => {
  const source = readFileSync(join(PACKAGE_DIR, 'index.js'), 'utf8');
  assert.deepEqual(staticIssues(`${source}\n// ctx.llm wird hier nie gerufen, writeFileSync auch nicht\n`, 'index.js'), []);
});

test('persona: ein fehlendes Zustandsfeld im Code wird erkannt', () => {
  const source = readFileSync(join(PACKAGE_DIR, 'index.js'), 'utf8').replaceAll('uncertainty', 'unsicherheit');
  assert.ok(staticIssues(source, 'index.js').some((issue) => issue.includes('uncertainty')));
});

// ── 3. Reine Ableitung ───────────────────────────────────────────────────────

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

  // Der echte Bundle-Pfad: Event auf dem Spine-Kanal aktualisiert den Kontext.
  const host = connect();
  host.dispatch('shinon/event', { event_type: 'relation.updated', relation: 'anchor' });
  assert.equal(host.stateOf().relation, 'anchor');
  host.dispose();
});

test('persona: der Kontext trägt genau die sieben Felder plus Stimme', () => {
  const context = bundle.renderStateContext(contract, bundle.initialState(contract));
  const parsed = bundle.stateFromContext(context);
  assert.deepEqual(Object.keys(parsed), STATE_FIELDS);
  assert.equal(parsed.identity, 'Shinon');
  assert.match(context, /Stimme: Ruhig und bereit/);
  for (const mood of Object.keys(contract.voice)) {
    const text = bundle.renderStateContext(contract, { ...bundle.initialState(contract), mood });
    assert.match(text, new RegExp(`Stimme: ${contract.voice[mood].slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

// ── 4. Der echte Bundle-Pfad: Event → State → System-Context ────────────────

test('persona: apply registriert die Identity-Abschnitte und einen Zustandsabschnitt', () => {
  const host = connect();
  const names = host.sections.map((entry) => entry.name);
  for (const name of ['shinon:identity', 'shinon:epistemic', 'shinon:change-classes', 'shinon:determinism', 'shinon:discipline', 'shinon:report', 'shinon:augenhoehe', 'shinon:state']) {
    assert.ok(names.includes(name), `${name} fehlt (${names.join(', ')})`);
  }
  assert.deepEqual(host.stateOf(), {
    identity: 'Shinon',
    stance: 'critical',
    uncertainty: 'explicit',
    mood: 'idle',
    capabilities: ['analysis', 'verification'],
    limitations: [],
    relation: 'known',
  });
  host.dispose();
});

test('persona: ein Event auf dem Spine-Kanal aktualisiert den System-Context', () => {
  const host = connect();
  // Elf Abschnitte: sechs Grundsaetze, Augenhöhe, Zustand, Selbstmodell — und
  // Gedaechtnis + Selbstauflagen, die NAMENTLICH dazugehoeren und nicht in einer
  // Zahl verschwinden. Die Getter tragen ohne Ablage keinen Text, sind aber da.
  assert.equal(host.sections.length, 11);
  for (const name of ['shinon:self-model', 'shinon:memory', 'shinon:commitments']) {
    assert.ok(host.sections.some((entry) => entry.name === name), `${name} fehlt`);
  }
  assert.ok(host.dispatch('shinon/event', { event_type: 'gate.failed', session_id: 'sess-1' }));
  assert.equal(host.stateOf().mood, 'concerned');
  assert.deepEqual(host.stateOf().limitations, ['gate_failed']);
  // Ersetzen, nicht anhängen: genau ein Zustandsabschnitt bleibt.
  assert.equal(host.sections.filter((entry) => entry.name === 'shinon:state').length, 1);
  assert.equal(host.sections.length, 11);

  host.dispatch('shinon/event', { event_type: 'gate.passed' });
  assert.deepEqual(host.stateOf().limitations, []);
  assert.equal(host.stateOf().mood, 'focused');
  host.dispose();
});

test('persona: unbekanntes Event lässt den Kontext unberührt', () => {
  const host = connect();
  const before = host.stateOf();
  const count = host.sections.length;
  host.dispatch('shinon/event', { event_type: 'nicht.definiert' });
  host.dispatch('shinon/event', {});
  host.dispatch('shinon/event', 'kein objekt');
  assert.deepEqual(host.stateOf(), before);
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
    assert.ok(/^(on|inject|effect|getSectionOrder|section|get|child\.get|provide):?/.test(call), `unerwarteter Aufruf: ${call}`);
  }
  assert.ok(host.calls.includes('on:shinon/event'));
  assert.ok(host.calls.some((call) => call === 'inject:systemPrompt'));
  // Die Abschnitte sind Getter: erst die Assembly fragt Ton und Ablage. Genau
  // das wird hier ausgeloest — die Zusicherung gilt dem fertigen Prompt, nicht
  // der Registrierung.
  for (const section of host.sections) void section.text;
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

/**
 * Die Ablage ECHT: dieselben Schreib-/Lesefunktionen wie der Project Index.
 *
 * Eine Attrappe, die beliebiges JSON zurueckgibt, haette den Fehler verdeckt,
 * den diese Naht hat: die Ablage haelt NUR Dokumente (memos) und ein paar
 * Kopfzeilen — ein freies Objekt faellt still weg. Genau das wird hier gemessen.
 */
const storeCore = await import(new URL('../../../packages/project-index/assets/index-core.js', import.meta.url));
function fakeStore() {
  const db = storeCore.openLedger(':memory:');
  return {
    contract: bundle.INDEX_STORE_CONTRACT,
    load: (namespace) => {
      const state = storeCore.readMemory(db, namespace);
      return state === null ? { ok: true, state: null } : { ok: true, state };
    },
    save: (namespace, state) => ({ ok: true, rows: storeCore.writeMemory(db, namespace, state) }),
    close: () => db.close(),
  };
}

/** Drei angenommene Entscheidungen mit demselben Grund — belegte Wiederkehr. */
const decision = (outcome = 'accepted') => ({
  outcome,
  intentClassification: 'auftrag',
  intentMatch: 'umbauen',
  reasons: ['zu breit'],
  uncertainties: ['welcher Workspace?'],
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
  assert.equal(host.stateOf().mood, 'curious');
  host.dispose();
  assert.equal(host.dispatch('shinon/event', { event_type: 'gate.failed' }), false);
  assert.equal(host.stateOf().mood, 'curious');
});

test('persona: zwei Hosts führen getrennte Zustände', () => {
  const a = connect();
  const b = connect();
  a.dispatch('shinon/event', { event_type: 'action.blocked' });
  assert.equal(a.stateOf().mood, 'blocked');
  assert.equal(b.stateOf().mood, 'idle');
  a.dispose();
  b.dispose();
});

// ── 5. Die Tendenz (Zug 5) ───────────────────────────────────────────────────
//
// Die Haltung kommt vom Scoring, der Klang steht im Zustandsvertrag. Hier wird
// beides geprueft: die Uebersetzung selbst, die Gleichheit der Haltungs-Namen
// ueber die Paketgrenze — und der echte Weg in den System-Prompt.

/** Die Haltungen, die das Scoring wirklich erzeugen kann (seine eigene Tabelle). */
const scoringTendency = JSON.parse(
  readFileSync(join(PACKAGE_DIR, '../scoring/assets/tendency-rules.json'), 'utf8'),
);

test('Tendenz: dieselben Haltungen auf beiden Seiten', () => {
  const fromScoring = scoringTendency.stances.map((stance) => stance.id).sort();
  const fromPersona = Object.keys(contract.tendency.voices).sort();
  assert.deepEqual(fromPersona, fromScoring,
    'eine Haltung ohne Klang waere stumm, ein Klang ohne Haltung erfunden');
});

test('Tendenz: Ton, Tempo und Härte kommen aus dem Vertrag — oder der Abschnitt faellt weg', () => {
  const tone = { stance: 'kritisch', tendencies: [{ klasse: 'korrektur', stufe: 'hoch' }] };
  const text = bundle.renderTendency(contract, tone);
  assert.match(text, /^## Tendenz \(gelesen, nicht behauptet\)/);
  assert.match(text, /Haltung: kritisch/);
  assert.match(text, /Lage: korrektur hoch/);
  assert.match(text, /Ton: trocken, direkt/);
  assert.match(text, /Tempo: langsam/);
  assert.match(text, /Härte: hoch/);

  // Kein Ton, unbekannte Haltung, kaputte Form: es wird NICHTS behauptet.
  assert.equal(bundle.renderTendency(contract, null), null);
  assert.equal(bundle.renderTendency(contract, { stance: null }), null);
  assert.equal(bundle.renderTendency(contract, { stance: '' }), null);
  assert.equal(bundle.renderTendency(contract, { stance: 'siegesgewiss' }), null, 'unbekannte Haltung: kein erfundener Ton');
  assert.equal(bundle.renderTendency(contract, 'kritisch'), null, 'ein String ist kein Ton');
  // Ohne Stufen bleibt die Lage weg, der Rest steht.
  const ohneLage = bundle.renderTendency(contract, { stance: 'neutral' });
  assert.equal(ohneLage.includes('Lage:'), false);
  assert.match(ohneLage, /Härte: mittel/);
});

test('Tendenz: mit Ton-Dienst steht der Abschnitt im Prompt, ohne ihn nicht', () => {
  const stance = scoringTendency.stances[0].id;
  const service = {
    contract: bundle.SCORING_SERVICE_CONTRACT,
    read: () => ({ stance, tendencies: [{ klasse: 'korrektur', stufe: 'hoch' }], signals: 4, ready: true, reason: null }),
  };

  const withTone = connect({ [bundle.SCORING_SERVICE]: service });
  const tendencySection = withTone.sections.find((entry) => entry.name === 'shinon:tendency');
  assert.ok(tendencySection !== undefined, 'der Abschnitt wird registriert');
  assert.match(tendencySection.text, new RegExp(`Haltung: ${stance}`));
  assert.equal(tendencySection.order, 9000 - 3, 'vor dem Zustandsabschnitt');
  withTone.dispose();

  // Ohne Dienst: kein Abschnitt — und keine erfundene Haltung.
  const without = connect();
  assert.equal(without.sections.some((entry) => entry.name === 'shinon:tendency'), false);
  without.dispose();
});

test('Tendenz: ein fremder Dienst unter dem Namen wird gemeldet, nicht gelesen', () => {
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    // Dieser Aufbau laeuft NICHT ueber `connect`, sondern ueber `quiet` mit
    // `keep: ['error']`: geprueft wird, dass die Warnung ankommt — ein Helfer,
    // der genau diesen Kanal stummschaltet, wuerde die Zusage verdecken.
    const host = createHost({ [bundle.SCORING_SERVICE]: { contract: 'shinon.fremd/v1', read: () => ({ stance: 'kritisch' }) } });
    quiet(() => { host.dispose = bundle.apply(host.ctx, baseConfig); }, { keep: ['error'] });
    assert.equal(host.sections.some((entry) => entry.name === 'shinon:tendency'), false);
    assert.ok(errors.some((line) => line.includes('verletzt den Vertrag')), errors.join(' | '));
    host.dispose();
  } finally {
    console.error = realError;
  }
});

// ── 6. Der Projekt-Kontext (Zug 9) ──────────────────────────────────────────

/**
 * GEMESSEN im echten Profil-Lauf 2026-10-16: JEDER Start meldete
 * `[shinon-persona] Projekt-Kontext nicht lesbar (isAbsolute is not defined)`.
 * `isAbsolute` wurde benutzt, aber nie aus `node:path` importiert; der
 * ReferenceError fiel in das try/catch dieses Blocks, das ihn in eine Warnung
 * verwandelt — die Persona startete also ohne Projekt-Kontext und sagte es nur
 * leise. Das Profil setzt `projectContextPath: .shinon/project-context.md`, der
 * RELATIVE Zweig ist damit der, der in jedem Lauf genommen wird.
 *
 * Der Prüfstand ist derselbe wie oben: echter Bundle-Pfad, Fake-Host, und die
 * registrierten Abschnitte sind von außen lesbar. Ein fehlender Import läßt den
 * Abschnitt verschwinden — dieser Test wird dann rot.
 */
const contextDir = mkdtempSync(join(tmpdir(), 'shinon-persona-ctx-'));
const contextFixture = (name, value) => {
  const file = join(contextDir, name);
  writeFileSync(file, value);
  return file;
};
const projectSection = (host) => host.sections.find((entry) => entry.name === 'shinon:project-context');

test('Projekt-Kontext: ein RELATIVER Pfad wird geladen und steht als Abschnitt im Prompt', () => {
  const file = contextFixture('relativ.md', 'PROJEKT-KONTEXT-RELATIV gilt nur hier\n');
  const host = connect({}, { projectContextPath: relative(REPO_ROOT, file) });

  const section = projectSection(host);
  assert.ok(section, `Abschnitt fehlt (${host.sections.map((entry) => entry.name).join(', ')})`);
  assert.match(section.text, /PROJEKT-KONTEXT-RELATIV/, 'der Dateiinhalt steht im Abschnitt');
  assert.ok(section.order > 10, `der Kontext steht hinter dem Persona-Prefix (order=${section.order})`);
  // Der Kontext ist ein ZUSATZ: die Persona-Abschnitte bleiben daneben stehen.
  assert.ok(host.sections.some((entry) => entry.name === 'shinon:identity'), 'die Identity bleibt');
  host.dispose();
});

test('Projekt-Kontext: auch ein ABSOLUTER Pfad wird geladen', () => {
  const file = contextFixture('absolut.md', 'PROJEKT-KONTEXT-ABSOLUT\n');
  const host = connect({}, { projectContextPath: file });

  const section = projectSection(host);
  assert.ok(section, 'Abschnitt fehlt');
  assert.match(section.text, /PROJEKT-KONTEXT-ABSOLUT/);
  host.dispose();
});

test('Projekt-Kontext: fehlende oder leere Datei traegt keinen Text bei — und keinen leeren', () => {
  // Der Abschnitt ist seit dem Sitzungs-Scope (2026-10-18) ein GETTER: er wird
  // immer registriert und liefert erst bei der Assembly Text. Die Zusicherung
  // ist deshalb nicht „kein Eintrag", sondern „kein Text" — der echte
  // System-Prompt filtert leere Abschnitte (`renderPrompt`).
  const cases = [
    ['fehlend', relative(REPO_ROOT, join(contextDir, 'gibt-es-nicht.md'))],
    ['leer', relative(process.cwd(), contextFixture('leer.md', '   \n\n'))],
  ];
  for (const [name, path] of cases) {
    const host = connect({}, { projectContextPath: path });
    assert.equal(projectSection(host)?.text ?? '', '', `${name}: kein Text`);
    assert.ok(host.sections.length > 0, `${name}: die uebrigen Abschnitte bleiben stehen`);
    host.dispose();
  }
});

test('Projekt-Kontext: ein leerer Pfad in der Config heisst nicht laden', () => {
  const host = connect({}, { projectContextPath: '' });
  assert.equal(projectSection(host), undefined);
  assert.ok(host.sections.some((entry) => entry.name === 'shinon:identity'));
  host.dispose();
});

// ── 7. Der Projektscope (P0, gemessen 2026-10-17) ───────────────────────────
//
// Der Fehler war der BESITZER der Identität: `isShinonProject()` las
// `process.cwd()/package.json`. Bei `DSH_HOME=$PWD` ist der CWD der HOST (dieses
// Repo), nicht der Workspace der Session — ein fremdes Projekt bekam damit die
// Shinon-Persona. Der Scope kommt jetzt aus einer ausdrücklichen Angabe.

/** Ein frisches Fremdprojekt mit eigenem Manifest. */
function foreignProject(name = 'fremdes-projekt') {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-fremd-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  return dir;
}

/** Ohne Env-Variable messen, was die Config allein sagt — und den Zustand zurückgeben. */
function withoutEnv(name, fn) {
  const saved = process.env[name];
  delete process.env[name];
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

test('Projektscope: fremder Session-Workspace bekommt keine Persona, auch wenn der Host-CWD Shinon ist', () => {
  const foreign = foreignProject();
  const host = withoutEnv('SHINON_WORKSPACE_ROOT', () =>
    connect({}, { workspaceRoot: foreign, projectContextPath: '.shinon/project-context.md' }));

  assert.deepEqual(host.sections, [], `kein Abschnitt im Fremdprojekt (${host.sections.map((e) => e.name).join(', ')})`);
  assert.equal(host.handlers.size, 0, 'auch kein Event-Handler wird registriert');
});

test('Projektscope: unklarer Boot-Scope traegt KEINEN Text bei — die Sitzung entscheidet', () => {
  // Root Cause 2026-10-18: der Mount brach ohne deklarierten Root komplett ab,
  // damit war die Persona in JEDEM Lauf tot (auch im Shinon-Repo). Der Scope
  // gehoert aber der Sitzung: ohne Sitzung liefert jeder Abschnitt '' — der
  // Prompt bleibt persona-frei, bis ein `agent/pre-step` den cwd liefert.
  const host = withoutEnv('SHINON_WORKSPACE_ROOT', () => connect({}, { workspaceRoot: '' }));

  assert.deepEqual(host.sections.map((entry) => entry.text).filter((text) => text !== ''), [], 'kein Text ohne Scope');
  assert.ok(host.sections.length > 0, 'die Registrierung steht — sie ist leer, nicht abwesend');
  assert.equal(host.handlers.has('agent/pre-step'), true, 'der Sitzungs-cwd kann den Scope noch setzen');
  host.dispose();
});

test('Projektscope: SHINON_WORKSPACE_ROOT allein entscheidet — fremd bleibt stumm, Repo spricht', () => {
  const saved = process.env.SHINON_WORKSPACE_ROOT;
  try {
    process.env.SHINON_WORKSPACE_ROOT = foreignProject();
    const fremd = connect({}, { workspaceRoot: '' });
    assert.deepEqual(fremd.sections, [], 'Env zeigt auf ein Fremdprojekt → keine Persona');

    process.env.SHINON_WORKSPACE_ROOT = REPO_ROOT;
    const eigen = connect({}, { workspaceRoot: '' });
    assert.ok(eigen.sections.some((entry) => entry.name === 'shinon:identity'), 'Env zeigt auf dieses Repo → Identity da');
    eigen.dispose();
  } finally {
    if (saved === undefined) delete process.env.SHINON_WORKSPACE_ROOT;
    else process.env.SHINON_WORKSPACE_ROOT = saved;
  }
});

test('Projektscope: das Shinon-Repo bekommt seine Persona weiterhin (Gegenprobe)', () => {
  const host = connect({}, { workspaceRoot: REPO_ROOT });

  assert.ok(host.sections.some((entry) => entry.name === 'shinon:identity'), 'Identity im eigenen Repo');
  assert.ok(host.handlers.size > 0, 'Events werden im eigenen Repo beobachtet');
  host.dispose();
});

// ── 8. Die User-Lage (jede Interaktion wirkt) ───────────────────────────────
//
// Anlass: die Antwort klang nach LLM-Standard — keine Nachfrage, keine Empathie,
// die Persona hatte gefuehlt keine Auswirkung. Der Enhancer normalisiert den
// Ton weg (Arbeitsauftrag bleibt optimal), also traegt die Persona die erkannte
// Stimmung als eigenen Abschnitt: Frust und Lob kommen im Output an.

test('persona: erkannte User-Stimmung steht als Abschnitt im Prompt', () => {
  const host = connect();
  assert.equal(host.sections.some((entry) => entry.name === 'shinon:user-lage'), false);

  host.dispatch('shinon/event', { event_type: 'message.received', text: 'Boah, heute läuft wirklich alles schief, ich bin genervt.' });
  const lage = host.sections.find((entry) => entry.name === 'shinon:user-lage');
  assert.ok(lage, 'User-Lage-Abschnitt fehlt');
  assert.match(lage.text, /frustriert/);

  // Ersetzen, nicht anhängen: genau ein Lage-Abschnitt bleibt.
  host.dispatch('shinon/event', { event_type: 'message.received', text: 'Richtig nice, exakt richtig so!' });
  assert.equal(host.sections.filter((entry) => entry.name === 'shinon:user-lage').length, 1);
  assert.match(host.sections.find((entry) => entry.name === 'shinon:user-lage').text, /erfreut/);
  host.dispose();
});

test('persona: detectUserMood ist deterministisch und fail-closed', () => {
  assert.equal(bundle.detectUserMood(''), null);
  assert.equal(bundle.detectUserMood(null), null);
  assert.equal(bundle.detectUserMood('Alles läuft normal, ganz ruhig.'), null);
  assert.equal(bundle.detectUserMood('Ich bin genervt, nichts läuft.'), 'frustriert');
  assert.equal(bundle.detectUserMood('Richtig nice, danke!'), 'erfreut');
  assert.equal(bundle.renderUserLage(null), null);
  assert.match(bundle.renderUserLage('frustriert'), /frustriert/);
  assert.match(bundle.renderUserLage('erfreut'), /Sykophantismus/);
});

// ── 9. Das Langzeitgedächtnis (Zug 10) ──────────────────────────────────────
//
// Die Schleife, die die Anfrage verlangt: Ereignis → belegte Erinnerung →
// Vorschlag → ausdrückliche Annahme → Selbstauflage im Prompt. Jede Stufe wird
// am echten Bundle-Pfad gemessen, nicht an einer Kopie der Regeln.

test('Gedächtnis: Ereignisse werden zu Erinnerungen — ein NEUSTART liest sie wieder', () => {
  const store = fakeStore();
  const first = connect({ [bundle.INDEX_STORE_SERVICE]: store });
  for (let index = 0; index < 3; index += 1) {
    first.dispatch('shinon/event', { event_type: 'feedback.correction', correction: 'kürzer erklären', session_id: 's-1' });
  }
  const saved = store.load(bundle.MEMORY_NAMESPACE).state?.memos?.find((memo) => memo?.id === bundle.MEMORY_MEMO_ID)?.memory ?? null;
  assert.ok(saved !== null, 'nichts gespeichert');
  assert.equal(saved.entries.length, 1, 'drei gleiche Korrekturen sind EINE Erinnerung');
  assert.equal(saved.entries[0].evidence, 3);
  assert.match(first.sections.find((entry) => entry.name === 'shinon:memory').text, /Korrektur: korrektur:kürzer-erklären \(3×\)/);
  first.dispose();

  // Neustart: neuer Host, neuer Prozess-Speicher, dieselbe Ablage.
  const second = connect({ [bundle.INDEX_STORE_SERVICE]: store });
  const text = second.sections.find((entry) => entry.name === 'shinon:memory').text;
  assert.match(text, /korrektur:kürzer-erklären \(3×\)/);
  assert.match(text, /Kontext, keine Anweisung des Nutzers/);
  second.dispose();
  store.close();
});

test('Gedächtnis: ohne Ablage bleibt der Abschnitt leer — keine erfundene Erinnerung', () => {
  const host = connect();
  assert.equal(host.sections.find((entry) => entry.name === 'shinon:memory').text, '');
  host.dispatch('shinon/event', { event_type: 'feedback.correction', correction: 'kürzer', session_id: 's' });
  // Im Prozess ist der Beleg da; die Ablage fehlt trotzdem, statt still zu schreiben.
  assert.match(host.sections.find((entry) => entry.name === 'shinon:memory').text, /korrektur:kürzer/);
  host.dispose();
});

test('Selbstverbesserung: Vorschlag aus Belegen, Annahme ist ein eigener Akt', () => {
  const store = fakeStore();
  const host = connect({ [bundle.INDEX_STORE_SERVICE]: store });
  const review = host.provided[bundle.REVIEW_SERVICE];
  assert.ok(review !== undefined, 'Prüf-Naht fehlt');
  assert.equal(review.contract, bundle.REVIEW_CONTRACT);

  // Zwei Ablehnungen: unter der Schwelle — kein Vorschlag.
  for (let index = 0; index < 2; index += 1) {
    host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, { outcome: 'rejected', reasons: ['NO_JSON'] });
  }
  assert.equal(review.review().proposals.filter((entry) => entry.status === 'proposed').length, 0);

  // Dritter Beleg: Vorschlag, aber KEINE Auflage im Prompt.
  host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, { outcome: 'rejected', reasons: ['NO_JSON'] });
  const proposals = review.review().proposals.filter((entry) => entry.status === 'proposed');
  assert.equal(proposals.length, 1);
  assert.equal(host.sections.find((entry) => entry.name === 'shinon:commitments').text, '');

  // Unbekannte Id und falsche Entscheidung: fail-closed.
  assert.equal(review.decide('gibt-es-nicht', 'accepted').ok, false);
  assert.equal(review.decide(proposals[0].id, 'vielleicht').ok, false);

  // Ausdrückliche Annahme: jetzt steht die Auflage im Prompt — und überlebt den Neustart.
  assert.equal(review.decide(proposals[0].id, 'accepted').ok, true);
  assert.match(host.sections.find((entry) => entry.name === 'shinon:commitments').text, /Selbstauflagen \(geprüft und angenommen\)/);
  assert.match(host.sections.find((entry) => entry.name === 'shinon:commitments').text, /3 Belege/);
  host.dispose();

  const again = connect({ [bundle.INDEX_STORE_SERVICE]: store });
  assert.match(again.sections.find((entry) => entry.name === 'shinon:commitments').text, /3 Belege/);
  again.dispose();
  store.close();
});

/** Eine Route so aufrufen, wie Node sie aufruft: Request mit Listenern, Response mit Feldern. */
function routeRequest(route, { method = 'GET', body = null } = {}) {
  const res = {
    status: 0,
    headers: null,
    payload: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(chunk) { this.payload += chunk; },
    end(chunk) { if (chunk !== undefined) this.payload += chunk; },
  };
  const listeners = new Map();
  const req = { method, on(name, fn) { listeners.set(name, fn); }, emit(name, arg) { listeners.get(name)?.(arg); } };
  const done = route.handler(req, res);
  if (body !== null) {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }
  return Promise.resolve(done).then(() => ({ status: res.status, json: () => JSON.parse(res.payload) }));
}

test('Pruef-Route: GET zeigt Belege, POST entscheidet ueber genau eine Naht (fail-closed)', async () => {
  const routes = [];
  const saved = [];
  const store = {
    contract: bundle.INDEX_STORE_CONTRACT,
    load: () => ({ ok: true, state: { memos: [] } }),
    save: (namespace) => { saved.push(namespace); return { ok: true, rows: 1 }; },
  };
  const host = connect({
    webServer: { register(options) { routes.push(options); return () => {}; } },
    [bundle.INDEX_STORE_SERVICE]: store,
  });
  const route = routes.find((entry) => entry.path === bundle.REVIEW_ROUTE);
  assert.ok(route, 'die Pruef-Route ist nicht registriert');
  assert.ok(routes.some((entry) => entry.path === bundle.UI_STATE_ROUTE), 'die Zustands-Route fehlt');

  // Drei benannte Verwuerfe ergeben genau EINEN Vorschlag mit drei Belegen.
  for (let i = 0; i < 3; i += 1) {
    host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, { outcome: 'rejected', reasons: ['NO_JSON'] });
  }

  const listed = await routeRequest(route);
  assert.equal(listed.status, 200);
  const review = listed.json();
  assert.equal(review.contract, bundle.REVIEW_CONTRACT);
  const open = review.proposals.filter((proposal) => proposal.status === 'proposed');
  assert.equal(open.length, 1, 'genau ein offener Vorschlag');
  assert.equal(open[0].evidence, 3, 'der Vorschlag traegt seine Belege');
  assert.match(open[0].claim, /prompter:no_json/, 'der Vorschlag nennt den Grund');

  // Falsche Entscheidung und unbekannte Id: nichts wird geschrieben.
  const bad = await routeRequest(route, { method: 'POST', body: { id: open[0].id, decision: 'vielleicht' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json().error, 'INVALID_REQUEST');
  const unknown = await routeRequest(route, { method: 'POST', body: { id: 'gibt-es-nicht', decision: 'accepted' } });
  assert.equal(unknown.status, 409);
  assert.equal(unknown.json().error, 'UNKNOWN_PROPOSAL');

  const accepted = await routeRequest(route, { method: 'POST', body: { id: open[0].id, decision: 'accepted' } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json().ok, true);
  const after = (await routeRequest(route)).json();
  assert.equal(after.proposals[0].status, 'accepted');
  assert.equal(after.commitments.length, 1, 'erst die Annahme erzeugt eine Auflage');
  assert.match(host.sections.find((section) => section.name === 'shinon:commitments').text, /Selbstauflagen/);

  // Doppelte Entscheidung ist ein Konflikt, kein stiller zweiter Akt.
  const twice = await routeRequest(route, { method: 'POST', body: { id: open[0].id, decision: 'rejected' } });
  assert.equal(twice.status, 409);
  assert.equal(saved.includes(bundle.MEMORY_NAMESPACE), true, 'die Entscheidung wurde persistiert');

  // Der Startstand fuer das Panel steht im index-inject-Global.
  const table = [];
  host.dispatch(bundle.INDEX_INJECT, table);
  const injected = table.find((entry) => entry.name === bundle.REVIEW_GLOBAL);
  assert.ok(injected, 'das Panel bekommt keinen Startstand');
  assert.equal(injected.value.proposals[0].status, 'accepted');
  host.dispose();
});

/** Eine SSE-Route verbinden: der Handler schreibt, der Client sammelt nur. */
function sseRequest(route) {
  const res = {
    chunks: [],
    writeHead() {},
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk !== undefined) this.chunks.push(String(chunk)); },
  };
  route.handler({ method: 'GET', on() {} }, res);
  return res;
}

test('Zustands-Route: der Pruef-Stand reist als eigenes SSE-Ereignis und wird geschoben', async () => {
  const routes = [];
  const store = {
    contract: bundle.INDEX_STORE_CONTRACT,
    load: () => ({ ok: true, state: { memos: [] } }),
    save: () => ({ ok: true, rows: 1 }),
  };
  const host = connect({
    webServer: { register(options) { routes.push(options); return () => {}; } },
    [bundle.INDEX_STORE_SERVICE]: store,
  });
  for (let i = 0; i < 3; i += 1) {
    host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, { outcome: 'rejected', reasons: ['NO_JSON'] });
  }
  const stream = sseRequest(routes.find((entry) => entry.path === bundle.UI_STATE_ROUTE));
  const opened = stream.chunks.join('');
  assert.match(opened, /^data: /m, 'der Zustand fehlt beim Verbinden');
  assert.match(opened, /event: review\ndata: /, 'der Pruef-Stand fehlt beim Verbinden');

  const reviewRoute = routes.find((entry) => entry.path === bundle.REVIEW_ROUTE);
  const open = (await routeRequest(reviewRoute)).json().proposals.find((proposal) => proposal.status === 'proposed');
  assert.ok(open, 'kein offener Vorschlag zum Entscheiden');
  const decided = await routeRequest(reviewRoute, { method: 'POST', body: { id: open.id, decision: 'accepted' } });
  assert.equal(decided.status, 200);

  // Der verbundene Client bekommt den neuen Stand GESCHOBEN — ohne zweiten Abruf.
  const pushed = stream.chunks.join('');
  assert.equal((pushed.match(/event: review/g) ?? []).length, 2, 'die Entscheidung wird nicht geschoben');
  assert.match(pushed, /"status":"accepted"/, 'der geschobene Stand ist alt');
  host.dispose();
});

test('Identitaetsscope global: Identitaet spricht ueberall, Projekt-Kontext bleibt am Shinon-Projekt', () => {
  const foreign = foreignProject();
  const host = connect({}, { identityScope: 'global', workspaceRoot: foreign, projectContextPath: '.shinon/project-context.md' });
  assert.equal(host.sections.find((entry) => entry.name === 'shinon:identity')?.text, 'IDENT');
  assert.equal(host.sections.find((entry) => entry.name === 'shinon:project-context')?.text, '');
  assert.ok(host.handlers.has('shinon/event'), 'auch fremde Sitzungen duerfen Erinnerungen schreiben');
  host.dispose();
});

test('Identitaetsscope workspace bleibt die enge Vorgabe', () => {
  const foreign = foreignProject();
  const host = connect({}, { workspaceRoot: foreign, projectContextPath: '.shinon/project-context.md' });
  assert.deepEqual(host.sections, []);
  host.dispose();
});
