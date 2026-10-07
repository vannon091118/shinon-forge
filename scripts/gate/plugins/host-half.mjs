/**
 * host-half — index.js je Paket: Syntax, Schemastery-Import, Config-Export, apply().
 */
export const id = 'host-half';

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    for (const issue of ctx.repo.indexIssues(pkg)) issues.push(`${pkg.dir}: ${issue}`);
  }
  return issues;
}
