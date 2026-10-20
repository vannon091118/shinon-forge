/**
 * Der Dienst `shinon_facts_snapshot` (Wissens-Runtime, Zug 3).
 *
 * Der Prompter darf die Faktendatei nicht selbst öffnen (Pakete greifen nicht
 * ineinander); er liest einen Snapshot über diesen Dienst, wie er den Index
 * über `shinon_index_query` liest. Der Vertrag ist `shinon.facts/snapshot-v1`.
 *
 * Verhalten:
 *  - Fehlt die Datei oder ist sie unlesbar, gibt es `null`: ehrliche Leere
 *    statt eines erfundenen Blocks.
 *  - Nur `VALID` kommt in den Snapshot; `STALE` und `DISPUTED` stehen als
 *    Auslassung daneben, `DISPUTED` zusätzlich als offener Konflikt.
 *  - Passt der Snapshot nicht ins Budget, gibt es `null` und eine Logzeile mit
 *    Soll und Ist — keine stille Kürzung.
 */
import { existsSync } from 'node:fs';
import { compileSnapshot } from './facts-snapshot.js';
import { openFacts } from './facts-store.js';

export const FACTS_SNAPSHOT_SERVICE = 'shinon_facts_snapshot';
export const FACTS_SNAPSHOT_CONTRACT = 'shinon.facts/snapshot-v1';

function revisionsOf(db, id) {
  return db
    .prepare('select rev from fact_sources where fact_id = ? order by rev')
    .all(id)
    .map((row) => row.rev);
}

/**
 * Baut den Dienst. `trace` schaltet die Logzeilen; der Dienst liest bei jedem
 * Aufruf frisch, damit ein gerade veröffentlichter Fakt sofort gilt.
 */
export function createFactsService({ file, constraints = [], budget, trace = false }) {
  return {
    contract: FACTS_SNAPSHOT_CONTRACT,
    snapshot({ intent } = {}) {
      if (!existsSync(file)) return null;
      let db;
      try {
        db = openFacts(file);
      } catch (error) {
        console.warn(`[shinon-project-index] Faktendatei nicht lesbar (${error?.message ?? error}) — kein Wissensblock`);
        return null;
      }
      try {
        const rows = db.prepare('select id, scope, subject, predicate, value, kind, status from facts order by id').all();
        const facts = rows.map((row) => ({ ...row, revisions: revisionsOf(db, row.id) }));
        const conflicts = facts
          .filter((fact) => fact.status === 'DISPUTED')
          .map((fact) => ({ id: fact.id, sources: fact.revisions }));
        const compiled = compileSnapshot({ intent, facts, constraints, conflicts, budget });
        if (!compiled.ok) {
          console.warn(
            `[shinon-project-index] Wissens-Snapshot ${compiled.reason}: ${compiled.required.facts} Fakten / ${compiled.required.chars} Zeichen `
            + `bei Grenze ${compiled.required.maxFacts} / ${compiled.required.maxChars} — kein Block statt einer Kürzung`,
          );
          return null;
        }
        if (trace) {
          console.log(
            `[shinon-project-index] Wissens-Snapshot ${compiled.snapshot.hash}: ${compiled.snapshot.facts.length} Fakten, `
            + `${compiled.snapshot.constraints.length} Constraints, ${compiled.snapshot.conflicts.length} offene Konflikte`,
          );
        }
        return compiled.snapshot;
      } catch (error) {
        console.warn(`[shinon-project-index] Snapshot nicht kompilierbar (${error?.message ?? error}) — kein Wissensblock`);
        return null;
      } finally {
        db.close();
      }
    },
  };
}
