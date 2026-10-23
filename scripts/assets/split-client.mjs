#!/usr/bin/env node
/**
 * scripts/assets/split-client.mjs — ein handgeschriebenes Client-Bundle
 * EINMALIG in Quellteile zerlegen.
 *
 * WARUM ES DIESES SKRIPT GIBT: `scripts/build-client.mjs` baut ein Bundle aus
 * markierten Quellteilen. Der erste Schritt dorthin ist mechanisch und
 * fehleranfällig (3 400 Zeilen an den falschen Stellen schneiden), also macht
 * ihn ein Werkzeug, nicht ein Mensch: es schneidet an Deklarationen der
 * obersten Ebene (exakt vier Leerzeichen Einrückung), nimmt die direkt
 * darüberstehenden Kommentarzeilen mit und schreibt die Zeilen WÖRTLICH in
 * `packages/<pkg>/assets/client/<nn>-<name>.js`. Danach trägt das Bundle je
 * Teil ein Markenpaar, und ab hier ist die Datei generiert.
 *
 * WAS ES ABSICHTLICH NICHT TUT: umformatieren, einrücken, sortieren, Blöcke
 * zusammenfassen. Die Teile sind die Bundle-Zeilen; nur so ist die
 * Bytegleichheit strukturell und nicht durch eine Transformation versprochen.
 * `#region`-Zeilen (Spalte 0, Zwillinge mit einer Host-Datei) werden nie
 * geschnitten und nie verschoben.
 *
 * Aufruf:
 *   node scripts/assets/split-client.mjs <paket…> [--force]
 *
 * Ohne `--force` verweigert es das Überschreiben vorhandener Teile (Exit 2):
 * ein zweiter Lauf über einen schon zerlegten Client würde Handarbeit
 * zerstören. Exit 0 = zerlegt, 1 = Befund, 2 = Aufruffehler.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const LF = String.fromCharCode(10);

/** Harte Obergrenze eines Teils (die `core`-Klasse erlaubt 650 Zeilen). */
const SOFT_MAX = 600;

/**
 * Zielgröße eines Teils. Ein Teil ist ein LESBARES Kapitel, keine einzelne
 * Deklaration: 200 Deklarationen à eine Zeile wären 200 Dateien, die niemand
 * liest. Geschnitten wird trotzdem nur an Deklarationsgrenzen — die Grenze
 * bestimmt die Gruppierung, nie eine Zeile mitten im Ausdruck.
 */
const TARGET = 200;

/** Eine Zeile beginnt eine Deklaration der obersten Ebene (vier Leerzeichen). */
const DECLARATION = /^    (?:const|let|var|function|async function|class) /;

/** Vier Leerzeichen Einrückung und ein Kommentar (Zeilen- oder Blockform). */
const COMMENT_AT_TOP = /^    (?:\/\/|\/\*)/;

/** Ein Blockkommentar endet hier (auf der Ebene der Deklaration). */
const COMMENT_CLOSE = /^ {5}\*\/$/;

function readLine(file) {
  return readFileSync(file, 'utf8').split(LF);
}

/** Den Rumpf (Zeilen zwischen `factory(require) {` und dem Schluss) finden. */
function frame(lines, pkg) {
  const start = lines.findIndex((line) => line === '  factory(require) {');
  if (start === -1) throw new Error(pkg + ': kein "  factory(require) {" im Bundle');
  let close = lines.length - 1;
  while (close >= 0 && lines[close] === '') close -= 1;
  if (lines[close] !== '});' || !/^  \},?$/.test(lines[close - 1] ?? '')) {
    throw new Error(pkg + ': das Bundle endet nicht mit einer factory-Klammer und "});"');
  }
  // Der Rahmen bleibt, wie er ist: ein fehlendes Komma nach `}` wird NICHT
  // ergänzt (das wäre eine Änderung am Handbundle, keine Zerlegung).
  return { start, end: close - 1 };
}

/** Den Namen einer Deklarationszeile lesen (Slug für den Dateinamen). */
function declarationName(line) {
  const match = /^    (?:const|let|var|function|async function|class) ([A-Za-z_$][\w$]*)/.exec(line);
  return match === null ? null : match[1];
}

