#!/usr/bin/env node
/**
 * Abnahmetest des Task Routers (@shinon/task-router) — Phase 5, Plan §16.
 *
 * §16 in einem Satz: „Das LLM liefert eine Klassifikation. Die Runtime
 * entscheidet." Genau das wird hier gemessen — und die zwei Dinge, die dabei
 * schiefgehen koennen, werden getrennt geprueft:
 *
 *   1. DAS VOKABULAR. Der Router und der Enhancer fuehren dieselbe Liste. Kein
 *      Paket importiert das andere; die Uebereinstimmung wird hier von AUSSEN
 *      gepinnt. Zwei Listen, die auseinanderlaufen, waeren ein stiller Fehler:
 *      der Router wuerde jede Klasse des Enhancers als unbekannt verwerfen.
 *   2. DIE POLICY. Die Tabelle aus §16 (CHAT/LOOKUP/TRANSFORM linear,
 *      MULTI_STEP_TASK/LONG_RUNNING_GOAL Kandidat) ist eine ZAHLENTABELLE plus
 *      Schwelle, und die Entscheidung ist eine reine Funktion. Damit ist sie
 *      ohne Modell, ohne Netz und ohne Zustand nachpruefbar.
 *
 * Drei Ebenen, bewusst getrennt:
 *   a. Die Daten: Vokabular, Gewichte, Schwelle — und ihre Uebereinstimmung
 *      zwischen beiden Paketen.
 *   b. Die Entscheidung als reine Funktion: die Verhaltenstabelle aus §16, die
 *      Schwelle als POLICY (heben und senken aendert das Ergebnis, ohne Code
 *      anzufassen) und die Fail-closed-Faelle (kein Etikett -> kein Kandidat).
 *   c. Der ECHTE Durchlauf: beide Bundles haengen an EINEM echten
 *      Cordis-Context, gefahren wird der echte Waterfall `agent/pre-step`, der
 *      Enhancer emittiert seinen validierten Datensatz auf dem echten Bus, und
 *      der Router entscheidet daraus. Der Modell-Provider ist zwangslaeufig eine
 *      Attrappe (extern, braucht Zugangsdaten); alles andere ist echt.
 *
 * Kein Netz, kein Modell, kein node_modules im Repo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { quiet } from './helpers/console.mjs';

export const PACKAGES = ['prompter', 'task-router'];
export const ROOT = new URL('../../../', import.meta.url);

/**
 * Beide Bundles isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation.
 * Beide liegen in EINEM Arbeitsverzeichnis, damit ein einziger Shim genuegt —
 * die Pakete importieren einander nicht, also braucht keines das andere.
 */
export async function loadBundles() {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
  const require = createRequire(join(root, 'package.json'));
  const work = mkdtempSync(join(tmpdir(), 'shinon-router-test-'));
  for (const name of PACKAGES) {
    cpSync(new URL(`packages/${name}/`, ROOT), join(work, name), { recursive: true });
  }
  provideSeamCore(work);
  const shim = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  const loaded = {};
  for (const name of PACKAGES) loaded[name] = await import(pathToFileURL(join(work, name, 'index.js')).href);
  return { loaded, work, require };
}

export const { loaded, work } = await loadBundles();
process.on('exit', () => {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* Aufraeumen ist Beiwerk */
  }
});
export const prompter = loaded.prompter;
export const router = loaded['task-router'];

export const dshRequire = createRequire(join(dshRoot(), 'package.json'));
export const { Context } = await import(pathToFileURL(dshRequire.resolve('@deepseek-ai/cordis')).href);
/**
 * Die ECHTE Goal-Domaene der installierten Fassung — fuer den API-Pin (§17:
 * „Die tatsaechlichen API-Namen muessen aus der installierten DSH-Version
 * geprueft werden") und fuer die echten Fehlertypen in den Attrappen.
 */
