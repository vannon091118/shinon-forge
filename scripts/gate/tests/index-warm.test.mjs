#!/usr/bin/env node
/**
 * scripts/gate/tests/index-warm.test.mjs — der Project Index wird im Betrieb warm,
 * ohne Dauerbeobachter.
 *
 * WARUM DIESE DATEI EXISTIERT: der Index entstand bis 2026-10-20 nur beim Mount.
 * Der Leitstand-Lauf (`docs/probes/e2e-leitstand-2026-10-19.md` §4) hat den Preis
 * gemessen: Boot 1 Datei, Ende 25 Dateien im Baum, Index unverändert 1 — die
 * Abfrage lieferte `[]`, MAX arbeitete mit leerem Kontext. Ein Watcher wäre ein
 * Dauerbeobachter (Prozess, Plattformfrage); ein Vollscan je Turn kostet den
 * ganzen Baum. Der Warm-Pfad prüft deshalb nur die KANDIDATEN der Abfrage über
 * den Inode-Stempel und liest ausschließlich geänderte oder neue Dateien.
 *
 * GEPRÜFT WIRD DIE ENTSCHEIDUNG, nicht die Absicht:
 *
 *   1. VERTRAG — der Kontext hat weiterhin genau sechs Schlüssel; der Bericht
 *      reist über `onRefresh`, nicht als siebter Schlüssel.
 *   2. UNVERÄNDERT — ein zweiter Lauf liest NULL Bytes (`stamped === checked`).
 *      Ohne die Stempelprüfung (nur mtime+size) wäre die geänderte Datei aus
 *      Punkt 3 unsichtbar: gleiche Größe, zurückgesetzte mtime.
 *   3. GEÄNDERT — genau EINE Datei wird gelesen, ihr neuer Inhalt steht im
 *      nächsten Treffer, ihre alten Symbole sind weg.
 *   4. NEU und WEG — eine im Prompt genannte, dem Index unbekannte Datei wird
 *      aufgenommen; eine gelöschte verliert ihre Zeilen (sonst liefert der Index
 *      Kontext aus einer Datei, die es nicht gibt).
 *   5. KOSTEN — je Abfrage ein `stat` je Kandidat, gedeckelt durch
 *      WARM_CANDIDATE_LIMIT; im Normalfall 0 gelesene Bytes.
 *
 * Die drei Messzahlen (kalt, warm, Trefferquote nach Änderung) stehen als
 * `# INDEX-WARM …`-Zeile in der Ausgabe und sind damit im Lauf belegt; die
 * belastbare Fassung für `docs/ZAHLEN.md` liefert
 * `scripts/index-warm-measure.mjs` auf einem echten Baum.
 *
 * Läuft mit `node --test` (Node ≥ 22, `node:sqlite`); kein DSH, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  WARM_CANDIDATE_LIMIT,
  WARM_CONTRACT,
  openIndex,
  resolveContext,
  updateIndex,
} from '../../../packages/project-index/assets/index-core.js';

const work = mkdtempSync(join(tmpdir(), 'shinon-index-warm-'));
process.on('exit', () => {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* Aufräumen ist Beiwerk */
  }
});

/** Der Kontextvertrag: genau diese sechs Schlüssel, nicht sieben. */
const CONTEXT_KEYS = ['project', 'files', 'symbols', 'constraints', 'touches', 'dependencies'];

let fixtureCount = 0;
/**
 * Ein Projekt mit `files` Dateien: `src/<name>.mjs` mit je einem eindeutigen
 * Symbol, plus `package.json`. Die Größe ist nötig, damit „kalt" und „warm"
 * überhaupt unterscheidbar sind — bei zwei Dateien wäre jede Messung Rauschen.
 */
