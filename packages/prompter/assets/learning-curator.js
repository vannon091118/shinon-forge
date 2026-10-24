/**
 * @shinon/prompter — Curator der Wissensbestaende (SH-LEARN-06).
 *
 * EIN Befund, EINE Entscheidung: der Curator prueft die gelernten Skills auf
 * Dubletten, Veraltetes und Ungenutztes, bevorzugt das Aktualisieren einer
 * bestehenden Anleitung und archIVIERT statt zu loeschen. Er laeuft als
 * KOMMANDO (`node scripts/learn.mjs curate`), nicht als Daemon: DSH kennt kein
 * Sitzungsende-Ereignis, und eine Pruefung an einem erfundenen Ereignis waere
 * eine Behauptung statt eines Befunds.
 *
 * Die Regeln (Woche, Ruhe, 14/30 Tage, keine automatische Konsolidierung, keine
 * eingebauten Skills) stehen als DATEN in `learning-review-rules.json#curator`.
 * Der Kern rechnet nur; das Verschieben und Zurueckholen liegt in `archiveSkills`
 * und `restoreArchive` — beide innerhalb von `.shinon/learning-archive`, damit
 * ein Lauf nichts ausserhalb des Archivs anfassen kann.
 *
 * Nichts wird still archiviert: jeder Umzug steht im Journal des Archivs, und
 * `restoreArchive` holt eine Anleitung zurueck. Fehlt die Nutzungsdatei, ist die
 * Antwort „nichts zu tun\" — nicht „alles ungenutzt\".
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const CURATOR_CONTRACT = 'shinon.learning-curator/v1';
export const ARCHIVE_CONTRACT = 'shinon.learning-archive/v1';

const DAY_MS = 24 * 60 * 60 * 1000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Ein Tag als Zahl; ein unlesbares Datum ist null, nie „heute\". */
function timeOf(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Die Woerter einer Beschreibung — klein, ohne Fuellwoerter, als Menge. */
function terms(value) {
  const stop = new Set(['der', 'die', 'das', 'und', 'oder', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'wenn', 'damit', 'fuer', 'für', 'mit', 'von', 'aus', 'auf', 'bei', 'ist', 'sind', 'wird', 'werden', 'nutzen', 'skill']);
  return new Set(String(value ?? '').toLowerCase().split(/[^a-z0-9äöüß]+/).filter((word) => word.length > 2 && !stop.has(word)));
}

/** Zwei Beschreibungen sind dieselbe Anleitung, wenn sie sich fast decken. */
function similar(a, b) {
  const left = terms(a);
  const right = terms(b);
  if (left.size < 4 || right.size < 4) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size) >= 0.8;
}

/**
 * Die Pruefung. `skills` kommt aus dem Verzeichnis, `usage` aus der Zaehlung —
 * der Kern liest weder Uhr noch Datei (das `now` kommt von aussen).
 *
 * `action` ist entweder `melden` (ein Mensch entscheidet) oder `archivieren`
 * (der Lauf verschiebt, das Journal belegt es). Konsolidiert wird NIE
 * automatisch: `rules.consolidate === true` waere eine Entscheidung des
 * Betreibers, nicht die Vorgabe.
 */
/**
 * Die gelernten Skills eines Baums — mehr braucht der Curator nicht.
 *
 * Die HERKUNFT steht in der Datei: der Skill-Writer setzt `shinon-skill-fp:`,
 * ein handgeschriebenes Dokument traegt sie nicht. Deshalb liest diese
 * Funktion den Text, nicht nur den Verzeichnisnamen — sonst waere „wer hat das
 * geschrieben“ eine Behauptung aus dem Dateinamen.
 */
export function readSkills(skillsRoot, file) {
  if (!existsSync(skillsRoot)) return [];
  const skills = [];
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true }).filter((item) => item.isDirectory() && !item.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(skillsRoot, entry.name, file);
    if (!existsSync(path)) continue;
    let text;
    let addedAt = null;
    try {
      text = readFileSync(path, 'utf8');
      addedAt = statSync(path).mtime.toISOString();
    } catch {
      continue;
    }
    const match = /^description:\s*(?:"([\s\S]*?)"|(.+))$/m.exec(text.slice(0, 2000));
    const description = (match?.[1] ?? match?.[2] ?? '').trim();
    skills.push({ name: entry.name, description, addedAt, chars: text.length, origin: text.includes('shinon-skill-fp:') ? 'agent' : 'hand' });
  }
  return skills;
}

