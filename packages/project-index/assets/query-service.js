/**
 * Die Abfrage-Faehigkeit — EIN Vertragsname, EINE Operation.
 *
 * Das ist die Naht zum Prompt-Enhancer (Plan §14/§17). Sie liegt seit
 * 2026-10-23 im Kern statt in der Host-Haelfte, weil sie zur Abfrage gehoert und
 * nicht zum Mount: die Host-Haelfte kennt `Config` und `apply`, diese Datei
 * kennt die Antwort und ihre Kosten. Nach aussen aendert der Umzug nichts —
 * `@shinon/project-index` exportiert denselben Namen aus derselben Datei.
 *
 * `resolveContext(prompt, { budgetTokens })` liefert die Form des Kontextvertrags
 * oder `null`. Die drei Richtungen sind Absicht:
 *
 *   null      es gibt (noch) keinen Index — eine ehrliche Leere. Ein leerer
 *             Index waere eine Behauptung: "das Projekt hat keine Dateien".
 *   Kontext   der vertragsgemaesse Kontext; die Budgetgrenze ist hart (§14).
 *   wirft     der Index ist da, aber unbrauchbar (kaputte Datei). Ein Fehler,
 *             kein stilles Nichts — der Aufrufer entscheidet, was er daraus macht.
 *
 * Die Abfrage ERZEUGT KEINEN Index: `openIndex` legt fehlende Dateien an, eine
 * Suche darf das nicht. Deshalb steht davor `existsSync`.
 *
 * WARM (Welle 2, 2026-10-20): Ist der Index da, frischt die Abfrage ihre
 * KANDIDATEN auf — je Kandidat ein `stat` gegen den Inode-Stempel, und nur eine
 * geaenderte oder neue Datei wird gelesen (`refreshIndex` im Kern). Kein Watcher,
 * kein Vollscan je Turn; der Kontextvertrag bleibt bei sechs Schluesseln, und der
 * Bericht reist ueber `onRefresh` (Diagnose), nicht als siebter Schluessel.
 * Gemessen im Leitstand: 1 von 25 Dateien im Index, Kontext leer — daher dieser
 * Pfad.
 *
 * WARME VERBINDUNG (2026-10-23): die Abfrage oeffnet den Index nicht mehr je
 * Aufruf. `query-connection.js` haelt EIN Handle und entwertet es ueber
 * Datei-Identitaet (dev/ino/size/mtime/ctime) und Kopfzeile (Vertrag, Fassung,
 * Wurzel). Gemessen kostete das Oeffnen allein p50 rund 151 ms bei 582 Dateien;
 * der Befund und die Zusagen stehen dort, nicht hier.
 */

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { INDEX_DEFAULTS } from './defaults.js';
import { DEFAULT_CONTEXT_BUDGET, resolveContext } from './index-context.js';
import { createWarmConnection } from './query-connection.js';

/** Vertragsname der Abfrage-Faehigkeit. */
export const QUERY_CONTRACT = 'shinon.project-index/query-v1';

/**
 * Die Abfrage-Faehigkeit bauen.
 *
 * `connection` ist die warme Verbindung, wenn der Host sie besitzt (dann
 * schliesst er sie auch); ohne sie baut die Faehigkeit ihre eigene. Der
 * Unterschied ist Eigentum, nicht Verhalten.
 */
export function createQueryService({
  indexFile,
  budgetTokens = DEFAULT_CONTEXT_BUDGET,
  workspaceRoot = '',
  chunkLines = INDEX_DEFAULTS.chunkLines,
  maxFileBytes = INDEX_DEFAULTS.maxFileBytes,
  trace = true,
  // Der Haken, der den Index im Hintergrund auffrischt. Die Abfrage ruft ihn,
  // wenn der Index zu alt ist — der Moment, in dem ein frischer Stand zaehlt.
  onStale = null,
  connection = null,
}) {
  const warm = connection ?? createWarmConnection({ file: indexFile, expectedRoot: workspaceRoot });
  return {
    contract: QUERY_CONTRACT,
    resolveContext(prompt, options = {}) {
      if (!existsSync(indexFile)) {
        // Kein Index heisst auch: kein offenes Handle auf eine geloeschte Datei.
        // Der naechste Aufruf baut die Verbindung neu, wenn wieder einer da ist.
        warm.close();
        return null;
      }
      // Der Index ist zu alt: der Hintergrund-Refresh laeuft los, und diese
      // Abfrage beantwortet den Turn aus dem LETZTEN Stand (der Worker hat
      // keine Zeit). Das ist der ehrliche Weg: der Aufrufer wartet nicht, und
      // der naechste Turn hat einen frischen Index.
      if (typeof onStale === 'function') {
        try { onStale(prompt); } catch { /* die Wartung darf die Abfrage nicht brechen */ }
      }
      const budget = Number.isFinite(options?.budgetTokens) ? options.budgetTokens : budgetTokens;
      // S1: die Abfrage ist an DENSELBEN Workspace gebunden wie der Lauf. Ein
      // untergeschobener Index (Kopie, falscher Pfad) hat eine fremde
      // Root-Identitaet; die warme Verbindung prueft sie bei jedem Aufruf und
      // oeffnet ueber `openIndex` neu, statt Kontext aus einem anderen Projekt
      // zu liefern.
      const opened = warm.acquire();
      if (opened === null) return null;
      // Der Projektname kommt aus dem INDEX selbst (der Wurzelpfad, den der
      // Lauf eingetragen hat) — nicht aus einer Ableitung des Aufrufers. Eine
      // zweite Wahrheit ueber denselben Index waere eine Fehlerquelle.
      const root = opened.root;
      if (typeof root !== 'string' || root === '') return null;
      return resolveContext(opened.db, {
        prompt,
        project: basename(root),
        budgetTokens: budget,
        // Die Wurzel kommt aus dem INDEX (oben geprueft), nicht vom Aufrufer:
        // aufgefrischt wird genau der Baum, den dieser Index beschreibt.
        root,
        refresh: true,
        chunkLines,
        maxFileBytes,
        onRefresh: (report) => {
          if (!trace) return;
          if (report?.error !== undefined) {
            console.error(`[shinon-project-index] Auffrischung fehlgeschlagen (${report.error}) — Antwort kommt aus dem letzten Stand`);
            return;
          }
          // Nur EINE Zeile, wenn sich etwas geaendert hat: eine Abfrage ohne
          // Aenderung ist der Normalfall und gehoert nicht ins Log.
          if (report.written === 0 && report.removed === 0) return;
          console.log(
            `[shinon-project-index] Abfrage warm: ${report.checked} geprueft, ${report.stamped} ueber Stempel, ` +
            `${report.read} gelesen (${report.readBytes} B), ${report.written} neu (${report.added} davon neu im Index), ` +
            `${report.removed} entfernt, ${report.touches} Kanten, ${report.ms} ms`,
          );
        },
      });
    },
  };
}
