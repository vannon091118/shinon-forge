#!/usr/bin/env node
/**
 * scripts/index-warm-measure.mjs — die drei Zahlen des warmen Index, gemessen.
 *
 * WARUM ES DIESES SKRIPT GIBT: „warm" ist eine Behauptung ueber KOSTEN, und eine
 * Behauptung ohne Messung ist eine Meinung. Dieses Skript faehrt denselben Weg
 * wie der Host (Kaltlauf beim Mount, danach Abfragen) auf einer KOPIE des Baums
 * und schreibt die drei Zahlen hin, die der Auftrag nennt:
 *
 *   1. ZEIT BIS ZUM ERSTEN TREFFER — kalt (Kaltlauf + Abfrage) gegen warm
 *      (Abfrage auf demselben Baum, ohne Aenderung).
 *   2. TREFFERQUOTE DIREKT NACH EINER DATEIAENDERUNG — die genannte Datei wird
 *      gleich groß und mit zurueckgesetzter mtime geaendert (die §11-Luecke);
 *      gezaehlt wird, ob der naechste Treffer sie frisch liefert.
 *   3. KOSTEN JE ABFRAGE — Kandidaten, geprueft, gelesene Bytes, Millisekunden
 *      (Median aus N Abfragen).
 *
 * Der gemessene Baum wird NIE veraendert: er wird in ein temporaeres
 * Verzeichnis kopiert (`--no-copy` schaltet das ab — dann wird die Quelle
 * geändert, und das Skript sagt es). Der Index liegt ebenfalls im Temp.
 *
 *   node scripts/index-warm-measure.mjs [--root <dir>] [--prompt <text>]
 *        [--queries 20] [--json] [--keep] [--no-copy]
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import {
  SKIP_DIRS,
  openIndex,
  resolveContext,
  updateIndex,
} from '../packages/project-index/assets/index-core.js';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = argv.find((entry) => entry.startsWith(`${name}=`));
  if (hit !== undefined) return hit.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index !== -1 && argv[index + 1] !== undefined) return argv[index + 1];
  return fallback;
};
const wants = (name) => argv.includes(name);

const source = resolve(value('--root', process.cwd()));
const prompt = value('--prompt', 'packages/project-index/assets/index-core.js');
const rounds = Math.max(1, Number(value('--queries', '20')));
const asJson = wants('--json');
const keep = wants('--keep');
const copyTree = !wants('--no-copy');

const work = mkdtempSync(join(tmpdir(), 'shinon-index-warm-'));
const root = copyTree ? join(work, 'baum') : source;
if (copyTree) {
  cpSync(source, root, {
    recursive: true,
    // Dieselben Auslassungen wie der Index: sonst kopiert die Messung mehr, als
    // sie misst (node_modules, .git, dist).
    filter: (from) => !(SKIP_DIRS.has(basename(from)) && from !== source),
  });
}

const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

function query(db, text) {
  const reports = [];
  const context = resolveContext(db, {
    prompt: text,
    project: basename(root),
    root,
    refresh: true,
    onRefresh: (report) => reports.push(report),
  });
  return { context, report: reports[0] ?? null };
}

const result = {
  contract: 'shinon.index-warm-measure/v1',
  root: source,
  measuredOn: copyTree ? 'Kopie' : 'Quelle',
  prompt,
  rounds,
};

let db;
try {
  // 1. KALT: Index bauen und den ersten Treffer holen.
  const coldStarted = now();
  db = openIndex(join(work, 'index.sqlite'));
  const cold = updateIndex(db, root, {});
  const coldBuildMs = now() - coldStarted;
  const firstStarted = now();
  const first = query(db, prompt);
  const firstQueryMs = now() - firstStarted;
  const coldFirstHitMs = coldBuildMs + firstQueryMs;

  // 2. WARM: derselbe Baum, keine Aenderung — N Abfragen.
  const warmMs = [];
  const warmReports = [];
  for (let index = 0; index < rounds; index += 1) {
    const started = now();
    const entry = query(db, prompt);
    warmMs.push(now() - started);
    warmReports.push(entry.report);
  }
  const warm = {
    medianMs: median(warmMs),
    minMs: Math.min(...warmMs),
    maxMs: Math.max(...warmMs),
    candidates: warmReports[0]?.candidates ?? 0,
    checked: warmReports[0]?.checked ?? 0,
    read: warmReports.reduce((sum, report) => sum + (report?.read ?? 0), 0),
    readBytes: warmReports.reduce((sum, report) => sum + (report?.readBytes ?? 0), 0),
    stamped: warmReports.reduce((sum, report) => sum + (report?.stamped ?? 0), 0),
  };

  // 3. AENDERUNG: die genannte Datei gleich groß und mit zurueckgesetzter mtime
  //    — genau die Luecke, die nur der Stempel sieht.
  const target = first.context.files[0]?.path ?? null;
  const beforeContent = target === null ? '' : (first.context.files.find((file) => file.path === target)?.content ?? '');
  let change = null;
  if (target !== null) {
    const absolute = join(root, target);
    const before = readFileSync(absolute, 'utf8');
    const info = statSync(absolute);
    // Erster Buchstabe invertiert: gleiche Byte-Zahl, anderer Inhalt.
    const mutated = before.replace(/[A-Za-z]/, (letter) => (letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()));
    if (Buffer.byteLength(mutated) === info.size && mutated !== before) {
      writeFileSync(absolute, mutated);
      utimesSync(absolute, info.atime, info.mtime);
      const started = now();
      const after = query(db, prompt);
      const ms = now() - started;
      const hit = after.context.files.some((file) => file.path === target);
      // „frisch" heisst: der zurueckgegebene Text ist nicht mehr der von vorher.
      const afterContent = after.context.files.find((file) => file.path === target)?.content ?? '';
      const fresh = hit && afterContent !== '' && afterContent !== beforeContent;
      change = {
        path: target,
        bytes: info.size,
        ms,
        hits: after.context.files.length,
        hit,
        fresh,
        read: after.report?.read ?? 0,
        readBytes: after.report?.readBytes ?? 0,
        written: after.report?.written ?? 0,
        checked: after.report?.checked ?? 0,
      };
    }
  }

  Object.assign(result, {
    files: cold.files,
    coldBuildMs: Math.round(coldBuildMs),
    firstQueryMs: Math.round(firstQueryMs),
    coldFirstHitMs: Math.round(coldFirstHitMs),
    firstHit: first.context.files.map((file) => file.path),
    warm,
    change,
  });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`# Index warm — ${source} (${result.measuredOn}), Prompt: ${JSON.stringify(prompt)}`);
    console.log(`Kalt   : ${result.coldFirstHitMs} ms (Kaltlauf ${result.coldBuildMs} ms fuer ${cold.files} Dateien, ${cold.readBytes} B gelesen; erster Treffer +${result.firstQueryMs} ms)`);
    console.log(`Warm   : ${warm.medianMs.toFixed(2)} ms Median (${warm.minMs.toFixed(2)}–${warm.maxMs.toFixed(2)} ms, ${rounds} Abfragen) — ${warm.candidates} Kandidat(en), ${warm.checked} geprueft, ${warm.read} gelesen, ${warm.readBytes} B`);
    if (change === null) {
      console.log('Aenderung: nicht messbar (kein Treffer oder Mutation ohne Größenänderung)');
    } else {
      console.log(`Aenderung: ${change.path} (${change.bytes} B, gleiche Groesse, mtime zurueckgesetzt) — Treffer ${change.hit ? 'ja' : 'nein'}, frisch ${change.fresh ? 'ja' : 'nein'}, ${change.read} gelesen / ${change.checked} geprueft in ${change.ms.toFixed(2)} ms`);
    }
  }
} finally {
  try {
    db?.close();
  } catch {
    /* schon zu */
  }
  if (!keep) rmSync(work, { recursive: true, force: true });
  else console.log(`# Arbeitsverzeichnis behalten: ${work}`);
}