/** Die Startzeile eines Blocks: Deklaration samt davorstehendem Kommentar. */
function blockStart(lines, index) {
  let at = index;
  // Rückwärts über Kommentarzeilen, die unmittelbar davorstehen.
  while (at > 0) {
    const prev = lines[at - 1];
    if (COMMENT_AT_TOP.test(prev) || COMMENT_CLOSE.test(prev) || /^ {5}\*/.test(prev) || prev === '     */') {
      at -= 1;
      continue;
    }
    break;
  }
  return at;
}

/** Ein Bundle in Teile zerlegen (jeder Teil ist ein Zeilenarray, wörtlich). */
export function splitClient(text, pkg) {
  const lines = text.split(LF);
  const { start, end } = frame(lines, pkg);
  const body = lines.slice(start + 1, end);
  // FENCES sind fuer Schnitte gesperrt — JEDE, nicht nur die zwei, an die
  // zuerst gedacht wurde:
  //
  //   - `// #region zwilling:…` bis `// #endregion zwilling:…` ist per
  //     `repo-zwillinge.mjs` BYTEGLEICH zu einer Host-Datei;
  //   - `// >>> …` bis `// <<< …` ist ein GENERIERTER Block (`build-sprites`,
  //     `build-codingmon`, `build-encounter-client`, `npm run idioms`). Sein
  //     Schreiber ersetzt den Rumpf zwischen den Marken; eine Teile-Marke darin
  //     wuerde beim naechsten Lauf mitverschluckt.
  //
  // Der zweite Fall war ein echter Fehler (2026-10-23): der Encounter-Kern wurde
  // mitten durchgeschnitten, und der Encounter-Generator loeschte beim ersten
  // Schreiben die Teile-Marken mit. Deshalb sperrt die Schleife jetzt jede
  // Markenfamilie und verweigert eine unbalancierte Datei, statt zu raten.
  const locked = new Set();
  const stack = [];
  const opened = [];
  for (let i = 0; i < body.length; i += 1) {
    const fence = body[i].trimStart();
    if (fence.startsWith('// >>> ')) { stack.push(fence.slice(7).split(' ')[0]); opened.push(i); }
    if (fence.startsWith('// <<< ')) {
      const name = fence.slice(7).split(' ')[0];
      if (stack[stack.length - 1] !== name) {
        throw new Error(pkg + ': Marke "' + name + '" schliesst nicht die offene "' + (stack[stack.length - 1] ?? '') + '"');
      }
      stack.pop();
      const from = opened.pop();
      for (let j = from; j <= i; j += 1) locked.add(j);
    }
    if (fence.startsWith('// #region ')) { stack.push(fence); opened.push(i); }
    if (fence.startsWith('// #endregion ') && stack[stack.length - 1]?.startsWith('// #region ')) {
      stack.pop();
      const from = opened.pop();
      for (let j = from; j <= i; j += 1) locked.add(j);
    }
  }
  if (stack.length > 0) throw new Error(pkg + ': unbalancierte Marke "' + stack[stack.length - 1] + '" im Rumpf');
  const cuts = [];
  for (let i = 0; i < body.length; i += 1) {
    if (!DECLARATION.test(body[i])) continue;
    const at = blockStart(body, i);
    if (at === 0) continue;
    // Nicht nur die Startzeile: der Ruecklauf ueber Kommentarzeilen darf einen
    // Schnitt nicht in eine gesperrte Region ziehen.
    let insideFence = false;
    for (let j = at; j <= i && !insideFence; j += 1) if (locked.has(j)) insideFence = true;
    if (insideFence) continue;
    if (cuts.length > 0 && at <= cuts[cuts.length - 1]) continue;
    cuts.push(at);
  }
  if (cuts.length === 0) throw new Error(pkg + ': keine Deklaration auf der obersten Ebene gefunden');
  const blocks = [];
  const bounds = [0, ...cuts, body.length];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const slice = body.slice(bounds[i], bounds[i + 1]);
    // Führende Leerzeilen eines Blocks gehören zum vorherigen Block — sie
    // trennen die Teile im Bundle und bleiben dort, wo sie stehen.
    while (slice.length > 0 && slice[0] === '' && i > 0) {
      blocks[blocks.length - 1].lines.push(slice.shift());
    }
    if (slice.length === 0) continue;
    blocks.push({ lines: slice });
  }
  // Aus den Deklarationsblöcken Kapitel formen, bis das Ziel erreicht ist.
  const chapters = [];
  let current = [];
  let size = 0;
  for (const block of blocks) {
    if (block.lines.length > SOFT_MAX) {
      throw new Error(pkg + ': ein Block hat ' + block.lines.length + ' Zeilen (Grenze ' + SOFT_MAX + ')');
    }
    if (current.length > 0 && size + block.lines.length > TARGET) {
      chapters.push({ lines: current });
      current = [];
      size = 0;
    }
    current.push(...block.lines);
    size += block.lines.length;
  }
  if (current.length > 0) chapters.push({ lines: current });
  if (chapters.length === 0) throw new Error(pkg + ': Zerlegung ergab keinen Teil');
  return { head: lines.slice(0, start + 1), body: chapters, tail: lines.slice(end) };
}

