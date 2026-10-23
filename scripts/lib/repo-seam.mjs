/**
 * repo-seam.mjs — Eigentümer: Naht-Spiegel-Riegel.
 *
 * hostMirrorIssues gegen die Zwillings-Liste: kein Host-Spiegel kehrt zurück.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments } from './source-scan.mjs';
import { ROOT, read } from './repo-basis.mjs';
import { SOURCE_TWINS } from './repo-zwillinge.mjs';

/** Der Host-Naht-Kern — die EINE Definition der sechs importierten Regeln. */
export const SEAM_CORE = 'packages/seams/assets/seams.js';
/** Das Inventar, gegen das geprueft wird (Daten, kein zweiter Regelsatz). */
export const SEAM_INVENTORY = 'packages/seams/assets/seams.json';

/** Alle Host-Runtime-Dateien: `index.js` je Paket plus jede `.js` unter `assets/`. */
function hostRuntimeFiles(root) {
  const files = [];
  let dirs = [];
  try {
    dirs = readdirSync(join(root, 'packages'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return files;
  }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  for (const entry of dirs) {
    const base = join(root, 'packages', entry.name);
    if (existsSync(join(base, 'index.js'))) files.push(join(base, 'index.js'));
    if (existsSync(join(base, 'assets'))) walk(join(base, 'assets'));
  }
  return files;
}

/**
 * Der Riegel gegen zurueckkehrende HOST-Spiegel.
 *
 * Die sechs Host↔Host-Naehte stehen seit 2026-10-20 EINMAL (`@shinon/seams`).
 * Eine Zwillings-Regel kann das nicht mehr sichern — eine Kopie ohne Marker
 * waere fuer `twinIssues` unsichtbar. Dieser Schritt prueft deshalb das
 * Gegenteil: dass die Definition NIRGENDS sonst steht.
 *
 * Vier Zusagen, jede mit eigenem Befund:
 *   1. Jede `SOURCE_TWINS`-Regel spiegelt in eine `client.js`. Ein Host-Ziel
 *      waere ein zurueckgekehrter Host-Spiegel.
 *   2. Keine Host-Haelfte traegt eine `zwilling:`-Region. Regionen sind das
 *      Transportmittel der Kopie — im Host gibt es nichts zu transportieren.
 *   3. Jede Funktion des Inventars wird in genau EINER Host-Datei definiert.
 *   4. Jedes Literal des Inventars steht in keiner anderen Host-Datei.
 *
 * Client-Haelften sind ausgenommen (Stufe 2, `SOURCE_TWINS`) — die Pruefung liest
 * nur `index.js` und die `.js`-Dateien unter `assets/`.
 *
 * @returns {string[]} Befunde; leer heisst: der Kern ist die einzige Quelle.
 */
export function hostMirrorIssues(root = ROOT) {
  const issues = [];
  const coreFile = join(root, SEAM_CORE);

  for (const twin of SOURCE_TWINS) {
    if (!twin.mirror.endsWith('client.js')) {
      issues.push(`${twin.rule}: Spiegel ${twin.mirror} ist keine Client-Haelfte (Host-Spiegel zurueck?)`);
    }
  }

  let inventory;
  try {
    inventory = JSON.parse(read(join(root, SEAM_INVENTORY)));
  } catch (error) {
    return [...issues, `Naht-Inventar ${SEAM_INVENTORY} fehlt oder parst nicht (${error.message})`];
  }
  const functions = inventory.functions ?? [];
  const literals = inventory.literals ?? [];
  const others = hostRuntimeFiles(root).filter((file) => file !== coreFile);
  // Ein Besitzer einer CLIENT-Regel darf im Host stehen (der Popup-Kern haelt die
  // Faltung, die Client-Haelfte spiegelt sie). Nur ein Host, der selbst NICHTS
  // besitzt, darf keine Region tragen — dort waere sie eine zweite Wahrheit.
  const owners = new Set(SOURCE_TWINS.map((twin) => twin.owner));

  for (const file of others) {
    const text = read(file);
    const rel = relative(root, file).split(sep).join('/');
    if (text.includes('// #region zwilling:') && !owners.has(rel)) {
      issues.push(`${rel}: zwilling-Region in einer Host-Haelfte — Host-Regeln werden importiert, nicht kopiert`);
    }
    const code = stripComments(text);
    for (const name of functions) {
      if (new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?function\\s+${name}\\s*\\(`).test(code)) {
        issues.push(`${rel}: definiert ${name}() — die Definition steht in ${SEAM_CORE}`);
      }
    }
    for (const { name, value } of literals) {
      if (code.includes(`'${value}'`)) {
        issues.push(`${rel}: traegt ${name} ("${value}") als Literal statt aus ${SEAM_CORE}`);
      }
    }
  }
  return issues;
}

