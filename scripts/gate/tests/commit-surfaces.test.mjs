import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { hookIssues, workflowIssues } from '../../lib/commit-surfaces.mjs';

/**
 * Die zwei Oberflächen, an denen die Commit-Regel ausgeführt wird. Der
 * Echtbaum ist der Kontrollfall; die Mutationen sind der eigentliche Test:
 * ein Glob statt der Bahn-Registry, ein Pfadfilter, `continue-on-error`, ein
 * langsamer Lauf im Commit-Hook. Jede Mutation muss EINEN benannten Befund
 * ergeben — nicht irgendeinen.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORKFLOW = join(ROOT, '.github/workflows/commit-guard.yml');

function hooks() {
  return {
    'commit-msg': readFileSync(join(ROOT, '.githooks/commit-msg'), 'utf8'),
    'prepare-commit-msg': readFileSync(join(ROOT, '.githooks/prepare-commit-msg'), 'utf8'),
    'pre-commit': readFileSync(join(ROOT, '.githooks/pre-commit'), 'utf8'),
  };
}

test('Echtbaum: Workflow und Hooks sind fail-closed', () => {
  assert.deepEqual(workflowIssues(readFileSync(WORKFLOW, 'utf8')), []);
  assert.deepEqual(hookIssues(hooks()), []);
});

test('ein Glob statt der Bahn-Registry ist rot — cancelled darf nicht grün sein', () => {
  const text = readFileSync(WORKFLOW, 'utf8');
  const mutated = text.replace('npm run gate:test:all', 'node --test scripts/gate/tests/*.test.mjs');
  assert.notEqual(mutated, text, 'die Mutation muss den Runner ersetzen');
  assert.ok(workflowIssues(mutated).some((issue) => issue.includes('gate:test:all')));
});

test('Pfadfilter und continue-on-error entschärfen den Lauf', () => {
  const text = readFileSync(WORKFLOW, 'utf8');
  assert.ok(workflowIssues(`${text}\non:\n  push:\n    paths:\n      - 'scripts/**'\n`).some((issue) => issue.includes('paths')));
  assert.ok(
    workflowIssues(text.replace('runs-on: ubuntu-latest', 'runs-on: ubuntu-latest\n    continue-on-error: true')).some(
      (issue) => issue.includes('continue-on-error'),
    ),
  );
});

test('ein langsamer Lauf im Commit-Hook wird abgewiesen', () => {
  const real = hooks();
  for (const slow of ['test:full', 'gate:test', 'pack-test']) {
    const mutated = { ...real, 'pre-commit': `${real['pre-commit']}\nnpm run ${slow}\n` };
    assert.ok(
      hookIssues(mutated).some((issue) => issue.includes(slow)),
      `${slow} muss im Hook rot sein`,
    );
  }
});

test('commit-msg darf nicht reparieren, prepare-commit-msg muss tauschen', () => {
  const real = hooks();
  assert.ok(hookIssues({ ...real, 'commit-msg': `${real['commit-msg']} --fix` }).some((issue) => issue.includes('--fix')));
  assert.ok(
    hookIssues({ ...real, 'prepare-commit-msg': real['prepare-commit-msg'].replace('--fix', '') }).some((issue) =>
      issue.includes('tauscht'),
    ),
  );
});
