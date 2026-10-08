import z from '@deepseek-ai/schemastery';
import { createHash } from 'node:crypto';

/**
 * shinon-hook — der echte DSH-Entry-Point von Shinon (Phase 1).
 *
 * Die frühere Observer-Simulation ist ersetzt: `observe()` registrierte nichts,
 * sondern protokollierte nur. Der Hook registriert jetzt einen echten
 * Waterfall-Listener auf `agent/pre-step` und reicht den Schritt kontrolliert
 * durch.
 *
 * Verifizierte Grundlage — installiertes DSH 0.2.0-rc.2, nichts davon geraten:
 *
 *   Signatur   @deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts
 *              'agent/pre-step'(this: Scoped<Agent>, payload: {
 *                agent: Agent; messages: UserMessage[]; turn: number;
 *                step: number; signal: AbortSignal;
 *              }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
 *              @mode waterfall
 *   Entscheidung  type PreStepDecision =
 *                 { kind: 'reject' } | { kind: 'enter'; messages; startsRequestSeries? }
 *   Weitergabe    „Calling `next()` preserves the current messages."
 *   Dispatch      @deepseek-ai/dsh-agent-loop/lib/index.js fährt den Waterfall mit
 *                 dem Default-Downstream { kind: 'enter', messages }; `agent` wird
 *                 vom fused Dispatcher (@deepseek-ai/dsh-agent, `agentEvents`) in
 *                 die Nutzlast injiziert.
 *   Lifecycle     ctx.on liefert einen Disposer; apply() gibt ihn zurück.
 *   Referenz      @deepseek-ai/dsh-hooks-claude-code bindet genau diesen Seam
 *                 app-weit und lehnt einen Schritt mit { kind: 'reject' } ab.
 *
 * Verantwortungsgrenze: registrieren, Lifecycle, Korrelation, kontrollierte
 * Weitergabe. KEINE Prompt-Logik, kein SQLite, keine Goal-Schleife, kein
 * Browser, keine Persona.
 *
 * Zwei Fail-Richtungen, bewusst getrennt (dieselbe DOKI-Grenze wie im
 * Event-Spine): fail-closed für den DATENSATZ — ein Schritt, der den Vertrag
 * verletzt, wird nie als Trace emittiert; fail-open für den HOST — die
 * Beobachtung darf den beobachteten Prozess nie blockieren. Eine Nutzlast, die
 * wir nicht verstehen, wird deshalb laut protokolliert und durchgereicht.
 * `onContractViolation: 'reject'` kehrt genau das um — eine bewusste
 * Einstellung, kein stiller Fallback.
 */

/** Vertragsname der erzeugten Datensätze. */
export const CONTRACT = 'shinon.hook/pre-step-v1';

/** DSH-Event-Name des Waterfalls — der Registrierungsschlüssel. */
export const PRE_STEP_EVENT = 'agent/pre-step';

/**
 * `event_type` der erzeugten Datensätze. Bewusst NICHT identisch mit
 * `PRE_STEP_EVENT`: DSH-Event-Namen tragen einen Schrägstrich, die Event-Typen
 * des Repos tragen Punkte (`session.created`, `gate.failed`). Beides zu
 * verwechseln heißt, sich nie zu registrieren oder jeden Datensatz zu
 * verwerfen — deshalb stehen hier zwei Konstanten mit Namen nebeneinander.
 */
export const TRACE_EVENT_TYPE = 'agent.pre-step';

/** Kanal, auf dem korrelierte Schritt-Datensätze den Host verlassen. */
export const TRACE_CHANNEL = 'shinon/hook/pre-step';

// TODO: [DSH-Refactor] - Zweite Kopie des Digest-Helfers: @shinon/events exportiert bereits
// `digest(text, length)`. Pakete dürfen einander nicht importieren, also gehört die Funktion in
// eine gemeinsame Quelle (scripts/lib-Vertrag) statt in zwei Pakete — sonst driften Länge und
// Zeichenvorrat der ids unbemerkt auseinander.
/** Erste `length` Hex-Zeichen von sha256(text). */
const digest = (text, length = 12) => createHash('sha256').update(String(text)).digest('hex').slice(0, length);

/**
 * Event-Schema: die erzeugten Datensätze und ihre acht Vertragsfelder.
 *
 * Das Schema IST der Envelope-Contract-Gate — es validiert und wirft
 * `ValidationError`.
 *
 * `required()` trägt diese Zusage: in Schemastery sind Objekt-Schlüssel
 * **optional**. Ohne `required()` lieferte `normalizeEvent({})` hier ein
 * Ergebnis statt eines Fehlers — `{"payload_ref": ""}` —, ein hohler Datensatz
 * hätte den Gate also passiert. Das ist geschlossen.
 *
 * `payload_ref` behält seinen `.default('')`: der Vertrag aus Wave 2 erklärt
 * das Feld ausdrücklich als vorbelegt, und das ist eine andere Zusage als
 * "Pflichtfeld".
 */
