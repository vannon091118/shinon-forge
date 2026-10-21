#!/usr/bin/env node
/**
 * packages/codingmon/test/encounter-client.test.mjs — die Buehne und ihr Kern (S5 / B02).
 *
 * DREI FRAGEN, drei Abschnitte:
 *
 *   1. DRIFT — der eingebettete Kern in `client.js` ist genau das, was
 *      `scripts/assets/build-encounter-client.mjs` aus `assets/encounter.js`
 *      rendert. Kein handgeschriebener zweiter Reducer, keine stille Kopie.
 *   2. GLEICHHEIT — beide Fassungen (Host-Modul und Browser-Block) haben
 *      dieselbe Tabelle, dieselben Zustaende und treffen bei derselben
 *      Ereignisfolge dieselben Entscheidungen (outcome, reason, Zustand).
 *   3. BUEHNE — im echten Client-Bundle (vm + Attrappe): Start, Lauf, Ende,
 *      Abbruch, Neustart, ein abgewiesenes Ereignis und der Abbau, der keine
 *      Timer stehen laesst.
 *
 * Kein DSH, kein Browser, keine Installation: der Kern ist importfrei, die
 * Attrappe steht in `harness.mjs`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { boot, collectText, flatten } from './harness.mjs';
import * as host from '../assets/encounter.js';
import { currentBlock, renderEncounterBlock } from '../../../scripts/assets/build-encounter-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_FILE = join(HERE, '..', 'client.js');
const CORE_FILE = join(HERE, '..', 'assets', 'encounter.js');
const CLIENT = readFileSync(CLIENT_FILE, 'utf8');
const CORE = readFileSync(CORE_FILE, 'utf8');

/** Den eingebetteten Block in einem eigenen Kontext ausfuehren. */
function browserCore() {
  const block = currentBlock(CLIENT);
  const sandbox = { __core: null };
  vm.runInContext(block + '\nthis.__core = ENCOUNTER_CORE;', vm.createContext(sandbox), { filename: 'encounter-block.js' });
  return sandbox.__core;
}

/**
 * Ein Vergleichsobjekt ohne Funktionen — die Tabelle ist Daten plus `apply`.
 * Der JSON-Umweg ist Absicht: der Browser-Block laeuft in einem eigenen vm-
 * Kontext, und dessen Arrays tragen ein anderes `Array.prototype`. `deepEqual`
 * wuerde daran scheitern, obwohl die Werte gleich sind — verglichen wird Inhalt,
 * nicht Realm-Identitaet.
 */
const plain = (value) => JSON.parse(JSON.stringify(value));
const plainEvents = (events) => plain(Object.fromEntries(Object.entries(events).map(([type, definition]) => [type, {
  from: definition.from,
  to: definition.to,
  source: definition.source,
  payload: definition.payload,
}])));

const nextEvent = (type, extra = {}) => host.encounterEvent(type, {
  eventId: `cmp-${extra.eventId ?? Math.random().toString(36).slice(2)}`,
  turnId: 'turn-cmp',
  sessionId: 'session-cmp',
  ...extra,
});

describe('S5a — der eingebettete Kern ist abgeleitet, nicht abgeschrieben', () => {
  test('der Block in client.js ist byte-gleich mit dem Generator', () => {
    assert.equal(currentBlock(CLIENT), renderEncounterBlock(CORE), 'client.js und assets/encounter.js driften');
  });

  test('die Marker stehen genau einmal und sind nicht von Hand gefuellt', () => {
    assert.equal(CLIENT.split('generated-encounter-core').length - 1, 2, 'Marker fehlt oder ist doppelt');
    assert.ok(!CLIENT.includes('(ersetzt von scripts/assets/build-encounter-client.mjs)'), 'Platzhalter steht noch im Bundle');
  });

  test('der Kern traegt keine Imports und keinen `export` im Browser-Block', () => {
    const block = currentBlock(CLIENT);
    assert.ok(!/^\s*import\s/m.test(block), 'Import im Block');
    assert.ok(!/^\s*export\s/m.test(block), 'export im Block');
  });

  test('die Buehne nennt keinen Ereignistyp als Literal neben dem Kern', () => {
    // Der Uebungszug ist eine REIHENFOLGE, keine zweite Typenliste. Deshalb
    // stehen die Typnamen dort als Datenzeilen — aber der Reducer, die
    // Source Map und die Zustandsmenge kommen ausschliesslich aus dem Block.
    const withoutBlock = CLIENT.split(currentBlock(CLIENT)).join('');
    assert.ok(!withoutBlock.includes('ENCOUNTER_EVENTS ='), 'zweite Ereignistabelle im Client');
    assert.ok(!withoutBlock.includes('ENCOUNTER_STATES ='), 'zweite Zustandsliste im Client');
    assert.ok(!withoutBlock.includes('ENCOUNTER_SOURCE_MAP ='), 'zweite Source Map im Client');
  });
});

