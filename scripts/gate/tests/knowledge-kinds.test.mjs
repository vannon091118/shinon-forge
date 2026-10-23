#!/usr/bin/env node
/**
 * knowledge-kinds.test.mjs — die vier Wissensarten sind getrennt und begrenzt.
 *
 * SH-LEARN-02 verlangt nicht ein neues Backend, sondern die Trennung, die
 * schon gebaut ist, NACHWEISBAR zu machen: Nutzer-Memory, Projekt-Memory,
 * prozedurale Skills und das episodische Archiv haben je einen Eigentuemer,
 * eine Ablage und eine harte Grenze. Dieser Test liest die Registry
 * (`docs/contracts/knowledge-kinds.json`) und haelt sie gegen den Code:
 *
 *   - genau die vier Arten, jede einmal, in fester Reihenfolge,
 *   - jede Ablage ist eine andere (kein zweiter Zustand derselben Daten),
 *   - jede Grenze ist eine positive Zahl im Code oder ausdruecklich `host`,
 *   - jede Zahl stimmt mit der Konstante ueberein, die sie nennt (kein
 *     Auseinanderlaufen von Dokument und Laufzeit),
 *   - keine Art behauptet, vollstaendige Nutzlasten zu kopieren
 *     (`copyRule: compact | none`).
 *
 * Der Test laeuft ohne DSH und ohne Modell; er braucht nur den Baum.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const REGISTRY = join(ROOT, 'docs/contracts/knowledge-kinds.json');

const contract = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const KIND_IDS = ['user-memory', 'project-memory', 'procedural-skills', 'episodic-archive'];

/** Ein Pfad unter dem Baum — oder null, wenn er fehlt. */
const pathInTree = (value) => (typeof value === 'string' && existsSync(join(ROOT, value)) ? join(ROOT, value) : null);

/** Die Zahl, die der Eintrag nennt — aus JS-Konstante oder JSON-Zeiger. */
async function capFromCode(source) {
  const file = pathInTree(source?.path);
  if (file === null) return { ok: false, reason: `capSource fehlt: ${source?.path}` };
  if (typeof source.pointer === 'string') {
    let value;
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      return { ok: false, reason: `capSource nicht lesbar: ${error.message}` };
    }
    for (const key of source.pointer.split('.')) value = value?.[key];
    return Number.isInteger(value) ? { ok: true, value } : { ok: false, reason: `capSource zeigt nicht auf eine Zahl: ${source.path}#${source.pointer}` };
  }
  if (typeof source.symbol !== 'string') return { ok: false, reason: 'capSource ohne symbol/pointer' };
  let module;
  try {
    module = await import(pathToFileURL(file).href);
  } catch (error) {
    return { ok: false, reason: `capSource nicht ladbar: ${error.message}` };
  }
  const value = module[source.symbol];
  return Number.isInteger(value) ? { ok: true, value } : { ok: false, reason: `capSource exportiert keine Zahl: ${source.symbol}` };
}

test('wissensarten: die Registry traegt genau die vier Arten, jede einmal', () => {
  assert.equal(contract.contract, 'shinon.knowledge-kinds/v1');
  assert.ok(Array.isArray(contract.kinds), 'kinds fehlt');
  assert.deepEqual(contract.kinds.map((kind) => kind.id), KIND_IDS, 'vier Arten, feste Reihenfolge');
  assert.deepEqual([...new Set(contract.kinds.map((kind) => kind.id))], KIND_IDS, 'keine Doppelung');
  assert.ok(Array.isArray(contract.rules) && contract.rules.length >= 4, 'die Regeln stehen im Vertrag');
});

