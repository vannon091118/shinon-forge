// Extraktion und Invalidierung (Wissens-Runtime, Zug 2).
//
// Der Test prüft zuerst die Extraktoren (deterministisch, quellenspezifisch,
// mit lauten Grenzen), dann die Kaskade über die Umkehrkanten und zuletzt die
// beiden Mutationen, die zählen: eine behauptete Gültigkeit ohne gleichen
// Inhalt, und eine Invalidierung, die einen unabhängigen Fakt mitreißt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MAX_VALUE_CHARS, extractFacts, extractionHash } from '../assets/facts-extract.js';
import { findCycle, mayRevalidate, reverseEdges, staleClosure } from '../assets/facts-invalidate.js';
import {
  FACTS_FILE_NAME,
  addDependency,
  applySourceChange,
  closeFacts,
  getFact,
  insertFact,
  openFacts,
  transitionFact,
} from '../assets/facts-store.js';

const CONTRACT = JSON.stringify({
  name: 'Beispiel',
  status: 'IMPLEMENTED',
  rules: [{ positive: 'Ein Satz.', forbidden: 'x', fallback: 'y', error: 'z', trace: 't', replay: 'r', invariant: 'i' }],
});

function source(overrides = {}) {
  return { path: 'docs/contracts/beispiel.json', rev: 'dev:1:2:3:4', kind: 'contract', content: CONTRACT, ...overrides };
}

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-facts2-'));
  return { dir, db: openFacts(join(dir, FACTS_FILE_NAME)), close: () => rmSync(dir, { recursive: true, force: true }) };
}

function validFact(store, fact, at) {
  const { id } = insertFact(store, fact, at);
  for (const status of ['EXTRACTED', 'VALIDATING', 'VALID']) transitionFact(store, id, status, 'validator', at);
  return id;
}

test('extraktion: Vertrag wird zu Fakten, gleiche Quelle ergibt denselben Hash', () => {
  const first = extractFacts(source());
  assert.equal(first.ok, true);
  assert.deepEqual(first.error, undefined);
  assert.equal(first.facts.length, 2, 'Status plus eine Regel');
  assert.equal(first.facts[0].subject, 'vertrag');
  assert.equal(first.facts[0].value, 'IMPLEMENTED');
  assert.equal(first.facts[1].subject, 'regel-1');
  assert.equal(first.facts[1].kind, 'DERIVED');

  const again = extractFacts(source());
  assert.deepEqual(again.facts, first.facts);
  assert.equal(extractionHash(again.facts), extractionHash(first.facts));

  const changed = extractFacts(source({ content: CONTRACT.replace('Ein Satz.', 'Ein anderer Satz.') }));
  assert.notEqual(extractionHash(changed.facts), extractionHash(first.facts));
});

test('extraktion: unbekannte und kaputte Quellen sind Befunde, kein stiller Erfolg', () => {
  assert.equal(extractFacts(source({ kind: 'prosa' })).error, 'QUELLE_UNBEKANNT');
  assert.equal(extractFacts(source({ rev: '' })).error, 'QUELLE_OHNE_REVISION');
  assert.equal(extractFacts(source({ path: ' ' })).error, 'QUELLE_OHNE_PFAD');
  assert.equal(extractFacts(source({ content: '{kaputt' })).error, 'QUELLE_UNLESBAR');
  assert.equal(extractFacts(source({ content: '{"status":"X"}' })).error, 'QUELLE_OHNE_REGELN');
  assert.equal(extractFacts(null).error, 'QUELLE_FEHLT');
});

test('extraktion: Grenzen sind laut, nicht still — zu lang wird verworfen, nicht gekürzt', () => {
  const long = 'x'.repeat(MAX_VALUE_CHARS + 1);
  const result = extractFacts(source({ content: JSON.stringify({ status: long, rules: [{ positive: 'ok' }] }) }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.facts.map((f) => f.subject), ['regel-1'], 'der zu lange Status fehlt');
  assert.deepEqual(result.dropped, [{ index: 0, reason: 'WERT_ZU_LANG' }]);
  assert.equal(result.facts.some((f) => f.value.length > MAX_VALUE_CHARS), false);
});

test('extraktion: Commit nennt Trailer und verbotene Fußzeile, sonst nichts', () => {
  const message = 'Betreff\n\nText mit Prosa.\n\ncreated by VANNON — Trailer\nco-authored-by: jemand\n';
  const result = extractFacts({ path: 'git:commit', rev: 'abc', kind: 'commit', content: message });
  assert.deepEqual(result.facts.map((f) => f.predicate), ['trailer', 'verbotene-fusszeile']);
  assert.match(result.facts[0].value, /^created by VANNON/);
  assert.match(result.facts[1].value, /co-authored-by/);
  const clean = extractFacts({ path: 'git:commit', rev: 'abc', kind: 'commit', content: 'Nur Prosa.' });
  assert.deepEqual(clean.facts, []);
});

test('extraktion: Symbole werden sortiert, die Eingabereihenfolge ist unerheblich', () => {
  const a = [{ path: 'b.js', name: 'z', kind: 'function' }, { path: 'a.js', name: 'y', kind: 'class' }];
  const b = [a[1], a[0]];
  const first = extractFacts({ path: 'index:symbols', rev: '1', kind: 'symbols', content: JSON.stringify(a) });
  const second = extractFacts({ path: 'index:symbols', rev: '1', kind: 'symbols', content: JSON.stringify(b) });
  assert.deepEqual(first.facts, second.facts);
  assert.deepEqual(first.facts.map((f) => f.scope), ['a.js', 'b.js']);
  assert.equal(extractionHash(first.facts), extractionHash(second.facts));
});

test('kaskade: Umkehrkanten, deterministische Reihenfolge und Zyklusverbot', () => {
  const edges = new Map([
    ['a', ['b']],
    ['c', ['b']],
    ['d', ['a']],
  ]);
  const reverse = reverseEdges(edges);
  assert.deepEqual(reverse.get('b'), ['a', 'c']);
  assert.equal(staleClosure(edges, ['b']).stale.includes('d'), true, 'd hängt an a, a an b');
  assert.deepEqual(staleClosure(edges, ['c']).stale, ['c']);

  const cyclic = new Map([
    ['a', ['b']],
    ['b', ['a']],
  ]);
  const refused = staleClosure(cyclic, ['a']);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'ZYKLUS');
  assert.deepEqual(refused.stale, []);
  assert.deepEqual(findCycle(cyclic).sort(), ['a', 'a', 'b']);
  assert.equal(findCycle(edges), null);
});

