/**
 * Der parallele Index-Refresh — die ENTSCHEIDUNG, ob ueberhaupt aufgefrischt wird.
 *
 * ANLASS (gemessen 2026-10-21): der Index wurde beim Boot per `setImmediate`
 * gebaut (`packages/project-index/index.js:472`). Der Worker startete, der
 * Prozess beendete den Lauf, der Worker starb — der Index blieb leer, waehrend
 * die Abfrage `null` lieferte. Ein leerer Index ist eine BEHAUPTUNG: "das
 * Projekt hat keine Dateien". Zwei MESSungen stuetzten den Plan:
 *
 *   Worker-Kaltlauf   5 784 ms, 490 Dateien, 4,69 MB, Eventloop FREI
 *   Host-Lauf         4 900 ms, 0 Timer-Ticks, Eventloop BLOCKIERT
 *
 * Der Refresh gehoert darum in den Worker. Aber der Worker-Build ist der
 * TEURE Fall; der WARM-Pfad (Kandidaten per `stat` pruefen, nur Geaendertes
 * lesen) ist billig genug fuer den Host. Diese Datei entscheidet, welcher
 * Fall vorliegt — sie fuehrt NICHTS aus.
 *
 * WARUM EINE ENTSCHEIDUNG UND KEIN ZAHLER:
 * Ein Index aelter als X Minuten aufzufrischen, ohne zu wissen, OB sich etwas
 * geaendert hat, ist Arbeit ohne Erkenntnis. Der Stempel-Vergleich ist die
 * billigere Frage: hat sich die Datei geaendert? Wenn nein, gibt es nichts zu
 * tun, und das wird so gesagt.
 *
 * DIE ZUSAGE:
 *   (a) der Aufrufer wird SOFORT zurueckgegeben (nichts blockiert),
 *   (b) ein laufender Refresh blockiert keinen zweiten (SQLite-Lock),
 *   (c) die Entscheidung ist BENANNT — kein stilles Schweigen.
 */

import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { indexMeta, openIndex, probeCandidates, rankContextCandidates, refreshIndex } from './index-core.js';

/** Der Vertrag dieser schmalen Faehigkeit. */
export const REFRESH_CONTRACT = 'shinon.project-index/refresh-v1';

/** Die Grunde, warum ein Refresh NICHT lief — benannt, nie still. */
export const REFRESH_GRUENDE = Object.freeze({
  NICHT_GEFRAGT: 'NICHT_GEFRAGT',
  LAEUFT_SCHON: 'LAEUFT_SCHON',
  FRISCH: 'FRISCH',
  ZU_JUNG: 'ZU_JUNG',
  KEIN_INDEX: 'KEIN_INDEX',
  FREMDE_ROOT: 'FREMDE_ROOT',
  FEHLER: 'FEHLER',
});

/**
 * Die Alter-Schwelle: ab wie vielen Millisekunden gilt ein Index als VERALTET.
 *
 * STANDARD: 5 Minuten. Gemessen ist der Warm-Pfad (Kandidaten per `stat`, nur
 * Geaendertes lesen) mit 490 Dateien bei ~1,4 s im Worker. Fuenf Minuten
 * sind das 200-fache — der Refresh kostet dann nichts, was man spueren
 * koennte, und der Index ist trotzdem nicht zu alt, dass ein Turn ins Leere
 * laeuft.
 */
export const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Entscheidet, ob ein Refresh noetig ist — OHNE etwas zu tun.
 *
 * @param {object} eingabe
 * @param {number} eingabe.now der aktuelle Zeitstempel (ms)
 * @param {number} [eingabe.lastRefresh] wann zuletzt aufgefrischt wurde (ms)
 * @param {boolean} [eingabe.laeuft] laeuft gerade ein Refresh
 * @param {boolean} [eingabe.geaendert] hat sich der Workspace geaendert
 * @param {number} [eingabe.maxAgeMs] die Altersschwelle
 * @param {boolean} [eingabe.indexDa] existiert der Index ueberhaupt
 * @returns {{nötig: boolean, grund: string, alterMs: number}}
 */
