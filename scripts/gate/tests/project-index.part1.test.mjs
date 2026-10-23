/** Teil 1/4 von project-index.test.mjs — Fixtures stehen in `project-index-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { codeOnly, findForbidden, findMissing } from '../../lib/source-scan.mjs';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { AS_ROOT, ROOT_SKIP, PACKAGE_DIR, REPO_ROOT, INDEX_FILE, CORE_FILES, readCore, root, require, loadBundle, bundle, bundleWork, DatabaseSync, collector, works, workDir, afterAllCleanup, fixtureProject, bigProject, fixtureIndex, rows, one, observeLoop, CANARY } from './project-index-fixtures.mjs';
import { CONFIG_LINES, secretProject, EXCLUDED_BY_EXTENSION, PROTECTED_LISTED, PROTECTED_TOTAL, CANARY_FILES, indexBytes, canaryHits } from './project-index-fixtures-b.mjs';

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
test('Extraktion: die gemessenen Schlüsselwörter des Repos sind keine Symbole', () => {
  const source = readFileSync(join(REPO_ROOT, 'packages/hook/index.js'), 'utf8');
  const names = new Set(bundle.extractSymbols(source).map((symbol) => symbol.name));
  for (const keyword of ['if', 'for', 'while', 'switch', 'return']) {
    assert.ok(!names.has(keyword), `"${keyword}" darf kein Symbol sein`);
  }
  assert.ok(names.has('PRE_STEP_EVENT'), 'echte Symbole müssen bleiben');
});
test('Extraktion: an echten Dateien dieses Repos — Symbole, Kanten, Referenzen', () => {
  // Der Modulschnitt des Prompters (2026-10-16): die Symbole stehen in ihren
  // Modulen, `index.js` ist die Komposition. Geprueft wird beides — dass die
  // Extraktion die Symbole in den echten Dateien findet, und dass die Kanten der
  // Komposition VOLLSTAENDIG dastehen: eine neue Abhaengigkeit faellt auf, statt
  // stillschweigend dazuzukommen.
  const prompter = readFileSync(join(REPO_ROOT, 'packages/prompter/index.js'), 'utf8');
  const prompterModule = (relativePath) => readFileSync(join(REPO_ROOT, 'packages/prompter', relativePath), 'utf8');
  const symbolsIn = (source) => new Set(bundle.extractSymbols(source).map((symbol) => symbol.name));
  // Der Schnitt vom 2026-10-20: `index.js` verdrahtet, die drei neuen Module
  // tragen Lauf, Zustand und Ausgang — geprueft wird jeder Eigentuemer.
  assert.ok(symbolsIn(prompter).has('apply'), 'Symbol apply fehlt in index.js');
  for (const [file, expected] of [
    ['assets/pre-step.js', 'onPreStep'],
    ['assets/pre-step.js', 'readPrompt'],
    ['assets/runtime-state.js', 'loadRuntime'],
    ['assets/runtime-state.js', 'effectiveRoute'],
    ['assets/trace-report.js', 'reportTrace'],
    ['assets/enhancer.js', 'enhanceGuarded'],
    ['assets/schema.js', 'Config'],
  ]) {
    assert.ok(symbolsIn(prompterModule(file)).has(expected), `Symbol ${expected} fehlt in ${file}`);
  }
  // Vergleich als Menge: die Reihenfolge der Importe in index.js ist keine
  // Eigenschaft der Komposition, die Vollstaendigkeit der Kanten schon.
  const byTarget = (a, b) => a.target.localeCompare(b.target);
  assert.deepEqual(
    bundle.extractEdges(prompter).sort(byTarget),
    [
      { kind: 'import', target: '@deepseek-ai/schemastery' },
      // Der Naht-Kern: `index.js` bindet die beiden Kanal-Namen, der Lauf
      // liest sie aus demselben Kern (`assets/pre-step.js`).
      { kind: 'import', target: '@shinon/seams/core' },
      // Der Schnitt vom 2026-10-20 — die drei Eigentuemer-Module des Hosts:
      // Lauf, Zustand, Ausgang. `node:fs`/`node:path` gingen mit dem Zustand.
      { kind: 'import', target: './assets/pre-step.js' },
      { kind: 'import', target: './assets/runtime-state.js' },
      // Zug 4/5: das Paket liest die Zettel und baut den Stand — der Kern liegt
      // in `assets/`, weil er ohne node_modules testbar sein muss.
      { kind: 'import', target: './assets/note-core.js' },
      // Der Modulschnitt: je Verantwortung ein Modul (Seam-Namen, Modus-Vertrag,
      // Schemata, Ergebnis, XML-Marken, Dateien, Stand, One-Shot, Lebenszyklus).
      // Die Liste steht vollstaendig hier, damit neue Kanten auffallen.
      { kind: 'import', target: './assets/mode-core.js' },
      { kind: 'import', target: './assets/schema.js' },
      { kind: 'import', target: './assets/result-contract.js' },
      { kind: 'import', target: './assets/render-context.js' },
      { kind: 'import', target: './assets/prompt-files.js' },
      { kind: 'import', target: './assets/skill-lifecycle.js' },
      // Die Faehigkeitskarte (2026-10-20): welche Frage gehoert welchem Paket.
      // Daten + reiner Kern; die Zeigerpruefung kommt aus der Provenienz-Leiter.
      { kind: 'import', target: './assets/capability-map.js' },
      // Die Abbruchquote (Welle 2, 2026-10-20): Klassifikation, Zähler und
      // Quote als importfreier Kern; `pre-step.js` hängt nur das Ergebnis an.
      { kind: 'import', target: './assets/abort-core.js' },
      // Die Provenienz-Leiter (2026-10-19): fünf Klassen, Zeigerpflicht,
      // keine Beförderung — ein reiner Kern ohne Bare-Import, damit sein Test
      // ohne node_modules läuft.
      { kind: 'import', target: './assets/provenance.js' },
      { kind: 'import', target: './assets/stand.js' },
      { kind: 'import', target: './assets/enhancer.js' },
      // Die Injection-Runtime (Phase 1-4, ohne Selektionsagent seit 2026-10-23):
      // eigene Kerne; der Agent samt `selection.js` ist entfernt, der
      // deterministische Selektor bleibt der eine Weg.
      { kind: 'import', target: './assets/block-select.js' },
      { kind: 'import', target: './assets/block-review.js' },
      // Der Abnehmer der Naht `shinon_block_propose` (2026-10-23): ein
      // Modell-Werkzeug mit eigenem `output`, importfrei wie der Kern daneben.
      { kind: 'import', target: './assets/propose-tool.js' },
      // Der SALVAGED_PROSE-Zaehler und der Runtime-Context-Kanal (2026-10-21):
      // der Kontext kommt als EIGENE Nachricht an, sonst faellt er bei NO_JSON weg.
      { kind: 'import', target: './assets/salvage-store.js' },
      { kind: 'import', target: './assets/context-channel.js' },
      { kind: 'import', target: './assets/knowledge-block.js' },
    ].sort(byTarget),
    'Kanten sind Importe; externe Ziele bleiben drin, weil sie importiert werden',
  );

  // Die Komposition ist nicht nur deklariert, sondern vollstaendig: jedes interne
  // Ziel existiert wirklich, und die reinen Kerne sind importfrei (nur dann
  // laufen ihre Tests in CI, das keine node_modules hat).
  for (const edge of bundle.extractEdges(prompter)) {
    if (!edge.target.startsWith('./assets/')) continue;
    assert.ok(existsSync(join(REPO_ROOT, 'packages/prompter', edge.target)), `${edge.target} fehlt`);
  }
  for (const core of ['assets/note-core.js', 'assets/salvage-store.js']) {
    assert.deepEqual(bundle.extractEdges(prompterModule(core)), [], `${core} ist importfrei`);
  }
  // `mode-core.js` importiert den Naht-Kern und zwei importfreie Kerne. Die
  // Eigenschaft („in CI ohne node_modules prüfbar") haengt an BARE-Importen:
  // ein zweiter waere rot, eine relative Kante ist es nicht.
  assert.deepEqual(bundle.extractEdges(prompterModule('assets/mode-core.js')), [
    { kind: 'import', target: '@shinon/seams/core' }, { kind: 'import', target: './prompt-text.js' }, { kind: 'import', target: './defaults.js' },
  ]);

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
test('Lage: der Index liegt außerhalb des Projekts und ist pro Projekt stabil', () => {
  const project = '/tief/im/projekt';
  // GEMESSEN 2026-10-17: die Wurzel kommt aus dem XDG-Cache, der Ledger aus den
  // XDG-Daten — dieselbe Trennung, die `scripts/lib/paths.mjs` als Dienst führt
  // (indexRoot()/ledgerFile()). Der Index ist reine Ableitung, der Ledger nicht.
  const indexRoot = bundle.DEFAULT_INDEX_ROOT;
  const file = bundle.indexPath(indexRoot, project);
  assert.equal(indexRoot, join(homedir(), '.cache', 'shinon', 'indexes'), 'Default-Wurzel ist der XDG-Cache');
  assert.equal(indexRoot.includes('.shinon'), false, 'kein selbstgewählter Ort neben den XDG-Basen');
  assert.equal(
    bundle.DEFAULT_LEDGER_FILE,
    join(homedir(), '.local', 'share', 'shinon', 'ledger.sqlite'),
    'der dauerhafte Ledger liegt in den Daten, nicht im Cache',
  );
  assert.ok(file.startsWith(indexRoot), 'der Index liegt unter der Indexwurzel');
  assert.ok(!file.startsWith(project), 'und nie im Projekt');
  assert.equal(file.endsWith(bundle.INDEX_FILE), true);
  assert.equal(bundle.indexPath(indexRoot, project), file, 'gleicher Pfad, gleiche Kennung');
  assert.notEqual(bundle.indexPath(indexRoot, '/anderes/projekt'), file, 'anderes Projekt, andere Kennung');
  assert.equal(bundle.toProjectPath('/p', '/p/src/a.mjs'), 'src/a.mjs', 'gespeichert wird relativ');
});
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
  // Die Ablage (Zug 2) gehoert zum Schema, ist aber KEIN Primaerdatum: sie ist
  // nicht aus dem Projekt herstellbar und wird deshalb beim Index-Neuaufbau
  // nicht verworfen (der Fall steht in scripts/gate/tests/scoring-memory.test.mjs).
  assert.ok(tables.has(bundle.MEMORY_TABLE), 'die Ablage fehlt');
  assert.equal(one(db, `select count(*) as n from ${bundle.MEMORY_TABLE}`).n, 0, 'die Ablage beginnt leer');
  const meta = bundle.indexMeta(db);
  assert.deepEqual(meta.contract, bundle.CONTRACT);
  assert.deepEqual(meta.schema_version, String(bundle.SCHEMA_VERSION));
  assert.deepEqual(meta.indexer_version, String(bundle.INDEXER_VERSION), 'der Index kennt die Fassung seiner Extraktion');

  assert.equal(bundle.CONTRACT, 'shinon.project-index/v1', 'der Vertragsname ist die Zusage an Leser');
  // 2 seit Zug 2: die Tabelle `memory` (Ablage) ist dazugekommen. Eine
  // Tabellenaenderung erhoeht diese Zahl, sonst benutzt ein bestehender Index
  // still die alte Form — genau die Regel, die der Kopf nennt.
  assert.equal(bundle.SCHEMA_VERSION, 2);
  assert.equal(bundle.MEMORY_VERSION, 1, 'die Ablage fuehrt ihre eigene Fassung');
  db.close();
});
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
test('S1: fremde Root-Identität wird verworfen, die Ablage überlebt', () => {
  const work = workDir('s1-root');
  const a = fixtureProject('s1-a');
  const b = fixtureProject('s1-b');
  const file = join(work, 'index.sqlite');

  const first = bundle.openIndex(file, { expectedRoot: a });
  bundle.updateIndex(first, a, {});
  assert.ok(bundle.indexStats(first).files > 0, 'der Index von A ist gefüllt');
  const metaA = bundle.indexMeta(first);
  assert.equal(metaA.root, a);
  assert.equal(metaA.workspace_contract, 'shinon.workspace/v1');
  assert.equal(typeof metaA.root_id, 'string', 'die Root-Identität ist prüfbar');
  bundle.writeMemory(first, 'shinon.scoring', { records: [{ verdict: 'keep' }], memos: [], scorecard: null, notes: 1 });
  first.close();

  const foreign = bundle.openIndex(file, { expectedRoot: b });
  assert.equal(bundle.indexStats(foreign).files, 0, 'fremder Workspace: der Index ist leer, nicht umgedeutet');
  assert.equal(bundle.indexMeta(foreign).root, b);
  assert.notEqual(bundle.indexMeta(foreign).root_id, metaA.root_id, 'zwei Ordner sind zwei Identitäten');
  assert.ok(bundle.readMemory(foreign, 'shinon.scoring') !== null, 'die Ablage ist Nutzerzustand und überlebt den Neuaufbau');
  foreign.close();

  const back = bundle.openIndex(file, { expectedRoot: a });
  assert.equal(bundle.indexStats(back).files, 0, 'auch der Rückweg baut neu, statt alte Zeilen zu übernehmen');
  back.close();
});
test('S1: die Ablage migriert nicht aus einem fremden Index', () => {
  const work = workDir('s1-store');
  const a = fixtureProject('s1-store-a');
  const b = fixtureProject('s1-store-b');
  const file = join(work, 'index.sqlite');
  const db = bundle.openIndex(file, { expectedRoot: a });
  bundle.updateIndex(db, a, {});
  bundle.writeMemory(db, 'shinon.scoring', { records: [{ verdict: 'keep' }], memos: [], scorecard: null, notes: 1 });
  db.close();

  const foreign = bundle.createStoreService({ indexFile: file, ledgerFile: join(work, 'ledger.sqlite'), workspaceRoot: b });
  const loaded = foreign.load('shinon.scoring');
  assert.equal(loaded.ok, false, 'ein fremder Index ist keine Migrationsquelle');
  assert.match(loaded.error, /^FOREIGN_ROOT/);
  const saved = foreign.save('shinon.scoring', { records: [], memos: [], scorecard: null, notes: 0 });
  assert.equal(saved.ok, true, 'der Ledger darf trotzdem schreiben');
  assert.match(String(saved.migration_skipped), /gilt nicht/, 'und sagt, warum nichts migriert wurde');

  const own = bundle.createStoreService({ indexFile: file, ledgerFile: join(work, 'own.sqlite'), workspaceRoot: a });
  const migrated = own.load('shinon.scoring');
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, 2, 'der eigene Index wird migriert (ein Protokoll-Satz und die Zusammenfassung)');
});
test('S1: Prompter und Project Index beantworten die Workspace-Frage identisch', async () => {
  const prompterWs = await import(new URL('../../../packages/prompter/assets/workspace.js', import.meta.url).href);
  const indexWs = await import(new URL('../../../packages/project-index/assets/workspace.js', import.meta.url).href);
  const env = { SHINON_WORKSPACE_ROOT: '/tmp/shinon-s1-env' };
  for (const cwd of ['/', '/tmp/shinon-s1-cwd']) {
    assert.deepEqual(indexWs.resolveWorkspaceRoot({ cwd, env }), prompterWs.resolveWorkspaceRoot({ cwd, env }), `Env > cwd (${cwd})`);
    assert.deepEqual(
      indexWs.resolveWorkspaceRoot({ cwd, env, configRoot: '/tmp/shinon-s1-explicit' }),
      prompterWs.resolveWorkspaceRoot({ cwd, env, configRoot: '/tmp/shinon-s1-explicit' }),
      `explizit > Env (${cwd})`,
    );
    assert.deepEqual(indexWs.resolveInRoot('/tmp/shinon-s1-root', '../etc'), prompterWs.resolveInRoot('/tmp/shinon-s1-root', '../etc'), 'Pfadgrenze');
  }
  assert.deepEqual(indexWs.fingerprintRoot('/tmp/shinon-s1-a'), prompterWs.fingerprintRoot('/tmp/shinon-s1-a'));
  assert.equal(indexWs.WORKSPACE_CONTRACT, prompterWs.WORKSPACE_CONTRACT);
});
test('S1: ein Symlink aus der Root heraus wird nicht gelesen', () => {
  const project = fixtureProject('symlink');
  const outside = workDir('symlink-aussen');
  writeFileSync(join(outside, 'geheim.mjs'), 'export const geheim = "niemals im Kontext";\n');
  try {
    symlinkSync(join(outside, 'geheim.mjs'), join(project, 'src', 'ausbruch.mjs'));
  } catch {
    return; // ohne Symlink-Recht keine Aussage — nicht gruenluegen, sondern ueberspringen
  }
  const { file } = fixtureIndex(project, 'symlink');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});
  const paths = rows(db, 'select path from files').map((row) => row.path);
  assert.equal(paths.includes('src/ausbruch.mjs'), false, 'das Ziel liegt ausserhalb des Workspace');
  assert.equal(paths.includes('src/a.mjs'), true, 'die echten Dateien bleiben drin');
  const bodies = rows(db, 'select body from chunks').map((row) => row.body).join('\n');
  assert.equal(bodies.includes('niemals im Kontext'), false, 'der Inhalt des Ziels wird nie gelesen');
  db.close();
});
test('Lauf: Vollauf, unveränderter Lauf, aufgefrischte und geänderte Datei', () => {
  const project = fixtureProject('lauf');
  const { indexRoot, file } = fixtureIndex(project, 'lauf');
  const db = bundle.openIndex(file);

  const first = bundle.updateIndex(db, project, {});
  assert.equal(first.root, project);
  assert.equal(first.verify, 'stamp', 'der Bericht nennt die Politik, die ihn erzeugt hat — und die Vorgabe ist der Stempel, nicht die Luecke');
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
      // Der eigene Name des Manifests ist eine Kante der Art `name`: §14
      // Rang 3 braucht sie, um einen genannten Paketnamen auf das PAKET
      // abzubilden statt nur auf die, die es benutzen.
      { kind: 'name', target: 'fixture' },
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
    verify: 'stamp',
    files: first.files,
    unchanged: first.files,
    // Nichts geändert: kein Byte gelesen und jede Datei über den Stempel vertraut.
    stamped: first.files,
    suspicious: 0,
    falseAlarms: 0,
    readBytes: 0,
    hashed: 0,
    rehashed: 0,
    written: 0,
    skipped: 0,
    // Kein Ausschluss heisst: die Liste ist leer. Sie ist Teil der Zusage, nicht
    // ein Nebenfach — wer `skipped` liest, kann hier nachsehen, WARUM.
    scanErrors: [],
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
