#!/usr/bin/env node
/**
 * Legacy-Pixelart-Vertrag und Laufzeit-Fallback fuer CodingMon 50.
 *
 * Die zehn bestehenden Arten besitzen eigene Vorder-/Rueckseiten-Gitter.
 * Die neuen 40 Arten werden derzeit ueber den geprueften Familien-Sprite-Fallback
 * gerendert; fehlende individuelle ArtPack-Dateien werden nicht vorgetaeuscht.
 * Dieser Test prueft beide Aussagen getrennt, statt 50 Dateien zu behaupten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPECIES, SPECIES_IDS } from '../assets/mechanik.js';

const LEGACY_SPRITE_IDS = [
  'nullpointer', 'stackoverflow', 'memoryleak', 'racecondition', 'deadlock',
  'segfault', 'offbyone', 'bufferoverflow', 'heisenbug', 'recursion',
];
import {
  GRID_SIZE, PALETTE, UI_REGION, SPRITE_REGION,
  buildEmbed, gridToSvg, readEmbedRegion, readGrid,
} from '../../../scripts/assets/build-sprites.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPRITE_DIR = join(HERE, '..', 'assets', 'sprites');
const UI_DIR = join(HERE, '..', 'assets', 'ui');
const CLIENT_FILE = join(HERE, '..', 'client.js');
const PALETTE_VALUES = new Set(Object.values(PALETTE));

const fillsOf = (svg) => [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);

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
});


test('alle 50 Spezies haben eine gültige Familie und den Runtime-Sprite-Fallback', () => {
  assert.equal(SPECIES_IDS.length, 50);
  for (const id of SPECIES_IDS) {
    assert.ok(SPECIES[id], id + ': Spezies fehlt im kanonischen Katalog');
    assert.ok(['spark', 'byte', 'feral'].includes(SPECIES[id].family), id + ': keine gültige Sprite-Familie');
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
