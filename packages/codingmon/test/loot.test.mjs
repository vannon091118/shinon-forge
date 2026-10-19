#!/usr/bin/env node
/**
 * packages/codingmon/test/loot.test.mjs — der gewichtete Beutewurf.
 *
 * EINZELTEST: kein DSH, kein Browser, kein Modell, keine Uhr, keine
 * Installation (der Kern laedt ohne Abhaengigkeit). Der Zufall sitzt
 * AUSSCHLIESSLICH im Loot und ist als reine Funktion eines Wertes aus [0,1)
 * gebaut — hier wird die Tabelle deshalb ueber ALLE 10000 Basispunkte
 * abgezaehlt, nicht mit einer Stichprobe „ungefaehr" geprueft.
 *
 * Lauf: `npm run test:codingmon` bzw. `node --test packages/codingmon/test/*.test.mjs`.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOT_TABLE, LOOT_TOTAL, lootOdds, rollLoot } from '../assets/mechanik.js';

const ids = LOOT_TABLE.map((entry) => entry.id);

/** Verteilung als Zaehlung; Basis ist der Punkt i, nicht ein gerundeter Prozentwert. */
function histogram() {
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let point = 0; point < LOOT_TOTAL; point += 1) counts[rollLoot(point / LOOT_TOTAL).id] += 1;
  return counts;
}

describe('Die Gewichte sind Basispunkte, keine gerundeten Prozente', () => {
  test('drei Stufen, Summe exakt 10000, Gewichte wie im Vertrag', () => {
    assert.deepEqual(ids, ['schrott', 'brauchbar', 'shiny']);
    assert.deepEqual(LOOT_TABLE.map((entry) => entry.weight), [8500, 1400, 100]);
    assert.equal(LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0), LOOT_TOTAL);
    assert.equal(LOOT_TOTAL, 10000, 'der Nenner der Quote');
  });

  test('die angezeigten Quoten sind 85/14/1 und summieren sich auf 100', () => {
    assert.deepEqual(LOOT_TABLE.map(lootOdds), [85, 14, 1]);
    assert.equal(LOOT_TABLE.map(lootOdds).reduce((sum, odd) => sum + odd, 0), 100);
  });

  test('die Beute-XP steigen mit der Seltenheit — Schrott zahlt nichts', () => {
    const xp = LOOT_TABLE.map((entry) => entry.xp);
    assert.equal(xp[0], 0);
    assert.ok(xp[1] > xp[0] && xp[2] > xp[1], 'seltener ist wertvoller');
  });
});

describe('Der Wurf trifft die Quote exakt, nicht ungefaehr', () => {
  test('ueber alle 10000 Basispunkte ergibt sich genau 8500/1400/100', () => {
    assert.deepEqual(histogram(), { schrott: 8500, brauchbar: 1400, shiny: 100 });
  });

  test('die Grenzen sind halboffen: jeder Basispunkt gehoert genau einer Stufe', () => {
    assert.equal(rollLoot(0).id, 'schrott');
    assert.equal(rollLoot(0.8499).id, 'schrott');
    assert.equal(rollLoot(0.85).id, 'brauchbar', 'die Grenze selbst faellt in die naechste Stufe');
    assert.equal(rollLoot(0.989999).id, 'brauchbar');
    assert.equal(rollLoot(0.99).id, 'shiny');
    assert.equal(rollLoot(0.9999999999).id, 'shiny');
  });

  test('keine Stufe ist unerreichbar, und der hoehere Treffer gewinnt den Gleichstand nicht', () => {
    const counts = histogram();
    for (const id of ids) assert.ok(counts[id] > 0, `${id} muss erreichbar sein`);
    // Der Punkt k liegt in der Stufe, deren kumuliertes Gewicht ihn ZUERST
    // ueberschreitet (`point < acc`, nicht `<=`). Also gehoert der letzte Punkt
    // einer Stufe noch zu ihr und der naechste bereits zur naechsten.
    let acc = 0;
    for (const [index, entry] of LOOT_TABLE.entries()) {
      acc += entry.weight;
      const next = LOOT_TABLE[index + 1];
      assert.equal(rollLoot((acc - 1) / LOOT_TOTAL).id, entry.id, `${entry.id}: der letzte Punkt gehoert noch dazu`);
      assert.equal(rollLoot(acc / LOOT_TOTAL).id, next ? next.id : entry.id, `${entry.id}: der naechste Punkt gehoert der naechsten Stufe`);
    }
  });

  test('derselbe Wurf ergibt immer dieselbe Beute — reine Funktion', () => {
    for (const point of [0, 0.42, 0.85, 0.99, 0.9999999]) {
      assert.equal(rollLoot(point), rollLoot(point), `identischer Wurf bei ${point}`);
    }
    const forward = [0.1, 0.9, 0.5].map((point) => rollLoot(point).id);
    const backward = [0.5, 0.9, 0.1].map((point) => rollLoot(point).id);
    assert.deepEqual([...forward].reverse(), backward, 'die Reihenfolge der Wuerfe aendert das Ergebnis nicht');
  });
});

describe('Kaputte Eingaben gewinnen nicht den Jackpot', () => {
  test('unter 0 wird auf die erste Stufe gezogen, ueber 1 auf die letzte', () => {
    assert.equal(rollLoot(-1).id, 'schrott');
    assert.equal(rollLoot(-0.5).id, 'schrott');
    assert.equal(rollLoot(1).id, 'shiny');
    assert.equal(rollLoot(2).id, 'shiny');
  });

  test('kein endlicher Wert faellt auf Schrott zurueck, nicht auf Shiny (fail-closed)', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      assert.equal(rollLoot(value).id, 'schrott', `${value} darf nicht die seltenste Stufe liefern`);
    }
    assert.equal(rollLoot(undefined).id, 'schrott');
    assert.equal(rollLoot('0.995').id, 'schrott', 'kein stilles Weiterreichen von Text');
  });
});
