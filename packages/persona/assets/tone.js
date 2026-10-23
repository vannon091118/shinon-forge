/**
 * tone.js — den Ton beim Scoring LESEN, nie setzen.
 *
 * Eigentuemer-Grenze (2026-10-23): diese Naht kennt genau einen Dienst und einen
 * Vertrag. Sie gehoert nicht dem Host-Eintrag, weil sie auch ohne ihn pruefbar
 * ist (der Test baut einen fremden Dienst und erwartet eine Warnung, keine Ausnahme).
 */

/**
 * Die Ton-Faehigkeit des Scorings (Zug 5) — optional, wie beim Veredler.
 *
 * Die Persona ist LESEND: sie holt die Haltung ueber dasselbe optionale `get`
 * und rendert daraus einen Abschnitt. Fehlt der Dienst, fehlt der Abschnitt —
 * geraten wird kein Ton. Die Namen sind mit `@shinon/scoring` gepinnt
 * (`scripts/gate/tests/context-wiring.test.mjs`).
 */
export const SCORING_SERVICE = 'shinon_scoring_state';
export const SCORING_SERVICE_CONTRACT = 'shinon.scoring-state/read-v1';

/**
 * Den Ton beim Scoring lesen — optional und mit geprueftem Vertrag.
 *
 * Dieselben vier Richtungen wie beim Veredler, aus demselben Grund: kein Dienst
 * ist der Normalfall (ein Profil ohne Scoring), ein Fremder unter diesem Namen
 * ist ein Fehler und wird einmal gemeldet, `null` heisst „es gibt nichts zu
 * sagen", und alles andere ist der Ton.
 */
export function readTone(ctx, warn = () => {}) {
  let service;
  try {
    service = typeof ctx?.get === 'function' ? ctx.get(SCORING_SERVICE) : undefined;
  } catch {
    service = undefined;
  }
  if (service === undefined || service === null) return null;
  if (service.contract !== SCORING_SERVICE_CONTRACT || typeof service.read !== 'function') {
    warn(`${SCORING_SERVICE} verletzt den Vertrag ${SCORING_SERVICE_CONTRACT}`);
    return null;
  }
  try {
    const read = service.read();
    return read === undefined ? null : read;
  } catch (error) {
    warn(`Ton nicht lesbar (${error?.message ?? error})`);
    return null;
  }
}

