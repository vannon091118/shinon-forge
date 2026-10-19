#!/usr/bin/env node
/**
 * key-router-wire — der Draht beweist die Rotation (PLAN.md §3.12, EBENE 4).
 *
 * WARUM DIESE DATEI EXISTIERT: ein Pool, der gesunde Anbieter waehlt, ist noch
 * keine Rotation des tatsaechlich verwendeten Providers. Der Override-Test
 * (`key-router-override.test.mjs`) beweist, dass `credentials.resolve` den
 * Pool bedient — aber zwischen `resolve` und dem Anbieter steht noch der
 * REQUEST. Erst wenn ein echter Request mit dem gewaehlten Schluessel am
 * gewaehlten Anbieter ankommt, ist die Kette geschlossen.
 *
 * WAS HIER ECHT IST: `apply()` mit Dienst-Attrappen (wie im Override-Test),
 * das echte `key_router_probe`-Werkzeug, echtes `fetch` gegen einen echten
 * HTTP-Server — aber nur auf Loopback (127.0.0.1, ephemerer Port): kein Paket
 * verlaesst die Maschine. Die Schluessel sind Kanarienvogel (kein Material).
 *
 * WAS GEMESSEN WIRD, STUFE FUER STUFE:
 *
 *   1. Der erste Probe-Request traegt `Authorization: Bearer <K_A>` an die
 *      baseUrl des gewaehlten Anbieters — Auswahl, Kopfzeilen, Draht.
 *   2. Antwortet der Anbieter EINMAL mit 429, markiert genau dieser Versuch
 *      seinen Platz (failCount hoch, Cooldown laeuft).
 *   3. Der naechste Request traegt `Bearer <K_B>` — die Rotation ist auf dem
 *      Draht angekommen, nicht nur im Pool.
 *   4. Nirgendwo Schluesselmaterial: weder in den Werkzeug-Antworten noch im
 *      Status — nur auf dem Draht, nur Richtung Anbieter.
 *
 * Was der Test NICHT beweist (ehrlich): eine 429-Rotation gegen die laufende
 * Route mit echten Schluesseln — dafuer braeuchte es zwei echte Schluessel und
 * einen erzwungenen 429 in dieser Umgebung. Das steht in docs/ZAHLEN.md §4,
 * nicht hier.
 *
 * Laeuft mit `node --test` (`npm run gate:test`, CI mit `npm ci`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const CANARY_A = 'sk-draht-erster-kanarienvogel-1';
const CANARY_B = 'sk-draht-zweiter-kanarienvogel-2';

/** Ein Anbieter, der nur auf Loopback existiert und alles mitschreibt. */
function stubProvider() {
  const requests = [];
  let failOnce = false;
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, method: req.method, authorization: req.headers.authorization ?? null });
    if (failOnce) {
      failOnce = false;
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'too many requests', type: 'rate_limit' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'stub-model' }] }));
  });
  return {
    requests,
    arm429Once() { failOnce = true; },
    async listen() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('key-router: der echte Request laeuft mit dem gewaehlten Anbieter und dessen Schluessel — und rotiert nach 429 auf dem Draht', async () => {
  const packageModule = await import('../../../packages/key-router/index.js').catch((error) => {
    assert.fail(`@shinon/key-router laedt nicht (node_modules noetig): ${error.message}`);
  });

  const stub = stubProvider();
  const baseUrl = await stub.listen();
  assert.ok(new URL(baseUrl).hostname === '127.0.0.1', 'kein Paket verlaesst die Maschine');

  const tools = [];
  const launch = {
    get: (name) => (name === 'K_WIRE_A' ? { value: CANARY_A, source: 'user-env' } : undefined),
  };
  const credentials = {
    async resolve() {
      return { value: 'sk-original-aus-dem-tresor', source: 'file' };
    },
  };
  let errorHandler = null;
  const ctx = {
    inject: (_names, callback) => callback({ tools: { register: (tool) => tools.push(tool) } }),
    get: (name) => (name === 'launchEnvironment' ? launch : name === 'credentials' ? credentials : undefined),
    on: (event, handler) => {
      errorHandler = handler;
      return () => { errorHandler = null; };
    },
  };
  process.env.K_WIRE_P_2 = CANARY_B;
  const config = {
    providers: [{
      id: 'draht-anbieter',
      baseUrl,
      protocol: 'openai-compatible',
      models: [],
      probePath: '/models',
      envNames: ['K_WIRE_A'],
      envPrefix: 'K_WIRE_P',
      initialDelayMs: 500,
      maxDelayMs: 5000,
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
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    assert.ok(byName.has('key_router_probe'), 'das Probe-Werkzeug ist registriert');

    // Die Beobachtung ist registriert UND gibt weiter: der Router entscheidet
    // nicht ueber Wiederholungen (`llm-retry` tut das), er zaehlt nur.
    assert.equal(typeof errorHandler, 'function', 'der 429-Beobachter haengt am Ereignis');
    let forwarded = 0;
    errorHandler({}, () => { forwarded += 1; });
    assert.equal(forwarded, 1, 'die Beobachtung faengt den Fehler nicht ab, sie reicht ihn weiter');

    // (1) Der erste echte Request: gewaehlter Anbieter, gewaehlter Schluessel.
    const first = await byName.get('key_router_probe').execute({ providerId: 'draht-anbieter' });
    assert.equal(first.ok, true, `der Draht steht: ${JSON.stringify(first)}`);
    assert.deepEqual(first.models, ['stub-model']);
    assert.equal(first.active, 'key#1');
    assert.equal(stub.requests.length, 1, 'genau ein Request ging raus');
    assert.equal(stub.requests[0].method, 'GET');
    assert.ok(stub.requests[0].url.endsWith('/models'), `an die Modellliste: ${stub.requests[0].url}`);
    assert.equal(
      stub.requests[0].authorization,
      `Bearer ${CANARY_A}`,
      'der Draht traegt den gewaehlten Schluessel — nicht den Tresor, nicht den anderen Platz',
    );

    // (2) Einmal 429: genau dieser Versuch deckelt seinen Platz.
    stub.arm429Once();
    const limited = await byName.get('key_router_probe').execute({ providerId: 'draht-anbieter' });
    assert.equal(limited.ok, false);
    assert.equal(limited.status, 429);
    assert.equal(stub.requests.length, 2, 'der 429-Versuch ging ueber denselben Draht');
    assert.equal(stub.requests[1].authorization, `Bearer ${CANARY_A}`, 'gedeckelt wird der Platz, der bedient hat');
    const status = await byName.get('key_router_status').execute({});
    const slotA = status.pools['draht-anbieter'].keys.find((slot) => slot.label === 'key#1');
    assert.equal(slotA.state, 'cooling', 'Platz 1 kuehlt ab');
    assert.ok(slotA.coolingMs > 0, 'mit Restzeit, nicht mit Behauptung');

    // (3) Der naechste Request rotiert auf dem Draht: anderer Schluessel.
    const second = await byName.get('key_router_probe').execute({ providerId: 'draht-anbieter' });
    assert.equal(second.ok, true, `nach dem 429 steht der Draht wieder: ${JSON.stringify(second)}`);
    assert.equal(second.active, 'key#2');
    assert.equal(stub.requests.length, 3);
    assert.equal(
      stub.requests[2].authorization,
      `Bearer ${CANARY_B}`,
      'die Rotation ist auf dem Draht angekommen — nicht nur im Pool',
    );
    assert.notEqual(stub.requests[2].authorization, stub.requests[0].authorization);

    // (4) Schluesselmaterial steht nirgends ausser auf dem Draht.
    for (const text of [...logged, JSON.stringify(first), JSON.stringify(second), JSON.stringify(status)]) {
      assert.equal(text.includes(CANARY_A), false, `Schluessel sichtbar: ${text.slice(0, 160)}`);
      assert.equal(text.includes(CANARY_B), false, `Schluessel sichtbar: ${text.slice(0, 160)}`);
    }

    dispose();
  } finally {
    console.log = realLog;
    console.warn = realWarn;
    delete process.env.K_WIRE_P_2;
    await stub.close();
  }
});