test('revalidierung: nur ein gleicher, vorhandener Hash gilt', () => {
  assert.equal(mayRevalidate('h1', 'h1').ok, true);
  assert.equal(mayRevalidate('h1', 'h2').ok, false);
  assert.equal(mayRevalidate(null, 'h1').reason, 'KEIN_VORHERIGER_HASH');
  assert.equal(mayRevalidate('h1', '').reason, 'KEIN_NEUER_HASH');
});

test('store: gleicher Inhalt macht den Fakt wieder gültig', () => {
  const { db, close } = tempDb();
  try {
    const extracted = extractFacts(source());
    const hash = extractionHash(extracted.facts);
    const id = validFact(db, { ...extracted.facts[0], extractHash: hash }, 1);
    db.prepare('update facts set status = ? where id = ?').run('STALE', id);

    const result = applySourceChange(db, { pointer: source().path, rev: 'dev:2:2:3:9', hash, at: 2 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.revalidated, [id]);
    assert.deepEqual(result.stale, []);
    assert.equal(getFact(db, id).status, 'VALID');
    assert.equal(getFact(db, id).sources[0].rev, 'dev:2:2:3:9', 'die Revision ist gewandert');
  } finally {
    close();
  }
});

test('store: geänderter Inhalt macht direkte Fakten und ihre Nachfolger stale', () => {
  const { db, close } = tempDb();
  try {
    const path = source().path;
    const a = validFact(db, { scope: path, subject: 'a', predicate: 'p', value: 'v1', kind: 'FACT', status: 'DISCOVERED', sources: [{ pointer: path, rev: 'r1' }], extractHash: 'h1' }, 1);
    const b = validFact(db, { scope: 'anderes', subject: 'b', predicate: 'p', value: 'v2', kind: 'FACT', status: 'DISCOVERED', sources: [{ pointer: 'docs/ROADMAP.md', rev: 'r1' }], extractHash: 'h2' }, 1);
    assert.equal(addDependency(db, b, a).ok, true);

    const result = applySourceChange(db, { pointer: path, rev: 'r2', hash: 'h9', at: 2 });
    assert.deepEqual(result.stale, [a, b].sort(), 'a ist direkt betroffen, b hängt an a');
    assert.equal(getFact(db, a).status, 'STALE');
    assert.equal(getFact(db, b).status, 'STALE');
  } finally {
    close();
  }
});

test('mutation: ein abweichender Hash revalidiert nicht, ein unbekannter Zeiger ist ein Befund', () => {
  const { db, close } = tempDb();
  try {
    const path = source().path;
    const id = validFact(db, { scope: path, subject: 'a', predicate: 'p', value: 'v1', kind: 'FACT', status: 'DISCOVERED', sources: [{ pointer: path, rev: 'r1' }], extractHash: 'h1' }, 1);
    db.prepare('update facts set status = ? where id = ?').run('STALE', id);
    const wrong = applySourceChange(db, { pointer: path, rev: 'r2', hash: 'h_anders', at: 2 });
    assert.deepEqual(wrong.revalidated, [], 'ein anderer Hash gilt nicht als gleicher Inhalt');
    assert.equal(getFact(db, id).status, 'STALE');

    const unknown = applySourceChange(db, { pointer: 'gibt/es/nicht.md', rev: 'r9', hash: 'h', at: 3 });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.reason, 'QUELLE_UNBEKANNT');
  } finally {
    close();
  }
});

test('mutation: ein unabhängiger Fakt bleibt gültig, wenn eine andere Quelle sich ändert', () => {
  const { db, close } = tempDb();
  try {
    const path = source().path;
    const changedId = validFact(db, { scope: path, subject: 'a', predicate: 'p', value: 'v1', kind: 'FACT', status: 'DISCOVERED', sources: [{ pointer: path, rev: 'r1' }], extractHash: 'h1' }, 1);
    const untouched = validFact(db, { scope: 'docs', subject: 'c', predicate: 'p', value: 'v3', kind: 'FACT', status: 'DISCOVERED', sources: [{ pointer: 'docs/ROADMAP.md', rev: 'r7' }], extractHash: 'h7' }, 1);

    const result = applySourceChange(db, { pointer: path, rev: 'r2', hash: 'h_neu', at: 2 });
    assert.deepEqual(result.stale, [changedId]);
    assert.equal(getFact(db, untouched).status, 'VALID', 'keine falsche Invalidierung');
  } finally {
    close();
  }
});
