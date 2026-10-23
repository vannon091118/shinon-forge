#!/usr/bin/env node
/**
 * scripts/install-user.mjs — der wiederholbare Weg in ein NUTZER-Installat.
 *
 * Warum es dieses Werkzeug gibt: der dokumentierte Installationsweg war eine
 * handgetippte Kette (`git clone`, `npm ci`, `npm run profile:links`, Boot von
 * Hand). Handarbeit ist nicht wiederholbar: niemand weiß später, welcher Stand
 * läuft, ein misslungenes Update hinterlässt einen halbfertigen Baum, und ob
 * der neue Stand überhaupt startet, merkt man erst am Bildschirm. Dieses
 * Werkzeug macht aus der Kette einen Befehl und aus dem Start eine Abnahme.
 *
 * Vier Unterbefehle, ein Zustand:
 *
 *   install    Klon (falls nötig), Checkout des Ziels, `npm ci`, Profil-Links,
 *              Abnahme. Zieht standardmäßig `origin/main` (git fetch), nicht
 *              den lokalen Arbeitsbaum — ein Installat soll den veröffentlichten
 *              Stand tragen.
 *   update     derselbe Ablauf; ist der Stand schon aktuell, wird nur die
 *              Abnahme gefahren (kein sinnloses Neuinstallieren von 621 Paketen).
 *   rollback   Neuinstallation des vorherigen Standes (`--to <sha>` auch frei
 *              wählbar) aus dem Lockfile — sparsam auf der Platte, braucht Netz.
 *   status     was läuft, welcher Stand davor liegt, was die letzte Abnahme sagte.
 *   history    das dauerhafte Protokoll aller Abnahmen als Tabelle (oder --json).
 *   auto       der Timer-Lauf: neuen Stand in ein STAGING bauen, dort abnehmen
 *              und das Live-Verzeichnis erst bei grünem Urteil umschalten.
 *   units      den systemd-User-Timer schreiben/entfernen, der `auto` aufruft.
 *   selftest   der Ein-Befehl-Selbsttest (auch `npm run verify:install`): check,
 *              doctor, Boot und HTTP-Nachweis gegen einen bestehenden Stand.
 *              READ-ONLY — kein Checkout, kein `npm ci`, keine Zustandsänderung,
 *              kein Rückweg; Exit 0 nur bei vollständiger Kette (4/4), sonst 1.
 *
 * WARUM ES `auto` NEBEN `update` GIBT (gemessener Unterschied, keine Kosmetik):
 * `update` installiert IN das laufende Verzeichnis und prüft danach — für die
 * Dauer des `npm ci` steht dort ein ungeprüfter Stand, und ein rotes Urteil
 * muss danach zurückgerollt werden. `auto` baut den Kandidaten daneben, nimmt
 * IHN ab und benennt erst dann um (zwei `rename`s, kein Kopieren). Ein rotes
 * Urteil kostet damit nichts: das Live-Installat hat den Kandidaten nie
 * gesehen. Nach der Umschaltung wird der neue Ort erneut abgenommen; ist sie
 * rot, tauschen dieselben zwei Umbenennungen zurück.
 *
 * Jede Abnahme wird in `<stateDir>/logs/verify-log.jsonl` geschrieben — eine
 * Zeile je Lauf, ohne Geheimnisse (kein Token, keine Schlüssel): Stand, Trigger,
 * Boot-Dauer, Gesamtdauer, Plugins, Fehlerzahl, HTTP-Bytes, Ergebnis. Damit
 * lassen sich Boot-Zeiten und Fehlerzeilen über Versionen vergleichen, statt
 * sich auf die Erinnerung an den letzten Bildschirm zu verlassen.
 *
 * ROT HEISST NICHT STEHENBLEIBEN: besteht ein neu installierter Stand die
 * Abnahme nicht, kehrt der Befehl von selbst auf den letzten GRÜNEN Stand
 * zurück (der zuletzt abgenommene, nicht bloß der vorherige), installiert ihn
 * aus dessen Lockfile und prüft ihn erneut. Der Exit-Code bleibt 1 — das
 * Update ist gescheitert und soll nicht als Erfolg durchgehen —, aber das
 * Installat steht wieder auf einem belegten Stand. Der Rückweg wird in der
 * Historie als `auto-rollback` geführt. `--no-rollback` schaltet die
 * Selbstheilung aus, wenn jemand den roten Stand untersuchen will.
 *
 * Die Abnahme ist der Kern, nicht ein Anhängsel: `shinon --check`, `shinon
 * doctor`, dann ein echter Boot auf Loopback mit eigenem Port, Warten auf
 * `dsh web:`, HTTP-Nachweis (Token → Sitzung → Seite) und Zählung der
 * Fehlerzeilen. Exit 0 gibt es nur, wenn die ganze Kette steht. Der Server wird
 * danach über die PID aus dem Listener beendet, nicht über ein Muster.
 *
 * Grenzen, absichtlich: kein `git clean` — ein `.env` im Installat überlebt
 *   jedes Update; eine laufende Instanz aus dem Zielverzeichnis verweigert das
 *   Neuinstallieren (npm ci zöge ihr node_modules weg), `--force` ist die
 *   ausdrückliche Ausnahme; ein Rollback ist eine Neuinstallation, kein
 *   Symlinkwechsel — der Zustand (Sessions, Ledger, Index) liegt außerhalb.
 *
 * WO DER CODE STEHT: dieser Kopf ist Einstieg und Fassade (Argumente, eine
 * Config, die Auswahl des Befehls). Die Körper liegen als Eigentümer-Module
 * unter `scripts/lib/install-*.mjs` — tools, state, environment, verify,
 * vault, commands, lifecycle — und bekommen EINE `env`; kein Modul liest
 * `process.argv` selbst. Die beobachtbare Oberfläche bleibt der Aufruf unten,
 * und genau das pinnt `scripts/gate/tests/install-user.test.mjs` (23/23).
 *
 * Aufruf:
 *   node scripts/install-user.mjs install  [--prefix DIR] [--ref R] [--source URL] [--no-verify]
 *   node scripts/install-user.mjs update   [--prefix DIR] [--ref R] [--no-verify] [--force]
 *   node scripts/install-user.mjs auto     [--prefix DIR] [--ref REF] [--now]
 *   node scripts/install-user.mjs rollback [--prefix DIR] [--to SHA] [--no-verify] [--force] [--no-rollback]
 *   node scripts/install-user.mjs status   [--prefix DIR] [--quiet]
 *   node scripts/install-user.mjs history  [--limit N] [--json]
 *   node scripts/install-user.mjs auto     [--prefix DIR] [--staging DIR] [--ref R] [--quiet]
 *   node scripts/install-user.mjs units    [--interval ZEIT] [--no-enable] [--remove]
 *   Abnahme: [--port N] [--timeout S] [--no-rollback]
 * Exit: 0 = Stand installiert und abgenommen · 1 = Abnahme rot · 2 = Bedien- oder Umgebungsfehler
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as paths from './lib/paths.mjs';
import { cmdUnits } from './lib/systemd-units.mjs';
import { createTools } from './lib/install-tools.mjs';
import { createStateStore } from './lib/install-state.mjs';
import { createEnvironment } from './lib/install-environment.mjs';
import { createVerifier } from './lib/install-verify.mjs';
import { createVault } from './lib/install-vault.mjs';
import { createCommands } from './lib/install-commands.mjs';
import { createLifecycle } from './lib/install-lifecycle.mjs';

/**
 * Ein Lauf, der seinen eigenen Elternteil beendet (`auto --now`), schreibt
 * danach in eine Pipe ohne Leser. EPIPE darf die Umschaltung nicht abbrechen —
 * sie ist in diesem Moment schon im Gange; der Fortschritt steht im Protokoll.
 */
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

