import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { diagnostic } from './diagnostics.mjs';
import { REQUIRED_FILES, LINKED_DOCUMENTS, REQUIRED_CI_JOBS, PREFLIGHT_BLOCKED_JOBS } from './policy.mjs';

const MATRIX_RUN = 'run: ' + '$' + '{{ matrix.run }}';
const VERDICT_NEEDS = 'PREFLIGHT_NEEDS: ' + '$' + '{{ toJSON(needs) }}';
const TICK = String.fromCharCode(96);

const REQUIRED_JOB_BEHAVIORS = [
  { job: 'commit-guard', code: 'PREFLIGHT_COMMIT_GUARD_COMMAND_MISSING', message: 'Commit policy must run in CI mode.', contains: ['run: node scripts/commit-guard.mjs --ci'] },
  { job: 'unit', code: 'PREFLIGHT_UNIT_MATRIX_INCOMPLETE', message: 'The installation-free unit matrix must execute the expected package suites.', contains: [
    MATRIX_RUN, 'run: node --test packages/codingmon/test/*.test.mjs', 'run: node packages/hook/test/replay.test.mjs',
    'run: node --test packages/narrative/test/*.test.mjs', 'run: node --test packages/scoring/test/*.test.mjs',
    'run: node --test packages/token-usage/test/*.test.mjs', 'run: node --test packages/popup/test/*.test.mjs',
    'run: node --test packages/key-router/test/*.test.mjs', 'run: node --test packages/traceability/test/*.test.mjs',
  ] },
  { job: 'gate-full', code: 'PREFLIGHT_GATE_ENGINE_COMMAND_MISSING', message: 'The full gate engine (all plugins, fail-closed) must execute.', contains: ['run: npm run gate:full'] },
  { job: 'gate-rules', code: 'PREFLIGHT_GATE_TEST_COMMAND_MISSING', message: 'Behavioral gate tests and installed Codemon handoff must execute.', contains: [
    // Beide Bahnen in EINEM Runner: fast (lokal) + slow (CI-Tier). Der Runner
    // wertet TAP selbst aus; ein `cancelled` ist rot, nicht Exit 0.
    'run: npm run gate:test:all',
    'run: node --test packages/codingmon/test/uebergabe.test.mjs',
  ] },
  { job: 'quick', code: 'PREFLIGHT_QUICK_TEST_COMMAND_MISSING', message: 'Core tests and DSH version checks must execute after preflight.', contains: ['run: npm run test:core', 'run: node scripts/check-dsh-versions.mjs'] },
  { job: 'fixtures', code: 'PREFLIGHT_FIXTURE_COMMAND_MISSING', message: 'Fixture validation must execute against the real build.', contains: ['run: node scripts/validate-test.mjs'] },
  { job: 'distribution', code: 'PREFLIGHT_DISTRIBUTION_COMMAND_MISSING', message: 'The isolated package-distribution test must execute.', contains: ['run: node scripts/pack-test.mjs'] },
  { job: 'profile', code: 'PREFLIGHT_PROFILE_COMMAND_MISSING', message: 'The active DSH profile boot test must execute.', contains: ['run: node scripts/shinon-profile-test.mjs'] },
  { job: 'prompter', code: 'PREFLIGHT_PROMPTER_COMMAND_MISSING', message: 'The installed Prompter test suite must execute.', contains: ['run: node --test packages/prompter/test/*.test.mjs'] },
  { job: 'preflight-docs', code: 'PREFLIGHT_EXECUTOR_MISSING', message: 'The dependency-free preflight must run read-only in CI.', contains: ['run: node scripts/preflight-docs.mjs --check-only --json-out preflight-docs-report.json'] },
  { job: 'dependency-audit', code: 'PREFLIGHT_DEPENDENCY_AUDIT_COMMAND_MISSING', message: 'Production dependencies must be audited at the configured severity.', contains: ['run: npm audit --omit=dev --audit-level=high'] },
  { job: 'codeql', code: 'PREFLIGHT_CODEQL_ACTION_MISSING', message: 'CodeQL must initialize and analyze JavaScript/TypeScript.', contains: ['uses: github/codeql-action/init@v4', 'uses: github/codeql-action/analyze@v4'] },
  { job: 'secret-scan', code: 'PREFLIGHT_SECRET_SCAN_ACTION_MISSING', message: 'The secret scan must use Gitleaks and full history without saved checkout credentials.', contains: ['uses: gitleaks/gitleaks-action@v3', 'fetch-depth: 0', 'persist-credentials: false'] },
  { job: 'verdict', code: 'PREFLIGHT_VERDICT_EXECUTION_MISSING', message: 'The final verdict must evaluate needs and archive its machine-readable report.', contains: [
    'run: node scripts/preflight-verdict.mjs', VERDICT_NEEDS,
    'uses: actions/upload-artifact@v7', 'path: preflight-report.json',
  ] },
];

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function readUtf8(root, relative, diagnostics) {
  const absolute = resolve(root, relative);
  if (!existsSync(absolute)) {
    diagnostics.push(diagnostic('PREFLIGHT_DOC_MISSING', 'Required source-of-truth file is missing', { path: relative }));
    return null;
  }
  try {
    if (!statSync(absolute).isFile()) {
      diagnostics.push(diagnostic('PREFLIGHT_PATH_NOT_FILE', 'Required path is not a regular file', { path: relative }));
      return null;
    }
    return readFileSync(absolute, 'utf8');
  } catch (error) {
    diagnostics.push(diagnostic('PREFLIGHT_FILE_READ_FAILED', 'Could not read required file', {
      path: relative, details: error?.code ?? error?.message ?? String(error),
    }));
    return null;
  }
}

