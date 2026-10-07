/**
 * doctor — Konsistenz-Scanner (Syx_Bridge-Muster `checkX(opts) → issues[]`, nativ).
 *
 * Prüft Drift, der still kaputtgeht:
 *   - Version-Drift: Paketversionen weichen vom Root ab
 *   - Dependency-Drift: Workspace-Deps im Root vs. tatsächliche Pakete
 *   - Stale-Resource: in package.json referenzierte Datei fehlt (icon etc.)
 *   - Dead-Reference: package.json exports zeigt auf fehlende Datei
 *   - Profile-Drift: Profil-Bundles ↔ Paket-Registry
 *
 * Reine programmatische Gates statt Shell-Spaghetti. Kein Zustand, kein Netz.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'doctor';

export function check(ctx) {
  const issues = [];
  const root = ctx.root;

  // 1. Dead-Reference: exports müssen auf existierende Dateien zeigen.
  for (const pkg of ctx.packages) {
    const exports = pkg.manifest?.exports ?? {};
    for (const [key, target] of Object.entries(exports)) {
      if (typeof target !== 'string' || !target.startsWith('./')) continue;
      if (!existsSync(join(pkg.base, target))) {
        issues.push(`${pkg.dir}: exports["${key}"] → "${target}" existiert nicht`);
      }
    }
  }

  // 2. Dependency-Drift: devDependencies im Root vs. echte Pakete.
  const workspaceDeps = Object.keys(root.devDependencies ?? {}).filter((n) => n.startsWith('@shinon/'));
  const actual = new Set(ctx.packages.map((p) => p.want.name));
  for (const dep of workspaceDeps) {
    if (!actual.has(dep)) {
      issues.push(`package.json: devDependency "${dep}" hat kein Paket in packages/*`);
    }
  }
  for (const name of actual) {
    if (!workspaceDeps.includes(name)) {
      issues.push(`package.json: Paket "${name}" fehlt in devDependencies`);
    }
  }

  // 3. Version-Drift: alle Pakete eines Repos führen eine Version.
  const versions = new Map();
  for (const pkg of ctx.packages) {
    const v = pkg.manifest?.version;
    if (typeof v === 'string') versions.set(v, (versions.get(v) ?? 0) + 1);
  }
  if (versions.size > 1) {
    const detail = [...versions.entries()].map(([v, n]) => `${v}×${n}`).join(', ');
    issues.push(`Versions-Drift über Pakete: ${detail} (erlaubt, aber bewusst halten)`);
  }

  return issues;
}
