import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';

/**
 * @shinon/scoring — Scorecard, Decay, Relation (Kern, K3).
 *
 * Rolle: lesen, nie schreiben. Diese Schicht hält die Scorecard
 * (./assets/scoring-state.json), das Technik-Profil und die Skill-Trigger —
 * reines Replay: Anfangszustand + Event-Strom → Scorecard + Injektion +
 * Digest. Deterministisch (kein Math.random, kein Date.now, kein Modell),
 * fail-closed bei Unbekanntem. Die reine Mechanik liegt in
 * ./assets/scoring-core.js (keine Imports, testbar ohne node_modules);
 * diese Datei lädt nur Verträge und re-exportiert den Kern.
 */

export {
  round4,
  canonicalize,
  stableHash,
  initialState,
  applyEvent,
  evaluateTriggers,
  replay,
  readScore,
} from './assets/scoring-core.js';
import { initialState as coreInitialState } from './assets/scoring-core.js';

/** Leere Scorecard: der Stub läuft dann lesend, aber ohne Werte. */
const EMPTY_SCORING = { contract: 'shinon.scoring-state/unloaded', dimensions: {}, events: {}, relation: { levels: [], initial: null } };
const EMPTY_PROFILE = { contract: 'shinon.technical-profile/unloaded', capabilities: [], skills: [], limits: {} };
const EMPTY_TRIGGERS = { contract: 'shinon.skill-triggers/unloaded', triggers: [] };

/** Vertragsdaten aus dem Paket laden. */
export function loadScorecard(relPath) {
  return JSON.parse(readFileSync(new URL(relPath, import.meta.url), 'utf8'));
}

export const Config = z.object({
  /** Scorecard-Vertrag (Dimensionen, Event-Wirkung, Decay, Kühlen, Relation). */
  scorePath: z.string().default('./assets/scoring-state.json'),
  /** Technik-Profil (Capabilities, Skills, Limits). */
  technicalPath: z.string().default('./assets/technical-profile.json'),
  /** Skill-Trigger (Injektionsregeln in Reihenfolge). */
  triggersPath: z.string().default('./assets/skill-triggers.json'),
  /** Replay-Fixture — Beweis, dass derselbe Strom reproduzierbar ist. */
  replayPath: z.string().default('./assets/replay/scoring-demo.json'),
  /** Kanal, auf dem der Event-Spine seine Envelopes emittiert. */
  eventsChannel: z.string().default('shinon/event'),
});

function loadOrWarn(label, relPath, fallback) {
  try {
    return loadScorecard(relPath);
  } catch (error) {
    console.warn(`[shinon-scoring] ${label} nicht lesbar (${relPath}): ${error.message}`);
    return fallback;
  }
}

export function apply(ctx, config) {
  const scoring = loadOrWarn('Scorecard', config.scorePath, EMPTY_SCORING);
  const profile = loadOrWarn('Technik-Profil', config.technicalPath, EMPTY_PROFILE);
  const triggers = loadOrWarn('Skill-Trigger', config.triggersPath, EMPTY_TRIGGERS);
  const contracts = { scoring, profile, triggers };

  // K3-Stand: Verträge laden + Anfangszustand ableiten. Noch kein Event-Abo,
  // kein Schreiben, keine Persona-Kopplung — das Replay läuft rein.
  void ctx;
  const initial = coreInitialState(scoring);
  const dimensions = Object.keys(initial.scores).length;
  console.log(
    `[shinon-scoring] Verträge geladen (${dimensions} Dimensionen, ${triggers.triggers?.length ?? 0} Trigger, nur lesend)`,
  );

  return { contracts, initial, dispose: () => console.log('[shinon-scoring] Deaktiviert') };
}
