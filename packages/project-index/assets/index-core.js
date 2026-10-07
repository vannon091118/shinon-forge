/**
 * shinon-project-index — der Kern: Extraktion, Schema, inkrementeller Lauf, Worker.
 *
 * Diese Datei kennt KEINE Host-Abhaengigkeit, nur node:* Builtins. Genau deshalb
 * kann sie auch ein Worker laden (Plan §12): der Worker importiert diesen Kern
 * ueber seine Datei-URL, waehrend er an einem Bare-Import des Host-Pakets
 * scheitern wuerde. Die Host-Haelfte (Config + apply) steht in index.js.
 *
 * VERIFIZIERTE RUNTIME (gemessen, nicht aus einer Doku abgeleitet):
 *
 *   node:sqlite    laedt OHNE Flag (nur `ExperimentalWarning: SQLite is an
 *                  experimental feature`). Exporte: DatabaseSync, StatementSync,
 *                  constants, backup. Form: new DatabaseSync(path); db.exec(sql)
 *                  fuer DDL; db.prepare(sql) -> run() = { lastInsertRowid,
 *                  changes }, all() = Zeilenarray, get() = eine Zeile.
 *   FTS5           `create virtual table ... using fts5(path, body, tokenize =
 *                  'porter')` wird akzeptiert, `match` liefert Treffer, und
 *                  `delete from <fts> where path = ?` entfernt die Indexzeilen
 *                  wirklich (gemessen: 2 Treffer vor, 0 danach). SQLite 3.51.3.
 *   `references`   ist ein SQLite-Schluesselwort: `create table references(...)`
 *                  ist ein Syntaxfehler, `create table "references"(...)` geht.
 *                  Deshalb traegt die Tabelle aus Plan §9 exakt ihren Namen, aber
 *                  ueberall gequotet.
 *   Parser         ES GIBT KEINEN. Weder acorn, espree, meriyah, typescript,
 *                  @babel/parser noch esprima sind aufloesbar; im Harness liegt
 *                  unter @babel nur code-frame/helper/runtime, global nur
 *                  cline/corepack/npm. Deshalb eine eigene, BEWUSST BEGRENZTE
 *                  Extraktion (siehe extractSymbols).
 *   Worker         ein Worker, der index.js laedt, scheitert im Host an
 *                  `Cannot find package '@deepseek-ai/schemastery'` — deshalb
 *                  dieser Kern ohne Bare-Importe.
 *
 * PRIMAERDATEN (Plan §9): files, symbols, edges, references, touches, chunks,
 * dazu die FTS5-Spiegelung der Chunks. Keine Vector-First-Architektur.
 */

import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

/** Vertragsname des Index. */
export const CONTRACT = 'shinon.project-index/v1';

/** Fassung des Schemas; ein anderer Wert macht einen vorhandenen Index ungueltig. */
export const SCHEMA_VERSION = 1;

/** Wurzel aller Indizes — ausserhalb jedes Projekts. */
export const DEFAULT_INDEX_ROOT = join(homedir(), '.shinon', 'indexes');

/** Dateiname je Projekt. */
export const INDEX_FILE = 'index.sqlite';

/** Die Primaerdaten aus Plan §9, in der Reihenfolge des Plans. */
export const PRIMARY_TABLES = ['files', 'symbols', 'edges', 'references', 'touches', 'chunks'];

/** Die Volltextspiegelung der Chunks. */
export const FTS_TABLE = 'chunks_fts';

/** Verzeichnisse, die nie betreten werden: Fremdcode, Historie, Sitzungsdaten. */
export const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.cache', 'storages', 'coverage', '.turbo']);

/** Endungen, die als Text indexiert werden. */
export const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.yml', '.yaml'];

/** Sprache je Endung — Plan §10 nennt `language` als Feld der Indexdatei. */
export const LANGUAGES = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.json': 'json',
  '.md': 'markdown',
  '.yml': 'yaml',
  '.yaml': 'yaml',
};

/** Obergrenze der Symbolnamen, gegen die Referenzen geprueft werden (Regex-Groesse). */
export const MAX_REFERENCE_NAMES = 2000;

