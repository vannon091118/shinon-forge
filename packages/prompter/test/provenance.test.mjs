#!/usr/bin/env node
/**
 * provenance.test.mjs — die Provenienz-Leiter als Kern.
 *
 * Gepinnt wird, was der Vertrag `shinon.provenance/v1` zusagt und was ohne
 * Host prüfbar ist: das geschlossene Fünf-Vokabular, die zwei Zeigerformen
 * samt Abweisungen, die Zeigerpflicht, „keine Beförderung" über ALLE 25
 * Klassenpaare und die Determinismus-Zusage des Datensatzes.
 *
 * Kein Host, kein Modell, kein Netz, kein node_modules: der Kern ist
 * importfrei, damit dieser Lauf in CI auch ohne Installation trägt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVENANCE_CLASSES,
  PROVENANCE_CONTRACT,
  canPromote,
  isProvenanceClass,
  parsePointer,
  provenanceLabel,
  provenanceRecord,
  provenanceSummary,
  statement,
} from '../assets/provenance.js';

test('Vokabular: genau fünf Klassen, keine sechste, keine Aliase', () => {
  assert.deepEqual(PROVENANCE_CLASSES, ['FACT', 'DERIVED', 'JUDGEMENT', 'NARRATIVE', 'PROPOSAL']);
  assert.equal(new Set(PROVENANCE_CLASSES).size, 5, 'keine Dopplung');
  assert.equal(PROVENANCE_CONTRACT, 'shinon.provenance/v1');
  for (const value of PROVENANCE_CLASSES) assert.equal(isProvenanceClass(value), true);
  for (const value of ['FAKT', 'fact', 'FACTUAL', '', null, undefined, 1]) {
    assert.equal(isProvenanceClass(value), false, `${String(value)} ist keine Klasse`);
  }
});

test('Zeiger: Datei, Datei mit Zeile, Vertrags-ID — normalisiert und geprüft', () => {
  assert.deepEqual(parsePointer('src/a.mjs'), { ok: true, kind: 'file', ref: 'src/a.mjs', path: 'src/a.mjs', line: null });
  assert.deepEqual(parsePointer('./src/a.mjs'), { ok: true, kind: 'file', ref: 'src/a.mjs', path: 'src/a.mjs', line: null });
  assert.deepEqual(parsePointer('packages/prompter/index.js:479'), {
    ok: true, kind: 'file', ref: 'packages/prompter/index.js:479', path: 'packages/prompter/index.js', line: 479,
  });
  assert.deepEqual(parsePointer('shinon.scoring-state/read-v1'), {
    ok: true, kind: 'contract', ref: 'shinon.scoring-state/read-v1', path: null, line: null,
  });
  assert.deepEqual(parsePointer('shinon.narrative/v1'), {
    ok: true, kind: 'contract', ref: 'shinon.narrative/v1', path: null, line: null,
  });
  // Ohne Version ist es KEIN Vertrag, sondern ein Dateiname — die Grenze ist
  // die Form, nicht die Absicht.
  assert.equal(parsePointer('shinon.narrative').kind, 'file');
});

test('Zeiger: absolut, Ausbruch, Trenner, Zeile 0 und fremde Formen werden abgewiesen', () => {
  const cases = [
    ['/etc/passwd', 'ZEIGER_ABSOLUT'],
    ['../geheim', 'ZEIGER_AUSBRUCH'],
    ['src/../../geheim', 'ZEIGER_AUSBRUCH'],
    ['src//a.mjs', 'ZEIGER_FORM'],
    ['src/./a.mjs', 'ZEIGER_FORM'],
    ['src\\a.mjs', 'ZEIGER_TRENNER'],
    ['src/a.mjs:0', 'ZEIGER_ZEILE'],
    ['src/a.mjs:-1', 'ZEIGER_FREMD'],
    ['src/a.mjs:12:34', 'ZEIGER_FREMD'],
    ['C:/projekt/a.mjs', 'ZEIGER_FREMD'],
    ['shinon.NARRATIVE/v1', 'ZEIGER_FREMD'],
    [' shinon.narrative/v1', 'ZEIGER_LEERZEICHEN'],
    ['', 'ZEIGER_LEER'],
    ['src/a.mjs ', 'ZEIGER_LEERZEICHEN'],
    [null, 'ZEIGER_KEIN_STRING'],
    [42, 'ZEIGER_KEIN_STRING'],
  ];
  for (const [input, reason] of cases) {
    assert.deepEqual(parsePointer(input), { ok: false, reason }, `${JSON.stringify(input)} ⇒ ${reason}`);
  }
});

test('Zeigerpflicht: ein Eintrag ohne gültigen Zeiger wird nicht übernommen', () => {
  const valid = statement({ class: 'DERIVED', pointer: 'src/a.mjs', source: 'shinon_index_query' });
  assert.deepEqual(valid, {
    ok: true,
    statement: { class: 'DERIVED', pointer: 'src/a.mjs', source: 'shinon_index_query' },
  });

  assert.deepEqual(statement({ class: 'FAKT', pointer: 'src/a.mjs', source: 'x' }), { ok: false, reason: 'KLASSE_UNBEKANNT' });
  assert.deepEqual(statement({ class: 'FACT', pointer: '', source: 'x' }), { ok: false, reason: 'ZEIGER_LEER' });
  assert.deepEqual(statement({ class: 'FACT', pointer: 'src/a.mjs', source: '' }), { ok: false, reason: 'QUELLE_FEHLT' });
  assert.deepEqual(statement({ class: 'FACT', pointer: 'src/a.mjs', source: 'x\nzeile' }), { ok: false, reason: 'QUELLE_FORM' });
  assert.deepEqual(statement({ class: 'FACT', pointer: '../a.mjs', source: 'x' }), { ok: false, reason: 'ZEIGER_AUSBRUCH' });
  assert.deepEqual(statement(null), { ok: false, reason: 'EINTRAG_KEIN_OBJEKT' });
  assert.deepEqual(statement([]), { ok: false, reason: 'EINTRAG_KEIN_OBJEKT' });
});

test('keine Beförderung: nur die eigene Klasse ist erlaubt — 5 wahr, 20 falsch', () => {
  let allowed = 0;
  let forbidden = 0;
  for (const from of PROVENANCE_CLASSES) {
    for (const to of PROVENANCE_CLASSES) {
      if (from === to) {
        assert.equal(canPromote(from, to), true, `${from} → ${to} ist Identität`);
        allowed += 1;
      } else {
        assert.equal(canPromote(from, to), false, `${from} → ${to} ist eine Beförderung`);
        forbidden += 1;
      }
    }
  }
  assert.equal(allowed, 5);
  assert.equal(forbidden, 20);
  // Unbekannte Klassen sind keine Identität, auch nicht mit sich selbst.
  assert.equal(canPromote('FAKT', 'FAKT'), false);
  assert.equal(canPromote(undefined, undefined), false);
});

test('Datensatz: Zensus, Deduplizierung und vollständige Leere', () => {
  const record = provenanceRecord([
    { class: 'FACT', pointer: 'src/a.mjs', source: 'prompter.contextPath' },
    { class: 'FACT', pointer: 'src/a.mjs', source: 'prompter.contextPath' },
    { class: 'JUDGEMENT', pointer: 'shinon.scoring-state/read-v1', source: 'shinon_scoring_state' },
    { class: 'NARRATIVE', pointer: 'shinon.narrative/v1', source: 'shinon/narrative/state' },
    { class: 'PROPOSAL', pointer: 'shinon.prompter/result-v1', source: 'one-shot' },
  ]);
  assert.equal(record.contract, 'shinon.provenance/v1');
  assert.deepEqual(Object.keys(record.classes).sort(), [...PROVENANCE_CLASSES].sort());
  assert.deepEqual(record.classes, { FACT: 1, DERIVED: 0, JUDGEMENT: 1, NARRATIVE: 1, PROPOSAL: 1 });
  assert.equal(record.entries.length, 4, 'die doppelte Zeile zählt einmal');
  assert.equal(record.duplicates, 1, 'die Wiederholung wird gezählt, nicht verschwiegen');
  assert.deepEqual(record.violations, []);
  assert.equal(record.omitted, 0);
  assert.equal(record.complete, true);

  const empty = provenanceRecord([]);
  assert.equal(empty.complete, true, 'leer ist eine Auskunft, keine Lücke');
  assert.deepEqual(empty.classes, { FACT: 0, DERIVED: 0, JUDGEMENT: 0, NARRATIVE: 0, PROPOSAL: 0 });

  const missing = provenanceRecord(undefined);
  assert.equal(missing.complete, true, 'fehlende Liste ist leer, nicht kaputt');
});

test('Datensatz: ein ungültiger Eintrag verschwindet nicht, er wird benannt', () => {
  const record = provenanceRecord([
    { class: 'FACT', pointer: 'src/a.mjs', source: 'x' },
    { class: 'FAKT', pointer: 'src/b.mjs', source: 'x' },
    { class: 'FACT', pointer: '/etc/passwd', source: 'x' },
    { class: 'FACT', pointer: 'src/c.mjs', source: '' },
  ]);
  assert.equal(record.entries.length, 1);
  assert.equal(record.complete, false);
  assert.deepEqual(record.violations.map((entry) => entry.reason).sort(), [
    'KLASSE_UNBEKANNT', 'QUELLE_FEHLT', 'ZEIGER_ABSOLUT',
  ]);
  // Die Verletzung nennt Klasse und Zeiger, aber keinen Inhalt.
  assert.equal(record.violations[0].pointer, 'src/b.mjs');
  assert.equal(record.violations.some((entry) => 'content' in entry), false);
});

test('Datensatz: die Obergrenze wird als omitted gezählt, nicht verschwiegen', () => {
  const entries = ['a', 'b', 'c'].map((name) => ({ class: 'FACT', pointer: `src/${name}.mjs`, source: 'x' }));
  const record = provenanceRecord(entries, { limit: 2 });
  assert.equal(record.entries.length, 2);
  assert.equal(record.omitted, 1);
  assert.equal(record.complete, false, 'eine gekürzte Spur ist unvollständig');
  assert.equal(provenanceLabel(record), 'prov=2/0+1!');
});

test('Datensatz: gleiche Einträge ergeben denselben Datensatz (Determinismus)', () => {
  const entries = [
    { class: 'DERIVED', pointer: 'src/a.mjs', source: 'shinon_index_query' },
    { class: 'JUDGEMENT', pointer: 'shinon.scoring-state/read-v1', source: 'shinon_scoring_state' },
  ];
  assert.deepEqual(provenanceRecord(entries), provenanceRecord(entries));
  // Reihenfolge ist Eingabereihenfolge, nicht Sortierung: zwei Läufe mit
  // derselben Liste sind gleich, nicht „gleich sortiert".
  assert.deepEqual(provenanceRecord(entries).entries, entries);
});

test('Zusammenfassung und Label: der Zensus für das Fenster, die Kurzform fürs Log', () => {
  const record = provenanceRecord([
    { class: 'FACT', pointer: 'src/a.mjs', source: 'x' },
    { class: 'FAKT', pointer: 'src/b.mjs', source: 'x' },
  ]);
  assert.deepEqual(provenanceSummary(record), {
    contract: 'shinon.provenance/v1',
    classes: { FACT: 1, DERIVED: 0, JUDGEMENT: 0, NARRATIVE: 0, PROPOSAL: 0 },
    entries: 1,
    violations: 1,
    omitted: 0,
    duplicates: 0,
    complete: false,
  });
  assert.equal(provenanceLabel(record), 'prov=1/1!');
  assert.equal(provenanceLabel(null), '');
  assert.equal(provenanceSummary(null), null);
});
