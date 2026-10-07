#!/usr/bin/env node
/**
 * Tests des Marker-Spiegels (Wave 3).
 *
 * Drei Ebenen:
 *   1. Vertrag + Gates (reine Funktionen): die echte Datei muss sauber sein,
 *      und jede mutierte Kopie muss Befunde liefern — ein Gate, das nie rot
 *      werden kann, ist Dekoration.
 *   2. Spiegel-Logik im echten Bundle: das Paket wird in ein Temp-Verzeichnis
 *      kopiert und mit einem Schemastery-Stub geladen (wie beim Event-Spine).
 *      Geprüft werden Ableitung, Prüfung, Nutzlast-Format und Fail-Closed.
 *   3. Client-Vertrag: Slot-Verdrahtung, Speicherschlüssel und die Nutzlast-
 *      Vorlage — Client und Vertrag dürfen nicht auseinanderlaufen.
 *
 * Läuft mit `node --test` — kein node_modules, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  MARK_FIELDS,
  MODEL_CONTRACT,
  PANEL_ID,
  PANEL_SLOTS,
  SOURCE_REPO,
  STORAGE_KEYS,
  clientIssues,
  hostIssues,
  modelIssues,
} from '../plugins/markers.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/markers/', import.meta.url));
const MODEL_FILE = join(PACKAGE_DIR, 'assets/marker-model.json');
const HOST_FILE = join(PACKAGE_DIR, 'index.js');
const CLIENT_FILE = join(PACKAGE_DIR, 'client.js');

const model = JSON.parse(readFileSync(MODEL_FILE, 'utf8'));
const hostSource = readFileSync(HOST_FILE, 'utf8');
const clientSource = readFileSync(CLIENT_FILE, 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Bundle isoliert laden: Kopie + Schemastery-Stub (nur Config-Konstruktion). */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-markers-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  const stub = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-stub', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(stub, 'index.js'), 'const p = new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : p), apply: () => p, construct: () => p });\nexport default p;\n');
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

