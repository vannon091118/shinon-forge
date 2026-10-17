/**
 * @shinon/prompter — block-select.js
 *
 * Der Baustein-Selektor (Phase 2): verallgemeinert die `selectNotes`/
 * `selectSkills`-Mechanik auf ALLE Bausteine der Registry (`blocks.json`).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie `note-core.js`. Die `tokens`-Zerlegung ist
 * deshalb hier absichtlich dupliziert statt importiert (begrenzte, benannte
 * Duplikation wie bei den Zwillingen, kein heimliches Teilen).
 *
 * WAS HIER STEHT: Haystack bauen, Bausteine matchen, Budgets deckeln,
 * Entscheidungsanteil bauen. Alles rein: gleiche Eingabe, gleiche Auswahl.
 * WAS HIER NICHT STEHT: kein Modell (der Laufzeit-Dienst wird hier weder
 * gelesen noch aufgerufen — der Paket-Test pinnt das statisch), keine Uhr,
 * kein Dateisystem, kein Netz. Fehlt eine Quelle, fehlt der Baustein
 * (fail-open); der Schritt läuft immer weiter.
 *
 * Semantik eines Treffers (erste zutreffende Achse gewinnt, in dieser
 * Reihenfolge): PFLICHT > TRIGGER > INTENT > HALTUNG > EREIGNIS > HAYSTACK.
 * Die Reihung ist Teil des Vertrags: Pflicht zuerst (Registry-Reihenfolge),
 * dann Treffer absteigend, dann id aufsteigend. Budgets werden in genau dieser
 * Reihenfolge verbraucht; Pflicht sprengt das Gesamtbudget nie still — sie
 * steht immer, Situatives weicht mit BUDGET_ERSCHOEPFT.
 */

/** Vertragsname der Registry — dieselbe Zeichenkette wie in `blocks.json`. */
export const BLOCKS_CONTRACT = 'shinon.blocks/v1';

/** Pfad der Registry, relativ zum Paket (wie NOTE_RULES_PATH). */
export const BLOCKS_PATH = './assets/blocks.json';

/** Gesamtdeckel, wenn der Aufrufer keinen nennt: Pflicht (900) + Luft. */
export const DEFAULT_TOTAL_BUDGET = 3000;

/**
 * Naht-Spiegel (vierte Naht, Phase 3): Besitzer der beiden Namen ist
 * `@shinon/scoring` (`assets/block-weights.js`); Pakete lesen einander nicht,
 * deshalb stehen sie hier als Literal und `scripts/gate/tests/context-wiring.test.mjs`
 * pinnt die Gleichheit beider Seiten — dieselbe Bauform wie beim Ton.
 */
export const WEIGHTS_SERVICE = 'shinon_block_weights';
export const WEIGHTS_CONTRACT = 'shinon.block-weights/read-v1';

/** Begriffs-Mindestlänge — dieselbe wie bei Zetteln und Skills. */
export const MIN_TOKEN_LENGTH = 4;

/**
 * Selbstfrage-Marker (Daten, kein Import): Spiegel der Kernmenge von TRIGGERS
 * in `packages/persona/index.js`. Pakete importieren einander zur Laufzeit
 * nicht (jedes Bundle reist eigenständig); die Spiegelung steht in der
 * `herkunft` der betroffenen Registry-Einträge. Neue Triggerwörter in der
 * Persona gehören auch hierher — der Registry-Test meldet Drift über die
 * Trefferquote, nicht über einen Import.
 */
export const SELF_QUESTION_MARKERS = [
  'wer bist du',
  'stell dich vor',
  'was kannst du',
  'dein name',
  'wie heißt du',
  'wie heisst du',
  'sag mir wer du bist',
  'shinon',
];

/**
 * Begriffe eines Textes: kleingeschrieben, jedes Nicht-Buchstabe/Ziffer ein
 * Trenner (Unicode) — dieselbe Zerlegung wie `note-core.js#tokens`, damit ein
 * Marker dort und hier gleich zählt.
 */
