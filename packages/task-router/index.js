import z from '@deepseek-ai/schemastery';

/**
 * shinon-task-router — Phase 5/6, Plan §16 und §17.
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
 *   * Progress-Auswertung ......... NICHT hier (§18 loop-guard)
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

/** Vertragsname der Router-Entscheidung. */
export const CONTRACT = 'shinon.task-router/decision-v1';

/**
 * Der Eingang: der Provenienz-Datensatz des Prompt-Enhancers (§16: „das LLM
 * liefert eine Klassifikation" — ein VALIDIERTER Datensatz, kein Rohtext).
 *
 * Der Vertragsname steht hier als eigene Konstante statt als Import: die Pakete
 * dieses Repos referenzieren einander nicht. Dass beide denselben Namen fuehren,
 * pinnt ein Abnahmetest — eine Abweichung wird dort rot, nicht still.
 */
export const SOURCE_CHANNEL = 'shinon/prompter/decision';
export const SOURCE_CONTRACT = 'shinon.prompter/result-v1';

/** Der Ausgang: die Entscheidung als Datensatz. */
export const DECISION_CHANNEL = 'shinon/task-router/decision';

/** DSH-Waterfall, an dem der LEBENDE Agent sichtbar wird (Name verifiziert). */
export const PRE_STEP_EVENT = 'agent/pre-step';

/** Lifecycle-Ereignis, nach dem eine vorgemerkte Sitzung nicht mehr lebt. */
export const DISPOSED_EVENT = 'agent/disposed';

/** Der Dienstname der Goal-Domaene in `ctx.goals`. */
export const GOAL_SERVICE = 'goals';

/**
 * Das geschlossene Vokabular aus §16, wortgleich mit dem Enhancer. Eine Klasse
 * ausserhalb dieser Liste ist keine Klassifikation, sondern Text.
 */
export const INTENT_CLASSES = ['CHAT', 'LOOKUP', 'TRANSFORM', 'MULTI_STEP_TASK', 'LONG_RUNNING_GOAL'];

/**
 * Gewicht je Klasse — DATEN. §16 nennt fuer CHAT, LOOKUP und TRANSFORM einen
 * linearen Turn und fuer MULTI_STEP_TASK und LONG_RUNNING_GOAL einen
 * Goal-Kandidaten; diese Tabelle IST diese Aussage, in Zahlen.
 *
 * LONG_RUNNING_GOAL wiegt hoeher als MULTI_STEP_TASK, damit eine Schwelle
 * oberhalb von 2 den Mehrschritt-Auftrag zurueckstufen kann, ohne auch die
 * langfristige Absicht zu verlieren — sonst gaebe es nur "alles oder nichts".
 */
export const INTENT_WEIGHTS = {
  CHAT: 0,
  LOOKUP: 0,
  TRANSFORM: 0,
  MULTI_STEP_TASK: 2,
  LONG_RUNNING_GOAL: 3,
};

/** Die Schwelle aus §16 („der konkrete Schwellenwert ... als Runtime-Policy"). */
export const DEFAULT_THRESHOLD = 2;

/**
 * Die Substanzgrenze in ZEICHEN des rohen Prompts.
 *
 * Bewusst eine Zeichenzahl und keine Sprachanalyse: ein Detektor, der Auftraege
 * "versteht", waere eine zweite Klassifikation neben der ersten. Eine Grenze auf
 * die LANGE ist grob, deterministisch und nachpruefbar — und sie kann nur
 * zurueckstufen. Der konkrete Wert ist eine Entscheidung (im Profil sichtbar),
 * keine Wahrheit.
 */
export const DEFAULT_MIN_RAW_LENGTH = 24;

/**
 * Die Runden-Obergrenze eines automatisch aktivierten Goals — SHINONS
 * Stop-Policy.
 *
 * DSH selbst erlaubt 256 Runden (`defaultMaxGoalRounds: 256` in der
 * installierten Fassung). Das ist eine Obergrenze gegen Endlosigkeit, keine
 * Kostenbremse: eine Runde ist ein vollstaendiger Agentenschritt mit
 * Modellaufrufen. Der Wert hier ist deshalb klein und bewusst eine Entscheidung
 * im Profil — und die Blockade am Limit macht DSH selbst (`round-limit`).
 */
export const DEFAULT_MAX_GOAL_ROUNDS = 6;

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
  'NO_GOAL_SERVICE',
  'GOAL_EXISTS',
  'GOAL_ERROR',
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
 * Die Entscheidung. Reine Funktion: dieselbe Eingabe und dieselbe Konfiguration
 * ergeben dieselbe Ausgabe — es gibt keinen Zustand, keine Uhr, kein Netz.
 *
 * Die Reihenfolge der Pruefungen ist die Fail-Richtung: erst die HERKUNFT
 * (fremder Datensatz -> nichts), dann das VOKABULAR, dann die SCHWELLE, dann die
 * SUBSTANZ. Jede Stufe nennt ihren Grund, weil eine Entscheidung, die ihren
 * Grund verschweigt, nicht nachpruefbar ist.
 */
