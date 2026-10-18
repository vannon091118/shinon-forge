import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  INTENT_CLASSES,
  INTENT_PRIORITY,
  UNDEFINED,
  expandPrompt,
  resolveIntent,
  textFeatures,
} from '../assets/intent-resolver.js';

/**
 * Der Vertrag des Runtime-Resolvers (P2): die Klasse kommt aus dem TEXT, nicht
 * aus einer Modellantwort. Kein Modellaufruf, kein I/O im Modul — diese Datei
 * liest nur die ECHTEN Pattern-Daten, damit die Tests nicht auf einer Kopie
 * gruen werden.
 */
const RULES = JSON.parse(readFileSync(new URL('../assets/intent-rules.json', import.meta.url), 'utf8'));

const classOf = (text) => resolveIntent(text, RULES).classification;

// ── 1. Die fuenf Klassen kommen deterministisch aus den Pattern-Daten ────────

test('Resolver: jede der fuenf Klassen ist ohne Modell ableitbar', () => {
  const cases = [
    { text: 'hallo wie gehts', expected: 'CHAT', pattern: 'chat' },
    { text: 'erklär mir den code', expected: 'LOOKUP', pattern: 'read-code' },
    { text: 'refaktoriere den prompter gruendlich', expected: 'TRANSFORM', pattern: 'refactor' },
    { text: 'schreib tests fuer scoring', expected: 'MULTI_STEP_TASK', pattern: 'tests' },
    { text: 'baue das ueber wochen auf dauer', expected: 'LONG_RUNNING_GOAL', pattern: 'long-running-goal' },
  ];
  for (const { text, expected, pattern } of cases) {
    const resolved = resolveIntent(text, RULES);
    assert.equal(resolved.classification, expected, text);
    assert.equal(resolved.patternId, pattern, `${text}: der Treffer ist der bestehende Pattern`);
    assert.equal(resolved.reason, 'MATCHED');
    // Zweimal dieselbe Eingabe ist zweimal dieselbe Antwort.
    assert.deepEqual(resolveIntent(text, RULES), resolved, `${text}: deterministisch`);
  }
});

test('Resolver: die Pattern-Daten sind die EINZIGE Quelle — kein Trigger steht im Code', () => {
  // Jedes Ergebnis nennt eine Pattern-Id, die es in `intent-rules.json` gibt;
  // der Resolver fuehrt keine zweite Liste. Eine erfundene Id waere hier rot.
  const ids = new Set(RULES.patterns.map((pattern) => pattern.id));
  for (const text of ['hallo', 'erklär mir den code', 'refaktoriere das', 'schreib tests', 'auf dauer']) {
    assert.ok(ids.has(resolveIntent(text, RULES).patternId), text);
  }
  assert.equal(RULES.patterns.every((p) => INTENT_CLASSES.includes(p.classification)), true, 'jede Datenklasse ist im Vokabular');
});

// ── 2. Feste Prioritaet: der staerkste Auftrag gewinnt ──────────────────────

test('Resolver: die Prioritaet ist total und fest', () => {
  assert.deepEqual(Object.keys(INTENT_PRIORITY).sort(), [...INTENT_CLASSES].sort());
  assert.equal(INTENT_PRIORITY.LONG_RUNNING_GOAL > INTENT_PRIORITY.MULTI_STEP_TASK, true);
  assert.equal(INTENT_PRIORITY.MULTI_STEP_TASK > INTENT_PRIORITY.TRANSFORM, true);
  assert.equal(INTENT_PRIORITY.TRANSFORM > INTENT_PRIORITY.LOOKUP, true);
  assert.equal(INTENT_PRIORITY.LOOKUP > INTENT_PRIORITY.CHAT, true);
});

test('Resolver: ein starker Auftrag schlaegt einen schwachen — nicht die Reihenfolge der Daten', () => {
  // Enthaelt Smalltalk UND einen Mehrschritt-Auftrag: der Auftrag gewinnt.
  assert.equal(classOf('danke, jetzt schreib tests fuer scoring'), 'MULTI_STEP_TASK');
  // Refactor (TRANSFORM) plus Test-Auftrag (MULTI_STEP_TASK): der Auftrag gewinnt.
  assert.equal(classOf('refaktoriere und schreib tests'), 'MULTI_STEP_TASK');
  // Die Reihenfolge der Pattern-Zeilen dreht das Ergebnis nicht.
  const reversed = { ...RULES, patterns: [...RULES.patterns].reverse() };
  assert.equal(resolveIntent('refaktoriere und schreib tests', reversed).classification, 'MULTI_STEP_TASK');
});

