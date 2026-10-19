#!/usr/bin/env node
/**
 * Narrative (Zug 6) — der Kanal hat einen Abnehmer.
 *
 * Der Befund, der dieses Gate nötig gemacht hat: `@shinon/narrative` emittierte
 * seit Zug 5 auf `shinon/narrative/state`, und diesen Kanal hatte NIEMAND
 * abonniert. Die Engine rechnete, der Composite ging ins Leere, und kein Test
 * konnte das sehen — die Paket-Tests prüfen die Mathematik, nicht die
 * Verdrahtung. Diese Datei prüft die Verdrahtung.
 *
 * Vier Ebenen:
 *   1. Der Vertrag: die Ableitung ist vollständig und jeder Mood-Ereignistyp
 *      existiert im Spine (ein Takt auf ein Ereignis, das es nicht gibt, klingt nie).
 *   2. Die Naht als DATEN: Kanalname und Vertragsname sind auf beiden Seiten
 *      LITERALE (kein Paket importiert das andere) — gepinnt über `twinIssues`
 *      und gegen das echte Bundle. Drift wäre hier STILL.
 *   3. `renderNarrative` ist rein: voller Composite → Abschnitt, fehlender → `null`.
 *      Kein leerer Abschnitt, keine Behauptung.
 *   4. Der echte Bundle-Pfad: das Persona-Bundle an einen Fake-Host gehängt, der
 *      nur `on`/`inject`/`get` kennt, ein Composite auf den Kanal geschickt — der
 *      Abschnitt erscheint, der Persona-Zustand bleibt unberührt (Vorrang!).
 *
 * Läuft mit `node --test` — kein DSH, kein node_modules (Schemastery-Stub).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as repo from '../../lib/repo.mjs';
import { EVENT_TYPES as SPINE_EVENTS } from '../plugins/events-spine.mjs';
import {
  COMPOSITE_FIELDS,
  CONSUMERS,
  EVIDENCE_LEVELS,
  NARRATIVE_CONTRACT_ID,
  STATE_CHANNEL,
  check,
  consumerIssues,
  contractIssues,
  staticIssues,
} from '../plugins/narrative.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PERSONA_DIR = join(ROOT, 'packages/persona');
const NARRATIVE_CONTRACT = join(ROOT, 'packages/narrative/assets/narrative-state.json');
const PERSONA_CONTRACT = join(PERSONA_DIR, 'assets/persona-state.json');

const personaContract = JSON.parse(readFileSync(PERSONA_CONTRACT, 'utf8'));
const narrativeContract = JSON.parse(readFileSync(NARRATIVE_CONTRACT, 'utf8'));
const personaSource = readFileSync(join(PERSONA_DIR, 'index.js'), 'utf8');
const prompterSource = readFileSync(join(ROOT, 'packages/prompter/index.js'), 'utf8');

/** Bundle isoliert laden: Kopie + Schemastery-Stub (nur Config-Konstruktion). */
async function loadBundle(dir, prefix) {
  const work = mkdtempSync(join(tmpdir(), prefix));
  cpSync(join(ROOT, 'packages', dir), join(work, 'pkg'), { recursive: true });
  const stub = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-stub', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(stub, 'index.js'), 'const p = new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : p), apply: () => p, construct: () => p });\nexport default p;\n');
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

const persona = await loadBundle('persona', 'shinon-persona-narrative-');
const narrative = await loadBundle('narrative', 'shinon-narrative-test-');
const prompter = await loadBundle('prompter', 'shinon-prompter-narrative-');

/**
 * Die Quellen EINES Abnehmers, so wie das Gate sie liest: Hauptdatei,
 * Nachweisdatei und (nur wo es eine gibt) der Zustandsvertrag.
 */
function consumerInput(consumer) {
  const read = (rel) => {
    const full = join(ROOT, 'packages', consumer.dir, rel);
    return existsSync(full) ? readFileSync(full, 'utf8') : null;
  };
  const stateText = consumer.contractFile === null ? null : read(consumer.contractFile);
  return {
    consumer,
    sources: { main: read(consumer.file), evidence: read(consumer.evidenceFile) },
    stateContract: stateText === null ? null : JSON.parse(stateText),
  };
}

/**
 * Fake-Host: kennt `on` (Events), `inject` (System-Prompt) und EINE Leseabfrage —
 * nichts anderes. Jeder Zugriff auf etwas anderes fehlt schlicht.
 */
