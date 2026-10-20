/**
 * desktop-integration.test.mjs — der Starter zeigt auf eine VERIFIZIERTE Laufzeit,
 * und der Mint/Debian-Weg ist ein echter .deb-Build.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17): `desktop-launcher.mjs` setzte den
 * `.desktop`-Start aus `process.execPath` zusammen — dem Interpreter, mit dem der
 * Launcher zufällig gestartet wurde. Ein `.desktop`-Eintrag überlebt den Aufruf,
 * der ihn geschrieben hat: zeigt er danach auf ein untaugliches Node, startet der
 * Klick in einen Fehler, den niemand sieht. Außerdem gab es keinen
 * Paketierungsweg (nur ein Satz im Starter-Plan, nicht im Baum).
 *
 * Gepinnt wird:
 *   1. Exec nennt ABSOLUTE Pfade, und das Node-Binary ist gegen `engines`
 *      verifiziert (gestartet mit dem SYSTEM-Node, der das NICHT ist),
 *   2. die Quoting übersteht eine echte Shell (Arbeitsbaum mit Leerzeichen),
 *   3. der Lauf ist idempotent und `--check` erkennt einen veralteten Eintrag,
 *   4. `--uninstall` entfernt genau die Einträge,
 *   5. `node scripts/deb-build.mjs` baut mit `dpkg-deb` ein echtes Paket nach
 *      /opt/shinon-forge — ohne Fremdbaum und ohne Laufzeitdaten. Geprueft
 *      wird die FORM (`--no-modules --no-runtime`, kein Netz, Sekunden statt
 *      Minuten); das volle Paket mit Laufzeit und Produktionsabhaengigkeiten
 *      baut die CI und wird dort installiert und gestartet.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell. Ohne `dpkg-deb` meldet der
 * Paketteil SICHTBAR „übersprungen mit Grund\" statt grün zu lügen.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { satisfiesRange, engineRange } from '../../lib/runtime.mjs';
import { workspaceRoot } from '../../lib/paths.mjs';

const ROOT = workspaceRoot();
const LAUNCHER = join(ROOT, 'scripts', 'desktop-launcher.mjs');
const HAS_DPKG = existsSync('/usr/bin/dpkg-deb');
/** Der System-Node (auf diesem Mint v18) — genau der, der NICHT in Exec stehen darf. */
const SYSTEM_NODE = '/usr/bin/node';

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'shinon-desktop-'));
  return {
    home,
    env: {
      HOME: home,
      PATH: process.env.PATH,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_DATA_HOME: join(home, '.local', 'share'),
      XDG_CACHE_HOME: join(home, '.cache'),
      XDG_STATE_HOME: join(home, '.local', 'state'),
    },
  };
}

const desktopPath = (home) => join(home, '.local', 'share', 'applications', 'shinon-forge.desktop');
const field = (content, key) => content.split('\n').find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1);

function runLauncher(env, extra = []) {
  return spawnSync(process.execPath, [LAUNCHER, ...extra], { env, encoding: 'utf8' });
}

