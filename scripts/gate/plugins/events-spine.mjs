/**
 * events-spine — Contract-Gate des Hook/Event-Spines (Wave 2).
 *
 * Der Spine beobachtet, normalisiert, validiert und emittiert. Dieses Gate
 * prüft genau diese vier Zusagen — und die fünfte, wichtigere: dass er NICHTS
 * anderes tut.
 *
 * Geprüft wird:
 *   1. Vertrag (assets/event-spine.json): Envelope, neun Event-Typen, Quellen,
 *      Pflicht-Nutzlast, Signal-/Carrier-Abdeckung, authority NONE.
 *   2. Replay-Fixture: jeder Schritt zeigt auf ein bekanntes Signal, jede
 *      Erwartung trägt den vollständigen Envelope; Verwerfungsgründe sind
 *      bekannte Codes (fail-closed dokumentiert).
 *   3. Laufzeitgrenze (index.js): beobachtet (ctx.on), emittiert (ctx.emit),
 *      enthält die Envelope-Felder — und keinen einzigen Aktions-/Schreib-/
 *      Modell-/Netzaufruf (Nicht-Autonomie ist statisch geprüft, nicht nur
 *      behauptet).
 *   4. Aktivierung: das Profil muss das Bundle laden, sonst ist der Spine toter
 *      Text (dieselbe Regel wie beim Persona-Gate).
 *
 * Die reinen Funktionen sind ohne node_modules testbar; die Tests liegen in
 * scripts/gate/tests/events-spine.test.mjs und fahren zusätzlich das echte
 * Bundle gegen die Fixture.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findForbidden, findMissing } from '../../lib/source-scan.mjs';

export const id = 'events-spine';

/** Die acht Pflichtfelder des Envelopes — Reihenfolge ist Vertrag. */
export const ENVELOPE_FIELDS = [
  'event_id',
  'event_type',
  'session_id',
  'source',
  'timestamp',
  'payload_ref',
  'contract',
  'trace_id',
];

/** Die neun initialen Event-Typen aus Wave 2. */
export const EVENT_TYPES = [
  'session.created',
  'message.received',
  'message.completed',
  'claim.created',
  'tool.requested',
  'tool.completed',
  'gate.passed',
  'gate.failed',
  'action.blocked',
];

/** Verwerfungsgründe der Laufzeit — nur diese Codes darf die Fixture nennen. */
export const DROP_REASONS = [
  'UNKNOWN_SIGNAL',
  'UNKNOWN_EVENT_TYPE',
  'MISSING_SESSION_ID',
  'MISSING_PAYLOAD_KEY',
  'ENVELOPE_FIELD',
  'ENVELOPE_UNKNOWN_FIELD',
  'CONTRACT_MISMATCH',
  'SOURCE_MISMATCH',
  'DIGEST_MISMATCH',
];

/**
 * Was der Spine nicht darf. Diese Token dürfen in index.js nicht vorkommen:
 * eine Beobachtung, die schreibt, ausführt, Modelle ruft oder den Host beendet,
 * ist kein Spine mehr. `readFileSync` ist bewusst erlaubt (Vertrag lesen).
 */
export const FORBIDDEN_MODULES = ['child_process'];

export const FORBIDDEN_TOKENS = [
  'execSync',
  'spawn(',
  'writeFile',
  'writeFileSync',
  'mkdirSync',
  'rmSync',
  'unlinkSync',
  'fetch(',
  'http.request',
  'Math.random',
  'process.exit',
  'ctx.agents',
  'ctx.llm',
  'ctx.shell',
  'ctx.set(',
];

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const known = (set) => (value) => set.includes(value);

