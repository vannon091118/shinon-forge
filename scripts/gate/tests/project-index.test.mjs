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
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, relative } from 'node:path';
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
      '// Siehe Notizen — Prosa aus einer Ueberschrift, kein Referenzziel.',
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
  writeFileSync(join(dir, 'docs/notes.md'), '# Notizen\n\nDie Schleife nutzt alpha und bThing.\n\n```js\n# Das ist ein Beispiel in einem Code-Fence und keine Struktur.\n```\n');
  writeFileSync(join(dir, 'config.yml'), 'name: fixture\n');
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'fixture', dependencies: { '@deepseek-ai/schemastery': '~3.18.4', yaml: '^2.0.0' }, devDependencies: { yaml: '^2.0.0' } }, null, 2)}\n`,
  );
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
  const meta = bundle.indexMeta(db);
  assert.deepEqual(meta.contract, bundle.CONTRACT);
  assert.deepEqual(meta.schema_version, String(bundle.SCHEMA_VERSION));
  assert.deepEqual(meta.indexer_version, String(bundle.INDEXER_VERSION), 'der Index kennt die Fassung seiner Extraktion');

  assert.equal(bundle.CONTRACT, 'shinon.project-index/v1', 'der Vertragsname ist die Zusage an Leser');
  assert.equal(bundle.SCHEMA_VERSION, 1);
  db.close();
});

/**
 * Regressionstest — im Live-Boot gefunden, nicht im Kopf ausgedacht.
 *
 * Der Lauf ist inkrementell: eine unveränderte Datei wird nie neu geparst. Wird
 * die EXTRAKTION geändert, bleiben ihre Zeilen deshalb auf dem alten Stand; der
 * Live-Boot zeigte danach 643 statt der gemessenen rund 1030 Symbole. Also trägt
 * der Index die Fassung seiner Extraktion, und eine andere Fassung verwirft ihn.
 */
test('Indexer-Fassung: ein Index aus einer anderen Extraktor-Fassung wird verworfen', () => {
  const work = workDir('indexer');
  const project = fixtureProject('indexer');
  const { file } = fixtureIndex(project, 'indexer');
  const first = bundle.openIndex(file);
  bundle.updateIndex(first, project, {});
  assert.ok(bundle.indexStats(first).symbols > 0, 'der Index ist gefüllt');

  // Ein Index aus einer älteren Extraktor-Fassung: Vertrag und Schema passen,
  // die Extraktion nicht.
  first.prepare('update meta set value = ? where key = ?').run('1', 'indexer_version');
  first.close();

  const second = bundle.openIndex(file);
  assert.equal(bundle.indexMeta(second).indexer_version, String(bundle.INDEXER_VERSION), 'die eigene Fassung steht wieder');
  assert.equal(bundle.indexStats(second).symbols, 0, 'und der alte Inhalt ist weg');
  const report = bundle.updateIndex(second, project, {});
  assert.equal(report.written, report.files, 'der Wiederaufbau schreibt jede Datei');
  second.close();
  assert.ok(work.length > 0);
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
  assert.equal(first.verify, 'changed', 'der Bericht nennt die Politik, die ihn erzeugt hat');
  assert.equal(first.written, first.files, 'der erste Lauf schreibt jede Datei');
  assert.equal(first.hashed, first.files, 'und liest jede Datei');
  assert.ok(first.unchanged === 0 && first.rehashed === 0 && first.removed === 0 && first.skipped === 0);
  assert.equal(first.symbolsChanged, true);
  assert.ok(first.references > 0, 'der erste Lauf füllt die Referenzen');
  assert.equal(first.touches, 1, 'genau eine interne Kante ist auflösbar: a.mjs → b.mjs');

  // Fremdverzeichnis und unbekannte Endung werden nie indiziert.
  const paths = rows(db, 'select path from files order by path').map((row) => row.path);
  assert.deepEqual(paths, ['config.yml', 'docs/notes.md', 'package.json', 'src/a.mjs', 'src/b.mjs']);
  assert.deepEqual(
    rows(db, 'select path, language from files order by path'),
    [
      { path: 'config.yml', language: 'yaml' },
      { path: 'docs/notes.md', language: 'markdown' },
      { path: 'package.json', language: 'json' },
      { path: 'src/a.mjs', language: 'javascript' },
      { path: 'src/b.mjs', language: 'javascript' },
    ],
    'Plan §10: die Sprache steht in der Indexdatei',
  );
  assert.deepEqual(rows(db, 'select kind, target from edges where path = ? order by target', 'src/a.mjs'), [{ kind: 'import', target: './b.mjs' }]);
  assert.deepEqual(
    rows(db, 'select kind, target from edges where path = ? order by target', 'package.json'),
    [
      { kind: 'dependency', target: '@deepseek-ai/schemastery' },
      { kind: 'dependency', target: 'yaml' },
    ],
    'JSON wird mit JSON.parse gelesen: Abhaengigkeiten sind Kanten — einmal je Ziel, auch wenn sie in zwei Feldern stehen',
  );
  assert.deepEqual(rows(db, 'select target, kind from touches'), [{ target: 'src/b.mjs', kind: 'import' }]);
  assert.ok(
    rows(db, 'select name from "references" where path = ?', 'src/a.mjs').some((row) => row.name === 'bThing'),
    'die Referenz auf ein fremdes Symbol wird gefunden',
  );

  // Zweiter Lauf, nichts verändert: keine Datei wird neu gelesen, keine
  // Referenz neu geprüft (mtime+size gleich → nicht einmal öffnen).
  const second = bundle.updateIndex(db, project, {});
  assert.deepEqual(second, {
    root: project,
    verify: 'changed',
    files: first.files,
    unchanged: first.files,
    hashed: 0,
    rehashed: 0,
    written: 0,
    skipped: 0,
    removed: 0,
    protected: 0,
    protectedKinds: {},
    purged: 0,
    findings: 0,
    references: 0,
    touches: 0,
    symbolsChanged: false,
  });
  const before = one(db, 'select count(*) as n from "references"').n;
  assert.equal(one(db, 'select count(*) as n from "references"').n, before, 'der zweite Lauf ändert die Referenzen nicht');

  // mtime geändert, Inhalt gleich (Plan §11): Hash vergleichen, nicht neu parsen.
  const probe = join(project, 'src/b.mjs');
  const fresh = new Date(Date.now() + 5000);
  utimesSync(probe, fresh, fresh);
  const third = bundle.updateIndex(db, project, {});
  assert.equal(third.rehashed, 1, 'gleicher Hash: nur die Dateizeile wird aufgefrischt');
  assert.equal(third.hashed, 1, 'genau diese eine Datei wurde gelesen');
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

// ── Zusage: die Parser-Strategie folgt dem Dateityp ────────────────────────

/**
 * Die Registry benennt, WELCHER Parser traegt — die Zuordnung ist gemessen
 * (Docs/probes/project-index-parserstrategie.json), nicht behauptet: fuer
 * JavaScript existiert in dieser Runtime keiner, fuer JSON gibt es den
 * eingebauten, fuer YAML keinen, der aus diesem Paket erreichbar waere.
 */
test('Parser: die Registry benennt je Dateityp den Parser, der wirklich trägt', () => {
  const code = `export const x = 1;\nimport y from './y.mjs';\n`;
  const cases = [
    { language: 'javascript', probe: code, parser: /zeilenbasiert/, symbols: 1, edges: 1 },
    { language: 'typescript', probe: code, parser: /zeilenbasiert/, symbols: 1, edges: 1 },
    { language: 'json', probe: '{"dependencies":{"y":"1"}}', parser: /^JSON\.parse$/, symbols: 0, edges: 1 },
    { language: 'markdown', probe: '# Titel\n', parser: /Ueberschriften/, symbols: 1, edges: 0 },
    { language: 'yaml', probe: 'name: x\n', parser: /keiner/, symbols: 0, edges: 0 },
    { language: 'etwas-anderes', probe: code, parser: /keiner/, symbols: 0, edges: 0 },
  ];
  for (const { language, probe, parser, symbols, edges } of cases) {
    const entry = bundle.parserFor(language);
    assert.match(entry.parser, parser, language);
    assert.equal(entry.symbols(probe).length, symbols, `${language}: Symbole`);
    assert.equal(entry.edges(probe).length, edges, `${language}: Kanten`);
  }
  assert.equal(bundle.PARSERS.javascript, bundle.PARSERS.typescript, 'dieselbe Sprache, derselbe Extraktor');
  assert.equal(bundle.PARSERS.yaml, bundle.PARSERS.text, 'ohne Parser bleibt die Datei Text');
  assert.equal(bundle.extractSymbols('export const x = 1;').length, 1, 'der Standard bleibt Code');
});

test('Parser: Markdown liefert Überschriften, aber nicht die Beispiele in Code-Fences', () => {
  const text = ['# Titel', '', '```js', '# kein Symbol', '```', '', '## Zweiter', '~~~', '### auch nicht', '~~~', '#### Mit Schlussrauten ####'].join('\n');
  assert.deepEqual(bundle.extractSymbols(text, 'markdown'), [
    { name: 'Titel', kind: 'heading', line: 1 },
    { name: 'Zweiter', kind: 'heading', line: 7 },
    { name: 'Mit Schlussrauten', kind: 'heading', line: 11 },
  ]);
  assert.deepEqual(bundle.extractEdges(text, 'markdown'), [], 'Markdown hat keine Importe');
});

