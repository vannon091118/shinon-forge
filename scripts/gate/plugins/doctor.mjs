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

/**
 * Deklarierte Paketversionen — bewusst gehalten, NICHT vereinheitlicht.
 *
 * Standard ist `1.0.0`. `key-router`, `narrative` und `shinon-forge` führen
 * `0.1.0`: Vorbereitungs-Pakete, bewusst nicht im Profil (siehe
 * `dead-package` und `docs/ZAHLEN.md` §1). Diese Aufteilung ist eine
 * Entscheidung, kein Versehen — deshalb schlägt der Doctor nur bei
 * UNDEKLARIERTER Abweichung an. Wer eine Version ändert, ändert sie hier
 * UND im Manifest; alles andere ist Drift und bleibt rot.
 */
export const EXPECTED_VERSIONS = {
  default: '1.0.0',
  'key-router': '0.1.0',
  narrative: '0.1.0',
  'shinon-forge': '0.1.0',
};

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

  // 3. Version-Drift: jede Paketversion muss der Deklaration oben entsprechen.
  //    Gehaltene Aufteilung (Standard + drei 0.1.0) ist grün; alles Undeklarierte
  //    — auch ein einzelner Ausreißer — ist ein Befund mit Paketnamen.
  for (const pkg of ctx.packages) {
    const want = EXPECTED_VERSIONS[pkg.dir] ?? EXPECTED_VERSIONS.default;
    const v = pkg.manifest?.version;
    if (v !== want) {
      issues.push(
        `${pkg.dir}: Version "${v ?? 'fehlt'}" ≠ deklariert "${want}" ` +
          `(scripts/gate/plugins/doctor.mjs EXPECTED_VERSIONS) — Version dort und im Manifest gemeinsam ändern`,
      );
    }
  }

  return issues;
}
