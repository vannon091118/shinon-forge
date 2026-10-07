#!/usr/bin/env node
/**
 * pack-test.mjs - Distributionstest (Exit Gate für Block 1)
 *
 * Je Paket: pnpm pack -> Tarball entpacken -> isoliert installieren -> laden.
 * Rot, solange ein Paket seine host-shared Abhängigkeit nicht deklariert
 * (siehe SHARED_DEPS in scripts/lib/repo.mjs), grün, sobald alle 7 Tarballs
 * im Isolat laden. Eingebunden in `npm test`.
 *
 * Option: --keep  Zwischenstände unter /tmp behalten (Debugging).
 */
import { execFileSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as repo from './lib/repo.mjs';

const WORK = mkdtempSync(join(tmpdir(), 'shinon-pack-'));
/** Immer im Tarball: die Runtime-Dateien plus jede referenzierte Ressource. */
const shippedFiles = (pkg) => [
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  ...repo.resourceRefs(pkg).map(({ value }) => value.replace(/^\.\//, '')),
];
const NPM_FLAGS = ['--no-audit', '--no-fund', '--loglevel=error'];

let passed = 0;
let failed = 0;

function run(cmd, args, cwd) {
  try {
    execFileSync(cmd, args, { cwd, stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    const lines = String(e.stderr ?? '').split('\n').filter(Boolean);
    const reason = lines.find((line) => /error|ERR_/i.test(line)) ?? lines.slice(-1)[0] ?? '';
    return { ok: false, detail: [e.message.split('\n')[0], reason].filter(Boolean).join(' | ') };
  }
}

function step(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

const packages = repo.discover();
console.log('═══════════════════════════════════════');
console.log('  Shinon Forge Distributionstest');
console.log('═══════════════════════════════════════\n');
console.log(`  Pakete: ${packages.length}    Arbeit: ${WORK}`);

if (packages.length === 0) {
  console.error('\n❌ Keine Pakete unter packages/* gefunden');
  process.exit(1);
}

for (const pkg of packages) {
  const packDir = join(WORK, 'work', pkg.dir);
  const tarballDir = join(WORK, 'tarballs', pkg.dir);
  const unpackDir = join(WORK, 'unpacked', pkg.dir);
  const consumerDir = join(WORK, 'consumer', pkg.dir);
  let tarball = null;
  console.log(`\n${pkg.dir}`);

  step('pnpm pack', () => {
    cpSync(pkg.base, packDir, { recursive: true });
    mkdirSync(tarballDir, { recursive: true });
    const packed = run('pnpm', ['pack', '--pack-destination', tarballDir], packDir);
    if (!packed.ok) throw new Error(packed.detail);
    const name = readdirSync(tarballDir).find((file) => file.endsWith('.tgz'));
    if (!name) throw new Error(`kein Tarball in ${tarballDir}`);
    tarball = join(tarballDir, name);
  });

  step('entpacken + Shipped-Dateien', () => {
    mkdirSync(unpackDir, { recursive: true });
    const unpacked = run('tar', ['-xzf', tarball, '-C', unpackDir]);
    if (!unpacked.ok) throw new Error(unpacked.detail);
    for (const file of new Set(shippedFiles(pkg))) {
      if (!existsSync(join(unpackDir, 'package', file))) throw new Error(`im Tarball fehlt: ${file}`);
    }
  });

  step('isoliert installieren', () => {
    mkdirSync(consumerDir, { recursive: true });
    writeFileSync(join(consumerDir, 'package.json'), `${JSON.stringify({ name: `consumer-${pkg.dir}`, version: '1.0.0', private: true }, null, 2)}\n`);
    const installed = run('npm', ['install', tarball, ...NPM_FLAGS], consumerDir);
    if (!installed.ok) throw new Error(installed.detail);
  });

  step(`laden: ${pkg.want.name}`, () => {
    const loaded = run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pkg.want.name)});`], consumerDir);
    if (!loaded.ok) throw new Error(loaded.detail);
  });
}

console.log('\n═══════════════════════════════════════');
console.log(`  Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen`);
console.log('═══════════════════════════════════════');
if (!process.argv.includes('--keep')) rmSync(WORK, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
