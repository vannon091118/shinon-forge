#!/usr/bin/env node
/**
 * panel-check.mjs — beweist, dass der Marker-Spiegel wirklich ankommt.
 *
 * Drei Stufen, jede mit echtem Beleg statt Behauptung:
 *
 *   1. Auslieferung: gegen die laufende DSH-Web-UI (Token-Flow wie im Browser)
 *      wird die Seite geholt und geprüft, dass `@shinon/markers/client.js` in
 *      der Modul-Preload-Liste steht.
 *   2. Code im Bundle: das ausgelieferte Client-Bundle muss den Panel-Code
 *      enthalten (Panel-ID, Side-Panel-Slot, Panel-Klasse).
 *   3. Rendering: das gebaute Artefakt `dist/packages/markers/client.js` wird in
 *      einer DOM-Umgebung ausgeführt — Plugin laden, Slots einsammeln, Panel
 *      rendern, `m`-Modus schalten, Element anklicken und die Nutzlast prüfen.
 *      Dafür werden `jsdom`, `react` und `react-dom` gebraucht; ihr
 *      node_modules-Verzeichnis kommt über `--jsdom-root` (das Repo bleibt
 *      abhängigkeitsfrei). Ohne `--jsdom-root` laufen nur Stufe 1 und 2.
 *
 * Aufruf (DSH-Web-UI muss laufen, z. B. über `npm run dev` oder die Preview):
 *
 *   node scripts/panel-check.mjs --url http://127.0.0.1:5173 --token <token>
 *   node scripts/panel-check.mjs --url … --token … --jsdom-root /tmp/panelcheck/node_modules
 *
 * Exit 0 = alle ausgeführten Stufen grün, 1 = Befund, 2 = Bedienfehler.
 * Der Token steht in der Startzeile der UI: `dsh web: http://…/?token=…`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT = join(ROOT, 'dist/packages/markers/client.js');

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};

const url = valueOf('--url') ?? 'http://127.0.0.1:5173';
const token = valueOf('--token');
const jsdomRoot = valueOf('--jsdom-root');

if (args.includes('--help') || args.includes('-h')) {
  console.log('node scripts/panel-check.mjs --url <base-url> --token <token> [--jsdom-root <node_modules>]');
  process.exit(0);
}
if (!token) {
  console.error('💥 panel-check: --token fehlt (steht in der Startzeile: dsh web: http://…/?token=…)');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail === '' ? '' : `  ${detail}`}`);
};

/** Seite im Browser-Stil holen: Token-URL setzt das Cookie, dann die Seite. */
async function fetchPage(base, tokenValue) {
  const first = await fetch(`${base}/?token=${encodeURIComponent(tokenValue)}`, { redirect: 'manual' });
  const cookie = (first.headers.getSetCookie?.() ?? []).map((entry) => entry.split(';')[0]).join('; ');
  const page = await fetch(`${base}/`, { headers: cookie === '' ? {} : { cookie } });
  return { cookie, status: page.status, html: await page.text() };
}

// ── Stufe 1 + 2: Auslieferung ────────────────────────────────────────────────

console.log(`\n🔎 panel-check — ${url}\n`);

const page = await fetchPage(url, token);
check('Token-Flow: Seite erreichbar', page.status === 200, `HTTP ${page.status}`);
if (page.status !== 200) {
  console.error(`\n💥 panel-check: ${page.html.slice(0, 120).replace(/\n/g, ' ')}`);
  console.error('   Stimmt die URL/das Token? Die UI neu starten und die tokenisierte URL verwenden.');
  process.exit(1);
}

