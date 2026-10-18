/**
 * commit-policy.mjs — die Presets der Committext-Regeln, validiert statt geraten.
 *
 * Reine Funktionen, kein Dateisystem: die Vertragsdatei kommt herein, die
 * effektiven Regeln oder die Liste der Fehler kommen heraus. IO und Auswahl
 * stehen in commit-policy-file.mjs.
 *
 * Fail-closed in drei Richtungen: ein unbekannter Schlüssel, eine unbekannte
 * → Kanon: docs/COMMENT-KANON.md#k-2d8c5ca52d5c
 */
import { VANNON_TRAILER } from './commit-text.mjs';

export const POLICY_CONTRACT = 'shinon.commit-policy/v1';
export const POLICY_VERSION = 1;
export const DEFAULT_PRESET = 'shinon-maintainer';

/** Die Untergrenze: was kein Preset abschalten kann. */
export const FLOOR = Object.freeze({
  forbiddenFooters: true,
  coAuthorBan: true,
});

/** Erlaubte Trailer-IDs → der eine Text aus commit-text.mjs. */
const TRAILERS = Object.freeze({ vannon: VANNON_TRAILER });

const TOP_KEYS = ['contract', 'version', 'note', 'default', 'floor', 'presets', 'name', 'status', 'rules'];
const PRESET_KEYS = ['basis', 'subject', 'trailer', 'words', 'repair'];

export class PolicyError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'PolicyError';
    this.issues = issues;
  }
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Unbekannte oder fehlende Schlüssel namentlich melden. */
function keyIssues(object, allowed, label) {
  const issues = [];
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) issues.push(`${label}: unbekannter Schlüssel „${key}"`);
  }
  return issues;
}

function subjectIssues(subject, label) {
  if (!isPlainObject(subject)) return [`${label}: subject muss ein Objekt sein`];
  const issues = keyIssues(subject, ['pattern', 'hint'], `${label}.subject`);
  const pattern = subject.pattern;
  if (pattern === null) return issues;
  if (typeof pattern !== 'string' || pattern.trim() === '') {
    issues.push(`${label}.subject.pattern: null oder ein nicht-leerer String`);
    return issues;
  }
  if (!pattern.startsWith('^') || !pattern.endsWith('$')) {
    issues.push(`${label}.subject.pattern: muss mit ^ beginnen und mit $ enden (sonst passt ein Teiltreffer)`);
  }
  try {
    new RegExp(pattern);
  } catch {
    issues.push(`${label}.subject.pattern: kein gültiger regulärer Ausdruck`);
  }
  if (subject.hint !== undefined && typeof subject.hint !== 'string') {
    issues.push(`${label}.subject.hint: String`);
  }
  return issues;
}

function presetIssues(name, preset) {
  const label = `preset „${name}"`;
  if (!isPlainObject(preset)) return [`${label}: muss ein Objekt sein`];
  const issues = keyIssues(preset, PRESET_KEYS, label);
  if (typeof preset.basis !== 'string' || preset.basis.trim() === '') {
    issues.push(`${label}.basis: nicht-leerer String (die Herkunft des Presets)`);
  }
  issues.push(...subjectIssues(preset.subject, label));

  const trailer = preset.trailer;
  if (!isPlainObject(trailer)) {
    issues.push(`${label}.trailer: muss ein Objekt sein`);
  } else {
    issues.push(...keyIssues(trailer, ['required', 'id'], `${label}.trailer`));
    if (typeof trailer.required !== 'boolean') issues.push(`${label}.trailer.required: Boolean`);
    if (!Object.hasOwn(TRAILERS, trailer.id)) {
      issues.push(`${label}.trailer.id: unbekannter Trailer (bekannt: ${Object.keys(TRAILERS).join(', ')})`);
    }
  }

  const words = preset.words;
  if (!isPlainObject(words)) {
    issues.push(`${label}.words: muss ein Objekt sein`);
  } else {
    issues.push(...keyIssues(words, ['min', 'requireNamedData', 'requireImagery'], `${label}.words`));
    if (!Number.isInteger(words.min) || words.min < 0) issues.push(`${label}.words.min: ganze Zahl ≥ 0`);
    for (const key of ['requireNamedData', 'requireImagery']) {
      if (typeof words[key] !== 'boolean') issues.push(`${label}.words.${key}: Boolean`);
    }
  }

  const repair = preset.repair;
  if (!isPlainObject(repair)) {
    issues.push(`${label}.repair: muss ein Objekt sein`);
  } else {
    issues.push(...keyIssues(repair, ['swapTrailer'], `${label}.repair`));
    if (typeof repair.swapTrailer !== 'boolean') issues.push(`${label}.repair.swapTrailer: Boolean`);
  }
  return issues;
}

