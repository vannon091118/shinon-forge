#!/usr/bin/env node
/**
 * validate-test.mjs - Regel-Fixtures für Gate und Build.
 *
 * Beweist je Regel, dass Gate UND Build rot werden: das Repo wird in ein
 * temporäres Verzeichnis kopiert, dort genau eine Regel verletzt, und beide
 * Einstiege müssen mit Exit ≠ 0 und der erwarteten Meldung abbrechen. Die
 * unveränderte Kopie ist die Kontrolle und muss grün bleiben.
 *
 * Eingebunden in `npm test`.
 */
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import * as repo from './lib/repo.mjs';

const WORK = mkdtempSync(join(tmpdir(), 'shinon-validate-'));
const SOURCES = ['scripts', 'packages', 'profiles', 'package.json'];
const SKIP = new Set(['node_modules', 'dist', '.git']);

const write = (root, rel, text) => writeFileSync(join(root, rel), text);
const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const writeJson = (root, rel, value) => write(root, rel, `${JSON.stringify(value, null, 2)}\n`);
const setField = (root, rel, key, value) => writeJson(root, rel, { ...readJson(root, rel), [key]: value });
const addDependency = (root, rel, name, spec) => {
  const manifest = readJson(root, rel);
  writeJson(root, rel, { ...manifest, dependencies: { ...manifest.dependencies, [name]: spec } });
};

/** Jede Regel: Name, erwartete Meldung, Verletzung. */
const RULES = [
  {
    name: 'kaputtes YAML',
    pattern: /kein gültiges YAML/,
    break: (root) => write(root, 'packages/core/cordis.patch.yml', '- insert:\n    - id: [unterminated\n'),
  },
  {
    name: 'falscher Typ',
    pattern: /insert muss eine Liste sein/,
    break: (root) => write(root, 'packages/dashboard/cordis.patch.yml', '- insert: shinon-dashboard\n'),
  },
  {
    name: 'fehlender required key',
    pattern: /insert\[1\]: name fehlt oder ist kein String/,
    break: (root) => write(root, 'packages/better-errors/cordis.patch.yml', '- insert:\n    - id: shinon-better-errors\n'),
  },
  {
    name: 'unbekannter Key',
    pattern: /unbekannte Felder typo/,
    break: (root) =>
      write(
        root,
        'packages/locale-de/cordis.patch.yml',
        "- insert:\n    - id: shinon-locale-de\n      name: '@shinon/locale-de'\n  typo: true\n",
      ),
  },
  {
    name: 'doppelte ID',
    pattern: /doppelte patch-id "shinon-core"/,
    break: (root) =>
      write(root, 'profiles/shinon/cordis.patch.yml', "- insert:\n    - id: shinon-core\n      name: '@shinon/core'\n"),
  },
  {
    name: 'Zyklus',
    pattern: /Zyklus im Paketgraph: @shinon\/core → @shinon\/tooltip → @shinon\/core/,
    break: (root) => {
      addDependency(root, 'packages/core/package.json', '@shinon/tooltip', 'link:../tooltip');
      addDependency(root, 'packages/tooltip/package.json', '@shinon/core', 'link:../core');
    },
  },
  {
    name: 'fehlende Ressource',
    pattern: /config\.specPath "\.\/openapi\.yaml" fehlt/,
    break: (root) => rmSync(join(root, 'packages/openapi/openapi.yaml')),
  },
  {
    name: 'Ressource falscher Typ',
    pattern: /icon "\.\/assets" ist keine Datei/,
    break: (root) => setField(root, 'packages/core/package.json', 'icon', './assets'),
  },
];

/** Repo-Kopie ohne node_modules/dist: das ist die geprüfte Umgebung. */
function fixtureRoot(name, mutate) {
  const root = join(WORK, name);
  mkdirSync(root, { recursive: true });
  for (const entry of SOURCES) {
    cpSync(join(repo.ROOT, entry), join(root, entry), { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
  }
  if (mutate) mutate(root);
  return root;
}

/** Einen Einstieg im Fixture laufen lassen; Exit-Status bleibt erhalten. */
function run(script, root) {
  try {
    const stdout = execFileSync(process.execPath, [join(root, 'scripts', script)], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exit: 0, output: stdout };
  } catch (e) {
    return { exit: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const results = [];
const control = fixtureRoot('control');
{
  const gate = run('dsh-test.mjs', control);
  const build = run('build.mjs', control);

  // Die Kontrolle darf keine feste Zahl erwarten: Gate-Checks und Paketanzahl
  // wachsen mit dem Repo, und ein hartkodierter Wert schlägt dann fehl, obwohl
  // nichts kaputt ist. Geprüft wird der Vertrag: Exit 0 und "0 fehlgeschlagen",
  // und der Build muss ALLE Pakete liefern — die Zahl kommt aus dem Repo.
  const pkgCount = repo.discover(repo.readRoot()).length;
  results.push({
    name: 'Kontrolle (unverändert)',
    gate,
    build,
    expected: /Ergebnisse: \d+ bestanden, 0 fehlgeschlagen/,
    buildExpected: new RegExp(`✅ Artefakte: dist/ mit ${pkgCount} Paketen`),
  });
}

RULES.forEach((rule, index) => {
  const root = fixtureRoot(`rule-${index + 1}`, rule.break);
  results.push({ name: rule.name, gate: run('dsh-test.mjs', root), build: run('build.mjs', root), expected: rule.pattern, broken: true });
});

console.log('═══════════════════════════════════════');
console.log('  Shinon Forge Regel-Fixtures');
console.log('═══════════════════════════════════════\n');
console.log(`  Arbeit: ${WORK}\n`);
console.log('  Regel                       Gate  Build  Meldung');
console.log('  ─────────────────────────────────────────────────────');

const hits = (result) => (result.broken ? result.gate.exit !== 0 : result.gate.exit === 0) && result.expected.test(result.gate.output);
const buildHits = (result) =>
  (result.broken ? result.build.exit !== 0 : result.build.exit === 0) && (result.buildExpected ?? result.expected).test(result.build.output);

let failed = 0;
for (const result of results) {
  const gateOk = hits(result);
  const buildOk = buildHits(result);
  const ok = gateOk && buildOk;
  if (!ok) failed++;
  const mark = ok ? '✅' : '❌';
  console.log(
    `  ${mark} ${result.name.padEnd(24)} ${(result.gate.exit === 0 ? 'grün' : 'rot').padEnd(5)} ${(result.build.exit === 0 ? 'grün' : 'rot').padEnd(6)} ${ok ? result.expected.source : `gate:${gateOk} build:${buildOk}`}`,
  );
}

console.log('\n═══════════════════════════════════════');
console.log(`  Ergebnisse: ${results.length - failed} bestanden, ${failed} fehlgeschlagen`);
console.log('═══════════════════════════════════════');
rmSync(WORK, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
