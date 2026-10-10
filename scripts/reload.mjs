#!/usr/bin/env node
/**
 * dsh_reload - Isoliertes Hot-Reload für DeepSeek Harness
 * Keine externen Abhängigkeiten - nur Node.js Standardbibliothek
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DSH_HOME = process.env.DSH_HOME || join(process.env.HOME, '.dsh');
const PROFILE_DIR = join(DSH_HOME, 'profiles', 'web');
const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml');

/** DSH-Befehl ausführen */
function runDsh(args) {
  return execSync(`dsh ${args}`, { 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
}

/** Profil neu laden via HMR oder Neustart */
function reloadProfile() {
  console.log('🔄 DSH Profile wird neu geladen...');
  
  if (!existsSync(PATCH_FILE)) {
    console.error(`❌ Patch-Datei nicht gefunden: ${PATCH_FILE}`);
    process.exit(1);
  }
  
  try {
    // HMR-Trigger über Config-Dump
    const result = runDsh('--profile web --dump-config');
    console.log('✅ Config-Dump erfolgreich');
    console.log('ℹ️  Änderungen werden beim nächsten Start wirksam.');
  } catch (err) {
    console.error('❌ Reload fehlgeschlagen:', err.message);
    process.exit(1);
  }
}

/** Locale-Sprache setzen (DE/EN) */
function setLocale(language = 'de') {
  console.log(`🌐 Sprache auf ${language.toUpperCase()} setzen...`);
  
  if (!existsSync(PATCH_FILE)) {
    console.error(`❌ Patch-Datei nicht gefunden: ${PATCH_FILE}`);
    return;
  }
  
  let patchContent = readFileSync(PATCH_FILE, 'utf8');
  
  // Locale-Eintrag finden und ersetzen
  const localePattern = /(-\s*id:\s*include:client-locale\s*\n(?:\s+.*\n)*)/;
  const localeReplacement = `  - id: include:client-locale\n    enabled: true\n    config:\n      language: ${language}\n`;
  
  if (localePattern.test(patchContent)) {
    patchContent = patchContent.replace(localePattern, localeReplacement);
  } else {
    // Neuen Eintrag nach plugins: hinzufügen
    const newEntry = `\n  # Locale-Konfiguration (DDS)\n  - id: include:client-locale\n    enabled: true\n    config:\n      language: ${language}\n`;
    patchContent = patchContent.replace(/(\nplugins:\s*\n)/, `$1${newEntry}`);
  }
  
  writeFileSync(PATCH_FILE, patchContent);
  console.log(`✅ Locale für ${language.toUpperCase()} konfiguriert`);
}

/** DDS-Konfiguration anzeigen */
function showDdsSetup() {
  console.log(`
🔧 DDS (DeepSeek Data System) - Deutsche Konfiguration
=====================================================

Verfügbare Befehle:
  dsh_reload status     - DSH-Status anzeigen
  dsh_reload locale [de|en] - Sprache umschalten
  dsh_reload reload     - Profil neu laden
  dsh_reload plugins    - Aktivierte Plugins anzeigen

DDS-Plugins (optional aktivieren):
  - include:client-locale  → Deutsche Sprache
  - include:client-ui-tool → Tooltips
  - include:hmr            → Hot-Reload

Beispiele:
  dsh_reload locale de
  dsh_reload reload
`);
}

/** Status anzeigen */
function showStatus() {
  console.log('\n📊 DSH Status:');
  
  try {
    const version = runDsh('--version');
    console.log(`  Version: ${version}`);
  } catch {
    console.log('  Version: unbekannt');
  }
  
  console.log(`  Profil: ${PROFILE_DIR}`);
  console.log(`  Patch: ${PATCH_FILE}`);
  
  if (existsSync(PATCH_FILE)) {
    console.log('  Patch-Datei: ✅ vorhanden');
  } else {
    console.log('  Patch-Datei: ❌ nicht gefunden');
  }
  
  // Zeige aktuelle Sprache aus Patch
  if (existsSync(PATCH_FILE)) {
    const content = readFileSync(PATCH_FILE, 'utf8');
    const langMatch = content.match(/language:\s*(\w+)/);
    if (langMatch) {
      console.log(`  Aktuelle Sprache: ${langMatch[1].toUpperCase()}`);
    }
  }
}

/** Plugins auflisten */
function listPlugins() {
  console.log('\n📦 Aktivierte Plugins:');
  try {
    const output = runDsh('--profile web --dump-config');
    // Parse und zeige relevante Plugins
    const lines = output.split('\n').filter(l => l.includes('id:') || l.includes('enabled:'));
    lines.slice(0, 20).forEach(l => console.log(`  ${l.trim()}`));
  } catch (err) {
    console.error('  Fehler beim Laden:', err.message);
  }
}

// Hauptprogramm
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
    showStatus();
    break;
  case 'plugins':
    listPlugins();
    break;
  case 'dds':
  case 'setup':
    showDdsSetup();
    break;
  default:
    console.log(`
🔧 dsh_reload - Isoliertes DSH Hot-Reload Tool
================================================

Verwendung:
  dsh_reload status       - DSH-Status anzeigen
  dsh_reload reload       - Profil neu laden
  dsh_reload locale [de|en] - Sprache umschalten
  dsh_reload plugins      - Plugins auflisten
  dsh_reload dds          - DDS-Hilfe anzeigen
`);
}
