/**
 * scripts/gate/tests/client-montage.test.mjs — das Bundle ist seine Quellteile.
 *
 * Warum diese Datei existiert: `scripts/build-client.mjs` hat die acht
 * handgespiegelten Client-Hälften in Quellteile zerlegt, und `structure.json`
 * befreit eine GENERIERTE Datei von der Zeilengrenze. Diese Befreiung ist nur
 * ehrlich, solange die Datei bytegleich aus ihren Quellen reproduzierbar ist —
 * sonst wäre „generiert" ein Etikett auf einem handgepflegten Monolithen.
 *
 * Der Test prüft deshalb BEIDES:
 *
 *   1. den Echtbaum (`clientMontageIssues()`, derselbe Riegel wie Gate und
 *      Build) und die Syntax jedes Bundles (`new Function` parst, führt nichts aus);
 *   2. die Regeln auf einem Miniatur-Baum, damit ein Riegel, der nie etwas
 *      fängt, hier rot wird: Drift im Teil, fehlender Teil, verwaister Teil,
 *      GENERIERT-Marke ohne Teile, `assets/client/` ohne Marken.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildClient, clientMontageIssues } from '../../build-client.mjs';
import { splitClient } from '../../assets/split-client.mjs';
import { findBlockFile, markerBalance, writeBlock } from '../../lib/embed-blocks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Ein Bundle mit genau einem Quellteil, wie es der Splitter schreibt. */
function bundle(pkg, part, body, options = {}) {
  const marke = options.marke === false ? '' : ' * GENERIERT aus assets/client/*.js — nicht von Hand ändern.\n';
  return `/**\n * @shinon/${pkg} — Client-Hälfte.\n${marke} */\n`
    + 'window.__ModuleLoader__.load({\n'
    + `  id: '@shinon/${pkg}',\n`
    + '  factory(require) {\n'
    + `// >>> @part assets/client/${part}\n${body}// <<< @part assets/client/${part}\n`
    + '  }\n'
    + '});\n';
}

/** Baut einen Miniatur-Baum aus `{ relativer Pfad: Inhalt }`. */
function baum(files) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-montage-'));
  for (const [datei, inhalt] of Object.entries(files)) {
    const abs = join(root, datei);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, inhalt);
  }
  return root;
}

test('Echtbaum: jede Client-Hälfte ist bytegleich zu ihren Quellteilen', () => {
  assert.deepEqual(clientMontageIssues(ROOT), []);
});

test('Echtbaum: jedes generierte Bundle ist syntaktisch gültig', () => {
  for (const pkg of readdirSync(join(ROOT, 'packages'))) {
    const file = join(ROOT, 'packages', pkg, 'client.js');
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    assert.doesNotThrow(() => new Function(text), `packages/${pkg}/client.js parst nicht`);
  }
});

test('Echtbaum: ein generiertes Bundle nennt mindestens einen Teil', () => {
  const generiert = readdirSync(join(ROOT, 'packages')).filter((pkg) => {
    const file = join(ROOT, 'packages', pkg, 'client.js');
    try {
      return /GENERIERT aus /.test(readFileSync(file, 'utf8').slice(0, 2000));
    } catch {
      return false;
    }
  });
  assert.ok(generiert.length >= 8, `nur ${generiert.length} generierte Bundles gefunden`);
  for (const pkg of generiert) {
    const text = readFileSync(join(ROOT, 'packages', pkg, 'client.js'), 'utf8');
    assert.match(text, /\/\/ >>> @part assets\/client\/[\w.-]+\.js/, `packages/${pkg}/client.js nennt keinen Teil`);
  }
});

