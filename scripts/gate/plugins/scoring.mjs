/**
 * scoring — Scorecard, Decay, Relation, Tendenz. Lesen, nie schreiben.
 *
 * DIE ZUSAGE, ehrlich formuliert (Zug 3): der Scoring-Laufzeitcode LIEST. Sein
 * einziger Ausgang ist der Signal-Anhang im Index — EINE Operation (`save`) auf
 * dem einen schmalen Dienst, den der Projekt-Index anbietet; dazu genau EIN
 * `load` beim Start. Alles andere, was diese Schicht hervorbringt (Tafel,
 * Tendenz, Injektion), ist HERGELEITET und geht nirgendwohin. Frühere Fassungen
 * dieses Kopfes sprachen von „drei Zusagen" und von einer Schreib-Scope-Grenze,
 * die den Host nicht nannte: die Weitergabe an die Ablage ist ein Ausgang, und
 * ein Gate, das ihn verschweigt, prüft ihn auch nicht.
 *
 * Sieben Prüfungen:
 *   1. Schreib-Scope: der Scoring-Laufzeitcode enthält keinen einzigen
 *      Schreib-/Ausführungs-/Netz-/Modellaufruf, und jede Pfad-Angabe im Code
 *      bleibt im eigenen Paket auf bekannte Dateien beschränkt. Was nicht
 *      schreiben KANN, schreibt auch nicht daneben.
 *   2. Trigger-Vertrag fail-closed: kein Trigger feuert ins Leere — jede
 *      Dimension existiert, jede Relationsstufe ist benannt, jeder Skill steht
 *      im Technik-Profil, jeder Event-Typ kommt aus dem Spine, und die
 *      erwartete Nutzlast ist die, die der Spine liefert. Eine Lücke ist ein
 *      Fehler, kein stilles Überspringen.
 *   3. Konservativ bleibt konservativ: Decay klein, Kühlen mindestens zwei
 *      Signale, Triggerzahl gedeckelt — gegen Reward-Sparsität gebaut, nicht
 *      gegen sie getestet.
 *   4. Aktivierung: das Profil muss das Bundle laden, sonst läuft das
 *      Scoring nie (dieselbe Regel wie beim Persona-Gate).
 *   5. Signal-Vertrag (K5, fail-closed): die Signaltabelle trägt genau die
 *      sieben Zeilen, jede beobachtbare Zeile nennt eine Quelle, die es im
 *      Spine wirklich gibt und die er wirklich erreicht, jede nicht
 *      beobachtbare Zeile nennt ihren Grund, keine Zeile verspricht ein Signal
 *      ohne Zulieferer — und die Quelle eines Signals ist ein NATIVER DSH-Typ,
 *      den der Carrier abbildet. Kein Deckel, kein Zähler-Limit, keine
 *      Sekundenregel in den Daten.
 *   6. Tendenz-Vertrag (Zug 3): die Tendenz-Regeln tragen ihren Vertragsnamen,
 *      ihre KLASSEN decken jedes beobachtbare Signal genau einmal ab und kein
 *      Signal zwei Pole, ihre Stufen sind absteigend und enden bei 0, ihre
 *      Haltungen sind geordnete Bedingungen über benannte Klassen und Stufen
 *      (die letzte bedingungslos), die Mindestevidenz ist eine ganze Zahl ≥ 1 —
 *      und jeder der drei Mechanismen (Faktor, Widerruf, Vergessen) nennt einen
 *      ORT, der im Vertrag wirklich auflöst. Eine Tendenz ohne Herkunft wäre
 *      eine Behauptung; ein Mechanismus ohne Ort wäre eine Absichtserklärung.
 *   7. Ausgang: genau EIN `save` auf dem Dienst der Ablage (der Signal-Anhang)
 *      und genau EIN `load` beim Start — kein zweites Schreibverb, kein zweiter
 *      Weg. Das ist die Zusage aus dem Kopf, als Prüfung.
 *
 * Die reinen Funktionen sind ohne node_modules testbar; die Tests liegen in
 * scripts/gate/tests/scoring.test.mjs.
 */
import { scoringCheck } from '../../lib/scoring-gate.mjs';

// Die Fläche bleibt Name für Name dieselbe: Tests und andere Gates lesen die
// Prüfungen und Konstanten weiter aus `plugins/scoring.mjs`.
export * from '../../lib/scoring-contracts.mjs';
export * from '../../lib/scoring-rules.mjs';

export const id = 'scoring';

/** Der Gate-Einstieg: der Ablauf liegt in `scripts/lib/scoring-gate.mjs`. */
export function check(ctx) {
  return scoringCheck(ctx);
}
