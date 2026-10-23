/**
 * @shinon/prompter — shinon-md.js (Eigentuemer: ZUSTAND-Lesung)
 *
 * Die Projekt-Anweisung als Pflichtblock: `SHINON.md` ist die EINZIGE
 * Anweisungsdatei, die Shinon aus dem Projekt laedt — statt `AGENTS.md` oder
 * `CLAUDE.md`, die jedem fremden Projekt gehoeren koennen und deren Inhalt
 * dann als Anweisung im Prompt stuende.
 *
 * DREI ZUSAGEN in einer Datei:
 *
 *   1. OPTIONAL: fehlt die Datei oder ist der Pfad leer, gibt es keinen
 *      Block — ein Projekt ohne SHINON.md laeuft einfach ohne (fail-open).
 *   2. AKTIV GEPRUEFT: liegt die Datei vor, wird sie gelesen und geprueft —
 *      lesbar, nicht leer, unter der Byte-Grenze, ohne NUL-Bytes. Ein
 *      Befund landet im Log mit Grund, nie still.
 *   3. KOMPRIMIERT ALS PFLICHT: jede vorhandene Datei wird in den Kontext
 *      injiziert — gekuerzt auf das Zeichen-Budget. Was nicht hineinpasst,
 *      faellt am Abschnittsende weg und wird als gekuerzt markiert, statt
 *      die Datei zu verschweigen oder den Prompt zu sprengen.
 *
 * Nur `node:fs`/`node:path`, kein Bare-Import — derselbe Grund wie bei
 * `project-context.js`: der Kern laeuft in CI ohne `node_modules`.
 * Deterministisch, ohne Modell: Kuerzen heisst schneiden, nicht
 * zusammenfassen — eine Zusammenfassung waere eine Behauptung ueber den
 * Inhalt, ein Schnitt ist nur weniger Inhalt.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/** Der Dateiname — EINE Stelle, damit kein zweiter Name daneben entsteht. */
export const SHINON_MD_NAME = 'SHINON.md';

/** Der Vertrag des Blocks — er steht im Block, damit der Leser ihn kennt. */
export const SHINON_MD_CONTRACT = 'shinon.shinon-md/v1';

/** Obergrenze der Datei: darueber wird nichts injiziert, sondern gemeldet. */
export const SHINON_MD_MAX_BYTES = 16384;

/** Obergrenze des Blocks: darueber wird am Abschnittsende gekuerzt. */
export const SHINON_MD_MAX_CHARS = 6000;

const NUL = String.fromCharCode(0);

/**
 * Die SHINON.md eines Workspaces lesen, pruefen und komprimieren.
 *
 * @param {object} quellen
 * @param {string} quellen.mdPath der konfigurierte Dateiname (leer = aus)
 * @param {string} quellen.root die Workspace-Wurzel (oder null)
 * @param {Map} [quellen.cache] der Cache je Pfad (der Aufrufer haelt ihn)
 * @param {Function} [quellen.warn] der Diagnosekanal
 * @param {Function} [quellen.log] der Info-Kanal
 * @returns {{ text: string, reason: string, chars: number, originalChars: number, gekuerzt: boolean }}
 */
export function readShinonMd({
  mdPath = SHINON_MD_NAME,
  root = null,
  cache = new Map(),
  warn = () => {},
  log = () => {},
} = {}) {
  const leer = { text: '', reason: 'SHINON_MD_AUS', chars: 0, originalChars: 0, gekuerzt: false };
  if (typeof mdPath !== 'string' || mdPath.trim() === '') return leer;
  const wurzel = typeof root === 'function' ? root() : root;
  if (typeof wurzel !== 'string' || wurzel === '') return { ...leer, reason: 'SHINON_MD_KEIN_ROOT' };
  const path = isAbsolute(mdPath) ? mdPath : join(wurzel, mdPath);
  if (cache.has(path)) return cache.get(path);
  let ergebnis = { ...leer, reason: 'SHINON_MD_FEHLT' };
  try {
    if (!existsSync(path)) {
      cache.set(path, ergebnis);
      return ergebnis;
    }
    const roh = readFileSync(path, 'utf8');
    if (roh.includes(NUL)) {
      ergebnis = { ...leer, reason: 'SHINON_MD_BINAER' };
    } else if (roh.trim() === '') {
      ergebnis = { ...leer, reason: 'SHINON_MD_LEER' };
    } else if (Buffer.byteLength(roh, 'utf8') > SHINON_MD_MAX_BYTES) {
      warn(`SHINON.md zu gross (${Buffer.byteLength(roh, 'utf8')} > ${SHINON_MD_MAX_BYTES} Bytes) — nicht injiziert`);
      ergebnis = { ...leer, reason: 'SHINON_MD_ZU_GROSS' };
    } else {
      const originalChars = roh.length;
      const text = komprimiere(roh);
      const gekuerzt = text.length < originalChars;
      ergebnis = {
        text,
        reason: gekuerzt ? 'SHINON_MD_GEKUERZT' : 'SHINON_MD_OK',
        chars: text.length,
        originalChars,
        gekuerzt,
      };
      log(`SHINON.md geladen (${originalChars} -> ${text.length} Zeichen${gekuerzt ? ', gekuerzt' : ''})`);
    }
  } catch (error) {
    warn(`SHINON.md nicht lesbar (${error?.message ?? error}) — kein Anweisungsblock`);
    ergebnis = { ...leer, reason: 'SHINON_MD_UNLESBAR' };
  }
  cache.set(path, ergebnis);
  return ergebnis;
}

/**
 * Deterministisch komprimieren: Kommentare raus, Leerzeilen falten,
 * Randraum schneiden, Ueberhang am Abschnittsende schneiden.
 */
export function komprimiere(roh) {
  const ohneKommentare = String(roh).replace(/<!--[\s\S]*?-->/g, '');
  const zeilen = ohneKommentare.split('\n').map((zeile) => zeile.replace(/[ \t]+$/, ''));
  const gefaltet = [];
  let leer = 0;
  for (const zeile of zeilen) {
    if (zeile.trim() === '') {
      leer += 1;
      if (leer <= 1) gefaltet.push('');
      continue;
    }
    leer = 0;
    gefaltet.push(zeile);
  }
  let text = gefaltet.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
  if (text.length <= SHINON_MD_MAX_CHARS) return text;
  const schnitt = text.lastIndexOf('\n\n', SHINON_MD_MAX_CHARS);
  const kopf = schnitt > 0 ? text.slice(0, schnitt) : text.slice(0, SHINON_MD_MAX_CHARS);
  return `${kopf}\n\n[SHINON.md gekuerzt: ${text.length} -> ${kopf.length} Zeichen]`;
}

/**
 * Den geprueften Text als Pflichtblock rendern. Leer = kein Block: ein
 * leerer Block waere eine Anweisung ohne Inhalt.
 */
export function renderShinonBlock(text) {
  if (typeof text !== 'string' || text.trim() === '') return '';
  return [`<${SHINON_MD_CONTRACT}>`, text.trim(), `</${SHINON_MD_CONTRACT}>`].join('\n');
}