/** Einen Dateinamen aus der ersten Deklaration eines Teils bauen. */
function partName(block, index) {
  const first = block.lines.find((line) => declarationName(line) !== null);
  const name = first === undefined ? 'teil' : declarationName(first);
  const slug = name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40) || 'teil';
  return String(index + 1).padStart(2, '0') + '-' + slug + '.js';
}

/** Die GENERIERT-Zeile in den Kopf setzen (additiv, nie den Kopf ersetzen). */
function markGenerated(head, pkg) {
  const marker = ' * GENERIERT aus ' + 'assets/client/*.js' + ' — nicht von Hand ändern; '
    + 'Schreiben: node scripts/build-client.mjs ' + pkg + '.';
  if (head.some((line) => line.includes('GENERIERT aus'))) return head;
  const at = head.findIndex((line) => line.startsWith(' * '));
  if (at === -1) {
    return ['/**', ' * @shinon/' + pkg + ' — Client-Hälfte.', marker, ' */', ...head];
  }
  // Hinter die erste Beschreibungszeile: der Kopf behält seinen Aufbau, die
  // GENERIERT-Zeile steht sichtbar oben und nicht vor dem Titel.
  return [...head.slice(0, at + 1), marker, ...head.slice(at + 1)];
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const packages = args.filter((arg) => !arg.startsWith('--'));
  if (packages.length === 0) {
    console.error('Aufruf: node scripts/assets/split-client.mjs <paket…> [--force]');
    process.exit(2);
  }
  let findings = 0;
  for (const pkg of packages) {
    const client = join(ROOT, 'packages', pkg, 'client.js');
    if (!existsSync(client)) {
      console.error('❌ ' + pkg + ': packages/' + pkg + '/client.js fehlt');
      findings += 1;
      continue;
    }
    const dir = join(ROOT, 'packages', pkg, 'assets', 'client');
    if (existsSync(dir) && readdirSync(dir).some((name) => name.endsWith('.js')) && !force) {
      console.error('❌ ' + pkg + ': assets/client/ enthält schon Teile — `--force` würde sie überschreiben');
      findings += 1;
      continue;
    }
    let split;
    try {
      split = splitClient(readFileSync(client, 'utf8'), pkg);
    } catch (error) {
      console.error('❌ ' + pkg + ': ' + error.message);
      findings += 1;
      continue;
    }
    mkdirSync(dir, { recursive: true });
    const names = split.body.map((block, index) => 'assets/client/' + partName(block, index));
    split.body.forEach((block, index) => {
      writeFileSync(join(ROOT, 'packages', pkg, names[index]), block.lines.join(LF) + LF);
    });
    const marked = names.map((name) => ['// >>> @part ' + name, ...readFileSync(join(ROOT, 'packages', pkg, name), 'utf8')
      .replace(/\n+$/, '').split(LF), '// <<< @part ' + name, ''].join(LF));
    const head = markGenerated(split.head, pkg);
    const text = [...head, ...marked.flatMap((chunk) => chunk.split(LF)), ...split.tail].join(LF);
    writeFileSync(client, text);
    console.log('✂ ' + pkg + ': ' + names.length + ' Teile, ' + split.body.reduce((sum, b) => sum + b.lines.length, 0)
      + ' Rumpfzeilen, größter Teil ' + Math.max(...split.body.map((b) => b.lines.length)) + ' Zeilen');
    names.forEach((name, index) => console.log('   ' + String(index + 1).padStart(2, '0') + ' ' + name
      + ' (' + split.body[index].lines.length + ')'));
  }
  if (findings > 0) process.exit(1);
}

const invoked = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    main();
  } catch (error) {
    console.error('💥 split-client: ' + (error?.stack ?? error));
    process.exit(1);
  }
}
