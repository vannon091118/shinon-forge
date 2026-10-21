/**
 * @shinon/diff-overview — der Kern: aus Git-Ausgabe wird eine Übersicht.
 *
 * WARUM DIESER KERN EXISTIERT: das Panel im WorkspaceBrowser zeigt +/−-Zahlen je
 * Datei und auf Klick die Zeilen. Es RECHNET keinen Diff. Die Wahrheit über einen
 * Diff ist `git`; dieser Kern liest nur, was `git` schon entschieden hat
 * (`--numstat`, `--porcelain`, `--unified`). Ein zweiter Diff-Algorithmus im
 * Browser wäre eine zweite Wahrheit über dieselbe Sache — und im installierten
 * DSH-Baum ist weder eine Diff-Bibliothek noch ein Diff-Dienst vorhanden
 * (gemessen: `docs/probes/diff-overview.json`).
 *
 * KEINE BARE IMPORTS: der Kern läuft in CI ohne `node_modules` (Unit-Test
 * `packages/diff-overview/test/diff-core.test.mjs`). Er kennt keine Uhr, kein
 * Netz, kein Dateisystem — Text rein, Modell raus.
 *
 * WAS HIER NIE PASSIERT: stilles Kürzen. Jede Grenze, die greift, steht als
 * `truncated` im Ergebnis mit Soll und Ist; ein Panel, das 300 Zeilen zeigt und
 * 3 000 hat, ohne es zu sagen, lügt über seine Abdeckung.
 */

/** Der Vertrag der Übersicht (Host und Client führen denselben Namen). */
export const DIFF_CONTRACT = 'shinon.diff/overview-v1';

/** Der Vertrag EINER Datei (Hunks, Zeilen, Grenzen). */
export const DIFF_FILE_CONTRACT = 'shinon.diff/file-v1';

/** Die Route des Hosts; der Client führt sie als Literal. */
export const DIFF_ENDPOINT = '/shinon/diff';

/**
 * Die Marke je Git-Status. `?` ist unversioniert (nicht in HEAD, also ohne
 * Zeilenzahlen — Git hat für diese Datei keinen Vergleich).
 */
export const FILE_MARKS = Object.freeze({
  M: 'geändert',
  A: 'neu (gestaged)',
  D: 'gelöscht',
  '?': 'unversioniert',
  R: 'umbenannt',
  C: 'kopiert',
  U: 'Konflikt',
  T: 'Typwechsel',
});

/** Die Marke je Diff-Zeile. `' '` ist Kontext — er ist da, damit man ihn liest. */
export const LINE_MARKS = Object.freeze({ '+': 'hinzu', '-': 'weg', ' ': 'Kontext' });

/**
 * Den Status eines Porcelain-Eintrags lesen. `XY` ist Index- und
 * Arbeitsbaum-Zustand; für die Anzeige zählt der stärkere von beiden.
 * @param {string} xy zwei Zeichen aus `git status --porcelain`
 * @returns {string} ein Schlüssel aus FILE_MARKS
 */
export function statusOf(xy) {
  const pair = String(xy ?? '');
  if (pair === '??') return '?';
  for (const letter of ['U', 'D', 'A', 'R', 'C', 'T', 'M']) {
    if (pair.includes(letter)) return letter;
  }
  return 'M';
}

/**
 * `git status --porcelain=v1 -z --no-renames` lesen: Einträge sind
 * NUL-getrennt, je Eintrag `XY <pfad>`.
 * @param {string} text
 * @returns {Array<{ path: string, status: string, mark: string }>}
 */
export function parseStatus(text) {
  const files = [];
  for (const entry of String(text ?? '').split('\u0000')) {
    if (entry.length < 4) continue;
    const status = statusOf(entry.slice(0, 2));
    const path = entry.slice(3);
    if (path === '') continue;
    files.push({ path, status, mark: FILE_MARKS[status] ?? status });
  }
  return files;
}

/**
 * `git diff --numstat -z --no-renames HEAD` lesen: `hinzu\tweg\tpfad`,
 * binär als `-\t-\tpfad` (Git zählt dort keine Zeilen).
 * @param {string} text
 * @returns {Map<string, { added: number|null, removed: number|null }>}
 */
export function parseNumstat(text) {
  const counts = new Map();
  for (const entry of String(text ?? '').split('\u0000')) {
    if (entry === '') continue;
    const parts = entry.split('\t');
    if (parts.length < 3) continue;
    const [addedRaw, removedRaw, ...rest] = parts;
    const path = rest.join('\t');
    const number = (value) => (/^\d+$/.test(value) ? Number(value) : null);
    counts.set(path, { added: number(addedRaw), removed: number(removedRaw) });
  }
  return counts;
}

