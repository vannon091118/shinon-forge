import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

let z;
try {
  z = require('@deepseek-ai/schemastery');
} catch {
  // Fallback: minimal schema API für Test-/Offline-Betrieb
  const makePrimitive = (type) => {
    const fn = () => {
      const schema = { type };
      schema.min = () => schema;
      schema.max = () => schema;
      schema.default = (d) => ({ ...schema, default: d });
      return schema;
    };
    return fn;
  };
  z = {
    object: (shape) => {
      const schema = { shape };
      schema.default = (d) => ({ ...schema, default: d });
      return schema;
    },
    string: makePrimitive('string'),
    number: makePrimitive('number'),
    boolean: makePrimitive('boolean'),
    array: (item) => {
      const schema = { type: 'array', item };
      schema.min = () => schema;
      schema.max = () => schema;
      schema.default = (d) => ({ ...schema, default: d });
      return schema;
    },
    union: () => ({}),
    const: () => ({}),
  };
}

/**
 * @shinon/narrative — Narrative Engine
 *
 * Architektur:
 *   session.event ──▶ @shinon/events ──▶ shinon/event ──▶ Chronicle
 *                                                            │
 *                                                            ▼
 *                                                    Arc Tracking
 *                                                            │
 *                                                            ▼
 *                                                    Relationship State
 *                                                            │
 *                                                            ▼
 *                                                    Composite → Persona
 *
 * Deterministisch: gleicher Input + gleiche Historie = gleicher Output.
 * Keine Zeit, kein Zufall, kein Modell.
 */

// ── Deterministischer Hash ────────────────────────────────────────────────────

/** DJB2-Hash für String → Number. */
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // unsigned 32-bit
}

/** XorShift128+ PRNG (deterministisch, keine Math.random). */
class XorShift {
  constructor(seed) {
    this.state = [
      seed | 1,
      ((BigInt(seed) * 0x9E3779B97F4A7C15n) & 0xFFFFFFFFn) >>> 0,
      ((BigInt(seed) * 0x6A09E667F3BCC909n) & 0xFFFFFFFFn) >>> 0,
      ((BigInt(seed) * 0xBF58476D1CE4E5B9n) & 0xFFFFFFFFn) >>> 0,
    ];
  }

  next() {
    let s0 = this.state[0];
    let s1 = this.state[1];
    let s2 = this.state[2];
    let s3 = this.state[3];

    const t = (((s0 << 11) | (s0 >>> 21)) ^ s0 ^ ((s1 << 3) | (s1 >>> 29))) >>> 0;

    this.state[0] = s1;
    this.state[1] = s2;
    this.state[2] = s3;
    this.state[3] = t;

    return t;
  }
}

// ── Mood-Pool mit Anti-Wiederholung ────────────────────────────────────────────

const MOODS = ['idle', 'curious', 'focused', 'working', 'concerned', 'blocked'];

/** Wähle Mood, nie gleich wie vorher. */
function selectMood(prevMood, rng) {
  let next;
  do {
    next = MOODS[rng.next() % MOODS.length];
  } while (next === prevMood && MOODS.length > 1);
  return next;
}

// ── Arc Tracking ──────────────────────────────────────────────────────────────

const ARC_THEMES = ['identity', 'verification', 'creation', 'conflict', 'resolution', 'exploration'];

/** Erstelle neuen Arc basierend auf Event-Typ. */
function createArc(eventType, seq) {
  const themeIndex = djb2(eventType) % ARC_THEMES.length;
  return {
    id: `arc-${seq}`,
    name: `${eventType} phase`,
    theme: ARC_THEMES[themeIndex],
    status: 'active',
    first_event: null,
    last_event: null,
    span: { start: null, end: null },
    events: [],
  };
}

// ── Relationship State ────────────────────────────────────────────────────────

/** Berechne Beziehungszustand aus Historie. */
function calculateRelationshipState(pair, historyLength) {
  const hash = djb2(pair.sort().join('+'));
  const score = hash % 100;
  const adjusted = Math.min(100, score + (historyLength * 2));

  if (adjusted >= 70) return 'trusted_team';
  if (adjusted >= 40) return 'established_duo';
  return 'fresh_pair';
}

// ── Composite Berechnung ──────────────────────────────────────────────────────

/**
 * Leitet deterministisch neuen Composite aus Vorgänger + Event ab.
 *
 * Input:  prevComposite, event
 * Output: newComposite mit seq, mood, arc_id, relationship_state
 */
