#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_JOBS = [
  'commit-guard', 'quick', 'unit', 'gate-rules', 'static-gate',
  'fixtures', 'distribution', 'profile', 'prompter', 'typescript',
  'preflight-docs', 'dependency-audit', 'codeql', 'secret-scan',
];

const env = process.env;
let needs;
const diagnostics = [];
try {
  needs = JSON.parse(env.PREFLIGHT_NEEDS ?? '{}');
} catch (error) {
  needs = {};
  diagnostics.push({
    code: 'PREFLIGHT_NEEDS_JSON_INVALID',
    severity: 'error',
    message: 'GitHub Actions needs payload is not valid JSON',
    details: error?.message ?? String(error),
  });
}

for (const job of REQUIRED_JOBS) {
  if (!Object.hasOwn(needs, job)) {
    diagnostics.push({
      code: 'PREFLIGHT_REQUIRED_JOB_MISSING',
      severity: 'error',
      message: 'Required job is absent from the final acceptance input',
      job,
    });
  }
}

const rows = [];
for (const [job, payload] of Object.entries(needs)) {
  const result = payload?.result ?? 'unknown';
  const row = { job, result, required: REQUIRED_JOBS.includes(job) };
  if (result !== 'success') {
    const normalized = String(result).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    diagnostics.push({
      code: `PREFLIGHT_JOB_${normalized}`,
      severity: 'error',
      message: result === 'skipped'
        ? 'Required or included job was skipped; skipped is not accepted'
        : result === 'cancelled'
          ? 'Job was cancelled and has no accepted result'
          : result === 'failure'
            ? 'Job failed; inspect the named workflow job logs'
            : 'Job result is missing, pending, or unknown; acceptance fails closed',
      job,
      result,
    });
  }
  rows.push(row);
}

const report = {
  schema: 'shinon.preflight.report/v1',
  verdict: diagnostics.length === 0 ? 'PASS' : 'FAIL',
  commit: env.GITHUB_SHA ?? 'unknown',
  runId: env.GITHUB_RUN_ID ?? 'unknown',
  event: env.GITHUB_EVENT_NAME ?? 'unknown',
  generatedAt: new Date().toISOString(),
  requiredJobs: REQUIRED_JOBS,
  jobs: rows,
  diagnostics,
};

const reportPath = resolve('preflight-report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

const lines = [
  '# Shinon Preflight Acceptance',
  '',
  `- **Verdict:** ${report.verdict}`,
  `- **Commit:** ${report.commit}`,
  `- **Run:** ${report.runId}`,
  `- **Event:** ${report.event}`,
  '',
  '## Job results',
  '',
  '| Job | Result | Required |',
  '|---|---|---|',
  ...rows.map((row) => `| ${row.job} | ${row.result} | ${row.required ? 'yes' : 'included dependency'} |`),
  '',
  '## Diagnostics',
  '',
  ...(diagnostics.length
    ? diagnostics.map((item) => `- **${item.code}** (${item.job ?? 'workflow'}): ${item.message}${item.result ? ` [${item.result}]` : ''}`)
    : ['No acceptance errors. All required and included jobs succeeded.']),
  '',
];
const markdown = lines.join('\n');
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
process.exitCode = report.verdict === 'PASS' ? 0 : 1;
