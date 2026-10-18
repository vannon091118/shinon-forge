import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Output-Diff für den Referenz-Matcher: die Tabelle `references` eines echten
 * Indexlaufs gegen beide Rechenwege am selben Baum.
 *
 * Der Matcher lädt den Kern mit dem echten Schemastery aus dem Repo-Installat
 * (derselbe Weg wie der Profiltest), öffnet die übergebene Index-DB readOnly,
 * prüft je indizierter Datei drei Wege auf zeilenidentische Einträge und
 * bricht mit Exit 1 ab, sobald sich ein Weg vom Matcher unterscheidet.
 */
const usage = `usage: node scripts/index-match-eq.mjs <index.sqlite> [root]
  <index.sqlite>  Index-Datei eines Kaltlaufs (z. B. aus scripts/index-cold-cost.mjs --keep)
  [root]          Baum, gegen den die Referenzen neu gerechnet werden (Standard: Repo-Root)`;

const dbFile = process.argv[2];
if (!dbFile) {
  console.error(usage);
  process.exit(2);
}
const ROOT = process.argv[3] ?? process.cwd();

const PACKAGE_DIR = join(ROOT, 'packages/project-index/');
const require = createRequire(join(ROOT, 'package.json'));
const work = mkdtempSync(join(tmpdir(), 'index-match-eq-'));
try {
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  const shim = join(work, 'pkg/node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(shim + '/package.json', JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-probe', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(shim + '/index.js', `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  const core = (await import(pathToFileURL(join(work, 'pkg/assets/index-core.js')).href)).default
    ?? (await import(pathToFileURL(join(work, 'pkg/assets/index-core.js')).href));

  const db = new DatabaseSync(dbFile, { readOnly: true });
  const names = [...new Set(db.prepare('select distinct name, kind from symbols').all()
    .filter((row) => core.REFERENCABLE_KINDS.has(row.kind)).map((row) => row.name))].sort();
  const matcher = core.createReferenceMatcher(names);
  const norm = (list) => [...list].map(({ name, line }) => `${line}:${name}`).sort();

  let checked = 0, mismatches = 0, stale = 0;
  const problems = [];
  for (const { path, digest: storedDigest } of db
    .prepare('select path, digest from files order by path').all()) {
    let text;
    try { text = readFileSync(join(ROOT, path), 'utf8'); } catch { continue; }
    const red = core.redactSecrets(text).text;
    const legacy = norm(core.findReferences(red, names));
    const mine = norm(matcher.scan(red));
    checked += 1;
    if (JSON.stringify(legacy) !== JSON.stringify(mine)) {
      mismatches += 1;
      if (problems.length < 5) problems.push({ path, legacy: legacy.length, matcher: mine.length });
      continue;
    }
    const digest = createHash('sha256').update(text).digest('hex');
    if (digest !== storedDigest) {
      // Der Baum bewegt sich: der Indexlauf lief gegen einen älteren Stand
      // dieser Datei. Der Matcher-Vergleich bleibt gültig (derselbe Text), die
      // gespeicherte Zeile des Laufs zählt hier nicht mehr — gemeldet, aber
      // kein Matcher-Befund.
      stale += 1;
      continue;
    }
    const stored = norm(db.prepare('select name, line from "references" where path = ?').all(path));
    if (JSON.stringify(stored) !== JSON.stringify(mine)) {
      mismatches += 1;
      if (problems.length < 5) problems.push({ path, matcher: mine.length, db: stored.length });
    }
  }
  db.close();
  console.log(`index-match-eq: ${checked} Dateien geprüft, ${names.length} Referenznamen, ${mismatches} Mismatches, ${stale} nachlaufend geändert`);
  if (problems.length > 0) console.log(JSON.stringify(problems));
  if (mismatches !== 0) process.exit(1);
  if (stale !== 0) console.log(`Warnung: ${stale} Dateien tragen im Index einen anderen Stand als auf der Platte — Kaltlauf über eine live bewegte Fixture (Bericht und Reproben des Laufs)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
