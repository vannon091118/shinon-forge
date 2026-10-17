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
 * Grenzen, absichtlich:
 *   - Kein `git clean`: ein `--dry-run` gibt es nicht, aber auch kein Löschen
 *     unversionierter Dateien. Ein `.env` im Installat überlebt jedes Update.
 *   - Läuft eine Instanz aus dem Zielverzeichnis, verweigert der Befehl das
 *     Neuinstallieren (npm ci würde ihr node_modules unter den Füßen
 *     wegziehen) — `--force` ist die ausdrückliche Ausnahme.
 *   - Ein Rollback ist eine Neuinstallation, kein Symlinkwechsel: der Zustand
 *     (Sessions, Ledger, Index) liegt außerhalb und bleibt unberührt.
 *
 * Aufruf:
 *   node scripts/install-user.mjs install  [--prefix DIR] [--ref R] [--source URL] [--no-verify]
 *   node scripts/install-user.mjs update   [--prefix DIR] [--ref R] [--no-verify] [--force]
 *   node scripts/install-user.mjs rollback [--prefix DIR] [--to SHA] [--no-verify] [--force] [--no-rollback]
 *   node scripts/install-user.mjs status   [--prefix DIR]
 *   node scripts/install-user.mjs history  [--limit N] [--json]
 *   Abnahme: [--port N] [--timeout S] [--no-rollback]
 * Exit: 0 = Stand installiert und abgenommen · 1 = Abnahme rot · 2 = Bedien- oder Umgebungsfehler
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createServer, connect } from 'node:net';
import * as paths from './lib/paths.mjs';
import { resolveRuntime } from './lib/runtime.mjs';

const DEFAULT_PREFIX = join(homedir(), '.local', 'opt', 'shinon-forge');
const STATE_FILE = join(paths.stateDir(), 'install-state.json');
const RUN_LOG = join(paths.logDir(), 'verify-log.jsonl');
const STATE_VERSION = 1;
const HISTORY_MAX = 20;
const VERIFY_TIMEOUT_S = 120;

const say = (line = '') => console.log(line);
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

const USAGE = `Aufruf: node scripts/install-user.mjs <install|update|rollback|status|history> [Optionen]
  --prefix DIR     Installationsverzeichnis (Default ${DEFAULT_PREFIX})
  --ref REF        Ziel-Ref für install/update (Default origin/main)
  --to SHA         Ziel-SHA für rollback (Default: der vorherige Stand)
  --source URL     Klon-Quelle (Default: origin dieses Repos)
  --port N         Port für die Boot-Abnahme (Default: freier Port)
  --timeout S      Wartezeit auf "dsh web:" (Default ${VERIFY_TIMEOUT_S})
  --limit N        Anzahl der Zeilen für history (Default 20)
  --json           history als JSON-Zeilen statt Tabelle
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
if (!['install', 'update', 'rollback', 'status', 'history'].includes(command)) die(`unbekannter Unterbefehl "${command}"\n${USAGE}`);

const PREFIX = resolve(flag('prefix', DEFAULT_PREFIX));
const NO_VERIFY = has('no-verify');
const NO_ROLLBACK = has('no-rollback');
const FORCE = has('force');
const PORT = flag('port', null) === null ? null : Number(flag('port'));
const TIMEOUT_S = Number(flag('timeout', String(VERIFY_TIMEOUT_S)));
if (PORT !== null && (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535)) die('--port muss eine Portnummer sein');
if (!Number.isFinite(TIMEOUT_S) || TIMEOUT_S < 10) die('--timeout muss mindestens 10 Sekunden sein');

/* ------------------------------------------------------------------ Werkzeuge */

/** Ein Prozess, dessen Status zählt — nie geraten, immer Exit-Code. */
function tool(cmd, args, cwd, label) {
  say(`   → ${label}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) die(`${label}: ${result.error.message}`);
  if (result.status !== 0) die(`${label} scheiterte (Exit ${result.status})`);
}

