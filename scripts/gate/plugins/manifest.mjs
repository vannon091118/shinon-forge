/**
 * manifest — package.json jedes Pakets: exports, dsh-Metadaten, host-shared Deps.
 * Delegiert an scripts/lib/repo.mjs (die eine Validierungsquelle).
 */
export const id = 'manifest';

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    for (const issue of ctx.repo.manifestIssues(pkg)) issues.push(`${pkg.dir}: ${issue}`);
  }
  return issues;
}
