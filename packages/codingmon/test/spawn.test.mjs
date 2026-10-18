#!/usr/bin/env node
/**
 * packages/codingmon/test/spawn.test.mjs — der Wild-Spawn als reine Funktion.
 *
 * WAS HIER BEWIESEN WIRD: die Spawn-Rate haengt an ABGESCHLOSSENEN Schritten
 * (J3), nicht an Tokens, und sie ist deterministisch — derselbe Zaehlerstand
 * ergibt immer dasselbe Wild (oder keines). Daneben die Typwirkung als Zeichen
 * (`effectiveness`): dieselbe Zahl wie in `resolveAttack`, aber mit Symbol statt
 * Tabelle — die Kampfansicht zeigt `×1,5 ▲`, keine Matrix.
 * → Kanon: docs/COMMENT-KANON.md#k-18f4ff319cf5
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveness, ELEMENT_CHART, SPAWN_EVERY, SPECIES, SPECIES_IDS, spawnFor } from '../assets/mechanik.js';

test('kein Spawn ohne abgeschlossene Schritte', () => {
  assert.equal(spawnFor(0, 5), null);
  assert.equal(spawnFor(-4, 5), null);
  assert.equal(spawnFor(undefined, 5), null);
});

test(`Spawn genau auf jedem ${SPAWN_EVERY}. Schritt`, () => {
  for (let done = 1; done <= 30; done += 1) {
    const wild = spawnFor(done, 5);
    if (done % SPAWN_EVERY === 0) {
      assert.ok(wild !== null, `Schritt ${done} oeffnet den Ball`);
      assert.ok(SPECIES[wild.speciesId] !== undefined, 'gueltige Spezies');
      assert.equal(wild.element, SPECIES[wild.speciesId].family, 'Element folgt der Linie');
      assert.ok(Number.isInteger(wild.level) && wild.level >= 1, 'Stufe nie unter 1');
    } else {
      assert.equal(wild, null, `Schritt ${done} bleibt zu`);
    }
  }
});

test('derselbe Zaehler, dasselbe Wild (kein Zufall)', () => {
  assert.deepEqual(spawnFor(6, 4), spawnFor(6, 4));
  assert.deepEqual(spawnFor(12, 9), spawnFor(12, 9));
});

test('die Stufe schwankt hoechstens um eine (nie unter 1)', () => {
  for (let done = SPAWN_EVERY; done <= 60; done += SPAWN_EVERY) {
    const wild = spawnFor(done, 1);
    assert.ok(wild.level >= 1 && wild.level <= 2, `L1 -> L${wild.level}`);
    const wild10 = spawnFor(done, 10);
    assert.ok(wild10.level >= 9 && wild10.level <= 11, `L10 -> L${wild10.level}`);
  }
});

test('die Wirkung ist die Zahl aus der Tabelle, mit Symbol statt Matrix', () => {
  assert.deepEqual(effectiveness('spark', 'byte'), { factor: 1.5, symbol: '▲' });
  assert.deepEqual(effectiveness('byte', 'spark'), { factor: 0.75, symbol: '▼' });
  assert.deepEqual(effectiveness('spark', 'spark'), { factor: 1, symbol: '●' });
  // Dieselbe Zahl wie resolveAttack nachschlaegt — jede Zelle einmal.
  for (const attacker of Object.keys(ELEMENT_CHART)) {
    for (const defender of Object.keys(ELEMENT_CHART[attacker])) {
      assert.equal(
        effectiveness(attacker, defender).factor,
        ELEMENT_CHART[attacker][defender],
        `${attacker} gegen ${defender}`,
      );
    }
  }
});

test('unbekannte Elemente fallen auf die spark-Zeile zurueck (wie resolveAttack)', () => {
  assert.deepEqual(effectiveness('xxx', 'byte'), { factor: 1.5, symbol: '▲' });
  assert.deepEqual(effectiveness('spark', 'yyy'), { factor: 1, symbol: '●' });
});

test('50 Spezies im kanonischen Vertrag', () => {
  assert.equal(SPECIES_IDS.length, 50);
});
