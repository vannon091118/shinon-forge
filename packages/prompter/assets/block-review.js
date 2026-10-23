/**
 * @shinon/prompter — block-review.js (Phase 4: Vorschlag → Prüfung → Aktivierung).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie `note-core.js`. Die drei Prüfungen selbst
 * (`zu spitz`, `zu breit`, `doppelt`) stehen in `note-core.js#reviewNotes` und
 * werden vom Host auf die Zettel-HÜLLE des Vorschlags angewendet; was HIER
 * steht, ist nur baustein-spezifisch: Form des Blocks, Duplikat gegen AKTIVE
 * Bausteine (die keine Zettel sind) und das Zusammenführen mit der Registry.
 *
 * Ein Vorschlag ist eine Zettel-Hülle mit Block-Kern: { thema, bei, immer,
 * weil, beleg, block: { id, quelle, lage, modus, budgetTokens, ausloeser } }.
 * Die Hülle prüft der Veredler wie jeden Zettel (Form via `parseNote`, die drei
 * Prüfungen via `reviewNotes` — der Host ruft beides auf); der Kern wird hier
 * geprüft. Nur was beides besteht, wird aktiv.
 */

/** Schmaler Dienst: ein Aufruf `propose`, fail-closed mit Befundliste. */
export const PROPOSE_SERVICE = 'shinon_block_propose';
export const PROPOSE_CONTRACT = 'shinon.block-propose/v1';

/** Vertragsname der gelernten Ablage (Projekt, nicht Tarball). */
export const LEARNED_CONTRACT = 'shinon.blocks-learned/v1';

/** Vorgabepfad der gelernten Bausteine (relativ zum ARBEITSVERZEICHNIS). */
export const LEARNED_DEFAULT_PATH = '.shinon/blocks.learned.json';

/**
 * Erlaubte Lagen — dieselben wie in der Registry.
 *
 * `runtime-context` ist die Nachricht, die pro Schritt den vorherigen Stand
 * ERSETZT (Persona-Live-Block, Projektkontext, Aufgabenbrief) — weder
 * System-Abschnitt noch Nutzertext. Der einzige dynamische Zustand landet dort
 * und nicht in einem Abschnitt; die Lage muss also einen Namen haben, den die
 * Pruefung kennt, sonst waere der Registry-Eintrag Daten, die ihr eigener
 * Waechter ablehnen wuerde.
 */
export const BLOCK_LAGEN = ['system', 'one-shot-system', 'user', 'one-shot-input', 'runtime-context'];

/** Erlaubte Modi — dieselben drei wie im Modus-Vertrag. */
export const BLOCK_MODI = ['MIN', 'MID', 'MAX'];

/** Obergrenze eines Baustein-Budgets: kein Baustein frisst den Index. */
export const MAX_BLOCK_BUDGET = 6000;

/** Ein Objekt, kein Array, kein null. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Begriffe eines Textes — Zwilling von `note-core.js#tokens` (gleiche
 * Zerlegung, kein Import): kleingeschrieben, jedes Nicht-Buchstabe/Ziffer ein
 * Trenner, ab Mindestlänge.
 */
export function reviewTokens(text, minLength = 4) {
  const found = [];
  for (const part of String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (part.length >= minLength) found.push(part);
  }
  return found;
}

/**
 * Den Block-Kern prüfen — Form, keine Meinung.
 * @returns { ok: true, block } | { ok: false, reason }
 */
export function validateBlockCore(block) {
  if (!isRecord(block)) return { ok: false, reason: 'BLOCK_KEIN_OBJEKT' };
  if (typeof block.id !== 'string' || block.id.trim() === '') {
    return { ok: false, reason: 'BLOCK_ID_LEER' };
  }
  if (typeof block.quelle !== 'string' || block.quelle.trim() === '') {
    return { ok: false, reason: 'BLOCK_QUELLE_LEER' };
  }
  if (!BLOCK_LAGEN.includes(block.lage)) {
    return { ok: false, reason: `BLOCK_LAGE_FREMD:${String(block.lage)}` };
  }
  if (!Array.isArray(block.modus) || block.modus.length === 0 || !block.modus.every((mode) => BLOCK_MODI.includes(mode))) {
    return { ok: false, reason: 'BLOCK_MODUS_UNGUELTIG' };
  }
  if (!Number.isInteger(block.budgetTokens) || block.budgetTokens < 1 || block.budgetTokens > MAX_BLOCK_BUDGET) {
    return { ok: false, reason: `BLOCK_BUDGET_UNGUELTIG:${String(block.budgetTokens)}` };
  }
  if (!isRecord(block.ausloeser) || Object.keys(block.ausloeser).length === 0) {
    return { ok: false, reason: 'BLOCK_AUSLOESER_LEER' };
  }
  return {
    ok: true,
    block: {
      id: block.id,
      quelle: block.quelle,
      lage: block.lage,
      modus: [...block.modus],
      budgetTokens: block.budgetTokens,
      pflicht: false,
      ausloeser: { ...block.ausloeser },
      herkunft: typeof block.herkunft === 'string' ? block.herkunft : 'gelernt (Agenten-Vorschlag)',
    },
  };
}