export function tokens(text, minLength = MIN_TOKEN_LENGTH) {
  const found = [];
  for (const part of String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (part.length >= minLength) found.push(part);
  }
  return found;
}

/** Ein Objekt, kein Array, kein null. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Die Registry prüfen — fail-closed beim Laden, nicht beim Wählen.
 * @returns { ok: true } | { ok: false, reason }
 */
export function validateRegistry(registry) {
  if (!isRecord(registry)) return { ok: false, reason: 'KEIN_OBJEKT' };
  if (registry.contract !== BLOCKS_CONTRACT) {
    return { ok: false, reason: `VERTRAG_FREMD:${String(registry.contract)}` };
  }
  if (!Array.isArray(registry.blocks) || registry.blocks.length === 0) {
    return { ok: false, reason: 'KEINE_BAUSTEINE' };
  }
  const required = ['id', 'quelle', 'ausloeser', 'budgetTokens', 'modus', 'pflicht'];
  const seen = new Set();
  for (const block of registry.blocks) {
    if (!isRecord(block)) return { ok: false, reason: 'KEIN_BAUSTEIN' };
    for (const key of required) {
      if (block[key] === undefined || block[key] === null) {
        return { ok: false, reason: `FELD_FEHLT:${key}` };
      }
    }
    if (typeof block.id !== 'string' || block.id === '') return { ok: false, reason: 'ID_LEER' };
    if (seen.has(block.id)) return { ok: false, reason: `ID_DOPPELT:${block.id}` };
    seen.add(block.id);
    if (!Array.isArray(block.modus) || block.modus.length === 0) {
      return { ok: false, reason: `MODUS_LEER:${block.id}` };
    }
    if (typeof block.budgetTokens !== 'number' || !(block.budgetTokens > 0)) {
      return { ok: false, reason: `BUDGET_UNGUELTIG:${block.id}` };
    }
    if (!isRecord(block.ausloeser)) return { ok: false, reason: `AUSLOESER_KEIN_OBJEKT:${block.id}` };
  }
  return { ok: true };
}

/**
 * Den Heuhaufen bauen — dieselbe Naht wie `standFor`: Prompttext plus alles,
 * was der Lauf aufgelöst hat (Projekt, Pfade, Symbole, Constraints, Touches,
 * Dependencies). DateiINHALTE gehören nicht dazu: sie würden jeden Baustein
 * laden, dessen Marker irgendwo im Projekt vorkommt — und damit jeden.
 */
export function buildHaystack(promptText, context = null) {
  return [
    String(promptText ?? ''),
    context?.project ?? '',
    ...(Array.isArray(context?.files) ? context.files.map((file) => file?.path ?? '') : []),
    ...(Array.isArray(context?.symbols) ? context.symbols : []),
    ...(Array.isArray(context?.constraints) ? context.constraints : []),
    ...(Array.isArray(context?.touches) ? context.touches : []),
    ...(Array.isArray(context?.dependencies) ? context.dependencies : []),
  ];
}

/**
 * Welche Quelle ein Baustein braucht — und ob sie da ist. Nur Achsen, die der
 * Aufrufer wirklich kennt, sperren: Was der Prompter nicht sieht (Persona-Datei,
 * Scoring-Dienst), sperrt nicht, sondern matcht über Haystack/Intent/Haltung.
 * Ein Baustein, dessen Quelle BELEGT fehlt, lädt nie (fail-open mit Grund).
 */

/** Bausteine, deren Inhalt eine eigene Pipeline lädt (Gate, kein Zweitleser). */
const PIPELINE_BLOCKS = ['stand-zettel', 'skills-block', 'intent-expansion'];

