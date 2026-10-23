#!/usr/bin/env node
/**
 * scripts/build-client.mjs — eine Client-Hälfte aus ihren Quellteilen bauen.
 *
 * WARUM ES DIESES SKRIPT GIBT: Eine Client-Hälfte ist EIN selbstständiges
 * Bundle (`window.__ModuleLoader__.load`), sie kann zur Laufzeit keine Datei aus
 * `assets/` nachladen — DSH liefert Plugin-Ressourcen im Browser nicht als
 * Dateien aus. Gleichzeitig darf eine Quelldatei ihre Grenze nicht sprengen:
 * eine 3 000-Zeilen-Datei ist nicht lesbar, nicht prüfbar und nicht
 * reviewbar. Beides zusammen geht nur mit einem GENERIERTEN Bundle: die
 * Quellteile liegen klein unter `assets/client/`, `client.js` ist ihre Summe
 * im Rahmen des Modul-Loaders.
 *
 * DIE REGEL, DIE DEN UMBAU SICHER MACHT: die Quellteile sind die WÖRTLICHEN
 * Zeilen des Bundles. Der Generator verkettet sie ohne Umformatierung, ohne
 * Einrückung, ohne Sortierung. Deshalb ist die Abbildung verlustfrei und die
 * Bytegleichheit strukturell garantiert, nicht durch eine Transformation
 * hergestellt. Zwei Dinge folgen daraus und sind Absicht:
 *
 *   - `#region`/`#endregion` bleiben genau da, wo sie stehen (Spalte 0). Sie
 *     sind Fences, keine Prosa — die Zwillings-Prüfung (`zwilling:…`) findet
 *     sie nur dort, und `AGENTS.md` verbietet, sie zu verschieben.
 *   - ein Teil ist ein FRAGMENT, kein Modul: kein `import`, kein `export`, kein
 *     eigener Scope. Alle Teile landen im selben `factory(require)`-Scope.
 *
 * DIE DATEI IST DIE LISTE: die Marken im Bundle nennen ihre Quelle, nicht
 * umgekehrt. Ein neuer Teil wird deshalb im Bundle eingetragen (Splitter:
 * `scripts/assets/split-client.mjs`), und `--check` meldet jede Abweichung
 * zwischen Marke und Datei sowie jeden Teil, den keine Marke nennt.
 *
 *     // >>> @part assets/client/10-x.js
 *     … die Zeilen des Teils, wörtlich …
 *     // <<< @part assets/client/10-x.js
 *
 * Aufruf:
 *   node scripts/build-client.mjs <paket…>           # schreiben
 *   node scripts/build-client.mjs --check [<paket…>] # nur prüfen, Exit 1 bei Drift
 *   node scripts/build-client.mjs --all              # alle Pakete mit Marken
 *
 * Exit 0 = deckungsgleich (bzw. geschrieben), 1 = Drift/Befund, 2 = Aufruffehler.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBlock, writeBlock } from './lib/embed-blocks.mjs';
import { generiertMarke } from './lib/structure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const LF = String.fromCharCode(10);

/** Wo die Quellteile eines Pakets liegen (relativ zum Paketordner). */
export const PARTS_DIR = 'assets/client';

/** Das Präfix der Marle im Bundle; der Name ist der Pfad relativ zum Paket. */
export const PART_PREFIX = '@part ';

/** Alle Paketordner mit Quellteilordner. */
export function clientPackages(root) {
  const packages = join(root, 'packages');
  return readdirSync(packages).filter((name) => existsSync(join(packages, name, PARTS_DIR))).sort();
}

