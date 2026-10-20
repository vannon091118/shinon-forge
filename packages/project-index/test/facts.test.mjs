// Fakten-Kern und -Store (Wissens-Runtime, Zug 1).
//
// Der Test fährt den ganzen Lebenszyklus gegen die Wahrheitstabelle: alle 64
// Statuspaare, alle 25 Klassenpaare, jede Zeigerform. Danach den Store in einer
// echten SQLite-Datei: Persistenz über einen Neustart, verbotene Übergänge,
// Zyklen und die Migration v1 → v2, bei der kein Fakt verloren geht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTORS,
  FACTS_CONTRACT,
  KINDS,
  STATUSES,
  TERMINAL,
  canReclassify,
  canTransition,
  checkFact,
  factId,
  parsePointer,
  wouldCreateCycle,
} from '../assets/facts-core.js';
import {
  FACTS_FILE_NAME,
  FACTS_VERSION,
  MIGRATIONS,
  addDependency,
  closeFacts,
  getFact,
  insertFact,
  listFacts,
  openFacts,
  transitionFact,
} from '../assets/facts-store.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'shinon-facts-'));
}

const VALID_FACT = {
  scope: 'packages/prompter',
  subject: 'pre-step.js',
  predicate: 'montiert',
  value: 'den Wissensblock',
  kind: 'FACT',
  status: 'DISCOVERED',
  sources: [{ pointer: 'packages/prompter/assets/pre-step.js:509', rev: 'dev:1:2:3:4' }],
};

test('lebenszyklus: die Tabelle deckt alle 64 Paare ab, und nur die erlaubten sind offen', () => {
  const legal = new Map();
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const ok = canTransition(from, to, 'validator').ok;
      if (ok) {
        if (!legal.has(from)) legal.set(from, []);
        legal.get(from).push(to);
      }
    }
  }
  let allowed = 0;
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      allowed += canTransition(from, to, 'validator').ok ? 1 : 0;
    }
  }
  assert.equal(STATUSES.length, 8);
  assert.equal(STATUSES.length * STATUSES.length, 64);
  // 2 + 2 + 3 + 3 + 3 + 3 = 16 erlaubte Paare von 64.
  assert.equal(allowed, 16);
  assert.deepEqual(legal.get('VALID'), ['STALE', 'DISPUTED', 'SUPERSEDED']);
  assert.deepEqual(legal.get('EXTRACTED'), ['VALIDATING', 'REJECTED']);
});

test('lebenszyklus: das Modell setzt nie einen Status, terminale Zustaende bleiben zu', () => {
  for (const from of STATUSES) {
    assert.equal(canTransition(from, 'VALID', 'model').reason, 'AKTEUR_VERBOTEN', `${from} → VALID durch model`);
    assert.equal(canTransition(from, 'VALID', 'llm').reason, 'AKTEUR_VERBOTEN');
    assert.equal(canTransition(from, 'VALID', '').reason, 'AKTEUR_VERBOTEN');
  }
  for (const actor of ACTORS) {
    for (const terminal of TERMINAL) {
      for (const to of STATUSES) {
        assert.equal(canTransition(terminal, to, actor).ok, false, `${terminal} → ${to} durch ${actor}`);
      }
    }
    // Ein gueltiger Fakt wird nicht still verworfen: der Weg nach REJECTED
    // fuehrt ueber DISPUTED, damit der Widerspruch sichtbar bleibt.
    assert.equal(canTransition('VALID', 'SUPERSEDED', actor).ok, true);
    assert.equal(canTransition('VALID', 'REJECTED', actor).reason, 'UEBERGANG_VERBOTEN');
    assert.equal(canTransition('DISPUTED', 'REJECTED', actor).ok, true);
  }
});

test('lebenszyklus: unbekannte Status sind ein Befund, kein stilles Nein', () => {
  assert.equal(canTransition('ERFUNDEN', 'VALID', 'validator').reason, 'STATUS_UNBEKANNT');
  assert.equal(canTransition('VALID', 'ERFUNDEN', 'validator').reason, 'STATUS_UNBEKANNT');
});

