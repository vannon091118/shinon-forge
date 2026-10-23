#!/usr/bin/env node
/**
 * scripts/gate/tests/tool-seams.test.mjs — die zwei Modell-Werkzeuge (Audit #23).
 *
 * WORUM ES GEHT: `shinon_block_propose` (prompter) und `shinon_goal_micro_state`
 * (task-router) waren als „externe Naht" deklariert, weil ihr Abnehmer
 * außerhalb des Baums liegen sollte. Das war die halbe Wahrheit: der Abnehmer
 * ist der AGENT, und ein Modell erreicht ihn nur über ein Werkzeug.
 * `@deepseek-ai/dsh-tools` verweigert bei `tools.register` eine Definition ohne
 * `output = { schema, render }` — genau der Grund, aus dem die zwei Dienste
 * vorher keinen Leser hatten. Jetzt tragen sie einen.
 *
 * WAS HIER GEPINNT WIRD (fünf Zusagen, je mit einer echten Probe):
 *
 *   1. NAME IST NAHT — das Werkzeug heißt wie der Dienst, und den Namen gibt
 *      es genau einmal (`PROPOSE_SERVICE`, `MICRO_STATE_SERVICE`).
 *   2. OUTPUT IST DER VERTRAG DER NAHT — `contract` ist eine `const` im Schema,
 *      kein zweiter Vertragsname. `additionalProperties: false` verhindert,
 *      dass ein Werkzeug eine sechste Angabe mitschmuggelt.
 *   3. DIE PROJEKTION ERFÜLLT IHR EIGENES SCHEMA — die vier Lagen aus §18
 *      (NO_GOAL, UNAVAILABLE, blocked, mit Fakt) werden gegen DSHs eigenen
 *      Werteprüfer gehalten, nicht gegen eine Nachbildung.
 *   4. FAIL-CLOSED BLEIBT FAIL-CLOSED — ein abgelehnter Vorschlag nennt seinen
 *      Befund, ein werfender Dienst wird `UNAVAILABLE` (nie `NO_GOAL`), ein
 *      fremder Vertrag am selben Dienstnamen ebenso.
 *   5. VERDRAHTET, NICHT NUR DEFINIERT — beide Host-Hälften fordern `tools`
 *      über den Orchestrator an (`bus.demand`) und registrieren dort ihr
 *      Werkzeug; kein Literal-Name, keine zweite Definition.
 *
 * Die Mutationsprobe am Ende ist der eigentliche Wert: ein Schema, das nichts
 * ablehnt, wäre ein Vertrag, der nur wie einer aussieht. Sie entfernt ein Feld
 * und ein `const` aus einer KOPIE und erwartet je eine Verletzung.
 *
 * Läuft ohne installierte `node_modules` für alles außer der DSH-Prüfung
 * selbst; fehlt `@deepseek-ai/dsh-tools`, wird der DSH-Teil SICHTBAR mit Grund
 * übersprungen (dieselbe Regel wie beim Store-Test) — nie still grün.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCK_MODI, PROPOSE_CONTRACT, PROPOSE_SERVICE } from '../../../packages/prompter/assets/block-review.js';
import { createProposeTool, proposeToolValue } from '../../../packages/prompter/assets/propose-tool.js';
import {
  MICRO_NO_GOAL,
  MICRO_STATE_CONTRACT,
  MICRO_STATE_FIELDS,
  MICRO_STATE_SERVICE,
  MICRO_UNAVAILABLE,
  projectMicroState,
} from '../../../packages/task-router/assets/micro-state.js';
import { createMicroStateTool, MICRO_STATE_TOOL_OUTPUT, microStateToolValue } from '../../../packages/task-router/assets/micro-state-tool.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** DSH selbst prüfen — nicht eine Nachbildung seiner Regeln. */
let tools = null;
try {
  tools = await import('@deepseek-ai/dsh-tools');
} catch {
  tools = null;
}
const DSH_REASON = '`@deepseek-ai/dsh-tools` ist nicht installiert — Schema- und Werteprüfung gegen DSH übersprungen (npm install nötig)';
const dshCheck = typeof tools?.assertSupportedJsonSchema === 'function' && typeof tools?.validateJsonSchemaValue === 'function';

