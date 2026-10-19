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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  assert.match(result.stdout, /selftest/);
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

test('install-user: auto ohne Installat verweigert mit Exit 2, ohne zu klonen', () => {
  const { dir, env } = sandbox();
  const prefix = join(dir, 'nichts');
  const result = run(['auto', '--prefix', prefix], env);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /kein Installat/);
  assert.equal(existsSync(prefix), false);
});

test('install-user: auto verweigert ein Staging, das das Installat selbst ist', () => {
  const { dir, env } = sandbox();
  const prefix = join(dir, 'nichts');
  const result = run(['auto', '--prefix', prefix, '--staging', prefix], env);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /--staging darf nicht das Installat selbst sein/);
});

test('install-user: units schreibt Dienst und Timer, ohne systemd anzufassen', () => {
  const { dir, env } = sandbox();
  const configHome = join(dir, 'config');
  const result = run(['units', '--no-enable', '--no-systemd', '--interval', '6h'], { ...env, XDG_CONFIG_HOME: configHome });
  assert.equal(result.status, 0, result.stderr);
  const service = readFileSync(join(configHome, 'systemd', 'user', 'shinon-forge-update.service'), 'utf8');
  const timer = readFileSync(join(configHome, 'systemd', 'user', 'shinon-forge-update.timer'), 'utf8');
  assert.match(service, /install-user\.mjs auto --prefix /);
  assert.match(service, /Type=oneshot/);
  assert.match(timer, /OnActiveSec=10min/);
  assert.match(timer, /OnUnitActiveSec=6h/);
  assert.match(timer, /Persistent=true/);
  assert.match(timer, /WantedBy=timers\.target/);
});

test('install-user: units --remove löscht beide Dateien wieder', () => {
  const { dir, env } = sandbox();
  const configHome = join(dir, 'config');
  const scoped = { ...env, XDG_CONFIG_HOME: configHome };
  assert.equal(run(['units', '--no-enable', '--no-systemd'], scoped).status, 0);
  const removed = run(['units', '--remove', '--no-systemd'], scoped);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(existsSync(join(configHome, 'systemd', 'user', 'shinon-forge-update.service')), false);
  assert.equal(existsSync(join(configHome, 'systemd', 'user', 'shinon-forge-update.timer')), false);
});

/**
 * Ein Installat, das genau so viel kann, wie der Selbsttest abfragt: `--check`
 * antwortet mit Herkunft (der Pfad kommt aus dem Arbeitsverzeichnis, in dem
 * `verify` den Kandidaten startet), `doctor` antwortet mit vorgegebenem Exit.
 * Damit prüft der Test die Kette, ohne 621 Pakete und ohne Boot zu brauchen.
 */
function fakeInstall(dir, { doctorExit = 0 } = {}) {
  mkdirSync(join(dir, 'bin'), { recursive: true });
  writeFileSync(
    join(dir, 'bin', 'shinon.mjs'),
    `#!/usr/bin/env node
const arg = process.argv[2];
if (arg === '--check') {
  console.log('✅ startfähig');
  console.log('   dsh:       9.9.9-test');
  console.log('   Herkunft:  Repo-Installat — ' + process.cwd() + '/node_modules/@deepseek-ai/dsh');
  process.exit(0);
}
if (arg === 'doctor') { console.log('doctor'); process.exit(${doctorExit}); }
process.exit(0);
`,
  );
  return dir;
}

test('install-user: selftest verweigert ohne Installat mit Exit 2 und legt nichts an', () => {
  const { dir, env } = sandbox();
  const prefix = join(dir, 'nichts');
  const result = run(['selftest', '--prefix', prefix], env);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /kein Installat/);
  assert.equal(existsSync(prefix), false);
});

