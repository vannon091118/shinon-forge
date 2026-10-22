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
import { chosenRoute, modelRouteIssues, readModelRoutes, routeIssues } from '../../lib/model-route.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PROFILES = ['mobile', 'shinon', 'headless'];

const read = (profile) => readFileSync(join(ROOT, 'profiles', profile, 'cordis.patch.yml'), 'utf8');

test('jedes Profil nennt eine Route, die sein eigener Katalog führt', () => {
  for (const profile of PROFILES) {
    const text = read(profile);
    assert.deepEqual(modelRouteIssues(text), [], `${profile}: ${modelRouteIssues(text).join(', ')}`);
  }
});

test('dynamische DSH-Kataloge sind zulässig, feste Kataloge bleiben geprüft', () => {
  const dynamic = {
    providers: { openrouter: { apiKeyEnv: 'SHINON_API_KEY', models: [] } },
    route: { provider: 'openrouter', model: 'google/gemma-4-31b-it:free' },
  };
  assert.deepEqual(routeIssues(dynamic), []);
  assert.deepEqual(routeIssues({
    providers: { openrouter: { apiKeyEnv: 'SHINON_API_KEY', models: ['known-model'] } },
    route: { provider: 'openrouter', model: 'missing-model' },
  }), ['ROUTE_MODEL_NOT_IN_CATALOG:openrouter/missing-model']);
});

test('die gewählte Shinon-Route ist im eingebauten Katalog des gepinnten DSH', async () => {
  const { getBuiltinModels } = await import('@earendil-works/pi-ai/providers/all');
  const routes = readModelRoutes(read('shinon'));
  assert.ok(routes.providers[routes.route.provider].models.length === 0, 'Probe muss den dynamischen Provider abdecken');
  const models = getBuiltinModels(routes.route.provider);
  assert.ok(models.some((entry) => entry.id === routes.route.model), `${routes.route.provider}/${routes.route.model} fehlt im DSH-Katalog`);
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

test('der Schlüsselname kommt aus der gewählten Route, nicht aus dem Skript', () => {
  const base = {
    providers: { agnes: { apiKeyEnv: 'AGNES_API_KEY', models: ['agnes-x'] } },
    route: { provider: 'agnes', model: 'agnes-x' },
  };
  const dump = (route, providers = base.providers) => [
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    ...Object.entries(providers).flatMap(([name, provider]) => [
      `      ${name}:`,
      `        apiKeyEnv: ${provider.apiKeyEnv}`,
      '        models:',
      ...provider.models.map((model) => `          - id: ${model}`),
    ]),
    '- id: agent-default-model',
    '  config:',
    `    provider: ${route.provider}`,
    `    model: ${route.model}`,
  ].join('\n');

  // Zwei Routen, zwei Schlüssel: derselbe Dump-Aufbau, verschiedene Namen.
  assert.equal(chosenRoute(dump({ provider: 'agnes', model: 'agnes-x' })).keyName, 'AGNES_API_KEY');
  const prompter = dump({ provider: 'prompter', model: 'agnes-x' }, {
    ...base.providers,
    prompter: { apiKeyEnv: 'PROMPTER_API_KEY', models: ['agnes-x'] },
  });
  assert.deepEqual(chosenRoute(prompter), {
    provider: 'prompter', model: 'agnes-x', apiKeyEnv: 'PROMPTER_API_KEY', keyName: 'PROMPTER_API_KEY',
  });

  // Unbekannter Provider heißt leerer Name — der Aufrufer wird rot, statt zu raten.
  assert.equal(chosenRoute(dump({ provider: 'fremd', model: 'agnes-x' })).keyName, '');

  // Der echte Profil-Patch: der Name ist der des gewählten Providers.
  for (const profile of PROFILES) {
    const routes = readModelRoutes(read(profile));
    assert.equal(
      chosenRoute(read(profile)).keyName,
      routes.providers[routes.route.provider].apiKeyEnv,
      `${profile}: apiKeyEnv der gewählten Route`,
    );
  }
});

test('der S6-Preflight fragt die Route, die er anzeigt', () => {
  const script = readFileSync(join(ROOT, 'scripts/s6-turn.mjs'), 'utf8');
  assert.match(script, /chosenRoute/);
  // Kein fester Schlüsselname bei der Prüfung: eine Konstante neben einer
  // wählbaren Route beantwortet die falsche Frage (der Fall vom 2026-10-20).
  assert.doesNotMatch(script, /process\.env\[\s*['"]?AGNES_API_KEY/);
  assert.doesNotMatch(script, /keySource\(\s*\)/);
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
