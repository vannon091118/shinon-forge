#!/usr/bin/env node
/**
 * Runtime-Index des Prompter — ohne DSH, ohne Netz, ohne Modell.
 *
 * Belegt wird, was der Index-ZUSTAND garantiert:
 *   - Erstellen, Speichern, Laden mit Vertrag.
 *   - Hash-basierte Deduplikation: gleicher Inhalt = gleicher Hash = kein Double.
 *   - Token-Präfix-Matching: "test" trifft auf "tests", "testen", ...
 *   - Nur Treffer werden geliefert (score > 0).
 *   - Intent-Matching: Trigger → Expansion, fallthrough null.
 *
 * Läuft mit `node --test` — kein DSH, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createIndex,
  indexFile,
  removeFile,
  isIndexed,
  getContext,
  saveIndex,
  loadIndex,
  indexDirectory,
  matchIntent,
  simpleHash,
  tokenize,
  RUNTIME_INDEX_CONTRACT,
} from '../assets/index-manager.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const RULES = JSON.parse(readFileSync(join(DIR, '../assets/intent-rules.json'), 'utf8'));

// ── helpers ──────────────────────────────────────────────────────────────────

function tmpPath(name) {
  return join(DIR, `__tmp_${name}_${Date.now()}.json`);
}

test.afterEach(() => {
  // Cleanup temp files from this run
  const dir = DIR;
  try {
    const files = require('fs').readdirSync(dir);
    for (const f of files) {
      if (f.startsWith('__tmp_') && f.endsWith('.json')) {
        require('fs').unlinkSync(join(dir, f));
      }
    }
  } catch { /* ignore */ }
});

// ── 1. Index erstellen ───────────────────────────────────────────────────────

test('createIndex: neuer Index hat leere entries und den richtigen Vertrag', () => {
  const idx = createIndex();
  assert.equal(idx.contract, RUNTIME_INDEX_CONTRACT);
  assert.equal(idx.version, 1);
  assert.ok(idx.entries instanceof Map);
  assert.equal(idx.entries.size, 0);
  assert.ok(typeof idx.indexedAt === 'number');
  assert.equal(idx.modifiedAt, null);
});

// ── 2. Hash & Tokenisierung ──────────────────────────────────────────────────

test('simpleHash: gleicher Input liefert gleichen Hash', () => {
  assert.equal(simpleHash('hello'), simpleHash('hello'));
});

test('simpleHash: unterschiedlicher Input liefert unterschiedlichen Hash', () => {
  assert.notEqual(simpleHash('hello'), simpleHash('world'));
});

test('tokenize: filtert kurze Tokens nach minLength', () => {
  assert.deepEqual(tokenize('a ab abc abcd', 3), ['abc', 'abcd']);
  assert.deepEqual(tokenize('Hello world TEST foo', 2), ['hello', 'world', 'test', 'foo']);
});

// ── 3. Dateien indexieren ────────────────────────────────────────────────────

test('indexFile: eine Datei wird aufgenommen', () => {
  const idx = createIndex();
  const result = indexFile(idx, 'test.js', 'export const x = 1;');
  assert.ok(result);
  assert.equal(result.path, 'test.js');
  assert.ok(typeof result.hash === 'string');
  assert.ok(Array.isArray(result.tokens));
  assert.equal(idx.entries.size, 1);
});

test('indexFile: gleicher Inhalt wird dedupliziert', () => {
  const idx = createIndex();
  indexFile(idx, 'a.js', 'hello world');
  const r2 = indexFile(idx, 'b.js', 'hello world');
  // Different path, same content → still indexed (different entry)
  assert.equal(idx.entries.size, 2);
  // Same path, same content → no change
  const r3 = indexFile(idx, 'a.js', 'hello world');
  assert.equal(r3, null);
  assert.equal(idx.entries.size, 2);
});

test('indexFile: geänderter Inhalt erzeugt neuen Hash', () => {
  const idx = createIndex();
  indexFile(idx, 'a.js', 'old content');
  indexFile(idx, 'a.js', 'new content');
  const entry = idx.entries.get('a.js');
  assert.equal(entry.content, 'new content');
});

test('indexFile: ungültige Pfade werden ignoriert', () => {
  const idx = createIndex();
  assert.equal(indexFile(idx, '', 'content'), null);
  assert.equal(indexFile(idx, null, 'content'), null);
  assert.equal(indexFile(idx, 'a.js', null), null);
});

// ── 4. Entfernen ─────────────────────────────────────────────────────────────

test('removeFile: existierende Datei wird entfernt', () => {
  const idx = createIndex();
  indexFile(idx, 'a.js', 'hello');
  assert.equal(removeFile(idx, 'a.js'), true);
  assert.equal(idx.entries.size, 0);
});

test('removeFile: nicht-existierende Datei gibt false', () => {
  const idx = createIndex();
  assert.equal(removeFile(idx, 'nonexistent.js'), false);
});