export function decide(record, config = {}) {
  const threshold = Number.isFinite(config.threshold) ? config.threshold : DEFAULT_THRESHOLD;
  const minRawLength = Number.isFinite(config.minRawLength) ? config.minRawLength : DEFAULT_MIN_RAW_LENGTH;
  const verdict = (goal, reason, parts = {}) => ({
    goal,
    reason,
    intent: parts.intent ?? '',
    weight: parts.weight ?? 0,
    threshold,
    rawLength: parts.rawLength ?? 0,
    minRawLength,
  });

  if (record === null || typeof record !== 'object') return verdict(false, 'NO_RECORD');
  if (record.contract !== SOURCE_CONTRACT) return verdict(false, 'FOREIGN_RECORD', { intent: typeof record.intentClassification === 'string' ? record.intentClassification : '' });

  const intent = record.intentClassification;
  if (typeof intent !== 'string' || intent === '') return verdict(false, 'NO_CLASSIFICATION');
  if (!INTENT_CLASSES.includes(intent)) return verdict(false, `UNKNOWN_CLASS:${intent}`);

  // Ab hier gibt es eine GUELTIGE Klasse. Ob sie einen Kandidaten traegt,
  // entscheidet die Policy — nicht das Etikett.
  const weight = INTENT_WEIGHTS[intent] ?? 0;
  if (weight < threshold) return verdict(false, `BELOW_THRESHOLD:${weight}<${threshold}`, { intent, weight });
  if (!(weight > 0)) return verdict(false, 'NO_GOAL_WEIGHT', { intent, weight });

  // Eine Laenge ist keine Zahl, die negativ sein kann: was nicht als positive
  // Zahl gemessen wurde, gilt als "nicht gemessen" (0) und damit als zu kurz.
  // Die Richtung ist bewusst streng — die Alternative waere, einer unbrauchbaren
  // Angabe Zieltauglichkeit zuzusprechen.
  const measured = record.rawLength;
  const rawLength = Number.isFinite(measured) && measured > 0 ? measured : 0;
  if (rawLength < minRawLength) return verdict(false, `BELOW_MIN_RAW_LENGTH:${rawLength}<${minRawLength}`, { intent, weight, rawLength });

  return verdict(true, `GOAL_CANDIDATE:${intent}`, { intent, weight, rawLength });
}

/**
 * Die ABSICHT aus den Nachrichten des Schritts lesen: die letzte MENSCHLICHE
 * Nachricht mit Text — genau die Regel, die auch der Enhancer anwendet
 * (`source.kind === 'user'`; DSH setzt den Marker selbst fuer Eingaben von
 * UI/API/headless, waehrend erzeugter Harness-Kontext ihn nicht traegt).
 *
 * Eine Absicht aus Harness-Text zu bilden waere ein Fremdauftrag: dann liefe ein
 * Goal auf „Kontext: du hast 3 neue Werkzeugergebnisse".
 */
