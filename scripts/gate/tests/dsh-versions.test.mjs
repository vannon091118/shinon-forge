/**
 * dsh-versions.test.mjs — die Sollquelle und ihr Prüfer.
 *
 * Geprüft wird jeder Weg, auf dem eine Fassung falsch sein kann: Matrix,
 * Manifest (exakt vs. Range), Peer-Bereich, Lock (auch verschachtelt),
 * Vendor-Metadaten, Installat, CLI und ein zweiter Versionsliteral im
 * Quelltext. Jeder Fall baut seinen eigenen Baum unter tmpdir — der echte
 * Repo-Baum wird nicht angefasst und keine Registry befragt.
 * → Kanon: docs/COMMENT-KANON.md#k-dsh-versions-test
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MATRIX_FILE,
  TARGET_PACKAGES,
  checkVersions,
  compareSemver,
  loadMatrix,
  satisfiesRange,
} from '../../lib/dsh-versions.mjs';
import { targetDshVersion } from '../../dsh-update.mjs';

const DSH = '9.9.9';
const SCHM = '4.4.4';
const STORAGE = '9.9.9';
const STORAGE_JSON = '9.9.9';
const TYPERT = '9.9.9';
const INTEGRITY = 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

const write = (root, rel, value) => {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
};

const lockEntry = (pkg, version, integrity = INTEGRITY) => ({
  version,
  resolved: `https://registry.npmjs.org/${pkg}/-/${pkg.split('/')[1]}-${version}.tgz`,
  integrity,
});

/** Ein vollständig grüner Baum; jeder Test verbiegt genau eine Stelle. */
function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-versions-'));
  write(root, MATRIX_FILE, {
    '@deepseek-ai/dsh': DSH,
    '@deepseek-ai/schemastery': SCHM,
    '@deepseek-ai/dsh-storage-domain': STORAGE,
    '@deepseek-ai/dsh-storage-json': STORAGE_JSON,
    '@deepseek-ai/dsh-typert-protocol': TYPERT,
    ...overrides.matrix,
  });
  write(root, 'package.json', {
    name: 'fixture',
    workspaces: ['packages/*'],
    dependencies: { '@deepseek-ai/dsh': DSH, '@deepseek-ai/schemastery': SCHM },
  });
  write(root, 'package-lock.json', {
    name: 'fixture',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture' },
      'node_modules/@deepseek-ai/dsh': lockEntry('@deepseek-ai/dsh', DSH),
      'node_modules/@deepseek-ai/schemastery': lockEntry('@deepseek-ai/schemastery', SCHM),
      'node_modules/@deepseek-ai/dsh-storage-domain': lockEntry('@deepseek-ai/dsh-storage-domain', STORAGE),
      'node_modules/@deepseek-ai/dsh-storage-json': lockEntry('@deepseek-ai/dsh-storage-json', STORAGE_JSON),
      'node_modules/@deepseek-ai/dsh-typert-protocol': lockEntry('@deepseek-ai/dsh-typert-protocol', TYPERT),
    },
  });
  write(root, 'vendor/dsh/MANIFEST.json', {
    package: '@deepseek-ai/dsh',
    version: DSH,
    source: {
      tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${DSH}.tgz`,
      integrity: INTEGRITY,
    },
  });
  write(root, 'vendor/dsh/package.json', { name: '@deepseek-ai/dsh', version: DSH });
  for (const pkg of TARGET_PACKAGES) {
    const version = pkg === '@deepseek-ai/schemastery' ? SCHM : DSH;
    write(root, `node_modules/${pkg}/package.json`, { name: pkg, version });
  }
  write(root, 'packages/one/package.json', {
    name: '@fixture/one',
    peerDependencies: { '@deepseek-ai/schemastery': '~4.4.4-alpha.1' },
    devDependencies: { '@deepseek-ai/schemastery': SCHM },
  });
  write(root, 'scripts/tool.mjs', 'export const nothing = 1;\n');
  return { root, overrides };
}

const runtime = { cli: DSH, packages: { '@deepseek-ai/dsh': DSH, '@deepseek-ai/schemastery': SCHM, '@deepseek-ai/dsh-storage-domain': STORAGE, '@deepseek-ai/dsh-storage-json': STORAGE_JSON, '@deepseek-ai/dsh-typert-protocol': TYPERT } };

const run = (root, options = {}) => checkVersions(root, { runtime, ...options });
const codes = (result) => result.issues.map((found) => found.code);

test('satisfiesRange: die Range-Formen, die im Repo vorkommen', () => {
  assert.equal(satisfiesRange('4.4.4', '4.4.4'), true);
  assert.equal(satisfiesRange('4.4.4', '4.4.5'), false);
  assert.equal(satisfiesRange('~4.4.4-alpha.1', '4.4.4'), true, 'die Vorab-Range muss die Release-Fassung einschließen');
  assert.equal(satisfiesRange('~4.4.4-alpha.1', '4.4.9'), true);
  assert.equal(satisfiesRange('~4.4.4-alpha.1', '4.5.0'), false);
  assert.equal(satisfiesRange('^4.4.4', '4.9.0'), true);
  assert.equal(satisfiesRange('^4.4.4', '5.0.0'), false);
  assert.equal(satisfiesRange('^0.2.3', '0.2.9'), true);
  assert.equal(satisfiesRange('^0.2.3', '0.3.0'), false);
  assert.equal(satisfiesRange('>=4.4.4 <4.5.0', '4.4.9'), true);
  assert.equal(satisfiesRange('>=4.4.4 <4.5.0', '4.5.0'), false);
  assert.equal(satisfiesRange('^4.0.0 || ^5.0.0', '5.1.0'), true);
  assert.equal(satisfiesRange('~4.5.0', '4.5.0-alpha.1'), false, 'eine Vorabfassung erfüllt nur eine Vorab-Range desselben Kerns');
  assert.equal(satisfiesRange('~4.5.0-alpha.1', '4.5.0-alpha.2'), true);
  assert.equal(compareSemver('4.4.4-alpha.1', '4.4.4'), -1);
  assert.equal(compareSemver('4.4.4', '4.4.4'), 0);
});

test('grüner Baum: keine Befunde, Matrix gelesen', () => {
  const { root } = fixture();
  const result = run(root);
  assert.deepEqual(result.issues, [], `unerwartete Befunde: ${JSON.stringify(result.issues)}`);
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets, {
    '@deepseek-ai/dsh': DSH,
    '@deepseek-ai/schemastery': SCHM,
    '@deepseek-ai/dsh-storage-domain': STORAGE,
    '@deepseek-ai/dsh-storage-json': STORAGE_JSON,
    '@deepseek-ai/dsh-typert-protocol': TYPERT,
  });
  assert.ok(result.checks.lockEntries >= 5);
});

test('Matrix: fehlender Eintrag, Range statt Fassung, unbekanntes Paket', () => {
  const missing = fixture({ matrix: { '@deepseek-ai/dsh': undefined } });
  assert.ok(codes(loadMatrix(missing.root)).includes('MATRIX_ENTRY_MISSING'));
  const range = fixture({ matrix: { '@deepseek-ai/schemastery': '~4.4.4' } });
  assert.ok(codes(loadMatrix(range.root)).includes('MATRIX_ENTRY_INVALID'));
  const unknown = fixture({ matrix: { '@deepseek-ai/dsh-extra': DSH } });
  assert.deepEqual(codes(loadMatrix(unknown.root)), ['MATRIX_ENTRY_UNKNOWN']);
  assert.equal(loadMatrix(missing.root).targets['@deepseek-ai/dsh'], undefined);
});

test('Manifest: Range statt exakter Fassung und falsche exakte Fassung', () => {
  const ranged = fixture();
  const pkg = JSON.parse(readFileSync(join(ranged.root, 'package.json'), 'utf8'));
  pkg.dependencies['@deepseek-ai/schemastery'] = '~4.4.4-alpha.1';
  write(ranged.root, 'package.json', pkg);
  const result = run(ranged.root);
  assert.deepEqual(codes(result), ['DECLARED_NOT_EXACT']);
  assert.equal(result.issues[0].where, 'package.json dependencies');
  assert.equal(result.issues[0].expected, SCHM);
  assert.equal(result.issues[0].actual, '~4.4.4-alpha.1');

  const wrong = fixture();
  const other = JSON.parse(readFileSync(join(wrong.root, 'packages/one/package.json'), 'utf8'));
  other.devDependencies['@deepseek-ai/schemastery'] = '4.4.3';
  write(wrong.root, 'packages/one/package.json', other);
  const found = run(wrong.root);
  assert.deepEqual(codes(found), ['DECLARED_MISMATCH']);
  assert.equal(found.issues[0].where, 'packages/one/package.json devDependencies');
});

test('engines.dsh: ein Bereich, der die Sollfassung ausschließt, verhindert das Laden', () => {
  const { root } = fixture();
  const manifest = JSON.parse(readFileSync(join(root, 'packages/one/package.json'), 'utf8'));
  manifest.engines = { dsh: '>=99.0.0' };
  write(root, 'packages/one/package.json', manifest);
  const result = run(root);
  assert.deepEqual(codes(result), ['ENGINES_INCOMPATIBLE']);
  assert.equal(result.issues[0].expected, DSH);
  assert.equal(result.issues[0].actual, '>=99.0.0');
});

test('Peer-Bereich: eine Range, die die Sollfassung ausschließt, ist ein Fehler', () => {
  const { root } = fixture();
  write(root, 'packages/one/package.json', {
    name: '@fixture/one',
    peerDependencies: { '@deepseek-ai/schemastery': '~3.0.0' },
    devDependencies: { '@deepseek-ai/schemastery': SCHM },
  });
  const result = run(root);
  assert.deepEqual(codes(result), ['PEER_INCOMPATIBLE']);
  assert.equal(result.issues[0].expected, SCHM);
  assert.equal(result.issues[0].actual, '~3.0.0');
});

test('Lock: falsche Fassung, verschachtelter Eintrag, fehlender Eintrag, falscher Tarball', () => {
  const drift = fixture();
  const lock = JSON.parse(readFileSync(join(drift.root, 'package-lock.json'), 'utf8'));
  lock.packages['node_modules/@deepseek-ai/dsh'] = lockEntry('@deepseek-ai/dsh', '9.9.8');
  write(drift.root, 'package-lock.json', lock);
  assert.deepEqual(codes(run(drift.root)), ['LOCK_MISMATCH']);

  const nested = fixture();
  const nestedLock = JSON.parse(readFileSync(join(nested.root, 'package-lock.json'), 'utf8'));
  nestedLock.packages['node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-typert-protocol'] =
    lockEntry('@deepseek-ai/dsh-typert-protocol', '9.9.8');
  write(nested.root, 'package-lock.json', nestedLock);
  const nestedResult = run(nested.root);
  assert.deepEqual(codes(nestedResult), ['LOCK_MISMATCH']);
  assert.match(nestedResult.issues[0].where, /node_modules\/@deepseek-ai\/dsh\/node_modules/);

  const missing = fixture();
  const missingLock = JSON.parse(readFileSync(join(missing.root, 'package-lock.json'), 'utf8'));
  delete missingLock.packages['node_modules/@deepseek-ai/dsh-storage-domain'];
  write(missing.root, 'package-lock.json', missingLock);
  assert.ok(codes(run(missing.root)).includes('LOCK_ENTRY_MISSING'));

  const tarball = fixture();
  const tarballLock = JSON.parse(readFileSync(join(tarball.root, 'package-lock.json'), 'utf8'));
  tarballLock.packages['node_modules/@deepseek-ai/schemastery'].resolved = 'https://example.test/falsch.tgz';
  write(tarball.root, 'package-lock.json', tarballLock);
  assert.deepEqual(codes(run(tarball.root)), ['LOCK_TARBALL']);
});

test('Vendor: Fassung, Paketmanifest, Tarball-URL und Integrität', () => {
  const version = fixture();
  write(version.root, 'vendor/dsh/MANIFEST.json', {
    package: '@deepseek-ai/dsh',
    version: '9.9.8',
    source: { tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${DSH}.tgz`, integrity: INTEGRITY },
  });
  assert.deepEqual(codes(run(version.root)), ['VENDOR_VERSION_MISMATCH']);

  const packageFile = fixture();
  write(packageFile.root, 'vendor/dsh/package.json', { name: '@deepseek-ai/dsh', version: '9.9.8' });
  assert.deepEqual(codes(run(packageFile.root)), ['VENDOR_PACKAGE_MISMATCH']);

  const url = fixture();
  write(url.root, 'vendor/dsh/MANIFEST.json', {
    package: '@deepseek-ai/dsh',
    version: DSH,
    source: { tarball: 'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-9.9.8.tgz', integrity: INTEGRITY },
  });
  assert.deepEqual(codes(run(url.root)), ['VENDOR_TARBALL_MISMATCH']);

  const integrity = fixture();
  write(integrity.root, 'vendor/dsh/MANIFEST.json', {
    package: '@deepseek-ai/dsh',
    version: DSH,
    source: { tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${DSH}.tgz`, integrity: 'sha512-BBBB' },
  });
  assert.deepEqual(codes(run(integrity.root)), ['VENDOR_INTEGRITY_MISMATCH']);

  const missing = fixture();
  write(missing.root, 'vendor/dsh/MANIFEST.json', '{ kaputt');
  const result = checkVersions(missing.root, { runtime, skipSourceScan: true });
  assert.deepEqual(codes(result), ['VENDOR_UNREADABLE'], 'ein unlesbares Manifest ist ein Befund, kein Absturz');
});

test('Laufzeit: falsche installierte Fassung, fehlendes Paket, CLI-Drift, CLI nicht messbar', () => {
  const { root } = fixture();
  const installed = { ...runtime, packages: { ...runtime.packages, '@deepseek-ai/dsh': '9.9.8' } };
  assert.deepEqual(codes(checkVersions(root, { runtime: installed })), ['INSTALLED_MISMATCH']);

  const absent = { ...runtime, packages: { ...runtime.packages, '@deepseek-ai/dsh-typert-protocol': null } };
  assert.deepEqual(codes(checkVersions(root, { runtime: absent })), ['INSTALLED_MISSING']);

  const cliDrift = { ...runtime, cli: '9.9.8' };
  assert.deepEqual(codes(checkVersions(root, { runtime: cliDrift })), ['CLI_MISMATCH']);

  const cliGone = { ...runtime, cli: null };
  assert.deepEqual(codes(checkVersions(root, { runtime: cliGone })), ['CLI_UNVERIFIED']);
});

test('Quelltext: ein zweiter Versionsliteral ist ein Befund mit Fundstelle', () => {
  const { root } = fixture();
  write(root, 'scripts/tool.mjs', `export const VERIFIED_DSH_VERSION = '${DSH}';\n`);
  write(root, 'bin/start.mjs', 'export const ok = 1;\n');
  const result = run(root);
  assert.deepEqual(new Set(codes(result)), new Set(['TARGET_LITERAL_IN_SOURCE']));
  assert.deepEqual(
    result.issues.map((found) => found.where),
    ['scripts/tool.mjs:1', 'scripts/tool.mjs:1', 'scripts/tool.mjs:1', 'scripts/tool.mjs:1'],
    'jedes Zielpaket mit derselben Fassung meldet die Zeile einmal',
  );
  assert.deepEqual(
    result.issues.map((found) => found.package).sort(),
    ['@deepseek-ai/dsh', '@deepseek-ai/dsh-storage-domain', '@deepseek-ai/dsh-storage-json', '@deepseek-ai/dsh-typert-protocol'],
  );
  assert.equal(result.issues[0].actual, DSH);
  assert.equal(result.issues[0].expected, 'aus der Matrix gelesen');
});

test('jeder Befund nennt Code, Fundstelle, Soll, Ist und Grund', () => {
  const { root } = fixture();
  write(root, 'package.json', { dependencies: { '@deepseek-ai/dsh': '9.9.8' } });
  const result = run(root);
  assert.equal(result.ok, false);
  for (const found of result.issues) {
    assert.equal(typeof found.code, 'string');
    assert.equal(typeof found.where, 'string');
    assert.equal(typeof found.message, 'string');
    assert.ok('expected' in found && 'actual' in found);
  }
});

test('Updater: die Sollfassung kommt aus der Matrix, nicht aus einer Registry', () => {
  const { root } = fixture();
  assert.equal(targetDshVersion(root), DSH);
  write(root, MATRIX_FILE, { '@deepseek-ai/dsh': 'latest' });
  assert.throws(() => targetDshVersion(root), /Sollquelle .* ist ungültig/);
});

test('die echte Sollquelle des Repos hat genau die fünf Zielpakete', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const { targets, issues } = loadMatrix(root);
  assert.deepEqual(issues, []);
  assert.deepEqual(Object.keys(targets).sort(), [...TARGET_PACKAGES].sort());
});
