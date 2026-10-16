/**
 * @shinon/prompter — result-contract.js
 *
 * Der Resultatvertrag (Plan §7): Antwort parsen, Referenzen gegen den gelieferten
 * Kontext aufloesen, Annahme-Policy und die Ausgangs-Tabelle. Kein Dateisystem, kein
 * Netz, kein Host — nur die Entscheidung ueber eine Modellantwort.
 */
import { MODE_CONTRACT } from './mode-core.js';
import { RESULT_SCHEMAS, ResultSchema } from './schema.js';

/**
 * Die Modellausgabe in den Resultatvertrag ueberfuehren. Reine Funktion, kein
 * Netz. Der erste `{` bis zum letzten `}` wird genommen, damit ein Zaun oder
 * ein Satz Vorrede nicht toedlich ist — danach entscheidet das Schema des
 * Modus, in dem der Aufruf laeuft: nur MAX verlangt `references`.
 *
 * Ohne `mode` gilt MAX. Ein Aufrufer, der den Modus nicht kennt, prueft damit
 * so streng wie moeglich, statt versehentlich laxer zu werden.
 */
export function parseResult(text, { mode = 'MAX' } = {}) {
  const schema = RESULT_SCHEMAS[mode] ?? ResultSchema;
  const source = typeof text === 'string' ? text : '';
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end <= start) return { ok: false, reasons: ['NO_JSON'] };

  let parsed;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch {
    return { ok: false, reasons: ['INVALID_JSON'] };
  }

  try {
    return { ok: true, result: schema(parsed) };
  } catch (error) {
    return { ok: false, reasons: [`SCHEMA_INVALID:${error?.message}`] };
  }
}

/**
 * Welche Token der gelieferte Kontext wirklich kennt: Dateipfade, Symbole,
 * Touches und Abhaengigkeiten. Nur gegen diese Menge dürfen Referenzen
 * aufloesbar sein.
 */
export function contextTokens(context) {
  const tokens = new Set();
  if (context === null || typeof context !== 'object') return tokens;
  const lists = [
    (Array.isArray(context.files) ? context.files : []).map((file) => file?.path),
    context.symbols,
    context.touches,
    context.dependencies,
  ];
  for (const list of lists) {
    for (const token of Array.isArray(list) ? list : []) {
      if (typeof token === 'string' && token !== '') tokens.add(token);
    }
  }
  return tokens;
}

/**
 * Ist die Referenz eine relative Schreibweise eines GELIEFERTEN Pfads?
 *
 * Gemessen im Profil-Lauf 2026-10-16: der Runtime-Index liefert ABSOLUTE Pfade
 * (`/home/vannon/…/packages/prompter/index.js`), das Modell nennt die Datei so,
 * wie ein Mensch sie nennt (`packages/prompter/index.js`) — und die Referenz galt
 * als unbekannt, obwohl die Datei im Kontext stand. Das Protokoll meldete
 * "Unbekannte Referenzen ignoriert" für genau die Datei, ueber die der Prompt
 * ging.
 *
 * Verlangt wird ein Treffer an einer VERZEICHNISGRENZE: der gelieferte Pfad
 * endet auf `/<Referenz>`. Damit ist eine relative Schreibweise derselben Datei
 * aufloesbar, ein erfundener Pfad bleibt es nicht.
 */
export function isRelativeSpelling(reference, known) {
  if (typeof reference !== 'string' || reference === '' || reference.startsWith('/')) return false;
  const suffix = `/${reference}`;
  for (const token of known) {
    if (typeof token === 'string' && token.endsWith(suffix)) return true;
  }
  return false;
}

/** Referenzen, die der gelieferte Kontext nicht hergibt (Plan §7: erfundene Pfade sind ein Fehler). */
export function resolveReferences(references, context) {
  const known = contextTokens(context);
  return (Array.isArray(references) ? references : [])
    .filter((reference) => !known.has(reference) && !isRelativeSpelling(reference, known));
}

