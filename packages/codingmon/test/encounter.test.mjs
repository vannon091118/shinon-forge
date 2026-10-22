#!/usr/bin/env node
/**
 * packages/codingmon/test/encounter.test.mjs — der Encounter-Vertrag (S4 / B03).
 *
 * EINZELTEST: kein DSH, kein Browser, kein Modell, keine Uhr, kein Netz — und
 * keine Installation. Gefahren wird `../assets/encounter.js`, ein Kern ohne
 * Imports; die Quelle jedes Ereignisses wird gegen die ECHTEN Dateien geprueft
 * (`packages/events/assets/event-spine.json` und die Paketordner).
 *
 * DREI ZUSAGEN, die dieser Test traegt:
 *   1. Jedes definierte Ereignis geht EINMAL durch den Reducer und erreicht
 *      genau den Zustand, den die Tabelle nennt.
 *   2. Der Reducer veraendert seine Eingabe nicht — geprueft an einem tief
 *      eingefrorenen Zustand und an einem Vorher/Nachher-Vergleich.
 *   3. Ein unbekanntes Ereignis verhaelt sich DEFINIERT (IGNORED, Zustand
 *      identisch), und ein kaputtes wird mit einem Code abgewiesen. Nichts
 *      wirft, nichts raet.
 *
 * Lauf: `npm run test:codingmon`.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENCOUNTER_CONTRACT, ENCOUNTER_EVENTS, ENCOUNTER_EVENT_MEMORY, ENCOUNTER_EVENT_TYPES,
  ENCOUNTER_SOURCE_KINDS, ENCOUNTER_SOURCE_MAP, ENCOUNTER_STATES, ENCOUNTER_TERMINAL_STATES,
  createEncounterState, encounterEvent, foldEncounter, reduceEncounter,
} from '../assets/encounter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_FILE = join(HERE, '..', 'assets', 'encounter.js');
const SPINE_FILE = join(HERE, '..', '..', 'events', 'assets', 'event-spine.json');
const PACKAGES_DIR = join(HERE, '..', '..');

/** Ein Zustand in einem bestimmten Zustand — die Form bleibt die des Kerns. */
function stateAt(status, turnId = 'turn-1') {
  return { ...createEncounterState(), status, turnId: status === 'closed' ? null : turnId, sessionId: 'session-1' };
}

/** Tief einfrieren: ein Schreibzugriff im Reducer wuerde hier werfen. */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

let counter = 0;
const nextEvent = (type, extra = {}) => encounterEvent(type, { eventId: `evt-${(counter += 1)}`, turnId: 'turn-1', sessionId: 'session-1', ...extra });