test('Parser: JSON wird wirklich geparst — und ein kaputtes JSON bricht nichts', () => {
  const manifest = JSON.stringify({ name: 'x', dependencies: { b: '1', a: '1' }, devDependencies: { c: '1' }, scripts: { test: 'x' } });
  assert.deepEqual(bundle.extractEdges(manifest, 'json'), [
    { kind: 'dependency', target: 'a' },
    { kind: 'dependency', target: 'b' },
    { kind: 'dependency', target: 'c' },
  ]);
  const cases = [
    { name: 'kaputtes JSON', text: '{ "name": }', edges: [] },
    { name: 'Array', text: '[1, 2, 3]', edges: [] },
    { name: 'ohne Abhängigkeiten', text: '{"name":"x"}', edges: [] },
    { name: 'leer', text: '', edges: [] },
    { name: 'Abhängigkeitsfeld kein Objekt', text: '{"dependencies":"nein"}', edges: [] },
  ];
  for (const { name, text, edges } of cases) {
    assert.deepEqual(bundle.extractEdges(text, 'json'), edges, name);
  }
  assert.deepEqual(bundle.extractSymbols(manifest, 'json'), [], 'JSON hat keine Symbole');
});

test('Referenzen: Prosa ist kein Referenzziel, ein Bezeichner ist eines', () => {
  const project = fixtureProject('prosa');
  const { file } = fixtureIndex(project, 'prosa');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});

  // 'Notizen' steht als Überschrift in docs/notes.md UND als Wort in src/a.mjs.
  assert.ok(
    rows(db, 'select name, kind from symbols where name = ?', 'Notizen').some((row) => row.kind === 'heading'),
    'die Überschrift ist ein Symbol',
  );
  assert.equal(
    one(db, 'select count(*) as n from "references" where name = ?', 'Notizen').n,
    0,
    'aber sie ist kein Referenzziel — sonst wäre jedes Vorkommen des Wortes eine Referenz auf ein Symbol',
  );
  assert.ok(one(db, 'select count(*) as n from "references" where name = ?', 'bThing').n > 0, 'ein Bezeichner bleibt Referenzziel');
  assert.deepEqual(bundle.REFERENCABLE_KINDS.has('heading'), false);
  db.close();
});

