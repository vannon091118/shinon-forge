import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { diagnostic } from './diagnostics.mjs';
import { REQUIRED_FILES, LINKED_DOCUMENTS, REQUIRED_CI_JOBS, PREFLIGHT_BLOCKED_JOBS } from './policy.mjs';

// Job labels alone do not prove that the matching check actually runs.
const REQUIRED_JOB_BEHAVIORS = [
  {
    job: 'commit-guard',
    code: 'PREFLIGHT_COMMIT_GUARD_COMMAND_MISSING',
    message: 'Commit policy must run in CI mode.',
    contains: ['run: node scripts/commit-guard.mjs --ci'],
  },
  {
    job: 'unit',
    code: 'PREFLIGHT_UNIT_MATRIX_INCOMPLETE',
    message: 'The installation-free unit matrix must execute the expected package suites.',
    contains: [
      'run: ' + '
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
      path: relative,
      details: error?.code ?? error?.message ?? String(error),
    }));
    return null;
  }
}

/** Hide fenced and inline code without moving offsets or line numbers. */
function maskCode(content) {
  let fence = null;
  return content.split(/(?<=\n)/).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length) fence = null;
      return line.replace(/[^\r\n]/g, ' ');
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return line.replace(/[^\r\n]/g, ' ');
    }
    return line.replace(/(`+).*?\1/g, (span) => span.replace(/[^\r\n]/g, ' '));
  }).join('');
}

/** Check real relative Markdown targets; ignore examples and inline code. */
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

/** Validate job definitions and their effective inclusion in the final verdict. */
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
    if (!entry) continue; // The separate definition check emits the clearer missing-job code.
    const next = jobEntries.find((item) => item.index > entry.index);
    const block = lines.slice(entry.index, next?.index ?? lines.length).join('\n');
    const missing = behavior.contains.filter((fragment) => !block.includes(fragment));
    if (missing.length) {
      issues.push(diagnostic(behavior.code, behavior.message, {
        path: relative,
        line: entry.index + 1,
        details: missing.join('; '),
      }));
    }
  }

  // These jobs are expensive enough to wait for the dependency-free preflight.
  // Checking only verdict.needs would be insufficient: the report could be red
  // while npm installs and builds still start in parallel.
  for (const name of PREFLIGHT_BLOCKED_JOBS) {
    const entry = jobEntries.find((item) => item.name === name);
    if (!entry) continue;
    const next = jobEntries.find((item) => item.index > entry.index);
    const jobBlock = lines.slice(entry.index, next?.index ?? lines.length);
    const needsIndex = jobBlock.findIndex((line) => /^    needs\s*:/.test(line));
    let hasPreflightNeed = false;

    if (needsIndex >= 0) {
      const inline = /^    needs\s*:\s*(.*)$/.exec(jobBlock[needsIndex])?.[1]?.trim() ?? '';
      if (inline && inline.startsWith('[') && inline.endsWith(']')) {
        hasPreflightNeed = inline.slice(1, -1).split(',').some((item) =>
          item.trim().replace(/^['"]|['"]$/g, '') === 'preflight-docs');
      } else if (inline) {
        hasPreflightNeed = inline.replace(/^['"]|['"]$/g, '') === 'preflight-docs';
      } else {
        const nextField = jobBlock.findIndex((line, i) =>
          i > needsIndex && /^    [a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line));
        const needsEnd = nextField < 0 ? jobBlock.length : nextField;
        hasPreflightNeed = jobBlock.slice(needsIndex + 1, needsEnd).some((line) =>
          /^\s{6}-\s*['"]?preflight-docs['"]?\s*(?:#.*)?$/.test(line));
      }
    }

    if (!hasPreflightNeed) {
      issues.push(diagnostic('PREFLIGHT_JOB_NOT_GATED_BY_PREFLIGHT', 'Expensive verification job can start before the dependency-free preflight succeeds', {
        path: relative,
        line: entry.index + 1,
        details: name,
      }));
    }

    if (jobBlock.some((line) => /^    if:\s*(?:\$\{\{\s*)?always\(\)/.test(line))) {
      issues.push(diagnostic('PREFLIGHT_JOB_BYPASSES_PREFLIGHT', 'An always() condition can run this job despite a failed preflight dependency', {
        path: relative,
        line: entry.index + 1,
        details: name,
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
  const ifIndex = block.findIndex((line) => /^    if:\s*always\(\)\s*(?:#.*)?$/.test(line));
  if (ifIndex < 0) {
    const anyIf = block.find((line) => /^    if\s*:/.test(line));
    issues.push(diagnostic('PREFLIGHT_VERDICT_FAIL_OPEN', 'Final verdict must run with if: always()', {
      path: relative,
      line: verdict.index + 1,
      details: anyIf ? 'Found ' + anyIf.trim() + '; do not let it suppress the diagnostic report.' : 'No job-level always() condition is present.',
    }));
  }
  if (needsIndex < 0) {
    issues.push(diagnostic('PREFLIGHT_VERDICT_NEEDS_MISSING', 'Final verdict must explicitly depend on all validation jobs', {
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
    const entry = /^\s{6}-\s*([a-zA-Z0-9_-]+)\s*$/.exec(needLines[i]);
    if (!entry) continue;
    const name = entry[1];
    if (seen.has(name)) {
      issues.push(diagnostic('PREFLIGHT_NEEDS_DUPLICATE_JOB', 'Final verdict references a job more than once', {
        path: relative, line: verdict.index + needsIndex + i + 2, details: name,
      }));
    }
    seen.add(name);
    if (!declared.has(name)) {
      issues.push(diagnostic('PREFLIGHT_NEEDS_UNKNOWN_JOB', 'Final verdict references a job that is not declared', {
        path: relative, line: verdict.index + needsIndex + i + 2, details: name,
      }));
    }
  }

  for (const job of declared) {
    if (job !== 'verdict' && !seen.has(job)) {
      issues.push(diagnostic('PREFLIGHT_JOB_NOT_REQUIRED', 'Declared validation job is not included in final acceptance', {
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

  // These documents are entry points. Historic diary prose and code examples do
  // not become brittle link contracts; the diary's own gate verifies its anchors.
  for (const relative of LINKED_DOCUMENTS) {
    const content = cache.get(relative);
    if (content !== null) checkLocalLinks(root, relative, content, diagnostics);
  }

  const workflowPath = '.github/workflows/commit-guard.yml';
  const workflow = cache.get(workflowPath);
  if (workflow !== null) diagnostics.push(...checkWorkflowContract(workflow, workflowPath));

  return {
    contract: 'shinon.preflight.documentation/v2',
    ok: diagnostics.length === 0,
    checkedFiles: REQUIRED_FILES.length,
    checkedNavigationDocs: LINKED_DOCUMENTS.length,
    checkedRequiredJobs: REQUIRED_CI_JOBS.length,
    diagnostics,
  };
}
 + '{{ matrix.run }}',
      'packages/codingmon/test/*.test.mjs',
      'packages/hook/test/replay.test.mjs',
      'packages/narrative/test/*.test.mjs',
      'packages/scoring/test/*.test.mjs',
      'packages/token-usage/test/*.test.mjs',
      'packages/popup/test/*.test.mjs',
      'packages/key-router/test/*.test.mjs',
      'packages/traceability/test/*.test.mjs',
    ],
  },
  {
    job: 'gate-rules',
    code: 'PREFLIGHT_GATE_TEST_COMMAND_MISSING',
    message: 'The behavioral gate suite and installed Codemon handoff must execute.',
    contains: [
      'run: node --test scripts/gate/tests/*.test.mjs',
      'run: node --test packages/codingmon/test/uebergabe.test.mjs',
    ],
  },
  {
    job: 'quick',
    code: 'PREFLIGHT_QUICK_TEST_COMMAND_MISSING',
    message: 'The post-preflight core tests and DSH version contract must execute.',
    contains: [
      'run: npm run test:core',
      'run: node scripts/check-dsh-versions.mjs',
    ],
  },
  {
    job: 'fixtures',
    code: 'PREFLIGHT_FIXTURE_COMMAND_MISSING',
    message: 'Fixture validation must run against the real build.',
    contains: ['run: node scripts/validate-test.mjs'],
  },
  {
    job: 'distribution',
    code: 'PREFLIGHT_DISTRIBUTION_COMMAND_MISSING',
    message: 'The isolated distribution test must execute.',
    contains: ['run: node scripts/pack-test.mjs'],
  },
  {
    job: 'profile',
    code: 'PREFLIGHT_PROFILE_COMMAND_MISSING',
    message: 'The active DSH profile boot test must execute.',
    contains: ['run: node scripts/shinon-profile-test.mjs'],
  },
  {
    job: 'prompter',
    code: 'PREFLIGHT_PROMPTER_COMMAND_MISSING',
    message: 'The installed Prompter test suite must execute.',
    contains: ['run: node --test packages/prompter/test/*.test.mjs'],
  },
  {
    job: 'typescript',
    code: 'PREFLIGHT_TYPESCRIPT_COMMAND_MISSING',
    message: 'The TypeScript contract runner must execute.',
    contains: ['run: npm run typecheck'],
  },
  {
    job: 'preflight-docs',
    code: 'PREFLIGHT_EXECUTOR_MISSING',
    message: 'The dependency-free preflight must execute in read-only CI mode.',
    contains: ['run: node scripts/preflight-docs.mjs --check-only'],
  },
  {
    job: 'dependency-audit',
    code: 'PREFLIGHT_DEPENDENCY_AUDIT_COMMAND_MISSING',
    message: 'Production dependencies must be audited at the required severity.',
    contains: ['run: npm audit --omit=dev --audit-level=high'],
  },
  {
    job: 'codeql',
    code: 'PREFLIGHT_CODEQL_ACTION_MISSING',
    message: 'CodeQL must initialize and analyze JavaScript/TypeScript.',
    contains: [
      'uses: github/codeql-action/init@v4',
      'uses: github/codeql-action/analyze@v4',
    ],
  },
  {
    job: 'secret-scan',
    code: 'PREFLIGHT_SECRET_SCAN_ACTION_MISSING',
    message: 'The secret scan must run against full history without persisting checkout credentials.',
    contains: [
      'uses: gitleaks/gitleaks-action@v3',
      'fetch-depth: 0',
      'persist-credentials: false',
    ],
  },
  {
    job: 'verdict',
    code: 'PREFLIGHT_VERDICT_EXECUTION_MISSING',
    message: 'The final acceptance must evaluate needs and archive its machine-readable report.',
    contains: [
      'run: node scripts/preflight-verdict.mjs',
      'PREFLIGHT_NEEDS: ' + '
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
      path: relative,
      details: error?.code ?? error?.message ?? String(error),
    }));
    return null;
  }
}

/** Hide fenced and inline code without moving offsets or line numbers. */
function maskCode(content) {
  let fence = null;
  return content.split(/(?<=\n)/).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length) fence = null;
      return line.replace(/[^\r\n]/g, ' ');
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return line.replace(/[^\r\n]/g, ' ');
    }
    return line.replace(/(`+).*?\1/g, (span) => span.replace(/[^\r\n]/g, ' '));
  }).join('');
}

