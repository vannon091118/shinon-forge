/**
 * Gate: die sechs Host↔Host-Nähte haben EINE Definition.
 *
 * Was hier geprüft wird, und warum es ohne den Umbau rot wäre:
 *
 *   1. IDENTITÄT, nicht Gleichheit. `hook.digest === seams.digest` gilt nur,
 *      wenn `@shinon/hook` den Kern importiert — eine bytegleiche Kopie wäre
 *      gleich, aber nicht dasselbe Objekt. Genau dieser Unterschied ist der
 *      Umbau: vorher hielt `SOURCE_TWINS` zwei Funktionen zusammen, jetzt gibt
 *      es eine.
 *   2. Die `SOURCE_TWINS`-Liste führt nur noch Client-Spiegel (Stufe 2).
 *   3. Der Gate-Schritt `hostMirrorIssues` ist grün — und wird rot, sobald eine
 *      Host-Hälfte die Regel wieder selbst definiert (Mutationsprobe auf einem
 *      Miniatur-Baum, ohne den echten Baum anzufassen).
 *   4. Der Kern bleibt importfrei: nur `node:`-Module. Das ist die Eigenschaft,
 *      die den Paket-Tests in CI ohne `npm ci` zugutekommt — und der Grund, warum
 *      ein Import über die Paketgrenze hier überhaupt zulässig ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as repo from '../../lib/repo.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const load = (rel) => import(new URL(`../../../${rel}`, import.meta.url).href);

const seams = await load('packages/seams/index.js');
const core = await load('packages/seams/assets/seams.js');
const events = await load('packages/events/index.js');
const hook = await load('packages/hook/index.js');
const prompter = await load('packages/prompter/index.js');
const prompterWs = await load('packages/prompter/assets/workspace.js');
const indexWs = await load('packages/project-index/assets/workspace.js');
const modeCore = await load('packages/prompter/assets/mode-core.js');
const taskRouter = await load('packages/task-router/index.js');
const narrative = await load('packages/narrative/index.js');
const persona = await load('packages/persona/index.js');
const scoring = await load('packages/scoring/index.js');

test('die sechs Nähte sind EIN Objekt, nicht zwei gleiche', () => {
  // 1 · Digest (events ↔ hook)
  assert.equal(events.digest, core.digest, 'events.digest ist der Kern');
  assert.equal(events.digest('abc', 4), 'ba78');
  // Der Hook exportiert den Digest nicht — seine Zusage ist der Umschlag: die
  // ids müssen genau das sein, was der Kern aus denselben Feldern rechnet.
  const step = { session_id: 's1', turn: 2, step: 3, message_count: 7 };
  const clock = '2026-10-20T00:00:00.000Z';
  const envelope = hook.buildStepEnvelope(step, { clock });
  const payloadRef = `pl-${core.digest([step.message_count, step.turn, step.step].join('|'), 12)}`;
  assert.equal(envelope.payload_ref, payloadRef);
  assert.equal(
    envelope.event_id,
    `evt-${core.digest([hook.CONTRACT, hook.TRACE_EVENT_TYPE, step.session_id, clock, payloadRef].join('|'), 12)}`,
  );

  // 2 · Workspace-Identität (prompter ↔ project-index)
  for (const name of ['resolveWorkspaceRoot', 'fingerprintRoot', 'resolveInRoot', 'checkRealpathInside', 'reconcileEntries', 'toWorkspacePath', 'isInsideRoot']) {
    assert.equal(prompterWs[name], core[name], `prompter/assets/workspace.js: ${name}`);
    assert.equal(indexWs[name], core[name], `project-index/assets/workspace.js: ${name}`);
  }
  assert.equal(prompterWs.WORKSPACE_CONTRACT, core.WORKSPACE_CONTRACT);
  assert.equal(indexWs.WORKSPACE_ENV, core.WORKSPACE_ENV);

  // 3 · Letzte menschliche Nachricht (prompter ↔ task-router)
  const payload = {
    messages: [
      { role: 'user', source: { kind: 'harness' }, content: [{ type: 'text', text: 'Kontext' }] },
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '  Mach das.  ' }] },
    ],
  };
  assert.deepEqual(prompter.readPrompt(payload), core.lastHumanMessage(payload.messages));
  assert.equal(taskRouter.readObjective(payload.messages), 'Mach das.');
  assert.equal(core.lastHumanMessage([{ role: 'user', source: { kind: 'harness' }, content: [{ type: 'text', text: 'x' }] }]), null);

  // 4/5 · Narrative-Kanal und -Vertrag (narrative → persona, narrative → prompter)
  assert.equal(narrative.STATE_CHANNEL, core.NARRATIVE_STATE_CHANNEL);
  assert.equal(narrative.STATE_CONTRACT, core.NARRATIVE_STATE_CONTRACT);
  assert.equal(persona.NARRATIVE_CHANNEL, core.NARRATIVE_STATE_CHANNEL);
  assert.equal(persona.NARRATIVE_CONTRACT, core.NARRATIVE_STATE_CONTRACT);

  // 6 · Entscheidungskanal des Veredlers (prompter → persona) — samt den zwei
  // weiteren Abnehmern, die nie in `SOURCE_TWINS` standen.
  assert.equal(modeCore.DECISION_CHANNEL, core.PROMPTER_DECISION_CHANNEL);
  assert.equal(prompter.DECISION_CHANNEL, core.PROMPTER_DECISION_CHANNEL);
  assert.equal(persona.PROMPTER_DECISION_CHANNEL, core.PROMPTER_DECISION_CHANNEL);
  assert.equal(scoring.BLOCKS_DECISION_CHANNEL, core.PROMPTER_DECISION_CHANNEL);
  assert.equal(taskRouter.SOURCE_CHANNEL, core.PROMPTER_DECISION_CHANNEL);
});

test('der Kern bleibt importfrei — nur node:-Module', () => {
  const source = read(repo.SEAM_CORE);
  const bare = [...source.matchAll(/^import\s[^;]*from\s+'([^']+)'/gm)].map((hit) => hit[1]).filter((spec) => !spec.startsWith('node:'));
  assert.deepEqual(bare, [], 'der Kern darf nur node:-Module importieren');

  // Und die Abnehmer importieren ihn über die Paketgrenze — nicht per Pfad.
  for (const rel of [
    'packages/events/index.js',
    'packages/hook/index.js',
    'packages/prompter/index.js',
    'packages/prompter/assets/workspace.js',
    'packages/prompter/assets/mode-core.js',
    'packages/project-index/assets/workspace.js',
    'packages/task-router/index.js',
    'packages/narrative/index.js',
    'packages/persona/index.js',
    'packages/scoring/index.js',
  ]) {
    assert.match(read(rel), /from '@shinon\/seams(\/core)?'/, `${rel} importiert den Kern`);
  }
});

test('SOURCE_TWINS hält nur noch Client-Spiegel', () => {
  assert.equal(repo.SOURCE_TWINS.length, 10, 'zehn Client-Kopien (Stufe 2)');
  for (const twin of repo.SOURCE_TWINS) {
    assert.ok(twin.mirror.endsWith('client.js'), `${twin.rule}: Spiegel ist eine Client-Hälfte (${twin.mirror})`);
  }
  assert.deepEqual(repo.twinIssues(), []);
});

test('der Gate-Schritt meldet keinen Host-Spiegel', () => {
  assert.deepEqual(repo.hostMirrorIssues(), []);
});

test('eine zurückkehrende Host-Kopie wird rot — Funktion, Literal, Region', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-seams-'));
  try {
    mkdirSync(join(root, 'packages/seams/assets'), { recursive: true });
    mkdirSync(join(root, 'packages/hook'), { recursive: true });
    mkdirSync(join(root, 'packages/persona'), { recursive: true });
    mkdirSync(join(root, 'packages/fremd'), { recursive: true });
    writeFileSync(join(root, repo.SEAM_INVENTORY), read(repo.SEAM_INVENTORY));
    writeFileSync(join(root, repo.SEAM_CORE), 'export function digest() {}\n');

    // Die Kopie, die der Umbau beseitigt hat: dieselbe Funktion, zweite Datei.
    writeFileSync(join(root, 'packages/hook/index.js'), 'function digest(text, length) {\n  return text.slice(0, length);\n}\nexport { digest };\n');
    // Und ein Literal, das wieder als eigener Name dasteht.
    writeFileSync(join(root, 'packages/persona/index.js'), "export const KANAL = 'shinon/prompter/decision';\n");
    // Und eine Region, die im Host nichts zu suchen hat.
    writeFileSync(join(root, 'packages/fremd/index.js'), '// #region zwilling:sha256-digest\nalt\n// #endregion zwilling:sha256-digest\n');

    const issues = repo.hostMirrorIssues(root);
    assert.ok(issues.some((issue) => issue.includes('packages/hook/index.js') && issue.includes('digest()')), `Funktion: ${issues.join(' | ')}`);
    assert.ok(issues.some((issue) => issue.includes('packages/persona/index.js') && issue.includes('PROMPTER_DECISION_CHANNEL')), `Literal: ${issues.join(' | ')}`);
    assert.ok(issues.some((issue) => issue.includes('packages/fremd/index.js') && issue.includes('zwilling-Region')), `Region: ${issues.join(' | ')}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
