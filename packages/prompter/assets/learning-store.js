/**
 * @shinon/prompter — Lernen: die zwei Ablagen (Vorschlagsregister, Nutzung).
 *
 * Dieser Kern ist der EINZIGE I/O-Ort des Lernens ausserhalb des Skill-Writers.
 * Er schreibt atomar (Temp + Rename), prueft Vertraege fail-closed und nimmt
 * eine Lock-Datei, damit Host und `npm run learn:*` sich nicht ueberschreiben.
 *
 * KEIN Modell, kein Netz, keine Shell. Die Grenze ist der Projektbaum; die
 * Aufrufer uebergeben den Pfad, den die Config (oder die Regeldatei) nennt.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { emptyRegistry, parseRegistry } from './learning-proposal.js';

export const USAGE_CONTRACT = 'shinon.skill-usage/v1';
export const USAGE_VERSION = 1;
const LOCK_STALE_MS = 10_000;

/** Ein Hash ueber Text: deterministisch, ohne Zufall. */
export function sha256(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

/** Einen Hash ueber eine Datei; fehlt sie, ist der Hash `null` (neu). */
export function hashFile(path) {
  try {
    return sha256(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Atomar schreiben: erst daneben, dann umbenennen. */
export function writeFileAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, text, 'utf8');
  renameSync(temp, path);
}

/**
 * Eine Lock-Datei halten. `fn` laeuft nur, wenn die Sperre frei ist; ein
 * abgestuerzter Lauf hinterlaesst hoechstens eine alte Sperre, die nach
 * `LOCK_STALE_MS` als verwaist gilt und gemeldet (nicht still) entfernt wird.
 */
export function withLock(lockPath, fn) {
  mkdirSync(dirname(lockPath), { recursive: true });
  let fd = null;
  try {
    fd = openSync(lockPath, 'wx');
  } catch (error) {
    if (error?.code !== 'EEXIST') return { ok: false, reason: `LOCK_FEHLER:${error?.code ?? 'ERROR'}` };
    let age = 0;
    try {
      age = Date.now() - statSync(lockPath).mtimeMs;
    } catch {
      age = 0;
    }
    if (age <= LOCK_STALE_MS) return { ok: false, reason: 'GESPERRT' };
    try {
      unlinkSync(lockPath);
    } catch {
      return { ok: false, reason: 'GESPERRT' };
    }
    try {
      fd = openSync(lockPath, 'wx');
    } catch {
      return { ok: false, reason: 'GESPERRT' };
    }
  }
  try {
    return fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
      // schon geschlossen
    }
    try {
      unlinkSync(lockPath);
    } catch {
      // schon weg
    }
  }
}

/**
 * Das Register lesen. Fehlt die Datei, ist das ein leerer Anfang; ist sie
 * kaputt, bleibt sie unberuehrt und der Grund steht im Ergebnis. Kein stiller
 * Reparaturversuch.
 */
export function readRegistry(path, { log = console } = {}) {
  if (!existsSync(path)) return { registry: emptyRegistry(), reason: null, fresh: true };
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    log.warn?.(`[shinon-learn] Register nicht lesbar (${error?.code ?? error}) — starte leer, die Datei bleibt unberuehrt`);
    return { registry: emptyRegistry(), reason: 'NICHT_LESBAR', fresh: false };
  }
  const parsed = parseRegistry(text);
  if (!parsed.ok) {
    log.warn?.(`[shinon-learn] Register verworfen (${parsed.reason}) — starte leer, die Datei bleibt unberuehrt`);
    return { registry: emptyRegistry(), reason: parsed.reason, fresh: false };
  }
  return { registry: parsed.registry, reason: null, fresh: false };
}

/** Das Register schreiben (atomar). */
export function writeRegistry(path, registry) {
  writeFileAtomic(path, `${JSON.stringify(registry, null, 2)}\n`);
}

