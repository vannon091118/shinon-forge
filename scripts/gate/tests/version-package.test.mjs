#!/usr/bin/env node
/**
 * Tests des Versionsspiegels (@shinon/version).
 *
 * WAS HIER GEPRUEFT WIRD — und warum es ein Test und keine Formel im Paket ist:
 *   1. Der Namensvertrag: Manifest, Patch, Client und Profil muessen denselben
 *      Namen tragen. Ein abweichender Name laedt das Paket nicht.
 *   2. Die Naht Client <-> Host: der Name des Globals und die Route stehen im
 *      Host als Export und im Client als Literal — ein Client-Bundle kann den
 *      Host nicht importieren, also muss der Name zweimal dastehen. Wer ihn nur
 *      einmal pflegt, baut eine Ecke, die leer bleibt.
 *   3. Der Bau-Schatten: der Packer und das Paket muessen dieselbe Datei
 *      benennen — sonst meldet das installierte Paket stillschweigend
 *      "unbekannt" statt seines Stands.
 *   4. Die Profilzugehoerigkeit: ein Paket, das nicht im Profil steht, ist
 *      tot (das Gate `dead-package` sagt es an dieser Stelle).
 *
 * Und die Probe, die ein Gate von der Dekoration trennt: eine mutierte Kopie
 * muss ROT werden. Ein Test, der nie rot werden kann, beweist nichts.
 *
 * Laeuft mit `node --test` — kein node_modules, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGE_DIR = join(ROOT, 'packages', 'version');
const HOST_FILE = join(PACKAGE_DIR, 'index.js');
const CLIENT_FILE = join(PACKAGE_DIR, 'client.js');
const PROBE_FILE = join(PACKAGE_DIR, 'assets', 'version-probe.js');
const MANIFEST_FILE = join(PACKAGE_DIR, 'package.json');
const PATCH_FILE = join(PACKAGE_DIR, 'cordis.patch.yml');
const PAYLOAD_FILE = join(ROOT, 'scripts', 'lib', 'payload.mjs');
const PROFILE_FILE = join(ROOT, 'profiles', 'shinon', 'package.json');

const hostSource = readFileSync(HOST_FILE, 'utf8');
const clientSource = readFileSync(CLIENT_FILE, 'utf8');
const probeSource = readFileSync(PROBE_FILE, 'utf8');
const payloadSource = readFileSync(PAYLOAD_FILE, 'utf8');
const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
const patch = readFileSync(PATCH_FILE, 'utf8');
const profile = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));

/** Den Wert einer exportierten Konstante aus einem Quelltext lesen. */
function exportedString(source, name) {
  const hit = new RegExp(`export const ${name} = '([^']*)'`).exec(source);
  return hit === null ? null : hit[1];
}

/** Die Naht zwischen Host und Client pruefen — als Befundliste. */
function seamIssues(host, client) {
  const issues = [];
  for (const name of ['VERSION_GLOBAL', 'VERSION_ENDPOINT']) {
    const value = exportedString(host, name);
    if (value === null) {
      issues.push(`der Host exportiert ${name} nicht`);
      continue;
    }
    if (!client.includes(value)) issues.push(`der Client kennt ${name} (${value}) nicht`);
  }
  return issues;
}

/** Fremdabhaengigkeiten in einer Kerndatei (erlaubt sind node: und relative). */
function foreignImports(source) {
  return source
    .split('\n')
    .filter((line) => /^import\s.*\sfrom\s'([^']+)'/.test(line))
    .filter((line) => !/from '(node:|\.)/.test(line));
}

test('der Namensvertrag traegt in allen vier Stellen', () => {
  assert.equal(manifest.name, '@shinon/version');
  assert.match(patch, /id: shinon-version/);
  assert.match(patch, /name: '@shinon\/version'/);
  assert.match(clientSource, /__ModuleLoader__\.load\(\{\s*\n\s*id: '@shinon\/version'/);
});

test('der Client spiegelt den Global-Namen und die Route des Hosts', () => {
  assert.deepEqual(seamIssues(hostSource, clientSource), []);
});

test('ein abweichender Name im Client wird rot', () => {
  const global = exportedString(hostSource, 'VERSION_GLOBAL');
  const mutated = clientSource.replaceAll(global, '__DSH_VERSION_OTHER__');
  assert.notEqual(mutated, clientSource, 'die Mutation hat nichts geaendert');
  const issues = seamIssues(hostSource, mutated);
  assert.ok(issues.length > 0, 'ein gedrehter Name muss auffallen');
});

test('Packer und Paket nennen denselben Bau-Schatten', () => {
  const fromPacker = exportedString(payloadSource, 'BUILD_STAMP');
  const fromPackage = exportedString(probeSource, 'BUILD_STAMP');
  assert.ok(fromPacker, 'der Packer nennt BUILD_STAMP nicht');
  assert.ok(fromPackage, 'das Paket nennt BUILD_STAMP nicht');
  assert.equal(fromPacker, fromPackage);
  assert.match(fromPacker, /^\.shinon-build\.json$/);
});

test('das Paket steht im Profil (Bindeglied und Buendel)', () => {
  assert.equal(profile.dependencies['@shinon/version'], 'link:../../packages/version');
  assert.ok(profile.dsh.profile.bundles.includes('@shinon/version'));
});

test('der Host oeffnet die Route, der Client liest den Global', () => {
  assert.match(hostSource, /ctx\.inject\(\['webServer'\]/);
  assert.match(hostSource, /webserver\/index-inject/);
  assert.match(hostSource, /kind: 'global'/);
  assert.match(clientSource, /window\[VERSION_GLOBAL\]/);
});

test('die Kernmessung ist frei von Fremdabhaengigkeiten', () => {
  // Der Kern muss ohne node_modules laufen: sonst kann die CI ihn nicht pruefen.
  assert.deepEqual(foreignImports(probeSource), []);
  assert.deepEqual(foreignImports(readFileSync(join(PACKAGE_DIR, 'assets', 'version-state.js'), 'utf8')), []);
});
