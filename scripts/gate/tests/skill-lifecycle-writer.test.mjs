// Der Skill-Lebenszyklus ist der EINE Laufzeit-Schreiber des Prompter-Pakets:
// Skills nach .agents/skills, Ledger nach .shinon/. Er ist deshalb aus dem
// allgemeinen Isolationsscan von `prompter-contract.test.mjs` herausgenommen —
// die Isolationszusage gilt dann nicht mehr, ohne dass man es sieht. Dieser Test
// pinnt stattdessen seine Schreibgrenzen: keine Shell, kein Netz, keine Werkzeuge,
// genau eine Schreibstelle, und die Wurzelpruefung steht davor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(HERE, '..', '..', '..', 'packages', 'prompter');

test('Schreiber: der Skill-Lebenszyklus ist der einzige Schreiber und bleibt in seinen Wurzeln', () => {
  const source = readFileSync(join(PACKAGE_DIR, 'assets', 'skill-lifecycle.js'), 'utf8');
  for (const bad of ['child_process', 'execSync', 'spawn(', 'fetch(', 'process.exit', 'ctx.agents', 'ctx.subagents', 'ctx.shell', 'ctx.set(', 'rmSync', 'unlinkSync']) {
    assert.equal(source.includes(bad), false, `Schreiber nutzt ${bad}`);
  }
  assert.equal(source.split('writeFileSync(').length - 1, 1, 'nur writeFileAtomic schreibt');
  assert.ok(source.includes('if (!inside(path, allowedRoot))'), 'die Wurzelpruefung steht vor jedem Schreiben');
});
