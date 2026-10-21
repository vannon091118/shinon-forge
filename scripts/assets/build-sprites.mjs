#!/usr/bin/env node
/**
 * scripts/assets/build-sprites.mjs — Gitterdateien zu SVG (Codemon-Sprites).
 *
 * WARUM ES DIESES SKRIPT GIBT: Die Sprites sind HANDGEZEICHNETE 32x32-Gitter
 * (`packages/codingmon/assets/sprites/*.grid`, ein Zeichen je Pixel, `.` ist
 * transparent), keine fremden Bilder — also keine Bildrechte-Frage. Dieses
 * Skript wandelt sie in SVG um (ein Rechteck je Pixel, gleiche Pixel einer
 * Zeile zusammengefasst) und PRUEFT dabei das Format: genau 32 Zeilen zu je
 * 32 Zeichen, nur Palettenzeichen, hoechstens fuenf Farben je Sprite.
 *
 * DIE KUNST DER 50 ARTEN (`assets/art/*.svg`) liegt daneben und gehoert zum
 * selben Vertrag, aber zu einer anderen Frage: die Gitter sind handgezeichnete
 * Pixel art fuer die ZEHN Arten der ersten Fassung (und fuer die drei
 * Familien), die Kunst ist eine Datei je kanonischer Art-ID aus dem
 * CodingMon-50-ArtPack. Beides landet im Buendel, aber die Kunst gewinnt: eine
 * Art mit eigener Datei wird als Kunst gezeichnet, das Gitter bleibt der
 * dokumentierte Rueckfall (siehe `resolveGridKey` im Client).
 *
 * Was `normalizeArt()` dabei tun MUSS und warum: die 50 Dateien definieren alle
 * dieselben vier IDs (`body`, `metal`, `core`, `glow`). Unveraendert
 * nebeneinandergestellt wuerde im Browser die erste Definition gewinnen und
 * jede weitere Art mit den Farben der ersten zeichnen — ein stiller Fehler, der
 * wie Kunst aussieht. Deshalb bekommt jede ID den Praefix `cm-<art>-`, und
 * jeder `url(#…)`-Verweis wird mit umgeschrieben. Der Test prueft beides:
 * keine ID doppelt im Buendel, jeder Verweis innerhalb der eigenen Datei.
 *
 * Aufruf:
 *   node scripts/assets/build-sprites.mjs [--check] [--embed]
 * Ohne Flag schreibt es `packages/codingmon/assets/sprites/*.svg` neben die
 * Gitter; mit `--check` prueft es nur; mit `--embed` schreibt es die
 * eingebetteten Spiegel in `packages/codingmon/client.js` neu (das Bundle ist
 * selbststaendig und kann keine Datei aus `assets/` laden). Exit 1 bei
 * Verletzung. Der Gate-Test (`packages/codingmon/test/sprites.test.mjs`)
 * nutzt denselben Vertrag: jede Spezies hat Vorder- und Rueckseite, jedes SVG
 * ist gueltig, jede Farbe stammt aus der Palette, die Einbettung ist deckungsgleich,
 * und die Kunst deckt GENAU die Arten des kanonischen Katalogs ab.
 *
 * STILHINWEIS (fuer kuenftige Aenderungen): Diese Datei nutzt bewusst nur
 * `indexOf`/`slice`/`endsWith` und `String.fromCharCode(10)` statt
 * Escape-Sequenzen — die Blocksuche ist literale Zeilensuche und kann nicht an
 * Escapes scheitern.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPRITE_DIR = join(ROOT, 'packages', 'codingmon', 'assets', 'sprites');
const UI_DIR = join(ROOT, 'packages', 'codingmon', 'assets', 'ui');
const ART_DIR = join(ROOT, 'packages', 'codingmon', 'assets', 'art');
const CATALOG_FILE = join(ROOT, 'packages', 'codingmon', 'assets', 'data', 'codingmon-50.json');
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
export const ART_REGION = 'generated-art';

/** Die Kantenlaenge, auf die jede ArtPack-Datei gemalt ist. */
export const ART_VIEW = 512;

/** Die kanonischen Art-IDs — die Kunst darf keine andere Menge behaupten. */
export function catalogIds() {
  const data = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
  const ids = data.species.map((species) => species.id).sort();
  if (ids.length !== 50 || new Set(ids).size !== 50) {
    throw new Error('Katalog muss 50 eindeutige Art-IDs nennen (' + ids.length + ' gelesen)');
  }
  return ids;
}

/**
 * Was in einem Markup nichts zu suchen hat: Skripte, eingebettete Bilder,
 * externe Verweise, `data:`-URLs und Event-Attribute. Das Buendel setzt den
 * Text per `dangerouslySetInnerHTML` in die Seite — eine Datei, die selbst
 * etwas nachlaedt, waere hier kein Bild, sondern Code.
 */
const ART_FORBIDDEN = /<script|<foreignObject|<image|\son[a-z]+\s*=|href=|xlink:|data:/i;

