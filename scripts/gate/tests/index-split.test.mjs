/**
 * Der Schnitt des Index-Kerns (T2-5) — Fläche unverändert, Arbeit geteilt.
 *
 * `packages/project-index/assets/index-core.js` war 2 219 Zeilen; die Grenze des
 * Struktur-Riegels liegt bei 650. Der Schnitt folgt dem EIGENTUM:
 *
 *   index-format.js   Vertrag, Tabellen, Muster, DDL, Secret-Schutz
 *   index-extract.js  Baum, Spracherkennung, Symbole, Referenzen, Chunks
 *   index-store.js    Verbindung, Fassungsprüfung, meta, Speicher, FTS-Suche
 *   index-run.js      inkrementeller Lauf, Worker-Quelltext
 *   index-context.js  Warm-Pfad, Rangfolge, Zeichenbudget
 *
 * Drei Zusagen hält dieser Test fest, und jede ist schon einmal gebrochen worden
 * (in anderen Paketen): die ÖFFENTLICHE Fläche bleibt Name für Name dieselbe,
 * kein Teil importiert das Barrel (das wäre ein Zyklus), und kein Teil reißt
 * die Grenze. Was hier NICHT geprüft wird: ob ein Name im richtigen Teil liegt —
 * Eigentum ist eine Entscheidung, keine Heuristik.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages', 'project-index');
const ASSETS = join(PACKAGE_DIR, 'assets');
const PARTS = ['index-format.js', 'index-extract.js', 'index-store.js', 'index-run.js', 'index-context.js'];
const LIMIT = 650;

/** Die 69 Namen, die `@shinon/project-index` vor dem Schnitt exportierte — und danach. */
const PUBLIC_NAMES = [
  'CHARS_PER_TOKEN', 'CODE_EXTENSIONS', 'CONTEXT_PRIORITIES', 'CONTRACT', 'DEFAULT_CONTEXT_BUDGET',
  'DEFAULT_INDEX_ROOT', 'DEFAULT_LEDGER_FILE', 'DEPENDENCY_FIELDS', 'EDGE_PATTERNS', 'FTS_TABLE',
  'INDEXER_VERSION', 'INDEX_FILE', 'LANGUAGES', 'LEDGER_CONTRACT', 'MARKDOWN_HEADING',
  'MAX_CONTEXT_SYMBOLS', 'MAX_FTS_TERMS', 'MAX_REFERENCE_NAMES', 'MEMORY_TABLE', 'MEMORY_VERSION',
  'PARSERS', 'PRIMARY_TABLES', 'PROTECTED_PATH_RULES', 'REFERENCABLE_KINDS', 'RESERVED_WORDS',
  'SCAN_REASONS', 'SCHEMA', 'SCHEMA_VERSION', 'SECRET_PATTERNS', 'SECRET_TABLE', 'SKIP_DIRS',
  'SOURCE_EXTENSIONS', 'SYMBOL_PATTERNS', 'WARM_CANDIDATE_LIMIT', 'WARM_CONTRACT', 'chunkText',
  'createReferenceMatcher', 'estimateTokens', 'extractEdges', 'extractSymbols', 'findReferences',
  'findSecrets', 'indexMeta', 'indexPath', 'indexStats', 'inodeStamp', 'languageOf', 'listFiles',
  'migrateMemory', 'openIndex', 'openLedger', 'parserFor', 'probeCandidates', 'projectHash',
  'promptTokens', 'protectedReason', 'rankContextCandidates', 'readMemory', 'redactSecrets',
  'referenceNames', 'refreshIndex', 'resolveContext', 'runIndex', 'runIndexInWorker', 'searchChunks',
  'secretFindings', 'toProjectPath', 'updateIndex', 'writeMemory',
];

test('die oeffentliche Flaeche ist Name fuer Name dieselbe — 69 Namen', async () => {
  const core = await import(pathToFileURL(join(ASSETS, 'index-core.js')).href);
  assert.deepEqual(Object.keys(core).sort(), PUBLIC_NAMES);
});

test('jeder Teil haelt die Grenze 650 und traegt eigenen Code', () => {
  for (const part of PARTS) {
    const text = readFileSync(join(ASSETS, part), 'utf8');
    const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    assert.ok(lines > 20, `${part}: nur ${lines} Zeilen — ein Split in Scheiben ist keiner`);
    assert.ok(lines <= LIMIT, `${part}: ${lines} Zeilen über der Grenze ${LIMIT}`);
  }
});

test('kein Teil importiert das Barrel — das waere ein Zyklus', () => {
  for (const part of PARTS) {
    const text = readFileSync(join(ASSETS, part), 'utf8');
    assert.equal(/from ['"]\.\/index-core\.js['"]/.test(text), false, `${part} importiert das Barrel`);
  }
});

test('das Barrel re-exportiert jeden oeffentlichen Namen genau einmal', () => {
  const barrel = readFileSync(join(ASSETS, 'index-core.js'), 'utf8');
  const exported = [...barrel.matchAll(/export \{ ([^}]+) \} from/g)]
    .flatMap((match) => match[1].split(',').map((name) => name.trim()));
  assert.deepEqual(exported.slice().sort(), PUBLIC_NAMES, 'das Barrel nennt genau die Flaeche');
  assert.equal(new Set(exported).size, exported.length, 'und jeden Namen nur einmal');
  assert.equal(/export \*/.test(barrel), false, 'kein Stern-Re-Export: innere Helfer bleiben innen');
});

test('die fuenf Teile sind die einzigen index-*.js neben dem Barrel', () => {
  const found = readdirSync(ASSETS)
    .filter((name) => /^index-[a-z]+\.js$/.test(name) && name !== 'index-core.js')
    .sort();
  assert.deepEqual(found, PARTS.slice().sort());
});
