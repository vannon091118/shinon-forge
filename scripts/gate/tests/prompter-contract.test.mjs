#!/usr/bin/env node
/**
 * Phase 2 — Abnahmetest des Prompt Enhancers (@shinon/prompter).
 *
 * Gate: „Paket wird korrekt geladen und kann einen validierten
 * Prompt-Resultatvertrag liefern."
 *
 * Drei Ebenen, bewusst getrennt:
 *   1. Der Vertrag (Plan §7) als reine Funktionen: Parsen, Schema, Annahme-Policy.
 *   2. Die Capability-Isolation: der One-Shot-Aufruf trägt keine Fähigkeit.
 *   3. Der echte Durchlauf: das Bundle wird über seine apply()-Schnittstelle an
 *      einen ECHTEN Cordis-Context gehängt und der Waterfall `agent/pre-step`
 *      gefahren — dieselbe Mechanik wie im Agent-Loop.
 *
 * Der Modell-Provider selbst ist zwangsläufig eine Attrappe (er ist extern und
 * braucht Zugangsdaten); alles andere — Dispatcher, Waterfall, next()-Kette,
 * Message-Identität, Schema — ist echt. Die Attrappe zählt die Aufrufe und
 * reicht die Optionen zur Prüfung heraus, damit die Isolation an einem echten
 * Aufruf belegt ist und nicht nur im Bauplan.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein
 * node_modules im Repo, kein Netz, kein Modell.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { codeOnly, findForbidden } from '../../lib/source-scan.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/prompter/', import.meta.url));
const INDEX_FILE = join(PACKAGE_DIR, 'index.js');

const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
const require = createRequire(join(root, 'package.json'));

/** Das Bundle isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation. */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-prompter-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  const shim = join(work, 'pkg/node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

const bundle = await loadBundle();
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);

function quiet(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

/** Ein Ergebnis, das den Vertrag erfuellt; einzelne Felder werden je Fall ersetzt. */
const goodResult = (over = {}) => ({
  enhancedPrompt: 'Mach das schnell.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
  intentClassification: 'TRANSFORM',
  ...over,
});

const reply = (obj) => JSON.stringify(obj);

/** Nutzer-Nachricht in der Form, die der Loop fuehrt (TextBlock + id + source). */
const userMessage = (text = 'mach  das  schnell') => ({
  id: 'm-1',
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
});

const stepPayload = (messages) => ({ agent: { session: { id: 'sess-1' } }, messages, turn: 1, step: 1, signal: new AbortController().signal });

/**
 * Bundle an einen echten Cordis-Context haengen. Der Dispatcher ist echt; nur
 * `llm` ist eine Attrappe, weil der Provider extern ist. `calls` sammelt die
 * Optionen jedes echten Aufrufs.
 */
function connect(config = {}, { llm } = {}) {
  const ctx = new Context();
  const records = [];
  ctx.on(bundle.DECISION_CHANNEL, (record) => records.push(record));
  const host = {
    on: (...args) => ctx.on(...args),
    emit: (...args) => ctx.emit(...args),
    ...(llm === undefined ? {} : { llm }),
  };
  const resolved = bundle.Config(config);
  const dispose = quiet(() => bundle.apply(host, resolved));
  return { ctx, records, config: resolved, dispose };
}

/**
 * Eine LLM-Attrappe. `behaviour` ist der Antworttext, ein Error (wird geworfen)
 * oder eine Funktion, die den Text liefert bzw. wirft. Die Optionen jedes echten
 * Aufrufs werden mitgeschrieben, damit die Isolation an einem echten Aufruf
 * belegt ist.
 */
function fakeLlm(behaviour) {
  const calls = [];
  return {
    calls,
    stream(options) {
      calls.push(options);
      const text = typeof behaviour === 'function' ? behaviour(options) : behaviour;
      if (text instanceof Error) throw text;
      return (async function* streamChunks() {
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text };
      })();
    },
  };
}

const route = { provider: 'test-route', model: 'test-model' };
const loopDefault = (claimed) => () => Promise.resolve({ kind: 'enter', messages: claimed });

// ── Zusage: der Resultatvertrag (Plan §7) ───────────────────────────────────

