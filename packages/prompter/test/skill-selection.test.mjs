import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSkills, selectSkills } from '../index.js';

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function skillRoot() {
  const root = mkdtempSync(join(tmpdir(), 'shinon-skill-selection-'));
  roots.push(root);
  return root;
}

function writeSkill(root, name, frontmatter) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), \`---\nname: \${name}\n\${frontmatter}\n---\n\n# \${name}\nBody deliberately excluded from the selector.\n\`);
}

test('readSkills parses description from YAML frontmatter, including folded values', () => {
  const root = skillRoot();
  writeSkill(root, 'z-special', 'description: >-\n  Quartz runtime\n  dependency resolver');
  const result = readSkills({ skillsPath: root }, { reading: { maxSkills: 1, minHits: 1 } });

  assert.equal(result.skills.length, 1);
  assert.equal(result.skills[0].description, 'Quartz runtime dependency resolver');
  assert.notEqual(result.skills[0].description, '---');
});

test('maxSkills is applied after relevance ranking, not before it', () => {
  const root = skillRoot();
  writeSkill(root, 'a-cordis', 'description: Cordis architecture patterns');
  writeSkill(root, 'b-router', 'description: task router transitions');
  writeSkill(root, 'c-tests', 'description: test harness');
  writeSkill(root, 'd-index', 'description: project index queries');
  writeSkill(root, 'z-special', 'description: quartz runtime dependency resolver');

  const read = readSkills({ skillsPath: root }, { reading: { maxSkills: 1, minHits: 1 } });
  assert.equal(read.skills.length, 5, 'all candidates must reach the ranker');

  const selected = selectSkills(read.skills, ['quartz runtime'], {
    maxSkills: 1,
    minHits: 1,
    minTokenLength: 4,
  });
  assert.deepEqual(selected.loaded.map((skill) => skill.name), ['z-special']);
  assert.equal(selected.loaded[0].hits, 2);
});

test('a skill without a description is reported instead of selected by folder name alone', () => {
  const root = skillRoot();
  const dir = join(root, 'no-description');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: no-description\n---\n\n# No description\n');

  const result = readSkills({ skillsPath: root }, { reading: { maxSkills: 1, minHits: 1 } });
  assert.equal(result.skills.length, 0);
  assert.deepEqual(result.skipped, [{ file: 'no-description', reason: 'BESCHREIBUNG_FEHLT' }]);
});
