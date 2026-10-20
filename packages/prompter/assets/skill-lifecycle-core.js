/**
 * @shinon/prompter — Skill-Lebenszyklus, reiner Kern (assets/skill-lifecycle-core.js).
 *
 * KEINE Imports ausser dem importfreien Zettel-Kern (`./note-core.js`): der Test
 * laeuft in CI ohne node_modules, dieselbe Regel wie bei den anderen Kernen.
 *
 * DIE STUFEN, getrennt — jede ist eine Funktion dieses Kerns:
 *   1. Kandidat      normalizeCandidate   Form, Feldgrenzen, Ausloeser, Name
 *   2. Beleg         recordEvidence       Korrektur/Wiederholung, idempotent je Quelle
 *   3. Pruefung      checkCandidate       verboten, Zettel-Pruefung, Dublette, Widerspruch, Beleglage
 *   4. Konsolidierung consolidateText     Beleg an ein bestehendes Ziel haengen, nie doppelt
 *   5. Veroeffentlichung renderSkill      die SKILL.md, die DSH nativ entdeckt
 *
 * Der Kern schreibt nichts, liest nichts und ruft kein Modell. Der Host
 * (skill-lifecycle.js) liest Ereignisse, fragt das Modell fuer EINEN Kandidaten,
 * ruft diese Funktionen und schreibt das Ergebnis.
 *
 * Fail-Richtung: alles, was nicht eindeutig ist, wird NICHT veroeffentlicht. Der
 * Befund nennt den Grund; eine stille Entscheidung gibt es nicht.
 */
import { reviewNotes, tokens } from './note-core.js';

