/**
 * contract — der 4-Wege-Namensvertrag: package.json name, Patch id/name,
 * client.js ModuleLoader-id. Delegiert an scripts/lib/repo.mjs.
 */
export const id = 'contract';

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    for (const issue of ctx.repo.contractIssues(pkg)) issues.push(`${pkg.dir}: ${issue}`);
  }
  return issues;
}
