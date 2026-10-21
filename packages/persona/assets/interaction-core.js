/**
 * @shinon/persona — interaction-core.js (Eigentuemer: CORE)
 *
 * Was die Persona aus einer MENSCHLICHEN Nachricht liest, und wie eine
 * ausdrueckliche Beziehungsstufe zu einem gueltigen Spine-Signal wird.
 *
 * Warum das ein eigener, importfreier Kern ist: dieselbe Rechnung (Text aus
 * Bloecken, Stimmung, Anrede, Signalform) laeuft im Host, im Test ohne
 * `node_modules` und in der Probe gegen den echten Spine. Der Host haelt nur
 * noch Verdrahtung und Zustand.
 *
 * GEMESSEN am 2026-10-21 durch den echten Spine: ein `user/message` kommt als
 * `message.received` an, und sein Text steht in `content` als BLOCKLISTE
 * (`[{ type: 'text', text }]`), nicht als String. Die alte Fassung las nur
 * String-Felder und bekam deshalb `''` — User-Lage, Anrede und die
 * Gedaechtnis-Relevanz fielen still aus. Diese Fassung liest beide Formen.
 */

/** Die Naht, ueber die eine Beziehungsstufe GESETZT wird. */
export const RELATION_SERVICE = 'shinon_persona_relation';
export const RELATION_CONTRACT = 'shinon.persona-relation/v1';
export const RELATION_ROUTE = '/shinon/persona/relation';
/** Das Signal, das der Spine normalisiert (`relation.updated`). */
export const RELATION_SIGNAL = 'shinon/relation/updated';

/**
 * Text aus einer Ereignis-Nutzlast ziehen — String, Blockliste oder eine
 * Nachricht mit eigener `content`-Liste. Nur `text`-Bloecke zaehlen; ein Bild
 * oder ein Werkzeugblock ist kein Text. Reine Funktion, nichts wird veraendert.
 */
export function textOf(payload) {
  if (typeof payload === 'string') return payload;
  if (payload === null || typeof payload !== 'object') return '';
  for (const key of ['text', 'message', 'content', 'prompt', 'body', 'userText']) {
    const value = payload[key];
    if (typeof value === 'string') return value;
    // Die Form, die DSH wirklich schreibt: content ist eine Blockliste.
    if (Array.isArray(value)) {
      const text = value
        .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n');
      if (text !== '') return text;
      continue;
    }
    // `assistant/message` traegt die Nachricht unter `message` — dieselbe Liste,
    // eine Ebene tiefer. Fuer die Persona ist das kein eigener Text, aber die
    // Regel soll nicht davon abhaengen, welcher Ereignistyp gerade gelesen wird.
    if (value !== null && typeof value === 'object' && Array.isArray(value.content)) {
      const text = value.content
        .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n');
      if (text !== '') return text;
    }
  }
  return '';
}

/**
 * Triggerwoerter fuer die Selbstauskunft. Eine Frage nach der eigenen Person
 * ist eine ANREDE, keine Wissensabfrage — sie darf nicht wie ein Formular
 * beantwortet werden. Abgleich ist absichtlich tolerant: klein geschrieben und
 * als Teilstring, damit "Shinon?", "wer bist du eigentlich" und "sag mir wer
 * du bist" alle greifen.
 */
export const TRIGGERS = [
  'shinon',
  'wer bist du',
  'wer bist denn du',
  'wer seid ihr',
  'was bist du',
  'was kannst du',
  'was kannst du eigentlich',
  'stell dich vor',
  'stell dich mal vor',
  'sag mir wer du bist',
  'wie heisst du',
  'wie heißt du',
  'dein name',
  'was machst du hier',
];

/** Erster passender Trigger oder null. Reine Funktion, kein Zustand. */
export function matchTrigger(text, triggers = TRIGGERS) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const haystack = text.toLowerCase();
  return triggers.find((trigger) => haystack.includes(trigger.toLowerCase())) ?? null;
}

/** Wortmarken der erkannten User-Stimmung — klein, deutsch, fail-closed. */
const MOOD_FRUSTRIERT = [
  'genervt', 'frust', 'nervt', 'läuft alles schief', 'laeuft alles schief',
  'keine nerven', 'ärger', 'aeger', 'sauer', 'wütend', 'wuetend', 'kotzt',
  'scheiße', 'scheisse', 'kein bock', 'dauert zu lang', 'hängt', 'haengt', 'spinnt',
];
const MOOD_ERFREUT = [
  'großes lob', 'grosses lob', 'richtig nice', 'läuft schon super',
  'laeuft schon super', 'exakt richtig', 'super gemacht', 'genau so',
  'freu mich', 'bock heute', 'perfekt', 'danke',
];

/** Die Stimmung des Menschen aus seinem Text — frustriert, erfreut oder null. */
export function detectUserMood(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const haystack = text.toLowerCase();
  if (MOOD_FRUSTRIERT.some((mark) => haystack.includes(mark))) return 'frustriert';
  if (MOOD_ERFREUT.some((mark) => haystack.includes(mark))) return 'erfreut';
  return null;
}

/** Die erkannte Stimmung als System-Abschnitt — ein Satz Wirkung, kein Gutachten. */
export function renderUserLage(mood) {
  if (mood === 'frustriert') {
    return [
      '## User-Lage: frustriert',
      '',
      'Der Mensch ist genervt — das steht im Text, nicht zwischen den Zeilen.',
      'Ein Satz Anerkennung vorn, dann sachlich liefern. Kein Trost, keine',
      'Therapie, keine Gefuehlsnachfrage. Die Arbeit bleibt optimal.',
    ].join('\n');
  }
  if (mood === 'erfreut') {
    return [
      '## User-Lage: erfreut',
      '',
      'Lob oder Schwung im Text — kurz annehmen, nicht feiern, nicht bremsen.',
      'Kein Sykophantismus: Lob aendert die Arbeitsweise nicht, nur das Tempo bleibt.',
    ].join('\n');
  }
  return null;
}

/**
 * Eine ausdrueckliche Beziehungsstufe in die Form bringen, die der Spine
 * akzeptiert — oder einen benannten Grund.
 *
 * Die Stufen kommen aus dem Zustandsvertrag der Persona (dieselbe Liste, die
 * `deriveState` prueft), nicht aus einer zweiten Tabelle. Eine Sitzung ist
 * Pflicht: `relation.updated` ist ein Ereignis EINER Sitzung; ohne sie wuerde
 * der Spine es fail-closed verwerfen. `actors` ist Hinweis fuer die Narrative
 * Engine, keine Autoritaet.
 *
 * @returns {{ ok: true, signal: string, payload: object } | { ok: false, error: string }}
 */
export function relationUpdate(contract, input) {
  const levels = Array.isArray(contract?.relation?.levels) ? contract.relation.levels : [];
  const level = typeof input?.level === 'string' ? input.level.trim() : '';
  const sessionId = typeof input?.sessionId === 'string' ? input.sessionId.trim() : '';
  if (!levels.includes(level)) return { ok: false, error: 'UNKNOWN_RELATION' };
  if (sessionId === '') return { ok: false, error: 'MISSING_SESSION' };
  return {
    ok: true,
    signal: RELATION_SIGNAL,
    payload: { session_id: sessionId, relation: level, actors: ['user', 'shinon'] },
  };
}
