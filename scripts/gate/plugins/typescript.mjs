/** TypeScript compiler gate for first-party TypeScript sources. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

export const id = 'typescript';
export const REQUIRED_INCLUDE = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
export const REQUIRED_EXCLUDE = ['node_modules', 'vendor', 'dist', 'coverage', '.git'];
export const REQUIRED_OPTIONS = {
  target: 'ES2022',
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  strict: true,
  noEmit: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noFallthroughCasesInSwitch: true,
  forceConsistentCasingInFileNames: true,
  skipLibCheck: true,
};

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const IGNORED_DIRS = new Set(REQUIRED_EXCLUDE);

/** Return first-party TypeScript paths, relative to root and normalized to '/'. */
export function discoverTypeScriptFiles(root) {
  const found = [];
  function visit(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(`cannot read ${relative(root, directory) || '.'}: ${error.message}`);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) visit(absolute);
      } else if (entry.isFile() && TS_EXTENSIONS.has(extname(entry.name))) {
        found.push(relative(root, absolute).split(sep).join('/'));
      }
    }
  }
  visit(root);
  return found.sort();
}

export function validateTypeScriptConfig(config) {
  const issues = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['tsconfig.json must contain a JSON object'];
  }
  const options = config.compilerOptions;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return ['compilerOptions are required'];
  }
  for (const [key, expected] of Object.entries(REQUIRED_OPTIONS)) {
    if (options[key] !== expected) {
      issues.push(`compilerOptions.${key} must be ${JSON.stringify(expected)} (got ${JSON.stringify(options[key])})`);
    }
  }
  if (!Array.isArray(config.include)) {
    issues.push('include must list all TypeScript source extensions');
  } else {
    for (const pattern of REQUIRED_INCLUDE) {
      if (!config.include.includes(pattern)) issues.push(`include is missing "${pattern}"`);
    }
  }
  if (!Array.isArray(config.exclude)) {
    issues.push('exclude must explicitly protect vendor and generated dependency trees');
  } else {
    for (const pattern of REQUIRED_EXCLUDE) {
      if (!config.exclude.includes(pattern)) issues.push(`exclude is missing "${pattern}"`);
    }
  }
  return issues;
}

export function findUncoveredTypeScriptFiles(sourceFiles, compilerFiles, root) {
  const listed = new Set(compilerFiles
    .map((file) => resolve(root, file))
    .map((file) => relative(root, file).split(sep).join('/')));
  return sourceFiles.filter((file) => !listed.has(file));
}

function runCompiler(compilerPath, args, root) {
  try {
    const stdout = execFileSync(process.execPath, [compilerPath, ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? error.message ?? ''),
    };
  }
}

function combinedOutput(result) {
  return [result.stdout, result.stderr].map((part) => part.trim()).filter(Boolean).join('\n');
}

function exactCompilerVersion(text) {
  return text.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/)?.[1] ?? null;
}

/** The gate always uses the repo-local compiler pinned by package.json/lockfile. */
export function checkTypeScript(ctx, { root = ctx.repo.ROOT, compilerPath } = {}) {
  const issues = [];
  let manifest;
  let config;
  let installed;
  try {
    manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch (error) {
    return [`cannot read root package.json: ${error.message}`];
  }
  const declaredVersion = manifest.devDependencies?.typescript;
  if (typeof declaredVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(declaredVersion)) {
    issues.push('package.json must pin devDependencies.typescript to an exact x.y.z version');
  }

  const installedManifestPath = join(root, 'node_modules', 'typescript', 'package.json');
  const localCompilerPath = compilerPath ?? join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(installedManifestPath)) {
    issues.push('TypeScript is not installed locally; run npm install before the gate');
  } else {
    try {
      installed = JSON.parse(readFileSync(installedManifestPath, 'utf8'));
      if (declaredVersion !== installed.version) {
        issues.push(`TypeScript version drift: package.json pins ${declaredVersion ?? 'nothing'}, installed is ${installed.version ?? 'unknown'}`);
      }
    } catch (error) {
      issues.push(`cannot read installed TypeScript package metadata: ${error.message}`);
    }
  }
  if (!existsSync(localCompilerPath)) issues.push(`TypeScript CLI missing: ${localCompilerPath}`);
  if (issues.length) return issues;

  try {
    config = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
  } catch (error) {
    return [`tsconfig.json is missing or invalid JSON: ${error.message}`];
  }
  const configIssues = validateTypeScriptConfig(config);
  if (configIssues.length) return configIssues.map((issue) => `tsconfig.json: ${issue}`);

  const versionResult = runCompiler(localCompilerPath, ['--version'], root);
  if (!versionResult.ok) {
    return [`TypeScript CLI could not start:\n${combinedOutput(versionResult)}`];
  }
  const actualVersion = exactCompilerVersion(combinedOutput(versionResult));
  if (actualVersion !== installed.version || actualVersion !== declaredVersion) {
    return [`TypeScript CLI version mismatch: declared ${declaredVersion}, package ${installed.version}, CLI ${actualVersion ?? 'unknown'}`];
  }

  let sourceFiles;
  try {
    sourceFiles = discoverTypeScriptFiles(root);
  } catch (error) {
    return [`TypeScript source inventory failed: ${error.message}`];
  }
  if (sourceFiles.length === 0) {
    return {
      status: 'not-applicable',
      detail: 'No first-party TypeScript files exist yet; compiler, pinned version and strict tsconfig were validated.',
      issues: [],
    };
  }

  const typecheck = runCompiler(localCompilerPath, ['--noEmit', '--project', join(root, 'tsconfig.json'), '--pretty', 'false'], root);
  if (!typecheck.ok) {
    return [`tsc --noEmit failed:\n${combinedOutput(typecheck) || 'Compiler exited non-zero without diagnostics'}`];
  }

  const listing = runCompiler(localCompilerPath, ['--listFilesOnly', '--project', join(root, 'tsconfig.json'), '--pretty', 'false'], root);
  if (!listing.ok) {
    return [`tsc could not report its program files:\n${combinedOutput(listing)}`];
  }
  const listedFiles = combinedOutput(listing).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const uncovered = findUncoveredTypeScriptFiles(sourceFiles, listedFiles, root);
  if (uncovered.length) {
    return uncovered.map((file) => `TypeScript file is outside the compiler program: ${file}`);
  }
  return [];
}

export function check(ctx) {
  return checkTypeScript(ctx);
}
