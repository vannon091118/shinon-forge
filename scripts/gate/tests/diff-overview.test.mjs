#!/usr/bin/env node
/**
 * diff-overview — das Panel entscheidet über GIT, und der Client erfindet nichts.
 *
 * WARUM DIESE DATEI EXISTIERT: das Panel behauptet, es baue keinen Diff, sondern
 * frage `git`. Genau das ist die Zusage, die man nicht am Quelltext ablesen kann:
 * ein Parser kann zu Git passen und trotzdem falsch zählen, und ein Panel kann
 * hübsch aussehen und eine 0 für eine unversionierte Datei erfinden.
 *
 * GEPRÜFT WIRD:
 *
 *   1. MESSUNG — ein echter Wegwerf-Git-Baum: geänderte, gelöschte, binäre und
 *      unversionierte Dateien. Die Übersicht zählt nur, was Git gezählt hat, und
 *      nennt für den Rest den Grund.
 *   2. HUNKS — die Zeilen einer Datei kommen aus `git diff --unified`, mit Marken.
 *   3. GRENZEN — Datei-Obergrenze und Ausbruch (`..`, absolut) werden gemeldet,
 *      nicht still gekürzt und nicht ausgeliefert.
 *   4. ABWESENHEIT — kein Git-Baum und ein Baum ohne HEAD sind zwei verschiedene
 *      Aussagen, und beide stehen da.
 *   5. CLIENT — das ausgelieferte Bundle meldet sich in der Kopfzeile des
 *      Datei-Browsers an, zeigt im Ruhezustand nur die Zahlen, öffnet auf Klick
 *      die Liste, öffnet eine Datei auf Klick und sagt bei einem stummen Host
 *      den Status statt „alles unverändert".
 *
 * Läuft mit `node --test`; braucht `git` (sonst sichtbarer Skip), kein
 * node_modules, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { gitScope, hasGit, readFileDiff, readOverview, safeInside } from '../../../packages/diff-overview/assets/git-diff.js';
import { loadClientBundle, requireStub } from './helpers/client-sandbox.mjs';

const GIT = hasGit();
const SLOT = 'sidebar.right.tab.files.actions';

/**
 * Ein echter Git-Baum mit allen vier Fällen: geändert, gelöscht, binär,
 * unversioniert. Kein Mock — die Ausgabe, die der Parser liest, kommt von Git.
 * @returns {string} Verzeichnis (wird nach dem Test gelöscht)
 */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-diff-'));
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'gate@shinon.test');
  git('config', 'user.name', 'Gate');
  writeFileSync(join(dir, 'a.txt'), 'eins\nzwei\ndrei\n');
  writeFileSync(join(dir, 'weg.txt'), 'x\n');
  writeFileSync(join(dir, 'bin.dat'), Buffer.from([0, 1, 2]));
  git('add', '-A');
  git('commit', '-qm', 'start');
  writeFileSync(join(dir, 'a.txt'), 'eins\nZWEI\ndrei\nvier\n');
  rmSync(join(dir, 'weg.txt'));
  writeFileSync(join(dir, 'neu.txt'), 'neu\n');
  writeFileSync(join(dir, 'bin.dat'), Buffer.from([0, 1, 3]));
  return dir;
}

