#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_CI_JOBS,
  JOB_DIAGNOSTIC_NAMES,
  PREFLIGHT_BLOCKED_JOBS,
} from './lib/preflight/policy.mjs';

function statusSuffix(result) {
  if (result === 'failure') return 'FAILED';
  if (result === 'cancelled') return 'CANCELLED';
  if (result === 'skipped') return 'SKIPPED';
  return 'STATUS_UNRESOLVED';
}

function statusMessage(result) {
  if (result === 'failure') return 'Job failed; open the named job logs for its failing step.';
  if (result === 'cancelled') return 'Job was cancelled and has no accepted result.';
  if (result === 'skipped') return 'Job was skipped; skipped is not accepted as success.';
  return 'Job result is missing, pending, or unknown; acceptance fails closed.';
}

/** Pure decision function: fast to exercise without spawning a child process. */
export function evaluatePreflight(input, context = {}) {
  const diagnostics = [];
  let needs = input;

  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
    needs = {};
    diagnostics.push({
      code: 'PREFLIGHT_NEEDS_PAYLOAD_INVALID',
      severity: 'error',
      message: 'Workflow needs payload must be an object keyed by job id.',
    });
  }

  for (const job of REQUIRED_CI_JOBS) {
    if (!Object.hasOwn(needs, job)) {
      diagnostics.push({
        code: 'PREFLIGHT_REQUIRED_JOB_MISSING',
        severity: 'error',
        message: 'Required job is absent from final acceptance input.',
        job,
      });
    }
  }

  const rows = [];
  const docsStatus = needs['preflight-docs']?.result ?? 'unknown';
  for (const [job, payload] of Object.entries(needs)) {
    const result = payload?.result ?? 'unknown';
    const row = { job, result, required: REQUIRED_CI_JOBS.includes(job), diagnosticCode: 'PASS' };

    if (result !== 'success') {
      const blocked = result === 'skipped' &&
        PREFLIGHT_BLOCKED_JOBS.includes(job) &&
        docsStatus !== 'success';

      if (blocked) {
        row.diagnosticCode = 'PREFLIGHT_BLOCKED_BY_DOCUMENTATION';
        diagnostics.push({
          code: row.diagnosticCode,
          severity: 'notice',
          message: 'Job was not started because the prerequisite documentation preflight did not pass.',
          job,
          result,
          upstreamJob: 'preflight-docs',
          upstreamResult: docsStatus,
        });
      } else {
        const prefix = JOB_DIAGNOSTIC_NAMES[job] ??
          String(job).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        row.diagnosticCode = `PREFLIGHT_${prefix}_${statusSuffix(result)}`;
        diagnostics.push({
          code: row.diagnosticCode,
          severity: 'error',
          message: statusMessage(result),
          job,
          result,
        });
      }
    }
    rows.push(row);
  }

  const errors = diagnostics.filter((item) => item.severity === 'error');
  return {
    schema: 'shinon.preflight.report/v1',
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    commit: context.sha ?? 'unknown',
    runId: context.runId ?? 'unknown',
    event: context.event ?? 'unknown',
    generatedAt: context.generatedAt ?? new Date().toISOString(),
    runUrl: context.runUrl ?? null,
    requiredJobs: REQUIRED_CI_JOBS,
    jobs: rows,
    diagnostics,
  };
}

export function renderReport(report) {
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
    '| Job | Result | Required | Diagnostic |',
    '|---|---|---|---|',
    ...report.jobs.map((row) =>
      `| ${row.job} | ${row.result} | ${row.required ? 'yes' : 'included dependency'} | ${row.diagnosticCode} |`),
    '',
    '## Diagnostics',
    '',
    ...(report.diagnostics.length
      ? report.diagnostics.map((item) =>
        `- **${item.code}** (${item.job ?? 'workflow'}): ${item.message}${item.result ? ` [${item.result}]` : ''}${item.upstreamJob ? `; upstream ${item.upstreamJob}=${item.upstreamResult}` : ''}${report.runUrl ? ` · [run logs](${report.runUrl})` : ''}`)
      : ['No acceptance errors. All required and included jobs succeeded.']),
    '',
  ];
  return lines.join('\n');
}

function main() {
  const env = process.env;
  let input;
  try {
    input = JSON.parse(env.PREFLIGHT_NEEDS ?? '{}');
  } catch {
    input = null;
  }

  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : null;
  const report = evaluatePreflight(input, {
    sha: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID,
    event: env.GITHUB_EVENT_NAME,
    runUrl,
  });

  const markdown = renderReport(report);
  if (env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(env.GITHUB_STEP_SUMMARY, markdown + '\n');
    } catch (error) {
      console.error(`PREFLIGHT_SUMMARY_WRITE_FAILED: ${error?.code ?? error?.message ?? error}`);
      process.exitCode = 1;
    }
  }
  console.log(markdown);

  try {
    writeFileSync(resolve('preflight-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  } catch (error) {
    console.error(`PREFLIGHT_REPORT_WRITE_FAILED: could not write preflight-report.json: ${error?.code ?? error?.message ?? error}`);
    process.exitCode = 1;
    return;
  }
  if (report.verdict !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
