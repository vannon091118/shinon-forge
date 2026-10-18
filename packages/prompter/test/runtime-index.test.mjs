#!/usr/bin/env node
/**
 * Runtime-Index des Prompter — ohne DSH, ohne Netz, ohne Modell.
 *
 * Belegt wird, was der Index-ZUSTAND garantiert:
 *   - Erstellen, Speichern, Laden mit Vertrag.
 *   - Hash-basierte Deduplikation: gleicher Inhalt = gleicher Hash = kein Double.
 *   - Token-Präfix-Matching: "test" trifft auf "tests", "testen", ...
 *   - Nur Treffer werden geliefert (score > 0).
 * → Kanon: docs/COMMENT-KANON.md#k-7c72da4327b9
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
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
  MAX_FILE_CHARS,
  MAX_INDEX_CHARS,
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

// ── 5b. Budget und Rang — Regression der NO_JSON-Ursache vom 2026-10-16 ─────

/** Zeichensumme der gelieferten Inhalte — die Größe, die der Aufruf bezahlt. */
const charsOf = (ctx) => ctx.files.reduce((sum, file) => sum + file.content.length, 0);

/**
 * LIVE GEMESSEN: ohne Budget baute der Prompter für einen 132-Zeichen-Prompt
 * eine Nutzer-Nachricht von 1 457 948 Zeichen (20 Dateien, package-lock.json
 * allein 521 512). Der One-Shot lief damit in sein 15-s-Zeitlimit, die Antwort
 * kam leer zurück und jedes Verwerfen hiess `NO_JSON`. Diese Attrappe stellt
 * genau diese Lage her: 20 große Dateien, alle mit Treffern.
 */
test('getContext: das Budget hält auch bei 20 grossen Treffern', () => {
  const idx = createIndex();
  const block = 'test content '.repeat(8000); // ~104 000 Zeichen je Datei
  for (let i = 0; i < 20; i += 1) indexFile(idx, `gross${i}.js`, `${block}${i}\n`);

  const ctx = getContext(idx, 'test', { maxFiles: 20, budgetTokens: 6000 });
  assert.equal(ctx.count, 20, 'alle Treffer bleiben im Kontext — geschnitten, nicht ausgelassen');
  assert.ok(charsOf(ctx) <= 6000 * 4, `Budget 6000 Token = 24000 Zeichen, geliefert ${charsOf(ctx)}`);
  assert.ok(charsOf(ctx) > 20 * 100, 'und der Kontext ist trotzdem Inhalt, nicht ein Rest von zwanzig Zeichen');
});

/**
 * Monotonie: mehr Budget heisst mehr Kontext, nie anderen. Sonst wäre die
 * Grenze keine Grenze, sondern eine andere Auswahl.
 */
test('getContext: ein groesseres Budget liefert eine Obermenge der Dateien', () => {
  const idx = createIndex();
  for (let i = 0; i < 8; i += 1) indexFile(idx, `datei${i}.js`, `test ${'x'.repeat(4000)} ende${i}\n`);

  const small = getContext(idx, 'test', { maxFiles: 8, budgetTokens: 200 });
  const large = getContext(idx, 'test', { maxFiles: 8, budgetTokens: 4000 });
  const pathsSmall = small.files.map((f) => f.path);
  const pathsLarge = large.files.map((f) => f.path);
  assert.ok(pathsSmall.length > 0 && pathsLarge.length > 0, 'beide Budgets liefern Kontext');
  assert.deepEqual(pathsSmall.filter((p) => !pathsLarge.includes(p)), [], 'das kleine Budget wählt keine Datei, die das grosse nicht hat');
  assert.ok(charsOf(large) > charsOf(small), 'mehr Budget heisst mehr Inhalt');
});

/**
 * Der gemessene Fehlgriff: package-lock.json stand auf Rang 1 für einen Prompt
 * über den Prompter — nicht wegen Bezug, sondern weil zehntausende seiner
 * Tokens auf zweibuchstabige Prompt-Wörter passten.
 */
test('getContext: eine genannte Datei schlaegt eine riesige Rauschdatei', () => {
  const idx = createIndex();
  indexFile(idx, 'packages/prompter/index.js', 'export function verwirftAntwort() { /* NO_JSON Ursache betroffene Zeile */ }\n');
  const rausch = Array.from({ length: 40000 }, (_, i) => `"paket${i}": "json der die und mit js one"`).join('\n');
  indexFile(idx, 'package-lock.json', rausch);

  const ctx = getContext(idx, 'Bitte pruefe packages/prompter/index.js: der One-Shot verwirft jede Antwort mit NO_JSON. Nenne die Ursache und die betroffene Zeile.', { maxFiles: 20, budgetTokens: 6000 });
  assert.equal(ctx.files[0].path, 'packages/prompter/index.js', `Rang 1 ist ${ctx.files[0].path}`);
  assert.ok(ctx.files[0].content.includes('verwirftAntwort'), 'und die genannte Datei kommt vollstaendig an');
});

