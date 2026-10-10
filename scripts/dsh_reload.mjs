#!/usr/bin/env node
/**
 * dsh_reload - Hot-Reload für DeepSeek Harness Profile
 * 
 * Relädt DSH-Konfiguration ohne Neustart:
 * - Patch-Änderungen neu laden
 * - Plugin-Status prüfen
 * - Locale-Sprache umschalten (DE/EN)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DSH_HOME = process.env.DSH_HOME || join(process.env.HOME, '.dsh');
const PROFILE_DIR = join(DSH_HOME, 'profiles', 'web');
const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml');

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
  
  if (!existsSync(PATCH_FILE)) {
    console.error(`❌ Patch-Datei nicht gefunden: ${PATCH_FILE}`);
    return;
  }
  
  let patchContent = readFileSync(PATCH_FILE, 'utf8');
  
  // Prüfe ob Locale-Eintrag existiert
  if (patchContent.includes('include:client-locale')) {
    // Ersetze bestehenden Eintrag
    const updated = patchContent.replace(
      /(-\s*id:\s*include:client-locale\s*\n(?:\s+.*\n)*)/,
      `  - id: include:client-locale\n    enabled: true\n    config:\n      language: ${language}\n`
    );
    if (updated !== patchContent) {
      writeFileSync(PATCH_FILE, updated);
      console.log(`✅ Locale-Konfiguration für ${language.toUpperCase()} aktualisiert`);
    } else {
      console.log(`ℹ️ Locale-Eintrag wurde nicht ersetzt (Pattern nicht passend)`);
    }
  } else {
    // Füge neuen Eintrag hinzu
    const localeEntry = `\n# Deutsche Locale-Konfiguration\n  - id: include:client-locale\n    enabled: true\n    config:\n      language: ${language}\n`;
    const updated = patchContent.replace(/(\nplugins:\s*\n)/, `$1${localeEntry}`);
    writeFileSync(PATCH_FILE, updated);
    console.log(`✅ Locale-Konfiguration für ${language.toUpperCase()} hinzugefügt`);
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
  
  if (existsSync(PATCH_FILE)) {
    console.log('  Patch-Datei: ✅ vorhanden');
  } else {
    console.log('  Patch-Datei: ❌ nicht gefunden');
  }
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
    case 'dds-setup':
      console.log(`
🔧 DDS (DeepSeek Data System) Setup-Anleitung
===========================================

1. Locale konfigurieren:
   dsh_reload locale de      # Deutsch
   dsh_reload locale en      # Englisch

2. Profil neu laden:
   dsh_reload reload

3. DDS-Plugins aktivieren:
   - include:client-locale (für deutsche Sprache)
   - include:client-ui-tool (für Tooltips)
   - include:hmr (für Hot-Reload)

4. Tooltips aktivieren:
   In cordis.patch.yml:
     - id: include:client-ui-tool
       enabled: true
       config:
         showTooltips: true
`);
      break;
    default:
      console.log(`
🔧 dsh_reload - DeepSeek Harness Hot-Reload Tool

Verwendung:
  dsh_reload reload      - Profil neu laden
  dsh_reload locale [de|en] - Sprache umschalten
  dsh_reload status      - Status anzeigen
  dsh_reload dds-setup   - DDS Setup-Anleitung
      `);
  }
}

main().catch(console.error);
