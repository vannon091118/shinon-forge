/**
 * model-route.mjs — die Modellroute eines Profils als FORM prüfen.
 *
 * Warum nicht das Modell pinnen: ein Test, der `agnes-2.5-flash` wörtlich
 * erwartet, ist beim nächsten Modellwechsel rot — und dann wird die Zahl im
 * Test geändert, nicht die Frage geprüft. Die Frage ist: NENNT das Profil einen
 * Provider, den es selbst definiert, und ein Modell, das dieser Provider im
 * Katalog führt? Das ist die Zusage; welches Modell gewählt ist, entscheidet das
 * Profil (Agnes ist die empfohlene kostenlose Route der Doku, kein Code-Zwang).
 *
 * KEIN `js-yaml` HIER: `scripts/mobile-profile-contract-test.mjs` läuft in CI
 * direkt auf Node, ohne `npm ci` und ohne `dsh` im PATH. Ein Extraktor für die
 * flache Patch-Form (Liste von Einträgen, `providers`, `models`, `config`) ist
 * dafür ausreichend; der Gate-Test vergleicht ihn mit dem ECHTEN Parser, damit
 * die Vereinfachung nicht still falsch wird.
 */

/** Die Felder, die eine Route tragen muss, damit sie überhaupt eine ist. */
export const ROUTE_FIELDS = Object.freeze(['provider', 'model']);

/** Die Fehlercodes — benannt, damit eine Meldung nicht als Prosa endet. */
export const ROUTE_ISSUES = Object.freeze([
  'ROUTE_PROVIDER_EMPTY',
  'ROUTE_PROVIDER_UNKNOWN',
  'ROUTE_MODEL_EMPTY',
  'ROUTE_MODEL_NOT_IN_CATALOG',
  'ROUTE_KEY_ENV_EMPTY',
  'ROUTE_MISSING',
]);

