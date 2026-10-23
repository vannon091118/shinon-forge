#!/usr/bin/env node
/**
 * scripts/gate/tests/selection-single-path.test.mjs — EIN Weg in die Blockauswahl.
 *
 * Der Befund (Audit T3-5, Konflikt #13): `packages/prompter/assets/selection.js`
 * war eine vollständige, getestete Antwortprüfung für einen Selektionsagenten —
 * und hatte NULL Produktionsaufrufer. Dazu gehörten `candidateBlocks` (die
 * Kandidatenliste, die nur dieser Agent las) und eine `includeIds`-Tür in
 * `selectBlocks`. Drei Teile einer Mechanik, die sich wie eine Fähigkeit las:
 * ein zweiter Modellaufruf je Schritt, den niemand gemessen hat.
 *
 * Entschieden am 2026-10-23: ENTFERNT, nicht verdrahtet. Der deterministische
 * Selektor (Matcher, Pflicht, Reihung, Budget) ist der eine Weg; wer den Agenten
 * will, bringt ihn MIT Messung zurück. Diese Datei pinnt die Entscheidung, damit
 * sie nicht als halbe Verdrahtung zurückkehrt — eine Fähigkeit, die nur ihr
 * eigener Test fährt, ist wieder genau der Zustand, der hier aufgeräumt wurde.
 *
 * Vier Zusagen, jede mit Mutationsprobe:
 *   1. Die Dateien der Mechanik sind weg (Assets und Paket-Test).
 *   2. Kein Quelltext trägt `shinon.selection/v1` als Literal. Kommentare zählen
 *      nicht (sie dürfen die Geschichte erzählen), Strings im Code schon.
 *   3. Keiner der sieben Namen ist öffentlich: sechs aus `selection.js` plus
 *      `candidateBlocks`.
 *   4. Die Tür ist zu, auch im Verhalten: `selectBlocks` wählt mit
 *      `includeIds` exakt dasselbe wie ohne.
 *
 * Läuft ohne DSH und ohne node_modules — `assets/block-select.js` ist ein
 * importfreier Kern, wie die Paket-Suite ihn auch lädt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly, stripComments } from '../../lib/source-scan.mjs';
import { selectBlocks } from '../../../packages/prompter/assets/block-select.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Die Mechanik, die gegangen ist: eine Datei, ihr Test, sieben Namen, ein Vertrag. */
const REMOVED_FILES = ['packages/prompter/assets/selection.js', 'packages/prompter/test/selection.test.mjs'];
const REMOVED_NAMES = [
  'MAX_UNCERTAINTY',
  'MIN_UNCERTAINTY',
  'SELECTION_CONTRACT',
  'candidateBlocks',
  'parseSelection',
  'renderCandidates',
  'selectionSystemBrief',
];
const CONTRACT = 'shinon.selection/v1';

/** Alle JS-Quellen der Pakete (auch die Tests: sie könnten die Mechanik zurückholen). */
function packageSources() {
  return readdirSync(join(ROOT, 'packages'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return { file: path.slice(ROOT.length).replaceAll('\\', '/'), source: readFileSync(path, 'utf8') };
    });
}

/**
 * Die Prüfung als EINE Funktion — echte Quellen und Mutationsprobe laufen durch
 * denselben Regelsatz. `sources` ist die Liste der JS-Dateien, `index` der Text
 * des Einstiegs, `selector` der Text des Auswahlkerns.
 */
function removalIssues({ files, sources, index, selector }) {
  const issues = [];
  for (const rel of REMOVED_FILES) {
    if (files.has(rel)) issues.push(`${rel} ist wieder da — es gibt EINEN Auswahlweg`);
  }
  for (const { file, source } of sources) {
    const visible = stripComments(source);
    if (visible.includes(`'${CONTRACT}'`) || visible.includes(`"${CONTRACT}"`) || visible.includes(`\`${CONTRACT}\``)) {
      issues.push(`${file}: trägt ${CONTRACT} als Literal`);
    }
  }
  for (const name of REMOVED_NAMES) {
    if (new RegExp(`export[^;]*\\b${name}\\b`).test(codeOnly(index))) {
      issues.push(`index.js exportiert ${name} wieder`);
    }
  }
  const selectorCode = codeOnly(selector);
  if (/\bincludeIds\b/.test(selectorCode)) issues.push('selectBlocks liest wieder includeIds — die Agenten-Tür ist zurück');
  if (/\bcandidateBlocks\b/.test(selectorCode)) issues.push('candidateBlocks ist wieder da');
  return issues;
}

const sources = packageSources();
const real = {
  files: new Set(sources.map((entry) => entry.file)),
  sources,
  index: readFileSync(join(ROOT, 'packages/prompter/index.js'), 'utf8'),
  selector: readFileSync(join(ROOT, 'packages/prompter/assets/block-select.js'), 'utf8'),
};

test('selection: der Echtbaum trägt keine Spur der Agenten-Mechanik', () => {
  assert.deepEqual(removalIssues(real), []);
});

test('selection: eine zurückgeholte Datei wird gemeldet (Mutationsprobe)', () => {
  const files = new Set([...real.files, 'packages/prompter/assets/selection.js']);
  const issues = removalIssues({ ...real, files });
  assert.ok(issues.some((issue) => issue.includes('packages/prompter/assets/selection.js')), issues.join('\n'));
});

test('selection: der Vertrag als Literal wird gemeldet (Mutationsprobe)', () => {
  const sources = [...real.sources, { file: 'packages/prompter/assets/neu.js', source: `export const C = '${CONTRACT}';` }];
  const issues = removalIssues({ ...real, sources });
  assert.ok(issues.some((issue) => issue.includes('als Literal')), issues.join('\n'));

  // Kommentare dürfen die Geschichte erzählen — der Scanner liest sie nicht mit.
  const commented = [{ file: 'packages/prompter/assets/alt.js', source: `// Vertrag war ${CONTRACT}\nexport const x = 1;` }];
  assert.deepEqual(removalIssues({ ...real, sources: commented }), []);
});

test('selection: ein wiederveröffentlichter Name wird gemeldet (Mutationsprobe)', () => {
  const index = `${real.index}\nexport { parseSelection } from './assets/selection.js';\n`;
  const issues = removalIssues({ ...real, index });
  assert.ok(issues.some((issue) => issue.includes('parseSelection')), issues.join('\n'));
});

test('selection: die Agenten-Tür ist auch im Verhalten zu', () => {
  const registry = {
    blocks: [
      { id: 'pflicht', quelle: 'identity', modus: ['MAX'], budgetTokens: 10, ausloeser: { immer: true } },
      { id: 'nur-mit-marker', quelle: 'projekt', modus: ['MAX'], budgetTokens: 10, ausloeser: { haystack: ['gibtesnicht'] } },
    ],
  };
  const base = { mode: 'MAX', promptText: 'hallo', context: null, available: {} };
  const ohne = selectBlocks(registry, base);
  const mit = selectBlocks(registry, { ...base, includeIds: ['nur-mit-marker'] });
  assert.deepEqual(mit.selected.map((entry) => entry.id), ohne.selected.map((entry) => entry.id));
  assert.deepEqual(ohne.selected.map((entry) => entry.id), ['pflicht'], 'Pflicht bleibt der einzige Treffer');
  assert.ok(mit.skipped.some((entry) => entry.id === 'nur-mit-marker' && entry.reason === 'NICHT_AUSGELOEST'), 'der nicht ausgelöste Block bleibt ungewählt');
  assert.ok(!mit.skipped.some((entry) => String(entry.reason).startsWith('AGENT')), 'kein Agenten-Grund mehr in der Spur');
});
