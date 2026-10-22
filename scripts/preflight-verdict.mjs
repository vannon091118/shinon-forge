#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REQUIRED_CI_JOBS, JOB_DIAGNOSTIC_NAMES } from './lib/preflight/policy.mjs';

const REQUIRED_JOBS = REQUIRED_CI_JOBS;

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
    const jobCode = JOB_DIAGNOSTIC_NAMES[job]
      ?? String(job).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const statusCode = result === 'failure'
      ? 'FAILED'
      : result === 'cancelled'
        ? 'CANCELLED'
        : result === 'skipped'
          ? 'SKIPPED'
          : 'STATUS_UNRESOLVED';
    diagnostics.push({
      code: `PREFLIGHT_${jobCode}_${statusCode}`,
      severity: 'error',
      message: result === 'skipped'
        ? 'Job was skipped; skipped is not accepted'
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
  runUrl: env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : null,
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
  ...(report.runUrl ? [`- **Run logs:** [open job details](${report.runUrl})`] : []),
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
    ? diagnostics.map((item) => `- **${item.code}** (${item.job ?? 'workflow'}): ${item.message}${item.result ? ` [${item.result}]` : ''}${report.runUrl ? ` · [run logs](${report.runUrl})` : ''}`)
    : ['No acceptance errors. All required and included jobs succeeded.']),
  '',
];
const markdown = lines.join('\n');
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
process.exitCode = report.verdict === 'PASS' ? 0 : 1;
