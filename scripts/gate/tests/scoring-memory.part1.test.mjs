/** Teil 1/2 von scoring-memory.test.mjs — Fixtures stehen in `scoring-memory-fixtures.mjs`. */
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

test('memory: die Ablage ist eine zweite, schmale Faehigkeit — die Abfrage bleibt unberuehrt', async () => {
  const project = fixture('naht');
  const indexRoot = workDir('naht-index');
  const api = await mount({ root: project, indexRoot });

  // Der Host hat GENAU vier Faehigkeiten, und jede ist schmal: die Abfrage und
  // die Ablage kommen vom Index, der Ton (Zug 5) und die Gewichte (Phase 3)
  // vom Scoring. Die vierte ist angefragtes Verhalten (Gewichte für die
  // Baustein-Auswahl), keine Beigabe — siehe context-wiring (vierte Naht).
  assert.deepEqual([...api.host.services.keys()].sort(), ['shinon_block_weights', 'shinon_facts_snapshot', 'shinon_index_query', 'shinon_index_store', 'shinon_scoring_state']);
  const query = api.host.services.get(index.QUERY_SERVICE);
  assert.deepEqual(Object.keys(query).sort(), ['contract', 'resolveContext'], 'die Abfrage bleibt eine Operation');
  assert.equal(query.contract, index.QUERY_CONTRACT);
  const store = api.host.services.get(index.INDEX_STORE_SERVICE);
  assert.deepEqual(Object.keys(store).sort(), ['contract', 'load', 'save'], 'die Ablage ist genau zwei Operationen');
  assert.equal(store.contract, index.INDEX_STORE_CONTRACT);

  // Die Naht als Daten: kein Paket liest das andere, also pinnt der Test beide Seiten.
  assert.equal(scoring.INDEX_STORE_SERVICE, index.INDEX_STORE_SERVICE);
  assert.equal(scoring.INDEX_STORE_CONTRACT, index.INDEX_STORE_CONTRACT);
  assert.equal(scoring.INDEX_STORE_CONTRACT, store.contract);
  assert.equal(typeof scoring.LEDGER_NAMESPACE, 'string');
  assert.ok(scoring.LEDGER_NAMESPACE.length > 0);

  // Der Vertrag ist nicht nur ein Name: ein Dienst ohne die zwei Operationen
  // waere kein Gedaechtnis, und ein fehlender Namensraum keine Adresse.
  const direct = index.createStoreService({
    indexFile: join(workDir('leer-index'), 'index.sqlite'),
    ledgerFile: join(workDir('leer-ledger'), 'ledger.sqlite'),
  });
  assert.deepEqual(direct.load(scoring.LEDGER_NAMESPACE), { ok: true, state: null }, 'ohne Stand: ehrliche Leere');
  assert.deepEqual(direct.load(''), { ok: false, error: 'MISSING_NAMESPACE' });
  assert.deepEqual(direct.save('', {}), { ok: false, error: 'MISSING_NAMESPACE' });
  // Ohne eigenen Ledger-Pfad wird NICHT stillschweigend irgendwohin geschrieben.
  const homeless = index.createStoreService({ indexFile: join(workDir('heimatlos-index'), 'index.sqlite') });
  assert.deepEqual(homeless.load(scoring.LEDGER_NAMESPACE), { ok: false, error: 'MISSING_LEDGER_FILE' });
  assert.deepEqual(homeless.save(scoring.LEDGER_NAMESPACE, {}), { ok: false, error: 'MISSING_LEDGER_FILE' });

  shutdown(api);
});

