import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PREFLIGHT_BLOCKED_JOBS } from './policy.mjs';

/**
 * Repair only unambiguous workflow wiring mistakes. Missing job definitions,
 * invalid conditions, broken links and policy failures remain human-visible.
 * The operation is idempotent and never edits test assertions or application code.
 */
export function applySafeFixes(root) {
  const relative = '.github/workflows/commit-guard.yml';
  const absolute = resolve(root, relative);
  if (!existsSync(absolute)) return [];

  const original = readFileSync(absolute, 'utf8');
  const lines = original.split('\n');
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIndex < 0) return [];

  const jobs = [];
  for (let i = jobsIndex + 1; i < lines.length; i += 1) {
    const match = /^  ([a-zA-Z0-9_-]+):\s*(?:#.*)?$/.exec(lines[i]);
    if (match) jobs.push({ name: match[1], index: i });
  }

  const verdict = jobs.find((job) => job.name === 'verdict');
  if (!verdict) return [];
  const allJobs = jobs.map((job) => job.name).filter((name) => name !== 'verdict');
  const repairs = [];

  // Gate expensive jobs before their install/build begins. Only repair the
  // unambiguous missing dependency and simple multiline dependency lists.
  // Existing scalar/inline dependency expressions are preserved for human review.
  for (const name of PREFLIGHT_BLOCKED_JOBS) {
    const currentJobs = [];
    for (let i = jobsIndex + 1; i < lines.length; i += 1) {
      const match = /^  ([a-zA-Z0-9_-]+):\\s*(?:#.*)?$/.exec(lines[i]);
      if (match) currentJobs.push({ name: match[1], index: i });
    }
    const entry = currentJobs.find((job) => job.name === name);
    if (!entry) continue;
    const next = currentJobs.find((job) => job.index > entry.index);
    const end = next?.index ?? lines.length;
    const block = lines.slice(entry.index, end);
    const needsIndex = block.findIndex((line) => /^    needs\\s*:/.test(line));
    const hasAlways = block.some((line) => /^    if:\\s*(?:\\$\\{\\{\\s*)?always\\(\\)/.test(line));

    if (needsIndex < 0 && !hasAlways) {
      const runsOn = block.findIndex((line) => /^    runs-on\\s*:/.test(line));
      const insertAt = entry.index + (runsOn >= 0 ? runsOn : 1);
      lines.splice(insertAt, 0, '    needs: preflight-docs');
      repairs.push({
        code: 'PREFLIGHT_AUTO_FIX_JOB_GATE',
        path: relative,
        message: 'Added preflight-docs as a prerequisite before the expensive verification job.',
        details: name,
      });
      continue;
    }

    if (needsIndex >= 0 && !/^    needs\\s*:\\s*\\S/.test(block[needsIndex])) {
      const nextField = block.findIndex((line, i) =>
        i > needsIndex && /^    [a-zA-Z][a-zA-Z0-9_-]*\\s*:/.test(line));
      const needsEnd = nextField < 0 ? block.length : nextField;
      const needLines = block.slice(needsIndex + 1, needsEnd);
      const namedNeeds = needLines
        .map((line) => /^\\s{6}-\\s*['"]?([a-zA-Z0-9_-]+)['"]?\\s*$/.exec(line)?.[1])
        .filter(Boolean);
      if (!namedNeeds.includes('preflight-docs')) {
        const start = entry.index + needsEnd;
        lines.splice(start, 0, '      - preflight-docs');
        repairs.push({
          code: 'PREFLIGHT_AUTO_FIX_JOB_GATE',
          path: relative,
          message: 'Added preflight-docs to an existing multiline prerequisite list.',
          details: name,
        });
      }
    }
  }

  let verdictIndex = lines.findIndex((line) => /^  verdict:\s*$/.test(line));
  let nextIndex = lines.findIndex((line, i) => i > verdictIndex && /^  [a-zA-Z0-9_-]+:\s*(?:#.*)?$/.test(line));
  let end = nextIndex < 0 ? lines.length : nextIndex;
  let block = lines.slice(verdictIndex, end);
  let needsIndex = block.findIndex((line) => /^    needs\s*:/.test(line));

  if (needsIndex < 0) {
    const conditionalIndex = block.findIndex((line) => /^    if\s*:/.test(line));
    const runsOnIndex = block.findIndex((line) => /^    runs-on\s*:/.test(line));
    const anchor = conditionalIndex >= 0 ? conditionalIndex : runsOnIndex >= 0 ? runsOnIndex : block.length;
    const top = verdictIndex + anchor;
    lines.splice(top, 0, '    needs:', ...allJobs.map((name) => `      - ${name}`));
    repairs.push({
      code: 'PREFLIGHT_AUTO_FIX_NEEDS_BLOCK',
      path: relative,
      message: 'Restored verdict.needs from declared verification jobs.',
      details: allJobs.join(', '),
    });
  } else if (/^    needs\s*:\s*\S/.test(block[needsIndex])) {
    // Inline needs / expression forms are not rewritten: their semantics are not
    // safely inferable from whitespace alone.
  } else {
    const nextField = block.findIndex((line, i) => i > needsIndex && /^    [a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line));
    const needsEnd = nextField < 0 ? block.length : nextField;
    const actualLines = block.slice(needsIndex + 1, needsEnd);
    const keptLines = [];
    const seen = new Set();
    const duplicates = new Set();
    for (const line of actualLines) {
      const match = /^\s{6}-\s*([a-zA-Z0-9_-]+)\s*$/.exec(line);
      if (!match) {
        keptLines.push(line);
        continue;
      }
      if (seen.has(match[1])) {
        duplicates.add(match[1]);
        continue;
      }
      seen.add(match[1]);
      keptLines.push(line);
    }
    if (duplicates.size) {
      const start = verdictIndex + needsIndex + 1;
      lines.splice(start, actualLines.length, ...keptLines);
      repairs.push({
        code: 'PREFLIGHT_AUTO_FIX_NEEDS_DUPLICATE',
        path: relative,
        message: 'Removed duplicate dependency entries from verdict.needs.',
        details: [...duplicates].join(', '),
      });
    }

    // Re-read the current verdict block after deduplication.
    verdictIndex = lines.findIndex((line) => /^  verdict:\s*$/.test(line));
    nextIndex = lines.findIndex((line, i) => i > verdictIndex && /^  [a-zA-Z0-9_-]+:\s*(?:#.*)?$/.test(line));
    end = nextIndex < 0 ? lines.length : nextIndex;
    block = lines.slice(verdictIndex, end);
    needsIndex = block.findIndex((line) => /^    needs\s*:/.test(line));
    if (needsIndex >= 0 && !/^    needs\s*:\s*\S/.test(block[needsIndex])) {
      const nextField = block.findIndex((line, i) => i > needsIndex && /^    [a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line));
      const needsEnd = nextField < 0 ? block.length : nextField;
      const linked = new Set(block.slice(needsIndex + 1, needsEnd)
        .map((line) => /^\s{6}-\s*([a-zA-Z0-9_-]+)\s*$/.exec(line)?.[1])
        .filter(Boolean));
      const missing = allJobs.filter((name) => !linked.has(name));
      if (missing.length) {
        lines.splice(verdictIndex + needsEnd, 0, ...missing.map((name) => `      - ${name}`));
        repairs.push({
          code: 'PREFLIGHT_AUTO_FIX_NEEDS',
          path: relative,
          message: 'Added declared verification jobs omitted from the final verdict.',
          details: missing.join(', '),
        });
      }
    }
  }

  // Add always() only when there is no condition to preserve. Never overwrite a
  // deliberate expression such as if: success() because that needs a human call.
  verdictIndex = lines.findIndex((line) => /^  verdict:\s*$/.test(line));
  nextIndex = lines.findIndex((line, i) => i > verdictIndex && /^  [a-zA-Z0-9_-]+:\s*(?:#.*)?$/.test(line));
  end = nextIndex < 0 ? lines.length : nextIndex;
  block = lines.slice(verdictIndex, end);
  const hasCondition = block.some((line) => /^    if\s*:/.test(line));
  if (!hasCondition) {
    const runsOn = block.findIndex((line) => /^    runs-on\s*:/.test(line));
    if (runsOn >= 0) {
      lines.splice(verdictIndex + runsOn, 0, '    if: always()');
      repairs.push({
        code: 'PREFLIGHT_AUTO_FIX_ALWAYS',
        path: relative,
        message: 'Added if: always() so the final diagnostic report runs after upstream failures.',
      });
    }
  }

  const repaired = lines.join('\n');
  if (repaired !== original) writeFileSync(absolute, repaired, 'utf8');
  return repairs;
}
