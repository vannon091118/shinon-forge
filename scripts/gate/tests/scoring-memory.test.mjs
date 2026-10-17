#!/usr/bin/env node
/**
 * Das dauerhafte Gedaechtnis (Zug 2): der ganze Weg ohne Browser, ohne Schluessel
 * und ohne Modell — aber MIT der echten Ablage.
 *
 * Warum als eigener Test: die Paket-Tests fahren den reinen Kern (der kennt kein
 * Dateisystem), `scoring-signals.test.mjs` faehrt beide Haelften an einem Bus
 * (dessen Host hat aber kein `ctx.get`, also keine Ablage). Hier haengen DREI
 * echte Bundles an einem Host — Events-Spine, Project-Index, Scoring — und
 * gemessen wird, was sonst nur behauptet waere:
 *
 *   Signal werten -> der Wert steht in der SQLite des Index -> Host neu
 *   aufsetzen -> der Stand ist wieder da. Der Widerruf wirkt auch nach dem
 *   Neustart, spaete Kritik trifft dieselbe frueher bewertete Antwort (derselbe
 *   Betreff, ersetzt statt gestapelt), eine beendete Sitzung wird sauber
 *   abgeschlossen, ein KAPUTTER Index ergibt einen leeren, aber laufenden Start
 *   — und die Abfrage-Faehigkeit des Index bleibt unberuehrt.
 *
 * Die zwei Nahten sind als Daten gepinnt (Dienstname, Vertragsname, Namensraum):
 * kein Paket liest das andere, also muss ein Test von aussen nachsehen.
 *
 * Laeuft mit `node --test` — die Pakete werden in ein temporaeres Verzeichnis
 * kopiert und mit dem ECHTEN Schemastery der DSH-Installation geladen (die
 * einzige peer-Dependency, die hier nicht im Paket liegt). Damit braucht dieser
 * Test `dsh` im PATH, wie `context-wiring.test.mjs` daneben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';

const PACKAGES = ['events', 'scoring', 'project-index'];
const ROOT = new URL('../../../', import.meta.url);

/**
 * Die Pakete isoliert laden — mit dem echten Schemastery aus der DSH-Installation.
 * Ein Stub waere hier FALSCH: `.Config({…})` muss die echten Vorgaben tragen,
 * sonst maesse der Test eine Attrappe (ein Proxy-Objekt als `scorePath` wirft).
 */
async function loadBundles() {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
  const require = createRequire(join(root, 'package.json'));
  const work = mkdtempSync(join(tmpdir(), 'shinon-memory-test-'));
  for (const name of PACKAGES) cpSync(new URL(`packages/${name}/`, ROOT), join(work, name), { recursive: true });
  const shim = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  const loaded = {};
  for (const name of PACKAGES) loaded[name] = await import(pathToFileURL(join(work, name, 'index.js')).href);
  return { loaded, work };
}

const { loaded, work } = await loadBundles();
const tempDirs = [];
process.on('exit', () => {
  try {
    rmSync(work, { recursive: true, force: true });
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Aufraeumen ist Beiwerk */
  }
});

const events = loaded.events;
const scoring = loaded.scoring;
const index = loaded['project-index'];

/**
 * Der Host, wie der Index und das Scoring ihn sehen: ein Bus (on/emit) und eine
 * Dienst-Registry (provide/get). Genau zwei Cordis-Eigenschaften, und beide so,
 * wie die Pakete sie benutzen — `provide` gibt eine Freigabe zurueck, `get` ist
 * die OPTIONALE Abfrage.
 */
function createHost() {
  const handlers = new Map();
  const services = new Map();
  const fire = (name, args) => {
    for (const handler of handlers.get(name) ?? []) handler(...args);
  };
  const ctx = {
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) ?? []).filter((entry) => entry !== handler));
    },
    emit(name, ...args) {
      fire(name, args);
    },
    provide(name, value) {
      services.set(name, value);
      return () => services.delete(name);
    },
    get(name) {
      return services.get(name);
    },
  };
  return {
    ctx,
    services,
    handlers,
    dispatch: (name, ...args) => fire(name, args),
  };
}