function git(args, cwd, { allowFail = false } = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.error) die(`git nicht ausführbar: ${result.error.message}`);
  if (result.status !== 0 && !allowFail) {
    die(`git ${args.join(' ')} scheiterte (Exit ${result.status}): ${(result.stderr ?? '').trim()}`);
  }
  return result;
}

/** Das npm desselben Node, unter dem dieses Skript läuft (kein zweiter Pfad). */
function npmCommand() {
  const execpath = process.env.npm_execpath;
  if (execpath !== undefined && existsSync(execpath)) return [process.execPath, [execpath]];
  return [process.platform === 'win32' ? 'npm.cmd' : 'npm', []];
}

/** Die verifizierte Node-Laufzeit (dieselbe, die bin/shinon.mjs startet). */
function nodeBinary() {
  return resolveRuntime().binary ?? process.execPath;
}

/* --------------------------------------------------------------------- Zustand */

function readState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return parsed.schemaVersion === STATE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const trimmed = { ...state, history: (state.history ?? []).slice(-HISTORY_MAX) };
  writeFileSync(STATE_FILE, `${JSON.stringify(trimmed, null, 2)}\n`);
}

function emptyState() {
  return { schemaVersion: STATE_VERSION, installDir: PREFIX, source: null, current: null, previous: null, greens: [], history: [], lastVerify: null };
}

/** Ein Stand hat die Abnahme bestanden — er wird zum Rückweg-Kandidaten. */
function noteGreen(state, sha) {
  if (sha == null) return;
  const greens = (state.greens ?? []).filter((entry) => entry !== sha);
  greens.push(sha);
  state.greens = greens.slice(-10);
}

/** Der jüngste grüne Stand, der nicht der gescheiterte ist und im Klon liegt. */
function lastGreen(state, failedSha) {
  const greens = [...(state.greens ?? [])].reverse();
  if (state.current?.verified === true && state.current.sha !== failedSha) greens.unshift(state.current.sha);
  for (const sha of greens) {
    if (sha === failedSha) continue;
    const exists = git(['cat-file', '-e', `${sha}^{commit}`], PREFIX, { allowFail: true });
    if (exists.status === 0) return sha;
  }
  return null;
}

/* ---------------------------------------------------------------- Umgebung */

