/**
 * payload.mjs — DIE Nutzlast, aus der beide Installationspakete entstehen.
 *
 * Warum es diese Datei gibt: es gab zwei Wege, die auseinanderliefen — der
 * Quellklon (git clone + npm ci, `scripts/install-user.mjs`) und der
 * Debian-Weg (`.deb` per `dpkg-deb`, `scripts/deb-build.mjs`) — und keiner
 * von beiden trug die Laufzeit mit sich. Beide holten ihre Abhängigkeiten
 * zur LAUFZEIT nach: der Klon per `npm ci`, das `.deb` per `postinst`. Ein
 * Paket, das beim Installieren erst seinen Inhalt lädt, ist kein Paket,
 * sondern eine Nachricht mit Netzabhängigkeit. Auf Mint ist die Falle
 * doppelt: dort steht oft ein Node, das nicht in die Range passt, also
 * bricht der Start an `engines`, nicht an der Installation.
 *
 * Also: EINE Nutzlast, ZWEI Verpackungen. Die Nutzlast enthaelt den Forge-Code,
 * die PRODUKTIONS-Abhaengigkeiten aus dem Lockfile, die Node-Laufzeit und die
 * Starter. `.deb` (Mint/Ubuntu) und Windows-ZIP sind nur verschiedene
 * Hüllen um denselben Inhalt — die eine nennt den Code, die andere die
 * Startverknuepfung.
 *
 * WAS IN DER NUTZLAST STEHT (und warum):
 *
 *   <root>/package.json, package-lock.json, README.md   der Code, unveraendert
 *   <root>/bin, scripts, packages, profiles, assets, docs   aus dem Baum
 *   <root>/node_modules/          die Produktions-Abhaengigkeiten (npm ci
 *                                 --omit=dev, aus dem Lockfile des Baums)
 *   <root>/profiles/<n>/node_modules/@shinon/*   die Buendel-Links: sie
 *                                 zeigen in `packages/` und sind RELATIV,
 *                                 damit sie beim Umzug mitwandern
 *   <root>/runtime/node/...       die Node-Laufzeit, mitgebracht und geprueft
 *   <root>/runtime/manifest.json  was drin ist: Node-Fassung, Herkunft, Pruefsumme
 *   <root>/shinon, shinon.cmd     die Starter (je Plattform einer)
 *   <root>/install.ps1            der Windows-Weg: kopieren, PATH, Startmenue
 *   <root>/uninstall.ps1          der Windows-Weg zurueck
 *
 * WAS NICHT DRIN IST: `.git`, `dist`, `vendor` (der Vendor-Baum hat keinen
 * Laufzeitleser), `sessions`, `storages`, `logs`, Caches und die
 * Entwickler-Installation (`node_modules` des Arbeitsbaums).
 *
 * Die Node-Fassung ist KEINE zweite Zahl im Baum: sie ist die UNTERGRENZE aus
 * `engines.node` (`scripts/lib/runtime.mjs`), weil ein mitgeliefertes Node
 * garantiert in der Range liegen muss. `floorVersion()` liest die Range und
 * rechnet sie — kein zweites Literal, das veralten kann.
 *
 * Aufrufer: `scripts/deb-build.mjs` (Debian/Mint) und `scripts/win-build.mjs`
 * (Windows). Beide bauen dieselbe Nutzlast und unterscheiden sich nur in der
 * Huelle.
 */

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { isPruned } from './scan.mjs';
import { writeWindowsHelpers } from './huelle.mjs';

/** Was vom Baum in die Nutzlast wandert. Bewusst eine benannte Liste. */
export const PAYLOAD_CODE = Object.freeze([
  'package.json',
  'package-lock.json',
  'README.md',
  'bin',
  'scripts',
  'packages',
  'profiles',
  'assets',
  'docs',
]);

/** Der Ordner der mitgelieferten Laufzeit unterhalb der Nutzlast. */
export const RUNTIME_DIR = 'runtime';

/** Die Nuesse, die ein Paket NICHT enthalten darf — die Gegenprobe. */
export const FORBIDDEN_IN_PAYLOAD = Object.freeze([
  '.git', 'dist', 'vendor', 'sessions', 'storages', 'logs', '.cache', 'coverage',
]);

/** Die Datei, die dem Packer sagt, was in der Nutzlast liegt. */
export const PAYLOAD_MANIFEST = 'manifest.json';