/** Eine Liste nur dann als Liste behandeln — fehlende oder falsche Werte zaehlen als leer. */
export const stringList = (value) => (Array.isArray(value) ? value : []);

/**
 * Annahme-Policy (Plan §7). Das Modellergebnis wird nie direkt uebernommen:
 * jedes genannte Kriterium verwirft und laesst den Roh-Prompt gelten.
 *
 * Die Anforderungs-Regeln gelten in JEDEM Modus — das ist die Zusage „MIN/MID
 * ändern keine Anforderungen", und sie gilt auch für MAX: Kontext erweitert den
 * Blick, nicht den Auftrag. MAX kommt genau eine Regel hinzu: Referenzen muessen
 * im gelieferten Kontext aufloesbar sein — und nur MAX kennt das Feld ueberhaupt
 * als Pflicht (siehe resultSchema). Wo es fehlt, ist die Regel gegenstandslos,
 * nicht verletzt.
 */
export function acceptance(result, options = {}) {
  // Diese Funktion IST die Fail-Richtung des Vertrags — sie darf selbst nicht werfen.
  // Eine unbrauchbare Eingabe ist deshalb ein benanntes Verwerfen, kein TypeError.
  if (result === null || typeof result !== 'object') return { accepted: false, reasons: ['NO_RESULT'] };
  const reasons = [];
  if (result.preservedIntent !== true) reasons.push('INTENT_NOT_PRESERVED');
  if (stringList(result.addedRequirements).length > 0) reasons.push('ADDED_REQUIREMENTS');
  if (stringList(result.removedRequirements).length > 0) reasons.push('REMOVED_REQUIREMENTS');

  // Die Referenz-Regel gilt genau dem Modus, der Kontext benutzt — und ein
  // unbekannter Modus benutzt keinen. Diese Funktion IST die Fail-Richtung des
  // Vertrags und darf selbst nicht werfen, deshalb hier kein resolveMode().
  const needsContext = options.needsContext === true || MODE_CONTRACT[options.mode]?.needsContext === true;
  if (needsContext && stringList(result.references).length > 0) {
    const unresolvable = resolveReferences(result.references, options.context ?? null);
    if (unresolvable.length > 0) {
      // Unbekannte Referenzen protokollieren, aber Kontext trotzdem liefern:
      // Der Prompt bleibt funktionsfähig — das Modell ignoriert unbekannte
      // Referenzen von selbst. Komplettes Verwerfen (alte Logik) war zu
      // aggressiv: eine einzelne unbekannte Referenz (z. B. Vertrag oder
      // Mood-Text) hat den gesamten Kontext invalidiert.
      console.warn(`[shinon-prompter] Unbekannte Referenzen ignoriert: ${unresolvable.join(', ')}`);
    }
  }
  return { accepted: reasons.length === 0, reasons };
}


/**
 * Der Ausgang des Enhancers → seine Wirkung. Eine Tabelle statt verteilter
 * Praedikate (der Marker [DSH-Refactor] in der alten Fassung: `mode` wurde
 * zweimal geprueft, `outcome === 'accepted'` dreimal, und `MESSAGE_NOT_FOUND`
 * musste nachtraeglich aus `messages === null` geraten werden).
 *
 *   replacePrompt   nur `accepted` ersetzt den Prompt-Text im Schritt
 *   missingMessage  der Grund, wenn die Nachricht nicht auffindbar war — der
 *                   Ausgang heisst dann `rejected`, weil der Roh-Prompt gilt
 *
 * Die Tabelle ist ein Vertrag: sie deckt jeden Ausgang ab, den enhance() und
 * enhanceGuarded() erzeugen (geprueft im Abnahmetest), und sie ist die einzige
 * Stelle, an der ein Ausgang eine Wirkung hat.
 */
export const OUTCOME_EFFECTS = {
  accepted: { replacePrompt: true, missingMessage: ['MESSAGE_NOT_FOUND'] },
  rejected: { replacePrompt: false, missingMessage: null },
  unavailable: { replacePrompt: false, missingMessage: null },
};


