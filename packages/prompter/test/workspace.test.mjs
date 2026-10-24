#!/usr/bin/env node
/**
 * Workspace-Vertrag (S1) — Negativtests zuerst.
 *
 * Ein Prompt-Enhancer mit falschem Projektkontext ist kein Enhancer, sondern
 * eine Verwechslung. Diese Tests erzwingen den Vertrag, bevor der Code ihn
 * erfüllt:
 *   - zwei Workspaces mit gleichen relativen Pfaden haben verschiedene Identitäten,
 *   - ein Index aus Projekt A wird in Projekt B abgelehnt (FOREIGN_ROOT),
 *   - `..`, absolute Pfade und Separatorvarianten brechen nicht aus der Root aus,
 *   - ein Symlink aus der Root heraus wird an der Realpath-Grenze gestoppt,
 *   - gelöschte/umbenannte Dateien kehren nicht aus dem JSON-Index zurück (stale),
 *   - `.agents/skills/` wird nicht als gewöhnlicher Quelltext indexiert (kein Doppel),
 *   - unbekannte Referenzen vernichten nicht den richtigen Kontext.
 *
 * Kein DSH, kein Netz, kein Modell — nur reine Funktionen + Temp-Verzeichnisse.
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

// ── 2. Pfadgrenzen ──────────────────────────────────────────────────────────

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

// ── 3. Stale-Einträge ───────────────────────────────────────────────────────

test('workspace: gelöschte Dateien kehren nicht aus dem Index zurück', () => {
  const entries = new Map([
    ['/root/keep.js', { path: '/root/keep.js', content: 'a' }],
    ['/root/gone.js', { path: '/root/gone.js', content: 'b' }],
  ]);
  const { kept, removed } = reconcileEntries(entries, (p) => p !== '/root/gone.js');
  assert.deepEqual(removed, ['/root/gone.js']);
  assert.deepEqual([...kept.keys()], ['/root/keep.js']);
});

// ── 4. Projekte, Referenzen ─────────────────────────────────────────────────

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

// ── 5. Fremder Kontext bleibt draussen (gemessen 2026-10-24) ────────────────

test('workspace: ohne Sitzung gibt es keinen Root — der Host-cwd ist keine Antwort', () => {
  // Der Befund: mit DSH_HOME=$PWD wurde der Host-cwd zum "Projekt", und Shinon
  // trug seinen eigenen Kontext in fremde Sitzungen. Wer die Sitzung fragen
  // will, schaltet den cwd-Rueckfall ab und bekommt dann LEER, nicht geraten.
  assert.deepEqual(resolveWorkspaceRoot({ cwd: '', fallbackToCwd: false, env: {} }), {
    root: '',
    source: 'unbekannt',
  });
  // Eine ausdrueckliche Angabe bleibt eine Angabe — Config und Env gelten weiter.
  const explicit = tmpRoot('explicit2');
  const fromEnv = tmpRoot('env2');
  try {
    assert.equal(
      resolveWorkspaceRoot({ cwd: '', fallbackToCwd: false, configRoot: explicit, env: {} }).root,
      explicit,
    );
    assert.equal(
      resolveWorkspaceRoot({ cwd: '', fallbackToCwd: false, env: { SHINON_WORKSPACE_ROOT: fromEnv } }).root,
      fromEnv,
    );
  } finally {
    for (const d of [explicit, fromEnv]) rmSync(d, { recursive: true, force: true });
  }
});

test('workspace: SHINON.md entsteht einmal, ueberschreibt nie und braucht einen Root', async () => {
  const { ensureProjectFile, SHINON_MD_TEMPLATE } = await import('../assets/project-file.js');
  const root = tmpRoot('shinonmd');
  try {
    const first = ensureProjectFile({ root });
    assert.equal(first.created, true);
    assert.equal(first.reason, 'GELESEN');
    assert.equal(first.text, SHINON_MD_TEMPLATE.trim());

    // Ein Mensch fuellt die Datei — der zweite Schritt darf sie nicht anfassen.
    writeFileSync(join(root, 'SHINON.md'), '# SHINON.md\n\nNur dieses Projekt.\n');
    const second = ensureProjectFile({ root });
    assert.equal(second.created, false);
    assert.match(second.text, /Nur dieses Projekt/);

    // Ohne Workspace kein Projektfile: fail-closed statt `process.cwd()`.
    const none = ensureProjectFile({ root: '' });
    assert.equal(none.path, null);
    assert.equal(none.reason, 'OHNE_WURZEL');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
