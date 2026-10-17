#!/usr/bin/env node
/**
 * key-router-override — der Pool erreicht die Route (PLAN.md §3.12).
 *
 * WARUM DIESE DATEI EXISTIERT: der Router verwaltete seinen Pool und
 * beantwortete seine Werkzeuge — aber DSH bekam keinen rotierenden Schlüssel an
 * die Hand. Der alte Stand hatte das Problem an der falschen Stelle gesucht (zwei
 * Ereignisnamen ohne Emitter) und die Schlüssel obendrein aus `process.env`
 * gelesen, wo die `.env`-Werte nie stehen — im echten Boot blieb der Pool leer.
 * → Kanon: docs/COMMENT-KANON.md#k-a0977c801963
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePatchFile } from '../../lib/repo.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const INDEX = 'packages/key-router/index.js';
const CANARY_A = 'sk-override-erster-kanarienvogel-1';
const CANARY_B = 'sk-override-zweiter-kanarienvogel-2';

/** Die wirksame Router-Config des Profils (die ENTSCHEIDUNG, nicht der Default). */
function profileProviders() {
  const { patches, issues } = parsePatchFile(join(ROOT, 'profiles/shinon/cordis.patch.yml'));
  assert.deepEqual(issues, [], 'das Profil ist nicht lesbar');
  const entry = patches.find((patch) => patch.id === 'shinon-key-router');
  assert.ok(entry !== undefined, 'das Profil hat keinen shinon-key-router-Eintrag');
  assert.ok(Array.isArray(entry.config?.providers) && entry.config.providers.length > 0, 'der Router nennt keinen Anbieter');
  return entry.config.providers;
}

test('key-router: jeder Anbieter nennt eine Referenz — ohne sie gibt es keinen Override', () => {
  for (const provider of profileProviders()) {
    assert.ok(typeof provider.id === 'string' && provider.id !== '', 'ein Anbieter ohne id rotiert ins Leere');
    assert.ok(
      Array.isArray(provider.envNames) && provider.envNames.length > 0,
      `Anbieter ${provider.id}: ohne envNames gibt es keine Referenz zum Bedienen`,
    );
  }
});

test('key-router: die Naht-Ereignisse stehen als Literale in der Host-Hälfte', () => {
  // Absichtlich der Ro htext (nicht codeOnly): codeOnly entfernt
  // String-Literale — genau das, was hier geprüft wird. Die gesuchte Form
  // `ctx.on('…'` steht in keinem Kommentar (dort nur in Backticks).
  const code = read(INDEX);
  assert.ok(
    code.includes(`ctx.on('agent/request-error'`),
    'die 429-Beobachtung hängt nicht an agent/request-error — ein Zuhörer ohne Sender',
  );
  assert.ok(
    code.includes('credentials'),
    'die Klammer greift nicht auf den credentials-Dienst zu',
  );
});