function sourceReady(block, available) {
  const a = isRecord(available) ? available : {};
  switch (block.id) {
    case 'persona-project-context':
      // Gehört der Persona (Datei + Shinon-Projekt-Gate dort); hier nur Kandidat.
      return { ready: true, reason: null };
    case 'index-project-context':
      return a.contextPresent === true
        ? { ready: true, reason: null }
        : { ready: false, reason: 'QUELLE_FEHLT:kontext' };
    case 'stand-zettel':
      return a.notesOn === true
        ? { ready: true, reason: null }
        : { ready: false, reason: 'QUELLE_FEHLT:zettel' };
    case 'skills-block':
      return a.skillsOn === true
        ? { ready: true, reason: null }
        : { ready: false, reason: 'QUELLE_FEHLT:skills' };
    case 'intent-expansion':
      return a.intentOn === true
        ? { ready: true, reason: null }
        : { ready: false, reason: 'QUELLE_FEHLT:intent' };
    default:
      break;
  }
  if (block.quelle === 'narrative') {
    return a.narrative === true
      ? { ready: true, reason: null }
      : { ready: false, reason: 'QUELLE_FEHLT:narrative' };
  }
  return { ready: true, reason: null };
}

/**
 * Die KANDIDATEN einer Situation: alles, was Modus und Quelle zulassen —
 * unabhängig davon, ob ein Auslöser gerade feuert.
 *
 * Genau diese Liste bekommt der Selektionsagent (ohne Inhalt, nur id/lage/
 * budget/ausloeser): er darf nur wählen, was die Runtime ohnehin freigegeben
 * hat. Dieselben zwei Achsen wie `matchBlock` — eine zweite Wahrheit über die
 * Freigabe gäbe es sonst, und der Agent könnte einen Modus- oder Quellensperre
 * umgehen, indem er die id einfach nennt.
 */
export function candidateBlocks(registry, opts = {}) {
  const blocks = Array.isArray(registry?.blocks) ? registry.blocks : [];
  const candidates = [];
  for (const block of blocks) {
    if (typeof block?.id !== 'string' || block.id === '') continue;
    if (typeof opts.mode === 'string' && Array.isArray(block.modus) && !block.modus.includes(opts.mode)) continue;
    if (!sourceReady(block, opts.available).ready) continue;
    candidates.push(block);
  }
  return candidates;
}

/**
 * EINEN Baustein matchen — rein, ohne Modell, ohne Uhr.
 * @returns { selected, hits, reason } — `hits` zählt Haystack-Treffer (Ranking).
 */
