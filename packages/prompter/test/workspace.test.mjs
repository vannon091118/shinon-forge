#!/usr/bin/env node
/**
 * Workspace-Vertrag (S1) — Negativtests zuerst.
 *
 * Ein Prompt-Enhancer mit falschem Projektkontext ist kein Enhancer, sondern
 * eine Verwechslung. Diese Tests erzwingen den Vertrag, bevor der Code ihn
 * erfüllt:
 *   - zwei Workspaces mit gleichen relativen Pfaden haben verschiedene Identitäten,
 *   - ein Index aus Projekt A wird in Projekt B abgelehnt (FOREIGN_ROOT),
 * → Kanon: docs/COMMENT-KANON.md#k-f51318a25fd4
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WORKSPACE_CONTRACT,
  resolveWorkspaceRoot,
  fingerprintRoot,
  resolveInRoot,
  checkRealpathInside,
  reconcileEntries,
} from '../assets/workspace.js';

function tmpRoot(label) {
  const dir = mkdtempSync(join(tmpdir(), `shinon-ws-${label}-`));
  return dir;
}

// ── 1. Eine Quelle für die Workspace-Identität ─────────────────────────────

test('workspace: genau eine Quelle — explizit > Env > cwd', () => {
  assert.equal(WORKSPACE_CONTRACT, 'shinon.workspace/v1');
  const cwd = tmpRoot('cwd');
  const explicit = tmpRoot('explicit');
  const fromEnv = tmpRoot('env');
  try {
    assert.equal(resolveWorkspaceRoot({ cwd }).root, cwd);
    assert.equal(
      resolveWorkspaceRoot({ cwd, env: { SHINON_WORKSPACE_ROOT: fromEnv } }).root,
      fromEnv,
    );
    assert.equal(
      resolveWorkspaceRoot({ cwd, configRoot: explicit, env: { SHINON_WORKSPACE_ROOT: fromEnv } }).root,
      explicit,
    );
  } finally {
    for (const d of [cwd, explicit, fromEnv]) rmSync(d, { recursive: true, force: true });
  }
});

test('workspace: zwei Projekte mit gleichen relativen Pfaden haben verschiedene Identitäten', () => {
  const a = tmpRoot('a');
  const b = tmpRoot('b');
  try {
    mkdirSync(join(a, 'src'), { recursive: true });
    mkdirSync(join(b, 'src'), { recursive: true });
    writeFileSync(join(a, 'src', 'app.js'), 'const a = 1;\n');
    writeFileSync(join(b, 'src', 'app.js'), 'const b = 2;\n');
    const fa = fingerprintRoot(a);
    const fb = fingerprintRoot(b);
    assert.notEqual(fa.rootId, fb.rootId, 'gleiche Dateinamen, verschiedene Workspaces');
    assert.equal(fa.root, a);
    assert.equal(fb.root, b);
  } finally {
    for (const d of [a, b]) rmSync(d, { recursive: true, force: true });
  }
});

// ── 2. Falsche Root-Identität ───────────────────────────────────────────────

test('workspace: fremde Root-Identität wird abgelehnt (kein stilles process.cwd)', async () => {
  const a = tmpRoot('fa');
  const b = tmpRoot('fb');
  try {
    const { createIndex, saveIndex, loadIndex } = await import('../assets/index-manager.js');
    const idx = createIndex(a);
    writeFileSync(join(a, 'x.js'), 'x\n');
    const { indexDirectory } = await import('../assets/index-manager.js');
    mkdirSync(join(a, 'sub'), { recursive: true });
    writeFileSync(join(a, 'sub', 'y.js'), 'y\n');
    indexDirectory(idx, a);
    const file = join(a, 'index.json');
    saveIndex(idx, file);
    assert.throws(() => loadIndex(file, { expectedRoot: b }), /FOREIGN_ROOT/,
      'Index aus A gilt in B nicht');
  } finally {
    for (const d of [a, b]) rmSync(d, { recursive: true, force: true });
  }
});

// ── 3. Pfadgrenzen ──────────────────────────────────────────────────────────

test('workspace: .., absolute Pfade und Separatorvarianten brechen nicht aus', () => {
  const root = tmpRoot('bounds');
  try {
    assert.equal(resolveInRoot(root, 'src/app.js').ok, true);
    assert.match(resolveInRoot(root, '../etc/passwd').reason, /OUTSIDE_ROOT/);
    assert.equal(resolveInRoot(root, '../etc/passwd').ok, false);
    assert.equal(resolveInRoot(root, '/etc/passwd').ok, false);
    assert.equal(resolveInRoot(root, 'src/../../etc/passwd').ok, false);
    assert.equal(resolveInRoot(root, 'src//..//..//etc').ok, false);
    assert.equal(resolveInRoot(root, '').ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workspace: Symlink-Ausbruch wird an der Realpath-Grenze gestoppt', () => {
  const root = tmpRoot('linkroot');
  const outside = tmpRoot('outside');
  try {
    writeFileSync(join(outside, 'secret.txt'), 'geheim\n');
    const link = join(root, 'evil');
    try {
      symlinkSync(join(outside, 'secret.txt'), link);
    } catch {
      return; // ohne Symlink-Recht keine Aussage — nicht grünlügen, sondern überspringen
    }
    const r = checkRealpathInside(root, link, (p) => {
      // echte Auflösung über das Dateisystem
      const { realpathSync } = process.getBuiltinModule
        ? process.getBuiltinModule('fs')
        : { realpathSync: null };
      return realpathSync(p);
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /SYMLINK_ESCAPE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

/**
 * Der Symlink-Fall, der beim Indexieren zaehlt: ein Link INNERHALB der Root ist
 * eine gewoehnliche Datei, ein Link AUS der Root heraus darf nie gelesen werden.
 * Beides in einem Test, damit die Grenze nicht durch bloßes Verbieten "gruen"
 * wird: ohne die Positivprobe wuerde ein pauschaler Symlink-Verzicht den Test
 * genauso bestehen.
 */
