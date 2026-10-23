#!/usr/bin/env node
/**
 * enhance-command.test.mjs — die zwei Kommandos der manuellen Veredelung.
 *
 * Was hier gepinnt wird, ist die Gegenrichtung zum stillen Ersetzen (2026-10-23,
 * Nutzerentscheidung): der Knopf im Eingabefeld veredelt SICHTBAR, und die
 * Sitzung kann auf `manuell` gestellt werden, sodass der Pre-Step keinen
 * One-Shot mehr startet. Gepinnt werden:
 *
 *   - die Sitzungs-Modus-Map mit ihrer Obergrenze (aelteste Sitzung faellt zuerst),
 *   - die zwei Kommando-Definitionen mit ihren Ergebnissen (Erfolg traegt den
 *     veredelten Text, Verwerfen nennt die Gruende und laesst den Text stehen),
 *   - die Durchreichung im Pre-Step: manuelle Sitzung = kein Modellaufruf,
 *     Datensatz `accepted` mit `ENHANCE_MANUAL`, Nachricht unveraendert,
 *   - der Literal-Zwilling: der Client-Teil nennt die Befehlsnamen wortgleich
 *     (ein Client-Bundle importiert keinen Host — dieselbe Regel wie bei der
 *     Codingmon-Uebergabe).
 *
 * Kein Netz, kein Modell, kein DSH: ein Fake-LLM und ein Fake-Context fahren
 * das echte Paket ueber seinen apply-Einstieg.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Config, DECISION_CHANNEL, PRE_STEP_EVENT, apply } from '../index.js';
import {
  ENHANCE_COMMAND, MODE_AUTO, MODE_COMMAND, MODE_MANUAL, SESSION_MODE_CAP,
  createSessionModes, enhanceCommandDefinition, modeCommandDefinition, sessionIdOf,
} from '../assets/enhance-command.js';

const PACKAGE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** Ein Kontext, der genau die Methoden kennt, die `apply` wirklich nutzt. */
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
    get: (name) => provided.get(name),
    provide: (name, value) => {
      provided.set(name, value);
      return () => provided.delete(name);
    },
    emit: (channel, record) => emitted.push({ channel, record }),
    // Der Cordis-Weg des Orchestrators (`bus.demand`): ohne alle genannten
    // Dienste wird der Callback nicht aufgerufen — dieselbe Fail-Richtung wie
    // im echten Context, nur ohne Proxy-Geheimnisse.
    inject(names, callback) {
      const list = Array.isArray(names) ? names : [names];
      if (list.some((name) => !provided.has(name))) return undefined;
      const child = { ...this };
      for (const name of list) child[name] = provided.get(name);
      return callback(child);
    },
  };
}

