/**
 * @shinon/prompter — Zettel-Kern (assets/note-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/scoring` (assets/scoring-core.js),
 * `@shinon/events` und `@shinon/codingmon`. `index.js` re-exportiert diesen Kern,
 * die Host-Anbindung (Dateien lesen) bleibt dort.
 *
 * WAS HIER STEHT: das Lesen und Prüfen der Zettel — Thema-Marke gegen den
 * aufgelösten Kontext, dann die drei Prüfungen (zu spitz, zu breit, doppelt).
 * WAS HIER NICHT STEHT: das Schreiben. Zettel erzeugt das ARBEITENDE Modell mit
 * seinen eigenen Werkzeugen; der Veredler liest und prüft, er erzeugt nichts und
 * ändert nichts. Deshalb gibt es hier keinen Datei-, keinen Netz- und keinen
 * Modellzugriff — jede Funktion ist rein: gleiche Eingabe, gleiches Ergebnis.
 *
 * Kein `Math.random`, kein `Date.now`: Thema-Marke und Prüfung entscheiden nach
 * INHALT und Reihenfolge, nie nach Zeit. Eine Auswahl, die von der Uhr abhinge,
 * wäre nicht nachrechenbar — und ein Zettel, der zufällig lädt, ist ein Zettel,
 * dem niemand trauen kann.
 */

/** Ein Objekt, kein Array, kein null. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Begriffe eines Textes: kleingeschrieben, ohne Fuellwoerter, ab `minLength`.
 *
 * Die Zerlegung nimmt JEDES Zeichen, das kein Buchstabe und keine Ziffer ist,
 * als Trenner (`\p{L}`/`\p{N}`, Unicode) — deutsche Umlaute und Bindestriche
 * reissen also keine Begriffe auseinander, und ein Pfad wird zu seinen Teilen.
 */
export function tokens(text, minLength = 1) {
  const found = [];
  for (const part of String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (part.length >= minLength) found.push(part);
  }
  return found;
}

/** Begriffe ohne Fuellwoerter — die tragende Substanz eines Satzes. */
function termsOf(text, { stopWords = [], minTermLength = 1, minTokenLength = 1 } = {}) {
  const stop = new Set(stopWords);
  return tokens(text, Math.max(minTermLength, minTokenLength)).filter((token) => !stop.has(token));
}

/**
 * Einen Zettel aus seinem Text lesen — fail-closed.
 *
 * Geprüft wird in EINER Richtung: was fehlt, leer ist, zu lang ist, den falschen
 * Vertrag trägt oder eine unbekannte Version nennt, ist kein Zettel. Es gibt
 * keine Reparatur und keine Vervollständigung: ein halb gelesener Zettel wäre
 * eine halbe Anweisung, und die wirkt schlimmer als keine.
 * @returns { ok: true, note } | { ok: false, reason }
 */
export function parseNote(text, format = {}) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ''));
  } catch {
    return { ok: false, reason: 'KEIN_JSON' };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'KEIN_OBJEKT' };

  const required = Array.isArray(format.required) ? format.required : [];
  const limits = isRecord(format.limits) ? format.limits : {};
  for (const key of required) {
    const value = parsed[key];
    if (value === undefined || value === null) return { ok: false, reason: `FELD_FEHLT:${key}` };
    if (key === 'version') {
      if (value !== format.version) return { ok: false, reason: `VERSION_FREMD:${String(value)}` };
      continue;
    }
    if (typeof value !== 'string' || value.trim() === '') return { ok: false, reason: `FELD_LEER:${key}` };
    if (key === 'contract' && value !== format.contract) return { ok: false, reason: `VERTRAG_FREMD:${value}` };
    const limit = limits[key];
    if (typeof limit === 'number' && value.length > limit) return { ok: false, reason: `FELD_ZU_LANG:${key}` };
  }

  return {
    ok: true,
    note: {
      contract: parsed.contract,
      version: parsed.version,
      thema: parsed.thema.trim(),
      bei: parsed.bei.trim(),
      immer: parsed.immer.trim(),
      weil: parsed.weil.trim(),
      beleg: parsed.beleg.trim(),
    },
  };
}

/**
 * Die passenden Zettel wählen — über die Thema-Marke, nicht über eine Uhr.
 *
 * Der Heuhaufen ist das, was der Lauf WIRKLICH aufgelöst hat (Kontext und
 * Prompt). Ein Zettel lädt, wenn mindestens `minHits` seiner Thema-Begriffe dort
 * vorkommen. Ohne Heuhaufen lädt keiner: wer nichts aufgelöst hat, hat auch
 * keinen Anlass.
 *
 * Die Reihenfolge ist Teil des Vertrags: mehr Treffer zuerst, bei Gleichstand
 * die alphabetische Marke. Ohne diese Regel hinge die Auswahl an der Reihenfolge
 * des Dateisystems, und zwei Läufe mit demselben Kontext könnten zwei
 * verschiedene Stände laden.
 * @param entries - `{ file, note }`, so wie der Host sie liest (EINE Huelle je Zettel).
 *                  Die Huelle ist Teil der Form: ohne Datei waere ein Befund nicht
 *                  zuzuordnen, und ein Befund ohne Ort ist keine Auskunft.
 * @returns { loaded, skipped } — `loaded` sind die Hüllen (mit Trefferzahl),
 *          `skipped` nennt je Datei den Grund.
 */
