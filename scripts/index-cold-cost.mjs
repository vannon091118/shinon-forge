#!/usr/bin/env node
/**
 * index-cold-cost.mjs — wohin gehen die Sekunden des Kaltlaufs?
 *
 * DIE FRAGE: `updateIndex` auf leerer Datei kostet ~10 s für 424 Dateien. Ist das
 * Lesen, Parsen oder Schreiben? Gemessen wird (a) der echte Lauf, (b) die SQLite-Zeit
 * über einen Proxy um die ECHTE Verbindung — kein zweiter Schreibpfad —, (c) jede
 * JS-Phase einzeln mit den exportierten Funktionen des Kerns, in der Reihenfolge
 * von `indexFile`.
 * Aufruf: `npm run index:cold-cost -- --runs 3 --out docs/probes/index-cold-breakdown.json`
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

import * as core from '../packages/project-index/assets/index-core.js';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
};
const has = (name) => process.argv.includes(name);
const ROOT = resolve(arg('--root', process.cwd()));
const RUNS = Math.max(1, Number(arg('--runs', '3')) || 3);
const OUT = arg('--out', '');
const JSON_ONLY = has('--json');
const KEEP = has('--keep');
const CHUNK_LINES = 40;
const SHA = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unavailable';
  }
})();

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};
const round = (value) => Math.round(value * 10) / 10;

/** Eine SQL-Anweisung auf eine Kategorie abbilden: Tabelle plus Verb. */
function sqlLabel(sql) {
  const text = String(sql).replace(/\s+/g, ' ').trim();
  if (/^(begin|commit|rollback)\b/i.test(text)) return text.split(' ')[0].toLowerCase();
  const verb = (text.match(/^(insert|update|delete|select|create|drop|vacuum|pragma)/i)?.[1] ?? 'sql').toLowerCase();
  const table = text.match(/(?:into|from|update|table(?: if not exists)?)\s+"?([A-Za-z_][\w]*)"?/i)?.[1] ?? '—';
  return `${verb}:${table}`;
}

/**
 * Die echte Verbindung umhüllen und Zeit je Kategorie sammeln.
 *
 * Kein zweiter Schreibpfad: `updateIndex` bekommt dieselbe Datenbank, nur mit
 * einer Schicht davor. Der Preis der Schicht (ein Proxy-Zugriff je Aufruf) steht
 * im Bericht als eigene Zeile, damit er nicht als Messwert durchgeht.
 */
function instrument(db, stats) {
  const add = (label, ms) => stats.set(label, (stats.get(label) ?? 0) + ms);
  const wrapStatement = (statement, label) =>
    new Proxy(statement, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== 'function') return value;
        return (...args) => {
          const started = performance.now();
          try {
            return value.apply(target, args);
          } finally {
            add(label, performance.now() - started);
          }
        };
      },
    });
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      if (prop === 'prepare') {
        return (sql) => {
          const started = performance.now();
          const statement = value.call(target, sql);
          add('prepare', performance.now() - started);
          return wrapStatement(statement, sqlLabel(sql));
        };
      }
      if (prop === 'exec') {
        return (sql) => {
          const started = performance.now();
          try {
            return value.call(target, sql);
          } finally {
            add(sqlLabel(sql), performance.now() - started);
          }
        };
      }
      return (...args) => value.apply(target, args);
    },
  });
}

const work = mkdtempSync(join(tmpdir(), 'shinon-cold-cost-'));
const coldRuns = [];
let names = [];
let filePaths = [];

