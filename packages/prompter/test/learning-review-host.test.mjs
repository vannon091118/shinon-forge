/**
 * Der Lernpruefer als Host: Ereignisse, Digest, EIN Modellaufruf, Vorschlag.
 *
 * Der Test faehrt mit einem Fake-LLM und einem temporaeren Projektbaum. Geprueft
 * wird die Grenze: der Antwortpfad wartet nie, der Abbruch erzeugt nichts, das
 * Budget greift, und ein Vorschlag geht erst nach Freigabe an den Eigentuemer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLearningReview, loadLearningRules } from '../assets/learning-review.js';
import { createSkillWriter, loadLifecycleRules } from '../assets/skill-lifecycle.js';

const SKILL_RULES = loadLifecycleRules();
const NOTE_RULES = JSON.parse(readFileSync(new URL('../assets/note-rules.json', import.meta.url), 'utf8'));
const quiet = { log: () => {}, warn: () => {} };

const RULES = (() => {
  const base = loadLearningRules();
  return {
    ...base,
    trigger: { ...base.trigger, settleMs: 0 },
    review: { ...base.review, nudgeTurns: 1, nudgeToolCalls: 0, cooldownMs: 0, maxPerSession: 10, maxQueue: 4, timeoutMs: 2000 },
  };
})();

const SKILL_ANSWER = {
  decision: 'skill',
  reason: 'Die Korrektur zeigt einen wiederverwendbaren Ablauf.',
  sources: ['message:m2'],
  candidate: {
    name: 'tempo-beim-test',
    description: 'Nutzen wenn ein Test die Zeitgrenze reisst, damit der Lauf gruen bleibt und die Grenze steht.',
    thema: 'tempo',
    bei: 'Ein Test ueberschreitet die Zeitgrenze',
    immer: 'den Test verkleinern statt die Grenze zu heben',
    weil: 'die Grenze schuetzt den Lauf, der Test ist das Problem',
  },
};

const MEMORY_ANSWER = {
  decision: 'memory',
  subject: 'test-tempo',
  claim: 'Bei einem Test ueber der Zeitgrenze den Test verkleinern, nicht die Grenze heben.',
  reason: 'Die Grenze schuetzt den Lauf.',
  sources: ['message:m2'],
};

function project() {
  const root = mkdtempSync(join(tmpdir(), 'shinon-review-'));
  mkdirSync(join(root, '.agents', 'skills'), { recursive: true });
  return root;
}

function fakeLlm(answer, { hang = false, onRequest = () => {} } = {}) {
  let calls = 0;
  return {
    ctx: {
      llm: {
        async *stream(request) {
          calls += 1;
          onRequest(request);
          if (hang) {
            await new Promise(() => {});
            return;
          }
          yield { type: 'text-delta', text: JSON.stringify(answer) };
        },
      },
    },
    calls: () => calls,
  };
}

function review(root, ctx, { persona = () => null, config = {} } = {}) {
  const writer = createSkillWriter({ rules: SKILL_RULES, noteRules: NOTE_RULES, root, log: quiet });
  return createLearningReview({
    ctx,
    config: {
      provider: 'p',
      model: 'm',
      memoryWriteApproval: true,
      skillWriteApproval: true,
      registryPath: '.shinon/learning-proposals.json',
      usagePath: '.shinon/skill-usage.json',
      ...config,
    },
    rules: RULES,
    skillRules: SKILL_RULES,
    noteRules: NOTE_RULES,
    writer,
    route: { provider: 'p', model: 'm' },
    persona,
    workspaceRoot: root,
    log: quiet,
    now: () => '2026-10-24T12:00:00.000Z',
  });
}

function user(id, text = 'Bitte pruefe den Test.') {
  return [{ event_type: 'message.received', session_id: 's1' }, { data: { source: { kind: 'user' }, message: { id }, content: [{ type: 'text', text }] } }];
}

function assistant(id, text = 'Der Test ist fertig.') {
  return [{ event_type: 'message.completed', session_id: 's1' }, { data: { message: { id, content: [{ type: 'text', text }] } } }];
}

const turnEnd = (session = 's1') => [{ event_type: 'turn.end', session_id: session }, { data: { reason: { kind: 'completed' }, turn: 1 } }];

async function waitFor(check, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('waitFor: Zeitgrenze');
}

const registryOf = (root) => JSON.parse(readFileSync(join(root, '.shinon', 'learning-proposals.json'), 'utf8'));

test('nicht blockierend: observe kehrt bei haengendem Modellstrom sofort zurueck, genau ein Aufruf', async () => {
  const root = project();
  const llm = fakeLlm(null, { hang: true });
  const engine = review(root, llm.ctx);
  engine.observe(...user('m1'));
  engine.observe(...assistant('m2'));
  const start = Date.now();
  engine.observe(...turnEnd());
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 50, `observe blockierte ${elapsed} ms`);
  await waitFor(() => llm.calls() === 1);
  assert.equal(llm.calls(), 1, 'mehr als ein Modellaufruf');
  engine.dispose();
  rmSync(root, { recursive: true, force: true });
});

test('abgebrochener Turn erzeugt keinen Auftrag und keinen Modellaufruf', async () => {
  const root = project();
  const llm = fakeLlm(SKILL_ANSWER);
  const engine = review(root, llm.ctx);
  engine.observe(...user('m1'));
  engine.observe(...assistant('m2'));
  engine.observe({ event_type: 'turn.end', session_id: 's1' }, { data: { reason: { kind: 'aborted' }, turn: 1 } });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(llm.calls(), 0);
  assert.equal(engine.pending(), 0);
  engine.dispose();
  rmSync(root, { recursive: true, force: true });
});

test('Skill ohne Freigabe: Vorschlag pending mit Pruefbefunden, keine Datei', async () => {
  const root = project();
  const requests = [];
  const llm = fakeLlm(SKILL_ANSWER, { onRequest: (request) => requests.push(request) });
  const engine = review(root, llm.ctx);
  engine.observe(...user('m1'));
  engine.observe(...assistant('m2'));
  engine.observe(...turnEnd());
  const registry = await waitFor(() => existsSync(join(root, '.shinon', 'learning-proposals.json')) && registryOf(root));
  const [proposal] = Object.values(registry.entries);
  assert.equal(proposal.target, 'skill');
  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.base.path, '.agents/skills/tempo-beim-test/SKILL.md');
  assert.equal(existsSync(join(root, '.agents', 'skills', 'tempo-beim-test', 'SKILL.md')), false, 'ohne Freigabe wurde geschrieben');
  assert.ok(proposal.checks.some((check) => check.id === 'EIGENTUEMER' && check.ok === true));
  assert.equal(requests.length, 1);
  assert.equal('tools' in requests[0], false, 'der Reviewer traegt Werkzeuge');
  assert.equal(requests[0].messages[0].content[0].text.includes('Der Test ist fertig.'), true);
  engine.dispose();
  rmSync(root, { recursive: true, force: true });
});

test('Skill automatisch: drei abgeschlossene Zuege und Schalter aus schreiben die Datei', async () => {
  const root = project();
  const rules = { ...RULES, review: { ...RULES.review, nudgeTurns: 3 } };
  const writer = createSkillWriter({ rules: SKILL_RULES, noteRules: NOTE_RULES, root, log: quiet });
  const llm = fakeLlm(SKILL_ANSWER);
  const engine = createLearningReview({
    ctx: llm.ctx,
    config: { provider: 'p', model: 'm', memoryWriteApproval: true, skillWriteApproval: false, registryPath: '.shinon/learning-proposals.json', usagePath: '.shinon/skill-usage.json' },
    rules,
    skillRules: SKILL_RULES,
    noteRules: NOTE_RULES,
    writer,
    route: { provider: 'p', model: 'm' },
    workspaceRoot: root,
    log: quiet,
    now: () => '2026-10-24T12:00:00.000Z',
  });
  engine.observe(...user('m1'));
  engine.observe(...assistant('m2'));
  for (let index = 0; index < 3; index += 1) engine.observe(...turnEnd());
  const registry = await waitFor(() => existsSync(join(root, '.shinon', 'learning-proposals.json')) && registryOf(root));
  const [proposal] = Object.values(registry.entries);
  assert.equal(proposal.status, 'auto-applied');
  assert.equal(proposal.undo.kind, 'skill');
  assert.equal(existsSync(join(root, '.agents', 'skills', 'tempo-beim-test', 'SKILL.md')), true);
  engine.dispose();
  rmSync(root, { recursive: true, force: true });
});

test('Memory ohne Freigabe: die Persona-Naht bekommt proposed, das Register bleibt pending', async () => {
  const root = project();
  const calls = [];
  const persona = () => ({ propose: (payload) => { calls.push(payload); return { ok: true, id: 'c:lp_x' }; } });
  const llm = fakeLlm(MEMORY_ANSWER);
  const engine = review(root, llm.ctx, { persona });
  engine.observe(...user('m1'));
  engine.observe(...assistant('m2'));
  engine.observe(...turnEnd());
  const registry = await waitFor(() => existsSync(join(root, '.shinon', 'learning-proposals.json')) && registryOf(root));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].decision, 'proposed');
  assert.equal(calls[0].contract, 'shinon.persona/memory-proposal-v1');
  assert.equal(Object.values(registry.entries)[0].status, 'pending');
  engine.dispose();
  rmSync(root, { recursive: true, force: true });
});

test('Memory automatisch: Korrektur und Schalter aus ergeben accepted', async () => {
  const root = project();
  const calls = [];
  const persona = () => ({ propose: (payload) => { calls.push(payload); return { ok: true, id: 'c:lp_y' }; } });
  const llm = fakeLlm(MEMORY_ANSWER);
  const engine = review(root, llm.ctx, { persona, config: { memoryWriteApproval: false } });
  engine.observe(...user('m1'));
  engine.observe(...assistant('m2'));
  engine.observe({ event_type: 'feedback.rated', session_id: 's1' }, { data: { item: { messageId: 'm2', rating: 'negative' } } });
  engine.observe({ event_type: 'feedback.noted', session_id: 's1' }, { data: { text: 'Nein, den Test verkleinern, nicht die Grenze heben.' } });
  const registry = await waitFor(() => existsSync(join(root, '.shinon', 'learning-proposals.json')) && registryOf(root));
  assert.equal(calls[0].decision, 'accepted');
  assert.equal(Object.values(registry.entries)[0].status, 'auto-applied');
  assert.equal(Object.values(registry.entries)[0].decision.by, 'review');
  engine.dispose();
  rmSync(root, { recursive: true, force: true });
});

test('Budget: eine volle Warteschlange verwirft sichtbar, nicht still', async () => {
  const root = project();
  const llm = fakeLlm(null, { hang: true });
  const rules = { ...RULES, review: { ...RULES.review, maxQueue: 1, maxConcurrent: 1 } };
  const writer = createSkillWriter({ rules: SKILL_RULES, noteRules: NOTE_RULES, root, log: quiet });
  const engine = createLearningReview({
    ctx: llm.ctx,
    config: { provider: 'p', model: 'm', registryPath: '.shinon/learning-proposals.json', usagePath: '.shinon/skill-usage.json' },
    rules,
    skillRules: SKILL_RULES,
    noteRules: NOTE_RULES,
    writer,
    route: { provider: 'p', model: 'm' },
    workspaceRoot: root,
    log: quiet,
  });
  engine.observe(...user('m1'));
  engine.observe(...assistant('m2'));
  for (let index = 0; index < 4; index += 1) engine.observe(...turnEnd());
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(llm.calls(), 1);
  assert.ok(engine.pending() <= 1, `Warteschlange: ${engine.pending()}`);
  engine.dispose();
  rmSync(root, { recursive: true, force: true });
});

test('Redaktion: ein Geheimnis aus dem Nutzertext erreicht das Modell nicht', async () => {
  const root = project();
  const requests = [];
  const llm = fakeLlm(MEMORY_ANSWER, { onRequest: (request) => requests.push(request) });
  const engine = review(root, llm.ctx);
  engine.observe(...user('m1', 'Mein Schluessel ist sk-CANARY-1234567890abcdef, merk ihn dir.'));
  engine.observe(...assistant('m2'));
  engine.observe(...turnEnd());
  await waitFor(() => requests.length === 1);
  const sent = requests[0].messages[0].content[0].text;
  assert.equal(sent.includes('CANARY'), false, 'der Wert steht im Modellaufruf');
  assert.equal(sent.includes('[REDACTED]'), true);
  engine.dispose();
  rmSync(root, { recursive: true, force: true });
});
