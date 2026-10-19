/**
 * @shinon/prompter — abort-core.js
 *
 * Die Abbruchquote als DATEN: welche Entscheidung ein Abbruch war, welcher
 * Grund, wie viele je Grund, und welcher Grund führt. Kein Import (weder Bare
 * noch `node:`) — derselbe Grund wie bei `capability-map.js`: der Test läuft in
 * CI ohne `node_modules`.
 *
 * WARUM DIE GRÜNDE DATEN SIND UND KEIN CODE: das Panel soll Quote und
 * häufigsten Grund zeigen, ohne einen einzigen Grund beim Namen zu kennen. Ein
 * neuer Grund ist ein Eintrag in `abort-reasons.json`; die Anzeige liest nur
 * `quote` und `topLabel`. Kein Client-Update, kein zweiter Zustand.
 *
 * WARUM DIE KLASSIFIKATION HIER STEHT UND NICHT IM HOST: `index.js` soll die
 * Entscheidung nur übergeben. Die Regeln (Reihenfolge, Präfixe, Salvage) sind
 * Prüflogik und gehören an eine Stelle, die ohne DSH testbar ist.
 */

/** Vertragsname der Zählung. */
export const ABORT_CONTRACT = 'shinon.prompter/abort-v1';

/** Ein Eintrag ohne erkennbaren Grund ist trotzdem ein Abbruch — benannt. */
export const UNCLASSIFIED = 'UNKLASSIFIZIERT';

/** Alle Grund-IDs einer Tabelle (Reihenfolge = Priorität). */
export function reasonIds(table) {
  const reasons = Array.isArray(table?.reasons) ? table.reasons : [];
  return reasons.map((entry) => (typeof entry?.id === 'string' ? entry.id : '')).filter((id) => id !== '');
}

/** Der Text, in dem `failureHas` sucht: Name, Meldung und Finish-Grund. */
function failureText(record) {
  const failure = record?.failure;
  if (failure === null || typeof failure !== 'object') return '';
  const parts = [failure.name, failure.message, failure.finish];
  return parts
    .map((part) => (typeof part === 'string' ? part : part === undefined || part === null ? '' : JSON.stringify(part)))
    .join(' ')
    .toLocaleLowerCase();
}

/** Trifft eine Regel auf diesen Datensatz? Die Bedingungen sind ODER-verknüpft. */
function ruleMatches(rule, record, reasons) {
  const match = rule?.match;
  if (match === null || typeof match !== 'object') return false;
  let asked = false;
  let hit = false;

  if (Array.isArray(match.reasonsAny)) {
    asked = true;
    if (match.reasonsAny.some((reason) => reasons.includes(reason))) hit = true;
  }
  if (Array.isArray(match.reasonPrefixAny)) {
    asked = true;
    if (reasonPrefixHit(reasons, match.reasonPrefixAny)) hit = true;
  }
  if (Array.isArray(match.failureHas)) {
    asked = true;
    const text = failureText(record);
    if (text !== '' && match.failureHas.some((needle) => typeof needle === 'string' && text.includes(needle.toLocaleLowerCase()))) hit = true;
  }
  if (match.salvage === true) {
    asked = true;
    if (record?.salvage !== null && record?.salvage !== undefined) hit = true;
  }
  return asked && hit;
}

/** Gibt es einen Reason, der mit einem der Präfixe beginnt? */
function reasonPrefixHit(reasons, prefixes) {
  return reasons.some((reason) => prefixes.some((prefix) => typeof prefix === 'string' && reason.startsWith(prefix)));
}

/**
 * Warum dieser Turn abgebrochen ist — oder null, wenn er es nicht ist.
 *
 * Ein `accepted` ohne Salvage ist KEIN Abbruch. Ein `SALVAGE` ist einer: der
 * Prompt wurde ersetzt, aber nicht durch eine gültige Antwort. Die Reihenfolge
 * der Tabelle entscheidet (Timeout vor „kein JSON"), damit ein abgebrochener
 * Stream nicht als Formatfehler zählt.
 *
 * `rank` ist die Position des Grundes in der Tabelle. Er reist im Datensatz,
 * damit eine zweite Faltung (das Popup) bei Gleichstand dieselbe Priorität
 * anwenden kann, ohne die Tabelle zu kennen — sonst gäbe es zwei Rangfolgen
 * unter einem Namen.
 *
 * @returns {{id: string, label: string, rank: number}|null}
 */