/** Ist die naechste Kuratierung faellig? Reine Rechnung, keine Uhr im Kern. */
export function curationDue(usage, rules, atMs, lastActivityAt = null) {
  if (rules?.enabled === false || rules?.autoApply !== true) return false;
  const idleMs = (rules?.minIdleHours ?? 0) * 60 * 60 * 1000;
  if (lastActivityAt !== null && atMs - lastActivityAt < idleMs) return false;
  const last = timeOf(usage?.curatedAt);
  if (last === null) return true;
  return atMs - last >= (rules?.intervalHours ?? 168) * 60 * 60 * 1000;
}

/** Den Lauf stempeln — die naechste Faelligkeit rechnet daraus, nicht aus mtime. */
export function stampCuration(usage, now = new Date().toISOString()) {
  return { ...usage, curatedAt: now };
}

export function curateSkills({ skills = [], usage = null, rules = {}, force = false, now = new Date().toISOString() } = {}) {
  const at = timeOf(now) ?? 0;
  const findings = [];
  const skipped = [];
  const verwaltet = [];
  const list = Array.isArray(skills) ? skills.filter((skill) => typeof skill?.name === 'string' && skill.name !== '') : [];
  const known = isRecord(usage?.skills) ? usage.skills : {};
  const unmanaged = list.length > rules.maxManaged && Number.isInteger(rules.maxManaged) ? list.slice(rules.maxManaged) : [];

  if (rules.enabled === false) {
    return { contract: CURATOR_CONTRACT, now, findings, archive: [], skipped: list.map((skill) => ({ name: skill.name, reason: 'CURATOR_AUS' })) };
  }

  const seen = new Map();
  for (const skill of list) {
    const record = known[skill.name] ?? null;
    if (rules.pruneBuiltins === false && (skill.origin === 'builtin' || record?.origin === 'builtin')) {
      skipped.push({ name: skill.name, reason: 'EINGEBAUT' });
      continue;
    }
    if (record?.pinned === true) {
      skipped.push({ name: skill.name, reason: 'GEPINNT' });
      continue;
    }
    // Handgeschriebenes gehoert niemandem, der es wegnehmen darf: nur wer den
    // Marker des Skill-Writers traegt (oder ausdruecklich adoptiert wurde),
    // wird verwaltet. `force` ist die EINE bewusste Ausnahme je Lauf.
    const verwaltbar = skill.origin === 'agent' || record?.adopted === true || force === true;
    if (!verwaltbar && rules.manageHandwritten !== true) {
      skipped.push({ name: skill.name, reason: 'HANDGESCHRIEBEN' });
      continue;
    }
    if (unmanaged.includes(skill)) {
      skipped.push({ name: skill.name, reason: 'UEBER_GRENZE' });
      continue;
    }

    verwaltet.push({ ...skill, loads: record?.loads ?? 0 });
    const last = timeOf(record?.lastLoad);
    const born = timeOf(skill.addedAt);
    const idleHours = born === null ? null : (at - born) / (60 * 60 * 1000);
    const quiet = idleHours === null || idleHours >= (rules.minIdleHours ?? 0);

    if (typeof skill.description !== 'string' || skill.description.trim() === '') {
      findings.push({ id: `unbeschrieben:${skill.name}`, kind: 'unbeschrieben', name: skill.name, action: 'melden', detail: 'ohne Beschreibung findet das Modell den Skill nicht' });
    }

    const rival = seen.get(skill.name.toLowerCase()) ?? null;
    if (rival !== null) {
      findings.push({ id: `doppelt:${skill.name}`, kind: 'doppelt', name: skill.name, action: 'melden', detail: `gleicher Name wie ${rival}` });
    }
    for (const [other, description] of seen) {
      if (other === skill.name.toLowerCase()) continue;
      if (similar(description, skill.description)) {
        findings.push({ id: `doppelt:${skill.name}:${other}`, kind: 'doppelt', name: skill.name, action: 'melden', detail: `gleiche Anleitung wie ${other}` });
      }
    }
    seen.set(skill.name.toLowerCase(), skill.description ?? '');

    if (last === null) {
      const ageDays = born === null ? null : (at - born) / DAY_MS;
      if (quiet && ageDays !== null && ageDays >= (rules.archiveAfterDays ?? 30)) {
        findings.push({ id: `ungenutzt:${skill.name}`, kind: 'ungenutzt', name: skill.name, action: 'archivieren', detail: `seit ${Math.round(ageDays)} Tagen nie geladen` });
      } else {
        findings.push({ id: `ungenutzt:${skill.name}`, kind: 'ungenutzt', name: skill.name, action: 'melden', detail: 'noch nie geladen — Beobachtung, kein Urteil' });
      }
      continue;
    }
    const idleDays = (at - last) / DAY_MS;
    if (idleDays >= (rules.archiveAfterDays ?? 30)) {
      findings.push({ id: `veraltet:${skill.name}`, kind: 'veraltet', name: skill.name, action: 'archivieren', detail: `seit ${Math.round(idleDays)} Tagen nicht geladen` });
    } else if (idleDays >= (rules.staleAfterDays ?? 14)) {
      findings.push({ id: `veraltet:${skill.name}`, kind: 'veraltet', name: skill.name, action: 'melden', detail: `seit ${Math.round(idleDays)} Tagen nicht geladen` });
    }
  }

  // KONSOLIDIERUNG: zwei fast gleiche Anleitungen werden nicht zusammengeschrieben
  // (Prosa automatisch zu verschmelzen waere Raten), sondern die ueberzaehlige
  // Kopie wandert ins Archiv — die benutzte bleibt, bei Gleichstand die juengere.
  // Das ist umkehrbar (Journal + restore) und deterministisch.
  if (rules.consolidate === true) {
    const groups = [];
    for (const skill of verwaltet) {
      const group = groups.find((candidate) => similar(candidate[0].description, skill.description));
      if (group === undefined) groups.push([skill]);
      else group.push(skill);
    }
    for (const group of groups) {
      if (group.length < 2) continue;
      const keeper = [...group].sort((left, right) => (right.loads - left.loads)
        || String(right.addedAt ?? '').localeCompare(String(left.addedAt ?? ''))
        || left.name.localeCompare(right.name))[0];
      for (const skill of group) {
        if (skill.name === keeper.name) continue;
        const index = findings.findIndex((finding) => finding.id === `doppelt:${skill.name}`);
        if (index !== -1) findings.splice(index, 1);
        findings.push({
          id: `doppelt:${skill.name}`,
          kind: 'doppelt',
          name: skill.name,
          action: 'archivieren',
          detail: `Konsolidierung: ${keeper.name} bleibt (${keeper.loads} Loads)`,
        });
      }
    }
  }

  const unique = [];
  const ids = new Set();
  for (const finding of findings) {
    if (ids.has(finding.id)) continue;
    ids.add(finding.id);
    unique.push(finding);
  }
  return {
    contract: CURATOR_CONTRACT,
    now,
    findings: unique.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    archive: unique.filter((finding) => finding.action === 'archivieren').map((finding) => finding.name).sort(),
    skipped,
  };
}