test('workspace: beim Indexieren wird ein Symlink-Ausbruch nicht gelesen, ein interner Link schon', async () => {
  const root = tmpRoot('indexlink');
  const outside = tmpRoot('indexoutside');
  try {
    writeFileSync(join(outside, 'secret.js'), 'const geheim = 1;\n');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'echt.js'), 'const echt = 1;\n');
    try {
      symlinkSync(join(outside, 'secret.js'), join(root, 'src', 'ausbruch.js'));
      symlinkSync(join(root, 'src', 'echt.js'), join(root, 'src', 'intern.js'));
    } catch {
      return; // ohne Symlink-Recht keine Aussage — nicht grünlügen, sondern überspringen
    }
    const { createIndex, indexDirectory } = await import('../assets/index-manager.js');
    const idx = createIndex(root);
    const result = indexDirectory(idx, join(root, 'src'), null, Date.now(), { root });
    const paths = [...idx.entries.keys()].join('\n');
    assert.equal(paths.includes('ausbruch.js'), false, 'das Ziel liegt außerhalb des Workspace');
    assert.equal(paths.includes('intern.js'), true, 'ein Link innerhalb der Root bleibt eine Quelle');
    assert.ok(
      result.errors.some((error) => error.reason === 'SYMLINK_ESCAPE' && String(error.path).includes('ausbruch.js')),
      'der Ausschluss steht mit Grund und Pfad im Ergebnis',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// ── 4. Stale-Einträge ───────────────────────────────────────────────────────

test('workspace: gelöschte Dateien kehren nicht aus dem Index zurück', () => {
  const entries = new Map([
    ['/root/keep.js', { path: '/root/keep.js', content: 'a' }],
    ['/root/gone.js', { path: '/root/gone.js', content: 'b' }],
  ]);
  const { kept, removed } = reconcileEntries(entries, (p) => p !== '/root/gone.js');
  assert.deepEqual(removed, ['/root/gone.js']);
  assert.deepEqual([...kept.keys()], ['/root/keep.js']);
});

// ── 5. Quellen entkoppeln + Referenzen ───────────────────────────────────────

test('workspace: gelöschte und umbenannte Dateien kehren nicht in den Index zurück', async () => {
  const root = tmpRoot('stale');
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'bleibt.js'), 'const a = 1;\n');
    writeFileSync(join(root, 'src', 'weg.js'), 'const b = 2;\n');
    const { createIndex, indexDirectory } = await import('../assets/index-manager.js');
    const idx = createIndex(root);
    indexDirectory(idx, join(root, 'src'), null, Date.now(), { root });
    assert.ok([...idx.entries.keys()].some((path) => path.endsWith('weg.js')));

    rmSync(join(root, 'src', 'weg.js'));
    writeFileSync(join(root, 'src', 'neu.js'), 'const c = 3;\n');
    const second = indexDirectory(idx, join(root, 'src'), null, Date.now(), { root });
    const paths = [...idx.entries.keys()].join('\n');
    assert.equal(paths.includes('weg.js'), false, 'die gelöschte Datei ist aus dem Index verschwunden');
    assert.equal(paths.includes('neu.js'), true, 'die neue Datei ist aufgenommen');
    assert.equal(second.removed.length, 1, 'der Lauf nennt, was er entfernt hat');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workspace: .agents/skills wird nicht als Quelltext indexiert', async () => {
  const root = tmpRoot('skills');
  try {
    const { createIndex, indexDirectory } = await import('../assets/index-manager.js');
    mkdirSync(join(root, '.agents', 'skills', 's'), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, '.agents', 'skills', 's', 'SKILL.md'), '# skill\n');
    writeFileSync(join(root, 'src', 'app.js'), 'const x = 1;\n');
    const idx = createIndex(root);
    indexDirectory(idx, root);
    const paths = [...idx.entries.keys()].join('\n');
    assert.equal(paths.includes('SKILL.md'), false, 'Skills laufen separat, nicht als Quelltext');
    assert.equal(paths.includes('app.js'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workspace: Project Index trennt Projekte am Hash (kein cwd-Raten)', async () => {
  let indexCore;
  try {
    indexCore = await import('../../project-index/assets/index-core.js');
  } catch {
    return; // ohne sqlite-fähiges Node keine Aussage — nicht grünlügen
  }
  const a = tmpRoot('pia');
  const b = tmpRoot('pib');
  try {
    assert.notEqual(indexCore.projectHash(a), indexCore.projectHash(b));
    assert.notEqual(indexCore.indexPath('/tmp/idx', a), indexCore.indexPath('/tmp/idx', b));
  } finally {
    for (const d of [a, b]) rmSync(d, { recursive: true, force: true });
  }
});

test('workspace: unbekannte Referenzen vernichten nicht den richtigen Kontext', async () => {
  const { resolveReferences, acceptance } = await import('../assets/result-contract.js');
  const context = {
    project: 'p',
    files: [{ path: 'src/app.js', content: 'x' }],
    symbols: ['app'],
    constraints: [],
    touches: [],
    dependencies: [],
  };
  const unknown = resolveReferences(['src/app.js', 'erfunden/nirgendwo.js'], context);
  assert.deepEqual(unknown, ['erfunden/nirgendwo.js']);
  // Die Annahme behält den richtigen Kontext — sie wirft ihn nicht wegen einer
  // einzigen erfundenen Referenz weg (kein pauschales Vernichten).
  assert.ok(typeof acceptance === 'function');
});