/**
 * Die Hülle eines Vorschlags ziehen — der Host prüft sie via `parseNote` und
 * `reviewNotes` wie jeden Zettel. Hier nur: anwesend und geformt.
 * @returns { ok: true, shell } | { ok: false, reason }
 */
export function validateProposalShell(proposal) {
  if (!isRecord(proposal)) return { ok: false, reason: 'VORSCHLAG_KEIN_OBJEKT' };
  for (const key of ['thema', 'bei', 'immer', 'weil', 'beleg']) {
    if (typeof proposal[key] !== 'string' || proposal[key].trim() === '') {
      return { ok: false, reason: `VORSCHLAG_FELD_LEER:${key}` };
    }
  }
  return {
    ok: true,
    shell: {
      thema: proposal.thema.trim(),
      bei: proposal.bei.trim(),
      immer: proposal.immer.trim(),
      weil: proposal.weil.trim(),
      beleg: proposal.beleg.trim(),
    },
  };
}

/**
 * Duplikat gegen AKTIVE Bausteine — dieselbe Rechnung wie `reviewNotes`, aber
 * die Gegenseite sind keine Zettel: gleiche Themenmarke UND geteilte Begriffe
 * zwischen Anweisung und den Markern des Blocks (seine Haystack-Marker plus id).
 *
 * Die Marke eines Blocks: seine id plus alle Begriffe seiner
 * `ausloeser.haystack`-Marker. Ein Vorschlag ohne gemeinsame Marke ist kein
 * Duplikat, sondern ein neues Thema — auch bei ähnlicher Anweisung.
 */
export function duplicateVsBlocks({ thema, immer }, activeBlocks = [], reading = {}) {
  const minShared = typeof reading.minShared === 'number' ? reading.minShared : 2;
  const minShare = typeof reading.minShare === 'number' ? reading.minShare : 0.5;
  const minLength = typeof reading.minTokenLength === 'number' ? reading.minTokenLength : 4;
  const themaTerms = reviewTokens(thema, minLength);
  const immerTerms = new Set(reviewTokens(immer, minLength));
  if (themaTerms.length === 0 || immerTerms.size === 0) return [];
  const findings = [];
  for (const block of Array.isArray(activeBlocks) ? activeBlocks : []) {
    if (!isRecord(block) || typeof block.id !== 'string') continue;
    // Nur Listen zählen als Marker: zwei Registry-Einträge tragen `haystack`
    // als Beschreibungstext (keine Liste) — Text ist kein Anlass (gemessen als
    // `.join`-Bruch über stand-zettel/skills-block). `matchBlock` hütet
    // dieselbe Stelle mit `Array.isArray`; beide Seiten sagen dasselbe.
    const haystack = block.ausloeser?.haystack;
    const markers = new Set([
      ...reviewTokens(block.id, 1),
      ...reviewTokens(Array.isArray(haystack) ? haystack.join(' ') : '', minLength),
    ]);
    const markeTeilt = themaTerms.every((term) => markers.has(term)) || themaTerms.join(' ') === String(block.id).toLowerCase();
    if (!markeTeilt) continue;
    const shared = [...immerTerms].filter((term) => markers.has(term)).length;
    const share = Math.min(immerTerms.size, markers.size) === 0 ? 0 : shared / Math.min(immerTerms.size, markers.size);
    if (shared >= minShared && share >= minShare) {
      findings.push(`doppelt: mit ${block.id} (${shared} gemeinsame Begriffe, Anteil ${Math.round(share * 100)}%)`);
    }
  }
  return findings;
}

/**
 * Gelernte Bausteine mit der Registry zusammenführen — gelernt STICHT paket
 * (gleiche id ersetzt), Neues hängt an. Pflicht bleibt Paket-Sache: ein
 * gelernter Baustein kann nie Pflicht werden (der Aufrufer erzwingt `false`).
 */
export function mergeLearnedBlocks(registryBlocks = [], learnedBlocks = []) {
  const merged = [];
  const learnedById = new Map();
  for (const block of Array.isArray(learnedBlocks) ? learnedBlocks : []) {
    if (isRecord(block) && typeof block.id === 'string') learnedById.set(block.id, { ...block, pflicht: false });
  }
  for (const block of Array.isArray(registryBlocks) ? registryBlocks : []) {
    if (!isRecord(block) || typeof block.id !== 'string') continue;
    merged.push(learnedById.has(block.id) ? learnedById.get(block.id) : block);
    learnedById.delete(block.id);
  }
  for (const block of learnedById.values()) merged.push(block);
  return merged;
}

/**
 * Die gelernte Ablage prüfen — Form je Baustein, gezählt statt geraten.
 * @returns { blocks, dropped }
 */
export function validateLearnedFile(parsed) {
  if (!isRecord(parsed) || parsed.contract !== LEARNED_CONTRACT) {
    return { blocks: [], dropped: 0, foreign: true };
  }
  const raw = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const blocks = [];
  let dropped = 0;
  const seen = new Set();
  for (const entry of raw) {
    const checked = validateBlockCore(entry);
    if (!checked.ok || seen.has(checked.block.id)) {
      dropped += 1;
      continue;
    }
    seen.add(checked.block.id);
    blocks.push(checked.block);
  }
  return { blocks, dropped, foreign: false };
}
