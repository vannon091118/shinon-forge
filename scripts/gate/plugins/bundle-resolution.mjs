/**
 * bundle-resolution — jedes Bündel des aktiven Profils löst aus dem PROFIL in
 * `packages/` auf.
 *
 * Warum dieses Gate existiert (gemessen 2026-10-17): `profiles/shinon/node_modules/@shinon/traceability`
 * war ein Link auf einen Prototyp AUSSERHALB dieses Repos. Node lädt für einen
 * Profil-Import zuerst `profiles/<name>/node_modules` — das Repo-Paket wurde also
 * beschattet, und der Boot starb mit `... (reading 'validate')`. Alle übrigen
 * Gates waren grün, weil keines den LINK ansah: sie prüfen `packages/` direkt.
 *
 * Die Regel ist EINE Quelle (`repo.bundleResolutionIssues`) — dasselbe Ergebnis
 * liest `shinon doctor` und `scripts/profile-links.mjs --check`. Ein Befund nennt
 * immer Quelle, aufgelöstes Ziel und Abhilfe; ein Gate, das nur „kaputt" sagt,
 * kostet die nächste Person dieselbe Suche noch einmal.
 *
 * Fail-closed: ein vorhandener Link, der woandershin zeigt, ist ein Fehler. Ein
 * FEHLENDER Link ist keiner — ein frischer Klon hat kein
 * `profiles/<name>/node_modules`, und DSH setzt ihn beim Start aus dem Manifest.
 */
export const id = 'bundle-resolution';

export function check(ctx) {
  return ctx.repo.bundleResolutionIssues(ctx.root);
}
