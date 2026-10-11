import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';

/**
 * @shinon/scoring — Scorecard, Decay, Relation (Stub, K2).
 *
 * Rolle: lesen, nie schreiben. Diese Schicht hält die Scorecard (aus
 * ./assets/scoring-state.json, Vertrag ab K3) und beantwortet Lesefragen —
 * sie mutiert keinen fremden State, ruft kein Modell und koppelt nicht an
 * die Persona. Das Gate prüft diese Grenze statisch (ab K4).
 *
 * K2-Stand: nur Scorecard-Lesen. Kein Event-Abo, keine Injektion, keine
 * Persona-Kopplung. Die Datenverträge (Scorecard, Decay, Relation) und die
 * Replay-Funktion folgen in K3.
 */

/** Leere Scorecard: der Stub läuft dann lesend, aber ohne Werte. */
const EMPTY_SCORECARD = {
  contract: 'shinon.scoring-state/unloaded',
  dimensions: {},
  relation: null,
};

/** Scorecard-Vertrag aus dem Paket laden. */
export function loadScorecard(relPath) {
  return JSON.parse(readFileSync(new URL(relPath, import.meta.url), 'utf8'));
}

/**
 * Eine Dimension der Scorecard lesen. Reine Funktion: unbekannte Dimensionen
 * ergeben null (fail-closed: kein Raten, kein Default).
 */
export function readScore(scorecard, dimension) {
  if (scorecard === null || typeof scorecard !== 'object') return null;
  if (typeof dimension !== 'string' || dimension.trim() === '') return null;
  const value = scorecard.dimensions?.[dimension];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export const Config = z.object({
  /** Scorecard-Vertrag (Dimensionen, Decay-Parameter, Relation). */
  scorePath: z.string().default('./assets/scoring-state.json'),
  /** Kanal, auf dem der Event-Spine seine Envelopes emittiert. */
  eventsChannel: z.string().default('shinon/event'),
});

export function apply(ctx, config) {
  let scorecard = EMPTY_SCORECARD;
  try {
    scorecard = loadScorecard(config.scorePath);
  } catch (error) {
    console.warn(`[shinon-scoring] Scorecard nicht lesbar (${config.scorePath}): ${error.message}`);
  }

  // Stub: nur lesen. Kein Event-Abo, kein Schreiben, keine Persona-Kopplung.
  // `ctx` bleibt bewusst unbenutzt, bis K3 die Replay-Funktion liefert.
  void ctx;
  const dimensions = Object.keys(scorecard.dimensions ?? {}).length;
  console.log(`[shinon-scoring] Scorecard-Stub aktiv (${dimensions} Dimensionen, nur lesend)`);

  return () => {
    console.log('[shinon-scoring] Deaktiviert');
  };
}