describe('eine Definition, eine Quelle', () => {
  test('jeder Eintrag nennt Type, Herkunft, Staende, Payload-Allowlist und Wirkung', () => {
    for (const [type, definition] of Object.entries(ENCOUNTER_EVENTS)) {
      // Zwei Formen sind erlaubt: `encounter.<sache>.<phase>` und — wenn die
      // Sache selbst das Ereignis ist — `encounter.<sache>` (`encounter.abort`).
      assert.match(type, /^encounter\.[a-z-]+(\.[a-z-]+)?$/, `${type}: Namensform`);
      assert.ok(Array.isArray(definition.from) && definition.from.length > 0, `${type}: keine Herkunftsstaende`);
      for (const status of definition.from) assert.ok(ENCOUNTER_STATES.includes(status), `${type}: unbekannter Zustand ${status}`);
      assert.ok(definition.to === null || ENCOUNTER_STATES.includes(definition.to), `${type}: unbekanntes Ziel ${definition.to}`);
      assert.ok(ENCOUNTER_SOURCE_KINDS.includes(definition.source.kind), `${type}: unbekannte Herkunftsart`);
      assert.ok(typeof definition.source.ref === 'string' && definition.source.ref !== '', `${type}: Quelle ohne Referenz`);
      assert.ok(/^@shinon\/[a-z-]+$/.test(definition.source.owner), `${type}: Quelle ohne Paket (${definition.source.owner})`);
      assert.ok(Array.isArray(definition.payload), `${type}: Payload ist keine Allowlist`);
      assert.equal(new Set(definition.payload).size, definition.payload.length, `${type}: doppeltes Payload-Feld`);
      assert.equal(typeof definition.apply, 'function', `${type}: Ereignis ohne Wirkung`);
      assert.ok(Object.isFrozen(definition), `${type}: Definition ist nicht eingefroren`);
    }
    assert.equal(ENCOUNTER_EVENT_TYPES.length, Object.keys(ENCOUNTER_EVENTS).length);
    assert.ok(Object.isFrozen(ENCOUNTER_EVENTS));
    assert.throws(() => { ENCOUNTER_EVENTS['encounter.fake.event'] = {}; }, 'die Tabelle ist zur Laufzeit nicht erweiterbar');
  });

  test('die Source Map ist aus der Tabelle abgeleitet und nicht danebengeschrieben', () => {
    const expected = Object.fromEntries(Object.entries(ENCOUNTER_EVENTS).map(([type, definition]) => [type, definition.source]));
    assert.deepEqual({ ...ENCOUNTER_SOURCE_MAP }, expected);
  });

  test('jede native Quelle steht im geprueften Event-Spine', () => {
    const spine = JSON.parse(readFileSync(SPINE_FILE, 'utf8'));
    const native = Object.entries(ENCOUNTER_SOURCE_MAP).filter(([, source]) => source.kind === 'spine');
    assert.ok(native.length > 0, 'kein Ereignis nennt eine native Quelle');
    for (const [type, source] of native) {
      assert.ok(spine.events[source.ref] !== undefined, `${type}: ${source.ref} steht nicht im Event-Spine`);
      assert.equal(source.owner, '@shinon/events', `${type}: native Quelle gehoert nicht dem Spine`);
    }
  });

  test('jede interne Quelle ist ein Paket, das es im Baum gibt', () => {
    for (const [type, source] of Object.entries(ENCOUNTER_SOURCE_MAP)) {
      if (source.kind === 'unavailable') continue;
      const dir = source.owner.replace('@shinon/', '');
      assert.ok(existsSync(join(PACKAGES_DIR, dir)), `${type}: Paket ${source.owner} fehlt im Baum`);
    }
  });

  test('jede interne Quelle nennt einen Kern, den es wirklich gibt', () => {
    // Der Paketordner allein beweist nichts: `ref: 'rotation'` stand in einem
    // Paket, das eine `assets/rotation.js` nie hatte. Der Ref ist ein Versprechen
    // an die Buehne; er muss auf eine Datei zeigen, die den Namen traegt.
    let internal = 0;
    for (const [type, source] of Object.entries(ENCOUNTER_SOURCE_MAP)) {
      if (source.kind !== 'internal') continue;
      internal += 1;
      const dir = source.owner.replace('@shinon/', '');
      const file = join(PACKAGES_DIR, dir, 'assets', `${source.ref}.js`);
      assert.ok(existsSync(file), `${type}: ${source.owner}/assets/${source.ref}.js fehlt — der Ref zeigt ins Leere`);
    }
    assert.ok(internal > 0, 'kein Ereignis nennt eine interne Quelle');
  });

  test('eine fehlende Beobachtung steht sichtbar als unavailable, nicht als interner Ref', () => {
    for (const [type, source] of Object.entries(ENCOUNTER_SOURCE_MAP)) {
      assert.ok(ENCOUNTER_SOURCE_KINDS.includes(source.kind), `${type}: unbekannte Herkunftsart ${source.kind}`);
    }
    const unavailable = Object.entries(ENCOUNTER_SOURCE_MAP).filter(([, source]) => source.kind === 'unavailable');
    assert.ok(unavailable.length > 0, 'der Vertrag nennt keine sichtbare Luecke mehr — dann darf diese Zusage fallen');
  });

  test('der Vertragsname folgt dem Kanon und die Zustaende sind geschlossen', () => {
    assert.match(ENCOUNTER_CONTRACT, /^shinon\.[a-z0-9-]+\/[a-z0-9-]+-v[0-9]+$/);
    assert.equal(createEncounterState().contract, ENCOUNTER_CONTRACT);
    assert.equal(new Set(ENCOUNTER_STATES).size, ENCOUNTER_STATES.length);
    for (const terminal of ENCOUNTER_TERMINAL_STATES) assert.ok(ENCOUNTER_STATES.includes(terminal));
  });
});

