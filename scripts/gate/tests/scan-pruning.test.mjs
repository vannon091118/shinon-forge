/**
 * scan-pruning.test.mjs — kein Baumlauf betritt Fremdcode, Cache oder Symlink-Ziele.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17): drei Verzeichnislisten liefen
 * auseinander (`repo.mjs`, der Index-Kern, das TypeScript-Gate), keine davon
 * prüfte Symlinks. Auf schwacher Hardware kostet ein Lauf durch `node_modules`
 * Minuten, und ein Symlink-Ziel verlässt den Baum — eine Suche, die ihm folgt,
 * liest fremde Dateien, und ein Schreibzugriff darüber landet außerhalb.
 * → Kanon: docs/COMMENT-KANON.md#k-07e3c3d9aab3
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { PRUNE_DIRS, entriesOf, isPruned, listFiles, walkDir } from '../../lib/scan.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'shinon-prune-'));
  mkdirSync(join(root, 'src', 'tief'), { recursive: true });
  writeFileSync(join(root, 'src', 'echt.mjs'), 'export const echt = 1;\n');
  writeFileSync(join(root, 'src', 'tief', 'noch-echter.mjs'), 'export const zwei = 2;\n');
  // Fremdcode und Ableitungen: dürfen nie betreten werden.
  for (const dir of ['node_modules', '.git', 'dist', '.cache', 'coverage', 'storages', 'sessions', 'logs', 'vendor', '.agents/skills/s']) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, 'fremd.js'), 'export const fremd = 1;\n');
  }
  return root;
}

test('prune: die gemeinsame Liste steht einmal, der Index-Kern hält dieselbe Menge', async () => {
  const core = await import('../../../packages/project-index/assets/index-core.js');
  const coreSet = [...core.SKIP_DIRS].sort();
  assert.deepEqual(coreSet, [...PRUNE_DIRS].sort(), 'scan.mjs und der Worker-Kern dürfen nicht auseinanderlaufen');
  // Und die Zusage, auf der der Kern selbst steht: Fremdcode und Historie nie.
  assert.equal(core.SKIP_DIRS.has('node_modules'), true);
  assert.equal(core.SKIP_DIRS.has('.git'), true);
  assert.equal(core.SKIP_DIRS.has('vendor'), true, 'der vendored DSH-Baum ist Fremdcode');
  assert.equal(core.SKIP_DIRS.has('.agents'), true, 'Skills sind eine eigene Quelle, kein Projektquelltext (S1)');
});

test('prune: walkDir betritt Fremd- und Cacheordner nicht', () => {
  const root = fixture();
  try {
    const { files, dirs } = walkDir(root);
    const rel = files.map((file) => relative(root, file));
    assert.deepEqual(rel, ['src/echt.mjs', 'src/tief/noch-echter.mjs'], 'nur der eigene Code wird gefunden');
    assert.equal(dirs, 3, 'betreten werden root, src und src/tief — sonst nichts');
    for (const dir of ['node_modules', '.git', 'dist', '.cache', 'coverage', 'storages', 'sessions', 'logs', 'vendor', '.agents']) {
      assert.equal(rel.some((path) => path.startsWith(`${dir}/`)), false, `${dir} wurde betreten`);
      assert.equal(isPruned(dir), true, `${dir} muss gepruned sein`);
    }
    // Ein Verzeichnisname, der NICHT gepruned ist, wird betreten (Gegenprobe:
    // die Regel darf nicht einfach alles wegwerfen).
    mkdirSync(join(root, 'lib'), { recursive: true });
    writeFileSync(join(root, 'lib', 'auch.mjs'), 'export const a = 1;\n');
    assert.equal(listFiles(root).map((file) => relative(root, file)).includes('lib/auch.mjs'), true);
    assert.equal(isPruned('lib'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prune: Symlinks werden nie verfolgt — weder Ordner noch Datei', () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'shinon-draussen-'));
  try {
    writeFileSync(join(outside, 'geheim.js'), 'export const draussen = 1;\n');
    mkdirSync(join(outside, 'unterordner'), { recursive: true });
    writeFileSync(join(outside, 'unterordner', 'auch-geheim.js'), 'export const g = 1;\n');

    symlinkSync(outside, join(root, 'verknuepft'), 'dir');
    symlinkSync(join(outside, 'geheim.js'), join(root, 'src', 'verknuepfte-datei.mjs'), 'file');

    const { files } = walkDir(root);
    const rel = files.map((file) => relative(root, file));
    assert.deepEqual(rel, ['src/echt.mjs', 'src/tief/noch-echter.mjs'], 'kein Pfad über einen Symlink');
    assert.equal(rel.some((path) => path.includes('verknuepft')), false, 'auch das Fundstück selbst fehlt');
    assert.equal(rel.some((path) => path.includes('geheim')), false, 'nichts von draußen');

    // Gegenprobe auf der Ebene darunter: `entriesOf` filtert Symlinks weg.
    const entries = entriesOf(root).map((entry) => entry.name);
    assert.equal(entries.includes('verknuepft'), false);
    assert.equal(entriesOf(join(root, 'src')).map((entry) => entry.name).includes('verknuepfte-datei.mjs'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('prune: die Kosten wachsen nicht mit der Zahl der Fremddateien', () => {
  const root = fixture();
  try {
    const before = walkDir(root);
    // 400 Fremddateien in fünf Ordnern, die gepruned sind.
    for (const dir of ['node_modules', 'dist', 'coverage']) {
      for (let i = 0; i < 80; i += 1) {
        mkdirSync(join(root, dir, `paket-${i}`), { recursive: true });
        writeFileSync(join(root, dir, `paket-${i}`, 'index.js'), 'export const x = 1;\n');
      }
    }
    const after = walkDir(root);
    assert.equal(after.files.length, before.files.length, 'kein Fundstück mehr');
    assert.equal(after.files.length, 2, 'die zwei eigenen Dateien bleiben die zwei eigenen Dateien');
    // Und der Zähler der BETRETENEN Ordner bleibt gleich: die Rekursion endet
    // vor den gepruned Ordnern, nicht in ihnen.
    assert.equal(after.dirs, before.dirs, 'Fremdordner kosten keinen Besuch');
    // 80 Paketordner + die eine Datei aus `fixture()`: der Ordner ist voll —
    // er wird nur nicht betreten.
    assert.equal(entriesOf(join(root, 'node_modules')).length, 81, 'der Ordner ist voll — er wird nur nicht betreten');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prune: das TypeScript-Gate nimmt dieselbe Regel', async () => {
  const root = fixture();
  try {
    mkdirSync(join(root, 'src', 'ts'), { recursive: true });
    writeFileSync(join(root, 'src', 'ts', 'echt.ts'), 'export const a: number = 1;\n');
    writeFileSync(join(root, 'node_modules', 'fremd.ts'), 'export const f: number = 1;\n');
    writeFileSync(join(root, 'dist', 'gebaut.ts'), 'export const g: number = 1;\n');
    const found = discover(join(root, 'src', 'ts'), 'echt.ts');
    assert.deepEqual(found, ['echt.ts'], 'im eigenen Ordner wird gefunden');
    const all = await walkTypeScript(root);
    assert.deepEqual(all, ['src/ts/echt.ts'], 'node_modules und dist werden gepruned');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Kleine Helfer, damit der letzte Test nur die Zusage ausdrückt. */
function discover(dir, name) {
  return entriesOf(dir).filter((entry) => entry.name === name).map((entry) => entry.name);
}

async function walkTypeScript(root) {
  const gate = await import('../plugins/typescript.mjs');
  return gate.discoverTypeScriptFiles(root);
}
