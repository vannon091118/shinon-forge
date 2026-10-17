#!/usr/bin/env node
/**
 * deb-build.mjs — ein reproduzierbares Linux-Mint/Debian-Paket (.deb).
 *
 * Warum so und nicht anders:
 *
 *   - Ein Installat braucht einen KLAREN Root: `/opt/shinon-forge`. Zur Laufzeit
 *     ist er read-only (das ist die Zusage, an der die Pfad-Trennung hängt); alle
 *     Nutzerdaten liegen unter XDG (config/data/state/cache), siehe
 *     `scripts/lib/paths.mjs`.
 *   - Das Tarball-Paket ist NICHT dabei: `node_modules` (gemessen: dreistellige
 *     MB) gehört nicht in ein .deb dieser Größenordnung. Stattdessen liefert das
 *     Paket den Code plus eine Anweisung (`postinst`), die Abhängigkeiten einmal
 *     mit `npm ci --omit=dev` in den Root zu ziehen — den Pfad nennt der
 *     Starter selbst, wenn er fehlt.
 *   - Kein zweites Installationsformat: kein AppImage, kein Flatpak, keine
 *     Kopie daneben. Ein Weg, ein Root.
 *
 * Gebaut wird AUSSCHLIESSLICH mit `dpkg-deb` (auf Mint vorhanden) und mit
 * denselben Early-Pruning-Regeln wie jeder andere Baumlauf dieses Repos:
 * `node_modules`, `.git`, `dist`, Cache-, Werkzeug- und Laufzeitordner kommen
 * nicht ins Paket.
 *
 * Aufruf:  node scripts/deb-build.mjs [--out <dir>] [--keep]
 * npm-Entry: `npm run deb`
 * Exit: 0 = Paket gebaut · 1 = Befund (fehlt dpkg-deb) · 2 = Bedienfehler
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import * as repo from './lib/repo.mjs';
import { PRUNE_DIRS, isPruned } from './lib/scan.mjs';
import { installRoot as installRootOf, describePaths, workspaceRoot } from './lib/paths.mjs';

const ROOT = repo.ROOT;
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};
const OUT = resolve(valueOf('--out') ?? join(ROOT, 'dist-deb'));
const STAGE = join(OUT, 'stage');
const INSTALL_ROOT = '/opt/shinon-forge';
const APP_ID = 'shinon-forge';

if (!existsSync('/usr/bin/dpkg-deb')) {
  console.error('💥 deb-build: dpkg-deb fehlt (Debian/Mint: apt install dpkg-dev) — ohne das Werkzeug wird NICHTS als Paket ausgegeben.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = String(manifest.version);
const architecture = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : process.arch;

/**
 * Was ins Paket geht. Absichtlich eine kurze, benannte Liste — kein „alles außer
 * .git\": der Code, die Profile, die Assets und die Startskripte. Was fehlt, ist
 * benannt: node_modules (postinst), dist (wird beim ersten Lauf gebaut), alle
 * Laufzeitordner.
 */
const PAYLOAD = ['package.json', 'README.md', 'bin', 'scripts', 'packages', 'profiles', 'assets', 'prompts', 'docs'];

/** Eine Datei/Ordner in den Stage kopieren — mit den gemeinsamen Prune-Regeln. */
function copyInto(relativePath) {
  const source = join(ROOT, relativePath);
  if (!existsSync(source)) return false;
  const target = join(STAGE, 'opt', APP_ID, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    dereference: false,
    filter: (from) => {
      const name = from.split('/').pop();
      // Early Pruning gilt auch hier: kein Fremdbaum, kein Cache, keine Daten.
      return !(name !== undefined && name !== relativePath && isPruned(name));
    },
  });
  return true;
}

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, 'DEBIAN'), { recursive: true });

const copied = PAYLOAD.filter((entry) => copyInto(entry));
// Kein Fremdbaum im Paket — die Gegenprobe, damit die Regel nicht nur behauptet ist.
for (const forbidden of ['node_modules', '.git', 'dist', 'sessions', 'storages']) {
  const path = join(STAGE, 'opt', APP_ID, forbidden);
  if (existsSync(path)) {
    console.error(`💥 deb-build: ${forbidden} liegt im Stage — das gehört nicht ins Paket`);
    process.exit(1);
  }
}

/** Der Starter: EIN Einstieg, der den absoluten Root kennt und Node verifiziert. */
const launcher = `#!/bin/sh
# Von Shinon Forge erzeugt (scripts/deb-build.mjs). Kein PATH-Ratespiel:
# der Einstieg im Installat wird absolut angesprochen, und das Node-Binary
# wählt bin/shinon.mjs selbst (verifiziert gegen engines + node:sqlite).
exec node "${INSTALL_ROOT}/bin/shinon.mjs" "$@"
`;
mkdirSync(join(STAGE, 'usr', 'bin'), { recursive: true });
writeFileSync(join(STAGE, 'usr', 'bin', 'shinon'), launcher, 'utf8');
chmodSync(join(STAGE, 'usr', 'bin', 'shinon'), 0o755);

