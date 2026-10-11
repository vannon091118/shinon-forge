#!/usr/bin/env node
/**
 * bin/shinon.mjs — der echte Einstieg von Shinon Forge (PLAN.md Schritt 3.4 / D4).
 *
 * Ein Aufruf, **keine** Voraussetzung im PATH. Was hier passiert:
 *
 *   1. Node-Heilung: verlangt wird Node ≥ 22 (`engines` im Root-Manifest;
 *      darunter sterben `node:sqlite` und `parseEnv` schon beim Import). Läuft
 *      die Datei unter einem älteren Node, startet sie sich mit dem ersten
 *      tauglichen Node aus `scripts/lib/dsh.mjs` (`goodNode()`) selbst neu.
 *   2. dsh-Auflösung: genau EINE Quelle — `dshBinary()` aus `scripts/lib/dsh.mjs`
 *      (Repo-Installat, Vendor, PATH, bekannte Prefixe). Sie liefert ein
 *      `[node, bin.js]`-Paar: kein Shebang-Node und kein Shell-Quoting dazwischen.
 *      `--check` nennt zusätzlich die HERKUNFT (`dshSource()`), damit „findet sein
 *      dsh ohne globales Installat" nicht behauptet, sondern gezeigt wird.
 *   3. Start: `node <bin.js> --profile <aktiv> …` mit `DSH_HOME=<Repo-Root>`;
 *      eigene Argumente werden durchgereicht (`shinon --no-open --port 3085`).
 *
 * **Kein Stub.** Die Audit-Befunde A-INV-03 (`docs/audit/DEPENDENCY_FINDINGS.md`)
 * und A-INV-03 (`docs/audit/ARCHITECTURE_MAP.md`) beschreiben genau diesen Pfad
 * als „verwaist: nur Logs, kein `bin`-Feld, kein Script verweist darauf". Diese
 * Fassung arbeitet: sie löst auf, prüft und startet — und sie steht im
 * `bin`-Feld des Root-Manifests, also unter dem Namen `shinon`.
 *
 * Was hier NOCH nicht passiert (bewusst, nicht vergessen): der Einstieg startet
 * das aufgelöste dsh mit `--profile <name>`. Der Bootpfad, der ohne
 * `$DSH_HOME/profiles/<name>` auskommt (`resolvedProfile`, Schritt 3.3 ist dafür
 * belegt), wird hier erst eingehängt, wenn die Profilwerte aus Code kommen
 * (Schritt 3.6) — sonst gäbe es zwei Orte, an denen das Profil definiert ist.
 * Ebenso bleibt `vendor/dsh` (alpha.2) unverdrahtet: es läuft weiter das
 * Repo-Installat (alpha.1, der Pin), solange die Fassungsfrage aus 1.2 offen ist.
 * Zwei Fassungen gleichzeitig im Weg wären genau das, was 1.2 verbietet.
 *
 * Aufruf:  shinon [--check] [dsh-Argumente …]      (bzw. `npm start [-- …]`)
 * Exit:    0 = läuft bzw. geprüft · 2 = Umgebungsfehler (fail-closed)
 */
import { spawn, spawnSync } from 'node:child_process';
import * as repo from '../scripts/lib/repo.mjs';
import { dshBinary, dshSource, goodNode } from '../scripts/lib/dsh.mjs';

const ROOT = repo.ROOT;
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const passthrough = args.filter((a) => a !== '--check');

/**
 * Wiederaufnahme unter einem tauglichen Node: derselbe Einstieg, ein anderer
 * Interpreter. `SHINON_START_REEXEC` verhindert die Endlosschleife, falls der
 * gefundene Node selbst zu alt wäre (dann greift der Fehler unten).
 */
const runningMajor = Number((process.versions.node ?? '0').split('.')[0]);
if (runningMajor < 22 && process.env.SHINON_START_REEXEC !== '1') {
  const better = goodNode();
  if (better === null) {
    console.error(
      `💥 shinon: Node ${process.versions.node} ist zu alt (verlangt: ≥ 22) und kein neuerer Node gefunden — ` +
        'Node 22+ installieren (Fassung: docs/ZAHLEN.md §1)',
    );
    process.exit(2);
  }
  const resumed = spawn(better, [process.argv[1], ...args], {
    stdio: 'inherit',
    env: { ...process.env, SHINON_START_REEXEC: '1' },
  });
  resumed.on('exit', (code) => process.exit(code ?? 1));
} else {
  main();
}

function main() {
  const dsh = dshBinary();
  if (dsh === null) {
    console.error(
      '💥 shinon: kein lauffähiges `dsh` gefunden (Repo-Installat, Vendor, PATH, bekannte Prefixe geprüft) — ' +
        'im Repo `npm install` ausführen (Fassung und Pin: docs/ZAHLEN.md §1)',
    );
    process.exit(2);
  }
  const source = dshSource();
  const probed = spawnSync(dsh[0], [...dsh.slice(1), '--version'], { encoding: 'utf8' });
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

  if (CHECK) {
    console.log('✅ startfähig');
    console.log(`   Einstieg:  ${process.argv[1]}`);
    console.log(`   node:      ${process.versions.node} (ausgeführt mit ${dsh[0]})`);
    console.log(`   dsh:       ${dshVersion}`);
    console.log(`   Herkunft:  ${source.kind} — ${source.root}`);
    console.log(`   Profil:    ${profileName}`);
    console.log(`   DSH_HOME:  ${ROOT}`);
    process.exit(0);
  }

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
