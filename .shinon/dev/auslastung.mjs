#!/usr/bin/env node
/**
 * auslastung.mjs — DEV-MESSWERKZEUG, nicht Teil des Produkts.
 *
 * Startet das Profil (oder haengt sich an einen laufenden PID) und schreibt
 * PARALLEL drei Messreihen, eine Zeile je Abtastung, als JSONL:
 *
 *   hw      CPU gesamt + Prozessbaum, RSS, Last, verfuegbarer RAM, Temperatur
 *   log     jede Zeile des Hosts, die Zahlen traegt (Prompter/Index/Boot)
 *   llm     je One-Shot: input/output/cache-Tokens, Dauer, Ausgang, Grund
 *
 * Am Ende: eine Zusammenfassung (p50/p95) auf stdout + `zusammenfassung.json`.
 *
 * Aufruf:
 *   node .shinon/dev/auslastung.mjs --seconds 120
 *   node .shinon/dev/auslastung.mjs --pid <pid> --seconds 60   # anhaengen
 *
 * Diese Datei ist gitignoriert (.gitignore: `.shinon/dev/`). Sie darf
 * limitieren, nichts — sie MISST. Kein Schluessel wird gelesen oder geloggt.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  return value === undefined || value.startsWith('--') ? true : value;
};

const PORT = Number(flag('port', 3099));
const SAMPLE_MS = Number(flag('sample', 500));
const SECONDS = Number(flag('seconds', 0));
const ATTACH = flag('pid', null);
const OUT_DIR = resolve(REPO, String(flag('out', '.shinon/dev')));

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonl = join(OUT_DIR, `messung-${stamp}.jsonl`);
const out = createWriteStream(jsonl, { flags: 'a' });
const write = (row) => out.write(`${JSON.stringify(row)}\n`);

// ── /proc lesen (Linux). Fehlt es, bleibt die jeweilige Reihe leer. ──────────
const readText = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

/** Gesamt-CPU: idle und total aus /proc/stat. Aufrufer rechnet die Differenz. */
function cpuTotals() {
  const line = readText('/proc/stat')?.split('\n')[0] ?? '';
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  if (parts.length < 4 || parts.some(Number.isNaN)) return null;
  const idle = parts[3] + (parts[4] ?? 0);
  const total = parts.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}

function meminfo() {
  const text = readText('/proc/meminfo');
  if (text === null) return null;
  const grab = (key) => {
    const found = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text);
    return found === null ? null : Number(found[1]) * 1024;
  };
  return { availableBytes: grab('MemAvailable'), totalBytes: grab('MemTotal') };
}

function temperatureC() {
  const base = '/sys/class/thermal';
  let names = [];
  try {
    names = readdirSync(base).filter((name) => name.startsWith('thermal_zone'));
  } catch {
    return null;
  }
  const values = [];
  for (const name of names) {
    const raw = readText(join(base, name, 'temp'));
    if (raw === null) continue;
    const milli = Number(raw.trim());
    if (Number.isFinite(milli)) values.push(milli / 1000);
  }
  return values.length === 0 ? null : Math.max(...values);
}

/** Alle PIDs unterhalb von `root` (der Prozessbaum, nicht nur ein Prozess). */
function tree(rootPid) {
  const pids = [];
  let entries = [];
  try {
    entries = readdirSync('/proc').filter((name) => /^\d+$/.test(name));
  } catch {
    return pids;
  }
  const parent = new Map();
  for (const name of entries) {
    const stat = readText(`/proc/${name}/stat`);
    if (stat === null) continue;
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 2).split(' ');
    parent.set(Number(name), Number(fields[1]));
  }
  const inTree = new Set([Number(rootPid)]);
  for (const pid of parent.keys()) {
    let cursor = pid;
    let hops = 0;
    while (hops < 64) {
      const up = parent.get(cursor);
      if (up === undefined || up === 0) break;
      if (inTree.has(up)) {
        inTree.add(pid);
        break;
      }
      cursor = up;
      hops += 1;
    }
  }
  for (const pid of inTree) pids.push(pid);
  return pids;
}