test('key-router: die Klammer bedient, gibt weiter, rückt vor und baut ab', async () => {
  const packageModule = await import('../../../packages/key-router/index.js').catch((error) => {
    assert.fail(`@shinon/key-router lädt nicht (node_modules nötig): ${error.message}`);
  });

  const calls = [];
  const tools = [];
  const launch = {
    get: (name) => (name === 'K_OVER_A' ? { value: CANARY_A, source: 'user-env' } : undefined),
  };
  const credentials = {
    async resolve(ref) {
      calls.push(String(ref));
      return { value: 'sk-original-aus-dem-tresor', source: 'file' };
    },
  };
  let errorHandler = null;
  const ctx = {
    inject: (_names, callback) => callback({ tools: { register: (tool) => tools.push(tool) } }),
    get: (name) => (name === 'launchEnvironment' ? launch : name === 'credentials' ? credentials : undefined),
    on: (event, handler) => {
      assert.equal(event, 'agent/request-error');
      errorHandler = handler;
      return () => { errorHandler = null; };
    },
  };
  process.env.K_OVER_P_2 = CANARY_B;
  const config = {
    providers: [{
      id: 'kanarienvogel',
      baseUrl: '',
      protocol: 'openai-compatible',
      models: [],
      probePath: '/models',
      envNames: ['K_OVER_A'],
      envPrefix: 'K_OVER_P',
      initialDelayMs: 2000,
      maxDelayMs: 60000,
      maxRetries: 5,
    }],
  };

  const logged = [];
  const realLog = console.log;
  const realWarn = console.warn;
  console.log = (...args) => logged.push(args.join(' '));
  console.warn = (...args) => logged.push(args.join(' '));
  try {
    const dispose = packageModule.apply(ctx, config);
    assert.ok(errorHandler !== null, 'die 429-Beobachtung wurde nicht registriert');

    // (a) Die verwaltete Referenz kommt aus dem Pool (erste Schicht: .env-Name).
    const first = await credentials.resolve('K_OVER_A');
    assert.equal(first.value, CANARY_A, 'der Pool bedient die Referenz — nicht der Tresor');
    assert.equal(first.source, 'pool');
    assert.deepEqual(calls, [], 'das Original wurde nicht gefragt');

    // (b) Fremdes erreicht das Original.
    const foreign = await credentials.resolve('K_FREMDE');
    assert.equal(foreign.value, 'sk-original-aus-dem-tresor');
    assert.deepEqual(calls, ['K_FREMDE']);

    // (c) Ein 429 deckelt den bedienten Platz; die nächste Auflösung rückt vor.
    const passed = await errorHandler(
      { provider: 'kanarienvogel', failure: { code: 'RATE_LIMIT' } },
      async () => 'WEITER',
    );
    assert.equal(passed, 'WEITER', 'die Middleware gibt next() unverändert weiter');
    const second = await credentials.resolve('K_OVER_A');
    assert.equal(second.value, CANARY_B, 'nach dem 429 dient der zweite Platz (Präfix-Scan aus dem Prozess)');
    assert.notEqual(second.value, first.value);

    // (d) Kein 429, kein Wechsel — auch nicht bei anderen Fehlerklassen.
    await errorHandler({ provider: 'kanarienvogel', failure: { code: 'TIMEOUT' } }, async () => 'WEITER');
    await errorHandler({ provider: 'fremder-anbieter', failure: { code: 'RATE_LIMIT' } }, async () => 'WEITER');
    assert.equal((await credentials.resolve('K_OVER_A')).value, CANARY_B);
    assert.equal(await errorHandler({ provider: 'kanarienvogel', failure: { code: 'RATE_LIMIT' } }), undefined, 'ohne next kein Wurf');

    // (f) Nirgends Schlüsselmaterial: weder im Log noch in einer Antwort.
    // Vor dem Abbau gelesen — danach sind die Pools bestimmungsgemäß leer.
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const status = JSON.stringify(await byName.get('key_router_status').execute({}));
    for (const text of [...logged, status]) {
      assert.equal(text.includes(CANARY_A), false, `Schlüsselmaterial sichtbar: ${text.slice(0, 160)}`);
      assert.equal(text.includes(CANARY_B), false, `Schlüsselmaterial sichtbar: ${text.slice(0, 160)}`);
      assert.equal(text.includes('sk-'), false, `Schlüssel-Präfix sichtbar: ${text.slice(0, 160)}`);
    }
    // (g) Was stattdessen drinsteht: zwei Plätze, einer gedeckelt.
    assert.match(status, /key#1/);
    assert.match(status, /key#2/);

    // (e) Abbau: der Dienst sieht wieder so aus wie vorher.
    dispose();
    assert.equal(errorHandler, null, 'die Beobachtung ist abgemeldet');
    assert.equal((await credentials.resolve('K_OVER_A')).value, 'sk-original-aus-dem-tresor');
  } finally {
    console.log = realLog;
    console.warn = realWarn;
    delete process.env.K_OVER_P_2;
  }
});
