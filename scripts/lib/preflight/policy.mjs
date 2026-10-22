/** Single policy source for the preflight documentation and job verdicts. */
export const REQUIRED_FILES = [
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

export const REQUIRED_TEXT = [
  ['README.md', 'docs/AGENT-HANDOFF.md', 'README must expose the agent handoff'],
  ['AGENTS.md', 'docs/ROADMAP.md', 'AGENTS must point to the canonical open-work ledger'],
  ['AGENTS.md', 'docs/CHANGELOG.md', 'AGENTS must point to the change handoff'],
  ['AGENTS.md', 'docs/TAGEBUCH.md', 'AGENTS must point to the durable diary'],
  ['docs/INDEX.md', 'CHANGELOG.md', 'Documentation index must list the changelog'],
  ['docs/INDEX.md', 'AGENT-HANDOFF.md', 'Documentation index must list the handoff'],
  ['docs/INDEX.md', 'ROADMAP.md', 'Documentation index must list the roadmap'],
  ['docs/INDEX.md', 'TAGEBUCH.md', 'Documentation index must list the diary'],
  ['docs/ROADMAP.md', '## 2. Offene Punkte', 'Roadmap must contain the canonical open work section'],
  ['docs/ROADMAP.md', 'UNGEPRÜFT', 'Roadmap must preserve evidence-before-acceptance'],
  ['docs/TAGEBUCH.md', 'Anker', 'Diary must retain commit/path evidence anchors'],
  ['docs/CHANGELOG.md', '## Unreleased', 'Changelog must retain its transferable unreleased section'],
  ['docs/CHANGELOG.md', '### Belege', 'Changelog must have a place for actual evidence'],
  ['docs/CHANGELOG.md', '### Übergabe an den nächsten Agenten', 'Changelog must hand work to the next agent'],
  ['docs/AGENT-HANDOFF.md', '## Startprotokoll', 'Handoff must define the agent start procedure'],
  ['docs/AGENT-HANDOFF.md', '## Abschlussprotokoll', 'Handoff must define the agent completion procedure'],
  ['docs/AGENT-HANDOFF.md', 'ERLEDIGT', 'Handoff must define acceptance status semantics'],
];

export const REQUIRED_CI_JOBS = [
  'commit-guard', 'quick', 'unit', 'gate-rules', 'static-gate',
  'fixtures', 'distribution', 'profile', 'prompter', 'typescript',
  'preflight-docs', 'dependency-audit', 'codeql', 'secret-scan',
];

export const JOB_DIAGNOSTIC_NAMES = {
  'commit-guard': 'COMMIT_GUARD',
  quick: 'QUICK_TESTS',
  unit: 'UNIT_TESTS',
  'gate-rules': 'GATE_TESTS',
  'static-gate': 'STATIC_GATE',
  fixtures: 'FIXTURES',
  distribution: 'DISTRIBUTION',
  profile: 'PROFILE_BOOT',
  prompter: 'PROMPTER',
  typescript: 'TYPESCRIPT',
  'preflight-docs': 'DOCUMENTATION',
  'dependency-audit': 'DEPENDENCY_AUDIT',
  codeql: 'CODEQL',
  'secret-scan': 'SECRET_SCAN',
};
