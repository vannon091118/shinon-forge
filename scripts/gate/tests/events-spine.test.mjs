#!/usr/bin/env node
/**
 * Tests des Hook/Event-Spines (Wave 2).
 *
 * Zwei Ebenen, bewusst getrennt:
 *   1. Contract-Gate (reine Funktionen): Vertrag, Fixture, Nicht-Aktions-Grenze.
 *   2. Replay des ECHTEN Bundles: das Paket wird in ein temporäres Verzeichnis
 *      kopiert, mit einem Schemastery-Stub versehen (die einzige peer-Dependency,
 *      die hier nicht installiert ist) und über seine echte apply()-Schnittstelle
 *      gefahren. Die Fixture ist das Orakel: derselbe Event-Pfad muss dieselben
 *      Envelopes ergeben.
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
  ENVELOPE_FIELDS,
  EVENT_TYPES,
  DROP_REASONS,
  contractIssues,
  fixtureIssues,
  staticIssues,
} from '../plugins/events-spine.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/events/', import.meta.url));
const ASSET_FILE = join(PACKAGE_DIR, 'assets/event-spine.json');
const FIXTURE_FILE = join(PACKAGE_DIR, 'assets/replay/session-created.json');

const asset = JSON.parse(readFileSync(ASSET_FILE, 'utf8'));
const fixture = JSON.parse(readFileSync(FIXTURE_FILE, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Bundle isoliert laden: Kopie + Schemastery-Stub (nur Config-Konstruktion). */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-events-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  const stub = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-stub', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(stub, 'index.js'), 'const p = new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : p), apply: () => p, construct: () => p });\nexport default p;\n');
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

/** Bundle-Ausgaben stumm schalten, Rückgabe trotzdem einsammeln. */
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

const bundle = await loadBundle();