/** Check real relative Markdown targets; ignore examples and inline code. */
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

/** Validate job definitions and their effective inclusion in the final verdict. */
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

  // These jobs are expensive enough to wait for the dependency-free preflight.
  // Checking only verdict.needs would be insufficient: the report could be red
  // while npm installs and builds still start in parallel.
  for (const name of PREFLIGHT_BLOCKED_JOBS) {
    const entry = jobEntries.find((item) => item.name === name);
    if (!entry) continue;
    const next = jobEntries.find((item) => item.index > entry.index);
    const jobBlock = lines.slice(entry.index, next?.index ?? lines.length);
    const needsIndex = jobBlock.findIndex((line) => /^    needs\s*:/.test(line));
    let hasPreflightNeed = false;

    if (needsIndex >= 0) {
      const inline = /^    needs\s*:\s*(.*)$/.exec(jobBlock[needsIndex])?.[1]?.trim() ?? '';
      if (inline && inline.startsWith('[') && inline.endsWith(']')) {
        hasPreflightNeed = inline.slice(1, -1).split(',').some((item) =>
          item.trim().replace(/^['"]|['"]$/g, '') === 'preflight-docs');
      } else if (inline) {
        hasPreflightNeed = inline.replace(/^['"]|['"]$/g, '') === 'preflight-docs';
      } else {
        const nextField = jobBlock.findIndex((line, i) =>
          i > needsIndex && /^    [a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line));
        const needsEnd = nextField < 0 ? jobBlock.length : nextField;
        hasPreflightNeed = jobBlock.slice(needsIndex + 1, needsEnd).some((line) =>
          /^\s{6}-\s*['"]?preflight-docs['"]?\s*(?:#.*)?$/.test(line));
      }
    }

    if (!hasPreflightNeed) {
      issues.push(diagnostic('PREFLIGHT_JOB_NOT_GATED_BY_PREFLIGHT', 'Expensive verification job can start before the dependency-free preflight succeeds', {
        path: relative,
        line: entry.index + 1,
        details: name,
      }));
    }

    if (jobBlock.some((line) => /^    if:\s*(?:\$\{\{\s*)?always\(\)/.test(line))) {
      issues.push(diagnostic('PREFLIGHT_JOB_BYPASSES_PREFLIGHT', 'An always() condition can run this job despite a failed preflight dependency', {
        path: relative,
        line: entry.index + 1,
        details: name,
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
  const ifIndex = block.findIndex((line) => /^    if:\s*always\(\)\s*(?:#.*)?$/.test(line));
  if (ifIndex < 0) {
    const anyIf = block.find((line) => /^    if\s*:/.test(line));
    issues.push(diagnostic('PREFLIGHT_VERDICT_FAIL_OPEN', 'Final verdict must run with if: always()', {
      path: relative,
      line: verdict.index + 1,
      details: anyIf ? 'Found ' + anyIf.trim() + '; do not let it suppress the diagnostic report.' : 'No job-level always() condition is present.',
    }));
  }
  if (needsIndex < 0) {
    issues.push(diagnostic('PREFLIGHT_VERDICT_NEEDS_MISSING', 'Final verdict must explicitly depend on all validation jobs', {
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
    const entry = /^\s{6}-\s*([a-zA-Z0-9_-]+)\s*$/.exec(needLines[i]);
    if (!entry) continue;
    const name = entry[1];
    if (seen.has(name)) {
      issues.push(diagnostic('PREFLIGHT_NEEDS_DUPLICATE_JOB', 'Final verdict references a job more than once', {
        path: relative, line: verdict.index + needsIndex + i + 2, details: name,
      }));
    }
    seen.add(name);
    if (!declared.has(name)) {
      issues.push(diagnostic('PREFLIGHT_NEEDS_UNKNOWN_JOB', 'Final verdict references a job that is not declared', {
        path: relative, line: verdict.index + needsIndex + i + 2, details: name,
      }));
    }
  }

  for (const job of declared) {
    if (job !== 'verdict' && !seen.has(job)) {
      issues.push(diagnostic('PREFLIGHT_JOB_NOT_REQUIRED', 'Declared validation job is not included in final acceptance', {
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

  // These documents are entry points. Historic diary prose and code examples do
  // not become brittle link contracts; the diary's own gate verifies its anchors.
  for (const relative of LINKED_DOCUMENTS) {
    const content = cache.get(relative);
    if (content !== null) checkLocalLinks(root, relative, content, diagnostics);
  }

  const workflowPath = '.github/workflows/commit-guard.yml';
  const workflow = cache.get(workflowPath);
  if (workflow !== null) diagnostics.push(...checkWorkflowContract(workflow, workflowPath));

  return {
    contract: 'shinon.preflight.documentation/v2',
    ok: diagnostics.length === 0,
    checkedFiles: REQUIRED_FILES.length,
    checkedNavigationDocs: LINKED_DOCUMENTS.length,
    checkedRequiredJobs: REQUIRED_CI_JOBS.length,
    diagnostics,
  };
}
 + '{{ toJSON(needs) }}',
      'uses: actions/upload-artifact@v7',
      'path: preflight-report.json',
    ],
  },
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
      path: relative,
      details: error?.code ?? error?.message ?? String(error),
    }));
    return null;
  }
}

/** Hide fenced and inline code without moving offsets or line numbers. */
function maskCode(content) {
  let fence = null;
  return content.split(/(?<=\n)/).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length) fence = null;
      return line.replace(/[^\r\n]/g, ' ');
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return line.replace(/[^\r\n]/g, ' ');
    }
    return line.replace(/(`+).*?\1/g, (span) => span.replace(/[^\r\n]/g, ' '));
  }).join('');
}

/** Check real relative Markdown targets; ignore examples and inline code. */
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

/** Validate job definitions and their effective inclusion in the final verdict. */
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

  // These jobs are expensive enough to wait for the dependency-free preflight.
  // Checking only verdict.needs would be insufficient: the report could be red
  // while npm installs and builds still start in parallel.
  for (const name of PREFLIGHT_BLOCKED_JOBS) {
    const entry = jobEntries.find((item) => item.name === name);
    if (!entry) continue;
    const next = jobEntries.find((item) => item.index > entry.index);
    const jobBlock = lines.slice(entry.index, next?.index ?? lines.length);
    const needsIndex = jobBlock.findIndex((line) => /^    needs\s*:/.test(line));
    let hasPreflightNeed = false;

    if (needsIndex >= 0) {
      const inline = /^    needs\s*:\s*(.*)$/.exec(jobBlock[needsIndex])?.[1]?.trim() ?? '';
      if (inline && inline.startsWith('[') && inline.endsWith(']')) {
        hasPreflightNeed = inline.slice(1, -1).split(',').some((item) =>
          item.trim().replace(/^['"]|['"]$/g, '') === 'preflight-docs');
      } else if (inline) {
        hasPreflightNeed = inline.replace(/^['"]|['"]$/g, '') === 'preflight-docs';
      } else {
        const nextField = jobBlock.findIndex((line, i) =>
          i > needsIndex && /^    [a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line));
        const needsEnd = nextField < 0 ? jobBlock.length : nextField;
        hasPreflightNeed = jobBlock.slice(needsIndex + 1, needsEnd).some((line) =>
          /^\s{6}-\s*['"]?preflight-docs['"]?\s*(?:#.*)?$/.test(line));
      }
    }

    if (!hasPreflightNeed) {
      issues.push(diagnostic('PREFLIGHT_JOB_NOT_GATED_BY_PREFLIGHT', 'Expensive verification job can start before the dependency-free preflight succeeds', {
        path: relative,
        line: entry.index + 1,
        details: name,
      }));
    }

    if (jobBlock.some((line) => /^    if:\s*(?:\$\{\{\s*)?always\(\)/.test(line))) {
      issues.push(diagnostic('PREFLIGHT_JOB_BYPASSES_PREFLIGHT', 'An always() condition can run this job despite a failed preflight dependency', {
        path: relative,
        line: entry.index + 1,
        details: name,
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
  const ifIndex = block.findIndex((line) => /^    if:\s*always\(\)\s*(?:#.*)?$/.test(line));
  if (ifIndex < 0) {
    const anyIf = block.find((line) => /^    if\s*:/.test(line));
    issues.push(diagnostic('PREFLIGHT_VERDICT_FAIL_OPEN', 'Final verdict must run with if: always()', {
      path: relative,
      line: verdict.index + 1,
      details: anyIf ? 'Found ' + anyIf.trim() + '; do not let it suppress the diagnostic report.' : 'No job-level always() condition is present.',
    }));
  }
  if (needsIndex < 0) {
    issues.push(diagnostic('PREFLIGHT_VERDICT_NEEDS_MISSING', 'Final verdict must explicitly depend on all validation jobs', {
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
    const entry = /^\s{6}-\s*([a-zA-Z0-9_-]+)\s*$/.exec(needLines[i]);
    if (!entry) continue;
    const name = entry[1];
    if (seen.has(name)) {
      issues.push(diagnostic('PREFLIGHT_NEEDS_DUPLICATE_JOB', 'Final verdict references a job more than once', {
        path: relative, line: verdict.index + needsIndex + i + 2, details: name,
      }));
    }
    seen.add(name);
    if (!declared.has(name)) {
      issues.push(diagnostic('PREFLIGHT_NEEDS_UNKNOWN_JOB', 'Final verdict references a job that is not declared', {
        path: relative, line: verdict.index + needsIndex + i + 2, details: name,
      }));
    }
  }

  for (const job of declared) {
    if (job !== 'verdict' && !seen.has(job)) {
      issues.push(diagnostic('PREFLIGHT_JOB_NOT_REQUIRED', 'Declared validation job is not included in final acceptance', {
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

  // These documents are entry points. Historic diary prose and code examples do
  // not become brittle link contracts; the diary's own gate verifies its anchors.
  for (const relative of LINKED_DOCUMENTS) {
    const content = cache.get(relative);
    if (content !== null) checkLocalLinks(root, relative, content, diagnostics);
  }

  const workflowPath = '.github/workflows/commit-guard.yml';
  const workflow = cache.get(workflowPath);
  if (workflow !== null) diagnostics.push(...checkWorkflowContract(workflow, workflowPath));

  return {
    contract: 'shinon.preflight.documentation/v2',
    ok: diagnostics.length === 0,
    checkedFiles: REQUIRED_FILES.length,
    checkedNavigationDocs: LINKED_DOCUMENTS.length,
    checkedRequiredJobs: REQUIRED_CI_JOBS.length,
    diagnostics,
  };
}
