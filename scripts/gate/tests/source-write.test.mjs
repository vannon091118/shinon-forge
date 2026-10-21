#!/usr/bin/env node
/**
 * Gate-Test: beim Boot schreibt KEIN Paket in seinen eigenen Quellbaum.
 *
 * Die Zusage: ein gepackter Build (AppImage, /opt) ist zur Laufzeit
 * schreibgeschützt, und der Entwicklerbaum soll sauber bleiben. Beides ist nur
 * haltbar, wenn beim Start kein Paket in den Quellbaum schreibt — nicht in
 * seinen Workspace, nicht in `packages/<dir>/`, nicht in `.agents/` und nicht
 * in `.shinon/`. Der Project Index legt seinen Fakten-Speicher zum Beispiel
 * unter `<workspace>/.shinon/` ab; im gepackten Build wäre der Workspace der
 * schreibgeschützte Installat.
 *
 * WIE DAS GEPRÜFT WIRD: der Test baut eine SANDBOX aus dem Arbeitsbaum
 * (`packages/`, `profiles/`, `bin/`, `scripts/`, `docs/` — echte Kopien, keine
 * Verknüpfungen), legt sie SCHREIBGESCHÜTZT ab und bootet den echten, gepinnten
 * DSH mit dieser Sandbox als Quellbaum UND als Workspace. Ein Schreibversuch
 * kann dort nur scheitern (EACCES/EROFS): der Test liest das Log und prüft
 * zusätzlich, dass die Sandbox bytegleich geblieben ist. Das Home ist ein
 * Wegwerf-Home mit eigenem Zustand — der Test fasst weder das Home des
 * Benutzers noch dessen Sitzungen an.
 *
 * Die Bundle-Verknüpfungen des Profils legt der Test mit demselben Werkzeug an
 * wie der Paketbau (`linkProfilePackages`), damit die Regel aus dem
 * Profil-Manifest kommt und nicht aus einer Liste im Test.
 *
 * Ohne die gepinnte DSH-Installation wird der Test SICHTBAR übersprungen
 * (Grund im Namen) — CI ohne `node_modules` darf kein Grün sein, aber auch
 * kein Rot aus Mangel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeProfile } from '../../lib/repo.mjs';
import { linkProfilePackages } from '../../lib/payload.mjs';
import { seedDshHome } from '../../lib/dsh-home.mjs';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

/** Die gepinnte DSH-Installation des Baums — nicht ein globales `dsh` daneben. */
const DSH_BIN = join(REPO, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const missing = existsSync(DSH_BIN) ? [] : ['gepinnte DSH-Installation fehlt (node_modules/@deepseek-ai/dsh)'];
const skip = missing.length ? `uebersprungen: ${missing.join('; ')}` : false;

/** Die Teile des Baums, die ein Boot braucht — und die ein Pakt beschreiben könnte. */
const TREE = ['packages', 'profiles', 'bin', 'scripts', 'docs', 'assets'];

/** Ein freier Port — der Test startet einen echten Server. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Die Sandbox: Kopien statt Verknüpfungen, damit ein Schreibzugriff hier landet. */
function sandbox(root) {
  const dir = join(root, 'quelle');
  mkdirSync(dir, { recursive: true });
  for (const name of TREE) {
    const from = join(REPO, name);
    if (!existsSync(from)) continue;
    cpSync(from, join(dir, name), { recursive: true, dereference: false });
  }
  cpSync(join(REPO, 'package.json'), join(dir, 'package.json'));
  // Die Bundle-Verknüpfungen des Profils: dieselbe Regel wie im Paketbau.
  linkProfilePackages({ stage: dir, mode: 'symlink' });
  // `node_modules` bleibt eine Verknüpfung auf den Baum (Lesen genügt); ein
  // Schreibzugriff dorthin wäre ein Fehler des Paketbaus, nicht des Boots.
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

/** Der Fingerabdruck eines Baums: Pfad, Größe und Zeitstempel jeder Datei. */
function fingerprint(dir) {
  const seen = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        seen.set(path, 'link');
        continue;
      }
      if (entry.isDirectory()) {
        seen.set(path, 'dir');
        walk(path);
        continue;
      }
      const stat = statSync(path);
      seen.set(path, `${stat.size}:${stat.mtimeMs}`);
    }
  };
  walk(dir);
  return seen;
}

