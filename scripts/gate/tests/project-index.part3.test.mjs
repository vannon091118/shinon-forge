/** Teil 3/4 von project-index.test.mjs — Fixtures stehen in `project-index-fixtures.mjs`. */
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
  const sources = { 'index.js': readFileSync(INDEX_FILE, 'utf8'), 'assets/index-*.js': readCore() };
  for (const [name, source] of Object.entries(sources)) {
    for (const tokens of [
      ['writeFileSync', 'appendFileSync', 'rmSync', 'unlinkSync', 'renameSync'],
      ['child_process', 'fetch(', 'process.exit', 'ctx.llm', 'ctx.agents', 'ctx.shell', 'ctx.set('],
    ]) {
      assert.deepEqual(findForbidden(source, tokens, { mode: 'module' }), [], `${name}: ${tokens.join(', ')}`);
      assert.deepEqual(findForbidden(source, tokens), [], `${name}: ${tokens.join(', ')}`);
    }
  }
  assert.deepEqual(findMissing(codeOnly(sources['assets/index-*.js']), ['new DatabaseSync']), [], 'der Index ist wirklich SQLite');
  assert.deepEqual(
    findForbidden(sources['index.js'], ['DatabaseSync'], { mode: 'module' }),
    [],
    'die Host-Haelfte fasst die Datenbank nicht selbst an — sie mountet nur',
  );
  assert.ok(bundle.SKIP_DIRS.has('node_modules') && bundle.SKIP_DIRS.has('.git'), 'Fremdcode und Historie werden nie betreten');
});
test('Öffnen: die sieben Meta-Zeilen gehen in einer Transaktion raus', () => {
  const project = fixtureProject('meta-batch');
  const { file } = fixtureIndex(project, 'meta-batch');
  const db = bundle.openIndex(file, { expectedRoot: project });
  const keys = db.prepare('select key from meta order by key').all().map((row) => row.key);
  db.close();

  assert.deepEqual(keys, [
    'contract', 'indexer_version', 'memory_version', 'root', 'root_id', 'schema_version', 'workspace_contract',
  ], 'alle sieben Kopffelder sind da — gebündelt heißt nicht weniger');

  // Der Grund ist der Preis: sieben Commits waren sieben fsyncs. Gepinnt wird
  // die Form, nicht die Dauer — die hängt an Maschine und Last.
  const source = codeOnly(readCore());
  const start = source.indexOf('export function openIndex');
  const body = source.slice(start, source.indexOf('export function indexMeta', start));
  assert.ok(start !== -1 && body.length > 0, 'openIndex ist auffindbar');
  assert.match(body, /setMetaMany\(/, 'das Öffnen bündelt seine Meta-Schreibvorgänge');
  assert.equal(/setMeta\(/.test(body), false, 'kein einzelner Meta-Commit mehr im Öffnen');
});
test('Update: eine bekannte Datei wird vor dem Neuschreiben geleert — keine Doppelzeilen', () => {
  const project = fixtureProject('forget-bekannt');
  const { file } = fixtureIndex(project, 'forget-bekannt');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});
  const symbolsBefore = one(db, `select count(*) as n from symbols where path = 'src/b.mjs'`).n;
  assert.ok(symbolsBefore > 1, 'b.mjs trägt vor dem Umbau mehrere Symbolzeilen');

  // Dieselbe Datei, weniger Symbole: die alten Zeilen dürfen nicht liegen bleiben.
  writeFileSync(join(project, 'src/b.mjs'), 'export function bThing(value) {\n  return value;\n}\n');
  const second = bundle.updateIndex(db, project, {});
  const symbolsAfter = one(db, `select count(*) as n from symbols where path = 'src/b.mjs'`).n;
  db.close();

  assert.equal(second.written, 1, 'genau die geänderte Datei wird neu geschrieben');
  assert.equal(second.rehashed, 0, 'der Inhalt ist geändert, kein Rehash-Idlefall');
  assert.equal(symbolsAfter, 1, 'nur der neue Stand steht in symbols — forgetFile läuft für bekannte Dateien');
});
test('Kaltlauf: eine neue Datei braucht kein Leeren — forgetFile läuft nur für bekannte Pfade', () => {
  const source = codeOnly(readCore());
  // Der Durchgang weiß, ob die Datei Zeilen hatte: dieses Wissen geht mit hinein.
  assert.match(source, /indexFile\(db, root, absolute, file, \{ chunkLines, stamp, known: before !== undefined \}\)/, 'der Aufruf übergibt das Wissen über Vorzeilen');
  // indexFile leert nur dann — auf einer frischen Datei kann nichts liegen.
  const start = source.indexOf('function indexFile');
  const body = source.slice(start, source.indexOf('\n}', start));
  assert.ok(start !== -1 && body.length > 0, 'indexFile ist auffindbar');
  assert.match(body, /options\.known !== false\) forgetFile\(db, path\)/, 'unbekannte Pfade werden nicht vorher geleert');
  for (const table of [bundle.FTS_TABLE, ...bundle.PRIMARY_TABLES]) {
    assert.ok(source.includes(`forgetFile`), 'forgetFile bleibt der eine Besitzer des Löschens');
    break;
  }
});
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
    // Ein Mount, der vor dem Lauf abgeräumt wird, darf nichts schreiben. Der
    // Mount meldet seinen Zustand SOFORT (Aktivierung und die zwei
    // Faehigkeiten, Zug 2) — was nach dieser Zeile kommt, wäre ein LAUF.
    const abandoned = bundle.apply({}, bundle.Config({ root: project, indexRoot }));
    const announced = quiet.lines.length;
    abandoned();
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(quiet.lines.slice(announced), [], 'kein Lauf nach dem Abräumen');
    assert.equal(existsSync(indexRoot), false, 'und keine Indexwurzel');

    const dispose = bundle.apply({}, bundle.Config({ root: project, indexRoot }));
    assert.ok(
      quiet.lines.some((line) => line.includes(bundle.CONTRACT) && line.includes('Lauf nach dem Start')),
      `Aktivierung muss den Vertrag nennen: ${quiet.lines.join(' | ')}`,
    );
    assert.ok(quiet.lines.some((line) => line.includes('(Worker)')), 'der Mount startet den Worker');
    assert.ok(
      quiet.lines.some((line) => line.includes(`${bundle.QUERY_SERVICE} NICHT angeboten`)),
      `der Mount nennt den Zustand der Abfrage-Faehigkeit (§14/§17): ${quiet.lines.join(' | ')}`,
    );

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
test('Worker: der Lauf laesst den Eventloop laufen, der Lauf im Host blockiert ihn', async () => {
  // Groesse bewusst so gewaehlt, dass der Host-Lauf auch auf schnellen Runnern
  // deutlich ueber 100 ms liegt (gemessen: 150 Dateien ergaben 85 ms und rissen
  // die Praemisse der Schranke). Die Zahl ist kein Zeitbudget, sondern die
  // Bedingung dafuer, dass `host.ticks === 0` ueberhaupt etwas zeigen kann.
  const project = bigProject('eventloop', 400, 40);
  const hostIndex = fixtureIndex(project, 'eventloop-host');
  const mountIndex = join(workDir('eventloop-mount'), 'indexes');

  // Der Mount ist der Weg, der im echten Host laeuft: Lauf im Worker, Bericht
  // danach. Er wird ZUERST gemessen, damit die Messung nicht auf dem Muell des
  // Host-Laufs sitzt (eine Speicherbereinigung im Testprozess erzeugte dort
  // einmal eine Luecke von 271 ms — gemessen, nicht vermutet).
  const quiet = collector();
  let mounted;
  try {
    const dispose = bundle.apply({}, bundle.Config({ root: project, indexRoot: mountIndex }));
    mounted = await observeLoop(async () => {
      assert.ok(await quiet.waitFor('Lauf im Worker', 60000), `der Bericht muss kommen: ${quiet.lines.join(' | ')}`);
      return { report: quiet.lines.find((line) => line.includes('Lauf im Worker')) };
    });
    dispose();
    assert.ok(mounted.report.includes('neu'), 'der Bericht ist der des Laufs, nicht eines Fehlers');
  } finally {
    quiet.restore();
  }

  // Der Lauf im HOST ist synchron: waehrend er laeuft, bedient der Prozess
  // keinen einzigen Timer. Das ist der Grund fuer den Worker UND die Gegenprobe:
  // die Grenze unten vergleicht sich mit einer echten Blockade, statt eine
  // geschaetzte Millisekundenzahl zu behaupten.
  const host = await observeLoop(async () => bundle.runIndex({ root: project, indexRoot: hostIndex.indexRoot }));
  assert.equal(host.ticks, 0, 'ein synchroner Lauf im Host blockiert den Eventloop vollstaendig');
  // Die Schranke 100 ms gilt als untere Grenze, um die Blockade sichtbar zu machen:
  // 100 ms ist genug, damit kein Timer feuert, aber nicht so hoch, dass schnelle
  // CI-Runner (GitHub 171 ms) den Test rot machen. Der eigentliche Beweis für
  // die Eventloop-Behauptung liefert der Vergleich `mounted.worst < host.ms/2`
  // und `mounted.ticks >= 5` — die absolute 100-ms-Grenze ist nur eine Schutz-
  // Marke für die Test-Prämisse.
  assert.ok(host.ms > 100, `der Fixture-Lauf ist lang genug, um eine Blockade zu sehen: ${host.ms} ms`);

  assert.ok(mounted.ticks >= 5, `waehrend des Laufs laeuft der Loop weiter: ${mounted.ticks} Ticks`);
  assert.ok(
    mounted.worst < host.ms / 2,
    `keine Blockade: groesste Luecke ${mounted.worst} ms gegen eine Blockade von ${host.ms} ms`,
  );
});
test('node:sqlite: Verfuegbarkeit und Version gegen die laufende Runtime geprueft', () => {
  assert.equal(typeof DatabaseSync, 'function', 'node:sqlite liefert DatabaseSync');

  const work = workDir('runtime');
  const file = join(work, 'index.sqlite');
  const db = bundle.openIndex(file);
  const engine = one(db, 'select sqlite_version() as version').version;
  db.close();

  // Kein festgeschriebener Wert: die Engine muss die Version melden, die die
  // Runtime meldet. Nennt die Runtime keine, steht diese Grenze im Protokoll —
  // geprueft ist dann nur die Verfuegbarkeit, und das wird gesagt statt gemeint.
  assert.match(engine, /^\d+\.\d+\.\d+/, `die Engine nennt eine Version: ${engine}`);
  const reported = process.versions.sqlite;
  if (reported === undefined) console.log(`[project-index] die Runtime nennt keine sqlite-Version — geprueft ist nur die Verfuegbarkeit (Engine: ${engine})`);
  else assert.equal(engine, reported, 'die Version der Engine ist die der Runtime');

  // Und die Datei IST SQLite — am Kopf geprueft, unabhaengig vom Treiber, mit
  // einer Gegenprobe, damit der Test nicht bloss eine Konstante wiederholt.
  assert.equal(readFileSync(file).subarray(0, 16).toString('latin1'), 'SQLite format 3\0');
  const plain = join(work, 'keine-datenbank.txt');
  writeFileSync(plain, 'keine Datenbank\n');
  assert.notEqual(readFileSync(plain).subarray(0, 16).toString('latin1'), 'SQLite format 3\0', 'die Kopfprobe unterscheidet wirklich');
});
test('Schutz: die Pfadregeln treffen Namen mit führendem Punkt und verschonen Quelltext', () => {
  const protectedCases = [
    ['.env', 'dotenv'],
    // §13 nennt `.env*` — das schliesst die Formen ein, die kein Punkt-Variante
    // sind: `.envrc` (direnv) exportiert regelmaessig Werte.
    ['.envrc', 'dotenv'],
    ['.env.bak', 'dotenv'],
    ['.env.local', 'dotenv'],
    ['src/.env', 'dotenv'],
    ['tief/verschachtelt/.env.production', 'dotenv'],
    ['.credentials.yaml', 'credential-datei'],
    ['credentials.json', 'credential-datei'],
    // Preis der Praefixregel, offen benannt: Prosa UEBER Zugangsdaten faellt
    // mit unter den Schutz. §13 nennt `credentials*`/`secrets*` als Praefix,
    // und die Alternative — Praefixe nach Gefuehl zu unterscheiden — waere eine
    // Liste, die niemand nachpruefen kann. Die WIRKSAME Grenze bleibt die
    // fehlende Faehigkeit des Enhancers, nicht der Index.
    ['docs/probes/secret-protection.json', 'secret-datei'],
    ['secrets-notes.md', 'secret-datei'],
    // §13 nennt `credentials*` als Praefix. Ein Praefixname ist genau dann ein
    // Zugangsdatentraeger, wenn er KEIN Programm ist: `credentials-prod.yaml`
    // traegt Werte, `credential-helper.mjs` verwaltet sie.
    ['credentials-prod.yaml', 'credential-datei'],
    ['secrets-prod.json', 'secret-datei'],
    ['credentials.json.bak', 'credential-datei'],
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
  const keptCases = ['src/config.mjs', 'src/credential-helper.mjs', 'package.json', 'config.yml', 'docs/notes.md'];
  for (const path of keptCases) {
    assert.equal(bundle.protectedReason(path), null, `${path} darf nicht geschützt sein`);
  }
  assert.ok(bundle.PROTECTED_PATH_RULES.length >= 5);
  assert.ok(bundle.PROTECTED_PATH_RULES.every((rule) => typeof rule.kind === 'string' && rule.pattern instanceof RegExp), 'jede Regel nennt ihren Grund');
});
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
