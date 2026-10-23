// Ergebnisvertrag, zwei Modi (Wissens-Runtime, Zug 4).
//
// Der Standardweg bleibt, wie er war: eine unbekannte Referenz wird protokolliert
// und der Kontext trotzdem geliefert. Der wissensgebundene Weg ist streng: wer
// einen Faktenblock bekommt, darf sich nicht auf Quellen berufen, die nicht darin
// stehen — dort ist die Referenz ein Ablehnungsgrund.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONTENT_FLOOR, acceptance, anchorShare } from '../assets/result-contract.js';

const base = {
  enhancedPrompt: 'Pruefe a.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: ['gibt/es/nicht'],
};

const context = { files: [{ path: 'src/a.mjs', content: 'x' }], symbols: [], constraints: [], touches: [], dependencies: [] };

test('standard: unbekannte Referenz wird protokolliert, der Kontext bleibt', () => {
  const verdict = acceptance({ ...base, references: ['src/a.mjs', 'gibt/es/nicht'] }, { needsContext: true, context });
  assert.equal(verdict.accepted, true);
  assert.deepEqual(verdict.reasons, []);
});

test('streng: dieselbe Referenz ist im wissensgebundenen Weg ein Grund', () => {
  const verdict = acceptance({ ...base, references: ['src/a.mjs', 'gibt/es/nicht'] }, { needsContext: true, context, strictFacts: true });
  assert.equal(verdict.accepted, false);
  assert.deepEqual(verdict.reasons, ['UNRESOLVED_REFERENCE:gibt/es/nicht']);
});

test('streng: aufloesbare Referenzen bleiben gruen', () => {
  const verdict = acceptance({ ...base, references: ['src/a.mjs'] }, { needsContext: true, context, strictFacts: true });
  assert.equal(verdict.accepted, true);
  assert.deepEqual(verdict.reasons, []);
});

test('streng ohne Not: ohne Kontextbedarf gilt die Regel nicht', () => {
  const verdict = acceptance({ ...base, references: ['gibt/es/nicht'] }, { needsContext: false, strictFacts: true });
  assert.equal(verdict.accepted, true);
});

// Inhaltsregel (gemessen 2026-10-23, session-87c52523): die Annahme darf nicht
// am Self-Report des Modells haengen. Der echte Fehlerfall: das Modell gab seine
// EIGENE Veredler-Anweisung als enhancedPrompt zurueck — Schema valide,
// `preservedIntent: true` — und der Roh-Text des Menschen wurde ueberschrieben.
const ROH_KOGNITIV = 'Also ich glaube nicht, dass wir weiterkommen mit dem system, '
  + 'wenn wir nicht ordentlich ueberpruefen, was die kognitive last und die '
  + 'begrenzte konzentration als ressourcen sind und wie wir die im '
  + 'arbeitsablauf beruecksichtigen.';
const VEREDLER_ANWEISUNG = 'Du bist der Prompt-Veredler von Shinon. Deine Aufgabe ist es, '
  + 'den folgenden Prompt zu verbessern, ohne seine Absicht zu veraendern.';

test('Inhalt: die eigene Veredler-Anweisung des Modells ersetzt den Auftrag nicht', () => {
  const verdict = acceptance(
    { ...base, enhancedPrompt: VEREDLER_ANWEISUNG },
    { rawPrompt: ROH_KOGNITIV },
  );
  assert.equal(verdict.accepted, false, 'der Fehlerfall von 2026-10-23 muss rot sein');
  assert.deepEqual(verdict.reasons, ['CONTENT_LOST']);
});
test('Inhalt: eine echte Veredelung traegt den Auftrag weiter', () => {
  // Die gemessene Schwelle trennt: die vier legitimen Veredelungen der Sitzung
  // lagen bei 0.31–1.00, der Fehlerfall bei 0.08 (siehe CONTENT_FLOOR).
  const veredelt = 'Wie gross muss der Pool an kognitiver last und begrenzter '
    + 'konzentration mindestens sein, damit das system weiterkommt? Nenne die '
    + 'grenzen und beruecksichtige sie im Arbeitsablauf.';
  const share = anchorShare(veredelt, ROH_KOGNITIV);
  assert.ok(share !== null && share >= CONTENT_FLOOR, `Anker-Quote ${share} liegt ueber der Schwelle`);
  const verdict = acceptance({ ...base, enhancedPrompt: veredelt }, { rawPrompt: ROH_KOGNITIV });
  assert.equal(verdict.accepted, true, `legitime Veredelung bleibt gruen (Quote ${share})`);
});
test('Inhalt: Umlaut und Transliteration sind dasselbe Wort fuer den Anker', () => {
  // Gemessen am Fixture-Fall: Roh "pruefe", Antwort "Prüfe" — ohne
  // Normalisierung zaehlt das als anderes Wort und die Veredelung faellt.
  assert.equal(anchorShare('Prüfe die markierungen.', 'pruefe src/a.mjs'), 1);
  assert.equal(anchorShare('Prüffe die markierungen.', 'pruefe die markierungen'), 1 / 2, 'ein Tippfehler bleibt ein anderer Buchstabe');
});
test('Inhalt: ohne Rohtext gibt es keinen Vergleich — und kein erfundenes Verwerfen', () => {
  assert.equal(anchorShare('irgendwas', ''), null, 'ohne Anker keine Quote');
  assert.equal(anchorShare('ja', 'ok'), null, 'ein Rohtext ohne langes Wort ist kein Anker');
  // Der Aufrufer ohne Rohtext prueft nichts und behauptet trotzdem keine Prüfung.
  const verdict = acceptance({ ...base, enhancedPrompt: VEREDLER_ANWEISUNG }, {});
  assert.equal(verdict.accepted, true, 'ohne rawPrompt bleibt das alte Verhalten');
});
