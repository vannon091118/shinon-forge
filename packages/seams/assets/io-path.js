/**
 * @shinon/seams — io-path.js
 *
 * Der kanonische Lese-/Schreib-/Injizier-Pfad der Host-Hälften.
 *
 * ANLASS (gemessen 2026-10-21): die Host-Hälften sprechen auf 47 direkte
 * `fs`-Aufrufe und 177 `console`-Aufrufe in nebeneinanderliegenden Formaten
 * an. Ein solches Log ist vollständig nur, wenn man es als DATENSATZ liest:
 * welcher Vorgang, aus welcher Quelle, in welches Ziel, wie gross, aus
 * welchem Grund, wann. Als Fließtext geht das nicht — "Anrede erkannt"
 * sagt nichts darüber, OB überhaupt gelesen wurde, geschweige denn was.
 *
 * DARUM STEHT HIER EINE FORM FÜR ALLE DREI KINDS. `read`, `write` und
 * `inject` sind derselbe Vorgang aus drei Blickwinkeln; sie unterscheiden
 * sich im `kind` und sonst in nichts. Drei Formen wären wieder drei
 * Kanäle — und der Aufwand, sie zu unterscheiden, wäre genau der
 * Aufwand, den man sich beim Auswerten spart.
 *
 * DIE FUNKTIONEN:
 *   describeIo(input)   → der Datensatz: kanonisch, validiert, eingefroren.
 *   ioLogLine(record)   → die Protokollzeile: EIN Format, maschinenlesbar.
 *   logIo(input, sink) → beschreibt, baut und schreibt. Der EINE Aufruf,
 *                         den eine Host-Hälfte benutzt.
 *   ioSpineEnvelope(...)→ überträgt den Datensatz in einen echten Spine-
 *                         Envelope, mit derselben trace_id.
 *
 * FAIL-CLOSED: `describeIo` und `ioLogLine` geben bei einem fehlenden
 * oder unbrauchbaren Feld `{ ok: false, reason }` zurück — sie raten
 * nicht und ersetzen nichts. Ein Vorgang ohne Grund, ohne Ziel oder ohne
 * Zeit ist keine halbe Tatsache wert, sondern ein Datensatz, den es so
 * nicht gab. Der Grund nennt das Feld, damit die Lücke sichtbar ist
 * statt einer Zeile, die sauber aussieht und doch falsch ist.
 *
 * DER SPINE: der Event-Spine (packages/events) trägt die EREIGNISFÄHIGEN
 * Vorgänge — DSH-Sitzungsereignisse, 25 Typen, ein FESTER Vertrag (die
 * Typenliste steht im Gate-Schritt `events-spine.mjs`, die Replay-Fixture
 * ist an ihrer Zahl gebunden). Ein Datei- oder Datenbank-Zugriff ist
 * kein Sitzungsereignis: ein neuer Typ `io.read` wäre eine
 * Vertragserweiterung und würde Typenliste, Fixture und den
 * Persona-Zustandstest mitziehen. Darum reist der I/O-Datensatz als
 * NUTZLAST-TEIL des Ereignisses, das ihn ausgelöst hat: die Nutzlast ist
 * offen, der Envelope (acht Felder) ist geschlossen. `ioSpineEnvelope()`
 * baut genau das — mit der trace_id des Datensatzes, sodass Zeile und
 * Envelope in EINER Kette stehen.
 *
 * WARUM DIESE DATEI KEINE IMPORTS HAT: sie ist Kern wie `seams.js`.
 * Solange hier nichts importiert wird, bleibt der Pfad transitiv
 * paket-importfrei — die Eigenschaft, die den Paket-Tests in CI ohne
 * `npm ci` zuteilkommt.
 */

/** Der Vertrag des I/O-Pfads. */
export const IO_CONTRACT = 'shinon.io/v1';

/** Die drei Kinds. Es gibt keine weiteren — ein vierter wäre eine neue Sprache. */
export const IO_KINDS = Object.freeze(['read', 'write', 'inject']);

/** Das Präfix jeder Protokollzeile. Wer sie grept, erkennt sie an diesem Wort. */
export const IO_LOG_PREFIX = '[shinon-io]';

/**
 * Die Felder eines I/O-Datensatzes — in der Reihenfolge, in der sie in der
 * Protokollzeile stehen. Diese Liste ist die Zusage: für jedes Kind gilt
 * dieselbe.
 */
export const IO_FIELDS = Object.freeze(['kind', 'quelle', 'ziel', 'umfang', 'grund', 'zeitpunkt', 'trace_id']);

