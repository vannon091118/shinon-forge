#!/usr/bin/env node
/**
 * Abnahmetest der einen Quelle für generierte Plugin-Bausteine
 * (scripts/lib/plugin-idioms.mjs).
 *
 * Warum diese Datei existiert: sechs Host-Hälften trugen denselben
 * `settings.configure`-Block, fünf Client-Hälften denselben Locale-Fallback —
 * dieselbe Prüfung, sechs bzw. fünf Mal gepflegt. Teilen ist hier nicht möglich
 * (jedes Paket wird einzeln verpackt, eine Client-Hälfte ist ein self-contained
 * Bundle, siehe Kopf der Quelle); also tragen die Pakete ABLEITUNGEN, und dieser
 * Test pinnt, dass die Ableitung wirklich eine ist:
 *
 *   1. Der Baum ist deckungsgleich: kein Block weicht von der Quelle ab, und
 *      keine Fundstelle der Signatur steht außerhalb eines Blocks.
 *   2. Die Prüfung ist nicht vakuum-grün: eine getippte Abweichung, eine fehlende
 *      Marke, eine überzählige Marke und eine neue Kopie ohne Marke werden
 *      JEWEILS rot — in einem temporären Wurzelverzeichnis, nicht am echten Baum.
 *   3. Der Schreiber repariert Drift, ist idempotent und rät nicht: fehlt eine
 *      Marke, bleibt die Datei unangetastet (fail-closed).
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz,
 * kein Modell, kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyIdioms,
  HALVES,
  idiomIssues,
  regionCount,
  regionFiles,
  regionsOf,
  render,
  SOURCE_FILE,
} from '../../lib/plugin-idioms.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const write = (file, text) => writeFileSync(file, text);

/**
 * Ein temporäres Wurzelverzeichnis mit den echten Dateien EINER Hälfte: daran
 * wird gemessen, ohne den echten Baum anzufassen.
 */
function seed(half) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-idioms-'));
  for (const file of regionFiles()) {
    if (half !== null && !regionsOf(half).some((region) => region.file === file)) continue;
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(ROOT, file), target);
  }
  return root;
}

const issuesOf = (root, half) => idiomIssues(root, half);

test('die eine Quelle kennt beide Hälften — 12 Blöcke in 11 Dateien', () => {
  assert.equal(regionCount(), 12);
  assert.equal(regionFiles().length, 11);
  assert.deepEqual(HALVES, ['index.js', 'client.js']);
  assert.equal(regionsOf('index.js').length, 6, 'sechs settings-Registrierungen');
  assert.equal(regionsOf('client.js').length, 6, 'vier Menü- plus zwei Token-Fallbacks');
});

test('jeder Block nennt seine Quelle im Marker', () => {
  for (const half of HALVES) {
    for (const region of regionsOf(half)) {
      const lines = render(region);
      assert.ok(lines[0].includes(SOURCE_FILE), `${region.file}: Startmarke nennt ${SOURCE_FILE}`);
      assert.ok(lines.at(-1).includes(region.id), `${region.file}: Schlussmarke nennt die Region`);
      assert.equal(lines[0].trimStart().startsWith('// >>>'), true);
    }
  }
});

test('der echte Baum ist deckungsgleich: kein Drift, keine Kopie daneben', () => {
  for (const half of HALVES) {
    assert.deepEqual(issuesOf(ROOT, half), []);
  }
});

test('die Host-Hälften tragen die Registrierung nur im generierten Block', () => {
  const source = read('packages/core/index.js');
  const block = render(regionsOf('index.js', 'packages/core/index.js')[0]).join('\n');
  assert.ok(source.includes(block), 'der Block steht zeichengenau im Paket');
  assert.equal(source.split('settings.configure(').length - 1, 1, 'genau eine Fundstelle');
});

test('Abweichung im Block wird namentlich gemeldet', () => {
  const root = seed('index.js');
  const file = join(root, 'packages/core/index.js');
  write(file, read('packages/core/index.js').replace('{ auto: false }', '{ auto: true }'));
  const issues = issuesOf(root, 'index.js');
  assert.equal(issues.length, 1);
  assert.match(issues[0], /packages\/core\/index\.js/);
  assert.match(issues[0], /settings-registration/);
  assert.match(issues[0], /weicht von scripts\/lib\/plugin-idioms\.mjs ab/);
  assert.match(issues[0], /auto: true/);
});

