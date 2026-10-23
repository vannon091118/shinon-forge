/** Teil 4/4 von project-index.test.mjs — Fixtures stehen in `project-index-fixtures.mjs`. */
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
    // Cloud-Zugangsdaten, die §13 namentlich nennt und die keine eigene Form haben:
    // der Name traegt die Aussage, der Wert ist lang und unquoted.
    [`aws_secret_access_key = ${'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'}`, 'cloud-schluessel'],
    [`AccountKey=${'A'.repeat(88)}==`, 'cloud-schluessel'],
    [`DefaultEndpointsProtocol=https;AccountName=x;AccountKey=${'B'.repeat(88)}==;EndpointSuffix=core.windows.net`, 'cloud-schluessel'],
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
    // Gegenprobe gegen zu viel Redaktion: ein NAME, der nur nach Schluessel
    // klingt, und ein Wert, der zu kurz fuer ein Geheimnis ist.
    `const CACHE_KEY = 'user:profile:cache:schluessel'`,
    'const ACCESS_KEY_ID = null;',
    'accountkey: 42',
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
test('Scan: die Dateireihenfolge ist eine Funktion der Dateimenge, nicht des Durchlaufs', () => {
  const project = join(workDir('ordnung'), 'projekt');
  const created = [
    'src/tief/noch-tiefer/z.mjs',
    'aaa.mjs',
    'docs/mitte.mjs',
    'src/a.mjs',
    'zzz/last.mjs',
    'B.mjs',
  ];
  for (const path of created) {
    mkdirSync(join(project, path, '..'), { recursive: true });
    writeFileSync(join(project, path), `export const wert = ${JSON.stringify(path)};\n`);
  }

  const first = bundle.listFiles(project).map((absolute) => bundle.toProjectPath(project, absolute));
  const second = bundle.listFiles(project).map((absolute) => bundle.toProjectPath(project, absolute));

  assert.deepEqual(second, first, 'zwei Auflistungen desselben Baums sind identisch');
  assert.deepEqual(first, [...first].sort(), 'und die Folge ist aufsteigend nach Pfad');
  assert.deepEqual(
    first,
    ['B.mjs', 'aaa.mjs', 'docs/mitte.mjs', 'src/a.mjs', 'src/tief/noch-tiefer/z.mjs', 'zzz/last.mjs'],
    'Pfadvergleich ohne Locale: Grossbuchstaben vor Kleinbuchstaben, Tiefe ist keine Ordnung',
  );
  assert.notDeepEqual(first, created, 'die Anlagereihenfolge ist NICHT die Ausgabereihenfolge — sonst bewiese der Test nichts');
});
test('Scan: ein unlesbarer Ordner wird benannt, statt still zu fehlen', { skip: ROOT_SKIP }, () => {
  const project = join(workDir('ordnerfehler'), 'projekt');
  mkdirSync(join(project, 'src'), { recursive: true });
  mkdirSync(join(project, 'gesperrt'), { recursive: true });
  writeFileSync(join(project, 'src/a.mjs'), 'export const alpha = 1;\n');
  writeFileSync(join(project, 'gesperrt/b.mjs'), 'export const beta = 2;\n');

  const errors = [];
  chmodSync(join(project, 'gesperrt'), 0o000);
  let listed;
  try {
    listed = bundle.listFiles(project, bundle.SOURCE_EXTENSIONS, (entry) => errors.push(entry));
  } finally {
    chmodSync(join(project, 'gesperrt'), 0o755);
  }

  const paths = listed.map((absolute) => bundle.toProjectPath(project, absolute));
  assert.deepEqual(paths, ['src/a.mjs'], 'der gesperrte Teilbaum fehlt im Ergebnis');
  assert.equal(errors.length, 1, 'und genau einmal gemeldet');
  assert.equal(errors[0].reason, 'ORDNER_NICHT_LESBAR', 'mit dem Grund, der auf den Ordner zeigt');
  assert.equal(bundle.toProjectPath(project, errors[0].path), 'gesperrt');
  assert.equal(errors[0].detail, 'EACCES', 'und dem Fehlercode des Betriebssystems');

  // Derselbe Befund steht im Lauf-Bericht — und in der Zeile, die der Host protokolliert.
  const { file } = fixtureIndex(project, 'ordnerfehler');
  const db = bundle.openIndex(file);
  chmodSync(join(project, 'gesperrt'), 0o000);
  try {
    const report = bundle.updateIndex(db, project, {});
    assert.deepEqual(report.scanErrors, [{ path: 'gesperrt', reason: 'ORDNER_NICHT_LESBAR', detail: 'EACCES' }]);
    assert.equal(report.skipped, 0, 'ein Ordner ist keine Datei: `skipped` bleibt die Dateizahl');
    assert.deepEqual(rows(db, 'select path from files order by path').map((row) => row.path), ['src/a.mjs']);
  } finally {
    chmodSync(join(project, 'gesperrt'), 0o755);
    db.close();
  }
});
test('Scan: eine unlesbare Datei wird mit Pfad und Grund gemeldet', { skip: ROOT_SKIP }, () => {
  const project = join(workDir('dateifehler'), 'projekt');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'src/a.mjs'), 'export const alpha = 1;\n');
  const gesperrt = join(project, 'src/gesperrt.mjs');
  writeFileSync(gesperrt, 'export const beta = 2;\n');

  const { file } = fixtureIndex(project, 'dateifehler');
  const db = bundle.openIndex(file);
  bundle.updateIndex(db, project, {});
  assert.equal(one(db, 'select count(*) as n from files where path = ?', 'src/gesperrt.mjs').n, 1, 'zunächst indiziert');

  chmodSync(gesperrt, 0o000);
  try {
    const report = bundle.updateIndex(db, project, {});
    assert.equal(report.skipped, 1);
    assert.equal(report.scanErrors.length, 1, 'genau ein benannter Ausschluss');
    assert.equal(report.scanErrors[0].path, 'src/gesperrt.mjs');
    assert.equal(report.scanErrors[0].reason, 'NICHT_LESBAR', 'nicht „zu groß" und nicht stumm');
    assert.equal(report.scanErrors[0].detail, 'EACCES');
    assert.equal(
      one(db, 'select count(*) as n from files where path = ?', 'src/gesperrt.mjs').n,
      0,
      'und die alten Zeilen stehen nicht mehr — ein Ausschluss ist kein Weiterbetrieb',
    );
  } finally {
    chmodSync(gesperrt, 0o644);
    db.close();
  }
});
test('Persistenz: die Politiken des Index stehen fest und sind nachlesbar', () => {
  const project = join(workDir('persistenz'), 'projekt');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'a.mjs'), 'export const alpha = 1;\n');
  const { file } = fixtureIndex(project, 'persistenz');
  const db = bundle.openIndex(file);
  try {
    assert.equal(db.prepare('pragma journal_mode').get().journal_mode, 'wal', 'WAL traegt den laufenden Betrieb');
    assert.equal(Number(db.prepare('pragma secure_delete').get().secure_delete), 1, 'geloeschte Zellen werden ueberschrieben');
    assert.equal(Number(db.prepare('pragma synchronous').get().synchronous), 2, 'full = 2: ein Commit ist dauerhaft, bevor er als fertig gilt');
  } finally {
    db.close();
  }
});
test('Mount: die Berichtszeile nennt jeden Ausschluss mit Grund und Pfad', async () => {
  const project = join(workDir('sichtbar'), 'projekt');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'src/klein.mjs'), 'export const klein = 1;\n');
  // Über jeder Grenze: der Ausschluss ist hier die ABSICHT des Tests, nicht ein Unfall.
  writeFileSync(join(project, 'src/gross.mjs'), `export const gross = 1;\n${'// Fuelltext\n'.repeat(200)}`);
  const indexRoot = join(workDir('sichtbar'), 'indexes');
  const quiet = collector();
  try {
    const dispose = bundle.apply({}, bundle.Config({ root: project, indexRoot, maxFileBytes: 512 }));
    assert.ok(await quiet.waitFor('Lauf im Worker'), `der Lauf muss berichten: ${quiet.lines.join(' | ')}`);
    dispose();
    const line = quiet.lines.find((entry) => entry.includes('uebersprungen'));
    assert.ok(line !== undefined, 'die Berichtszeile ist da');
    assert.ok(line.includes('1 uebersprungen'), line);
    assert.ok(line.includes('ZU_GROSS=1'), 'der Grund steht in der Zeile, nicht nur die Zahl');
    assert.ok(line.includes('src/gross.mjs'), 'und der Pfad, damit der Befund nachzugehen ist');
    assert.ok(!line.includes('src/klein.mjs'), 'was indiziert wurde, ist kein Ausschluss');
  } finally {
    quiet.restore();
  }
});
test('Referenz-Matcher: wortidentische Eintraege zur Legacy-Suche (Token-Strategie)', () => {
  assert.ok(typeof bundle.createReferenceMatcher === 'function', 'createReferenceMatcher existiert');
  const legacy = (text, names) => bundle.findReferences(text, names);
  const probe = (text, names) => {
    const m = bundle.createReferenceMatcher(names);
    assert.deepEqual(m.scan(text), legacy(text, names), `Scan an ${JSON.stringify(text.slice(0, 40))}…`);
  };
  const names = ['alpha', 'beta', 'foo', 'fooBar', 'x2', '42'];
  probe('const a = alpha + beta; fooBar(1);', names);
  // Wortgrenze: Teilwort zaehlt nicht, bei getrennten Zeichen zaehlt es.
  probe('alphaBeta alpha.beta alpha_beta alpha;beta', names.slice(0, 2));
  probe('x2 + 42 = 42x2', names.slice(4));
  // zwei Treffer derselben Zeile — nur der erste je Name, Reihenfolge wie im Text.
  probe('beta; alpha; beta, alpha', names.slice(0, 2));
  probe('', names);
  probe('irgendwas ganz anderes', names);
  // Vorbehandlung identisch: RESERVED_WORDS sind außendienst, die ersten
  // MAX_REFERENCE_NAMES sind die Grenze.
  probe('if (alpha) { }', ['if', 'alpha']);
  const many = Array.from({ length: bundle.MAX_REFERENCE_NAMES + 5 }, (_v, i) => `sym${i}`);
  probe(`sym0 sym2010 sym${bundle.MAX_REFERENCE_NAMES}`, many);
});
test('Referenz-Matcher: Namen jenseits der Tokenmenge fallen auf die Legacy-Semantik zurueck', () => {
  const legacy = (text, names) => bundle.findReferences(text, names);
  const probe = (text, names) => {
    const m = bundle.createReferenceMatcher(names);
    assert.deepEqual(m.scan(text), legacy(text, names), `Fallback an ${JSON.stringify(text.slice(0, 40))}…`);
  };
  // $-Namen: die Legacy-Wortgrenze um $ ist anders als eine Tokenmenge —
  // genau dafuer gibt es den Rueckweg (einmal kompiliert, je Datei gescannt).
  probe('foo.$scope und foo$scope', ['$scope']);
  // Unicode-Namen: \b ist ASCII-basiert, die Tokenmenge hier anders.
  probe('das f\u00fcr hier', ['f\u00fcr']);
  // Regex-Sonderzeichen im Namen.
  probe('a.a und aa und a.a.a', ['a.a']);
  // gemischte Folge bleibt korrekt.
  probe('alpha beta. $scope a.a', ['alpha', 'beta', '$scope', 'a.a']);
});
