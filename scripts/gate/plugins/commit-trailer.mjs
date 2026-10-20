/**
 * commit-trailer — der Wächter über den Wächter.
 *
 * Die Commit-Regeln sind ein Vertrag: kein KI-Footer, Vannon-Trailer Pflicht,
 * Wort-Regel (150+ Wörter, Daten namentlich, Bildsprache).
 * Dieses Plugin prüft nicht die Historie (das tut der Guard im CI-Job),
 * sondern dass der Mechanismus tatsächlich existiert und fail-closed ist:
 *
 *   1. Verhalten: die eingefrorene Codebuff-Signatur MUSS abgelehnt werden,
 *      eine saubere Nachricht MUSS durchgehen, und der Tausch MUSS den Footer
 *      entfernen und den Trailer setzen. Das ist der Beweis, dass die Regeln
 *      wirken — nicht nur, dass eine Datei existiert.
 *   2. Hooks: pre-commit fährt NUR die schnelle Linie (`npm test` — der volle
 *      Lauf `test:full` gehört in CI), commit-msg prüft ohne --fix
 *      (fail-closed), prepare-commit-msg tauscht (--fix), der Installer setzt
 *      core.hooksPath.
 *   3. CI: der Workflow läuft bei push UND pull_request und hat keinen
 *      paths-Filter — „immer" ist eine Eigenschaft der Datei, nicht ein Versprechen.
 *      Der Prüfbereich kommt aus dem Wächter (--ci), nicht aus Shell-Zeilen im
 *      YAML, und der Job darf nicht mit continue-on-error entschärft sein.
 *   4. Bereich: der Resolver (scripts/lib/ci-range.mjs) wird nie enger — kann er
 *      den Bereich nicht bestimmen, bleibt die volle Historie. Das ist die
 *      Eigenschaft, ohne die „fail-closed" nur ein Wort wäre.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkMessage, swapTrailer, VANNON_TRAILER, FORBIDDEN_LINES } from '../../lib/commit-text.mjs';
import { policyIssues, resolvePreset } from '../../lib/commit-policy.mjs';

export const id = 'commit-trailer';

/**
 * Ein gültiger Body: 150+ Wörter, Daten namentlich, Bildsprache drin.
 * Beide Fixtures teilen ihn — die verbotene unterscheidet sich NUR durch den
 * Footer. Damit beweist der Tausch genau eines: Der Footer war der Verstoß,
 * nicht die Kürze (die Wort-Regel greift für beide gleich).
 */
export const LONG_BODY = [
  'Commit-Wächter: die Wort-Regel gilt ab diesem Commit für jede Nachricht',
  '',
  'Drei Zusagen stehen jetzt nebeneinander wie ein Dreiklang aus Umfang, Herkunft und Bild.',
  'Erstens verlangt der Wächter mindestens 150 Wörter im Inhalt, gemessen in scripts/lib/commit-text.mjs',
  'mit der Funktion countWords, die den Vannon-Trailer und alle #-Zeilen vorher abzieht, damit',
  'weder die Signatur noch auskommentierte Git-Hinweise den Zähler füttern wie ein stiller Gast am Buffet.',
  'Zweitens müssen alle Daten namentlich genannt sein: mindestens ein Pfad mit Endung, ein Commit-SHA,',
  'eine Messung im Format 32/0, eine Exit-Angabe wie Exit 0 oder eine Nummer wie Run 37571432238.',
  'Eine Zahl ohne Herkunft ist kein Beleg, sie hängt in der Luft wie ein Satz ohne Verb und fällt durch.',
  'Drittens ist Bildsprache Pflicht: mindestens ein Vergleichs- oder Bildmarker aus der festen Liste in',
  'BILDSPRACHE_MARKERS, zum Beispiel wie ein Wächter, als wäre jede Zeile ein Versprechen, oder bildlich gesprochen.',
  'Die Liste ist bewusst eng, damit der Wächter einen Marker prüft und kein Stilgefühl wie ein Kritiker im Feuilleton.',
  'Geprüft wird das alles in scripts/gate/tests/commit-trailer.test.mjs, das nach diesem Commit 38 Tests fährt:',
  'die alten 32 plus sechs neue für Umfang, Daten, Bildsprache, die 150/149-Grenze, den Abzug von Trailer und',
  'Kommentaren sowie die getrennte Zählung von Footer- und Wort-Verstößen. Der Guard läuft mit Exit 0 genau dann,',
  'wenn alle drei Regeln gleichzeitig stehen wie drei Beine eines Hockers, der erst dann nicht wackelt.',
  'Wer einen Marker vermisst, trägt ihn in BILDSPRACHE_MARKERS ein wie ein Wort ins Wörterbuch, mit Test dazu,',
  'statt ihn zu behaupten — im Zweifel wird abgelehnt, nicht durchgelassen, als wäre Nachsicht ein Fehler.',
].join('\n');

/** Die Signatur, die niemals in einem Commit landen darf — als Testfall eingefroren. */
export const FORBIDDEN_SAMPLE = [
  'Wave 2: irgendein Feature',
  '',
  LONG_BODY,
  '',
  'Generated with Codebuff 🤖',
  'Co-Authored-By: Codebuff <noreply@codebuff.com>',
].join('\n');

