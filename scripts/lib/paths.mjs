/**
 * paths.mjs — EIN Pfaddienst für alle Laufzeitorte von Shinon Forge.
 *
 * Warum es diese Datei gibt: bisher setzte jedes Startskript `DSH_HOME=<Repo-Root>`,
 * und DSH legt seinen Laufzeitzustand (sessions/, storages/, logs/) genau dort
 * ab. Im Arbeitsbaum ist das bequem, für ein installiertes, schreibgeschütztes
 * Installat unmöglich — und `dist/`-Scans sowie Sitzungssuchen liefen über
 * Laufzeitdaten im Repo. Namen entstehen hier EINMAL; wer einen Ort braucht,
 * ruft hier an, statt einen Pfad zu wiederholen.
 *
 * Was DSH selbst unterstützt (gemessen an der gepinnten Fassung
 * `@deepseek-ai/dsh-home-paths`, nicht erfunden): genau EIN Knopf,
 * `DSH_HOME` — Home = `$DSH_HOME`, sonst `~/.dsh`. Weitere DSH_*-Variablen gibt
 * es dort nicht (`DSH_LAUNCH_ENVIRONMENT_KEY` und `DSH_TELEMETRY_DISABLED`
 * betreffen den Start bzw. die Telemetrie, keine Pfade). Deshalb:
 *
 *   - DSHs eigene Orte bleiben DSHs Sache: `dshHome()` nennt nur das Home.
 *   - UNSERE Artefakte (Index, Ledger, Logs) folgen der OS-Konvention (XDG auf
 *     Linux, AppData auf Windows) — DSH liest sie nicht, also darf es sie auch
 *     nicht definieren.
 *
 * Rollen (keine zwei Orte für dieselbe Sache):
 *   workspaceRoot()  der Arbeitsbaum (dieser Klon) — darf Laufzeitdaten tragen
 *   installRoot()    das Installat (/opt/shinon-forge) — zur Laufzeit READ-ONLY
 *   configDir()      Einstellungen     XDG_CONFIG_HOME  ~/.config/shinon
 *   dataDir()        dauerhafte Daten  XDG_DATA_HOME    ~/.local/share/shinon
 *   stateDir()       Zustand           XDG_STATE_HOME   ~/.local/state/shinon
 *   cacheDir()       WEGWERFBAR        XDG_CACHE_HOME   ~/.cache/shinon
 *   logDir()         Protokolle        <stateDir>/logs
 *   dshHome()        DSH-Home (Profil + DSHs eigener Zustand)
 *   indexRoot()      WEGWERFBARER Projektindex   <cacheDir>/indexes
 *   ledgerFile()     DAUERHAFTES Scoring-Protokoll <dataDir>/ledger.sqlite
 *
 * Overrides werden geprüft: nur absolute Pfade zählen, ein relativer Wert ist ein
 * Bedienfehler mit Begründung (kein stilles Auflösen gegen das Arbeitsverzeichnis
 * — das war die Falle, die `DSH_HOME=` auf das CWD zeigen ließ).
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Arbeitsbaum: scripts/lib/ → zwei Ebenen hoch. */
export const WORKSPACE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Name unter den OS-Basen (config/data/cache). */
export const APP_DIR_NAME = 'shinon';

/** Standard-Installationsroot eines .deb-Installats. */
export const DEFAULT_INSTALL_ROOT = '/opt/shinon-forge';

const PLATFORM = process.platform;
const HOME = homedir();

/**
 * Ein absoluter Pfad-Override aus der Umgebung, oder `null`.
 *
 * Ein relativer Wert ist KEIN Kandidat: er würde gegen das aktuelle
 * Arbeitsverzeichnis aufgelöst, und ein Start aus einem anderen Ordner zeigte
 * dann auf ein anderes Ziel. Fail-closed mit dem Namen der Variablen und dem
 * abgelehnten Wert — der Aufrufer meldet das, statt zu raten.
 * @throws {Error} wenn die Variable gesetzt, aber nicht absolut ist.
 */
function absoluteOverride(name, env = process.env) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return null;
  if (!isAbsolute(raw)) {
    throw new Error(`${name} muss ein absoluter Pfad sein, ist aber "${raw}" — relative Pfade zeigen je nach Startordner woandershin`);
  }
  return resolve(raw.trim());
}

/**
 * Der Override, sonst die OS-Basis, sonst der dokumentierte Default.
 * Die Heimat-Basen liefert das Betriebssystem (XDG auf Linux, AppData auf
 * Windows, Library auf macOS) — dieselbe Konvention, die DSH für `~/.dsh` nutzt.
 */
