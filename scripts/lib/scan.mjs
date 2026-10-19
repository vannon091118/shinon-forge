/**
 * scan.mjs — EINE Early-Pruning-Regel für jeden Baumlauf dieses Repos.
 *
 * Warum es diese Datei gibt: drei Verzeichnislisten liefen auseinander
 * (`repo.mjs` SKIP_DIRS, `index-core.js` SKIP_DIRS, `typescript.mjs`
 * IGNORED_DIRS), jede mit einer anderen Menge. Ein Lauf, der `node_modules`
 * betritt, kostet auf schwacher Hardware Minuten; ein Lauf, der einem Symlink
 * folgt, verlässt den Baum (und ein Schreibzugriff darüber landet außerhalb).
 *
 * Zwei Zusagen, die hier zusammen entstehen:
 *   1. PRUNE: bekannte Fremd-/Cache-Ordner werden VOR der Rekursion verworfen,
 *      nicht erst nach dem Lesen ihrer Einträge.
 *   2. KEINE SYMLINKS: `readdirSync(…, { withFileTypes: true })` meldet einen
 *      Symlink als `isSymbolicLink()`; er wird nie betreten — auch dann nicht,
 *      wenn er auf ein Verzeichnis zeigt. lstat-Semantik, kein realpath-Sprung.
 *
 * Die Liste hier ist die Quelle. `packages/project-index/assets/index-core.js`
 * kann sie nicht importieren (der Kern läuft im Worker und darf nur `node:*`
 * laden, und er wird in jedes Tarball gepackt) — deshalb pinnt
 * `scripts/gate/tests/scan-pruning.test.mjs` beide Listen gegeneinander, wie es
 * die Zwillingsregel für Client-Literale tut. Wer hier etwas ergänzt, sieht den
 * Drift im Gate, statt ihn zu übersehen.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Verzeichnisnamen, die nie betreten werden. Bewusst dieselbe Menge wie
 * `SKIP_DIRS` im Index-Kern (plus `sessions`, `logs` und die Werkzeug-Caches,
 * die es dort nicht gibt — der Kern hält seine Teilmenge, der Test prüft die
 * Inklusion, damit eine Erweiterung hier nicht still am Kern vorbeigeht).
 */
export const PRUNE_DIRS = Object.freeze([
  '.git',
  'node_modules',
  'dist',
  '.cache',
  '.turbo',
  '.nyc_output',
  'coverage',
  'storages',
  'sessions',
  'logs',
  'vendor',
  // S1: Skills laufen separat (eigene Auswahl, eigenes Budget) und sind kein
  // gewoehnlicher Projektquelltext. Beide Walker halten dieselbe Menge.
  '.agents',
]);

const PRUNED = new Set(PRUNE_DIRS);

/** Ist dieser Verzeichnisname gesperrt? (Der EINE Prüfpunkt für alle Walker.) */
export function isPruned(name) {
  return PRUNED.has(name);
}

/**
 * Einträge eines Ordners, bereits gepruned und ohne Symlinks.
 * `null`, wenn der Ordner nicht lesbar ist (Rechte, verschwunden) — der Aufrufer
 * entscheidet, ob das ein Befund ist; hier wird nicht geworfen.
 */
export function entriesOf(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  return entries
    .filter((entry) => !entry.isSymbolicLink())
    .filter((entry) => !(entry.isDirectory() && isPruned(entry.name)))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * Ein Baumlauf mit Early Pruning. Reihenfolge ist deterministisch (alphabetisch,
 * Tiefe zuerst — dieselbe Ordnung, die die Gate-Läufe bisher von Hand sortierten).
 *
 * @param {string} root Startordner.
 * @param {{ onFile?: (path: string) => void, onDir?: (path: string) => void, maxFiles?: number }} hooks
 * @returns {{ files: string[], dirs: number, truncated: boolean }}
 */
export function walkDir(root, { onFile, onDir, maxFiles = Number.POSITIVE_INFINITY } = {}) {
  const files = [];
  let dirs = 0;
  let truncated = false;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = entriesOf(dir);
    if (entries === null) continue;
    dirs += 1;
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        onDir?.(full);
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= maxFiles) {
        truncated = true;
        return { files, dirs, truncated };
      }
      files.push(full);
      onFile?.(full);
    }
  }
  files.sort();
  return { files, dirs, truncated };
}

/** Alle Dateien unter `root` (Early Pruning inklusive). */
export function listFiles(root, options = {}) {
  return walkDir(root, options).files;
}

/**
 * Ein Symlink-Verzeichnis gilt nur dann als „echtes" Kind, wenn es KEIN Symlink
 * ist — für die wenigen Stellen, die eine Prüfung ausdrücklich brauchen.
 */
export function isRealDirectory(path) {
  try {
    const info = statSync(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}
