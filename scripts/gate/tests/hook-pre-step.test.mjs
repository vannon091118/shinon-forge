#!/usr/bin/env node
/**
 * Phase 1 — Abnahmetest des echten DSH-Hooks (@shinon/hook).
 *
 * Die Gate-Bedingung aus dem Implementierungsplan lautet: „Ein Test beweist,
 * dass agent/pre-step tatsächlich durch @shinon/hook läuft und der normale
 * DSH-Ablauf erhalten bleibt."
 *
 * Deshalb wird hier NICHT gegen einen selbstgebauten Fake-Host geprüft, sondern
 * gegen die echten Bausteine der installierten DSH-Version: das Bundle wird über
 * seine echte apply()-Schnittstelle registriert (mit dem ECHTEN Schemastery der
 * DSH-Installation, nicht gestubbt), und der Waterfall läuft über einen echten
 * Cordis-Context — also über dieselbe Mechanik, die
 * @deepseek-ai/dsh-agent-loop für `agent/pre-step` benutzt.
 *
 * Wäre die Waterfall-Semantik falsch verstanden (falscher Rückgabewert, kein
 * next(), doppeltes next()), würden diese Tests fehlschlagen.
 *
 * Aufbau: die Tests sind der Vertrag. Jeder Test benennt eine Zusage und deckt
 * ihre Fälle als Tabelle ab, statt Fälle zu wiederholen.
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
import { codeOnly, findForbidden } from '../../lib/source-scan.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/hook/', import.meta.url));
const INDEX_FILE = join(PACKAGE_DIR, 'index.js');

const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
const require = createRequire(join(root, 'package.json'));

/**
 * Das Bundle isoliert laden: Kopie im Temp-Verzeichnis plus ein
 * node_modules-Eintrag, der das ECHTE Schemastery der DSH-Installation
 * weiterreicht. Die Kopie ist nötig, weil das Repo kein node_modules hat; das
 * echte Schemastery ist nötig, weil die Config-Defaults geprüft werden.
 */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-hook-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  const shim = join(work, 'pkg/node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

const bundle = await loadBundle();
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);

