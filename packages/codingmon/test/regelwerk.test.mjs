#!/usr/bin/env node
/**
 * packages/codingmon/test/regelwerk.test.mjs — der Schaden als Nachschlagewerk.
 *
 * EINZELTEST: kein DSH, kein Browser, kein Modell, keine Uhr, keine Zufalls-
 * quelle — und keine Installation: gefahren wird der KERN
 * (`../assets/mechanik.js`), der keinen Bare-Import hat. Geprueft wird gegen die
 * ROHEN Tabellen (SPECIES, ELEMENTS, CATEGORY, SYNERGY, BUFFS) — die Formel ist
 * hier ein zweites Mal von Hand aufgeschrieben. Waere der Pruefer ein Aufruf von
 * `resolveAttack` gegen sich selbst, bewiese er nichts.
 *
 * Lauf: `npm run test:codingmon` bzw. `node --test packages/codingmon/test/*.test.mjs`.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITIES, BUFFS, CATEGORY, ELEMENTS, ELEMENT_CHART, ELEMENT_LOSS, ELEMENT_WIN,
  LINEAGE, NEUTRAL_BUFF, SPECIES, SPECIES_IDS, SYNERGY,
  abilitiesFor, buffFor, damage, inheritedAbilities, resolveAttack, statsAt,
} from '../assets/mechanik.js';

/**
 * Die Host-Haelfte selbst (`../index.js`) zieht Schemastery. Ohne Installation
 * ist sie nicht ladbar — dann wird die Weiterleitung sichtbar uebersprungen
 * statt rot zu werden (CI hat kein node_modules).
 */
let bundle = null;
try {
  bundle = await import('../index.js');
} catch {
  bundle = null;
}

const POWER_UNIT = 10;

/** Faehigkeit per id, mit Zusage statt stillem `undefined`. */
function ability(id) {
  const found = ABILITIES.find((entry) => entry.id === id);
  assert.ok(found, `Faehigkeit "${id}" muss existieren`);
  return found;
}

/** Angreifer wie der Client ihn baut: Werte der Stufe, HP als Anteil, Vererbung der Linie. */
function attackerAt(speciesId, level, hpRatio = 1, inherited = inheritedAbilities(speciesId)) {
  const stats = statsAt(speciesId, level);
  return {
    element: SPECIES[speciesId].family,
    stats,
    hp: stats.hp * hpRatio,
    maxHp: stats.hp,
    inherited,
  };
}

function defenderAt(speciesId, level) {
  return { element: SPECIES[speciesId].family, stats: statsAt(speciesId, level) };
}

/**
 * Die Formel EINMAL unabhaengig: BaseDamage * Element * Synergie * Buff
 * - DEF * Durchgriff, Minimum 1. Die Nachschlagevorgaenge stehen hier als
 * if-Kette, nicht als Tabelle — ein Fehler IN der Tabelle faellt damit auf,
 * statt mitgeprueft zu werden.
 */
function expectedDamage(entry, attacker, defender) {
  const element = ELEMENTS[attacker.element]?.beats === defender.element ? ELEMENT_WIN
    : ELEMENTS[attacker.element]?.losesTo === defender.element ? ELEMENT_LOSS : 1;
  const synergy = entry.kind === 'speziell' ? 1.25 : 1;
  const ratio = attacker.hp / Math.max(1, attacker.maxHp);
  const buff = attacker.inherited.includes(entry.id) ? 1.1
    : ratio < 0.25 ? 1.5
      : ratio >= 0.9 ? 1.15 : 1;
  const defFactor = entry.kind === 'speziell' ? 0.35 : 0.8;
  const base = (entry.power * attacker.stats[entry.stat]) / POWER_UNIT;
  return Math.max(1, Math.round(base * element * synergy * buff - defender.stats.def * defFactor));
}

describe('Der Kern und die Host-Haelfte bleiben eine Quelle', () => {
  test('jeder Export des Kerns liegt auch an @shinon/codingmon — plus Config und apply', {
    skip: bundle === null ? 'index.js braucht Schemastery (nicht installiert) — die Weiterleitung ist nicht ladbar' : false,
  }, async () => {
    const core = await import('../assets/mechanik.js');
    for (const name of Object.keys(core)) assert.ok(name in bundle, `index.js gibt ${name} nicht weiter`);
    assert.equal(typeof bundle.Config, 'function', 'der Config-Vertrag des Hosts');
    assert.equal(typeof bundle.apply, 'function', 'der Mount');
    assert.equal(typeof bundle.STORE_SERVICE, 'string', 'und die Naht des Spiegels');
  });
});

