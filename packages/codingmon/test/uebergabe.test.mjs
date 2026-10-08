#!/usr/bin/env node
/**
 * packages/codingmon/test/uebergabe.test.mjs — der Durchstich der UEBERGABE
 * (Client -> Host).
 *
 * WAS HIER BEWIESEN WIRD: der Spielstand des BROWSERS erreicht den HOST und
 * liegt danach dauerhaft auf einem Medium, das der Host besitzt. Gefahren wird
 * das nicht gegen Attrappen, sondern gegen die ECHTEN Bausteine der
 * installierten DSH-Fassung in EINEM Prozess:
 *
 *   Client-Seite                        Host-Seite
 *   ─────────────                       ───────────
 *   echter Cordis-Root                  echter Cordis-Root
 *   ctx.typert  (TypertRegistry)        ctx.typert  (TypertRegistry)
 *   ctx.connection  <- installConnection ctx.connection (Carrier-Gegenstelle)
 *   ctx.remote      <- api-gateway       ctx.typertGateway <- api-gateway
 *   ctx.remote.$mount(Beitrag)           CodingmonRemote (unser Dienst)
 *                                        pet-store -> storage-json -> Datei
 *
 * Das BINDEGLIED ist der IN-PROCESS-CARRIER: DSHs Client-Verbindung nimmt einen
 * `transport.rpc` entgegen (`installConnection(ctx, { transport })`, im Browser
 * ueber `globalThis.__DSH_TRANSPORT__`), und `ctx.connection.rpc.open` bzw.
 * `call` ist genau der Weg, den das Gateway auf der Client-Seite bevorzugt
 * („an in-process Connection carrier provides equivalent streams directly
 * without opening [the WebSocket]"). Hier wird dieser Traeger gestellt: `call`
 * reicht den Aufruf an den Interceptor weiter, den das ECHTE Gateway auf
 * `/api` registriert hat. Kein WebSocket, kein Browser, kein HTTP.
 *
 * WAS DIESER TEST NICHT BEWEIST (ehrlich): es laeuft keine echte
 * Browser-Assembly. Im AUSGELIEFERTEN Client waehlt eine kompilierte Liste in
 * `@deepseek-ai/dsh-api-remotes` die Beitraege aus, und DIESES Paket steht nicht
 * darauf — der Beitrag muss also erst von einer Client-Composition ausgewaehlt
 * werden (eine Zeile dort, ausserhalb dieses Forks). Was hier bewiesen ist, ist
 * die Naht selbst: der Beitrag ist mountbar, das Gateway nimmt ihn an, der Aufruf
 * landet im Dienst, der Stand liegt danach validiert auf der Platte, und ein
 * Vertragsbruch wird abgelehnt, ohne das Medium anzufassen.
 *
 * Lauf mit `node --test` (CI: .github/workflows/commit-guard.yml). Fehlt die
 * DSH-Abhaengigkeit (kein node_modules, wie in CI), wird der Test SICHTBAR
 * uebersprungen statt rot zu werden.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as uebergabe from '../assets/uebergabe.js';

const CLIENT_FILE = fileURLToPath(new URL('../client.js', import.meta.url));
const HOST_FILE = fileURLToPath(new URL('../index.js', import.meta.url));
const REMOTE_FILE = fileURLToPath(new URL('../assets/pet-remote.js', import.meta.url));
const STORE_FILE = fileURLToPath(new URL('../assets/pet-store.js', import.meta.url));

/**
 * Die DSH-Bausteine aus der ABHAENGIGKEIT dieses Repos aufloesen (Wurzel
 * package.json pinnt `@deepseek-ai/dsh`) — nicht aus einer Installation im PATH.
 * Der Test prueft damit genau die Fassung, die hier gepinnt ist.
 */
const require = createRequire(new URL('../../../package.json', import.meta.url));
/** Eine Datei INNERHALB eines Pakets, auch wenn der exports-Riegel sie nicht oeffnet. */
const inside = (spec, relative) => pathToFileURL(join(dirname(require.resolve(`${spec}/package.json`)), relative)).href;