/** Ein Zeitstempel als Verzeichnisname — sortierbar, ohne Doppelpunkte. */
function stamp(now) {
  return String(now ?? new Date().toISOString()).replace(/[:.]/g, '-');
}

function inside(path, root) {
  const target = resolve(path);
  const base = resolve(root);
  return target === base || target.startsWith(base + sep);
}

/**
 * Die benannten Skills verschieben — in das Archiv, nie geloescht.
 *
 * `skillsRoot` und `archiveRoot` sind absolut; ein Ziel ausserhalb des Archivs
 * wird verweigert. Das Journal ist die Ruecknahme: es nennt Quell- und Zielpfad
 * jeder Bewegung, und `restoreArchive` liest genau diese Datei.
 */
export function archiveSkills({ names = [], skillsRoot, archiveRoot, now = new Date().toISOString(), log = console } = {}) {
  if (!Array.isArray(names) || names.length === 0) return { ok: true, moved: [], journal: null, reason: 'NICHTS_ZU_TUN' };
  if (typeof skillsRoot !== 'string' || typeof archiveRoot !== 'string') return { ok: false, reason: 'OHNE_WURZEL', moved: [] };
  const target = join(archiveRoot, stamp(now));
  const moved = [];
  const refused = [];
  for (const name of [...names].sort()) {
    const from = join(skillsRoot, name);
    const to = join(target, name);
    if (!inside(from, skillsRoot) || !inside(to, archiveRoot)) { refused.push({ name, reason: 'AUSSERHALB' }); continue; }
    if (!existsSync(from)) { refused.push({ name, reason: 'FEHLT' }); continue; }
    if (existsSync(to)) { refused.push({ name, reason: 'ZIEL_BELEGT' }); continue; }
    try {
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
      moved.push({ name, from, to });
    } catch (error) {
      log.warn?.(`[shinon-learn] ${name} nicht archiviert (${error?.code ?? error})`);
      refused.push({ name, reason: String(error?.code ?? 'FEHLER') });
    }
  }
  if (moved.length === 0) return { ok: refused.length === 0, moved, refused, journal: null, reason: refused[0]?.reason ?? 'NICHTS_ZU_TUN' };
  const journalPath = join(target, 'JOURNAL.json');
  const journal = {
    contract: ARCHIVE_CONTRACT,
    createdAt: now,
    moved: moved.map((entry) => ({ name: entry.name, from: relative(dirname(archiveRoot), entry.from).split(sep).join('/'), to: relative(target, entry.to).split(sep).join('/') })),
  };
  mkdirSync(target, { recursive: true });
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  return { ok: refused.length === 0, moved, refused, journal: journalPath };
}