/** Vertrag prüfen: Envelope, Event-Typen, Quellen, Signale, Carrier, Autorität. */
export function contractIssues(asset, file) {
  const issues = [];
  if (typeof asset !== 'object' || asset === null) return [`${file}: kein Objekt`];

  if (!isText(asset.contract)) issues.push(`${file}: contract fehlt`);
  if (asset.authority !== 'NONE') issues.push(`${file}: authority muss "NONE" sein (ist ${JSON.stringify(asset.authority)})`);
  if (asset.version !== 1) issues.push(`${file}: version muss 1 sein`);

  if (!Array.isArray(asset.envelope)) {
    issues.push(`${file}: envelope fehlt`);
  } else {
    // Erst benennen, was fehlt — dann die Länge. Ein Gate, das nur „8 erwartet" sagt,
    // lässt den Leser raten, welches Feld gemeint ist.
    const missing = ENVELOPE_FIELDS.filter((field) => !asset.envelope.includes(field));
    const extra = asset.envelope.filter((field) => !ENVELOPE_FIELDS.includes(field));
    if (missing.length) issues.push(`${file}: envelope ohne ${missing.join(', ')}`);
    if (extra.length) issues.push(`${file}: envelope mit unbekannten Feldern ${extra.join(', ')}`);
    if (asset.envelope.length !== ENVELOPE_FIELDS.length) {
      issues.push(`${file}: envelope muss genau ${ENVELOPE_FIELDS.length} Felder tragen (ist ${asset.envelope.length})`);
    }
  }

  for (const point of ['payload_ref', 'event_id', 'trace_id']) {
    const derivation = asset.derivation?.[point];
    if (!derivation) {
      issues.push(`${file}: derivation.${point} fehlt`);
      continue;
    }
    if (!isText(derivation.prefix)) issues.push(`${file}: derivation.${point}.prefix fehlt`);
    if (!Number.isInteger(derivation.length) || derivation.length < 8) {
      issues.push(`${file}: derivation.${point}.length muss ≥ 8 sein`);
    }
    if (!Array.isArray(derivation.digestOf) || derivation.digestOf.length === 0) {
      issues.push(`${file}: derivation.${point}.digestOf fehlt`);
    }
  }

  const events = asset.events ?? {};
  for (const type of EVENT_TYPES) {
    const definition = events[type];
    if (!definition) {
      issues.push(`${file}: Event-Typ ${type} fehlt`);
      continue;
    }
    if (!isText(definition.source)) issues.push(`${file}: ${type}.source fehlt`);
    if (!Array.isArray(definition.payload) || definition.payload.some((key) => !isText(key))) {
      issues.push(`${file}: ${type}.payload fehlt oder ist leer`);
    }
    if (!isText(definition.phase)) issues.push(`${file}: ${type}.phase fehlt`);
  }
  for (const type of Object.keys(events)) {
    if (!EVENT_TYPES.includes(type)) issues.push(`${file}: unbekannter Event-Typ ${type}`);
  }

  const signals = asset.signals ?? {};
  for (const [signal, type] of Object.entries(signals)) {
    if (!isText(signal)) issues.push(`${file}: Signalname leer`);
    if (!known(EVENT_TYPES)(type)) issues.push(`${file}: Signal ${signal} → unbekannter Event-Typ ${type}`);
  }

  const reachable = new Set(Object.values(signals));
  const carrier = asset.carrier;
  if (!carrier || typeof carrier !== 'object') {
    issues.push(`${file}: carrier fehlt`);
  } else {
    if (!isText(carrier.signal)) issues.push(`${file}: carrier.signal fehlt`);
    if (!isText(carrier.typePath)) issues.push(`${file}: carrier.typePath fehlt`);
    if (typeof carrier.verified !== 'boolean') issues.push(`${file}: carrier.verified muss ein Boolean sein`);
    for (const [raw, type] of Object.entries(carrier.typeMap ?? {})) {
      if (!known(EVENT_TYPES)(type)) issues.push(`${file}: carrier.typeMap.${raw} → unbekannter Event-Typ ${type}`);
      reachable.add(type);
    }
    if (!Array.isArray(carrier.verifiedTypes)) issues.push(`${file}: carrier.verifiedTypes fehlt (unbelegte Zuordnungen müssen markiert sein)`);
  }

  const uncovered = EVENT_TYPES.filter((type) => !reachable.has(type));
  if (uncovered.length) issues.push(`${file}: Event-Typ ohne Signal/Carrier-Pfad: ${uncovered.join(', ')}`);

  if (!Array.isArray(asset.forbidden) || asset.forbidden.length === 0) {
    issues.push(`${file}: forbidden fehlt (die Nicht-Aktions-Grenze ist Teil des Vertrags)`);
  } else if (!asset.forbidden.includes('autonomous_action')) {
    issues.push(`${file}: forbidden muss autonomous_action enthalten`);
  }
  return issues;
}

