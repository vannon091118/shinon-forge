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

function writeSkill(root, name, description) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), \`---\nname: \${name}\ndescription: \${description}\n---\n\n# \${name}\nBody deliberately excluded from the selector.\n\`);
}

const reading = { maxSkills: 4, minHits: 1, minTokenLength: 4, stopWords: ['please', 'can', 'you', 'kannst', 'mir', 'bitte', 'helfen'] };

test('readSkills parses description from YAML frontmatter, including folded values', () => {
  const root = skillRoot();
  const dir = join(root, 'z-special');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: z-special\ndescription: >-\n  Quartz runtime\n  dependency resolver\n---\n\n# z-special\n');
  const result = readSkills({ skillsPath: root }, { reading });

  assert.equal(result.skills.length, 1);
  assert.equal(result.skills[0].description, 'Quartz runtime dependency resolver');
});

test('maxSkills is applied after relevance ranking against the full directory', () => {
  const root = skillRoot();
  writeSkill(root, 'a-cordis', 'Cordis architecture patterns');
  writeSkill(root, 'b-router', 'task router transitions');
  writeSkill(root, 'c-tests', 'test harness');
  writeSkill(root, 'd-index', 'project index queries');
  writeSkill(root, 'z-special', 'quartz runtime dependency resolver');

  const read = readSkills({ skillsPath: root }, { reading: { ...reading, maxSkills: 1 } });
  assert.equal(read.skills.length, 5, 'all candidates must reach the ranker');
  const selected = selectSkills(read.skills, ['quartz runtime'], { ...reading, maxSkills: 1, explicitText: 'quartz runtime' });
  assert.deepEqual(selected.loaded.map((skill) => skill.name), ['z-special']);
  assert.equal(selected.loaded[0].hits, 2);
});

test('a skill explicitly named in the user prompt wins over higher-overlap candidates', () => {
  const root = skillRoot();
  writeSkill(root, 'a-general', 'quartz runtime dependency resolver architecture tests');
  writeSkill(root, 'z-special', 'one unrelated concept');
  const read = readSkills({ skillsPath: root }, { reading });
  const selected = selectSkills(read.skills, ['quartz runtime dependency resolver architecture tests'], {
    ...reading,
    explicitText: 'Bitte verwende den Skill z-special.',
  });
  assert.deepEqual(selected.loaded.map((skill) => skill.name)[0], 'z-special');
  assert.equal(selected.loaded[0].explicitlyNamed, true);
});

test('generic smalltalk does not load a skill from stopword overlap', () => {
  const root = skillRoot();
  writeSkill(root, 'dsh-dev-workflow', 'repo feature bugfix tests contracts');
  writeSkill(root, 'cordis-architektur', 'services events patch layers plugins');
  const read = readSkills({ skillsPath: root }, { reading });
  const selected = selectSkills(read.skills, ['Kannst du mir bitte helfen?'], {
    ...reading,
    explicitText: 'Kannst du mir bitte helfen?',
  });
  assert.deepEqual(selected.loaded, []);
});

test('a skill without a description is reported instead of selected by folder name alone', () => {
  const root = skillRoot();
  const dir = join(root, 'no-description');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: no-description\n---\n\n# No description\n');
  const result = readSkills({ skillsPath: root }, { reading });
  assert.equal(result.skills.length, 0);
  assert.deepEqual(result.skipped, [{ file: 'no-description', reason: 'BESCHREIBUNG_FEHLT' }]);
});