test('Vertrag: ein gueltiges Ergebnis wird angenommen, jede Verletzung benannt', () => {
  const cases = [
    { name: 'gueltig', text: reply(goodResult()), ok: true },
    { name: 'gueltig im Zaun mit Vorrede', text: `Hier ist es:\n\`\`\`json\n${reply(goodResult())}\n\`\`\`\n`, ok: true },
    { name: 'kein JSON', text: 'Ich habe den Prompt verbessert.', ok: false, reason: 'NO_JSON' },
    { name: 'kaputtes JSON', text: '{"enhancedPrompt": }', ok: false, reason: 'INVALID_JSON' },
    { name: 'leerer Prompt', text: reply(goodResult({ enhancedPrompt: '' })), ok: false, reason: 'SCHEMA_INVALID' },
    { name: 'fast nichts', text: reply({ enhancedPrompt: 'x', preservedIntent: true }), ok: false, reason: 'SCHEMA_INVALID' },
    { name: 'preservedIntent kein Boolean', text: reply(goodResult({ preservedIntent: 'ja' })), ok: false, reason: 'SCHEMA_INVALID' },
    { name: 'unbekannte Intent-Klasse', text: reply(goodResult({ intentClassification: 'VIBE' })), ok: false, reason: 'SCHEMA_INVALID' },
  ];
  // Regression: Schemastery fuellt ein fehlendes Array still mit []. Ohne
  // `required()` wuerde ein weggelassenes addedRequirements wie "nichts
  // hinzugefuegt" aussehen — die Luecke saehe genau wie Compliance aus.
  const omitted = goodResult();
  delete omitted.addedRequirements;
  cases.push(
    { name: 'addedRequirements weggelassen', text: reply(omitted), ok: false, reason: 'SCHEMA_INVALID' },
    { name: 'addedRequirements null', text: reply(goodResult({ addedRequirements: null })), ok: false, reason: 'SCHEMA_INVALID' },
    { name: 'preservedIntent weggelassen', text: reply({ ...goodResult(), preservedIntent: undefined }), ok: false, reason: 'SCHEMA_INVALID' },
  );
  for (const { name, text, ok, reason } of cases) {
    const parsed = bundle.parseResult(text);
    assert.equal(parsed.ok, ok, name);
    if (ok) assert.equal(parsed.result.enhancedPrompt, 'Mach das schnell.', name);
    else assert.ok(parsed.reasons[0].startsWith(reason), `${name}: ${parsed.reasons[0]}`);
  }
});

test('Vertrag: das Ergebnis wird nie direkt uebernommen', () => {
  const cases = [
    { name: 'sauber', result: goodResult(), accepted: true },
    { name: 'Absicht nicht erhalten', result: goodResult({ preservedIntent: false }), reasons: ['INTENT_NOT_PRESERVED'] },
    { name: 'Anforderung hinzugefuegt', result: goodResult({ addedRequirements: ['auch Tests schreiben'] }), reasons: ['ADDED_REQUIREMENTS'] },
    { name: 'Anforderung entfernt', result: goodResult({ removedRequirements: ['ohne Tests'] }), reasons: ['REMOVED_REQUIREMENTS'] },
    { name: 'alles gleichzeitig', result: goodResult({ preservedIntent: false, addedRequirements: ['a'], removedRequirements: ['b'] }), reasons: ['INTENT_NOT_PRESERVED', 'ADDED_REQUIREMENTS', 'REMOVED_REQUIREMENTS'] },
  ];
  for (const { name, result, accepted, reasons } of cases) {
    const decision = bundle.acceptance(result);
    assert.equal(decision.accepted, Boolean(accepted), name);
    if (reasons) assert.deepEqual(decision.reasons, reasons, name);
  }
});

// ── Zusage: der One-Shot-Child ist keine Faehigkeit ─────────────────────────

test('Isolation: der One-Shot-Aufruf traegt keine Tools und keine erfundenen Felder', () => {
  const request = bundle.buildEnhancerRequest({ text: 'roh', mode: 'MIN', config: bundle.Config({ ...route }), signal: undefined });

  assert.deepEqual(
    Object.keys(request).sort(),
    ['maxTokens', 'messages', 'model', 'provider', 'signal', 'system', 'temperature'],
  );
  assert.equal('tools' in request, false, 'kein tools-Feld — Abwesenheit ist die Grenze');
  assert.equal('purpose' in request, false, 'purpose kennt nur compaction|session-title');
  assert.equal('sessionId' in request, false, 'kein One-Shot beansprucht Loop-Identitaet');
  // RequestUserInput: role 'user', content-Bloecke, keine durable Identitaet.
  assert.deepEqual(request.messages, [{ role: 'user', content: [{ type: 'text', text: 'roh' }] }]);
  assert.equal('id' in request.messages[0], false);
  assert.equal('source' in request.messages[0], false);
  assert.equal(request.system, bundle.POLICIES.MIN);
});

