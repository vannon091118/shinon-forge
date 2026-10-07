/**
 * persona — Identity, State, Voice. DSH-nativ und im Profil aktiv.
 *
 * Drei Zusagen, drei Prüfungen:
 *   1. Verdrahtung: das Bundle nutzt ctx.systemPrompt, exportiert `Config` und
 *      `apply`, und das aktive Profil aktiviert es. Ein Persona-Bundle, das
 *      niemand mountet, ist toter Text.
 *   2. Zustandsvertrag (assets/persona-state.json): Baseline, die neun
 *      Event-Übergänge, und für jeden erreichbaren Mood eine Stimme. Ein Mood
 *      ohne Voice wäre ein Zustand ohne Ausdruck.
 *   3. Grenze: der Laufzeitcode beobachtet und rendert — er ruft kein Modell,
 *      startet kein Tool, schreibt nichts. Statisch geprüft, kommentarblind.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findForbidden, findMissing } from '../../lib/source-scan.mjs';

export const id = 'persona';

export const STATE_CONTRACT_ID = 'shinon.persona-state/v1';

/** Die sechs Felder, die der Zustand nach außen hat — mehr nicht. */
export const STATE_FIELDS = ['identity', 'stance', 'uncertainty', 'mood', 'capabilities', 'limitations'];

/** Dieselben neun Event-Typen wie der Spine: eine Sprache, nicht zwei. */
export const EVENT_TYPES = [
  'session.created',
  'message.received',
  'message.completed',
  'claim.created',
  'tool.requested',
  'tool.completed',
  'gate.passed',
  'gate.failed',
  'action.blocked',
];

/** Pflicht-Token im Laufzeitcode (Existenz der Fähigkeit, nicht ihre Qualität). */
export const REQUIRED_TOKENS = ['ctx.inject', 'sp.section', 'ctx.on', 'createPersonaState', 'renderStateContext'];

/** Verbotene Module: Importnamen werden auch in Strings erkannt. */
export const FORBIDDEN_MODULES = ['child_process'];

/** Verbotene Aufrufe im Code: die Persona liefert Kontext, sie handelt nicht. */
export const FORBIDDEN_TOKENS = [
  'execSync',
  'spawn(',
  'writeFile',
  'writeFileSync',
  'mkdirSync',
  'rmSync',
  'fetch(',
  'http.request',
  'Math.random',
  'process.exit',
  'ctx.agents',
  'ctx.llm',
  'ctx.shell',
  'ctx.tools',
  'ctx.set(',
];

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** Zustandsvertrag prüfen: Baseline, Übergänge, Voice-Abdeckung, Grenzen. */
export function stateContractIssues(contract, file) {
  const issues = [];
  if (typeof contract !== 'object' || contract === null) return [`${file}: kein Objekt`];
  if (contract.contract !== STATE_CONTRACT_ID) {
    issues.push(`${file}: contract muss "${STATE_CONTRACT_ID}" sein (ist ${JSON.stringify(contract.contract)})`);
  }
  if (!isText(contract.identity)) issues.push(`${file}: identity fehlt`);

  const baseline = contract.baseline ?? {};
  for (const field of ['stance', 'uncertainty', 'mood']) {
    if (!isText(baseline[field])) issues.push(`${file}: baseline.${field} fehlt`);
  }
  if (!Array.isArray(baseline.capabilities) || baseline.capabilities.length === 0 || baseline.capabilities.some((item) => !isText(item))) {
    issues.push(`${file}: baseline.capabilities fehlt oder ist leer`);
  }
  if (!Array.isArray(baseline.limitations)) issues.push(`${file}: baseline.limitations fehlt`);

  const transitions = contract.transitions ?? {};
  for (const type of EVENT_TYPES) {
    if (!transitions[type]) issues.push(`${file}: Übergang für ${type} fehlt`);
  }
  for (const type of Object.keys(transitions)) {
    if (!EVENT_TYPES.includes(type)) issues.push(`${file}: unbekannter Übergang ${type}`);
  }

  const voice = contract.voice ?? {};
  const moods = new Set([baseline.mood, ...Object.values(transitions).map((transition) => transition?.mood)].filter(isText));
  for (const mood of moods) {
    if (!isText(voice[mood])) issues.push(`${file}: voice.${mood} fehlt (Mood ohne Stimme)`);
  }
  for (const mood of Object.keys(voice)) {
    if (!moods.has(mood)) issues.push(`${file}: voice.${mood} ist keinem Mood zugeordnet (toter Text)`);
  }

  const limits = contract.limits ?? {};
  for (const key of ['maxEvents', 'maxLimitations']) {
    if (!Number.isInteger(limits[key]) || limits[key] < 1) issues.push(`${file}: limits.${key} muss eine positive Ganzzahl sein`);
  }

  if (!Array.isArray(contract.forbidden) || contract.forbidden.length === 0) {
    issues.push(`${file}: forbidden fehlt (die Nicht-Aktions-Grenze ist Teil des Vertrags)`);
  } else {
    for (const entry of ['autonomous_action', 'model_call']) {
      if (!contract.forbidden.includes(entry)) issues.push(`${file}: forbidden muss ${entry} enthalten`);
    }
  }
  return issues;
}

