/**
 * @shinon/prompter — defaults.js
 *
 * Liest `defaults.json` (Vertrag `shinon.prompter/defaults-v1`) einmal und gibt
 * die Werte heraus. Die Datei ist die EINE Quelle der Vorgaben: die Konstante in
 * `mode-core.js` und das Schemastery-Default in `schema.js` ziehen beide von
 * hier, damit ein geaenderter Wert nicht an einer Stelle haengen bleibt.
 *
 * Nur `node:fs`, kein Fremdimport — dieselbe Regel wie `prompt-text.js`, damit
 * der Kern ohne `node_modules` pruefbar bleibt. Fehlt oder bricht die Datei,
 * wirft das Modul beim Laden: ein stiller Rueckfall auf erfundene Zahlen waere
 * genau die zweite Quelle, die diese Datei abschafft.
 */
import { readFileSync } from 'node:fs';

const here = new URL('./defaults.json', import.meta.url);
const data = JSON.parse(readFileSync(here, 'utf8'));

if (data.contract !== 'shinon.prompter/defaults-v1') {
  throw new Error(`defaults.json: unerwarteter Vertrag ${data.contract}`);
}

export const PROMPTER_DEFAULTS = data;
export const LLM_DEFAULTS = data.llm;
export const CONTEXT_DEFAULTS = data.context;
export const PATH_DEFAULTS = data.paths;