/** CPU-Zeit und RSS eines Prozesses aus /proc/<pid>/stat + status. */
function processSample(pid) {
  const stat = readText(`/proc/${pid}/stat`);
  if (stat === null) return null;
  const close = stat.lastIndexOf(')');
  const fields = stat.slice(close + 2).split(' ');
  const ticks = Number(fields[11]) + Number(fields[12]);
  const status = readText(`/proc/${pid}/status`) ?? '';
  const rss = /^VmRSS:\s+(\d+) kB/m.exec(status);
  const threads = /^Threads:\s+(\d+)/m.exec(status);
  return {
    pid,
    cpuTicks: Number.isFinite(ticks) ? ticks : null,
    rssBytes: rss === null ? null : Number(rss[1]) * 1024,
    threads: threads === null ? null : Number(threads[1]),
  };
}

// ── Log-Zeilen zu Messwerten ─────────────────────────────────────────────────
const USAGE = /usage=(\{[^}]*\})/;
const TOKENS = /"inputTokens":(\d+)[^}]*"outputTokens":(\d+)[^}]*"totalTokens":(\d+)/;
const DURATION = /Dauer=(\d+)ms/;

function llmRow(line) {
  if (!line.includes('[shinon-prompter]')) return null;
  if (!line.includes('One-Shot')) return null;
  const usage = USAGE.exec(line);
  const tokens = usage === null ? null : TOKENS.exec(usage[1]);
  const duration = DURATION.exec(line);
  const rejected = /verworfene One-Shot-Antwort \(([^)]*)\)/.exec(line);
  const accepted = line.includes('Ergebnis angenommen');
  if (usage === null && duration === null && rejected === null && !accepted) return null;
  return {
    outcome: rejected === null ? (accepted ? 'accepted' : 'unbekannt') : `verworfen:${rejected[1]}`,
    chars: Number(/\), (\d+) Zeichen/.exec(line)?.[1] ?? NaN) || null,
    durationMs: duration === null ? null : Number(duration[1]),
    inputTokens: tokens === null ? null : Number(tokens[1]),
    outputTokens: tokens === null ? null : Number(tokens[2]),
    totalTokens: tokens === null ? null : Number(tokens[3]),
  };
}

function indexRow(line) {
  if (!line.includes('[shinon-project-index]')) return null;
  const files = /(\d+) neu/.exec(line);
  const read = /(\d+) gelesen/.exec(line);
  if (files === null && read === null) return null;
  return { new: files === null ? null : Number(files[1]), read: read === null ? null : Number(read[1]) };
}

// ── Abtastung ────────────────────────────────────────────────────────────────
const samples = [];
const llm = [];
const events = [];
let previousCpu = cpuTotals();
let previousTicks = new Map();
let rootPid = ATTACH === null ? null : Number(ATTACH);
let child = null;
let stopping = false;

function sample() {
  const row = { t: Date.now(), kind: 'hw' };
  const cpu = cpuTotals();
  if (cpu !== null && previousCpu !== null) {
    const total = cpu.total - previousCpu.total;
    const idle = cpu.idle - previousCpu.idle;
    row.cpuPercent = total <= 0 ? null : Math.round(((total - idle) / total) * 1000) / 10;
  }
  previousCpu = cpu ?? previousCpu;

  const mem = meminfo();
  if (mem !== null) {
    row.ramAvailableBytes = mem.availableBytes;
    row.ramTotalBytes = mem.totalBytes;
    row.ramUsedPercent = mem.totalBytes === null ? null : Math.round((1 - mem.availableBytes / mem.totalBytes) * 1000) / 10;
  }
  const load = readText('/proc/loadavg');
  if (load !== null) row.load1 = Number(load.split(' ')[0]) || null;
  row.temperatureC = temperatureC();

  if (rootPid !== null) {
    let rss = 0;
    let ticks = 0;
    let threads = 0;
    let procs = 0;
    for (const pid of tree(rootPid)) {
      const one = processSample(pid);
      if (one === null) continue;
      procs += 1;
      rss += one.rssBytes ?? 0;
      threads += one.threads ?? 0;
      const before = previousTicks.get(pid) ?? one.cpuTicks;
      if (one.cpuTicks !== null && before !== null) ticks += one.cpuTicks - before;
      if (one.cpuTicks !== null) previousTicks.set(pid, one.cpuTicks);
    }
    row.treeProcs = procs;
    row.treeRssBytes = rss;
    row.treeThreads = threads;
    row.treeCpuTicks = ticks;
    row.treeCpuPercent = Math.round((ticks / (SAMPLE_MS / 1000) / 100) * 1000) / 10;
  }
  samples.push(row);
  write(row);
}

