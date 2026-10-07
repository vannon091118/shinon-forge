#!/usr/bin/env node
/**
 * packages/hook/test/replay.test.mjs — die zwei Zusagen, die der Host-Test nicht abdeckt.
 *
 * Der Verhaltensvertrag des Hooks (echter Waterfall, Durchreichen, Korrelation,
 * Absage, Lifecycle) steht in scripts/gate/tests/hook-pre-step.test.mjs und wird
 * dort gegen echtes Cordis gefahren. Hier bleibt nur, was dort nicht hingehört:
 *
 *   1. Die Replay-Fixture bleibt ein gültiges, in sich stimmiges Orakel des
 *      Wave-2-Event-Vokabulars — sie soll nicht still verrotten.
 *   2. Die Client-Hälfte ist ein LADBARES Cordis-Plugin. Das ist eine echte
 *      Bruchstelle: ein Datenobjekt ohne apply() reißt den GESAMTEN Client-Boot
 *      der Web-UI ab, weil der Loader alle Einträge in einem Promise.all mountet.
 *      Statisch prüft das bisher niemand (siehe Probe hook-client-plugin-shape).
 *
 * Was hier bewusst NICHT mehr steht: String-Inspektion von index.js. Sie war
 * implementierungsgekoppelt (sie prüfte z. B. das Vorhandensein von
 * `EventSchema.safeParse`, einer Schemastery-API, die es nicht gibt) und
 * bewies Verhalten nur scheinbar. Dieses Feld gehört dem ausführbaren Vertrag.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { codeOnly } from '../../../scripts/lib/source-scan.mjs';

const FIXTURE = JSON.parse(readFileSync(resolve('packages/hook/fixtures/replay-session-created.json'), 'utf8'));
const CLIENT_CONTENT = readFileSync(resolve('packages/hook/client.js'), 'utf8');
const CLIENT_CODE = codeOnly(CLIENT_CONTENT);

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
console.log('  Shinon Hook — Replay & Client-Vertrag');
console.log('═══════════════════════════════════════\n');

check('Replay-Fixture ist ein korreliertes Orakel mit 3 Events', () => {
  assert(Array.isArray(FIXTURE.events), 'events nicht als Array');
  assert(FIXTURE.events.length === 3, `erwartet 3, gefunden ${FIXTURE.events.length}`);
  const traceIds = FIXTURE.events.map((event) => event.trace_id);
  assert(traceIds.every((id) => typeof id === 'string' && id.startsWith('tr-') && id.length > 3), 'Trace-ID folgt nicht dem Schema tr-');
  assert(FIXTURE.notes.some((note) => note.includes('autonom')), 'Notes erwähnen nicht "autonom"');
  assert(FIXTURE.notes.some((note) => note.toLowerCase().includes('fail-closed')), 'Notes erwähnen nicht "fail-closed"');
});

check('Client-Hälfte ist ein ladbares Cordis-Plugin unter der Vertrags-id', () => {
  assert(CLIENT_CONTENT.includes('__ModuleLoader__'), 'ModuleLoader fehlt');
  const id = CLIENT_CONTENT.match(/__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/)?.[1];
  assert(id === '@shinon/hook', `ModuleLoader-id "${id}" ≠ "@shinon/hook"`);
  // Die Bruchstelle: der Loader verlangt eine Funktion oder ein Objekt mit apply().
  assert(CLIENT_CODE.includes('apply('), 'keine apply()-Methode — der Client-Boot bricht damit ab');
  assert(CLIENT_CONTENT.includes('observeEvent'), 'Client-Beobachter observeEvent fehlt');
});

console.log('\n═══════════════════════════════════════');
console.log(`  Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen`);
console.log('═══════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
