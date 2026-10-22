/**
 * Extraktion und Dateisystem — vom Pfad zum redigierten Datensatz.
 *
 * Eigentuemer dieser Datei ist das LESEN: der Baumspaziergang (`listFiles` mit
 * seinen benannten Uebersprungsgruenden), die Spracherkennung, die Zeilen-
 * heuristik fuer Symbole und Kanten (es gibt keinen Parser, siehe `PARSERS`),
 * die Referenzsuche und das Chunking. Alles hier ist rein: Text rein, Daten
 * raus, keine Datenbank, kein Zustand.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { EDGE_PATTERNS, INDEX_FILE, LANGUAGES, MAX_REFERENCE_NAMES, RESERVED_WORDS, SKIP_DIRS, SOURCE_EXTENSIONS, SYMBOL_PATTERNS } from './index-format.js';

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
 * Die Gruende, aus denen der Scan eine Datei oder einen Ordner NICHT aufnimmt.
 *
 * Eine feste Liste und kein Freitext: der Bericht soll die Gruende zaehlen
 * koennen. Ein Ausschluss ohne Namen ist eine Zahl, die nichts erklaert — genau
 * der Zustand VOR dieser Aenderung, in dem „zu gross", „gesperrt" und
 * „verschwunden" alle als dieselbe stumme `skipped`-Zahl erschienen.
 */
export const SCAN_REASONS = [
  /** Zwischen Auflisten und Lesen verschwunden (oder das `stat` scheiterte). */
  'VERSCHWUNDEN',
  /** Kein regulaeres Dateiobjekt (FIFO, Socket, Geraet) — nicht indexierbar. */
  'KEINE_DATEI',
  /** Ueber `maxFileBytes`: bewusst uebergangen, nicht fehlgeschlagen. */
  'ZU_GROSS',
  /** Vorhanden, aber der Inhalt ist nicht lesbar (Rechte, Encoding, EIO). */
  'NICHT_LESBAR',
  /** Ein Ordner liess sich nicht auflisten — sein ganzer Teilbaum fehlt im Index. */
  'ORDNER_NICHT_LESBAR',
];

/** Der Fehlercode eines Fehlers, oder null — die Angabe, die ein Befund braucht. */
export function errorCodeOf(error) {
  return typeof error?.code === 'string' ? error.code : null;
}

/**
 * Eine Datei als Text lesen — MIT GRUND, wenn es nicht geht.
 *
 * Der Unterschied zu `readText` (unten) ist die Auskunft: ein Ausschluss hat hier
 * einen NAMEN. Vorher fielen „zu gross" und „nicht lesbar" in denselben null-Rueckgabewert,
 * und der Aufrufer zaehlte beide als `skipped`. Wer den Bericht las, konnte nicht
 * unterscheiden, ob eine Datei absichtlich uebergangen wurde (Obergrenze) oder ob ein
 * Zugriff fehlgeschlagen war (Rechte, I/O) — ein verschwiegener Fehler sieht aus wie
 * eine Entscheidung. Ein Befund ohne Pfad waere ausserdem nicht nachzugehen.
 */
export function readTextWithReason(file, maxBytes) {
  let info;
  try {
    info = statSync(file);
  } catch (error) {
    return { ok: false, reason: 'VERSCHWUNDEN', detail: errorCodeOf(error) };
  }
  if (!info.isFile()) return { ok: false, reason: 'KEINE_DATEI', detail: null };
  if (info.size > maxBytes) return { ok: false, reason: 'ZU_GROSS', detail: `${info.size}>${maxBytes}` };
  try {
    return { ok: true, text: readFileSync(file, 'utf8'), bytes: info.size, mtimeMs: Math.round(info.mtimeMs) };
  } catch (error) {
    return { ok: false, reason: 'NICHT_LESBAR', detail: errorCodeOf(error) };
  }
}

/**
 * Eine Datei als Text lesen. Ein Fehler ist kein Abbruch, sondern ein
 * Ausschluss: eine gesperrte oder zu grosse Datei laesst den Lauf weiterlaufen.
 *
 * Bleibt als schmale Form bestehen, weil der Referenzdurchgang nur den
 * Unterschied „Text oder nicht" braucht: dort gibt es keinen Bericht, den ein
 * Grund bereichern koennte.
 */
export function readText(file, maxBytes) {
  const read = readTextWithReason(file, maxBytes);
  return read.ok ? read : null;
}