/**
 * Sprachschluesselwoerter, die kein Symbol sind.
 *
 * Der Grund ist gemessen: ohne diese Liste lieferte die Zeilenheuristik auf
 * diesem Repo `for` 126-mal und `if` 71-mal als „Methode" — `for` war damit der
 * haeufigste „Symbolname" des Projekts, und die Referenzsuche haette jede
 * Schleife als Referenz auf ein Symbol gezaehlt.
 */
export const RESERVED_WORDS = new Set([
  'if', 'for', 'while', 'do', 'switch', 'case', 'default', 'catch', 'try', 'finally',
  'return', 'throw', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'else', 'function', 'class', 'const', 'let', 'var', 'import', 'export', 'from', 'super',
  'this', 'with', 'void', 'static', 'get', 'set', 'async',
]);

/**
 * Muster der Symbolerkennung: zeilenbasiert, ohne Ausdrucksanalyse, und mit
 * `kind` als dem Grund, den der Index spaeter nennt.
 *
 * Zusage: diese Formen werden erkannt. KEINE Zusage: Vollstaendigkeit — es ist
 * kein AST, es werden keine Ausdruecke ausgewertet, und ein Symbol hinter einem
 * mehrzeiligen Blockkommentar wird uebersprungen.
 */
export const SYMBOL_PATTERNS = [
  { kind: 'function', pattern: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'class', pattern: /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'const', pattern: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: 'export', pattern: /^export\s*\{\s*([A-Za-z_$][\w$]*)/ },
  { kind: 'method', pattern: /^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/ },
];

/** Import- und Require-Formen, die als Kante gelten (Plan §9: `edges`). */
export const EDGE_PATTERNS = [
  { kind: 'import', pattern: /\bfrom\s+['"]([^'"]+)['"]/ },
  { kind: 'require', pattern: /\brequire\(\s*['"]([^'"]+)['"]\s*\)/ },
  { kind: 'dynamic-import', pattern: /\bimport\(\s*['"]([^'"]+)['"]\s*\)/ },
];

/**
 * Das Schema. `"references"` ist gequotet, weil REFERENCES ein SQLite-
 * Schluesselwort ist (gemessen: ungequotet ein Syntaxfehler). Alle Tabellen sind
 * idempotent, weil inkrementell in dieselbe Datei geschrieben wird.
 */
export const SCHEMA = [
  `create table if not exists files(path text primary key, language text not null, bytes integer not null, mtime_ms integer not null, digest text not null, indexed_at_ms integer not null)`,
  `create table if not exists symbols(path text not null, name text not null, kind text not null, line integer not null, primary key(path, name, kind, line))`,
  `create table if not exists edges(path text not null, kind text not null, target text not null, primary key(path, kind, target))`,
  `create table if not exists "references"(path text not null, name text not null, line integer not null, primary key(path, name, line))`,
  `create table if not exists touches(path text not null, target text not null, kind text not null, primary key(path, target, kind))`,
  `create table if not exists chunks(path text not null, start_line integer not null, end_line integer not null, body text not null, primary key(path, start_line))`,
  `create virtual table if not exists ${FTS_TABLE} using fts5(path, body, tokenize = 'porter')`,
];

/** Projektkennung: stabil ueber Laeufe, abhaengig vom aufgeloesten Pfad. */
export function projectHash(root) {
  return createHash('sha256').update(resolve(root)).digest('hex').slice(0, 16);
}

/** Der Indexpfad eines Projekts — immer ausserhalb des Projekts. */
export function indexPath(indexRoot, root) {
  return join(resolve(indexRoot), projectHash(root), INDEX_FILE);
}

/** Projektpfade werden relativ gespeichert: der Index ueberlebt einen Umzug. */
export function toProjectPath(root, absolute) {
  const path = relative(resolve(root), absolute);
  return sep === '/' ? path : path.split(sep).join('/');
}

/** Die Sprache einer Datei, oder null, wenn die Endung nicht indexiert wird. */
export function languageOf(file) {
  return LANGUAGES[extname(file).toLowerCase()] ?? null;
}

/**
 * Eine Datei als Text lesen. Ein Fehler ist kein Abbruch, sondern ein
 * Ausschluss: eine gesperrte oder zu grosse Datei laesst den Lauf weiterlaufen.
 */
function readText(file, maxBytes) {
  try {
    const info = statSync(file);
    if (!info.isFile() || info.size > maxBytes) return null;
    return { text: readFileSync(file, 'utf8'), bytes: info.size, mtimeMs: Math.round(info.mtimeMs) };
  } catch {
    return null;
  }
}

/** Alle indexierbaren Dateien unterhalb von `root`, in stabiler Reihenfolge. */
export function listFiles(root, extensions = SOURCE_EXTENSIONS) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!extensions.some((extension) => entry.name.endsWith(extension))) continue;
      found.push(join(dir, entry.name));
    }
  };
  walk(resolve(root));
  return found;
}