/** Klon-Quelle: ausdrücklich, sonst origin DIESES Repos. */
function sourceUrl() {
  const explicit = flag('source', null);
  if (explicit !== null) return explicit;
  const own = spawnSync('git', ['-C', paths.workspaceRoot(), 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (own.status === 0 && own.stdout.trim() !== '') return own.stdout.trim();
  return paths.workspaceRoot();
}

/** Läuft etwas aus dem Zielverzeichnis? (npm ci würde ihm node_modules entreißen.) */
function instancesUsing(prefix) {
  if (process.platform !== 'linux') return [];
  const hits = [];
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
    let cmdline;
    try {
      cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf8');
    } catch {
      continue;
    }
    if (!cmdline.includes(prefix)) continue;
    const readable = cmdline.split('\0').filter(Boolean).join(' ');
    if (readable.includes('install-user.mjs')) continue;
    hits.push({ pid: Number(entry), cmdline: readable });
  }
  return hits;
}

/**
 * Nur nötig, wenn Dateien im Installat ersetzt werden (checkout, npm ci): eine
 * laufende Instanz verliert dabei ihr node_modules unter den Füßen. Die reine
 * Abnahme startet ihren eigenen Prozess auf freiem Port und braucht keine Ruhe.
 */
function guardInstances() {
  const running = instancesUsing(PREFIX);
  if (running.length === 0) return;
  if (FORCE) {
    warn(`${running.length} Instanz(en) laufen aus ${PREFIX} — --force gesetzt, sie können brechen`);
    return;
  }
  const list = running.map((hit) => `PID ${hit.pid}: ${hit.cmdline.slice(0, 120)}`).join('\n   ');
  die(`aus ${PREFIX} laufen noch Instanzen — bitte beenden oder --force:\n   ${list}`);
}

/** Steht der gepinnte dsh schon im Ziel? (Spart ein sinnloses npm ci.) */
function dshInstalled() {
  return existsSync(join(PREFIX, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'));
}

function headSha() {
  const head = git(['rev-parse', 'HEAD'], PREFIX, { allowFail: true });
  return head.status === 0 ? head.stdout.trim() : null;
}

/** Ein Git-Klon im Ziel, oder ein klarer Fehler. */
function ensureCheckout() {
  if (!existsSync(join(PREFIX, 'package.json'))) {
    say(`\n📦 Klon nach ${PREFIX}`);
    mkdirSync(dirname(PREFIX), { recursive: true });
    tool('git', ['clone', '--quiet', sourceUrl(), PREFIX], dirname(PREFIX), `git clone ${sourceUrl()}`);
    return;
  }
  const probe = git(['rev-parse', '--git-dir'], PREFIX, { allowFail: true });
  if (probe.status !== 0) {
    die(`${PREFIX} existiert, ist aber kein Git-Klon — bitte von Hand prüfen, dieses Werkzeug löscht nichts`);
  }
}

function fetchAndResolve(ref) {
  say('   → git fetch origin');
  const fetched = spawnSync('git', ['-C', PREFIX, 'fetch', '--prune', '--quiet', 'origin'], { encoding: 'utf8' });
  if (fetched.status !== 0) {
    die(`git fetch scheiterte (Exit ${fetched.status}): ${(fetched.stderr ?? '').trim()} — offline?`);
  }
  const candidates = ref === null ? ['origin/main'] : [ref, `origin/${ref}`];
  for (const candidate of candidates) {
    const resolved = git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], PREFIX, { allowFail: true });
    if (resolved.status === 0) return { sha: resolved.stdout.trim(), ref: candidate };
  }
  die(`Ref "${ref ?? 'origin/main'}" ist im Klon nicht auflösbar`);
}

function checkout(sha) {
  say(`   → git checkout ${sha.slice(0, 12)}`);
  git(['checkout', '--force', '--quiet', sha], PREFIX);
  const head = git(['rev-parse', 'HEAD'], PREFIX).stdout.trim();
  if (head !== sha) die(`Checkout landete auf ${head}, erwartet war ${sha}`);
  const dirty = git(['status', '--porcelain', '--untracked-files=no'], PREFIX).stdout.trim();
  if (dirty !== '') die(`Arbeitsbaum nach dem Checkout nicht sauber:\n${dirty}`);
}

function installDependencies() {
  const [cmd, prefixArgs] = npmCommand();
  tool(cmd, [...prefixArgs, 'ci', '--no-audit', '--no-fund'], PREFIX, 'npm ci (Lockfile)');
  linkProfiles();
}

function linkProfiles({ write = true } = {}) {
  const node = nodeBinary();
  if (write) tool(node, [join(PREFIX, 'scripts', 'profile-links.mjs')], PREFIX, 'Profil-Links setzen');
  tool(node, [join(PREFIX, 'scripts', 'profile-links.mjs'), '--check'], PREFIX, 'Profil-Links prüfen');
}

/* ------------------------------------------------------------------- Abnahme */

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function portClosed(port, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((done) => {
    const attempt = () => {
      const socket = connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) done(false);
        else setTimeout(attempt, 150);
      });
      socket.once('error', () => {
        socket.destroy();
        done(true);
      });
    };
    attempt();
  });
}

/** Zeilen, die wie ein Fehler aussehen — mit benannter Ausnahme statt stillem Wegsehen. */
const NOISE = [/\[shinon-better-errors\]/, /ExperimentalWarning/, /trace-warnings/];
function errorLines(lines) {
  return lines.filter((line) => /\b(error|errors|exception|unhandled|failed|fehlgeschlagen|cannot)\b/i.test(line) && !NOISE.some((pattern) => pattern.test(line)));
}

