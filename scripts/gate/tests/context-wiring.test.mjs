#!/usr/bin/env node
/**
 * Abnahmetest der Naht „MAX Context Resolver → Prompt-Enhancer".
 *
 * Bisher war MAX an eine JSON-DATEI gebunden: ohne `contextPath` wurde der Modus
 * abgelehnt (MODE_NEEDS_CONTEXT). Der Index aus §14 kann denselben Kontext je
 * Prompt liefern — aber der Enhancer darf ihn nicht IMPORTIEREN: die Pakete
 * dieses Repos referenzieren einander nicht. Die Naht ist deshalb eine
 * Faehigkeit, die der Index ueber `ctx.provide` anbietet und der Enhancer
 * OPTIONAL ueber `ctx.get` liest (kein Injektionszwang — sonst waere der
 * Enhancer in einem Profil ohne Index gar nicht geladen).
 *
 * Vier Ebenen, bewusst getrennt:
 *   1. Die Faehigkeiten des Index: seit Zug 2 sind es ZWEI — die Abfrage
 *      (`resolveContext`, der Kontext fuer MAX) und die Ablage (`load`/`save`,
 *      das dauerhafte Gedaechtnis des Scorings). Jede ist schmal, jede hat
 *      ihren eigenen Vertragsnamen, und ohne Index gibt die Abfrage eine
 *      ehrliche Leere (null) statt eines leeren Index.
 *   2. Die Naht als Daten: Dienstname und Vertragsname stimmen in beiden Paketen
 *      ueberein — gepinnt von AUSSEN, weil kein Paket das andere liest.
 *   3. Der echte Durchlauf: beide Bundles an einem echten Cordis-Context, echter
 *      Waterfall agent/pre-step, echte Validierung des gelieferten Kontexts.
 *   4. Die Quelle im Datensatz: index | file | none — die Herkunft ist
 *      nachpruefbar, nicht geraten.
 *
 * Kein Netz, kein Modell, kein node_modules im Repo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';

const PACKAGES = ['prompter', 'project-index', 'scoring', 'persona', 'narrative', 'codingmon'];
const ROOT = new URL('../../../', import.meta.url);

/** Beide Bundles isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation. */
async function loadBundles() {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
  const require = createRequire(join(root, 'package.json'));
  const work = mkdtempSync(join(tmpdir(), 'shinon-wiring-test-'));
  for (const name of PACKAGES) cpSync(new URL(`packages/${name}/`, ROOT), join(work, name), { recursive: true });
  provideSeamCore(work);
  const shim = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  const loaded = {};
  for (const name of PACKAGES) loaded[name] = await import(pathToFileURL(join(work, name, 'index.js')).href);
  return { loaded, work, require };
}

const { loaded, work } = await loadBundles();
process.on('exit', () => {
  try {
    rmSync(work, { recursive: true, force: true });
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Aufraeumen ist Beiwerk */
  }
});
const prompter = loaded.prompter;
const index = loaded['project-index'];
const scoring = loaded.scoring;
const persona = loaded.persona;
const narrative = loaded.narrative;
const codingmon = loaded.codingmon;
const dshRequire = createRequire(join(dshRoot(), 'package.json'));
const { Context } = await import(pathToFileURL(dshRequire.resolve('@deepseek-ai/cordis')).href);

