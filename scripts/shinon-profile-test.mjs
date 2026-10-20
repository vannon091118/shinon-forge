#!/usr/bin/env node
/**
 * shinon-profile-test.mjs - Exit Gate fuer das bootfaehige Profil (Block 2)
 *
 * Laedt das aktive Profil genau so, wie DSH es laedt:
 *
 *   DSH_HOME=<Repo-Root> dsh --profile <name> --dump-config
 *
 * Das Repo-Root ist ein gueltiges DSH_HOME, weil es profiles/ enthaelt; damit
 * ist der Lauf reproduzierbar, ohne etwas nach ~/.dsh zu installieren.
 *
 * Rot, solange profiles/<name> kein DSH-Profil ist (kein package.json ->
 * "profile does not exist"), gruen, sobald DSH das Profil aufloest und jeden
 * Bundle-Layer listet. Eingebunden in `npm test`.
 */
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as repo from './lib/repo.mjs';
import { seedDshHome } from './lib/dsh-home.mjs';

const root = repo.readRoot();
const profileArg = process.argv.indexOf('--profile');
const requestedProfile = profileArg >= 0 ? process.argv[profileArg + 1] : undefined;
const profileName = requestedProfile ?? repo.activeProfile(root);
const packages = repo.discover(root);
const profile = repo.resolveProfile(profileName, packages, root);

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('═══════════════════════════════════════');
console.log('  Shinon Forge Profiltest (DSH)');
console.log('═══════════════════════════════════════\n');

if (!profileName) {
  console.error('❌ Kein --profile in scripts.dev gefunden');
  process.exit(1);
}

const seededHome = mkdtempSync(join(tmpdir(), 'shinon-profile-home-'));
const seeded = seedDshHome(seededHome, repo.ROOT);
if (seeded.issues.length > 0) {
  console.error(`❌ DSH-Home nicht seedbar: ${seeded.issues.join(' | ')}`);
  process.exit(1);
}
console.log(`  Profil: ${profileName}    DSH_HOME: ${seededHome} (aus ${repo.ROOT} geseedet)`);
console.log(`  Bundles: ${profile.bundles.length} (${profile.entries.length} aus diesem Repo)\n`);

let dump = null;
check(`dsh --profile ${profileName} --dump-config`, () => {
  assert(existsSync(join(profile.dir, 'package.json')), `profiles/${profileName}/package.json fehlt`);
  try {
    dump = execFileSync('dsh', ['--profile', profileName, '--dump-config'], {
      cwd: repo.ROOT,
      env: { ...process.env, DSH_HOME: seededHome },
      encoding: 'utf8',
      timeout: 120000,
    });
  } catch (e) {
    const detail = String(e.stderr ?? e.message).split('\n').filter(Boolean).slice(-2).join(' | ');
    throw new Error(detail || 'dsh nicht ausfuehrbar');
  }
});

if (dump !== null) {
  const layers = dump.split('\n').filter((line) => line.startsWith('# == '));
  check(`listet alle ${profile.bundles.length} Bundle-Layer`, () => {
    const missing = profile.bundles.filter(
      (name) => !layers.some((line) => line.slice('# == '.length).split(', ').includes(name)),
    );
    assert(missing.length === 0, `fehlende Layer: ${missing.join(', ')}`);
  });

  check(`aktiviert die ${profile.entries.length} Paket-Bundles`, () => {
    const missing = profile.entries.filter((entry) => !new RegExp(`^- id: ${entry.id}$`, 'm').test(dump));
    assert(missing.length === 0, `fehlende Eintraege: ${missing.map((entry) => entry.id).join(', ')}`);
  });
}

// Der Boot oben sagt, dass das Profil AUFLÖST. Hier wird einmal WIRKLICH geladen,
// und zwar über den Pfad, den ein Bundel nimmt: `profiles/<name>/node_modules`
// vor dem Root-`node_modules` (Pitfall: ein Link woandershin beschattet das
// Paket, der Boot stirbt dann erst tief im Protocol). Der Prozess läuft mit dem
// Profil-Verzeichnis als cwd, damit die Auflösung genau diesen Weg geht; das
// Prompter-Bundel zieht seine drei neuen Module relativ und `@shinon/seams/core`
// aus dem Root-`node_modules`. Kein Modellaufruf, nur Laden.
check('laedt die Prompter-Module und @shinon/seams/core ueber die Profil-Links', () => {
  const probe = `
    import { realpathSync } from 'node:fs';
    import { createRequire } from 'node:module';
    import { dirname, join } from 'node:path';
    import { pathToFileURL } from 'node:url';
    const require = createRequire(join(process.cwd(), 'package.json'));
    const entry = realpathSync(require.resolve('@shinon/prompter'));
    const dir = dirname(entry);
    const bundle = await import(pathToFileURL(entry).href);
    const split = {};
    for (const name of ['pre-step.js', 'runtime-state.js', 'trace-report.js']) {
      split[name] = Object.keys(await import(pathToFileURL(join(dir, 'assets', name)).href)).length;
    }
    const core = realpathSync(createRequire(join(dir, 'package.json')).resolve('@shinon/seams/core'));
    const seams = await import(pathToFileURL(core).href);
    const probeResult = seams.resolveWorkspaceRoot({ configRoot: '/tmp/probe-root', env: { SHINON_WORKSPACE_ROOT: '/tmp/probe-env' }, cwd: '/tmp/probe-cwd' });
    process.stdout.write(JSON.stringify({ entry, exports: Object.keys(bundle).length, split, contract: seams.WORKSPACE_CONTRACT, root: probeResult.root, source: probeResult.source }));
  `;
  let out;
  try {
    out = execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: profile.dir,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error(String(e.stderr ?? e.message).trim().split('\n').pop() || 'Laden fehlgeschlagen');
  }
  const result = JSON.parse(out);
  assert(result.entry.endsWith(join('packages', 'prompter', 'index.js')), `Prompter aufgeloest nach ${result.entry}`);
  assert(result.exports > 0, 'Prompter exportiert nichts');
  for (const [name, count] of Object.entries(result.split)) assert(count > 0, `${name} exportiert nichts`);
  assert(result.contract === 'shinon.workspace/v1', `falscher Vertrag: ${result.contract}`);
  assert(result.root === '/tmp/probe-root' && result.source === 'config', `Identitaet falsch: ${result.root} (${result.source})`);
});

rmSync(seededHome, { recursive: true, force: true });

console.log('\n═══════════════════════════════════════');
console.log(`  Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen`);
console.log('═══════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
