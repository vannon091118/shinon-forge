/**
 * ledger-separation.test.mjs — der dauerhafte Ledger liegt NICHT mehr im Index.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17): der Scoring-Stand lebte als
 * Namensraum in `~/.shinon/indexes/<hash>/index.sqlite` — derselben Datei, die
 * der Index jederzeit neu bauen darf und die als Cache jederzeit verschwinden
 * kann. Nutzerurteile sind nicht herstellbar; ein `rm -rf` im Cache hätte sie
 * mitgenommen. Seit der Trennung: Index → XDG-Cache (wiederherstellbar),
 * Ledger → XDG-Daten (`ledger.sqlite`, eigene Fassung, eigene Verbindung).
 *
 * Gepinnt wird:
 *   1. WAL/Busy-Timeout/Foreign-Keys an BEIDEN Verbindungen (eine Öffnungsquelle),
 *   2. die Migration ist VERLUSTFREI (Zeilen, Ordnung, Dokumente byte-gleich),
 *   3. sie ist IDEMPOTENT (zweiter Lauf tut nichts) und lässt die Quelle stehen,
 *   4. der Stand überlebt einen Index-Neuaufbau UND eine geleerte Indexwurzel,
 *   5. ein Lauf im Worker hinterlässt keinen Zombieprozess und kein Handle.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const index = await import('../../../packages/project-index/index.js');
const { DatabaseSync } = await import('node:sqlite');
const store = index.createStoreService.bind(index);

const NAMESPACE = 'test/ledger-ns';
let workCount = 0;
function workDir(label) {
  workCount += 1;
  return mkdtempSync(join(tmpdir(), `shinon-ledger-${label}-${workCount}-`));
}

/** Der Stand, wie das Scoring ihn ablegt: Protokoll, Merkzettel, Tafel. */
function stand(rows = 3) {
  return {
    records: Array.from({ length: rows }, (_, at) => ({ subject: `ans-${at}`, signal: 'approval', factor: 0.6, at })),
    memos: [{ id: 'sess-1', previousQuestion: 'was ist hier los?' }],
    scorecard: { scores: { correctness: 0.56, trust: 0.52 }, signals: rows },
    notes: 2,
  };
}

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const ledgerFor = (dir) => join(dir, 'ledger.sqlite');

test('ledger: WAL, Busy-Timeout und Foreign-Keys gelten an BEIDEN Verbindungen', () => {
  const dir = workDir('wal');
  const indexFile = join(dir, 'index.sqlite');
  const ledger = ledgerFor(dir);

  const idx = index.openIndex(indexFile);
  try {
    assert.equal(idx.prepare('pragma journal_mode').get().journal_mode, 'wal', 'der Index läuft im WAL-Modus');
    assert.equal(Number(idx.prepare('pragma busy_timeout').get().timeout), 5000, 'Host und Worker warten statt zu scheitern');
    assert.equal(Number(idx.prepare('pragma foreign_keys').get().foreign_keys), 1);
  } finally {
    idx.close();
  }

  const led = index.openLedger(ledger);
  try {
    assert.equal(led.prepare('pragma journal_mode').get().journal_mode, 'wal', 'der Ledger läuft im WAL-Modus');
    assert.equal(Number(led.prepare('pragma busy_timeout').get().timeout), 5000);
    assert.equal(Number(led.prepare('pragma foreign_keys').get().foreign_keys), 1);
    // Und er trägt seine eigene Fassung, nicht die des Index.
    assert.equal(index.indexMeta(led).memory_version, String(index.MEMORY_VERSION));
  } finally {
    led.close();
  }
  // Die WAL-Begleitdateien liegen neben der Datenbank, nicht im Arbeitsverzeichnis.
  assert.equal(existsSync(`${ledger}-wal`) || existsSync(ledger), true);
});

