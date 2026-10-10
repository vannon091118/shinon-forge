/**
 * dsh.mjs - LOCALE-ERSTE Auflösung der DSH-Laufzeit.
 *
 * Eine Quelle für „wo ist dsh?" — genutzt von start.mjs und dsh-update.mjs,
 * damit niemand den Pfad hart kodiert. `open.mjs`, `stages.mjs`,
 * `desktop-launcher.mjs` und `dsh-profile-test.mjs` lösen weiter über
 * `findOnPath` (yaml.mjs) auf; ihre Migration auf `dshBinary()` ist der
 * offene Kandidat S10 (braucht einen Boot ohne Browser-Nebenwirkung als Beleg).
 * Die Gate-Tests nutzen `dshRoot` aus yaml.mjs (eigene Funktion gleichen
 * Namens, nur PATH-basiert) — dieses Modul ändert ihr Verhalten nicht.
 *
 * Auflösungsreihenfolge (lokal vor global, deterministisch):
 *   a) Repo-node_modules: `<Root>/node_modules/@deepseek-ai/dsh` — `npm install`
 *      (Root) legt den gepinnten DSH hier ab; der Starter besteht aus
 *      Repo + installiertem node_modules, kein `npm install -g` nötig.
 *   b) Vendor-Verzeichnis: `starter/vendor/@deepseek-ai/dsh` — falls ein
 *      Distributions-Schritt jemals DSH hier ablegt (Stand: keine 518 MB im
 *      Git, die Datei ist dokumentiert, nicht gevendert).
 *   c) PATH-Fallback: wie vorher — findOnPath('dsh') (yaml.mjs), damit
 *      bestehende globale Installationen weiterlaufen.
 *   d) Installations-Prefixe aus KNOWN_PREFIXES (nur wenn a–c fehlen):
 *      `npm install -g` legt den `dsh`-Shim unter `<prefix>/bin/` ab, ohne
 *      dass `<prefix>/bin` im PATH stehen muss. Die Liste ist bewusst kurz
 *      und dokumentiert statt geraten — wer DSH anderswo installiert, nutzt
 *      a–c oder legt den Shim auf den PATH.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOnPath } from './yaml.mjs';

/** Heimverzeichnis (einmal, für KNOWN_PREFIXES). */
const HOME_DIR = homedir();

/**
 * Bekannte globale Installations-Prefixe (Maschinen-spezifisch, genau EIN Ort
 * für diese Liste statt verstreuter Hartcodierungen in den Skripten):
 * beide wurden am 2026-10-10 auf dieser Maschine nachgewiesen
 * (`<prefix>/bin/{node,dsh}`, dsh-Shim → `<prefix>/lib/node_modules/@deepseek-ai/dsh`).
 */
export const KNOWN_PREFIXES = [
  join(HOME_DIR, '.local', 'opt', 'node-v22.23.3-linux-x64'),
  join(HOME_DIR, '.nvm', 'versions', 'node', 'v24.21.0'),
];

/** Repo-Root: scripts/lib/ → zwei Ebenen hoch. */
export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Kandidatenpfade des lokalen dsh-Pakets, in Prioritätsreihenfolge. */
function localRootCandidates() {
  const candidates = [
    join(ROOT, 'node_modules', '@deepseek-ai', 'dsh'),
    join(ROOT, 'starter', 'vendor', '@deepseek-ai', 'dsh'),
  ];
  return candidates.filter((candidate) => existsSync(join(candidate, 'lib', 'bin.js')));
}

/** Major-Version eines Node-Binaries (`null`, wenn nicht lauffähig). */
function nodeMajor(binary) {
  try {
    const found = /^v(\d+)\./.exec(execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim());
    return found === null ? null : Number(found[1]);
  } catch {
    return null;
  }
}

/**
 * Ein Node-Binary mit Major ≥ 22 (Repo-Vorgabe `engines`): der laufende
 * Prozess zuerst, danach die `node`-Binaries der KNOWN_PREFIXES.
 * `null`, wenn keines existiert — Aufrufer melden das fail-closed.
 */
export function goodNode() {
  const running = Number((process.versions.node ?? '0').split('.')[0]);
  if (running >= 22) return process.execPath;
  for (const prefix of KNOWN_PREFIXES) {
    const binary = join(prefix, 'bin', 'node');
    if (existsSync(binary) && (nodeMajor(binary) ?? 0) >= 22) return binary;
  }
  return null;
}

