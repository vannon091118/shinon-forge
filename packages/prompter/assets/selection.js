/**
 * @shinon/prompter — selection.js (Slice 1: Selektionsarchitektur).
 *
 * Kein Bare-Import; der Text kommt als Ressource über `prompt-text.js` (nur
 * `node:fs`), damit die Vertragsprüfung in CI ohne `node_modules` läuft.
 *
 * WAS HIER STEHT: der SELEKTIONSVERTRAG (`shinon.selection/v1`). Ein kleiner
 * Selektionsagent bekommt pro Schritt nur KOMPAKTE Beschreibungen der
 * Bausteine (id, lage, budget, kanalischer Zusammус), niemals deren vollen
 * Text — Inhalt lädt die Runtime erst NACH der Auswahl. Die Antwort muss ein
 * strenges JSON sein; was den Vertrag verletzt, wird verworfen (fail-closed)
 * und die deterministische Auswahl bleibt der Rückfall.
 * WAS HIER NICHT STEHT: kein Modell, kein Netz, kein Dateisystem — nur Bauen,
 * Prüfen, Entscheiden-über-Form. Der Modellaufruf selbst bleibt im Host (so wie
 * beim Enhancer), die Antwortprüfung ist hier, damit sie ohne node_modules
 * testbar ist.
 *
 * DIE EINE REGEL: Der Agent schlägt vor, die Runtime setzt Verträge durch.
 * Unbekannte IDs verwirft die Runtime; Bausteine, die der aktuelle Modus
 * nicht erlaubt, verwirft sie; Grenzen (Budget, Unsicherheit) setzt sie selbst.
 */

import { promptText } from './prompt-text.js';

/** Vertragsname der Agenten-Antwort — steht auch IN der Antwort drin. */
export const SELECTION_CONTRACT = 'shinon.selection/v1';

/** Höchstes zulässiges Unsicherheitsmaß der Antwort (0 bis 1, inklusive). */
export const MAX_UNCERTAINTY = 1;

/** Mindestes maß: darunter ist die Antwort „ohne Unsicherheit“ — erlaubt. */
export const MIN_UNCERTAINTY = 0;

/**
 * Ein System-Prompt für den Selektionsagenten — erzeugt, nicht hinterlegt
 * (kein Manifest-Monolith): dieselbe Bauweise wie `policyFor` in `mode-core.js`.
 *
 * Er sagt dem Agenten, WAS er liefern muss und WAS nicht: keine Prompttexte,
 * keine neuen Regeln, keine Identitätsänderung — nur IDs aus der Liste, eine
 * Begründung je ID und ein Unsicherheitsmaß. Der Vertrag unten schließt alles
 * andere ohnehin aus.
 */
export function selectionSystemBrief() {
  return promptText('prompter-selection-brief', { contract: SELECTION_CONTRACT });
}

/**
 * Eine Kandidatenliste für den Aufruf rendern — kompakte Beschreibungen,
 * ohne Inhalt.
 */
export function renderCandidates(blocks = []) {
  return blocks.map((block) => ({
    id: block.id,
    lage: typeof block.lage === 'string' ? block.lage : 'user',
    budget: typeof block.budgetTokens === 'number' ? block.budgetTokens : 0,
    pflicht: block.pflicht === true,
    ausloeser: summarizeTrigger(block.ausloeser),
  }));
}

/** Auslöser in eine KOMPAKTE Beschreibung kürzen — nie Inhalt. */
function summarizeTrigger(ausloeser) {
  if (ausloeser === null || typeof ausloeser !== 'object' || Array.isArray(ausloeser)) return '(ohne)';
  const parts = [];
  if (Array.isArray(ausloeser.intentKlassen) && ausloeser.intentKlassen.length > 0) parts.push(`intent=${ausloeser.intentKlassen.join('|')}`);
  if (Array.isArray(ausloeser.haystack) && ausloeser.haystack.length > 0) parts.push(`haystack=${ausloeser.haystack.join(',')}`);
  if (Array.isArray(ausloeser.scoringHaltung) && ausloeser.scoringHaltung.length > 0) parts.push(`haltung=${ausloeser.scoringHaltung.join('|')}`);
  if (ausloeser.immer === true) parts.push('immer');
  return parts.length > 0 ? parts.join(' ') : '(allgemein)';
}

