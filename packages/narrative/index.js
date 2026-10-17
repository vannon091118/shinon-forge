import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';
import { advance, initialState } from './assets/narrative-core.js';

/**
 * @shinon/narrative — Narrative Engine (Zug 5: aktiviert).
 *
 * Architektur:
 *   session.event ──▶ @shinon/events ──▶ shinon/event ──▶ Chronicle
 *                                                            │
 *                                                            ▼
 *                                                    Arc Tracking
 * → Kanon: docs/COMMENT-KANON.md#k-4ee7381077b9
 */

export {
  advance,
  appendChronicle,
  createArc,
  djb2,
  deriveComposite,
  deriveMood,
  deriveNarrator,
  initialState,
  relationshipState,
} from './assets/narrative-core.js';

/** Vertragsname des Zustands (Daten, nicht Code). */
export const STATE_CONTRACT = 'shinon.narrative/v1';

/**
 * Ereignis-Kanal, auf dem der eigene Zustand hinausgeht. Er ist der EINE Ausgang
 * dieses Pakets: lesend beobachten, ableiten, melden — nie handeln.
 */
export const STATE_CHANNEL = 'shinon/narrative/state';

export const Config = z.object({
  eventsChannel: z.string().default('shinon/event'),
  chronicleLimit: z.number().min(10).max(200).default(50),
  freezeThreshold: z.number().min(10).max(50).default(20),
  relationshipWindow: z.number().min(5).max(50).default(20),
});

/** Den Vertrag aus assets/ laden — ohne ihn laeuft nichts (fail-closed). */
export function loadContract(path = './assets/narrative-state.json') {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

export function apply(ctx, config) {
  let contract = null;
  try {
    contract = loadContract();
  } catch (error) {
    // Ohne Vertrag gibt es keinen Takt: die Ableitung REGELT sich aus Daten, und
    // geraten wird hier nichts. Das Paket bleibt dann still (fail-closed).
    console.error(`[shinon-narrative] Vertrag nicht lesbar (${error?.message ?? error}) — keine Ableitung`);
  }

  const state = initialState(config.freezeThreshold);

  const handler = (envelope, payload) => {
    if (contract === null) return;
    const event = {
      id: envelope?.event_id ?? null,
      type: envelope?.event_type ?? null,
      timestamp: envelope?.timestamp ?? null,
      actors: payload?.actors ?? ['shinon', 'system'],
      context: payload,
    };
    advance(state, contract, event, config);
    if (typeof ctx?.emit === 'function') ctx.emit(STATE_CHANNEL, state.composite);
  };

  const disposer = typeof ctx?.on === 'function' ? ctx.on(config.eventsChannel, handler) : () => {};
  if (contract !== null) {
    console.log(
      `[shinon-narrative] Aktiviert — ${config.chronicleLimit} Ereignisse Hot, Freeze bei ${config.freezeThreshold}` +
        `; Mood und Erzaehler aus dem Vertrag (${STATE_CONTRACT}), kein Zufall, keine Uhr`,
    );
  }

  return () => {
    if (typeof disposer === 'function') disposer();
    console.log('[shinon-narrative] Deaktiviert');
  };
}
