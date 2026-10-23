/**
 * commit-trailer — der Wächter über den Wächter; Vertrag `docs/contracts/commit-trailer.json`.
 *
 * Die Commit-Regeln sind ein Vertrag: kein KI-Footer, Vannon-Trailer Pflicht,
 * Wort-Regel (150+ Wörter, Daten namentlich, Bildsprache).
 * Dieses Plugin prüft nicht die Historie (das tut der Guard im CI-Job),
 * sondern dass der Mechanismus tatsächlich existiert und fail-closed ist:
 *
 *   1. Verhalten: die eingefrorene Codebuff-Signatur MUSS abgelehnt werden,
 *      eine saubere Nachricht MUSS durchgehen, und der Tausch MUSS den Footer
 *      entfernen und den Trailer setzen. Das ist der Beweis, dass die Regeln
 *      wirken — nicht nur, dass eine Datei existiert.
 *   2. Hooks: pre-commit fährt NUR die schnelle Linie (`npm test` — der volle
 *      Lauf `test:full` gehört in CI), commit-msg prüft ohne --fix
 *      (fail-closed), prepare-commit-msg tauscht (--fix), der Installer setzt
 *      core.hooksPath.
 *   3. CI: der Workflow läuft bei push UND pull_request und hat keinen
 *      paths-Filter — „immer" ist eine Eigenschaft der Datei, nicht ein Versprechen.
 *      Der Prüfbereich kommt aus dem Wächter (--ci), nicht aus Shell-Zeilen im
 *      YAML, und der Job darf nicht mit continue-on-error entschärft sein.
 *   4. Bereich: der Resolver (scripts/lib/ci-range.mjs) wird nie enger — kann er
 *      den Bereich nicht bestimmen, bleibt die volle Historie. Das ist die
 *      Eigenschaft, ohne die „fail-closed" nur ein Wort wäre.
 */
export const id = 'commit-trailer';

import { check as runCheck } from '../../lib/commit-trailer-checks.mjs';

/** Der Gate-Einstieg: die Prüfungen liegen in `scripts/lib/commit-trailer-checks.mjs`. */
export function check(ctx) {
  return runCheck(ctx);
}

export * from '../../lib/commit-trailer-checks.mjs';
