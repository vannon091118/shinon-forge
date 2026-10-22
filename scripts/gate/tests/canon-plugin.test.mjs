#!/usr/bin/env node
/**
 * scripts/gate/tests/canon-plugin.test.mjs — der Kanon in der modularen Engine.
 *
 * Der Kanon wurde bisher nur im statischen Gate geprüft; `gate:full` hätte ein
 * unregistriertes Global also nicht gesehen. Der Test belegt beide Seiten:
 *
 *   1. Der ECHTE Baum besteht das Plugin — derselbe Befund wie im statischen
 *      Gate, weil beide `canonIssues` lesen.
 *   2. Ohne Registry ist das Plugin rot und nennt die fehlende Datei. Es gibt
 *      keinen stillen Rückfall auf „grün, weil nichts zu prüfen war".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { check } from '../plugins/canon.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

test('das Plugin liest dieselbe Registry und ist am echten Baum grün', () => {
  assert.deepEqual(check({ repo: { ROOT } }), []);
});

test('ohne docs/contracts/canon.json ist der Befund benannt, nicht still', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-canon-'));
  try {
    const issues = check({ repo: { ROOT: root } });
    assert.equal(issues.length, 1);
    assert.match(issues[0], /docs\/contracts\/canon\.json fehlt oder parst nicht/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
