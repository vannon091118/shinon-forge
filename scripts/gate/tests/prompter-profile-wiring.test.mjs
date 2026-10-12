import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundlePatch = new URL('../../../packages/prompter/cordis.patch.yml', import.meta.url);
const profilePatch = new URL('../../../profiles/shinon/cordis.patch.yml', import.meta.url);

test('MAX bundle uses the runtime index instead of the invalid context placeholder', () => {
  const bundle = readFileSync(bundlePatch, 'utf8');
  const profile = readFileSync(profilePatch, 'utf8');

  assert.match(bundle, /^\\s*mode:\\s*MAX\\s*$/m, 'MAX remains the selected mode');
  assert.doesNotMatch(
    bundle,
    /^\\s*contextPath:\\s*['"]?\\.\\/assets\\/max-context\\.json['"]?\\s*$/m,
    'the invalid schema placeholder must not shadow the runtime index',
  );
  assert.doesNotMatch(profile, /^\\s*contextPath:/m, 'profile layer must not reintroduce a static context file');
});
