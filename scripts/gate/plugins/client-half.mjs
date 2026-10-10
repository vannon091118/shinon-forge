/**
 * client-half — client.js je Paket: Syntax und __ModuleLoader__ — und die
 * generierten Client-Bausteine (Locale-Fallback) gegen ihre eine Quelle
 * `scripts/lib/plugin-idioms.mjs`.
 */
import { idiomIssues } from '../../lib/plugin-idioms.mjs';

export const id = 'client-half';

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    for (const issue of ctx.repo.clientIssues(pkg)) issues.push(`${pkg.dir}: ${issue}`);
  }
  issues.push(...idiomIssues(ctx.repo.ROOT, 'client.js'));
  return issues;
}