test('desktop: Exec nennt eine VERIFIZIERTE Node, nicht den Interpreter des Aufrufs', () => {
  const { home, env } = sandbox();
  try {
    // Mit dem SYSTEM-Node starten, wenn es ihn gibt: dann ist beweisbar, dass
    // nicht der Interpreter dieses Aufrufs im Eintrag landet.
    const interpreter = existsSync(SYSTEM_NODE) ? SYSTEM_NODE : process.execPath;
    const brokenRange = !satisfiesRange(execFileSync(interpreter, ['--version'], { encoding: 'utf8' }).trim(), engineRange());
    const run = spawnSync(interpreter, [LAUNCHER], { env, encoding: 'utf8' });
    assert.equal(run.status, 0, `Launcher endete mit ${run.status}: ${run.stderr}`);

    const content = readFileSync(desktopPath(home), 'utf8');
    const exec = field(content, 'Exec');
    const [nodeBin, entry] = exec.split(' ').map((part) => part.replace(/^"|"$/g, ''));
    assert.equal(nodeBin.startsWith('/'), true, `Exec muss absolut sein: ${exec}`);
    assert.equal(entry, join(ROOT, 'scripts', 'open.mjs'), 'der Einstieg steht absolut in Exec');
    assert.equal(field(content, 'Terminal'), 'false', 'kein Terminalfenster');

    // Die Zusage selbst: das genannte Node taugt, das des Aufrufs nicht.
    const version = execFileSync(nodeBin, ['--version'], { encoding: 'utf8' }).trim();
    assert.equal(satisfiesRange(version, engineRange()), true, `${nodeBin} (${version}) passt nicht zu engines`);
    if (brokenRange) assert.notEqual(nodeBin, interpreter, 'der untaugliche Interpreter darf NICHT im Eintrag stehen');
    assert.equal(dirname(nodeBin), join(process.execPath, '..') === dirname(nodeBin) ? dirname(nodeBin) : dirname(nodeBin));

    // Und die Quoting übersteht eine echte Shell (Leerzeichen-Fall).
    const viaShell = spawnSync('/bin/sh', ['-c', `"${nodeBin}" --version`], { encoding: 'utf8' });
    assert.equal(viaShell.status, 0, `die gequotete Exec-Zeile bricht in einer Shell: ${viaShell.stderr}`);
    assert.equal(viaShell.stdout.trim(), version);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('desktop: der Lauf ist idempotent, --check erkennt einen veralteten Eintrag', () => {
  const { home, env } = sandbox();
  try {
    assert.equal(runLauncher(env).status, 0);
    const first = readFileSync(desktopPath(home), 'utf8');

    const again = runLauncher(env);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /unverändert \(idempotent\)/, 'der zweite Lauf schreibt nicht neu');
    assert.equal(readFileSync(desktopPath(home), 'utf8'), first, 'Byte für Byte derselbe Eintrag');

    const check = runLauncher(env, ['--check']);
    assert.equal(check.status, 0, `--check meldet einen gültigen Eintrag: ${check.stderr}`);

    // Ein veralteter Eintrag (fremdes Binary, wie nach einem Runtime-Upgrade)
    // muss auffallen — und der nächste Lauf repariert ihn.
    writeFileSync(desktopPath(home), first.replace(/^Exec=.*$/m, 'Exec="/bin/true" "/bin/false"'), 'utf8');
    const stale = runLauncher(env, ['--check']);
    assert.equal(stale.status, 1, '--check muss den veralteten Eintrag melden');
    assert.match(stale.stdout, /veraltet/);
    assert.equal(runLauncher(env).status, 0, 'der nächste Lauf schreibt ihn neu');
    assert.match(readFileSync(desktopPath(home), 'utf8'), /open\.mjs/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('desktop: --uninstall entfernt genau die Einträge (und ist wiederholbar)', () => {
  const { home, env } = sandbox();
  try {
    assert.equal(runLauncher(env).status, 0);
    assert.equal(existsSync(desktopPath(home)), true);
    assert.equal(runLauncher(env, ['--uninstall']).status, 0);
    assert.equal(existsSync(desktopPath(home)), false, 'der Menüeintrag ist weg');
    const again = runLauncher(env, ['--uninstall']);
    assert.equal(again.status, 0, 'ein zweites Uninstall ist kein Fehler');
    assert.match(again.stdout, /keine Einträge entfernt/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});


/**
 * EIN Mitglied aus dem Dateisystem-tarball eines .deb lesen.
 *
 * Warum der Umweg: `dpkg-deb --fsys-tarfile` liefert den TARBASTROM des
 * Pakets — bei der selbsttragenden Nutzlast rund 800 MiB. Das Ganze in einen
 * Puffer zu ziehen waere Speicherfresse; darum laeuft der Strom durch eine
 * Pipe direkt in `tar -xO`, das nur das eine Mitglied ausgibt.
 */
function readPackageMember(file, member) {
  const result = spawnSync('/bin/sh', ['-c', 'dpkg-deb --fsys-tarfile "$1" | tar -xO "$2"', 'sh', file, member], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Mitglied ${member} nicht lesbar (Exit ${result.status}): ${result.stderr}`);
  }
  return result.stdout;
}

test('desktop: der .deb-Build liefert ein echtes, prüfbares Paket', { skip: HAS_DPKG ? false : 'dpkg-deb fehlt in dieser Umgebung (apt install dpkg-dev)' }, () => {
  const out = mkdtempSync(join(tmpdir(), 'shinon-deb-test-'));
  try {
    // Der FORM-Bau: kein `npm ci`, keine Laufzeit. Zwei Gruende: ein Gate-Test
    // braucht kein Netz, und ein Test, der zwei Minuten baut, hungt die
    // uebrigen (parallel laufenden) Tests aus — das war gemessen: sieben
    // DSH-abhaengige Testdateien fielen dabei um. Das VOLLE Paket (mit
    // Laufzeit und Produktionsabhaengigkeiten) baut die CI, und dort wird es
    // installiert und gestartet; die Form wird hier geprueft.
    const built = spawnSync(process.execPath, [join(ROOT, 'scripts', 'deb-build.mjs'), '--out', out, '--no-modules', '--no-runtime'], { encoding: 'utf8' });
    assert.equal(built.status, 0, `deb-build endete mit ${built.status}: ${built.stderr}`);
    const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
    const architecture = process.arch === 'x64' ? 'amd64' : process.arch;
    const file = join(out, `shinon-forge_${version}_${architecture}.deb`);
    assert.equal(existsSync(file), true, `kein Paket gebaut: ${file}`);

    const control = execFileSync('/usr/bin/dpkg-deb', ['-f', file, 'Package', 'Version', 'Architecture'], { encoding: 'utf8' });
    assert.match(control, /^Package: shinon-forge$/m);
    assert.match(control, new RegExp(`^Version: ${version}$`, 'm'), 'die Fassung kommt aus dem Manifest (eine Quelle)');
    assert.match(control, new RegExp(`^Architecture: ${architecture}$`, 'm'));

    // Die Paketliste ist lang (die Nutzlast traegt die Produktions-
    // abhaengigkeiten MIT), also braucht der Puffer mehr als die Vorgabe.
    const listing = execFileSync('/usr/bin/dpkg-deb', ['-c', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    for (const wanted of [
      './usr/bin/shinon',
      './usr/share/applications/shinon-forge.desktop',
      './opt/shinon-forge/bin/shinon.mjs',
      './opt/shinon-forge/package.json',
      // Die Buendel-Links sind RELATIVE Verknuepfungen auf die Pakete — sie
      // zeigen ins Paket hinein und wandern beim Upgrade mit.
      './opt/shinon-forge/profiles/shinon/node_modules/@shinon/core',
    ]) {
      assert.ok(listing.includes(wanted), `${wanted} fehlt im Paket`);
    }
    // Der Menüeintrag des Pakets zeigt auf den absoluten Starter — gelesen aus
    // dem Paket, nicht aus dem Arbeitsbaum (das ist der Unterschied zwischen
    // „gebaut" und „behauptet"). Gelesen wird EIN Mitglied aus dem Dateisystem-
    // tarball: der ganze Tarball waere ein halber Gigabyte im Speicher.
    const desktop = readPackageMember(file, './usr/share/applications/shinon-forge.desktop');
    assert.match(desktop, /Exec=\/usr\/bin\/shinon/, 'der Menüeintrag startet den absoluten Starter');
    assert.match(desktop, /Terminal=false/);
    // Fremdbaum und Laufzeitdaten kommen NICHT mit; die ENTWICKLER-
    // abhaengigkeiten auch nicht (nur die Produktionsabhaengigkeiten).
    // WICHTIG: die Pfade sind WURZELPFADE. Ein blosses 'sessions/' trifft
    // auch `./opt/shinon-forge/node_modules/@anthropic-ai/sdk/lib/sessions/`
    // — eine Abhaengigkeit, die nichts mit den Sitzungsdaten des Nutzers zu
    // tun hat. Der Pfad muss am Installat-Wurzel liegen.
    for (const forbidden of [
      './opt/shinon-forge/dist/',
      './opt/shinon-forge/sessions/',
      './opt/shinon-forge/storages/',
      './opt/shinon-forge/logs/',
      './opt/shinon-forge/.git/',
    ]) {
      assert.equal(listing.includes(forbidden), false, `${forbidden} liegt im Paket`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
