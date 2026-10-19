import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';

/**
 * @shinon/markers — der Marker-Spiegel.
 *
 * Spiegel des Element-Marker-Systems aus vannon091118/brutalord-the-feral-cycle
 * (tools/preview/marker-core.js + marker.js). Gespiegelt werden die REGELN, nicht
 * der Code: Feldmenge, id-Fortschreibung, Selektor-Ableitung, Nutzlast-Format,
 * Speicherschlüssel, Grenzen. Nicht gespiegelt: CDP-Verbindung, Chrome-Daemon,
 * Injektion in fremde Seiten.
 *
 * Rollenteilung:
 *   Host  (diese Datei)  — Vertrag als Daten + reine Prüfer/Ableiter. Kein Netz,
 *                          keine Datei-Schreibzugriffe, kein Modell, keine Aktion.
 *   Client (client.js)   — der Spiegel im nativen DSH-Side-Panel: markieren,
 *                          kommentieren, Nutzlast bauen, kopieren.
 *
 * DIE EINE NAHT ZUM BROWSER (INDEX_INJECT/LIMITS_GLOBAL): die WIRKSAMEN Grenzen
 * — Profilwerte, nicht Vertragsvorgaben — legt der Host beim Ausliefern der Seite
 * als `window.__DSH_MARKERS_CONFIG__` in den Index (dieselbe Naht, über die DSH
 * Theme, Dokument-Vorschau und Modell-Einstellungen ausliefert). Der Client liest
 * sie beim Mounten; er kann die Grenzen nicht erraten, weil er ein selbständiges
 * Bundle ist. Beide Seiten führen den Namen als Literal, der Test vergleicht sie.
 *
 * Fail-closed für die Marke: eine Marke ohne Selektor oder ohne ganzzahliges Rect
 * existiert nicht. Fail-open für den Host: die Beobachtung darf die Sitzung nie
 * mit einem Throw stören — Verstöße werden gezählt, nicht geworfen.
 *
 * Der Vertrag selbst liegt als Daten in ./assets/marker-model.json.
 */

/** Fallback, falls der Vertrag nicht lesbar ist; wird nie benutzt. */
const EMPTY_MODEL = { contract: 'shinon.marker-mirror/unloaded', fields: [], payload: null, limits: {} };

/** Standardgrenzen, wenn der Vertrag keine nennt. */
const FALLBACK_LIMITS = { text: 200, marks: 200, comment: 500 };

/** Vertrag (Spiegel-Daten) aus dem Paket laden. */
export function loadModel(relPath) {
  return JSON.parse(readFileSync(new URL(relPath, import.meta.url), 'utf8'));
}

/** Grenzen aus dem Vertrag, mit sicheren Vorgaben für fehlende Werte. */
export function limitsOf(model) {
  return { ...FALLBACK_LIMITS, ...(model?.limits ?? {}) };
}

/** Nächste Marken-id: größte vorhandene Zahl + 1 (Brutalords Regel, monotone ids). */
export function nextMarkId(marks) {
  const list = Array.isArray(marks) ? marks : [];
  const highest = list.reduce((max, mark) => {
    const number = Number(String(mark?.id ?? '').slice(1));
    return Number.isFinite(number) && number > max ? number : max;
  }, 0);
  return `m${highest + 1}`;
}

/** Whitespace normalisieren und auf das Limit kürzen. */
function clip(text, limit) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

