#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { modelRouteIssues } from './lib/model-route.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const read = (path) => readFileSync(join(root, path), 'utf8');
const profile = readJson('profiles/mobile/package.json');
const manifest = readJson('packages/mobile/package.json');
const required = [
  '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@shinon/persona',
  '@shinon/core', '@shinon/events', '@shinon/locale-de', '@shinon/better-errors',
  '@shinon/token-usage', '@shinon/prompter', '@shinon/narrative', '@shinon/mobile',
];
assert.deepEqual(profile.dsh.profile.bundles, required, 'Mobile bundle allowlist drifted');
assert.equal(manifest.name, '@shinon/mobile');
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
assert.equal(manifest.dsh.client.platform, 'web');
for (const path of ['index.js', 'client.js', 'cordis.patch.yml']) {
  assert.ok(existsSync(join(root, 'packages/mobile', path)), `missing mobile package file: ${path}`);
}
for (const name of profile.dsh.profile.bundles) {
  if (name.startsWith('@deepseek-ai/dsh-experimental-')) assert.fail(`experimental bundle must not ship: ${name}`);
  if (/codingmon|project-index|task-router|key-router|openapi/.test(name)) assert.fail(`excluded bundle must not ship: ${name}`);
}
const patch = read('profiles/mobile/cordis.patch.yml');
assert.match(patch, /apiKeyEnv: AGNES_API_KEY/);
// Die Route ist eine FORM, kein Modell-Literal: der Provider muss im eigenen
// Katalog stehen und das Modell in dessen Liste. Welches Modell gewaehlt ist,
// entscheidet das Profil — Agnes ist die empfohlene kostenlose Route der Doku.
const routeIssues = modelRouteIssues(patch);
assert.deepEqual(routeIssues, [], `model route: ${routeIssues.join(', ')}`);
assert.doesNotMatch(patch, /(?:sk-[A-Za-z0-9]{16,}|api[_-]?key\s*:\s*['"][^'"]{12,})/i, 'secret-like value in profile');
assert.match(read('packages/mobile/client.js'), /viewport-fit=cover/);
assert.doesNotMatch(read('packages/mobile/client.js'), /user-scalable\s*=\s*no/i, 'must not disable user zoom');
console.log('mobile profile contract: PASS (allowlist, profile, provider env reference, viewport contract)');