describe('jedes Ereignis einmal durch den Reducer', () => {
  test('aus seinem ersten erlaubten Zustand erreicht es genau den Zielzustand', () => {
    const reached = new Set();
    for (const [type, definition] of Object.entries(ENCOUNTER_EVENTS)) {
      const from = definition.from[0];
      const state = stateAt(from);
      const step = reduceEncounter(state, nextEvent(type, { turnId: state.turnId ?? 'turn-1' }));
      assert.equal(step.outcome, 'APPLIED', `${type}: ${step.reason}`);
      assert.equal(step.state.status, definition.to ?? from, `${type}: falscher Zielzustand`);
      assert.notEqual(step.state, state, `${type}: unveraendertes Objekt trotz APPLIED`);
      assert.equal(step.state.turnId, 'turn-1', `${type}: Turn-Bindung verloren`);
      reached.add(type);
    }
    assert.deepEqual([...reached].sort(), ENCOUNTER_EVENT_TYPES.slice().sort(), 'jedes definierte Ereignis wurde gefahren');
  });

  test('ohne turn.started oeffnet kein Ereignis einen Encounter', () => {
    for (const type of ENCOUNTER_EVENT_TYPES) {
      if (type === 'encounter.turn.started') continue;
      const step = reduceEncounter(createEncounterState(), nextEvent(type));
      assert.equal(step.outcome, 'REJECTED', `${type}: oeffnet einen geschlossenen Encounter`);
      assert.equal(step.reason, 'INVALID_TRANSITION');
    }
  });

  test('die vollstaendige Bahn: preflight, running, validating, completed, compact', () => {
    const route = [
      'encounter.turn.started',
      'encounter.task.classified',
      'encounter.index.progress',
      'encounter.fact.validated',
      'encounter.block.selected',
      'encounter.preflight.ready',
      'encounter.route.selected',
      'encounter.run.started',
      'encounter.tool.started',
      'encounter.tool.completed',
      'encounter.answer.received',
      'encounter.result-contract.passed',
      'encounter.turn.completed',
      'encounter.receipt.compacted',
    ];
    const payloads = {
      'encounter.task.classified': { taskClass: 'fix', taskLabel: 'Reparatur' },
      'encounter.index.progress': { phase: 'scan', count: 12 },
      'encounter.fact.validated': { snapshotId: 'snap-1', valid: 3, untrusted: 1, unknown: 0 },
      'encounter.block.selected': { blocks: ['persona-identity-core', 'enhancer-system-policy'] },
      'encounter.route.selected': { provider: 'agnes', model: 'demo' },
      'encounter.run.started': { step: 1 },
      'encounter.tool.started': { callId: 'call-1', name: 'read_file' },
      'encounter.tool.completed': { callId: 'call-1', ok: true },
      'encounter.result-contract.passed': { contract: 'shinon.result/v1' },
      'encounter.turn.completed': { reason: 'completed' },
    };
    const events = route.map((type) => nextEvent(type, { payload: payloads[type] ?? {} }));
    const { state, journal } = foldEncounter(createEncounterState(), events);
    assert.deepEqual(journal.map((entry) => entry.outcome), route.map(() => 'APPLIED'), JSON.stringify(journal, null, 2));
    assert.equal(state.status, 'compact');
    assert.equal(state.turnId, 'turn-1');
    assert.equal(state.applied, route.length);
    assert.deepEqual(state.preflight.blocks, ['persona-identity-core', 'enhancer-system-policy']);
    assert.equal(state.preflight.ready, true);
    assert.deepEqual(state.preflight.route, { provider: 'agnes', model: 'demo' });
    assert.deepEqual(state.facts, { snapshotId: 'snap-1', valid: 3, untrusted: 1, unknown: 0 });
    assert.equal(state.tools.calls, 1);
    assert.equal(state.tools.open, 0, 'ein abgeschlossener Aufruf bleibt nicht offen');
    assert.equal(state.tools.last, 'read_file');
    assert.equal(state.step, 1);
    assert.deepEqual(state.outcome, { kind: 'contract-passed', contract: 'shinon.result/v1', reason: null });
  });

  test('ohne Ergebnisvertrag ist der Abschluss NEUTRAL, nicht gewonnen', () => {
    const { state } = foldEncounter(createEncounterState(), [
      nextEvent('encounter.turn.started'),
      nextEvent('encounter.run.started'),
      nextEvent('encounter.turn.completed', { payload: { reason: 'completed' } }),
    ]);
    assert.equal(state.status, 'completed');
    assert.deepEqual(state.outcome, { kind: 'neutral', contract: null, reason: null });
  });

  test('Bergung und Skill-Vorschlag sind Unterzustaende, nie ein Erfolg', () => {
    const running = stateAt('running');
    const salved = reduceEncounter(running, nextEvent('encounter.salvage.available', { payload: { recordId: 'rec-1' } }));
    assert.equal(salved.outcome, 'APPLIED');
    assert.equal(salved.state.status, 'running', 'Bergung macht keinen Erfolg');
    assert.deepEqual(salved.state.salvage, { recordId: 'rec-1' });

    const done = stateAt('completed');
    const proposed = reduceEncounter(done, nextEvent('encounter.skill.proposed', { payload: { skillId: 'sk-1', status: 'active' } }));
    assert.equal(proposed.outcome, 'APPLIED');
    assert.equal(proposed.state.status, 'completed');
    assert.deepEqual(proposed.state.skill, { skillId: 'sk-1', status: 'proposed' }, 'ein Ereignis aktiviert keinen Skill');
  });
});

