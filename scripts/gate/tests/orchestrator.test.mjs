/**
 * orchestrator.test.mjs — der Orchestrator und der Turn-Vertrag.
 *
 * Zwei Ebenen, weil sie zwei verschiedene Fehler sehen:
 *
 *   1. FAKE-CTX: `route`/`provide`/`demand` gegen einen Stub. Hier wird die
 *      Hülle geprüft — benannter Befund statt stillem Fallback, Eigentum statt
 *      Doppelregistrierung, Mehrfach-Listener bleiben erlaubt.
 *   2. ECHTER BAUM: `turnContractIssues` gegen `packages/`, das aufgelöste
 *      Profil und die wirksame Config. Der Stub sieht NICHT, ob `hook` seine
 *      Teilnahme per Config ausschaltet oder ob die Profilreihenfolge den
 *      Wasserfall umdreht — deshalb stehen diese Fälle hier als Mutationen.
 *
 * Der Test ist in der schnellen Bahn (`test-lanes.json`), weil beide Ebenen
 * ohne Boot, ohne Modell und ohne Netz laufen.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  GATE_KINDS,
  REQUIRED_TURN_OWNERS,
  TURN_CHANNEL,
  TURN_CONTRACT,
  contractIssues,
  createOrchestrator,
  gateOpen,
  participationIssues,
  readPath,
  turnParticipants,
} from '../../../packages/seams/assets/orchestrator.js';
import { channelRegistrars, directRegistrationIssues, exclusiveIssues, profileOrderIssues, readTurnContract, turnContractIssues } from '../../lib/turn-contract.mjs';
import * as repo from '../../lib/repo.mjs';

const ROOT = repo.ROOT;

function fakeContext() {
  const listeners = new Map();
  const services = new Map();
  const injections = [];
  return {
    listeners,
    services,
    injections,
    on(channel, handler) {
      const list = listeners.get(channel) ?? [];
      list.push(handler);
      listeners.set(channel, list);
      return () => {
        listeners.set(channel, (listeners.get(channel) ?? []).filter((candidate) => candidate !== handler));
      };
    },
    provide(name, value) {
      if (services.has(name)) throw new Error(`service "${name}" already exists`);
      services.set(name, value);
      return () => services.delete(name);
    },
    inject(names, callback) {
      injections.push({ names, callback });
    },
  };
}

// ── 1. Die Hülle ────────────────────────────────────────────────────────────

test('route registriert über den Host-Bus und gibt dessen Disposer zurück', () => {
  const ctx = fakeContext();
  const orchestrator = createOrchestrator(ctx, { owner: 'hook' });
  let calls = 0;
  const dispose = orchestrator.route(TURN_CHANNEL, () => { calls += 1; }, { role: 'observer' });
  assert.equal(ctx.listeners.get(TURN_CHANNEL).length, 1);
  ctx.listeners.get(TURN_CHANNEL)[0]('payload', () => {});
  assert.equal(calls, 1);
  const snapshot = orchestrator.snapshot();
  assert.equal(snapshot.routes.length, 1);
  assert.equal(snapshot.routes[0].role, 'observer');
  dispose();
  assert.equal(ctx.listeners.get(TURN_CHANNEL).length, 0);
});

test('derselbe Eigentümer darf mehrfach auf denselben Kanal hören (Wasserfall bleibt Cordis)', () => {
  const ctx = fakeContext();
  const orchestrator = createOrchestrator(ctx, { owner: 'persona' });
  orchestrator.route(TURN_CHANNEL, () => {});
  orchestrator.route(TURN_CHANNEL, () => {});
  assert.equal(ctx.listeners.get(TURN_CHANNEL).length, 2);
  assert.equal(orchestrator.snapshot().findings.length, 0);
});

test('ein exklusiver Kanal weist einen fremden Eigentümer VOR der Registrierung ab', () => {
  const ctx = fakeContext();
  const contract = { exclusive: [{ channel: 'agent/status', owner: 'codingmon' }] };
  const foreign = createOrchestrator(ctx, { owner: 'task-router', contract });
  assert.throws(() => foreign.route('agent/status', () => {}), /codingmon/);
  assert.equal(ctx.listeners.size, 0);
  const owner = createOrchestrator(ctx, { owner: 'codingmon', contract });
  owner.route('agent/status', () => {});
  assert.equal(ctx.listeners.get('agent/status').length, 1);
});

test('fehlendes ctx.on ist ein benannter Befund (NO_BUS), kein stiller No-Op', () => {
  const findings = [];
  const orchestrator = createOrchestrator({}, { owner: 'narrative', report: (finding) => findings.push(finding) });
  const dispose = orchestrator.route('session/event', () => {});
  assert.equal(typeof dispose, 'function');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'NO_BUS');
  assert.equal(findings[0].owner, 'narrative');
  assert.match(findings[0].message, /NICHT registriert/);
  assert.equal(orchestrator.snapshot().routes.length, 0);
});

test('provide nennt den Dienst und wirft bei Doppelung innerhalb derselben Hälfte', () => {
  const ctx = fakeContext();
  const orchestrator = createOrchestrator(ctx, { owner: 'persona' });
  const release = orchestrator.provide('shinon_persona_state', { a: 1 });
  assert.equal(typeof release, 'function');
  assert.deepEqual(ctx.services.get('shinon_persona_state'), { a: 1 });
  assert.throws(() => orchestrator.provide('shinon_persona_state', {}), /zweimal/);
  release();
  assert.equal(ctx.services.has('shinon_persona_state'), false);
  const missing = createOrchestrator({}, { owner: 'persona' });
  assert.equal(missing.provide('shinon_persona_state', {}), null);
  assert.equal(missing.snapshot().findings[0].code, 'NO_PROVIDE');
});

test('demand fragt die Dienste als Liste an und meldet fehlendes inject', () => {
  const ctx = fakeContext();
  const orchestrator = createOrchestrator(ctx, { owner: 'markers' });
  const callback = () => {};
  assert.equal(orchestrator.demand(['shinon_index_store', 'shinon_scoring_ledger'], callback), true);
  assert.deepEqual(ctx.injections[0].names, ['shinon_index_store', 'shinon_scoring_ledger']);
  assert.equal(ctx.injections[0].callback, callback);
  const missing = createOrchestrator({}, { owner: 'markers' });
  assert.equal(missing.demand('shinon_index_store', callback), false);
  assert.equal(missing.snapshot().findings[0].code, 'NO_INJECT');
});

test('ohne Eigentümernamen gibt es keinen Orchestrator (fail-closed)', () => {
  assert.throws(() => createOrchestrator(fakeContext(), { owner: '  ' }), /owner/);
  assert.throws(() => createOrchestrator(fakeContext(), {}), /ohne owner/);
});

// ── 2. Der Vertragsleser ────────────────────────────────────────────────────

test('der echte Turn-Vertrag ist formal gültig', () => {
  const { contract, issues } = readTurnContract(ROOT);
  assert.deepEqual(issues, []);
  assert.deepEqual(contractIssues(contract), []);
  assert.equal(contract.contract, TURN_CONTRACT);
  assert.equal(contract.turn, TURN_CHANNEL);
});

test('die gemessene Reihenfolge ist gepinnt: persona, hook, prompter, task-router, popup optional', () => {
  const { contract } = readTurnContract(ROOT);
  assert.deepEqual(
    contract.order.map((entry) => entry.owner),
    ['persona', 'hook', 'prompter', 'task-router', 'popup'],
  );
  const required = contract.order.filter((entry) => entry.required === true).map((entry) => entry.owner);
  assert.deepEqual(required, REQUIRED_TURN_OWNERS);
  const popup = contract.order.find((entry) => entry.owner === 'popup');
  assert.deepEqual(popup.gate, { kind: 'equals', path: 'trigger', value: TURN_CHANNEL });
});

test('eine vertauschte Position widerspricht dem Profil, eine Lücke der Form', () => {
  const { contract } = readTurnContract(ROOT);
  const root = repo.readRoot();
  const profile = repo.resolveProfile(repo.activeProfile(root), repo.discover(root));
  const swapped = structuredClone(contract);
  [swapped.order[0].position, swapped.order[2].position] = [3, 1];
  assert.deepEqual(contractIssues(swapped), []);
  assert.ok(profileOrderIssues(swapped, profile.bundles, 'shinon').some((issue) => issue.includes('vor einer früheren Stufe')));

  const gap = structuredClone(contract);
  gap.order[4].position = 9;
  assert.ok(contractIssues(gap).some((issue) => issue.includes('keine lückenlose Folge')));
});

test('ein fehlender Pflicht-Teilnehmer, ein unbekanntes Gate und ein doppelter Kanal sind rot', () => {
  const { contract } = readTurnContract(ROOT);
  const missing = structuredClone(contract);
  missing.order = missing.order.filter((entry) => entry.owner !== 'hook');
  assert.ok(contractIssues(missing).some((issue) => issue.includes('Pflicht-Teilnehmer hook')));

  const unknown = structuredClone(contract);
  unknown.order[1].gate = { kind: 'sometimes', path: 'observeEvents', value: TURN_CHANNEL };
  assert.ok(contractIssues(unknown).some((issue) => issue.includes('gate.kind')));

  const duplicate = structuredClone(contract);
  duplicate.exclusive.push({ ...duplicate.exclusive[0] });
  assert.ok(contractIssues(duplicate).some((issue) => issue.includes('channel agent/status ist doppelt')));
});

test('gateOpen liest Pfade und ist bei unbekannter Art geschlossen', () => {
  assert.equal(gateOpen({ kind: 'always' }, {}), true);
  assert.equal(gateOpen({ kind: 'includes', path: 'observeEvents', value: TURN_CHANNEL }, { observeEvents: [TURN_CHANNEL] }), true);
  assert.equal(gateOpen({ kind: 'includes', path: 'observeEvents', value: TURN_CHANNEL }, { observeEvents: [] }), false);
  assert.equal(gateOpen({ kind: 'equals', path: 'trigger', value: TURN_CHANNEL }, { trigger: 'user/message' }), false);
  assert.equal(gateOpen({ kind: 'sometimes' }, {}), false);
  assert.equal(readPath({ a: { b: 1 } }, 'a.b'), 1);
  assert.equal(readPath({ a: null }, 'a.b'), undefined);
  assert.ok(GATE_KINDS.includes('includes'));
});

test('turnParticipants zeigt, wer nach seiner Config wirklich am Turn teilnimmt', () => {
  const { contract } = readTurnContract(ROOT);
  const participants = turnParticipants(contract, (owner) =>
    owner === 'hook' ? { observeEvents: [] } : owner === 'prompter' ? { observeEvents: [TURN_CHANNEL] } : {},
  );
  assert.equal(participants.find((entry) => entry.owner === 'hook').active, false);
  assert.equal(participants.find((entry) => entry.owner === 'prompter').active, true);
  assert.equal(participants.find((entry) => entry.owner === 'persona').active, true);
});

test('ein Pflicht-Teilnehmer, den die Config ausschaltet, ist ein Befund — der Stub sieht ihn nicht', () => {
  const { contract } = readTurnContract(ROOT);
  const closed = participationIssues(contract, (owner) => (owner === 'prompter' ? { observeEvents: ['agent/status'] } : undefined));
  assert.equal(closed.length, 1);
  assert.match(closed[0], /prompter/);
  // Nicht entschieden ist nicht geschlossen: die Vorgabe des Pakets gilt.
  assert.deepEqual(participationIssues(contract, () => undefined), []);
  const optional = participationIssues(contract, (owner) => (owner === 'popup' ? { trigger: 'user/message' } : undefined));
  assert.deepEqual(optional, []);
});

// ── 3. Der echte Baum ───────────────────────────────────────────────────────

test('turnContractIssues ist auf dem echten Baum leer (Profil, Eigentum, Quellen, Config)', () => {
  const root = repo.readRoot();
  const packages = repo.discover(root);
  assert.deepEqual(turnContractIssues({ root, packages, repo }), []);
});

test('Mutation: ein zweiter Registrar eines exklusiven Kanals wird namentlich rot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-orchestrator-'));
  for (const dirName of ['codingmon', 'task-router']) {
    const base = join(dir, 'packages', dirName);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, 'index.js'), "const off = ctx.on('agent/status', () => {});\n");
  }
  const packages = ['codingmon', 'task-router'].map((dirName) => ({ dir: dirName, base: join(dir, 'packages', dirName) }));
  const contract = { exclusive: [{ channel: 'agent/status', owner: 'codingmon' }] };

  assert.deepEqual(channelRegistrars(packages, 'agent/status'), ['codingmon', 'task-router']);
  const issues = exclusiveIssues(contract, packages);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /2 Paketen/);
  assert.match(issues[0], /task-router/);
});

test('Mutation: eine direkte Registrierung am Bus ist rot, ein Kommentar nicht', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-orchestrator-'));
  for (const [dirName, text] of [
    ['direct', "const off = ctx.on('agent/status', () => {});\n"],
    ['comment', "  // ctx.on('agent/status', () => {});\nconst x = 1;\n"],
  ]) {
    const base = join(dir, 'packages', dirName);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, 'index.js'), text);
  }
  const packages = ['direct', 'comment'].map((dirName) => ({ dir: dirName, base: join(dir, 'packages', dirName) }));
  const issues = directRegistrationIssues(packages);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /packages\/direct\/index\.js:1/);
  assert.match(issues[0], /Orchestrator/);
});

test('Mutation: ein Kommentar, der einen Kanal nennt, zählt nicht als Listener', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-orchestrator-'));
  const base = join(dir, 'packages', 'task-router');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'index.js'), "// Driver lauscht auf agent/status (idle = Quiescence)\nconst x = 1;\n");
  const packages = [{ dir: 'task-router', base }];
  assert.deepEqual(channelRegistrars(packages, 'agent/status'), []);
  assert.deepEqual(exclusiveIssues({ exclusive: [{ channel: 'agent/status', owner: 'codingmon' }] }, packages), [
    'turn-order.json: "agent/status" ist exklusiv, wird aber von 0 Paketen registriert (keinem)',
  ]);
});
