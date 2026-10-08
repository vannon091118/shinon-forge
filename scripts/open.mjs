#!/usr/bin/env node
/**
 * open.mjs — 1-Click-Start (Stufe 1 der Starter-Roadmap).
 *
 * Führt DSH mit dem aktiven Profil hoch (--no-open, keine Browser-Autoöffnung)
 * und öffnet die tokenisierte Bereitschafts-URL im System-Standardbrowser.
 * Das ist der User-Flow, den die spätere Tauri-Shell 1:1 übernimmt:
 * dieselbe URL, dasselbe Profil — nur andere Fassade statt Browser-Tab.
 *
 * Warum --no-open + eigener Browser-Start: DSHs Autoöffnung kennt die
 * trusted-host-Zusagen nicht, und wir brauchen den stabilen, tokenisierten
 * Link aus der READY-Zeile `dsh web: http://…/?token=…` — den öffnen wir selbst.
 *
 * Port: NICHT fest. Früher stand hier die Konstante 3081; war sie belegt,
 * brach der Boot ab, bevor die READY-Zeile kam (Fehlerbild: „Profil kaputt“).
 * Jetzt wählt `lib/port.mjs` den ersten freien Port ab 3081 mit einem echten
 * Bind-Versuch, `--port <n>` bleibt der ausdrückliche Wunsch (`--port 0`: das
 * Betriebssystem bindet). Der bediente Port wird aus der READY-Zeile
 * zurückgelesen und eine Abweichung gemeldet — die Probe ist kein Beweis.
 *
 * Aufruf: `npm run open`  (Profil über das dev-Skript, eine Quelle)
 * Exit: Ctrl-C stoppt DSH und den Wrapper sauber (Kind-Process wird beendet).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as repo from './lib/repo.mjs';
import { findOnPath } from './lib/yaml.mjs';
import { DEFAULT_PORT_BASE, parsePort, pickFreePort } from './lib/port.mjs';
import * as os from 'node:os';

/** Wert eines `--flag wert`-Arguments; `undefined`, wenn das Flag fehlt. */
const valueOf = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

const root = repo.ROOT;
// activeProfile() liest das Manifest (dev-Skript, eine Quelle) — mit Default-Arg.
const profileName = repo.activeProfile();
if (profileName === null) {
  console.error('💥 open: kein --profile im dev-Skript (package.json) gefunden');
  process.exit(2);
}

const dsh = findOnPath('dsh');
if (dsh === null) {
  console.error('💥 open: `dsh` nicht im PATH — zuerst installieren (siehe AGENTS.md)');
  process.exit(2);
}

/** Öffner je Plattform — Tabelle statt verschachtelter Ternaere. */
const PLATFORM_OPENERS = {
  win32: (url) => ['cmd', ['/c', 'start', '', url]],
  darwin: (url) => ['open', [url]],
};

/** Die URL in den System-Standardbrowser geben, ohne den Wrapper zu blocken. */
function openBrowser(url) {
  const command = (PLATFORM_OPENERS[process.platform] ?? ((target) => ['xdg-open', [target]]))(url);
  try {
    const child = spawn(command[0], command[1], { stdio: 'ignore', detached: true });
    child.unref();
  } catch (e) {
    console.error(`\n⚠️  Browser-Start fehlgeschlagen (${e.message}) — die URL steht oben, im Tab öffnen.`);
  }
}

const ARGS_NETWORK = process.argv.includes('--network');

