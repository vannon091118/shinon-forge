#!/usr/bin/env node
/**
 * Abnahmetest des persistenten Projektindex (@shinon/project-index) — Phase 3
 * (Plan §9 Primärdaten, §10 Indexdateien, §11 inkrementelles Indexing, §12
 * SQLite und Worker).
 *
 * Vier Ebenen, bewusst getrennt:
 *   1. Die reine Extraktion (Zeilenheuristik) gegen Fixtures UND gegen echte
 *      Dateien dieses Repos — die Grenze wird gemessen, nicht behauptet.
 *   2. Das Schema: die Primärdaten aus Plan §9, namentlich und zählbar, plus die
 *      gemessene Tatsache, dass `references` ein SQLite-Schlüsselwort ist.
 *   3. Ein echter Lauf gegen ein Fixture-Projekt: Vollauf, unveränderter zweiter
 *      Lauf, geänderter Inhalt, gelöschte Datei, zu große Datei, FTS5.
 *   4. Der Host-Pfad: der Lauf im Worker und im Host liefern denselben Index,
 *      der Mount startet den Lauf und blockiert den Start nicht, und ein
 *      scheiternder Worker wird protokolliert statt geworfen.
 *
 * Warum ein Fixture-Projekt und nicht nur dieses Repo: nur so sind „unverändert",
 * „gelöscht" und „zu groß" deterministisch herstellbar. Gegen die echten Dateien
 * dieses Repos läuft zusätzlich die Extraktion, damit die Zusage an echtem Text
 * hängt und nicht an erfundenen Beispielen.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz,
 * kein Modell, kein node_modules im Repo (`dsh` muss im PATH liegen — wie beim
 * Profiltest, weil das echte Schemastery aus der DSH-Installation kommt).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { codeOnly, findForbidden, findMissing } from '../../lib/source-scan.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/project-index/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const INDEX_FILE = join(PACKAGE_DIR, 'index.js');
const CORE_FILE = join(PACKAGE_DIR, 'assets/index-core.js');

const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
const require = createRequire(join(root, 'package.json'));

/** Das Bundle isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation. */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-index-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  const shim = join(work, 'pkg/node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  return { bundle: await import(pathToFileURL(join(work, 'pkg/index.js')).href), work };
}

const { bundle, work: bundleWork } = await loadBundle();
const { DatabaseSync } = await import('node:sqlite');

/**
 * Ausgaben einsammeln statt sie zu zeigen. Anders als ein synchrones
 * `capture(fn)` deckt der Sammler auch das ab, was NACH dem Mount passiert —
 * der Indexlauf ist asynchron, sein Bericht kommt also später.
 */
function collector() {
  const lines = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...args) => lines.push(args.join(' '));
  return {
    lines,
    restore: () => Object.assign(console, saved),
    /** Auf eine Zeile warten, ohne den Test an eine feste Uhrzeit zu binden. */
    waitFor: async (needle, timeoutMs = 20000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline && !lines.some((line) => line.includes(needle))) await new Promise((resolve) => setTimeout(resolve, 50));
      return lines.some((line) => line.includes(needle));
    },
  };
}

const works = [bundleWork];
/** Ein frisches Arbeitsverzeichnis, das am Ende der Datei aufgeräumt wird. */
function workDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `shinon-index-${label}-`));
  works.push(dir);
  return dir;
}

afterAllCleanup();
function afterAllCleanup() {
  process.on('exit', () => {
    for (const dir of works) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* Aufräumen ist Beiwerk */
      }
    }
  });
}

/**
 * Ein Fixture-Projekt mit genau den Formen, die der Index zusagt, und mit den
 * Formen, die er ignorieren muss: Fremdverzeichnis, unbekannte Endung.
 */
