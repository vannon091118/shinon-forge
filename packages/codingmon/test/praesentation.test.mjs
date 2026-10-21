#!/usr/bin/env node
/**
 * packages/codingmon/test/praesentation.test.mjs — die Darstellungs-Zusagen.
 *
 * WAS DIESER TEST FESTNAGELT (S2):
 *  1. Der Picker im Panel-Kopf waehlt eine KREATUR, keine Art. Zwei IDs, zwei
 *     Bedeutungen, eine Verwechslung — und die Verwechslung war still: der
 *     Aufruf mit einer Kreatur-ID in einer Art-Funktion tat nichts.
 *  2. Das Hoechst-HP ist an allen drei Stellen EINE Zahl: Leiste, Arena und
 *     Kampf. Vorher zeigten Leiste und Arena die Basislleiter, das Panel die
 *     effektiven Werte — drei Ansichten, zwei Zahlen.
 *  3. Der Praesentationszustand ist ABGELEITET: er folgt dem Zustand und
 *     aendert ihn nicht. Ein Ergebnis ist ein Fenster von 1,6 Sekunden, kein
 *     Zustand, der stehen bleibt.
 *  4. Die Konfiguration kennt kein Feld ohne Leser. `wildLimit` und
 *     `idleAfterMs` versprachen mehrere wilde Pets und ein Idle-Zeitfenster,
 *     die es nicht gab.
 *  5. Eine Art ohne eigenes Sprite zeigt das Sprite IHRER FAMILIE, nicht das
 *     Sprite der ersten Art der Liste.
 *
 * Die Attrappe ist die aus harness.mjs — dieselbe wie im Durchstich.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, flatten, collectText } from './harness.mjs';
import * as host from '../assets/mechanik.js';

const PATCH = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

/** Ein Stand mit ZWEI Kreaturen: eine ohne Bonus, eine mit Zuchtbonus. */
const saveWithTwoCreatures = () => ({
  version: 3,
  name: 'Codingmon',
  species: 'nullpointer',
  xp: 0,
  hp: 44,
  wins: 0,
  losses: 0,
  round: 0,
  battle: null,
  breeding: {
    schemaVersion: 3,
    seed: 987654321,
    nextId: 3,
    active: 'c1',
    creatures: [
      {
        id: 'c1', species: 'nullpointer', xp: 0, bxp: 50, gen: 1, bonuses: [], clutch: 0,
        wins: 0, losses: 0, round: 0, hits: 0, damageTotal: '0', hp: 44,
      },
      {
        id: 'c2', species: 'deadlock', xp: 100000, bxp: 50, gen: 1, clutch: 0,
        // +300 BPS = +3 % auf alle Werte: genau der Fall, in dem sich die
        // Basislleiter von den effektiven Werten unterscheidet.
        bonuses: [{ slot: 0, id: 'tune-a', effect: 'statMod', value: 300 }],
        wins: 1, losses: 0, round: 2, hits: 3, damageTotal: '120', hp: 0,
      },
    ],
    eggs: [],
    completions: 0,
  },
  completions: 0,
  wild: null,
  localSteps: 0,
  spawnedAt: 0,
  lastResult: null,
  log: [],
  damageTotal: '0',
  lock: null,
  peakHit: 0,
  digits: 1,
  milestones: [],
  drops: [],
  rejections: 0,
  loot: { schrott: 0, brauchbar: 0, shiny: 0, sinceShiny: 0 },
});

/** Alle `select`-Knoepfe eines Baumes als flache Liste. */
const selects = (node, out = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((child) => selects(child, out)); return out; }
  if (node.type === 'select') out.push(node);
  selects(node.children, out);
  return out;
};

/**
 * Die Optionen eines `select` (sie sind Kinder, keine Props).
 *
 * `Array.from` ist hier Absicht: die Klassen stammen aus der vm-Attrappe,
 * und `deepStrictEqual` vergleicht die Prototypen — ein vm-Array ist nicht
 * dasselbe Array. Ohne das waere der Vergleich an der Form statt an der
 * Sache gescheitert.
 */
const optionsOf = (select) => Array.from((select.children ?? [])
  .filter((child) => child && child.type === 'option')
  .map((child) => child.props?.value));