export function deriveComposite(prevComposite, event) {
  const seed = djb2(`${prevComposite.seq}|${event.id}|${event.timestamp}`);
  const rng = new XorShift(seed);

  const seq = prevComposite.seq + 1;
  const mood = selectMood(prevComposite.mood, rng);
  const narratorIndex = rng.next() % 3;
  const narrator = ['shinon', 'system', 'user'][narratorIndex];

  // Arc: entweder existierenden fortsetzen oder neuen erstellen
  let arcId = prevComposite.arc_id;
  if (!arcId || prevComposite.arc_events >= prevComposite.freezeThreshold) {
    arcId = `arc-${seq}`;
  }

  // Relationship: based on event actors
  const pair = [...new Set([...(event.actors ?? []), 'shinon'])].sort();
  const relationshipState = calculateRelationshipState(pair, prevComposite.seq);

  return {
    seq,
    mood,
    narrator,
    arc_id: arcId,
    arc_events: (prevComposite.arc_events ?? 0) + 1,
    freezeThreshold: prevComposite.freezeThreshold,
    relationship_state: relationshipState,
    pair,
    domain_resonance: {
      primary: event.type?.split('.')[0] ?? 'unknown',
      secondary: mood,
    },
  };
}

// ── Chronicle Management ──────────────────────────────────────────────────────

/** Füge Event zur Chronik hinzu, haltest maximal Limit Einträge. */
export function appendChronicle(chronicle, event, limit) {
  const updated = [...chronicle, {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  }];
  if (updated.length > limit) {
    return updated.slice(updated.length - limit);
  }
  return updated;
}

// ── Config Schema ─────────────────────────────────────────────────────────────

export const Config = z.object({
  eventsChannel: z.string().default('shinon/event'),
  chronicleLimit: z.number().min(10).max(200).default(50),
  freezeThreshold: z.number().min(10).max(50).default(20),
  relationshipWindow: z.number().min(5).max(50).default(20),
});

// ── Host apply ────────────────────────────────────────────────────────────────

/** Lade Contract aus assets/. */
function loadContract() {
  try {
    return JSON.parse(readFileSync(new URL('./assets/narrative-state.json', import.meta.url), 'utf8'));
  } catch {
    return null;
  }
}

export function apply(ctx, config) {
  const contract = loadContract();
  if (!contract) {
    console.warn('[shinon-narrative] Contract nicht lesbar — läuft mit Default');
  }

  // Initialer Zustand
  let state = {
    chronicle: [],
    arcs: [],
    relationships: {},
    composite: {
      seq: 0,
      mood: 'idle',
      narrator: 'shinon',
      arc_id: null,
      arc_events: 0,
      freezeThreshold: config.freezeThreshold,
      relationship_state: 'fresh_pair',
      pair: [],
      domain_resonance: { primary: 'none', secondary: 'idle' },
    },
  };

  // Handler für Events vom Spine
  const handler = (envelope, payload) => {
    const event = {
      id: envelope.event_id,
      type: envelope.event_type,
      timestamp: envelope.timestamp,
      actors: payload?.actors ?? ['shinon', 'system'],
      context: payload,
    };

    // Chronicle aktualisieren
    state.chronicle = appendChronicle(state.chronicle, event, config.chronicleLimit);

    // Arc management
    if (!state.composite.arc_id) {
      const newArc = createArc(event.type, state.composite.seq);
      newArc.first_event = event.id;
      newArc.span.start = event.timestamp;
      state.arcs.push(newArc);
      state.composite.arc_id = newArc.id;
      state.composite.arc_events = 0;
    }

    // Composite neu berechnen
    state.composite = deriveComposite(state.composite, event);

    // Relationship aktualisieren
    const pairKey = state.composite.pair.sort().join('+');
    if (!state.relationships[pairKey]) {
      state.relationships[pairKey] = {
        pair: state.composite.pair,
        history: [],
        trust: 0.5,
        respect: 0.5,
        patterns: [],
        conflicts: [],
        open_threads: [],
      };
    }
    state.relationships[pairKey].history.push({
      event: event.id,
      type: event.type,
      timestamp: event.timestamp,
    });

    // Arc freeze prüfen
    if (state.composite.arc_events >= state.composite.freezeThreshold) {
      const currentArc = state.arcs.find(a => a.id === state.composite.arc_id);
      if (currentArc) {
        currentArc.status = 'archived';
        currentArc.span.end = event.timestamp;
      }
      // Neuen Arc erstellen
      const newArc = createArc(event.type, state.composite.seq);
      newArc.first_event = event.id;
      newArc.span.start = event.timestamp;
      state.arcs.push(newArc);
      state.composite.arc_id = newArc.id;
      state.composite.arc_events = 0;
    }

    // Events an Persona weitergeben (via emit oder state update)
    if (typeof ctx.emit === 'function') {
      ctx.emit('shinon/narrative/state', state.composite);
    }
  };

  // Beobachte Events vom Spine
  const disposer = typeof ctx.on === 'function' ? ctx.on(config.eventsChannel, handler) : () => {};

  // State-Service für andere Plugins (optional)
  if (typeof ctx.set === 'function') {
    ctx.set('narrative', {
      getState: () => state,
      getComposite: () => state.composite,
      getChronicle: () => state.chronicle,
      getRelationships: () => state.relationships,
    });
  }

  console.log(`[shinon-narrative] Aktiviert — ${config.chronicleLimit} Events Hot, Freeze bei ${config.freezeThreshold}`);

  return () => {
    disposer();
    console.log('[shinon-narrative] Deaktiviert');
  };
}
