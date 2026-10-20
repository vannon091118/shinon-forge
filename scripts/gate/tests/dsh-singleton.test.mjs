#!/usr/bin/env node
/**
 * scripts/gate/tests/dsh-singleton.test.mjs — eine Modul-Instanz je dsh-Paket.
 *
 * Warum diese Datei existiert: `dsh-agent-loop` holt den Tool-Scheduler über
 * `ctx.tools[TOOL_RUNTIME_SCHEDULER]`, ein Symbol aus `@deepseek-ai/dsh-tools`.
 * Mit zwei Kopien ist das Symbol ein anderes, der Scheduler `undefined`, und jeder
 * Tool-Call stirbt mit `reading 'prepare'` (gemessen 2026-10-18). Der Test hält
 * beide Richtungen fest: Dublette wird gefunden, Einzelkopie nicht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as repo from '../../lib/repo.mjs';

/** Ein Baum mit `@deepseek-ai/<name>`-Ordnern, optional verschachtelt. */
function tree(dirs) {
  const base = mkdtempSync(join(tmpdir(), 'shinon-dsh-singleton-'));
  for (const dir of dirs) mkdirSync(join(base, 'node_modules', dir), { recursive: true });
  return base;
}

test('eine Kopie je Paket ist grün', () => {
  const base = tree(['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent-loop']);
  try {
    const result = repo.dshInstanceIssues(base);
    assert.deepEqual(result.issues, []);
    assert.equal(result.status, 'pass');
    assert.match(result.detail, /2 @deepseek-ai-Pakete/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('eine verschachtelte zweite Kopie ist ein Befund mit beiden Pfaden', () => {
  const base = tree([
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-base/node_modules/@deepseek-ai/dsh-tools',
  ]);
  try {
    const result = repo.dshInstanceIssues(base);
    assert.equal(result.status, 'fail');
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /@deepseek-ai\/dsh-tools liegt 2×/);
    assert.match(result.issues[0], /node_modules\/@deepseek-ai\/dsh-tools/);
    assert.match(result.issues[0], /dsh-base\/node_modules\/@deepseek-ai\/dsh-tools/);
    assert.match(result.issues[0], /npm dedupe/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('ohne node_modules ist der Befund nicht anwendbar, nicht rot', () => {
  const base = mkdtempSync(join(tmpdir(), 'shinon-dsh-singleton-'));
  try {
    const result = repo.dshInstanceIssues(base);
    assert.deepEqual(result.issues, []);
    assert.equal(result.status, 'not-applicable');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('Links zählen nicht als Kopie', () => {
  const base = tree(['@deepseek-ai/dsh-tools']);
  const link = join(base, 'node_modules', '@deepseek-ai', 'dsh-agent-loop');
  try {
    symlinkSync(join(base, 'node_modules', '@deepseek-ai', 'dsh-tools'), link, 'dir');
    const result = repo.dshInstanceIssues(base);
    assert.deepEqual(result.issues, []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