describe('Elementarkreis: eine Quelle, kein zweites Zahlengedaedchtnis', () => {
  test('ELEMENT_CHART ist aus ELEMENTS.beats/losesTo GEBAUT, nicht danebengeschrieben', () => {
    for (const attacker of Object.keys(ELEMENTS)) {
      for (const defender of Object.keys(ELEMENTS)) {
        const want = defender === ELEMENTS[attacker].beats ? ELEMENT_WIN
          : defender === ELEMENTS[attacker].losesTo ? ELEMENT_LOSS : 1;
        assert.equal(ELEMENT_CHART[attacker][defender], want, `${attacker} → ${defender}`);
      }
    }
  });

  test('der Kreis ist geschlossen: dreimal schlagen kehrt zurueck, Gleichstand ist 1x', () => {
    for (const element of Object.keys(ELEMENTS)) {
      const beats = ELEMENTS[element].beats;
      const losesTo = ELEMENTS[element].losesTo;
      assert.notEqual(beats, losesTo, `${element}: schlaegt und verliert nicht gegen dasselbe`);
      assert.equal(ELEMENTS[beats].beats, losesTo, `${element}: verlieren ist zweimal schlagen`);
      assert.equal(ELEMENTS[ELEMENTS[beats].beats].beats, element, `${element}: der Kreis ist zu`);
      assert.equal(ELEMENT_CHART[element][element], 1, `${element} gegen sich selbst`);
      assert.equal(ELEMENT_CHART[element][beats], ELEMENT_WIN);
      assert.equal(ELEMENT_CHART[element][losesTo], ELEMENT_LOSS);
    }
  });

  test('die Multiplikatoren sind die Konstanten des Vertrags, sonst nichts', () => {
    const allowed = new Set([1, ELEMENT_WIN, ELEMENT_LOSS]);
    for (const attacker of Object.keys(ELEMENT_CHART)) {
      for (const value of Object.values(ELEMENT_CHART[attacker])) {
        assert.ok(allowed.has(value), `${attacker}: ${value} ist kein Vertragswert`);
      }
    }
    assert.ok(ELEMENT_WIN > 1 && ELEMENT_LOSS < 1, 'Gewinnen hebt an, Verlieren senkt');
  });
});

describe('Durchgriff und Synergie: zwei Arten, volle Abdeckung', () => {
  test('CATEGORY: speziell durchschlaegt die Verteidigung haerter als physisch', () => {
    assert.equal(Object.keys(CATEGORY).sort().join(','), 'physisch,speziell');
    assert.ok(CATEGORY.speziell.defFactor < CATEGORY.physisch.defFactor, 'speziell muss haerter durchgreifen');
    for (const [kind, entry] of Object.entries(CATEGORY)) {
      assert.ok(entry.defFactor > 0 && entry.defFactor <= 1, `${kind}: Durchgriff ausserhalb (0,1]`);
    }
  });

  test('SYNERGY deckt jede Kombination aus Element und Art ab, keine Luecke, kein Extra', () => {
    const want = [];
    for (const element of Object.keys(ELEMENTS)) {
      for (const kind of Object.keys(CATEGORY)) want.push(`${element}:${kind}`);
    }
    assert.deepEqual(Object.keys(SYNERGY).sort(), want.sort(), 'die Schluessel sind Element:Art');
    for (const [key, factor] of Object.entries(SYNERGY)) {
      const kind = key.split(':')[1];
      assert.equal(factor, kind === 'speziell' ? 1.25 : 1, `${key}: Synergie folgt der Art`);
    }
  });
});

