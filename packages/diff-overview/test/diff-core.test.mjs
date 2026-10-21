#!/usr/bin/env node
/**
 * diff-core — der Kern, gegen ECHTE Git-Ausgaben.
 *
 * Die Textbausteine unten sind wörtlich aus einem Wegwerf-Repo kopiert
 * (`git status --porcelain=v1 -z --no-renames --untracked-files=all`,
 * `git diff --numstat -z --no-renames HEAD`, `git diff --unified=2 HEAD -- a.txt`),
 * nicht ausgedacht: ein Parser, der nur zu erfundenen Beispielen passt, ist ein
 * Parser für erfundene Beispiele.
 *
 * Kein node_modules, kein Netz, kein Git — dieser Test läuft in CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIFF_CONTRACT,
  DIFF_ENDPOINT,
  DIFF_FILE_CONTRACT,
  FILE_MARKS,
  LINE_MARKS,
  buildOverview,
  clipLine,
  parseNumstat,
  parseStatus,
  parseUnified,
  statusOf,
} from '../assets/diff-core.js';

/** Echte `status -z`-Ausgabe: geändert, hinzugefügt, gelöscht, doppelt geändert. */
const STATUS = ' M a.txt\u0000A  b.txt\u0000D  c.txt\u0000MM d.txt\u0000 M bin.dat\u0000?? neu.txt\u0000';
/** Echte `numstat -z`-Ausgabe: Zahlen, binär, Löschung, gestagte neue Datei. */
const NUMSTAT = '2\t1\ta.txt\u0000-\t-\tbin.dat\u00000\t1\tc.txt\u00001\t0\tb.txt\u0000';

test('der Vertragsname und die Route sind die der Naht', () => {
  assert.equal(DIFF_CONTRACT, 'shinon.diff/overview-v1');
  assert.equal(DIFF_FILE_CONTRACT, 'shinon.diff/file-v1');
  assert.equal(DIFF_ENDPOINT, '/shinon/diff');
});

test('statusOf liest Index- und Arbeitsbaum-Zustand', () => {
  assert.equal(statusOf(' M'), 'M');
  assert.equal(statusOf('MM'), 'M');
  assert.equal(statusOf('A '), 'A');
  assert.equal(statusOf('D '), 'D');
  assert.equal(statusOf('??'), '?');
  assert.equal(statusOf('UU'), 'U');
  // Unbekannt ist kein Grund zu werfen: die stärkere Lesart „geändert" bleibt.
  assert.equal(statusOf(''), 'M');
});

test('parseStatus trennt NUL-getrennte Einträge und nimmt den Pfad ab Zeichen 3', () => {
  const files = parseStatus(STATUS);
  assert.deepEqual(files.map((file) => file.path), ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'bin.dat', 'neu.txt']);
  assert.deepEqual(files.map((file) => file.status), ['M', 'A', 'D', 'M', 'M', '?']);
  assert.equal(files[5].mark, FILE_MARKS['?']);
  // Kein Eintrag aus dem leeren Rest hinter dem letzten NUL.
  assert.equal(files.length, 6);
});

test('parseNumstat liest Zahlen, Binärdateien als null und Pfade mit Tab', () => {
  const counts = parseNumstat(NUMSTAT);
  assert.deepEqual(counts.get('a.txt'), { added: 2, removed: 1 });
  assert.deepEqual(counts.get('bin.dat'), { added: null, removed: null });
  assert.deepEqual(counts.get('c.txt'), { added: 0, removed: 1 });
  const withTab = parseNumstat('1\t0\tordner/mit\ttab.txt\u0000');
  assert.deepEqual(withTab.get('ordner/mit\ttab.txt'), { added: 1, removed: 0 });
});

test('buildOverview zählt nur, was Git gezählt hat — und sagt den Rest', () => {
  const overview = buildOverview({ statusText: STATUS, numstatText: NUMSTAT });
  assert.deepEqual(overview.files.map((file) => file.path), ['a.txt', 'b.txt', 'bin.dat', 'c.txt', 'd.txt', 'neu.txt']);
  // a.txt 2/1, b.txt 1/0, c.txt 0/1 zählen; bin.dat (binär), d.txt (kein
  // Numstat-Eintrag) und neu.txt (unversioniert) zählen NICHT.
  assert.equal(overview.totals.files, 6);
  assert.equal(overview.totals.added, 3);
  assert.equal(overview.totals.removed, 2);
  assert.equal(overview.totals.counted, 3);
  assert.equal(overview.totals.uncounted, 3);
  const neu = overview.files.find((file) => file.path === 'neu.txt');
  assert.equal(neu.counted, false);
  assert.equal(neu.added, null, 'unversioniert bekommt keine erfundene 0');
  assert.match(neu.note, /nicht in HEAD/);
  const bin = overview.files.find((file) => file.path === 'bin.dat');
  assert.match(bin.note, /binär/);
  assert.equal(overview.truncated, null);
});