describe('der Reducer veraendert seine Eingabe nicht', () => {
  test('ein tief eingefrorener Zustand ueberlebt jedes Ereignis', () => {
    for (const [type, definition] of Object.entries(ENCOUNTER_EVENTS)) {
      const from = definition.from[0];
      const state = deepFreeze(stateAt(from));
      assert.doesNotThrow(() => reduceEncounter(state, nextEvent(type, { turnId: 'turn-1' })), `${type}: Reducer schreibt in die Eingabe`);
    }
  });

  test('Vorher und Nachher sind gleich, wenn man den Zustand kopiert', () => {
    const state = stateAt('preflight');
    const before = JSON.stringify(state);
    const step = reduceEncounter(state, nextEvent('encounter.fact.validated', { payload: { snapshotId: 'snap-9', valid: 2 } }));
    assert.equal(step.outcome, 'APPLIED');
    assert.equal(JSON.stringify(state), before, 'die Eingabe ist nach dem Aufruf unveraendert');
    assert.notEqual(step.state.facts, state.facts, 'die Aenderung liegt in einem NEUEN Objekt');
    assert.equal(state.facts.snapshotId, null);
  });

  test('derselbe (Zustand, Ereignis)-Paar ergibt zweimal dasselbe', () => {
    const state = stateAt('preflight');
    const event = nextEvent('encounter.block.selected', { payload: { blocks: ['a', 'b'] } });
    const first = reduceEncounter(state, event);
    const second = reduceEncounter(state, event);
    assert.deepEqual(first, second);
    assert.equal(first.reason, second.reason);
    assert.equal(first.state.seen.length, 1);
  });

  test('die Ereignis-Erinnerung ist gedeckelt', () => {
    let state = stateAt('running');
    for (let i = 0; i < ENCOUNTER_EVENT_MEMORY * 2; i += 1) {
      const step = reduceEncounter(state, encounterEvent('encounter.index.progress', {
        eventId: `evt-ring-${i}`, turnId: 'turn-1', sessionId: 'session-1', payload: { count: i },
      }));
      assert.equal(step.outcome, 'APPLIED');
      state = step.state;
    }
    assert.equal(state.seen.length, ENCOUNTER_EVENT_MEMORY);
    assert.ok(state.seen.includes(`evt-ring-${(ENCOUNTER_EVENT_MEMORY * 2) - 1}`), 'die juengste ID bleibt');
  });
});

