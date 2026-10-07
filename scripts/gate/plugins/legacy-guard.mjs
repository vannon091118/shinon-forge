/**
 * legacy-guard — der Legacy-String `dsh-mod` darf in keinem Runtime-Artefakt
 * oder Profil vorkommen.
 */
export const id = 'legacy-guard';

export function check(ctx) {
  return ctx.repo.legacyHits(ctx.packages).map((hit) => `Legacy-Referenz: ${hit}`);
}
