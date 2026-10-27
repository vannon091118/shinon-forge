import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { loadClientBundle, requireStub } from './helpers/client-sandbox.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function announceOf(packageName) {
  const source = readFileSync(new URL(`../../../packages/${packageName}/client.js`, import.meta.url), 'utf8');
  const match = source.match(/function announce\(detail\) \{[\s\S]*?\n    \}/);
  assert.ok(match, `${packageName} hat keine announce-Funktion`);
  const id = `@shinon/${packageName}`;
  const label = packageName === 'popup' ? 'Shinon Popup' : 'Traceability-Toasts';
  const panel = packageName === 'popup' ? 'shinon-popup' : 'shinon-traceability-toasts';
  const events = [];
  const window = { __shinonPlugins: new Map(), dispatchEvent: (event) => events.push(event.type) };
  const CustomEvent = class { constructor(type) { this.type = type; } };
  const announce = new Function('window', 'CustomEvent', 'PLUGIN', 'LABEL', 'PANEL_ID', 'SLOT_ID', `return (${match[0]});`)(window, CustomEvent, id, label, panel, panel);
  announce('registered');
  return { window, events };
}

test('Popup und Traceability erscheinen in der Dashboard-Registry', () => {
  for (const packageName of ['popup', 'traceability']) {
    const { window, events } = announceOf(packageName);
    const id = `@shinon/${packageName}`;
    assert.ok(window.__shinonPlugins.has(id), `${id} fehlt in __shinonPlugins`);
    assert.equal(window.__shinonPlugins.get(id).kind, 'client');
    assert.ok(events.includes('shinon:plugin'), `${id} sendet kein Dashboard-Update`);
    const source = readFileSync(new URL('../../../packages/dashboard/client.js', import.meta.url), 'utf8');
    assert.match(source, new RegExp(`id: '${id.replace('/', '\\/')}'.*active: true`));
  }
});

test('das Dashboard-Inventar entspricht allen Paketen und dem Shinon-Profil', () => {
  const source = readFileSync(new URL('../../../packages/dashboard/client.js', import.meta.url), 'utf8');
  const match = /const EXPECTED = (\[[\s\S]*?\n    \]);/.exec(source);
  assert.ok(match, 'Dashboard-Inventar fehlt');
  const entries = vm.runInNewContext(match[1]);
  const ids = entries.map((entry) => entry.id);
  const packages = readdirSync(new URL('../../../packages/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => JSON.parse(readFileSync(new URL(`../../../packages/${entry.name}/package.json`, import.meta.url), 'utf8')).name)
    .sort();
  assert.equal(new Set(ids).size, ids.length, 'doppelte Dashboard-Einträge');
  assert.deepEqual([...ids].sort(), packages, 'Dashboard-Inventar und Paketbestand driften');
  const profile = JSON.parse(readFileSync(new URL('../../../profiles/shinon/package.json', import.meta.url), 'utf8'));
  const expectedActive = profile.dsh.profile.bundles.filter((id) => id.startsWith('@shinon/')).sort();
  assert.deepEqual(Array.from(entries.filter((entry) => entry.active).map((entry) => entry.id)).sort(), expectedActive);
  assert.ok(entries.every((entry) => typeof entry.active === 'boolean' && typeof entry.label === 'string' && entry.label !== ''));
});

test('Key-Router und Diff-Übersicht melden ihre tatsächliche Client-Aktivierung', () => {
  for (const [dir, panel] of [['key-router', null], ['diff-overview', 'shinon-diff-overview']]) {
    const { registration, sandbox } = loadClientBundle(dir);
    const page = sandbox.sandbox;
    const events = [];
    page.dispatchEvent = (event) => { events.push(event); return true; };
    const slots = { inject: (_name, callback) => callback(), register: () => {} };
    registration.factory(requireStub()).apply({ slots });
    const entry = page.__shinonPlugins?.get(registration.id);
    assert.equal(entry?.kind, 'client', `${dir} fehlt in der Dashboard-Registry`);
    assert.equal(entry.panel, panel);
    assert.ok(events.some((event) => event.type === 'shinon:plugin' && event.detail?.id === registration.id));
  }
});

test('angemeldete, nicht erwartete Pakete werden nicht als inaktiv angezeigt', () => {
  const source = readFileSync(new URL('../../../packages/dashboard/client.js', import.meta.url), 'utf8');
  const match = /function PluginSection\(\) \{[\s\S]*?\n    \}/.exec(source);
  assert.ok(match);
  const entries = [{ id: '@shinon/mobile', label: 'Mobile', active: false }];
  const map = new Map([['@shinon/mobile', { label: 'Mobile', panel: null }]]);
  const h = (type, props, ...children) => ({ type, props, children });
  const section = new Function('useRegistry', 'EXPECTED', 'h', `return (${match[0]})();`)(() => ({ map }), entries, h);
  assert.match(JSON.stringify(section), /laeuft \(nicht im Profil erwartet\)/);
  assert.doesNotMatch(JSON.stringify(section), /inaktiv \(nicht im Profil\)/);
});

test('beide Plugins schreiben nicht mehr in die ungenutzte Panel-Katalogtabelle', () => {
  for (const packageName of ['popup', 'traceability']) {
    const source = readFileSync(new URL(`../../../packages/${packageName}/client.js`, import.meta.url), 'utf8');
    assert.ok(!source.includes('__shinonPluginCatalog'), `${packageName} führt weiter eine zweite Registry`);
  }
});
