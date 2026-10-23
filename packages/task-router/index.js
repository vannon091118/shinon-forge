import z from '@deepseek-ai/schemastery';
// Der Kanal kommt aus `@shinon/seams`, nicht als eigenes Literal.
import { PROMPTER_DECISION_CHANNEL, createOrchestrator } from '@shinon/seams/core';
// Die ENTSCHEIDUNG (§16) steht in `assets/decision-core.js`, die Projektion
// (§18) in `assets/micro-state.js`. Dieser Eintrag registriert nur noch: er
// reicht die oeffentlichen Namen weiter, damit die Paketflaeche dieselbe bleibt.
import {
  CONTRACT,
  SOURCE_CONTRACT,
  activationVerdict,
  buildDecision,
  decide,
  readObjective,
} from './assets/decision-core.js';
import {
  GOAL_SERVICE,
  MICRO_NO_GOAL,
  MICRO_STATE_CONTRACT,
  MICRO_STATE_FIELDS,
  MICRO_STATE_SERVICE,
  MICRO_UNAVAILABLE,
  MicroStateSchema,
  NEXT_ACTIONS,
  createMicroStateService,
  nextActionFor,
  projectMicroState,
} from './assets/micro-state.js';
import { createMicroStateTool } from './assets/micro-state-tool.js';

export {
  CONTRACT,
  GOAL_SERVICE,
  MICRO_NO_GOAL,
  MICRO_STATE_CONTRACT,
  MICRO_STATE_FIELDS,
  MICRO_STATE_SERVICE,
  MICRO_UNAVAILABLE,
  MicroStateSchema,
  NEXT_ACTIONS,
  SOURCE_CONTRACT,
  activationVerdict,
  buildDecision,
  createMicroStateService,
  decide,
  nextActionFor,
  projectMicroState,
  readObjective,
};

