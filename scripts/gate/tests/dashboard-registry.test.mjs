import { readFileSync } from 'node:fs';
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

test('beide Plugins schreiben nicht mehr in die ungenutzte Panel-Katalogtabelle', () => {
  for (const packageName of ['popup', 'traceability']) {
    const source = readFileSync(new URL(`../../../packages/${packageName}/client.js`, import.meta.url), 'utf8');
    assert.ok(!source.includes('__shinonPluginCatalog'), `${packageName} führt weiter eine zweite Registry`);
  }
});
