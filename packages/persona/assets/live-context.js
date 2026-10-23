/**
 * @shinon/persona — live-context.js (Eigentuemer: CORE)
 *
 * Der Persona-Live-Zustand als TEXT in EINEM Kanal:
 *
 *   KONTEXT (Runtime-Nachricht): `renderLiveContext` geht als Nachricht mit
 *   dem Modell und ERSETZT den vorherigen Stand, statt sich neben ihn zu
 *   stapeln. Der Host ruft sie bei JEDER Assembly neu auf.
 *
 * Es gibt genau DIESEN EINEN dynamischen Block. Stimmung, Ton und User-Lage
 * stehen einmal hier — nicht zusaetzlich in eigenen Abschnitten. Was fehlt,
 * fehlt als Zeile; fehlt alles, gibt es gar keinen Block (fail-closed).
 *
 * Der Kern ist importfrei (kein Import, auch kein `node:`) — damit die
 * Rechnung im Host, im Test ohne node_modules und in der CI ohne DSH laufen
 * kann.
 */

/**
 * Der Name des Runtime-Contexts.
 *
 * Ein Context ist ein REGISTER, kein Abschnitt: der Name steht im
 * Runtime-Snapshot und damit in der Nachricht, die das Modell liest. Er
 * bleibt stabil, damit der Stand als derselbe erkennbar ist.
 */
export const LIVE_CONTEXT_NAME = 'shinon:persona-live';

/**
 * Die Sortierzahl des Contexts.
 *
 * DSH kennt fuer Shinon keinen Anker: `getContextOrder` liefert nur die
 * eigenen Anker (WORKING_DIRECTORY 100 … WEB_SURFACE 210, dsh-system-prompt
 * lib/index.js:44-52). Also nimmt die Persona eine eigene endliche Zahl: 300
 * liegt hinter ALLEN DSH-Kontexten (die 200er kommen vorher) und vor keinem
 * Abschnitt — Abschnitte und Kontexte sind zwei Achsen (Sections 1000…10200,
 * Contexts 100…300) und werden nie miteinander verglichen.
 */
export const LIVE_CONTEXT_ORDER = 300;

/**
 * Verstaendliche Arbeitszustaende je Mood — die einzige Quelle der Modus-Zeile.
 *
 * Die internen Mood-Namen (idle, curious, …) sagen dem Modell nichts; die
 * Tabelle uebersetzt sie in einen Satz ueber den aktuellen Zustand. Ein Mood
 * ohne Eintrag ergibt KEINE Zeile: ein unbekannter Zustand wird nicht
 * behauptet. Neue Moods brauchen zuerst eine Zeile hier, sonst bleiben sie
 * stumm (fail-closed).
 */
export const MOOD_MODUS = {
  idle: 'bereit',
  curious: 'neugierig auf den Auftrag',
  focused: 'an einer Sache dran',
  working: 'mitten in einer Aufgabe',
  concerned: 'bei einem Risiko',
  blocked: 'an einem Blocker',
};

/**
 * Besondere Reaktionen — nur wenn die erkannte User-Stimmung das Verhalten
 * wirklich veraendert. Die Stimmung selbst kommt aus `detectUserMood`
 * (interaction-core.js); hier steht nur, was daraus folgt. Keine erfundene
 * Stimmung, keine Ursache, kein Gutachten.
 */
const USER_REAKTION = {
  frustriert: 'der Mensch ist genervt — liefere sachlich, statt zu trösten',
  erfreut: 'der Mensch ist zufrieden — nimm es kurz an und arbeite weiter',
};

/**
 * Den Live-Zustand als Runtime-Context registrieren.
 *
 * WARUM DIESE FUNKTION IM KERN STEHT: der Host-Eintrag soll keine Datei lesen
 * und kein Zustandsobjekt bauen (docs/contracts/structure.json). Die
 * Registrierung gehoert deshalb hierher — der Host uebergibt, was er hat, und
 * bekommt den Disposer zurueck.
 *
 * LEERER TEXT = KEIN BLOCK: `renderLiveContext` gibt null zurueck, wenn es
 * nichts zu sagen gibt. Der DSH wuerde daraus einen 'none'-Snapshot bauen
 * ("Current runtime context: none") — der behauptet, es gaebe keinen Stand.
 * Deshalb wird null zu '' gemacht: der DSH filtert leere Strings selbst weg
 * (renderContextSections filtert auf `text.length > 0`).
 *
 * `interpolate: false` — WARUM LITERAL: der Live-Block ist ein MESSWERT, keine
 * Vorlage. Er enthaelt keine Platzhalter, die aufzulösen waeren, sondern das,
 * was GELESEN wurde: Zustand, Ton, User-Lage. Interpoliert der DSH, sucht er
 * `{{name}}` und WIRFT bei unbekannten Namen (dsh-system-prompt/lib/index.js:158-176)
 * — eine Klammer in einem gelesenen Wert wuerde dann den GANZEN Prompt-Aufbau
 * sprengen, statt eine Zeile zu vertragen. Literal heisst hier: gewollt.
 *
 * @param {object} sp der systemPrompt-Dienst
 * @param {object} quellen die Quellen des Live-Zustands
 * @param {object} quellen.contract der Zustandsvertrag (Tendenz-Stimmen)
 * @param {Function} quellen.state die aktuelle Zustandsaufnahme
 * @param {Function} [quellen.tone] der gelesene Scoring-Ton
 * @param {string|null} [quellen.userMood] die erkannte Stimmung des Menschen
 * @param {Function} [quellen.spricht] spricht die Persona fuer diese Sitzung?
 * @returns {Function} der Disposer
 */
