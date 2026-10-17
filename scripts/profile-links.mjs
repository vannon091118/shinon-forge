#!/usr/bin/env node
/**
 * scripts/profile-links.mjs — die Bündel-Links der Profile aus ihren Manifesten setzen.
 *
 * Warum dieses Werkzeug existiert: ein Profil-Start löst jedes Bündel zuerst über
 * `profiles/<name>/node_modules/` auf. Wird dort ein Link auf ein Ziel AUSSERHALB
 * dieses Repos gesetzt — gemessen 2026-10-17: `@shinon/traceability` →
 * `../../../Projekt Type/traceability-proto` —, dann beschattet fremder Code das
 * Repo-Paket, ohne dass ein Gate es merkt: `packages/traceability` wird nie
 * → Kanon: docs/COMMENT-KANON.md#k-c21108faa677
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as repo from './lib/repo.mjs';

const args = process.argv.slice(2);
const check = args.includes('--check');
const quiet = args.includes('--quiet');
const profileIndex = args.indexOf('--profile');
const only = profileIndex === -1 ? null : args[profileIndex + 1];
if (profileIndex !== -1 && (only === undefined || only.startsWith('--'))) {
  console.error('Usage: node scripts/profile-links.mjs [--check] [--profile <name>] [--quiet]');
  process.exit(2);
}

const say = (line) => {
  if (!quiet) console.log(line);
};

/** Alle Profile, die ein Manifest haben — das aktive zuerst. */
function profileDirs() {
  const names = readdirSync(repo.PROFILES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(repo.PROFILES_DIR, name, 'package.json')))
    .sort();
  if (only === null) return names;
  if (!names.includes(only)) {
    console.error(`💥 profile-links: kein Profil "${only}" mit package.json unter profiles/`);
    process.exit(2);
  }
  return [only];
}

/**
 * Der Plan eines Profils: was gesetzt würde und was verweigert wird. Getrennt,
 * damit erst ALLES geprüft und danach geschrieben werden kann — ein Abbruch in
 * der Mitte dürfte keinen halb gesetzten Baum hinterlassen.
 */
function planProfile(profileDir, packagesDir) {
  const manifestFile = join(profileDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const show = (file) => relative(repo.ROOT, file);
  const steps = [];
  const refusals = [];
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    const declared = /^(?:link|file):(.+)$/.exec(String(spec));
    if (declared === null) continue; // Versionsangaben sind nicht Sache dieses Werkzeugs
    const target = resolve(profileDir, declared[1]);
    const linkPath = join(profileDir, 'node_modules', ...name.split('/'));
    if (!(target === packagesDir || target.startsWith(`${packagesDir}${sep}`))) {
      refusals.push(`${show(manifestFile)}: ${name} → ${target} zeigt aus ${show(packagesDir)} heraus — nicht gesetzt`);
      continue;
    }
    const targetManifest = join(target, 'package.json');
    if (!existsSync(targetManifest)) {
      refusals.push(`${show(manifestFile)}: ${name} → ${target} fehlt — nicht gesetzt`);
      continue;
    }
    const targetName = JSON.parse(readFileSync(targetManifest, 'utf8')).name;
    if (targetName !== name) {
      refusals.push(`${show(manifestFile)}: ${name} → ${target} deklariert sich als "${targetName}" — nicht gesetzt`);
      continue;
    }

    let existing = null;
    try {
      existing = lstatSync(linkPath);
    } catch {
      existing = null;
    }
    if (existing !== null && !existing.isSymbolicLink()) {
      refusals.push(
        `${show(linkPath)} ist keine Verknüpfung, sondern eine echte Kopie — nicht gelöscht; ` +
          'bitte von Hand entfernen und erneut laufen lassen',
      );
      continue;
    }
    const wanted = relative(dirname(linkPath), target);
    // Ein Link ins Leere wirft bei realpathSync — genau er ist ein Verstoss.
    let current = null;
    if (existing !== null) {
      try {
        current = realpathSync(linkPath);
      } catch {
        current = null;
      }
    }
    if (existing !== null && current === realpathSync(target)) {
      steps.push({ name, linkPath, wanted, action: 'gleich' });
      continue;
    }
    steps.push({ name, linkPath, wanted, action: existing === null ? 'neu' : 'ersetzt' });
  }
  return { steps, refusals };
}

const profiles = profileDirs();
const plans = profiles.map((name) => ({ name, dir: join(repo.PROFILES_DIR, name), ...planProfile(join(repo.PROFILES_DIR, name), repo.PACKAGES_DIR) }));

const refusals = plans.flatMap((plan) => plan.refusals);
if (refusals.length) {
  console.error(`💥 profile-links: ${refusals.length} Verweigerung(en) — nichts geschrieben`);
  for (const refusal of refusals) console.error(`   - ${refusal}`);
  process.exit(2);
}

const changes = plans.flatMap((plan) => plan.steps.filter((step) => step.action !== 'gleich'));
// Der Grad ist die Unterscheidung: ein Link, der woandershin zeigt, beschattet ein
// Paket (Bootschaden). Ein fehlender Link ist der Normalzustand vor der Installation.
const violations = changes.filter((step) => step.action === 'ersetzt');
const missing = changes.filter((step) => step.action === 'neu');

if (check) {
  for (const plan of plans) {
    for (const step of plan.steps) {
      if (step.action === 'gleich') continue;
      const at = `profiles/${plan.name}/node_modules/${step.name}`;
      if (step.action === 'ersetzt') console.log(`💥 ${at} → ${step.wanted} zeigt woandershin (oder ins Leere)`);
      else if (!quiet) console.log(`–  ${at} → ${step.wanted} (fehlt; vor dem Start zu setzen)`);
    }
  }
  const total = plans.reduce((sum, plan) => sum + plan.steps.length, 0);
  if (violations.length === 0) {
    say(`✅ profile-links --check: ${plans.length} Profil(e), ${total} Links — kein Link zeigt woandershin (${missing.length} noch zu setzen)`);
    process.exit(0);
  }
  console.error(`\n💥 profile-links --check: ${violations.length} Link(s) zeigen woandershin und beschatten ein Paket — Abhilfe: node scripts/profile-links.mjs`);
  process.exit(1);
}

for (const plan of plans) {
  const touched = plan.steps.filter((step) => step.action !== 'gleich');
  for (const step of touched) {
    mkdirSync(dirname(step.linkPath), { recursive: true });
    if (step.action === 'ersetzt') rmSync(step.linkPath, { force: true });
    symlinkSync(step.wanted, step.linkPath, 'dir');
  }
  const summary = touched.length === 0
    ? `${plan.steps.length} Links unverändert`
    : `${touched.length} gesetzt (${touched.map((step) => step.name).join(', ')})`;
  say(`  ✓ Profil ${plan.name}: ${summary}`);
}
say(`\n✅ profile-links: ${plans.length} Profil(e), ${changes.length} Link(s) gesetzt.`);
