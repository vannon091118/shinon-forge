/**
 * Der Kontext — Warm-Pfad und Rangfolge fuer MAX.
 *
 * Eigentuemer dieser Datei ist die ANTWORT auf einen Prompt: Kandidaten aus dem
 * Index auffrischen (nur was der Inode-Stempel als geaendert meldet), dann
 * rangordnen und bis zum Zeichenbudget schneiden. Der Resolver liest NIE die
 * Platte — er liest den Index, der schon redigiert ist.
 */

import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { REFERENCABLE_KINDS, byPath, createReferenceMatcher, inodeStamp, languageOf, readTextWithReason } from './index-extract.js';
import { SKIP_DIRS, SOURCE_EXTENSIONS, protectedReason, redactSecrets } from './index-format.js';
import { forgetFile, indexFile, resolveTouches } from './index-run.js';
import { searchChunks, setMeta } from './index-store.js';
import { INDEX_DEFAULTS } from './defaults.js';

// ══ Der Warm-Pfad: Kandidaten auffrischen, nicht den Baum ════════════════════
//
// WARUM HIER UEBERHAUPT DAS DATEISYSTEM GELESEN WIRD: der Index entsteht beim
// Mount (Kaltlauf) und veraltet ab dem ersten Schreibvorgang des Projekts.
// Gemessen im Leitstand (`docs/probes/e2e-leitstand-2026-10-19.md` §4): der Lauf
// indizierte beim Boot 1 Datei, am Ende standen 25 im Baum, im Index weiter 1 —
// die Abfrage lieferte `[]`, und MAX arbeitete mit leerem Kontext. Ein Watcher
// ist keine Option (Dauerbeobachter, ein Prozess mehr, Plattformfrage), ein
// Vollscan je Turn auch nicht (er kostet den ganzen Baum). Der Mittelweg ist der
// INODE-STEMPEL, den der Kaltlauf ohnehin in `files.stamp` schreibt: je Kandidat
// EIN `stat`, und nur was sich geaendert hat, wird gelesen und neu indexiert.
//
// DER SECRET-SCHUTZ BLEIBT, und zwar ohne Ausnahme: gelesen wird roh, in den
// Index geht ausschliesslich der redigierte Text — derselbe `indexFile`-Weg wie
// im Kaltlauf. Schicht 1 gilt hier genauso (ein Zugangsdatentraeger wird nicht
// geoeffnet), und der Kontext wird weiterhin NUR aus dem Index gebaut: der
// Resolver gibt nie Platteninhalt zurueck, er frischt die abgeleitete Kopie auf.

/** Vertragsname des Auffrisch-Berichts (Diagnose, keine zweite Naht). */
export const WARM_CONTRACT = 'shinon.project-index/warm-v1';

/**
 * Wie viele Kandidaten eine Abfrage hoechstens prueft.
 *
 * Eine Grenze, keine Messung: der Kontext haelt hoechstens 6000 Token, und der
 * Rang laesst mehr als diese Zahl Kandidaten praktisch nie ins Budget. Ohne
 * Deckel waere der Warm-Pfad ein Vollscan mit anderem Namen.
 */
export const WARM_CANDIDATE_LIMIT = 32;

/**
 * Wuerde `listFiles` diesen Pfad aufnehmen? Dieselbe Regel, damit der Warm-Pfad
 * nichts indexiert, was der Kaltlauf wieder wegwerfen wuerde (und nichts
 * ausserhalb der Wurzel liest).
 */