/** Die Argumente eines gültigen Vorschlags — die Form, die das Schema verlangt. */
function proposalArgs(overrides = {}) {
  return {
    thema: 'fehlerpfad',
    bei: 'wenn ein Werkzeug mit Fehler endet',
    immer: 'Nenne den Fehlerpfad, bevor du den Fix beschreibst.',
    weil: 'Der Fix ohne Pfad ist eine Vermutung.',
    beleg: 'docs/TAGEBUCH.md, Lauf vom 2026-10-23',
    id: 'stand-fehlerpfad',
    lage: 'system',
    budgetTokens: 220,
    haystack: ['fehlerpfad', 'stacktrace'],
    ...overrides,
  };
}

/** Jedes Feld des Mikrostands in einem lesbaren Wert. */
const FULL_VIEW = {
  phase: 'blocked',
  objective: 'Den Vertrag schließen',
  activation: 'armed',
  blockedReason: { code: 'GATE_ROT', message: 'Schema-Drift' },
};

test('der Werkzeugname IST der Nahtname — einmal definiert, nicht abgeschrieben', () => {
  const proposeTool = createProposeTool(() => ({ ok: true, findings: [] }));
  const microStateTool = createMicroStateTool({ state: () => projectMicroState(null) });

  assert.equal(proposeTool.name, PROPOSE_SERVICE, 'der Werkzeugname weicht von PROPOSE_SERVICE ab');
  assert.equal(microStateTool.name, MICRO_STATE_SERVICE, 'der Werkzeugname weicht von MICRO_STATE_SERVICE ab');
  // Der Kanon-Literalwert selbst — ein Umbenennen des Dienstes ist damit auch
  // ein Umbenennen des Werkzeugs, und zwar an einer Stelle.
  assert.equal(proposeTool.name, 'shinon_block_propose');
  assert.equal(microStateTool.name, 'shinon_goal_micro_state');
});

test('der output-Vertrag ist der Vertrag der Naht und von DSH akzeptiert', { skip: dshCheck ? false : DSH_REASON }, () => {
  const proposeTool = createProposeTool(() => ({ ok: true, findings: [] }));
  const microStateTool = createMicroStateTool({ state: () => projectMicroState(null) });

  assert.equal(proposeTool.output.schema.properties.contract.const, PROPOSE_CONTRACT);
  assert.deepEqual(proposeTool.output.schema.required, ['contract', 'ok', 'blockId', 'findings']);
  assert.equal(proposeTool.output.schema.additionalProperties, false);
  assert.equal(typeof proposeTool.output.render, 'function');

  assert.equal(microStateTool.output.schema.properties.contract.const, MICRO_STATE_CONTRACT);
  assert.deepEqual(microStateTool.output.schema.required, ['contract', ...MICRO_STATE_FIELDS]);
  assert.deepEqual(Object.keys(microStateTool.output.schema.properties), ['contract', ...MICRO_STATE_FIELDS]);
  assert.equal(MICRO_STATE_TOOL_OUTPUT.additionalProperties, false);

  // Die Teilmenge, die DSH wirklich prüft — nicht „sieht aus wie JSON Schema".
  for (const tool of [proposeTool, microStateTool]) {
    assert.doesNotThrow(() => tools.assertSupportedJsonSchema(tool.output.schema), `${tool.name}: Schema außerhalb der DSH-Teilmenge`);
  }

  // Was das Modell zu sehen bekommt: `parameters` und `output` müssen sich in
  // die SDK-Deklaration projizieren lassen — die Form, die die Oberfläche liest.
  const sdk = tools.renderToolsSdk([proposeTool, microStateTool].map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    output: tool.output.schema,
  })));
  for (const name of [proposeTool.name, microStateTool.name]) assert.ok(sdk.includes(name), `${name} fehlt in der SDK-Deklaration`);
  for (const fragment of ['blockId', 'findings', ...MICRO_STATE_FIELDS]) {
    assert.ok(sdk.includes(fragment), `${fragment} fehlt in der SDK-Deklaration`);
  }

  // Die Pflichtfelder des Vorschlags sind die Hülle plus der Kern, den der
  // Veredler prüft — ein optionales Feld hier wäre ein Feld, das fehlen darf.
  assert.deepEqual(
    proposeTool.parameters.required,
    ['thema', 'bei', 'immer', 'weil', 'beleg', 'id', 'lage', 'budgetTokens', 'haystack'],
  );
  assert.deepEqual(microStateTool.parameters.required, undefined, 'der Mikrostand braucht keine Pflichtangabe');
});