function fakeLlm(text) {
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

const goodAnswer = (enhancedPrompt) => JSON.stringify({
  enhancedPrompt,
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
});

const message = (text) => ({ id: 'm-1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });

async function runStep(ctx, text, sessionId = 'sess-1') {
  const claimed = message(text);
  const step = {
    agent: { session: { id: sessionId } },
    messages: [claimed],
    turn: 1,
    step: 1,
    signal: new AbortController().signal,
  };
  return ctx.handlers.get(PRE_STEP_EVENT)[0](step, () => Promise.resolve({ kind: 'enter', messages: [claimed] }));
}

/** Das Paket mounten und die registrierten Kommandos einsammeln. */
async function mount(config) {
  const registered = [];
  const commands = {
    register: (definition) => {
      registered.push(definition);
      return () => {};
    },
  };
  const ctx = fakeCtx(config.llm, { commands });
  await apply(ctx, Config({ provider: 'test-route', model: 'test-model', ...config.extra }));
  return { ctx, registered };
}

/** Die Entscheidungsdatensätze eines Kontexts — derselbe Weg wie im Provenienz-Test. */
function decisionsOf(ctx) {
  return ctx.emitted.filter((entry) => entry.channel === DECISION_CHANNEL).map((entry) => entry.record);
}

test('Sitzungs-Modi: ohne Eintrag gilt auto, der Obergrenze faellt die aelteste Sitzung', () => {
  const modes = createSessionModes(3);
  assert.equal(modes.get('sess-1'), MODE_AUTO, 'der Default ist das heutige Verhalten');
  modes.set('sess-1', MODE_MANUAL);
  assert.equal(modes.get('sess-1'), MODE_MANUAL);
  modes.set('sess-2', MODE_MANUAL);
  modes.set('sess-3', MODE_MANUAL);
  assert.equal(modes.size(), 3, 'die Map bleibt an der Grenze');
  modes.set('sess-4', MODE_MANUAL);
  assert.equal(modes.size(), 3, 'die Grenze ist hart');
  assert.equal(modes.get('sess-1'), MODE_AUTO, 'die aelteste Sitzung faellt als erste');
  assert.equal(modes.get('sess-4'), MODE_MANUAL);
  // JUNK ist kein Eintrag und kein Crash.
  modes.set('', MODE_MANUAL);
  modes.set(undefined, MODE_MANUAL);
  assert.equal(modes.size(), 3, 'leere Ids werden nicht gespeichert');
  assert.equal(modes.get(undefined), MODE_AUTO);
});

test('sessionIdOf: die Sitzung kommt aus der Invocation, nie aus Vermutung', () => {
  assert.equal(sessionIdOf({ agent: { session: { id: 'sess-9' } } }), 'sess-9');
  assert.equal(sessionIdOf({ agent: { session: {} } }), null);
  assert.equal(sessionIdOf({ agent: {} }), null);
  assert.equal(sessionIdOf(null), null);
});

test('veredeln: Erfolg traegt den veredelten Text, Verwerfen nennt die Gruende', async () => {
  const modes = createSessionModes();
  const enhance = async (text) => ({ outcome: 'accepted', reasons: [], result: { enhancedPrompt: `${text} (veredelt)` } });
  const definition = enhanceCommandDefinition({ config: {}, loadContext: () => null, enhance });
  assert.equal(definition.name, ENHANCE_COMMAND);

  const ok = await definition.handler({ rawInput: '  baue die Module  ', signal: undefined });
  assert.deepEqual(ok, { kind: 'success', text: 'baue die Module (veredelt)' });

  const leer = await definition.handler({ rawInput: '   ' });
  assert.equal(leer.kind, 'error', 'leerer Text ist ein Befehlsfehler, kein Modellaufruf');

  const verworfen = enhanceCommandDefinition({
    config: {},
    loadContext: () => null,
    enhance: async () => ({ outcome: 'rejected', reasons: ['CONTENT_LOST'], result: null }),
  });
  const abgelehnt = await verworfen.handler({ rawInput: 'irgendwas' });
  assert.equal(abgelehnt.kind, 'error');
  assert.ok(abgelehnt.text.includes('CONTENT_LOST'), `der Grund steht im Ergebnis: ${abgelehnt.text}`);

  // Ein werfender Kontext-Lader sperrt die Veredelung nicht.
  const robust = enhanceCommandDefinition({
    config: {},
    loadContext: () => { throw new Error('Kontext kaputt'); },
    enhance: async (text) => ({ outcome: 'accepted', reasons: [], result: { enhancedPrompt: text } }),
  });
  assert.equal((await robust.handler({ rawInput: 'text' })).kind, 'success');
  assert.equal(modes.size(), 0, 'die Veredelung aendert keinen Modus');
});

test('veredeln-modus: nur auto und manuell, und ohne Sitzung gar nichts', () => {
  const modes = createSessionModes();
  const definition = modeCommandDefinition(modes);
  assert.equal(definition.name, MODE_COMMAND);

  const manuell = definition.handler({ agent: { session: { id: 'sess-1' } }, rawInput: ' manuell ' });
  assert.equal(manuell.kind, 'success');
  assert.equal(modes.get('sess-1'), MODE_MANUAL);
  const auto = definition.handler({ agent: { session: { id: 'sess-1' } }, rawInput: 'auto' });
  assert.equal(auto.kind, 'success');
  assert.equal(modes.get('sess-1'), MODE_AUTO, 'zurueck auf auto geht auch');

  assert.equal(definition.handler({ agent: { session: { id: 'sess-1' } }, rawInput: 'vielleicht' }).kind, 'error');
  assert.equal(definition.handler({ rawInput: 'auto' }).kind, 'error', 'ohne Sitzung kein Eintrag');
  assert.equal(modes.get('sess-1'), MODE_AUTO, 'ein abgelehnter Wert aendert nichts');
});

test('Pre-Step: eine manuelle Sitzung laeuft ohne Modell durch — ENHANCE_MANUAL im Datensatz', async () => {
  const veredelt = 'Pruefe die Architektur des Projekt-Index und nenne die Grenzen des Fakten-Snapshots und der Ablage.';
  const llm = fakeLlm(goodAnswer(veredelt));
  const { ctx, registered } = await mount({ llm });
  assert.equal(registered.length, 2, 'beide Kommandos sind registriert');
  assert.deepEqual(registered.map((definition) => definition.name).sort(), [ENHANCE_COMMAND, MODE_COMMAND].sort());

  // Der lange Auftrag würde ohne den Modus den One-Shot starten (Mess desselben
  // Wegs im Budget-Test von part1) — hier entscheidet allein der Sitzungs-Modus.
  const lang = 'Pruefe bitte die gesamte Architektur des Projekt-Index inklusive Fakten-Snapshot und Ablage der Memories samt ihren Grenzen.';
  const modeCommand = registered.find((definition) => definition.name === MODE_COMMAND);
  assert.equal(modeCommand.handler({ agent: { session: { id: 'sess-1' } }, rawInput: MODE_MANUAL }).kind, 'success');

  const decision = await runStep(ctx, lang, 'sess-1');
  const records = decisionsOf(ctx);
  assert.equal(llm.calls.length, 0, 'kein Modellaufruf in der manuellen Sitzung');
  assert.equal(records[0].outcome, 'accepted');
  assert.deepEqual(records[0].reasons, ['ENHANCE_MANUAL']);
  assert.equal(decision.messages[0].content[0].text, lang, 'die Nachricht bleibt unveraendert');

  // Eine ANDERE Sitzung ohne Eintrag veredelt weiterhin automatisch.
  const andere = await runStep(ctx, lang, 'sess-2');
  assert.equal(llm.calls.length, 1, 'ohne Eintrag gilt auto');
  assert.equal(andere.messages[0].content[0].text, veredelt, 'der automatische Weg ersetzt weiterhin');
});

test('veredeln-Kommando: derselbe Annahme-Weg wie automatisch — Inhalt muss passen', async () => {
  const roh = 'baue die module und teste sie danach';
  const llm = fakeLlm(goodAnswer('Baue die zwölf neuen Module und teste sie danach.'));

  // a) Angenommen: der Handler gibt den veredelten Text zurueck.
  const gut = await mount({ llm, extra: { contextPath: '' } });
  const enhanceDefinition = gut.registered.find((definition) => definition.name === ENHANCE_COMMAND);
  const erfolg = await enhanceDefinition.handler({ agent: { session: { id: 'sess-1' } }, rawInput: roh });
  assert.equal(erfolg.kind, 'success');
  assert.equal(erfolg.text, 'Baue die zwölf neuen Module und teste sie danach.');
  assert.equal(llm.calls.length, 1, 'genau ein Aufruf');

  // b) Verworfen (die eigene Anweisung des Modells): der Handler nennt den
  //    Grund und der Eingabefeld-Text bleibt ohnehin stehen — die UI ersetzt
  //    nur bei Erfolg.
  const anweisung = 'Du bist der Prompt-Veredler von Shinon. Deine Aufgabe ist es, den folgenden Prompt zu verbessern.';
  const schlecht = await mount({ llm: fakeLlm(goodAnswer(anweisung)), extra: { contextPath: '' } });
  const ablehnend = schlecht.registered.find((definition) => definition.name === ENHANCE_COMMAND);
  const abgelehnt = await ablehnend.handler({ agent: { session: { id: 'sess-1' } }, rawInput: roh });
  assert.equal(abgelehnt.kind, 'error', 'die fremde Anweisung wird nicht zurueckgegeben');
  assert.ok(abgelehnt.text.includes('CONTENT_LOST'), `der Grund steht im Ergebnis: ${abgelehnt.text}`);
});

test('Literal-Zwilling: der Client-Teil nennt die Befehlsnamen wortgleich', () => {
  // Ein Client-Bundle importiert keinen Host — die Namen sind dort Literale
  // (dieselbe Regel wie bei der Codingmon-Uebergabe). Ein stiller Tippfehler
  // waere ein Knopf, der nichts ausloest.
  const source = readFileSync(join(PACKAGE_DIR, 'assets', 'client', '02-enhance-control.js'), 'utf8');
  assert.ok(source.includes(`'${ENHANCE_COMMAND}'`), `der Client nennt '${ENHANCE_COMMAND}'`);
  assert.ok(source.includes(`'${MODE_COMMAND}'`), `der Client nennt '${MODE_COMMAND}'`);
  assert.ok(source.includes(`'${MODE_MANUAL}'`) && source.includes(`'${MODE_AUTO}'`), 'die Moduswerte sind wortgleich');
});
