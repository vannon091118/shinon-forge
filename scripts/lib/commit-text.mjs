/**
 * commit-text.mjs — die eine Wahrheit für Commit-Nachrichten.
 *
 * Kein Git-Zugriff, keine I/O: der Text kommt rein, die Verstöße kommen raus.
 * Damit erzwingen lokaler Hook, Gate und CI dieselben Regeln, ohne sie zu
 * duplizieren (wie Feed-the-Floors lib/commit-text.mjs, hier für Shinon).
 *
 * Zwei Regeln, beide fail-closed:
 *   1. Kein KI-Footer. Nie. Auch nicht als Co-Autor, auch nicht als Emoji-Zeile.
 *   2. Der Vannon-Trailer ist Pflicht — er ersetzt jede Maschinen-Signatur.
 *
 * Der Trailer ist bewusst ein Datenwert an EINER Stelle: ändert sich die
 * Schreibweise, ändert sich hier etwas, und CI, Hook, Gate und Tests ziehen mit.
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

/** Verbotene Footer: jede Zeile, die eine Maschine als Autor ausgibt. */
export const FORBIDDEN_LINES = [
  { re: /noreply@codebuff\.com/i, label: 'Codebuff-Signatur (noreply@codebuff.com)' },
  { re: /generated with\s+(codebuff|claude|chatgpt|chat gpt|gpt|copilot|gemini|cursor|aider|openai|anthropic|devin|codex|qwen)/i, label: 'KI-Footer „Generated with …"' },
  { re: /(co-authored-by|co-authored by|coauthored-by)\s*:?\s*[^\n]*(codebuff|claude|anthropic|openai|copilot|gemini|cursor|gpt)/i, label: 'KI-Co-Author-Trailer' },
  { re: /powered by\s+(chatgpt|claude|gemini|openai|anthropic)/i, label: 'KI-Signatur „powered by …"' },
  { re: /^\s*[🤖🦊]\s*(generated|written|made|created)\s+with\b/i, label: 'KI-Emoji-Signatur' },
  { re: /^\s*generated with\b/i, label: 'Footer „Generated with …"' },
];

/** Ist diese Zeile ein verbotener Footer? `#`-Kommentare bleiben unberührt. */
export function isForbiddenFooterLine(line) {
  const text = String(line ?? '');
  if (text.trim().startsWith('#')) return false;
  if (!ALLOW_CO_AUTHORED_BY && /^\s*co-authored-by\s*:/i.test(text)) return true;
  return FORBIDDEN_LINES.some(({ re }) => re.test(text));
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
 * Nachricht prüfen.
 * @returns {{ ok: boolean, violations: string[], hasTrailer: boolean }}
 */
export function checkMessage(raw) {
  const text = String(raw ?? '');
  const violations = [];

  for (const { re, label } of FORBIDDEN_LINES) {
    if (re.test(text)) violations.push(`verbotener Footer: ${label}`);
  }
  if (!ALLOW_CO_AUTHORED_BY && /^\s*co-authored-by\s*:/im.test(text)) {
    violations.push('co-authored-by ist verboten (auch für Menschen) — stattdessen den Vannon-Trailer verwenden');
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