/**
 * Symbole einer Datei: eine Zeile liefert hoechstens ein Symbol, das erste
 * passende Muster gewinnt.
 *
 * Grenze, die nicht behauptet, sondern gebaut ist: Zeilen, die in einem
 * Blockkommentar stehen oder mit `//`, `/*` oder `*` beginnen, werden
 * uebersprungen; die Muster greifen nur am Zeilenanfang, ein Kommentar NACH
 * einem Ausdruck stoert also nicht. Ein Blockkommentar-Zustand wird ueber die
 * Zeilen mitgefuehrt, weil die Doc-Kommentare dieses Repos sonst als Code
 * gelesen wuerden.
 */
export function extractSymbols(text) {
  const symbols = [];
  let inBlockComment = false;
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      return;
    }
    for (const { kind, pattern } of SYMBOL_PATTERNS) {
      const match = pattern.exec(line);
      if (match === null) continue;
      // Ein Schluesselwort ist kein Symbol — sonst wird jede Schleife zum Symbol.
      if (RESERVED_WORDS.has(match[1])) return;
      symbols.push({ name: match[1], kind, line: index + 1 });
      return;
    }
  });
  return symbols;
}

/** Kanten einer Datei: Importe, Requires, dynamische Importe, je Ziel einmal. */
export function extractEdges(text) {
  const edges = [];
  const seen = new Set();
  text.split('\n').forEach((line) => {
    for (const { kind, pattern } of EDGE_PATTERNS) {
      const match = pattern.exec(line);
      if (match === null) continue;
      const key = `${kind}:${match[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ kind, target: match[1] });
    }
  });
  return edges;
}

/**
 * Referenzen: wo ein BEKANNTES Symbol auftaucht. Zweistufig — erst alle Symbole
 * sammeln, dann gegen deren Namen suchen. Alle Treffer einer Zeile zaehlen, nicht
 * nur der erste; die Definitionszeile zaehlt mit. Begrenzt durch
 * MAX_REFERENCE_NAMES, damit der Ausdruck endlich bleibt.
 */
export function findReferences(text, names) {
  const list = [...names].slice(0, MAX_REFERENCE_NAMES).filter((name) => !RESERVED_WORDS.has(name));
  if (list.length === 0) return [];
  const pattern = new RegExp(`\\b(${list.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  const found = [];
  text.split('\n').forEach((line, index) => {
    const seen = new Set();
    for (const match of line.matchAll(pattern)) {
      if (seen.has(match[1])) continue;
      seen.add(match[1]);
      found.push({ name: match[1], line: index + 1 });
    }
  });
  return found;
}

/** Text in Fenster schneiden — Grundlage der FTS5-Suche. */
export function chunkText(text, chunkLines) {
  const lines = text.split('\n');
  const chunks = [];
  for (let start = 0; start < lines.length; start += chunkLines) {
    const body = lines.slice(start, start + chunkLines).join('\n');
    if (body.trim() === '') continue;
    chunks.push({ startLine: start + 1, endLine: Math.min(lines.length, start + chunkLines), body });
  }
  return chunks;
}

/** Einen Metawert lesen, ohne zu werfen, wenn die Tabelle noch nicht steht. */
function metaValue(db, key) {
  try {
    return db.prepare('select value from meta where key = ?').get(key)?.value ?? null;
  } catch {
    return null;
  }
}

const setMeta = (db, key, value) => db.prepare('insert or replace into meta(key, value) values (?, ?)').run(key, value);

/**
 * Den Index oeffnen, das Schema anlegen und die Fassung festhalten.
 *
 * Ein vorhandener Index mit fremdem Vertrag oder fremder Schemafassung wird
 * verworfen und neu angelegt: ein stillschweigend weiterbenutzter Index mit
 * anderer Bedeutung waere schlimmer als ein Neuaufbau.
 */
export function openIndex(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal');
  db.exec('create table if not exists meta(key text primary key, value text not null)');

  const contract = metaValue(db, 'contract');
  const version = metaValue(db, 'schema_version');
  const incompatible = (contract !== null && contract !== CONTRACT) || (version !== null && version !== String(SCHEMA_VERSION));
  if (incompatible) {
    for (const table of [FTS_TABLE, ...PRIMARY_TABLES]) db.exec(`drop table if exists "${table}"`);
  }

  for (const statement of SCHEMA) db.exec(statement);
  setMeta(db, 'schema_version', String(SCHEMA_VERSION));
  setMeta(db, 'contract', CONTRACT);
  return db;
}

/** Die Kopffelder des Index — die kleinste Auskunft, die ein Leser braucht. */
export function indexMeta(db) {
  return {
    contract: metaValue(db, 'contract'),
    schema_version: metaValue(db, 'schema_version'),
    root: metaValue(db, 'root'),
    symbols_digest: metaValue(db, 'symbols_digest'),
    updated_at_ms: metaValue(db, 'updated_at_ms'),
  };
}

/** Eine Datei aus allen Tabellen entfernen, bevor sie neu geschrieben wird. */
function forgetFile(db, path) {
  for (const table of [FTS_TABLE, ...PRIMARY_TABLES]) {
    db.prepare(`delete from "${table}" where path = ?`).run(path);
  }
}

/**
 * Eine Datei vollstaendig indexieren: Dateizeile, Symbole, Kanten, Chunks und
 * die FTS-Spiegelung. Gibt die Kanten zurueck — der Aufrufer loest daraus die
 * Touches auf, weil dafuer die Kenntnis aller Dateien noetig ist.
 */
function indexFile(db, root, absolute, file, options) {
  const path = toProjectPath(root, absolute);
  const digest = createHash('sha256').update(file.text).digest('hex');
  forgetFile(db, path);

  db.prepare('insert or replace into files(path, language, bytes, mtime_ms, digest, indexed_at_ms) values (?, ?, ?, ?, ?, ?)')
    .run(path, languageOf(path) ?? 'text', file.bytes, file.mtimeMs, digest, Date.now());

  const insertSymbol = db.prepare('insert or ignore into symbols(path, name, kind, line) values (?, ?, ?, ?)');
  for (const symbol of extractSymbols(file.text)) insertSymbol.run(path, symbol.name, symbol.kind, symbol.line);

  const edges = extractEdges(file.text);
  const insertEdge = db.prepare('insert or ignore into edges(path, kind, target) values (?, ?, ?)');
  for (const edge of edges) insertEdge.run(path, edge.kind, edge.target);

  const insertChunk = db.prepare('insert or ignore into chunks(path, start_line, end_line, body) values (?, ?, ?, ?)');
  const insertFts = db.prepare(`insert into "${FTS_TABLE}"(path, body) values (?, ?)`);
  for (const chunk of chunkText(file.text, options.chunkLines)) {
    insertChunk.run(path, chunk.startLine, chunk.endLine, chunk.body);
    insertFts.run(path, chunk.body);
  }

  return { path, absolute, edges };
}

/**
 * Interne Kanten aufloesen: aus `./x.js` wird ein Touch auf die Datei, die es
 * im Projekt wirklich gibt. Nur aufloesbare Ziele werden eingetragen — ein
 * unaufloesbares Ziel waere eine Behauptung ueber eine Datei, die es nicht gibt.
 */
function resolveTouches(root, entry, known) {
  const touches = [];
  for (const edge of entry.edges) {
    if (!edge.target.startsWith('.')) continue;
    const base = dirname(entry.absolute);
    for (const candidate of [`${edge.target}.js`, `${edge.target}.mjs`, edge.target, join(edge.target, 'index.js')]) {
      const target = toProjectPath(root, resolve(base, candidate));
      if (!known.has(target) || target === entry.path) continue;
      touches.push({ path: entry.path, target, kind: edge.kind });
      break;
    }
  }
  return touches;
}

/**
 * Einen Indexlauf fahren — inkrementell nach Plan §11:
 *
 *   stat -> mtime+size gleich?  ja: nicht einmal lesen (unchanged)
 *        -> sonst lesen und sha256 vergleichen
 *             gleicher Hash: nur die Dateizeile auffrischen (rehashed)
 *             neuer Hash:    neu parsen und die Primaerdaten ersetzen (written)
 *
 * Der Lauf wirft nicht wegen einer einzelnen Datei; er gibt einen Bericht
 * zurueck. Der Referenzdurchgang laeuft nur, wenn sich die Symbolmenge
 * geaendert hat (sonst nur fuer die neu geschriebenen Dateien), und die
 * Touch-Aufloesung raeumt Ziele weg, die es nicht mehr gibt.
 */
export function updateIndex(db, root, options = {}) {
  const chunkLines = options.chunkLines ?? 40;
  const maxFileBytes = options.maxFileBytes ?? 262144;
  const files = listFiles(root, options.extensions ?? SOURCE_EXTENSIONS);
  const report = {
    root: resolve(root),
    files: files.length,
    written: 0,
    rehashed: 0,
    unchanged: 0,
    skipped: 0,
    removed: 0,
    references: 0,
    touches: 0,
    symbolsChanged: false,
  };

  const previous = new Map(db.prepare('select path, bytes, mtime_ms, digest from files').all().map((row) => [row.path, row]));

  db.exec('begin');
  try {
    const written = [];
    const seen = new Set();
    for (const absolute of files) {
      const path = toProjectPath(root, absolute);
      seen.add(path);
      let info;
      try {
        info = statSync(absolute);
      } catch {
        report.skipped += 1;
        continue;
      }
      const before = previous.get(path);
      if (before !== undefined && before.bytes === info.size && before.mtime_ms === Math.round(info.mtimeMs)) {
        report.unchanged += 1;
        continue;
      }
      const file = readText(absolute, maxFileBytes);
      if (file === null) {
        // Eine uebersprungene Datei darf keine alten Zeilen stehen lassen.
        if (before !== undefined) forgetFile(db, path);
        report.skipped += 1;
        continue;
      }
      const digest = createHash('sha256').update(file.text).digest('hex');
      if (before !== undefined && before.digest === digest) {
        db.prepare('update files set language = ?, bytes = ?, mtime_ms = ?, indexed_at_ms = ? where path = ?')
          .run(languageOf(path) ?? 'text', file.bytes, file.mtimeMs, Date.now(), path);
        report.rehashed += 1;
        continue;
      }
      written.push(indexFile(db, root, absolute, file, { chunkLines }));
      report.written += 1;
    }

    for (const path of previous.keys()) {
      if (seen.has(path)) continue;
      forgetFile(db, path);
      report.removed += 1;
    }

    // Referenzen: die Symbolmenge entscheidet, ob ALLE Dateien neu geprueft werden.
    const names = db.prepare('select distinct name from symbols order by name').all().map((row) => row.name);
    const digest = createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 16);
    report.symbolsChanged = metaValue(db, 'symbols_digest') !== digest;
    const rescanned = report.symbolsChanged ? db.prepare('select path from files order by path').all().map((row) => row.path) : written.map((entry) => entry.path);
    for (const path of rescanned) {
      db.prepare('delete from "references" where path = ?').run(path);
      const file = readText(resolve(root, path), maxFileBytes);
      if (file === null) continue;
      const insert = db.prepare('insert or ignore into "references"(path, name, line) values (?, ?, ?)');
      for (const reference of findReferences(file.text, names)) {
        report.references += insert.run(path, reference.name, reference.line).changes;
      }
    }

    const insertTouch = db.prepare('insert or ignore into touches(path, target, kind) values (?, ?, ?)');
    for (const entry of written) {
      for (const touch of resolveTouches(root, entry, seen)) {
        report.touches += insertTouch.run(touch.path, touch.target, touch.kind).changes;
      }
    }
    // Touches auf Dateien, die es nicht mehr gibt, sind keine Touches.
    db.prepare('delete from touches where target not in (select path from files)').run();

    setMeta(db, 'symbols_digest', digest);
    setMeta(db, 'root', resolve(root));
    setMeta(db, 'updated_at_ms', String(Date.now()));
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }

  return report;
}

/** Zaehlung je Tabelle — die kleinste ehrliche Auskunft ueber den Index. */
export function indexStats(db) {
  const count = (table) => db.prepare(`select count(*) as n from "${table}"`).get().n;
  const stats = {};
  for (const table of PRIMARY_TABLES) stats[table] = count(table);
  stats[FTS_TABLE] = count(FTS_TABLE);
  return stats;
}

/**
 * Einen vollstaendigen Lauf in EINEM Aufruf: oeffnen, fortschreiben, schliessen.
 * Der Index wird als Datei uebergeben, nicht als offene Verbindung — damit kann
 * derselbe Lauf im Host oder in einem Worker stehen.
 */
export function runIndex(options) {
  const root = resolve(options.root);
  const indexRoot = resolve(options.indexRoot ?? DEFAULT_INDEX_ROOT);
  const db = openIndex(indexPath(indexRoot, root));
  try {
    return updateIndex(db, root, { maxFileBytes: options.maxFileBytes, chunkLines: options.chunkLines });
  } finally {
    db.close();
  }
}

/**
 * Der Worker-Quelltext.
 *
 * Er wird mit `eval: true` uebergeben, statt als eigene Datei: der Bundle-Vertrag
 * dieses Repos ist genau vier Dateien je Paket. Der Worker laedt dieses Modul
 * ueber seine URL und ruft denselben `runIndex` — es gibt also keinen zweiten
 * Codepfad, der auseinanderdriften koennte, nur einen zweiten Ort fuer denselben.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
import(workerData.module).then(
  (mod) => {
    try {
      parentPort.postMessage({ ok: true, report: mod.runIndex(workerData.options) });
    } catch (error) {
      parentPort.postMessage({ ok: false, error: String(error && error.message ? error.message : error) });
    }
  },
  (error) => parentPort.postMessage({ ok: false, error: String(error && error.message ? error.message : error) }),
);
`;

/**
 * Den Lauf in einen Worker legen (Plan §12: der Index-Build darf den kritischen
 * Agent-Eventloop nicht blockieren). Gibt IMMER ein Ergebnis zurueck, nie eine
 * Ausnahme: ein nicht startbarer oder sterbender Worker ist ein Befund, den der
 * Aufrufer protokolliert und mit dem Lauf im Host beantwortet.
 */
export function runIndexInWorker(options) {
  return new Promise((resolvePromise) => {
    let worker;
    try {
      worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { module: import.meta.url, options } });
    } catch (error) {
      resolvePromise({ ok: false, error: String(error?.message ?? error) });
      return;
    }
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    };
    worker.on('message', (message) => {
      settle(message?.ok === true ? { ok: true, report: message.report } : { ok: false, error: message?.error ?? 'unbekannter Workerfehler' });
      worker.terminate();
    });
    worker.on('error', (error) => settle({ ok: false, error: String(error?.message ?? error) }));
    worker.on('exit', (code) => settle({ ok: false, error: `Worker endete ohne Bericht (Code ${code})` }));
  });
}

/**
 * Die FTS5-Suche: Pfade mit Trefferzahl, absteigend. Ein Suchausdruck, den FTS5
 * nicht annimmt (etwa ein alleinstehendes `AND`), liefert eine leere Liste statt
 * eines Abbruchs — ein unbrauchbarer Suchausdruck darf keinen Agentenschritt
 * brechen.
 */
export function searchChunks(db, query, limit = 10) {
  try {
    return db.prepare(`select path, count(*) as hits from "${FTS_TABLE}" where "${FTS_TABLE}" match ? group by path order by hits desc, path asc limit ?`)
      .all(query, limit);
  } catch {
    return [];
  }
}