describe('Buffs: die erste zutreffende Lage gewinnt', () => {
  const full = (speciesId, hpRatio) => {
    const stats = statsAt(speciesId, 12);
    return { stats, hp: stats.hp * hpRatio, maxHp: stats.hp, inherited: [] };
  };

  test('die Tabelle nennt je Buff Faktor und Bedingung, die Grundlage ist neutral', () => {
    assert.equal(NEUTRAL_BUFF.factor, 1);
    for (const buff of BUFFS) {
      assert.ok(typeof buff.id === 'string' && buff.id !== '', 'jeder Buff hat eine Kennung');
      assert.ok(buff.factor > 1, `${buff.id}: ein Buff unter 1 waere kein Buff`);
    }
    assert.deepEqual(BUFFS.map((buff) => buff.id), ['linie', 'nichts-zu-verlieren', 'uebertaktet'], 'Reihenfolge ist Vertrag');
  });

  test('die Grenzen sind exakt: low-hp ist echt kleiner 0.25, uebertaktet ab 0.9', () => {
    const tackle = ability('tackle');
    assert.equal(buffFor(tackle, full('nullpointer', 0.25)).id, NEUTRAL_BUFF.id, '0.25 ist NICHT low-hp');
    assert.equal(buffFor(tackle, full('nullpointer', 0.2499)).id, 'nichts-zu-verlieren');
    assert.equal(buffFor(tackle, full('nullpointer', 0.899)).id, NEUTRAL_BUFF.id, '0.899 ist noch kein uebertaktet');
    assert.equal(buffFor(tackle, full('nullpointer', 0.9)).id, 'uebertaktet');
    assert.equal(buffFor(tackle, full('nullpointer', 1)).id, 'uebertaktet');
  });

  test('die Vererbung schlaegt die Lage: eine geerbte Faehigkeit kaempft mit der reinen Linie', () => {
    const stats = statsAt('racecondition', 12);
    const inherited = inheritedAbilities('racecondition');
    assert.ok(inherited.length > 0, 'die Testlinie muss etwas vererben');
    const linie = { stats, hp: stats.hp, maxHp: stats.hp, inherited };
    assert.equal(buffFor(ability(inherited[0]), linie).id, 'linie', 'geerbt und voller HP: Linie gewinnt');
    assert.equal(buffFor(ability('tackle'), linie).id, 'uebertaktet', 'nicht geerbt: die Lage entscheidet');
  });
});

describe('Die Schadenskette: fuenf Nachschlagevorgaenge, keine Fallunterscheidung', () => {
  test('goldene Werte: Level 12, NullPointer Tackle gegen StackOverflow', () => {
    const tackle = ability('tackle');
    const defender = defenderAt('stackoverflow', 12);

    const full = resolveAttack(tackle, attackerAt('nullpointer', 12, 1), defender);
    assert.equal(full.base, 325.2, 'BaseDamage = Kraft x Waffenwert / 10');
    assert.equal(full.element, ELEMENT_WIN, 'Spark schlaegt Byte');
    assert.equal(full.synergy, SYNERGY['spark:physisch']);
    assert.equal(full.defFactor, CATEGORY.physisch.defFactor);
    assert.equal(full.buff.id, 'uebertaktet');
    assert.equal(full.dealt, 409);

    assert.equal(resolveAttack(tackle, attackerAt('nullpointer', 12, 0.5), defender).dealt, 336, 'neutral');
    assert.equal(resolveAttack(tackle, attackerAt('nullpointer', 12, 0.1), defender).dealt, 580, 'nichts zu verlieren');
  });

  test('unabhaengig nachgerechnet ueber Level, Spezies, Faehigkeiten und Lagen', () => {
    const levels = [1, 2, 3, 7, 12, 20];
    const ratios = [1, 0.9, 0.5, 0.25, 0.1];
    let checked = 0;
    for (const level of levels) {
      for (const attackerSpecies of SPECIES_IDS) {
        for (const defenderSpecies of SPECIES_IDS) {
          for (const entry of ABILITIES) {
            for (const ratio of ratios) {
              const attacker = attackerAt(attackerSpecies, level, ratio);
              const defender = defenderAt(defenderSpecies, level);
              const want = expectedDamage(entry, attacker, defender);
              const got = resolveAttack(entry, attacker, defender).dealt;
              assert.equal(got, want, `${entry.id} ${attackerSpecies}→${defenderSpecies} L${level} hp*${ratio}`);
              checked += 1;
            }
          }
        }
      }
    }
    assert.equal(checked, levels.length * SPECIES_IDS.length * SPECIES_IDS.length * ABILITIES.length * ratios.length);
  });

  test('derselbe Zug auf dieselbe Lage ergibt denselben Schaden — kein Wurf im Regelwerk', () => {
    const one = resolveAttack(ability('core-dump'), attackerAt('segfault', 9), defenderAt('heisenbug', 9));
    const two = resolveAttack(ability('core-dump'), attackerAt('segfault', 9), defenderAt('heisenbug', 9));
    assert.deepEqual(two, one);
  });

  test('der Schaden faellt nie unter 1, auch wenn die Verteidigung ihn auffrisst', () => {
    const huge = defenderAt('deadlock', 200);
    assert.equal(resolveAttack(ability('tackle'), attackerAt('nullpointer', 1), huge).dealt, 1);
    assert.equal(damage(ability('tackle'), attackerAt('nullpointer', 1), huge), 1, 'die Kurzform ist dieselbe Kette');
  });

  test('damage() ist die Kurzform von resolveAttack()', () => {
    for (const entry of ABILITIES) {
      const attacker = attackerAt('offbyone', 8, 0.5);
      const defender = defenderAt('memoryleak', 8);
      assert.equal(damage(entry, attacker, defender), resolveAttack(entry, attacker, defender).dealt, entry.id);
    }
  });
});

