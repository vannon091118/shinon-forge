/**
 * @shinon/prompter — Lernen: Redaktion und begrenztes Gespraechs-Digest
 * (assets/learning-redact.js).
 *
 * KEIN Import: der Kern laeuft im Test ohne node_modules, dieselbe Regel wie
 * bei `note-core.js` und `skill-lifecycle-core.js`.
 *
 * ZWEI AUFGABEN, beide rein:
 *   1. `redactText` entfernt, was ein Reviewer-Modell nicht sehen soll:
 *      Zugangsdaten, Schluessel, Home-Pfade, Mail-Adressen, unsichtbare
 *      Zeichen. Die Muster sind dieselbe Familie wie im Project Index, aber
 *      hier geht es um GESPRAECHSTEXT, nicht um Dateiinhalte.
 *   2. `addEntry`/`addTool`/`renderDigest` bauen die begrenzte Kopie: ein Ring
 *      aus wenigen Belegen, gedeckelt in Anzahl, Gesamtzeichen und Zeichen je
 *      Beleg. Werkzeuge reisen nur mit NAMEN und Zahl, nie mit Argumenten oder
 *      Ergebnissen.
 *
 * BENANNTE GRENZE: die Erkennung ist mustergebunden. Kodierte, zerlegte oder
 * in mehrere Zeilen geteilte Geheimnisse werden nicht erkannt — dieselbe
 * Grenze, die `docs/probes/secret-protection.json` fuer den Index nennt.
 */

/** Was an die Stelle eines Treffers tritt. Ein Wort, kein Sonderzeichen. */
export const REDACTED = '[REDACTED]';

/**
 * Die Muster in Anwendungsreihenfolge. `id` ist der Befundname (Tests und
 * Logzeilen nennen ihn, nie den Wert); `to` ist entweder ein fester Text oder
 * eine Funktion, die den Treffer behaelt, was sie behalten darf.
 */
