#!/usr/bin/env node
/**
 * dsh-update.mjs — Aktualisierung gegen die Sollquelle, nie gegen ein Maximum.
 *
 * Die Fassung steht in `scripts/dsh-target-versions.json` und nirgends sonst.
 * Nach dem Install misst `checkVersions` Pin, Lock, Vendor, Installat und CLI;
 * eine Abweichung beendet den Lauf mit Exit 1.
 * → Kanon: docs/COMMENT-KANON.md#k-dd28ec2eac28
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dshBinary } from './lib/dsh.mjs';
import { checkVersions, compareSemver, loadMatrix, MATRIX_FILE } from './lib/dsh-versions.mjs';
import { childEnv } from './lib/paths.mjs';
import { resolveRuntime } from './lib/runtime.mjs';
import * as repo from './lib/repo.mjs';

export { compareSemver };

/** Die installierte Fassung: das entdeckte Binary nach `--version` fragen. */
function getDshVersion() {
  try {
    const binary = dshBinary();
    if (binary === null) return 'unknown';
    return execFileSync(binary[0], [...binary.slice(1), '--version'], { encoding: 'utf8' })
      .trim()
      .split('\n')[0];
  } catch {
    return 'unknown';
  }
}

/** Die Sollfassung aus der Matrix; wirft bei ungültiger Sollquelle. */
export function targetDshVersion(root = repo.ROOT) {
  const { targets, issues } = loadMatrix(root);
  if (issues.length > 0) {
    throw new Error(`Sollquelle ${MATRIX_FILE} ist ungültig: ${issues.map((found) => found.message).join('; ')}`);
  }
  return targets['@deepseek-ai/dsh'];
}

/**
 * Ist die Sollfassung in der Registry vorhanden? Das ist eine Existenzprüfung,
 * keine Auswahl: es wird nie die höchste Fassung genommen, nur die bestellte.
 * @returns {{ ok: boolean, version: string|null, reason: string|null }}
 */
export function registryHasTarget(target) {
  try {
    const output = execFileSync('npm', ['view', `@deepseek-ai/dsh@${target}`, 'version', '--json'], {
      encoding: 'utf8',
      timeout: 45000,
      env: childEnv(resolveRuntime()),
    });
    const version = JSON.parse(output);
    return { ok: version === target, version: String(version ?? ''), reason: version === target ? null : `Registry meldet ${version}` };
  } catch (error) {
    return { ok: false, version: null, reason: error.message.split('\n')[0] };
  }
}

/**
 * Vergleich der installierten Fassung gegen die Sollquelle. `unverified`
 * heißt: keine Aussage möglich — und das ist ein Fehler, kein „keine Updates".
 */
export function checkForUpdates(root = repo.ROOT) {
  const target = targetDshVersion(root);
  const current = getDshVersion();
  if (current === 'unknown') {
    return { status: 'unverified', current, target, reason: 'installierte Fassung nicht messbar' };
  }
  return { status: current === target ? 'current' : 'update', current, target, reason: null };
}

/** Alle Bundles in das kanonische Profil installieren (Profil aus dem dev-Skript). */
function installBundles(profile) {
  const binary = dshBinary();
  if (binary === null) {
    console.warn('   ⚠️  Kein lauffähiges dsh gefunden — Bundles nicht installiert');
    return;
  }
  console.log('📦 Installiere Bundles...');
  const packages = [
    '@shinon/core',
    '@shinon/locale-de',
    '@shinon/tooltip',
    '@shinon/dashboard',
    '@shinon/better-errors',
    '@shinon/token-usage',
  ];
  for (const pkg of packages) {
    try {
      console.log(`   Installiere ${pkg}...`);
      execFileSync(
        binary[0],
        [...binary.slice(1), '--profile', profile, 'plugin_manager', 'install_bundle', pkg],
        { stdio: 'inherit' },
      );
    } catch (e) {
      console.warn(`   ⚠️  Failed to install ${pkg}: ${e.message}`);
    }
  }
}

/**
 * Profil vor dem Update sichern: die Repo-Profilschicht nach tmpdir kopieren
 * (nie ins Repo — dort würde ein Backup-Verzeichnis Zählungen und Gates stören).
 */