/** Eine gültige Nachricht: langer Body + Trailer. */
export const VALID_SAMPLE = ['Etwas ändern', '', LONG_BODY, '', VANNON_TRAILER].join('\n');

const REQUIRED_FILES = [
  'scripts/lib/commit-text.mjs',
  'scripts/lib/commit-policy.mjs',
  'scripts/lib/commit-policy-file.mjs',
  'docs/contracts/commit-policy.json',
  'scripts/lib/ci-range.mjs',
  'scripts/commit-guard.mjs',
  'scripts/install-hooks.mjs',
  '.githooks/commit-msg',
  '.githooks/prepare-commit-msg',
  '.githooks/pre-commit',
  '.github/workflows/commit-guard.yml',
  'docs/COMMIT-REGELN.md',
  'docs/contracts/commit-trailer.json',
];

/** Laufzeit-/Verhaltensprüfung der Regeln. Reine Funktion, testbar. */
export function ruleIssues({ forbiddenSample = FORBIDDEN_SAMPLE, validSample = VALID_SAMPLE } = {}) {
  const issues = [];

  const forbidden = checkMessage(forbiddenSample);
  if (forbidden.ok) issues.push('Regel greift nicht: die Codebuff-Signatur wurde akzeptiert');
  if (!forbidden.violations.some((violation) => violation.includes('Footer') || violation.includes('co-authored-by'))) {
    issues.push('Regel nennt keinen Footer-Verstoß für die Codebuff-Signatur');
  }

  const valid = checkMessage(validSample);
  if (!valid.ok) issues.push(`gültige Nachricht abgelehnt: ${valid.violations.join('; ')}`);

  const swapped = swapTrailer(forbiddenSample);
  const afterSwap = checkMessage(swapped);
  if (!afterSwap.ok) issues.push(`Tausch repariert die Nachricht nicht: ${afterSwap.violations.join('; ')}`);
  if (/codebuff/i.test(swapped)) issues.push('Tausch lässt die Codebuff-Signatur stehen');
  if (!swapped.includes(VANNON_TRAILER)) issues.push('Tausch setzt den Vannon-Trailer nicht');
  if (swapTrailer(swapped) !== swapped) issues.push('Tausch ist nicht idempotent');

  const missing = checkMessage('Etwas ändern\n\nBody ohne Trailer.');
  if (missing.ok || !missing.violations.some((violation) => violation.includes('Vannon-Trailer fehlt'))) {
    issues.push('fehlender Trailer wird nicht erzwungen');
  }

  if (FORBIDDEN_LINES.length === 0) issues.push('keine verbotenen Footer definiert');
  return issues;
}

/**
 * Der Policy-Vertrag selbst: gültig, jedes Preset auflösbar, und die drei
 * Zusagen, die kein Datenfeld still umdrehen darf.
 */
export function policyRuleIssues(contract) {
  const issues = policyIssues(contract);
  if (issues.length > 0) return issues;
  for (const name of Object.keys(contract.presets)) {
    try {
      resolvePreset(contract, name);
    } catch (error) {
      issues.push(`Preset „${name}" löst nicht auf: ${error.message}`);
    }
  }
  const maintainer = resolvePreset(contract, 'shinon-maintainer');
  if (!maintainer.trailerRequired || maintainer.minWords === 0) {
    issues.push('shinon-maintainer: Trailer und Wort-Regel sind das heutige Verhalten und dürfen nicht fehlen');
  }
  const strict = resolvePreset(contract, 'strict-evidence');
  if (strict.repairSwapTrailer) issues.push('strict-evidence: darf lokal nicht reparieren (fail-closed)');
  for (const name of ['minimal', 'conventional']) {
    if (!Object.hasOwn(contract.presets, name)) continue;
    if (resolvePreset(contract, name).trailerRequired) {
      issues.push(`${name}: erzwingt den Vannon-Trailer ohne Auswahl`);
    }
  }
  return issues;
}

/** CI-Workflow: „immer" ist prüfbar, nicht behauptet. */
export function workflowIssues(text, file = '.github/workflows/commit-guard.yml') {
  const issues = [];
  if (!/^on:\s*$/m.test(text) && !/^on:\s*\n/m.test(text)) issues.push(`${file}: on:-Block fehlt`);
  for (const trigger of ['push:', 'pull_request:']) {
    if (!text.includes(trigger)) issues.push(`${file}: Trigger ${trigger} fehlt (der Wächter muss immer laufen)`);
  }
  for (const filter of ['paths:', 'paths-ignore:', 'branches-ignore:']) {
    if (text.includes(filter)) issues.push(`${file}: ${filter} filtert den Lauf — der Wächter darf nicht bedingt sein`);
  }
  // continue-on-error macht einen fehlgeschlagenen Wächter unsichtbar: fail-open.
  if (/continue-on-error:\s*true/.test(text)) {
    issues.push(`${file}: continue-on-error: true entschärft den Wächter (fail-open)`);
  }
  // Die Bereichslogik gehört in den Wächter, wo sie getestet wird.
  if (/(^|\s)range=|git log|rev-parse/.test(text)) {
    issues.push(`${file}: leitet den Prüfbereich im YAML ab — das muss der Wächter (--ci) tun`);
  }
  if (!text.includes('scripts/commit-guard.mjs --ci')) issues.push(`${file}: ruft den Commit-Wächter nicht auf`);
  if (!text.includes('node --test scripts/gate/tests/*.test.mjs')) issues.push(`${file}: fährt die Gate-Tests nicht`);
  return issues;
}