test('Isolation: der Laufzeitcode oeffnet weder Dateisystem noch Netz und gibt keine Tools', () => {
  const source = readFileSync(INDEX_FILE, 'utf8');
  const forbidden = ['child_process', 'writeFile', 'mkdirSync', 'rmSync', 'unlinkSync', 'execSync', 'spawn(', 'fetch(', 'process.exit', 'ctx.agents', 'ctx.subagents', 'ctx.shell', 'ctx.set('];
  assert.deepEqual(findForbidden(source, forbidden, { mode: 'module' }), []);
  assert.deepEqual(findForbidden(source, forbidden), []);
  // Die Grenze selbst: nirgends wird ein Werkzeugkatalog gebaut oder uebergeben.
  assert.equal(codeOnly(source).includes('tools'), false, 'kein tools-Feld im Laufzeitcode');
});

test('Isolation: MIN und MID unterscheiden sich nur in der Erlaubnis', () => {
  assert.ok(bundle.POLICIES.MIN.includes('Verboten: neue Anforderungen'));
  assert.ok(bundle.POLICIES.MID.includes('Erlaubt: bessere Struktur'));
  assert.ok(bundle.POLICIES.MID.includes('Verboten: neue fachliche Anforderungen'));
  assert.notEqual(bundle.POLICIES.MIN, bundle.POLICIES.MID);
});

// ── Zusage: das Paket laedt und haengt am Schritt ───────────────────────────

test('Laden: das Bundle registriert sich am echten Waterfall', async () => {
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls.length, 1, 'genau ein One-Shot-Aufruf');
  assert.equal(decision.kind, 'enter');
  assert.equal(decision.messages[0].content[0].text, 'Mach das schnell.', 'der uebernommene Prompt ersetzt den Roh-Prompt');
  assert.equal(records.length, 1, 'genau ein Provenienz-Datensatz pro Schritt');
  assert.equal(records[0].outcome, 'accepted');
  assert.equal(records[0].contract, bundle.CONTRACT);
  assert.equal(records[0].intentClassification, 'TRANSFORM');
  dispose();
});

test('Laden: nach dispose und ohne passenden Event-Namen wird nicht registriert', async () => {
  for (const { name, config, disposeFirst } of [
    { name: 'nach dispose', config: { ...route }, disposeFirst: true },
    { name: 'observeEvents ohne den Event-Namen', config: { ...route, observeEvents: ['session.created'] }, disposeFirst: false },
  ]) {
    const llm = fakeLlm(reply(goodResult()));
    const { ctx, dispose } = connect(config, { llm });
    const claimed = [userMessage()];
    if (disposeFirst) dispose();

    const downstream = { kind: 'enter', messages: claimed };
    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(decision, downstream, name);
    assert.equal(llm.calls.length, 0, name);
    dispose();
  }
});

// ── Zusage: bei Verwerfen gilt der Roh-Prompt unveraendert ──────────────────

test('Roh-Prompt: jeder Fehlschlag laesst die Entscheidung unberuehrt', async () => {
  const cases = [
    { name: 'Antwort ohne JSON', behaviour: 'Ich habe nichts geaendert.' },
    { name: 'Antwort mit kaputtem JSON', behaviour: '{"enhancedPrompt": }' },
    { name: 'Antwort verletzt das Schema', behaviour: reply({ enhancedPrompt: 'x' }) },
    { name: 'Absicht nicht erhalten', behaviour: reply(goodResult({ preservedIntent: false })) },
    { name: 'Anforderung hinzugefuegt', behaviour: reply(goodResult({ addedRequirements: ['mehr'] })) },
    { name: 'Provider wirft', behaviour: new Error('Provider kaputt') },
  ];
  for (const { name, behaviour } of cases) {
    const llm = fakeLlm(behaviour);
    const { ctx, records, dispose } = connect({ ...route }, { llm });
    const claimed = [userMessage()];
    const downstream = { kind: 'enter', messages: claimed };

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(decision, downstream, `${name}: die Entscheidung muss unveraendert sein`);
    assert.equal(records.length, 1, `${name}: genau ein Datensatz`);
    assert.ok(records[0].outcome !== 'accepted', `${name}: ${records[0].outcome}`);
    assert.ok(records[0].reasons.length > 0, `${name}: ein Verwerfen braucht einen Grund`);
    dispose();
  }
});

test('Roh-Prompt: ohne Route und ohne LLM-Dienst wird gar nicht erst aufgerufen', async () => {
  const cases = [
    { name: 'ohne Route', config: { provider: '', model: '' }, withLlm: true, reason: 'NO_ROUTE' },
    { name: 'ohne llm-Dienst', config: { ...route }, withLlm: false, reason: 'NO_LLM_SERVICE' },
  ];
  for (const { name, config, withLlm, reason } of cases) {
    const double = fakeLlm(reply(goodResult()));
    const { ctx, records, dispose } = connect(config, withLlm ? { llm: double } : {});
    const claimed = [userMessage()];
    const downstream = { kind: 'enter', messages: claimed };

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(decision, downstream, name);
    assert.equal(double.calls.length, 0, name);
    assert.equal(records[0].outcome, 'unavailable', name);
    assert.deepEqual(records[0].reasons, [reason], name);
    dispose();
  }
});

