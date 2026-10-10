/**
 * @shinon/key-router — Multi-API-Key Pool mit 429-Rotation
 *
 * Architektur:
 *   Pool von API-Keys → Router Service → LLM Provider Override
 *   Bei 429: Key wird cooldown-basiert markiert, nächster Key wird probiert
 *   Eskalation: initialDelayMs → maxDelayMs mit exponentiellem Backoff
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let z;
try {
  z = require('@deepseek-ai/schemastery');
} catch {
  // Fallback: minimal schema API für Test-/Offline-Betrieb
  const makePrimitive = (type) => {
    const fn = () => {
      const schema = { type };
      schema.min = () => schema;
      schema.max = () => schema;
      schema.default = (d) => ({ ...schema, default: d });
      return schema;
    };
    return fn;
  };
  z = {
    object: (shape) => {
      const schema = { shape };
      schema.default = (d) => ({ ...schema, default: d });
      return schema;
    },
    string: makePrimitive('string'),
    number: makePrimitive('number'),
    boolean: makePrimitive('boolean'),
    array: (item) => {
      const schema = { type: 'array', item };
      schema.min = () => schema;
      schema.max = () => schema;
      schema.default = (d) => ({ ...schema, default: d });
      return schema;
    },
    union: () => ({}),
    const: () => ({}),
  };
}

// ── Config Schema ─────────────────────────────────────────────────────────────

export const Config = z.object({
  providers: z.array(z.object({
    id: z.string(),
    pool: z.array(z.string()).default([]),
    initialDelayMs: z.number().min(500).max(60000).default(2000),
    maxDelayMs: z.number().min(5000).max(300000).default(60000),
    maxRetries: z.number().min(1).max(20).default(5),
  })).default([{
    id: 'deepseek-official',
    pool: [],
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    maxRetries: 5,
  }]),
  defaultKey: z.string().default(''),
});

// ── Key Pool State ────────────────────────────────────────────────────────────

/**
 * @typedef {object} KeyEntry
 * @property {string} key - Der eigentliche API-Key
 * @property {number} failCount - Anzahl der 429-Fails
 * @property {number} lastFailAt - Timestamp des letzten Fails
 * @property {number} cooldownUntil - Zeitpunkt ab dem Key wieder verwendbar
 */

/** @type {Map<string, KeyEntry[]>} */
const keyPools = new Map();

/**
 * Lade Keys aus Config + Environment.
 */
function buildPool(providerConfig, defaultKey) {
  const pool = [...providerConfig.pool];

  // Default-Key aus Env hinzufügen wenn vorhanden
  if (defaultKey && defaultKey.length > 0 && !pool.includes(defaultKey)) {
    pool.push(defaultKey);
  }

  // Environment-Variable DEEPSEEK_API_KEY als Fallback
  const envKey = process.env.DEEPSEEK_API_KEY;
  if (envKey && envKey.length > 0 && !pool.includes(envKey)) {
    pool.push(envKey);
  }

  // Evtl. weitere DEEPSEEK_API_KEY_* Variablen
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('DEEPSEEK_API_KEY_') && value && !pool.includes(value)) {
      pool.push(value);
    }
  }

  // Duplikate entfernen und KeyEntries bauen
  const entries = [...new Set(pool)].map((key) => ({
    key,
    failCount: 0,
    lastFailAt: 0,
    cooldownUntil: 0,
  }));

  return entries;
}

/**
 * Berechne Backoff-Delay für einen Key basierend auf Fail-Count.
 */
function calcBackoff(failCount, initialDelayMs, maxDelayMs) {
  const exponential = Math.min(initialDelayMs * Math.pow(2, failCount), maxDelayMs);
  // Jitter hinzufügen (bis zu ±25%)
  const jitter = exponential * 0.5 * (Math.random() - 0.5);
  return Math.max(100, Math.min(maxDelayMs, exponential + jitter));
}

/**
 * Markiere Key als 429-failing.
 */
function markKeyFailed(providerId, key, initialDelayMs, maxDelayMs) {
  const pool = keyPools.get(providerId);
  if (!pool) return null;

  const entry = pool.find((e) => e.key === key);
  if (!entry) return null;

  entry.failCount += 1;
  entry.lastFailAt = Date.now();

  const delay = calcBackoff(entry.failCount - 1, initialDelayMs, maxDelayMs);
  entry.cooldownUntil = Date.now() + delay;

  return { ...entry, delay };
}

/**
 * Hole nächsten verfügbaren Key aus dem Pool.
 */
function getNextKey(providerId, forceRotate = false) {
  const pool = keyPools.get(providerId);
  if (!pool || pool.length === 0) return null;

  const now = Date.now();

  if (forceRotate) {
    // Force-Rotate: nimm den ersten verfügbaren oder den mit niedrigstem Fail-Count
    const available = pool.filter((e) => e.cooldownUntil <= now);
    if (available.length === 0) {
      // Alle im Cooldown — nimm den mit dem frühesten cooldownUntil
      return pool.reduce((a, b) => a.cooldownUntil < b.cooldownUntil ? a : b);
    }
    return available.reduce((a, b) => a.failCount <= b.failCount ? a : b);
  }

  // Normal: nimm Key mit niedrigstem Fail-Count der verfügbar ist
  const available = pool.filter((e) => e.cooldownUntil <= now);
  if (available.length === 0) {
    // Alle im Cooldown — warte auf den frühesten
    return pool.reduce((a, b) => a.cooldownUntil < b.cooldownUntil ? a : b);
  }
  return available.reduce((a, b) => a.failCount <= b.failCount ? a : b);
}