/** Laufzeitgrenze: beobachten und rendern ja, handeln nein. */
export function staticIssues(source, file) {
  const issues = [];
  for (const token of findMissing(source, REQUIRED_TOKENS)) {
    issues.push(`${file}: ${token} fehlt (Persona-Kern unvollständig)`);
  }
  for (const field of findMissing(source, STATE_FIELDS)) {
    issues.push(`${file}: Zustandsfeld ${field} kommt im Laufzeitcode nicht vor`);
  }
  for (const token of findForbidden(source, FORBIDDEN_MODULES, { mode: 'module' })) {
    issues.push(`${file}: verbotener Modulimport ${token} — die Persona liefert Kontext, sie handelt nicht`);
  }
  for (const token of findForbidden(source, FORBIDDEN_TOKENS)) {
    issues.push(`${file}: verbotener Aufruf ${token} — die Persona liefert Kontext, sie handelt nicht`);
  }
  return issues;
}

export function check(ctx) {
  const issues = [];
  const persona = ctx.packages.find((p) => p.dir === 'persona');

  if (!persona) return ['packages/persona/ fehlt (Persona-Schicht nicht vorhanden)'];

  const indexFile = join(persona.base, 'index.js');
  if (!existsSync(indexFile)) {
    issues.push('packages/persona/index.js fehlt');
  } else {
    const src = readFileSync(indexFile, 'utf8');
    if (!src.includes('systemPrompt')) {
      issues.push('packages/persona/index.js nutzt ctx.systemPrompt nicht');
    }
    if (!/export function apply/.test(src)) issues.push('packages/persona/index.js: apply() fehlt');
    if (!/export const Config/.test(src)) issues.push('packages/persona/index.js: Config fehlt');
    issues.push(...staticIssues(src, 'packages/persona/index.js'));
  }

  const stateFile = join(persona.base, 'assets/persona-state.json');
  if (!existsSync(stateFile)) {
    issues.push('packages/persona/assets/persona-state.json fehlt (Zustandsvertrag)');
  } else {
    try {
      issues.push(...stateContractIssues(JSON.parse(readFileSync(stateFile, 'utf8')), 'assets/persona-state.json'));
    } catch (error) {
      issues.push(`assets/persona-state.json ist kein gültiges JSON: ${error.message}`);
    }
  }

  // Profil muss das Bundle aktivieren, sonst läuft die Persona nie.
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
    if (!(profile.bundles ?? []).includes('@shinon/persona')) {
      issues.push(`Profil ${profileName}: @shinon/persona ist nicht in dsh.profile.bundles`);
    }
  }

  return issues;
}