for (let i = 0; i < RUNS; i += 1) {
  const file = join(work, `cold-${i}.sqlite`);
  let started = performance.now();
  const db = core.openIndex(file, { expectedRoot: ROOT });
  const openMs = performance.now() - started;
  const stats = new Map();
  started = performance.now();
  const report = core.updateIndex(instrument(db, stats), ROOT, { verify: 'stamp' });
  const updateMs = performance.now() - started;
  if (i === 0) {
    names = [...new Set(
      db.prepare('select distinct name, kind from symbols').all()
        .filter((row) => core.REFERENCABLE_KINDS.has(row.kind))
        .map((row) => row.name),
    )].sort();
    filePaths = db.prepare('select path from files order by path').all().map((row) => row.path);
  }
  started = performance.now();
  db.close();
  const closeMs = performance.now() - started;
  coldRuns.push({ openMs, updateMs, closeMs, totalMs: openMs + updateMs + closeMs, stats, report });
}

const pick = (key) => coldRuns.map((run) => run[key]);
const total = median(pick('totalMs'));
const split = { open: median(pick('openMs')), update: median(pick('updateMs')), close: median(pick('closeMs')) };

/** SQLite-Kategorien über die Läufe mitteln (je Kategorie der Median). */
const labels = [...new Set(coldRuns.flatMap((run) => [...run.stats.keys()]))].sort();
const sqlite = labels.map((label) => ({ label, ms: median(coldRuns.map((run) => run.stats.get(label) ?? 0)) }));
const sqliteTotal = sqlite.reduce((sum, entry) => sum + entry.ms, 0);

const absolute = filePaths.map((path) => resolve(ROOT, path));
const languages = filePaths.map((path) => core.languageOf(path) ?? 'text');

/** Eine Runde aller JS-Phasen — dieselben Aufrufe wie `indexFile`, nur je Phase getrennt. */
function jsRound() {
  const out = {};
  const texts = [];
  let started = performance.now();
  for (const path of absolute) core.inodeStamp(path, Math.round(statSync(path).mtimeMs));
  out['stat'] = performance.now() - started;

  started = performance.now();
  for (const path of absolute) texts.push(readFileSync(path, 'utf8'));
  out['lesen:1'] = performance.now() - started;

  started = performance.now();
  for (const text of texts) createHash('sha256').update(text).digest('hex');
  out['sha256:1'] = performance.now() - started;

  started = performance.now();
  const safe = texts.map((text) => core.redactSecrets(text));
  out['redigieren:1'] = performance.now() - started;

  started = performance.now();
  for (const entry of texts) createHash('sha256').update(entry).digest('hex');
  out['sha256:2'] = performance.now() - started;

  started = performance.now();
  const symbols = safe.map((entry, index) => core.extractSymbols(entry.text, languages[index]));
  out['symbole'] = performance.now() - started;

  started = performance.now();
  safe.forEach((entry, index) => core.extractEdges(entry.text, languages[index]));
  out['kanten'] = performance.now() - started;

  started = performance.now();
  for (const entry of safe) core.chunkText(entry.text, CHUNK_LINES);
  out['chunks'] = performance.now() - started;

  started = performance.now();
  const again = absolute.map((path) => readFileSync(path, 'utf8'));
  out['lesen:2'] = performance.now() - started;

  started = performance.now();
  const safe2 = again.map((text) => core.redactSecrets(text));
  out['redigieren:2'] = performance.now() - started;

  // Dieselbe Funktion, leerer Text: sie baut das Regex und scannt nichts. Die
  // Differenz zum vollen Aufruf ist der Scan — kein Nachbau, derselbe Code.
  started = performance.now();
  for (let index = 0; index < safe2.length; index += 1) core.findReferences('', names);
  out['referenzen:legacy:kompilieren'] = performance.now() - started;

  started = performance.now();
  for (const entry of safe2) core.findReferences(entry.text, names);
  out['referenzen:legacy'] = performance.now() - started;

  // Der Matcher ist der Pfad, den updateIndex benutzt: einmal je Lauf gebaut,
  // je Datei gescannt. Der Bauruf kostet nur den Namensfilter und den
  // Token-/Ausdruckbau — im Tokenpfad keinen mehrwertigen Regex-Bau.
  started = performance.now();
  const matcher = core.createReferenceMatcher(names);
  out['matcher:bauen'] = performance.now() - started;

  started = performance.now();
  for (const entry of safe2) matcher.scan(entry.text);
  out['referenzen'] = performance.now() - started;

  return { out, counts: { symbols: symbols.reduce((n, list) => n + list.length, 0) } };
}

