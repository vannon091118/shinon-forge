#!/usr/bin/env node
/**
 * Die Skill-Registry: das INVENTAR und die BEDARFSENTSCHEIDUNG.
 *
 * ANLASS: Der Skill-Lebenszyklus (packages/prompter/assets/skill-lifecycle.js)
 * erzeugte Kandidaten aus Belegen, ohne zu wissen, OB ueberhaupt etwas zu tun
 * ist. Ohne Registry laeuft die Arbeit bei jedem Signal — auch wenn alle Skills
 * aktuell sind, oder wenn das Projekt gar keine Skills hat. Beides ist
 * verschwendete Modell-Arbeit und ein Grund, den Host zu stoppen.
 *
 * DIE ZUSAGE, die dieser Test pinnt: die Bedarfsentscheidung nennt IMMER einen
 * der fuenf Faelle und die belegenden Zahlen. Ein 'vielleicht' gibt es nicht.
 *
 * Laeuft mit `node --test`; braucht kein node_modules (die Kern-Dateien sind
 * importfrei).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const core = await import(new URL('../../../packages/prompter/assets/skill-registry-core.js', import.meta.url).href);

/** Zwei Skills, wie der Host sie liest. */
const SKILLS = [
  { name: 'shinon-dev-workflow', description: 'Arbeitsablauf fuer Shinon Forge — Commit-Regeln', mtimeMs: 1000 },
  { name: 'shinon-test-tempo', description: 'Schnellster Weg zu echtem Signal — Testlauf', mtimeMs: 2000 },
];

/** Die Registry dazu — beide aktuell und passend. */
function registryAktuell() {
  return SKILLS.map((skill) => core.registryEntryOf(skill));
}

test('alles aktuell: kein Bedarf, keine Arbeit', () => {
  const inv = core.inventory({ skills: SKILLS, registry: registryAktuell(), inhalte: ['commit', 'testlauf'] });
  const entscheidung = core.decide(inv);
  assert.equal(entscheidung.bedarf, core.BEDARF.AKTUELL);
  assert.equal(entscheidung.zahlen.skills, 2);
  assert.equal(entscheidung.zahlen.veraltet, 0);
  assert.equal(entscheidung.zahlen.neu, 0);
});

test('keine Skills: der Fall, in dem gar nichts laufen darf', () => {
  const inv = core.inventory({ skills: [], registry: [] });
  const entscheidung = core.decide(inv);
  assert.equal(entscheidung.bedarf, core.BEDARF.KEINE_SKILLS);
  assert.equal(entscheidung.zahlen.skills, 0);
});

test('Registry fehlt: die Skills sind da, der Zustand fehlt', () => {
  const inv = core.inventory({ skills: SKILLS, registry: [] });
  const entscheidung = core.decide(inv);
  assert.equal(entscheidung.bedarf, core.BEDARF.REGISTRY_FEHLT);
  assert.equal(entscheidung.zahlen.skills, 2);
  assert.equal(entscheidung.zahlen.registry, 0);
  assert.equal(entscheidung.zahlen.neu, 2);
});

test('veraltet: die Datei ist juenger als der Registry-Eintrag', () => {
  const registry = registryAktuell();
  const geaendert = [{ ...SKILLS[0], mtimeMs: 9999 }, SKILLS[1]];
  const inv = core.inventory({ skills: geaendert, registry, inhalte: ['commit', 'testlauf'] });
  const entscheidung = core.decide(inv);
  assert.equal(entscheidung.bedarf, core.BEDARF.VERALTET);
  assert.equal(entscheidung.zahlen.veraltet, 1);
  assert.deepEqual(inv.veraltet, ['shinon-dev-workflow']);
});

test('passen nicht mehr: die Beschreibung nennt keinen Projektbegriff', () => {
  const inv = core.inventory({
    skills: SKILLS,
    registry: registryAktuell(),
    inhalte: ['kubernetes', 'terraform'],
  });
  const entscheidung = core.decide(inv);
  assert.equal(entscheidung.bedarf, core.BEDARF.PASSEN_NICHT);
  assert.equal(entscheidung.zahlen.passenNicht, 2);
});

test('jede Entscheidung nennt die belegenden Zahlen', () => {
  const faelle = [
    core.inventory({ skills: [], registry: [] }),
    core.inventory({ skills: SKILLS, registry: [] }),
    core.inventory({ skills: [{ ...SKILLS[0], mtimeMs: 9999 }, SKILLS[1]], registry: registryAktuell() }),
    core.inventory({ skills: SKILLS, registry: registryAktuell(), inhalte: ['kubernetes'] }),
    core.inventory({ skills: SKILLS, registry: registryAktuell(), inhalte: ['commit'] }),
  ];
  for (const inv of faelle) {
    const entscheidung = core.decide(inv);
    assert.ok(core.BEDARF_REIHENFOLGE.includes(entscheidung.bedarf), `unbekannter Fall: ${entscheidung.bedarf}`);
    assert.ok(typeof entscheidung.grund === 'string' && entscheidung.grund.length > 0, 'der Grund wird genannt');
    for (const schluessel of ['skills', 'neu', 'veraltet', 'passenNicht', 'registry']) {
      assert.equal(typeof entscheidung.zahlen[schluessel], 'number', `die Zahl ${schluessel} fehlt`);
    }
  }
});

test('die Rangfolge ist eindeutig: kein Fall kann zwei Bedarfe haben', () => {
  // Ohne Registry UND veraltete Datei: die Registry fehlt zuerst, weil
  // "veraltet" ohne Registry begrifflich nicht gibt.
  const inv = core.inventory({ skills: [{ ...SKILLS[0], mtimeMs: 9999 }], registry: [] });
  const entscheidung = core.decide(inv);
  assert.equal(entscheidung.bedarf, core.BEDARF.REGISTRY_FEHLT);
});

test('der Fingerabdruck ist stabil und aendert sich mit der Datei', () => {
  const a = core.fingerprintOf({ name: 'x', description: 'Beschreibung', mtimeMs: 1000 });
  const b = core.fingerprintOf({ name: 'x', description: 'Beschreibung', mtimeMs: 1000 });
  const c = core.fingerprintOf({ name: 'x', description: 'Beschreibung', mtimeMs: 2000 });
  assert.equal(a, b, 'gleiche Eingabe, gleicher Fingerabdruck');
  assert.notEqual(a, c, 'eine andere Datei, ein anderer Fingerabdruck');
});

test('der Abgleich haelt einen Skill genau einmal', () => {
  const registry = registryAktuell();
  const abgeglichen = core.abgleichen(registry, SKILLS);
  assert.equal(abgeglichen.length, 2);
  assert.deepEqual(abgeglichen.map((e) => e.name).sort(), ['shinon-dev-workflow', 'shinon-test-tempo']);
  // Ein zweiter Abgleich aendert nichts — das Ledger soll nicht bei jedem
  // Lauf als "geaendert" gelten.
  const nochmal = core.abgleichen(abgeglichen, SKILLS);
  assert.deepEqual(nochmal, abgeglichen);
});

test('ein Skill ohne Namen wird ignoriert, nicht geraten', () => {
  const inv = core.inventory({ skills: [{ description: 'ohne Namen', mtimeMs: 1 }], registry: [] });
  assert.equal(inv.vorhanden.length, 0);
});
