/**
 * version-state.js — die REINE Formelschicht des Versions-Banners.
 *
 * WARUM EINE EIGENE DATEI: das Banner ist das einzige, was der Mensch von der
 * Versionslage sieht, und es muss an zwei Orten dasselbe sagen — im Browser
 * (Client-Hälfte) und in der Zustandsantwort der Route (Host-Hälfte). Eine
 * Formel an zwei Orten ist zwei Formeln. Diese Datei ist die eine Formel; sie
 * kennt keine Uhr, kein Dateisystem und kein Netz — darum laufen ihre Tests
 * ohne node_modules (Konvention wie packages/codingmon/assets/mechanik.js).
 *
 * DIE FRAGE, DIE DIESE DATEI BEANTWORTET: „wie weit ist der installierte Stand
 * hinter dem neuesten?" — und die Antwort ist nie geraten: steht ein SHA nicht
 * fest, sagt das Banner das. Ein Banner, das eine Zahl erfindet, ist schlimmer
 * als keines, weil es eine Lage behauptet, die nicht gemessen wurde.
 */

/** Der Vertragsname des Zustands. Beide Seiten führen ihn als Literal. */
export const VERSION_CONTRACT = 'shinon.version/state-v1';

/**
 * Kürzt einen SHA auf die Länge, die ein Mensch im Badge liest.
 * @param {string|null|undefined} sha
 * @param {number} [length]
 * @returns {string} der gekürzte SHA oder '???????' — nie eine leere Zeile.
 */
export function shortSha(sha, length = 7) {
  const text = typeof sha === 'string' ? sha.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{7,40}$/.test(text)) return '???????';
  return text.slice(0, length);
}

/**
 * Der Vergleich zweier Stände. Beide Zahlen sind `null`, wenn sie nicht
 * gemessen werden konnten — `0` wäre eine Behauptung, die nichts belegt.
 * @param {{installed: string|null, latest: string|null}} state
 * @returns {{behind: number|null, ahead: number|null, upToDate: boolean, known: boolean}}
 */
export function compare(state) {
  const installed = state?.installed ?? null;
  const latest = state?.latest ?? null;
  if (typeof installed !== 'string' || typeof latest !== 'string') {
    return { behind: null, ahead: null, upToDate: false, known: false };
  }
  if (installed === latest) return { behind: 0, ahead: 0, upToDate: true, known: true };
  return { behind: state.behind ?? null, ahead: state.ahead ?? null, upToDate: false, known: true };
}

/**
 * Die Badge-Zeile: neuester Commit, installierter Commit, Ahead-Stand.
 * Reihenfolge und Kürzel sind Absicht — die Zeile bleibt unter 40 Zeichen,
 * damit sie unaufällig in einer Ecke stehen darf.
 * @param {object} state
 * @returns {string}
 */
export function badgeLine(state) {
  const latest = shortSha(state?.latest);
  const installed = shortSha(state?.installed);
  const cmp = compare(state);
  if (!cmp.known) return `${latest} · ${installed} · unbekannt`;
  if (cmp.behind === 0 && cmp.ahead === 0) return `${latest} · ${installed} · aktuell`;
  const ahead = cmp.ahead === null ? '?' : `+${cmp.ahead}`;
  const behind = cmp.behind === null ? '?' : `-${cmp.behind}`;
  return `${latest} · ${installed} · ${behind} ${ahead}`;
}

/**
 * Der Tooltip: dieselben Zahlen, ausgeschrieben. Wer den Badge nicht lesen
 * kann, soll die Lage trotzdem verstehen.
 * @param {object} state
 * @returns {string}
 */
export function badgeTitle(state) {
  const latest = state?.latest ?? 'unbekannt';
  const installed = state?.installed ?? 'unbekannt';
  const cmp = compare(state);
  if (!cmp.known) {
    return `Shinon — neuester Commit ${latest}, installiert ${installed}. ` +
      'Der Stand lässt sich nicht vergleichen (offline oder kein Git-Baum).';
  }
  if (cmp.upToDate) {
    return `Shinon — installiert ${shortSha(installed)} ist der neueste Commit ${shortSha(latest)}.`;
  }
  const hinter = cmp.behind === null ? 'unbekannt' : `${cmp.behind}`;
  const vorn = cmp.ahead === null ? 'unbekannt' : `${cmp.ahead}`;
  return `Shinon — neuester Commit ${shortSha(latest)}, installiert ${shortSha(installed)}: ` +
    `${hinter} Commits hinter main, ${vorn} Commits voraus. Klick: Shinon aktualisieren.`;
}

/**
 * Der Satz, den ein Klick ausloest — oder der Grund, warum er es nicht tut.
 * @param {object} state
 * @returns {string}
 */
export function updateLine(state) {
  if (state?.canUpdate !== true) {
    return typeof state?.updateHint === 'string' && state.updateHint !== ''
      ? state.updateHint
      : 'Kein updatefähiges Installat — der Stand wird nur durch eine Neuinstallation bewegt.';
  }
  const cmp = compare(state);
  if (cmp.upToDate) return 'Bereits aktuell — der installierte Stand ist der neueste Commit.';
  return 'Update wird vorbereitet: Kandidat bauen, abnehmen, beim nächsten Start übernehmen.';
}

/**
 * Das vollständige Banner-Modell — Host und Client rechnen daraus dasselbe.
 * @param {object} state
 * @returns {{contract: string, line: string, title: string, update: string, upToDate: boolean, known: boolean}}
 */
export function bannerModel(state) {
  const cmp = compare(state);
  return {
    contract: VERSION_CONTRACT,
    line: badgeLine(state),
    title: badgeTitle(state),
    update: updateLine(state),
    upToDate: cmp.upToDate,
    known: cmp.known,
  };
}