// ── 3. Enthaltung: unklar ist UNDEFINED, nie eine geratene Klasse ───────────

test('Resolver: unklare Eingabe ist UNDEFINED — mit benanntem Grund', () => {
  for (const text of ['mach was', 'xyz', 'das da oben', 'irgendwas mit dem zeug']) {
    const resolved = resolveIntent(text, RULES);
    assert.equal(resolved.classification, UNDEFINED, text);
    assert.equal(resolved.matched, false, text);
    assert.equal(INTENT_CLASSES.includes(resolved.classification), false, 'UNDEFINED ist keine Klasse');
  }
  assert.equal(resolveIntent('mach was', RULES).reason, 'NO_MATCH');
});

test('Resolver: fehlende Daten und leerer Text sind UNDEFINED, kein Wurf', () => {
  assert.equal(resolveIntent('', RULES).reason, 'EMPTY');
  assert.equal(resolveIntent('   ', RULES).classification, UNDEFINED);
  assert.equal(resolveIntent('schreib tests', null).reason, 'NO_RULES');
  assert.equal(resolveIntent('schreib tests', {}).reason, 'NO_RULES');
  assert.equal(resolveIntent('schreib tests', { patterns: 'nein' }).reason, 'NO_RULES');
});

test('Resolver: eine unbekannte Klasse in den Daten ist kein Treffer', () => {
  const foreign = { patterns: [{ id: 'vibe', label: 'Vibe', trigger: ['mach vibe'], classification: 'VIBE', expansion: 'x' }] };
  const resolved = resolveIntent('mach vibe', foreign);
  assert.equal(resolved.classification, UNDEFINED);
  assert.equal(resolved.reason, 'UNKNOWN_CLASS', 'der Grund nennt den Datenfehler');
});

// ── 4. Fragen: klassifiziert, aber NIE erweitert ───────────────────────────

test('Resolver: eine Frage ist LOOKUP und bekommt keinen Aufgabe-Block', () => {
  const question = resolveIntent('Ist "fix den bug" der richtige Trigger?', RULES);
  assert.equal(question.classification, 'LOOKUP');
  assert.equal(question.question, true);
  assert.equal(question.expansion, '');
  assert.equal(expandPrompt('Ist "fix den bug" der richtige Trigger?', question), 'Ist "fix den bug" der richtige Trigger?');
});

test('Resolver: eine Frage ohne Pattern will eine Antwort — kein Goal', () => {
  const resolved = resolveIntent('warum ist der test broken?', RULES);
  assert.equal(resolved.classification, 'LOOKUP');
  assert.equal(resolved.reason, 'QUESTION');
  assert.equal(resolved.matched, false, 'kein Pattern behauptet einen Auftrag');
});

test('Resolver: Smalltalk bleibt Smalltalk, auch als Frage', () => {
  assert.equal(classOf('hallo, wie geht es dir?'), 'CHAT');
});

// ── 5. Ganze Phrase, nicht Substring — und die Expansion ist ein Angebot ────

test('Resolver: Trigger sind ganze Phrasen — Testament ist kein Test', () => {
  assert.equal(resolveIntent('Testament schreiben', RULES).matched, false);
  assert.equal(resolveIntent('docker compose starten', RULES).matched, false);
  assert.equal(resolveIntent('der Test ist rot', RULES).classification, UNDEFINED);
});

test('Resolver: die Expansion haengt den Auftrag an, sie ersetzt ihn nicht', () => {
  const resolved = resolveIntent('schreib tests fuer scoring', RULES);
  const expanded = expandPrompt('schreib tests fuer scoring', resolved);
  assert.ok(expanded.startsWith('schreib tests fuer scoring'));
  assert.ok(expanded.includes('# Aufgabe'));
  // Ohne Expansion kommt der Text wortgleich zurueck — fail-closed.
  assert.equal(expandPrompt('hallo', resolveIntent('hallo', RULES)), 'hallo');
  assert.equal(expandPrompt('hallo', null), 'hallo');
});

