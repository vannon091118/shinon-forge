#!/usr/bin/env node
/**
 * scripts/assets/build-sprites.mjs — Gitterdateien zu SVG (Codemon-Sprites).
 *
 * WARUM ES DIESES SKRIPT GIBT: Die Sprites sind HANDGEZEICHNETE 32x32-Gitter
 * (`packages/codingmon/assets/sprites/*.grid`, ein Zeichen je Pixel, `.` ist
 * transparent), keine fremden Bilder — also keine Bildrechte-Frage. Dieses
 * Skript wandelt sie in SVG um (ein Rechteck je Pixel, gleiche Pixel einer
 * Zeile zusammengefasst) und PRUEFT dabei das Format: genau 32 Zeilen zu je
 * → Kanon: docs/COMMENT-KANON.md#k-4ae8e5d285a2
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPRITE_DIR = join(ROOT, 'packages', 'codingmon', 'assets', 'sprites');
const UI_DIR = join(ROOT, 'packages', 'codingmon', 'assets', 'ui');
const CLIENT_FILE = join(ROOT, 'packages', 'codingmon', 'client.js');

const LF = String.fromCharCode(10);

/** Die Palette aus dem Zielbild — keine andere Farbe kommt in ein Sprite. */
export const PALETTE = {
  K: '#0B0F14',
  V: '#A855F7',
  P: '#7C3AED',
  I: '#6366F1',
  W: '#E0E7FF',
};

export const GRID_SIZE = 32;

/**
 * Eine Gitterdatei lesen und pruefen.
 * @returns {{rows: string[], colors: Set<string>}}
 * @throws bei falscher Groesse oder fremdem Zeichen (mit Datei und Zeile).
 */
export function readGrid(file) {
  const name = basename(file);
  const text = readFileSync(file, 'utf8').split(String.fromCharCode(13)).join('');
  const rows = text.split(LF);
  // Eine letzte leere Zeile (Dateiende mit LF) gehoert nicht zum Gitter.
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  if (rows.length !== GRID_SIZE) {
    throw new Error(name + ': ' + rows.length + ' Zeilen statt ' + GRID_SIZE);
  }
  const colors = new Set();
  const allowed = Object.keys(PALETTE);
  rows.forEach((row, index) => {
    if (row.length !== GRID_SIZE) {
      throw new Error(name + ':' + (index + 1) + ': ' + row.length + ' Zeichen statt ' + GRID_SIZE);
    }
    for (const char of row) {
      if (char === '.') continue;
      if (PALETTE[char] === undefined) {
        throw new Error(name + ':' + (index + 1) + ': fremdes Zeichen ' + JSON.stringify(char) + ' (erlaubt: . ' + allowed.join(' ') + ')');
      }
      colors.add(char);
    }
  });
  if (colors.size > 5) throw new Error(name + ': ' + colors.size + ' Farben statt hoechstens 5');
  return { rows, colors };
}

/**
 * Gitter zu SVG: ein `<rect>` je maximalem horizontalen Lauf einer Zeile.
 * `shape-rendering: crispEdges` haelt die Pixel hart (Gen-1-Stil).
 */
export function gridToSvg(rows) {
  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row[x];
      if (char === '.') {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === char) end += 1;
      rects.push('<rect x="' + x + '" y="' + y + '" width="' + (end - x) + '" height="1" fill="' + PALETTE[char] + '"/>');
      x = end;
    }
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + GRID_SIZE + ' ' + GRID_SIZE + '" shape-rendering="crispEdges">' + rects.join('') + '</svg>' + LF;
}

/**
 * Die eingebetteten Spiegel in `client.js`: das Bundle ist selbststaendig und
 * kann keine Datei aus `assets/` laden (DSH liefert Plugin-Ressourcen im
 * Browser nicht als Dateien aus) — also traegt es die Gitter und die UI-SVGs
 * als Zeichenketten. Quelle bleiben die Dateien hier; `--embed` schreibt die
 * markierten Bloecke neu, der Gate-Test vergleicht sie (`sprites.test.mjs`).
 */
export const SPRITE_REGION = 'generated-sprites';
export const UI_REGION = 'generated-ui';

