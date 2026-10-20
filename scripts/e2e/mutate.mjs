#!/usr/bin/env node
/**
 * mutate.mjs — pflanzt EINE menschliche Inkonsistenz in ein echtes Projekt.
 *
 * Kein Zufall und kein stilles Nichtstun: jede Mutation hat einen Anker, und ein
 * fehlender Anker endet mit Exit 1 (fail-closed). `--list` nennt alle Faelle,
 * `--dry-run` zeigt die Treffer ohne zu schreiben. So ist ein Lauf wiederholbar,
 * und „nichts passiert" ist ein Befund statt eines gruenen Scheins.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.shinon', 'dist', 'coverage']);

function walk(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files;
}

const read = (root, path) => readFileSync(join(root, path), 'utf8');
const write = (root, path, text) => writeFileSync(join(root, path), text);

/** Eine Datei, ein Anker, eine Ersetzung. Kein Anker ⇒ Wurf. */
function replaceIn(root, path, pattern, replacement, label) {
  const text = read(root, path);
  if (!pattern.test(text)) throw new Error(`Anker fehlt in ${path}: ${label}`);
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Ersetzung ohne Wirkung in ${path}: ${label}`);
  write(root, path, next);
  return path;
}

/** Alle Dateien unter einem Praefix, die den Anker tragen. */
function findWith(root, prefix, pattern) {
  return walk(root)
    .map((path) => relative(root, path))
    .filter((path) => path.startsWith(prefix) && pattern.test(read(root, path)));
}

export const CASES = {
  'api-field-rename': {
    what: 'Ein Feld wird nur in der API umbenannt; Store und Client behalten den alten Namen.',
    run(root) {
      const files = findWith(root, 'src/api/', /\bshipmentId\b/);
      if (files.length === 0) throw new Error('kein shipmentId in src/api/');
      return files.map((path) => replaceIn(root, path, /\bshipmentId\b/g, 'shipment_id', 'API-Feld'));
    },
  },
  'capacity-off-by-one': {
    what: 'Die Kapazitaetsgrenze wird strikt statt inklusiv (>= zu >).',
    run(root) {
      const files = findWith(root, 'src/domain/', /capacity|kapaz|gewicht|weight/i);
      if (files.length === 0) throw new Error('keine Kapazitaetsregel in src/domain/');
      return files.map((path) => replaceIn(root, path, /(>=)(?=[^\n]*(?:capacity|kapaz|gewicht|weight))/i, '>', 'Kapazitaetsgrenze'));
    },
  },
  'doc-limit-drift': {
    what: 'Die Dokumentation nennt eine andere Grenze als der Code (Zahl um 100 verschoben).',
    run(root) {
      const files = ['README.md', 'PLAN.md', 'docs/'].flatMap((prefix) => {
        try {
          return prefix === 'docs/'
            ? walk(root).map((p) => relative(root, p)).filter((p) => p.startsWith('docs/') && p.endsWith('.md'))
            : [prefix];
        } catch {
          return [];
        }
      }).filter((path) => {
        try { return /\b\d{3,4}\s*(kg|m³)/.test(read(root, path)); } catch { return false; }
      });
      if (files.length === 0) throw new Error('keine Grenze in kg/m³ in README/PLAN/docs');
      return files.map((path) => replaceIn(root, path, /\b(\d{3,4})(\s*(?:kg|m³))/i, (all, n, unit) => `${Number(n) + 100}${unit}`, 'Doku-Grenze'));
    },
  },
  'comment-contradiction': {
    what: 'Ein Kommentar behauptet das Gegenteil des Codes (volle Kapazitaet abgelehnt).',
    run(root) {
      const files = findWith(root, 'src/domain/', /weightCapacity/);
      if (files.length === 0) throw new Error('keine Kapazitaetsregel in src/domain/');
      return files.slice(0, 1).map((path) => replaceIn(
        root,
        path,
        /(\s*)(if \(weightExceeded)/,
        '$1// Exakt volle Kapazitaet wird abgelehnt: das Fahrzeug gilt dann als ueberladen.$1$2',
        'Kommentar',
      ));
    },
  },
  'swallow-error': {
    what: 'Ein gefangener Fehler wird still zu null, statt benannt weiterzureichen.',
    run(root) {
      const files = findWith(root, 'src/', /catch\s*\([^)]*\)\s*\{[^}]*throw /s);
      if (files.length === 0) throw new Error('kein catch mit throw in src/');
      return files.slice(0, 1).map((path) => replaceIn(
        root,
        path,
        /(catch\s*\([^)]*\)\s*\{)([^}]*?)throw [^;]+;/s,
        (all, head, body) => `${head}${body}return null; // still geschluckt`,
        'catch'));
    },
  },
  'duplicate-rule': {
    what: 'Eine zweite Regelkopie entsteht mit abweichendem Zielzustand.',
    run(root) {
      const source = findWith(root, 'src/domain/', /zugewiesen/)[0];
      if (source === undefined) throw new Error('keine Zustandsregel in src/domain/');
      const text = read(root, source);
      const copy = source.replace(/\.js$/, '-regeln.js');
      const shifted = text.replace(/zugewiesen/g, 'unterwegs');
      if (shifted === text) throw new Error('Kopie ohne Abweichung');
      write(root, copy, shifted);
      return [copy];
    },
  },
  'innerhtml': {
    what: 'Nutzertext landet in innerHTML statt textContent (ein Feld, nicht die ganze Datei).',
    run(root) {
      const files = findWith(root, 'src/web/', /textContent\s*=\s*`\(\$\{entry\.by\}\)`/);
      if (files.length === 0) throw new Error('kein Nutzerfeld (entry.by) in src/web/');
      return files.map((path) => replaceIn(root, path, /textContent(\s*=\s*`\(\$\{entry\.by\}\)`)/, 'innerHTML$1', 'Rendering'));
    },
  },
  'etag-ignore': {
    what: 'Der Nebenlaeufigkeitsvergleich wird umgangen (If-Match immer akzeptiert).',
    run(root) {
      const files = findWith(root, 'src/api/', /if-match/i);
      if (files.length === 0) throw new Error('kein If-Match in src/api/');
      return files.map((path) => replaceIn(
        root,
        path,
        /const\s+(\w+)\s*=\s*req\.headers\[['"]if-match['"]\];/i,
        'const $1 = undefined; // If-Match bewusst ignoriert',
        'ETag-Vergleich'));
    },
  },
  'delete-test': {
    what: 'Ein Test, der eine Zusage abdeckt, verschwindet (Datei wird umbenannt).',
    run(root) {
      const test = findWith(root, 'test/', /\b(?:it|test)\s*\(/)[0];
      if (test === undefined) throw new Error('kein Test unter test/');
      const text = read(root, test);
      write(root, `${test}.disabled`, text);
      write(root, test, '// Test entfernt (Mutation delete-test).\n');
      return [test, `${test}.disabled`];
    },
  },
  'todo-contradiction': {
    what: 'Eine Notiz widerspricht dem Auftrag (Kapazitaetspruefung optional).',
    run(root) {
      const path = 'README.md';
      const text = read(root, path);
      write(root, path, `${text}\n\n## Offen\n\n- Kapazitaetspruefung ist optional; harte Grenzen sind spaeter.\n`);
      return [path];
    },
  },
};

function main() {
  const args = process.argv.slice(2);
  const root = resolve(args[args.indexOf('--root') + 1] ?? '.');
  if (args.includes('--list')) {
    for (const [id, entry] of Object.entries(CASES)) console.log(`${id}\t${entry.what}`);
    return;
  }
  const index = args.indexOf('--case');
  const id = index === -1 ? null : args[index + 1];
  if (id === null || !(id in CASES)) {
    console.error(`usage: mutate.mjs --case <id> [--root <dir>] [--dry-run]\n${Object.keys(CASES).join(', ')}`);
    process.exit(2);
  }
  const dry = args.includes('--dry-run');
  const before = walk(root).length;
  if (dry) {
    console.log(`(dry-run) ${id}: ${CASES[id].what} — ${before} Dateien im Baum, nichts geschrieben`);
    return;
  }
  try {
    const changed = CASES[id].run(root);
    console.log(JSON.stringify({ case: id, root, files: changed, filesBefore: before }, null, 2));
  } catch (error) {
    console.error(`💥 ${id}: ${error.message} — Mutation NICHT angewendet`);
    process.exit(1);
  }
  if (statSync(root).isDirectory() === false) process.exit(1);
}

main();