function fixture(files = 120) {
  fixtureCount += 1;
  const root = join(work, `projekt-${fixtureCount}`);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: `fixture-${fixtureCount}` }, null, 2)}\n`);
  for (let index = 0; index < files; index += 1) {
    const name = `mod${String(index).padStart(3, '0')}`;
    writeFileSync(
      join(root, 'src', `${name}.mjs`),
      `export function ${name}Wert() {\n  return ${index};\n}\n`,
    );
  }
  return root;
}

function open(root) {
  return openIndex(join(root, 'index.sqlite'));
}

/** Eine Abfrage wie aus dem Host: warm, mit Bericht. */
function query(db, root, prompt) {
  const reports = [];
  const context = resolveContext(db, {
    prompt,
    project: 'fixture',
    root,
    refresh: true,
    onRefresh: (report) => reports.push(report),
  });
  assert.equal(reports.length, 1, 'je Abfrage genau EIN Auffrisch-Bericht');
  return { context, report: reports[0] };
}

const stampOf = (path) => {
  const info = statSync(path);
  return { atime: info.atime, mtime: info.mtime };
};

// ── 1. Vertrag ──────────────────────────────────────────────────────────────

test('warm: der Kontextvertrag bleibt bei sechs Schlüsseln', () => {
  const root = fixture(4);
  const db = open(root);
  try {
    updateIndex(db, root, {});
    const warm = query(db, root, 'src/mod000.mjs');
    assert.deepEqual(Object.keys(warm.context), CONTEXT_KEYS, 'der Bericht darf kein siebter Schlüssel sein');
    // Auch ohne Auffrischung dieselbe Form — der Warm-Pfad ändert die Naht nicht.
    const cold = resolveContext(db, { prompt: 'src/mod000.mjs', project: 'fixture' });
    assert.deepEqual(Object.keys(cold), CONTEXT_KEYS);
    assert.equal(warm.report.contract, WARM_CONTRACT);
  } finally {
    db.close();
  }
});

// ── 2. Kalt gegen warm: Zeit bis zum ersten Treffer ─────────────────────────

test('kalt vs warm: der erste Treffer kostet kalt den Baum, warm ein `stat` je Kandidat', () => {
  const root = fixture(160);
  const started = Date.now();
  const db = open(root);
  let coldMs;
  let warmMs;
  try {
    const coldReport = updateIndex(db, root, {});
    const cold = query(db, root, 'src/mod000.mjs src/mod001.mjs src/mod002.mjs');
    coldMs = Date.now() - started;
    assert.equal(coldReport.files, 161, 'der Kaltlauf sieht den ganzen Baum');
    assert.deepEqual(cold.context.files.map((file) => file.path), ['src/mod000.mjs', 'src/mod001.mjs', 'src/mod002.mjs']);
    assert.equal(cold.report.stamped, 3, 'der Kaltlauf hat die Stempel gerade geschrieben');

    const warmStarted = Date.now();
    const warm = query(db, root, 'src/mod000.mjs src/mod001.mjs src/mod002.mjs');
    warmMs = Date.now() - warmStarted;
    // Die Kosten der Abfrage: ein `stat` je Kandidat, kein Byte gelesen.
    assert.equal(warm.report.checked, 3, 'genau die drei genannten Kandidaten werden geprüft');
    assert.equal(warm.report.stamped, 3, 'alle drei unverändert — über den Stempel, ohne Lesen');
    assert.equal(warm.report.read, 0, 'eine unveränderte Datei wird NICHT gelesen');
    assert.equal(warm.report.readBytes, 0);
    assert.equal(warm.report.candidates <= WARM_CANDIDATE_LIMIT, true, 'die Kandidatenmenge ist gedeckelt');
    assert.deepEqual(warm.context, cold.context, 'derselbe Baum, derselbe Kontext');
  } finally {
    db.close();
  }
  assert.ok(warmMs <= coldMs, `warm (${warmMs} ms) darf nicht teurer sein als kalt (${coldMs} ms)`);
  console.log(
    `# INDEX-WARM kalt=${coldMs}ms (Kaltlauf + erster Treffer, 161 Dateien) warm=${warmMs}ms ` +
    `(Abfrage auf unverändertem Baum, 3 Kandidaten, 0 Bytes gelesen)`,
  );
});

// ── 3. Geänderte Datei: neu gelesen, neuer Inhalt im nächsten Treffer ───────

test('geändert: gleiche Größe und zurückgesetzte mtime — der Stempel erkennt es, nur EINE Datei wird gelesen', () => {
  const root = fixture(40);
  const changed = join(root, 'src', 'mod007.mjs');
  const db = open(root);
  try {
    updateIndex(db, root, {});
    const prompt = 'src/mod007.mjs src/mod008.mjs src/mod009.mjs';
    const before = query(db, root, prompt);
    assert.deepEqual(before.context.symbols, ['mod007Wert', 'mod008Wert', 'mod009Wert']);

    // DIE §11-LÜCKE: gleiche Byte-Zahl, mtime auf den alten Wert zurückgesetzt.
    // Wer nur Größe und mtime glaubt, sieht hier nichts — der Stempel (ctime)
    // sieht es. Ohne diese Prüfung bliebe der Kontext auf dem alten Symbol.
    const sizes = statSync(changed).size;
    const times = stampOf(changed);
    // Gleich lange Bezeichner (4 Zeichen), damit die Größe wirklich gleich bleibt.
    const next = 'export function mod007Neu1() {\n  return 7;\n}\n';
    assert.equal(Buffer.byteLength(next), sizes, 'die Fixture muss GENAU gleich groß bleiben');
    writeFileSync(changed, next);
    utimesSync(changed, times.atime, times.mtime);
    assert.equal(Math.round(statSync(changed).mtimeMs), Math.round(times.mtime.getTime()), 'die mtime ist wirklich zurückgesetzt');

    const after = query(db, root, prompt);
    assert.equal(after.report.checked, 3, 'alle drei Kandidaten werden geprüft');
    assert.equal(after.report.read, 1, 'gelesen wird NUR die geänderte Datei');
    assert.equal(after.report.written, 1, 'sie wird neu geparst');
    assert.equal(after.report.readBytes, sizes, 'die Kosten sind genau diese eine Datei');
    assert.deepEqual(after.context.symbols, ['mod007Neu1', 'mod008Wert', 'mod009Wert'], 'der neue Inhalt ist im nächsten Treffer');
    assert.equal(after.context.symbols.includes('mod007Wert'), false, 'das alte Symbol ist weg');
    // Trefferquote direkt nach der Änderung: 3 von 3 erwarteten Dateien, 1 davon frisch.
    const hits = after.context.files.filter((file) => ['src/mod007.mjs', 'src/mod008.mjs', 'src/mod009.mjs'].includes(file.path));
    assert.equal(hits.length, 3);
    assert.match(hits.find((file) => file.path === 'src/mod007.mjs').content, /mod007Neu1/, 'der Kontext trägt den NEUEN Text');
    console.log(`# INDEX-WARM Trefferquote nach Änderung: ${hits.length}/3 Dateien, 1 neu gelesen (${sizes} B)`);
  } finally {
    db.close();
  }
});

