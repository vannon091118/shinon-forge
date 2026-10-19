#!/usr/bin/env node
/**
 * sync-zahlen.mjs — die Bestands-Tabelle in `docs/ZAHLEN.md` wird GEMESSEN,
 * nicht gepflegt.
 *
 * Warum: die Tabelle ist der einzige Eigentümer der harten Zahlen dieses Repos.
 * Wenn sie von Hand nachgezogen wird, ist sie nach dem nächsten Paket alt — und
 * eine veraltete Referenz ist wie ein Kompass, der noch auf den letzten Hafen
 * zeigt. Dieses Skript liest die Fakten aus dem Baum (Manifeste, Profil, Git-
 * Index, dist, vendor) und schreibt NUR den markierten Block:
 *
 *   <!-- zahlen:bestand:start -->
 *   … generierte Tabelle …
 *   <!-- zahlen:bestand:end -->
 *
 * Alles außerhalb der Marker bleibt unberührt. `--check` schreibt nicht und
 * endet mit Exit 1, wenn der Block vom Baum abweicht (für CI und Dry-Runs).
 *
 * Die Befehle in der Tabelle sind die Eigentümer der jeweiligen Zahl; wer eine
 * Zeile ändert, ändert den Messweg hier — nicht die Zahl im Dokument.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const START = '<!-- zahlen:bestand:start -->';
const END = '<!-- zahlen:bestand:end -->';

const readJSON = (file) => JSON.parse(readFileSync(file, 'utf8'));
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const entries = (root, path) => readdirSync(join(root, path), { withFileTypes: true });
const dirs = (root, path) => entries(root, path)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const files = (root, path, extension) => entries(root, path)
  .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
  .map((entry) => entry.name)
  .sort();

/** Markdown-Tabellenzelle: Pipes und Zeilenumbrüche dürfen die Tabelle nicht sprengen. */
const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Alle Dateien unter einem Pfad (rekursiv) — ohne Fremdbaum, ohne Symlinks. */
function filesUnder(root, path) {
  const full = join(root, path);
  if (!existsSync(full)) return [];
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const next = join(dir, entry.name);
      if (entry.isDirectory()) walk(next);
      else found.push(next);
    }
  };
  walk(full);
  return found;
}