/**
 * Hart heisst abschneiden, nicht ueberschreiten — und an einer Zeilengrenze:
 * ein Kontext, der mitten in einem Ausdruck endet, ist ein halber Ausdruck.
 * Derselbe Vertrag wie im Project Index.
 */
test('getContext: geschnitten wird an der Zeilengrenze und als Praefix', () => {
  const idx = createIndex();
  const lines = Array.from({ length: 400 }, (_, i) => `const zeile${i} = test;`).join('\n') + '\n';
  indexFile(idx, 'a.js', lines);

  const ctx = getContext(idx, 'test', { maxFiles: 1, budgetTokens: 200 });
  assert.equal(ctx.count, 1);
  const content = ctx.files[0].content;
  assert.ok(content.length < lines.length, 'die Datei ist geschnitten');
  assert.equal(content.endsWith('\n'), true, 'an der Zeilengrenze, nicht mitten in der Zeile');
  assert.equal(lines.startsWith(content), true, 'und der Rest ist ein Praefix der indizierten Datei');
  assert.ok(content.length > 0, 'ein Schnitt von null Zeichen waere kein Kontext');
});

/** Eine unbrauchbare Grenze ist eine Grenze: null heisst null, NaN heisst Default. */
test('getContext: null Token liefert leeren Kontext, NaN den Default', () => {
  const idx = createIndex();
  indexFile(idx, 'a.js', 'export const test = 1;\n');
  assert.equal(getContext(idx, 'test', { budgetTokens: 0 }).count, 0);
  assert.equal(getContext(idx, 'test', { budgetTokens: -5 }).count, 0, 'eine negative Grenze oeffnet nichts');
  assert.ok(getContext(idx, 'test', { budgetTokens: Number.NaN }).count > 0, 'NaN faellt auf den Default');
  assert.ok(getContext(idx, 'test').count > 0, 'ohne Angabe gilt der Default aus §14');
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

test('matchIntent: Handlungsphrase trifft — "schreib tests fuer scoring" ist ein Auftrag', () => {
  const m = matchIntent('schreib tests fuer scoring', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'tests');
  assert.equal(m.classification, 'MULTI_STEP_TASK');
  assert.ok(m.expansion.includes('Tests') || m.expansion.includes('Test'));
});

test('matchIntent: Themenwort allein trifft nicht — über Doku reden ist kein Doku-Auftrag', () => {
  assert.equal(matchIntent('mach doku', RULES), null);
  assert.equal(matchIntent('Werte die Logs aus inkl. Doku und Rework', RULES), null);
  assert.equal(matchIntent('der Test ist rot', RULES), null);
});

test('matchIntent: eine Frage wird klassifiziert, aber NIE erweitert', () => {
  const m = matchIntent('Ist "fix den bug" der richtige Trigger?', RULES);
  assert.ok(m, 'die Handlungsphrase ist erkennbar');
  assert.equal(m.patternId, 'bugfix');
  assert.equal(m.classification, 'LOOKUP', 'eine Frage ist ein Lookup, keine Task-Klassifikation');
  assert.equal(m.expansion, '', 'eine Frage bekommt keinen # Aufgabe-Block');
});

test('matchIntent: Frage ohne Handlungsphrase gibt null — "warum ist der test broken?"', () => {
  assert.equal(matchIntent('warum ist der test broken?', RULES), null);
  assert.equal(matchIntent('Was macht der Prompter mit langen Prompts?', RULES)?.expansion ?? '', '');
});

test('matchIntent: ganze Phrase, kein Substring — "Testament" ist kein Test', () => {
  assert.equal(matchIntent('Testament schreiben', RULES), null);
  assert.equal(matchIntent('docker compose starten', RULES), null);
});

test('matchIntent: Lookup wird klassifiziert, hat aber keine Expansion', () => {
  const m = matchIntent('erklär mir den code', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'read-code');
  assert.equal(m.classification, 'LOOKUP');
  assert.equal(m.expansion, '');
});

test('matchIntent: Smalltalk ist CHAT — eine Klasse, aber keine Aufgabe', () => {
  const m = matchIntent('hallo wie gehts', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'chat');
  assert.equal(m.classification, 'CHAT');
  assert.equal(m.expansion, '', 'Smalltalk wird nie erweitert');
});

test('matchIntent: kein Treffer gibt null', () => {
  assert.equal(matchIntent('', RULES), null);
  assert.equal(matchIntent('xyz', RULES), null);
});

test('matchIntent: rules=null gibt null', () => {
  assert.equal(matchIntent('schreib tests', null), null);
  assert.equal(matchIntent('schreib tests', {}), null);
});

test('matchIntent: case-insensitive', () => {
  const m = matchIntent('SCHREIB TESTS', RULES);
  assert.ok(m);
  assert.equal(m.patternId, 'tests');
});

test('matchIntent: kein Trigger ist ein nacktes Themenwort', () => {
  const bare = ['doku', 'doc', 'readme', 'test', 'tests', 'fehler', 'broken'];
  for (const pattern of RULES.patterns) {
    for (const trigger of pattern.trigger) {
      assert.ok(!bare.includes(trigger.toLocaleLowerCase()), `${pattern.id}: "${trigger}" ist ein Themenwort, keine Handlungsphrase`);
    }
  }
});

// ── 8. Größenbudget ──────────────────────────────────────────────────────────

/** Fixture-Verzeichnis mit benannten Dateien — wird vom Aufrufer aufgeräumt. */
function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-index-budget-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

test('indexDirectory: die Dateigrenze ist der Zwillingswert des Project Index', () => {
  assert.equal(MAX_FILE_CHARS, 262144, 'beide Indexe behandeln dieselbe Datei gleich');
  assert.ok(Number.isInteger(MAX_INDEX_CHARS) && MAX_INDEX_CHARS > 0, 'das Gesamtbudget ist eine Zahl, kein Wunsch');
});

test('indexDirectory: Datei über der Grenze wird mit ZU_GROSS ausgeschlossen', () => {
  const dir = fixtureDir({ 'klein.js': 'const a = 1;\n', 'gross.js': `// ${'x'.repeat(200)}\n` });
  try {
    const index = createIndex();
    const result = indexDirectory(index, dir, ['.js'], 1, { maxFileChars: 100 });
    assert.equal(result.indexed, 1);
    assert.equal(result.excluded.length, 1);
    assert.equal(result.excluded[0].reason, 'ZU_GROSS');
    assert.ok(result.excluded[0].path.endsWith('gross.js'));
    assert.ok(result.excluded[0].detail.includes('>100'), 'der Grund nennt die gemessene Zahl');
    assert.equal(index.entries.size, 1, 'die grosse Datei steht nicht im Index');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('indexDirectory: genau an der Grenze wird noch aufgenommen', () => {
  const dir = fixtureDir({ 'rand.js': 'x'.repeat(100) });
  try {
    const result = indexDirectory(createIndex(), dir, ['.js'], 1, { maxFileChars: 100 });
    assert.equal(result.indexed, 1);
    assert.deepEqual(result.excluded, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('indexDirectory: BUDGET_ERSCHOEPFT ist deterministisch und benannt', () => {
  const files = { 'a.js': 'a'.repeat(40), 'b.js': 'b'.repeat(40), 'c.js': 'c'.repeat(40) };
  const once = () => {
    const dir = fixtureDir(files);
    try {
      return indexDirectory(createIndex(), dir, ['.js'], 1, { maxIndexChars: 100 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const first = once();
  const second = once();
  assert.equal(first.indexed, 2, 'zwei Dateien passen in 100 Zeichen');
  assert.equal(first.excluded.length, 1);
  assert.equal(first.excluded[0].reason, 'BUDGET_ERSCHOEPFT');
  assert.ok(first.excluded[0].path.endsWith('c.js'), 'der Schnitt faellt sortiert auf die letzte Datei');
  const names = (result) => result.excluded.map((item) => item.path.split('/').pop());
  assert.deepEqual(names(second), names(first), 'derselbe Baum, derselbe Schnitt — keine Filesystem-Wuerfel');
  assert.deepEqual(names(first), ['c.js']);
});

test('indexDirectory: ein zweiter Lauf zaehlt unveraenderte Dateien nicht doppelt', () => {
  const dir = fixtureDir({ 'a.js': 'a'.repeat(40), 'b.js': 'b'.repeat(40) });
  try {
    const index = createIndex();
    const first = indexDirectory(index, dir, ['.js'], 1, { maxIndexChars: 100 });
    assert.equal(first.indexed, 2);
    const second = indexDirectory(index, dir, ['.js'], 2, { maxIndexChars: 100 });
    assert.equal(second.indexed, 0, 'nichts Neues, nichts gezaehlt');
    assert.deepEqual(second.excluded, [], 'bekannte Dateien fallen nicht ploetzlich aus dem Budget');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('indexDirectory: ausgeschlossene Dateien stehen mit Grund im Ergebnis', () => {
  const dir = fixtureDir({ 'gross.js': 'x'.repeat(200) });
  try {
    const result = indexDirectory(createIndex(), dir, ['.js'], 1, { maxFileChars: 100 });
    for (const item of result.excluded) {
      assert.ok(['ZU_GROSS', 'BUDGET_ERSCHOEPFT'].includes(item.reason), `unbekannter Grund: ${item.reason}`);
      assert.ok(typeof item.path === 'string' && item.path !== '', 'jeder Ausschluss nennt die Datei');
      assert.ok(typeof item.detail === 'string' && item.detail !== '', 'jeder Ausschluss nennt die Zahl');
    }
    assert.equal(result.skipped, 1, 'ausgeschlossen zaehlt weiter als uebersprungen');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
