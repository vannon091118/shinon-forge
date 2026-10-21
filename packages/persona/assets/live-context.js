/**
 * @shinon/persona — live-context.js (Eigentuemer: CORE)
 *
 * Der Persona-Live-Zustand als TEXT — in ZWEI Kanaelen:
 *
 *   1. ABSCHNITT (System-Prompt): `renderStateContext` — steht im Prompt, bis
 *      sich der Zustand aendert; der Host setzt den Abschnitt dann neu.
 *   2. KONTEXT (Runtime-Nachricht): `renderLiveContext` — geht als Nachricht
 *      mit dem Modell und ERSETZT den vorherigen Stand, statt sich neben ihn
 *      zu stapeln. Der Host ruft sie bei JEDER Assembly neu.
 *
 * Beide Formen lesen DENSELBEN Zustand und DENSELBEN Vertrag: es gibt keine
 * zweite Wahrheit und kein zweites Regelwerk. Der Kern ist importfrei (kein
 * Import, auch kein `node:`) — damit die Rechnung im Host, im Test ohne
 * node_modules und in der CI ohne DSH laufen kann.
 *
 * Der Live-Block ist EINE Nachricht: eine Zeile je Aspekt, und jede Zeile
 * nennt ihre Herkunft. Was gelesen wurde (Ton, Narrative-Lage, User-Lage,
 * Beziehungsstufe), steht als gelesen da; was der Zustand selbst ist, steht
 * als Zustand da. Fehlt eine Quelle, fehlt die Zeile — und fehlt alles, gibt
 * es gar keinen Block (fail-closed: kein leerer Snapshot).
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
 * Abschnitt — Abschnitte und Kontexte sind zwei Achten (Sections 1000…10200,
 * Contexts 100…300) und werden nie miteinander verglichen.
 */
export const LIVE_CONTEXT_ORDER = 300;

/**
 * Die Tendenz als System-Abschnitt — Ton, Tempo, Haerte aus dem Vertrag.
 *
 * Die HALTUNG kommt vom Scoring, die KLANGREGEL steht hier (Vertragsdaten): die
 * Persona behauptet keinen Ton, sie liest einen. Eine Haltung, die sie nicht
 * kennt, ergibt `null` — der Abschnitt faellt dann weg, statt leer dazustehen.
 * `null` ist damit die ehrliche Antwort auf "kein Ton" UND auf "unbekannter
 * Ton"; in beiden Faellen wird nichts behauptet.
 *
 * @param {object} contract der Zustandsvertrag
 * @param {object|null} tone der gelesene Scoring-Ton
 * @returns {string|null} der Abschnitt — oder null, wenn es keinen gibt
 */
export function renderTendency(contract, tone) {
  if (tone === null || typeof tone !== 'object') return null;
  const stance = tone.stance;
  if (typeof stance !== 'string' || stance === '') return null;
  const voice = contract?.tendency?.voices?.[stance];
  if (voice === undefined || voice === null) return null;
  const levels = (Array.isArray(tone.tendencies) ? tone.tendencies : [])
    .filter((entry) => typeof entry?.klasse === 'string' && typeof entry?.stufe === 'string')
    .map((entry) => `${entry.klasse} ${entry.stufe}`);
  return [
    '## Tendenz (gelesen, nicht behauptet)',
    '',
    `Haltung: ${stance}`,
    ...(levels.length > 0 ? [`Lage: ${levels.join(', ')}`] : []),
    `Ton: ${voice.ton}`,
    `Tempo: ${voice.tempo}`,
    `Härte: ${voice.haerte}`,
  ].join('\n');
}

/**
 * Den Composite der Narrative Engine als System-Abschnitt rendern.
 *
 * Die Beschriftung steht im Vertrag (`narrative.fields`), nicht im Code: ein
 * neues Feld ist zuerst eine Datenzeile. Was der Composite nicht traegt, wird
 * ausgelassen; ein Composite ohne darstellbares Feld ergibt `null` — dann faellt
 * der Abschnitt weg, statt leer dazustehen (dieselbe Ehrlichkeit wie beim Ton).
 *
 * Die Persona BEHAUPTET hier nichts: der Abschnitt ist als gelesene Interpretation
 * ausgewiesen, und der eigene Zustand (stance/mood) bleibt daneben unveraendert
 * maßgeblich.
 *
 * @param {object} contract der Zustandsvertrag
 * @param {object|null} composite der gelesene Composite
 * @param {string} narrativeContract der Vertragsname der Narrative Engine
 * @returns {string|null} der Abschnitt — oder null, wenn es keinen gibt
 */