/**
 * shinon-task-router — Phase 5/6, Plan §16 und §17.
 *
 * KANON (AGENTS.md, Abschnitt Kanon): diese Komponente heißt **Shinon Task Manager**.
 * Eine Task-Gruppe ist ein Goal mit seinen Runden — ein Goal, keine zweite
 * Session-Historie.
 *
 *   LLM  →  validierte Klassifikation (aus @shinon/prompter)
 *        →  Shinon policy (DIESES Paket)
 *        →  goal / no goal
 *        →  DSH Goal State (ctx.goals)
 *        →  DSH Goal Round Driver        ← NICHT unser Code
 *        →  DSH Agent
 *
 * §16 (dieses Pakets erste Haelfte): „Das LLM liefert eine Klassifikation. Die
 * Runtime entscheidet." Das Modell liefert ein ETIKETT, dieses Paket entscheidet
 * nach einer Policy, die als DATEN dasteht. Naeheres an INTENT_WEIGHTS/decide().
 *
 * §17 (die zweite Haelfte): „DSHs vorhandenen Goal-/Round-Mechanismus
 * verwenden. Nicht selbst implementieren: while (goal.active)." GENAU SO IST ES
 * GEBAUT: es gibt in dieser Datei keine Schleife, keinen Timer und keinen
 * eigenen Goal-Zustand. Die Aktivierung ist ein Aufruf an den vorhandenen
 * Dienst; alles danach — Dauerhaftigkeit, Runden, Quiescence, Abbruch bei
 * Fehlern — gehoert DSH.
 *
 * VERIFIZIERTE API — installiertes DSH 0.2.0-rc.2, nichts davon geraten
 * (@deepseek-ai/dsh-goal):
 *
 *   Dienst   `ctx.goals` — class GoalService (TypertRemoteService)
 *            get(agent) -> GoalView | undefined
 *            create(agent, { objective, maxGoalRounds? }) -> GoalView   (erzeugt
 *              UND armt; eine abgeschlossene Absicht darf ersetzt werden, jede
 *              andere Phase muss stattdessen fortgesetzt/geloescht werden)
 *            edit/pause/resume/complete/block/clear/disarm — hier NICHT benutzt
 *   Config   defaultMaxGoalRounds — Default der Installation: 256
 *   Fehler   GoalError mit code ∈ {GOAL_AGENT_NOT_LIVE, GOAL_ALREADY_EXISTS,
 *            GOAL_STALE_REVISION, GOAL_INVALID_*...}
 *   Ereignis `goal/changed` (emit, agent-scoped) nach jeder dauerhaften Mutation
 *   Driver   @deepseek-ai/dsh-goal-round-driver: lauscht auf agent/status
 *            (idle = Quiescence), goal/changed und die Lifecycle-Ereignisse;
 *            reserviert RUNDEN mit agent.followup(<goal_round>-Prompt), blockt
 *            am Rundenlimit selbst (code 'round-limit') und entwaffnet bei
 *            agent/error und agent/disposed.
 *
 * WAS SHINON AUS §17 BEITRAEGT — und nur das:
 *   * Goal-Eignung ................ §16 (Rangfolge, Schwelle, Substanzgrenze)
 *   * Aktivierungsentscheidung .... `activate` (Policy-Schalter) + der Aufruf
 *   * Stop-Policy ................. `maxGoalRounds` — DSHs Default waere 256
 *                                   Runden; Shinons Wert ist eine Entscheidung
 *                                   und steht im Profil, nicht im Code
 *   * Block-Policy ................ kein Ueberschreiben: existiert bereits eine
 *                                   Absicht, wird sie NICHT angetastet
 *                                   (GOAL_EXISTS) — eine Entscheidung eines
 *                                   Menschen ist keine Zufallsvariable
 *   * Progress-Auswertung ......... NICHT hier (§19 loop-guard)
 *
 * §18 (GOAL MICRO-STATE) — die ZUSAETZLICHE Projektion dieses Pakets:
 * OBJECTIVE, CURRENT_STATE, LAST_VERIFIED_FACT, CURRENT_BLOCKER, NEXT_ACTION.
 * Die Zusage, die dabei mehr wiegt als die fuenf Felder: „Dieser Zustand ist
 * keine zweite autoritative Session-Historie.“ GEBAUT als ein Dienst
 * (`shinon_goal_micro_state`), der bei JEDEM Aufruf frisch aus `ctx.goals`
 * liest und nichts speichert — kein eigener State, kein Listener, keine
 * Meldung, kein Zeitstempel. Autoritativ bleiben DSHs Goal-View und die
 * Session-Daten; die Projektion gibt OBJECTIVE, CURRENT_STATE und
 * CURRENT_BLOCKER wortgleich zurueck, leitet nichts davon ab und erfindet
 * nichts (leer statt geraten). LAST_VERIFIED_FACT hat einen benannten
 * Quellschlitz und sonst keine Quelle. NEXT_ACTION ist eine Beratung als
 * DATEN — ausgefuehrt wird sie nirgends; die EINZIGE Schreibstelle an
 * Goal-State bleibt `create` in activateGoal (§17).
 *
 * FAIL-CLOSED, jede Richtung benannt: ohne lebenden Agenten, ohne Dienst, ohne
 * Aktivierungsschalter oder ohne Substanz gibt es KEINEN Goal — und der Grund
 * steht im Datensatz. Die ENTSCHEIDUNG (goal/linear) ist dabei unabhaengig von
 * der AKTIVIERUNG: §16 bleibt richtig, auch wenn es keine Goal-Domaene gibt.
 *
 * WAS DIESES PAKET AUSDRUECKLICH NICHT BEHAUPTET: dass ein Modell richtig
 * klassifiziert. Geprueft sind Policy, Vokabular, Entscheidung und der
 * Aktivierungsaufruf — nicht die Urteilskraft eines Modells.
 */

/**
 * Der Eingang: der Provenienz-Datensatz des Prompt-Enhancers. Die Klasse darin
 * stammt aus dem Runtime-Resolver des Prompters (Text-Patterns, kein Modell) —
 * der Router liest damit eine Runtime-Entscheidung, keine Modellantwort.
 *
 * Der Kanal kommt aus `@shinon/seams`, nicht als eigenes Literal: bis
 * 2026-10-20 stand hier eine vierte Kopie desselben Namens (Prompter, Persona,
 * Scoring, Router), gehalten von `SOURCE_TWINS` — und der Router war eine davon
 * gar nicht gelistet. Der Naht-Kern ist importfrei, kostet also nichts.
 */
export const SOURCE_CHANNEL = PROMPTER_DECISION_CHANNEL;

/** Der Ausgang: die Entscheidung als Datensatz. */
export const DECISION_CHANNEL = 'shinon/task-router/decision';

/** DSH-Waterfall, an dem der LEBENDE Agent sichtbar wird (Name verifiziert). */
export const PRE_STEP_EVENT = 'agent/pre-step';

