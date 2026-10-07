import z from '@deepseek-ai/schemastery';
import { resolve } from 'node:path';
import {
  CONTRACT,
  DEFAULT_INDEX_ROOT,
  indexPath,
  indexStats,
  openIndex,
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
 * WAS ER HIER NOCH NICHT IST: Prompt-Wirkung. Der MAX-Kontext kommt spaeter und
 * liest dieselbe Datei; dieser Block baut sie nur auf und haelt sie aktuell.
 */

export * from './assets/index-core.js';

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
 * Es gibt hier noch KEINE Prompt-Wirkung; der MAX-Kontext kommt spaeter und
 * liest dieselbe Datei.
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

  if (config.trace) console.log(`[shinon-project-index] Aktiviert — ${CONTRACT}, ${file}, Lauf nach dem Start (${config.worker ? 'Worker' : 'Host'}), Schutz an (Plan §13)`);

  // Ein noch nicht gestarteter Lauf wird gestoppt; ein laufender schreibt zu
  // Ende, weil ein halber Index schlimmer waere als ein fertiger.
  return () => clearImmediate(pending);
}
