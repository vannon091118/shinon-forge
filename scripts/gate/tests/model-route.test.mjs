/**
 * Gate: die Modellroute ist eine FORM, kein Name.
 *
 * Drei Zusagen:
 *   1. Der Profil-Patch nennt einen Provider, den er selbst definiert, und ein
 *      Modell aus dessen Katalog — kein Test pinnt mehr ein Modell-Literal.
 *   2. Der schlanke Extraktor (läuft ohne `npm ci` in CI) liest dieselben Werte
 *      wie `js-yaml`; sonst wäre die Vereinfachung eine stille zweite Wahrheit.
 *   3. Jeder Formfehler hat einen benannten Befund — ein leeres Feld ist rot,
 *      nicht „keine Route konfiguriert".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml } from '../../lib/yaml.mjs';
import { modelRouteIssues, readModelRoutes, routeIssues } from '../../lib/model-route.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PROFILES = ['mobile', 'shinon', 'headless'];

const read = (profile) => readFileSync(join(ROOT, 'profiles', profile, 'cordis.patch.yml'), 'utf8');

test('jedes Profil nennt eine Route, die sein eigener Katalog führt', () => {
  for (const profile of PROFILES) {
    const text = read(profile);
    assert.deepEqual(modelRouteIssues(text), [], `${profile}: ${modelRouteIssues(text).join(', ')}`);
  }
});

test('der Extraktor liest, was der echte Parser liest', () => {
  for (const profile of PROFILES) {
    const text = read(profile);
    const entries = loadYaml(text);
    const llm = entries.find((entry) => entry.name === '@deepseek-ai/dsh-llm-pi-ai');
    const chosen = entries.find((entry) => entry.name === '@deepseek-ai/dsh-agent-default-model');
    assert.ok(llm && chosen, `${profile}: Route-Einträge fehlen`);

    const routes = readModelRoutes(text);
    assert.deepEqual(routes.route, { provider: chosen.config.provider, model: chosen.config.model }, `${profile}: Route`);
    assert.deepEqual(Object.keys(routes.providers).sort(), Object.keys(llm.config.providers).sort(), `${profile}: Provider`);
    for (const [name, provider] of Object.entries(llm.config.providers)) {
      assert.deepEqual(
        routes.providers[name].models,
        (provider.models ?? []).map((model) => model.id),
        `${profile}/${name}: Katalog`,
      );
      assert.equal(routes.providers[name].apiKeyEnv, provider.apiKeyEnv ?? '', `${profile}/${name}: apiKeyEnv`);
    }
  }
});

test('die Route des Profils ist nicht auf ein Modell festgenagelt', () => {
  for (const profile of PROFILES) {
    const text = read(profile);
    const routes = readModelRoutes(text);
    // Ein anderes Modell AUS DEM KATALOG muss gültig sein — sonst wäre die
    // Prüfung nur ein umbenanntes Literal.
    const provider = routes.providers[routes.route.provider];
    const alternative = provider.models.find((model) => model !== routes.route.model);
    if (alternative === undefined) continue;
    assert.deepEqual(routeIssues({ ...routes, route: { ...routes.route, model: alternative } }), [], `${profile}: ${alternative}`);
  }
});

test('der mobile-Vertrag prüft die Form, kein Modell-Literal', () => {
  const script = readFileSync(join(ROOT, 'scripts/mobile-profile-contract-test.mjs'), 'utf8');
  assert.match(script, /modelRouteIssues/);
  assert.doesNotMatch(script, /agnes-\d/);
  assert.doesNotMatch(script, /deepseek-chat/);
});

test('Formfehler werden benannt, nicht still hingenommen', () => {
  const base = {
    providers: { agnes: { apiKeyEnv: 'AGNES_API_KEY', models: ['agnes-x'] } },
    route: { provider: 'agnes', model: 'agnes-x' },
  };
  assert.deepEqual(routeIssues(base), []);

  assert.deepEqual(routeIssues({ ...base, route: { provider: '', model: '' } }), [
    'ROUTE_PROVIDER_EMPTY', 'ROUTE_MODEL_EMPTY', 'ROUTE_MISSING',
  ]);
  assert.deepEqual(routeIssues({ ...base, route: { provider: 'fremd', model: 'agnes-x' } }), [
    'ROUTE_PROVIDER_UNKNOWN:fremd',
  ]);
  assert.deepEqual(routeIssues({ ...base, route: { provider: 'agnes', model: 'gpt-y' } }), [
    'ROUTE_MODEL_NOT_IN_CATALOG:agnes/gpt-y',
  ]);
  assert.deepEqual(routeIssues({ providers: { agnes: { apiKeyEnv: '', models: ['agnes-x'] } }, route: base.route }), [
    'ROUTE_KEY_ENV_EMPTY:agnes',
  ]);
  assert.deepEqual(routeIssues(null), ['ROUTE_PROVIDER_EMPTY', 'ROUTE_MODEL_EMPTY', 'ROUTE_MISSING']);
});