/** Lifecycle-Ereignis, nach dem eine vorgemerkte Sitzung nicht mehr lebt. */
export const DISPOSED_EVENT = 'agent/disposed';

// Das §16-Vokabular und seine Gewichte stehen in `assets/intent-policy.js`
// (importfrei, reine Daten). Hier bleiben nur die öffentlichen Namen.
export { INTENT_CLASSES, INTENT_UNDEFINED, INTENT_WEIGHTS, DEFAULT_THRESHOLD, DEFAULT_MIN_RAW_LENGTH };
import { INTENT_CLASSES, INTENT_UNDEFINED, INTENT_WEIGHTS, DEFAULT_THRESHOLD, DEFAULT_MIN_RAW_LENGTH } from './assets/intent-policy.js';

import { DEFAULT_MAX_GOAL_ROUNDS, MAX_GOAL_ROUNDS_CEILING, goalRoundsVerdict } from './assets/goal-budget.js';

// Die Runden-Policy (Default, Obergrenze, Prüfung) steht in `assets/goal-budget.js`:
// ein importfreier Kern, der nur Zahlen kennt. `index.js` re-exportiert ihn, damit
// die öffentlichen Namen dieselben bleiben — und weil diese Datei eine
// eingefrorene Zeilengrenze hat, die nur sinken darf.
export { DEFAULT_MAX_GOAL_ROUNDS, MAX_GOAL_ROUNDS_CEILING, goalRoundsVerdict };

/** Die zwei Ausgaenge. Mehr gibt es nicht: Kandidat oder linearer Turn. */
export const OUTCOMES = ['goal', 'linear'];

/**
 * Die Gruende, aus denen eine AKTIVIERUNG nicht stattfindet. Als Daten, damit
 * weder Tippfehler noch stille Faelle entstehen — jede Meldung ist eine kurze,
 * maschinenlesbare Auskunft ohne Prompt-Text.
 */
export const ACTIVATION_REASONS = [
  'ACTIVATED',
  'LINEAR_TURN',
  'ACTIVATION_DISABLED',
  'NO_LIVE_AGENT',
  // Eigener Grund, seit er es ist: bei mehreren vorgemerkten Sitzungen und einem
  // Datensatz ohne Sitzung waere die Zuordnung geraten. Das ist NICHT "kein
  // lebender Agent" (es sind zwei), sondern "keine eindeutige Zuordnung".
  'STEP_AMBIGUOUS',
  'NO_GOAL_SERVICE',
  'GOAL_EXISTS',
  'GOAL_ERROR',
  // Zug 5: die Runden-Obergrenze wird geprueft, bevor ein Goal entsteht.
  'ROUNDS_UNGUELTIG',
  'ROUNDS_ZU_HOCH',
];

/**
 * Konfiguration (Schemastery).
 *
 * `sourceChannel` ist kein Geschmack: er benennt den Kanal, auf dem der
 * Enhancer seine validierten Datensaetze emittiert. `observeEvents` benennt den
 * DSH-Waterfall, an dem der lebende Agent sichtbar wird — ohne ihn gibt es
 * keine Zuordnung und damit keine Aktivierung (benannt, nicht still).
 */
export const Config = z.object({
  /** Kanal des Eingangs (der Datensatz des Enhancers). */
  sourceChannel: z.string().default(SOURCE_CHANNEL),
  /** Die Schwelle aus §16: ab diesem Gewicht ist eine Klasse ein Kandidat. */
  threshold: z.number().default(DEFAULT_THRESHOLD),
  /** Die Substanzgrenze in Zeichen des rohen Prompts. */
  minRawLength: z.number().default(DEFAULT_MIN_RAW_LENGTH),
  /**
   * Die Aktivierungsentscheidung aus §17. Default `false`: ein kopiertes Paket
   * erzeugt keine Goals und keine zusaetzlichen Runden. Das Profil setzt den
   * wirksamen Wert.
   */
  activate: z.boolean().default(false),
  /** Runden-Obergrenze fuer automatisch aktivierte Goals (Shinons Stop-Policy). */
  maxGoalRounds: z.number().default(DEFAULT_MAX_GOAL_ROUNDS),
  /** DSH-Event-Namen, über die sich der Router registriert (Wasserfall + Lifecycle). */
  observeEvents: z.array(z.string()).default([PRE_STEP_EVENT]),
  /** Entscheidungen protokollieren. */
  trace: z.boolean().default(true),
});

