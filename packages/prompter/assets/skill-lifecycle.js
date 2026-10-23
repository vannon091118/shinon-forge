/**
 * @shinon/prompter — Skill-Lebenszyklus, Host (assets/skill-lifecycle.js).
 *
 * Die Anbindung an DSH: Ereignisse lesen, den Kandidaten vom Modell holen,
 * den reinen Kern (skill-lifecycle-core.js) rechnen lassen und das Ergebnis
 * schreiben. Der Host entscheidet nichts selbst; er fuehrt nur aus.
 *
 * Ausloeser (Ereignisse, nie je Schritt) — NORMALISIERTE Namen, weil dieser
 * Host auf `shinon/event` lauscht und nicht auf dem rohen `session/event`:
 *   - feedback.rated mit negativer Bewertung  -> Korrektur (starkes Signal)
 *   - turn.end mit reason `completed`         -> Wiederholung (schwaches Signal)
 *
 * Die Zuordnung roh -> normalisiert ist der Event-Spine (`feedback/message-put`
 * -> `feedback.rated`, `feedback/record` -> `feedback.noted`, `turn/end` ->
 * `turn.end`). Bis 2026-10-21 standen hier die ROHEN Namen; der Host hoerte damit
 * auf einen Kanal, auf dem sie nie erscheinen, und der Lebenszyklus feuerte nie.
 *
 * Hintergrund: die Arbeit laeuft in einer Warteschlange mit `maxConcurrent` = 1,
 * `maxQueue` Plaetzen und `maxPerSession` Auftraegen je Sitzung. Jeder Auftrag
 * hat ein `timeoutMs` und laesst sich mit `dispose()` abbrechen. Der Nutzerturn
 * wartet nie darauf: der Hook kehrt sofort zurueck.
 *
 * Schreibort: IMMER `rules.root.dir` relativ zum Arbeitsverzeichnis — der Root,
 * den DSH nativ entdeckt. Ein Pfad ausserhalb dieses Roots wird abgelehnt.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
// Der Agenten-Brief ist eine Ressource (`prompts.json`), kein Literal im Host.
import { promptText } from './prompt-text.js';
import {
  SKILL_MARK,
  appendBeleg,
  belegLine,
  checkCandidate,
  consolidateText,
  emptyLedger,
  fingerprintOf,
  normalizeCandidate,
  parseLedger,
  recordEvidence,
  renderSkill,
  sessionRef,
  setDecision,
} from './skill-lifecycle-core.js';

const SESSION_CAP = 64;

/** Text aus einem Inhalt: String oder Blockliste (nur `text`-Bloecke). */
export function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/** Die Nutzlast eines Ereignisses: DSH legt sie mal in `data`, mal direkt ab. */
function dataOf(payload) {
  return payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' ? payload.data : payload ?? {};
}

function clip(text, max) {
  const value = String(text ?? '');
  return value.length > max ? value.slice(0, max) : value;
}

