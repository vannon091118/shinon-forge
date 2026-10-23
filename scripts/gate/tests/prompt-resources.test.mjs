import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PROMPTS as PERSONA_PROMPTS, promptText as personaText } from '../../../packages/persona/assets/prompt-text.js';
import { PROMPTS as PROMPTER_PROMPTS, promptText as prompterText } from '../../../packages/prompter/assets/prompt-text.js';
import { Config as PROMPTER_CONFIG } from '../../../packages/prompter/assets/schema.js';
import { Config as INDEX_CONFIG } from '../../../packages/project-index/index.js';

/**
 * Die Prompt-Ressourcen und ihre Metadaten. Der Riegel prüft drei Dinge:
 * jeder Block zeigt auf einen existierenden Text, jeder Text ist eingefroren
 * (Hash-Fixture), und beide Renderer sind fail-closed — ein fehlender
 * Parameter oder ein unbekannter Platzhalter wird nie halb gerendert.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

const CATALOGS = {
  persona: { prompts: PERSONA_PROMPTS, render: personaText, file: 'packages/persona/assets/prompts.json' },
  prompter: { prompts: PROMPTER_PROMPTS, render: prompterText, file: 'packages/prompter/assets/prompts.json' },
};

test('beide Kataloge tragen den Vertrag und einen Eigentümer', () => {
  for (const [name, catalog] of Object.entries(CATALOGS)) {
    const doc = read(catalog.file);
    assert.equal(doc.contract, 'shinon.prompts/v1', name);
    assert.equal(doc.owner, `@shinon/${name}`, name);
    assert.equal(Object.keys(doc.texts).length, Object.keys(catalog.prompts).length, name);
  }
});

test('jeder Block zeigt auf existierende Texte, und kein Text ist leer', () => {
  const blocks = read('packages/prompter/assets/blocks.json').blocks;
  for (const block of blocks) {
    const ids = block.textId === undefined ? (block.textIds ?? []) : [block.textId];
    for (const id of ids) {
      const owner = id.startsWith('persona-') ? 'persona' : 'prompter';
      assert.ok(CATALOGS[owner].prompts[id], `${block.id}: ${id} fehlt in ${owner}`);
      assert.ok(CATALOGS[owner].prompts[id].text.length > 0, `${id} ist leer`);
    }
  }
  for (const [name, catalog] of Object.entries(CATALOGS)) {
    for (const [id, entry] of Object.entries(catalog.prompts)) {
      assert.ok(typeof entry.text === 'string' && entry.text.trim() !== '', `${name}:${id}`);
      assert.ok(['section', 'template', 'heading', 'rule', 'agent'].includes(entry.kind), `${name}:${id} kind=${entry.kind}`);
    }
  }
});

test('die Hash-Fixtures frieren jeden Text ein', () => {
  for (const [name, catalog] of Object.entries(CATALOGS)) {
    const fixture = readFileSync(join(ROOT, `packages/${name}/fixtures/prompts.sha256`), 'utf8');
    const frozen = new Map();
    for (const line of fixture.split('\n')) {
      if (line.trim() === '' || line.startsWith('#')) continue;
      const [id, hash] = line.split(' ');
      frozen.set(id, hash);
    }
    for (const [id, entry] of Object.entries(catalog.prompts)) {
      const hash = createHash('sha256').update(entry.text, 'utf8').digest('hex');
      assert.equal(frozen.get(id), hash, `${name}:${id} weicht vom Fixture ab — bewusst geändert? Dann Fixture nachziehen.`);
    }
    assert.equal(frozen.size, Object.keys(catalog.prompts).length, `${name}: Fixture deckt nicht alle Texte`);
  }
});

test('die Vorgabewerte stehen als Daten und die Schemas ziehen von dort', () => {
  const prompter = read('packages/prompter/assets/defaults.json');
  assert.equal(prompter.contract, 'shinon.prompter/defaults-v1');
  const prompterDefaults = PROMPTER_CONFIG({});
  assert.equal(prompterDefaults.maxTokens, prompter.llm.maxTokens);
  assert.equal(prompterDefaults.temperature, prompter.llm.temperature);
  assert.equal(prompterDefaults.timeoutMs, prompter.llm.timeoutMs);
  assert.equal(prompterDefaults.alwaysEnhance, prompter.llm.alwaysEnhance);
  assert.equal(prompterDefaults.indexBudgetTokens, prompter.context.indexBudgetTokens);
  assert.equal(prompterDefaults.notesPath, prompter.paths.notesDir);
  assert.equal(prompterDefaults.skillsPath, prompter.paths.skillsDir);
  assert.equal(prompterDefaults.blocksLearnedPath, prompter.paths.learnedBlocks);

  const index = read('packages/project-index/assets/defaults.json');
  assert.equal(index.contract, 'shinon.project-index/defaults-v1');
  const indexDefaults = INDEX_CONFIG({});
  assert.equal(indexDefaults.maxFileBytes, index.maxFileBytes);
  assert.equal(indexDefaults.chunkLines, index.chunkLines);
});

test('beide Renderer sind fail-closed und verhalten sich gleich', () => {
  for (const [name, catalog] of Object.entries(CATALOGS)) {
    const template = Object.entries(catalog.prompts).find(([, entry]) => entry.kind === 'template');
    assert.ok(template, `${name} braucht mindestens ein Template`);
    const [id, entry] = template;
    const key = /\{\{([a-zA-Z0-9_-]+)\}\}/.exec(entry.text)?.[1];
    assert.ok(key, `${name}:${id} ohne Platzhalter`);
    assert.throws(() => catalog.render(id), /PROMPT_PARAM_MISSING/, `${name}:${id}`);
    assert.ok(catalog.render(id, { [key]: 'WERT' }).includes('WERT'), `${name}:${id}`);
    assert.throws(() => catalog.render('gibt-es-nicht'), /PROMPT_UNKNOWN/, name);
  }
});
