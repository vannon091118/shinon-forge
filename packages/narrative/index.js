import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';
import { advance, initialState, validateNarrativeState } from './assets/narrative-core.js';
// Kanal und Vertrag haben EINE Definition: `@shinon/seams` (Host-Naht-Kern).
import { INDEX_STORE_CONTRACT, INDEX_STORE_SERVICE, NARRATIVE_STATE_CHANNEL, NARRATIVE_STATE_CONTRACT, createOrchestrator } from '@shinon/seams/core';

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
 *   5. ZUG 6 — DER LESER IST DA: bis dahin hatte den Kanal niemand abonniert, der
 *      Composite ging ins Leere (die Engine rechnete, aber niemand sah es). Die
 *      Persona hoert jetzt auf `STATE_CHANNEL` und rendert daraus ihren Abschnitt
 *      `shinon:narrative-arc`. Sie uebernimmt den Composite NICHT in ihren eigenen
 *      Zustand (dessen `mood` bleibt maßgeblich) — der Vertrag sagt `authority:
 *      NONE`, und ein Abschnitt, der eine Interpretation als Tatsache ausgibt,
 *      waere genau der Fehler, den `authority` verhindern soll. Kanalname und
 *      Vertragsname sind auf beiden Seiten LITERALE; die Gleichheit pinnt
 *      `scripts/lib/repo.mjs` (SOURCE_TWINS) plus
 *      `scripts/gate/tests/narrative.test.mjs`.
 *
 * Die reinen Funktionen (Mood-Tabelle, Anti-Wiederholung, Arc, Relationship,
 * Composite, Chronik) liegen in `assets/narrative-core.js` — ohne Imports, damit
 * der Test in CI ohne node_modules laeuft.
 */

export {
  EVIDENCE_LEVELS,
  advance,
  appendChronicle,
  createArc,
  deriveComposite,
  deriveMood,
  deriveNarrator,
  initialState,
  relationshipState,
  validateNarrativeState,
} from './assets/narrative-core.js';

/**
 * Vertragsname und Kanal des Zustands — EINE Definition in `@shinon/seams`.
 *
 * Der Name bleibt hier oeffentlich (`STATE_CONTRACT`/`STATE_CHANNEL`), weil
 * dieses Paket der BESITZER der Naht ist; die Definition liegt aber nicht mehr
 * hier. Bis 2026-10-20 standen beide Literale hier UND in `@shinon/persona` und
 * `@shinon/prompter`; `SOURCE_TWINS` hielt die Kopien zusammen. Ein falscher
 * Kanalname hiesse nur, dass der Abschnitt nie erscheint — und das saehe aus wie
 * "es gibt keine Narrative".
 */
export const STATE_CONTRACT = NARRATIVE_STATE_CONTRACT;

/**
 * Ereignis-Kanal, auf dem der eigene Zustand hinausgeht. Er ist der EINE Ausgang
 * dieses Pakets: lesend beobachten, ableiten, melden — nie handeln.
 */
export const STATE_CHANNEL = NARRATIVE_STATE_CHANNEL;

/** Die dauerhafte Ablage — derselbe Dienst wie beim Scoring und der Persona. */
export { INDEX_STORE_SERVICE, INDEX_STORE_CONTRACT };

/** Der Namensraum des fortgeschriebenen Zustands: eigener Raum, eigenes Memo. */
export const STATE_NAMESPACE = 'shinon.narrative-state/v1';
export const STATE_MEMO_ID = 'narrative';

export const Config = z.object({
  eventsChannel: z.string().default('shinon/event'),
  chronicleLimit: z.number().min(10).max(200).default(50),
  freezeThreshold: z.number().min(10).max(50).default(20),
  relationshipWindow: z.number().min(5).max(50).default(20),
  /** Leer = kein Gedaechtnis ueber Neustarts; der Zustand lebt dann nur im Prozess. */
  stateNamespace: z.string().default(STATE_NAMESPACE),
});

