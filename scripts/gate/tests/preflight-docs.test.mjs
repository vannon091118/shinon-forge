import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectDocumentation } from '../../lib/preflight/documentation.mjs';
import { formatDiagnostic } from '../../lib/preflight/diagnostics.mjs';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const script = join(root, 'scripts/preflight-docs.mjs');

test('repository handoff and verdict wiring satisfy the preflight contract', () => {
  const result = inspectDocumentation(root);
  assert.equal(result.ok, true, result.diagnostics.map(formatDiagnostic).join('\n'));
  assert.equal(result.contract, 'shinon.preflight.documentation/v1');
});

test('missing files produce stable actionable error codes', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shinon-preflight-'));
  try {
    const result = inspectDocumentation(fixture);
    const missing = result.diagnostics.filter((item) => item.code === 'PREFLIGHT_DOC_MISSING');
    assert.ok(missing.some((item) => item.path === 'README.md'));
    assert.ok(missing.some((item) => item.path === 'docs/ROADMAP.md'));
    assert.match(formatDiagnostic(missing[0]), /^ERROR PREFLIGHT_DOC_MISSING:/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('CLI returns a non-zero exit and names the specific missing-file code', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shinon-preflight-cli-'));
  try {
    const run = spawnSync(process.execPath, [script, '--root', fixture], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /PREFLIGHT DOC/);
    assert.match(run.stderr, /ERROR PREFLIGHT_DOC_MISSING: Required file is missing \(README\.md\)/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
