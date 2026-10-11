/**
 * scoring — Scorecard, Decay, Relation. Lesen, nie schreiben.
 *
 * Drei Zusagen, drei Prüfungen:
 *   1. Schreib-Scope: der Scoring-Laufzeitcode enthält keinen einzigen
 *      Schreib-/Ausführungs-/Netz-/Modellaufruf, und jede Pfad-Angabe im Code
 *      bleibt im eigenen Paket auf bekannte Dateien beschränkt. Was nicht
 *      schreiben KANN, schreibt auch nicht daneben.
 *   2. Trigger-Vertrag fail-closed: kein Trigger feuert ins Leere — jede
 *      Dimension existiert, jede Relationsstufe ist benannt, jeder Skill steht
 *      im Technik-Profil, jeder Event-Typ kommt aus dem Spine, und die
 *      erwartete Nutzlast ist die, die der Spine liefert. Eine Lücke ist ein
 *      Fehler, kein stilles Überspringen.
 *   3. Konservativ bleibt konservativ: Decay klein, Kühlen mindestens zwei
 *      Signale, Triggerzahl gedeckelt — gegen Reward-Sparsität gebaut, nicht
 *      gegen sie getestet.
 *   4. Aktivierung: das Profil muss das Bundle laden, sonst läuft das
 *      Scoring nie (dieselbe Regel wie beim Persona-Gate).
 *
 * Die reinen Funktionen sind ohne node_modules testbar; die Tests liegen in
 * scripts/gate/tests/scoring.test.mjs.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findForbidden } from '../../lib/source-scan.mjs';

export const id = 'scoring';

export const SCORING_CONTRACT_ID = 'shinon.scoring-state/v1';
export const PROFILE_CONTRACT_ID = 'shinon.technical-profile/v1';
export const TRIGGERS_CONTRACT_ID = 'shinon.skill-triggers/v1';

/** Die drei Dateien, die der Scoring-Code beschreiben darf — alle anderen nicht. */
export const WRITABLE_ASSETS = [
  'assets/scoring-state.json',
  'assets/technical-profile.json',
  'assets/skill-triggers.json',
];

/** Lesbar zusätzlich: der reine Kern und die eingefrorene Replay-Fixture. */
export const READABLE_ASSETS = [...WRITABLE_ASSETS, 'assets/scoring-core.js', 'assets/replay/scoring-demo.json'];

/** Verbotene Module: Importnamen werden auch in Strings erkannt. */
export const FORBIDDEN_MODULES = ['child_process'];

/** Verbotene Aufrufe: das Scoring liest — es schreibt, ruft und würfelt nicht. */
export const FORBIDDEN_TOKENS = [
  'writeFile',
  'writeFileSync',
  'mkdirSync',
  'rmSync',
  'unlinkSync',
  'execSync',
  'spawn(',
  'fetch(',
  'http.request',
  'Math.random',
  'Date.now',
  'process.exit',
  'ctx.agents',
  'ctx.llm',
  'ctx.shell',
  'ctx.tools',
  'ctx.set(',
];

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** Laufzeitgrenze: lesen ja, schreiben/handel nein. Kommentare zählen nicht. */
export function staticIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    for (const token of findForbidden(source, FORBIDDEN_MODULES, { mode: 'module' })) {
      issues.push(`${file}: verbotener Modulimport ${token} — das Scoring liest, es handelt nicht`);
    }
    for (const token of findForbidden(source, FORBIDDEN_TOKENS)) {
      issues.push(`${file}: verbotener Aufruf ${token} — das Scoring liest, es schreibt nicht`);
    }
  }
  return issues;
}

/**
 * Pfad-Scope: jede Pfad-Angabe im Scoring-Code bleibt im eigenen Paket auf
 * bekannten Dateien. Ein `./assets/andere.json` wäre ein Schreiben außerhalb
 * der drei Vertragsdateien; ein `../` ein Ausbruch aus dem Paket.
 */
export function scopeIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    const literals = [
      ...source.matchAll(/['"]((?:\.\/)?assets\/[^'"]+)['"]/g),
      ...source.matchAll(/['"](\.\.\/[^'"]+)['"]/g),
    ].map((match) => match[1]);
    for (const literal of literals) {
      const normalized = literal.startsWith('./') ? literal.slice(2) : literal;
      if (normalized.startsWith('../')) {
        issues.push(`${file}: Pfad ${JSON.stringify(literal)} verlässt das Paket`);
      } else if (!READABLE_ASSETS.includes(normalized)) {
        issues.push(`${file}: Pfad ${JSON.stringify(literal)} ist keine bekannte Scoring-Datei`);
      }
    }
  }
  return issues;
}