/**
 * Die Übersicht bauen: Status (welche Dateien), Numstat (wie viele Zeilen).
 * Eine Datei ohne Numstat-Eintrag — unversioniert oder binär — bekommt Zahlen
 * `null` und einen Grund; sie wird NIE mit 0 gezählt, denn 0 wäre eine Aussage,
 * die niemand gemessen hat.
 *
 * @param {{ statusText?: string, numstatText?: string, maxFiles?: number }} input
 * @returns {{ files: Array<object>, totals: object, truncated: object|null }}
 */
export function buildOverview({ statusText = '', numstatText = '', maxFiles = 200 } = {}) {
  const statused = parseStatus(statusText);
  const counts = parseNumstat(numstatText);
  const files = statused.map((entry) => {
    const counted = counts.get(entry.path);
    const binary = counted !== undefined && counted.added === null;
    const note = counted === undefined
      ? (entry.status === '?' ? 'nicht in HEAD — Git hat keinen Vergleich' : 'keine Zeilenzahl von Git')
      : binary ? 'binär — keine Zeilenzahl' : '';
    return {
      path: entry.path,
      status: entry.status,
      mark: entry.mark,
      added: counted?.added ?? null,
      removed: counted?.removed ?? null,
      counted: counted !== undefined && !binary,
      note,
    };
  }).sort((left, right) => left.path.localeCompare(right.path));

  const totals = { files: files.length, added: 0, removed: 0, counted: 0, uncounted: 0 };
  for (const file of files) {
    if (file.counted) {
      totals.counted += 1;
      totals.added += file.added;
      totals.removed += file.removed;
    } else {
      totals.uncounted += 1;
    }
  }
  const limit = Number.isInteger(maxFiles) && maxFiles > 0 ? maxFiles : 200;
  const truncated = files.length > limit
    ? { reason: 'DATEIEN', soll: limit, ist: files.length }
    : null;
  return { files: truncated === null ? files : files.slice(0, limit), totals, truncated };
}

/**
 * Eine Zeile kürzen — sichtbar. Der Marker `…` bleibt im Text, damit niemand
 * eine gekürzte Zeile für die ganze hält; die Zahl der gekürzten Zeilen steht
 * im Ergebnis.
 * @param {string} text
 * @param {number} maxChars
 * @returns {{ text: string, clipped: boolean }}
 */
export function clipLine(text, maxChars) {
  const limit = Number.isInteger(maxChars) && maxChars > 8 ? maxChars : 400;
  const raw = String(text ?? '');
  return raw.length > limit ? { text: `${raw.slice(0, limit - 1)}…`, clipped: true } : { text: raw, clipped: false };
}

/**
 * `git diff --unified` lesen: Hunk-Köpfe, Zeilen mit ihrer Marke.
 *
 * Gelesen wird nur, was ein Diff ist: `@@` beginnt einen Hunk, `+`/`-`/` `
 * sind seine Zeilen. Datei-Köpfe (`diff --git`, `index`, `---`, `+++`) und
 * `\ No newline at end of file` tragen keine Zeile bei.
 *
 * @param {string} text
 * @param {{ maxLines?: number, maxLineChars?: number }} [limits]
 * @returns {{ hunks: Array<object>, lines: number, clipped: number, truncated: object|null }}
 */
export function parseUnified(text, limits = {}) {
  const maxLines = Number.isInteger(limits.maxLines) && limits.maxLines > 0 ? limits.maxLines : 400;
  const maxLineChars = Number.isInteger(limits.maxLineChars) && limits.maxLineChars > 8 ? limits.maxLineChars : 400;
  const hunks = [];
  let current = null;
  let lines = 0;
  let clipped = 0;
  let truncated = null;

  for (const raw of String(text ?? '').split('\n')) {
    if (raw.startsWith('@@')) {
      current = { header: raw.trim(), rows: [] };
      hunks.push(current);
      continue;
    }
    const mark = raw.charAt(0);
    if (mark !== '+' && mark !== '-' && mark !== ' ') continue;
    if (current === null) continue;
    if (lines >= maxLines) {
      truncated = { reason: 'ZEILEN', soll: maxLines, ist: lines + 1 };
      break;
    }
    const cut = clipLine(raw.slice(1), maxLineChars);
    if (cut.clipped) clipped += 1;
    current.rows.push({ mark, label: LINE_MARKS[mark] ?? '', text: cut.text });
    lines += 1;
  }
  return { hunks, lines, clipped, truncated };
}
