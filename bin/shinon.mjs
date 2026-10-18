#!/usr/bin/env node
/**
 * bin/shinon.mjs — der echte Einstieg von Shinon Forge (Beleg: docs/CHANGELOG.md).
 *
 * Ein Aufruf, **keine** Voraussetzung im PATH. Was hier passiert:
 *
 *   1. Node-Heilung: verlangt wird die Range aus `engines` im Root-Manifest
 *      (darunter sterben `node:sqlite` und `parseEnv` schon beim Import). Läuft
 *      die Datei unter einem untauglichen Node, startet sie sich mit dem ersten
 * → Kanon: docs/COMMENT-KANON.md#k-066458efe5c7
 */
import { spawn, spawnSync } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import * as repo from '../scripts/lib/repo.mjs';
import { dshBinary, dshSource } from '../scripts/lib/dsh.mjs';
import { resolveRuntime, runtimeFailure } from '../scripts/lib/runtime.mjs';
import { childEnv, describePaths } from '../scripts/lib/paths.mjs';
import { seedDshHome } from '../scripts/lib/dsh-home.mjs';

const ROOT = repo.ROOT;
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const passthrough = args.filter((a) => a !== '--check');

/**
 * Wiederaufnahme unter einem tauglichen Node: derselbe Einstieg, ein anderer
 * Interpreter. `SHINON_START_REEXEC` verhindert die Endlosschleife, falls der
 * gefundene Node selbst zu alt wäre (dann greift der Fehler unten).
 */
const runtime = resolveRuntime();
const running = runtime.binary !== null && runtime.binary === process.execPath;
if (!running && process.env.SHINON_START_REEXEC !== '1') {
  if (runtime.binary === null) {
    console.error(`💥 shinon: keine taugliche Node-Laufzeit —\n${runtimeFailure(runtime)}`);
    console.error('   Abhilfe: Node in der Range aus `engines` bereitstellen (Fassung: docs/ZAHLEN.md §1) oder SHINON_NODE auf das Binary zeigen lassen.');
    process.exit(2);
  }
  const resumed = spawn(runtime.binary, [process.argv[1], ...args], {
    stdio: 'inherit',
    env: { ...childEnv(runtime), SHINON_START_REEXEC: '1' },
  });
  forwardSignalsTo(resumed);
} else {
  main();
}

/**
 * Signale weiterreichen UND den eigenen Status danach korrekt setzen.
 *
 * Gemessen 2026-10-16 mit dem reale Einstieg: SIGINT nur auf die Einstiegs-
 * prozess-Kette ohne Forwarding beendete den Einstieg (Shell meldet 130),
 * ließ aber Self-Heal-Kind und dsh als Waisen weiterlaufen — Port blieb offen.
 * Deshalb erhält JEHE Ebene hier ihre Handler: das Kind bekommt dasselbe Signal
 * (INT/TERM/HUP); stirbt das Kind per Signal, werden die eigenen Listener
 * → Kanon: docs/COMMENT-KANON.md#k-cd1719de90f7
 */
function forwardSignalsTo(child) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) {
    process.on(signal, () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    });
  }
  child.on('exit', (code, signal) => {
    if (signal !== null) {
      for (const own of signals) process.removeAllListeners(own);
      try {
        process.kill(process.pid, signal);
      } catch {
        // Das Signal ist nicht mehr entgegennehmbar (schon behandelt, oder der
        // Prozess ist bereits beim Sterben): dann per exit gehen — aber mit der
        // Nummer DIESES Signals. 128+2, 128+1 und 128+15 sind drei verschiedene
        // Auskuenfte (130/129/143), und eine Shell liest sie: ein hart kodiertes
        // 128+15 haette einem SIGINT ein SIGTERM angehaengt. Ist die Nummer hier
        // unbekannt (kein Fall der drei Signale), 15 als benannter Notausgang.
        process.exit(signalExitCode(signal));
      }
    } else {
      process.exit(code ?? 1);
    }
  });
}

/**
 * Der Status, den eine Shell fuer „per Signal beendet" liest: 128 + Signalnummer.
 *
 * Die Nummern kommen aus `os.constants.signals` statt aus einer eigenen Tabelle —
 * eine abgeschriebene Liste waere eine zweite Wahrheit ueber dieselbe Sache.
 */
export function signalExitCode(signal) {
  const number = osConstants.signals[signal];
  return 128 + (typeof number === 'number' ? number : osConstants.signals.SIGTERM);
}