describe('Faehigkeiten und Vererbung sind geschlossen, nicht behauptet', () => {
  test('21 Faehigkeiten, genau zwei je Spezies, jede nennt eine echte Spezies und Wertespalte', () => {
    assert.equal(SPECIES_IDS.length, 10);
    assert.equal(ABILITIES.length, 21, '1 Grundfaehigkeit + 2 je Spezies');
    assert.equal(ABILITIES.filter((entry) => entry.species === null).length, 1, 'genau eine Grundfaehigkeit');
    const statKeys = Object.keys(statsAt(SPECIES_IDS[0], 1));
    for (const entry of ABILITIES) {
      assert.ok(statKeys.includes(entry.stat), `${entry.id}: unbekannte Wertespalte ${entry.stat}`);
      assert.ok(CATEGORY[entry.kind], `${entry.id}: unbekannte Art ${entry.kind}`);
      if (entry.species !== null) assert.ok(SPECIES[entry.species], `${entry.id}: unbekannte Spezies ${entry.species}`);
    }
    for (const speciesId of SPECIES_IDS) {
      const own = ABILITIES.filter((entry) => entry.species === speciesId);
      assert.equal(own.length, 2, `${speciesId}: zwei eigene Faehigkeiten`);
      assert.deepEqual(own.map((entry) => entry.minLevel), [1, 4], `${speciesId}: erste Stufe 1, Aufstieg Stufe 4`);
    }
  });

  test('jeder Ahn existiert, die Generation waechst, jede Erbfaehigkeit gehoert zur Linie des Ahnen', () => {
    for (const [speciesId, entry] of Object.entries(LINEAGE)) {
      assert.ok(SPECIES[speciesId], `${speciesId}: Linie ohne Spezies`);
      if (entry.ancestor === null) {
        assert.equal(entry.generation, 1, `${speciesId}: ohne Ahnen ist die Generation 1`);
        continue;
      }
      const ancestor = LINEAGE[entry.ancestor];
      assert.ok(ancestor, `${speciesId}: Ahn ${entry.ancestor} existiert nicht`);
      assert.equal(entry.generation, ancestor.generation + 1, `${speciesId}: Generation folgt dem Ahnen`);
      for (const id of entry.inherits) {
        const inherited = ABILITIES.find((candidate) => candidate.id === id);
        assert.ok(inherited, `${speciesId}: Erbfaehigkeit ${id} existiert nicht`);
        assert.equal(inherited.species, entry.ancestor, `${speciesId}: ${id} stammt nicht vom Ahnen`);
      }
    }
  });

  test('die Vererbung erweitert die Faehigkeitsliste wirklich, der Aufstieg kommt erst ab Stufe 4', () => {
    assert.ok(inheritedAbilities('recursion').length > 0, 'die Testlinie muss vererben');
    const early = abilitiesFor(1, 'recursion').map((entry) => entry.id);
    const late = abilitiesFor(10, 'recursion').map((entry) => entry.id);
    assert.ok(early.includes('tackle'), 'die Grundfaehigkeit kennt jede Linie');
    for (const id of inheritedAbilities('recursion')) {
      assert.equal(early.includes(id), false, `${id} darf auf Stufe 1 noch nicht dabei sein`);
      assert.ok(late.includes(id), `${id} muss auf Stufe 10 dabei sein`);
    }
    assert.deepEqual(late, ['tackle', 'boundary-slip', 'base-case', 'infinite-descent']);
  });
});