test('die Projektion erfüllt ihr eigenes Ausgabe-Schema in allen vier Lagen', { skip: dshCheck ? false : DSH_REASON }, () => {
  const tool = createMicroStateTool({ state: () => projectMicroState(null) });
  const values = {
    'NO_GOAL': projectMicroState(null),
    'UNAVAILABLE': projectMicroState(null, { unavailable: true }),
    'blocked': projectMicroState(FULL_VIEW),
    'mit Fakt': projectMicroState(FULL_VIEW, { fact: 'npm test Exit 0' }),
  };

  for (const [label, value] of Object.entries(values)) {
    assert.deepEqual(Object.keys(value), ['contract', ...MICRO_STATE_FIELDS], `${label}: Feldsatz oder Reihenfolge driftet`);
    assert.deepEqual(tools.validateJsonSchemaValue(tool.output.schema, value), [], `${label}: Projektion verletzt das Werkzeug-Schema`);
    const [block] = tool.output.render({}, value);
    assert.equal(block.type, 'text');
    for (const field of MICRO_STATE_FIELDS) assert.ok(block.text.includes(field), `${label}: ${field} fehlt im Text`);
  }

  assert.equal(values['NO_GOAL'].CURRENT_STATE, MICRO_NO_GOAL);
  assert.equal(values['UNAVAILABLE'].CURRENT_STATE, MICRO_UNAVAILABLE);
  assert.equal(values['blocked'].CURRENT_BLOCKER, 'GATE_ROT: Schema-Drift');
  assert.equal(values['mit Fakt'].LAST_VERIFIED_FACT, 'npm test Exit 0');
  assert.equal(values['NO_GOAL'].LAST_VERIFIED_FACT, '', 'ohne Quelle ist der Fakt leer, nicht erfunden');
});

test('ein abgelehnter Vorschlag nennt seinen Befund und bleibt im Vertrag', { skip: dshCheck ? false : DSH_REASON }, async () => {
  const seen = [];
  const tool = createProposeTool((proposal) => {
    seen.push(proposal);
    return { ok: false, findings: ['doppelt: mit stand-zettel (2 gemeinsame Begriffe, Anteil 100%)'] };
  });
  const value = await tool.execute(proposalArgs(), {});

  assert.equal(value.contract, PROPOSE_CONTRACT);
  assert.equal(value.ok, false);
  assert.equal(value.blockId, 'stand-fehlerpfad', 'die angefragte Kennung muss zurückkommen');
  assert.equal(value.findings.length, 1);
  assert.deepEqual(tools.validateJsonSchemaValue(tool.output.schema, value), []);

  const [block] = tool.output.render({}, value);
  assert.match(block.text, /abgelehnt/);
  assert.ok(block.text.includes(value.findings[0]), 'der Befund fehlt im Text');

  // Die Übersetzung ist die eine Stelle, an der Argumente zu einem Vorschlag werden.
  const [proposal] = seen;
  assert.equal(proposal.block.quelle, 'gelernt', 'ein Vorschlag ist ein gelernter Baustein');
  assert.deepEqual(proposal.block.modus, [...BLOCK_MODI], 'ohne Modusangabe gelten alle Modi');
  assert.deepEqual(proposal.block.ausloeser, { haystack: ['fehlerpfad', 'stacktrace'] });
});