export function readObjective(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (message?.role !== 'user') continue;
    if (message.source?.kind !== 'user') continue;
    const text = (Array.isArray(message.content) ? message.content : [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim();
    if (text !== '') return text;
  }
  return null;
}

/**
 * Den lebenden Agenten und die Absicht eines Schritts vormerken. Ohne diese
 * Vormerkung gaebe es keine Zuordnung: der Datensatz des Enhancers traegt die
 * Sitzung, aber nicht den Agenten — und `ctx.goals` akzeptiert nur die exakte
 * Instanz der Registry, keine nachgebaute Identitaet.
 */
function readStep(payload) {
  const agent = payload?.agent !== null && typeof payload?.agent === 'object' ? payload.agent : null;
  const sessionId = typeof agent?.session?.id === 'string' ? agent.session.id : '';
  return {
    agent,
    sessionId,
    objective: readObjective(payload?.messages),
    turn: Number.isInteger(payload?.turn) ? payload.turn : null,
    step: Number.isInteger(payload?.step) ? payload.step : null,
  };
}

/** Die vorgemerkte Sitzung zu diesem Datensatz — exakt, sonst gar nicht. */
function takeStep(runtime, record) {
  const sessionId = typeof record?.session_id === 'string' ? record.session_id : '';
  if (sessionId !== '') {
    const step = runtime.pending.get(sessionId);
    runtime.pending.delete(sessionId);
    return step ?? null;
  }
  // Ohne Sitzung im Datensatz bleibt nur die EINE eindeutige Vormerkung. Bei
  // mehreren waere die Zuordnung geraten, und ein geratener Goal ist schlimmer
  // als keiner.
  if (runtime.pending.size !== 1) return null;
  const [only] = runtime.pending.values();
  runtime.pending.clear();
  return only ?? null;
}

const activationVerdict = (activated, reason, goalId = '', maxGoalRounds = 0) => ({
  activated,
  reason,
  goalId,
  maxGoalRounds,
});

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
  if (config.activate !== true) return activationVerdict(false, 'ACTIVATION_DISABLED');
  const step = takeStep(runtime, record);
  if (step === null || step.agent === null) return activationVerdict(false, 'NO_LIVE_AGENT');
  if (step.objective === null) return activationVerdict(false, 'NO_LIVE_AGENT');

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
    return activationVerdict(false, 'NO_GOAL_SERVICE');
  }

  try {
    const current = typeof goals.get === 'function' ? goals.get(step.agent) : undefined;
    if (current !== undefined && current !== null) return activationVerdict(false, `GOAL_EXISTS:${current?.phase ?? 'unknown'}`);
  } catch (error) {
    // Ein werfender `get` heisst: der Agent ist nicht der lebende dieser Registry.
    return activationVerdict(false, `GOAL_ERROR:${error?.code ?? error?.name ?? 'Error'}`);
  }

  try {
    const view = goals.create(step.agent, { objective: step.objective, maxGoalRounds: config.maxGoalRounds });
    const goalId = typeof view?.id === 'string' ? view.id : '';
    const rounds = Number.isFinite(view?.maxGoalRounds) ? view.maxGoalRounds : config.maxGoalRounds;
    if (config.trace) console.log(`[shinon-task-router] Goal aktiviert (${goalId}, max ${rounds} Runden) — Runden faehrt DSH`);
    return activationVerdict(true, 'ACTIVATED', goalId, rounds);
  } catch (error) {
    const code = error?.code ?? error?.name ?? 'Error';
    if (config.trace) console.warn(`[shinon-task-router] Goal NICHT aktiviert (${code}) — linearer Turn bleibt`);
    return activationVerdict(false, `GOAL_ERROR:${code}`);
  }
}

/** Aus der Entscheidung und der Aktivierung den Datensatz bauen. */
export function buildDecision(decision, activation = activationVerdict(false, 'LINEAR_TURN')) {
  return {
    contract: CONTRACT,
    outcome: decision.goal ? 'goal' : 'linear',
    intent: decision.intent,
    weight: decision.weight,
    threshold: decision.threshold,
    rawLength: decision.rawLength,
    minRawLength: decision.minRawLength,
    reason: decision.reason,
    activated: activation.activated,
    activation: activation.reason,
    goalId: activation.goalId,
    maxGoalRounds: activation.maxGoalRounds,
  };
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
  const activation = decision.goal ? activateGoal(ctx, config, runtime, record) : activationVerdict(false, 'LINEAR_TURN');
  if (config.trace && !decision.goal) console.log(`[shinon-task-router] linearer Turn (${decision.reason})`);
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
export function apply(ctx, config) {
  if (typeof ctx?.on !== 'function') {
    console.error(`[shinon-task-router] ctx.on fehlt — ${config.sourceChannel} wurde NICHT beobachtet (BLOCKED)`);
    return () => {};
  }

  const runtime = { pending: new Map() };
  const disposers = [];

  if (config.observeEvents.includes(PRE_STEP_EVENT)) {
    disposers.push(ctx.on(PRE_STEP_EVENT, (payload, next) => {
      const step = readStep(payload);
      if (step.sessionId !== '') runtime.pending.set(step.sessionId, step);
      return next();
    }));
  } else {
    console.log(`[shinon-task-router] ${PRE_STEP_EVENT} nicht in observeEvents — ohne lebenden Agenten wird kein Goal aktiviert`);
  }

  disposers.push(ctx.on(config.sourceChannel, (record) => onDecision(ctx, config, runtime, record)));
  disposers.push(ctx.on(DISPOSED_EVENT, ({ agent } = {}) => {
    const sessionId = typeof agent?.session?.id === 'string' ? agent.session.id : '';
    if (sessionId !== '') runtime.pending.delete(sessionId);
  }));

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
    `[shinon-task-router] Aktiviert — beobachtet ${config.sourceChannel} (threshold=${config.threshold}, minRawLength=${config.minRawLength}, ${goalInfo}, trace=${config.trace ? 'an' : 'aus'})`,
  );

  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose();
    runtime.pending.clear();
    console.log('[shinon-task-router] Deaktiviert — Listener abgemeldet');
  };
}