/** Den Vertrag aus assets/ laden — ohne ihn laeuft nichts (fail-closed). */
export function loadContract(path = './assets/narrative-state.json') {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

export function apply(ctx, config) {
  const bus = createOrchestrator(ctx, { owner: 'narrative' });
  let contract = null;
  try {
    contract = loadContract();
  } catch (error) {
    // Ohne Vertrag gibt es keinen Takt: die Ableitung REGELT sich aus Daten, und
    // geraten wird hier nichts. Das Paket bleibt dann still (fail-closed).
    console.error(`[shinon-narrative] Vertrag nicht lesbar (${error?.message ?? error}) — keine Ableitung`);
  }

  // ── Die dauerhafte Ablage ─────────────────────────────────────────────────
  // Ohne sie war der Verlauf nach jedem Neustart weg. Gelesen wird EINMAL beim
  // Mount, geschrieben nach jedem Takt: der Zustand ist klein, die Zahl der
  // Ereignisse je Turn ebenso.
  const namespace = typeof config.stateNamespace === 'string' ? config.stateNamespace : STATE_NAMESPACE;
  let warned = false;
  const warnOnce = (reason) => {
    if (warned) return;
    warned = true;
    console.warn(`[shinon-narrative] Zustand nur im Speicher: ${reason}`);
  };
  const resolveStore = () => {
    let found = null;
    try {
      found = typeof ctx?.get === 'function' ? ctx.get(INDEX_STORE_SERVICE) ?? null : null;
    } catch (error) {
      warnOnce(`Ablage nicht abfragbar (${error?.message ?? error})`);
      return null;
    }
    if (found === null) return null;
    if (found.contract !== INDEX_STORE_CONTRACT || typeof found.load !== 'function' || typeof found.save !== 'function') {
      warnOnce(`fremder Dienst unter ${INDEX_STORE_SERVICE} (Vertrag ${String(found?.contract)})`);
      return null;
    }
    return found;
  };
  const loadState = () => {
    const empty = initialState(config.freezeThreshold);
    if (namespace === '') return { state: empty, loaded: false, reason: 'NO_NAMESPACE' };
    const store = resolveStore();
    if (store === null) return { state: empty, loaded: false, reason: 'NO_STORE' };
    let answer;
    try {
      answer = store.load(namespace);
    } catch (error) {
      warnOnce(`nicht lesbar (${error?.message ?? error})`);
      return { state: empty, loaded: false, reason: 'READ_FAILED' };
    }
    const memos = answer?.ok === true && Array.isArray(answer.state?.memos) ? answer.state.memos : [];
    const raw = memos.find((memo) => memo?.id === STATE_MEMO_ID) ?? null;
    const checked = validateNarrativeState(raw, STATE_CONTRACT);
    if (checked.state === null) return { state: empty, loaded: false, reason: checked.reason };
    return { state: checked.state, loaded: true, reason: null };
  };
  const persist = () => {
    if (namespace === '') return;
    const store = resolveStore();
    if (store === null) return;
    let answer;
    try {
      answer = store.save(namespace, { memos: [{ id: STATE_MEMO_ID, contract: STATE_CONTRACT, state }] });
    } catch (error) {
      warnOnce(`nicht beschreibbar (${error?.message ?? error})`);
      return;
    }
    if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
      warnOnce(`nicht beschreibbar (${answer?.error ?? 'unbekannte Antwort'})`);
    }
  };

  const restored = loadState();
  const state = restored.state;
  if (restored.loaded) {
    console.log(`[shinon-narrative] Zustand geladen (${STATE_NAMESPACE}, seq ${state.composite.seq}, ${state.chronicle.length} Chronik-Eintraege)`);
  } else if (restored.reason !== 'NO_NAMESPACE' && restored.reason !== 'NO_STORE') {
    console.log(`[shinon-narrative] Kein uebernommener Zustand (${restored.reason}) — Anfang`);
  }

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
    persist();
    if (typeof ctx?.emit === 'function') ctx.emit(STATE_CHANNEL, state.composite);
  };

  const disposer = bus.route(config.eventsChannel, handler);
  if (contract !== null) {
    console.log(
      `[shinon-narrative] Aktiviert — ${config.chronicleLimit} Ereignisse Hot, Freeze bei ${config.freezeThreshold}` +
        `; Mood und Erzaehler aus dem Vertrag (${STATE_CONTRACT}), kein Zufall, keine Uhr` +
        `; Ablage ${namespace === '' ? 'aus' : namespace}${restored.loaded ? ' (Stand geladen)' : ' (Anfang)'}`,
    );
  }

  return () => {
    if (typeof disposer === 'function') disposer();
    if (restored.loaded) persist();
    console.log('[shinon-narrative] Deaktiviert');
  };
}