/**
 * Das Ziel eines Node-Archivs. `platform`/`arch` sind die Node-Bezeichner
 * (nicht die des Kernels): `linux`/`win32` und `x64`/`arm64`.
 * @returns {{platform: string, arch: string, slug: string}}
 */
export function nodeTarget(platform, arch) {
  const nodeArch = arch === 'arm64' ? 'arm64' : 'x64';
  const known = ['linux', 'win32', 'darwin'];
  if (!known.includes(platform)) {
    throw new Error(`nodeTarget: unbekannte Plattform "${platform}" (bekannt: ${known.join(', ')})`);
  }
  // Die Archivnamen von nodejs.org nutzen `win` (nicht `win32`):
  // node-v22.19.0-win-x64.zip, node-v22.19.0-linux-x64.tar.xz.
  const archivePlatform = platform === 'win32' ? 'win' : platform;
  return { platform, arch: nodeArch, slug: `${archivePlatform}-${nodeArch}` };
}

/** Der Dateiname des Node-Archivs zu einer Fassung. */
export function nodeArchiveName(version, target) {
  const extension = target.platform === 'win32' ? 'zip' : 'tar.xz';
  return `node-v${version}-${target.slug}.${extension}`;
}

/** Die URLs, aus denen die Laufzeit kommt (offizieller Dist-Server). */
export function nodeDistUrls(version, target) {
  const directory = `https://nodejs.org/dist/v${version}`;
  const archive = nodeArchiveName(version, target);
  return { directory, archive, sums: `${directory}/SHASUMS256.txt`, binary: `${directory}/${archive}` };
}

/** Alle Pfade der Nutzlast an einem Root. */
export function payloadPaths(root) {
  return {
    root,
    code: root,
    modules: join(root, 'node_modules'),
    runtime: join(root, RUNTIME_DIR),
    node: join(root, RUNTIME_DIR, 'node'),
    manifest: join(root, RUNTIME_DIR, PAYLOAD_MANIFEST),
    launcher: join(root, 'shinon'),
    launcherCmd: join(root, 'shinon.cmd'),
  };
}

/**
 * Der Unix-Starter: EIN Aufruf, RELATIVE Pfade.
 *
 * Warum relativ und nicht absolut: die Nutzlast soll wandern koennen. Im .deb
 * liegt sie unter /opt/shinon-forge, im Windows-Archiv zuerst dort, wo der
 * Benutzer es entpackt, und nach `install.ps1` an einem dritten Ort. Ein
 * Starter, der sich selbst sucht, funktioniert an allen drei, ohne dass eine
 * Datei beim Kopieren neu geschrieben werden muss.
 */
export function launcherSh() {
  return `#!/bin/sh
# Von Shinon Forge erzeugt (scripts/lib/payload.mjs). Kein PATH-Ratespiel:
# der Starter sucht sich selbst, damit die Nutzlast wandern darf.
here="$(cd "$(dirname "$0")" && pwd)"
exec "$here/${RUNTIME_DIR}/node/bin/node" "$here/bin/shinon.mjs" "$@"
`;
}

/** Der Windows-Starter: derselbe Aufruf, in der Sprache des Systems. */
export function launcherCmd() {
  return `@echo off
REM Von Shinon Forge erzeugt (scripts/lib/payload.mjs).
setlocal
set "HERE=%~dp0"
"%HERE%${RUNTIME_DIR}\\node\\node.exe" "%HERE%bin\\shinon.mjs" %*
`;
}

/**
 * Den Code des Baums in die Nutzlast legen — mit den Prune-Regeln des Baums.
 * @param {{source: string, stage: string}} options
 * @returns {string[]} die uebernommenen Eintraege
 */
export function stageCode({ source, stage }) {
  const copied = [];
  for (const entry of PAYLOAD_CODE) {
    const from = join(source, entry);
    if (!existsSync(from)) continue;
    const to = join(stage, entry);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, {
      recursive: true,
      dereference: false,
      filter: (current) => {
        const name = current.split('/').pop();
        return !(name !== undefined && name !== entry && isPruned(name));
      },
    });
    copied.push(entry);
  }
  return copied;
}

/**
 * Das npm, das zu diesem Node gehoert.
 *
 * WARUM NICHT einfach 'npm': unter Windows heisst das Programm `npm.cmd`,
 * und ein execFile darauf endet mit `ENOENT` — gemessen im Windows-Bau der
 * CI (Run 39494345164, Job „Paket bauen (Windows-ZIP)"). Es gibt zwei Wege:
 * laeuft der Aufruf ueber `npm run`, kennt die Umgebung `npm_execpath` —
 * dann wird genau dieses npm über den laufenden Node gestartet, ohne
 * Shell-Drehungen. Sonst gilt die Plattformregel: `npm.cmd` unter Windows,
 * `npm` sonst. Dieselbe Regel fuehrt `scripts/install-user.mjs` (dort
 * `npmCommand()`), damit es nicht zwei Regeln im Baum gibt.
 *
 * @returns {{command: string, prefix: string[]}}
 */
