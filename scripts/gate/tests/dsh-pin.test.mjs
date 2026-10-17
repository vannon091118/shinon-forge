/**
 * dsh-pin.test.mjs — vier Quellen, EINE DSH-Fassung.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17, Punkt A4 der Release-Abnahme):
 * Root-Pin und Lockfile nannten `0.2.1-alpha.1`, genau diese Fassung lud auch die
 * Laufzeit — und `vendor/dsh` stand mit `0.2.1-alpha.2` daneben. Vier Stellen, zwei
 * Meinungen: wer die Fassung ändert, musste sie an vier Orten ändern und erfuhr
 * nirgends, wenn er es an einem vergaß. Ein Beleg, der nicht stimmen *kann*, ist
 * → Kanon: docs/COMMENT-KANON.md#k-c52bbfb3e3dc
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'));
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const manifest = readJson('vendor/dsh/MANIFEST.json');
const vendored = readJson('vendor/dsh/package.json');

const pin = pkg.dependencies?.['@deepseek-ai/dsh'];
const locked = lock.packages?.['node_modules/@deepseek-ai/dsh'];

test('dsh-pin: der Root-Pin ist gesetzt, und das Lock trägt genau ihn', () => {
  assert.equal(typeof pin, 'string', 'package.json dependencies["@deepseek-ai/dsh"] fehlt');
  assert.match(pin, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, `kein gültiger Pin: ${pin}`);
  assert.ok(locked, 'package-lock.json hat keinen Eintrag node_modules/@deepseek-ai/dsh');
  assert.equal(locked.version, pin, `Lock (${locked.version}) und Pin (${pin}) laufen auseinander`);
  assert.match(
    String(locked.resolved ?? ''),
    new RegExp(`/@deepseek-ai/dsh/-/dsh-${esc(pin)}\\.tgz$`),
    `das Lock zeigt nicht auf den Tarball der Pin-Fassung: ${locked.resolved}`,
  );
});

test('dsh-pin: die vendorte Fassung ist die des Pins — Manifest und Paket', () => {
  assert.equal(manifest.package, '@deepseek-ai/dsh');
  assert.equal(manifest.version, pin, `vendor/dsh/MANIFEST.json nennt ${manifest.version}, der Pin ${pin}`);
  assert.equal(
    vendored.version,
    pin,
    `vendor/dsh/package.json nennt ${vendored.version}, der Pin ${pin} — zwei Fassungen im Weg sind genau das, was A4 verbietet`,
  );
  assert.match(
    String(manifest.source?.tarball ?? ''),
    new RegExp(`/@deepseek-ai/dsh/-/dsh-${esc(pin)}\\.tgz$`),
    `die Tarball-URL im Manifest trägt nicht die Pin-Fassung: ${manifest.source?.tarball}`,
  );
});

test('dsh-pin: die Integrität im Manifest ist die des Locks', () => {
  assert.match(String(locked.integrity ?? ''), /^sha512-[A-Za-z0-9+/]+={0,2}$/, 'das Lock trägt keine sha512-Integrität');
  assert.equal(
    manifest.source?.integrity,
    locked.integrity,
    'Manifest und Lock beschreiben verschiedene Tarballs — dann belegt der Baum eine andere Datei als die installierte',
  );
  assert.match(String(manifest.source?.shasum ?? ''), /^[0-9a-f]{40}$/, 'shasum (sha1) fehlt oder ist keine Hexzahl');
  assert.match(String(manifest.source?.tarballSha256 ?? ''), /^[0-9a-f]{64}$/, 'tarballSha256 fehlt oder ist keine Hexzahl');
  assert.equal(manifest.source?.fileCount, manifest.files.length, 'fileCount im Manifest zählt eine andere Dateiliste');
});

test('dsh-pin: jede vendorte Datei ist die des Manifests — keine fehlt, keine ist übrig', () => {
  const root = join(REPO, 'vendor', 'dsh');
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (relative(root, full) !== 'MANIFEST.json') found.push(relative(root, full).split('\\').join('/'));
    }
  };
  walk(root);

  const claimed = manifest.files.map((file) => file.path);
  assert.deepEqual(
    [...found].sort(),
    [...claimed].sort(),
    'die vendorte Dateiliste und die des Manifests laufen auseinander (fehlt eine Datei oder liegt eine da, die niemand belegt?)',
  );

  const wrong = [];
  for (const file of manifest.files) {
    const bytes = readFileSync(join(root, file.path));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== file.sha256) wrong.push(`${file.path}: sha256 ${sha256} statt ${file.sha256}`);
    else if (bytes.length !== file.bytes) wrong.push(`${file.path}: ${bytes.length} Bytes statt ${file.bytes}`);
  }
  assert.deepEqual(wrong, [], 'eine vendorte Datei weicht von ihrem Beleg ab — der Baum ist nicht mehr byte-identisch');
});
