#!/usr/bin/env node
/**
 * source-twins.test.mjs — die Beweise zur Zwillings-Regel (scripts/lib/repo.mjs, SOURCE_TWINS).
 *
 * Die Regel sagt: eine Regel, die in zwei Paketen liegen MUSS (weil kein Paket ein
 * anderes importieren darf und jedes Bundle eigenstaendig reist), hat EINEN Besitzer
 * und einen Spiegel — und Drift kann nicht landen. Drei Dinge werden hier gezeigt:
 *
 *   1. Der Baum ist driftfrei: Gate und Build sehen keinen Verstoss.
 *   2. Die Regel FAENGT Drift: eine abweichende Region, eine fehlende Region und ein
 *      fehlendes Literal werden je einzeln gemeldet. Ohne diesen Teil waere die Regel
 *      Prosa — sie sieht nur gut aus, wenn sie auch rot werden kann.
 *   3. An der MODULGRENZE hat sich das Verhalten nicht verschoben: `digest` erzeugt
 *      exakt die unabhaengig nachgerechneten IDs, und der Envelope-Gate-Ausgang ist
 *      der gemessene (sauber -> keine Beanstandung; verfaelschte event_id/payload_ref
 *      -> genau DIGEST_MISMATCH:*). Dieser Teil braucht node_modules (Schemastery) und
 *      wird ohne SICHTBAR uebersprungen, wie die uebrigen DSH-abhaengigen Tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as repo from '../../lib/repo.mjs';

const REPO_ROOT = repo.ROOT;
const regionTwin = repo.SOURCE_TWINS.find((twin) => twin.kind === 'region');
const ruleTwin = repo.SOURCE_TWINS.find((twin) => twin.kind === 'region' && twin !== regionTwin);
const exportTwin = repo.SOURCE_TWINS.find((twin) => (twin.values ?? []).some((value) => value.export !== undefined));
const jsonTwin = repo.SOURCE_TWINS.find((twin) => (twin.values ?? []).some((value) => value.jsonPath !== undefined));

/** Eine Wurzel mit genau den deklarierten Pfaden — mehr braucht twinIssues nicht. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-twin-'));
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    writeFileSync(join(root, relative), text);
  }
  return root;
}

const regionText = (marker, body) => `// #region ${marker}\n${body}\n// #endregion ${marker}\n`;

test('Baum: keine Zwillings-Drift (Gate und Build sehen dasselbe)', () => {
  const issues = repo.twinIssues();
  assert.equal(issues.length, 0, issues.join('; '));
});

test('Regel: eine abweichende Region wird gemeldet', () => {
  const root = fixture({
    [regionTwin.owner]: regionText(regionTwin.marker, 'function digest(text) {\n  return text;\n}'),
    [regionTwin.mirror]: regionText(regionTwin.marker, 'function digest(text) {\n  return String(text);\n}'),
  });
  const issues = repo.twinIssues(root);
  assert.ok(
    issues.some((issue) => issue.includes('ist nicht bytegleich')),
    `Drift muss gemeldet werden: ${issues.join('; ')}`,
  );
});

test('Regel: eine fehlende Region wird gemeldet', () => {
  const root = fixture({
    [ruleTwin.owner]: regionText(ruleTwin.marker, 'function lastHumanMessage() {\n  return null;\n}'),
    [ruleTwin.mirror]: 'export function readObjective() {\n  return null;\n}\n',
  });
  const issues = repo.twinIssues(root);
  assert.ok(
    issues.some((issue) => issue.includes(`Region ${ruleTwin.marker} fehlt in ${ruleTwin.mirror}`)),
    `die fehlende Region muss gemeldet werden: ${issues.join('; ')}`,
  );
});

test('Regel: ein fehlendes Literal wird gemeldet', () => {
  const spec = exportTwin.values.find((value) => value.export !== undefined);
  const root = fixture({
    [exportTwin.owner]: `export const ${spec.export} = 'erfunden';\n`,
    [exportTwin.mirror]: "const ANDERES = 'nichts';\n",
  });
  const issues = repo.twinIssues(root);
  assert.ok(
    issues.some((issue) => issue.includes(`${spec.export}`) && issue.includes('spiegelt')),
    `das fehlende Literal muss gemeldet werden: ${issues.join('; ')}`,
  );
});

test('Regel: eine Zahl des Vertrags muss als Literal im Spiegel stehen', () => {
  const spec = jsonTwin.values.find((value) => value.literal === 'number');
  const key = spec.jsonPath.split('.')[1];
  const root = fixture({
    [jsonTwin.owner]: `${JSON.stringify({ payload: { line: 'L', comment: 'C' }, limits: { [key]: 4711 } }, null, 2)}\n`,
    [jsonTwin.mirror]: "const LINE = 'L';\nconst COMMENT = 'C';\n",
  });
  const issues = repo.twinIssues(root);
  assert.ok(
    issues.some((issue) => issue.includes(spec.jsonPath) && issue.includes('4711')),
    `die fehlende Zahl muss gemeldet werden: ${issues.join('; ')}`,
  );
});

// ── Die Modulgrenze: Verhalten, nicht Text ─────────────────────────────────

const missing = [];
let events = null;
let hook = null;
try {
  events = await import(pathToFileURL(join(REPO_ROOT, 'packages/events/index.js')).href);
  hook = await import(pathToFileURL(join(REPO_ROOT, 'packages/hook/index.js')).href);
} catch (error) {
  missing.push(`Bundles nicht ladbar (${String(error?.message ?? error).split('\n')[0]})`);
}
const skip = missing.length ? `uebersprungen: ${missing.join('; ')}` : false;

/** Kanonisches JSON, unabhaengig vom Bundle: Schluessel rekursiv sortiert. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Erste `length` Hex-Zeichen von sha256 — die Regel, unabhaengig nachgerechnet. */
const shortDigest = (text, length) => createHash('sha256').update(String(text)).digest('hex').slice(0, length);

