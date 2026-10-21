#!/usr/bin/env node
/**
 * Der Live-Zustand der Persona als RUNTIME-CONTEXT — nicht als Abschnitt.
 *
 * ANLASS: Die Persona lieferte ihren Zustand bisher NUR als System-Prompt-
 * Abschnitt (`shinon:state`). Das ist ein Patch am System-Prompt: er wird pro
 * Schritt neu gebaut, aber er traegt den Anti-Drift-Satz nicht und er ersetzt
 * nichts — der Zustand steht neben dem Vorzustand, statt ihn zu ersetzen.
 *
 * Der DSH hat einen zweiten Kanal dafuer: `systemPrompt.context(...)`. Der Text
 * landet als NACHRICHT (source.kind 'runtime-context'), und der Agent-Loop
 * ersetzt den vorherigen Snapshot (RuntimeContextProjection, `retained`,
 * `surfaceOp: replace`). Der Prefix sagt dem Modell ausdruecklich:
 *   "Current runtime context. This snapshot supersedes earlier runtime-context snapshots."
 *
 * DIE ZUSAGE, die dieser Test pinnt:
 *   (a) der Live-Kontext erscheint MIT TEXT in den CONTEXTS,
 *   (b) er ist LEER, wenn die Persona still ist (fremder Workspace),
 *   (c) Zustand, Stimmung und Beziehung stehen drin, wenn sie gesetzt sind,
 *   (d) er erzeugt KEINEN 'none'-Snapshot (das waere eine Behauptung,
 *       es gaebe keinen Stand).
 *
 * Laeuft mit `node --test`; braucht `dsh` im PATH (wie prompter-contract).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/persona/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
const require = createRequire(join(root, 'package.json'));

/** Das Bundle isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation. */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-persona-live-'));
  const dir = join(work, 'pkg');
  cpSync(PACKAGE_DIR, dir, { recursive: true });
  provideSeamCore(dir);
  const shim = join(dir, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  return import(pathToFileURL(join(dir, 'index.js')).href);
}

const bundle = await loadBundle();
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const systemPromptModule = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')).href);
const { default: SystemPrompt, renderPrompt, renderContextSections, joinContextSections } = systemPromptModule;

function quiet(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

/** Der Kern des Pakets: der Live-Kontext wird dort gerechnet. */
const liveCore = await import(new URL('../../../packages/persona/assets/live-context.js', import.meta.url).href);

/** Ein fremder Workspace — fuer die stille Persona. */
const fremd = mkdtempSync(join(tmpdir(), 'shinon-fremd-'));

/**
 * Den echten System-Prompt UND die echten Contexts bauen.
 *
 * Der Test haengt das echte Bundle an den ECHTEN Dienst
 * `@deepseek-ai/dsh-system-prompt` und liest beide Achsen ueber dessen
 * oeffentliche Schnittstelle: `assemble()` liefert `sections` UND `contexts`,
 * `renderContextSections()` rendert die Contexts, `renderPrompt()` die
 * Abschnitte. Erst damit ist gemessen statt behauptet, dass der Zustand in
 * der NACHrichtenliste landet und nicht nur im System-Prompt.
 */
async function beides(overrides = {}, { sessionCwd } = {}) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await quiet(() => ctx.plugin(bundle, {
    workspaceRoot: REPO_ROOT,
    identity: 'PERSONA-IDENTITY-MARKE',
    includeAugenhoehe: false,
    alwaysKnowIdentity: false,
    ...overrides,
  }));
  const assembly = sessionCwd === undefined
    ? await ctx.systemPrompt.assemble({})
    : await ctx.waterfall(ctx, 'agent/pre-step', { agent: { session: { header: { cwd: sessionCwd } } } }, () =>
        ctx.systemPrompt.assemble({}),
      );
  const prompt = quiet(() => renderPrompt(assembly));
  const contexts = quiet(() => renderContextSections(assembly));
  return { prompt, assembly, contexts, joined: quiet(() => joinContextSections(contexts)) };
}

