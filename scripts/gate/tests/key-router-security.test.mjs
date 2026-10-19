#!/usr/bin/env node
/**
 * key-router-security — Schlüsselmaterial verlässt das Paket nicht.
 *
 * WARUM DIESE DATEI EXISTIERT: `@shinon/key-router` gab vor dieser Änderung aus
 * DREI Werkzeugen `key.slice(0, 8) + '…'` zurück und schrieb Schlüsselpräfixe in
 * jede Log-Zeile. Was ein Werkzeug zurückgibt, landet im Kontext des Modells und
 * in der Sitzungstranskription — ein „Präfix zur Wiedererkennung" ist dort ein
 * Leck, kein Komfort. Das Paket war inaktiv, also fiel es niemandem auf; beim
 * Aktivieren wäre es still mitgelaufen.
 *
 * DREI EBENEN, damit die Zusage nicht an einer Schreibweise hängt:
 *
 *   1. QUELLE (läuft ohne node_modules) — das Schema hat kein Schlüsselfeld, und
 *      die einzigen `console.log`/`console.warn`-Aufrufe des Pakets stehen in den
 *      beiden Filtern (`say`/`warn`). Wer künftig daneben loggt, wird rot, egal
 *      wie er die Zeile formuliert.
 *   2. KERN (läuft ohne node_modules) — `redact` und `statusOf` auf ihre Zusage:
 *      der Zustand trägt Beschriftungen, der Text wird gefiltert.
 *   3. AUSGELIEFERTES PAKET (braucht `node_modules`, sonst sichtbarer Skip) — das
 *      echte `apply` mit einer Kanarienvogel-Umgebung: jedes Werkzeug wird
 *      aufgerufen, jeder Log-Aufruf abgefangen, und danach wird gesucht, was nicht
 *      vorkommen darf. Der Verbindungstest läuft gegen ein gestelltes `fetch`, das
 *      beweist, dass der Schlüssel im KOPF ankommt — und danach nirgends mehr.
 *
 * Läuft mit `node --test` (`npm run gate:test`, CI ohne node_modules).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePatchFile } from '../../lib/repo.mjs';
import { codeOnly } from '../../lib/source-scan.mjs';
import { buildEntries, redact, statusOf } from '../../../packages/key-router/assets/pool-core.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const INDEX = 'packages/key-router/index.js';
const CANARY = 'sk-kanarienvogel-4711-4711-4711';

/**
 * Der QUELLTEXT des Pakets, ohne Kommentare und String-Inhalte.
 *
 * Ohne diese Filterung fände der Test seinen eigenen Befund: der Kopf von
 * `index.js` NENNT den alten Fehler (`key.slice(0, 8)`), um zu erklären, warum er
 * weg ist — genau wie die Client-Tests es handhaben (scripts/lib/source-scan.mjs).
 */
const codeOf = (rel) => codeOnly(read(rel));

/** Der Config-Block des Pakets — der Text zwischen `z.object({` und dem Abschluss. */
function configBlock() {
  const source = codeOf(INDEX);
  const start = source.indexOf('export const Config = z.object({');
  assert.ok(start >= 0, `${INDEX}: Config fehlt`);
  const end = source.indexOf('\n});', start);
  assert.ok(end > start, `${INDEX}: Config-Block endet nicht`);
  return source.slice(start, end);
}

test('key-router: das Schema kennt kein Schlüsselfeld (eine Profildatei ist versioniert)', () => {
  const block = configBlock();
  for (const forbidden of ['key', 'keys', 'apiKey', 'apiKeys', 'defaultKey', 'pool', 'tokens']) {
    assert.equal(
      new RegExp(`\\b${forbidden}\\s*:`).test(block),
      false,
      `Config.${forbidden} nimmt Schlüsselmaterial auf — Schlüssel kommen aus der Umgebung, nicht aus der Config`,
    );
  }
  // Und die Gegenseite: die Namen der Umgebungsvariablen SIND Felder.
  assert.match(block, /\benvNames\s*:/);
  assert.match(block, /\benvPrefix\s*:/);
});