const missing = [];
let dsh = null;
let bundle = null;
let remote = null;
let store = null;
// Pruefhaken, KEIN Betriebszustand: CI hat kein `node_modules`, und der Test muss
// dort SICHTBAR ueberspringen statt still zu bestehen. Mit dieser Variablen laesst
// sich genau dieser Fall hier nachstellen (siehe Probe codemon-uebergabe.json).
if (process.env.CODEMON_SIMULIERE_CI_OHNE_DSH === '1') {
  missing.push('CODEMON_SIMULIERE_CI_OHNE_DSH gesetzt (node_modules simuliert fehlend)');
}
try {
  bundle = await import(pathToFileURL(HOST_FILE).href);
  remote = await import(pathToFileURL(REMOTE_FILE).href);
  store = await import(pathToFileURL(STORE_FILE).href);
  dsh = {
    cordis: await import(require.resolve('@deepseek-ai/cordis')),
    storage: await import(require.resolve('@deepseek-ai/dsh-storage')),
    json: await import(require.resolve('@deepseek-ai/dsh-storage-json')),
    domain: await import(require.resolve('@deepseek-ai/dsh-storage-domain')),
    registry: await import(require.resolve('@deepseek-ai/dsh-typert-registry')),
    gatewayHost: await import(require.resolve('@deepseek-ai/dsh-api-gateway')),
    // Der Gateway-Client liegt daneben auch ungebundelt als ESM.
    gatewayClient: await import(inside('@deepseek-ai/dsh-api-gateway', 'lib/types/client/index.js')),
  };
  // Die Client-Haelfte der Verbindung gibt es NUR als Browser-Bundle (das Paket
  // liefert dazu nur `.d.ts`). Also laden wir sie so, wie der Browser sie laedt:
  // ueber `window.__ModuleLoader__.load({ id, factory })`.
  dsh.connection = loadClientBundle(inside('@deepseek-ai/dsh-client-connection', 'lib/client.js'));
} catch (error) {
  missing.push(`DSH-Bausteine nicht aufloesbar (${String(error?.message ?? error).split('\n')[0]})`);
}
const skip = missing.length ? `uebersprungen: ${missing.join('; ')}` : false;

/**
 * Ein DSH-Client-Bundle ueber seine eigene Ladeschnittstelle holen. Das Bundle
 * ist selbststaendig (es ruft kein `require`), deshalb genuegt ein leerer
 * `window`, der `__ModuleLoader__` bereitstellt — dieselbe Naht, ueber die der
 * echte Browser-Client seine Buendel bezieht.
 * @param {string} url - Datei-URL des Bundles.
 * @returns {object} die Ausfuhren des Bundles (hier: `installConnection`, `apply`, `inject`).
 */
function loadClientBundle(url) {
  const captured = {};
  const file = fileURLToPath(url);
  // Ein vm-Kontext hat nur die Sprach-Bausteine. Der Browser-Client setzt die
  // Web-Globals voraus, also reichen wir sie hinein — sonst scheitert schon der
  // erste Verbindungsversuch an einem fehlenden `AbortController`.
  const sandbox = {
    console,
    AbortController, AbortSignal, EventTarget, Event,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    TextEncoder, TextDecoder, structuredClone, performance, URL, URLSearchParams,
  };
  sandbox.window = sandbox;
  sandbox.window.__ModuleLoader__ = { load: (definition) => { captured.plugin = definition; } };
  vm.runInContext(readFileSync(file, 'utf8'), vm.createContext(sandbox), { filename: file });
  if (captured.plugin === undefined) throw new Error(`${file} hat kein Buendel angemeldet`);
  return captured.plugin.factory(() => { throw new Error('dieses Buendel zieht kein require'); });
}

/** Ein Backend-Plugin hat `apply`; die Hub-Klasse ist selbst das Plugin. */
const asPlugin = (mod) => ({ name: mod.name, Config: mod.Config, inject: mod.inject, apply: mod.apply });