/**
 * Paketwurzel zu einem dsh-Shim: der Symlink wird aufgelöst; nur die
 * `…/lib/node_modules/<pkg>/lib/bin.js`-Form zählt (kein Raten bei
 * unbekannten Layouts). Sonst `null`.
 */
function packageRootOfShim(shim) {
  let target = shim;
  try {
    target = realpathSync(shim);
  } catch {
    return null;
  }
  if (!target.endsWith(join('lib', 'bin.js'))) return null;
  return dirname(dirname(target));
}

/** Erster Prefix mit vollständigem dsh-Paket (`null`, wenn keiner). */
function prefixRoot() {
  for (const prefix of KNOWN_PREFIXES) {
    const root = packageRootOfShim(join(prefix, 'bin', 'dsh'));
    if (root !== null && existsSync(join(root, 'package.json'))) return root;
  }
  return null;
}

/**
 * Wurzel des dsh-Pakets (IMMER ein Paketverzeichnis mit package.json, nie ein
 * Binary-Pfad): erstes lokales Paket (a/b), sonst der PATH-Shim aufgelöst auf
 * sein Paket (c), sonst der erste belegte Prefix (d). `null`, wenn nichts
 * davon existiert. Die Reihenfolge ist stabil: wer a–c bedient, sieht keinen
 * Unterschied zu vorher; nur wo bisher `null` galt, löst (d) jetzt auf.
 */
export function dshRoot() {
  const local = localRootCandidates()[0];
  if (local !== undefined) return local;
  const bin = findOnPath('dsh');
  if (bin !== null) {
    const dir = packageRootOfShim(bin);
    if (dir !== null && existsSync(join(dir, 'package.json'))) return dir;
  }
  return prefixRoot();
}

/**
 * Das ausführbare dsh-Binary als [node, bin.js]-Paar (always spawnbar):
 * `node` ist `goodNode()` (fällt auf process.execPath zurück), sodass der
 * Spawn nie an einem zu alten Shebang-Node stirbt. `null`, wenn keine Wurzel
 * oder kein `lib/bin.js` darin existiert.
 * Ein [exe, args]-Tupel statt einer Datei, damit kein Shell-Quoting und
 * keine shebang-Abhängigkeit entstehen.
 */
export function dshBinary() {
  const root = dshRoot();
  if (root === null) return null;
  const bin = join(root, 'lib', 'bin.js');
  if (!existsSync(bin)) return null;
  return [goodNode() ?? process.execPath, bin];
}

/** Anzahl der Host-/Client-Hälften in einem @deepseek-ai-Verzeichnis (Layout-Logik von yaml.mjs). */
function harnessFiles(dir) {
  if (!existsSync(dir)) return 0;
  let files = 0;
  for (const entry of readdirSync(dir)) {
    for (const rel of ['lib/index.js', 'lib/client.js']) {
      if (existsSync(join(dir, entry, rel))) files += 1;
    }
  }
  return files;
}

/**
 * Das `@deepseek-ai`-Verzeichnis für BAUM-SCANS, lokal vor global:
 * die dsh-Paket-Kopie wird über die lokalen Wurzeln (a/b) und — falls die
 * lokale nicht den vollen Baum trägt — über die PATH-Wurzel (c) gesucht;
 * der vollständigste `node_modules/@deepseek-ai`-Baum gewinnt
 * (layoutunabhängig, deterministisch). `null`, wenn kein Installat auffindbar.
 */
export function dshHarnessDir() {
  const appRoots = [dshRoot()];
  const local = localRootCandidates()[0];
  if (local !== undefined && local !== appRoots[0]) appRoots.push(local);
  const roots = [...new Set(appRoots.filter((root) => root !== null))];
  const candidates = [];
  for (const app of roots) {
    candidates.push(join(app, 'node_modules', '@deepseek-ai'));
    let dir = app;
    for (let level = 0; level < 8; level += 1) {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
      candidates.push(join(dir, 'node_modules', '@deepseek-ai'));
    }
  }
  const found = candidates.filter((candidate) => existsSync(candidate));
  if (found.length === 0) return null;
  return found.reduce((best, candidate) => (harnessFiles(candidate) > harnessFiles(best) ? candidate : best));
}
