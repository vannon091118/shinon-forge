/**
 * persona — Identity, State, Voice. DSH-nativ und im Profil aktiv.
 *
 * Drei Zusagen, drei Prüfungen:
 *   1. Verdrahtung: das Bundle nutzt ctx.systemPrompt, exportiert `Config` und
 *      `apply`, und das aktive Profil aktiviert es. Ein Persona-Bundle, das
 *      niemand mountet, ist toter Text.
 *   2. Zustandsvertrag (assets/persona-state.json): Baseline, die neun
 *      Event-Übergänge, und für jeden erreichbaren Mood eine Stimme. Ein Mood
 *      ohne Voice wäre ein Zustand ohne Ausdruck.
 *   3. Grenze: der Laufzeitcode beobachtet und rendert — er ruft kein Modell,
 *      startet kein Tool, schreibt nichts. Statisch geprüft, kommentarblind.
 */
export const id = 'persona';

import { check as runCheck } from '../../lib/persona-checks.mjs';

/** Der Gate-Einstieg: die Prüfungen liegen in `scripts/lib/persona-checks.mjs`. */
export function check(ctx) {
  return runCheck(ctx);
}

export * from '../../lib/persona-checks.mjs';
