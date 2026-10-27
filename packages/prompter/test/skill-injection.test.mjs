#!/usr/bin/env node
/**
 * Der weiterhin öffentliche Skill-Renderer: reine Formatprüfung, kein Beleg
 * für eine produktive Injektion. Der Veredler injiziert keine Skill-Blöcke;
 * den Laufzeitpfad prüft scripts/gate/tests/prompter-contract.part4.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSkillsBlock } from '../index.js';

// ── 1. renderSkillsBlock ──────────────────────────────────────────────────────

test('renderSkillsBlock: leere Liste gibt null', () => {
  assert.equal(renderSkillsBlock([]), null);
  assert.equal(renderSkillsBlock(null), null);
  assert.equal(renderSkillsBlock(undefined), null);
});

test('renderSkillsBlock: ein Skill wird gerendert', () => {
  const skills = [{ name: 'test', description: 'Beschreibung' }];
  const block = renderSkillsBlock(skills);
  assert.ok(block.includes('<shinon_skills>'));
  assert.ok(block.includes('<skill name="test">Beschreibung</skill>'));
  assert.ok(block.includes('</shinon_skills>'));
});

test('renderSkillsBlock: mehrere Skills', () => {
  const skills = [
    { name: 'a', description: 'desc-a' },
    { name: 'b', description: 'desc-b' },
  ];
  const block = renderSkillsBlock(skills);
  assert.ok(block.includes('<skill name="a">desc-a</skill>'));
  assert.ok(block.includes('<skill name="b">desc-b</skill>'));
});

test('renderSkillsBlock: Spezialzeichen werden escaped', () => {
  const skills = [{ name: 'test<foo>', description: 'a & b < c > d' }];
  const block = renderSkillsBlock(skills);
  assert.ok(block.includes('test&lt;foo&gt;'));
  assert.ok(block.includes('a &amp; b &lt; c &gt; d'));
});

test('renderSkillsBlock: Skill ohne Name wird uebersprungen', () => {
  const skills = [
    { name: '', description: 'kein name' },
    { name: 'valid', description: 'gültig' },
  ];
  const block = renderSkillsBlock(skills);
  assert.ok(block.includes('valid'));
  assert.ok(!block.includes('kein name'));
});
