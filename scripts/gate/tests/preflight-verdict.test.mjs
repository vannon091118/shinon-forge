import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_CI_JOBS } from '../../lib/preflight/policy.mjs';
import { evaluatePreflight } from '../../preflight-verdict.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const SCRIPT = join(ROOT, 'scripts/preflight-verdict.mjs');
const successfulNeeds = (override = {}) => Object.fromEntries(REQUIRED_CI_JOBS.map((job) => [
  job, { result: override[job] ?? 'success' },
]));
const context = {
  sha: '0123456789abcdef0123456789abcdef01234567',
  runId: '123456789',
  event: 'pull_request',
  runUrl: 'https://github.com/vannon091118/shinon-forge/actions/runs/123456789',
  generatedAt: '2026-10-22T00:00:00.000Z',
};

test('pure verdict passes only when every required job succeeds', () => {
  const report = evaluatePreflight(successfulNeeds(), context);
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.commit, context.sha);
  assert.equal(report.runId, context.runId);
  assert.deepEqual(report.diagnostics, []);
  assert.ok(report.jobs.every((job) => job.result === 'success' && job.diagnosticCode === 'PASS'));
});

test('failed jobs get a stable job-specific code on both row and diagnostics', () => {
  const report = evaluatePreflight(successfulNeeds({ codeql: 'failure' }), context);
  assert.equal(report.verdict, 'FAIL');
  assert.ok(report.diagnostics.some((d) =>
    d.code === 'PREFLIGHT_CODEQL_FAILED' && d.job === 'codeql' && d.result === 'failure'));
  assert.equal(report.jobs.find((job) => job.job === 'codeql').diagnosticCode, 'PREFLIGHT_CODEQL_FAILED');
});

test('cancelled, pending and skipped jobs fail closed', () => {
  for (const [job, result, suffix, prefix] of [
    ['secret-scan', 'cancelled', 'CANCELLED', 'SECRET_SCAN'],
    ['prompter', 'pending', 'STATUS_UNRESOLVED', 'PROMPTER'],
    ['preflight-docs', 'skipped', 'SKIPPED', 'DOCUMENTATION'],
  ]) {
    const report = evaluatePreflight(successfulNeeds({ [job]: result }), context);
    assert.equal(report.verdict, 'FAIL');
    assert.ok(report.diagnostics.some((d) =>
      d.code === `PREFLIGHT_${prefix}_${suffix}` && d.job === job && d.result === result));
  }
});

test('preflight failure is the root error; downstream skipped jobs are labeled blocked', () => {
  const report = evaluatePreflight(successfulNeeds({
    'preflight-docs': 'failure',
    'gate-rules': 'skipped',
    'dependency-audit': 'skipped',
    codeql: 'skipped',
    'secret-scan': 'skipped',
  }), context);
  assert.equal(report.verdict, 'FAIL');
  assert.ok(report.diagnostics.some((d) =>
    d.code === 'PREFLIGHT_DOCUMENTATION_FAILED' && d.job === 'preflight-docs' && d.severity === 'error'));
  assert.ok(report.diagnostics.some((d) =>
    d.code === 'PREFLIGHT_BLOCKED_BY_DOCUMENTATION' &&
    d.severity === 'notice' && d.job === 'dependency-audit'));
  assert.equal(report.diagnostics.filter((d) => d.severity === 'error').length, 1);
});

test('missing required jobs and malformed dependency payloads fail closed', () => {
  const needs = successfulNeeds();
  delete needs['secret-scan'];
  const missing = evaluatePreflight(needs, context);
  assert.equal(missing.verdict, 'FAIL');
  assert.ok(missing.diagnostics.some((d) =>
    d.code === 'PREFLIGHT_REQUIRED_JOB_MISSING' && d.job === 'secret-scan'));

  const malformed = evaluatePreflight(null, context);
  assert.equal(malformed.verdict, 'FAIL');
  assert.ok(malformed.diagnostics.some((d) => d.code === 'PREFLIGHT_NEEDS_PAYLOAD_INVALID'));
});

test('CLI emits a durable report and a meaningful exit code on a failed acceptance', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'shinon-preflight-cli-'));
  try {
    const needs = successfulNeeds({ codeql: 'failure' });
    const run = spawnSync(process.execPath, [SCRIPT], {
      cwd, encoding: 'utf8',
      env: {
        ...process.env,
        PREFLIGHT_NEEDS: JSON.stringify(needs),
        GITHUB_SHA: context.sha,
        GITHUB_RUN_ID: context.runId,
        GITHUB_EVENT_NAME: context.event,
        GITHUB_STEP_SUMMARY: '',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'vannon091118/shinon-forge',
      },
    });
    assert.equal(run.status, 1);
    assert.match(run.stdout, /PREFLIGHT_CODEQL_FAILED/);
    const report = JSON.parse(readFileSync(join(cwd, 'preflight-report.json'), 'utf8'));
    assert.equal(report.verdict, 'FAIL');
    assert.equal(report.commit, context.sha);
    assert.equal(report.runUrl, context.runUrl);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
