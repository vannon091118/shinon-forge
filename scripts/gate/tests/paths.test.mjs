/**
 * paths.test.mjs — EIN Pfaddienst, geprüfte Overrides, getrennte Lebensdauern.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17): `DSH_HOME=$PWD` koppelte
 * Laufzeitzustand an das Repository, `sessions/` und `storages/` lagen im Baum,
 * und der Projektindex lag mit dem dauerhaften Ledger in DERSELBEN Datei unter
 * `~/.shinon/indexes` (einem selbstgewählten Ort ohne Konvention). `.gitignore`
 * verhindert Commits — es isoliert keine Pfade.
 * → Kanon: docs/COMMENT-KANON.md#k-47ea64290546
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  DEFAULT_INSTALL_ROOT,
  cacheDir,
  childEnv,
  configDir,
  dataDir,
  describePaths,
  dshHome,
  indexRoot,
  installRoot,
  isInstalled,
  isInside,
  ledgerFile,
  logDir,
  runtimeEnv,
  stateDir,
  workspaceRoot,
} from '../../lib/paths.mjs';

const HOME = homedir();
/** Eine Umgebung ohne unsere Variablen — der Ausgangszustand der Messung. */
const CLEAN = { HOME, PATH: process.env.PATH };

test('paths: die XDG-Basen tragen die Defaults und den App-Namen', () => {
  assert.equal(configDir(CLEAN), join(HOME, '.config', 'shinon'));
  assert.equal(dataDir(CLEAN), join(HOME, '.local', 'share', 'shinon'));
  assert.equal(stateDir(CLEAN), join(HOME, '.local', 'state', 'shinon'));
  assert.equal(cacheDir(CLEAN), join(HOME, '.cache', 'shinon'));
  assert.equal(logDir(CLEAN), join(HOME, '.local', 'state', 'shinon', 'logs'), 'Logs liegen unter dem Zustand, nicht im Cache');
});

test('paths: XDG_*-Overrides werden respektiert, relative Werte abgelehnt', () => {
  const env = { ...CLEAN, XDG_CONFIG_HOME: '/xdg/config', XDG_DATA_HOME: '/xdg/data', XDG_CACHE_HOME: '/xdg/cache', XDG_STATE_HOME: '/xdg/state' };
  assert.equal(configDir(env), '/xdg/config/shinon');
  assert.equal(dataDir(env), '/xdg/data/shinon');
  assert.equal(cacheDir(env), '/xdg/cache/shinon');
  assert.equal(stateDir(env), '/xdg/state/shinon');

  // Ein RELATIVER Override ist ein Bedienfehler mit Begründung: er zeigte je
  // nach Startordner woandershin (genau die Falle von `DSH_HOME=`).
  assert.throws(() => configDir({ ...CLEAN, SHINON_CONFIG_DIR: 'relativ/pfad' }), /absoluter Pfad/);
  assert.throws(() => indexRoot({ ...CLEAN, SHINON_INDEX_ROOT: './cache' }), /absoluter Pfad/);
  // Ein absoluter Override gewinnt gegen die XDG-Basis.
  assert.equal(cacheDir({ ...CLEAN, XDG_CACHE_HOME: '/xdg/cache', SHINON_CACHE_DIR: '/eigener/cache' }), '/eigener/cache');
});

test('paths: der Arbeitsbaum ist vom Installat getrennt und das Installat ist read-only', () => {
  assert.equal(installRoot(CLEAN), workspaceRoot(), 'ohne Installat ist der Baum das Installat');
  assert.equal(isInstalled(CLEAN), false);

  const installed = { ...CLEAN, SHINON_INSTALL_ROOT: '/opt/shinon-forge' };
  assert.equal(installRoot(installed), '/opt/shinon-forge');
  assert.equal(isInstalled(installed), true);
  assert.equal(DEFAULT_INSTALL_ROOT, '/opt/shinon-forge', 'der .deb baut dorthin');

  // DIE Zusage: kein Laufzeitort liegt unter dem Installat. Sonst schreibt die
  // App in einen read-only Baum (oder in einen, der beim Upgrade ersetzt wird).
  const paths = describePaths(installed);
  for (const key of ['configDir', 'dataDir', 'stateDir', 'cacheDir', 'logDir', 'dshHome', 'indexRoot', 'ledgerFile']) {
    assert.equal(isInside(paths.installRoot, paths[key]), false, `${key} darf nicht im Installat liegen: ${paths[key]}`);
  }
  // Und das DSH-Home eines Installats ist NICHT der read-only Baum (die Zusage
  // selbst steht im Test darunter, hier nur die Trennung).
  assert.notEqual(dshHome(installed), workspaceRoot());
});

