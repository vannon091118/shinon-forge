#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { inspectDocumentation } from './lib/preflight/documentation.mjs';
import { formatDiagnostic } from './lib/preflight/diagnostics.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const jsonIndex = process.argv.indexOf('--json-out');
const root = rootIndex >= 0 && process.argv[rootIndex + 1] ? resolve(process.argv[rootIndex + 1]) : defaultRoot;
const jsonOut = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : null;

let result;
try {
  result = inspectDocumentation(root);
} catch (error) {
  result = {
    contract: 'shinon.preflight.documentation/v1',
    ok: false,
    checkedFiles: 0,
    checkedRules: 0,
    diagnostics: [{
      code: 'PREFLIGHT_INTERNAL_ERROR',
      severity: 'error',
      message: 'Preflight unexpectedly failed while inspecting repository state',
      details: error?.stack ?? error?.message ?? String(error),
    }],
  };
}

if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify(result, null, 2) + '\n', 'utf8');

if (!result.ok) {
  console.error(`PREFLIGHT DOCUMENT CONTRACT: FAIL (${result.diagnostics.length} error(s))`);
  for (const item of result.diagnostics) console.error(formatDiagnostic(item));
  process.exit(1);
}

console.log(`PREFLIGHT DOCUMENT CONTRACT: PASS (${result.checkedFiles} files; ${result.checkedRules} contract checks; local links valid)`);