describe('S5b — Host-Kern und Browser-Kern entscheiden gleich', () => {
  test('Tabelle, Source Map und Zustaende sind deckungsgleich', () => {
    const core = browserCore();
    assert.equal(core.ENCOUNTER_CONTRACT, host.ENCOUNTER_CONTRACT);
    assert.deepEqual(plain(core.ENCOUNTER_STATES), plain(host.ENCOUNTER_STATES));
    assert.deepEqual(plain(core.ENCOUNTER_TERMINAL_STATES), plain(host.ENCOUNTER_TERMINAL_STATES));
    assert.deepEqual(plain(core.ENCOUNTER_EVENT_TYPES), plain(host.ENCOUNTER_EVENT_TYPES));
    assert.deepEqual(plainEvents(core.ENCOUNTER_EVENTS), plainEvents(host.ENCOUNTER_EVENTS));
    assert.deepEqual(JSON.parse(JSON.stringify(core.ENCOUNTER_SOURCE_MAP)), JSON.parse(JSON.stringify(host.ENCOUNTER_SOURCE_MAP)));
  });

  test('dieselbe Folge ergibt in beiden Fassungen denselben Zustand', () => {
    const core = browserCore();
    const sequence = [
      nextEvent('encounter.turn.started'),
      nextEvent('encounter.task.classified', { payload: { taskClass: 'fix', taskLabel: 'Reparatur' } }),
      nextEvent('encounter.fact.validated', { payload: { snapshotId: 's1', valid: 2, untrusted: 1, unknown: 0 } }),
      nextEvent('encounter.route.selected', { payload: { provider: 'lokal', model: 'uebungszug' } }),
      nextEvent('encounter.run.started', { payload: { step: 1 } }),
      nextEvent('encounter.answer.received'),
      nextEvent('encounter.result-contract.failed', { payload: { reason: 'kein Beleg' } }),
      nextEvent('encounter.receipt.compacted'),
      // Absichtlich danach: ein verspaetetes Ereignis muss in beiden
      // Fassungen gleich abgewiesen werden (Zustand steht still).
      nextEvent('encounter.turn.completed', { payload: { reason: 'zu spaet' } }),
      // Ein unbekannter Typ laesst sich nicht bauen (`encounterEvent` wirft per
      // Vertrag) — die Huelle wird deshalb von Hand geschrieben.
      {
        contract: host.ENCOUNTER_CONTRACT, eventId: 'cmp-unbekannt', type: 'encounter.erfunden',
        sessionId: 'session-cmp', turnId: 'turn-cmp', source: '@shinon/events', payload: {},
      },
    ];
    let was = host.createEncounterState();
    let browser = core.createEncounterState();
    for (const event of sequence) {
      const hostStep = host.reduceEncounter(was, event);
      const browserStep = core.reduceEncounter(browser, event);
      assert.equal(browserStep.outcome, hostStep.outcome, `${event.type}: Ausgang`);
      assert.equal(browserStep.reason, hostStep.reason, `${event.type}: Grund`);
      assert.deepEqual(plain(browserStep.state), plain(hostStep.state), `${event.type}: Zustand`);
      was = hostStep.state;
      browser = browserStep.state;
    }
    assert.equal(was.status, 'compact');
  });
});

