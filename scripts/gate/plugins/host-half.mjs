/**
 * host-half — index.js je Paket: Syntax, Schemastery-Import, Config-Export, apply()
 * — und die generierten Host-Bausteine (settings-Registrierung) gegen ihre eine
 * Quelle `scripts/lib/plugin-idioms.mjs`.
 */
import { idiomIssues } from '../../lib/plugin-idioms.mjs';

export const id = 'host-half';

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    for (const issue of ctx.repo.indexIssues(pkg)) issues.push(`${pkg.dir}: ${issue}`);
  }
  // Eigener Slice, keine Pfad-Liste: die Prüfung liest die deklarierten Dateien
  // selbst, damit eine NEUE Kopie auffällt, auch wenn sie in keiner Region steht.
  issues.push(...idiomIssues(ctx.repo.ROOT, 'index.js'));
  return issues;
}
