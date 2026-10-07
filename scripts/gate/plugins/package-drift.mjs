/**
 * package-drift (Slice) — Paket-Manifeste driften auseinander:
 * fehlendes/ungültiges JSON, ungültige Semver-Version, Scope-Abweichung.
 */
export const id = 'package-drift';
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    if (!pkg.manifest) {
      issues.push(`${pkg.dir}: package.json fehlt oder ist ungültiges JSON`);
      continue;
    }
    if (typeof pkg.manifest.version !== 'string' || !SEMVER.test(pkg.manifest.version)) {
      issues.push(`${pkg.dir}: version "${pkg.manifest.version}" ist keine gültige Semver`);
    }
    const scope = pkg.want.name.split('/')[0];
    if (typeof pkg.manifest.name === 'string' && !pkg.manifest.name.startsWith(`${scope}/`)) {
      issues.push(`${pkg.dir}: name "${pkg.manifest.name}" liegt außerhalb des Scopes "${scope}"`);
    }
  }
  return issues;
}
