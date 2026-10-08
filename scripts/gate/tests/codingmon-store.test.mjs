#!/usr/bin/env node
/**
 * Abnahmetest des dauerhaften Spiegels (@shinon/codingmon, Host-Seite).
 *
 * WAS HIER BEWIESEN WIRD: der Spielstand ueberlebt einen NEUSTART. Nicht gegen
 * eine Attrappe, sondern gegen die echten Bausteine der installierten
 * DSH-Version: `ctx.storageDomain` aus @deepseek-ai/dsh-storage-domain ueber
 * dem JSON-Backend aus @deepseek-ai/dsh-storage-json, gemountet in einen echten
 * Cordis-Context — dieselbe Mechanik, die das Profil mountet.
 *
 * Die Zusage ist bewusst NICHT „es gibt eine Datei\": geprueft wird, dass ein
 * ZWEITER Prozess-Kontext (frisches `Context`, frisch geoeffnete Domain)
 * denselben Stand liest — genau das, was beim Absturz der Forge zaehlt.
 *
 * Lauf mit `node --test` (CI: .github/workflows/commit-guard.yml). Braucht die
 * installierte DSH-Version im PATH und die Schema-/Domain-Pakete aufloesbar;
 * fehlt eines davon, wird der Test SICHTBAR uebersprungen (Grund im Namen)
 * statt rot zu werden — CI hat kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';

const STORE_FILE = fileURLToPath(new URL('../../../packages/codingmon/assets/pet-store.js', import.meta.url));
const HOST_FILE = fileURLToPath(new URL('../../../packages/codingmon/index.js', import.meta.url));
const root = dshRoot();

/**
 * Vorbedingungen und fehlender Grund — erst messen, dann ueberspringen. Die
 * Begruendung steht im Namen des uebersprungenen Tests.
 */
const missing = [];
let store = null;
let dsh = null;
if (root === null) missing.push('dsh nicht im PATH');
if (root !== null) {
  try {
    const require = createRequire(join(root, 'package.json'));
    dsh = {
      cordis: await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href),
      storage: await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-storage')).href),
      json: await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-storage-json')).href),
      domain: await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-storage-domain')).href),
    };
    store = await import(pathToFileURL(STORE_FILE).href);
  } catch (error) {
    missing.push(`Bund-Pakete nicht aufloesbar (${String(error?.message ?? error).split('\n')[0]})`);
  }
}
const skip = missing.length ? `uebersprungen: ${missing.join('; ')}` : false;

/** Ein Backend-Plugin hat `apply`; die Hub-Klasse ist selbst das Plugin. */
const asPlugin = (mod) => ({ name: mod.name, Config: mod.Config, inject: mod.inject, apply: mod.apply });

/** Ein frischer Host mit gemounteter Storage-Familie — wie das Profil ihn mountet. */
async function boot(mediumRoot) {
  const ctx = new dsh.cordis.Context();
  await ctx.plugin(dsh.storage.Storage, {});
  await ctx.plugin(asPlugin(dsh.json), { root: mediumRoot });
  await ctx.plugin(asPlugin(dsh.domain), { backend: 'json' });
  return ctx;
}

/** Ein Stand, wie ihn der Client spaeter schickt. */
const snapshot = (over = {}) => ({
  schemaVersion: 2,
  species: 'nullpointer',
  xp: 1200,
  wins: 4,
  losses: 1,
  round: 6,
  damageTotal: '454',
  hits: 12,
  loot: { schrott: 3, brauchbar: 1, shiny: 0 },
  savedAt: '2026-10-08T10:00:00.000Z',
  ...over,
});

const fixedClock = () => new Date('2026-10-08T12:00:00.000Z');

test('Zusage: der Stand geht durch einen NEUSTART nicht verloren', { skip }, async () => {
  const medium = mkdtempSync(join(tmpdir(), 'codingmon-store-'));

  // Prozess 1: schreiben.
  const first = await boot(medium);
  const firstStore = await store.openPetStore(first, fixedClock);
  const written = await firstStore.write(snapshot());
  assert.deepEqual(written, { ...snapshot(), storedAt: '2026-10-08T12:00:00.000Z' }, 'der Stand kommt validiert zurueck');
  assert.deepEqual(firstStore.read(), written, 'und liegt sofort im Speicher der Domain');
  await firstStore.close();

  // Das Medium ist eine LESBARE Datei — der Grund, warum das JSON-Backend hier
  // das richtige ist: ein Operator kann sie ansehen, ohne Werkzeug.
  assert.deepEqual(readdirSync(medium), ['codingmon_pet.json']);
  const file = JSON.parse(readFileSync(join(medium, 'codingmon_pet.json'), 'utf8'));
  assert.equal(JSON.stringify(file).includes('"454"'), true, 'der Lebenslauf steht als Ziffernfolge in der Datei, nicht gerundet');

  // Prozess 2: neuer Kontext, neues Medium-Handle, derselbe Stand.
  const second = await boot(medium);
  const secondStore = await store.openPetStore(second, fixedClock);
  assert.deepEqual(secondStore.read(), written, 'derselbe Stand, ohne dass jemand ihn mitgeschleppt hat');
  await secondStore.close();
});

