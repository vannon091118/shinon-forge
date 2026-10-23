/** Teil 2/2 von scoring-memory.test.mjs — Fixtures stehen in `scoring-memory-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { PACKAGES, ROOT, loadBundles, loaded, work, tempDirs, events, scoring, index, createHost, noise, realConsole, record, warnings, workCount, workDir, fixture, mount, shutdown, SESSION, sessionEvent, humanMessage, rated, answered, retracted, QUESTION, storedState } from './scoring-memory-fixtures.mjs';

test('memory: ein kaputter Index ergibt einen leeren, aber laufenden Start', async () => {
  const project = fixture('kaputt');
  const indexRoot = workDir('kaputt-index');
  const indexFile = index.indexPath(indexRoot, project);
  mkdirSync(dirname(indexFile), { recursive: true });
  writeFileSync(indexFile, 'das ist keine SQLite-Datei, sondern Text\n');

  const before = warnings().length;
  const api = await mount({ root: project, indexRoot });
  const said = warnings().slice(before);
  // Gemessen (2026-10-17): die Meldung nennt den konkreten Grund. Der Index ist
  // jetzt nur noch MIGRATIONSQUELLE — aber ob dort ein Stand lag, weiss niemand,
  // also bleibt es ein Fehler und keine stille Leere.
  assert.ok(
    said.some((line) => line.includes('nicht lesbar')),
    `der Grund muss benannt sein, nicht verschwiegen: ${JSON.stringify(said.slice(-4))}`,
  );

  // LEER, aber LAUFEND: die Tafel steht am Anfang, und ein Signal wirkt trotzdem.
  assert.deepEqual(api.scoring.scorecard().scores, { correctness: 0.5, trust: 0.5 });
  api.host.dispatch('session/event', SESSION, answered('ans-1'));
  api.host.dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  assert.equal(api.scoring.scorecard().scores.correctness, 0.56, 'der Host laeuft weiter');
  assert.equal(api.scoring.state().records.length, 1, 'im Speicher ist der Stand da');

  // Die Ablage sagt die Wahrheit ueber ihre QUELLE: ein leerer Ledger vor einem
  // unlesbaren Index ist ein Fehler und kein stilles Nichts. (Frischer Pfad, denn
  // die Ablage dieses Laufs hat inzwischen ihren eigenen, gueltigen Stand.)
  const empty = join(workDir('kaputt-ledger'), 'ledger.sqlite');
  const answer = index.createStoreService({ indexFile, ledgerFile: empty }).load(scoring.LEDGER_NAMESPACE);
  assert.equal(answer.ok, false);
  assert.match(String(answer.error), /INDEX_UNREADABLE/, 'der Grund ist unlesbar, nicht „leer"');

  // Und der Stand dieses Laufs selbst ist DAUERHAFT: er steht im Ledger, nicht
  // im kaputten Index — der Host hat ihn nach dem leeren Start aufgebaut.
  const persisted = index.createStoreService({ indexFile, ledgerFile: api.ledgerFile }).load(scoring.LEDGER_NAMESPACE);
  assert.equal(persisted.ok, true, `Stand nicht lesbar: ${persisted.error}`);
  assert.equal(persisted.state.records.length, 1, 'das Urteil steht im Ledger');
  shutdown(api);
});

// ── 5. Die Ablage traegt ihre eigene Fassung (nicht die des Index) ───────────

test('memory: die Ablage wird von ihrer eigenen Fassung verworfen, nicht vom Index', () => {
  const file = join(workDir('fassung'), 'index.sqlite');
  const ns = 'test/ns';
  const db = index.openIndex(file);
  assert.equal(index.readMemory(db, ns), null, 'eine leere Ablage ist null, kein leeres Protokoll');
  assert.equal(index.writeMemory(db, ns, { records: [{ a: 1 }, { b: 2 }], memos: [{ id: 's1' }], scorecard: { scores: {} }, notes: 3 }), 4);
  const read = index.readMemory(db, ns);
  assert.deepEqual(read.records, [{ a: 1 }, { b: 2 }], 'die Reihenfolge ueberlebt (ordinal)');
  assert.deepEqual(read.memos, [{ id: 's1' }]);
  assert.equal(read.notes, 3);
  assert.equal(read.broken, 0);

  // Eine kaputte Zeile wird GEZAEHLT und uebergangen, nicht geworfen.
  db.prepare('update memory set doc = ? where namespace = ? and ref = ?').run('kein json', ns, '1');
  const broken = index.readMemory(db, ns);
  assert.equal(broken.broken, 1);
  assert.deepEqual(broken.records, [{ a: 1 }], 'der Rest bleibt lesbar');
  db.close();

  // Ein Index-Neuaufbau (fremde Schemafassung) verwirft die ABLEITUNG — die
  // Ablage bleibt. Der Index ist aus dem Projekt wieder herstellbar, das Urteil
  // des Menschen nicht.
  const rebuilt = index.openIndex(file);
  rebuilt.prepare('update memory set doc = ? where namespace = ? and ref = ?').run(JSON.stringify({ b: 2 }), ns, '1');
  rebuilt.prepare('update meta set value = ? where key = ?').run('1', 'schema_version');
  rebuilt.close();
  const afterRebuild = index.openIndex(file);
  assert.equal(index.indexMeta(afterRebuild).schema_version, String(index.SCHEMA_VERSION));
  assert.equal(index.SCHEMA_VERSION, 2, 'eine neue Tabelle im Index erhoeht die Schemafassung');
  assert.deepEqual(index.readMemory(afterRebuild, ns).records, [{ a: 1 }, { b: 2 }], 'der Index-Neuaufbau laesst die Ablage stehen');

  // Die FASSUNG DER ABLAGE dagegen wirft sie weg — und nur sie.
  afterRebuild.prepare('update meta set value = ? where key = ?').run('99', 'memory_version');
  afterRebuild.close();
  const afterVersion = index.openIndex(file);
  assert.equal(index.readMemory(afterVersion, ns), null, 'eine alte Ablageform wird verworfen');
  assert.equal(index.indexMeta(afterVersion).memory_version, String(index.MEMORY_VERSION));
  for (const table of index.PRIMARY_TABLES) {
    assert.equal(afterVersion.prepare(`select count(*) as n from "${table}"`).get().n, 0, `${table} steht weiter`);
  }
  afterVersion.close();
});

// ── 6. Die Reihenfolge der Bundles ist keine Zusage ──────────────────────────

test('memory: auch wenn das Scoring ZUERST mountet, kommt der Stand an', async () => {
  const project = fixture('reihenfolge');
  const indexRoot = workDir('reihenfolge-index');
  const ledgerFile = join(workDir('reihenfolge-ledger'), 'ledger.sqlite');

  const first = await mount({ root: project, indexRoot, ledgerFile });
  first.host.dispatch('session/event', SESSION, answered('ans-1'));
  first.host.dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  const scored = first.scoring.scorecard();
  shutdown(first);

  // Scoring zuerst: sein `apply` findet den Dienst noch nicht. Der erste
  // Gebrauch liegt hinter allen Mounts und holt den Stand nach.
  const swapped = await mount({ root: project, indexRoot, ledgerFile, order: ['events', 'scoring', 'index'] });
  assert.deepEqual(swapped.scoring.scorecard(), scored, 'der Stand wurde nachgeholt');
  assert.equal(swapped.scoring.state().records.length, 1);
  shutdown(swapped);
});

// Am Ende die echte Konsole zurueckgeben, wie die Nachbardateien: das Stummschalten
// gilt fuer diesen Lauf, nicht fuer den Prozess.
process.on('exit', () => Object.assign(console, realConsole));

// ── 5. Der Ton als schmale Faehigkeit (Zug 5) ────────────────────────────────
//
// Der Veredler und die Persona wollen den TON lesen (Haltung, Stufen), nicht die
// Tafel. Deshalb bietet das Scoring genau EINE Operation an, und sie gibt `null`,
// solange es nichts zu sagen gibt. Dieselbe Bauform wie die Abfrage des Index:
// optional, schmal, mit geprueftem Vertragsnamen — die Namen beider Seiten pinnt
// `context-wiring.test.mjs`.

test('ton: der Stand ist eine Faehigkeit mit EINER Operation — und ohne Signal sagt sie nichts', async () => {
  const project = fixture('ton-schmal');
  const api = await mount({ root: project, indexRoot: workDir('ton-schmal-index') });

  const service = api.host.services.get(scoring.SCORING_SERVICE);
  assert.ok(service !== undefined, 'der Ton wird angeboten');
  assert.deepEqual(Object.keys(service).sort(), ['contract', 'read'], 'genau Vertragsname und EINE Operation');
  assert.equal(service.contract, scoring.SCORING_SERVICE_CONTRACT);
  // Ohne ein einziges Signal gibt es keinen Ton: `null` statt einer Haltung
  // ueber eine Lage, die es nicht gibt.
  assert.equal(service.read(), null, 'kein Signal, keine Haltung');

  // Die ERSTE Frage ist kein Signal (sie ist der Anfang, nicht eine Korrektur) —
  // der Ton bleibt also leer, bis wirklich etwas passiert ist.
  api.host.dispatch('session/event', SESSION, humanMessage(QUESTION));
  assert.equal(service.read(), null, 'eine erste Frage ist noch keine Lage');

  // Ein Urteil wiegt schwerer und traegt die Korrektur-Klasse. Es gilt einer
  // Antwort, die diese Sitzung gesehen hat (SH-LEARN-01) — also erst die
  // Antwort, dann das Urteil.
  api.host.dispatch('session/event', SESSION, answered('msg-1'));
  api.scoring.observe(
    { event_type: 'feedback.rated', session_id: 'sess-1' },
    { session_id: 'sess-1', item: { messageId: 'msg-1', rating: 'negative' } },
  );
  const read = service.read();
  assert.equal(read.signals, 1, 'das Urteil ist das erste Signal');
  assert.ok(Array.isArray(read.tendencies), 'die Stufen sind eine Liste');
  for (const entry of read.tendencies) {
    assert.equal(typeof entry.klasse, 'string');
    assert.equal(typeof entry.stufe, 'string');
    assert.equal(typeof entry.share, 'number');
  }
  // Unter der Mindestevidenz wird NICHTS behauptet — der Grund steht dabei.
  assert.equal(read.ready, false);
  assert.equal(read.stance, null);
  assert.match(read.reason, /^THIN_EVIDENCE:/);

  // Der Ton ist HERGELEITET: dieselbe Frage, dieselbe Antwort — kein Speichern.
  assert.deepEqual(service.read(), read, 'zweimal gelesen ist zweimal dasselbe');
  assert.equal(storedState(api).scorecard !== undefined, true, 'die Tafel liegt weiter in der Ablage — der Ton nicht');
  shutdown(api);
});