export function npmCommand(env = process.env, platform = process.platform) {
  const execpath = env.npm_execpath;
  if (typeof execpath === 'string' && execpath !== '' && existsSync(execpath)) {
    return { command: process.execPath, prefix: [execpath] };
  }
  return { command: platform === 'win32' ? 'npm.cmd' : 'npm', prefix: [] };
}

/**
 * Wie npm gestartet wird — Plattformregel und Shell in EINER Antwort.
 *
 * Die zweite Haelfte ist der gemessene Fehler: `npm.cmd` ist unter Windows eine
 * Stapeldatei, und Node startet Stapeldateien seit dem Sicherheitsfix
 * (CVE-2024-27980, Node >= 18.20/20.12) NUR noch ueber eine Shell. Ohne `shell`
 * endet der Start mit `EINVAL` — nicht mit `ENOENT`. Genau das ist im Windows-Bau
 * der CI passiert (Run 39502642170, Job „Paket bauen (Windows-ZIP)":
 * `spawnSync npm.cmd EINVAL`), waehrend derselbe Code unter Linux gruen war.
 *
 * `shell` gilt deshalb NUR fuer den Stapeldatei-Fall. Laeuft der Aufruf ueber
 * `npm run`, ist das Programm `process.execPath` (node.exe, keine Stapeldatei)
 * und kommt ohne Shell aus — eine Shell dort waere eine zweite Auslegung von
 * Argumenten, die niemand braucht.
 *
 * @returns {{command: string, args: string[], shell: boolean}}
 */
export function npmSpawn(env = process.env, platform = process.platform) {
  const { command, prefix } = npmCommand(env, platform);
  return { command, args: prefix, shell: platform === 'win32' && prefix.length === 0 };
}

/**
 * Die Produktions-Abhaengigkeiten in die Nutzlast legen.
 *
 * `npm ci --omit=dev` im Staging: der Lockfile des Baums ist die Quelle, das
 * Ergebnis ist damit der Baum, den CI ohnehin gebaut hat — nur ohne die
 * Entwicklerpakete. Ein kopierter `node_modules` waere schneller, traegt aber
 * die Entwicklerpakete mit und ist plattformgebunden (falsche native Dateien
 * auf dem Zielsystem).
 *
 * Gestartet wird ueber `spawnSync` mit der Antwort aus `npmSpawn` — nicht mit
 * `execFileSync`, weil das eine Stapeldatei gar nicht erst aufloest.
 * @param {{stage: string, cwd?: string}} options
 */
