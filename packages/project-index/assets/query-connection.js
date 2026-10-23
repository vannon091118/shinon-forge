/**
 * Die warme Verbindung der Abfrage — EIN Handle, das sich selbst entwertet.
 *
 * WARUM DIESE DATEI EXISTIERT (gemessen 2026-10-23, 582 Dateien im Baum): jede
 * Abfrage oeffnete den Index neu. `openIndex` ist kein Lesen, sondern ein
 * Schreibvorgang — Verbindung, fuenf Pragmas, ein `create table if not exists`
 * und die meta-Zeilen in einer Transaktion (ein fsync). Der Preis haengt nicht
 * am Inhalt: `index-open` lag bei p50 rund 151 ms, `index-warm` bei 268 ms,
 * waehrend ein blosser Dateiscan derselben Maschine p50 rund 5 ms kostet. Der
 * Turn zahlte diesen Festpreis fuer eine Antwort, die danach aus demselben
 * bereits geoeffneten Index kam.
 *
 * DIE ENTSCHEIDUNG: die Verbindung lebt so lange wie die Abfrage-Faehigkeit.
 * Das ist erlaubt, weil SQLite in WAL zwei Verbindungen auf derselben Datei
 * kennt und eine LESENDE Verbindung ohne offene Transaktion keinen Checkpoint
 * und keinen Schreiber blockiert — Zwischenaufrufe halten keine Transaktion.
 *
 * DIE ZUSAGE GEGEN ALTE DATEN ist staerker als der alte Weg, nicht schwaecher.
 * Je Aufruf wird geprueft:
 *
 *   1. IDENTITAET der Datei — Geraet, Inode, Groesse, mtime UND ctime. Ein
 *      ausgetauschter Index (Loeschen, Neuanlegen, Umbenennen, Kopie daneben)
 *      hat einen anderen Inode und wird verworfen; ein Neuschreiben am selben
 *      Ort aendert mindestens ctime, und ctime laesst sich nicht zuruecksetzen.
 *      Fehlt die Datei, gibt es `null` — dieselbe ehrliche Leere wie zuvor.
 *   2. KOPFZEILE der Datei — Vertrag, Schema-, Indexer-Fassung und die
 *      Root-Identitaet. Ein untergeschobener oder in place neu gebauter Index
 *      mit fremder Wurzel wird NICHT weiterbenutzt: die Verbindung wird
 *      geschlossen und ueber `openIndex` neu geoeffnet, das die Bindung prueft
 *      und einen fremden Stand verwirft (S1).
 *
 * Was hier NICHT passiert: die Datenzeilen werden nicht gegengeprueft. Das ist
 * der Warm-Pfad der Abfrage (`refreshIndex`, Inode-Stempel je Kandidat) und
 * bleibt seine Aufgabe; diese Datei entscheidet nur, WELCHE Verbindung den
 * aktuellen Stand liest. Ein Checkpoint der WAL-Datei aendert die mtime der
 * Hauptdatei und kostet deshalb EIN Neuoeffnen — nie eine Antwort aus einem
 * veralteten Inode.
 */

import { statSync } from 'node:fs';
import { CONTRACT, INDEXER_VERSION, SCHEMA_VERSION } from './index-format.js';
import { openIndex } from './index-store.js';
import { fingerprintRoot } from './workspace.js';

/**
 * Die meta-Schluessel, die eine Verbindung entwerten. `root` reist mit, weil
 * der Aufrufer den Projektnamen aus der Wurzel bildet — eine zweite Abfrage
 * dafuer waere ein zweiter Lesevorgang fuer dieselbe Zeile.
 */
const HEADER_KEYS = ['contract', 'schema_version', 'indexer_version', 'root', 'root_id'];

/**
 * Die Identitaet der Datei — `null`, wenn es sie (nicht mehr) gibt.
 *
 * ctime ist der Teil, den ein Inhaltsschreiber nicht faelschen kann: `utimes`
 * setzt atime/mtime zurueck, ctime zieht bei jeder Aenderung mit. Genau diese
 * Luecke kennt der Warm-Pfad der Dateien und schliesst sie mit demselben
 * Gedanken (Stempel statt mtime allein).
 */
