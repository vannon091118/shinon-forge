#!/usr/bin/env node
/**
 * store-cost.mjs — was kostet die Ablage bei vielen Signalen?
 *
 * DIE FRAGE (eine, nicht zwei): `writeMemory` ERSETZT den Namensraum bei jedem
 * Schreiben (`delete from memory where namespace = ?` + alle Zeilen neu). Ein
 * Signal = ein Schreiben. Kostet das bei N Signalen so viel, dass
 * inkrementelles Anhängen nötig ist — oder ist das Neuschreiben billig genug?
 *
 * → Kanon: docs/COMMENT-KANON.md#k-9c67ba15d7e7
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { createStoreService } from '../packages/project-index/index.js';
import {
  CONTRACT,
  INDEXER_VERSION,
  MEMORY_VERSION,
  SCHEMA,
  SCHEMA_VERSION,
  openIndex,
  openLedger,
  writeMemory,
} from '../packages/project-index/assets/index-core.js';
import { createSignalCollector } from '../packages/scoring/assets/scoring-core.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const list = (name, fallback) =>
  String(arg(name, fallback))
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
const JSON_OUT = process.argv.includes('--json');
const KEEP = process.argv.includes('--keep');
/** Zeilenreihen für die reine Schreibmessung — hier darf es groß werden. */
const ROWS = list('--rows', '10,100,1000,5000,20000');
/** Signalreihen für jede Folge, bei der JEDES Signal ein Schreiben auslöst. */
const SIGNALS = list('--signals', '10,100');
const CHAIN = list('--chain', '100,500');

const NAMESPACE = 'shinon.scoring/ledger-v1'; // derselbe Namensraum wie im Produkt

const nodeMajor = Number((process.versions.node ?? '0').split('.')[0]);
if (nodeMajor < 22) {
  console.error(`💥 store-cost: Node ${process.versions.node} ist zu alt (node:sqlite verlangt ≥ 22)`);
  process.exit(1);
}

// ── Verträge und Signalform: dieselben Dateien und dieselbe Hülle wie im Haus ─
const PACKAGES = new URL('../packages/', import.meta.url);
const read = (relPath) => JSON.parse(readFileSync(new URL(relPath, PACKAGES), 'utf8'));
const contracts = {
  scoring: read('scoring/assets/scoring-state.json'),
  profile: read('scoring/assets/technical-profile.json'),
  triggers: read('scoring/assets/skill-triggers.json'),
};
const rules = read('scoring/assets/signal-rules.json');

const envelope = (event_type, session_id = 'sess-1') => ({
  event_type,
  session_id,
  timestamp: '2026-10-11T10:00:00.000Z',
});
const rating = (messageId, value = 'positive', sessionId = 'sess-1') => ({
  envelope: envelope('feedback.rated', sessionId),
  payload: { session_id: sessionId, item: { messageId, rating: value } },
});

// ── Werkzeug ─────────────────────────────────────────────────────────────────
const WORK = mkdtempSync(join(tmpdir(), 'store-cost-'));
const indexFile = (tag) => {
  const dir = join(WORK, tag);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'index.sqlite');
};
/**
 * Der DAUERHAFTE Ledger — seit der Trennung die Datei, in die `save` schreibt.
 * Gemessen wird sie hier, nicht mehr die Indexdatei: der Index ist Cache.
 */
const ledgerFile = (tag) => {
  const dir = join(WORK, `${tag}-ledger`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'ledger.sqlite');
};
const dbBytes = (file) => {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      total += statSync(`${file}${suffix}`).size;
    } catch {
      /* Datei gibt es (noch) nicht */
    }
  }
  return total;
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};
const ms = (value) => `${value.toFixed(value < 10 ? 2 : 1)} ms`;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const timed = (fn) => {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
};

/**
 * Echte Protokollzeilen — aus dem ECHTEN Sammler, nicht von Hand.
 *
 * Der Sammler läuft dabei ohne Ablage (`onPersist` fehlt): er soll nur die
 * Zeilenform liefern, die ein Schreiben später tragen muss — echte Feldnamen,
 * echte Länge (inklusive `detail`), echte Streuung.
 *
 * WARUM NUR EINMAL UND BEGRENZT: der Sammler rechnet bei jedem Signal
 * → Kanon: docs/COMMENT-KANON.md#k-117cde3eba59
 */
