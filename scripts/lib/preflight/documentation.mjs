import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { diagnostic } from './diagnostics.mjs';
import { REQUIRED_FILES, LINKED_DOCUMENTS, REQUIRED_CI_JOBS } from './policy.mjs';

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
