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
import { existsSync, realpathSync } from 'fs';
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

/** Wurzel der installierten dsh-App, abgeleitet aus dem `dsh`-Bin im PATH. */
export function dshRoot(path) {
  const bin = findOnPath('dsh', path);
  return bin === null ? null : dirname(dirname(bin));
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
