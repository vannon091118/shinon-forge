#!/usr/bin/env node
/**
 * Abnahmetest des geteilten Quelltext-Scanners (scripts/lib/source-scan.mjs).
 *
 * Warum diese Datei existiert: der Scanner ist das Auge jedes Grenz-Gates
 * („dieser Code darf X nie aufrufen"). Ein Auge, das zu viel wegschneidet, macht
 * ein Gate still blind — es bleibt grün und beweist nichts. Genau das war
 * gemessen der Fall, als der Project Index seinen Worker-Quelltext als
 * Template-Literal mitbrachte: die alte Fassung entfernte erst Kommentare und
 * dann Strings, in zwei Durchläufen mit je einem eigenen Muster; ein Template,
 * das Quelltext als TEXT enthält, verschob die Paarung und verschluckte echten
 * Code (`new DatabaseSync(file)` war nicht mehr im 'codeOnly'-Ergebnis).
 *
 * Der Test pinnt deshalb die Zusagen des Scanners als Tabelle: Kommentare zählen
 * nicht, String-Inhalte zählen nicht, CODE IN `${…}` zählt, Escape und
 * Zeilenenden werden richtig gelesen, und nichts ausserhalb eines Literals
 * verschwindet.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz,
 * kein Modell, kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { codeOnly, findForbidden, findMissing, stripComments, stripStrings, tokenize } from '../../lib/source-scan.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');

test('Kommentare zählen nicht, Code daneben schon', () => {
  const cases = [
    { name: 'Zeilenkommentar', text: 'const a = 1; // fetch(url)\nconst b = 2;', forbidden: ['fetch('], expected: [] },
    { name: 'Blockkommentar', text: '/* fetch(url) */\nconst b = 2;', forbidden: ['fetch('], expected: [] },
    { name: 'mehrzeiliger Blockkommentar', text: '/*\n * fetch(url)\n */\nconst b = 2;', forbidden: ['fetch('], expected: [] },
    { name: 'URL im Code bleibt', text: "const u = 'https://example.org/x';\n", forbidden: [], expected: [] },
    { name: 'doppelter Schrägstrich im String ist kein Kommentar', text: "const u = 'a//b';\nconst nachher = 1;", forbidden: [], expected: [] },
  ];
  for (const { name, text, forbidden, expected } of cases) {
    assert.deepEqual(findForbidden(text, forbidden), expected, name);
  }
  assert.ok(stripComments("const u = 'a//b';\nconst danach = 1;").includes('const danach'), 'der Code nach dem String bleibt');
  assert.ok(stripComments('// weg\nconst bleibt = 1;').includes('const bleibt'));
  assert.ok(!stripComments('/* weg */ const bleibt = 1;').includes('weg'));
});

test('String-Inhalte zählen nicht — aber der Code in ${…} eines Templates zählt', () => {
  const cases = [
    { name: 'einfaches Anführungszeichen', text: "const a = 'fetch(url)';", forbidden: ['fetch('], expected: [] },
    { name: 'doppeltes Anführungszeichen', text: 'const a = "process.exit(1)";', forbidden: ['process.exit'], expected: [] },
    { name: 'Template ohne Interpolation', text: 'const a = `process.exit(1)`;', forbidden: ['process.exit'], expected: [] },
    { name: 'Interpolation im Template ist Code', text: 'const a = `x ${process.exit(1)} y`;', forbidden: ['process.exit'], expected: ['process.exit'] },
    { name: 'verschachteltes Template in der Interpolation', text: 'const a = `x ${`y ${process.exit(1)}`} z`;', forbidden: ['process.exit'], expected: ['process.exit'] },
    { name: 'String in der Interpolation ist wieder String', text: 'const a = `x ${"process.exit(1)"}`;', forbidden: ['process.exit'], expected: [] },
    { name: 'escape im String', text: "const a = 'it\\'s fetch(url)';", forbidden: ['fetch('], expected: [] },
  ];
  for (const { name, text, forbidden, expected } of cases) {
    assert.deepEqual(findForbidden(text, forbidden), expected, `${name} (code)`);
  }
  assert.deepEqual(
    findMissing(codeOnly("const vorher = 1;\nconst a = 'fetch(url)';\nconst nachher = 2;"), ['const vorher', 'const nachher']),
    [],
    'Code vor und nach einem String bleibt Code — sonst waere das Gate blind',
  );

  // Modus 'module' liest die Strings mit — dort sind Importnamen gemeint, keine Aufrufe.
  assert.deepEqual(findForbidden("import x from 'child_process';", ['child_process'], { mode: 'module' }), ['child_process']);
  assert.deepEqual(findForbidden("import x from 'child_process';", ['child_process']), [], 'im Code-Modus ist der Importname ein String und kein Aufruf');
  assert.deepEqual(findMissing("import x from 'child_process';", ['child_process'], { mode: 'module' }), []);
});