export const CANDIDATE_CONTRACT = 'shinon.skill-candidate/v1';
export const LEDGER_CONTRACT = 'shinon.skill-ledger/v1';
export const SKILL_MARK = 'shinon-skill-fp';
export const CONSOLIDATED_MARK = 'shinon-konsolidiert';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Leerraum zusammenziehen: jedes Feld wird eine Zeile, nie ein Frontmatter-Bruch. */
export function flatten(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** FNV-1a (32 Bit) als Hex: deterministisch, ohne Zufall, ohne Uhr. */
export function stableHash(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Sitzungskennung gehasht: die Ablage nennt keine Klartext-Sitzung. */
export function sessionRef(sessionId) {
  return `sess-${stableHash(String(sessionId ?? ''))}`;
}

/** Deutsche Umlaute ausschreiben, dann alles ausser a-z0-9 zu Bindestrichen. */
export function slugOf(text, maxLength = 60) {
  const folded = String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return folded.slice(0, maxLength).replace(/-+$/g, '');
}

/** Begriffe ohne Fuellwoerter, ab minLength — dieselbe Zerlegung wie der Zettel-Kern. */
function termsOf(text, rules, minLength) {
  const stop = new Set(rules?.review?.tooBroad?.stopWords ?? []);
  return [...new Set(tokens(text, minLength))].filter((term) => !stop.has(term));
}

/**
 * Einen rohen Kandidaten (vom Modell, nach JSON-Parsen) gegen die Form pruefen.
 * Fail-closed: fehlt ein Feld, ist es zu lang oder fehlt der Ausloeser in der
 * Beschreibung, entsteht kein Kandidat.
 * @returns { ok: true, candidate } | { ok: false, reason }
 */
export function normalizeCandidate(raw, rules) {
  if (!isRecord(raw)) return { ok: false, reason: 'KEIN_OBJEKT' };
  const format = rules.format;
  const fields = {};
  for (const key of ['thema', 'bei', 'immer', 'weil']) {
    const value = flatten(raw[key]);
    if (value === '') return { ok: false, reason: `FELD_LEER:${key}` };
    const limit = format.fields[key];
    if (value.length > limit) return { ok: false, reason: `FELD_ZU_LANG:${key}` };
    fields[key] = value;
  }

  const description = flatten(raw.description);
  if (description.length < format.descriptionMin) return { ok: false, reason: 'BESCHREIBUNG_ZU_KURZ' };
  if (description.length > format.descriptionMax) return { ok: false, reason: 'BESCHREIBUNG_ZU_LANG' };
  if (!new RegExp(`\\b${format.triggerWord}\\b`, 'iu').test(description)) return { ok: false, reason: 'BESCHREIBUNG_OHNE_AUSLOESER' };

  const proposed = flatten(raw.name).toLowerCase();
  const name = KEBAB.test(proposed) && proposed.length >= format.nameMin && proposed.length <= format.nameMax
    ? proposed
    : slugOf(fields.thema, format.nameMax);
  if (name.length < format.nameMin || !KEBAB.test(name)) return { ok: false, reason: 'NAME_UNGUELTIG' };

  return {
    ok: true,
    candidate: { contract: CANDIDATE_CONTRACT, name, description, ...fields },
  };
}

/** Der Fingerabdruck des INHALTS (nicht der Name): Begriffe aus Thema, Wann und Regel. */
export function fingerprintOf(candidate, rules) {
  const terms = termsOf(`${candidate.thema} ${candidate.bei} ${candidate.immer}`, rules, rules.duplicate.minTokenLength);
  return stableHash([...terms].sort().join(' '));
}

/** Verbotene Muster: jeder Treffer nennt Musterkennung und den Ausschnitt. */
export function forbiddenHits(candidate, rules) {
  const text = `${candidate.description} ${candidate.thema} ${candidate.bei} ${candidate.immer} ${candidate.weil}`;
  const hits = [];
  for (const entry of rules.forbidden.patterns) {
    const match = new RegExp(entry.pattern, 'iu').exec(text);
    if (match !== null) hits.push({ id: entry.id, match: match[0] });
  }
  return hits;
}

/**
 * Die Zettel-Pruefung wiederverwenden (zu spitz, zu breit). Doppelte innerhalb
 * EINES Kandidaten gibt es nicht; die Dublette zu bestehenden Skills prueft
 * `findDuplicate`.
 */
export function reviewCandidate(candidate, noteRules) {
  return reviewNotes([{ file: candidate.name, note: candidate }], noteRules);
}

/** Die Abschnitte einer von diesem Lebenszyklus geschriebenen Datei zurueckgeben. */
export function sectionsOf(text) {
  const source = String(text ?? '');
  const section = (heading) => {
    const start = source.indexOf(`## ${heading}\n`);
    if (start === -1) return '';
    const from = start + heading.length + 4;
    const end = source.indexOf('\n## ', from);
    return source.slice(from, end === -1 ? undefined : end).trim();
  };
  return { wann: section('Wann'), regel: section('Regel') };
}

/**
 * Ist der Kandidat eine Dublette eines bestehenden Skills? Gemessen an den
 * Begriffen aus Wann und Regel gegen den GANZEN Text des Skills.
 * @param existing - `{ name, text }` je bestehendem Skill.
 * @returns das beste Ziel (mit Anteil) oder `null`.
 */
export function findDuplicate(candidate, existing, rules) {
  const { minShared, minShare, minTokenLength } = rules.duplicate;
  const terms = termsOf(`${candidate.bei} ${candidate.immer}`, rules, minTokenLength);
  if (terms.length === 0) return null;
  let best = null;
  for (const skill of [...existing].sort((a, b) => a.name.localeCompare(b.name))) {
    const words = new Set(tokens(skill.text, minTokenLength));
    const shared = terms.filter((term) => words.has(term)).length;
    const share = shared / terms.length;
    if (shared >= minShared && share >= minShare && (best === null || share > best.share)) {
      best = { name: skill.name, shared, share };
    }
  }
  return best;
}

/**
 * Widerspruch: gleicher Ausloeser wie ein bestehender Skill, aber eine andere
 * Regel. Lexikalisch — eine Verneinung im Satz erkennt sie nicht (benannte Grenze).
 * @returns den Namen des widersprechenden Skills oder `null`.
 */
export function findConflict(candidate, existing, rules) {
  const { triggerShare, ruleShareMax, minTokenLength } = rules.conflict;
  const trigger = termsOf(candidate.bei, rules, minTokenLength);
  const rule = termsOf(candidate.immer, rules, minTokenLength);
  if (trigger.length === 0 || rule.length === 0) return null;
  for (const skill of [...existing].sort((a, b) => a.name.localeCompare(b.name))) {
    const { wann, regel } = sectionsOf(skill.text);
    if (wann === '' || regel === '') continue;
    const triggerWords = new Set(tokens(wann, minTokenLength));
    const ruleWords = new Set(tokens(regel, minTokenLength));
    const onTrigger = trigger.filter((term) => triggerWords.has(term)).length / trigger.length;
    const onRule = rule.filter((term) => ruleWords.has(term)).length / rule.length;
    if (onTrigger >= triggerShare && onRule <= ruleShareMax) return skill.name;
  }
  return null;
}

/**
 * Die Entscheidung fuer EINEN Kandidaten.
 *
 * Reihenfolge ist Teil des Vertrags: verboten vor Form, Form vor Eigentuemer,
 * Eigentuemer vor Widerspruch, Widerspruch vor Dublette, Dublette vor Name,
 * Name vor Beleglage. So kann kein spaeter Schritt einen frueheren Ausschluss
 * ueberstimmen. Der Widerspruch steht vor der Dublette, weil gleicher Ausloeser
 * allein noch keine Dublette ist (siehe Test `Widerspruch`).
 *
 * @param input.candidate - normalisierter Kandidat.
 * @param input.existing - `{ name, text }` der vorhandenen Skill-Dateien.
 * @param input.kinds - Beleg-Zaehler des Kandidaten (`{ correction, completed }`), inkl. des laufenden Ereignisses.
 * @returns `{ verdict, reason, target, findings }`; verdict: publish | consolidate | candidate | reject.
 */
export function checkCandidate({ candidate, existing = [], kinds = { correction: 0, completed: 0 }, owner = null, rules, noteRules }) {
  const forbidden = forbiddenHits(candidate, rules);
  if (forbidden.length > 0) {
    return { verdict: 'reject', reason: `VERBOTEN:${forbidden[0].id}`, target: null, findings: forbidden };
  }
  const findings = reviewCandidate(candidate, noteRules);
  if (findings.length > 0) {
    return { verdict: 'reject', reason: `PRUEFUNG:${findings[0].finding}`, target: null, findings };
  }
  // Ein Kandidat, dessen Name schon einem veröffentlichten Ziel gehört, ergänzt
  // dieses Ziel (Beleg), statt als Namenskonflikt zu gelten.
  if (owner !== null && existing.some((skill) => skill.name === owner)) {
    return { verdict: 'consolidate', reason: 'EIGENES_ZIEL', target: owner, findings: [] };
  }

  // Widerspruch VOR Dublette: gleicher Ausloeser allein macht noch keine Dublette.
  // Eine echte Dublette hat auch die gleiche Regel (ruleShareMax schliesst sie aus);
  // pruefte man zuerst die Dublette, wuerde ein widersprechender Kandidat still
  // in den bestehenden Skill angehaengt.
  const conflict = findConflict(candidate, existing, rules);
  if (conflict !== null) return { verdict: 'reject', reason: 'WIDERSPRUCH', target: conflict, findings: [] };

  const duplicate = findDuplicate(candidate, existing, rules);
  if (duplicate !== null) return { verdict: 'consolidate', reason: 'DUBLETTE', target: duplicate.name, findings: [] };

  if (existing.some((skill) => skill.name === candidate.name)) {
    return { verdict: 'reject', reason: 'NAME_BELEGT', target: candidate.name, findings: [] };
  }

  const enough = kinds.correction >= 1 || kinds.completed >= rules.evidence.minCompleted;
  if (!enough) return { verdict: 'candidate', reason: 'BELEG_ZU_DUENN', target: null, findings: [] };
  return { verdict: 'publish', reason: 'BELEGT', target: candidate.name, findings: [] };
}

/** Die Zeile eines Belegs — deterministisch, ohne Klartext-Sitzung. */
export function belegLine(evidence) {
  return `- ${evidence.kind} · ${evidence.session} · ${evidence.ref}`;
}

/**
 * Einen Beleg in den Abschnitt "Belege" einfuegen. Dieselbe Zeile zweimal ergibt
 * denselben Text: das ist die Idempotenz auf Dateiebene.
 * @returns der neue Text (unverändert, wenn die Zeile schon steht).
 */
export function appendBeleg(text, line) {
  const source = String(text ?? '').replace(/\s*$/, '');
  if (source.split('\n').includes(line)) return `${source}\n`;
  if (/^## Belege$/m.test(source)) return `${source}\n${line}\n`;
  return `${source}\n\n## Belege\n\n${line}\n`;
}

/** Die Skill-Datei fuer einen neuen, veroeffentlichten Kandidaten. */
export function renderSkill(candidate, { fingerprint, belege }) {
  const lines = [
    '---',
    `name: ${candidate.name}`,
    `description: ${JSON.stringify(candidate.description)}`,
    '---',
    '',
    `# ${candidate.thema}`,
    '',
    `<!-- ${SKILL_MARK}: ${fingerprint} -->`,
    '',
    '## Wann',
    '',
    candidate.bei,
    '',
    '## Regel',
    '',
    candidate.immer,
    '',
    '## Warum',
    '',
    candidate.weil,
    '',
    '## Belege',
    '',
    ...belege,
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Einen Kandidaten in ein BESTEHENDES Ziel konsolidieren: ein Abschnitt je
 * Fingerabdruck (einmal), danach der Beleg. Hand geschriebene Skills bleiben
 * unangetastet, bis auf den angehaengten Abschnitt.
 */
export function consolidateText(text, candidate, { fingerprint, line }) {
  let out = String(text ?? '').replace(/\s*$/, '');
  const mark = `<!-- ${CONSOLIDATED_MARK}: ${fingerprint} -->`;
  if (!out.includes(mark)) {
    out += `\n\n${mark}\n## Gelernt: ${candidate.thema}\n\n- Wann: ${candidate.bei}\n- Regel: ${candidate.immer}\n- Warum: ${candidate.weil}\n`;
  }
  return appendBeleg(out, line);
}

/** Der leere Ledger. */
export function emptyLedger() {
  return { contract: LEDGER_CONTRACT, version: 1, entries: {} };
}

/**
 * Einen gespeicherten Ledger lesen — fail-closed: ein fremder Vertrag oder eine
 * kaputte Datei ergibt `ok: false`, der Host startet dann mit einem leeren Ledger
 * und meldet den Grund (keine stille Reparatur).
 */
export function parseLedger(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ''));
  } catch {
    return { ok: false, reason: 'KEIN_JSON' };
  }
  if (!isRecord(parsed) || parsed.contract !== LEDGER_CONTRACT || parsed.version !== 1) {
    return { ok: false, reason: 'VERTRAG_FREMD' };
  }
  if (!isRecord(parsed.entries)) return { ok: false, reason: 'EINTRAEGE_FEHLEN' };
  return { ok: true, ledger: parsed };
}

/**
 * Einen Beleg in den Ledger schreiben. Derselbe Schluessel (Art, Sitzung, Ort)
 * zaehlt nur einmal — das ist die Idempotenz auf Ledger-Ebene.
 * @returns neuer Ledger und `added` (false, wenn der Beleg schon bekannt war).
 */
export function recordEvidence(ledger, name, evidence, { maxEntries }) {
  const current = ledger.entries[name] ?? {
    status: 'candidate',
    reason: 'BELEG_ZU_DUENN',
    target: null,
    fingerprint: evidence.fingerprint,
    kinds: { correction: 0, completed: 0 },
    belege: [],
  };
  const key = `${evidence.kind}|${evidence.session}|${evidence.ref}`;
  if (current.belege.includes(key)) return { ledger, added: false, entry: current };
  const kinds = { ...current.kinds, [evidence.kind]: (current.kinds[evidence.kind] ?? 0) + 1 };
  const entry = { ...current, kinds, belege: [...current.belege, key], fingerprint: evidence.fingerprint };
  return { ledger: pruned({ ...ledger, entries: { ...ledger.entries, [name]: entry } }, maxEntries), added: true, entry };
}

/** Entscheidung und Ziel eines Kandidaten in den Ledger eintragen. */
export function setDecision(ledger, name, { verdict, reason, target }, { maxEntries }) {
  const current = ledger.entries[name];
  if (current === undefined) return ledger;
  const status = verdict === 'publish' ? 'published' : verdict === 'consolidate' ? 'consolidated' : verdict === 'reject' ? 'rejected' : 'candidate';
  const entry = { ...current, status, reason, target: target ?? null };
  return pruned({ ...ledger, entries: { ...ledger.entries, [name]: entry } }, maxEntries);
}

/**
 * Obergrenze: zuerst abgelehnte, dann offene Kandidaten fallen weg. Veroeffentlichte
 * Eintraege bleiben — sie sind die Belege fuer vorhandene Dateien.
 */
export function pruned(ledger, maxEntries) {
  const names = Object.keys(ledger.entries);
  if (names.length <= maxEntries) return ledger;
  const order = ['rejected', 'candidate', 'consolidated', 'published'];
  const removable = [...names].sort((a, b) => order.indexOf(ledger.entries[a].status) - order.indexOf(ledger.entries[b].status));
  const drop = new Set(removable.slice(0, names.length - maxEntries));
  return { ...ledger, entries: Object.fromEntries(Object.entries(ledger.entries).filter(([name]) => !drop.has(name))) };
}
