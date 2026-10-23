/** Shared policy: inputs and jobs that constitute the preflight acceptance contract. */
export const REQUIRED_FILES = [
  'README.md', 'AGENTS.md', 'package.json',
  '.github/workflows/commit-guard.yml', '.github/workflows/security.yml', '.github/dependabot.yml',
  'docs/INDEX.md', 'docs/ROADMAP.md', 'docs/TAGEBUCH.md', 'docs/CHANGELOG.md',
  'docs/AGENT-HANDOFF.md', 'docs/CI-UND-GATES.md', 'docs/SCRIPTS.md',
];

export const LINKED_DOCUMENTS = [
  'README.md', 'AGENTS.md', 'docs/INDEX.md', 'docs/CHANGELOG.md', 'docs/AGENT-HANDOFF.md',
];

export const REQUIRED_CI_JOBS = [
  'commit-guard', 'quick', 'unit', 'gate-rules', 'gate-full', 'fixtures', 'distribution',
  'profile', 'prompter', 'preflight-docs', 'dependency-audit', 'codeql', 'secret-scan',
];

export const JOB_DIAGNOSTIC_NAMES = {
  'commit-guard': 'COMMIT_GUARD',
  quick: 'QUICK_AND_STATIC_CONTRACT',
  unit: 'UNIT_TESTS',
  'gate-rules': 'GATE_TESTS',
  'gate-full': 'GATE_ENGINE',
  fixtures: 'FIXTURES',
  distribution: 'DISTRIBUTION',
  profile: 'PROFILE_BOOT',
  prompter: 'PROMPTER',
  'preflight-docs': 'DOCUMENTATION',
  'dependency-audit': 'DEPENDENCY_AUDIT',
  codeql: 'CODEQL',
  'secret-scan': 'SECRET_SCAN',
};

export const PREFLIGHT_BLOCKED_JOBS = [
  'gate-rules', 'gate-full', 'fixtures', 'distribution', 'profile', 'prompter',
  'quick', 'dependency-audit', 'codeql', 'secret-scan',
];
