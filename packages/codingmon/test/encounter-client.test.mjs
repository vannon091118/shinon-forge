#!/usr/bin/env node
/**
 * packages/codingmon/test/encounter-client.test.mjs — Buehne, Deck und Kern (S5/S6).
 *
 * DREI FRAGEN, drei Abschnitte:
 *
 *   1. DRIFT — der eingebettete Kern in `client.js` ist genau das, was
 *      `scripts/assets/build-encounter-client.mjs` aus `assets/encounter.js`
 *      rendert. Kein handgeschriebener zweiter Reducer, keine stille Kopie.
 *   2. GLEICHHEIT — beide Fassungen (Host-Modul und Browser-Block) haben
 *      dieselbe Tabelle, dieselben Zustaende und treffen bei derselben
 *      Ereignisfolge dieselben Entscheidungen (outcome, reason, Zustand).
 *   3. BUEHNE UND DECK — im echten Client-Bundle (vm + Attrappe): Start, Lauf,
 *      Ende, Abbruch, Neustart, ein abgewiesenes Ereignis und der Abbau, der
 *      keine Timer stehen laesst; dazu das Pre-Flight-Deck aus B04 (sieben
 *      Angaben, Blockwahl im offenen Fenster, Einfrieren nach dem Start,
 *      Default-Pfad bei Ablauf).
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

/** Der Takt des Uebungszugs und das Eingriffsfenster — dieselben Werte wie im Client. */
const TICK = 650;
const HOLD = 2000;
/** Ready-Ereignis bei 6*650+1 ms; +1 ms, damit der Zustand sicher steht. */
const READY_MS = 6 * TICK + 2;

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

// ── Buehnen-Zugriff (S5/S6 teilen ihn) ────────────────────────────────────
const stageOf = (sim) => sim.slots.find((slot) => slot.options.id === 'shinon-encounter-stage').component;
const treeOf = (sim) => flatten(stageOf(sim)({}));
const textOf = (sim) => collectText(treeOf(sim)).join(' | ');
const waitReady = (sim) => sim.clock.advance(READY_MS);

/** Alle Knoten, die `predicate` erfuellen (auch in Komponenten-Kindern). */
function nodesOf(node, predicate, out = []) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    for (const child of node) nodesOf(child, predicate, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  nodesOf(node.children, predicate, out);
  return out;
}
const checkboxOf = (sim, id) => nodesOf(treeOf(sim), (node) => node.type === 'input' && node.props?.['data-block'] === id)[0];
const blockLabelOf = (sim, id) => nodesOf(treeOf(sim), (node) => node.type === 'label'
  && node.props?.['data-block'] === id && String(node.props?.className ?? '').includes('__cm_deck-block'))[0];
