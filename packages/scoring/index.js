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
 *
 * DIE ABLAGE (Zug 2): dieser Host SCHREIBT SELBST NICHTS — kein Dateisystem,
 * keine Datenbank, kein `Date.now` (das Gate haelt das fest). Der Stand geht
 * ueber den zweiten, schmalen Dienst des Projekt-Index (`shinon_index_store`,
 * `shinon.project-index/store-v1`) in die SQLite, die der Index ohnehin fuer das
 * Projekt fuehrt — und wird beim Start von dort wieder gelesen. Fehlt der Dienst
 * (ein Profil ohne Project Index) oder ist er unbrauchbar, rechnet das Scoring
 * unveraendert im Speicher weiter: die Ablage ist eine Verstaerkung, keine
 * Bedingung.
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
  strengthFactor,
  translateSignal,
  deriveTendency,
  createSignalCollector,
} from './assets/scoring-core.js';
import { canonicalize, initialState as coreInitialState, createSignalCollector, deriveTendency } from './assets/scoring-core.js';

/**
 * Die Naht zur Ablage (Zug 2) — als Namen an EINER Stelle, weil kein Paket das
 * andere liest: der Projekt-Index fuehrt `STORE_SERVICE`/`STORE_CONTRACT` mit
 * demselben Wortlaut, und `scripts/gate/tests/context-wiring.test.mjs` pinnt die
 * Gleichheit beider Seiten. Ein Literal hier und eines dort waeren zwei
 * Wahrheiten; gepinnt sind sie eine.
 */
export const INDEX_STORE_SERVICE = 'shinon_index_store';
export const INDEX_STORE_CONTRACT = 'shinon.project-index/store-v1';

/**
 * Der Namensraum der Ablage: EIN Namensraum je Projekt, und der Index gehoert
 * genau einem Projekt (die Datei ist aus dem Wurzelpfad gehasht). Deshalb steht
 * hier kein zweiter Projektbezeichner — der Ort ist die Zuordnung.
 */
export const LEDGER_NAMESPACE = 'shinon.scoring/ledger-v1';

/**
 * Die Naht zum TON (Zug 5) — der Stand als schmale Faehigkeit.
 *
 * Wer den Ton eines Schritts lesen will (der Veredler fuer seinen Stand-Block,
 * die Persona fuer Haltung und Haerte), braucht NICHT die Tafel: er braucht die
 * HALTUNG und ihre Stufen. Deshalb genau ZWEI Felder — `contract` und EINE
 * Operation `read` — und `read` gibt `null` zurueck, solange nichts zu sagen
 * ist. Dieselbe Bauform wie die Abfrage des Index, aus demselben Grund: kein
 * Paket liest ein anderes, und der Vertragsname wird auf beiden Seiten geprueft.
 * Die Gleichheit der Namen pinnt `scripts/gate/tests/context-wiring.test.mjs`.
 */
export const SCORING_SERVICE = 'shinon_scoring_state';
export const SCORING_SERVICE_CONTRACT = 'shinon.scoring-state/read-v1';

/** Leere Scorecard: der Stub läuft dann lesend, aber ohne Werte. */
const EMPTY_SCORING = { contract: 'shinon.scoring-state/unloaded', dimensions: {}, events: {}, relation: { levels: [], initial: null } };
const EMPTY_PROFILE = { contract: 'shinon.technical-profile/unloaded', capabilities: [], skills: [], limits: {} };
const EMPTY_TRIGGERS = { contract: 'shinon.skill-triggers/unloaded', triggers: [] };

/**
 * Ohne Signaltabelle gibt es keine Ohren — nicht "weniger", sondern keine.
 * Die Tafel steht dann still, stattSignale zu erfinden (fail-closed).
 */
const EMPTY_RULES = { contract: 'shinon.signal-rules/unloaded', limits: { strengths: {} }, sources: {}, signals: {} };

/**
 * Ohne Tendenz-Regeln gibt es keine Tendenz — dann wird KEINE behauptet.
 * Eine leere Tabelle ergibt `ready: false` mit benanntem Grund, nicht einen
 * stillen Vorgabewert (fail-closed, wie ueberall in dieser Schicht).
 */
