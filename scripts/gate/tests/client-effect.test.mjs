#!/usr/bin/env node
/**
 * scripts/gate/tests/client-effect.test.mjs — eine Client-Hälfte ohne Wirkung ist rot.
 *
 * Warum diese Datei existiert: `@shinon/narrative` und `@shinon/tooltip` hatten
 * beide eine Client-Hälfte, die im Browser ankam und NICHTS tat. Narrative rief
 * `console.log('[shinon-narrative] Client aktiviert')` und trug ein
 * `// TODO: Slot-Registrierung wenn Slot bekannt`; Tooltip injizierte eine Regel
 * für `.dsh-tooltip`, eine Klasse, die im Baum niemand setzt (gemessen: kein
 * Treffer in `node_modules/@deepseek-ai/**`). Beides liest sich wie eine
 * Fähigkeit und ist in Wahrheit eine Zeile Log. Kein Test konnte das sehen: die
 * Aktivierungs-Wache prüft, DASS `apply` läuft, nicht ob es etwas bewirkt.
 *
 * Die Regel, die hier steht, ist absichtlich schmal — sie gilt für die Hälften,
 * die WEDER einen Slot noch einen Dienst tragen und deren ganze Wirkung deshalb
 * in der gemeinsamen Plugin-Liste `__shinonPlugins` liegt (Konvention, kein
 * Import; dieselbe Liste liest `@shinon/dashboard`). Drei Zusagen je Hälfte:
 *
 *   1. Die Anmeldung ist da: ein Eintrag unter `@shinon/<dir>`, `kind: 'client'`.
 *   2. Das Update geht raus: ein `shinon:plugin`-Ereignis mit genau dieser id —
 *      sonst erfährt das Dashboard nie von der Hälfte.
 *   3. Der Eintrag LÜGT nicht: `detail` nennt einen Ort, den es im Baum gibt.
 *      Narrative zeigt keine Zahlen an (der Composite steht als Datensatz in der
 *      Entscheidungsspur des Prompters, `standFor`/`standTrace`); ein `detail`,
 *      das „prompt-section" behauptet, wäre genau die alte Zusage ohne Wirkung.
 *
 * Jede Zusage hat eine Mutationsprobe: eine Hälfte, die nur loggt, wird vom
 * selben Prüfer als Befund gemeldet. Der Test läuft über den echten Bundle-Pfad
 * (`__ModuleLoader__`, Browser-Attrappe aus `helpers/client-sandbox.mjs`) — kein
 * DSH, kein node_modules.
 */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { browserSandbox, loadClientBundle, requireStub } from './helpers/client-sandbox.mjs';
import { stripComments } from '../../lib/source-scan.mjs';

/** Die Hälften, deren ganze Wirkung die Plugin-Liste ist. */
const WIRKUNG = ['narrative', 'tooltip'];

/** Die Felder des Narrative-Composites — eine Kopie davon wäre eine zweite Wahrheit. */
const COMPOSITE_FIELDS = ['mood_reason', 'arc_id', 'arc_events', 'relationship_state', 'domain_resonance', 'mood_by_evidence'];

const sourceOf = (dir) => readFileSync(new URL(`../../../packages/${dir}/client.js`, import.meta.url), 'utf8');

/**
 * Eine geladene Hälfte an die Seite hängen, wie der Client-Runner es tut.
 * `dispatchEvent` wird VOR `apply` ersetzt: die Attrappe verschluckt Ereignisse,
 * und ein Test, der sie nicht sieht, prüft nur den ersten Teil der Zusage.
 */
function mount(dir) {
  const { registration, sandbox } = loadClientBundle(dir);
  const page = sandbox.sandbox;
  const events = [];
  page.dispatchEvent = (event) => {
    events.push(event);
    return true;
  };
  const plugin = registration.factory(requireStub());
  assert.ok(plugin !== null && typeof plugin === 'object', `${dir}: factory lieferte kein Plugin`);
  assert.equal(typeof plugin.apply, 'function', `${dir}: apply fehlt`);
  plugin.apply();
  return { id: registration.id, page, events, entry: page.__shinonPlugins?.get(registration.id), plugin };
}

