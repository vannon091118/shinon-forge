#!/usr/bin/env node
/**
 * probe.mjs — sammelt den BEWEIS eines E2E-Laufs, ohne dem Modell zu glauben.
 *
 * Drei Quellen, die unabhaengig vom Chat existieren:
 *   1. der Project Index (SQLite): welche Dateien/Symbole/Chunks sieht MAX?
 *   2. das Scoring-Ledger: welche Signale liegen wirklich vor, aus welchen Sitzungen?
 *   3. der Prompter-Trace (SSE): welche Entscheidung traf der Vorfilter?
 * Dazu der Dateibestand des Projekts. Ausgabe ist JSON (`--out`), damit ein
 * spaeterer Lauf gegen diesen vergleichen kann.
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { resolveContext } from '../../packages/project-index/assets/index-core.js';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
};

const WORKSPACE = resolve(arg('--workspace', process.cwd()));
const OUT = arg('--out', '');
const PROMPT = arg('--prompt', 'Welche Dateien regeln die Zustandsmaschine und die Kapazitaet?');

function walk(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', 'coverage', '.shinon'].includes(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
}

function indexReport() {
  const dir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'shinon', 'indexes');
  let entries;
  try { entries = readdirSync(dir); } catch { return { found: false, reason: 'kein Index-Cache' }; }
  for (const name of entries) {
    const file = join(dir, name, 'index.sqlite');
    try {
      const db = new DatabaseSync(file, { readOnly: true });
      const meta = Object.fromEntries(db.prepare('select key, value from meta').all().map((row) => [row.key, row.value]));
      if (meta.root !== WORKSPACE) { db.close(); continue; }
      const count = (sql) => db.prepare(sql).get().n;
      const report = {
        found: true,
        file,
        rootId: meta.root_id ?? null,
        updatedAtMs: Number(meta.updated_at_ms ?? 0),
        schemaVersion: Number(meta.schema_version ?? 0),
        files: count('select count(*) as n from files'),
        symbols: count('select count(*) as n from symbols'),
        chunks: count('select count(*) as n from chunks'),
        memoryRows: count('select count(*) as n from memory'),
        indexedPaths: db.prepare('select path from files order by path').all().map((row) => row.path),
      };
      try {
        const context = resolveContext(db, { prompt: PROMPT, project: WORKSPACE.split('/').pop(), budgetTokens: 6000 });
        report.query = {
          files: context.files?.map((file) => file.path) ?? [],
          symbols: context.symbols?.length ?? 0,
          tokens: context.tokens ?? null,
        };
      } catch (error) {
        report.query = { error: error.message };
      }
      db.close();
      return report;
    } catch {
      // naechster Kandidat
    }
  }
  return { found: false, reason: `kein Index fuer ${WORKSPACE}` };
}

function ledgerReport() {
  const file = join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'shinon', 'ledger.sqlite');
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const byNamespace = db.prepare('select namespace, count(*) as n from memory group by namespace').all()
      .map((row) => ({ namespace: row.namespace, rows: row.n }));
    const records = db.prepare("select doc from memory where namespace = 'shinon.scoring/ledger-v1'").all()
      .map((row) => JSON.parse(row.doc));
    // Das Ledger traegt zwei Formen: Score-Zeilen (kind=score) und Sitzungs-
    // Zusammenfassungen (questions/signals ohne kind). Sie zu addieren waere
    // eine falsche Zahl — getrennt zaehlen ist die einzige ehrliche Variante.
    const scores = records.filter((record) => record.kind === 'score' || record.kind === 'retract');
    const summaries = records.filter((record) => record.kind === undefined);
    const sessions = new Set(scores.map((record) => record.session_id).filter(Boolean));
    const signals = {};
    for (const record of scores) signals[record.signal ?? '(ohne Signal)'] = (signals[record.signal ?? '(ohne Signal)'] ?? 0) + 1;
    const orphanSessions = scores.filter((record) => record.session_id === undefined).length;
    const workspaceField = records.some((record) => 'workspace' in record || 'root_id' in record);
    db.close();
    return {
      file,
      rows: records.length,
      scores: scores.length,
      summaries: summaries.length,
      sessions: sessions.size,
      orphanSessions,
      workspaceField,
      signals,
      byNamespace,
    };
  } catch (error) {
    return { file, error: error.message };
  }
}

async function traceReport(url) {
  if (url === null) return { skipped: 'kein --trace-url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const reader = response.body.getReader();
    const { value } = await reader.read();
    reader.cancel().catch(() => {});
    const text = new TextDecoder().decode(value ?? new Uint8Array());
    const data = text.split('data: ')[1];
    return { status: response.status, records: data === undefined ? [] : JSON.parse(data) };
  } catch (error) {
    return { error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

const report = {
  at: new Date().toISOString(),
  workspace: WORKSPACE,
  prompt: PROMPT,
  files: walk(WORKSPACE),
  index: indexReport(),
  ledger: ledgerReport(),
  trace: await traceReport(arg('--trace-url', null)),
};

const text = `${JSON.stringify(report, null, 2)}\n`;
if (OUT === '') process.stdout.write(text);
else { writeFileSync(OUT, text); console.log(`probe: ${OUT}`); }
