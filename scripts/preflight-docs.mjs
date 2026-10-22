#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { inspectDocumentation } from './lib/preflight/documentation.mjs';
import { applySafeFixes } from './lib/preflight/fixes.mjs';
import { formatDiagnostic, diagnostic } from './lib/preflight/diagnostics.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const jsonIndex = args.indexOf('--json-out');
const root = rootIndex >= 0 && args[rootIndex + 1] ? resolve(args[rootIndex + 1]) : defaultRoot;
const jsonOut = jsonIndex >= 0 ? args[jsonIndex + 1] : null;
const checkOnly = args.includes('--check-only') || (process.env.CI === 'true' && !args.includes('--fix'));
const repairs = [];
const diagnostics = [];

if (jsonIndex >= 0 && !jsonOut) {
  diagnostics.push(diagnostic('PREFLIGHT_OUTPUT_PATH_MISSING', '--json-out requires a report file path'));
}

try {
  if (!checkOnly) repairs.push(...applySafeFixes(root));
} catch (error) {
  diagnostics.push(diagnostic('PREFLIGHT_AUTOFIX_FAILED', 'Safe workflow repair failed; no acceptance is granted', {
    path: '.github/workflows/commit-guard.yml',
    details: error?.code ?? error?.message ?? String(error),
  }));
}

let result;
try {
  result = inspectDocumentation(root);
} catch (error) {
  result = {
    contract: 'shinon.preflight.documentation/v2',
    ok: false,
    checkedFiles: 0,
    checkedNavigationDocs: 0,
    checkedRequiredJobs: 0,
    diagnostics: [diagnostic('PREFLIGHT_INTERNAL_ERROR', 'Preflight failed while inspecting repository state', {
      details: error?.stack ?? error?.message ?? String(error),
    })],
  };
}

result.repairs = repairs;
result.diagnostics = [...diagnostics, ...result.diagnostics];
if (result.diagnostics.length > 0 || !result.ok) result.ok = false;

for (const repair of repairs) {
  console.log(`AUTO-FIX ${repair.code}: ${repair.message}${repair.details ? ` (${repair.details})` : ''}`);
}

if (jsonOut) {
  try {
    writeFileSync(resolve(jsonOut), JSON.stringify(result, null, 2) + '\n', 'utf8');
  } catch (error) {
    result.ok = false;
    const issue = diagnostic('PREFLIGHT_REPORT_WRITE_FAILED', 'Could not write the JSON report', {
      path: jsonOut, details: error?.code ?? error?.message ?? String(error),
    });
    result.diagnostics.push(issue);
    console.error(formatDiagnostic(issue));
  }
}

if (!result.ok) {
  console.error(`PREFLIGHT DOCUMENT CONTRACT: FAIL (${result.diagnostics.length} error(s))`);
  for (const item of result.diagnostics) console.error(formatDiagnostic(item));
  process.exit(1);
}

const mode = checkOnly ? 'read-only' : 'safe auto-fix';
console.log(`PREFLIGHT DOCUMENT CONTRACT: PASS (${mode}; ${result.checkedFiles} files; ${result.checkedNavigationDocs} navigation docs; ${result.checkedRequiredJobs} policy jobs; workflow graph verified)`);
