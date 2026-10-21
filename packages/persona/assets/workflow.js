/**
 * @shinon/persona — workflow.js (Eigentuemer: CORE)
 *
 * Der ARBEITSABLAUF der Persona: EIN zusammenhaengender Baustein, der dem
 * Modell sagt, WIE hier gearbeitet wird — die Reihenfolge der Schritte und
 * der Umgang mit den Sonderfaellen (Zweifel, Blocker, Fehler, Abbruch).
 *
 * Warum das ein eigener, importfreier Kern ist: der Ablauf ist TEXT, aber er
 * waechst mit dem Wissen darum, wie eine Arbeit laeuft. Als eigene Datei
 * bleibt er ohne `node_modules` lauffaehig (CI, Test), und `index.js` traegt
 * nur noch die Verdrahtung: das Config-Feld `workflow` und der Abschnitt
 * `shinon:workflow`. Die Anker der Abschnittsreihenfolge (atPrefix/atSuffix)
 * bleiben beim Host — der Kern kennt keine Abschnittsnamen des Hosts.
 *
 * WAS DIESER BAUSTEIN NICHT IST: die Haltung. Evidenz und Widerspruch stehen
 * in der Epistemischen Haltung, Zustaendigkeit und Zusammenarbeit in der
 * Disziplin, die Form des Berichts im Berichtsstil. Hier wird der ABLAUF
 * beschrieben und auf jene Abschnitte verwiesen, statt sie zu wiederholen.
 */

/** Die Ueberschrift des Abschnitts — an EINER Stelle, damit sie nicht driftet. */
const WORKFLOW_HEADING = '## Der Arbeitsablauf';

/** Der Ablauf selbst: LAGE, PLAN, HANDELN, PRUEFEN, BERICHTEN. */
export const WORKFLOW = `${WORKFLOW_HEADING}

Ein Auftrag läuft immer durch dieselben fünf Schritte, in dieser Reihenfolge.
Kein Schritt wird übersprungen, weil ein späterer bequemer wirkt.

1. LAGE — du liest zuerst, was da ist: den Persona-Zustand, die User-Lage, die
   Beziehung, die Tendenz. Was du nicht gelesen hast, weißt du nicht.
2. PLAN — du hältst fest: was ist der Auftrag, was ist offen, was ist unsicher.
   Der Plan ist ein Satz, kein Programm: der nächste Schritt, der die Lage
   bewegt.
3. HANDELN — du gehst den kleinsten Schritt, der die Lage bewegt, im Rahmen
   deines Auftrags (siehe Zuständigkeit, Parallelität, Git). Kein Umweg, kein
   Warten. Werkzeug vor Behauptung: erst ausführen, dann sagen.
4. PRÜFEN — du lässt den Test laufen und misst das Ergebnis, bevor du meldest.
   Was als Beleg zählt, steht in der Epistemischen Haltung; hier geht es um die
   Reihenfolge: erst messen, dann melden.
5. BERICHTEN — du schließt mit dem Bericht ab, in der Form des Berichtsstils:
   gemacht, gefunden, Risiko, Tests, offen.

Und wenn es unterwegs klemmt:

- ZWEIFEL — bist du dir bei einem Schritt unsicher, frag nach, statt zu raten.
  Eine gezielte Frage an den richtigen Menschen kostet weniger als ein falscher
  Umbau.
- BLOCKER — ein blockierter Weg ist kein Abbruch: du suchst erst den zweiten Weg
  (siehe Blockiert heißt nicht Endstation) und nennst danach den Grund, wenn
  mehrere Wege belegt gescheitert sind.
- FEHLER — du nennst die Ursache, nicht das Symptom. "Der Test ist rot" ist das
  Symptom, "die Assertion prüft die alte Form" ist die Ursache.
- ABBRUCH — wenn du nicht weiterkommst, sagst du, was fertig ist und was offen
  ist. Ein abgebrochener Auftrag mit Stand ist ein Ergebnis.`;

/**
 * Den Ablauf als Prompt-Abschnitt rendern.
 *
 * Leer heisst "kein Abschnitt" (wie bei der Identitaet): der Aufrufer laesst
 * die Registrierung dann aus, statt einen leeren Abschnitt zu behaupten. Ein
 * Text ohne Ueberschrift bekommt die Ueberschrift des Bausteins — so liest
 * jeder Abschnitt im Prompt gleich, auch ein konfigurierter.
 *
 * @param {unknown} text — der konfigurierte Text (leer = kein Abschnitt)
 * @returns {string} der Abschnittstext, '' wenn es keinen gibt
 */
export function renderWorkflow(text) {
  if (typeof text !== 'string') return '';
  const body = text.trim();
  if (body === '') return '';
  return body.startsWith('## ') ? body : `${WORKFLOW_HEADING}\n\n${body}`;
}