const TEMPLATE_RUN = 200;
let TEMPLATE = null;
function recordsFor(count) {
  if (TEMPLATE === null) {
    const collector = createSignalCollector({ contracts, rules });
    for (let i = 0; i < TEMPLATE_RUN; i += 1) collector.observe(...Object.values(rating(`msg-${i}`)));
    TEMPLATE = collector.records();
  }
  const out = TEMPLATE.slice(0, count);
  for (let i = out.length; i < count; i += 1) out.push({ ...TEMPLATE[i % TEMPLATE.length], subject: `msg-${i}` });
  return out;
}

const stateOf = (records, upto) => ({
  records: records.slice(0, upto),
  memos: [{ id: 'sess-1', previousQuestion: 'Frage', questions: upto, signals: upto }],
  scorecard: { signals: upto },
  notes: 0,
});

// ── 1. Zeilen: wächst der Preis des Schreibens mit der Zeilenzahl? ───────────
function measureRows(max) {
  const file = ledgerFile(`rows-${max}`);
  const store = createStoreService({ indexFile: indexFile(`rows-${max}`), ledgerFile: file });
  const records = recordsFor(max);
  store.save(NAMESPACE, stateOf(records, max)); // Datei anlegen, aufwärmen
  const samples = [];
  for (let i = 0; i < 3; i += 1) {
    const db = openLedger(file);
    samples.push(timed(() => writeMemory(db, NAMESPACE, stateOf(records, max))).ms);
    db.close();
  }
  const write = median(samples);
  return { rows: max, write, perRow: write / max, bytes: dbBytes(file) };
}

/**
 * `openIndex` in seine Schritte zerlegt — NACHTGEBAUT, nicht importiert.
 *
 * Der Grund für die Nachbildung: der echte Aufruf ist eine Blackbox, und die
 * Frage „was kostet das Schreiben" braucht die Zeile, die die Zeit nimmt. Die
 * Nachbildung ist kontrolliert: sie ruft dieselben Anweisungen in derselben
 * Reihenfolge (`SCHEMA` und die Fassungskonstanten sind importiert, nicht
 * abgeschrieben), sie läuft auf einer EIGENEN Datei, und der Bericht stellt
 * → Kanon: docs/COMMENT-KANON.md#k-ca4c5f7415a7
 */
function replicatedOpen(file, steps) {
  steps.push({ label: 'darin: new DatabaseSync', ms: timed(() => new DatabaseSync(file)).ms });
  const db = new DatabaseSync(file);
  steps.push({ label: 'darin: pragma journal_mode = wal', ms: timed(() => db.exec('pragma journal_mode = wal')).ms });
  steps.push({ label: 'darin: pragma secure_delete = on', ms: timed(() => db.exec('pragma secure_delete = on')).ms });
  steps.push({
    label: 'darin: create table meta',
    ms: timed(() => db.exec('create table if not exists meta(key text primary key, value text not null)')).ms,
  });
  steps.push({ label: 'darin: Schema (10x if not exists)', ms: timed(() => { for (const statement of SCHEMA) db.exec(statement); }).ms });
  steps.push({
    label: 'darin: 4x setMeta — 4 Transaktionen',
    ms: timed(() => {
      const statement = db.prepare('insert or replace into meta(key, value) values (?, ?)');
      for (const [key, value] of [
        ['schema_version', String(SCHEMA_VERSION)],
        ['indexer_version', String(INDEXER_VERSION)],
        ['memory_version', String(MEMORY_VERSION)],
        ['contract', CONTRACT],
      ]) {
        statement.run(key, value);
      }
    }).ms,
  });
  return db;
}

// ── 2. Zerlegung: wohin geht die Zeit eines Schreibens? ─────────────────────
function measureBreakdown(max) {
  // ZWEI Dateien: die Nachbildung darf die echte Messung nicht anfassen.
  const realFile = indexFile(`breakdown-real-${max}`);
  const replicaFile = indexFile(`breakdown-replica-${max}`);
  const records = recordsFor(max);
  const state = stateOf(records, max);
  const steps = [];
  for (let round = 0; round < 2; round += 1) {
    const step = (label, fn) => {
      const { ms: elapsed, value } = timed(fn);
      steps.push({ round, label, ms: elapsed });
      return value;
    };
    // Der echte Weg, wie ihn der Dienst geht: openIndex → writeMemory → close.
    const db = step('ECHT  openIndex', () => openIndex(realFile));
    step(`ECHT  writeMemory (${max} Zeilen)`, () => writeMemory(db, NAMESPACE, state));
    step('ECHT  close (WAL-Checkpoint)', () => db.close());
    // Derselbe Weg zerlegt, auf eigener Datei (siehe replicatedOpen).
    const inner = [];
    const replica = replicatedOpen(replicaFile, inner);
    inner.push({ label: 'darin: close', ms: timed(() => replica.close()).ms });
    const sum = inner.reduce((total, entry) => total + entry.ms, 0);
    steps.push({ round, label: `NACHGEBAUT Summe (${inner.length} Schritte)`, ms: sum });
    for (const entry of inner) steps.push({ round, label: `  ${entry.label}`, ms: entry.ms });
  }
  return { rows: max, steps };
}

