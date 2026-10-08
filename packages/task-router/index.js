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

// Die Gleichheit ist GEPINNT, nicht nur behauptet: scripts/gate/tests/task-router.test.mjs
// laedt beide Pakete und vergleicht INTENT_CLASSES, SOURCE_CONTRACT und SOURCE_CHANNEL
// gegen die echten Werte des Enhancers — eine Abweichung wird dort rot, nicht still.
// Eine dritte Quelle gibt es bewusst nicht: Pakete dieses Repos importieren einander nicht,
// und eine Datei ausserhalb der Pakete reist nicht im Artefakt mit (`pnpm pack`).
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
  // Eigener Grund, seit er es ist: bei mehreren vorgemerkten Sitzungen und einem
  // Datensatz ohne Sitzung waere die Zuordnung geraten. Das ist NICHT "kein
  // lebender Agent" (es sind zwei), sondern "keine eindeutige Zuordnung".
  'STEP_AMBIGUOUS',
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
 * SUBSTANZ. Sie steht in DECISION_RULES, untereinander statt hintereinander.
 * Jede Stufe nennt ihren Grund, weil eine Entscheidung, die ihren Grund
 * verschweigt, nicht nachpruefbar ist.
 */
/**
 * Die Regeln als TABELLE: die erste Zeile, deren `when` zutrifft, entscheidet.
 * Jede Zeile bringt ihren Grund UND die Felder mit, die in den Datensatz
 * gehoeren — ein neuer Grund ist damit eine Datenzeile, und die Fail-Reihenfolge
 * ist eine Liste statt einer sechsstufigen if-Leiter mit lokaler Closure.
 *
 * Die letzte Zeile trifft immer: sie ist der Kandidat.
 */
const DECISION_RULES = [
  { goal: false, when: (f) => f.record === null || typeof f.record !== 'object', reason: () => 'NO_RECORD', fields: () => ({}) },
  { goal: false, when: (f) => f.record.contract !== SOURCE_CONTRACT, reason: () => 'FOREIGN_RECORD', fields: (f) => ({ intent: f.intent }) },
  { goal: false, when: (f) => f.intent === '', reason: () => 'NO_CLASSIFICATION', fields: (f) => ({ intent: f.intent }) },
  { goal: false, when: (f) => !INTENT_CLASSES.includes(f.intent), reason: (f) => `UNKNOWN_CLASS:${f.intent}`, fields: (f) => ({ intent: f.intent }) },
  { goal: false, when: (f) => f.weight < f.threshold, reason: (f) => `BELOW_THRESHOLD:${f.weight}<${f.threshold}`, fields: (f) => ({ intent: f.intent, weight: f.weight }) },
  { goal: false, when: (f) => !(f.weight > 0), reason: () => 'NO_GOAL_WEIGHT', fields: (f) => ({ intent: f.intent, weight: f.weight }) },
  { goal: false, when: (f) => f.rawLength < f.minRawLength, reason: (f) => `BELOW_MIN_RAW_LENGTH:${f.rawLength}<${f.minRawLength}`, fields: (f) => ({ intent: f.intent, weight: f.weight, rawLength: f.rawLength }) },
  { goal: true, when: () => true, reason: (f) => `GOAL_CANDIDATE:${f.intent}`, fields: (f) => ({ intent: f.intent, weight: f.weight, rawLength: f.rawLength }) },
];

/**
 * Die Tatsachen EINMAL messen: Schwelle, Substanzgrenze und die aus dem Datensatz
 * gelesenen Werte. Eine Laenge ist keine Zahl, die negativ sein kann: was nicht
 * als positive Zahl gemessen wurde, gilt als "nicht gemessen" (0) und damit als
 * zu kurz. Die Richtung ist bewusst streng — die Alternative waere, einer
 * unbrauchbaren Angabe Zieltauglichkeit zuzusprechen.
 */
function decisionFacts(record, config) {
  const threshold = Number.isFinite(config.threshold) ? config.threshold : DEFAULT_THRESHOLD;
  const minRawLength = Number.isFinite(config.minRawLength) ? config.minRawLength : DEFAULT_MIN_RAW_LENGTH;
  const intent = typeof record?.intentClassification === 'string' ? record.intentClassification : '';
  const measured = record?.rawLength;
  return {
    record,
    threshold,
    minRawLength,
    intent,
    weight: INTENT_WEIGHTS[intent] ?? 0,
    rawLength: Number.isFinite(measured) && measured > 0 ? measured : 0,
  };
}

