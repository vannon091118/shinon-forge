/**
 * shinon-prompter-runtime-index — Index-Manager für den Prompter.
 *
 * Der Prompter pflegt SEINEN EIGENEN Index: hash-basiert, speichert Dateien
 * als { path, content, hash, tokens }, liefert Kontext passend zum Prompt.
 *
 * Keine Abhängigkeit vom Project Index mehr — der Prompter bleibt funktionsfähig,
 * auch wenn project-index nicht verfügbar ist.
 *
 * Persistenz: JSON-Datei auf Disk (load/save). Alle Operationen synchron.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, isAbsolute, dirname } from 'node:path';

/** Vertragsname des Runtime-Indexes. */
export const RUNTIME_INDEX_CONTRACT = 'shinon.prompter/runtime-index/v1';

/**
 * Service-Name unter dem der Prompter seinen Index anbietet.
 * Extern lesbar, aber NICHT Teil des Gate-Vertrags (kein inject).
 */
export const RUNTIME_INDEX_SERVICE = 'shinon_prompter_index';

/** Default-Pfad für die Index-Datei (relativ zum Arbeitsverzeichnis). */
export const DEFAULT_INDEX_PATH = '.shinon/prompter-index.json';

/**
 * Zeichen je Token und Default-Budget — DIESELBEN Werte wie der Project Index
 * (Plan §14). Zwei Quellen für dieselbe Grenze wären zwei Wahrheiten: der
 * Kontextvertrag des Enhancers sagt „Budget in Token", und beide Indexe
 * müssen dieselbe Rechnung benutzen.
 */
export const CHARS_PER_TOKEN = 4;
export const DEFAULT_CONTEXT_BUDGET = 6000;

/**
 * Obergrenze der Token-Treffer je Prompt-Wort und Datei.
 *
 * Häufigkeit ist ein echtes Relevanzsignal (eine Datei, die ein Wort oft
 * nennt, gehört eher dazu) — aber ohne Grenze entscheidet die GRÖSSE: gemessen
 * am 2026-10-16 hatte package-lock.json (521 512 Zeichen) zehntausende Tokens,
 * die auf "js" oder "der" passten, und stand damit auf Rang 1 für einen Prompt
 * über den Prompter. Drei Treffer je Wort sind genug Signal, ohne dass eine
 * Datei allein durch ihren Umfang gewinnt.
 */
export const MAX_TOKEN_HITS = 3;

/**
 * Djb2-Hash (synchron, schnell genug für Dateiinhalt).
 * Keine kryptographischen Anforderungen — der Hash dient der Change-Erkennung,
 * nicht der Sicherheit.
 */
export function simpleHash(text) {
  let hash = 5381;
  const str = String(text ?? '');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

/**
 * Tokenisierung — denselben Algorithmus wie note-core.tokens, damit
 * Index-Tokens und Haystack-Tokens vergleichbar bleiben.
 */
export function tokenize(text, minLength = 4) {
  const tokens = [];
  const words = String(text ?? '').split(/[^A-Za-z0-9_äöüÄÖÜß]+/);
  for (const word of words) {
    if (word.length >= minLength) tokens.push(word.toLocaleLowerCase());
  }
  return tokens;
}

/**
 * Eine einzelne Datei in den Index aufnehmen.
 * Liest den Inhalt, berechnet Hash + Tokens, speichert.
 * Gibt null zurück, wenn die Datei nicht lesbar ist.
 */
export function indexFile(index, filePath, content, now = Date.now()) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  if (typeof content !== 'string') return null;

  const hash = simpleHash(content);
  const tokens = tokenize(content);

  // Bereits vorhanden? — nur updaten, wenn sich etwas geändert hat.
  const existing = index.entries.get(filePath);
  if (existing && existing.hash === hash) return null;

  index.entries.set(filePath, {
    path: filePath,
    content,
    hash,
    tokens,
    indexedAt: now,
  });
  index.modifiedAt = now;
  return { path: filePath, hash, tokens };
}

/**
 * Datei aus dem Index entfernen. Gibt true zurück, wenn sie vorhanden war.
 */
export function removeFile(index, filePath) {
  const existed = index.entries.has(filePath);
  index.entries.delete(filePath);
  if (existed) index.modifiedAt = Date.now();
  return existed;
}

