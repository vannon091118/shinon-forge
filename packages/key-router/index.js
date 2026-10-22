/**
 * @shinon/key-router — Multi-API-Key-Pool mit 429-Rotation (Host-Hälfte).
 *
 * ARCHITEKTUR
 *   Startumgebung ──▶ Pool (je Anbieter) ──▶ Auswahl ──┬─▶ Werkzeuge
 *       (alle 3 Schichten)                             │
 *                                                      ├─▶ Verbindungstest (Kopfzeilen)
 *                                                      └─▶ OVERRIDE: `credentials.resolve(ref)`
 *                                                          bedient die verwalteten Referenzen
 *                                                          aus dem Pool
 *
 * Beim 429 wird ein Platz gedeckelt (`initialDelayMs` → `maxDelayMs`,
 * exponentiell); ein erfolgreicher Lauf baut die Schuld wieder ab. Die Rechnung
 * steht in `assets/pool-core.js` — importfrei und damit in CI testbar; `index.js`
 * ist die Naht zum Lauf (Umgebung, Werkzeuge, Override, Log).
 *
 * DER SICHERHEITSVERTRAG (drei Zusagen, jede an einer Stelle prüfbar):
 *
 *   1. DAS SCHEMA TRÄGT KEIN SCHLÜSSELFELD. Eine Profildatei ist versioniert;
 *      ein Schlüssel darin wäre ein Leck mit Ansage. Die Namen kommen aus der
 *      Umgebung (`envNames`, `envPrefix`) — nur die NAMEN stehen in der Config.
 *   2. NACH AUSSEN GEHT NUR DIE BESCHRIFTUNG DES PLATZES (`key#1`, `key#2`),
 *      niemals ein Präfix des Schlüssels. Der Grund ist gemessen: was ein
 *      Werkzeug zurückgibt, landet im Kontext des Modells und in der
 *      Sitzungstranskription. Ein „Präfix zur Wiedererkennung" ist dort ein
 *      Leck, kein Komfort — Schlüsselmaterial ist ganz oder gar nicht geheim.
 *      (Der Zustand VOR dieser Änderung gab `key.slice(0, 8) + '…'` aus drei
 *      Werkzeugen und in jede Log-Zeile.)
 *   3. JEDER LOG-EINTRAG GEHT DURCH `redact(...)`. Ein Fehlerobjekt kann den
 *      Eingabewert tragen; die Umgebungsvariable kann in einer Meldung stehen.
 *      Damit ist die Zusage eine Funktion und keine Absicht.
 *
 * DER OVERRIDE (PLAN.md §3.12): DSH einen rotierenden Schlüssel geben.
 *
 * Gemessen am installierten Harness, nicht geraten: die Route löst ihren Schlüssel
 * pro Aufruf über `ctx.get("credentials").resolve(ref)` auf (fehlt der Dienst, gilt
 * die Startumgebung), und eine fehlgeschlagene Anfrage läuft als Middleware über
 * `agent/request-error` (Nutzdaten: provider, failure mit stabilem `code`). Darauf
 * steht die Klammer: sie bedient genau die Referenzen, die das Profil als
 * `envNames` nennt, aus dem Pool — alles andere erreicht das Original unverändert
 * (`createResolveOverlay` in pool-core.js, drei Zusagen). Die 429-Beobachtung ruft
 * nur `next()` weiter und trifft keine Wiederholungs-Entscheidung — das gehört
 * `llm-retry`. Was dabei NICHT gemessen ist: eine echte 429-Rotation gegen die
 * laufende Route (dafür bräuchte es zwei echte Schlüssel und einen erzwungenen
 * 429 in dieser Umgebung). Benannt in docs/ZAHLEN.md §4, nicht behauptet.
 */

import z from '@deepseek-ai/schemastery';

import {
  authHeaders,
  buildEntries,
  buildProbeRequest,
  createResolveOverlay,
  fetchCatalog,
  keysFromEnv,
  markFailed,
  nextEntry,
  observeRequestError,
  probeResult,
  redact,
  resetSuccess,
  statusOf,
  valuesFromLayers,
} from './assets/pool-core.js';

/** Das Protokoll des Anbieters — zwei Spielarten, mehr gibt es nicht. */
export const PROTOCOLS = ['openai-compatible', 'anthropic'];

