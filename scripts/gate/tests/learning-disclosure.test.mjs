#!/usr/bin/env node
/**
 * learning-disclosure.test.mjs — Gelerntes wird wiederverwendet, aber nicht
 * ausgeschuettet (SH-LEARN-05).
 *
 * Drei Stufen, drei Nachweise, alle am Quelltext bzw. an der Profildatei:
 *
 *   1. FORMAT: der öffentliche Skill-Renderer verarbeitet Name und Beschreibung,
 *      nicht den Rumpf. Das belegt keine Injektion im Veredler.
 *   2. PROZEDUR: der Rumpf kommt auf Abruf (`tool-skill` im Profil), nicht
 *      vorab; dieselbe Datei ist die Quelle, die DSH nativ entdeckt.
 *   3. ARCHIV: die Sitzungssuche (`dsh-experimental-session-search`) ist im
 *      Profil aktiviert — gezielte Suche im episodischen Archiv statt Kopie.
 *
 * Dazu die Abnahme von SH-LEARN-05: eine GELERNTE Korrektur veraendert
 * nachweisbar den naechsten passenden Prompt — und nur dort (der fremde
 * Workspace sieht die Auflage nicht).
 *
 * Der Test braucht weder DSH noch Modell noch `node_modules`; er liest die
 * Profildateien und faehrt die reinen Kerne. Den Boot des neuen Bundles belegt
 * `node scripts/shinon-profile-test.mjs` (27 Layer, gemessen).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSkillsBlock } from '../../../packages/prompter/assets/render-context.js';
import { MEMORY_PROPOSAL_CONTRACT, emptyMemory, renderCommitments } from '../../../packages/persona/assets/memory-core.js';
import { proposeMemory } from '../../../packages/persona/assets/memory-proposals.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROFILE_PACKAGE = JSON.parse(readFileSync(join(ROOT, 'profiles/shinon/package.json'), 'utf8'));
const PROFILE_PATCH = readFileSync(join(ROOT, 'profiles/shinon/cordis.patch.yml'), 'utf8');
const BUNDLES = PROFILE_PACKAGE?.dsh?.profile?.bundles ?? [];

/** So viele Skills, wie ein gewachsenes Projekt traegt — die Deckelprobe. */
const MANY = Array.from({ length: 60 }, (_, index) => ({
  name: `gelernt-${String(index).padStart(2, '0')}`,
  description: `Nutzen wenn Aufgabe ${index} ansteht, damit der Ablauf aus dem Projekt gilt und nicht neu erfunden wird.`,
}));

test('stufe 1: der Renderer verarbeitet Name und Beschreibung, nie den Rumpf', () => {
  const block = renderSkillsBlock([{ name: 'gedaechtnis', description: 'Nutzen wenn ein Ablauf wiederkehrt.' }]);
  assert.match(block, /^<shinon_skills>/);
  assert.match(block, /<skill name="gedaechtnis">Nutzen wenn ein Ablauf wiederkehrt\.<\/skill>/);
  // Ein Skill-RUMPF ist ein Dokument; er darf hier nicht hineinrutschen. Der
  // Renderer kennt nur die beiden Felder — ein drittes Feld bleibt draussen.
  const withBody = renderSkillsBlock([{ name: 'gedaechtnis', description: 'kurz', body: '# Schritt 1\nSchritt 2 laeuft lang' }]);
  assert.equal(withBody.includes('Schritt 1'), false, 'der Rumpf steht im Prompt');
  assert.equal(withBody.split('\n').length, 3, 'je Skill genau eine Zeile');
});

test('stufe 1: die Ausgabe des Renderers bleibt fuer die Stichprobe begrenzt', () => {
  const block = renderSkillsBlock(MANY);
  assert.ok(typeof block === 'string' && block.length > 0);
  const lines = block.split('\n');
  assert.equal(lines.length, MANY.length + 2, 'zwei Marken, eine Zeile je Skill');
  assert.ok(block.length < 12000, `Uebersicht zu gross: ${block.length} Zeichen`);
  assert.equal(block.includes('\n\n'), false, 'keine Leerzeilen, die wie ein Abschnitt wirken');
});

test('stufe 2: der Rumpf kommt auf Abruf — das Skill-Werkzeug steht im Profil', () => {
  // Die prozedurale Stufe ist eine Faehigkeit, keine Vorab-Injektion: DSH
  // liefert `tool-skill`, das den Skill erst beim Aufruf laedt.
  assert.match(PROFILE_PATCH, /id: tool-skill[\s\S]{0,80}name: '@deepseek-ai\/dsh-tool-skill'/);
  assert.match(PROFILE_PATCH, /id: skill-filesystem[\s\S]{0,80}name: '@deepseek-ai\/dsh-skill-filesystem'/);
});

test('stufe 3: die Sitzungssuche ist aktiviert — gezielte Suche statt Kopie des Archivs', () => {
  assert.equal(BUNDLES.includes('@deepseek-ai/dsh-experimental-session-search'), true, 'das Bundle fehlt in dsh.profile.bundles');
  // Der Reviewer-Zustand traegt Kennungen, keine Gespraechstexte: die
  // Wissens-Registry nennt das Archiv als Eigentuemer des Verlaufs.
  const kinds = JSON.parse(readFileSync(join(ROOT, 'docs/contracts/knowledge-kinds.json'), 'utf8'));
  const archive = kinds.kinds.find((kind) => kind.id === 'episodic-archive');
  assert.ok(archive !== undefined);
  assert.match(archive.store, /sessions/);
  assert.equal(archive.copyRule, 'none');
});

test('abnahme: eine gelernte Korrektur veraendert den naechsten passenden Prompt', () => {
  const learning = proposeMemory(emptyMemory(), {
    contract: MEMORY_PROPOSAL_CONTRACT,
    id: 'lp_disclosure',
    subject: 'test-tempo',
    claim: 'Bei einem Test ueber der Zeitgrenze den Test verkleinern, nicht die Grenze heben.',
    reason: 'Die Grenze schuetzt den Lauf.',
    sources: ['message:m2'],
    scope: '/projekt/a',
    decision: 'accepted',
  }, '2026-10-24T10:00:00.000Z');
  assert.equal(learning.ok, true, learning.reason);

  const matching = renderCommitments(learning.memory, '/projekt/a');
  assert.ok(typeof matching === 'string');
  assert.match(matching, /den Test verkleinern/);
  // Die Wirkung ist die AUSSAGE im Prompt, nicht ein neuer Zustand daneben.
  assert.equal(renderCommitments(learning.memory, '/projekt/b'), null, 'ein fremdes Projekt erbt die Auflage');
  assert.equal(renderCommitments(emptyMemory(), '/projekt/a'), null, 'ohne Lernen bleibt der Abschnitt leer');
});
