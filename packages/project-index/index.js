import z from '@deepseek-ai/schemastery';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { resolveWorkspaceRoot, fingerprintRoot } from './assets/workspace.js';
import {
  CONTRACT,
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_INDEX_ROOT,
  DEFAULT_LEDGER_FILE,
  LEDGER_CONTRACT,
  indexMeta,
  indexPath,
  indexStats,
  migrateMemory,
  openIndex,
  openLedger,
  readMemory,
  resolveContext,
  runIndex,
  runIndexInWorker,
  writeMemory,
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
 * WAS ER ANBIETET: ZWEI Faehigkeiten, jede schmal und jede ueber `ctx.provide`.
 *
 *   1. `QUERY_SERVICE` (Plan §14/§17) — EIN Vertragsname und EINE Operation
 *      (`resolveContext`). Das ist die Naht zum Prompt-Enhancer. Kein
 *      Dateihandle, kein Schema, kein Lauf — wer mehr braucht, importiert den
 *      Kern; wer einen Kontext braucht, fragt hier.
 *   2. `STORE_SERVICE` (Zug 2) — zwei Operationen (`load`, `save`) auf einem
 *      Namensraum. Das ist die Naht zum Scoring, und sie ist die Antwort auf
 *      eine gemessene Luecke: der Index war reine Ableitung (Dateien, Symbole,
 *      Kanten — aus dem Projekt wieder herstellbar), dem Scoring fehlte jeder
 *      Ort fuer das, was NICHT herstellbar ist: Urteile, ihre Zuordnung und der
 *      daraus gerechnete Stand. Bis dahin lebte das im Arbeitsspeicher eines
 *      Hosts und war nach jedem Neustart weg.
 *
 * WARUM ALS DIENST UND NICHT ALS IMPORT: die Pakete dieses Repos referenzieren
 * einander nicht. Enhancer und Scoring lesen ihre Faehigkeit optional ueber
 * `ctx.get`; fehlt sie, ist MAX nur ueber eine Datei zu haben statt gar nicht —
 * und das Scoring rechnet im Speicher weiter, statt zu verschwinden.
 *
 * WARUM ZWEI DIENSTE UND NICHT EINER MIT VIER OPERATIONEN: die schmale Form der
 * Abfrage ist per Test festgenagelt (`contract` + `resolveContext`, genau diese
 * beiden Schluessel). Sie zu erweitern hiesse, jedem Leser des Kontexts ein
 * Schreib-Modul in die Hand zu geben. Zwei Namen, zwei Vertraege, zwei
 * Berechtigungen — dasselbe Prinzip wie bei den Marken-Slots.
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
 * Vertragsname der Ablage-Faehigkeit (Zug 2).
 */
export const STORE_CONTRACT = 'shinon.project-index/store-v1';

/**
 * Der Dienstname der Ablage. Bewusst NEBEN `shinon_index_query` und nicht als
 * dessen Erweiterung: der Abfrage-Vertrag ist schmal und gepinnt.
 */
export const STORE_SERVICE = 'shinon_index_store';

/** Ein Namensraum ist die Adresse eines Standes — ohne ihn gibt es keine. */
const validNamespace = (namespace) => typeof namespace === 'string' && namespace.trim() !== '';

/**
 * Die Ablage-Faehigkeit bauen: einen Namensraum lesen, einen Namensraum
 * schreiben. Mehr nicht.
 *
 * Die Rueckgaben sind ausdruecklich dreiwertig, weil der Unterschied zwischen
 * „nichts da" und „nicht lesbar" die ganze Aussage ist:
 *
 *   load  { ok: true, state: null }   es gibt (noch) keinen Index — ehrliche
 *                                     Leere. Nichts ist verloren, nichts ist
 *                                     kaputt: hier war noch nie ein Stand.
 *   load  { ok: true, state: {…} }    der Stand (records, memos, scorecard,
 *                                     notes, broken).
 *   load  { ok: false, error }        die Datei ist da, aber unbrauchbar. Ein
 *                                     Fehler, kein stilles Nichts — der Aufrufer
 *                                     entscheidet, ob er leer startet.
 *   save  { ok: true, rows }          geschrieben (ein Aufruf, eine Transaktion).
 *   save  { ok: false, error }        nicht geschrieben; der alte Stand steht.
 *
 * `save` legt die Datei AN, `load` nicht: schreiben ist unsere eigene Ablage
 * (sie darf ihr Zuhause bauen), lesen waere sonst ein erfundener Index —
 * dieselbe Regel wie bei der Abfrage. Ein Namensraum ist Pflicht: ohne ihn
 * waere die Ablage ein namenloser Haufen, und niemand koennte sie wiederfinden.
 */
export function createStoreService({ indexFile, ledgerFile, workspaceRoot = '' }) {
  // Ohne eigenen Ledger-Pfad wird NICHT stillschweigend in die Indexdatei oder
  // in das echte Nutzerverzeichnis geschrieben: der Aufruf ist dann ein Fehler.
  // Eine Attrappe, die heimlich irgendwohin schreibt, waere schlimmer als eine
  // Absage — dieselbe Regel wie MISSING_NAMESPACE daneben.
  const hasLedger = typeof ledgerFile === 'string' && ledgerFile.trim() !== '';

  const withLedger = (namespace, work) => {
    let db = null;
    try {
      db = openLedger(ledgerFile);
      return work(db);
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    } finally {
      // Ein Fehler beim Schliessen aendert die Antwort nicht mehr — und ein
      // Handle, das den Prozess ueberlebt, waere ein Leck.
      if (db !== null) {
        try {
          db.close();
        } catch {
          /* die Antwort steht schon */
        }
      }
    }
  };

  return {
    contract: STORE_CONTRACT,
    /**
     * Den Stand eines Namensraums lesen. Erzeugt KEINEN Index und KEINEN Ledger:
     * fehlt die Datei, ist die Antwort `null` und nicht ein leerer Stand.
     *
     * Der Namensraum wird ZUERST geprueft: ein Aufruf ohne Adresse ist ein
     * Fehler, und die ehrliche Leere („keine Ablage") darf ihn nicht verdecken.
     *
     * EINMALIGE MIGRATION: hat der Ledger den Stand nicht, der INDEX aber schon
     * (so stand es bis zur Trennung), wird er hier heruebergeholt — verlustfrei
     * und in einer Transaktion. Danach meldet `reason` nichts mehr. Das ist
     * keine stille Datenbewegung: `save` schreibt weiterhin nur in den Ledger.
     */
    load(namespace) {
      if (!validNamespace(namespace)) return { ok: false, error: 'MISSING_NAMESPACE' };
      if (!hasLedger) return { ok: false, error: 'MISSING_LEDGER_FILE' };
      const fresh = !existsSync(ledgerFile);
      return withLedger(namespace, (db) => {
        const migrated = fresh || readMemory(db, namespace) === null
          ? migrateMemory(db, { fromFile: indexFile, namespace, expectedRoot: workspaceRoot })
          : { migrated: 0, reason: 'nichts zu migrieren' };
        // Ein unlesbarer Index VOR der Migration ist ein Fehler, keine Leere:
        // ob dort ein Stand lag, wissen wir nicht — und das darf die Antwort
        // nicht verschweigen. Der Aufrufer startet dann leer MIT Grund.
        if (migrated.error === 'INDEX_UNREADABLE') return { ok: false, error: `INDEX_UNREADABLE: ${migrated.reason}` };
        // S1: ein fremder Index ist als Migrationsquelle unbrauchbar — die
        // Antwort sagt das, statt still leer zu starten.
        if (migrated.error === 'FOREIGN_ROOT') return { ok: false, error: `FOREIGN_ROOT: ${migrated.reason}` };
        const state = readMemory(db, namespace);
        if (migrated.migrated > 0) return { ok: true, state, migrated: migrated.migrated, migration: migrated.reason };
        return { ok: true, state };
      });
    },
    /** Den Stand eines Namensraums schreiben (ersetzt ihn vollstaendig). */
    save(namespace, state) {
      if (!validNamespace(namespace)) return { ok: false, error: 'MISSING_NAMESPACE' };
      if (!hasLedger) return { ok: false, error: 'MISSING_LEDGER_FILE' };
      return withLedger(namespace, (db) => {
        // Auch beim Schreiben wird zuerst migriert: wer nur schreibt (ein Host
        // ohne vorherigen Lesevorgang), darf einen vorhandenen Stand nicht durch
        // die eigene Schreibung verdraengen, ohne ihn je gesehen zu haben.
        // Ein FREMDER Index ist kein Grund, das Schreiben zu verweigern (der
        // Ledger ist die eigene Ablage) — er ist nur keine Migrationsquelle.
        const migrated = readMemory(db, namespace) === null
          ? migrateMemory(db, { fromFile: indexFile, namespace, expectedRoot: workspaceRoot })
          : { migrated: 0 };
        return {
          ok: true,
          rows: writeMemory(db, namespace, state),
          migrated: migrated.migrated,
          ...(migrated.error === 'FOREIGN_ROOT' ? { migration_skipped: migrated.reason } : {}),
        };
      });
    },
  };
}

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
export function createQueryService({ indexFile, budgetTokens = DEFAULT_CONTEXT_BUDGET, workspaceRoot = '' }) {
  return {
    contract: QUERY_CONTRACT,
    resolveContext(prompt, options = {}) {
      if (!existsSync(indexFile)) return null;
      const budget = Number.isFinite(options?.budgetTokens) ? options.budgetTokens : budgetTokens;
      // S1: die Abfrage ist an DENSELBEN Workspace gebunden wie der Lauf. Ein
      // untergeschobener Index (Kopie, falscher Pfad) hat eine fremde
      // Root-Identität und wird von `openIndex` verworfen, statt Kontext aus
      // einem anderen Projekt zu liefern.
      const db = openIndex(indexFile, { expectedRoot: workspaceRoot });
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

/** Die Konfiguration. Leere Pfade heissen: das laufende Projekt, der XDG-Cache und die XDG-Daten. */
export const Config = z.object({
  /**
   * Projektwurzel; leer = Env `SHINON_WORKSPACE_ROOT`, sonst Prozessverzeichnis.
   * Dieselbe Rangfolge wie im Prompter (`assets/workspace.js`, Zwilling):
   * `process.cwd()` entscheidet nie still allein, und die Quelle steht im Log.
   */
  root: z.string().default(''),
  /** Wurzel der Indizes (WEGWERFBAR); leer = $XDG_CACHE_HOME/shinon/indexes. */
  indexRoot: z.string().default(''),
  /**
   * Die DAUERHAFTE Ablage des Scorings; leer = $XDG_DATA_HOME/shinon/ledger.sqlite.
   * Eigener Pfad, weil eigener Lebenszyklus: der Index darf jederzeit neu gebaut
   * oder geloescht werden, der Ledger nie.
   */
  ledgerFile: z.string().default(''),
  /** Obergrenze je Datei. Groessere Dateien werden uebersprungen und gezaehlt. */
  maxFileBytes: z.number().default(262144),
  /** Fenstergroesse der Chunks in Zeilen. */
  chunkLines: z.number().default(40),
  /**
   * Wie der Lauf Unveraendertheit feststellt — die Frage ist, was er ueber eine
   * Datei ANNIMMT:
   *
   *   'stamp'    (Vorgabe) Groesse und mtime werden nicht allein geglaubt. Stimmen
   *              beide, vergleicht er zusaetzlich den Inode-Stempel (Geraet,
   *              Inode, Groesse, mtime, ctime). Damit wird ein Inhalt, der bei
   *              GLEICHER Groesse geaendert und dessen mtime zurueckgesetzt wurde,
   *              erkannt, ohne dass eine unveraenderte Datei gelesen wird. Der
   *              Preis sind Lesevorgaenge fuer verdaechtige Dateien; ein Signal
   *              ohne Inhaltsaenderung (chmod) ist ein gezaehlter Fehlalarm.
   *   'changed'  vertraut mtime + size. Benannte Luecke: derselbe Inhalt bei
   *              gleicher Groesse und zurueckgesetzter mtime bleibt unbemerkt.
   *   'all'      jede Datei lesen und sha256 pruefen; nimmt nichts an und kostet
   *              ein vollstaendiges Lesen je Lauf.
   */
  verify: z.union([z.const('stamp'), z.const('changed'), z.const('all')]).default('stamp'),
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
/**
 * Wie viele ausgelassene Pfade der Bericht NAMENTLICH nennt.
 *
 * Eine Grenze muss sein (ein Projekt mit tausend Rechtefehlern darf das Log nicht
 * fluten), aber sie darf nicht verschweigen: was darueber liegt, wird gezaehlt
 * und als „+N weitere" benannt.
 */
const MAX_NAMED_ERRORS = 5;

/** Die Gruende der Auslassungen als zaehlbare Kurzform — Pfade und Namen, nie Inhalte. */
function scanErrorSummary(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return '';
  const kinds = {};
  for (const error of errors) kinds[error.reason] = (kinds[error.reason] ?? 0) + 1;
  const named = errors.slice(0, MAX_NAMED_ERRORS).map((error) => error.path).join(', ');
  const rest = errors.length > MAX_NAMED_ERRORS ? `, +${errors.length - MAX_NAMED_ERRORS} weitere` : '';
  return ` [${Object.entries(kinds).map(([reason, count]) => `${reason}=${count}`).join(' ')}: ${named}${rest}]`;
}

// TODO: [DSH-Refactor] - Eine einzige lange String-Konkatenation mit bedingten Teilstuecken
// inline. Als Feldliste (label, wert, nur-wenn) bauen und einmal rendern — dann ist ein
// neues Feld eine Datenzeile statt einer Klammeroperation in einem Ausdruck.
function reportLine(report, stats, where) {
  const protectedKinds = Object.entries(report.protectedKinds ?? {})
    .map(([kind, count]) => `${kind}=${count}`)
    .join(' ');
  return (
    `[shinon-project-index] Lauf im ${where} (verify=${report.verify}): ${report.written} neu, ` +
    `${report.rehashed} nur aufgefrischt, ${report.hashed} gelesen (${report.readBytes} Bytes), ` +
    `${report.unchanged} unveraendert${report.stamped > 0 ? ` (${report.stamped} ueber Stempel)` : ''}, ` +
    `${report.falseAlarms > 0 ? `${report.falseAlarms} Fehlalarm(e), ` : ''}` +
    `${report.removed} entfernt, ${report.skipped} uebersprungen${scanErrorSummary(report.scanErrors)}, ` +
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
  // S1: DIE EINE Workspace-Identität — explizite Config > Env > cwd. Der
  // Prompter löst dieselbe Regel (Zwilling `workspace.js`); dieser Host
  // protokolliert Quelle und Fingerabdruck, damit ein falscher Workspace im
  // Log steht, statt sich als leerer Kontext zu tarnen.
  const resolvedWorkspace = resolveWorkspaceRoot({ configRoot: config.root ?? '', env: process.env });
  const workspace = { ...fingerprintRoot(resolvedWorkspace.root), source: resolvedWorkspace.source };
  const options = {
    root: workspace.root,
    indexRoot: resolve(config.indexRoot === '' ? DEFAULT_INDEX_ROOT : config.indexRoot),
    ledgerFile: resolve(config.ledgerFile === '' || config.ledgerFile === undefined ? DEFAULT_LEDGER_FILE : config.ledgerFile),
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
    ? ctx.provide(QUERY_SERVICE, createQueryService({ indexFile: file, workspaceRoot: options.root }))
    : null;
  const releaseStore = canProvide
    ? ctx.provide(STORE_SERVICE, createStoreService({ indexFile: file, ledgerFile: options.ledgerFile, workspaceRoot: options.root }))
    : null;
  const queryState = canProvide
    ? `Abfrage ${QUERY_SERVICE} bereitgestellt (${QUERY_CONTRACT})`
    : `Abfrage ${QUERY_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`;
  // Zwei Faehigkeiten, zwei Zeilen: wer im Log liest, dass die Ablage fehlt,
  // soll nicht raten muessen, welche der beiden gemeint ist.
  const storeState = canProvide
    ? `Ablage ${STORE_SERVICE} bereitgestellt (${STORE_CONTRACT}, ${LEDGER_CONTRACT}: ${options.ledgerFile})`
    : `Ablage ${STORE_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`;

  /** Ein Bericht ist erst vollstaendig, wenn der Index auch zaehlbar ist. */
  const announce = (report, where) => {
    if (!config.trace) return;
    let stats = null;
    try {
      const db = openIndex(file, { expectedRoot: options.root });
      stats = indexStats(db);
      db.close();
    } catch (error) {
      // Ein kaputter Index darf nicht still zahlenlos bleiben: benannter Hinweis statt leerem catch.
      console.error(`[shinon-project-index] Index nicht zaehlbar (${error?.message ?? 'unbekannter Fehler'}) — Bericht ohne Zahlen`);
    }
    console.log(reportLine(report, stats, where));
  };

  // Ein Fehlerpfad, EIN Besitzer: `start()` faengt nichts intern ab, und genau eine
  // Stelle meldet den Abbruch. Eine Ursache bekommt damit eine Zeile im Log — und der
  // Worker-Ausfall bleibt ein Worker-Ausfall (Abbruch), kein stiller Zweitlauf.
  const start = async () => {
    if (config.worker) {
      const result = await runIndexInWorker(options);
      if (result.ok) {
        announce(result.report, 'Worker');
        return;
      }
      console.error(`[shinon-project-index] Worker nicht nutzbar (${result.error}) — Lauf im Host`);
    }
    announce(runIndex(options), 'Host');
  };

  const pending = setImmediate(() => {
    start().catch((error) => console.error(`[shinon-project-index] Lauf abgebrochen (${error?.message ?? error}) — der vorige Stand bleibt stehen`));
  });

  if (config.trace) {
    console.log(`[shinon-project-index] Workspace: ${workspace.root} (id ${workspace.rootId}, quelle ${workspace.source})`);
    console.log(`[shinon-project-index] Aktiviert — ${CONTRACT}, ${file}, Lauf nach dem Start (${config.worker ? 'Worker' : 'Host'}), Schutz an (Plan §13)`);
    console.log(`[shinon-project-index] ${queryState}`);
    console.log(`[shinon-project-index] ${storeState}`);
  }

  // Ein noch nicht gestarteter Lauf wird gestoppt; ein laufender schreibt zu
  // Ende, weil ein halber Index schlimmer waere als ein fertiger.
  return () => {
    clearImmediate(pending);
    if (typeof releaseQuery === 'function') releaseQuery();
    if (typeof releaseStore === 'function') releaseStore();
  };
}