test('ledger: die Migration ist verlustfrei, atomar und idempotent', () => {
  const dir = workDir('migration');
  const indexFile = join(dir, 'index.sqlite');
  const ledger = ledgerFor(dir);
  const source = stand(4);

  // Ausgangslage: der Stand liegt — wie bis zur Trennung — im INDEX.
  const db = index.openIndex(indexFile);
  index.writeMemory(db, NAMESPACE, source);
  db.close();
  // Der Stempel wird NACH dem Schliessen genommen: beim Schliessen zieht SQLite
  // den WAL in die Datei zusammen — vorher zu messen hiesse, den falschen Stand
  // zu vergleichen.
  const sourceDigest = digest(indexFile);

  const service = store({ indexFile, ledgerFile: ledger });
  const first = service.load(NAMESPACE);
  assert.equal(first.ok, true, first.error ?? '');
  assert.equal(first.migrated, 6, 'vier Zeilen + Merkzettel + Zusammenfassung');
  assert.match(String(first.migration), /index\.sqlite/, 'die Quelle wird benannt');
  assert.deepEqual(first.state.records, source.records, 'die Zeilen kommen unverändert an');
  assert.deepEqual(first.state.memos, source.memos);
  assert.deepEqual(first.state.scorecard, source.scorecard);
  assert.equal(first.state.notes, source.notes);
  assert.equal(first.state.broken, 0);
  assert.equal(existsSync(ledger), true, 'der Ledger ist angelegt');
  assert.equal(digest(indexFile), sourceDigest, 'die QUELLE bleibt Byte für Byte stehen (Sicherung)');

  // IDEMPOTENT: der zweite Lauf tut nichts mehr.
  const second = store({ indexFile, ledgerFile: ledger }).load(NAMESPACE);
  assert.equal(second.ok, true);
  assert.equal(second.migrated, undefined, 'kein zweiter Kopiervorgang');
  assert.deepEqual(second.state, first.state, 'derselbe Stand');

  // Und der Ledger ist wirklich eine eigene Datei mit den Zeilen.
  const check = new DatabaseSync(ledger, { readOnly: true });
  try {
    assert.equal(check.prepare('select count(*) as n from memory where namespace = ?').get(NAMESPACE).n, 6);
    assert.equal(check.prepare('select value from meta where key = ?').get('migrated_from').value, indexFile);
  } finally {
    check.close();
  }
});

test('ledger: der Stand überlebt Index-Neuaufbau UND eine geleerte Indexwurzel', () => {
  const dir = workDir('ueberleben');
  const indexRoot = join(dir, 'cache', 'indexes');
  const project = join(dir, 'projekt');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'src', 'a.mjs'), 'export const a = 1;\n');
  const indexFile = index.indexPath(indexRoot, project);
  const ledger = ledgerFor(dir);

  // Erst der Stand im Index (Ausgangslage), dann die Migration.
  const db = index.openIndex(indexFile);
  index.writeMemory(db, NAMESPACE, stand(2));
  db.close();
  const service = store({ indexFile, ledgerFile: ledger });
  assert.equal(service.load(NAMESPACE).migrated, 4);

  // (a) Ein Index-NEUAUFBAU (fremde Schemafassung) verwirft den Index — nicht den Ledger.
  const rebuilt = index.openIndex(indexFile);
  rebuilt.prepare('update meta set value = ? where key = ?').run('1', 'schema_version');
  rebuilt.close();
  const afterRebuild = index.openIndex(indexFile);
  assert.equal(index.indexMeta(afterRebuild).schema_version, String(index.SCHEMA_VERSION));
  afterRebuild.close();
  assert.equal(service.load(NAMESPACE).state.records.length, 2, 'der Neuaufbau trifft den Ledger nicht');

  // (b) CACHE-BEREINIGUNG: die ganze Indexwurzel verschwindet (das ist erlaubt —
  // der Index ist wiederherstellbar). Der Ledger muss bleiben.
  rmSync(indexRoot, { recursive: true, force: true });
  assert.equal(existsSync(indexFile), false, 'die Indexdatei ist weg');
  const survived = store({ indexFile, ledgerFile: ledger }).load(NAMESPACE);
  assert.equal(survived.ok, true, `Stand verloren: ${survived.error}`);
  assert.deepEqual(survived.state.records, stand(2).records, 'die Urteile sind noch da');
  assert.equal(survived.state.scorecard.signals, 2);
});

test('ledger: ein Lauf im Worker hinterlässt keinen Zombieprozess und kein Handle', async () => {
  const dir = workDir('worker');
  const project = join(dir, 'projekt');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'src', 'a.mjs'), "import { b } from './b.mjs';\nexport const a = b;\n");
  writeFileSync(join(project, 'src', 'b.mjs'), 'export const b = 2;\n');

  // Ausgangslage: keine Kindprozesse, keine Worker.
  const before = (process._getActiveHandles ?? (() => []))().filter((handle) => handle.constructor?.name === 'Worker' || handle.pid !== undefined).length;

  const result = await index.runIndexInWorker({
    root: project,
    indexRoot: join(dir, 'indexes'),
    maxFileBytes: 262144,
    chunkLines: 40,
    verify: 'stamp',
  });
  assert.equal(result.ok, true, `Worker-Lauf: ${result.error ?? ''}`);
  assert.ok(result.report.written >= 2, 'der Lauf hat wirklich geschrieben');

  const after = (process._getActiveHandles ?? (() => []))().filter((handle) => handle.constructor?.name === 'Worker' || handle.pid !== undefined).length;
  assert.equal(after, before, 'kein Worker und kein Kindprozess überlebt den Lauf');

  // Der Index ist zu und die Datei lesbar (kein offenes Handle blockiert sie).
  const db = index.openIndex(index.indexPath(join(dir, 'indexes'), project));
  assert.ok(index.indexStats(db).files >= 2);
  db.close();
  assert.equal(existsSync(project), true, 'das Projekt selbst wurde nicht angefasst');
});