/** Mask fenced and inline code while preserving offsets and line numbers. */
function maskCode(content) {
  const fenceStart = new RegExp('^ {0,3}(' + TICK + '{3,}|~{3,})');
  const inlineCode = new RegExp(TICK + '+.*?' + TICK + '+', 'g');
  let fence = null;
  return content.split(/(?<=\n)/).map((line) => {
    const marker = fenceStart.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length) fence = null;
      return line.replace(/[^\r\n]/g, ' ');
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return line.replace(/[^\r\n]/g, ' ');
    }
    return line.replace(inlineCode, (span) => span.replace(/[^\r\n]/g, ' '));
  }).join('');
}

/** Check actual relative Markdown link targets; ignore examples inside code. */
export function checkLocalLinks(root, relative, content, diagnostics = []) {
  const visible = maskCode(content);
  const rootAbsolute = resolve(root);
  const links = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of visible.matchAll(links)) {
    let destination = match[1].trim();
    if (!destination || destination.startsWith('#') ||
        /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith('//')) continue;
    destination = destination.replace(/^<|>$/g, '').split('#', 1)[0].split('?', 1)[0];
    if (!destination) continue;
    try {
      destination = decodeURIComponent(destination);
    } catch {
      diagnostics.push(diagnostic('PREFLIGHT_LINK_ENCODING_INVALID', 'Relative Markdown link has invalid URL encoding', {
        path: relative, line: lineNumber(visible, match.index), details: match[1],
      }));
      continue;
    }
    const target = resolve(dirname(resolve(root, relative)), destination);
    const insideRepo = target === rootAbsolute || target.startsWith(rootAbsolute + sep);
    if (!insideRepo) {
      diagnostics.push(diagnostic('PREFLIGHT_LINK_ESCAPES_REPO', 'Relative Markdown link resolves outside the repository', {
        path: relative, line: lineNumber(visible, match.index), details: match[1],
      }));
      continue;
    }
    if (!existsSync(target)) {
      diagnostics.push(diagnostic('PREFLIGHT_LINK_BROKEN', 'Relative Markdown link target does not exist', {
        path: relative, line: lineNumber(visible, match.index), details: match[1],
      }));
    }
  }
  return diagnostics;
}