test('Roh-Prompt: MAX wird ohne Project Index abgelehnt, nicht weichgespuelt', async () => {
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, config, dispose } = connect({ ...route, mode: 'MAX' }, { llm });
  const claimed = [userMessage()];
  const downstream = { kind: 'enter', messages: claimed };

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

  assert.equal(decision, downstream);
  assert.equal(llm.calls.length, 0, 'MAX darf ohne Index gar nicht erst aufrufen');
  assert.deepEqual(records[0].reasons, ['MODE_NEEDS_INDEX']);
  assert.equal(config.mode, 'MAX');
  assert.equal(bundle.AVAILABLE_MODES.includes('MAX'), false);
  dispose();
});

// ── Zusage: die Ersetzung ist chirurgisch ──────────────────────────────────

test('Ersetzung: nur der Text wird ersetzt, Identitaet und Fremdbloecke bleiben', () => {
  const image = { type: 'image', ref: 'bild-1' };
  const original = { id: 'm-1', role: 'user', content: [image, { type: 'text', text: 'alt' }, { type: 'text', text: 'noch aelter' }], source: { kind: 'user' } };
  const other = { id: 'm-0', role: 'user', content: [{ type: 'text', text: 'frueher' }], source: { kind: 'user' } };
  const messages = [other, original];

  const replaced = bundle.replacePrompt(messages, original, 'neu');

  assert.equal(replaced[0], other, 'unbeteiligte Nachrichten bleiben dieselben Objekte');
  assert.equal(replaced[1].id, 'm-1', 'die Identitaet der Nachricht bleibt');
  assert.equal(replaced[1].source, original.source);
  assert.deepEqual(replaced[1].content, [image, { type: 'text', text: 'neu' }], 'der Bildblock bleibt, beide Textbloecke werden einer');
  assert.equal(messages[1], original, 'die Eingabe wird nicht mutiert');
});

test('Ersetzung: eine nicht auffindbare Nachricht fuehrt zum Roh-Prompt', async () => {
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];
  // Der Downstream reicht andere Objekte weiter — die Identitaet ist verloren.
  const fremd = { kind: 'enter', messages: [userMessage()] };

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(fremd));

  assert.equal(decision, fremd, 'ohne Identitaet wird nicht geraten');
  assert.equal(records[0].outcome, 'rejected');
  assert.deepEqual(records[0].reasons, ['MESSAGE_NOT_FOUND']);
  dispose();
});

// ── Zusage: der Abbruch des Schritts wirkt ─────────────────────────────────

test('Abbruch: das Signal des Schritts erreicht den One-Shot', async () => {
  const llm = fakeLlm((options) => {
    assert.ok(options.signal instanceof AbortSignal, 'der Aufruf braucht ein Signal');
    return reply(goodResult());
  });
  const { ctx, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls.length, 1);
  assert.equal(llm.calls[0].signal.aborted, false);
  dispose();
});

test('Abbruch: ein abgebrochener One-Shot gilt als verworfen', async () => {
  const controller = new AbortController();
  const llm = fakeLlm(() => {
    controller.abort();
    const error = new Error('aborted');
    error.name = 'AbortError';
    return error;
  });
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];
  const payload = { ...stepPayload(claimed), signal: controller.signal };
  const downstream = { kind: 'enter', messages: claimed };

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, payload, () => Promise.resolve(downstream));

  assert.equal(decision, downstream);
  assert.equal(records[0].outcome, 'rejected');
  assert.deepEqual(records[0].reasons, ['LLM_FAILED:AbortError']);
  dispose();
});

// ── Zusage: Konfiguration ─────────────────────────────────────────────────

test('Konfiguration: die Defaults rufen nichts auf und lassen den Ablauf unberuehrt', () => {
  const parsed = bundle.Config({});
  assert.deepEqual(parsed, {
    observeEvents: ['agent/pre-step'],
    mode: 'MIN',
    provider: '',
    model: '',
    maxTokens: 1200,
    temperature: 0,
    timeoutMs: 15000,
    trace: true,
  });
  assert.equal(bundle.AVAILABLE_MODES.join(','), 'MIN,MID', 'MAX gehoert dem Project Index');
});

test('Konfiguration: unbekannte Werte werden schema-seitig abgelehnt', () => {
  for (const [key, value] of [['mode', 'TURBO'], ['maxTokens', 'viel'], ['trace', 'ja']]) {
    assert.throws(() => bundle.Config({ [key]: value }), new RegExp(key), `${key}=${value}`);
  }
});
