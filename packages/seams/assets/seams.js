/**
 * @shinon/seams — seams.js
 *
 * DIE EINE QUELLE der Host↔Host-Nähte.
 *
 * Bis 2026-10-20 standen sechs Regeln ZWEIMAL im Baum — als bytegleiche
 * `zwilling:`-Regionen (`digest`, die Workspace-Identität, die letzte
 * menschliche Nachricht) bzw. als Literale (`shinon/narrative/state`,
 * `shinon.narrative/v1`, `shinon/prompter/decision`) — und `SOURCE_TWINS` in
 * `scripts/lib/repo.mjs` hielt die Kopien per Drift-Prüfung zusammen. Das war
 * die Antwort auf "ein Paket darf kein anderes importieren", und der Preis war
 * eine zweite Wahrheit, die niemand liest: drei der sechs Kopien hatten keinen
 * Abnehmer, der die Kopie *benutzte* statt nur zu tragen.
 *
 * Jetzt importiert die Host-Hälfte. Der Grund, warum das geht: DSH lädt jedes
 * Bundle aus einer Installation, in der ALLE `@shinon/*`-Pakete nebeneinander
 * liegen (Profil-Links lokal, Tarball je Paket in der Distribution) — ein
 * Import über die Paketgrenze ist damit derselbe Weg wie `@deepseek-ai/*`.
 *
 * WARUM DIESE DATEI KEINE BARE IMPORTS HAT: sie ist der Kern, den die
 * Host-Hälften und die `assets/`-Kerne der Pakete importieren. Solange HIER
 * nur `node:`-Module stehen, bleibt die Eigenschaft erhalten, die die
 * Paket-Tests in CI ohne `npm ci` auskommen lässt — ein Import von hier ist
 * transitiv importfrei.
 *
 * WAS HIER NICHT HINEINGEHÖRT: Client-Hälften. Ein selbstständiges
 * Client-Bundle zieht React per `require` und kann keine Host-Datei laden; die
 * zehn Client-Spiegel bleiben deshalb Kopien mit Drift-Prüfung (Stufe 2,
 * `SOURCE_TWINS`).
 */
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Erste `length` Hex-Zeichen von sha256(text).
 *
 * `text` ist ein String und `length` ist PFLICHT: eine vergessene Laenge ergaebe
 * still einen 64-stelligen Wert statt eines kurzen ids. Kein Aufrufer ratet sie
 * — beide Seiten (`@shinon/events`, `@shinon/hook`) nennen sie ausdruecklich.
 */
export function digest(text, length) {
  return createHash('sha256').update(text).digest('hex').slice(0, length);
}

/**
 * Die letzte MENSCHLICHE Nachricht mit Text — oder null.
 *
 * `source.kind === 'user'` ist der Unterschied zwischen Eingabe und Harness: der
 * Batch eines Schritts besteht oft AUSSCHLIESSLICH aus erzeugtem Kontext (Zeit,
 * Terminal, Instruktionen, Erinnerungen, Werkzeug-Feedback). Ohne diesen Test
 * waere die jeweils letzte Nachricht irgendein Harness-Text — und der wuerde
 * veredelt und ersetzt (Enhancer) bzw. als Auftrag gelesen (Router). Fremde
 * Herkunft heisst deshalb: nicht anfassen.
 *
 * Die Nachricht kommt MIT zurueck, weil ein Aufrufer sie ueber ihre Identitaet
 * wiederfinden muss — ueber einen Index zu raten waere ein stiller Fehler. Der
 * Text ist UNGETRIMMT; was ein Aufrufer davon will, entscheidet er.
 */
export function lastHumanMessage(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (message?.role !== 'user') continue;
    if (message.source?.kind !== 'user') continue;
    const text = (Array.isArray(message.content) ? message.content : [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
    if (text.trim() === '') continue;
    return { message, text, index };
  }
  return null;
}

/**
 * Kanäle und Verträge, die MEHRERE Host-Hälften nennen.
 *
 * Warum hier und nicht im Besitzer-Paket: der Besitzer (`@shinon/narrative`,
 * `@shinon/prompter`) exportiert die Namen weiter, aber die Abnehmer müssten
 * ihn importieren — ein Import, der eine ganze Engine mitzieht, nur um einen
 * String zu lesen. Der Kern ist die kleinste gemeinsame Abhängigkeit.
 */
export const NARRATIVE_STATE_CHANNEL = 'shinon/narrative/state';
export const NARRATIVE_STATE_CONTRACT = 'shinon.narrative/v1';
export const PROMPTER_DECISION_CHANNEL = 'shinon/prompter/decision';

/** Shared durable index store seam, owned here and imported by all host readers. */
export const INDEX_STORE_SERVICE = 'shinon_index_store';
export const INDEX_STORE_CONTRACT = 'shinon.project-index/store-v1';

/** Vertragsname der Workspace-Identität. */
export const WORKSPACE_CONTRACT = 'shinon.workspace/v1';

/** Name der Umgebungsvariable — die zweite Quelle nach der expliziten Config. */
export const WORKSPACE_ENV = 'SHINON_WORKSPACE_ROOT';

/**
 * Die EINE Auflösung der aktiven Workspace-Root.
 *
 * Priorität: `configRoot` (ausdrückliche Angabe) > `env.SHINON_WORKSPACE_ROOT`
 * > `cwd` (Default: `process.cwd()`). Leer heißt „nicht gesetzt", nie „raten".
 * Das Ergebnis ist immer absolut und aufgelöst — zwei Schreibweisen desselben
 * Ordners ergeben dieselbe Identität.
 *
 * @returns {{ root: string, source: 'config'|'env'|'cwd' }}
 */
export function resolveWorkspaceRoot({ configRoot = '', env = process.env, cwd = process.cwd() } = {}) {
  if (typeof configRoot === 'string' && configRoot.trim() !== '') {
    const base = typeof cwd === 'string' && cwd !== '' ? cwd : process.cwd();
    const root = isAbsolute(configRoot.trim()) ? resolve(configRoot.trim()) : resolve(base, configRoot.trim());
    return { root, source: 'config' };
  }
  const fromEnv = env?.[WORKSPACE_ENV];
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return { root: resolve(fromEnv.trim()), source: 'env' };
  }
  const base = typeof cwd === 'string' && cwd !== '' ? cwd : process.cwd();
  return { root: resolve(base), source: 'cwd' };
}

