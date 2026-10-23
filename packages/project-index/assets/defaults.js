/**
 * @shinon/project-index — defaults.js
 *
 * Liest `defaults.json` (Vertrag `shinon.project-index/defaults-v1`) einmal.
 * Die Datei ist die EINE Quelle der Vorgaben: `index-context.js` (Budget,
 * Dateigrenze), `index-run.js` (Dateigrenze) und das Schemastery-Default in
 * `index.js` ziehen alle von hier.
 *
 * Nur `node:fs` — der Index-Kern bleibt ohne Fremdimporte pruefbar. Fehlt die
 * Datei, wirft das Modul beim Laden; ein stiller Rueckfall waere die zweite
 * Quelle, die diese Datei abschafft.
 */
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./defaults.json', import.meta.url), 'utf8'));

if (data.contract !== 'shinon.project-index/defaults-v1') {
  throw new Error(`defaults.json: unerwarteter Vertrag ${data.contract}`);
}

export const INDEX_DEFAULTS = data;
