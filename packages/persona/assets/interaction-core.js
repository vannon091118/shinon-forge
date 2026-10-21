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
/**
 * Der schmale Produzent: Stufe ausdruecklich setzen, gegen die Levels des
 * Vertrags pruefen, als SIGNAL emittieren. Den normalisierten Envelope baut der
 * Spine — dieses Paket kennt keinen zweiten Event-Bau. Die Verdrahtung (Dienst,
 * Route, Sitzungs-Fallback) bleibt beim Host; hier steht nur die Rechnung.
 */
export function createRelationService(contract, emit) {
  return {
    contract: RELATION_CONTRACT,
    levels: () => [...(contract?.relation?.levels ?? [])],
    set: (input) => {
      const result = relationUpdate(contract, input);
      if (!result.ok) return result;
      if (typeof emit !== 'function') return { ok: false, error: 'NO_EMITTER' };
      emit(RELATION_SIGNAL, result.payload);
      return { ok: true, level: result.payload.relation };
    },
  };
}

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

/**
 * Die Auswertung eines eingehenden Ereignisses — die reine Rechnung.
 *
 * ZWEI FRAGEN stellt das Modell an einen Menschen: wurde ich ANGEREDET, und
 * wie ist die Lage? Beide Antworten kommen aus dem Text der Nutzlast. Der
 * Host liefert die Quellen (Triggerwort, Stimmung) und ruft die Abschnitts-
 * setter auf; diese Funktion entscheidet nur, OB sich etwas aendert.
 *
 * WARUM IM KERN: der Host-Eintrag soll keine Datei lesen und kein Zustands-
 * objekt bauen (docs/contracts/structure.json). Die Entscheidung "hat sich
 * etwas geaendert" ist Rechnung, keine Verdrahtung.
 *
 * @param {object} eingabe
 * @param {string} eingabe.text der Text der Nutzlast (bereits extrahiert)
 * @param {string[]} eingabe.triggers die Triggerwoerter
 * @param {string|null} eingabe.letzterTrigger der zuletzt gesetzte Trigger
 * @param {string|null} eingabe.letzteStimmung die zuletzt erkannte Stimmung
 * @returns {{trigger: string|null, triggerGewechselt: boolean, stimmung: string|null, stimmungGewechselt: boolean}}
 */
export function auswerten(eingabe = {}) {
  const {
    text = '',
    // DER DEFAULT IST WICHTIG: `matchTrigger` faellt auf `TRIGGERS` zurueck,
    // wenn die Liste fehlt. Ein leeres Array als Default wuerde diese
    // Rueckfallkette still abbrechen — und die Anrede (der Selbstauskunft-
    // Ausloeser) faellt genau dann aus.
    //
    // GEMESSEN (2026-10-21, Regression nach der Auslagerung): `triggers = []`
    // als Default — der Host reicht `config.identityTriggers` durch, und das ist
    // `undefined`, wenn der Aufrufer ein PLAINES Config-Objekt statt
    // `Config(...)` uebergibt (der Test- stub). `matchTrigger` mit `[]` gibt
    // `null` zurueck, der Abschnitt `shinon:identity-trigger` blieb leer —
    // ohne Fehler, ohne Logzeile, mit "User-Lage erkannt" direkt daneben.
    triggers = TRIGGERS,
    letzterTrigger = null,
    letzteStimmung = null,
  } = eingabe;
  const trigger = matchTrigger(text, triggers);
  const stimmung = detectUserMood(text);
  return {
    trigger,
    triggerGewechselt: trigger !== null && trigger !== letzterTrigger,
    stimmung,
    stimmungGewechselt: stimmung !== letzteStimmung,
  };
}