// ── 3./4. Neuschreiben gegen Anhängen: dieselbe Signalreihe, zwei Wege ───────
function measureRewrite(max) {
  const file = ledgerFile(`rewrite-${max}`);
  const store = createStoreService({ indexFile: indexFile(`rewrite-${max}`), ledgerFile: file });
  const records = recordsFor(max);
  const perSave = [];
  const startedAll = performance.now();
  for (let i = 1; i <= max; i += 1) {
    perSave.push(timed(() => store.save(NAMESPACE, stateOf(records, i))).ms);
  }
  const total = performance.now() - startedAll;
  return {
    signals: max,
    total,
    perSignal: total / max,
    medianSave: median(perSave),
    lastSave: perSave[perSave.length - 1],
    bytes: dbBytes(file),
  };
}

/**
 * Eine Zeile einfügen, Merkzettel und Zusammenfassung ersetzen — in EINER
 * Transaktion, wie `writeMemory`. Das ist die naive Anhängung: sie schreibt
 * NICHT alles neu.
 *
 * WAS SIE NOCH NICHT KANN, und das gehört zur Antwort: der Widerruf braucht
 * dann ein gezieltes Löschen (heute fällt er beim vollständigen Ersetzen
 * einfach mit weg), und `ordinal` wird ein Zähler statt eines Array-Index.
 * Beides ist machbar — die Messung sagt nur, ob es sich lohnt.
 */
