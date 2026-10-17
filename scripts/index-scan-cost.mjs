#!/usr/bin/env node
/**
 * index-scan-cost.mjs — was kostet der Startscan des Projektindex, und was der Mount?
 *
 * DIE FRAGE (eine, nicht drei): Plan §12 sagt, der Index-Build darf den kritischen
 * Agent-Eventloop nicht blockieren, und `packages/project-index/index.js` schiebt
 * den Lauf deshalb NACH den Mount und in einen Worker. Diese Entscheidung war im
 * Code als eine Zeile Kommentar belegt („gemessen: 817 ms") — eine Zahl ohne
 * Befehl. Dieses Skript ist der Befehl.
 * → Kanon: docs/COMMENT-KANON.md#k-1f83cd1fe67b
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = process.cwd();
const core = await import(new URL('../packages/project-index/assets/index-core.js', import.meta.url).href);
const pkg = await import(new URL('../packages/project-index/index.js', import.meta.url).href);

const out = {};
const temp = (label) => mkdtempSync(join(tmpdir(), `shinon-scan-${label}-`));
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

out.files = core.listFiles(ROOT).length;

// (1) KALTER LAUF — derselbe `runIndex`, den der Worker aufruft.
const coldRoot = temp('kalt');
let started = performance.now();
out.coldReport = core.runIndex({ root: ROOT, indexRoot: coldRoot, verify: 'stamp' });
out.coldMs = Math.round(performance.now() - started);

// (2) ZWEITER LAUF, nichts verändert.
started = performance.now();
out.warmReport = core.runIndex({ root: ROOT, indexRoot: coldRoot, verify: 'stamp' });
out.warmMs = Math.round(performance.now() - started);

// (3) MOUNT — wie lange blockiert `apply()`, und wann kommt der Bericht? Der
// Zähler ist der Punkt: er sagt, ob die Schleife während des Laufs bedient wird.
const lines = [];
const saved = { log: console.log, warn: console.warn, error: console.error };
console.log = console.warn = console.error = (...args) => lines.push(args.join(' '));
let ticks = 0;
const mountTimer = setInterval(() => {
  ticks += 1;
}, 1);
const mountRoot = temp('mount');
try {
  started = performance.now();
  const dispose = pkg.apply({}, pkg.Config({ root: ROOT, indexRoot: mountRoot }));
  out.mountMs = Math.round(performance.now() - started);
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && !lines.some((line) => line.includes('Lauf im'))) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  out.mountToReportMs = Math.round(performance.now() - started);
  out.mountTicks = ticks;
  out.mountLine = lines.find((line) => line.includes('Lauf im')) ?? null;
  dispose();
} finally {
  clearInterval(mountTimer);
  Object.assign(console, saved);
}

// (4) WORKER gegen HOST — dieselbe Arbeit, derselbe Zähler. Der Unterschied ist
// die Aussage, nicht die Laufzeit: gemessen ist der Worker sogar etwas langsamer.
const workerRoot = temp('worker');
ticks = 0;
const workerTimer = setInterval(() => {
  ticks += 1;
}, 1);
started = performance.now();
const workerResult = await core.runIndexInWorker({ root: ROOT, indexRoot: workerRoot, verify: 'stamp' });
out.workerMs = Math.round(performance.now() - started);
out.workerTicks = ticks;
out.workerOk = workerResult.ok;
clearInterval(workerTimer);

const hostRoot = temp('host');
ticks = 0;
const hostTimer = setInterval(() => {
  ticks += 1;
}, 1);
started = performance.now();
core.runIndex({ root: ROOT, indexRoot: hostRoot, verify: 'stamp' });
out.hostMs = Math.round(performance.now() - started);
out.hostTicks = ticks;
clearInterval(hostTimer);

for (const dir of [coldRoot, mountRoot, workerRoot, hostRoot]) drop(dir);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const r = out.coldReport;
  console.log(`[index-scan-cost] Bestand: ${out.files} indexierbare Dateien`);
  console.log(`  kalt:    ${out.coldMs} ms — ${r.written} geschrieben, ${r.hashed} gelesen, ${r.readBytes} Bytes, ${r.references} Referenzen, ${r.touches} Touches, ${r.skipped} uebersprungen`);
  console.log(`  warm:    ${out.warmMs} ms — ${out.warmReport.unchanged} unveraendert, ${out.warmReport.readBytes} Bytes gelesen`);
  console.log(`  Mount:   ${out.mountMs} ms bis apply() zurueckkehrt, Bericht nach ${out.mountToReportMs} ms (${out.mountTicks} Timer-Ticks waehrenddessen)`);
  console.log(`  Worker:  ${out.workerMs} ms, ${out.workerTicks} Ticks | Host: ${out.hostMs} ms, ${out.hostTicks} Ticks`);
  if (out.mountLine !== null) console.log(`  Zeile:   ${out.mountLine}`);
}
