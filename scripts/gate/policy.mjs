#!/usr/bin/env node
/**
 * scripts/gate/policy.mjs — lädt und validiert scripts/gate/policy.json.
 *
 * Die Policy ist die eine Quelle für: welche Gates existieren, welche im lokalen
 * Hook laufen (local) und welche nur bei passendem Diff-Slice (slices).
 *
 * Prüft zusätzlich, dass Policy-Trigger und Plugin-Dateien deckungsgleich sind —
 * ein Plugin ohne Trigger und ein Trigger ohne Plugin sind beide ein Fehler.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const POLICY_FILE = join(HERE, 'policy.json');
const PLUGIN_DIR = join(HERE, 'plugins');

function fail(detail) {
  console.error(`💥 Gate-Policy ungültig — ${detail}`);
  process.exit(1);
}

export function knownPlugins() {
  return readdirSync(PLUGIN_DIR)
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => file.replace(/\.mjs$/, ''));
}

export function parsePolicy(input) {
  const errors = [];
  if (typeof input !== 'object' || input === null) return { errors: ['Policy ist kein Objekt'] };
  if (input.version !== 1) errors.push(`version muss 1 sein (ist ${input.version})`);
  const engine = input.engine;
  if (typeof engine !== 'object' || engine === null) {
    errors.push('engine fehlt');
    return { errors };
  }
  if (!Array.isArray(engine.always)) errors.push('engine.always muss ein Array sein');
  if (!Array.isArray(engine.local)) errors.push('engine.local muss ein Array sein');
  if (typeof engine.slices !== 'object' || engine.slices === null) {
    errors.push('engine.slices muss ein Objekt sein');
  }
  return { errors };
}

/** Jedes Plugin genau einmal konfiguriert — in `always` oder in `slices`. */
export function validateCoverage(policy, known) {
  const knownSet = new Set(known);
  const configured = new Set([...policy.engine.always, ...Object.keys(policy.engine.slices)]);
  const errors = [];
  for (const name of configured) {
    if (!knownSet.has(name)) errors.push(`Plugin "${name}" konfiguriert, aber keine Datei in plugins/`);
  }
  for (const name of knownSet) {
    if (!configured.has(name)) {
      errors.push(`Plugin-Datei "${name}" ist weder in always noch in slices konfiguriert`);
    }
  }
  return errors;
}

/** `local` muss eine Teilmenge von `always` sein (Hooks dürfen nicht mehr laufen als CI). */
export function validateLocalSubset(policy) {
  const always = new Set(policy.engine.always);
  return policy.engine.local.filter((name) => !always.has(name)).map((name) => `local enthält "${name}", das nicht in always steht`);
}

let raw;
try {
  raw = JSON.parse(readFileSync(POLICY_FILE, 'utf8'));
} catch (error) {
  fail(`policy.json nicht lesbar: ${error.message}`);
}

const parsed = parsePolicy(raw);
if (parsed.errors.length) fail(parsed.errors.join('; '));

const coverage = validateCoverage(raw, knownPlugins());
if (coverage.length) fail(coverage.join('; '));

const subset = validateLocalSubset(raw);
if (subset.length) fail(subset.join('; '));

export const POLICY = raw;
