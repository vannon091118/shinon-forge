/**
 * @shinon/prompter — provenance.js
 *
 * Die Provenienz-Leiter als Runtime-Vertrag (`shinon.provenance/v1`): fünf
 * Klassen, Zeigerpflicht, keine Beförderung.
 *
 * WARUM ES DIESE DATEI GIBT: die Entscheidung eines Turns ist heute an vielen
 * Stellen belegt (`context_source`, `stand`, `reasons`), aber nirgends steht,
 * WAS für eine Art Aussage in den Prompt gereist ist. Ein Index-Treffer sieht
 * im Trace wie eine gelesene Datei aus, ein Scoring-Ton wie eine Regel. Genau
 * diese Verwechslung schließt der Vertrag aus.
 *
 * KEINE IMPORTE. Weder Bare noch `node:` — dieselbe Regel wie `note-core.js`
 * und `block-select.js`: nur dann läuft der Test in CI ohne `node_modules`.
 * Deshalb ist die Zeigerprüfung eine reine Stringprüfung; sie liest nie das
 * Dateisystem und weiß nicht, ob der Zeiger heute noch trifft.
 *
 * KEINE RANGFOLGE. Die fünf Klassen sind Kategorien, keine Stufen. Es gibt
 * absichtlich kein `rank`-Feld und keine Ordnung, die als „FACT schlägt
 * DERIVED" gelesen werden könnte: `canPromote` ist nur für dieselbe Klasse
 * wahr. Wer aus einem Index-Treffer eine Tatsache machen will, muss die Quelle
 * neu lesen — dann entsteht ein NEUER Eintrag, keine Beförderung.
 */

/** Vertragsname der Leiter. */
export const PROVENANCE_CONTRACT = 'shinon.provenance/v1';

/**
 * Die fünf Klassen — geschlossenes Vokabular.
 *
 * Die Reihenfolge ist Deklarationsreihenfolge, keine Wertung. `FACT` steht
 * zuerst, weil es die einzige Klasse ist, die eine Aussage über den Baum
 * behaupten darf; die übrigen sind ausdrücklich Hilfe.
 */
export const PROVENANCE_CLASSES = ['FACT', 'DERIVED', 'JUDGEMENT', 'NARRATIVE', 'PROPOSAL'];

/** Die zwei erlaubten Zeigerformen. */
export const POINTER_KINDS = ['file', 'contract'];

const CLASS_SET = new Set(PROVENANCE_CLASSES);

/**
 * Eine Vertrags-ID: `shinon.<name>/<version>`. Punkte im Namen sind erlaubt
 * (`shinon.project-index/query-v1`), Großbuchstaben nicht — die Verträge
 * dieses Repos sind durchgehend klein geschrieben.
 */
const CONTRACT_POINTER = /^shinon\.[a-z0-9.-]+\/[a-z0-9.-]+$/;

/** Ein optionaler Zeilensuffix ist die LETZTE Zahl nach dem letzten Doppelpunkt. */
const LINE_SUFFIX = /^(.*):(\d+)$/;

const MAX_SOURCE_LENGTH = 120;

/**
 * Einen Zeiger prüfen und normalisieren.
 *
 * Zwei Formen, mehr nicht:
 *
 *   Datei      relativer Pfad, optional `:Zeile` (1-basiert). `./` wird
 *              entfernt; absolut, `..`, Backslash und ein zweiter Doppelpunkt
 *              werden abgewiesen. Der Pfad wird NICHT gegen die Platte geprüft:
 *              das wäre ein zweiter Index und würde bei jedem Trace lesen.
 *   Vertrag    `shinon.<name>/<version>`, z. B. `shinon.narrative/v1`.
 *
 * @param {unknown} ref - der rohe Zeiger aus einem Eintrag.
 * @returns {{ok: true, kind: string, ref: string, path: string|null, line: number|null}
 *          | {ok: false, reason: string}}
 */