/**
 * Eine ArtPack-Datei pruefen und als Buendel-Markup aufbereiten.
 *
 * Die Reihenfolge ist eine Zusage: erst die Form (SVG-Wurzel, 512er-viewBox),
 * dann die Sicherheit (nichts Nachladendes), dann die IDs (eindeutig, mit
 * Art-Praefix umgeschrieben), dann die Verweise (jeder `url(#…)` zeigt in die
 * eigene Datei), zuletzt die Verdichtung (Zeilenumbrueche und Einrueckung sind
 * fuer die Lesbarkeit der Quelle da, nicht fuer das Buendel).
 *
 * @returns das fertige Markup, byte-gleich in Quelle und Einbettung erwartet.
 */
export function normalizeArt(text, speciesId) {
  const name = speciesId + '.svg';
  if (!text.startsWith('<svg ')) throw new Error(name + ': keine SVG-Wurzel');
  if (!text.includes('viewBox="0 0 ' + ART_VIEW + ' ' + ART_VIEW + '"')) {
    throw new Error(name + ': viewBox ist nicht ' + ART_VIEW + 'x' + ART_VIEW);
  }
  if (ART_FORBIDDEN.test(text)) throw new Error(name + ': verbotene Konstruktion (Skript, Bild, externer Verweis, Event)');
  const ids = [...text.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  if (ids.length === 0) throw new Error(name + ': keine Definition (Farben fehlen)');
  if (new Set(ids).size !== ids.length) throw new Error(name + ': doppelte ID in einer Datei');
  const prefix = 'cm-' + speciesId + '-';
  let markup = text.replace(/ role="img"/g, '').replace(/ aria-label="[^"]*"/g, '');
  for (const id of ids) {
    markup = markup.split('id="' + id + '"').join('id="' + prefix + id + '"')
      .split('url(#' + id + ')').join('url(#' + prefix + id + ')');
  }
  const known = new Set(ids.map((id) => prefix + id));
  for (const ref of [...markup.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1])) {
    if (!known.has(ref)) throw new Error(name + ': Verweis auf unbekannte ID ' + ref);
  }
  markup = markup.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
  if (!markup.endsWith('</svg>')) throw new Error(name + ': SVG-Wurzel nicht geschlossen');
  return markup;
}

/**
 * Die Kunst aller Arten, nach kanonischer ID. Fail-closed in beide Richtungen:
 * eine Art ohne Datei und eine Datei ohne Art sind beide ein Befund — der
 * Katalog ist die Liste, die Dateien sind die Antwort darauf.
 */
export function buildArt() {
  const ids = catalogIds();
  const owners = readdirSync(ART_DIR).filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, file.length - '.svg'.length)).sort();
  const missing = ids.filter((id) => owners.indexOf(id) === -1);
  const orphans = owners.filter((id) => ids.indexOf(id) === -1);
  if (missing.length > 0) throw new Error('Art ohne Kunst: ' + missing.join(', '));
  if (orphans.length > 0) throw new Error('Kunst ohne Art im Katalog: ' + orphans.join(', '));
  const art = {};
  for (const id of ids) art[id] = normalizeArt(readFileSync(join(ART_DIR, id + '.svg'), 'utf8'), id);
  return art;
}

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
  return { grids, ui, art: buildArt() };
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
    [SPRITE_REGION, 'SPRITE_GRIDS', built.grids, false],
    [UI_REGION, 'UI_SVG', built.ui, false],
    // Die Kunst bekommt eine Zeile je Art: 50 Eintraege a vier Kilobyte auf
    // einer Zeile waeren im Diff und im Editor nicht mehr lesbar.
    [ART_REGION, 'SPRITE_ART', built.art, true],
  ];
  let text = readFileSync(CLIENT_FILE, 'utf8');
  let changed = false;
  for (const [region, constName, value, oneLinePerKey] of pairs) {
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
    let next;
    if (oneLinePerKey) {
      const keys = Object.keys(value);
      const lines = keys.map((key, index) => indent + '  ' + JSON.stringify(key) + ': ' + JSON.stringify(value[key])
        + (index === keys.length - 1 ? '' : ','));
      next = indent + 'const ' + constName + ' = {' + LF + lines.join(LF) + LF + indent + '};' + LF + indent;
    } else {
      next = indent + 'const ' + constName + ' = ' + JSON.stringify(value) + ';' + LF + indent;
    }
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
  const art = buildArt();
  const artIds = Object.keys(art).length;
  const artBytes = Object.values(art).reduce((sum, markup) => sum + markup.length, 0);
  if (embed) {
    const changed = embedIntoClient();
    console.log('OK ' + files.length + ' Sprites und ' + artIds + ' Kunstdateien (' + artBytes + ' Zeichen) geprueft, Einbettung ' + (changed ? 'geschrieben' : 'deckungsgleich'));
    return;
  }
  console.log('OK ' + files.length + ' Sprites und ' + artIds + ' Kunstdateien geprueft'
    + (checkOnly ? '' : ' und geschrieben') + ' (' + rects + ' Rechtecke)');
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