export function matchBlock(block, input = {}) {
  const mode = input.mode;
  const ausloeser = isRecord(block?.ausloeser) ? block.ausloeser : {};
  if (typeof mode === 'string' && Array.isArray(block?.modus) && !block.modus.includes(mode)) {
    return { selected: false, hits: 0, reason: 'MODUS_FREMD' };
  }
  const source = sourceReady(block, input.available);
  if (!source.ready) return { selected: false, hits: 0, reason: source.reason };

  // Pipeline-Bausteine: die Quelle IST der Anlass — ihre Inhalte liegen in
  // einer eigenen Pipeline (Zettelverzeichnis, Skillordner, Intent-Datei), die
  // der Host NACH dieser Auswahl lädt. Auslöser-Texte werten hier nichts: wer
  // regelkonform „an“ ist, wird gewählt (QUELLE_BEREIT), wer aus ist, kam
  // bereits mit QUELLE_FEHLT heraus. Das ist die Migration: kein zweites
  // Parallelsystem neben selectNotes/selectSkills, sondern EIN Gate.
  if (PIPELINE_BLOCKS.includes(block.id)) {
    return { selected: true, hits: 0, reason: `QUELLE_BEREIT:${block.id}` };
  }

  // Pflicht: immer, ohne Anlass — der einzige Baustein ohne Warum.
  if (ausloeser.immer === true || block?.pflicht === true) {
    return { selected: true, hits: 0, reason: 'PFLICHT' };
  }

  const promptText = String(input.promptText ?? '');
  const lowerPrompt = promptText.toLowerCase();

  // TRIGGER: Selbstfrage-Marker im Prompt (Anrede, keine Wissensabfrage).
  if (ausloeser.triggerwoerter !== undefined) {
    const hit = SELF_QUESTION_MARKERS.some((marker) => lowerPrompt.includes(marker));
    if (hit) return { selected: true, hits: 0, reason: 'TRIGGER:selbstfrage' };
  }

  // INTENT: die Klasse des Schritts steht im Auslöser.
  const intentClass = input.intentClass;
  if (typeof intentClass === 'string' && Array.isArray(ausloeser.intentKlassen)) {
    if (ausloeser.intentKlassen.includes(intentClass)) {
      return { selected: true, hits: 0, reason: `INTENT:${intentClass}` };
    }
  }

  // HALTUNG: die gelesene Scoring-Haltung (Substring, kleingeschrieben —
  // die Registry spricht Deutsch, das Scoring kurze Stufen).
  const stance = input.stance;
  if (typeof stance === 'string' && stance !== '' && Array.isArray(ausloeser.scoringHaltung)) {
    const lower = stance.toLowerCase();
    const hit = ausloeser.scoringHaltung.some(
      (wanted) => typeof wanted === 'string' && wanted !== '' && lower.includes(wanted.toLowerCase()),
    );
    if (hit) return { selected: true, hits: 0, reason: `HALTUNG:${stance}` };
  }

  // EREIGNIS: frische Spine-Signale (z. B. action.blocked → Workaround).
  const recentEvents = Array.isArray(input.available?.recentEvents) ? input.available.recentEvents : [];
  if (Array.isArray(ausloeser.ereignisse) && ausloeser.ereignisse.length > 0 && recentEvents.length > 0) {
    const hit = ausloeser.ereignisse.find((event) => recentEvents.includes(event));
    if (hit !== undefined) return { selected: true, hits: 0, reason: `EREIGNIS:${hit}` };
  }

  // HAYSTACK: Marker-Begriffe im aufgelösten Kontext — die Zettel-Mechanik.
  if (Array.isArray(ausloeser.haystack) && ausloeser.haystack.length > 0) {
    const words = input.words instanceof Set ? input.words : new Set(tokens((input.haystack ?? []).join(' ')));
    const marks = tokens(ausloeser.haystack.join(' '));
    const hits = marks.filter((mark) => words.has(mark)).length;
    if (hits > 0) return { selected: true, hits, reason: `HAYSTACK:${hits}` };
  }

  // Eine belegte Quelle IST der Anlass — aber nur, wo Anwesenheit gleich
  // Inhalt ist: ein vorhandener Narrative-Composite trägt Daten, eine
  // vorhandene Projekt-Kontextdatei auch. Ein vorhandener DIENST allein (z. B.
  // Scoring ohne Haltung) sagt nichts und löst nichts aus — sonst stünde ein
  // leerer Block im Prompt und behauptete, was niemand gelesen hat.
  if (block?.quelle === 'narrative' && input.available?.narrative === true) {
    return { selected: true, hits: 0, reason: 'QUELLE_BEREIT:narrative' };
  }
  if (block?.quelle === 'project-index' && input.available?.contextPresent === true) {
    return { selected: true, hits: 0, reason: 'QUELLE_BEREIT:kontext' };
  }
  if (typeof ausloeser.datei === 'string' && input.available?.projectContextFile === true) {
    return { selected: true, hits: 0, reason: 'QUELLE_BEREIT:datei' };
  }
  // Ein temperierter DIENST allein löst nichts aus, aber EIN GELESENER TON
  // schon: `available.tone` sagt, dass das Scoring eine echte Haltung lieferte
  // — dann steht der Stand-Haltungsbaustein zur Wahl (und Budget/Gewicht dürfen
  // ihn noch abschneiden). Ohne gelesenen Ton bleibt es beim leisen Versagen.
  if (typeof ausloeser.dienst === 'string' && input.available?.tone === true) {
    return { selected: true, hits: 0, reason: 'QUELLE_BEREIT:ton' };
  }

  return { selected: false, hits: 0, reason: 'NICHT_AUSGELOEST' };
}

