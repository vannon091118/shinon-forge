/**
 * Ablagen des Lernens: atomar, fail-closed, gedeckelt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addSkillLoad,
  emptyUsage,
  hashFile,
  markSkill,
  readRegistry,
  readUsage,
  sha256,
  withLock,
  writeRegistry,
  writeUsage,
} from '../assets/learning-store.js';
import { emptyRegistry } from '../assets/learning-proposal.js';

const work = () => mkdtempSync(join(tmpdir(), 'shinon-learn-store-'));
const quiet = { warn: () => {}, log: () => {} };

test('Register: fehlt = leer, kaputt = leer mit Grund und unberuehrter Datei', () => {
  const dir = work();
  const path = join(dir, 'register.json');
  const fresh = readRegistry(path, { log: quiet });
  assert.equal(fresh.reason, null);
  assert.deepEqual(fresh.registry, emptyRegistry());

  writeFileSync(path, '{ kaputt');
  const broken = readRegistry(path, { log: quiet });
  assert.equal(broken.reason, 'KEIN_JSON');
  assert.equal(readFileSync(path, 'utf8'), '{ kaputt', 'die alte Datei wurde angefasst');

  writeRegistry(path, { ...emptyRegistry(), seq: 2 });
  assert.equal(readRegistry(path, { log: quiet }).registry.seq, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('Lock: frei, waehrend des Laufs gesperrt, danach wieder frei', () => {
  const dir = work();
  const lock = join(dir, 'x.lock');
  const nested = withLock(lock, () => withLock(lock, () => ({ ok: false })));
  assert.deepEqual(nested, { ok: false, reason: 'GESPERRT' });
  assert.equal(existsSync(lock), false, 'die Sperre bleibt liegen');
  assert.deepEqual(withLock(lock, () => ({ ok: true })), { ok: true });
  rmSync(dir, { recursive: true, force: true });
});

test('Nutzung: Load zaehlt, Sitzungen sind gehasht und dedupliziert, Grenze haelt', () => {
  let usage = emptyUsage();
  usage = addSkillLoad(usage, 'tempo', { session: 's1', now: '2026-10-24T10:00:00.000Z', maxEntries: 2 });
  usage = addSkillLoad(usage, 'tempo', { session: 's1', now: '2026-10-24T10:01:00.000Z', maxEntries: 2 });
  usage = addSkillLoad(usage, 'tempo', { session: 's2', now: '2026-10-24T10:02:00.000Z', maxEntries: 2 });
  assert.equal(usage.skills.tempo.loads, 3);
  assert.equal(usage.skills.tempo.sessions.length, 2);
  assert.equal(usage.skills.tempo.sessions.every((ref) => ref.startsWith('sess-')), true);
  usage = addSkillLoad(usage, 'zwei', { now: '2026-10-24T11:00:00.000Z', maxEntries: 2 });
  usage = addSkillLoad(usage, 'drei', { now: '2026-10-24T12:00:00.000Z', maxEntries: 2 });
  assert.equal(Object.keys(usage.skills).length, 2, 'die Grenze greift');
});

test('Nutzung: gepinnte Skills weichen nicht, Markierung bleibt erhalten', () => {
  let usage = emptyUsage();
  usage = markSkill(usage, 'handgeschrieben', { origin: 'manual', pinned: true });
  usage = addSkillLoad(usage, 'alt', { now: '2026-10-01T00:00:00.000Z', maxEntries: 1 });
  usage = addSkillLoad(usage, 'neu', { now: '2026-10-24T00:00:00.000Z', maxEntries: 1 });
  assert.equal(usage.skills.handgeschrieben.pinned, true);
  assert.equal(usage.skills.alt, undefined);
  assert.equal(usage.skills.neu.loads, 1);
});

test('Nutzung: fremder Vertrag wird nicht uebernommen', () => {
  const dir = work();
  const path = join(dir, 'usage.json');
  writeFileSync(path, JSON.stringify({ contract: 'fremd', version: 1, skills: {} }));
  const result = readUsage(path, { log: quiet });
  assert.equal(result.reason, 'VERTRAG_FREMD');
  assert.deepEqual(result.usage.skills, {});
  writeUsage(path, emptyUsage());
  assert.equal(readUsage(path, { log: quiet }).reason, null);
  rmSync(dir, { recursive: true, force: true });
});

test('Hash: Text und Datei, fehlende Datei ist null', () => {
  const dir = work();
  assert.equal(sha256('a'), sha256('a'));
  assert.notEqual(sha256('a'), sha256('b'));
  const file = join(dir, 'f.txt');
  assert.equal(hashFile(file), null);
  writeFileSync(file, 'inhalt');
  assert.equal(hashFile(file), sha256('inhalt'));
  rmSync(dir, { recursive: true, force: true });
});
