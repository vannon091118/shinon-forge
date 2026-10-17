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
 *   d) Installations-Prefixe (nur wenn a–c fehlen): `npm install -g` legt den
 *      `dsh`-Shim unter `<prefix>/bin/` ab, ohne dass `<prefix>/bin` im PATH
 *      stehen muss. Die Prefixe werden aus den `node`-Binaries abgeleitet, die
 *      auf dem PATH liegen (`nodePrefixes()`) — keine Versionsnummer und kein
 *      Heimpfad steht hier fest; wer DSH anderswo installiert, nutzt a–c oder
 *      legt den Shim auf den PATH.
 *
 * Die Node-Laufzeit selbst kommt aus `runtime.mjs` (verifiziert: Version gegen
 * `engines.node` UND `node:sqlite`-Rauchtest). Dieses Modul entscheidet nur,
 * WO dsh liegt — nicht, welcher Node es startet.
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOnPath } from './yaml.mjs';
import { resolveRuntime } from './runtime.mjs';

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

/**
 * Ein VERIFIZIERTES Node-Binary (Version gegen `engines.node` UND
 * `node:sqlite`-Rauchtest). Die Auflösung liegt in `runtime.mjs` — hier steht
 * nur noch der Name, den die Starter benutzen; die frühere Fassung akzeptierte
 * jede Hauptversion ≥ 22 (also auch 23 und 22.0–22.18) und kannte zwei
 * festverdrahtete Heimpfade. `null`, wenn kein Kandidat taugt.
 */
export function goodNode() {
  return resolveRuntime().binary;
}

/**
 * Installations-Prefixe für ein globales DSH: abgeleitet aus den Node-Binaries,
 * die der Resolver ohnehin prüft (`<prefix>/bin/node` → `<prefix>`). Keine
 * Versionsnummer und kein Heimpfad steht hier fest — wer `npm install -g` in
 * einem anderen Prefix ausführt, wird über denselben PATH gefunden.
 */
export function nodePrefixes(env = process.env) {
  const prefixes = [];
  for (const part of String(env.PATH ?? '').split(delimiter)) {
    if (part === '') continue;
    const binary = join(part, process.platform === 'win32' ? 'node.exe' : 'node');
    if (!existsSync(binary)) continue;
    const prefix = dirname(part);
    if (!prefixes.includes(prefix)) prefixes.push(prefix);
  }
  const running = process.execPath;
  const runningPrefix = dirname(dirname(running));
  if (existsSync(running) && !prefixes.includes(runningPrefix)) prefixes.push(runningPrefix);
  return prefixes;
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
  for (const prefix of nodePrefixes()) {
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

  // Global/PATH DSH is an explicit compatibility escape hatch. The default
  // startup contract is repo-local install or the repository vendor path.
  if (process.env.SHINON_ALLOW_PATH_DSH !== '1') return null;

  const bin = findOnPath('dsh');
  if (bin !== null) {
    const dir = packageRootOfShim(bin);
    if (dir !== null && existsSync(join(dir, 'package.json'))) return dir;
  }
  return prefixRoot();
}

/**
 * HERKUNFT der dsh-Auflösung — nicht die Reihenfolge (die steht in `dshRoot()`),
 * sondern nur die Auswertung ihres Ergebnisses am Pfad. Damit kann ein Einstieg
 * melden, WO sein dsh herkommt („ohne globales dsh" ist eine Aussage, die man
 * zeigen muss), ohne die Reihenfolge ein zweites Mal zu beschreiben — die bliebe
 * sonst nicht synchron.
 * @returns {{ kind: 'Repo-Installat' | 'Vendor' | 'PATH oder Installations-Prefix', root: string } | null}
 */
export function dshSource() {
  const root = dshRoot();
  if (root === null) return null;
  if (root.startsWith(join(ROOT, 'node_modules') + sep)) return { kind: 'Repo-Installat', root };
  if (root.startsWith(join(ROOT, 'vendor') + sep) || root.startsWith(join(ROOT, 'starter') + sep)) {
    return { kind: 'Vendor', root };
  }
  return { kind: 'PATH oder Installations-Prefix', root };
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

/**
 * Die verifizierte Laufzeit als Daten (Binary, Version, sqlite, geprüfte
 * Kandidaten) — für Launcher und Meldungen, die den Pfad zeigen müssen.
 */
export function dshRuntime() {
  return resolveRuntime();
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
