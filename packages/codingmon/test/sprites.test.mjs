#!/usr/bin/env node
/**
 * Sprite-Vertrag: die zehn Legacy-Gitter, die Kunst der 50 Arten, der Rueckfall.
 *
 * Drei Dinge werden hier getrennt geprueft, statt sie zu einer Aussage zu
 * verschmelzen:
 *
 *   1. Die GITTER (`assets/sprites/*.grid`) sind handgezeichnete 32x32-Pixel
 *      art fuer die zehn Arten der ersten Fassung und fuer die drei Familien.
 *      Sie bleiben der Rueckfall, wenn eine Art keine Kunstdatei hat.
 *   2. Die KUNST (`assets/art/*.svg`) ist eine Datei je kanonischer Art-ID aus
 *      dem CodingMon-50-ArtPack. Sie ist die Anzeige — alle 50 Arten, jede mit
 *      eigenem Bild, keine Familie, die fuer 40 Arten einspringt.
 *   3. Die EINBETTUNG ist beides zusammen im Buendel, weil der ModuleLoader
 *      keinen relativen Import kennt: die Quelle liegt in `assets/`, das
 *      Markup steht in `client.js`, und dieser Test ist die Naht dazwischen.
 *
 * Der Drift, den die Kunst braucht, steht in `buildArt()`: der Katalog
 * (`assets/data/codingmon-50.json`) ist die Liste, die Dateien sind die
 * Antwort. Eine Art ohne Datei und eine Datei ohne Art sind beide rot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPECIES, SPECIES_IDS } from '../assets/mechanik.js';
import { boot } from './harness.mjs';

const LEGACY_SPRITE_IDS = [
  'nullpointer', 'stackoverflow', 'memoryleak', 'racecondition', 'deadlock',
  'segfault', 'offbyone', 'bufferoverflow', 'heisenbug', 'recursion',
];
import {
  ART_REGION, ART_VIEW, GRID_SIZE, PALETTE, UI_REGION, SPRITE_REGION,
  buildArt, buildEmbed, catalogIds, gridToSvg, normalizeArt, readEmbedRegion, readGrid,
} from '../../../scripts/assets/build-sprites.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPRITE_DIR = join(HERE, '..', 'assets', 'sprites');
const UI_DIR = join(HERE, '..', 'assets', 'ui');
const ART_DIR = join(HERE, '..', 'assets', 'art');
const CLIENT_FILE = join(HERE, '..', 'client.js');
const PALETTE_VALUES = new Set(Object.values(PALETTE));

const fillsOf = (svg) => [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
const artFiles = () => readdirSync(ART_DIR).filter((f) => f.endsWith('.svg')).sort();
const artId = (file) => file.slice(0, file.length - '.svg'.length);

test('jede Legacy-Spezies hat Vorder- und Rueckseite als Gitter', () => {
  const files = new Set(readdirSync(SPRITE_DIR));
  for (const id of LEGACY_SPRITE_IDS) {
    assert.ok(files.has(`${id}-front.grid`), `${id}: Vorderseite fehlt`);
    assert.ok(files.has(`${id}-back.grid`), `${id}: Rueckseite fehlt`);
  }
  const grids = [...files].filter((f) => f.endsWith('.grid')).sort();
  assert.equal(grids.length, LEGACY_SPRITE_IDS.length * 2, 'genau zwei Gitter je Legacy-Spezies, keine Waisen');
});

test('jedes Legacy-Gitter ist 32x32, palette-rein, hoechstens fuenf Farben', () => {
  for (const id of LEGACY_SPRITE_IDS) {
    for (const side of ['front', 'back']) {
      const { rows, colors } = readGrid(join(SPRITE_DIR, `${id}-${side}.grid`));
      assert.equal(rows.length, GRID_SIZE);
      assert.ok(rows.every((row) => row.length === GRID_SIZE));
      assert.ok(colors.size >= 2 && colors.size <= 5, `${id}-${side}: ${colors.size} Farben`);
    }
  }
});

test('Legacy-Rueckseite ist keine Kopie der Vorderseite', () => {
  for (const id of LEGACY_SPRITE_IDS) {
    const front = readFileSync(join(SPRITE_DIR, `${id}-front.grid`), 'utf8');
    const back = readFileSync(join(SPRITE_DIR, `${id}-back.grid`), 'utf8');
    assert.notEqual(back, front, `${id}: Rueckseite unterscheidet sich`);
  }
});

test('jedes Legacy-SVG ist gueltig und traegt nur Palettenfarben', () => {
  for (const id of LEGACY_SPRITE_IDS) {
    for (const side of ['front', 'back']) {
      const { rows } = readGrid(join(SPRITE_DIR, `${id}-${side}.grid`));
      const svg = gridToSvg(rows);
      assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), 'Namensraum');
      assert.ok(svg.includes(`viewBox="0 0 ${GRID_SIZE} ${GRID_SIZE}"`), 'viewBox');
      assert.ok(svg.includes('shape-rendering="crispEdges"'), 'harte Pixel');
      const rects = svg.split('<rect').length - 1;
      assert.ok(rects > 20, `${id}-${side}: ${rects} Rechtecke (kein leeres Sprite)`);
      for (const fill of fillsOf(svg)) {
        assert.ok(PALETTE_VALUES.has(fill), `${id}-${side}: fremde Farbe ${fill}`);
      }
    }
  }
});

test('die Einbettung in client.js ist deckungsgleich mit den Quellen', () => {
  const text = readFileSync(CLIENT_FILE, 'utf8');
  const expected = buildEmbed();
  assert.deepEqual(readEmbedRegion(text, SPRITE_REGION, 'SPRITE_GRIDS'), expected.grids);
  assert.deepEqual(readEmbedRegion(text, UI_REGION, 'UI_SVG'), expected.ui);
  assert.deepEqual(readEmbedRegion(text, ART_REGION, 'SPRITE_ART'), expected.art);
});

test('die Kunst deckt GENAU den kanonischen Katalog, keine Waisen in beide Richtungen', () => {
  const catalog = catalogIds();
  const files = artFiles().map(artId);
  assert.equal(catalog.length, 50);
  assert.deepEqual(files, catalog, 'Artdateien und Katalog-IDs sind dieselbe Menge');
  assert.deepEqual(Object.keys(buildArt()).sort(), catalog.slice().sort());
});

test('jede Kunstdatei ist 512er SVG ohne Skript, Bild oder externen Verweis', () => {
  for (const file of artFiles()) {
    const raw = readFileSync(join(ART_DIR, file), 'utf8');
    assert.ok(raw.startsWith('<svg '), `${file}: keine SVG-Wurzel`);
    assert.ok(raw.includes(`viewBox="0 0 ${ART_VIEW} ${ART_VIEW}"`), `${file}: viewBox`);
    assert.ok(!/<script|<foreignObject|<image|\shref=/i.test(raw), `${file}: laedt etwas nach`);
    const markup = normalizeArt(raw, artId(file));
    assert.ok(markup.startsWith('<svg ') && markup.endsWith('</svg>'), `${file}: Markup unvollstaendig`);
    assert.ok(!markup.includes('\n'), `${file}: Zeilenumbruch im Buendel`);
    assert.ok(!/\s{2,}/.test(markup), `${file}: Leerraum im Buendel`);
    assert.ok(!markup.includes('aria-label'), `${file}: Vorlese-Dopplung`);
  }
});

test('die Farb-IDs sind je Art benannt — im ganzen Buendel keine ID doppelt', () => {
  const art = buildArt();
  const seen = new Set();
  for (const [species, markup] of Object.entries(art)) {
    const own = [...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(own.length, 4, `${species}: vier Farbdefinitionen erwartet, ${own.length} gefunden`);
    for (const id of own) {
      assert.ok(id.startsWith(`cm-${species}-`), `${species}: ID ${id} ohne Art-Praefix`);
      assert.ok(!seen.has(id), `ID ${id} ist doppelt — die erste Definition wuerde gewinnen`);
      seen.add(id);
    }
    for (const ref of [...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])) {
      assert.ok(own.includes(ref), `${species}: Verweis ${ref} zeigt aus der Datei heraus`);
    }
  }
  assert.equal(seen.size, Object.keys(art).length * 4, 'jede Definition genau einmal im Buendel');
});

test('jede der 50 Arten loest auf ihre EIGENE Kunst auf, nicht auf die Familie', () => {
  const sim = boot();
  const kinds = new Set();
  for (const id of sim.api.species()) {
    assert.equal(sim.api.spriteFor(id, 'front'), `art:${id}`, `${id}: keine eigene Kunst`);
    kinds.add(sim.api.spriteFor(id, 'front').split(':')[0]);
  }
  assert.deepEqual([...kinds], ['art'], 'keine Art faellt auf ein Gitter zurueck');
  assert.equal(SPECIES_IDS.length, 50);
});

test('das Markup traegt Groesse, Art, Seite und keine Vorlese-Dopplung; back ist gespiegelt', () => {
  const sim = boot();
  const front = sim.api.spriteMarkup('observoid', 'front', 64);
  assert.match(front, /<svg [^>]*width="64" height="64"/, 'Groesse steht im Markup');
  assert.match(front, /data-species="observoid"/);
  assert.match(front, /data-side="front"/);
  assert.match(front, /aria-hidden="true"/, 'die Kunst ist Schmuck, der Name steht als Text');
  assert.ok(!front.includes('aria-label'));
  assert.ok(!front.includes('role="img"'));
  assert.ok(front.includes(`viewBox="0 0 ${ART_VIEW} ${ART_VIEW}"`), 'die Kunst behaelt ihren Rahmen');
  assert.ok(front.includes('id="cm-observoid-body"'), 'die eigenen Farben, nicht die der ersten Art');
  const back = sim.api.spriteMarkup('observoid', 'back', 64);
  assert.match(back, /<g transform="scale\(-1 1\) translate\(-512 0\)">/, 'Rueckseite ist die Spiegelung');
  const drawingOf = (markup) => markup.slice(markup.indexOf('>') + 1, markup.lastIndexOf('</svg>'))
    .replace(/^<g [^>]*>/, '').replace(/<\/g>$/, '');
  assert.equal(drawingOf(back), drawingOf(front), 'Rueckseite und Vorderseite zeigen dieselbe Zeichnung');
  const other = sim.api.spriteMarkup('memoryphoenix', 'front', 64);
  assert.ok(other.includes('id="cm-memoryphoenix-body"'));
  assert.ok(!other.includes('cm-observoid-'), 'keine fremde Art im Markup');
});

test('eine Art ohne Kunst faellt auf das Gitter ihrer Familie zurueck, nie auf ein fremdes', () => {
  const sim = boot();
  const markup = sim.api.spriteMarkup('gibtesnicht', 'front', 40);
  assert.match(markup, /viewBox="0 0 32 32"/, 'das Gitter ist der Rueckfall');
  assert.match(markup, /shape-rendering="crispEdges"/);
  assert.ok(!markup.includes('cm-gibtesnicht'), 'kein erfundenes Bild');
  const key = sim.api.spriteFor('gibtesnicht', 'front');
  assert.ok(!key.startsWith('art:'), 'ohne Kunst keine Kunst');
  assert.ok(SPECIES[key.split('-')[0]] !== undefined, `${key} nennt keine echte Art`);
});

test('die 50 Arten behalten ihre Familie, und die Marke bleibt Pixel art', () => {
  assert.equal(SPECIES_IDS.length, 50);
  for (const id of SPECIES_IDS) {
    assert.ok(SPECIES[id], id + ': Spezies fehlt im kanonischen Katalog');
    assert.ok(['spark', 'byte', 'feral'].includes(SPECIES[id].family), id + ': keine gueltige Sprite-Familie');
  }
  const client = readFileSync(CLIENT_FILE, 'utf8');
  assert.match(client, /function speciesGlyph\(speciesId, lvl, size\)/);
  assert.match(client, /spriteSvg\(species\.family, stageIndex\(lvl\), size\)/);
});

test('7 UI-SVGs: vorhanden, gueltig, nur #A855F7', () => {
  const expected = ['ball', 'spiral', 'step-bestehen', 'step-denken', 'step-handeln', 'step-lernen', 'step-pruefen'];
  const files = readdirSync(UI_DIR).filter((f) => f.endsWith('.svg')).sort();
  assert.deepEqual(files, expected.map((n) => `${n}.svg`));
  for (const file of files) {
    const svg = readFileSync(join(UI_DIR, file), 'utf8');
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), `${file}: Namensraum`);
    assert.ok(svg.includes('viewBox="0 0 32 32"'), `${file}: viewBox`);
    for (const fill of fillsOf(svg)) {
      assert.ok(fill === 'none' || fill === '#A855F7', `${file}: fremde Farbe ${fill}`);
    }
    const hexes = svg.match(/#[0-9A-Za-z]{6}/g) ?? [];
    for (const hex of hexes) assert.equal(hex, '#A855F7', `${file}: ${hex} statt Akzent`);
  }
});
