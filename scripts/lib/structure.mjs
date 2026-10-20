/**
 * Der Struktur-Riegel: Klassen, Grenzen, Eigentum.
 *
 * Warum es diese Datei gibt: Die Zahlen in `docs/ZAHLEN.md` sagen, WIE VIELE
 * Dateien es gibt, aber nicht, wie groß eine werden darf. Ohne Grenze wächst
 * jede Datei genau so lange, bis niemand sie mehr am Stück liest — und die
 * Grenze, die man dann rät, ist entweder zu eng (Arbeit, die niemand braucht)
 * oder zu weit (sie greift nie). Deshalb stehen die Grenzen in
 * `docs/contracts/structure.json` zusammen mit der Messung, aus der sie folgen
 * (Median und Maximum je Klasse am 2026-10-20).
 *
 * Drei Dinge macht dieser Schritt rot, und jedes hat einen eigenen Befund:
 *
 *   1. Zeilen über der Klassengrenze — oder über dem eingefrorenen Bestand,
 *      der nur SINKEN darf. Eine Datei, die heute schon zu groß ist, wird nicht
 *      zerlegt (das wäre Arbeit, die der Auftrag verbietet); sie wird benannt.
 *   2. Eine Datei ohne deklarierten Eigentümer: kein Klassenmuster trifft sie.
 *      Das ist der Fall, in dem eine neue Rolle entstanden ist, ohne dass
 *      jemand ihre Grenze entschieden hat.
 *   3. Eine Datei, die den Vertrag ihrer Klasse verletzt. Die Classen-Registry
 *      sagt, was eine Hälfte AUSMACHT (z. B. `client.js` trägt kein Schema,
 *      `index.js` trägt `apply`); ohne diese Prüfung wäre ein Klassenname nur
 *      ein Ordner-Etikett.
 *
 * Was der Schritt bewusst NICHT tut: er zählt keine `export function` und
 * keine Zustands-Eigentümer. Verantwortung ist nicht maschinell messbar, und
 * eine Heuristik darauf würde beim ersten Fehlalarm abgeschaltet. Getrennt
 * wird nach Eigentum (unten im Vertrag jeder Klasse benannt); die Grenze
 * verhindert nur, dass die Trennung wieder zuwächst.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Der Baum, den dieser Riegel meint, ist der, in dem er liegt — nicht das
// Arbeitsverzeichnis des Aufrufers. Ein Gate, dessen Ergebnis von `cd` abhängt,
// ist keins.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const STRUCTURE_FILE = 'docs/contracts/structure.json';
export const CONTRACT = 'shinon.structure/v1';

/**
 * Alle Dateien des Baums, die eine Klasse haben können — dieselbe Auswahl wie
 * die Zählung in `docs/ZAHLEN.md`, damit Grenze und Zahl nicht auseinander
 * laufen. `dist/`, `node_modules/` und das geseedete DSH-Home sind erzeugt und
 * gehen niemanden an.
 */
const WURZELN = ['packages', 'scripts', 'bin'];
const AUSGESCHLOSSEN = /(^|\/)(node_modules|dist|dev-dsh-home|\.git)(\/|$)/;

/** Alle Code-Dateien unter den Wurzeln, relativ und sortiert. */
function codeDateien(root) {
  const dateien = [];
  for (const base of WURZELN) {
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const name of readdirSync(current)) {
        const abs = join(current, name);
        if (AUSGESCHLOSSEN.test(zuRelative(root, abs))) continue;
        if (statSync(abs).isDirectory()) stack.push(abs);
        else if (CODE.test(name)) dateien.push(abs);
      }
    }
  }
  return dateien.sort();
}

/** Datei-Endungen, die als Code zählen. Markdown und JSON tragen keine Grenze. */
const CODE = /\.(js|mjs|cjs)$/;

function zeilen(abs) {
  const text = readFileSync(abs, 'utf8');
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  // Dieselbe Zählung wie `wc -l`: die Zeilenzahl, die eine Leserin im Editor
  // sieht, wenn die Datei mit einem Zeilenumbruch endet (was sie soll).
  return text.length > 0 && !text.endsWith('\n') ? n + 1 : n;
}

