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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
/**
 * Constraints aus einer vorhandenen, bestätigten Quelle: der Commit-Policy des
 * Repos. Keine Erfindung, keine Ableitung aus Prosa — steht die Datei nicht da
 * oder ist sie unlesbar, bleibt die Liste leer und der Block ehrlich ohne
 * `<constraints>`. Gate-Ergebnisse kommen in Zug 4 als eigene Quelle dazu.
 */
export function constraintsFrom(root) {
  if (typeof root !== 'string' || root === '') return [];
  const file = join(root, 'docs', 'contracts', 'commit-policy.json');
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const preset = typeof parsed?.preset === 'string' ? parsed.preset.trim() : '';
    return preset === '' ? [] : [{ key: 'commit-policy', text: preset }];
  } catch {
    return [];
  }
}

export function createFactsService({ file, root = '', constraints = [], budget, trace = false }) {
  return {
    contract: FACTS_SNAPSHOT_CONTRACT,
    snapshot({ intent } = {}) {
      // Der Aufrufer schickt die Klassifikation als Zeichenkette (der Prompter
      // kennt den Intent-Namen); der Kompilator erwartet ein Objekt. Die Brücke
      // steht hier und nicht beim Aufrufer, damit der Vertrag eine Form hat.
      const classified = { classification: typeof intent === 'string' ? intent : String(intent?.classification ?? 'UNBEKANNT') };
      // Die Regeln gelten auch ohne Faktendatei: ohne Fakten gibt es keinen Block,
      // aber die Ableitung darf nicht davon abhängen, ob schon etwas gelernt wurde.
      const rules = constraints.length > 0 ? constraints : constraintsFrom(root);
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
        const compiled = compileSnapshot({ intent: classified, facts, constraints: rules, conflicts, budget });
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