// LAN-IP ermitteln (für Netzwerk-Trusted-Host)
function lanIPv4() {
  const ifaces = os.networkInterfaces();
  for (const addrs of Object.values(ifaces)) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

/**
 * Der Port — EINE Quelle für Server, Trusted-Host, Tunnel-Hinweis und Meldung.
 *
 * Drei Fälle, jeder ausdrücklich: `--port <n>` wird genommen wie angegeben,
 * `--port 0` heißt „das Betriebssystem wählt“ (nur ohne `--network`, das eine
 * bekannte Nummer für den Trusted-Host braucht), sonst der erste freie Port ab
 * DEFAULT_PORT_BASE. Ohne freien Port bricht der Wrapper ab, statt zu raten.
 */
const requested = parsePort(valueOf('--port'));
if (!requested.ok) {
  console.error(`💥 open: --port "${valueOf('--port')}" ist keine Portnummer (0..65535)`);
  process.exit(2);
}
const ephemeral = requested.port === 0;
let PORT;
try {
  if (ephemeral && !ARGS_NETWORK) PORT = 0;
  else if (ephemeral) PORT = await pickFreePort();
  else PORT = requested.port ?? (await pickFreePort());
} catch (error) {
  console.error(`💥 open: ${error.message} — mit --port <n> einen Port vorgeben`);
  process.exit(2);
}

console.log('═══════════════════════════════════');
console.log('  Shinon Forge — 1-Click-Start');
console.log(`  Profil: ${profileName}    dsh: ${dsh}`);
console.log(`  Port: ${PORT === 0 ? '0 (vom Betriebssystem gewählt)' : PORT}${PORT === 0 || PORT === requested.port ? '' : ` (erster freier ab ${DEFAULT_PORT_BASE})`}`);
if (ephemeral && ARGS_NETWORK) console.log(`  Hinweis: --network braucht eine bekannte Nummer, --port 0 wurde zu ${PORT} aufgelöst`);
if (ARGS_NETWORK) console.log('  Netzwerk-Modus aktiv (--network: SSH-Tunnel für externen Zugriff)');
console.log('═══════════════════════════════════\n');

const args = [
  '--profile', profileName,
  '--no-open',
  '--trusted-host', 'localhost',
  '--trusted-host', '127.0.0.1',
  '--port', String(PORT),
];
if (ARGS_NETWORK) {
  const lan = lanIPv4();
  // Vorher stand hier `${lan}:3080` — ein Trusted-Host fuer einen Port, auf dem
  // der Server nicht laeuft. Der Tunnel-Beispielbefehl nennt denselben Wert.
  if (lan) args.push('--trusted-host', `${lan}:${PORT}`);
  console.log(`\n🔗 Netzwerk: ${lan ?? 'keine nicht-loopback-IP'} — Use SSH-Tunnel (z.B. ssh -R 18765:localhost:${PORT} tunnel@host) für externen Zugriff. DSH blockiert --host 0.0.0.0 aus Sicherheitsgründen.\n`);
}

const child = spawn(dsh, args, {
  cwd: root,
  env: { ...process.env, DSH_HOME: root },
  stdio: ['inherit', 'pipe', 'inherit'],
});

const READY = /dsh web: (http:\/\/\S+)/;
let buffered = '';
let opened = false;

child.stdout.on('data', (chunk) => {
  buffered += chunk;
  process.stdout.write(chunk);
  if (opened) return;
  const match = READY.exec(buffered);
  if (match !== null) {
    opened = true;
    const url = match[1];
    // Rücklesen statt annehmen: die Probe kann sich geirrt haben.
    const served = new URL(url).port;
    if (PORT !== 0 && served !== '' && Number(served) !== PORT) {
      console.log(`\n⚠️  dsh bedient Port ${served}, gewählt war ${PORT} — dazwischen wurde der Port anderweitig belegt.`);
    }
    console.log(`\n🌐 1-Click: ${url}\n`);
    openBrowser(url);
  }
});

/**
 * Sauberes Beenden: Ctrl-C oder Kind-Exit beendet beides, kein Orphan.
 *
 * Die Abwartefrist liegt auf dem Timer, nicht in einer Warteschleife. Eine
 * synchrone Warteschleife blockiert den Event-Loop — und damit genau den
 * 'exit'-Handler, der `child.exitCode` setzt: sie kann den Exit NIE beobachten
 * und läuft immer die volle Frist ab. Gemessen (Kind endet nach 300ms):
 * Warteschleife 3020ms Wanduhr und volle CPU-Last; mit der Frist auf dem Timer
 * endet der Wrapper nach 315ms, sobald das Kind wirklich weg ist. SIGKILL
 * greift nur, wenn es nicht wegkommt — das ist die harte Frist, wie vorher.
 */
/** Exit-Code, wenn ein Signal den Wrapper beendet (null = kein Signal). */
let closing = null;

/**
 * Ein Signal beendet Kind und Wrapper. Der Wrapper wartet auf den Timer statt in
 * einer Schleife; die Abwartefrist (3 s) ist die harte Grenze, danach SIGKILL.
 */
const shutdown = (signal) => {
  const code = signal === 'SIGTERM' ? 0 : 130;
  if (child.exitCode !== null) process.exit(code);
  closing = code;
  child.kill(signal === 'SIGTERM' ? 'SIGTERM' : 'SIGINT');
  setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
    process.exit(code);
  }, 3000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

child.on('exit', (code, signal) => {
  console.log(`\n— dsh beendet${signal !== null ? ` (Signal ${signal})` : ` (Exit ${code})`}`);
  process.exit(closing ?? (signal !== null || code === 0 ? 0 : code ?? 1));
});
