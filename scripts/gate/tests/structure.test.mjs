/**
 * Der Struktur-Riegel muss OHNE die Grenzen rot sein — sonst misst der Test
 * nur, dass `structureIssues()` auf dem heutigen Baum `[]` liefert, und ein
 * Riegel, der nie etwas fängt, ist keiner.
 *
 * Deshalb steht neben dem Echtbaum-Fall ein Miniatur-Baum in `os.tmpdir()`:
 * eine Registry mit zwei Klassen und ein paar Dateien. Jede Mutation kippt
 * genau EINE Regel, und der Befund muss sie benennen — eine Datei über der
 * Grenze, eine ohne Klasse, eine, die den Vertrag ihrer Klasse bricht, ein
 * Bestand, der nicht mehr stimmt, ein Bestand ohne Datei, eine fehlende
 * Registry.
 *
 * Der Echtbaum-Fall ist der Billigste und der Wichtigste: er friert ein, dass
 * die Registry heute ehrlich ist (keine geratene Grenze, kein Eintrag, der
 * einen Schnitt verlangt). Ein Test, der nur den Echtbaum prüft, wäre grün,
 * sobald jemand die Grenzen hochsetzt — deshalb die Mutationen daneben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { structureIssues } from '../../lib/structure.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const REGISTRY = {
  contract: 'shinon.structure/v1',
  rules: [{ positive: 'x', forbidden: 'y', fallback: 'z', error: 'e', trace: 't', replay: 'r', invariant: 'i' }],
  klassen: [
    { id: 'host-entry', muster: '^packages/[^/]+/index\\.js$', grenze: 10, gemessen: { anzahl: 1, median: 3, max: 3 }, vertrag: ['function apply('] },
    { id: 'client', muster: '^packages/[^/]+/client\\.js$', grenze: 10, gemessen: { anzahl: 1, median: 3, max: 3 }, verboten: ['export const Config'] },
    { id: 'test', muster: '^scripts/gate/tests/.*\\.mjs$', grenze: 10, gemessen: { anzahl: 1, median: 3, max: 3 } },
  ],
  bestand: {},
  bestandAusnahmen: {},
};

/** Baut einen Baum aus `{ pfad: inhalt }`, legt die Registry dazu und räumt auf. */
function baum(files) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-structure-'));
  for (const [datei, inhalt] of Object.entries({ 'docs/contracts/structure.json': JSON.stringify(REGISTRY), ...files })) {
    const abs = join(root, datei);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, inhalt);
  }
  return root;
}

function zeilen(n) {
  return `${'// Zeile\n'.repeat(n - 1)}// letzte Zeile\n`;
}

const GUT_HOST = 'export function apply() {}\n';
const GUT_CLIENT = 'export const name = "x";\n';

test('Echtbaum: jede Datei hat eine Klasse, keine reißt ihre Grenze', () => {
  assert.deepEqual(structureIssues(ROOT), []);
});