export function entscheideRefresh({
  now = Date.now(),
  lastRefresh = null,
  laeuft = false,
  geaendert = false,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  indexDa = true,
} = {}) {
  // EIN laufender Refresh ist die wichtigste Regel: SQLite kennt keinen
  // brauchbaren Lock auf dem Index, und zwei Worker auf derselben Datei sind
  // genau der Fehler, den man nicht im Log findet, sondern in der Fehlermeldung
  // Tausend Meilen weiter.
  if (laeuft) {
    return { nötig: false, grund: REFRESH_GRUENDE.LAEUFT_SCHON, alterMs: 0 };
  }
  // Ohne Index gibt es nichts aufzufrischen — der Aufbau ist ein anderer Weg
  // (der Worker-Build) und wird hier nicht pretending.
  if (!indexDa) {
    return { nötig: false, grund: REFRESH_GRUENDE.KEIN_INDEX, alterMs: 0 };
  }
  const alterMs = Number.isFinite(lastRefresh) && lastRefresh !== null ? Math.max(0, now - lastRefresh) : Infinity;
  // Der Workspace hat sich geaendert: das ist der stärkste Grund, unabhaengig vom Alter.
  if (geaendert) {
    return { nötig: true, grund: 'WORKSPACE_GEAENDERT', alterMs };
  }
  // Nie aufgefrischt (lastRefresh === null) heisst: unbekanntes Alter, also
  // AUFRISCHEN. Sonst bleibt ein Index, dessen Alter niemand kennt, fuer immer.
  if (!Number.isFinite(alterMs)) {
    return { nötig: true, grund: 'ALTER_UNBEKANNT', alterMs: 0 };
  }
  if (alterMs < maxAgeMs) {
    return { nötig: false, grund: REFRESH_GRUENDE.ZU_JUNG, alterMs };
  }
  return { nötig: true, grund: 'ALTER_UEBERSCHRITTEN', alterMs };
}

/**
 * Der Zustand des Refreshers: EIN laufender Refresh, viele Aufrufer.
 *
 * Das ist der Kern der Koordination: `start` gibt sofort zurueck, `promise`
 * ist das gemeinsame Ergebnis. Ein zweiter Aufruf im Fenster bekommt KEIN
 * eigenes Promise, sondern das laufende — so entsteht kein zweiter Worker
 * auf derselben Datei.
 */
export function createRefreshState() {
  return {
    laeuft: false,
    lastRefresh: null,
    promise: null,
    letzteUrsaache: null,
  };
}

/**
 * Startet einen Refresh, wenn die Entscheidung es erlaubt.
 *
 * @param {object} eingabe
 * @param {() => Promise<object>} eingabe.arbeiten die Arbeit (der Worker)
 * @param {object} eingabe.zustand der Zustand aus `createRefreshState`
 * @param {number} [eingabe.now]
 * @param {number} [eingabe.maxAgeMs]
 * @param {boolean} [eingabe.geaendert]
 * @param {boolean} [eingabe.indexDa]
 * @param {(zeile: string) => void} [eingabe.melden] die INFO-Zeile
 * @returns {Promise<{ok: boolean, grund: string, laeuft: boolean}>}
 */
export async function starteRefresh({
  arbeiten,
  zustand,
  now = Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  geaendert = false,
  indexDa = true,
  melden = () => {},
} = {}) {
  const entscheidung = entscheideRefresh({
    now,
    lastRefresh: zustand?.lastRefresh ?? null,
    laeuft: zustand?.laeuft === true,
    geaendert,
    maxAgeMs,
    indexDa,
  });
  zustand.letzteUrsaache = entscheidung.grund;
  // EIN laufender Refresh: der zweite Aufrufer wartet auf DASSELBE Ergebnis.
  // Das ist der Unterschied zwischen "koordiniert" und "abgelehnt": ein
  // abgelehnter Aufrufer weiss nicht, wann der Index fertig ist — er muesste
  // raten. Wer wartet, bekommt die Antwort.
  if (zustand?.laeuft === true && zustand.promise !== null) {
    return zustand.promise.then((ergebnis) => ({
      ok: ergebnis?.ok === true,
      grund: ergebnis?.grund ?? entscheidung.grund,
      laeuft: false,
      ergebnis: ergebnis?.ergebnis,
      mitgewartet: true,
    }));
  }
  if (!entscheidung.nötig) {
    // Der Grund wird GENANNT: "es lief nicht" und "es lief nicht, weil es
    // frisch war" sind verschiedene Nachrichten, und wer im Log nachfragt,
    // bekommt eine Antwort.
    melden(`[shinon-project-index] kein Refresh (${entscheidung.grund})`);
    return { ok: false, grund: entscheidung.grund, laeuft: false };
  }
  // Das laufende Promise wird VOR dem Start gesetzt: ein Aufrufer, der im
  // selben Tick kommt, sieht `laeuft` schon und wartet auf dasselbe Ergebnis.
  // Die Zuweisung steht HINTER dem IIFE-Aufruf, weil die IIFE `promise`
  // referenziert — eine `const` kann sich nicht selbst initialisieren (TDZ).
  let promise;
  promise = (async () => {
    zustand.laeuft = true;
    zustand.promise = promise;
    try {
      const ergebnis = await arbeiten();
      if (ergebnis?.ok === true) zustand.lastRefresh = Date.now();
      melden(`[shinon-project-index] Refresh ${ergebnis?.ok === true ? 'gelaufen' : 'fehlgeschlagen'} (${entscheidung.grund})`);
      return { ok: ergebnis?.ok === true, grund: entscheidung.grund, laeuft: false, ergebnis };
    } catch (error) {
      melden(`[shinon-project-index] Refresh fehlgeschlagen (${entscheidung.grund}): ${String(error?.message ?? error)}`);
      return { ok: false, grund: REFRESH_GRUENDE.FEHLER, laeuft: false, fehler: String(error?.message ?? error) };
    } finally {
      zustand.laeuft = false;
      zustand.promise = null;
    }
  })();
  zustand.promise = promise;
  return promise;
}

