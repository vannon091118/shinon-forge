#!/usr/bin/env node
/**
 * Tests des Versionsspiegels (@shinon/version).
 *
 * WAS HIER GEPRUEFT WIRD — und warum es ein Test und keine Formel im Paket ist:
 *   1. Der Namensvertrag: Manifest, Patch, Client und Profil muessen denselben
 *      Namen tragen. Ein abweichender Name laedt das Paket nicht.
 *   2. Die Naht Client <-> Host: der Name des Globals und die Route stehen im
 *      Host als Export und im Client als Literal — ein Client-Bundle kann den
 *      Host nicht importieren, also muss der Name zweimal dastehen. Wer ihn nur
 *      einmal pflegt, baut eine Ecke, die leer bleibt.
 *   3. Der Bau-Schatten: der Packer und das Paket muessen dieselbe Datei
 *      benennen — sonst meldet das installierte Paket stillschweigend
 *      "unbekannt" statt seines Stands.
 *   4. Die Profilzugehoerigkeit: ein Paket, das nicht im Profil steht, ist
 *      tot (das Gate `dead-package` sagt es an dieser Stelle).
 *
 * Und die Probe, die ein Gate von der Dekoration trennt: eine mutierte Kopie
 * muss ROT werden. Ein Test, der nie rot werden kann, beweist nichts.
 *
 * Laeuft mit `node --test` — kein node_modules, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { bannerModel, choiceModel } from '../../../packages/version/assets/version-state.js';
import { loadClientBundle, requireStub } from './helpers/client-sandbox.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGE_DIR = join(ROOT, 'packages', 'version');
const HOST_FILE = join(PACKAGE_DIR, 'index.js');
const CLIENT_FILE = join(PACKAGE_DIR, 'client.js');
const PROBE_FILE = join(PACKAGE_DIR, 'assets', 'version-probe.js');
const MANIFEST_FILE = join(PACKAGE_DIR, 'package.json');
const PATCH_FILE = join(PACKAGE_DIR, 'cordis.patch.yml');
const PAYLOAD_FILE = join(ROOT, 'scripts', 'lib', 'payload.mjs');
const PROFILE_FILE = join(ROOT, 'profiles', 'shinon', 'package.json');

const hostSource = readFileSync(HOST_FILE, 'utf8');
const clientSource = readFileSync(CLIENT_FILE, 'utf8');
const probeSource = readFileSync(PROBE_FILE, 'utf8');
const payloadSource = readFileSync(PAYLOAD_FILE, 'utf8');
const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
const patch = readFileSync(PATCH_FILE, 'utf8');
const profile = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));

/** Den Wert einer exportierten Konstante aus einem Quelltext lesen. */
function exportedString(source, name) {
  const hit = new RegExp(`export const ${name} = '([^']*)'`).exec(source);
  return hit === null ? null : hit[1];
}

/** Die Naht zwischen Host und Client pruefen — als Befundliste. */
function seamIssues(host, client) {
  const issues = [];
  for (const name of ['VERSION_GLOBAL', 'VERSION_ENDPOINT']) {
    const value = exportedString(host, name);
    if (value === null) {
      issues.push(`der Host exportiert ${name} nicht`);
      continue;
    }
    if (!client.includes(value)) issues.push(`der Client kennt ${name} (${value}) nicht`);
  }
  return issues;
}

/** Fremdabhaengigkeiten in einer Kerndatei (erlaubt sind node: und relative). */
function foreignImports(source) {
  return source
    .split('\n')
    .filter((line) => /^import\s.*\sfrom\s'([^']+)'/.test(line))
    .filter((line) => !/from '(node:|\.)/.test(line));
}

