/**
 * comment-canon — kein Kommentar-Block über 10 LOC; der Überhang gehört nach
 * `docs/COMMENT-KANON.md`. Reine Quelltext-Prüfung, keine Semantik.
 */
import { LIMIT, scan } from '../../comment-limit.mjs';

export const id = 'comment-canon';

export function check(ctx) {
  return scan(ctx.repo.ROOT).map(
    (v) => `${v.file}:${v.a + 1}–${v.b + 1} (${v.len} LOC > ${LIMIT}) — Überhang nach docs/COMMENT-KANON.md`,
  );
}