/** Der Unterschied zweier Fingerabdrücke — leer heißt: nichts hat sich bewegt. */
function drift(before, after) {
  const changed = [];
  for (const [path, value] of after) {
    if (!before.has(path)) changed.push(`${path} (neu)`);
    else if (before.get(path) !== value) changed.push(`${path} (geaendert)`);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changed.push(`${path} (weg)`);
  }
  return changed;
}

test('Boot: kein Paket schreibt in den eigenen Quellbaum', { skip }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-quellbaum-'));
  const source = sandbox(root);
  // Schreibgeschuetzt: jeder Schreibversuch scheitert mit EACCES/EROFS.
  chmodSync(source, 0o555);
  for (const name of readdirSync(source)) {
    const path = join(source, name);
    if (lstatSync(path).isDirectory()) chmodSync(path, 0o555);
  }
  const before = fingerprint(source);

  // Das Home: ein Wegwerf-Home, aus der Sandbox geseedet (sie ist schreibgeschützt,
  // also nimmt der Seeder den Pfad mit beschreibbarem Profilordner).
  const home = join(root, 'home');
  const seeded = seedDshHome(home, source);
  assert.deepEqual(seeded.issues, [], 'das Wegwerf-Home muss benutzbar sein');

  const port = await freePort();
  const child = spawn(process.execPath, [DSH_BIN, '--profile', activeProfile() ?? 'shinon', '--no-open', '--port', String(port)], {
    cwd: source,
    detached: true,
    env: {
      ...process.env,
      HOME: root,
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_DATA_HOME: join(root, 'data'),
      XDG_STATE_HOME: join(root, 'state'),
      XDG_CACHE_HOME: join(root, 'cache'),
      DSH_HOME: home,
      SHINON_WORKSPACE_ROOT: source,
      PATH: `${join(REPO, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const collect = (chunk) => { output += chunk.toString(); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  try {
    // Warten auf die Zeile, die DSH erst nach dem Boot der Plugins schreibt.
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && !/dsh web: http/.test(output)) {
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.match(output, /dsh web: http/, `der Boot kam nicht zustande:\n${output.slice(-2000)}`);

    // 1. Kein Schreibversuch in den Quellbaum.
    const writeErrors = output.split('\n').filter((line) => /EACCES|EROFS|read-only file system|Permission denied/i.test(line));
    assert.deepEqual(writeErrors, [], 'ein Paket wollte in den Quellbaum schreiben');

    // 2. Der Quellbaum ist bytegleich geblieben.
    assert.deepEqual(drift(before, fingerprint(source)), [], 'im Quellbaum hat sich etwas bewegt');

    // 3. Der Server antwortet — der Boot war echt, nicht nur ein Prozessstart.
    //    Der Einstieg ist ein Token-Tausch: der erste Aufruf liefert 303 und ein
    //    Sitzungs-Cookie, der zweite Request mit diesem Cookie die Seite.
    const webLine = output.split('\n').find((line) => line.includes('dsh web: http')) ?? '(keine Zeile)';
    const url = /dsh web:\s+(http:\/\/\S+)/.exec(webLine)?.[1] ?? '';
    assert.notEqual(url, '', `keine Web-URL im Log: ${webLine}`);
    const entry = await fetch(url, { redirect: 'manual' });
    assert.ok([302, 303].includes(entry.status), `der Token-Einstieg lieferte HTTP ${entry.status} statt 303 — ${webLine}`);
    const cookies = typeof entry.headers.getSetCookie === 'function' ? entry.headers.getSetCookie() : [];
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const page = await fetch(`http://127.0.0.1:${port}/`, { headers: cookie === '' ? {} : { cookie }, redirect: 'manual' });
    const body = await page.text();
    assert.equal(page.status, 200, `die Seite lieferte HTTP ${page.status} statt 200`);
    assert.ok((page.headers.get('content-type') ?? '').includes('text/html'), 'die Seite ist kein HTML');
    assert.match(body, /<title>[^<]+<\/title>/, 'die Seite traegt keinen Titel — es ist nicht die Oberflaeche');
  } finally {
    // Aufraeumen: erst die Gruppe, dann der Baum.
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* schon beendet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* schon beendet */ }
    chmodSync(source, 0o755);
    for (const name of readdirSync(source)) {
      const path = join(source, name);
      if (lstatSync(path).isDirectory()) chmodSync(path, 0o755);
    }
    rmSync(root, { recursive: true, force: true });
  }
});
