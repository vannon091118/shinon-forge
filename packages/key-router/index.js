/**
 * @shinon/key-router — Multi-API-Key-Pool mit 429-Rotation (Host-Hälfte).
 *
 * ARCHITEKTUR
 *   Umgebung ──▶ Pool (je Anbieter) ──▶ Auswahl ──▶ Werkzeuge
 *                                            │
 *                                            └─▶ Verbindungstest (Kopfzeilen)
 *
 * Beim 429 wird ein Platz gedeckelt (`initialDelayMs` → `maxDelayMs`,
 * exponentiell); ein erfolgreicher Lauf baut die Schuld wieder ab. Die Rechnung
 * steht in `assets/pool-core.js` — importfrei und damit in CI testbar; `index.js`
 * ist die Naht zum Lauf (Umgebung, Werkzeuge, Log).
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
 * WAS DIESES PAKET NICHT TUT (offen, nicht behauptet): es setzt KEINE LLM-Route
 * um. Der Provider-Override (DSH einen rotierenden Schlüssel zu geben) fehlt; die
 * 429-Ereignisse des Laufes abonnierte die alte Fassung über zwei Ereignisnamen
 * (`llm/error`, `llm/response`), für die es im Baum keinen Emitter gibt — ein
 * Zuhörer ohne Sender ist eine Behauptung. Entfernt, benannt, nachzuholen: siehe
 * PLAN.md.
 */

import z from '@deepseek-ai/schemastery';

import {
  authHeaders,
  buildEntries,
  buildProbeRequest,
  keysFromEnv,
  markFailed,
  nextEntry,
  probeResult,
  redact,
  resetSuccess,
  statusOf,
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
});

// ── Der Zustand: ein Pool je Anbieter, im Prozess ─────────────────────────────

/** @type {Map<string, Array<{key: string, label: string, failCount: number, lastFailAt: number, cooldownUntil: number}>>} */
const keyPools = new Map();
/** @type {Map<string, string>} Der zuletzt benutzte Platz je Anbieter (Ausweis, kein Schlüssel). */
const activeLabels = new Map();

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

/** Einen Pool aus der Umgebung bauen. Leer ist ein Befund, kein Fehler. */
function loadPool(providerConfig, env) {
  const entries = buildEntries(keysFromEnv(env, {
    names: providerConfig.envNames,
    prefix: providerConfig.envPrefix,
  }));
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
    return { ok: true, pools };
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

export function apply(ctx, config) {
  probeTool.config = config;
  keyPools.clear();
  activeLabels.clear();

  let keys = 0;
  for (const providerConfig of config.providers) keys += loadPool(providerConfig, process.env);

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
    child.tools.register(probeTool);
  });

  return () => {
    const count = keyPools.size;
    keyPools.clear();
    activeLabels.clear();
    say(`[shinon-key-router] Deaktiviert — ${count} Pools geleert`);
  };
}

export { authHeaders };
