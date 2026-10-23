#!/usr/bin/env node
/**
 * scripts/gate/test-lanes.mjs — die Testline als Daten, nicht als Aufrufzeile.
 *
 * WARUM ES DIESE DATEI GIBT: `node --test scripts/gate/tests/*.test.mjs` hat
 * zwei Fehler, die zusammen wie Erfolg aussehen. Erstens zählt ein Test, der
 * sein Zeitlimit reißt, im TAP-Bericht als `cancelled` — und `node` beendet
 * den Lauf trotzdem mit Exit 0, obwohl die Datei mit `not ok` dasteht. Ein
 * Deckel, der nicht rot wird, ist kein Deckel. Zweitens mischt eine einzige
 * Liste schnelle Regelprüfungen mit Index-/Scoring-Läufen, die eine echte
 * SQLite und Sekunden brauchen; nebeneinander gestartet reißen die langsamen
 * den 20-s-Deckel, obwohl jede für sich grün ist.
 *
 * Deshalb: pro Datei GENAU eine Bahn, jede Grenze als Zahl, und der Runner
 * wertet den TAP-Bericht selbst aus. `fail` ODER `cancelled` über null ist rot.
 * Eine Datei ohne Bahn ist ein Befund — nicht ein stiller Skip.
 *
 * Bahnen (`scripts/gate/test-lanes.json`, `shinon.gate-lanes/v1`):
 *   fast  — lokale Standardkette, Ziel 10 s je Test, harte Grenze 20 s.
 *   slow  — CI-Tier: echte SQLite/Indexläufe, Grenze 600 s je Test.
 *
 * Aufruf:
 *   node scripts/gate/test-lanes.mjs fast          # lokale Kette
 *   node scripts/gate/test-lanes.mjs slow          # CI-Tier
 *   node scripts/gate/test-lanes.mjs all           # beide nacheinander
 *   node scripts/gate/test-lanes.mjs --check       # nur Zuordnung prüfen
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LANES = ['fast', 'slow'];

/** Die Dateinamen der Testdateien einer Wurzel — sortiert, ohne Ordner. */
function discovered(root) {
  const dir = join(root, 'tests');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort();
}

/** Die Registry lesen; ein defekter Eintrag ist ein Befund, kein Rückfall. */
export function readRegistry(root = HERE) {
  const file = join(root, 'test-lanes.json');
  if (!existsSync(file)) return { error: `Registry fehlt: ${file}`, lanes: null };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { error: `Registry unlesbar: ${file} (${error?.message})`, lanes: null };
  }
  if (parsed?.contract !== 'shinon.gate-lanes/v1') {
    return { error: `Registry mit fremdem Vertrag: ${String(parsed?.contract)}`, lanes: null };
  }
  if (parsed.lanes === null || typeof parsed.lanes !== 'object') {
    return { error: 'Registry ohne `lanes`', lanes: null };
  }
  return { error: null, lanes: parsed.lanes, limits: parsed.limits ?? {}, concurrency: parsed.concurrency ?? {} };
}

/**
 * Jede Testdatei genau einer Bahn zuordnen. Der Rückgabewert ist eine Liste
 * von Befunden; leer heißt vollständig und eindeutig.
 */
export function laneIssues(root = HERE) {
  const { error, lanes, limits } = readRegistry(root);
  if (error !== null) return [error];
  const issues = [];
  const found = new Set(discovered(root));
  const seen = new Map();

  for (const lane of LANES) {
    const list = lanes[lane];
    if (!Array.isArray(list)) {
      issues.push(`Bahn \`${lane}\` fehlt oder ist keine Liste`);
      continue;
    }
    const limit = limits[lane];
    if (!Number.isInteger(limit) || limit <= 0) {
      issues.push(`Bahn \`${lane}\` hat keine gültige Grenze (Soll: ganze Zahl > 0)`);
    }
    for (const name of list) {
      if (typeof name !== 'string' || name === '') {
        issues.push(`Bahn \`${lane}\` enthält einen leeren Eintrag`);
        continue;
      }
      if (seen.has(name)) issues.push(`\`${name}\` steht in \`${seen.get(name)}\` UND \`${lane}\``);
      else seen.set(name, lane);
      if (!found.has(name)) issues.push(`\`${name}\` (Bahn \`${lane}\`) existiert nicht unter tests/`);
    }
  }
  for (const name of found) {
    if (!seen.has(name)) issues.push(`\`${name}\` gehört keiner Bahn — trage sie in test-lanes.json ein`);
  }
  return issues;
}