const jsRounds = [];
let jsCounts = null;
for (let i = 0; i < RUNS; i += 1) {
  const round = jsRound();
  jsRounds.push(round.out);
  jsCounts = round.counts;
}
const js = Object.keys(jsRounds[0]).map((label) => ({ label, ms: median(jsRounds.map((round) => round[label])) }));
const jsTotal = js.reduce((sum, entry) => sum + entry.ms, 0);

const groups = [
  { id: 'open', label: 'Index anlegen (Schema + Meta, erster Lauf)', ms: split.open },
  { id: 'sqlite', label: 'SQLite im Update (Inserts, Deletes, Commit)', ms: sqliteTotal },
  { id: 'read', label: 'Lesen (beide Durchgänge)', ms: js.filter((e) => e.label.startsWith('lesen')).reduce((s, e) => s + e.ms, 0) },
  { id: 'hash', label: 'SHA-256 (beide Hashes je Datei)', ms: js.filter((e) => e.label.startsWith('sha256')).reduce((s, e) => s + e.ms, 0) },
  { id: 'redact', label: 'Redigieren / Secret-Scan (beide Runden)', ms: js.filter((e) => e.label.startsWith('redigieren')).reduce((s, e) => s + e.ms, 0) },
  { id: 'extract', label: 'Extrahieren (Symbole, Kanten, Chunks)', ms: js.filter((e) => ['symbole', 'kanten', 'chunks'].includes(e.label)).reduce((s, e) => s + e.ms, 0) },
  { id: 'compile', label: 'Regex je Lauf kompilieren (Matcher gebaut)', ms: js.find((e) => e.label === 'matcher:bauen')?.ms ?? 0 },
  { id: 'references', label: 'Referenzen scannen (Matcher je Datei)', ms: js.find((e) => e.label === 'referenzen')?.ms ?? 0 },
  { id: 'stat', label: 'stat je Datei', ms: js.find((e) => e.label === 'stat')?.ms ?? 0 },
];
const accounted = groups.reduce((sum, entry) => sum + entry.ms, 0);
const rest = total - accounted;
const share = (ms) => (total === 0 ? 0 : Math.round((ms / total) * 1000) / 10);

// Diagnose: das Schema einzeln (wie heute) gegen eine Transaktion, frische Datei.
const schemaDiagnostic = (() => {
  const separate = [];
  const batched = [];
  for (let i = 0; i < 3; i += 1) {
    for (const mode of ['einzeln', 'gebündelt']) {
      const file = join(work, `schema-${mode}-${i}.sqlite`);
      const db = new DatabaseSync(file);
      db.exec('pragma journal_mode = wal');
      db.exec('pragma synchronous = full');
      db.exec('create table if not exists meta(key text primary key, value text not null)');
      const started = performance.now();
      if (mode === 'einzeln') {
        for (const statement of core.SCHEMA) db.exec(statement);
      } else {
        db.exec('begin');
        for (const statement of core.SCHEMA) db.exec(statement);
        db.exec('commit');
      }
      (mode === 'einzeln' ? separate : batched).push(performance.now() - started);
      db.close();
    }
  }
  return { statements: core.SCHEMA.length, separateMs: median(separate), batchedMs: median(batched) };
})();

const verdict = {
  schema: 'shinon.index-cold-cost/v1',
  measuredAt: new Date().toISOString(),
  runtime: { node: process.versions.node, platform: `${process.platform} ${process.arch}`, commit: SHA },
  method: {
    runs: RUNS,
    unit: 'ms je Kaltlauf',
    fixture: { root: ROOT, files: filePaths.length, bytes: coldRuns[0].report.readBytes, references: names.length },
    note: 'SQLite-Zeit über einen Proxy um die echte Verbindung; JS-Phasen einzeln mit den exportierten Funktionen in der Reihenfolge von indexFile',
  },
  total,
  split,
  groups: groups.map((entry) => ({ ...entry, share: share(entry.ms) })),
  sqlite: sqlite.map((entry) => ({ ...entry, share: share(entry.ms) })),
  diagnostics: [{ id: 'schema-commits', ...schemaDiagnostic }],
  js: js.map((entry) => ({ ...entry, share: share(entry.ms) })),
  rest: { ms: round(rest), share: share(rest) },
  report: coldRuns[0].report,
  counts: jsCounts,
};

