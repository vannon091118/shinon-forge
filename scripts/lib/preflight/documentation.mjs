import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { diagnostic } from './diagnostics.mjs';

import { REQUIRED_FILES, REQUIRED_TEXT, REQUIRED_CI_JOBS } from './policy.mjs';

function locateLine(content, index) {
  return content.slice(0, index).split('\n').length;
}

function readUtf8(root, relative, diagnostics) {
  const absolute = resolve(root, relative);
  if (!existsSync(absolute)) {
    diagnostics.push(diagnostic('PREFLIGHT_DOC_MISSING', 'Required file is missing', { path: relative }));
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

function checkRequiredText(root, relative, expected, message, diagnostics, cache) {
  const content = cache.has(relative) ? cache.get(relative) : readUtf8(root, relative, diagnostics);
  if (content === null) return;
  if (!content.includes(expected)) {
    diagnostics.push(diagnostic('PREFLIGHT_DOC_RULE_MISSING', message, {
      path: relative,
      details: `expected marker ${JSON.stringify(expected)}`,
    }));
  }
}

function checkLocalLinks(root, relative, content, diagnostics) {
  const links = /\[[^\]]+\]\(([^)]+)\)/g;
  const rootAbsolute = resolve(root);
  for (const match of content.matchAll(links)) {
    let destination = match[1].trim();
    if (!destination || destination.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith('//')) continue;
    destination = destination.replace(/^<|>$/g, '').split('#', 1)[0].split('?', 1)[0];
    if (!destination) continue;
    try { destination = decodeURIComponent(destination); } catch { /* retain raw path; it will fail if invalid */ }
    const target = resolve(dirname(resolve(root, relative)), destination);
    const insideRepo = target === rootAbsolute || target.startsWith(rootAbsolute + sep);
    if (!insideRepo) {
      diagnostics.push(diagnostic('PREFLIGHT_LINK_ESCAPES_REPO', 'Local link resolves outside the repository', {
        path: relative,
        line: locateLine(content, match.index),
        details: match[1],
      }));
      continue;
    }
    if (!existsSync(target)) {
      diagnostics.push(diagnostic('PREFLIGHT_LINK_BROKEN', 'Local Markdown link target does not exist', {
        path: relative,
        line: locateLine(content, match.index),
        details: match[1],
      }));
    }
  }
}

function checkWorkflowVerdict(root, diagnostics, cache) {
  const relative = '.github/workflows/commit-guard.yml';
  const content = cache.has(relative) ? cache.get(relative) : readUtf8(root, relative, diagnostics);
  if (content === null) return;

  const verdictIndex = content.indexOf('  verdict:');
  if (verdictIndex < 0) {
    diagnostics.push(diagnostic('PREFLIGHT_VERDICT_JOB_MISSING', 'Workflow has no canonical verdict job', { path: relative }));
    return;
  }
  const needsIndex = content.indexOf('    needs:', verdictIndex);
  const alwaysIndex = content.indexOf('    if: always()', verdictIndex);
  if (needsIndex < 0 || alwaysIndex < 0 || alwaysIndex < needsIndex) {
    diagnostics.push(diagnostic('PREFLIGHT_VERDICT_FAIL_OPEN', 'Verdict job must declare needs and if: always()', {
      path: relative,
      details: 'Without needs + always(), a failed or skipped job can hide the final verdict.',
    }));
    return;
  }
  const needsBlock = content.slice(needsIndex, alwaysIndex);
  for (const job of REQUIRED_CI_JOBS) {
    if (!needsBlock.split(/\r?\n/).some((line) => line.trim() === `- ${job}`)) {
      diagnostics.push(diagnostic('PREFLIGHT_JOB_NOT_REQUIRED', 'Required check is not included in the final verdict', {
        path: relative,
        details: job,
      }));
    }
  }
}

export function inspectDocumentation(root) {
  const diagnostics = [];
  const cache = new Map();
  for (const relative of REQUIRED_FILES) cache.set(relative, readUtf8(root, relative, diagnostics));

  for (const [relative, expected, message] of REQUIRED_TEXT) {
    checkRequiredText(root, relative, expected, message, diagnostics, cache);
  }

  for (const relative of ['docs/INDEX.md', 'docs/CHANGELOG.md', 'docs/AGENT-HANDOFF.md']) {
    const content = cache.has(relative) ? cache.get(relative) : readUtf8(root, relative, diagnostics);
    if (content !== null) checkLocalLinks(root, relative, content, diagnostics);
  }

  checkWorkflowVerdict(root, diagnostics, cache);
  return {
    contract: 'shinon.preflight.documentation/v1',
    ok: diagnostics.length === 0,
    checkedFiles: REQUIRED_FILES.length,
    checkedRules: REQUIRED_TEXT.length + REQUIRED_CI_JOBS.length,
    diagnostics,
  };
}
