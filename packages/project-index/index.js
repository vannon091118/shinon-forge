import z from '@deepseek-ai/schemastery';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  CONTRACT,
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_INDEX_ROOT,
  indexMeta,
  indexPath,
  indexStats,
  openIndex,
  resolveContext,
  runIndex,
  runIndexInWorker,
} from './assets/index-core.js';

/**
 * shinon-project-index — die Host-Haelfte: Konfiguration und Mount.
 *
 * Der Kern (Extraktion, Schema, inkrementeller Lauf, Worker) steht in
 * `./assets/index-core.js` und kennt keine Host-Abhaengigkeit. Das ist kein
 * Geschmack, sondern gemessen: ein Worker, der DIESE Datei importiert, scheitert
 * im echten Host an `Cannot find package '@deepseek-ai/schemastery'` — der
 * Worker hat die Modulaufloesung des Hosts nicht. Der Kern laedt deshalb ohne
 * Bare-Importe, und der Worker laedt den Kern.
 *
 * WAS DER INDEX IST: der persistente Projektindex aus Plan §9–§12 — files,
 * symbols, edges, references, touches, chunks + FTS5, ausserhalb des Repos unter
 * ~/.shinon/indexes/<project-hash>/index.sqlite.
 *
 * WAS ER ANBIETET: eine Abfrage-Faehigkeit aus Plan §14/§17 — `ctx.provide`
 * unter `QUERY_SERVICE`. Das ist die Naht zum Prompt-Enhancer, und sie ist
 * bewusst SCHMAL: ein Vertragsname und EINE Operation (`resolveContext`).
 * Kein Dateihandle, kein Schema, kein Lauf — wer mehr braucht, importiert den
 * Kern; wer einen Kontext braucht, fragt hier.
 *
 * WARUM ALS DIENST UND NICHT ALS IMPORT: die Pakete dieses Repos referenzieren
 * einander nicht. Der Enhancer liest die Faehigkeit optional ueber `ctx.get`;
 * fehlt sie, ist MAX nur ueber eine Datei zu haben statt gar nicht.
 */

export * from './assets/index-core.js';

/** Vertragsname der Abfrage-Faehigkeit. */
export const QUERY_CONTRACT = 'shinon.project-index/query-v1';

/**
 * Der Dienstname — der Name aus Plan §14 (`shinon_index_query`), nicht ein
 * Wunschname: der Plan benennt diese Faehigkeit, und das Abnahmetest pinnt,
 * dass beide Seiten denselben Namen fuehren.
 */
export const QUERY_SERVICE = 'shinon_index_query';

/**
 * Die Abfrage-Faehigkeit bauen.
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
 */
export function createQueryService({ indexFile, budgetTokens = DEFAULT_CONTEXT_BUDGET }) {
  return {
    contract: QUERY_CONTRACT,
    resolveContext(prompt, options = {}) {
      if (!existsSync(indexFile)) return null;
      const budget = Number.isFinite(options?.budgetTokens) ? options.budgetTokens : budgetTokens;
      const db = openIndex(indexFile);
      try {
        // Der Projektname kommt aus dem INDEX selbst (der Wurzelpfad, den der
        // Lauf eingetragen hat) — nicht aus einer Ableitung des Aufrufers. Eine
        // zweite Wahrheit ueber denselben Index waere eine Fehlerquelle.
        const root = indexMeta(db).root;
        if (typeof root !== 'string' || root === '') return null;
        return resolveContext(db, { prompt, project: basename(root), budgetTokens: budget });
      } finally {
        db.close();
      }
    },
  };
}

/** Die Konfiguration. Leere Pfade heissen: das laufende Projekt und ~/.shinon/indexes. */
export const Config = z.object({
  /** Projektwurzel; leer = Prozessverzeichnis. */
  root: z.string().default(''),
  /** Wurzel der Indizes; leer = ~/.shinon/indexes. */
  indexRoot: z.string().default(''),
  /** Obergrenze je Datei. Groessere Dateien werden uebersprungen und gezaehlt. */
  maxFileBytes: z.number().default(262144),
  /** Fenstergroesse der Chunks in Zeilen. */
  chunkLines: z.number().default(40),
  /**
   * Wie der Lauf Unveraendertheit feststellt:
   *   'changed'  mtime + size; unveraenderte Dateien werden nicht gelesen.
   *              Benannte Luecke: derselbe Inhalt bei gleicher Groesse und
   *              zurueckgesetzter mtime bleibt unbemerkt.
   *   'all'      jede Datei lesen und sha256 pruefen; schliesst die Luecke zum
   *              Preis eines Vollauf-Lesens.
   */
  verify: z.union([z.const('changed'), z.const('all')]).default('changed'),
  /** Bericht nach dem Lauf. */
  trace: z.boolean().default(true),
  /** Lauf im Worker statt im Host (Plan §12). Aus heisst: Lauf im Host. */
  worker: z.boolean().default(true),
});

/**
 * Ein Bericht in einer Zeile — die Auskunft, die der Host protokolliert.
 *
 * Der Schutz steht mit im Bericht, weil er sonst unsichtbar waere: eine
 * ausgeschlossene Datei veraendert keine Zaehlung, und eine Redaktion erst recht
 * nicht. Wer den Lauf liest, soll sehen, dass Dateien nicht gelesen wurden und
 * Werte ersetzt wurden — ohne dass ein Wert im Protokoll steht.
 */