test('Miniatur-Baum innerhalb der Grenzen ist grün', () => {
  const root = baum({
    'packages/a/index.js': GUT_HOST,
    'packages/a/client.js': GUT_CLIENT,
  });
  try {
    assert.deepEqual(structureIssues(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Datei über der Klassengrenze nennt Datei, Ist-Zeilen und Grenze', () => {
  const root = baum({ 'packages/a/client.js': `${GUT_CLIENT}${zeilen(20)}` });
  try {
    const issues = structureIssues(root);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /packages\/a\/client\.js: 21 Zeilen über der Grenze 10 \(client\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Datei ohne Klasse ist ein Befund, kein stilles Grün', () => {
  const root = baum({ 'packages/a/extra.js': 'export const x = 1;\n' });
  try {
    const issues = structureIssues(root);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /packages\/a\/extra\.js: keine Klasse/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Client-Hälfte mit Schema verletzt den Vertrag ihrer Klasse', () => {
  const root = baum({ 'packages/a/client.js': `${GUT_CLIENT}export const Config = {};\n` });
  try {
    const issues = structureIssues(root);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /client\.js: Klasse client verbietet `export const Config`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Host-Einstieg ohne `apply` verletzt den Vertrag seiner Klasse', () => {
  const root = baum({ 'packages/a/index.js': 'export const name = "a";\n' });
  try {
    const issues = structureIssues(root);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /index\.js: Vertrag der Klasse host-entry verlangt `function apply\(`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Bestand ist eine Obergrenze: Wachstum und Schwund sind beide rot', () => {
  const wachsend = baum({ 'packages/a/client.js': `${GUT_CLIENT}${zeilen(20)}` });
  try {
    writeFileSync(join(wachsend, 'docs/contracts/structure.json'), JSON.stringify({ ...REGISTRY, bestand: { 'packages/a/client.js': 21 } }));
    assert.deepEqual(structureIssues(wachsend), []);
    writeFileSync(join(wachsend, 'packages/a/client.js'), `${GUT_CLIENT}${zeilen(30)}`);
    assert.match(structureIssues(wachsend)[0], /31 Zeilen, Bestand 21 \(client\)/);
  } finally {
    rmSync(wachsend, { recursive: true, force: true });
  }

  const sinkend = baum({ 'packages/a/client.js': `${GUT_CLIENT}${zeilen(20)}` });
  try {
    writeFileSync(join(sinkend, 'docs/contracts/structure.json'), JSON.stringify({ ...REGISTRY, bestand: { 'packages/a/client.js': 25 } }));
    // Ein sinkender Bestand ist ein Befund, kein Fehler: der Eintrag lügt über
    // den Baum, bis jemand ihn nachzieht. Genau das erzwingt der Riegel.
    assert.match(structureIssues(sinkend)[0], /21 Zeilen, Bestand nennt 25 \(client\) — senke den Eintrag auf 21/);
  } finally {
    rmSync(sinkend, { recursive: true, force: true });
  }
});

test('maschinelle Test-Ausnahme erlaubt begrenztes Wachstum und sperrt das Ueberziehen', () => {
  const root = baum({ 'scripts/gate/tests/case.test.mjs': zeilen(21) });
  try {
    const registry = {
      ...REGISTRY,
      bestand: { 'scripts/gate/tests/case.test.mjs': 20 },
      bestandAusnahmen: { 'scripts/gate/tests/case.test.mjs': { grund: 'neue Abnahmefaelle', datum: '2026-10-22', maxZeilen: 25 } },
    };
    writeFileSync(join(root, 'docs/contracts/structure.json'), JSON.stringify(registry));
    assert.deepEqual(structureIssues(root), [], 'Wachstum innerhalb der Ausnahmegrenze ist erlaubt');
    writeFileSync(join(root, 'scripts/gate/tests/case.test.mjs'), zeilen(26));
    assert.match(structureIssues(root)[0], /26 Zeilen über der Ausnahmegrenze 25/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Bestand-Ausnahmen sind nur mit gueltigem Grund und fuer Testdateien erlaubt', () => {
  const root = baum({ 'packages/a/client.js': GUT_CLIENT });
  try {
    writeFileSync(join(root, 'docs/contracts/structure.json'), JSON.stringify({
      ...REGISTRY,
      bestand: { 'packages/a/client.js': 1 },
      bestandAusnahmen: { 'packages/a/client.js': { grund: '', datum: 'gestern', maxZeilen: 2 } },
    }));
    const issues = structureIssues(root);
    assert.ok(issues.some((issue) => /nur für Testdateien zulässig/.test(issue)));
    assert.ok(issues.some((issue) => /braucht Grund, Datum und maxZeilen/.test(issue)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Bestandseintrag ohne Datei und fehlende Registry sind Befunde', () => {
  const tot = baum({ 'packages/a/client.js': GUT_CLIENT });
  try {
    writeFileSync(join(tot, 'docs/contracts/structure.json'), JSON.stringify({ ...REGISTRY, bestand: { 'packages/a/weg.js': 12 } }));
    assert.match(structureIssues(tot)[0], /packages\/a\/weg\.js: Bestandseintrag ohne Datei/);
  } finally {
    rmSync(tot, { recursive: true, force: true });
  }

  const leer = mkdtempSync(join(tmpdir(), 'shinon-structure-'));
  try {
    assert.match(structureIssues(leer)[0], /docs\/contracts\/structure\.json fehlt/);
  } finally {
    rmSync(leer, { recursive: true, force: true });
  }
});