test('wissensarten: jede Art hat Eigentuemer, Ablage, Leseweg und eine Kopierregel', () => {
  for (const kind of contract.kinds) {
    const who = kind.id;
    assert.equal(typeof kind.label, 'string', `${who}: label fehlt`);
    assert.equal(typeof kind.owner, 'string', `${who}: owner fehlt`);
    const hostOwned = kind.owner.startsWith('@');
    assert.ok(hostOwned || pathInTree(kind.owner) !== null, `${who}: Eigentuemer ${kind.owner} existiert nicht`);
    assert.equal(typeof kind.store, 'string', `${who}: store fehlt`);
    assert.equal(typeof kind.query, 'string', `${who}: query fehlt`);
    assert.equal(typeof kind.contents, 'string', `${who}: contents fehlt`);
    assert.ok(['compact', 'none'].includes(kind.copyRule), `${who}: copyRule muss compact oder none sein`);
    if (kind.copyRule === 'none') {
      assert.equal(kind.cap, 'host', `${who}: nur die Host-Ablage darf ohne eigene Grenze bestehen`);
    }
  }
});

test('wissensarten: keine Ablage doppelt, und die Grenzen sind Zahlen oder host', () => {
  const stores = new Set();
  for (const kind of contract.kinds) {
    assert.equal(stores.has(kind.store), false, `${kind.id}: Ablage doppelt (${kind.store})`);
    stores.add(kind.store);
    if (kind.cap === 'host') {
      assert.equal(kind.capSource, undefined, `${kind.id}: host-Ablage braucht keine capSource`);
      assert.match(kind.note ?? '', /host|DSH/, `${kind.id}: host-Grenze braucht einen benannten Eigentuemer`);
      continue;
    }
    assert.ok(Number.isInteger(kind.cap) && kind.cap > 0, `${kind.id}: cap muss eine positive Zahl sein`);
    assert.ok(kind.capSource && typeof kind.capSource === 'object', `${kind.id}: capSource fehlt`);
  }
});

test('wissensarten: jede Zahl in der Registry ist die Zahl im Code', async () => {
  for (const kind of contract.kinds) {
    if (kind.cap === 'host') continue;
    const found = await capFromCode(kind.capSource);
    assert.equal(found.ok, true, `${kind.id}: ${found.reason ?? 'capSource ungueltig'}`);
    assert.equal(found.value, kind.cap, `${kind.id}: Registry sagt ${kind.cap}, Code sagt ${found.value}`);
  }
});

test('wissensarten: Scoring und Narrative sind keine Wissensspeicher', () => {
  // Die Signale sind eine Wertung, keine Erinnerung; der Narrativ-Zustand ist
  // eine kompakte Ableitung, kein Archiv. Wer sie hier eintruege, haette einen
  // fuenften Speicher ohne Eigentuemer und ohne Grenze.
  const owners = contract.kinds.map((kind) => kind.owner);
  assert.equal(owners.some((owner) => owner.includes('packages/scoring')), false);
  assert.equal(owners.some((owner) => owner.includes('packages/narrative')), false);
  const rule = contract.rules.join(' ');
  assert.match(rule, /Scoring liefert Feedbacksignale/);
  assert.match(rule, /Narrative/);
});

test('wissensarten: kein Zustand kopiert die Nutzlast des Archivs', () => {
  // Die Chronik des Narrativ-Kerns traegt Kennung, Typ und Zeitstempel — nicht
  // das Ereignis. Die Scoring-Zeile traegt die Laenge des Textes, nicht den
  // Text. Beides ist hier am Quelltext gepinnt, damit eine spaetere
  // "ist doch praktisch"-Aenderung den Vertrag bricht und auffaellt.
  const narrative = readFileSync(join(ROOT, 'packages/narrative/assets/narrative-core.js'), 'utf8');
  assert.match(narrative, /export function compactEvent/, 'die Chronik braucht eine Kompaktierung');
  assert.equal(/const entry = \{ \.\.\.event/.test(narrative), false, 'die Chronik kopiert das ganze Ereignis');
  const scoring = readFileSync(join(ROOT, 'packages/scoring/assets/signal-translate.js'), 'utf8');
  assert.equal(/detail = \{ \.\.\.detail, text \}/.test(scoring), false, 'die Scoring-Zeile traegt den Prompt-Text');
  assert.match(scoring, /chars: text\.length/, 'die Scoring-Zeile traegt die Laenge');
});
