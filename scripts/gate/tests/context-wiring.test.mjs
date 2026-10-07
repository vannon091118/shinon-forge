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
 *   1. Die Faehigkeit des Index: GENAU EINE Operation, ein Vertragsname, und
 *      ohne Index eine ehrliche Leere (null) statt eines leeren Index.
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

const PACKAGES = ['prompter', 'project-index'];
const ROOT = new URL('../../../', import.meta.url);

/** Beide Bundles isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation. */
async function loadBundles() {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
  const require = createRequire(join(root, 'package.json'));
  const work = mkdtempSync(join(tmpdir(), 'shinon-wiring-test-'));
  for (const name of PACKAGES) cpSync(new URL(`packages/${name}/`, ROOT), join(work, name), { recursive: true });
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

test('Index: die angebotene Faehigkeit ist schmal und traegt einen Vertragsnamen', () => {
  const provided = [];
  const ctx = { provide: (name, value) => { provided.push({ name, value }); return () => {}; } };
  const dispose = quiet(() => index.apply(ctx, index.Config({ root: fixture('schmal'), indexRoot: workDir('schmal-index'), worker: false, trace: false })));

  assert.equal(provided.length, 1, 'genau eine Faehigkeit');
  assert.equal(provided[0].name, index.QUERY_SERVICE);
  assert.deepEqual(Object.keys(provided[0].value).sort(), ['contract', 'resolveContext'], 'schmal: Vertragsname und EINE Operation');
  assert.equal(provided[0].value.contract, index.QUERY_CONTRACT);
  assert.equal(typeof provided[0].value.resolveContext, 'function');
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
  assert.equal(prompter.INDEX_SERVICE, index.QUERY_SERVICE, 'derselbe Dienstname');
  assert.equal(prompter.INDEX_CONTRACT, index.QUERY_CONTRACT, 'derselbe Vertragsname');
  assert.equal(prompter.INDEX_BUDGET_TOKENS, index.DEFAULT_CONTEXT_BUDGET, 'dasselbe Budget als Default');
  assert.deepEqual(prompter.inject, ['llm'], 'kein Injektionszwang fuer den Index (sonst kein Enhancer ohne Index)');
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
  const dispose = quiet(() => prompter.apply(ctx, prompter.Config({ provider: 'p', model: 'm', mode: 'MAX', ...config })));
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
  assert.deepEqual(third.records[0].reasons, ['MODE_NEEDS_INDEX'], 'ein fehlender Index ist nicht dasselbe wie ein fehlender Kontext');
  third.dispose();
});

test('MAX: ein fremder Dienst unter unserem Namen wird nicht benutzt', async () => {
  const cases = [
    { name: 'falscher Vertrag', service: { contract: 'shinon.irgendwas/v1', resolveContext: () => ({ project: 'x', files: [], symbols: [], constraints: [], touches: [], dependencies: [] }) }, reason: 'CONTEXT_INVALID' },
    { name: 'ohne resolveContext', service: { contract: index.QUERY_CONTRACT }, reason: 'CONTEXT_INVALID' },
    { name: 'liefert Unsinn', service: { contract: index.QUERY_CONTRACT, resolveContext: () => ({ project: 'x' }) }, reason: 'CONTEXT_INVALID' },
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
    assert.deepEqual(records[0].reasons, [reason], name);
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

  assert.equal(records[0].outcome, 'rejected');
  assert.deepEqual(records[0].reasons, ['UNRESOLVABLE_REFERENCES:erfunden.mjs'], 'der gelieferte Kontext ist die Latte');
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