async function main() {
  // Das Home liegt getrennt vom Baum (sonst wäre dessen AGENTS.md global) und wird
  // hier einmalig aus dem Baum gefüllt: Profil, Sitzungen, Schlüssel.
  const seeded = seedDshHome(describePaths().dshHome, ROOT);
  if (seeded.issues.length > 0) {
    console.error(`💥 shinon: DSH-Home nicht benutzbar —\n   ${seeded.issues.join('\n   ')}`);
    process.exit(2);
  }
  // Status auf stderr: `doctor --json` (und jeder andere JSON-Verbraucher) liest
  // stdout als Maschinenausgabe — eine Seed-Zeile davor machte sie unparsebar.
  if (seeded.created.length > 0) console.error(`   DSH-Home geseedet: ${seeded.created.join(', ')}`);

  // S4: `shinon doctor` ist ein EIGENER Unterbefehl (scripts/doctor.mjs) —
  // read-only Diagnose mit stabilen Codes 0/1/2. Er wird hier abgefangen und
  // NIEMALS an DSH durchgereicht (ein `doctor` bei DSH wäre ein fremder
  // Befehl mit fremden Codes). Der Doctor führt kein DSH aus, startet kein
  // Profil und schreibt nichts.
  if (passthrough[0] === 'doctor') {
    const [{ join: joinPath, dirname }, { fileURLToPath }] = await Promise.all([
      import('node:path'),
      import('node:url'),
    ]);
    const here = dirname(fileURLToPath(import.meta.url));
    const doctor = joinPath(here, '..', 'scripts', 'doctor.mjs');
    const child = spawn(runtime.binary ?? process.execPath, [doctor, ...passthrough.slice(1)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: childEnv(runtime),
    });
    forwardSignalsTo(child);
    return;
  }
  const dsh = dshBinary();
  if (dsh === null) {
    console.error(
      '💥 shinon: kein lauffähiges `dsh` gefunden (Repo-Installat, Vendor, PATH, bekannte Prefixe geprüft) — ' +
        'im Repo `npm install` ausführen (Fassung und Pin: docs/ZAHLEN.md §1)',
    );
    process.exit(2);
  }
  const source = dshSource();
  const probed = spawnSync(dsh[0], [...dsh.slice(1), '--version'], { encoding: 'utf8', env: childEnv(resolveRuntime()) });
  if (probed.status !== 0) {
    console.error('💥 shinon: gefundenes dsh antwortet nicht auf --version — Installation prüfen');
    process.exit(2);
  }
  const dshVersion = (probed.stdout ?? '').trim().split('\n')[0];

  const profileName = repo.activeProfile();
  if (profileName === null) {
    console.error('💥 shinon: kein --profile im dev-Skript (package.json) gefunden');
    process.exit(2);
  }

  const paths = describePaths();
  if (CHECK) {
    console.log('✅ startfähig');
    console.log(`   Einstieg:  ${process.argv[1]}`);
    console.log(`   node:      ${runtime.version ?? process.versions.node} — ${runtime.binary ?? dsh[0]}`);
    console.log(`   sqlite:    ${runtime.sqlite ?? 'nicht gemeldet'} (node:sqlite-Rauchtest bestanden)`);
    console.log(`   Range:     ${runtime.range}`);
    console.log(`   dsh:       ${dshVersion}`);
    console.log(`   Herkunft:  ${source.kind} — ${source.root}`);
    console.log(`   Profil:    ${profileName}`);
    console.log(`   DSH_HOME:  ${paths.dshHome}`);
    console.log(`   Index:     ${paths.indexRoot}   (Cache — wiederherstellbar)`);
    console.log(`   Ledger:    ${paths.ledgerFile}   (Daten — nicht wegwerfbar)`);
    console.log(`   Installat: ${paths.installRoot}${paths.installed ? ' (read-only zur Laufzeit)' : ' (= Arbeitsbaum)'}`);
    process.exit(0);
  }

  // Ein `--profile` aus der Kommandozeile gilt (der `dev`-Eintrag ist die eine
  // Quelle des aktiven Profils); sonst setzt der Starter es aus dem Manifest.
  const named = passthrough.some((arg) => arg === '--profile' || arg.startsWith('--profile='));
  const child = spawn(dsh[0], [...dsh.slice(1), ...(named ? [] : ['--profile', profileName]), ...passthrough], {
    cwd: ROOT,
    stdio: 'inherit',
    env: childEnv(resolveRuntime()),
  });
  forwardSignalsTo(child);
}
