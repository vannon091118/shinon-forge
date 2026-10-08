#!/usr/bin/env node
/**
 * desktop-launcher.mjs — Desktop-Icon / Dock-Symbol für den 1-Click-Start.
 *
 * Erzeugt .desktop-Eintrag(e), die scripts/open.mjs (Stufe 1) OHNE Terminal
 * aufrufen: ein Klick auf Desktop-Icon bzw. Dock-/Menü-Symbol startet DSH
 * mit dem aktiven Profil und öffnet die tokenisierte UI im Systembrowser.
 * Terminal=false ist die Zusage — kein Fenster, kein Terminal.
 *
 * Ziele (werden bei Bedarf angelegt, nie überschrieben mit fremdem Inhalt):
 *   1. ~/.local/share/applications/shinon-forge.desktop  (App-Menü + Dock)
 *   2. ~/.config/cinnamon/desktop/  (+ Cinnamon-Spice-Varianz)  (Desktop-Icon)
 *
 * Linux-Desktop-Icons brauchen ein trusted Markierung (freedesktop), damit
 * Cinnamon/GNOME sie ausführen — das passiert hier per .desktop: + chmod +x.
 *
 * Aufruf:  node scripts/desktop-launcher.mjs [--uninstall]
 * npm-Entry: desktop:launcher / desktop:launcher:uninstall
 * Exit: 0 = ok, 1 = Befund (fehlt dsh/node/profil), 2 = Bedienfehler.
 */
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as repo from './lib/repo.mjs';
import { findOnPath } from './lib/yaml.mjs';

const ROOT = repo.ROOT;
const HOME = homedir();
const APP_DIR = join(HOME, '.local', 'share', 'applications');
const CANNED = ['cinnamon', 'cinnamon-desktop-icons', 'spices'];
const APP_NAME = 'Shinon Forge';
const APP_ID = 'shinon-forge';

const args = process.argv.slice(2);
const UNINSTALL = args.includes('--uninstall');
const HELP = args.includes('--help') || args.includes('-h');

if (HELP) {
  console.log('node scripts/desktop-launcher.mjs [--uninstall]');
  process.exit(0);
}

const fail = (msg, code = 1) => {
  console.error(`💥 desktop-launcher: ${msg}`);
  process.exit(code);
};

// ── Fakten sammlen (fail-closed, keine Erraten) ─────────────────────────────
const profileName = repo.activeProfile();
if (profileName === null) fail('kein --profile im dev-Skript (package.json) gefunden');

const dsh = findOnPath('dsh');
if (dsh === null) fail('`dsh` nicht im PATH — der Desktop-Eintrag braucht ihn (AGENTS.md)');

// Node-Absolute-Pfad für Exec=: findOnPath sucht im PATH (dsh-Logik, nicht
// node:logik), node ist im PATH (Repo-Voraussetzung), absolut aufgelöst.
const node = process.execPath;
if (!existsSync(node)) fail(`node-Exe nicht gefunden: ${node}`);

const openScript = resolve(ROOT, 'scripts', 'open.mjs');
if (!existsSync(openScript)) fail(`open.mjs fehlt: ${openScript}`);

// Icon: assets/banner.svg liegt im Repo — dort verankern (nicht im HOME).
const iconPath = resolve(ROOT, 'assets', 'banner.svg');
const iconRef = existsSync(iconPath) ? `SHINON_FORGE_ICON=${iconPath}` : null;

// Exec-Zeile: node open.mjs, Path=ROOT (DSH_HOME setzt open.mjs selbst).
// Das Icon bekommt die Umgebung über die Path=-Variable des .desktop.
const execLine = `"${node}" "${openScript}"`;

function buildDesktopFile() {
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${APP_NAME}`,
    `GenericName=Shinon Forge DSH-Shell`,
    `Comment=Startet DSH mit dem aktiven Profil und öffnet die UI im Browser (1-Click, kein Terminal)`,
    `Exec=${execLine}`,
    `Path=${ROOT}`,
    'Terminal=false',
    'StartupNotify=true',
  ];
  if (iconRef) lines.push(`Icon=${iconPath}`);
  lines.push(`Categories=Development;IDE;`);
  lines.push(`Keywords=shinon;dsh;ai;agent;`);
  lines.push(`X-Shinon-Profile=${profileName}`);
  lines.push('');
  return lines.join('\n');
}

const targets = [
  { path: join(APP_DIR, `${APP_ID}.desktop`), label: 'App-Menü/Dock' },
];
for (const flavor of CANNED) {
  targets.push({ path: join(HOME, '.config', flavor, 'desktop', `${APP_ID}.desktop`), label: `${flavor}/Desktop` });
}

if (UNINSTALL) {
  let removed = 0;
  for (const { path, label } of targets) {
    if (existsSync(path)) {
      rmSync(path);
      console.log(`  🗑  ${label}: ${path}`);
      removed += 1;
    }
  }
  console.log(removed === 0 ? 'keine Einträge entfernt (nicht installiert)' : `${removed} Einträge entfernt`);
  console.log('ℹ️  dsh-Prozesse, falls noch aktiv, laufen weiter — beende DSH separat.');
  process.exit(0);
}

// ── Installation ──────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════');
console.log(`  Shinon Forge — Desktop-Icon für 1-Click-Start`);
console.log(`  Profil: ${profileName}    dsh: ${dsh}`);
console.log(`  node:  ${node}`);
console.log('═══════════════════════════════════\n');

const content = buildDesktopFile();
let created = 0;
for (const { path, label } of targets) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  chmodSync(path, 0o755); // .desktop muss ausführbar + trusted sein
  console.log(`  ✅ ${label}: ${path}`);
  created += 1;
}

console.log(`\n${created} Einträge angelegt.\n`);
console.log('Nächster Schritt:');
console.log('  • App-Menü/Dock: „Shinon Forge" suchen → Klick startet den 1-Click.');
console.log('  • Desktop-Icon (Cinnamon): Desktop-Auswahl/Anpassen → Icon einfügen,');
console.log('    oder per Cinnamon-Contextmenü „Anheften" — das .desktop liegt in ~/.config/cinnamon/desktop/.');
console.log('  • Dock-Symbol: das App-Symbol in die Taskleiste/Pancake ziehen.');
console.log('');
console.log('⚠️  Der Icon-Start braucht den dsh-Prozess. Läuft einer schon (npm run open / dev),');
console.log('    zeigt ein zweiter Start einfach die bestehende UI (gleicher Port/Token) — kein Konflikt.');
console.log('  Deinstallieren: npm run desktop:launcher:uninstall');
process.exit(0);
