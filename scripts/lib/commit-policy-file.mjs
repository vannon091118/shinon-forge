/**
 * commit-policy-file.mjs — woher die Policy kommt, wenn nicht aus dem Aufruf.
 *
 * Getrennt vom reinen Resolver, weil hier das Dateisystem steht: der Vertrag
 * (docs/contracts/commit-policy.json) und die Projektauswahl
 * (.shinon/gate-profile.json). Beide werden validiert; ein defekter Input endet
 * als PolicyError und wird vom Wächter zu Exit 2 — nie zu einem Rückfall.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PRESET, PolicyError, policyIssues, resolvePreset } from './commit-policy.mjs';

/**
 * Der Vertrag gehört zum WERKZEUG, nicht zum geprüften Projekt: der Wächter
 * läuft auch in temporären Repos und fremden Projekten, und die Presets müssen
 * dort dieselben sein. Deshalb wird er relativ zu dieser Datei aufgelöst.
 */
export const ENGINE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const POLICY_FILE = 'docs/contracts/commit-policy.json';
/** Die Projektauswahl: nur das Preset, keine Regel-Überschreibung. */
export const PROJECT_PROFILE = '.shinon/gate-profile.json';
export const POLICY_ENV = 'SHINON_COMMIT_POLICY';

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PolicyError(`${label}: kein gültiges JSON`, [error.message]);
  }
}

/** Eine Vertragsdatei lesen und vollständig validieren. */
export function readPolicyFile(file) {
  if (!existsSync(file)) throw new PolicyError(`${file}: Datei fehlt`);
  const policy = parseJson(readFileSync(file, 'utf8'), file);
  const issues = policyIssues(policy);
  if (issues.length > 0) throw new PolicyError(`${file}: Policy ungültig`, issues);
  return policy;
}

/**
 * Die Projektauswahl lesen. Fehlt die Datei, gibt es keine Auswahl (null).
 * Erlaubt ist genau `commitPolicy.preset` — alles andere ist ein Befund.
 */
export function readProjectPreset(root) {
  const file = join(root, PROJECT_PROFILE);
  if (!existsSync(file)) return null;
  const object = parseJson(readFileSync(file, 'utf8'), PROJECT_PROFILE);
  if (!isPlainObject(object)) throw new PolicyError(`${PROJECT_PROFILE}: muss ein Objekt sein`);
  for (const key of Object.keys(object)) {
    if (key !== 'commitPolicy') {
      throw new PolicyError(`${PROJECT_PROFILE}: unbekannter Schlüssel „${key}"`, ['erlaubt ist nur commitPolicy.preset']);
    }
  }
  if (object.commitPolicy === undefined) return null;
  const selection = object.commitPolicy;
  if (!isPlainObject(selection)) throw new PolicyError(`${PROJECT_PROFILE}: commitPolicy muss ein Objekt sein`);
  for (const key of Object.keys(selection)) {
    if (key !== 'preset') {
      throw new PolicyError(`${PROJECT_PROFILE}: unbekannter Schlüssel „commitPolicy.${key}"`, [
        'Regeln lassen sich hier nicht überschreiben, nur ein Preset wählen',
      ]);
    }
  }
  if (typeof selection.preset !== 'string' || selection.preset.trim() === '') {
    throw new PolicyError(`${PROJECT_PROFILE}: commitPolicy.preset muss ein nicht-leerer String sein`);
  }
  return { preset: selection.preset.trim(), source: PROJECT_PROFILE };
}

/**
 * Die wirksame Policy bestimmen.
 *
 * Vorrang: `--policy-file` > `--policy` > Env `SHINON_COMMIT_POLICY` >
 * `.shinon/gate-profile.json` > Voreinstellung. Jede Stufe wird validiert.
 *
 * @returns {{ name: string, rules: object, source: string, policy: object }}
 */
export function selectPolicy({ root = process.cwd(), preset, file, env = process.env, contractFile } = {}) {
  if (file !== undefined && file !== '') {
    const policy = readPolicyFile(file);
    return { name: policy.default, rules: resolvePreset(policy), source: file, policy };
  }

  const contract = readPolicyFile(contractFile ?? join(ENGINE_ROOT, POLICY_FILE));

  if (preset !== undefined && preset !== '') {
    return { name: preset, rules: resolvePreset(contract, preset), source: '--policy', policy: contract };
  }

  const fromEnv = String(env[POLICY_ENV] ?? '').trim();
  if (fromEnv !== '') {
    return { name: fromEnv, rules: resolvePreset(contract, fromEnv), source: POLICY_ENV, policy: contract };
  }

  const project = readProjectPreset(root);
  const name = project?.preset ?? DEFAULT_PRESET;
  return {
    name,
    rules: resolvePreset(contract, name),
    source: project?.source ?? `Voreinstellung (${DEFAULT_PRESET})`,
    policy: contract,
  };
}
