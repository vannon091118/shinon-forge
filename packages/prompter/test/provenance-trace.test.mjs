#!/usr/bin/env node
/**
 * provenance-trace.test.mjs — die Leiter im echten Schritt.
 *
 * Kein Modell, kein Netz: ein Fake-LLM liefert eine gültige Antwort, der
 * Waterfall `agent/pre-step` läuft durch das echte Paket. Gepinnt wird die
 * Naht, nicht die Meinung des Modells:
 *
 *   - der Entscheidungsdatensatz trägt `provenance_contract` und `provenance`,
 *   - jede eingehängte Quelle hat GENAU einen Eintrag mit Zeiger,
 *   - der Block enthält keinen Prompt-Text und keinen Dateiinhalt,
 *   - die Fensterspiegelung trägt den Zensus, nicht die Einträge,
 *   - ohne Kontext ist die Leiter leer und `complete` — ehrliche Leere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CAPABILITIES_CONTRACT, Config, DECISION_CHANNEL, INDEX_BUDGET_TOKENS, INDEX_CONTRACT, INDEX_SERVICE, PRE_STEP_EVENT, PROVENANCE_CONTRACT, apply,
} from '../index.js';
import { PROVENANCE_CLASSES, parsePointer } from '../assets/provenance.js';

const NARRATIVE_CHANNEL = 'shinon/narrative/state';
const SCORING_SERVICE = 'shinon_scoring_state';
const SCORING_CONTRACT = 'shinon.scoring-state/read-v1';

/** Ein Kontext, der genau die vier Methoden kennt, die `apply` wirklich nutzt. */
function fakeCtx(llm, services = {}) {
  const handlers = new Map();
  const emitted = [];
  const provided = new Map(Object.entries(services));
  const ctx = {
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
  return ctx;
}

function fakeLlm(text = JSON.stringify({
  enhancedPrompt: 'Bitte pruefe src/a.mjs.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
})) {
  const calls = [];
  return {
    calls,
    stream(options) {
      calls.push(options);
      return (async function* chunks() {
        yield { type: 'text-delta', index: 0, text };
      })();
    },
  };
}

const message = (text) => ({ id: 'm-1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });

/**
 * Einen Schritt fahren. Wichtig: `next` liefert DASSELBE Nachrichtenobjekt
 * zurueck, das im Payload stand — `replacePrompt` findet die Nachricht ueber
 * Identitaet, nicht ueber ihren Text. Zwei gleiche Objekte waeren zwei
 * Nachrichten, und der Ersatz fiele als MESSAGE_NOT_FOUND aus.
 */
async function runStep(ctx, text) {
  const claimed = message(text);
  const step = {
    agent: { session: { id: 'sess-1' } },
    messages: [claimed],
    turn: 1,
    step: 1,
    signal: new AbortController().signal,
  };
  return ctx.handlers.get(PRE_STEP_EVENT)[0](step, () => Promise.resolve({ kind: 'enter', messages: [claimed] }));
}

/** Einen Kontext als Datei ablegen; `loadContext` löst `file://`-URLs direkt auf. */
function contextFile(files) {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-provenance-'));
  const file = join(dir, 'context.json');
  writeFileSync(file, JSON.stringify({
    project: 'projekt',
    files,
    symbols: [],
    constraints: [],
    touches: [],
    dependencies: [],
  }), 'utf8');
  return { url: pathToFileURL(file).href, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('Trace: jede eingehängte Quelle hat einen Eintrag, der Block bleibt ohne Inhalt', async () => {
  const context = contextFile([{ path: 'src/a.mjs', content: 'export const a = 1;' }]);
  const llm = fakeLlm();
  const ctx = fakeCtx(llm);
  ctx.provide(SCORING_SERVICE, {
    contract: SCORING_CONTRACT,
    read: () => ({ stance: 'sachlich', tendencies: [] }),
  });
  const dispose = apply(ctx, Config({
    provider: 'p',
    model: 'm',
    mode: 'MAX',
    contextPath: context.url,
    notesPath: '',
    skillsPath: '',
    intentPatternsPath: '',
    blocksLearnedPath: '',
    trace: true,
  }));
  // Die Narrative kommt auf ihrem eigenen Kanal; der Prompter hält den letzten.
  const narrate = ctx.handlers.get(NARRATIVE_CHANNEL)[0];
  narrate({ arc_id: 'bogen-1', narrator: 'shinon', relationship_state: 'wach' });

  globalThis.window = {};
  try {
    await runStep(ctx, 'pruefe a');
  } finally {
    delete globalThis.window;
    dispose();
    context.cleanup();
  }

  const sent = ctx.emitted.filter((entry) => entry.channel === DECISION_CHANNEL);
  assert.equal(sent.length, 1, 'genau eine Entscheidung je Schritt');
  const record = sent[0].record;
  assert.equal(record.outcome, 'accepted');
  assert.equal(record.provenance_contract, PROVENANCE_CONTRACT);
  assert.equal(record.provenance.contract, PROVENANCE_CONTRACT);
  assert.deepEqual(Object.keys(record.provenance.classes).sort(), [...PROVENANCE_CLASSES].sort());
  assert.deepEqual(record.provenance.classes, { FACT: 1, DERIVED: 0, JUDGEMENT: 1, NARRATIVE: 1, PROPOSAL: 1 });
  assert.equal(record.provenance.violations.length, 0);
  assert.equal(record.provenance.complete, true);

  const byClass = Object.fromEntries(record.provenance.entries.map((entry) => [entry.class, entry]));
  assert.deepEqual(byClass.FACT, { class: 'FACT', pointer: 'src/a.mjs', source: 'prompter.contextPath' });
  assert.deepEqual(byClass.JUDGEMENT, { class: 'JUDGEMENT', pointer: SCORING_CONTRACT, source: SCORING_SERVICE });
  assert.deepEqual(byClass.NARRATIVE, { class: 'NARRATIVE', pointer: 'shinon.narrative/v1', source: NARRATIVE_CHANNEL });
  assert.deepEqual(byClass.PROPOSAL, { class: 'PROPOSAL', pointer: 'shinon.prompter/result-v1', source: 'one-shot' });

  // Kein Begriff der Karte in „pruefe a": dann gibt es keinen Brief, und der
  // Datensatz NENNT den Grund, statt das Feld stillschweigend wegzulassen.
  assert.equal(record.brief, null);
  assert.equal(record.brief_reason, 'KEIN_TREFFER');

  // Jeder Zeiger ist gültig — die Leiter prüft dieselbe Form wie der Kern.
  for (const entry of record.provenance.entries) {
    assert.equal(parsePointer(entry.pointer).ok, true, `${entry.class}:${entry.pointer}`);
  }

  // Kein Prompt-Text, kein Dateiinhalt im Block: der Datensatz reist als
  // Ereignis durch den Host und trägt nur Adressen.
  const serialized = JSON.stringify(record.provenance);
  assert.equal(serialized.includes('export const a = 1;'), false, 'kein Dateiinhalt');
  assert.equal(serialized.includes('pruefe a'), false, 'kein Nutzertext');
  assert.equal(serialized.includes('sachlich'), false, 'kein Urteilswert');
  assert.equal(serialized.includes('bogen-1'), false, 'keine Narrative-Felder');
});

test('Fenster: die Spiegelung trägt den Zensus, nicht die Einträge', async () => {
  const context = contextFile([{ path: 'src/a.mjs', content: 'export const a = 1;' }]);
  const ctx = fakeCtx(fakeLlm());
  const dispose = apply(ctx, Config({
    provider: 'p',
    model: 'm',
    mode: 'MAX',
    contextPath: context.url,
    notesPath: '',
    skillsPath: '',
    intentPatternsPath: '',
    blocksLearnedPath: '',
    trace: true,
  }));

  globalThis.window = {};
  try {
    await runStep(ctx, 'pruefe a');
    const trace = globalThis.window.__shinonPrompterTrace;
    assert.equal(Array.isArray(trace), true);
    assert.equal(trace.length, 1);
    assert.deepEqual(Object.keys(trace[0].provenance).sort(), [
      'classes', 'complete', 'contract', 'duplicates', 'entries', 'omitted', 'violations',
    ]);
    assert.equal(trace[0].provenance.entries, 2, 'FACT plus PROPOSAL, keine Einträge-Liste');
    assert.equal(trace[0].provenance.violations, 0);
    assert.equal(trace[0].provenance.duplicates, 0);
    assert.equal(trace[0].provenance.complete, true);
    assert.deepEqual(trace[0].provenance.classes, { FACT: 1, DERIVED: 0, JUDGEMENT: 0, NARRATIVE: 0, PROPOSAL: 1 });
  } finally {
    delete globalThis.window;
    dispose();
    context.cleanup();
  }
});

test('Index: DERIVED mit Pfad, und die Spurfelder nennen Dateien und Budget', async () => {
  const ctx = fakeCtx(fakeLlm());
  ctx.provide(INDEX_SERVICE, {
    contract: INDEX_CONTRACT,
    resolveContext: () => ({
      project: 'projekt',
      files: [{ path: 'src/b.mjs', content: 'export const b = 2;' }],
      symbols: [],
      constraints: [],
      touches: [],
      dependencies: [],
    }),
  });
  const dispose = apply(ctx, Config({
    provider: 'p',
    model: 'm',
    mode: 'MAX',
    notesPath: '',
    skillsPath: '',
    intentPatternsPath: '',
    blocksLearnedPath: '',
    trace: true,
  }));
  try {
    await runStep(ctx, 'pruefe b');
  } finally {
    dispose();
  }
  const record = ctx.emitted.find((entry) => entry.channel === DECISION_CHANNEL).record;
  assert.equal(record.context_source, 'index', 'die Quelle ist der Index, nicht die Datei');
  assert.deepEqual(record.context_files, ['src/b.mjs'], 'die Spur nennt die Datei auch beim Index');
  assert.equal(record.context_budget_tokens, INDEX_BUDGET_TOKENS);
  assert.ok(record.context_chars > 0, 'die Zeichenzahl ist gemessen, nicht null');
  assert.deepEqual(record.provenance.classes, { FACT: 0, DERIVED: 1, JUDGEMENT: 0, NARRATIVE: 0, PROPOSAL: 1 });
  assert.deepEqual(record.provenance.entries[0], { class: 'DERIVED', pointer: 'src/b.mjs', source: INDEX_SERVICE });
});

test('ohne Kontext: die Leiter ist leer und vollständig — keine erfundene Quelle', async () => {
  const ctx = fakeCtx(fakeLlm());
  const dispose = apply(ctx, Config({
    provider: 'p',
    model: 'm',
    mode: 'MAX',
    notesPath: '',
    skillsPath: '',
    intentPatternsPath: '',
    blocksLearnedPath: '',
    trace: true,
  }));
  try {
    await runStep(ctx, 'pruefe a');
  } finally {
    dispose();
  }
  const record = ctx.emitted.find((entry) => entry.channel === DECISION_CHANNEL).record;
  assert.equal(record.outcome, 'unavailable');
  assert.equal(record.provenance.entries.length, 0);
  assert.equal(record.provenance.violations.length, 0);
  assert.equal(record.provenance.complete, true, 'nichts eingehängt ist keine Lücke');
  assert.deepEqual(record.provenance.classes, { FACT: 0, DERIVED: 0, JUDGEMENT: 0, NARRATIVE: 0, PROPOSAL: 0 });
});

test('Aufgabenbrief: die Karte hängt den Brief an, die Spur nennt den Eigentümer', async () => {
  const context = contextFile([{ path: 'src/a.mjs', content: 'export const a = 1;' }]);
  const ctx = fakeCtx(fakeLlm());
  const dispose = apply(ctx, Config({
    provider: 'p',
    model: 'm',
    mode: 'MAX',
    contextPath: context.url,
    notesPath: '',
    skillsPath: '',
    intentPatternsPath: '',
    blocksLearnedPath: '',
    trace: true,
  }));

  globalThis.window = {};
  let result;
  try {
    // Ein AUFTRAG, keine Frage: „Wo werden … begrenzt?" bekam früher denselben
    // Brief — und damit eine Aufgabe, die niemand gestellt hat. Eine Frage
    // erweitert dieser Lauf nicht (Test direkt darunter).
    result = await runStep(ctx, 'Prüfe, wo Markierungen begrenzt werden.');
    const trace = globalThis.window.__shinonPrompterTrace;
    assert.equal(trace[0].brief.id, 'markierungen-grenzen');
    assert.equal(trace[0].brief.owner, 'markers');
    assert.equal(trace[0].brief_reason, null);
  } finally {
    delete globalThis.window;
    dispose();
    context.cleanup();
  }

  // Der Brief hängt HINTER dem veredelten Prompt und ist als Hinweis markiert.
  const text = result.messages[0].content[0].text;
  assert.ok(text.startsWith('Bitte pruefe src/a.mjs.'), text);
  assert.ok(text.includes('<task_brief contract="shinon.capabilities/v1" class="DERIVED">'), text);
  assert.ok(text.includes('Frage: Wo werden Markierungen begrenzt?'), text);
  assert.ok(text.includes('Fähigkeit: @shinon/markers — Global __DSH_MARKERS_CONFIG__'), text);
  assert.ok(text.includes('Grenze: keine Inhaltsprüfung; keine Prompt-Bausteine'), text);
  assert.ok(text.trimEnd().endsWith('</task_brief>'), text);

  const record = ctx.emitted.find((entry) => entry.channel === DECISION_CHANNEL).record;
  assert.equal(record.brief.contract, CAPABILITIES_CONTRACT);
  assert.equal(record.brief.id, 'markierungen-grenzen');
  assert.equal(record.brief.owner, 'markers');
  assert.ok(record.brief.chars > 0);
  assert.equal(record.brief_reason, null);
  const derived = record.provenance.entries.filter((entry) => entry.class === 'DERIVED');
  assert.deepEqual(derived, [{ class: 'DERIVED', pointer: CAPABILITIES_CONTRACT, source: 'prompter.capabilityMap' }]);
  // Der Blocktext reist in den Prompt, nicht in das Ereignis.
  assert.equal(JSON.stringify(record).includes('<task_brief'), false);
  assert.equal(JSON.stringify(record).includes('keine Inhaltsprüfung'), false);
});

test('eine Frage wird klassifiziert, aber nie erweitert — kein Aufgabenbrief', async () => {
  // GEMESSEN am 2026-10-22 im laufenden Host: „Wer bist du?" kam als
  // „Wer bist du? <task_brief …>Frage: Wer entscheidet über Identität und
  // Vorschlags-Review? …" beim Modell an. Der Brief war für einen AUFTRAG
  // gedacht und erfand hier die Aufgabe. Die Regel steht in AGENTS.md: eine
  // Frage wird klassifiziert, aber nie expandiert.
  const context = contextFile([{ path: 'src/a.mjs', content: 'export const a = 1;' }]);
  const ctx = fakeCtx(fakeLlm());
  const dispose = apply(ctx, Config({
    provider: 'p',
    model: 'm',
    mode: 'MAX',
    contextPath: context.url,
    notesPath: '',
    skillsPath: '',
    intentPatternsPath: '',
    blocksLearnedPath: '',
    trace: true,
  }));

  globalThis.window = {};
  let result;
  try {
    result = await runStep(ctx, 'Wer bist du?');
    const trace = globalThis.window.__shinonPrompterTrace;
    assert.equal(trace[0].brief, null, 'kein Brief für eine Frage');
    assert.equal(trace[0].brief_reason, 'FRAGE');
  } finally {
    delete globalThis.window;
    dispose();
    context.cleanup();
  }

  const text = result.messages[0].content[0].text;
  assert.equal(text.includes('<task_brief'), false, `Brief in einer Frage: ${text}`);
  assert.equal(text.includes('Vorschlags-Review'), false);
  const record = ctx.emitted.find((entry) => entry.channel === DECISION_CHANNEL).record;
  assert.equal(record.brief, null);
  assert.equal(record.brief_reason, 'FRAGE');
  assert.equal(record.provenance.classes.DERIVED, 0);
});
