/**
 * embed-blocks.mjs — Eigentuemer: markierte Bloecke in generierten Dateien.
 *
 * WARUM ES DIESE DATEI GIBT: Zwei Werkzeuge schreiben in dieselbe Art Datei —
 * `scripts/assets/build-sprites.mjs` bettet Gitter, UI-SVGs und die Kunst in
 * `packages/codingmon/client.js` ein, `scripts/build-client.mjs` setzt die
 * Client-Bundles aus ihren Quellteilen zusammen. Vorher trug `build-sprites`
 * seine eigene Kopie der Block-Suche (`indexOf`/`LF`); eine zweite Kopie waere
 * der naechste Ort, an dem eine Marke anders gelesen wird als geschrieben.
 *
 * Der Vertrag eines Blocks ist klein und absichtlich streng:
 *
 *     // >>> <name> — <Quelle>          (die Marke, Rest der Zeile ist Prosa)
 *     <Inhalt>
 *     // <<< <name>
 *
 * `name` ist eindeutig je Datei. Fehlt eine Marke, ist das ein Fehler und kein
 * stiller Neubau: wer den Block nicht findet, darf ihn nicht erfinden.
 *
 * Die Blocksuche ist LITERAL (Zeilenvergleich ueber `indexOf`) und benutzt
 * `String.fromCharCode(10)` statt Escape-Sequenzen — dieselbe Regel wie in
 * `build-sprites.mjs`: eine Suche nach Escapes kann an Escapes scheitern.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LF = String.fromCharCode(10);

/** Die Startmarke einer Region im Text finden; -1 heisst: nicht da. */
function openIndex(text, name) {
  return text.indexOf('// >>> ' + name);
}

/** Die Schlussmarke einer Region ab `from` finden; -1 heisst: nicht da. */
function closeIndex(text, name, from) {
  return text.indexOf('// <<< ' + name, from);
}

/**
 * Eine Region lesen: ihre Grenzen und ihr Rumpf (ohne die Markenzeilen).
 *
 * @returns {{openAt: number, bodyStart: number, closeAt: number, body: string}}
 * @throws wenn eine der beiden Marken fehlt.
 */
export function readBlock(text, name) {
  const openAt = openIndex(text, name);
  if (openAt === -1) throw new Error('Block "' + name + '" ohne Startmarke');
  const bodyStart = text.indexOf(LF, openAt) + 1;
  if (bodyStart === 0) throw new Error('Block "' + name + '" hat keine Zeile nach der Startmarke');
  const closeAt = closeIndex(text, name, bodyStart);
  if (closeAt === -1) throw new Error('Block "' + name + '" ohne Schlussmarke');
  return { openAt, bodyStart, closeAt, body: text.slice(bodyStart, closeAt) };
}

/**
 * Die Markenzeilen eines Rumpfes pruefen: sie muessen sich paarweise schliessen.
 *
 * WARUM DAS EIN RIEGEL IST: ein Block darf andere Bloecke ENTHALTEN (das
 * Codingmon-Bundle traegt in einem Quellteil den eingebetteten Encounter-Kern),
 * aber er darf keine fremde Marke VERSCHLUCKEN. Genau das ist am 2026-10-23
 * passiert: der Splitter hatte den `generated-encounter-core`-Block mitten
 * durchgeschnitten, der Encounter-Generator ersetzte „seinen" Rumpf und nahm
 * dabei `// <<< @part …` und `// >>> @part …` mit — danach fehlte einer der
 * acht Teile-Markenpaare, und der Schaden war nur an einer Bytegleichheit
 * sichtbar, die von einer anderen Datei geprueft wird. Eine unbalancierte
 * Marke im Rumpf ist deshalb ein Fehler VOR dem Schreiben.
 *
 * @returns {string|null} der erste Befund oder null.
 */
export function markerBalance(body) {
  const stack = [];
  for (const line of body.split(LF)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('// >>> ')) stack.push(trimmed.slice(7).split(' ')[0]);
    else if (trimmed.startsWith('// <<< ')) {
      const name = trimmed.slice(7).split(' ')[0];
      if (stack[stack.length - 1] !== name) {
        return 'Schlussmarke "' + name + '" ohne passende Startmarke';
      }
      stack.pop();
    }
  }
  return stack.length > 0 ? 'Startmarke "' + stack[stack.length - 1] + '" ohne Schlussmarke' : null;
}

/**
 * Den Rumpf einer Region ersetzen und den neuen Text zurueckgeben.
 *
 * Beide Seiten werden auf Marken-Balance geprueft (siehe `markerBalance`): der
 * alte Rumpf, weil ein Ersatz sonst fremde Marken verschluckt, und der neue,
 * weil eine unbalancierte Einbettung den naechsten Schreiber in denselben
 * Fehler laufen liesse.
 */
export function writeBlock(text, name, body) {
  const { bodyStart, closeAt, body: alt } = readBlock(text, name);
  const oldIssue = markerBalance(alt);
  if (oldIssue !== null) {
    throw new Error('Block "' + name + '" wuerde fremde Marken verschlucken: ' + oldIssue);
  }
  const newIssue = markerBalance(body);
  if (newIssue !== null) {
    throw new Error('Block "' + name + '" bekommt einen unbalancierten Rumpf: ' + newIssue);
  }
  return text.slice(0, bodyStart) + body + text.slice(closeAt);
}