/**
 * Der Rang aus gelernten Gewichten — 0 für unbekannt (kein Raten).
 *
 * Zwilling der Rechnung in `@shinon/scoring` (`rankScore` dort): dieselben
 * fünf Zeilen, kein Import (Pakete lesen einander nicht). Das Gewicht wirkt
 * NUR als Gleichstands-Brecher nach den Treffern — siehe die Reihung unten.
 */
function weightScore(weights, id) {
  const entry = weights !== null && typeof weights === 'object' && !Array.isArray(weights) ? weights[id] : null;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return 0;
  const up = Number.isInteger(entry.up) && entry.up >= 0 ? entry.up : 0;
  const down = Number.isInteger(entry.down) && entry.down >= 0 ? entry.down : 0;
  return up - down;
}

/**
 * Alle Bausteine wählen — deterministisch, gedeckelt, fail-open.
 *
 * @param registry - validierte Registry (`validateRegistry`).
 * @param opts - { mode, promptText, context, intentClass, stance, available,
 *   weights, totalBudgetTokens, includeIds } — `available`: { contextPresent,
 *   notesOn, skillsOn, intentOn, narrative, recentEvents }; `weights`: gelernte
 *   Zähler ({ id: { up, down } }), wirken nur als Gleichstands-Brecher nach
 *   Treffern; `includeIds`: der Vorschlag des Selektionsagenten (nur IDs aus
 *   `candidateBlocks`).
 * @returns { selected: [{ id, quelle, hits, reason, budgetTokens }],
 *   skipped: [{ id, quelle, reason }], totalTokens }
 *
 * Die Agentenwahl ist der EINE zweite Weg in die Auswahl, und sie ist kein
 * Freifahrtschein: Pflicht steht immer, Modus und Quelle sperren weiter (der
 * Agent sah nur Kandidaten), das Budget bleibt hart, und jede nicht gewählte
 * Kandidatur wird mit `AGENT_ABGELEHNT` benannt statt still zu verschwinden.
 * Ohne `includeIds` (leer, unbekannt, fehlend) gilt unverändert der rein
 * deterministische Weg — der Rückfall ist kein Sonderfall, sondern derselbe
 * Code.
 */
