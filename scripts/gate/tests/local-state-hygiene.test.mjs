import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const LOCAL_ONLY_PATHS = [
  '.freebuff/project-id',
  '.agent-work/task.json',
  '.agent-cache/index.json',
  'agent-output/report.md',
  'scratch/experiment.mjs',
  'tmp/probe.mjs',
  'temp/agent-draft.md',
  '.pi-katalog-probe.mjs',
  '.facts-perf-probe.mjs',
  '.env',
  '.credentials.yaml',
  'sessions/session.jsonl',
  'logs/agent.log',
];

test('local runtime and agent scratch paths stay ignored and out of the Git index', () => {
  for (const path of LOCAL_ONLY_PATHS) {
    assert.doesNotThrow(
      () => execFileSync('git', ['check-ignore', '--quiet', '--', path], {
        cwd: ROOT,
        stdio: 'ignore',
      }),
      `${path} must be ignored as local-only state`,
    );
  }

  const tracked = execFileSync('git', ['ls-files', '--', ...LOCAL_ONLY_PATHS], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(tracked, '', `local-only files must not be versioned:\n${tracked}`);

});
