/**
 * project-file.js — die Anweisungsdatei EINES Projekts (SHINON.md).
 *
 * Eigentuemer-Grenze: diese Datei entscheidet, WO die Anweisung liegt, WIE sie
 * entsteht und was ein leerer Fall bedeutet. Der Runtime-Zustand liest nur noch
 * das Ergebnis.
 *
 * WARUM AUTOMATISCH ERZEUGT: ein Projekt ohne SHINON.md ist kein Fehler, aber
 * ein Projekt ohne Ort fuer seine Regeln. Beim ersten Schritt in einem fremden
 * Workspace legt Shinon deshalb eine VORLAGE an — kein Wissen ueber das Projekt,
 * nur die Felder, die ein Mensch fuellen kann. Was drinsteht, entscheidet das
 * Projekt; Shinon schreibt dort nie eigene Inhalte hinein.
 *
 * WARUM NICHT IN DEN PROMPTER-EINTRAG: der Eintrag hat eine Zeilengrenze und
 * soll keine Datei lesen (docs/contracts/structure.json). Die Regel „eine Datei
 * je Projekt“ gehoert in einen eigenen Kern.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/** Die Vorlage: Felder, die ein Mensch fuellen kann — keine Behauptungen. */
export const SHINON_MD_TEMPLATE = `# SHINON.md

<!-- Von Shinon beim ersten Schritt angelegt. Fuellen oder loeschen — beides ist
     eine Entscheidung des Projekts. Shinon schreibt hier nie eigene Inhalte
     hinein. -->

## Was dieses Projekt ist

## Regeln, die hier gelten

## Was hier nicht passiert
`;

/**
 * Die Anweisungsdatei lesen; fehlt sie, auf Wunsch die Vorlage anlegen.
 *
 * `root` ist der Workspace DER SITZUNG. Ein leerer Root legt nichts an: ohne
 * Projekt gibt es kein Projektfile (fail-closed, kein `process.cwd()`).
 */
export function ensureProjectFile({ root = '', name = 'SHINON.md', create = true } = {}) {
  if (typeof root !== 'string' || root === '') return { path: null, text: '', created: false, reason: 'OHNE_WURZEL' };
  const path = isAbsolute(name) ? name : join(root, name);
  let created = false;
  if (!existsSync(path)) {
    if (create !== true) return { path, text: '', created: false, reason: 'FEHLT' };
    try {
      writeFileSync(path, SHINON_MD_TEMPLATE, 'utf8');
      created = true;
    } catch (error) {
      return { path, text: '', created: false, reason: `NICHT_ANLEGBAR:${String(error?.code ?? error)}` };
    }
  }
  try {
    const text = readFileSync(path, 'utf8').trim();
    return { path, text, created, reason: text === '' ? 'LEER' : 'GELESEN' };
  } catch (error) {
    return { path, text: '', created, reason: `UNLESBAR:${String(error?.code ?? error)}` };
  }
}
