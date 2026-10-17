/**
 * pr-promotion.mjs — wann ein Pull Request reif ist, als reine Entscheidung.
 *
 * Kein Netzwerk, kein Schreibrecht, kein Zustand außerhalb der Argumente: die
 * Evidenz kommt herein, Zustand und Blocker kommen heraus. Der Adapter führt
 * eine Schreibaktion aus; diese Datei ruft ihn nur, wenn der Aufrufer es sagt.
 *
 * Die eine harte Regel: ein Status zählt nur für den Commit, den er nennt.
 * Fehlt er oder nennt er einen anderen SHA, ist das BLOCKED — nicht grün.
 */

export const STATES = Object.freeze([
  'DISCOVERED',
  'CHECKING',
  'READY',
  'BLOCKED',
  'PROMOTED',
  'FAILED',
  'ROLLED_BACK',
]);

/** Erlaubte Übergänge. Alles andere ist ein Programmierfehler, kein Zustand. */
export const TRANSITIONS = Object.freeze({
  DISCOVERED: ['CHECKING', 'BLOCKED'],
  CHECKING: ['READY', 'BLOCKED', 'FAILED'],
  READY: ['PROMOTED', 'BLOCKED', 'FAILED'],
  BLOCKED: ['CHECKING'],
  PROMOTED: ['ROLLED_BACK', 'FAILED'],
  FAILED: ['ROLLED_BACK', 'CHECKING'],
  ROLLED_BACK: ['CHECKING'],
});

/** Das einzige Recht, das ein echter Promote braucht. */
export const ADAPTER_PERMISSIONS = Object.freeze(['pull_requests:write']);

const STAGE_CODES = Object.freeze({
  failure: 'STAGE_FAILED',
  cancelled: 'STAGE_CANCELLED',
  skipped: 'STAGE_SKIPPED',
});