const DEFAULT_PREFIX = join(homedir(), '.local', 'opt', 'shinon-forge');
const STATE_FILE = join(paths.stateDir(), 'install-state.json');
const RUN_LOG = join(paths.logDir(), 'verify-log.jsonl');
const STATE_VERSION = 1;
const HISTORY_MAX = 20;
const VERIFY_TIMEOUT_S = 120;

/** Fortschritt — mit `--quiet` still, weil der Timer das Journal nicht fluten soll. */
const say = (line = '') => {
  if (!QUIET) console.log(line);
};
const warn = (line) => console.warn(`   ⚠️  ${line}`);
const die = (message, code = 2) => {
  console.error(`\n💥 install-user: ${message}`);
  process.exit(code);
};

/* ------------------------------------------------------------------ Argumente */

const argv = process.argv.slice(2);
const command = argv.find((arg) => !arg.startsWith('--')) ?? null;
const flag = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith('--')) die(`--${name} braucht einen Wert`);
  return value;
};
const has = (name) => argv.includes(`--${name}`);
// Muss vor jedem `say` stehen: `--help` druckt, bevor der Rest ausgewertet ist.
const QUIET = has('quiet');

const USAGE = `Aufruf: node scripts/install-user.mjs <install|update|rollback|status|history|auto|units|selftest|uninstall> [Optionen]
  --prefix DIR     Installationsverzeichnis (Default ${DEFAULT_PREFIX})
  --staging DIR    Kandidaten-Verzeichnis für auto (Default <prefix>-staging)
  --ref REF        Ziel-Ref für install/update/auto (Default origin/main)
  --now            auto schaltet SOFORT um: laufende Instanzen werden beendet und neu gestartet
  --to SHA         Ziel-SHA für rollback (Default: der vorherige Stand)
  --source URL     Klon-Quelle (Default: origin dieses Repos)
  --port N         Port für die Boot-Abnahme (Default: freier Port)
  --timeout S      Wartezeit auf "dsh web:" (Default ${VERIFY_TIMEOUT_S})
  --limit N        Anzahl der Zeilen für history (Default 20)
  --json           history als JSON-Zeilen statt Tabelle
  --interval ZEIT  Rhythmus des Timers (units, Default 1d)
  --first-delay ZEIT  erster Lauf nach Aktivierung (units, Default 10min)
  --spread ZEIT    Streuung gegen Gleichzeitigkeit (units, Default 1h; 0 = keine)
  --no-enable      units schreiben, Aktivierung von Hand
  --no-systemd     units schreibt/löscht nur Dateien, ohne systemctl (Tests)
  --remove         units entfernen (disable + löschen)
  --export-secrets DATEI  Tresor-Ziel bei uninstall (Default: <state>/secrets-backup.json)
  --secrets-from DIR      zusätzliche Quelle für Zugangsdateien (z. B. der Arbeitsbaum)
  --purge          uninstall OHNE Tresor — Zugangsdateien werden gelöscht
  --keep-checkout  uninstall lässt das Installationsverzeichnis stehen
  --quiet          nur die Ergebniszeile (für den Timer im Journal)
  --no-verify      Installation ohne Boot-Abnahme
  --no-rollback    bei roter Abnahme NICHT auf den letzten grünen Stand zurück
  --force          auch wenn eine Instanz aus dem Zielverzeichnis läuft`;

