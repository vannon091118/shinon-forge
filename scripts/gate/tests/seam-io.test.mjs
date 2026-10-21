#!/usr/bin/env node
/**
 * Der kanonische I/O-Pfad: EIN Format fuer Lesen, Schreiben und Injizieren.
 *
 * ANLASS (gemessen 2026-10-21): die Host-Haelften schrieben direkt — 47
 * fs-Aufrufe und 177 verstreute Log-Ausgaben ueber die Pakete hinweg. Wer
 * wissen wollte, "was hat der Host gelesen und geschrieben", musste die
 * Quellen lesen statt die Logs.
 *
 * DER KANAL: eine benannte Funktion, die jeden I/O-Vorgang als Datensatz
 * beschreibt und daraus EINE Protokollzeile baut. Die drei Kinds unterscheiden
 * sich im `kind`, sonst in nichts — ein Kanal mit drei Formaten waere wieder
 * drei Kanaele.
 *
 * DIE ZUSAGE, die dieser Test pinnt:
 *   (a) die Zeile ist fuer alle drei Kinds dieselbe Form,
 *   (b) die Zeile ist maschinell lesbar (key=value, praefix),
 *   (c) unvollstaendige Angaben werden ABGELEHNT, nicht geraten,
 *   (d) die Spine-Nutzlast ist ein Fragment — der Envelope bleibt geschlossen.
 *
 * Laeuft mit `node --test`; braucht kein node_modules (die Kern-Dateien sind
 * importfrei).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { dshRoot } from '../../lib/yaml.mjs';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';

const io = await import(new URL('../../../packages/seams/assets/io-path.js', import.meta.url).href);
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const IO_CORE = fileURLToPath(new URL('../../../packages/seams/assets/io-path.js', import.meta.url));

/** Alle Host-Halften: index.js je Paket und die assets/*.js darunter. */
function hostDateien(root = REPO_ROOT) {
  const dateien = [];
  for (const eintrag of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
    if (!eintrag.isDirectory()) continue;
    const basis = join(root, 'packages', eintrag.name);
    const datei = join(basis, 'index.js');
    try {
      readFileSync(datei, 'utf8');
      dateien.push(datei);
    } catch { /* kein index.js — nur die assets zaehlen */ }
    const assets = join(basis, 'assets');
    let kinder = [];
    try {
      kinder = readdirSync(assets, { withFileTypes: true });
    } catch { /* kein assets-Ordner */ }
    for (const kind of kinder) {
      if (kind.isFile() && kind.name.endsWith('.js')) dateien.push(join(assets, kind.name));
    }
  }
  return dateien;
}

/** Ein gueltiger Vorgang — die drei Kinds unterscheiden sich nur im `kind`. */
function vorgang(kind = 'read') {
  return {
    kind,
    quelle: 'packages/persona/index.js',
    ziel: 'shinon/event',
    umfang: 42,
    grund: 'Ereignis gelesen',
    zeitpunkt: '2026-10-21T07:00:00+02:00',
    trace_id: 'trc_abcdef012345',
  };
}

test('alle drei Kinds benutzen dieselbe Form', () => {
  const zeilen = ['read', 'write', 'inject'].map((kind) => {
    const beschrieben = io.describeIo(vorgang(kind));
    assert.equal(beschrieben.ok, true, `der Vorgang ${kind} wurde abgelehnt: ${beschrieben.reason}`);
    const zeile = io.ioLogLine(beschrieben.record);
    assert.equal(zeile.ok, true, `die Zeile fuer ${kind} wurde abgelehnt: ${zeile.reason}`);
    return zeile.line;
  });
  // Der Aufbau ist derselbe: nur der `kind` unterscheidet sich.
  for (const zeile of zeilen) {
    assert.match(zeile, /^\[shinon-io\] kind=/);
    assert.match(zeile, /quelle=/);
    assert.match(zeile, /ziel=/);
    assert.match(zeile, /umfang=\d+/);
    assert.match(zeile, /grund=/);
    assert.match(zeile, /zeitpunkt=/);
    assert.match(zeile, /trace_id=/);
  }
  // Und die Feldreihenfolge ist dieselbe.
  const felder = zeilen.map((zeile) => zeile.split(' ').map((teil) => teil.split('=')[0]).join(','));
  assert.equal(felder[0], felder[1]);
  assert.equal(felder[1], felder[2]);
});