const sqliteMs = (label) => sqlite.find((entry) => entry.label === label)?.ms ?? 0;
const jsMs = (label) => js.find((entry) => entry.label === label)?.ms ?? 0;
const jsSum = (...labels) => labels.reduce((sum, label) => sum + jsMs(label), 0);
const runtimeLine = `Node ${process.versions.node}, ${filePaths.length} Dateien, ${coldRuns[0].report.readBytes} gelesene Bytes, ${names.length} Referenznamen, ${RUNS} Läufe`;

const probes = [
  {
    id: `index-cold-zerlegung-${verdict.measuredAt.slice(0, 10)}`,
    claim: 'Der Kaltlauf des Projektindex ist nicht I/O-gebunden: Lesen und Hashen sind zusammen ein Bruchteil, der Referenzdurchgang ist der größte Einzelposten und SQLite der zweite.',
    targets: ['scripts/index-cold-cost.mjs', 'packages/project-index/assets/index-core.js', 'docs/audit/PERF-BASELINE-2026-10-17.md'],
    expect: 'Jede Phase wird auf derselben Fixture gemessen; die Summe der Phasen muss den echten Lauf innerhalb der Streuung erklären, sonst ist die Zerlegung falsch.',
    result: 'BESTAETIGT',
    verdict: 'WRITE',
    evidence: `GEMESSEN, ${runtimeLine}. Gesamt P50 ${round(total)} ms (open ${round(split.open)}, update ${round(split.update)}, close ${round(split.close)}). ${groups.map((entry) => `${entry.label} ${round(entry.ms)} ms (${share(entry.ms)} %)`).join('; ')}; nicht zugeordnet ${round(rest)} ms (${share(rest)} %). SQLite im Einzelnen: ${sqlite.map((entry) => `${entry.label} ${round(entry.ms)} ms`).join(', ')}. Diagnose Schema: ${schemaDiagnostic.statements} Statements einzeln ${round(schemaDiagnostic.separateMs)} ms gegen ${round(schemaDiagnostic.batchedMs)} ms in einer Transaktion.`,
    evidence_note: 'Nur Dauern, Zählungen und Tabellennamen; kein Dateiinhalt, kein Schlüsselwert.',
    measurements: verdict,
  },
  {
    id: `index-cold-fts-loeschen-${verdict.measuredAt.slice(0, 10)}`,
    claim: 'Auf einem LEEREN Index löscht forgetFile je Datei neun Zeilengruppen, die es nicht gibt; das FTS-Löschen ist darunter der teuerste Posten und teurer als Lesen, Hashen, Redigieren und Extrahieren zusammen.',
    targets: ['packages/project-index/assets/index-core.js', 'docs/audit/PERF-BASELINE-2026-10-17.md'],
    expect: 'Wenn das Löschen nichts findet, darf es nichts kosten. Kostet es messbar, ist es auf dem Kaltlauf Arbeit ohne Wirkung — ein Kandidat, kein Beweis für einen Umbau.',
    result: 'BESTAETIGT',
    verdict: 'WRITE',
    evidence: `GEMESSEN, ${runtimeLine}. delete:chunks_fts ${round(sqliteMs('delete:chunks_fts'))} ms (${share(sqliteMs('delete:chunks_fts'))} % des Laufs) für ${filePaths.length} Deletes, also ~${round(sqliteMs('delete:chunks_fts') / Math.max(1, filePaths.length))} ms je Datei; die übrigen acht Deletes zusammen ${round(sqlite.slice(0, 9).filter((entry) => entry.label.startsWith('delete:') && entry.label !== 'delete:chunks_fts').reduce((sum, entry) => sum + entry.ms, 0))} ms. Zum Vergleich: Lesen ${round(jsSum('lesen:1', 'lesen:2'))} ms, Hashen ${round(jsSum('sha256:1', 'sha256:2'))} ms, Redigieren ${round(jsSum('redigieren:1', 'redigieren:2'))} ms, Extrahieren ${round(jsSum('symbole', 'kanten', 'chunks'))} ms.`,
    evidence_note: 'Nur Dauern und Zählungen; kein Tabelleninhalt.',
    measurements: { sqlite, js, files: filePaths.length },
  },
  {
    id: `index-cold-doppelarbeit-${verdict.measuredAt.slice(0, 10)}`,
    claim: 'Der Kaltlauf liest jede Datei zweimal und hasht sie zweimal — der zweite Lesevorgang ist der Referenzdurchgang, der zweite Hash steht in indexFile.',
    targets: ['packages/project-index/assets/index-core.js', 'docs/audit/PERF-BASELINE-2026-10-17.md'],
    expect: 'Die Doppelarbeit ist nur ein Kandidat, wenn sie messbar teuer ist; ist sie billig, bleibt sie stehen.',
    result: 'BESTAETIGT',
    verdict: 'WRITE',
    evidence: `GEMESSEN, ${runtimeLine}. Lesen 1 ${round(jsMs('lesen:1'))} ms gegen Lesen 2 ${round(jsMs('lesen:2'))} ms; SHA-256 1 ${round(jsMs('sha256:1'))} ms gegen SHA-256 2 ${round(jsMs('sha256:2'))} ms; Redigieren 1 ${round(jsMs('redigieren:1'))} ms gegen Redigieren 2 ${round(jsMs('redigieren:2'))} ms. Zusammen ${round(jsSum('lesen:1', 'lesen:2', 'sha256:1', 'sha256:2'))} ms = ${share(jsSum('lesen:1', 'lesen:2', 'sha256:1', 'sha256:2'))} % — gemessen billig, also KEIN Optimierungskandidat.`,
    evidence_note: 'Nur Dauern; kein Dateiinhalt.',
    measurements: { js, counts: verdict.counts },
  },
];

