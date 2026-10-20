/**
 * @shinon/prompter — salvage-store.js
 *
 * Der dauerhafte Zaehler der Prosa-Rettung (SALVAGED_PROSE), je Sitzung.
 *
 * Warum das ueberhaupt gespeichert wird: die Fallzahl im Entscheidungsdatensatz
 * beantwortet „zu oft?" — aber nur fuer den laufenden Prozess. Nach einem
 * Neustart begann dieselbe Sitzung wieder bei 1, und die Frage war nicht mehr
 * beantwortbar. Der Zaehler beschreibt trotzdem den LAUF (Sitzung), nicht den
 * Workspace: deshalb ein eigener Namensraum in der Ablage, keine Projektdatei.
 *
 * Reine Funktionen, keine Imports: die Formpruefung und der Deckel sind ohne
 * Ablage testbar (wie die uebrigen `assets/`-Kerne). Geschrieben wird im Host
 * ueber den einen Schreibweg des Project Index (`shinon_index_store`).
 */

/** Der eigene Raum in der Ablage — nie der des Scorings oder der Persona. */
export const SALVAGE_NAMESPACE = 'shinon.prompter-salvage/v1';
/** Der Vertrag der gespeicherten Form. */
export const SALVAGE_CONTRACT = 'shinon.prompter-salvage/v1';
/** Die eine Memo-Zeile; der Zustand steht darunter. */
export const SALVAGE_MEMO_ID = 'salvage';
/**
 * Deckel gegen unbegrenztes Wachstum: der Zaehler ist Diagnose, kein Archiv.
 * 200 Sitzungen reichen fuer „wie oft in dieser Sitzung" und halten die Zeile
 * klein; die aeltesten fallen zuerst weg.
 */
export const MAX_SALVAGE_SESSIONS = 200;

/** Eine leere, gueltige Form. */
export function emptySalvage() {
  return { contract: SALVAGE_CONTRACT, sessions: {} };
}

const isCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * Eine gespeicherte Form pruefen: fremde Vertraege werden verworfen, unlesbare
 * Zeilen fallen mit Zaehlung weg (nie raten). Ein gueltiger Stand mit 0 Faellen
 * existiert nicht — eine Sitzung entsteht erst mit dem ersten Fall.
 */
export function validateSalvage(value) {
  if (value === null || value === undefined) return { state: emptySalvage(), dropped: 0, foreign: false };
  if (typeof value !== 'object' || Array.isArray(value)) return { state: emptySalvage(), dropped: 0, foreign: true };
  if (value.contract !== SALVAGE_CONTRACT) return { state: emptySalvage(), dropped: 0, foreign: true };
  const sessions = {};
  let dropped = 0;
  for (const [id, entry] of Object.entries(value.sessions ?? {})) {
    if (typeof id !== 'string' || id === '' || entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      dropped += 1;
      continue;
    }
    if (!isCount(entry.count) || entry.count === 0) {
      dropped += 1;
      continue;
    }
    const byReason = {};
    for (const [reason, n] of Object.entries(entry.byReason ?? {})) {
      // Gruende sind die benannten Klassen des Enhancers (`NO_JSON`,
      // `INVALID_JSON`, zusammengesetzt mit `+`) — nie freier Text.
      if (/^[A-Z0-9_+]+$/.test(reason) && isCount(n) && n > 0) byReason[reason] = n;
      else dropped += 1;
    }
    sessions[id] = {
      count: entry.count,
      byReason,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    };
  }
  return { state: { contract: SALVAGE_CONTRACT, sessions }, dropped, foreign: false };
}

/** Die gespeicherte Zahl einer Sitzung (0, wenn unbekannt). */
export function salvageCountOf(state, sessionId) {
  const entry = state?.sessions?.[sessionId];
  return isCount(entry?.count) ? entry.count : 0;
}

/**
 * Einen Fall verbuchen — der Eingang bleibt unveraendert, der Stand ist neu.
 * Der Deckel greift nach dem Einfuegen und wirft die AELTESTEN Sitzungen weg.
 */
export function withSalvageCount(state, sessionId, reason, at) {
  const base = state !== null && typeof state === 'object' && state.sessions !== undefined && state.sessions !== null
    && typeof state.sessions === 'object' ? state.sessions : {};
  const previous = base[sessionId];
  const byReason = { ...(previous?.byReason ?? {}) };
  const key = typeof reason === 'string' && reason !== '' ? reason : 'NO_JSON';
  byReason[key] = (isCount(byReason[key]) ? byReason[key] : 0) + 1;
  const sessions = {
    ...base,
    [sessionId]: {
      count: (isCount(previous?.count) ? previous.count : 0) + 1,
      byReason,
      updatedAt: typeof at === 'string' ? at : '',
    },
  };
  const ids = Object.keys(sessions);
  if (ids.length > MAX_SALVAGE_SESSIONS) {
    ids.sort((a, b) => String(sessions[a].updatedAt).localeCompare(String(sessions[b].updatedAt)));
    for (const id of ids.slice(0, ids.length - MAX_SALVAGE_SESSIONS)) delete sessions[id];
  }
  return { contract: SALVAGE_CONTRACT, sessions };
}
