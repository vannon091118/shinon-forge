#!/usr/bin/env node
/**
 * scripts/gate/engine.mjs — Shinon Gate Engine (Wave 0)
 *
 * Modularer, slice-fähiger Runner. Ersetzt shinon-test.mjs nicht, sondern ergänzt
 * es: derselbe Vertrag (scripts/lib/repo.mjs ist die eine Quelle), aber pro
 * Fähigkeit als eigenes Plugin, ausgewählt über den geänderten Dateipfad.
 *
 * Modi:
 *   (default)   SLICE    — nur Gates mit passendem Slice im staged Diff
 *   --local     LOCAL    — die kurze Menge aus policy.engine.local (Hooks)
 *   --full      FULL     — alle Gates gegen den Stand vs. HEAD (CI)
 *   --release   RELEASE  — wie --full, für den Release-Lauf
 *   --branding  Zusatzstufe: die Wirkungs-Messung im echten Chromium
 *               (scripts/branding-check.mjs) läuft mit. Ohne das Flag steht sie als
 *               sichtbarer Skip mit Grund in der Ausgabe — sie braucht `dist/` und
 *               ein Browser-Binary und ist deshalb kein Gate der schnellen Läufe.
 *
 * Benötigt für YAML-Plugins `js-yaml` aus dem DSH-PATH oder Repo-node_modules;
 * die Engine selbst nutzt zusätzlich nur node:-Module und scripts/lib.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as repo from '../lib/repo.mjs';
import { POLICY } from './policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(HERE, 'plugins');

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', cwd: repo.ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

const lines = (out) => out.split('\n').map((s) => s.trim()).filter(Boolean);

/** Staged Diff (pre-commit-Kontext). */
function stagedFiles() {
  return lines(git(['diff', '--cached', '--name-only']));
}

/** Staged + unstaged vs. HEAD (CI-Kontext). Leer ohne Commits. */
function allChangedFiles() {
  return [...new Set([...lines(git(['diff', '--name-only', 'HEAD'])), ...stagedFiles()])];
}

export function matchesSlice(file, slice) {
  return (
    (slice.prefixes || []).some((prefix) => file.startsWith(prefix)) ||
    (slice.contains || []).some((part) => file.includes(part))
  );
}

export function shouldRun(id, changed, forceFull, policy = POLICY) {
  if (forceFull) return true;
  if (policy.engine.always.includes(id)) return true;
  const slice = policy.engine.slices[id];
  if (!slice) return true;
  return changed.some((file) => matchesSlice(file, slice));
}

export function shouldRunLocal(id, policy = POLICY) {
  return policy.engine.local.includes(id);
}

/** Normalize legacy issue-array plugins and richer status-bearing plugins. */
export function normalizePluginResult(result) {
  if (Array.isArray(result)) return { issues: result, status: 'pass', detail: '' };
  if (result && typeof result === 'object' && Array.isArray(result.issues)) {
    const status = typeof result.status === 'string' ? result.status : 'pass';
    if (!['pass', 'not-applicable', 'fail'].includes(status)) {
      return { issues: ['Plugin returned an unsupported status'], status: 'fail', detail: '' };
    }
    return {
      issues: result.issues,
      status,
      detail: typeof result.detail === 'string' ? result.detail : '',
    };
  }
  if (result == null) return { issues: [], status: 'pass', detail: '' };
  return { issues: ['Plugin returned neither an issue array nor a valid result object'], status: 'fail', detail: '' };
}

