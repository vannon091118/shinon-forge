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
 *
 * Die model-gerichteten Texte (Anrede-Abschnitt) stehen in `prompts.json`;
 * dieser Kern rendert sie über `prompt-text.js` und enthält selbst keine
 * Prompt-Prosa mehr.
 */
import { promptText } from './prompt-text.js';

/**
 * Die Route, ueber die eine Beziehungsstufe GESETZT wird — und ihr Vertrag.
 *
 * Der Dienstname `shinon_persona_relation` ist am 2026-10-23 mit dem Dienst
 * gegangen: er hatte keinen Leser, die Route ist die lebende Naht. Der Name
 * bleibt NICHT als toter Export stehen — wer ihn braucht, liest die Route.
 */
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

/**
 * Ist diese Nachricht ein MENSCH?
 *
 * DSH beschriftet jede Nachricht mit `source.kind`: `user` fuer den Menschen,
 * `agent-instructions` fuer die eingeblendete AGENTS.md, `runtime-context` fuer
 * den Live-Block, `skill-catalog` fuer die Skill-Liste. Fehlt die Beschriftung
 * (aeltere Hosts, Testdoubles), gilt die Nachricht als menschlich — der Riegel
 * soll eine BENANNTE Fremdquelle aussperren, nicht eine unbekannte Form stumm
 * schalten.
 *
 * GEMESSEN (2026-10-23, echter Turn im Profil shinon): die `AGENTS.md` dieses
 * Repos enthaelt das Wort „hängt" (Zeile 92, „eine Zusage, die an der
 * gemessenen Fassung hängt"). Das ist eine Marke der Stimmungsliste. Ohne
 * diesen Riegel meldete die Persona in JEDEM Turn „User-Lage erkannt
 * (frustriert)": sie las den Anweisungsblock als Menschen. Die Stimmung kam aus
 * der Datei, nicht aus dem Menschen — und ueber `promptText.remember` wurde der
 * Anweisungsblock ausserdem zur „letzten Menschen-Nachricht", an der die
 * Abschnitts-Gates haengen.
 */
export function istMenschenNachricht(payload) {
  const source = payload?.source ?? payload?.message?.source;
  if (source === null || typeof source !== 'object') return true;
  return typeof source.kind !== 'string' || source.kind === 'user';
}

/** Die Stimmung des Menschen aus seinem Text — frustriert, erfreut oder null. */
export function detectUserMood(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const haystack = text.toLowerCase();
  if (MOOD_FRUSTRIERT.some((mark) => haystack.includes(mark))) return 'frustriert';
  if (MOOD_ERFREUT.some((mark) => haystack.includes(mark))) return 'erfreut';
  return null;
}

/**
 * Der Text der letzten MENSCHEN-Nachricht — und zu welcher Sitzung er gehoert.
 *
 * ZWEI LESER, EIN HALTER: das Langzeitgedaechtnis entscheidet damit, welche
 * Erinnerung passt; das Abschnitts-Gate entscheidet, ob die fachlichen Regeln
 * (Codeaenderung, Determinismus) in diesen Turn gehoeren. Der Text kommt aus
 * dem Spine (`message.received`), nicht aus der Assembly — die laeuft VOR dem
 * Pre-Step (agent-loop:907 vor :909), ein Klassifikationsergebnis des Pre-Steps
 * ist fuer einen Abschnitt also zu spaet.
 *
 * SITZUNG: ein Profil kann mehrere Sitzungen tragen. Gehoert der Text zu einer
 * anderen als der gerade gebauten, liefert `valueFor` einen leeren Text — dann
 * entscheidet die Fail-open-Regel von `sectionApplies`, nicht ein fremder Turn.
 */
export function createPromptText() {
  let text = '';
  let session = '';
  return {
    remember(sessionId, value) {
      text = typeof value === 'string' ? value : '';
      session = typeof sessionId === 'string' ? sessionId : '';
    },
    value() {
      return text;
    },
    valueFor(assemblyCtx) {
      if (session === '') return text;
      const id = assemblyCtx?.agent?.session?.id;
      return typeof id !== 'string' || id === '' || id === session ? text : '';
    },
  };
}