test('buildOverview meldet die Dateigrenze mit Soll und Ist statt still zu kürzen', () => {
  const overview = buildOverview({ statusText: STATUS, numstatText: NUMSTAT, maxFiles: 2 });
  assert.equal(overview.files.length, 2);
  assert.deepEqual(overview.truncated, { reason: 'DATEIEN', soll: 2, ist: 6 });
});

test('buildOverview ohne Änderung ist leer, aber kein Fehler', () => {
  const overview = buildOverview({ statusText: '', numstatText: '' });
  assert.deepEqual(overview.files, []);
  assert.equal(overview.totals.files, 0);
  assert.equal(overview.reason, undefined, 'der Kern kennt keinen Grund — den setzt die Messung');
});

/** Wörtlich `git diff --unified=2 --no-renames HEAD -- a.txt` aus dem Wegwerf-Repo. */
const UNIFIED = [
  'diff --git a/a.txt b/a.txt',
  'index f00189a..dc18249 100644',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,3 +1,4 @@',
  '-eins',
  ' zwei',
  '+ZWEI',
  ' drei',
  '+vier',
  '',
].join('\n');

test('parseUnified liest einen Hunk mit seinen Marken', () => {
  const parsed = parseUnified(UNIFIED);
  assert.equal(parsed.hunks.length, 1);
  assert.equal(parsed.hunks[0].header, '@@ -1,3 +1,4 @@');
  assert.deepEqual(parsed.hunks[0].rows.map((row) => row.mark), ['-', ' ', '+', ' ', '+']);
  assert.deepEqual(parsed.hunks[0].rows.map((row) => row.text), ['eins', 'zwei', 'ZWEI', 'drei', 'vier']);
  assert.equal(parsed.lines, 5);
  assert.equal(parsed.clipped, 0);
  assert.equal(parsed.truncated, null);
  assert.equal(parsed.hunks[0].rows[2].label, LINE_MARKS['+']);
});

test('parseUnified ignoriert Datei-Köpfe und die „no newline"-Zeile', () => {
  const text = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1 +1 @@', '-alt', '+neu', '\\ No newline at end of file', ''].join('\n');
  const parsed = parseUnified(text);
  assert.equal(parsed.lines, 2);
  assert.deepEqual(parsed.hunks[0].rows.map((row) => row.mark), ['-', '+']);
});

test('parseUnified bricht an der Zeilengrenze ab und nennt Soll und Ist', () => {
  const parsed = parseUnified(UNIFIED, { maxLines: 3 });
  assert.equal(parsed.lines, 3);
  assert.deepEqual(parsed.truncated, { reason: 'ZEILEN', soll: 3, ist: 4 });
});

test('parseUnified kürzt lange Zeilen sichtbar und zählt sie', () => {
  const long = `@@ -1 +1 @@\n+${'x'.repeat(50)}\n`;
  const parsed = parseUnified(long, { maxLineChars: 20 });
  assert.equal(parsed.clipped, 1);
  assert.equal(parsed.hunks[0].rows[0].text.length, 20);
  assert.ok(parsed.hunks[0].rows[0].text.endsWith('…'), 'eine gekürzte Zeile muss sich als gekürzt zeigen');
});

test('parseUnified auf einer Binär-Antwort ergibt keine Zeilen, keine Erfindung', () => {
  const parsed = parseUnified('diff --git a/b.dat b/b.dat\nBinary files /dev/null and b/b.dat differ\n');
  assert.deepEqual(parsed.hunks, []);
  assert.equal(parsed.lines, 0);
  assert.equal(parsed.truncated, null);
});

test('clipLine lässt kurze Zeilen in Ruhe', () => {
  assert.deepEqual(clipLine('kurz', 20), { text: 'kurz', clipped: false });
  const cut = clipLine('y'.repeat(30), 10);
  assert.equal(cut.clipped, true);
  assert.equal(cut.text, `${'y'.repeat(9)}…`);
});