/**
 * Der Worker-Quelltext fuer den WARM-Pfad.
 *
 * GEMESSEN (2026-10-21, echter Index, 32 Kandidaten):
 *   Host  441 ms, 0 Eventloop-Ticks — der Eventloop stand STILL
 *
 * Der Worker ist keine Optimierung, sondern die Voraussetzung: 441 ms
 * blockierter Eventloop pro Turn heisst, dass der Agent in dieser Zeit keine
 * Eingabe verarbeiten kann. Der Aufrufer bekommt das Ergebnis, wenn es da ist
 * — und bis dahin laeuft der Agent weiter.
 *
 * Der Quelltext steht als eval:true im Modul, damit das Paket keine zweite
 * Worker-Datei braucht (der Bundle-Vertrag erlaubt nur die vier Pflichtdateien
 * plus assets/).
 */
const REFRESH_WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
import(workerData.module).then(
  (mod) => {
    try {
      parentPort.postMessage({ ok: true, report: mod.runWarmRefresh(workerData.options) });
    } catch (error) {
      parentPort.postMessage({ ok: false, error: String(error && error.message ? error.message : error) });
    }
  },
  (error) => parentPort.postMessage({ ok: false, error: String(error && error.message ? error.message : error) }),
);
`;

/**
 * Den Warm-Pfad im Worker ausfuehren: Kandidaten suchen, nur Geaendertes lesen.
 *
 * WARUM EIGENE DATEI: die Ausfuehrung gehoert nicht in den Host — der Host soll
 * entscheiden, WANN, und der Kern soll ausfuehren. (Der Grund von damals, ein
 * Bestandseintrag fuer 2 220 Zeilen in `index-core.js`, ist seit dem Schnitt vom
 * 2026-10-22 weg: der Kern liegt jetzt in fuenf Dateien unter 650 Zeilen. Die
 * Trennung bleibt trotzdem richtig, weil sie nicht Groesse, sondern Eigentum
 * folgt.)
 *
 * @param {object} eingabe
 * @param {string} eingabe.file der Index-Pfad
 * @param {string} eingabe.root die Workspace-Wurzel
 * @param {string} [eingabe.prompt] der Text, aus dem Kandidaten kommen
 * @param {number} [eingabe.chunkLines]
 * @param {number} [eingabe.maxFileBytes]
 * @param {(report: object) => void} [eingabe.onRefresh]
 * @returns {Promise<{ok: boolean, report?: object, error?: string}>}
 */
/**
 * Den Warm-Pfad ausfuehren — die Arbeit, die der WORKER macht.
 *
 * Exportiert, weil der Worker-Quelltext dieses Modul laedt und die Funktion
 * ueber den Modulraum aufruft (`mod.runWarmRefresh(...)`).
 *
 * @param {object} options
 * @param {string} options.file der Index-Pfad
 * @param {string} options.root die Workspace-Wurzel
 * @param {string} [options.prompt]
 * @param {number} [options.chunkLines]
 * @param {number} [options.maxFileBytes]
 * @returns {object} der Bericht
 */
export function runWarmRefresh(options = {}) {
  const { file, root, prompt = '', chunkLines = 40, maxFileBytes = 262144 } = options;
  // Ein fremder Index (falscher Root) wird VOR der Arbeit verworfen: sonst
  // schreibt der Refresh in die Datenbank eines anderen Projekts.
  const db = openIndex(file, { expectedRoot: root });
  try {
    const meta = indexMeta(db);
    const absoluteRoot = typeof meta?.root === 'string' && meta.root !== '' ? meta.root : root;
    // Die Kandidaten kommen aus dem INDEX (rankContextCandidates) UND aus dem
    // Prompt (probeCandidates). Nur der Prompt liefert bei einem leeren oder
    // allgemeinen Text NICHTS — die Messung zeigte 0 Kandidaten fuer
    // "index persona prompter project seam". Der Index weiss, welche Dateien
    // er kennt; der Prompt weiss, welche davon jetzt interessant sind.
    const ausDemIndex = rankContextCandidates(db, prompt).slice(0, 32).map((kandidat) => kandidat.path);
    const kandidaten = [...new Set([...ausDemIndex, ...probeCandidates(absoluteRoot, prompt, 32)])].sort();
    return refreshIndex(db, absoluteRoot, kandidaten, { chunkLines, maxFileBytes });
  } finally {
    db.close();
  }
}

export function fuehreRefreshImWorker({
  file,
  root,
  prompt = '',
  chunkLines = 40,
  maxFileBytes = 262144,
  onRefresh,
} = {}) {
  // Der Worker laeuft NEBEN dem Host: der Eventloop bleibt frei. GEMESSEN
  // (2026-10-21, echter Index, 32 Kandidaten): der Host brauchte 441 ms bei
  // 0 Eventloop-Ticks — der Eventloop stand still. Im Worker passiert das
  // Gleiche, aber der Agent laeuft weiter.
  return new Promise((resolvePromise) => {
    let worker;
    try {
      worker = new Worker(REFRESH_WORKER_SOURCE, {
        eval: true,
        workerData: { module: import.meta.url, options: { file, root, prompt, chunkLines, maxFileBytes } },
      });
    } catch (error) {
      resolvePromise({ ok: false, error: String(error?.message ?? error) });
      return;
    }
    let settled = false;
    const settle = (wert) => {
      if (settled) return;
      settled = true;
      resolvePromise(wert);
    };
    worker.on('message', (message) => {
      if (message?.ok === true) {
        if (typeof onRefresh === 'function') {
          try { onRefresh(message.report); } catch { /* die Senke ist Diagnose, kein Vertrag */ }
        }
        settle({ ok: true, report: message.report });
      } else {
        settle({ ok: false, error: message?.error ?? 'unbekannter Workerfehler' });
      }
      worker.terminate();
    });
    worker.on('error', (error) => settle({ ok: false, error: String(error?.message ?? error) }));
    worker.on('exit', (code) => settle({ ok: false, error: `Worker endete ohne Bericht (Code ${code})` }));
  });
}

export function createRefreshService({
  file,
  root,
  chunkLines = 40,
  maxFileBytes = 262144,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  trace = false,
} = {}) {
  const zustand = createRefreshState();
  const melden = (zeile) => { if (trace) console.log(zeile); };
  return {
    contract: REFRESH_CONTRACT,
    /**
     * Den Index im Hintergrund auffrischen. Gibt SOFORT zurueck — der Aufrufer
     * wartet nicht auf den Index. Das Promise ist das Ergebnis, falls ihn
     * jemand braucht; der Aufrufer MUSS es nicht abwarten.
     */
    refreshAsync(prompt = '', options = {}) {
      return starteRefresh({
        arbeiten: () => fuehreRefreshImWorker({
          file,
          root,
          prompt,
          chunkLines,
          maxFileBytes,
          onRefresh: (report) => melden(`[shinon-project-index] Refresh: ${report.written} geschrieben, ${report.removed} entfernt`),
        }),
        zustand,
        maxAgeMs: Number.isFinite(options?.maxAgeMs) ? options.maxAgeMs : maxAgeMs,
        geaendert: options?.geaendert === true,
        indexDa: existsSync(file),
        melden,
      });
    },
    /** Der Zustand, ohne ihn zu aendern — fuer Diagnose und Tests. */
    state() {
      return { laeuft: zustand.laeuft, lastRefresh: zustand.lastRefresh, grund: zustand.letzteUrsaache };
    },
  };
}
