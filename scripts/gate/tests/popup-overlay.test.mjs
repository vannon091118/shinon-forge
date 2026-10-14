#!/usr/bin/env node
/**
 * popup-overlay — das Popup rendert WIRKLICH, und zwar an der Naht, die es kennt.
 *
 * WARUM DIESE DATEI EXISTIERT: `@shinon/popup` hiess „Trajectory-Overlay" und
 * hatte keinen Renderer. Der Host emittierte Eintraege auf `shinon/trajectory`,
 * die Client-Haelfte sagte in ihrem eigenen Kopf, dass sie sie nicht rendert, und
 * das Paket erklaerte sich im Manifest als `inactive`. Genau dieser Zustand ist
 * von einem kaputten nicht zu unterscheiden — kein Fehler, keine Warnung, kein
 * roter Test, nur eine leere Flaeche.
 *
 * GEPRUEFT WIRD DAS AUSGELIEFERTE BUNDLE (`__ModuleLoader__` -> `apply`), nicht
 * eine Kopie der Logik:
 *
 *   1. NAHT — der Slot, den das PROFIL wirksam setzt, ist derselbe, in dem sich
 *      die Client-Haelfte anmeldet. Die Haelfte kann den Host nicht importieren;
 *      ein anderer Slot im Profil liesse das Overlay still ins Leere rendern.
 *   2. SPRACHE — der Text kommt aus dem Woerterbuch (`popup.running`), die ZAHLEN
 *      aus der Sitzung; ohne Locale-Dienst gilt der deutsche Fallback der
 *      generierten Tabelle. Beide Wege werden gerendert und verglichen.
 *   3. VERHALTEN — mit einem laufenden Turn erscheint der Fortschritt, ohne Turn
 *      erscheint NICHTS (ein leeres Overlay sagt nichts aus), und ein beendeter
 *      Turn ist kein Vorgang.
 *   4. ZERLEGUNG — das Fenster liefert `tool/call` und `tool/result`
 *      (geschlossen ueber `data.message.source.callId`); die Anzeige nennt
 *      Schritt, offene Aufrufe und das zuletzt benutzte Werkzeug.
 *
 * Was der Test NICHT beweist (ehrlich): dass der Browser das Overlay malt. Er
 * fuehrt die Komponente mit einer React-Attrappe aus und vergleicht den Baum; die
 * Aktivierung am ECHTEN Cordis-Proxy (mit `slots`/`locale` aus einer Fiber)
 * prueft `client-activation.test.mjs` fuer jede Client-Haelfte, auch diese.
 *
 * Laeuft mit `node --test` (CI: .github/workflows/commit-guard.yml), in der
 * Gate-Suite `npm run gate:test`. Kein Netz, kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePatchFile } from '../../lib/repo.mjs';
import { loadClientBundle, requireStub } from './helpers/client-sandbox.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** Der wirksame Slot aus dem Profil (die ENTSCHEIDUNG, nicht der Schema-Default). */
function profileSlot() {
  const { patches, issues } = parsePatchFile(join(ROOT, 'profiles/shinon/cordis.patch.yml'));
  assert.deepEqual(issues, [], 'das Profil ist nicht lesbar');
  const entry = patches.find((patch) => patch.id === 'shinon-popup');
  assert.ok(entry !== undefined, 'profiles/shinon/cordis.patch.yml hat keinen shinon-popup-Eintrag');
  assert.equal(typeof entry.config?.slotName, 'string', 'der Popup-Eintrag nennt keinen Slot');
  return entry.config.slotName;
}

/** Der Slot, den die Client-Haelfte als Literal traegt (sie kann index.js nicht importieren). */
function clientSlot() {
  const match = /const DOCK_SLOT = '([^']+)';/.exec(read('packages/popup/client.js'));
  assert.ok(match !== null, 'packages/popup/client.js: DOCK_SLOT fehlt');
  return match[1];
}

