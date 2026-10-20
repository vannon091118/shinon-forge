/**
 * @shinon/prompter — abort-trace.test.mjs
 *
 * Die Abbruchquote im ECHTEN Schritt: ein Fake-LLM liefert erst eine gültige
 * Antwort, dann eine ohne JSON. Gepinnt wird, dass der Datensatz den Grund und
 * seine Zähler trägt, dass die Quote aus dem Puffer wächst und dass die
 * Fensterspiegelung dieselben Felder führt. Kein DSH, kein Netz.
 *
 * Dass keine Provenienz- oder Fähigkeitskarten-Spur dabei verloren geht, prüfen
 * `provenance-trace.test.mjs` und `capability-map.test.mjs` weiter — dieser Test
 * ergänzt nur die dritte Spur am selben Datensatz.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ABORT_CONTRACT, Config, DECISION_CHANNEL, PRE_STEP_EVENT, apply } from '../index.js';

const ENHANCED = JSON.stringify({
  enhancedPrompt: 'Bitte pruefe src/a.mjs.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
});

function fakeCtx(answers) {
  const handlers = new Map();
  const emitted = [];
  const provided = new Map();
  let index = 0;
  return {
    emitted,
    handlers,
    llm: {
      stream() {
        const text = answers[Math.min(index, answers.length - 1)];
        index += 1;
        return (async function* chunks() {
          if (text !== '') yield { type: 'text-delta', index: 0, text };
        })();
      },
    },
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
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

const message = (text) => ({ id: 'm-1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });

async function runStep(ctx, text) {
  const claimed = message(text);
  const step = { agent: { session: { id: 'sess-abort' } }, messages: [claimed], turn: 1, step: 1, signal: new AbortController().signal };
  return ctx.handlers.get(PRE_STEP_EVENT)[0](step, () => Promise.resolve({ kind: 'enter', messages: [claimed] }));
}

function config() {
  return Config({
    provider: 'p',
    model: 'm',
    mode: 'MIN',
    notesPath: '',
    skillsPath: '',
    intentPatternsPath: '',
    blocksLearnedPath: '',
    trace: true,
  });
}

test('ein Turn ohne JSON trägt Grund, Zähler und Quote', async () => {
  // MIN braucht keinen Kontext; der zweite Aufruf liefert KEINEN Text → EMPTY_STREAM
  // (seit Welle 2 ein eigener Grund, nicht mehr NO_JSON).
  const ctx = fakeCtx([ENHANCED, '']);
  const dispose = apply(ctx, config());
  globalThis.window = {};
  try {
    await runStep(ctx, 'pruefe a');
    await runStep(ctx, 'pruefe b');
  } finally {
    delete globalThis.window;
    dispose();
  }

  const sent = ctx.emitted.filter((entry) => entry.channel === DECISION_CHANNEL);
  assert.equal(sent.length, 2, 'genau eine Entscheidung je Schritt');
  const [first, second] = sent.map((entry) => entry.record);

  assert.equal(first.outcome, 'accepted');
  assert.equal(first.abort, null, 'ein angenommener Turn ist kein Abbruch');
  assert.deepEqual(first.abort_counts, {});
  assert.equal(first.abort_quote.contract, ABORT_CONTRACT);
  assert.deepEqual([first.abort_quote.turns, first.abort_quote.aborts], [1, 0]);

  assert.equal(second.outcome, 'rejected');
  assert.deepEqual(second.abort, { id: 'LEERER_STREAM', label: 'Leerer Stream', rank: 1 });
  assert.deepEqual(second.abort_counts, { LEERER_STREAM: 1 });
  assert.deepEqual(
    [second.abort_quote.turns, second.abort_quote.aborts, second.abort_quote.quote, second.abort_quote.top],
    [2, 1, 0.5, 'LEERER_STREAM'],
  );

  // Die Provenienz bleibt daneben unberührt (eigene Spur, eigener Vertrag).
  assert.equal(second.provenance_contract, 'shinon.provenance/v1');
  assert.equal(second.provenance.complete, true);
});

test('die Fensterspiegelung trägt dieselben drei Felder wie der Datensatz', async () => {
  const ctx = fakeCtx([ENHANCED, '']);
  const dispose = apply(ctx, config());
  globalThis.window = {};
  let trace;
  try {
    await runStep(ctx, 'pruefe a');
    await runStep(ctx, 'pruefe b');
    trace = globalThis.window.__shinonPrompterTrace;
  } finally {
    delete globalThis.window;
    dispose();
  }
  assert.ok(Array.isArray(trace) && trace.length === 2);
  const latest = trace[0];
  assert.deepEqual(latest.abort, { id: 'LEERER_STREAM', label: 'Leerer Stream', rank: 1 });
  assert.deepEqual(latest.abort_counts, { LEERER_STREAM: 1 });
  assert.equal(latest.abort_quote.aborts, 1);
  assert.equal(latest.abort_quote.turns, 2);
  assert.equal(latest.abort_quote.topLabel, 'Leerer Stream');
});
