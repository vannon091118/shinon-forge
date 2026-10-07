#!/usr/bin/env node
/**
 * Tests der Commit-Regeln (kein KI-Footer, Vannon-Trailer Pflicht).
 *
 * Drei Ebenen:
 *   1. Regeln (reine Funktionen): was verboten ist, was Pflicht ist, was der
 *      Tausch tut — inklusive Idempotenz.
 *   2. Mechanismus: Hooks und CI-Workflow werden gegen ihre Zusagen geprüft
 *      (fail-closed prüfen, nicht reparieren; immer laufen, nicht filtern).
 *   3. Echter Lauf: der Wächter als CLI gegen eine Datei und gegen ein
 *      temporäres Git-Repository — Exit-Codes zählen, nicht Absichten.
 *
 * Läuft mit `node --test` — kein node_modules, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORBIDDEN_LINES,
  VANNON_TRAILER,
  checkMessage,
  hasVannonTrailer,
  isForbiddenFooterLine,
  swapTrailer,
} from '../../lib/commit-text.mjs';
import {
  FORBIDDEN_SAMPLE,
  VALID_SAMPLE,
  hookIssues,
  ruleIssues,
  workflowIssues,
} from '../plugins/commit-trailer.mjs';
import { resolveCiRange } from '../../lib/ci-range.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GUARD = join(ROOT, 'scripts/commit-guard.mjs');
const CODEFUFF_BLOCK = [
  'Irgendein Commit',
  '',
  'Ein Body mit Inhalt.',
  '',
  'Generated with Codebuff 🤖',
  'Co-Authored-By: Codebuff <noreply@codebuff.com>',
].join('\n');

/**
 * CLI ausführen und den Exit-Code zurückgeben (nie werfen).
 * GITHUB_*-Variablen der Umgebung werden entfernt, damit `--ci`-Tests nicht von
 * der Umgebung des Testlaufs abhängen; `env` setzt genau den gewünschten Kontext.
 */
function run(args, cwd = ROOT, env = {}) {
  const merged = { ...process.env };
  for (const key of Object.keys(merged)) if (key.startsWith('GITHUB_')) delete merged[key];
  Object.assign(merged, env);
  try {
    const stdout = execFileSync(process.execPath, args, { cwd, env: merged, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status ?? -1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') };
  }
}

const withTrailer = (body) => `${body}\n\n${VANNON_TRAILER}\n`;

// ── 1. Regeln ────────────────────────────────────────────────────────────────

test('commit: die eingefrorene Codebuff-Signatur wird abgelehnt', () => {
  const result = checkMessage(FORBIDDEN_SAMPLE);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('Footer')));
  assert.ok(result.violations.some((violation) => violation.includes('co-authored-by')));
});

test('commit: jede verbotene Familie wird erkannt', () => {
  const samples = [
    'Generated with Codebuff 🤖',
    'Co-Authored-By: Codebuff <noreply@codebuff.com>',
    'Generated with Claude Code',
    'Co-Authored-By: Claude <noreply@anthropic.com>',
    'Powered by ChatGPT',
    '🤖 Generated with Copilot',
    'generated with cursor',
  ];
  for (const line of samples) {
    assert.equal(isForbiddenFooterLine(line), true, `nicht erkannt: ${line}`);
    assert.equal(checkMessage(withTrailer(line)).ok, false, `akzeptiert: ${line}`);
  }
  assert.ok(FORBIDDEN_LINES.length >= 5);
  assert.ok(FORBIDDEN_LINES.some(({ label }) => label.includes('with/by')), 'die with/by-Familie fehlt');
});

test('commit: co-authored-by ist auch für Menschen verboten', () => {
  const result = checkMessage(withTrailer('Co-Authored-By: Erika <erika@example.com>'));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('co-authored-by')));
});

test('commit: der Vannon-Trailer ist Pflicht', () => {
  const result = checkMessage('Etwas ändern\n\nEin Body ohne Trailer.');
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('Vannon-Trailer fehlt')));
  assert.equal(result.hasTrailer, false);
});

