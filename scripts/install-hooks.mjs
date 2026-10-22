#!/usr/bin/env node
/**
 * install-hooks.mjs — repo-lokale Git-Hooks für die Commit-Regeln.
 *
 * Vier Hooks, vier Richtungen:
 *   pre-commit          fährt die schnelle lokale Linie (`npm test`: statisches
 *                       Gate + lokale Slices, Sekunden). Der volle Lauf gehört
 *                       in CI (`test:full`) — wer hier die Kette verlängert,
 *                       zahlt sie bei jedem Commit. Fail-closed: rot bleibt draußen.
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
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VANNON_TRAILER } from './lib/commit-text.mjs';

const HOOKS_DIR = join(process.cwd(), '.githooks');
const force = process.argv.includes('--force');

const HOOKS = {
  'pre-commit': `#!/usr/bin/env sh
# Shinon pre-commit — die schnelle lokale Linie (Sekunden, nicht Minuten).
# §1 der ZAHLEN ist generiert: er muss VOR dem Commit stimmen (kein Direct-Write,
# nur die Pruefung). §2 bleibt ein datierter Messwert und wird hier nicht
# angefasst. Der volle Lauf (test:full) gehoert in CI.
set -e
npm run zahlen:check
npm test
`,
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
  'pre-push': `#!/usr/bin/env sh
# Shinon pre-push — fail-closed, aber OHNE die lokale Hardware zu blockieren.
#
# WARUM ANDERS als pre-commit: der pre-commit faehrt die schnelle lokale
# Linie (Sekunden). Der pre-push darf die SCHWERE Linie nicht fahren — die
# macht die CI (test:full, gate:full, build, Distribution). Wer hier die
# schwere Linie einbaut, zahlt sie bei jedem Push.
#
# WAS ER PRUEFT (alles lokal billig, alles fail-closed):
#   1. Merge-Marker im Baum
#   2. Whitespace-Fehler im Index
#   3. npm run zahlen:check   (der generierte Zahlenblock)
#   4. npm run gate:local    (die statischen Gate-Slices)
#   5. kein unfertiges Paket (Manifest + Patch + mindestens eine Faehigkeit)
#
# WAS ER NICHT PRUEFT (das macht die CI, TIER 4): test:full, gate:full,
# build, Distribution, Profile-Boot, Branding — und die Testketten ueber
# 10 s (AGENTS.md, Testzeit-Grenze).
set -e

say() { printf '%s\\n' "pre-push: $*" >&2; }
die() { say "BLOCKIERT — $*"; exit 1; }

if git grep -lI --quiet -e '^<<<<<<<' -e '^>>>>>>>' -- . 2>/dev/null; then
  say "Merge-Marker gefunden:"
  git grep -lI -e '^<<<<<<<' -e '^>>>>>>>' -- . 2>/dev/null >&2
  die "Konfliktmarker im Baum — erst aufloesen, dann pushen."
fi

if ! git diff --check --cached 2>/dev/null; then
  die "Whitespace-Fehler im Index (git diff --check)."
fi

if ! npm run --silent zahlen:check >/dev/null 2>&1; then
  die "Der Zahlenblock driftet (npm run zahlen:check). 'npm run zahlen:sync' schreibt ihn."
fi

if ! npm run --silent gate:local >/dev/null 2>&1; then
  die "Die lokalen Gate-Slices sind rot (npm run gate:local)."
fi

if [ -f packages/prompter/assets/capabilities.json ]; then
  missing=$(node -e '
    const fs = require("node:fs");
    const cap = JSON.parse(fs.readFileSync("packages/prompter/assets/capabilities.json", "utf8"));
    const owned = new Set((cap.capabilities || []).map((c) => c.owner));
    const miss = [];
    for (const d of fs.readdirSync("packages")) {
      const dir = "packages/" + d;
      if (!fs.statSync(dir).isDirectory()) continue;
      if (!fs.existsSync(dir + "/package.json")) continue;
      if (!fs.existsSync(dir + "/cordis.patch.yml")) { miss.push(d + " (kein Patch)"); continue; }
      if (!owned.has(d)) miss.push(d + " (keine Faehigkeit)");
    }
    if (miss.length) { console.error(miss.join(", ")); process.exit(1); }
  ' 2>&1) || die "Unfertige Pakete: $missing"
fi

say "lokal ok (Marker, Zahlen, Gate-Slices, Paket-Vollstaendigkeit). Die volle Pruefung laeuft in der CI."
exit 0
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