/**
 * Trigger-Vertrag fail-closed: Dimensionen, Stufen, Skills, Event-Typen und
 * Nutzlasten müssen auf beiden Seiten existieren — sonst feuert ein Trigger
 * auf etwas, das es nicht gibt.
 */
export function contractIssues(scoring, profile, triggers, spine, file) {
  const issues = [];
  const at = (detail) => `${file}: ${detail}`;
  if (typeof scoring !== 'object' || scoring === null) return [at('kein Objekt')];
  if (scoring.contract !== SCORING_CONTRACT_ID) {
    issues.push(at(`contract muss "${SCORING_CONTRACT_ID}" sein (ist ${JSON.stringify(scoring.contract)})`));
  }
  if (typeof profile !== 'object' || profile === null) return [...issues, at('Technik-Profil fehlt')];
  if (typeof triggers !== 'object' || triggers === null) return [...issues, at('Skill-Trigger fehlen')];
  if (profile.contract !== PROFILE_CONTRACT_ID) {
    issues.push(at(`Profil-contract muss "${PROFILE_CONTRACT_ID}" sein (ist ${JSON.stringify(profile.contract)})`));
  }
  if (triggers.contract !== TRIGGERS_CONTRACT_ID) {
    issues.push(at(`Trigger-contract muss "${TRIGGERS_CONTRACT_ID}" sein (ist ${JSON.stringify(triggers.contract)})`));
  }

  const dimensions = scoring.dimensions ?? {};
  if (Object.keys(dimensions).length === 0) issues.push(at('dimensions fehlt oder ist leer'));
  for (const [name, dimension] of Object.entries(dimensions)) {
    for (const key of ['initial', 'min', 'max']) {
      if (typeof dimension?.[key] !== 'number') issues.push(at(`dimensions.${name}.${key} muss eine Zahl sein`));
    }
  }

  const spineEvents = spine?.events ?? {};
  for (const [type, definition] of Object.entries(scoring.events ?? {})) {
    // Kein erfundener Signaltyp: was der Spine nie emittiert, darf das Scoring
    // nicht erwarten — sonst läuft das Replay auf Luft.
    if (!spineEvents[type]) {
      issues.push(at(`Event-Typ ${type} steht nicht im Spine — ein Trigger auf ihn feuert nie`));
      continue;
    }
    // Dieselbe Nutzlast auf beiden Seiten: der Spine liefert, was das Scoring liest.
    const want = spineEvents[type].payload ?? [];
    const have = definition?.payload ?? [];
    if (JSON.stringify([...have].sort()) !== JSON.stringify([...want].sort())) {
      issues.push(at(`${type}.payload ${JSON.stringify(have)} ≠ Spine ${JSON.stringify(want)}`));
    }
  }

  const rate = scoring.decay?.rate;
  if (typeof rate !== 'number' || !(rate > 0 && rate <= 0.05)) {
    issues.push(at(`decay.rate muss konservativ sein (0 < rate ≤ 0.05, ist ${JSON.stringify(rate)})`));
  }
  const interval = scoring.cooling?.interval;
  if (!Number.isInteger(interval) || interval < 2) {
    issues.push(at(`cooling.interval muss mindestens 2 Signale tragen (ist ${JSON.stringify(interval)})`));
  }

  const levels = scoring.relation?.levels ?? [];
  if (levels.length === 0 || levels.some((level) => !isText(level))) {
    issues.push(at('relation.levels fehlt oder ist leer'));
  } else if (!levels.includes(scoring.relation?.initial)) {
    issues.push(at(`relation.initial ${JSON.stringify(scoring.relation?.initial)} steht nicht in relation.levels`));
  }

  if (!Array.isArray(profile.skills) || profile.skills.length === 0 || profile.skills.some((skill) => !isText(skill))) {
    issues.push(at('Technik-Profil skills fehlt oder ist leer'));
  }
  const maxTriggers = profile.limits?.maxTriggers;
  const list = triggers.triggers ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    issues.push(at('triggers fehlt oder ist leer'));
  } else {
    if (Number.isInteger(maxTriggers) && list.length > maxTriggers) {
      issues.push(at(`${list.length} Trigger übersteigen limits.maxTriggers ${maxTriggers}`));
    }
    const ids = new Set();
    for (const [index, trigger] of list.entries()) {
      const where = `triggers[${index + 1}]`;
      if (!isText(trigger?.id)) issues.push(at(`${where}.id fehlt`));
      else if (ids.has(trigger.id)) issues.push(at(`${where}.id ${JSON.stringify(trigger.id)} ist doppelt`));
      else ids.add(trigger.id);
      const hasDimension = typeof trigger?.dimension === 'string';
      const hasRelation = typeof trigger?.relation === 'string';
      if (!hasDimension && !hasRelation) issues.push(at(`${where} nennt weder dimension noch relation`));
      if (hasDimension && !dimensions[trigger.dimension]) {
        issues.push(at(`${where}.dimension ${JSON.stringify(trigger.dimension)} steht nicht in dimensions`));
      }
      if (hasDimension && trigger.op !== 'below' && trigger.op !== 'above') {
        issues.push(at(`${where}.op muss below oder above sein (ist ${JSON.stringify(trigger.op)})`));
      }
      if (hasDimension && typeof trigger.threshold !== 'number') {
        issues.push(at(`${where}.threshold muss eine Zahl sein`));
      }
      if (hasRelation && !levels.includes(trigger.relation)) {
        issues.push(at(`${where}.relation ${JSON.stringify(trigger.relation)} steht nicht in relation.levels`));
      }
      // Kein Skill außerhalb des Technik-Profils: sonst wird eine Injektion
      // versprochen, die die Schicht nie auslösen darf.
      if (!isText(trigger?.skill)) issues.push(at(`${where}.skill fehlt`));
      else if (!(profile.skills ?? []).includes(trigger.skill)) {
        issues.push(at(`${where}.skill ${JSON.stringify(trigger.skill)} steht nicht im Technik-Profil`));
      }
      if (!isText(trigger?.text)) issues.push(at(`${where}.text fehlt (eine Injektion ohne Text)`));
    }
  }
  return issues;
}