/** Die Blöcke aus dem Idiom-Prüfer (EINE Quelle: `npm run idioms:check`). */
function idiomCounts(root) {
  try {
    const output = execFileSync(process.execPath, [join(root, 'scripts', 'sync-idioms.mjs'), '--check'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const match = /(\d+)\s+Blöcke\s+in\s+(\d+)\s+Dateien/.exec(output);
    return match === null ? null : { blocks: Number(match[1]), files: Number(match[2]) };
  } catch {
    return null;
  }
}

/** Die gemessenen Zeilen — Reihenfolge und Beschriftung sind der Vertrag des Blocks. */
export function measure(root = ROOT) {
  const rootManifest = readJSON(join(root, 'package.json'));
  const profileFile = join(root, 'profiles', 'shinon', 'package.json');
  const profile = existsSync(profileFile) ? readJSON(profileFile) : null;
  const bundles = profile?.dsh?.profile?.bundles ?? [];
  const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => readJSON(join(root, 'packages', entry.name, 'package.json')));
  const versions = {};
  for (const pkg of packages) versions[pkg.version] = (versions[pkg.version] ?? 0) + 1;
  const versionText = Object.entries(versions)
    .sort(([left], [right]) => right.localeCompare(left, undefined, { numeric: true }))
    .map(([version, count]) => `${count}× \`${version}\``)
    .join(', ');
  const inactive = packages.filter((pkg) => pkg.dsh?.inactive === true).map((pkg) => pkg.name.replace(/^@[^/]+\//, ''));
  const trackedProfiles = execFileSync('git', ['ls-files', 'profiles'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.split('/')[1])
    .filter(Boolean);
  const profileNames = [...new Set(trackedProfiles)].sort();
  const markdown = git(['ls-files', '*.md']).split('\n').filter((line) => line.endsWith('.md')).length;
  const idioms = idiomCounts(root);
  const distFiles = filesUnder(root, 'dist/packages');
  const distPackages = existsSync(join(root, 'dist', 'packages')) ? dirs(root, 'dist/packages').length : 0;
  const distBytes = distFiles.reduce((sum, file) => sum + statSync(file).size, 0);
  const pnpmArtifacts = git(['ls-files', '*pnpm-workspace.yaml', '*pnpm-lock.yaml'])
    .split('\n')
    .filter((line) => line.endsWith('pnpm-workspace.yaml') || line.endsWith('pnpm-lock.yaml')).length;
  const own = bundles.filter((name) => name.startsWith('@shinon/')).length;
  const foreign = bundles.length - own;

  return [
    ['Pakete unter `packages/`', String(packages.length), '`ls packages | wc -l`'],
    ['Profile unter `profiles/`', String(profileNames.length), '`git ls-files profiles | cut -d/ -f2 | sort -u | wc -l`'],
    ['Bundle-Layer im Profil `shinon`', String(bundles.length), '`node -p "require(\'./profiles/shinon/package.json\').dsh.profile.bundles.length"`'],
    ['davon eigene (`@shinon/*`)', String(own), 'dieselbe Liste, gefiltert auf `@shinon/`'],
    ['davon fremde', String(foreign), 'dieselbe Liste, Rest'],
    ['Pakete **nicht** im Profil (erklären sich selbst via `dsh.inactive`)', inactive.length === 0 ? 'keine' : `${inactive.length} (${inactive.join(', ')})`, 'Manifeste unter `packages/*/package.json` lesen'],
    ['Version des Repos', `\`${rootManifest.version}\``, '`node -p "require(\'./package.json\').version"`'],
    ['Paketversionen', versionText, '`node -e "…"` über `packages/*/package.json`'],
    ['DSH-Pin im Root-Manifest', `\`${rootManifest.dependencies?.['@deepseek-ai/dsh'] ?? '—'}\``, '`node -p "require(\'./package.json\').dependencies[\'@deepseek-ai/dsh\']"`'],
    ['Schemastery (deklariert)', `\`${rootManifest.dependencies?.['@deepseek-ai/schemastery'] ?? '—'}\``, '`node -p "require(\'./package.json\').dependencies[\'@deepseek-ai/schemastery\']"`'],
    ['Node (`engines.node`)', `\`${rootManifest.engines?.node ?? '—'}\``, '`node -p "JSON.stringify(require(\'./package.json\').engines)"`'],
    ['pnpm-Artefakte (getrackt)', String(pnpmArtifacts), '`git ls-files \'*pnpm-workspace.yaml\' \'*pnpm-lock.yaml\' | wc -l` (Aufrufe: Gate-Prüfung „pnpm-Reste“)'],
    ['Markdown-Dokumente (getrackt)', String(markdown), '`git ls-files \'*.md\' | wc -l`'],
    ['Verträge unter `docs/contracts/`', String(files(root, 'docs/contracts', '.json').length), '`ls docs/contracts/*.json | wc -l`'],
    ['Proben unter `docs/probes/`', String(files(root, 'docs/probes', '.json').length), '`ls docs/probes/*.json | wc -l`'],
    ['Generierte Idiom-Blöcke', idioms === null ? 'nicht messbar (Prüfung rot)' : `${idioms.blocks} Blöcke in ${idioms.files} Dateien`, '`npm run idioms:check` (Exit 0)'],
    ['Vendorte Dateien unter `vendor/`', String(filesUnder(root, 'vendor').length), '`find vendor -type f | wc -l`'],
    ['Build (`dist/packages/`)', distFiles.length === 0 ? 'nicht gebaut' : `${distPackages} Pakete, ${distFiles.length} Dateien, ${distBytes} Bytes`, '`npm run build` (Exit 0)'],
  ];
}

/** Der generierte Block — exakt das, was zwischen den Markern stehen muss. */
export function renderBlock(root = ROOT) {
  const rows = measure(root).map(([label, value, command]) => `| ${cell(label)} | ${cell(value)} | ${cell(command)} | 0 |`);
  return [
    START,
    '| Zahl | Wert | Befehl (Eigentümer) | Exit |',
    '|---|---|---|---|',
    ...rows,
    END,
  ].join('\n');
}

/** Den markierten Block ersetzen (oder den Ist-Zustand zurückgeben). */
export function sync({ root = ROOT, check = false } = {}) {
  const file = join(root, 'docs', 'ZAHLEN.md');
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`${relative(root, file)}: Marker ${START} … ${END} fehlen — der Block ist ohne sie nicht adressierbar`);
  }
  const next = `${text.slice(0, start)}${renderBlock(root)}${text.slice(end + END.length)}`;
  if (next === text) return { changed: false, file };
  if (check) return { changed: true, file, expected: renderBlock(root), actual: text.slice(start, end + END.length) };
  writeFileSync(file, next, 'utf8');
  return { changed: true, file };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  try {
    const result = sync({ check });
    if (result.changed && check) {
      console.error('💥 zahlen:sync --check: der Bestands-Block weicht vom Baum ab — `npm run zahlen:sync` schreibt ihn.');
      console.error(result.expected);
      process.exit(1);
    }
    console.log(result.changed ? `✅ zahlen:sync: ${relative(ROOT, result.file)} aktualisiert.` : '✅ zahlen:sync: der Bestands-Block ist aktuell.');
  } catch (error) {
    console.error(`💥 zahlen:sync: ${error.message}`);
    process.exit(1);
  }
}