/**
 * Die Propsa-Form (name, status, rules) pruefen — NUR die Form, nicht die Werte.
 * Die Schluessel verlangt das contracts-Gate (Eignerentscheidung 2026-10-18);
 * fuer die Policy-Aufloesung sind sie inert, ihre Werte-Disziplin prueft das
 * Gate. Hier gilt: vorhanden heisst wohlgeformt — Pflicht sind sie nicht,
 * damit fremde --policy-Dateien ohne Propsa-Form weiter lesen.
 */
function propsaFormIssues(policy) {
  const issues = [];
  const present = ['name', 'status', 'rules'].filter((key) => policy[key] !== undefined);
  if (present.length === 0) return issues;
  for (const key of ['name', 'status', 'rules']) {
    if (policy[key] === undefined) issues.push(`Policy.${key}: fehlt — die Propsa-Form steht entweder ganz oder gar nicht`);
  }
  if (policy.name !== undefined && (typeof policy.name !== 'string' || policy.name.trim() === '')) {
    issues.push('Policy.name: nicht-leerer String');
  }
  if (policy.status !== undefined && (typeof policy.status !== 'string' || policy.status.trim() === '')) {
    issues.push('Policy.status: nicht-leerer String');
  }
  if (policy.rules !== undefined && (!Array.isArray(policy.rules) || policy.rules.length === 0)) {
    issues.push('Policy.rules: nicht-leeres Array');
  }
  return issues;
}

/**
 * Den ganzen Policy-Vertrag prüfen. Ein leeres Array heißt: gültig.
 * @param {unknown} policy Der geparste JSON-Inhalt.
 * @returns {string[]} Alle Befunde, nie nur den ersten.
 */
export function policyIssues(policy) {
  if (!isPlainObject(policy)) return ['Policy: muss ein Objekt sein'];
  const issues = keyIssues(policy, TOP_KEYS, 'Policy');
  if (policy.contract !== POLICY_CONTRACT) {
    issues.push(`Policy.contract: erwartet „${POLICY_CONTRACT}", gefunden ${JSON.stringify(policy.contract)}`);
  }
  if (policy.version !== POLICY_VERSION) {
    issues.push(`Policy.version: erwartet ${POLICY_VERSION}, gefunden ${JSON.stringify(policy.version)}`);
  }
  const floor = policy.floor;
  if (!isPlainObject(floor)) {
    issues.push('Policy.floor: muss ein Objekt sein');
  } else {
    issues.push(...keyIssues(floor, Object.keys(FLOOR), 'Policy.floor'));
    for (const [key, value] of Object.entries(FLOOR)) {
      if (floor[key] !== value) issues.push(`Policy.floor.${key}: muss ${value} sein (Untergrenze ist nicht abschwächbar)`);
    }
  }

  if (!isPlainObject(policy.presets) || Object.keys(policy.presets).length === 0) {
    issues.push('Policy.presets: mindestens ein Preset');
    return issues;
  }
  for (const [name, preset] of Object.entries(policy.presets)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) issues.push(`Policy.presets: ungültiger Name „${name}"`);
    issues.push(...presetIssues(name, preset));
  }
  if (typeof policy.default !== 'string' || !Object.hasOwn(policy.presets, policy.default)) {
    issues.push(`Policy.default: muss ein vorhandenes Preset nennen (gefunden ${JSON.stringify(policy.default)})`);
  }
  if (policy.note !== undefined && typeof policy.note !== 'string') issues.push('Policy.note: String');
  issues.push(...propsaFormIssues(policy));
  return issues;
}

/**
 * Ein Preset in die flache Regelform bringen, die `checkMessage` versteht.
 * Wirft bei ungültigem Vertrag oder unbekanntem Preset — es gibt keinen Ersatz.
 */
export function resolvePreset(policy, name = policy?.default) {
  const issues = policyIssues(policy);
  if (issues.length > 0) throw new PolicyError('Policy ungültig', issues);
  const preset = policy.presets[name];
  if (!preset) {
    throw new PolicyError(`Preset unbekannt: ${JSON.stringify(name)}`, [
      `bekannt: ${Object.keys(policy.presets).join(', ')}`,
    ]);
  }
  return Object.freeze({
    name,
    basis: preset.basis,
    subjectPattern: preset.subject.pattern,
    subjectHint: preset.subject.hint ?? '',
    trailerRequired: preset.trailer.required,
    trailerText: TRAILERS[preset.trailer.id],
    minWords: preset.words.min,
    requireNamedData: preset.words.requireNamedData,
    requireImagery: preset.words.requireImagery,
    repairSwapTrailer: preset.repair.swapTrailer,
  });
}

/** Die aktiven Zusagen als kurze Liste — für Meldungen, nie fürs Urteil. */
export function describeRules(rules) {
  const parts = ['kein KI-Footer'];
  if (rules.trailerRequired) parts.push('Vannon-Trailer');
  if (rules.minWords > 0) parts.push('Wort-Regel');
  if (rules.subjectPattern) parts.push('Betreff-Format');
  return parts;
}
