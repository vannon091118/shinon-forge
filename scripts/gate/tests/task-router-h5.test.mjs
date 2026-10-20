// Autonomie-Schritt: begrenzte Fortsetzung und die H5-Entscheidung.
//
// Zwei Zusagen, die zusammen gelten müssen:
//
// 1. Eine automatisch aktivierte Fortsetzung ist BEGRENZT. Die Rundengrenze wird
//    geprüft, bevor ein Goal entsteht: 0, -1, 2,5 oder "6" sind Befunde, ein Wert
//    über der Obergrenze ebenso — gekappt wird nichts, sonst behauptet der
//    Datensatz später eine andere Zahl als die, mit der DSH läuft.
// 2. Der Schalter im Profil folgt der Messlage. Solange H5 (Benchmark 4.6) nicht
//    gemessen ist, bleibt `activate` aus. Der Test liest BEIDE Dateien und
//    vergleicht sie, statt eine Zahl abzuschreiben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as router from '../../../packages/task-router/index.js';

const RECORD = { contract: 'shinon.prompter/result-v1', session_id: 'sess-1', intentClassification: 'MULTI_STEP_TASK', rawLength: 64 };

/** Ein Host, der jeden Aufruf mitschreibt. */
function fakeHost(current = null) {
  const calls = { get: 0, create: [] };
  return {
    calls,
    ctx: {
      get() {
        calls.get += 1;
        return {
          get: () => current,
          create: (agent, request) => {
            calls.create.push({ agent, request });
            return { id: 'goal-1', maxGoalRounds: request.maxGoalRounds, phase: 'active' };
          },
        };
      },
    },
  };
}

const step = () => ({ agent: { id: 'a-1' }, objective: 'den Wissensblock fertigstellen' });
const runtime = () => ({ pending: new Map([['sess-1', step()]]) });

test('runden: die Grenze wird geprüft, nicht gesendet', () => {
  assert.deepEqual(router.goalRoundsVerdict(6), { ok: true, rounds: 6, reason: '' });
  assert.equal(router.goalRoundsVerdict(router.MAX_GOAL_ROUNDS_CEILING).ok, true);
  assert.equal(router.goalRoundsVerdict(1).ok, true);

  for (const bad of [0, -1, 2.5, '6', null, undefined, NaN, Infinity]) {
    assert.deepEqual(router.goalRoundsVerdict(bad), { ok: false, rounds: 0, reason: 'ROUNDS_UNGUELTIG' }, String(bad));
  }
  assert.deepEqual(
    router.goalRoundsVerdict(router.MAX_GOAL_ROUNDS_CEILING + 1),
    { ok: false, rounds: router.MAX_GOAL_ROUNDS_CEILING + 1, reason: 'ROUNDS_ZU_HOCH' },
    'eine zu große Zahl wird genannt, nicht gekappt',
  );
  assert.equal(router.MAX_GOAL_ROUNDS_CEILING < 256, true, 'Shinons Grenze bleibt enger als DSHs 256');
});

test('aktivierung: eine unbrauchbare Grenze erzeugt kein Goal', () => {
  for (const [config, reason] of [
    [{ activate: true, maxGoalRounds: 0 }, 'ROUNDS_UNGUELTIG'],
    [{ activate: true, maxGoalRounds: -3 }, 'ROUNDS_UNGUELTIG'],
    [{ activate: true, maxGoalRounds: 2.5 }, 'ROUNDS_UNGUELTIG'],
    [{ activate: true, maxGoalRounds: router.MAX_GOAL_ROUNDS_CEILING + 1 }, 'ROUNDS_ZU_HOCH'],
  ]) {
    const host = fakeHost();
    const verdict = router.activateGoal(host.ctx, router.Config({ ...config, trace: false }), runtime(), RECORD);
    assert.equal(verdict.activated, false, JSON.stringify(config));
    assert.equal(verdict.reason, reason, JSON.stringify(config));
    assert.equal(host.calls.create.length, 0, 'kein create bei unbrauchbarer Grenze');
    assert.ok(router.ACTIVATION_REASONS.includes(reason), `${reason} ist ein benannter Grund`);
  }
});

test('aktivierung: mit gültiger Grenze reist genau diese Zahl mit', () => {
  const host = fakeHost();
  const verdict = router.activateGoal(host.ctx, router.Config({ activate: true, maxGoalRounds: 8, trace: false }), runtime(), RECORD);
  assert.equal(verdict.activated, true);
  assert.equal(verdict.reason, 'ACTIVATED');
  assert.equal(host.calls.create.length, 1);
  assert.equal(host.calls.create[0].request.maxGoalRounds, 8, 'keine stille Ersetzung durch den Default');
  assert.equal(verdict.maxGoalRounds, 8);
});

test('aktivierung: eine vorhandene Absicht bleibt unberührt, auch bei gültiger Grenze', () => {
  const host = fakeHost({ id: 'mensch-1', phase: 'paused' });
  const verdict = router.activateGoal(host.ctx, router.Config({ activate: true, maxGoalRounds: 6, trace: false }), runtime(), RECORD);
  assert.equal(verdict.activated, false);
  assert.equal(verdict.reason, 'GOAL_EXISTS:paused');
  assert.equal(host.calls.create.length, 0);
});

test('H5: der Profil-Schalter folgt der Messlage, nicht dem Wunsch', () => {
  const profile = readFileSync(new URL('../../../profiles/shinon/cordis.patch.yml', import.meta.url), 'utf8');
  const probe = JSON.parse(readFileSync(new URL('../../../docs/probes/h5-entscheidung.json', import.meta.url), 'utf8'));

  const switchedOn = /^\s*activate:\s*true\s*$/m.test(profile);
  const rounds = /^\s*maxGoalRounds:\s*(\d+)\s*$/m.exec(profile);

  assert.ok(rounds, 'das Profil nennt die Rundengrenze ausdrücklich');
  assert.equal(router.goalRoundsVerdict(Number(rounds[1])).ok, true, `Profilwert ${rounds[1]} liegt im erlaubten Band`);

  if (probe.verdict === 'NOT_MEASURED') {
    assert.equal(switchedOn, false, 'ohne H5-Messung bleibt die Aktivierung aus');
    assert.match(probe.why, /4\.6|H5/, 'die Probe nennt den Benchmark, der fehlt');
  } else {
    assert.equal(switchedOn, true, 'eine belegte H5-Messung muss auch eingeschaltet sein');
  }
});
