import z from '@deepseek-ai/schemastery';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * @shinon/events — Wave 2: Shinon Hook/Event Spine.
 *
 * Rolle: beobachten, normalisieren, validieren, emittieren. Mehr nicht.
 *
 *   DSH-Signal → Normalisierung → Contract-Gate → Emission
 *                    │                 │
 *                    │                 └─ ungültig ⇒ VERWERFEN (fail-closed für das Event)
 *                    └─ niemals eine Aktion, niemals ein Schreibzugriff, niemals ein Modell
 *
 * Zwei Fail-Richtungen, bewusst getrennt (DOKI-Prinzip):
 *   - fail-closed für das EVENT: ein Event, das den Contract verletzt, wird nie emittiert.
 *   - fail-open für den HOST: die Beobachtung darf den beobachteten Prozess nie blockieren
 *     (kein Throw aus einem Handler heraus, kein Absturz bei fehlendem Signal).
 *
 * Der Spine ist ein Durchleiter, keine Autorität (`authority: NONE` im Vertrag).
 * Er darf keinen State setzen, keine Datei schreiben, kein Netz und kein Modell aufrufen.
 * Das Gate prüft genau diese Grenze statisch (scripts/gate/plugins/events-spine.mjs).
 *
 * Der Vertrag selbst liegt als Daten in ./assets/event-spine.json — nicht im Code.
 * Ein neuer Event-Typ ist damit zuerst eine Datenänderung, kein Code-Umbau.
 */

/** Fallback, falls der Vertrag nicht geladen werden kann; wird nie emittiert. */
const EMPTY_CONTRACT = { contract: 'shinon.event-spine/unloaded', envelope: [], events: {}, signals: {}, carrier: null };

/** Kanonisches JSON: Objektschlüssel rekursiv sortiert, damit Digests stabil sind. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Erste `length` Hex-Zeichen von sha256(text). */
export function digest(text, length) {
  return createHash('sha256').update(text).digest('hex').slice(0, length);
}

/** Punktpfad-Lesen: resolvePath({session:{id:'s'}}, 'session.id') → 's'. */
export function resolvePath(source, path) {
  return String(path ?? '')
    .split('.')
    .reduce((value, key) => (value !== null && typeof value === 'object' ? value[key] : undefined), source);
}

/** Vertrag (Event-Spine-Daten) aus dem Paket laden. */
export function loadContract(relPath) {
  return JSON.parse(readFileSync(new URL(relPath, import.meta.url), 'utf8'));
}

/** Ersten nicht-leeren Treffer der Pfadliste liefern (Session-, Trace-Auflösung). */
export function firstValue(source, paths, fallback = undefined) {
  for (const path of paths ?? []) {
    const value = resolvePath(source, path);
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return fallback;
}

/**
 * Envelope bauen — die acht Pflichtfelder aus dem Vertrag, sonst nichts.
 * `payload_ref` referenziert die Nutzlast; die Nutzlast selbst reist als zweites
 * Argument der Emission mit und wird nicht im Envelope dupliziert.
 */
export function buildEnvelope(contract, { eventType, source, payload, sessionId, timestamp, traceId }) {
  const payloadRef = `${contract.derivation.payload_ref.prefix}${digest(canonicalJson(payload), contract.derivation.payload_ref.length)}`;
  const identity = [
    contract.contract,
    eventType,
    sessionId,
    source,
    timestamp,
    payloadRef,
  ].join('|');
  return {
    event_id: `${contract.derivation.event_id.prefix}${digest(identity, contract.derivation.event_id.length)}`,
    event_type: eventType,
    session_id: sessionId,
    source,
    timestamp,
    payload_ref: payloadRef,
    contract: contract.contract,
    trace_id:
      traceId ??
      `${contract.derivation.trace_id.prefix}${digest([sessionId, eventType, timestamp].join('|'), contract.derivation.trace_id.length)}`,
  };
}

/**
 * Contract-Gate: prüft einen Envelope vollständig gegen den Vertrag.
 * Gibt eine Liste von Verstößen zurück (leer = gültig). Reine Funktion.
 */
export function validateEnvelope(envelope, { contract, eventType, payload, source }) {
  const issues = [];
  const definition = contract.events?.[eventType];
  const required = contract.envelope ?? [];

  for (const field of required) {
    if (typeof envelope[field] !== 'string' || envelope[field].trim() === '') issues.push(`ENVELOPE_FIELD:${field}`);
  }
  for (const field of Object.keys(envelope)) {
    if (!required.includes(field)) issues.push(`ENVELOPE_UNKNOWN_FIELD:${field}`);
  }
  if (envelope.contract !== contract.contract) issues.push('CONTRACT_MISMATCH');
  if (!definition) issues.push(`UNKNOWN_EVENT_TYPE:${eventType}`);
  if (definition && envelope.source !== definition.source) issues.push(`SOURCE_MISMATCH:${envelope.source}`);

  for (const key of definition?.payload ?? []) {
    const value = resolvePath(payload, key);
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      issues.push(`MISSING_PAYLOAD_KEY:${key}`);
    }
  }

  if (definition) {
    const expectedRef = `${contract.derivation.payload_ref.prefix}${digest(canonicalJson(payload), contract.derivation.payload_ref.length)}`;
    if (envelope.payload_ref !== expectedRef) issues.push('DIGEST_MISMATCH:payload_ref');
    const expectedId = buildEnvelope(contract, {
      eventType,
      source: definition.source,
      payload,
      sessionId: envelope.session_id,
      timestamp: envelope.timestamp,
      traceId: envelope.trace_id,
    }).event_id;
    if (envelope.event_id !== expectedId) issues.push('DIGEST_MISMATCH:event_id');
  }
  return issues;
}