/**
 * Prüfen, ob eine Datei im Index vorhanden ist (mit aktuellem Hash).
 */
export function isIndexed(index, filePath, content) {
  const entry = index.entries.get(filePath);
  if (!entry) return false;
  if (typeof content === 'string') {
    return entry.hash === simpleHash(content);
  }
  return true;
}

/**
 * An der Zeilengrenze schneiden. Ein Kontext, der mitten in einer Zeile endet,
 * ist ein halber Ausdruck; ein ganzer Zeilenrest ist wenigstens lesbar.
 * Dieselbe Regel wie im Project Index — sonst wäre derselbe Vertrag zweimal
 * verschieden erfüllt.
 */
function cutAtLine(text, room) {
  if (room <= 0) return '';
  if (text.length <= room) return text;
  const cut = text.slice(0, room);
  const lastBreak = cut.lastIndexOf('\n');
  return lastBreak === -1 ? cut : cut.slice(0, lastBreak + 1);
}

/**
 * Den Kontext für einen Prompt zusammenstellen.
 *
 * Liefert alles, was zum Prompt passt — dateipfadt-basiert UND token-basiert.
 * Maximal `maxFiles` Dateien UND höchstens `budgetTokens` (Default §14) —
 * beides zusammen, weil eins allein nicht reicht: `maxFiles` begrenzt die
 * Anzahl, nicht die Grösse, und 20 grosse Dateien sind mehr Inhalt als ein
 * Modellaufruf in seinem Zeitlimit verarbeiten kann.
 *
 * GEMESSEN 2026-10-16 (echter Profil-Lauf): ohne Budget baute der Prompter für
 * einen 132-Zeichen-Prompt eine Nutzer-Nachricht von 1 457 948 Zeichen
 * (package-lock.json 521 512, client.js 130 353, …). Der Aufruf lief in sein
 * eigenes 15-s-Limit, die Antwort kam leer zurück und jedes Verwerfen hiess
 * `NO_JSON` — der Enhancer kam in MAX nie an. Deshalb: harte Grenze wie §14.
 *
 * ZWEI REGELN, die zusammen die Ursache treffen:
 *   1. Ein Prompt-Wort zählt je Datei höchstens MAX_TOKEN_HITS-mal (nicht je
 *      Vorkommen im Tokenhaufen dieser Datei). Vorher gewann eine Datei durch
 *      Grösse: package-lock.json hatte zehntausende Tokens, die alle auf "js"
 *      oder "der" passten, und damit Rang 1 für einen Prompt über den Prompter.
 *   2. Das Budget wird nach Anteil verteilt (dieselbe Fairshare-Rechnung wie
 *      der Project Index), damit eine genannte grosse Datei die kleine
 *      genannte nicht verdrängt.
 */
export function getContext(index, promptText, options = {}) {
  const maxFiles = typeof options.maxFiles === 'number' ? options.maxFiles : 20;
  const budget = Math.max(
    0,
    Number.isFinite(options.budgetTokens) ? options.budgetTokens : DEFAULT_CONTEXT_BUDGET,
  );
  const charBudget = budget * CHARS_PER_TOKEN;
  const promptTokens = tokenize(promptText, 2); // kürzerer MinLength für Treffer

  const scored = [];
  for (const [, entry] of index.entries) {
    if (typeof entry.content !== 'string') continue;
    let score = 0;
    // Pfad-Treffer (exakt)
    for (const token of promptTokens) {
      if (entry.path.toLocaleLowerCase().includes(token)) score += 3;
    }
    // Token-Treffer (Präfix: "test" trifft auf "tests", "testen", ...) — je
    // Prompt-Wort höchstens MAX_TOKEN_HITS Punkte pro Datei.
    const hits = new Map();
    for (const pt of new Set(entry.tokens)) {
      for (const token of promptTokens) {
        if (!(pt.startsWith(token) || token.startsWith(pt))) continue;
        const seen = hits.get(token) ?? 0;
        if (seen >= MAX_TOKEN_HITS) continue;
        hits.set(token, seen + 1);
        score += 1;
      }
    }
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || (a.entry.path < b.entry.path ? -1 : 1));
  // Nur Dateien mit echtem Treffer (score > 0) — sonst liefert der Index
  // bei keinem Match alle Einträge und verfälscht den Kontext.
  const ranked = scored.filter((s) => s.score > 0).slice(0, maxFiles);

  // Fairshare in GANZEN Zeichen: jede Datei bekommt den Anteil ihres Rangs,
  // eine zu grosse wird geschnitten statt ausgelassen, und ein grösseres
  // Budget liefert immer eine Obermenge.
  const files = [];
  let used = 0;
  let charsLeft = charBudget;
  let scoreLeft = ranked.reduce((sum, candidate) => sum + candidate.score, 0);
  for (const candidate of ranked) {
    const allowance = scoreLeft <= 0 ? 0 : Math.floor(charsLeft * (candidate.score / scoreLeft));
    scoreLeft -= candidate.score;
    const room = Math.min(allowance, charsLeft - (files.length === 0 ? 0 : 1));
    if (room <= 0) continue;
    const content = cutAtLine(candidate.entry.content, room);
    if (content === '') continue;
    files.push({ path: candidate.entry.path, content });
    used += content.length;
    charsLeft = charBudget - used - files.length;
  }

  return {
    files,
    // Symbole nur aus den Dateien, die WIRKLICH im Kontext stehen: was oben
    // weggeschnitten wurde, hat der Aufrufer nicht gesehen.
    symbols: [...new Set(files.flatMap((file) => (index.entries.get(file.path)?.tokens ?? []).slice(0, 20)))],
    count: files.length,
    totalEntries: index.entries.size,
    chars: files.reduce((sum, file) => sum + file.content.length, 0),
    budgetTokens: budget,
  };
}

