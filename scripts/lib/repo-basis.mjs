/**
 * repo-basis.mjs — Eigentümer: Wurzel, Konstanten, Lesen.
 *
 * Das Fundament der repo-Familie: Repo-Wurzel, Verzeichnis-Konstanten,
 * Lesezugriff und das Root-Manifest. Blatt ohne Rückimport (kein Zyklus).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYaml } from './yaml.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PACKAGES_DIR = join(ROOT, 'packages');
export const PROFILES_DIR = join(ROOT, 'profiles');

/** Host-shared Abhängigkeiten: müssen als peerDependency UND devDependency deklariert sein. */
export const SHARED_DEPS = ['@deepseek-ai/schemastery'];

/** Dateien, die das Artefakt jedes Pakets enthält. */
export const RUNTIME_FILES = ['package.json', 'index.js', 'client.js', 'cordis.patch.yml', 'assets'];

/** Winziges Prädikat für alle repo-Module — hier geteilt, nicht kopiert. */
export const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export const read = (file) => readFileSync(file, 'utf8');
export const readJSON = (file) => JSON.parse(read(file));
export const readYaml = (file) => loadYaml(read(file));

export function readRoot() {
  return readJSON(join(ROOT, 'package.json'));
}
