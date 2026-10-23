/**
 * @shinon/prompter — prompt-text.js (Eigentümer: CORE)
 *
 * Der TEXT der Agenten-Briefe liegt als Daten in `prompts.json` (Vertrag
 * `shinon.prompts/v1`). Diese Datei lädt ihn und setzt benannte Parameter ein.
 *
 * ZWILLING, ABER GEPRÜFT: `packages/persona/assets/prompt-text.js` ist die
 * zweite Fassung derselben 40 Zeilen. Ein Paket darf das andere nicht
 * importieren (AGENTS.md), und ein gemeinsamer Ort würde die Paketgrenze
 * verschieben. Beide werden deshalb von
 * `scripts/gate/tests/prompt-resources.test.mjs` mit denselben Fällen
 * gefahren: fehlender Parameter, unbekannter Platzhalter, fremder Vertrag.
 *
 * KEIN Bare-Import: nur `node:fs`, damit der Kern ohne `node_modules` läuft.
 */
import { readFileSync } from 'node:fs';

/** Der Vertrag der Ressource. Ein fremdes Dokument wird nicht gerendert. */
export const PROMPT_CONTRACT = 'shinon.prompts/v1';

function load() {
  const doc = JSON.parse(readFileSync(new URL('./prompts.json', import.meta.url), 'utf8'));
  if (doc?.contract !== PROMPT_CONTRACT) {
    throw new Error(`prompts.json: fremder Vertrag ${String(doc?.contract)} — erwartet ${PROMPT_CONTRACT}`);
  }
  if (doc.texts === null || typeof doc.texts !== 'object') {
    throw new Error('prompts.json: `texts` fehlt');
  }
  return doc.texts;
}

/** Alle Texte als eingefrorene Tabelle — id → { kind, text }. */
export const PROMPTS = Object.freeze({ ...load() });

/** Ein Eintrag oder ein benannter Fehler. */
export function promptDef(id) {
  const entry = PROMPTS[id];
  if (entry === undefined) throw new Error(`PROMPT_UNKNOWN:${String(id)}`);
  if (typeof entry.text !== 'string' || entry.text === '') throw new Error(`PROMPT_EMPTY:${id}`);
  return entry;
}

/**
 * Einen Text rendern. Fehlt ein Parameter oder bleibt ein Platzhalter stehen,
 * ist das ein Fehler — ein halb gerenderter Brief sieht wie eine gültige
 * Anweisung aus und ist die schlechtere Variante eines fehlenden Briefs.
 */
export function promptText(id, params = {}) {
  const entry = promptDef(id);
  const text = entry.text.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, key) => {
    if (!Object.hasOwn(params, key)) throw new Error(`PROMPT_PARAM_MISSING:${id}:${key}`);
    const value = params[key];
    if (value === null || value === undefined) throw new Error(`PROMPT_PARAM_MISSING:${id}:${key}`);
    return String(value);
  });
  if (text.includes('{{')) throw new Error(`PROMPT_PLACEHOLDER_UNKNOWN:${id}`);
  return text;
}