test('fehlende und überzählige Marken sind Befunde', () => {
  const root = seed('client.js');
  const file = join(root, 'packages/markers/client.js');
  const text = read('packages/markers/client.js');

  write(file, text.replace(/ *\/\/ <<< shinon:dsh-idiom locale-fallback\/menu\n/, ''));
  const ohneSchluss = issuesOf(root, 'client.js');
  assert.ok(ohneSchluss.some((issue) => issue.includes('keine Schlussmarke')), 'Startmarke ohne Schlussmarke');
  assert.ok(ohneSchluss.some((issue) => issue.includes('locale-fallback/menu')), 'die Region wird genannt');

  write(file, text.replace(/ *\/\/ >>> shinon:dsh-idiom locale-fallback\/menu[^\n]*\n/, ''));
  const ohneStart = issuesOf(root, 'client.js');
  assert.ok(ohneStart.some((issue) => issue.includes('ohne Startmarke')), 'Schlussmarke ohne Startmarke');
});

test('eine neue Kopie ohne Marke fällt auf, auch wenn kein Block abweicht', () => {
  const root = seed('client.js');
  const file = join(root, 'packages/locale-de/client.js');
  mkdirSync(dirname(file), { recursive: true });
  write(file, "const onMount = null;\nfunction t(key) { return ctx.get?.('locale') ?? key; }\n");
  const kopie = issuesOf(root, 'client.js');
  assert.equal(kopie.length, 1);
  assert.match(kopie[0], /packages\/locale-de\/client\.js:2/);
  assert.match(kopie[0], /außerhalb eines generierten Blocks/);

  // Marken allein genügen nicht: der Block muss in der einen Quelle deklariert sein.
  const region = regionsOf('client.js', 'packages/markers/client.js')[0];
  write(file, [...render(region), 'const danach = 1;'].join('\n'));
  const undeclared = issuesOf(root, 'client.js');
  assert.ok(undeclared.length > 0, 'ein Block, den die Quelle nicht kennt, ist ein Befund');
  for (const issue of undeclared) {
    assert.match(issue, /packages\/locale-de\/client\.js/);
    assert.match(issue, /den scripts\/lib\/plugin-idioms\.mjs für diese Datei nicht deklariert/);
  }
});

test('die sechs Host-Hälften registrieren weiterhin genau einmal: settings.configure({auto:false}, ctx.fiber)', async (t) => {
  try {
    await import('@deepseek-ai/schemastery');
  } catch {
    // Der CI-Baum hat keine node_modules: sichtbar überspringen statt still grün.
    t.skip('ohne auflösbares @deepseek-ai/schemastery nicht ausführbar (CI hat kein node_modules)');
    return;
  }
  const files = regionsOf('index.js').map((region) => region.file);
  assert.equal(files.length, 6);
  const silence = console.log;
  console.log = () => {};
  try {
    for (const file of files) {
      const mod = await import(new URL(`../../../${file}`, import.meta.url).href);
      const log = [];
      const child = {
        effect(fn) {
          fn();
          log.push('effect');
          return () => {};
        },
        settings: {
          configure(value, fiber) {
            log.push(`configure ${JSON.stringify(value)} fiber=${fiber}`);
          },
        },
      };
      mod.apply(
        {
          fiber: 'ROOT_FIBER',
          inject(names, callback) {
            log.push(`inject ${JSON.stringify(names)}`);
            callback(child);
          },
        },
        typeof mod.Config === 'function' ? mod.Config({ enabled: true }) : {},
      );
      assert.deepEqual(
        log,
        ['inject ["settings"]', 'configure {"auto":false} fiber=ROOT_FIBER', 'effect'],
        `${file}: genau eine Registrierung, unveränderte Argumente`,
      );
    }
  } finally {
    console.log = silence;
  }
});

test('der Schreiber repariert Drift, ist idempotent und rät nicht', () => {
  const root = seed(null);
  const file = join(root, 'packages/dashboard/index.js');
  const good = read('packages/dashboard/index.js');
  write(file, good.replace('const child', 'const child').replace('auto: false', 'auto: true'));

  const first = applyIdioms(root);
  assert.deepEqual(first.failed, []);
  assert.deepEqual(first.changed, ['packages/dashboard/index.js']);
  assert.equal(readFileSync(file, 'utf8'), good, 'exakt der Block der einen Quelle');
  assert.deepEqual(issuesOf(root, 'index.js'), []);

  const second = applyIdioms(root);
  assert.deepEqual(second.changed, [], 'ohne Abweichung wird keine Datei angefasst');

  // Fail-closed: ohne Marke bleibt die Datei unverändert und der Lauf meldet es.
  write(file, 'export function apply(ctx) { ctx.inject([], () => {}); }\n');
  const third = applyIdioms(root);
  assert.deepEqual(third.changed, []);
  assert.ok(third.failed.some((finding) => finding.includes('Marker fehlt')));
  assert.equal(readFileSync(file, 'utf8'), 'export function apply(ctx) { ctx.inject([], () => {}); }\n');
});
