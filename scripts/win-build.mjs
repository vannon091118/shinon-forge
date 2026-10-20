#!/usr/bin/env node
/**
 * win-build.mjs — das Windows-Paket (ZIP) aus der gemeinsamen Nutzlast.
 *
 * Warum so und nicht anders:
 *
 *   - DIESELBE Nutzlast wie das .deb (`scripts/lib/payload.mjs`): derselbe Code,
 *     dieselben Produktions-Abhaengigkeiten, dieselbe mitgelieferte Node-Laufzeit.
 *     Nur die Huelle ist anders, weil Windows kein `dpkg-deb` hat.
 *   - Ein Archiv, kein Installer-Framework: `install.ps1` kopiert die Nutzlast
 *     an einen Ort im Benutzerprofil, traegt ihn in den Benutzer-PATH ein und
 *     legt zwei Startmenue-Verknuepfungen an (Start und Deinstallation). Alles
 *     davon ist PowerShell, das auf jedem Windows vorhanden ist — kein WiX, kein
 *     NSIS, kein Framework, das man pflegen muss.
 *   - Portable zuerst: `shinon.cmd` im Archiv laeuft ohne Installation, weil
 *     der Starter sich selbst sucht (`%~dp0`). Wer installiert, bekommt
 *     zusaetzlich PATH und Startmenue.
 *   - KEINE Verknuepfungen im Archiv: ein ZIP kann sie nicht transportieren,
 *     also liegen die Buendel-Pakete dort als echte Verzeichnisse. Sie zeigen
 *     auf denselben Code wie im .deb.
 *
 * WICHTIG FUER DEN BAU: das Windows-Paket gehoert auf einen Windows-Bauhost
 * gebaut (GitHub-Runner `windows-latest`), weil die Abhaengigkeiten dann die
 * WINDOWS-Fassung sind. Auf einem Linux-Bauhost gebaut, traegt es Linux-Binaer-
 * dateien — das Paket waere dann zwar gebaut, aber nicht lauffaehig, und der
 * Fehler faellt erst auf dem fremden Rechner auf. Das Skript verweigert den
 * Bau darum ausserhalb von Windows (`--force` hebt das nur zum Pruefen der
 * Form auf). Der Bauhost steht im Workflow, nicht in diesem Skript.
 *
 * Aufruf:  node scripts/win-build.mjs [--out <dir>] [--keep] [--runtime-dir <dir>]
 *          [--no-modules] [--no-runtime]   (Form-Bau ohne Netz und ohne Laufzeit)
 * npm-Entry: `npm run win`
 * Exit: 0 = Archiv gebaut · 1 = Befund (kein ZIP-Werkzeug, verweigerte Links) ·
 *        2 = Bedienfehler
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as repo from './lib/repo.mjs';
import { buildPayload, payloadViolations } from './lib/payload.mjs';
import { engineRange, floorVersion } from './lib/runtime.mjs';

const ROOT = repo.ROOT;
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};
const has = (flag) => args.includes(flag);

// DIE WAND: ein Windows-Archiv traegt Windows-Abhaengigkeiten. Auf einem
// Linux-Bauhost gebaut, traegt es Linux-Binaerdateien — das Archiv waere
// gebaut, aber nicht lauffaehig, und der Fehler faellt erst auf dem fremden
// Rechner auf. Deshalb: der Bau des Windows-Archivs ist ein Windows-Vorgang.
// Wer es pruefen will, nutzt `--force` (dann traegt das Archiv die
// Linux-Fassung der Abhaengigkeiten und ist als Beleg nutzbar, nicht als
// Auslieferung).
if (process.platform !== 'win32' && !has('--force')) {
  console.error('\ud83d\udca5 win-build: dieses Archiv gehoert auf einen Windows-Bauhost (github: windows-latest).');
  console.error('   Auf diesem Host wuerden die Abhaengigkeiten fuer Linux gebaut — gebaut, aber nicht lauffaehig.');
  console.error('   Zum Pruefen der Form: --force (Ergebnis ist dann KEIN Auslieferungspaket).');
  process.exit(1);
}

const OUT = resolve(valueOf('--out') ?? join(ROOT, 'dist-win'));
const STAGE = join(OUT, 'stage');
const PAYLOAD = join(STAGE, 'payload');
const APP_ID = 'shinon-forge';

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = String(manifest.version);
const arch = valueOf('--arch') ?? (process.arch === 'arm64' ? 'arm64' : 'x64');
const nodeVersion = floorVersion(engineRange(ROOT));

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

console.log(`🔨 win-build: Nutzlast fuer ${APP_ID} ${version} (Node ${nodeVersion}, win32-${arch}) …`);

// `--no-modules` und `--no-runtime` bauen eine FORM ohne die schweren
// Teile (kein `npm ci`, keine Laufzeit) — der Weg fuer den Form-Test.
const WITH_MODULES = !has('--no-modules');

const payload = await buildPayload({
  source: ROOT,
  stage: PAYLOAD,
  platform: 'win32',
  arch,
  version: nodeVersion,
  modules: WITH_MODULES ? 'npm' : 'skip',
  runtime: has('--no-runtime') ? 'skip' : 'download',
  runtimeDir: valueOf('--runtime-dir'),
  // Keine Verknuepfungen: ein ZIP transportiert sie nicht.
  linkMode: 'copy',
});

const violations = payloadViolations({ stage: PAYLOAD, requireModules: WITH_MODULES });
if (violations.length > 0) {
  console.error(`💥 win-build: die Nutzlast traegt Verbotenes (${violations.join(', ')}) — kein Archiv wird gebaut.`);
  process.exit(1);
}

const archive = join(OUT, `${APP_ID}_${version}_win32-${arch}.zip`);
rmSync(archive, { force: true });

/** Das ZIP-Werkzeug des Bauhosts: PowerShell unter Windows, sonst `zip`. */
function zipDirectory(source, target) {
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${source}\\*' -DestinationPath '${target}' -Force`], { stdio: 'inherit' });
    return;
  }
  execFileSync('zip', ['-r', '-q', '-y', target, '.'], { cwd: source, stdio: 'inherit' });
}

if (!has('--no-archive')) {
  try {
    zipDirectory(PAYLOAD, archive);
  } catch (error) {
    console.error(`💥 win-build: das ZIP liess sich nicht bauen (${error.message}) — auf diesem Host fehlt zip oder Compress-Archive.`);
    process.exit(1);
  }
}

if (!has('--keep')) rmSync(STAGE, { recursive: true, force: true });

const size = statSync(archive).size;
const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${sha256}  ${APP_ID}_${version}_win32-${arch}.zip\n`, 'utf8');

console.log('═══════════════════════════════════');
console.log('  Shinon Forge — Windows-Archiv gebaut');
console.log(`  Archiv:     ${archive}`);
console.log(`  Größe:      ${(size / (1024 * 1024)).toFixed(1)} MiB`);
console.log(`  Prüfsumme:  ${sha256}`);
console.log(`  Laufzeit:   Node ${nodeVersion} (mitgeliefert, geprüft)`);
console.log(`  Starter:    shinon.cmd (portabel) · install.ps1 (kopiert, PATH, Startmenue)`);
console.log(`  Code:       ${payload.code.join(', ')}`);
console.log(`  Buendel:    ${payload.links} Pakete (echte Verzeichnisse, kein Symlink im Archiv)`);
console.log('  Installieren: entpacken, dann PowerShell: powershell -ExecutionPolicy Bypass -File .\\install.ps1');
console.log('  Entfernen:    Startmenue "Shinon Forge deinstallieren" (oder uninstall.ps1)');
console.log('═══════════════════════════════════');
