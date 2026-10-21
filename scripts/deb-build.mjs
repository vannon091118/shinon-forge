#!/usr/bin/env node
/**
 * deb-build.mjs — das Linux-Mint/Debian-Paket (.deb) aus der gemeinsamen Nutzlast.
 *
 * Warum so und nicht anders:
 *
 *   - Ein Installat braucht einen KLAREN Root: `/opt/shinon-forge`. Zur Laufzeit
 *     ist er read-only (das ist die Zusage, an der die Pfad-Trennung hängt); alle
 *     Nutzerdaten liegen unter XDG (config/data/state/cache), siehe
 *     `scripts/lib/paths.mjs`.
 *   - Das Paket traegt seine Laufzeit MIT: Node (geprueft gegen `engines.node`)
 *     und die Produktions-Abhaengigkeiten aus dem Lockfile. Vorher tat der
 *     `postinst` ein `npm ci` — das Paket lud seinen Inhalt erst beim
 *     Installieren nach, brauchte Netz und ein passendes System-Node, und auf
 *     Mint (Node 18 in der Regel) brach der Start spaeter an `engines`, nicht an
 *     der Installation. Jetzt ist das Paket bei der Installation fertig.
 *   - Kein zweites Installationsformat NEBEN der Nutzlast: kein Flatpak, keine
 *     Kopie daneben. Ein Inhalt, ein Root. Die Huellen um DIESELBE Nutzlast
 *     sind `.deb` (hier), AppImage (`scripts/appimage-build.mjs`) und Windows
 *     (`scripts/win-build.mjs`).
 *
 * Gebaut wird mit `dpkg-deb` (auf Mint vorhanden) und mit denselben
 * Early-Pruning-Regeln wie jeder andere Baumlauf dieses Repos: `node_modules`
 * des Entwicklerbaums, `.git`, `dist`, Cache-, Werkzeug- und Laufzeitordner
 * kommen nicht ins Paket.
 *
 * Die Texte der Huelle (control, postinst, Starter, Menueeintrag) stehen in
 * `scripts/lib/huelle.mjs` — dort kann der Test sie pruefen, ohne ein Paket
 * bauen zu muessen.
 *
 * Aufruf:  node scripts/deb-build.mjs [--out <dir>] [--keep] [--runtime-dir <dir>]
 *          [--no-modules] [--no-runtime]   (Form-Bau ohne Netz und ohne Laufzeit)
 * npm-Entry: `npm run deb`
 * Exit: 0 = Paket gebaut · 1 = Befund (fehlt dpkg-deb, verweigerte Links) ·
 *        2 = Bedienfehler
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as repo from './lib/repo.mjs';
import { buildPayload, payloadViolations } from './lib/payload.mjs';
import { debControl, debDesktopEntry, debPathStarter, debPostinst } from './lib/huelle.mjs';
import { engineRange, floorVersion } from './lib/runtime.mjs';
import { describePaths } from './lib/paths.mjs';

const ROOT = repo.ROOT;
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};
const has = (flag) => args.includes(flag);

const OUT = resolve(valueOf('--out') ?? join(ROOT, 'dist-deb'));
const STAGE = join(OUT, 'stage');
const PAYLOAD = join(STAGE, 'payload');
const INSTALL_ROOT = '/opt/shinon-forge';
const APP_ID = 'shinon-forge';

if (!existsSync('/usr/bin/dpkg-deb')) {
  console.error('💥 deb-build: dpkg-deb fehlt (Debian/Mint: apt install dpkg-dev) — ohne das Werkzeug wird NICHTS als Paket ausgegeben.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = String(manifest.version);
const architecture = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : process.arch;

/** Die mitgelieferte Node-Fassung: die UNTERGRENZE aus `engines.node`. */
const nodeVersion = floorVersion(engineRange(ROOT));

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, 'DEBIAN'), { recursive: true });

console.log(`🔨 deb-build: Nutzlast fuer ${APP_ID} ${version} (Node ${nodeVersion}, ${architecture}) …`);

// `--no-modules` und `--no-runtime` bauen eine FORM ohne die schweren
// Teile: kein `npm ci` (kein Netz, keine 600 MB Abhaengigkeiten) und keine
// Laufzeit. Das ist der Weg, den der Form-Test im Gate braucht — ein Gate-Test
// darf keine zwei Minuten bauen, sonst hungt er die uebrigen Tests aus. Das
// volle Paket baut die CI, und dort wird es installiert und gestartet.
const WITH_MODULES = !has('--no-modules');