/**
 * Die drei Zusagen als Befundliste — EINE Stelle, die echte Hälfte und Probe
 * liest. Ein zweiter Regelsatz für die Mutationsprobe würde genau den Fehler
 * wiederholen, den der Test findet.
 */
function effectIssues({ id, entry, events }) {
  const issues = [];
  if (entry === undefined) issues.push(`${id}: keine Anmeldung in __shinonPlugins`);
  else if (entry.kind !== 'client') issues.push(`${id}: kind ist ${String(entry.kind)} statt 'client'`);
  if (!events.some((event) => event.type === 'shinon:plugin' && event.detail?.id === id)) {
    issues.push(`${id}: kein shinon:plugin-Update mit dieser id`);
  }
  return issues;
}

test('narrative und tooltip melden sich an und senden das Update', () => {
  for (const dir of WIRKUNG) {
    const half = mount(dir);
    assert.deepEqual(effectIssues(half), [], `${dir} hat keine Wirkung`);
    assert.equal(half.entry.panel, null, `${dir} erfindet ein Panel, das es nicht gibt`);
    assert.ok(typeof half.entry.label === 'string' && half.entry.label !== '', `${dir} hat kein Label`);
  }
});

test('eine Hälfte, die nur loggt, wird gemeldet (Mutationsprobe)', () => {
  const LOG_ONLY = `
    window.__ModuleLoader__.load({
      id: '@shinon/narrative',
      factory() {
        return { inject: [], apply() { console.log('[shinon-narrative] Client aktiviert'); } };
      }
    });
  `;
  const sandbox = browserSandbox();
  vm.runInContext(LOG_ONLY, vm.createContext(sandbox.sandbox), { filename: 'narrative/client.js (Probe)' });
  const registration = sandbox.registration();
  const page = sandbox.sandbox;
  const events = [];
  page.dispatchEvent = (event) => {
    events.push(event);
    return true;
  };
  registration.factory(requireStub()).apply();
  const issues = effectIssues({
    id: registration.id,
    page,
    events,
    entry: page.__shinonPlugins?.get(registration.id),
  });
  assert.ok(issues.some((issue) => issue.includes('keine Anmeldung')), issues.join('\n'));
  assert.ok(issues.some((issue) => issue.includes('kein shinon:plugin-Update')), issues.join('\n'));
});

test('narrative nennt als Anzeigeort die Entscheidungsspur, und die gibt es', () => {
  const half = mount('narrative');
  assert.equal(half.entry.detail, 'decision-trace:prompter');
  // Der Ort muss im Baum existieren, sonst ist `detail` nur ein neues Versprechen.
  const prompter = readFileSync(new URL('../../../packages/prompter/index.js', import.meta.url), 'utf8');
  assert.match(prompter, /export \{[^}]*\bstandFor\b[^}]*\bstandTrace\b/, 'der Prompter exportiert standFor/standTrace nicht mehr');
  const persona = stripComments(readFileSync(new URL('../../../packages/persona/index.js', import.meta.url), 'utf8'));
  assert.ok(!persona.includes('shinon:narrative-arc'), 'die Persona trägt wieder einen Narrative-Abschnitt');
});

test('narrative führt keine zweite Kopie des Composites (Mutationsprobe)', () => {
  const source = stripComments(sourceOf('narrative'));
  const copied = COMPOSITE_FIELDS.filter((field) => source.includes(field));
  assert.deepEqual(copied, [], `narrative trägt Composite-Felder: ${copied.join(', ')} — die Zahlen gehören in die Spur des Prompters`);

  const withCopy = `${sourceOf('narrative')}\nconst verdraengt = { arc_id: composite.arc_id, mood_reason: composite.mood_reason };\n`;
  const again = COMPOSITE_FIELDS.filter((field) => stripComments(withCopy).includes(field));
  assert.ok(again.length > 0, 'die Kopie-Prüfung erkennt eine eingefügte Kopie nicht');
});
