/**
 * @shinon/shinon-forge — Memory Sync, Global Runner, Engine Adapters
 *
 * Architektur:
 *   notion-agent sync script ──▶ ~/.agents/AGENTS.md ──▶ Agent Configs
 *                                        │
 *                                        ▼
 *                              Global Runner (Polling + Dispatch)
 *
 * Tools:
 *   - memory_sync: Trigger sync via notion-agent
 *   - runner_control: Start/Stop/Polling
 *   - engine_dispatch: Manueller Engine-Aufruf
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

// ── Schemastery (aus DSH, falls verfügbar) ────────────────────────────────────

let z;
try {
  z = require('@deepseek-ai/schemastery');
} catch {
  // Fallback: minimale Schema-API für Test-/Offline-Betrieb.
  // Sie spiegelt die GEMESSENE API der deklarierten Schemastery-Fassung
  // (`Docs/ZAHLEN.md` §1, 3.18.4): Metadaten heißen `description` (nicht
  // `describe`), Optionalität heißt `required(false)` (kein `optional`), und
  // `default(...)` ist der ABSCHLUSS der Kette — danach trägt das Ergebnis
  // keine Metadaten-Methoden mehr. Genau daran scheiterte das Laden des Pakets
  // im Distributionstest (`Docs/ZAHLEN.md` §2.1).
  // Ein Schema ist — wie in der echten Fassung — aufrufbar: die Kette liefert
  // ein Schema, der Aufruf den geparsten Wert (für Objekte mit Defaults).
  const chainable = (spec) => {
    const meta = spec.meta ?? {};
    const parse = (value) => {
      if (spec.shape === undefined) return value === undefined ? meta.default : value;
      const out = {};
      for (const [key, item] of Object.entries(spec.shape)) {
        const given = value?.[key];
        out[key] = given === undefined ? item?.meta?.default : given;
      }
      return out;
    };
    const self = (value) => parse(value);
    self.spec = spec;
    self.meta = meta;
    self.default = (d) => chainable({ ...spec, meta: { ...meta, default: d } });
    self.description = () => self;
    self.describe = () => self; // Alt-Alias, damit alte Ketten nicht still brechen
    self.required = () => self;
    self.optional = () => self;
    self.min = () => self;
    self.max = () => self;
    self.step = () => self;
    return self;
  };
  const makePrimitive = (type) => () => chainable({ type });
  z = {
    object: (shape) => chainable({ shape }),
    string: makePrimitive('string'),
    number: makePrimitive('number'),
    boolean: makePrimitive('boolean'),
    array: (item) => chainable({ type: 'array', item }),
    union: () => chainable({}),
    const: () => chainable({}),
    dict: () => chainable({}),
  };
}

// ── Config Schema ──────────────────────────────────────────────────────────────

export const Config = z.object({
  pollInterval: z.number().min(1).max(300).default(5),
  notionMcpServer: z.string().default('notion'),
  memoryPageId: z.string().default(''),
  maxEngineFails: z.number().min(1).max(10).default(3),
  heartbeatTimeout: z.number().min(10).max(300).default(60),
});

// ── Engine Adapters ────────────────────────────────────────────────────────────

/**
 * Engine-Konfiguration: Befehl, Argumente, Env.
 * Die tatsächliche Ausführung läuft über subprocess Service.
 */
const REASONING_LOG = [];

function logReasoning(step, detail) {
  REASONING_LOG.push({ step, detail, timestamp: new Date().toISOString() });
  if (REASONING_LOG.length > 200) REASONING_LOG.shift();
  console.log(`[shion-reasoning] ${step}: ${detail}`);
}

const ENGINE_REGISTRY = /** @type {const} */ {
  claude: { cmd: 'claude', args: ['-p'], env: { USE_ANALYTICS: '0' } },
  codex: { cmd: 'codex', args: ['exec'] },
  agy: { cmd: 'agy', args: ['-p'] },
  muse: { cmd: 'muse', args: ['exec'] },
  hermes: { cmd: 'hermes', args: ['-z'] },
  pi: { cmd: 'pi' },
  cline: { cmd: 'cline', args: ['--json'] },
  grok: { cmd: 'grok' },
  freebuff: { cmd: 'freebuff-app' },
};

// ── Runner State ───────────────────────────────────────────────────────────────

