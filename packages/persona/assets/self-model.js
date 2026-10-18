/**
 * @shinon/persona — self-model.js
 *
 * Das AKTUELLE SELBSTMODELL: was Shinon über eigene Fähigkeiten, Grenzen und
 * Verhaltensmuster BELEGT weiß. Reine Daten und Rechnung — keine Importe, kein
 * I/O, keine Uhr (die Zeit kommt als Argument), damit der Kern in CI ohne
 * node_modules prüfbar bleibt. Belege sind echte Laufzeitspuren; behauptet
 * wird nur, was wiederkehrt, und Alter nimmt es zurück. Kein Prompt-Text.
 */

/** Vertragsname der Ablage. Ein fremder Vertrag wird nicht übernommen. */
export const SELF_MODEL_CONTRACT = 'shinon.self-model/v1';

/** Fassung der Ablage — eine neue Feldform erhöht sie. */
export const SELF_MODEL_VERSION = 1;

/** Wie stark alte Belege je Lauf altern (Gesamtlaufzeit bleibt sichtbar). */
export const DECAY_DEFAULT = 0.98;

/** Ab so vielen Beobachtungen gilt ein Grund als GRENZE (nicht vorher). */
export const LIMIT_EVIDENCE = 3;

/** Ab so vielen Beobachtungen gilt eine Unsicherheit als OFFENE FRAGE. */
export const QUESTION_EVIDENCE = 2;

/** Deckel der Beleglisten — der Überhang läuft nicht in den Prompt. */
export const MAX_REASONS = 24;
export const MAX_QUESTIONS = 12;

/** Wie viele Zeilen das Selbstmodell höchstens in den Prompt schreibt. */
export const MAX_SUMMARY_LINES = 6;

/** Länge, ab der eine Unsicherheit abgeschnitten wird (kein Roman im Prompt). */
export const MAX_QUESTION_CHARS = 90;

/** Ein Objekt, kein Array, kein null. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Eine Zählung: ganze Zahl, nie negativ, nie NaN. */
function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Ein nicht-leerer String oder null. */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Ein Beleg-Schlüssel: einzeilig, gedeckelt — nie ein ganzer Prompt.
 * Die Schreibweise bleibt: `NO_JSON` ist ein Code, kein Satzanfang.
 */
function keyOf(value) {
  const raw = text(value);
  if (raw === null) return null;
  const flat = raw.replace(/\s+/g, ' ');
  return flat.length > MAX_QUESTION_CHARS ? `${flat.slice(0, MAX_QUESTION_CHARS - 1)}…` : flat;
}

/** Einen Zähler um eins heben — gedeckelt, damit die Ablage nicht wächst. */
function bump(map, key, cap) {
  const name = keyOf(key);
  if (name === null) return;
  if (!Object.hasOwn(map, name) && Object.keys(map).length >= cap) return;
  map[name] = count(map[name]) + 1;
}

/** Das leere Modell. `now` kommt von außen — dieser Kern liest keine Uhr. */
export function emptySelfModel(now = null) {
  return {
    contract: SELF_MODEL_CONTRACT,
    version: SELF_MODEL_VERSION,
    runs: 0,
    accepted: 0,
    rejected: 0,
    unavailable: 0,
    errors: 0,
    reasons: {},
    classes: {},
    questions: {},
    firstSeen: now,
    lastSeen: now,
  };
}

/**
 * Eine gespeicherte Ablage prüfen — FORM, nicht Meinung.
 *
 * Fail-closed wie das Intent-Gedächtnis: ein fremder Vertrag macht die ganze
 * Datei unbrauchbar (`foreign`), ein unlesbarer Eintrag fällt einzeln weg.
 * @returns { model, dropped, foreign }
 */