/** Validate real commands/actions, prerequisite wiring, and final fail-closed verdict. */
export function checkWorkflowContract(content, relative = '.github/workflows/commit-guard.yml') {
  const issues = [];
  const lines = content.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIndex < 0) {
    issues.push(diagnostic('PREFLIGHT_WORKFLOW_JOBS_MISSING', 'Workflow has no top-level jobs section', { path: relative }));
    return issues;
  }
  const jobEntries = [];
  for (let i = jobsIndex + 1; i < lines.length; i += 1) {
    const match = /^  ([a-zA-Z0-9_-]+):\s*(?:#.*)?$/.exec(lines[i]);
    if (match) jobEntries.push({ name: match[1], index: i });
  }
  const declared = new Set(jobEntries.map((item) => item.name));

  for (const behavior of REQUIRED_JOB_BEHAVIORS) {
    const entry = jobEntries.find((item) => item.name === behavior.job);
    if (!entry) continue;
    const next = jobEntries.find((item) => item.index > entry.index);
    const block = lines.slice(entry.index, next?.index ?? lines.length);
    const activeLines = block
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.replace(/\s+#.*$/, ''));
    // Every policy item is an actual YAML key/value line. A comment, echo string,
    // step name, or stale documentation snippet cannot satisfy a command contract.
    const missing = behavior.contains.filter((fragment) => !activeLines.includes(fragment));
    if (missing.length) {
      issues.push(diagnostic(behavior.code, behavior.message, {
        path: relative, line: entry.index + 1, details: missing.join('; '),
      }));
    }
  }

  for (const name of PREFLIGHT_BLOCKED_JOBS) {
    const entry = jobEntries.find((item) => item.name === name);
    if (!entry) continue;
    const next = jobEntries.find((item) => item.index > entry.index);
    const block = lines.slice(entry.index, next?.index ?? lines.length);
    const needsIndex = block.findIndex((line) => /^    needs\s*:/.test(line));
    let gated = false;
    if (needsIndex >= 0) {
      const inline = /^    needs\s*:\s*(.*)$/.exec(block[needsIndex])?.[1]?.trim() ?? '';
      if (inline.startsWith('[') && inline.endsWith(']')) {
        gated = inline.slice(1, -1).split(',').some((item) =>
          item.trim().replace(/^['"]|['"]$/g, '') === 'preflight-docs');
      } else if (inline) {
        gated = inline.replace(/^['"]|['"]$/g, '') === 'preflight-docs';
      } else {
        const nextField = block.findIndex((line, i) => i > needsIndex && /^    [a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line));
        const end = nextField < 0 ? block.length : nextField;
        gated = block.slice(needsIndex + 1, end).some((line) =>
          /^\s{6}-\s*['"]?preflight-docs['"]?\s*(?:#.*)?$/.test(line));
      }
    }
    if (!gated) {
      issues.push(diagnostic('PREFLIGHT_JOB_NOT_GATED_BY_PREFLIGHT', 'Expensive verification job can start before preflight succeeds', {
        path: relative, line: entry.index + 1, details: name,
      }));
    }
    if (block.some((line) => line.trim().startsWith('if:') && line.includes('always()'))) {
      issues.push(diagnostic('PREFLIGHT_JOB_BYPASSES_PREFLIGHT', 'An always() condition can run this job despite a failed preflight dependency', {
        path: relative, line: entry.index + 1, details: name,
      }));
    }
  }

  const verdict = jobEntries.find((item) => item.name === 'verdict');
  if (!verdict) {
    issues.push(diagnostic('PREFLIGHT_VERDICT_JOB_MISSING', 'Workflow has no canonical final-verdict job', { path: relative }));
    return issues;
  }
  const nextJob = jobEntries.find((item) => item.index > verdict.index);
  const block = lines.slice(verdict.index, nextJob?.index ?? lines.length);
  const needsIndex = block.findIndex((line) => /^    needs:\s*$/.test(line));
  const alwaysIndex = block.findIndex((line) => /^    if:\s*always\(\)\s*(?:#.*)?$/.test(line));
  if (alwaysIndex < 0) {
    const condition = block.find((line) => /^    if\s*:/.test(line));
    issues.push(diagnostic('PREFLIGHT_VERDICT_FAIL_OPEN', 'Final verdict must run with if: always()', {
      path: relative, line: verdict.index + 1,
      details: condition ? 'Found ' + condition.trim() + '; it can suppress diagnostics.' : 'No job-level always() condition is present.',
    }));
  }
  if (needsIndex < 0) {
    issues.push(diagnostic('PREFLIGHT_VERDICT_NEEDS_MISSING', 'Final verdict must depend on all validation jobs', {
      path: relative, line: verdict.index + 1,
    }));
    return issues;
  }
  if (/^    needs:\s*\S/.test(block[needsIndex])) {
    issues.push(diagnostic('PREFLIGHT_NEEDS_NOT_SEQUENCE', 'Final verdict needs must use a YAML sequence', {
      path: relative, line: verdict.index + needsIndex + 1, details: block[needsIndex].trim(),
    }));
    return issues;
  }
  const needsEnd = block.findIndex((line, i) => i > needsIndex && /^    [a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line));
  const needLines = block.slice(needsIndex + 1, needsEnd < 0 ? block.length : needsEnd);
  const seen = new Set();
  for (let i = 0; i < needLines.length; i += 1) {
    const match = /^\s{6}-\s*([a-zA-Z0-9_-]+)\s*$/.exec(needLines[i]);
    if (!match) continue;
    const name = match[1];
    if (seen.has(name)) {
      issues.push(diagnostic('PREFLIGHT_NEEDS_DUPLICATE_JOB', 'Final verdict references a job more than once', {
        path: relative, line: verdict.index + needsIndex + i + 2, details: name,
      }));
    }
    seen.add(name);
    if (!declared.has(name)) {
      issues.push(diagnostic('PREFLIGHT_NEEDS_UNKNOWN_JOB', 'Final verdict references an undeclared job', {
        path: relative, line: verdict.index + needsIndex + i + 2, details: name,
      }));
    }
  }
  for (const job of declared) {
    if (job !== 'verdict' && !seen.has(job)) {
      issues.push(diagnostic('PREFLIGHT_JOB_NOT_REQUIRED', 'Declared validation job is omitted from final acceptance', {
        path: relative, details: job,
      }));
    }
  }
  for (const job of REQUIRED_CI_JOBS) {
    if (!declared.has(job)) {
      issues.push(diagnostic('PREFLIGHT_JOB_DEFINITION_MISSING', 'Policy-required job is not declared', {
        path: relative, details: job,
      }));
    }
  }
  return issues;
}

export function inspectDocumentation(root) {
  const diagnostics = [];
  const cache = new Map();
  for (const relative of REQUIRED_FILES) cache.set(relative, readUtf8(root, relative, diagnostics));
  for (const relative of LINKED_DOCUMENTS) {
    const content = cache.get(relative);
    if (content !== null) checkLocalLinks(root, relative, content, diagnostics);
  }
  const workflowPath = '.github/workflows/commit-guard.yml';
  const workflow = cache.get(workflowPath);
  if (workflow !== null) diagnostics.push(...checkWorkflowContract(workflow, workflowPath));
  return {
    contract: 'shinon.preflight.documentation/v3',
    ok: diagnostics.length === 0,
    checkedFiles: REQUIRED_FILES.length,
    checkedNavigationDocs: LINKED_DOCUMENTS.length,
    checkedRequiredJobs: REQUIRED_CI_JOBS.length,
    checkedBehaviors: REQUIRED_JOB_BEHAVIORS.length,
    diagnostics,
  };
}