test('paths: das DSH-Home folgt DSH, nicht unserer Erfindung', () => {
  // DSH kennt genau einen Knopf (gemessen an dsh-home-paths): DSH_HOME.
  assert.equal(dshHome({ ...CLEAN, DSH_HOME: '/dsh/home' }), '/dsh/home');
  // Der Entwicklerlauf hat sein EIGENES Home: waere er der Baum, liefe dessen
  // AGENTS.md als benutzerglobale Anweisung in jeder fremden Sitzung mit.
  assert.equal(dshHome(CLEAN), join(HOME, '.local', 'state', 'shinon', 'dev-dsh-home'));
  assert.notEqual(dshHome(CLEAN), workspaceRoot(), 'der Baum ist nie das Home');
  // Als Installat ist der Baum gesperrt — dann der Zustandsordner.
  assert.equal(
    dshHome({ ...CLEAN, SHINON_INSTALL_ROOT: '/opt/shinon-forge' }),
    join(HOME, '.local', 'state', 'shinon', 'dsh-home'),
  );
  // Ein relativer DSH_HOME wird abgelehnt (dieselbe Regel wie oben).
  assert.throws(() => dshHome({ ...CLEAN, DSH_HOME: 'relativ' }), /absoluter Pfad/);
});

test('paths: Index (Cache) und Ledger (Daten) sind physisch getrennt', () => {
  const paths = describePaths(CLEAN);
  assert.equal(paths.indexRoot, join(HOME, '.cache', 'shinon', 'indexes'), 'der Index ist wiederherstellbar → Cache');
  assert.equal(paths.ledgerFile, join(HOME, '.local', 'share', 'shinon', 'ledger.sqlite'), 'der Ledger ist Nutzerdaten → Daten');
  assert.equal(isInside(paths.cacheDir, paths.ledgerFile), false, 'der Ledger liegt NICHT im Cache');
  assert.equal(isInside(paths.dataDir, paths.indexRoot), false, 'der Index liegt NICHT in den Daten');

  const env = { ...CLEAN, SHINON_INDEX_ROOT: '/eigener/index', SHINON_LEDGER_FILE: '/eigener/ledger.sqlite' };
  assert.equal(indexRoot(env), '/eigener/index');
  assert.equal(ledgerFile(env), '/eigener/ledger.sqlite');
});

test('paths: runtimeEnv setzt genau die Variablen, die unsere Host-Hälften lesen', () => {
  const env = runtimeEnv(CLEAN);
  // Das Home ist getrennt; `profiles/` erreicht es ueber die Verknuepfung, die der
  // Starter seeded (`scripts/lib/dsh-home.mjs`), nicht ueber den Baum selbst.
  assert.equal(env.DSH_HOME, join(HOME, '.local', 'state', 'shinon', 'dev-dsh-home'));
  assert.equal(env.SHINON_INDEX_ROOT, indexRoot(CLEAN));
  assert.equal(env.SHINON_LEDGER_FILE, ledgerFile(CLEAN));
  assert.equal(env.PATH, CLEAN.PATH, 'runtimeEnv rührt den PATH nicht an');

  // childEnv: daraus plus dem verifizierten Node vorn im PATH.
  const withNode = childEnv({ binary: '/pfad/zu/node' }, CLEAN);
  assert.match(withNode.PATH, /^\/pfad\/zu/, 'das VERZEICHNIS des Binary steht vorn (dort liegt node)');
  assert.ok(withNode.PATH.split(':')[0] === '/pfad/zu', `nicht ${withNode.PATH.split(':')[0]}`);
  assert.equal(withNode.DSH_HOME, env.DSH_HOME);
});

test('paths: isInside kennt die Präfix-Falle', () => {
  assert.equal(isInside('/opt/x', '/opt/x/y'), true);
  assert.equal(isInside('/opt/x', '/opt/x'), true);
  assert.equal(isInside('/opt/x', '/opt/xy'), false, '/opt/xy beginnt mit /opt/x, liegt aber nicht darin');
  // Der „.."-Fall wird aufgelöst, nicht per Präfix geraten: /opt/x/../opt/x/z
  // ist /opt/opt/x/z und liegt damit AUSSERHALB von /opt/x.
  assert.equal(isInside('/opt/x', '/opt/x/../opt/x/z'), false);
  assert.equal(isInside('/opt/x', resolve('/opt/x/./y')), true, 'ein "." bleibt im Baum');
});