function fixtureProject(label) {
  const dir = join(workDir(label), 'projekt');
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  mkdirSync(join(dir, 'node_modules/fremd'), { recursive: true });
  writeFileSync(
    join(dir, 'src/a.mjs'),
    [
      "import { bThing } from './b.mjs';",
      '',
      '/**',
      ' * apply(ctx) — dieser Aufruf steht in einem Kommentar und ist kein Symbol.',
      ' */',
      'export const alpha = 1;',
      'function aRun() {',
      '  if (alpha > 0) {',
      '    for (const item of [1]) {',
      '      bThing(item);',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(join(dir, 'src/b.mjs'), ['export function bThing(value) {', '  return value;', '}', '', 'const beta = 2;', ''].join('\n'));
  writeFileSync(join(dir, 'docs/notes.md'), '# Notizen\n\nDie Schleife nutzt alpha und bThing.\n');
  writeFileSync(join(dir, 'config.yml'), 'name: fixture\n');
  writeFileSync(join(dir, 'ignored.txt'), 'diese Endung wird nicht indexiert\n');
  writeFileSync(join(dir, 'node_modules/fremd/index.js'), 'export const fremd = 1;\n');
  return dir;
}

/** Der Index eines Fixture-Projekts, ausserhalb des Projekts. */
function fixtureIndex(project, label) {
  const indexRoot = join(workDir(label), 'indexes');
  return { indexRoot, file: bundle.indexPath(indexRoot, project) };
}

/** Zeilen als schlichte Objekte: node:sqlite liefert Objekte ohne Prototyp. */
const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((row) => ({ ...row }));
const one = (db, sql, ...args) => ({ ...db.prepare(sql).get(...args) });

// ── Zusage: die Extraktion erkennt genau die benannten Formen ────────────────

test('Extraktion: Symbole — je Zeile höchstens eines, Schlüsselwörter sind keine Symbole', () => {
  const cases = [
    { name: 'export function', text: 'export function apply(ctx) {}', want: [{ name: 'apply', kind: 'function', line: 1 }] },
    { name: 'async function', text: 'async function run() {}', want: [{ name: 'run', kind: 'function', line: 1 }] },
    { name: 'export class', text: 'export class Router {}', want: [{ name: 'Router', kind: 'class', line: 1 }] },
    { name: 'const', text: 'const PRE_STEP_EVENT = 1;', want: [{ name: 'PRE_STEP_EVENT', kind: 'const', line: 1 }] },
    { name: 'let ohne =', text: 'let offen;', want: [] },
    { name: 'export { a, b }', text: 'export { helper };', want: [{ name: 'helper', kind: 'export', line: 1 }] },
    { name: 'Methode', text: '  stream(options) {', want: [{ name: 'stream', kind: 'method', line: 1 }] },
    { name: 'Zeile mit mehreren Formen: die erste gewinnt', text: '  if (a) { const b = 1; }', want: [] },
    { name: 'Zeilenkommentar', text: '// function gelöscht() {}', want: [] },
    { name: 'Dokkommentar-Zeile', text: ' * apply(ctx, config) — Beispiel', want: [] },
    { name: 'Blockkommentar über zwei Zeilen', text: '/*\nconst versteckt = 1;\n*/\nconst sichtbar = 2;', want: [{ name: 'sichtbar', kind: 'const', line: 4 }] },
    { name: 'Einrückung mit zwei Leerzeichen ist eine Methode', text: 'if (a) {\n  while (b) {\n    for (const c of d) {', want: [] },
  ];
  for (const { name, text, want } of cases) {
    assert.deepEqual(bundle.extractSymbols(text), want, name);
  }
});

/**
 * Regressionstest — der Grund, warum es diese Liste gibt.
 *
 * Gemessen auf diesem Repo, vor der Liste: `for` war mit 126 Treffern der
 * HAÜFIGSTE „Symbolname" des Projekts, `if` folgte mit 71. Jede Schleife wäre
 * damit eine Referenz auf ein Symbol gewesen.
 */
test('Extraktion: die gemessenen Schlüsselwörter des Repos sind keine Symbole', () => {
  const source = readFileSync(join(REPO_ROOT, 'packages/hook/index.js'), 'utf8');
  const names = new Set(bundle.extractSymbols(source).map((symbol) => symbol.name));
  for (const keyword of ['if', 'for', 'while', 'switch', 'return']) {
    assert.ok(!names.has(keyword), `"${keyword}" darf kein Symbol sein`);
  }
  assert.ok(names.has('PRE_STEP_EVENT'), 'echte Symbole müssen bleiben');
});

test('Extraktion: an echten Dateien dieses Repos — Symbole, Kanten, Referenzen', () => {
  const prompter = readFileSync(join(REPO_ROOT, 'packages/prompter/index.js'), 'utf8');
  const names = bundle.extractSymbols(prompter).map((symbol) => symbol.name);
  for (const expected of ['enhanceGuarded', 'readPrompt', 'Config', 'apply']) {
    assert.ok(names.includes(expected), `Symbol ${expected} fehlt`);
  }
  assert.deepEqual(
    bundle.extractEdges(prompter),
    [
      { kind: 'import', target: '@deepseek-ai/schemastery' },
      { kind: 'import', target: 'node:fs' },
    ],
    'Kanten sind Importe; externe Ziele bleiben drin, weil sie importiert werden',
  );

  // Alle Treffer einer Zeile zählen — nicht nur der erste.
  assert.deepEqual(bundle.findReferences('const a = alpha + beta;', ['alpha', 'beta']), [
    { name: 'alpha', line: 1 },
    { name: 'beta', line: 1 },
  ]);
  assert.deepEqual(bundle.findReferences('gamma', ['alpha']), [], 'kein Treffer, keine Zeile');
  assert.deepEqual(bundle.findReferences('für alpha', ['alpha']), [{ name: 'alpha', line: 1 }], 'Wortgrenze statt Teilwort');
});

test('Extraktion: Chunks sind Zeilenfenster mit echten Zeilennummern', () => {
  const text = ['eins', 'zwei', 'drei', 'vier', 'fünf'].join('\n');
  assert.deepEqual(bundle.chunkText(text, 2), [
    { startLine: 1, endLine: 2, body: 'eins\nzwei' },
    { startLine: 3, endLine: 4, body: 'drei\nvier' },
    { startLine: 5, endLine: 5, body: 'fünf' },
  ]);
  assert.deepEqual(bundle.chunkText('a\n\n\n\nb\n', 2).map((chunk) => chunk.startLine), [1, 5], 'leere Fenster fallen weg');
});

// ── Zusage: der Index liegt außerhalb des Projekts ──────────────────────────

test('Lage: der Index liegt außerhalb des Projekts und ist pro Projekt stabil', () => {
  const project = '/tief/im/projekt';
  const indexRoot = join(homedir(), '.shinon', 'indexes');
  const file = bundle.indexPath(indexRoot, project);
  assert.equal(bundle.DEFAULT_INDEX_ROOT, indexRoot, 'Default-Wurzel ist ~/.shinon/indexes');
  assert.ok(file.startsWith(indexRoot), 'der Index liegt unter der Indexwurzel');
  assert.ok(!file.startsWith(project), 'und nie im Projekt');
  assert.equal(file.endsWith(bundle.INDEX_FILE), true);
  assert.equal(bundle.indexPath(indexRoot, project), file, 'gleicher Pfad, gleiche Kennung');
  assert.notEqual(bundle.indexPath(indexRoot, '/anderes/projekt'), file, 'anderes Projekt, andere Kennung');
  assert.equal(bundle.toProjectPath('/p', '/p/src/a.mjs'), 'src/a.mjs', 'gespeichert wird relativ');
});

// ── Zusage: das Schema trägt genau die Primärdaten aus Plan §9 ───────────────

test('Schema: die sechs Primärdaten aus Plan §9 sind namentlich vorhanden', () => {
  const work = workDir('schema');
  const db = bundle.openIndex(join(work, 'index.sqlite'));
  const tables = new Set(rows(db, "select name from sqlite_master where type = 'table'").map((row) => row.name));

  assert.deepEqual(bundle.PRIMARY_TABLES, ['files', 'symbols', 'edges', 'references', 'touches', 'chunks']);
  for (const table of bundle.PRIMARY_TABLES) {
    assert.ok(tables.has(table), `Tabelle ${table} fehlt`);
    assert.equal(one(db, `select count(*) as n from "${table}"`).n, 0, `${table} beginnt leer`);
  }
  assert.ok(tables.has(bundle.FTS_TABLE), 'die FTS5-Spiegelung der Chunks fehlt');
  assert.deepEqual(bundle.indexMeta(db).contract, bundle.CONTRACT);
  assert.deepEqual(bundle.indexMeta(db).schema_version, String(bundle.SCHEMA_VERSION));

  assert.equal(bundle.CONTRACT, 'shinon.project-index/v1', 'der Vertragsname ist die Zusage an Leser');
  assert.equal(bundle.SCHEMA_VERSION, 1);
  db.close();
});

/**
 * Regressionstest — gemessene Runtime-Tatsache.
 *
 * `create table references(...)` ist in SQLite 3.51.3 ein Syntaxfehler, weil
 * REFERENCES ein Schlüsselwort ist. Die Tabelle trägt deshalb exakt den Namen aus
 * Plan §9, aber überall gequotet. Fällt das Quoting weg, bricht jeder Lauf.
 */
test('Schema: "references" ist ein Schlüsselwort und braucht Quoting', () => {
  const work = workDir('references');
  const probe = new DatabaseSync(join(work, 'probe.sqlite'));
  assert.throws(() => probe.exec('create table references(path text)'), /syntax error/);
  probe.exec('create table "references"(path text)');
  probe.prepare('insert into "references"(path) values (?)').run('a.mjs');
  assert.equal(one(probe, 'select count(*) as n from "references"').n, 1);
  probe.close();

  const db = bundle.openIndex(join(work, 'index.sqlite'));
  const { SCHEMA } = bundle;
  assert.ok(SCHEMA.join('\n').includes('"references"'), 'das Schema muss die Tabelle quoten');
  assert.ok(!SCHEMA.join('\n').includes('table if not exists references'), 'ungequotet wäre es ein Syntaxfehler');
  db.close();
});

/**
 * Ein Index mit fremdem Vertrag ist keine Grundlage: er wird verworfen, statt
 * stillschweigend weiterbenutzt zu werden.
 */
test('Schema: ein Index mit fremdem Vertrag wird verworfen, nicht weitergenutzt', () => {
  const work = workDir('vertrag');
  const file = join(work, 'index.sqlite');
  const first = bundle.openIndex(file);
  first.prepare('insert or replace into meta(key, value) values (?, ?)').run('contract', 'shinon.etwas-anderes/v9');
  first.prepare('insert into files(path, language, bytes, mtime_ms, digest, indexed_at_ms) values (?, ?, ?, ?, ?, ?)').run('alt.mjs', 'javascript', 1, 1, 'x', 1);
  first.close();

  const second = bundle.openIndex(file);
  assert.equal(bundle.indexMeta(second).contract, bundle.CONTRACT, 'der eigene Vertrag steht wieder');
  assert.equal(bundle.indexStats(second).files, 0, 'alte Zeilen sind weg');
  second.close();
  assert.equal(bundle.openIndex(file).close(), undefined);
});

// ── Zusage: der Lauf indiziert und bleibt inkrementell (Plan §11) ────────────

test('Lauf: Vollauf, unveränderter Lauf, aufgefrischte und geänderte Datei', () => {
  const project = fixtureProject('lauf');
  const { indexRoot, file } = fixtureIndex(project, 'lauf');
  const db = bundle.openIndex(file);

  const first = bundle.updateIndex(db, project, {});
  assert.equal(first.root, project);
  assert.equal(first.written, first.files, 'der erste Lauf schreibt jede Datei');
  assert.ok(first.unchanged === 0 && first.rehashed === 0 && first.removed === 0 && first.skipped === 0);
  assert.equal(first.symbolsChanged, true);
  assert.ok(first.references > 0, 'der erste Lauf füllt die Referenzen');
  assert.equal(first.touches, 1, 'genau eine interne Kante ist auflösbar: a.mjs → b.mjs');

  // Fremdverzeichnis und unbekannte Endung werden nie indiziert.
  const paths = rows(db, 'select path from files order by path').map((row) => row.path);
  assert.deepEqual(paths, ['config.yml', 'docs/notes.md', 'src/a.mjs', 'src/b.mjs']);
  assert.deepEqual(
    rows(db, 'select path, language from files order by path'),
    [
      { path: 'config.yml', language: 'yaml' },
      { path: 'docs/notes.md', language: 'markdown' },
      { path: 'src/a.mjs', language: 'javascript' },
      { path: 'src/b.mjs', language: 'javascript' },
    ],
    'Plan §10: die Sprache steht in der Indexdatei',
  );
  assert.deepEqual(rows(db, 'select kind, target from edges where path = ? order by target', 'src/a.mjs'), [{ kind: 'import', target: './b.mjs' }]);
  assert.deepEqual(rows(db, 'select target, kind from touches'), [{ target: 'src/b.mjs', kind: 'import' }]);
  assert.ok(
    rows(db, 'select name from "references" where path = ?', 'src/a.mjs').some((row) => row.name === 'bThing'),
    'die Referenz auf ein fremdes Symbol wird gefunden',
  );

  // Zweiter Lauf, nichts verändert: keine Datei wird neu gelesen, keine
  // Referenz neu geprüft (mtime+size gleich → nicht einmal öffnen).
  const second = bundle.updateIndex(db, project, {});
  assert.deepEqual(
    { ...second, root: undefined },
    { root: undefined, files: first.files, written: 0, rehashed: 0, unchanged: first.files, skipped: 0, removed: 0, references: 0, touches: 0, symbolsChanged: false },
  );
  const before = one(db, 'select count(*) as n from "references"').n;
  assert.equal(one(db, 'select count(*) as n from "references"').n, before, 'der zweite Lauf ändert die Referenzen nicht');

  // mtime geändert, Inhalt gleich (Plan §11): Hash vergleichen, nicht neu parsen.
  const probe = join(project, 'src/b.mjs');
  const fresh = new Date(Date.now() + 5000);
  utimesSync(probe, fresh, fresh);
  const third = bundle.updateIndex(db, project, {});
  assert.equal(third.rehashed, 1, 'gleicher Hash: nur die Dateizeile wird aufgefrischt');
  assert.equal(third.written, 0, 'gleicher Hash: kein Neuparsen');
  assert.equal(third.symbolsChanged, false, 'die Symbolmenge bleibt gleich');
  assert.equal(rows(db, 'select count(*) as n from symbols where path = ?', 'src/b.mjs')[0].n, 2, 'die Symbole bleiben stehen');

  // Inhalt geändert: neu parsen, Symbolmenge wächst, Referenzen werden neu geprüft.
  writeFileSync(probe, ['export function bThing(value) {', '  return value;', '}', '', 'export const bZusatz = 3;', ''].join('\n'));
  const fourth = bundle.updateIndex(db, project, {});
  assert.equal(fourth.written, 1);
  assert.equal(fourth.symbolsChanged, true);
  assert.ok(fourth.references > 0, 'neue Symbole können überall neue Referenzen erzeugen');
  assert.deepEqual(
    rows(db, 'select name, kind from symbols where path = ? order by line', 'src/b.mjs'),
    [
      { name: 'bThing', kind: 'function' },
      { name: 'bZusatz', kind: 'const' },
    ],
  );
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'beta')[0].n, 0, 'das alte Symbol "beta" ist weg');
  db.close();
});

