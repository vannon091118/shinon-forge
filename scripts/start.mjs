#!/usr/bin/env node
/**
 * start.mjs — alleinstehende Startdatei für Shinon Forge.
 *
 * Ein Aufruf, keine Voraussetzungen im PATH: das Skript heilt seine Umgebung
 * selbst und startet danach DSH mit dem aktiven Profil.
 *
 *   1. Node-Heilung: verlangt wird Node ≥ 22 (`engines` in package.json). Läuft
 *      das Skript unter einem älteren Node, startet es sich mit dem ersten
 *      tauglichen Binary aus `scripts/lib/dsh.mjs` (`goodNode()`) neu.
 *   2. dsh-Suche: genau EINE Auflösung für alle Skripte — `dshBinary()` aus
 *      `scripts/lib/dsh.mjs` (Repo-Installat, Vendor, PATH, bekannte Prefixe).
 *      Sie liefert ein `[node, bin.js]`-Paar, sodass kein Shebang und kein
 *      Umgebungs-Node dazwischenfunkt.
 *   3. Start: `node <bin.js> --profile <aktiv> …` mit `DSH_HOME=<Repo-Root>`;
 *      alle eigenen Argumente werden an dsh durchgereicht
 *      (z. B. `node scripts/start.mjs --no-open --port 3085`).
 *
 * Aufruf: `node scripts/start.mjs [--check] [dsh-Argumente …]`
 *          `npm start [-- dsh-Argumente …]`
 * `--check` löst nur auf (Node, dsh, Version, Profil, DSH_HOME) und startet
 * nichts — dafür ist der Modus da, die Startfähigkeit zu belegen.
 * Exit: 0 = läuft/geprüft, 2 = Bedien-/Umgebungsfehler (fail-closed).
 */
import { spawn, spawnSync } from 'node:child_process';
import * as repo from './lib/repo.mjs';
import { dshBinary, goodNode } from './lib/dsh.mjs';

const ROOT = repo.ROOT;
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const passthrough = args.filter((a) => a !== '--check');

// ── 1. Node-Heilung ─────────────────────────────────────────────────────────
const runningMajor = Number((process.versions.node ?? '0').split('.')[0]);
if (runningMajor < 22 && process.env.SHINON_START_REEXEC !== '1') {
  const better = goodNode();
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
  // ── 2. dsh-Suche (eine Quelle, siehe lib/dsh.mjs) ─────────────────────────
  const dsh = dshBinary();
  if (dsh === null) {
    console.error(
      '💥 start: kein lauffähiges `dsh` gefunden (Repo-Installat, Vendor, PATH, bekannte Prefixe geprüft) — ' +
        'DSH installieren: npm install -g @deepseek-ai/dsh (Fassung + Pin: docs/ZAHLEN.md §1)',
    );
    process.exit(2);
  }
  const probed = spawnSync(dsh[0], [...dsh.slice(1), '--version'], { encoding: 'utf8' });
  if (probed.status !== 0) {
    console.error('💥 start: gefundenes dsh antwortet nicht auf --version — Installation prüfen');
    process.exit(2);
  }
  const dshVersion = (probed.stdout ?? '').trim().split('\n')[0];

  // ── Profil (eine Quelle: das dev-Skript) ───────────────────────────────────
  const profileName = repo.activeProfile();
  if (profileName === null) {
    console.error('💥 start: kein --profile im dev-Skript (package.json) gefunden');
    process.exit(2);
  }

  if (CHECK) {
    console.log('✅ startfähig');
    console.log(`   node:    ${dsh[0]} (${process.versions.node})`);
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