const payload = await buildPayload({
  source: ROOT,
  stage: PAYLOAD,
  platform: 'linux',
  arch: process.arch,
  version: nodeVersion,
  modules: WITH_MODULES ? 'npm' : 'skip',
  runtime: has('--no-runtime') ? 'skip' : 'download',
  runtimeDir: valueOf('--runtime-dir'),
  linkMode: 'symlink',
});

const violations = payloadViolations({ stage: PAYLOAD, requireModules: WITH_MODULES });
if (violations.length > 0) {
  console.error(`💥 deb-build: die Nutzlast traegt Verbotenes (${violations.join(', ')}) — kein Paket wird gebaut.`);
  process.exit(1);
}

// Die Nutzlast wandert an ihren Platz im Paket: /opt/shinon-forge.
const target = join(STAGE, 'opt', APP_ID);
mkdirSync(join(STAGE, 'opt'), { recursive: true });
renameSync(PAYLOAD, target);

mkdirSync(join(STAGE, 'usr', 'bin'), { recursive: true });
writeFileSync(join(STAGE, 'usr', 'bin', 'shinon'), debPathStarter({ installRoot: INSTALL_ROOT }), 'utf8');
chmodSync(join(STAGE, 'usr', 'bin', 'shinon'), 0o755);

mkdirSync(join(STAGE, 'usr', 'share', 'applications'), { recursive: true });
writeFileSync(join(STAGE, 'usr', 'share', 'applications', `${APP_ID}.desktop`), debDesktopEntry({ installRoot: INSTALL_ROOT }), 'utf8');
chmodSync(join(STAGE, 'usr', 'share', 'applications', `${APP_ID}.desktop`), 0o644);

writeFileSync(join(STAGE, 'DEBIAN', 'postinst'), debPostinst({ installRoot: INSTALL_ROOT }), 'utf8');
chmodSync(join(STAGE, 'DEBIAN', 'postinst'), 0o755);

const installedSize = (() => {
  let total = 0;
  const stack = [target];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(join(current, entry.name));
      else total += statSync(join(current, entry.name)).size;
    }
  }
  return total;
})();

const control = debControl({
  version,
  architecture,
  sizeKb: Math.ceil(installedSize / 1024),
  installRoot: INSTALL_ROOT,
});
writeFileSync(join(STAGE, 'DEBIAN', 'control'), control, 'utf8');
chmodSync(join(STAGE, 'DEBIAN', 'control'), 0o644);
chmodSync(join(STAGE, 'DEBIAN'), 0o755);

const packageFile = join(OUT, `${APP_ID}_${version}_${architecture}.deb`);
rmSync(packageFile, { force: true });
execFileSync('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', STAGE, packageFile], { stdio: ['ignore', 'inherit', 'inherit'] });

if (!has('--keep')) rmSync(STAGE, { recursive: true, force: true });

const paths = describePaths();
console.log('═══════════════════════════════════');
console.log('  Shinon Forge — .deb gebaut');
console.log(`  Paket:      ${packageFile}`);
console.log(`  Größe:      ${(statSync(packageFile).size / (1024 * 1024)).toFixed(1)} MiB (installiert ${Math.ceil(installedSize / 1024)} KiB)`);
console.log(`  Installat:  ${INSTALL_ROOT} (read-only zur Laufzeit)`);
console.log(`  Laufzeit:   Node ${nodeVersion} (mitgeliefert, geprüft)`);
console.log(`  Starter:    /usr/bin/shinon → ${INSTALL_ROOT}/shinon`);
console.log(`  Menü:       /usr/share/applications/${APP_ID}.desktop`);
console.log(`  Code:       ${payload.code.join(', ')}`);
console.log(`  Buendel:    ${payload.links} Verknuepfungen (relativ, zeigen in packages/)`);
console.log(`  Nutzerdaten (NICHT im Paket): config=${paths.configDir} data=${paths.dataDir} cache=${paths.cacheDir}`);
console.log('  Prüfen:     dpkg-deb -c <paket> · dpkg-deb -f <paket>');
console.log(`  Installieren: sudo dpkg -i ${packageFile}`);
console.log('  Entfernen:  sudo apt remove shinon-forge');
console.log('═══════════════════════════════════');
