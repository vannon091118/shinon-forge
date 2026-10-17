/**
 * bundle-resolution — jedes Bündel des aktiven Profils löst aus dem PROFIL in
 * `packages/` auf.
 *
 * Warum dieses Gate existiert (gemessen 2026-10-17): `profiles/shinon/node_modules/@shinon/traceability`
 * war ein Link auf einen Prototyp AUSSERHALB dieses Repos. Node lädt für einen
 * Profil-Import zuerst `profiles/<name>/node_modules` — das Repo-Paket wurde also
 * beschattet, und der Boot starb mit `... (reading 'validate')`. Alle übrigen
 * → Kanon: docs/COMMENT-KANON.md#k-92e2eb4222c8
 */
export const id = 'bundle-resolution';

export function check(ctx) {
  return ctx.repo.bundleResolutionIssues(ctx.root);
}