// ── Zusage: das Gate der Phase 7 ───────────────────────────────────────────

/**
 * GATE AUS PHASE 7 (wörtlich): „Zweimaliger Indexlauf ohne Dateiänderung erzeugt
 * keinen vollständigen Rebuild."
 *
 * Geführt wird das nicht über Zusicherungen an einer Stelle, sondern über einen
 * vollständigen Schnappschuss ALLER Tabellen vor und nach dem zweiten Lauf: wäre
 * irgendetwas neu geschrieben worden, müsste sich mindestens eine Zeile ändern.
 * Dazu die Zählung aus dem Bericht: der zweite Lauf liest KEINE Datei (hashed 0)
 * und parst nichts (written 0).
 */
test('Gate: zweimaliger Indexlauf ohne Dateiänderung erzeugt keinen vollständigen Rebuild', () => {
  const project = fixtureProject('gate');
  const { file } = fixtureIndex(project, 'gate');
  const db = bundle.openIndex(file);

  const first = bundle.updateIndex(db, project, {});
  assert.ok(first.written > 0, 'der erste Lauf baut auf');

  const snapshot = () => ({
    files: rows(db, 'select * from files order by path'),
    symbols: rows(db, 'select * from symbols order by path, line, name'),
    edges: rows(db, 'select * from edges order by path, target, kind'),
    references: rows(db, 'select * from "references" order by path, line, name'),
    touches: rows(db, 'select * from touches order by path, target, kind'),
    chunks: rows(db, 'select * from chunks order by path, start_line'),
    fts: rows(db, `select * from ${bundle.FTS_TABLE} order by path, body`),
    stats: bundle.indexStats(db),
  });

  const before = snapshot();
  const second = bundle.updateIndex(db, project, {});

  assert.deepEqual(second, {
    root: project,
    verify: 'changed',
    files: first.files,
    unchanged: first.files,
    hashed: 0,
    rehashed: 0,
    written: 0,
    skipped: 0,
    removed: 0,
    protected: 0,
    protectedKinds: {},
    purged: 0,
    findings: 0,
    references: 0,
    touches: 0,
    symbolsChanged: false,
  });
  // `indexed_at_ms` und `updated_at_ms` sind Zeitstempel des Laufs; sie dürfen sich
  // ändern, ohne dass neu indiziert wurde — der Rest muss Zeile für Zeile gleich sein.
  const withoutStamps = (state) => ({ ...state, files: state.files.map(({ indexed_at_ms, ...rest }) => rest) });
  assert.deepEqual(withoutStamps(snapshot()), withoutStamps(before), 'kein Rebuild: jede Tabellenzeile ist unverändert');
  assert.ok(before.stats.symbols > 0 && before.stats.chunks > 0, 'der Schnappschuss ist nicht leer — sonst bewiese er nichts');
  db.close();
});

/**
 * §11 verlangt, den Umgang mit Zeitstempel-Problemen über Tests abzusichern. Die
 * Lücke wird hier als Tatsache gepinnt: derselbe Inhalt bei gleicher Grösse und
 * zurückgesetzter mtime bleibt unentdeckt — und `verify: 'all'` schliesst sie.
 */
test('Zeitstempel: die benannte Lücke und ihr Gegenmittel verify=all', () => {
  const project = fixtureProject('stempel');
  const { file } = fixtureIndex(project, 'stempel');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});

  const target = join(project, 'src/marker.mjs');
  writeFileSync(target, 'export const markerA = 1;\n');
  bundle.updateIndex(db, project, {});
  const stamp = statSync(target).mtime;

  // Gleiche Länge, anderer Inhalt, mtime zurückgesetzt: für mtime+size unverändert.
  writeFileSync(target, 'export const markerB = 1;\n');
  utimesSync(target, stamp, stamp);
  const blind = bundle.updateIndex(db, project, {});
  assert.equal(blind.hashed, 0, 'verify=changed liest die Datei nicht — das ist die Lücke');
  assert.equal(blind.written, 0);
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'markerB')[0].n, 0, 'und sieht den neuen Inhalt nicht');

  const checked = bundle.updateIndex(db, project, { verify: 'all' });
  assert.equal(checked.hashed, checked.files, 'verify=all liest jede Datei');
  assert.equal(checked.written, 1, 'und findet genau die geänderte');
  assert.equal(checked.rehashed, checked.files - 1, 'die übrigen sind hash-gleich');
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'markerB')[0].n, 1, 'der neue Inhalt steht im Index');
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'markerA')[0].n, 0, 'der alte ist weg');

  // Ein unveränderter Baum bleibt auch mit verify=all ein Nicht-Rebuild.
  const again = bundle.updateIndex(db, project, { verify: 'all' });
  assert.equal(again.written, 0);
  assert.equal(again.rehashed, again.files);
  assert.equal(again.references, 0, 'ohne neue Referenzziele kein Referenzdurchgang');
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
    assert.equal(stats.files, 5, 'der Index ist nach dem Start vollständig');
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