/**
 * Einen neuen, leeren Index erstellen.
 */
export function createIndex() {
  return {
    contract: RUNTIME_INDEX_CONTRACT,
    version: 1,
    entries: new Map(),
    indexedAt: Date.now(),
    modifiedAt: null,
  };
}

/**
 * Index aus einer JSON-Datei laden.
 * Wirft bei ungültigem Format.
 */
export function loadIndex(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`runtime-index: ungültiges JSON in ${path}`);
  }
  if (parsed?.contract !== RUNTIME_INDEX_CONTRACT) {
    throw new Error(`runtime-index: falscher Vertrag ${JSON.stringify(parsed?.contract)}`);
  }
  if (!Array.isArray(parsed?.entries)) {
    throw new Error('runtime-index: entries fehlt oder ist kein Array');
  }
  // Map aus Array rekonstruieren
  const entries = new Map();
  for (const e of parsed.entries) {
    if (e?.path && typeof e.content === 'string') {
      entries.set(e.path, e);
    }
  }
  return {
    contract: RUNTIME_INDEX_CONTRACT,
    version: 1,
    entries,
    indexedAt: parsed.indexedAt ?? Date.now(),
    modifiedAt: parsed.modifiedAt ?? null,
  };
}

/**
 * Index in eine JSON-Datei schreiben.
 * Erstellt das Verzeichnis, falls nicht vorhanden.
 */
export function saveIndex(index, path) {
  if (!index || index.contract !== RUNTIME_INDEX_CONTRACT) return;
  const dir = isAbsolute(path) ? join(path, '..') : join(process.cwd(), path, '..');
  try {
    mkdirSync(dir, { recursive: true });
  } catch { /* existiert bereits oder kein Zugriff — egal */ }
  const data = {
    contract: RUNTIME_INDEX_CONTRACT,
    version: 1,
    entries: [...index.entries.values()],
    indexedAt: index.indexedAt,
    modifiedAt: index.modifiedAt,
  };
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Alle .js/.mjs/.ts/.json/.yml/.yaml/.md-Dateien in einem Verzeichnis
 * rekursiv einlesen und in den Index aufnehmen.
 */
export function indexDirectory(index, dirPath, extensions = null, now = Date.now()) {
  if (typeof dirPath !== 'string' || dirPath === '') return { indexed: 0, skipped: 0, errors: [] };
  const exts = extensions ?? ['.js', '.mjs', '.ts', '.json', '.yml', '.yaml', '.md', '.cjs'];
  const skip = new Set(['node_modules', '.git', '.shinon', 'dist', 'build', 'coverage']);
  let indexed = 0;
  let skipped = 0;
  const errors = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const full = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!exts.some((ext) => entry.name.endsWith(ext))) continue;
      let content;
      try {
        content = readFileSync(full, 'utf8');
      } catch (err) {
        errors.push({ path: full, reason: `NICHT_LESBAR:${err?.code ?? 'ERROR'}` });
        continue;
      }
      const rel = join(process.cwd(), full);
      const result = indexFile(index, rel, content, now);
      if (result) indexed++;
      else skipped++;
    }
  }

  walk(dirPath);
  return { indexed, skipped, errors };
}

