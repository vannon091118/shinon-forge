#!/usr/bin/env node
/**
 * scale-check.mjs — der Skalierungsnachweis: „das Gate bleibt grün, wenn Plugins
 * dazukommen" wird nicht behauptet, sondern gemessen.
 *
 * Warum dieses Skript existiert: die Gate-Kette (statisches Gate, Gate-Engine,
 * Gate-Tests, Distributionstest, Build) hatte drei Stellen, an denen ein NEUES
 * Plugin Pflege in einer ZENTRALEN Handliste verlangte — `host-half`/`client-half`
 * (Idiom-Regionen), `dead-package` (`KNOWN_INACTIVE`), `doctor`
 * (`EXPECTED_VERSIONS`), dazu der lineare Distributionstest. Gemessen am
 * 2026-10-11 mit 20 zusätzlichen Paketen (39 statt 19): 60 Befunde in
 * `host-half`/`client-half`, 5 in `dead-package`, plus ein Gate-Test. Jede dieser
 * Stellen ist seither beseitigt; dieses Skript ist der Lauf, der das belegt — und
 * der es beim nächsten Umbau wieder belegt.
 *
 * Wie gemessen wird: eine KOPIE des Baums in ein temporäres Verzeichnis, darin N
 * zusätzliche Plugin-Pakete — genau so, wie es ein Plugin-Autor täte. Ein Klon
 * bekommt einen eigenen Namen (Ordnername, Manifest, Patch, ModuleLoader-id), eigene
 * Idiom-Werte in seiner Startmarke und erklärt sich im eigenen Manifest als bewusst
 * zurückgestellt (`"dsh": { "inactive": true }`). Danach laufen die Stufen der
 * Kette über diese Kopie; der echte Baum wird dabei nie angefasst.
 *
 * Was der Lauf misst: dass ein neues Paket KEINEN Eingriff außerhalb seines eigenen
 * Ordners braucht, um die Ketten grün zu halten (`npm run idioms` schreibt den
 * generierten Block aus der Erklärung im Paket). Was er NICHT misst: ein neues
 * Paket, das ins PROFIL soll — das ist bewusst Handarbeit (Patch + Profil-Manifest,
 * siehe `AGENTS.md`, Abschnitt Conventions) und braucht ein Install.
 *
 * Aufruf:
 *   node scripts/scale-check.mjs [--plugins N] [--keep] [--json <pfad>]
 *
 * `--keep` behält das temporäre Verzeichnis (Debugging); `--json` schreibt die
 * Messung als JSON weg. Teil von `npm test` ist dieser Lauf NICHT: er kopiert den
 * Baum, installiert Tarballs und dauert rund anderthalb Minuten.
 */
import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import * as repo from './lib/repo.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const PLUGINS = Number(flag('--plugins', '20'));
const KEEP = args.includes('--keep');
const JSON_OUT = flag('--json', null);

if (!Number.isInteger(PLUGINS) || PLUGINS < 1) {
  console.error('❌ --plugins braucht eine ganze Zahl ≥ 1');
  process.exit(1);
}
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error(
    `❌ Node ${process.versions.node} reicht nicht: die Gate-Tests laden CJS-Bündel per require(ESM) ` +
      'und brauchen Node ≥ 22 (docs/ZAHLEN.md §2). Mit Node v22 erneut aufrufen.',
  );
  process.exit(1);
}

const FIXTURE = mkdtempSync(join(tmpdir(), 'shinon-scale-'));
/** Kopiert wird alles außer Laufzeit- und Fremdresten; `node_modules` kommt als Symlink. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'logs', 'attachments']);

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else cpSync(source, target);
  }
}

/**
 * Ein Klon eines vorhandenen Pakets — so, wie ein Plugin-Autor anfängt.
 *
 * Umgeschrieben wird generisch über den Spendernamen (kein Package-spezifischer
 * Sonderfall): die vier Vertragsstellen, der Menü-Schlüssel, dann jedes freie
 * Vorkommen des Namens als Bezeichner. `DashboardPanel` bleibt dadurch ein
 * gültiger Bezeichner (Wortgrenze), und die sichtbaren Texte kommen aus den
 * Parametern der Startmarke, nicht aus dem Namen.
 */