function createHost() {
  const handlers = new Map();
  const sections = [];
  const child = {
    effect(run) {
      const dispose = run();
      return () => dispose?.();
    },
    systemPrompt: {
      getSectionOrder(name) {
        return name === 'DEPLOYMENT_PERSONA_PREFIX' ? 10 : 9000;
      },
      section({ name, order, text }) {
        // Der echte Dienst löst `text` zur Assembly-Zeit auf; hier gibt es keine
        // Sitzung, also ist das die Identität — der Fake bleibt ein Host.
        const entry = { name, order, text: typeof text === 'function' ? text({}) : text };
        sections.push(entry);
        return () => {
          const at = sections.indexOf(entry);
          if (at >= 0) sections.splice(at, 1);
        };
      },
    },
  };
  const ctx = {
    on(name, handler) {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    inject(names, callback) {
      callback(child);
    },
    get() {
      return undefined;
    },
  };
  const dispatch = (channel, payload) => {
    const handler = handlers.get(channel);
    if (handler) handler(payload);
    return handler !== undefined;
  };
  const narrativeSection = () => sections.find((entry) => entry.name === 'shinon:narrative-arc');
  const stateSection = () => sections.find((entry) => entry.name === 'shinon:state');
  return { ctx, handlers, sections, dispatch, narrativeSection, stateSection };
}

function quiet(fn) {
  const log = console.log;
  const warn = console.warn;
  console.error = () => {};
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

const connect = () =>
  quiet(() => {
    const host = createHost();
    const dispose = persona.apply(host.ctx, {
      statePath: './assets/persona-state.json',
      eventsChannel: 'shinon/event',
      projectContextPath: '',
      // Die Persona spricht nur für einen AUSDRÜCKLICH benannten Workspace.
      workspaceRoot: ROOT,
      includeAugenhoehe: true,
      identity: 'IDENT',
      epistemic: 'EPI',
      changeClasses: 'CC',
      determinism: 'DET',
      discipline: 'DISC',
      report: 'REP',
    });
    return { ...host, dispose };
  });

const COMPOSITE = {
  seq: 7,
  mood: 'concerned',
  mood_reason: 'gate.failed',
  narrator: 'system',
  arc_id: 'arc-7',
  arc_events: 3,
  freezeThreshold: 20,
  relationship_state: 'established_duo',
  pair: ['shinon', 'user'],
  domain_resonance: { primary: 'gate', secondary: 'concerned' },
};

// ── 1. Der Vertrag ───────────────────────────────────────────────────────────

test('narrative: der echte Vertrag ist fehlerfrei', () => {
  assert.deepEqual(contractIssues(narrativeContract, 'narrative-state.json'), []);
});

test('narrative: jeder Mood-Ereignistyp ist ein Typ des Spines', () => {
  const byEvent = Object.keys(narrativeContract.rules.moodByEvidence);
  assert.ok(byEvent.length > 0);
  for (const type of byEvent) {
    assert.ok(SPINE_EVENTS.includes(type), `${type} ist kein Event-Typ des Spines`);
  }
});

test('narrative: jede Mood-Regel traegt Grund und Evidenz, jeder Takt ein Thema', () => {
  for (const [type, entry] of Object.entries(narrativeContract.rules.moodByEvidence)) {
    assert.ok(entry.reason.length > 0, `${type}: Grund fehlt`);
    assert.ok(['EVENT_TYPE', 'EXPLICIT_PAYLOAD'].includes(entry.evidence), `${type}: Evidenzlevel fehlt`);
    assert.ok(narrativeContract.rules.themeByEvent[type], `${type}: kein Thema`);
  }
  for (const transition of narrativeContract.rules.relationshipTransitions) {
    assert.ok(transition.reason.length > 0, 'Transition ohne Grund');
    assert.equal(transition.evidence, 'EXPLICIT_PAYLOAD', 'eine Payload-Regel ist EXPLICIT_PAYLOAD');
    assert.notEqual(transition.from, transition.to);
  }
});

test('narrative: der Composite trägt genau die Felder, die das Gate als Ausgang benennt', () => {
  const output = narrativeContract.derivation.composite.output;
  for (const field of COMPOSITE_FIELDS) {
    assert.ok(output.includes(field), `${field} fehlt in derivation.composite.output`);
  }
});

test('narrative: ein erfundener Mood-Ereignistyp wird gemeldet (Mutationsprobe)', () => {
  const broken = JSON.parse(JSON.stringify(narrativeContract));
  broken.rules.moodByEvidence['gibt.es.nicht'] = { mood: 'curious', reason: 'erfunden', evidence: 'EVENT_TYPE' };
  const issues = contractIssues(broken, 'narrative-state.json');
  assert.ok(issues.some((issue) => issue.includes('gibt.es.nicht')), issues.join('\n'));
});

test('narrative: eine Transition ohne Grund, Evidenz oder Zustand wird gemeldet', () => {
  const withoutReason = JSON.parse(JSON.stringify(narrativeContract));
  delete withoutReason.rules.relationshipTransitions[0].reason;
  assert.match(contractIssues(withoutReason, 'x.json').join('\n'), /reason fehlt/);

  const wrongEvidence = JSON.parse(JSON.stringify(narrativeContract));
  wrongEvidence.rules.relationshipTransitions[0].evidence = 'NONE';
  assert.match(contractIssues(wrongEvidence, 'x.json').join('\n'), /evidence muss/);

  const unknownState = JSON.parse(JSON.stringify(narrativeContract));
  unknownState.rules.relationshipTransitions[0].to = 'beste_freunde';
  assert.match(contractIssues(unknownState, 'x.json').join('\n'), /from\/to/);

  const duplicate = JSON.parse(JSON.stringify(narrativeContract));
  duplicate.rules.relationshipTransitions.push({ ...duplicate.rules.relationshipTransitions[0] });
  assert.match(contractIssues(duplicate, 'x.json').join('\n'), /nicht entscheidbar/);
});

test('narrative: ein Hash als Bedeutungsquelle wird im Kern gemeldet (Mutationsprobe)', () => {
  const source = readFileSync(join(ROOT, 'packages/narrative/assets/narrative-core.js'), 'utf8');
  assert.deepEqual(staticIssues([{ file: 'core.js', source }]), [], 'der echte Kern ist sauber');
  const withHash = `${source}\nexport const score = (pair) => djb2(pair) % 100;\n`;
  assert.ok(staticIssues([{ file: 'core.js', source: withHash }]).some((issue) => issue.includes('djb2')));
});

test('narrative: eine fehlende Autoritäts-Aussage wird gemeldet', () => {
  const broken = JSON.parse(JSON.stringify(narrativeContract));
  delete broken.authority;
  assert.match(contractIssues(broken, 'narrative-state.json').join('\n'), /authority muss "NONE" sein/);
});

// ── 2. Die Naht als Daten ────────────────────────────────────────────────────

test('narrative: der Kanalname des Gates ist der des Pakets', () => {
  assert.equal(narrative.STATE_CHANNEL, STATE_CHANNEL);
  assert.equal(narrative.STATE_CONTRACT, NARRATIVE_CONTRACT_ID);
});

test('narrative: die Evidenzlevel des Gates sind die des Kerns', () => {
  assert.deepEqual([...narrative.EVIDENCE_LEVELS], EVIDENCE_LEVELS);
});

test('narrative: Kanal und Vertragsname stehen als Literal im Abnehmer (kein Import über Paketgrenzen)', () => {
  assert.ok(personaSource.includes(`'${narrative.STATE_CHANNEL}'`), `der Abnehmer trägt '${narrative.STATE_CHANNEL}' nicht`);
  assert.ok(personaSource.includes(`'${narrative.STATE_CONTRACT}'`), `der Abnehmer trägt '${narrative.STATE_CONTRACT}' nicht`);
});

test('narrative: das Zwillings-Gate kennt die Naht (keine stille Drift)', () => {
  const twin = repo.SOURCE_TWINS.find((entry) => entry.owner === 'packages/narrative/index.js');
  assert.ok(twin, 'die Naht Narrative -> Persona ist nicht als Zwilling deklariert');
  assert.equal(twin.kind, 'literals');
  assert.equal(twin.mirror, 'packages/persona/index.js');
  assert.deepEqual(twin.values.map((value) => value.export).sort(), ['STATE_CHANNEL', 'STATE_CONTRACT']);
  assert.deepEqual(repo.twinIssues(), []);
});

test('narrative: BEIDE Abnehmer sind vollständig verdrahtet', () => {
  assert.deepEqual(CONSUMERS.map((consumer) => consumer.dir), ['persona', 'prompter'], 'es sind zwei Abnehmer — Persona und Veredler');
  for (const consumer of CONSUMERS) {
    const input = consumerInput(consumer);
    assert.deepEqual(consumerIssues(input.consumer, input.sources, input.stateContract), [], `${consumer.dir} ist nicht verdrahtet`);
  }
});

test('narrative: ein Abnehmer ohne Kanal-Literal wird gemeldet (Mutationsprobe)', () => {
  for (const consumer of CONSUMERS) {
    const input = consumerInput(consumer);
    const broken = { main: input.sources.main.replaceAll(`'${STATE_CHANNEL}'`, "'falscher/kanal'"), evidence: input.sources.evidence };
    const issues = consumerIssues(input.consumer, broken, input.stateContract);
    assert.ok(issues.some((issue) => issue.includes('nicht als Literal')), `${consumer.dir}: ${issues.join('\n')}`);
  }
});

test('narrative: ein fehlender Nachweis in der Nachweisdatei wird gemeldet (Mutationsprobe)', () => {
  const prompterConsumer = CONSUMERS.find((consumer) => consumer.dir === 'prompter');
  const input = consumerInput(prompterConsumer);
  const issues = consumerIssues(input.consumer, { ...input.sources, evidence: '<nichts_davon>' }, null);
  assert.ok(issues.some((issue) => issue.includes('<narrative')), issues.join('\n'));
});

test('narrative: ein Abnehmer ohne narrative-Block im Vertrag wird gemeldet', () => {
  const personaConsumer = CONSUMERS.find((consumer) => consumer.dir === 'persona');
  const input = consumerInput(personaConsumer);
  const broken = JSON.parse(JSON.stringify(personaContract));
  delete broken.narrative;
  const issues = consumerIssues(input.consumer, input.sources, broken);
  assert.ok(issues.some((issue) => issue.includes('narrative-Block fehlt')), issues.join('\n'));
});

// ── 2b. Der zweite Abnehmer: der Veredler (MAX) ─────────────────────────────

test('narrative: der Veredler trägt Kanal und Vertragsname als Literal (Zwilling)', () => {
  assert.ok(prompterSource.includes(`'${STATE_CHANNEL}'`), 'der Kanalname fehlt im Veredler');
  assert.ok(prompterSource.includes(`'${narrative.STATE_CONTRACT}'`), 'der Vertragsname fehlt im Veredler');
  const twin = repo.SOURCE_TWINS.find((entry) => entry.mirror === 'packages/prompter/index.js' && entry.owner === 'packages/narrative/index.js');
  assert.ok(twin, 'der Veredler ist nicht als Zwilling der Narrative-Naht deklariert');
  assert.deepEqual(twin.values.map((value) => value.export).sort(), ['STATE_CHANNEL', 'STATE_CONTRACT']);
});

test('narrative: der Zwilling liest das ganze Prompter-Paket — ein Modulschnitt ist keine Drift', () => {
  const twin = repo.SOURCE_TWINS.find((entry) => entry.owner === 'packages/narrative/index.js' && entry.mirror === 'packages/prompter/index.js');
  assert.equal(twin?.mirrorScope, 'package', 'der Veredler ist modular — der Zwilling muss index.js UND assets/*.js lesen');

  // Miniatur-Baum: der Besitzer liefert die Namen, der Spiegel trägt sie NICHT
  // in seiner Komposition, sondern in einem `assets/`-Kern. Vorher war das rot,
  // obwohl keine Drift existierte — genau die Falle, die dieser Test schließt.
  const root = mkdtempSync(join(tmpdir(), 'shinon-twin-'));
  try {
    mkdirSync(join(root, 'packages', 'narrative'), { recursive: true });
    mkdirSync(join(root, 'packages', 'prompter', 'assets'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'narrative', 'index.js'),
      `export const STATE_CHANNEL = '${STATE_CHANNEL}';\nexport const STATE_CONTRACT = '${NARRATIVE_CONTRACT_ID}';\n`,
    );
    writeFileSync(join(root, 'packages', 'prompter', 'index.js'), 'export const composition = true;\n');
    const asset = join(root, 'packages', 'prompter', 'assets', 'narrative-seam.js');
    writeFileSync(asset, `const NARRATIVE_CHANNEL = '${STATE_CHANNEL}';\nconst NARRATIVE_CONTRACT = '${NARRATIVE_CONTRACT_ID}';\n`);
    assert.deepEqual(repo.twinIssues(root, [twin]), [], 'die Literale im assets-Kern gelten');
    assert.equal(repo.twinIssues(root, [{ ...twin, mirrorScope: 'file' }]).length, 2, 'ohne package-Scope bleibt die enge Prüfung');

    writeFileSync(asset, 'export const moved = true;\n');
    const issues = repo.twinIssues(root, [twin]);
    assert.equal(issues.length, 2, issues.join('\n'));
    assert.ok(issues.every((issue) => issue.includes('spiegelt')), issues.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('narrative: renderStand macht aus dem Composite ein <narrative>-Element — aus nichts nichts', () => {
  assert.equal(prompter.renderStand({ stance: null, tendencies: [], notes: [] }), null, 'ohne Inhalt kein Stand');
  assert.equal(
    prompter.renderStand({ stance: null, tendencies: [], notes: [], narrative: {} }),
    null,
    'ein Composite ohne Feld ergibt kein Element',
  );
  const block = prompter.renderStand({
    stance: null,
    tendencies: [],
    notes: [],
    narrative: COMPOSITE,
    narrativeContract: NARRATIVE_CONTRACT_ID,
  });
  assert.ok(block.startsWith('<shinon_stand>'), 'der Stand bleibt EIN Block');
  assert.ok(block.includes(`<narrative contract="${NARRATIVE_CONTRACT_ID}">`), 'die Herkunft fehlt am Element');
  for (const value of ['arc-7', 'system', 'established_duo', 'concerned']) {
    assert.ok(block.includes(value), `${value} fehlt im Stand`);
  }
  assert.ok(block.endsWith('</shinon_stand>'));
  assert.equal(block.split('</narrative>').length - 1, 1, 'genau ein Element, nicht mehrere');
});

test('narrative: standFor nimmt den Composite aus dem Laufzeit-Zustand in den Stand auf', () => {
  const config = { notesPath: '', skillsPath: '' };
  assert.equal(prompter.standFor(config, {}, 'text', null, null).block, null, 'ohne alles kein Stand');

  const withNarrative = prompter.standFor(config, { narrative: COMPOSITE }, 'text', null, null);
  assert.ok(withNarrative.block.includes('<narrative'), 'der Arc fehlt im Stand');
  assert.equal(withNarrative.narrative.arc_id, 'arc-7');
  assert.equal(withNarrative.narrative.narrator, 'system');
  // Die Spur ist ein Datensatz, kein Prompt-Block: kein Fliesstext darin.
  const trace = prompter.standTrace(withNarrative);
  assert.equal(trace.narrative.arc_id, 'arc-7');
  assert.equal(JSON.stringify(trace).includes('<narrative'), false);
});

test('narrative: der umgekehrte Weg — ein fremder Composite wird nicht erfunden', () => {
  const config = { notesPath: '', skillsPath: '' };
  const stand = prompter.standFor(config, { narrative: null }, 'text', null, null);
  assert.equal(stand.block, null);
  assert.equal(stand.narrative, null);

  // Der Kanal steht jedem offen: ein Wert, der keine Lage IST — Text, Zahl,
  // Array —, wird nicht zu einer Lage umgedeutet. Sonst widersprächen sich Block
  // („keine Lage") und Datensatz („Lage ohne Felder") über denselben Stand.
  for (const foreign of ['arc-7', 42, [], ['arc-7']]) {
    const fremd = prompter.standFor(config, { narrative: foreign }, 'text', null, null);
    assert.equal(fremd.narrative, null, `${JSON.stringify(foreign)} ist keine Lage`);
    assert.equal(String(fremd.block ?? '').includes('<narrative'), false, `${JSON.stringify(foreign)} erfindet kein Element`);
  }
});

// ── 3. Die reine Funktion ────────────────────────────────────────────────────

test('narrative: renderNarrative macht aus einem Composite einen Abschnitt — aus nichts nichts', () => {
  assert.equal(persona.renderNarrative(personaContract, null), null);
  assert.equal(persona.renderNarrative(personaContract, undefined), null);
  assert.equal(persona.renderNarrative(personaContract, 'kein objekt'), null);
  assert.equal(persona.renderNarrative(personaContract, {}), null, 'ein Composite ohne Feld ergibt keinen Abschnitt');
  assert.equal(persona.renderNarrative({}, COMPOSITE), null, 'ohne Beschriftung im Vertrag keine Sektion');

  const text = persona.renderNarrative(personaContract, COMPOSITE);
  assert.ok(text.startsWith(personaContract.narrative.heading));
  for (const value of ['arc-7', 'system', 'concerned', 'established_duo']) {
    assert.ok(text.includes(value), `${value} fehlt im Abschnitt`);
  }
  // Die Herkunft steht dabei: die Sektion behauptet nicht, sie sei die Persona.
  assert.match(text, /authority NONE/);
  assert.ok(text.includes(narrative.STATE_CONTRACT));
});

test('narrative: ein teilweise gefüllter Composite lässt nur Vorhandenes durch', () => {
  const text = persona.renderNarrative(personaContract, { arc_id: 'arc-9', narrator: null, seq: 0 });
  assert.ok(text.includes('arc-9'));
  assert.equal(text.includes('Erzähler'), false, 'ein fehlendes Feld wird nicht behauptet');
  // `seq: 0` ist ein WERT, kein Fehlen: 0 muss durchkommen.
  assert.ok(text.includes('Takt: 0'));
});

// ── 4. Der echte Bundle-Pfad ─────────────────────────────────────────────────

test('narrative: ohne Composite gibt es keinen narrativen Abschnitt', () => {
  const host = connect();
  assert.equal(host.narrativeSection(), undefined);
  assert.equal(host.handlers.has(STATE_CHANNEL), true, 'der Kanal muss abonniert sein, auch ohne Ereignis');
  host.dispose();
});

test('narrative: ein Composite auf dem Kanal erscheint als Abschnitt im Prompt', () => {
  const host = connect();
  assert.equal(host.dispatch(STATE_CHANNEL, COMPOSITE), true);
  const section = host.narrativeSection();
  assert.ok(section, 'der Abschnitt shinon:narrative-arc fehlt');
  assert.equal(section.text.includes('arc-7'), true);
  // Ersetzen, nicht anhängen: genau EIN narrativer Abschnitt bleibt.
  host.dispatch(STATE_CHANNEL, { ...COMPOSITE, arc_id: 'arc-8' });
  assert.equal(host.sections.filter((entry) => entry.name === 'shinon:narrative-arc').length, 1);
  assert.ok(host.narrativeSection().text.includes('arc-8'));
  host.dispose();
});

test('narrative: der Composite ändert den Persona-ZUSTAND nicht (der eigene Mood bleibt maßgeblich)', () => {
  const host = connect();
  const before = host.stateSection().text;
  host.dispatch(STATE_CHANNEL, COMPOSITE);
  assert.equal(host.stateSection().text, before, 'der narrativen Stimmung darf der Zustand nicht folgen');
  // Und der Persona-Mood kommt weiterhin aus dem Spine, nicht aus der Narrative.
  host.dispatch('shinon/event', { event_type: 'gate.failed', session_id: 's1' });
  assert.match(host.stateSection().text, /"mood": "concerned"/);
  assert.match(host.narrativeSection().text, /Narrative Stimmung/);
  host.dispose();
});

test('narrative: nach dispose kommt kein Composite mehr an', () => {
  const host = connect();
  host.dispose();
  assert.equal(host.dispatch(STATE_CHANNEL, COMPOSITE), false);
  assert.equal(host.narrativeSection(), undefined);
});

// ── 5. Das Gate selbst, gegen dieses Repo ────────────────────────────────────

test('narrative: das Gate läuft gegen dieses Repo grün', () => {
  const root = repo.readRoot();
  const packages = repo.discover(root);
  assert.deepEqual(check({ root, packages, repo }), []);
});

test('narrative: das Gate meldet einen fehlenden Abnehmer (Mutationsprobe über den Slice)', () => {
  const root = repo.readRoot();
  const packages = repo.discover(root).filter((pkg) => pkg.dir !== 'persona');
  const issues = check({ root, packages, repo });
  assert.ok(issues.some((issue) => issue.includes('keinen Abnehmer')), issues.join('\n'));
});

test('narrative: der Vertrag liegt im Paket und wird ausgeliefert', () => {
  assert.ok(existsSync(NARRATIVE_CONTRACT));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'packages/narrative/package.json'), 'utf8'));
  assert.equal(manifest.exports['./assets/narrative-state.json'], './assets/narrative-state.json');
});
