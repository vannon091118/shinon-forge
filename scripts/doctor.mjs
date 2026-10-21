#!/usr/bin/env node
/**
 * scripts/doctor.mjs — `shinon doctor`, die Laufzeit-Diagnose (Release-Slice S4).
 *
 * Was das ist: ein read-only Unterbefehl des Einstiegs (`bin/shinon.mjs` reicht
 * `doctor` hierher durch, statt es an DSH weiterzugeben). Er misst die
 * Laufzeit-Gesundheit in einer frischen Umgebung: Node-Range, dsh-Auflösung,
 * Profil-Bündel-Auflösung, statische Repo-Konsistenz (dieselbe Regel wie das
 * Gate-Plugin `scripts/gate/plugins/doctor.mjs`, kein zweiter Regelsatz) und
 * Schlüssel-Präsenz. Er schreibt nichts: kein Profil-Link, kein Index, kein
 * Log, kein DSH-Start.
 *
 * Exit-Codes (stabil, in PLAN.md §9.1 S4 dokumentiert):
 *   0 = gesund (keine Befunde)
 *   1 = Befunde (Repo-Drift oder Bündel-Verstoß — behebbar, kein Absturz)
 *   2 = Umgebung (kein tauglicher Node, kein dsh, kein Profil — fail-closed)
 *
 * Schlüssel sind presence-only: der Bericht nennt je Name nur vorhanden/fehlt,
 * niemals Werte, Längen oder Präfixe. Ein Test setzt einen Fake-Wert und
 * prüft, dass er in stdout/stderr nicht vorkommt.
 *
 * Aufruf:  node scripts/doctor.mjs [--json] [--root <pfad>]
 *           shinon doctor [--json]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as repo from './lib/repo.mjs';
import { dshBinary, dshSource } from './lib/dsh.mjs';
import { resolveRuntime } from './lib/runtime.mjs';
import { check as doctorCheck } from './gate/plugins/doctor.mjs';
import { PRESENCE_KEYS, credentialNames, envNames, keyPresence } from './lib/secrets.mjs';
import { describePaths } from './lib/paths.mjs';

/** Schlüssel, deren Anwesenheit gemeldet wird — nie deren Werte. */
export { PRESENCE_KEYS };

/** Nur die Ja/Nein-Sicht der Anwesenheit (die Quelle steht daneben). */
const flagsOf = (keys) => Object.fromEntries(Object.entries(keys).map(([name, entry]) => [name, entry.present]));

function probeDsh(runtime) {
  const binary = dshBinary();
  const source = dshSource();
  if (binary === null) {
    return { ok: false, version: null, kind: source?.kind ?? null, root: source?.root ?? null };
  }
  const probed = spawnSync(binary[0], [...binary.slice(1), '--version'], { encoding: 'utf8' });
  if (probed.status !== 0) {
    return { ok: false, version: null, kind: source?.kind ?? null, root: source?.root ?? null };
  }
  return {
    ok: true,
    version: (probed.stdout ?? '').trim().split('\n')[0] || null,
    kind: source?.kind ?? null,
    root: source?.root ?? null,
  };
}

/**
 * Die Diagnose, ohne einen einzigen Schreibaufruf: nur lesen, auflösen,
 * Version abfragen. `root` ist das Repo (Default: dieser Klon), `env` die
 * Umgebung für die Presence-Probe.
 */