/**
 * Der Menüeintrag des PAKETS. Er zeigt auf `/usr/bin/shinon` (einen absoluten
 * Pfad, der beim Upgrade mitwandert) und NICHT auf einen Interpreter, den ein
 * zufälliger Aufruf mitbrachte. Die Nutzer-Ebene
 * (`npm run desktop:launcher`) schreibt zusätzlich Einträge mit dem verifizierten
 * Node — dieser hier ist die Paketvariante.
 */
const desktop = [
  '[Desktop Entry]',
  'Type=Application',
  'Name=Shinon Forge',
  'GenericName=Shinon Forge DSH-Shell',
  'Comment=Startet Shinon Forge (aktives Profil, UI im Browser)',
  `Exec=/usr/bin/shinon`,
  `Path=${INSTALL_ROOT}`,
  'Terminal=false',
  'StartupNotify=true',
  `Icon=${INSTALL_ROOT}/assets/banner.svg`,
  'Categories=Development;IDE;',
  'Keywords=shinon;dsh;agent;',
  '',
].join('\n');
mkdirSync(join(STAGE, 'usr', 'share', 'applications'), { recursive: true });
writeFileSync(join(STAGE, 'usr', 'share', 'applications', `${APP_ID}.desktop`), desktop, 'utf8');
chmodSync(join(STAGE, 'usr', 'share', 'applications', `${APP_ID}.desktop`), 0o644);

/** Die Abhängigkeiten holt der postinst — einmal, mit dem Projekt-Lockfile. */
const postinst = `#!/bin/sh
set -e
cd ${INSTALL_ROOT}
if [ ! -d node_modules/@deepseek-ai/dsh ]; then
  echo "Shinon Forge: Abhängigkeiten werden einmalig installiert (npm ci --omit=dev)…"
  npm ci --omit=dev --no-audit --no-fund || {
    echo "Shinon Forge: 'npm ci' scheiterte — im Verzeichnis ${INSTALL_ROOT} manuell ausführen." >&2
  }
fi
# Das Installat ist zur Laufzeit READ-ONLY: Nutzerdaten liegen unter XDG.
exit 0
`;
writeFileSync(join(STAGE, 'DEBIAN', 'postinst'), postinst, 'utf8');
chmodSync(join(STAGE, 'DEBIAN', 'postinst'), 0o755);

const installedSize = (() => {
  const walk = (dir) => {
    let total = 0;
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) stack.push(join(current, entry.name));
        else total += statSync(join(current, entry.name)).size;
      }
    }
    return total;
  };
  return walk(STAGE);
})();

const control = [
  `Package: ${APP_ID}`,
  `Version: ${version}`,
  'Section: devel',
  'Priority: optional',
  'Architecture: ' + architecture,
  'Depends: nodejs (>= 22.19.0)',
  'Maintainer: Shinon Forge <noreply@shinon.invalid>',
  `Installed-Size: ${Math.ceil(installedSize / 1024)}`,
  'Description: Shinon Forge - DSH-Shell mit eigenem Profil',
  ' Ein Overlay aus Cordis-Bundles (@shinon/*) mit eigenem Profil, Gate-Engine',
 ' und Startskripten. Der Code liegt unter ' + INSTALL_ROOT + ', Nutzerdaten',
  ' unter XDG (config/data/state/cache).',
  '',
].join('\n');
writeFileSync(join(STAGE, 'DEBIAN', 'control'), control, 'utf8');

const packageFile = join(OUT, `${APP_ID}_${version}_${architecture}.deb`);
rmSync(packageFile, { force: true });
execFileSync('dpkg-deb', ['--root-owner-group', '--build', STAGE, packageFile], { stdio: ['ignore', 'inherit', 'inherit'] });

const paths = describePaths();
console.log('═══════════════════════════════════');
console.log('  Shinon Forge — .deb gebaut');
console.log(`  Paket:      ${packageFile}`);
console.log(`  Größe:      ${(statSync(packageFile).size / 1024).toFixed(0)} KiB (installiert ${Math.ceil(installedSize / 1024)} KiB)`);
console.log(`  Installat:  ${INSTALL_ROOT} (read-only zur Laufzeit)`);
console.log(`  Starter:    /usr/bin/shinon → ${INSTALL_ROOT}/bin/shinon.mjs`);
console.log(`  Menü:       /usr/share/applications/${APP_ID}.desktop`);
console.log(`  Kopiert:    ${copied.join(', ')}`);
console.log(`  Nutzerdaten (NICHT im Paket): config=${paths.configDir} data=${paths.dataDir} cache=${paths.cacheDir}`);
console.log('  Prüfen:     dpkg-deb -c <paket> · dpkg-deb -f <paket>');
console.log(`  Installieren: sudo dpkg -i ${packageFile}`);
console.log('═══════════════════════════════════');
if (installRootOf() !== INSTALL_ROOT) {
  console.log(`  Hinweis: dieses System hat kein Installat unter ${INSTALL_ROOT} (Entwicklerlauf: ${workspaceRoot()}).`);
}