function indexablePath(path) {
  if (typeof path !== 'string' || path === '') return false;
  if (isAbsolute(path)) return false;
  const parts = path.split(/[\\/]/);
  if (parts.some((part) => part === '..' || SKIP_DIRS.has(part))) return false;
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/**
 * NEUE Dateien, die der Prompt beim Namen nennt: ein Pfad-Token, der auf der
 * Platte existiert, im Index aber fehlt.
 *
 * Ohne diesen Schritt koennte der Warm-Pfad nur auffrischen, was er schon kennt —
 * eine gerade angelegte Datei waere unsichtbar, bis der naechste Kaltlauf kommt.
 * Geprueft wird nur, was wie ein Pfad aussieht (Endung aus `SOURCE_EXTENSIONS`),
 * und je Token genau EIN `stat`: kein Verzeichnis wird aufgelistet.
 */
export function probeCandidates(root, prompt, limit = WARM_CANDIDATE_LIMIT) {
  const found = [];
  if (typeof root !== 'string' || root === '') return found;
  for (const token of promptTokens(prompt)) {
    if (found.length >= limit) break;
    if (!indexablePath(token) || !token.includes('/')) continue;
    if (found.includes(token)) continue;
    let info;
    try {
      info = statSync(join(resolve(root), token));
    } catch {
      continue;
    }
    if (!info.isFile() || protectedReason(token) !== null) continue;
    found.push(token);
  }
  return found.sort(byPath);
}

/**
 * Die Referenzen der neu geschriebenen Dateien auffrischen — dieselbe Regel wie
 * im Kaltlauf (Loeschen, dann mit EINEM Matcher je Lauf neu suchen). Gelesen
 * wird der Text, den der Aufrufer schon hat: kein zweiter Lesevorgang.
 */
function refreshReferences(db, entries) {
  const names = [
    ...new Set(
      db.prepare('select distinct name, kind from symbols').all()
        .filter((row) => REFERENCABLE_KINDS.has(row.kind))
        .map((row) => row.name),
    ),
  ].sort();
  const matcher = createReferenceMatcher(names);
  const insert = db.prepare('insert or ignore into "references"(path, name, line) values (?, ?, ?)');
  let found = 0;
  for (const entry of entries) {
    db.prepare('delete from "references" where path = ?').run(entry.path);
    for (const reference of matcher.scan(redactSecrets(entry.text).text)) {
      found += insert.run(entry.path, reference.name, reference.line).changes;
    }
  }
  return found;
}

/**
 * Die Kandidaten einer Abfrage auffrischen — der Warm-Pfad.
 *
 * Je Kandidat genau ein `stat`; gelesen wird NUR, wenn der Inode-Stempel
 * abweicht (oder fehlt, dann fail-closed). Der Bericht zaehlt, was passiert ist,
 * damit „warm" messbar bleibt statt behauptet:
 *
 *   stamped    Stempel gleich, kein Byte gelesen   (der Normalfall)
 *   rehashed   gelesen, Inhalt gleich — nur der Stempel wandert
 *   rewritten  gelesen und neu geparst (geaenderte Datei)
 *   added      gelesen und neu geparst (Datei war dem Index unbekannt)
 *   removed    Zeilen geloescht, weil die Datei weg oder geschuetzt ist
 *
 * Was hier NICHT passiert: `symbols_digest` wird nicht fortgeschrieben. Aendert
 * sich die Symbolmenge, merkt der naechste Kaltlauf das (er vergleicht den
 * Digest) und macht seinen einen vollstaendigen Referenzdurchgang — genau EINMAL,
 * statt ihn in jede Abfrage zu legen.
 */
export function refreshIndex(db, root, paths, options = {}) {
  const chunkLines = Number.isInteger(options.chunkLines) ? options.chunkLines : INDEX_DEFAULTS.chunkLines;
  const maxFileBytes = Number.isInteger(options.maxFileBytes) ? options.maxFileBytes : INDEX_DEFAULTS.maxFileBytes;
  const started = Date.now();
  const absoluteRoot = resolve(root);
  const candidates = [...new Set(Array.isArray(paths) ? paths : [])].filter(indexablePath).sort(byPath);
  const report = {
    contract: WARM_CONTRACT,
    candidates: candidates.length,
    checked: 0,
    stamped: 0,
    read: 0,
    readBytes: 0,
    written: 0,
    rehashed: 0,
    added: 0,
    removed: 0,
    skipped: 0,
    touches: 0,
    references: 0,
    ms: 0,
  };
  if (candidates.length === 0) {
    report.ms = Date.now() - started;
    return report;
  }
  const before = new Map(
    db.prepare('select path, digest, stamp from files').all().map((row) => [row.path, row]),
  );

  db.exec('begin');
  try {
    /** Die geschriebenen Dateien mit Text — fuer Touches und Referenzen. */
    const rewritten = [];
    for (const path of candidates) {
      // Schicht 1 vor dem ersten `stat` — wie im Kaltlauf.
      if (protectedReason(path) !== null) {
        if (before.has(path)) {
          forgetFile(db, path);
          report.removed += 1;
        }
        continue;
      }
      const absolute = join(absoluteRoot, path);
      let info;
      try {
        info = statSync(absolute);
      } catch {
        // Zwischen zwei Abfragen verschwunden: die Zeilen muessen mitgehen,
        // sonst liefert der Index Kontext aus einer Datei, die es nicht gibt.
        if (before.has(path)) {
          forgetFile(db, path);
          report.removed += 1;
        }
        continue;
      }
      if (!info.isFile()) continue;
      report.checked += 1;
      const known = before.get(path);
      const stamp = inodeStamp(absolute, Math.round(info.mtimeMs));
      // DER STEMPEL IST DIE ENTSCHEIDUNG. Groesse und mtime allein waeren die
      // benannte Luecke aus §11 (gleiche Groesse, zurueckgesetzte mtime); der
      // Stempel traegt Identitaet und ctime und ist deshalb hier die Bedingung.
      if (known !== undefined && stamp !== null && known.stamp === stamp) {
        report.stamped += 1;
        continue;
      }
      const read = readTextWithReason(absolute, maxFileBytes);
      if (!read.ok) {
        if (known !== undefined) {
          forgetFile(db, path);
          report.removed += 1;
        }
        report.skipped += 1;
        continue;
      }
      report.read += 1;
      report.readBytes += read.bytes;
      const digest = createHash('sha256').update(read.text).digest('hex');
      if (known !== undefined && known.digest === digest) {
        // Neu gelesen, aber derselbe Inhalt (chmod, Touch): nur die Zeile
        // auffrischen — kein erneutes Parsen, keine neuen Chunks.
        db.prepare('update files set language = ?, bytes = ?, mtime_ms = ?, stamp = ?, indexed_at_ms = ? where path = ?')
          .run(languageOf(path) ?? 'text', read.bytes, read.mtimeMs, stamp, Date.now(), path);
        report.rehashed += 1;
        continue;
      }
      const entry = indexFile(db, root, absolute, read, { chunkLines, stamp, known: known !== undefined });
      rewritten.push({ ...entry, text: read.text });
      report.written += 1;
      if (known === undefined) report.added += 1;
    }

    if (rewritten.length > 0) {
      const all = new Set(db.prepare('select path from files').all().map((row) => row.path));
      const insertTouch = db.prepare('insert or ignore into touches(path, target, kind) values (?, ?, ?)');
      for (const entry of rewritten) {
        for (const touch of resolveTouches(root, entry, all)) {
          report.touches += insertTouch.run(touch.path, touch.target, touch.kind).changes;
        }
      }
      db.prepare('delete from touches where target not in (select path from files)').run();
      report.references = refreshReferences(db, rewritten);
      setMeta(db, 'updated_at_ms', String(Date.now()));
    }
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }

  report.ms = Date.now() - started;
  return report;
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
//   1. DER INDEX IST DIE QUELLE DES KONTEXTS. Der Warm-Pfad (oben) frischt
//      Kandidaten auf und schreibt dabei nur REDIGIERTEN Text in den Index; was
//      in den Kontext geht, kommt ausschliesslich aus den Index-Tabellen. Der
//      Resolver gibt nie Platteninhalt zurueck — er haelt die abgeleitete Kopie
//      aktuell, damit sie nicht luegt.
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
export const DEFAULT_CONTEXT_BUDGET = INDEX_DEFAULTS.contextBudgetTokens;

/** Zeichen je Token — eine Schaetzung, kein Tokenizer; gemessen ist die Groessenordnung. */
export const CHARS_PER_TOKEN = 4;

/** Obergrenze der Symbolnamen im Kontext: der Vertrag ist eine Liste, kein Datenbankauszug. */
export const MAX_CONTEXT_SYMBOLS = 200;

/** Obergrenze der Volltextbegriffe je Abfrage. */
export const MAX_FTS_TERMS = 8;

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
 * Die Rangfolge dieser Abfrage — und, wenn verlangt, der Warm-Pfad davor.
 *
 * Der Warm-Pfad ist OPT-IN (`refresh: true` UND eine Wurzel): ohne beides bleibt
 * die Abfrage eine reine Indexlesung wie zuvor, damit ein Aufrufer, der den
 * Baum nicht kennt, nichts anfasst. Die Naht in `index.js` setzt beides.
 *
 * Rangfolge VOR dem Auffrischen, weil sie die Kandidatenmenge bestimmt (ein
 * Kandidat ist, was der Index fuer relevant haelt); nach dem Auffrischen wird
 * nur dann NEU rangiert, wenn sich am Index wirklich etwas geaendert hat —
 * sonst zaehlte jede Abfrage zwei Ranglaeufe fuer nichts.
 *
 * Ein Fehler des Warm-Pfads bricht die Abfrage NICHT: der Index bleibt die
 * Quelle, und der Grund geht an `onRefresh` (benannt, nicht verschluckt).
 */
function rankedForQuery(db, prompt, options) {
  const root = typeof options.root === 'string' ? options.root : '';
  const onRefresh = typeof options.onRefresh === 'function' ? options.onRefresh : null;
  const ranking = rankContextCandidates(db, prompt);
  if (options.refresh !== true || root === '') return ranking;
  const limit = Number.isInteger(options.candidateLimit) && options.candidateLimit >= 0
    ? options.candidateLimit
    : WARM_CANDIDATE_LIMIT;
  let warm;
  try {
    const candidates = [
      ...new Set([
        ...probeCandidates(root, prompt, limit),
        ...ranking.slice(0, limit).map((candidate) => candidate.path),
      ]),
    ].sort(byPath);
    warm = refreshIndex(db, root, candidates, {
      chunkLines: options.chunkLines,
      maxFileBytes: options.maxFileBytes,
    });
  } catch (error) {
    warm = { contract: WARM_CONTRACT, error: error?.message ?? String(error) };
  }
  if (onRefresh !== null) {
    try {
      onRefresh(warm);
    } catch { /* die Senke ist Diagnose, kein Vertrag */ }
  }
  const changed = warm?.error === undefined && (warm.written > 0 || warm.removed > 0);
  return changed ? rankContextCandidates(db, prompt) : ranking;
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

  const ranked = rankedForQuery(db, prompt, options);
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