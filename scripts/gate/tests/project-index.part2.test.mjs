/** Teil 2/4 von project-index.test.mjs — Fixtures stehen in `project-index-fixtures.mjs`. */
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
  // Und der Ausschluss hat einen NAMEN: Pfad und Grund. Ohne diese zwei Angaben
  // sähe „1 übersprungen" genauso aus wie ein Rechtefehler — die Zahl allein
  // verschweigt, ob jemand entschieden hat oder etwas kaputt ist.
  assert.equal(report.scanErrors.length, 1);
  assert.equal(report.scanErrors[0].path, 'src/gross.mjs', 'der Befund nennt die Datei');
  assert.equal(report.scanErrors[0].reason, 'ZU_GROSS', 'und den Grund, nicht nur die Zahl');
  assert.match(report.scanErrors[0].detail, /^\d+>512$/, 'die Grenze steht dabei: gelesene Größe > erlaubte Größe');
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
    { kind: 'name', target: 'x' },
    { kind: 'dependency', target: 'a' },
    { kind: 'dependency', target: 'b' },
    { kind: 'dependency', target: 'c' },
  ]);
  assert.equal(bundle.extractEdges('{}', 'json').length, 0, 'ein Manifest ohne Namen hat keine Namenskante');
  const cases = [
    { name: 'kaputtes JSON', text: '{ "name": }', edges: [] },
    { name: 'Array', text: '[1, 2, 3]', edges: [] },
    { name: 'ohne Abhängigkeiten', text: '{"name":"x"}', edges: [{ kind: 'name', target: 'x' }] },
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
    verify: 'stamp',
    files: first.files,
    unchanged: first.files,
    stamped: first.files,
    suspicious: 0,
    falseAlarms: 0,
    readBytes: 0,
    hashed: 0,
    rehashed: 0,
    written: 0,
    skipped: 0,
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
  // `indexed_at_ms` und `updated_at_ms` sind Zeitstempel des Laufs; sie dürfen sich
  // ändern, ohne dass neu indiziert wurde — der Rest muss Zeile für Zeile gleich sein.
  const withoutStamps = (state) => ({ ...state, files: state.files.map(({ indexed_at_ms, ...rest }) => rest) });
  assert.deepEqual(withoutStamps(snapshot()), withoutStamps(before), 'kein Rebuild: jede Tabellenzeile ist unverändert');
  assert.ok(before.stats.symbols > 0 && before.stats.chunks > 0, 'der Schnappschuss ist nicht leer — sonst bewiese er nichts');
  db.close();
});
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
  const blind = bundle.updateIndex(db, project, { verify: 'changed' });
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
test('Zeitstempel: verify=stamp schliesst die Luecke, ohne den Baum zu lesen', () => {
  const project = fixtureProject('stamp-luecke');
  const { file } = fixtureIndex(project, 'stamp-luecke');
  const db = bundle.openIndex(file);

  const first = bundle.updateIndex(db, project, { verify: 'stamp' });
  assert.equal(first.verify, 'stamp', 'der Bericht nennt die Politik');
  assert.equal(first.hashed, first.files, 'der erste Lauf liest jede Datei');
  assert.ok(first.readBytes > 0, 'und zaehlt die gelesenen Bytes');

  // Nichts veraendert: der Stempel entscheidet, und es wird kein Byte gelesen.
  const quiet = bundle.updateIndex(db, project, { verify: 'stamp' });
  assert.equal(quiet.unchanged, quiet.files);
  assert.equal(quiet.stamped, quiet.files, 'jede Datei wird ueber den Stempel vertraut');
  assert.equal(quiet.suspicious, 0);
  assert.equal(quiet.hashed, 0);
  assert.equal(quiet.readBytes, 0, 'der stille Lauf kostet kein Byte');

  const target = join(project, 'src/marker.mjs');
  writeFileSync(target, 'export const markerA = 1;\n');
  bundle.updateIndex(db, project, { verify: 'stamp' });
  const stamp = statSync(target).mtime;

  // Gleiche Laenge, anderer Inhalt, mtime zurueckgesetzt: die klassischen Signale
  // sehen nichts, der Stempel muss greifen.
  writeFileSync(target, 'export const markerB = 1;\n');
  utimesSync(target, stamp, stamp);
  const storedRow = rows(db, 'select bytes, mtime_ms, stamp from files where path = ?', 'src/marker.mjs')[0];
  // ctime hat auf manchen Dateisystemen eine grobe Auflösung (in dieser
  // Umgebung gemessen: 4 ms). Fällt die Änderung in denselben Tick wie der
  // vorige Lauf, sieht der Stempel sie nicht — der Test wäre dann zeitabhängig
  // statt falsch (beobachtet: `suspicious` 0 statt 1 unter Volllast). Deshalb
  // wird gewartet, bis der Tick weiter ist und die Metadaten-Aenderung ihn
  // sichtbar macht. Die Pruefung selbst bleibt unveraendert streng.
  const previousCtime = storedRow.stamp.split(':')[4];
  const deadline = Date.now() + 500;
  while (String(statSync(target, { bigint: true }).ctimeNs) === previousCtime && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    utimesSync(target, stamp, stamp);
  }
  const nowInfo = statSync(target, { bigint: true });
  assert.equal(storedRow.bytes, Number(nowInfo.size), 'die Groesse ist gleich geblieben');
  assert.equal(storedRow.mtime_ms, Math.round(statSync(target).mtimeMs), 'und die mtime auf Millisekunden genau auch');

  const caught = bundle.updateIndex(db, project, { verify: 'stamp' });
  assert.equal(caught.suspicious, 1, 'gleiche Groesse und mtime, anderer Stempel');
  assert.equal(caught.hashed, 1, 'genau diese Datei wird gelesen');
  assert.equal(caught.written, 1);
  assert.equal(caught.falseAlarms, 0, 'und der Inhalt war wirklich ein anderer');
  assert.equal(caught.readBytes, Number(nowInfo.size), 'die Kosten sind genau diese eine Datei');

  // WORAN es lag: die ersten vier Angaben sind gleich, die ctime ist es nicht.
  // Die mtime im Stempel ist DIE GERUNDETE Millisekunde aus mtime_ms — dieselbe
  // Aufloesung wie das klassische Signal, sonst meldete der Stempel "geaendert",
  // wo Groesse+mtime "unveraendert" sagen (beim Bau gemessen: 1 ms daneben).
  const storedParts = storedRow.stamp.split(':');
  const nowParts = `${nowInfo.dev}:${nowInfo.ino}:${nowInfo.size}:${Math.round(statSync(target).mtimeMs)}:${nowInfo.ctimeNs}`.split(':');
  assert.deepEqual(storedParts.slice(0, 4), nowParts.slice(0, 4), 'Geraet, Inode, Groesse und mtime sind unveraendert');
  assert.notEqual(storedParts[4], nowParts[4], 'die ctime verraet die Aenderung');
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'markerB')[0].n, 1, 'der neue Inhalt steht im Index');
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'markerA')[0].n, 0, 'der alte ist weg');
  db.close();
});
test('Zeitstempel: ein Signal ohne Inhaltsaenderung ist ein gezaehlter Fehlalarm', () => {
  const project = fixtureProject('stamp-fehlalarm');
  const { file } = fixtureIndex(project, 'stamp-fehlalarm');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, { verify: 'stamp' });

  const target = join(project, 'src/b.mjs');
  chmodSync(target, 0o600);

  const noisy = bundle.updateIndex(db, project, { verify: 'stamp' });
  assert.equal(noisy.suspicious, 1, 'die ctime hat sich bewegt');
  assert.equal(noisy.hashed, 1, 'der Preis ist ein Lesevorgang');
  assert.equal(noisy.rehashed, 1, 'inhaltlich unveraendert');
  assert.equal(noisy.falseAlarms, 1, 'das ist der Fehlalarm — gezaehlt');
  assert.equal(noisy.written, 0);

  const again = bundle.updateIndex(db, project, { verify: 'stamp' });
  assert.equal(again.hashed, 0, 'ein Fehlalarm wird nicht zur Dauerschleife');
  assert.equal(again.stamped, again.files);
  assert.equal(again.readBytes, 0);
  db.close();
});
test('Zeitstempel: eine ersetzte Datei wird ueber ihre Identitaet erkannt', () => {
  const project = fixtureProject('stamp-ersatz');
  const { file } = fixtureIndex(project, 'stamp-ersatz');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, { verify: 'stamp' });

  const target = join(project, 'src/a.mjs');
  const before = statSync(target, { bigint: true });
  const replacement = join(project, 'src/ersatz.mjs');
  writeFileSync(replacement, '#'.repeat(Number(before.size)));
  // Dieselbe mtime, die auch die Indexdatei fuehrt: die gerundete Millisekunde.
  const sameMs = new Date(Math.round(statSync(target).mtimeMs));
  utimesSync(replacement, sameMs, sameMs);
  renameSync(replacement, target);

  const after = statSync(target, { bigint: true });
  assert.equal(Number(before.size), Number(after.size), 'gleiche Groesse');
  assert.equal(before.ino === after.ino, false, 'aber ein anderer Inode');

  const caught = bundle.updateIndex(db, project, { verify: 'stamp' });
  assert.equal(caught.suspicious, 1, 'gleiche Groesse und mtime, andere Identitaet');
  assert.equal(caught.written, 1, 'die Datei wird neu indexiert');
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'alpha')[0].n, 0, 'die alten Symbole sind weg');
  db.close();
});
test('Schema: die Stempelspalte traegt Geraet, Inode, Groesse, mtime und ctime', () => {
  const project = fixtureProject('stamp-spalte');
  const { file } = fixtureIndex(project, 'stamp-spalte');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, { verify: 'stamp' });

  const target = join(project, 'src/a.mjs');
  const info = statSync(target, { bigint: true });
  assert.equal(
    rows(db, 'select stamp from files where path = ?', 'src/a.mjs')[0].stamp,
    `${info.dev}:${info.ino}:${info.size}:${Math.round(statSync(target).mtimeMs)}:${info.ctimeNs}`,
    'die fuenf Angaben des Inodes: Geraet, Inode, Groesse, mtime_ms, ctime_ns',
  );
  assert.ok(bundle.INDEXER_VERSION >= 5, 'die Fassung der Extraktion ist gestiegen');
  assert.equal(bundle.Config({}).verify, 'stamp', 'und der Stempel ist die Vorgabe, nicht die Luecke');
  db.close();
});
test('Inkrement: die Groesse allein genuegt als Signal, und eine mtime darf rueckwaerts laufen', () => {
  const project = fixtureProject('signale');
  const { file } = fixtureIndex(project, 'signale');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});
  const target = join(project, 'src/b.mjs');
  const stamp = statSync(target).mtime;

  // (1) Inhalt laenger, mtime zurueckgesetzt: nur die GROESSE verraet die Aenderung.
  writeFileSync(target, ['export function bThing(value) {', '  return value;', '}', '', 'export const bZusatz = 3;', ''].join('\n'));
  utimesSync(target, stamp, stamp);
  const bySize = bundle.updateIndex(db, project, {});
  assert.equal(bySize.hashed, 1, 'die mtime ist gleich, die Groesse nicht — die Datei muss gelesen werden');
  assert.equal(bySize.written, 1, 'und neu indiziert');
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'bZusatz')[0].n, 1, 'das neue Symbol steht im Index');

  // (2) mtime laeuft RUECKWAERTS, Inhalt ist gleich: Gleichheit entscheidet, nicht Ordnung.
  const older = new Date(Date.now() - 60000);
  utimesSync(target, older, older);
  const backwards = bundle.updateIndex(db, project, {});
  assert.equal(backwards.hashed, 1, 'auch eine aeltere mtime ist eine Veraenderung');
  assert.equal(backwards.rehashed, 1, 'gleicher Inhalt: nur auffrischen');
  assert.equal(backwards.written, 0, 'gleicher Inhalt: kein Neuindizieren');
  assert.equal(rows(db, 'select count(*) as n from symbols where name = ?', 'bZusatz')[0].n, 1, 'die Symbole bleiben stehen');

  // (3) Ein Auffrischen schreibt NUR die Dateizeile: Chunks und FTS bleiben, wie sie waren.
  const chunksBefore = rows(db, 'select path, start_line, end_line, body from chunks where path = ? order by start_line', 'src/b.mjs');
  const ftsBefore = one(db, `select count(*) as n from ${bundle.FTS_TABLE}`).n;
  const fresh = new Date(Date.now() + 90000);
  utimesSync(target, fresh, fresh);
  const refreshed = bundle.updateIndex(db, project, {});
  assert.equal(refreshed.rehashed, 1);
  assert.deepEqual(
    rows(db, 'select path, start_line, end_line, body from chunks where path = ? order by start_line', 'src/b.mjs'),
    chunksBefore,
    'kein Neuindizieren heisst: die Chunks sind Zeile fuer Zeile dieselben',
  );
  assert.equal(one(db, `select count(*) as n from ${bundle.FTS_TABLE}`).n, ftsBefore);
  db.close();
});