test('klassen: eine Klasse wird nie umgeschrieben (alle 25 Paare)', () => {
  let changes = 0;
  for (const from of KINDS) {
    for (const to of KINDS) {
      const verdict = canReclassify(from, to);
      if (from === to) {
        assert.equal(verdict.ok, true);
      } else {
        changes += 1;
        assert.equal(verdict.ok, false, `${from} → ${to}`);
        assert.equal(verdict.reason, 'KLASSE_WECHSEL_VERBOTEN');
      }
    }
  }
  assert.equal(changes, 20);
  assert.equal(canReclassify('FAKT', 'FACT').reason, 'KLASSE_UNBEKANNT');
});

test('kennung: gleiche Aussage ergibt gleiche Kennung, andere Aussage eine andere', () => {
  const first = factId(VALID_FACT);
  const again = factId({ ...VALID_FACT, sources: [] });
  const reordered = factId({
    value: VALID_FACT.value,
    predicate: VALID_FACT.predicate,
    subject: VALID_FACT.subject,
    scope: VALID_FACT.scope,
  });
  assert.equal(first, again);
  assert.equal(first, reordered, 'die Feldreihenfolge im Objekt ist unerheblich');
  assert.match(first, /^f_[0-9a-f]{16}$/);
  assert.notEqual(first, factId({ ...VALID_FACT, value: 'etwas anderes' }));
  assert.notEqual(first, factId({ ...VALID_FACT, subject: 'pre-step' }));
});

test('zeiger: relativ, mit optionaler Zeile, ohne Ausbruch', () => {
  assert.equal(parsePointer('packages/prompter/index.js:479').ok, true);
  assert.equal(parsePointer('docs/ROADMAP.md').ok, true);
  assert.equal(parsePointer('').reason, 'ZEIGER_LEER');
  assert.equal(parsePointer('   ').reason, 'ZEIGER_LEER');
  assert.equal(parsePointer('/etc/passwd').reason, 'ZEIGER_ABSOLUT');
  assert.equal(parsePointer('../fremd.js').reason, 'ZEIGER_AUSBRUCH');
  assert.equal(parsePointer('a/../../b.js').reason, 'ZEIGER_AUSBRUCH');
  assert.equal(parsePointer('a\\b.js').reason, 'ZEIGER_FORM');
  assert.equal(parsePointer('C:/x.js').reason, 'ZEIGER_FORM');
  assert.equal(parsePointer('paket.js:0').reason, 'ZEIGER_ZEILE');
  assert.equal(parsePointer('verzeichnis/').reason, 'ZEIGER_FORM');
});

test('form: ein Fakt ohne Quelle oder mit falschem Einstieg ist ungueltig', () => {
  assert.deepEqual(checkFact(VALID_FACT), []);
  assert.deepEqual(checkFact({ ...VALID_FACT, sources: [] }), ['QUELLE_FEHLT']);
  assert.deepEqual(checkFact({ ...VALID_FACT, sources: [{ pointer: '../x', rev: 'r1' }] }), ['QUELLE_ZEIGER_AUSBRUCH']);
  assert.deepEqual(checkFact({ ...VALID_FACT, sources: [{ pointer: 'a.js' }] }), ['QUELLE_OHNE_REVISION']);
  assert.deepEqual(checkFact({ ...VALID_FACT, kind: 'FAKT' }), ['KLASSE_UNBEKANNT']);
  assert.deepEqual(checkFact({ ...VALID_FACT, status: 'VALID' }), ['EINSTIEG_NICHT_DISCOVERED']);
  assert.deepEqual(checkFact({ ...VALID_FACT, id: 'f_falsch' }), ['KENNUNG_FALSCH']);
  assert.deepEqual(checkFact({ ...VALID_FACT, id: factId(VALID_FACT) }), []);
  assert.deepEqual(checkFact({ ...VALID_FACT, scope: '  ' }), ['FELD_LEER:scope']);
  assert.deepEqual(checkFact(null), ['KEIN_OBJEKT']);
});