/** Hook-Dateien: fail-closed prüfen, reparieren erlauben — in dieser Richtung. */
export function hookIssues(hooks, dir = '.githooks') {
  const issues = [];
  const commitMsg = hooks['commit-msg'] ?? '';
  const prepare = hooks['prepare-commit-msg'] ?? '';
  if (!commitMsg.includes('--file')) issues.push(`${dir}/commit-msg: prüft keine Nachricht`);
  if (commitMsg.includes('--fix')) issues.push(`${dir}/commit-msg: enthält --fix — der Prüf-Hook darf nicht reparieren`);
  if (!prepare.includes('--fix')) issues.push(`${dir}/prepare-commit-msg: tauscht die Signatur nicht (--fix fehlt)`);
  const preCommit = hooks['pre-commit'] ?? '';
  // Nur Befehlszeilen zählen: ein Kommentar darf den vollen Lauf beim Namen
  // nennen (Erklärung), ausführen darf ihn nur CI.
  const preCommitCommands = preCommit
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  if (!preCommitCommands.includes('npm test')) issues.push(`${dir}/pre-commit: fährt nicht die schnelle Linie (npm test fehlt)`);
  // Die langsamen Pole dürfen nie still in den lokalen Hook wandern — sonst ist
  // die Trennung schnell/lokal vs. voll/CI nur ein Name und die Hardware zahlt
  // bei jedem Commit den vollen Lauf.
  for (const slow of ['test:full', 'pack-test', 'gate:full', 'gate:test', 'scale:check', 'branding']) {
    if (preCommitCommands.includes(slow)) issues.push(`${dir}/pre-commit: enthält ${slow} — der volle Lauf gehört in CI, nicht in den Commit`);
  }
  if (!commitMsg.includes('commit-guard.mjs') || !prepare.includes('commit-guard.mjs')) {
    issues.push(`${dir}: Hook ruft den Wächter nicht auf`);
  }
  return issues;
}

export function check(ctx) {
  const issues = [];
  const root = ctx.repo.ROOT;

  for (const rel of REQUIRED_FILES) {
    if (!existsSync(join(root, rel))) issues.push(`${rel} fehlt`);
  }
  if (issues.length > 0) return issues;

  const hooks = {};
  for (const name of ['commit-msg', 'prepare-commit-msg', 'pre-commit']) {
    hooks[name] = readFileSync(join(root, '.githooks', name), 'utf8');
  }
  issues.push(...hookIssues(hooks));
  issues.push(...workflowIssues(readFileSync(join(root, '.github/workflows/commit-guard.yml'), 'utf8')));
  issues.push(...ruleIssues());

  const installer = readFileSync(join(root, 'scripts/install-hooks.mjs'), 'utf8');
  if (!installer.includes('core.hooksPath')) issues.push('scripts/install-hooks.mjs: setzt core.hooksPath nicht');

  const guard = readFileSync(join(root, 'scripts/commit-guard.mjs'), 'utf8');
  if (!guard.includes("--ci")) issues.push('scripts/commit-guard.mjs: --ci fehlt (der CI-Weg muss im Wächter liegen)');
  if (!guard.includes("./lib/ci-range.mjs")) issues.push('scripts/commit-guard.mjs: nutzt den Bereichs-Resolver nicht');
  if (!guard.includes('commit-policy-file.mjs')) issues.push('scripts/commit-guard.mjs: nutzt die Policy-Auswahl nicht (Presets wären tote Daten)');

  try {
    const contract = JSON.parse(readFileSync(join(root, 'docs/contracts/commit-policy.json'), 'utf8'));
    issues.push(...policyRuleIssues(contract));
  } catch (error) {
    issues.push(`docs/contracts/commit-policy.json: nicht lesbar (${error.message})`);
  }
  // Ein einzelner Kopf-Commit als Rückfall wäre eine Verengung der Prüfung.
  if (/git',\s*\['log',\s*'--no-merges',\s*'-1'/.test(guard) || /'-1',\s*'--format/.test(guard)) {
    issues.push('scripts/commit-guard.mjs: Rückfall prüft nur einen Commit — der Wächter darf nie enger werden');
  }

  const pkg = ctx.root;
  if (!(pkg.scripts ?? {})['hooks:install']) issues.push('package.json: Script hooks:install fehlt');
  if (!(pkg.scripts ?? {})['commit:guard']) issues.push('package.json: Script commit:guard fehlt');

  return issues;
}