/** Die Journale, neueste zuerst. Ein kaputtes Journal wird uebergangen, nicht repariert. */
export function readJournals(archiveRoot, { log = console } = {}) {
  if (typeof archiveRoot !== 'string' || !existsSync(archiveRoot)) return [];
  const journals = [];
  for (const entry of readdirSync(archiveRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    const file = join(archiveRoot, entry.name, 'JOURNAL.json');
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (parsed?.contract !== ARCHIVE_CONTRACT || !Array.isArray(parsed.moved)) continue;
      journals.push({ dir: join(archiveRoot, entry.name), journal: parsed });
    } catch (error) {
      log.warn?.(`[shinon-learn] Journal ${file} unlesbar (${error?.message ?? error})`);
    }
  }
  return journals;
}

/**
 * EINEN archivierten Skill zurueckholen. Ziel belegt = Konflikt, keine
 * Ueberschreibung; ein unbekannter Name ist ein benannter Befund.
 */
export function restoreArchive({ name, archiveRoot, skillsRoot, log = console } = {}) {
  if (typeof name !== 'string' || name === '') return { ok: false, reason: 'OHNE_NAME' };
  if (typeof archiveRoot !== 'string' || typeof skillsRoot !== 'string') return { ok: false, reason: 'OHNE_WURZEL' };
  for (const { dir, journal } of readJournals(archiveRoot, { log })) {
    const entry = journal.moved.find((item) => item?.name === name);
    if (entry === undefined) continue;
    const to = join(dir, entry.to);
    const from = resolve(skillsRoot, name);
    if (!inside(to, archiveRoot) || !inside(from, skillsRoot)) return { ok: false, reason: 'AUSSERHALB' };
    if (!existsSync(to)) return { ok: false, reason: 'ARCHIV_FEHLT' };
    if (existsSync(from)) return { ok: false, reason: 'ZIEL_BELEGT' };
    mkdirSync(dirname(from), { recursive: true });
    cpSync(to, from, { recursive: true });
    return { ok: true, name, path: from, from: to };
  }
  return { ok: false, reason: 'NICHT_IM_ARCHIV' };
}

/** Eine Skill-Datei lesen, ohne den Baum zu verlassen. */
export function readSkill(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Ein Verzeichnis entfernen — nur innerhalb des Archivs (Ruecknahme eines Umzugs). */
export function dropArchived({ to, archiveRoot, log = console } = {}) {
  if (typeof to !== 'string' || typeof archiveRoot !== 'string' || !inside(to, archiveRoot)) return false;
  try {
    rmSync(to, { recursive: true, force: true });
    return true;
  } catch (error) {
    log.warn?.(`[shinon-learn] ${to} nicht entfernt (${error?.code ?? error})`);
    return false;
  }
}
