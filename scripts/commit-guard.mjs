#!/usr/bin/env node
/**
 * commit-guard.mjs — der Commit-Wächter.
 *
 * Modi:
 *   --file <pfad> [--fix]   Hook-Modus: eine Nachricht prüfen (--fix tauscht
 *                           verbotene Footer gegen den Vannon-Trailer).
 *   --stdin                 eine Nachricht von stdin prüfen (Agenten-Dry-Run,
 *                           ohne temporäre Datei). Kein Tausch, nur Urteil.
 * → Kanon: docs/COMMENT-KANON.md#k-67fd024927e6
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { checkMessage, swapTrailer, VANNON_TRAILER } from './lib/commit-text.mjs';
import { describeRules, PolicyError } from './lib/commit-policy.mjs';
import { selectPolicy } from './lib/commit-policy-file.mjs';
import { resolveCiRange } from './lib/ci-range.mjs';

const USAGE = `Shinon Commit-Wächter

  node scripts/commit-guard.mjs --file <commit-msg-Datei> [--fix] [--policy <preset>]
  node scripts/commit-guard.mjs --stdin [--policy <preset> | --policy-file <datei>]
  node scripts/commit-guard.mjs --ci
  node scripts/commit-guard.mjs --range <rev-range>
  node scripts/commit-guard.mjs --last <n>
  node scripts/commit-guard.mjs --all

Presets: shinon-maintainer (Voreinstellung, unverändertes Repo-Verhalten),
minimal, conventional, strict-evidence — Daten in docs/contracts/commit-policy.json.
Fußboden, von keinem Preset abwählbar: kein KI-Footer, kein co-authored-by.
Ein defekter Policy-Input endet mit Exit 2 (kein Rückfall auf Ersatzregeln).
Vannon-Trailer des Presets:
  ${VANNON_TRAILER}`;

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};

function git(argsList) {
  return execFileSync('git', argsList, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function report(entries, rules) {
  console.error(`💥 Commit-Wächter: FAIL — Verstoß(e) gegen die Policy „${rules.name}"`);
  for (const { label, violations } of entries) {
    console.error(`\n   ${label}`);
    for (const violation of violations) console.error(`     - ${violation}`);
  }
  if (rules.trailerRequired) console.error(`\n   Trailer: ${rules.trailerText}`);
  if (rules.repairSwapTrailer) {
    console.error('   Lokal tauscht der Hook die Signatur: node scripts/install-hooks.mjs');
  } else {
    console.error('   Dieses Preset repariert nichts — die Nachricht selbst muss stimmen.');
  }
}

/**
 * Eine Commit-Spanne prüfen.
 * @param {string} range Revision oder rev-range.
 * @param {{ fallbackRev?: string }} [options] Was geprüft wird, wenn `range`
 *        nicht auflösbar ist: immer die volle Historie dieser Revision.
 */
function checkRange(range, { fallbackRev = 'HEAD', firstParentOnly = false, rules }) {
  let raw;
  let audited = range;
  try {
    raw = git(['log', '--no-merges', ...(firstParentOnly ? ['--first-parent'] : []), '--format=%H%x1f%B%x1e', range]);
  } catch {
    // Ein Bereich wie HEAD~1..HEAD existiert auf jungen Branches und in
    // flachen Klonen nicht. Wir prüfen dann die VOLLE Historie von
    // fallbackRev — der Wächter darf im Zweifel nie weniger prüfen.
    audited = fallbackRev;
    console.error(`   (Bereich "${range}" nicht auflösbar — prüfe die volle Historie von ${fallbackRev})`);
    raw = git(['log', '--no-merges', '--format=%H%x1f%B%x1e', fallbackRev]);
  }
  const commits = raw
    .split('\x1e')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash, ...body] = chunk.split('\x1f');
      return { hash, message: body.join('\x1f') };
    });

  if (commits.length === 0) {
    console.log(`✅ Commit-Wächter: keine Commits im Bereich "${audited}" — nichts zu prüfen.`);
    return 0;
  }

  const failures = [];
  for (const { hash, message } of commits) {
    const result = checkMessage(message, rules);
    if (!result.ok) failures.push({ label: `${hash.slice(0, 8)} — ${message.split('\n')[0].slice(0, 72)}`, violations: result.violations });
  }

  if (failures.length > 0) {
    report(failures, rules);
    console.error(`\n   Geprüft: ${commits.length} Commit(s) in "${audited}" — ${failures.length} Verstoß(e).`);
    return 1;
  }
  console.log(`✅ Commit-Wächter: ${commits.length} Commit(s) in "${audited}" sauber (${describeRules(rules).join(', ')}).`);
  return 0;
}

if (has('--help') || has('-h') || args.length === 0) {
  console.log(USAGE);
  process.exit(args.length === 0 ? 2 : 0);
}