/** Die Ausgabe der Pakete auffangen: Tests sollen nicht im Log laufen, aber den Grund sehen. */
const noise = [];
const realConsole = { log: console.log, warn: console.warn, error: console.error };
const record = (level) => (...args) => noise.push({ level, text: args.map((value) => String(value)).join(' ') });
console.log = record('log');
console.warn = record('warn');
console.error = record('error');
const warnings = () => noise.filter((entry) => entry.level !== 'log').map((entry) => entry.text);

let workCount = 0;
function workDir(label) {
  workCount += 1;
  const dir = mkdtempSync(join(tmpdir(), `shinon-memory-${label}-${workCount}-`));
  tempDirs.push(dir);
  return dir;
}

/** Ein kleines, echtes Projekt: der Indexlauf hat etwas zu tun, mehr braucht er nicht. */
function fixture(label) {
  const dir = join(workDir(label), 'projekt');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/a.mjs'), "import { bThing } from './b.mjs';\nexport function aRun() {\n  return bThing(1);\n}\n");
  writeFileSync(join(dir, 'src/b.mjs'), 'export function bThing(value) {\n  return value;\n}\n');
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'fixture' }, null, 2)}\n`);
  return dir;
}

/**
 * Einen Host aufsetzen: Events-Spine, Project-Index, Scoring — in der
 * angegebenen Reihenfolge, weil die Reihenfolge keine Zusage ist und genau das
 * mitgemessen wird.
 *
 * `settle()` wartet den Indexlauf ab (er laeuft nach dem Mount in einem
 * setImmediate): danach schreibt niemand mehr ausser den Ablage-Aufrufen selbst,
 * und der Test misst keine zwei Schreiber gleichzeitig.
 */
async function mount({ root, indexRoot, order = ['events', 'index', 'scoring'] }) {
  const host = createHost();
  const releases = [];
  const api = { host, root, indexRoot, releases };
  for (const which of order) {
    if (which === 'events') {
      events.apply(host.ctx, {
        schemaPath: './assets/event-spine.json',
        replayPath: './assets/replay/session-created.json',
        emitChannel: 'shinon/event',
        defaultSessionId: '',
        clock: '2026-10-11T10:00:00.000Z',
      });
    }
    if (which === 'index') {
      api.indexFile = index.indexPath(indexRoot, root);
      api.releaseIndex = index.apply(host.ctx, index.Config({ root, indexRoot, worker: false, trace: false }));
    }
    if (which === 'scoring') {
      api.scoring = scoring.apply(host.ctx, scoring.Config({ eventsChannel: 'shinon/event' }));
    }
  }
  const settle = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
  await settle();
  return api;
}

/** Den Host beenden, wie DSH es tut: Index freigeben, Scoring abschliessen. */
function shutdown(api) {
  if (typeof api.releaseIndex === 'function') api.releaseIndex();
  if (api.scoring !== undefined) api.scoring.dispose();
}

const SESSION = { id: 'sess-1' };
const sessionEvent = (type, data, seq = 1) => ({ type, seq, time: 1791739858292, data });
const humanMessage = (text, id = 'msg-1', kind = 'user') =>
  sessionEvent('user/message', { content: [{ type: 'text', text }], source: { kind }, role: 'user', id });
const rated = (messageId, ratingValue) =>
  sessionEvent('feedback/message-put', { sessionId: 'sess-1', item: { messageId, rating: ratingValue, version: 'v1' } });
const retracted = (messageId) => sessionEvent('feedback/message-delete', { sessionId: 'sess-1', messageId });
const QUESTION = 'Prüfe bitte die Scoring Schicht und die Signaltabelle im Paket';

/** Den Stand so lesen, wie der Host ihn liest — ueber den Dienst, nicht ueber die Tabelle. */
function storedState(api) {
  const answer = index.createStoreService({ indexFile: api.indexFile }).load(scoring.LEDGER_NAMESPACE);
  assert.equal(answer.ok, true, `Ablage nicht lesbar: ${answer.error}`);
  return answer.state;
}

// ── 1. Die Naht: zwei schmale Faehigkeiten, Namen auf beiden Seiten gleich ───

test('memory: die Ablage ist eine zweite, schmale Faehigkeit — die Abfrage bleibt unberuehrt', async () => {
  const project = fixture('naht');
  const indexRoot = workDir('naht-index');
  const api = await mount({ root: project, indexRoot });

  // Der Host hat GENAU vier Faehigkeiten, und jede ist schmal: die Abfrage und
  // die Ablage kommen vom Index, der Ton (Zug 5) und die Gewichte (Phase 3)
  // vom Scoring. Die vierte ist angefragtes Verhalten (Gewichte für die
  // Baustein-Auswahl), keine Beigabe — siehe context-wiring (vierte Naht).
  assert.deepEqual([...api.host.services.keys()].sort(), ['shinon_block_weights', 'shinon_index_query', 'shinon_index_store', 'shinon_scoring_state']);
  const query = api.host.services.get(index.QUERY_SERVICE);
  assert.deepEqual(Object.keys(query).sort(), ['contract', 'resolveContext'], 'die Abfrage bleibt eine Operation');
  assert.equal(query.contract, index.QUERY_CONTRACT);
  const store = api.host.services.get(index.STORE_SERVICE);
  assert.deepEqual(Object.keys(store).sort(), ['contract', 'load', 'save'], 'die Ablage ist genau zwei Operationen');
  assert.equal(store.contract, index.STORE_CONTRACT);

  // Die Naht als Daten: kein Paket liest das andere, also pinnt der Test beide Seiten.
  assert.equal(scoring.INDEX_STORE_SERVICE, index.STORE_SERVICE);
  assert.equal(scoring.INDEX_STORE_CONTRACT, index.STORE_CONTRACT);
  assert.equal(scoring.INDEX_STORE_CONTRACT, store.contract);
  assert.equal(typeof scoring.LEDGER_NAMESPACE, 'string');
  assert.ok(scoring.LEDGER_NAMESPACE.length > 0);

  // Der Vertrag ist nicht nur ein Name: ein Dienst ohne die zwei Operationen
  // waere kein Gedaechtnis, und ein fehlender Namensraum keine Adresse.
  const direct = index.createStoreService({ indexFile: join(workDir('leer-index'), 'index.sqlite') });
  assert.deepEqual(direct.load(scoring.LEDGER_NAMESPACE), { ok: true, state: null }, 'ohne Index: ehrliche Leere');
  assert.deepEqual(direct.load(''), { ok: false, error: 'MISSING_NAMESPACE' });
  assert.deepEqual(direct.save('', {}), { ok: false, error: 'MISSING_NAMESPACE' });

  shutdown(api);
});

test('memory: eine fehlende Ablage ist keine — aber sie legt sich ihr Zuhause selbst an', async () => {
  const project = fixture('zuhause');
  const indexRoot = workDir('zuhause-index');
  const indexFile = index.indexPath(indexRoot, project);
  assert.equal(existsSync(indexFile), false, 'Ausgangslage: keine Datei');

  // LESEN erzeugt keinen Index (dieselbe Regel wie bei der Abfrage).
  const service = index.createStoreService({ indexFile });
  assert.deepEqual(service.load(scoring.LEDGER_NAMESPACE), { ok: true, state: null });
  assert.equal(existsSync(indexFile), false, 'das Lesen materialisiert keinen Index');

  // SCHREIBEN darf das: die Ablage ist unsere eigene, sie darf ihr Zuhause bauen.
  const written = service.save(scoring.LEDGER_NAMESPACE, { records: [{ session_id: 's', event: { type: 'feedback.approval' } }], memos: [], notes: 1, scorecard: null });
  assert.equal(written.ok, true, `nicht geschrieben: ${written.error}`);
  assert.ok(written.rows >= 2, 'mindestens die Zeile und die Zusammenfassung');
  assert.equal(existsSync(indexFile), true);
  const state = service.load(scoring.LEDGER_NAMESPACE);
  assert.equal(state.ok, true);
  assert.equal(state.state.records.length, 1);
  assert.equal(state.state.notes, 1);
});

// ── 2. Der ganze Weg: werten, Neustart, Widerruf ─────────────────────────────

test('memory: ein Signal werten, den Host neu aufsetzen — der Stand ist noch da', async () => {
  const project = fixture('neustart');
  const indexRoot = workDir('neustart-index');

  const first = await mount({ root: project, indexRoot });
  assert.deepEqual(first.scoring.scorecard().scores, { correctness: 0.5, trust: 0.5 }, 'Ausgangslage');
  first.host.dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  const scored = first.scoring.scorecard();
  assert.equal(scored.scores.correctness, 0.56, 'das Urteil hat gewirkt');
  const persisted = storedState(first);
  assert.equal(persisted.records.length, 1, 'das Protokoll steht in der SQLite');
  assert.equal(persisted.records[0].subject, 'ans-1', 'die Zuordnung (welche Antwort) steht mit dabei');
  assert.deepEqual(persisted.scorecard, scored, 'die gerechnete Tafel steht mit dabei');
  shutdown(first);

  // Neustart: neuer Host, neues Scoring — dieselbe Ablage.
  const second = await mount({ root: project, indexRoot });
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

  const third = await mount({ root: project, indexRoot });
  assert.deepEqual(third.scoring.scorecard().scores, { correctness: 0.5, trust: 0.5 }, 'der Widerruf ueberlebt den Neustart');
  shutdown(third);
});

test('memory: spaete Kritik trifft die frueher bewertete Antwort (derselbe Betreff)', async () => {
  const project = fixture('spaet');
  const indexRoot = workDir('spaet-index');

  const first = await mount({ root: project, indexRoot });
  first.host.dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  assert.equal(first.scoring.state().records.length, 1);
  shutdown(first);

  // Der Mensch korrigiert NACH dem Neustart dieselbe Antwort. Ohne die
  // Zuordnung in der Ablage waere das eine zweite, unabhaengige Zeile — die
  // Tafel truege dann Lob und Tadel fuer dieselbe Sache.
  const second = await mount({ root: project, indexRoot });
  second.host.dispatch('session/event', SESSION, rated('ans-1', 'negative'));
  const records = second.scoring.state().records;
  assert.equal(records.length, 1, 'dieselbe Antwort traegt genau eine Zeile');
  assert.equal(records[0].subject, 'ans-1');
  assert.equal(records[0].signal, 'selffix', 'die spaetere Kritik ersetzt das fruehere Lob');
  assert.ok(second.scoring.scorecard().scores.correctness < 0.5, 'und die Tafel folgt der Korrektur');

  // Eine ANDERE Antwort ist eine eigene Zeile — die Zuordnung trennt sie.
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

test('memory: ein kaputter Index ergibt einen leeren, aber laufenden Start', async () => {
  const project = fixture('kaputt');
  const indexRoot = workDir('kaputt-index');
  const indexFile = index.indexPath(indexRoot, project);
  mkdirSync(dirname(indexFile), { recursive: true });
  writeFileSync(indexFile, 'das ist keine SQLite-Datei, sondern Text\n');

  const before = warnings().length;
  const api = await mount({ root: project, indexRoot });
  const said = warnings().slice(before);
  assert.ok(
    said.some((line) => line.includes('nicht lesbar')),
    `der Grund muss benannt sein, nicht verschwiegen: ${JSON.stringify(said.slice(-4))}`,
  );

  // LEER, aber LAUFEND: die Tafel steht am Anfang, und ein Signal wirkt trotzdem.
  assert.deepEqual(api.scoring.scorecard().scores, { correctness: 0.5, trust: 0.5 });
  api.host.dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  assert.equal(api.scoring.scorecard().scores.correctness, 0.56, 'der Host laeuft weiter');
  assert.equal(api.scoring.state().records.length, 1, 'im Speicher ist der Stand da');

  // Und die Ablage sagt die Wahrheit ueber sich selbst: kein stilles Nichts.
  const answer = index.createStoreService({ indexFile }).load(scoring.LEDGER_NAMESPACE);
  assert.equal(answer.ok, false);
  assert.ok(String(answer.error).length > 0, 'ein Fehler ohne Text waere ein Befund ohne Spur');
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

  const first = await mount({ root: project, indexRoot });
  first.host.dispatch('session/event', SESSION, rated('ans-1', 'positive'));
  const scored = first.scoring.scorecard();
  shutdown(first);

  // Scoring zuerst: sein `apply` findet den Dienst noch nicht. Der erste
  // Gebrauch liegt hinter allen Mounts und holt den Stand nach.
  const swapped = await mount({ root: project, indexRoot, order: ['events', 'scoring', 'index'] });
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

  // Ein Urteil wiegt schwerer und traegt die Korrektur-Klasse.
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
