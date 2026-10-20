/**
 * yaml.mjs - YAML für Gate und Build.
 *
 * Ersetzt die frühere Zeilen-/Regex-Logik durch einen echten Parser. Der Parser
 * kommt aus dem DSH-Stack (js-yaml ist eine Dependency von @deepseek-ai/dsh) und
 * wird aus der installierten dsh-App aufgelöst - keine neue Dependency, kein
 * node_modules im Repo. `dsh` ist für dieses Repo ohnehin Voraussetzung
 * (Profiltest) und wird im PATH gesucht, nicht hart kodiert.
 */
import { createRequire } from 'module';
import { existsSync, readdirSync, realpathSync } from 'fs';
import { delimiter, dirname, join } from 'path';

/** Erstes ausführbares `name` im PATH, ohne Shell. */
export function findOnPath(name, path = process.env.PATH ?? '') {
  for (const dir of path.split(delimiter)) {
    if (dir === '') continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  return null;
}

/**
 * Wurzel der installierten dsh-App, abgeleitet aus dem `dsh`-Bin im PATH.
 *
 * `findOnPath` liefert den realpath, bei einer lokalen Installation also das Ziel
 * des Symlinks `node_modules/.bin/dsh`, und dirname×2 landet damit auf dem dsh-
 * PAKET. Das ist die Ebene, auf der `require.resolve` die Blätter auflöst: die
 * Nachbarpakete (`dsh-agent-loop`, `dsh-api-session-controller`, …) liegen in
 * `<dshRoot>/node_modules/@deepseek-ai`.
 */
export function dshRoot(path) {
  const bin = findOnPath('dsh', path);
  return bin === null ? null : dirname(dirname(bin));
}

/** Anzahl der Host-/Client-Hälften in einem @deepseek-ai-Verzeichnis. */
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
 * Das `@deepseek-ai`-Verzeichnis für BAUM-SCANS — nicht dasselbe wie dshRoot().
 *
 * dshRoot() ist das dsh-Paket; sein eigenes `node_modules/@deepseek-ai` ist nur
 * der verschachtelte Teilbaum dieses Pakets (lokal 18 Pakete — ohne den
 * Agent-Loop, ohne den Großteil des Harness). Ein Scan „über den ganzen Harness"
 * würde damit den falschen Baum zählen: die Aussage wäre über 18 Pakete statt
 * über 250+. Der vollständige Satz liegt bei einer lokalen Installation NEBEN
 * dem Paket, bei einer globalen kann er auch darin liegen.
 *
 * Deshalb werden die Kandidaten (im Paket und in den Ebenen darüber) verglichen
 * und der vollständigste genommen — layoutunabhängig, deterministisch.
 */
export function dshHarnessDir(path) {
  const app = dshRoot(path);
  if (app === null) return null;
  const candidates = [join(app, 'node_modules', '@deepseek-ai')];
  let dir = app;
  for (let level = 0; level < 8; level += 1) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
    candidates.push(join(dir, 'node_modules', '@deepseek-ai'));
  }
  const found = candidates.filter((candidate) => existsSync(candidate));
  if (found.length === 0) return null;
  return found.reduce((best, candidate) => (harnessFiles(candidate) > harnessFiles(best) ? candidate : best));
}

let parser;
/** js-yaml laden: erst aus der dsh-Installation, dann aus node_modules. */
export function yamlParser() {
  if (parser !== undefined) return parser;
  const anchors = [];
  const root = dshRoot();
  if (root !== null) anchors.push(join(root, 'package.json'));
  anchors.push(import.meta.url);
  for (const anchor of anchors) {
    try {
      return (parser = createRequire(anchor)('js-yaml').load);
    } catch {
      /* nächster Anker */
    }
  }
  throw new Error('YAML-Parser nicht gefunden: js-yaml muss aus der dsh-Installation auflösbar sein (dsh im PATH)');
}

/** YAML-Text parsen; wirft bei Syntaxfehlern. */
export function loadYaml(text) {
  return yamlParser()(text);
}