/**
 * Der Entscheidungs-Datensatz. `required()` ueberall: in Schemastery sind
 * Objekt-Schluessel optional, und ein fehlendes Feld saehe wie ein gueltiger
 * Datensatz aus. Ein Kandidat ohne Begruendung ist keiner.
 *
 * Getrennt gehalten: `reason` ist der Grund der ENTSCHEIDUNG, `activation` der
 * Grund der AKTIVIERUNG. Sie fallen auseinander, sobald die Policy den Schalter
 * aus hat oder kein lebender Agent bekannt ist — dann ist die Entscheidung
 * weiterhin `goal`, aber es wurde kein Goal erzeugt.
 */
export const DecisionSchema = z.object({
  contract: z.const(CONTRACT).required(),
  outcome: z.union([z.const('goal'), z.const('linear')]).required(),
  /** Die Klasse, die entschieden hat — leer, wenn es keine gab. */
  intent: z.string().required(),
  /** Gewicht der Klasse und die geltende Schwelle: die Rechnung ist nachpruefbar. */
  weight: z.number().required(),
  threshold: z.number().required(),
  /** Laenge des rohen Prompts und die geltende Substanzgrenze. */
  rawLength: z.number().required(),
  minRawLength: z.number().required(),
  /** Warum so entschieden wurde — kurz, maschinenlesbar, ohne Prompt-Text. */
  reason: z.string().min(1, 'reason darf nicht leer sein').required(),
  /** Ob ein DSH-Goal aktiviert wurde, und wenn nicht, warum nicht. */
  activated: z.boolean().required(),
  activation: z.string().min(1, 'activation darf nicht leer sein').required(),
  /** Identitaet des aktivierten Goals; leer, wenn keines entstand. */
  goalId: z.string().required(),
  /** Die geltende bzw. gesetzte Runden-Obergrenze. */
  maxGoalRounds: z.number().required(),
});


/**
 * Den lebenden Agenten und die Absicht eines Schritts vormerken. Ohne diese
 * Vormerkung gaebe es keine Zuordnung: der Datensatz des Enhancers traegt die
 * Sitzung, aber nicht den Agenten — und `ctx.goals` akzeptiert nur die exakte
 * Instanz der Registry, keine nachgebaute Identitaet.
 */
/** Ein Wert nur dann als Objekt behandeln — `null`, `undefined` und Skalare zaehlen als nichts. */
const objectOrNull = (value) => (value !== null && typeof value === 'object' ? value : null);

function readStep(payload) {
  const agent = objectOrNull(payload?.agent);
  const sessionId = typeof agent?.session?.id === 'string' ? agent.session.id : '';
  return {
    agent,
    sessionId,
    objective: readObjective(payload?.messages),
    turn: Number.isInteger(payload?.turn) ? payload.turn : null,
    step: Number.isInteger(payload?.step) ? payload.step : null,
  };
}

/**
 * Die vorgemerkte Sitzung zu diesem Datensatz nehmen — und wenn es keine gibt,
 * den GRUND nennen, nicht nur `null`.
 *
 * Zwei Aufloesungspolitiken, zwei benannte Ergebnisse: EXAKT ueber die Sitzung
 * des Datensatzes, oder — wenn der Datensatz keine nennt — die EINE eindeutige
 * Vormerkung. Eine Zuweisung nach Reihenfolge waere geraten, und ein geratenes
 * Goal ist schlimmer als keines; genau deshalb ist "mehrere vorgemerkt" ein
 * eigener Grund (STEP_AMBIGUOUS) und nicht dasselbe wie "kein lebender Agent".
 */
function takeStep(runtime, record) {
  const sessionId = typeof record?.session_id === 'string' ? record.session_id : '';
  if (sessionId !== '') {
    if (!runtime.pending.has(sessionId)) return { step: null, reason: 'NO_LIVE_AGENT' };
    const step = runtime.pending.get(sessionId) ?? null;
    runtime.pending.delete(sessionId);
    return { step, reason: step === null ? 'NO_LIVE_AGENT' : null };
  }
  if (runtime.pending.size !== 1) {
    return { step: null, reason: runtime.pending.size === 0 ? 'NO_LIVE_AGENT' : 'STEP_AMBIGUOUS' };
  }
  const [only] = runtime.pending.values();
  runtime.pending.clear();
  return { step: only ?? null, reason: only === null ? 'NO_LIVE_AGENT' : null };
}


