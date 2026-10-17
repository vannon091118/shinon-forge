/**
 * block-select.test.mjs — der Baustein-Selektor (Phase 2).
 *
 * Gepinnt wird: Registry lädt und prüft, Pflicht steht immer, Modus filtert,
 * Haystack/Intent/Trigger lösen aus, Budgets deckeln, Auswahl ist
 * deterministisch, der Entscheidungsanteil trägt keinen Prompt-Text, und das
 * Modul nutzt kein Modell (statisch geprüft).
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig
 * (das Modul hat keine Imports — dieselbe Regel wie note-core).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOCKS_CONTRACT,
  candidateBlocks,
  decisionBlocks,
  matchBlock,
  selectBlocks,
  validateRegistry,
} from '../assets/block-select.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const REGISTRY = JSON.parse(readFileSync(join(DIR, '../assets/blocks.json'), 'utf8'));

const AVAILABLE = {
  contextPresent: true,
  notesOn: true,
  skillsOn: true,
  intentOn: true,
  narrative: true,
  recentEvents: [],
};

const CONTEXT = {
  project: 'shinon-forge',
  files: [{ path: 'packages/persona/index.js', content: '' }],
  symbols: ['apply'],
  constraints: [],
  touches: [],
  dependencies: [],
};

test('registry: die echte blocks.json lädt und prüft', () => {
  assert.equal(REGISTRY.contract, BLOCKS_CONTRACT);
  assert.deepEqual(validateRegistry(REGISTRY), { ok: true });
  assert.deepEqual(validateRegistry(null), { ok: false, reason: 'KEIN_OBJEKT' });
  assert.deepEqual(
    validateRegistry({ ...REGISTRY, contract: 'fremd/v9' }).ok,
    false,
  );
  const doubled = {
    ...REGISTRY,
    blocks: [...REGISTRY.blocks, REGISTRY.blocks[0]],
  };
  assert.match(validateRegistry(doubled).reason, /^ID_DOPPELT:/);
});

test('selektor: Pflicht steht immer — auch in MIN mit leerem Prompt', () => {
  const selection = selectBlocks(REGISTRY, { mode: 'MIN', promptText: '', context: null, available: {} });
  const ids = selection.selected.map((entry) => entry.id);
  assert.ok(ids.includes('persona-identity-core'), 'Identitätskern fehlt');
  assert.ok(ids.includes('enhancer-system-policy'), 'System-Policy fehlt');
  assert.ok(selection.totalTokens <= 900, `Pflicht sprengt 900 (ist ${selection.totalTokens})`);
});

test('selektor: Modus filtert — MAX-Bausteine laden in MIN nicht', () => {
  const selection = selectBlocks(REGISTRY, {
    mode: 'MIN',
    promptText: 'fix den bug im determinismus seed',
    context: CONTEXT,
    available: AVAILABLE,
  });
  const skipped = Object.fromEntries(selection.skipped.map((entry) => [entry.id, entry.reason]));
  assert.equal(skipped['index-project-context'], 'MODUS_FREMD');
  assert.equal(skipped['persona-project-context'], 'MODUS_FREMD');
  assert.ok(!selection.selected.some((entry) => entry.id === 'index-project-context'));
});

test('selektor: Haystack löst situativ aus (Code-Änderung, Determinismus)', () => {
  const selection = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'refaktoriere den seed-zufall, deterministisch mit replay',
    context: CONTEXT,
    available: AVAILABLE,
  });
  const ids = selection.selected.map((entry) => entry.id);
  assert.ok(ids.includes('persona-change-classes'), `change-classes fehlt (${ids.join(',')})`);
  assert.ok(ids.includes('persona-determinism'), `determinism fehlt (${ids.join(',')})`);
  // Leerer Prompt, leere Welt: kein situativer Baustein ohne Anlass.
  const quiet = selectBlocks(REGISTRY, { mode: 'MAX', promptText: 'hallo', context: null, available: {} });
  assert.ok(!quiet.selected.some((entry) => entry.id === 'persona-change-classes'));
});

test('selektor: Selbstfrage löst Identitäts-Bausteine, Intent die Report-Klasse', () => {
  const asked = selectBlocks(REGISTRY, {
    mode: 'MIN',
    promptText: 'Shinon, wer bist du eigentlich?',
    context: null,
    available: {},
  });
  const ids = asked.selected.map((entry) => entry.id);
  assert.ok(ids.includes('persona-identity-overview'), `overview fehlt (${ids.join(',')})`);
  assert.ok(ids.includes('persona-identity-trigger'), `trigger fehlt (${ids.join(',')})`);

  const reported = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'berichte den stand',
    context: CONTEXT,
    intentClass: 'MULTI_STEP_TASK',
    available: AVAILABLE,
  });
  assert.ok(reported.selected.some((entry) => entry.id === 'persona-report'));
});

test('selektor: Haltung und Ereignis lösen aus', () => {
  const stance = selectBlocks(REGISTRY, {
    mode: 'MID',
    promptText: 'ist das so richtig?',
    context: null,
    stance: 'kritisch',
    available: {},
  });
  assert.ok(stance.selected.some((entry) => entry.id === 'persona-epistemic'));

  const blocked = selectBlocks(REGISTRY, {
    mode: 'MID',
    promptText: 'es geht nicht weiter',
    context: null,
    available: { recentEvents: ['action.blocked'] },
  });
  assert.ok(blocked.selected.some((entry) => entry.id === 'persona-workaround'));
});

test('selektor: Budget deckelt Situatives, nie Pflicht — deterministisch', () => {
  const first = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'refaktoriere commit branch merge seed replay bericht',
    context: CONTEXT,
    intentClass: 'MULTI_STEP_TASK',
    available: { ...AVAILABLE, recentEvents: ['action.blocked'] },
    totalBudgetTokens: 1000,
  });
  const second = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'refaktoriere commit branch merge seed replay bericht',
    context: CONTEXT,
    intentClass: 'MULTI_STEP_TASK',
    available: { ...AVAILABLE, recentEvents: ['action.blocked'] },
    totalBudgetTokens: 1000,
  });
  assert.deepEqual(first, second, 'gleiche Eingabe, gleiche Auswahl');
  const ids = first.selected.map((entry) => entry.id);
  assert.ok(ids.includes('persona-identity-core'), 'Pflicht weicht nie dem Budget');
  assert.ok(first.skipped.some((entry) => entry.reason === 'BUDGET_ERSCHOEPFT'), 'kein Budget-Schnitt meldet sich');
  assert.ok(first.totalTokens >= 900 && first.totalTokens <= 1000 + 600, `Deckel verletzt (${first.totalTokens})`);
});

test('selektor: Quellen-Gate — ohne Kontext kein Index-Block, ohne Skills kein Skill-Block', () => {
  const selection = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'refaktoriere den code',
    context: null,
    available: { contextPresent: false, notesOn: false, skillsOn: false, intentOn: false, narrative: false },
  });
  const skipped = Object.fromEntries(selection.skipped.map((entry) => [entry.id, entry.reason]));
  assert.equal(skipped['index-project-context'], 'QUELLE_FEHLT:kontext');
  assert.equal(skipped['stand-zettel'], 'QUELLE_FEHLT:zettel');
  assert.equal(skipped['skills-block'], 'QUELLE_FEHLT:skills');
  assert.equal(skipped['intent-expansion'], 'QUELLE_FEHLT:intent');
});

test('selektor: matchBlock kennt jede Richtung einzeln', () => {
  const block = REGISTRY.blocks.find((entry) => entry.id === 'persona-change-classes');
  assert.equal(matchBlock(block, { mode: 'MIN' }).reason, 'MODUS_FREMD');
  const hit = matchBlock(block, { mode: 'MAX', promptText: 'refaktor commit', haystack: ['refaktor commit'], words: new Set(['refaktor', 'commit']) });
  assert.equal(hit.selected, true);
  assert.match(hit.reason, /^HAYSTACK:/);
});

test('selektor: Gewicht bricht Gleichstand, schlägt nie Treffer', () => {
  // 'commit' trifft change-classes UND discipline je einmal — Gleichstand.
  const tie = { mode: 'MAX', promptText: 'commit replay', context: null, available: {} };
  const plain = selectBlocks(REGISTRY, tie).selected.map((entry) => entry.id);
  assert.ok(plain.includes('persona-change-classes') && plain.includes('persona-discipline'), 'Gleichstand als Basis');
  const weights = {
    'persona-change-classes': { up: 0, down: 5 },
    'persona-discipline': { up: 5, down: 0 },
  };
  const learned = selectBlocks(REGISTRY, { ...tie, weights }).selected.map((entry) => entry.id);
  assert.ok(
    learned.indexOf('persona-discipline') < learned.indexOf('persona-change-classes'),
    `Gleichstand bricht das Gewicht (${learned.join(',')})`,
  );
  // 'seed' gibt determinism ZWEI Treffer — kein Gewicht der Welt überholt das.
  const ahead = selectBlocks(REGISTRY, {
    ...tie,
    promptText: 'commit replay seed',
    weights: { 'persona-change-classes': { up: 99, down: 0 } },
  }).selected.map((entry) => entry.id);
  assert.ok(ahead.indexOf('persona-determinism') < ahead.indexOf('persona-change-classes'), 'Treffer schlägt Gewicht');
  // Unbekannte Ids im Gewicht ändern nichts (fail-closed).
  const foreign = selectBlocks(REGISTRY, { ...tie, weights: { fremd: { up: 99, down: 0 } } });
  assert.deepEqual(foreign.selected.map((entry) => entry.id), plain, 'fremdes Gewicht wirkt nicht');
  assert.deepEqual(selectBlocks(REGISTRY, { ...tie, weights: null }).selected.map((entry) => entry.id), plain);
});

test('selektor: Kandidaten sind Modus + Quelle, nicht der Auslöser', () => {
  const candidates = candidateBlocks(REGISTRY, {
    mode: 'MAX',
    available: { contextPresent: true, notesOn: false, skillsOn: false, intentOn: false, narrative: false },
  }).map((block) => block.id);
  // Die Quelle ist an: der Kandidat steht zur Wahl, obwohl kein Marker feuert.
  assert.ok(candidates.includes('index-project-context'));
  assert.ok(candidates.includes('persona-workaround'));
  // Die Quelle ist aus: kein Kandidat, egal welcher Modus.
  assert.ok(!candidates.includes('stand-zettel'));
  assert.ok(!candidates.includes('skills-block'));
  // Der Modus ist der zweite Deckel: MAX-Bausteine sind in MIN keine Kandidaten.
  const min = candidateBlocks(REGISTRY, { mode: 'MIN', available: {} }).map((block) => block.id);
  assert.ok(!min.includes('index-project-context'));
  assert.ok(min.includes('persona-identity-core'));
});

test('selektor: Agentenvorschlag wählt auch unausgelöste Kandidaten, Pflicht bleibt', () => {
  const base = { mode: 'MAX', promptText: 'refaktoriere den code', context: CONTEXT, available: AVAILABLE };
  const plain = selectBlocks(REGISTRY, base);
  assert.ok(!plain.selected.some((entry) => entry.id === 'persona-workaround'), 'ohne Agent kein Workaround');

  const proposed = selectBlocks(REGISTRY, { ...base, includeIds: ['persona-workaround'] });
  const ids = proposed.selected.map((entry) => entry.id);
  assert.ok(ids.includes('persona-workaround'), `Agentenwahl fehlt (${ids.join(',')})`);
  assert.ok(ids.includes('persona-identity-core') && ids.includes('enhancer-system-policy'), 'Pflicht bleibt');
  assert.equal(proposed.selected.find((entry) => entry.id === 'persona-workaround').reason, 'AGENT');
  // Ein ausgelöster, aber nicht gewählter Kandidat wird BENANNT, nicht still fallen gelassen.
  assert.ok(proposed.skipped.some((entry) => entry.id === 'persona-change-classes' && entry.reason === 'AGENT_ABGELEHNT'));
});

test('selektor: Agentenvorschlag überschreibt weder Modus noch Quelle noch Budget', () => {
  const min = selectBlocks(REGISTRY, {
    mode: 'MIN',
    promptText: '',
    context: null,
    available: {},
    includeIds: ['index-project-context', 'persona-change-classes'],
  });
  const minSkipped = Object.fromEntries(min.skipped.map((entry) => [entry.id, entry.reason]));
  assert.equal(minSkipped['index-project-context'], 'MODUS_FREMD');
  assert.equal(minSkipped['persona-change-classes'], 'MODUS_FREMD');

  const off = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: '',
    context: null,
    available: { contextPresent: false, notesOn: false, skillsOn: false, intentOn: false, narrative: false },
    includeIds: ['stand-zettel'],
  });
  assert.equal(Object.fromEntries(off.skipped.map((entry) => [entry.id, entry.reason]))['stand-zettel'], 'QUELLE_FEHLT:zettel');

  const unknown = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'hallo',
    context: CONTEXT,
    available: AVAILABLE,
    includeIds: ['gibt-es-nicht'],
  });
  assert.ok(unknown.skipped.some((entry) => entry.id === 'gibt-es-nicht' && entry.reason === 'AGENT_UNBEKANNT'));

  const tight = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'refaktoriere den code',
    context: CONTEXT,
    available: AVAILABLE,
    includeIds: ['persona-change-classes', 'persona-determinism'],
    totalBudgetTokens: 900,
  });
  assert.ok(tight.selected.every((entry) => entry.reason === 'PFLICHT'), 'Budget schneidet Agentenwahl');
  assert.ok(tight.skipped.some((entry) => entry.id === 'persona-determinism' && entry.reason === 'BUDGET_ERSCHOEPFT'));
});

test('selektor: ein leerer Agentenvorschlag fällt auf denselben deterministischen Weg zurück', () => {
  const base = { mode: 'MAX', promptText: 'refaktoriere commit seed', context: CONTEXT, available: AVAILABLE };
  assert.deepEqual(
    selectBlocks(REGISTRY, { ...base, includeIds: [] }).selected.map((entry) => entry.id),
    selectBlocks(REGISTRY, base).selected.map((entry) => entry.id),
  );
  assert.deepEqual(
    selectBlocks(REGISTRY, { ...base, includeIds: null }).selected.map((entry) => entry.id),
    selectBlocks(REGISTRY, base).selected.map((entry) => entry.id),
  );
});

test('entscheidungsanteil: die Quellen-Spalte nennt je Id die Herkunft', () => {
  const record = decisionBlocks(selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'refaktoriere den code',
    context: CONTEXT,
    available: AVAILABLE,
  }));
  assert.equal(record.blockSources.length, record.blocks.length, 'eine Quelle je gewählter Id');
  assert.ok(record.blocks.every((id) => typeof id === 'string'), 'blocks bleibt die reine Id-Spalte (Ledger-Vertrag)');
  assert.ok(record.blockSources.includes('persona-identity-core:persona'));
  for (const entry of record.blockSources) {
    const [id, quelle] = entry.split(':');
    assert.ok(record.blocks.includes(id));
    assert.notEqual(quelle, 'unbekannt', `Quelle fehlt für ${id}`);
  }
});

test('entscheidungsanteil: nur Ids und Gründe — nie Prompt-Text', () => {
  const selection = selectBlocks(REGISTRY, {
    mode: 'MAX',
    promptText: 'GEHEIMES passwort refaktoriere den code',
    context: CONTEXT,
    available: AVAILABLE,
  });
  const record = decisionBlocks(selection);
  const json = JSON.stringify(record);
  assert.ok(!json.includes('GEHEIMES'), 'Prompt-Text im Datensatz');
  assert.ok(!json.includes('passwort'), 'Prompt-Text im Datensatz');
  assert.ok(Array.isArray(record.blocks) && record.blocks.length > 0);
  assert.equal(decisionBlocks(null), null, 'ohne Auswahl kein Anteil');
});

test('selektor: kein Modell — statisch gepinnt', () => {
  const source = readFileSync(join(DIR, '../assets/block-select.js'), 'utf8');
  assert.ok(!source.includes('ctx.llm'), 'Modellzugriff im Selektor');
  assert.ok(!source.includes('llm.stream'), 'Modellzugriff im Selektor');
  assert.ok(!source.includes('from '), 'der Selektor hat keine Imports');
  assert.ok(!source.includes('Date.now'), 'keine Uhr im Selektor');
  assert.ok(!source.includes('Math.random'), 'kein Zufall im Selektor');
});