test('key-router: jeder Log-Aufruf geht durch den Filter', () => {
  const source = codeOf(INDEX);
  assert.equal(source.split('console.log(').length - 1, 1, 'genau EIN console.log — im Filter `say`');
  assert.equal(source.split('console.warn(').length - 1, 1, 'genau EIN console.warn — im Filter `warn`');
  assert.match(source, /function say\(text\) \{\n\s*console\.log\(redact\(text, allSecrets\(\)\)\);/);
  assert.match(source, /function warn\(text\) \{\n\s*console\.warn\(redact\(text, allSecrets\(\)\)\);/);
  assert.equal(source.includes('.key.slice('), false, 'ein Schlüsselpräfix in einer Ausgabe ist ein Leck');
  assert.equal(/slice\(\s*0\s*,\s*\d+\s*\)/.test(source), false, 'kein Auszug aus einem Schlüssel');
});

/** Jedes Objekt in einem Baum besuchen (auch in Listen). */
function* objects(value, path = 'config') {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* objects(item, `${path}[${index}]`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  yield [path, value];
  for (const [name, child] of Object.entries(value)) yield* objects(child, `${path}.${name}`);
}

/** Die Konfiguration des Profil-Eintrags (die wirksame Ebene). */
function profileConfig() {
  const { patches, issues } = parsePatchFile(join(ROOT, 'profiles/shinon/cordis.patch.yml'));
  assert.deepEqual(issues, [], 'das Profil ist nicht lesbar');
  const entry = patches.find((patch) => patch.id === 'shinon-key-router');
  assert.ok(entry !== undefined, 'das Profil hat keinen shinon-key-router-Eintrag');
  return { entry, config: entry.config ?? {}, patches };
}

test('key-router: kein Feld des Profils kann einen Schlüssel aufnehmen', () => {
  const { config } = profileConfig();
  const forbidden = ['key', 'keys', 'apikey', 'apikeys', 'defaultkey', 'pool', 'pools', 'secret', 'token', 'tokens', 'authtoken'];
  for (const [path, object] of objects(config)) {
    for (const name of Object.keys(object)) {
      assert.equal(
        forbidden.includes(name.toLowerCase()),
        false,
        `${path}.${name}: ein Schlüsselfeld in einer versionierten Datei ist ein Leck mit Ansage`,
      );
    }
  }
  // Die Gegenprobe: die NAMEN der Umgebungsvariablen stehen da, und sie sind
  // Namen (GROSS, Unterstriche) und keine Werte.
  const providers = config.providers;
  assert.ok(Array.isArray(providers) && providers.length > 0, 'das Profil nennt keinen Anbieter');
  for (const provider of providers) {
    assert.ok(Array.isArray(provider.envNames) && provider.envNames.length > 0, 'der Anbieter nennt keinen Umgebungsnamen');
    for (const name of provider.envNames) {
      assert.match(name, /^[A-Z][A-Z0-9_]*$/, `"${name}" ist kein Umgebungsname, sondern sieht nach einem Wert aus`);
    }
  }
});

test('key-router: die baseUrl spiegelt den Anbieter der Route (Drift wäre ein zweiter Wahrheitsstand)', () => {
  const { config, patches } = profileConfig();
  const llm = patches.find((patch) => patch.id === 'llm-pi-ai');
  assert.ok(llm !== undefined, 'das Profil hat keinen llm-pi-ai-Eintrag');

  /** Die Anbieter-Blöcke der Route finden — sie liegen je nach Fassung eine Ebene tiefer. */
  const routeProviders = new Map();
  for (const [, object] of objects(llm.config ?? {})) {
    for (const [id, value] of Object.entries(object)) {
      if (value !== null && typeof value === 'object' && typeof value.baseURL === 'string') routeProviders.set(id, value.baseURL);
    }
  }
  assert.ok(routeProviders.size > 0, 'keine baseURL in der LLM-Config gefunden — der Test greift ins Leere');

  for (const provider of config.providers) {
    const routeBaseURL = routeProviders.get(provider.id);
    assert.ok(routeBaseURL !== undefined, `der Router nennt Anbieter "${provider.id}", den die Route nicht kennt`);
    assert.equal(
      provider.baseUrl,
      routeBaseURL,
      `Router und Route zeigen für "${provider.id}" auf verschiedene Hosts — der Verbindungstest fragte dann einen anderen Anbieter als die Route`,
    );
  }
});

test('key-router: der Kern gibt Beschriftungen und filtert Text', () => {
  const entries = buildEntries([CANARY, 'zweiter']);
  const status = statusOf(entries, 0, 'key#1');
  assert.equal(JSON.stringify(status).includes(CANARY), false);
  assert.equal(JSON.stringify(status).includes('sk-'), false);
  assert.equal(redact(`Fehler mit ${CANARY}`, [CANARY]), 'Fehler mit [key]');
});

test('key-router: das ausgelieferte Paket leakt nicht (node_modules nötig)', async () => {
  let packageModule = null;
  try {
    packageModule = await import('../../../packages/key-router/index.js');
  } catch (error) {
    assert.fail(`@shinon/key-router lädt nicht: ${error.message}`);
  }

  const registered = [];
  const ctx = {
    inject(names, callback) {
      assert.deepEqual(names, ['tools'], 'die Werkzeug-Registrierung muss über inject laufen');
      callback({ tools: { register: (tool) => registered.push(tool) } });
    },
  };
  const config = {
    providers: [{
      id: 'kanarienvogel',
      baseUrl: 'https://api.example/v1',
      protocol: 'openai-compatible',
      models: ['m1'],
      probePath: '/models',
      envNames: ['SHINON_TEST_KEY'],
      envPrefix: 'SHINON_TEST_PREFIX',
      initialDelayMs: 2000,
      maxDelayMs: 60000,
      maxRetries: 5,
    }],
  };
  process.env.SHINON_TEST_KEY = CANARY;
  process.env.SHINON_TEST_PREFIX_2 = 'sk-zweiter-kanarienvogel';

  // Log und Antwort einsammeln: beides verlässt den Prozess.
  const logged = [];
  const realLog = console.log;
  const realWarn = console.warn;
  console.log = (...args) => logged.push(args.join(' '));
  console.warn = (...args) => logged.push(args.join(' '));
  const requests = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, headers: options.headers });
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'm1' }] }) };
  };

  try {
    const dispose = packageModule.apply(ctx, config);
    assert.equal(registered.length, 3, 'drei Werkzeuge erwartet');
    const byName = new Map(registered.map((tool) => [tool.name, tool]));

    const results = [];
    for (const tool of registered) {
      const result = await tool.execute(tool.name === 'key_router_probe'
        ? { providerId: 'kanarienvogel', model: '' }
        : tool.name === 'key_router_rotate'
          ? { providerId: 'kanarienvogel', force: true }
          : {});
      results.push(JSON.stringify(result ?? null));
    }

    // (a) Der Schlüssel KOMMT an — sonst prüfte der Test nichts.
    assert.equal(requests.length, 1, 'der Verbindungstest hat genau einmal angefragt');
    assert.equal(requests[0].headers.authorization, `Bearer ${CANARY}`, 'der Schlüssel gehört in den Kopf');
    assert.equal(requests[0].url, 'https://api.example/v1/models');

    // (b) Und danach nirgends mehr.
    const visible = [...results, ...logged, JSON.stringify(byName.get('key_router_status').parameters)];
    for (const text of visible) {
      assert.equal(text.includes(CANARY), false, `Schlüsselmaterial in einer Ausgabe: ${text.slice(0, 200)}`);
      assert.equal(text.includes('sk-zweiter'), false, `Schlüsselmaterial in einer Ausgabe: ${text.slice(0, 200)}`);
      assert.equal(text.includes('sk-'), false, `Schlüssel-Präfix in einer Ausgabe: ${text.slice(0, 200)}`);
    }
    // (c) Was stattdessen drinsteht: die Beschriftung.
    const status = JSON.parse(results[1]);
    assert.equal(status.pools.kanarienvogel.keys[0].label, 'key#1');
    assert.equal(status.pools.kanarienvogel.total, 2, 'beide Umgebungsnamen sind im Pool');

    dispose();
  } finally {
    console.log = realLog;
    console.warn = realWarn;
    globalThis.fetch = realFetch;
    delete process.env.SHINON_TEST_KEY;
    delete process.env.SHINON_TEST_PREFIX_2;
  }
});
