#!/usr/bin/env node
/**
 * Regressionstest: ein Branch auf exakt origin/main ist ein leerer Diff.
 * Ein unbekannter Bereich bleibt dagegen fail-closed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCiRange } from '../../lib/ci-range.mjs';

test('ci-range: identischer Branch-Tip und origin/main ergeben einen leeren Diff', () => {
  const tip = '1fd90f9c85b247d41e6299ca3c9f251a759e556f';
  const git = (args) => {
    if (args[0] === 'rev-parse') return `${tip}\n`;
    if (args[0] === 'merge-base') return `${tip}\n`;
    throw new Error(`unerwarteter Git-Aufruf: ${args.join(' ')}`);
  };

  const result = resolveCiRange({ GITHUB_EVENT_NAME: 'push', GITHUB_SHA: tip }, git);

  assert.equal(result.range, `${tip}..${tip}`);
  assert.match(result.why, /keine neuen Commits/);
});
