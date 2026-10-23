/**
 * @shinon/persona — prompt-text.js (Eigentümer: CORE)
 *
 * Der TEXT der Persona liegt als Daten in `prompts.json` (Vertrag
 * `shinon.prompts/v1`), nicht als Template-Literal im Host. Diese Datei lädt
 * ihn und setzt die benannten Parameter ein.
 *
 * WARUM ÜBERHAUPT EIN RENDERER: ein Text, der aus Daten kommt, darf nicht
 * stillschweigend halb gerendert werden. Fehlt ein Parameter, bleibt ein
 * `{{name}}` stehen — und das Modell liest eine kaputte Anweisung, die wie
 * eine gültige aussieht. Deshalb ist jeder unbekannte Platzhalter ein Fehler,
 * und ein fehlender Parameter ebenfalls; die einzige erlaubte Richtung ist
 * "gar kein Block", nie "Block mit Lücke".
 *
 * KEIN Bare-Import: nur `node:fs`, damit der Kern in CI ohne `node_modules`
 * läuft. Die Datei liest genau ihre eigene Ressource, keine Konfiguration und
 * keinen Zustand — die Ablage bleibt beim Host.
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
 * Einen Text rendern. `params` sind die einzigen erlaubten Platzhalter; ein
 * zusätzlicher Parameter ist kein Fehler (Aufrufer darf Kontext mitgeben),
 * ein fehlender oder ein unbekannter Platzhalter schon.
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