export function parsePointer(ref) {
  if (typeof ref !== 'string') return { ok: false, reason: 'ZEIGER_KEIN_STRING' };
  if (ref.trim() !== ref) return { ok: false, reason: 'ZEIGER_LEERZEICHEN' };
  if (ref === '') return { ok: false, reason: 'ZEIGER_LEER' };

  if (CONTRACT_POINTER.test(ref)) return { ok: true, kind: 'contract', ref, path: null, line: null };

  let path = ref;
  let line = null;
  const suffix = LINE_SUFFIX.exec(ref);
  if (suffix !== null) {
    path = suffix[1];
    line = Number(suffix[2]);
  }
  if (path.startsWith('./')) path = path.slice(2);
  if (path === '') return { ok: false, reason: 'ZEIGER_LEER' };
  if (path.startsWith('/')) return { ok: false, reason: 'ZEIGER_ABSOLUT' };
  if (path.includes('\\')) return { ok: false, reason: 'ZEIGER_TRENNER' };
  if (path.includes('\0')) return { ok: false, reason: 'ZEIGER_ZEICHEN' };
  // Ein übrig gebliebener Doppelpunkt ist weder Pfad noch Zeile: etwa ein
  // Windows-Laufwerk oder ein zweiter `:Zahl`-Suffix.
  if (path.includes(':')) return { ok: false, reason: 'ZEIGER_FREMD' };
  // Vertragsähnliche Formen, die die strenge Regel oben nicht passieren, sind
  // Zeiger auf etwas, das dieser Vertrag nicht kennt — kein Dateipfad.
  if (/^shinon\./i.test(path) && path.includes('/')) return { ok: false, reason: 'ZEIGER_FREMD' };

  const segments = path.split('/');
  if (segments.includes('..')) return { ok: false, reason: 'ZEIGER_AUSBRUCH' };
  if (segments.some((segment) => segment === '' || segment === '.')) return { ok: false, reason: 'ZEIGER_FORM' };
  if (line !== null && (!Number.isSafeInteger(line) || line < 1)) return { ok: false, reason: 'ZEIGER_ZEILE' };

  return { ok: true, kind: 'file', ref: line === null ? path : `${path}:${line}`, path, line };
}

/** Ist der Wert eine der fünf Klassen? */
export function isProvenanceClass(value) {
  return CLASS_SET.has(value);
}

/**
 * Darf eine Klasse in eine andere übergehen?
 *
 * Nur in sich selbst. Das ist die ganze Regel „keine Beförderung": es gibt
 * keinen Aufstieg, auch keinen „belegten". Ein neuer Beleg ist ein neuer
 * Eintrag mit derselben oder einer ehrlicheren Klasse — nie ein umgeschriebener.
 *
 * @param {unknown} from - Ausgangsklasse.
 * @param {unknown} to - Zielklasse.
 * @returns {boolean} true nur bei `from === to` und bekannter Klasse.
 */
export function canPromote(from, to) {
  return CLASS_SET.has(from) && from === to;
}

/**
 * Einen Eintrag prüfen und als Datensatz bauen.
 *
 * Ein Eintrag ist absichtlich klein: `{ class, pointer, source }`. Den Text,
 * den er belegt, trägt er NICHT — der Datensatz reist als Ereignis durch den
 * Host, und ein Prompt-Block hat dort nichts zu suchen. Was er belegt, steht
 * im Prompt; woher es kam, steht hier.
 *
 * @param {unknown} entry - Roh-Eintrag.
 * @returns {{ok: true, statement: {class: string, pointer: string, source: string}}
 *          | {ok: false, reason: string}}
 */
export function statement(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, reason: 'EINTRAG_KEIN_OBJEKT' };
  }
  if (!CLASS_SET.has(entry.class)) return { ok: false, reason: 'KLASSE_UNBEKANNT' };
  const pointer = parsePointer(entry.pointer);
  if (!pointer.ok) return { ok: false, reason: pointer.reason };
  if (typeof entry.source !== 'string' || entry.source.trim() === '') {
    return { ok: false, reason: 'QUELLE_FEHLT' };
  }
  const source = entry.source.trim();
  if (source.length > MAX_SOURCE_LENGTH || source.includes('\n')) {
    return { ok: false, reason: 'QUELLE_FORM' };
  }
  return { ok: true, statement: { class: entry.class, pointer: pointer.ref, source } };
}

