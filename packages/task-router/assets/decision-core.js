/**
 * Die Entscheidung (§16) — Goal oder linearer Turn.
 *
 * WARUM DAS HIER STEHT (Schnitt 2026-10-23): der Host-Eintrag hatte zwei
 * Eigentuemer. Die ENTSCHEIDUNG ist eine reine Funktion mit einer Tabelle als
 * Fail-Reihenfolge ("erst die Herkunft, dann das Vokabular, dann die Schwelle,
 * dann die Substanz"); die Projektion (§18) liegt in `assets/micro-state.js`.
 *
 * Was hier NICHT passiert: kein Zustand, keine Uhr, kein Netz, kein Dienst. Das
 * Modell liefert ein ETIKETT, diese Tabelle entscheidet.
 */
import {
  DEFAULT_MIN_RAW_LENGTH,
  DEFAULT_THRESHOLD,
  INTENT_CLASSES,
  INTENT_UNDEFINED,
  INTENT_WEIGHTS,
} from './intent-policy.js';
// Die Regel "letzte menschliche Nachricht mit Text" hat EINE Definition:
// `@shinon/seams` (`lastHumanMessage`).
import { lastHumanMessage } from '@shinon/seams/core';

/** Vertragsname der Router-Entscheidung. */
export const CONTRACT = 'shinon.task-router/decision-v1';

/**
 * Der Vertrag des EINGANGS: der Provenienz-Datensatz des Prompt-Enhancers.
 *
 * Die Klasse darin stammt aus dem Runtime-Resolver des Prompters (Text-Patterns,
 * kein Modell) — der Router liest damit eine Runtime-Entscheidung, keine
 * Modellantwort. Ein Datensatz mit anderem Vertrag ist ein Fremddatensatz und
 * entscheidet nichts (FOREIGN_RECORD).
 */
export const SOURCE_CONTRACT = 'shinon.prompter/result-v1';

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
  { goal: false, when: (f) => f.intent === INTENT_UNDEFINED, reason: () => 'INTENT_UNDEFINED', fields: (f) => ({ intent: f.intent }) },
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
  // Die Klasse kommt aus dem Datensatz des Prompters — dort hat sie der
  // Runtime-Resolver aus dem Text abgeleitet. Hier wird sie nur GELESEN.
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

/**
 * Die ABSICHT aus den Nachrichten des Schritts lesen: der getrimmte Text der
 * letzten menschlichen Nachricht. Die Regel selbst steht in `@shinon/seams`
 * (`lastHumanMessage`) — bis 2026-10-20 stand sie hier als Zwillings-Region,
 * bytegleich mit `@shinon/prompter`. Hier bleibt nur, was der Router daraus
 * macht: eine Absicht aus Harness-Text waere ein Fremdauftrag, dann liefe ein Goal
 * auf „Kontext: du hast 3 neue Werkzeugergebnisse".
 */
export function readObjective(messages) {
  const hit = lastHumanMessage(messages);
  return hit === null ? null : hit.text.trim();
}

/**
 * Das Ergebnis einer Aktivierung — benannte Felder statt vier Positionsargumente,
 * die an der Aufrufstelle wie ein Zweitupel aussahen (`activationVerdict(false,
 * 'LINEAR_TURN')`: gemeint sind `activated` und `reason`).
 */
export const activationVerdict = ({ activated = false, reason, goalId = '', maxGoalRounds = 0 }) => ({
  activated,
  reason,
  goalId,
  maxGoalRounds,
});

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
