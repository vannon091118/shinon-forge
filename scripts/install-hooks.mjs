#!/usr/bin/env node
/**
 * install-hooks.mjs — repo-lokale Git-Hooks für die Commit-Regeln.
 *
 * Zwei Hooks, zwei Richtungen:
 *   prepare-commit-msg  tauscht verbotene Footer gegen den Vannon-Trailer
 *                       (lokal ist Reparatur erlaubt — sonst wäre jeder
 *                       Agent-Commit Handarbeit).
 *   commit-msg          prüft fail-closed. Ohne Trailer kein Commit.
 *
 * Kein Husky, keine Dependency: die Hooks liegen in .githooks/ und werden über
 * `core.hooksPath` aktiviert. Das ist eine repo-lokale Einstellung — pro Klon
 * einmal `npm run hooks:install`.
 *
 * Idempotent: erneutes Ausführen überschreibt nur die eigenen Dateien.
 * Fremde Hook-Pfade werden nicht überschrieben, außer mit --force.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VANNON_TRAILER } from './lib/commit-text.mjs';

const HOOKS_DIR = join(process.cwd(), '.githooks');
const force = process.argv.includes('--force');

const HOOKS = {
  'prepare-commit-msg': `#!/usr/bin/env sh
# Shinon prepare-commit-msg — tauscht verbotene KI-Footer gegen den Vannon-Trailer.
# Der Hook repariert nur; die Entscheidung trifft commit-msg (fail-closed).
set -e
node scripts/commit-guard.mjs --file "$1" --fix
`,
  'commit-msg': `#!/usr/bin/env sh
# Shinon commit-msg — fail-closed: kein KI-Footer, Vannon-Trailer Pflicht.
set -e
node scripts/commit-guard.mjs --file "$1"
`,
};

function gitConfig(key) {
  try {
    return execFileSync('git', ['config', '--local', '--get', key], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

if (!existsSync(join(process.cwd(), '.git'))) {
  console.error('💥 hooks:install — kein Git-Repository (./.git fehlt).');
  process.exit(1);
}

const current = gitConfig('core.hooksPath');
if (current !== '' && current !== '.githooks' && !force) {
  console.error(`💥 hooks:install — core.hooksPath zeigt bereits auf "${current}".`);
  console.error('   Nichts überschrieben. Mit --force übernehmen oder hooksPath zurücksetzen.');
  process.exit(1);
}

mkdirSync(HOOKS_DIR, { recursive: true });
for (const [name, content] of Object.entries(HOOKS)) {
  const file = join(HOOKS_DIR, name);
  writeFileSync(file, content, 'utf8');
  chmodSync(file, 0o755);
  console.log(`  ✓ .githooks/${name}`);
}

execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
console.log('  ✓ core.hooksPath = .githooks');
console.log(`\n🦊 Commit-Regeln aktiv: kein KI-Footer, Trailer Pflicht.`);
console.log(`   ${VANNON_TRAILER}`);
console.log('   CI prüft denselben Vertrag: .github/workflows/commit-guard.yml');