/** Ausgaben stumm schalten, Rückgabe trotzdem einsammeln. */
function quiet(fn) {
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

const bundle = await loadBundle();
const limits = bundle.limitsOf(model);

const validMark = (extra = {}) => ({
  id: 'm1',
  label: 'div#app.card',
  selector: 'div#app > span.card:nth-of-type(2)',
  text: 'ein Text',
  rect: { x: 10, y: 20, w: 30, h: 40 },
  href: null,
  url: 'http://localhost:5173/',
  ts: '2026-10-07T00:00:00.000Z',
  ...extra,
});

// ── 1. Vertrag ───────────────────────────────────────────────────────────────

test('markers: der echte Vertrag ist sauber', () => {
  assert.deepEqual(modelIssues(model), []);
  assert.equal(model.contract, MODEL_CONTRACT);
  assert.equal(model.authority, 'NONE');
  assert.equal(model.source.repo, SOURCE_REPO);
  assert.deepEqual(model.fields.map((field) => field.name), MARK_FIELDS);
});

test('markers: der Vertrag trägt die gespiegelten Regeln, nicht nur Namen', () => {
  assert.equal(model.derivation.selector.maxParts, 6);
  assert.equal(model.derivation.selector.skipClassPrefix, '__mk');
  assert.equal(model.inbox.method, 'POST');
  assert.deepEqual(model.inbox.body, ['text', 'marks']);
  assert.deepEqual(Object.values(model.storage), [...STORAGE_KEYS]);
  assert.equal(model.keys.toggle, 'm');
  assert.ok(model.forbidden.includes('cdp_attach'), 'CDP/Daemon muss ausdrücklich ausgeschlossen sein');
  assert.ok(model.source.not_copied.some((entry) => /CDP/i.test(entry)), 'nicht Übernommenes muss benannt sein');
  assert.ok(model.invariants.length >= 3);
});

test('markers: jede Vertragsverletzung wird gefunden', () => {
  const cases = {
    'authority FULL': (asset) => { asset.authority = 'FULL'; },
    'Feld entfernt': (asset) => { asset.fields = asset.fields.filter((field) => field.name !== 'selector'); },
    'Feld erfunden': (asset) => { asset.fields.push({ name: 'bonus' }); },
    'rect-Shape': (asset) => { asset.fields.find((field) => field.name === 'rect').shape = ['x', 'y']; },
    'Selektor-Grenze': (asset) => { asset.derivation.selector.maxParts = 2; },
    'payload.line leer': (asset) => { asset.payload.line = ''; },
    'Token ohne Vorlage': (asset) => { asset.payload.tokens.push('NIRGENDS'); },
    'inbox GET': (asset) => { asset.inbox.method = 'GET'; },
    'Speicherschlüssel weg': (asset) => { delete asset.storage.commentsKey; },
    'Grenze null': (asset) => { asset.limits.text = 0; },
    'invariants leer': (asset) => { asset.invariants = []; },
    'Quelle getauscht': (asset) => { asset.source.repo = 'irgendwer/etwas'; },
    'not_copied leer': (asset) => { asset.source.not_copied = []; },
    'cdp_attach erlaubt': (asset) => { asset.forbidden = asset.forbidden.filter((entry) => entry !== 'cdp_attach'); },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const asset = clone(model);
    mutate(asset);
    assert.ok(modelIssues(asset).length > 0, `nicht erkannt: ${name}`);
  }
});

test('markers: unbekannte Grenze und doppeltes Feld fallen auf', () => {
  assert.ok(modelIssues(null).length > 0);
  const doubled = clone(model);
  doubled.fields.push({ name: 'id' });
  assert.ok(modelIssues(doubled).length > 0, 'ein doppeltes Feld ist ein Vertragsbruch');
});

// ── 2. Host ──────────────────────────────────────────────────────────────────

test('markers: der Host hält die Grenze ein', () => {
  assert.deepEqual(hostIssues(hostSource), []);
});

test('markers: ein Host, der schreibt oder handelt, wird rot', () => {
  for (const bad of ['writeFileSync("x", "y");', 'fetch("http://example.com");', 'Math.random();', 'process.exit(1);', 'import { execSync } from "node:child_process";']) {
    assert.ok(hostIssues(`${hostSource}\n${bad}`).length > 0, `nicht erkannt: ${bad}`);
  }
  assert.deepEqual(hostIssues(`${hostSource}\n// writeFileSync ist hier nur ein Kommentar.`), [], 'Kommentare sind keine Aufrufe');
});

// ── 3. Client ────────────────────────────────────────────────────────────────

test('markers: der Client verdrahtet den nativen Side Panel', () => {
  assert.deepEqual(clientIssues(clientSource, model), []);
  assert.ok(clientSource.includes("ctx.slots.inject('main'"), 'main-Slot fehlt');
  assert.ok(clientSource.includes('sidebar.panellist'), 'Side-Panel-Eintrag fehlt');
});

test('markers: ein Client ohne Panel oder mit DOM-Injektion wird rot', () => {
  const withoutSlots = "window.__ModuleLoader__.load({ id: '@shinon/markers', factory() { return { apply() {} }; } });";
  assert.ok(clientIssues(withoutSlots, model).length > 0);
  assert.ok(clientIssues(`${clientSource}\ndocument.body.innerHTML = 'x';`, model).some((issue) => issue.includes('innerHTML')));
  assert.ok(
    clientIssues(`${clientSource}\nlocalStorage.setItem('zweiter', JSON.stringify([]));`, model).some((issue) => issue.includes('zweiter')),
    'ein zweiter Speicherschlüssel muss auffallen',
  );
  assert.ok(clientIssues(`${clientSource}\nsessionStorage.setItem('x', 'y');`, model).length > 0, 'zweiter Speicher (sessionStorage)');
  assert.ok(clientIssues(`${clientSource}\nfetch('http://example.com', {});`, model).length > 0, 'Netz außerhalb der Inbox');
  const drifted = clone(model);
  drifted.payload.tokens.push('ZWEITES-FORMAT');
  assert.ok(clientIssues(clientSource, drifted).some((issue) => issue.includes('driften')), 'Drift zwischen Vertrag und Client');
});

test('markers: Client und Vertrag tragen dieselbe Nutzlast-Vorlage', () => {
  for (const token of model.payload.tokens) {
    assert.ok(clientSource.includes(token), `Token fehlt im Client: ${token}`);
  }
  for (const slot of [...PANEL_SLOTS, PANEL_ID, ...STORAGE_KEYS]) {
    assert.ok(clientSource.includes(slot), `Vertragswert fehlt im Client: ${slot}`);
  }
});

// ── 4. Spiegel-Logik (echtes Bundle) ─────────────────────────────────────────

test('markers: ids wachsen monoton — eine vergebene id wird nie wiederverwendet', () => {
  assert.equal(bundle.nextMarkId([]), 'm1');
  assert.equal(bundle.nextMarkId([{ id: 'm1' }]), 'm2');
  assert.equal(bundle.nextMarkId([{ id: 'm3' }, { id: 'm1' }]), 'm4');
  assert.equal(bundle.nextMarkId([{ id: 'quatsch' }]), 'm1', 'unlesbare id zählt nicht');
});

test('markers: Normalisierung kürzt Text, normalisiert Whitespace und rundet Rect', () => {
  const mark = bundle.normalizeMark({ text: `a\n   b\tc ${'x'.repeat(300)}`, rect: { x: 1.4, y: 2.6, w: 3.2, h: 4.5 } }, { model, limits });
  assert.equal(mark.text.length, limits.text);
  assert.ok(mark.text.startsWith('a b c x'));
  assert.deepEqual(mark.rect, { x: 1, y: 3, w: 3, h: 5 });
});

test('markers: die Prüfung ist fail-closed', () => {
  assert.deepEqual(bundle.validateMark(bundle.normalizeMark(validMark(), { model, limits }), { model, limits }), []);
  const cases = {
    MISSING_SELECTOR: validMark({ selector: '  ' }),
    MISSING_LABEL: validMark({ label: '' }),
    INVALID_ID: validMark({ id: 'x1' }),
    'INVALID_RECT:x': validMark({ rect: { x: 'zehn', y: 2, w: 3, h: 4 } }),
    'INVALID_RECT:h': validMark({ rect: { x: 1, y: 2, w: 3 } }),
    SELECTOR_TOO_DEEP: validMark({ selector: 'a > b > c > d > e > f > g' }),
    INVALID_TS: validMark({ ts: 'irgendwann' }),
    MISSING_URL: validMark({ url: '' }),
  };
  for (const [expected, raw] of Object.entries(cases)) {
    const issues = bundle.validateMark(bundle.normalizeMark(raw, { model, limits }), { model, limits });
    assert.ok(issues.includes(expected), `${expected} nicht erkannt (war: ${issues.join(', ')})`);
  }
});

test('markers: die Nutzlast ist exakt Brutalords Zeilenformat', () => {
  const marks = [validMark(), validMark({ id: 'm2', label: 'button.buy', selector: 'div#app > button.buy', rect: { x: 0, y: 0, w: 8, h: 9 } })];
  const comments = { m1: 'sieht falsch aus' };
  const expected = [
    '- **m1**  › div#app.card  ·  10,20 30×40  —  sieht falsch aus\n  Selector: div#app > span.card:nth-of-type(2)',
    '- **m2**  › button.buy  ·  0,0 8×9\n  Selector: div#app > button.buy',
  ].join('\n');
  assert.equal(bundle.renderPayload(marks, comments, model), expected);
});

test('markers: der Spiegel nimmt keine ungültige Marke an', () => {
  const mirror = bundle.createMirror(model, { markLimit: 200 });
  assert.equal(mirror.add(validMark()).id, 'm1');
  assert.equal(mirror.add(validMark({ selector: '' })), null, 'ohne Selektor gibt es keine Marke');
  assert.equal(mirror.list().length, 1);
  assert.equal(mirror.stats.dropped, 1);
  assert.equal(mirror.stats.reasons.MISSING_SELECTOR, 1);
  assert.ok(mirror.stats.lastDrop.detail.startsWith('m1'), 'der Befund nennt die Marke');
});

test('markers: doppelte ids und die Marken-Grenze werden abgewiesen', () => {
  const mirror = bundle.createMirror(model, { markLimit: 2 });
  mirror.add(validMark());
  assert.equal(mirror.add(validMark({ label: 'andere' })), null, 'm1 doppelt');
  assert.equal(mirror.stats.reasons.DUPLICATE_ID, 1);
  mirror.add(validMark({ id: 'm2' }));
  assert.equal(mirror.add(validMark({ id: 'm3' })), null, 'Grenze 2');
  assert.equal(mirror.stats.reasons.MARK_LIMIT, 1);
  assert.deepEqual(mirror.list().map((mark) => mark.id), ['m1', 'm2']);
});

test('markers: Kommentare gehören zur Marke und verschwinden mit ihr', () => {
  const mirror = bundle.createMirror(model);
  mirror.add(validMark());
  mirror.comment('m1', '  ein Kommentar  ');
  assert.equal(mirror.comments().m1, 'ein Kommentar');
  assert.ok(mirror.render().includes('—  ein Kommentar'));
  mirror.comment('m1', ' ');
  assert.deepEqual(mirror.comments(), {});
  mirror.add(validMark({ id: 'm2' }));
  mirror.comment('m2', 'weg damit');
  assert.equal(mirror.remove('m2'), 'm2');
  assert.deepEqual(mirror.comments(), {});
  assert.equal(mirror.remove('m9'), null);
  assert.equal(mirror.stats.reasons.UNKNOWN_ID, 1);
});

test('markers: der Kommentar ist auf die Vertragsgrenze gekürzt', () => {
  const mirror = bundle.createMirror(model);
  mirror.add(validMark());
  mirror.comment('m1', 'k'.repeat(900));
  assert.equal(mirror.comments().m1.length, model.limits.comment);
});

test('markers: clear räumt Marken und Kommentare', () => {
  const mirror = bundle.createMirror(model);
  mirror.add(validMark());
  mirror.comment('m1', 'x');
  assert.equal(mirror.clear(), true);
  assert.deepEqual(mirror.list(), []);
  assert.deepEqual(mirror.comments(), {});
  assert.equal(mirror.nextId(), 'm1');
});

// ── 5. Mount (echte apply-Schnittstelle) ─────────────────────────────────────

test('markers: apply lädt den Vertrag und räumt beim Abbau auf', () => {
  const mirror = quiet(() => bundle.apply({}, { modelPath: './assets/marker-model.json', inboxUrl: 'http://127.0.0.1:9333/inbox', textLimit: 200, markLimit: 200, panelLabel: 'Shinon Marker', panelOrder: 30 }));
  assert.equal(typeof mirror, 'function', 'ein Disposer muss zurückkommen');
  assert.equal(mirror(), undefined);
});

test('markers: fehlender Vertrag ist fail-open für den Host, nicht fail-loud', () => {
  const dispose = quiet(() => bundle.apply({}, { modelPath: './assets/gibt-es-nicht.json', inboxUrl: 'http://127.0.0.1:9333/inbox', textLimit: 200, markLimit: 200, panelLabel: 'x', panelOrder: 30 }));
  assert.equal(typeof dispose, 'function');
  assert.equal(dispose(), undefined);
});
