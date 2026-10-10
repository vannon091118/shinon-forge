/**
 * dsh.mjs - LOCALE-ERSTE Auflösung der DSH-Laufzeit.
 *
 * Eine Quelle für „wo ist dsh?" — genutzt von open.mjs, stages.mjs,
 * desktop-launcher.mjs, dsh-profile-test.mjs und yaml.mjs, damit niemand den
 * Pfad hart kodiert. `yaml.mjs` bleibt der Export-Punkt: die Historik
 * (findOnPath/dshRoot/dshHarnessDir) importiert sie von hier, und die Gate-
 * Tests importieren weiter von yaml.mjs — die Abhängigkeitsrichtung dsh.mjs →
 * yaml.mjs hält sich an die Vorlage, nichts driftet auseinander.
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
 */
import { existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { findOnPath } from './yaml.mjs';

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
 * Wurzel des dsh-Pakets: erstes lokales Paket (a/b), sonst der PATH-Hebel aus
 * yaml.mjs (c). `null`, wenn weder lokales Installat noch `dsh` im PATH existiert.
 */
export function dshRoot() {
  const local = localRootCandidates()[0];
  return local ?? findOnPath('dsh');
}

/**
 * Das ausführbare dsh-Binary als [node, bin.js]-Paar (always spawnbar):
 * lokal → `node <root>/lib/bin.js`, global → `node <root>/lib/bin.js` (der
 * realpath des .bin-Links zeigt ins Paket), PATH-not-found → null.
 * Ein [exe, args]-Tupel statt einer Datei, damit kein Shell-Quoting und
 * keine shebang-Abhängigkeit entstehen.
 */
export function dshBinary() {
  const root = dshRoot();
  if (root === null) return null;
  return [process.execPath, join(root, 'lib', 'bin.js')];
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