export const goalPackage = await import(pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-goal')).href);
export const { GoalError } = goalPackage;
/** Ein Prompter-Datensatz in der Form, die der Enhancer wirklich emittiert. */
export const prompterRecord = (over = {}) => ({
  contract: prompter.CONTRACT,
  mode: 'MID',
  outcome: 'accepted',
  reasons: [],
  context: 'not-applicable',
  intentClassification: 'TRANSFORM',
  uncertainties: [],
  references: [],
  rawLength: 64,
  enhancedLength: 60,
  ...over,
});

export const LONG = 'x'.repeat(64);

// ── a. Vokabular und die Naht zwischen den beiden Paketen ───────────────────



// ── b. Die Verhaltenstabelle aus §16 und die Schwelle als Policy ────────────






// ── c. Der echte Durchlauf: Enhancer → Router an EINEM Bus ──────────────────

/** Nutzer-Nachricht in der Form, die der Loop fuehrt (TextBlock + id + source). */
export const userMessage = (text) => ({ id: 'm-1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });
export const stepPayload = (messages) => ({ agent: { session: { id: 'sess-1' } }, messages, turn: 1, step: 1, signal: new AbortController().signal });
export const loopDefault = (claimed) => () => Promise.resolve({ kind: 'enter', messages: claimed });

export function fakeLlm(behaviour) {
  const calls = [];
  return {
    calls,
    stream(options) {
      calls.push(options);
      const text = typeof behaviour === 'function' ? behaviour(options) : behaviour;
      if (text instanceof Error) throw text;
      return (async function* streamChunks() {
        yield { type: 'text-delta', index: 0, text };
      })();
    },
  };
}

export const result = (over = {}) => JSON.stringify({
  enhancedPrompt: 'Bitte baue die zwoelf neuen Module und teste sie danach gruendlich.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
  ...over,
});

/**
 * BEIDE Bundles an EINEM echten Cordis-Context. Damit laeuft die Naht wirklich:
 * der Enhancer emittiert seinen validierten Datensatz auf dem echten Bus, und
 * der Router liest ihn dort.
 */
export function chain({ prompterConfig = {}, routerConfig = {}, llm, goals, routerFirst = false } = {}) {
  const ctx = new Context();
  const decisions = [];
  const prompterRecords = [];
  ctx.provide('llm', llm);
  if (goals !== undefined) ctx.provide(router.GOAL_SERVICE, goals);
  ctx.on(prompter.DECISION_CHANNEL, (record) => prompterRecords.push(record));
  ctx.on(router.DECISION_CHANNEL, (decision) => decisions.push(decision));
  // Die Bundles ueber ihre apply()-Schnittstelle an den ECHTEN Context haengen:
  // derselbe Bus, derselbe Waterfall, derselbe Schemastery — und der Disposer
  // ist so der, den das Paket wirklich zurueckgibt.
  const mountPrompter = () => quiet(() => prompter.apply(ctx, prompter.Config({ provider: 'test-route', model: 'test-model', ...prompterConfig })));
  const mountRouter = () => quiet(() => router.apply(ctx, router.Config({ ...routerConfig })));
  // `routerFirst` dreht die Registrierungsreihenfolge um: die Zuordnung von
  // Agent und Absicht darf nicht an einer Reihenfolge haengen.
  const [first, second] = (routerFirst ? [mountRouter, mountPrompter] : [mountPrompter, mountRouter]).map((mount) => mount());
  return {
    ctx,
    decisions,
    prompterRecords,
    prompterDispose: routerFirst ? second : first,
    routerDispose: routerFirst ? first : second,
  };
}

// MULTI_STEP_TASK ueber das BESTEHENDE Pattern `tests` — kein neuer Trigger.
export const RAW = 'schreib tests fuer die kette und pruefe sie danach';
/** TRANSFORM ueber `refactor`: Gewicht 0, also unter der Schwelle. */
export const TRANSFORM_RAW = 'refaktoriere den prompter gruendlich';

/**
 * Eine Attrappe des ECHTEN Goal-Dienstes: genau die Methoden, die der Router
 * aufruft, mit derselben Signatur (`get(agent)`, `create(agent, request)`) und
 * den echten Fehlertypen aus der installierten Fassung.
 */
export function fakeGoals({ current = undefined, fail = null } = {}) {
  const calls = { get: [], create: [] };
  return {
    calls,
    get(agent) {
      calls.get.push(agent);
      if (fail === 'get') throw new GoalError('agent nicht live', 'GOAL_AGENT_NOT_LIVE');
      return current;
    },
    create(agent, request) {
      calls.create.push({ agent, request });
      if (fail === 'create') throw new GoalError('schon vorhanden', 'GOAL_ALREADY_EXISTS');
      return {
        id: 'goal-1',
        revision: 1,
        phase: 'active',
        activation: 'armed',
        objective: request.objective,
        maxGoalRounds: request.maxGoalRounds ?? 256,
        roundsStarted: 0,
      };
    },
  };
}







// ── d. §17: die Aktivierung ueber DSHs vorhandenen Goal-Mechanismus ────────

/**
 * §17 verlangt zwei Dinge, die man nicht glauben, sondern nachsehen kann:
 *   (a) „Nicht selbst implementieren: while (goal.active)" — der eigene Code
 *       enthaelt keine Schleife, keinen Timer und keinen Goal-Zustand.
 *   (b) „Die tatsaechlichen API-Namen muessen aus der installierten DSH-Version
 *       geprueft werden" — der Dienst, den wir aufrufen, existiert dort mit
 *       genau diesen Methoden, und DSHs eigene Rundenobergrenze ist 256.
 */








// ── e. §18: Goal Micro-State — die zusätzliche Projektion ──────────────────

/** Ein GoalView in der Form der installierten DSH-Fassung (Felder unten gepinnt). */
export const goalView = (over = {}) => ({
  id: 'goal-1',
  revision: 3,
  objective: 'bitte baue die zwoelf neuen module und teste sie danach gruendlich',
  phase: 'active',
  maxGoalRounds: 6,
  roundsStarted: 2,
  createdAt: 1728000000000,
  updatedAt: 1728000600000,
  activation: 'armed',
  ...over,
});

/** Umschlag plus die fünf Felder aus §18 — Reihenfolge der Sortierung. */
export const stateKeys = ['CURRENT_BLOCKER', 'CURRENT_STATE', 'LAST_VERIFIED_FACT', 'NEXT_ACTION', 'OBJECTIVE', 'contract'];






