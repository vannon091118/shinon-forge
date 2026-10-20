#!/usr/bin/env node
/**
 * selection.test.mjs — der Selektionsvertrag (Slice 1).
 *
 * Gepinnt wird: Die Antwort des Selektionsagenten wird streng aufghalten —
 * falsches JSON, fremder Vertrag, Unsicherheit ausserhalb 0..1, nicht-Array,
 * unbekannte IDs und Budgetverletzungen fallen jeweils mit eigenem Grund
 * aus; leeres `selected` bleibt gueltig (der Fallback uebernimmt); Kandidaten,
 * die der Runtime gezeigt werden, tragen NIE Inhalt.
 *
 * Schlüsselzustände und die unveränderte Haupt-Route stehen bereits in
 * `route-fallback.test.mjs` (Primärroute/Fallback ohne Schlüssel) und werden
 * hier nicht doppelt abgebildet; die Unberührtheit des Haupt-Turns pinnt der
 * Gate-Test `profile-config-override` (provider ≠ prompter).
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_UNCERTAINTY, MIN_UNCERTAINTY, SELECTION_CONTRACT, parseSelection, renderCandidates, selectionSystemBrief } from '../assets/selection.js';

const ALLOWED = [
  { id: 'persona-identity-core', budgetTokens: 600, pflicht: true, modus: ['MIN', 'MID', 'MAX'] },
  { id: 'persona-report', budgetTokens: 200, pflicht: false, modus: ['MID', 'MAX'] },
  { id: 'index-project-context', budgetTokens: 6000, pflicht: false, modus: ['MAX'] },
];
const TOTAL = 6800;

const answer = (selected, uncertainty = 0.2, contract = SELECTION_CONTRACT) =>
  JSON.stringify({ contract, selected, uncertainty });

test('vertrag: gülte Antwort mit korrekten IDs und Budget wird angenommen', () => {
  const parsed = parseSelection(
    answer([{ id: 'persona-identity-core' }, { id: 'persona-report', reason: 'MULTI_STEP_TASK' }]),
    ALLOWED,
    { totalBudgetTokens: TOTAL },
  );
  assert.deepEqual(parsed, {
    ok: true,
    selected: ['persona-identity-core', 'persona-report'],
    budget: 800,
    uncertainty: 0.2,
  });
  // Doppelte IDs zählen einmal, Reihenfolge bleibt die Antwort-Reihenfolge —
  // die Pflicht muss mit dabei sein (sonst greift PFLICHT_FEHLT).
  const dedup = parseSelection(
    answer([{ id: 'persona-report' }, { id: 'persona-identity-core' }, { id: 'persona-report' }]),
    ALLOWED,
    { totalBudgetTokens: TOTAL },
  );
  assert.deepEqual(dedup.selected, ['persona-report', 'persona-identity-core']);
});

const FAILING = [
  ['kein JSON', 'wähle {was} immer', 'KEIN_JSON'],
  ['kein Objekt', '[1,2]', 'KEIN_OBJEKT'],
  ['fremder Vertrag', answer(['persona-report'], 0.1, 'shinon.fremd/v9'), 'VERTRAG_FREMD:shinon.fremd/v9'],
  ['Vertrag fehlt', JSON.stringify({ selected: [], uncertainty: 0 }), 'VERTRAG_FREMD:undefined'],
  ['Unsicherheit > 1', answer([], 1.2), 'UNSICHERHEIT'],
  ['Unsicherheit < 0', answer([], -0.1), 'UNSICHERHEIT'],
  ['Unsicherheit als Text', JSON.stringify({ contract: SELECTION_CONTRACT, selected: [], uncertainty: '0.4' }), 'UNSICHERHEIT'],
  ['selected kein Array', JSON.stringify({ contract: SELECTION_CONTRACT, selected: 'aj', uncertainty: 0 }), 'LEERE_AUSWAHL'],
  ['unbekannte ID', answer([{ id: 'persona-gibt-es-nicht' }]), 'ID_UNBEKANNT:persona-gibt-es-nicht', { totalBudgetTokens: TOTAL }],
  ['leere ID', answer([{ id: '' }]), 'KEINE_ID', { totalBudgetTokens: TOTAL }],
  ['Feld kein Objekt', answer(['persona-report']), 'KEINE_ID', { totalBudgetTokens: TOTAL }],
  // 6000 + 600 überschreitet 6500 — der zweite Kandidat wird abgelehnt.
  ['Budget gesprengt', answer([{ id: 'index-project-context' }, { id: 'persona-identity-core' }], 0.1, SELECTION_CONTRACT), 'BUDGET:persona-identity-core', { totalBudgetTokens: 6500 }],
  ['Modus nicht freigegeben', answer([{ id: 'persona-report' }]), 'NICHT_ERLAUBT:persona-report', { totalBudgetTokens: TOTAL, mode: 'MIN' }],
  ['Pflicht weggelassen', answer([{ id: 'persona-report' }]), 'PFLICHT_FEHLT:persona-identity-core', { totalBudgetTokens: TOTAL }],
];

for (const [name, text, reason, opts] of FAILING) {
  test(`vertrag: ${name} wird verworfen (${reason})`, () => {
    assert.deepEqual(
      parseSelection(text, ALLOWED, opts ?? { totalBudgetTokens: TOTAL }),
      { ok: false, reason },
    );
  });
}

test('vertrag: leerer Vorschlag bleibt gültig — der Fallback übernimmt', () => {
  const parsed = parseSelection(answer([]), ALLOWED, { totalBudgetTokens: TOTAL });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.selected, []);
  assert.equal(MIN_UNCERTAINTY, 0);
  assert.equal(MAX_UNCERTAINTY, 1);
});

test('vertrag: Grenzen der Unsicherheit sind inklusiv', () => {
  assert.equal(parseSelection(answer([], 0), ALLOWED).ok, true, '0 ist sicher');
  assert.equal(parseSelection(answer([], 1), ALLOWED).ok, true, '1 ist ratlos');
  assert.equal(parseSelection(answer([], 0.5), ALLOWED).ok, true, 'Mittelwert erlaubt');
});

test('kompaktheit: dem Agenten werden nie Inhalte gezeigt', () => {
  const candidates = renderCandidates([
    {
      id: 'persona-identity-core',
      lage: 'system',
      budgetTokens: 600,
      pflicht: true,
      ausloeser: { immer: true, intentKlassen: ['LOOKUP'], haystack: ['seed', 'rng'], scoringHaltung: ['kritisch'] },
      herkunft: 'packages/persona/index.js (IDENTITY: langer Beschreibungstext)',
    },
  ]);
  const json = JSON.stringify(candidates);
  assert.equal(candidates.length, 1);
  assert.deepEqual(Object.keys(candidates[0]).sort(), ['ausloeser', 'budget', 'id', 'lage', 'pflicht'], 'keine Felder zu viel');
  assert.equal(json.includes('persona/index.js'), false, 'Herkunftstext gehört nicht zum Agenten');
  assert.equal(json.includes('IDENTITY'), false, 'Inhaltsbeschreibung gehört nicht zum Agenten');
  assert.match(candidates[0].ausloeser, /intent=LOOKUP/);
  assert.match(candidates[0].ausloeser, /haystack=seed,rng/);
  assert.match(candidates[0].ausloeser, /haltung=kritisch/);
  // Lücke im System-Brief: der Kontrakt-Name steht unmissverständlich drin.
  const brief = selectionSystemBrief();
  assert.ok(brief.includes(SELECTION_CONTRACT));
  assert.ok(brief.includes('Nur IDs aus der KANDIDATENLISTE'));
});