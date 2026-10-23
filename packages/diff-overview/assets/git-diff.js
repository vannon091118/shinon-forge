/**
 * @shinon/diff-overview — die Messung: `git` wird gefragt, nicht nachgebaut.
 *
 * WARUM GIT UND NICHT EIN DIFF IM CODE: `node_modules/diff` liegt nur TRANSITIV
 * im Baum — kein Workspace-Paket deklariert es — und einen Diff-Dienst gibt es
 * nicht (Messung: `docs/probes/diff-overview.json`). Ein Import eines nicht
 * deklarierten Pakets wäre eine Bindung an Zufall; eine eigene Diff-Rechnung
 * wäre nicht nur eine zweite Wahrheit, sondern eine erfundene: sie müsste
 * Zeilen paaren, die Git längst gepaart hat, und würde bei Umbrüchen,
 * Umbenennungen und Binärdateien anders raten.
 *
 * Deshalb: `git status --porcelain`, `git diff --numstat HEAD` und
 * `git diff --unified HEAD -- <pfad>`. Was Git nicht vergleicht (unversionierte
 * Dateien, Binärdateien), zählt hier NICHT mit und sagt seinen Grund — statt
 * eine 0 zu erfinden.
 *
 * KEINE BARE IMPORTS: nur `node:child_process` und `node:path`/`node:fs`, damit
 * der Test in CI ohne `node_modules` läuft.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { DIFF_CONTRACT, DIFF_FILE_CONTRACT, buildOverview, parseUnified } from './diff-core.js';

/** Obergrenze für eine Git-Antwort, bevor sie den Host belastet (Bytes). */
const MAX_BUFFER = 8 * 1024 * 1024;
/** Obergrenze für einen Git-Aufruf: ein hängendes Git ist kein Panel. */
const TIMEOUT_MS = 10000;

/**
 * Einen Git-Befehl laufen lassen. Nie werfend: ein fehlendes Git, ein fremder
 * Index oder ein Abbruch sind Befunde, keine Ausnahmen.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ ok: boolean, status: number|null, stdout: string, stderr: string }}
 */
export function runGit(cwd, args) {
  try {
    const result = spawnSync('git', ['-C', cwd, '--no-optional-locks', ...args], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT_MS,
    });
    if (result.error !== undefined && result.error !== null) {
      return { ok: false, status: null, stdout: '', stderr: String(result.error.message ?? result.error) };
    }
    return {
      ok: result.status === 0,
      status: result.status ?? null,
      stdout: result.stdout ?? '',
      stderr: (result.stderr ?? '').trim(),
    };
  } catch (error) {
    return { ok: false, status: null, stdout: '', stderr: String(error?.message ?? error) };
  }
}

/**
 * Die Repo-Wurzel über der Workspace-Wurzel. `git status --porcelain` druckt
 * Pfade relativ zum Aufrufverzeichnis, `git diff --numstat` relativ zur
 * Repo-Wurzel — beide zusammen sind nur dann eindeutig, wenn alle Aufrufe an
 * DERSELBEN Wurzel hängen. Liegt die Repo-Wurzel über der Workspace-Wurzel, wird
 * das als `scope` gemeldet und nicht verschwiegen.
 * @param {string} root
 * @returns {{ repoRoot: string, scope: 'WURZEL'|'REPO' } | null} null, wenn kein Git-Baum
 */
export function gitScope(root) {
  const inside = runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') return null;
  const top = runGit(root, ['rev-parse', '--show-toplevel']);
  if (!top.ok || top.stdout.trim() === '') return null;
  const repoRoot = resolve(top.stdout.trim());
  // Sandbox-Fix: ein TMPDIR unter dem Repo (oder Home) ist KEIN Git-Baum, nur
  // ein nacketes Verzeichnis, das ein .git vom Eltern-Clon erbt. Die Prüfung
  // muss gegen die Wurzel selbst laufen, nicht gegen die Git-Discovery.
  const resolvedRoot = resolve(root);
  if (!existsSync(join(resolvedRoot, '.git'))) return null;
  return { repoRoot, scope: repoRoot === resolvedRoot ? 'WURZEL' : 'REPO' };
}

/**
 * Ob `git` überhaupt da ist. Beim ersten Start einmal gefragt, damit das Panel
 * „kein Git" von „kein HEAD" unterscheiden kann.
 * @returns {boolean}
 */
export function hasGit() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: TIMEOUT_MS });
  return result.status === 0;
}

/**
 * Die Übersicht des Arbeitsbaums gegen HEAD.
 *
 * `reason` ist der EINE Grund, warum das Panel nichts zeigen kann („kein
 * Git-Baum", „kein HEAD", „nicht lesbar"). Ist er gesetzt, sind `files` leer —
 * eine leere Liste ohne Grund wäre die Behauptung „alles unverändert".
 *
 * @param {string} root Workspace-Wurzel, wie der Host sie aufgelöst hat
 * @param {{ maxFiles?: number }} [options]
 * @returns {object} Payload der Route (Vertrag `shinon.diff/overview-v1`)
 */