/** Bundle-/Loader-Ausgaben stumm schalten. */
function quiet(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

async function until(predicate, tries = 400) {
  for (let index = 0; index < tries; index += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return null;
}

/**
 * Der IN-PROCESS-CARRIER: die Client-Seite des Transports (`rpc.call`) und die
 * Host-Gegenstelle (`rpc.intercept`), direkt verbunden. `intercept` ist genau
 * der Aufruf, mit dem das Gateway seinen `/api`-Kanal anmeldet.
 */
function makeCarrier() {
  const channels = new Map();
  const peer = { id: 'operator' };
  return {
    events: eventsStream,
    transport: {
      ownsHost: true,
      rpc: {
        async call(channel, endpoint, payload, signal) {
          const entry = channels.get(channel);
          if (entry === undefined || entry.matches(endpoint) !== true) {
            return { ok: false, error: { code: 'gateway/internal', message: `kein Kanal fuer ${endpoint}`, details: {} } };
          }
          // Der Carrier ist die GRENZE zwischen zwei Realms: das Client-Bundle
          // laeuft in einem vm-Kontext, der Host hier. Ein echter Carrier
          // (WebSocket, HTTP, Worker) serialisiert an genau dieser Grenze — nur
          // so kommt der Wert als JSON-Wert an. Typert lehnt einen Wert aus
          // einem fremden Realm sonst ab, weil sein Prototyp nicht der eigene
          // ist (`prototype !== Object.prototype`), und das ist keine Marotte:
          // auf der Leitung gibt es keine Prototypen.
          return entry.handler(endpoint, roundTrip(payload), signal, peer);
        },
        // Ein definiertes `open` sagt der Client-Seite, dass ES ein
        // In-Process-Carrier ist; sie laesst dann den WebSocket-Mux aus. Und es
        // ist der einzige Weg, auf dem die Ereignis-Generation der Verbindung
        // zustande kommt.
        open(channel, endpoint, payload, signal) {
          if (channel !== '/api' || endpoint !== EVENTS_ENDPOINT) {
            throw new Error(`kein Strom fuer ${channel}${endpoint}`);
          }
          return eventsStream(signal);
        },
      },
    },
    host: {
      rpc: {
        intercept(channel, matches, handler) {
          channels.set(channel, { matches, handler });
          return async () => { channels.delete(channel); };
        },
      },
      operator: peer,
      channels,
    },
  };
}

/** Einen Wert so ueber die Realm-Grenze bringen, wie es ein echter Carrier tut. */
const roundTrip = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Der interne Endpunkt, an dem die Client-Seite ihre Ereignis-Generation oeffnet. */
const EVENTS_ENDPOINT = '$events';

/**
 * Der Ereignisstrom der Verbindung. Die Client-Seite oeffnet `$events` als
 * GENERATION; ein Strom, der sofort endet, waere eine Generation, die sofort
 * stirbt und den Ruecklauf neu startet. Also liefert der Traeger die Eroeffnung
 * (`{ type: 'ready', clientId, host: { home } }`, genau diese Schluessel) und
 * bleibt offen, bis der Client abbricht — das ist das Verhalten, das die
 * Dokumentation des Gateways dem In-Process-Carrier zuschreibt.
 *
 * Was dieser Traeger NICHT kann: ausgewaehlte Anwendungsereignisse liefern. Die
 * Ereignis-Auswahl gehoert api-remotes, das hier nicht montiert ist, und dieser
 * Test fahrt einen unary-Aufruf.
 * @param {AbortSignal} signal - Abbruch der Generation durch den Client.
 */
async function* eventsStream(signal) {
  yield { type: 'ready', clientId: 'in-process', host: { home: tmpdir() } };
  await new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', resolve, { once: true });
  });
}

/** Der Host: Storage-Familie, Typert-Registry, Gateway, Carrier-Gegenstelle. */
async function bootHost(medium) {
  const ctx = new dsh.cordis.Context();
  const carrier = makeCarrier();
  await ctx.plugin(dsh.storage.Storage, {});
  await ctx.plugin(asPlugin(dsh.json), { root: medium });
  await ctx.plugin(asPlugin(dsh.domain), { backend: 'json' });
  await ctx.plugin(dsh.registry.TypertRegistry);
  // Die Carrier-Gegenstelle als PLUGIN, nicht als `provide` auf der Wurzel: das
  // Gateway meldet seinen `/api`-Interceptor ueber `ctx.inject(['connection'], …)`
  // an, und Cordis feuert diesen Rueckruf nur fuer einen Dienst, der aus einem
  // Fiber stammt (gemessen: `provide` auf der Wurzel laesst den Rueckruf aus, ein
  // Dienst aus einem Plugin nicht). Ohne den Rueckruf gaebe es keinen Kanal.
  await ctx.plugin({ name: 'in-process-carrier', apply: (c) => { c.provide('connection', carrier.host); } });
  await ctx.plugin(dsh.gatewayHost.TypertGatewayService);
  assert.equal(carrier.host.channels.has('/api'), true, 'das Gateway hat seinen /api-Kanal angemeldet');
  return { ctx, carrier };
}