test('commit: gültige Nachricht mit Trailer geht durch', () => {
  const result = checkMessage(VALID_SAMPLE);
  assert.deepEqual(result.violations, []);
  assert.equal(result.ok, true);
  assert.equal(result.hasTrailer, true);
});

test('commit: Trailer wird mit Bindestrich und anderem Whitespace erkannt', () => {
  const folded = VANNON_TRAILER.replace('—', '-').replace(/\s+/g, '  ');
  assert.equal(hasVannonTrailer(withTrailer(folded)), true);
  assert.equal(checkMessage(withTrailer(folded)).ok, true);
});

test('commit: Kommentarzeilen zählen nicht als Footer', () => {
  assert.equal(isForbiddenFooterLine('# Generated with Codebuff 🤖'), false);
  const message = `Titel\n\nBody.\n\n# Bitte beachten\n\n${VANNON_TRAILER}\n`;
  assert.equal(checkMessage(message).ok, true);
});

test('commit: Tausch entfernt die Signatur und ist idempotent', () => {
  const swapped = swapTrailer(FORBIDDEN_SAMPLE);
  assert.ok(!/codebuff/i.test(swapped), 'Signatur steht noch im Text');
  assert.ok(swapped.includes(VANNON_TRAILER));
  assert.equal(checkMessage(swapped).ok, true);
  assert.equal(swapTrailer(swapped), swapped, 'nicht idempotent');
});

test('commit: Tausch lässt den Body unangetastet und verträgt CRLF', () => {
  const swapped = swapTrailer(CODEFUFF_BLOCK.replace(/\n/g, '\r\n'));
  assert.match(swapped, /Ein Body mit Inhalt\./);
  assert.ok(!swapped.includes('\r'));
  assert.ok(swapped.endsWith(`${VANNON_TRAILER}\n`));
});

/**
 * Jede Schreibweise, in der sich eine Maschine als Autor ausgeben kann:
 * Verb × with/by × Whitespace-Variante × Name. 330 Fälle — die Menge ist der
 * Punkt, nicht ein Beispiel.
 */
const SIGNATURE_VARIANTS = [];
for (const verb of ['Generated', 'Made', 'Written', 'Created', 'Powered']) {
  for (const preposition of ['with', 'by']) {
    for (const gap of [' ', '  ', '\t']) {
      for (const name of ['Codebuff', 'Claude', 'ChatGPT', 'Copilot', 'Gemini', 'Cursor', 'OpenAI', 'Anthropic', 'Devin', 'Codex', 'Qwen']) {
        SIGNATURE_VARIANTS.push(`${verb}${gap}${preposition}${gap}${name}`);
      }
    }
  }
}

const INLINE_VARIANTS = [
  'Generated by Codebuff',
  'Made with Codebuff',
  'Written by Copilot',
  'Created by: Gemini',
  'auto-generated with Codebuff',
  'Generated with Codebuff.',
  'generated with cursor',
  '🤖 Generated with Copilot',
  '  Generated with Codebuff',
  'Co-Authored-By: Codebuff <noreply@codebuff.com>',
  'Co-authored by Codebuff',
  'noreply@codebuff.com',
  'Powered by: ChatGPT',
];

const contentLines = (text) =>
  String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const withBody = (line) => `Titel\n\nEin Body mit Inhalt.\n\n${line}${withTrailer('')}`;

test('commit: jede Schreibweise wird abgelehnt — with/by, Tabs, Doppel-Leerzeichen', () => {
  // Stichprobe gegen die Menge: die Prüfung darf nicht raten, sie muss kennen.
  for (const line of [...SIGNATURE_VARIANTS.slice(0, 3), ...INLINE_VARIANTS]) {
    assert.equal(isForbiddenFooterLine(line), true, `nicht erkannt: ${JSON.stringify(line)}`);
    assert.equal(checkMessage(withBody(line)).ok, false, `akzeptiert: ${JSON.stringify(line)}`);
  }
  assert.ok(SIGNATURE_VARIANTS.length >= 300, 'die Variantenmenge ist geschrumpft');
});