describe('definiertes Verhalten fuer alles, was nicht passt', () => {
  test('ein unbekanntes Ereignis wird ignoriert und fasst den Zustand nicht an', () => {
    const state = stateAt('running');
    const step = reduceEncounter(state, {
      contract: ENCOUNTER_CONTRACT, eventId: 'evt-x', type: 'encounter.erfunden.ding',
      sessionId: 'session-1', turnId: 'turn-1', source: '@shinon/events', payload: {},
    });
    assert.equal(step.outcome, 'IGNORED');
    assert.equal(step.reason, 'UNKNOWN_EVENT_TYPE');
    assert.equal(step.state, state, 'derselbe Zustand, nicht eine Kopie');
    assert.equal(step.state.status, 'running');
  });

  test('kaputte Huellen und fremde Nutzlasten werden mit einem Code abgewiesen', () => {
    const state = stateAt('running');
    const valid = nextEvent('encounter.tool.started', { payload: { callId: 'c1', name: 'read_file' } });
    const cases = [
      [null, 'EVENT_NOT_OBJECT'],
      [{ ...valid, contract: 'shinon.encounter/v0' }, 'EVENT_CONTRACT'],
      [{ ...valid, eventId: '' }, 'EVENT_FIELD:eventId'],
      [{ ...valid, turnId: undefined }, 'EVENT_FIELD:turnId'],
      [{ ...valid, source: '@shinon/prompter' }, 'SOURCE_MISMATCH:encounter.tool.started'],
      [{ ...valid, payload: { prompt: 'geheimer auftrag' } }, 'PAYLOAD_UNKNOWN_FIELD:prompt'],
      [{ ...valid, payload: { callId: { raw: 'blob' } } }, 'PAYLOAD_UNSUPPORTED_VALUE:callId'],
      [{ ...valid, payload: [] }, 'PAYLOAD_NOT_OBJECT'],
    ];
    for (const [event, reason] of cases) {
      const step = reduceEncounter(state, event);
      assert.equal(step.outcome, 'REJECTED', `${reason}: nicht abgewiesen`);
      assert.equal(step.reason, reason);
      assert.equal(step.state, state, `${reason}: Zustand wurde angefasst`);
    }
  });

  test('ein halber Zustand wird abgewiesen, statt im Reducer zu werfen', () => {
    const step = reduceEncounter({ contract: ENCOUNTER_CONTRACT, status: 'running', seen: [] }, nextEvent('encounter.tool.started'));
    assert.equal(step.outcome, 'REJECTED');
    assert.match(step.reason, /^STATE_SHAPE:/);
  });

  test('dieselbe eventId wirkt genau einmal', () => {
    const state = stateAt('running');
    const event = nextEvent('encounter.tool.started', { payload: { callId: 'c1', name: 'read_file' } });
    const first = reduceEncounter(state, event);
    const second = reduceEncounter(first.state, event);
    assert.equal(first.outcome, 'APPLIED');
    assert.equal(second.outcome, 'IGNORED');
    assert.equal(second.reason, 'DUPLICATE_EVENT');
    assert.equal(second.state.tools.calls, 1);
  });

  test('ein Ereignis eines FREMDEN Turns oeffnet keinen abgeschlossenen Turn', () => {
    const state = stateAt('running', 'turn-1');
    const step = reduceEncounter(state, nextEvent('encounter.turn.completed', { turnId: 'turn-2' }));
    assert.equal(step.outcome, 'REJECTED');
    assert.equal(step.reason, 'FOREIGN_TURN');
    assert.equal(step.state.status, 'running');
  });

  test('verspaetete Ereignisse nach dem Terminal kommen nicht mehr durch', () => {
    const completed = stateAt('completed');
    for (const type of ENCOUNTER_EVENT_TYPES) {
      if (type === 'encounter.receipt.compacted' || type === 'encounter.skill.proposed') continue;
      const step = reduceEncounter(completed, nextEvent(type));
      assert.notEqual(step.outcome, 'APPLIED', `${type}: wirkt nach dem Abschluss`);
    }
    const compact = stateAt('compact');
    const late = reduceEncounter(compact, nextEvent('encounter.turn.started'));
    assert.equal(late.outcome, 'REJECTED');
    assert.equal(late.reason, 'INVALID_TRANSITION');
  });

  test('ein Terminal merkt sich, WO es geendet hat (lastPhase)', () => {
    // Der Befund aus dem Playtest: `aborted` allein sagt nicht, ob im Vorflug
    // oder in der Pruefung abgebrochen wurde. Die Buehne darf das nicht raten.
    const early = reduceEncounter(stateAt('preflight'), nextEvent('encounter.abort', { payload: { reason: 'Nutzer' } }));
    assert.equal(early.outcome, 'APPLIED');
    assert.equal(early.state.status, 'aborted');
    assert.equal(early.state.lastPhase, 'preflight');

    const late = reduceEncounter(stateAt('validating'), nextEvent('encounter.abort', { payload: { reason: 'Nutzer' } }));
    assert.equal(late.state.lastPhase, 'validating');

    // Eine Beobachtung (`to: null`) schreibt die Spur NICHT um — auch nicht
    // ueber eine echte Bahn (turn.started -> run.started -> tool.started).
    const walked = reduceEncounter(
      reduceEncounter(stateAt('preflight'), nextEvent('encounter.run.started', { payload: { step: 1 } })).state,
      nextEvent('encounter.tool.started', { payload: { callId: 'c9', name: 'grep' } }),
    );
    assert.equal(walked.state.status, 'running');
    assert.equal(walked.state.lastPhase, 'preflight');

    // Und der leere Zustand behauptet keine Herkunft.
    assert.equal(createEncounterState().lastPhase, null);
  });

  test('parallele Turns bleiben getrennt: zwei Zustaende, zwei Encounter', () => {
    const a = stateAt('running', 'turn-a');
    const b = stateAt('running', 'turn-b');
    const stepA = reduceEncounter(a, nextEvent('encounter.tool.started', { turnId: 'turn-a', payload: { callId: 'a1', name: 'grep' } }));
    const stepB = reduceEncounter(b, nextEvent('encounter.tool.started', { turnId: 'turn-b', payload: { callId: 'b1', name: 'read_file' } }));
    assert.equal(stepA.state.tools.calls, 1);
    assert.equal(stepB.state.tools.calls, 1);
    assert.equal(stepA.state.turnId, 'turn-a');
    assert.equal(stepB.state.turnId, 'turn-b');
    assert.equal(stepA.state.tools.last, 'grep');
    assert.equal(stepB.state.tools.last, 'read_file');
    const crossing = reduceEncounter(stepA.state, nextEvent('encounter.tool.started', { turnId: 'turn-b', payload: { callId: 'b2' } }));
    assert.equal(crossing.outcome, 'REJECTED', 'ein fremder Turn faellt in A nicht durch');
    assert.equal(crossing.state.tools.calls, 1);
  });
});

