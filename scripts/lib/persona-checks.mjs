/**
 * persona-checks.mjs — Eigentümer: die Prüfungen des Gate-Plugins `persona`.
 *
 * Das Plugin `scripts/gate/plugins/persona.mjs` ist die Fassade: es nennt
 * `id` und gibt `check` und die geprüfte Fläche weiter. Die Richtung ist
 * Fassade → Teil; diese Datei importiert das Plugin nie.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { findForbidden, findMissing } from './source-scan.mjs';


export const STATE_CONTRACT_ID = 'shinon.persona-state/v1';

/** Die sieben Felder, die der Zustand nach außen hat — mehr nicht. */
export const STATE_FIELDS = ['identity', 'stance', 'uncertainty', 'mood', 'capabilities', 'limitations', 'relation'];

/**
 * Die Event-Typen, die die Persona MODELLIERT — nicht die des Spines.
 *
 * Der Spine spricht inzwischen zweiundzwanzig Typen (zwölf Pfade + zehn
 * Carrier-Typen); die Persona bildet zehn davon auf Zustände ab. Die beiden Mengen
 * sind bewusst NICHT gleich: `deriveState` ignoriert unbekannte Typen
 * (fail-closed), und ein Übergang für `request.header` wäre ein Zustand ohne
 * Bedeutung. Jeder Typ hier MUSS ein Typ des Spines sein — das prüft
 * scripts/gate/tests/persona-state.test.mjs gegen die Spine-Liste.
 */
export const PERSONA_EVENT_TYPES = [
  'session.created',
  'message.received',
  'message.completed',
  'claim.created',
  'tool.requested',
  'tool.completed',
  'gate.passed',
  'gate.failed',
  'action.blocked',
  'relation.updated',
];

/** Pflicht-Token im Laufzeitcode (Existenz der Fähigkeit, nicht ihre Qualität). */
export const REQUIRED_TOKENS = ['bus.demand|ctx.inject', 'sp.section', 'bus.route|ctx.on', 'createPersonaState', 'registerLiveContext'];

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

  // Die gelesene Relation: Stufen benannt, Start eine davon, Übergang vorhanden.
  // Nur lesend — die forbidden-Liste bleibt unverändert (kein Schreiben).
  const relation = contract.relation ?? {};
  const levels = relation.levels ?? [];
  if (levels.length === 0 || levels.some((level) => !isText(level))) {
    issues.push(`${file}: relation.levels fehlt oder ist leer`);
  } else {
    if (!levels.includes(relation.initial)) {
      issues.push(`${file}: relation.initial ${JSON.stringify(relation.initial)} steht nicht in relation.levels`);
    }
    if (!levels.includes(baseline.relation)) {
      issues.push(`${file}: baseline.relation ${JSON.stringify(baseline.relation)} steht nicht in relation.levels`);
    }
  }

  const transitions = contract.transitions ?? {};
  for (const type of PERSONA_EVENT_TYPES) {
    if (!transitions[type]) issues.push(`${file}: Übergang für ${type} fehlt`);
  }
  for (const type of Object.keys(transitions)) {
    if (!PERSONA_EVENT_TYPES.includes(type)) issues.push(`${file}: unbekannter Übergang ${type}`);
  }

  // Die Tendenz-Stimmen (Zug 5): geprueft wird die Vollstaendigkeit der
  // Uebersetzung, nicht die Auswahl der Haltungen — die steht im Scoring.
  const tendency = contract.tendency;
  if (tendency !== undefined) {
    const voices = tendency?.voices ?? {};
    const stances = Object.keys(voices);
    if (stances.length === 0) {
      issues.push(`${file}: tendency.voices ist leer — dann kann keine Haltung klingen`);
    }
    for (const stance of stances) {
      if (!isText(voices[stance]?.tonalitaet)) issues.push(`${file}: tendency.voices.${stance}.tonalitaet fehlt`);
      const anker = voices[stance]?.anker;
      if (!Array.isArray(anker) || anker.length === 0 || !anker.every(isText)) {
        issues.push(`${file}: tendency.voices.${stance}.anker fehlt (nicht-leere Liste aus Text)`);
      }
    }
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

/**
 * Die Host-Seite des Pakets: der Eintrag und seine Kerne in `assets/`.
 *
 * Seit 2026-10-23 liegt der Laufzeitcode der Persona nicht mehr in EINER Datei
 * (Zustand, Sitzungs-Scope, Abschnitte, Flaeche haben eigene Eigentuemer). Die
 * Laufzeitgrenze gilt deshalb fuer das Paket: wer sie nur am Eintrag prueft,
 * uebersieht einen `fetch(` in einem Kern — und die Zusage waere still weg.
 */
export function hostSource(base) {
  const files = [join(base, 'index.js')];
  const assets = join(base, 'assets');
  if (existsSync(assets)) {
    for (const name of readdirSync(assets).sort()) {
      if (name.endsWith('.js')) files.push(join(assets, name));
    }
  }
  return files.filter((file) => existsSync(file)).map((file) => ({
    file: `packages/persona/${relative(base, file).split(sep).join('/')}`,
    source: readFileSync(file, 'utf8'),
  }));
}

/** Die Host-Seite als EIN Quelltext — fuer Zusagen, die das ganze Paket betreffen. */
export function hostText(base) {
  return hostSource(base).map((part) => part.source).join('\n');
}

/**
 * Laufzeitgrenze: beobachten und rendern ja, handeln nein.
 *
 * `parts` ist eine Liste aus `{ file, source }`; die Existenz-Token muessen
 * IRGENDWO im Laufzeitcode stehen (Paket-Zusage), ein verbotener Aufruf wird
 * dagegen an SEINER Datei gemeldet — ein Befund ohne Fundstelle waere nicht zu
 * reparieren.
 */
export function runtimeBoundaryIssues(parts, label = 'packages/persona (index.js + assets/*.js)') {
  const issues = [];
  const all = parts.map((part) => part.source).join('\n');
  for (const token of findMissing(all, REQUIRED_TOKENS)) {
    issues.push(`${label}: ${token.replace('|', '/')} fehlt (Persona-Kern unvollständig)`);
  }
  for (const field of findMissing(all, STATE_FIELDS)) {
    issues.push(`${label}: Zustandsfeld ${field} kommt im Laufzeitcode nicht vor`);
  }
  for (const part of parts) {
    for (const token of findForbidden(part.source, FORBIDDEN_MODULES, { mode: 'module' })) {
      issues.push(`${part.file}: verbotener Modulimport ${token} — die Persona liefert Kontext, sie handelt nicht`);
    }
    for (const token of findForbidden(part.source, FORBIDDEN_TOKENS)) {
      issues.push(`${part.file}: verbotener Aufruf ${token} — die Persona liefert Kontext, sie handelt nicht`);
    }
  }
  return issues;
}

/** Eine einzelne Quelle gegen dieselbe Grenze — die Form, die Tests direkt nutzen. */
export function staticIssues(source, file) {
  return runtimeBoundaryIssues([{ file, source }], file);
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
    // Die Grenze gehoert dem Paket, nicht dem Eintrag: alle Host-Kerne mitpruefen.
    issues.push(...runtimeBoundaryIssues(hostSource(persona.base)));
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