// ── 6. Der granulare Pool (Fassung 2) ───────────────────────────────────────
//
// Acht Patterns sind ein Anfang, kein Verständnis. Der Pool wächst auf 40
// Zeilen, jede mit eigener Id und eigener Expansion — aber die Regeln bleiben:
// keine Themenwörter, keine erfundenen Treffer, feste Klassenpriorität.

test('Pool: mindestens 40 granulare Patterns, jede Id genau einmal', () => {
  assert.ok(RULES.patterns.length >= 40, `nur ${RULES.patterns.length} Patterns`);
  const ids = RULES.patterns.map((pattern) => pattern.id);
  assert.equal(new Set(ids).size, ids.length, 'doppelte Id');
  for (const pattern of RULES.patterns) {
    assert.ok(Array.isArray(pattern.trigger) && pattern.trigger.length > 0, `${pattern.id}: kein Trigger`);
    assert.ok(INTENT_CLASSES.includes(pattern.classification), `${pattern.id}: fremde Klasse`);
    assert.equal(typeof pattern.label, 'string');
  }
});

test('Pool: jede der fuenf Klassen ist mehrfach vertreten', () => {
  for (const classification of INTENT_CLASSES) {
    const count = RULES.patterns.filter((pattern) => pattern.classification === classification).length;
    assert.ok(count >= 2, `${classification}: nur ${count} Pattern(s)`);
  }
});

test('Pool: ein granularer Treffer nennt seine eigene Id', () => {
  const cases = [
    ['baue ein browser-spiel', 'build-game'],
    ['richte ci ein', 'setup-ci'],
    ['migriere die config', 'migrate'],
    ['pruefe die sicherheit', 'security-audit'],
    ['welche dateien gibt es', 'list-files'],
    ['vergleiche beide varianten', 'compare-options'],
  ];
  for (const [text, id] of cases) {
    const resolved = resolveIntent(text, RULES);
    assert.equal(resolved.patternId, id, `${text} → ${resolved.patternId}`);
    assert.equal(resolved.reason, 'MATCHED');
  }
});

// ── 7. Die semantische Schicht: Merkmale belegen, sie erfinden nicht ────────

test('Merkmale: der Text wird eingeordnet, ohne Modell', () => {
  assert.deepEqual(textFeatures('bau das und danach teste es'), ['imperativ', 'mehrschritt']);
  assert.deepEqual(textFeatures('ueber wochen jeden tag'), ['ziel']);
  assert.deepEqual(textFeatures('fix das in packages/prompter/index.js'), ['imperativ', 'pfad']);
  assert.deepEqual(textFeatures('schau `const x = 1` an'), ['code']);
  assert.deepEqual(textFeatures('ich bin genervt davon'), ['emotion']);
  assert.deepEqual(textFeatures('ist das richtig?'), ['frage']);
  assert.deepEqual(textFeatures(''), []);
});

test('Merkmale: ohne Phrase bleibt es UNDEFINED — Marker allein sind kein Auftrag', () => {
  // „struktur duplikat modul“ sind die Begriffsmarker von `refactor`. Sie
  // beschreiben ein Thema, keinen Auftrag — und ein Thema ist keine Handlung.
  const resolved = resolveIntent('struktur duplikat modul', RULES);
  assert.equal(resolved.classification, UNDEFINED);
  assert.equal(resolved.matched, false);
  assert.deepEqual(resolved.features, []);
});

test('Merkmale: ein zutreffendes Merkmal staerkt den vorhandenen Treffer', () => {
  const ohne = resolveIntent('refaktoriere', RULES);
  const mit = resolveIntent('refaktoriere den code und danach teste alles', RULES);
  assert.ok(mit.score > ohne.score, `${mit.score} > ${ohne.score}`);
  assert.ok(mit.features.includes('mehrschritt'));
  assert.equal(mit.patternId, 'refactor');
  // Die reine Trefferzahl bleibt die Untergrenze: ein Merkmal zaehlt nur dazu.
  assert.ok(ohne.score >= 1);
});