/**
 * Die Policy wird EINMAL bestimmt, vor jedem Urteil. Ist sie defekt, endet der
 * Lauf mit Exit 2 — es gibt keinen stillen Rückfall auf schwächere Regeln.
 */
let selection;
try {
  selection = selectPolicy({
    root: process.cwd(),
    preset: valueOf('--policy'),
    file: valueOf('--policy-file'),
  });
} catch (error) {
  if (!(error instanceof PolicyError)) throw error;
  console.error(`💥 Commit-Wächter: ${error.message} — es wird NICHT mit Ersatzregeln geprüft.`);
  for (const issue of error.issues) console.error(`     - ${issue}`);
  process.exit(2);
}
const rules = selection.rules;
console.log(`   Policy: ${selection.name} (${selection.source}) — ${describeRules(rules).join(', ')}`);

if (has('--file')) {
  const file = valueOf('--file');
  if (!file || !existsSync(file)) {
    console.error(`💥 Commit-Wächter: Nachrichtendatei nicht gefunden: ${file ?? '(fehlt)'}`);
    process.exit(1);
  }
  const raw = readFileSync(file, 'utf8');
  const result = checkMessage(raw, rules);

  if (result.ok) {
    console.log(`✅ Commit-Wächter: Nachricht sauber (${describeRules(rules).join(', ')}).`);
    process.exit(0);
  }
  if (has('--fix')) {
    // Der Reparaturschritt ist definiert und begrenzt: verbotene Footer-Zeilen
    // entfernen, Trailer anhängen, sonst nichts. Ein Preset ohne Reparatur
    // (strict-evidence) schreibt gar nichts.
    if (!rules.repairSwapTrailer) {
      report([{ label: file, violations: [...result.violations, `Preset „${rules.name}" erlaubt keine Reparatur (fail-closed)`] }], rules);
      process.exit(1);
    }
    const swapped = swapTrailer(raw, rules);
    writeFileSync(file, swapped, 'utf8');
    const after = checkMessage(swapped, rules);
    if (after.ok) {
      console.log('🦊 Commit-Wächter: verbotene Footer entfernt, Vannon-Trailer eingesetzt.');
      process.exit(0);
    }
    report([{ label: file, violations: after.violations }], rules);
    process.exit(1);
  }
  report([{ label: file, violations: result.violations }], rules);
  process.exit(1);
}

/**
 * Dry-Run für Agenten: die Nachricht kommt über stdin, das Urteil über stdout.
 * Die Regeln sind DIESELBEN wie im Commit (checkMessage) — ein zweiter, laxerer
 * Prüfpfad wäre eine Einladung, ihn zu benutzen. Ein Verstoß endet mit Exit 1
 * und der vollständigen Liste, damit die Korrektur beim ersten Versuch sitzt.
 */
if (has('--stdin')) {
  const raw = readFileSync(0, 'utf8');
  const result = checkMessage(raw, rules);
  if (result.ok) {
    console.log(`✅ Commit-Wächter: Nachricht sauber (${describeRules(rules).join(', ')}).`);
    process.exit(0);
  }
  report([{ label: 'stdin', violations: result.violations }], rules);
  process.exit(1);
}

if (has('--ci')) {
  const { range, why } = resolveCiRange(process.env, git);
  console.log(`   Prüfbereich: ${range} (${why})`);
  // CI prüft den Branch-Diff auf der ersten Elternlinie. Merge-Seitenlinien
  // importieren oft bereits geprüfte main-Commits; diese sind kein neuer Push-Inhalt.
  // Kann der Bereich nicht aufgelöst werden, bleibt der Fallback absichtlich voll.
  process.exit(checkRange(range, { fallbackRev: process.env.GITHUB_SHA || 'HEAD', firstParentOnly: true, rules }));
}

if (has('--range')) {
  const range = valueOf('--range');
  if (!range) {
    console.error('💥 Commit-Wächter: --range braucht einen Bereich (z. B. abc123..HEAD).');
    process.exit(2);
  }
  process.exit(checkRange(range, { fallbackRev: process.env.GITHUB_SHA || 'HEAD', rules }));
}

if (has('--last')) {
  const count = Number.parseInt(valueOf('--last') ?? '1', 10);
  if (!Number.isFinite(count) || count < 1) {
    console.error('💥 Commit-Wächter: --last braucht eine Zahl ≥ 1.');
    process.exit(2);
  }
  process.exit(checkRange(count === 1 ? 'HEAD~1..HEAD' : `HEAD~${count}..HEAD`, { rules }));
}

if (has('--all')) {
  process.exit(checkRange('HEAD', { rules }));
}

console.error(`💥 Commit-Wächter: unbekannte Argumente: ${args.join(' ')}\n\n${USAGE}`);
process.exit(2);