test('die Wurzel wird als Git-Baum erkannt', { skip: GIT ? false : 'kein git im PATH' }, () => {
  const dir = makeRepo();
  try {
    assert.deepEqual(gitScope(dir), { repoRoot: dir, scope: 'WURZEL' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('die Übersicht zählt nur, was Git gezählt hat', { skip: GIT ? false : 'kein git im PATH' }, () => {
  const dir = makeRepo();
  try {
    const overview = readOverview(dir);
    assert.equal(overview.contract, 'shinon.diff/overview-v1');
    assert.equal(overview.reason, null);
    assert.equal(overview.source, 'git');
    assert.equal(overview.root, dir);
    const byPath = Object.fromEntries(overview.files.map((file) => [file.path, file]));
    assert.deepEqual(Object.keys(byPath).sort(), ['a.txt', 'bin.dat', 'neu.txt', 'weg.txt']);
    assert.deepEqual([byPath['a.txt'].added, byPath['a.txt'].removed], [2, 1]);
    assert.deepEqual([byPath['weg.txt'].added, byPath['weg.txt'].removed], [0, 1]);
    assert.equal(byPath['bin.dat'].counted, false, 'Binärdatei bekommt keine Zeilenzahl');
    assert.match(byPath['bin.dat'].note, /binär/);
    assert.equal(byPath['neu.txt'].counted, false, 'unversioniert bekommt keine erfundene 0');
    assert.match(byPath['neu.txt'].note, /nicht in HEAD/);
    assert.equal(overview.totals.files, 4);
    assert.equal(overview.totals.added, 2);
    assert.equal(overview.totals.removed, 2);
    assert.equal(overview.totals.counted, 2);
    assert.equal(overview.totals.uncounted, 2);
    assert.equal(overview.truncated, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('die Dateigrenze wird gemeldet, nicht still gekürzt', { skip: GIT ? false : 'kein git im PATH' }, () => {
  const dir = makeRepo();
  try {
    const overview = readOverview(dir, { maxFiles: 2 });
    assert.equal(overview.files.length, 2);
    assert.deepEqual(overview.truncated, { reason: 'DATEIEN', soll: 2, ist: 4 });
    assert.equal(overview.totals.files, 4, 'die Summe bleibt die ganze Wahrheit');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('die Hunks einer Datei kommen aus git diff, mit Marken', { skip: GIT ? false : 'kein git im PATH' }, () => {
  const dir = makeRepo();
  try {
    const payload = readFileDiff(dir, 'a.txt');
    assert.equal(payload.contract, 'shinon.diff/file-v1');
    assert.equal(payload.reason, null);
    assert.equal(payload.status, 'M');
    assert.equal(payload.hunks.length, 1);
    assert.equal(payload.hunks[0].header.startsWith('@@'), true);
    const marks = payload.hunks[0].rows.map((row) => row.mark);
    assert.ok(marks.includes('+') && marks.includes('-') && marks.includes(' '), `Marken: ${marks.join('')}`);
    const added = payload.hunks[0].rows.filter((row) => row.mark === '+').map((row) => row.text);
    assert.deepEqual(added, ['ZWEI', 'vier']);
    assert.equal(payload.truncated, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unversioniert und binär sagen ihren Grund statt einen Diff zu erfinden', { skip: GIT ? false : 'kein git im PATH' }, () => {
  const dir = makeRepo();
  try {
    const neu = readFileDiff(dir, 'neu.txt');
    assert.equal(neu.reason, 'NEU');
    assert.deepEqual(neu.hunks, []);
    const bin = readFileDiff(dir, 'bin.dat');
    assert.equal(bin.reason, 'BINAER');
    assert.deepEqual(bin.hunks, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ein Pfad von außen wird abgewiesen, nicht ausgeliefert', { skip: GIT ? false : 'kein git im PATH' }, () => {
  const dir = makeRepo();
  try {
    assert.equal(safeInside(dir, '../aussen.txt'), null);
    assert.equal(safeInside(dir, '/etc/passwd'), null);
    assert.equal(safeInside(dir, 'a/../../aussen.txt'), null);
    const outer = readFileDiff(dir, '../aussen.txt');
    assert.equal(outer.reason, 'NICHT_IM_BAUM');
    assert.deepEqual(outer.hunks, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('kein Git-Baum und kein HEAD sind zwei verschiedene Aussagen', { skip: GIT ? false : 'kein git im PATH' }, () => {
  const naked = mkdtempSync(join(tmpdir(), 'shinon-nogit-'));
  const empty = mkdtempSync(join(tmpdir(), 'shinon-empty-'));
  try {
    assert.equal(readOverview(naked).reason, 'KEIN_GIT');
    spawnSync('git', ['-C', empty, 'init', '-q'], { encoding: 'utf8' });
    assert.equal(readOverview(empty).reason, 'KEIN_HEAD');
  } finally {
    rmSync(naked, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

// ── Der Client ───────────────────────────────────────────────────────────────

const OVERVIEW = {
  contract: 'shinon.diff/overview-v1',
  root: '/repo',
  scope: 'WURZEL',
  reason: null,
  git: true,
  files: [
    { path: 'a.txt', status: 'M', mark: 'geändert', added: 2, removed: 1, counted: true, note: '' },
    { path: 'neu.txt', status: '?', mark: 'unversioniert', added: null, removed: null, counted: false, note: 'nicht in HEAD — Git hat keinen Vergleich' },
  ],
  totals: { files: 2, added: 2, removed: 1, counted: 1, uncounted: 1 },
  truncated: null,
};

const FILE = {
  contract: 'shinon.diff/file-v1',
  root: '/repo',
  path: 'a.txt',
  reason: null,
  status: 'M',
  hunks: [{ header: '@@ -1,3 +1,4 @@', rows: [
    { mark: '-', label: 'weg', text: 'eins' },
    { mark: ' ', label: 'Kontext', text: 'zwei' },
    { mark: '+', label: 'hinzu', text: 'ZWEI' },
  ] }],
  lines: 3,
  clipped: 0,
  truncated: null,
};

/** Das Bundle im Sandkasten laden und an einen Slots-Attrappen hängen. */
function mount(fetchImpl) {
  const urls = [];
  const fetchSpy = async (url) => { urls.push(String(url)); return fetchImpl(String(url)); };
  const loaded = loadClientBundle('diff-overview', { fetch: fetchSpy });
  const { registration } = loaded;
  // `loadClientBundle` gibt den Wrapper zurück; die Seite ist der innere Kontext.
  const sandbox = loaded.sandbox.sandbox ?? loaded.sandbox;
  const registered = [];
  const ctx = {
    slots: {
      inject(_name, callback) { callback(); return () => {}; },
      register(options, component) { registered.push({ options, component }); return () => {}; },
    },
  };
  registration.factory(requireStub()).apply(ctx);
  return { registered, sandbox, urls };
}

/** Alle Texte eines (Attrappen-)Knotens, tief. */
const textOf = (node) => [node.textContent ?? '', ...(node.children ?? []).map(textOf)].join(' ');

/**
 * Alle Texte eines React-Elements. Die Attrappe des Loaders legt die Kinder in
 * `children`, echtes React in `props.children` — beides wird gelesen, damit der
 * Test dieselbe Form prüft, die der Browser bekommt.
 */
const textOfReact = (element) => {
  if (typeof element === 'string') return element;
  const raw = element?.children ?? element?.props?.children ?? [];
  return (Array.isArray(raw) ? raw : [raw]).map(textOfReact).join(' ');
};

/** Alle Knoten mit einem Pfad-Datensatz (`data-path`) sammeln. */
function paths(node, found = []) {
  if (node.dataset?.path !== undefined) found.push(node.dataset.path);
  for (const child of node.children ?? []) paths(child, found);
  return found;
}

/** Knoten mit einer Zeilenmarke (`data-mark`) sammeln. */
function marks(node, found = []) {
  const mark = node.dataset?.mark;
  if (mark !== undefined && node.className === 'shinon-diff__mark') found.push(mark);
  for (const child of node.children ?? []) marks(child, found);
  return found;
}

const answered = (url) => (url.includes('/file') ? FILE : OVERVIEW);
const respond = (url) => ({ ok: true, status: 200, json: async () => answered(url) });
/** Zwei Mikrotask-Runden: die Komponente arbeitet mit echten Promises. */
const settle = async () => { await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)); };

test('der Client meldet sich in der Kopfzeile des Datei-Browsers an', () => {
  const { registered } = mount(async (url) => respond(url));
  assert.equal(registered.length, 1);
  assert.equal(registered[0].options.name, SLOT);
  assert.equal(registered[0].options.id, 'shinon-diff-overview');
  assert.equal(typeof registered[0].component, 'function');
});

test('im Ruhezustand zeigt der Knopf nur die Zahlen', () => {
  const { registered, sandbox } = mount(async (url) => respond(url));
  // Der Chip liest den geladenen Zustand; ohne Laden ist er ehrlich leer.
  const chip = registered[0].component({});
  assert.equal(chip.props.className, 'shinon-diff__chip');
  assert.match(textOfReact(chip), /Diff/);
  // REGRESSION (2026-10-22): die Kinder müssen React-Elemente sein. Ein per
  // `document.createElement` gebauter Knoten ließ den Slot mit "Objects are not
  // valid as a React child" abstürzen — der Knopf erschien nie.
  for (const child of chip.children) {
    assert.equal(typeof child, 'object');
    assert.equal(child.textContent, undefined, 'DOM-Knoten als React-Kind');
    assert.equal(typeof child.type, 'string');
  }
  assert.equal(sandbox.__shinonDiffOverview.state().overview, null);
});

test('ein Klick öffnet die scrollbare Liste, ein zweiter schließt sie', async () => {
  const { sandbox } = mount(async (url) => respond(url));
  await sandbox.__shinonDiffOverview.open();
  const panel = sandbox.document.body.children.at(-1);
  assert.equal(panel.getAttribute('role'), 'dialog');
  const text = textOf(panel);
  assert.match(text, /Änderungen/);
  assert.match(text, /2 Dateien/);
  assert.deepEqual(paths(panel), ['a.txt', 'neu.txt']);
  assert.match(text, /nicht in HEAD/);
  const scroller = panel.children.find((child) => child.className === 'shinon-diff__scroll');
  assert.ok(scroller !== undefined, 'die Liste steht in einem Scrollbereich');
  await sandbox.__shinonDiffOverview.open();
  assert.equal(panel.hidden, true);
});

test('ein Klick auf eine Datei holt ihre Hunks und zeigt sie mit Marken', async () => {
  const { sandbox, urls } = mount(async (url) => respond(url));
  await sandbox.__shinonDiffOverview.open();
  const panel = sandbox.document.body.children.at(-1);
  const row = panel.children.flatMap(function walk(node) {
    return node.dataset?.path !== undefined ? [node] : (node.children ?? []).flatMap(walk);
  })[0];
  row.dispatch('click');
  await settle();
  assert.ok(urls.some((url) => url.includes('/shinon/diff/file?path=a.txt')), `Pfad-Request fehlt: ${urls.join(', ')}`);
  const text = textOf(panel);
  assert.match(text, /@@ -1,3 \+1,4 @@/);
  assert.deepEqual(marks(panel), ['-', ' ', '+']);
});

test('ein stummer Host ergibt einen Satz, keine leere Liste', async () => {
  const { sandbox } = mount(async () => ({ ok: false, status: 599, json: async () => ({}) }));
  await sandbox.__shinonDiffOverview.open();
  const text = textOf(sandbox.document.body.children.at(-1));
  assert.match(text, /Host antwortet 599/);
  assert.equal(text.includes('keine Änderung gegen HEAD'), false, 'ein stummer Host ist kein sauberer Baum');
});

test('ohne Git-Baum sagt das Panel warum', async () => {
  const naked = { contract: 'shinon.diff/overview-v1', root: '/nix', reason: 'KEIN_GIT', git: true, files: [], totals: { files: 0, added: 0, removed: 0, counted: 0, uncounted: 0 }, truncated: null };
  const { sandbox } = mount(async () => ({ ok: true, status: 200, json: async () => naked }));
  await sandbox.__shinonDiffOverview.open();
  assert.match(textOf(sandbox.document.body.children.at(-1)), /Kein Git-Baum/);
});

test('ein fremdes Dokument wird verworfen', async () => {
  const { sandbox } = mount(async () => ({ ok: true, status: 200, json: async () => ({ contract: 'fremd/v1' }) }));
  await sandbox.__shinonDiffOverview.open();
  assert.match(textOf(sandbox.document.body.children.at(-1)), /keine Diff-Übersicht/);
});