export function validateSelfModel(raw) {
  if (!isRecord(raw)) return { model: emptySelfModel(), dropped: 0, foreign: false };
  if (raw.contract !== SELF_MODEL_CONTRACT) {
    return { model: emptySelfModel(), dropped: 0, foreign: true };
  }
  const model = emptySelfModel();
  model.runs = count(raw.runs);
  model.accepted = count(raw.accepted);
  model.rejected = count(raw.rejected);
  model.unavailable = count(raw.unavailable);
  model.errors = count(raw.errors);
  model.firstSeen = text(raw.firstSeen);
  model.lastSeen = text(raw.lastSeen);

  let dropped = 0;
  for (const field of ['reasons', 'classes', 'questions']) {
    const source = isRecord(raw[field]) ? raw[field] : {};
    for (const [name, value] of Object.entries(source)) {
      if (name === '') {
        dropped += 1;
        continue;
      }
      const n = count(value);
      if (n > 0) model[field][name] = n;
    }
  }
  return { model, dropped, foreign: false };
}

/** Die Ausgänge, die das Modell kennt — alles andere ist kein Ausgang. */
const OUTCOMES = Object.freeze({ accepted: 'accepted', rejected: 'rejected', unavailable: 'unavailable' });

/**
 * EINE Entscheidung des Veredlers verbuchen — die einzige Stelle, an der ein
 * Ausgang ins Selbstmodell kommt.
 *
 * Beobachtet wird auch der verworfene Lauf: „mein Umbau hat nicht getragen" ist
 * die ehrlichste Information, die es gibt. Gründe und Unsicherheiten zählen;
 * der Prompt-Text wird nie gelesen.
 */
export function observeDecision(model, record, now = null) {
  const base = isRecord(model) ? model : emptySelfModel(now);
  const next = {
    ...base,
    runs: count(base.runs) + 1,
    accepted: count(base.accepted),
    rejected: count(base.rejected),
    unavailable: count(base.unavailable),
    errors: count(base.errors),
    reasons: { ...(isRecord(base.reasons) ? base.reasons : {}) },
    classes: { ...(isRecord(base.classes) ? base.classes : {}) },
    questions: { ...(isRecord(base.questions) ? base.questions : {}) },
    lastSeen: text(now) ?? base.lastSeen ?? null,
    firstSeen: text(base.firstSeen) ?? text(now) ?? null,
  };

  const outcome = isRecord(record) ? OUTCOMES[record.outcome] : undefined;
  if (outcome === undefined) return next;
  next[outcome] += 1;

  for (const reason of Array.isArray(record?.reasons) ? record.reasons : []) {
    bump(next.reasons, reason, MAX_REASONS);
  }
  bump(next.classes, record?.intentClassification, MAX_REASONS);
  for (const uncertainty of Array.isArray(record?.uncertainties) ? record.uncertainties : []) {
    bump(next.questions, uncertainty, MAX_QUESTIONS);
  }
  return next;
}

/**
 * EINEN Fehler des Laufs verbuchen. Nur die ART zählt (`name`), nie der Text:
 * eine Fehlermeldung kann Pfade und Werte tragen, und die gehören nicht ins
 * Modell. Die Art genügt, um „hier breche ich wiederholt ab" zu belegen.
 */
export function observeError(model, failure, now = null) {
  const base = isRecord(model) ? model : emptySelfModel(now);
  const kind = isRecord(failure)
    ? text(failure.name) ?? text(failure.code) ?? text(failure.kind)
    : text(failure);
  const next = {
    ...base,
    runs: count(base.runs),
    accepted: count(base.accepted),
    rejected: count(base.rejected),
    unavailable: count(base.unavailable),
    errors: count(base.errors) + 1,
    reasons: { ...(isRecord(base.reasons) ? base.reasons : {}) },
    classes: { ...(isRecord(base.classes) ? base.classes : {}) },
    questions: { ...(isRecord(base.questions) ? base.questions : {}) },
    lastSeen: text(now) ?? base.lastSeen ?? null,
    firstSeen: text(base.firstSeen) ?? text(now) ?? null,
  };
  if (kind !== null) bump(next.reasons, `fehler:${kind}`, MAX_REASONS);
  return next;
}

