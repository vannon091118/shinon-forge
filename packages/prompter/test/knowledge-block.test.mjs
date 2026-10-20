#!/usr/bin/env node
/**
 * knowledge-block.test.mjs — der Wissensblock im echten Schritt.
 *
 * Kein Modell, kein Netz: ein Fake-LLM antwortet, ein Fake-Dienst liefert den
 * Snapshot, und der Waterfall `agent/pre-step` läuft durch das echte Paket.
 * Gepinnt wird, was die Mission verspricht:
 *
 *   - der Block steht im FINALEN `messages`-Array, nicht nur im Log,
 *   - das gilt für angenommenen One-Shot, abgelehnten One-Shot und den
 *     Direktpfad gleichermaßen,
 *   - ohne Dienst bleibt der Prompt unverändert (keine leere Behauptung),
 *   - der Entscheidungsdatensatz trägt Zahlen und Hash, aber keinen Blocktext.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Config, DECISION_CHANNEL, PRE_STEP_EVENT, apply } from '../index.js';
import { FACTS_SNAPSHOT_CONTRACT, FACTS_SNAPSHOT_SERVICE } from '../assets/mode-core.js';
import { KNOWLEDGE_CONTRACT, renderKnowledgeBlock } from '../assets/knowledge-block.js';

const SNAPSHOT = {
  contract: KNOWLEDGE_CONTRACT,
  version: 1,
  hash: 'f_0123456789abcdef',
  intent: { classification: 'MULTI_STEP_TASK' },
  capabilities: [{ id: 'shinon-bug-muster' }],
  facts: [
    { id: 'f_aaaaaaaaaaaaaaaa', scope: 'packages/prompter', subject: 'pre-step.js', predicate: 'montiert', value: 'den Wissensblock', kind: 'FACT', revisions: ['dev:1:2:3:4'] },
    { id: 'f_bbbbbbbbbbbbbbbb', scope: 'docs/contracts', subject: 'facts.json', predicate: 'status', value: 'IMPLEMENTED', kind: 'FACT', revisions: ['dev:5:6:7:8'] },
  ],
  constraints: [{ key: 'commit-policy', text: 'shinon-maintainer' }],
  conflicts: [{ id: 'f_cccccccccccccccc', sources: ['docs/ROADMAP.md', 'packages/prompter/index.js'] }],
  revisions: ['dev:1:2:3:4', 'dev:5:6:7:8'],
};

function fakeCtx(llm, services = {}) {
  const handlers = new Map();
  const emitted = [];
  const provided = new Map(Object.entries(services));
  return {
    llm,
    handlers,
    emitted,
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {};
    },
    get(name) {
      return provided.get(name);
    },
    provide(name, value) {
      provided.set(name, value);
      return () => provided.delete(name);
    },
    emit(channel, record) {
      emitted.push({ channel, record });
    },
  };
}

function fakeLlm(text) {
  return {
    stream() {
      return (async function* chunks() {
        yield { type: 'text-delta', index: 0, text };
      })();
    },
  };
}

const GOOD = JSON.stringify({
  enhancedPrompt: 'Pruefe src/a.mjs.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
});

const message = (text) => ({ id: 'm-1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });

async function runStep(ctx, text) {
  const claimed = message(text);
  const step = {
    agent: { session: { id: 'sess-1' } },
    messages: [claimed],
    turn: 1,
    step: 1,
    signal: new AbortController().signal,
  };
  // Der Entscheidungsdatensatz wird nur mit einem `window` abgelegt; ohne ihn
  // läuft der Schritt, aber die Spur bleibt leer (wie im Provenienz-Test).
  const hadWindow = 'window' in globalThis;
  if (!hadWindow) globalThis.window = {};
  try {
    return await ctx.handlers.get(PRE_STEP_EVENT)[0](step, () => Promise.resolve({ kind: 'enter', messages: [claimed] }));
  } finally {
    if (!hadWindow) delete globalThis.window;
  }
}

function mount(configOverrides = {}, services = {}) {
  const ctx = fakeCtx(fakeLlm(configOverrides.llmText ?? GOOD), services);
  const dir = mkdtempSync(join(tmpdir(), 'shinon-knowledge-'));
  const dispose = apply(ctx, Config({
    provider: 'p',
    model: 'm',
    mode: 'MID',
    contextPath: '',
    notesPath: '',
    skillsPath: '',
    intentPatternsPath: '',
    blocksLearnedPath: '',
    trace: true,
    ...configOverrides,
  }));
  return { ctx, dispose, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function promptText(messages) {
  return messages[0].content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
}

test('renderer: der Block nennt Fakten, Constraint und offenen Konflikt', () => {
  const rendered = renderKnowledgeBlock(SNAPSHOT);
  assert.equal(rendered.facts, 2);
  assert.equal(rendered.constraints, 1);
  assert.equal(rendered.conflicts, 1);
  assert.match(rendered.text, /<project_facts contract="shinon\.facts\/snapshot-v1">/);
  assert.match(rendered.text, /pre-step\.js montiert: den Wissensblock \(f_aaaaaaaaaaaaaaaa @ dev:1:2:3:4\)/);
  assert.match(rendered.text, /<constraints>/);
  assert.match(rendered.text, /commit-policy: shinon-maintainer/);
  assert.match(rendered.text, /konflikt: f_cccccccccccccccc .* ungelöst/);
});

test('renderer: ohne Wissen gibt es keinen Block, fremder Vertrag wird abgelehnt', () => {
  assert.equal(renderKnowledgeBlock(null).text, '');
  assert.equal(renderKnowledgeBlock({ ...SNAPSHOT, contract: 'shinon.andere/v1' }).reason, 'FREMDER_VERTRAG');
  const empty = renderKnowledgeBlock({ ...SNAPSHOT, facts: [], constraints: [], conflicts: [] });
  assert.equal(empty.text, '');
  assert.equal(empty.reason, 'LEER');
});

test('renderer: die Reihenfolge ist stabil, egal wie die Listen kommen', () => {
  const reversed = { ...SNAPSHOT, facts: [...SNAPSHOT.facts].reverse(), constraints: [], conflicts: [] };
  assert.equal(renderKnowledgeBlock(reversed).text, renderKnowledgeBlock({ ...SNAPSHOT, constraints: [], conflicts: [] }).text);
});

test('schritt: angenommener One-Shot bekommt den Block hinter dem Brief', async () => {
  const ctx = fakeCtx(fakeLlm(GOOD), { [FACTS_SNAPSHOT_SERVICE]: { contract: FACTS_SNAPSHOT_CONTRACT, snapshot: () => SNAPSHOT } });
  const dispose = apply(ctx, Config({
    provider: 'p', model: 'm', mode: 'MID', contextPath: '', notesPath: '', skillsPath: '',
    intentPatternsPath: '', blocksLearnedPath: '', trace: true,
  }));
  try {
    const result = await runStep(ctx, 'pruefe a');
    const text = promptText(result.messages);
    assert.match(text, /Pruefe src\/a\.mjs\./, 'der Veredler-Text steht vorn');
    assert.match(text, /<project_facts/, 'der Block erreicht den Hauptagenten');
    const record = ctx.emitted.filter((entry) => entry.channel === DECISION_CHANNEL)[0].record;
    assert.equal(record.knowledge.facts, 2);
    assert.equal(record.knowledge.hash, SNAPSHOT.hash);
    assert.equal(JSON.stringify(record).includes('den Wissensblock'), false, 'kein Blocktext im Datensatz');
  } finally {
    dispose();
  }
});

test('schritt: abgelehnter One-Shot bekommt den Block trotzdem', async () => {
  const ctx = fakeCtx(fakeLlm('kein JSON, nur Prosa'), { [FACTS_SNAPSHOT_SERVICE]: { contract: FACTS_SNAPSHOT_CONTRACT, snapshot: () => SNAPSHOT } });
  const dispose = apply(ctx, Config({
    provider: 'p', model: 'm', mode: 'MID', contextPath: '', notesPath: '', skillsPath: '',
    intentPatternsPath: '', blocksLearnedPath: '', trace: true,
  }));
  try {
    const result = await runStep(ctx, 'pruefe a');
    const text = promptText(result.messages);
    assert.match(text, /a/, 'der Roh-Prompt bleibt');
    assert.match(text, /<project_facts/, 'der Block kommt aus der Runtime, nicht aus dem Modell');
  } finally {
    dispose();
  }
});

test('schritt: Direktpfad (kein One-Shot) bekommt den Block ebenfalls', async () => {
  const ctx = fakeCtx(fakeLlm(GOOD), { [FACTS_SNAPSHOT_SERVICE]: { contract: FACTS_SNAPSHOT_CONTRACT, snapshot: () => SNAPSHOT } });
  const dispose = apply(ctx, Config({
    provider: 'p', model: 'm', mode: 'MID', contextPath: '', notesPath: '', skillsPath: '',
    intentPatternsPath: '', blocksLearnedPath: '', trace: true, alwaysEnhance: false,
  }));
  try {
    const result = await runStep(ctx, 'hallo');
    assert.match(promptText(result.messages), /<project_facts/, 'auch ohne One-Shot');
  } finally {
    dispose();
  }
});

test('schritt: ohne Dienst bleibt der Prompt unverändert', async () => {
  const ctx = fakeCtx(fakeLlm('kein JSON, nur Prosa'), {});
  const dispose = apply(ctx, Config({
    provider: 'p', model: 'm', mode: 'MID', contextPath: '', notesPath: '', skillsPath: '',
    intentPatternsPath: '', blocksLearnedPath: '', trace: true,
  }));
  try {
    const result = await runStep(ctx, 'pruefe a');
    assert.equal(result.messages[0].content[0].text, 'pruefe a');
    const record = ctx.emitted.filter((entry) => entry.channel === DECISION_CHANNEL)[0].record;
    assert.equal(record.knowledge.facts, 0);
    assert.equal(record.knowledge.reason, 'KEIN_SNAPSHOT');
  } finally {
    dispose();
  }
});

test('schritt: ein werfender Dienst bricht den Turn nicht', async () => {
  const ctx = fakeCtx(fakeLlm(GOOD), { [FACTS_SNAPSHOT_SERVICE]: { contract: FACTS_SNAPSHOT_CONTRACT, snapshot: () => { throw new Error('kaputt'); } } });
  const dispose = apply(ctx, Config({
    provider: 'p', model: 'm', mode: 'MID', contextPath: '', notesPath: '', skillsPath: '',
    intentPatternsPath: '', blocksLearnedPath: '', trace: true,
  }));
  try {
    const result = await runStep(ctx, 'pruefe a');
    assert.match(promptText(result.messages), /Pruefe src\/a\.mjs\./);
  } finally {
    dispose();
  }
});