test('Miniatur-Baum: deckungsgleiche Montage ist grün', () => {
  const root = baum({
    'packages/a/client.js': bundle('a', '01-x.js', '    const X = 1;\n'),
    'packages/a/assets/client/01-x.js': '    const X = 1;\n',
  });
  try {
    assert.deepEqual(clientMontageIssues(root), []);
    assert.equal(buildClient(root, 'a').text, readFileSync(join(root, 'packages/a/client.js'), 'utf8'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Miniatur-Baum: Drift im Quellteil ist ein Befund, kein stilles Grün', () => {
  const root = baum({
    'packages/a/client.js': bundle('a', '01-x.js', '    const X = 1;\n'),
    'packages/a/assets/client/01-x.js': '    const X = 2;\n',
  });
  try {
    const issues = clientMontageIssues(root);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /packages\/a\/client\.js weicht von seinen Quellteilen ab/);
    // Der Build schreibt die Wahrheit der Teile, er liest sie nicht zurück.
    assert.match(buildClient(root, 'a').text, /const X = 2;/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Miniatur-Baum: fehlender und verwaister Teil sind Befunde', () => {
  const fehlt = baum({ 'packages/a/client.js': bundle('a', '01-x.js', '    const X = 1;\n') });
  try {
    assert.match(clientMontageIssues(fehlt)[0], /Quellteil fehlt: packages\/a\/assets\/client\/01-x\.js/);
  } finally {
    rmSync(fehlt, { recursive: true, force: true });
  }

  const verwaist = baum({
    'packages/a/client.js': bundle('a', '01-x.js', '    const X = 1;\n'),
    'packages/a/assets/client/01-x.js': '    const X = 1;\n',
    'packages/a/assets/client/02-y.js': '    const Y = 2;\n',
  });
  try {
    assert.match(clientMontageIssues(verwaist)[0], /Quellteil ohne Marke: 02-y\.js/);
  } finally {
    rmSync(verwaist, { recursive: true, force: true });
  }
});

test('Splitter: ein generierter Block wird nie zerschnitten', () => {
  // Der Block ist absichtlich groesser als das Teilziel (200 Zeilen): ohne die
  // Fences-Sperre faellt der Schnitt mitten hinein, und der naechste
  // Generatorlauf verschluckt die Teile-Marken (Fehler vom 2026-10-23).
  const innen = [];
  for (let i = 0; i < 260; i += 1) innen.push('    const W' + i + ' = ' + i + ';');
  const text = [
    'window.__ModuleLoader__.load({',
    "  id: '@shinon/x',",
    '  factory(require) {',
    '    const A = 1;',
    '',
    '    // >>> generated-block — Quelle: assets/block.js',
    '    const BLOCK = (() => {',
    ...innen,
    '    })();',
    '    // <<< generated-block',
    '',
    '    const B = 2;',
    '  },',
    '});',
    '',
  ].join('\n');
  const split = splitClient(text, 'x');
  const rebuilt = [...split.head, ...split.body.flatMap((block) => block.lines), ...split.tail].join('\n');
  assert.equal(rebuilt, text, 'die Zerlegung ist verlustfrei');
  const parts = split.body.map((block) => block.lines.join('\n'));
  const mitBlock = parts.filter((part) => part.includes('// >>> generated-block'));
  assert.equal(mitBlock.length, 1, 'der Block liegt in genau einem Teil');
  assert.match(mitBlock[0], /\/\/ <<< generated-block/, 'und schliesst in demselben Teil');
  assert.equal(parts.filter((part) => part.includes('// <<< generated-block')).length, 1);
});

test('Splitter: eine unbalancierte Marke bricht ab, statt zu raten', () => {
  const text = [
    'window.__ModuleLoader__.load({',
    "  id: '@shinon/x',",
    '  factory(require) {',
    '    const A = 1;',
    '    // <<< generated-block',
    '  },',
    '});',
    '',
  ].join('\n');
  assert.throws(() => splitClient(text, 'x'), /schliesst nicht die offene/);
});

test('Einbetter: ein Rumpf mit fremder Marke wird nicht ersetzt, sondern benannt', () => {
  const text = [
    '    // >>> generated-block',
    '    const A = 1;',
    '    // <<< @part assets/client/01-a.js',
    '    // >>> @part assets/client/02-b.js',
    '    const B = 2;',
    '    // <<< generated-block',
    '',
  ].join('\n');
  // Der alte Rumpf enthaelt ein Teile-Markenpaar in falscher Reihenfolge: genau
  // der Fall, in dem das Schreiben die Teile-Montage zerstoeren wuerde.
  assert.match(markerBalance(text.split('\n').slice(1, -2).join('\n')), /ohne passende Startmarke/);
  assert.throws(() => writeBlock(text, 'generated-block', '    const A = 3;\n'), /wuerde fremde Marken verschlucken/);
  // Balancierte Verschachtelung bleibt erlaubt: ein Teil ENTHAELT Bloecke.
  const nested = [
    '    // >>> @part assets/client/01-a.js',
    '    // >>> generated-ui',
    '    const UI = 1;',
    '    // <<< generated-ui',
    '    // <<< @part assets/client/01-a.js',
    '',
  ].join('\n');
  assert.equal(markerBalance(nested), null);
  assert.equal(writeBlock(nested, '@part assets/client/01-a.js', '    const UI = 2;\n    ').includes('const UI = 2;'), true);
});

test('Einbetter: der Block wird in genau einem Quellteil gefunden', () => {
  const root = baum({
    'packages/a/assets/client/01-x.js': '    // >>> generated-block\n    const A = 1;\n    // <<< generated-block\n',
    'packages/a/assets/client/02-y.js': '    // >>> generated-other\n    const B = 1;\n    // <<< generated-other\n',
  });
  try {
    const dir = join(root, 'packages/a/assets/client');
    assert.equal(findBlockFile(dir, 'generated-block'), join(dir, '01-x.js'));
    assert.throws(() => findBlockFile(dir, 'generated-missing'), /steht in keinem Quellteil/);
    writeFileSync(join(dir, '03-z.js'), '    // >>> generated-block\n    const C = 1;\n    // <<< generated-block\n');
    assert.throws(() => findBlockFile(dir, 'generated-block'), /steht doppelt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Miniatur-Baum: GENERIERT-Marke ohne Teile und Marken ohne Ordner sind Befunde', () => {
  const marke = baum({ 'packages/a/client.js': bundle('a', '01-x.js', '    const X = 1;\n', { marke: true }) });
  try {
    // Die Marke steht im Kopf, aber im Bundle nennt keine Marke einen Teil.
    writeFileSync(join(marke, 'packages/a/client.js'), bundle('a', '01-x.js', '    const X = 1;\n')
      .replace('// >>> @part assets/client/01-x.js\n    const X = 1;\n// <<< @part assets/client/01-x.js\n', ''));
    assert.match(clientMontageIssues(marke)[0], /trägt die GENERIERT-Marke, aber keine Quellteile/);
  } finally {
    rmSync(marke, { recursive: true, force: true });
  }

  const ordner = baum({
    'packages/a/client.js': 'window.__ModuleLoader__.load({ id: "@shinon/a", factory(require) {} });\n',
    'packages/a/assets/client/01-x.js': '    const X = 1;\n',
  });
  try {
    assert.match(clientMontageIssues(ordner)[0], /assets\/client\/ existiert, aber client\.js nennt keinen Teil/);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});
