/**
 * dead-package (Slice) — ein Paket, das kein aktives Profil referenziert, ist
 * tot: es lädt nie, kostet aber Pflege. Erlaubt sind Pakete, die bewusst noch
 * nicht aktiviert sind (Liste unten) — alles andere ist ein Befund.
 */
export const id = 'dead-package';

/**
 * Bewusst nicht im Profil aktivierte Pakete (Vorbereitung, nicht vergessen).
 *
 * `openapi`: vom Plan vorgesehen, aber nicht Teil des Profils.
 * `popup`: die Client-Hälfte ist ein ehrlicher Platzhalter ohne Overlay — die
 * Aktivierung ist eine Entscheidung über Slot, Felder und Anzahl der Einträge,
 * kein Versehen. Der Host-Teil ist gebaut und geprueft (Trigger-Tabelle,
 * Nutzlast aus dem letzten Objektargument).
 *
 * `key-router`, `narrative`, `shinon-forge`: gebaut und ausgeliefert (sie
 * laden im Distributionstest), aber NICHT in `dsh.profile.bundles` — ob sie
 * aktiviert werden, ist eine offene Entscheidung und keine Auslassung. Gemessen
 * und geführt in `Docs/ZAHLEN.md` §1 (Pakete nicht im Profil) und §3.1
 * (Versions-Drift); die Paketnamen stehen im Root-Manifest in `devDependencies`.
 */
const KNOWN_INACTIVE = new Set(['openapi', 'popup', 'key-router', 'narrative', 'shinon-forge']);

export function check(ctx) {
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (!profileName || profileName.startsWith('create:')) return [];
  const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
  const referenced = new Set(profile.entries.map((entry) => entry.dir));

  const issues = [];
  for (const pkg of ctx.packages) {
    if (referenced.has(pkg.dir)) continue;
    if (KNOWN_INACTIVE.has(pkg.dir)) continue;
    issues.push(`${pkg.dir}: von Profil "${profileName}" nicht referenziert (tot) und nicht als inaktiv dokumentiert`);
  }
  return issues;
}