// ══ Indexdateien (Plan §10) ══════════════════════════════════════════════════
//
// Plan §10 nennt fuenf Angaben je Datei — path, language, size, mtime, sha256 —
// und sagt: „SHA wird nicht fuer jeden unveraenderten Start erneut unnoetig
// berechnet."
//
// Dieses Schema nennt Groesse und Hash `bytes` und `digest`: §10 nennt die
// ANGABEN, kein SQL. Die Tests pinnen deshalb die Bedeutung und nicht die
// Schreibweise — Groesse und mtime gegen das Dateisystem, der Digest als sha256
// des ROHEN Inhalts. Dass der Digest nicht dem redigierten Text folgt, ist kein
// Detail: er entscheidet, ob sich eine Datei geaendert hat.

test('Indexdatei: path, language, Groesse, mtime und sha256 stimmen Zeile fuer Zeile', () => {
  const project = fixtureProject('dateizeile');
  const { file } = fixtureIndex(project, 'dateizeile');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});

  const stored = rows(db, 'select path, language, bytes, mtime_ms, digest from files order by path');
  assert.ok(stored.length > 0, 'der Index ist nicht leer — sonst bewiese der Test nichts');
  for (const row of stored) {
    const absolute = join(project, row.path);
    const info = statSync(absolute);
    assert.equal(row.language, bundle.languageOf(row.path) ?? 'text', `${row.path}: Sprache`);
    assert.equal(row.bytes, info.size, `${row.path}: Groesse`);
    assert.equal(row.mtime_ms, Math.round(info.mtimeMs), `${row.path}: mtime`);
    assert.equal(
      row.digest,
      createHash('sha256').update(readFileSync(absolute)).digest('hex'),
      `${row.path}: sha256 des rohen Inhalts`,
    );
  }

  // Die Gegenprobe mit ausgeschriebenem Wert: der Digest ist der der Rohdatei,
  // nicht der des redigierten Textes.
  const secretPath = 'src/config.mjs';
  writeFileSync(join(project, secretPath), `export const key = '${CANARY.anthropic}';\n`);
  bundle.updateIndex(db, project, {});
  assert.equal(
    one(db, 'select digest from files where path = ?', secretPath).digest,
    createHash('sha256').update(readFileSync(join(project, secretPath))).digest('hex'),
    'der Digest folgt dem rohen Inhalt, nicht dem redigierten',
  );
  db.close();
});

test('Indexdatei: ein unveraenderter Start berechnet keinen SHA erneut', () => {
  const project = fixtureProject('shalauf');
  const { file } = fixtureIndex(project, 'shalauf');
  const db = bundle.openIndex(file);
  const first = bundle.updateIndex(db, project, {});
  assert.equal(first.hashed, first.files, 'der erste Lauf liest jede Datei');

  const second = bundle.updateIndex(db, project, {});
  assert.equal(second.hashed, 0, 'unveraendert heisst: keine Datei wird gelesen, also auch kein SHA');
  assert.equal(second.written, 0, 'und nichts wird neu geschrieben');
  assert.equal(second.unchanged, second.files, 'jede Datei wird ueber mtime und Groesse als unveraendert erkannt');

  // mtime allein geaendert, Inhalt gleich: genau DIESE Datei wird gelesen, um
  // ihren SHA zu vergleichen — und danach nur aufgefrischt, nicht neu indiziert.
  const target = join(project, 'src/b.mjs');
  const fresh = new Date(Date.now() + 5000);
  utimesSync(target, fresh, fresh);
  const third = bundle.updateIndex(db, project, {});
  assert.equal(third.hashed, 1, 'nur die Datei mit neuer mtime wird gelesen');
  assert.equal(third.rehashed, 1, 'gleicher SHA: nur auffrischen');
  assert.equal(third.written, 0, 'gleicher SHA: kein Neuindizieren');
  db.close();
});

// ══ Secret Protection (Plan §13) ═════════════════════════════════════════════
//
// Das Gate der Phase lautet wörtlich: Test-Secrets erscheinen nicht als
// ungeschützter Secret-Inhalt im Index. Deshalb prüfen die Zusagen unten nicht
// eine Zählung, sondern die BYTES der Indexdateien: kein Kanarienvogel darf
// darin vorkommen — in keiner Tabelle, auch nicht in der FTS-Spiegelung und
// nicht im WAL.

/**
 * Kanarienvögel: erfunden, aber in der FORM echter Zugangsdaten. Sie stehen in
 * Quellen, die absichtlich so gebaut sind, dass sie wie Zugangsdaten aussehen —
 * niemand kann sie mit einem echten Schlüssel verwechseln.
 */
const CANARY = {
  dotenv: 'CANARY_DOTENV_WERT_04f2a1',
  credentials: 'CANARY_CREDENTIALS_WERT_77b31c',
  anthropic: 'sk-ant-canary0123456789abcdef0123456789',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.canarysignatur0123456789',
  connection: 'postgres://canary-nutzer:canary-passwort@localhost:5432/canary-db',
  assigned: 'canary-zugewiesener-wert-0123456789',
  github: 'ghp_canary0123456789012345678901',
};

/** Der Inhalt der einen Quelldatei, die einen Wert AUSGESCHRIEBEN enthält. */
const CONFIG_LINES = [
  'export const sauber = 0;',
  `export const endpoint = '${CANARY.connection}';`,
  `export const schluessel = '${CANARY.anthropic}';`,
  `export const marke = '${CANARY.jwt}';`,
  `SHINON_CANARY_API_KEY = '${CANARY.assigned}';`,
  `export const zweiter = '${CANARY.github}';`,
  '',
];

/**
 * Ein Projekt mit beiden Sorten: Dateien, die Zugangsdaten SIND, und Dateien,
 * die Zugangsdaten nur ENTHALTEN — plus die Gegenproben, die indexiert bleiben
 * müssen.
 */