/**
 * Prüfe ob alle Keys im Cooldown sind.
 */
function allKeysCoolingDown(providerId) {
  const pool = keyPools.get(providerId);
  if (!pool || pool.length === 0) return true;
  return pool.every((e) => e.cooldownUntil > Date.now());
}

/**
 * Reset failCount für einen Key (nach erfolgreichem Request).
 */
function resetKeySuccess(providerId, key) {
  const pool = keyPools.get(providerId);
  if (!pool) return;

  const entry = pool.find((e) => e.key === key);
  if (entry) {
    entry.failCount = Math.max(0, entry.failCount - 1);
    entry.cooldownUntil = 0;
  }
}

/**
 * Erhalte Pool-Status für UI.
 */
function getPoolStatus(providerId) {
  const pool = keyPools.get(providerId);
  if (!pool) return { total: 0, available: 0, cooling: 0, keys: [] };

  const now = Date.now();
  return {
    total: pool.length,
    available: pool.filter((e) => e.cooldownUntil <= now).length,
    cooling: pool.filter((e) => e.cooldownUntil > now).length,
    keys: pool.map((e) => ({
      key: e.key.slice(0, 8) + '…',
      failCount: e.failCount,
      cooldownUntil: e.cooldownUntil > now ? e.cooldownUntil - now : 0,
    })),
  };
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const rotateKeyTool = {
  name: 'key_router_rotate',
  description: 'Erzwinge Key-Rotation für einen Provider. Nützlich bei anhaltenden 429s.',
  parameters: z.object({
    providerId: z.string(),
    force: z.boolean().default(true),
  }),
  execute(params) {
    const key = getNextKey(params.providerId, params.force);
    if (!key) return { ok: false, error: `Kein Key für Provider ${params.providerId}` };
    return { ok: true, providerId: params.providerId, activeKey: key.key.slice(0, 8) + '…', poolStatus: getPoolStatus(params.providerId) };
  },
};

const poolStatusTool = {
  name: 'key_router_status',
  description: 'Zeige Status aller Key-Pools.',
  parameters: z.object({}),
  execute() {
    const statuses = {};
    for (const [id, pool] of keyPools) {
      statuses[id] = getPoolStatus(id);
    }
    return { ok: true, pools: statuses };
  },
};

const addKeyTool = {
  name: 'key_router_add',
  description: 'Füge einen API-Key zum Pool hinzu.',
  parameters: z.object({
    providerId: z.string(),
    key: z.string(),
  }),
  execute(params) {
    const providerConfig = Config.shape.providers?.default?.[0];
    if (!providerConfig) return { ok: false, error: 'Kein Provider konfiguriert' };

    const pool = keyPools.get(params.providerId) || [];
    if (pool.find((e) => e.key === params.key)) {
      return { ok: false, error: 'Key bereits im Pool' };
    }

    pool.push({ key: params.key, failCount: 0, lastFailAt: 0, cooldownUntil: 0 });
    keyPools.set(params.providerId, pool);

    return { ok: true, providerId: params.providerId, activeKey: params.key.slice(0, 8) + '…' };
  },
};

// ── Export ─────────────────────────────────────────────────────────────────────

export function apply(ctx, config) {
  // Pools aufbauen
  for (const providerConfig of config.providers) {
    const entries = buildPool(providerConfig, config.defaultKey);
    if (entries.length > 0) {
      keyPools.set(providerConfig.id, entries);
    }
  }

  console.log(`[shinon-key-router] Aktiviert — ${keyPools.size} Provider, ${[...keyPools.values()].reduce((s, p) => s + p.length, 0)} Keys`);

  // Tools registrieren
  ctx.tools.register(rotateKeyTool);
  ctx.tools.register(poolStatusTool);
  ctx.tools.register(addKeyTool);

  // LLM-Routing hook: Bei 429-Key-Rotation
  if (typeof ctx.on === 'function') {
    ctx.on('llm/error', (event) => {
      if (event?.error?.code === 'RATE_LIMIT' || event?.error?.status === 429) {
        const providerId = event?.providerId ?? 'deepseek-official';
        const currentKey = event?.apiKey?.slice(0, 8);
        const pool = keyPools.get(providerId);
        if (pool && pool.length > 1) {
          const entry = pool.find((e) => e.key === event?.apiKey);
          if (entry) {
            const result = markKeyFailed(providerId, entry.key,
              config.providers.find((p) => p.id === providerId)?.initialDelayMs ?? 2000,
              config.providers.find((p) => p.id === providerId)?.maxDelayMs ?? 60000
            );
            if (result) {
              console.log(`[shinon-key-router] 429 für Key ${entry.key.slice(0,8)}… → Cooldown ${result.delay}ms`);
            }
          }
        }
      }
    });

    ctx.on('llm/response', (event) => {
      if (event?.providerId && event?.apiKey) {
        resetKeySuccess(event.providerId, event.apiKey);
      }
    });
  }

  return () => {
    keyPools.clear();
    console.log('[shinon-key-router] Deaktiviert');
  };
}
