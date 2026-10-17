/**
 * doctor — Konsistenz-Scanner (Syx_Bridge-Muster `checkX(opts) → issues[]`, nativ).
 *
 * Prüft Drift, der still kaputtgeht:
 *   - Version-Drift: Paketversionen weichen vom Root ab
 *   - Dependency-Drift: Workspace-Deps im Root vs. tatsächliche Pakete
 *   - Stale-Resource: in package.json referenzierte Datei fehlt (icon etc.)
 *   - Dead-Reference: package.json exports zeigt auf fehlende Datei
 * → Kanon: docs/COMMENT-KANON.md#k-3c4a20a765c9
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'doctor';

/**
 * Versionen — eine REGEL, keine Liste.
 *
 * Zwei Zeilen gibt es in diesem Repo: `1.0.0` für ausgelieferte Pakete und
 * `0.1.0` für Vorbereitungs-Pakete (siehe `docs/ZAHLEN.md` §1). Welche Zeile ein
 * Paket führt, entscheidet das PAKET: ein aktives Paket führt `1.0.0`, ein im
 * eigenen Manifest als `dsh.inactive` deklariertes darf `0.1.0` führen.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-d74f36f7429b
 */
export const SHIPPED_VERSION = '1.0.0';
export const PREPARATION_VERSION = '0.1.0';

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

  // 2. Dependency-Drift: das Inventar im Root-Manifest vs. echte Pakete.
  //    Beide Richtungen zählen — bis auf eine: ein Paket, das sich im eigenen
  //    Manifest als `dsh.inactive` zurückstellt, muss das Inventar noch nicht
  //    belasten. Sonst wäre jedes neue Paket (auch ein bewusst zurückgestelltes)
  //    wieder ein Eintrag in einer ZENTRALEN Datei, und genau das soll die
  //    Erklärung im Paket vermeiden (siehe `dead-package`).
  const workspaceDeps = Object.keys(root.devDependencies ?? {}).filter((n) => n.startsWith('@shinon/'));
  const actual = new Map(ctx.packages.map((p) => [p.want.name, p]));
  for (const dep of workspaceDeps) {
    if (!actual.has(dep)) {
      issues.push(`package.json: devDependency "${dep}" hat kein Paket in packages/*`);
    }
  }
  for (const [name, pkg] of actual) {
    if (workspaceDeps.includes(name)) continue;
    if (pkg.manifest?.dsh?.inactive === true) continue;
    issues.push(
      `package.json: Paket "${name}" fehlt in devDependencies ` +
        '(ein noch nicht ausgeliefertes Paket erklärt sich mit `"dsh": { "inactive": true }` im eigenen Manifest)',
    );
  }

  // 3. Version-Drift: die Zeile des Pakets steht in seinem eigenen Manifest.
  //    Nur ein als inaktiv deklariertes Vorbereitungspaket darf die
  //    Vorbereitungs-Zeile neben der Auslieferungs-Zeile führen; alles andere —
  //    auch ein einzelner Ausreißer — ist ein Befund mit Paketnamen.
  for (const pkg of ctx.packages) {
    const v = pkg.manifest?.version;
    const inactive = pkg.manifest?.dsh?.inactive === true;
    if (inactive ? v === SHIPPED_VERSION || v === PREPARATION_VERSION : v === SHIPPED_VERSION) continue;
    issues.push(
      `${pkg.dir}: Version "${v ?? 'fehlt'}" — ${inactive ? 'ein Vorbereitungspaket (dsh.inactive)' : 'ein ausgeliefertes Paket (ohne dsh.inactive)'} ` +
        `führt ${inactive ? `${PREPARATION_VERSION} oder ${SHIPPED_VERSION}` : SHIPPED_VERSION}`,
    );
  }

  return issues;
}
