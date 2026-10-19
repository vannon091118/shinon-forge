/**
 * Gate: die Fähigkeitskarte gegen den BAUM prüfen.
 *
 * Der Kern prüft die Karte gegen sich selbst (`packages/prompter/test/`). Hier
 * steht die zweite Hälfte: existiert der Eigentümer, trägt er die Naht wörtlich,
 * liegt der Beleg, und ist jedes Paket mindestens einmal genannt? Eine Karte,
 * die ins Leere zeigt, ist keine Landkarte — sie ist eine Behauptung.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_BRIEF_CHARS, capabilityIssues, renderTaskBrief, taskBrief } from '../../../packages/prompter/assets/capability-map.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MAP = JSON.parse(readFileSync(join(ROOT, 'packages/prompter/assets/capabilities.json'), 'utf8'));
const SKIP_DIRS = new Set(['test', 'fixtures', 'node_modules']);
const RUNTIME_EXT = new Set(['.js', '.json', '.yaml', '.yml']);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), files);
    } else if (RUNTIME_EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const PACKAGES = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

test('die Karte ist gültig', () => {
  assert.deepEqual(capabilityIssues(MAP), []);
});

test('jede Frage gehört GENAU einem Eintrag', () => {
  const questions = new Map();
  for (const capability of MAP.capabilities) {
    const key = capability.frage.trim().toLowerCase();
    assert.equal(questions.has(key), false, `${capability.id} teilt sich die Frage mit ${questions.get(key)}`);
    questions.set(key, capability.id);
    assert.equal(typeof capability.owner, 'string');
    assert.equal(Array.isArray(capability.owner), false, `${capability.id}: owner ist eine Liste`);
  }
});

test('jeder Eigentümer ist ein Paket, und jedes Paket hat eine Frage', () => {
  for (const capability of MAP.capabilities) {
    assert.ok(PACKAGES.includes(capability.owner), `${capability.id}: Paket ${capability.owner} fehlt`);
  }
  const owned = new Set(MAP.capabilities.map((capability) => capability.owner));
  const missing = PACKAGES.filter((dir) => !owned.has(dir));
  assert.deepEqual(missing, [], `Pakete ohne Fähigkeit: ${missing.join(', ')}`);
});

test('jeder Beleg existiert und ist eine Datei', () => {
  for (const capability of MAP.capabilities) {
    for (const pointer of capability.evidence) {
      const absolute = join(ROOT, pointer);
      assert.ok(statSync(absolute).isFile(), `${capability.id}: ${pointer} ist keine Datei`);
    }
  }
});

test('jede Naht steht wörtlich im Eigentümer-Paket', () => {
  for (const capability of MAP.capabilities) {
    if (capability.seam === null) continue;
    const files = walk(join(ROOT, 'packages', capability.owner));
    const hit = files.find((file) => readFileSync(file, 'utf8').includes(capability.seam.name));
    assert.ok(hit, `${capability.id}: Naht ${capability.seam.name} fehlt in packages/${capability.owner}`);
  }
});

test('jeder Aufgabenbrief passt in seine Grenze', () => {
  for (const capability of MAP.capabilities) {
    const rendered = renderTaskBrief(taskBrief(capability), { maxChars: MAP.maxBriefChars ?? MAX_BRIEF_CHARS });
    assert.equal(rendered.ok, true, `${capability.id}: ${rendered.reason} (${rendered.chars})`);
  }
});