/** Namensvergleich ohne Locale: derselbe Baum ergibt ueberall dieselbe Reihenfolge. */
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Pfadvergleich ohne Locale — die Reihenfolge des Berichts ist nachrechenbar. */
export const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Alle indexierbaren Dateien unterhalb von `root` — in DETERMINISTISCHER
 * Reihenfolge, und jeder Ausschluss benannt.
 *
 * Zwei Zusagen, jede einzeln pruefbar:
 *
 *   1. REIHENFOLGE: das Ergebnis ist aufsteigend nach Pfad sortiert. Der
 *      Durchlauf besucht die Eintraege je Ordner schon namenssortiert, aber erst
 *      diese Sortierung macht die Reihenfolge eine Funktion der DateiMENGE —
 *      unabhaengig davon, wie der Baum durchlaufen wurde, in welcher Reihenfolge
 *      `readdirSync` geantwortet hat und ob ein Ordner tiefer oder flacher lag.
 *      `localeCompare` waere hier falsch: es haengt von der Locale des Prozesses
 *      ab, und ein Bericht, der je Rechner anders sortiert, ist kein Nachweis.
 *   2. AUSSAHME: `onError` bekommt JEDEN ausgelassenen Ordner mit Pfad und Grund.
 *      Vorher kehrte der Durchlauf bei einem unlesbaren Ordner wortlos um, und
 *      sein ganzer Teilbaum fehlte im Index — der Bericht sah danach genauso aus
 *      wie ein Projekt ohne diesen Ordner. Ein stummer Ausfall, der wie ein
 *      Ergebnis aussieht, ist die teuerste Sorte Befund.
 *
 * Der Rueckgabewert bleibt ein Array (die Aufrufer im Repo und in den Proben
 * erwarten genau das); `onError` ist die optionale dritte Angabe, damit die
 * Erweiterung nichts bricht.
 *
 * @param root - Projektwurzel.
 * @param extensions - die aufgenommenen Endungen.
 * @param onError - optionale Senke `({ path, reason, detail })` fuer Auslassungen.
 */
export function listFiles(root, extensions = SOURCE_EXTENSIONS, onError = null) {
  const found = [];
  const report = (path, reason, detail) => {
    if (typeof onError === 'function') onError({ path, reason, detail });
  };
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      report(dir, 'ORDNER_NICHT_LESBAR', errorCodeOf(error));
      return;
    }
    for (const entry of entries.sort(byName)) {
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
  return found.sort(byPath);
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
  const list = referenceNames(names);
  if (list.length === 0) return [];
  return scanLines(text, referencePattern(list), null, (match) => match[1]);
}

/** Die Vorbehandlung einer Referenzsuche — in Legacy-Suche und Matcher identisch. */
export function referenceNames(names) {
  return [...names].slice(0, MAX_REFERENCE_NAMES).filter((name) => !RESERVED_WORDS.has(name));
}

/** Der einmal gebaute Legacy-Ausdruck über die gefilterten Namen. */
function referencePattern(list) {
  return new RegExp(`\\b(${list.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
}

/**
 * Zeilenweiser Scan mit Ergebnis in `line`-Nummern.
 *
 * `wanted === null` akzeptiert jeden Treffer (Legacy-Semantik); sonst zählt
 * nur, was in der Token- Menge liegt — Treffer außerhalb sind keine.
 */
function scanLines(text, pattern, wanted, nameOf) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    const seen = new Set();
    for (const match of line.matchAll(pattern)) {
      const name = nameOf(match);
      if ((wanted !== null && !wanted.has(name)) || seen.has(name)) continue;
      seen.add(name);
      found.push({ name, line: index + 1 });
    }
  });
  return found;
}

/**
 * Der Referenz-Matcher — einmal je Lauf gebaut, nicht je Datei.
 *
 * F-Messung (PERF-BASELINE §5): je Datei der Alternations-Regex kostete
 * 400,8 ms Kompilierung neben 4876,1 ms Scan. Für reine Wort-Namen
 * (/[A-Za-z0-9_]+/) ist ein \b-anchored Treffer exakt der Tokenausdruck,
 * also liefert scan dieselben Paare in derselben Reihenfolge. Namen mit
 * `$`, Unicode oder Regex-Sonderzeichen kriegen den einmal kompilierten
 * Legacy-Ausdruck — die Grundbedeutung zählt, nie die Geschwindigkeit.
 */
export function createReferenceMatcher(names) {
  const list = referenceNames(names);
  if (list.length === 0) return { scan: () => [] };
  const tokens = /[A-Za-z0-9_]+/g;
  if (list.every((name) => /^[A-Za-z0-9_]+$/.test(name))) {
    const wanted = new Set(list);
    return { scan: (text) => scanLines(text, tokens, wanted, (match) => match[0]) };
  }
  const pattern = referencePattern(list);
  return { scan: (text) => scanLines(text, pattern, null, (match) => match[1]) };
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