async function verify() {
  const report = { at: new Date().toISOString(), ok: false, dsh: null, herkunft: null, aktiviert: 0, errors: [], http: null, port: null, bootMs: 0, ms: 0 };
  const started = Date.now();
  const node = nodeBinary();
  const entry = join(PREFIX, 'bin', 'shinon.mjs');

  say('\n🔎 Abnahme');
  const check = spawnSync(node, [entry, '--check'], { cwd: PREFIX, encoding: 'utf8' });
  const checkText = `${check.stdout ?? ''}${check.stderr ?? ''}`;
  if (check.status !== 0) {
    report.errors.push(`shinon --check Exit ${check.status}`);
    return report;
  }
  report.dsh = /dsh:\s+(\S+)/.exec(checkText)?.[1] ?? null;
  report.herkunft = /Herkunft:\s+(.+)/.exec(checkText)?.[1]?.trim() ?? null;
  if (report.herkunft === null || !report.herkunft.includes(PREFIX)) {
    report.errors.push(`Herkunft zeigt nicht auf das Installat (${report.herkunft ?? 'fehlt'})`);
    return report;
  }
  say(`   ✓ --check: dsh ${report.dsh}, Herkunft ${report.herkunft}`);

  const doctor = spawnSync(node, [entry, 'doctor'], { cwd: PREFIX, encoding: 'utf8' });
  if (doctor.status !== 0) {
    report.errors.push(`shinon doctor Exit ${doctor.status}`);
    return report;
  }
  say('   ✓ doctor: gesund, keine Befunde');

  const port = PORT ?? (await freePort());
  report.port = port;
  const url = `http://127.0.0.1:${port}/`;
  const lines = [];
  const bootStarted = Date.now();
  const child = spawn(node, [entry, '--no-open', '--trusted-host', '127.0.0.1', '--port', String(port)], {
    cwd: PREFIX,
    env: { ...process.env, DSH_HOME: PREFIX },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let webUrl = null;
  const consume = (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim() === '') continue;
      lines.push(line);
      const match = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(line);
      if (match !== null && webUrl === null) webUrl = match[1];
    }
  };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);

  const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })));
  const booted = await new Promise((done) => {
    const deadline = Date.now() + TIMEOUT_S * 1000;
    const tick = () => {
      if (webUrl !== null) return done(true);
      if (child.exitCode !== null) return done(false);
      if (Date.now() > deadline) return done(false);
      setTimeout(tick, 100);
    };
    tick();
  });

  if (!booted) {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    await portClosed(port, 3000);
    report.errors.push(webUrl === null ? `kein "dsh web:" innerhalb ${TIMEOUT_S}s` : 'Boot endete vorzeitig');
    report.errors.push(...errorLines(lines).slice(0, 5));
    return report;
  }
  report.bootMs = Date.now() - bootStarted;
  say(`   ✓ Boot: dsh web: ${url} (${(report.bootMs / 1000).toFixed(1)}s)`);

  report.aktiviert = lines.filter((line) => /Aktiviert/.test(line)).length;

  try {
    const tokenUrl = webUrl;
    const tokenResponse = await fetch(tokenUrl, { redirect: 'manual' });
    const cookies = typeof tokenResponse.headers.getSetCookie === 'function' ? tokenResponse.headers.getSetCookie() : [];
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const pageResponse = await fetch(url, { headers: cookie === '' ? {} : { cookie }, redirect: 'manual' });
    const type = pageResponse.headers.get('content-type') ?? '';
    const body = await pageResponse.text();
    report.http = { token: tokenResponse.status, cookie: pageResponse.status, type, bytes: Buffer.byteLength(body), title: /<title>([^<]*)/.exec(body)?.[1] ?? null };
    if (![302, 303].includes(tokenResponse.status)) report.errors.push(`Token-Einstieg lieferte HTTP ${tokenResponse.status} statt 303`);
    if (pageResponse.status !== 200) report.errors.push(`Seite lieferte HTTP ${pageResponse.status} statt 200`);
    if (!type.includes('text/html')) report.errors.push(`Inhaltstyp ${type || 'leer'} statt text/html`);
    if (report.http.bytes < 1000) report.errors.push(`Seite nur ${report.http.bytes} Bytes`);
    say(`   ✓ HTTP: ${tokenResponse.status} → ${pageResponse.status} · ${report.http.bytes} Bytes · ${report.http.title ?? 'ohne Titel'}`);
  } catch (error) {
    report.errors.push(`HTTP-Prüfung scheiterte: ${error.message}`);
  }

  const errors = errorLines(lines);
  if (errors.length > 0) {
    report.errors.push(...errors.slice(0, 10));
  }
  say(`   ✓ Log: ${lines.length} Zeilen, ${report.aktiviert} "Aktiviert", ${errors.length} Fehlerzeile(n)`);

  if (child.exitCode === null) child.kill('SIGTERM');
  const finish = await Promise.race([exited, new Promise((done) => setTimeout(() => done(null), 10000))]);
  if (finish === null && child.exitCode === null) child.kill('SIGKILL');
  if (!(await portClosed(port, 5000))) report.errors.push(`Port ${port} nach dem Stop noch offen`);

  report.ms = Date.now() - started;
  report.ok = report.errors.length === 0;
  return report;
}

