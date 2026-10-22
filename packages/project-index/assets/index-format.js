/**
 * Der Vertrag des Index — Konstanten, Tabellen, Muster und der Secret-Schutz.
 *
 * Eigentuemer dieser Datei ist der VERTRAG, nicht der Lauf: Fassungen
 * (`SCHEMA_VERSION`, `INDEXER_VERSION`, `MEMORY_VERSION`), die Tabellennamen aus
 * Plan §9 (namentlich, weil `references` ein SQLite-Schluesselwort ist), die
 * Pfad- und Inhaltsmuster des Secret-Schutzes und das DDL. Wer eine Tabelle
 * anlegt oder ein Muster schaerft, aendert hier — und die Fassung dazu, sonst
 * ist der Umbau fuer jeden vorhandenen Index unsichtbar.
 */

import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

/** Vertragsname des Index. */
export const CONTRACT = 'shinon.project-index/v1';

/**
 * Fassung des Schemas; ein anderer Wert macht einen vorhandenen Index ungueltig.
 *
 * Angehoben von 1 auf 2 (Zug 2): die Ablage `memory` ist eine neue Tabelle im
 * Index. Nach der Regel dieses Kopfes erhoeht eine Tabellenaenderung diese Zahl
 * — sonst benutzte ein bestehender Index still die alte Form.
 */
export const SCHEMA_VERSION = 2;

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

/**
 * Wurzel aller Indizes — ausserhalb jedes Projekts und WEGWERFBAR.
 *
 * Der Index ist reine Ableitung (Dateien, Symbole, Kanten, Chunks entstehen aus
 * dem Projekt und sind aus ihm wieder herstellbar). Er gehoert deshalb in den
 * CACHE des Nutzers und nicht in die Daten: `SHINON_INDEX_ROOT`, sonst
 * `$XDG_CACHE_HOME/shinon/indexes`, sonst `~/.cache/shinon/indexes`.
 *
 * Die fruehere Fassung lag unter `~/.shinon/indexes` — einem eigenen Ort ohne
 * Konvention, der bei einem `rm -rf ~/.cache` ueberlebt haette, obwohl er nichts
 * Dauerhaftes traegt, und der beim Aufraeumen der Nutzerdaten niemandem auffiel.
 * Dieselbe Regel steht als Dienst in `scripts/lib/paths.mjs` (indexRoot());
 * `scripts/gate/tests/scan-pruning.test.mjs` pinnt beide Werte gegeneinander,
 * damit die zwei Orte nicht auseinanderlaufen.
 */
export const DEFAULT_INDEX_ROOT = indexRootDefault();

/**
 * Der DAUERHAFTE Ledger des Scorings — Nutzerurteile und der daraus gerechnete
 * Stand sind NICHT herstellbar, also gehoeren sie in die Daten des Nutzers:
 * `SHINON_LEDGER_FILE`, sonst `$XDG_DATA_HOME/shinon/ledger.sqlite`, sonst
 * `~/.local/share/shinon/ledger.sqlite`.
 *
 * Warum NICHT im Index (frueher: Namensraum in index.sqlite): der Index liegt im
 * Cache. Ein `rm -rf ~/.cache`, ein Projektrechtwechsel oder ein Cache-Aufraeumer
 * haette dort das Gedaechtnis des Nutzers mitgenommen. Ein Index-Neuaufbau war
 * schon vorher unschaedlich (eigene MEMORY_VERSION), die Cache-Bereinigung war
 * es nicht.
 */
export const DEFAULT_LEDGER_FILE = ledgerFileDefault();

/** Dateiname je Projekt. */
export const INDEX_FILE = 'index.sqlite';

/** Vertragsname der dauerhaften Ablage (eine eigene Datei, ein eigener Vertrag). */
export const LEDGER_CONTRACT = 'shinon.ledger/v1';

/** Der Index liegt im Cache — XDG-Konvention, mit Override. */
function indexRootDefault(env = process.env) {
  const override = absoluteFromEnv(env.SHINON_INDEX_ROOT, 'SHINON_INDEX_ROOT');
  if (override !== null) return override;
  const base = absoluteFromEnv(env.XDG_CACHE_HOME, 'XDG_CACHE_HOME') ?? join(homedir(), '.cache');
  return join(base, 'shinon', 'indexes');
}

/** Der Ledger liegt in den Daten — XDG-Konvention, mit Override. */
function ledgerFileDefault(env = process.env) {
  const override = absoluteFromEnv(env.SHINON_LEDGER_FILE, 'SHINON_LEDGER_FILE');
  if (override !== null) return override;
  const base = absoluteFromEnv(env.XDG_DATA_HOME, 'XDG_DATA_HOME') ?? join(homedir(), '.local', 'share');
  return join(base, 'shinon', 'ledger.sqlite');
}

