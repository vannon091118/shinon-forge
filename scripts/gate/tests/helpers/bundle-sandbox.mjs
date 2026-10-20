/**
 * bundle-sandbox.mjs — Isolate für Bundle-Tests.
 *
 * Warum es diesen Helfer gibt: die Gate-Tests laden ein Paket als KOPIE in einem
 * temporären Verzeichnis („ein Host mit nur DIESEM Bundle"), mit einem
 * Schemastery-Stub daneben. Seit 2026-10-20 importiert die Host-Hälfte
 * `@shinon/seams/core` — eine DEKLARIERTE Abhängigkeit (`dependencies`), also
 * gehört sie auch ins Isolat. Ohne sie starb der Test an
 * `ERR_MODULE_NOT_FOUND: @shinon/seams` statt an der Regel, die er prüfen soll.
 *
 * Der Kern kommt als Kopie hinein, nicht als Symlink: ein Symlink zeigte aus dem
 * temporären Baum heraus, und wer das Isolat aufräumt, soll nichts außerhalb
 * anfassen. Der Kern ist importfrei — die Kopie braucht kein weiteres Paket.
 */
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEAM_PACKAGE = fileURLToPath(new URL('../../../../packages/seams/', import.meta.url));

/**
 * Den Naht-Kern in das Isolat legen.
 *
 * @param {string} root Verzeichnis, unter dem `node_modules/@shinon/seams` liegen
 *   muss — also das Installationswurzel-Verzeichnis des Isolats, nicht das Paket
 *   selbst (bei `pkg/index.js` in `<work>/pkg` ist das `<work>/pkg`).
 * @returns {string} Zielpfad.
 */
export function provideSeamCore(root) {
  const scope = join(root, 'node_modules/@shinon');
  mkdirSync(scope, { recursive: true });
  const target = join(scope, 'seams');
  cpSync(SEAM_PACKAGE, target, { recursive: true });
  return target;
}
