/**
 * Teil 5/5 von prompter-contract.test.mjs — das DIAGNOSE-PROTOKOLL: was das
 * Modell geantwortet hat, steht im Log.
 *
 * Eigener Teil (Schnitt 2026-10-24): die drei Faelle hier fragen nicht, ob die
 * Veredelung wirkt, sondern ob ein VERWURF noch nachvollziehbar ist — leerer
 * Stream, abgeschnittene Antwort, geworfener Aufruf. Das ist ein anderer
 * Eigentuemer als die Fallback-Regeln in Teil 3, die den Ausgang pruefen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundle, goodResult, reply, userMessage, stepPayload, connect, fakeLlm, route } from './prompter-contract-fixtures.mjs';

test('Diagnose: eine verworfene One-Shot-Antwort wird mit Rohtext protokolliert', async () => {
  const cases = [
    // Eine Antwort ohne ein Zeichen ist seit Welle 2 ein EIGENER Grund
    // (`EMPTY_STREAM`) — vorher stand dafür `NO_JSON`, derselbe Grund wie für
    // falsch formatiertes JSON, obwohl gar keine Antwort kam.
    { name: 'leere Antwort', behaviour: '', reason: 'EMPTY_STREAM', empty: true },
    { name: 'kaputtes JSON', behaviour: '{"enhancedPrompt": }', reason: 'INVALID_JSON', empty: false },
    { name: 'Policy-Verwurf (Antwort bleibt nachvollziehbar)', behaviour: reply(goodResult({ preservedIntent: false })), reason: 'INTENT_NOT_PRESERVED', empty: false },
  ];
  for (const { name, behaviour, reason, empty } of cases) {
    const llm = fakeLlm(behaviour);
    const { ctx, records, dispose } = connect({ ...route }, { llm });
    const claimed = [userMessage()];
    const downstream = { kind: 'enter', messages: claimed };
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    let decision;
    try {
      decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(decision, downstream, `${name}: Roh-Prompt bleibt erhalten`);
    assert.equal(records[0].outcome, 'rejected', name);
    assert.ok(records[0].reasons[0].startsWith(reason), `${name}: ${records[0].reasons[0]}`);
    const rawLog = warnings.find((line) => line.includes('verworfene One-Shot-Antwort'));
    assert.ok(rawLog, `${name}: Rohtext-Log fehlt`);
    assert.ok(rawLog.includes(reason), `${name}: Grund fehlt im Rohtext-Log`);
    // Die Chunks-Zählung trennt die drei NO_JSON-Ursachen (leer vs. nur
    // Reasoning vs. Feld-Drift) und muss deshalb IMMER mitkommen.
    assert.ok(rawLog.includes('Chunks:'), `${name}: Chunks-Zählung fehlt`);
    // Finish-Grund + Token-Stand: bei antwortlosem Stream der einzige Hinweis
    // auf provider-seitigen Abbruch vs. Filter vs. Längenstopp.
    assert.ok(rawLog.includes('Finish:'), `${name}: Finish-/Token-Zeile fehlt`);
    if (empty) assert.ok(rawLog.includes('leere Antwort'), `${name}: Leere Antwort muss benannt werden`);
    else assert.ok(rawLog.includes(behaviour.slice(0, 40)), `${name}: Rohtext fehlt im Log`);
    // Was WIR gefragt haben, gehoert in dieselbe Zeile: sonst ist ein leerer
    // Stream nicht von einer leeren ANFRAGE zu unterscheiden.
    assert.ok(rawLog.includes('Anfrage:'), `${name}: Anfrage-Daten fehlen`);
    assert.ok(rawLog.includes('test-route/test-model'), `${name}: angefragte Route fehlt`);
    assert.ok(/System=\d+Z, Nutzer=\d+Z/.test(rawLog), `${name}: Prompt-Groessen fehlen`);
    assert.ok(/Dauer=\d+ms/.test(rawLog), `${name}: Dauer fehlt`);
    dispose();
  }
});
test('Diagnose: antwortloser Stream (nur usage+finish, Grund als Objekt) wird lesbar protokolliert', async () => {
  const silent = {
    calls: [],
    stream(options) {
      this.calls.push(options);
      return (async function* chunks() {
        yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } };
        yield { type: 'finish', reason: { type: 'aborted', by: 'timeout' } };
      })();
    },
  };
  const { ctx, records, dispose } = connect({ ...route }, { llm: silent });
  const claimed = [userMessage()];
  const downstream = { kind: 'enter', messages: claimed };
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));
  } finally {
    console.warn = originalWarn;
  }

  const rawLog = warnings.find((line) => line.includes('verworfene One-Shot-Antwort'));
  assert.ok(rawLog, 'Rohtext-Log fehlt');
  assert.ok(rawLog.includes('Chunks: usage=1, finish=1'), `Chunks-Zählung fehlt oder falsch: ${rawLog}`);
  assert.ok(rawLog.includes('"type":"aborted"'), `Finish-Grund als Objekt muss lesbar sein: ${rawLog}`);
  assert.equal(rawLog.includes('[object Object]'), false, 'unlesbarer Objekt-Grund im Log');
  assert.ok(rawLog.includes('leere Antwort'), 'die Leere muss benannt werden');
  assert.ok(/Dauer=\d+ms/.test(rawLog), 'Dauer fehlt');
  assert.ok(rawLog.includes('test-route/test-model'), 'angefragte Route fehlt');
  assert.equal(records[0].outcome, 'rejected', 'NO_JSON bleibt der Ausgang');
  dispose();
});
test('Diagnose: ein fehlgeschlagener One-Shot wird mit Name, Meldung und Dauer protokolliert', async () => {
  const boom = new Error('stream aborted after 15000ms');
  boom.name = 'AbortError';
  const failing = { calls: [], stream() { throw boom; } };
  const { ctx, records, dispose } = connect({ ...route }, { llm: failing });
  const claimed = [userMessage()];
  const downstream = { kind: 'enter', messages: claimed };
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));
  } finally {
    console.warn = originalWarn;
  }

  const failureLog = warnings.find((line) => line.includes('One-Shot fehlgeschlagen'));
  assert.ok(failureLog, 'Fehler-Log fehlt');
  assert.ok(failureLog.includes('LLM_FAILED:AbortError'), `Name fehlt: ${failureLog}`);
  assert.ok(failureLog.includes('stream aborted after 15000ms'), `Meldung fehlt: ${failureLog}`);
  assert.ok(/Dauer=\d+ms|nach \d+ms/.test(failureLog), `Dauer fehlt: ${failureLog}`);
  assert.ok(failureLog.includes('test-route/test-model'), `angefragte Route fehlt: ${failureLog}`);
  assert.equal(records[0].reasons[0], 'LLM_FAILED:AbortError', 'Grund bleibt benannt');
  dispose();
});
