#!/usr/bin/env node
/**
 * dsh-profile-test.mjs - Exit Gate fuer das bootfaehige Profil (Block 2)
 *
 * Laedt das aktive Profil genau so, wie DSH es laedt:
 *
 *   DSH_HOME=<Repo-Root> dsh --profile <name> --dump-config
 *
 * Das Repo-Root ist ein gueltiges DSH_HOME, weil es profiles/ enthaelt; damit
 * ist der Lauf reproduzierbar, ohne etwas nach ~/.dsh zu installieren.
 *
 * Rot, solange profiles/<name> kein DSH-Profil ist (kein package.json ->
 * "profile does not exist"), gruen, sobald DSH das Profil aufloest und jeden
 * Bundle-Layer listet. Eingebunden in `npm test`.
 */
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import * as repo from './lib/repo.mjs';

const root = repo.readRoot();
const profileName = repo.activeProfile(root);
const packages = repo.discover(root);
const profile = repo.resolveProfile(profileName, packages, root);

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('═══════════════════════════════════════');
console.log('  Shinon Forge Profiltest (DSH)');
console.log('═══════════════════════════════════════\n');

if (!profileName) {
  console.error('❌ Kein --profile in scripts.dev gefunden');
  process.exit(1);
}

console.log(`  Profil: ${profileName}    DSH_HOME: ${repo.ROOT}`);
console.log(`  Bundles: ${profile.bundles.length} (${profile.entries.length} aus diesem Repo)\n`);

let dump = null;
check(`dsh --profile ${profileName} --dump-config`, () => {
  assert(existsSync(join(profile.dir, 'package.json')), `profiles/${profileName}/package.json fehlt`);
  try {
    dump = execFileSync('dsh', ['--profile', profileName, '--dump-config'], {
      cwd: repo.ROOT,
      env: { ...process.env, DSH_HOME: repo.ROOT },
      encoding: 'utf8',
      timeout: 120000,
    });
  } catch (e) {
    const detail = String(e.stderr ?? e.message).split('\n').filter(Boolean).slice(-2).join(' | ');
    throw new Error(detail || 'dsh nicht ausfuehrbar');
  }
});

if (dump !== null) {
  const layers = dump.split('\n').filter((line) => line.startsWith('# == '));
  check(`listet alle ${profile.bundles.length} Bundle-Layer`, () => {
    const missing = profile.bundles.filter(
      (name) => !layers.some((line) => line.slice('# == '.length).split(', ').includes(name)),
    );
    assert(missing.length === 0, `fehlende Layer: ${missing.join(', ')}`);
  });

  check(`aktiviert die ${profile.entries.length} Paket-Bundles`, () => {
    const missing = profile.entries.filter((entry) => !new RegExp(`^- id: ${entry.id}$`, 'm').test(dump));
    assert(missing.length === 0, `fehlende Eintraege: ${missing.map((entry) => entry.id).join(', ')}`);
  });
}

console.log('\n═══════════════════════════════════════');
console.log(`  Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen`);
console.log('═══════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
