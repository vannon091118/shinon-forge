#!/usr/bin/env node
/**
 * Narrative Engine (Zug 5) — ohne DSH, ohne Netz, ohne Modell.
 *
 * Belegt wird, was der Vertrag VERSPRICHT, seit die PRNG weg ist:
 *   - Der Mood kommt aus der Tabelle und wiederholt sich nie zweimal
 *     (Anti-Wiederholung als benannte Regel, nicht als Wuerfel).
 *   - Der Erzaehler kommt aus dem Ereignis-Praefix.
 *   - Gleicher Input + gleiche Historie = gleicher Composite (zweimal gefahren).
 * → Kanon: docs/COMMENT-KANON.md#k-2d45581b039d
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { advance, appendChronicle, createArc, deriveComposite, deriveMood, deriveNarrator, initialState, relationshipState } from '../assets/narrative-core.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(DIR, '../assets/narrative-state.json'), 'utf8'));
const derivation = contract.derivation;
const config = { chronicleLimit: 5, freezeThreshold: 3, relationshipWindow: 20 };

const event = (type, over = {}) => ({ id: `ev-${type}`, type, timestamp: '2026-10-12T10:00:00.000Z', actors: ['user'], ...over });

// ── 1. Mood: Tabelle statt Wuerfel ───────────────────────────────────────────

test('narrative: der Mood kommt aus der Tabelle, und nie zweimal derselbe', () => {
  assert.equal(deriveMood(derivation.mood, 'idle', 'gate.failed').mood, 'concerned');
  assert.equal(deriveMood(derivation.mood, 'curious', 'tool.requested').mood, 'working');
  // Anti-Wiederholung: derselbe Ereignistyp zweimal ergibt NICHT denselben Mood.
  const first = deriveMood(derivation.mood, 'curious', 'message.completed');
  const second = deriveMood(derivation.mood, first.mood, 'message.completed');
  assert.equal(first.mood, 'focused');
  assert.notEqual(second.mood, 'focused');
  assert.match(second.reason, /ANTI_REPEAT/);
  // Unbekanntes Ereignis erfindet keinen Takt: der vorige bleibt, mit Grund.
  assert.deepEqual(deriveMood(derivation.mood, 'working', 'etwas.neues'), { mood: 'working', reason: 'UNBEKANNTES_EREIGNIS' });
});

test('narrative: der Erzaehler kommt aus dem Ereignis, nicht aus einem Wuerfel', () => {
  assert.equal(deriveNarrator(derivation.narrator, 'message.received'), 'user');
  assert.equal(deriveNarrator(derivation.narrator, 'gate.failed'), 'system');
  assert.equal(deriveNarrator(derivation.narrator, 'tool.completed'), 'shinon');
  assert.equal(deriveNarrator(derivation.narrator, 'voellig.unbekannt'), 'shinon', 'der Vertrag sagt, wer zurueckfaellt');
});

test('narrative: kein Zufall und keine Uhr im Kern', () => {
  // Geprueft wird der CODE, nicht der Kommentar: der Kommentar nennt genau diese
  // Namen, um zu sagen, dass sie fehlen.
  const code = readFileSync(join(DIR, '../assets/narrative-core.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.equal(/Math\.random|Date\.now|new Date\(/.test(code), false, 'keine Zufallsquelle, keine Uhr');
  assert.equal(/^\s*import\b/m.test(code), false, 'importfrei (CI ohne node_modules)');
});

// ── 2. Der Composite: derselbe Strom, dasselbe Ergebnis ──────────────────────

test('narrative: derselbe Strom ergibt denselben Composite', () => {
  const run = () => {
    const state = initialState(config.freezeThreshold);
    for (const type of ['session.created', 'message.received', 'tool.requested', 'gate.failed', 'message.completed']) {
      advance(state, contract, event(type), config);
    }
    return state;
  };
  const first = run();
  const second = run();
  assert.deepEqual(first.composite, second.composite, 'zwei Laeufe, ein Zustand');
  assert.equal(first.composite.seq, 5, 'die Sequenz waechst monoton');
  assert.equal(first.chronicle.length, 5);
  assert.equal(first.relationships['shinon+user'].history.length, 5, 'die Beziehung sieht die Paare');
});

test('narrative: der Arc wechselt an der Schwelle und archiviert den alten', () => {
  const state = initialState(3);
  advance(state, contract, event('message.received'), config);
  const firstArc = state.composite.arc_id;
  assert.equal(state.arcs.length, 1);
  advance(state, contract, event('message.completed'), config);
  advance(state, contract, event('tool.completed'), config);
  // Drei Ereignisse: die Schwelle ist erreicht, der naechste Takt oeffnet neu.
  advance(state, contract, event('gate.passed'), config);
  const archived = state.arcs.filter((arc) => arc.status === 'archived');
  assert.equal(archived.length, 1, 'genau ein Arc ist eingefroren');
  assert.equal(archived[0].id, firstArc);
  assert.equal(archived[0].span.end, '2026-10-12T10:00:00.000Z');
  assert.notEqual(state.composite.arc_id, firstArc, 'der rote Faden wechselt, er reisst nicht');
  assert.equal(state.composite.arc_events, 1);
});

test('narrative: die Beziehungsstufe kommt aus dem Vertrag, nicht aus Zahlen im Code', () => {
  const states = derivation.relationship.states;
  const lowest = relationshipState(derivation.relationship, ['shinon', 'user'], 0);
  assert.ok(states.includes(lowest), `${lowest} steht im Vertrag`);
  const highest = relationshipState(derivation.relationship, ['shinon', 'user'], 100);
  assert.equal(highest, states[states.length - 1], 'viel Historie ergibt die hoechste Stufe');
  // Deterministisch: dasselbe Paar, dieselbe Historie, dieselbe Stufe.
  assert.equal(relationshipState(derivation.relationship, ['user', 'shinon'], 4), relationshipState(derivation.relationship, ['shinon', 'user'], 4));
});

// ── 3. Chronik, Arc und Zeit ────────────────────────────────────────────────

test('narrative: die Chronik ist begrenzt und liest keine Uhr', () => {
  let chronicle = [];
  for (let index = 0; index < 8; index += 1) chronicle = appendChronicle(chronicle, event(`t.${index}`), 3);
  assert.equal(chronicle.length, 3, 'die Grenze haelt');
  assert.deepEqual(chronicle.map((entry) => entry.type), ['t.5', 't.6', 't.7'], 'die juengsten bleiben');
  // Ohne Zeitstempel im Ereignis bleibt er leer — `new Date()` erfindet keinen.
  const withoutTime = appendChronicle([], { id: 'ev-x', type: 't' }, 1);
  assert.equal(withoutTime[0].timestamp, null);
});

test('narrative: ein Arc traegt sein Thema aus dem Vertrag', () => {
  const arc = createArc(derivation.arc.themes, 'gate.failed', 7);
  assert.equal(arc.id, 'arc-7');
  assert.ok(derivation.arc.themes.includes(arc.theme), arc.theme);
  assert.equal(arc.status, 'active');
  // Dasselbe Ereignis, dasselbe Thema — kein Zufall.
  assert.equal(createArc(derivation.arc.themes, 'gate.failed', 9).theme, arc.theme);
});

test('narrative: ein Composite ohne Ereignis-Typ bleibt beim Vorigen', () => {
  const previous = { seq: 4, mood: 'working', arc_id: 'arc-4', arc_events: 2, freezeThreshold: 20, pair: ['shinon'] };
  const next = deriveComposite(contract, previous, { id: 'ev', type: null, timestamp: null, actors: [] });
  assert.equal(next.seq, 5);
  assert.equal(next.mood, 'working', 'kein erfundener Takt');
  assert.equal(next.narrator, 'shinon');
  assert.deepEqual(next.pair, ['shinon']);
});
