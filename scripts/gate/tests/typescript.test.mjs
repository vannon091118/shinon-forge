#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkTypeScript, discoverTypeScriptFiles, findUncoveredTypeScriptFiles,
  validateTypeScriptConfig, REQUIRED_INCLUDE, REQUIRED_EXCLUDE, REQUIRED_OPTIONS,
} from '../plugins/typescript.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const LOCAL_COMPILER = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const TEST_COMPILER = existsSync(LOCAL_COMPILER) ? LOCAL_COMPILER : process.env.SHINON_TEST_TSC_BIN;

function fixtureConfig() {
  return { compilerOptions: { ...REQUIRED_OPTIONS, types: [] }, include: [...REQUIRED_INCLUDE], exclude: [...REQUIRED_EXCLUDE] };
}

function createProject(compilerPath, { files = {}, config = fixtureConfig() } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-typescript-gate-'));
  const versionOutput = execFileSync(process.execPath, [compilerPath, '--version'], { encoding: 'utf8' });
  const version = versionOutput.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/)?.[1];
  assert.ok(version, `test compiler must report an exact version: ${versionOutput}`);
  mkdirSync(join(root, 'node_modules', 'typescript'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { typescript: version } }, null, 2));
  writeFileSync(join(root, 'node_modules', 'typescript', 'package.json'), JSON.stringify({ name: 'typescript', version }, null, 2));
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify(config, null, 2));
  for (const [path, source] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

test('inventory accepts all TypeScript extensions and ignores vendor/dependencies/build output', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-ts-inventory-'));
  try {
    for (const path of [
      'src/a.ts', 'src/b.tsx', 'scripts/c.mts', 'packages/d.cts',
      'vendor/dsh/types/vendor.d.ts', 'node_modules/dep/index.ts', 'dist/generated.ts',
    ]) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, 'export {};\n');
    }
    assert.deepEqual(discoverTypeScriptFiles(root), ['packages/d.cts', 'scripts/c.mts', 'src/a.ts', 'src/b.tsx']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('config requires strict/noEmit plus broad and protected source inventory', () => {
  assert.deepEqual(validateTypeScriptConfig(fixtureConfig()), []);
  const weakened = fixtureConfig();
  weakened.compilerOptions.strict = false;
  weakened.compilerOptions.noEmit = false;
  weakened.include = ['src/**/*.ts'];
  weakened.exclude = ['node_modules'];
  const issues = validateTypeScriptConfig(weakened);
  assert.ok(issues.some((issue) => issue.includes('compilerOptions.strict')));
  assert.ok(issues.some((issue) => issue.includes('compilerOptions.noEmit')));
  assert.ok(issues.some((issue) => issue.includes('include is missing')));
  assert.ok(issues.some((issue) => issue.includes('exclude is missing "vendor"')));
});

test('coverage helper reports first-party files absent from the compiler program', () => {
  assert.deepEqual(findUncoveredTypeScriptFiles(['src/a.ts', 'src/b.ts'], ['/repo/src/a.ts'], '/repo'), ['src/b.ts']);
});

test('real compiler accepts valid sources, rejects type errors and catches excluded source files', {
  skip: TEST_COMPILER ? false : 'TypeScript is installed by npm install in CI; no compiler is available in this checkout',
}, () => {
  let root = createProject(TEST_COMPILER, { files: { 'src/index.ts': 'export const status: string = "ready";\n' } });
  try {
    assert.deepEqual(checkTypeScript({ repo: { ROOT: root } }, { compilerPath: TEST_COMPILER }), []);
    writeFileSync(join(root, 'src/index.ts'), 'export const status: string = 42;\n');
    const issues = checkTypeScript({ repo: { ROOT: root } }, { compilerPath: TEST_COMPILER });
    assert.ok(issues.some((issue) => issue.includes('tsc --noEmit failed')), JSON.stringify(issues));
    assert.ok(issues.some((issue) => issue.includes('TS2322')), JSON.stringify(issues));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  root = createProject(TEST_COMPILER, {
    files: { 'src/visible.ts': 'export const visible = true;\n', 'src/hidden.ts': 'export const hidden = true;\n' },
    config: { ...fixtureConfig(), exclude: [...REQUIRED_EXCLUDE, 'src/hidden.ts'] },
  });
  try {
    const issues = checkTypeScript({ repo: { ROOT: root } }, { compilerPath: TEST_COMPILER });
    assert.ok(issues.some((issue) => issue.includes('TypeScript file is outside the compiler program: src/hidden.ts')), JSON.stringify(issues));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('zero first-party TS files yield explicit NOT_APPLICABLE, not implicit PASS', {
  skip: TEST_COMPILER ? false : 'TypeScript is installed by npm install in CI; no compiler is available in this checkout',
}, () => {
  const root = createProject(TEST_COMPILER);
  try {
    assert.deepEqual(checkTypeScript({ repo: { ROOT: root } }, { compilerPath: TEST_COMPILER }), {
      status: 'not-applicable',
      detail: 'No first-party TypeScript files exist yet; compiler, pinned version and strict tsconfig were validated.',
      issues: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