/** @type {{ running: boolean, interval: ReturnType<typeof setInterval> | null, sessionStates: Map<string, { lastRun?: number, fails: number }>, locks: Set<string> }} */
const runnerState = {
  running: false,
  interval: null,
  sessionStates: new Map(),
  locks: new Set(),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Prüfe ob notion-agent installier ist.
 */
function notionAgentAvailable() {
  const script = join(homedir(), '.agents/notion-agent/memory-sync.mjs');
  return existsSync(script);
}

/**
 * Lese memory.json Metadata.
 */
function readMemoryState() {
  const statePath = join(homedir(), '.agents/memory.json');
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Führe notion-agent sync aus.
 */
async function runMemorySync() {
  const script = join(homedir(), '.agents/notion-agent/memory-sync.mjs');
  if (!notionAgentAvailable()) {
    return { ok: false, error: 'notion-agent nicht gefunden' };
  }

  try {
    const { stdout, stderr } = await execFileAsync('node', [script, 'sync', '--json'], {
      timeout: 30000,
      env: { ...process.env, HOME: homedir() },
    });

    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      result = { ok: true, raw: stdout };
    }

    return { ok: result.ok ?? true, written: result.files ?? [], error: stderr || result.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Prüfe Stale-Memory gegen memory.json.
 */
function checkMemoryFreshness() {
  const state = readMemoryState();
  if (!state) return { fresh: false, reason: 'Keine memory.json' };

  const fetchedAt = new Date(state.fetchedAt);
  const ageMs = Date.now() - fetchedAt.getTime();
  const staleAfterMs = (state.schemaVersion === 1 ? 300 : 60) * 1000; // 5min oder 1min

  return {
    fresh: ageMs < staleAfterMs,
    ageSeconds: Math.round(ageMs / 1000),
    marker: state.marker?.slice(0, 20) + '...',
    reason: ageMs >= staleAfterMs ? 'Stale' : 'Fresh',
  };
}

// ── Engine Dispatch ────────────────────────────────────────────────────────────

/**
 * Dispatch Prompt an Engine (headless).
 */
async function dispatchEngine(engine, prompt, opts = {}) {
  const def = ENGINE_REGISTRY[engine];
  if (!def) {
    return { ok: false, error: `Unbekannte Engine: ${engine}`, available: Object.keys(ENGINE_REGISTRY) };
  }

  const granular = opts.granular ?? false;
  const maxIndex = opts.maxIndex ?? 512;
  const compressionLimit = opts.compressionLimit ?? 0;
  const compressionType = opts.compressionType ?? 'none';
  const useAlternativeModel = opts.useAlternativeModel ?? false;

  // Granulare Kontrolle: Kompression und Modell-Auswahl
  const compressedPrompt = compressionLimit > 0 ? prompt.slice(0, compressionLimit) : prompt;
  const modelInfo = useAlternativeModel ? `alternative-model (maxIndex=${maxIndex})` : `default (maxIndex=${maxIndex})`;

  const { ctx } = opts;

  // Versuche über subprocess Service (wenn verfügbar)
  if (ctx?.subprocess && ctx?.fs) {
    try {
      const executable = await ctx.subprocess.resolveExecutable(def.cmd);
      const handle = ctx.subprocess.spawn({
        command: executable,
        args: [...def.args, prompt],
        env: { ...def.env, ...opts.env },
        cwd: opts.cwd || process.cwd(),
      });

      let output = '';
      for await (const chunk of handle.stdout) {
        output += chunk.toString();
        if (opts.signal?.aborted) {
          handle.kill();
          break;
        }
      }

      const exitCode = await handle.wait();
      return { ok: exitCode === 0, output: output.slice(0, 2000), exitCode, engine, granular, maxIndex, compressionLimit, compressionType, useAlternativeModel, modelInfo };
    } catch (err) {
      return { ok: false, error: `subprocess fail: ${err.message}`, engine };
    }
  }

  // Fallback: execFile
  try {
    const { stdout, stderr } = await execFileAsync(def.cmd, [...def.args, prompt], {
      timeout: 60000,
      env: { ...process.env, ...def.env, ...opts.env },
      cwd: opts.cwd || process.cwd(),
    });
    return { ok: true, output: stdout.slice(0, 2000), engine, granular, maxIndex, compressionLimit, compressionType, useAlternativeModel, modelInfo };
  } catch (err) {
    return { ok: false, error: err.message, engine, granular, maxIndex, compressionLimit, compressionType, useAlternativeModel, modelInfo };
  }
}

// ── Runner Logic ───────────────────────────────────────────────────────────────

/**
 * Starte den Global Runner.
 */
export function startRunner(ctx, config) {
  if (runnerState.running) {
    return { ok: false, error: 'Runner läuft bereits' };
  }

  runnerState.running = true;
  console.log(`[shinon-forge] Runner gestartet (Poll: ${config.pollInterval}s)`);

  // Sofort ersten Poll
  pollSessions(ctx, config).catch(console.error);

  // Intervall
  runnerState.interval = setInterval(() => {
    pollSessions(ctx, config).catch(console.error);
  }, config.pollInterval * 1000);

  return { ok: true, interval: config.pollInterval };
}

/**
 * Stoppe den Global Runner.
 */
export function stopRunner(ctx, config) {
  if (!runnerState.running) {
    return { ok: false, error: 'Runner läuft nicht' };
  }

  if (runnerState.interval) {
    clearInterval(runnerState.interval);
    runnerState.interval = null;
  }

  runnerState.running = false;
  console.log('[shinon-forge] Runner gestoppt');
  return { ok: true };
}

/**
 * Poll alle Agents auf idle und führe Schritte aus.
 */
async function pollSessions(ctx, config) {
  const { agents } = ctx;
  if (!agents) return;

  try {
    const agentList = agents.list();
    let processed = 0;

    for (const agent of agentList) {
      // Nur idle Agents
      if (agent.status !== 'idle') continue;

      const agentId = agent.id;

      // Lock prüfen
      if (runnerState.locks.has(agentId)) continue;

      // Fail-Count prüfen
      const state = runnerState.sessionStates.get(agentId) || { fails: 0 };
      if (state.fails >= config.maxEngineFails) {
        console.log(`[shinon-forge] Agent ${agentId} zu viele Fails (${state.fails}), überspringe`);
        continue;
      }

      // Lock setzen
      runnerState.locks.add(agentId);

      try {
        const result = await executeAgentStep(agent, ctx, config);

        // State aktualisieren
        runnerState.sessionStates.set(agentId, {
          lastRun: Date.now(),
          fails: result.ok ? 0 : state.fails + 1,
          lastResult: result,
        });

        // Heartbeat schreiben
        if (result.ok) {
          writeAgentHeartbeat(agentId, result);
        }
      } catch (err) {
        console.error(`[shinon-forge] Step failed for ${agentId}:`, err.message);
        runnerState.sessionStates.set(agentId, {
          ...state,
          fails: state.fails + 1,
        });
      } finally {
        runnerState.locks.delete(agentId);
      }

      processed++;
    }

    if (processed > 0) {
      console.log(`[shinon-forge] Poll processed ${processed} agents`);
    }
  } catch (err) {
    console.error('[shinon-forge] Poll error:', err);
  }
}

/**
 * Führe einen Schritt mit dem Agent aus.
 */
async function executeAgentStep(agent, ctx, config) {
  // Memory laden
  const memoryFile = join(homedir(), '.agents/AGENTS.md');
  let memoryContent = '';
  if (existsSync(memoryFile)) {
    memoryContent = readFileSync(memoryFile, 'utf8');
  }

  // Schritt-Prompt bauen
  const stepPrompt = buildStepPrompt(agent, memoryContent, config);

  // Engine wählen ( aus agent.config oder default )
  const engine = agent.config?.engine || 'claude';

  // Dispatch
  return await dispatchEngine(engine, stepPrompt, { ctx });
}

/**
 * Baue Step-Prompt aus Agent-Kontext und Memory.
 */
function buildStepPrompt(agent, memoryContent, config) {
  const header = `# Agent Memory (Stand: ${new Date().toISOString()})\n${memoryContent}\n`;
  const context = `# Agent Session\nID: ${agent.id}\nStatus: ${agent.status}\nConfig: ${JSON.stringify(agent.config, null, 2)}\n`;

  return `${header}\n${context}\n\nFühre den nächsten Schritt gemäß Memory und Gates G0-G7 aus.`;
}

/**
 * Schreibe Heartbeat für Agent.
 */
function writeAgentHeartbeat(agentId, result) {
  const heartbeatPath = join(homedir(), `.agents/heartbeats/${agentId}.json`);
  const dir = join(homedir(), '.agents/heartbeats');

  try {
    if (!existsSync(dir)) {
      require('node:fs').mkdirSync(dir, { recursive: true });
    }

    const heartbeat = {
      agentId,
      timestamp: new Date().toISOString(),
      lastResult: result,
    };

    writeFileSync(heartbeatPath, JSON.stringify(heartbeat, null, 2));
  } catch (err) {
    console.warn('[shinon-forge] Heartbeat write failed:', err.message);
  }
}

// ── Tool Definitions ───────────────────────────────────────────────────────────

/**
 * memory_sync Tool
 */
const memorySyncTool = {
  name: 'memory_sync',
  description: 'Sync Agent Memory von Notion zu lokalen Config-Files. Nutzt notion-agent.',
  parameters: z.object({
    force: z.boolean().description('Erzwinge Write ohne Hash-Check').default(false),
    verify: z.boolean().description('Nur prüfen, nicht schreiben').default(false),
  }),
  async execute(params, ctx) {
    if (params.verify) {
      const freshness = checkMemoryFreshness();
      return {
        ok: freshness.fresh,
        freshness,
        state: readMemoryState(),
      };
    }

    return await runMemorySync();
  },
};

/**
 * runner_control Tool
 */
const runnerControlTool = {
  name: 'runner_control',
  description: 'Starte, stoppe oder prüfe den Global Runner.',
  parameters: z.union([z.const('start'), z.const('stop'), z.const('status')]),
  async execute(action, ctx) {
    const config = ctx.get?.('shinon-forge')?.config || { pollInterval: 5, maxEngineFails: 3 };

    if (action === 'start') {
      return startRunner(ctx, config);
    } else if (action === 'stop') {
      return stopRunner(ctx, config);
    } else {
      return {
        running: runnerState.running,
        sessions: runnerState.sessionStates.size,
        locks: runnerState.locks.size,
        interval: config.pollInterval,
      };
    }
  },
};

const reasoningCheckTool = {
  name: 'shion_reasoning',
  description: 'Zeige Reasoning-Status und prüfe Granularität der Engine-Dispatch.',
  parameters: z.object({}),
  async execute(params, ctx) {
    return {
      ok: true,
      reasoningLog: REASONING_LOG.slice(-20),
      granularActive: true,
      maxIndexDefault: 512,
      compressionTypes: ['none', 'gzip', 'lz4', 'zstd'],
    };
  },
};

/**
 * engine_dispatch Tool
 */
const engineDispatchTool = {
  name: 'engine_dispatch',
  description: 'Dispatch Prompt direkt an eine Engine (headless).',
  parameters: z.object({
    engine: z.union([
      z.const('claude'), z.const('codex'), z.const('agy'), z.const('muse'),
      z.const('hermes'), z.const('pi'), z.const('cline'), z.const('grok'), z.const('freebuff'),
    ]).description('Zu verwendende Engine'),
    prompt: z.string().description('Prompt für die Engine'),
    env: z.dict().required(false).description('Optional Environment Variables'),
    maxIndex: z.number().min(128).max(4096).description('Max Index für Modell-Auswahl').default(512),
    compressionLimit: z.number().min(0).max(100000).description('Kompressions-Limit (0 = keine)').default(0),
    compressionType: z.union([z.const('none'), z.const('gzip'), z.const('lz4'), z.const('zstd')]).description('Kompressions-Art').default('none'),
    useAlternativeModel: z.boolean().description('Soll ein anderes Modell mit maxIndex durchführen?').default(false),
  }),
  async execute(params, ctx) {
    const engine = params.engine;
    // Reasoning: Protokolliere Engine-Auswahl und Granularität
    logReasoning('ENGINE_DISPATCH', `Engine=${engine}, promptLength=${params.prompt?.length ?? 0}, envKeys=${Object.keys(params.env ?? {}).length}`);
    return await dispatchEngine(engine, params.prompt, {
      env: params.env,
      ctx,
      granular: true,
      maxIndex: params.maxIndex ?? 512,
      compressionLimit: params.compressionLimit ?? 0,
      compressionType: params.compressionType ?? 'none',
    });
  },
};

/**
 * memory_status Tool
 */
const memoryStatusTool = {
  name: 'memory_status',
  description: 'Zeige Status des Agent Memory (Stale-Fresh, Marker, Quellen).',
  parameters: z.object({}),
  async execute(params, ctx) {
    const state = readMemoryState();
    const freshness = checkMemoryFreshness();
    const available = notionAgentAvailable();

    return {
      available,
      state,
      freshness,
      canonicalPath: join(homedir(), '.agents/AGENTS.md'),
      files: state?.files?.map(f => ({ path: f.path, kind: f.kind })) ?? [],
    };
  },
};

// ── Export ─────────────────────────────────────────────────────────────────────

export function apply(ctx, config) {
  console.log('[shinon-forge] Aktiviert');

  // Tools registrieren
  ctx.tools.register(memorySyncTool);
  ctx.tools.register(runnerControlTool);
  ctx.tools.register(engineDispatchTool);
  ctx.tools.register(memoryStatusTool);
  ctx.tools.register(reasoningCheckTool);

  // Session Events beobachten
  ctx.on('agent/created', (agent) => {
    console.log(`[shinon-forge] Agent ${agent.id} erstellt`);
    runnerState.sessionStates.set(agent.id, { fails: 0 });
  });

  ctx.on('agent/disposed', ({ agent }) => {
    console.log(`[shinon-forge] Agent ${agent.id} disposed`);
    runnerState.sessionStates.delete(agent.id);
    runnerState.locks.delete(agent.id);
  });

  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle' && runnerState.running) {
      // Runner wird den Agent im nächsten Poll aufnehmen
    }
  });

  // Memory beim Start prüfen
  const freshness = checkMemoryFreshness();
  if (!freshness.fresh) {
    console.warn(`[shinon-forge] Memory möglicherweise stale (${freshness.reason})`);
  }

  return () => {
    stopRunner(ctx, config);
    console.log('[shinon-forge] Deaktiviert');
  };
}
