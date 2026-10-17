#!/usr/bin/env node
/**
 * Tests der PR-Promotion-Entscheidung: Zustandsautomat, Evidenz, Adaptergrenze.
 *
 * Kein Netz, kein Schreibrecht, keine Zeit: alles ist eine Funktion ihrer
 * Argumente. Der wichtigste Fall ist der unauffällige — ein Status, der zu
 * einem ANDEREN Commit gehört, ist kein grüner Status.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PromotionError,
  STATES,
  TRANSITIONS,
  adapterIssues,
  assess,
  canTransition,
  runPromotion,
  transition,
} from '../../lib/pr-promotion.mjs';

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);

/** Eine vollständig grüne Evidenzlage für HEAD. */
function green(overrides = {}) {
  return {
    baseBranch: 'main',
    headSha: HEAD,
    diffScope: { files: ['scripts/lib/pr-promotion.mjs'], additions: 10, deletions: 1 },
    requiredStages: ['commit-guard', 'gate-rules'],
    gateEvidence: [
      { stage: 'commit-guard', sha: HEAD, conclusion: 'success' },
      { stage: 'gate-rules', sha: HEAD, conclusion: 'success' },
    ],
    reviews: [{ sha: HEAD, state: 'APPROVED', author: 'maintainer' }],
    ...overrides,
  };
}

// ── 1. Zustandsautomat ──────────────────────────────────────────────────────

test('promotion: jede erlaubte Kante ist erlaubt, jede andere verboten', () => {
  for (const from of STATES) {
    for (const to of STATES) {
      const allowed = (TRANSITIONS[from] ?? []).includes(to);
      assert.equal(canTransition(from, to), allowed, `${from} → ${to}`);
      if (allowed) {
        assert.equal(transition(from, to), to);
      } else {
        assert.throws(() => transition(from, to), (error) => error instanceof PromotionError, `${from} → ${to} wurde erlaubt`);
      }
    }
  }
});

test('promotion: unbekannte Zustände sind Fehler, keine neuen Zustände', () => {
  assert.throws(() => transition('READY', 'SHIPPED'), (error) => error instanceof PromotionError);
  assert.throws(() => transition('ERFUNDEN', 'READY'), (error) => error instanceof PromotionError);
});

test('promotion: ohne Promotion kein Rollback, und nach dem Rollback kein Direktsprung', () => {
  assert.equal(canTransition('READY', 'ROLLED_BACK'), false, 'ohne Promotion gibt es nichts zurückzurollen');
  assert.equal(canTransition('PROMOTED', 'CHECKING'), false, 'erst zurückrollen, dann neu prüfen');
  assert.equal(canTransition('ROLLED_BACK', 'CHECKING'), true);
});

// ── 2. Evidenz → Zustand ────────────────────────────────────────────────────

test('promotion: alles grün am aktuellen SHA ergibt READY', () => {
  const result = assess(green());
  assert.equal(result.state, 'READY');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.promotable, true);
});

test('promotion: ein Status für einen anderen SHA ist BLOCKED, nicht grün', () => {
  const stale = green({
    gateEvidence: [
      { stage: 'commit-guard', sha: OLD, conclusion: 'success' },
      { stage: 'gate-rules', sha: HEAD, conclusion: 'success' },
    ],
  });
  const result = assess(stale);
  assert.equal(result.state, 'BLOCKED');
  assert.deepEqual(result.blockers, [{ code: 'STAGE_STALE', stage: 'commit-guard' }]);
  assert.equal(result.promotable, false);
});

test('promotion: fehlende, rote, abgebrochene und übersprungene Stages sind BLOCKED', () => {
  const cases = [
    [{ stage: 'commit-guard', sha: HEAD, conclusion: 'failure' }, 'STAGE_FAILED'],
    [{ stage: 'commit-guard', sha: HEAD, conclusion: 'cancelled' }, 'STAGE_CANCELLED'],
    [{ stage: 'commit-guard', sha: HEAD, conclusion: 'skipped' }, 'STAGE_SKIPPED'],
  ];
  for (const [entry, code] of cases) {
    const result = assess(green({ gateEvidence: [entry, green().gateEvidence[1]] }));
    assert.equal(result.state, 'BLOCKED', code);
    assert.deepEqual(result.blockers, [{ code, stage: 'commit-guard' }]);
  }

  const missing = assess(green({ gateEvidence: [green().gateEvidence[1]] }));
  assert.equal(missing.state, 'BLOCKED');
  assert.deepEqual(missing.blockers, [{ code: 'STAGE_MISSING', stage: 'commit-guard' }]);
});

test('promotion: nur offene Stages ergeben CHECKING, nicht READY', () => {
  const pending = assess(
    green({
      gateEvidence: [
        { stage: 'commit-guard', sha: HEAD, conclusion: 'success' },
        { stage: 'gate-rules', sha: HEAD, conclusion: 'pending' },
      ],
    }),
  );
  assert.equal(pending.state, 'CHECKING');
  assert.deepEqual(pending.blockers, [{ code: 'STAGE_PENDING', stage: 'gate-rules' }]);
});