test('zyklen: ein Kreis ist ein Kreis, auch über zwei Ecken', () => {
  const edges = new Map([
    ['a', ['b']],
    ['b', ['c']],
  ]);
  assert.equal(wouldCreateCycle(edges, 'c', 'a'), true, 'c → a schließt a → b → c');
  assert.equal(wouldCreateCycle(edges, 'a', 'c'), false);
  assert.equal(wouldCreateCycle(edges, 'a', 'a'), true);
  assert.equal(wouldCreateCycle(new Map(), 'x', 'y'), false);
});

test('store: Persistenz über einen Neustart, und derselbe Fakt wird nicht doppelt angelegt', () => {
  const dir = tempDir();
  try {
    const file = join(dir, FACTS_FILE_NAME);
    const db = openFacts(file);
    const first = insertFact(db, VALID_FACT, 1);
    assert.equal(first.ok, true);
    assert.equal(first.existed, false);
    const second = insertFact(db, VALID_FACT, 2);
    assert.equal(second.existed, true);
    assert.equal(second.id, first.id);
    closeFacts(db);

    const reopened = openFacts(file);
    const stored = getFact(reopened, first.id);
    assert.equal(stored.status, 'DISCOVERED');
    assert.equal(stored.value, VALID_FACT.value);
    assert.deepEqual(stored.sources, VALID_FACT.sources);
    assert.deepEqual(listFacts(reopened, 'packages/prompter'), [{ id: first.id, status: 'DISCOVERED', kind: 'FACT' }]);
    closeFacts(reopened);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: ungültige Fakten werden abgelehnt statt halb geschrieben', () => {
  const dir = tempDir();
  try {
    const db = openFacts(join(dir, FACTS_FILE_NAME));
    const verdict = insertFact(db, { ...VALID_FACT, sources: [] }, 1);
    assert.equal(verdict.ok, false);
    assert.deepEqual(verdict.issues, ['QUELLE_FEHLT']);
    assert.deepEqual(listFacts(db, 'packages/prompter'), [], 'nichts wurde geschrieben');
    closeFacts(db);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: Übergänge laufen nur über den Kern, und der Verlauf bleibt lesbar', () => {
  const dir = tempDir();
  try {
    const db = openFacts(join(dir, FACTS_FILE_NAME));
    const { id } = insertFact(db, VALID_FACT, 1);
    assert.equal(transitionFact(db, id, 'VALID', 'extractor', 2).reason, 'UEBERGANG_VERBOTEN');
    assert.equal(transitionFact(db, id, 'VALID', 'model', 2).reason, 'AKTEUR_VERBOTEN');
    assert.equal(transitionFact(db, id, 'EXTRACTED', 'extractor', 3).ok, true);
    assert.equal(transitionFact(db, id, 'VALIDATING', 'extractor', 4).ok, true);
    assert.equal(transitionFact(db, id, 'VALID', 'validator', 5).ok, true);
    assert.equal(getFact(db, id).status, 'VALID');
    assert.equal(transitionFact(db, 'f_unbekannt', 'VALID', 'validator', 6).reason, 'FAKT_UNBEKANNT');
    closeFacts(db);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: Abhängigkeiten nur zwischen bekannten Fakten und nie im Kreis', () => {
  const dir = tempDir();
  try {
    const db = openFacts(join(dir, FACTS_FILE_NAME));
    const a = insertFact(db, VALID_FACT, 1).id;
    const b = insertFact(db, { ...VALID_FACT, subject: 'stand.js' }, 1).id;
    const c = insertFact(db, { ...VALID_FACT, subject: 'pre-step.js', predicate: 'liest' }, 1).id;
    assert.equal(addDependency(db, a, b).ok, true);
    assert.equal(addDependency(db, b, c).ok, true);
    assert.equal(addDependency(db, c, a).reason, 'ZYKLUS');
    assert.equal(addDependency(db, a, a).reason, 'ZYKLUS');
    assert.equal(addDependency(db, a, 'f_fremd').reason, 'FAKT_UNBEKANNT');
    assert.deepEqual(getFact(db, a).dependsOn, [b]);
    closeFacts(db);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration: von v1 auf v2 bleiben alle Fakten und Quellen erhalten', () => {
  const dir = tempDir();
  try {
    const file = join(dir, FACTS_FILE_NAME);
    // Eine v1-Datei nachbauen: nur der erste Schritt, wie ihn der alte Code
    // schrieb — Tabellen aus MIGRATIONS[0] und die Versionsmarke 1.
    const old = new DatabaseSync(file);
    for (const statement of MIGRATIONS[0].sql) old.exec(statement);
    old.exec('pragma user_version = 1');
    old.prepare(
      'insert into facts (id, scope, subject, predicate, value, kind, status, status_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('f_alt', 'packages/prompter', 'pre-step.js', 'montiert', 'den Wissensblock', 'FACT', 'VALID', '7');
    old.prepare('insert into fact_sources (fact_id, pointer, rev) values (?, ?, ?)').run(
      'f_alt',
      'packages/prompter/assets/pre-step.js:509',
      'dev:1:2:3:4',
    );
    old.close();

    const upgraded = openFacts(file);
    const stored = getFact(upgraded, 'f_alt');
    assert.notEqual(stored, null, 'der Fakt hat die Migration überlebt');
    assert.equal(stored.status, 'VALID');
    assert.deepEqual(stored.sources, [{ pointer: 'packages/prompter/assets/pre-step.js:509', rev: 'dev:1:2:3:4' }]);
    assert.equal(upgraded.prepare('pragma user_version').get().user_version, FACTS_VERSION);
    // Die neue Tabelle ist da und benutzbar — die alte Zeile bleibt daneben.
    const b = insertFact(upgraded, { ...VALID_FACT, subject: 'stand.js' }, 8).id;
    assert.equal(addDependency(upgraded, b, 'f_alt').ok, true);
    closeFacts(upgraded);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration: kein Schritt löscht eine Tabelle, und eine neuere Fassung wird abgelehnt', () => {
  for (const step of MIGRATIONS) {
    for (const statement of step.sql) {
      assert.equal(/drop\s+table/i.test(statement), false, `Schritt ${step.to} droppt: ${statement}`);
      assert.equal(/delete\s+from/i.test(statement), false, `Schritt ${step.to} löscht Zeilen: ${statement}`);
    }
  }
  assert.equal(FACTS_VERSION, MIGRATIONS.length);
  assert.deepEqual(MIGRATIONS.map((step) => step.to), [1, 2]);

  const dir = tempDir();
  try {
    const file = join(dir, FACTS_FILE_NAME);
    const future = new DatabaseSync(file);
    future.exec(`pragma user_version = ${FACTS_VERSION + 1}`);
    future.close();
    assert.throws(() => openFacts(file), /FACTS_VERSION_NEU/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('quelle: der Store nennt den Vertrag, und es gibt keine zweite Datei-Ablage', () => {
  const source = readFileSync(join(HERE, '..', 'assets', 'facts-store.js'), 'utf8');
  assert.match(source, /import \{ DatabaseSync \} from 'node:sqlite'/);
  assert.equal(source.includes('writeFileSync'), false, 'der Store schreibt nur über SQLite');
  assert.equal(importExists(), true);
  assert.equal(typeof FACTS_CONTRACT, 'string');
  assert.match(FACTS_CONTRACT, /^shinon\.facts\/v\d+$/);
});

function importExists() {
  return existsSync(join(HERE, '..', 'assets', 'facts-store.js'));
}