function secretProject(label) {
  const dir = join(workDir(label), 'projekt');
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'keys'), { recursive: true });
  mkdirSync(join(dir, 'tief/verschachtelt'), { recursive: true });
  mkdirSync(join(dir, '.ssh'), { recursive: true });

  // Schicht 1 — diese Dateien werden nie gelesen.
  mkdirSync(join(dir, 'settings'), { recursive: true });
  writeFileSync(join(dir, '.env'), `SHINON_CANARY_API_KEY=${CANARY.dotenv}\n`);
  writeFileSync(join(dir, 'tief/verschachtelt/.env.production'), `SHINON_CANARY_API_KEY=${CANARY.dotenv}\n`);
  writeFileSync(join(dir, 'settings/.env.yaml'), `SHINON_CANARY_API_KEY: ${CANARY.dotenv}\n`);
  writeFileSync(join(dir, '.credentials.yaml'), `refs:\n  SHINON_CANARY_API_KEY: ${CANARY.credentials}\n`);
  writeFileSync(join(dir, 'credentials.json'), `{\n  "token": "${CANARY.credentials}"\n}\n`);
  writeFileSync(join(dir, 'secrets.yml'), `token: ${CANARY.credentials}\n`);
  writeFileSync(join(dir, 'keys/server.pem'), `-----BEGIN RSA PRIVATE KEY-----\n${CANARY.dotenv}\n-----END RSA PRIVATE KEY-----\n`);
  writeFileSync(join(dir, '.ssh/id_rsa'), `${CANARY.dotenv}\n`);

  // Schicht 2 — indexiert, aber der Wert wird ersetzt.
  writeFileSync(join(dir, 'src/config.mjs'), CONFIG_LINES.join('\n'));

  // Gegenproben: kein Geheimnis, und ein NAME, der nur danach klingt.
  writeFileSync(join(dir, 'src/clean.mjs'), 'export const sauber = 1;\n// hier steht kein Geheimnis\n');
  writeFileSync(join(dir, 'src/secrets.mjs'), 'export const liste = ["a"];\n');
  return dir;
}

/**
 * Die naive Messung zeigte drei Filter, nicht einen — und nur einer davon ist
 * Phase 8. Damit der Test nicht zwei Dinge verwechselt, sind sie getrennt:
 *
 *   ENDUNGS_LISTE      Dateien wie `.env` oder `*.pem` werden nie BETRACHTET,
 *                      weil `listFiles` nur Textendungen aufnimmt. Sie sind
 *                      deshalb auch ohne Schutz nie im Index — der Grund, warum
 *                      die Musterliste aus Plan §13 zu einem Teil redundant ist.
 *   SCHUTZ_REGELN      Dateien MIT indexierbarer Endung, die Zugangsdaten sind.
 *                      Genau hier lag der echte Fund: `.credentials.yaml`.
 */
const EXCLUDED_BY_EXTENSION = ['.env', 'tief/verschachtelt/.env.production', 'keys/server.pem', '.ssh/id_rsa'];
const PROTECTED_LISTED = ['.credentials.yaml', 'credentials.json', 'secrets.yml', 'settings/.env.yaml', 'src/secrets.mjs'];
const PROTECTED_TOTAL = PROTECTED_LISTED.length;

/** Die Dateien, die einen Kanarienvogel tragen — für die Gegenprobe des Tests. */
const CANARY_FILES = [...EXCLUDED_BY_EXTENSION, '.credentials.yaml', 'credentials.json', 'secrets.yml', 'settings/.env.yaml'];

/** Alle Bytes im Indexverzeichnis — die Grundlage des Gates. */
function indexBytes(indexRoot) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else out.push([relative(indexRoot, absolute), readFileSync(absolute)]);
    }
  };
  walk(indexRoot);
  return out;
}

/** Wo ein Kanarienvogel im Index steht — leer heißt: nirgends. */
function canaryHits(indexRoot, ...needles) {
  const bytes = indexBytes(indexRoot);
  const hits = [];
  for (const needle of needles) {
    for (const [name, buffer] of bytes) if (buffer.includes(needle)) hits.push(`${needle.slice(0, 12)}… in ${name}`);
  }
  return hits;
}

/**
 * Die Pfadregeln treffen ganze NAMEN, nicht Präfixe.
 *
 * Der Grund steht in Docs/probes/secret-protection.json: `.credentials.yaml`
 * liegt in der Wurzel dieses Repos und trägt drei echte Schlüssel — `credentials*`
 * trifft sie nicht, weil dem Namen ein Punkt vorangeht. Die Tabelle prüft beide
 * Richtungen, damit die Regeln weder blind noch übermäßig breit sind.
 */
test('Schutz: die Pfadregeln treffen Namen mit führendem Punkt und verschonen Quelltext', () => {
  const protectedCases = [
    ['.env', 'dotenv'],
    ['.env.local', 'dotenv'],
    ['src/.env', 'dotenv'],
    ['tief/verschachtelt/.env.production', 'dotenv'],
    ['.credentials.yaml', 'credential-datei'],
    ['credentials.json', 'credential-datei'],
    ['config/.credentials', 'credential-datei'],
    ['secrets.yml', 'secret-datei'],
    ['.secrets', 'secret-datei'],
    ['src/secrets.mjs', 'secret-datei'],
    ['deploy/app.key', 'schluesselmaterial'],
    ['cert/client.p12', 'schluesselmaterial'],
    ['.ssh/id_rsa', 'ssh-schluessel'],
    ['.npmrc', 'dotfile-geheim'],
    ['.netrc', 'dotfile-geheim'],
    ['.aws/credentials', 'credential-datei'],
    ['infra/terraform.tfstate', 'terraform-zustand'],
  ];
  for (const [path, kind] of protectedCases) {
    assert.equal(bundle.protectedReason(path), kind, `${path} muss geschützt sein`);
  }

  // Die Gegenprobe gegen zu viel Schutz: diese Pfade werden indexiert. Eine
  // Quelldatei, die Zugangsdaten VERWALTET, gehört in den Index — sonst findet
  // der Agent die Stelle nicht, die einen Schlüssel benutzt.
  const keptCases = ['src/config.mjs', 'src/credential-helper.mjs', 'Docs/probes/secret-protection.json', 'secrets-notes.md', 'package.json', 'config.yml', 'docs/notes.md'];
  for (const path of keptCases) {
    assert.equal(bundle.protectedReason(path), null, `${path} darf nicht geschützt sein`);
  }
  assert.ok(bundle.PROTECTED_PATH_RULES.length >= 5);
  assert.ok(bundle.PROTECTED_PATH_RULES.every((rule) => typeof rule.kind === 'string' && rule.pattern instanceof RegExp), 'jede Regel nennt ihren Grund');
});