/**
 * Eine Zeile je Abnahme, dauerhaft — ohne Token, ohne Schlüssel, ohne Pfade,
 * die nicht schon im Zustand stehen. Anhängen statt überschreiben: nur so
 * lässt sich ein Stand über die Zeit mit seinen Vorgängern vergleichen.
 */
function appendRunLog(report, trigger) {
  const state = readState();
  const record = {
    schemaVersion: 1,
    at: report.at,
    installDir: PREFIX,
    sha: state?.current?.sha ?? null,
    ref: state?.current?.ref ?? null,
    trigger,
    ok: report.ok,
    dsh: report.dsh,
    bootMs: report.bootMs,
    totalMs: report.ms,
    plugins: report.aktiviert,
    errors: report.errors,
    http: report.http === null
      ? null
      : { token: report.http.token, cookie: report.http.cookie, type: report.http.type, bytes: report.http.bytes, title: report.http.title },
  };
  mkdirSync(dirname(RUN_LOG), { recursive: true });
  appendFileSync(RUN_LOG, `${JSON.stringify(record)}\n`);
  return RUN_LOG;
}

function printReport(report) {
  if (report.ok) {
    say(`\n✅ Abnahme grün in ${(report.ms / 1000).toFixed(1)}s — ${report.http?.bytes ?? 0} Bytes HTML, ${report.aktiviert} Plugins aktiv, 0 Fehlerzeilen`);
  } else {
    console.error(`\n❌ Abnahme rot — ${report.errors.length} Befund(e):`);
    for (const error of report.errors) console.error(`   - ${error}`);
  }
}

/* ----------------------------------------------------------------- Befehle */

/**
 * Den Stand SOFORT festhalten — vor npm ci. Bricht die Installation danach ab,
 * zeigt `status` wenigstens den HEAD, der wirklich im Verzeichnis liegt, statt
 * eine Aufzeichnung, die hinter dem Baum herläuft.
 */
function recordStand(sha, ref, action) {
  const state = readState() ?? emptyState();
  state.installDir = PREFIX;
  state.source = sourceUrl();
  const before = state.current;
  // Derselbe Stand erneut: der Rückweg bleibt der, der er vorher war.
  if (before !== null && before.sha !== sha) state.previous = { ...before };
  if (before === null) state.previous = null;
  state.history = [...(state.history ?? []), { sha, ref, at: new Date().toISOString(), action }];
  state.current = { sha, ref, at: new Date().toISOString(), verified: null };
  writeState(state);
  return state;
}

