/**
 * version-probe.js — die MESS-Schicht des Versions-Banners.
 *
 * WAS HIER GEMESSEN WIRD (und nichts sonst):
 *   1. der installierte Commit — aus dem Git-Baum, sonst aus dem Bau-Stempel
 *      eines Pakets (ein .deb hat kein .git, aber einen Bau-Schatten),
 *   2. der neuester Commit auf dem-tracking-Zweig — über das Netz, sonst der
 *      zuletzt bekannte Stand aus dem lokalen Baum,
 *   3. der Abstand: wie viele Commits der installierte Stand hinter dem
 *      neuesten liegt.
 *
 * WARUM GETRENNT VON DER FORMELSCHICHT: die Formel (version-state.js) darf
 * keine Uhr und kein Netz kennen, damit sie im Browser und im Test identisch
 * rechnet. Diese Datei darf I/O — sie ist der einzige Ort, der `git` ruft.
 *
 * FAIL-CLOSED, NICHT FAIL-OPEN: fehlt ein Messwert, ist er `null` und die
 * Formel sagt "unbekannt". Ein erfundener SHA wäre ein Stand, den niemand
 * geprüft hat — das ist die schlimmste Antwort, die dieser Pfad geben kann.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Der Bau-Schatten eines Pakets: Commit, Zeit, Quelle. Liegt im Installat-Wurzelverzeichnis. */
export const BUILD_STAMP = '.shinon-build.json';

/** Wie lange ein Git-Aufruf dauern darf, bevor er als "offline" gilt (ms). */
export const GIT_TIMEOUT = 8000;

/**
 * Ein Git-Aufruf im Verzeichnis. `null` bei jedem Fehler — ein Fehler ist ein
 * Messwert, keine Ausnahme: der Host darf wegen eines fehlenden `git` nicht
 * abstürzen.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{timeout?: number}} [options]
 * @returns {string|null}
 */
export function git(cwd, args, options = {}) {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: options.timeout ?? GIT_TIMEOUT,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
  } catch {
    return null;
  }
}

/**
 * Der Bau-Schatten eines Pakets lesen (fehlt er, `null`).
 * @param {string} root
 * @returns {{commit: string, builtAt: string|null, source: string|null}|null}
 */
export function readStamp(root) {
  const file = join(root, BUILD_STAMP);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed?.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(parsed.commit)) return null;
    return {
      commit: parsed.commit,
      builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : null,
      source: typeof parsed.source === 'string' ? parsed.source : null,
    };
  } catch {
    return null;
  }
}

/**
 * Der installierte Commit. Quelle zuerst: der Git-Baum (ein Klon), sonst der
 * Stempel (ein gebautes Paket).
 * @param {string} root
 * @returns {{sha: string|null, source: 'git'|'stamp'|'unknown'}}
 */
export function installedCommit(root) {
  if (existsSync(join(root, '.git'))) {
    const sha = git(root, ['rev-parse', 'HEAD']);
    if (sha !== null && /^[0-9a-f]{40}$/.test(sha)) return { sha, source: 'git' };
  }
  const stamp = readStamp(root);
  if (stamp !== null) return { sha: stamp.commit, source: 'stamp' };
  return { sha: null, source: 'unknown' };
}

/**
 * Der neueste Commit des tracking-Zweigs. Netz zuerst, dann der lokal
 * bekannte Stand — offline ist "zuletzt bekannt" die ehrliche Antwort.
 * @param {string} root
 * @param {{remote?: string, branch?: string, network?: boolean}} [options]
 * @returns {{sha: string|null, source: 'remote'|'cached'|'unknown'}}
 */
export function latestCommit(root, options = {}) {
  const remote = options.remote ?? 'origin';
  const branch = options.branch ?? 'main';
  if (options.network !== false) {
    const out = git(root, ['ls-remote', remote, `refs/heads/${branch}`]);
    const sha = out === null ? null : out.split(/\s+/)[0];
    if (sha !== null && /^[0-9a-f]{40}$/.test(sha)) return { sha, source: 'remote' };
  }
  const cached = git(root, ['rev-parse', `${remote}/${branch}`]);
  if (cached !== null && /^[0-9a-f]{40}$/.test(cached)) return { sha: cached, source: 'cached' };
  return { sha: null, source: 'unknown' };
}

/**
 * Der Abstand zwischen zwei Ständen: `count(a..b)` zählt die Commits, die `b`
 * hat und `a` nicht. Ohne die Objekte im Baum lässt sich das nicht zählen —
 * dann `null`, nicht `0`.
 * @param {string} root
 * @param {string} from
 * @param {string} to
 * @returns {number|null}
 */
export function countRange(root, from, to) {
  const have = git(root, ['cat-file', '-e', `${to}^{commit}`]);
  if (have === null) return null;
  const out = git(root, ['rev-list', '--count', `${from}..${to}`]);
  const count = out === null ? null : Number.parseInt(out, 10);
  return Number.isFinite(count) ? count : null;
}

/**
 * Die vollständige Messung. Alles, was nicht gemessen werden konnte, bleibt
 * `null` — und die Formel (version-state.js) macht daraus "unbekannt".
 * @param {string} root
 * @param {{remote?: string, branch?: string, network?: boolean, fetch?: boolean}} [options]
 * @returns {object} der Zustand
 */
export function probe(root, options = {}) {
  const installed = installedCommit(root);
  // Ein Paket ohne Git-Baum kennt seine Herkunft ueber den Bau-Schatten: die
  // Remote-URL dort ist der Ort, an dem der neueste Stand liegt.
  const stamp = readStamp(root);
  const remote = installed.source === 'stamp' && stamp?.source !== null && stamp?.source !== undefined
    ? stamp.source
    : (options.remote ?? 'origin');
  const latest = latestCommit(root, { ...options, remote });
  let behind = null;
  let ahead = null;
  if (installed.sha !== null && latest.sha !== null && installed.sha !== latest.sha) {
    // Ohne die Objekte im Baum gibt es keine Zahl. Der Nachhol-Schritt holt
    // sie — aber nur, wenn der Aufrufer es erlaubt (Netz).
    if (options.fetch === true) {
      git(root, ['fetch', '--quiet', remote, options.branch ?? 'main']);
    }
    behind = countRange(root, installed.sha, latest.sha);
    ahead = countRange(root, latest.sha, installed.sha);
  }
  const isClone = existsSync(join(root, '.git'));
  return {
    contract: 'shinon.version/state-v1',
    root,
    installed: installed.sha,
    installedSource: installed.source,
    latest: latest.sha,
    latestSource: latest.source,
    behind,
    ahead,
    isClone,
    checkedAt: new Date().toISOString(),
  };
}