export async function loadPlugins() {
  const files = readdirSync(PLUGIN_DIR).filter((f) => f.endsWith('.mjs')).sort();
  const plugins = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(PLUGIN_DIR, file)).href);
    if (typeof mod.check !== 'function') continue;
    plugins.push({ id: mod.id ?? file.replace(/\.mjs$/, ''), check: mod.check });
  }
  return plugins;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
  if (onlyIndex >= 0 && (!only || only.startsWith('--'))) {
    console.error('Usage: node scripts/gate/engine.mjs --only <plugin-id>');
    process.exit(2);
  }
  const localOnly = args.includes('--local');
  const release = args.includes('--release');
  const forceFull = release || args.includes('--full') || args.includes('--push');
  const changed = localOnly ? [] : forceFull ? allChangedFiles() : stagedFiles();

  const root = repo.readRoot();
  const packages = repo.discover(root);
  const ctx = { root, packages, changed, repo };

  const plugins = await loadPlugins();
  if (plugins.length === 0) {
    console.error('💥 Keine Gate-Plugins in scripts/gate/plugins/ gefunden');
    process.exit(1);
  }

  if (only && !plugins.some((plugin) => plugin.id === only)) {
    console.error(`Unknown gate plugin: ${only}`);
    process.exit(2);
  }

  const mode = only ? `ONLY:${only}` : localOnly ? 'LOCAL' : release ? 'RELEASE' : forceFull ? 'FULL' : 'SLICE';
  console.log(`🦊 Shinon Gate — ${mode} — ${changed.length} geänderte Dateien · ${packages.length} Pakete`);

  let failed = 0;
  let ran = 0;
  let skipped = 0;
  let notApplicable = 0;

  for (const plugin of plugins) {
    const run = only
      ? plugin.id === only
      : localOnly
        ? shouldRunLocal(plugin.id)
        : shouldRun(plugin.id, changed, forceFull);
    if (!run) {
      console.log(`⏭️  ${plugin.id} — geskippt (kein relevanter Slice)`);
      skipped++;
      continue;
    }
    ran++;
    let outcome;
    try {
      outcome = normalizePluginResult(plugin.check(ctx));
    } catch (error) {
      outcome = normalizePluginResult([`Plugin-Fehler: ${error.message}`]);
    }
    const { issues } = outcome;
    if (outcome.status === 'not-applicable' && issues.length === 0) {
      console.log(`ℹ️  ${plugin.id} — NOT_APPLICABLE${outcome.detail ? ` — ${outcome.detail}` : ''}`);
      notApplicable++;
    } else if (issues.length === 0) {
      console.log(`✅ ${plugin.id}`);
    } else {
      console.error(`💥 ${plugin.id} — ${issues.length} Problem(e)`);
      for (const issue of issues) console.error(`   - ${issue}`);
      failed++;
    }
  }

  // Die optionale Wirkungs-Messung: sie ist KEIN Gate (kein statischer Slice, sie
  // braucht ein gebautes `dist/` und ein Browser-Binary), aber sie ist auch kein
  // toter Code — deshalb hängt sie mit sichtbarem Grund an dieser Engine.
  const branding = args.includes('--branding');
  let brandingFailed = 0;
  if (branding) {
    console.log('🌐 branding — Wirkungs-Messung im echten Chromium (dist/packages/core/client.js)');
    try {
      execFileSync(process.execPath, [join(HERE, '..', 'branding-check.mjs')], { stdio: 'inherit', cwd: repo.ROOT });
    } catch (error) {
      brandingFailed = 1;
      console.error(`💥 branding — ${error.message}`);
    }
  } else {
    console.log('⏭️  branding — nicht gelaufen (nur mit --branding; braucht `npm run build` und Chromium)');
  }

  console.log(
    `\n${failed + brandingFailed === 0 ? '✅' : '💥'} Verdict: ${failed + brandingFailed === 0 ? 'PASS' : 'FAIL'} — ` +
      `${ran} gelaufen, ${skipped} geskippt, ${notApplicable} nicht anwendbar, ${failed} fehlgeschlagen` +
      (branding ? `, Branding-Messung ${brandingFailed === 0 ? 'grün' : 'rot'}` : ', Branding-Messung nicht gelaufen'),
  );
  process.exit(failed + brandingFailed > 0 ? 1 : 0);
}

// Nur als CLI ausführen, nicht beim Import (Tests importieren die Helfer).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
