#!/usr/bin/env node
/**
 * pack-test.mjs - Distributionstest (Exit Gate für Block 1)
 *
 * Je Paket: `npm pack` -> Tarball entpacken -> isoliert installieren -> laden.
 * Rot, solange ein Paket seine host-shared Abhängigkeit nicht deklariert
 * (siehe SHARED_DEPS in scripts/lib/repo.mjs), grün, sobald alle Tarballs
 * im Isolat laden. Eingebunden in `npm test`.
 *
 * Eine Quelle: **npm**. Seit PLAN.md Schritt 3.5 ruft dieser Test kein pnpm
 * mehr auf (A1); der Tarball entsteht über `npm pack`, das Isolat über
 * `npm install`. Beide Wege sind gemessen gleichwertig: das Tarball heißt
 * `shinon-<dir>-<version>.tgz` und entpackt nach `package/`.
 *
 * Warum die Pakete PARALLEL laufen (und zwar in einem begrenzten Pool): der
 * Preis dieses Tests wächst linear mit der Zahl der Plugins — je Paket kostet
 * ein eigener `npm pack` plus ein netzgebundenes, isoliertes `npm install`
 * (gemessen 2026-10-11: 19 Pakete ≈ 22 s, also ≈ 1,2 s je Paket). Mit einem
 * `@shinon`-Plugin mehr wird der Lauf sonst zum Flaschenhals des gesamten
 * `npm test`. Jedes Paket arbeitet in einem eigenen Unterverzeichnis von WORK,
 * die Reihenfolge der Ausgabe hängt trotzdem nicht vom Pool ab: die Ergebnisse
 * werden gesammelt und danach in `repo.discover()`-Reihenfolge geschrieben.
 *
 * Option: --keep  Zwischenstände unter /tmp behalten (Debugging).
 */