/** Zählungen altern lassen; eine Grenze, die nicht mehr auftritt, fällt weg. */
export function decaySelfModel(model, factor = DECAY_DEFAULT, now = null) {
  if (!isRecord(model)) return model;
  const f = Number.isFinite(factor) && factor > 0 && factor < 1 ? factor : DECAY_DEFAULT;
  const shrink = (map, cap) => {
    const out = {};
    for (const [key, value] of Object.entries(isRecord(map) ? map : {})) {
      const n = Math.round(count(value) * f);
      if (n > 0 && Object.keys(out).length < cap) out[key] = n;
    }
    return out;
  };
  return {
    ...model,
    reasons: shrink(model.reasons, MAX_REASONS),
    questions: shrink(model.questions, MAX_QUESTIONS),
    lastSeen: text(now) ?? model.lastSeen ?? null,
  };
}

/** Die belegten GRENZEN: Gründe, die wiederkehren — absteigend, gedeckelt. */
export function verifiedLimits(model) {
  const reasons = isRecord(model) ? model.reasons : null;
  if (!isRecord(reasons)) return [];
  return Object.entries(reasons)
    .filter(([, value]) => count(value) >= LIMIT_EVIDENCE)
    .sort((a, b) => count(b[1]) - count(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, MAX_SUMMARY_LINES)
    .map(([reason, value]) => ({ reason, count: count(value) }));
}

/** Die OFFENEN FRAGEN: Unsicherheiten, die wiederkehren. */
export function openQuestions(model) {
  const questions = isRecord(model) ? model.questions : null;
  if (!isRecord(questions)) return [];
  return Object.entries(questions)
    .filter(([, value]) => count(value) >= QUESTION_EVIDENCE)
    .sort((a, b) => count(b[1]) - count(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, MAX_SUMMARY_LINES)
    .map(([question, value]) => ({ question, count: count(value) }));
}

/** Die Kurzfassung für die UI und den Trace: Zahlen, kein Prompt-Inhalt. */
export function selfModelView(model) {
  if (!isRecord(model)) return null;
  const limits = verifiedLimits(model);
  const questions = openQuestions(model);
  const runs = count(model.runs);
  return {
    runs,
    accepted: count(model.accepted),
    rejected: count(model.rejected),
    unavailable: count(model.unavailable),
    errors: count(model.errors),
    acceptedRate: runs === 0 ? null : Math.round((count(model.accepted) / runs) * 1000) / 1000,
    classes: Object.entries(isRecord(model.classes) ? model.classes : {})
      .sort((a, b) => count(b[1]) - count(a[1]))
      .slice(0, 3)
      .map(([name, value]) => ({ name, count: count(value) })),
    limits,
    questions,
  };
}

/**
 * Der Abschnittstext für den Prompt — begrenzt, belegt, ohne Selbstlob.
 *
 * Ohne einen einzigen Lauf gibt es NICHTS zu sagen: `null` statt eines Satzes,
 * der nur nach Wissen klingt. Die Sätze nennen die Zahl UND die Grenze; eine
 * Schwäche wird nicht weichgespült, eine Stärke nicht erfunden.
 */
export function selfModelSummary(model) {
  if (!isRecord(model) || count(model.runs) === 0) return null;
  const runs = count(model.runs);
  const accepted = count(model.accepted);
  const rejected = count(model.rejected);
  const unavailable = count(model.unavailable);
  const errors = count(model.errors);
  const lines = [
    '## Selbstmodell — was ich über mich belegt weiß',
    `- Läufe: ${runs} (${accepted} angenommen, ${rejected} verworfen, ${unavailable} nicht verfügbar, ${errors} Fehler)`,
  ];
  for (const { reason, count: n } of verifiedLimits(model)) {
    lines.push(`- Wiederkehrende Grenze: ${reason} (${n}×) — das ist MEINE Grenze, nicht die des Nutzers`);
  }
  for (const { question, count: n } of openQuestions(model)) {
    lines.push(`- Offene Frage (${n}×): ${question}`);
  }
  if (lines.length === 2 && rejected + unavailable + errors === 0) {
    lines.push('- Keine wiederkehrende Grenze belegt — die Spur ist kurz, nicht gut.');
  }
  return lines.slice(0, MAX_SUMMARY_LINES + 1).join('\n');
}
