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
 *
 * SECRET PROTECTION (Plan §13) — zwei Schichten, beide VOR jedem Insert:
 *
 *   1. Pfad   Dateien, die Zugangsdaten SIND, werden nicht einmal geoeffnet: kein
 *             stat, kein Lesen, kein digest, keine Zeile. Hatten sie aus einer
 *             frueheren Fassung Zeilen, werden die entfernt (Remediation).
 *   2. Inhalt Ist ein eingegebener Wert schon ausgeschrieben, wird er ersetzt,
 *             bevor Text in die Datenbank geht — Symbole, Kanten, Referenzen,
 *             Chunks und FTS sehen nur den redigierten Text. Die Fundstelle
 *             (Pfad, Zeile, Art) wird festgehalten, der WERT NICHT.
 *
 * Gemessen vor dem Bau (docs/probes/secret-protection.json): die Musterliste aus
 * Plan §13 trifft die entscheidende Datei dieses Repos nicht — `credentials*`
 * scheitert an `.credentials.yaml`, weil dem Namen ein Punkt vorangeht. Beide
 * Schichten bauen deshalb auf ganzen Namen bzw. auf dem Inhalt, nicht auf Praefixen.
 *
 * GRENZE, die nicht verschwiegen wird: das ist ein Detektor mit benannten Mustern,
 * kein Beweis. Kodierte, geteilte oder unbekannte Formen werden nicht erkannt.
 * Die WIRKSAME Schutzmassnahme ist Schicht 1 plus eine Positivliste; Schicht 2
 * faengt den Rest der bekannten Muster.
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

/**
 * Fassung der EXTRAKTION — der Grund, warum es diesen Marker gibt:
 *
 * Der Lauf ist inkrementell (Plan §11). Eine unveraenderte Datei wird deshalb
 * NICHT neu geparst. Wird die Extraktion geaendert (hier: Sprachregistry mit
 * Ueberschriften, Abhaengigkeitskanten und Prosa-Ausschluss), dann bleiben die
 * Zeilen der unveraenderten Dateien auf dem alten Stand — gemessen im Live-Boot:
 * nach dem Parserwechsel standen 643 Symbole im Index statt der gemessenen rund
 * 1030, weil nur 12 Dateien neu geschrieben wurden. Ein Index, der seine eigene
 * Herkunft nicht kennt, ist damit still falsch. Also traegt er sie: eine andere
 * Fassung verwirft den Index und baut ihn neu auf.
 *
 * Erhoehen heisst: die Bedeutung des Inhalts hat sich geaendert, auch wenn die
 * Tabellen gleich geblieben sind.
 */
export const INDEXER_VERSION = 5;

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

/**
 * Endungen, die PROGRAMM heissen (Daten- und Textendungen ausgenommen).
 *
 * Abgeleitet statt danebengestellt: eine neue Codeendung wird oben
 * eingetragen und gilt hier mit. Die Menge traegt eine Entscheidung aus §13 —
 * `credentials-prod.yaml` traegt Werte, `credential-helper.mjs` VERWALTET sie,
 * und nur das zweite gehoert in den Index.
 */
export const CODE_EXTENSIONS = SOURCE_EXTENSIONS.filter((extension) => !['.json', '.md', '.yml', '.yaml'].includes(extension));

/** Eine Datei, die ein Programm ist. */
const istProgramm = new RegExp(`\\.(${CODE_EXTENSIONS.map((extension) => extension.slice(1)).join('|')})$`, 'i');

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
 * Die Tabelle der Fundstellen. Sie traegt Pfad, Zeile und ART — nie den Wert.
 *
 * Sie ist bewusst KEIN Primaerdatum aus Plan §9: die sechs Tabellen dort sind
 * der Vertrag, den Leser kennen. Diese kam mit Phase 8 dazu und ist der Beleg,
 * dass die Redaktion wirklich gegriffen hat, ohne den Wert zu wiederholen.
 */
export const SECRET_TABLE = 'secret_findings';

/**
 * Schicht 1 — Dateien, die Zugangsdaten SIND. Sie werden nie gelesen.
 *
 * Warum nicht einfach `credentials*` und `secrets*` aus Plan §13: gemessen haben
 * Praefixmuster zwei Luecken. (a) `.credentials.yaml` liegt in der Wurzel dieses
 * Repos und traegt drei echte Schluessel — `credentials*` trifft sie NICHT, weil
 * ein Punkt vorangeht. (b) Ein Praefixmuster trifft auch Quelldateien, die
 * Zugangsdaten nur VERWALTEN; die gehoeren in den Index, sonst kann der Agent die
 * Stelle nicht finden, die einen Schluessel benutzt.
 *
 * Deshalb: ganze Namen statt Praefixe. Ein Name zaehlt als Zugangsdatentraeger,
 * wenn er genau `credentials`/`secrets` heisst (mit optionalem fuehrenden Punkt
 * und optional EINER Endung) oder wenn er eine Schluesselendung traegt. Damit
 * faellt `secrets.mjs` unter den Schutz — Plan §13 nennt `secrets*`, und eine
 * Datei mit diesem Namen ist ebenso wahrscheinlich ein Buendel ausgeschriebener
 * Werte wie ein Modul, das sie verwaltet. `credentials-handling.mjs` dagegen
 * bleibt indexiert: die Regel trifft Namen, nicht Praefixe, und eine Quelldatei
 * mit sprechendem Namen gehoert auffindbar. Ihr Inhalt wird von Schicht 2 geprueft.
 */
