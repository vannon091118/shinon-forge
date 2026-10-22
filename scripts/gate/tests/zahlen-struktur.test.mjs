#!/usr/bin/env node
/**
 * scripts/gate/tests/zahlen-struktur.test.mjs — §1.2 wird gemessen, nicht gepflegt.
 *
 * Warum diese Datei existiert: die Struktur-Tabelle stand bis 2026-10-22 von Hand
 * in `docs/ZAHLEN.md` und war beim Nachmessen 61 Code-Dateien alt. Jetzt schreibt
 * `npm run zahlen:sync` sie zwischen zwei Markern; `npm run zahlen:check`
 * vergleicht. Der Test hält beide Zusagen fest:
 *
 *   1. Der echte Block ist aktuell (`sync --check` findet keine Abweichung), und
 *      die Zahl darin ist dieselbe, die `strukturZahlen()` misst.
 *   2. Eine geänderte Zahl im Block wird erkannt, ein fehlendes Markerpaar bricht
 *      ab — die Prüfung ist fail-closed, kein stiller Teil-Erfolg.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { strukturZahlen } from '../../lib/structure.mjs';
import { STRUKTUR_END, STRUKTUR_START, renderStrukturBlock, sync } from '../../sync-zahlen.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ZAHLEN = join(ROOT, 'docs', 'ZAHLEN.md');

/**
 * Ein Miniatur-Baum, den `sync` vollständig rendern kann: Manifest, leere
 * `packages/`, die Struktur-Registry und ein eigenes Git-Repo (`renderBlock`
 * liest `git ls-files`; ohne Repo würde der Test an der Umgebung scheitern,
 * nicht an der Regel).
 */
function fixture(text) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-zahlen-'));
  mkdirSync(join(root, 'docs', 'contracts'), { recursive: true });
  mkdirSync(join(root, 'docs', 'probes'), { recursive: true });
  mkdirSync(join(root, 'packages'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@shinon/fixture', version: '0.0.0' }), 'utf8');
  writeFileSync(join(root, 'docs', 'contracts', 'structure.json'), JSON.stringify({
    contract: 'shinon.structure/v1', rules: {}, klassen: [], bestand: {}, bestandAusnahmen: {},
  }), 'utf8');
  writeFileSync(join(root, 'docs', 'ZAHLEN.md'), text, 'utf8');
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('§1.2 ist gemessen: der Block stimmt mit dem Riegel überein', () => {
  const text = readFileSync(ZAHLEN, 'utf8');
  assert.ok(text.includes(STRUKTUR_START) && text.includes(STRUKTUR_END), 'Markerpaar fehlt');
  // NUR der Struktur-Block: der Bestands-Block führt auch `dist/`, und eine
  // frische CI-Checkout hat keinen Bau. Ein Test, der davon abhängt, wäre in CI
  // rot, ohne dass eine Zahl falsch ist.
  const start = text.indexOf(STRUKTUR_START);
  const end = text.indexOf(STRUKTUR_END);
  assert.equal(renderStrukturBlock(ROOT), text.slice(start, end + STRUKTUR_END.length), 'zahlen:check wäre rot');
  const zahlen = strukturZahlen(ROOT);
  const block = text.slice(text.indexOf(STRUKTUR_START), text.indexOf(STRUKTUR_END));
  assert.match(block, new RegExp(`\\| Code-Dateien [^|]+\\| ${zahlen.dateien} \\|`));
  assert.match(block, new RegExp(`\\| Klassen \\| ${zahlen.klassen} \\|`));
});

test('eine geänderte Zahl im Block wird erkannt', () => {
  const text = readFileSync(ZAHLEN, 'utf8');
  const start = text.indexOf(STRUKTUR_START);
  const end = text.indexOf(STRUKTUR_END);
  const mutated = `${text.slice(0, start)}${STRUKTUR_START}\n| Zahl | Wert | Befehl (Eigentümer) | Exit |\n|---|---|---|---|\n| Code-Dateien | 1 | von Hand | 0 |\n${STRUKTUR_END}${text.slice(end + STRUKTUR_END.length)}`;
  const root = fixture(mutated);
  try {
    assert.equal(sync({ root, check: true }).changed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ein fehlendes Markerpaar bricht ab, statt halb zu schreiben', () => {
  const root = fixture('# Zahlen\n\nkein Block\n');
  try {
    assert.throws(() => sync({ root, check: true }), /Marker/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
