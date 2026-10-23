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
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';

export const PACKAGES = ['events', 'scoring', 'project-index'];
export const ROOT = new URL('../../../', import.meta.url);

/**
 * Die Pakete isoliert laden — mit dem echten Schemastery aus der DSH-Installation.
 * Ein Stub waere hier FALSCH: `.Config({…})` muss die echten Vorgaben tragen,
 * sonst maesse der Test eine Attrappe (ein Proxy-Objekt als `scorePath` wirft).
 */
export async function loadBundles() {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
  const require = createRequire(join(root, 'package.json'));
  const work = mkdtempSync(join(tmpdir(), 'shinon-memory-test-'));
  for (const name of PACKAGES) cpSync(new URL(`packages/${name}/`, ROOT), join(work, name), { recursive: true });
  provideSeamCore(work);
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

export const { loaded, work } = await loadBundles();
export const tempDirs = [];
process.on('exit', () => {
  try {
    rmSync(work, { recursive: true, force: true });
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Aufraeumen ist Beiwerk */
  }
});

export const events = loaded.events;
export const scoring = loaded.scoring;
export const index = loaded['project-index'];

/**
 * Der Host, wie der Index und das Scoring ihn sehen: ein Bus (on/emit) und eine
 * Dienst-Registry (provide/get). Genau zwei Cordis-Eigenschaften, und beide so,
 * wie die Pakete sie benutzen — `provide` gibt eine Freigabe zurueck, `get` ist
 * die OPTIONALE Abfrage.
 */
export function createHost() {
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
export const noise = [];
export const realConsole = { log: console.log, warn: console.warn, error: console.error };
export const record = (level) => (...args) => noise.push({ level, text: args.map((value) => String(value)).join(' ') });
console.log = record('log');
console.warn = record('warn');
console.error = record('error');
export const warnings = () => noise.filter((entry) => entry.level !== 'log').map((entry) => entry.text);

export let workCount = 0;
export function workDir(label) {
  workCount += 1;
  const dir = mkdtempSync(join(tmpdir(), `shinon-memory-${label}-${workCount}-`));
  tempDirs.push(dir);
  return dir;
}

/** Ein kleines, echtes Projekt: der Indexlauf hat etwas zu tun, mehr braucht er nicht. */
export function fixture(label) {
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
export async function mount({ root, indexRoot, ledgerFile = join(workDir('ledger'), 'ledger.sqlite'), order = ['events', 'index', 'scoring'] }) {
  const host = createHost();
  const releases = [];
  // Der Ledger liegt seit der Trennung NICHT mehr in der Indexdatei: ein
  // eigener Pfad, ein eigener Lebenszyklus (Cache vs. Daten). Der Test setzt ihn
  // ausdruecklich — ohne ihn schreibt die Ablage gar nicht (MISSING_LEDGER_FILE).
  // Ein NEUSTART uebergibt denselben Pfad: genau das ist die Zusage, dass der
  // Stand den Host ueberlebt (und nicht die Indexdatei).
  const api = { host, root, indexRoot, releases, ledgerFile };
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
      api.releaseIndex = index.apply(host.ctx, index.Config({ root, indexRoot, ledgerFile: api.ledgerFile, worker: false, trace: false }));
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
export function shutdown(api) {
  if (typeof api.releaseIndex === 'function') api.releaseIndex();
  if (api.scoring !== undefined) api.scoring.dispose();
}

export const SESSION = { id: 'sess-1' };
export const sessionEvent = (type, data, seq = 1) => ({ type, seq, time: 1791739858292, data });
export const humanMessage = (text, id = 'msg-1', kind = 'user') =>
  sessionEvent('user/message', { content: [{ type: 'text', text }], source: { kind }, role: 'user', id });
export const rated = (messageId, ratingValue) =>
  sessionEvent('feedback/message-put', { sessionId: 'sess-1', item: { messageId, rating: ratingValue, version: 'v1' } });
/** Die Antwort, die das Urteil spaeter trifft: nur eine gesehene Antwort ist zuordenbar. */
export const answered = (messageId) =>
  sessionEvent('assistant/message', { sessionId: 'sess-1', turn: 1, step: 1, message: { id: messageId } });
export const retracted = (messageId) => sessionEvent('feedback/message-delete', { sessionId: 'sess-1', messageId });
export const QUESTION = 'Prüfe bitte die Scoring Schicht und die Signaltabelle im Paket';

/** Den Stand so lesen, wie der Host ihn liest — ueber den Dienst, nicht ueber die Tabelle. */
export function storedState(api) {
  const answer = index.createStoreService({ indexFile: api.indexFile, ledgerFile: api.ledgerFile }).load(scoring.LEDGER_NAMESPACE);
  assert.equal(answer.ok, true, `Ablage nicht lesbar: ${answer.error}`);
  return answer.state;
}

// ── 1. Die Naht: zwei schmale Faehigkeiten, Namen auf beiden Seiten gleich ───

