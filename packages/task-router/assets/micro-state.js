/**
 * Die Goal-Micro-State-Projektion (§18) — die zusaetzliche Sicht dieses Pakets.
 *
 * WARUM DAS HIER STEHT (Schnitt 2026-10-23): der Host-Eintrag trug zwei
 * Eigentuemer. Die ENTSCHEIDUNG (§16, `assets/decision-core.js`) beantwortet
 * "Goal oder linear"; diese Datei beantwortet "was ist gerade der Stand" und
 * haelt dafuer EINE Regel bereit, die nichts speichert: jeder Aufruf liest
 * frisch aus `ctx.goals`, es gibt keinen gehaltenen Zwischenzustand.
 *
 * Die fuenf Felder sind wortgleich und in der Reihenfolge des Plans; was nicht
 * hier steht (Zeitstempel, Rundenliste, Nachrichten, Verlauf), fuehrt die
 * Projektion auch nicht mit — sonst waere sie die zweite Session-Historie, die
 * §18 ausdruecklich verbietet.
 */
import z from '@deepseek-ai/schemastery';

/** Der Dienstname der Goal-Domaene in `ctx.goals` — beide Haelften lesen ihn. */
export const GOAL_SERVICE = 'goals';

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
  // Nur ein OBJEKT ist ein Grund; `null`, `undefined` und Skalare zaehlen als
  // nichts. Der Helfer steht hier lokal: die Projektion teilt keinen Zustand
  // mit dem Eintrag, also teilt sie auch keine Hilfsfunktion mit ihm.
  const raw = view.blockedReason;
  const reason = raw !== null && typeof raw === 'object' ? raw : null;
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