/**
 * Überprüfbare Root-Identität: aufgelöster Pfad plus stabiler Kurz-Hash.
 * Derselbe Ordner ergibt dieselbe Identität über Läufe; zwei Ordner mit
 * gleichen relativen Pfaden ergeben verschiedene Identitäten.
 */
export function fingerprintRoot(root) {
  const resolved = resolve(String(root ?? ''));
  const rootId = createHash('sha256').update(resolved).digest('hex').slice(0, 16);
  return { root: resolved, rootId, contract: WORKSPACE_CONTRACT };
}

/**
 * Ein Pfad liegt in einem anderen — ohne Präfix-Treffer (`/opt/x` vs `/opt/xy`).
 */
export function isInsideRoot(root, candidate) {
  const base = resolve(String(root ?? ''));
  const target = resolve(String(candidate ?? ''));
  if (target === base) return true;
  return target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

/**
 * Eine Referenz (`..`, absolut, Separatorvarianten) gegen die Root prüfen.
 *
 * @returns {{ ok: true, path: string } | { ok: false, reason: string }}
 */
export function resolveInRoot(root, ref) {
  if (typeof ref !== 'string' || ref.trim() === '') return { ok: false, reason: 'EMPTY' };
  const base = resolve(String(root ?? ''));
  const raw = ref.trim();
  // Separatorvarianten normalisieren: Backslashes sind auf POSIX keine Trenner,
  // auf Windows schon — wer sie als Trenner schreibt, meint einen Pfad.
  const normalized = raw.replace(/\\/g, '/');
  const absolute = normalized.startsWith('/')
    ? resolve(normalized)
    : resolve(base, normalized);
  if (!isInsideRoot(base, absolute)) {
    return { ok: false, reason: `OUTSIDE_ROOT:${raw}` };
  }
  return { ok: true, path: absolute };
}

/**
 * Symlink-Grenze: den bereits aufgelösten Pfad über seine Realpath-Auflösung
 * prüfen. `realpathFn` ist injizierbar, damit Tests ohne Dateisystem lügen
 * können und der Lauf das echte `realpathSync` nimmt.
 *
 * @returns {{ ok: true, path: string } | { ok: false, reason: string }}
 */
export function checkRealpathInside(root, candidate, realpathFn) {
  const base = resolve(String(root ?? ''));
  let real;
  try {
    real = typeof realpathFn === 'function' ? realpathFn(String(candidate)) : String(candidate);
  } catch (error) {
    return { ok: false, reason: `REALPATH_FAILED:${error?.message ?? error}` };
  }
  const resolved = resolve(String(real));
  if (!isInsideRoot(base, resolved)) {
    return { ok: false, reason: `SYMLINK_ESCAPE:${String(candidate)}->${resolved}` };
  }
  return { ok: true, path: resolved };
}

/**
 * Veraltete Einträge entfernen: was `existsFn` nicht mehr kennt (gelöscht,
 * verschoben, umbenannt), kehrt nicht aus dem Index zurück.
 *
 * @returns {{ kept: Map, removed: string[] }}
 */
export function reconcileEntries(entries, existsFn) {
  const kept = new Map();
  const removed = [];
  for (const [key, value] of entries instanceof Map ? entries : []) {
    let alive = false;
    try {
      alive = existsFn(key, value);
    } catch {
      alive = false;
    }
    if (alive) kept.set(key, value);
    else removed.push(key);
  }
  return { kept, removed };
}

/**
 * Relative Projekt-Schreibweise eines absoluten Pfads (für den Index:
 * der Index überlebt einen Umzug, weil er relativ speichert).
 */
// Der kanonische I/O-Pfad (Lesen, Schreiben, Injizieren) liegt in der
// Nachbar-Datei und wird hier WEITERGEGEBEN: die Host-Haelften importieren
// `@shinon/seams/core`, nicht den relativen Pfad. Beide Dateien sind importfrei
// (nur node:-Module), also bleibt die Eigenschaft erhalten.
export { IO_CONTRACT, IO_LOG_PREFIX, IO_KINDS, IO_FIELDS, describeIo, ioLogLine, logIo, logEventRead, ioSpinePayload, ioSpineEnvelope } from './io-path.js';
// Der Orchestrator (route/provide/demand plus der Vertragsleser) liegt nebenan
// und wird aus demselben Grund weitergereicht: die Host-Hälften importieren
// `@shinon/seams/core`, nie einen relativen Pfad in ein fremdes Paket.
export * from './orchestrator.js';

export function toWorkspacePath(root, absolute) {
  const rel = relative(resolve(String(root ?? '')), resolve(String(absolute ?? '')));
  return sep === '/' ? rel : rel.split(sep).join('/');
}