async function verifyStand({ allowAuto = true, trigger = 'verify' } = {}) {
  if (NO_VERIFY) {
    warn('Abnahme übersprungen (--no-verify) — dieser Stand ist NICHT als startfähig belegt');
    return 0;
  }
  const state = readState() ?? emptyState();
  const report = await verify();
  state.lastVerify = report;
  if (state.current !== null) state.current.verified = report.ok;
  if (report.ok) noteGreen(state, state.current?.sha ?? null);
  writeState(state);
  const log = appendRunLog(report, trigger);
  printReport(report);
  say(`   Protokoll: ${log}`);
  if (report.ok) return 0;

  const failedSha = state.current?.sha ?? null;
  if (allowAuto && !NO_ROLLBACK) {
    const target = lastGreen(state, failedSha);
    if (target === null) {
      console.error(`   Kein grüner Stand aufgezeichnet — bitte von Hand entscheiden: node scripts/install-user.mjs rollback --prefix ${PREFIX}`);
      return 1;
    }
    const restored = await restoreGreen(target);
    if (restored === 0) {
      console.error(`   ↩︎ Automatisch zurück auf ${target.slice(0, 12)} — der rote Stand ${failedSha?.slice(0, 12) ?? '?'} ist verworfen.`);
    } else {
      console.error(`   ⚠️  Auch der Rückweg auf ${target.slice(0, 12)} ist rot — das Installat braucht Handarbeit.`);
    }
    return 1;
  }
  const hint = state.previous === null
    ? 'kein vorheriger Stand aufgezeichnet'
    : `node scripts/install-user.mjs rollback --prefix ${PREFIX}`;
  console.error(`   Rollback: ${hint}`);
  return 1;
}

/**
 * Der Rückweg: den grünen Stand neu installieren und erneut prüfen. Kein
 * zweiter Ablauf-Typ — dieselben Schritte wie ein Rollback, nur ohne Rekursion
 * (dieser Lauf darf bei Rot NICHT wieder einen Rückweg starten).
 */
async function restoreGreen(sha) {
  say(`\n↩︎  Rückkehr auf den letzten grünen Stand ${sha.slice(0, 12)}`);
  guardInstances();
  checkout(sha);
  recordStand(sha, 'green', 'auto-rollback');
  installDependencies();
  const code = await verifyStand({ allowAuto: false, trigger: 'auto-rollback' });
  if (code === 0) say(`   ✓ Rückweg abgenommen: ${sha.slice(0, 12)} steht wieder`);
  return code;
}

async function cmdInstall() {
  ensureCheckout();
  git(['remote', 'set-url', 'origin', sourceUrl()], PREFIX, { allowFail: true });
  const target = fetchAndResolve(flag('ref', null));
  say(`\n🎯 Ziel: ${target.ref} @ ${target.sha.slice(0, 12)}`);
  // Wiederholbar heißt idempotent: derselbe Stand mit gepinntem dsh wird nicht
  // neu installiert, sondern nur geprüft. Das ist der billige Weg für Reruns.
  if (headSha() === target.sha && dshInstalled()) {
    say('   ↺ Stand und Abhängigkeiten liegen schon — nur Links prüfen und Abnahme');
    recordStand(target.sha, target.ref, 'install (bereits vorhanden)');
    linkProfiles({ write: false });
    return verifyStand({ trigger: 'install (bereits vorhanden)' });
  }
  guardInstances();
  checkout(target.sha);
  recordStand(target.sha, target.ref, 'install');
  installDependencies();
  return verifyStand({ trigger: 'install' });
}

async function cmdUpdate() {
  const state = readState();
  if (state === null || !existsSync(join(PREFIX, 'bin', 'shinon.mjs'))) {
    die(`kein Installat unter ${PREFIX} — zuerst: node scripts/install-user.mjs install`);
  }
  git(['remote', 'set-url', 'origin', sourceUrl()], PREFIX, { allowFail: true });
  const target = fetchAndResolve(flag('ref', null));
  const currentSha = state.current?.sha ?? null;
  if (target.sha === currentSha) {
    say(`\n✅ Bereits aktuell: ${target.ref} @ ${target.sha.slice(0, 12)} — keine Neuinstallation`);
    return verifyStand({ trigger: 'update (bereits aktuell)' });
  }
  say(`\n⬆️  Update ${currentSha?.slice(0, 12) ?? '—'} → ${target.sha.slice(0, 12)}`);
  guardInstances();
  checkout(target.sha);
  recordStand(target.sha, target.ref, 'update');
  installDependencies();
  return verifyStand({ trigger: 'update' });
}

