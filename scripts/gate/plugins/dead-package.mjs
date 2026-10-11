/**
 * dead-package (Slice) — ein Paket, das kein aktives Profil referenziert, ist
 * tot: es lädt nie, kostet aber Pflege. Erlaubt ist ein Paket, das seine
 * Zurückstellung SELBST erklärt: `"dsh": { "inactive": true }` im eigenen
 * Manifest.
 *
 * Warum nicht als zentrale Liste im Gate (bis 2026-10-11 `KNOWN_INACTIVE`):
 * mit vielen Paketen hieße das, für jedes neue Paket dieses Gate-File
 * anzufassen — gemessen an 39 Paketen fünf Befunde, bis die Liste wuchs. Die
 * Erklärung gehört dem Paket (ein Besitzer), das Gate liest sie nur.
 */
export const id = 'dead-package';

export function check(ctx) {
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (!profileName || profileName.startsWith('create:')) return [];
  const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
  const referenced = new Set(profile.entries.map((entry) => entry.dir));

  const issues = [];
  for (const pkg of ctx.packages) {
    const declared = pkg.manifest?.dsh?.inactive;
    // Das Feld ist eine Zusage: ein Nicht-Boolean ist ein Befund, kein „gilt als aktiv".
    if (declared !== undefined && typeof declared !== 'boolean') {
      issues.push(`${pkg.dir}: dsh.inactive muss ein Boolean sein (ist ${JSON.stringify(declared)})`);
      continue;
    }
    if (referenced.has(pkg.dir)) continue;
    if (declared === true) continue;
    issues.push(`${pkg.dir}: von Profil "${profileName}" nicht referenziert (tot) und nicht als inaktiv dokumentiert`);
  }
  return issues;
}