/** Erwartete Einbettung aus den Quelldateien bauen (fuer `--embed` und Test). */
export function buildEmbed() {
  const grids = {};
  const gridFiles = readdirSync(SPRITE_DIR).filter((f) => f.endsWith('.grid')).sort();
  for (const file of gridFiles) {
    const { rows } = readGrid(join(SPRITE_DIR, file));
    grids[file.slice(0, file.length - '.grid'.length)] = rows.join(LF);
  }
  const ui = {};
  const uiFiles = readdirSync(UI_DIR).filter((f) => f.endsWith('.svg')).sort();
  for (const file of uiFiles) {
    ui[file.slice(0, file.length - '.svg'.length)] = readFileSync(join(UI_DIR, file), 'utf8');
  }
  return { grids, ui };
}

/**
 * Einen markierten Block aus einem Text lesen und als Objekt parsen.
 * Gestalt: `// >>> <region> …(Rest der Zeile)` LF `    const <NAME> = {…};` LF
 * `    // <<< <region>`. Zurueck kommt das Objekt hinter dem `=`.
 */
export function readEmbedRegion(text, region, constName) {
  const openAt = text.indexOf('// >>> ' + region);
  if (openAt === -1) throw new Error('Block "' + region + '" ohne Startmarke');
  const bodyStart = text.indexOf(LF, openAt) + 1;
  const closeAt = text.indexOf('// <<< ' + region, bodyStart);
  if (closeAt === -1) throw new Error('Block "' + region + '" ohne Schlussmarke');
  const body = text.slice(bodyStart, closeAt).trim();
  const prefix = 'const ' + constName + ' = ';
  if (!body.startsWith(prefix) || !body.endsWith(';')) {
    throw new Error('Block "' + region + '" enthaelt keine Zuweisung an ' + constName);
  }
  return JSON.parse(body.slice(prefix.length, -1));
}

/** Beide Bloecke in `client.js` neu schreiben; @returns {changed: boolean}. */
export function embedIntoClient() {
  const built = buildEmbed();
  const pairs = [
    [SPRITE_REGION, 'SPRITE_GRIDS', built.grids],
    [UI_REGION, 'UI_SVG', built.ui],
  ];
  let text = readFileSync(CLIENT_FILE, 'utf8');
  let changed = false;
  for (const [region, constName, value] of pairs) {
    const openAt = text.indexOf('// >>> ' + region);
    if (openAt === -1) throw new Error('Block "' + region + '" ohne Startmarke');
    const bodyStart = text.indexOf(LF, openAt) + 1;
    const closeAt = text.indexOf('// <<< ' + region, bodyStart);
    if (closeAt === -1) throw new Error('Block "' + region + '" ohne Schlussmarke');
    const lineStart = text.lastIndexOf(LF, closeAt - 1) + 1;
    let indent = '';
    for (let i = lineStart; i < closeAt; i += 1) {
      const ch = text[i];
      if (ch !== ' ' && ch !== String.fromCharCode(9)) break;
      indent += ch;
    }
    const next = indent + 'const ' + constName + ' = ' + JSON.stringify(value) + ';' + LF + indent;
    const updated = text.slice(0, bodyStart) + next + text.slice(closeAt);
    if (updated !== text) changed = true;
    text = updated;
  }
  if (changed) writeFileSync(CLIENT_FILE, text);
  return changed;
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.indexOf('--check') !== -1;
  const embed = args.indexOf('--embed') !== -1;
  const files = readdirSync(SPRITE_DIR).filter((file) => file.endsWith('.grid')).sort();
  if (files.length === 0) {
    console.error('keine Gitterdateien in ' + SPRITE_DIR);
    process.exit(1);
  }
  let rects = 0;
  for (const file of files) {
    const { rows } = readGrid(join(SPRITE_DIR, file));
    const svg = gridToSvg(rows);
    rects += svg.split('<rect').length - 1;
    if (!checkOnly && !embed) writeFileSync(join(SPRITE_DIR, file.slice(0, file.length - '.grid'.length) + '.svg'), svg);
  }
  if (embed) {
    const changed = embedIntoClient();
    console.log('OK ' + files.length + ' Sprites geprueft, Einbettung ' + (changed ? 'geschrieben' : 'deckungsgleich'));
    return;
  }
  console.log('OK ' + files.length + ' Sprites geprueft' + (checkOnly ? '' : ' und geschrieben') + ' (' + rects + ' Rechtecke)');
}

const invoked = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    main();
  } catch (error) {
    console.error('FEHLER ' + (error && error.message ? error.message : error));
    process.exit(1);
  }
}