/** Die Felder, ohne die ein Datensatz kein Datensatz ist. */
const REQUIRED = Object.freeze(['kind', 'quelle', 'ziel', 'umfang', 'grund', 'zeitpunkt']);

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Den Vorgang beschreiben. Der Datensatz ist die Einheit, nicht die Zeile:
 * die Zeile ist eine ANSICHT davon, und dieselbe Ansicht muss für alle
 * drei Kinds gleich aussehen.
 *
 * @param {object} input
 * @param {'read'|'write'|'inject'} input.kind     Was geschah.
 * @param {string} input.quelle                    Woher (Kanal, Datei, Dienst).
 * @param {string} input.ziel                      Wohin/was (Zustand, Speicher, Prompt).
 * @param {number} input.umfang                    Wie gross (Zeichen, Bytes, Zeilen).
 * @param {string} input.grund                     Wofür (der Anlass, der auslösende Typ).
 * @param {string} input.zeitpunkt                 Wann (ISO-8601).
 * @param {string} [input.trace_id]                Die trace_id des auslösenden Ereignisses.
 * @returns {{ok: true, record: object} | {ok: false, reason: string}}
 */
export function describeIo(input) {
  if (input === null || typeof input !== 'object') {
    return { ok: false, reason: 'IO_EINGABE: kein Datensatz' };
  }
  const { kind, quelle, ziel, umfang, grund, zeitpunkt } = input;
  const traceId = input.trace_id ?? '';

  if (!IO_KINDS.includes(kind)) {
    return { ok: false, reason: `IO_KIND: "${String(kind)}" ist kein I/O-Kind (${IO_KINDS.join(', ')})` };
  }
  if (!isText(quelle)) {
    return { ok: false, reason: 'IO_QUELLE: fehlt oder leer' };
  }
  if (!isText(ziel)) {
    return { ok: false, reason: 'IO_ZIEL: fehlt oder leer' };
  }
  if (!Number.isInteger(umfang) || umfang < 0) {
    return { ok: false, reason: `IO_UMFANG: "${String(umfang)}" ist keine nicht-negative Ganzzahl` };
  }
  if (!isText(grund)) {
    return { ok: false, reason: 'IO_GRUND: fehlt oder leer' };
  }
  if (!isText(zeitpunkt) || !Number.isFinite(Date.parse(zeitpunkt))) {
    return { ok: false, reason: `IO_ZEITPUNKT: "${String(zeitpunkt)}" ist kein Zeitpunkt` };
  }
  if (typeof traceId !== 'string') {
    return { ok: false, reason: 'IO_TRACE: keine Zeichenkette' };
  }

  const record = { kind, quelle, ziel, umfang, grund, zeitpunkt, trace_id: traceId };
  for (const field of REQUIRED) {
    if (record[field] === undefined) return { ok: false, reason: `IO_FELD: "${field}" fehlt` };
  }
  return { ok: true, record: Object.freeze(record) };
}

/**
 * Die Protokollzeile zum Datensatz — EIN Format für alle drei Kinds:
 * Präfix, dann die Felder in fester Reihenfolge als `key=value`.
 *
 * Die Werte sind JSON-kodiert: Textfelder als JSON-String, `umfang` als
 * JSON-Zahl. Damit bricht weder ein Leerzeichen noch ein Anführungszeichen
 * die Zeile, und ein Parser findet die Felder mit
 * `/([a-z_]+)=("(?:[^"\\]|\\.)*"|-?\d+)/g` — die Reihenfolge ist fest,
 * die Feldnamen sind fest, nur die Werte variieren.
 *
 * @param {object} record Ein Datensatz aus `describeIo`.
 * @returns {{ok: true, line: string} | {ok: false, reason: string}}
 */
export function ioLogLine(record) {
  if (record === null || typeof record !== 'object') {
    return { ok: false, reason: 'IO_DATENSATZ: kein Objekt' };
  }
  // Dieselbe Schranke wie beim Beschreiben: eine Zeile aus einem fremden
  // Datensatz wäre eine Behauptung, die niemand geprüft hat.
  const described = describeIo(record);
  if (!described.ok) return described;

  const fields = IO_FIELDS.map((field) => {
    const value = described.record[field];
    const encoded = typeof value === 'number' ? String(value) : JSON.stringify(value);
    return `${field}=${encoded}`;
  });
  return { ok: true, line: `${IO_LOG_PREFIX} ${fields.join(' ')}` };
}

/**
 * Der eine Aufruf: beschreiben, die Zeile bauen, sie schreiben.
 *
 * `sink` ist einschaltbar, damit ein Test die Zeile abfangen kann, ohne
 * die Konsole zu belauschen. Ohne `sink` geht die Zeile an `console.log` —
 * und zwar an das JETZIGE, nicht an das beim Laden gebundene: wer die
 * Konsole im Test ersetzt, ersetzt sie auch hier.
 *
 * @param {object} input Siehe `describeIo`.
 * @param {(line: string) => void} [sink] Wohin die Zeile geht.
 * @returns {{ok: true, line: string, record: object} | {ok: false, reason: string}}
 */
export function logIo(input, sink) {
  const described = describeIo(input);
  if (!described.ok) return described;
  const line = ioLogLine(described.record);
  if (!line.ok) return line;
  const target = typeof sink === 'function' ? sink : (text) => console.log(text);
  target(line.line);
  return { ok: true, line: line.line, record: described.record };
}