/** Fixture prüfen: bekannter Pfad, vollständiger Envelope, bekannte Verwerfungsgründe. */
export function fixtureIssues(fixture, asset, file) {
  const issues = [];
  if (typeof fixture !== 'object' || fixture === null) return [`${file}: kein Objekt`];
  if (!isText(fixture.id)) issues.push(`${file}: id fehlt`);
  if (!isText(fixture.clock)) issues.push(`${file}: clock fehlt (Replay braucht eine feste Uhr)`);
  if (fixture.contract !== asset?.contract) {
    issues.push(`${file}: contract "${fixture.contract}" ≠ Vertrag "${asset?.contract}"`);
  }

  const signals = new Set([...Object.keys(asset?.signals ?? {}), asset?.carrier?.signal].filter(isText));
  if (!Array.isArray(fixture.steps) || fixture.steps.length < EVENT_TYPES.length) {
    issues.push(`${file}: steps muss mindestens ${EVENT_TYPES.length} Pfade zeigen`);
  }
  for (const [index, step] of (fixture.steps ?? []).entries()) {
    const at = `${file}: Schritt ${index + 1}`;
    if (!signals.has(step?.signal)) issues.push(`${at} nutzt unbekanntes Signal ${JSON.stringify(step?.signal)}`);
    const expect = step?.expect ?? {};
    for (const field of ENVELOPE_FIELDS) {
      if (!isText(expect[field])) issues.push(`${at}: expect.${field} fehlt`);
    }
    const stray = Object.keys(expect).filter((field) => !ENVELOPE_FIELDS.includes(field));
    if (stray.length) issues.push(`${at}: expect trägt unbekannte Felder ${stray.join(', ')}`);
    if (expect.contract !== asset?.contract) issues.push(`${at}: expect.contract ≠ ${asset?.contract}`);
  }

  if (!Array.isArray(fixture.invalid) || fixture.invalid.length === 0) {
    issues.push(`${file}: invalid fehlt — eine Fixture ohne Verwerfungsfall prüft kein fail-closed`);
  }
  for (const [index, step] of (fixture.invalid ?? []).entries()) {
    const at = `${file}: invalid ${index + 1}`;
    if (!isText(step?.signal)) issues.push(`${at}: signal fehlt`);
    if (!DROP_REASONS.includes(step?.reason)) issues.push(`${at}: unbekannter Verwerfungsgrund ${JSON.stringify(step?.reason)}`);
    if (!isText(step?.why)) issues.push(`${at}: why fehlt (ein Verwerfungsfall braucht eine Begründung)`);
  }
  return issues;
}

/** Laufzeitgrenze prüfen: beobachten ja, handeln nein. Kommentare zählen nicht als Aufruf. */
export function staticIssues(source, file) {
  const issues = [];
  for (const token of findMissing(source, ['ctx.on', 'ctx.emit', 'createSpine', 'validateEnvelope'])) {
    issues.push(`${file}: ${token} fehlt (Spine-Kern unvollständig)`);
  }
  for (const field of findMissing(source, ENVELOPE_FIELDS)) {
    issues.push(`${file}: Envelope-Feld ${field} kommt im Laufzeitcode nicht vor`);
  }
  for (const token of findForbidden(source, FORBIDDEN_MODULES, { mode: 'module' })) {
    issues.push(`${file}: verbotener Modulimport ${token} — der Spine darf nur beobachten, normalisieren, validieren, emittieren`);
  }
  for (const token of findForbidden(source, FORBIDDEN_TOKENS)) {
    issues.push(`${file}: verbotener Aufruf ${token} — der Spine darf nur beobachten, normalisieren, validieren, emittieren`);
  }
  return issues;
}

export function check(ctx) {
  const pkg = ctx.packages.find((candidate) => candidate.dir === 'events');
  if (!pkg) return ['packages/events/ fehlt (Event-Spine nicht vorhanden)'];

  const issues = [];
  const assetPath = join(pkg.base, 'assets/event-spine.json');
  const fixturePath = join(pkg.base, 'assets/replay/session-created.json');
  if (!existsSync(assetPath)) issues.push('packages/events/assets/event-spine.json fehlt');
  if (!existsSync(fixturePath)) issues.push('packages/events/assets/replay/session-created.json fehlt');
  if (issues.length) return issues;

  let asset;
  let fixture;
  try {
    asset = JSON.parse(readFileSync(assetPath, 'utf8'));
  } catch (error) {
    return [`assets/event-spine.json ist kein gültiges JSON: ${error.message}`];
  }
  try {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    return [`assets/replay/session-created.json ist kein gültiges JSON: ${error.message}`];
  }

  issues.push(...contractIssues(asset, 'assets/event-spine.json'));
  issues.push(...fixtureIssues(fixture, asset, 'assets/replay/session-created.json'));
  issues.push(...staticIssues(readFileSync(join(pkg.base, 'index.js'), 'utf8'), 'packages/events/index.js'));

  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
    if (!(profile.bundles ?? []).includes('@shinon/events')) {
      issues.push(`Profil ${profileName}: @shinon/events ist nicht in dsh.profile.bundles`);
    }
  }
  return issues;
}