const buttonWith = (sim, label) => nodesOf(treeOf(sim), (node) => node.type === 'button'
  && collectText(node).join('').includes(label))[0];

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
      nextEvent('encounter.preflight.ready'),
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
    assert.ok(text.includes('Encounter') && text.includes('Noch kein Zug'), text.slice(0, 80));
    assert.ok(text.includes('Zug starten'), 'ohne Start-Knopf ist die Buehne eine Sackgasse');
    assert.ok(text.includes('Übungszug') || text.includes('Beispielzug'), 'ohne Kennzeichnung behauptet die Buehne einen echten Turn');
    assert.ok(text.includes('Noch kein Zug'), 'der Leerzustand sagt nicht, was er ist');
    assert.ok(!text.includes('Vorflug'), 'die Schiene steht schon im Leerzustand (Platzhalter-Look)');
  });

  test('Start, Lauf und Ende: der Reducer ist der einzige Zustandsbesitzer', () => {
    const sim = boot();
    const started = sim.api.encounter.start();
    assert.equal(started.steps, 14);
    assert.equal(started.holdMs, HOLD);
    assert.equal(sim.api.encounter.state().status, 'closed', 'der Start selbst setzt noch keinen Zustand');
    sim.clock.advance(2);
    assert.equal(sim.api.encounter.state().status, 'preflight', 'turn.started oeffnet den Vorflug');
    assert.ok(textOf(sim).includes('Vorflug'));

    sim.clock.advance(6 * TICK);
    const mid = sim.api.encounter.state();
    assert.equal(mid.status, 'preflight', 'preflight.ready allein wechselt NICHT in den Lauf');
    assert.deepEqual(plain(mid.preflight.blocks), ['persona-identity-core', 'enhancer-system-policy']);
    assert.equal(mid.task.taskClass, 'fix');
    assert.equal(mid.facts.valid, 3);

    sim.clock.advance(2);
    assert.equal(sim.api.encounter.state().preflight.ready, true);
    assert.equal(sim.api.encounter.holding(), true, 'das Eingriffsfenster ist offen');
    sim.api.encounter.continue();
    sim.clock.advance(2);
    assert.equal(sim.api.encounter.state().status, 'running');
    assert.ok(textOf(sim).includes('läuft'));

    sim.clock.advance(TICK * 20);
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
    sim.clock.advance(TICK * 3);
    const step = sim.api.encounter.abort();
    assert.equal(step.outcome, 'APPLIED');
    assert.equal(step.status, 'aborted');
    assert.equal(sim.api.encounter.state().outcome.kind, 'aborted');
    assert.equal(sim.api.encounter.holding(), false, 'der Abbruch laesst das Fenster offen');
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
    sim.clock.advance(READY_MS);
    assert.equal(sim.api.encounter.start(), null, 'zweiter Start im offenen Fenster');
    sim.clock.advance(12000);
    const state = sim.api.encounter.state();
    assert.equal(state.applied, 14, 'die Ereignisse des zweiten Zugs sind mitgelaufen');
    assert.equal(state.status, 'compact');
    assert.ok(!sim.api.encounter.log().some((entry) => entry.reason === 'FOREIGN_TURN'), 'ein fremder Turn steht im Protokoll');
  });

  test('die Schiene zeigt, WO ein Abbruch passiert ist (lastPhase, nicht geraten)', () => {
    const states = (sim) => nodesOf(treeOf(sim), (node) => node.props?.['data-state'] !== undefined
      && typeof node.props?.className === 'string' && node.props.className.includes('__cm_enc-step'))
      .map((node) => node.props['data-state']);

    const early = boot();
    early.api.encounter.start();
    early.clock.advance(TICK * 3);
    early.api.encounter.abort();
    assert.equal(early.api.encounter.state().lastPhase, 'preflight');
    assert.deepEqual(states(early), ['active', 'open', 'open', 'open'], 'ein Abbruch im Vorflug darf nicht die Pruefung markieren');

    const late = boot();
    late.api.encounter.start();
    waitReady(late);
    late.api.encounter.continue();
    late.clock.advance(2);
    assert.equal(late.api.encounter.state().status, 'running');
    late.api.encounter.abort();
    assert.equal(late.api.encounter.state().lastPhase, 'running');
    assert.deepEqual(states(late), ['done', 'active', 'open', 'open']);
  });

  test('Neu setzt auf den leeren Zustand zurueck — auch das Protokoll', () => {
    const sim = boot();
    sim.api.encounter.start();
    sim.clock.advance(12000);
    sim.api.encounter.reset();
    assert.equal(sim.api.encounter.state().status, 'closed');
    assert.equal(sim.api.encounter.state().applied, 0);
    assert.deepEqual(plain(sim.api.encounter.log()), []);
    assert.ok(textOf(sim).includes('Noch kein Zug'));
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
    waitReady(sim);
    for (const dispose of sim.disposers) dispose();
    assert.equal(sim.clock.pending().length, 0, 'ein Timer ueberlebt den Abbau');
    assert.equal(sim.sandbox.window.__codingmon, undefined);
  });
});

