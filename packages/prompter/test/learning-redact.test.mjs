/**
 * Der Lernen-Kern: Redaktion und begrenztes Digest.
 *
 * Geprueft wird die GRENZE, nicht die Schoenheit: ein Geheimnis darf den
 * Puffer nicht erreichen, ein Werkzeug reist ohne Argumente, und der Ring
 * haelt Anzahl und Zeichen. Die Kanarienvoegel sind erfunden; ein echter Wert
 * steht in keiner Zusicherung.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REDACTED,
  addEntry,
  addTool,
  digestRefs,
  emptyBuffer,
  redactText,
  renderDigest,
  secretFindings,
} from '../assets/learning-redact.js';

const LIMITS = { maxEntries: 3, maxChars: 120, maxEntryChars: 40 };

test('Redaktion: Schluessel, Bearer, Zuweisung, Pfad, Mail und Unsichtbares', () => {
  const text = [
    'key sk-CANARY-1234567890abcdef',
    'ghp_CANARY012345678901234567890123456',
    'Bearer CANARY-BEARER-123456',
    'API_KEY=CANARY-VALUE-123456',
    '/home/canaryuser/projekt/docs',
    'canary@example.test',
    'nor\u200Bmal',
  ].join('\n');
  const safe = redactText(text);
  for (const value of ['sk-CANARY', 'ghp_CANARY', 'CANARY-BEARER', 'CANARY-VALUE', 'canaryuser', 'canary@example.test', '\u200B']) {
    assert.equal(safe.includes(value), false, `${value} steht noch im Text`);
  }
  assert.ok(safe.includes(REDACTED), 'kein Platzhalter gesetzt');
  assert.ok(safe.includes('API_KEY='), 'der NAME der Zuweisung muss lesbar bleiben');
  assert.ok(secretFindings(text).some((hit) => hit.id === 'assignment'), 'Zuweisung nicht erkannt');
});

test('Redaktion: Private-Key-Block verschwindet ganz', () => {
  const text = 'vor\n-----BEGIN RSA PRIVATE KEY-----\nCANARYBODY\n-----END RSA PRIVATE KEY-----\nnach';
  const safe = redactText(text);
  assert.equal(safe.includes('CANARYBODY'), false);
  assert.ok(safe.startsWith('vor'));
  assert.ok(safe.endsWith('nach'));
});

test('Digest: Werkzeuge reisen nur mit Name und Zahl, nie mit Argumenten', () => {
  let buffer = emptyBuffer();
  buffer = addTool(buffer, 'bash');
  buffer = addTool(buffer, 'bash');
  buffer = addTool(buffer, 'read');
  const { text, refs } = renderDigest(buffer);
  assert.equal(text.includes('aufrufe="2"'), true);
  assert.equal(text.includes('tool:bash'), true);
  assert.deepEqual(refs, ['tool:bash', 'tool:read']);
  assert.equal(text.includes('command'), false);
});

test('Digest: Ring haelt Anzahl und Zeichen, aeltester Eintrag faellt zuerst', () => {
  let buffer = emptyBuffer();
  for (let index = 1; index <= 6; index += 1) {
    buffer = addEntry(buffer, { kind: 'user', ref: `turn:${index}`, text: `Eintrag ${index}` }, LIMITS);
  }
  assert.ok(buffer.entries.length <= LIMITS.maxEntries);
  assert.ok(buffer.chars <= LIMITS.maxChars);
  assert.equal(buffer.entries.some((entry) => entry.ref === 'turn:1'), false, 'der aelteste Eintrag lebt noch');
  assert.equal(buffer.entries.at(-1).ref, 'turn:6');
});

test('Digest: Redaktion greift VOR dem Puffer, nicht erst beim Rendern', () => {
  let buffer = emptyBuffer();
  buffer = addEntry(buffer, { kind: 'user', ref: 'message:1', text: 'token=CANARY-SECRET-987654321' }, LIMITS);
  const stored = buffer.entries[0].text;
  assert.equal(stored.includes('CANARY-SECRET'), false);
  assert.equal(renderDigest(buffer).text.includes('CANARY-SECRET'), false);
});

test('Digest: leere und fremde Belege werden nicht aufgenommen', () => {
  const buffer = emptyBuffer();
  assert.equal(addEntry(buffer, { kind: 'system', ref: 'x', text: 'y' }).entries.length, 0);
  assert.equal(addEntry(buffer, { kind: 'user', ref: '', text: 'y' }).entries.length, 0);
  assert.equal(addEntry(buffer, { kind: 'user', ref: 'x', text: '   ' }).entries.length, 0);
  assert.deepEqual(digestRefs(buffer), []);
});
