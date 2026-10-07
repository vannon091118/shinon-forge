/**
 * profile — das aktive Profil (aus scripts.dev --profile) referenziert nur
 * existierende Pakete und führt deren id/name exakt.
 */
export const id = 'profile';

export function check(ctx) {
  const name = ctx.repo.activeProfile(ctx.root);
  if (!name) return ['kein --profile in scripts.dev gefunden'];
  if (name.startsWith('create:')) return [];
  const profile = ctx.repo.resolveProfile(name, ctx.packages);
  return profile.issues.map((issue) => `Profil ${name}: ${issue}`);
}
