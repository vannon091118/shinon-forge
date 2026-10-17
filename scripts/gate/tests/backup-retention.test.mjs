#!/usr/bin/env node
/**
 * scripts/gate/tests/backup-retention.test.mjs — die Aufbewahrungsregel als Vertrag.
 *
 * Warum diese Datei existiert: eine Löschregel ist die gefährlichste Art Regel,
 * die ein Werkzeug haben kann. Wer sie falsch schreibt, merkt es erst, wenn er
 * die Sicherung braucht. Diese Tests pinnen genau die vier Zusagen, die im
 * Kopf von `scripts/backup-retention.mjs` stehen — und sie laufen in einem
 * Temp-Ordner, damit kein Test je die echten Sicherungen des Nutzers sieht.
 * → Kanon: docs/COMMENT-KANON.md#k-b45547fe86bf
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TOOL = join(ROOT, 'scripts', 'backup-retention.mjs');
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** Ein Sicherungsordner mit gesetzten Altersstufen — die Uhr wird nicht gestellt, die Datei schon. */
function scratch({ archives = {}, others = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-retention-'));
  const backups = join(dir, 'backup');
  const state = join(dir, 'state');
  mkdirSync(backups, { recursive: true });
  mkdirSync(state, { recursive: true });
  for (const [name, ageDays] of Object.entries(archives)) {
    const file = join(backups, name);
    writeFileSync(file, `sicherung ${name} `.repeat(20));
    const when = (NOW - ageDays * DAY) / 1000;
    utimesSync(file, when, when);
  }
  for (const [name, content] of Object.entries(others)) writeFileSync(join(backups, name), content);
  return { dir, backups, state };
}

const run = (args, state) =>
  spawnSync(process.execPath, [TOOL, ...args], {
    cwd: ROOT,
    env: { ...process.env, SHINON_STATE_DIR: state },
    encoding: 'utf8',
  });

const archivesIn = (dir) => readdirSync(dir).filter((name) => name.endsWith('.tar.gz')).sort();

test('Aufbewahrung: die jüngsten N bleiben, der Rest fliegt, andere Dateien nie', () => {
  const { backups, state } = scratch({
    archives: { 'v1.tar.gz': 40, 'v2.tar.gz': 30, 'v3.tar.gz': 5, 'v4.tar.gz': 1 },
    others: { 'protokoll.md': 'Notiz\n' },
  });
  const result = run(['--dir', backups, '--keep', '2', '--json'], state);
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout);
  assert.deepEqual(record.kept.map((entry) => entry.name), ['v4.tar.gz', 'v3.tar.gz']);
  assert.deepEqual(record.deleted.map((entry) => entry.name), ['v2.tar.gz', 'v1.tar.gz']);
  // KEEP.md entsteht erst mit diesem Lauf — unberührt heißt: keine Sicherung, kein Kandidat.
  assert.ok(record.untouched.includes('protokoll.md'));
  assert.ok(record.untouched.every((name) => !name.endsWith('.tar.gz')));
  assert.deepEqual(archivesIn(backups), ['v3.tar.gz', 'v4.tar.gz']);
  assert.equal(readFileSync(join(backups, 'protokoll.md'), 'utf8'), 'Notiz\n');
});

test('Aufbewahrung: die Altersgrenze greift auch, wenn noch Platz in der Anzahl wäre', () => {
  const { backups, state } = scratch({ archives: { 'alt.tar.gz': 45, 'neu.tar.gz': 2 } });
  const result = run(['--dir', backups, '--keep', '10', '--max-age', '30', '--json'], state);
  const record = JSON.parse(result.stdout);
  assert.deepEqual(record.deleted.map((entry) => entry.name), ['alt.tar.gz']);
  assert.match(record.deleted[0].reason, /älter als 30 Tage/);
  assert.deepEqual(archivesIn(backups), ['neu.tar.gz']);
});

test('Aufbewahrung: die jüngste Sicherung wird NIE gelöscht — auch nicht an der Altersgrenze', () => {
  const { backups, state } = scratch({ archives: { 'einzige.tar.gz': 400 } });
  const result = run(['--dir', backups, '--keep', '1', '--max-age', '30', '--json'], state);
  const record = JSON.parse(result.stdout);
  assert.equal(record.deleted.length, 0);
  assert.deepEqual(archivesIn(backups), ['einzige.tar.gz']);
});

test('Aufbewahrung: --dry-run plant und löscht nichts', () => {
  const { backups, state } = scratch({ archives: { 'v1.tar.gz': 90, 'v2.tar.gz': 60, 'v3.tar.gz': 1 } });
  const result = run(['--dir', backups, '--keep', '1', '--dry-run', '--json'], state);
  const record = JSON.parse(result.stdout);
  assert.equal(record.dryRun, true);
  assert.equal(record.deleted.length, 2);
  assert.equal(archivesIn(backups).length, 3, 'nach dem Trockenlauf müssen alle Dateien noch liegen');
});

test('Aufbewahrung: jeder Lauf schreibt genau eine Zeile ins Protokoll', () => {
  const { backups, state } = scratch({ archives: { 'v1.tar.gz': 1 } });
  assert.equal(run(['--dir', backups, '--json'], state).status, 0);
  assert.equal(run(['--dir', backups, '--json'], state).status, 0);
  const lines = readFileSync(join(state, 'logs', 'backup-retention.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).dir, backups);
  assert.equal(JSON.parse(lines[1]).found, 1);
});

test('Aufbewahrung: fehlender Ordner und unsinnige Werte verweigern mit Exit 2', () => {
  const { dir, backups, state } = scratch({ archives: { 'v1.tar.gz': 1 } });
  const missing = run(['--dir', join(dir, 'gibt-es-nicht')], state);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /existiert nicht/);
  assert.equal(run(['--dir', backups, '--keep', '0'], state).status, 2);
  assert.equal(run(['--dir', backups, '--max-age', '0'], state).status, 2);
  assert.equal(statSync(join(backups, 'v1.tar.gz')).isFile(), true);
});
