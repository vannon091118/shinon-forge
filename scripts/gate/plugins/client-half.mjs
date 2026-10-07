/**
 * client-half — client.js je Paket: Syntax und __ModuleLoader__.
 */
export const id = 'client-half';

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    for (const issue of ctx.repo.clientIssues(pkg)) issues.push(`${pkg.dir}: ${issue}`);
  }
  return issues;
}