export function diagnose({ root = repo.ROOT, env = process.env } = {}) {
  const findings = [];
  let environmentError = null;

  // 1. Node-Laufzeit (Range aus engines, sqlite-Rauchtest — resolveRuntime).
  const runtime = resolveRuntime();
  const runtimeOk = runtime.binary !== null;
  if (!runtimeOk) environmentError ??= 'keine taugliche Node-Laufzeit (engines-Range oder node:sqlite-Rauchtest)';

  // 2. dsh-Auflösung + --version (nur lesen, kein Start, kein Profil-Boot).
  const dsh = probeDsh(runtime);
  if (!dsh.ok) environmentError ??= 'kein lauffähiges dsh gefunden (Repo-Installat, Vendor, bekannte Prefixe)';

  // 3. Profil + Bündel-Auflösung (EINE Regel: repo.bundleResolutionIssues).
  //    `--root` verlegt nur das gelesene Manifest (fail-closed bei unlesbarem
  //    oder ungültigem JSON) — der Rest bleibt an diesem Repo verankert.
  let manifest;
  if (root === repo.ROOT) {
    manifest = repo.readRoot();
  } else {
    const file = join(root, 'package.json');
    try {
      manifest = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new Error(`--root ${root}: ${file} ist nicht lesbar oder kein gültiges JSON`);
    }
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error(`--root ${root}: ${file} enthält kein Manifest-Objekt`);
    }
  }
  const profileName = repo.activeProfile(manifest);
  if (profileName === null) {
    environmentError ??= 'kein --profile im dev-Skript (package.json) gefunden';
  }
  const bundleIssues = repo.bundleResolutionIssues(manifest);
  findings.push(...bundleIssues);

  // 4. Statische Repo-Konsistenz (DERSELBE check wie das Gate-Plugin).
  const packages = repo.discover(manifest);
  findings.push(...doctorCheck({ root: manifest, packages }));

  // 5. Profil-Manifest lesbar (Anwesenheit, kein Boot).
  const patchFile = profileName === null ? null : join(repo.PROFILES_DIR, profileName, 'cordis.patch.yml');
  const profilePatchPresent = patchFile !== null && existsSync(patchFile);
  if (profileName !== null && !profilePatchPresent) {
    findings.push(`profiles/${profileName}/cordis.patch.yml fehlt`);
  }

  const status = environmentError !== null ? 'error' : findings.length > 0 ? 'findings' : 'ok';
  const envFile = join(root, '.env');
  // Der Zugangsspeicher liegt im DSH-Home (Zustand, nicht im Repo) — dort
  // schreibt DSH den Schlüssel, den die UI annimmt.
  // Der Pfad kommt aus der ECHTEN Umgebung: `env` ist die Sonde für die
  // Schlüsselnamen, kein Ersatz für die Zustandsordner des Prozesses.
  const credentialsFile = join(describePaths().dshHome, '.credentials.yaml');
  const keys = keyPresence(env, envFile, credentialsFile);
  return {
    status,
    exitCode: status === 'ok' ? 0 : status === 'findings' ? 1 : 2,
    environmentError,
    node: { ok: runtimeOk, version: runtime.version ?? null, range: runtime.range ?? null },
    dsh: { ok: dsh.ok, version: dsh.version, source: dsh.kind, root: dsh.root },
    profile: { name: profileName, patchPresent: profilePatchPresent, bundleIssues },
    findings,
    // `keys` bleibt die Ja/Nein-Sicht; `keySources` nennt die Herkunft, damit
    // "gesetzt" nicht die Frage offen laesst, WOHER der Start ihn bekommt.
    keys: flagsOf(keys),
    keySources: Object.fromEntries(Object.entries(keys).map(([name, entry]) => [name, entry.source])),
    envFile: { path: envFile, present: existsSync(envFile), names: [...envNames(envFile)].length },
    credentials: { path: credentialsFile, present: existsSync(credentialsFile), names: [...credentialNames(credentialsFile)].length },
  };
}

function renderHuman(report) {
  const mark = report.status === 'ok' ? '✅' : report.status === 'findings' ? '⚠️' : '💥';
  const lines = [`${mark} shinon doctor — ${report.status}`];
  lines.push(`   node:    ${report.node.ok ? `ok (${report.node.version}, Range ${report.node.range})` : 'FEHLT — engines-Range aus package.json prüfen'}`);
  lines.push(`   dsh:     ${report.dsh.ok ? `ok (${report.dsh.version ?? 'unbekannt'} — ${report.dsh.source ?? '?'})` : 'FEHLT — npm install ausführen'}`);
  lines.push(`   Profil:  ${report.profile.name ?? '(keins)'}${report.profile.patchPresent ? '' : ' — cordis.patch.yml fehlt'}`);
  lines.push(`   Befunde: ${report.findings.length === 0 ? 'keine' : ''}`);
  for (const issue of report.findings) lines.push(`     - ${issue}`);
  lines.push('   Schlüssel (nur Anwesenheit, nie Werte):');
  for (const [name, present] of Object.entries(report.keys)) {
    const source = report.keySources?.[name];
    const where = source === 'env' ? ' (Umgebung)' : source === 'env-file' ? ' (.env)' : source === 'credentials' ? ' (Zugangsdatei des DSH-Homes)' : '';
    lines.push(`     ${present ? '●' : '○'} ${name}: ${present ? `gesetzt${where}` : 'fehlt'}`);
  }
  if (report.envFile !== undefined && !report.envFile.present) {
    lines.push(`     · ${report.envFile.path} fehlt — ein Start ohne Schlüssel meldet MISSING_CREDENTIAL`);
  }
  if (report.environmentError !== null) lines.push(`   Umgebung: ${report.environmentError}`);
  lines.push(`   Exit:    ${report.exitCode} (0 gesund · 1 Befunde · 2 Umgebung)`);
  return `${lines.join('\n')}\n`;
}

const USAGE = 'Usage: node scripts/doctor.mjs [--json] [--root <pfad>]\n       shinon doctor [--json]\nExit: 0 gesund · 1 Befunde · 2 Umgebung (fail-closed, schreibt nichts)';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const asJson = args.includes('--json');
const rootIndex = args.indexOf('--root');
const overrideRoot = rootIndex === -1 ? undefined : args[rootIndex + 1];
if (rootIndex !== -1 && (overrideRoot === undefined || overrideRoot.startsWith('--'))) {
  console.error(USAGE);
  process.exit(2);
}

let report;
try {
  report = diagnose(overrideRoot === undefined ? {} : { root: overrideRoot });
} catch (error) {
  console.error(`💥 shinon doctor: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  process.stdout.write(renderHuman(report));
}
process.exit(report.exitCode);
