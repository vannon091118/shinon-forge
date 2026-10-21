#!/usr/bin/env node
/**
 * appimage-build.mjs — das AppImage aus der gemeinsamen Nutzlast.
 *
 * Warum ein AppImage NEBEN dem .deb: es laeuft auf Distributionen ohne
 * Paketrecht fuer Mint/Debian (Fedora, Arch, Live-Systeme) und braucht keine
 * Installation. Es ist aber KEIN zweiter Inhalt. Dieselbe Nutzlast wie
 * `scripts/deb-build.mjs` (`buildPayload`, Node-Laufzeit, Produktions-
 * Abhaengigkeiten aus dem Lockfile, Starter) wandert in das AppDir unter
 * `usr/lib/shinon-forge`. Was sich aendert, ist nur die Huelle: AppRun,
 * Menueeintrag und Icon an der Wurzel des Abbilds.
 *
 * Gebaut wird mit `appimagetool` (Pfad ueber `APPIMAGETOOL` oder PATH). Das
 * Werkzeug fehlt auf dem Entwicklerrechner — der Bau laeuft in der CI
 * (`.github/workflows/package-build.yml`, Job `appimage`). Fehlt es, endet das
 * Skript mit Exit 1 und gibt nichts aus: ein halbes AppDir ohne Werkzeug waere
 * genau das „sieht richtig aus, startet nicht“, das diese Pakete verhindern.
 *
 * Das AppImage traegt keine Laufzeitabhaengigkeit nach aussen: das
 * Laufzeitsystem mountet das Abbild, der AppRun startet den Starter der
 * Nutzlast, und die Nutzerdaten liegen unter XDG wie bei den anderen Wegen
 * (`scripts/lib/paths.mjs`) — nichts wird neben dem Abbild geschrieben.
 *
 * Aufruf:  node scripts/appimage-build.mjs [--out <dir>] [--keep]
 *          [--runtime-dir <dir>] [--no-modules] [--no-runtime]
 * npm-Entry: `npm run appimage`
 * Exit: 0 = AppImage gebaut · 1 = Befund (fehlt appimagetool, verbotene
 *       Inhalte, nicht unterstuetzte Architektur) · 2 = Bedienfehler
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import * as repo from './lib/repo.mjs';
import { buildPayload, payloadViolations } from './lib/payload.mjs';
import { appImageDesktopEntry, appRunSh } from './lib/huelle.mjs';
import { engineRange, floorVersion } from './lib/runtime.mjs';
import { describePaths } from './lib/paths.mjs';

const ROOT = repo.ROOT;
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};
const has = (flag) => args.includes(flag);

const APP_ID = 'shinon-forge';
const OUT = resolve(valueOf('--out') ?? join(ROOT, 'dist-appimage'));
const STAGE = join(OUT, 'stage');
const APPDIR = join(OUT, 'AppDir');
/** Die Nutzlast im AppDir: dieselbe Lage wie `/opt/shinon-forge` im .deb, nur unter `usr/lib`. */
const PAYLOAD_REL = join('usr', 'lib', APP_ID);

/** AppImage-Architekturnamen: x86_64 bzw. aarch64. Alles andere ist ein Befund, kein Raten. */
const APPIMAGE_ARCH = { x64: 'x86_64', arm64: 'aarch64' }[process.arch];

/** appimagetool suchen: erst `APPIMAGETOOL`, dann der PATH. Fehlt es, null — nie ein Stillstand. */
function findTool() {
  const explicit = process.env.APPIMAGETOOL;
  if (explicit) return existsSync(explicit) ? explicit : null;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && existsSync(join(dir, 'appimagetool'))) return join(dir, 'appimagetool');
  }
  return null;
}