export function installModules({ stage }) {
  const { command, args, shell } = npmSpawn();
  const result = spawnSync(command, [...args, 'ci', '--omit=dev', '--no-audit', '--no-fund'], {
    shell,
    cwd: stage,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
  if (result.error) {
    throw new Error(`installModules: npm liess sich nicht starten (${result.error.message})`);
  }
  if (result.status !== 0) {
    throw new Error(`installModules: npm ci endete mit Exit ${result.status}`);
  }
  return join(stage, 'node_modules');
}

/**
 * Die Buendel-Links der Profile setzen.
 *
 * DIE QUELLE ist das Profil-Manifest: `dependencies["@shinon/<dir>"]` nennt
 * `link:../../packages/<dir>` — dieselbe Angabe, die `scripts/profile-links.mjs`
 * liest. Zwei Arten, ein Zweck: auf Systemen, die Verknuepfungen koennen
 * (Linux, .deb), sind es RELATIVE Links auf `packages/` — sie zeigen ins Paket
 * und wandern beim Upgrade mit. Auf Windows kann ein ZIP keine Verknuepfung
 * transportieren, also liegen dort echte Verzeichnisse. Beide loesen denselben
 * Namen auf und zeigen auf denselben Code.
 *
 * Fail-closed wie das Werkzeug im Baum: ein Ziel ausserhalb `packages/` wird
 * verweigert (nicht gesetzt, nicht geraten) — ein fremder Pfad wuerde das
 * Repo-Paket beschatten, ohne dass ein Gate es merkt.
 * @param {{stage: string, mode: 'symlink'|'copy'}} options
 * @returns {{count: number, refused: string[]}}
 */
export function linkProfilePackages({ stage, mode }) {
  const profilesDir = join(stage, 'profiles');
  const packagesDir = join(stage, 'packages');
  const refused = [];
  let count = 0;
  if (!existsSync(profilesDir)) return { count, refused };
  for (const profile of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!profile.isDirectory()) continue;
    const manifestPath = join(profilesDir, profile.name, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const scope = join(profilesDir, profile.name, 'node_modules', '@shinon');
    mkdirSync(scope, { recursive: true });
    for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
      if (!name.startsWith('@shinon/')) continue;
      const directory = name.slice('@shinon/'.length);
      const target = resolve(profilesDir, profile.name, String(spec).replace(/^link:/, ''));
      if (target !== packagesDir && !target.startsWith(`${packagesDir}${sep}`)) {
        refused.push(`${profile.name}: ${name} zeigt aus packages/ heraus (${target}) — nicht gesetzt`);
        continue;
      }
      if (!existsSync(target)) {
        refused.push(`${profile.name}: ${name} zeigt auf ein fehlendes Paket (${target}) — nicht gesetzt`);
        continue;
      }
      const link = join(scope, directory);
      rmSync(link, { recursive: true, force: true });
      if (mode === 'symlink') {
        symlinkSync(relative(scope, target), link, 'dir');
      } else {
        cpSync(target, link, { recursive: true, dereference: true });
      }
      count += 1;
    }
  }
  return { count, refused };
}

/**
 * Die Node-Laufzeit holen, pruefen und auspacken.
 *
 * Fail-closed an jeder Stelle: ohne Pruefsumme, ohne die erwartete Datei im
 * Archiv oder ohne passende Version wird nichts installiert. Die Quelle ist
 * der offizielle Dist-Server; die Pruefsumme kommt aus DERSELBEN Verzeichnis
 * und wird gegen die Datei geprueft, die tatsaechlich geladen wurde.
 * @param {{version: string, target: object, into: string, cacheDir?: string}} options
 * @returns {{version: string, sha256: string, source: string}}
 */
export async function fetchNodeRuntime({ version, target, into, cacheDir }) {
  const urls = nodeDistUrls(version, target);
  const cache = cacheDir ?? join(process.cwd(), '.cache', 'node-runtime');
  mkdirSync(cache, { recursive: true });
  const archive = join(cache, urls.archive);

  if (!existsSync(archive)) {
    const response = await fetch(urls.binary);
    if (!response.ok) {
      throw new Error(`Node-Laufzeit: Abruf fehlgeschlagen (${response.status} ${urls.binary})`);
    }
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  }

  const sumsResponse = await fetch(urls.sums);
  if (!sumsResponse.ok) {
    throw new Error(`Node-Laufzeit: Prüfsummenliste nicht abrufbar (${response.status} ${urls.sums})`);
  }
  const sums = await sumsResponse.text();
  const line = sums.split('\n').find((entry) => entry.trim().endsWith(` ${urls.archive}`));
  if (line === undefined) {
    throw new Error(`Node-Laufzeit: ${urls.archive} steht nicht in der Prüfsummenliste — Abbruch statt Rateversuch`);
  }
  const expected = line.trim().split(/\s+/)[0];
  const actual = createHash('sha256').update(readFileSync(archive)).digest('hex');
  if (expected !== actual) {
    throw new Error(`Node-Laufzeit: Prüfsumme weicht ab (erwartet ${expected}, geladen ${actual}) — Abbruch`);
  }

  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });
  extractArchive({ archive, into, format: target.platform === 'win32' ? 'zip' : 'tar.xz' });
  return { version, sha256: actual, source: urls.binary };
}

/**
 * Ein Archiv auspacken — je Format ein Werkzeug, das auf dem Bauhost da ist.
 * @param {{archive: string, into: string, format: 'zip'|'tar.xz'}} options
 */
export function extractArchive({ archive, into, format }) {
  if (format === 'tar.xz') {
    execFileSync('tar', ['-xJf', archive, '-C', into, '--strip-components=1'], { stdio: 'inherit' });
    return;
  }
  // ZIP: unter Windows Expand-Archive, sonst unzip. Beide fuehren zum selben
  // Ergebnis: der Inhalt des einen Top-Level-Ordners liegt in `into`.
  const staging = join(into, '..', 'unpack');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${staging}' -Force`], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-q', '-o', archive, '-d', staging], { stdio: 'inherit' });
  }
  const entries = readdirSync(staging, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (entries.length !== 1) {
    throw new Error(`ZIP-Archiv unerwartet: ${entries.length} Top-Level-Ordner statt einem — Abbruch`);
  }
  for (const entry of readdirSync(join(staging, entries[0].name))) {
    renameSync(join(staging, entries[0].name, entry), join(into, entry));
  }
  rmSync(staging, { recursive: true, force: true });
}

