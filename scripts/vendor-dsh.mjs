#!/usr/bin/env node
/**
 * vendor-dsh.mjs — die vendorte CLI aus der Sollquelle erneuern.
 *
 * Der Umzug ist kein `git mv`: das Skript packt GENAU die Fassung aus
 * `scripts/dsh-target-versions.json` aus der Registry, prüft die Integrität
 * gegen das Lockfile und schreibt `vendor/dsh/` samt `MANIFEST.json` neu
 * (sha256 und Bytes je Datei). Danach misst `check-dsh-versions.mjs`, ob
 * Pin, Lock, Vendor, Installat und CLI dieselbe Fassung nennen.
 * → Kanon: docs/COMMENT-KANON.md#k-vendor-dsh
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMatrix } from './lib/dsh-versions.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VENDOR = join(ROOT, 'vendor', 'dsh');
const sha = (algorithm, bytes, encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);

/** Alle Dateien unter `dir`, relativ und mit `/` als Trenner. */
function walk(dir, base = dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, base));
    else found.push(relative(base, full).split(sep).join('/'));
  }
  return found.sort();
}

/** Die Fassung packen, entpacken und ihre Integrität gegen das Lock prüfen. */
function fetchTarball(target) {
  const work = mkdtempSync(join(tmpdir(), 'shinon-vendor-dsh-'));
  execFileSync('npm', ['pack', `@deepseek-ai/dsh@${target}`, '--pack-destination', work, '--silent'], { stdio: 'inherit', cwd: ROOT });
  const tarball = readdirSync(work).find((name) => name.endsWith('.tgz'));
  if (tarball === undefined) throw new Error(`npm pack lieferte kein Tarball für ${target}`);
  const file = join(work, tarball);
  const bytes = readFileSync(file);
  const integrity = `sha512-${sha('sha512', bytes, 'base64')}`;
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const locked = lock.packages?.['node_modules/@deepseek-ai/dsh'];
  if (locked?.integrity !== integrity) {
    throw new Error(`Tarball-Integrität ${integrity} weicht vom Lock (${locked?.integrity ?? 'kein Eintrag'}) ab`);
  }
  const unpacked = join(work, 'unpacked');
  mkdirSync(unpacked, { recursive: true });
  execFileSync('tar', ['-xzf', file, '-C', unpacked], { stdio: 'inherit' });
  return { pkg: join(unpacked, 'package'), bytes, integrity, tarball, work };
}

/** Das Manifest aus dem entpackten Paket bauen — jede Zahl gemessen, keine abgetippt. */
function buildManifest(pkgDir, { integrity, bytes }) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const gitHead = (() => {
    try {
      const value = execFileSync('npm', ['view', `@deepseek-ai/dsh@${pkg.version}`, 'gitHead', '--json'], { encoding: 'utf8' }).trim();
      return value === '' || value === 'undefined' ? null : JSON.parse(value);
    } catch {
      return null;
    }
  })();
  const files = walk(pkgDir).map((rel) => {
    const content = readFileSync(join(pkgDir, rel));
    return { path: rel, sha256: sha('sha256', content), bytes: content.length };
  });
  return {
    vendor: 'dsh',
    package: '@deepseek-ai/dsh',
    version: pkg.version,
    license: pkg.license,
    repository: pkg.repository,
    source: {
      tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${pkg.version}.tgz`,
      integrity,
      shasum: sha('sha1', bytes),
      tarballSha256: sha('sha256', bytes),
      fileCount: files.length,
      unpackedSize: files.reduce((sum, file) => sum + file.bytes, 0),
    },
    gitHead,
    gitHeadNote: gitHead === null
      ? `Die Registry veroeffentlicht fuer ${pkg.version} kein gitHead (npm view @deepseek-ai/dsh@${pkg.version} gitHead --json -> leer). Ein Commit-Hash ist damit NICHT belegbar; belegbar sind Paketfassung, Tarball-Integritaet und der sha256 jeder vendorten Datei. Ein erfundener Hash waere schlimmer als ein ehrliches null.`
      : `gitHead aus der Registry (npm view @deepseek-ai/dsh@${pkg.version} gitHead).`,
    vendoredAt: new Date().toISOString().slice(0, 10),
    vendoredBy: 'scripts/vendor-dsh.mjs — Fassung aus scripts/dsh-target-versions.json, Integrität gegen package-lock.json (welcher Code vendor/ laedt: vendor/MODIFICATIONS.md)',
    changes: `keine — jede Datei byte-identisch zum Tarball (sha256 je Datei unten, ${files.length}/${files.length} verglichen, 0 Abweichungen)`,
    scope: {
      enclosed: `das veroeffentlichte CLI-Paket @deepseek-ai/dsh (${files.length} Dateien)`,
      excluded: 'der Oekosystem-Baum (@deepseek-ai/*-Bundles) bleibt npm-Abhaengigkeit aus dem Root-Lockfile — nicht vendort',
    },
    files,
  };
}

function main() {
  const { targets, issues } = loadMatrix(ROOT);
  if (issues.length > 0) {
    console.error(`💥 Sollquelle ungültig: ${issues.map((found) => found.message).join('; ')}`);
    process.exitCode = 2;
    return;
  }
  const target = targets['@deepseek-ai/dsh'];
  console.log(`📦 Vendore @deepseek-ai/dsh@${target}`);
  const { pkg, ...meta } = fetchTarball(target);
  const manifest = buildManifest(pkg, meta);

  for (const entry of readdirSync(VENDOR)) {
    if (entry !== 'MANIFEST.json') rmSync(join(VENDOR, entry), { recursive: true, force: true });
  }
  cpSync(pkg, VENDOR, { recursive: true });
  writeFileSync(join(VENDOR, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✅ ${manifest.files.length} Dateien vendort, Integrität ${manifest.source.integrity.slice(0, 20)}…`);
  console.log('   Nächster Schritt: npm run check:dsh-versions');
}

main();
