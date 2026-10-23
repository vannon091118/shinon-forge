/**
 * install-tools.mjs — Eigentümer: Prozesse, Ports, Fehlerzeilen.
 *
 * Die Werkzeuge des User-Installats: ein Prozess mit geprüftem Exit-Code, das
 * npm DESSELBEN Node, die verifizierte Node-Laufzeit, freie Ports und die
 * Fehlerzeilen eines Boot-Protokolls. Kein Zustand, kein Pfadwissen — was das
 * Installat ist, kommt aus `env`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { resolveRuntime } from './runtime.mjs';

/**
 * Alle Werkzeuge an EINE Config binden (Prefix, Fortschritt, Abbruch).
 *
 * Warum eine Fabrik statt Modul-Globals: das Werkzeug ist ein Prozess, aber
 * seine Werte sind Argumente. Eine Fabrik macht sichtbar, wovon eine Funktion
 * lebt, statt dass zehn Funktionen denselben veränderlichen Modulzustand lesen.
 */
export function createTools(env) {
  function tool(cmd, args, cwd, label) {
    env.say(`   → ${label}`);
    const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
    if (result.error) env.die(`${label}: ${result.error.message}`);
    if (result.status !== 0) env.die(`${label} scheiterte (Exit ${result.status})`);
  }
  
  function git(args, cwd, { allowFail = false } = {}) {
    const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
    if (result.error) env.die(`git nicht ausführbar: ${result.error.message}`);
    if (result.status !== 0 && !allowFail) {
      env.die(`git ${args.join(' ')} scheiterte (Exit ${result.status}): ${(result.stderr ?? '').trim()}`);
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
  

  return { tool, git, npmCommand, nodeBinary, freePort, portClosed, errorLines, NOISE };
}
