/**
 * canon — ein Name, eine Schreibweise, eine Definition.
 *
 * Der Kanon lief bisher NUR im statischen Gate (`scripts/shinon-test.mjs`) und
 * damit in `npm test`. Die modulare Engine (`gate:local`, `gate:full`) kannte
 * ihn nicht: ein falsch geschriebenes Browser-Global oder ein Vertrags-Literal
 * außerhalb der drei Formen wäre dort also durchgelaufen. Dieses Plugin liest
 * dieselbe eine Quelle (`scripts/lib/canon.mjs`), statt eine zweite Regel zu
 * erfinden — der Befund ist wortgleich mit dem des statischen Gates.
 *
 * Der Pfad kommt aus `ctx.repo.ROOT`, nicht aus `ctx.root`: `ctx.root` ist das
 * geparste Root-Manifest (so lesen es `doctor`, `dead-package`, `markers`).
 */
import { canonIssues } from '../../lib/canon.mjs';

export const id = 'canon';

export function check(ctx) {
  return canonIssues(ctx.repo.ROOT);
}
