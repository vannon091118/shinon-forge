#!/usr/bin/env node
/**
 * scripts/assets/build-encounter-client.mjs — der Encounter-Kern im Browser.
 *
 * WARUM ES DIESES SKRIPT GIBT: `packages/codingmon/assets/encounter.js` ist der
 * EINE Besitzer des Encounter-Vertrags (Tabelle, Source Map, Reducer). Die
 * Buehne (S5) laeuft aber im Composer-Dock, und ein Client-Bundle ist
 * selbststaendig — es kann `assets/` nicht importieren, weil DSH dem Browser
 * keine Plugin-Ressourcen als Dateien ausliefert. Ohne diesen Spiegel gaebe es
 * zwei Wege: eine zweite, handgeschriebene Zustandsmaschine im Client (zwei
 * Wahrheiten, die auseinanderlaufen) oder eine Buehne ohne Reducer (eine
 * Animation, die den Fortschritt behauptet).
 *
 * Also wird der Kern WOERTLICH eingebettet, nicht nachgebaut. Das ist moeglich,
 * weil `encounter.js` importfrei ist — dieselbe Bedingung, die seine Tests ohne
 * `node_modules` laufen laesst. `export ` faellt weg, der Rest bleibt Zeichen
 * fuer Zeichen gleich; ein Test (`packages/codingmon/test/encounter-client.test.mjs`)
 * vergleicht den Block mit dieser Funktion und faehrt beide Fassungen durch
 * dieselben Ereignisse.
 *
 * Aufruf:
 *   node scripts/assets/build-encounter-client.mjs [--check]
 *   --check  vergleicht nur und endet mit Exit 1 bei Drift (schreibt nichts).
 *
 * Fail-closed: fehlt ein Marker, ist der Kern nicht importfrei oder traegt er
 * eine Marke, die im Browser nicht gelten darf (`export`), bricht das Skript
 * ab, statt einen halben Block zu schreiben. Es gibt keinen stillen Rueckfall.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBlockFile, writeBlockBody } from '../lib/embed-blocks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CORE_FILE = join(ROOT, 'packages', 'codingmon', 'assets', 'encounter.js');
// Geschrieben wird in den QUELLTEIL, nicht ins generierte Bundle — und welcher
// Teil den Block traegt, wird gesucht, nicht verdrahtet (die Teile sind nach
// ihrer ersten Deklaration benannt).
const PARTS_DIR = join(ROOT, 'packages', 'codingmon', 'assets', 'client');
const LF = String.fromCharCode(10);

/** Der Block, den dieses Skript besitzt. Ein zweiter gibt es nicht. */
export const REGION = 'generated-encounter-core';
const OPEN = '// >>> ' + REGION + ' — source: assets/encounter.js';
const CLOSE = '// <<< ' + REGION;

/** Die Namen, die der Client aus dem Kern sieht — genau diese, keine mehr. */
const EXPORTED = [
  'ENCOUNTER_CONTRACT',
  'ENCOUNTER_STATES',
  'ENCOUNTER_TERMINAL_STATES',
  'ENCOUNTER_EVENT_MEMORY',
  'ENCOUNTER_SOURCE_KINDS',
  'ENCOUNTER_EVENTS',
  'ENCOUNTER_SOURCE_MAP',
  'ENCOUNTER_EVENT_TYPES',
  'createEncounterState',
  'reduceEncounter',
  'foldEncounter',
  'encounterEvent',
];

/** Die Namen, die der Client tatsaechlich bindet (kleiner als der Kern). */
const BOUND = [
  'ENCOUNTER_CONTRACT',
  'ENCOUNTER_EVENTS',
  'ENCOUNTER_EVENT_TYPES',
  'ENCOUNTER_SOURCE_MAP',
  'ENCOUNTER_STATES',
  'ENCOUNTER_TERMINAL_STATES',
  'createEncounterState',
  'reduceEncounter',
  'encounterEvent',
];

/**
 * Den Kern als IIFE-Ausdruck rendern.
 *
 * Die Pruefung vor dem Einbetten ist die eigentliche Arbeit: ein Import, ein
 * `export` mitten in der Zeile oder ein zweiter Export, den `EXPORTED` nicht
 * kennt, wuerde im Browser entweder werfen oder einen Namen behaupten, den es
 * nicht gibt. Beides faellt hier auf, nicht erst im Panel.
 */