/**
 * Einen Fehler der Goal-Domaene einordnen.
 *
 * Die Domaene wirft `GoalError` mit einem stabilen `code`; aus der installierten
 * Fassung gelesen sind das GOAL_AGENT_NOT_LIVE, GOAL_ALREADY_EXISTS,
 * GOAL_STALE_REVISION, GOAL_NOT_FOUND, GOAL_CHANGE_VERSION und GOAL_INVALID_*
 * (@deepseek-ai/dsh-goal). Ein Fehler MIT Code wird als Code gemeldet; ein
 * Fehler OHNE Code kommt nicht aus dieser Taxonomie und wird als `NAME:<Klasse>`
 * gemeldet. Vorher entschied `error?.code ?? error?.name ?? 'Error'`, und ein
 * fremder Fehler sah damit aus wie ein Code der Domaene.
 */
function classifyGoalError(error) {
  const code = error?.code;
  if (typeof code === 'string' && code !== '') return code;
  const name = error?.name;
  return typeof name === 'string' && name !== '' ? `NAME:${name}` : 'NAME:Unknown';
}

/**
 * Die Aktivierungsentscheidung aus §17: einen Goal-Kandidaten an DSHs
 * vorhandenen Goal-State uebergeben — oder es benannt lassen.
 *
 * Es gibt hier KEINE Schleife und keinen eigenen Zustand: `create` ist der
 * vorhandene Dienst, und die Runden faehrt DSHs Round-Driver. Wenn ein Goal
 * bereits existiert, wird es NICHT angetastet: die Absicht eines Menschen ist
 * keine Zufallsvariable, und ein automatischer Lauf darf sie nicht ueberschreiben.
 */
export function activateGoal(ctx, config, runtime, record) {
  if (config.activate !== true) return activationVerdict({ reason: 'ACTIVATION_DISABLED' });
  const found = takeStep(runtime, record);
  if (found.step === null) return activationVerdict({ reason: found.reason });
  const step = found.step;
  if (step.agent === null || step.objective === null) return activationVerdict({ reason: 'NO_LIVE_AGENT' });

  // `ctx.get` ist der dokumentierte Weg, einen Dienst OHNE Injektionszwang zu
  // lesen. Absicht: die Entscheidung aus §16 darf nicht davon abhaengen, ob eine
  // Goal-Domaene gemountet ist — sonst waere der Router in einem Profil ohne
  // Goals gar nicht erst geladen.
  const goals = typeof ctx?.get === 'function' ? ctx.get(GOAL_SERVICE) : undefined;
  if (typeof goals?.create !== 'function') {
    // Einmal laut, danach still: eine fehlende Goal-Domaene ist ein Befund, aber
    // kein Grund, jeden Schritt zu wiederholen.
    if (runtime.warnedNoService !== true) {
      runtime.warnedNoService = true;
      console.warn(`[shinon-task-router] Dienst "${GOAL_SERVICE}" nicht verfuegbar — Kandidaten bleiben Entscheidungen ohne Goal`);
    }
    return activationVerdict({ reason: 'NO_GOAL_SERVICE' });
  }

  // Zwei Aufrufe, zwei Erholungen: ein werfender `get` heisst "der Agent ist
  // nicht der lebende dieser Registry" (also: nicht erzeugen), ein werfender
  // `create` heisst "DSH hat den Versuch abgelehnt" (also: der Versuch bleibt
  // sichtbar). Deshalb zwei Bloecke mit je eigenem Grund, aber EINER Einordnung.
  let current;
  try {
    current = typeof goals.get === 'function' ? goals.get(step.agent) : undefined;
  } catch (error) {
    return activationVerdict({ reason: `GOAL_ERROR:${classifyGoalError(error)}` });
  }
  if (current !== undefined && current !== null) return activationVerdict({ reason: `GOAL_EXISTS:${current?.phase ?? 'unknown'}` });

  // Die Fortsetzung ist begrenzt, und die Grenze wird GEPRUEFT statt gesendet.
  // Ein unbrauchbarer Wert ist ein benannter Befund; ein zu grosser wird nicht
  // still gekappt, sonst behauptet der Datensatz spaeter eine andere Zahl als
  // die, mit der DSH laeuft.
  const budget = goalRoundsVerdict(config.maxGoalRounds);
  if (!budget.ok) {
    if (config.trace) console.warn(`[shinon-task-router] Goal NICHT aktiviert (${budget.reason}: ${config.maxGoalRounds} > ${MAX_GOAL_ROUNDS_CEILING}) — linearer Turn bleibt`);
    return activationVerdict({ reason: budget.reason });
  }

  try {
    const view = goals.create(step.agent, { objective: step.objective, maxGoalRounds: budget.rounds });
    const goalId = typeof view?.id === 'string' ? view.id : '';
    const rounds = Number.isFinite(view?.maxGoalRounds) ? view.maxGoalRounds : budget.rounds;
    if (config.trace) console.log(`[shinon-task-router] Goal aktiviert (${goalId}, max ${rounds} Runden) — Runden faehrt DSH`);
    return activationVerdict({ activated: true, reason: 'ACTIVATED', goalId, maxGoalRounds: rounds });
  } catch (error) {
    const code = classifyGoalError(error);
    if (config.trace) console.warn(`[shinon-task-router] Goal NICHT aktiviert (${code}) — linearer Turn bleibt`);
    return activationVerdict({ reason: `GOAL_ERROR:${code}` });
  }
}



