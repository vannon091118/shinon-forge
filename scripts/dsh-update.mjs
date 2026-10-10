#!/usr/bin/env node
/**
 * dsh-update.mjs - DSH Upstream Update Script
 * 
 * Checkt neue DSH-Versionen und aktualisiert die Mods
 */

import { execSync, execFileSync } from 'child_process';
import { dshBinary } from './lib/dsh.mjs';

/**
 * Aktuelle DSH-Version: das entdeckte Binary (`dshBinary()` aus lib/dsh.mjs,
 * eine Auflösung für alle Skripte) nach `--version` fragen statt einen
 * hartcodierten Installationspfad zu lesen. `unknown`, wenn nichts auflöst.
 */
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

/**
 * Prüfe verfügbare Updates
 */
async function checkForUpdates() {
  console.log('🔍 Prüfe DSH Updates...');
  const current = getDshVersion();
  console.log(`   Aktuelle DSH Version: ${current}`);
  
  // Hier könnte npm check oder GitHub API genutzt werden
  return { current, latest: current, hasUpdate: false };
}

/**
 * Installiere alle Bundles
 */
function installBundles() {
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
      execSync(
        `dsh --profile web plugin_manager install_bundle ${pkg}`,
        { stdio: 'inherit' }
      );
    } catch (e) {
      console.warn(`   ⚠️  Failed to install ${pkg}: ${e.message}`);
    }
  }
}

/**
 * Lade Profil neu (HMR)
 */
function reloadProfile() {
  console.log('🔄 Lade Profil neu...');
  // DSH HMR wird über den Browser getriggert
  console.log('   Bitte Browser neu laden oder HMR nutzen');
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Shinon Forge Updater');
  console.log('═══════════════════════════════════════\n');
  
  // 1. Check updates
  const { current, latest, hasUpdate } = await checkForUpdates();
  
  if (!hasUpdate) {
    console.log('\n✅ Keine Updates verfügbar\n');
  } else {
    console.log(`\n📥 Update verfügbar: ${current} → ${latest}\n`);
    
    // 2. Backup
    console.log('💾 Erstelle Backup...');
    execSync('cp -r ~/.dsh/profiles/web ~/.dsh/profiles/web.backup', { stdio: 'inherit' });
    
    // 3. Update DSH
    console.log('📦 Aktualisiere DSH...');
    execSync('npm update -g @deepseek-ai/dsh', { stdio: 'inherit' });
    
    // 4. Installiere Bundles
    installBundles();
    
    // 5. Reload
    reloadProfile();
  }
  
  console.log('\n✨ Fertig!\n');
}

main().catch(console.error);
