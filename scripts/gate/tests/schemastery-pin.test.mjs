/**
 * schemastery-pin.test.mjs — EINE schemastery-Fassung im ganzen Baum.
 *
 * Befund 2026-10-17: Root pinnte `~3.18.4`, der Harness forderte
 * `~3.18.5-alpha.1` — disjunkte Bereiche, also 114 Kopien im Baum. Seit der
 * Sollquelle gilt: direkte Abhängigkeiten EXAKT, Peer-Bereiche als Bereich,
 * der die Sollfassung einschließt, und genau eine Kopie im Lock.
 * → Kanon: docs/COMMENT-KANON.md#k-8e620b2f3713
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadMatrix, satisfiesRange } from '../../lib/dsh-versions.mjs';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const DEP = '@deepseek-ai/schemastery';
const readJson = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'));
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const root = readJson('package.json');
const lock = readJson('package-lock.json');
const target = loadMatrix(REPO).targets[DEP];

/** Alle Paketmanifeste aus dem `workspaces`-Feld — keine zweite Pfadliste. */
function manifestPaths() {
  const found = [];
  for (const pattern of root.workspaces ?? []) {
    if (!String(pattern).endsWith('/*')) {
      found.push(String(pattern));
      continue;
    }
    const base = String(pattern).slice(0, -2);
    if (!existsSync(join(REPO, base))) continue;
    for (const name of readdirSync(join(REPO, base))) {
      if (existsSync(join(REPO, base, name, 'package.json'))) found.push(`${base}/${name}/package.json`);
    }
  }
  return found.sort();
}

test('schemastery-pin: der Root deklariert die Sollfassung exakt', () => {
  const declared = root.dependencies?.[DEP];
  assert.equal(typeof declared, 'string', `package.json dependencies["${DEP}"] fehlt`);
  assert.equal(declared, target, `Root nennt ${declared}; die Sollquelle verlangt exakt ${target}`);
});

test('schemastery-pin: jedes Paket nennt sie exakt und als Peer-Bereich, der sie einschließt', () => {
  const paths = manifestPaths();
  assert.ok(paths.length > 0, 'kein Paketmanifest gefunden — der Test hätte nichts geprüft');

  const wrong = [];
  for (const rel of paths) {
    const manifest = readJson(rel);
    const dev = manifest.devDependencies?.[DEP];
    const peer = manifest.peerDependencies?.[DEP];
    if (dev !== target) wrong.push(`${rel} devDependencies: ${dev ?? 'fehlt'} statt ${target}`);
    if (peer === undefined) wrong.push(`${rel} peerDependencies: fehlt`);
    else if (!satisfiesRange(peer, target)) wrong.push(`${rel} peerDependencies: ${peer} schließt ${target} nicht ein`);
  }
  assert.deepEqual(wrong, [], 'ein Manifest weicht von der Sollfassung ab — dann gibt es wieder zwei Wahrheiten');
});

test('schemastery-pin: das Lock trägt genau eine Kopie in der Sollfassung', () => {
  const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path.endsWith(`node_modules/${DEP}`));
  assert.deepEqual(
    entries.map(([path]) => path),
    [`node_modules/${DEP}`],
    'mehr als ein Lock-Eintrag: eine verschachtelte Zweitfassung ist genau der Befund, den dieser Test verhindert',
  );

  const [[, entry]] = entries;
  assert.equal(entry.version, target, `das Lock löst ${entry.version} auf, die Sollquelle verlangt ${target}`);
  assert.match(
    String(entry.resolved ?? ''),
    new RegExp(`/@deepseek-ai/schemastery/-/schemastery-${literal(entry.version)}\\.tgz$`),
    `der Lock-Eintrag zeigt nicht auf den Tarball seiner Fassung: ${entry.resolved}`,
  );

  // Jede Anforderung im Baum muss die Sollfassung einschließen — sonst entsteht
  // die nächste Kopie beim übernächsten `npm ci`, ohne dass dieser Lauf sie sieht.
  let claims = 0;
  for (const [path, manifest] of Object.entries(lock.packages ?? {})) {
    const wanted = manifest.dependencies?.[DEP];
    if (wanted === undefined) continue;
    claims += 1;
    if (!satisfiesRange(wanted, target)) assert.fail(`${path} fordert ${wanted} — die Sollfassung ${target} passt nicht hinein`);
  }
  assert.ok(claims > 100, `nur ${claims} Anforderungen gefunden — der Baum wurde nicht wirklich geprüft`);
});