describe('der Kern ist ohne Host pruefbar', () => {
  test('keine Uhr, kein DOM, kein Netz, kein Zufall, kein Import', () => {
    const source = readFileSync(CORE_FILE, 'utf8');
    const forbidden = [
      [/^\s*import\s/m, 'Import'],
      [/\brequire\s*\(/, 'require'],
      [/\bnew Date\b|\bDate\.now\b/, 'Uhr'],
      [/\bperformance\.now\b/, 'Uhr'],
      [/\bsetTimeout\s*\(|\bsetInterval\s*\(/, 'Timer'],
      [/\bMath\.random\b/, 'Zufall'],
      [/\bwindow\.|\bdocument\.|\bfetch\s*\(/, 'Umgebung'],
      [/\bprocess\.env\b/, 'Umgebung'],
    ];
    for (const [pattern, label] of forbidden) {
      assert.ok(!pattern.test(source), `${label} im Reducer-Kern`);
    }
    assert.match(source, /export function reduceEncounter\(/, 'der Reducer ist der oeffentliche Name');
  });

  test('die Host-Haelfte gibt den Vertrag weiter (ohne Installation sichtbar uebersprungen)', async (t) => {
    let bundle = null;
    try {
      bundle = await import('../index.js');
    } catch {
      bundle = null;
    }
    if (bundle === null) {
      t.skip('index.js braucht Schemastery — ohne node_modules nicht ladbar (CI)');
      return;
    }
    assert.equal(bundle.ENCOUNTER_CONTRACT, ENCOUNTER_CONTRACT);
    assert.equal(typeof bundle.reduceEncounter, 'function');
    assert.deepEqual(bundle.ENCOUNTER_EVENT_TYPES, ENCOUNTER_EVENT_TYPES);
  });
});