/** Der Schema-Default des Hosts — der Besitzer des Namens (Zwillings-Regel). */
function defaultSlot() {
  const match = /export const DEFAULT_SLOT = '([^']+)';/.exec(read('packages/popup/index.js'));
  assert.ok(match !== null, 'packages/popup/index.js: DEFAULT_SLOT fehlt');
  return match[1];
}

const entry = (event) => ({ type: 'event', event });
const call = (callId, name) => entry({ type: 'tool/call', data: { turn: 1, step: 1, callId, name } });
const result = (callId) => entry({ type: 'tool/result', data: { message: { source: { callId } } } });

/**
 * Ein Context mit GENAU der Flaeche, die diese Haelfte anfasst (gezaeunt aus dem
 * Quelltext): `slots.inject`/`slots.register` und `ctx.get(name)` fuer die
 * Sitzungs-Naht und den Locale-Dienst. Kein Cordis — die echte Aktivierung prueft
 * `client-activation.test.mjs`.
 */
function contextOf({ entries = [], locale = null } = {}) {
  const registered = [];
  const session = { eventSource: { getSnapshot: () => ({ entries }) } };
  const ctx = {
    slots: {
      inject(_key, callback) { callback(); return () => {}; },
      register(options, component) { registered.push({ options, component }); return () => {}; },
    },
    get(name) {
      if (name === 'locale') return locale;
      if (name === 'uiSession') return { adapter: { current: { getSnapshot: () => ({ key: 's1' }) } } };
      if (name === 'sessions') return { binding: (id) => (id === 's1' ? session : undefined) };
      return undefined;
    },
  };
  return { ctx, registered };
}

/** Die Komponente so aufrufen, wie React es taete — mit der Attrappe des Loaders. */
function render(component) {
  return component({});
}

/** Den sichtbaren Text eines Elements einsammeln (Kinder koennen Strings sein). */
function textOf(tree) {
  if (tree === null || tree === undefined) return '';
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  return (tree.children ?? []).map(textOf).join('');
}

test('popup: Profil, Client-Literal und Host-Default nennen denselben Slot', () => {
  const slot = profileSlot();
  assert.equal(clientSlot(), slot, 'die Client-Haelfte meldet sich in einem anderen Slot an als das Profil setzt');
  assert.equal(defaultSlot(), slot, 'der Schema-Default des Hosts weicht vom wirksamen Slot ab');
});

test('popup: der Fortschrittstext hat einen Besitzer im Woerterbuch', () => {
  const dictionary = read('packages/locale-de/client.js');
  const key = /params=\{[^}]*"table":"OVERLAY_DE","key":"([^"]+)"/.exec(read('packages/popup/client.js'));
  assert.ok(key !== null, 'packages/popup/client.js: der Locale-Baustein des Overlays fehlt');
  assert.equal(
    dictionary.split(`'${key[1]}':`).length - 1,
    1,
    `"${key[1]}" muss genau einmal im Woerterbuch von @shinon/locale-de stehen`,
  );
  const text = new RegExp(`'${key[1]}': '([^']*)'`).exec(dictionary);
  for (const placeholder of ['{step}', '{open}', '{calls}', '{tool}']) {
    assert.ok(text[1].includes(placeholder), `dem Woerterbuch-Text fehlt ${placeholder}`);
  }
});

test('popup: das Overlay haengt im wirksamen Slot und rendert ohne Turn nichts', () => {
  const { registration } = loadClientBundle('popup');
  const { ctx, registered } = contextOf();
  registration.factory(requireStub()).apply(ctx);
  const entry = registered.find((item) => item.options.name === profileSlot());
  assert.ok(entry !== undefined, `keine Anmeldung im Slot ${profileSlot()}`);
  assert.equal(entry.options.id, 'shinon-popup-progress');
  assert.equal(render(entry.component), null, 'ohne laufenden Turn darf nichts erscheinen');
});