test('Zusage: ein Stand, der den Vertrag verletzt, wirft und beruehrt das Medium nicht', { skip }, async () => {
  const medium = mkdtempSync(join(tmpdir(), 'codingmon-store-'));
  const ctx = await boot(medium);
  const store1 = await store.openPetStore(ctx, fixedClock);
  const good = await store1.write(snapshot({ xp: 999 }));

  const broken = [
    { name: 'XP als Text', over: { xp: 'viel' } },
    { name: 'Lebenslauf als Zahl statt Ziffernfolge', over: { damageTotal: 454 } },
    { name: 'negative Siege', over: { wins: -1 } },
    { name: 'Beute-Stufe fehlt', over: { loot: { schrott: 0, brauchbar: 0 } } },
    { name: 'Spezies leer', over: { species: '' } },
  ];
  for (const { name, over } of broken) {
    await assert.rejects(() => store1.write(snapshot(over)), name);
    assert.deepEqual(store1.read(), good, `${name}: der letzte gueltige Stand bleibt stehen`);
  }

  // Unbekannte Felder fallen weg, sie wandern nicht ins Medium.
  const extra = await store1.write({ ...snapshot(), cheat: true });
  assert.equal('cheat' in extra, false, 'was der Vertrag nicht nennt, wird nicht aufgenommen');
  await store1.close();
});

/** Bundle-Ausgaben stumm schalten (der Mount protokolliert absichtlich laut). */
function quiet(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

/**
 * `apply` ist per Vertrag synchron (Cordis liest den Rueckgabewert als
 * Disposer), der Spiegel oeffnet aber asynchron. Also warten wir beobachtbar auf
 * den Dienst — mit Grenze, damit ein nie erscheinender Dienst rot wird statt zu
 * haengen.
 */
async function until(predicate, tries = 200) {
  for (let index = 0; index < tries; index += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return null;
}

test('Zusage: die Host-Haelfte oeffnet den Spiegel selbst und gibt ihn als Dienst heraus', { skip }, async () => {
  const medium = mkdtempSync(join(tmpdir(), 'codingmon-host-'));
  const ctx = await boot(medium);
  const bundle = await import(pathToFileURL(HOST_FILE).href);

  const dispose = quiet(() => bundle.apply(ctx, bundle.Config({})));
  const service = await until(() => ctx.get(bundle.STORE_SERVICE));
  assert.ok(service, `${bundle.STORE_SERVICE} wurde nicht bereitgestellt`);
  assert.equal(service.contract, bundle.STORE_CONTRACT, 'der Dienst nennt seinen Vertrag');
  assert.deepEqual(service.fields, bundle.SNAPSHOT_FIELDS, 'und die Felder, die er annimmt');

  const written = await service.write(snapshot());
  assert.deepEqual(service.read(), written, 'der Dienst liest, was er geschrieben hat');

  // Die Domain ist WIRKLICH offen: ein zweites Oeffnen muss am Vertrag der
  // Domain scheitern (`already-open`) — eine blosse Behauptung waere das nicht.
  await assert.rejects(() => ctx.storageDomain.open(store.PET_DOMAIN), (error) => {
    assert.equal(error.code, 'already-open', 'der stabile Fehlercode des Domain-Vertrags');
    return true;
  });

  await dispose();
  // ... und nach dem Abbau ist sie wieder frei, ohne dass jemand den Store kennt.
  const reopened = await ctx.storageDomain.open(store.PET_DOMAIN);
  assert.deepEqual(reopened.table('snapshots').get(store.PET_KEY), written, 'der Stand steht auch nach dem Abbau im Medium');
  await reopened.close();
});

test('Zusage: nach dem Abbau ist die Domain wieder frei', { skip }, async () => {
  const medium = mkdtempSync(join(tmpdir(), 'codingmon-store-'));
  const ctx = await boot(medium);
  const first = await store.openPetStore(ctx, fixedClock);
  await first.close();
  const second = await store.openPetStore(ctx, fixedClock);
  assert.equal(second.read(), null, 'nach dem Schliessen ohne Schreibvorgang ist der Datensatz leer');
  await second.close();

  // Der Vertrag der Deklaration selbst: der Name trifft UNIT_NAME_RE (sonst
  // haette defineDomain beim Laden dieses Moduls geworfen) und die Fassung ist 1.
  assert.equal(store.PET_DOMAIN.name, 'codingmon_pet');
  assert.equal(store.PET_DOMAIN.version, 1);
  assert.equal(existsSync(medium), true);
});