function clonePackage(fixture, donor, name, index) {
  const target = join(fixture, 'packages', name);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(fixture, 'packages', donor), target, { recursive: true });

  const ident = `probe${index}Plugin`;
  const label = `Probe ${index}`;
  const walk = (base) => {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const path = join(base, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      const before = readFileSync(path, 'utf8');
      const text = before
        .replaceAll(`@shinon/${donor}`, `@shinon/${name}`)
        .replaceAll(`shinon-${donor}`, `shinon-${name}`)
        .replaceAll(`menu.${donor}`, `menu.${name}`)
        .replace(new RegExp(`\\b${donor}\\b`, 'gi'), ident)
        // Die eigenen Werte des Autors: sie stehen in der Startmarke des Blocks.
        .replace(/(\/\/ >>> shinon:dsh-idiom locale-fallback\S* [^\n]*?) params=\{.*?\}(?=\s*$)/gm, (line) =>
          line.replace(
            / params=\{.*?\}$/,
            ` params=${JSON.stringify({ table: `MENU_${index}_DE`, key: `menu.${name}`, label })}`,
          ),
        );
      if (text !== before) writeFileSync(path, text);
    }
  };
  walk(target);

  const manifestPath = join(target, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.name = `@shinon/${name}`;
  manifest.dsh = { ...(manifest.dsh ?? {}), inactive: true };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Das Wörterbuch von `@shinon/locale-de` ist die Besitzerin der Menü-Texte; jeder
 * neue Menü-Schlüssel gehört als EINE Zeile dorthin (der Fallback im Paket ist nur
 * die Sicherheitsleine). Das ist die einzige Zeile, die ein neues Paket AUSSERHALB
 * seines Ordners braucht — genau deshalb steht sie hier sichtbar im Rezept.
 */
function registerLabels(fixture, names) {
  const file = join(fixture, 'packages', 'locale-de', 'client.js');
  const lines = readFileSync(file, 'utf8').split('\n');
  const anchor = lines.findIndex((line) => line.includes('const TEXTS = {'));
  if (anchor === -1) throw new Error('Wörterbuch (const TEXTS) in packages/locale-de/client.js nicht gefunden');
  const entries = names.map((name, index) => `          'menu.${name}': 'Probe ${index + 1}',`);
  lines.splice(anchor + 1, 0, ...entries);
  writeFileSync(file, lines.join('\n'));
  return entries.length;
}

/** Kindprozess mit dem Baum-`node` und `node_modules/.bin` zuerst im PATH (dort liegt `dsh`). */
function run(cwd, cmd, cmdArgs) {
  const path = [join(repo.ROOT, 'node_modules', '.bin'), process.env.PATH ?? ''].join(delimiter);
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: path },
  });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const summaryOf = (out, patterns) => {
  for (const pattern of patterns) {
    const hit = out.match(pattern);
    if (hit) return hit[0].trim();
  }
  return '';
};

