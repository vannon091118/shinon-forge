import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ABILITIES, BUFFS, CATALOG_VALIDATION, ELEMENTS, ELEMENT_CHART, LINEAGE, LOOT_TABLE,
  SPECIES, SPECIES_IDS, SPECIES_LIST, validateCatalog,
} from '../assets/katalog.js';

describe('kanonischer CodingMon-50-Katalog', () => {
  test('lädt genau 50 eindeutige Spezies und 101 eindeutige Fähigkeiten', () => {
    assert.equal(CATALOG_VALIDATION.species, 50);
    assert.equal(CATALOG_VALIDATION.abilities, 101);
    assert.equal(new Set(SPECIES_IDS).size, 50);
    assert.deepEqual(validateCatalog(), { species: 50, abilities: 101, lootWeight: 10000 });
  });

  test('alle Vorfahren, Kinder, ererbten Fähigkeiten und Moves sind auflösbar', () => {
    for (const species of SPECIES_LIST) {
      assert.ok(species.ancestor === null || SPECIES[species.ancestor], species.id + ' ancestor');
      for (const child of species.children) assert.ok(SPECIES[child], species.id + ' child ' + child);
      for (const id of [...species.abilityIds, ...species.inheritedAbilityIds]) {
        assert.ok(ABILITIES.some((ability) => ability.id === id), species.id + ' ability ' + id);
      }
      assert.equal(LINEAGE[species.id].depth, species.lineageDepth);
      assert.ok(!Object.hasOwn(LINEAGE[species.id], 'generation'), 'species depth is not creature generation');
    }
  });

  test('the 50 records include the ten established IDs plus forty new lineage forms', () => {
    const existing = [
      'nullpointer', 'stackoverflow', 'memoryleak', 'racecondition', 'deadlock',
      'segfault', 'offbyone', 'bufferoverflow', 'heisenbug', 'recursion',
    ];
    assert.deepEqual(SPECIES_IDS.slice(0, 10), existing);
    assert.equal(SPECIES_IDS.filter((id) => !existing.includes(id)).length, 40);
  });

  test('element wheel, buffs and loot stay data-driven and closed', () => {
    assert.deepEqual(Object.keys(ELEMENTS).sort(), ['byte', 'feral', 'spark']);
    for (const [attacker, row] of Object.entries(ELEMENT_CHART)) {
      assert.deepEqual(Object.keys(row).sort(), ['byte', 'feral', 'spark']);
      assert.equal(row[attacker], 1);
    }
    assert.deepEqual(BUFFS.map((buff) => buff.test), ['inherited', 'low-hp', 'full-hp']);
    assert.equal(LOOT_TABLE.reduce((sum, item) => sum + item.weight, 0), 10000);
  });
});


test('Browser-Spiegel ist reproduzierbar aus der kanonischen Datenquelle generiert', () => {
  const script = fileURLToPath(new URL('../../../scripts/assets/build-codingmon.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
