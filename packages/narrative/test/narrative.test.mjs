#!/usr/bin/env node
/**
 * Narrative Engine (Zug 5) — ohne DSH, ohne Netz, ohne Modell.
 *
 * Seit 2026-10-17 belegt diese Datei die ABWESENHEIT der alten Ableitungen:
 * kein `djb2(pair) % 100` als Beziehung, kein Präfix-Hash als Arc-Thema und
 * keine Anti-Wiederholung, die denselben Ereignistyp zweimal verschieden
 * auslegt. Jeder Übergang nennt Event, Grund und Evidenzlevel; unbekannte
 * Events ändern kein semantisches Feld.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  advance,
  appendChronicle,
  createArc,
  deriveComposite,
  deriveMood,
  deriveNarrator,
  initialState,
  relationshipState,
} from '../assets/narrative-core.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(DIR, '../assets/narrative-state.json'), 'utf8'));
const rules = contract.rules;
const config = { chronicleLimit: 5, freezeThreshold: 3, relationshipWindow: 20 };

const event = (type, over = {}) => ({ id: `ev-${type}`, type, timestamp: '2026-10-12T10:00:00.000Z', actors: ['user'], ...over });

// ── 1. Mood: Tabelle statt Wuerfel, ohne Anti-Wiederholung ───────────────────

test('narrative: der Mood kommt aus der Tabelle — derselbe Typ ergibt denselben Mood', () => {
  assert.equal(deriveMood(rules.moodByEvidence, 'idle', 'gate.failed').mood, 'concerned');
  assert.equal(deriveMood(rules.moodByEvidence, 'curious', 'tool.requested').mood, 'working');
  const first = deriveMood(rules.moodByEvidence, 'curious', 'message.completed');
  const second = deriveMood(rules.moodByEvidence, first.mood, 'message.completed');
  assert.equal(first.mood, 'focused');
  assert.deepEqual(second, first, 'derselbe Ereignistyp ergibt denselben Mood — keine Abwechslung');
  assert.equal(first.evidence, 'EVENT_TYPE');
  assert.ok(first.reason.length > 0, 'der Grund steht im Ergebnis');
});

test('narrative: ein unbekanntes Ereignis erfindet keinen Takt und keine Evidenz', () => {
  assert.deepEqual(deriveMood(rules.moodByEvidence, 'working', 'etwas.neues'), {
    mood: 'working',
    reason: 'UNBEKANNTES_EREIGNIS',
    evidence: 'NONE',
  });
  const previous = { seq: 4, mood: 'working', narrator: 'shinon', arc_id: 'arc-4', arc_events: 2, freezeThreshold: 20, pair: ['shinon'], relationship_state: 'established_duo' };
  const next = deriveComposite(contract, previous, event('etwas.neues'));
  assert.equal(next.seq, 5, 'die Sequenz zählt weiter');
  assert.equal(next.mood, 'working', 'kein erfundener Mood');
  assert.equal(next.narrator, 'shinon');
  assert.equal(next.arc_id, 'arc-4', 'kein erfundener Arc');
  assert.equal(next.relationship_state, 'established_duo', 'keine erfundene Beziehung');
  assert.equal(next.mood_evidence, 'NONE');
  assert.equal(next.relationship_evidence, 'NONE');
});

test('narrative: der Erzaehler kommt aus der Zuordnung, nicht aus einem Praefix-Hash', () => {
  assert.equal(deriveNarrator(rules.narrator, 'message.received'), 'user');
  assert.equal(deriveNarrator(rules.narrator, 'gate.failed'), 'system');
  assert.equal(deriveNarrator(rules.narrator, 'tool.completed'), 'shinon');
  assert.equal(deriveNarrator(rules.narrator, 'voellig.unbekannt'), 'shinon', 'der Vertrag sagt, wer zurueckfaellt');
});

test('narrative: kein Zufall, keine Uhr und kein Hash im Kern', () => {
  const code = readFileSync(join(DIR, '../assets/narrative-core.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.equal(/Math\.random|Date\.now|new Date\(/.test(code), false, 'keine Zufallsquelle, keine Uhr');
  assert.equal(/\bdjb2\b/.test(code), false, 'kein Hash als Bedeutungsquelle');
  assert.equal(/^\s*import\b/m.test(code), false, 'importfrei (CI ohne node_modules)');
});

// ── 2. Der Composite: derselbe Strom, dasselbe Ergebnis ──────────────────────

test('narrative: derselbe Strom ergibt denselben Composite (Replay)', () => {
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
  assert.equal(first.composite.mood_event, 'ev-message.completed', 'der Takt nennt sein Ereignis');
});

test('narrative: der Arc wechselt an der Schwelle und archiviert den alten', () => {
  const state = initialState(3);
  advance(state, contract, event('message.received'), config);
  const firstArc = state.composite.arc_id;
  assert.equal(state.arcs.length, 1);
  advance(state, contract, event('message.completed'), config);
  advance(state, contract, event('tool.completed'), config);
  advance(state, contract, event('gate.passed'), config);
  const archived = state.arcs.filter((arc) => arc.status === 'archived');
  assert.equal(archived.length, 1, 'genau ein Arc ist eingefroren');
  assert.equal(archived[0].id, firstArc);
  assert.equal(archived[0].span.end, '2026-10-12T10:00:00.000Z');
  assert.notEqual(state.composite.arc_id, firstArc, 'der rote Faden wechselt, er reisst nicht');
  assert.equal(state.composite.arc_events, 1);
});

test('narrative: ein unbekanntes Ereignis oeffnet keinen Arc', () => {
  const state = initialState(20);
  advance(state, contract, event('etwas.neues'), config);
  assert.equal(state.arcs.length, 0);
  assert.equal(state.composite.arc_id, null);
  assert.equal(state.composite.arc_events, 0);
});

// ── 3. Beziehung: explizite Transition statt Hash ───────────────────────────

const relationshipRules = { states: rules.relationshipStates, transitions: rules.relationshipTransitions };

test('narrative: die Beziehungsstufe startet ohne Evidenz und bleibt ohne Transition', () => {
  const start = relationshipState(relationshipRules, undefined, 'message.received', {});
  assert.deepEqual(start, { state: 'fresh_pair', reason: 'KEINE_EVIDENZ', evidence: 'NONE' });

  // Viel Historie hebt NICHT: der alte `djb2(pair) % 100`-Score ist weg.
  const state = initialState(20);
  for (let index = 0; index < 20; index += 1) advance(state, contract, event('message.received'), config);
  assert.equal(state.composite.relationship_state, 'fresh_pair');
  assert.equal(state.composite.relationship_evidence, 'NONE');
  const record = state.relationships['shinon+user'];
  assert.equal(record.trust, null, 'kein Vertrauenswert ohne Beleg');
  assert.equal(record.respect, null);
});

test('narrative: dieselbe Historie ergibt dieselbe Stufe — unabhaengig vom Paar-Namen', () => {
  const left = relationshipState(relationshipRules, 'fresh_pair', 'relation.updated', { relation: 'known' });
  const right = relationshipState(relationshipRules, 'fresh_pair', 'relation.updated', { relation: 'known' });
  assert.deepEqual(left, right);
  assert.equal(left.state, 'established_duo');
  assert.equal(left.evidence, 'EXPLICIT_PAYLOAD');
  // Ein anderes Paar mit derselben Evidenz kommt zur selben Stufe — kein Hash.
  const a = initialState(20);
  const b = initialState(20);
  advance(a, contract, event('relation.updated', { actors: ['user'], context: { relation: 'known' } }), config);
  advance(b, contract, event('relation.updated', { actors: ['kollege'], context: { relation: 'known' } }), config);
  assert.equal(a.composite.relationship_state, b.composite.relationship_state);
});

test('narrative: bestaetigte Transitionen steigen, abgelehnte und unbenannte aendern nichts', () => {
  const state = initialState(20);
  advance(state, contract, event('relation.updated', { context: { relation: 'known' } }), config);
  assert.equal(state.composite.relationship_state, 'established_duo');
  assert.equal(state.composite.relationship_event, 'ev-relation.updated');
  assert.equal(state.composite.relationship_evidence, 'EXPLICIT_PAYLOAD');

  advance(state, contract, event('relation.updated', { context: { relation: 'trusted' } }), config);
  assert.equal(state.composite.relationship_state, 'trusted_team');

  // `stranger` ist keine Aufstufung und wird nicht als Abstieg erfunden.
  advance(state, contract, event('relation.updated', { context: { relation: 'stranger' } }), config);
  assert.equal(state.composite.relationship_state, 'trusted_team', 'kein erfundener Abstieg');

  // Unbekannte Stufe und fehlende Nutzlast aendern nichts — Evidenz bleibt NONE.
  const untouched = initialState(20);
  advance(untouched, contract, event('relation.updated'), config);
  assert.equal(untouched.composite.relationship_state, 'fresh_pair');
  assert.equal(untouched.composite.relationship_evidence, 'NONE');
  advance(untouched, contract, event('relation.updated', { context: { relation: 'erfunden' } }), config);
  assert.equal(untouched.composite.relationship_state, 'fresh_pair');
});

// ── 4. Chronik, Arc und Zeit ────────────────────────────────────────────────

test('narrative: die Chronik ist begrenzt und liest keine Uhr', () => {
  let chronicle = [];
  for (let index = 0; index < 8; index += 1) chronicle = appendChronicle(chronicle, event(`t.${index}`), 3);
  assert.equal(chronicle.length, 3, 'die Grenze haelt');
  assert.deepEqual(chronicle.map((entry) => entry.type), ['t.5', 't.6', 't.7'], 'die juengsten bleiben');
  const withoutTime = appendChronicle([], { id: 'ev-x', type: 't' }, 1);
  assert.equal(withoutTime[0].timestamp, null);
  // SH-LEARN-02: eine Zeile ist Kennung, Typ und Zeit — keine zweite Kopie des
  // Ereignisses. Nutzlast und Kontext bleiben im Sitzungsarchiv des Hosts.
  const full = event('message.received', { context: { text: 'geheimer Prompt', tool: 'x' }, payload: { big: 'y' } });
  const line = appendChronicle([], full, 1)[0];
  assert.deepEqual(Object.keys(line).sort(), ['id', 'timestamp', 'type']);
  assert.equal(JSON.stringify(line).includes('geheimer Prompt'), false);
});

test('narrative: die Beziehung ist ein Fenster, kein anwachsendes Protokoll', () => {
  const state = initialState(99);
  const narrow = { ...config, relationshipWindow: 4 };
  for (let index = 0; index < 9; index += 1) advance(state, contract, event('message.received'), narrow);
  const history = state.relationships['shinon+user'].history;
  assert.equal(history.length, 4, 'relationshipWindow gilt wirklich');
  assert.deepEqual(history.map((entry) => entry.type), ['message.received', 'message.received', 'message.received', 'message.received']);
  assert.equal(history.at(-1).event, 'ev-message.received');
  // Ohne Angabe gilt die Vorgabe 20 — nie unbegrenzt.
  const unbounded = initialState(99);
  for (let index = 0; index < 25; index += 1) advance(unbounded, contract, event('message.received'), { chronicleLimit: 5, freezeThreshold: 99 });
  assert.equal(unbounded.relationships['shinon+user'].history.length, 20);
});

test('narrative: ein Arc traegt sein Thema aus themeByEvent', () => {
  const arc = createArc(rules.themeByEvent, 'gate.failed', 7);
  assert.equal(arc.id, 'arc-7');
  assert.equal(arc.theme, 'conflict');
  assert.equal(arc.status, 'active');
  assert.equal(createArc(rules.themeByEvent, 'gate.failed', 9).theme, arc.theme, 'kein Zufall');

  const unknown = createArc(rules.themeByEvent, 'etwas.neues', 1);
  assert.equal(unknown.theme, null, 'ein unbekanntes Ereignis erfindet kein Thema');
});

test('narrative: ein Composite ohne Ereignis-Typ bleibt beim Vorigen', () => {
  const previous = { seq: 4, mood: 'working', narrator: 'shinon', arc_id: 'arc-4', arc_events: 2, freezeThreshold: 20, pair: ['shinon'] };
  const next = deriveComposite(contract, previous, { id: 'ev', type: null, timestamp: null, actors: [] });
  assert.equal(next.seq, 5);
  assert.equal(next.mood, 'working', 'kein erfundener Takt');
  assert.equal(next.narrator, 'shinon');
  assert.deepEqual(next.pair, ['shinon']);
});