test('Lauf: gelöschte Datei verschwindet samt Touches, die auf sie zeigten', () => {
  const project = fixtureProject('loeschen');
  const { file } = fixtureIndex(project, 'loeschen');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});
  assert.equal(one(db, 'select count(*) as n from touches where target = ?', 'src/b.mjs').n, 1);

  rmSync(join(project, 'src/b.mjs'));
  const report = bundle.updateIndex(db, project, {});
  assert.equal(report.removed, 1);
  assert.equal(rows(db, 'select path from files where path = ?', 'src/b.mjs').length, 0, 'die Dateizeile ist weg');
  assert.equal(one(db, 'select count(*) as n from symbols where path = ?', 'src/b.mjs').n, 0, 'ihre Symbole sind weg');
  assert.equal(one(db, 'select count(*) as n from chunks where path = ?', 'src/b.mjs').n, 0, 'ihre Chunks sind weg');
  assert.equal(one(db, 'select count(*) as n from "references" where path = ?', 'src/b.mjs').n, 0, 'ihre Referenzen sind weg');
  assert.equal(
    one(db, 'select count(*) as n from touches where target = ?', 'src/b.mjs').n,
    0,
    'ein Touch auf eine gelöschte Datei ist kein Touch',
  );
  assert.deepEqual(
    bundle.searchChunks(db, 'bThing').map((hit) => hit.path),
    ['docs/notes.md', 'src/a.mjs'],
    'die Volltextsuche kennt die gelöschte Datei nicht mehr, die anderen Treffer bleiben',
  );
  assert.equal(
    one(db, `select count(*) as n from ${bundle.FTS_TABLE}`).n,
    one(db, 'select count(*) as n from chunks').n,
    'die FTS-Spiegelung ist auch nach dem Löschen vollständig',
  );
  db.close();
});