/** Ganzzahlige Abmessung oder null. */
function whole(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Marke normalisieren: Text kürzen, Rect runden, Zahlen ganzzahlig machen.
 * Fehlende Felder werden NICHT erfunden — sie fehlen und fallen in der Prüfung auf.
 */
export function normalizeMark(raw, { model, limits = limitsOf(model) } = {}) {
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  const rect = source.rect !== null && typeof source.rect === 'object' ? source.rect : {};
  const mark = {
    id: typeof source.id === 'string' && source.id !== '' ? source.id : null,
    label: typeof source.label === 'string' ? source.label.trim() : '',
    selector: typeof source.selector === 'string' ? source.selector.trim() : '',
    text: clip(source.text, limits.text),
    rect: { x: whole(rect.x), y: whole(rect.y), w: whole(rect.w), h: whole(rect.h) },
    href: typeof source.href === 'string' && source.href !== '' ? source.href : null,
    url: typeof source.url === 'string' ? source.url.trim() : '',
    ts: typeof source.ts === 'string' && source.ts !== '' ? source.ts : new Date().toISOString(),
  };
  return mark;
}

/**
 * Marke gegen den Vertrag prüfen. Leere Liste = gültig. Reine Funktion.
 * @returns {string[]} Verstoß-Codes, z. B. MISSING_SELECTOR.
 */
export function validateMark(mark, { model, limits = limitsOf(model) } = {}) {
  const issues = [];
  const pattern = new RegExp(model?.fields?.find((field) => field.name === 'id')?.pattern ?? '^m[1-9][0-9]*$');

  if (typeof mark?.id !== 'string' || !pattern.test(mark.id)) issues.push('INVALID_ID');
  if (typeof mark?.selector !== 'string' || mark.selector === '') issues.push('MISSING_SELECTOR');
  if (typeof mark?.label !== 'string' || mark.label === '') issues.push('MISSING_LABEL');

  const maxParts = model?.derivation?.selector?.maxParts ?? 6;
  if (typeof mark?.selector === 'string' && mark.selector.split(' > ').length > maxParts) issues.push('SELECTOR_TOO_DEEP');

  for (const side of ['x', 'y', 'w', 'h']) {
    if (!Number.isInteger(mark?.rect?.[side])) issues.push(`INVALID_RECT:${side}`);
  }
  if (typeof mark?.text !== 'string') issues.push('INVALID_TEXT');
  if (typeof mark?.text === 'string' && mark.text.length > limits.text) issues.push('TEXT_OVER_LIMIT');
  if (!(mark?.href === null || typeof mark?.href === 'string')) issues.push('INVALID_HREF');
  if (typeof mark?.url !== 'string' || mark.url === '') issues.push('MISSING_URL');
  if (typeof mark?.ts !== 'string' || Number.isNaN(Date.parse(mark.ts))) issues.push('INVALID_TS');
  return issues;
}

/** Das Global, in das der Host seine WIRKSAMEN Grenzen legt (der Client liest es). */
export const LIMITS_GLOBAL = '__DSH_MARKERS_CONFIG__';

/**
 * Die Naht, ueber die dsh-host-webserver die Zeilen aller Haelften einsammelt.
 * `ctx.on(INDEX_INJECT, table => table.push(row))` — dieselbe Naht, die DSH fuer
 * Theme, Dokument-Vorschau und Modell-Einstellungen benutzt.
 */
export const INDEX_INJECT = 'webserver/index-inject';

/**
 * Der Datensatz, den der Browser liest: Vertragsname + WIRKSAME Grenzen.
 * @param {object} model
 * @param {{text: number, marks: number, comment: number}} limits
 * @returns {{contract: string, limits: {text: number, marks: number, comment: number}}}
 */
export function limitsRecord(model, limits) {
  return {
    contract: model?.contract ?? EMPTY_MODEL.contract,
    limits: { text: limits.text, marks: limits.marks, comment: limits.comment },
  };
}

// Die zwei Implementierungen koennen nicht mehr auseinanderlaufen: die Zwillings-Regel
// "Marker-Nutzlast-Format und -Grenzen" (scripts/lib/repo.mjs, SOURCE_TWINS) verlangt, dass
// payload.line, payload.comment, limits.text und limits.comment des Vertrags als Literal in
// markers/client.js stehen — Gate und Build pruefen das bei jedem Lauf. Kein dritter Formatierer.
// GESCHLOSSEN (2026-10-11): der Host liest die WIRKSAMEN Grenzen (`limits.text`/`limits.marks`,
// im Profil ueber textLimit/markLimit ueberschreibbar) und schickt sie ueber INDEX_INJECT als
// `window.__DSH_MARKERS_CONFIG__` mit; der Client liest sie beim Mounten (client.js). Die Zahlen
// des Vertrags bleiben die VORGABE (Rueckfall), das Profil gewinnt. Vorher stand hier eine
// benannte Restgrenze: der Client spiegelte nur die Vorgaben.
/** Vorlage aus dem Vertrag: `{feld}` → Wert. Der Spiegel im Client ist vertraglich gesperrt. */
function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_match, key) => (values[key] === undefined ? '' : String(values[key])));
}