test('Modulgrenze: digest erzeugt dieselben IDs und das Gate urteilte unveraendert', { skip }, () => {
  const contract = events.loadContract(join(REPO_ROOT, 'packages/events/assets/event-spine.json'));
  const source = contract.events['session.created'].source;
  const payload = { type: 'session/created', session_id: 's1' };
  const sessionId = 's1';
  const timestamp = '2026-10-09T00:00:00.000Z';
  const envelope = events.buildEnvelope(contract, { eventType: 'session.created', source, payload, sessionId, timestamp });

  // Die IDs, unabhaengig nachgerechnet: dieselbe Eingabe, dieselbe Laenge, derselbe Zeichenvorrat.
  const payloadRef = `${contract.derivation.payload_ref.prefix}${shortDigest(canonical(payload), contract.derivation.payload_ref.length)}`;
  const identity = [contract.contract, 'session.created', sessionId, source, timestamp, payloadRef].join('|');
  assert.equal(envelope.payload_ref, payloadRef, 'payload_ref ist die sha256-Kurzform derselben Nutzlast');
  assert.equal(
    envelope.event_id,
    `${contract.derivation.event_id.prefix}${shortDigest(identity, contract.derivation.event_id.length)}`,
    'event_id ist die sha256-Kurzform derselben Identitaet',
  );
  assert.equal(
    envelope.trace_id,
    `${contract.derivation.trace_id.prefix}${shortDigest([sessionId, 'session.created', timestamp].join('|'), contract.derivation.trace_id.length)}`,
    'trace_id bleibt ableitbar',
  );

  // Der Gate-Ausgang: genau die gemessenen Faelle.
  const check = (candidate) => events.validateEnvelope(candidate, { contract, eventType: 'session.created', payload, source });
  assert.deepEqual(check(envelope), [], 'ein sauberer Envelope wird nicht beanstandet');
  assert.deepEqual(
    check({ ...envelope, event_id: `${envelope.event_id.slice(0, -1)}f` }),
    ['DIGEST_MISMATCH:event_id'],
    'eine verfaelschte event_id faellt als DIGEST_MISMATCH:event_id auf',
  );
  assert.deepEqual(
    check({ ...envelope, payload_ref: `${envelope.payload_ref.slice(0, -1)}f` }),
    ['DIGEST_MISMATCH:payload_ref'],
    'eine verfaelschte payload_ref faellt als DIGEST_MISMATCH:payload_ref auf',
  );

  // Die Hook-Haelfte desselben Zwillings: dieselbe Kurzform, dieselben Praefixe.
  const step = { session_id: 's1', turn: 1, step: 2, message_count: 3, has_signal: true };
  const built = hook.buildStepEnvelope(step, { clock: timestamp });
  const hookPayloadRef = `pl-${shortDigest([3, 1, 2].join('|'), 12)}`;
  assert.equal(built.payload_ref, hookPayloadRef, 'der Hook spiegelt die Kurzform der gemeinsamen Regel');
  assert.equal(
    built.event_id,
    `evt-${shortDigest([hook.CONTRACT, hook.TRACE_EVENT_TYPE, 's1', timestamp, hookPayloadRef].join('|'), 12)}`,
    'event_id des Hooks bleibt identisch',
  );
  assert.equal(built.trace_id, `tr-${shortDigest(['s1', 1, 2].join('|'), 12)}`, 'trace_id des Hooks bleibt identisch');
});
