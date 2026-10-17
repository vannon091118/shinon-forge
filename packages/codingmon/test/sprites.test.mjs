#!/usr/bin/env node
/**
 * packages/codingmon/test/sprites.test.mjs — die 27 Assets als Vertrag.
 *
 * WAS HIER BEWIESEN WIRD (Abschnitt 3a des Auftrags):
 *   1. Jede Spezies hat Vorder- und Rueckseite (20 Gitter aus SPECIES abgeleitet,
 *      nicht gezaehlt — eine elfte Spezies ohne Sprites faellt hier, nicht erst
 *      im Browser).
 *   2. Jedes Gitter ist 32x32, kennt nur die Palette und hoechstens fuenf Farben.
 * → Kanon: docs/COMMENT-KANON.md#k-985b9a414f31
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPECIES_IDS } from '../assets/mechanik.js';
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

test('jede Spezies hat Vorder- und Rueckseite als Gitter', () => {
  const files = new Set(readdirSync(SPRITE_DIR));
  for (const id of SPECIES_IDS) {
    assert.ok(files.has(`${id}-front.grid`), `${id}: Vorderseite fehlt`);
    assert.ok(files.has(`${id}-back.grid`), `${id}: Rueckseite fehlt`);
  }
  const grids = [...files].filter((f) => f.endsWith('.grid')).sort();
  assert.equal(grids.length, SPECIES_IDS.length * 2, 'genau zwei Gitter je Spezies, keine Waisen');
});

test('jedes Gitter ist 32x32, palette-rein, hoechstens fuenf Farben', () => {
  for (const id of SPECIES_IDS) {
    for (const side of ['front', 'back']) {
      const { rows, colors } = readGrid(join(SPRITE_DIR, `${id}-${side}.grid`));
      assert.equal(rows.length, GRID_SIZE);
      assert.ok(rows.every((row) => row.length === GRID_SIZE));
      assert.ok(colors.size >= 2 && colors.size <= 5, `${id}-${side}: ${colors.size} Farben`);
    }
  }
});

test('Rueckseite ist keine Kopie der Vorderseite', () => {
  for (const id of SPECIES_IDS) {
    const front = readFileSync(join(SPRITE_DIR, `${id}-front.grid`), 'utf8');
    const back = readFileSync(join(SPRITE_DIR, `${id}-back.grid`), 'utf8');
    assert.notEqual(back, front, `${id}: Rueckseite unterscheidet sich`);
  }
});

test('jedes SVG ist gueltig und traegt nur Palettenfarben', () => {
  for (const id of SPECIES_IDS) {
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
