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
import { join, isAbsolute } from 'node:path';

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
 * Den Kontext für einen Prompt zusammenstellen.
 *
 * Liefert alles, was zum Prompt passt — dateipfadt-basiert UND token-basiert.
 * Maximal `maxFiles` Dateien, damit der Kontext nicht explodiert.
 * Matching: Token-Präfix (also "test" trifft auf "tests"), nicht nur exakte Gleichheit.
 */
export function getContext(index, promptText, options = {}) {
  const maxFiles = typeof options.maxFiles === 'number' ? options.maxFiles : 20;
  const promptTokens = tokenize(promptText, 2); // kürzerer MinLength für Treffer

  const scored = [];
  for (const [, entry] of index.entries) {
    let score = 0;
    // Pfad-Treffer (exakt)
    for (const token of promptTokens) {
      if (entry.path.toLocaleLowerCase().includes(token)) score += 3;
    }
    // Token-Treffer (Präfix: "test" trifft auf "tests", "testen", ...)
    for (const pt of entry.tokens) {
      for (const token of promptTokens) {
        if (pt.startsWith(token) || token.startsWith(pt)) score += 1;
      }
    }
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  // Nur Dateien mit echtem Treffer (score > 0) — sonst liefert der Index
  // bei keinem Match alle Einträge und verfälscht den Kontext.
  const selected = scored.filter((s) => s.score > 0).slice(0, maxFiles).map((s) => s.entry);

  return {
    files: selected.map((e) => ({ path: e.path, content: e.content })),
    symbols: [...new Set(selected.flatMap((e) => e.tokens.slice(0, 20)))],
    count: selected.length,
    totalEntries: index.entries.size,
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
 * Prüfen, ob ein Prompt einem der bekannten Intent-Patterns entspricht.
 * Gibt { matched, pattern, expansion, classification } oder null.
 *
 * Score-basiert: Patterns mit mehreren Trigger-Treffern gewinnen vor solchen
 * mit nur einem. "update doku" trifft zweimal auf update-docs, einmal auf
 * documentation — also gewinnt update-docs.
 */
export function matchIntent(promptText, rules) {
  if (!rules || !Array.isArray(rules.patterns)) return null;
  const lower = String(promptText ?? '').toLocaleLowerCase().trim();
  if (lower === '') return null;

  let best = null;
  let bestScore = 0;
  for (const pattern of rules.patterns) {
    let score = 0;
    for (const trigger of (Array.isArray(pattern.trigger) ? pattern.trigger : [])) {
      if (lower.includes(trigger.toLocaleLowerCase())) score += 1;
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
  return best;
}