function reportLine(report, stats, where) {
  const protectedKinds = Object.entries(report.protectedKinds ?? {})
    .map(([kind, count]) => `${kind}=${count}`)
    .join(' ');
  return (
    `[shinon-project-index] Lauf im ${where} (verify=${report.verify}): ${report.written} neu, ` +
    `${report.rehashed} nur aufgefrischt, ${report.hashed} gelesen, ${report.unchanged} unveraendert, ` +
    `${report.removed} entfernt, ${report.skipped} uebersprungen, ` +
    `Schutz: ${report.protected} nie gelesen${protectedKinds === '' ? '' : ` (${protectedKinds})`}, ` +
    `${report.findings} Fundstellen redigiert, ` +
    `${report.references} Referenzen, ${report.touches} Touches — ${stats?.files ?? '?'} Dateien, ` +
    `${stats?.symbols ?? '?'} Symbole, ${stats?.chunks ?? '?'} Chunks`
  );
}

/**
 * Den Index beim Mounten aufbauen bzw. fortschreiben.
 *
 * Plan §12: der Index-Build darf den kritischen Agent-Eventloop nicht blockieren.
 * Gemessen auf diesem Repo (163 Dateien): ein vollstaendiger Lauf dauert 817 ms.
 * Deshalb laeuft er (a) nicht im Mount, sondern danach, und (b) im Worker statt
 * im Host. Ist der Worker nicht nutzbar, laeuft derselbe `runIndex` im Host und
 * die Ursache steht im Protokoll — ein stiller Wechsel waere ein Befund ohne Spur.
 *
 * Der Anlauf selbst laeuft NACH dem Mounten; die Abfrage-Faehigkeit wird aber
 * schon hier bereitgestellt. Das ist kein Widerspruch: sie antwortet `null`,
 * solange kein Index vorliegt, und benutzt denselben Dateipfad, den der Lauf
 * schreibt. Damit gibt es kein Fenster, in dem ein Aufrufer nichts bekaeme.
 *
 * Der Secret-Schutz (Plan §13) ist nicht konfigurierbar: er ist keine Option,
 * sondern eine Eigenschaft des Index. Was er nicht schuetzt, steht als Grenze im
 * Kern — ein Detektor mit benannten Mustern ist kein Beweis.
 */
export function apply(ctx, config) {
  const options = {
    root: resolve(config.root === '' ? process.cwd() : config.root),
    indexRoot: resolve(config.indexRoot === '' ? DEFAULT_INDEX_ROOT : config.indexRoot),
    maxFileBytes: config.maxFileBytes,
    chunkLines: config.chunkLines,
    verify: config.verify,
  };
  const file = indexPath(options.indexRoot, options.root);

  // Die Naht zum Enhancer: genau eine Operation, sofort verfuegbar, ohne Index
  // ehrlich leer. Ob sie angeboten werden konnte, steht in DERSELBEN
  // Aktivierungszeile — nicht als zweite Meldung: der Mount meldet seinen
  // Zustand einmal, und ein Host ohne `provide` ist kein Fehler des Laufs.
  const canProvide = typeof ctx?.provide === 'function';
  const releaseQuery = canProvide
    ? ctx.provide(QUERY_SERVICE, createQueryService({ indexFile: file }))
    : null;
  const queryState = canProvide
    ? `Abfrage ${QUERY_SERVICE} bereitgestellt (${QUERY_CONTRACT})`
    : `Abfrage ${QUERY_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`;

  /** Ein Bericht ist erst vollstaendig, wenn der Index auch zaehlbar ist. */
  const announce = (report, where) => {
    if (!config.trace) return;
    let stats = null;
    try {
      const db = openIndex(file);
      stats = indexStats(db);
      db.close();
    } catch {
      /* die Zaehlung ist Beiwerk, nicht der Lauf */
    }
    console.log(reportLine(report, stats, where));
  };

  const start = async () => {
    if (config.worker) {
      const result = await runIndexInWorker(options);
      if (result.ok) {
        announce(result.report, 'Worker');
        return;
      }
      console.error(`[shinon-project-index] Worker nicht nutzbar (${result.error}) — Lauf im Host`);
    }
    try {
      announce(runIndex(options), 'Host');
    } catch (error) {
      console.error(`[shinon-project-index] Lauf abgebrochen (${error?.message ?? error}) — der vorige Stand bleibt stehen`);
    }
  };

  const pending = setImmediate(() => {
    start().catch((error) => console.error(`[shinon-project-index] Lauf abgebrochen (${error?.message ?? error}) — der vorige Stand bleibt stehen`));
  });

  if (config.trace) console.log(`[shinon-project-index] Aktiviert — ${CONTRACT}, ${file}, Lauf nach dem Start (${config.worker ? 'Worker' : 'Host'}), Schutz an (Plan §13), ${queryState}`);

  // Ein noch nicht gestarteter Lauf wird gestoppt; ein laufender schreibt zu
  // Ende, weil ein halber Index schlimmer waere als ein fertiger.
  return () => {
    clearImmediate(pending);
    if (typeof releaseQuery === 'function') releaseQuery();
  };
}