export function decide(record, config = {}) {
  const facts = decisionFacts(record, config);
  const rule = DECISION_RULES.find((candidate) => candidate.when(facts));
  const fields = rule.fields(facts);
  return {
    goal: rule.goal,
    reason: rule.reason(facts),
    intent: fields.intent ?? '',
    weight: fields.weight ?? 0,
    threshold: facts.threshold,
    rawLength: fields.rawLength ?? 0,
    minRawLength: facts.minRawLength,
  };
}

// #region zwilling:letzte-menschliche-nachricht — Besitzer: packages/prompter/index.js
/**
 * Die letzte MENSCHLICHE Nachricht mit Text — oder null.
 *
 * `source.kind === 'user'` ist der Unterschied zwischen Eingabe und Harness: der
 * Batch eines Schritts besteht oft AUSSCHLIESSLICH aus erzeugtem Kontext (Zeit,
 * Terminal, Instruktionen, Erinnerungen, Werkzeug-Feedback). Ohne diesen Test
 * waere die jeweils letzte Nachricht irgendein Harness-Text — und der wuerde
 * veredelt und ersetzt (Enhancer) bzw. als Auftrag gelesen (Router). Fremde
 * Herkunft heisst deshalb: nicht anfassen.
 *
 * Die Nachricht kommt MIT zurueck, weil ein Aufrufer sie ueber ihre Identitaet
 * wiederfinden muss — ueber einen Index zu raten waere ein stiller Fehler. Der
 * Text ist UNGETRIMMT; was ein Aufrufer davon will, entscheidet er.
 */
function lastHumanMessage(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (message?.role !== 'user') continue;
    if (message.source?.kind !== 'user') continue;
    const text = (Array.isArray(message.content) ? message.content : [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
    if (text.trim() === '') continue;
    return { message, text, index };
  }
  return null;
}
// #endregion zwilling:letzte-menschliche-nachricht

/**
 * Die ABSICHT aus den Nachrichten des Schritts lesen: der getrimmte Text der
 * letzten menschlichen Nachricht. Die Regel selbst steht in der Zwillings-Region
 * darueber — bytegleich mit @shinon/prompter, geprueft von `scripts/lib/repo.mjs`
 * (SOURCE_TWINS) im Gate und im Build. Hier bleibt nur, was der Router daraus
 * macht: eine Absicht aus Harness-Text waere ein Fremdauftrag, dann liefe ein Goal
 * auf „Kontext: du hast 3 neue Werkzeugergebnisse".
 */
export function readObjective(messages) {
  const hit = lastHumanMessage(messages);
  return hit === null ? null : hit.text.trim();
}

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
 * Das Ergebnis einer Aktivierung — benannte Felder statt vier Positionsargumente,
 * die an der Aufrufstelle wie ein Zweitupel aussahen (`activationVerdict(false,
 * 'LINEAR_TURN')`: gemeint sind `activated` und `reason`).
 */
const activationVerdict = ({ activated = false, reason, goalId = '', maxGoalRounds = 0 }) => ({
  activated,
  reason,
  goalId,
  maxGoalRounds,
});

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

  try {
    const view = goals.create(step.agent, { objective: step.objective, maxGoalRounds: config.maxGoalRounds });
    const goalId = typeof view?.id === 'string' ? view.id : '';
    const rounds = Number.isFinite(view?.maxGoalRounds) ? view.maxGoalRounds : config.maxGoalRounds;
    if (config.trace) console.log(`[shinon-task-router] Goal aktiviert (${goalId}, max ${rounds} Runden) — Runden faehrt DSH`);
    return activationVerdict({ activated: true, reason: 'ACTIVATED', goalId, maxGoalRounds: rounds });
  } catch (error) {
    const code = classifyGoalError(error);
    if (config.trace) console.warn(`[shinon-task-router] Goal NICHT aktiviert (${code}) — linearer Turn bleibt`);
    return activationVerdict({ reason: `GOAL_ERROR:${code}` });
  }
}

