/**
 * duplicate-plugin (Slice) — kein id/name doppelt: weder über Pakete noch
 * innerhalb des Profils. Eine Dublette bricht die Registry-Auflösung.
 */
export const id = 'duplicate-plugin';

export function check(ctx) {
  const issues = [];
  const byId = new Map();
  const byName = new Map();

  for (const pkg of ctx.packages) {
    const id = pkg.want.id;
    const name = pkg.want.name;
    if (byId.has(id)) issues.push(`doppelte Patch-id "${id}": ${byId.get(id)} und ${pkg.dir}`);
    else byId.set(id, pkg.dir);
    if (byName.has(name)) issues.push(`doppelter name "${name}": ${byName.get(name)} und ${pkg.dir}`);
    else byName.set(name, pkg.dir);
  }

  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
    const seen = new Set();
    for (const entry of profile.entries) {
      const key = entry.id ?? entry.name;
      if (seen.has(key)) issues.push(`Profil ${profileName}: Eintrag "${key}" doppelt`);
      seen.add(key);
    }
  }
  return issues;
}