export function selectNotes(entries = [], haystack = [], reading = {}) {
  const minLength = typeof reading.minTokenLength === 'number' ? reading.minTokenLength : 4;
  const minHits = typeof reading.minHits === 'number' ? reading.minHits : 1;
  const maxNotes = typeof reading.maxNotes === 'number' ? reading.maxNotes : Infinity;
  const words = new Set(tokens(haystack.join(' '), minLength));

  const scored = [];
  const skipped = [];
  for (const entry of entries) {
    const file = isRecord(entry) && typeof entry.file === 'string' ? entry.file : null;
    const note = isRecord(entry) && isRecord(entry.note) ? entry.note : null;
    if (note === null || typeof note.thema !== 'string') {
      skipped.push({ file, thema: null, reason: 'KEIN_ZETTEL' });
      continue;
    }
    const marks = tokens(note.thema, minLength);
    if (marks.length === 0) {
      skipped.push({ file, thema: note.thema, reason: 'THEMA_OHNE_MARKE' });
      continue;
    }
    const hits = marks.filter((mark) => words.has(mark)).length;
    if (hits < minHits) {
      skipped.push({ file, thema: note.thema, reason: 'THEMA_NICHT_IM_KONTEXT' });
      continue;
    }
    scored.push({ file, note, hits });
  }

  scored.sort((left, right) => right.hits - left.hits || String(left.note.thema).localeCompare(String(right.note.thema)));
  for (const entry of scored.slice(maxNotes)) {
    skipped.push({ file: entry.file, thema: entry.note.thema, reason: 'UEBER_DEM_LIMIT' });
  }
  return { loaded: scored.slice(0, maxNotes), skipped };
}

/**
 * Die drei Prüfungen des Veredlers: zu spitz, zu breit, doppelt.
 *
 * Geprüft wird die FORM, nicht der Inhalt: ob eine Anweisung an einem Tag hängt,
 * ob sie überhaupt etwas sagt und ob zwei Zettel dasselbe sagen. Ob eine Lesson
 * STIMMT, kann keine Regel entscheiden — das steht im Befund ausdrücklich als
 * Grenze (der Prüfer behauptet nur, was er messen kann).
 * @returns Befunde, deterministisch sortiert (`null` = sauber).
 */
export function reviewNotes(notes = [], rules = {}) {
  const review = isRecord(rules.review) ? rules.review : {};
  const narrow = isRecord(review.tooNarrow) ? review.tooNarrow : {};
  const broad = isRecord(review.tooBroad) ? review.tooBroad : {};
  const duplicate = isRecord(review.duplicate) ? review.duplicate : {};
  const found = [];
  const at = (file, note, finding, detail) => found.push({ file, thema: note?.thema ?? null, finding, detail });

  const narrowFields = Array.isArray(narrow.fields) ? narrow.fields : ['bei', 'immer'];
  const forbidden = Array.isArray(narrow.forbidden) ? narrow.forbidden : [];
  const pathPattern = typeof narrow.pathPattern === 'string' ? new RegExp(narrow.pathPattern, 'g') : null;
  const maxPaths = typeof narrow.maxPaths === 'number' ? narrow.maxPaths : Infinity;

  for (const entry of notes) {
    if (!isRecord(entry)) continue;
    const { file, note } = entry;
    const text = narrowFields.map((field) => note?.[field] ?? '').join('\n');

    for (const rule of forbidden) {
      if (typeof rule?.pattern !== 'string') continue;
      const pattern = new RegExp(rule.pattern, 'u');
      const hit = pattern.exec(text);
      if (hit !== null) at(file, note, narrow.label ?? 'zu spitz', `${rule.id ?? 'MUSTER'}: ${hit[0].trim()}`);
    }
    if (pathPattern !== null) {
      const paths = text.match(pathPattern) ?? [];
      if (paths.length > maxPaths) at(file, note, narrow.label ?? 'zu spitz', `konkrete Dateien: ${paths.length} > ${maxPaths}`);
    }

    const terms = termsOf(note?.immer, broad);
    const minTerms = typeof broad.minTerms === 'number' ? broad.minTerms : 0;
    if (terms.length < minTerms) at(file, note, broad.label ?? 'zu breit', `tragende Begriffe: ${terms.length} < ${minTerms}`);
  }

  const minShared = typeof duplicate.minShared === 'number' ? duplicate.minShared : Infinity;
  const minShare = typeof duplicate.minShare === 'number' ? duplicate.minShare : 1;
  const dupLength = typeof duplicate.minTokenLength === 'number' ? duplicate.minTokenLength : 4;
  const dupTerms = notes
    .filter((entry) => isRecord(entry) && isRecord(entry.note))
    .map((entry) => ({ file: entry.file, note: entry.note, terms: new Set(tokens(entry.note.immer, dupLength)) }));

  for (let left = 0; left < dupTerms.length; left += 1) {
    for (let right = left + 1; right < dupTerms.length; right += 1) {
      const a = dupTerms[left];
      const b = dupTerms[right];
      if (a.note.thema !== b.note.thema) continue;
      const shared = [...a.terms].filter((term) => b.terms.has(term)).length;
      const share = Math.min(a.terms.size, b.terms.size) === 0 ? 0 : shared / Math.min(a.terms.size, b.terms.size);
      if (shared >= minShared && share >= minShare) {
        at(b.file, b.note, duplicate.label ?? 'doppelt', `mit ${a.file} (${shared} gemeinsame Begriffe, Anteil ${Math.round(share * 100)}%)`);
      }
    }
  }

  found.sort((left, right) => String(left.file).localeCompare(String(right.file)) || String(left.finding).localeCompare(String(right.finding)));
  return found;
}