export function renderNarrative(contract, composite, narrativeContract = '') {
  if (composite === null || typeof composite !== 'object' || Array.isArray(composite)) return null;
  const rule = contract?.narrative;
  if (rule === undefined || rule === null) return null;
  const labels = rule.fields ?? {};
  const lines = [];
  for (const [key, label] of Object.entries(labels)) {
    const value = composite[key];
    if (value === undefined || value === null || value === '') continue;
    lines.push(`- ${label}: ${String(value)}`);
  }
  if (lines.length === 0) return null;
  const header = typeof rule.heading === 'string' && rule.heading !== '' ? rule.heading : '## Narrative Lage';
  const origin =
    typeof rule.authority === 'string' && rule.authority !== '' && narrativeContract !== ''
      ? `Quelle: ${narrativeContract} (authority ${rule.authority} — Interpretation, nicht Autorität)`
      : null;
  return [header, '', ...(origin === null ? [] : [origin, '']), ...lines].join('\n');
}

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
 * was GELESEN wurde: Zustandsfelder, Ton, Narrative-Lage, User-Lage, Stufe.
 * Interpoliert der DSH, sucht er `{{name}}` und WIRFT bei unbekannten Namen
 * (dsh-system-prompt/lib/index.js:158-176) — eine Klammer in einem gelesenen
 * Wert (Narrative-Feld, Notiz, Tonstufe) wuerde dann den GANZEN Prompt-Aufbau
 * sprengen, statt eine Zeile zu vertragen. Genau das macht der DSH selbst mit
 * seinen Laufzeit-Fakten: `working-directory:current`, `dsh-tools` und
 * `dsh-mcp-resources` tragen `interpolate: false` (dsh-system-prompt/lib/index.js:45,
 * dsh-working-directory/lib/index.js:45). Escaping waere die Alternative — aber
 * es wuerde den gelesenen Wert VERHAELTNISCH machen: der Block nennt seine
 * Herkunft, also muss er das sagen, was gelesen wurde, Zeichen fuer Zeichen.
 * Literal heisst hier: gewollt.
 *
 * @param {object} sp der systemPrompt-Dienst
 * @param {object} quellen die Quellen des Live-Zustands
 * @param {object} quellen.contract der Zustandsvertrag
 * @param {Function} quellen.state die aktuelle Zustandsaufnahme
 * @param {Function} [quellen.tone] der gelesene Scoring-Ton
 * @param {Function} [quellen.narrative] der gelesene Narrative-Composite
 * @param {Function} [quellen.userMood] die erkannte User-Stimmung
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
    narrative = () => null,
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
        narrative: typeof narrative === 'function' ? narrative() : null,
        userMood: typeof userMood === 'function' ? userMood() : null,
      });
      return live ?? '';
    },
  });
}

/**
 * Der Live-Zustand als EINE Runtime-Context-Nachricht.
 *
 * Kompakt und mit Herkunft: eine Zeile je Aspekt, und die Zeile sagt, woher
 * der Wert stammt. Gelesenes steht als gelesen da — die Persona behauptet
 * hier nichts, was sie nicht gelesen hat. Fehlt eine Quelle, fehlt die Zeile.
 *
 * @param {object} parts
 * @param {object} parts.contract   Der Zustandsvertrag (Stimmen, Tendenz, Narrative-Felder)
 * @param {object} parts.state      Der Zustand (sieben Felder)
 * @param {object|null} [parts.tone]      Der gelesene Ton des Scorings oder null
 * @param {object|null} [parts.narrative] Der gelesene Narrative-Composite oder null
 * @param {string|null} [parts.userMood]  Die erkannte Stimmung des Menschen oder null
 * @returns {string|null} der Block — oder null, wenn es nichts zu sagen gibt
 */