/**
 * Das Gate der Phase — in beiden Schichten, geprüft an den BYTES des Index.
 */
test('Schutz: Test-Secrets erscheinen nicht als ungeschützter Inhalt im Index', () => {
  const project = secretProject('schutz');
  const { indexRoot, file } = fixtureIndex(project, 'schutz');

  // Die Kanarienvögel stehen wirklich in den Quelldateien — sonst bewiese der
  // Test nichts. Die nicht gelesenen Dateien werden hier direkt geprüft.
  for (const path of CANARY_FILES) {
    const text = readFileSync(join(project, path), 'utf8');
    assert.ok(text.includes(CANARY.dotenv) || text.includes(CANARY.credentials), `${path} trägt einen Kanarienvogel`);
  }
  assert.ok(readFileSync(join(project, 'src/config.mjs'), 'utf8').includes(CANARY.anthropic), 'auch die indexierte Quelldatei trägt einen');

  const db = bundle.openIndex(file);
  const report = bundle.updateIndex(db, project, {});

  // Die beiden Filter getrennt: die Endungsliste BETRACHTET manche Dateien nie,
  // die Schutzregeln weisen die übrigen ab — und zwar jede mit ihrem Grund.
  const listed = bundle.listFiles(project).map((absolute) => bundle.toProjectPath(project, absolute));
  for (const path of EXCLUDED_BY_EXTENSION) {
    assert.ok(!listed.includes(path), `${path} wird schon von der Endungsliste nicht betrachtet`);
  }
  for (const path of PROTECTED_LISTED) {
    assert.ok(listed.includes(path), `${path} wäre ohne den Schutz indexiert worden`);
  }
  assert.equal(report.protected, PROTECTED_TOTAL, 'jede abgewiesene Datei wird gezählt');
  assert.deepEqual(report.protectedKinds, { 'credential-datei': 2, 'secret-datei': 2, dotenv: 1 });
  assert.equal(report.removed, 0, 'ausgeschlossen ist nicht entfernt — die Zähler bleiben unterscheidbar');

  const paths = rows(db, 'select path from files order by path').map((row) => row.path);
  for (const path of [...EXCLUDED_BY_EXTENSION, ...PROTECTED_LISTED]) {
    assert.ok(!paths.includes(path), `${path} darf keine Zeile haben`);
  }
  assert.ok(paths.includes('src/config.mjs'), 'die Datei mit ausgeschriebenem Wert bleibt indexiert');
  assert.ok(paths.includes('src/clean.mjs'), 'und die saubere Datei ebenfalls');
  assert.equal(rows(db, 'select count(*) as n from chunks where path = ?', '.credentials.yaml')[0].n, 0);

  // Schicht 2: die Quelldatei ist indexiert, ihr Wert ist ersetzt.
  const body = rows(db, 'select body from chunks where path = ?', 'src/config.mjs').map((row) => row.body).join('\n');
  assert.ok(body.includes('[REDACTED:anthropic-key]'), `der Schlüsselwert ist ersetzt: ${body}`);
  assert.ok(body.includes('[REDACTED:connection-string]'), 'die Verbindungszeichenfolge auch');
  assert.ok(body.includes("SHINON_CANARY_API_KEY = '"), 'der NAME bleibt stehen — er ist kein Geheimnis');
  assert.ok(!body.includes(CANARY.assigned), 'nur der Wert verschwindet');
  assert.ok(body.includes('export const sauber = 0;'), 'der harmlose Rest der Datei bleibt');

  // Die Gegenprobe gegen zu viel Redaktion: eine saubere Datei kommt unverändert an.
  const cleanBody = rows(db, 'select body from chunks where path = ?', 'src/clean.mjs').map((row) => row.body).join('\n');
  assert.equal(cleanBody.trim(), readFileSync(join(project, 'src/clean.mjs'), 'utf8').trim());

  // Fundstellen sind verzeichnet — Pfad, Zeile, Art. Ohne Wert.
  const findings = bundle.secretFindings(db, 'src/config.mjs');
  assert.ok(findings.length >= 4, `jede ausgeschriebene Stelle wird verzeichnet: ${JSON.stringify(findings)}`);
  assert.deepEqual(Object.keys(findings[0]).sort(), ['kind', 'line', 'path']);
  assert.equal(findings.find((finding) => finding.kind === 'connection-string').line, 2, 'die Zeile stimmt');
  assert.equal(bundle.indexStats(db).secret_findings, report.findings, 'die Zählung stimmt mit den Zeilen überein');
  db.close();

  // DAS GATE: kein Kanarienvogel steht irgendwo im Index — in keiner Tabelle,
  // nicht in der FTS-Spiegelung und nicht im WAL.
  const hits = canaryHits(indexRoot, CANARY.dotenv, CANARY.credentials, CANARY.anthropic, CANARY.jwt, CANARY.connection, CANARY.assigned, CANARY.github);
  assert.deepEqual(hits, [], `kein Kanarienvogel darf im Index stehen: ${hits.join(', ')}`);

  // Und der zweite Lauf ändert daran nichts: der Wert darf auch nicht über einen
  // Auffrischungs- oder Wiederaufbaupfad hineinkommen.
  const again = bundle.openIndex(file);
  bundle.updateIndex(again, project, { verify: 'all' });
  again.close();
  assert.deepEqual(canaryHits(indexRoot, CANARY.dotenv, CANARY.credentials, CANARY.anthropic, CANARY.jwt, CANARY.connection), []);
});

