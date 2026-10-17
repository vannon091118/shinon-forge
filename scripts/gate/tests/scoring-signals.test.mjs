#!/usr/bin/env node
/**
 * Der ganze Weg, mit den ECHTEN Bundles: Spine → shinon/event → Scoring → Scorecard.
 *
 * Warum als eigener Test: die Paket-Tests fahren den reinen Kern. Hier laufen
 * beide Pakete ueber ihre echte `apply()`-Schnittstelle an einem gemeinsamen Bus,
 * und die Ereignisse kommen in der Form, die DSH wirklich schreibt —
 * `session/event` mit `(session, event)` und `data`, wie im echten Log gemessen:
 *
 * → Kanon: docs/COMMENT-KANON.md#k-b3aa670f5723
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Beide Pakete in eine Kopie legen und mit einem Schemastery-Stub laden. */
async function loadBundles() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-scoring-e2e-'));
  const stub = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-stub', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(stub, 'index.js'), 'const p = new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : p), apply: () => p, construct: () => p });\nexport default p;\n');
  for (const name of ['events', 'scoring']) {
    cpSync(join(ROOT, 'packages', name), join(work, 'packages', name), { recursive: true });
  }
  const events = await import(pathToFileURL(join(work, 'packages/events/index.js')).href);
  const scoring = await import(pathToFileURL(join(work, 'packages/scoring/index.js')).href);
  return { events, scoring };
}

/** Ein Host mit EINEM Bus: `emit` ruft genau die Handler, die `on` gebunden hat. */
function createHost() {
  const handlers = new Map();
  const ctx = {
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) ?? []).filter((entry) => entry !== handler));
    },
    emit(channel, ...args) {
      for (const handler of handlers.get(channel) ?? []) handler(...args);
    },
    get() {
      return undefined;
    },
    provide() {
      return () => {};
    },
  };
  return {
    ctx,
    handlers,
    dispatch(signal, ...args) {
      for (const handler of handlers.get(signal) ?? []) handler(...args);
    },
  };
}

/** Beide Bundles an denselben Bus haengen; Rueckgabe: der laufende Zustand. */
async function connect() {
  const { events, scoring } = await loadBundles();
  const host = createHost();
  const log = console.log;
  const warn = console.warn;
  let runtime;
  console.log = () => {};
  console.warn = () => {};
  try {
    events.apply(host.ctx, {
      schemaPath: './assets/event-spine.json',
      replayPath: './assets/replay/session-created.json',
      emitChannel: 'shinon/event',
      defaultSessionId: '',
      clock: '2026-10-11T10:00:00.000Z',
    });
    runtime = scoring.apply(host.ctx, {
      scorePath: './assets/scoring-state.json',
      technicalPath: './assets/technical-profile.json',
      triggersPath: './assets/skill-triggers.json',
      rulesPath: './assets/signal-rules.json',
      replayPath: './assets/replay/scoring-demo.json',
      eventsChannel: 'shinon/event',
    });
  } finally {
    console.log = log;
    console.warn = warn;
  }
  return { ...host, runtime };
}

const SESSION = { id: 'sess-1' };

/** Ein echtes Sitzungsereignis: `(session, event)` mit data — wie im Log. */
const sessionEvent = (type, data, seq = 1) => ({
  type,
  seq,
  time: 1791739858292,
  data,
});

const humanMessage = (text, id = 'msg-1', kind = 'user') => sessionEvent('user/message', {
  content: [{ type: 'text', text }],
  source: { kind },
  role: 'user',
  id,
});

const rated = (messageId, ratingValue) => sessionEvent('feedback/message-put', {
  sessionId: 'sess-1',
  item: { messageId, rating: ratingValue, version: 'v1', createdAt: 1791739858292 },
});

const QUESTION = 'Prüfe bitte die Scoring Schicht und die Signaltabelle im Paket';

// ── 1. Die Naht steht ────────────────────────────────────────────────────────

test('scoring-e2e: die Ohren hängen am Kanal des Spines', async () => {
  const { handlers, runtime } = await connect();
  assert.ok((handlers.get('shinon/event') ?? []).length >= 1, 'kein Zuhörer auf shinon/event');
  assert.deepEqual(runtime.scorecard().scores, { correctness: 0.5, trust: 0.5 });
  assert.equal(runtime.collector.stats().observed, 0);
});

// ── 2. Der ganze Weg ─────────────────────────────────────────────────────────

