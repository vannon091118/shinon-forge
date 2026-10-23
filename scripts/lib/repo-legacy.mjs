/**
 * repo-legacy.mjs — Eigentümer: Altlast- und pnpm-Invariante.
 *
 * Legacy-String-Suche und pnpm-Reste über dem Baum.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PRUNE_DIRS, isPruned } from './scan.mjs';
import { PROFILES_DIR, ROOT, read, readJSON } from './repo-basis.mjs';

/**
 * Alle Runtime-Artefakte, die den alten Namespace nicht mehr nennen dürfen.
 *
 * Gesucht wird in JEDER ausgelieferten Code-/Konfigurationsdatei des Pakets, nicht
 * nur in den vier Vertragsdateien: seit Pakete Unterverzeichnisse mitbringen
 * (`assets/`, etwa der Kern des Project Index), wäre eine feste Dateiliste ein Tor
 * mit offener Lücke — der Legacy-String dürfte dann genau dort stehen.
 */
export const LEGACY_SCAN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.yml', '.yaml'];

/**
 * Alle Dateien eines Verzeichnisses, rekursiv — mit der gemeinsamen
 * Early-Pruning-Regel (`scan.mjs`): Fremdbaum, Cache, Laufzeitdaten und Symlinks
 * werden VOR der Rekursion verworfen, nicht nach dem Lesen ihrer Einträge.
 */
export function walkFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || isPruned(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(path));
    else if (LEGACY_SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) found.push(path);
  }
  return found;
}

export function legacyHits(packages) {
  const hits = [];
  for (const pkg of packages) {
    for (const path of walkFiles(pkg.base)) {
      if (read(path).includes('dsh-mod')) hits.push(relative(ROOT, path));
    }
  }
  if (existsSync(PROFILES_DIR)) {
    for (const profile of readdirSync(PROFILES_DIR)) {
      for (const file of ['cordis.patch.yml', 'package.json']) {
        const path = join(PROFILES_DIR, profile, file);
        if (existsSync(path) && read(path).includes('dsh-mod')) hits.push(relative(ROOT, path));
      }
    }
  }
  return hits;
}

/**
 * pnpm-Reste: dieses Repo ruft pnpm nirgends auf und traegt keine pnpm-Datei
 * (PLAN.md Schritt 3.5/A1). Der Befund ist nicht theoretisch — UPSTREAMs
 * `initProfile` (`@deepseek-ai/dsh-app-boot`) legt bei `dsh plugin add` selbst eine
 * `pnpm-workspace.yaml` im Profilverzeichnis an, und ein `pnpm pack`/`pnpm install`
 * gerät leicht wieder in ein Skript.
 *
 * Deshalb hat die Invariante hier EINEN Eigentuemer mit praezisen Mustern statt eines
 * `grep pnpm` ueber Dateinamen: geprueft werden die zwei echten pnpm-Artefakte, ein
 * echter Prozess-/Script-Aufruf und die Script-Eintraege des Root-Manifests. Ein
 * Wortvorkommen in Kommentar oder Dokument ist kein Befund.
 */
export const PNPM_ARTIFACTS = ['pnpm-workspace.yaml', 'pnpm-lock.yaml'];
/**
 * Ein echter Aufruf: Prozess- oder Script-Start mit `pnpm` als Kommando — auch die
 * Sync-Varianten (`execFileSync`, `spawnSync`), die ein festes Kommandoliteral nehmen.
 */
const PNPM_CALL = /(?:exec|spawn|fork|run)[A-Za-z]*\(\s*['"`]pnpm['"`]/;
/** `pnpm` an einer Kommandogrenze im Script-Wert eines Manifests. */
const PNPM_SCRIPT = /(?:^|[\s&|;(])pnpm(?:\s|$)/;
const CODE_EXTENSIONS = ['.js', '.mjs', '.cjs'];
/** Verzeichnisse des eigenen Codes, in denen ein pnpm-Aufruf verboten ist. */
const CODE_DIRS = ['scripts', 'bin', 'packages'];
/**
 * Nie durchsucht: Fremdbaum, Git-Interna, generierte Artefakte, Laufzeitdaten —
 * die Liste kommt aus `scan.mjs` (EINE Regel für alle Baumläufe dieses Repos),
 * plus `attachments`, das nur hier vorkommt. Symlinks werden nie betreten.
 */
const SKIP_DIRS = new Set([...PRUNE_DIRS, 'attachments']);

/** Alle Dateien ab `dir`, ohne Fremdbaum, Git-Interna und generierte Artefakte. */
function walkRepo(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkRepo(path, found);
    else found.push(path);
  }
  return found;
}

/**
 * Verstoesse gegen die pnpm-Invariante (leer = invariant haelt).
 * @param {string} root - Wurzel, in der gesucht wird.
 * @returns {string[]}
 */
export function pnpmIssues(root = ROOT) {
  const issues = [];
  for (const path of walkRepo(root)) {
    const base = path.split(sep).pop();
    if (PNPM_ARTIFACTS.includes(base)) issues.push(`pnpm-Datei im Baum: ${relative(root, path)}`);
  }
  for (const dir of CODE_DIRS) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const path of walkRepo(base)) {
      if (CODE_EXTENSIONS.some((extension) => path.endsWith(extension)) && PNPM_CALL.test(read(path))) {
        issues.push(`pnpm-Aufruf: ${relative(root, path)}`);
      }
    }
  }
  for (const [name, command] of Object.entries(readJSON(join(root, 'package.json')).scripts ?? {})) {
    if (PNPM_SCRIPT.test(command)) issues.push(`package.json scripts.${name} ruft pnpm`);
  }
  return issues;
}
