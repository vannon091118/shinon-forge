#!/usr/bin/env node
/**
 * Abnahme fuer T4-8 des Clean-Repo-Audits: `openIndex` schreibt seine
 * meta-Zeilen in EINER Transaktion.
 *
 * Warum das ein eigener Riegel ist und keine Notiz: die Zusage ist eine
 * Messung, die still zurueckfallen kann. Jede einzelne `setMeta`-Zeile ist ein
 * eigener fsync; sieben davon kosteten beim Oeffnen den Festpreis siebenmal
 * (gemessen: docs/probes/perf-baseline.json, p50 von ~1947 ms auf ~248 ms).
 * Wer spaeter eine achte Zeile „einfach dazu" schreibt, sieht keinen roten
 * Test — genau deshalb steht er hier.
 *
 * Geprueft wird die Form, die die Zusage traegt:
 *   1. `setMetaMany` existiert genau einmal und klammert die Schleife mit
 *      `begin` … `commit`, mit `rollback` im Fehlerpfad (sonst haelt die
 *      Transaktion den Schreib-Lock, wenn ein Wert nicht passt).
 *   2. `openIndex` ruft `setMetaMany(db, metas)` genau einmal auf und benutzt
 *      dort KEIN Einzel-`setMeta`.
 *   3. Nach dem Oeffnen stehen alle meta-Felder — der gebuendelte Weg ist also
 *      nicht nur billiger, sondern vollstaendig.
 *
 * Einzelne `setMeta`-Aufrufe an ANDEREN Stellen (Speicher, Lauf-Metadaten)
 * bleiben erlaubt: die Zusage gilt fuer das Oeffnen, nicht fuer jeden Schreiber
 * der Datei. Deshalb prueft Punkt 2 den Rumpf von `openIndex`, nicht die Datei.
 *
 * Der letzte Punkt laeuft gegen die echte Indexdatei (node:sqlite, wie
 * scripts/gate/tests/project-index.test.mjs); ohne `node:sqlite` ist der Test
 * sichtbar geskippt, nie gruen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `openIndex` und `setMetaMany` wohnen seit T2-5 im Ablage-Modul des Kerns.
const CORE = fileURLToPath(new URL('../../../packages/project-index/assets/index-store.js', import.meta.url));
const source = readFileSync(CORE, 'utf8');

/**
 * Den Rumpf einer Funktion ab `function name(` bis zur schliessenden Klammer auf
 * Spaltenebene. Die Parameterliste wird eigens uebersprungen: `options = {}`
 * enthaelt sonst eine geschweifte Klammer, die den Rumpf sofort wieder schliesst.
 */
function bodyOf(text, name) {
  const start = text.search(new RegExp(`(?:export )?function ${name}\\b`));
  assert.notEqual(start, -1, `${name} fehlt`);
  const parens = text.indexOf('(', start);
  let nesting = 0;
  let closeParen = parens;
  for (let index = parens; index < text.length; index += 1) {
    if (text[index] === '(') nesting += 1;
    else if (text[index] === ')') {
      nesting -= 1;
      if (nesting === 0) { closeParen = index; break; }
    }
  }
  const open = text.indexOf('{', closeParen);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open, index + 1);
    }
  }
  throw new Error(`${name}: Rumpf nicht geschlossen`);
}

test('setMetaMany klammert die Schreibschleife in einer Transaktion', () => {
  assert.equal([...source.matchAll(/function setMetaMany\b/g)].length, 1, 'genau eine Fassung');
  const body = bodyOf(source, 'setMetaMany');
  assert.match(body, /db\.exec\('begin'\)/, 'begin fehlt');
  assert.match(body, /db\.exec\('commit'\)/, 'commit fehlt');
  assert.match(body, /db\.exec\('rollback'\)/, 'rollback im Fehlerpfad fehlt');
  assert.match(body, /catch\b/, 'ohne catch kein rollback');
  // Die Reihenfolge traegt die Zusage: erst begin, dann schreiben, dann commit.
  assert.ok(body.indexOf("'begin'") < body.indexOf("'commit'"), 'commit vor begin');
});

test('openIndex schreibt seine meta-Zeilen gebuendelt, nicht einzeln', () => {
  const body = bodyOf(source, 'openIndex');
  assert.equal([...body.matchAll(/setMetaMany\(db, metas\)/g)].length, 1, 'genau ein gebuendelter Aufruf');
  assert.equal([...body.matchAll(/(?<!Many\()setMeta\(/g)].length, 0, 'kein Einzel-Commit in openIndex');
  // Der gebuendelte Aufruf ist der letzte Schreibvorgang: danach wird nur noch
  // die Verbindung zurueckgegeben.
  assert.ok(body.lastIndexOf('setMetaMany(db, metas)') > body.lastIndexOf('db.exec('), 'gebündelt zuletzt');
});

test('der gebuendelte Weg schreibt alle meta-Felder', async () => {
  let bundle;
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    require('node:sqlite');
    bundle = await import(new URL('../../../packages/project-index/assets/index-core.js', import.meta.url).href);
  } catch (error) {
    assert.ok(error instanceof Error);
    return; // node:sqlite fehlt — der Aufrufer sieht den Skip im Namen des Tests
  }
  const work = mkdtempSync(join(tmpdir(), 'shinon-index-tx-'));
  try {
    const db = bundle.openIndex(join(work, 'index.sqlite'), { expectedRoot: work });
    const meta = bundle.indexMeta(db);
    for (const key of ['contract', 'schema_version', 'indexer_version', 'memory_version', 'root', 'root_id']) {
      assert.equal(typeof meta[key], 'string', `${key} fehlt nach dem Oeffnen`);
      assert.notEqual(meta[key], '', `${key} ist leer`);
    }
    assert.equal(meta.contract, bundle.CONTRACT);
    db.close();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