export function renderEncounterBlock(source) {
  if (typeof source !== 'string' || source.trim() === '') throw new Error('encounter.js ist leer');
  if (/^\s*import\s/m.test(source)) throw new Error('encounter.js importiert — der Kern muss importfrei bleiben');
  const declared = [...source.matchAll(/^export\s+(?:const|function|let|class)\s+([A-Za-z0-9_$]+)/gm)].map((match) => match[1]);
  const missing = EXPORTED.filter((name) => declared.indexOf(name) === -1);
  const extra = declared.filter((name) => EXPORTED.indexOf(name) === -1);
  if (missing.length > 0) throw new Error('encounter.js exportiert nicht: ' + missing.join(', '));
  if (extra.length > 0) throw new Error('encounter.js exportiert zusaetzlich: ' + extra.join(', ') + ' — Liste pflegen oder Export entfernen');
  // Der Browser braucht den CODE, nicht die Begruendung: die langen "warum"-
  // Bloecke stehen in `assets/encounter.js` (und in dieser Datei), wo sie
  // gelesen werden. Im Buendel wuerden sie jede Aenderung verdoppeln, ohne dass
  // jemand sie dort liest. Gestrichen wird nur, was reiner Kommentar ist —
  // Codezeilen bleiben Zeichen fuer Zeichen gleich, inklusive Einrueckung.
  const body = source
    .replace(/^export\s+/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(LF)
    .filter((line) => !/^\s*\/\//.test(line))
    .join(LF)
    .replace(new RegExp(LF + '{2,}', 'g'), LF + LF)
    .trim();
  const indented = body.split(LF).map((line) => (line === '' ? '' : '      ' + line)).join(LF);
  const names = EXPORTED.join(', ');
  return [
    '    ' + OPEN,
    '    const ENCOUNTER_CORE = (() => {',
    indented,
    '      return Object.freeze({ ' + names + ' });',
    '    })();',
    '    // Gebunden wird nur, was die Buehne liest — der Kern bleibt vollstaendig.',
    '    const { ' + BOUND.join(', ') + ' } = ENCOUNTER_CORE;',
    '    ' + CLOSE,
  ].join(LF);
}

/**
 * Der Block, wie er JETZT in client.js steht — Marker-Zeilen inklusive und ab
 * Zeilenanfang, damit die Einrueckung mitverglichen wird (ein verlorenes
 * Leerzeichen ist Drift wie jede andere).
 */
export function currentBlock(clientText) {
  const marker = clientText.indexOf(OPEN);
  const end = clientText.indexOf(CLOSE);
  if (marker === -1 || end === -1 || end < marker) throw new Error('Marker ' + REGION + ' fehlt in client.js');
  const start = clientText.lastIndexOf(LF, marker) + 1;
  return clientText.slice(start, end + CLOSE.length);
}

function main() {
  const check = process.argv.includes('--check');
  const file = findBlockFile(PARTS_DIR, REGION);
  const text = readFileSync(file, 'utf8');
  const expected = renderEncounterBlock(readFileSync(CORE_FILE, 'utf8'));
  const actual = currentBlock(text);
  if (check) {
    if (actual !== expected) {
      console.error('💥 build-encounter-client: der eingebettete Kern weicht von assets/encounter.js ab');
      process.exit(1);
    }
    console.log('✅ build-encounter-client: Einbettung deckungsgleich');
    return;
  }
  if (actual === expected) {
    console.log('= build-encounter-client: Einbettung deckungsgleich');
    return;
  }
  // Der Rumpf OHNE die beiden Markenzeilen geht durch `writeBlock`, damit der
  // Balance-Riegel greift: enthielte der alte Rumpf eine fremde Marke, wuerde
  // dieser Schreibvorgang sie verschlucken — und das ist ein Fehler, kein Lauf.
  const lines = expected.split(LF);
  const body = lines.slice(1, -1).join(LF);
  const next = writeBlockBody(text, REGION, body);
  if (next === text) {
    console.log('= build-encounter-client: Einbettung deckungsgleich');
    return;
  }
  writeFileSync(file, next);
  console.log('✅ build-encounter-client: Block ' + REGION + ' neu geschrieben (' + file + ')');
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