test('memory: eine fehlende Ablage ist keine — aber sie legt sich ihr Zuhause selbst an', async () => {
  const project = fixture('zuhause');
  const indexRoot = workDir('zuhause-index');
  const indexFile = index.indexPath(indexRoot, project);
  const ledgerFile = join(workDir('zuhause-ledger'), 'ledger.sqlite');
  assert.equal(existsSync(indexFile), false, 'Ausgangslage: keine Indexdatei');
  assert.equal(existsSync(ledgerFile), false, 'Ausgangslage: keine Ledgerdatei');

  // LESEN erzeugt keinen INDEX (dieselbe Regel wie bei der Abfrage). Es legt den
  // LEDGER an — der ist unsere eigene, dauerhafte Ablage.
  const service = index.createStoreService({ indexFile, ledgerFile });
  assert.deepEqual(service.load(scoring.LEDGER_NAMESPACE), { ok: true, state: null });
  assert.equal(existsSync(indexFile), false, 'das Lesen materialisiert keinen Index');
  assert.equal(existsSync(ledgerFile), true, 'der Ledger ist das Zuhause der Ablage');

  // SCHREIBEN schreibt in den Ledger — und der Index bleibt unberuehrt.
  const written = service.save(scoring.LEDGER_NAMESPACE, { records: [{ session_id: 's', event: { type: 'feedback.approval' } }], memos: [], notes: 1, scorecard: null });
  assert.equal(written.ok, true, `nicht geschrieben: ${written.error}`);
  assert.ok(written.rows >= 2, 'mindestens die Zeile und die Zusammenfassung');
  assert.equal(existsSync(ledgerFile), true);
  assert.equal(existsSync(indexFile), false, 'der Ledger schreibt NICHT in die Indexdatei');
  const state = service.load(scoring.LEDGER_NAMESPACE);
  assert.equal(state.ok, true);
  assert.equal(state.state.records.length, 1);
  assert.equal(state.state.notes, 1);
});

// ── 2. Der ganze Weg: werten, Neustart, Widerruf ─────────────────────────────

test('memory: ein Signal werten, den Host neu aufsetzen — der Stand ist noch da', async () => {
  const project = fixture('neustart');
  const indexRoot = workDir('neustart-index');
  const ledgerFile = join(workDir('neustart-ledger'), 'ledger.sqlite');

  const first = await mount({ root: project, indexRoot, ledgerFile });
  assert.deepEqual(first.scoring.scorecard().scores, { correctness: 0.5, trust: 0.5 }, 'Ausgangslage');
  first.host.dispatch('session/event', SESSION, answered('ans-1'));
  first.host.dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  const scored = first.scoring.scorecard();
  assert.equal(scored.scores.correctness, 0.56, 'das Urteil hat gewirkt');
  const persisted = storedState(first);
  assert.equal(persisted.records.length, 1, 'das Protokoll steht in der SQLite');
  assert.equal(persisted.records[0].subject, 'ans-1', 'die Zuordnung (welche Antwort) steht mit dabei');
  assert.deepEqual(persisted.scorecard, scored, 'die gerechnete Tafel steht mit dabei');
  shutdown(first);

  // Neustart: neuer Host, neues Scoring — dieselbe Ablage.
  const second = await mount({ root: project, indexRoot, ledgerFile });
  assert.deepEqual(second.scoring.scorecard(), scored, 'nach dem Neustart steht der Stand');
  assert.equal(second.scoring.collector.stats().records, 1, 'das Protokoll wurde wieder eingelesen');
  assert.equal(second.scoring.state().records.length, 1);
  assert.equal(second.scoring.state().records[0].subject, 'ans-1');

  // Der Widerruf wirkt AUCH nach dem Neustart: die Zeile faellt weg, die Tafel
  // wird aus dem Rest nachgerechnet — zurueck auf den Anfangswert.
  second.host.dispatch('session/event', SESSION, retracted('ans-1'));
  assert.deepEqual(second.scoring.scorecard().scores, { correctness: 0.5, trust: 0.5 });
  assert.equal(storedState(second).records.length, 0, 'auch die Ablage ist leer');
  shutdown(second);

  const third = await mount({ root: project, indexRoot, ledgerFile });
  assert.deepEqual(third.scoring.scorecard().scores, { correctness: 0.5, trust: 0.5 }, 'der Widerruf ueberlebt den Neustart');
  shutdown(third);
});

