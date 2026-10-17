/**
 * commit-text.mjs — die eine Wahrheit für Commit-Nachrichten.
 *
 * Kein Git-Zugriff, keine I/O: der Text kommt rein, die Verstöße kommen raus.
 * Damit erzwingen lokaler Hook, Gate und CI dieselben Regeln, ohne sie zu
 * duplizieren (wie Feed-the-Floors lib/commit-text.mjs, hier für Shinon).
 *
 * Drei Regeln, alle fail-closed:
 * → Kanon: docs/COMMENT-KANON.md#k-5c39318b2a8e
 */

/** Der Trailer, der jeden Commit abschließt. */
export const VANNON_TRAILER =
  'created by VANNON — Volatile Agent Needing No Other Nonsense, Never Overly Nice, Never Average Vibe';

/**
 * Menschen als Co-Autoren sind in diesem Repo ebenfalls nicht vorgesehen:
 * Feed-the-Floors Regelwerk verbietet `co-authored-by` vollständig, und ein
 * zweiter Trailer wäre eine zweite Wahrheit. Bewusst als Konstante, damit die
 * Entscheidung sichtbar ist, wenn sie jemand ändern will.
 */
export const ALLOW_CO_AUTHORED_BY = false;

/** Schreibweisen des Trailers: Whitespace und Gedankenstriche werden gefaltet. */
const fold = (text) => String(text).replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

export const TRAILER_FOLDED = fold(VANNON_TRAILER);

/** Die Namen, die als KI-Autor gelten. Eine Liste, alle Regeln greifen darauf zu. */
const AI_NAMES = 'codebuff|claude|chatgpt|chat gpt|gpt|copilot|gemini|cursor|aider|openai|anthropic|devin|codex|qwen';

/** Verben, mit denen sich eine Maschine als Autor ausgibt. */
const SIGNATURE_VERBS = 'generated|made|written|created|powered';

/** Die Co-Autor-Regel als Textbaustein (Tests und Ausgabe teilen ihn). */
export const CO_AUTHOR_RULE =
  'co-authored-by ist verboten (auch für Menschen) — stattdessen den Vannon-Trailer verwenden';

/**
 * Verbotene Footer-Zeilen. Jede Regel wird ZEILENWEISE geprüft (`^` = Zeilen-
 * Anfang) — dieselbe Prüfung entscheidet darüber, was der Tausch entfernt.
 *
 * Absichtlich tolerant: `\s+` statt eines Leerzeichens, `with`/`by` gleichwertig,
 * optionaler Doppelpunkt. Eine Signatur, die sich durch ein Tab versteckt, ist
 * noch dieselbe Signatur.
 */
export const FORBIDDEN_LINES = [
  { re: /noreply@codebuff\.com/i, label: 'Codebuff-Signatur (noreply@codebuff.com)' },
  {
    re: new RegExp(`\\b(${SIGNATURE_VERBS})\\s+(with|by)\\s*:?\\s*(${AI_NAMES})`, 'i'),
    label: 'KI-Signatur „… with/by <KI>"',
  },
  {
    re: new RegExp(`(co-authored-by|co-authored by|coauthored-by)\\s*:?\\s*[^\\n]*(${AI_NAMES})`, 'i'),
    label: 'KI-Co-Author-Trailer',
  },
  { re: /^[ \t]*(generated|made)[ \t]+(with|by)\b/i, label: 'Footer „Generated with/by …"' },
  { re: /^[ \t]*[🤖🦊][ \t]*(generated|written|made|created)\b/i, label: 'KI-Emoji-Signatur' },
];

/**
 * Alle Verstöße einer einzelnen Zeile. Die EINE Prüfung: `checkMessage` ruft sie
 * für jede Zeile, `swapTrailer` entfernt genau die Zeilen mit Ergebnis > 0.
 * `#`-Kommentarzeilen bleiben unberührt (git schneidet sie selbst ab).
 *
 * @returns {string[]} Verstoß-Beschreibungen (leer ⇒ Zeile ist in Ordnung).
 */
