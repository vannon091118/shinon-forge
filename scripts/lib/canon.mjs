/**
 * canon.mjs — der Kanon-Riegel: ein Name, eine Schreibweise, eine Definition.
 *
 * Die Registry ist `docs/contracts/canon.json`. Diese Datei prueft sie gegen den
 * Laufzeitcode. Eigene Zustaendigkeit, eigener Eigentuemer: `repo.mjs` bleibt die
 * Discovery und der Vertrag des Repos und kennt dieses Modul nicht.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { walkFiles } from './repo.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (file) => readFileSync(file, 'utf8');

/** Die Kanon-Registry: eine Tabelle fuer Globals, Vertraege, Dienste und Begriffe. */
export const CANON_FILE = 'docs/contracts/canon.json';

const CANON_DIRS = ['packages', 'scripts', 'bin'];
const CANON_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/**
 * Alle Laufzeitdateien, in denen ein Name stehen darf.
 *
 * `walkFiles` traegt die gemeinsame Pruning-Regel des Repos; Tests bleiben aussen
 * vor, weil sie den alten Namen absichtlich pinnen (Beleg der Umbenennung).
 */
function canonFiles(root) {
  const files = [];
  for (const dir of CANON_DIRS) {
    if (!existsSync(join(root, dir))) continue;
    for (const file of walkFiles(join(root, dir))) {
      if (!CANON_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
      if (/(^|\/)(tests?)\//.test(relative(root, file))) continue;
      files.push(file);
    }
  }
  return files;
}

/**
 * Der Kanon-Riegel: ein Name, eine Schreibweise, eine Definition.
 *
 * Vier Zusagen, jede mit eigenem Befund:
 *   1. Zu jedem registrierten Namen existiert die Datei, die ihn definiert, und
 *      sie traegt den Namen wortgleich.
 *   2. Eine verbotene Schreibweise steht nirgends in Laufzeitcode — eine zweite
 *      Fassung waere die naechste Kopie.
 *   3. Jedes Browser-Global `__shinon…` ist registriert (Global ohne Definition
 *      ist rot).
 *   4. Jedes Vertrags-Literal im Code haelt eine der drei kanonischen Formen
 *      (Bereich/Sache, Bereich selbst, Zustandsmarker ohne Version).
 *
 * @returns {string[]} Befunde; leer heisst: der Kanon haelt.
 */
export function canonIssues(root = ROOT) {
  const issues = [];
  let canon;
  try {
    canon = JSON.parse(read(join(root, CANON_FILE)));
  } catch (error) {
    return [`${CANON_FILE} fehlt oder parst nicht (${error.message})`];
  }
  const names = Array.isArray(canon.namen) ? canon.namen : null;
  if (names === null || names.length === 0) return [`${CANON_FILE}: namen fehlt oder ist leer`];
  const contractForms = (canon.formen?.vertrag ?? []).map((pattern) => new RegExp(pattern));
  const globalForm = new RegExp(canon.formen?.global ?? '^__shinon[A-Za-z0-9]+$');
  if (contractForms.length === 0) issues.push(`${CANON_FILE}: formen.vertrag fehlt`);

  const files = canonFiles(root).map((file) => ({ file, text: read(file) }));
  const label = (file) => relative(root, file).split(sep).join('/');
  const registered = new Set(names.map((entry) => entry.kanonisch));

  for (const entry of names) {
    if (!entry.art || !entry.kanonisch || !entry.definiert_in) {
      issues.push(`${CANON_FILE}: Eintrag unvollstaendig (${JSON.stringify(entry)})`);
      continue;
    }
    const owner = join(root, entry.definiert_in);
    if (!existsSync(owner)) {
      issues.push(`${entry.kanonisch}: definiert_in ${entry.definiert_in} existiert nicht`);
      continue;
    }
    if (!read(owner).includes(entry.kanonisch)) {
      issues.push(`${entry.kanonisch}: ${entry.definiert_in} traegt den Namen nicht — Definition und Registry widersprechen sich`);
    }
    for (const variant of entry.verboten ?? []) {
      for (const { file, text } of files) {
        if (text.includes(variant)) issues.push(`${label(file)}: "${variant}" ist die verbotene Schreibweise von ${entry.kanonisch}`);
      }
    }
  }

  for (const { file, text } of files) {
    for (const match of text.matchAll(/__shinon[A-Za-z0-9_]+/g)) {
      if (!registered.has(match[0])) issues.push(`${label(file)}: Global ${match[0]} ohne Definition in ${CANON_FILE}`);
      else if (!globalForm.test(match[0])) issues.push(`${label(file)}: ${match[0]} haelt die Global-Form nicht`);
    }
    // Nur Vertraege tragen einen Bereich nach dem Punkt (`shinon.mjs` ist eine Datei).
    for (const match of text.matchAll(/['"](shinon\.[a-z0-9-]+\/[^'"\n]*)['"]/g)) {
      if (!contractForms.some((form) => form.test(match[1]))) {
        issues.push(`${label(file)}: "${match[1]}" haelt keine kanonische Vertragsform`);
      }
    }
  }
  return issues;
}
