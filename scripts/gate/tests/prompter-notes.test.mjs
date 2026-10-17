#!/usr/bin/env node
/**
 * Gate: die Zettel des Veredlers (Zug 4) — Daten, Drift, echte Sammlung.
 *
 * Der Zettel-Weg hat zwei Seiten, die auseinanderlaufen koennen, ohne dass ein
 * Test es merkt: die REGELDATEI (was gelesen und geprueft wird) und die
 * BESCHREIBUNG (`generated-skills/README.md`, was ein Mensch liest). Dazu kommt
 * die echte Sammlung, die das arbeitende Modell schreibt. Diese Datei prueft
 * alle drei — und die Fail-Richtung des Befehls an einer Fixture.
 *
 * Kein DSH, kein Netz, kein Modell: nur die reinen Funktionen des Kerns, die
 * Dateien des Repos und der echte Befehl `npm run notes:check`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNote, reviewNotes } from '../../../packages/prompter/assets/note-core.js';
import { codeOnly } from '../../lib/source-scan.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const rules = JSON.parse(read('packages/prompter/assets/note-rules.json'));
const core = read('packages/prompter/assets/note-core.js');
const indexSource = read('packages/prompter/index.js');
const readme = read('generated-skills/README.md');
const manifest = JSON.parse(read('package.json'));

// ── 1. Die Regeln ────────────────────────────────────────────────────────────

test('zettel-regeln: Vertrag, Form, Grenzen und die drei Pruefungen stehen als Daten', () => {
  assert.equal(rules.contract, 'shinon.note-rules/v1');
  assert.equal(rules.format.contract, 'shinon.skill-note/v1');
  assert.equal(typeof rules.format.dir, 'string');
  assert.ok(rules.format.dir !== '', 'das Verzeichnis ist benannt');
  assert.equal(rules.format.extension, '.json');
  assert.ok(Number.isInteger(rules.format.version) && rules.format.version >= 1);
  assert.deepEqual(rules.format.required, ['contract', 'version', 'thema', 'bei', 'immer', 'weil', 'beleg'], 'jedes Feld der Form ist Pflicht');
  for (const field of rules.format.required.slice(2)) {
    assert.ok(Number.isInteger(rules.format.limits[field]) && rules.format.limits[field] > 0, `${field}: Grenze fehlt`);
  }
  for (const key of ['maxNotes', 'minHits', 'minTokenLength']) {
    assert.ok(Number.isInteger(rules.reading[key]) && rules.reading[key] >= 1, `reading.${key}`);
  }
  // Die Pruefungen tragen ihre ETIKETTEN — der Befund nennt ein Wort, keine Zahl.
  assert.deepEqual(
    [rules.review.tooNarrow.label, rules.review.tooBroad.label, rules.review.duplicate.label],
    ['zu spitz', 'zu breit', 'doppelt'],
  );
  // Jedes Muster muss ein gueltiger Ausdruck sein — ein Tippfehler waere sonst
  // eine Pruefung, die nie greift und nie auffaellt.
  for (const rule of rules.review.tooNarrow.forbidden) {
    assert.equal(typeof rule.id, 'string');
    assert.equal(typeof rule.why, 'string');
    assert.doesNotThrow(() => new RegExp(rule.pattern, 'u'), `${rule.id}: ${rule.pattern}`);
  }
  assert.doesNotThrow(() => new RegExp(rules.review.tooNarrow.pathPattern, 'g'));
  assert.ok(rules.review.tooBroad.stopWords.length > 0, 'Fuellwoerter sind benannt, nicht geraten');
});

test('zettel-regeln: der Kern ist importfrei und die Zeit entscheidet nie', () => {
  // Importfrei heisst: der Test laeuft in CI OHNE node_modules (dieselbe Regel
  // wie bei scoring-core und mechanik). Geprueft wird der CODE, nicht der
  // Kommentar — der nennt `Math.random` genau, um zu sagen, dass er fehlt.
  const code = codeOnly(core);
  assert.equal(/^\s*import\b|^\s*export\s+\{[^}]*\}\s+from/m.test(code), false, 'note-core.js hat keinen einzigen Import');
  assert.equal(/Math\.random|Date\.now/.test(code), false, 'kein Zufall, keine Uhr im Kern');
  // Genau EIN Kern, zwei Nutzer: der Veredler und der Befehl lesen dieselben
  // Funktionen — ein zweiter Pruefer waere ein zweiter Massstab.
  assert.match(indexSource, /from '\.\/assets\/note-core\.js'/);
  assert.match(read('scripts/notes-check.mjs'), /from '\.\.\/packages\/prompter\/assets\/note-core\.js'/);
});

// ── 2. Die Beschreibung laeuft nicht weg ─────────────────────────────────────

test('zettel-regeln: README, Regeln und Paket sagen dasselbe', () => {
  assert.ok(readme.includes('shinon.skill-note/v1'), 'der Vertragsname der Zettel steht in der Beschreibung');
  assert.ok(readme.includes(rules.format.dir), 'das Verzeichnis aus den Regeln steht in der Beschreibung');
  for (const label of ['zu spitz', 'zu breit', 'doppelt']) {
    assert.ok(readme.includes(label), `${label} fehlt in der Beschreibung`);
  }
  assert.ok(readme.includes('note-rules.json'), 'die Beschreibung zeigt auf die Regeldatei statt Zahlen zu wiederholen');
  assert.ok(readme.includes('notes:check'), 'der Befehl ist benannt');
  assert.equal(manifest.scripts['notes:check'], 'node scripts/notes-check.mjs');
  assert.match(manifest.scripts['test:full'], /packages\/prompter\/test\/\*\.test\.mjs/, 'die Zettel-Tests laufen in der vollen Kette (test:full) mit');
  // Trennung schnell/lokal vs. voll/CI (2026-10-17): `npm test` ist der schnelle
  // Pfad, `test:full` die alte Kette. Der langsame Pol (pack-test) darf nie
  // still in den lokalen Pfad zurückwandern — sonst ist die Trennung nur ein Name.
  assert.match(manifest.scripts.test, /gate\/engine\.mjs --local/, 'npm test ist der schnelle lokale Pfad');
  assert.equal(manifest.scripts.test.includes('pack-test.mjs'), false, 'der Distributionstest gehört nicht in npm test');
});

test('zettel-regeln: ein Vertrag ist Pflicht, und neben den Regeln liegt keine zweite Form', () => {
  // Die Beschreibung nennt die Felder — aber die Grenzen stehen NUR in den
  // Regeln. Dieser Test haelt fest, dass die Regeldatei die einzige Quelle ist.
  const fields = rules.format.required.map((field) => `\`${field}\``);
  for (const field of fields) assert.ok(readme.includes(field), `${field} fehlt in der Beschreibung`);
  assert.equal(readme.includes(String(rules.format.limits.thema)), false, 'die Beschreibung wiederholt keine Zahl aus den Regeln');
});

// ── 3. Die echte Sammlung ────────────────────────────────────────────────────

const notesDir = join(fileURLToPath(ROOT), rules.format.dir);
const noteFiles = readdirSync(notesDir).filter((name) => name.endsWith(rules.format.extension)).sort();

test('zettel: jede Datei der echten Sammlung ist ein Zettel', () => {
  assert.ok(noteFiles.length > 0, 'die Sammlung ist nicht leer — eine leere Ablage waere ein stiller Ausfall');
  for (const name of noteFiles) {
    const parsed = parseNote(readFileSync(join(notesDir, name), 'utf8'), rules.format);
    assert.equal(parsed.ok, true, `${name}: ${parsed.reason}`);
  }
});

test('zettel: die echte Sammlung hat keinen Befund', () => {
  const entries = noteFiles.map((name) => {
    const parsed = parseNote(readFileSync(join(notesDir, name), 'utf8'), rules.format);
    return { file: name, note: parsed.note };
  });
  assert.deepEqual(reviewNotes(entries, rules), [], 'zu spitz, zu breit, doppelt — hier darf nichts stehen');
});

// ── 4. Der Befehl — gruen und rot ────────────────────────────────────────────

const run = (args = []) => spawnSync(process.execPath, [join(fileURLToPath(ROOT), 'scripts/notes-check.mjs'), ...args], { encoding: 'utf8' });

test('zettel: npm run notes:check ist auf der echten Sammlung gruen', () => {
  const result = run();
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, new RegExp(`Zettel: ${noteFiles.length} geprüft`));
});

test('zettel: der Befehl ist fail-closed — ein kaputter Zettel und ein Befund sind Exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-notes-check-'));
  try {
    writeFileSync(join(dir, 'kaputt.json'), '{ nicht json');
    const broken = run([dir]);
    assert.equal(broken.status, 1, 'eine ungelesene Datei ist ein Verstoss, kein Hinweis');
    assert.match(broken.stderr, /kein Zettel — kaputt\.json/);

    // Ein zu spitzer Zettel: dieselbe Fail-Richtung ueber die Pruefung.
    rmSync(join(dir, 'kaputt.json'));
    writeFileSync(join(dir, 'spitz.json'), JSON.stringify({
      contract: 'shinon.skill-note/v1',
      version: 1,
      thema: 'gate',
      bei: 'Am 2026-10-12 im Lauf session-1234abcd',
      immer: 'die Whitelist des Gate-Plugins pflegen und sonst nichts',
      weil: 'das Gate jede Datei unter assets gegen eine feste Liste prueft',
      beleg: 'scripts/gate/tests/prompter-notes.test.mjs',
    }));
    const narrow = run([dir]);
    assert.equal(narrow.status, 1);
    assert.match(narrow.stderr, /zu spitz — spitz\.json/);

    // Und leer ist kein Befund: die Fixture ohne Zettel ist gruen, weil es
    // nichts zu pruefen gibt (die LEERE echte Sammlung faengt Test 3 ab).
    rmSync(join(dir, 'spitz.json'));
    assert.equal(run([dir]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