describe('S2a — der Picker im Panel-Kopf waehlt eine Kreatur, keine Art', () => {
  test('die Auswahl im Kopf uebernimmt die Kreatur samt ihrer Art', () => {
    const sim = boot({ save: saveWithTwoCreatures() });
    const panel = sim.slots.find((slot) => slot.options.key === 'shinon-codingmon').component;
    const tree = flatten(panel({}));
    const picker = selects(tree).find((node) => optionsOf(node).length >= 2);
    assert.ok(picker !== undefined, 'der Panel-Kopf hat keine Kreatur-Auswahl');
    // Die Optionen tragen KREATUR-IDs (c1, c2), keine Art-IDs.
    const values = optionsOf(picker);
    assert.deepEqual(values, ['c1', 'c2'], 'die Optionen muessen Kreatur-IDs tragen');
    picker.props.onChange({ target: { value: 'c2' } });
    const state = sim.api.state();
    assert.equal(state.breeding.active, 'c2', 'die gewaehlte Kreatur ist nicht aktiv');
    assert.equal(state.species, 'deadlock', 'die Art folgt der Kreatur');
  });

  test('eine Art-ID im Kreatur-Picker wird abgewiesen (kein stiller Leerlauf)', () => {
    const sim = boot({ save: saveWithTwoCreatures() });
    const panel = sim.slots.find((slot) => slot.options.key === 'shinon-codingmon').component;
    const tree = flatten(panel({}));
    const picker = selects(tree).find((node) => optionsOf(node).length >= 2);
    picker.props.onChange({ target: { value: 'segfault' } });
    assert.equal(sim.api.state().species, 'nullpointer', 'eine Art-ID wurde als Kreatur angenommen');
    assert.equal(sim.api.state().breeding.active, 'c1', 'die aktive Kreatur wurde veraendert');
  });

  test('die Fenster-API haelt die beiden IDs getrennt', () => {
    const sim = boot({ save: saveWithTwoCreatures() });
    assert.equal(sim.api.pick('segfault')?.species, 'segfault', 'api.pick nimmt eine Art-ID');
    assert.equal(sim.api.pick('c2'), null, 'api.pick nimmt KEINE Kreatur-ID');
    sim.api.selectCreature('c2');
    assert.equal(sim.api.state().species, 'deadlock', 'api.selectCreature nimmt eine Kreatur-ID');
    assert.equal(sim.api.selectCreature('segfault'), null, 'api.selectCreature nimmt KEINE Art-ID');
  });
});

describe('S2b — das Hoechst-HP ist ueberall dieselbe Zahl', () => {
  test('Leiste und Arena zeigen die effektiven Werte, nicht die Basislleiter', () => {
    const sim = boot({ save: saveWithTwoCreatures() });
    sim.api.selectCreature('c2');
    const expbar = sim.slots.find((slot) => slot.options.id === 'shinon-exp-bar').component;
    const dock = sim.slots.find((slot) => slot.options.id === 'shinon-wild-dock').component;

    // Der Kampf muss offen sein, damit die Arena den eigenen Balken zeigt.
    sim.api.start();
    sim.clock.advance(3000);
    const level = sim.api.state().level;
    const base = host.statsAt('deadlock', level).hp;
    const effective = Math.floor((base * 103) / 100);
    assert.ok(effective > base, 'der Zuchtbonus muss die Zahl wirklich aendern');
    assert.equal(sim.api.state().stats.hp, effective, 'der Client rechnet eine andere Zahl');

    const expText = collectText(flatten(expbar({}))).join(' | ');
    const dockText = collectText(flatten(dock({}))).join(' | ');
    // Im Dock steht der GEGNER zuerst — der letzte Treffer ist der eigene.
    const dockMax = [...dockText.matchAll(/HP [\d.]+\/([\d.]+)/g)].at(-1)?.[1];
    const expMax = [...expText.matchAll(/HP [\d.]+\/([\d.]+)/g)].at(-1)?.[1];
    assert.equal(expMax, String(effective), `die Leiste zeigt ${expMax}, effektiv sind ${effective}`);
    assert.equal(dockMax, String(effective), `die Arena zeigt ${dockMax}, effektiv sind ${effective}`);
    assert.notEqual(expMax, String(base), 'die Leiste zeigt noch die Basislleiter');
  });

  test('die Basislleiter ist als solche ausgewiesen', () => {
    const sim = boot({ save: saveWithTwoCreatures() });
    sim.api.selectCreature('c2');
    const panel = sim.slots.find((slot) => slot.options.key === 'shinon-codingmon').component;
    const text = collectText(flatten(panel({}))).join(' | ');
    assert.ok(text.includes('Basislleiter, exakt'), 'die Eskalationszeile nennt die Leiter nicht');
  });
});