/**
 * Die Antwort des Agenten prüfen — streng, fail-closed.
 *
 * Prüfungen in fester Reihenfolge (jede gibt einen benannten Grund):
 *   KEIN_JSON       nicht-parsbares JSON
 *   VERTRAG_FREMD   falscher oder fehlender contract
 *   UNSICHERHEIT    kein Zahlwert 0..1 (Vektor der Unsicherheit)
 *   LEERE_AUSWAHL   selected nicht als Array (leer erlaubt — dann greift der Fallback)
 *   ID_UNBEKANNT    id nicht in der erlaubten Liste (der Kern des Vertrags)
 *   NICHT_ERLAUBT   der Kandidat ist für den gegebenen Modus NICHT freigegeben (id)
 *   PFLICHT_FEHLT   eine Pflicht-ID fehlt bei nicht-leerer Auswahl (id)
 *   BUDGET          Aufruftrag-Budgetverletzung (Kandidat > Gesamtbudget)
 *
 * @param text     - die Rohantwort (oder ein Objekt, schon geparst)
 * @param allowed - die erlaubten { id, budgetTokens, modus?, pflicht? } der Situation
 * @param opts    - { totalBudgetTokens, mode } — ohne `mode` wird die
 *                  Modus-Freigabe übersprungen (der Host schickt ihn immer)
 * @returns { ok: true, selected, uncertainty } | { ok: false, reason }
 */
export function parseSelection(text, allowed = [], opts = {}) {
  let parsed = text;
  if (typeof text === 'string') {
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      return { ok: false, reason: 'KEIN_JSON' };
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'KEIN_OBJEKT' };
  }
  if (parsed.contract !== SELECTION_CONTRACT) {
    return { ok: false, reason: `VERTRAG_FREMD:${String(parsed.contract)}` };
  }
  const uncertainty = parsed.uncertainty;
  if (typeof uncertainty !== 'number' || !Number.isFinite(uncertainty)
      || uncertainty < MIN_UNCERTAINTY || uncertainty > MAX_UNCERTAINTY) {
    return { ok: false, reason: 'UNSICHERHEIT' };
  }
  const selected = parsed.selected;
  if (!Array.isArray(selected)) return { ok: false, reason: 'LEERE_AUSWAHL' };

  const known = new Map();
  for (const entry of Array.isArray(allowed) ? allowed : []) {
    if (entry !== null && typeof entry === 'object' && typeof entry.id === 'string') {
      known.set(entry.id, entry);
    }
  }
  const total = typeof opts.totalBudgetTokens === 'number' && opts.totalBudgetTokens > 0
    ? opts.totalBudgetTokens
    : Infinity;

  const seen = new Set();
  const ids = [];
  let budget = 0;
  for (const entry of selected) {
    if (entry === null || typeof entry !== 'object') return { ok: false, reason: 'KEINE_ID' };
    const id = entry.id;
    if (typeof id !== 'string' || id === '') return { ok: false, reason: 'KEINE_ID' };
    if (seen.has(id)) continue;
    seen.add(id);
    const candidate = known.get(id);
    if (candidate === undefined) return { ok: false, reason: `ID_UNBEKANNT:${id}` };
    if (typeof opts.mode === 'string' && Array.isArray(candidate.modus) && !candidate.modus.includes(opts.mode)) {
      return { ok: false, reason: `NICHT_ERLAUBT:${id}` };
    }
    const cost = typeof candidate.budgetTokens === 'number' ? candidate.budgetTokens : 0;
    if (budget + cost > total) return { ok: false, reason: `BUDGET:${id}` };
    budget += cost;
    ids.push(id);
  }
  // Pflicht fehlt nur bei einer WIEDERGEGEBENEN Auswahl: ein leerer Vorschlag
  // fällt zurück, und die Pflicht lädt die Runtime unabhängig (Slice 2).
  // Wer wählt und dabei die Pflicht weglässt, verstößt gegen den Vertrag.
  if (ids.length > 0) {
    const missing = [...known.values()].find((candidate) => candidate.pflicht === true && !seen.has(candidate.id));
    if (missing !== undefined) return { ok: false, reason: `PFLICHT_FEHLT:${missing.id}` };
  }
  return { ok: true, selected: ids, budget, uncertainty };;
}