/** Den Lebenszyklus anlegen. Liefert `observe`, `dispose` und die Zaehler fuer Tests. */
export function createSkillLifecycle({ ctx, rules, noteRules, route, log = console }) {
  const skillsRoot = resolve(process.cwd(), rules.root.dir);
  const ledgerPath = resolve(process.cwd(), rules.ledger.path);
  const { budget, trigger } = rules;
  const controller = new AbortController();
  const sessions = new Map();
  const queue = [];
  const timers = new Set();
  const perSession = new Map();
  let running = false;
  let disposed = false;

  const bufferOf = (sessionId) => {
    let buffer = sessions.get(sessionId);
    if (buffer === undefined) {
      if (sessions.size >= SESSION_CAP) sessions.delete(sessions.keys().next().value);
      buffer = { prompt: '', answer: '', completed: 0, pendingCorrection: null, correctionText: '', turnRef: null };
      sessions.set(sessionId, buffer);
    }
    return buffer;
  };

  /** Liegt der Pfad unterhalb der erlaubten Wurzel? Jedes Schreiben prueft das. */
  function inside(path, root = skillsRoot) {
    const target = resolve(path);
    return target === root || target.startsWith(root + sep);
  }

  function readExisting() {
    let names;
    try {
      names = readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
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
      log.warn?.(`[shinon-skills] Ledger unlesbar (${parsed.reason}) — starte leer, die alte Datei bleibt unberührt`);
      return emptyLedger();
    }
    return parsed.ledger;
  }

  /**
   * Atomar schreiben: erst eine temporaere Datei, dann umbenennen. Die erlaubte
   * Wurzel ist PRO SCHREIBZIEL angegeben (Skill-Root oder Ledger-Ordner) — ein
   * einziger Root fuer beides war ein Fehler: der Ledger liegt in .shinon/.
   */
  function writeFileAtomic(path, text, allowedRoot = skillsRoot) {
    if (!inside(path, allowedRoot)) throw new Error(`Schreibziel außerhalb der erlaubten Wurzel: ${path}`);
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}`;
    writeFileSync(temp, text, 'utf8');
    renameSync(temp, path);
  }

  function writeLedger(ledger) {
    writeFileAtomic(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, dirname(ledgerPath));
  }

  /** Den Beleg-Schluessel aus dem Ledger in eine lesbare Zeile zurueckverwandeln. */
  const belegLines = (keys) => keys.map((key) => {
    const [kind, session, ref] = key.split('|');
    return belegLine({ kind, session, ref });
  });

  /** Ein Auftrag: Modell, Pruefung, Ledger, Datei. Jede Stufe nennt ihren Befund. */
  async function runJob(job, signal) {
    if (signal.aborted) return;
    const evidenceText = [
      `<beleg art="${job.kind}">`,
      `<nutzerauftrag>${clip(job.prompt, budget.maxPromptChars)}</nutzerauftrag>`,
      `<antwort>${clip(job.answer, budget.maxEvidenceChars)}</antwort>`,
      job.correction ? `<korrektur>${clip(job.correction, budget.maxEvidenceChars)}</korrektur>` : '',
      '</beleg>',
    ].filter(Boolean).join('\n');

    const request = {
      provider: route.provider,
      model: route.model,
      system: job.system,
      messages: [{ role: 'user', content: [{ type: 'text', text: evidenceText }] }],
      maxTokens: budget.maxTokens,
      temperature: 0,
      signal,
    };
    let text = '';
    for await (const chunk of ctx.llm.stream(request)) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
    }
    if (signal.aborted) return;

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    let raw;
    try {
      raw = JSON.parse(start === -1 || end < start ? '' : text.slice(start, end + 1));
    } catch {
      log.log(`[shinon-skills] ${job.kind}: verworfen (KEIN_JSON)`);
      return;
    }
    if (raw && raw.skip === true) {
      log.log(`[shinon-skills] ${job.kind}: kein Lernstoff (Modell hat abgelehnt)`);
      return;
    }

    const normalized = normalizeCandidate(raw, rules);
    if (!normalized.ok) {
      log.log(`[shinon-skills] ${job.kind}: verworfen (${normalized.reason})`);
      return;
    }
    const candidate = normalized.candidate;
    const fingerprint = fingerprintOf(candidate, rules);
    const sessionId = sessionRef(job.sessionId);
    const evidence = { kind: job.evidenceKind, session: sessionId, ref: job.ref, fingerprint };

    const ledger = readLedger();
    const recorded = recordEvidence(ledger, candidate.name, evidence, { maxEntries: rules.ledger.maxEntries });
    if (!recorded.added) {
      log.log(`[shinon-skills] ${candidate.name}: Beleg schon bekannt — nichts zu tun (idempotent)`);
      return;
    }
    const entry = recorded.entry;
    const existing = readExisting();
    // Der Eigentuemer: ein Ziel laut Ledger ODER eine Datei, die dieser Lebenszyklus
    // selbst geschrieben hat (Fingerabdruck-Marker). Der zweite Fall deckt einen
    // Absturz zwischen Datei- und Ledger-Schreiben ab; sonst waere das ein Namenskonflikt.
    const ownFile = existing.some((skill) => skill.name === candidate.name && skill.text.includes(SKILL_MARK));
    const owner = entry.status === 'published' || ownFile ? candidate.name : entry.status === 'consolidated' ? entry.target : null;
    const check = checkCandidate({ candidate, existing, kinds: entry.kinds, owner, rules, noteRules });

    if (check.verdict === 'publish') {
      const skill = renderSkill(candidate, { fingerprint, belege: belegLines(entry.belege) });
      writeFileAtomic(join(skillsRoot, candidate.name, rules.root.file), skill);
    } else if (check.verdict === 'consolidate') {
      const file = join(skillsRoot, check.target, rules.root.file);
      const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
      const next = current === ''
        ? appendBeleg(current, belegLine(evidence))
        : consolidateText(current, candidate, { fingerprint, line: belegLine(evidence) });
      if (next !== current) writeFileAtomic(file, next);
    }

    writeLedger(setDecision(recorded.ledger, candidate.name, check, { maxEntries: rules.ledger.maxEntries }));
    log.log(`[shinon-skills] ${candidate.name}: ${check.verdict} (${check.reason}${check.target ? ` → ${check.target}` : ''})`);
  }

  /** Warteschlange: ein Auftrag nach dem anderen, nie mehr als maxQueue wartend. */
  function pump() {
    if (running || disposed) return;
    const next = queue.shift();
    if (next === undefined) return;
    running = true;
    // Ein eigener Abbruch je Auftrag: der Timeout beendet NUR diesen Auftrag,
    // dispose() beendet ihn ebenfalls. Der gemeinsame Controller bleibt unberuehrt.
    const jobAbort = new AbortController();
    const onDispose = () => jobAbort.abort(new Error('skill-lifecycle disposed'));
    controller.signal.addEventListener('abort', onDispose, { once: true });
    const timeout = setTimeout(() => jobAbort.abort(new Error('skill-lifecycle timeout')), budget.timeoutMs);
    timeout.unref?.();
    timers.add(timeout);
    runJob(next, jobAbort.signal)
      .catch((error) => log.warn?.(`[shinon-skills] ${next.kind} abgebrochen (${error?.message ?? error})`))
      .finally(() => {
        clearTimeout(timeout);
        timers.delete(timeout);
        controller.signal.removeEventListener('abort', onDispose);
        running = false;
        pump();
      });
  }

  function enqueue(job) {
    if (disposed) return false;
    if (route.provider === '' || route.model === '') {
      log.log(`[shinon-skills] ${job.kind}: übersprungen (keine Route)`);
      return false;
    }
    const used = perSession.get(job.sessionId) ?? 0;
    if (used >= budget.maxPerSession) {
      log.log(`[shinon-skills] ${job.kind}: übersprungen (Budget der Sitzung erschöpft)`);
      return false;
    }
    if (queue.length >= budget.maxQueue) {
      log.log(`[shinon-skills] ${job.kind}: übersprungen (Warteschlange voll)`);
      return false;
    }
    perSession.set(job.sessionId, used + 1);
    queue.push(job);
    pump();
    return true;
  }

  /** Den Auftrag fuer die Korrektur verzoegert anlegen: ein Widerspruchs-Text kann kurz danach kommen. */
  function scheduleCorrection(sessionId, buffer) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      enqueue({
        kind: 'korrektur',
        evidenceKind: 'correction',
        sessionId,
        ref: buffer.pendingCorrection,
        prompt: buffer.prompt,
        answer: buffer.answer,
        correction: buffer.correctionText,
        system: SYSTEM_PROMPT,
      });
    }, trigger.correction.settleMs);
    timer.unref?.();
    timers.add(timer);
  }

  /** Das Ereignis verarbeiten. Nie werfen: der Host darf den Lauf nicht brechen. */
  function observe(envelope, payload) {
    if (disposed) return;
    try {
      const type = typeof envelope?.event_type === 'string' ? envelope.event_type : '';
      const sessionId = typeof envelope?.session_id === 'string' ? envelope.session_id : '';
      if (sessionId === '') return;
      const data = dataOf(payload);
      const buffer = bufferOf(sessionId);

      if (type === 'message.received' && data?.source?.kind === 'user') {
        buffer.prompt = clip(textOf(data.content), budget.maxPromptChars);
      } else if (type === 'message.completed') {
        buffer.answer = clip(textOf(data.message?.content ?? data.content), budget.maxEvidenceChars);
      } else if (type === trigger.correction.event) {
        const item = data.item ?? {};
        if (item.rating === trigger.correction.rating && typeof item.messageId === 'string') {
          buffer.pendingCorrection = `message:${item.messageId}`;
          buffer.correctionText = '';
          scheduleCorrection(sessionId, buffer);
        }
      } else if (type === trigger.correction.recordEvent) {
        if (buffer.pendingCorrection !== null && typeof data.text === 'string') {
          buffer.correctionText = clip(data.text, budget.maxEvidenceChars);
        }
      } else if (type === 'turn.end') {
        if (data.reason?.kind !== trigger.completed.reason) return;
        buffer.completed += 1;
        const turn = data.turn;
        if (buffer.prompt === '' || buffer.answer === '') return;
        enqueue({
          kind: 'wiederholung',
          evidenceKind: 'completed',
          sessionId,
          ref: `turn:${String(turn ?? buffer.completed)}`,
          prompt: buffer.prompt,
          answer: buffer.answer,
          correction: '',
          system: SYSTEM_PROMPT,
        });
      }
    } catch (error) {
      log.warn?.(`[shinon-skills] Ereignis verworfen (${error?.message ?? error})`);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort(new Error('skill-lifecycle disposed'));
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    queue.length = 0;
  }

  return { observe, dispose, pending: () => queue.length, skillsRoot, ledgerPath };
}

/** Der Vertragsname der Regeldatei — geprüft beim Laden, nicht geraten. */
export const LIFECYCLE_CONTRACT = 'shinon.skill-lifecycle/v1';

/**
 * Die Regeln laden und den Vertrag pruefen. Fremder Vertrag = Wurf: der
 * Aufrufer haengt dann keinen Lebenszyklus an (fail-closed, laut im Log).
 */
export function loadLifecycleRules(url = new URL('./skill-lifecycle-rules.json', import.meta.url)) {
  const parsed = JSON.parse(readFileSync(url, 'utf8'));
  if (parsed?.contract !== LIFECYCLE_CONTRACT) throw new Error(`Regeln fremd: ${String(parsed?.contract)}`);
  return parsed;
}

/** Der Systemtext des Modells: nur Form, keine Werkzeuge, Belege sind Daten. */
export const SYSTEM_PROMPT = promptText('prompter-skill-system');