/**
 * Text für den Block entschärfen: die Zettel sind Inhalt, keine Markierung.
 *
 * Ein Zettel, der `<` oder `>` selbst trägt, könnte den Block vorzeitig
 * schliessen — und alles danach liest das Modell als Anweisung ausserhalb des
 * Datenblocks. Das ist derselbe Fall, den der Indexkontext kennt (`neutralizeMarkers`),
 * hier aber strenger: im Stand stehen NUR Daten, also wird jedes Markenzeichen
 * ersetzt und kein Code bleibt roh.
 */
function escapeText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Den Stand als EINEN Block rendern — Haltung, Tendenzen, passende Zettel.
 *
 * Der Stand ist eine Auskunft, keine Anweisung: er steht in eigenen Marken und
 * nennt seine Herkunft. Leere Teile FALLEN WEG statt leer dazustehen: ein
 * `<haltung>` ohne Haltung wäre eine Behauptung. Ist nichts davon da, kommt
 * `null` zurück — der Aufrufer hängt dann keinen Block an (kein leerer Block im
 * Prompt).
 *
 * ZUG 6 — die Narrative-Lage: der Composite der Narrative Engine kommt als
 * EIGENES Element `<narrative contract="…">` in den Stand. Er trägt seinen
 * Vertragsnamen als Herkunft und ist damit als gelesen ausgewiesen; die Engine
 * sagt selbst `authority: NONE` (abgeleitet ist nicht autoritativ), und dieses
 * Element behauptet deshalb nichts über die Welt — es sagt, wie der Takt
 * gelesen wurde. Nur die FELDER, die der Composite wirklich trägt: ein Arc, den
 * es nicht gibt, wird nicht erfunden.
 */
export function renderStand(stand) {
  if (!isRecord(stand)) return null;
  const tens = Array.isArray(stand.tendencies) ? stand.tendencies : [];
  const notes = Array.isArray(stand.notes) ? stand.notes : [];
  const skills = Array.isArray(stand.skills) ? stand.skills : [];
  const hasStance = stand.stance !== null && stand.stance !== undefined;
  const narrative = isRecord(stand.narrative) ? stand.narrative : null;
  const lage = narrative === null
    ? []
    : [
        ['arc', narrative.arc_id],
        ['erzaehler', narrative.narrator],
        ['beziehung', narrative.relationship_state],
        ['stimmung', narrative.mood],
      ].filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!hasStance && tens.length === 0 && notes.length === 0 && skills.length === 0 && lage.length === 0) return null;

  const lines = ['<shinon_stand>'];
  if (typeof stand.contract === 'string' && stand.contract !== '') {
    lines.push(`<stand_contract>${escapeText(stand.contract)}</stand_contract>`);
  }
  if (hasStance) lines.push(`<haltung>${escapeText(stand.stance)}</haltung>`);
  if (tens.length > 0) {
    lines.push(`<tendenzen>${tens.map((entry) => `${escapeText(entry.klasse)} ${escapeText(entry.stufe)}`).join('; ')}</tendenzen>`);
  }
  if (lage.length > 0) {
    const origin = typeof stand.narrativeContract === 'string' && stand.narrativeContract !== ''
      ? ` contract="${escapeText(stand.narrativeContract)}"`
      : '';
    lines.push(`<narrative${origin}>`);
    lines.push(lage.map(([key, value]) => `${key}: ${escapeText(value)}`).join('; '));
    lines.push('</narrative>');
  }
  for (const note of notes) {
    lines.push(`<zettel thema="${escapeText(note.thema)}">`);
    lines.push(`bei: ${escapeText(note.bei)}`);
    lines.push(`immer: ${escapeText(note.immer)}`);
    lines.push(`weil: ${escapeText(note.weil)}`);
    lines.push('</zettel>');
  }
  if (skills.length > 0) {
    lines.push(`<selected_skills contract="${escapeText(typeof stand.skillsContract === 'string' ? stand.skillsContract : 'shinon.skill-rules/v1')}">`);
    for (const skill of skills) {
      lines.push(`  <skill name="${escapeText(skill.name)}">${escapeText(skill.description)}</skill>`);
    }
    lines.push('</selected_skills>');
  }
  lines.push('</shinon_stand>');
  return lines.join('\n');
}