// ── 5. Kontextabfrage ────────────────────────────────────────────────────────

test('getContext: Präfix-Matching (test trifft tests)', () => {
  const idx = createIndex();
  indexFile(idx, 'test.js', 'export const tests = [];');
  const ctx = getContext(idx, 'schreib tests');
  assert.equal(ctx.count, 1);
  assert.equal(ctx.files[0].path, 'test.js');
});

test('getContext: score > 0 Filter — keine Treffer = keine Dateien', () => {
  const idx = createIndex();
  indexFile(idx, 'unrelated.js', 'xyz abc def ghi');
  const ctx = getContext(idx, 'mach doku');
  assert.equal(ctx.count, 0);
});

test('getContext: mehrere Treffer werden sortiert', () => {
  const idx = createIndex();
  indexFile(idx, 'a.js', 'test hello world');
  indexFile(idx, 'b.js', 'tests testing test');
  const ctx = getContext(idx, 'tests');
  // b.js hat mehr Treffer (tests, testing, test) als a.js (test)
  assert.equal(ctx.files[0].path, 'b.js');
});

test('getContext: maxFiles begrenzt', () => {
  const idx = createIndex();
  for (let i = 0; i < 5; i++) {
    indexFile(idx, `file${i}.js`, `test content ${i}`);
  }
  const ctx = getContext(idx, 'test', { maxFiles: 2 });
  assert.equal(ctx.count, 2);
});

test('getContext: symbols extrahiert Tokens aus den Dateiinhalten', () => {
  const idx = createIndex();
  indexFile(idx, 'a.js', 'export const hello = "world";');
  const ctx = getContext(idx, 'hello');
  assert.ok(ctx.symbols.includes('hello'));
});

// ── 6. Persistenz ────────────────────────────────────────────────────────────

test('saveIndex/loadIndex: roundtrip mit Vertrag', () => {
  const path = tmpPath('roundtrip');
  const idx = createIndex();
  indexFile(idx, 'a.js', 'hello world');
  saveIndex(idx, path);
  const loaded = loadIndex(path);
  assert.equal(loaded.contract, RUNTIME_INDEX_CONTRACT);
  assert.equal(loaded.entries.size, 1);
  assert.equal([...loaded.entries.values()][0].path, 'a.js');
  rmSync(path);
});

test('loadIndex: fehlende Datei gibt null', () => {
  assert.equal(loadIndex('/nonexistent/path.json'), null);
});

test('loadIndex: falscher Vertrag wirft', () => {
  const path = tmpPath('bad-contract');
  writeFileSync(path, JSON.stringify({ contract: 'wrong', entries: [] }));
  assert.throws(() => loadIndex(path));
  rmSync(path);
});

test('loadIndex: ungültiges JSON wirft', () => {
  const path = tmpPath('bad-json');
  writeFileSync(path, 'not json');
  assert.throws(() => loadIndex(path));
  rmSync(path);
});

// ── 7. Intent-Matching ───────────────────────────────────────────────────────

test('matchIntent: Trigger "doku" trifft documentation', () => {
  const m = matchIntent('mach doku', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'documentation');
  assert.equal(m.classification, 'MULTI_STEP_TASK');
  assert.ok(m.expansion.length > 0);
});

test('matchIntent: Trigger "test" trifft tests', () => {
  const m = matchIntent('schreib tests fuer scoring', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'tests');
});

test('matchIntent: Trigger "refaktor" trifft refactor', () => {
  const m = matchIntent('refaktor das ganze', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'refactor');
  assert.equal(m.classification, 'TRANSFORM');
});

test('matchIntent: Trigger "bugfix" trifft bugfix', () => {
  const m = matchIntent('fix den bug in scoring', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'bugfix');
});

test('matchIntent: Trigger "docs update" trifft update-docs', () => {
  const m = matchIntent('docs update bitte', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'update-docs');
});

test('matchIntent: Trigger "erklär" trifft read-code', () => {
  const m = matchIntent('erklär mir den code', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'read-code');
  assert.equal(m.classification, 'LOOKUP');
});

test('matchIntent: kein Treffer gibt null', () => {
  assert.equal(matchIntent('hallo wie gehts', RULES), null);
  assert.equal(matchIntent('', RULES), null);
  assert.equal(matchIntent('xyz', RULES), null);
});

test('matchIntent: rules=null gibt null', () => {
  assert.equal(matchIntent('mach doku', null), null);
  assert.equal(matchIntent('mach doku', {}), null);
});

test('matchIntent: case-insensitive', () => {
  const m = matchIntent('MACH DOKU', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'documentation');
});

test('matchIntent: expansion ist der Full-Task-Text', () => {
  const m = matchIntent('mach doku', RULES);
  assert.ok(m.expansion.includes('Dokumentation'));
  assert.ok(m.expansion.includes('Entwickler'));
});
