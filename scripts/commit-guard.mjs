#!/usr/bin/env node
/**
 * commit-guard.mjs — der Commit-Wächter.
 *
 * Modi:
 *   --file <pfad> [--fix]   Hook-Modus: eine Nachricht prüfen (--fix tauscht
 *                           verbotene Footer gegen den Vannon-Trailer).
 *   --ci                    CI-Modus: den Bereich aus der GitHub-Umgebung
 *                           ableiten und prüfen (scripts/lib/ci-range.mjs).
 *   --range <rev-range>     jeden Commit des Bereichs prüfen.
 *   --last <n>              die letzten n Commits prüfen (Standard: 1).
 *   --all                   Audit der gesamten Historie.
 *
 * Fail-closed: ein verbotener Footer oder ein fehlender Vannon-Trailer ist
 * Exit 1. Es gibt keinen Schalter, der das abschaltet — nur --fix, und das
 * ersetzt die Signatur, statt sie durchzuwinken.
 *
 * Die entscheidende Eigenschaft: dieser Wächter wird NIE enger. Lässt sich ein
 * Bereich nicht auflösen (neuer Branch, Force-Push, flacher Klon, unbekanntes
 * Event), prüft er die volle Historie — nicht bloß den Kopf-Commit. Ein
 * Prüfwerkzeug, das im Zweifel weniger prüft, ist kein Prüfwerkzeug.
 *
 * Exit: 0 = sauber, 1 = Verstoß, 2 = Bedienfehler.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { checkMessage, swapTrailer, VANNON_TRAILER } from './lib/commit-text.mjs';
import { resolveCiRange } from './lib/ci-range.mjs';

const USAGE = `Shinon Commit-Wächter

  node scripts/commit-guard.mjs --file <commit-msg-Datei> [--fix]
  node scripts/commit-guard.mjs --ci
  node scripts/commit-guard.mjs --range <rev-range>
  node scripts/commit-guard.mjs --last <n>
  node scripts/commit-guard.mjs --all

Regeln: kein KI-Footer (Codebuff/Claude/ChatGPT/Copilot/…), kein co-authored-by,
Vannon-Trailer Pflicht:
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

function report(entries) {
  console.error('💥 Commit-Wächter: FAIL — verbotene Footer oder fehlender Vannon-Trailer');
  for (const { label, violations } of entries) {
    console.error(`\n   ${label}`);
    for (const violation of violations) console.error(`     - ${violation}`);
  }
  console.error(`\n   Trailer: ${VANNON_TRAILER}`);
  console.error('   Lokal tauscht der Hook die Signatur: node scripts/install-hooks.mjs');
}

/**
 * Eine Commit-Spanne prüfen.
 * @param {string} range Revision oder rev-range.
 * @param {{ fallbackRev?: string }} [options] Was geprüft wird, wenn `range`
 *        nicht auflösbar ist: immer die volle Historie dieser Revision.
 */
function checkRange(range, { fallbackRev = 'HEAD' } = {}) {
  let raw;
  let audited = range;
  try {
    raw = git(['log', '--no-merges', '--format=%H%x1f%B%x1e', range]);
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
    const result = checkMessage(message);
    if (!result.ok) failures.push({ label: `${hash.slice(0, 8)} — ${message.split('\n')[0].slice(0, 72)}`, violations: result.violations });
  }

  if (failures.length > 0) {
    report(failures);
    console.error(`\n   Geprüft: ${commits.length} Commit(s) in "${audited}" — ${failures.length} Verstoß(e).`);
    return 1;
  }
  console.log(`✅ Commit-Wächter: ${commits.length} Commit(s) in "${audited}" sauber (kein KI-Footer, Vannon-Trailer vorhanden).`);
  return 0;
}

if (has('--help') || has('-h') || args.length === 0) {
  console.log(USAGE);
  process.exit(args.length === 0 ? 2 : 0);
}

if (has('--file')) {
  const file = valueOf('--file');
  if (!file || !existsSync(file)) {
    console.error(`💥 Commit-Wächter: Nachrichtendatei nicht gefunden: ${file ?? '(fehlt)'}`);
    process.exit(1);
  }
  const raw = readFileSync(file, 'utf8');
  const result = checkMessage(raw);

  if (result.ok) {
    console.log('✅ Commit-Wächter: Nachricht sauber (kein KI-Footer, Vannon-Trailer vorhanden).');
    process.exit(0);
  }
  if (has('--fix')) {
    const swapped = swapTrailer(raw);
    writeFileSync(file, swapped, 'utf8');
    const after = checkMessage(swapped);
    if (after.ok) {
      console.log('🦊 Commit-Wächter: verbotene Footer entfernt, Vannon-Trailer eingesetzt.');
      process.exit(0);
    }
    report([{ label: file, violations: after.violations }]);
    process.exit(1);
  }
  report([{ label: file, violations: result.violations }]);
  process.exit(1);
}

if (has('--ci')) {
  const { range, why } = resolveCiRange(process.env, git);
  console.log(`   Prüfbereich: ${range} (${why})`);
  process.exit(checkRange(range, { fallbackRev: process.env.GITHUB_SHA || 'HEAD' }));
}

if (has('--range')) {
  const range = valueOf('--range');
  if (!range) {
    console.error('💥 Commit-Wächter: --range braucht einen Bereich (z. B. abc123..HEAD).');
    process.exit(2);
  }
  process.exit(checkRange(range, { fallbackRev: process.env.GITHUB_SHA || 'HEAD' }));
}

if (has('--last')) {
  const count = Number.parseInt(valueOf('--last') ?? '1', 10);
  if (!Number.isFinite(count) || count < 1) {
    console.error('💥 Commit-Wächter: --last braucht eine Zahl ≥ 1.');
    process.exit(2);
  }
  process.exit(checkRange(count === 1 ? 'HEAD~1..HEAD' : `HEAD~${count}..HEAD`));
}

if (has('--all')) {
  process.exit(checkRange('HEAD'));
}

console.error(`💥 Commit-Wächter: unbekannte Argumente: ${args.join(' ')}\n\n${USAGE}`);
process.exit(2);