test('die Zeile ist maschinell lesbar — Werte mit Leerzeichen brechen sie nicht', () => {
  const beschrieben = io.describeIo({ ...vorgang(), quelle: 'ein pfad mit leerzeichen.js', grund: 'ein Grund: mit Doppelpunkt' });
  assert.equal(beschrieben.ok, true);
  const zeile = io.ioLogLine(beschrieben.record);
  assert.equal(zeile.ok, true);
  // Der Wert steht in Anfuehrungszeichen (JSON) — ein Leerzeichen trennt die
  // Felder nicht.
  assert.match(zeile.line, /quelle="ein pfad mit leerzeichen\.js"/);
  assert.match(zeile.line, /grund="ein Grund: mit Doppelpunkt"/);
});

test('unvollstaendige Angaben werden abgelehnt, nicht geraten', () => {
  const faelle = [
    ['kein Objekt', null, 'IO_EINGABE'],
    ['falsches Kind', { ...vorgang(), kind: 'lesen' }, 'IO_KIND'],
    ['leere Quelle', { ...vorgang(), quelle: '' }, 'IO_QUELLE'],
    ['leeres Ziel', { ...vorgang(), ziel: '' }, 'IO_ZIEL'],
    ['negativer Umfang', { ...vorgang(), umfang: -1 }, 'IO_UMFANG'],
    ['kein Umfang', { ...vorgang(), umfang: 'viel' }, 'IO_UMFANG'],
    ['leerer Grund', { ...vorgang(), grund: '' }, 'IO_GRUND'],
    ['kein Zeitpunkt', { ...vorgang(), zeitpunkt: 'irgendwann' }, 'IO_ZEITPUNKT'],
  ];
  for (const [name, eingabe, praefix] of faelle) {
    const beschrieben = io.describeIo(eingabe);
    assert.equal(beschrieben.ok, false, `${name} wurde angenommen`);
    assert.match(beschrieben.reason, new RegExp(`^${praefix}`), `${name}: ${beschrieben.reason}`);
  }
});

test('logIo schreibt die Zeile in den Sink — und faellt ohne ihn auf die Konsole', () => {
  const gesammelt = [];
  const ergebnis = io.logIo(vorgang('inject'), (zeile) => gesammelt.push(zeile));
  assert.equal(ergebnis.ok, true);
  assert.equal(gesammelt.length, 1);
  assert.match(gesammelt[0], /^\[shinon-io\] kind="inject"/);
});

test('logIo lehnt einen unvollstaendigen Vorgang ab, ohne zu schreiben', () => {
  const gesammelt = [];
  const ergebnis = io.logIo({ kind: 'read' }, (zeile) => gesammelt.push(zeile));
  assert.equal(ergebnis.ok, false);
  assert.equal(gesammelt.length, 0, 'es wurde nichts geschrieben');
});

test('die Spine-Nutzlast ist ein FRAGMENT — kein neuer Event-Typ', () => {
  const beschrieben = io.describeIo(vorgang());
  const nutzlast = io.ioSpinePayload(beschrieben.record);
  assert.equal(nutzlast.ok, true);
  // Die Nutzlast traegt die I/O-Angaben; sie ist KEIN Envelope. Der Envelope
  // bleibt geschlossen (acht Felder), die Nutzlast ist offen — genau der
  // Unterschied, den validateEnvelope bereits macht.
  assert.equal(typeof nutzlast.payload, 'object');
  assert.equal(nutzlast.payload.kind, 'read');
  assert.equal(nutzlast.payload.trace_id, 'trc_abcdef012345');
  assert.equal(nutzlast.payload.event_type, undefined, 'die Nutzlast vergibt keinen Event-Typ');
  assert.equal(nutzlast.payload.event_id, undefined, 'die Nutzlast vergibt keinen Envelope');
});

