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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as repo from './lib/repo.mjs';
import { dshBinary, dshSource } from './lib/dsh.mjs';
import { resolveRuntime } from './lib/runtime.mjs';
import { check as doctorCheck } from './gate/plugins/doctor.mjs';

/** Schlüssel, deren Anwesenheit gemeldet wird — nie deren Werte. */
export const PRESENCE_KEYS = ['AGNES_API_KEY', 'PROMPTER_API_KEY'];

function presence(env = process.env) {
  const out = {};
  for (const name of PRESENCE_KEYS) {
    const raw = env[name];
    out[name] = typeof raw === 'string' && raw.trim() !== '';
  }
  return out;
}

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
  const manifest = repo.readRoot();
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
  return {
    status,
    exitCode: status === 'ok' ? 0 : status === 'findings' ? 1 : 2,
    environmentError,
    node: { ok: runtimeOk, version: runtime.version ?? null, range: runtime.range ?? null },
    dsh: { ok: dsh.ok, version: dsh.version, source: dsh.kind, root: dsh.root },
    profile: { name: profileName, patchPresent: profilePatchPresent, bundleIssues },
    findings,
    keys: presence(env),
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
    lines.push(`     ${present ? '●' : '○'} ${name}: ${present ? 'gesetzt' : 'fehlt'}`);
  }
  if (report.environmentError !== null) lines.push(`   Umgebung: ${report.environmentError}`);
  lines.push(`   Exit:    ${report.exitCode} (0 gesund · 1 Befunde · 2 Umgebung)`);
  return `${lines.join('\n')}\n`;
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rootIndex = args.indexOf('--root');
const overrideRoot = rootIndex === -1 ? undefined : args[rootIndex + 1];
if (rootIndex !== -1 && (overrideRoot === undefined || overrideRoot.startsWith('--'))) {
  console.error('Usage: node scripts/doctor.mjs [--json] [--root <pfad>]');
  process.exit(2);
}

const report = diagnose(overrideRoot === undefined ? {} : { root: overrideRoot });
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  process.stdout.write(renderHuman(report));
}
process.exit(report.exitCode);