/**
 * Ein absoluter Override aus der Umgebung, oder `null`. Ein relativer Wert ist
 * kein Kandidat: er zeigte je nach Startordner woandershin.
 */
function absoluteFromEnv(value, name) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (!isAbsolute(value.trim())) return null;
  return resolve(value.trim());
}

/** Die Primaerdaten aus Plan §9, in der Reihenfolge des Plans. */
export const PRIMARY_TABLES = ['files', 'symbols', 'edges', 'references', 'touches', 'chunks'];

/** Die Volltextspiegelung der Chunks. */
export const FTS_TABLE = 'chunks_fts';

/**
 * Die Ablage der NICHT herleitbaren Daten (Zug 2).
 *
 * Warum eine eigene Tabelle und nicht ein Feld im Index: alles andere in dieser
 * Datei ist ABGELEITET — Dateien, Symbole, Kanten, Chunks entstehen aus dem
 * Projekt und sind aus ihm wieder herstellbar (SCHEMA_VERSION steigt, der
 * naechste Lauf baut sie neu). Was hier liegt, ist das Gegenteil: die
 * Bewertungen des Menschen, ihre Zuordnung und der daraus gerechnete Stand
 * lassen sich nirgends nachlesen. Ein Index-Neuaufbau darf sie deshalb NICHT
 * verwerfen — die Ablage traegt ihre eigene Fassung (MEMORY_VERSION), und nur
 * deren Wechsel wirft sie weg.
 *
 * Der Index kennt den INHALT nicht: eine Zeile ist ein Namensraum, eine Art,
 * ein Schluessel und ein JSON-Dokument. Was darin steht, ist Sache des Lesers
 * (der Scoring-Host legt dort Protokoll, Merkzettel und Tafel ab). Diese
 * Trennung ist der Grund, warum die Ablage kein zweites Scoring-Schema im
 * Index versteckt: der Index transportiert, der Leser versteht.
 *
 * GRENZE, benannt: je Signal wird der ganze Namensraum neu geschrieben. Die
 * Zeilenzahl ist die Zahl der Signale eines Projekts (gemessen: zweistellig je
 * Sitzung, nicht je Token) — der Aufwand waechst mit dem Protokoll und ist
 * damit bewusst nicht inkrementell. Ein inkrementelles Append braucht stabile
 * Zeilen-Identitaeten ueber Laeufe hinweg; die gibt es heute nicht.
 */
export const MEMORY_TABLE = 'memory';

/**
 * Fassung der ABLAGE (nicht des Index und nicht der Extraktion).
 * Erhoehen heisst: die Zeilenform der Ablage hat sich geaendert und ein alter
 * Stand waere nicht mehr lesbar — dann wird die Ablage verworfen, nicht der
 * Index (und umgekehrt: SCHEMA_VERSION verwirft den Index, nicht die Ablage).
 */
export const MEMORY_VERSION = 1;

/**
 * Verzeichnisse, die nie betreten werden: Fremdcode, Historie, Laufzeitdaten,
 * Werkzeug-Caches. Das ist DIESELBE Menge wie `PRUNE_DIRS` in
 * `scripts/lib/scan.mjs` — der Kern kann sie nicht importieren (er darf nur
 * `node:*` laden und wird in jedes Tarball gepackt), deshalb pinnt
 * `scripts/gate/tests/scan-pruning.test.mjs` beide Listen zeichengenau
 * gegeneinander. Wer hier etwas ergänzt, muss es dort auch tun (und umgekehrt),
 * sonst wird der Drift im Gate sichtbar statt still.
 *
 * `.agents` steht aus S1 darin: darunter liegen die Skills. Sie sind eine EIGENE
 * Quelle (eigene Auswahl, eigenes Budget) und dürfen nicht zusätzlich als
 * gewöhnlicher Projektquelltext im Kontext landen — sonst stünde derselbe Skill
 * zweimal in der Nachricht, einmal als Datei und einmal als Skill-Block.
 */
export const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.cache', '.turbo', '.nyc_output', 'coverage', 'storages', 'sessions', 'logs', 'vendor', '.agents']);

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
  // Die Ablage: ein Namensraum, eine Art ('record' | 'memo' | 'summary'), ein
  // Schluessel und ein JSON-Dokument. `ordinal` ordnet die Zeilen eines
  // Protokolls, `doc` ist der Vertrag des Lesers — hier steht kein Feld davon.
  `create table if not exists ${MEMORY_TABLE}(namespace text not null, kind text not null, ref text not null, ordinal integer not null default 0, doc text not null, primary key(namespace, kind, ref))`,
];