function onLine(line) {
  const text = line.trimEnd();
  if (text === '') return;
  const effect = llmRow(text);
  if (effect !== null) {
    const row = { t: Date.now(), kind: 'llm', ...effect };
    llm.push(row);
    write(row);
  }
  const index = indexRow(text);
  if (index !== null) {
    const row = { t: Date.now(), kind: 'index', ...index };
    events.push(row);
    write(row);
  }
  process.stdout.write(`${text}\n`);
}

function boot() {
  const binary = join(REPO, 'node_modules/.bin/dsh');
  const command = existsSync(binary) ? binary : 'dsh';
  child = spawn(command, ['--profile', 'shinon', '--no-open', '--port', String(PORT)], {
    cwd: REPO,
    env: { ...process.env, DSH_HOME: REPO },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  rootPid = child.pid;
  write({ t: Date.now(), kind: 'boot', pid: child.pid, port: PORT, command });
  let rest = '';
  const pump = (chunk) => {
    rest += chunk.toString();
    const lines = rest.split('\n');
    rest = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  };
  child.stdout.on('data', pump);
  child.stderr.on('data', pump);
  child.on('exit', (code, signal) => {
    write({ t: Date.now(), kind: 'exit', code, signal });
    stop(`Host beendet (code=${code}, signal=${signal})`);
  });
}

const quantile = (values, q) => {
  const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (list.length === 0) return null;
  const position = (list.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return Math.round((list[low] + (list[high] - list[low]) * (position - low)) * 100) / 100;
};

function stop(reason) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  const cpu = samples.map((row) => row.cpuPercent);
  const rss = samples.map((row) => row.treeRssBytes);
  const durations = llm.map((row) => row.durationMs);
  const inTok = llm.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0);
  const outTok = llm.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0);
  const summary = {
    reason,
    gestartet: stamp,
    dauerSekunden: samples.length === 0 ? 0 : Math.round(((samples.at(-1).t - samples[0].t) / 1000) * 10) / 10,
    abtastungen: samples.length,
    abtastIntervallMs: SAMPLE_MS,
    system: {
      cpuPercentP50: quantile(cpu, 0.5),
      cpuPercentP95: quantile(cpu, 0.95),
      cpuPercentMax: cpu.length === 0 ? null : Math.max(...cpu.filter(Number.isFinite)),
      ramUsedPercentMax: Math.max(...samples.map((row) => row.ramUsedPercent ?? 0)),
      temperaturMaxC: Math.max(...samples.map((row) => row.temperatureC ?? 0)),
      load1Max: Math.max(...samples.map((row) => row.load1 ?? 0)),
    },
    prozessbaum: {
      rssBytesMax: rss.length === 0 ? null : Math.max(...rss.filter(Number.isFinite)),
      threadsMax: Math.max(...samples.map((row) => row.treeThreads ?? 0)),
      cpuPercentP95: quantile(samples.map((row) => row.treeCpuPercent), 0.95),
    },
    llm: {
      aufrufe: llm.length,
      verworfen: llm.filter((row) => row.outcome !== 'accepted').length,
      inputTokens: inTok,
      outputTokens: outTok,
      totalTokens: inTok + outTok,
      dauerMsP50: quantile(durations, 0.5),
      dauerMsP95: quantile(durations, 0.95),
      dauerMsMax: durations.length === 0 ? null : Math.max(...durations.filter(Number.isFinite)),
      gruende: llm.reduce((acc, row) => {
        acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
        return acc;
      }, {}),
    },
    index: events,
  };
  write({ t: Date.now(), kind: 'summary', ...summary });
  writeFileSync(join(OUT_DIR, `zusammenfassung-${stamp}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  out.end(() => {
    console.log(`\n── Messung (${reason}) ─────────────────────────────`);
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Rohdaten: ${jsonl}`);
    if (child !== null && child.exitCode === null) child.kill('SIGTERM');
    process.exit(0);
  });
}

const timer = setInterval(sample, SAMPLE_MS);
sample();
if (ATTACH === null) boot();
else write({ t: Date.now(), kind: 'attach', pid: rootPid });
process.on('SIGINT', () => stop('abgebrochen (SIGINT)'));
if (SECONDS > 0) setTimeout(() => stop(`${SECONDS}s erreicht`), SECONDS * 1000);