describe('S5c — die Buehne im echten Bundle', () => {
  const stageOf = (sim) => sim.slots.find((slot) => slot.options.id === 'shinon-encounter-stage').component;
  const textOf = (sim) => collectText(flatten(stageOf(sim)({}))).join(' | ');

  test('die Buehne meldet sich im Composer-Dock an (eigener Slot, eigene Ordnung)', () => {
    const sim = boot();
    const slot = sim.slots.find((entry) => entry.options.id === 'shinon-encounter-stage');
    assert.ok(slot !== undefined, 'kein Slot shinon-encounter-stage');
    assert.equal(slot.options.name, 'conversation.composer.dock');
    assert.equal(typeof slot.component, 'function');
    assert.ok(!sim.slots.some((entry) => entry.options.id === 'shinon-encounter-stage' && entry.options.order < 20), 'Ordnung kollidiert mit der EXP-Leiste');
  });

  test('leer heisst sichtbar: bereit, mit Start-Knopf, nicht `null`', () => {
    const sim = boot();
    const text = textOf(sim);
    assert.ok(text.includes('Encounter') && text.includes('bereit'), text.slice(0, 80));
    assert.ok(text.includes('Zug starten'), 'ohne Start-Knopf ist die Buehne eine Sackgasse');
    assert.ok(text.includes('Übungszug'), 'ohne Kennzeichnung behauptet die Buehne einen echten Turn');
  });

  test('Start, Lauf und Ende: der Reducer ist der einzige Zustandsbesitzer', () => {
    const sim = boot();
    const started = sim.api.encounter.start();
    assert.equal(started.steps, 14);
    assert.equal(sim.api.encounter.state().status, 'closed', 'der Start selbst setzt noch keinen Zustand');
    sim.clock.advance(2);
    assert.equal(sim.api.encounter.state().status, 'preflight', 'turn.started oeffnet den Vorflug');
    assert.ok(textOf(sim).includes('Vorflug'));

    sim.clock.advance(650 * 6);
    const mid = sim.api.encounter.state();
    assert.equal(mid.status, 'preflight', 'preflight.ready allein wechselt NICHT in den Lauf');
    assert.deepEqual(plain(mid.preflight.blocks), ['persona-identity-core', 'enhancer-system-policy']);
    assert.equal(mid.task.taskClass, 'fix');
    assert.equal(mid.facts.valid, 3);

    sim.clock.advance(650 * 2);
    assert.equal(sim.api.encounter.state().status, 'running');
    assert.ok(textOf(sim).includes('läuft'));

    sim.clock.advance(650 * 20);
    const end = sim.api.encounter.state();
    assert.equal(end.status, 'compact');
    assert.equal(end.outcome.kind, 'contract-passed');
    assert.equal(end.tools.open, 0);
    assert.ok(textOf(sim).includes('verdichtet'), textOf(sim).slice(0, 120));
    assert.equal(sim.api.encounter.log()[0].type, 'encounter.receipt.compacted');
    // Kein Timer bleibt stehen: der naechste Lauf beginnt nicht mit Altlast.
    assert.equal(sim.clock.pending().length, 0, 'Timer nach dem Ende uebrig');
  });

  test('Abbruch ist ein Zustand des Reducers, kein Ausblenden der Buehne', () => {
    const sim = boot();
    sim.api.encounter.start();
    sim.clock.advance(650 * 3);
    const step = sim.api.encounter.abort();
    assert.equal(step.outcome, 'APPLIED');
    assert.equal(step.status, 'aborted');
    assert.equal(sim.api.encounter.state().outcome.kind, 'aborted');
    assert.equal(sim.clock.pending().length, 0, 'Abbruch laesst Timer stehen');
    assert.ok(textOf(sim).includes('abgebrochen'));
    assert.ok(textOf(sim).includes('Neu'), 'nach dem Abbruch fehlt der Weg zurueck');
    // Ein Abbruch im Terminal ist keine zweite Wirkung.
    assert.equal(sim.api.encounter.abort(), null);
  });

  test('ein Doppelklick startet keinen zweiten Zug', () => {
    // Gefunden im Playtest: in den ersten Millisekunden steht der Status noch
    // auf `closed`, waehrend der Zug schon laeuft. Ein zweiter Klick haette
    // einen zweiten Satz Timer mit fremder turnId gestartet.
    const sim = boot();
    assert.ok(sim.api.encounter.start() !== null);
    assert.equal(sim.api.encounter.start(), null, 'zweiter Start waehrend des Laufs');
    sim.clock.advance(2);
    assert.equal(sim.api.encounter.start(), null, 'zweiter Start im Vorflug');
    sim.clock.advance(650 * 14);
    const state = sim.api.encounter.state();
    assert.equal(state.applied, 14, 'die Ereignisse des zweiten Zugs sind mitgelaufen');
    assert.equal(state.status, 'compact');
    assert.ok(!sim.api.encounter.log().some((entry) => entry.reason === 'FOREIGN_TURN'), 'ein fremder Turn steht im Protokoll');
  });

  test('die Schiene zeigt, WO ein Abbruch passiert ist (lastPhase, nicht geraten)', () => {
    const states = (sim) => {
      const out = [];
      const walk = (node) => {
        if (node === null || node === undefined) return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (typeof node === 'object' && node.props?.['data-state'] !== undefined
          && typeof node.props?.className === 'string' && node.props.className.includes('__cm_enc-step')) {
          out.push(node.props['data-state']);
        }
        if (typeof node === 'object') walk(node.children);
      };
      walk(flatten(stageOf(sim)({})));
      return out;
    };

    const early = boot();
    early.api.encounter.start();
    early.clock.advance(650 * 3);
    early.api.encounter.abort();
    assert.equal(early.api.encounter.state().lastPhase, 'preflight');
    assert.deepEqual(states(early), ['active', 'open', 'open', 'open'], 'ein Abbruch im Vorflug darf nicht die Pruefung markieren');

    const late = boot();
    late.api.encounter.start();
    late.clock.advance(650 * 8);
    assert.equal(late.api.encounter.state().status, 'running');
    late.api.encounter.abort();
    assert.equal(late.api.encounter.state().lastPhase, 'running');
    assert.deepEqual(states(late), ['done', 'active', 'open', 'open']);
  });

  test('Neu setzt auf den leeren Zustand zurueck — auch das Protokoll', () => {
    const sim = boot();
    sim.api.encounter.start();
    sim.clock.advance(650 * 14);
    sim.api.encounter.reset();
    assert.equal(sim.api.encounter.state().status, 'closed');
    assert.equal(sim.api.encounter.state().applied, 0);
    assert.deepEqual(plain(sim.api.encounter.log()), []);
    assert.ok(textOf(sim).includes('bereit'));
  });

  test('ein fremdes Ereignis wird abgewiesen und der Zustand bleibt derselbe', () => {
    const sim = boot();
    sim.api.encounter.start();
    sim.clock.advance(2);
    const before = sim.api.encounter.state();
    const result = sim.api.encounter.feed({
      contract: 'shinon.encounter/event-v1',
      eventId: 'fremd-1',
      type: 'encounter.run.started',
      sessionId: 'andere',
      turnId: 'fremder-turn',
      source: '@shinon/events',
      payload: { step: 9 },
    });
    assert.equal(result.outcome, 'REJECTED');
    assert.equal(result.reason, 'FOREIGN_TURN');
    assert.deepEqual(plain(sim.api.encounter.state()), plain(before));
    assert.ok(textOf(sim).includes('FOREIGN_TURN'), 'die Buehne verschweigt die Absage');
  });

  test('die Zustandskopie ist eine Kopie: Veraendern von aussen wirkt nicht hinein', () => {
    const sim = boot();
    const copy = sim.api.encounter.state();
    copy.status = 'completed';
    copy.preflight.blocks.push('fremd');
    assert.equal(sim.api.encounter.state().status, 'closed');
    assert.deepEqual(plain(sim.api.encounter.state().preflight.blocks), []);
  });

  test('der Abbau raeumt den Uebungszug ab (kein Timer in ein fremdes Panel)', () => {
    const sim = boot();
    sim.api.encounter.start();
    sim.clock.advance(2);
    for (const dispose of sim.disposers) dispose();
    assert.equal(sim.clock.pending().length, 0, 'ein Timer ueberlebt den Abbau');
    assert.equal(sim.sandbox.window.__codingmon, undefined);
  });
});
