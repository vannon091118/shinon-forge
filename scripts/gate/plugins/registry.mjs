/**
 * registry — Live Plugin Registry (nativ).
 *
 * Statt Boot-Time-Snapshots liest dieses Gate die tatsächlich vorhandenen
 * Bundles und meldet Abweichungen zwischen:
 *   - was auf der Platte liegt (packages/*)
 *   - was die Pakete deklarieren (package.json dsh.bundle.patch)
 *   - was das Profil lädt (dsh.profile.bundles)
 *
 * Eine Registry, die driftet, ist keine Registry. Geprüft wird Auflösbarkeit,
 * nicht nur Vorhandensein: ein Bundle ohne Patch-Datei kann DSH nicht mounten.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'registry';

export function check(ctx) {
  const issues = [];
  const byName = new Map(ctx.packages.map((p) => [p.want.name, p]));

  for (const pkg of ctx.packages) {
    const bundle = pkg.manifest?.dsh?.bundle;
    if (!bundle) {
      issues.push(`${pkg.dir}: dsh.bundle fehlt (nicht als Bundle registrierbar)`);
      continue;
    }
    const patchRel = bundle.patch;
    if (typeof patchRel !== 'string' || patchRel.length === 0) {
      issues.push(`${pkg.dir}: dsh.bundle.patch ist kein Pfad`);
      continue;
    }
    if (!existsSync(join(pkg.base, patchRel))) {
      issues.push(`${pkg.dir}: dsh.bundle.patch "${patchRel}" existiert nicht`);
    }
  }

  // Profil-Bundles gegen die tatsächliche Registry prüfen.
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
    // Bundle, die bewusst AUSSERHALB dieses Repos liegen (Ziel zeigt aus packages/
    // heraus), sind fremd wie die @deepseek-ai/*-Eintraege und muessen hier nicht
    // registriert sein. Der Name allein entscheidet nicht.
    const foreign = new Set((profile.foreign ?? []).map((entry) => entry.name));
    for (const name of profile.bundles ?? []) {
      // Fremde DSH-Bundles (dsh-base, dsh-web-app, ...) gehoeren nicht uns.
      if (!name.startsWith('@shinon/')) continue;
      if (foreign.has(name)) continue;
      if (!byName.has(name)) {
        issues.push(`Profil ${profileName}: Bundle "${name}" ist nicht in packages/* registriert`);
      }
    }
  }

  return issues;
}