/**
 * Aus Einträgen einen Provenienz-Datensatz bauen.
 *
 * Drei Zusagen, alle prüfbar:
 *
 *   vollständig   `complete` ist nur wahr, wenn kein Eintrag verworfen und
 *                 keiner wegen der Obergrenze ausgelassen wurde.
 *   ehrlich       ein ungültiger Eintrag verschwindet nicht, er steht mit
 *                 Grund in `violations`. Der Turn läuft weiter — die Spur ist
 *                 Nebensache, aber keine stumme.
 *   deterministisch gleiche Einträge ergeben denselben Datensatz; doppelte
 *                 `(class, pointer, source)` zählen einmal und werden als
 *                 `duplicates` gezählt, nicht verschwiegen.
 *
 * Damit gilt die Invariante des Vertrags: `entries + violations + omitted +
 * duplicates` ist die Zahl der übergebenen Einträge. Kein Eintrag
 * verschwindet still.
 *
 * @param {Array} entries - die Einträge des Turns.
 * @param {{limit?: number}} [options] - Obergrenze der Einträge (Default 40).
 * @returns {{contract: string, classes: object, entries: Array, violations: Array,
 *            omitted: number, duplicates: number, complete: boolean}}
 */
export function provenanceRecord(entries, options = {}) {
  const census = Object.fromEntries(PROVENANCE_CLASSES.map((value) => [value, 0]));
  const statements = [];
  const violations = [];
  const seen = new Set();
  let duplicates = 0;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 40;

  if (entries !== undefined && entries !== null && !Array.isArray(entries)) {
    violations.push({ class: null, pointer: null, reason: 'LISTE_KEIN_ARRAY' });
  }
  let omitted = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const checked = statement(entry);
    if (!checked.ok) {
      violations.push({
        class: typeof entry?.class === 'string' ? entry.class : null,
        pointer: typeof entry?.pointer === 'string' ? entry.pointer : null,
        reason: checked.reason,
      });
      continue;
    }
    const key = `${checked.statement.class}\u0000${checked.statement.pointer}\u0000${checked.statement.source}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    if (statements.length >= limit) {
      omitted += 1;
      continue;
    }
    census[checked.statement.class] += 1;
    statements.push(checked.statement);
  }

  return {
    contract: PROVENANCE_CONTRACT,
    classes: census,
    entries: statements,
    violations,
    omitted,
    duplicates,
    complete: violations.length === 0 && omitted === 0,
  };
}

/**
 * Die kompakte Form für Fenster und SSE — Zensus statt Einträge.
 *
 * Der volle Datensatz reist auf dem Entscheidungs-Kanal; die Spiegelung in
 * `window.__shinonPrompterTrace` wird bei jedem Turn in die Seite gelegt.
 * Dort zählt die Frage „wie viele Belege, wie viele Lücken", nicht der Pfad
 * jeder Datei — sonst wüchse die Seite mit dem Projekt.
 *
 * @param {unknown} record - der volle Datensatz.
 * @returns {{contract: string, classes: object, entries: number, violations: number,
 *            omitted: number, duplicates: number, complete: boolean}|null}
 */
export function provenanceSummary(record) {
  if (record === null || typeof record !== 'object') return null;
  return {
    contract: typeof record.contract === 'string' ? record.contract : PROVENANCE_CONTRACT,
    classes: record.classes && typeof record.classes === 'object' ? { ...record.classes } : {},
    entries: Array.isArray(record.entries) ? record.entries.length : 0,
    violations: Array.isArray(record.violations) ? record.violations.length : 0,
    omitted: Number.isInteger(record.omitted) ? record.omitted : 0,
    duplicates: Number.isInteger(record.duplicates) ? record.duplicates : 0,
    complete: record.complete === true,
  };
}

/**
 * Die Kurzform für die Logzeile: `prov=6/0` (Einträge/Verletzungen).
 *
 * `+n` nennt ausgelassene Einträge, `!` markiert einen unvollständigen
 * Datensatz. Eine Zeile ohne Provenienz ergibt einen leeren String — dann
 * bleibt die Logzeile unverändert.
 */
export function provenanceLabel(record) {
  if (record === null || typeof record !== 'object') return '';
  const entries = Array.isArray(record.entries) ? record.entries.length : 0;
  const violations = Array.isArray(record.violations) ? record.violations.length : 0;
  const omitted = Number.isInteger(record.omitted) && record.omitted > 0 ? `+${record.omitted}` : '';
  const incomplete = record.complete === true ? '' : '!';
  return `prov=${entries}/${violations}${omitted}${incomplete}`;
}