describe('S6 — Pre-Flight-Deck (B04)', () => {
  test('das Deck nennt im Vorflug jede der sieben Angaben — Absenzen sichtbar', () => {
    const sim = boot();
    sim.api.encounter.start();
    waitReady(sim);
    const text = textOf(sim);
    for (const label of ['Pre-Flight-Deck', 'Aufgabe', 'Tendenz', 'Konflikte', 'Fakten', 'Faktenquellen', 'Route', 'Budget', 'Wissensblöcke']) {
      assert.ok(text.includes(label), `Deck ohne ${label}: ${text.slice(0, 200)}`);
    }
    assert.ok(text.includes('Reparatur') && text.includes('fix'), 'Aufgabe fehlt');
    assert.ok(text.includes('3 VALID') && text.includes('1 UNTRUSTED') && text.includes('0 UNKNOWN'), 'Faktenzaehlung fehlt');
    assert.ok(text.includes('snap-uebung'), 'Snapshot-ID fehlt');
    assert.ok(text.includes('lokal / uebungszug'), 'Route fehlt');
    assert.ok(text.includes('nicht gemeldet'), 'fehlende Quellen muessen sichtbar sein, nicht erfunden');
    assert.ok(text.includes('nicht gemessen'), 'fehlendes Budget muss sichtbar sein, nicht geschaetzt');
    assert.ok(text.includes('kein Modellaufruf'), 'die Vorschau muss sich als Vorschau ausweisen');
  });

  test('ein Block laesst sich abwaehlen — und der Lauf startet mit genau dieser Auswahl', () => {
    const sim = boot();
    sim.api.encounter.start();
    // Vor `preflight.ready` ist die Auswahl noch nicht fest: ein Klick waere
    // eine Aenderung, die das naechste Vorflug-Ereignis ueberschreibt.
    sim.clock.advance(1);
    assert.equal(sim.api.encounter.toggleBlock('enhancer-system-policy'), null, 'eine Auswahl vor dem Ready wirkt');
    waitReady(sim);
    const box = checkboxOf(sim, 'enhancer-system-policy');
    assert.ok(box !== undefined, 'kein Schalter fuer den Block');
    assert.equal(box.props.disabled, false, 'im Vorflug muss der Schalter offen sein');
    box.props.onChange();
    assert.deepEqual(plain(sim.api.encounter.state().preflight.blocks), ['persona-identity-core']);
    assert.equal(blockLabelOf(sim, 'enhancer-system-policy').props['data-on'], 'off');
    // Die gezogene Auswahl geht durch den Reducer, nicht an ihm vorbei:
    // sieben Vorflug-Ereignisse plus das neue `block.selected`.
    assert.equal(sim.api.encounter.state().applied, 8);
    const start = buttonWith(sim, 'Lauf starten');
    assert.ok(start !== undefined, 'ohne Start-Knopf schliesst sich das Fenster nur per Timeout');
    start.props.onClick();
    sim.clock.advance(2);
    assert.equal(sim.api.encounter.state().status, 'running');
    assert.deepEqual(plain(sim.api.encounter.state().preflight.blocks), ['persona-identity-core'], 'der Lauf traegt eine andere Auswahl');
  });

  test('nach dem Start ist die Auswahl eingefroren und das Deck sagt es', () => {
    const sim = boot();
    sim.api.encounter.start();
    waitReady(sim);
    sim.api.encounter.continue();
    sim.clock.advance(2);
    const text = textOf(sim);
    assert.ok(text.includes('Änderungen zu spät'), 'das Deck verschweigt den Start');
    assert.ok(!text.includes('Lauf starten'), 'der Start-Knopf steht nach dem Start noch da');
    const box = checkboxOf(sim, 'persona-identity-core');
    assert.equal(box.props.disabled, true, 'der Block ist nach dem Start noch schaltbar');
    assert.equal(sim.api.encounter.toggleBlock('persona-identity-core'), null, 'ein Klick nach dem Start wirkt');
    assert.deepEqual(plain(sim.api.encounter.state().preflight.blocks), ['persona-identity-core', 'enhancer-system-policy']);
    assert.equal(sim.api.encounter.state().status, 'running');
  });

  test('Weiter ohne Eingriff ist der Default-Pfad: Fenster abgelaufen, Auswahl unveraendert', () => {
    const sim = boot();
    sim.api.encounter.start();
    waitReady(sim);
    assert.equal(sim.api.encounter.holding(), true);
    sim.clock.advance(HOLD + 2);
    assert.equal(sim.api.encounter.holding(), false, 'das Fenster bleibt nach dem Timeout offen');
    assert.equal(sim.api.encounter.state().status, 'running');
    assert.deepEqual(plain(sim.api.encounter.state().preflight.blocks), ['persona-identity-core', 'enhancer-system-policy']);
    // Der Timeout laeuft nicht zweimal: ein Continue danach ist keine zweite Anfrage.
    assert.equal(sim.api.encounter.continue(), null);
    sim.clock.advance(TICK * 20);
    assert.equal(sim.api.encounter.state().status, 'compact');
    assert.equal(sim.api.encounter.state().applied, 14);
  });

  test('ein Abbruch im offenen Fenster schliesst es und laesst keinen Timer stehen', () => {
    const sim = boot();
    sim.api.encounter.start();
    waitReady(sim);
    assert.equal(sim.api.encounter.holding(), true);
    const step = sim.api.encounter.abort();
    assert.equal(step.status, 'aborted');
    assert.equal(sim.api.encounter.holding(), false);
    assert.equal(sim.clock.pending().length, 0);
    assert.ok(!textOf(sim).includes('Pre-Flight-Deck'), 'das Deck steht nach dem Terminal noch da');
  });

  test('nach dem Terminal verschwindet das Deck', () => {
    const sim = boot();
    sim.api.encounter.start();
    sim.clock.advance(12000);
    assert.equal(sim.api.encounter.state().status, 'compact');
    assert.ok(!textOf(sim).includes('Pre-Flight-Deck'));
  });
});
