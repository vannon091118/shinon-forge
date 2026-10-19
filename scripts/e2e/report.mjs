#!/usr/bin/env node
/**
 * report.mjs — was ein Lauf BEWIESEN hat, nicht nur geloggt.
 * AUS / SICHTBAR / SPUR / WIRKUNG je Paket aus vier Quellen (Prozesslog,
 * Index-SQLite, Ledger-SQLite, Session-Store). Fehlt eine Quelle, steht der
 * Grund im Feld; der Bericht raet nichts.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
};

const WORKSPACE = resolve(arg('--workspace', process.cwd()));
const LOG = arg('--log', null);
const LOG_ERR = arg('--log-stderr', null);
const STORE = arg('--store', null);
const OUT = arg('--out', '');
const MUTATIONS = arg('--mutations', null);
const INDEX_ROOT = arg('--index-root', join(process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? '', '.cache'), 'shinon', 'indexes'));
const LEDGER = arg('--ledger', join(process.env.XDG_DATA_HOME ?? join(process.env.HOME ?? '', '.local', 'share'), 'shinon', 'ledger.sqlite'));

const SKIP = new Set(['node_modules', '.git', '.shinon', 'dist', 'coverage']);

function walk(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
}

function logLines(file) {
  if (file === null || !existsSync(file)) return null;
  return readFileSync(file, 'utf8').split('\n');
}

/** Aktivierungszeilen je Paket: die ERSTE Zeile ist die Registrierung. */
function activation(lines) {
  const byPackage = new Map();
  for (const line of lines) {
    const match = line.match(/^\[shinon-([a-z0-9-]+)\]\s+(.*)$/);
    if (match === null) continue;
    const [, pkg, rest] = match;
    if (!byPackage.has(pkg)) byPackage.set(pkg, []);
    byPackage.get(pkg).push(rest);
  }
  return byPackage;
}

function prompterTraces(lines) {
  const traces = [];
  for (const line of lines) {
    const match = line.match(/\[shinon-prompter\] Trace: (accepted|rejected) intent=(\S+) pattern=(\S+) bias=(\S*) sem=(\S+) features=(\S*) raw="([\s\S]*)"$/);
    if (match === null) continue;
    const [, verdict, intent, pattern, bias, sem, features, raw] = match;
    traces.push({ verdict, intent, pattern, bias, sem: Number(sem), features: features.split('+').filter(Boolean), raw });
  }
  return traces;
}

/** Wie oft der One-Shot wirklich etwas geliefert hat — getrennt von der Durchreiche. */
function oneShot(lines) {
  let accepted = 0;
  let rejected = 0;
  for (const line of lines) {
    if (line.includes('[shinon-prompter] One-Shot: Ergebnis angenommen')) accepted += 1;
    if (line.includes('[shinon-prompter] verworfene One-Shot-Antwort')) rejected += 1;
  }
  return { accepted, rejected };
}

function indexRuns(lines) {
  const runs = [];
  for (const line of lines) {
    const match = line.match(/\[shinon-project-index\] Lauf im (\w+) \(verify=(\w+)\): (\d+) neu.*?— (\d+) Dateien, (\d+) Symbole, (\d+) Chunks/);
    if (match === null) continue;
    runs.push({ where: match[1], verify: match[2], written: Number(match[3]), files: Number(match[4]), symbols: Number(match[5]), chunks: Number(match[6]) });
  }
  return runs;
}

function indexState() {
  if (!existsSync(INDEX_ROOT)) return { found: false, reason: 'kein Index-Cache' };
  for (const name of readdirSync(INDEX_ROOT)) {
    const file = join(INDEX_ROOT, name, 'index.sqlite');
    if (!existsSync(file)) continue;
    try {
      const db = new DatabaseSync(file, { readOnly: true });
      const meta = Object.fromEntries(db.prepare('select key, value from meta').all().map((row) => [row.key, row.value]));
      if (meta.root !== WORKSPACE) { db.close(); continue; }
      const state = {
        found: true,
        file,
        rootId: meta.root_id ?? null,
        files: db.prepare('select count(*) n from files').get().n,
        symbols: db.prepare('select count(*) n from symbols').get().n,
        chunks: db.prepare('select count(*) n from chunks').get().n,
        indexedPaths: db.prepare('select path from files order by path').all().map((row) => row.path),
      };
      db.close();
      return state;
    } catch {
      // naechster Kandidat — ein kaputter Index ist kein Fund fuer diesen Workspace
    }
  }
  return { found: false, reason: `kein Index fuer ${WORKSPACE}` };
}

function ledgerState() {
  if (!existsSync(LEDGER)) return { found: false, reason: 'kein Ledger' };
  try {
    const db = new DatabaseSync(LEDGER, { readOnly: true });
    const rows = db.prepare('select namespace, kind, count(*) n from memory group by namespace, kind').all();
    const records = db.prepare("select doc from memory where namespace = 'shinon.scoring/ledger-v1' and kind = 'record'").all()
      .map((row) => { try { return JSON.parse(row.doc); } catch { return null; } })
      .filter(Boolean);
    const sessions = new Set(records.map((record) => record.session_id).filter(Boolean));
    const signals = {};
    for (const record of records) {
      const key = record.signal ?? '(ohne Signal)';
      signals[key] = (signals[key] ?? 0) + 1;
    }
    const workspaceField = records.some((record) => 'workspace' in record || 'root_id' in record);
    db.close();
    return { found: true, file: LEDGER, rows, records: records.length, sessions: sessions.size, workspaceField, signals };
  } catch (error) {
    return { found: false, reason: error.message };
  }
}