/**
 * Den eingehenden Datensatz entscheiden und melden.
 *
 * Was hier NICHT passiert: keine Aenderung an Goal-State ausser dem einen
 * `create` (das DSH selbst besitzt), kein Schreiben irgendwohin sonst. Die
 * Runden, die Dauerhaftigkeit und der Abbruch bei Fehlern sind DSHs Sache.
 */
function onDecision(ctx, config, runtime, record) {
  const decision = decide(record, config);
  const activation = decision.goal ? activateGoal(ctx, config, runtime, record) : activationVerdict({ reason: 'LINEAR_TURN' });
  if (config.trace && !decision.goal) console.log(`[shinon-task-router] linearer Turn (${decision.reason})`);
  // Der Kandidat ist die interessantere Haelfte — und er war STUMM: mit
  // `activate: false` entsteht kein Goal, und im Protokoll stand darueber
  // nichts. GEMESSEN (2026-10-23, echter Turn im Profil shinon): „Implementiere
  // … und schreibe einen Test dafuer" ergab `intent=MULTI_STEP_TASK`; der Router
  // meldete weder Kandidat noch `ACTIVATION_DISABLED` (0 Treffer im Lauf),
  // auffindbar war nur die Gegenprobe „linearer Turn". Eine Entscheidung, die
  // ihren Ausgang nicht nennt, ist nicht nachpruefbar — §16 verspricht das
  // Gegenteil.
  else if (config.trace) console.log(`[shinon-task-router] Goal-Kandidat (${decision.reason}) — Aktivierung: ${activation.reason}`);
  try {
    const emitted = DecisionSchema(buildDecision(decision, activation));
    if (typeof ctx?.emit === 'function') ctx.emit(DECISION_CHANNEL, emitted);
  } catch (error) {
    // Fail-closed fuer den DATENSATZ: ein ungueltiger Datensatz verlaesst uns nicht.
    console.warn(`[shinon-task-router] Entscheidung verworfen (${error?.message})`);
  }
}

/**
 * Registriert den Router. Ohne `ctx.on` wird nicht registriert — das wird
 * gemeldet, nicht verschwiegen.
 *
 * Drei Listener, jeder mit einer Aufgabe: der Wasserfall merkt Agent und Absicht
 * vor, der Enhancer-Kanal entscheidet, das Lifecycle-Ereignis raeumt weg, was
 * nicht mehr lebt. Keiner davon kann den Schritt mitreissen: `decide` ist total,
 * die Aktivierung faengt jeden Fehler, und `next()` wird unveraendert
 * durchgereicht (Fehler des Downstream sind NICHT unsere).
 */