function backupProfile(profile) {
  const target = mkdtempSync(join(tmpdir(), 'shinon-profile-backup-'));
  cpSync(join(repo.ROOT, 'profiles', profile), join(target, profile), { recursive: true });
  return join(target, profile);
}

/** Profil neu laden (HMR läuft über den DSH-Prozess bzw. Browser-Reload). */
function reloadProfile() {
  console.log('🔄 Lade Profil neu...');
  console.log('   Bitte Browser neu laden oder HMR nutzen');
}

/** Die Sollfassung installieren — repo-lokal und exakt, kein Tag, kein Maximum. */
function installTarget(target) {
  console.log(`📦 Installiere @deepseek-ai/dsh@${target} (exakt, repo-lokal)...`);
  execFileSync('npm', ['install', `@deepseek-ai/dsh@${target}`, '--save-exact', '--no-audit', '--no-fund'], {
    stdio: 'inherit',
    env: childEnv(resolveRuntime()),
    cwd: repo.ROOT,
  });
}

/** Nach dem Install messen: Pin, Lock, Vendor, Installat und CLI in einem Lauf. */
function verifyInstalled(target) {
  const pinFile = join(repo.ROOT, 'package.json');
  const pin = JSON.parse(readFileSync(pinFile, 'utf8')).dependencies?.['@deepseek-ai/dsh'];
  const result = checkVersions(repo.ROOT, { skipSourceScan: true });
  const problems = [];
  if (pin !== target) problems.push(`Root-Pin nennt ${pin} statt ${target}`);
  for (const found of result.issues) problems.push(`${found.code} ${found.where}: ${found.message}`);
  return problems;
}

/** Hauptfunktion (fail-closed: jeder ungeprüfte Ausgang setzt den Exit-Code). */
function main() {
  try {
    run();
  } catch (error) {
    console.error(`\n💥 Updater-Fehler: ${error.message}\n`);
    process.exitCode = 1;
  }
}

function run() {
  console.log('═══════════════════════════════════════');
  console.log('  Shinon Forge Updater');
  console.log('═══════════════════════════════════════\n');

  const target = targetDshVersion();
  console.log(`🎯 Sollfassung (${MATRIX_FILE}): ${target}`);
  const { status, current, reason } = checkForUpdates();
  console.log(`   Installiert: ${current}`);

  const profile = repo.activeProfile();
  if (profile === null) {
    console.error('\n💥 Kein --profile im dev-Skript (package.json) gefunden — Abbruch\n');
    process.exitCode = 2;
    return;
  }

  if (status === 'unverified') {
    console.error(`\n💥 UNGEPRÜFT: ${reason ?? 'unbekannter Grund'} — eine unbelegte Fassung ist kein Treffer\n`);
    process.exitCode = 1;
    return;
  }

  if (status === 'current') {
    const problems = verifyInstalled(target);
    if (problems.length > 0) {
      console.error(`\n💥 Die CLI meldet ${current}, aber der Baum ist nicht konsistent:`);
      for (const problem of problems) console.error(`   - ${problem}`);
      console.error('');
      process.exitCode = 1;
      return;
    }
    console.log('\n✅ Sollfassung installiert und der ganze Baum stimmt\n');
    return;
  }

  const registry = registryHasTarget(target);
  if (!registry.ok) {
    console.error(`\n💥 Sollfassung ${target} ist nicht verfügbar: ${registry.reason ?? 'unbekannter Grund'}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n📥 Update: ${current} → ${target}\n`);
  console.log('💾 Erstelle Backup...');
  console.log(`   Profilschicht gesichert: ${backupProfile(profile)}`);

  installTarget(target);
  installBundles(profile);
  reloadProfile();

  const problems = verifyInstalled(target);
  if (problems.length > 0) {
    console.error('\n💥 Nach dem Install stimmt der Baum nicht mit der Sollquelle überein:');
    for (const problem of problems) console.error(`   - ${problem}`);
    console.error('');
    process.exitCode = 1;
    return;
  }
  console.log(`\n✅ ${target} installiert und verifiziert\n`);
}

// Nur als CLI ausführen, nicht beim Import (Tests importieren die reinen Funktionen).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