function baseDir(kind, env) {
  const override = absoluteOverride(`SHINON_${kind.toUpperCase()}_DIR`, env);
  if (override !== null) return override;

  if (PLATFORM === 'win32') {
    const roaming = absoluteOverride('APPDATA', env) ?? join(HOME, 'AppData', 'Roaming');
    const local = absoluteOverride('LOCALAPPDATA', env) ?? join(HOME, 'AppData', 'Local');
    if (kind === 'config') return join(roaming, APP_DIR_NAME);
    if (kind === 'cache') return join(local, APP_DIR_NAME, 'cache');
    return join(local, APP_DIR_NAME, kind);
  }
  if (PLATFORM === 'darwin') {
    if (kind === 'cache') return join(HOME, 'Library', 'Caches', APP_DIR_NAME);
    if (kind === 'config') return join(HOME, 'Library', 'Application Support', APP_DIR_NAME);
    return join(HOME, 'Library', 'Application Support', APP_DIR_NAME, kind);
  }
  // Linux und andere freedesktop-Systeme: XDG-Basis, sonst der XDG-Default.
  const variable = kind === 'config' ? 'XDG_CONFIG_HOME' : kind === 'cache' ? 'XDG_CACHE_HOME' : kind === 'state' ? 'XDG_STATE_HOME' : 'XDG_DATA_HOME';
  const fallback = kind === 'config' ? '.config' : kind === 'cache' ? '.cache' : kind === 'state' ? '.local/state' : '.local/share';
  return join(absoluteOverride(variable, env) ?? join(HOME, fallback), APP_DIR_NAME);
}

/** Der Arbeitsbaum — der Ort, an dem dieses Skript liegt. */
export function workspaceRoot() {
  return WORKSPACE_ROOT;
}

/**
 * Das Installat: Override, sonst `/opt/shinon-forge`, wenn dort ein Manifest
 * liegt, sonst der Arbeitsbaum (Entwicklerlauf). Zur Laufzeit ist ein echtes
 * Installat READ-ONLY — wer dort schreiben will, hat den falschen Ort gewählt.
 */
export function installRoot(env = process.env) {
  const override = absoluteOverride('SHINON_INSTALL_ROOT', env);
  if (override !== null) return override;
  if (existsSync(join(DEFAULT_INSTALL_ROOT, 'package.json'))) return DEFAULT_INSTALL_ROOT;
  return WORKSPACE_ROOT;
}

/** `true`, wenn das Installat NICHT der Arbeitsbaum ist (dann read-only gedacht). */
export function isInstalled(env = process.env) {
  return installRoot(env) !== WORKSPACE_ROOT;
}

/**
 * Der Pfad, den das Dateisystem wirklich kennt — Symlinks aufgeloest.
 * `~/.local/opt` ist auf dieser Maschine ein Link auf die SSD; wer nur den
 * Pfad vergleicht, vergleicht zwei Schreibweisen desselben Ortes und
 * erkennt ihn nicht.
 * @param {string} path
 * @returns {string}
 */
function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Der Zustand des Installats: welcher Baum ist als Installat registriert?
 * Das Werkzeug `scripts/install-user.mjs` schreibt ihn; er ist die einzige
 * Stelle, die weiss, dass ein Baum ein NUTZER-Installat ist.
 * @param {object} [env]
 * @returns {{installDir: string}|null}
 */