export function classifyAbort(record, table) {
  if (record === null || typeof record !== 'object') return null;
  const outcome = record.outcome;
  const salvaged = record.salvage !== null && record.salvage !== undefined;
  if (outcome === 'accepted' && !salvaged) return null;
  const reasons = Array.isArray(record.reasons) ? record.reasons.filter((reason) => typeof reason === 'string') : [];
  const entries = Array.isArray(table?.reasons) ? table.reasons : [];
  for (let rank = 0; rank < entries.length; rank += 1) {
    const entry = entries[rank];
    if (ruleMatches(entry, record, reasons)) {
      return {
        id: String(entry.id),
        label: typeof entry.label === 'string' && entry.label !== '' ? entry.label : String(entry.id),
        rank,
      };
    }
  }
  // Unklassifiziert steht hinter jedem benannten Grund — er ist die Lücke,
  // nicht eine Meinung.
  return { id: UNCLASSIFIED, label: 'Unklassifiziert', rank: entries.length };
}

/**
 * Klassifikation und Zähler in EINEM Schritt — die Übergabe für den Host.
 *
 * Zwei getrennte Aufrufe würden zweimal klassifizieren; das Ergebnis wäre
 * dieselbe Antwort, aber zwei Stellen könnten auseinanderlaufen.
 */
export function abortRecord(record, table) {
  const abort = classifyAbort(record, table);
  return { abort, abort_counts: abort === null ? {} : { [abort.id]: 1 } };
}

/**
 * Die Zähler DIESES Turns: genau ein Grund zählt 1, sonst ein leeres Objekt.
 *
 * Als Objekt und nicht als Zahl, weil das Panel später nur summiert — es fragt
 * nie `if reason === 'timeout'`.
 */
export function abortCounts(record, table) {
  const abort = classifyAbort(record, table);
  return abort === null ? {} : { [abort.id]: 1 };
}

/**
 * Quote und häufigster Grund über eine Liste von Entscheidungen.
 *
 * `turns` zählt ALLE Entscheidungen, `aborts` die Abbrüche; `quote` ist ein
 * Anteil zwischen 0 und 1 (kein Prozent-String — die Anzeige formatiert).
 * `top` ist der Grund mit den meisten Stimmen, bei Gleichstand der in der
 * Tabelle frühere (Reihenfolge = Priorität, deterministisch).
 *
 * @param entries - Entscheidungsdatensätze (Trace-Puffer, Fenster oder Datei).
 * @param table - die Regeldatei; fehlt sie, zählt nur `UNKLASSIFIZIERT`.
 */
export function abortSummary(entries, table) {
  const counts = {};
  const ranks = {};
  let turns = 0;
  let aborts = 0;
  for (const record of Array.isArray(entries) ? entries : []) {
    if (record === null || typeof record !== 'object' || typeof record.outcome !== 'string') continue;
    turns += 1;
    // Ein Trace-Eintrag trägt die Klassifikation bereits (`abort`,
    // `abort_counts`); ein Rohdatensatz nicht. Beides muss zählen, sonst wäre
    // der Puffer eine zweite Wahrheit neben der Datei — und die Quote
    // verschieden, je nachdem wer sie rechnet.
    const known = record.abort !== null && typeof record.abort === 'object' && typeof record.abort.id === 'string'
      ? record.abort
      : null;
    const counted = known === null ? abortCounts(record, table) : record.abort_counts ?? { [known.id]: 1 };
    const abort = known ?? classifyAbort(record, table);
    if (abort === null) continue;
    aborts += 1;
    for (const [id, count] of Object.entries(counted)) {
      if (Number.isInteger(count) && count > 0) counts[id] = (counts[id] ?? 0) + count;
      if (!Number.isInteger(ranks[id])) ranks[id] = Number.isInteger(abort.rank) ? abort.rank : ranks[id];
    }
  }
  const order = reasonIds(table);
  // Gleichstand: der kleinere `rank` gewinnt (Tabellenpriorität), danach die ID.
  // Die Eingabereihenfolge entscheidet NIE — sonst wäre die Quote davon
  // abhängig, in welcher Reihenfolge der Puffer gelesen wurde.
  const rankOf = (id) => (Number.isInteger(ranks[id])
    ? ranks[id]
    : (order.indexOf(id) < 0 ? order.length : order.indexOf(id)));
  const ranked = Object.entries(counts).sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    if (rankOf(a[0]) !== rankOf(b[0])) return rankOf(a[0]) - rankOf(b[0]);
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  const top = ranked.length > 0 ? ranked[0][0] : null;
  const labelOf = new Map((Array.isArray(table?.reasons) ? table.reasons : []).map((entry) => [entry?.id, entry?.label]));
  return {
    contract: ABORT_CONTRACT,
    turns,
    aborts,
    quote: turns === 0 ? 0 : aborts / turns,
    top,
    topLabel: top === null ? null : (typeof labelOf.get(top) === 'string' ? labelOf.get(top) : top),
    counts,
  };
}

/** Die kompakte Zahl für die Logzeile: `abort=5/9 top=KEIN_JSON`. */
export function abortLabel(summary) {
  if (summary === null || typeof summary !== 'object' || !Number.isInteger(summary.turns) || summary.turns === 0) return '';
  return `abort=${summary.aborts}/${summary.turns} top=${summary.top ?? '-'}`;
}
