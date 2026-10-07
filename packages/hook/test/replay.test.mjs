#!/usr/bin/env node
/**
 * packages/hook/test/replay.test.mjs — Replay- und Schema-Test für Wave 2.
 *
 * Prüft die Replay-Fixture und die Inhalte von index.js/client.js als Text,
 * ohne die Module zu laden (kein node_modules-Abhängigkeit erforderlich).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { codeOnly } from '../../../scripts/lib/source-scan.mjs';

const FIXTURE = JSON.parse(readFileSync(resolve('packages/hook/fixtures/replay-session-created.json'), 'utf8'));
const INDEX_CONTENT = readFileSync(resolve('packages/hook/index.js'), 'utf8');
/** Laufzeitcode ohne Kommentare und Strings — Kommentare dürfen nichts beweisen. */
const INDEX_CODE = codeOnly(INDEX_CONTENT);
const CLIENT_CONTENT = readFileSync(resolve('packages/hook/client.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('═══════════════════════════════════════');
console.log('  Shinon Hook — Replay & Schema Test');
console.log('═══════════════════════════════════════\n');

check('Replay-Fixture enthält 3 Events', () => {
  assert(Array.isArray(FIXTURE.events), 'events nicht als Array');
  assert(FIXTURE.events.length === 3, `erwartet 3, gefunden ${FIXTURE.events.length}`);
});

check('Replay-Event-Pfad korreliert (Trace-IDs)', () => {
  const traceIds = FIXTURE.events.map(e => e.trace_id);
  assert(traceIds.every(id => id && id.length > 3), 'Trace-ID zu kurz oder leer');
  assert(traceIds.every(id => id.startsWith('tr-')), 'Trace-ID folgt nicht Schema tr-');
});

check('Event-Schema in index.js definiert (EventSchema)', () => {
  assert(INDEX_CONTENT.includes('export const EventSchema'), 'EventSchema Export fehlt');
  assert(INDEX_CONTENT.includes('z.object'), 'EventSchema nicht als z.object');
});

check('Config-Schema in index.js definiert', () => {
  assert(INDEX_CONTENT.includes('export const Config'), 'Config Export fehlt');
  assert(INDEX_CONTENT.includes('observeEvents'), 'observeEvents nicht in Config');
  assert(INDEX_CONTENT.includes('failClosed'), 'failClosed nicht in Config');
  assert(INDEX_CONTENT.includes('contractGateEnabled'), 'contractGateEnabled nicht in Config');
});

check('Hook-API: normalizeEvent nutzt die echte Schemastery-API', () => {
  assert(INDEX_CONTENT.includes('export function normalizeEvent'), 'normalizeEvent fehlt');
  assert(INDEX_CODE.includes('EventSchema(raw)'), 'normalizeEvent ruft das Schema nicht auf');
  // Schemastery 3.18.4 kennt kein safeParse (das ist Zod). Die frühere Fassung
  // war damit toter Code, der bei jedem Aufruf geworfen hätte.
  assert(!INDEX_CODE.includes('safeParse'), 'safeParse existiert in Schemastery 3.18.4 nicht');
});

check('Hook-API: validateEvent definiert (fail-closed)', () => {
  assert(INDEX_CONTENT.includes('export function validateEvent'), 'validateEvent fehlt');
  assert(INDEX_CONTENT.includes('failClosed'), 'failClosed-Logik nicht in validateEvent');
  assert(INDEX_CONTENT.includes('contractGateEnabled'), 'contractGateEnabled nicht geprüft');
});

check('Apply-Funktion registriert den echten agent/pre-step-Hook', () => {
  assert(INDEX_CONTENT.includes('export function apply'), 'apply() fehlt');
  // Die Simulation ist ersetzt: es wird wirklich registriert, nicht protokolliert.
  assert(INDEX_CODE.includes('ctx.on(PRE_STEP_EVENT'), 'kein echter Listener auf agent/pre-step');
  assert(INDEX_CONTENT.includes("'agent/pre-step'"), 'Waterfall-Name fehlt');
  assert(INDEX_CODE.includes('return next()'), 'die Entscheidung des Downstream wird nicht durchgereicht');
  assert(INDEX_CODE.includes('kind:'), 'keine Entscheidung nach PreStepDecision');
  assert(INDEX_CONTENT.includes('console.log'), 'Keine Protokollierung (kein Aktivierungs-Log)');
});

check('Client.js enthält ModuleLoader und Beobachter', () => {
  assert(CLIENT_CONTENT.includes('__ModuleLoader__'), 'ModuleLoader fehlt');
  assert(CLIENT_CONTENT.includes('@shinon/hook'), 'Plugin-ID nicht korrekt');
  assert(CLIENT_CONTENT.includes('observeEvent'), 'Client-Beobachter observeEvent fehlt');
});

check('Mindestens 3 DSH-Events angebunden', () => {
  const eventsInIndex = [
    'session.created',
    'message.received',
    'message.completed',
    'claim.created',
    'tool.requested',
    'tool.completed',
    'gate.failed',
    'gate.passed',
    'action.blocked',
  ];
  const foundInSchema = eventsInIndex.filter(e => INDEX_CONTENT.includes(`z.const('${e}')`));
  assert(foundInSchema.length >= 3, `Nur ${foundInSchema.length} Event-Typen gefunden (erwartet ≥3)`);
});

check('Legacy-Guard: kein "dsh-mod" in Runtime-Artefakten', () => {
  assert(!INDEX_CONTENT.includes('dsh-mod'), 'dsh-mod in index.js gefunden');
  assert(!CLIENT_CONTENT.includes('dsh-mod'), 'dsh-mod in client.js gefunden');
  assert(!readFileSync(resolve('packages/hook/cordis.patch.yml'), 'utf8').includes('dsh-mod'), 'dsh-mod in cordis.patch.yml gefunden');
});

check('Replay-Notes referenzieren Fail-Closed und keine autonome Aktion', () => {
  assert(FIXTURE.notes.some(n => n.includes('autonom')), 'Notes erwähnen nicht "autonom"');
  assert(FIXTURE.notes.some(n => n.toLowerCase().includes('fail-closed') || n.includes('Fail-closed')), 'Notes erwähnen nicht "fail-closed"');
});

console.log('\n═══════════════════════════════════════');
console.log(`  Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen`);
console.log('═══════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
