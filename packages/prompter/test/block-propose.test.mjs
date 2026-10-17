#!/usr/bin/env node
/**
 * block-propose.test.mjs — die Agenten-Sequenz (Phase 4) als Weg.
 *
 * Vorschlag → Prüfung (zu spitz mit Datum/Sitzung/Absolutpfad, zu breit,
 * doppelt via geteilte Begriffe plus Themenmarke) → Aktivierung. Wie
 * `reviewNotes`, aber Ende-zu-Ende: Ablehnung lässt die Registry unberührt,
 * Annahme landet in der Projekt-Ablage, wirkt in der Auswahl und überdauert
 * den Neustart.
 * → Kanon: docs/COMMENT-KANON.md#k-7f580637ddfa
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Config, PROPOSE_CONTRACT, PROPOSE_SERVICE, apply, selectBlocks } from '../index.js';
import { mergeLearnedBlocks } from '../assets/block-review.js';
import REGISTRY from '../assets/blocks.json' with { type: 'json' };

for (const level of ['log', 'warn', 'error']) {
  console[level] = () => {};
}

const work = mkdtempSync(join(tmpdir(), 'shinon-propose-test-'));
process.on('exit', () => {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* Beiwerk */ }
});

function fakeHost() {
  const handlers = new Map();
  const services = new Map();
  const ctx = {
    on: (name, handler) => {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return () => {};
    },
    emit: () => {},
    provide: (name, value) => {
      services.set(name, value);
      return () => services.delete(name);
    },
    get: (name) => services.get(name),
  };
  return { ctx, services };
}

// Jeder Fall bekommt seine eigene Ablage — eine Annahme darf den Nachbarfall
// nicht über DOPPELT:bekannte-id verdecken (gemessen als Test-Leck über Fälle).
const mount = (tag) => {
  const overlay = join(work, `blocks-${tag}.learned.json`);
  const host = fakeHost();
  const dispose = apply(host.ctx, Config({
    mode: 'MIN',
    skillsPath: '',
    contextPath: '',
    intentPatternsPath: '',
    indexStoragePath: '',
    blocksLearnedPath: overlay,
  }));
  return { host, dispose, propose: host.services.get(PROPOSE_SERVICE), overlay };
};

const BLOCK = {
  id: 'persona-gate-ritual',
  quelle: 'persona',
  lage: 'system',
  modus: ['MID', 'MAX'],
  budgetTokens: 300,
  ausloeser: { haystack: ['gate', 'schranke', 'freigabe'] },
};
const proposal = (over = {}, blockOver = {}) => ({
  thema: 'gate-lauf',
  bei: 'wenn der gate lauf rot ist und freigabe fehlt',
  immer: 'gate lauf schranke pruefen ergebnis melden freigabe einholen',
  weil: 'wiederholung vermeiden erfahrung aus fehlgeschlagenen laeufen',
  beleg: 'beobachtet an drei abgebrochenen laeufen ohne freigabe',
  block: { ...BLOCK, ...blockOver },
  ...over,
});

test('sequenz: schmaler Dienst, geprüfter Vertrag', () => {
  const { dispose, propose } = mount('dienst');
  try {
    assert.deepEqual(Object.keys(propose).sort(), ['contract', 'propose']);
    assert.equal(propose.contract, PROPOSE_CONTRACT);
  } finally { dispose(); }
});

test('sequenz: Annahme landet in Ablage, Auswahl und Neustart', () => {
  const overlay = join(work, 'blocks-annahme.learned.json');
  const first = mount('annahme');
  try {
    const answer = first.propose.propose(proposal());
    assert.deepEqual(answer, { ok: true, findings: [], block: 'persona-gate-ritual' });
    assert.ok(existsSync(overlay), 'Aktivierung schreibt die Ablage');
    const learned = JSON.parse(readFileSync(overlay, 'utf8'));
    assert.ok(learned.blocks.some((entry) => entry.id === 'persona-gate-ritual'));

    // Die Auswahl sieht den gelernten Baustein auf seinem Haystack.
    const merged = mergeLearnedBlocks(REGISTRY.blocks, learned.blocks);
    const selection = selectBlocks(
      { contract: REGISTRY.contract, blocks: merged },
      { mode: 'MAX', promptText: 'gate schranke freigabe', context: null, available: {} },
    );
    assert.ok(selection.selected.some((entry) => entry.id === 'persona-gate-ritual'), 'gelernt heißt wählbar');
  } finally { first.dispose(); }

  // Neustart: dieselbe Ablage, neuer Mount — der Baustein ist wieder da und
  // schützt sich selbst (Duplikat gegen Gelerntes, bekannte id).
  const second = (() => {
    const host = fakeHost();
    const dispose = apply(host.ctx, Config({
      mode: 'MIN',
      skillsPath: '',
      contextPath: '',
      intentPatternsPath: '',
      indexStoragePath: '',
      blocksLearnedPath: overlay,
    }));
    return { host, dispose, propose: host.services.get(PROPOSE_SERVICE) };
  })();
  try {
    const again = second.propose.propose(proposal());
    assert.equal(again.ok, false, 'der eigene Erfolg wird kein zweiter');
    assert.ok(again.findings.some((finding) => finding.startsWith('DOPPELT:bekannte-id')));
    const themed = second.propose.propose(proposal({
      thema: 'gate',
      immer: 'gate schranke freigabe beachten',
      block: { ...BLOCK, id: 'persona-gate-zweit' },
    }));
    assert.equal(themed.ok, false, 'gleiche Marke plus geteilte Begriffe');
    assert.ok(themed.findings.some((finding) => finding.startsWith('doppelt:')));
  } finally { second.dispose(); }
});

test('sequenz: zu spitz fällt durch — Datum, Sitzung, Absolutpfad', () => {
  const { dispose, propose } = mount('spitz');
  try {
    for (const [name, bei] of [
      ['datum', 'seit 2026-10-17 gilt diese gate regel'],
      ['sitzung', 'seit session-abc123 gilt diese gate regel'],
      ['heimatpfad', 'unter /home/vannon/projekt gilt diese gate regel'],
    ]) {
      const answer = propose.propose(proposal({ bei }));
      assert.equal(answer.ok, false, `${name} wird angenommen`);
      assert.ok(answer.findings.some((finding) => finding.includes('zu spitz')), `${name}: ${answer.findings.join('; ')}`);
    }
  } finally { dispose(); }
});

test('sequenz: zu breit, kaputt und ohne Form fallen durch', () => {
  const { dispose, propose, overlay } = mount('breit');
  try {
    const broad = propose.propose(proposal({ immer: 'ok mach mal' }));
    assert.equal(broad.ok, false);
    assert.ok(broad.findings.some((finding) => finding.includes('zu breit')), broad.findings.join(';'));

    const broken = propose.propose({ thema: 'gate-lauf' });
    assert.equal(broken.ok, false, 'halber Vorschlag wird angenommen');

    const badBlock = propose.propose(proposal({ block: { ...BLOCK, id: '', budgetTokens: 99999 } }));
    assert.equal(badBlock.ok, false, 'formloser Block wird angenommen');
  } finally { dispose(); }
  assert.ok(!existsSync(overlay) || !JSON.parse(readFileSync(overlay, 'utf8')).blocks.some((entry) => entry.id === ''), 'Ablehnung schreibt nichts');
});