/**
 * Nutzlast bauen — exakt Brutalords Zeilenformat aus dem Vertrag (payload.line).
 * @param {object[]} marks
 * @param {Record<string, string>} comments
 * @returns {string}
 */
export function renderPayload(marks, comments = {}, model) {
  const line = model?.payload?.line ?? EMPTY_MODEL.payload;
  const commentTemplate = model?.payload?.comment ?? '  —  {text}';
  const separator = model?.payload?.separator ?? '\n';
  return (Array.isArray(marks) ? marks : [])
    .map((mark) => {
      const comment = String(comments[mark.id] ?? '').trim();
      const rect = mark.rect ?? {};
      return fill(line, {
        id: mark.id,
        label: mark.label,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        comment: comment === '' ? '' : fill(commentTemplate, { text: comment }),
        selector: mark.selector,
      });
    })
    .join(separator);
}

/**
 * Der Spiegel. Nimmt Marken an, prüft sie gegen den Vertrag, hält Kommentare.
 * Eine abgelehnte Marke landet in `stats.dropped` — nie in der Liste.
 */
export function createMirror(model, options = {}) {
  // Der Vertrag liefert die Vorgaben, eine ausdrueckliche Option gewinnt.
  // Vorher war `limitsOf(model)` die EINZIGE Quelle — damit war `config.textLimit`
  // eine tote Option: die Textgrenze kam immer aus dem JSON, egal was das Profil sagte.
  const contractLimits = limitsOf(model);
  const limits = {
    text: Number.isFinite(options.textLimit) ? options.textLimit : contractLimits.text,
    marks: Number.isFinite(options.markLimit) ? options.markLimit : contractLimits.marks,
    comment: Number.isFinite(options.commentLimit) ? options.commentLimit : contractLimits.comment,
  };
  const limit = limits.marks;
  const marks = [];
  const comments = {};
  const stats = { accepted: 0, dropped: 0, reasons: {}, lastDrop: null };

  const drop = (reason, detail) => {
    stats.dropped += 1;
    stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
    stats.lastDrop = { reason, detail };
    return null;
  };

  // TODO: [DSH-Refactor] - `add` mischt drei Verantwortungen und mutiert dabei sein eigenes
  // Zwischenergebnis: Normalisierung, dann In-Place-Id-Vergabe (`mark.id = nextMarkId(marks)`
  // schreibt in das Objekt, das gleich als Marke abgelegt wird), dann In-Place-Id-Vergabe-Vergleich
  // und drei aufeinanderfolgende drop-Prüfungen. Reihenfolge und früher Ausstieg sind nur durch
  // Zeilenposition bestimmt. Zerlegen: idFor(...), verify(...) → Verdict, admit(...).
  function add(raw) {
    const mark = normalizeMark(raw, { model, limits });
    if (mark.id === null) mark.id = nextMarkId(marks);
    const issues = validateMark(mark, { model, limits });
    if (issues.length > 0) return drop(issues[0].split(':')[0], `${mark.id}: ${issues.join(',')}`);
    if (marks.length >= limit) return drop('MARK_LIMIT', `>${limit}`);
    if (marks.some((existing) => existing.id === mark.id)) return drop('DUPLICATE_ID', mark.id);

    marks.push(mark);
    stats.accepted += 1;
    return mark;
  }

  function comment(id, text) {
    const value = clip(text, limits.comment);
    if (value === '') delete comments[id];
    else comments[id] = value;
    return comments[id] ?? '';
  }

  function remove(id) {
    const at = marks.findIndex((mark) => mark.id === id);
    if (at < 0) return drop('UNKNOWN_ID', id);
    marks.splice(at, 1);
    delete comments[id];
    return id;
  }

  function clear() {
    marks.length = 0;
    for (const key of Object.keys(comments)) delete comments[key];
    return true;
  }

  return {
    add,
    remove,
    comment,
    clear,
    list: () => marks.map((mark) => ({ ...mark })),
    comments: () => ({ ...comments }),
    nextId: () => nextMarkId(marks),
    render: () => renderPayload(marks, comments, model),
    snapshot: () => ({ contract: model?.contract ?? EMPTY_MODEL.contract, marks: marks.length, comments: Object.keys(comments).length }),
    /** Die WIRKSAMEN Grenzen dieses Spiegels (Vertrag + Optionen aus dem Profil). */
    limits: () => ({ ...limits }),
    stats,
    model,
  };
}