/**
 * Regressionstest — der Grund, warum der Scanner neu gebaut wurde.
 *
 * Ein Template-Literal, das Quelltext als TEXT enthält (so trägt der Project
 * Index seinen Worker-Quelltext), darf den Scanner nicht dazu bringen, echten
 * Code zu verschlucken. Vorher war genau das der Fall.
 */
test('Regression: Quelltext als Text in einem Template macht das Gate nicht blind', () => {
  const source = [
    'const WORKER_SOURCE = `',
    '  import(workerData.module).then((mod) => {',
    '    parentPort.postMessage({ ok: true });',
    '  });',
    '`;',
    'const db = new DatabaseSync(file);',
    'const nachher = fetch(url);',
  ].join('\n');
  assert.ok(codeOnly(source).includes('new DatabaseSync'), 'der Code NACH dem Template bleibt sichtbar');
  assert.deepEqual(findForbidden(source, ['fetch(']), ['fetch('], 'und verbotene Aufrufe danach werden gefunden');

  // Und am echten Paket, das den Fall ausgelöst hat.
  const core = read('packages/project-index/assets/index-core.js');
  assert.deepEqual(findMissing(codeOnly(core), ['new DatabaseSync']), [], 'die Kontrolle im Vertrag des Index ist aussagekräftig');
  assert.ok(codeOnly(core).includes('const db = new DatabaseSync(file);'), 'die Zeile selbst steht im Ergebnis');
});

test('tokenize zerlegt Kommentar, String und Code — und lässt nichts fallen', () => {
  const text = "const a = 'x'; // c\nconst b = `y${z}`;\n";
  const segments = tokenize(text);
  assert.equal(segments.map((segment) => segment.text).join(''), text, 'die Zerlegung ist verlustfrei');
  assert.equal(
    segments.map((segment) => segment.kind).join(','),
    'code,string,code,comment,code,string,code,code,code,string,code',
    'jeder Abschnitt trägt seinen Zustand: Code, String, Kommentar und die Interpolation als Code',
  );
  assert.deepEqual(
    segments.filter((segment) => segment.kind === 'comment').map((segment) => segment.text),
    ['// c\n'],
    'der Kommentar-Abschnitt beginnt bei den Schrägstrichen',
  );
  assert.deepEqual(
    segments.filter((segment) => segment.kind === 'string').map((segment) => segment.text),
    ["'x'", '`y', '`'],
    'String-Abschnitte beginnen am Anführungszeichen und enden daran',
  );
  const stripped = stripStrings(text);
  assert.ok(!stripped.includes('x'), 'der Stringinhalt ist weg');
  assert.ok(!stripped.includes('y'), 'auch der Template-Text vor der Interpolation ist weg');
  assert.ok(stripped.includes("''"), 'die Anfuehrungszeichen des Strings bleiben stehen');
  assert.equal((stripped.match(/`/g) ?? []).length, 2, 'und die beiden Backticks des Templates auch');
  assert.ok(stripped.includes('${z}'), 'die Interpolation bleibt Code');
  assert.ok(stripped.includes('const b = '), 'der Code vor dem Template bleibt Code');
});

/**
 * Regression: ein Kommentar OHNE abschliessende Zeilenende am Dateiende wurde als
 * Code gelesen (der Endzustand hiess `line-comment`, geprueft wurde `comment`) —
 * damit meldete jedes Grenz-Gate einen Kommentar als Aufruf. Gefunden hat das der
 * Markers-Test, nicht der Index.
 */
test('Regression: ein Kommentar am Dateiende ist ein Kommentar', () => {
  assert.deepEqual(findForbidden('const a = 1;\n// writeFileSync ist nur ein Kommentar.', ['writeFileSync']), []);
  assert.deepEqual(findForbidden('const a = 1;\n// fetch(url)', ['fetch('], { mode: 'module' }), []);
  assert.deepEqual(findForbidden('const a = 1;\n/* process.exit */', ['process.exit']), []);
  assert.ok(stripComments('const a = 1;\n// weg').includes('const a = 1;'));
  assert.ok(!stripComments('const a = 1;\n// weg').includes('weg'));
});

test('unfertige Literale sind ein Befund für den Scanner, kein verschluckter Rest', () => {
  assert.ok(!codeOnly("const a = 'nie geschlossen;\nconst b = 1;").includes('nie geschlossen'), 'der Stringinhalt bleibt weg');
  assert.ok(codeOnly("const a = 'nie geschlossen;\nconst b = 1;").includes('const b = 1;'), 'der Code danach bleibt');
  assert.ok(codeOnly('const a = `offen${x').includes('x'), 'die Interpolation bleibt sichtbar');
});