/** Spine über die echte apply()-Schnittstelle an einen Fake-Host hängen. */
function connect() {
  const emitted = [];
  const handlers = new Map();
  const ctx = {
    on(name, handler) {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    emit(channel, envelope, payload) {
      emitted.push({ channel, envelope, payload });
    },
  };
  const dispose = quiet(() =>
    bundle.apply(ctx, {
      schemaPath: './assets/event-spine.json',
      replayPath: './assets/replay/session-created.json',
      emitChannel: 'shinon/event',
      defaultSessionId: '',
      clock: fixture.clock,
    })
  );
  const dispatch = (signal, payload) => {
    const handler = handlers.get(signal);
    if (handler) quiet(() => handler(payload));
    return handler !== undefined;
  };
  /**
   * Wie dispatch, aber OHNE Stummschaltung. Nötig, weil "still ignoriert"
   * gerade bedeutet, dass nichts auf der Konsole steht — das kann man nur
   * prüfen, wenn man die Konsole sieht.
   */
  const dispatchLoud = (signal, payload) => {
    const handler = handlers.get(signal);
    if (handler) handler(payload);
    return handler !== undefined;
  };
  return { emitted, handlers, dispose, dispatch, dispatchLoud };
}

// ── 1. Contract-Gate: Vertrag ────────────────────────────────────────────────

test('events-spine: der echte Vertrag ist fehlerfrei', () => {
  assert.deepEqual(contractIssues(asset, 'event-spine.json'), []);
  assert.equal(asset.envelope.length, ENVELOPE_FIELDS.length);
  assert.deepEqual(Object.keys(asset.events).sort(), [...EVENT_TYPES].sort());
});

test('events-spine: fehlender Event-Typ wird gemeldet', () => {
  const broken = clone(asset);
  delete broken.events['gate.failed'];
  assert.ok(contractIssues(broken, 'x.json').some((issue) => issue.includes('gate.failed')));
});

test('events-spine: authority ist Pflicht und muss NONE sein', () => {
  assert.ok(contractIssues({ ...clone(asset), authority: 'FULL' }, 'x.json')[0].includes('authority'));
  const broken = clone(asset);
  delete broken.authority;
  assert.ok(contractIssues(broken, 'x.json').some((issue) => issue.includes('authority')));
});

test('events-spine: unvollständiger Envelope wird gemeldet', () => {
  const broken = clone(asset);
  broken.envelope = broken.envelope.filter((field) => field !== 'trace_id');
  assert.ok(contractIssues(broken, 'x.json').some((issue) => issue.includes('trace_id')));
});

test('events-spine: unbekannter Event-Typ und toter Signalpfad werden gemeldet', () => {
  const extra = clone(asset);
  extra.events['mood.changed'] = { source: 'shinon.persona', phase: 'state', payload: ['session_id'] };
  assert.ok(contractIssues(extra, 'x.json').some((issue) => issue.includes('unbekannter Event-Typ mood.changed')));

  // `tool.completed` ist über Tool/call-Wege und das Signal erreichbar. Der
  // Test löscht ALLE Wege, die auf diesen Typ zeigen, statt einen bestimmten
  // anzunehmen: welche Carrier-Namen auf einen Typ zeigen, ist Vertragsdaten
  // und hat sich schon einmal geändert.
  const orphan = clone(asset);
  delete orphan.signals['shinon/tool/completed'];
  for (const [raw, type] of Object.entries(orphan.carrier.typeMap)) {
    if (type === 'tool.completed') delete orphan.carrier.typeMap[raw];
  }
  const issues = contractIssues(orphan, 'x.json');
  assert.ok(issues.some((issue) => issue.includes('ohne Signal/Carrier-Pfad: tool.completed')));
  const uncovered = issues.filter((issue) => issue.includes('ohne Signal/Carrier-Pfad'));
  assert.equal(uncovered.length, 1, 'nur tool.completed darf unerreichbar sein');
});

test('events-spine: eine Zuordnung ohne Beleg und ein Beleg ohne Zuordnung werden gemeldet', () => {
  // Der Spiegel, der die vier erfundenen Aliase hätte fangen müssen: sie standen
  // in der typeMap und in verifiedTypes fehlten sie — verglichen wurde nie.
  const unverified = clone(asset);
  unverified.carrier.verifiedTypes = unverified.carrier.verifiedTypes.filter((raw) => raw !== 'tool/call');
  assert.ok(contractIssues(unverified, 'x.json').some((issue) => issue.includes('carrier.typeMap.tool/call ist in carrier.verifiedTypes nicht belegt')));

  const phantom = clone(asset);
  phantom.carrier.verifiedTypes.push('message.created');
  assert.ok(contractIssues(phantom, 'x.json').some((issue) => issue.includes('carrier.verifiedTypes nennt message.created')));
});

test('events-spine: ein Typ darf nicht zugleich abgebildet und ignoriert sein', () => {
  const both = clone(asset);
  both.carrier.ignoredTypes.push('tool/call');
  assert.ok(contractIssues(both, 'x.json').some((issue) => issue.includes('entweder abgebildet oder ignoriert')));

  const missing = clone(asset);
  delete missing.carrier.ignoredTypes;
  assert.ok(contractIssues(missing, 'x.json').some((issue) => issue.includes('carrier.ignoredTypes fehlt')));
});

test('events-spine: forbidden muss die Nicht-Aktions-Grenze nennen', () => {
  const broken = clone(asset);
  broken.forbidden = ['decision'];
  assert.ok(contractIssues(broken, 'x.json').some((issue) => issue.includes('autonomous_action')));
});

// ── 2. Contract-Gate: Fixture ────────────────────────────────────────────────

test('events-spine: die echte Fixture ist fehlerfrei und deckt alle Typen', () => {
  assert.deepEqual(fixtureIssues(fixture, asset, 'fixture.json'), []);
  assert.equal(fixture.steps.length, EVENT_TYPES.length);
  assert.ok(fixture.ignored.length >= 3, 'zu wenige stille Fälle');
  assert.ok(fixture.ignored.every((step) => asset.carrier.ignoredTypes.includes(step.payload.type)));
  assert.ok(fixture.invalid.length >= 3, 'zu wenige Verwerfungsfälle');
  assert.ok(fixture.invalid.every((step) => DROP_REASONS.includes(step.reason)));
  for (const reason of ['UNKNOWN_SIGNAL', 'MISSING_SESSION_ID', 'MISSING_PAYLOAD_KEY']) {
    assert.ok(fixture.invalid.some((step) => step.reason === reason), `Verwerfungsfall ${reason} fehlt`);
  }
});

test('events-spine: Fixture mit unbekanntem Signal wird gemeldet', () => {
  const broken = clone(fixture);
  broken.steps[0].signal = 'shinon/nicht/vorhanden';
  assert.ok(fixtureIssues(broken, asset, 'x.json').some((issue) => issue.includes('unbekanntes Signal')));
});

test('events-spine: Fixture mit unvollständigem expect wird gemeldet', () => {
  const broken = clone(fixture);
  delete broken.steps[1].expect.trace_id;
  assert.ok(fixtureIssues(broken, asset, 'x.json').some((issue) => issue.includes('expect.trace_id')));
});

test('events-spine: Fixture ohne Verwerfungsfall wird gemeldet', () => {
  const broken = clone(fixture);
  broken.invalid = [];
  assert.ok(fixtureIssues(broken, asset, 'x.json').some((issue) => issue.includes('invalid')));
});

test('events-spine: eine Fixture, die einen nicht benannten Typ ignoriert, wird gemeldet', () => {
  const broken = clone(fixture);
  broken.ignored[0].payload.type = 'tool/gibt-es-nicht';
  assert.ok(fixtureIssues(broken, asset, 'x.json').some((issue) => issue.includes('steht nicht in carrier.ignoredTypes')));

  const withoutSection = clone(fixture);
  delete withoutSection.ignored;
  assert.ok(fixtureIssues(withoutSection, asset, 'x.json').some((issue) => issue.includes('ignored fehlt')));
});

test('events-spine: unbekannter Verwerfungsgrund wird gemeldet', () => {
  const broken = clone(fixture);
  broken.invalid[0].reason = 'PASSIERT_SCHON';
  assert.ok(fixtureIssues(broken, asset, 'x.json').some((issue) => issue.includes('Verwerfungsgrund')));
});

// ── 3. Nicht-Aktions-Grenze ──────────────────────────────────────────────────

test('events-spine: der echte Laufzeitcode enthält keine autonome Aktion', () => {
  const source = readFileSync(join(PACKAGE_DIR, 'index.js'), 'utf8');
  assert.deepEqual(staticIssues(source, 'index.js'), []);
});

test('events-spine: ein Schreib-/Ausführungsaufruf im Spine wird erkannt', () => {
  const source = readFileSync(join(PACKAGE_DIR, 'index.js'), 'utf8');
  assert.ok(staticIssues(`${source}\nwriteFileSync('/tmp/x', 'y');`, 'index.js').some((issue) => issue.includes('writeFileSync')));
  assert.ok(staticIssues(`${source}\nexecSync('rm -rf /');`, 'index.js').some((issue) => issue.includes('execSync')));
});

test('events-spine: ein Envelope-Feld, das im Code fehlt, wird erkannt', () => {
  const source = readFileSync(join(PACKAGE_DIR, 'index.js'), 'utf8').replaceAll('payload_ref', 'ref');
  assert.ok(staticIssues(source, 'index.js').some((issue) => issue.includes('payload_ref')));
});

// ── 4. Replay des echten Bundles ─────────────────────────────────────────────

test('events-spine: die Fixture wird envelopegleich reproduziert', () => {
  const { emitted, dispatch, dispose } = connect();
  for (const step of fixture.steps) assert.ok(dispatch(step.signal, step.payload), `kein Handler für ${step.signal}`);
  assert.equal(emitted.length, fixture.steps.length);
  for (const [index, step] of fixture.steps.entries()) {
    assert.deepEqual(emitted[index].envelope, step.expect, `Envelope ${index + 1} (${step.signal}) weicht ab`);
    assert.equal(emitted[index].channel, 'shinon/event');
  }
  dispose();
});

test('events-spine: zwei Durchläufe ergeben identische Envelopes', () => {
  const run = () => {
    const { emitted, dispatch, dispose } = connect();
    for (const step of fixture.steps) dispatch(step.signal, step.payload);
    dispose();
    return emitted.map((entry) => entry.envelope);
  };
  assert.deepEqual(run(), run());
});

test('events-spine: jedes Event trägt die acht Felder und den Vertragsnamen', () => {
  const { emitted, dispatch, dispose } = connect();
  for (const step of fixture.steps) dispatch(step.signal, step.payload);
  for (const { envelope } of emitted) {
    assert.deepEqual(Object.keys(envelope).sort(), [...ENVELOPE_FIELDS].sort());
    assert.equal(envelope.contract, asset.contract);
    assert.equal(envelope.timestamp, fixture.clock);
    for (const field of ENVELOPE_FIELDS) assert.ok(envelope[field].length > 0, `${field} ist leer`);
  }
  dispose();
});

test('events-spine: ungültige Events werden fail-closed verworfen', () => {
  const { emitted, dispatch, dispose } = connect();
  for (const step of fixture.invalid) dispatch(step.signal, step.payload);
  assert.equal(emitted.length, 0, 'ungültige Events wurden emittiert');
  dispose();
});

test('events-spine: fehlende Session und manipulierter Digest werden verworfen', () => {
  const { emitted, dispatch, dispose } = connect();
  dispatch('shinon/session/created', { cwd: '/repo' });
  dispatch('shinon/session/created', { session_id: '   ' });
  assert.equal(emitted.length, 0);
  dispose();
});

test('events-spine: ein benannter Ignorier-Typ wird still verworfen — kein Ereignis, keine Warnung', () => {
  // Das ist die Zusage, die im Live-Lauf gefehlt hat: DSH emittiert Dutzende
  // Typen, die niemand abbilden will. Als UNKNOWN_SIGNAL fluteten sie die
  // Konsole; ignoriert sind sie still — aber sie bleiben gezählt.
  const { emitted, dispatchLoud, dispose } = connect();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    for (const step of fixture.ignored) assert.ok(dispatchLoud(step.signal, step.payload), `kein Handler für ${step.signal}`);
  } finally {
    console.warn = originalWarn;
  }
  dispose();
  assert.equal(emitted.length, 0, 'ein ignorierter Typ darf nicht emittieren');
  assert.deepEqual(warnings.filter((line) => line.includes('verworfen')), [], 'ein ignorierter Typ darf nicht warnen');
});