test('commit: Signaturen zählen auch mitten im Body (P3)', () => {
  const midBody = `Titel\n\nEin Body.\n\ngenerated with some tool${withTrailer('')}`;
  const result = checkMessage(midBody);
  assert.equal(result.ok, false, 'eine Signaturzeile ist eine Signaturzeile — egal an welcher Stelle');
  assert.ok(result.violations.some((violation) => violation.includes('Footer')));
});

test('commit: Invariante — der Tausch entfernt nur, was die Prüfung ablehnt', () => {
  const corpus = [
    ...SIGNATURE_VARIANTS,
    ...INLINE_VARIANTS,
    FORBIDDEN_SAMPLE,
    VALID_SAMPLE,
    'Titel\n\nBody ohne Trailer.',
    `Titel\n\nEin sauberer Body mit  doppelten  Leerzeichen.${withTrailer('')}`,
    `Titel\n\nVerifiziert mit Protokoll, geschrieben von Hand.${withTrailer('')}`,
    `Titel\n\n# Generated with Codebuff\n\nEin Kommentar bleibt ein Kommentar.${withTrailer('')}`,
  ];

  for (const message of corpus) {
    const checked = checkMessage(message);
    const swapped = swapTrailer(message);
    const removed = contentLines(message).filter((line) => !contentLines(swapped).includes(line));

    if (removed.length > 0) {
      assert.equal(
        checked.ok,
        false,
        `Tausch entfernt ${JSON.stringify(removed)}, die Prüfung sagt aber ok — CI würde es durchwinken`,
      );
    }
    if (checked.ok) {
      assert.deepEqual(removed, [], 'grün geprüft, aber der Tausch würde Inhaltszeilen entfernen');
    }
  }
});

// ── 2. Mechanismus ───────────────────────────────────────────────────────────

test('commit: das Gate wird nicht durch die eigenen Regeln rot', () => {
  assert.deepEqual(ruleIssues(), []);
});

test('commit: eine wirkungslose Regel wird erkannt', () => {
  const issues = ruleIssues({ forbiddenSample: VALID_SAMPLE, validSample: VALID_SAMPLE });
  assert.ok(issues.some((issue) => issue.includes('Codebuff-Signatur wurde akzeptiert')));
});

test('commit: CI-Workflow läuft immer und filtert nicht', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/commit-guard.yml'), 'utf8');
  assert.deepEqual(workflowIssues(text), []);
  assert.ok(workflowIssues(`${text}\non:\n  push:\n    paths:\n      - 'scripts/**'\n`).some((issue) => issue.includes('paths')));
  assert.ok(workflowIssues('on:\n  push:\n').some((issue) => issue.includes('pull_request')));
});

test('commit: der CI-Job darf nicht entschärft oder bedingt sein', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/commit-guard.yml'), 'utf8');
  assert.ok(
    workflowIssues(text.replace('runs-on: ubuntu-latest', 'runs-on: ubuntu-latest\n    continue-on-error: true')).some(
      (issue) => issue.includes('continue-on-error'),
    ),
  );
  assert.ok(
    workflowIssues(`${text}\n        run: |\n          range="HEAD"\n`).some((issue) => issue.includes('Bereichslogik') || issue.includes('Prüfbereich')),
  );
});

// ── 2b. Bereichs-Resolver (reine Funktion) ──────────────────────────────────

const neverResolvable = () => {
  throw new Error('unbekannte Revision');
};
const alwaysResolvable = () => 'sha';

function eventFile(body, raw) {
  const file = join(mkdtempSync(join(tmpdir(), 'shinon-event-')), 'event.json');
  writeFileSync(file, raw ?? JSON.stringify(body), 'utf8');
  return file;
}

test('ci-range: auflösbare Basis ergibt eine Spanne', () => {
  const push = resolveCiRange(
    { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile({ before: 'aaa111' }), GITHUB_SHA: 'bbb222' },
    alwaysResolvable,
  );
  assert.equal(push.range, 'aaa111..bbb222');
  assert.match(push.why, /before/);

  const pr = resolveCiRange(
    {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventFile({ pull_request: { base: { sha: 'base1' }, head: { sha: 'head1' } } }),
      GITHUB_SHA: 'head1',
    },
    alwaysResolvable,
  );
  assert.equal(pr.range, 'base1..head1');
});