test('der Vertrag und die Kinds sind benannt', () => {
  assert.equal(io.IO_CONTRACT, 'shinon.io/v1');
  assert.deepEqual([...io.IO_KINDS], ['read', 'write', 'inject']);
});

// ── Der Spine-Transport: die Nutzlast reist, der Envelope bleibt geschlossen ──

test('ioSpineEnvelope baut einen VALIDEN Envelope — ohne neuen Event-Typ', async () => {
  // Die echte Events-Bibliothek: der Envelope kommt aus `buildEnvelope`, und
  // `validateEnvelope` ist der Vertrags-Gate. Beides ist der BEWEIS, dass der
  // I/O-Datensatz als Nutzlast-Fragment reist und der Vertrag unveraendert bleibt.
  const events = await import(new URL('../../../packages/events/index.js', import.meta.url).href);
  const contract = events.loadContract('./assets/event-spine.json');
  const typenVorher = Object.keys(contract.events).length;

  const beschrieben = io.describeIo({ ...vorgang(), trace_id: 'trc_abcdef012345' });
  const gebaut = io.ioSpineEnvelope(beschrieben.record, {
    buildEnvelope: events.buildEnvelope,
    contract,
    eventType: 'message.received',
    source: 'dsh.message',
    sessionId: 'sess-io-1',
    timestamp: '2026-10-21T07:00:00.000Z',
    payload: { session_id: 'sess-io-1' },
  });
  assert.equal(gebaut.ok, true, `der Envelope wurde nicht gebaut: ${gebaut.reason}`);

  // Der Envelope besteht das Contract-Gate der echten Bibliothek.
  const befunde = events.validateEnvelope(gebaut.envelope, {
    contract,
    eventType: 'message.received',
    payload: gebaut.payload,
    source: 'dsh.message',
  });
  assert.deepEqual(befunde, [], `der Envelope verletzt den Vertrag: ${befunde.join(', ')}`);

  // Die trace_id des Datensatzes ist die des Envelopes: Zeile und Ereignis
  // stehen in EINER Kette.
  assert.equal(gebaut.envelope.trace_id, 'trc_abcdef012345');
  assert.equal(gebaut.payload.io.trace_id, 'trc_abcdef012345');

  // Und der Vertrag ist unveraendert: kein neuer Typ, keine neue Signalpfade.
  assert.equal(Object.keys(contract.events).length, typenVorher);
  assert.equal(contract.events['io.read'], undefined, 'es gibt keinen neuen Event-Typ');
});

// ── Die echte Persona: der Lesepfad protokolliert am echten Dienst ───────────

/**
 * Die Persona als Bundle im Isolat — mit dem echten Seam-Kern daneben
 * (die Host-Haelfte importiert `@shinon/seams/core`, also muss der Kern da
 * liegen) und dem echten Schemastery der gepinnten DSH-Installation.
 */