/** Aus der Entscheidung und der Aktivierung den Datensatz bauen. */
export function buildDecision(decision, activation = activationVerdict({ reason: 'LINEAR_TURN' })) {
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

// ── §18: Goal Micro-State — die zusätzliche Projektion ────────────────────

/** Vertragsname der Micro-State-Projektion (Plan §18). */
export const MICRO_STATE_CONTRACT = 'shinon.task-router/micro-state-v1';

/**
 * Der Dienstname der Projektion — die Naht für alle, die den Zustand LESEN
 * wollen, ohne dieses Paket zu importieren (Pakete referenzieren einander
 * nicht; §19 wird dieselbe Regel brauchen wie die Naht des Enhancers).
 */
export const MICRO_STATE_SERVICE = 'shinon_goal_micro_state';

/**
 * Die fünf Felder aus §18 — wortgleich und in der Reihenfolge des Plans.
 * Genau diese fünf: der Datensatz ist EINE Momentaufnahme. Was nicht hier
 * steht (Zeitstempel, Rundenliste, Nachrichten, Verlauf), darf die
 * Projektion auch nicht mit sich führen — sonst wäre sie die zweite
 * Session-Historie, die §18 ausdruecklich verbietet.
 */
export const MICRO_STATE_FIELDS = [
  'OBJECTIVE',
  'CURRENT_STATE',
  'LAST_VERIFIED_FACT',
  'CURRENT_BLOCKER',
  'NEXT_ACTION',
];

/**
 * Zustaende, die NICHT aus einer DSH-Phase stammen — die zwei Aussagen, die
 * man nicht verwechseln darf: `NO_GOAL` heisst „autoritativ kein Ziel da“
 * (der Dienst antwortete mit nichts), `UNAVAILABLE` heisst „kein autoritativer
 * Zustand lesbar“ (Dienst fehlt, Lesen wirft, Zustand kaputt). Eine
 * Lesefehler zu `NO_GOAL` zu machen, waere eine Existenzaussage aus einem
 * Werkzeugfehler — genau die Verwechselung, die §18 mit seinem
 * Autoritativitaets-Satz verhindert.
 */
export const MICRO_NO_GOAL = 'NO_GOAL';
export const MICRO_UNAVAILABLE = 'UNAVAILABLE';

/**
 * NEXT_ACTION als DATEN — Beratung, nie eine Aktion.
 *
 * Jeder Wert benennt, was als NAECHSTES zu erwarten bzw. zu tun waere; die
 * Projektion fuehrt keinen davon aus, und es gibt im Paket keinen Code, der
 * diesen Wert liest, um zu handeln. Die einzige Schreibstelle an Goal-State
 * bleibt `create` in activateGoal (§17). Die Tabelle ist eine Entscheidung,
 * keine Wahrheit — sie steht deshalb hier als Daten und nicht als Verzweigung.
 *
 *   NO_GOAL / UNAVAILABLE . NONE — nichts zu erinnern bzw. nichts zu raten
 *   active:armed ......... ROUND — die naechste Runde reserviert DSHs
 *                            Round-Driver, nicht wir (§17)
 *   active:disarmed ...... NONE — der Prozess darf nicht automatisch
 *                            weiterfahren; eine Weiterfahrt waere DSHs
 *                            Angelegenheit, keine unsere
 *   paused ............... RESUME — Fortsetzen ist ein Befehl an DSH
 *   blocked .............. HUMAN — die Blockade heben WIR NICHT selbst
 *                            (§17 Block-Policy: nicht ueberschreiben)
 *   complete ............. NONE — die Absicht ist erfuellt
 *   unbekannte Phase ..... NONE — fail-closed: wer die Phase nicht kennt,
 *                            empfiehlt nichts (die Phase selbst wird
 *                            trotzdem gespiegelt, sie ist autoritativ)
 */
export const NEXT_ACTIONS = {
  [MICRO_NO_GOAL]: 'NONE',
  [MICRO_UNAVAILABLE]: 'NONE',
  'active:armed': 'ROUND',
  'active:disarmed': 'NONE',
  paused: 'RESUME',
  blocked: 'HUMAN',
  complete: 'NONE',
};

/**
 * Der Datensatz der Projektion: Umschlag plus die fuenf Felder aus §18.
 * `required()` ueberall — ein fehlendes Feld saehe wie ein gueltiger Zustand
 * aus, und ein Micro-State ohne NEXT_ACTION ist keine Momentaufnahme.
 */
export const MicroStateSchema = z.object({
  contract: z.const(MICRO_STATE_CONTRACT).required(),
  OBJECTIVE: z.string().required(),
  CURRENT_STATE: z.string().required(),
  LAST_VERIFIED_FACT: z.string().required(),
  CURRENT_BLOCKER: z.string().required(),
  NEXT_ACTION: z.string().required(),
});

/**
 * Die Empfehlung, wenn die Tabelle den Schluessel nicht kennt: NONE — wer die
 * Phase nicht kennt, empfiehlt nichts (fail-closed) —, aber BENANNT und einmal
 * je Schluessel gemeldet. Vorher degradierte `?? 'NONE'` still: eine unbekannte
 * Phase oder ein unbekannter Armierungsstand sah aus wie "nichts zu tun".
 *
 * Der Merker ist kein Zustand des Laufs, sondern eine Log-Bremse (je Schluessel
 * eine Zeile, begrenzt durch die Zahl der verschiedenen Schluessel).
 */
const UNKNOWN_ADVICE = 'NONE';
const reportedUnknownAdvice = new Set();

/** Die Beratung aus der Tabelle — unbekannt kostet eine Empfehlung, nie die Wahrheit. */
export function nextActionFor(state, activation = '') {
  const key = state === 'active' ? `active:${activation}` : state;
  const advice = NEXT_ACTIONS[key];
  if (advice !== undefined) return advice;
  if (!reportedUnknownAdvice.has(key)) {
    reportedUnknownAdvice.add(key);
    console.warn(`[shinon-task-router] Zustand "${key}" ist nicht in NEXT_ACTIONS — Empfehlung bleibt ${UNKNOWN_ADVICE}`);
  }
  return UNKNOWN_ADVICE;
}

/**
 * Die Projektion als REINE Funktion: Eingabe ein GoalView (oder null),
 * Ausgabe die fuenf Felder. Kein Zustand, keine Uhr, kein Dienst — und damit
 * auch nichts, was zweite Autoritaet werden koennte.
 *
 * QUELLENREGEL je Feld (§18: „Autoritative Zustände bleiben die dafür
 * vorgesehenen DSH-Services und Session-Daten“):
 *
 *   OBJECTIVE ......... view.objective — die vom Menschen gewollte Absicht,
 *                       die DSH dauerhaft fuehrt. Wortgleich, nie veraedelt.
 *   CURRENT_STATE ...... view.phase wortgleich (autoritativ); NO_GOAL und
 *                       UNAVAILABLE sind AUSSAGEN DIESES Lesers, nicht DSH-
 *                       Phasen, und deshalb benannt statt gemischt.
 *   LAST_VERIFIED_FACT AUSSCHLIESSLICH aus der benannten Quelle
 *                       (options.fact). Die Projektion leitet ihn nicht ab,
 *                       merkt ihn sich nicht und entnimmt ihn schon gar nicht
 *                       dem Modelltext — leer statt erfunden. Es gibt heute
 *                       noch keine Evidenzquelle, die ihn fuellt (§19); das
 *                       Feld und sein Schlitz sind gebaut, die Quelle fehlt.
 *   CURRENT_BLOCKER .... view.blockedReason, und nur bei Phase `blocked`
 *                       (die Types sagen: „present exactly while blocked“).
 *                       Kein Grund vorhanden → leer, nicht raten.
 *   NEXT_ACTION ........ NEXT_ACTIONS — Beratung, die nie ausgefuehrt wird.
 *
 * FAIL-CLOSED in beide Richtungen: kein View → NO_GOAL, unlesbarer View →
 * UNAVAILABLE, unbekannte Phase → gespiegelt und ohne Empfehlung.
 */
/**
 * Wie erreichbar der autoritative Zustand war — die Achse, die NO_GOAL von
 * UNAVAILABLE trennt, und die Bruecke zu den Feldern.
 *
 * `readable` schliesst `present` ein: KEIN Feldzugriff findet ohne diesen
 * Vorbehalt statt (gemessen: `view.phase` ohne diese Bruecke warf bei `null` mit
 * TypeError).
 */
function availability(view, options) {
  const present = view !== null && view !== undefined;
  const usable = present && typeof view.phase === 'string' && options.unavailable !== true;
  return {
    present,
    readable: usable,
    state: options.unavailable === true || (present && !usable) ? MICRO_UNAVAILABLE : present ? view.phase : MICRO_NO_GOAL,
  };
}

/**
 * Den Blocker rendern — nur bei Phase `blocked` (die Types sagen: „present exactly
 * while blocked") und nur aus einem vorhandenen Grund. Kein Grund heisst leer,
 * nicht geraten.
 */
function blockerOf(view) {
  if (view.phase !== 'blocked') return '';
  const reason = objectOrNull(view.blockedReason);
  if (reason === null) return '';
  return [reason.code, reason.message]
    .filter((part) => typeof part === 'string' && part !== '')
    .join(': ');
}

/** Die Felder, die WORTGLEICH aus dem autoritativen View stammen. Nie abgeleitet. */
function authoritativeFields(view) {
  return {
    OBJECTIVE: typeof view.objective === 'string' ? view.objective : '',
    CURRENT_BLOCKER: blockerOf(view),
  };
}

export function projectMicroState(view, options = {}) {
  const reach = availability(view, options);
  // LAST_VERIFIED_FACT kommt AUSSCHLIESSLICH aus der benannten Quelle — leer,
  // wenn keine da ist, und unabhaengig davon, ob ein View lesbar war.
  const fact = typeof options.fact === 'string' ? options.fact : '';
  const fields = reach.readable ? authoritativeFields(view) : { OBJECTIVE: '', CURRENT_BLOCKER: '' };
  const activation = reach.readable && typeof view.activation === 'string' ? view.activation : '';

  return MicroStateSchema({
    contract: MICRO_STATE_CONTRACT,
    OBJECTIVE: fields.OBJECTIVE,
    CURRENT_STATE: reach.state,
    LAST_VERIFIED_FACT: fact,
    CURRENT_BLOCKER: fields.CURRENT_BLOCKER,
    NEXT_ACTION: nextActionFor(reach.state, activation),
  });
}

/**
 * Die Projektion als DIENST (§18): angeboten, nicht gespeichert.
 *
 * Jeder Aufruf liest den Zielzustand FRISCH aus `ctx.goals` — es gibt keinen
 * gehaltenen Zwischenzustand, keinen Verlauf, keine zweite Historie; was
 * zwischen zwei Aufrufen geschah, liegt bei DSH und in den Session-Daten.
 * Genau EINE Leseoperation: `get` des Ziel-Dienstes. Jede SCHREIBmethode
 * dieses Dienstes (create, edit, pause, block, ...) wird von dieser Schicht
 * nie aufgerufen — die einzige Schreibstelle bleibt activateGoal (§17), und
 * dass sie die einzige bleibt, prueft ein Abnahmetest mit einer Attrappe, auf
 * der jede Schreibmethode wirft.
 *
 * Fehler werden NICHT zu NO_GOAL: „ich kann nicht lesen“ ist eine andere
 * Aussage als „es gibt keins“. Beide fail-closed, beide benannt (UNAVAILABLE).
 */
export function createMicroStateService(ctx) {
  return {
    contract: MICRO_STATE_CONTRACT,
    state(agent, options = {}) {
      try {
        const goals = typeof ctx?.get === 'function' ? ctx.get(GOAL_SERVICE) : undefined;
        if (typeof goals?.get !== 'function') return projectMicroState(null, { ...options, unavailable: true });
        const view = goals.get(agent);
        return projectMicroState(view ?? null, options);
      } catch {
        // Alles, was beim Lesen wirft (kein `ctx.get`, kein Ziel-Dienst, ein
        // werfendes `get` wie GOAL_AGENT_NOT_LIVE) ist ein Lesefehler — und
        // ein Lesefehler ist KEIN Zielzustand: also UNAVAILABLE, nicht NO_GOAL.
        return projectMicroState(null, { ...options, unavailable: true });
      }
    },
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
  const activation = decision.goal ? activateGoal(ctx, config, runtime, record) : activationVerdict({ reason: 'LINEAR_TURN' });
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
// TODO: [DSH-Refactor] - 55 Zeilen Mount mit drei Registrierungen, Dienst-Angebot und Log in einem Rumpf; die Abmeldung spiegelt sie von Hand (dieselbe Anzahl Klammern, kein gemeinsamer Nenner). Je eine benannte Paar-Funktion fuer Registrierung und Abmeldung, damit ein neuer Listener nicht vergessen werden kann.
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

  // §18: die Projektion wird ANGEBOTEN, nicht gespeichert — genau EIN provide,
  // ohne eigenen Zustand und ohne zusätzlichen Listener. Ein Host ohne
  // `provide` ist kein Fehler des Laufs (dieselbe Haltung wie beim Query-Dienst
  // des Project Index); er bekommt die Aussage in derselben Aktivierungszeile.
  const canProvide = typeof ctx?.provide === 'function';
  const releaseMicroState = canProvide ? ctx.provide(MICRO_STATE_SERVICE, createMicroStateService(ctx)) : null;
  const microStateInfo = canProvide
    ? `Projektion ${MICRO_STATE_SERVICE} bereitgestellt (${MICRO_STATE_CONTRACT})`
    : `Projektion ${MICRO_STATE_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`;

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