test('ein angenommener Vorschlag nennt Block und Vertrag', async () => {
  const tool = createProposeTool(() => ({ ok: true, findings: [], block: 'stand-fehlerpfad' }));
  const value = await tool.execute(proposalArgs({ ohneAnlass: true, modus: ['MAX'], intentKlassen: ['debug'] }), {});
  assert.equal(value.ok, true);
  assert.equal(value.blockId, 'stand-fehlerpfad');
  assert.deepEqual(value.findings, []);
  const [block] = tool.output.render({}, value);
  assert.match(block.text, /ist aktiv/);
  assert.ok(block.text.includes(PROPOSE_CONTRACT));
});

test('fail-closed: kein Wurf, kein fremder Vertrag, kein erfundenes Ziel', { skip: dshCheck ? false : DSH_REASON }, async () => {
  const throwing = createProposeTool(() => {
    throw new Error('Ablage unlesbar');
  });
  const thrown = await throwing.execute(proposalArgs(), {});
  assert.equal(thrown.ok, false);
  assert.match(thrown.findings[0], /^FEHLER:Ablage unlesbar$/);
  assert.deepEqual(tools.validateJsonSchemaValue(throwing.output.schema, thrown), []);

  const noSeam = await createProposeTool(undefined).execute(proposalArgs(), {});
  assert.deepEqual(noSeam.findings, ['KEINE_NAHT']);

  // Ein Dienst unter dem richtigen Namen, der den Vertrag nicht trägt, ist ein
  // Lesefehler — und ein Lesefehler ist UNAVAILABLE, nie NO_GOAL.
  const foreign = microStateToolValue({ contract: 'shinon.fremd/v1', OBJECTIVE: 'x' });
  assert.equal(foreign.CURRENT_STATE, MICRO_UNAVAILABLE);
  assert.equal(foreign.OBJECTIVE, '', 'aus einem fremden Vertrag wird nichts übernommen');
  assert.deepEqual(tools.validateJsonSchemaValue(MICRO_STATE_TOOL_OUTPUT, foreign), []);

  const noService = await createMicroStateTool(null).execute({}, {});
  assert.equal(noService.CURRENT_STATE, MICRO_UNAVAILABLE);
  const noAgent = await createMicroStateTool({ state: () => projectMicroState(null) }).execute({}, undefined);
  assert.equal(noAgent.CURRENT_STATE, MICRO_NO_GOAL);
});

test('der Agent kommt aus der Ausführung, der Fakt aus den Argumenten', async () => {
  const calls = [];
  const service = {
    state(agent, options) {
      calls.push({ agent, options });
      return projectMicroState(FULL_VIEW, options);
    },
  };
  const tool = createMicroStateTool(service);
  const agent = { id: 'agent-1' };

  const value = await tool.execute({ fact: 'Exit 0' }, { agent });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agent, agent, 'der lebende Agent wird durchgereicht, nicht erfunden');
  assert.deepEqual(calls[0].options, { fact: 'Exit 0' });
  assert.equal(value.LAST_VERIFIED_FACT, 'Exit 0');

  await tool.execute({ fact: 42 }, {});
  assert.deepEqual(calls[1].options, { fact: '' }, 'ein Nicht-Text ist kein Fakt');
  assert.equal(calls[1].agent, null);
});

