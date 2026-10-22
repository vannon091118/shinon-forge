/**
 * shinon-project-index — der Kern: Extraktion, Schema, inkrementeller Lauf, Worker.
 *
 * Diese Datei ist die OEFFENTLICHE FLAECHE des Kerns und sonst nichts: sie
 * re-exportiert namentlich, was vorher hier stand, und verteilt die Arbeit auf
 * fuenf Eigentuemer. Sie kennt keine Host-Abhaengigkeit, nur `node:*` — genau
 * deshalb kann ein Worker sie laden (Plan §12), waehrend er an einem Bare-Import
 * des Host-Pakets scheitern wuerde. Die Host-Haelfte (Config + apply) steht in
 * index.js.
 *
 * WARUM GETRENNT (2026-10-22, Audit T2-5): 2 220 Zeilen sind keine Datei, die
 * jemand am Stueck liest; die Grenze des Struktur-Riegels liegt bei 650. Die
 * Trennung folgt dem EIGENTUM, nicht der Zeilenzahl: `index-format.js` (Vertrag,
 * Muster, DDL, Secret-Schutz), `index-extract.js` (Baum, Parser, Referenzen,
 * Chunks), `index-store.js` (Datei, meta, Speicher, Suche), `index-run.js`
 * (inkrementeller Lauf, Worker) und `index-context.js` (Warm-Pfad, Rangfolge).
 * Die Namen der Flaeche sind unveraendert; `scripts/gate/tests/index-split.test.mjs`
 * haelt sie namentlich fest.
 */

export { CODE_EXTENSIONS, CONTRACT, DEFAULT_INDEX_ROOT, DEFAULT_LEDGER_FILE, EDGE_PATTERNS, FTS_TABLE, INDEXER_VERSION, INDEX_FILE, LANGUAGES, LEDGER_CONTRACT, MAX_REFERENCE_NAMES, MEMORY_TABLE, MEMORY_VERSION, PRIMARY_TABLES, PROTECTED_PATH_RULES, RESERVED_WORDS, SCHEMA, SCHEMA_VERSION, SECRET_PATTERNS, SECRET_TABLE, SKIP_DIRS, SOURCE_EXTENSIONS, SYMBOL_PATTERNS, findSecrets, protectedReason, redactSecrets } from './index-format.js';
export { DEPENDENCY_FIELDS, MARKDOWN_HEADING, PARSERS, REFERENCABLE_KINDS, SCAN_REASONS, chunkText, createReferenceMatcher, extractEdges, extractSymbols, findReferences, indexPath, inodeStamp, languageOf, listFiles, parserFor, projectHash, referenceNames, toProjectPath } from './index-extract.js';
export { indexMeta, indexStats, migrateMemory, openIndex, openLedger, readMemory, searchChunks, secretFindings, writeMemory } from './index-store.js';
export { runIndex, runIndexInWorker, updateIndex } from './index-run.js';
export { CHARS_PER_TOKEN, CONTEXT_PRIORITIES, DEFAULT_CONTEXT_BUDGET, MAX_CONTEXT_SYMBOLS, MAX_FTS_TERMS, WARM_CANDIDATE_LIMIT, WARM_CONTRACT, estimateTokens, probeCandidates, promptTokens, rankContextCandidates, refreshIndex, resolveContext } from './index-context.js';
