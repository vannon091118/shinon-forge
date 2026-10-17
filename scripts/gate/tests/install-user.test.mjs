#!/usr/bin/env node
/**
 * scripts/gate/tests/install-user.test.mjs — der Vertrag des User-Installats
 * (`scripts/install-user.mjs`).
 *
 * Warum diese Datei existiert: der Befehl ist der wiederholbare Weg in ein
 * Nutzer-Installat und trifft Entscheidungen, die man nicht am Bildschirm
 * erkennen kann — welchen Unterbefehl er kennt, wann er sich weigert und was
 * `status` über einen leeren Ort sagt. Ein Werkzeug, das bei einem falschen
 * Argument still das Falsche tut, wäre schlimmer als Handarbeit.
 *
 * Geprüft wird NUR die Oberfläche (kein Netz, kein npm ci, kein Boot): die
 * Abnahme selbst ist ein Laufzeitbeleg und steht im Protokoll der Sitzung,
 * nicht in einem Test, der ohne Registry und ohne 621 Pakete laufen muss.
 *
 * Die Zustandsdatei wird über `SHINON_STATE_DIR` in ein Temp-Verzeichnis
 * gelenkt — der Test liest und schreibt nie den echten Installationszustand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = join(ROOT, 'scripts', 'install-user.mjs');

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-install-user-'));
  mkdirSync(join(dir, 'state'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  return { dir, env: { ...process.env, SHINON_STATE_DIR: join(dir, 'state'), SHINON_DATA_DIR: join(dir, 'data') } };
}

const run = (args, env) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, env, encoding: 'utf8' });

test('install-user: --help nennt alle vier Unterbefehle und endet mit 0', () => {
  const { env } = sandbox();
  const result = run(['--help'], env);
  assert.equal(result.status, 0, result.stderr);
  for (const command of ['install', 'update', 'rollback', 'status']) assert.match(result.stdout, new RegExp(command));
  assert.match(result.stdout, /--prefix/);
  assert.match(result.stdout, /--no-rollback/);
});

test('install-user: ohne Unterbefehl und mit unbekanntem Unterbefehl Exit 2', () => {
  const { env } = sandbox();
  assert.equal(run([], env).status, 2);
  const unknown = run(['quatsch'], env);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unbekannter Unterbefehl/);
});

test('install-user: status auf leerem Ort sagt "nicht installiert" und endet mit 0', () => {
  const { dir, env } = sandbox();
  const result = run(['status', '--prefix', join(dir, 'nichts')], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /nicht installiert/);
  assert.match(result.stdout, /install-state\.json/);
});

test('install-user: install verweigert ein vorhandenes Nicht-Git-Verzeichnis, ohne es anzufassen', () => {
  const { dir, env } = sandbox();
  const prefix = join(dir, 'kein-klon');
  mkdirSync(prefix, { recursive: true });
  writeFileSync(join(prefix, 'package.json'), '{"name":"fremd"}\n');
  const result = run(['install', '--prefix', prefix], env);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /kein Git-Klon/);
});

test('install-user: history ohne Protokoll sagt das und endet mit 0', () => {
  const { env } = sandbox();
  const result = run(['history'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /noch keine Läufe aufgezeichnet/);
  assert.match(result.stdout, /verify-log\.jsonl/);
});

/** Ein Protokoll mit drei Läufen: zwei grün, einer rot, zwei dsh-Fassungen. */
function seedLog(dir) {
  const rows = [
    { schemaVersion: 1, at: '2026-10-17T10:00:00.000Z', sha: 'a'.repeat(40), trigger: 'install', ok: true, dsh: '0.2.1-alpha.1', bootMs: 5000, totalMs: 6000, plugins: 15, errors: [], http: { token: 303, cookie: 200, bytes: 41250 } },
    { schemaVersion: 1, at: '2026-10-17T11:00:00.000Z', sha: 'b'.repeat(40), trigger: 'update', ok: false, dsh: '0.2.1-alpha.1', bootMs: 7000, totalMs: 8000, plugins: 15, errors: ['shinon doctor Exit 1'], http: null },
    { schemaVersion: 1, at: '2026-10-17T12:00:00.000Z', sha: 'c'.repeat(40), trigger: 'auto-rollback', ok: true, dsh: '0.2.0-rc.2', bootMs: 3000, totalMs: 4000, plugins: 14, errors: [], http: { token: 303, cookie: 200, bytes: 40000 } },
  ];
  mkdirSync(join(dir, 'state', 'logs'), { recursive: true });
  writeFileSync(join(dir, 'state', 'logs', 'verify-log.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  return rows;
}

test('install-user: history vergleicht Läufe — Kennzahlen, Rot und Grün, je dsh-Fassung', () => {
  const { dir, env } = sandbox();
  seedLog(dir);
  const result = run(['history'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3 Läufe · 2 grün · 1 rot/);
  assert.match(result.stdout, /min 3\.0s · median 5\.0s · max 7\.0s/);
  assert.match(result.stdout, /dsh 0\.2\.1-alpha\.1: 2 Lauf\/Läufe, 1 grün/);
  assert.match(result.stdout, /dsh 0\.2\.0-rc\.2: 1 Lauf\/Läufe, 1 grün/);
});

test('install-user: history --json gibt die Rohzeilen aus, --limit begrenzt', () => {
  const { dir, env } = sandbox();
  seedLog(dir);
  const limited = run(['history', '--json', '--limit', '2'], env);
  assert.equal(limited.status, 0, limited.stderr);
  const lines = limited.stdout.split('\n').filter((line) => line.startsWith('{'));
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).trigger, 'auto-rollback');
});

test('install-user: rollback ohne aufgezeichneten Stand verweigert mit Exit 2', () => {
  const { dir, env } = sandbox();
  const result = run(['rollback', '--prefix', join(dir, 'nichts')], env);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /Installationszustand/);
});

test('install-user: update ohne Installat nennt den richtigen ersten Befehl', () => {
  const { dir, env } = sandbox();
  const result = run(['update', '--prefix', join(dir, 'nichts')], env);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /install-user\.mjs install/);
});