export function registerLiveContext(sp, quellen = {}) {
  if (typeof sp?.context !== 'function') {
    console.error('[shinon-persona] systemPrompt-Dienst ohne context() — der Live-Zustand kommt NICHT an');
    return () => {};
  }
  const {
    contract,
    state,
    tone = () => null,
    userMood = () => null,
    spricht = () => true,
  } = quellen;
  return sp.context({
    name: LIVE_CONTEXT_NAME,
    order: LIVE_CONTEXT_ORDER,
    // LITERAL: der Live-Block ist ein gelesener Messwert, keine Vorlage. Ohne
    // diese Zeile wuerde der DSH `{{name}}` in einem gelesenen Wert suchen und
    // bei unbekanntem Namen den ganzen Prompt-Aufbau sprengen.
    interpolate: false,
    text: (assemblyCtx) => {
      if (typeof spricht === 'function' && !spricht(assemblyCtx)) return '';
      const live = renderLiveContext({
        contract,
        state: typeof state === 'function' ? state() : null,
        tone: typeof tone === 'function' ? tone() : null,
        userMood: typeof userMood === 'function' ? userMood() : userMood,
      });
      return live ?? '';
    },
  });
}

/**
 * Der Live-Zustand als EINE Runtime-Context-Nachricht — der einzige
 * dynamische Block.
 *
 * Format: Ueberschrift, dann je Aspekt eine Zeile in zweiter Person. Nur was
 * vorliegt und etwas veraendert, steht da: kein interner Jargon
 * (Relationship-Stufen, Narrative-IDs, Vertrauenswuerdigkeit einzelner
 * Komponenten), keine Herkunfts-Beschriftungen, keine leeren Felder.
 *
 * @param {object} parts
 * @param {object} parts.contract   Der Zustandsvertrag (Tendenz-Stimmen)
 * @param {object} parts.state      Der Zustand (mindestens mood)
 * @param {object|null} [parts.tone]     Der gelesene Ton des Scorings oder null
 * @param {string|null} [parts.userMood] Die erkannte Stimmung des Menschen oder null
 * @returns {string|null} der Block — oder null, wenn es nichts zu sagen gibt
 */
export function renderLiveContext(parts) {
  const { contract, state, tone, userMood } = parts ?? {};
  if (state === null || typeof state !== 'object') return null;
  const lines = [];
  const modus = typeof state.mood === 'string' ? MOOD_MODUS[state.mood.trim()] : undefined;
  if (modus !== undefined) lines.push(`Arbeitsmodus: du bist gerade ${modus}.`);
  const stimme = voiceOf(contract, tone);
  if (stimme !== null) {
    const anker = Array.isArray(stimme.anker) ? stimme.anker.filter((eintrag) => text(eintrag) !== null) : [];
    lines.push(`Ton: ${stimme.tonalitaet}.${anker.length > 0 ? ` Anker: ${anker.map((eintrag) => text(eintrag)).join('; ')}.` : ''}`);
  }
  const reaktion = typeof userMood === 'string' ? USER_REAKTION[userMood.trim()] : undefined;
  if (reaktion !== undefined) lines.push(`Besondere Reaktion: ${reaktion}.`);
  if (lines.length === 0) return null;
  return ['## Shinon aktuell', '', ...lines].join('\n');
}

/**
 * Die Stimme zur gelesenen Haltung — aus dem Vertrag, nicht erfunden.
 *
 * Die HALTUNG kommt vom Scoring, der KLANG steht in den Vertragsdaten
 * (`tendency.voices`): Tonalitaet plus Ankerpunkte, an denen sich das
 * situative Reagieren festmacht. Eine Haltung, die der Vertrag nicht kennt,
 * ergibt `null` — dann faellt die Zeile weg, statt einen Ton zu behaupten.
 */
function voiceOf(contract, tone) {
  if (tone === null || typeof tone !== 'object') return null;
  const stance = text(tone.stance);
  if (stance === null) return null;
  const stimme = contract?.tendency?.voices?.[stance];
  if (stimme === undefined || stimme === null || typeof stimme !== 'object') return null;
  if (text(stimme.tonalitaet) === null) return null;
  return stimme;
}

/** Ein Wert als Text — oder null, wenn er nichts aussagt. */
function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