test('ci-range: jeder unbestimmte Fall ergibt die volle Historie, nie weniger', () => {
  // Neuer Branch: GitHub schickt den Null-SHA als `before`.
  const newBranch = resolveCiRange(
    { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile({ before: '0'.repeat(40) }) },
    alwaysResolvable,
  );
  assert.equal(newBranch.range, 'HEAD');

  // Force-Push auf einen verschwundenen Stand.
  assert.equal(
    resolveCiRange({ GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile({ before: 'weg' }) }, neverResolvable).range,
    'HEAD',
  );
  // Pull Request ohne auflösbare Basis (flacher Klon).
  assert.equal(
    resolveCiRange(
      { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventFile({ pull_request: { base: { sha: 'weg' } } }) },
      neverResolvable,
    ).range,
    'HEAD',
  );
  // Unbekanntes Event und gar kein Kontext.
  assert.equal(resolveCiRange({ GITHUB_EVENT_NAME: 'schedule' }, alwaysResolvable).range, 'HEAD');
  assert.equal(resolveCiRange({}, alwaysResolvable).range, 'HEAD');
  // Kaputte Event-Datei: kein stiller Rückfall auf „nichts prüfen".
  assert.equal(
    resolveCiRange({ GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile(null, '{ kaputt') }, alwaysResolvable).range,
    'HEAD',
  );
});

test('commit: die Hook-Kette prüft fail-closed und repariert getrennt', () => {
  const hooks = {
    'commit-msg': readFileSync(join(ROOT, '.githooks/commit-msg'), 'utf8'),
    'prepare-commit-msg': readFileSync(join(ROOT, '.githooks/prepare-commit-msg'), 'utf8'),
  };
  assert.deepEqual(hookIssues(hooks), []);
  assert.ok(hookIssues({ ...hooks, 'commit-msg': `${hooks['commit-msg']} --fix` }).some((issue) => issue.includes('--fix')));
  assert.ok(hookIssues({ ...hooks, 'prepare-commit-msg': '#!/usr/bin/env sh\n' }).some((issue) => issue.includes('tauscht')));
});

// ── 3. Echter Lauf: Datei-Modus ──────────────────────────────────────────────

test('commit-guard: verbotene Nachricht ⇒ Exit 1', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'shinon-commit-')), 'MSG');
  writeFileSync(file, FORBIDDEN_SAMPLE, 'utf8');
  const result = run([GUARD, '--file', file]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Codebuff/i);
});

test('commit-guard: saubere Nachricht ⇒ Exit 0', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'shinon-commit-')), 'MSG');
  writeFileSync(file, VALID_SAMPLE, 'utf8');
  assert.equal(run([GUARD, '--file', file]).status, 0);
});

test('commit-guard: --fix tauscht die Signatur und macht den Commit möglich', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'shinon-commit-')), 'MSG');
  writeFileSync(file, FORBIDDEN_SAMPLE, 'utf8');
  assert.equal(run([GUARD, '--file', file, '--fix']).status, 0);
  const fixed = readFileSync(file, 'utf8');
  assert.ok(!/codebuff/i.test(fixed));
  assert.ok(fixed.includes(VANNON_TRAILER));
  assert.equal(run([GUARD, '--file', file]).status, 0);
});

test('commit-guard: fehlende Datei ist ein Verstoß, kein Bedienfehler', () => {
  assert.equal(run([GUARD, '--file', join(tmpdir(), 'gibt-es-nicht-4711')]).status, 1);
});

// ── 4. Echter Lauf: Bereichs-Scan in einem temporären Repo ───────────────────

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-range-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  return { dir, git, rev: (rev) => git(['rev-parse', rev]).trim(), commit: (message, file) => {
    const msgFile = join(dir, 'MSG');
    writeFileSync(msgFile, message, 'utf8');
    writeFileSync(join(dir, file), `${message}\n`, 'utf8');
    git(['add', file]);
    git(['commit', '-q', '-F', msgFile]);
  } };
}