/** Die Quellteile eines Pakets, in Dateinamen-Reihenfolge (für Berichte). */
export function partFiles(root, pkg) {
  const dir = join(root, 'packages', pkg, PARTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.js')).sort();
}

/**
 * Die Quellteil-Marken eines Bundles, in der Reihenfolge des Textes.
 *
 * Der Name ist der GANZE Rest der Zeile (der Pfad), nicht sein erstes Wort:
 * `blockNames()` aus `embed-blocks.mjs` liefert genau das erste Wort und ist
 * für die Sprite-Regionen richtig (`SPRITE_GRIDS`), für einen Pfad aber falsch.
 */
export function partNames(text) {
  const names = [];
  const marker = '// >>> ' + PART_PREFIX;
  let at = text.indexOf(marker);
  while (at !== -1) {
    const end = text.indexOf(LF, at);
    names.push(text.slice(at + marker.length, end === -1 ? text.length : end));
    at = text.indexOf(marker, end === -1 ? text.length : end);
  }
  return names;
}

/** Den Pfad einer Marke prüfen und auflösen; fail-closed. */
function resolvePart(root, pkg, path) {
  if (!path.startsWith(PARTS_DIR + '/') || !path.endsWith('.js')) {
    throw new Error('Marke "' + path + '" nennt keinen Teil unter ' + PARTS_DIR + '/…js');
  }
  if (path.includes('..') || path.includes('\\')) {
    throw new Error('Marke "' + path + '" verlässt den Paketordner');
  }
  const file = join(root, 'packages', pkg, path);
  if (!existsSync(file)) throw new Error('Quellteil fehlt: packages/' + pkg + '/' + path);
  return file;
}

/**
 * Das Bundle eines Pakets bauen (ohne zu schreiben): jeder markierte Block
 * bekommt den wörtlichen Inhalt seiner Datei. Der Rahmen (Kopf, `load`,
 * `factory`) bleibt, wie er in der Datei steht — er ist die Modul-Identität und
 * wird nicht generiert.
 *
 * @returns {{text: string, parts: string[]}}
 */
export function buildClient(root, pkg) {
  const target = join(root, 'packages', pkg, 'client.js');
  if (!existsSync(target)) throw new Error('packages/' + pkg + '/client.js fehlt');
  const original = readFileSync(target, 'utf8');
  const names = partNames(original);
  if (names.length === 0) {
    throw new Error('packages/' + pkg + '/client.js trägt keine "' + PART_PREFIX + '…"-Marken');
  }
  if (new Set(names).size !== names.length) throw new Error('ein Quellteil ist doppelt markiert');
  let text = original;
  for (const path of names) {
    const name = PART_PREFIX + path;
    const file = resolvePart(root, pkg, path);
    const body = readFileSync(file, 'utf8').replace(/\n+$/, '');
    if (body.trim() === '') throw new Error('leerer Quellteil: ' + path);
    if (/^\s*(?:import|export)\s/m.test(body)) {
      throw new Error(path + ': ein Teil ist ein Fragment, kein Modul (kein import/export)');
    }
    // readBlock/writeBlock arbeiten mit der Marke als Name — dieselbe Suche wie
    // build-sprites, damit eine Marke nirgends anders gelesen wird als geschrieben.
    readBlock(text, name);
    text = writeBlock(text, name, body + LF);
  }
  // Jeder Teil im Ordner muss von genau einer Marke genannt sein: eine Datei,
  // die niemand einbettet, wäre toter Text mit dem Anschein einer Quelle.
  const orphans = partFiles(root, pkg).filter((file) => names.indexOf(PARTS_DIR + '/' + file) === -1);
  if (orphans.length > 0) {
    throw new Error('Quellteil ohne Marke: ' + orphans.join(', ') + ' (im Bundle eintragen oder löschen)');
  }
  return { text, parts: names };
}

/**
 * Die Montage-Befunde des ganzen Baums — EINE Funktion für Gate, Build und Test.
 *
 * Drei Zusagen, die zusammen gelten müssen:
 *   1. Jedes Bundle mit Quellteil-Marken ist bytegleich zu seinen Teilen.
 *   2. Ein Bundle mit der GENERIERT-Marke hat Quellteile (sonst ist die Marke
 *      eine Behauptung, und die Zeilengrenze wäre still abgeschaltet).
 *   3. Ein `assets/client/`-Ordner ohne Marken im Bundle ist ein Befund: die
 *      Teile wären toter Text mit dem Anschein einer Quelle.
 */
export function clientMontageIssues(root = ROOT) {
  const issues = [];
  const packages = readdirSync(join(root, 'packages')).sort();
  for (const pkg of packages) {
    const target = join(root, 'packages', pkg, 'client.js');
    if (!existsSync(target)) continue;
    const text = readFileSync(target, 'utf8');
    const names = partNames(text);
    const generiert = generiertMarke(text);
    if (names.length === 0) {
      if (generiert) issues.push('packages/' + pkg + '/client.js trägt die GENERIERT-Marke, aber keine Quellteile');
      if (existsSync(join(root, 'packages', pkg, PARTS_DIR))) {
        issues.push('packages/' + pkg + '/' + PARTS_DIR + '/ existiert, aber client.js nennt keinen Teil');
      }
      continue;
    }
    try {
      const built = buildClient(root, pkg);
      if (built.text !== text) {
        issues.push('packages/' + pkg + '/client.js weicht von seinen Quellteilen ab — '
          + '`node scripts/build-client.mjs ' + pkg + '` schreibt sie');
      }
    } catch (error) {
      issues.push('packages/' + pkg + '/client.js: ' + error.message);
    }
  }
  return issues;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const all = args.includes('--all');
  const wanted = args.filter((arg) => !arg.startsWith('--'));

  let packages;
  if (all) {
    packages = clientPackages(ROOT);
  } else if (wanted.length > 0) {
    packages = wanted;
  } else {
    console.error('Aufruf: node scripts/build-client.mjs <paket…> | --check [<paket…>] | --all');
    process.exit(2);
  }

  let drift = 0;
  for (const pkg of packages) {
    const target = join(ROOT, 'packages', pkg, 'client.js');
    let built;
    try {
      built = buildClient(ROOT, pkg);
    } catch (error) {
      console.error('❌ ' + pkg + ': ' + error.message);
      drift += 1;
      continue;
    }
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    const same = current === built.text;
    if (check) {
      if (!same) {
        console.error('❌ packages/' + pkg + '/client.js weicht von seinen Quellteilen ab — '
          + '`node scripts/build-client.mjs ' + pkg + '` schreibt sie.');
        drift += 1;
      } else {
        console.log('✅ ' + pkg + ': ' + built.parts.length + ' Teile, deckungsgleich ('
          + built.text.split(LF).length + ' Zeilen)');
      }
      continue;
    }
    if (same) {
      console.log('= ' + pkg + ': deckungsgleich (' + built.parts.length + ' Teile)');
    } else {
      writeFileSync(target, built.text);
      console.log('✍ ' + pkg + ': geschrieben (' + built.parts.length + ' Teile, '
        + built.text.split(LF).length + ' Zeilen)');
    }
  }
  if (drift > 0) process.exit(1);
}

const invoked = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    main();
  } catch (error) {
    console.error('💥 build-client: ' + (error?.stack ?? error));
    process.exit(1);
  }
}
