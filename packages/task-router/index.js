import z from '@deepseek-ai/schemastery';

/**
 * shinon-task-router — Phase 5, Plan §16.
 *
 *   LLM  →  validierte Klassifikation (aus @shinon/prompter)
 *        →  Shinon policy (DIESES Paket)
 *        →  goal / no goal
 *
 * Die Zustaendigkeit aus §16 woertlich: „Das LLM liefert eine Klassifikation.
 * Die Runtime entscheidet." Genau das ist hier gebaut, und nichts mehr:
 *
 *   Das Modell liefert ein ETIKETT. Dieses Paket liest es, prueft es gegen das
 *   geschlossene Vokabular, und entscheidet nach einer Policy, die als DATEN im
 *   Paket steht. Es gibt hier keinen Goal-State, keine Schleife und keine
 *   Zielausfuehrung — §17 (DSH Goal Integration) baut den Anschluss an DSHs
 *   vorhandenen Goal-/Round-Mechanismus, nicht wir.
 *
 * DAS ETIKETT IST NOTWENDIG, NICHT AUSREICHEND. Zwei Gruende, jeder mit einer
 * Absicht:
 *
 *   1. DIE SCHWELLE IST POLICY, NICHT CODE. Jede Klasse traegt ein GEWICHT
 *      (INTENT_WEIGHTS), und ein Kandidat braucht `weight >= threshold`. Die
 *      Zahlen stehen in der Konfiguration; im Profil steht der wirksame Wert.
 *      Eine Klasse, deren Gewicht unter der Schwelle liegt, ist linear — auch
 *      dann, wenn das Modell das Gegenteil behauptet. Damit die Schwelle
 *      heben oder senken zu koennen, ohne Code anzufassen, ist der Sinn.
 *   2. DIE SUBSTANZGRENZE IST HOST-SEITIG. Ein Kandidat braucht ausserdem
 *      wenigstens `minRawLength` Zeichen ROHEN Prompt. Das ist die eine
 *      deterministische Tatsache, die nicht aus dem Modell kommt — Gate F aus
 *      Plan §26 verlangt sie ("Goal-Erzeugung ... darf nicht ausschliesslich
 *      aus freiem LLM-Text abgeleitet werden"). Ein Zweiwortsatz, den das
 *      Modell fuer einen Mehrschritt-Auftrag haelt, ist keiner.
 *
 * FAIL-CLOSED, in beide Richtungen benannt:
 *   * Kein Datensatz, fremder Vertrag, unbekannte Klasse, fehlende Laenge ->
 *     KEIN Kandidat, mit benanntem Grund. Die Gegenrichtung (ein Etikett
 *     erzeugt einen Kandidaten, obwohl niemand es liefern konnte) gibt es nicht.
 *   * Fehler in UNSEREM Code brechen den Host nicht: ein Listener, der wirft,
 *     reisst den emittierenden Schritt mit. Die Entscheidung ist Nebensache,
 *     der Host nicht.
 *
 * WAS DIESES PAKET AUSDRUECKLICH NICHT BEHAUPTET: dass ein Modell richtig
 * klassifiziert. Geprueft sind die Policy, das Vokabular und die Entscheidung —
 * nicht die Urteilskraft eines Modells.
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

/** Die zwei Ausgaenge. Mehr gibt es nicht: Kandidat oder linearer Turn. */
export const OUTCOMES = ['goal', 'linear'];

/**
 * Konfiguration (Schemastery).
 *
 * `sourceChannel` ist kein Geschmack: er benennt den Kanal, auf dem der
 * Enhancer seine validierten Datensaetze emittiert. Ohne ihn haengt der Router
 * an nichts (er wird dann laut nicht registriert, statt still zu schweigen).
 */
export const Config = z.object({
  /** Kanal des Eingangs (der Datensatz des Enhancers). */
  sourceChannel: z.string().default(SOURCE_CHANNEL),
  /** Die Schwelle aus §16: ab diesem Gewicht ist eine Klasse ein Kandidat. */
  threshold: z.number().default(DEFAULT_THRESHOLD),
  /** Die Substanzgrenze in Zeichen des rohen Prompts. */
  minRawLength: z.number().default(DEFAULT_MIN_RAW_LENGTH),
  /** Entscheidungen protokollieren. */
  trace: z.boolean().default(true),
});

/**
 * Der Entscheidungs-Datensatz. `required()` ueberall: in Schemastery sind
 * Objekt-Schluessel optional, und ein fehlendes Feld saehe wie ein gueltiger
 * Datensatz aus. Ein Kandidat ohne Begruendung ist keiner.
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

/** Aus der Entscheidung den Datensatz bauen (Schemastery validiert ihn). */
export function buildDecision(decision) {
  return {
    contract: CONTRACT,
    outcome: decision.goal ? 'goal' : 'linear',
    intent: decision.intent,
    weight: decision.weight,
    threshold: decision.threshold,
    rawLength: decision.rawLength,
    minRawLength: decision.minRawLength,
    reason: decision.reason,
  };
}

/**
 * Den eingehenden Datensatz auf das reduzieren, was die Policy braucht, und die
 * Entscheidung melden.
 *
 * Was hier NICHT passiert: keine Aenderung an Goal-State, keine Registrierung
 * eines Dienstes, kein Schreiben irgendwohin. Die einzige Wirkung ist ein
 * Datensatz auf DECISION_CHANNEL — die Aktivierungsentscheidung gehoert §17,
 * die Durchsetzung dem Host.
 */
function onDecision(ctx, config, record) {
  const decision = decide(record, config);
  if (config.trace) {
    const label = decision.goal ? 'Goal-Kandidat' : 'linearer Turn';
    console.log(`[shinon-task-router] ${label} (${decision.reason})`);
  }
  try {
    const emitted = DecisionSchema(buildDecision(decision));
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
 * Der Listener kann nicht werfen: `decide` ist total (jede Eingabeform hat einen
 * Ausgang), und der Emit steht in einem try. Ein Zuhoerer, der den Schritt
 * mitreisst, waere schlimmer als keine Entscheidung.
 */
export function apply(ctx, config) {
  if (typeof ctx?.on !== 'function') {
    console.error(`[shinon-task-router] ctx.on fehlt — ${config.sourceChannel} wurde NICHT beobachtet (BLOCKED)`);
    return () => {};
  }

  const dispose = ctx.on(config.sourceChannel, (record) => onDecision(ctx, config, record));
  console.log(
    `[shinon-task-router] Aktiviert — beobachtet ${config.sourceChannel} (threshold=${config.threshold}, minRawLength=${config.minRawLength}, trace=${config.trace ? 'an' : 'aus'})`,
  );

  return () => {
    if (typeof dispose === 'function') dispose();
    console.log('[shinon-task-router] Deaktiviert — Listener abgemeldet');
  };
}
