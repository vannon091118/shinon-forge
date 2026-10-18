#!/usr/bin/env node
/**
 * check-dsh-versions.mjs — der eine Versionsprüfer als Befehl.
 *
 * `npm run check:dsh-versions` prüft Matrix, Manifeste, Lockfile, Vendor,
 * Installat und CLI gegen `scripts/dsh-target-versions.json`. Exit 0 nur,
 * wenn jede Quelle dieselbe Fassung nennt; sonst 1 mit Soll, Ist und Fundstelle.
 * Dieselbe Implementierung nutzen CI und der Updater (`scripts/dsh-update.mjs`).
 * → Kanon: docs/COMMENT-KANON.md#k-dsh-versions-cli
 */
import { checkVersions, MATRIX_FILE } from './lib/dsh-versions.mjs';
import { ROOT } from './lib/dsh.mjs';

const asJson = process.argv.includes('--json');
const result = checkVersions(ROOT);

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('═══════════════════════════════════════');
  console.log('  DSH-Versionsprüfung');
  console.log('═══════════════════════════════════════');
  console.log(`  Sollquelle: ${MATRIX_FILE}`);
  for (const [pkg, version] of Object.entries(result.targets)) console.log(`    ${pkg} → ${version}`);
  console.log(`  Geprüft: ${result.checks.manifests} Manifeste, ${result.checks.lockEntries} Lock-Einträge, ${result.checks.sourceFiles} Quelldateien`);
  console.log('');
  if (result.ok) {
    console.log('✅ Alle Quellen nennen die Sollfassung.');
  } else {
    console.log(`💥 ${result.issues.length} Befund(e):`);
    for (const found of result.issues) {
      const actual = found.actual === null ? 'nichts' : String(found.actual);
      console.log(`  ❌ ${found.code} — ${found.where}`);
      console.log(`     ${found.package ?? ''}: soll ${found.expected ?? '—'}, ist ${actual}`);
      console.log(`     ${found.message}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