async function cmdRollback() {
  const state = readState();
  if (state === null) die(`kein Installationszustand (${STATE_FILE}) — Rollback braucht einen vorherigen Stand`);
  const explicit = flag('to', null);
  const requested = explicit ?? state.previous?.sha ?? null;
  if (requested === null) die('kein vorheriger Stand bekannt — mit --to <sha> einen Stand benennen');
  // Kurz-SHA und Ref-Namen sind erlaubt; verglichen wird immer die volle Object-ID.
  const resolved = git(['rev-parse', '--verify', '--quiet', `${requested}^{commit}`], PREFIX, { allowFail: true });
  if (resolved.status !== 0) die(`Stand ${requested} liegt nicht im Klon — bitte erst fetch`);
  const targetSha = resolved.stdout.trim();
  const ref = explicit === null ? state.previous?.ref ?? 'previous' : requested;
  guardInstances();
  say(`\n⏪ Rollback ${state.current?.sha.slice(0, 12) ?? '—'} → ${targetSha.slice(0, 12)}`);
  checkout(targetSha);
  recordStand(targetSha, ref, explicit === null ? 'rollback' : `rollback --to ${targetSha.slice(0, 12)}`);
  installDependencies();
  return verifyStand({ trigger: explicit === null ? 'rollback' : `rollback --to ${targetSha.slice(0, 12)}` });
}

function cmdStatus() {
  const state = readState();
  const installed = existsSync(join(PREFIX, 'bin', 'shinon.mjs'));
  say(`\n📍 Installat: ${PREFIX}`);
  say(`   Zustand:   ${STATE_FILE}`);
  if (!installed) {
    say('   Stand:     nicht installiert');
    if (state !== null) say(`   letzter:   ${state.current?.sha?.slice(0, 12) ?? '—'} (Verzeichnis fehlt)`);
    return 0;
  }
  const head = git(['rev-parse', '--short=12', 'HEAD'], PREFIX, { allowFail: true });
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], PREFIX, { allowFail: true });
  const dirty = git(['status', '--porcelain', '--untracked-files=no'], PREFIX, { allowFail: true });
  const origin = git(['remote', 'get-url', 'origin'], PREFIX, { allowFail: true });
  say(`   HEAD:      ${head.status === 0 ? head.stdout.trim() : '—'} (${branch.status === 0 ? branch.stdout.trim() : '—'})`);
  say(`   Quelle:    ${origin.status === 0 ? origin.stdout.trim() : '—'}`);
  say(`   Änderungen:${dirty.status === 0 && dirty.stdout.trim() !== '' ? ` ${dirty.stdout.trim().split('\n').length} Datei(en) — nicht reproduzierbar` : ' keine'}`);
  if (state === null) {
    say('   Zustand:   keine Aufzeichnung (Installation von Hand?)');
  } else {
    say(`   Stand:     ${state.current?.sha?.slice(0, 12) ?? '—'}${state.current?.verified === true ? ' (abgenommen)' : state.current?.verified === false ? ' (Abnahme rot)' : ' (nicht abgenommen)'}`);
    say(`   Vorher:    ${state.previous?.sha?.slice(0, 12) ?? '—'}`);
    const last = state.lastVerify;
    if (last != null) {
      say(`   Abnahme:   ${last.ok ? 'grün' : 'rot'} · ${last.at} · ${last.http?.bytes ?? 0} Bytes · ${last.aktiviert} aktiv · ${last.errors?.length ?? 0} Befund(e)`);
    }
    // Der laufende Stand zählt mit, wenn er abgenommen ist — auch bei einem
    // Zustand aus einer älteren Fassung, die noch keine `greens`-Liste kannte.
    const greens = [...(state.greens ?? [])];
    if (state.current?.verified === true && !greens.includes(state.current.sha)) greens.push(state.current.sha);
    say(`   Rückweg:   ${greens.length === 0 ? 'kein grüner Stand aufgezeichnet' : `${greens.length} grün (${greens.slice(-3).map((sha) => sha.slice(0, 12)).join(', ')})`}`);
  }
  const running = instancesUsing(PREFIX);
  say(`   Läuft:     ${running.length === 0 ? 'nichts' : running.map((hit) => `PID ${hit.pid}`).join(', ')}`);
  const runs = readRunLog();
  say(`   Protokoll: ${RUN_LOG} (${runs.length} Lauf/Läufe${runs.length > 0 ? `, zuletzt ${runs.at(-1).at}` : ''})`);
  return 0;
}

