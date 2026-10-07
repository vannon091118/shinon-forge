#!/usr/bin/env node
/**
 * build.mjs - Shinon Forge Build-Pipeline
 *
 * Stufen, alle auf derselben Validierungsquelle wie das Gate (lib/repo.mjs):
 *   1. Package Discovery     packages/* dynamisch
 *   2. Manifest-Validierung  Exports, DSH-Bundle-/Client-Metadaten
 *   3. Ressourcen            jede Manifest-/Config-Referenz existiert und parst
 *   4. Patch-Validierung     YAML-Schema der Loader-Patches (Felder, Typen, required)
 *   5. Namensvertrag         package.json ↔ Patch ↔ ModuleLoader-id
 *   6. Komposition           Profil-Bundles, doppelte ids, Paketgraph
 *   7. Artefakte             dist/ inkl. jeder referenzierten Ressource
 *
 * Läuft ohne node_modules - nur node:-Module und der YAML-Parser des DSH-Stacks.
 */
import { createHash } from 'crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import * as repo from './lib/repo.mjs';

const DIST = join(repo.ROOT, 'dist');

function fail(problems) {
  console.error(`\n❌ Build abgebrochen - ${problems.length} Problem(e):`);
  for (const problem of problems) console.error(`   - ${problem}`);
  console.error('\nDetails: node scripts/dsh-test.mjs');
  process.exit(1);
}

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

// Stufen 1-6: Discovery und Validierung
const root = repo.readRoot();
const packages = repo.discover(root);
if (packages.length === 0) fail(['keine Pakete unter packages/* gefunden']);

const problems = [];
for (const pkg of packages) {
  for (const [stage, issues] of [
    ['Manifest', repo.manifestIssues(pkg)],
    ['Ressourcen', repo.resourceIssues(pkg)],
    ['Patch', repo.patchIssues(pkg)],
    ['Vertrag', repo.contractIssues(pkg)],
    ['index.js', repo.indexIssues(pkg)],
    ['client.js', repo.clientIssues(pkg)],
  ]) {
    if (issues.length) problems.push(`${pkg.dir} [${stage}]: ${issues.join('; ')}`);
  }
}
for (const hit of repo.legacyHits(packages)) problems.push(`Legacy-Referenz: ${hit}`);

const { profileName, profile, issues: repoProblems } = repo.repoIssues(packages, root);
if (profile.issues.length) problems.push(`Profil ${profileName}: ${profile.issues.join('; ')}`);
if (repoProblems.length) problems.push(`Komposition: ${repoProblems.join('; ')}`);

if (problems.length) fail(problems);
console.log(`✅ Validierung: ${packages.length} Pakete, Profil "${profileName}" mit ${profile.entries.length} Einträgen`);

// Stufe 7: Artefakte
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const manifestPackages = [];
const missing = [];
for (const pkg of packages) {
  const dest = join(DIST, 'packages', pkg.dir);
  mkdirSync(dest, { recursive: true });
  for (const file of repo.artifactFiles(pkg)) {
    const src = join(pkg.base, file);
    if (existsSync(src)) cpSync(src, join(dest, file), { recursive: true });
  }
  // Jede Referenz muss im Artefakt liegen - nicht nur kopiert werden.
  for (const { value, kind } of repo.resourceRefs(pkg)) {
    const rel = value.replace(/^\.\//, '');
    if (!existsSync(join(dest, rel))) missing.push(`${pkg.dir} [Artefakt]: ${kind} "${value}" fehlt in dist/`);
  }
  const files = collectFiles(dest).map((file) => ({
    path: relative(DIST, file),
    bytes: statSync(file).size,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  }));
  manifestPackages.push({
    dir: pkg.dir,
    name: pkg.want.name,
    id: pkg.want.id,
    version: pkg.manifest.version,
    files,
  });
}
if (missing.length) fail(missing);

writeFileSync(join(DIST, 'manifest.json'), `${JSON.stringify({
  name: root.name,
  version: root.version,
  generatedBy: 'scripts/build.mjs',
  profile: profileName,
  packages: manifestPackages,
}, null, 2)}\n`);

writeFileSync(join(DIST, 'profile.json'), `${JSON.stringify({
  profile: profileName,
  bundles: profile.bundles,
  entries: profile.entries,
}, null, 2)}\n`);

const files = manifestPackages.flatMap((pkg) => pkg.files);
console.log(`✅ Artefakte: dist/ mit ${manifestPackages.length} Paketen, ${files.length} Dateien, ${files.reduce((sum, file) => sum + file.bytes, 0)} Bytes`);
console.log('   dist/manifest.json   Paketliste mit Hashes');
console.log('   dist/profile.json    aufgelöstes Profil');
console.log('   dist/packages/<dir>  Runtime-Dateien je Paket');