export class PromotionError extends Error {
  constructor(message, from, to) {
    super(message);
    this.name = 'PromotionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Einen Übergang prüfen und den neuen Zustand zurückgeben (oder werfen). */
export function transition(from, to) {
  if (!STATES.includes(from)) throw new PromotionError(`Unbekannter Zustand: ${String(from)}`, from, to);
  if (!STATES.includes(to)) throw new PromotionError(`Unbekannter Zustand: ${String(to)}`, from, to);
  if (!canTransition(from, to)) throw new PromotionError(`Übergang ${from} → ${to} ist nicht erlaubt`, from, to);
  return to;
}

/**
 * Die Entscheidung aus der Evidenz ableiten.
 *
 * READY nur, wenn jede verlangte Stage für GENAU diesen SHA grün ist, ein
 * Review für diesen SHA freigibt und der Diff nicht leer ist. Nur offene
 * Stages („pending") ergeben CHECKING; alles andere ist BLOCKED.
 */
export function assess(input = {}) {
  const headSha = typeof input.headSha === 'string' ? input.headSha.trim() : '';
  const headOk = /^[0-9a-f]{7,40}$/.test(headSha);
  const baseBranch = typeof input.baseBranch === 'string' ? input.baseBranch.trim() : '';
  const blockers = [];

  if (!headOk) blockers.push({ code: 'SHA_UNKNOWN' });
  if (baseBranch === '') blockers.push({ code: 'BASE_UNKNOWN' });

  const required = Array.isArray(input.requiredStages) ? input.requiredStages : [];
  if (required.length === 0) blockers.push({ code: 'STAGES_UNDEFINED' });

  const evidence = new Map();
  for (const entry of Array.isArray(input.gateEvidence) ? input.gateEvidence : []) {
    if (entry && typeof entry.stage === 'string') evidence.set(entry.stage, entry);
  }
  for (const stage of required) {
    const found = evidence.get(stage);
    if (found === undefined) {
      blockers.push({ code: 'STAGE_MISSING', stage });
      continue;
    }
    if (!headOk || found.sha !== headSha) {
      blockers.push({ code: 'STAGE_STALE', stage });
      continue;
    }
    if (found.conclusion === 'success') continue;
    blockers.push({ code: STAGE_CODES[found.conclusion] ?? 'STAGE_PENDING', stage });
  }

  const reviews = Array.isArray(input.reviews) ? input.reviews : [];
  const atHead = headOk ? reviews.filter((review) => review && review.sha === headSha) : [];
  if (atHead.some((review) => review.state === 'CHANGES_REQUESTED')) {
    blockers.push({ code: 'CHANGES_REQUESTED' });
  } else if (!atHead.some((review) => review.state === 'APPROVED')) {
    blockers.push({ code: reviews.length > 0 ? 'REVIEW_STALE' : 'REVIEW_MISSING' });
  }

  const files = Array.isArray(input.diffScope?.files) ? input.diffScope.files : null;
  if (files === null) blockers.push({ code: 'DIFF_UNKNOWN' });
  else if (files.length === 0) blockers.push({ code: 'NO_DIFF' });

  const state =
    blockers.length === 0 ? 'READY' : blockers.every((blocker) => blocker.code === 'STAGE_PENDING') ? 'CHECKING' : 'BLOCKED';

  return { state, headSha, baseBranch, stages: required, blockers, promotable: state === 'READY' };
}

/** Ein Adapter ist eine Grenze mit genau einem Recht — nicht mehr und nicht weniger. */
export function adapterIssues(adapter) {
  if (!adapter || typeof adapter !== 'object') return [{ code: 'ADAPTER_MISSING' }];
  const issues = [];
  if (typeof adapter.promote !== 'function') issues.push({ code: 'ADAPTER_NO_PROMOTE' });
  const permissions = adapter.permissions;
  if (!Array.isArray(permissions) || permissions.length === 0) {
    issues.push({ code: 'ADAPTER_NO_PERMISSIONS' });
    return issues;
  }
  if (permissions.includes('*')) issues.push({ code: 'ADAPTER_WILDCARD' });
  for (const permission of permissions) {
    if (!ADAPTER_PERMISSIONS.includes(permission)) issues.push({ code: 'ADAPTER_OVERPRIVILEGED', permission });
  }
  if (!permissions.includes('pull_requests:write')) issues.push({ code: 'ADAPTER_NO_WRITE' });
  return issues;
}

/**
 * Die Promotion ausführen — als Entscheidung. Ein Dry-Run ruft `promote` nie
 * auf; ein echter Lauf nur bei READY und nur mit genau einem Recht. Ein Fehler
 * des Adapters wird FAILED, niemals ein stiller Erfolg.
 */
export function runPromotion({ assessment, adapter, dryRun = false } = {}) {
  if (!assessment || !STATES.includes(assessment.state)) {
    return { status: 'BLOCKED', reasons: [{ code: 'ASSESSMENT_MISSING' }] };
  }
  if (assessment.state !== 'READY') {
    return { status: assessment.state === 'CHECKING' ? 'CHECKING' : 'BLOCKED', reasons: assessment.blockers ?? [] };
  }

  if (dryRun) {
    let preview = null;
    if (adapter && typeof adapter.dryRun === 'function') {
      try {
        preview = adapter.dryRun({ sha: assessment.headSha, baseBranch: assessment.baseBranch }) ?? null;
      } catch (error) {
        return { status: 'FAILED', reasons: [{ code: 'ADAPTER_ERROR', message: String(error?.message ?? error) }] };
      }
    }
    return { status: 'READY', dryRun: true, promoted: false, preview, reasons: [] };
  }

  const issues = adapterIssues(adapter);
  if (issues.length > 0) return { status: 'BLOCKED', reasons: issues };

  let result;
  try {
    result = adapter.promote({ sha: assessment.headSha, baseBranch: assessment.baseBranch });
  } catch (error) {
    return { status: 'FAILED', reasons: [{ code: 'ADAPTER_ERROR', message: String(error?.message ?? error) }] };
  }

  const promotedSha = result?.sha;
  if (promotedSha !== assessment.headSha) {
    return { status: 'FAILED', reasons: [{ code: 'PROMOTION_SHA_MISMATCH', expected: assessment.headSha, actual: promotedSha ?? null }] };
  }
  return { status: 'PROMOTED', promoted: true, sha: promotedSha, reasons: [] };
}
