/**
 * @shinon/prompter — Asynchrone Lernpruefung, Host (assets/learning-review.js).
 *
 * DER EINE PRODUZENT. Er hoert Ereignisse, haelt ein begrenztes, redigiertes
 * Digest, entscheidet WANN geprueft wird, ruft das Modell GENAU EINMAL und
 * legt einen Vorschlag an. Er schreibt keine Skills und kein Gedaechtnis: das
 * tun die Eigentuemer (`skill-lifecycle.js`, Persona-Naht).
 *
 * NICHT BLOCKIEREND: `observe()` ist synchron und stellt nur in die Queue.
 * Der Modellaufruf laeuft danach; `dispose()` bricht ihn ab. Ein haengender
 * Strom haelt weder Antwort noch Abbruch eines Turns auf.
 *
 * EIGENES BUDGET: `maxConcurrent`, `maxQueue`, `maxPerSession`, `timeoutMs`,
 * `maxTokens`, `maxInputChars` und `maxIterations` stehen in
 * `learning-review-rules.json`. Die Iterationsgrenze ist hier BAUFORM: genau
 * ein `ctx.llm.stream` je Auftrag, kein Retry, keine Werkzeuge.
 *
 * AUSLOESER:
 *   - Korrektur (`feedback.rated` negativ + `feedback.noted`) sofort, nach Settle.
 *   - Nudge: `nudgeTurns` abgeschlossene Zuege ODER `nudgeToolCalls`
 *     Werkzeug-Iterationen seit der letzten Pruefung.
 *   - `turn.end` mit `aborted` setzt zurueck und erzeugt NICHTS.
 */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { promptText } from './prompt-text.js';
import { sessionRef } from './skill-lifecycle-core.js';
import { addEntry, addTool, emptyBuffer, renderDigest } from './learning-redact.js';
import { PERSONA_MEMORY_PROPOSAL_CONTRACT } from '@shinon/seams/core';
import {
  buildProposal,
  canAuto,
  checkProposal,
  normalizeDecision,
  setProposal,
  putProposal,
} from './learning-proposal.js';
import { addSkillLoad, readRegistry, readUsage, withLock, writeRegistry, writeUsage } from './learning-store.js';
import { textOf } from './skill-lifecycle.js';

export const LEARNING_CONTRACT = 'shinon.learning-review/v1';

/** Die Regeln laden und pruefen — ein fremder Vertrag ist ein Wurf. */
export function loadLearningRules(url = new URL('./learning-review-rules.json', import.meta.url)) {
  const parsed = JSON.parse(readFileSync(url, 'utf8'));
  if (parsed?.contract !== LEARNING_CONTRACT) throw new Error(`Lernregeln fremd: ${String(parsed?.contract)}`);
  return parsed;
}

/** Die Nutzlast eines Ereignisses: DSH legt sie mal in `data`, mal direkt ab. */
function dataOf(payload) {
  return payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' ? payload.data : payload ?? {};
}

function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) : text;
}

/** Die Kennung einer Nachricht — nur echte Ids, nie geraten. */
function messageIdOf(data) {
  const id = data?.message?.id ?? data?.id ?? data?.messageId;
  return typeof id === 'string' && id !== '' ? id : '';
}