/**
 * Die Nutzlast bauen: Code, Abhaengigkeiten, Links, Laufzeit, Starter.
 * @param {{
 *   source: string, stage: string, platform: string, arch: string, version: string,
 *   modules?: 'npm'|'skip', runtime?: 'download'|'dir'|'skip', runtimeDir?: string,
 *   linkMode?: 'symlink'|'copy',
 * }} options
 * @returns {Promise<{root: string, code: string[], links: number, node: object|null}>}
 */
export async function buildPayload({
  source, stage, platform, arch, version,
  modules = 'npm', runtime = 'download', runtimeDir, linkMode = 'symlink',
}) {
  const paths = payloadPaths(stage);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  const code = stageCode({ source, stage });
  if (modules === 'npm') installModules({ stage });
  const links = linkProfilePackages({ stage, mode: linkMode });
  if (links.refused.length > 0) {
    throw new Error(`buildPayload: Buendel-Links verweigert — ${links.refused.join('; ')}`);
  }

  let node = null;
  if (runtime === 'download') {
    const target = nodeTarget(platform, arch);
    node = await fetchNodeRuntime({ version, target, into: paths.node });
  } else if (runtime === 'dir') {
    if (!runtimeDir || !existsSync(runtimeDir)) {
      throw new Error(`buildPayload: Laufzeitverzeichnis fehlt (${runtimeDir ?? '—'})`);
    }
    rmSync(paths.node, { recursive: true, force: true });
    mkdirSync(dirname(paths.node), { recursive: true });
    cpSync(runtimeDir, paths.node, { recursive: true, dereference: true });
    node = { version, sha256: null, source: runtimeDir };
  }

  writeFileSync(paths.launcher, launcherSh(), 'utf8');
  chmodSync(paths.launcher, 0o755);
  if (platform === 'win32') {
    // Der Windows-Weg traegt seine eigenen Helfer: der Starter, die
    // Installation und die Deinstallation. Ein .deb braucht sie nicht.
    writeFileSync(paths.launcherCmd, launcherCmd(), 'utf8');
    // Die Windows-Helfer (install.ps1, uninstall.ps1) sind INHALT des
    // Archivs; ihren TEXT liefert die Huelle (`scripts/lib/huelle.mjs`).
    writeWindowsHelpers({ stage });
  }

  // Das Manifest liegt unter `runtime/` — der Ordner muss also da sein, auch
  // wenn der Form-Bau (`--no-runtime`) keine Laufzeit mitbringt.
  mkdirSync(dirname(paths.manifest), { recursive: true });
  writeFileSync(paths.manifest, `${JSON.stringify({
    payload: 'shinon-forge',
    version,
    node: node === null ? null : { version: node.version, sha256: node.sha256, source: node.source },
    linkMode,
    code,
    links: links.count,
  }, null, 2)}\n`, 'utf8');

  return { root: stage, code, links: links.count, node };
}

/**
 * Die Gegenprobe: kein verbotener Baum in der Nutzlast.
 *
 * `requireModules` sagt, ob die Produktionsabhaengigkeiten erwartet werden.
 * Der Form-Bau (`--no-modules`) baut bewusst ohne sie — dort waere ihr Fehlen
 * kein Verstoss, sondern der Plan. Das VOLLE Paket verlangt sie: ohne
 * Abhaengigkeiten im Paket muesste der postinst sie nachladen, und genau das
 * ist die Nachricht-mit-Netzabhaengigkeit, die das Paket nicht sein darf.
 * @param {{stage: string, requireModules?: boolean}} options
 * @returns {string[]} die gefundenen Verstoesse (leer = sauber)
 */
export function payloadViolations({ stage, requireModules = true }) {
  const found = [];
  for (const name of FORBIDDEN_IN_PAYLOAD) {
    if (existsSync(join(stage, name))) found.push(name);
  }
  if (requireModules && !existsSync(join(stage, 'node_modules'))) found.push('node_modules (fehlt)');
  if (!existsSync(join(stage, 'bin', 'shinon.mjs'))) found.push('bin/shinon.mjs (fehlt)');
  return found;
}