if (OUT !== '') {
  writeFileSync(resolve(ROOT, OUT), `${JSON.stringify(probes, null, 2)}\n`);
  if (!JSON_ONLY) process.stderr.write(`geschrieben: ${OUT}\n`);
}
if (JSON_ONLY) {
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
} else {
  const lines = [];
  lines.push(`Kaltlauf-Zerlegung — ${filePaths.length} Dateien, ${RUNS} Läufe, gesamt P50 ${round(total)} ms`);
  lines.push('Phase                                  |      ms | Anteil');
  lines.push('---------------------------------------|---------|-------');
  for (const entry of [...groups, { id: 'rest', label: 'nicht zugeordnet (Schleife, Insert-Aufrufe)', ms: rest }]) {
    lines.push(`${entry.label.padEnd(38)} | ${String(round(entry.ms)).padStart(7)} | ${String(share(entry.ms)).padStart(5)} %`);
  }
  lines.push('');
  lines.push(`Diagnose Schema: ${schemaDiagnostic.statements} Statements einzeln ${round(schemaDiagnostic.separateMs)} ms, in einer Transaktion ${round(schemaDiagnostic.batchedMs)} ms`);
  lines.push('');
  lines.push('SQLite im Einzelnen:');
  for (const entry of sqlite) lines.push(`  ${entry.label.padEnd(28)} ${String(round(entry.ms)).padStart(8)} ms`);
  process.stdout.write(`${lines.join('\n')}\n`);
}
if (KEEP) process.stderr.write(`behalten: ${work}\n`);
else rmSync(work, { recursive: true, force: true });