/**
 * Eine Region als JSON-Wert lesen.
 *
 * Gestalt: `const <NAME> = {…};` — der Wert hinter dem `=`, ohne Semikolon.
 * Alles andere ist ein Fehler: ein Block, der nicht genau diese Zuweisung
 * traegt, ist nicht der Block, den der Aufrufer meint.
 */
export function readBlockValue(text, name, constName) {
  const body = readBlock(text, name).body.trim();
  const prefix = 'const ' + constName + ' = ';
  if (!body.startsWith(prefix) || !body.endsWith(';')) {
    throw new Error('Block "' + name + '" enthaelt keine Zuweisung an ' + constName);
  }
  return JSON.parse(body.slice(prefix.length, -1));
}

/** Die Einrueckung der Zeile, in der `at` liegt (ab Zeilenanfang bis `at`). */
function indentationAt(text, at) {
  const lineStart = text.lastIndexOf(LF, at - 1) + 1;
  let indent = '';
  for (let i = lineStart; i < at; i += 1) {
    const ch = text[i];
    if (ch !== ' ' && ch !== String.fromCharCode(9)) break;
    indent += ch;
  }
  return indent;
}

/**
 * Einen fertigen Rumpf schreiben — die Einrueckung der Schlussmarke gilt fuer
 * das Ende des Rumpfes.
 *
 * Warum das noetig ist: `writeBlock` ersetzt [Rumpfstart, Schlussmarke), also
 * AUCH die Einrueckung vor der Schlussmarke. Ein Schreiber, der das nicht
 * nachzieht, verliert vier Leerzeichen pro Lauf — ein Schaden, den niemand
 * sucht, weil das Ergebnis syntaktisch gueltig bleibt.
 */
export function writeBlockBody(text, name, body) {
  const { closeAt } = readBlock(text, name);
  return writeBlock(text, name, body + LF + indentationAt(text, closeAt));
}

/**
 * Eine Region mit einem JSON-Wert schreiben — die Einrueckung der Schlussmarke
 * gilt fuer den Rumpf.
 *
 * `oneLinePerKey` schreibt je Schluessel eine Zeile. Das ist fuer die Kunst
 * noetig: 50 Eintraege a vier Kilobyte auf einer Zeile waeren im Diff und im
 * Editor nicht mehr lesbar.
 */
export function writeBlockValue(text, name, constName, value, options = {}) {
  const { closeAt } = readBlock(text, name);
  const indent = indentationAt(text, closeAt);
  let body;
  if (options.oneLinePerKey === true) {
    const keys = Object.keys(value);
    const lines = keys.map((key, index) => indent + '  ' + JSON.stringify(key) + ': ' + JSON.stringify(value[key])
      + (index === keys.length - 1 ? '' : ','));
    body = indent + 'const ' + constName + ' = {' + LF + lines.join(LF) + LF + indent + '};';
  } else {
    body = indent + 'const ' + constName + ' = ' + JSON.stringify(value) + ';';
  }
  return writeBlockBody(text, name, body);
}

/**
 * Die Quelldatei, in der ein Block steht — gesucht, nicht verdrahtet.
 *
 * WARUM GESUCHT: seit 2026-10-23 schreiben die Einbetter in die QUELLTEILE
 * (`packages/<dir>/assets/client/*.js`), nicht mehr in `client.js` — das Bundle
 * ist generiert, und ein Generator, der dorthin schreibt, schreibt in eine
 * Datei, die der naechste `build-client`-Lauf ueberschreibt. Ein fester
 * Dateiname waere trotzdem falsch: der Splitter benennt Teile nach ihrer ersten
 * Deklaration (`10-daten.js` hiess nie so, als der Name verdrahtet wurde), und
 * eine Umbenennung waere ein stiller Fehlschlag. Also sucht der Schreiber die
 * Datei, die SEINE Marke traegt — genau eine.
 *
 * @throws wenn kein Teil oder mehrere den Block nennen.
 */
export function findBlockFile(dir, name) {
  if (!existsSync(dir)) throw new Error('Quellteil-Ordner fehlt: ' + dir);
  const hits = readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .filter((file) => readFileSync(join(dir, file), 'utf8').includes('// >>> ' + name));
  if (hits.length === 0) throw new Error('Block "' + name + '" steht in keinem Quellteil unter ' + dir);
  if (hits.length > 1) throw new Error('Block "' + name + '" steht doppelt: ' + hits.join(', '));
  return join(dir, hits[0]);
}

/** Alle Blocknamen einer Datei, in der Reihenfolge des Auftretens. */
export function blockNames(text) {
  const names = [];
  const marker = '// >>> ';
  let at = text.indexOf(marker);
  while (at !== -1) {
    const lineEnd = text.indexOf(LF, at);
    const line = text.slice(at + marker.length, lineEnd === -1 ? text.length : lineEnd);
    // Der Name ist das erste Wort; alles danach ist die Quellenangabe.
    names.push(line.split(' ')[0]);
    at = text.indexOf(marker, lineEnd === -1 ? text.length : lineEnd);
  }
  return names;
}