// TODO: [DSH-Refactor] - Die zehn Event-Typen stehen als `z.union` aus `z.const` mitten im Schema
// (Schemastery 3.18.4 hat kein `z.enum`) und existieren sonst nirgends als prüfbare Liste. Der
// Event-Spine führt seine Typen als Vertragsdaten (assets/event-spine.json); hier ist die Liste
// Code. Eine exportierte Konstante, aus der die Union erzeugt wird, macht sie zählbar und
// gate-prüfbar — heute ist sie nur durch Lesen zu erfahren.
export const EventSchema = z.object({
  event_id: z.string().min(1, 'event_id muss nicht leer sein').required(),
  event_type: z.union([
    z.const('session.created'),
    z.const('message.received'),
    z.const('message.completed'),
    z.const('claim.created'),
    z.const('tool.requested'),
    z.const('tool.completed'),
    z.const('gate.failed'),
    z.const('gate.passed'),
    z.const('action.blocked'),
    z.const('agent.pre-step'),
  ]).required(),
  session_id: z.string().min(1, 'session_id muss nicht leer sein').required(),
  source: z.const('dsh').required(),
  timestamp: z.string().min(1, 'timestamp muss nicht leer sein').required(),
  payload_ref: z.string().default(''),
  contract: z.string().min(1, 'contract muss nicht leer sein').required(),
  trace_id: z.string().min(1, 'trace_id muss nicht leer sein').required(),
});

/**
 * Hook-Konfiguration (Schemastery). Jede Option hat genau ein Verhalten;
 * keine Option ist doppelt vorhanden.
 */
export const Config = z.object({
  /**
   * DSH-Event-Namen, auf die sich dieser Hook registriert. Enthält die Liste
   * `agent/pre-step` nicht, wird bewusst nichts registriert — das ist die eine
   * Registrierungsbedingung, und sie wird im Log benannt.
   */
  observeEvents: z.array(z.string()).default(['agent/pre-step']),
  /**
   * Deterministische Durchlass-Policy: `allow` reicht den Schritt durch,
   * `block` lehnt ihn mit `{ kind: 'reject' }` ab. Die Entscheidung kommt aus
   * der Konfiguration, nicht aus freiem Text.
   */
  verdict: z.union([z.const('allow'), z.const('block')]).default('allow'),
  /**
   * Verhalten bei verletztem Nutzlast-Vertrag: `pass` schützt den Host (der
   * Schritt läuft weiter, der Befund wird protokolliert), `reject` wählt
   * fail-closed und lehnt den Schritt ab.
   */
  onContractViolation: z.union([z.const('pass'), z.const('reject')]).default('pass'),
  /** Korrelierte Schritt-Datensätze auf `TRACE_CHANNEL` emittieren. */
  trace: z.boolean().default(true),
  /** Feste Uhr für Replay/Test (ISO-8601). Leer = echte Zeit. */
  clock: z.string().default(''),
});

/**
 * Normalisiert einen Datensatz gegen EventSchema.
 *
 * Schemastery 3.18.4 hat KEIN `safeParse` (das ist die Zod-API) — das Schema
 * wird aufgerufen und wirft bei Verletzung. Der frühere
 * `EventSchema.safeParse(raw)` war toter Code, der bei jedem Aufruf eine
 * TypeError geworfen hätte.
 */
export function normalizeEvent(raw) {
  try {
    return EventSchema(raw);
  } catch (error) {
    throw new Error(`[shinon-hook] Normalisierung fehlgeschlagen: ${error?.message}`);
  }
}

/**
 * Die Nutzlast des Waterfalls in einen beschreibbaren Schritt-Datensatz
 * überführen. Total: eine unbekannte Form wird beschrieben, nicht interpretiert,
 * und die Funktion kann nicht werfen.
 */
export function readStep(payload) {
  const source = payload !== null && typeof payload === 'object' ? payload : {};
  const agent = source.agent !== null && typeof source.agent === 'object' ? source.agent : {};
  const session = agent.session !== null && typeof agent.session === 'object' ? agent.session : {};
  const signal = source.signal !== null && typeof source.signal === 'object' ? source.signal : null;
  return {
    session_id: typeof session.id === 'string' ? session.id : '',
    turn: Number.isInteger(source.turn) ? source.turn : null,
    step: Number.isInteger(source.step) ? source.step : null,
    message_count: Array.isArray(source.messages) ? source.messages.length : null,
    has_signal: signal !== null,
  };
}

/**
 * Welche Vertragsfelder fehlen? Reine Funktion, gibt die Feldnamen zurück —
 * der Aufrufer entscheidet, welche Fail-Richtung gilt.
 */
