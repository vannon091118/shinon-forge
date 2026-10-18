/**
 * agents-home.test.mjs — geteilte Anweisungsdatei ueber DSH_AGENTS_HOME.
 *
 * DSH kennt seit rc.2 ein eigenes Agent-Home fuer die gemeinsame AGENTS.md.
 * Der Memory-Sync des Forks schrieb bisher hart nach `~/.agents`; wer
 * DSH_AGENTS_HOME setzt, haette zwei Orte fuer dieselbe Datei gepflegt. Der
 * Default bleibt `~/.agents` — nichts wird verschoben, nur gelesen.
 * → Kanon: docs/COMMENT-KANON.md#k-agents-home
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { agentsHome, agentsInstructionFile } from '../../../packages/shinon-forge/index.js';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const source = readFileSync(join(REPO, 'packages/shinon-forge/index.js'), 'utf8');

test('agentsHome: ohne Variable bleibt es bei ~/.agents', () => {
  assert.equal(agentsHome({}), join(homedir(), '.agents'));
  assert.equal(agentsHome({ DSH_AGENTS_HOME: '' }), join(homedir(), '.agents'));
});

test('agentsHome: DSH_AGENTS_HOME gewinnt und wird absolut aufgeloest', () => {
  assert.equal(agentsHome({ DSH_AGENTS_HOME: '/srv/agents' }), '/srv/agents');
  assert.equal(agentsInstructionFile({ DSH_AGENTS_HOME: '/srv/agents' }), join('/srv/agents', 'AGENTS.md'));
});

test('agentsHome: ein relativer Pfad wird abgelehnt, nicht geraten', () => {
  assert.throws(() => agentsHome({ DSH_AGENTS_HOME: 'relativ/agents' }), /absoluter Pfad/);
});

test('der Memory-Sync liest die Datei ueber das Agent-Home, nicht ueber einen zweiten Pfad', () => {
  assert.ok(source.includes('agentsInstructionFile()'), 'die Anweisungsdatei kommt nicht aus dem Helper');
  assert.equal(
    /join\(homedir\(\), ['"`]\.agents\//.test(source),
    false,
    'ein hart verdrahteter ~/.agents-Pfad umgeht DSH_AGENTS_HOME',
  );
});
