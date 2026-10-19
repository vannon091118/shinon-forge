/**
 * Gate: der pre-commit-Riegel für §1 der ZAHLEN.
 *
 * Die ZAHLEN haben zwei Hälften mit zwei Regeln: §1 ist GENERIERT
 * (`npm run zahlen:sync` schreibt, `zahlen:check` vergleicht) und muss vor dem
 * Commit stimmen; §2 ist ein datierter Messwert, der von Hand nach einem Lauf
 * eingetragen wird. Ein Hook, der `zahlen:sync` aufruft, würde §1 still
 * fortschreiben — dann wäre die Zahl nicht mehr das, was gemessen wurde. Geprüft
 * wird deshalb: die PRÜFUNG läuft, das SCHREIBEN nicht.
 *
 * Der zweite Teil ist die Falle, die dieser Test schließt: derselbe Hook-Text
 * steht in `scripts/install-hooks.mjs`. Wer nur `.githooks/pre-commit` ändert,
 * verliert den Riegel beim nächsten `npm run hooks:install` — und niemand sieht
 * es, weil der Hook danach wieder grün ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const hook = read('.githooks/pre-commit');
const installer = read('scripts/install-hooks.mjs');

/** Der pre-commit-Block aus dem Installer — die Vorlage, die der Hook sein muss. */
function templateBlock() {
  const marker = "'pre-commit': `";
  const start = installer.indexOf(marker);
  assert.notEqual(start, -1, 'install-hooks.mjs hat keine pre-commit-Vorlage');
  const from = start + marker.length;
  const end = installer.indexOf('`,', from);
  assert.notEqual(end, -1, 'die pre-commit-Vorlage ist nicht geschlossen');
  return installer.slice(from, end + 2);
}

test('der Hook prüft §1, bevor er die schnelle Linie fährt', () => {
  assert.match(hook, /^#!\/usr\/bin\/env sh/m, 'sieben Zeichen Shebang fehlen');
  assert.match(hook, /set -e/);
  const check = hook.indexOf('npm run zahlen:check');
  const test = hook.indexOf('npm test');
  assert.notEqual(check, -1, 'zahlen:check fehlt im pre-commit');
  assert.notEqual(test, -1, 'npm test fehlt im pre-commit');
  assert.ok(check < test, 'zahlen:check muss VOR npm test laufen (fail-fast, Sekunden)');
});

test('der Hook schreibt nie — §2 bleibt ein datierter Messwert', () => {
  assert.doesNotMatch(hook, /zahlen:sync/, 'der Hook darf §1 nicht direkt schreiben');
  assert.doesNotMatch(hook, /sync-zahlen\.mjs(?!.*--check)/, 'kein Schreibaufruf im Hook');
});

test('die Installer-Vorlage ist derselbe Hook (kein Riegel, der beim Neuinstallieren fällt)', () => {
  const block = templateBlock();
  assert.match(block, /npm run zahlen:check/, 'die Vorlage in install-hooks.mjs hat den Riegel nicht');
  assert.ok(block.indexOf('npm run zahlen:check') < block.indexOf('npm test'), 'auch die Vorlage prüft vor dem Test');
  assert.doesNotMatch(block, /zahlen:sync/);
});
