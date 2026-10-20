/**
 * Der reine Kern des SALVAGED_PROSE-Zaehlers (`assets/salvage-store.js`).
 *
 * Warum ohne Ablage: die Formpruefung, der Deckel und die Fortschreibung sind
 * Regeln, die gelten, egal wer sie aufruft. Sie hier zu messen heisst, sie ohne
 * Cordis, ohne SQLite und ohne Modell zu messen — derselbe Schnitt wie bei
 * `enhancer.js` und `block-select.js`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SALVAGE_SESSIONS,
  SALVAGE_CONTRACT,
  SALVAGE_NAMESPACE,
  emptySalvage,
  salvageCountOf,
  validateSalvage,
  withSalvageCount,
} from '../assets/salvage-store.js';

test('Vertrag und Adresse sind benannt, nicht erfunden', () => {
  assert.equal(SALVAGE_NAMESPACE, 'shinon.prompter-salvage/v1');
  assert.equal(SALVAGE_CONTRACT, SALVAGE_NAMESPACE);
  assert.deepEqual(emptySalvage(), { contract: SALVAGE_CONTRACT, sessions: {} });
  assert.equal(salvageCountOf(emptySalvage(), 's'), 0);
});

test('withSalvageCount zaehlt je Sitzung, getrennt und ohne den Eingang zu veraendern', () => {
  const start = emptySalvage();
  const once = withSalvageCount(start, 'a', 'NO_JSON', '2026-10-19T10:00:00.000Z');
  const twice = withSalvageCount(once, 'a', 'NO_JSON', '2026-10-19T10:01:00.000Z');
  const other = withSalvageCount(twice, 'b', 'INVALID_JSON', '2026-10-19T10:02:00.000Z');
  assert.deepEqual(start.sessions, {}, 'der Eingang bleibt unveraendert');
  assert.equal(salvageCountOf(once, 'a'), 1);
  assert.equal(salvageCountOf(twice, 'a'), 2);
  assert.equal(salvageCountOf(other, 'b'), 1);
  assert.deepEqual(other.sessions.a.byReason, { NO_JSON: 2 });
  assert.deepEqual(other.sessions.b.byReason, { INVALID_JSON: 1 });
  assert.equal(other.sessions.a.updatedAt, '2026-10-19T10:01:00.000Z');
});

test('validateSalvage nimmt die eigene Form und wirft Fremdes weg — mit Zaehlung', () => {
  const stored = withSalvageCount(withSalvageCount(emptySalvage(), 'a', 'NO_JSON', 'x'), 'b', 'ABGESCHNITTEN+NO_JSON', 'y');
  const checked = validateSalvage(stored);
  assert.equal(checked.foreign, false);
  assert.equal(checked.dropped, 0);
  assert.deepEqual(checked.state, stored);

  // Kein Objekt oder fremder Vertrag: nicht deuten, sondern neu beginnen.
  assert.equal(validateSalvage('kaputt').foreign, true);
  assert.equal(validateSalvage([]).foreign, true);
  assert.equal(validateSalvage({ contract: 'fremd/v1', sessions: {} }).foreign, true);
  assert.equal(validateSalvage(null).foreign, false, 'nichts Gespeichertes ist kein fremder Stand');
  assert.deepEqual(validateSalvage(null).state, emptySalvage());

  // Unlesbare Zeilen fallen einzeln weg, der Rest bleibt.
  const mixed = {
    contract: SALVAGE_CONTRACT,
    sessions: {
      gut: { count: 2, byReason: { NO_JSON: 2 }, updatedAt: 'x' },
      nullZaehler: { count: 0, byReason: {} },
      text: { count: '2', byReason: {} },
      keinObjekt: 7,
      grund: { count: 1, byReason: { 'freier text': 1, NO_JSON: 1 } },
    },
  };
  const partial = validateSalvage(mixed);
  assert.equal(partial.foreign, false);
  assert.deepEqual(Object.keys(partial.state.sessions).sort(), ['grund', 'gut']);
  assert.deepEqual(partial.state.sessions.grund.byReason, { NO_JSON: 1 }, 'nur benannte Gruende');
  assert.equal(partial.dropped, 4, 'vier unlesbare Angaben werden gezaehlt, nicht geraten');
});

test('der Deckel wirft die AELTESTEN Sitzungen weg und laesst die juengste stehen', () => {
  const at = (i) => new Date(Date.UTC(2026, 9, 19, 0, 0, 0) + i * 60_000).toISOString();
  let state = emptySalvage();
  for (let i = 0; i < MAX_SALVAGE_SESSIONS + 5; i += 1) {
    state = withSalvageCount(state, `s-${String(i).padStart(3, '0')}`, 'NO_JSON', at(i));
  }
  const ids = Object.keys(state.sessions);
  assert.equal(ids.length, MAX_SALVAGE_SESSIONS);
  assert.equal(ids.includes('s-000'), false, 'die aelteste faellt zuerst');
  assert.equal(ids.includes(`s-${String(MAX_SALVAGE_SESSIONS + 4).padStart(3, '0')}`), true, 'die juengste bleibt');
});
