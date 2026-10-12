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
 *                                                            │
 *                                                            ▼
 *                                                    Relationship State
 *                                                            │
 *                                                            ▼
 *                                                    Composite → Persona
 *
 * Deterministisch: gleicher Input + gleiche Historie = gleicher Output.
 * Keine Zeit, kein Zufall, kein Modell.
 *
 * WAS ZUG 5 GEÄNDERT HAT (dieses Paket war bis dahin `inactive`):
 *
 *   1. Der eigene Schema-Fallback ist weg. Eingebunden wird `@deepseek-ai/schemastery`
 *      wie in jedem anderen Paket — ein zweiter, selbstgebauter Schemabau war ein
 *      Sonderweg, den nur dieses Paket kannte (er haette jede Schema-Version
 *      stillschweigend anders beantwortet als der Rest des Repos).
 *   2. Die XorShift-PRNG ist weg. Mood und Erzaehler kommen aus DATEN
 *      (`assets/narrative-state.json#derivation`) — der Vertrag sagt jetzt, WARUM
 *      ein Takt so klingt, statt es zu wuerfeln (siehe assets/narrative-core.js).
 *   3. Die Uhr ist weg: ein fehlender Zeitstempel bleibt `null`, statt aus
 *      `new Date()` zu kommen. „Nur aus Vorgaenger + Ereignis" steht als Invariante
 *      im Vertrag, und die gilt jetzt auch hier.
 *   4. Der tote Dienst ist weg: `ctx.set('narrative', …)` war an `typeof ctx.set`
 *      gebunden (Cordis bietet `provide`, nicht `set`) und hatte keinen Leser.
 *      Was niemand liest, wird nicht angeboten — der Composite geht als Ereignis
 *      `shinon/narrative/state` raus, und das ist der geprüfte Weg.
 *
 * Die reinen Funktionen (Mood-Tabelle, Anti-Wiederholung, Arc, Relationship,
 * Composite, Chronik) liegen in `assets/narrative-core.js` — ohne Imports, damit
 * der Test in CI ohne node_modules laeuft.
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