import { execFile } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { availableParallelism, tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { childEnv } from './lib/paths.mjs';
import { resolveRuntime } from './lib/runtime.mjs';
import * as repo from './lib/repo.mjs';

const WORK = mkdtempSync(join(tmpdir(), 'shinon-pack-'));
/**
 * Tarballs aus dem VORLAUF (dir → Pfad).
 *
 * Warum ein Vorlauf: seit 2026-10-20 hängen die Host-Hälften an einem
 * gemeinsamen Kern (`@shinon/seams`, sechs ehemalige Host↔Host-Zwillinge).
 * Eine deklarierte Abhängigkeit muss auch im ISOLAT liegen — sonst sucht
 * `npm install` sie in der Registry, wo es sie nicht gibt. Also wird jedes
 * Paket EINMAL gepackt, und jedes Isolat bekommt seine lokalen Abhängigkeiten
 * als Tarball daneben. Damit bleibt die Zusage des Tests unverändert („ein
 * Tarball lädt allein") und die neue Abhängigkeit wird gemessen statt
 * angenommen.
 */
const tarballs = new Map();
const tarballErrors = new Map();

/** Lokale (`@shinon/*`) Abhängigkeiten eines Pakets — deklariert, nicht geraten. */
const localDeps = (pkg) => {
  const names = new Set();
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const name of Object.keys(pkg.manifest?.[field] ?? {})) {
      if (name.startsWith('@shinon/')) names.add(name);
    }
  }
  return [...names].sort();
};
/** Immer im Tarball: die Runtime-Dateien plus jede referenzierte Ressource. */
const shippedFiles = (pkg) => [
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  ...repo.resourceRefs(pkg).map(({ value }) => value.replace(/^\.\//, '')),
];
const NPM_FLAGS = ['--no-audit', '--no-fund', '--loglevel=error', '--userconfig=/dev/null'];
/** Pakete gleichzeitig; gedeckelt, damit der Netz-Teil von `npm install` nicht überladen wird. */
const POOL = Math.max(1, Math.min(availableParallelism(), 6));

let passed = 0;
let failed = 0;

const execFileAsync = promisify(execFile);

/**
 * Ein Kindprozess mit AUSDRÜCKLICHEM PATH: das Verzeichnis des verifizierten
 * Node und `node_modules/.bin` zuerst. Das war die Ursache von `spawn node
 * ENOENT`: `npm pack` startet Kindprozesse, die `node` per Namen suchen — fehlte
 * der PATH-Eintrag (Sandbox, gekürztes env, `env -i`), brach der Test ab und
 * wurde als „Umgebungssache" abgetan. Der PATH wird hier gesetzt, nicht gehofft.
 */
async function run(cmd, args, cwd) {
  try {
    const env = childEnv(resolveRuntime(), { ...process.env });
    delete env.npm_config_allow_scripts;
    await execFileAsync(cmd, args, { cwd, env });
    return { ok: true };
  } catch (e) {
    const lines = String(e.stderr ?? '').split('\n').filter(Boolean);
    const reason = lines.find((line) => /error|ERR_/i.test(line)) ?? lines.slice(-1)[0] ?? '';
    return { ok: false, detail: [e.message.split('\n')[0], reason].filter(Boolean).join(' | ') };
  }
}

/** Eine Stufe ausführen und ihr Ergebnis festhalten (gedruckt wird später, in Reihenfolge). */
async function step(steps, name, fn) {
  try {
    await fn();
    steps.push({ name, ok: true });
  } catch (e) {
    steps.push({ name, ok: false, detail: e.message });
  }
}

/** Der Vorlauf: jedes Paket EINMAL packen (die Isolate brauchen einander). */
async function packPackage(pkg) {
  const packDir = join(WORK, 'work', pkg.dir);
  const tarballDir = join(WORK, 'tarballs', pkg.dir);
  try {
    cpSync(pkg.base, packDir, { recursive: true });
    mkdirSync(tarballDir, { recursive: true });
    const packed = await run('npm', ['pack', '--pack-destination', tarballDir, ...NPM_FLAGS], packDir);
    if (!packed.ok) throw new Error(packed.detail);
    const name = readdirSync(tarballDir).find((file) => file.endsWith('.tgz'));
    if (!name) throw new Error(`kein Tarball in ${tarballDir}`);
    tarballs.set(pkg.dir, join(tarballDir, name));
  } catch (error) {
    tarballErrors.set(pkg.dir, error.message);
  }
}

/** Die vier Stufen EINES Pakets — alle Zusagen unverändert, nur in einem Pool lauffähig. */
async function checkPackage(pkg) {
  const unpackDir = join(WORK, 'unpacked', pkg.dir);
  const consumerDir = join(WORK, 'consumer', pkg.dir);
  const steps = [];
  const tarball = tarballs.get(pkg.dir) ?? null;

  await step(steps, 'npm pack', async () => {
    if (tarball === null) throw new Error(tarballErrors.get(pkg.dir) ?? 'kein Tarball (Vorlauf abgebrochen)');
  });

  await step(steps, 'entpacken + Shipped-Dateien', async () => {
    if (tarball === null) throw new Error('kein Tarball (npm pack ist fehlgeschlagen)');
    mkdirSync(unpackDir, { recursive: true });
    const unpacked = await run('tar', ['-xzf', tarball, '-C', unpackDir]);
    if (!unpacked.ok) throw new Error(unpacked.detail);
    for (const file of new Set(shippedFiles(pkg))) {
      if (!existsSync(join(unpackDir, 'package', file))) throw new Error(`im Tarball fehlt: ${file}`);
    }
  });

  await step(steps, 'isoliert installieren', async () => {
    if (tarball === null) throw new Error('kein Tarball (npm pack ist fehlgeschlagen)');
    mkdirSync(consumerDir, { recursive: true });
    writeFileSync(join(consumerDir, 'package.json'), `${JSON.stringify({ name: `consumer-${pkg.dir}`, version: '1.0.0', private: true }, null, 2)}\n`);
    // Die lokalen Abhängigkeiten liegen als Tarball NEBEN dem eigenen — sonst
    // ginge `npm install` für `@shinon/seams` in die Registry und der Test
    // scheiterte an der Umgebung statt am Paket.
    const deps = localDeps(pkg).map((name) => {
      const dir = name.slice('@shinon/'.length);
      const path = tarballs.get(dir);
      if (path === undefined) throw new Error(`lokale Abhängigkeit ${name} hat keinen Tarball (${tarballErrors.get(dir) ?? 'nicht gepackt'})`);
      return path;
    });
    const installed = await run('npm', ['install', tarball, ...deps, ...NPM_FLAGS], consumerDir);
    if (!installed.ok) throw new Error(installed.detail);
  });

  await step(steps, `laden: ${pkg.want.name}`, async () => {
    const loaded = await run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pkg.want.name)});`], consumerDir);
    if (!loaded.ok) throw new Error(loaded.detail);
  });

  return { dir: pkg.dir, steps };
}

/** Begrenzter Pool: höchstens `size` Pakete gleichzeitig, Ergebnisse in Eingabereihenfolge. */
async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    for (let index = next; index < items.length; index = next) {
      next += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

const packages = repo.discover();
console.log('═══════════════════════════════════════');
console.log('  Shinon Forge Distributionstest');
console.log('═══════════════════════════════════════\n');
console.log(`  Pakete: ${packages.length}    Arbeit: ${WORK}`);
console.log(`  Parallel: ${POOL} Pakete gleichzeitig`);

if (packages.length === 0) {
  console.error('\n❌ Keine Pakete unter packages/* gefunden');
  process.exit(1);
}

const started = Date.now();
await pool(packages, POOL, packPackage);
const results = await pool(packages, POOL, checkPackage);

for (const { dir, steps } of results) {
  console.log(`\n${dir}`);
  for (const entry of steps) {
    if (entry.ok) {
      console.log(`  ✅ ${entry.name}`);
      passed++;
    } else {
      console.log(`  ❌ ${entry.name}: ${entry.detail}`);
      failed++;
    }
  }
}

console.log('\n═══════════════════════════════════════');
console.log(`  Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen`);
console.log(`  Dauer: ${((Date.now() - started) / 1000).toFixed(1)}s (Pool ${POOL})`);
console.log('═══════════════════════════════════════');
if (!process.argv.includes('--keep')) rmSync(WORK, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