const STAGES = [
  {
    name: 'idioms (Schreiber)',
    args: ['scripts/sync-idioms.mjs'],
    summary: [/✅ \d+ Blöcke? in \d+ Dateien deckungsgleich[^\n]*/],
  },
  {
    name: 'Gate (statisch)',
    args: ['scripts/shinon-test.mjs'],
    summary: [/Ergebnisse: \d+ bestanden, \d+ fehlgeschlagen/],
  },
  {
    name: 'Gate-Engine --full',
    args: ['scripts/gate/engine.mjs', '--full'],
    summary: [/Verdict: [^\n]*/],
  },
  {
    name: 'Gate-Tests',
    // Die Dateiliste aus dem Baum lesen statt zu globben: `npm run gate:test`
    // übergibt der Shell einen Stern, hier soll kein Shell-Ersatz mitspielen.
    args: () => [
      '--test',
      ...readdirSync(join(FIXTURE, 'scripts', 'gate', 'tests'))
        .filter((file) => file.endsWith('.test.mjs'))
        .sort()
        .map((file) => join('scripts', 'gate', 'tests', file)),
    ],
    summary: [/^# pass \d+$/m, /^# fail \d+$/m],
  },
  {
    name: 'Distributionstest',
    args: ['scripts/pack-test.mjs'],
    summary: [/Ergebnisse: \d+ bestanden, \d+ fehlgeschlagen/, /Dauer: [^\n]*/],
  },
  {
    name: 'Build',
    args: ['scripts/build.mjs'],
    summary: [/Artefakte: dist\/ mit \d+ Paketen, \d+ Dateien[^\n]*/],
  },
];

// ── Fixture bauen ────────────────────────────────────────────────────────────
const donors = ['dashboard'];
const donor = donors.find((dir) => existsSync(join(repo.ROOT, 'packages', dir, 'client.js')));
if (!donor) {
  console.error(`❌ kein Spenderpaket gefunden (${donors.join(', ')})`);
  process.exit(1);
}
copyTree(repo.ROOT, FIXTURE);
symlinkSync(join(repo.ROOT, 'node_modules'), join(FIXTURE, 'node_modules'), 'dir');
const added = [];
for (let i = 1; i <= PLUGINS; i += 1) {
  const name = `probe-plugin-${i}`;
  clonePackage(FIXTURE, donor, name, i);
  added.push(name);
}
const labels = registerLabels(FIXTURE, added);

console.log('═══════════════════════════════════════');
console.log('  Shinon Forge Skalierungslauf');
console.log('═══════════════════════════════════════\n');
console.log(`  Baum:        ${repo.ROOT}`);
console.log(`  Kopie:       ${FIXTURE}`);
console.log(`  Spender:     ${donor}  ×  ${PLUGINS} neue Pakete`);
console.log(`  Pakete:      ${readdirSync(join(FIXTURE, 'packages')).length} (statt ${repo.discover().length})`);
console.log(`  Rezept:      Ordner + eigene Vertragsnamen + Idiom-Werte in der Startmarke + \`dsh.inactive\``);
console.log(`               plus ${labels} Zeile(n) im Wörterbuch von @shinon/locale-de (Besitzerin der Menü-Texte)\n`);

// ── Stufen über die Kopie ────────────────────────────────────────────────────
const results = [];
for (const stage of STAGES) {
  const started = Date.now();
  const { ok, out } = run(FIXTURE, process.execPath, typeof stage.args === 'function' ? stage.args() : stage.args);
  const summary = summaryOf(out, stage.summary);
  results.push({ name: stage.name, ok, ms: Date.now() - started, summary });
  console.log(`${ok ? '✅' : '💥'} ${stage.name}  —  ${summary || '(keine Zusammenfassung)'}`);
  if (!ok) {
    const lines = out.split('\n').filter((line) => /💥|^not ok|❌/.test(line)).slice(0, 8);
    for (const line of lines) console.log(`     ${line.trim()}`);
  }
}

const failed = results.filter((entry) => !entry.ok).length;
console.log('\n═══════════════════════════════════════');
console.log(
  `  ${failed === 0 ? '✅' : '💥'} Verdict: ${failed === 0 ? 'PASS' : 'FAIL'} — ` +
    `${results.length - failed}/${results.length} Stufen grün bei ${PLUGINS} neuen Paketen`,
);
console.log('═══════════════════════════════════════');

if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        node: process.versions.node,
        donor,
        addedPlugins: PLUGINS,
        packages: readdirSync(join(FIXTURE, 'packages')).length,
        stages: results,
        verdict: failed === 0 ? 'PASS' : 'FAIL',
      },
      null,
      2,
    )}\n`,
  );
  console.log(`  Messung geschrieben: ${JSON_OUT}`);
}

if (!KEEP) rmSync(FIXTURE, { recursive: true, force: true });
else console.log(`  Kopie behalten: ${FIXTURE}`);
process.exit(failed > 0 ? 1 : 0);