test('popup: mit einem laufenden Turn nennen Zahlen und Werkzeug den Fortschritt', () => {
  const { registration } = loadClientBundle('popup');
  const { ctx, registered } = contextOf({
    entries: [
      entry({ type: 'turn/start', data: { turn: 1 } }),
      entry({ type: 'step/start', data: { turn: 1, step: 2 } }),
      call('c1', 'read'),
      call('c2', 'bash'),
      result('c2'),
    ],
  });
  registration.factory(requireStub()).apply(ctx);
  const overlay = registered.find((item) => item.options.name === profileSlot()).component;
  const text = textOf(render(overlay));
  assert.match(text, /Vorgang läuft/, 'der deutsche Fallback-Text fehlt');
  assert.match(text, /Schritt 2/);
  assert.match(text, /1 offen/, 'nach dem result von c2 bleibt genau c1 offen');
  assert.match(text, /2 Aufrufe/);
  assert.match(text, /zuletzt read/, 'der laufende Aufruf ist der juengste offene');
  assert.ok(!text.includes('{'), `Platzhalter blieben stehen: ${text}`);
});

test('popup: der Text kommt aus der Registry, die Zahlen aus der Sitzung', () => {
  const { registration } = loadClientBundle('popup');
  const lookups = [];
  const locale = {
    bind: (namespace) => (key) => {
      lookups.push(`${namespace}.${key}`);
      return key === 'popup.running' ? 'REGISTRY {step}/{calls}/{open}/{tool}' : key;
    },
  };
  const { ctx, registered } = contextOf({
    entries: [entry({ type: 'turn/start', data: { turn: 4 } }), call('c9', 'grep')],
    locale,
  });
  registration.factory(requireStub()).apply(ctx);
  const overlay = registered.find((item) => item.options.name === profileSlot()).component;
  assert.equal(textOf(render(overlay)).includes('REGISTRY 0/1/1/grep'), true, 'Registry-Text + Werte erwartet');
  assert.ok(lookups.includes('shinon.popup.running'), `die Registry wurde nicht gefragt (${lookups.join(', ')})`);
});

test('popup: ein beendeter Turn ist kein Vorgang', () => {
  const { registration } = loadClientBundle('popup');
  const { ctx, registered } = contextOf({
    entries: [
      entry({ type: 'turn/start', data: { turn: 1 } }),
      call('c1', 'read'),
      entry({ type: 'turn/end', data: { turn: 1 } }),
    ],
  });
  registration.factory(requireStub()).apply(ctx);
  const overlay = registered.find((item) => item.options.name === profileSlot()).component;
  assert.equal(render(overlay), null, 'nach dem Turn-Ende bleibt das Overlay leer');
});


test('trajectory: der Host-Kanal ist Probe-API, keine Ende-zu-Ende-Behauptung', () => {
  const host = read('packages/popup/index.js');
  const client = read('packages/popup/client.js');
  const profile = read('profiles/shinon/cordis.patch.yml');
  assert.match(host, /trajectoryChannel: z\.string\(\)\.default\('shinon\/trajectory'\)/, 'der Host hält den benannten Probe-Kanal');
  assert.match(host, /ctx\.emit\(config\.trajectoryChannel/, 'der Host emittiert die Probe, wenn ein Test sie beobachtet');
  assert.match(profile, /trajectoryChannel: 'shinon\/trajectory'/, 'die Profil-Config nennt denselben Probe-Kanal');
  assert.match(client, /Probe-API ohne In-Tree-Konsument/, 'die Client-Doku stuft den Kanal als Probe-API ein');
  const clientRuntime = client.slice(client.indexOf('window.__ModuleLoader__.load'));
  assert.doesNotMatch(clientRuntime, /(?:\.on|\.subscribe)\s*\(\s*['\"]shinon\/trajectory/, 'der Client abonniert den Probe-Kanal nicht');
  assert.match(client, /readTrajectoryOf\(ctx\).*?eventSource/s, 'das Overlay liest stattdessen das Sitzungsfenster direkt');
});
