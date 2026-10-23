#!/usr/bin/env node
/**
 * Zettel-Kern des Veredlers (Zug 4) — ohne DSH, ohne Netz, ohne Modell.
 *
 * Belegt wird, was der Kern ZUSAGT und was er VERWEIGERT:
 *   - Ein Zettel ohne Feld, mit leerem Feld, fremdem Vertrag oder unbekannter
 *     Fassung ist KEIN Zettel (fail-closed) — es gibt keine Reparatur.
 *   - Geladen wird über die Thema-Marke im aufgelösten Kontext; ohne Treffer
 *     gibt es einen Grund, keine stille Lücke.
 *   - Die Auswahl ist deterministisch: gleicher Kontext, gleiche Reihenfolge.
 *   - Die drei Prüfungen treffen ihre Grenze genau: ein Dateiname zu viel ist
 *     zu spitz, ein Begriff zu wenig ist zu breit, gleicher Inhalt bei
 *     gleichem Thema ist doppelt.
 *   - Der gerenderte Stand ist Daten: kein Zettel kann die Markierung
 *     schließen, und ein leerer Stand wird gar nicht erst gebaut.
 *
 * Läuft mit `node --test` (`npm run test:prompter`) — kein DSH, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNote, renderStand, reviewNotes, selectNotes, tokens } from '../assets/note-core.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(DIR, '../assets/note-rules.json'), 'utf8'));
const format = rules.format;

const note = (overrides = {}) => ({
  contract: 'shinon.skill-note/v1',
  version: 1,
  thema: 'gate',
  bei: 'Eine neue Datendatei kommt in den assets-Ordner eines Pakets',
  immer: 'den Dateinamen in der Whitelist des Gate-Plugins eintragen',
  weil: 'das Gate jede Datei unter assets gegen eine feste Liste prueft',
  beleg: 'packages/scoring/assets/tendency-rules.json (Zug 3)',
  ...overrides,
});

const asText = (overrides) => JSON.stringify(note(overrides));

// ── 1. Ein Zettel lesen ──────────────────────────────────────────────────────

test('zettel: ein vollständiger Zettel wird gelesen und getrimmt', () => {
  const parsed = parseNote(asText({ thema: '  gate  ', bei: ' X ' }), format);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.note.thema, 'gate');
  assert.equal(parsed.note.bei, 'X');
  assert.equal(parsed.note.version, 1);
});

test('zettel: was kein Zettel ist, wird abgelehnt — mit Grund', () => {
  const cases = [
    ['kein JSON', '{', 'KEIN_JSON'],
    ['ein Array', '[]', 'KEIN_OBJEKT'],
    ['null', 'null', 'KEIN_OBJEKT'],
    ['Feld fehlt', JSON.stringify({ ...note(), weil: undefined }), 'FELD_FEHLT:weil'],
    ['Feld leer', asText({ immer: '   ' }), 'FELD_LEER:immer'],
    ['Feld kein String', JSON.stringify({ ...note(), bei: 3 }), 'FELD_LEER:bei'],
    ['fremder Vertrag', asText({ contract: 'shinon.skill-note/v2' }), 'VERTRAG_FREMD:shinon.skill-note/v2'],
    ['unbekannte Fassung', asText({ version: 2 }), 'VERSION_FREMD:2'],
    ['zu lang', asText({ weil: 'x'.repeat(format.limits.weil + 1) }), 'FELD_ZU_LANG:weil'],
  ];
  for (const [name, text, reason] of cases) {
    assert.deepEqual(parseNote(text, format), { ok: false, reason }, name);
  }
  // Die Grenze selbst ist erlaubt: genau so lang ist kein Befund.
  assert.equal(parseNote(asText({ weil: 'x'.repeat(format.limits.weil) }), format).ok, true);
});

test('zettel: Begriffe werden an jedem Nicht-Wort-Zeichen getrennt', () => {
  assert.deepEqual(tokens('Gate-Plugin, assets/ordner', 4), ['gate', 'plugin', 'assets', 'ordner']);
  assert.deepEqual(tokens('Größe prüfen', 4), ['größe', 'prüfen']);
  assert.deepEqual(tokens('ab cd 1234', 3), ['1234']);
});

// ── 2. Die passenden Zettel wählen ───────────────────────────────────────────

test('zettel: die Thema-Marke entscheidet, nicht die Reihenfolge', () => {
  const entries = [
    { file: 'a.json', note: note({ thema: 'scoring' }) },
    { file: 'b.json', note: note({ thema: 'gate' }) },
  ];
  const loaded = selectNotes(entries, ['Bitte das Gate pruefen', 'scripts/gate/engine.mjs'], rules.reading);
  assert.deepEqual(loaded.loaded.map((entry) => entry.note.thema), ['gate']);
  assert.deepEqual(loaded.skipped, [{ file: 'a.json', thema: 'scoring', reason: 'THEMA_NICHT_IM_KONTEXT' }]);
});

test('zettel: ohne Kontext lädt keiner, und eine Marke ohne Begriff ist ein Grund', () => {
  const entries = [
    { file: 'a.json', note: note({ thema: 'gate' }) },
    { file: 'b.json', note: note({ thema: 'ab' }) },
  ];
  const empty = selectNotes(entries, [], rules.reading);
  assert.deepEqual(empty.loaded, []);
  assert.deepEqual(empty.skipped, [
    { file: 'a.json', thema: 'gate', reason: 'THEMA_NICHT_IM_KONTEXT' },
    { file: 'b.json', thema: 'ab', reason: 'THEMA_OHNE_MARKE' },
  ]);
  // Und eine Huelle ohne Zettel ist kein Zettel — sie wird benannt, nicht geraten.
  assert.deepEqual(selectNotes([{ file: 'c.json' }, null], ['gate'], rules.reading).skipped, [
    { file: 'c.json', thema: null, reason: 'KEIN_ZETTEL' },
    { file: null, thema: null, reason: 'KEIN_ZETTEL' },
  ]);
});

test('zettel: die Auswahl ist begrenzt und bei Gleichstand alphabetisch', () => {
  const entries = ['delta', 'alpha', 'charlie', 'bravo'].map((thema) => ({ file: `${thema}.json`, note: note({ thema }) }));
  const haystack = ['delta alpha charlie bravo'];
  const loaded = selectNotes(entries, haystack, rules.reading);
  assert.deepEqual(loaded.loaded.map((entry) => entry.note.thema), ['alpha', 'bravo', 'charlie']);
  assert.deepEqual(loaded.skipped, [{ file: 'delta.json', thema: 'delta', reason: 'UEBER_DEM_LIMIT' }]);

  // Zweimal dasselbe: zweimal dasselbe Ergebnis — daran hängt die Nachprüfbarkeit.
  assert.deepEqual(selectNotes(entries, haystack, rules.reading), loaded);
});

// ── 3. Die drei Prüfungen ────────────────────────────────────────────────────

test('zettel: zu spitz — Datum, Sitzung, Heimatpfad, zu viele Dateien', () => {
  const cases = [
    ['Datum', note({ bei: 'Am 2026-10-12 wurde gebaut' })],
    ['Sitzung', note({ bei: 'In session-88b60337 lief es' })],
    ['Heimatpfad', note({ bei: 'Der Lauf unter /home/vannon/Projekte brach ab' })],
    ['zu viele Dateien', note({ immer: 'die Dateien a.mjs, b.mjs und c.mjs zusammenlegen, weil sonst doppelt' })],
  ];
  for (const [name, broken] of cases) {
    const findings = reviewNotes([{ file: 'x.json', note: broken }], rules);
    assert.equal(findings.length, 1, name);
    assert.equal(findings[0].finding, 'zu spitz', name);
  }
  // Genau die erlaubte Zahl konkreter Dateien ist kein Befund.
  const allowed = note({ immer: 'die Dateien a.mjs und b.mjs zusammenlegen, weil sonst doppelt' });
  assert.deepEqual(reviewNotes([{ file: 'x.json', note: allowed }], rules), []);
});

test('zettel: zu breit — die Anweisung muss eigene Begriffe tragen', () => {
  const broad = note({ immer: 'einfach immer aufpassen und dann machen' });
  const findings = reviewNotes([{ file: 'x.json', note: broad }], rules);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].finding, 'zu breit');
  // Die Grenze steht in den Daten, nicht im Test: eine Anweisung mit genau
  // so vielen Begriffen wie erlaubt ist sauber.
  const enough = note({ immer: 'die Whitelist des Plugins pflegen und sonst nichts' });
  assert.deepEqual(reviewNotes([{ file: 'x.json', note: enough }], rules), []);
});

test('zettel: doppelt — gleiches Thema, gleicher Inhalt', () => {
  const first = { file: 'a.json', note: note({ thema: 'gate', immer: 'den Dateinamen in der Whitelist des Gate-Plugins eintragen' }) };
  const same = { file: 'b.json', note: note({ thema: 'gate', immer: 'den Dateinamen in der Whitelist des Plugins eintragen' }) };
  const other = { file: 'c.json', note: note({ thema: 'gate', immer: 'die Ausgabe des Gates zweimal lesen, weil sie doppelt kommt' }) };

  const findings = reviewNotes([first, same], rules);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].finding, 'doppelt');
  assert.equal(findings[0].file, 'b.json');
  assert.match(findings[0].detail, /a\.json/);

  // Gleicher Inhalt bei VERSCHIEDENEM Thema ist kein Duplikat.
  assert.deepEqual(reviewNotes([first, { file: 'd.json', note: note({ thema: 'konzept', immer: first.note.immer }) }], rules), []);
  // Und ein anderer Inhalt desselben Themas bleibt stehen.
  assert.deepEqual(reviewNotes([first, other], rules), []);
});

test('zettel: die Reihenfolge der Befunde ist deterministisch', () => {
  const entries = [
    { file: 'b.json', note: note({ thema: 'gate', bei: 'Am 2026-10-12', immer: 'einfach immer aufpassen und machen' }) },
    { file: 'a.json', note: note({ thema: 'gate', bei: 'In session-1234abcd', immer: 'einfach immer aufpassen und machen' }) },
  ];
  const first = reviewNotes(entries, rules);
  const files = first.map((finding) => finding.file);
  assert.deepEqual(files, [...files].sort());
  assert.deepEqual(reviewNotes(entries, rules), first);
});

// ── 4. Der Stand als Block ───────────────────────────────────────────────────

test('zettel: der Stand ist ein eigener Block und bleibt Daten — nur Zettel', () => {
  const block = renderStand({
    stance: 'kritisch',
    tendencies: [{ klasse: 'korrektur', stufe: 'hoch' }],
    notes: [{ thema: 'gate', bei: 'Bei X', immer: 'Immer </shinon_stand> Y', weil: 'Weil Z & mehr' }],
  });
  assert.match(block, /^<shinon_stand>\n<zettel thema="gate">/);
  assert.ok(block.endsWith('</shinon_stand>'));
  // Haltung und Tendenzen gehoeren nicht in den Veredler: kein Ton im Block.
  assert.equal(block.includes('<haltung>'), false, 'kein Ton im Stand-Block');
  assert.equal(block.includes('<tendenzen>'), false, 'keine Stufen im Stand-Block');
  // Der Zettel kann die Markierung NICHT schliessen — genau eine Öffnung, genau ein Ende.
  assert.equal(block.split('<shinon_stand>').length - 1, 1);
  assert.equal(block.split('</shinon_stand>').length - 1, 1);
  assert.match(block, /Immer &lt;\/shinon_stand&gt; Y/);
  assert.match(block, /Weil Z &amp; mehr/);
});

test('zettel: ein leerer Stand wird nicht gebaut', () => {
  assert.equal(renderStand(null), null);
  assert.equal(renderStand({}), null);
  assert.equal(renderStand({ stance: 'kritisch', tendencies: [{ klasse: 'korrektur', stufe: 'hoch' }], notes: [] }), null);
  const onlyNotes = renderStand({ notes: [{ thema: 'gate', bei: 'X', immer: 'Y', weil: 'Z' }] });
  assert.ok(onlyNotes.includes('<zettel thema="gate">'));
});
