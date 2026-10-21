#!/usr/bin/env node
/**
 * Abnahmetest der einen Quelle für generierte Plugin-Bausteine
 * (scripts/lib/plugin-idioms.mjs).
 *
 * Warum diese Datei existiert: mehrere Host-Hälften trugen denselben
 * `settings.configure`-Block, mehrere Client-Hälften denselben Locale-Fallback —
 * dieselbe Prüfung, mehrfach gepflegt. Teilen ist hier nicht möglich
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
  TEMPLATE_IDS,
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
  for (const file of regionFiles(ROOT)) {
    if (half !== null && !regionsOf(ROOT, half).some((region) => region.file === file)) continue;
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(ROOT, file), target);
  }
  return root;
}

const issuesOf = (root, half) => idiomIssues(root, half);

test('die eine Quelle kennt beide Hälften — und nur bekannte Bausteine im Baum', () => {
  // Bewusst OHNE absolute Zahlen: sie ändern sich mit jedem neuen Plugin und
  // stehen als Zahl in docs/ZAHLEN.md (eine Besitzerin). Hier zählt die Form:
  // beide Hälften sind vertreten, jeder Block ist ein bekannter Baustein, und
  // Blöcke liegen ausschließlich in Paket-Hälften.
  assert.deepEqual(HALVES, ['index.js', 'client.js']);
  for (const half of HALVES) {
    const regions = regionsOf(ROOT, half);
    assert.ok(regions.length > 0, `${half}: mindestens ein generierter Block`);
    for (const region of regions) {
      assert.equal(region.half, half);
      assert.ok(TEMPLATE_IDS.includes(region.id), `${region.file}: "${region.id}" ist bekannt`);
      assert.match(region.file, /^packages\/[^/]+\/(index|client)\.js$/, 'nur Paket-Hälften tragen Blöcke');
    }
  }
  assert.equal(new Set(regionFiles(ROOT)).size, regionFiles(ROOT).length, 'jede Datei einmal');
  assert.ok(regionCount(ROOT) === regionsOf(ROOT, 'index.js').length + regionsOf(ROOT, 'client.js').length);
});

test('die Regionen kommen aus dem Baum, nicht aus einer Liste: jedes Paket erklärt sie selbst', () => {
  // Genau das ist die Skalierungseigenschaft: ein NEUES Paket braucht keinen
  // Eintrag in einer zentralen Liste — seine Startmarke trägt Bauart und Werte.
  const root = seed('client.js');
  const quelle = regionsOf(ROOT, 'client.js', 'packages/markers/client.js')[0];
  const neu = {
    ...quelle,
    file: 'packages/ganz-neu/client.js',
    params: { table: 'MENU_DE', key: 'menu.ganz-neu', label: 'Ganz Neu' },
  };
  const ziel = join(root, neu.file);
  mkdirSync(dirname(ziel), { recursive: true });
  const vorher = regionsOf(root, 'client.js').length;
  write(ziel, `${render(neu).join('\n')}\n`);

  assert.deepEqual(issuesOf(root, 'client.js'), [], 'das neue Paket ist ohne zentrale Registrierung konform');
  assert.equal(regionsOf(root, 'client.js').length, vorher + 1, 'die Prüfung findet die neue Region im Baum');

  // Und die Werte stehen wirklich in der Marke: ohne sie ist der Baustein ein Befund.
  write(ziel, `${render(neu).join('\n')}`.replace(/ params=\{[^}]*\}/, ''));
  const ohneWerte = issuesOf(root, 'client.js');
  assert.equal(ohneWerte.length, 1, 'fehlende Marker-Parameter sind genau ein Befund');
  assert.match(ohneWerte[0], /braucht params=\{table, key, label\}/);
});

test('jeder Block nennt seine Quelle im Marker', () => {
  for (const half of HALVES) {
    for (const region of regionsOf(ROOT, half)) {
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
  const block = render(regionsOf(ROOT, 'index.js', 'packages/core/index.js')[0]).join('\n');
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

  // Marken allein genügen nicht: der Block muss zeichengenau die Bauart der
  // einen Quelle sein — hier weicht die Registrierung selbst ab (auto: true).
  const region = { ...regionsOf(ROOT, 'index.js', 'packages/core/index.js')[0], file: 'packages/locale-de/index.js' };
  const drifted = render(region).map((line) => line.replace('{ auto: false }', '{ auto: true }'));
  write(file.replace(/client\.js$/, 'index.js'), `${drifted.join('\n')}\n`);
  const abweichung = issuesOf(root, 'index.js').filter((issue) => issue.includes('packages/locale-de/index.js'));
  assert.equal(abweichung.length, 1, 'genau der abweichende Block');
  assert.match(abweichung[0], /weicht von scripts\/lib\/plugin-idioms\.mjs ab/);
});

test('jede Host-Hälfte registriert genau einmal: settings.configure({auto:false}, ctx.fiber)', async (t) => {
  try {
    await import('@deepseek-ai/schemastery');
  } catch {
    // Der CI-Baum hat keine node_modules: sichtbar überspringen statt still grün.
    t.skip('ohne auflösbares @deepseek-ai/schemastery nicht ausführbar (CI hat kein node_modules)');
    return;
  }
  const files = regionsOf(ROOT, 'index.js').map((region) => region.file);
  assert.ok(files.length > 0, 'mindestens eine Host-Hälfte trägt die Registrierung');
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
      // Der Test sagt, was er messen will: GENAU EINE Settings-Registrierung
      // mit unveränderten Argumenten. Das ist nicht dasselbe wie "diese
      // Host-Hälfte tut sonst nichts" — eine Host-Hälfte darf durchaus weitere
      // Dienste injizieren (der Versionsspiegel mountet eine Route). Geprüft
      // wird deshalb die Registration selbst, strenger als vorher: sie kommt
      // genau einmal vor, mit genau diesen Argumenten, und die beiden
      // Nachbarzeilen sind genau ein Inject und genau ein Effekt.
      const settings = log.filter(
        (entry) => entry === 'inject ["settings"]' || entry.startsWith('configure ') || entry === 'effect',
      );
      assert.deepEqual(
        settings,
        ['inject ["settings"]', 'configure {"auto":false} fiber=ROOT_FIBER', 'effect'],
        `${file}: genau eine Registrierung, unveränderte Argumente`,
      );
      assert.equal(
        log.filter((entry) => entry === 'inject ["settings"]').length,
        1,
        `${file}: der Settings-Dienst wird genau einmal injiziert`,
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

  // Fail-closed, drei Fälle: ein unbestimmter Baustein, ein Baustein ohne seine
  // Parameter und unparsbare Parameter lassen die Datei unangetastet.
  const faelle = [
    {
      text: 'export function apply(ctx) { ctx.inject([], () => {}); }\n',
      grund: null, // ohne Marke gibt es hier nichts zu schreiben — und nichts zu räuspern
    },
    {
      text: '// >>> shinon:dsh-idiom gibt-es-nicht — EINE Quelle: scripts/lib/plugin-idioms.mjs\n// <<< shinon:dsh-idiom gibt-es-nicht\n',
      grund: 'unbekannter Baustein',
    },
    {
      text: "// >>> shinon:dsh-idiom settings-registration — EINE Quelle: scripts/lib/plugin-idioms.mjs params={'a':1}\n// <<< shinon:dsh-idiom settings-registration\n",
      grund: 'kein gültiges JSON',
    },
    {
      text: '// >>> shinon:dsh-idiom locale-fallback/menu — EINE Quelle: scripts/lib/plugin-idioms.mjs\n// <<< shinon:dsh-idiom locale-fallback/menu\n',
      grund: 'braucht params={table, key, label}',
    },
  ];
  for (const fall of faelle) {
    write(file, fall.text);
    const lauf = applyIdioms(root);
    assert.deepEqual(lauf.changed, [], `geänderte Datei bei: ${fall.grund ?? 'ohne Marke'}`);
    if (fall.grund === null) assert.deepEqual(lauf.failed, [], 'ohne Marke gibt es keinen Befund');
    else assert.ok(lauf.failed.some((finding) => finding.includes(fall.grund)), `Befund für: ${fall.grund}`);
    assert.equal(readFileSync(file, 'utf8'), fall.text, 'die Datei bleibt unangetastet');
  }
});