// TODO: [DSH-Refactor] - 55 Zeilen Mount mit drei Registrierungen, Dienst-Angebot und Log in einem Rumpf; die Abmeldung spiegelt sie von Hand (dieselbe Anzahl Klammern, kein gemeinsamer Nenner). Je eine benannte Paar-Funktion fuer Registrierung und Abmeldung, damit ein neuer Listener nicht vergessen werden kann.
export function apply(ctx, config) {
  const bus = createOrchestrator(ctx, { owner: 'task-router' });
  if (typeof ctx?.on !== 'function') {
    console.error(`[shinon-task-router] ctx.on fehlt — ${config.sourceChannel} wurde NICHT beobachtet (BLOCKED)`);
    return () => {};
  }

  const runtime = { pending: new Map() };
  const disposers = [];

  if (config.observeEvents.includes(PRE_STEP_EVENT)) {
    disposers.push(bus.route(PRE_STEP_EVENT, (payload, next) => {
      const step = readStep(payload);
      if (step.sessionId !== '') runtime.pending.set(step.sessionId, step);
      return next();
    }));
  } else {
    console.log(`[shinon-task-router] ${PRE_STEP_EVENT} nicht in observeEvents — ohne lebenden Agenten wird kein Goal aktiviert`);
  }

  disposers.push(bus.route(config.sourceChannel, (record) => onDecision(ctx, config, runtime, record)));
  disposers.push(bus.route(DISPOSED_EVENT, ({ agent } = {}) => {
    const sessionId = typeof agent?.session?.id === 'string' ? agent.session.id : '';
    if (sessionId !== '') runtime.pending.delete(sessionId);
  }));

  // §18: die Projektion wird ANGEBOTEN, nicht gespeichert — genau EIN provide,
  // ohne eigenen Zustand und ohne zusätzlichen Listener. Ein Host ohne
  // `provide` ist kein Fehler des Laufs (dieselbe Haltung wie beim Query-Dienst
  // des Project Index); er bekommt die Aussage in derselben Aktivierungszeile.
  const microState = createMicroStateService(ctx);
  const releaseMicroState = bus.provide(MICRO_STATE_SERVICE, microState);
  const microStateInfo = releaseMicroState !== null
    ? `Projektion ${MICRO_STATE_SERVICE} bereitgestellt (${MICRO_STATE_CONTRACT})`
    : `Projektion ${MICRO_STATE_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`;

  // Der Abnehmer der Projektion (Audit-Konflikt #23, „tote Dienstfläche"): ein
  // Modell-Werkzeug, das `state(agent)` auf DEMSELBEN Dienstobjekt ruft. Es
  // hält keinen Zustand — jeder Aufruf liest frisch aus `ctx.goals`, die
  // Leseoperation bleibt Eigentum der Projektion. `output` (`schema` + `render`)
  // ist Pflicht, sonst verweigert `tools.register`; ohne `tools`-Dienst bleibt
  // die Projektion angeboten und die Zeile nennt den Grund.
  const microStateTool = createMicroStateTool(microState);
  const microStateToolAsked = bus.demand(['tools'], (child) => {
    child.tools.register(microStateTool);
  });
  console.log(
    `[shinon-task-router] Werkzeug ${microStateTool.name} ${microStateToolAsked ? 'registriert' : 'NICHT registriert (kein tools-Dienst)'} (Vertrag ${MICRO_STATE_CONTRACT})`,
  );

  // Der Dienst wird NICHT hier gesucht, sondern je Entscheidung. Grund, im
  // echten Boot gemessen: DSH stellt die Goal-Domaene erst NACH unseren
  // Bundle-Layern bereit — ein Sichtbarkeitscheck beim Mounten waere eine
  // Aussage ueber den falschen Zeitpunkt (er meldete "nicht sichtbar", obwohl
  // die Domaene im Profil aktiv ist). Ein `inject: ['goals']` waere die andere
  // Loesung, kostet aber §16: der Router waere in einem Profil ohne Goal-Domaene
  // gar nicht geladen. Deshalb: kein Zwang, dafuer eine benannte Warnung, wenn
  // zur Entscheidung wirklich kein Dienst da ist.
  const goalInfo = config.activate ? `goal=an (max ${config.maxGoalRounds} Runden)` : 'goal=aus (nur Entscheidung)';
  console.log(
    `[shinon-task-router] Aktiviert — beobachtet ${config.sourceChannel} (threshold=${config.threshold}, minRawLength=${config.minRawLength}, ${goalInfo}, trace=${config.trace ? 'an' : 'aus'}, ${microStateInfo})`,
  );

  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose();
    if (typeof releaseMicroState === 'function') releaseMicroState();
    runtime.pending.clear();
    console.log('[shinon-task-router] Deaktiviert — Listener abgemeldet');
  };
}
