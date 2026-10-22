/**
 * packaging.test.mjs — die Installationspakete: eine Nutzlast, zwei Huellen.
 *
 * Warum es diesen Test gibt: die Pakete sind die Antwort auf die Frage
 * "welche Fassung bekomme ich?" — also muessen sie beweisbar sein, nicht
 * behauptet. Vorher gab es einen `.deb`-Bau, der beim Installieren erst seinen
 * Inhalt nachlud (`npm ci` im `postinst`), ein `npm run deb`, das es nicht gab,
 * und gar nichts fuer Windows. Der Test pinnt die Entscheidungen, die daraus
 * folgen:
 *
 *   1. die mitgelieferte Node-Fassung ist die UNTERGRENZE aus `engines.node`
 *      (kein zweites Literal im Baum),
 *   2. die Starter suchen sich SELBST (die Nutzlast darf wandern),
 *   3. das `.deb` zwingt KEIN System-Node (Mint haette sonst Node 18 gebraucht),
 *   4. weder `postinst` noch `install.ps1` laden etwas nach — ein Paket, das
 *      beim Installieren erst seinen Inhalt laedt, ist kein Paket,
 *   5. die Nutzlast traegt den Code, die relativen Buendel-Links und einen
 *      Manifest, und die Gegenprobe findet einen verbotenen Baum,
 *   6. der Windows-Weg traegt Starter, Installation und Deinstallation — und
 *      keine Verknuepfung (ein ZIP transportiert keine).
 *
 * Laeuft mit `node --test`; kein Netz, kein dpkg-deb, kein Paketbau. Der BAU
 * gehoert in die CI (`.github/workflows/package-build.yml`), nicht in einen Test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildPayload, launcherCmd, launcherSh, nodeArchiveName, nodeTarget, npmCommand, npmSpawn, payloadViolations,
} from '../../lib/payload.mjs';
import {
  appImageDesktopEntry, appRunSh, debControl, debDesktopEntry, debPathStarter, debPostinst, installPs1, uninstallPs1,
} from '../../lib/huelle.mjs';
import { engineRange, floorVersion, satisfiesRange } from '../../lib/runtime.mjs';
import { workspaceRoot } from '../../lib/paths.mjs';

const ROOT = workspaceRoot();
const WORKFLOW = join(ROOT, '.github', 'workflows', 'package-build.yml');

/** Ein tmp-Verzeichnis, das nach dem Test wieder weg ist. */
function scratch(name) {
  const dir = join(tmpdir(), `shinon-packaging-${name}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('die mitgelieferte Node-Fassung ist die Untergrenze aus engines.node', () => {
  const range = engineRange(ROOT);
  const floor = floorVersion(range);
  assert.equal(floor, '22.19.0', `die Untergrenze von "${range}"`);
  assert.equal(satisfiesRange(range, floor), true, 'die mitgelieferte Fassung liegt in der Range');
  // Und sie ist eine Ableitung, keine zweite Zahl: eine Range ohne lesbaren
  // Ausdruck ist ein Fehler, kein Raten.
  assert.throws(() => floorVersion('unsinn'), /nicht lesbar/);
});

test('die Archivnamen sind die offiziellen von nodejs.org', () => {
  assert.equal(nodeArchiveName('22.19.0', nodeTarget('linux', 'x64')), 'node-v22.19.0-linux-x64.tar.xz');
  assert.equal(nodeArchiveName('22.19.0', nodeTarget('linux', 'arm64')), 'node-v22.19.0-linux-arm64.tar.xz');
  assert.equal(nodeArchiveName('22.19.0', nodeTarget('win32', 'x64')), 'node-v22.19.0-win-x64.zip');
  assert.equal(nodeArchiveName('22.19.0', nodeTarget('win32', 'arm64')), 'node-v22.19.0-win-arm64.zip');
  assert.throws(() => nodeTarget('plan9', 'x64'), /unbekannte Plattform/);
});

test('die Starter suchen sich selbst — die Nutzlast darf wandern', () => {
  const sh = launcherSh();
  assert.match(sh, /dirname "\$0"/, 'der Starter leitet seinen Ort ab');
  assert.match(sh, /runtime\/node\/bin\/node/, 'er startet die MITGELIEFERTE Laufzeit');
  assert.match(sh, /bin\/shinon\.mjs/, 'er startet den Forge-Einstieg');
  assert.doesNotMatch(sh, /\/opt\/shinon-forge/, 'kein fest verdrahteter Root im Starter');

  const cmd = launcherCmd();
  assert.match(cmd, /%~dp0/, 'der Windows-Starter leitet seinen Ort ab');
  assert.match(cmd, /runtime\\node\\node\.exe/, 'er startet die mitgelieferte Laufzeit');
  assert.match(cmd, /bin\\shinon\.mjs/, 'er startet den Forge-Einstieg');
});

test('das .deb zwingt kein System-Node und laedt nichts nach', () => {
  const control = debControl({ version: '0.4.0', architecture: 'amd64', sizeKb: 1, installRoot: '/opt/shinon-forge' });
  assert.match(control, /^Package: shinon-forge$/m);
  assert.match(control, /^Version: 0\.4\.0$/m);
  assert.doesNotMatch(control, /^Depends:/m, 'die Laufzeit liegt im Paket, kein System-Node-Zwang');

  const postinst = debPostinst({ installRoot: '/opt/shinon-forge' });
  assert.doesNotMatch(postinst, /npm ci|npm install|curl|wget/, 'der postinst installiert nichts nach');
  assert.match(postinst, /runtime\/node\/bin\/node/, 'er prueft die mitgelieferte Laufzeit');

  const starter = debPathStarter({ installRoot: '/opt/shinon-forge' });
  assert.match(starter, /exec "\/opt\/shinon-forge\/shinon"/, 'der Starter im PATH zeigt auf die Nutzlast');

  const desktop = debDesktopEntry({ installRoot: '/opt/shinon-forge' });
  assert.match(desktop, /^Exec=\/usr\/bin\/shinon$/m, 'der Menueeintrag zeigt auf den Starter im PATH');
  assert.match(desktop, /^Terminal=false$/m);
});

test('der Windows-Weg laedt nichts nach und kennt Install und Deinstallation', () => {
  const install = installPs1();
  assert.doesNotMatch(install, /Invoke-WebRequest|Start-BitsTransfer|npm ci|npm install/, 'alles liegt bereits im Archiv');
  assert.match(install, /SetEnvironmentVariable\('Path'/, 'der Zielordner kommt in den Benutzer-PATH');
  assert.match(install, /CreateShortcut/, 'es entstehen Startmenue-Verknuepfungen');
  assert.match(install, /runtime\\node\\node\.exe/, 'die mitgelieferte Laufzeit wird geprueft');

  const remove = uninstallPs1();
  assert.match(remove, /Remove-Item/, 'die Deinstallation entfernt');
  assert.match(remove, /Start Menu/, 'die Deinstallation kennt den Startmenue-Ordner');
  assert.match(remove, /Nutzerdaten.*unberuehrt/s, 'die Nutzerdaten bleiben unberuehrt');
});

test('die Nutzlast traegt Code, relative Buendel-Links und ein Manifest', async () => {
  const dir = scratch('layout');
  const stage = join(dir, 'payload');
  const runtime = join(dir, 'fake-node');
  mkdirSync(join(runtime, 'bin'), { recursive: true });
  writeFileSync(join(runtime, 'bin', 'node'), '#!/bin/sh\n', 'utf8');

  const built = await buildPayload({
    source: ROOT,
    stage,
    platform: 'linux',
    arch: 'x64',
    version: '22.19.0',
    modules: 'skip',
    runtime: 'dir',
    runtimeDir: runtime,
    linkMode: 'symlink',
  });

  assert.equal(built.links > 0, true, 'die Buendel-Links sind gesetzt');
  for (const entry of ['package.json', 'bin/shinon.mjs', 'packages/core/package.json', 'profiles/shinon/package.json']) {
    assert.equal(existsSync(join(stage, entry)), true, `${entry} liegt in der Nutzlast`);
  }
  assert.equal(existsSync(join(stage, 'shinon')), true, 'der Starter liegt in der Nutzlast');
  assert.equal(existsSync(join(stage, 'runtime', 'node', 'bin', 'node')), true, 'die Laufzeit liegt in der Nutzlast');

  // Die Buendel-Links sind RELATIV und zeigen in packages/ — sonst wuerde ein
  // fremder Pfad das Repo-Paket beschatten (dieselbe Regel wie im Baum).
  const link = join(stage, 'profiles', 'shinon', 'node_modules', '@shinon', 'core');
  assert.equal(lstatSync(link).isSymbolicLink(), true, 'der Buendel-Link ist eine Verknuepfung');
  const target = readlinkSync(link);
  assert.equal(target.startsWith('/'), false, `der Link ist absolut (${target}) — er muss wandern koennen`);
  assert.match(target, /packages[/\\]core$/, `der Link zeigt in packages/ (${target})`);

  // Das Manifest nennt, was drin ist.
  const manifest = JSON.parse(readFileSync(join(stage, 'runtime', 'manifest.json'), 'utf8'));
  assert.equal(manifest.node.version, '22.19.0');
  assert.equal(manifest.links, built.links);
  assert.equal(manifest.code.includes('packages'), true);

  // Die Gegenprobe: ohne node_modules (hier bewusst uebersprungen) meldet sie
  // genau das — und einen verbotenen Baum findet sie too.
  const violations = payloadViolations({ stage });
  assert.equal(violations.includes('node_modules (fehlt)'), true, `die Gegenprobe sieht den fehlenden Baum (${violations.join(', ')})`);
  mkdirSync(join(stage, '.git'), { recursive: true });
  assert.equal(payloadViolations({ stage }).includes('.git'), true, 'die Gegenprobe sieht einen verbotenen Baum');

  rmSync(dir, { recursive: true, force: true });
});

test('die Windows-Nutzlast traegt ihre Helfer und keine Verknuepfung', async () => {
  const dir = scratch('windows');
  const stage = join(dir, 'payload');
  const runtime = join(dir, 'fake-node');
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(runtime, 'node.exe'), 'MZ', 'utf8');

  await buildPayload({
    source: ROOT,
    stage,
    platform: 'win32',
    arch: 'x64',
    version: '22.19.0',
    modules: 'skip',
    runtime: 'dir',
    runtimeDir: runtime,
    linkMode: 'copy',
  });

  assert.equal(existsSync(join(stage, 'shinon.cmd')), true, 'der Windows-Starter liegt in der Nutzlast');
  assert.equal(existsSync(join(stage, 'install.ps1')), true, 'die Installation liegt in der Nutzlast');
  assert.equal(existsSync(join(stage, 'uninstall.ps1')), true, 'die Deinstallation liegt in der Nutzlast');
  assert.equal(existsSync(join(stage, 'runtime', 'node', 'node.exe')), true, 'die mitgelieferte Laufzeit liegt in der Nutzlast');

  // Keine Verknuepfung: ein ZIP transportiert sie nicht.
  const link = join(stage, 'profiles', 'shinon', 'node_modules', '@shinon', 'core');
  assert.equal(lstatSync(link).isSymbolicLink(), false, 'im Windows-Archiv liegen echte Verzeichnisse');
  assert.equal(existsSync(join(link, 'package.json')), true, 'das Buendel-Paket liegt vollstaendig');

  rmSync(dir, { recursive: true, force: true });
});

test('der Windows-Weg kopiert nicht in sich selbst', () => {
  const install = installPs1();
  // Der Vergleich geht auf den ZIELORDNER. Vorher verglich er das Eltern-
  // verzeichnis: wer das Archiv direkt in den Zielordner entpackte, bekam
  // ein Kopieren in sich selbst.
  assert.match(install, /\$TargetPath/, 'der Zielordner wird aufgeloest');
  assert.match(install, /TrimEnd/, 'der Vergleich normalisiert den Pfad');
  assert.doesNotMatch(install, /Split-Path -Parent \$TargetDir/, 'nicht mehr das Elternverzeichnis');
});

test('der Paketbau gehoert in die CI, nicht in den Arbeitsbaum', () => {
  assert.equal(existsSync(WORKFLOW), true, `der Workflow liegt unter ${WORKFLOW}`);
  const workflow = readFileSync(WORKFLOW, 'utf8');

  // Zwei Bauhosts, weil die Abhaengigkeiten plattformgebunden sind: ein auf
  // Linux gebautes Windows-Archiv traegt Linux-Binaerdateien.
  assert.match(workflow, /runs-on: ubuntu-latest/, 'der Linux-Bau');
  assert.match(workflow, /runs-on: windows-latest/, 'der Windows-Bau');
  assert.match(workflow, /node scripts\/deb-build\.mjs/, 'der .deb wird gebaut');
  assert.match(workflow, /node scripts\/win-build\.mjs/, 'das Windows-ZIP wird gebaut');

  // Der Trigger: jeder Push auf main.
  assert.match(workflow, /branches: \[main\]/, 'der Bau laeuft bei jedem Push auf main');

  // Und der Nachweis: ein gebautes Paket ist noch kein installierbares.
  assert.match(workflow, /dpkg -i/, 'das .deb wird auch installiert');
  assert.match(workflow, /install\.ps1/, 'der Windows-Weg wird auch gelaufen');
  assert.match(workflow, /uninstall\.ps1/, 'und wieder abgebaut');

  // Kein gebautes Paket im Baum.
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(manifest.scripts.deb ?? '', /deb-build\.mjs/, 'npm run deb');
  assert.match(manifest.scripts.win ?? '', /win-build\.mjs/, 'npm run win');
  assert.equal(manifest.scripts['package:all'], undefined, 'kein Combined-Bau: der Windows-Bau laeuft auf Windows');
});

test('das AppImage traegt dieselbe Nutzlast, eine eigene Huelle und ein Icon', () => {
  // Der AppRun startet den Unix-Starter der Nutzlast — relativ zu sich selbst,
  // weil das Laufzeitsystem das Abbild nach /tmp mountet.
  const apprun = appRunSh({ payloadDir: 'usr/lib/shinon-forge' });
  assert.match(apprun, /^#!\/bin\/sh$/m, 'der AppRun ist ein Shell-Skript');
  assert.match(apprun, /dirname "\$0"/, 'der AppRun leitet seinen Ort ab');
  assert.match(apprun, /usr\/lib\/shinon-forge\/shinon"/, 'er startet den Starter der Nutzlast');
  assert.doesNotMatch(apprun, /\/opt\/shinon-forge|\/tmp\//, 'kein fest verdrahteter Pfad');

  // Der Menueeintrag im Abbild: Exec=AppRun ist die Konvention, Icon=<Name>
  // muss zu der Datei an der Wurzel passen (assets/icon.svg -> shinon-forge.svg).
  const desktop = appImageDesktopEntry();
  assert.match(desktop, /^Exec=AppRun$/m, 'der Eintrag zeigt relativ auf den AppRun');
  assert.match(desktop, /^Icon=shinon-forge$/m, 'das Icon heisst wie die Datei an der Wurzel');
  assert.match(desktop, /^Terminal=false$/m);
  assert.equal(existsSync(join(ROOT, 'assets', 'icon.svg')), true, 'das Icon liegt im Repo');

  // Das AppImage-Skript nutzt dieselbe Nutzlast wie das .deb — kein zweiter
  // Inhalt. Die Gleichheit ist ueber den gemeinsamen Baumeister gesichert.
  const appimage = readFileSync(join(ROOT, 'scripts', 'appimage-build.mjs'), 'utf8');
  assert.match(appimage, /buildPayload\(/, 'das AppImage baut ueber dieselbe Nutzlast');
  assert.match(appimage, /payloadViolations\(/, 'und prueft dieselben Verbote');
  assert.match(appimage, /APPIMAGETOOL/, 'das Werkzeug kommt aus APPIMAGETOOL oder dem PATH');
  assert.match(appimage, /process\.exit\(1\)/, 'ohne Werkzeug endet der Bau mit Befund');

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.appimage ?? '', /appimage-build\.mjs/, 'npm run appimage');

  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^dist-appimage\/$/m, 'das Ausgabeverzeichnis ist ignoriert');
});

test('der AppImage-Bau gehoert in die CI, mit Nachweis und ohne lokalen Bau', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');
  assert.match(workflow, /^  appimage:$/m, 'es gibt einen eigenen AppImage-Job');
  assert.match(workflow, /node scripts\/appimage-build\.mjs/, 'der Job baut das AppImage');
  assert.match(workflow, /APPIMAGETOOL/, 'der Job setzt das Werkzeug');
  // Der Nachweis: das Abbild wird entpackt, die mitgelieferte Laufzeit geprueft
  // und der Starter im Abbild aufgerufen — ohne FUSE (CI-Runner haben keins).
  assert.match(workflow, /--appimage-extract/, 'das Abbild wird entpackt');
  assert.match(workflow, /APPIMAGE_EXTRACT_AND_RUN=1/, 'der Start laeuft ohne FUSE');
  assert.match(workflow, /squashfs-root\/usr\/lib\/shinon-forge\/runtime\/node\/bin\/node --version/, 'die Laufzeit im Abbild');
  assert.match(workflow, /shinon-forge-appimage-x64/, 'der Artefakt-Name');
  // Die Pruefsumme laeuft wie bei den anderen Paketen.
  assert.match(workflow, /AppImage\.sha256|\.AppImage"\s*>\s*"\$f\.sha256"|sha256sum "\$f"/, 'die Pruefsumme wird abgelegt');
  // Der Release-Job wartet auf alle drei Pakete.
  assert.match(workflow, /needs: \[deb, windows, appimage\]/, 'der Release-Anhang wartet auf das AppImage');
});

test('der Paketbau nimmt das npm, das zu diesem Node gehoert', () => {
  // Gemessen: der Windows-Bau der CI (Run 39494345164) endete mit
  // `spawnSync npm ENOENT` — unter Windows heisst das Programm `npm.cmd`, und
  // ein execFile darauf findet es nicht.
  const withoutExecpath = npmCommand({});
  if (process.platform === 'win32') {
    assert.equal(withoutExecpath.command, 'npm.cmd', 'unter Windows ist es npm.cmd');
  } else {
    assert.equal(withoutExecpath.command, 'npm', 'unter Linux ist es npm');
  }
  assert.deepEqual(withoutExecpath.prefix, [], 'ohne npm_execpath gibt es keinen Praefix');

  // Mit npm_execpath (also unter `npm run`) wird genau dieses npm ueber den
  // laufenden Node gestartet — ohne Shell und ohne zweite Regel.
  const script = join(ROOT, 'scripts', 'lib', 'payload.mjs');
  const withExecpath = npmCommand({ npm_execpath: script });
  assert.equal(withExecpath.command, process.execPath, 'der laufende Node startet das npm');
  assert.deepEqual(withExecpath.prefix, [script], 'und zwar genau das genannte npm');
});

test('die Stapeldatei braucht eine Shell, und nur sie', () => {
  // Gemessen im Windows-Bau der CI (Run 39502642170, Job „Paket bauen
  // (Windows-ZIP)"): `spawnSync npm.cmd EINVAL`. Node startet Stapeldateien seit
  // dem Sicherheitsfix (CVE-2024-27980) nur noch ueber eine Shell; derselbe Code
  // war unter Linux gruen. Die Regel ist deshalb: Shell GENAU dann, wenn eine
  // Stapeldatei gestartet wird — nicht pauschal auf Windows.
  assert.deepEqual(npmSpawn({}, 'win32'), { command: 'npm.cmd', args: [], shell: true }, 'unter Windows: npm.cmd mit Shell');
  assert.deepEqual(npmSpawn({}, 'linux'), { command: 'npm', args: [], shell: false }, 'unter Linux: npm ohne Shell');

  // Laeuft der Aufruf ueber `npm run`, ist das Programm der laufende Node — eine
  // ausfuehrbare Datei, keine Stapeldatei. Dann waere eine Shell eine zweite
  // Auslegung der Argumente, die niemand braucht.
  const script = join(ROOT, 'scripts', 'lib', 'payload.mjs');
  const viaNode = npmSpawn({ npm_execpath: script }, 'win32');
  assert.equal(viaNode.command, process.execPath);
  assert.deepEqual(viaNode.args, [script]);
  assert.equal(viaNode.shell, false, 'node.exe braucht keine Shell');
});
