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
 * Aufruf:  node scripts/desktop-launcher.mjs [--uninstall|--check]
 * npm-Entry: desktop:launcher / desktop:launcher:uninstall
 * Exit: 0 = ok, 1 = Befund (fehlt dsh/node/profil; bei --check: Eintrag veraltet),
 *       2 = Bedienfehler.
 *
 * WAS HIER STEHEN MUSS: der ABSOLUTE Pfad der VERIFIZIERTEN Laufzeit (Version
 * gegen `engines` + `node:sqlite`-Rauchtest). Die frühere Fassung schrieb
 * `process.execPath` — den Interpreter, mit dem der Launcher zufällig gestartet
 * wurde. Ein `.desktop`-Eintrag überlebt den Aufruf, der ihn geschrieben hat;
 * zeigt er danach auf ein untaugliches Node, startet der Klick in einen Fehler,
 * der nirgends sichtbar wird. Und der Eintrag wird bei jedem Lauf neu geprüft:
 * ändert sich die Laufzeit (Upgrade), schreibt der nächste Lauf den Eintrag um.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import * as repo from './lib/repo.mjs';
import { dshBinary, dshSource } from './lib/dsh.mjs';
import { resolveRuntime, runtimeFailure } from './lib/runtime.mjs';
import { describePaths } from './lib/paths.mjs';
import {
  APP_ID,
  APP_NAME,
  checkDesktopEntries,
  desktopEntryText,
  desktopTargets,
  removeDesktopEntries,
  writeDesktopEntries,
} from './lib/desktop-entry.mjs';

const ROOT = repo.ROOT;
const HOME = homedir();

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

// Icon: assets/icon.svg liegt im Repo — dort verankern (nicht im HOME).
// Das ICON ist quadratisch (assets/icon.svg); das breite assets/banner.svg
// ist das Bild im README und wird NICHT als Menue-Icon missbraucht — ein
// 1280x320-Bild als App-Symbol sieht aus wie ein umgefallener Ladezettel.
const iconPath = resolve(ROOT, 'assets', 'icon.svg');
const hasIcon = existsSync(iconPath);

// Exec-Zeile: die verifizierte Node absolut + open.mjs absolut. Path=ROOT ist
// das Arbeitsverzeichnis; DSH_HOME setzt open.mjs selbst aus dem Pfaddienst.
// Beide Pfade sind gequotet, damit ein Arbeitsbaum mit Leerzeichen trägt.
const execLine = `"${node}" "${openScript}"`;

function buildDesktopFile() {
  return desktopEntryText({
    name: APP_NAME,
    genericName: 'Shinon Forge DSH-Shell',
    comment: 'Startet Shinon mit dem aktiven Profil und öffnet die UI im Browser (1-Klick, kein Terminal)',
    exec: execLine,
    path: ROOT,
    icon: hasIcon ? iconPath : null,
    extra: [`X-Shinon-Profile=${profileName}`],
  });
}

const targets = desktopTargets({ home: HOME, appId: APP_ID });

if (CHECK) {
  // Ist der Eintrag noch gültig? Geprüft wird die Exec-Zeile gegen die JETZT
  // verifizierte Laufzeit — ein Upgrade macht einen alten Eintrag sichtbar.
  const content = buildDesktopFile();
  const found = checkDesktopEntries({ content, home: HOME, appId: APP_ID });
  for (const { path, label } of targets) {
    if (found.missing.includes(path)) {
      console.log(`  ⏭  ${label}: nicht installiert`);
      continue;
    }
    if (found.current.includes(path)) {
      console.log(`  ✅ ${label}: aktuell (${node})`);
      continue;
    }
    console.log(`  ⚠️  ${label}: veraltet — erwartet wird\n      ${execLine}`);
  }
  const stale = found.stale.length;
  console.log(stale === 0 ? '\n✅ Desktop-Einträge aktuell.' : '\n💥 Desktop-Einträge veraltet — `npm run desktop:launcher` schreibt sie neu.');
  process.exit(stale === 0 ? 0 : 1);
}

if (UNINSTALL) {
  const removed = removeDesktopEntries({ home: HOME, appId: APP_ID });
  for (const path of removed.removed) console.log(`  🗑  ${path}`);
  console.log(removed.removed.length === 0 ? 'keine Einträge entfernt (nicht installiert)' : `${removed.removed.length} Einträge entfernt`);
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
const written = writeDesktopEntries({ content, home: HOME, appId: APP_ID });
for (const { path, label } of targets) {
  if (written.unchanged.includes(path)) {
    console.log(`  = ${label}: unverändert (idempotent) — ${path}`);
    continue;
  }
  const word = written.created.includes(path) ? 'angelegt' : 'aktualisiert';
  console.log(`  ✅ ${label}: ${word} — ${path}`);
}

console.log(`\n${written.created.length} Einträge angelegt, ${written.updated.length} aktualisiert.`);
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
