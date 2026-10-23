/** Teil 2/2 von commit-trailer.test.mjs — Fixtures stehen in `commit-trailer-fixtures.mjs`. */
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
  countWords,
  hasVannonTrailer,
  isForbiddenFooterLine,
  swapTrailer,
} from '../../lib/commit-text.mjs';
import {
  FORBIDDEN_SAMPLE,
  LONG_BODY,
  VALID_SAMPLE,
  hookIssues,
  ruleIssues,
  workflowIssues,
} from '../plugins/commit-trailer.mjs';
import { resolveCiRange } from '../../lib/ci-range.mjs';
import { ROOT, GUARD, CODEFUFF_BLOCK, run, withTrailer, SIGNATURE_VARIANTS, INLINE_VARIANTS, contentLines, withBody, neverResolvable, alwaysResolvable, eventFile, tempRepo, pushEnv } from './commit-trailer-fixtures.mjs';

test('ci-range: jeder unbestimmte Fall ergibt die volle Historie, nie weniger', () => {
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
  // Kaputte Event-Datei: kein stiller Rückfall auf „nichts prüfen". Liegt die
  // Hauptlinie vor (hier: der Stub löst alles auf), zählt die Spanne ab der
  // Merge-Basis — auch eine kaputte Datei ändert nichts daran, WAS der Branch
  // hinzufügt.
  assert.equal(
    resolveCiRange({ GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile(null, '{ kaputt') }, alwaysResolvable).range,
    'sha..HEAD',
  );
});
test('commit: die Hook-Kette prüft fail-closed und repariert getrennt', () => {
  const hooks = {
    'commit-msg': readFileSync(join(ROOT, '.githooks/commit-msg'), 'utf8'),
    'prepare-commit-msg': readFileSync(join(ROOT, '.githooks/prepare-commit-msg'), 'utf8'),
    'pre-commit': readFileSync(join(ROOT, '.githooks/pre-commit'), 'utf8'),
  };
  assert.deepEqual(hookIssues(hooks), []);
  assert.ok(hookIssues({ ...hooks, 'commit-msg': `${hooks['commit-msg']} --fix` }).some((issue) => issue.includes('--fix')));
  assert.ok(hookIssues({ ...hooks, 'prepare-commit-msg': '#!/usr/bin/env sh\n' }).some((issue) => issue.includes('tauscht')));
  // Trennung schnell/lokal vs. voll/CI: pre-commit fährt nur `npm test`.
  assert.ok(hookIssues({ ...hooks, 'pre-commit': '#!/usr/bin/env sh\n' }).some((issue) => issue.includes('schnelle Linie')));
  assert.ok(
    hookIssues({ ...hooks, 'pre-commit': `${hooks['pre-commit']}\nnpm run test:full\n` }).some((issue) =>
      issue.includes('test:full'),
    ),
  );
});
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
test('commit-guard --ci: Push mit auflösbarem before prüft nur die Spanne', () => {
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  const before = repo.rev('HEAD');
  repo.commit(VALID_SAMPLE, 'b.txt');
  const result = run([GUARD, '--ci'], repo.dir, pushEnv(repo, { before }));
  assert.equal(result.status, 0, 'nur die neuen Commits zählen');
  assert.match(result.stdout, /1 Commit/);
});
test('commit-guard --ci: Merge prüft keine importierten Commits der zweiten Elternlinie', () => {
  const repo = tempRepo();
  repo.commit(VALID_SAMPLE, 'base.txt');
  repo.git(['branch', '-M', 'main']);
  repo.git(['checkout', '-q', '-b', 'feature']);
  repo.commit(VALID_SAMPLE, 'feature.txt');
  const before = repo.rev('HEAD');

  // main bekommt nach dem Abzweig einen historisch ungültigen Commit. Ein
  // Merge in feature darf ihn beim Push nicht erneut als Branch-Änderung werten.
  repo.git(['checkout', '-q', 'main']);
  repo.commit(FORBIDDEN_SAMPLE, 'upstream.txt');
  repo.git(['checkout', '-q', 'feature']);
  repo.git(['merge', '--no-edit', 'main']);

  const result = run([GUARD, '--ci'], repo.dir, pushEnv(repo, { before }));
  assert.equal(result.status, 0, 'der zweite Elternzweig gehört nicht zum neuen Push-Diff');
  assert.match(result.stdout, /keine Commits/, 'der Merge selbst wird nicht wie ein Inhalts-Commit geprüft');
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
  // Im temporären Repo gibt es kein origin/main — also keine bestimmbar Basis
  // und damit die volle Historie (fail-closed). Der Fall MIT Hauptlinie steht
  // im Test darüber (`ci-range: ein neuer Branch prüft die Spitze minus
  // Hauptlinie`) und im Branch-Fall unten.
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  repo.commit(VALID_SAMPLE, 'b.txt');
  const result = run([GUARD, '--ci'], repo.dir, pushEnv(repo, { before: '0'.repeat(40) }));
  assert.equal(result.status, 1, 'der Alt-Verstoß muss beim ersten Push auffallen');
});
test('commit-guard --ci: neuer Branch mit Hauptlinie prüft nur, was der Branch hinzufügt', () => {
  // Der ECHTE Branch-Fall: ein Klon mit origin/main, ein Branch mit einem
  // sauberen Commit obendrauf — und ein Alt-Verstoß in der Hauptlinie. Vor der
  // Merge-Basis-Regel war dieser Push rot (volle Historie); jetzt zählt nur
  // die Spanne Basis..Spitze.
  const repo = tempRepo();
  repo.commit(FORBIDDEN_SAMPLE, 'a.txt');
  repo.git(['branch', '-M', 'main']);
  const bare = join(mkdtempSync(join(tmpdir(), 'shinon-range-origin-')), 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', bare]);
  repo.git(['remote', 'add', 'origin', bare]);
  repo.git(['push', '-q', 'origin', 'main']);
  repo.git(['checkout', '-q', '-b', 'zweig']);
  repo.commit(VALID_SAMPLE, 'b.txt');
  const base = execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], { cwd: repo.dir, encoding: 'utf8' }).trim();
  assert.ok(/^[0-9a-f]{40}$/.test(base), 'die Basis ist bestimmbar');
  const result = run([GUARD, '--ci'], repo.dir, pushEnv(repo, { before: '0'.repeat(40) }));
  assert.equal(result.status, 0, 'nur der Branch-Commit zählt — der Alt-Verstoß in main bleibt liegen');
  assert.ok(result.stdout.includes(`${base}..`), 'die geprüfte Spanne beginnt an der Merge-Basis');
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