// ── 8. Erfahrung: Gewichte aus der Gesamtlaufzeit ───────────────────────────

test('Gewichte: ein gedaempftes Pattern ist kein Treffer mehr', () => {
  const ohne = resolveIntent('refaktoriere den prompter gruendlich', RULES);
  assert.equal(ohne.patternId, 'refactor');
  assert.equal(ohne.bias, 1);

  const gedaempft = resolveIntent('refaktoriere den prompter gruendlich', RULES, { weights: { refactor: 0.5 } });
  assert.equal(gedaempft.classification, UNDEFINED, 'zu viel Korrektur: das Pattern traegt nicht mehr');
  assert.equal(gedaempft.matched, false);
});

test('Gewichte: innerhalb einer Klasse entscheidet die Erfahrung', () => {
  const pair = {
    patterns: [
      { id: 'a', label: 'A', trigger: ['alpha'], classification: 'TRANSFORM', expansion: '' },
      { id: 'b', label: 'B', trigger: ['beta'], classification: 'TRANSFORM', expansion: '' },
    ],
  };
  // Ohne Erfahrung gewinnt die erste Zeile (stabile Reihenfolge, kein Zufall).
  assert.equal(resolveIntent('alpha beta', pair).patternId, 'a');
  // Mit Erfahrung gewinnt das staerkere Pattern — und nennt seinen Faktor.
  const gelernt = resolveIntent('alpha beta', pair, { weights: { b: 1.3 } });
  assert.equal(gelernt.patternId, 'b');
  assert.equal(gelernt.bias, 1.3);
  // Die Klasse bleibt dieselbe: Erfahrung verschiebt die Wahl, nicht den Rang.
  assert.equal(gelernt.classification, 'TRANSFORM');
});

test('Gewichte: die Prioritaet bleibt fest — Erfahrung kippt keine Klasse', () => {
  const pair = {
    patterns: [
      { id: 'reden', label: 'Chat', trigger: ['hallo'], classification: 'CHAT', expansion: '' },
      { id: 'bauen', label: 'Bau', trigger: ['bau mal'], classification: 'MULTI_STEP_TASK', expansion: 'x' },
    ],
  };
  // Beide tragen (Faktor ≥ 1): die Klasse entscheidet die Prioritaet, nicht das Gewicht.
  const resolved = resolveIntent('hallo, bau mal was', pair, { weights: { reden: 1.35, bauen: 1.1 } });
  assert.equal(resolved.classification, 'MULTI_STEP_TASK', 'der staerkere Auftrag gewinnt weiterhin');
  // Ein bis unter die Schwelle gedaempftes Pattern ist dagegen KEIN Treffer —
  // dann bleibt die schwaechere Klasse uebrig (der eigene Daempfungsfall oben).
  const gedaempft = resolveIntent('hallo, bau mal was', pair, { weights: { bauen: 0.65 } });
  assert.equal(gedaempft.classification, 'CHAT');
});

test('Gewichte: derselbe Text mit denselben Gewichten ergibt dieselbe Antwort', () => {
  const weights = { refactor: 1.2, tests: 0.9 };
  const first = resolveIntent('refaktoriere und schreib tests', RULES, { weights });
  const second = resolveIntent('refaktoriere und schreib tests', RULES, { weights });
  assert.deepEqual(first, second);
  assert.equal(first.classification, 'MULTI_STEP_TASK');
});

// ── 9. Fassung 3: der Pool ist granular (92 Muster) ────────────────────────

test('Pool: deutlich mehr als 40 Muster, jede der fünf Klassen breit vertreten', () => {
  assert.ok(RULES.patterns.length >= 80, `nur ${RULES.patterns.length} Patterns`);
  for (const classification of INTENT_CLASSES) {
    const count = RULES.patterns.filter((pattern) => pattern.classification === classification).length;
    assert.ok(count >= 5, `${classification}: nur ${count} Pattern(s)`);
  }
  // Eine Frage und ein Gruß tragen NIE einen Auftragsblock.
  for (const pattern of RULES.patterns) {
    if (pattern.classification === 'CHAT' || pattern.classification === 'LOOKUP') {
      assert.equal(pattern.expansion, '', `${pattern.id}: ${pattern.classification} erweitert nicht`);
    }
  }
});

