import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_CI_JOBS } from '../../lib/preflight/policy.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = join(root, 'scripts/preflight-verdict.mjs');
const required = REQUIRED_CI_JOBS;
const makeNeeds = (override = {}) => Object.fromEntries(required.map((job) => [
  job, { result: override[job] ?? 'success' },
]));
function runVerdict(needs) {
  const cwd = mkdtempSync(join(tmpdir(), 'shinon-preflight-verdict-'));
  try {
    const run = spawnSync(process.execPath, [script], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        PREFLIGHT_NEEDS: JSON.stringify(needs),
        GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567',
        GITHUB_RUN_ID: '123456789',
        GITHUB_EVENT_NAME: 'pull_request',
      },
    });
    const report = JSON.parse(readFileSync(join(cwd, 'preflight-report.json'), 'utf8'));
    return { ...run, report };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('preflight verdict passes only when every required job succeeds', () => {
  const run = runVerdict(makeNeeds());
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.report.verdict, 'PASS');
  assert.equal(run.report.commit, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(run.report.runId, '123456789');
  assert.deepEqual(run.report.diagnostics, []);
});

test('failed security job generates a concrete stable error code and keeps the report', () => {
  const run = runVerdict(makeNeeds({ codeql: 'failure' }));
  assert.equal(run.status, 1);
  assert.equal(run.report.verdict, 'FAIL');
  assert.ok(run.report.diagnostics.some((item) =>
    item.code === 'PREFLIGHT_CODEQL_FAILED' && item.job === 'codeql' && item.result === 'failure'));
});

test('skipped jobs are rejected instead of being silently accepted', () => {
  const run = runVerdict(makeNeeds({ 'preflight-docs': 'skipped' }));
  assert.equal(run.status, 1);
  assert.ok(run.report.diagnostics.some((item) =>
    item.code === 'PREFLIGHT_DOCUMENTATION_SKIPPED' && item.job === 'preflight-docs'));
});

test('missing required jobs produce explicit missing-job diagnostics', () => {
  const needs = makeNeeds();
  delete needs['secret-scan'];
  const run = runVerdict(needs);
  assert.equal(run.status, 1);
  assert.ok(run.report.diagnostics.some((item) =>
    item.code === 'PREFLIGHT_REQUIRED_JOB_MISSING' && item.job === 'secret-scan'));
});