test('beide Host-Hälften fordern `tools` an und registrieren dort ihr Werkzeug', () => {
  const halves = [
    { file: 'packages/prompter/index.js', factory: 'createProposeTool', constant: 'PROPOSE_SERVICE' },
    { file: 'packages/task-router/index.js', factory: 'createMicroStateTool', constant: 'MICRO_STATE_SERVICE' },
  ];
  for (const half of halves) {
    const source = read(half.file);
    assert.match(source, /bus\.demand\(\['tools'\]/, `${half.file}: keine Anforderung des tools-Dienstes`);
    assert.ok(source.includes('child.tools.register('), `${half.file}: nichts registriert`);
    assert.ok(source.includes(`${half.factory}(`), `${half.file}: die Werkzeug-Fabrik fehlt`);
    // Der Name wird NICHT als Literal wiederholt: eine Zeile, ein Name.
    assert.ok(!source.includes("'shinon_block_propose'"), `${half.file}: der Werkzeugname steht als Literal`);
    assert.ok(!source.includes("'shinon_goal_micro_state'"), `${half.file}: der Werkzeugname steht als Literal`);
  }
});

test('beide Werkzeuge stehen im ECHTEN Werkzeug-Katalog — und ohne `output` kommt keins hinein', async (t) => {
  let Context;
  let ToolRuntime;
  try {
    ({ Context } = await import('@deepseek-ai/cordis'));
    ToolRuntime = (await import('@deepseek-ai/dsh-tools')).default;
  } catch {
    t.skip('cordis/dsh-tools fehlen — Katalogprobe übersprungen');
    return;
  }
  const ctx = new Context();
  // Der Katalog haengt seine Schemata an den System-Prompt; hier reicht die Form.
  ctx.provide('systemPrompt', { tools() {}, section() {} });
  const runtime = new ToolRuntime(ctx, {});

  const releasePropose = runtime.register(createProposeTool(() => ({ ok: true, findings: [] })));
  const releaseMicro = runtime.register(createMicroStateTool({ state: () => projectMicroState(FULL_VIEW) }));
  assert.deepEqual(runtime.schemas().map((schema) => schema.name).sort(), [PROPOSE_SERVICE, MICRO_STATE_SERVICE].sort());

  // Genau diese Verweigerung war der Grund, aus dem die zwei Dienste vorher
  // keinen Leser hatten: ohne `output` nimmt der Katalog die Definition nicht.
  assert.throws(
    () => runtime.register({ name: 'x_ohne_output', description: 'd', parameters: { type: 'object' }, execute: async () => ({}) }),
    /must declare output/,
  );

  releasePropose();
  releaseMicro();
  assert.deepEqual(runtime.schemas().map((schema) => schema.name), [], 'nach dem Abmelden bleibt nichts stehen');
});

test('Mutationsprobe: ein gelockertes Schema lässt den Vertrag durch (und wird rot)', { skip: dshCheck ? false : DSH_REASON }, () => {
  const value = projectMicroState(FULL_VIEW);

  // 1. Ein Feld entfernt → der Wert trägt eine nicht deklarierte Eigenschaft.
  const withoutField = {
    ...MICRO_STATE_TOOL_OUTPUT,
    properties: { ...MICRO_STATE_TOOL_OUTPUT.properties },
  };
  delete withoutField.properties.NEXT_ACTION;
  const fieldDrift = tools.validateJsonSchemaValue(withoutField, value);
  assert.ok(fieldDrift.length > 0, 'ein fehlendes Feld bleibt unbemerkt');
  assert.ok(fieldDrift.some((violation) => violation.includes('NEXT_ACTION')));

  // 2. `const` gelockert → ein fremder Vertragsname ginge als eigener durch.
  const looseContract = {
    ...MICRO_STATE_TOOL_OUTPUT,
    properties: { ...MICRO_STATE_TOOL_OUTPUT.properties, contract: { type: 'string' } },
  };
  assert.deepEqual(tools.validateJsonSchemaValue(looseContract, value), [], 'Probe ungültig: der Wert muss sauber sein');
  assert.ok(
    tools.validateJsonSchemaValue(MICRO_STATE_TOOL_OUTPUT, { ...value, contract: 'shinon.fremd/v1' }).length > 0,
    'ein fremder Vertragsname passiert das echte Schema',
  );

  // 3. Ein Vorschlagsergebnis ohne Befundliste ist kein gültiges Ergebnis.
  const proposeTool = createProposeTool(() => ({ ok: true, findings: [] }));
  assert.ok(tools.validateJsonSchemaValue(proposeTool.output.schema, { contract: PROPOSE_CONTRACT, ok: true, blockId: 'x' }).length > 0);
  assert.deepEqual(tools.validateJsonSchemaValue(proposeTool.output.schema, proposeToolValue({ ok: false, findings: ['x'], block: 'y' })), []);
});
