#!/usr/bin/env node
/**
 * profile-foreign.test.mjs — fremde Bundles im Profil (repo.mjs, foreignBundleTarget).
 *
 * Die Regel: ein `@shinon/*`-Name ist NICHT automatisch lokal. Entscheidend ist das
 * ZIEL der Profil-Abhaengigkeit — zeigt sie aus `packages/` heraus, ist das Bundle
 * fremd (wie die `@deepseek-ai/*`-Eintraege), und es darf hier fehlen. Drei Dinge
 * werden gezeigt:
 *
 *   1. Die Klassifikation stimmt: lokal (in packages/) → nicht fremd, ausserhalb →
 *      fremd, und ohne Ziel bleibt es fail-closed ein Fehler (Tippfehler-Schutz).
 *   2. Der echte Baum ist damit gruen: das aktive Profil meldet keinen fehlenden
 *      lokalen Bundle mehr, und jedes als fremd gemeldete Ziel liegt wirklich
 *      ausserhalb von packages/.
 *   3. Das Gate-Plugin `registry` wiederholt die Regel (sonst waere der eine Fix
 *      nur die Haelfte).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as repo from '../../lib/repo.mjs';
import * as registry from '../plugins/registry.mjs';

const profileDir = join(repo.PROFILES_DIR, 'shinon');
const manifestOf = (deps) => ({ dependencies: deps });

test('Klassifikation: lokal, fremd, kein Ziel', () => {
  const local = manifestOf({ '@shinon/core': 'link:../../packages/core' });
  assert.equal(repo.foreignBundleTarget('@shinon/core', local, profileDir), null, 'ein Ziel in packages/ ist lokal');

  const inside = manifestOf({ '@shinon/erfunden': 'link:../../packages/erfunden' });
  assert.equal(
    repo.foreignBundleTarget('@shinon/erfunden', inside, profileDir),
    null,
    'ein fehlendes Ziel INNERHALB packages/ bleibt ein Fehler (kein fremdes Bundle)',
  );

  const outside = manifestOf({ '@shinon/draussen': 'link:/tmp/irgendwo/packages/draussen' });
  assert.equal(
    repo.foreignBundleTarget('@shinon/draussen', outside, profileDir),
    '/tmp/irgendwo/packages/draussen',
    'ein absolutes Ziel ausserhalb packages/ ist fremd',
  );

  const escaping = manifestOf({ '@shinon/draussen': 'link:../../werkstatt/draussen' });
  assert.equal(
    repo.foreignBundleTarget('@shinon/draussen', escaping, profileDir),
    join(repo.ROOT, 'werkstatt', 'draussen'),
    'ein relatives Ziel aus dem Repo heraus ist fremd',
  );

  assert.equal(repo.foreignBundleTarget('@shinon/ohne-ziel', manifestOf({}), profileDir), null, 'ohne Ziel: nicht fremd');
  assert.equal(
    repo.foreignBundleTarget('@shinon/version', manifestOf({ '@shinon/version': '^1.0.0' }), profileDir),
    null,
    'eine Versionsangabe ist kein Pfad: nicht fremd',
  );
  assert.equal(repo.foreignBundleTarget('@shinon/x', null, profileDir), null, 'ohne Manifest: nicht fremd');
});

test('Aktives Profil: fremde Bundles sind kein Fehler, bleiben aber sichtbar', () => {
  const name = repo.activeProfile();
  const profile = repo.resolveProfile(name, repo.discover());
  assert.equal(profile.issues.length, 0, `das aktive Profil muss fehlerfrei aufloesen: ${profile.issues.join('; ')}`);

  const entryNames = new Set(profile.entries.map((entry) => entry.name));
  for (const foreign of profile.foreign ?? []) {
    assert.equal(entryNames.has(foreign.name), false, `${foreign.name} ist fremd und darf kein lokaler Eintrag sein`);
    assert.equal(
      foreign.target.startsWith(`${repo.PACKAGES_DIR}/`),
      false,
      `${foreign.name} gilt nur als fremd, wenn sein Ziel aus packages/ herauszeigt (${foreign.target})`,
    );
  }
});

test('registry: ein fremdes Bundle ist nicht "nicht registriert"', () => {
  const name = repo.activeProfile();
  const profile = repo.resolveProfile(name, repo.discover());
  const issues = registry.check({ repo, packages: repo.discover(), root: repo.readRoot() });
  for (const foreign of profile.foreign ?? []) {
    assert.equal(
      issues.some((issue) => issue.includes(`"${foreign.name}"`)),
      false,
      `${foreign.name} steht ausserhalb dieses Repos und wird nicht als fehlend gemeldet`,
    );
  }
  assert.deepEqual(issues, [], `das Registry-Gate muss mit dem aktiven Profil gruen sein: ${issues.join('; ')}`);
});