export const PROTECTED_PATH_RULES = [
  // §13 nennt `.env*` woertlich. `.envrc` (direnv) exportiert regelmaessig
  // Werte und fiel durch das alte Muster, weil dort auf `.env` nur eine
  // ENDUNG folgen durfte.
  { kind: 'dotenv', pattern: /(^|\/)\.env([\w.-]*)$/i },
  { kind: 'dotenv-variante', pattern: /(^|\/)[\w.-]*\.env\.(local|development|production|test|ci|staging)$/i },
  // Ganze Namen ohne Zusatz: `credentials`, `.credentials`, `secrets.mjs`.
  { kind: 'credential-datei', pattern: /(^|\/)\.?credentials?(\.[\w-]+)*$/i },
  { kind: 'credential-datei', pattern: /(^|\/)\.?credentials?[\w-]+([\w.-]*)$/i, unless: istProgramm },
  { kind: 'secret-datei', pattern: /(^|\/)\.?secrets?(\.[\w-]+)*$/i },
  { kind: 'secret-datei', pattern: /(^|\/)\.?secrets?[\w-]+([\w.-]*)$/i, unless: istProgramm },
  { kind: 'schluesselmaterial', pattern: /\.(pem|key|p12|pfx|jks|keystore|ppk|asc)$/i },
  { kind: 'ssh-schluessel', pattern: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/i },
  { kind: 'dotfile-geheim', pattern: /(^|\/)\.(netrc|npmrc|git-credentials|htpasswd|pgpass)$/i },
  { kind: 'cloud-konfiguration', pattern: /(^|\/)\.(aws|kube|ssh|gnupg)\//i },
  { kind: 'terraform-zustand', pattern: /\.tfstate(\.backup)?$/i },
];

// BEWUSST NICHT aufgenommen, weil nicht belegbar und mit Nebenwirkung:
// `environment.js`/`config.js` als ganze Datei. Solche Namen sind in vielen
// Projekten gewoehnlicher Quelltext; sie auszuschliessen wuerde den Index still
// verkleinern, statt Zugangsdaten zu schuetzen. Ein Wert darin wird von Schicht 2
// ersetzt, und das ist die Stelle, an der die Zusage haengt.

/**
 * Der Grund, aus dem ein Pfad geschuetzt ist — oder null, wenn er indexiert wird.
 * Gibt den GRUND zurueck, nicht nur ein Ja/Nein: der Bericht und die Tests nennen
 * damit, welche Regel gegriffen hat.
 */
export function protectedReason(path) {
  const normalized = sep === '/' ? path : path.split(sep).join('/');
  for (const { kind, pattern, unless } of PROTECTED_PATH_RULES) {
    // `unless` ist die Gegenprobe einer Regel, nicht ein Sonderfall im Code:
    // ein Praefixname, der ein Programm ist, wird indexiert.
    if (unless !== undefined && unless.test(normalized)) continue;
    if (pattern.test(normalized)) return kind;
  }
  return null;
}

/**
 * Schicht 2 — typische Secret-MUSTER im Inhalt (Plan §13: der Schutz darf nicht
 * nur auf Dateinamen beruhen).
 *
 * Gemessen vor dem Bau gegen 167 Dateien dieses Repos: 0 Fehlalarme ausserhalb
 * der echten Datei. Zwei Entwurfsentscheidungen stammen aus dieser Messung:
 *
 *   - KEIN Lookbehind auf Bezeichnerzeichen. Die Fassung mit `(?<![A-Za-z0-9_])`
 *     lieferte 0 Treffer, weil in `SHINON_API_KEY` vor `API_KEY` ein Unterstrich
 *     steht — sie waere blind genau fuer die haeufigste Schreibweise.
 *   - `valueGroup` haelt den NAMEN und ersetzt nur den Wert. Der Name ist kein
 *     Geheimnis; ihn zu entfernen wuerde den Fund unbrauchbar machen.
 */
export const SECRET_PATTERNS = [
  { kind: 'private-key', pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----/g },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'openrouter-key', pattern: /\bsk-or-v1-[A-Za-z0-9]{20,}/g },
  { kind: 'openai-key', pattern: /\bsk-(?!ant-|or-v1-)[A-Za-z0-9]{20,}/g },
  { kind: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g },
  { kind: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'aws-access-key-id', pattern: /\b(?:A3T[A-Z0-9]|AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g },
  { kind: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}/g },
  { kind: 'connection-string', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s:@/]+:[^\s@/]+@/g },
  { kind: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9_\-.]{24,}/g },
  {
    kind: 'zugewiesener-wert',
    valueGroup: 1,
    pattern: /(?:^|[\s,{[(])(?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|SECRET[_-]?KEY|[_-]TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY)|api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|token|secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-/+.]{16,})/gi,
  },
  {
    kind: 'zugewiesene-base64',
    valueGroup: 2,
    pattern: /(?:^|[\s,{[(])(?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)|key|token|secret|password)\s*[:=]\s*(['"])([A-Za-z0-9+/]{40,}={0,2})\1/gi,
  },
  {
    // Cloud-Zugangsdaten (Plan §13). Gemessen fehlten beide realistischen
    // Formen: `aws_secret_access_key = …` und `AccountKey=…` in einer
    // Azure-Verbindungszeichenfolge — dort traegt der NAME die Aussage, der
    // Wert ist lang und unquoted. Deshalb ist die Liste der Namen absichtlich
    // eng: ein blankes `KEY = <lang>` waere zu breit fuer Quelltext.
    kind: 'cloud-schluessel',
    valueGroup: 1,
    pattern: /(?:^|[\s,;{[(])(?:[A-Za-z0-9_]*_)?(?:SECRET[_-]?ACCESS[_-]?KEY|ACCESS[_-]?KEY|ACCOUNT[_-]?KEY|STORAGE[_-]?KEY|SAS[_-]?TOKEN)\s*[:=]\s*['"]?([A-Za-z0-9+/=_.\-]{20,})/gi,
  },
];

/** Wie oft ein Zeichen bis zu einer Position vorkommt — fuer die Zeilennummer. */
function countLines(text, end) {
  let line = 1;
  for (let i = 0; i < end; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/**
 * Alle Treffer der Muster in einem Text: Art, Zeile, Position und der zu
 * ersetzende Ausschnitt. Ein Treffer ist keine Datei und keine Zeile, sondern
 * eine Stelle — der Aufrufer ersetzt sie und merkt sich nur ihre Art.
 */
export function findSecrets(text) {
  const found = [];
  for (const { kind, pattern, valueGroup } of SECRET_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const value = valueGroup === undefined ? match[0] : match[valueGroup];
      const valueStart = match.index + match[0].indexOf(value);
      found.push({ kind, line: countLines(text, match.index), start: valueStart, end: valueStart + value.length });
    }
  }
  // Ueberlappende Treffer: der erste gewinnt, damit die Ersetzung eindeutig ist.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const picked = [];
  for (const hit of found) {
    if (picked.length > 0 && hit.start < picked[picked.length - 1].end) continue;
    picked.push(hit);
  }
  return picked;
}

/**
 * Text redigieren: jeder Treffer wird durch `[REDACTED:<art>]` ersetzt. Der
 * zurueckgegebene Text ist der EINZIGE Text, der in die Datenbank geht.
 */
export function redactSecrets(text) {
  const hits = findSecrets(text);
  if (hits.length === 0) return { text, findings: [] };
  let out = '';
  let cursor = 0;
  for (const hit of hits) {
    out += text.slice(cursor, hit.start) + `[REDACTED:${hit.kind}]`;
    cursor = hit.end;
  }
  out += text.slice(cursor);
  return { text: out, findings: hits.map((hit) => ({ kind: hit.kind, line: hit.line })) };
}

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
  `create table if not exists files(path text primary key, language text not null, bytes integer not null, mtime_ms integer not null, digest text not null, indexed_at_ms integer not null, stamp text)`,
  `create table if not exists symbols(path text not null, name text not null, kind text not null, line integer not null, primary key(path, name, kind, line))`,
  `create table if not exists edges(path text not null, kind text not null, target text not null, primary key(path, kind, target))`,
  `create table if not exists "references"(path text not null, name text not null, line integer not null, primary key(path, name, line))`,
  `create table if not exists touches(path text not null, target text not null, kind text not null, primary key(path, target, kind))`,
  `create table if not exists chunks(path text not null, start_line integer not null, end_line integer not null, body text not null, primary key(path, start_line))`,
  `create virtual table if not exists ${FTS_TABLE} using fts5(path, body, tokenize = 'porter')`,
  `create table if not exists ${SECRET_TABLE}(path text not null, line integer not null, kind text not null, primary key(path, line, kind))`,
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
 * Der Stempel eines Inodes: Geraet, Inode, Groesse, mtime (Millisekunden) und
 * ctime (Nanosekunden) — eine Zeile, die man lesen kann.
 *
 * WOZU: Groesse und mtime sind eine Behauptung des Schreibers. Beide kann ein
 * Werkzeug nach einer Aenderung WIEDERHERSTELLEN; deshalb bleibt die Luecke aus
 * §11 (gleiche Groesse, zurueckgesetzte mtime) fuer den klassischen Vergleich
 * unsichtbar. Die ctime kann das nicht: sie ist die Zeit der letzten Aenderung
 * des INODES, jeder Schreibvorgang bewegt sie, und es gibt keinen Aufruf, der
 * sie setzt. Der Inode selbst deckt die zweite Form derselben Luecke: eine
 * ERSETZTE Datei hat eine neue Identitaet, auch bei gleicher Groesse und mtime.
 *
 * GEMESSEN auf diesem Rechner (ext4), nicht angenommen: writeFileSync mit
 * gleich langem Inhalt + utimesSync auf die alte mtime laesst Groesse und mtime
 * auf Millisekunden gleich und bewegt die ctime; ein chmod bewegt die ctime
 * OHNE Inhaltsaenderung (das ist der Fehlalarm, der im Bericht gezaehlt wird).
 *
 * UND EHRLICH ZUR ROLLE DES INODES: in den Proben dieses Repos traegt die ctime
 * die Erkennung — eine ersetzte Datei wird auch ohne die Inode-Nummer erkannt
 * (Mutationsprobe: Inode entfernt, das Ersetzungs-Szenario bleibt gruen, rot
 * werden nur die Format-Zusagen). Der Inode ist deshalb REDUNDANZ, kein eigener
 * Nachweis: er deckt Dateisysteme ab, deren ctime grob ist (Sekundengranularitaet
 * oder aus mtime abgeleitet), und genau dort ist er die zweite Chance.
 *
 * GRENZEN, benannt: (1) Das ist eine Eigenschaft des DATEISYSTEMS, keine Zusage.
 * Ein Dateisystem ohne brauchbare ctime — grob oder aus mtime abgeleitet — macht
 * dieses Signal schwaecher; `verify: 'all'` bleibt die Antwort, die nichts
 * annimmt. Faellt der Stempel ganz aus (null), wird gelesen, nie vertraut.
 * (2) Ein Stempel ist kein Inhaltsnachweis: er sagt "dieselbe Datei, seit dem
 * letzten Lauf nicht angefasst", nicht "derselbe Inhalt".
 */
export function inodeStamp(absolute, mtimeMs = null) {
  try {
    const info = statSync(absolute, { bigint: true });
    // Die mtime kommt GERUNDET von aussen herein (die Zahl, die auch in
    // mtime_ms steht) und wird nicht hier noch einmal gelesen. GEMESSEN und
    // deshalb so: der bigint-Wert ist ABGESCHNITTEN, der gespeicherte gerundet —
    // bei einem Sekundenbruchteil ueber 0,5 ms unterscheiden sich beide um 1 ms,
    // und dann meldete der Stempel "geaendert", wo das klassische Signal
    // "unveraendert" sagt. Ein Signal, das sich selbst widerspricht, ist kein
    // Signal. Was hier zusaetzlich dazukommt, ist die ctime (Nanosekunden: ein
    // Zaehler fuer Aenderungen, feiner ist besser) und die Identitaet des Inodes.
    const ms = mtimeMs ?? Math.round(Number(info.mtimeNs) / 1e6);
    return `${info.dev}:${info.ino}:${info.size}:${ms}:${info.ctimeNs}`;
  } catch {
    return null;
  }
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
 * Symbole im Code (JavaScript/TypeScript): eine Zeile liefert hoechstens ein
 * Symbol, das erste passende Muster gewinnt.
 *
 * Grenze, die nicht behauptet, sondern gebaut ist: Zeilen, die in einem
 * Blockkommentar stehen oder mit `//`, `/*` oder `*` beginnen, werden
 * uebersprungen; die Muster greifen nur am Zeilenanfang, ein Kommentar NACH
 * einem Ausdruck stoert also nicht. Ein Blockkommentar-Zustand wird ueber die
 * Zeilen mitgefuehrt, weil die Doc-Kommentare dieses Repos sonst als Code
 * gelesen wuerden.
 */
function codeSymbols(text) {
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

/** Kanten im Code: Importe, Requires, dynamische Importe, je Ziel einmal. */
function codeEdges(text) {
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

/** Eine Markdown-Ueberschrift: `## Titel`, abschliessende `#` erlaubt. */
export const MARKDOWN_HEADING = /^#{1,6}\s+(.+?)\s*#*$/;

/**
 * Ueberschriften in Markdown — best effort und FENCE-BEWUSST.
 *
 * Warum fence-bewusst: gemessen stehen in diesem Repo 16 der 391 Ueberschriften
 * innerhalb von Code-Fences. Sie mitzuzaehlen wuerde ein Beispiel im Dokument zur
 * Struktur des Dokuments machen. Eine Ueberschrift ist eine definierte Form, kein
 * Heuristikprodukt — deshalb ist sie hier ein Symbol (kind `heading`).
 */
function markdownSymbols(text) {
  const symbols = [];
  let fence = false;
  text.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const match = MARKDOWN_HEADING.exec(line);
    if (match === null) return;
    symbols.push({ name: match[1], kind: 'heading', line: index + 1 });
  });
  return symbols;
}

/** Felder, die in einer Manifest-Datei Abhaengigkeiten benennen. */
export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

/**
 * Kanten aus JSON — mit dem EINEN Parser, der in dieser Runtime verfuegbar ist:
 * `JSON.parse` ist eingebaut und immer da (gemessen: 42 von 42 JSON-Dateien
 * dieses Repos parsen fehlerfrei). Eine Datei, die nicht parst, liefert keine
 * Kanten statt eines Abbruchs — best effort heisst auch, dass ein Fehlschlag
 * nicht den ganzen Lauf bricht.
 */
function jsonEdges(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) return [];
  const edges = [];
  // Der EIGENE Name des Manifests, als Kante der Art `name`. Ohne ihn kann §14
  // Rang 3 einen genannten Paketnamen nicht auf das Paket abbilden: der Index
  // wuesste nur, WER das Paket benutzt.
  if (typeof document.name === 'string' && document.name !== '') edges.push({ kind: 'name', target: document.name });
  for (const field of DEPENDENCY_FIELDS) {
    const block = document[field];
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
    for (const name of Object.keys(block).sort()) edges.push({ kind: 'dependency', target: name });
  }
  return edges;
}

/** Der Extraktor ohne Parser: die Datei ist Text, sie hat keine Symbole oder Kanten. */
const textOnly = { parser: 'keiner (nur Text)', symbols: () => [], edges: () => [] };

/**
 * Die Parser-Registry: Sprache -> verfuegbarer Parser -> Symbole / Kanten.
 *
 * `parser` benennt, WELCHER Parser traegt. Die Zuordnung ist gemessen
 * (docs/probes/project-index-parserstrategie.json), nicht behauptet:
 *
 *   javascript/jsx/typescript/tsx  KEIN Parser. acorn, espree, meriyah,
 *       typescript, @babel/parser und esprima sind weder im Repo noch in der
 *       DSH-Installation aufloesbar. Also zeilenbasiert, best effort.
 *   json  `JSON.parse` — eingebaut, immer verfuegbar; traegt die Kanten.
 *   markdown  KEIN Parser (marked, gray-matter nicht aufloesbar); Ueberschriften
 *       sind die best-effort-Struktur.
 *   yaml  KEIN Parser, der aus DIESEM Paket erreichbar waere. `yaml`/`js-yaml`
 *       liegen in der DSH-Installation als internes Beiwerk einer Fassung; sie
 *       zu benutzen bindet das Paket an eine nicht deklarierte Abhaengigkeit und
 *       schliesst den Worker aus. Also Text, ohne Symbolbegriff.
 *
 * Diese Registry ist die Erweiterungsstelle fuer spaetere AST-Parser: ein echter
 * Parser wird hier eingetragen, der Lauf bleibt unveraendert. Heute traegt sie
 * keine AST-Zusage.
 */
const codeParser = { parser: 'zeilenbasiert (kein Parser aufloesbar)', symbols: codeSymbols, edges: codeEdges };
export const PARSERS = {
  javascript: codeParser,
  jsx: codeParser,
  typescript: codeParser,
  tsx: codeParser,
  json: { parser: 'JSON.parse', symbols: () => [], edges: jsonEdges },
  markdown: { parser: 'zeilenbasiert, Ueberschriften (kein Parser aufloesbar)', symbols: markdownSymbols, edges: () => [] },
  yaml: textOnly,
  text: textOnly,
};

/** Der Extraktor einer Sprache. Unbekannte Sprachen sind Text — ohne Zusage. */
export function parserFor(language) {
  return PARSERS[language] ?? textOnly;
}

/** Symbole einer Datei in ihrer Sprache (Standard: Code). */
export function extractSymbols(text, language = 'javascript') {
  return parserFor(language).symbols(text);
}

/** Kanten einer Datei in ihrer Sprache (Standard: Code). */
export function extractEdges(text, language = 'javascript') {
  return parserFor(language).edges(text);
}

/**
 * Symbolarten, die als Referenzziele zaehlen.
 *
 * Prosa (Ueberschriften) und Textdateien zaehlen NICHT: der Name 'Notizen' aus
 * einer Markdown-Ueberschrift wuerde sonst in jedem Satz, der das Wort benutzt,
 * als Referenz auf ein Symbol gezaehlt. Ein Referenzziel ist ein Bezeichner, der
 * im Code wieder auftauchen kann.
 */
export const REFERENCABLE_KINDS = new Set(['function', 'class', 'const', 'export', 'method']);

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
  // GEMESSEN und deshalb hier: ein `delete` loescht Zeilen, nicht BYTES. Nach dem
  // Entfernen eines Werts stand er im Test weiterhin in den freigegebenen Seiten
  // der Datei. `secure_delete` ueberschreibt den freigegebenen Zellinhalt mit
  // Nullen, und der Wiederaufbau unten zieht zusaetzlich die ganze Datei neu
  // zusammen. Ein Schutz, der nur Zeilen entfernt, laesst den Wert im Index.
  db.exec('pragma secure_delete = on');
  db.exec('create table if not exists meta(key text primary key, value text not null)');

  const stored = {
    contract: metaValue(db, 'contract'),
    schema_version: metaValue(db, 'schema_version'),
    indexer_version: metaValue(db, 'indexer_version'),
  };
  // Ein LEERER Index ist kein fremder Index: geprueft wird nur, was schon gebaut war.
  const built = stored.contract !== null || stored.schema_version !== null;
  const incompatible =
    built &&
    (stored.contract !== CONTRACT ||
      stored.schema_version !== String(SCHEMA_VERSION) ||
      stored.indexer_version !== String(INDEXER_VERSION));
  const rebuilt = incompatible;
  if (incompatible) {
    for (const table of [FTS_TABLE, SECRET_TABLE, ...PRIMARY_TABLES]) db.exec(`drop table if exists "${table}"`);
  }

  for (const statement of SCHEMA) db.exec(statement);
  // Eine Datei, die gerade Tabellen verloren hat, traegt deren Bytes noch. Der
  // Index ist abgeleitete Kopie — ein Neuzusammenzug kostet hier nur Zeit.
  if (rebuilt) db.exec('vacuum');
  setMeta(db, 'schema_version', String(SCHEMA_VERSION));
  setMeta(db, 'indexer_version', String(INDEXER_VERSION));
  setMeta(db, 'contract', CONTRACT);
  return db;
}

/** Die Kopffelder des Index — die kleinste Auskunft, die ein Leser braucht. */
export function indexMeta(db) {
  return {
    contract: metaValue(db, 'contract'),
    schema_version: metaValue(db, 'schema_version'),
    indexer_version: metaValue(db, 'indexer_version'),
    root: metaValue(db, 'root'),
    symbols_digest: metaValue(db, 'symbols_digest'),
    updated_at_ms: metaValue(db, 'updated_at_ms'),
  };
}

/**
 * Eine Datei aus allen Tabellen entfernen, bevor sie neu geschrieben wird —
 * und ebenso, wenn sie geschuetzt ist oder verschwindet. Die Fundstellen gehen
 * mit: bleibt eine Datei geschuetzt, darf ihr Befund nicht stehen bleiben, sonst
 * waere er ein Hinweis ohne Gegenstand.
 */
function forgetFile(db, path) {
  for (const table of [FTS_TABLE, SECRET_TABLE, ...PRIMARY_TABLES]) {
    db.prepare(`delete from "${table}" where path = ?`).run(path);
  }
}

/**
 * Eine Datei vollstaendig indexieren: Dateizeile, Symbole, Kanten, Chunks und
 * die FTS-Spiegelung. Gibt die Kanten zurueck — der Aufrufer loest daraus die
 * Touches auf, weil dafuer die Kenntnis aller Dateien noetig ist.
 *
 * Der Text wird VOR der ersten Zeile redigiert (Plan §13: der Schutz greift vor
 * der persistierten Speicherung). Danach gibt es keinen Pfad mehr, auf dem
 * Rohinhalt in die Datenbank kommt: Symbole, Kanten, Chunks und FTS lesen den
 * redigierten Text.
 *
 * Der digest bleibt der Hash des ROHEN Inhalts: er entscheidet, ob sich eine
 * Datei geaendert hat, und ein Hash ist kein Geheimnis. Wuerde er aus dem
 * redigierten Text gebildet, saehe ein Lauf eine Aenderung nicht, die nur einen
 * bereits ersetzten Wert betrifft.
 */
function indexFile(db, root, absolute, file, options) {
  const path = toProjectPath(root, absolute);
  const language = languageOf(path) ?? 'text';
  const digest = createHash('sha256').update(file.text).digest('hex');
  const safe = redactSecrets(file.text);
  forgetFile(db, path);

  db.prepare('insert or replace into files(path, language, bytes, mtime_ms, digest, indexed_at_ms, stamp) values (?, ?, ?, ?, ?, ?, ?)')
    .run(path, language, file.bytes, file.mtimeMs, digest, Date.now(), options.stamp ?? null);

  // Die Fundstelle wird festgehalten, der Wert nicht.
  const insertFinding = db.prepare(`insert or ignore into ${SECRET_TABLE}(path, line, kind) values (?, ?, ?)`);
  for (const finding of safe.findings) insertFinding.run(path, finding.line, finding.kind);

  // Die Extraktion richtet sich nach dem Dateityp (Parser-Registry), nicht nach
  // einer Annahme: eine Markdown-Datei wird anders gelesen als ein Modul.
  const insertSymbol = db.prepare('insert or ignore into symbols(path, name, kind, line) values (?, ?, ?, ?)');
  for (const symbol of extractSymbols(safe.text, language)) insertSymbol.run(path, symbol.name, symbol.kind, symbol.line);

  const edges = extractEdges(safe.text, language);
  const insertEdge = db.prepare('insert or ignore into edges(path, kind, target) values (?, ?, ?)');
  for (const edge of edges) insertEdge.run(path, edge.kind, edge.target);

  const insertChunk = db.prepare('insert or ignore into chunks(path, start_line, end_line, body) values (?, ?, ?, ?)');
  const insertFts = db.prepare(`insert into "${FTS_TABLE}"(path, body) values (?, ?)`);
  for (const chunk of chunkText(safe.text, options.chunkLines)) {
    insertChunk.run(path, chunk.startLine, chunk.endLine, chunk.body);
    insertFts.run(path, chunk.body);
  }

  return { path, absolute, edges, findings: safe.findings.length };
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
 *                             und mit verify=stamp zusaetzlich: Stempel gleich?
 *        -> sonst lesen und sha256 vergleichen (hashed)
 *             gleicher Hash: nur die Dateizeile auffrischen (rehashed)
 *             neuer Hash:    neu parsen und die Primaerdaten ersetzen (written)
 *
 * Damit ist 'kein vollstaendiger Rebuild' ZAEHLBAR statt behauptet: der Bericht
 * nennt, wie viele Dateien gelesen (hashed) und wie viele neu geparst (written)
 * wurden, und wie viele BYTES dabei gelesen wurden (readBytes) — die Kosten
 * stehen im Bericht, nicht nur in einem Messskript. Ein zweiter Lauf ohne
 * Dateiaenderung hat hashed = 0, written = 0 und readBytes = 0.
 *
 * VERIFY (Umgang mit Zeitstempel-Problemen, §11) — drei Politiken, die sich in
 * dem unterscheiden, was sie ueber eine Datei ANNEHMEN:
 *
 *   'stamp'   (Standard) glaubt Groesse und mtime NICHT allein. Stimmen beide,
 *             wird zusaetzlich der Inode-Stempel verglichen (inodeStamp): ctime
 *             und Identitaet schliessen die Luecke, ohne dass eine unveraenderte
 *             Datei gelesen wird. Ein verdaechtiger Stempel kostet EINEN
 *             Lesevorgang; stellt sich der Inhalt als gleich heraus, ist das ein
 *             gezaehlter Fehlalarm (falseAlarms) und der Stempel wird mit
 *             aufgefrischt, damit er sich nicht wiederholt.
 *   'changed' vertraut mtime+size. Benannte Luecke: gleiche Groesse, geaenderter
 *             Inhalt, zurueckgesetzte mtime bleibt unentdeckt.
 *   'all'     liest und hasht jede Datei. Nimmt nichts an — und kostet ein
 *             vollstaendiges Lesen je Lauf.
 *
 * Alle drei sind FAIL-CLOSED in derselben Richtung: was nicht sicher gleich ist,
 * wird gelesen. 'stamp' ist strenger als 'changed' und billiger als 'all'.
 *
 * Der Lauf wirft nicht wegen einer einzelnen Datei; er gibt einen Bericht
 * zurueck. Der Referenzdurchgang laeuft nur, wenn sich die Menge der
 * Referenzziele geaendert hat (sonst nur fuer die neu geschriebenen Dateien), und
 * die Touch-Aufloesung raeumt Ziele weg, die es nicht mehr gibt.
 */
export function updateIndex(db, root, options = {}) {
  const chunkLines = options.chunkLines ?? 40;
  const maxFileBytes = options.maxFileBytes ?? 262144;
  const verify = options.verify ?? 'stamp';
  const files = listFiles(root, options.extensions ?? SOURCE_EXTENSIONS);
  const report = {
    root: resolve(root),
    verify,
    files: files.length,
    unchanged: 0,
    /** Ueber den vollen Stempel vertraut, ohne zu lesen (nur verify=stamp). */
    stamped: 0,
    /** Verdaechtig: Groesse UND mtime gleich, der Stempel nicht — die §11-Luecke. */
    suspicious: 0,
    /** Davon mit identischem Inhalt: der Preis des Signals, gezaehlt statt still. */
    falseAlarms: 0,
    /** Gelesene Bytes — die Kosten des Laufs, im Bericht nachpruefbar. */
    readBytes: 0,
    hashed: 0,
    rehashed: 0,
    written: 0,
    skipped: 0,
    removed: 0,
    /** Dateien, die als Zugangsdatentraeger erkannt und nie gelesen wurden. */
    protected: 0,
    protectedKinds: {},
    /** Davon welche, die eine fruehere Fassung schon indexiert hatte. */
    purged: 0,
    /** Fundstellen ausgeschriebener Werte — die Zahl, nicht der Wert. */
    findings: 0,
    references: 0,
    touches: 0,
    symbolsChanged: false,
  };

  const previous = new Map(db.prepare('select path, bytes, mtime_ms, digest, stamp from files').all().map((row) => [row.path, row]));

  db.exec('begin');
  try {
    const written = [];
    const seen = new Set();
    for (const absolute of files) {
      const path = toProjectPath(root, absolute);
      seen.add(path);
      // Schicht 1 (Plan §13): ein Zugangsdatentraeger wird nicht einmal
      // geoeffnet — kein stat, kein Lesen, kein digest. Hatte eine fruehere
      // Fassung ihn schon indexiert, verschwinden seine Zeilen hier.
      const protection = protectedReason(path);
      if (protection !== null) {
        if (previous.delete(path)) {
          forgetFile(db, path);
          // Ein Zugangsdatentraeger, den eine FRUEHERE Fassung schon geschrieben
          // hatte: die Zeilen gehen jetzt, die Bytes beim Zusammenzug unten.
          report.purged += 1;
        }
        report.protected += 1;
        report.protectedKinds[protection] = (report.protectedKinds[protection] ?? 0) + 1;
        continue;
      }
      let info;
      try {
        info = statSync(absolute);
      } catch {
        report.skipped += 1;
        continue;
      }
      const before = previous.get(path);
      const untouched = before !== undefined && before.bytes === info.size && before.mtime_ms === Math.round(info.mtimeMs);
      // Der Stempel wird nur genommen, wenn er gebraucht wird: `verify: 'changed'`
      // soll fuer eine unveraenderte Datei genau EINEN stat kosten — so wie vor
      // der Stempelspalte. GEMESSEN war das die eine Stelle, an der 'changed'
      // langsamer wurde, ohne etwas davon zu haben.
      let stamp = null;
      let suspicious = false;
      if (untouched && verify === 'changed') {
        report.unchanged += 1;
        continue;
      }
      if (untouched && verify === 'stamp') {
        // Der eigentliche Gewinn: Groesse und mtime stimmen, und der Stempel sagt
        // "dieselbe Datei, unangetastet" — dann wird kein Byte gelesen.
        stamp = inodeStamp(absolute, Math.round(info.mtimeMs));
        if (stamp !== null && before.stamp === stamp) {
          report.unchanged += 1;
          report.stamped += 1;
          continue;
        }
        // Kein brauchbarer Stempel (nicht lesbar) oder ein anderer: dieser Fall
        // ist genau die §11-Luecke, und er wird gelesen, nicht geraten.
        if (stamp !== null) {
          suspicious = true;
          report.suspicious += 1;
        }
      }
      // VOR dem Lesen: aendert sich die Datei waehrend des Lesens, bleibt der
      // gespeicherte Stempel der alte und der naechste Lauf liest erneut —
      // fail-closed statt still veraltet.
      if (stamp === null) stamp = inodeStamp(absolute, Math.round(info.mtimeMs));
      const file = readText(absolute, maxFileBytes);
      if (file === null) {
        // Eine uebersprungene Datei darf keine alten Zeilen stehen lassen.
        if (before !== undefined) forgetFile(db, path);
        report.skipped += 1;
        continue;
      }
      report.hashed += 1;
      report.readBytes += file.bytes;
      const digest = createHash('sha256').update(file.text).digest('hex');
      if (before !== undefined && before.digest === digest) {
        db.prepare('update files set language = ?, bytes = ?, mtime_ms = ?, stamp = ?, indexed_at_ms = ? where path = ?')
          .run(languageOf(path) ?? 'text', file.bytes, file.mtimeMs, stamp, Date.now(), path);
        report.rehashed += 1;
        if (suspicious) report.falseAlarms += 1;
        continue;
      }
      written.push(indexFile(db, root, absolute, file, { chunkLines, stamp }));
      report.written += 1;
    }

    for (const path of previous.keys()) {
      if (seen.has(path)) continue;
      forgetFile(db, path);
      report.removed += 1;
    }

    // Referenzen: die Menge der Referenzziele entscheidet, ob ALLE Dateien neu
    // geprueft werden. Referenzziel ist nur, was ein Bezeichner sein kann —
    // Ueberschriften und Textdateien zaehlen nicht.
    const names = [
      ...new Set(
        db.prepare('select distinct name, kind from symbols').all()
          .filter((row) => REFERENCABLE_KINDS.has(row.kind))
          .map((row) => row.name),
      ),
    ].sort();
    const digest = createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 16);
    report.symbolsChanged = metaValue(db, 'symbols_digest') !== digest;
    const rescanned = report.symbolsChanged ? db.prepare('select path from files order by path').all().map((row) => row.path) : written.map((entry) => entry.path);
    for (const path of rescanned) {
      db.prepare('delete from "references" where path = ?').run(path);
      const file = readText(resolve(root, path), maxFileBytes);
      if (file === null) continue;
      // Auch der Referenzdurchgang liest nur redigierten Text: eine Referenz
      // traegt Namen und Zeile, nie einen Wert — und der Wert soll auch nicht
      // auf einem Umweg ueber diese Schleife in die Datenbank kommen.
      const insert = db.prepare('insert or ignore into "references"(path, name, line) values (?, ?, ?)');
      for (const reference of findReferences(redactSecrets(file.text).text, names)) {
        report.references += insert.run(path, reference.name, reference.line).changes;
      }
    }

    const insertTouch = db.prepare('insert or ignore into touches(path, target, kind) values (?, ?, ?)');
    for (const entry of written) {
      report.findings += entry.findings;
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

  // Nur wenn Zeilen WEGEN DES SCHUTZES oder durch Verschwinden entfernt wurden:
  // dann traegt die Datei freigegebene Seiten mit altem Inhalt und wird neu
  // zusammengezogen. Ein gewoehnlicher Lauf zahlt das nicht.
  if (report.purged > 0 || report.removed > 0) db.exec('vacuum');

  return report;
}

/** Zaehlung je Tabelle — die kleinste ehrliche Auskunft ueber den Index. */
export function indexStats(db) {
  const count = (table) => db.prepare(`select count(*) as n from "${table}"`).get().n;
  const stats = {};
  for (const table of PRIMARY_TABLES) stats[table] = count(table);
  stats[FTS_TABLE] = count(FTS_TABLE);
  stats[SECRET_TABLE] = count(SECRET_TABLE);
  return stats;
}

/**
 * Die Fundstellen ausgeschriebener Werte — Pfad, Zeile und Art. Der WERT steht
 * nicht in der Datenbank und kann deshalb auch nicht zurueckgegeben werden; wer
 * den Wert braucht, liest die Datei selbst.
 */
export function secretFindings(db, path) {
  const sql = `select path, line, kind from ${SECRET_TABLE}${path === undefined ? '' : ' where path = ?'} order by path, line`;
  return path === undefined ? db.prepare(sql).all() : db.prepare(sql).all(path);
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
    return updateIndex(db, root, { maxFileBytes: options.maxFileBytes, chunkLines: options.chunkLines, verify: options.verify });
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

// ══ Der MAX-Kontext (Plan §14/§15) ═══════════════════════════════════════════
//
// Diese Sektion ist die fehlende Haelfte zwischen Index und Enhancer: der Index
// weiss alles ueber das Projekt, der Enhancer kennt den Kontextvertrag — aber
// niemand machte aus einem ROHTEXT relevanten Kontext. Der naheliegende Weg ist
// gemessen der falsche: die Chunks dieses Repos sind 978903 Zeichen (≈ 244726
// Token bei 4 Zeichen je Token), das Budget aus §14 erlaubt 6000. Ein Resolver,
// der nicht rangiert, kann das Budget nicht halten — er kann nur zufaellig
// klein sein. Und die Volltextsuche allein ist nicht selektiv: das haeufigste
// Symbol dieses Repos ('apply') liefert 10 Dateien mit 31 Treffern.
//
// DREI EIGENSCHAFTEN, die keine Geschmacksfrage sind:
//
//   1. NUR DER INDEX IST DIE QUELLE. Kein Dateisystemzugriff in dieser Sektion.
//      Der Index traegt redigierten Text (Plan §13), die Platte den Rohinhalt —
//      ein Resolver, der die Datei nachliest, umgeht den Secret-Schutz.
//   2. DAS BUDGET IST HART. Was nicht hineinpasst, wird an der Zeilengrenze
//      abgeschnitten; danach ist Schluss, statt die naechste Datei halb
//      anzufangen. Ein halber Kontext verspricht mehr, als er traegt.
//   3. DIE RANGFOLGE IST DATEN. `CONTEXT_PRIORITIES` haelt die Ordnung aus §14,
//      und ein Gleichstand entscheidet der Pfad — zwei Laeufe liefern dieselbe
//      Ausgabe, sonst waere der Kontext nicht nachpruefbar.
//   4. DAS BUDGET FOLGT DEM RANG. Jeder Kandidat darf so viel nehmen, wie sein
//      Rang am verbleibenden Gesamtrang ausmacht. Ohne diese Aufteilung frisst
//      die erste grosse Datei das ganze Budget: live gemessen fiel bei einem
//      Prompt, der ZWEI Pfade nennt, der zweite heraus — genau der Bezug, den
//      der Nutzer ausdruecklich genannt hat.

/** Rangfolge aus Plan §14 — als Daten, damit die Ordnung pruefbar ist. */
export const CONTEXT_PRIORITIES = {
  // R 1–3 aus §14 woertlich.
  path: 100,
  symbol: 60,
  module: 40,
  // Wer das Genannte BENUTZT, ist ein schwaecheres Signal als das Genannte
  // selbst — deshalb liegt die Abhaengigkeitskante zwischen Modul und Touch.
  dependency: 35,
  // R 4–5 aus §14 fallen in diesem Schema zusammen: die Touches-Tabelle IST der
  // aufgeloeste Importgraph dieses Projekts. Eine zweite Zahl fuer dieselbe
  // Menge waere eine Stufe, die es nicht gibt.
  touch: 30,
  // R 6; Rang 7 (semantische Bewertung) fuehrt §14 als optional.
  fts: 10,
};

/** Das harte Kontextbudget (Plan §14: „max. 6000 Tokens Code-Kontext"). */
export const DEFAULT_CONTEXT_BUDGET = 6000;

/** Zeichen je Token — eine Schaetzung, kein Tokenizer; gemessen ist die Groessenordnung. */
export const CHARS_PER_TOKEN = 4;

/** Obergrenze der Symbolnamen im Kontext: der Vertrag ist eine Liste, kein Datenbankauszug. */
export const MAX_CONTEXT_SYMBOLS = 200;

/** Obergrenze der Volltextbegriffe je Abfrage. */
export const MAX_FTS_TERMS = 8;

/** Ein Pfadvergleich ohne Locale: derselbe Rechner, dieselbe Reihenfolge. */
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Token-Schaetzung eines Textes. */
export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / CHARS_PER_TOKEN);
}

/**
 * Die Bezugsworte eines Rohtexts: Wortgrenzen auf den Zeichen, die in Pfaden,
 * Symbolen und Paketnamen vorkommen. Keine Sprachheuristik — was nicht als
 * Token im Index steht, kann auch nicht treffen.
 */
export function promptTokens(prompt) {
  const text = typeof prompt === 'string' ? prompt : '';
  const seen = new Set();
  const tokens = [];
  for (const raw of text.split(/[^A-Za-z0-9_./@-]+/)) {
    const token = raw.replace(/^\.\//, '').replace(/[.,;:]+$/, '');
    if (token === '' || !/[A-Za-z0-9]/.test(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

/**
 * Kandidaten mit Rang. Jede Stufe aus §14 hat ihre Quelle:
 *
 *   exakter Pfad    die Dateitabelle; ein Name ohne Verzeichnis zaehlt schwaecher
 *   exaktes Symbol  die Symboltabelle, nur referenzierbare Arten
 *   Paket/Modul     Kanten der Art 'dependency'
 *   Touch           Touches in beide Richtungen
 *   Volltext        FTS5 zuletzt und mit dem niedrigsten Rang
 *
 * Die Reihenfolge entsteht aus den RANGEN, nicht aus der Abfragereihenfolge:
 * eine spaetere Stufe kann einen frueheren Kandidaten nur bestaetigen.
 */
export function rankContextCandidates(db, prompt) {
  const tokens = promptTokens(prompt);
  const scores = new Map();
  const rank = (path, score, kind) => {
    const before = scores.get(path);
    if (before === undefined || score > before.score) scores.set(path, { path, score, kind });
  };

  const paths = db.prepare('select path from files').all().map((row) => row.path);
  const known = new Set(paths);
  const byBase = new Map();
  const byDirBase = new Map();
  for (const path of [...paths].sort(byPath)) {
    const slash = path.lastIndexOf('/');
    const base = path.slice(slash + 1);
    if (!byBase.has(base)) byBase.set(base, path);
    if (slash === -1) continue;
    const dir = path.slice(0, slash);
    const dirBase = dir.slice(dir.lastIndexOf('/') + 1);
    if (!byDirBase.has(dirBase)) byDirBase.set(dirBase, dir);
  }

  const symbolPaths = db.prepare('select path, kind from symbols where name = ? order by path');
  const dependencyPaths = db.prepare("select distinct target, path from edges where kind = 'dependency' and (target = ? or target like '%/' || ?) order by path");
  const nameEdges = db.prepare("select distinct path from edges where kind = 'name' and (target = ? or target like '%/' || ?) order by path");
  /** Die DIREKTEN Kinder eines Verzeichnisses — nicht rekursiv. */
  const childrenOf = db.prepare("select path from files where path like ? and path not like ? order by path");
  const hitTerms = [];

  for (const token of tokens) {
    if (known.has(token)) rank(token, CONTEXT_PRIORITIES.path, 'path');
    else if (byBase.has(token)) rank(byBase.get(token), CONTEXT_PRIORITIES.path - 10, 'path-basename');

    // Rang 3 (§14): Paket/Modul. Ein genanntes Verzeichnis, ein Verzeichnisname
    // oder ein Paketname liefert die direkt darin liegenden Dateien. Nicht
    // rekursiv: ein einzelner Name zoege sonst den halben Baum herein, und das
    // Budget waere mit Zufall gefuellt.
    const moduleDirs = new Set();
    if (token.includes('/')) moduleDirs.add(token);
    if (byDirBase.has(token)) moduleDirs.add(byDirBase.get(token));
    for (const row of nameEdges.all(token, token)) {
      const slash = row.path.lastIndexOf('/');
      if (slash !== -1) moduleDirs.add(row.path.slice(0, slash));
    }
    for (const dir of moduleDirs) {
      for (const child of childrenOf.all(`${dir}/%`, `${dir}/%/%`)) rank(child.path, CONTEXT_PRIORITIES.module, 'module');
    }

    for (const row of symbolPaths.all(token)) {
      if (!REFERENCABLE_KINDS.has(row.kind)) continue;
      rank(row.path, CONTEXT_PRIORITIES.symbol, 'symbol');
      // Ein Symbolname ist der Begriff, den FTS5 wirklich findet: Pfade stehen
      // nicht im Dateiinhalt, Symbole schon.
      if (!hitTerms.includes(token) && hitTerms.length < MAX_FTS_TERMS) hitTerms.push(token);
    }
    for (const row of dependencyPaths.all(token, token)) rank(row.path, CONTEXT_PRIORITIES.dependency, 'dependency');
  }

  // Touches in beide Richtungen — aber nur von Kandidaten, die schon tragen.
  // Ein Touch ist eine Verstaerkung, kein Einstieg: sonst zoege jede Kante die
  // halbe Dateitabelle nach.
  const touched = db.prepare('select target from touches where path = ? order by target');
  const touching = db.prepare('select path from touches where target = ? order by path');
  for (const candidate of [...scores.values()]) {
    if (candidate.score < CONTEXT_PRIORITIES.dependency) continue;
    for (const row of touched.all(candidate.path)) rank(row.target, CONTEXT_PRIORITIES.touch, 'touch');
    for (const row of touching.all(candidate.path)) rank(row.path, CONTEXT_PRIORITIES.touch, 'touch');
  }

  if (hitTerms.length > 0) {
    const query = hitTerms.map((term) => `"${term.replace(/"/g, '')}"`).join(' OR ');
    for (const hit of searchChunks(db, query, 20)) rank(hit.path, CONTEXT_PRIORITIES.fts, 'fts');
  }

  return [...scores.values()].sort((a, b) => b.score - a.score || byPath(a.path, b.path));
}

/**
 * An der Zeilengrenze schneiden. Ein Kontext, der mitten in einer Zeile endet,
 * ist ein halber Ausdruck; ein ganzer Zeilenrest ist wenigstens lesbar.
 */
function cutAtLine(text, room) {
  if (room <= 0) return '';
  if (text.length <= room) return text;
  const cut = text.slice(0, room);
  const lastBreak = cut.lastIndexOf('\n');
  return lastBreak === -1 ? cut : cut.slice(0, lastBreak + 1);
}

/**
 * Aus einem Rohtext den MAX-Kontext bauen (Plan §14). Gibt IMMER die Form des
 * Kontextvertrags zurueck, auch wenn nichts traf: ein leerer Kontext ist eine
 * Auskunft, ein geworfener Fehler waere ein kaputter Agentenschritt.
 *
 * `project` kommt vom Aufrufer — der Resolver kennt nur den Index, nicht den
 * Projektnamen; eine Ableitung aus dem Dateipfad waere eine zweite Wahrheit.
 */
export function resolveContext(db, options = {}) {
  const prompt = typeof options.prompt === 'string' ? options.prompt : '';
  // Eine unbrauchbare Grenze (NaN, nichts gesetzt) faellt auf den Default zurueck;
  // eine Grenze kleiner als null wird zu null. Sie auf den Default zu heben waere
  // fail-open: der Aufrufer bekaeme mehr Projektinhalt, als er erlaubt hat.
  const budget = Math.max(0, Number.isFinite(options.budgetTokens) ? options.budgetTokens : DEFAULT_CONTEXT_BUDGET);
  const project = typeof options.project === 'string' ? options.project : '';
  const charBudget = budget * CHARS_PER_TOKEN;

  const ranked = rankContextCandidates(db, prompt);
  const chunksOf = db.prepare('select body from chunks where path = ? order by start_line');
  const files = [];
  let used = 0;
  // `charsLeft` sind die Zeichen, die noch frei sind — inklusive der Trennzeile,
  // die die naechste Datei kostet. Alle Rechnungen bleiben in GANZEN Zeichen:
  // die Grenze aus §14 ist in Token angegeben, gerechnet wird in Zeichen.
  let charsLeft = charBudget;
  let scoreLeft = ranked.reduce((sum, candidate) => sum + candidate.score, 0);
  for (const candidate of ranked) {
    const allowance = scoreLeft <= 0 ? 0 : Math.floor(charsLeft * (candidate.score / scoreLeft));
    scoreLeft -= candidate.score;
    const room = Math.min(allowance, charsLeft - (files.length === 0 ? 0 : 1));
    if (room <= 0) continue;
    const text = chunksOf.all(candidate.path).map((row) => row.body).join('\n');
    if (text === '') continue;
    const content = cutAtLine(text, room);
    if (content === '') continue;
    files.push({ path: candidate.path, content });
    used += content.length;
    charsLeft = charBudget - used - files.length;
  }

  const included = files.map((file) => file.path);
  const symbols = [];
  const touches = new Set();
  const dependencies = new Set();
  if (included.length > 0) {
    const marks = included.map(() => '?').join(', ');
    for (const row of db.prepare(`select distinct name, kind from symbols where path in (${marks}) order by name`).all(...included)) {
      if (!REFERENCABLE_KINDS.has(row.kind)) continue;
      symbols.push(row.name);
      if (symbols.length >= MAX_CONTEXT_SYMBOLS) break;
    }
    const known = new Set(included);
    for (const row of db.prepare(`select path, target from touches where path in (${marks}) or target in (${marks})`).all(...included, ...included)) {
      if (!known.has(row.path)) touches.add(row.path);
      if (!known.has(row.target)) touches.add(row.target);
    }
    for (const row of db.prepare(`select distinct target from edges where kind = 'dependency' and path in (${marks}) order by target`).all(...included)) {
      dependencies.add(row.target);
    }
  }

  return {
    project,
    files,
    symbols,
    // `constraints` bleibt leer, und das ist eine benannte Luecke: Plan §9 fuehrt
    // keine Constraint-Quelle im Index (Regeln stehen in AGENTS.md, nicht in
    // einer Tabelle). Ein erfundener Eintrag waere schlimmer als ein leerer —
    // der Enhancer wuerde eine Regel behaupten, die niemand geprueft hat.
    constraints: [],
    touches: [...touches].sort(byPath),
    dependencies: [...dependencies].sort(byPath),
  };
}