export function forbiddenLabelsOf(line) {
  const text = String(line ?? '');
  if (text.trim().startsWith('#')) return [];

  const labels = [];
  if (!ALLOW_CO_AUTHORED_BY && /^[ \t]*co-authored-by[ \t]*:/i.test(text)) labels.push(CO_AUTHOR_RULE);
  for (const { re, label } of FORBIDDEN_LINES) {
    if (re.test(text)) labels.push(`verbotener Footer: ${label}`);
  }
  return labels;
}

/**
 * Regel 3: die Wort-Regel. Eine Commit-Nachricht erzählt die Änderung — kein
 * Stichwort, keine anonyme Zahl. Drei Zusagen, alle am Inhalt (ohne Trailer
 * und ohne `#`-Kommentarzeilen, die git ohnehin abschneidet):
 *
 *   1. Umfang: mindestens WORD_MIN Wörter (Whitespace-getrennt; Zahlwörter und
 *      Code zählen mit — dokumentiert, nicht geraten).
 *   2. Daten namentlich: mindestens eine konkrete Referenz aus
 * → Kanon: docs/COMMENT-KANON.md#k-c2a86d55bdef
 */
export const WORD_MIN = 150;

/**
 * Die Voreinstellung ist das heutige Repo-Verhalten (Preset `shinon-maintainer`).
 * Jede Regel ist ein Feld, damit ein Preset sie setzen kann — der Fußboden
 * (Signatur-Footer, co-authored-by) steht dagegen NICHT hier und ist nicht abwählbar.
 */
export const DEFAULT_RULES = Object.freeze({
  name: 'shinon-maintainer',
  subjectPattern: null,
  subjectHint: '',
  trailerRequired: true,
  trailerText: VANNON_TRAILER,
  minWords: WORD_MIN,
  requireNamedData: true,
  requireImagery: true,
  repairSwapTrailer: true,
});

