import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onPreStep, readPrompt } from '../assets/pre-step.js';
import { loadRuntime } from '../assets/runtime-state.js';
import { Config } from '../assets/schema.js';

const user = (text) => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] });

test('readPrompt selects the last human message instead of harness instructions', () => {
  const first = user('Erster Auftrag');
  const last = user('Zweiter Auftrag');
  const instruction = { role: 'user', source: { kind: 'agent-instructions' }, content: [{ type: 'text', text: 'Systemhinweis' }] };
  const prompt = readPrompt({ messages: [first, last, instruction] });
  assert.equal(prompt.text, 'Zweiter Auftrag');
  assert.equal(prompt.message, last);
  assert.equal(prompt.index, 1);
  assert.equal(readPrompt({ messages: [instruction] }), null);
});

test('pre-step binds the session workspace and passes through when no human message exists', async () => {
  const roots = [];
  const runtime = { bindWorkspace: (cwd) => { roots.push(cwd); return false; } };
  const decision = { kind: 'enter', messages: [] };
  let calls = 0;
  const result = await onPreStep({}, {}, runtime, {
    agent: { session: { header: { cwd: '/project-a' } } },
    messages: [],
  }, async () => { calls += 1; return decision; });
  assert.deepEqual(roots, ['/project-a']);
  assert.equal(calls, 1);
  assert.equal(result, decision);
});

test('pre-step passes an unavailable MAX request through without invoking the model', async () => {
  const config = Config({ mode: 'MAX', contextPath: '', notesPath: '', skillsPath: '', shinonMdPath: '', blocksLearnedPath: '', intentMemoryPath: '', probeJournalPath: '' });
  let modelCalls = 0;
  const ctx = { llm: { stream() { modelCalls += 1; throw new Error('unexpected model request'); } } };
  const runtime = loadRuntime(ctx, config);
  const message = user('Prüfe den Kontext');
  const decision = { kind: 'enter', messages: [message] };
  let calls = 0;
  const result = await onPreStep(ctx, config, runtime, { agent: { session: { id: 'a' } }, messages: [message] }, async () => {
    calls += 1;
    return decision;
  });
  assert.equal(result, decision);
  assert.equal(calls, 1);
  assert.equal(modelCalls, 0);
});

test('pre-step propagates downstream failure without calling next twice', async () => {
  const failure = new Error('downstream failed');
  let calls = 0;
  await assert.rejects(onPreStep({}, {}, {}, { messages: [] }, async () => {
    calls += 1;
    throw failure;
  }), (error) => error === failure);
  assert.equal(calls, 1);
});