async function personaBundle() {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Persona-Prompt-Test');
  const require = createRequire(join(root, 'package.json'));
  const work = mkdtempSync(join(tmpdir(), 'shinon-seam-io-'));
  const dir = join(work, 'pkg');
  cpSync(join(REPO_ROOT, 'packages/persona'), dir, { recursive: true });
  provideSeamCore(dir);
  const shim = join(dir, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  return {
    bundle: await import(pathToFileURL(join(dir, 'index.js')).href),
    require,
  };
}

test('die Persona protokolliert ihren LESEZWEIG — am echten Dienst, mit der trace_id des Ereignisses', async () => {
  const { bundle, require } = await personaBundle();
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
  const { default: SystemPrompt } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')).href);
  const events = await import(new URL('../../../packages/events/index.js', import.meta.url).href);

  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  const gesprochen = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    await ctx.plugin(bundle, {
      projectContextPath: '',
      workspaceRoot: REPO_ROOT,
      identity: 'SEAM-IO-MARKE',
      includeAugenhoehe: false,
      alwaysKnowIdentity: false,
    });
  } finally {
    Object.assign(console, gesprochen);
  }
  // Die Persona ist gemountet: ihr Abschnitt steht im echten System-Prompt.
  const assembly = await ctx.systemPrompt.assemble({});
  assert.ok(
    assembly.sections.some((section) => section.name === 'shinon:identity'),
    'die Persona ist nicht am echten Dienst gemountet',
  );

  // Ein echtes Ereignis: Envelope aus dem echten Vertrag, mit echter trace_id.
  const contract = events.loadContract('./assets/event-spine.json');
  const payload = { session_id: 'sess-io-1', text: 'Hallo Welt' };
  const envelope = events.buildEnvelope(contract, {
    eventType: 'message.received',
    source: 'dsh.message',
    payload,
    sessionId: 'sess-io-1',
    timestamp: '2026-10-21T07:00:00.000Z',
  });

  // Das Log wird ABGEFANGEN — der Beweis ist die Zeile, nicht das Wissen
  // darum, dass eine entstuende.
  const zeilen = [];
  console.log = console.warn = console.error = (...args) => zeilen.push(args.map(String).join(' '));
  try {
    ctx.emit('shinon/event', envelope, payload);
  } finally {
    Object.assign(console, gesprochen);
  }

  const ioZeilen = zeilen.filter((zeile) => zeile.startsWith('[shinon-io]'));
  assert.equal(ioZeilen.length, 1, `erwartet: eine I/O-Zeile; gesehen: ${JSON.stringify(zeilen)}`);
  const zeile = ioZeilen[0];
  // Alle drei Kinds derselben Form: kind, quelle, ziel, umfang, grund, zeitpunkt.
  assert.match(zeile, /^\[shinon-io\] kind="read"/);
  assert.match(zeile, /quelle="shinon\/event"/);
  assert.match(zeile, /ziel="persona:message\.received"/);
  assert.match(zeile, /umfang=\d+/);
  assert.match(zeile, /grund="/);
  assert.match(zeile, /zeitpunkt="/);
  // Die trace_id des Ereignisses steht in der Zeile: die Kette ist geschlossen.
  assert.ok(zeile.includes(`trace_id="${envelope.trace_id}"`), `die trace_id fehlt: ${zeile}`);
});

// ── EINE Definition: der I/O-Pfad hat einen Ort, nicht zwei ─────────────────

test('der I/O-Pfad hat EINE Definition — und der Kern bleibt importfrei', () => {
  // Der Kern importiert NICHTS: nur relative Dateien im selben Paket. Das ist
  // die Eigenschaft, die den Paket-Tests in CI ohne `npm ci` zuteilkommt.
  const quelle = readFileSync(IO_CORE, 'utf8');
  const bare = [...quelle.matchAll(/^import\s[^;]*from\s+'([^']+)'/gm)]
    .map((hit) => hit[1])
    .filter((spec) => !spec.startsWith('node:') && !spec.startsWith('.'));
  assert.deepEqual(bare, [], `der I/O-Kern importiert Fremdes: ${bare.join(', ')}`);

  // Und die benannten Funktionen stehen in GENAU EINER Datei.
  const namen = ['describeIo', 'ioLogLine', 'logIo', 'logEventRead', 'ioSpinePayload', 'ioSpineEnvelope'];
  for (const name of namen) {
    const orte = hostDateien().filter((datei) => {
      const text = readFileSync(datei, 'utf8');
      return new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?function\\s+${name}\\s*\\(`).test(text);
    });
    assert.equal(orte.length, 1, `${name} ist in ${orte.length} Dateien definiert: ${orte.join(', ')}`);
  }
});