function installState(env = process.env) {
  try {
    const parsed = JSON.parse(readFileSync(join(stateDir(env), 'install-state.json'), 'utf8'));
    return typeof parsed?.installDir === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * `true`, wenn dieser Baum das registrierte NUTZER-Installat ist.
 *
 * WARUM DAS EIGENTLICH NÖTIG WAR (gemessen am 2026-10-21): die Trennung
 * „Entwicklerbaum hat .git, ein Installat nicht" gilt nur für das Paket unter
 * /opt. Das Nutzer-Installat ist ein KLON und hat .git — es wurde also als
 * Entwicklerbaum erkannt, benutzte das Home des Entwicklerbaums und stolperte
 * über dessen Verknüpfungen. Der Zustand des Installats sagt die Wahrheit:
 * er nennt das Verzeichnis, das als Installat registriert wurde.
 * @param {object} [env]
 * @returns {boolean}
 */
export function isInstallat(env = process.env) {
  const state = installState(env);
  if (state === null) return false;
  return realPath(state.installDir) === realPath(WORKSPACE_ROOT);
}

/** Einstellungen (XDG_CONFIG_HOME bzw. AppData). */
export function configDir(env = process.env) {
  return baseDir('config', env);
}

/** Dauerhafte Nutzerdaten (XDG_DATA_HOME bzw. LOCALAPPDATA). */
export function dataDir(env = process.env) {
  return baseDir('data', env);
}

/** Laufzeitzustand (XDG_STATE_HOME). */
export function stateDir(env = process.env) {
  return baseDir('state', env);
}

/** Wegwerfbare Daten (XDG_CACHE_HOME). */
export function cacheDir(env = process.env) {
  return baseDir('cache', env);
}

/** Protokolle — unter dem Zustand, damit sie beim Cache-Aufräumen bleiben. */
export function logDir(env = process.env) {
  return join(stateDir(env), 'logs');
}

/**
 * Das DSH-Home: `DSH_HOME` (DSHs eigener, gemessener Knopf), sonst ein
 * Zustandsordner — NIE der Arbeitsbaum.
 *
 * Warum nicht der Baum, obwohl er `profiles/` trägt: DSH liest `$DSH_HOME/AGENTS.md`
 * als benutzerglobale Anweisung in JEDER Session. Mit dem Repo als Home wurde
 * dessen `AGENTS.md` zur globalen Anweisung fremder Projekte (gemessen
 * 2026-10-17). Profil, Sitzungen und Schlüssel erreichen das Home über
 * Verknüpfungen (`scripts/lib/dsh-home.mjs`), die Anweisungsdatei nicht.
 */
export function dshHome(env = process.env) {
  const explicit = absoluteOverride('DSH_HOME', env);
  if (explicit !== null) return explicit;
  // Zwei Bäume, zwei Homes: der Entwicklerbaum ist der Arbeitsbaum, das
  // Installat ist der registrierte Nutzer-Installat oder das Paket unter /opt.
  // Ohne diese Trennung würden Repo und Installat dasselbe Home seeden — und der
  // zweite Start fände die Verknüpfungen des ersten (die niemand überschreibt).
  const devTree = !isInstalled(env) && !isInstallat(env) && existsSync(join(WORKSPACE_ROOT, '.git'));
  return join(stateDir(env), devTree ? 'dev-dsh-home' : 'dsh-home');
}

/** Wegwerfbarer Projektindex (jederzeit neu baubar). */
export function indexRoot(env = process.env) {
  return absoluteOverride('SHINON_INDEX_ROOT', env) ?? join(cacheDir(env), 'indexes');
}

/** Dauerhaftes Scoring-Protokoll (Nutzersignale — NICHT wegwerfbar). */
export function ledgerFile(env = process.env) {
  return absoluteOverride('SHINON_LEDGER_FILE', env) ?? join(dataDir(env), 'ledger.sqlite');
}

/**
 * Alle Orte als Daten — für Meldungen, Tests und den Launcher.
 * Reihenfolge und Namen sind stabil; wer eine Zeile braucht, liest sie hier.
 */
export function describePaths(env = process.env) {
  return {
    workspaceRoot: workspaceRoot(),
    installRoot: installRoot(env),
    installed: isInstalled(env),
    installat: isInstallat(env),
    configDir: configDir(env),
    dataDir: dataDir(env),
    stateDir: stateDir(env),
    cacheDir: cacheDir(env),
    logDir: logDir(env),
    dshHome: dshHome(env),
    indexRoot: indexRoot(env),
    ledgerFile: ledgerFile(env),
  };
}

/**
 * Der Umgebungsblock für einen Start: dieselben Orte für DSH (Home) und für
 * unsere Pakete (Index-Cache, Ledger-Daten). EINE Quelle — der Starter setzt
 * hier, was die Host-Hälften lesen; die Pakete wiederholen keinen Pfad.
 */
export function runtimeEnv(env = process.env) {
  return {
    ...env,
    DSH_HOME: dshHome(env),
    SHINON_INDEX_ROOT: indexRoot(env),
    SHINON_LEDGER_FILE: ledgerFile(env),
  };
}

/**
 * Der PATH-Block für Kindprozesse: das Verzeichnis des VERIFIZIERTEN Node zuerst,
 * danach `node_modules/.bin` (dort liegt `dsh`), dann der geerbte PATH.
 *
 * Das ist die Ursache des `spawn node ENOENT`: ein geerbter, gekürzter oder
 * überschriebener PATH ließ `spawn('node')`/`spawn('npm')` ins Leere laufen. Wer
 * einen Node-Kindprozess startet, nimmt den absoluten Pfad — und wenn ein
 * Fremdwerkzeug seinen Namen selbst auflösen muss, findet es ihn hier.
 */
export function pathWith(entries, env = process.env) {
  const existing = (env.PATH ?? '').split(delimiter).filter((part) => part !== '');
  const merged = [...entries, ...existing].filter((part, at, list) => part !== '' && list.indexOf(part) === at);
  return merged.join(delimiter);
}

/** Der PATH mit dem verifizierten Node und `node_modules/.bin` vornedran. */
export function childEnv(runtime, env = process.env) {
  const extra = [dirname(runtime.binary), join(WORKSPACE_ROOT, 'node_modules', '.bin')];
  return { ...runtimeEnv(env), PATH: pathWith(extra, env) };
}

/** Ein Pfad liegt in einem anderen (keine Präfix-Treffer wie /opt/x vs /opt/xy). */
export function isInside(parent, child) {
  const base = resolve(parent);
  const target = resolve(child);
  return target === base || target.startsWith(base.endsWith('/') ? base : `${base}/`);
}