function sessionState() {
  if (STORE === null || !existsSync(STORE)) return { found: false, reason: 'kein Session-Store' };
  try {
    const record = JSON.parse(readFileSync(STORE, 'utf8')).record;
    const turns = record?.rows?.turnOutline?.val?.turns ?? [];
    return {
      found: true,
      cwd: record?.identity?.cwd ?? null,
      turns: turns.length,
      outline: turns.map((turn) => ({ turn: turn.turn, prompt: turn.prompt, response: turn.response })),
      tokenUsage: record?.rows?.tokenUsage?.val?.totals ?? null,
      stats: record?.rows?.sessionStats?.val ?? null,
    };
  } catch (error) {
    return { found: false, reason: error.message };
  }
}

function mutationState() {
  if (MUTATIONS === null || !existsSync(MUTATIONS)) return { found: false, reason: 'keine Mutationsdatei' };
  try {
    const data = JSON.parse(readFileSync(MUTATIONS, 'utf8'));
    const cases = Array.isArray(data) ? data : data.cases ?? [];
    const detected = cases.filter((entry) => entry.erkannt === true).length;
    const repaired = cases.filter((entry) => entry.repariert === true).length;
    return { found: true, cases, total: cases.length, detected, repaired, rate: cases.length === 0 ? null : detected / cases.length };
  } catch (error) {
    return { found: false, reason: error.message };
  }
}

const lines = logLines(LOG);
const errLines = logLines(LOG_ERR) ?? [];
const files = walk(WORKSPACE);
const index = indexState();
const activationLines = lines === null ? new Map() : activation(lines);
const traces = lines === null ? [] : prompterTraces(lines);
const runs = lines === null ? [] : indexRuns(lines);
const shots = lines === null ? { accepted: 0, rejected: 0 } : oneShot([...lines, ...errLines]);

/** Je Paket: was ist belegt, und was ist nur eine Zeile? */
function classify() {
  const out = {};
  for (const [pkg, entries] of activationLines) {
    const text = entries.join(' | ');
    const off = /NICHT|nicht registriert|nicht angeboten/i.test(text);
    let verdict = 'SICHTBAR';
    const evidence = [entries[0]];
    if (pkg === 'prompter') {
      const accepted = traces.filter((trace) => trace.verdict === 'accepted').length;
      const rejected = traces.filter((trace) => trace.verdict === 'rejected').length;
      if (traces.length > 0) verdict = 'SPUR';
      evidence.push(`${accepted} angenommen, ${rejected} verworfen`);
    }
    if (pkg === 'project-index') {
      const stale = index.found && index.files < files.length;
      if (runs.length > 0) verdict = 'SPUR';
      evidence.push(`Laeufe=${runs.length}`, `Index=${index.found ? `${index.files}/${files.length} Dateien${stale ? ' (veraltet)' : ''}` : index.reason}`);
    }
    if (pkg === 'persona' && off) verdict = 'AUS';
    if (pkg === 'scoring') {
      const loaded = entries.find((entry) => entry.startsWith('Stand geladen'));
      if (loaded) verdict = 'SPUR';
      evidence.push(loaded ?? 'kein Stand geladen');
    }
    if (pkg === 'task-router') {
      const linear = lines === null ? 0 : lines.filter((line) => line.includes('[shinon-task-router] linearer Turn')).length;
      if (linear > 0) verdict = 'SPUR';
      evidence.push(`${linear} lineare Turns`);
    }
    out[pkg] = { verdict, evidence };
  }
  return out;
}

const intents = traces.map((trace) => trace.intent);
const reported = {
  at: new Date().toISOString(),
  workspace: WORKSPACE,
  sources: { log: LOG, logStderr: LOG_ERR, store: STORE, mutations: MUTATIONS, ledger: LEDGER, indexRoot: INDEX_ROOT },
  files: { count: files.length, list: files },
  index,
  indexRuns: runs,
  ledger: ledgerState(),
  session: sessionState(),
  mutations: mutationState(),
  prompter: {
    traces: traces.length,
    accepted: traces.filter((trace) => trace.verdict === 'accepted').length,
    rejected: traces.filter((trace) => trace.verdict === 'rejected').length,
    list: traces.map((trace) => ({ verdict: trace.verdict, intent: trace.intent, pattern: trace.pattern, sem: trace.sem, features: trace.features, raw: trace.raw.slice(0, 120) })),
  },
  packages: classify(),
  findings: {
    indexCoverage: index.found ? { indexed: index.files, workspace: files.length, stale: index.files < files.length } : null,
    prompter: {
      replacementRate: traces.length === 0 ? null : shots.accepted / traces.length,
      oneShot: shots,
      undefinedIntent: intents.filter((intent) => intent === 'UNDEFINED').length,
      turns: intents.length,
    },
    scoringMemory: { globalAcrossWorkspaces: ledgerState().found === true && ledgerState().workspaceField === false },
    mutations: mutationState().found ? { detected: mutationState().detected, repaired: mutationState().repaired, total: mutationState().total, rate: mutationState().rate } : null,
  },
};

const text = `${JSON.stringify(reported, null, 2)}\n`;
if (OUT === '') process.stdout.write(text);
else { writeFileSync(OUT, text); console.log(`report: ${OUT}`); }
