/**
 * Der Projektkontext und das Wissen als RUNTIME-CONTEXT — unabhaengig vom
 * Veredler.
 *
 * ANLASS (gemessen 2026-10-21, echter Turn am DSH-Host):
 *
 *   [shinon-prompter] MAX-Kontext aus dem Index (shinon_index_query, Budget 6000 Token)
 *   [shinon-prompter] verworfene One-Shot-Antwort (NO_JSON), 171 Zeichen
 *   [shinon-prompter] verworfen (NO_JSON) — Roh-Prompt gilt
 *
 * Der Index hatte 502 Dateien, 3926 Symbole, 2710 Chunks. Der One-Shot
 * antwortete mit Prosa statt JSON ("Ich arbeite schrittweise und systematisch:
 * ..."), der Verwerfer erkannte die Antwort und verweigerte, den Prompt damit
 * zu ersetzen — RICHTIG. Aber damit fiel der ganze Kontext weg: er war nur im
 * One-Shot-Request gewesen.
 *
 * DIE AUSBESSERUNG: der Kontext ist WISSEN ueber das Projekt, keine
 * Veredelung des Auftrags. Er gehoert deshalb in einen Kanal, der nicht vom
 * Veredler abhaengt. Der DSH hat genau dafuer einen: `systemPrompt.context()`.
 * Das Ergebnis ist eine EIGENE Nachricht (Quelle `runtime-context`), die
 * pro Schritt neu projiziert wird und den vorherigen Stand ERSETZT — nicht
 * haeuft. Das ist der Unterschied zwischen "der Kontext ist da" und "der
 * Kontext ist da, egal was der Veredler tut".
 *
 * DER VERTRAG bleibt: der Auftragstext wird nicht angefasst. Der
 * Verwerfungsfall laesst die Nachricht unangetastet (prompter-contract.test.mjs,
 * "Roh-Prompt bleibt erhalten").
 */

/** Der Name des Runtime-Contexts — er steht als Konstante, nicht als Literal. */
export const CONTEXT_NAME = 'shinon.project-context';

/**
 * Die Reihenfolge-Anker. Der DSH kennt eigene Anker (WORKING_DIRECTORY 100,
 * SANDBOX_POLICY 110, ...); der Shinon-Anker liegt DARUEBER, damit der
 * Projektkontext nach der Arbeitsumgebung und vor dem Harness steht.
 */
export const CONTEXT_ORDER = 300;

/** Der Vertrag des Blocks — er steht im Block, damit der Leser ihn kennt. */
export const CONTEXT_CONTRACT = 'shinon.prompter/context-v1';

/**
 * Den Projektkontext als EINEN Runtime-Context-Text rendern.
 *
 * Leerer Kontext = kein Block. Ein leerer Block waere eine Behauptung: das
 * Modell wuerde "der Kontext ist leer" lesen und daraus schliessen, das Projekt
 * habe keine Dateien.
 *
 * @param {object|null} context der Kontext aus dem Index
 * @returns {string} der Text (leer, wenn es nichts gibt)
 */
export function renderContextBlock(context) {
  if (context === null || context === undefined || typeof context !== 'object') return '';
  const files = Array.isArray(context.files) ? context.files : [];
  const symbols = Array.isArray(context.symbols) ? context.symbols : [];
  const touches = Array.isArray(context.touches) ? context.touches : [];
  const dependencies = Array.isArray(context.dependencies) ? context.dependencies : [];
  // Keine Datei, kein Symbol, kein Touch, keine Abhaengigkeit: es gibt nichts
  // zu sagen. Der Block faellt weg, statt eine leere Behauptung zu tragen.
  if (files.length === 0 && symbols.length === 0 && touches.length === 0 && dependencies.length === 0) return '';
  const teile = [];
  if (typeof context.project === 'string' && context.project !== '') {
    teile.push(`Projekt: ${context.project}`);
  }
  if (files.length > 0) {
    teile.push(`Dateien (${files.length}): ${files.slice(0, 40).map((file) => file?.path).filter(Boolean).join(', ')}`);
  }
  if (symbols.length > 0) {
    teile.push(`Symbole (${symbols.length}): ${symbols.slice(0, 60).join(', ')}`);
  }
  if (touches.length > 0) {
    teile.push(`Touches (${touches.length}): ${touches.slice(0, 40).join(', ')}`);
  }
  if (dependencies.length > 0) {
    teile.push(`Abhaengigkeiten (${dependencies.length}): ${dependencies.slice(0, 40).join(', ')}`);
  }
  return [`<${CONTEXT_CONTRACT}>`, ...teile.map((teil) => `- ${teil}`), `</${CONTEXT_CONTRACT}>`].join('\n');
}

/**
 * Den Runtime-Context registrieren.
 *
 * @param {object} sp der systemPrompt-Dienst
 * @param {object} quellen
 * @param {Function} quellen.context der Kontext (oder null)
 * @param {Function} [quellen.wissen] der Wissensblock (oder null)
 * @param {Function} [quellen.spricht] liefert der Kanal in dieser Sitzung?
 * @returns {Function} der Disposer
 */
export function registerContext(sp, quellen = {}) {
  if (typeof sp?.context !== 'function') {
    console.error('[shinon-prompter] systemPrompt-Dienst ohne context() — der Projektkontext kommt NICHT an');
    return () => {};
  }
  const { context = () => null, wissen = () => null, spricht = () => true } = quellen;
  return sp.context({
    name: CONTEXT_NAME,
    order: CONTEXT_ORDER,
    // LITERAL: der Block ist ein gelesener Messwert, keine Vorlage. Ohne diese
    // Zeile wuerde der DSH `{{name}}` im gelesenen Wert suchen.
    interpolate: false,
    text: (assemblyCtx) => {
      if (typeof spricht === 'function' && !spricht(assemblyCtx)) return '';
      const kontext = typeof context === 'function' ? context() : null;
      const blokte = [];
      const gerendert = renderContextBlock(kontext);
      if (gerendert !== '') blokte.push(gerendert);
      const wissensBlock = typeof wissen === 'function' ? wissen() : null;
      if (typeof wissensBlock === 'string' && wissensBlock !== '') blokte.push(wissensBlock);
      return blokte.join('\n\n');
    },
  });
}
