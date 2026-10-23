/**
 * narrative — die Narrative Engine: lesen, ableiten, melden. Sie handelt nicht.
 *
 * WARUM DIESES GATE EXISTIERT (gemessen, nicht behauptet): `@shinon/narrative`
 * ist seit Zug 5 im Profil aktiv und rechnet bei jedem Spines-Ereignis einen
 * Composite (Arc, Erzähler, Beziehungsstufe, eigener Mood). Emittiert wurde er
 * auf `shinon/narrative/state` — und diesen Kanal hatte NIEMAND abonniert. Die
 * Engine war ein Radiosender ohne Empfänger: sie rechnete, und kein Gerät in der
 * Wohnung hatte ein Programm eingestellt. Das Paket hatte Unit-Tests für seine
 * Mathematik und kein Gate für seine VERDRAHTUNG — genau die Lücke, durch die
 * der Composite ins Leere gehen konnte.
 *
 * Fünf Zusagen, fünf Prüfungen:
 *   1. Der Vertrag (assets/narrative-state.json) trägt seinen Namen und ist
 *      vollständig: Mood-Tabelle, Erzähler-Regel, Arc-Themen, Beziehungsstufen.
 *      Jeder Ereignistyp der Mood-Tabelle ist ein Typ des Spines — eine Zeile
 *      auf ein Ereignis, das es nicht gibt, wäre ein Takt, der nie klingt.
 *   2. Die Ableitung ist deterministisch und uhrfrei: kein Zufall, keine Uhr,
 *      kein Modell, kein Tool, kein Schreiben — im Laufzeitcode UND im Kern.
 *   3. Der Ausgang ist genau EINER: der Composite geht als Ereignis
 *      (`STATE_CHANNEL`) hinaus. Es gibt keinen zweiten Weg — ein `ctx.provide`
 *      eines Zustands wäre der „tote Dienst" von vorher, und der ist entfernt.
 *   4. Der KANAL HAT EINEN ABNEHMER. Das ist die Zusage, die bis Zug 6
 *      fehlte: der Veredler abonniert den Kanal und trägt die Lage als
 *      DATENSATZ in seine Entscheidungsspur (`stand.narrative`), nicht als
 *      Prompt-Element. Ohne diese Prüfung darf das Gate nicht grün sein —
 *      ein Sender ohne Empfänger ist kein Feature.
 *
 *      DER NAME KOMMT SEIT 2026-10-20 AUS `@shinon/seams/core`, nicht mehr als
 *      Literal. Beide Abnehmer sind Host-Hälften und dürfen importieren; die
 *      Prüfung verlangt deshalb den IMPORT und meldet ein Literal als Befund.
 *      Vorher war es umgekehrt — richtig für die damalige Lage, falsch seither:
 *      zwei Literale, die niemand liest, sind eine Kopie, kein Empfänger.
 *   5. Das Profil aktiviert das Bundle, sonst läuft die Engine nie (dieselbe
 *      Regel wie beim Persona- und beim Scoring-Gate).
 *
 * Die reinen Funktionen des Pakets sind schon ohne node_modules getestet
 * (packages/narrative/test/narrative.test.mjs). Dieses Gate prüft die
 * VERDRAHTUNG, die ein Pakettest von innen nicht sehen kann.
 */
export const id = 'narrative';

import { check as runCheck } from '../../lib/narrative-checks.mjs';

/** Der Gate-Einstieg: die Prüfungen liegen in `scripts/lib/narrative-checks.mjs`. */
export function check(ctx) {
  return runCheck(ctx);
}

export * from '../../lib/narrative-checks.mjs';
