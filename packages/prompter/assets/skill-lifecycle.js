/**
 * @shinon/prompter — Skill-Schreiber (assets/skill-lifecycle.js).
 *
 * WARUM DIESE DATEI NUR NOCH SCHREIBT (2026-10-24): frueher hielt sie den
 * ganzen Hintergrundlauf — Ereignisse, Puffer, Modellaufruf, Queue. Mit
 * SH-LEARN-03 gibt es EINEN Produzenten (`learning-review.js`) und EINEN
 * Schreiber je Ablage. Der Schreiber kennt keine Ereignisse und kein Modell;
 * er bekommt einen geprueften Vorschlag und schreibt ihn — oder er verweigert
 * mit Befund.
 *
 * DIE GRENZEN BLEIBEN:
 *   - Schreibziel ist IMMER `rules.root.dir` (`.agents/skills`) oder der
 *     Ledger-Ordner. Ein Pfad ausserhalb wird abgelehnt.
 *   - Jedes Schreiben ist atomar (Temp + Rename).
 *   - Der Basis-Hash wird beim Anwenden erneut geprueft: hat jemand die Datei
 *     seit dem Vorschlag geaendert, gibt es `KONFLIKT` statt Ueberschreiben.
 *   - Vor jeder Aenderung liegt eine Sicherung unter `.shinon/skill-backups/`;
 *     `undo` stellt sie wieder her oder verschiebt eine NEU angelegte Datei
 *     dorthin. Geloescht wird nie.
 *
 * Kein Netz, keine Shell, keine Werkzeuge. `textOf` bleibt oeffentlich, weil
 * der Reviewer denselben Textleser fuer Ereignisse benutzt.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  SKILL_MARK,
  belegLine,
  checkCandidate,
  consolidateText,
  emptyLedger,
  parseLedger,
  recordEvidence,
  renderSkill,
  setDecision,
} from './skill-lifecycle-core.js';
import { hashFile } from './learning-store.js';

/** Text aus einem Inhalt: String oder Blockliste (nur `text`-Bloecke). */
export function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/** Die Belegarten eines Auftrags: Korrektur zaehlt eins, Wiederholung die Zahl. */
export function evidenceKinds(evidence) {
  if (evidence?.kind === 'correction') return { correction: 1, completed: 0 };
  const completed = Number.isInteger(evidence?.completed) ? Math.max(1, evidence.completed) : 1;
  return { correction: 0, completed };
}

/**
 * Den Schreiber bauen. `root` ist der Projektbaum (CWD des Hosts); alle Pfade
 * werden dagegen aufgeloest und vor jedem Schreiben geprueft.
 */