describe('S2d — der Praesentationszustand folgt dem Zustand', () => {
  /** Das `data-state`-Attribut der Wander-Figur im XP-Balken. */
  const stateOf = (sim) => {
    const expbar = sim.slots.find((slot) => slot.options.id === 'shinon-exp-bar').component;
    const json = JSON.stringify(flatten(expbar({})));
    return json.match(/"data-state":"([a-z]+)"/)?.[1] ?? null;
  };

  test('ohne Kampf ist die Figur idle', () => {
    const sim = boot();
    assert.equal(stateOf(sim), 'idle');
  });

  test('ein offener Kampf ist combat, ein laufender Zug ist action', () => {
    const sim = boot();
    // Der Zug laeuft: die Sperre steht, der Gegner ist noch nicht aufgestellt.
    sim.api.start();
    assert.equal(stateOf(sim), 'action', 'waehrend des Zuges laeuft etwas');
    // Der Kampf ist offen, die Sperre steht nicht mehr.
    sim.clock.advance(3000);
    assert.equal(stateOf(sim), 'combat', 'ein offener Kampf ist kein idle');
    sim.api.use(sim.api.abilities().slice(-1)[0].id);
    assert.equal(stateOf(sim), 'action', 'waehrend des Zuges laeuft etwas');
  });

  test('das Ergebnis ist ein Fenster von 1,6 Sekunden, kein Zustand', () => {
    const sim = boot();
    sim.api.start();
    sim.clock.advance(3000);
    // Der Kampf laeuft, bis er wirklich zu Ende ist — ein Zug allein reicht
    // nicht, ein Treffer macht den Gegner nicht kleiner.
    let guard = 0;
    while (sim.api.state().lastResult === null && guard < 60) {
      guard += 1;
      const state = sim.api.state();
      if (state.lock !== null) { sim.clock.advance(3000); continue; }
      if (state.battle === null || state.battle.turn !== 'challenger') { sim.clock.advance(3000); continue; }
      sim.api.use(sim.api.abilities().slice(-1)[0].id);
      sim.clock.advance(3000);
    }
    const result = sim.api.state().lastResult;
    assert.ok(result !== null, 'der Kampf hat kein Ergebnis erzeugt');
    const during = stateOf(sim);
    assert.ok(['victory', 'defeat', 'flee'].includes(during), `unbekannter Zustand ${during}`);
    // Das Ergebnis ist das ERSTE, was die Figel zeigt — und es steht nicht
    // laenger als das Fenster.
    assert.equal(during, result.outcome === 'win' ? 'victory'
      : result.outcome === 'loss' ? 'defeat' : 'flee');
  });

  test('ein altes Ergebnis verfaellt: die Figel geht zurueck auf idle', () => {
    // Ein Stand mit einem Ergebnis von vor zehn Minuten. Das Fenster ist
    // abgelaufen — die Figel darf nicht ewig als Sieg herumstehen.
    const save = saveWithTwoCreatures();
    save.lastResult = { outcome: 'win', speciesId: 'racecondition', level: 1, reward: 22, at: Date.now() - 600000 };
    const sim = boot({ save });
    assert.equal(stateOf(sim), 'idle', 'ein altes Ergebnis steht noch als Sieg da');
  });

  test('ein frisches Ergebnis steht sichtbar da', () => {
    const save = saveWithTwoCreatures();
    save.lastResult = { outcome: 'win', speciesId: 'racecondition', level: 1, reward: 22, at: Date.now() };
    const sim = boot({ save });
    assert.equal(stateOf(sim), 'victory');
  });
});

describe('S2c — die Konfiguration kennt kein Feld ohne Leser', () => {
  test('jedes Config-Feld des Patches steht im Schema des Pakets', () => {
    const patchKeys = [...PATCH.matchAll(/^\s{8}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((match) => match[1]);
    assert.ok(patchKeys.length > 0, 'der Patch nennt kein Config-Feld');
    const schema = INDEX.slice(INDEX.indexOf('export const Config = z.object('));
    for (const key of patchKeys) {
      assert.ok(new RegExp(`\\b${key}:`).test(schema), `das Patch-Feld ${key} steht nicht im Config-Schema`);
    }
  });

  test('die toten Felder sind entfernt', () => {
    assert.ok(!/^\s*wildLimit:/m.test(PATCH), 'wildLimit verspricht wilde Pets, die es nicht gibt');
    assert.ok(!/^\s*idleAfterMs:/m.test(PATCH), 'idleAfterMs verspricht ein Idle-Fenster, das es nicht gibt');
  });
});

describe('S2e — der Gitter-Rueckfall bleibt bei der eigenen Familie', () => {
  test('der Aufloesungsweg des Gitters ist: eigenes Gitter, sonst Familie, sonst Notfall', () => {
    const sim = boot();
    const families = new Map();
    for (const id of sim.api.species()) {
      const species = host.SPECIES[id];
      const key = sim.api.spriteKey(id, 'front');
      assert.ok(typeof key === 'string' && key.length > 0, `kein Sprite fuer ${id}`);
      if (!families.has(species.family)) families.set(species.family, new Set());
      families.get(species.family).add(key.split('-')[0]);
    }
    // Je Familie duerfen nur Gitter DIESER Familie vorkommen.
    for (const [family, owners] of families) {
      for (const owner of owners) {
        const ownerFamily = host.SPECIES[owner]?.family;
        assert.equal(ownerFamily, family,
          `${owner} (${ownerFamily}) wird fuer die Familie ${family} gezeigt`);
      }
    }
    assert.equal(families.size, 3, 'der Katalog hat drei Familien');
  });

  test('beide Seiten (front/back) loesen auf dieselbe Familie auf', () => {
    const sim = boot();
    for (const id of sim.api.species()) {
      const family = host.SPECIES[id].family;
      for (const side of ['front', 'back']) {
        const key = sim.api.spriteKey(id, side);
        assert.equal(host.SPECIES[key.split('-')[0]]?.family, family,
          `${id}/${side} zeigt ein Sprite aus einer anderen Familie`);
      }
    }
  });

  test('die Anzeige selbst nimmt die Kunst, nicht den Rueckfall', () => {
    const sim = boot();
    for (const id of sim.api.species()) {
      assert.equal(sim.api.spriteFor(id, 'front'), `art:${id}`, `${id}: Anzeige ohne eigene Kunst`);
    }
  });
});
