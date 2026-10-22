#!/usr/bin/env node
/**
 * Preflight documentation contract.
 *
 * This check makes the handoff paths executable policy rather than convention:
 * exactly one open-work ledger, one evidence diary, one short changelog, and one
 * agent handoff protocol. It checks the real working tree and fails closed.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const root = rootIndex >= 0 && process.argv[rootIndex + 1]
  ? resolve(process.argv[rootIndex + 1])
  : DEFAULT_ROOT;

const requiredFiles = [
  'README.md',
  'AGENTS.md',
  'package.json',
  '.github/workflows/commit-guard.yml',
  '.github/workflows/security.yml',
  '.github/dependabot.yml',
  'docs/INDEX.md',
  'docs/ROADMAP.md',
  'docs/TAGEBUCH.md',
  'docs/CHANGELOG.md',
  'docs/AGENT-HANDOFF.md',
];

const requiredText = [
  ['README.md', 'docs/AGENT-HANDOFF.md', 'README must expose the agent handoff'],
  ['AGENTS.md', 'docs/ROADMAP.md', 'AGENTS must point to the canonical open-work ledger'],
  ['AGENTS.md', 'docs/CHANGELOG.md', 'AGENTS must point to the change handoff'],
  ['AGENTS.md', 'docs/TAGEBUCH.md', 'AGENTS must point to the durable diary'],
  ['docs/INDEX.md', 'CHANGELOG.md', 'Documentation index must list the changelog'],
  ['docs/INDEX.md', 'AGENT-HANDOFF.md', 'Documentation index must list the handoff'],
  ['docs/INDEX.md', 'ROADMAP.md', 'Documentation index must list the roadmap'],
  ['docs/INDEX.md', 'TAGEBUCH.md', 'Documentation index must list the diary'],
  ['docs/ROADMAP.md', '## 2. Offene Punkte', 'Roadmap must contain the canonical open work section'],
  ['docs/ROADMAP.md', 'UNGEPRÜFT', 'Roadmap must preserve the evidence-before-acceptance rule'],
  ['docs/TAGEBUCH.md', 'Anker', 'Diary must retain commit/path evidence anchors'],
  ['docs/CHANGELOG.md', '## Unreleased', 'Changelog must retain the transferable unreleased section'],
  ['docs/CHANGELOG.md', '### Belege', 'Changelog must have a place for actual evidence'],
  ['docs/CHANGELOG.md', '### Übergabe an den nächsten Agenten', 'Changelog must hand work to the next agent'],
  ['docs/AGENT-HANDOFF.md', '## Startprotokoll', 'Handoff must define the agent start procedure'],
  ['docs/AGENT-HANDOFF.md', '## Abschlussprotokoll', 'Handoff must define the agent completion procedure'],
  ['docs/AGENT-HANDOFF.md', 'ERLEDIGT', 'Handoff must define acceptance status semantics'],
];

const issues = [];
for (const relative of requiredFiles) {
  const absolute = resolve(root, relative);
  if (!existsSync(absolute)) {
    issues.push(`missing required file: ${relative}`);
    continue;
  }
  if (!statSync(absolute).isFile()) issues.push(`required path is not a file: ${relative}`);
}

for (const [relative, snippet, message] of requiredText) {
  const absolute = resolve(root, relative);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
  const content = readFileSync(absolute, 'utf8');
  if (!content.includes(snippet)) issues.push(`${message} (${relative}: expected ${JSON.stringify(snippet)})`);
}

// Check relative Markdown links in the handoff documents only. Those are the
// route an incoming agent uses first; old narrative/historical docs are allowed
// to contain explicitly described archival references.
for (const relative of ['docs/INDEX.md', 'docs/CHANGELOG.md', 'docs/AGENT-HANDOFF.md']) {
  const absolute = resolve(root, relative);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
  const content = readFileSync(absolute, 'utf8');
  const links = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of content.matchAll(links)) {
    let destination = match[1].trim();
    if (!destination || destination.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith('//')) continue;
    destination = destination.replace(/^<|>$/g, '').split('#', 1)[0].split('?', 1)[0];
    if (!destination) continue;
    let decoded;
    try { decoded = decodeURIComponent(destination); } catch { decoded = destination; }
    const target = resolve(dirname(absolute), decoded);
    const relativeTarget = target.startsWith(resolve(root) + sep) ? target.slice(resolve(root).length + 1) : target;
    if (!existsSync(target)) issues.push(`broken local link: ${relative} -> ${relativeTarget}`);
  }
}

if (issues.length) {
  console.error(`PRE-FLIGHT DOCUMENT CONTRACT: FAIL (${issues.length} issue(s))`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log(`PRE-FLIGHT DOCUMENT CONTRACT: PASS (${requiredFiles.length} required files; ${requiredText.length} ownership/acceptance rules; local handoff links valid)`);
