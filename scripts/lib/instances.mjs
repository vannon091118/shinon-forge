/**
 * instances.mjs — WER laeuft aus einem Installat, und wie beendet man es?
 *
 * WARUM EIGENE DATEI: `install-user.mjs` stellt diese Frage an drei Stellen
 * (Schutz vor `npm ci`, `auto`, Umschaltung), und die Umschaltung braucht mehr
 * als eine Liste — sie muss beenden, auf das Ende warten und mit DEMSELBEN
 * Aufruf neu starten. Zwei Kopien der /proc-Auswertung waeren zwei Wahrheiten
 * ueber die Frage „laeuft da noch etwas?\".
 *
 * DIE GRENZE, DIE HIER GEZOGEN WIRD: eine Instanz ist ein Prozess, dessen
 * Kommandozeile den Installat-Pfad enthaelt. Das ist eine Heuristik — sie
 * erkennt `node /opt/shinon-forge/bin/shinon.mjs` und `dsh --profile shinon`
 * im Installat, aber keinen Prozess, der nur mit dem Verzeichnis als CWD
 * laeuft. Fuer die Frage „darf ich hier Dateien ersetzen?\" ist das die
 * vorsichtige Seite: wer nicht erkannt wird, wird auch nicht beendet.
 *
 * Nur Linux: /proc gibt es sonst nicht. Auf anderen Plattformen ist die Liste
 * leer und der Aufrufer entscheidet wie bisher (kein stiller Fehlschlag, keine
 * erfundene Zahl).
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, readlinkSync } from 'node:fs';

/** Ein Werkzeug, das sich selbst prueft, ist keine Instanz des Installats. */
const SELF_TOOL = /install-user\.mjs/;

/** Kurz warten, ohne den Ereignisschleifen-Kreis zu blockieren. */
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Der Zustand eines Prozesses aus /proc (R dienstbereit, Z Zombie, …).
 * @param {number} pid
 * @returns {string|null} das Statuszeichen oder null, wenn der Prozess weg ist
 */
function procState(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // Der Name steht in Klammern und darf Leerzeichen enthalten; danach folgt
    // der Zustand als drittes Feld.
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Laeuft der Prozess noch? Ein Zombie ist fuer den Aufrufer weg: er gibt keine
 * Dateien mehr offen, er wartet nur auf seinen Elternteil.
 * @param {number} pid
 * @returns {boolean}
 */
export function isAlive(pid) {
  const state = procState(pid);
  return state !== null && state !== 'Z';
}

/**
 * Alle Prozesse, die aus einem Verzeichnis laufen.
 *
 * `selfPid` ist standardmaessig der eigene Prozess; ein Aufrufer, der sich
 * selbst beenden will (die Umschaltung), nennt die PIDs, die ausgenommen sind.
 * @param {string} prefix das Installat
 * @param {{selfPid?: number, exclude?: number[]}} [options]
 * @returns {Array<{pid: number, cmdline: string, argv: string[], cwd: string|null}>}
 */
export function instancesUsing(prefix, options = {}) {
  if (process.platform !== 'linux') return [];
  const self = options.selfPid ?? process.pid;
  const exclude = new Set([self, ...(options.exclude ?? [])]);
  const hits = [];
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (exclude.has(pid)) continue;
    let cmdline = '';
    try {
      cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    } catch {
      continue;
    }
    if (!cmdline.includes(prefix)) continue;
    const argv = cmdline.split('\0').filter(Boolean);
    const readable = argv.join(' ');
    if (SELF_TOOL.test(readable)) continue;
    let cwd = null;
    try {
      cwd = readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      // Ein Prozess in einem geloeschten Verzeichnis hat kein lesbares CWD;
      // der Neustart nimmt dann das Verzeichnis des Aufrufers.
    }
    hits.push({ pid, cmdline: readable, argv, cwd });
  }
  return hits;
}

/**
 * Die Instanzen beenden — SIGTERM, warten, SIGKILL fuer den Rest.
 *
 * Warum mit Warten: ein umbenanntes Verzeichnis unter einem noch laufenden
 * Prozess ist genau der Zustand, den `promote` vermeiden will. `SIGKILL` ist
 * die letzte Stufe, nicht die erste: DSH schreibt beim Beenden seinen Zustand.
 * @param {Array<{pid: number}>} hits
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<Array<{pid: number}>>} die beendeten Prozesse
 */
export async function stopInstances(hits, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const live = () => hits.filter((hit) => isAlive(hit.pid));
  for (const hit of live()) {
    try { process.kill(hit.pid, 'SIGTERM'); } catch { /* schon weg */ }
  }
  const deadline = Date.now() + timeoutMs;
  while (live().length > 0 && Date.now() < deadline) await sleep(150);
  for (const hit of live()) {
    try { process.kill(hit.pid, 'SIGKILL'); } catch { /* schon weg */ }
  }
  // Dem Kernel einen Moment geben, die Prozesse abzuraeumen.
  await sleep(150);
  return hits.filter((hit) => !isAlive(hit.pid));
}

/**
 * Die beendeten Instanzen mit ihrem EIGENEN Aufruf neu starten.
 *
 * Warum mit demselben Aufruf und nicht mit einem erfundenen: der Nutzer hat
 * diesen Prozess gestartet, nicht wir. Ein Neustart mit `dsh --profile shinon`
 * waere eine zweite Meinung ueber den Start — und die falsche, sobald jemand
 * Flags gesetzt hat. `detached` + `unref` ueberleben den Aufrufer.
 * @param {Array<{cmdline: string, argv: string[], cwd: string|null}>} stopped
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv}} [options]
 * @returns {Array<{pid: number|undefined, cmdline: string, error: string|null}>}
 */
export function restartInstances(stopped, options = {}) {
  const restarted = [];
  for (const hit of stopped) {
    const [command, ...args] = hit.argv;
    if (command === undefined) {
      restarted.push({ pid: undefined, cmdline: hit.cmdline, error: 'leere Kommandozeile' });
      continue;
    }
    try {
      const child = spawn(command, args, {
        cwd: hit.cwd ?? options.cwd ?? process.cwd(),
        env: options.env ?? process.env,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      restarted.push({ pid: child.pid, cmdline: hit.cmdline, error: null });
    } catch (error) {
      restarted.push({ pid: undefined, cmdline: hit.cmdline, error: String(error?.message ?? error) });
    }
  }
  return restarted;
}
