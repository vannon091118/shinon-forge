#!/usr/bin/env node
/**
 * Phase 1 — Abnahmetest des echten DSH-Hooks (@shinon/hook).
 *
 * Die Gate-Bedingung aus dem Implementierungsplan lautet: „Ein Test beweist,
 * dass agent/pre-step tatsächlich durch @shinon/hook läuft und der normale
 * DSH-Ablauf erhalten bleibt."
 *
 * Deshalb wird hier NICHT gegen einen selbstgebauten Fake-Host geprüft, sondern
 * gegen die echten Bausteine der installierten DSH-Version:
 *
 *   - der Listener wird über die echte apply()-Schnittstelle des Pakets
 *     registriert (das Paket wird isoliert geladen, aber mit dem ECHTEN
 *     Schemastery aus der DSH-Installation),
 *   - der Waterfall läuft über einen echten Cordis-Context (`ctx.waterfall`),
 *     also über dieselbe Mechanik, die @deepseek-ai/dsh-agent-loop für
 *     `agent/pre-step` benutzt,
 *   - die Default-Entscheidung des Downstream ist die des echten Loops:
 *     { kind: 'enter', messages: [...] }, und `next()` darf sie nicht verändern.
 *
 * Wäre die Waterfall-Semantik falsch verstanden (falscher Rückgabewert, kein
 * next(), doppeltes next()), würden diese Tests fehlschlagen.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein
 * node_modules im Repo, kein Netz, kein Modell. `dsh` muss im PATH liegen —
 * dieselbe Voraussetzung wie für den Profiltest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { findForbidden } from '../../lib/source-scan.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/hook/', import.meta.url));
const INDEX_FILE = join(PACKAGE_DIR, 'index.js');

const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
const require = createRequire(join(root, 'package.json'));

const CORDIS_FILE = require.resolve('@deepseek-ai/cordis');
const SCHEMASTERY_FILE = require.resolve('@deepseek-ai/schemastery');

/**
 * Das Bundle isoliert laden: Kopie im Temp-Verzeichnis plus ein
 * node_modules-Eintrag, der das ECHTE Schemastery der DSH-Installation
 * weiterreicht. Die Kopie ist nötig, weil das Repo kein node_modules hat; das
 * echte Schemastery ist nötig, weil die Config-Defaults geprüft werden sollen
 * und nicht wegstubbt werden dürfen.
 */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-hook-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  const stub = join(work, 'pkg/node_modules/@deepseek-ai/schemastery');
  mkdirSync(stub, { recursive: true });
  writeFileSync(
    join(stub, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(
    join(stub, 'index.js'),
    `export { default } from ${JSON.stringify(pathToFileURL(SCHEMASTERY_FILE).href)};\n`,
  );
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

const bundle = await loadBundle();
const { Context } = await import(pathToFileURL(CORDIS_FILE).href);

/** Bundle-Ausgaben stumm schalten, Rückgabe trotzdem einsammeln. */
function quiet(fn) {
  const log = console.log;
  const warn = console.warn;
  const error = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
}

/** Vollständige Waterfall-Nutzlast, wie der echte Loop sie fährt. */
function stepPayload({ sessionId = 'sess-1', turn = 1, step = 1, messages = [{ role: 'user', content: 'hallo' }] } = {}) {
  return { agent: { session: { id: sessionId } }, messages, turn, step, signal: new AbortController().signal };
}

/**
 * Das echte Bundle an einen echten Cordis-Context hängen und die
 * Trace-Emission mitzählen.
 */
function connect(config = {}) {
  const ctx = new Context();
  const traces = [];
  // Echter Kanal-Empfänger auf demselben Dispatcher — keine Attrappe.
  ctx.on(bundle.TRACE_CHANNEL, (envelope, step) => traces.push({ envelope, step }));
  // Durch das echte Schema: so wirken in jedem Test die echten Defaults.
  const resolved = bundle.Config(config);
  const dispose = quiet(() => bundle.apply(ctx, resolved));
  return { ctx, traces, dispose, config: resolved };
}

/** Den Waterfall so fahren, wie der Loop ihn fährt (Default-Downstream des Loops). */
function dispatch(ctx, payload, downstream) {
  return ctx.waterfall(bundle.PRE_STEP_EVENT, payload, downstream);
}

/** Der Default-Downstream aus @deepseek-ai/dsh-agent-loop (dieselbe Form). */
function loopDefault(claimed, context) {
  return () => Promise.resolve({ kind: 'enter', messages: context === undefined ? claimed : [...claimed, context] });
}

// ── 1. Registrierung und kontrollierte Weitergabe (die Gate-Bedingung) ────────

test('hook-pre-step: der Hook läuft auf dem echten Waterfall und reicht durch', async () => {
  const { ctx, dispose } = connect();
  const payload = stepPayload();
  let calls = 0;
  const downstream = { kind: 'enter', messages: payload.messages };

  const decision = await dispatch(ctx, payload, () => {
    calls += 1;
    return Promise.resolve(downstream);
  });

  assert.equal(calls, 1, 'next() muss genau einmal aufgerufen werden');
  assert.equal(decision, downstream, 'die Entscheidung muss unverändert (identisch) zurückkommen');
  dispose();
});

test('hook-pre-step: die Default-Entscheidung des echten Loops bleibt erhalten', async () => {
  const { ctx, dispose } = connect();
  const claimed = [{ role: 'user', content: 'hallo' }];
  const context = { role: 'system', content: 'kontext' };
  const expected = { kind: 'enter', messages: [...claimed, context] };

  const decision = await dispatch(ctx, stepPayload({ messages: claimed }), loopDefault(claimed, context));

  assert.deepEqual(decision, expected, 'der Hook darf die Schritt-Messages nicht verändern');
  assert.equal(decision.kind, 'enter');
  assert.equal(decision.messages.length, 2);
  dispose();
});

test('hook-pre-step: ohne Kontext-Nachricht kommt der Schritt unverändert an', async () => {
  const { ctx, dispose } = connect();
  const claimed = [{ role: 'user', content: 'hallo' }];

  const decision = await dispatch(ctx, stepPayload({ messages: claimed }), loopDefault(claimed, undefined));

  assert.deepEqual(decision, { kind: 'enter', messages: claimed });
  dispose();
});

test('hook-pre-step: jeder Schritt wird korreliert und emittiert', async () => {
  const { ctx, traces, dispose } = connect({ clock: '2026-10-07T00:00:00.000Z' });
  const claimed = [{ role: 'user', content: 'hallo' }];

  await dispatch(ctx, stepPayload({ sessionId: 'sess-1', turn: 2, step: 3, messages: claimed }), loopDefault(claimed, undefined));

  assert.equal(traces.length, 1, 'genau ein Trace-Datensatz');
  const { envelope, step } = traces[0];
  assert.deepEqual(Object.keys(envelope).sort(), [...bundle.ENVELOPE_FIELDS].sort());
  assert.equal(envelope.contract, bundle.CONTRACT);
  assert.equal(envelope.event_type, bundle.TRACE_EVENT_TYPE);
  assert.equal(envelope.session_id, 'sess-1');
  assert.equal(envelope.source, 'dsh');
  assert.equal(envelope.timestamp, '2026-10-07T00:00:00.000Z');
  assert.ok(envelope.trace_id.startsWith('tr-'));
  assert.equal(step.turn, 2);
  assert.equal(step.step, 3);
  assert.equal(step.message_count, 1);
  dispose();
});

test('hook-pre-step: derselbe Schritt trägt dieselbe Spur, ein anderer nicht', async () => {
  const { ctx, traces, dispose } = connect({ clock: '2026-10-07T00:00:00.000Z' });
  const claimed = [{ role: 'user', content: 'hallo' }];

  await dispatch(ctx, stepPayload({ turn: 1, step: 1, messages: claimed }), loopDefault(claimed, undefined));
  await dispatch(ctx, stepPayload({ turn: 1, step: 1, messages: claimed }), loopDefault(claimed, undefined));
  await dispatch(ctx, stepPayload({ turn: 1, step: 2, messages: claimed }), loopDefault(claimed, undefined));

  const [first, second, third] = traces.map((entry) => entry.envelope.trace_id);
  assert.equal(first, second, 'identischer Schritt → identische Spur');
  assert.notEqual(first, third, 'anderer Schritt → andere Spur');
  dispose();
});

// ── 2. Deterministische Policy: ablehnen statt durchreichen ──────────────────

test('hook-pre-step: verdict=block lehnt ab, ohne den Downstream zu starten', async () => {
  const { ctx, traces, dispose } = connect({ verdict: 'block' });
  const claimed = [{ role: 'user', content: 'hallo' }];
  let calls = 0;

  const decision = await dispatch(ctx, stepPayload({ messages: claimed }), () => {
    calls += 1;
    return Promise.resolve({ kind: 'enter', messages: claimed });
  });

  assert.deepEqual(decision, { kind: 'reject' });
  assert.equal(calls, 0, 'eine Absage darf next() nicht aufrufen');
  assert.ok(bundle.DECISION_KINDS.includes(decision.kind), 'nur Entscheidungen, die DSH kennt');
  assert.equal(traces.length, 1, 'der abgelehnte Schritt bleibt korreliert');
  dispose();
});

// ── 3. Vertragsverletzung: Host-Schutz vs. fail-closed ───────────────────────

test('hook-pre-step: verletzte Nutzlast wird standardmäßig durchgereicht (Host-Schutz)', async () => {
  const { ctx, traces, dispose } = connect();
  const broken = { messages: 'kein Array' };
  const downstream = { kind: 'enter', messages: [] };

  const decision = await dispatch(ctx, broken, () => Promise.resolve(downstream));

  assert.equal(decision, downstream, 'die Beobachtung darf den Host nie blockieren');
  assert.equal(traces.length, 0, 'fail-closed für den Datensatz: kein Trace aus ungültiger Nutzlast');
  dispose();
});

test('hook-pre-step: onContractViolation=reject kehrt das bewusst um', async () => {
  const { ctx, dispose } = connect({ onContractViolation: 'reject' });
  let calls = 0;

  const decision = await dispatch(ctx, { messages: [] }, () => {
    calls += 1;
    return Promise.resolve({ kind: 'enter', messages: [] });
  });

  assert.deepEqual(decision, { kind: 'reject' });
  assert.equal(calls, 0);
  dispose();
});

test('hook-pre-step: jede Vertragsverletzung wird erkannt', () => {
  const full = bundle.readStep(stepPayload());
  assert.deepEqual(bundle.stepIssues(full), []);

  const cases = [
    ['session_id', { agent: { session: {} }, messages: [], turn: 1, step: 1, signal: new AbortController().signal }],
    ['turn', { agent: { session: { id: 's' } }, messages: [], step: 1, signal: new AbortController().signal }],
    ['step', { agent: { session: { id: 's' } }, messages: [], turn: 1, signal: new AbortController().signal }],
    ['messages', { agent: { session: { id: 's' } }, turn: 1, step: 1, signal: new AbortController().signal }],
    ['signal', { agent: { session: { id: 's' } }, messages: [], turn: 1, step: 1 }],
    ['session_id, turn, step, messages, signal', undefined],
  ];
  for (const [expected, payload] of cases) {
    assert.deepEqual(bundle.stepIssues(bundle.readStep(payload)), expected.split(', '), `Feld ${expected}`);
  }
});

// ── 4. Lifecycle: Dispose, Neustart, Fehlerisolation ─────────────────────────

test('hook-pre-step: nach dispose läuft der Hook nicht mehr', async () => {
  const { ctx, dispose } = connect();
  dispose();

  const downstream = { kind: 'enter', messages: [] };
  const decision = await dispatch(ctx, stepPayload(), () => Promise.resolve(downstream));

  assert.equal(decision, downstream, 'ohne Listener ist der Waterfall der reine Durchlauf');
});

test('hook-pre-step: Neustart nach dispose registriert genau einen Listener', async () => {
  const ctx = new Context();
  const traces = [];
  ctx.on(bundle.TRACE_CHANNEL, (envelope) => traces.push(envelope));

  const first = quiet(() => bundle.apply(ctx, bundle.Config({})));
  first();
  const second = quiet(() => bundle.apply(ctx, bundle.Config({ clock: '2026-10-07T00:00:00.000Z' })));
  const claimed = [{ role: 'user', content: 'hallo' }];
  await dispatch(ctx, stepPayload({ messages: claimed }), loopDefault(claimed, undefined));
  second();

  assert.equal(traces.length, 1, 'kein doppelter Listener nach dem Neustart');
});

test('hook-pre-step: eine werfende Emission bricht den Schritt nicht', async () => {
  const { ctx, dispose } = connect();
  const claimed = [{ role: 'user', content: 'hallo' }];
  // Ein fehlerhafter Empfänger am Trace-Kanal darf den Harness nicht treffen.
  ctx.on(bundle.TRACE_CHANNEL, () => {
    throw new Error('Empfänger kaputt');
  });
  const downstream = { kind: 'enter', messages: claimed };

  const decision = await dispatch(ctx, stepPayload({ messages: claimed }), () => Promise.resolve(downstream));

  assert.equal(decision, downstream, 'Fail-open für den Host gilt auch bei Fehlern in der Korrelation');
  dispose();
});

test('hook-pre-step: preStepEnabled=false registriert bewusst nichts', async () => {
  const { ctx, dispose } = connect({ preStepEnabled: false });
  const downstream = { kind: 'enter', messages: [] };

  const decision = await dispatch(ctx, stepPayload(), () => Promise.resolve(downstream));

  assert.equal(decision, downstream);
  dispose();
});

test('hook-pre-step: ohne agent.pre-step in observeEvents wird nicht registriert', async () => {
  const { ctx, dispose } = connect({ observeEvents: ['session.created'] });
  const downstream = { kind: 'enter', messages: [] };

  const decision = await dispatch(ctx, stepPayload(), () => Promise.resolve(downstream));

  assert.equal(decision, downstream);
  dispose();
});

test('hook-pre-step: fehlende Registrierungsfläche wird gemeldet, nicht verschwiegen', () => {
  let reported = false;
  const original = console.error;
  console.error = (line) => {
    if (String(line).includes('ctx.on fehlt')) reported = true;
  };
  try {
    const dispose = bundle.apply({}, bundle.Config({}));
    assert.equal(typeof dispose, 'function');
  } finally {
    console.error = original;
  }
  assert.ok(reported, 'Regel C: ein fehlender Hook-Punkt ist ein Befund, kein stiller Ausfall');
});

// ── 5. Konfiguration (echtes Schemastery, echte Defaults) ────────────────────

test('hook-pre-step: die Config-Defaults erhalten den normalen DSH-Ablauf', () => {
  const parsed = bundle.Config({});
  assert.equal(parsed.verdict, 'allow', 'Default darf den Schritt nicht ablehnen');
  assert.equal(parsed.onContractViolation, 'pass', 'Default schützt den Host');
  assert.equal(parsed.preStepEnabled, true);
  assert.equal(parsed.trace, true);
  assert.ok(parsed.observeEvents.includes(bundle.PRE_STEP_EVENT), 'agent.pre-step muss beobachtet werden');
  assert.equal(parsed.clock, '');
});

test('hook-pre-step: eine unbekannte Policy wird schema-seitig abgelehnt', () => {
  assert.throws(() => bundle.Config({ verdict: 'vielleicht' }), /verdict/);
  assert.throws(() => bundle.Config({ onContractViolation: 'vielleicht' }), /onContractViolation/);
});

/**
 * Regressionstest: dieser Fehler ist der Grund, warum es diesen Test gibt.
 *
 * Vorher stand in der Registrierungsliste `agent.pre-step` (Punkt), während
 * registriert wurde auf `agent/pre-step` (Schrägstrich). Der Hook war damit
 * still ein No-op: er lud, loggte "Aktiviert", und hing an nichts. Der Test
 * pinnt beide Namen und ihre Nicht-Gleichheit.
 */
test('hook-pre-step: Event-Name und event_type sind getrennt und beide richtig', () => {
  assert.equal(bundle.PRE_STEP_EVENT, 'agent/pre-step', 'DSH-Waterfall-Name (Registrierung)');
  assert.equal(bundle.TRACE_EVENT_TYPE, 'agent.pre-step', 'Event-Typ-Konvention des Repos (Datensatz)');
  assert.notEqual(bundle.PRE_STEP_EVENT, bundle.TRACE_EVENT_TYPE, 'eine Verwechslung darf nicht still bleiben');

  const registered = bundle.Config({});
  assert.ok(
    registered.observeEvents.includes(bundle.PRE_STEP_EVENT),
    'die Registrierungsliste muss den registrierten Namen enthalten, sonst ist der Hook ein No-op',
  );

  const envelope = bundle.buildStepEnvelope(bundle.readStep(stepPayload()), { clock: '2026-10-07T00:00:00.000Z' });
  assert.equal(envelope.event_type, bundle.TRACE_EVENT_TYPE);
  assert.ok(envelope.event_id.startsWith('evt-'), 'der Datensatz muss vom Schema akzeptiert werden');
});

// ── 6. Verantwortungsgrenze: registrieren ja, handeln nein ───────────────────

test('hook-pre-step: der Laufzeitcode enthält keine Aktion, kein Modell, kein Netz', () => {
  const source = readFileSync(INDEX_FILE, 'utf8');
  const forbidden = ['child_process', 'writeFile', 'mkdirSync', 'rmSync', 'unlinkSync', 'execSync', 'spawn(', 'fetch(', 'process.exit', 'Math.random', 'ctx.agents', 'ctx.llm', 'ctx.shell', 'ctx.set('];
  assert.deepEqual(findForbidden(source, forbidden, { mode: 'module' }), []);
  assert.deepEqual(findForbidden(source, forbidden), []);
});

test('hook-pre-step: der Laufzeitcode bleibt frei von Prompt-, Goal- und Browser-Logik', () => {
  const source = readFileSync(INDEX_FILE, 'utf8');
  const outOfScope = ['sqlite', 'persona', 'playwright', 'puppeteer', 'goal', 'system-prompt'];
  assert.deepEqual(findForbidden(source, outOfScope), [], 'Phase 1 ist der Entry-Point, nicht die Runtime-Schicht');
});
