#!/usr/bin/env node
/**
 * shinon-test.mjs - das Shinon Forge Gate
 *
 * Ein Gate statt drei (löst dsh-compat.mjs und tests/basic.test.mjs ab).
 * Prüft dynamisch jedes Paket unter packages/* gegen die Verträge aus
 * scripts/lib/repo.mjs - derselben Quelle, die auch scripts/build.mjs nutzt,
 * damit Gate und Build nicht auseinanderdriften.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-6cd6adc0ab9c
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as repo from './lib/repo.mjs';

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

function checkIssues(name, compute) {
  check(name, () => {
    const issues = compute();
    assert(issues.length === 0, issues.join('; '));
  });
}

const root = repo.readRoot();
const packages = repo.discover(root);

console.log('═══════════════════════════════════════');
console.log('  Shinon Forge Gate');
console.log('═══════════════════════════════════════\n');
console.log(`  Scope: ${root.name.split('/')[0]}    Pakete: ${packages.length}`);

if (packages.length === 0) {
  console.error('\n❌ Keine Pakete unter packages/* gefunden');
  process.exit(1);
}

console.log('\n📦 Paket-Validierung:');
for (const pkg of packages) {
  console.log(`\n${pkg.dir}`);
  checkIssues('package.json', () => [...repo.manifestIssues(pkg), ...repo.resourceIssues(pkg)]);
  checkIssues('Namensvertrag', () => repo.contractIssues(pkg));
  checkIssues('index.js', () => repo.indexIssues(pkg));
  checkIssues('client.js', () => repo.clientIssues(pkg));
  checkIssues('cordis.patch.yml', () => repo.patchIssues(pkg));
}

console.log('\n🔎 Legacy-Guard:');
check('keine "dsh-mod"-Referenzen in Runtime-Artefakten', () => {
  const hits = repo.legacyHits(packages);
  assert(hits.length === 0, `gefunden in: ${hits.join(', ')}`);
});

console.log('\n🚫 pnpm-Reste (Schritt 3.5/A1):');
checkIssues('keine pnpm-Datei, kein pnpm-Aufruf', () => repo.pnpmIssues());

console.log('\n🔗 Profil-Installation:');
checkIssues('Links bleiben in packages/, keine pnpm-Reste', () => repo.profileInstallIssues());

console.log('\n🧬 Config-Vertrag (Cordis/Schemastery):');
// Der Cordis-Vertrag ist nicht „Config ist da", sondern `~standard.validate` ist
// eine Funktion. Die Prüfung liegt in `repo.configShapeIssues`, damit sie
// dieselbe Funktion ist, die ihre Mutationsprobe testet.
//
// Ein Baum ohne Installat kann die Host-Hälften nicht laden. Das ist FAIL-CLOSED:
// die Prüfung zählt als Befund, nicht als Skip — ein Skip wäre Grün ohne Messung.
// Die Fixture-Kopien in `scripts/validate-test.mjs` binden deshalb dasselbe
// `node_modules` per Symlink ein; die CI installiert vor dem Gate (`npm ci`).
let schemastery = true;
try {
  await import('@deepseek-ai/schemastery');
} catch {
  schemastery = false;
}
if (!schemastery) {
  console.log('  ❌ Config-Vertrag: @deepseek-ai/schemastery fehlt — Prüfung nicht ausführbar (npm ci nötig)');
  failed += 1;
} else {
  const configIssues = await repo.configShapeIssues(packages);
  if (configIssues.length === 0) {
    const checked = packages.filter((pkg) => /export const Config\b/.test(readFileSync(join(pkg.base, 'index.js'), 'utf8')));
    console.log(`  ✅ ${checked.length} Configs sind Schemastery-Schemata`);
    passed += 1;
  } else {
    for (const issue of configIssues) console.log(`  ❌ ${issue}`);
    failed += configIssues.length;
  }
}

console.log('\n🔗 Quell-Zwillinge:');
checkIssues('eine Quelle, ein Spiegel — keine Drift', () => repo.twinIssues());

console.log('\n🧩 Generierte Idiome:');
checkIssues('eine Quelle, generierte Blöcke — kein Drift', () => [
  ...repo.idiomIssues(repo.ROOT, 'index.js'),
  ...repo.idiomIssues(repo.ROOT, 'client.js'),
]);

console.log('\n📄 Profil:');
const { profileName, profile, issues: repoProblems } = repo.repoIssues(packages, root);
if (!profileName) {
  console.log('  ⏭️  Kein --profile in scripts.dev gefunden - übersprungen');
} else if (profileName.startsWith('create:')) {
  console.log(`  ⏭️  Profil "${profileName}" wird von DSH erzeugt - übersprungen`);
} else {
  check(`profiles/${profileName} (${profile.entries.length} Paket-Bundles)`, () => {
    const issues = [...profile.issues, ...repoProblems];
    assert(issues.length === 0, issues.join('; '));
  });
  // Sichtbar machen, was NICHT hier liegt: ein fremdes Bundle ist erlaubt, aber es
  // soll niemand raten muessen, warum es keinen Eintrag unter packages/* hat.
  if ((profile.foreign ?? []).length > 0) {
    console.log(`  ℹ️  fremde Bundles (Ziel ausserhalb packages/): ${profile.foreign.map((entry) => entry.name).join(', ')}`);
  }
}

console.log('\n═══════════════════════════════════════');
console.log(`  Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen`);
console.log('═══════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
