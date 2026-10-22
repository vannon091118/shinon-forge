import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectDocumentation, checkLocalLinks, checkWorkflowContract } from '../../lib/preflight/documentation.mjs';
import { applySafeFixes } from '../../lib/preflight/fixes.mjs';
import { REQUIRED_CI_JOBS } from '../../lib/preflight/policy.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const WORKFLOW = join(ROOT, '.github/workflows/commit-guard.yml');

test('repository handoff links and actual workflow dependency graph satisfy preflight', () => {
  const result = inspectDocumentation(ROOT);
  assert.equal(result.ok, true, result.diagnostics.map((d) =>
    `${d.code}: ${d.message} ${d.path ?? ''} ${d.details ?? ''}`).join('\n'));
  assert.equal(result.checkedRequiredJobs, REQUIRED_CI_JOBS.length);
});

test('link checker validates targets and source location but ignores code examples', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-preflight-links-'));
  try {
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'valid.md'), '# real target\n');
    const content = [
      '[valid](../valid.md)',
      '[broken](missing.md)',
      '```md',
      '[example not to inspect](not-real.md)',
      '```',
      '[escape](../../outside.md)',
      '`[inline code not to inspect](also-not-real.md)`',
      '',
    ].join('\n');
    const result = checkLocalLinks(root, 'docs/INDEX.md', content, []);
    assert.deepEqual(result.map((d) => d.code), [
      'PREFLIGHT_LINK_BROKEN',
      'PREFLIGHT_LINK_ESCAPES_REPO',
    ]);
    assert.equal(result[0].line, 2);
    assert.equal(result[0].path, 'docs/INDEX.md');
    assert.equal(result[1].line, 6);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('removing a required job from verdict.needs is detected as a behavior break', () => {
  const original = readFileSync(WORKFLOW, 'utf8');
  const mutated = original.replace(/^      - preflight-docs\s*$/m, '');
  assert.notEqual(mutated, original, 'mutation must remove exactly one dependency');
  const issues = checkWorkflowContract(mutated);
  assert.ok(issues.some((d) =>
    d.code === 'PREFLIGHT_JOB_NOT_REQUIRED' && d.details === 'preflight-docs'),
  issues.map((d) => `${d.code}: ${d.details ?? ''}`).join('\n'));
});

test('missing job definition is not invented by the checker or auto-fixer', () => {
  const original = readFileSync(WORKFLOW, 'utf8');
  const mutated = original.replace(/\n  secret-scan:\n[\s\S]*?(?=\n  verdict:)/, '');
  assert.notEqual(mutated, original, 'fixture mutation must remove the job block');
  const issues = checkWorkflowContract(mutated);
  assert.ok(issues.some((d) => d.code === 'PREFLIGHT_JOB_DEFINITION_MISSING' && d.details === 'secret-scan'));
  assert.ok(issues.some((d) => d.code === 'PREFLIGHT_NEEDS_UNKNOWN_JOB' && d.details === 'secret-scan'));
});

test('safe auto-fix repairs missing verdict wiring, then the behavioral contract passes', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-preflight-autofix-'));
  try {
    const dir = join(root, '.github/workflows');
    mkdirSync(dir, { recursive: true });
    const original = readFileSync(WORKFLOW, 'utf8');
    const broken = original
      .replace(/^      - preflight-docs\s*$/m, '')
      .replace(/^    if: always\(\)\s*$/m, '');
    writeFileSync(join(dir, 'commit-guard.yml'), broken);

    const repairs = applySafeFixes(root);
    assert.ok(repairs.some((d) => d.code === 'PREFLIGHT_AUTO_FIX_NEEDS' && d.details.includes('preflight-docs')));
    assert.ok(repairs.some((d) => d.code === 'PREFLIGHT_AUTO_FIX_ALWAYS'));
    const repaired = readFileSync(join(dir, 'commit-guard.yml'), 'utf8');
    assert.deepEqual(checkWorkflowContract(repaired), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('safe auto-fix is idempotent; already-valid workflow is left byte-identical', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-preflight-idempotent-'));
  try {
    const dir = join(root, '.github/workflows');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'commit-guard.yml'), readFileSync(WORKFLOW, 'utf8'));
    assert.deepEqual(applySafeFixes(root), []);
    const first = readFileSync(join(dir, 'commit-guard.yml'), 'utf8');
    assert.deepEqual(applySafeFixes(root), []);
    assert.equal(readFileSync(join(dir, 'commit-guard.yml'), 'utf8'), first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