function quiet(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

let workCount = 0;
const tempDirs = [];
function workDir(label) {
  workCount += 1;
  // mkdtempSync legt das Verzeichnis an — es wird BENUTZT, nicht gleich
  // weggeraeumt. (Frühere Fassung loeschte es sofort und der Test schrieb in
  // einen Pfad, den es nicht gab: ENOENT im Helfer, nicht im Produkt.)
  const dir = mkdtempSync(join(tmpdir(), `shinon-wiring-${label}-${workCount}-`));
  tempDirs.push(dir);
  return dir;
}

/** Ein Projekt mit genau den Bezugsarten, die der Resolver rangiert. */
function fixture(label) {
  const dir = join(workDir(label), 'projekt');
  mkdirSync(join(dir, 'src'), { recursive: true });
  const files = {
    'src/a.mjs': "import { bThing } from './b.mjs';\nexport function aRun() {\n  return bThing(1);\n}\n",
    'src/b.mjs': 'export function bThing(value) {\n  return value;\n}\n',
    'package.json': `${JSON.stringify({ name: 'fixture', dependencies: { yaml: '^2.0.0' } }, null, 2)}\n`,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** Den Fixture indexieren und den Pfad zur Indexdatei zurueckgeben. */
function indexed(project, label) {
  const indexFile = index.indexPath(join(workDir(label), 'indexes'), project);
  const db = index.openIndex(indexFile);
  index.updateIndex(db, project, {});
  db.close();
  return indexFile;
}

// ── 1. Die Faehigkeit des Index ─────────────────────────────────────────────

test('Index: die angebotenen Faehigkeiten sind schmal und tragen einen Vertragsnamen', () => {
  const provided = [];
  const ctx = { provide: (name, value) => { provided.push({ name, value }); return () => {}; } };
  const dispose = quiet(() => index.apply(ctx, index.Config({ root: fixture('schmal'), indexRoot: workDir('schmal-index'), worker: false, trace: false })));

  const names = provided.map((entry) => entry.name).sort();
  // Zug 3 der Wissens-Runtime: eine DRITTE schmale Faehigkeit (der Fakten-Snapshot).
  // Die Regel bleibt: jede Naht ist schmal, keine wird geweitet.
  assert.deepEqual(
    names,
    [index.QUERY_SERVICE, index.INDEX_STORE_SERVICE, 'shinon_facts_snapshot'].sort(),
    'drei schmale Faehigkeiten',
  );
  const facts = provided.find((entry) => entry.name === 'shinon_facts_snapshot').value;
  assert.deepEqual(Object.keys(facts).sort(), ['contract', 'snapshot'], 'der Snapshot: Vertragsname und EINE Operation');
  assert.equal(facts.contract, 'shinon.facts/snapshot-v1');
  const query = provided.find((entry) => entry.name === index.QUERY_SERVICE).value;
  assert.deepEqual(Object.keys(query).sort(), ['contract', 'resolveContext'], 'schmal: Vertragsname und EINE Operation');
  assert.equal(query.contract, index.QUERY_CONTRACT);
  assert.equal(typeof query.resolveContext, 'function');
  const store = provided.find((entry) => entry.name === index.INDEX_STORE_SERVICE).value;
  assert.deepEqual(Object.keys(store).sort(), ['contract', 'load', 'save'], 'die Ablage: zwei Operationen, kein Schema');
  assert.equal(store.contract, index.INDEX_STORE_CONTRACT);
  assert.equal(typeof store.load, 'function');
  assert.equal(typeof store.save, 'function');
  dispose();
});

test('Index: ohne Index gibt es null — und die Abfrage erzeugt keinen leeren Index', () => {
  const project = fixture('leer');
  const indexFile = index.indexPath(join(workDir('leer-index'), 'indexes'), project);
  assert.equal(existsSync(indexFile), false, 'Ausgangslage: kein Index');
  const service = index.createQueryService({ indexFile });

  assert.equal(service.resolveContext('Bitte pruefe src/a.mjs', { budgetTokens: 6000 }), null, 'kein Index, keine erfundene Leere');
  assert.equal(existsSync(indexFile), false, 'die Abfrage materialisiert keinen leeren Index');
});

test('Index: mit Index liefert die Abfrage den Kontextvertrag des Enhancers', () => {
  const project = fixture('liefert');
  const indexFile = indexed(project, 'liefert');
  const service = index.createQueryService({ indexFile });
  const context = service.resolveContext('Bitte pruefe src/a.mjs: bThing kommt aus yaml.', { budgetTokens: 6000 });

  assert.deepEqual(Object.keys(context).sort(), ['constraints', 'dependencies', 'files', 'project', 'symbols', 'touches']);
  assert.equal(context.project, 'projekt', 'der Projektname kommt aus dem Index selbst, nicht aus einer Ableitung');
  assert.equal(context.files[0].path, 'src/a.mjs', 'der genannte Pfad gewinnt');
  assert.equal(context.files[0].content.includes('bThing'), true);
  // Der Konsument entscheidet ueber die Form, nicht eine Kopie hier im Test.
  assert.equal(prompter.ContextSchema(context).files.length, context.files.length);
  // Ein kleineres Budget liefert weniger, nie mehr.
  const small = service.resolveContext('Bitte pruefe src/a.mjs: bThing kommt aus yaml.', { budgetTokens: 8 });
  assert.ok(index.estimateTokens(small.files.map((file) => file.content).join('\n')) <= index.estimateTokens(context.files.map((file) => file.content).join('\n')));
});

// ── 2. Die Naht als Daten ───────────────────────────────────────────────────

test('Naht: Dienst- und Vertragsname stimmen in beiden Paketen ueberein', () => {
  assert.equal(index.STORE_SERVICE, undefined, 'kein mehrdeutiger generischer Store-Export');
  assert.equal(index.STORE_CONTRACT, undefined, 'kein mehrdeutiger generischer Vertrags-Export');
  assert.equal(narrative.STORE_SERVICE, undefined, 'Narrative exportiert ebenfalls keine generischen Store-Namen');
  assert.equal(narrative.STORE_CONTRACT, undefined, 'Narrative exportiert ebenfalls keine generischen Store-Namen');
  assert.equal(codingmon.STORE_SERVICE, undefined, 'Codingmon exportiert keine generischen Store-Namen');
  assert.equal(codingmon.STORE_CONTRACT, undefined, 'Codingmon exportiert keine generischen Store-Namen');
  assert.equal(narrative.INDEX_STORE_SERVICE, index.INDEX_STORE_SERVICE, 'Narrative verwendet dieselbe Index-Naht');
  assert.equal(narrative.INDEX_STORE_CONTRACT, index.INDEX_STORE_CONTRACT, 'Narrative verwendet denselben Index-Vertrag');
  assert.equal(codingmon.CODINGMON_STORE_SERVICE, 'shinon_codingmon_store');
  assert.equal(codingmon.CODINGMON_STORE_CONTRACT, 'shinon.codingmon/store-v1');
  assert.equal(prompter.INDEX_SERVICE, index.QUERY_SERVICE, 'derselbe Dienstname');
  assert.equal(prompter.INDEX_CONTRACT, index.QUERY_CONTRACT, 'derselbe Vertragsname');
  assert.equal(prompter.INDEX_BUDGET_TOKENS, index.DEFAULT_CONTEXT_BUDGET, 'dasselbe Budget als Default');
  assert.deepEqual(prompter.inject, ['llm'], 'kein Injektionszwang fuer den Index (sonst kein Enhancer ohne Index)');

  // Die zweite Naht (Zug 2): kein Paket liest das andere, also pinnt der Test
  // auch hier beide Seiten — Dienstname, Vertragsname und ein Namensraum, der
  // wirklich einer ist.
  assert.equal(scoring.INDEX_STORE_SERVICE, index.INDEX_STORE_SERVICE, 'derselbe Dienstname');
  assert.equal(scoring.INDEX_STORE_CONTRACT, index.INDEX_STORE_CONTRACT, 'derselbe Vertragsname');
  assert.equal(typeof scoring.LEDGER_NAMESPACE, 'string');
  assert.ok(scoring.LEDGER_NAMESPACE.length > 0, 'ohne Namensraum gaebe es keine Adresse');

  // Die Persona haengt am SELBEN Dienst, mit einem EIGENEN Raum: ihr
  // Selbstmodell ist gelernte Selbstkenntnis, nicht das Protokoll des Scorings.
  // Beide Namen kommen aus derselben Definition in @shinon/seams/core.
  assert.equal(persona.INDEX_STORE_SERVICE, index.INDEX_STORE_SERVICE, 'derselbe Dienstname');
  assert.equal(persona.INDEX_STORE_CONTRACT, index.INDEX_STORE_CONTRACT, 'derselbe Vertragsname');
  assert.notEqual(persona.SELF_MODEL_NAMESPACE, scoring.LEDGER_NAMESPACE, 'eigener Namensraum, kein geteilter Stand');

  // Der Prompter haengt am selben Dienst, ebenfalls mit einem EIGENEN Raum:
  // der SALVAGED_PROSE-Zaehler beschreibt den Lauf (Sitzung), nicht das
  // Protokoll und nicht das Selbstmodell. Auch hier stammen beide Namen aus
  // derselben Definition in @shinon/seams/core.
  assert.equal(prompter.INDEX_STORE_SERVICE, index.INDEX_STORE_SERVICE, 'derselbe Dienstname');
  assert.equal(prompter.INDEX_STORE_CONTRACT, index.INDEX_STORE_CONTRACT, 'derselbe Vertragsname');
  assert.notEqual(prompter.SALVAGE_NAMESPACE, scoring.LEDGER_NAMESPACE, 'eigener Namensraum, kein geteilter Stand');
  assert.notEqual(prompter.SALVAGE_NAMESPACE, persona.SELF_MODEL_NAMESPACE, 'eigener Namensraum, kein geteilter Stand');
  assert.equal(prompter.SALVAGE_CONTRACT, prompter.SALVAGE_NAMESPACE, 'Vertrag und Adresse sind derselbe Name der Form');

  // Die dritte Naht (Zug 5): der Ton. Der Veredler liest die Haltung ueber
  // dieselbe Bauform (optionales `get`, gepruefter Vertragsname); die Namen
  // muessen auf beiden Seiten dieselben sein, sonst bleibt der Block stumm.
  assert.equal(prompter.SCORING_SERVICE, scoring.SCORING_SERVICE, 'derselbe Dienstname');
  assert.equal(prompter.SCORING_SERVICE_CONTRACT, scoring.SCORING_SERVICE_CONTRACT, 'derselbe Vertragsname');

  // Die vierte Naht (Phase 3): die gelernten Gewichte. Der Veredler liest sie
  // über dieselbe Bauform (optionales `get`, gepruefter Vertragsname) — die
  // Namen müssen auf beiden Seiten dieselben sein, sonst rechnet die Auswahl
  // ohne Lernen. Der Entscheidungskanal daneben ist die zweite Hälfte der
  // Naht: dort nennt der Veredler je Schritt Sitzung + Baustein-Ids.
  assert.equal(prompter.WEIGHTS_SERVICE, scoring.WEIGHTS_SERVICE, 'derselbe Dienstname');
  assert.equal(prompter.WEIGHTS_CONTRACT, scoring.WEIGHTS_CONTRACT, 'derselbe Vertragsname');
  assert.equal(scoring.BLOCKS_DECISION_CHANNEL, prompter.DECISION_CHANNEL, 'derselbe Entscheidungskanal');
});

// ── 3./4. Der echte Durchlauf und die Quelle im Datensatz ───────────────────

/** Nutzer-Nachricht in der Form, die der Loop fuehrt. */
const userMessage = (text) => ({ id: 'm-1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });
const stepPayload = (messages) => ({ agent: { session: { id: 'sess-1' } }, messages, turn: 1, step: 1, signal: new AbortController().signal });
const loopDefault = (claimed) => () => Promise.resolve({ kind: 'enter', messages: claimed });

const result = (over = {}) => JSON.stringify({
  enhancedPrompt: 'Bitte pruefe src/a.mjs auf bThing.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
  intentClassification: 'TRANSFORM',
  ...over,
});

function fakeLlm(behaviour) {
  const calls = [];
  return {
    calls,
    stream(options) {
      calls.push(options);
      const text = typeof behaviour === 'function' ? behaviour(options) : behaviour;
      return (async function* streamChunks() {
        yield { type: 'text-delta', index: 0, text };
      })();
    },
  };
}

function connect({ config = {}, llm, service } = {}) {
  const ctx = new Context();
  const records = [];
  ctx.provide('llm', llm);
  if (service !== undefined) ctx.provide(prompter.INDEX_SERVICE, service);
  ctx.on(prompter.DECISION_CHANNEL, (record) => records.push(record));
  // `notesPath: ''` heisst: die Zettel sind hier AUS. Diese Datei prueft die
  // Kontext-Naht, und deren Aufruf traegt genau EINEN Block. Die Zettel haben
  // ihre eigene Datei (prompter-notes.test.mjs) und einen eigenen Block.
  const dispose = quiet(() => prompter.apply(ctx, prompter.Config({ provider: 'p', model: 'm', mode: 'MAX', notesPath: '', skillsPath: '', ...config })));
  return { ctx, records, dispose };
}

test('MAX: mit Index-Dienst kommt der Kontext aus dem INDEX und die Quelle steht im Datensatz', async () => {
  const project = fixture('kette');
  const indexFile = indexed(project, 'kette');
  const captured = [];
  const service = {
    contract: index.QUERY_CONTRACT,
    resolveContext: (prompt, options) => {
      captured.push({ prompt, options });
      return index.createQueryService({ indexFile }).resolveContext(prompt, options);
    },
  };
  const llm = fakeLlm(result());
  const { ctx, records, dispose } = connect({ llm, service });
  const claimed = [userMessage('Bitte pruefe src/a.mjs: bThing kommt aus yaml.')];

  const decision = await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls.length, 1, 'MAX laeuft');
  const request = llm.calls[0];
  assert.equal(request.messages[0].content.length, 2, 'Roh-Prompt plus Kontextblock');
  const block = request.messages[0].content[1].text;
  assert.ok(block.startsWith('<untrusted_project_context>'), 'derselbe markierte Block wie beim Datei-Kontext (§15)');
  assert.ok(block.includes('<file path="src/a.mjs">'), 'der indizierte Text reist mit');
  assert.equal(captured.length, 1, 'genau eine Abfrage je Schritt');
  assert.equal(captured[0].prompt, 'Bitte pruefe src/a.mjs: bThing kommt aus yaml.', 'die Abfrage bekommt den ROHEN Prompt');
  assert.equal(captured[0].options.budgetTokens, prompter.INDEX_BUDGET_TOKENS, 'das Budget kommt aus der Konfiguration');
  assert.equal(records[0].outcome, 'accepted');
  assert.equal(records[0].context_source, 'index');
  assert.equal(records[0].context, 'used');
  assert.equal(decision.messages[0].content[0].text, 'Bitte pruefe src/a.mjs auf bThing.');
  dispose();
});

/**
 * S1 — die Herkunft steht im Datensatz, nicht im Prompt.
 *
 * Ein Enhancer, der den falschen Workspace liest, ist keine Stilfrage. Der
 * Datensatz nennt deshalb Root, Kurz-Identitaet und QUELLE (explizit, Env, cwd)
 * je Schritt. Der ROHE Nutzertext steht als `raw_prompt` ausdruecklich dabei —
 * ohne ihn ist im Trace nicht nachvollziehbar, was veredelt wurde; Schluessel
 * und Kontextinhalte bleiben draussen.
 */
test('S1: der Entscheidungsdatensatz nennt die Workspace-Identität und ihre Quelle', async () => {
  const workspace = workDir('s1-workspace');
  const llm = fakeLlm(result());
  const { ctx, records, dispose } = connect({ llm, config: { mode: 'MIN', workspaceRoot: workspace } });
  const prompt = 'Bitte pruefe src/a.mjs auf bThing.';
  const claimed = [userMessage(prompt)];

  await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(records.length, 1, 'genau ein Datensatz je Schritt');
  const record = records[0];
  assert.equal(record.workspace.root, workspace, 'die ausdrueckliche Root gewinnt');
  assert.equal(record.workspace.source, 'config');
  assert.match(record.workspace.rootId, /^[0-9a-f]{16}$/);
  assert.equal(record.workspace_contract, 'shinon.workspace/v1');
  assert.equal(record.rawLength, prompt.length, 'die Laenge bleibt gemessen');
  assert.equal(record.raw_prompt, prompt, 'der Rohtext ist im Trace verfuegbar');
  dispose();
});

test('MAX: eine Datei gewinnt gegen den Dienst, und ohne beides wird abgelehnt', async () => {
  // a) Datei konfiguriert -> Quelle file, der Dienst wird nicht einmal gefragt.
  const contextDir = workDir('datei');
  const contextPath = join(contextDir, 'ctx.json');
  writeFileSync(contextPath, JSON.stringify({
    project: 'aus-der-datei',
    files: [{ path: 'packages/prompter/index.js', content: 'export function apply(ctx, config) {}' }],
    symbols: ['apply'],
    constraints: [],
    touches: [],
    dependencies: [],
  }));
  let asked = 0;
  const service = { contract: index.QUERY_CONTRACT, resolveContext: () => { asked += 1; return null; } };
  const llm = fakeLlm(result());
  const first = connect({ llm, service, config: { contextPath } });
  const claimed = [userMessage('Bitte pruefe src/a.mjs')];

  await first.ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(asked, 0, 'die Datei ist die Quelle, nicht der Index');
  assert.equal(first.records[0].context_source, 'file');
  assert.equal(first.records[0].context, 'used');
  assert.ok(llm.calls[0].messages[0].content[1].text.includes('<project>aus-der-datei</project>'));
  first.dispose();

  // b) Weder Datei noch Dienst -> kein Aufruf, benannter Grund, Quelle none.
  const idle = fakeLlm(result());
  const second = connect({ llm: idle });
  const downstream = { kind: 'enter', messages: claimed };
  const decision = await second.ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

  assert.equal(idle.calls.length, 0, 'MAX ohne Kontext ruft nicht auf');
  assert.equal(decision, downstream, 'der Roh-Prompt gilt');
  assert.equal(second.records[0].context_source, 'none');
  assert.deepEqual(second.records[0].reasons, ['MODE_NEEDS_CONTEXT']);
  second.dispose();

  // c) Dienst da, aber noch kein Index -> eigener, unterscheidbarer Grund.
  const third = connect({ llm: fakeLlm(result()), service: { contract: index.QUERY_CONTRACT, resolveContext: () => null } });
  await third.ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));
  assert.equal(third.records[0].context_source, 'none');
  // Ohne Project-Index heißt der Grund MODE_NEEDS_CONTEXT: ein fehlender Index
  // ist kein benutzbarer Kontext.
  assert.deepEqual(third.records[0].reasons, ['MODE_NEEDS_CONTEXT'], 'ein fehlender Index ist nicht dasselbe wie ein fehlender Kontext');
  third.dispose();
});

test('MAX: ein fremder Dienst unter unserem Namen wird nicht benutzt', async () => {
  const cases = [
    { name: 'falscher Vertrag', service: { contract: 'shinon.irgendwas/v1', resolveContext: () => ({ project: 'x', files: [], symbols: [], constraints: [], touches: [], dependencies: [] }) }, reason: 'CONTEXT_INVALID' },
    { name: 'ohne resolveContext', service: { contract: index.QUERY_CONTRACT }, reason: 'CONTEXT_INVALID' },
    { name: 'lieferts Unsinn', service: { contract: index.QUERY_CONTRACT, resolveContext: () => ({ project: 'x' }) }, reason: 'CONTEXT_INVALID' },
    { name: 'wirft', service: { contract: index.QUERY_CONTRACT, resolveContext: () => { throw new Error('Index kaputt'); } }, reason: 'CONTEXT_INVALID' },
  ];
  for (const { name, service, reason } of cases) {
    const llm = fakeLlm(result());
    const { ctx, records, dispose } = connect({ llm, service });
    const claimed = [userMessage('Bitte pruefe src/a.mjs')];
    const downstream = { kind: 'enter', messages: claimed };

    const decision = await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(llm.calls.length, 0, `${name}: kein Aufruf mit unbrauchbarem Kontext`);
    assert.equal(decision, downstream, name);
    assert.equal(records[0].context_source, 'none', name);
    // Ist der Project-Index unbrauchbar (falscher Vertrag, wirft, Unsinn),
    // fällt der Prompter auf MODE_NEEDS_CONTEXT zurück.
    assert.deepEqual(records[0].reasons, ['MODE_NEEDS_CONTEXT'], name);
    dispose();
  }
});

test('MAX: Referenzen werden gegen den INDEX-Kontext aufgeloest (nicht gegen eine Kopie)', async () => {
  const project = fixture('referenzen');
  const indexFile = indexed(project, 'referenzen');
  const service = index.createQueryService({ indexFile });
  const llm = fakeLlm(result({ references: ['src/b.mjs', 'erfunden.mjs'] }));
  const { ctx, records, dispose } = connect({ llm, service });
  const claimed = [userMessage('Bitte pruefe src/a.mjs und src/b.mjs')];

  await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  // Verhaltensänderung (Session 3/4): unbekannte Referenzen werden protokolliert,
  // aber der Kontext trotzdem geliefert — nicht mehr komplett verworfen.
  assert.equal(records[0].outcome, 'accepted');
  assert.deepEqual(records[0].reasons, []);
  assert.equal(records[0].context_source, 'index');
  dispose();
});

test('MAX: eine kaputte Kontextdatei weicht NICHT auf den Index aus', async () => {
  // Wer eine Quelle benennt, bekommt sie oder einen Grund. Ein Ausweichen waere
  // die stillste denkbare Fehlbedienung: MAX laeuft, aber mit einem Kontext, den
  // niemand angefordert hat — und der Datensatz sieht trotzdem gesund aus.
  const project = fixture('kaputt');
  const indexFile = indexed(project, 'kaputt');
  const broken = join(workDir('kaputt-datei'), 'ctx.json');
  writeFileSync(broken, '{ "project": "halb", ');
  let asked = 0;
  const service = {
    contract: index.QUERY_CONTRACT,
    resolveContext: (prompt, options) => { asked += 1; return index.createQueryService({ indexFile }).resolveContext(prompt, options); },
  };
  const llm = fakeLlm(result());
  const { ctx, records, dispose } = connect({ llm, service, config: { contextPath: broken } });
  const claimed = [userMessage('Bitte pruefe src/a.mjs: bThing kommt aus yaml.')];
  const downstream = { kind: 'enter', messages: claimed };

  const decision = await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

  assert.equal(asked, 0, 'der Index wird bei kaputter Datei gar nicht erst gefragt');
  assert.equal(llm.calls.length, 0, 'kein Aufruf mit einem unbelegten Kontext');
  assert.equal(decision, downstream, 'der Roh-Prompt gilt');
  assert.equal(records[0].context_source, 'none');
  assert.deepEqual(records[0].reasons, ['CONTEXT_INVALID']);
  assert.equal(records[0].context, 'invalid');
  dispose();
});

test('MIN/MID: der Dienst wird nicht gefragt, und die Quelle bleibt none', async () => {
  for (const mode of ['MIN', 'MID']) {
    let asked = 0;
    const service = { contract: index.QUERY_CONTRACT, resolveContext: () => { asked += 1; return null; } };
    const llm = fakeLlm(result());
    const { ctx, records, dispose } = connect({ llm, service, config: { mode } });
    const claimed = [userMessage('Bitte pruefe src/a.mjs')];

    await ctx.waterfall(prompter.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

    assert.equal(asked, 0, `${mode}: kein Index-Zugriff ohne MAX`);
    assert.equal(llm.calls[0].messages[0].content.length, 1, `${mode}: kein Kontextblock`);
    assert.equal(records[0].context_source, 'none', mode);
    dispose();
  }
});