/**
 * Den LESEVORGANG eines Ereignisses protokollieren — der haeufigste Fall.
 *
 * Der Host ruft das mit EINEM Aufruf; die Felder (Umfang, Zeitpunkt, trace_id)
 * werden hier abgeleitet, damit der Host nicht 14 Zeilen pro Vorgang schreibt.
 *
 * @param {object} eingabe
 * @param {string} eingabe.quelle der Kanal, aus dem gelesen wurde
 * @param {string} eingabe.ziel wofuer gelesen wurde
 * @param {number} [eingabe.umfang] die Groesse des Gelesenen (0 = nichts)
 * @param {string} [eingabe.grund] der Grund des Vorgangs
 * @param {string} [eingabe.trace_id] die trace_id des ausloesenden Ereignisses
 * @param {string} [eingabe.zeitpunkt] der Zeitpunkt (ISO-8601)
 * @param {(line: string) => void} [sink] wo die Zeile hingeht
 * @returns {{ok: boolean, reason?: string}}
 */
export function logEventRead({
  quelle = '',
  ziel = '',
  umfang = 0,
  grund = 'Ereignis gelesen',
  trace_id: traceId = '',
  zeitpunkt = new Date().toISOString(),
  sink,
} = {}) {
  return logIo({
    kind: 'read',
    quelle,
    ziel,
    umfang: Number.isFinite(umfang) && umfang > 0 ? Math.floor(umfang) : 0,
    grund,
    zeitpunkt,
    trace_id: typeof traceId === 'string' ? traceId : '',
  }, sink);
}

/**
 * Das Nutzlast-Fragment, mit dem ein I/O-Datensatz in der Nutzlast eines
 * Ereignisses mitreist. Der Spine baut daraus den Envelope — ohne neuen
 * Typ, ohne Vertragserweiterung.
 *
 * @param {object} record Ein Datensatz aus `describeIo`.
 * @returns {{ok: true, payload: object} | {ok: false, reason: string}}
 */
export function ioSpinePayload(record) {
  const described = describeIo(record);
  if (!described.ok) return described;
  const { kind, quelle, ziel, umfang, grund, zeitpunkt, trace_id: traceId } = described.record;
  return { ok: true, payload: { kind, quelle, ziel, umfang, grund, zeitpunkt, trace_id: traceId } };
}

/**
 * Den I/O-Datensatz in einen echten Spine-Envelope übertragen.
 *
 * `buildEnvelope` wird EINGESPRITZT (wie `realpathFn` in
 * `checkRealpathInside`), damit dieser Kern ohne `@shinon/events` auskommt
 * und trotzdem den Envelope BAUT, den der Spine baut: ein zweiter Digest
 * wäre eine zweite Wahrheit, und die trace_id müsste dann nur noch
 * zufällig stimmen.
 *
 * Die `trace_id` des Datensatzes geht als `traceId` in den Envelope —
 * damit stehen I/O-Zeile und Ereignis in EINER Kette. Fehlt dem
 * Datensatz eine trace_id, rechnet der Spine sie aus Session, Typ und
 * Zeitpunkt; das ist seine Regel, nicht unsere.
 *
 * @param {object} record Ein Datensatz aus `describeIo`.
 * @param {object} options
 * @param {Function} options.buildEnvelope `buildEnvelope` aus `@shinon/events`.
 * @param {object} options.contract Der Event-Spine-Vertrag.
 * @param {string} options.eventType Ein Typ des Vertrags.
 * @param {string} options.source Die Quelle des Typs (aus dem Vertrag).
 * @param {string} options.sessionId Die Session des Ereignisses.
 * @param {string} options.timestamp Der Zeitpunkt (ISO-8601).
 * @param {object} [options.payload] Die Nutzlast des Ereignisses.
 * @param {string} [options.traceId] Die trace_id, falls der Datensatz keine trägt.
 * @returns {{ok: true, envelope: object, payload: object} | {ok: false, reason: string}}
 */
export function ioSpineEnvelope(record, options = {}) {
  const fragment = ioSpinePayload(record);
  if (!fragment.ok) return fragment;

  const { buildEnvelope, contract, eventType, source, sessionId, timestamp, payload } = options;
  if (typeof buildEnvelope !== 'function') {
    return { ok: false, reason: 'IO_SPINE: buildEnvelope fehlt' };
  }
  if (contract === null || typeof contract !== 'object') {
    return { ok: false, reason: 'IO_SPINE: Vertrag fehlt' };
  }
  if (!isText(eventType) || !isText(source) || !isText(sessionId) || !isText(timestamp)) {
    return { ok: false, reason: 'IO_SPINE: eventType, source, sessionId oder timestamp fehlt' };
  }

  const merged = { ...(payload ?? {}), io: fragment.payload };
  const traceId = fragment.payload.trace_id !== '' ? fragment.payload.trace_id : options.traceId;
  const envelope = buildEnvelope(contract, {
    eventType,
    source,
    payload: merged,
    sessionId,
    timestamp,
    traceId,
  });
  return { ok: true, envelope, payload: merged };
}