function zuRelative(root, abs) {
  return relative(root, abs).split(sep).join('/');
}

/**
 * Der Befund zu EINER Datei — oder null. Getrennt von der Schleife, damit der
 * Test genau eine Regel einzeln anfahren kann, ohne einen ganzen Baum zu bauen.
 */
export function dateiBefund({ datei, lines, struktur }) {
  const klasse = (struktur.klassen ?? []).find((k) => new RegExp(k.muster).test(datei));
  if (klasse === undefined) {
    return `${datei}: keine Klasse — kein Muster in ${STRUCTURE_FILE} trifft einen Eigentümer`;
  }
  const bestand = struktur.bestand?.[datei];
  if (bestand !== undefined) {
    if (lines > bestand) {
      return `${datei}: ${lines} Zeilen, Bestand ${bestand} (${klasse.id}) — der Bestand darf nur sinken`;
    }
    if (lines < bestand) {
      return `${datei}: ${lines} Zeilen, Bestand nennt ${bestand} (${klasse.id}) — senke den Eintrag auf ${lines}`;
    }
    return null;
  }
  if (lines > klasse.grenze) {
    return `${datei}: ${lines} Zeilen über der Grenze ${klasse.grenze} (${klasse.id}) — entweder trennen oder als Bestand eintragen`;
  }
  return null;
}

/**
 * Alle Befunde des Baums. Reihenfolge: Klassenzuordnung, Grenze, toter
 * Bestandseintrag, Vertrag — damit der erste Befund schon die Ursache nennt.
 */
export function structureIssues(root = ROOT) {
  const issues = [];
  const file = join(root, STRUCTURE_FILE);
  if (!existsSync(file)) return [`${STRUCTURE_FILE} fehlt — ohne Registry gibt es keine Grenze`];
  let struktur;
  try {
    struktur = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return [`${STRUCTURE_FILE}: kein JSON (${error.message})`];
  }
  if (struktur.contract !== CONTRACT) {
    return [`${STRUCTURE_FILE}: Vertrag ${struktur.contract ?? '(fehlt)'} statt ${CONTRACT}`];
  }
  for (const key of ['rules', 'klassen', 'bestand']) {
    if (struktur[key] === undefined) issues.push(`${STRUCTURE_FILE}: Feld \`${key}\` fehlt`);
  }
  for (const klasse of struktur.klassen ?? []) {
    if (typeof klasse.grenze !== 'number' || klasse.grenze <= 0) {
      issues.push(`${STRUCTURE_FILE}: Klasse ${klasse.id} ohne positive Grenze`);
    }
    if (klasse.gemessen === undefined) {
      issues.push(`${STRUCTURE_FILE}: Klasse ${klasse.id} ohne Messung — die Grenze wäre geraten`);
    }
  }
  if (issues.length > 0) return issues;

  const gesehen = new Set();

  for (const abs of codeDateien(root)) {
    const datei = zuRelative(root, abs);
    gesehen.add(datei);
    const lines = zeilen(abs);
    const befund = dateiBefund({ datei, lines, struktur });
    if (befund !== null) {
      issues.push(befund);
      continue;
    }
    const klasse = struktur.klassen.find((k) => new RegExp(k.muster).test(datei));
    const text = readFileSync(abs, 'utf8');
    for (const nadel of klasse.vertrag ?? []) {
      if (!text.includes(nadel)) issues.push(`${datei}: Vertrag der Klasse ${klasse.id} verlangt \`${nadel}\``);
    }
    for (const nadel of klasse.verboten ?? []) {
      if (text.includes(nadel)) issues.push(`${datei}: Klasse ${klasse.id} verbietet \`${nadel}\``);
    }
  }

  for (const datei of Object.keys(struktur.bestand ?? {})) {
    if (!gesehen.has(datei)) issues.push(`${datei}: Bestandseintrag ohne Datei — Eintrag entfernen`);
  }
  return issues;
}