/** Das dauerhafte Abnahmeprotokoll als Daten — kaputte Zeilen werden gemeldet, nicht verschluckt. */
function readRunLog() {
  let raw = '';
  try {
    raw = readFileSync(RUN_LOG, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      warn(`unlesbare Zeile im Protokoll übersprungen (${RUN_LOG})`);
    }
  }
  return rows;
}

/**
 * `history` — der Vergleich über Versionen: Boot-Dauer, Fehlerzeilen und
 * Ergebnis je Lauf, plus Kennzahlen, die man in Zahlen sehen will (Minimum,
 * Median, Maximum, Erfolgsquote). Ohne `--json` als Tabelle.
 */
function cmdHistory() {
  const limit = Number(flag('limit', '20'));
  if (!Number.isInteger(limit) || limit < 1) die('--limit muss eine positive Zahl sein');
  const rows = readRunLog();
  say(`\n📊 Abnahmeprotokoll: ${RUN_LOG}`);
  if (rows.length === 0) {
    say('   noch keine Läufe aufgezeichnet');
    return 0;
  }
  if (has('json')) {
    for (const row of rows.slice(-limit)) say(JSON.stringify(row));
    return 0;
  }
  const shown = rows.slice(-limit);
  const seconds = (ms) => (ms == null ? '  —  ' : `${(ms / 1000).toFixed(1)}s`.padStart(6));
  say('');
  say('  Datum (UTC)       Stand         Trigger                      Boot    Gesamt  Plugins  Fehler  Bytes   Ergebnis');
  for (const row of shown) {
    const when = String(row.at ?? '').slice(0, 16).replace('T', ' ');
    say(
      `  ${when.padEnd(17)} ${String(row.sha ?? '—').slice(0, 12).padEnd(13)} ${String(row.trigger ?? '—').slice(0, 28).padEnd(28)} ` +
        `${seconds(row.bootMs)} ${seconds(row.totalMs)} ${String(row.plugins ?? 0).padStart(7)} ${String(row.errors?.length ?? 0).padStart(7)} ${String(row.http?.bytes ?? 0).padStart(7)}   ${row.ok ? 'grün' : 'rot'}`,
    );
  }
  const boots = rows.map((row) => row.bootMs).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const green = rows.filter((row) => row.ok).length;
  const median = boots.length === 0 ? null : boots[Math.floor(boots.length / 2)];
  say('');
  say(`  ${rows.length} Läufe · ${green} grün · ${rows.length - green} rot`);
  if (boots.length > 0) say(`  Boot: min ${(boots[0] / 1000).toFixed(1)}s · median ${(median / 1000).toFixed(1)}s · max ${(boots.at(-1) / 1000).toFixed(1)}s (${boots.length} Messungen)`);
  const byVersion = new Map();
  for (const row of rows) {
    const key = row.dsh ?? 'ohne dsh-Angabe';
    const entry = byVersion.get(key) ?? { runs: 0, green: 0, boots: [] };
    entry.runs += 1;
    if (row.ok) entry.green += 1;
    if (Number.isFinite(row.bootMs) && row.bootMs > 0) entry.boots.push(row.bootMs);
    byVersion.set(key, entry);
  }
  for (const [version, entry] of byVersion) {
    const best = entry.boots.length === 0 ? '—' : `${(entry.boots.reduce((sum, value) => sum + value, 0) / entry.boots.length / 1000).toFixed(1)}s`;
    say(`  dsh ${version}: ${entry.runs} Lauf/Läufe, ${entry.green} grün, Ø Boot ${best}`);
  }
  return 0;
}

/* -------------------------------------------------------------------- Start */

say('🛠  install-user — Nutzer-Installat mit Abnahme');

let code = 0;
if (command === 'install') code = await cmdInstall();
else if (command === 'update') code = await cmdUpdate();
else if (command === 'rollback') code = await cmdRollback();
else if (command === 'history') code = cmdHistory();
else code = cmdStatus();

process.exit(code);