export function selectBlocks(registry, opts = {}) {
  const blocks = Array.isArray(registry?.blocks) ? registry.blocks : [];
  const haystack = buildHaystack(opts.promptText, opts.context ?? null);
  const words = new Set(tokens(haystack.join(' ')));
  const total = typeof opts.totalBudgetTokens === 'number' && opts.totalBudgetTokens > 0
    ? opts.totalBudgetTokens
    : DEFAULT_TOTAL_BUDGET;

  const requested = Array.isArray(opts.includeIds)
    ? new Set(opts.includeIds.filter((id) => typeof id === 'string' && id !== ''))
    : null;
  const agentDecides = requested !== null && requested.size > 0;
  const candidates = agentDecides
    ? new Set(candidateBlocks(registry, { mode: opts.mode, available: opts.available }).map((block) => block.id))
    : null;

  const scored = [];
  const skipped = [];
  for (const block of blocks) {
    const match = matchBlock(block, {
      mode: opts.mode,
      promptText: opts.promptText,
      haystack,
      words,
      intentClass: opts.intentClass,
      stance: opts.stance,
      available: opts.available,
    });
    const base = { id: block?.id ?? null, quelle: block?.quelle ?? null };
    if (!match.selected) {
      // Der Agent darf einen NICHT ausgelösten Kandidaten wählen — das ist sein
      // Beitrag. Eine fehlende Quelle oder ein fremder Modus bleibt gesperrt:
      // beides stand nicht in seiner Kandidatenliste.
      if (agentDecides && requested.has(block?.id) && candidates.has(block?.id)) {
        scored.push({
          ...base,
          hits: match.hits,
          reason: 'AGENT',
          budgetTokens: block.budgetTokens,
          must: false,
          weight: weightScore(opts.weights, block.id),
        });
      } else {
        skipped.push({ ...base, reason: match.reason });
      }
      continue;
    }
    if (agentDecides && match.reason !== 'PFLICHT' && !requested.has(block.id)) {
      skipped.push({ ...base, reason: 'AGENT_ABGELEHNT' });
      continue;
    }
    scored.push({
      id: block.id,
      quelle: block.quelle ?? null,
      hits: match.hits,
      reason: agentDecides && match.reason !== 'PFLICHT' ? 'AGENT' : match.reason,
      budgetTokens: block.budgetTokens,
      must: match.reason === 'PFLICHT',
      weight: weightScore(opts.weights, block.id),
    });
  }

  if (agentDecides) {
    // Eine ID, die die Registry nicht kennt, ist keine Auswahl: sie wird
    // benannt, nicht still fallen gelassen (dieselbe Fail-closed-Regel wie in
    // `parseSelection`).
    const known = new Set(blocks.map((block) => block?.id).filter((id) => typeof id === 'string'));
    for (const id of requested) {
      if (known.has(id)) continue;
      skipped.push({ id, quelle: null, reason: 'AGENT_UNBEKANNT' });
    }
  }

  // Reihung ist Vertrag: Pflicht zuerst, dann Treffer absteigend, dann das
  // gelernte Gewicht, dann id aufsteigend — nie Dateisystem-Reihenfolge. Das
  // Gewicht bricht nur Gleichstände: ein höherer Treffer schlägt jedes Lernen.
  scored.sort((left, right) => Number(right.must) - Number(left.must)
    || right.hits - left.hits
    || right.weight - left.weight
    || String(left.id).localeCompare(String(right.id)));

  const selected = [];
  let totalTokens = 0;
  for (const entry of scored) {
    if (!entry.must && totalTokens + entry.budgetTokens > total) {
      skipped.push({ id: entry.id, quelle: entry.quelle, reason: 'BUDGET_ERSCHOEPFT' });
      continue;
    }
    selected.push({ id: entry.id, quelle: entry.quelle, hits: entry.hits, reason: entry.reason, budgetTokens: entry.budgetTokens });
    totalTokens += entry.budgetTokens;
  }
  skipped.sort((left, right) => String(left.id).localeCompare(String(right.id))
    || String(left.reason).localeCompare(String(right.reason)));

  return { selected, skipped, totalTokens };
}

/**
 * Der Entscheidungsanteil: was gewählt wurde, ohne einen Zeichen Prompt-Text.
 * Baustein-Ids und Gründe sind Provenienz wie `context_source` — der Text des
 * Nutzers steht hier nie (dieselbe Regel wie im restlichen Datensatz).
 *
 * Die Quellen-Spalte (`blockSources`) läuft PARALLEL zu `blocks`: sie sagt je
 * gewählter Id, woher der Baustein kommt (persona, scoring, narrative,
 * prompter, project-index). `blocks` bleibt bewusst eine reine ID-Liste — der
 * Scoring-Ledger lernt an Ids (`cleanBlockIds`), nicht an Objekten.
 */
export function decisionBlocks(selection = null) {
  if (selection === null || typeof selection !== 'object') return null;
  const selected = Array.isArray(selection.selected) ? selection.selected : [];
  return {
    blocks: selected.map((entry) => entry.id),
    blockSources: selected.map((entry) => `${entry.id}:${entry.quelle ?? 'unbekannt'}`),
    blockTokens: typeof selection.totalTokens === 'number' ? selection.totalTokens : 0,
    blocksSkipped: Array.isArray(selection.skipped)
      ? selection.skipped.map((entry) => `${entry.id}:${entry.reason}`)
      : [],
  };
}
