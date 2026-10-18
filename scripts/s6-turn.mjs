#!/usr/bin/env node
/**
 * S6-Runner für den echten Modellturn — Bereitschafts- und Startsteuerung.
 *
 * Drei Unterbefehle, fail-closed:
 *   check  Preflight: Node ≥ 22, echtes dsh-Binary, Schlüssel presence-only,
 *          `.env`-Chmod, Route aus dem effektiven Profil-Dump.
 *   boot   Startet den Host im Hintergrund (Port 3099, --no-open), Protokoll
 *          unter logDir()/s6/, Prozessdaten als JSON daneben.
 * → Kanon: docs/COMMENT-KANON.md#k-1a92de5cb5a8
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dshBinary } from './lib/dsh.mjs';
import { dshHome, logDir, pathWith } from './lib/paths.mjs';

const PORT = 3099;
const KEY_NAME = 'AGNES_API_KEY';
const die = (message, code = 2) => {
  console.error(`s6-turn: ${message}`);
  process.exit(code);
};

/** Schlüsselquelle presence-only — Namen lesen, Werte nie. */
function keySource() {
  if (process.env[KEY_NAME]) return 'Umgebung';
  const file = join(process.cwd(), '.env');
  if (!existsSync(file)) return null;
  const names = readFileSync(file, 'utf8').split('\n')
    .map((line) => (line.split('=')[0] ?? '').trim())
    .filter((name) => name === KEY_NAME);
  return names.length > 0 ? '.env' : null;
}

function envFileMode() {
  const file = join(process.cwd(), '.env');
  if (!existsSync(file)) return null;
  return (statSync(file).mode & 0o777).toString(8).padStart(3, '0');
}

const effectiveEnv = () => pathWith([join(process.cwd(), 'node_modules', '.bin')], process.env);
const namedRoute = (dump) => {
  const lines = dump.split('\n').map((line) => line.trimEnd());
  const cut = (match) => (match !== null && match.length > 1 ? match[1] : null);
  let provider = null, model = null;
  for (const line of lines) {
    let hit;
    if (provider === null && (hit = line.match(/^\s*provider:\s*(\S+)/))) provider = cut(hit);
    if (model === null && (hit = line.match(/^\s*model:\s*(\S+)/))) model = cut(hit);
  }
  return provider !== null && model !== null ? `${provider}/${model}` : 'UNGEPRÜFT (keine Zeilen provider/model im Dump)';
};

function readDump() {
  const pair = dshBinary();
  if (pair === null) return null;
  const [node, bin] = pair;
  const result = spawnSync(node, [bin, '--profile', 'shinon', '--dump-config'], {
    env: { ...process.env, PATH: effectiveEnv().PATH, DSH_HOME: dshHome() },
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

function check() {
  const pair = dshBinary();
  const major = Number(process.versions.node.split('.')[0]);
  const lines = [];
  lines.push(`node ${process.versions.node} ${major >= 22 ? '≥ 22' : 'ZU ALT (≥22 nötig)'}`);
  lines.push(pair === null ? 'dshBinary: null — kein Repo-Installat und kein Vendor-Binärpfad' : `dshBinary: ${pair[1]} (Node ${pair[0] === process.execPath ? 'läuft' : 'gefundenes Node'})`);
  lines.push(`dshHome: ${dshHome()}`);
  lines.push(`key: ${KEY_NAME}${keySource() === null ? ' FEHLEND (Umgebung und ./.env)' : ` bereit über ${keySource()}`}`);
  const mode = envFileMode();
  lines.push(`.env-Modus: ${mode === null ? 'kein .env vorhanden' : mode}${mode !== null && mode !== '600' ? ' — SOLL 600 sein (Repo-Regel)' : ''}`);
  const dump = readDump();
  lines.push(`dump-config: ${dump === null ? 'FEHLGESCHLAGEN' : 'gelesen'}`);
  lines.push(`route: ${dump === null ? 'UNGEPRÜFT' : namedRoute(dump)}`);
  for (const line of lines) console.log(`  ${line}`);
  const okMode = mode === null || mode === '600';
  if (pair === null || major < 22 || !okMode || dump === null) {
    console.error('s6-turn: Preflight rot/ungeprüft — EXIT 2, kein Start vor Replikatur.');
    process.exit(2);
  }
  if (keySource() === null) {
    console.error(`s6-turn: Der Start traf den Schlüssel nicht — vor dem Turn: ${KEY_NAME} in .env (chmod 600) eintragen, ohne den Wert irgendwo auszugeben.`);
    process.exit(1);
  }
  console.log('s6-turn: Preflight grün — boot ist bereit.');
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function boot() {
  const pair = dshBinary();
  if (pair === null) die('dshBinary()=== null — kein Start vor Replikatur');
  const [node, bin] = pair;
  const logs = join(logDir(), 's6');
  mkdirSync(logs, { recursive: true });
  const cs = stamp();
  const logFile = join(logs, `boot-${cs}.log`);
  const out = spawn(node, [bin, '--profile', 'shinon', '--no-open', '--port', String(PORT)], {
    env: { ...process.env, PATH: effectiveEnv().PATH },
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  writeFileSync(logFile, `s6-turn boot ${cs}\nPID ${out.pid}\nPort ${PORT}\n`);
  out.stdout?.on('data', (chunk) => writeFileSync(logFile, String(chunk), { flag: 'a' }));
  out.stderr?.on('data', (chunk) => writeFileSync(logFile, String(chunk), { flag: 'a' }));
  const pidFile = join(logs, `boot-${cs}.json`);
  writeFileSync(pidFile, JSON.stringify({ pid: out.pid, port: PORT, log: logFile, startedAt: cs }, null, 2));
  out.unref();
  console.log(`s6-turn: Host läuft (PID ${out.pid}, Port ${PORT}, PID-Datei ${pidFile}).`);
  console.log(`s6-turn: UI unter http://localhost:${PORT} — Der Turn folgt dem Runbook (Urteil, Widerruf).`);
}

function stop() {
  const logs = join(logDir(), 's6');
  const records = existsSync(logs) ? readdirSync(logs, { withFileTypes: true }).filter((entry) => entry.name.endsWith('.json')).map((entry) => entry.name) : [];
  if (records.length === 0) die('kein boot-JSON im S6-Log — nichts zu stoppen');
  const latest = records.sort().at(-1) ?? null;
  if (latest === null) die('kein boot-JSON im S6-Log — nichts zu stoppen');
  const record = JSON.parse(readFileSync(join(logs, latest), 'utf8'));
  if (!Number.isInteger(record.pid)) die(`ungültige PID in ${latest}`);
  try {
    process.kill(record.pid, 'SIGTERM');
  } catch (error) {
    die(`SIGTERM fehl an PID ${record.pid}: ${error.message}`);
  }
  rmSync(join(logs, latest), { force: true });
  console.log(`s6-turn: SIGTERM an PID ${record.pid} gesendet (Protokoll-Datei: ${record.log}), PID-JSON gelöscht.`);
}

const map = { check, boot, stop };
const routine = map[process.argv[2] ?? ''] ?? null;
if (routine === null) {
  die('usage: s6-turn.mjs {check|boot|stop} — der echte Turn läuft über die UI (Runbook).');
}
routine();