/** Die Dateien einer Bahn als absolute Pfade, in Registry-Reihenfolge. */
export function laneFiles(lane, root = HERE) {
  const { error, lanes } = readRegistry(root);
  if (error !== null) throw new Error(error);
  const list = lanes[lane];
  if (!Array.isArray(list)) throw new Error(`Unbekannte Bahn: ${String(lane)}`);
  return list.map((name) => join(root, 'tests', name));
}

/**
 * Die Zusammenfassung eines TAP-Berichts lesen. `cancelled` zählt wie `fail`:
 * ein abgebrochener Test ist kein grüner Test.
 */
export function summaryCounts(tap) {
  const counts = {};
  for (const line of String(tap).split('\n')) {
    const match = /^# (tests|pass|fail|cancelled|skipped) (\d+)$/.exec(line.trim());
    if (match !== null) counts[match[1]] = Number(match[2]);
  }
  return counts;
}

/** Das Urteil aus den Zählern — null bedeutet grün. */
export function verdict(counts) {
  if (counts.tests === undefined) return 'TAP-Bericht ohne Zusammenfassung — der Lauf ist ungeprüft';
  if ((counts.fail ?? 0) > 0) return `${counts.fail} Test(s) rot`;
  if ((counts.cancelled ?? 0) > 0) return `${counts.cancelled} Test(s) abgebrochen (Zeitgrenze oder Abbruch) — zählt als rot`;
  return null;
}

/** Eine Bahn fahren: Ausgabe durchreichen, TAP selbst auswerten, fail-closed. */
function runLane(lane, root) {
  const { limits, concurrency } = readRegistry(root);
  const limit = limits[lane];
  // Begrenzte Parallelität: 97 Dateien gleichzeitig lassen auch einen 1,4-s-Test
  // in den Deckel laufen, weil DSH/SQLite um dieselbe Maschine streiten. Vier
  // Bündel sind schnell genug und machen den Lauf reproduzierbar.
  const parallel = Number.isInteger(concurrency?.[lane]) ? concurrency[lane] : 4;
  const files = laneFiles(lane, root);
  if (files.length === 0) {
    console.error(`test-lanes: Bahn \`${lane}\` ist leer — das ist kein grüner Lauf.`);
    return 1;
  }
  console.log(`test-lanes: ${lane} — ${files.length} Dateien, Grenze ${limit} ms je Test`);
  const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-timeout=${limit}`, `--test-concurrency=${parallel}`, ...files], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(child.stdout ?? '');
  process.stderr.write(child.stderr ?? '');
  const counts = summaryCounts(child.stdout ?? '');
  const finding = verdict(counts);
  if (finding !== null) {
    console.error(`test-lanes: ${lane} ROT — ${finding}`);
    return 1;
  }
  if (child.status !== 0) {
    console.error(`test-lanes: ${lane} ROT — node endete mit ${String(child.status)}`);
    return 1;
  }
  console.log(`test-lanes: ${lane} grün — ${counts.pass ?? 0} von ${counts.tests} Tests.`);
  return 0;
}

function main(argv) {
  const [lane] = argv;
  const issues = laneIssues(HERE);
  if (issues.length > 0) {
    console.error('test-lanes: die Bahn-Zuordnung ist nicht fail-closed:');
    for (const issue of issues) console.error(`  - ${issue}`);
    return 2;
  }
  if (lane === '--check') {
    console.log(`test-lanes: ${discovered(HERE).length} Dateien, jede genau einer Bahn zugeordnet.`);
    return 0;
  }
  if (lane === 'all') {
    for (const name of LANES) {
      const code = runLane(name, HERE);
      if (code !== 0) return code;
    }
    return 0;
  }
  if (!LANES.includes(lane)) {
    console.error(`test-lanes: unbekannte Bahn \`${String(lane)}\` (erlaubt: ${LANES.join(', ')}, all, --check)`);
    return 2;
  }
  return runLane(lane, HERE);
}

const invoked = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