test('install-user: selftest meldet Exit 1 und die Stufen, wenn die Kette reißt — ohne den Zustand anzufassen', () => {
  const { dir, env } = sandbox();
  const prefix = fakeInstall(join(dir, 'fake'), { doctorExit: 1 });
  const result = run(['selftest', '--prefix', prefix], env);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /✓ check/);
  assert.match(result.stdout, /✗ doctor/);
  // Die Bilanz eines roten Laufs geht nach stderr — sie ist ein Befund, keine Auskunft.
  assert.match(result.stderr, /1\/4 Stufen/);
  // READ-ONLY: kein Zustand geschrieben — der Lauf steht trotzdem im Protokoll.
  assert.equal(existsSync(join(dir, 'state', 'install-state.json')), false);
  assert.equal(existsSync(join(dir, 'state', 'logs', 'verify-log.jsonl')), true);
});

test('install-user: selftest --json beschreibt die vier Stufen maschinenlesbar', () => {
  const { dir, env } = sandbox();
  const prefix = fakeInstall(join(dir, 'fake'), { doctorExit: 1 });
  const result = run(['selftest', '--prefix', prefix, '--json'], env);
  assert.equal(result.status, 1, result.stderr);
  const line = result.stdout.split('\n').find((entry) => entry.startsWith('{'));
  const report = JSON.parse(line);
  assert.deepEqual(Object.keys(report.stages).sort(), ['boot', 'check', 'doctor', 'http']);
  assert.equal(report.stages.check, true);
  assert.equal(report.stages.doctor, false);
  assert.equal(report.ok, false);
  assert.equal(report.of, 4);
  assert.equal(report.passed, 1);
  assert.ok(report.errors.length >= 1);
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

test('install-user: uninstall sichert Zugangsdateien im Tresor und entfernt den Baum', () => {
  const { dir, env } = sandbox();
  const prefix = join(dir, 'installat');
  mkdirSync(prefix, { recursive: true });
  writeFileSync(join(prefix, '.env'), 'AGNES_API_KEY=sehr-geheim\n');
  writeFileSync(join(prefix, '.credentials.yaml'), 'token: auch-geheim\n');
  const vault = join(dir, 'vault.json');
  const result = run(['uninstall', '--prefix', prefix, '--export-secrets', vault, '--no-systemd'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(prefix), false, 'das Installat ist weg');
  assert.equal(existsSync(vault), true, 'der Tresor liegt da');
  assert.equal(result.stdout.includes('sehr-geheim'), false, 'kein Wert im Protokoll');
  assert.equal(result.stdout.includes('auch-geheim'), false, 'kein Wert im Protokoll');
  assert.match(result.stdout, /\.env \(\d+ B\)/, 'die Sicherung nennt Name und Größe');
  const saved = JSON.parse(readFileSync(vault, 'utf8'));
  assert.equal(saved.files['.env'], 'AGNES_API_KEY=sehr-geheim\n');
  assert.equal(saved.kind, 'shinon.secrets/v1');
  const state = JSON.parse(readFileSync(join(dir, 'state', 'install-state.json'), 'utf8'));
  assert.equal(state.secretsVault, vault, 'der Zustand merkt sich den Tresor für die nächste Installation');
});

test('install-user: uninstall --purge legt keinen Tresor an', () => {
  const { dir, env } = sandbox();
  const prefix = join(dir, 'installat');
  mkdirSync(prefix, { recursive: true });
  writeFileSync(join(prefix, '.env'), 'A=1\n');
  const vault = join(dir, 'nie.json');
  const result = run(['uninstall', '--prefix', prefix, '--purge', '--export-secrets', vault, '--no-systemd'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--purge/);
  assert.equal(existsSync(vault), false, 'purge schreibt nichts');
  assert.equal(existsSync(prefix), false);
});

test('install-user: uninstall --keep-checkout lässt den Baum stehen', () => {
  const { dir, env } = sandbox();
  const prefix = join(dir, 'installat');
  mkdirSync(prefix, { recursive: true });
  writeFileSync(join(prefix, '.env'), 'A=1\n');
  const result = run(['uninstall', '--prefix', prefix, '--keep-checkout', '--export-secrets', join(dir, 'v.json'), '--no-systemd'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(prefix, '.env')), true, 'der Baum und die Datei bleiben');
});

test('install-user: uninstall auf leerem Ort ist kein Fehler', () => {
  const { dir, env } = sandbox();
  const result = run(['uninstall', '--prefix', join(dir, 'nichts')], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nichts zu entfernen/);
});
