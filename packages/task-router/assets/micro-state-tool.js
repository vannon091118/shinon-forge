/**
 * @shinon/task-router — micro-state-tool.js (Abnehmer der Naht `shinon_goal_micro_state`).
 *
 * BEFUND (Audit-Konflikt #23): die Projektion aus §18 wurde als Dienst
 * angeboten (`MICRO_STATE_SERVICE`), und niemand las sie. Der Abnehmer ist der
 * AGENT: „wo stehe ich gerade“ ist eine Frage, die ein Modell im Turn stellt,
 * und die Antwort ist genau die Projektion — kein zweiter Datensatz. Dieses
 * Werkzeug ruft `service.state(agent)`, also dieselbe Funktion, die der Dienst
 * anbietet (`createMicroStateService`), und hält selbst nichts.
 *
 * WAS HIER NICHT PASSIERT (und warum es hier nicht passieren darf):
 *   * kein Zwischenspeicher, kein Verlauf, kein Zeitstempel — jeder Aufruf
 *     liest frisch; sonst wäre das Werkzeug die zweite Session-Historie, die
 *     §18 verbietet.
 *   * keine Ausführung von NEXT_ACTION — die Empfehlung ist Text.
 *   * kein `ctx.goals`-Zugriff in dieser Datei: die Leseoperation bleibt
 *     Eigentum der Projektion (eine Stelle, ein Urteil).
 *
 * DIE FÜNF FELDER SIND EINMAL DEFINIERT (`MICRO_STATE_FIELDS` in
 * `micro-state.js`): das Ausgabe-Schema wird daraus GEBAUT und nicht
 * abgeschrieben, damit ein sechstes Feld nicht zwei Wahrheiten erzeugt.
 */
import { MICRO_STATE_CONTRACT, MICRO_STATE_FIELDS, MICRO_STATE_SERVICE, MicroStateSchema, projectMicroState } from './micro-state.js';

/**
 * Der Ausgabe-Vertrag: der Vertrag der Naht (`shinon.task-router/micro-state-v1`)
 * plus genau die fünf Felder aus §18. `additionalProperties: false` ist die
 * Zusage, dass das Werkzeug keine sechste Angabe mitschmuggelt.
 */
export const MICRO_STATE_TOOL_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contract: { type: 'string', const: MICRO_STATE_CONTRACT },
    ...Object.fromEntries(MICRO_STATE_FIELDS.map((field) => [field, { type: 'string' }])),
  },
  required: ['contract', ...MICRO_STATE_FIELDS],
};

/** Der einzige Parameter: ein belegter Fakt, den die Projektion nicht ableiten kann. */
const MICRO_STATE_TOOL_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fact: {
      type: 'string',
      description: 'Ein selbst belegter, geprüfter Fakt für LAST_VERIFIED_FACT. Ohne Angabe bleibt das Feld leer — die Projektion erfindet keinen.',
    },
  },
};

/**
 * Den Dienstwert in den Vertrag zwingen — total und fail-closed.
 *
 * Ein Wert, der den Vertrag nicht trägt (fremder `contract`, fehlendes Feld,
 * Nicht-Zeichenkette), ist NICHT der Zustand des Ziels, sondern ein
 * Lesefehler eines fremden Dienstes unter demselben Namen: daraus wird
 * `UNAVAILABLE`, niemals `NO_GOAL`. Das ist dieselbe Verwechslung, die §18
 * zwischen „kein Ziel“ und „nicht lesbar“ zieht.
 */
export function microStateToolValue(value, fact = '') {
  // Geprueft wird mit DEMSELBEN Schema, das die Projektion baut — nicht mit
  // einer zweiten Feldliste daneben. Zwei Pruefer fuer eine Form waeren zwei
  // Wahrheiten: der eine wuerde beim naechsten Feld still nachziehen, der
  // andere nicht. Was `MicroStateSchema` ablehnt (fremder Vertrag, fehlendes
  // Feld, Nicht-Text), ist ein Lesefehler und damit `UNAVAILABLE`.
  try {
    const checked = MicroStateSchema(value);
    return {
      contract: MICRO_STATE_CONTRACT,
      ...Object.fromEntries(MICRO_STATE_FIELDS.map((field) => [field, checked[field]])),
    };
  } catch {
    return projectMicroState(null, { fact, unavailable: true });
  }
}

/**
 * Der Text, den das Modell liest: fünf Zeilen in der Reihenfolge des Plans.
 * Ein leerer Wert heißt „keine belegte Quelle“ (so steht es in §18) und wird
 * als `(leer)` gezeigt, damit er nicht wie ein fehlendes Feld aussieht.
 */
export function renderMicroStateValue(value) {
  const lines = MICRO_STATE_FIELDS.map((field) => `${field}: ${value[field] === '' ? '(leer)' : value[field]}`);
  return [...lines, `(${value.contract})`].join('\n');
}

/**
 * Das fertige Werkzeug. `service` ist der angebotene Dienst (Objekt mit
 * `state(agent, options)`) — hier wird nur gerufen, nie gelesen.
 */
export function createMicroStateTool(service) {
  return {
    // Der Werkzeugname ist der Dienstname — ein Literal, eine Stelle.
    name: MICRO_STATE_SERVICE,
    description:
      'Liest den Goal-Micro-State des laufenden Agenten: OBJECTIVE, CURRENT_STATE, LAST_VERIFIED_FACT, CURRENT_BLOCKER, NEXT_ACTION. Eine Momentaufnahme, frisch aus dem Goal-Zustand gelesen — kein Verlauf, keine Ausführung; NEXT_ACTION ist eine Empfehlung, keine Aktion. Ohne Ziel NO_GOAL, nicht lesbar UNAVAILABLE.',
    parameters: MICRO_STATE_TOOL_PARAMETERS,
    output: {
      schema: MICRO_STATE_TOOL_OUTPUT,
      render: (_args, value) => [{ type: 'text', text: renderMicroStateValue(value) }],
    },
    async execute(args, exec) {
      const fact = typeof args?.fact === 'string' ? args.fact : '';
      if (typeof service?.state !== 'function') {
        return projectMicroState(null, { fact, unavailable: true });
      }
      try {
        return microStateToolValue(await service.state(exec?.agent ?? null, { fact }), fact);
      } catch {
        // Ein werfender Dienst ist ein Lesefehler, kein Zielzustand.
        return projectMicroState(null, { fact, unavailable: true });
      }
    },
  };
}