export function stepIssues(step) {
  const issues = [];
  if (typeof step?.session_id !== 'string' || step.session_id === '') issues.push('session_id');
  if (!Number.isInteger(step?.turn)) issues.push('turn');
  if (!Number.isInteger(step?.step)) issues.push('step');
  if (!Number.isInteger(step?.message_count)) issues.push('messages');
  if (step?.has_signal !== true) issues.push('signal');
  return issues;
}

/**
 * Korrelierten Envelope für einen Schritt bauen. `trace_id` ist deterministisch
 * aus der Schritt-Identität abgeleitet, damit derselbe Schritt dieselbe Spur
 * trägt — auch über mehrere Listener hinweg.
 */
export function buildStepEnvelope(step, config = {}) {
  const timestamp = typeof config.clock === 'string' && config.clock !== '' ? config.clock : new Date().toISOString();
  const payloadRef = `pl-${digest([step.message_count, step.turn, step.step].join('|'))}`;
  return {
    event_id: `evt-${digest([CONTRACT, TRACE_EVENT_TYPE, step.session_id, timestamp, payloadRef].join('|'))}`,
    event_type: TRACE_EVENT_TYPE,
    session_id: step.session_id,
    source: 'dsh',
    timestamp,
    payload_ref: payloadRef,
    contract: CONTRACT,
    trace_id: `tr-${digest([step.session_id, step.turn, step.step].join('|'))}`,
  };
}

/**
 * Der registrierte Listener: registriert, korreliert, reicht durch.
 *
 * Die Rückgabe ist IMMER entweder die unveränderte Entscheidung von `next()`
 * oder eine wohlgeformte Absage `{ kind: 'reject' }`. Der Hook erfindet keine
 * `kind: 'enter'`-Entscheidung: die Messages gehören dem Harness, nicht uns.
 */
// TODO: [DSH-Refactor] - Ein Handler mit drei Aufgaben in einer Leiter: Vertrags-Verstoß
// (if/else-if mit `config.trace` im Zweig), Trace-Emission und Durchlass-Verdikt (`verdict`).
// Der else-if-Zweig verschmilzt „kein Verstoß“ mit „trace an“, und der Abbruchpfad
// (`return { kind: 'reject' }`) steht zweimal im Code. Auftrennen in benannte Schritte:
// contractVerdict(step, config) → emitTrace(...) → passVerdict(...).
async function onPreStep(ctx, config, payload, next) {
  const step = readStep(payload);
  const issues = stepIssues(step);

  if (issues.length > 0) {
    const failClosed = config.onContractViolation === 'reject';
    console.error(
      `[shinon-hook] Nutzlast verletzt den Vertrag (${issues.join(', ')}) — ${
        failClosed ? 'reject (fail-closed konfiguriert)' : 'Host-Schutz: Durchreichen'
      }`,
    );
    if (failClosed) return { kind: 'reject' };
  } else if (config.trace) {
    try {
      const envelope = normalizeEvent(buildStepEnvelope(step, config));
      // Einzige Wirkung: der Datensatz. Kein State, kein Schreibzugriff.
      if (typeof ctx?.emit === 'function') ctx.emit(TRACE_CHANNEL, envelope, step);
    } catch (error) {
      // fail-closed für den Datensatz: ein ungültiger Envelope verlässt uns nicht.
      console.warn(`[shinon-hook] Trace verworfen (${error?.message})`);
    }
  }

  if (config.verdict === 'block') {
    console.warn(`[shinon-hook] Schritt abgelehnt (verdict=block): turn ${step.turn}, step ${step.step}`);
    return { kind: 'reject' };
  }

  // Kontrollierte Weitergabe: die Entscheidung stammt ausschließlich von next().
  return next();
}

/**
 * Registriert den Hook im DSH-Kontext und gibt den Disposer zurück.
 *
 * Ohne `ctx.on` oder ohne `agent/pre-step` in `observeEvents` wird nicht
 * registriert — das wird gemeldet, nicht verschwiegen (keine stillen Fallbacks).
 */
export function apply(ctx, config) {
  if (typeof ctx?.on !== 'function') {
    console.error(`[shinon-hook] ctx.on fehlt — ${PRE_STEP_EVENT} wurde NICHT registriert (BLOCKED)`);
    return () => {};
  }
  if (!config.observeEvents.includes(PRE_STEP_EVENT)) {
    console.log(`[shinon-hook] ${PRE_STEP_EVENT} nicht in observeEvents — bewusst nicht registriert`);
    return () => {};
  }

  const dispose = ctx.on(PRE_STEP_EVENT, (payload, next) => onPreStep(ctx, config, payload, next));
  console.log(`[shinon-hook] Aktiviert — registriert auf ${PRE_STEP_EVENT} (verdict=${config.verdict}, trace=${config.trace ? 'an' : 'aus'})`);

  return () => {
    if (typeof dispose === 'function') dispose();
    console.log('[shinon-hook] Deaktiviert — Listener abgemeldet');
  };
}
