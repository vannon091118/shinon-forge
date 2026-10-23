/**
 * markers — Gate des Marker-Spiegels (Wave 3).
 *
 * Der Spiegel übersetzt das Element-Marker-System aus brutalord-the-feral-cycle
 * in ein DSH-Bundle. Dieses Gate prüft die drei Zusagen, die daraus folgen:
 *
 *   1. Vertrag (assets/marker-model.json): acht Marken-Felder, id-Regel,
 *      Selektor-Grenze, Nutzlast-Format, Inbox, Speicherschlüssel, Grenzen,
 *      authority NONE, forbidden inkl. cdp_attach — und dass der Quellpfad
 *      benennt, was NICHT übernommen wurde (CDP/Daemon).
 *   2. Host (index.js): reine Ableiter und Prüfer, keine Datei-Schreibzugriffe,
 *      kein Netz, kein Modell, kein Zufall, kein Prozess-Ende. Ein Spiegel, der
 *      schreibt, ist kein Spiegel.
 *   3. Client (client.js): der native Side Panel über `main` + `sidebar.panellist`,
 *      dieselben Speicherschlüssel, dieselbe Nutzlast-Vorlage (keine zweite
 *      Wahrheit) und keine DOM-Injektions-Tricks (innerHTML, eval, document.write).
 *
 * Die Tests (scripts/gate/tests/markers.test.mjs) fahren zusätzlich das echte
 * Bundle isoliert gegen den Vertrag — inklusive der exakten Nutzlast-Zeile.
 */
export const id = 'markers';

import { check as runCheck } from '../../lib/markers-checks.mjs';

/** Der Gate-Einstieg: die Prüfungen liegen in `scripts/lib/markers-checks.mjs`. */
export function check(ctx) {
  return runCheck(ctx);
}

export * from '../../lib/markers-checks.mjs';