/**
 * Der Spine. Nimmt Signale entgegen und gibt gültige Envelopes weiter.
 * Jede Verletzung endet in `stats.dropped` + `stats.lastDrop` — nie in einer Emission.
 */
export function createSpine(contract, options = {}) {
  const emit = typeof options.emit === 'function' ? options.emit : () => {};
  const onDrop = typeof options.onDrop === 'function' ? options.onDrop : () => {};
  const clock = typeof options.clock === 'string' && options.clock !== '' ? options.clock : null;
  const defaultSessionId = typeof options.defaultSessionId === 'string' ? options.defaultSessionId : '';
  const stats = { emitted: 0, dropped: 0, reasons: {}, lastDrop: null, lastEvent: null };

  const drop = (reason, signal, detail) => {
    stats.dropped += 1;
    stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
    stats.lastDrop = { reason, signal, detail };
    onDrop(reason, { signal, detail });
    return null;
  };

  /** Signal → kanonischer Event-Typ. Carrier liest den Typ aus der Nutzlast. */
  function resolveEventType(signal, payload) {
    const mapped = contract.signals?.[signal];
    if (mapped) return { eventType: mapped, carrier: false };
    if (contract.carrier && contract.carrier.signal === signal) {
      const raw = resolvePath(payload, contract.carrier.typePath);
      const eventType = contract.carrier.typeMap?.[raw];
      return eventType ? { eventType, carrier: true } : { eventType: null, carrier: true };
    }
    return { eventType: null, carrier: false };
  }

  function observe(signal, payload) {
    const source = payload !== null && typeof payload === 'object' ? payload : {};
    const { eventType } = resolveEventType(signal, source);
    if (!eventType) return drop('UNKNOWN_SIGNAL', signal, contract.carrier?.signal === signal ? 'type nicht in typeMap' : 'Signal nicht im Vertrag');

    const definition = contract.events?.[eventType];
    if (!definition) return drop('UNKNOWN_EVENT_TYPE', signal, eventType);

    const sessionId = firstValue(source, contract.session?.paths, defaultSessionId);
    if (typeof sessionId !== 'string' || sessionId === '') return drop('MISSING_SESSION_ID', signal, eventType);

    const traceId = firstValue(source, contract.trace?.paths);
    const timestamp = clock ?? new Date().toISOString();
    const envelope = buildEnvelope(contract, {
      eventType,
      source: definition.source,
      payload: source,
      sessionId,
      timestamp,
      traceId,
    });
    const issues = validateEnvelope(envelope, { contract, eventType, payload: source, source: definition.source });
    if (issues.length > 0) return drop(issues[0].split(':')[0], signal, issues.join(','));

    emit(envelope, source);
    stats.emitted += 1;
    stats.lastEvent = envelope;
    return envelope;
  }

  return { observe, stats, contract, resolveEventType };
}

export const Config = z.object({
  /** Vertragsdaten (Envelope, Signale, Event-Typen). */
  schemaPath: z.string().default('./assets/event-spine.json'),
  /** Replay-Fixture — Beweis, dass derselbe Event-Pfad reproduzierbar ist. */
  replayPath: z.string().default('./assets/replay/session-created.json'),
  /** Kanal, auf dem normalisierte Envelopes emittiert werden. */
  emitChannel: z.string().default('shinon/event'),
  /** Ersatz-Session, wenn eine Nutzlast keine Session trägt. Leer = verwerfen. */
  defaultSessionId: z.string().default(''),
  /** Feste Uhr für Replay/Test (ISO-8601). Leer = echte Zeit. */
  clock: z.string().default(''),
});

/** Signale abonnieren; nie werfen, immer abräumbar. */
function subscribe(ctx, signal, handler, label) {
  if (typeof ctx?.on !== 'function') return () => {};
  const guarded = (payload) => {
    try {
      handler(payload);
    } catch (error) {
      console.warn(`[shinon-events] Beobachtung verworfen (${label}): ${error.message}`);
    }
  };
  const disposer = ctx.on(signal, guarded);
  return typeof disposer === 'function' ? disposer : () => {};
}

export function apply(ctx, config) {
  let contract = EMPTY_CONTRACT;
  try {
    contract = loadContract(config.schemaPath);
  } catch (error) {
    console.warn(`[shinon-events] Spine nicht verbunden — Vertrag nicht lesbar: ${error.message}`);
    return () => {};
  }

  const spine = createSpine(contract, {
    clock: config.clock,
    defaultSessionId: config.defaultSessionId,
    emit: (envelope, payload) => {
      // Einzige Wirkung des Spines: der emittierte Envelope. Kein State, kein Schreibzugriff.
      if (typeof ctx?.emit === 'function') ctx.emit(config.emitChannel, envelope, payload);
    },
    onDrop: (reason, { signal, detail }) => {
      console.warn(`[shinon-events] verworfen ${reason} (${signal}): ${detail}`);
    },
  });

  const signals = Object.keys(contract.signals ?? {});
  const disposers = signals.map((signal) => subscribe(ctx, signal, (payload) => spine.observe(signal, payload), signal));
  if (contract.carrier?.signal) {
    disposers.push(subscribe(ctx, contract.carrier.signal, (payload) => spine.observe(contract.carrier.signal, payload), contract.carrier.signal));
  }

  console.log(`[shinon-events] ${signals.length} Signale + Carrier gebunden (${contract.contract}, authority ${contract.authority})`);

  return () => {
    for (const dispose of disposers) dispose();
  };
}
