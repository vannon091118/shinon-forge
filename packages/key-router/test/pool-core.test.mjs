#!/usr/bin/env node
/**
 * Key-Router-Kern — ohne DSH, ohne Netz, ohne Modell, ohne node_modules.
 *
 * Belegt wird, was der Kern VERSPRICHT:
 *
 *   - Die Wartezeit wächst exponentiell, ist gedeckelt und mit gestelltem Zufall
 *     nachrechenbar (der erste Fehlschlag wartet `initialDelayMs`, nicht das
 *     Doppelte).
 *   - Ausgewählt wird der Platz mit den wenigsten Fehlschlägen unter den
 *     verfügbaren; sind alle im Cooldown, gewinnt der früheste.
 *   - `force` WECHSELT den Platz (sonst dreht eine erzwungene Rotation im Kreis).
 *   - Nach außen geht NUR die Beschriftung (`key#N`): `statusOf` trägt kein
 *     Schlüsselmaterial, `redact` entfernt es aus jedem Text, und `buildProbeRequest`
 *     setzt es ausschließlich in die Kopfzeilen.
 *
 * Läuft mit `node --test` (`npm test`) — kein DSH, kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  KEY_LABEL_PREFIX,
  authHeaders,
  buildEntries,
  buildProbeRequest,
  calcBackoff,
  createResolveOverlay,
  fetchCatalog,
  keyLabel,
  keysFromEnv,
  markFailed,
  nextEntry,
  observeRequestError,
  probeResult,
  redact,
  refNameOf,
  resetSuccess,
  statusOf,
  valuesFromLayers,
} from '../assets/pool-core.js';

const CANARY = 'sk-canary-niemals-ausgeben-4711';
const fixed = (value) => () => value;

test('key-router: Beschriftungen sind Plätze, keine Auszüge', () => {
  assert.equal(KEY_LABEL_PREFIX, 'key#');
  assert.equal(keyLabel(0), 'key#1');
  assert.equal(keyLabel(6), 'key#7');
  const entries = buildEntries([CANARY, 'zweiter', CANARY, '', null]);
  assert.equal(entries.length, 2, 'Doppelte und Leeres fallen weg');
  assert.equal(entries[0].label, 'key#1');
  assert.equal(entries[1].label, 'key#2');
});

test('key-router: die Reihenfolge der Namen ist der Ausweis', () => {
  const env = { SECRET_B: 'b', DEEPSEEK_API_KEY: 'haupt', DEEPSEEK_API_KEY_2: 'zwei', DEEPSEEK_API_KEY_LEER: '' };
  assert.deepEqual(keysFromEnv(env, { names: ['SECRET_B', 'FEHLT'], prefix: '' }), ['b']);
  assert.deepEqual(
    keysFromEnv(env, { names: ['SECRET_B'], prefix: 'DEEPSEEK_API_KEY' }),
    ['b', 'haupt', 'zwei'],
    'ausdrückliche Namen zuerst, dann der Präfix (der Präfix-Zweig sortiert nicht um)',
  );
  assert.deepEqual(keysFromEnv(undefined, { names: ['X'] }), []);
});

test('key-router: die Wartezeit wächst, gedeckelt und nachrechenbar', () => {
  assert.equal(calcBackoff(1, 2000, 60000, fixed(0.5)), 2000, 'der erste Fehlschlag wartet initialDelayMs');
  assert.equal(calcBackoff(2, 2000, 60000, fixed(0.5)), 4000);
  assert.equal(calcBackoff(3, 2000, 60000, fixed(0.5)), 8000);
  assert.equal(calcBackoff(9, 2000, 60000, fixed(0.5)), 60000, 'gedeckelt bei maxDelayMs');
  assert.equal(calcBackoff(1, 2000, 60000, fixed(0)), 1500, 'Jitter nach unten: -25%');
  assert.equal(calcBackoff(1, 2000, 60000, fixed(1)), 2500, 'Jitter nach oben: +25%');
  assert.equal(calcBackoff(1, 2000, 60000, fixed(0)), 1500);
});

test('key-router: markFailed deckelt und resetSuccess baut Schuld ab', () => {
  const [entry] = buildEntries([CANARY]);
  const first = markFailed(entry, 1000, 2000, 60000, fixed(0.5));
  assert.deepEqual(first, { label: 'key#1', failCount: 1, delay: 2000 });
  assert.equal(entry.cooldownUntil, 3000);
  const second = markFailed(entry, 3000, 2000, 60000, fixed(0.5));
  assert.equal(second.delay, 4000);
  assert.equal(entry.cooldownUntil, 7000);
  resetSuccess(entry);
  assert.equal(entry.failCount, 1, 'ein Erfolg nimmt einen Fehlschlag zurück, nicht alle');
  assert.equal(entry.cooldownUntil, 0);
  resetSuccess(entry);
  assert.equal(entry.failCount, 0);
  resetSuccess(entry);
  assert.equal(entry.failCount, 0, 'nie unter null');
});

test('key-router: gewählt wird der gesündeste verfügbare Platz', () => {
  const entries = buildEntries([CANARY, 'zweiter', 'dritter']);
  entries[0].failCount = 3;
  entries[1].failCount = 0;
  entries[2].failCount = 1;
  assert.equal(nextEntry(entries, 0).label, 'key#2');
  // Alle im Cooldown: der früheste gewinnt — auch wenn er der schlechteste ist.
  for (const entry of entries) entry.cooldownUntil = 1000 + entry.failCount;
  assert.equal(nextEntry(entries, 0).label, 'key#2');
  entries[1].cooldownUntil = 5000;
  assert.equal(nextEntry(entries, 0).label, 'key#3');
  assert.equal(nextEntry([], 0), null);
});

test('key-router: force WECHSELT den Platz, statt im Kreis zu drehen', () => {
  const entries = buildEntries([CANARY, 'zweiter']);
  assert.equal(nextEntry(entries, 0, false, 'key#1').label, 'key#1', 'ohne force bleibt der beste Platz');
  assert.equal(nextEntry(entries, 0, true, 'key#1').label, 'key#2', 'mit force wird gewechselt');
  assert.equal(nextEntry(entries, 0, true, 'key#2').label, 'key#1');
  // Ist nur EIN Platz verfügbar, gewinnt er auch bei force (besser als nichts).
  entries[1].cooldownUntil = 10000;
  assert.equal(nextEntry(entries, 0, true, 'key#1').label, 'key#1');
});

test('key-router: statusOf gibt Beschriftungen, Fehlschläge und Restzeiten — keine Schlüssel', () => {
  const entries = buildEntries([CANARY, 'zweiter']);
  markFailed(entries[1], 1000, 2000, 60000, fixed(0.5));
  const status = statusOf(entries, 2000, 'key#1');
  assert.deepEqual(status, {
    total: 2,
    available: 1,
    cooling: 1,
    active: 'key#1',
    keys: [
      { label: 'key#1', failCount: 0, coolingMs: 0, state: 'active' },
      { label: 'key#2', failCount: 1, coolingMs: 1000, state: 'cooling' },
    ],
  });
  assert.equal(JSON.stringify(status).includes(CANARY), false, 'der Zustand darf kein Schlüsselmaterial tragen');
  assert.equal(JSON.stringify(status).includes('sk-'), false, 'auch kein Präfix davon');
});

test('key-router: redact entfernt Schlüsselmaterial aus JEDEM Text', () => {
  assert.equal(redact(`Anfrage mit ${CANARY} gescheitert`, [CANARY]), 'Anfrage mit [key] gescheitert');
  assert.equal(redact(`${CANARY}${CANARY}`, [CANARY]), '[key][key]', 'jedes Vorkommen');
  assert.equal(redact('ohne Schlüssel', [CANARY, '']), 'ohne Schlüssel');
  assert.equal(redact({ toString: () => `Wert ${CANARY}` }, [CANARY]), 'Wert [key]', 'auch nicht-Strings');
  assert.equal(redact('bleibt', undefined), 'bleibt');
});

test('key-router: valuesFromLayers liest ausdrückliche Namen aus allen Schichten', () => {
  const launch = {
    get: (name) => name === 'AGNES_API_KEY'
      ? { value: 'aus-der-datei', source: 'user-env' }
      : name === 'LEER'
        ? { value: '', source: 'process' }
        : undefined,
  };
  assert.deepEqual(valuesFromLayers(launch, ['AGNES_API_KEY', 'FEHLT']), { AGNES_API_KEY: 'aus-der-datei' });
  assert.deepEqual(valuesFromLayers(launch, ['LEER']), {}, 'ein leerer Wert ist kein Wert');
  assert.deepEqual(valuesFromLayers(undefined, ['AGNES_API_KEY']), {}, 'ohne Naht gilt nichts');
  assert.deepEqual(valuesFromLayers({}, ['AGNES_API_KEY']), {}, 'ohne get gilt nichts');
  assert.deepEqual(valuesFromLayers(launch, 'kein-array'), {});
});

test('key-router: refNameOf trägt den Namen, nicht die Marke', () => {
  assert.equal(refNameOf('AGNES_API_KEY'), 'AGNES_API_KEY');
  // Eine gebrandete Referenz ist zur Laufzeit eine Zeichenkette (brandString gibt
  // den Wert unverändert zurück) — trotzdem liest sich alles gleich.
  assert.equal(refNameOf(Object('AGNES_API_KEY')), 'AGNES_API_KEY');
});

test('key-router: die Klammer bedient Verwaltetes aus dem Pool und gibt den Rest weiter', async () => {
  const calls = [];
  const service = { async resolve(ref) { calls.push(String(ref)); return { value: 'original', source: 'file' }; } };
  const pool = buildEntries([CANARY, 'zweiter']);
  const overlay = createResolveOverlay(service, {
    managed: ['AGNES_API_KEY'],
    select: (name) => (name === 'AGNES_API_KEY' ? pool[0] : null),
  });
  assert.ok(overlay !== null);
  assert.deepEqual(overlay.names, ['AGNES_API_KEY']);

  const served = await service.resolve('AGNES_API_KEY');
  assert.equal(served.value, CANARY, 'die verwaltete Referenz kommt aus dem Pool');
  assert.equal(served.source, 'pool');
  assert.deepEqual(calls, [], 'das Original wurde nicht gefragt');

  const foreign = await service.resolve('ANDERER');
  assert.equal(foreign.value, 'original', 'Fremdes erreicht das Original');
  assert.deepEqual(calls, ['ANDERER']);

  overlay.restore();
  const after = await service.resolve('AGNES_API_KEY');
  assert.equal(after.value, 'original', 'nach restore sieht der Dienst wieder so aus wie vorher');
  overlay.restore();
  assert.equal((await service.resolve('X')).value, 'original', 'restore ist wiederholbar');
});

test('key-router: ohne Pool fällt die Klammer aufs Original zurück statt zu behaupten', async () => {
  const service = { async resolve() { return { value: 'original', source: 'file' }; } };
  const overlay = createResolveOverlay(service, { managed: ['AGNES_API_KEY'], select: () => null });
  assert.equal((await service.resolve('AGNES_API_KEY')).value, 'original');
  overlay.restore();
});

test('key-router: ohne Dienst gibt es keine Klammer', () => {
  assert.equal(createResolveOverlay(undefined, { managed: ['A'] }), null);
  assert.equal(createResolveOverlay({}, { managed: ['A'] }), null);
  assert.equal(createResolveOverlay({ resolve: 'keine-funktion' }, { managed: ['A'] }), null);
});

test('key-router: beobachtet wird nur RATE_LIMIT für einen benannten Anbieter', () => {
  assert.deepEqual(
    observeRequestError({ provider: 'agnes', failure: { code: 'RATE_LIMIT' } }),
    { provider: 'agnes' },
  );
  assert.equal(observeRequestError({ provider: 'agnes', failure: { code: 'TIMEOUT' } }), null, 'kein Wechsel ohne 429');
  assert.equal(observeRequestError({ provider: 'agnes', failure: { code: 'AUTH' } }), null, 'ein toter Schlüssel leert nicht den Pool');
  assert.equal(observeRequestError({ provider: 'agnes' }), null);
  assert.equal(observeRequestError({ failure: { code: 'RATE_LIMIT' } }), null, 'ohne Anbieter kein Ziel');
  assert.equal(observeRequestError(null), null);
  assert.equal(observeRequestError('kein-objekt'), null);
});

test('key-router: authHeaders tragen den Schlüssel nur im Kopf', () => {
  assert.deepEqual(authHeaders({ protocol: 'openai-compatible' }, CANARY), {
    authorization: `Bearer ${CANARY}`,
    'content-type': 'application/json',
  });
  const anthropic = authHeaders({ protocol: 'anthropic' }, CANARY);
  assert.equal(anthropic['x-api-key'], CANARY);
  assert.equal('authorization' in anthropic, false);
  assert.equal(authHeaders(undefined, CANARY).authorization, `Bearer ${CANARY}`, 'ohne Protokoll gilt openai-compatible');
  assert.deepEqual(authHeaders({ protocol: 'openai-compatible' }, ''), {}, 'ohne Schluessel kein erfundener Kopf');
});

test('key-router: fetchCatalog liest die Liste des Anbieters live, ohne erfundenen Authorization-Kopf', async () => {
  const seen = [];
  const server = createServer((request, response) => {
    seen.push(request.headers.authorization ?? null);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'live-eins' }, { id: 'live-zwei' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const catalog = await fetchCatalog([
      { id: 'openrouter', baseUrl: `http://127.0.0.1:${port}/v1`, probePath: '/models' },
      { id: 'ohne-basis', baseUrl: '' },
    ], { secrets: [CANARY], now: () => 42 });
    assert.deepEqual(Object.keys(catalog), ['openrouter'], 'ein Anbieter ohne baseUrl wird nicht gefragt');
    assert.equal(catalog.openrouter.ok, true);
    assert.equal(catalog.openrouter.at, 42);
    assert.deepEqual(catalog.openrouter.models, ['live-eins', 'live-zwei']);
    assert.deepEqual(seen, [null], 'eine oeffentliche Liste fragt ohne Authorization');
  } finally {
    server.close();
  }
  const refused = await fetchCatalog([{ id: 'x', baseUrl: 'https://x/v1' }], {
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: CANARY }) }),
    secrets: [CANARY],
  });
  assert.equal(refused.x.ok, false);
  assert.equal(refused.x.error, 'HTTP 429');
  assert.equal(JSON.stringify(refused).includes(CANARY), false, 'der Fehlertext traegt keinen Schluessel');
});

test('key-router: buildProbeRequest ist beschreibbar, ohne den Schlüssel zu zeigen', () => {
  const request = buildProbeRequest({ baseUrl: 'https://api.example/v1/', protocol: 'openai-compatible' }, CANARY, '/models');
  assert.equal(request.url, 'https://api.example/v1/models', 'der Basis-Schrägstrich wird nicht verdoppelt');
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, `Bearer ${CANARY}`, 'der Schlüssel steht im Kopf — dort darf er sein');
  // Die BESCHREIBUNG ist öffentlich: URL und Methode dürfen ins Log, der Kopf nicht.
  assert.equal(request.url.includes(CANARY), false);
  assert.equal(request.method.includes(CANARY), false);
  const withoutBase = buildProbeRequest({ baseUrl: '' }, CANARY, '/models');
  assert.equal(withoutBase.url, '/models');
  assert.equal(buildProbeRequest({ baseUrl: 'https://x', probePath: 'models' }, CANARY, '/models').url, 'https://x/models');
});

test('key-router: probeResult liest Status und Modelle und redigiert Fehler', async () => {
  const ok = await probeResult({ ok: true, status: 200, json: async () => ({ data: [{ id: 'a' }, { id: 'b' }] }) }, [CANARY]);
  assert.deepEqual(ok, { ok: true, status: 200, models: ['a', 'b'] });
  const alt = await probeResult({ ok: true, status: 200, json: async () => ({ models: [{ name: 'c' }] }) }, [CANARY]);
  assert.deepEqual(alt.models, ['c']);
  const noJson = await probeResult({ ok: true, status: 204, json: async () => { throw new Error('kein JSON'); } }, [CANARY]);
  assert.deepEqual(noJson, { ok: true, status: 204, models: null }, 'keine Verbindung ist kein Fehler des Tests');
  const failed = await probeResult({ ok: false, status: 401, json: async () => ({ error: CANARY }) }, [CANARY]);
  assert.deepEqual(failed, { ok: false, status: 401, detail: 'HTTP 401' });
  assert.equal(JSON.stringify(failed).includes(CANARY), false);
});