const tool = findTool();
if (!tool) {
  console.error('💥 appimage-build: appimagetool fehlt — setze APPIMAGETOOL=<pfad> oder lege es auf den PATH. Ohne das Werkzeug wird NICHTS als AppImage ausgegeben (die CI holt es: .github/workflows/package-build.yml, Job appimage).');
  process.exit(1);
}
if (!APPIMAGE_ARCH) {
  console.error(`💥 appimage-build: Architektur ${process.arch} hat keinen AppImage-Namen — kein Abbild wird gebaut.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = String(manifest.version);

/** Die mitgelieferte Node-Fassung: die UNTERGRENZE aus `engines.node`, wie beim .deb. */
const nodeVersion = floorVersion(engineRange(ROOT));

rmSync(STAGE, { recursive: true, force: true });
rmSync(APPDIR, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

console.log(`🔨 appimage-build: Nutzlast fuer ${APP_ID} ${version} (Node ${nodeVersion}, ${APPIMAGE_ARCH}) …`);

// `--no-modules` und `--no-runtime` bauen wie beim .deb eine FORM ohne die
// schweren Teile. Das volle Abbild baut die CI.
const WITH_MODULES = !has('--no-modules');
const payloadStage = join(STAGE, 'payload');

const payload = await buildPayload({
  source: ROOT,
  stage: payloadStage,
  platform: 'linux',
  arch: process.arch,
  version: nodeVersion,
  modules: WITH_MODULES ? 'npm' : 'skip',
  runtime: has('--no-runtime') ? 'skip' : 'download',
  runtimeDir: valueOf('--runtime-dir'),
  linkMode: 'symlink',
});

const violations = payloadViolations({ stage: payloadStage, requireModules: WITH_MODULES });
if (violations.length > 0) {
  console.error(`💥 appimage-build: die Nutzlast traegt Verbotenes (${violations.join(', ')}) — kein AppImage wird gebaut.`);
  process.exit(1);
}

// AppDir: Nutzlast, AppRun, Menueeintrag und Icon an der Wurzel — so verlangt
// es appimagetool.
const payloadTarget = join(APPDIR, PAYLOAD_REL);
mkdirSync(join(APPDIR, 'usr', 'lib'), { recursive: true });
renameSync(payloadStage, payloadTarget);

const appRun = join(APPDIR, 'AppRun');
writeFileSync(appRun, appRunSh({ payloadDir: PAYLOAD_REL }), 'utf8');
chmodSync(appRun, 0o755);

const desktopFile = join(APPDIR, `${APP_ID}.desktop`);
writeFileSync(desktopFile, appImageDesktopEntry(), 'utf8');
chmodSync(desktopFile, 0o644);

// Das Icon liegt im Repo (`assets/icon.svg`); es wird als `<Icon>.svg` an die
// Wurzel kopiert, damit der Menueeintrag `Icon=shinon-forge` findet.
copyFileSync(join(ROOT, 'assets', 'icon.svg'), join(APPDIR, `${APP_ID}.svg`));

const installedSize = (() => {
  let total = 0;
  const stack = [payloadTarget];
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

const packageFile = join(OUT, `${APP_ID}-${version}-${APPIMAGE_ARCH}.AppImage`);
rmSync(packageFile, { force: true });
// `APPIMAGE_EXTRACT_AND_RUN=1`: appimagetool selbst laeuft ohne FUSE, wie auf
// CI-Runnern ohne FUSE-Modul. `ARCH` nennt die Zielarchitektur explizit.
execFileSync(tool, [APPDIR, packageFile], {
  env: { ...process.env, ARCH: APPIMAGE_ARCH, APPIMAGE_EXTRACT_AND_RUN: '1' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
chmodSync(packageFile, 0o755);

if (!has('--keep')) {
  rmSync(STAGE, { recursive: true, force: true });
  rmSync(APPDIR, { recursive: true, force: true });
}

const paths = describePaths();
console.log('═══════════════════════════════════');
console.log('  Shinon Forge — AppImage gebaut');
console.log(`  Abbild:     ${packageFile}`);
console.log(`  Größe:      ${(statSync(packageFile).size / (1024 * 1024)).toFixed(1)} MiB (Payload ${Math.ceil(installedSize / 1024)} KiB)`);
console.log(`  Laufzeit:   Node ${nodeVersion} (mitgeliefert, geprüft)`);
console.log(`  Einstieg:   AppRun → ${PAYLOAD_REL}/shinon`);
console.log(`  Menü:       ${APP_ID}.desktop (Exec=AppRun, Icon=${APP_ID})`);
console.log(`  Code:       ${payload.code.join(', ')}`);
console.log(`  Buendel:    ${payload.links} Verknuepfungen (relativ, zeigen in packages/)`);
console.log(`  Nutzerdaten (NICHT im Abbild): config=${paths.configDir} data=${paths.dataDir} cache=${paths.cacheDir}`);
console.log('  Prüfen:     ./<abbild> --appimage-extract');
console.log('═══════════════════════════════════');