export function createSkillWriter({ rules, noteRules, root = '', log = console }) {
  // Ohne Workspace gibt es kein Ziel: `.agents/skills` eines fremden Projekts
  // entsteht nicht aus dem Host-cwd. Der Schreiber verweigert dann benannt.
  if (typeof root !== 'string' || root === '') {
    return {
      inspect: () => ({ verdict: 'reject', reason: 'OHNE_WURZEL', base: null, target: null }),
      apply: () => ({ ok: false, reason: 'OHNE_WURZEL' }),
      undo: () => ({ ok: false, reason: 'OHNE_WURZEL' }),
    };
  }
  const skillsRoot = resolve(root, rules.root.dir);
  const ledgerPath = resolve(root, rules.ledger.path);
  const backupsRoot = resolve(root, '.shinon', 'skill-backups');

  function inside(path, allowedRoot = skillsRoot) {
    const target = resolve(path);
    return target === allowedRoot || target.startsWith(allowedRoot + sep);
  }

  function rel(path) {
    return relative(root, path).split(sep).join('/');
  }

  function writeFileAtomic(path, text, allowedRoot = skillsRoot) {
    if (!inside(path, allowedRoot)) throw new Error(`Schreibziel ausserhalb der erlaubten Wurzel: ${path}`);
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}`;
    writeFileSync(temp, text, 'utf8');
    renameSync(temp, path);
  }

  function readExisting() {
    let names;
    try {
      names = readdirSync(skillsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name);
    } catch {
      return [];
    }
    const skills = [];
    for (const name of names.sort()) {
      const file = join(skillsRoot, name, rules.root.file);
      if (!inside(file) || !existsSync(file)) continue;
      try {
        skills.push({ name, text: readFileSync(file, 'utf8') });
      } catch {
        // Unlesbar = nicht vorhanden fuer die Pruefung; die Entscheidung nennt keinen Grund dafuer.
      }
    }
    return skills;
  }

  function readLedger() {
    if (!existsSync(ledgerPath)) return emptyLedger();
    const parsed = parseLedger(readFileSync(ledgerPath, 'utf8'));
    if (!parsed.ok) {
      log.warn?.(`[shinon-learn] Ledger unlesbar (${parsed.reason}) — starte leer, die alte Datei bleibt unberuehrt`);
      return emptyLedger();
    }
    return parsed.ledger;
  }

  function writeLedger(ledger) {
    writeFileAtomic(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, dirname(ledgerPath));
  }

  const belegLines = (keys) => keys.map((key) => {
    const [kind, session, ref] = key.split('|');
    return belegLine({ kind, session, ref });
  });

  /**
   * Den Zielort und die Eigentuemer-Pruefung bestimmen, OHNE zu schreiben.
   * Der Reviewer nutzt das fuer den Vorschlag; `apply` prueft erneut.
   */
  function inspect(candidate, evidence) {
    const existing = readExisting();
    const ledger = readLedger();
    const entry = ledger.entries[candidate?.name] ?? null;
    const ownFile = existing.some((skill) => skill.name === candidate?.name && skill.text.includes(SKILL_MARK));
    const owner = entry?.status === 'published' || ownFile
      ? candidate?.name
      : entry?.status === 'consolidated'
        ? entry.target
        : null;
    const check = checkCandidate({
      candidate,
      existing,
      kinds: evidenceKinds(evidence),
      owner,
      // Der Vorschlag IST der Freigabegegenstand. Die Belegschwelle fuer die
      // Automatik prueft `canAuto` im Reviewer; hier wird nur der Zielort
      // bestimmt. Ein Mensch, der freigibt, traegt den duennen Beleg.
      approved: true,
      rules,
      noteRules,
    });
    const targetName = check.verdict === 'reject' ? null : (check.target ?? candidate?.name ?? null);
    const file = targetName === null ? null : join(skillsRoot, targetName, rules.root.file);
    return {
      ...check,
      base: file === null ? null : { path: rel(file), hash: hashFile(file) },
    };
  }

  /**
   * Den Vorschlag anwenden. `proposal` ist der gepruefte Record; `evidence`
   * traegt Art, Sitzung (bereits gehasht) und Kennung.
   * @returns { ok: true, ... } | { ok: false, reason }
   */
  function apply(proposal, { evidence } = {}) {
    const candidate = proposal?.payload;
    if (candidate === null || typeof candidate !== 'object' || typeof candidate.name !== 'string') {
      return { ok: false, reason: 'KEIN_KANDIDAT' };
    }
    if (!evidence || typeof evidence.kind !== 'string') return { ok: false, reason: 'OHNE_BELEG' };
    const checked = inspect(candidate, evidence);
    if (checked.verdict !== 'publish' && checked.verdict !== 'consolidate') {
      return { ok: false, verdict: checked.verdict, reason: checked.reason };
    }
    const expected = proposal?.base ?? null;
    const actual = checked.base;
    if (expected === null || actual === null) return { ok: false, reason: 'OHNE_BASIS' };
    if (expected.path !== actual.path) return { ok: false, reason: 'KONFLIKT:ZIEL' };
    if (expected.hash !== actual.hash) return { ok: false, reason: 'KONFLIKT:INHALT' };

    const file = resolve(root, actual.path);
    if (!inside(file)) return { ok: false, reason: 'AUSSERHALB' };
    const previous = existsSync(file) ? readFileSync(file, 'utf8') : null;
    const backupPath = join(backupsRoot, `${proposal.id}.md`);
    writeFileAtomic(backupPath, previous ?? 'SHINON-NEU\n', backupsRoot);

    const ledger = readLedger();
    const recorded = recordEvidence(ledger, candidate.name, {
      kind: evidence.kind,
      session: evidence.session,
      ref: evidence.ref,
      fingerprint: proposal.fingerprint,
    }, { maxEntries: rules.ledger.maxEntries });
    const entry = recorded.entry ?? ledger.entries[candidate.name];

    if (checked.verdict === 'publish') {
      const skill = renderSkill(candidate, {
        fingerprint: proposal.fingerprint,
        belege: belegLines(entry.belege ?? []),
      });
      writeFileAtomic(file, skill);
    } else {
      const current = previous ?? '';
      const next = consolidateText(current, candidate, { fingerprint: proposal.fingerprint, line: belegLine(evidence) });
      if (next !== current) writeFileAtomic(file, next);
    }

    writeLedger(setDecision(recorded.ledger, candidate.name, checked, { maxEntries: rules.ledger.maxEntries }));
    log.log?.(`[shinon-learn] ${candidate.name}: ${checked.verdict} (${checked.reason}${checked.target ? ` -> ${checked.target}` : ''})`);
    return {
      ok: true,
      verdict: checked.verdict,
      reason: checked.reason,
      target: checked.target,
      path: actual.path,
      owner: candidate.name,
      previousHash: actual.hash,
      writtenHash: hashFile(file),
      backup: rel(backupPath),
    };
  }

  /**
   * Eine angewandte Aenderung zuruecknehmen. Nur wenn die Datei noch genau
   * das ist, was `apply` geschrieben hat; sonst `KONFLIKT`. Eine NEU angelegte
   * Datei wird VERSCHOBEN (in die Sicherung), nicht geloescht.
   */
  function undo(record) {
    const path = typeof record?.path === 'string' ? resolve(root, record.path) : '';
    const backup = typeof record?.backup === 'string' ? resolve(root, record.backup) : '';
    if (path === '' || !inside(path)) return { ok: false, reason: 'AUSSERHALB' };
    if (backup === '' || !inside(backup, backupsRoot)) return { ok: false, reason: 'OHNE_SICHERUNG' };
    if (!existsSync(path)) return { ok: false, reason: 'FEHLT' };
    if (hashFile(path) !== record.writtenHash) return { ok: false, reason: 'KONFLIKT:INHALT' };
    if (!existsSync(backup)) return { ok: false, reason: 'OHNE_SICHERUNG' };

    const saved = readFileSync(backup, 'utf8');
    if (saved === 'SHINON-NEU\n') {
      renameSync(path, `${backup}.undone`);
    } else {
      writeFileAtomic(path, saved);
    }
    const ledger = readLedger();
    if (typeof record.owner === 'string' && ledger.entries[record.owner] !== undefined) {
      writeLedger(setDecision(ledger, record.owner, { verdict: 'undo', reason: 'WIDERRUFEN', target: null }, { maxEntries: rules.ledger.maxEntries }));
    }
    return { ok: true, path: rel(path), mode: saved === 'SHINON-NEU\n' ? 'verschoben' : 'wiederhergestellt' };
  }

  return {
    inspect,
    apply,
    undo,
    readLedger,
    readExisting,
    skillsRoot,
    ledgerPath,
    backupsRoot,
  };
}

/** Der Vertragsname der Regeldatei — geprueft beim Laden, nicht geraten. */
export const LIFECYCLE_CONTRACT = 'shinon.skill-lifecycle/v1';

/**
 * Die Regeln laden und den Vertrag pruefen. Fremder Vertrag = Wurf: der
 * Aufrufer haengt dann keinen Schreiber an (fail-closed, laut im Log).
 */
export function loadLifecycleRules(url = new URL('./skill-lifecycle-rules.json', import.meta.url)) {
  const parsed = JSON.parse(readFileSync(url, 'utf8'));
  if (parsed?.contract !== LIFECYCLE_CONTRACT) throw new Error(`Regeln fremd: ${String(parsed?.contract)}`);
  return parsed;
}
