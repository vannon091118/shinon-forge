import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';

/**
 * @shinon/scoring — Scorecard, Decay, Relation (Kern, K3) und die Ohren (K5).
 *
 * Rolle: lesen, nie schreiben. Diese Schicht hält die Scorecard
 * (./assets/scoring-state.json), das Technik-Profil, die Skill-Trigger und die
 * Signaltabelle (./assets/signal-rules.json) — reines Replay: Anfangszustand +
 * Signalstrom → Scorecard + Injektion + Digest. Deterministisch (kein
 * Math.random, kein Date.now, kein Modell), fail-closed bei Unbekanntem. Die
 * reine Mechanik liegt in ./assets/scoring-core.js (keine Imports, testbar ohne
 * node_modules); diese Datei lädt nur Verträge, haengt die Ohren an den
 * Ereigniskanal des Spines und re-exportiert den Kern.
 *
 * Kein Browser, keine Plattform-Abhaengigkeit: die Quellen sind Ereignisse, die
 * DSH selbst schreibt (Urteil je Antwort, Widerruf, Sitzungsbemerkung,
 * Menschen-Text, Turn-Ende). Was intern keine Quelle hat, steht in der Tabelle
 * als nicht beobachtbar — und wird nie geraten.
 */

export {
  round4,
  canonicalize,
  stableHash,
  initialState,
  applyEvent,
  evaluateTriggers,
  replay,
  readScore,
  readPath,
  normalizeTokens,
  overlapOf,
  humanText,
  translateSignal,
  createSignalCollector,
} from './assets/scoring-core.js';
import { initialState as coreInitialState, createSignalCollector } from './assets/scoring-core.js';

/** Leere Scorecard: der Stub läuft dann lesend, aber ohne Werte. */
const EMPTY_SCORING = { contract: 'shinon.scoring-state/unloaded', dimensions: {}, events: {}, relation: { levels: [], initial: null } };
const EMPTY_PROFILE = { contract: 'shinon.technical-profile/unloaded', capabilities: [], skills: [], limits: {} };
const EMPTY_TRIGGERS = { contract: 'shinon.skill-triggers/unloaded', triggers: [] };

/**
 * Ohne Signaltabelle gibt es keine Ohren — nicht "weniger", sondern keine.
 * Die Tafel steht dann still, stattSignale zu erfinden (fail-closed).
 */
const EMPTY_RULES = { contract: 'shinon.signal-rules/unloaded', limits: { strengths: {} }, sources: {}, signals: {} };

/** Vertragsdaten aus dem Paket laden. */
export function loadScorecard(relPath) {
  return JSON.parse(readFileSync(new URL(relPath, import.meta.url), 'utf8'));
}

export const Config = z.object({
  /** Scorecard-Vertrag (Dimensionen, Event-Wirkung, Decay, Kühlen, Relation). */
  scorePath: z.string().default('./assets/scoring-state.json'),
  /** Technik-Profil (Capabilities, Skills, Limits). */
  technicalPath: z.string().default('./assets/technical-profile.json'),
  /** Skill-Trigger (Injektionsregeln in Reihenfolge). */
  triggersPath: z.string().default('./assets/skill-triggers.json'),
  /**
   * Signaltabelle (K5): welche internen Ereignisse welche Signale sind. Sie
   * liegt als DATEN im Paket, nicht im Code — ein neues Signal ist zuerst eine
   * Zeile hier, kein Umbau.
   */
  rulesPath: z.string().default('./assets/signal-rules.json'),
  /** Replay-Fixture — Beweis, dass derselbe Strom reproduzierbar ist. */
  replayPath: z.string().default('./assets/replay/scoring-demo.json'),
  /** Kanal, auf dem der Event-Spine seine Envelopes emittiert. */
  eventsChannel: z.string().default('shinon/event'),
});

function loadOrWarn(label, relPath, fallback) {
  try {
    return loadScorecard(relPath);
  } catch (error) {
    console.warn(`[shinon-scoring] ${label} nicht lesbar (${relPath}): ${error.message}`);
    return fallback;
  }
}

export function apply(ctx, config) {
  const scoring = loadOrWarn('Scorecard', config.scorePath, EMPTY_SCORING);
  const profile = loadOrWarn('Technik-Profil', config.technicalPath, EMPTY_PROFILE);
  const triggers = loadOrWarn('Skill-Trigger', config.triggersPath, EMPTY_TRIGGERS);
  const rules = loadOrWarn('Signaltabelle', config.rulesPath, EMPTY_RULES);
  const contracts = { scoring, profile, triggers };

  const initial = coreInitialState(scoring);
  const dimensions = Object.keys(initial.scores).length;
  const collector = createSignalCollector({ contracts, rules });

  /**
   * Die Ohren: der Spine emittiert `(envelope, payload)` auf dem Kanal. Zwei
   * Fail-Richtungen, wie beim Spine selbst — fail-open fuer den HOST (ein
   * Signal, das unsinnig ist, darf den beobachteten Prozess nicht brechen),
   * fail-closed fuer das SIGNAL (was die Tabelle nicht kennt, aendert nichts).
   */
  const listening = (() => {
    if (typeof ctx?.on !== 'function') {
      console.warn(`[shinon-scoring] Ohren NICHT angebunden — der Host hat kein ctx.on (Kanal ${config.eventsChannel})`);
      return null;
    }
    try {
      const dispose = ctx.on(config.eventsChannel, (envelope, payload) => {
        try {
          collector.observe(envelope, payload);
        } catch (error) {
          console.warn(`[shinon-scoring] Signal verworfen (${error?.name ?? 'Error'}: ${error?.message ?? error})`);
        }
      });
      return typeof dispose === 'function' ? dispose : () => {};
    } catch (error) {
      console.warn(`[shinon-scoring] Ohren NICHT angebunden (${error?.message ?? error})`);
      return null;
    }
  })();

  const sources = Object.keys(rules.sources ?? {}).length;
  const signals = Object.keys(rules.signals ?? {}).length;
  console.log(
    `[shinon-scoring] Verträge geladen (${dimensions} Dimensionen, ${triggers.triggers?.length ?? 0} Trigger, nur lesend) — ` +
      `Ohren auf ${config.eventsChannel}: ${sources} Quellen, ${signals} Signale` +
      `${listening === null ? ' (NICHT angebunden — die Tafel bleibt stehen)' : ''}`,
  );

  return {
    contracts,
    initial,
    collector,
    /** Ein Ereignis von Hand zufuehren (Tests, Replay, naechster Zug). */
    observe: (envelope, payload) => collector.observe(envelope, payload),
    scorecard: () => collector.scorecard(),
    dispose: () => {
      if (listening !== null) listening();
      collector.dispose();
      console.log('[shinon-scoring] Deaktiviert');
    },
  };
}
