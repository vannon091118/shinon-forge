/**
 * patch — cordis.patch.yml je Paket: genau ein insert-Block mit id.
 */
export const id = 'patch';

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    for (const issue of ctx.repo.patchIssues(pkg)) issues.push(`${pkg.dir}: ${issue}`);
  }
  return issues;
}
