/**
 * commit-text.mjs — die eine Wahrheit für Commit-Nachrichten.
 *
 * Kein Git-Zugriff, keine I/O: der Text kommt rein, die Verstöße kommen raus.
 * Damit erzwingen lokaler Hook, Gate und CI dieselben Regeln, ohne sie zu
 * duplizieren (wie Feed-the-Floors lib/commit-text.mjs, hier für Shinon).
 *
 * Zwei Regeln, beide fail-closed:
 *   1. Kein KI-Footer. Nie — und in keiner Schreibweise: `with`/`by`, eine oder
 *      mehrere Leerzeichen, Tabs, optionaler Doppelpunkt.
 *   2. Der Vannon-Trailer ist Pflicht — er ersetzt jede Maschinen-Signatur.
 *
 * Der Trailer ist bewusst ein Datenwert an EINER Stelle: ändert sich die
 * Schreibweise, ändert sich hier etwas, und CI, Hook, Gate und Tests ziehen mit.
 *
 * Prüfen und Tauschen benutzen dasselbe zeilenweise Prädikat
 * (`forbiddenLabelsOf`). Daraus folgt die Invariante, die die Tests pinnen:
 *
 *     swapTrailer(n) !== n  ⇒  checkMessage(n).ok === false
 *     checkMessage(n).ok    ⇒  swapTrailer(n) entfernt keine Inhaltszeile
 *
 * Heißt: was der lokale Hook entfernt, muss CI auch ohne Hook ablehnen. Keine
 * Ebene repariert heimlich, was die andere durchwinkt. Signaturen sind
 * zeilenweise — geprüft wird die Zeile, nicht der Fließtext.
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

/** Ist diese Zeile ein verbotener Footer? */
export function isForbiddenFooterLine(line) {
  return forbiddenLabelsOf(line).length > 0;
}

/** Trägt die Nachricht den Vannon-Trailer (in den letzten drei inhaltlichen Zeilen)? */
export function hasVannonTrailer(raw) {
  const lines = String(raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  return lines.slice(-3).some((line) => fold(line).includes(TRAILER_FOLDED));
}

/**
 * Nachricht prüfen — zeilenweise, mit demselben Prädikat wie der Tausch.
 * @returns {{ ok: boolean, violations: string[], hasTrailer: boolean }}
 */
export function checkMessage(raw) {
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

  const hasTrailer = hasVannonTrailer(text);
  if (!hasTrailer) {
    violations.push(`Vannon-Trailer fehlt — erwartet als letzte Zeile: ${VANNON_TRAILER}`);
  }
  return { ok: violations.length === 0, violations, hasTrailer };
}

/**
 * Verbotene Footer-Zeilen entfernen und den Trailer anhängen (idempotent).
 * Das ist der „eintauschen"-Schritt: lokal ersetzt der Hook die Signatur,
 * in CI gibt es keinen Tausch — dort gilt fail-closed.
 */
export function swapTrailer(raw) {
  const lines = String(raw ?? '').replace(/\r\n/g, '\n').split('\n');
  const kept = lines.filter((line) => !isForbiddenFooterLine(line));
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  const body = kept.join('\n');
  if (hasVannonTrailer(body)) return `${body}\n`;
  return `${body}\n\n${VANNON_TRAILER}\n`;
}