/** Der Client: Registry, Connection ueber den In-Process-Carrier, Remote-Dienst. */
async function bootClient(carrier) {
  const ctx = new dsh.cordis.Context();
  await ctx.plugin(dsh.registry.TypertRegistry);
  dsh.connection.installConnection(ctx, { transport: carrier.transport, recovery: {} });
  await ctx.plugin({ name: 'api-gateway-client', apply: dsh.gatewayClient.apply, inject: dsh.gatewayClient.inject });
  return ctx;
}

// ── Die Attrappe des Browser-Fensters: dasselbe Muster wie im Durchstich ────
function makeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { const id = (seq += 1); timers.set(id, { at: now + Math.max(0, Math.round(ms) || 0), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 200; guard += 1) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        const [id, timer] = due[0];
        timers.delete(id);
        now = timer.at;
        timer.fn();
      }
      now = target;
    },
  };
}

const el = () => ({
  className: '', style: {}, dataset: {}, children: [], innerText: '',
  append() {}, appendChild() {}, setAttribute() {}, remove() {},
  classList: { add() {}, contains: () => false },
});

/**
 * Das ECHTE Client-Bundle in einem vm-Kontext fahren — mit dem ECHTEN
 * Client-Context als `ctx`. Damit nimmt der Absender im Bundle genau die Naht,
 * die auch im Browser genommen wird.
 */
function bootBrowser(clientCtx) {
  const clock = makeClock();
  const storage = { data: new Map(), getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }, setItem(k, v) { this.data.set(k, String(v)); } };
  const document = {
    head: el(), body: el(), documentElement: el(),
    createElement: () => el(), querySelector: () => null, addEventListener() {},
  };
  const react = {
    useState: (value) => [value, () => {}],
    useEffect: (fn) => { fn(); },
    createElement: (type, props, ...kids) => ({ type, props: { ...(props ?? {}), ...(kids.length === 0 ? {} : { children: kids.length === 1 ? kids[0] : kids }) } }),
  };
  const slots = [];
  const intervals = new Map();
  const disposers = [];
  const sandbox = {
    document, console: { log() {}, warn() {}, error() {} }, Date,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (id) => clock.clearTimeout(id),
    setInterval: (fn) => { intervals.set(intervals.size + 1, fn); return intervals.size; },
    clearInterval: (id) => intervals.delete(id),
    localStorage: storage,
  };
  sandbox.window = sandbox;
  sandbox.window.__ModuleLoader__ = { load: (definition) => { sandbox.__plugin = definition; } };
  sandbox.dispatchEvent = () => {};
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => 0.5;

  vm.runInContext(readFileSync(CLIENT_FILE, 'utf8'), vm.createContext(sandbox), { filename: 'codingmon-client.js' });
  // Eine FASSADE, kein Spread: `remote` liegt auf dem Cordis-Context hinter
  // einem Zugriff, kein Spread der Welt kopiert ihn. Das Bundle braucht genau
  // drei Dinge — die Slots, einen Effekt und den Weg zum Remote-Dienst.
  const ctx = {
    slots: {
      inject: (name, register) => register(),
      register: (options, component) => { slots.push({ options, component }); return () => {}; },
    },
    effect: (fn) => { const dispose = fn(); disposers.push(dispose); return dispose; },
    get: (name) => clientCtx.get(name),
    get remote() { return clientCtx.remote; },
  };
  sandbox.__plugin.factory(() => react).apply(ctx);
  return { clock, sandbox, storage, slots, disposers, api: sandbox.window.__codingmon };
}

// ── Der Test ────────────────────────────────────────────────────────────────

