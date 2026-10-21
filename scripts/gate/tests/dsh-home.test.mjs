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
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WORKSPACE_ROOT, dshHome, stateDir } from '../../lib/paths.mjs';
import { seedDshHome } from '../../lib/dsh-home.mjs';

const temp = (prefix) => mkdtempSync(join(tmpdir(), prefix));

/**
 * Ein Miniatur-Arbeitsbaum mit Profil, Sitzungen und Schlüsseldateien.
 *
 * Die `cordis.patch.yml` ist nicht Dekoration: ein Quellbaum ERKENNT sich an
 * ihr (Form: `profiles/<name>/cordis.patch.yml`). Nur so kann der Seeder einen
 * Verknüpfung, die in einen anderen Quellbaum zeigt, von einem fremden Link
 * unterscheiden — der Unterschied entscheidet, ob umgehängt oder gemeldet wird.
 */
function sourceTree() {
  const dir = temp('shinon-source-');
  mkdirSync(join(dir, 'profiles', 'shinon'), { recursive: true });
  writeFileSync(join(dir, 'profiles', 'shinon', 'package.json'), JSON.stringify({ name: '@shinon/profile-shinon' }));
  writeFileSync(join(dir, 'profiles', 'shinon', 'cordis.patch.yml'), 'id: shinon\nname: @shinon/shinon\n');
  // Die Datei, die DSH bei jedem Start ueberschreibt — sie muss im Home eine
  // Kopie sein, sonst traegt ein schreibgeschuetzter Quellbaum sie nicht.
  writeFileSync(join(dir, 'profiles', 'shinon', 'cordis.yml'), '# dsh profile root\n');
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

test('seedDshHome: Link auf das Mount eines frueheren AppImage-Laufs wird auf diesen Lauf umgehaengt', () => {
  const source = sourceTree();
  const home = temp('shinon-home-');
  const path = join(home, 'profiles');
  // Tote Verknuepfung aus einem fruheren Lauf: das Mount existiert nicht mehr.
  symlinkSync('/tmp/.mount_shinonOLD123/usr/lib/shinon-forge/profiles', path);

  const result = seedDshHome(home, source);
  assert.deepEqual(result.issues, []);
  assert.ok(result.created.includes('profiles'));
  assert.equal(readlinkSync(path), join(source, 'profiles'));
});

// Eine schreibgeschützte Quelle (AppImage-Mount, /opt): DSH schreibt cordis.yml in den Profilordner.
const readOnly = () => false;

// Der Quellbaum wechselt: dasselbe Home, eine andere Installation (AppImage →
// /opt → Arbeitsbaum). Die Links zeigen in den ALTEN Quellbaum — das ist OURS
// (der Seeder hat sie gesetzt) und wird umgehängt, nicht gemeldet. Gemessen
// 2026-10-21: der Start des AppImage scheiterte an genau diesen Links.

test('seedDshHome: ein Link in einen anderen Quellbaum wird umgehängt, nicht gemeldet', () => {
  const alt = sourceTree();
  const source = sourceTree();
  const home = temp('shinon-home-');
  seedDshHome(home, alt);

  const result = seedDshHome(home, source);
  assert.deepEqual(result.issues, [], 'ein alter Quellbaum ist kein fremder Link');
  assert.ok(result.created.includes('profiles'));
  assert.equal(readlinkSync(join(home, 'profiles')), join(source, 'profiles'));
});

test('seedDshHome: bei schreibgeschützter Quelle werden die Einträge eines alten Quellbaums umgehängt', () => {
  const alt = sourceTree();
  const source = sourceTree();
  const home = temp('shinon-home-');
  seedDshHome(home, alt, { isWritable: readOnly });

  const result = seedDshHome(home, source, { isWritable: readOnly });
  assert.deepEqual(result.issues, [], 'ein alter Quellbaum ist kein fremder Link');
  assert.equal(readlinkSync(join(home, 'profiles', 'shinon', 'package.json')), join(source, 'profiles', 'shinon', 'package.json'));
  // Die eigene Kopie von cordis.yml bleibt eine Datei — DSH überschreibt sie.
  assert.equal(lstatSync(join(home, 'profiles', 'shinon', 'cordis.yml')).isFile(), true);
});

test('seedDshHome: ein Link in einen ENTFERNTEN Quellbaum wird über den Stempel umgehängt', () => {
  const alt = sourceTree();
  const source = sourceTree();
  const home = temp('shinon-home-');
  seedDshHome(home, alt);
  rmSync(alt, { recursive: true, force: true }); // der alte Quellbaum ist weg, der Link ist tot

  const result = seedDshHome(home, source);
  assert.deepEqual(result.issues, [], 'der Stempel beweist, dass der Link unser war');
  assert.equal(readlinkSync(join(home, 'profiles')), join(source, 'profiles'));
});

test('seedDshHome: schreibgeschützte Quelle → beschreibbarer Profilordner mit Verknüpfungen', () => {
  const source = sourceTree();
  writeFileSync(join(source, 'profiles', 'shinon', 'cordis.yml'), 'quelle: 1\n');
  const home = join(temp('shinon-home-'), 'home');

  const result = seedDshHome(home, source, { isWritable: readOnly });
  assert.deepEqual(result.issues, []);
  assert.ok(result.created.includes('profiles'));
  // Der Profilordner ist ein eigener Ordner, kein Link auf die Quelle.
  assert.equal(lstatSync(join(home, 'profiles')).isSymbolicLink(), false);
  assert.equal(lstatSync(join(home, 'profiles', 'shinon')).isSymbolicLink(), false);
  assert.equal(readlinkSync(join(home, 'profiles', 'shinon', 'package.json')), join(source, 'profiles', 'shinon', 'package.json'));
  // cordis.yml ist eine Kopie: DSH darf sie überschreiben, ohne die Quelle zu berühren.
  assert.equal(lstatSync(join(home, 'profiles', 'shinon', 'cordis.yml')).isFile(), true);
  writeFileSync(join(home, 'profiles', 'shinon', 'cordis.yml'), 'von DSH geschrieben\n');
  assert.equal(readFileSync(join(source, 'profiles', 'shinon', 'cordis.yml'), 'utf8'), 'quelle: 1\n');
  // Die übrigen Schlüssel bleiben unverändert verlinkt.
  assert.equal(readlinkSync(join(home, '.env')), join(source, '.env'));
});

test('seedDshHome: schreibgeschützte Quelle, zweiter Lauf ist idempotent', () => {
  const source = sourceTree();
  const home = join(temp('shinon-home-'), 'home');
  seedDshHome(home, source, { isWritable: readOnly });

  const again = seedDshHome(home, source, { isWritable: readOnly });
  assert.deepEqual(again.issues, []);
  assert.ok(again.kept.includes('profiles'));
  assert.ok(!again.created.includes('profiles'));
});

test('seedDshHome: die Profilschicht gehört dem HOME — echte Datei, kein Link', () => {
  const source = sourceTree();
  const home = temp('shinon-home-');
  seedDshHome(home, source, { isWritable: readOnly });

  const layer = join(home, 'profiles', 'shinon', 'cordis.patch.yml');
  // DSH schreibt hier (der config-editor der UI), also darf kein Link den
  // Schreibzugriff in die Quelle tragen.
  assert.equal(lstatSync(layer).isSymbolicLink(), false, 'die Profilschicht ist keine Verknüpfung');
  assert.equal(lstatSync(layer).isFile(), true, 'die Profilschicht ist eine echte Datei');
});

test('seedDshHome: die Modellwahl des Benutzers in der Profilschicht bleibt erhalten', () => {
  const source = sourceTree();
  const home = temp('shinon-home-');
  seedDshHome(home, source, { isWritable: readOnly });
  const layer = join(home, 'profiles', 'shinon', 'cordis.patch.yml');
  // Der Benutzer waehlt im UI ein Modell — der config-editor schreibt es hierher.
  writeFileSync(layer, 'provider: openrouter\n');

  const again = seedDshHome(home, source, { isWritable: readOnly });
  assert.deepEqual(again.issues, [], 'eine vom Benutzer beschriebene Datei ist kein fremder Eintrag');
  assert.equal(readFileSync(layer, 'utf8'), 'provider: openrouter\n', 'die Wahl bleibt stehen');
});

test('seedDshHome: schreibgeschützte Quelle ersetzt einen toten Mount-Link durch einen Ordner', () => {
  const source = sourceTree();
  const home = temp('shinon-home-');
  const path = join(home, 'profiles');
  symlinkSync('/tmp/.mount_shinonOLD123/profiles', path);

  const result = seedDshHome(home, source, { isWritable: readOnly });
  assert.deepEqual(result.issues, []);
  assert.equal(lstatSync(path).isSymbolicLink(), false);
  assert.equal(lstatSync(join(path, 'shinon')).isDirectory(), true);
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