export function readOverview(root, options = {}) {
  const base = { contract: DIFF_CONTRACT, root: resolve(root), source: 'git' };
  const scope = gitScope(root);
  if (scope === null) {
    return { ...base, scope: null, reason: 'KEIN_GIT', files: [], totals: { files: 0, added: 0, removed: 0, counted: 0, uncounted: 0 }, truncated: null };
  }
  // Der Branchname: `symbolic-ref` liefert ihn, bei losgelöstem HEAD scheitert
  // der Aufruf — dann ist der Branch `null` und wird nicht erfunden.
  const symbolic = runGit(scope.repoRoot, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const branch = symbolic.ok && symbolic.stdout.trim() !== '' ? symbolic.stdout.trim() : null;
  const head = runGit(scope.repoRoot, ['rev-parse', '--verify', 'HEAD']);
  if (!head.ok) {
    return { ...base, branch, scope: scope.scope, reason: 'KEIN_HEAD', files: [], totals: { files: 0, added: 0, removed: 0, counted: 0, uncounted: 0 }, truncated: null };
  }
  const status = runGit(scope.repoRoot, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all']);
  if (!status.ok) {
    return { ...base, branch, scope: scope.scope, reason: 'NICHT_LESBAR', detail: status.stderr, files: [], totals: { files: 0, added: 0, removed: 0, counted: 0, uncounted: 0 }, truncated: null };
  }
  // `git diff HEAD` ist der Vergleich, den der Nutzer meint: gestagte UND
  // unstaged Änderungen gegen den letzten Commit.
  const numstat = runGit(scope.repoRoot, ['diff', '--numstat', '-z', '--no-renames', 'HEAD']);
  const overview = buildOverview({
    statusText: status.stdout,
    numstatText: numstat.ok ? numstat.stdout : '',
    maxFiles: options.maxFiles,
  });
  return { ...base, branch, scope: scope.scope, reason: null, ...overview };
}

/**
 * Einen Pfad aus der Übersicht prüfen: relativ, ohne `..`, innerhalb der Wurzel.
 * Der Client schickt ihn, also wird er nicht geglaubt.
 * @param {string} root
 * @param {string} candidate
 * @returns {string|null} der aufgelöste Pfad — oder null bei einem Ausbruch
 */
export function safeInside(root, candidate) {
  const raw = String(candidate ?? '');
  if (raw === '' || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null;
  const absolute = resolve(root, raw);
  const rel = relative(resolve(root), absolute);
  if (rel === '' || rel.startsWith('..') || rel.split(sep).includes('..')) return null;
  return absolute;
}

/**
 * Der Diff EINER Datei, in Hunks und Zeilen.
 *
 * Unversionierte Dateien haben keinen HEAD-Vergleich — das Panel sagt `NEU`
 * statt einen Diff zu erfinden. Binärdateien ebenso (`BINAER`).
 *
 * @param {string} root Workspace-Wurzel
 * @param {string} path Repo-relativer Pfad aus der Übersicht
 * @param {{ maxLines?: number, maxLineChars?: number }} [limits]
 * @returns {object} Payload der Route (Vertrag `shinon.diff/file-v1`)
 */
export function readFileDiff(root, path, limits = {}) {
  const base = { contract: DIFF_FILE_CONTRACT, root: resolve(root), path: String(path ?? '') };
  const scope = gitScope(root);
  if (scope === null) {
    return { ...base, reason: 'KEIN_GIT', status: null, hunks: [], lines: 0, clipped: 0, truncated: null };
  }
  const absolute = safeInside(scope.repoRoot, path);
  if (absolute === null || !existsSync(absolute)) {
    return { ...base, reason: 'NICHT_IM_BAUM', status: null, hunks: [], lines: 0, clipped: 0, truncated: null };
  }
  const status = runGit(scope.repoRoot, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', path]);
  const entry = status.ok ? status.stdout.split('\u0000').find((row) => row.length > 3 && row.slice(3) === path) : undefined;
  if (entry !== undefined && entry.slice(0, 2) === '??') {
    return { ...base, reason: 'NEU', status: '?', hunks: [], lines: 0, clipped: 0, truncated: null };
  }
  const diff = runGit(scope.repoRoot, ['diff', '--unified=2', '--no-renames', 'HEAD', '--', path]);
  if (!diff.ok) {
    return { ...base, reason: 'NICHT_LESBAR', detail: diff.stderr, status: entry === undefined ? null : entry.slice(0, 2).trim(), hunks: [], lines: 0, clipped: 0, truncated: null };
  }
  if (/^Binary files .* differ$/m.test(diff.stdout)) {
    return { ...base, reason: 'BINAER', status: entry === undefined ? null : entry.slice(0, 2).trim(), hunks: [], lines: 0, clipped: 0, truncated: null };
  }
  const parsed = parseUnified(diff.stdout, limits);
  return {
    ...base,
    reason: parsed.hunks.length === 0 ? 'KEIN_UNTERSCHIED' : null,
    status: entry === undefined ? null : entry.slice(0, 2).trim(),
    ...parsed,
  };
}