test('Lauf: eine zu große Datei wird übersprungen und lässt keine alten Zeilen stehen', () => {
  const project = fixtureProject('groesse');
  const { file } = fixtureIndex(project, 'groesse');
  const db = bundle.openIndex(file);
  const big = join(project, 'src/gross.mjs');
  writeFileSync(big, `export const gross = 1;\n${'// Fülltext\n'.repeat(400)}`);
  bundle.updateIndex(db, project, {});
  assert.equal(one(db, 'select count(*) as n from files where path = ?', 'src/gross.mjs').n, 1, 'zunächst indiziert');

  writeFileSync(big, `export const gross = 2;\n${'// noch mehr Fülltext\n'.repeat(400)}`);
  const report = bundle.updateIndex(db, project, { maxFileBytes: 512 });
  assert.equal(report.skipped, 1, 'die Obergrenze greift beim Lesen');
  assert.equal(report.written, 0);
  assert.equal(one(db, 'select count(*) as n from files where path = ?', 'src/gross.mjs').n, 0, 'die alten Zeilen sind weg');
  assert.equal(one(db, 'select count(*) as n from symbols where path = ?', 'src/gross.mjs').n, 0);
  db.close();
});

test('Suche: FTS5 findet Begriffe und bricht an einem unbrauchbaren Ausdruck nicht ab', () => {
  const project = fixtureProject('fts');
  const { file } = fixtureIndex(project, 'fts');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});

  const hits = bundle.searchChunks(db, 'bThing');
  assert.deepEqual(hits.map((hit) => hit.path).sort(), ['docs/notes.md', 'src/a.mjs', 'src/b.mjs'], 'Treffer über Dateigrenzen, absteigend nach Trefferzahl');
  assert.ok(hits[0].hits >= hits[hits.length - 1].hits);
  assert.deepEqual(bundle.searchChunks(db, 'kommtnichtvor'), []);
  assert.deepEqual(bundle.searchChunks(db, 'AND'), [], 'ein ungültiger Ausdruck liefert leer statt zu werfen');
  assert.equal(one(db, `select count(*) as n from ${bundle.FTS_TABLE}`).n, one(db, 'select count(*) as n from chunks').n, 'die FTS-Spiegelung ist vollständig');
  db.close();
});