/**
 * Steht ein fachlicher Abschnitt in DIESEM Turn? Haystack ODER Intent-Klasse;
 * beides steht im Vertrag (`sectionGates`), nicht im Code: ein neues Thema ist
 * eine Datenzeile.
 *
 * DIE KLASSE KOMMT AUS DER ENTSCHEIDUNG DES VORIGEN SCHRITTS, nicht aus diesem:
 * die Assembly laeuft vor dem Pre-Step (agent-loop:907 vor :909), und nur
 * Runtime-Contexts werden danach neu aufgeloest, keine Abschnitte. Der Host
 * leert sie deshalb bei jeder neuen Menschen-Nachricht — ein Turn beginnt ohne
 * Klasse und bekommt sie ab Schritt 2, nie aus dem vorigen Turn.
 *
 * FAIL-OPEN: fehlt das Gate im Vertrag (EMPTY_CONTRACT) oder fehlt der Text
 * (Boot, Assembly ohne Nachricht), gilt der Abschnitt als immer relevant. Die
 * einzige vertretbare Fail-Richtung ist hier "zu viel Regel" — ein unlesbarer
 * Vertrag darf keine Sicherheitsregel still entfernen.
 *
 * TEILSTRING statt Wortgleichheit, wie `matchTrigger`: „verändert“ nennt die
 * Marke „änder“, „Bugfix“ die Marke „fix“. Ein kurzer Marker ist ein echter
 * Anlass und kein Tippfehler.
 */
export function sectionApplies(contract, name, text, intentClass = null) {
  const gate = contract?.sectionGates?.[name];
  if (gate === null || typeof gate !== 'object' || Array.isArray(gate)) return true;
  const classes = Array.isArray(gate.intentClasses) ? gate.intentClasses : [];
  if (typeof intentClass === 'string' && classes.includes(intentClass)) return true;
  const markers = Array.isArray(gate.markers) ? gate.markers : [];
  if (markers.length === 0) return classes.length === 0;
  if (typeof text !== 'string' || text.trim() === '') return true;
  const haystack = text.toLowerCase();
  return markers.some((mark) => typeof mark === 'string' && mark !== '' && haystack.includes(mark.toLowerCase()));
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
  // Stimmung und Anrede kommen aus EINER Nachricht des MENSCHEN — nicht aus
  // dem System-Prompt, dem Anweisungsblock, dem Live-Block oder der
  // Skill-Liste (siehe `istMenschenNachricht`).
  //
  // GEMESSEN (2026-10-23, echter Turn): mit der ersten Fassung dieses Riegels
  // (`nur message.received pruefen`) meldete derselbe Turn weiter „frustriert"
  // — die Zeile stand hinter `persona:system.message`, weil das Wort „hängt"
  // ueber die eingeblendete AGENTS.md in den System-Prompt wandert. Die Anrede
  // kam aus demselben Grund: „Anrede erkannt (shinon)" traf den Produktnamen
  // im Systemtext. Deshalb: nur die Menschen-Nachricht zaehlt.
  const menschlich = eventType === 'message.received' && istMenschenNachricht(eventPayload);
  const befund = menschlich
    ? auswerten({
      text,
      // `?? []` wuerde den Default-Parameter von `auswerten` aushebeln:
      // `undefined` MEINT "die Standardliste", nicht "keine Trigger".
      triggers: eingabe.triggers,
      letzterTrigger: eingabe.letzterTrigger ?? null,
      letzteStimmung: eingabe.letzteStimmung ?? null,
    })
    : { trigger: null, triggerGewechselt: false, stimmung: null, stimmungGewechselt: false };
  return {
    eventType,
    eventPayload,
    text,
    human: menschlich,
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
  return promptText('persona-trigger', { trigger });
}