export const Config = z.object({
  providers: z.array(z.object({
    id: z.string(),
    /** Leer heisst: kein Verbindungstest möglich (fail-closed mit Meldung). */
    baseUrl: z.string().default(''),
    protocol: z.union([z.const('openai-compatible'), z.const('anthropic')]).default('openai-compatible'),
    /** Die Modelle, die dieser Anbieter führen soll — leer heisst „frag ihn selbst". */
    models: z.array(z.string()).default([]),
    /** Pfad der Modellliste (Verbindungstest). */
    probePath: z.string().default('/models'),
    /** Ausdrückliche Umgebungsnamen, in dieser Reihenfolge. */
    envNames: z.array(z.string()).default([]),
    /** Sammelt zusätzlich `<prefix>` und `<prefix>_*` (Standard: DEEPSEEK_API_KEY). */
    envPrefix: z.string().default(''),
    initialDelayMs: z.number().min(500).max(60000).default(2000),
    maxDelayMs: z.number().min(5000).max(300000).default(60000),
    maxRetries: z.number().min(1).max(20).default(5),
  })).default([{
    id: 'deepseek-official',
    baseUrl: '',
    protocol: 'openai-compatible',
    models: [],
    probePath: '/models',
    envNames: [],
    envPrefix: 'DEEPSEEK_API_KEY',
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    maxRetries: 5,
  }]),
  /**
   * Quellen des LIVE-Katalogs, unabhaengig von den Schluessel-Pools.
   *
   * WARUM EIGENES FELD: ein Pool ist eine Aussage ueber Schluessel, ein Katalog
   * eine ueber Modelle. OpenRouter fuehrt seine Liste oeffentlich — sie braucht
   * keinen Pool, und ein Provider ohne Schluessel soll trotzdem wissen, welche
   * Modelle es gibt. Die profileigene `providers`-Liste bleibt unberuehrt.
   */
  catalogProviders: z.array(z.object({
    id: z.string(),
    baseUrl: z.string().default(''),
    probePath: z.string().default('/models'),
  })).default([
    { id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', probePath: '/models' },
  ]),
});

// ── Der Zustand: ein Pool je Anbieter, im Prozess ─────────────────────────────

/** @type {Map<string, Array<{key: string, label: string, failCount: number, lastFailAt: number, cooldownUntil: number}>>} */
const keyPools = new Map();
/** @type {Map<string, string>} Der zuletzt benutzte Platz je Anbieter (Ausweis, kein Schlüssel). */
const activeLabels = new Map();
/**
 * Der zuletzt gelesene Modellkatalog je Anbieter — `fetch` oder `fehler`.
 *
 * Er ist die ANTWORT des Anbieters, nicht die Liste aus dem Profil: die
 * statische Liste bleibt als `declared` daneben stehen, damit der Unterschied
 * sichtbar ist statt geglaettet. Kein Schluessel, keine Kopfzeilen.
 * @type {Map<string, {ok: boolean, at: number, status?: number, models?: string[], error?: string}>}
 */
const catalogState = new Map();

/** Uhr und Zufall als Argumente — die Rechnung bleibt nachrechenbar (siehe pool-core.js). */
const now = () => Date.now();

/** Alle Schlüsselwerte dieses Prozesses — die Liste, die `redact` bekommt. */
function allSecrets() {
  const secrets = [];
  for (const pool of keyPools.values()) for (const entry of pool) secrets.push(entry.key);
  return secrets;
}

/** Eine Zeile ins Log — immer durch den Filter. */
function say(text) {
  console.log(redact(text, allSecrets()));
}

function warn(text) {
  console.warn(redact(text, allSecrets()));
}

/** Den Anbieter-Eintrag der Config suchen (die Werkzeuge kennen nur die id). */
function providerOf(config, providerId) {
  return config.providers.find((provider) => provider.id === providerId) ?? null;
}

/**
 * Die Quellen des Katalogs: Pools zuerst, dann die reinen Katalog-Provider.
 * Doppelte IDs zaehlen einmal — wer einen Pool hat, wird mit seinem Schluessel
 * gefragt; die oeffentliche Liste bleibt fuer alle anderen.
 */
function catalogSources(config) {
  const seen = new Set();
  const sources = [];
  for (const provider of [...config.providers, ...(config.catalogProviders ?? [])]) {
    if (provider === null || typeof provider !== 'object' || seen.has(provider.id)) continue;
    seen.add(provider.id);
    sources.push(provider);
  }
  return sources;
}

/**
 * Einen Pool aus der STARTUMGEBUNG bauen — nicht aus `process.env` allein.
 *
 * Der gemessene Grund: `.env` liegt nicht im Prozess, sondern in den Schichten
 * der Startumgebung (`ctx.get('launchEnvironment')`: Prozess, Projekt-`.env`,
 * Benutzer-`.env`). Wer nur `process.env` liest, findet den Schlüssel aus der
 * Datei nicht — genau so stand der Pool im echten Boot leer. Die ausdrücklichen
 * Namen kommen aus allen Schichten (fehlt die Naht, gilt `process.env`); der
 * Präfix-Scan kann nur den Prozess aufzählen (die Momentaufnahme zählt nicht auf)
 * und bleibt dort.
 *
 * Leer ist ein Befund, kein Fehler.
 */
function loadPool(providerConfig, ctx) {
  // Die Naht: `launchEnvironment` traegt drei Schichten (Prozess, Projekt-`.env`,
  // Benutzer-`.env`). Der Dienst wird auf dem ROOT-Kontext bereitgestellt
  // (`hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, …)`), und ein Plugin sieht ihn
  // ueber `ctx.get` — aber nur, wenn dieser Aufruf im selben Kontext passiert.
  // Fehlt er (undefined ODER null), gilt die unterste Schicht: `process.env`.
  // Das ist keine Bequemlichkeit, sondern dieselbe Regel, die `llm-pi-ai`
  // anwendet (`launchEnvironmentOf` = `ctx.get(…) ?? snapshot(process.env)`).
  // Vorher stand hier `launch === undefined`, und `null` lief in den
  // `valuesFromLayers`-Zweig, der ohne Naht nichts liefert — der Pool blieb
  // leer, obwohl der Schluessel auf der Platte lag.
  const launch = typeof ctx?.get === 'function' ? ctx.get('launchEnvironment') : undefined;
  const naht = launch === undefined || launch === null
    ? { get: (name) => (typeof process.env[name] === 'string' ? { value: process.env[name], source: 'process' } : undefined) }
    : launch;
  const named = Object.values(valuesFromLayers(naht, providerConfig.envNames));
  const scanned = keysFromEnv(process.env, { names: [], prefix: providerConfig.envPrefix });
  const entries = buildEntries([...named, ...scanned]);
  if (entries.length > 0) keyPools.set(providerConfig.id, entries);
  return entries.length;
}

// ── Werkzeuge ─────────────────────────────────────────────────────────────────

const rotateTool = {
  name: 'key_router_rotate',
  description: 'Rotiert den aktiven API-Schlüssel eines Anbieters (nützlich bei anhaltenden 429). Gibt den Poolplatz zurück, nie einen Schlüssel.',
  parameters: z.object({
    providerId: z.string(),
    force: z.boolean().default(true),
  }),
  execute(params) {
    const pool = keyPools.get(params.providerId);
    if (!pool || pool.length === 0) return { ok: false, error: `Kein Pool für Anbieter ${params.providerId}` };
    const entry = nextEntry(pool, now(), params.force, activeLabels.get(params.providerId) ?? null);
    if (entry === null) return { ok: false, error: `Kein Platz für Anbieter ${params.providerId}` };
    activeLabels.set(params.providerId, entry.label);
    return { ok: true, providerId: params.providerId, active: entry.label, pool: statusOf(pool, now(), entry.label) };
  },
};

const statusTool = {
  name: 'key_router_status',
  description: 'Zeigt alle Key-Pools: Anzahl, Plätze, Fehlschläge und Cooldowns. Enthält keine Schlüssel.',
  parameters: z.object({}),
  execute() {
    const pools = {};
    for (const [id, pool] of keyPools) pools[id] = statusOf(pool, now(), activeLabels.get(id) ?? null);
    // Der Katalog kommt aus dem ABRUF, die Zahl daneben aus dem Profil. Ist der
    // Abruf noch offen, steht das da — nicht die statische Liste als Live-Wert.
    const catalog = {};
    for (const provider of catalogSources(probeTool.config)) {
      const entry = catalogState.get(provider.id);
      const declared = providerOf(probeTool.config, provider.id)?.models.length ?? 0;
      catalog[provider.id] = entry === undefined
        ? { live: null, declared, source: 'offen' }
        : { live: entry.ok === true ? entry.models.length : null,
            declared,
            source: entry.ok === true ? 'fetch' : 'fehler',
            at: entry.at,
            ...entry.ok === true ? {} : { error: entry.error } };
    }
    return { ok: true, pools, catalog };
  },
};

const catalogTool = {
  name: 'key_router_catalog',
  description: 'Fragt die Modellkataloge der konfigurierten Anbieter jetzt live ab. Gibt Modelle und Fehler zurück, nie Schlüssel.',
  parameters: z.object({}),
  async execute() {
    const config = probeTool.config;
    const catalog = await fetchCatalog(catalogSources(config), {
      keyOf: (id) => keyPools.get(id)?.[0]?.key ?? '',
      secrets: allSecrets(),
    });
    for (const [id, entry] of Object.entries(catalog)) catalogState.set(id, entry);
    return { ok: Object.values(catalog).every((entry) => entry.ok === true), catalog };
  },
};

const probeTool = {
  name: 'key_router_probe',
  description: 'Verbindungstest eines Anbieters: fragt seine Modellliste ab. Meldet Status und Modelle, nie den Schlüssel.',
  parameters: z.object({
    providerId: z.string(),
    model: z.string().default(''),
  }),
  async execute(params) {
    const provider = providerOf(probeTool.config, params.providerId);
    if (provider === null) return { ok: false, error: `Unbekannter Anbieter ${params.providerId}` };
    if (provider.baseUrl === '') return { ok: false, error: `Anbieter ${params.providerId} hat keine baseUrl — kein Verbindungstest möglich` };
    const pool = keyPools.get(params.providerId);
    if (!pool || pool.length === 0) return { ok: false, error: `Kein Pool für Anbieter ${params.providerId}` };
    const entry = nextEntry(pool, now(), false, activeLabels.get(params.providerId) ?? null);
    if (typeof globalThis.fetch !== 'function') return { ok: false, error: 'fetch fehlt — Verbindungstest nicht möglich' };
    const request = buildProbeRequest(provider, entry.key, '/models');
    try {
      const response = await globalThis.fetch(request.url, { method: request.method, headers: request.headers });
      const result = await probeResult(response, allSecrets());
      if (result.ok !== true) {
        markFailed(entry, now(), provider.initialDelayMs, provider.maxDelayMs);
        return { ok: false, providerId: params.providerId, status: result.status, detail: result.detail, active: entry.label };
      }
      resetSuccess(entry);
      return {
        ok: true,
        providerId: params.providerId,
        active: entry.label,
        status: result.status,
        models: result.models,
        declared: provider.models,
      };
    } catch (error) {
      markFailed(entry, now(), provider.initialDelayMs, provider.maxDelayMs);
      // Ein Fehler kann die Anfrage tragen — durch den Filter, wie alles andere.
      return { ok: false, providerId: params.providerId, detail: redact(error?.message ?? 'Netzfehler', allSecrets()) };
    }
  },
};

/** Der Anbieter-Block, den `probeTool` liest — erst in `apply()` gesetzt. */
probeTool.config = { providers: [] };

// ── Anwendung ─────────────────────────────────────────────────────────────────

/**
 * Den gerade bedienten Platz je Anbieter wählen UND als aktiv vermerken — die
 * Marke, an der ein späterer 429 den richtigen Platz trifft. Lesen ohne
 * Vermerk wäre ein Zeiger, der nirgendwohin zeigt.
 */
function serveEntry(providerId) {
  const pool = keyPools.get(providerId);
  if (!pool) return null;
  const entry = nextEntry(pool, now(), false, activeLabels.get(providerId) ?? null);
  if (entry !== null) activeLabels.set(providerId, entry.label);
  return entry;
}

export function apply(ctx, config) {
  probeTool.config = config;
  keyPools.clear();
  activeLabels.clear();
  catalogState.clear();

  let keys = 0;
  for (const providerConfig of config.providers) keys += loadPool(providerConfig, ctx);

  const withoutPool = config.providers.filter((provider) => !keyPools.has(provider.id)).map((provider) => provider.id);
  say(`[shinon-key-router] Aktiviert — ${keyPools.size} Anbieter, ${keys} Plätze`);
  if (withoutPool.length > 0) {
    // Fail-closed mit Meldung: kein Platz heisst kein Schlüssel, und der Grund
    // steht im Log — nicht stumm (die alte Fassung loggte die Zeile nur, wenn
    // überhaupt ein Pool entstand).
    warn(`[shinon-key-router] ohne Schlüssel (Umgebung leer): ${withoutPool.join(', ')}`);
  }

  // Werkzeug-Registrierung über `inject`: ein direkter Dienst-Zugriff wirft am
  // Cordis-Proxy ohne Deklaration — genau der Fehler, der die Client-Hälften
  // schon einmal die Aktivierung gekostet hat.
  ctx.inject(['tools'], (child) => {
    child.tools.register(rotateTool);
    child.tools.register(statusTool);
    child.tools.register(catalogTool);
    child.tools.register(probeTool);
  });

  // Der OVERRIDE: die Route fragt ihren Schlüssel pro Aufruf über
  // `credentials.resolve(ref)` — die Klammer bedient die Referenzen, die das
  // Profil als `envNames` nennt, aus dem Pool. Fehlt der Dienst, gibt es nichts
  // zu klammern: die Route löst dann selbst über die Startumgebung auf, und der
  // Router bleibt bei seinen Werkzeugen (fail-closed mit Meldung, nicht stumm).
  const refToProvider = new Map();
  for (const providerConfig of config.providers) {
    if (!keyPools.has(providerConfig.id)) continue;
    for (const name of providerConfig.envNames) refToProvider.set(name, providerConfig.id);
  }
  let overlay = null;
  if (refToProvider.size > 0) {
    const credentials = typeof ctx?.get === 'function' ? ctx.get('credentials') : undefined;
    if (credentials === undefined) {
      warn('[shinon-key-router] ohne credentials-Dienst — kein Override, nur Werkzeuge');
    } else {
      overlay = createResolveOverlay(credentials, {
        managed: [...refToProvider.keys()],
        select: (name) => serveEntry(refToProvider.get(name)),
      });
      if (overlay === null) {
        warn('[shinon-key-router] credentials ohne resolve — kein Override, nur Werkzeuge');
      } else {
        say(`[shinon-key-router] Override aktiv — ${overlay.names.join(', ')}`);
      }
    }
  }

  // Die 429-Beobachtung: NUR beobachten, dann `next()` weitergeben. Die
  // Wiederholungs-Entscheidung gehört `llm-retry`; wer hier eingriffe, baute eine
  // zweite Wiederholungs-Logik über denselben Fehler. Gezählt wird nur die
  // stabile Klasse `RATE_LIMIT` für einen verwalteten Anbieter — und gedeckelt
  // wird der Platz, der gerade bedient wurde (die Marke aus `serveEntry`).
  let stopErrors = () => {};
  if (overlay !== null && typeof ctx?.on === 'function') {
    stopErrors = ctx.on('agent/request-error', (payload, next) => {
      const seen = observeRequestError(payload);
      if (seen !== null && keyPools.has(seen.provider)) {
        const label = activeLabels.get(seen.provider);
        const entry = keyPools.get(seen.provider).find((candidate) => candidate.label === label) ?? null;
        const providerConfig = providerOf(config, seen.provider);
        if (entry !== null && providerConfig !== null) {
          markFailed(entry, now(), providerConfig.initialDelayMs, providerConfig.maxDelayMs);
          say(`[shinon-key-router] 429 bei ${seen.provider} — ${entry.label} gedeckelt`);
        }
      }
      return typeof next === 'function' ? next() : undefined;
    });
  }

  return () => {
    if (typeof stopErrors === 'function') stopErrors();
    overlay?.restore();
    const count = keyPools.size;
    keyPools.clear();
    activeLabels.clear();
    say(`[shinon-key-router] Deaktiviert — Override zurückgebaut, ${count} Pools geleert`);
  };
}

export { authHeaders };