if (has('help') || command === 'help') {
  say(USAGE);
  process.exit(0);
}
if (command === null) {
  console.error(USAGE);
  process.exit(2);
}
if (!['install', 'update', 'rollback', 'status', 'history', 'auto', 'units', 'selftest', 'uninstall'].includes(command)) die(`unbekannter Unterbefehl "${command}"\n${USAGE}`);

const PREFIX = resolve(flag('prefix', DEFAULT_PREFIX));
const NO_VERIFY = has('no-verify');
const NO_ROLLBACK = has('no-rollback');
const FORCE = has('force');
/** `auto --now`: die Umschaltung wartet nicht auf einen ruhigen Moment, sie
 *  macht ihn — Instanzen beenden, umschalten, dieselben Aufrufe neu starten. */
const NOW = has('now');
/** Tests schreiben in ein anderes XDG_CONFIG_HOME: dann darf systemctl NICHT laufen —
 *  `systemctl --user disable` würde sonst den echten Timer des Nutzers treffen. */
const NO_SYSTEMD = has('no-systemd');
const PORT = flag('port', null) === null ? null : Number(flag('port'));
const TIMEOUT_S = Number(flag('timeout', String(VERIFY_TIMEOUT_S)));
if (PORT !== null && (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535)) die('--port muss eine Portnummer sein');
if (!Number.isFinite(TIMEOUT_S) || TIMEOUT_S < 10) die('--timeout muss mindestens 10 Sekunden sein');

/**
 * EINE Config, aus der die Eigentümer-Module leben (install-tools, -state,
 * -environment, -verify, -vault, -commands, -lifecycle). Kein Modul liest
 * `process.argv` selbst: was gilt, entscheidet dieser Kopf einmal.
 */
const env = {
  prefix: PREFIX,
  stateFile: STATE_FILE,
  runLog: RUN_LOG,
  stateVersion: STATE_VERSION,
  historyMax: HISTORY_MAX,
  verifyTimeoutS: VERIFY_TIMEOUT_S,
  port: PORT,
  timeoutS: TIMEOUT_S,
  noVerify: NO_VERIFY,
  noRollback: NO_ROLLBACK,
  force: FORCE,
  now: NOW,
  quiet: QUIET,
  say,
  warn,
  die,
  flag,
  has,
};

const tools = createTools(env);
/** Der Timer-Abbau und `units` brauchen EIN Objekt statt zehn Argumente. */
env.units = { prefix: PREFIX, noSystemd: NO_SYSTEMD, flag, has, say, warn, node: tools.nodeBinary };
const state = createStateStore(env, { git: tools.git });
const environment = createEnvironment(env, tools);
const verifier = createVerifier(env, tools, state);
const vault = createVault(env, state);
const commands = createCommands(env, {
  ...tools,
  ...state,
  ...environment,
  ...verifier,
  ...vault,
});
const lifecycle = createLifecycle(env, {
  ...tools,
  ...state,
  ...environment,
  ...verifier,
  ...vault,
  ...commands,
});

say('🛠  install-user — Nutzer-Installat mit Abnahme');

let code = 0;
if (command === 'install') code = await commands.cmdInstall();
else if (command === 'update') code = await commands.cmdUpdate();
else if (command === 'rollback') code = await commands.cmdRollback();
else if (command === 'history') code = lifecycle.cmdHistory();
else if (command === 'auto') code = await lifecycle.cmdAuto();
else if (command === 'units') code = await cmdUnits(env.units);
else if (command === 'selftest') code = await lifecycle.cmdSelftest();
else if (command === 'uninstall') code = await lifecycle.cmdUninstall();
else code = lifecycle.cmdStatus();

process.exit(code);
