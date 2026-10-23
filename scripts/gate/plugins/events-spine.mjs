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
export const id = 'events-spine';

import { check as runCheck } from '../../lib/events-spine-checks.mjs';

/** Der Gate-Einstieg: die Prüfungen liegen in `scripts/lib/events-spine-checks.mjs`. */
export function check(ctx) {
  return runCheck(ctx);
}

export * from '../../lib/events-spine-checks.mjs';