test('scoring-e2e: Menschen-Text, Wiederholung, Urteil, Widerruf — Wert für Wert', async () => {
  const { dispatch, runtime } = await connect();

  // Erste Frage: es gibt nichts zu vergleichen, kein Signal.
  dispatch('session/event', SESSION, humanMessage(QUESTION));
  assert.deepEqual(runtime.scorecard().scores, { correctness: 0.5, trust: 0.5 });

  // Harness-Text mit demselben Typ: zählt nicht (echte Marker aus dem Log).
  for (const kind of ['agent-instructions', 'runtime-context']) {
    dispatch('session/event', SESSION, humanMessage(QUESTION, 'harness', kind));
  }
  assert.deepEqual(runtime.scorecard().scores, { correctness: 0.5, trust: 0.5 });
  assert.equal(runtime.collector.stats().reasons.NOT_HUMAN, 2);

  // Die Frage kommt wieder — die Antwort hat nicht getragen.
  dispatch('session/event', SESSION, humanMessage('Prüfe bitte die Scoring Schicht und die Signaltabelle', 'msg-2'));
  assert.equal(runtime.scorecard().scores.correctness, 0.41);

  // Ein positives Urteil zu EINER Antwort (nativ, widerrufbar).
  dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  const afterRating = runtime.scorecard();
  assert.ok(afterRating.scores.correctness > 0.41);

  // Der Widerruf derselben Antwort nimmt genau diese Zeile zurück.
  dispatch('session/event', SESSION, sessionEvent('feedback/message-delete', { sessionId: 'sess-1', messageId: 'ans-1' }));
  assert.equal(runtime.scorecard().scores.correctness, 0.41, 'nach dem Widerruf gilt wieder der Wert von vorher');
  assert.equal(runtime.collector.stats().retracted, 1);

  // Turn-Ende: regulär = schwächste Zustimmung, Abbruch = Korrektur.
  dispatch('session/event', SESSION, sessionEvent('turn/end', { turn: 7, reason: { kind: 'completed' } }));
  const accepted = runtime.scorecard().scores.correctness;
  assert.ok(accepted > 0.41);
  dispatch('session/event', SESSION, sessionEvent('turn/end', { turn: 8, reason: { kind: 'aborted', reason: { kind: 'user' } } }));
  assert.ok(runtime.scorecard().scores.correctness < accepted);

  // Ein fehlerhafter Turn ist KEIN Signal — er ändert nichts.
  const before = runtime.scorecard().scores.correctness;
  dispatch('session/event', SESSION, sessionEvent('turn/end', { turn: 9, reason: { kind: 'error' } }));
  assert.equal(runtime.scorecard().scores.correctness, before);
});

test('scoring-e2e: unbekannte und unvollständige Ereignisse ändern nichts', async () => {
  const { dispatch, runtime } = await connect();

  // Ein Typ, den der Spine nicht abbildet: er kommt gar nicht erst an.
  dispatch('session/event', SESSION, sessionEvent('brandneuer/typ', { sessionId: 'sess-1' }));
  assert.equal(runtime.collector.stats().observed, 0, 'ein nicht abgebildeter Typ darf die Ohren nicht erreichen');

  // Ein abgebildeter Typ, den die Signaltabelle nicht kennt: gezählt, folgenlos.
  dispatch('session/event', SESSION, sessionEvent('workspace/changes', { turn: 4 }));

  // Ein Urteil mit unbekanntem Wert: benannter Grund, keine Wertung.
  dispatch('session/event', SESSION, sessionEvent('feedback/message-put', { sessionId: 'sess-1', item: { messageId: 'a', rating: 'vielleicht' } }));

  assert.deepEqual(runtime.scorecard().scores, { correctness: 0.5, trust: 0.5 });
  assert.equal(runtime.collector.stats().records, 0);
  const reasons = runtime.collector.stats().reasons;
  assert.ok(reasons['UNKNOWN_SOURCE:workspace.changed'] === 1, `Grund fehlt: ${JSON.stringify(reasons)}`);
  assert.ok(reasons['UNKNOWN_RATING:vielleicht'] === 1, `Grund fehlt: ${JSON.stringify(reasons)}`);
});

test('scoring-e2e: dieselbe Folge ergibt zweimal dieselbe Tafel', async () => {
  const run = async () => {
    const { dispatch, runtime } = await connect();
    dispatch('session/event', SESSION, humanMessage(QUESTION));
    dispatch('session/event', SESSION, humanMessage(QUESTION, 'msg-2'));
    dispatch('session/event', SESSION, rated('ans-1', 'positive'));
    dispatch('session/event', SESSION, sessionEvent('turn/end', { turn: 3, reason: { kind: 'completed' } }));
    return runtime.scorecard();
  };
  assert.deepEqual(await run(), await run());
});

// ── 3. Keine Browser-Abhängigkeit ────────────────────────────────────────────

test('scoring-e2e: die Client-Hälfte bleibt ein Platzhalter ohne Zuhörer', () => {
  const client = readFileSync(join(ROOT, 'packages/scoring/client.js'), 'utf8');
  assert.ok(!client.includes('ctx.on'), 'die Client-Hälfte darf keinen Ereignis-Zuhörer binden');
  assert.ok(!client.includes('signal-rules'), 'die Signaltabelle ist Host-Sache');
  assert.match(client, /__ModuleLoader__\.load\(/, 'die Registrierung bleibt');
  assert.match(client, /id: '@shinon\/scoring'/, 'die Kennung bleibt');
});