/** Ein YAML-Skalar ohne Quotes und ohne Kommentar. */
function scalar(raw) {
  const withoutComment = raw.replace(/\s+#.*$/, '').trim();
  const quoted = /^(['"])(.*)\1$/.exec(withoutComment);
  return (quoted === null ? withoutComment : quoted[2]).trim();
}

/**
 * Die Modellroute aus einem Profil-Patch lesen.
 *
 * Gelesen werden genau die zwei Einträge, die eine Route tragen können:
 * `llm-pi-ai` (Provider-Katalog) und `agent-default-model` (die Wahl). Alles
 * andere wird ignoriert — dieser Leser ist absichtlich kein YAML-Parser.
 *
 * @returns {{providers: object, route: {provider: string, model: string}, entry: string}}
 */
export function readModelRoutes(text) {
  const providers = {};
  const route = { provider: '', model: '' };
  let entry = '';
  let inConfig = false;
  let inProviders = false;
  let providersIndent = -1;
  let provider = '';
  let inModels = false;

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();

    // Ein Top-Level-Eintag beendet den vorigen. `- id:` benennt den Eintrag;
    // JEDE andere Top-Level-Liste (z.B. `- insert:`) beendet ihn NACH WEISE
    // ohne Namen — sonst wuerde der Inhalt eines Inserts (etwa die
    // `provider:`-Zeile einer Preset-Komposition) dem VORHERIGEN Eintrag
    // zugeschlagen und die Route faelschlich daraus gelesen. Der echte
    // Parser (js-yaml) kennt diese Grenze auch.
    if (indent === 0 && line.startsWith('- ')) {
      entry = line.startsWith('- id:') ? scalar(line.slice('- id:'.length)) : '';
      inConfig = false;
      inProviders = false;
      providersIndent = -1;
      provider = '';
      inModels = false;
      continue;
    }
    if (line === 'config:') {
      inConfig = true;
      continue;
    }
    if (!inConfig) continue;

    if (line === 'providers:') {
      inProviders = true;
      providersIndent = indent;
      provider = '';
      inModels = false;
      continue;
    }
    if (inProviders) {
      if (indent <= providersIndent) {
        inProviders = false;
      } else if (line === 'models:') {
        if (provider !== '') providers[provider].models = providers[provider].models ?? [];
        inModels = provider !== '';
        continue;
      } else if (line.startsWith('- id:')) {
        const id = scalar(line.slice('- id:'.length));
        if (inModels && provider !== '' && id !== '') providers[provider].models.push(id);
        continue;
      } else if (!line.startsWith('-') && line.endsWith(':')) {
        const name = scalar(line.slice(0, -1));
        if (name !== '' && name !== 'models') {
          provider = name;
          providers[provider] = providers[provider] ?? { models: [], apiKeyEnv: '' };
          inModels = false;
        }
        continue;
      }
    }
    if (line.startsWith('apiKeyEnv:') && provider !== '') {
      providers[provider].apiKeyEnv = scalar(line.slice('apiKeyEnv:'.length));
      continue;
    }
    if (entry === 'agent-default-model' && line.startsWith('provider:')) {
      route.provider = scalar(line.slice('provider:'.length));
      continue;
    }
    if (entry === 'agent-default-model' && line.startsWith('model:')) {
      route.model = scalar(line.slice('model:'.length));
    }
  }
  return { providers, route, entry };
}

/**
 * Die Route gegen den eigenen Katalog prüfen.
 *
 * Geprüft wird die FORM, nicht ein Name: der Provider muss im selben Patch
 * definiert sein, das Modell in seinem Katalog stehen, und der Schlüssel darf
 * nicht als Wert dastehen (nur der NAME der Umgebungsvariable).
 *
 * @returns {string[]} Befunde; leer heißt gültig.
 */
export function routeIssues(routes) {
  const issues = [];
  const providers = routes?.providers ?? {};
  const route = routes?.route ?? {};
  const provider = typeof route.provider === 'string' ? route.provider.trim() : '';
  const model = typeof route.model === 'string' ? route.model.trim() : '';

  if (provider === '') issues.push('ROUTE_PROVIDER_EMPTY');
  else if (providers[provider] === undefined) issues.push(`ROUTE_PROVIDER_UNKNOWN:${provider}`);
  if (model === '') issues.push('ROUTE_MODEL_EMPTY');
  else if (providers[provider] !== undefined && !providers[provider].models.includes(model)) {
    issues.push(`ROUTE_MODEL_NOT_IN_CATALOG:${provider}/${model}`);
  }
  if (providers[provider] !== undefined && providers[provider].apiKeyEnv.trim() === '') {
    issues.push(`ROUTE_KEY_ENV_EMPTY:${provider}`);
  }
  if (issues.includes('ROUTE_PROVIDER_EMPTY') && issues.includes('ROUTE_MODEL_EMPTY')) issues.push('ROUTE_MISSING');
  return issues;
}

/** Bequem für Skripte: Text lesen und prüfen. */
export function modelRouteIssues(text) {
  return routeIssues(readModelRoutes(text));
}

/**
 * Die GEWÄHLTE Route samt dem Umgebungsnamen, den sie liest.
 *
 * Der Name ist keine Konstante neben der Route: `agent-default-model` ist ein
 * live-Feld (die UI schreibt es über den `config-editor` in die Profil-Ebene),
 * also liest `agnes` `AGNES_API_KEY` und `prompter` `PROMPTER_API_KEY`. Ein
 * Preflight mit festem `AGNES_API_KEY` meldete den Schlüssel „bereit", obwohl
 * die gewählte Route einen anderen liest — die falsche Antwort auf die Frage,
 * ob ein Start möglich ist.
 *
 * `keyName` ist leer, wenn der Provider unbekannt ist oder `apiKeyEnv` fehlt;
 * der Aufrufer entscheidet dann (Preflight: rot), statt einen Namen zu raten.
 *
 * @returns {{ provider: string, model: string, apiKeyEnv: string, keyName: string }}
 */
export function chosenRoute(text) {
  const { providers, route } = readModelRoutes(text);
  const provider = typeof route?.provider === 'string' ? route.provider.trim() : '';
  const model = typeof route?.model === 'string' ? route.model.trim() : '';
  const apiKeyEnv = provider === '' ? '' : String(providers?.[provider]?.apiKeyEnv ?? '').trim();
  return { provider, model, apiKeyEnv, keyName: apiKeyEnv };
}