const EMPTY_TENDENCY = { contract: 'shinon.tendency-rules/unloaded', classes: [], levels: [], stances: [], minSignals: Infinity };

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
  /**
   * Tendenz-Regeln (Zug 3): wie aus dem Protokoll eine Haltung wird — Klassen,
   * Stufen, Bedingungen, Mindestevidenz. Ebenfalls Daten; die Rechnung selbst
   * ist `deriveTendency` im Kern.
   */
  tendencyPath: z.string().default('./assets/tendency-rules.json'),
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
  const tendency = loadOrWarn('Tendenz-Regeln', config.tendencyPath, EMPTY_TENDENCY);
  const contracts = { scoring, profile, triggers };

  const initial = coreInitialState(scoring);
  const dimensions = Object.keys(initial.scores).length;

  // ── Die Ablage: das dauerhafte Gedaechtnis ────────────────────────────────
  //
  // Vier Fail-Richtungen, jede benannt — und keine davon haelt den Host an:
  //
  //   kein Dienst       kein Gedaechtnis in diesem Profil. Das Scoring rechnet
  //                     im Speicher weiter, als waere nichts: kein Fehler.
  //   fremder Dienst    wer den Namen traegt, muss den Vertrag UND beide
  //                     Operationen tragen. Sonst wird er nicht benutzt.
  //   nicht lesbar      LEER starten (die Tafel steht bei initial) mit dem
  //                     GRUND im Protokoll. Ein kaputter Index darf den Host
  //                     nicht anhalten — und nicht so tun, als sei er heil.
  //   nicht schreibbar  warnen und weiterrechnen: der laufende Prozess ist
  //                     wichtiger als die Ablage.
  // Einmal gefunden, bleibt gefunden. Ein NICHT gefundener Dienst wird dagegen
  // erneut gefragt: die Mount-Reihenfolge eines Profils ist keine Zusage, und
  // eine Abfrage ist ein Nachschlagen im Dienstverzeichnis — kein Aufwand.
  let store = null;

  /**
   * Die Zeile ueber die Ablage — und zwar die Wahrheit.
   *
   * GEMESSEN im echten Boot (2026-10-11, `dsh --profile shinon`): der Index
   * mountet NACH dem Scoring. Beim Mounten stand hier deshalb „kein Gedaechtnis
   * … der Stand bleibt im Speicher", waehrend derselbe Lauf mit dem ersten
   * Signal in genau diese Ablage schrieb (belegt: `Stand geladen: 1 Signale`
   * im naechsten Boot). Ein Satz, der eine Frage beantwortet, die zu diesem
   * Zeitpunkt noch offen ist, ist keine Auskunft.
   *
   * Deshalb jetzt: gefunden wird sofort genannt (das ist ein Fakt), NICHT
   * gefunden erst beim ersten echten Gebrauch — dort liegt der Blick hinter
   * allen Mounts, und dort ist „kein Gedaechtnis" eine Aussage statt einer
   * Vermutung. Ein Boot ohne ein einziges Signal nennt die Ablage gar nicht:
   * eine Zeile, die nichts weiss, ist besser als eine, die etwas behauptet.
   */
  let mountProbe = true;
  let decided = false;
  const announceStore = () => {
    if (decided) return;
    if (store !== null) {
      decided = true;
      console.log(`[shinon-scoring] Ablage: ${INDEX_STORE_SERVICE} (${INDEX_STORE_CONTRACT}, Namensraum ${LEDGER_NAMESPACE})`);
      return;
    }
    if (mountProbe) return;
    decided = true;
    console.log(`[shinon-scoring] Ablage: kein Gedaechtnis (${INDEX_STORE_SERVICE} nicht angeboten — der Stand bleibt im Speicher)`);
  };

  const resolveStore = () => {
    if (store !== null) return store;
    let found = null;
    try {
      found = typeof ctx?.get === 'function' ? ctx.get(INDEX_STORE_SERVICE) ?? null : null;
    } catch (error) {
      console.warn(`[shinon-scoring] Ablage nicht abfragbar (${error?.message ?? error}) — der Stand bleibt im Speicher`);
      found = null;
    }
    if (
      found !== null &&
      (found.contract !== INDEX_STORE_CONTRACT || typeof found.load !== 'function' || typeof found.save !== 'function')
    ) {
      console.warn(`[shinon-scoring] Fremder Dienst unter ${INDEX_STORE_SERVICE} (Vertrag ${String(found?.contract)}) — der Stand bleibt im Speicher`);
      found = null;
    }
    store = found;
    announceStore();
    return store;
  };

  /** Den gemeldeten Stand in die Ablage schreiben — reine Weitergabe plus Spur. */
  const writeState = (snapshot) => {
    const target = resolveStore();
    if (target === null) return;
    let answer;
    try {
      answer = target.save(LEDGER_NAMESPACE, snapshot);
    } catch (error) {
      console.warn(`[shinon-scoring] Ablage nicht beschreibbar (${error?.message ?? error}) — der Stand bleibt im Speicher`);
      return;
    }
    if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
      console.warn(`[shinon-scoring] Ablage nicht beschreibbar (${answer?.error ?? 'unbekannte Antwort'}) — der Stand bleibt im Speicher`);
    }
  };

  const collector = createSignalCollector({ contracts, rules, onPersist: writeState });

  /**
   * Den Stand EINMAL aus der Ablage holen.
   *
   * WARUM NICHT NUR IM `apply`: die Reihenfolge, in der ein Profil seine
   * Bundles mountet, ist keine Zusage. Der erste echte Gebrauch liegt sicher
   * hinter ALLEN Mounts — deshalb wird hier geladen, wenn der Dienst schon da
   * ist, und sonst beim ersten Lesen erneut gefragt. Danach ist die Frage
   * entschieden: ein Profil ohne Index zahlt dafuer je Ereignis EIN Nachschlagen
   * im Dienstverzeichnis, sonst nichts.
   */
  let memoryLoaded = false;
  const loadState = () => {
    if (memoryLoaded) return null;
    const target = resolveStore();
    if (target === null) return null;
    memoryLoaded = true;
    let answer;
    try {
      answer = target.load(LEDGER_NAMESPACE);
    } catch (error) {
      console.warn(`[shinon-scoring] Stand nicht lesbar (${error?.message ?? error}) — Start ohne Gedaechtnis`);
      return null;
    }
    if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
      console.warn(`[shinon-scoring] Stand nicht lesbar (${answer?.error ?? 'unbekannte Antwort'}) — Start ohne Gedaechtnis`);
      return null;
    }
    const state = answer.state;
    if (state === null || state === undefined) return null;
    const adopted = collector.hydrate(state);
    // Die gespeicherte Tafel ist EVIDENZ, nicht Wahrheit: sie muss mit der
    // Rechnung uebereinstimmen. Weicht sie ab, gilt das Protokoll — es ist die
    // Quelle — und die Abweichung steht im Protokoll, statt still zu bleiben.
    if (state.scorecard !== null && state.scorecard !== undefined && canonicalize(state.scorecard) !== canonicalize(collector.scorecard())) {
      console.warn('[shinon-scoring] Gespeicherte Tafel weicht von der Rechnung ab — die Rechnung gilt, das Protokoll ist die Wahrheit');
    }
    if (adopted.rejected > 0) {
      console.warn(`[shinon-scoring] ${adopted.rejected} unlesbare Eintraege in der Ablage uebergangen`);
    }
    console.log(`[shinon-scoring] Stand geladen: ${adopted.records} Signale, ${adopted.memos} offene Sitzungen, ${state.notes ?? 0} Bemerkungen`);
    return adopted;
  };
  loadState();

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
          // Die Ablage erscheint spaetestens mit dem ersten Ereignis sicher da:
          // mountet das Profil den Index NACH dem Scoring, wird der Stand hier
          // nachgeholt. Danach ist die Frage entschieden (memoryLoaded).
          if (!memoryLoaded) loadState();
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
  const classes = Array.isArray(tendency.classes) ? tendency.classes.length : 0;
  const levels = Array.isArray(tendency.levels) ? tendency.levels.length : 0;
  console.log(
    `[shinon-scoring] Verträge geladen (${dimensions} Dimensionen, ${triggers.triggers?.length ?? 0} Trigger, nur lesend) — ` +
      `Ohren auf ${config.eventsChannel}: ${sources} Quellen, ${signals} Signale` +
      `; Tendenz aus ${classes} Klassen, ${levels} Stufen, ab ${Number.isFinite(tendency.minSignals) ? tendency.minSignals : '∞'} Signalen` +
      `${listening === null ? ' (NICHT angebunden — die Tafel bleibt stehen)' : ''}`,
  );
  // Der Mount-Blick auf die Ablage: er nennt sie, wenn sie schon da ist, und
  // schweigt, wenn die Mount-Reihenfolge die Frage noch offen laesst. Entschieden
  // wird sie beim ersten echten Gebrauch (siehe announceStore).
  resolveStore();
  mountProbe = false;

  // ── Der Ton als Faehigkeit ────────────────────────────────────────────────
  //
  // Die Tendenz ist HERGELEITET (aus dem Protokoll), also wird sie hier gelesen
  // und nicht gespeichert; `read` rechnet bei jedem Aufruf neu. Ein Host ohne
  // `ctx.provide` ist kein Fehler des Laufs — dann wird der Ton eben nicht
  // angeboten, und das steht im Log.
  const canProvide = typeof ctx?.provide === 'function';
  const standService = {
    contract: SCORING_SERVICE_CONTRACT,
    read: () => {
      if (!memoryLoaded) loadState();
      const derived = deriveTendency(tendency, collector.records());
      // Nichts behauptet, nichts erfunden: ohne ein einziges Signal gibt es
      // keinen Ton. `null` ist die ehrliche Antwort, `stance: null` waere eine
      // Aussage ueber eine Lage, die es nicht gibt.
      if (derived.signals === 0) return null;
      return {
        stance: derived.stance,
        ready: derived.ready,
        reason: derived.reason,
        tendencies: Object.entries(derived.levels).map(([klasse, stufe]) => ({
          klasse,
          stufe,
          share: derived.shares[klasse] ?? 0,
        })),
        signals: derived.signals,
      };
    },
  };
  const releaseStand = canProvide ? ctx.provide(SCORING_SERVICE, standService) : null;
  console.log(
    `[shinon-scoring] Ton: ${SCORING_SERVICE} (${SCORING_SERVICE_CONTRACT}) ${canProvide ? 'angeboten' : 'NICHT angeboten (der Host hat kein ctx.provide)'}`,
  );

  return {
    contracts,
    initial,
    collector,
    /** Der angebotene Ton — fuer Tests und den spaeten Mount. */
    standService,
    /** Ein Ereignis von Hand zufuehren (Tests, Replay, naechster Zug). */
    observe: (envelope, payload) => {
      if (!memoryLoaded) loadState();
      return collector.observe(envelope, payload);
    },
    /** Den Stand aus der Ablage laden (fuer Tests und einen spaeten Mount). */
    loadState,
    // JEDE Abfrage des Standes holt ihn vorher, wenn das noch nicht geschehen
    // ist: mountet das Profil den Index nach dem Scoring, findet der erste
    // LESER den Stand — nicht erst das erste Ereignis.
    /** Der ganze Stand — Protokoll, Merkzettel, Tafel, Bemerkungen. */
    state: () => {
      if (!memoryLoaded) loadState();
      return collector.state();
    },
    scorecard: () => {
      if (!memoryLoaded) loadState();
      return collector.scorecard();
    },
    /**
     * Die Tendenz — aus dem Protokoll abgeleitet, nie gespeichert.
     *
     * Die Tafel (`scorecard`) und die Tendenz sind beide HERGELEITET; nur das
     * Protokoll ist Evidenz. Deshalb braucht die Tendenz keine eigene Fassung in
     * der Ablage: was geladen wird, erzeugt sie beim Lesen neu. Eine unter
     * `minSignals` duenne Lage ergibt `ready: false` und `stance: null` — dann
     * behauptet niemand eine Haltung.
     */
    tendency: () => deriveTendency(tendency, collector.records()),
    dispose: () => {
      if (typeof releaseStand === 'function') releaseStand();
      if (listening !== null) listening();
      // Sitzungen enden mit dem Prozess: erst schliessen (die Ablage traegt den
      // Rest), dann den Speicher leeren. Umgekehrt waere der Merkzettel weg,
      // ohne dass ihn jemand abgeschlossen haette.
      collector.closeAllSessions();
      collector.dispose();
      console.log('[shinon-scoring] Deaktiviert');
    },
  };
}