export function renderLiveContext(parts) {
  const { contract, state, tone, narrative, userMood } = parts ?? {};
  if (state === null || typeof state !== 'object') return null;
  const lines = [];
  const push = (label, value) => {
    if (value === null) return;
    lines.push(`- ${label}: ${value}`);
  };
  push('Zustand (Quelle: eigener Zustand)', renderStateLine(state));
  push('Beziehung (Quelle: gelesene Stufe, nie selbst gesetzt)', text(state.relation));
  push('Tendenz (Quelle: Scoring, gelesen)', renderTendencyLine(contract, tone));
  push('Narrative-Lage (Quelle: Narrative-Engine, gelesen, Interpretation)', renderNarrativeLine(contract, narrative));
  push('User-Lage (Quelle: letzter Menschenwort, gemessen)', text(userMood));
  if (lines.length === 0) return null;
  return ['## Persona-Live-Zustand', ...lines].join('\n');
}

/** Die sieben Zustandsfelder als eine Zeile — kompakt, ohne die Stimmen. */
function renderStateLine(state) {
  const parts = [];
  const mood = text(state.mood);
  const stance = text(state.stance);
  const uncertainty = text(state.uncertainty);
  if (mood !== null) parts.push(`Stimmung=${mood}`);
  if (stance !== null) parts.push(`Haltung=${stance}`);
  if (uncertainty !== null) parts.push(`Unsicherheit=${uncertainty}`);
  // Die Faehigkeiten und Grenzen stehen nur, wenn der Zustand sie traegt.
  // "Faehigkeiten=keine" waere eine Behauptung ueber den Zustand, nicht ueber
  // eine Luecke: ein leerer Zustand (noch nichts beobachtet) sagt nichts ueber
  // die Grenzen der Persona. Also: keine Zeile, wenn die Liste leer ist.
  const faehigkeiten = listOf(state.capabilities);
  if (faehigkeiten !== null) parts.push(`Fähigkeiten=${faehigkeiten}`);
  const grenzen = listOf(state.limitations);
  if (grenzen !== null) parts.push(`Grenzen=${grenzen}`);
  return parts.length === 0 ? null : parts.join('; ');
}

/**
 * Die Tendenz als eine Zeile — aber nur, wenn der Vertrag die Haltung kennt.
 * Eine unbekannte Haltung ergibt KEINE Zeile: die Persona erfindet keinen Ton.
 */
function renderTendencyLine(contract, tone) {
  if (tone === null || typeof tone !== 'object') return null;
  const stance = text(tone.stance);
  if (stance === null) return null;
  const voice = contract?.tendency?.voices?.[stance];
  if (voice === undefined || voice === null) return null;
  const levels = (Array.isArray(tone.tendencies) ? tone.tendencies : [])
    .filter((entry) => text(entry?.klasse) !== null && text(entry?.stufe) !== null)
    .map((entry) => `${entry.klasse} ${entry.stufe}`);
  const parts = [`Haltung=${stance}`];
  if (levels.length > 0) parts.push(`Lage=${levels.join(', ')}`);
  return parts.join('; ');
}

/**
 * Die Narrative-Lage als eine Zeile — aus den BESCHRIBTUNGEN des Vertrags.
 *
 * Die Klammer-Ergaenzung der Beschriftung entfaellt hier: sie verweist auf den
 * Abschnitt oberhalb, und im Kanal der Nachricht gibt es kein Oben. Dieselbe
 * Beschriftung traegt hier der Zustand selbst (Stimmung=… in der Zustandszeile).
 */
function renderNarrativeLine(contract, composite) {
  if (composite === null || typeof composite !== 'object' || Array.isArray(composite)) return null;
  const fields = contract?.narrative?.fields;
  if (fields === undefined || fields === null) return null;
  const parts = [];
  for (const [key, label] of Object.entries(fields)) {
    const value = composite[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${shortLabel(label)}=${String(value)}`);
  }
  if (parts.length === 0) return null;
  return parts.join('; ');
}

/** Die Beschriftung des Vertrags ohne ihre Klammer-Ergaenzung. */
function shortLabel(label) {
  if (typeof label !== 'string') return String(label);
  const head = label.split('(')[0].trim();
  return head === '' ? label : head;
}

/** Eine Liste als eine Zeile — leer heisst 'keine', nicht 'unbekannt'. */
function listOf(values) {
  // null statt 'keine': eine leere Liste sagt nichts ueber die Persona. Der
  // Aufrufer entscheidet, ob das eine Zeile wert ist.
  if (!Array.isArray(values)) return null;
  const items = values.map((value) => text(value)).filter((value) => value !== null);
  return items.length === 0 ? null : items.join(', ');
}

/** Ein Wert als Text — oder null, wenn er nichts aussagt. */
function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
