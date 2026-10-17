#!/usr/bin/env node
/**
 * desktop-launcher.mjs — Desktop-Icon / Dock-Symbol für den 1-Click-Start.
 *
 * Erzeugt .desktop-Eintrag(e), die scripts/open.mjs (Stufe 1) OHNE Terminal
 * aufrufen: ein Klick auf Desktop-Icon bzw. Dock-/Menü-Symbol startet DSH
 * mit dem aktiven Profil und öffnet die tokenisierte UI im Systembrowser.
 * Terminal=false ist die Zusage — kein Fenster, kein Terminal.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-a3a91e99873c
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as repo from './lib/repo.mjs';
import { dshBinary, dshSource } from './lib/dsh.mjs';
import { resolveRuntime, runtimeFailure } from './lib/runtime.mjs';
import { describePaths } from './lib/paths.mjs';

const ROOT = repo.ROOT;
const HOME = homedir();
const APP_DIR = join(HOME, '.local', 'share', 'applications');
const CANNED = ['cinnamon', 'cinnamon-desktop-icons', 'spices'];
const APP_NAME = 'Shinon Forge';
const APP_ID = 'shinon-forge';

const args = process.argv.slice(2);
const UNINSTALL = args.includes('--uninstall');
const CHECK = args.includes('--check');
const HELP = args.includes('--help') || args.includes('-h');

if (HELP) {
  console.log('node scripts/desktop-launcher.mjs [--uninstall|--check]');
  console.log('  (ohne Flag)  Einträge schreiben/aktualisieren');
  console.log('  --check      prüfen, ob die Einträge auf die verifizierte Laufzeit zeigen (Exit 1 = veraltet)');
  console.log('  --uninstall  Einträge entfernen');
  process.exit(0);
}

const fail = (msg, code = 1) => {
  console.error(`💥 desktop-launcher: ${msg}`);
  process.exit(code);
};

// ── Fakten sammlen (fail-closed, keine Erraten) ─────────────────────────────
const profileName = repo.activeProfile();
if (profileName === null) fail('kein --profile im dev-Skript (package.json) gefunden');

const dsh = dshBinary();
if (dsh === null) fail('kein Repo-/Vendor-DSH gefunden. Im Repo `npm install` ausführen; globale Nutzung nur mit SHINON_ALLOW_PATH_DSH=1.');
const source = dshSource();

// Die VERIFIZIERTE Laufzeit — nicht der Interpreter dieses Aufrufs.
const runtime = resolveRuntime();
if (runtime.binary === null) {
  fail(`keine taugliche Node-Laufzeit für den Desktop-Eintrag —\n${runtimeFailure(runtime)}`);
}
const node = runtime.binary;
if (!existsSync(node)) fail(`node-Exe nicht gefunden: ${node}`);

const openScript = resolve(ROOT, 'scripts', 'open.mjs');
if (!existsSync(openScript)) fail(`open.mjs fehlt: ${openScript}`);

// Icon: assets/banner.svg liegt im Repo — dort verankern (nicht im HOME).
const iconPath = resolve(ROOT, 'assets', 'banner.svg');
const hasIcon = existsSync(iconPath);

// Exec-Zeile: die verifizierte Node absolut + open.mjs absolut. Path=ROOT ist
// das Arbeitsverzeichnis; DSH_HOME setzt open.mjs selbst aus dem Pfaddienst.
// Beide Pfade sind gequotet, damit ein Arbeitsbaum mit Leerzeichen trägt.
const execLine = `"${node}" "${openScript}"`;

function buildDesktopFile() {
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${APP_NAME}`,
    `GenericName=Shinon Forge DSH-Shell`,
    `Comment=Startet Shinon mit dem aktiven Profil und öffnet die UI im Browser (1-Click, kein Terminal)`,
    `Exec=${execLine}`,
    `Path=${ROOT}`,
    'Terminal=false',
    'StartupNotify=true',
  ];
  if (hasIcon) lines.push(`Icon=${iconPath}`);
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

if (CHECK) {
  // Ist der Eintrag noch gültig? Geprüft wird die Exec-Zeile gegen die JETZT
  // verifizierte Laufzeit — ein Upgrade macht einen alten Eintrag sichtbar.
  const content = buildDesktopFile();
  let stale = 0;
  for (const { path, label } of targets) {
    if (!existsSync(path)) {
      console.log(`  ⏭  ${label}: nicht installiert`);
      continue;
    }
    const existing = readFileSync(path, 'utf8');
    if (existing === content) {
      console.log(`  ✅ ${label}: aktuell (${node})`);
      continue;
    }
    stale += 1;
    console.log(`  ⚠️  ${label}: veraltet — erwartet wird\n      ${execLine}`);
  }
  console.log(stale === 0 ? '\n✅ Desktop-Einträge aktuell.' : '\n💥 Desktop-Einträge veraltet — `npm run desktop:launcher` schreibt sie neu.');
  process.exit(stale === 0 ? 0 : 1);
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
console.log(`  Profil: ${profileName}    dsh: ${source?.kind ?? 'unbekannt'} — ${dsh.slice(1).join(' ')}`);
console.log(`  node:  ${node}`);
console.log(`  DSH_HOME (beim Klick): ${describePaths().dshHome}`);
console.log('═══════════════════════════════════\n');

const content = buildDesktopFile();
let created = 0;
let updated = 0;
for (const { path, label } of targets) {
  mkdirSync(dirname(path), { recursive: true });
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (before === content) {
    console.log(`  = ${label}: unverändert (idempotent) — ${path}`);
    continue;
  }
  writeFileSync(path, content, 'utf8');
  chmodSync(path, 0o755); // .desktop muss ausführbar + trusted sein
  const word = before === null ? 'angelegt' : 'aktualisiert';
  console.log(`  ✅ ${label}: ${word} — ${path}`);
  if (before === null) created += 1;
  else updated += 1;
}

console.log(`\n${created} Einträge angelegt, ${updated} aktualisiert.`);
console.log(`   Laufzeit im Eintrag: ${runtime.version} — ${node}\n`);
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