export function fileIdentity(file) {
  try {
    const info = statSync(file);
    if (!info.isFile()) return null;
    return { dev: info.dev, ino: info.ino, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs };
  } catch {
    return null;
  }
}

/** Dieselbe Datei, derselbe Stand? Ein einziges abweichendes Feld entwertet. */
function sameFile(a, b) {
  return (
    a !== null &&
    b !== null &&
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}

/** Die Kopfzeile in EINEM Lesevorgang — fuenf kleine Index-Treffer, kein Scan. */
function readHeader(db) {
  const marks = HEADER_KEYS.map(() => '?').join(', ');
  const header = {};
  for (const row of db.prepare(`select key, value from meta where key in (${marks})`).all(...HEADER_KEYS)) {
    header[row.key] = row.value;
  }
  return header;
}

/**
 * Eine warme Verbindung bauen.
 *
 * @param {object} options
 * @param {string} options.file der Index-Pfad
 * @param {string} [options.expectedRoot] die erwartete Workspace-Wurzel ('' = keine Bindung)
 * @returns {{acquire: () => ({db: object, root: string|null}|null), close: () => void, stats: () => object}}
 */
export function createWarmConnection({ file, expectedRoot = '' } = {}) {
  // Die Bindung wird EINMAL gerechnet: der Fingerabdruck ist rein, und dieselbe
  // Wurzel bleibt dieselbe Wurzel. `null` heisst ausdruecklich "keine Bindung",
  // nicht "leere Wurzel" — sonst wuerde ein Aufrufer ohne Wurzel jeden Index
  // verwerfen, den er liest.
  const boundRootId = typeof expectedRoot === 'string' && expectedRoot.trim() !== ''
    ? fingerprintRoot(expectedRoot).rootId
    : null;
  let db = null;
  let identity = null;
  const counts = { opened: 0, reused: 0, replaced: 0, closed: 0 };

  const close = () => {
    if (db === null) return;
    try {
      db.close();
    } catch {
      /* Ein Fehler beim Schliessen aendert keine Antwort mehr — das Handle ist danach weg. */
    }
    db = null;
    identity = null;
    counts.closed += 1;
  };

  /** Passt der gelesene Kopf zu Vertrag, Fassung und erwarteter Wurzel? */
  const fits = (header) =>
    header.contract === CONTRACT &&
    header.schema_version === String(SCHEMA_VERSION) &&
    header.indexer_version === String(INDEXER_VERSION) &&
    (boundRootId === null || header.root_id === boundRootId);

  /**
   * Neu oeffnen — der EINE Weg, auf dem die Pruefung von `openIndex` laeuft
   * (fremder Vertrag, fremde Fassung, fremde Wurzel werden verworfen).
   */
  const reopen = () => {
    close();
    db = openIndex(file, { expectedRoot });
    identity = fileIdentity(file);
    counts.opened += 1;
    return db;
  };

  return {
    /**
     * Die Verbindung fuer EINEN Aufruf holen.
     *
     *   {db, root}  eine offene, gepruefte Verbindung
     *   null        es gibt keinen Index (Datei weg) — ehrliche Leere; die
     *               Abfrage legt nichts an
     *   wirft       die Datei ist da, aber unbrauchbar (kaputt) — ein Fehler,
     *               kein stilles Nichts, wie beim bisherigen Oeffnen
     */
    acquire() {
      const current = fileIdentity(file);
      if (current === null) {
        close();
        return null;
      }
      if (db !== null && sameFile(identity, current)) {
        let header = null;
        try {
          header = readHeader(db);
        } catch {
          // Eine Verbindung, die ihre eigene Kopfzeile nicht lesen kann, ist
          // keine: sie wird ersetzt, statt eine Antwort aus ihr zu bauen.
          header = null;
        }
        if (header !== null && fits(header)) {
          counts.reused += 1;
          return { db, root: header.root ?? null };
        }
        counts.replaced += 1;
      }
      reopen();
      const header = readHeader(db);
      return { db, root: header.root ?? null };
    },
    close,
    /** Die Zaehlung fuer Tests und Messungen — nie eine zweite Wahrheit im Log. */
    stats() {
      return { ...counts, open: db !== null };
    },
  };
}