/** Konkrete Referenzen: je ein Muster, je ein Name für die Meldung. */
export const NAMED_DATA_PATTERNS = [
  { re: /[\w.~\-]+\/[\w.~\/-]+\.\w{1,8}\b/, label: 'Pfad mit Endung (z. B. scripts/lib/commit-text.mjs)' },
  { re: /\b[0-9a-f]{7,40}\b/, label: 'Commit-SHA (7–40 Hexzeichen)' },
  { re: /\b\d+\s*\/\s*\d+\b/, label: 'Messung (z. B. 401/401)' },
  { re: /\bexit\s+\d+\b/i, label: 'Exit-Angabe (z. B. Exit 0)' },
  { re: /\b(run|pr|issue|commit)\s+#?\d+\b/i, label: 'Run/PR/Issue/Commit mit Nummer' },
  { re: /#\d+/, label: 'Nummernverweis (#127)' },
];

/**
 * Feste Bildmarker. Enge Liste mit Wortgrenzen statt freier Stilprüfung:
 * `wie der Test zeigt` zählt nicht — `wie ein` schon. Wer einen Marker
 * vermisst, trägt ihn hier ein (mit Test), statt ihn zu behaupten.
 */
export const BILDSPRACHE_MARKERS = [
  'wie ein',
  'wie eine',
  'wie einem',
  'wie einer',
  'wie eines',
  'als wäre',
  'als ob',
  'als sei',
  'gleich einem',
  'gleich einer',
  'bildlich',
  'metapher',
  'szene:',
  'bild:',
];

/** Inhaltszeilen: ohne Trailer-Zeilen und ohne `#`-Kommentare. */
function contentText(raw) {
  return String(raw ?? '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) return false;
      return !fold(trimmed).includes(TRAILER_FOLDED);
    })
    .join('\n');
}

/** Wörter zählen (Whitespace-getrennt). Exportiert, damit Tests die Grenze pinnen. */
export function countWords(raw) {
  return contentText(raw)
    .split(/\s+/)
    .filter((word) => word !== '').length;
}

/**
 * Verstöße gegen die Wort-Regel (leer ⇒ Umfang, Daten und Bildsprache stehen).
 */
export function wordViolations(raw, rules = DEFAULT_RULES) {
  const content = contentText(raw);
  const violations = [];
  const words = countWords(raw);
  if (rules.minWords > 0 && words < rules.minWords) {
    violations.push(
      `Wort-Regel: Nachricht zu kurz — ${words} Wörter, mindestens ${rules.minWords} verlangt (Trailer und #-Zeilen zählen nicht)`,
    );
  }
  if (rules.requireNamedData && !NAMED_DATA_PATTERNS.some(({ re }) => re.test(content))) {
    violations.push(
      `Wort-Regel: keine Daten namentlich genannt — verlangt ist mindestens eines: ${NAMED_DATA_PATTERNS.map(({ label }) => label).join('; ')}`,
    );
  }
  const lowered = `\n${content.toLowerCase()}\n`;
  if (rules.requireImagery && !BILDSPRACHE_MARKERS.some((marker) => lowered.includes(marker))) {
    violations.push(
      `Wort-Regel: keine Bildsprache — verlangt ist ein Vergleichs-/Bildmarker: ${BILDSPRACHE_MARKERS.join(', ')}`,
    );
  }
  return violations;
}

/** Ist diese Zeile ein verbotener Footer? */
export function isForbiddenFooterLine(line) {
  return forbiddenLabelsOf(line).length > 0;
}

/** Trägt die Nachricht den Trailer des Presets (in den letzten drei inhaltlichen Zeilen)? */
export function carriesTrailer(raw, rules = DEFAULT_RULES) {
  const wanted = fold(rules.trailerText ?? VANNON_TRAILER);
  const lines = String(raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  return lines.slice(-3).some((line) => fold(line).includes(wanted));
}

/** Trägt die Nachricht den Vannon-Trailer (in den letzten drei inhaltlichen Zeilen)? */
export function hasVannonTrailer(raw) {
  return carriesTrailer(raw, DEFAULT_RULES);
}

/** Die erste inhaltliche Zeile — der Betreff, gegen den ein Preset prüfen kann. */
function firstContentLine(raw) {
  const line = String(raw ?? '')
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate !== '' && !candidate.startsWith('#'));
  return line ?? '';
}

/**
 * Nachricht prüfen — zeilenweise, mit demselben Prädikat wie der Tausch.
 * @returns {{ ok: boolean, violations: string[], hasTrailer: boolean }}
 */
export function checkMessage(raw, rules = DEFAULT_RULES) {
  const text = String(raw ?? '');
  const violations = [];
  const seen = new Set();

  for (const line of text.split('\n')) {
    for (const label of forbiddenLabelsOf(line)) {
      if (seen.has(label)) continue;
      seen.add(label);
      violations.push(label);
    }
  }

  if (rules.subjectPattern) {
    const subject = firstContentLine(text);
    if (!new RegExp(rules.subjectPattern).test(subject)) {
      const shown = subject.length > 72 ? `${subject.slice(0, 72)}…` : subject;
      const hint = rules.subjectHint || rules.subjectPattern;
      violations.push(`Format: Betreff passt nicht zum Preset „${rules.name}" — ${hint} (Betreff: ${JSON.stringify(shown)})`);
    }
  }

  const hasTrailer = carriesTrailer(text, rules);
  if (rules.trailerRequired && !hasTrailer) {
    violations.push(`Vannon-Trailer fehlt — erwartet als letzte Zeile: ${rules.trailerText}`);
  }
  for (const violation of wordViolations(text, rules)) violations.push(violation);
  return { ok: violations.length === 0, violations, hasTrailer };
}

/**
 * Verbotene Footer-Zeilen entfernen und den Trailer anhängen (idempotent).
 * Das ist der „eintauschen"-Schritt: lokal ersetzt der Hook die Signatur,
 * in CI gibt es keinen Tausch — dort gilt fail-closed.
 */
export function swapTrailer(raw, rules = DEFAULT_RULES) {
  // Ein Preset ohne Reparatur (strict-evidence) schreibt nichts: der Tausch ist
  // eine definierte, begrenzte Handlung, keine allgemeine Lizenz zum Umschreiben.
  if (rules.repairSwapTrailer === false) return String(raw ?? '');
  const lines = String(raw ?? '').replace(/\r\n/g, '\n').split('\n');
  const kept = lines.filter((line) => !isForbiddenFooterLine(line));
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  const body = kept.join('\n');
  if (carriesTrailer(body, rules)) return `${body}\n`;
  return `${body}\n\n${VANNON_TRAILER}\n`;
}
