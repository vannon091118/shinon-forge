import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('Freebuff workspace metadata stays ignored and out of the Git index', () => {
  const ignore = readFileSync(new URL('../../../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^\.freebuff\/$/m, '.freebuff workspace metadata is not ignored');

  const tracked = execFileSync('git', ['ls-files', '--', '.freebuff'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(tracked, '', `.freebuff files must not be versioned:\n${tracked}`);
});