function readSources(base) {
  const files = ['index.js', 'client.js'];
  const assetsDir = join(base, 'assets');
  if (existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) files.push(`assets/${entry.name}`);
    }
  }
  return files
    .filter((file) => existsSync(join(base, file)))
    .map((file) => ({ file: `packages/scoring/${file}`, source: readFileSync(join(base, file), 'utf8') }));
}

export function check(ctx) {
  const pkg = ctx.packages.find((candidate) => candidate.dir === 'scoring');
  if (!pkg) return ['packages/scoring/ fehlt (Scoring-Schicht nicht vorhanden)'];

  const issues = [];
  const load = (full, display, label) => {
    if (!existsSync(full)) {
      issues.push(`${display} fehlt (${label})`);
      return null;
    }
    try {
      return JSON.parse(readFileSync(full, 'utf8'));
    } catch (error) {
      issues.push(`${display} ist kein gültiges JSON: ${error.message}`);
      return null;
    }
  };
  const own = (rel, label) => load(join(pkg.base, rel), `packages/scoring/${rel}`, label);

  const scoring = own('assets/scoring-state.json', 'Scorecard-Vertrag');
  const profile = own('assets/technical-profile.json', 'Technik-Profil');
  const triggerDoc = own('assets/skill-triggers.json', 'Skill-Trigger');
  const eventsPkg = ctx.packages.find((candidate) => candidate.dir === 'events');
  let spine = null;
  if (!eventsPkg) {
    issues.push('packages/events/ fehlt (Spine als Referenz fehlt)');
  } else {
    spine = load(join(eventsPkg.base, 'assets/event-spine.json'), 'packages/events/assets/event-spine.json', 'Spine-Vertrag');
  }

  const sources = readSources(pkg.base);
  if (!sources.some((entry) => entry.file.endsWith('index.js'))) {
    issues.push('packages/scoring/index.js fehlt');
  } else {
    issues.push(...staticIssues(sources));
    issues.push(...scopeIssues(sources));
  }

  if (scoring && profile && triggerDoc && spine) {
    issues.push(...contractIssues(scoring, profile, triggerDoc, spine, 'assets/scoring-state.json'));
  }

  // Profil muss das Bundle aktivieren, sonst läuft das Scoring nie.
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const resolved = ctx.repo.resolveProfile(profileName, ctx.packages);
    if (!(resolved.bundles ?? []).includes('@shinon/scoring')) {
      issues.push(`Profil ${profileName}: @shinon/scoring ist nicht in dsh.profile.bundles`);
    }
  }

  return issues;
}
