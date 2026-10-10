#!/usr/bin/env node
/**
 * dsh_reload - Hot-Reload für DeepSeek Harness Profile
 * 
 * Relädt DSH-Konfiguration ohne Neustart:
 * - Patch-Änderungen neu laden
 * - Plugin-Status prüfen
 * - Locale-Sprache umschalten (DE/EN)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DSH_HOME = process.env.DSH_HOME || path.join(process.env.HOME, '.dsh');
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', 'web');
const PATCH_FILE = path.join(PROFILE_DIR, 'cordis.patch.yml');

function reloadProfile() {
  console.log('🔄 DSH Profile wird neu geladen...');
  
  try {
    // HMR-Service triggeren (falls verfügbar)
    const result = execSync('dsh --profile web --dump-config', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log('✅ Config-Dump erfolgreich');
    return result;
  } catch (err) {
    console.error('❌ Reload fehlgeschlagen:', err.message);
    process.exit(1);
  }
}

function setLocale(language = 'de') {
  console.log(`🌐 Sprache auf ${language.toUpperCase()} setzen...`);
  
  const patchContent = fs.readFileSync(PATCH_FILE, 'utf8');
  const localeEntry = `  - id: include:client-locale\n    enabled: true\n    config:\n      language: ${language}\n`;
  
  if (!patchContent.includes('include:client-locale')) {
    const updated = patchContent.replace(
      /(plugins:\s*\n)/,
      `$1${localeEntry}`
    );
    fs.writeFileSync(PATCH_FILE, updated);
    console.log(`✅ Locale-Konfiguration für ${language.toUpperCase()} hinzugefügt`);
  } else {
    console.log(`ℹ️ Locale-Eintrag existiert bereits`);
  }
}

function getStatus() {
  console.log('\n📊 DSH Status:');
  try {
    const version = execSync('dsh --version', { encoding: 'utf8' }).trim();
    console.log(`  Version: ${version}`);
  } catch {
    console.log('  Version: unbekannt');
  }
  
  console.log(`  Profil: ${PROFILE_DIR}`);
  console.log(`  Patch-Datei: ${PATCH_FILE}`);
}

async function main() {
  const command = process.argv[2] || 'status';
  
  switch (command) {
    case 'reload':
      reloadProfile();
      break;
    case 'locale':
      setLocale(process.argv[3] || 'de');
      reloadProfile();
      break;
    case 'status':
      getStatus();
      break;
    default:
      console.log(`
🔧 dsh_reload - DeepSeek Harness Hot-Reload Tool

Verwendung:
  dsh_reload reload      - Profil neu laden
  dsh_reload locale [de|en] - Sprache umschalten
  dsh_reload status      - Status anzeigen
      `);
  }
}

main().catch(console.error);
