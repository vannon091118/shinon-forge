import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const script = join(root, 'scripts/preflight-docs.mjs');

test('preflight accepts the repository handoff contract', () => {
  const run = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `Expected preflight pass.\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
  assert.match(run.stdout, /PRE-FLIGHT DOCUMENT CONTRACT: PASS/);
});

test('preflight fails closed when required documentation is absent', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shinon-preflight-'));
  try {
    mkdirSync(join(fixture, '.github/workflows'), { recursive: true });
    mkdirSync(join(fixture, 'docs'), { recursive: true });
    const run = spawnSync(process.execPath, [script, '--root', fixture], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 1, `Expected fail-closed exit.\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
    assert.match(run.stderr, /missing required file: README\.md/);
    assert.match(run.stderr, /missing required file: docs\/ROADMAP\.md/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