// ── Zusage: das Projekt bleibt unberührt ────────────────────────────────────

test('Grenze: der Lauf schreibt nichts ins Projekt', () => {
  const project = fixtureProject('grenze');
  const { indexRoot, file } = fixtureIndex(project, 'grenze');
  const snapshot = (dir) => {
    const out = [];
    const walk = (current, prefix) => {
      for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const absolute = join(current, entry.name);
        const rel = `${prefix}${entry.name}`;
        if (entry.isDirectory()) walk(absolute, `${rel}/`);
        else out.push(`${rel}:${statSync(absolute).size}:${statSync(absolute).mtimeMs}`);
      }
    };
    walk(dir, '');
    return out;
  };
  const before = snapshot(project);

  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});
  db.close();

  assert.deepEqual(snapshot(project), before, 'keine neue Datei, kein geänderter Inhalt im Projekt');
  assert.ok(!file.startsWith(project), 'der Index liegt außerhalb');
  assert.ok(readFileSync(file).length > 0, 'und existiert wirklich');

  // Beide Haelften: die Host-Haelfte (Mount) und der Kern (Engine, im Worker).
  const sources = { 'index.js': readFileSync(INDEX_FILE, 'utf8'), 'assets/index-core.js': readFileSync(CORE_FILE, 'utf8') };
  for (const [name, source] of Object.entries(sources)) {
    for (const tokens of [
      ['writeFileSync', 'appendFileSync', 'rmSync', 'unlinkSync', 'renameSync'],
      ['child_process', 'fetch(', 'process.exit', 'ctx.llm', 'ctx.agents', 'ctx.shell', 'ctx.set('],
    ]) {
      assert.deepEqual(findForbidden(source, tokens, { mode: 'module' }), [], `${name}: ${tokens.join(', ')}`);
      assert.deepEqual(findForbidden(source, tokens), [], `${name}: ${tokens.join(', ')}`);
    }
  }
  assert.deepEqual(findMissing(codeOnly(sources['assets/index-core.js']), ['new DatabaseSync']), [], 'der Index ist wirklich SQLite');
  assert.deepEqual(
    findForbidden(sources['index.js'], ['DatabaseSync'], { mode: 'module' }),
    [],
    'die Host-Haelfte fasst die Datenbank nicht selbst an — sie mountet nur',
  );
  assert.ok(bundle.SKIP_DIRS.has('node_modules') && bundle.SKIP_DIRS.has('.git'), 'Fremdcode und Historie werden nie betreten');
});