test('Zusage: der Stand geht durch die Naht und liegt danach validiert auf der Platte', { skip }, async () => {
  const medium = mkdtempSync(join(tmpdir(), 'codingmon-uebergabe-'));
  const { ctx: host, carrier } = await bootHost(medium);
  const storeFile = join(medium, 'codingmon_pet.json');

  // Die Host-Haelfte des Pakets montiert sich selbst — inklusive Empfaenger.
  const disposeHost = quiet(() => bundle.apply(host, bundle.Config({})));
  const service = await until(() => host.get(bundle.STORE_SERVICE));
  assert.ok(service, 'der Spiegel wurde nicht bereitgestellt');
  assert.ok(host.get('typertGateway'), 'das echte Typert-Gateway laeuft nicht');

  // Der Beitrag, wie ihn eine Client-Composition mounten wuerde.
  const client = await bootClient(carrier);
  const unmount = await client.remote.$mount(remote.petRemoteContribution());
  const namespace = await until(() => client.get(`remote.${uebergabe.UEBERGABE_NAMESPACE}`));
  assert.ok(namespace, 'der Namensraum des Beitrags wurde nicht installiert');
  assert.equal(typeof namespace[uebergabe.UEBERGABE_METHOD], 'function', 'die Methode ist aufrufbar');

  // Das ECHTE Client-Bundle fahren und einen Zug BEENDEN — genau der Moment, in
  // dem der Absender im Bundle die Naht nimmt.
  const browser = bootBrowser(client);
  // Der Zustand kommt aus dem vm-Kontext (eigene Realm), deshalb Feld fuer Feld
  // statt deepEqual: verglichen wird der INHALT, nicht der Prototyp.
  const vorher = browser.api.host();
  assert.equal(vorher.sent, 0, 'vor dem ersten Zug ist nichts gespiegelt');
  assert.equal(vorher.reason, 'kein Kanal');
  assert.equal(vorher.error, null);
  const started = browser.api.start();
  assert.ok(started, 'der Zug beginnt (die Sperre haelt ihn)');
  browser.clock.advance(5000);
  await until(() => browser.api.host().sent > 0 || browser.api.host().reason === 'abgelehnt');

  const mirrored = browser.api.host();
  assert.equal(mirrored.error, null, `die Uebergabe scheiterte: ${mirrored.error}`);
  assert.equal(mirrored.reason, 'gespiegelt', 'der Absender meldet eine Annahme');
  assert.ok(mirrored.sent >= 1, 'mindestens ein Stand ist angekommen');

  // Der Stand liegt auf der PLATTE — nicht im Browser, nicht im Speicher.
  // Der Stand liegt auf der PLATTE — nicht im Browser, nicht im Speicher. Und er
  // liegt dort, wo die Deklaration ihn hinlegt: Einheit `codingmon_pet`, Tabelle
  // `snapshots`, Schluessel `state`.
  const readMedium = () => {
    const file = JSON.parse(readFileSync(storeFile, 'utf8'));
    assert.equal(file.unit.name, store.PET_DOMAIN.name, 'die Datei gehoert zur Einheit der Domain');
    assert.equal(file.unit.version, store.PET_DOMAIN.version, 'und zu ihrer Fassung');
    return file.tables.snapshots[store.PET_KEY];
  };
  const record = readMedium();
  assert.ok(record, 'der Datensatz steht unter dem vereinbarten Schluessel');
  assert.equal(record.species, browser.api.state().species, 'die Spezies ist die des Clients');
  assert.equal(record.damageTotal, browser.api.damageTotal(), 'der Lebenslauf steht als Ziffernfolge in der Datei');
  assert.equal(typeof record.storedAt, 'string', 'der Host hat den Schreibvorgang gestempelt');
  assert.equal(mirrored.lastAt, record.storedAt, 'die Quittung stempelt denselben Schreibvorgang');
  assert.equal(mirrored.lastLevel >= 1, true, 'die Quittung nennt eine Stufe');

  // Ein ZWEITER Zug ueberschreibt denselben Datensatz — ein Stand, keine
  // Historie. Der erste Zug hat den Kampf EROEFFNET; der zweite ist ein Angriff
  // und veraendert den Lebenslauf, sonst waere "ersetzt" nicht nachweisbar.
  const before = browser.api.damageTotal();
  const ability = browser.api.abilities()[0];
  assert.ok(ability, 'das Codemon hat eine Faehigkeit fuer den zweiten Zug');
  assert.ok(browser.api.use(ability.id), 'der zweite Zug beginnt (die Sperre haelt ihn)');
  browser.clock.advance(5000);
  await until(() => browser.api.host().sent >= 2);
  assert.equal(browser.api.host().sent >= 2, true, 'der zweite Zug ist ebenfalls gespiegelt');
  const second = readMedium();
  assert.notEqual(second.damageTotal, before, 'der Datensatz wurde ersetzt, nicht ergaenzt');
  assert.equal(second.round, browser.api.state().round ?? second.round, 'und der Stand ist der des zweiten Zuges');

  // Ein Stand, der den Vertrag verletzt, wird ABGELEHNT und beruehrt das Medium nicht.
  //
  // WAS HIER GEPRUEFT WIRD — UND WAS NICHT (ehrlich): geprueft ist, dass der
  // Aufruf als Fehlerergebnis zurueckkommt UND das Medium unveraendert bleibt.
  // NICHT geprueft ist, WELCHE der Schichten ablehnt: die Schichtung ist echte
  // Tiefenverteidigung mit EINER Schemaquelle (`assets/snapshot-schema.js`) —
  // der Dienst reicht weiter, der Spiegel ergaenzt `storedAt` und prueft, und
  // die deklarierte Tabelle der Domain prueft beim Ablegen noch einmal. Eine
  // Probe, die eine dieser Pruefungen entfernt, bleibt deshalb gruen; das ist
  // Absicht und keine Luecke. Die Zusage des Vertrags selbst haelt
  // `scripts/gate/tests/codingmon-store.test.mjs` fest.
  // Grundlage ist ein WIRKLICH uebertragbarer Stand: der zuletzt angenommene
  // Datensatz vom Medium. `window.__codingmon.state()` taugt dafuer NICHT — es
  // fuehrt `damageTotal` als BigInt (das JSON nicht kennt), und ein Aufruf damit
  // scheiterte schon an der Serialisierung. Genau so entsteht eine Zusage, die
  // gruen ist, ohne etwas zu beweisen.
  const goed = readFileSync(storeFile, 'utf8');
  const broken = await namespace[uebergabe.UEBERGABE_METHOD]({ ...second, xp: 'viel' });
  assert.equal(broken.ok, false, 'ein Vertragsbruch kommt als Fehlerergebnis zurueck');
  assert.ok(broken.error, 'und der Fehlerzweig ist gefuellt');
  assert.equal(
    broken.error.message.startsWith('client api:'),
    false,
    'die Absage kommt vom HOST, nicht aus dem lokalen Carrier (der lokale Zweig beginnt mit "client api:")',
  );
  assert.equal(readFileSync(storeFile, 'utf8'), goed, 'das Medium blieb unberuehrt');

  // Nach der Ablehnung nimmt dieselbe Naht einen gueltigen Stand weiter an:
  // eine Absage darf den Empfaenger nicht vergiften.
  const erholt = await namespace[uebergabe.UEBERGABE_METHOD]({ ...second, xp: second.xp + 1 });
  assert.equal(erholt.ok, true, 'nach der Ablehnung geht ein gueltiger Stand noch durch');
  assert.equal(readMedium().xp, second.xp + 1, 'und er steht auf dem Medium');

  await unmount();
  assert.equal(client.get(`remote.${uebergabe.UEBERGABE_NAMESPACE}`), undefined, 'nach dem Abbau ist der Namensraum weg');
  // Den Client-Root abbauen: das beendet die Ereignis-Generation der Verbindung
  // (ein Cordis-Kontext ist ein Fiber, kein Objekt mit `dispose`).
  await client.fiber.dispose();
  await disposeHost();
});

test('Zusage: Client und Host nennen dieselben Namen (die Dopplung driftet nicht)', { skip }, async () => {
  // Der Client traegt die Namen als Literal, weil sein Bundle selbststaendig ist.
  // Diese Zusage haelt beide Seiten zusammen: sie vergleicht das Bundle mit der
  // Quelle, aus der der Host liest.
  const source = readFileSync(CLIENT_FILE, 'utf8');
  assert.equal(source.includes(`const HOST_NAMESPACE = '${uebergabe.UEBERGABE_NAMESPACE}'`), true, 'der Namespace stimmt');
  assert.equal(source.includes(`const HOST_METHOD = '${uebergabe.UEBERGABE_METHOD}'`), true, 'die Methode stimmt');
  const host = await import(pathToFileURL(HOST_FILE).href);
  assert.equal(host.UEBERGABE_ENDPOINT, uebergabe.UEBERGABE_ENDPOINT, 'der Host exportiert denselben Endpunkt');
  assert.equal(host.SNAPSHOT_FIELDS, uebergabe.SNAPSHOT_FIELDS, 'und dieselbe Feldliste');
});
