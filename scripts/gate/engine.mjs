#!/usr/bin/env node
/**
 * scripts/gate/engine.mjs — Shinon Gate Engine (Wave 0)
 *
 * Modularer, slice-fähiger Runner. Ersetzt dsh-test.mjs nicht, sondern ergänzt
 * es: derselbe Vertrag (scripts/lib/repo.mjs ist die eine Quelle), aber pro
 * Fähigkeit als eigenes Plugin, ausgewählt über den geänderten Dateipfad.
 *
 * Modi:
 *   (default)   SLICE    — nur Gates mit passendem Slice im staged Diff
 *   --local     LOCAL    — die kurze Menge aus policy.engine.local (Hooks)
 *   --full      FULL     — alle Gates gegen den Stand vs. HEAD (CI)
 *   --release   RELEASE  — wie --full, für den Release-Lauf
 *
 * Läuft ohne node_modules — nur node:-Module und scripts/lib/repo.mjs.
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

  const mode = localOnly ? 'LOCAL' : release ? 'RELEASE' : forceFull ? 'FULL' : 'SLICE';
  console.log(`🦊 Shinon Gate — ${mode} — ${changed.length} geänderte Dateien · ${packages.length} Pakete`);

  let failed = 0;
  let ran = 0;
  let skipped = 0;

  for (const plugin of plugins) {
    const run = localOnly
      ? shouldRunLocal(plugin.id)
      : shouldRun(plugin.id, changed, forceFull);
    if (!run) {
      console.log(`⏭️  ${plugin.id} — geskippt (kein relevanter Slice)`);
      skipped++;
      continue;
    }
    ran++;
    let issues;
    try {
      issues = plugin.check(ctx) || [];
    } catch (error) {
      issues = [`Plugin-Fehler: ${error.message}`];
    }
    if (issues.length === 0) {
      console.log(`✅ ${plugin.id}`);
    } else {
      console.error(`💥 ${plugin.id} — ${issues.length} Problem(e)`);
      for (const issue of issues) console.error(`   - ${issue}`);
      failed++;
    }
  }

  console.log(
    `\n${failed === 0 ? '✅' : '💥'} Verdict: ${failed === 0 ? 'PASS' : 'FAIL'} — ${ran} gelaufen, ${skipped} geskippt, ${failed} fehlgeschlagen`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

// Nur als CLI ausführen, nicht beim Import (Tests importieren die Helfer).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