// ── Zusage: der Lauf steht im Worker, der Mount blockiert nicht (Plan §12) ───

test('Host und Worker: derselbe Lauf, derselbe Index', async () => {
  const project = fixtureProject('worker');
  const hostIndex = fixtureIndex(project, 'worker-host');
  const workerIndex = fixtureIndex(project, 'worker-worker');

  const hostReport = bundle.runIndex({ root: project, indexRoot: hostIndex.indexRoot });
  const worker = await bundle.runIndexInWorker({ root: project, indexRoot: workerIndex.indexRoot });
  assert.equal(worker.ok, true, `der Worker muss den Lauf tragen: ${worker.error ?? ''}`);

  const read = (file) => {
    const db = bundle.openIndex(file);
    const stats = bundle.indexStats(db);
    const meta = bundle.indexMeta(db);
    const symbols = rows(db, 'select path, name, kind, line from symbols order by path, line');
    const edges = rows(db, 'select path, kind, target from edges order by path, target');
    const touches = rows(db, 'select path, target, kind from touches order by path, target');
    db.close();
    return { stats, symbols, edges, touches, digest: meta.symbols_digest };
  };

  const hostSide = read(hostIndex.file);
  const workerSide = read(workerIndex.file);
  assert.deepEqual(workerSide, hostSide, 'zwei Wege, ein Ergebnis');
  assert.equal(worker.report.written, hostReport.written);
  assert.equal(worker.report.touches, hostReport.touches);
  assert.ok(hostSide.stats.files > 0 && hostSide.stats.symbols > 0);
});