const modules = [...page.html.matchAll(/plugins\/\?\?([^"]+)/g)].map((match) => decodeURIComponent(match[1]));
check('Modul-Liste gefunden', modules.length > 0, `${modules.length} Module`);
check('@shinon/markers/client.js ist in der Preload-Liste', modules.some((entry) => entry.includes('@shinon/markers/client.js')));

const bundleHref = page.html.match(/href="(plugins\/\?\?[^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
if (bundleHref === undefined) {
  check('Client-Bundle verlinkt', false, 'kein plugins/??-Link in der Seite');
} else {
  const bundle = await fetch(new URL(bundleHref, `${url}/`).href, { headers: page.cookie === '' ? {} : { cookie: page.cookie } });
  const body = await bundle.text();
  check('Client-Bundle lädt', bundle.status === 200, `HTTP ${bundle.status}, ${body.length} Bytes`);
  for (const token2 of ['shinon-markers', 'sidebar.panellist', '__mk_panel']) {
    check(`Bundle enthält ${token2}`, body.includes(token2));
  }
}

// ── Stufe 3: Rendering des Artefakts ─────────────────────────────────────────

if (jsdomRoot === undefined) {
  console.log('\nℹ️  Ohne --jsdom-root entfällt die Render-Stufe (jsdom, react, react-dom nötig).');
} else if (!existsSync(ARTIFACT)) {
  check('Artefakt vorhanden', false, `${ARTIFACT} fehlt — erst npm run build`);
} else {
  const require = createRequire(join(jsdomRoot, 'noop.cjs'));
  const { JSDOM } = require('jsdom');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');

  const dom = new JSDOM('<!doctype html><html><body><div id="app" class="card">Ein Element</div></body></html>', {
    url: 'http://127.0.0.1:5173/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  let plugin = null;
  window.__ModuleLoader__ = { load: (definition) => { plugin = definition; } };
  window.eval(readFileSync(ARTIFACT, 'utf8'));
  check('Client-Hälfte registriert sich am ModuleLoader', plugin !== null && plugin.id === '@shinon/markers');

  const slots = [];
  const ctx = {
    slots: {
      inject: (name, register) => { register(); },
      register: (options, component) => { slots.push({ options, component }); return () => {}; },
    },
  };
  plugin.factory((specifier) => {
    if (specifier === 'react') return React;
    throw new Error(`unerwarteter require: ${specifier}`);
  }).apply(ctx);

  const panel = slots.find((slot) => slot.options.name === 'main');
  const entry = slots.find((slot) => slot.options.name === 'sidebar.panellist');
  check('main-Slot registriert (nativer Panel-Platz)', panel !== undefined && panel.options.key === 'shinon-markers');
  check('sidebar.panellist registriert (Side-Panel-Einstieg)', entry !== undefined && typeof entry.options.label === 'function');
  check('Styles injiziert (data-plugin-css)', window.document.querySelector('style[data-plugin-css="@shinon/markers/marker.css"]') !== null);
  check('Fenster-API window.__mk vorhanden', typeof window.__mk === 'object' && typeof window.__mk.marks === 'function');

  const markup = renderToStaticMarkup(React.createElement(panel.component));
  const host = window.document.createElement('div');
  host.innerHTML = markup;
  check('Panel rendert', host.querySelector('.__mk_panel') !== null, `Panel-Klasse im DOM`);
  check('Panel zeigt "MARKS 0"', host.textContent.includes('MARKS 0'));
  check('Panel nennt die Rolle (Spiegel-Kennung)', host.textContent.includes('@shinon/markers'));
  check('Panel trägt die Bedienhinweise', host.textContent.includes('m drücken') && host.textContent.includes('Escape'));

  // Interaktion im DOM: m schaltet den Modus, Klick setzt eine Marke.
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true }));
  check('Taste m schaltet den Markier-Modus', window.__mk.mode() === true && window.document.documentElement.classList.contains('__mk_on'));

  const target = window.document.querySelector('#app');
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const marks = window.__mk.marks();
  check('Klick setzt eine Marke im Speicher', marks.length === 1, marks.length === 1 ? `${marks[0].id} ${marks[0].label}` : `marks=${marks.length}`);
  check('Marke trägt Selektor, Rect und Zeitstempel', marks.length === 1 && marks[0].selector.startsWith('#app') && Number.isInteger(marks[0].rect.w) && !Number.isNaN(Date.parse(marks[0].ts)));

  const payload = window.__mk.payload();
  check('Nutzlast im Brutalord-Format', /^- \*\*m1\*\*  › div#app\.card  ·  -?\d+,-?\d+ \d+×\d+\n  Selector: #app/.test(payload), JSON.stringify(payload.slice(0, 60)));

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Escape beendet den Modus', window.__mk.mode() === false && !window.document.documentElement.classList.contains('__mk_on'));
}

// ── Ergebnis ─────────────────────────────────────────────────────────────────

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${failed.length === 0 ? '✅' : '💥'} panel-check: ${results.length - failed.length}/${results.length} grün`);
for (const entry of failed) console.log(`   - ${entry.name}${entry.detail === '' ? '' : ` (${entry.detail})`}`);
process.exit(failed.length === 0 ? 0 : 1);