/** Der Live-Context aus den gerenderten Contexts. */
function liveVon(contexts) {
  return contexts.find((eintrag) => eintrag.name === liveCore.LIVE_CONTEXT_NAME) ?? null;
}

test('der Live-Kontext steht in den CONTEXTS, nicht nur im System-Prompt', async () => {
  const { prompt, contexts, joined } = await beides();
  const live = liveVon(contexts);
  assert.ok(live !== null, `der Context ${liveCore.LIVE_CONTEXT_NAME} fehlt in ${contexts.map((c) => c.name).join(', ')}`);
  assert.ok(live.text.length > 0, 'der Live-Kontext traegt Text');
  // Er steht in der NACHRICHT, nicht im System-Prompt: der System-Prompt
  // enthaelt ihn nicht (sonst waere es kein zweiter Kanal).
  assert.doesNotMatch(prompt, /Persona-Live-Zustand/);
  // Und die Nachricht traegt den Anti-Drift-Satz des DSH.
  assert.match(joined, /Current runtime context\. This snapshot supersedes earlier runtime-context snapshots\./);
});

test('der Live-Kontext nennt Zustand, Stimmung und Beziehung', async () => {
  const { contexts } = await beides();
  const live = liveVon(contexts);
  assert.ok(live !== null);
  // Die Felder stehen drin — mit ihrer Herkunft.
  assert.match(live.text, /Zustand \(Quelle: eigener Zustand\)/);
  assert.match(live.text, /Stimmung=/);
  assert.match(live.text, /Beziehung \(Quelle: gelesene Stufe, nie selbst gesetzt\)/);
});

test('in einem fremden Workspace ist die Persona still — und der Block LEER', async () => {
  const { contexts } = await beides({ workspaceRoot: fremd }, { sessionCwd: fremd });
  const live = liveVon(contexts);
  // Der Context ist registriert, traegt aber KEINEN Text: der DSH filtert
  // leere Strings weg, also entsteht kein Block und schon gar kein
  // 'Current runtime context: none.' — das waere eine Behauptung, es gaebe
  // keinen Stand.
  if (live !== null) {
    assert.equal(live.text, '', 'der fremde Workspace traegt keinen Text');
  }
  const joined = quiet(() => joinContextSections(contexts));
  assert.doesNotMatch(joined, /Current runtime context: none\./);
});

test('ein leerer Zustand erzeugt keinen Block — der Kern gibt null zurueck', () => {
  // Die fail-closed-Regel des Kerns, direkt geprueft: ohne Zustand gibt es
  // keinen Text. Der Aufrufer macht daraus '' (nicht null — null wuerde den
  // DSH beim Rendern zum Absturz bringen).
  assert.equal(liveCore.renderLiveContext({ contract: {}, state: null }), null);
  assert.equal(liveCore.renderLiveContext({ contract: {}, state: {} }), null);
  const lebendig = liveCore.renderLiveContext({
    contract: { tendency: { voices: {} } },
    state: { identity: 'Shinon', stance: 'critical', uncertainty: 'explicit', mood: 'focused', capabilities: ['analysis'], limitations: [], relation: 'known' },
  });
  assert.equal(typeof lebendig, 'string');
  assert.match(lebendig, /Stimmung=focused/);
  assert.match(lebendig, /Beziehung/);
});

test('die Registrierung meldet sich, wenn der Dienst kein context() kann', () => {
  // Der Dienst ohne context() ist der Ausnahmefall: ohne die Meldung wuerde
  // der Live-Zustand still fehlen.
  const gesammelt = [];
  const alt = console.error;
  console.error = (...args) => gesammelt.push(args.join(' '));
  try {
    const disposer = liveCore.registerLiveContext({}, {});
    assert.equal(typeof disposer, 'function');
  } finally {
    console.error = alt;
  }
  assert.match(gesammelt.join(' '), /context\(\)/);
});