export const Config = z.object({
  /** Spiegel-Vertrag (Felder, Format, Grenzen) aus dem Paket. */
  modelPath: z.string().description('Spiegel-Vertrag (Dateipfad im Paket)').default('./assets/marker-model.json'),
  /** Brutalords Inbox — nur Zugabe; der Hauptweg ist die Zwischenablage. */
  inboxUrl: z.string().description('Inbox-URL (Zugabe; Hauptweg ist die Zwischenablage)').default('http://127.0.0.1:9333/inbox'),
  /** Grenze für den Element-Text einer Marke. */
  textLimit: z.number().description('Grenze für den Element-Text einer Marke').default(200),
  /** Grenze für die Markenmenge einer Sitzung. */
  markLimit: z.number().description('Grenze für die Markenmenge einer Sitzung').default(200),
  /** Beschriftung und Position im nativen Side Panel. */
  panelLabel: z.string().description('Beschriftung im Side Panel').default('Shinon Marker'),
  panelOrder: z.number().description('Position im Side Panel').default(30),
});

export function apply(ctx, config) {
  let model = EMPTY_MODEL;
  try {
    model = loadModel(config.modelPath);
  } catch (error) {
    console.warn(`[shinon-markers] Spiegel nicht verbunden — Vertrag nicht lesbar: ${error.message}`);
    return () => {};
  }

  const mirror = createMirror(model, { markLimit: config.markLimit, textLimit: config.textLimit });
  if (!/^https?:\/\//.test(config.inboxUrl)) {
    console.warn(`[shinon-markers] Inbox-URL ist keine http(s)-Adresse: ${config.inboxUrl}`);
  }

  // Die Naht zum Browser: der Host schickt die WIRKSAMEN Grenzen mit, statt den
  // Client raten zu lassen. Ohne `ctx.on` (Tests, fremde Hosts) bleibt es bei der
  // Aussage in der Aktivierungszeile — fail-open, wie der ganze Host.
  const canInject = typeof ctx?.on === 'function';
  if (canInject) {
    ctx.on(INDEX_INJECT, (table) => {
      if (Array.isArray(table)) {
        table.push({ kind: 'global', name: LIMITS_GLOBAL, value: limitsRecord(model, mirror.limits()) });
      }
    });
  }

  console.log(
    `[shinon-markers] Spiegel geladen (${model.contract}) — Quelle ${model.source?.repo ?? 'unbekannt'}, ` +
      `${model.fields?.length ?? 0} Felder, authority ${model.authority}` +
      `, Grenzen text=${mirror.limits().text}/marks=${mirror.limits().marks}/comment=${mirror.limits().comment}` +
      (canInject ? ` — als ${LIMITS_GLOBAL} an die Seite durchgereicht (${INDEX_INJECT})` : ` — NICHT durchgereicht (kein ctx.on)`),
  );

  return () => {
    mirror.clear();
  };
}
