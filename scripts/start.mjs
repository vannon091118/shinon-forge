#!/usr/bin/env node
/**
 * start.mjs — alleinstehende Startdatei für Shinon Forge.
 *
 * Ein Aufruf, keine Voraussetzungen im PATH: das Skript heilt seine Umgebung
 * selbst und startet danach DSH mit dem aktiven Profil.
 *
 *   1. Node-Heilung: verlangt wird Node ≥ 22 (`engines` in package.json). Läuft
 *      das Skript unter einem älteren Node, sucht es einen neueren an den
 *      bekannten Orten und startet sich damit neu (kein Umbau am System).
 *   2. dsh-Suche: PATH zuerst, danach `node_modules/.bin/dsh` (nur wenn das
 *      Ziel existiert — ein toter Symlink zählt nicht) und die bekannten
 *      Installationsorte unter `$HOME`. Jeder Kandidat muss
 *      `dsh --version` mit Exit 0 beantworten, sonst gilt er als fehlend.
 *   3. Start: `dsh --profile <aktiv> …` mit `DSH_HOME=<Repo-Root>`; alle
 *      eigenen Argumente werden an dsh durchgereicht
 *      (z. B. `node scripts/start.mjs --no-open --port 3085`).
 *
 * Aufruf: `node scripts/start.mjs [--check] [dsh-Argumente …]`
 *          `npm start [-- dsh-Argumente …]`
 * `--check` löst nur auf (Node, dsh, Version, Profil, DSH_HOME) und startet
 * nichts — dafür ist der Modus da, die Startfähigkeit zu belegen.
 * Exit: 0 = läuft/geprüft, 2 = Bedien-/Umgebungsfehler (fail-closed).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import * as repo from './lib/repo.mjs';
import { findOnPath } from './lib/yaml.mjs';

const ROOT = repo.ROOT;
const HOME = homedir();
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const passthrough = args.filter((a) => a !== '--check');

/** Major-Version aus `node --version` (null, wenn nicht ermittelbar). */
function nodeMajor(binary) {
  const run = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  const found = /^v(\d+)\./.exec((run.stdout ?? '').trim());
  return run.status === 0 && found !== null ? Number(found[1]) : null;
}

/** Erster Kandidat, dessen Major-Version ≥ 22 ist (null, wenn keiner). */
function newerNode() {
  const candidates = [
    join(HOME, '.local', 'opt', 'node-v22.23.3-linux-x64', 'bin', 'node'),
    join(HOME, '.nvm', 'versions', 'node', 'v24.21.0', 'bin', 'node'),
  ];
  for (const binary of candidates) {
    if (existsSync(binary) && (nodeMajor(binary) ?? 0) >= 22) return binary;
  }
  return null;
}

// ── 1. Node-Heilung (muss auch unter Node 18 laufen: nur Basis-Syntax) ──────
const runningMajor = Number((process.versions.node ?? '0').split('.')[0]);
if (runningMajor < 22 && process.env.SHINON_START_REEXEC !== '1') {
  const better = newerNode();
  if (better === null) {
    console.error(
      `💥 start: Node ${process.versions.node} ist zu alt (verlangt: ≥ 22) und kein neuerer Node gefunden — ` +
        'Node 22+ installieren (siehe AGENTS.md)',
    );
    process.exit(2);
  }
  const run = spawn(better, [process.argv[1], ...args], {
    stdio: 'inherit',
    env: { ...process.env, SHINON_START_REEXEC: '1' },
  });
  run.on('exit', (code) => process.exit(code ?? 1));
} else {
  main();
}

function main() {
  // ── 2. dsh-Suche ──────────────────────────────────────────────────────────
  const localBin = join(ROOT, 'node_modules', '.bin', 'dsh');
  const candidates = [
    findOnPath('dsh'),
    existsSync(localBin) ? resolve(localBin) : null,
    join(HOME, '.local', 'opt', 'node-v22.23.3-linux-x64', 'bin', 'dsh'),
    join(HOME, '.nvm', 'versions', 'node', 'v24.21.0', 'bin', 'dsh'),
    '/usr/local/bin/dsh',
    '/usr/bin/dsh',
  ].filter((c) => c !== null);
  // Der lauffähige Node für dsh: der eigene (wenn ≥ 22), sonst der geheilte.
  // Hintergrund: npm-Shims starten per Shebang (`#!/usr/bin/env node`) mit dem
  // Umgebungs-Node — ein v18 dort lässt ein v22-pflichtiges dsh schon bei
  // `--version` sterben. Deshalb wird der Kandidat notfalls per `node <skript>`
  // gestartet; der erste Weg, der Exit 0 liefert, gewinnt (direkt, dann via Node).
  const nodeBin = runningMajor >= 22 ? process.execPath : newerNode();
  const probe = (candidate) => {
    for (const command of [[candidate], ...(nodeBin === null ? [] : [[nodeBin, candidate]])]) {
      const run = spawnSync(command[0], [...command.slice(1), '--version'], { encoding: 'utf8' });
      if (run.status === 0) return { command, version: (run.stdout ?? '').trim().split('\n')[0] };
    }
    return null;
  };
  let dsh = null;
  let dshVersion = null;
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const hit = probe(candidate);
    if (hit !== null) {
      dsh = hit.command;
      dshVersion = hit.version;
      break;
    }
  }
  if (dsh === null) {
    console.error(
      '💥 start: kein lauffähiges `dsh` gefunden (PATH, node_modules/.bin und bekannte Orte geprüft) — ' +
        'DSH installieren: npm install -g @deepseek-ai/dsh (Fassung + Pin: Docs/ZAHLEN.md §1)',
    );
    process.exit(2);
  }

  // ── Profil (eine Quelle: das dev-Skript) ───────────────────────────────────
  const profileName = repo.activeProfile();
  if (profileName === null) {
    console.error('💥 start: kein --profile im dev-Skript (package.json) gefunden');
    process.exit(2);
  }

  if (CHECK) {
    console.log('✅ startfähig');
    console.log(`   node:    ${process.execPath} (${process.versions.node})`);
    console.log(`   dsh:     ${dsh.join(' ')} (${dshVersion})`);
    console.log(`   Profil:  ${profileName}`);
    console.log(`   DSH_HOME: ${ROOT}`);
    process.exit(0);
  }

  // ── 3. Start (läuft, bis Ctrl-C kommt) ─────────────────────────────────────
  const child = spawn(dsh[0], [...dsh.slice(1), '--profile', profileName, ...passthrough], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, DSH_HOME: ROOT },
  });
  child.on('exit', (code, signal) => {
    if (signal !== null) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}
