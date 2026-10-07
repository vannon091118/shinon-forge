/**
 * source-scan.mjs — Quelltext-Scan für die Gate-Plugins.
 *
 * Warum als eigene Datei: „dieser Code darf X nie aufrufen" ist ein Vertrag,
 * und ein Vertrag gehört an eine Stelle.
 *
 * Zwei Genauigkeiten, die den Unterschied machen:
 *   - Kommentare zählen nicht. Ein Modul darf erklären, was es NICHT tut,
 *     ohne dass das Gate rot wird (deshalb wird der Kommentar entfernt, nicht
 *     der Kommentar verboten).
 *   - Strings zählen nur dort, wo sie Code sein können. Die Persona trägt
 *     Prompt-Texte, in denen „Math.random()" als Warnung für das Modell steht —
 *     das ist Dateninhalt, kein Aufruf. `Math.random()` im Code daneben bleibt
 *     ein Befund.
 * Modul-Importe (`require('child_process')`) werden weiterhin erkannt: für
 * solche Token liest der Scan die Strings mit (`mode: 'module'`).
 *
 * Bewusst naiv gehalten: kein Parser, kein node_modules.
 */

/** Block- und Zeilenkommentare entfernen (URLs wie https://… bleiben erhalten). */
export function stripComments(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ');
}

/** String-Literale leeren (Inhalt raus, Anführungszeichen bleiben). */
export function stripStrings(source) {
  return String(source)
    .replace(/`(?:\\.|[^`\\])*`/gs, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/** Laufzeitcode ohne Kommentare und ohne String-Inhalte. */
export function codeOnly(source) {
  return stripStrings(stripComments(source));
}

/**
 * Verbotene Token finden.
 * @param {string} source
 * @param {string[]} tokens
 * @param {{ mode?: 'code' | 'module' | 'raw' }} [options]
 *   code   — ohne Kommentare und ohne Strings (Standard: echte Aufrufe)
 *   module — ohne Kommentare, mit Strings (Import-/Modulnamen)
 *   raw    — ungefiltert (nur wenn ausdrücklich gewollt)
 */
export function findForbidden(source, tokens, options = {}) {
  const mode = options.mode ?? 'code';
  const haystack = mode === 'raw' ? String(source) : mode === 'module' ? stripComments(source) : codeOnly(source);
  return tokens.filter((token) => haystack.includes(token));
}

/**
 * Pflicht-Token finden.
 * @param {{ mode?: 'code' | 'module' | 'raw' }} [options]
 *   code   — ohne Kommentare und ohne Strings (Standard: der Token muss Code sein)
 *   module — ohne Kommentare, mit Strings; für Pflicht-Token, die selbst Strings
 *            sind (Slot-Namen, Speicherschlüssel, Vertrags-Vorlagen)
 *   raw    — ungefiltert
 * Dieselbe Genauigkeits-Regel wie findForbidden — nur die andere Richtung
 * (hier fehlen Token, dort sind welche verboten).
 */
export function findMissing(source, tokens, options = {}) {
  const mode = options.mode ?? 'code';
  const haystack = mode === 'raw' ? String(source) : mode === 'module' ? stripComments(source) : codeOnly(source);
  return tokens.filter((token) => !haystack.includes(token));
}
