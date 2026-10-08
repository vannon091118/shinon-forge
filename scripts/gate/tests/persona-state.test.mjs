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
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  EVENT_TYPES as SPINE_EVENTS,
} from '../plugins/events-spine.mjs';
import {
  PERSONA_EVENT_TYPES,
  STATE_FIELDS,
  stateContractIssues,
  staticIssues,
} from '../plugins/persona.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/persona/', import.meta.url));
const ASSET_FILE = join(PACKAGE_DIR, 'assets/persona-state.json');

const contract = JSON.parse(readFileSync(ASSET_FILE, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Bundle isoliert laden: Kopie + Schemastery-Stub (nur Config-Konstruktion). */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-persona-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
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
function createHost() {
  const handlers = new Map();
  const sections = [];
  const calls = [];
  const child = {
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
        const entry = { name, order, text };
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
    inject(services, callback) {
      calls.push(`inject:${services.join(',')}`);
      callback(child);
    },
  };
  const dispatch = (channel, payload) => {
    const handler = handlers.get(channel);
    if (handler) handler(payload);
    return handler !== undefined;
  };
  const stateSection = () => sections.find((entry) => entry.name === 'shinon:state');
  const stateOf = () => bundle.stateFromContext(stateSection()?.text ?? '');
  return { ctx, handlers, sections, calls, dispatch, stateSection, stateOf };
}

function quiet(fn) {
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

const connect = () =>
  quiet(() => {
    const host = createHost();
    const dispose = bundle.apply(host.ctx, {
      statePath: './assets/persona-state.json',
      eventsChannel: 'shinon/event',
      includeAugenhoehe: true,
      identity: 'IDENT',
      epistemic: 'EPI',
      changeClasses: 'CC',
      determinism: 'DET',
      discipline: 'DISC',
      report: 'REP',
    });
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
  // Teilmenge, nicht Gleichheit: der Spine spricht vierzehn Typen, die Persona
  // neun. Ein Typ, den die Persona einführt und der Spine nicht kennt, wäre eine
  // zweite Sprache — und muss rot sein.
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
  });
});

test('persona: jeder der neun Übergänge ergibt den dokumentierten Zustand', () => {
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

test('persona: der Kontext trägt genau die sechs Felder plus Stimme', () => {
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
  });
  host.dispose();
});

test('persona: ein Event auf dem Spine-Kanal aktualisiert den System-Context', () => {
  const host = connect();
  assert.equal(host.sections.length, 8);
  assert.ok(host.dispatch('shinon/event', { event_type: 'gate.failed', session_id: 'sess-1' }));
  assert.equal(host.stateOf().mood, 'concerned');
  assert.deepEqual(host.stateOf().limitations, ['gate_failed']);
  // Ersetzen, nicht anhängen: genau ein Zustandsabschnitt bleibt.
  assert.equal(host.sections.filter((entry) => entry.name === 'shinon:state').length, 1);
  assert.equal(host.sections.length, 8);

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

test('persona: der Fake-Host kennt nur on und inject — nichts anderes wurde benutzt', () => {
  const host = connect();
  assert.deepEqual(Object.keys(host.ctx).sort(), ['inject', 'on']);
  for (const call of host.calls) {
    assert.ok(/^(on|inject|effect|getSectionOrder|section):?/.test(call), `unerwarteter Aufruf: ${call}`);
  }
  assert.ok(host.calls.includes('on:shinon/event'));
  assert.ok(host.calls.some((call) => call === 'inject:systemPrompt'));
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