function appendOne(db, record, ordinal, summary, memo) {
  db.exec('begin');
  try {
    db.prepare(`insert into memory(namespace, kind, ref, ordinal, doc) values (?, 'record', ?, ?, ?)`)
      .run(NAMESPACE, String(ordinal), ordinal, JSON.stringify(record));
    db.prepare(`delete from memory where namespace = ? and kind in ('summary', 'memo')`).run(NAMESPACE);
    db.prepare(`insert into memory(namespace, kind, ref, ordinal, doc) values (?, 'memo', ?, 0, ?)`)
      .run(NAMESPACE, String(memo.id), JSON.stringify(memo));
    db.prepare(`insert into memory(namespace, kind, ref, ordinal, doc) values (?, 'summary', '', 0, ?)`)
      .run(NAMESPACE, JSON.stringify(summary));
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}

function measureAppend(max) {
  const file = ledgerFile(`append-${max}`);
  const store = createStoreService({ indexFile: indexFile(`append-${max}`), ledgerFile: file });
  const records = recordsFor(max);
  store.save(NAMESPACE, stateOf(records, 0)); // Datei anlegen: `load` legt sie nicht an
  const db = openLedger(file);
  const perSave = [];
  const startedAll = performance.now();
  for (let i = 1; i <= max; i += 1) {
    const state = stateOf(records, i);
    perSave.push(timed(() => appendOne(db, records[i - 1], i - 1, state.scorecard, state.memos[0])).ms);
  }
  const total = performance.now() - startedAll;
  db.close();
  return {
    signals: max,
    total,
    perSignal: total / max,
    medianSave: median(perSave),
    lastSave: perSave[perSave.length - 1],
    bytes: dbBytes(file),
  };
}

// ── 5. Ganzkette: echter Sammler + echter Dienst gegen reinen Speicher ──────
function measureChain(max) {
  const file = ledgerFile(`chain-${max}`);
  const store = createStoreService({ indexFile: indexFile(`chain-${max}`), ledgerFile: file });
  let storeMs = 0;
  let saves = 0;
  const collector = createSignalCollector({
    contracts,
    rules,
    onPersist: (snapshot) => {
      storeMs += timed(() => store.save(NAMESPACE, snapshot)).ms;
      saves += 1;
    },
  });
  const startedAll = performance.now();
  for (let i = 0; i < max; i += 1) collector.observe(...Object.values(rating(`msg-${i}`)));
  const total = performance.now() - startedAll;

  // Derselbe Lauf OHNE Ablage: der Unterschied ist der Anteil der Ablage.
  const memoryOnly = createSignalCollector({ contracts, rules });
  const startedMemory = performance.now();
  for (let i = 0; i < max; i += 1) memoryOnly.observe(...Object.values(rating(`msg-${i}`)));
  const totalMemory = performance.now() - startedMemory;

  return {
    signals: max,
    total,
    totalMemory,
    storeMs,
    storeShare: total === 0 ? 0 : storeMs / total,
    saves,
    bytes: dbBytes(file),
    records: collector.stats().records,
  };
}

// ── Bericht ─────────────────────────────────────────────────────────────────
const result = { measurements: [], breakdown: [], chain: [], node: process.versions.node, work: WORK };

console.log('─'.repeat(78));
console.log('Kosten der Ablage bei vielen Signalen — Neuschreiben gegen Anhängen');
console.log('─'.repeat(78));
console.log(`  Node:    ${process.versions.node}   Ort: ${WORK}`);
console.log(`  Ablage:  shinon_index_store (${NAMESPACE}), SQLite via node:sqlite`);
console.log('');

console.log('1. Zeilen: kostet das Ersetzen mehr, wenn mehr Zeilen dastehen?');
console.log('     Zeilen | writeMemory | je Zeile | DB');
for (const max of ROWS) {
  const row = measureRows(max);
  result.measurements.push({ variant: 'zeilen', ...row });
  console.log(
    `     ${String(max).padStart(6)} | ${ms(row.write).padStart(11)} | ${ms(row.perRow).padStart(8)} | ${kb(row.bytes)}`,
  );
}
console.log('');

const breakdown = measureBreakdown(ROWS[0]);
result.breakdown = breakdown.steps;
console.log(`2. Zerlegung EINES Schreibens (${breakdown.rows} Zeilen), zweite Runde = eingelaufen:`);
for (const step of breakdown.steps.filter((entry) => entry.round === 1)) {
  console.log(`     ${step.label.padEnd(48)} ${ms(step.ms).padStart(9)}`);
}
console.log('');

console.log('3. Neuschreiben: N Signale, jedes schreibt den ganzen Stand neu');
console.log('     Signale | gesamt     | je Signal | Median/ Schreiben | letztes  | DB');
for (const max of SIGNALS) {
  const row = measureRewrite(max);
  result.measurements.push({ variant: 'neuschreiben', ...row });
  console.log(
    `     ${String(max).padStart(7)} | ${ms(row.total).padStart(10)} | ${ms(row.perSignal).padStart(9)} | ` +
      `${ms(row.medianSave).padStart(17)} | ${ms(row.lastSave).padStart(8)} | ${kb(row.bytes)}`,
  );
}
console.log('');

console.log('4. Anhängen (Vergleich: eine Zeile + Zusammenfassung je Signal)');
console.log('     Signale | gesamt     | je Signal | Median/ Schreiben | DB');
for (const max of SIGNALS) {
  const row = measureAppend(max);
  result.measurements.push({ variant: 'anhaengen', ...row });
  console.log(
    `     ${String(max).padStart(7)} | ${ms(row.total).padStart(10)} | ${ms(row.perSignal).padStart(9)} | ` +
      `${ms(row.medianSave).padStart(17)} | ${kb(row.bytes)}`,
  );
}
console.log('');

console.log('5. Ganzkette (echter Sammler + echter Dienst) gegen reinen Speicher');
console.log('     Signale | gesamt (Ablage an) | davon Ablage | Anteil | gesamt (nur Speicher) | Protokollzeilen');
for (const max of CHAIN) {
  const row = measureChain(max);
  result.chain.push(row);
  console.log(
    `     ${String(max).padStart(7)} | ${ms(row.total).padStart(18)} | ${ms(row.storeMs).padStart(12)} | ` +
      `${(row.storeShare * 100).toFixed(1).padStart(5)}% | ${ms(row.totalMemory).padStart(21)} | ${String(row.records).padStart(15)}`,
  );
}
console.log('');

if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
if (KEEP) console.log(`Behalten: ${WORK}`);
else if (!JSON_OUT) rmSync(WORK, { recursive: true, force: true });
if (JSON_OUT && existsSync(WORK)) console.log(`(JSON-Ausgabe: Arbeitsverzeichnis bleibt unter ${WORK})`);