// ── 4. Neue und verschwundene Dateien ───────────────────────────────────────

test('neu: eine im Prompt genannte, unbekannte Datei wird aufgenommen und getroffen', () => {
  const root = fixture(6);
  const db = open(root);
  try {
    updateIndex(db, root, {});
    const fresh = join(root, 'src', 'frisch.mjs');
    writeFileSync(fresh, 'export function frischWert() {\n  return 0;\n}\n');
    const { context, report } = query(db, root, 'src/frisch.mjs');
    assert.equal(report.added, 1, 'die Datei war dem Index unbekannt und wird als NEU gezählt');
    assert.equal(report.written, 1);
    assert.deepEqual(context.files.map((file) => file.path), ['src/frisch.mjs']);
    assert.deepEqual(context.symbols, ['frischWert']);
    // Ein zweiter Lauf zahlt sie nicht noch einmal.
    const again = query(db, root, 'src/frisch.mjs');
    assert.equal(again.report.read, 0);
    assert.equal(again.report.stamped, 1);
  } finally {
    db.close();
  }
});

test('weg: eine gelöschte Datei verliert ihre Zeilen statt weiter Kontext zu liefern', () => {
  const root = fixture(6);
  const doomed = join(root, 'src', 'mod002.mjs');
  const db = open(root);
  try {
    updateIndex(db, root, {});
    assert.deepEqual(query(db, root, 'src/mod002.mjs').context.symbols, ['mod002Wert']);
    rmSync(doomed);
    const { context, report } = query(db, root, 'src/mod002.mjs');
    assert.equal(report.removed, 1, 'die Zeilen gehen mit');
    assert.deepEqual(context.files, [], 'kein Kontext aus einer Datei, die es nicht gibt');
    assert.deepEqual(context.symbols, []);
  } finally {
    db.close();
  }
});

// ── 5. Ohne Auffrischung bleibt der Stand stehen (der Warm-Pfad ist die Ursache) ──

test('ohne refresh liest die Abfrage den alten Stand — der Warm-Pfad ist die Änderung, nicht der Zufall', () => {
  const root = fixture(6);
  const changed = join(root, 'src', 'mod001.mjs');
  const db = open(root);
  try {
    updateIndex(db, root, {});
    const times = stampOf(changed);
    writeFileSync(changed, 'export function mod001Neu() {\n  return 1;\n}\n');
    utimesSync(changed, times.atime, times.mtime);
    const stale = resolveContext(db, { prompt: 'src/mod001.mjs', project: 'fixture' });
    assert.deepEqual(stale.symbols, ['mod001Wert'], 'ohne Auffrischung: alter Stand (die Zusage ist opt-in)');
    const fresh = resolveContext(db, { prompt: 'src/mod001.mjs', project: 'fixture', root, refresh: true });
    assert.deepEqual(fresh.symbols, ['mod001Neu'], 'mit Auffrischung: aktueller Stand');
  } finally {
    db.close();
  }
});

// ── 6. Der Deckel: eine Abfrage ohne Kandidaten kostet nichts ───────────────

test('leere Abfrage: keine Kandidaten, kein Byte, derselbe Vertrag', () => {
  const root = fixture(6);
  const db = open(root);
  try {
    updateIndex(db, root, {});
    const { context, report } = query(db, root, 'erzaehl mir etwas ueber das Wetter');
    assert.equal(report.candidates, 0);
    assert.equal(report.readBytes, 0);
    assert.deepEqual(Object.keys(context), CONTEXT_KEYS);
    assert.deepEqual(context.files, []);
  } finally {
    db.close();
  }
});