test('der Namensvertrag traegt in allen vier Stellen', () => {
  assert.equal(manifest.name, '@shinon/version');
  assert.match(patch, /id: shinon-version/);
  assert.match(patch, /name: '@shinon\/version'/);
  assert.match(clientSource, /__ModuleLoader__\.load\(\{\s*\n\s*id: '@shinon\/version'/);
});

test('der Client spiegelt den Global-Namen und die Route des Hosts', () => {
  assert.deepEqual(seamIssues(hostSource, clientSource), []);
});

test('ein abweichender Name im Client wird rot', () => {
  const global = exportedString(hostSource, 'VERSION_GLOBAL');
  const mutated = clientSource.replaceAll(global, '__DSH_VERSION_OTHER__');
  assert.notEqual(mutated, clientSource, 'die Mutation hat nichts geaendert');
  const issues = seamIssues(hostSource, mutated);
  assert.ok(issues.length > 0, 'ein gedrehter Name muss auffallen');
});

test('Packer und Paket nennen denselben Bau-Schatten', () => {
  const fromPacker = exportedString(payloadSource, 'BUILD_STAMP');
  const fromPackage = exportedString(probeSource, 'BUILD_STAMP');
  assert.ok(fromPacker, 'der Packer nennt BUILD_STAMP nicht');
  assert.ok(fromPackage, 'das Paket nennt BUILD_STAMP nicht');
  assert.equal(fromPacker, fromPackage);
  assert.match(fromPacker, /^\.shinon-build\.json$/);
});

test('das Paket steht im Profil (Bindeglied und Buendel)', () => {
  assert.equal(profile.dependencies['@shinon/version'], 'link:../../packages/version');
  assert.ok(profile.dsh.profile.bundles.includes('@shinon/version'));
});

test('der Host oeffnet die Route, der Client liest den Global', () => {
  assert.match(hostSource, /ctx\.inject\(\['webServer'\]/);
  assert.match(hostSource, /webserver\/index-inject/);
  assert.match(hostSource, /kind: 'global'/);
  assert.match(clientSource, /window\[VERSION_GLOBAL\]/);
});

test('die Frage hat zwei Wege — und nennt die Folgen', () => {
  const behind = choiceModel({ installed: 'a'.repeat(40), latest: 'b'.repeat(40), behind: 3, ahead: 0, canUpdate: true });
  assert.equal(behind.available, true, 'ein Rueckstand ohne Frage ist der stille Klick von vorher');
  assert.match(behind.question, /aaaaaaa/);
  assert.match(behind.question, /bbbbbbb/);
  assert.equal(behind.now.label, 'Jetzt installieren');
  assert.equal(behind.next.label, 'Beim nächsten Start');
  assert.match(behind.now.note, /beendet den laufenden Host/);
  assert.match(behind.next.note, /nächsten Start/);
});

test('kein Update heisst keine Frage — sondern ein Grund', () => {
  const aktuell = choiceModel({ installed: 'c'.repeat(40), latest: 'c'.repeat(40), canUpdate: true });
  assert.equal(aktuell.available, false);
  assert.match(aktuell.unavailable, /Bereits aktuell/);
  // Acht eigene Commits vor main sind kein Rueckstand: ein „Update" waere hier ein Rueckschritt.
  const voraus = choiceModel({ installed: 'e'.repeat(40), latest: 'd'.repeat(40), behind: 0, ahead: 8, canUpdate: true });
  assert.equal(voraus.available, false, 'ein Stand vor main bekommt eine Update-Frage');
  assert.match(voraus.unavailable, /Kein Rückstand/);
  const keinInstallat = choiceModel({ installed: 'c'.repeat(40), latest: 'd'.repeat(40), canUpdate: false, updateHint: 'Gebautes Paket ohne Git-Baum.' });
  assert.equal(keinInstallat.available, false);
  assert.equal(keinInstallat.unavailable, 'Gebautes Paket ohne Git-Baum.');
});

/** Die Seite so aufbauen, wie der Host sie beliefert — ohne Browser. */
function clientWith(fetchSpy, state = { installed: 'a'.repeat(40), latest: 'b'.repeat(40), behind: 2, ahead: 0, canUpdate: true }, globals = {}) {
  const { registration, sandbox: loaded } = loadClientBundle('version', {
    __DSH_VERSION_INFO__: { contract: 'shinon.version/state-v1', endpoint: '/shinon/version', token: 't0k', state, badge: bannerModel(state) },
    fetch: fetchSpy,
    ...globals,
  });
  // Der Loader ruft die Fabrik; ohne diesen Schritt gaebe es keine Seite.
  registration.factory(requireStub()).apply({ slots: { inject() {}, register() {} } });
  return loaded.sandbox;
}

/** Die Spiegelzeile im DOM (erster Knoten ist der Spiegel, zweiter das Panel). */
const badgeLineOf = (page) => page.document.body.children[0].children[1];

const find = (root, className) => root.children.find((child) => child.className === className) ?? null;

test('der Client fragt, statt still zu klicken — beide Wege sind da', () => {
  const page = clientWith(async () => ({ ok: false, status: 599, json: async () => ({}) }));
  const ask = find(page.document.body, 'shinon-version__ask');
  assert.ok(ask !== null, 'keine Frage im DOM');
  assert.match(ask.children[0].textContent, /Neuer Stand bbbbbbb/);
  const now = ask.children[1];
  const next = ask.children[2];
  assert.equal(now.children[0].textContent, 'Jetzt installieren');
  assert.equal(next.children[0].textContent, 'Beim nächsten Start');
  assert.match(now.children[1].textContent, /beendet den laufenden Host/);
  assert.match(next.children[1].textContent, /beim nächsten Start/);
});

test('„Jetzt installieren" schickt mode=now, „Beim nächsten Start" mode=next', () => {
  const calls = [];
  const spy = async (url, options) => { calls.push({ url, options }); return { ok: false, status: 599, json: async () => ({}) }; };
  const page = clientWith(spy);
  const ask = find(page.document.body, 'shinon-version__ask');
  ask.children[1].children[0].click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/shinon/version/update');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['x-shinon-version-token'], 't0k');
  assert.equal(JSON.parse(calls[0].options.body).mode, 'now');
  ask.children[2].children[0].click();
  assert.equal(JSON.parse(calls[1].options.body).mode, 'next');
});

test('ohne Rueckstand ueberschreibt der Klick die Spiegelzeile NICHT', () => {
  // Der Fall von der Werkbank: acht eigene Commits vor main, kein Update.
  const page = clientWith(async () => ({ ok: false, status: 599, json: async () => ({}) }),
    { installed: 'e'.repeat(40), latest: 'd'.repeat(40), behind: 0, ahead: 8, canUpdate: true });
  const line = badgeLineOf(page);
  const before = line.textContent;
  assert.match(before, /·/);
  page.document.body.children[0].click();
  assert.equal(line.textContent, before, 'der Klick hat die Spiegelzeile ersetzt');
  const ask = find(page.document.body, 'shinon-version__ask');
  assert.equal(ask.hidden, false, 'der Klick oeffnet das Panel nicht');
  assert.match(ask.children[0].textContent, /Kein Rückstand/, 'der Grund steht nicht im Panel');
});

test('nach einem Lauf zieht die Spiegelzeile den gemessenen Stand nach', async () => {
  const intervals = [];
  const state = { installed: 'a'.repeat(40), latest: 'b'.repeat(40), behind: 1, ahead: 0, canUpdate: true };
  const next = { ...state, installed: 'b'.repeat(40), behind: 0 };
  const spy = async (url, options) => {
    if (options?.method === 'POST') return { ok: true, status: 202, json: async () => ({ started: true }) };
    return { ok: true, status: 200, json: async () => ({ badge: bannerModel(next), job: null }) };
  };
  const page = clientWith(spy, state, { setInterval: (fn) => { intervals.push(fn); return intervals.length; }, clearInterval: () => {} });
  const ask = find(page.document.body, 'shinon-version__ask');
  ask.children[2].children[0].click();
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(intervals.length, 1, 'die Abfrage laeuft nicht');
  await intervals[0]();
  assert.match(badgeLineOf(page).textContent, /bbbbbbb/, 'die Zeile zeigt nach dem Lauf den alten Stand');
  // Der Tooltip haengt am Spiegel selbst, nicht an der Zeile — beide muessen nachziehen.
  const root = page.document.body.children[0];
  assert.match(root.title, /neueste Commit bbbbbbb/, 'der Tooltip nennt nach dem Lauf noch den alten Stand');
  assert.ok(!root.title.includes('aaaaaaa'), 'der Tooltip traegt den alten Stand');
});

test('der Host nimmt die Antwort an und startet auto mit --now', () => {
  assert.match(hostSource, /body\.mode === 'now' \? 'now' : 'next'/);
  assert.match(hostSource, /if \(mode === 'now'\) args\.push\('--now'\)/);
  assert.match(hostSource, /badge: bannerModel\(state\)/);
});

test('die Kernmessung ist frei von Fremdabhaengigkeiten', () => {
  // Der Kern muss ohne node_modules laufen: sonst kann die CI ihn nicht pruefen.
  assert.deepEqual(foreignImports(probeSource), []);
  assert.deepEqual(foreignImports(readFileSync(join(PACKAGE_DIR, 'assets', 'version-state.js'), 'utf8')), []);
});