const PATTERNS = Object.freeze([
  {
    id: 'private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    to: () => `-----BEGIN PRIVATE KEY-----${REDACTED}-----END PRIVATE KEY-----`,
  },
  { id: 'openai-key', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { id: 'github-token', pattern: /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{20,}\b/g },
  { id: 'github-pat', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { id: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'aws-key-id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'google-key', pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  {
    id: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    id: 'bearer',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    to: () => `Bearer ${REDACTED}`,
  },
  {
    // Zuweisung mit langem Wert: `API_KEY=…`, `token: "…"`, `PASSWORD=…`.
    // Der Name bleibt stehen (der Leser soll wissen, WAS fehlt), der Wert nicht.
    id: 'assignment',
    pattern: /(\b(?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|SECRET[_-]?KEY|TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY)|api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|token|secret))\s*[:=]\s*['"]?([^\s'"]{8,})/gi,
    to: (match, name) => `${name}=${REDACTED}`,
  },
  {
    // Lange Base64-/Hex-Folgen ohne Zuweisung. 40 Zeichen ist die Schwelle aus
    // der Index-Probe; darunter sind es Woerter, keine Schluessel.
    id: 'long-token',
    pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
  },
  {
    id: 'home-path',
    pattern: /(?:\/home\/|\/Users\/)[^/\s]+/g,
    to: () => '~',
  },
  {
    id: 'windows-home',
    pattern: /[A-Za-z]:\\Users\\[^\\\s]+/g,
    to: () => '~',
  },
  {
    id: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    to: () => '[MAIL]',
  },
  {
    // Unsichtbare Zeichen: Zero-Width, Bidi-Steuerung, BOM. Sie sind kein
    // Inhalt, sondern eine Moeglichkeit, Anweisungen zu verstecken.
    id: 'invisible',
    pattern: /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
    to: () => '',
  },
]);

/** Ein Treffer ohne Wert: nur Musterkennung und Laenge. */
function findingsOf(value) {
  const text = String(value ?? '');
  const hits = [];
  for (const entry of PATTERNS) {
    entry.pattern.lastIndex = 0;
    let match;
    while ((match = entry.pattern.exec(text)) !== null) {
      hits.push({ id: entry.id, length: match[0].length });
      if (match.index === entry.pattern.lastIndex) entry.pattern.lastIndex += 1;
    }
  }
  return hits;
}

/**
 * Redigieren. Die Reihenfolge ist Teil des Vertrags: ein Private-Key-Block
 * verschwindet VOR der Base64-Regel, sonst bliebe ein Rest stehen; die
 * Zuweisungsregel laeuft VOR der langen Folge, damit der Name lesbar bleibt.
 */
export function redactText(value) {
  let text = String(value ?? '');
  for (const entry of PATTERNS) {
    entry.pattern.lastIndex = 0;
    text = text.replace(entry.pattern, entry.to ?? (() => REDACTED));
  }
  return text;
}

/** Die Befunde der Redaktion — Kennungen und Laengen, nie der Wert. */
export function secretFindings(value) {
  return findingsOf(value);
}

/** Leerraum zusammenziehen, damit ein Beleg genau eine Zeile bleibt. */
export function flatten(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Ein frischer Puffer. `seq` zaehlt Eintraege, damit Tests stabil bleiben. */
export function emptyBuffer() {
  // `werkzeuge` heisst die Zaehlung, nicht `tools`: im Prompter ist `tools`
  // der Werkzeugkatalog des Hosts, und der One-Shot-Pfad darf ihn nicht tragen
  // (`prompter-contract.part2`). Ein Feldname waere dort ein Fehlalarm.
  return { entries: [], werkzeuge: {}, chars: 0, seq: 0 };
}

/** Den Puffer auf die Grenzen bringen: aeltester Eintrag zuerst weg. */
function trimmed(buffer, limits) {
  const maxEntries = Number.isInteger(limits?.maxEntries) && limits.maxEntries > 0 ? limits.maxEntries : 24;
  const maxChars = Number.isInteger(limits?.maxChars) && limits.maxChars > 0 ? limits.maxChars : 8000;
  const entries = [...buffer.entries];
  let chars = entries.reduce((sum, entry) => sum + entry.text.length, 0);
  while (entries.length > maxEntries || chars > maxChars) {
    const removed = entries.shift();
    if (removed === undefined) break;
    chars -= removed.text.length;
  }
  return { ...buffer, entries, chars };
}

/**
 * Einen Beleg aufnehmen. `kind` ist `user`, `assistant` oder `correction`;
 * Werkzeuge laufen ueber `addTool`. Der Text wird redigiert, geflattet und
 * je Beleg gedeckelt, BEVOR er im Puffer liegt — nichts Sensibles wartet dort.
 */
export function addEntry(buffer, entry, limits = {}) {
  const kind = ['user', 'assistant', 'correction'].includes(entry?.kind) ? entry.kind : null;
  if (kind === null) return buffer;
  const ref = flatten(entry?.ref);
  if (ref === '') return buffer;
  const maxEntryChars = Number.isInteger(limits?.maxEntryChars) && limits.maxEntryChars > 0 ? limits.maxEntryChars : 700;
  const text = flatten(redactText(entry?.text)).slice(0, maxEntryChars);
  if (text === '') return buffer;
  const seq = (buffer?.seq ?? 0) + 1;
  const next = {
    ...(buffer ?? emptyBuffer()),
    seq,
    entries: [...(buffer?.entries ?? []), { kind, ref, text, seq }],
  };
  return trimmed(next, limits);
}

/** Einen Werkzeugnamen zaehlen — ohne Argumente, ohne Ergebnis. */
export function addTool(buffer, name, limits = {}) {
  const tool = flatten(redactText(name)).slice(0, 80);
  if (tool === '') return buffer;
  const base = buffer ?? emptyBuffer();
  const werkzeuge = { ...(base.werkzeuge ?? {}) };
  werkzeuge[tool] = (werkzeuge[tool] ?? 0) + 1;
  return trimmed({ ...base, werkzeuge, seq: (base.seq ?? 0) + 1 }, limits);
}

/**
 * Die Belege als Text. `refs` ist die Liste der Quellen, die das Modell
 * tatsaechlich gesehen hat — nur daraus darf ein Vorschlag seine `sources`
 * waehlen. Ein Werkzeug reist als eine Zeile mit Zahl.
 */
export function renderDigest(buffer, limits = {}) {
  const entries = buffer?.entries ?? [];
  const werkzeuge = buffer?.werkzeuge ?? {};
  const lines = ['<gespraech>'];
  const refs = [];
  for (const entry of entries) {
    lines.push(`<beleg art="${entry.kind}" ref="${entry.ref}">${entry.text}</beleg>`);
    refs.push(entry.ref);
  }
  for (const name of Object.keys(werkzeuge).sort()) {
    const ref = `tool:${name}`;
    lines.push(`<werkzeug name="${name}" aufrufe="${werkzeuge[name]}" ref="${ref}"/>`);
    refs.push(ref);
  }
  lines.push('</gespraech>');
  return { text: lines.join('\n'), refs };
}

/** Nur die Quellen (fuer die Herkunftspruefung ohne erneutes Rendern). */
export function digestRefs(buffer) {
  return renderDigest(buffer).refs;
}