/** Das leere Nutzungsregister. */
export function emptyUsage() {
  return { contract: USAGE_CONTRACT, version: USAGE_VERSION, updatedAt: null, skills: {} };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Nutzung lesen; fremder Vertrag ergibt einen leeren Stand mit Grund. */
export function readUsage(path, { log = console } = {}) {
  if (!existsSync(path)) return { usage: emptyUsage(), reason: null };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    log.warn?.('[shinon-learn] Nutzung nicht lesbar (KEIN_JSON) — starte leer');
    return { usage: emptyUsage(), reason: 'KEIN_JSON' };
  }
  if (!isRecord(parsed) || parsed.contract !== USAGE_CONTRACT || parsed.version !== USAGE_VERSION || !isRecord(parsed.skills)) {
    log.warn?.('[shinon-learn] Nutzung verworfen (VERTRAG_FREMD) — starte leer');
    return { usage: emptyUsage(), reason: 'VERTRAG_FREMD' };
  }
  return { usage: parsed, reason: null };
}

/** Nutzung schreiben (atomar). */
export function writeUsage(path, usage) {
  writeFileAtomic(path, `${JSON.stringify({ ...usage, updatedAt: usage.updatedAt ?? null }, null, 2)}\n`);
}

/**
 * Die Grenze gilt fuer UNGEPINNTE Skills; gepinnte zaehlen nicht dagegen und
 * weichen nie. Sonst wuerde ein einziges gepinntes Handgeschriebenes die
 * Nutzungstabelle fuellen und jeden neuen Load sofort verdraengen — die
 * Zaehlung waere dann blind genau fuer das, was der Curator braucht.
 */
function pruneUsage(usage, maxEntries) {
  const names = Object.keys(usage.skills);
  const unpinned = names
    .filter((name) => usage.skills[name]?.pinned !== true)
    .sort((left, right) => String(usage.skills[left]?.lastLoad ?? '').localeCompare(String(usage.skills[right]?.lastLoad ?? '')));
  if (unpinned.length <= maxEntries) return usage;
  const drop = new Set(unpinned.slice(0, unpinned.length - maxEntries));
  return { ...usage, skills: Object.fromEntries(Object.entries(usage.skills).filter(([name]) => !drop.has(name))) };
}

/**
 * EINEN Skill-Load zaehlen. Quelle ist der Werkzeug-Aufruf des Modells, nicht
 * eine zweite Auswahl: wer den Skill nicht laedt, hat ihn nicht benutzt.
 */
export function addSkillLoad(usage, name, { session = null, now = null, maxEntries = 200 } = {}, hash = (value) => `sess-${sha256(value).slice(0, 8)}`) {
  if (typeof name !== 'string' || name === '') return usage;
  const current = usage.skills[name] ?? { loads: 0, lastLoad: null, sessions: [], origin: 'unknown', pinned: false };
  const sessions = [...(current.sessions ?? [])];
  if (typeof session === 'string' && session !== '') {
    const ref = session.startsWith('sess-') ? session : hash(session);
    if (!sessions.includes(ref)) sessions.push(ref);
  }
  const next = {
    ...usage,
    updatedAt: now ?? usage.updatedAt ?? null,
    skills: {
      ...usage.skills,
      [name]: {
        ...current,
        loads: (current.loads ?? 0) + 1,
        lastLoad: now ?? current.lastLoad ?? null,
        sessions: sessions.slice(-12),
      },
    },
  };
  return pruneUsage(next, maxEntries);
}

/** Herkunft/Pin setzen — der Curator braucht beides, um Handgeschriebenes zu schonen. */
export function markSkill(usage, name, patch, { maxEntries = 200 } = {}) {
  if (typeof name !== 'string' || name === '') return usage;
  const current = usage.skills[name] ?? { loads: 0, lastLoad: null, sessions: [], origin: 'unknown', pinned: false };
  return pruneUsage({
    ...usage,
    skills: { ...usage.skills, [name]: { ...current, ...patch } },
  }, maxEntries);
}