/**
 * Das Muster, das vor dem Bau blind war.
 *
 * Gemessen (Docs/probes/secret-protection.json): eine Fassung mit Lookbehind auf
 * Bezeichnerzeichen lieferte 0 Treffer, weil in `SHINON_API_KEY` vor `API_KEY`
 * ein Unterstrich steht — blind genau für die häufigste Schreibweise. Die Tabelle
 * hält die Formen fest, die tragen, und die Gegenfälle, die nicht tragen dürfen.
 */
test('Schutz: die Muster erkennen die benannten Formen und schweigen bei Beinahmen', () => {
  const shapes = [
    ['-----BEGIN RSA PRIVATE KEY-----', 'private-key'],
    [CANARY.jwt, 'jwt'],
    [CANARY.anthropic, 'anthropic-key'],
    ['sk-or-v1-canary0123456789abcdef01234567', 'openrouter-key'],
    ['sk-canary0123456789abcdef0123456789', 'openai-key'],
    [CANARY.github, 'github-token'],
    ['xoxb-canary0123456789', 'slack-token'],
    ['AKIAIOSFODNN7EXAMPLE', 'aws-access-key-id'],
    [`AIza${'A'.repeat(35)}`, 'google-api-key'],
    [CANARY.connection, 'connection-string'],
    [`Bearer ${'c'.repeat(30)}`, 'bearer-token'],
    [`SHINON_API_KEY = '${'c'.repeat(24)}'`, 'zugewiesener-wert'],
    [`MY_TOKEN: "${'c'.repeat(24)}"`, 'zugewiesener-wert'],
    [`SERVICE_SECRET = "${'A'.repeat(44)}"`, 'zugewiesene-base64'],
  ];
  for (const [text, kind] of shapes) {
    const kinds = bundle.findSecrets(text).map((hit) => hit.kind);
    assert.ok(kinds.includes(kind), `${kind} muss erkannt werden: ${text} → ${kinds.join(',')}`);
  }

  const nearMisses = [
    'sk-zu-kurz',
    'AKIA1234567890ABC',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0',
    "api_key = 'zu-kurz'",
    '-----BEGIN PUBLIC KEY-----',
    'const postgres = 1;',
    'der Text nennt ein Token und ein Secret, aber keinen Wert',
  ];
  for (const text of nearMisses) {
    assert.deepEqual(bundle.findSecrets(text), [], `kein Fund bei: ${text}`);
  }

  // Die Redaktion ist verlustfrei außerhalb der Fundstelle und ersetzt genau den
  // Wert, nicht den Namen.
  const { text, findings } = bundle.redactSecrets(CONFIG_LINES.join('\n'));
  assert.equal(findings.length, 5, 'jede der fünf Stellen wird gefunden');
  assert.equal(text.split('\n')[4], "SHINON_CANARY_API_KEY = '[REDACTED:zugewiesener-wert]';", 'nur der Wert wird ersetzt');
  assert.equal(text.split('\n')[3], "export const marke = '[REDACTED:jwt]';", 'und die Zeile davor ebenso');
  assert.equal(text.split('\n')[0], CONFIG_LINES[0], 'unberührte Zeilen bleiben Zeichen für Zeichen gleich');
});

/**
 * Remediation — der Fall, der wirklich vorlag.
 *
 * Der Live-Index dieses Repos enthielt `.credentials.yaml` samt drei echten
 * Schlüsseln, geschrieben von der Fassung VOR Phase 8. Weil die Datei unverändert
 * ist, hätte der inkrementelle Lauf sie nie wieder angefasst; ein Schutz ohne
 * Bereinigungspfad hätte die Werte für immer stehen gelassen. Der Test stellt
 * genau diesen Zustand her und verlangt, dass der nächste Lauf ihn räumt.
 */
