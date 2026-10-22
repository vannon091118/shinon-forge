#!/usr/bin/env node
/**
 * scripts/gate/tests/package-edges.test.mjs — Pakete bleiben eigene Welten.
 *
 * Warum diese Datei existiert: `AGENTS.md` sagt „Pakete referenzieren einander
 * nicht — mit EINER Ausnahme: `@shinon/seams`". Der Riegel dafür war eine
 * Konvention, kein Befund: `repo.dependencyIssues()` kannte nur „Ziel fehlt im
 * Baum" und Zyklen, eine Kante `popup → @shinon/persona` wäre also still grün
 * geblieben. Diese Datei prüft den echten Baum und drei Mutationen, damit die
 * Regel an einer Zeile hängt und nicht an gutem Willen.
 *
 * Kein node_modules, kein DSH: `dependencyIssues` liest nur Manifest-Objekte,
 * die der Test selbst baut (der Echtbaum wird einmal über `discover()` gelesen).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as repo from '../../lib/repo.mjs';

/** Ein Paket, wie `discover()` es liefert — nur die Felder, die der Riegel liest. */
const pkg = (dir, dependencies = {}, peerDependencies = {}) => ({
  dir,
  manifest: { dependencies, peerDependencies },
  want: { name: `@shinon/${dir}` },
});

test('der echte Baum hat außer @shinon/seams keine Paket-Kante', () => {
  assert.deepEqual(repo.dependencyIssues(repo.discover()), []);
});

test('eine Kante auf ein anderes Paket ist ein Befund, nicht eine Konvention', () => {
  const packages = [
    pkg('popup', { '@shinon/persona': 'workspace:*' }),
    pkg('persona'),
  ];
  const issues = repo.dependencyIssues(packages, '@shinon');
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^popup: dependencies\["@shinon\/persona"\]/);
  assert.match(issues[0], /Ausnahme: @shinon\/seams/);
});

test('die eine Ausnahme bleibt erlaubt — in dependencies und peerDependencies', () => {
  const packages = [
    pkg('core', { '@shinon/seams': 'workspace:*' }, { '@shinon/seams': 'workspace:*' }),
    pkg('seams'),
  ];
  assert.deepEqual(repo.dependencyIssues(packages, '@shinon'), []);
});

test('ein fremdes Ziel bleibt der bestehende Befund, kein zweiter', () => {
  const packages = [pkg('core', { '@shinon/does-not-exist': 'workspace:*' })];
  const issues = repo.dependencyIssues(packages, '@shinon');
  assert.equal(issues.length, 1);
  assert.match(issues[0], /kein Paket unter packages\//);
});