test('events-spine: ein NICHT benannter Carrier-Typ warnt weiter (fail-loud für Neues)', () => {
  const { emitted, dispatchLoud, dispose } = connect();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    dispatchLoud('session/event', { type: 'brandneuer/typ', session_id: 'sess-1' });
  } finally {
    console.warn = originalWarn;
  }
  dispose();
  assert.equal(emitted.length, 0);
  assert.ok(
    warnings.some((line) => line.includes('UNKNOWN_SIGNAL')),
    `ein unbekannter Typ muss warnen, Ausgabe war: ${JSON.stringify(warnings)}`,
  );
});

test('events-spine: unbekanntes Signal hat keinen Handler und wirft nicht', () => {
  const { emitted, dispatch, dispose } = connect();
  assert.equal(dispatch('shinon/gibt/es/nicht', { session_id: 'sess-1' }), false);
  assert.equal(emitted.length, 0);
  dispose();
});

test('events-spine: Neustart nach dispose hinterlässt keine Handler', () => {
  const first = connect();
  assert.equal(first.handlers.size, Object.keys(asset.signals).length + 1);
  first.dispose();
  assert.equal(first.handlers.size, 0);

  const second = connect();
  for (const step of fixture.steps) second.dispatch(step.signal, step.payload);
  assert.equal(second.emitted.length, fixture.steps.length);
  second.dispose();
});