export function createLearningReview({
  ctx,
  config,
  rules,
  skillRules,
  noteRules,
  writer,
  route,
  persona = () => null,
  log = console,
  workspaceRoot = process.cwd(),
  now = () => new Date().toISOString(),
}) {
  const registryPath = resolve(workspaceRoot, config?.registryPath || rules.registry.path);
  const usagePath = resolve(workspaceRoot, config?.usagePath || rules.usage.path);
  const reviewRoute = config?.provider && config?.model
    ? { provider: config.provider, model: config.model }
    : route;
  const budget = rules.review;
  if (budget.maxIterations !== 1) {
    log.warn?.(`[shinon-learn] maxIterations=${String(budget.maxIterations)} — dieser Reviewer ruft das Modell genau EINMAL je Auftrag auf; der Wert wird nicht erhoeht`);
  }
  const sessions = new Map();
  const queue = [];
  const timers = new Set();
  const perSession = new Map();
  let running = false;
  let disposed = false;
  let personaReader = persona;

  const bufferOf = (sessionId) => {
    let session = sessions.get(sessionId);
    if (session === undefined) {
      if (sessions.size >= 64) sessions.delete(sessions.keys().next().value);
      session = {
        digest: emptyBuffer(),
        turns: 0,
        toolCalls: 0,
        lastReviewAt: 0,
        turn: 0,
        correctionRef: null,
        correctionText: '',
      };
      sessions.set(sessionId, session);
    }
    return session;
  };

  /** Die eigene Route: nur wenn beide Felder stehen; sonst der Prompter-Weg. */
  function routeReady() {
    return reviewRoute !== null && typeof reviewRoute === 'object'
      && typeof reviewRoute.provider === 'string' && reviewRoute.provider !== ''
      && typeof reviewRoute.model === 'string' && reviewRoute.model !== '';
  }

  /** Die Nutzung zaehlen — Quelle ist der Werkzeug-Aufruf, nicht die Auswahl. */
  function recordUsage(sessionId, skillName) {
    try {
      const { usage } = readUsage(usagePath, { log });
      const next = addSkillLoad(usage, skillName, {
        session: sessionRef(sessionId),
        now: now(),
        maxEntries: rules.usage.maxEntries,
      });
      writeUsage(usagePath, next);
    } catch (error) {
      log.warn?.(`[shinon-learn] Nutzung nicht geschrieben (${error?.message ?? error})`);
    }
  }

  /** Einen Eintrag ins Register legen; Lock + atomar, nie zwei Wahrheiten. */
  function persist(proposal, patch) {
    return withLock(`${registryPath}.lock`, () => {
      const { registry } = readRegistry(registryPath, { log });
      const placed = registry.entries[proposal.id] === undefined
        ? putProposal(registry, proposal, rules.registry.maxEntries)
        : { ok: true, registry };
      if (!placed.ok) return placed;
      const updated = setProposal(placed.registry, proposal.id, patch);
      if (!updated.ok) return updated;
      writeRegistry(registryPath, updated.registry);
      return { ok: true, registry: updated.registry };
    });
  }

  /** Ein Auftrag: Digest, ein Modellaufruf, Pruefung, Vorschlag. */
  async function runJob(job, signal) {
    if (signal.aborted) return;
    const { text, refs } = renderDigest(job.digest, rules.redaction);
    if (refs.length === 0) {
      log.log('[shinon-learn] nichts zu pruefen (leerer Beleg)');
      return;
    }
    const request = {
      provider: reviewRoute.provider,
      model: reviewRoute.model,
      system: promptText('prompter-learning-system'),
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      maxTokens: budget.maxTokens,
      temperature: 0,
      signal,
    };
    let answer = '';
    try {
      for await (const chunk of ctx.llm.stream(request)) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') answer += chunk.text;
      }
    } catch (error) {
      log.warn?.(`[shinon-learn] ${job.kind}: Modellaufruf abgebrochen (${error?.message ?? error})`);
      return;
    }
    if (signal.aborted) return;

    const start = answer.indexOf('{');
    const end = answer.lastIndexOf('}');
    let raw;
    try {
      raw = JSON.parse(start === -1 || end < start ? '' : answer.slice(start, end + 1));
    } catch {
      log.log(`[shinon-learn] ${job.kind}: verworfen (KEIN_JSON)`);
      return;
    }
    const normalized = normalizeDecision(raw, { rules, skillRules, refs });
    if (!normalized.ok) {
      log.log(`[shinon-learn] ${job.kind}: verworfen (${normalized.reason})`);
      return;
    }
    if (normalized.decision === 'none') {
      log.log(`[shinon-learn] ${job.kind}: kein Lernstoff (Modell hat abgelehnt)`);
      return;
    }

    const evidence = job.evidence;
    let base = null;
    let owner = null;
    const findings = checkProposal(normalized, { rules, skillRules, noteRules }).findings;

    if (normalized.decision === 'skill') {
      const checked = writer.inspect(normalized.payload, evidence);
      base = checked.base;
      owner = checked.target ?? normalized.payload.name;
      findings.push({ id: 'EIGENTUEMER', ok: checked.verdict === 'publish' || checked.verdict === 'consolidate', detail: `${checked.verdict}:${checked.reason}` });
      if (checked.verdict === 'reject' || checked.verdict === 'candidate') {
        const proposal = buildProposal({ ...normalized, checks: findings, evidence, base, owner }, rules);
        persist(proposal, { status: 'blocked', decision: { by: 'review', at: now(), via: 'checks' } });
        log.log(`[shinon-learn] ${job.kind}: blockiert (${checked.reason})`);
        return;
      }
    }

    const proposal = buildProposal({ ...normalized, checks: findings, evidence, base, owner }, rules);
    if (!findings.every((finding) => finding.ok)) {
      persist(proposal, { status: 'blocked', decision: { by: 'review', at: now(), via: 'checks' } });
      log.log(`[shinon-learn] ${job.kind}: blockiert (${findings.filter((finding) => !finding.ok).map((finding) => finding.id).join(',')})`);
      return;
    }

    const auto = canAuto(proposal, {
      memoryWriteApproval: config?.memoryWriteApproval !== false,
      skillWriteApproval: config?.skillWriteApproval !== false,
      minEvidenceForAuto: budget.minEvidenceForAuto,
    });

    if (normalized.decision === 'skill') {
      if (!auto.auto) {
        persist(proposal, { status: 'pending' });
        log.log(`[shinon-learn] ${job.kind}: Vorschlag ${proposal.id} wartet auf Freigabe (${auto.reason})`);
        return;
      }
      const applied = writer.apply(proposal, { evidence });
      if (!applied.ok) {
        persist(proposal, { status: 'blocked', decision: { by: 'review', at: now(), via: 'auto' } });
        log.log(`[shinon-learn] ${job.kind}: Anwenden verweigert (${applied.reason})`);
        return;
      }
      persist(proposal, {
        status: 'auto-applied',
        decision: { by: 'review', at: now(), via: 'auto' },
        undo: { kind: 'skill', ...applied, owner: applied.owner ?? owner },
      });
      log.log(`[shinon-learn] ${job.kind}: ${applied.verdict} -> ${applied.path} (${auto.reason})`);
      return;
    }

    const service = typeof personaReader === 'function' ? personaReader() : null;
    if (service === null || service === undefined || typeof service.propose !== 'function') {
      persist(proposal, { status: 'blocked', decision: { by: 'review', at: now(), via: 'checks' } });
      log.log(`[shinon-learn] ${job.kind}: kein Memory-Eigentuemer — Vorschlag bleibt im Register`);
      return;
    }
    const answerProposal = service.propose({
      contract: PERSONA_MEMORY_PROPOSAL_CONTRACT,
      id: proposal.id,
      subject: proposal.payload.subject,
      claim: proposal.payload.claim,
      reason: proposal.reason,
      sources: proposal.sources,
      decision: auto.auto ? 'accepted' : 'proposed',
    });
    if (answerProposal?.ok !== true) {
      persist(proposal, { status: 'blocked', decision: { by: 'review', at: now(), via: 'checks' } });
      log.log(`[shinon-learn] ${job.kind}: Memory verweigert (${answerProposal?.reason ?? 'UNBEKANNT'})`);
      return;
    }
    persist(proposal, auto.auto
      ? {
        status: 'auto-applied',
        decision: { by: 'review', at: now(), via: 'auto' },
        undo: { kind: 'memory', personaId: answerProposal.id ?? null },
      }
      : { status: 'pending', undo: { kind: 'memory', personaId: answerProposal.id ?? null } });
    log.log(`[shinon-learn] ${job.kind}: Memory ${auto.auto ? 'uebernommen' : 'zur Freigabe'} (${answerProposal.id ?? 'ohne Id'})`);
  }

  /** Einen Auftrag einstellen. Die Zaehler werden beim Einstellen zurueckgesetzt. */
  function enqueue(job) {
    if (disposed) return false;
    if (!routeReady() || typeof ctx?.llm?.stream !== 'function') {
      log.log(`[shinon-learn] ${job.kind}: uebersprungen (keine Route oder kein llm-Dienst)`);
      return false;
    }
    const used = perSession.get(job.sessionId) ?? 0;
    if (used >= budget.maxPerSession) {
      log.log(`[shinon-learn] ${job.kind}: uebersprungen (Budget der Sitzung erschoepft)`);
      return false;
    }
    if (queue.length >= budget.maxQueue) {
      log.log(`[shinon-learn] ${job.kind}: uebersprungen (Warteschlange voll)`);
      return false;
    }
    const session = sessions.get(job.sessionId);
    if (session !== undefined) {
      session.turns = 0;
      session.toolCalls = 0;
      session.lastReviewAt = Date.now();
    }
    perSession.set(job.sessionId, used + 1);
    queue.push(job);
    pump();
    return true;
  }

  /** Ein Auftrag nach dem anderen; eigener Abbruch und Zeitdeckel je Auftrag. */
  function pump() {
    if (running || disposed) return;
    const next = queue.shift();
    if (next === undefined) return;
    running = true;
    const jobAbort = new AbortController();
    const onDispose = () => jobAbort.abort(new Error('learning-review disposed'));
    controller.signal.addEventListener('abort', onDispose, { once: true });
    const timeout = setTimeout(() => jobAbort.abort(new Error('learning-review timeout')), budget.timeoutMs);
    timeout.unref?.();
    timers.add(timeout);
    runJob(next, jobAbort.signal)
      .catch((error) => log.warn?.(`[shinon-learn] ${next.kind} abgebrochen (${error?.message ?? error})`))
      .finally(() => {
        clearTimeout(timeout);
        timers.delete(timeout);
        controller.signal.removeEventListener('abort', onDispose);
        running = false;
        pump();
      });
  }

  const controller = new AbortController();

  function scheduleCorrection(sessionId, session) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      const refs = session.correctionRef;
      if (refs === null) return;
      const text = session.correctionText === '' ? 'Korrektur ohne Text' : session.correctionText;
      const digest = addEntry(session.digest, { kind: 'correction', ref: refs, text }, rules.redaction);
      enqueue({
        kind: 'korrektur',
        sessionId,
        digest,
        evidence: { kind: 'correction', session: sessionRef(sessionId), ref: refs, completed: 0 },
      });
    }, rules.trigger.settleMs);
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
      const session = bufferOf(sessionId);
      const limits = rules.redaction;

      if (type === 'message.received' && data?.source?.kind === 'user') {
        const id = messageIdOf(data);
        const ref = id === '' ? null : `message:${id}`;
        const text = textOf(data.content);
        if (ref !== null && text.trim() !== '') {
          session.digest = addEntry(session.digest, { kind: 'user', ref, text }, limits);
        }
      } else if (type === 'message.completed') {
        const id = messageIdOf(data);
        const ref = id === '' ? null : `message:${id}`;
        const text = textOf(data.message?.content ?? data.content);
        if (ref !== null && text.trim() !== '') {
          session.digest = addEntry(session.digest, { kind: 'assistant', ref, text }, limits);
        }
      } else if (type === rules.trigger.toolEvent) {
        const name = typeof data?.name === 'string' ? data.name : '';
        if (name !== '') {
          session.toolCalls += 1;
          session.digest = addTool(session.digest, name, limits);
          const skillName = data?.arguments?.name;
          if (name === rules.usage.skillToolName && typeof skillName === 'string' && skillName !== '') {
            recordUsage(sessionId, skillName);
          }
        }
      } else if (type === rules.trigger.correctionEvent) {
        const item = data.item ?? {};
        if (item.rating === rules.trigger.rating && typeof item.messageId === 'string') {
          session.correctionRef = `feedback:${item.messageId}`;
          session.correctionText = '';
          scheduleCorrection(sessionId, session);
        }
      } else if (type === rules.trigger.recordEvent) {
        if (session.correctionRef !== null && typeof data.text === 'string') {
          session.correctionText = clip(data.text, rules.redaction.maxEntryChars);
        }
      } else if (type === rules.trigger.completedEvent) {
        const reason = data.reason?.kind;
        if (reason === rules.trigger.abortReason) {
          session.turns = 0;
          session.toolCalls = 0;
          return;
        }
        if (reason !== rules.trigger.completedReason) return;
        session.turn += 1;
        session.turns += 1;
        const cooled = Date.now() - session.lastReviewAt < rules.review.cooldownMs;
        if (cooled) return;
        // Eine Schwelle von 0 heisst AUS, nicht „sofort": sonst feuerte jede
        // Konfiguration, die nur eine der beiden Zahlen setzt, beim ersten Turn.
        const byTurns = session.turns >= rules.review.nudgeTurns;
        const byTools = rules.review.nudgeToolCalls > 0 && session.toolCalls >= rules.review.nudgeToolCalls;
        if (!byTurns && !byTools) return;
        enqueue({
          kind: 'nudge',
          sessionId,
          digest: session.digest,
          evidence: {
            kind: 'completed',
            session: sessionRef(sessionId),
            ref: `turn:${session.turn}`,
            completed: session.turns,
          },
        });
      }
    } catch (error) {
      log.warn?.(`[shinon-learn] Ereignis verworfen (${error?.message ?? error})`);
    }
  }

  function attachPersona(reader) {
    if (typeof reader === 'function') personaReader = reader;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort(new Error('learning-review disposed'));
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    queue.length = 0;
  }

  return {
    observe,
    dispose,
    attachPersona,
    pending: () => queue.length,
    registryPath,
    usagePath,
    sessions,
  };
}
