/**
 * profile-install.test.mjs — die installierte Profil-Ebene und der Config-Vertrag.
 *
 * Warum es diesen Test gibt (gemessen 2026-10-17): ein Link unter
 * `profiles/shinon/node_modules/@shinon/traceability` zeigte aus `packages/`
 * heraus auf einen externen Prototyp; geladen wurde fremder Code, und der Boot
 * starb an `Config = {}` mit `Cannot read properties of undefined (reading
 * 'validate')`. Beide Zusagen werden hier an einem Miniatur-Baum geprüft —
 * nicht an der Installation dieses Rechners:
 *
 *   1. Jeder `@shinon/*`-Eintrag im Profil löst innerhalb von `packages/` auf;
 *      ein toter oder fremder Link ist ein benannter Befund, ein FEHLENDES
 *      `node_modules` dagegen nicht (ein frischer Klon hat keins).
 *   2. pnpm-Reste (`.pnpm`, `.modules.yaml`, `.pnpm-workspace-state-v1.json`)
 *      sind ein Befund — dieses Repo installiert mit npm.
 *   3. `Config` muss `~standard.validate` als Funktion tragen; ein blosses
 *      `Config = {}` wird abgelehnt, bevor es einen Boot erreicht.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { configShapeIssues, profileInstallIssues } from '../../lib/repo.mjs';

/** Ein Miniatur-Baum mit packages/<pkg> und profiles/<name>/node_modules. */
function fixtureTree() {
  const root = mkdtempSync(join(tmpdir(), 'shinon-profile-'));
  const packages = join(root, 'packages');
  const profileModules = join(root, 'profiles', 'shinon', 'node_modules');
  mkdirSync(join(packages, 'persona'), { recursive: true });
  mkdirSync(join(profileModules, '@shinon'), { recursive: true });
  return { root, packages, profileModules, manifest: { name: '@shinon/forge' } };
}

const cleanup = (tree) => rmSync(tree.root, { recursive: true, force: true });

test('Profil-Installation: ein Link innerhalb von packages/ ist sauber', () => {
  const tree = fixtureTree();
  try {
    symlinkSync(join(tree.packages, 'persona'), join(tree.profileModules, '@shinon', 'persona'));
    assert.deepEqual(profileInstallIssues(tree.manifest, { packagesDir: tree.packages, profilesDir: join(tree.root, 'profiles') }), []);
  } finally {
    cleanup(tree);
  }
});

test('Profil-Installation: ein Link aus packages/ heraus wird benannt', () => {
  const tree = fixtureTree();
  try {
    const outside = join(tree.root, 'fremd');
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(tree.profileModules, '@shinon', 'persona'));
    const issues = profileInstallIssues(tree.manifest, { packagesDir: tree.packages, profilesDir: join(tree.root, 'profiles') });
    assert.equal(issues.length, 1, issues.join('\n'));
    assert.match(issues[0], /zeigt aus packages\/ heraus/);
    assert.match(issues[0], /profile:links/);
  } finally {
    cleanup(tree);
  }
});

test('Profil-Installation: ein toter Link ist ein Befund, kein stilles Überspringen', () => {
  const tree = fixtureTree();
  try {
    symlinkSync(join(tree.packages, 'gibt-es-nicht'), join(tree.profileModules, '@shinon', 'persona'));
    const issues = profileInstallIssues(tree.manifest, { packagesDir: tree.packages, profilesDir: join(tree.root, 'profiles') });
    assert.equal(issues.length, 1, issues.join('\n'));
    assert.match(issues[0], /toter Link/);
  } finally {
    cleanup(tree);
  }
});

test('Profil-Installation: pnpm-Reste werden gemeldet, ein fehlendes node_modules nicht', () => {
  const tree = fixtureTree();
  try {
    mkdirSync(join(tree.profileModules, '.pnpm'));
    writeFileSync(join(tree.profileModules, '.modules.yaml'), '');
    writeFileSync(join(tree.profileModules, '.pnpm-workspace-state-v1.json'), '{}');
    const issues = profileInstallIssues(tree.manifest, { packagesDir: tree.packages, profilesDir: join(tree.root, 'profiles') });
    assert.equal(issues.length, 3, issues.join('\n'));
    assert.ok(issues.every((issue) => issue.includes('pnpm-Rest')), issues.join('\n'));

    // Frischer Klon: kein profiles/<name>/node_modules ⇒ kein Befund.
    rmSync(join(tree.root, 'profiles', 'shinon', 'node_modules'), { recursive: true, force: true });
    assert.deepEqual(profileInstallIssues(tree.manifest, { packagesDir: tree.packages, profilesDir: join(tree.root, 'profiles') }), []);
  } finally {
    cleanup(tree);
  }
});

test('Config-Vertrag: ~standard.validate ist Pflicht, ein leeres Objekt fällt durch', async () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-config-'));
  try {
    const good = join(root, 'gut');
    const bad = join(root, 'schlecht');
    mkdirSync(good, { recursive: true });
    mkdirSync(bad, { recursive: true });
    writeFileSync(join(good, 'index.js'), "export const Config = { '~standard': { validate: () => ({ value: {} }) } };\n");
    writeFileSync(join(bad, 'index.js'), 'export const Config = {};\n');
    const issues = await configShapeIssues([
      { dir: 'gut', base: good },
      { dir: 'schlecht', base: bad },
      { dir: 'ohne-config', base: join(root, 'nirgends') },
    ]);
    assert.equal(issues.length, 1, issues.join('\n'));
    assert.match(issues[0], /^schlecht: Config ist kein Schemastery-Schema/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Config-Vertrag: die echten Host-Hälften dieses Repos bestehen die Prüfung', async () => {
  // Der einzige Test, der die echte Installation liest — und damit die
  // Regression stellt, die der Fremd-Link ausgelöst hat.
  const { discover } = await import('../../lib/repo.mjs');
  const issues = await configShapeIssues(discover());
  assert.deepEqual(issues, []);
});