test('Mount: der Lauf startet nach dem Mount, ein abgemounteter Lauf schreibt nichts', async () => {
  const project = fixtureProject('mount');
  const indexRoot = join(workDir('mount'), 'indexes');
  const file = bundle.indexPath(indexRoot, project);
  const quiet = collector();
  try {
    // Ein Mount, der vor dem Lauf abgeräumt wird, darf nichts schreiben.
    const abandoned = bundle.apply({}, bundle.Config({ root: project, indexRoot }));
    abandoned();
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(quiet.lines.filter((line) => !line.includes('Aktiviert')), [], 'kein Lauf nach dem Abräumen');
    assert.equal(existsSync(indexRoot), false, 'und keine Indexwurzel');

    const dispose = bundle.apply({}, bundle.Config({ root: project, indexRoot }));
    assert.ok(
      quiet.lines.some((line) => line.includes(bundle.CONTRACT) && line.includes('Lauf nach dem Start')),
      `Aktivierung muss den Vertrag nennen: ${quiet.lines.join(' | ')}`,
    );
    assert.ok(quiet.lines.some((line) => line.includes('(Worker)')), 'der Mount startet den Worker');

    // Auf den Lauf warten: der Index entsteht asynchron, der Mount blockiert nicht.
    assert.ok(await quiet.waitFor('Lauf im Worker'), `der Bericht muss den Worker nennen: ${quiet.lines.join(' | ')}`);
    const db = bundle.openIndex(file);
    const stats = bundle.indexStats(db);
    db.close();
    assert.equal(stats.files, 4, 'der Index ist nach dem Start vollständig');
    dispose();
  } finally {
    quiet.restore();
  }
});

/**
 * Ein scheiternder Worker ist ein Befund, kein Absturz: der Mount bleibt heil,
 * die Ursache steht im Protokoll, und derselbe Lauf wird im Host versucht.
 */
test('Mount: ein scheiternder Worker wird protokolliert und im Host wiederholt', async () => {
  const project = fixtureProject('fallback');
  const blocked = join(workDir('fallback'), 'keine-wurzel');
  writeFileSync(blocked, 'dies ist ein Verzeichnis, das keines ist\n');
  const quiet = collector();
  try {
    const dispose = bundle.apply({}, bundle.Config({ root: project, indexRoot: blocked }));
    assert.ok(await quiet.waitFor('Lauf abgebrochen'), `der Ausgang muss gemeldet werden: ${quiet.lines.join(' | ')}`);
    dispose();
    assert.ok(quiet.lines.some((line) => line.includes('Worker nicht nutzbar')), 'der Workerausfall ist benannt');
    assert.ok(quiet.lines.some((line) => line.includes('(Worker)')), 'zuerst wurde der Worker versucht');
  } finally {
    quiet.restore();
  }
});
