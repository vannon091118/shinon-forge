/**
 * @shinon/project-index — workspace.js
 *
 * DIE EINE QUELLE der Workspace-Identität (S1), für die Host-Hälfte des
 * Project Index. Der Prompter hält dieselbe Datei als Besitzer; dieser Spiegel
 * ist bytegleich zwischen den Markern `zwilling:workspace-identitaet` und wird
 * von `SOURCE_TWINS` in `scripts/lib/repo.mjs` (Gate + Build) geprüft.
 *
 * Warum eine Kopie und kein Import: Pakete dieses Repos referenzieren einander
 * nicht — jedes wird als eigenes Tarball gepackt und geladen. Ein Import über
 * die Paketgrenze wäre bequem und würde die Verteilung brechen.
 *
 * Warum die Werte übereinstimmen MÜSSEN: Prompter und Index beantworten
 * dieselbe Frage („welcher Workspace ist aktiv?"). Zwei verschiedene Antworten
 * hießen, dass ein Prompt den Index eines anderen Projekts liest — genau die
 * Verwechslung, die S1 ausschließt. `scripts/gate/tests/project-index.test.mjs`
 * vergleicht zusätzlich das Verhalten beider Fassungen.
 *
 * Nur Node-Builtins — keine Bare-Imports, damit der Kern workerfähig bleibt.
 */
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// #region zwilling:workspace-identitaet — Besitzer: packages/prompter/assets/workspace.js; Spiegel: packages/project-index/assets/workspace.js (bytegleich, scripts/lib/repo.mjs)
/** Vertragsname der Workspace-Identität. */
export const WORKSPACE_CONTRACT = 'shinon.workspace/v1';

/** Name der Umgebungsvariable — die zweite Quelle nach der expliziten Config. */
export const WORKSPACE_ENV = 'SHINON_WORKSPACE_ROOT';

/**
 * Die EINE Auflösung der aktiven Workspace-Root.
 *
 * Priorität: `configRoot` (ausdrückliche Angabe) > `env.SHINON_WORKSPACE_ROOT`
 * > `cwd` (Default: `process.cwd()`). Leer heißt „nicht gesetzt", nie „raten".
 * Das Ergebnis ist immer absolut und aufgelöst — zwei Schreibweisen desselben
 * Ordners ergeben dieselbe Identität.
 *
 * @returns {{ root: string, source: 'config'|'env'|'cwd' }}
 */
export function resolveWorkspaceRoot({ configRoot = '', env = process.env, cwd = process.cwd() } = {}) {
  if (typeof configRoot === 'string' && configRoot.trim() !== '') {
    const base = typeof cwd === 'string' && cwd !== '' ? cwd : process.cwd();
    const root = isAbsolute(configRoot.trim()) ? resolve(configRoot.trim()) : resolve(base, configRoot.trim());
    return { root, source: 'config' };
  }
  const fromEnv = env?.[WORKSPACE_ENV];
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return { root: resolve(fromEnv.trim()), source: 'env' };
  }
  const base = typeof cwd === 'string' && cwd !== '' ? cwd : process.cwd();
  return { root: resolve(base), source: 'cwd' };
}

/**
 * Überprüfbare Root-Identität: aufgelöster Pfad plus stabiler Kurz-Hash.
 * Derselbe Ordner ergibt dieselbe Identität über Läufe; zwei Ordner mit
 * gleichen relativen Pfaden ergeben verschiedene Identitäten.
 */
export function fingerprintRoot(root) {
  const resolved = resolve(String(root ?? ''));
  const rootId = createHash('sha256').update(resolved).digest('hex').slice(0, 16);
  return { root: resolved, rootId, contract: WORKSPACE_CONTRACT };
}

/**
 * Ein Pfad liegt in einem anderen — ohne Präfix-Treffer (`/opt/x` vs `/opt/xy`).
 */
export function isInsideRoot(root, candidate) {
  const base = resolve(String(root ?? ''));
  const target = resolve(String(candidate ?? ''));
  if (target === base) return true;
  return target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

/**
 * Eine Referenz (`..`, absolut, Separatorvarianten) gegen die Root prüfen.
 *
 * @returns {{ ok: true, path: string } | { ok: false, reason: string }}
 */
export function resolveInRoot(root, ref) {
  if (typeof ref !== 'string' || ref.trim() === '') return { ok: false, reason: 'EMPTY' };
  const base = resolve(String(root ?? ''));
  const raw = ref.trim();
  // Separatorvarianten normalisieren: Backslashes sind auf POSIX keine Trenner,
  // auf Windows schon — wer sie als Trenner schreibt, meint einen Pfad.
  const normalized = raw.replace(/\\/g, '/');
  const absolute = normalized.startsWith('/')
    ? resolve(normalized)
    : resolve(base, normalized);
  if (!isInsideRoot(base, absolute)) {
    return { ok: false, reason: `OUTSIDE_ROOT:${raw}` };
  }
  return { ok: true, path: absolute };
}

/**
 * Symlink-Grenze: den bereits aufgelösten Pfad über seine Realpath-Auflösung
 * prüfen. `realpathFn` ist injizierbar, damit Tests ohne Dateisystem lügen
 * können und der Lauf das echte `realpathSync` nimmt.
 *
 * @returns {{ ok: true, path: string } | { ok: false, reason: string }}
 */
export function checkRealpathInside(root, candidate, realpathFn) {
  const base = resolve(String(root ?? ''));
  let real;
  try {
    real = typeof realpathFn === 'function' ? realpathFn(String(candidate)) : String(candidate);
  } catch (error) {
    return { ok: false, reason: `REALPATH_FAILED:${error?.message ?? error}` };
  }
  const resolved = resolve(String(real));
  if (!isInsideRoot(base, resolved)) {
    return { ok: false, reason: `SYMLINK_ESCAPE:${String(candidate)}->${resolved}` };
  }
  return { ok: true, path: resolved };
}

/**
 * Veraltete Einträge entfernen: was `existsFn` nicht mehr kennt (gelöscht,
 * verschoben, umbenannt), kehrt nicht aus dem Index zurück.
 *
 * @returns {{ kept: Map, removed: string[] }}
 */
export function reconcileEntries(entries, existsFn) {
  const kept = new Map();
  const removed = [];
  for (const [key, value] of entries instanceof Map ? entries : []) {
    let alive = false;
    try {
      alive = existsFn(key, value);
    } catch {
      alive = false;
    }
    if (alive) kept.set(key, value);
    else removed.push(key);
  }
  return { kept, removed };
}

/**
 * Relative Projekt-Schreibweise eines absoluten Pfads (für den Index:
 * der Index überlebt einen Umzug, weil er relativ speichert).
 */
export function toWorkspacePath(root, absolute) {
  const rel = relative(resolve(String(root ?? '')), resolve(String(absolute ?? '')));
  return sep === '/' ? rel : rel.split(sep).join('/');
}
// #endregion zwilling:workspace-identitaet