test('Pool: feine Muster treffen feine Texte — eine eigene Id je Absicht', () => {
  const cases = [
    ['debugge den fehler im parser', 'debug'],
    ['repariere die tests in scoring', 'fix-tests'],
    ['typisiere die schnittstelle', 'add-types'],
    ['loesche den toten pfad', 'delete-code'],
    ['mail versenden fuer die bestellung', 'mail'],
    ['baue den hintergrundjob', 'background-job'],
    ['beobachte die laufzeit ueber tage', 'watch'],
    ['fass zusammen was sich geaendert hat', 'lookup-summary'],
  ];
  for (const [text, id] of cases) {
    const resolved = resolveIntent(text, RULES);
    assert.equal(resolved.patternId, id, `${text} → ${resolved.patternId}`);
  }
});

// ── 10. Das Lexikon: gelernte Semantik verschiebt das Gewicht ──────────────

test('Lexikon: derselbe Text traegt mehr, wenn die Begriffe gelernt sind', () => {
  const text = 'parser schreiben fuer die datei';
  const lexicon = {
    parser: { classification: 'MULTI_STEP_TASK', confidence: 1, total: 4 },
    datei: { classification: 'MULTI_STEP_TASK', confidence: 0.8, total: 4 },
  };
  const ohne = resolveIntent(text, RULES);
  const mit = resolveIntent(text, RULES, { lexicon });
  assert.equal(ohne.patternId, 'parser');
  assert.equal(mit.patternId, 'parser');
  assert.equal(ohne.semantic, 0);
  assert.ok(mit.semantic > 0, 'das Lexikon stuetzt den Treffer');
  assert.ok(mit.score > ohne.score, `${mit.score} > ${ohne.score}`);
});

test('Lexikon: ein fremdes Begriffsfeld stuetzt nicht — und erfindet keinen Treffer', () => {
  const lexicon = {
    parser: { classification: 'TRANSFORM', confidence: 1, total: 4 },
  };
  // Die gleiche Klasse, die das Muster traegt: es gibt nichts zu stuetzen.
  const fremd = resolveIntent('parser schreiben fuer die datei', RULES, { lexicon });
  assert.equal(fremd.semantic, 0);
  // Ohne Phrase bleibt es UNDEFINED — auch mit noch so sicherem Lexikon.
  const ohnePhrase = resolveIntent('parser datei', RULES, { lexicon });
  assert.equal(ohnePhrase.classification, UNDEFINED);
  assert.equal(ohnePhrase.matched, false);
});

test('Lexikon: die Klassenprioritaet bleibt fest — Semantik kippt keine Klasse', () => {
  const lexicon = { chat: { classification: 'CHAT', confidence: 1, total: 8 } };
  const resolved = resolveIntent('hallo, schreib tests fuer scoring', RULES, { lexicon });
  assert.equal(resolved.classification, 'MULTI_STEP_TASK');
});

test('Lexikon: kaputte oder fehlende Profile sind kein Fehler', () => {
  const mitNull = resolveIntent('schreib tests', RULES, { lexicon: null });
  assert.equal(mitNull.classification, 'MULTI_STEP_TASK');
  const kaputt = resolveIntent('schreib tests', RULES, { lexicon: { tests: 'nein' } });
  assert.equal(kaputt.classification, 'MULTI_STEP_TASK');
  assert.equal(kaputt.semantic, 0);
});

// ── 11. Die feineren Merkmale ──────────────────────────────────────────────

test('Merkmale: Dringlichkeit, Bestand und Abwaegung sind eigene Merkmale', () => {
  assert.ok(textFeatures('mach das bitte sofort').includes('dringend'));
  assert.ok(textFeatures('der fehler ist wieder da').includes('bestand'));
  assert.ok(textFeatures('lieber variante b statt a').includes('entscheidung'));
  // Und sie erzeugen weiterhin keinen Treffer.
  assert.equal(resolveIntent('sofort lieber wieder', RULES).matched, false);
});