test('commit-guard: Bereich mit verbotenem Commit ⇒ Exit 1, sauberer Bereich ⇒ Exit 0', () => {
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  const bad = run([GUARD, '--range', 'HEAD'], repo.dir);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Verstoß/);

  repo.commit(VALID_SAMPLE, 'b.txt');
  // Nur der neue Commit: `--range HEAD` würde den alten Verstoß mitsehen.
  const good = run([GUARD, '--range', 'HEAD~1..HEAD'], repo.dir);
  assert.equal(good.status, 0);
  assert.match(good.stdout, /sauber/);

  const all = run([GUARD, '--all'], repo.dir);
  assert.equal(all.status, 1, 'das Audit der ganzen Historie muss den alten Verstoß finden');
});

test('commit-guard: unbekannter Bereich fällt auf die volle Historie zurück statt zu krachen', () => {
  const repo = tempRepo();
  repo.commit(VALID_SAMPLE, 'a.txt');
  const result = run([GUARD, '--range', 'HEAD~5..HEAD'], repo.dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /1 Commit/, 'die volle Historie wurde geprüft');
});

test('commit-guard: ein nicht auflösbarer Bereich prüft zu viel, nicht zu wenig', () => {
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  repo.commit(VALID_SAMPLE, 'b.txt');
  // Der Bereich ist Unsinn — genau dann darf der Wächter NICHT nur den Kopf sehen.
  const result = run([GUARD, '--range', 'gibt-es-nicht..HEAD'], repo.dir);
  assert.equal(result.status, 1, 'der Verstoß im Rücken des Kopfes muss auffallen');
  assert.match(result.stderr, /Codebuff/i);
});

// ── 5. Echter Lauf: CI-Modus (--ci) ─────────────────────────────────────────

function pushEnv(repo, body, extra = {}) {
  return {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_SHA: repo.rev('HEAD'),
    GITHUB_EVENT_PATH: eventFile(body),
    ...extra,
  };
}

test('commit-guard --ci: Push mit auflösbarem before prüft nur die Spanne', () => {
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  const before = repo.rev('HEAD');
  repo.commit(VALID_SAMPLE, 'b.txt');
  const result = run([GUARD, '--ci'], repo.dir, pushEnv(repo, { before }));
  assert.equal(result.status, 0, 'nur die neuen Commits zählen');
  assert.match(result.stdout, /1 Commit/);
});

test('commit-guard --ci: Footer im neuen Commit ⇒ Exit 1', () => {
  const repo = tempRepo();
  repo.commit(VALID_SAMPLE, 'a.txt');
  const before = repo.rev('HEAD');
  repo.commit(FORBIDDEN_SAMPLE, 'b.txt');
  const result = run([GUARD, '--ci'], repo.dir, pushEnv(repo, { before }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Codebuff/i);
});

test('commit-guard --ci: neuer Branch (Null-SHA) prüft die volle Historie', () => {
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  repo.commit(VALID_SAMPLE, 'b.txt');
  const result = run([GUARD, '--ci'], repo.dir, pushEnv(repo, { before: '0'.repeat(40) }));
  assert.equal(result.status, 1, 'der Alt-Verstoß muss beim ersten Push auffallen');
});

test('commit-guard --ci: Pull Request prüft Basis..Head', () => {
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  const base = repo.rev('HEAD');
  repo.commit(VALID_SAMPLE, 'b.txt');
  const result = run([GUARD, '--ci'], repo.dir, {
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_SHA: repo.rev('HEAD'),
    GITHUB_EVENT_PATH: eventFile({ pull_request: { base: { sha: base } } }),
  });
  assert.equal(result.status, 0, 'nur die PR-Commits zählen, nicht die Basis');
});

test('commit-guard --ci: ohne GitHub-Kontext wird die volle Historie geprüft', () => {
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  const result = run([GUARD, '--ci'], repo.dir, { GITHUB_EVENT_NAME: '', GITHUB_SHA: '', GITHUB_EVENT_PATH: '' });
  assert.equal(result.status, 1, 'ein Wächter ohne Kontext darf nicht stillschweigend nichts prüfen');
  assert.match(result.stdout, /volle Historie/);
});

test('commit-guard: Bedienfehler sind Exit 2', () => {
  assert.equal(run([GUARD, '--range']).status, 2);
  assert.equal(run([GUARD, '--last', 'null']).status, 2);
});