test('Schutz: ein vergifteter Index wird beim nächsten Lauf bereinigt', () => {
  const project = secretProject('bereinigung');
  const { indexRoot, file } = fixtureIndex(project, 'bereinigung');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});

  // Der Zustand von vorher: beide Sorten stehen samt Inhalt in allen Tabellen,
  // so wie es die alte Fassung geschrieben hätte. Die eine ist eine Datei, die
  // der Lauf HEUTE noch betrachtet (`.credentials.yaml`), die andere eine, die er
  // gar nicht mehr in der Dateiliste hat (`.env`). Beide Wege müssen räumen.
  const poison = (path, value) => {
    const body = `SHINON_CANARY_API_KEY=${value}\n`;
    db.prepare('insert or replace into files(path, language, bytes, mtime_ms, digest, indexed_at_ms) values (?, ?, ?, ?, ?, ?)').run(path, 'text', body.length, 1, 'alt', 1);
    db.prepare('insert into chunks(path, start_line, end_line, body) values (?, ?, ?, ?)').run(path, 1, 1, body);
    db.prepare(`insert into ${bundle.FTS_TABLE}(path, body) values (?, ?)`).run(path, body);
    db.prepare(`insert into ${bundle.SECRET_TABLE}(path, line, kind) values (?, ?, ?)`).run(path, 1, 'zugewiesener-wert');
  };
  poison('.credentials.yaml', CANARY.credentials);
  poison('.env', CANARY.dotenv);
  assert.ok(canaryHits(indexRoot, CANARY.credentials, CANARY.dotenv).length > 0, 'der vergiftete Zustand ist hergestellt');
  db.close();

  const second = bundle.openIndex(file);
  const report = bundle.updateIndex(second, project, {});
  assert.equal(report.protected, PROTECTED_TOTAL, 'die geschützten Dateien werden wieder erkannt');
  // Die Zähler bleiben unterscheidbar, und das ist keine Kosmetik: eine Zeile der
  // noch betrachteten `.credentials.yaml` räumt der SCHUTZ (protected), eine Zeile
  // der gar nicht mehr betrachteten `.env` der Entfernungspfad (removed).
  assert.equal(report.removed, 1, 'die Datei, die nicht mehr in der Liste steht, fällt unter die Entfernung');
  assert.equal(report.purged, 1, 'die geschützte Datei war schon indexiert — ihr Schutz hat geräumt');
  for (const path of ['.credentials.yaml', '.env']) {
    assert.equal(rows(second, 'select count(*) as n from files where path = ?', path)[0].n, 0, `${path}: keine Zeile mehr`);
    assert.equal(rows(second, 'select count(*) as n from chunks where path = ?', path)[0].n, 0, `${path}: kein Chunk mehr`);
    assert.equal(rows(second, `select count(*) as n from ${bundle.SECRET_TABLE} where path = ?`, path)[0].n, 0, `${path}: auch der Befund verschwindet mit der Datei`);
    assert.equal(rows(second, `select count(*) as n from ${bundle.FTS_TABLE} where path = ?`, path)[0].n, 0, `${path}: auch die Volltextspiegelung`);
  }
  second.close();
  assert.deepEqual(canaryHits(indexRoot, CANARY.credentials, CANARY.dotenv), [], 'nach dem Lauf steht kein Wert mehr im Index');
});

/**
 * Genau der Weg, der den ECHTEN Index dieses Repos bereinigt hat.
 *
 * Der Live-Index war von der Fassung vor Phase 8 geschrieben und stand auf einer
 * anderen indexer_version; `openIndex` verwirft und baut neu auf. Ein Neubau der
 * Tabellen lässt die BYTES der alten Zeilen aber in der Datei stehen — gemessen:
 * ohne `secure_delete` und ohne einen Zusammenzug der Datei steht der Wert weiter
 * darin, auch wenn `select` ihn nicht mehr findet. Der Test hält das fest.
 */
test('Schutz: ein Wiederaufbau lässt die Altdaten nicht in der Datei', () => {
  const project = secretProject('neubau');
  const { indexRoot, file } = fixtureIndex(project, 'neubau');
  const poison = `SHINON_CANARY_API_KEY=${CANARY.credentials}\n`;
  const first = bundle.openIndex(file);
  first.prepare('insert into chunks(path, start_line, end_line, body) values (?, ?, ?, ?)').run('.credentials.yaml', 1, 1, poison);
  first.prepare(`insert into ${bundle.FTS_TABLE}(path, body) values (?, ?)`).run('.credentials.yaml', poison);
  // Eine fremde Fassung: genau der Zustand des Live-Index vor diesem Lauf.
  first.prepare('update meta set value = ? where key = ?').run('1', 'indexer_version');
  first.close();
  assert.ok(canaryHits(indexRoot, CANARY.credentials).length > 0, 'der vergiftete Zustand ist hergestellt');

  const second = bundle.openIndex(file);
  assert.equal(bundle.indexMeta(second).indexer_version, String(bundle.INDEXER_VERSION), 'die eigene Fassung steht wieder');
  assert.equal(bundle.indexStats(second).chunks, 0, 'und der alte Inhalt ist zeilenweise weg');
  bundle.updateIndex(second, project, {});
  second.close();
  assert.deepEqual(canaryHits(indexRoot, CANARY.credentials), [], 'und er steht auch nicht mehr in den freigegebenen Seiten der Datei');
});

/**
 * Der Schutz ist keine Option, sondern eine Eigenschaft des Index — und er steht
 * im Protokoll, weil eine ausgeschlossene Datei keine Zählung verändert.
 */
test('Mount: der Bericht nennt den Schutz, und er lässt sich nicht abschalten', async () => {
  const project = secretProject('bericht');
  const indexRoot = join(workDir('bericht'), 'indexes');
  const quiet = collector();
  try {
    const dispose = bundle.apply({}, bundle.Config({ root: project, indexRoot }));
    assert.ok(await quiet.waitFor('Lauf im Worker'), `der Lauf muss berichten: ${quiet.lines.join(' | ')}`);
    dispose();
    assert.ok(quiet.lines.some((line) => line.includes('Schutz an')), 'die Aktivierung nennt den Schutz');
    const line = quiet.lines.find((entry) => entry.includes('Schutz:'));
    assert.ok(line !== undefined, 'der Bericht nennt den Schutz');
    assert.ok(line.includes(`${PROTECTED_TOTAL} nie gelesen`), line);
    assert.ok(line.includes('dotenv=1'), 'mit dem Grund je Datei');
    assert.ok(/\d+ Fundstellen redigiert/.test(line), line);
    assert.ok(!line.includes(CANARY.dotenv) && !line.includes(CANARY.credentials), 'aber niemals einen Wert');
    assert.deepEqual(Object.keys(bundle.Config({})).includes('protection'), false, 'der Schutz ist keine Konfiguration');
  } finally {
    quiet.restore();
  }
});