/**
 * Eine JSON-Datei schreiben — der EINE Schreibweg des Pakets.
 *
 * Der Isolationstest verlangt, dass die Host-Komposition (`index.js`) und die
 * One-Shot-Kerne kein Dateisystem öffnen; dieses Modul ist die benannte
 * Ausnahme und schreibt bereits den Runtime-Index. Die gelernte Baustein-Ablage
 * (Phase 4) nimmt denselben Weg statt einer zweiten Schreibstelle: ein Pfad,
 * ein `mkdir`, ein `write` — und die Grenze bleibt an genau einer Stelle
 * sichtbar, statt sie pro Aufrufer neu zu ziehen.
 *
 * Ein absoluter Pfad bleibt absolut (dieselbe Regel wie bei Zetteln/Skills).
 */
export function writeJsonFile(path, value) {
  const full = isAbsolute(path) ? path : join(process.cwd(), path);
  try {
    mkdirSync(dirname(full), { recursive: true });
  } catch { /* existiert bereits oder kein Zugriff — egal */ }
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Fragewörter, mit denen ein Prompt eine Frage ist statt einer Aufgabe. */
const QUESTION_WORDS = new Set([
  'was', 'wie', 'warum', 'wieso', 'weshalb', 'wer', 'wo', 'wann', 'welche', 'welcher', 'welches',
  'welchem', 'welchen', 'wieviel', 'wieviele', 'kann', 'kannst', 'können', 'ist', 'sind', 'hat', 'haben', 'gibt',
  'why', 'how', 'what', 'which', 'who', 'where', 'when', 'can', 'could', 'is', 'are', 'was', 'were', 'should', 'does', 'do', 'did',
]);

/** Eine Frage endet mit `?` oder beginnt mit einem Fragewort. */
function isQuestion(text) {
  if (text.endsWith('?')) return true;
  const first = text.split(/[^\p{L}\p{N}]+/u)[0] ?? '';
  return QUESTION_WORDS.has(first);
}

/**
 * Ein Trigger gilt als GANZE Phrase, nicht als Substring: `test` trifft nicht
 * `Testament`, `doc` nicht `docker`. Unicode-Grenzen, damit Umlaute zählen.
 */
function hasPhrase(text, trigger) {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(text);
}

/**
 * Prüfen, ob ein Prompt einem der bekannten Intent-Patterns entspricht.
 * Gibt { matched, patternId, label, expansion, classification } oder null.
 *
 * Zwei Regeln, beide fail-closed gegenüber der Nutzerabsicht:
 *   1. Trigger sind Handlungsphrasen (Daten), keine Themenwörter — ein Satz
 *      über Tests ist kein Auftrag, Tests zu schreiben.
 *   2. Eine Frage wird höchstens KLASSIFIZIERT, nie erweitert: `expansion` ist
 *      dann leer, und der Aufrufer hängt keinen `# Aufgabe`-Block an. Sonst
 *      beantwortet der Agent die Frage nicht, sondern erfindet eine Aufgabe.
 *
 * Score-basiert: Patterns mit mehreren Phrasentreffern gewinnen vor solchen
 * mit nur einem.
 */
export function matchIntent(promptText, rules) {
  if (!rules || !Array.isArray(rules.patterns)) return null;
  const text = String(promptText ?? '').toLocaleLowerCase().trim();
  if (text === '') return null;

  let best = null;
  let bestScore = 0;
  for (const pattern of rules.patterns) {
    let score = 0;
    for (const trigger of (Array.isArray(pattern.trigger) ? pattern.trigger : [])) {
      if (hasPhrase(text, String(trigger).toLocaleLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = {
        matched: true,
        patternId: pattern.id,
        label: pattern.label,
        expansion: pattern.expansion ?? '',
        classification: pattern.classification ?? 'MULTI_STEP_TASK',
      };
    }
  }
  if (best !== null && isQuestion(text)) return { ...best, expansion: '' };
  return best;
}