test('promotion: Review muss zum aktuellen SHA gehören und darf nicht ablehnen', () => {
  const missing = assess(green({ reviews: [] }));
  assert.equal(missing.state, 'BLOCKED');
  assert.deepEqual(missing.blockers, [{ code: 'REVIEW_MISSING' }]);

  const stale = assess(green({ reviews: [{ sha: OLD, state: 'APPROVED' }] }));
  assert.equal(stale.state, 'BLOCKED');
  assert.deepEqual(stale.blockers, [{ code: 'REVIEW_STALE' }]);

  const rejected = assess(green({ reviews: [{ sha: HEAD, state: 'CHANGES_REQUESTED' }] }));
  assert.equal(rejected.state, 'BLOCKED');
  assert.deepEqual(rejected.blockers, [{ code: 'CHANGES_REQUESTED' }]);
});

test('promotion: unbekannter SHA, leere Stages, kein Basisbranch und leerer Diff sind BLOCKED', () => {
  assert.deepEqual(assess(green({ headSha: 'nicht-hex' })).blockers[0], { code: 'SHA_UNKNOWN' });
  assert.ok(assess(green({ requiredStages: [] })).blockers.some((blocker) => blocker.code === 'STAGES_UNDEFINED'));
  assert.ok(assess(green({ baseBranch: '' })).blockers.some((blocker) => blocker.code === 'BASE_UNKNOWN'));
  assert.deepEqual(assess(green({ diffScope: { files: [] } })).blockers, [{ code: 'NO_DIFF' }]);
  assert.ok(assess(green({ diffScope: null })).blockers.some((blocker) => blocker.code === 'DIFF_UNKNOWN'));
});

// ── 3. Adapter ──────────────────────────────────────────────────────────────

/** Ein Adapter, der jede Schreibaktion mitschreibt. */
function adapter(overrides = {}) {
  const calls = { promote: 0, dryRun: 0 };
  return {
    calls,
    permissions: ['pull_requests:write'],
    promote({ sha }) {
      calls.promote += 1;
      return { sha };
    },
    dryRun() {
      calls.dryRun += 1;
      return { wouldPromote: true };
    },
    ...overrides,
  };
}

test('promotion: ein Dry-Run ruft promote nie auf', () => {
  const fake = adapter();
  const result = runPromotion({ assessment: assess(green()), adapter: fake, dryRun: true });
  assert.equal(result.status, 'READY');
  assert.equal(result.promoted, false);
  assert.equal(result.dryRun, true);
  assert.equal(fake.calls.promote, 0, 'ein Dry-Run hat geschrieben');
  assert.equal(fake.calls.dryRun, 1);
});

test('promotion: nicht READY heißt kein Schreibaufruf, kein stiller Erfolg', () => {
  for (const evidence of [
    green({ reviews: [] }),
    green({ gateEvidence: [{ stage: 'commit-guard', sha: HEAD, conclusion: 'pending' }, green().gateEvidence[1]] }),
  ]) {
    const fake = adapter();
    const result = runPromotion({ assessment: assess(evidence), adapter: fake });
    assert.notEqual(result.status, 'PROMOTED');
    assert.equal(fake.calls.promote, 0);
  }
});

test('promotion: ohne Schreibrecht oder mit Überprivilegierung wird nicht promoviert', () => {
  for (const permissions of [['contents:read'], ['pull_requests:write', 'contents:write'], ['*'], []]) {
    const fake = adapter({ permissions });
    const result = runPromotion({ assessment: assess(green()), adapter: fake });
    assert.equal(result.status, 'BLOCKED', JSON.stringify(permissions));
    assert.equal(fake.calls.promote, 0);
  }
  assert.deepEqual(adapterIssues(adapter({ permissions: ['*'] })).map((issue) => issue.code), [
    'ADAPTER_WILDCARD',
    'ADAPTER_OVERPRIVILEGED',
    'ADAPTER_NO_WRITE',
  ]);
  assert.deepEqual(adapterIssues({ permissions: ['pull_requests:write'] }).map((issue) => issue.code), ['ADAPTER_NO_PROMOTE']);
});

test('promotion: Adapterfehler werden FAILED, ein fremder SHA ist kein Erfolg', () => {
  const failing = adapter({ promote() { throw new Error('422 Unprocessable'); } });
  const failed = runPromotion({ assessment: assess(green()), adapter: failing });
  assert.equal(failed.status, 'FAILED');
  assert.match(failed.reasons[0].message, /422/);

  const wrong = adapter({ promote: () => ({ sha: OLD }) });
  const mismatch = runPromotion({ assessment: assess(green()), adapter: wrong });
  assert.equal(mismatch.status, 'FAILED');
  assert.deepEqual(mismatch.reasons, [{ code: 'PROMOTION_SHA_MISMATCH', expected: HEAD, actual: OLD }]);
});

test('promotion: der erfolgreiche Lauf nennt genau den geprüften SHA', () => {
  const fake = adapter();
  const result = runPromotion({ assessment: assess(green()), adapter: fake });
  assert.equal(result.status, 'PROMOTED');
  assert.equal(result.promoted, true);
  assert.equal(result.sha, HEAD);
  assert.equal(fake.calls.promote, 1);
});
