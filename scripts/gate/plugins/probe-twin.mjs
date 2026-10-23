/**
 * probe-twin — Probe/Twin-Contract (Falsify_Me-Prinzip, nativ).
 *
 * Trennung, die trägt:
 *   - Der STRUKTUR-Prüfer (Validator) sieht nur Form: gibt es Proben, haben
 *     sie Ziele, sind IDs eindeutig? Er urteilt NICHT über Wahrheit.
 *   - Der SEMANTIK-Executor (Twin) führt aus und liefert Evidenz.
 *   - Das Gate entscheidet aus tatsächlichen Ergebnissen, nie aus Prosa.
 *
 * Dieses Gate ist der Validator: es prüft die Probe-Definitionen in
 * docs/probes/*.json strukturell. Es führt nichts aus (kein Netz, kein
 * Modell) — Ausführung ist der Twin, und der gehört nicht in ein Gate.
 *
 * Vokabular (Falsify_Me): BESTAETIGT | WIDERSPRUCH | UNKLAR
 * Verdicts:                 PLAN | RESEARCH | ASK | WRITE
 *
 * Anti-Vakuum: eine Probe ohne Ziel oder ohne erwartetes Ergebnis ist keine
 * Probe. „Wiederholung ist kein Beweis" — eine leere Probe bestätigt nichts.
 */
export const id = 'probe-twin';

import { check as runCheck } from '../../lib/probe-twin-checks.mjs';

/** Der Gate-Einstieg: die Prüfungen liegen in `scripts/lib/probe-twin-checks.mjs`. */
export function check(ctx) {
  return runCheck(ctx);
}

export * from '../../lib/probe-twin-checks.mjs';