test('memory: spaete Kritik trifft die frueher bewertete Antwort (derselbe Betreff)', async () => {
  const project = fixture('spaet');
  const indexRoot = workDir('spaet-index');
  const ledgerFile = join(workDir('spaet-ledger'), 'ledger.sqlite');

  const first = await mount({ root: project, indexRoot, ledgerFile });
  first.host.dispatch('session/event', SESSION, answered('ans-1'));
  first.host.dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  assert.equal(first.scoring.state().records.length, 1);
  shutdown(first);

  // Der Mensch korrigiert NACH dem Neustart dieselbe Antwort. Ohne die
  // Zuordnung in der Ablage waere das eine zweite, unabhaengige Zeile — die
  // Tafel truege dann Lob und Tadel fuer dieselbe Sache.
  const second = await mount({ root: project, indexRoot, ledgerFile });
  // Die Antwort kam VOR dem Neustart; die Zuordnung ueberlebt ihn (der Betreff
  // steht im Protokoll, und das wird beim Laden gelesen).
  second.host.dispatch('session/event', SESSION, rated('ans-1', 'negative'));
  const records = second.scoring.state().records;
  assert.equal(records.length, 1, 'dieselbe Antwort traegt genau eine Zeile');
  assert.equal(records[0].subject, 'ans-1');
  assert.equal(records[0].signal, 'selffix', 'die spaetere Kritik ersetzt das fruehere Lob');
  assert.ok(second.scoring.scorecard().scores.correctness < 0.5, 'und die Tafel folgt der Korrektur');

  // Eine ANDERE Antwort ist eine eigene Zeile — die Zuordnung trennt sie.
  second.host.dispatch('session/event', SESSION, answered('ans-2'));
  second.host.dispatch('session/event', SESSION, rated('ans-2', 'positive'));
  assert.deepEqual(second.scoring.state().records.map((record) => record.subject).sort(), ['ans-1', 'ans-2']);
  assert.equal(storedState(second).records.length, 2);
  shutdown(second);
});

// ── 3. Sitzungen werden abgeschlossen, nicht erfunden ────────────────────────

test('memory: eine beendete Sitzung wird abgeschlossen — auf die Ereignisse, die es gibt', async () => {
  const project = fixture('sitzung');
  const indexRoot = workDir('sitzung-index');
  const api = await mount({ root: project, indexRoot });

  // Eine Frage legt den Merkzettel an — und der wird geschrieben, sonst waere er
  // nach einem Neustart weg und dieselbe Frage gaelte wieder als die erste.
  api.host.dispatch('session/event', SESSION, humanMessage(QUESTION));
  const withMemo = storedState(api);
  assert.equal(withMemo.memos.length, 1, 'der Merkzettel steht in der Ablage');
  assert.equal(withMemo.memos[0].id, 'sess-1');
  assert.equal(withMemo.memos[0].previousQuestion, QUESTION);

  // Ein NEUES Sitzungsereignis derselben Sitzung schliesst sie ab: der
  // Merkzettel faellt weg, das Protokoll bleibt (Evidenz ist keine Sitzung).
  // Das Signal heisst `shinon/session/created` — die Punkt-Form `session.created`
  // kennt keine DSH-Fassung, sie war ein Fehler der ersten Tabelle.
  api.host.dispatch('shinon/session/created', { session_id: 'sess-1' });
  const closed = storedState(api);
  assert.equal(closed.memos.length, 0, 'die abgeschlossene Sitzung liegt nicht mehr in der Ablage');
  assert.equal(api.scoring.collector.session('sess-1'), null, 'und keine leere Huelle bleibt stehen');
  // Und sie ist wirklich abgeschlossen: dieselbe Frage gilt jetzt wieder als
  // erste Frage, statt als Wiederholung gewertet zu werden.
  const again = api.scoring.observe(
    { event_type: 'message.received', session_id: 'sess-1' },
    { session_id: 'sess-1', data: { id: 'msg-2', source: { kind: 'user' }, content: [{ type: 'text', text: QUESTION }] } },
  );
  assert.equal(again.outcome.reason, 'FIRST_QUESTION', 'kein Merkzettel, keine Wiederholung');

  // Das Schliessen ist wiederholbar (die Frage hat eine neue Sitzung eroeffnet),
  // und das Protokoll und der Merkzettel sind getrennt: ein Urteil wird auch
  // dann geschrieben, wenn gerade keine Sitzung offen ist.
  api.host.dispatch('shinon/session/created', { session_id: 'sess-1' });
  assert.equal(storedState(api).memos.length, 0, 'das zweite Schliessen raeumt den neuen Merkzettel');
  api.host.dispatch('session/event', SESSION, answered('ans-7'));
  api.host.dispatch('session/event', SESSION, rated('ans-7', 'positive'));
  assert.equal(storedState(api).memos.length, 0, 'eine Wertung braucht keine offene Sitzung');

  // Der Host beendet: offene Sitzungen werden geschlossen (der Prozess ist die
  // Grenze, weil der Spine kein Sitzungsende kennt), die Evidenz bleibt.
  shutdown(api);
  const after = storedState(api);
  assert.equal(after.memos.length, 0, 'kein offener Merkzettel ueberlebt das Ende des Hosts');
  assert.equal(after.records.length, 1, 'die Evidenz ueberlebt ihn');
});

// ── 4. Fail-closed: ein kaputter Index haelt den Host nicht an ───────────────