/** Bundle-Ausgaben stumm schalten. */
function quiet(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

/** Vollständige Waterfall-Nutzlast, wie der echte Loop sie fährt. */
const stepPayload = ({ sessionId = 'sess-1', turn = 1, step = 1, messages = [{ role: 'user', content: 'hallo' }] } = {}) => ({
  agent: { session: { id: sessionId } },
  messages,
  turn,
  step,
  signal: new AbortController().signal,
});

/** Der Default-Downstream aus @deepseek-ai/dsh-agent-loop (dieselbe Form). */
const loopDefault = (claimed, context) => () =>
  Promise.resolve({ kind: 'enter', messages: context === undefined ? claimed : [...claimed, context] });

/** Das echte Bundle an einen echten Cordis-Context hängen. */
function connect(config = {}, { breakSink = false } = {}) {
  const ctx = new Context();
  const traces = [];
  ctx.on(bundle.TRACE_CHANNEL, (envelope, step) => traces.push({ envelope, step }));
  if (breakSink) {
    ctx.on(bundle.TRACE_CHANNEL, () => {
      throw new Error('Empfänger kaputt');
    });
  }
  const resolved = bundle.Config(config);
  const dispose = quiet(() => bundle.apply(ctx, resolved));
  return { ctx, traces, config: resolved, dispose };
}

/** Den Waterfall so fahren, wie der Loop ihn fährt. */
const dispatch = (ctx, payload, downstream) => ctx.waterfall(bundle.PRE_STEP_EVENT, payload, downstream);

const claimed = [{ role: 'user', content: 'hallo' }];

// ── Zusage: registriert wird nur, was in observeEvents steht ─────────────────

test('Registrierung: nur der Waterfall-Name in observeEvents hängt den Hook ein', async () => {
  const cases = [
    { name: 'Default', config: {}, registered: true },
    { name: 'explizit genannt', config: { observeEvents: ['agent/pre-step'] }, registered: true },
    { name: 'leere Liste', config: { observeEvents: [] }, registered: false },
    { name: 'nur fremde Events', config: { observeEvents: ['session.created'] }, registered: false },
  ];
  for (const { name, config, registered } of cases) {
    const { ctx, traces, dispose } = connect(config);
    await dispatch(ctx, stepPayload(), loopDefault(claimed, undefined));
    assert.equal(traces.length, registered ? 1 : 0, name);
    dispose();
  }
});

// ── Zusage: der normale DSH-Ablauf bleibt erhalten ───────────────────────────

test('Durchreichen: die Entscheidung des Downstream kommt unverändert zurück', async () => {
  const cases = [
    { name: 'Loop-Default mit Kontext', claimed, context: { role: 'system', content: 'ctx' } },
    { name: 'Loop-Default ohne Kontext', claimed, context: undefined },
    { name: 'leerer Schritt', claimed: [], context: undefined },
  ];
  for (const { name, claimed: admitted, context } of cases) {
    const { ctx, dispose } = connect();
    const expected = { kind: 'enter', messages: context === undefined ? admitted : [...admitted, context] };
    let calls = 0;
    const decision = await dispatch(ctx, stepPayload({ messages: admitted }), () => {
      calls += 1;
      return Promise.resolve(expected);
    });
    assert.equal(calls, 1, `${name}: next() genau einmal`);
    assert.equal(decision, expected, `${name}: die Entscheidung muss identisch sein`);
    dispose();
  }
});

// ── Zusage: jeder Schritt wird korreliert ────────────────────────────────────

test('Korrelation: ein Schritt erzeugt genau einen Datensatz mit allen acht Vertragsfeldern', async () => {
  const { ctx, traces, dispose } = connect({ clock: '2026-10-07T00:00:00.000Z' });
  await dispatch(ctx, stepPayload({ sessionId: 'sess-1', turn: 2, step: 3 }), loopDefault(claimed, undefined));

  assert.equal(traces.length, 1);
  const { envelope, step } = traces[0];
  assert.deepEqual(
    Object.keys(envelope).sort(),
    ['contract', 'event_id', 'event_type', 'payload_ref', 'session_id', 'source', 'timestamp', 'trace_id'],
  );
  assert.deepEqual(
    { ...envelope, event_id: '<id>', payload_ref: '<ref>', trace_id: '<trace>' },
    {
      contract: bundle.CONTRACT,
      event_type: bundle.TRACE_EVENT_TYPE,
      session_id: 'sess-1',
      source: 'dsh',
      timestamp: '2026-10-07T00:00:00.000Z',
      event_id: '<id>',
      payload_ref: '<ref>',
      trace_id: '<trace>',
    },
  );
  assert.match(envelope.event_id, /^evt-[0-9a-f]{12}$/);
  assert.match(envelope.payload_ref, /^pl-[0-9a-f]{12}$/);
  assert.match(envelope.trace_id, /^tr-[0-9a-f]{12}$/);
  assert.deepEqual(step, { session_id: 'sess-1', turn: 2, step: 3, message_count: 1, has_signal: true });
  dispose();
});

/**
 * Regression: Schemastery-Schlüssel sind optional, ein fehlendes Array wird
 * still mit `[]` gefüllt. Ohne `required()` hätte `normalizeEvent({})` deshalb
 * ein Ergebnis geliefert (`{"payload_ref":""}`) statt eines Fehlers — der
 * Contract-Gate hätte einen hohlen Datensatz durchgelassen.
 */
test('Datensatz: ein unvollständiger Envelope wird abgelehnt', () => {
  const full = bundle.buildStepEnvelope(bundle.readStep(stepPayload()), { clock: '2026-10-07T00:00:00.000Z' });
  assert.equal(bundle.normalizeEvent(full).event_type, bundle.TRACE_EVENT_TYPE, 'der vollständige Datensatz passiert');

  const cases = [
    { name: 'leeres Objekt', envelope: {} },
    { name: 'ohne event_id', envelope: { ...full, event_id: undefined } },
    { name: 'ohne session_id', envelope: { ...full, session_id: undefined } },
    { name: 'ohne contract', envelope: { ...full, contract: undefined } },
    { name: 'ohne trace_id', envelope: { ...full, trace_id: undefined } },
    { name: 'leere event_id', envelope: { ...full, event_id: '' } },
    { name: 'unbekannter event_type', envelope: { ...full, event_type: 'gibt.es.nicht' } },
  ];
  for (const { name, envelope } of cases) {
    assert.throws(() => bundle.normalizeEvent(envelope), /Normalisierung fehlgeschlagen/, name);
  }
});

test('Korrelation: die Spur folgt der Schritt-Identität, nicht der Uhr', async () => {
  const { ctx, traces, dispose } = connect({ clock: '2026-10-07T00:00:00.000Z' });
  await dispatch(ctx, stepPayload({ turn: 1, step: 1 }), loopDefault(claimed, undefined));
  await dispatch(ctx, stepPayload({ turn: 1, step: 1 }), loopDefault(claimed, undefined));
  await dispatch(ctx, stepPayload({ turn: 1, step: 2 }), loopDefault(claimed, undefined));
  await dispatch(ctx, stepPayload({ sessionId: 'sess-2', turn: 1, step: 1 }), loopDefault(claimed, undefined));

  const [a, b, c, d] = traces.map((entry) => entry.envelope.trace_id);
  assert.equal(a, b, 'identischer Schritt → identische Spur');
  assert.notEqual(a, c, 'anderer Schritt → andere Spur');
  assert.notEqual(a, d, 'andere Session → andere Spur');
  dispose();
});

// ── Zusage: ablehnen ist eine Entscheidung, kein Fehler ──────────────────────

test('Absage: beide policy-Wege lehnen ab, ohne den Downstream zu starten', async () => {
  const cases = [
    { name: 'verdict=block', config: { verdict: 'block' }, payload: stepPayload(), traces: 1 },
    { name: 'Vertragsverletzung + reject', config: { onContractViolation: 'reject' }, payload: { messages: [] }, traces: 0 },
  ];
  for (const { name, config, payload, traces: expectedTraces } of cases) {
    const { ctx, traces, dispose } = connect(config);
    let calls = 0;
    const decision = await dispatch(ctx, payload, () => {
      calls += 1;
      return Promise.resolve({ kind: 'enter', messages: [] });
    });
    assert.deepEqual(decision, { kind: 'reject' }, name);
    assert.equal(calls, 0, `${name}: eine Absage ruft next() nicht auf`);
    assert.equal(traces.length, expectedTraces, `${name}: nur ein vertragsgemäßer Schritt wird korreliert`);
    dispose();
  }
});

// ── Zusage: die Beobachtung darf den Host nie blockieren ─────────────────────

test('Host-Schutz: kein Fehler im Hook bricht den Schritt', async () => {
  const cases = [
    { name: 'verletzte Nutzlast (Default: pass)', config: {}, payload: { messages: 'kein Array' }, breakSink: false },
    { name: 'werfender Trace-Empfänger', config: {}, payload: stepPayload(), breakSink: true },
  ];
  for (const { name, config, payload, breakSink } of cases) {
    const { ctx, dispose } = connect(config, { breakSink });
    const expected = { kind: 'enter', messages: claimed };
    const decision = await dispatch(ctx, payload, () => Promise.resolve(expected));
    assert.equal(decision, expected, name);
    dispose();
  }
});

// ── Zusage: Lifecycle ───────────────────────────────────────────────────────

test('Lifecycle: dispose meldet ab, ein zweites apply hängt genau einen Listener ein', async () => {
  const { ctx, traces, dispose } = connect({ clock: '2026-10-07T00:00:00.000Z' });
  await dispatch(ctx, stepPayload(), loopDefault(claimed, undefined));
  assert.equal(traces.length, 1);

  dispose();
  const afterDispose = traces.length;
  await dispatch(ctx, stepPayload(), loopDefault(claimed, undefined));
  assert.equal(traces.length, afterDispose, 'nach dispose läuft der Hook nicht mehr');

  const second = quiet(() => bundle.apply(ctx, bundle.Config({ clock: '2026-10-07T00:00:00.000Z' })));
  await dispatch(ctx, stepPayload(), loopDefault(claimed, undefined));
  assert.equal(traces.length, afterDispose + 1, 'kein Doppel-Listener nach dem Neustart');
  second();
});

// ── Zusage: der Nutzlast-Vertrag ist vollständig und benannt ─────────────────

test('Nutzlast: jede fehlende Vertragsangabe wird benannt', () => {
  const signal = new AbortController().signal;
  const cases = [
    { name: 'vollständig', payload: { agent: { session: { id: 's' } }, messages: [], turn: 1, step: 1, signal }, issues: [] },
    { name: 'ohne Session', payload: { agent: { session: {} }, messages: [], turn: 1, step: 1, signal }, issues: ['session_id'] },
    { name: 'ohne turn', payload: { agent: { session: { id: 's' } }, messages: [], step: 1, signal }, issues: ['turn'] },
    { name: 'ohne step', payload: { agent: { session: { id: 's' } }, messages: [], turn: 1, signal }, issues: ['step'] },
    { name: 'messages kein Array', payload: { agent: { session: { id: 's' } }, messages: 'x', turn: 1, step: 1, signal }, issues: ['messages'] },
    { name: 'ohne signal', payload: { agent: { session: { id: 's' } }, messages: [], turn: 1, step: 1 }, issues: ['signal'] },
    { name: 'leere Nutzlast', payload: undefined, issues: ['session_id', 'turn', 'step', 'messages', 'signal'] },
  ];
  for (const { name, payload, issues } of cases) {
    assert.deepEqual(bundle.stepIssues(bundle.readStep(payload)), issues, name);
  }
});

// ── Zusage: Konfiguration ───────────────────────────────────────────────────

test('Konfiguration: die Defaults lassen den normalen Ablauf unangetastet', () => {
  const parsed = bundle.Config({});
  assert.deepEqual(parsed, {
    observeEvents: ['agent/pre-step'],
    verdict: 'allow',
    onContractViolation: 'pass',
    trace: true,
    clock: '',
  });
});

test('Konfiguration: unbekannte Policy-Werte werden schema-seitig abgelehnt', () => {
  const cases = [
    { key: 'verdict', value: 'vielleicht' },
    { key: 'onContractViolation', value: 'vielleicht' },
    { key: 'trace', value: 'vielleicht' },
  ];
  for (const { key, value } of cases) {
    assert.throws(() => bundle.Config({ [key]: value }), new RegExp(key), `${key}=${value}`);
  }
});

/**
 * Regressionstest — der Grund, warum es diesen Test gibt.
 *
 * Vorher stand in der Registrierungsliste `agent.pre-step` (Punkt), während auf
 * `agent/pre-step` (Schrägstrich) registriert wurde. Der Hook lud, loggte
 * „Aktiviert" und hing an nichts: ein stiller No-op, der wie ein Erfolg aussah.
 */
test('Konfiguration: Event-Name und event_type bleiben getrennt', () => {
  assert.equal(bundle.PRE_STEP_EVENT, 'agent/pre-step', 'DSH-Waterfall-Name (Registrierung)');
  assert.equal(bundle.TRACE_EVENT_TYPE, 'agent.pre-step', 'Event-Typ-Konvention des Repos (Datensatz)');
  assert.notEqual(bundle.PRE_STEP_EVENT, bundle.TRACE_EVENT_TYPE, 'eine Verwechslung darf nicht still bleiben');
  assert.ok(
    bundle.Config({}).observeEvents.includes(bundle.PRE_STEP_EVENT),
    'die Registrierungsliste muss den registrierten Namen enthalten, sonst ist der Hook ein No-op',
  );
});

// ── Zusage: Verantwortungsgrenze, statisch geprüft ──────────────────────────

test('Grenze: der Laufzeitcode enthält weder Aktion noch Fremdlogik', () => {
  const source = readFileSync(INDEX_FILE, 'utf8');
  const cases = [
    { name: 'Aktion, Modell, Netz, Prozess', tokens: ['child_process', 'writeFile', 'mkdirSync', 'rmSync', 'unlinkSync', 'execSync', 'spawn(', 'fetch(', 'process.exit', 'Math.random', 'ctx.agents', 'ctx.llm', 'ctx.shell', 'ctx.set('] },
    { name: 'Prompt-, Goal- und Browser-Logik', tokens: ['sqlite', 'persona', 'playwright', 'puppeteer', 'goal', 'system-prompt'] },
  ];
  for (const { name, tokens } of cases) {
    assert.deepEqual(findForbidden(source, tokens, { mode: 'module' }), [], name);
    assert.deepEqual(findForbidden(source, tokens), [], name);
  }
  // Der Code muss auch wirklich registrieren — sonst beweist die Grenze nichts.
  assert.ok(codeOnly(source).includes(`ctx.on(${'PRE_STEP_EVENT'}`), 'kein echter Listener im Laufzeitcode');
  assert.ok(codeOnly(source).includes('return next()'), 'die Entscheidung wird nicht durchgereicht');
});
