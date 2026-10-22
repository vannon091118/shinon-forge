#!/usr/bin/env node
/**
 * Create and manage clean task worktrees outside the repository checkout.
 * The script stores no Freebuff metadata and never force-removes a worktree.
 */
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const command = args[0] ?? 'help';

function runGit(gitArgs, options = {}) {
  return spawnSync('git', gitArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function fail(message) {
  console.error(`remote-worktree: ${message}`);
  process.exitCode = 1;
}

function usage() {
  console.log(`Usage:
  node scripts/remote-worktree.mjs create <slug>
  node scripts/remote-worktree.mjs list
  node scripts/remote-worktree.mjs remove <worktree-path>

Creates branch work/<slug> in an external worktree. Set SHINON_WORKTREE_HOME
to change the base directory; default: ~/.local/state/shinon-forge/worktrees.`);
}

if (command === 'help' || command === '--help' || command === '-h') {
  usage();
} else if (command === 'list') {
  const result = runGit(['worktree', 'list']);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} else if (command === 'create') {
  const slug = args[1];
  if (args.length !== 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '')) {
    fail('create erwartet genau einen Kleinbuchstaben-Slug, zum Beispiel readme-faq');
  } else {
    const branch = `work/${slug}`;
    const check = runGit(['check-ref-format', '--branch', branch], { capture: true });
    const exists = runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { capture: true });
    if (check.status !== 0) fail(`ungueltiger Branch-Name: ${branch}`);
    else if (exists.status === 0) fail(`Branch ${branch} existiert bereits; vorhandene Branches nicht verschieben`);
    else if (exists.status !== 1) fail(`Branch ${branch} konnte nicht geprueft werden`);
    else {
      const stateHome = process.env.XDG_STATE_HOME?.trim() || join(homedir(), '.local', 'state');
      const worktreeHome = resolve(process.env.SHINON_WORKTREE_HOME?.trim() || join(stateHome, 'shinon-forge', 'worktrees'));
      const path = join(worktreeHome, slug);
      const relativeBase = relative(resolve(ROOT), worktreeHome);
      const insideRepo = relativeBase === '' || (relativeBase !== '..' && !relativeBase.startsWith(`..${sep}`) && !isAbsolute(relativeBase));
      if (insideRepo) fail('SHINON_WORKTREE_HOME muss ausserhalb des Repos liegen');
      else {
        const add = runGit(['worktree', 'add', '-b', branch, path, 'HEAD']);
        if (add.status !== 0) process.exitCode = add.status ?? 1;
        else console.log(`\nWorktree bereit: ${path}\nBranch: ${branch}\nZum Remote pushen: git push -u origin ${branch}`);
      }
    }
  }
} else if (command === 'remove') {
  if (args.length !== 2 || !args[1]) fail('remove erwartet genau einen Worktree-Pfad');
  else {
    const target = resolve(args[1]);
    const listed = runGit(['worktree', 'list', '--porcelain'], { capture: true });
    if (listed.status !== 0) fail('Git konnte die Worktrees nicht auflisten');
    else {
      const worktreePaths = listed.stdout.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => resolve(line.slice(9)));
      const primary = worktreePaths[0];
      const current = resolve(ROOT);
      if (target === primary || target === current) fail('Haupt- und aktueller Checkout koennen nicht entfernt werden');
      else if (!worktreePaths.includes(target)) fail(`kein registrierter Git-Worktree: ${target}`);
      else {
        const remove = runGit(['worktree', 'remove', target]);
        if (remove.status !== 0) process.exitCode = remove.status ?? 1;
      }
    }
  }
} else {
  usage();
  fail(`unbekannter Befehl: ${command}`);
}