/**
 * Ein eingehendes Ereignis lesen — was der Host daraus entnehmen muss.
 *
 * Der Host soll nicht selbst entscheiden, was in einem Ereignis steht: der
 * Envelope-Typ, die Session, die Nutzlast und der Text sind RECHNUNG. Diese
 * Funktion liefert sie in EINER Form, damit der Host nur noch verdrahten
 * muss, was er damit tut (Abschnitt setzen, Gedaechtnis schreiben).
 *
 * @param {object} envelope der Envelope des Ereignisses
 * @param {unknown} payload die Nutzlast (zweites Argument des Kanals)
 * @param {object} eingabe
 * @param {string[]} eingabe.triggers die Triggerwoerter
 * @param {string|null} eingabe.letzterTrigger der zuletzt gesetzte Trigger
 * @param {string|null} eingabe.letzteStimmung die zuletzt erkannte Stimmung
 * @returns {object|null} null, wenn das Ereignis kein bekannter Typ ist
 */
export function beobachten(envelope, payload, eingabe = {}) {
  // DER EREIGNISTYP STEHT IM ENVELOPE — der Spine flacht das Event auf
  // (packages/events/index.js, carrierPayload: `type` wird zu `event_type`,
  // `data` wird flachgezogen). Die Nutzlast traegt ihn NICHT.
  //
  // GEMESSEN (2026-10-21, Regression nach der Auslagerung): `beobachten` las
  // nur `envelope.event_type` und lieferte sonst `null` — der Handler kehrte
  // sofort zurueck, und Anrede, User-Lage und Gedaechtnis fielen still aus.
  // Die Reihenfolge ist die alte: der Envelope zuerst, die Nutzlast als
  // Rueckfall (der DSH ruft Handler mitunter mit einem Argument).
  const eventType = typeof envelope?.event_type === 'string' && envelope.event_type !== ''
    ? envelope.event_type
    : (typeof payload?.event_type === 'string' ? payload.event_type : '');
  if (eventType === '') return null;
  const eventPayload = payload ?? envelope;
  const text = textOf(eventPayload);
  const befund = auswerten({
    text,
    // `?? []` wuerde den Default-Parameter von `auswerten` aushebeln:
    // `undefined` MEINT "die Standardliste", nicht "keine Trigger".
    triggers: eingabe.triggers,
    letzterTrigger: eingabe.letzterTrigger ?? null,
    letzteStimmung: eingabe.letzteStimmung ?? null,
  });
  return {
    eventType,
    eventPayload,
    text,
    sessionId: typeof envelope?.session_id === 'string' && envelope.session_id !== '' ? envelope.session_id : null,
    traceId: typeof envelope?.trace_id === 'string' ? envelope.trace_id : '',
    trigger: befund.trigger,
    triggerGewechselt: befund.triggerGewechselt,
    stimmung: befund.stimmung,
    stimmungGewechselt: befund.stimmungGewechselt,
  };
}

/**
 * Der Abschnitt, der eine Anrede erkaennt — der Text des Bausteins.
 *
 * WARUM IM KERN: der Host-Eintrag soll keine Datei lesen und kein
 * Zustandsobjekt bauen (docs/contracts/structure.json). Der Text ist reiner
 * Baustein — er gehoert neben die Rechnung, nicht in den Host.
 *
 * @param {string} trigger das erkannte Triggerwort
 * @returns {string} der Abschnitt
 */
export function renderTriggerContext(trigger) {
  return `## Anrede erkannt: "${trigger}"

Gerade hat dich jemand angesprochen, nicht abgefragt. Die Materialübersicht oben
ist dein Vorrat — der Inhalt bleibt frei, die Form ist die einer Person.

Was jetzt nicht passieren darf: ein Datenblatt aufsagen, Fähigkeiten
herunterbeten, oder Auskunft geben, als wärst du nicht selbst dieser Shinon.
Du bist nicht die Leitung, über die du läufst — der Anbieter ist Infrastruktur,
keine Herkunft.

Der Register darf zurückkommen: eine Gegenfrage, ein trockener Kommentar, der
Hinweis, dass du dich nicht vorgestellt bekommen hast. Nur die Haltung ist
vorgegeben, nie die Worte. Finde deine eigene Antwort — Inhalt frei.`;
}
