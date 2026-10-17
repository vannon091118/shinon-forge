#!/usr/bin/env node
/**
 * route-fallback.test.mjs — die wirksame One-Shot-Route (Phase 5).
 *
 * Gepinnt wird: eigener Schlüssel → Primärroute; fehlender Schlüssel +
 * konfiguriertem Fallback → Fallback; ohne beides → Primärroute (dann meldet
 * der Enhancer NO_ROUTE und der Roh-Prompt gilt — unveraendertes Fail-open).
 * Der Name der Umgebungsvariable kommt aus der Config (nie ein Wert in der
 * Config) — dieselbe Regel wie beim Key-Router.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { effectiveRoute } from '../index.js';

const KEY_ENV = 'SHINON_TEST_PROMPTER_KEY';
const base = {
  provider: 'prompter',
  model: 'one-shot-model',
  providerKeyEnv: KEY_ENV,
  providerFallback: 'agnes',
  modelFallback: 'agnes-2.5-flash',
};

const withEnv = (value, config) => {
  const had = Object.hasOwn(process.env, KEY_ENV);
  const before = process.env[KEY_ENV];
  if (value === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = value;
  try {
    return effectiveRoute(config);
  } finally {
    if (had) process.env[KEY_ENV] = before;
    else delete process.env[KEY_ENV];
  }
};

test('route: eigener Schluessel heißt Primärroute', () => {
  assert.deepEqual(withEnv('sk-eigen', base), { provider: 'prompter', model: 'one-shot-model' });
  assert.deepEqual(withEnv(' ', base), { provider: 'prompter', model: 'one-shot-model' }, 'Nur-Leerraum zählt als gesetzt — der Adapter liest die Variable selbst');
});

test('route: fehlender Schluessel faellt auf die konfigurierte Alternative', () => {
  assert.deepEqual(withEnv(undefined, base), { provider: 'agnes', model: 'agnes-2.5-flash' });
  assert.deepEqual(withEnv('', base), { provider: 'agnes', model: 'agnes-2.5-flash' });
  // Ohne eigenes Modell faellt dasselbe Modell mit.
  assert.deepEqual(
    withEnv(undefined, { ...base, modelFallback: '' }),
    { provider: 'agnes', model: 'one-shot-model' },
  );
});

test('route: ohne Konfiguration bleibt das alte Verhalten (Primärroute)', () => {
  assert.deepEqual(withEnv(undefined, { provider: 'agnes', model: 'm' }), { provider: 'agnes', model: 'm' });
  assert.deepEqual(
    withEnv('sk-eigen', { ...base, providerFallback: '' }),
    { provider: 'prompter', model: 'one-shot-model' },
    'ohne Fallback-Route gilt die Primärroute — NO_ROUTE bleibt der ehrliche Ausgang',
  );
});
