#!/usr/bin/env node
/**
 * Tests für das getrennte DSH-Home (P0, gemessen 2026-10-17).
 *
 * Der Befund: `$DSH_HOME/AGENTS.md` ist bei DSH die benutzerglobale
 * Anweisungsdatei und läuft in jeder Session mit. Solange der Arbeitsbaum das
 * Home war, wurde seine AGENTS.md zur globalen Anweisung fremder Projekte.
 * Diese Datei prüft beide Hälften: dass der Pfaddienst den Baum nicht mehr als
 * Home ausgibt, und — mit dem ECHTEN Loader des gepinnten DSH — dass eine fremde
 * Sitzung keine Repo-Anweisung sieht, während das Repo seine eigene behält.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WORKSPACE_ROOT, dshHome, stateDir } from '../../lib/paths.mjs';
import { seedDshHome } from '../../lib/dsh-home.mjs';

const temp = (prefix) => mkdtempSync(join(tmpdir(), prefix));

/** Ein Miniatur-Arbeitsbaum mit Profil, Sitzungen und Schlüsseldateien. */
function sourceTree() {
  const dir = temp('shinon-source-');
  mkdirSync(join(dir, 'profiles', 'shinon'), { recursive: true });
  writeFileSync(join(dir, 'profiles', 'shinon', 'package.json'), JSON.stringify({ name: '@shinon/profile-shinon' }));
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  writeFileSync(join(dir, '.env'), 'BEISPIEL=1\n');
  writeFileSync(join(dir, '.credentials.yaml'), 'beispiel: 1\n');
  writeFileSync(join(dir, 'AGENTS.md'), '# Repo-Anweisung\nGILT-NUR-HIER\n');
  return dir;
}

// ── 1. Der Pfaddienst ───────────────────────────────────────────────────────

test('dshHome: der Arbeitsbaum ist NIEMALS das Home (sonst ist seine AGENTS.md global)', () => {
  const home = dshHome({});
  assert.notEqual(home, WORKSPACE_ROOT, 'das Repo darf nicht mehr Home sein');
  assert.ok(home.startsWith(stateDir({})), `Home liegt im Zustandsordner (${home})`);
  assert.match(home, /dev-dsh-home$/, 'der Entwicklerlauf hat sein eigenes Home');
});

test('dshHome: ein ausdrückliches DSH_HOME gilt weiter (ein Startpfad, ein Knopf)', () => {
  const explicit = join(temp('shinon-explicit-'), 'home');
  assert.equal(dshHome({ DSH_HOME: explicit }), explicit);
});

test('dshHome: ein relatives DSH_HOME wird abgelehnt, nicht geraten', () => {
  assert.throws(() => dshHome({ DSH_HOME: 'relativ/home' }), /absoluter Pfad/);
});

// ── 2. Das Seeden ───────────────────────────────────────────────────────────

test('seedDshHome: verlinkt Profil, Sitzungen und Schlüssel — die Anweisungsdatei NICHT', () => {
  const source = sourceTree();
  const home = join(temp('shinon-home-'), 'home');

  const result = seedDshHome(home, source);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.created.sort(), ['.credentials.yaml', '.env', 'profiles', 'sessions']);
  assert.equal(readlinkSync(join(home, 'profiles')), join(source, 'profiles'));
  assert.equal(readlinkSync(join(home, '.env')), join(source, '.env'));
  // Der springende Punkt: es gibt keinen Weg, auf dem AGENTS.md ins Home kommt.
  assert.throws(() => readlinkSync(join(home, 'AGENTS.md')));
});

test('seedDshHome: zweiter Lauf ist idempotent (keine neuen Links, keine Meldung)', () => {
  const source = sourceTree();
  const home = join(temp('shinon-home-'), 'home');
  seedDshHome(home, source);

  const again = seedDshHome(home, source);
  assert.deepEqual(again.issues, []);
  assert.deepEqual(again.created, []);
  assert.deepEqual(again.kept.sort(), ['.credentials.yaml', '.env', 'profiles', 'sessions']);
});

test('seedDshHome: ein fremder Link wird gemeldet und NICHT überschrieben', () => {
  const source = sourceTree();
  const other = temp('shinon-fremd-');
  const home = temp('shinon-home-');
  seedDshHome(home, source);
  const path = join(home, 'profiles');
  // Fremdes Ziel an dieselbe Stelle legen: der Seed muss stehen bleiben.
  rmSync(path);
  symlinkSync(other, path);

  const result = seedDshHome(home, source);
  assert.equal(result.issues.length, 1, result.issues.join(' | '));
  assert.match(result.issues[0], /zeigt auf/);
  assert.equal(readlinkSync(path), other, 'der fremde Link bleibt unangetastet');
});

test('seedDshHome: Home = Quelle ist ein Fehler, kein stiller Selbstbezug', () => {
  const source = sourceTree();
  const result = seedDshHome(source, source);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /Arbeitsbaum selbst/);
});

// ── 3. Der ECHTE Loader des gepinnten DSH ───────────────────────────────────

const loader = await import('@deepseek-ai/dsh-agent-instructions').catch(() => null);

test('Loader: eine fremde Sitzung bekommt KEINE Repo-Anweisung (der eigentliche P0-Beleg)', { skip: loader === null ? 'dsh-agent-instructions nicht installiert' : false }, async () => {
  const home = join(temp('shinon-home-'), 'home');
  const source = sourceTree();
  seedDshHome(home, source);

  const fremd = join(temp('shinon-fremd-projekt-'), 'projekt');
  mkdirSync(fremd, { recursive: true });
  writeFileSync(join(fremd, 'package.json'), JSON.stringify({ name: 'fremdes-projekt' }));

  const files = await loader.discoverBaselineInstructionFiles({ cwd: fremd, dshHome: home });
  const paths = files.map((entry) => entry.absolutePath);
  assert.ok(!paths.includes(join(source, 'AGENTS.md')), `Repo-AGENTS.md darf nicht mitlaufen (${paths.join(', ')})`);
  assert.ok(!paths.some((path) => path.startsWith(join(home, 'AGENTS.md'))), 'kein globaler Eintrag im Home');
});

test('Loader: das Repo selbst behält seine Anweisung (Gegenprobe)', { skip: loader === null ? 'dsh-agent-instructions nicht installiert' : false }, async () => {
  const home = join(temp('shinon-home-'), 'home');
  const source = sourceTree();
  seedDshHome(home, source);

  const files = await loader.discoverBaselineInstructionFiles({ cwd: source, dshHome: home });
  assert.ok(
    files.some((entry) => entry.absolutePath === join(source, 'AGENTS.md')),
    `die Projektkette lädt die Repo-Anweisung (${files.map((entry) => entry.absolutePath).join(', ')})`,
  );
});
