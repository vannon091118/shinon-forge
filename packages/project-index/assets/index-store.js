/**
 * Die Ablage — Oeffnen, meta, Speicher, Suche.
 *
 * Eigentuemer dieser Datei ist die DATEI: Verbindung und Schema, die
 * Fassungspruefung beim Oeffnen (fremder Vertrag, fremde Root, fremde Fassung
 * werden verworfen statt weiterbenutzt), die meta-Zeilen in EINER Transaktion,
 * der Speicher (`MEMORY_TABLE`, eigene Fassung) und die FTS-Suche.
 */

import { WORKSPACE_CONTRACT, fingerprintRoot } from './workspace.js';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONTRACT, FTS_TABLE, INDEXER_VERSION, LEDGER_CONTRACT, MEMORY_TABLE, MEMORY_VERSION, PRIMARY_TABLES, SCHEMA, SCHEMA_VERSION, SECRET_TABLE } from './index-format.js';

/** Einen Metawert lesen, ohne zu werfen, wenn die Tabelle noch nicht steht. */
export function metaValue(db, key) {
  try {
    return db.prepare('select value from meta where key = ?').get(key)?.value ?? null;
  } catch {
    return null;
  }
}

export const setMeta = (db, key, value) => db.prepare('insert or replace into meta(key, value) values (?, ?)').run(key, value);

/**
 * Mehrere meta-Werte in EINER Transaktion.
 *
 * Jede Transaktion ist ein fsync: das Oeffnen schrieb sieben einzelne und zahlte
 * den Festpreis siebenmal (Messung: docs/probes/perf-baseline.json).
 * Nur ausserhalb einer laufenden Transaktion aufrufen — SQLite verschachtelt nicht.
 */
function setMetaMany(db, entries) {
  if (entries.length === 0) return;
  const statement = db.prepare('insert or replace into meta(key, value) values (?, ?)');
  db.exec('begin');
  try {
    for (const [key, value] of entries) statement.run(key, value);
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}

/**
 * Den Index oeffnen, das Schema anlegen und die Fassung festhalten.
 *
 * Ein vorhandener Index mit fremdem Vertrag oder fremder Schemafassung wird
 * verworfen und neu angelegt: ein stillschweigend weiterbenutzter Index mit
 * anderer Bedeutung waere schlimmer als ein Neuaufbau.
 */
/**
 * Die EINE Stelle, an der eine SQLite-Verbindung dieses Pakets aufgesetzt wird.
 *
 * Warum als Funktion: Index und Ledger sind zwei Dateien, aber nicht zwei
 * Datenbanken mit zwei Politiken. Jede Verbindung traegt dieselbe Form:
 *
 *   journal_mode = wal   ein Leser blockiert den Schreiber nicht (und umgekehrt)
 *   synchronous = full   die Haltbarkeit wird BENANNT, nicht geerbt — der
 *                        SQLite-Standard ist keine Zusage
 *   secure_delete = on   ein `delete` loescht Zeilen, nicht Bytes (gemessen: nach
 *                        dem Entfernen eines Werts stand er in den freigegebenen
 *                        Seiten der Datei weiterhin drin)
 *   busy_timeout         zwei Prozesse (Host + Worker) warten statt zu scheitern
 *   foreign_keys = on    die Kanten des Index sind Beziehungen, keine Zahlen
 *
 * Gepinnt von `scripts/gate/tests/project-index.test.mjs` gegen die echten Dateien.
 */
function openDatabase(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal');
  db.exec('pragma synchronous = full');
  db.exec('pragma secure_delete = on');
  db.exec('pragma busy_timeout = 5000');
  db.exec('pragma foreign_keys = on');
  db.exec('create table if not exists meta(key text primary key, value text not null)');
  return db;
}

/**
 * Den DAUERHAFTEN Ledger oeffnen (dieselbe Verbindungsform, eine eigene Datei).
 *
 * Er traegt nur die Ablage und ihre Fassung: der Index kann jederzeit neu
 * gebaut werden, der Ledger nie. Ein Fassungssprung der Ablage verwirft sie
 * (wie beim Index), ein Index-Neuaufbau beruehrt sie nicht — sie liegt nicht
 * mehr in derselben Datei.
 */
export function openLedger(file) {
  const db = openDatabase(file);
  const stored = { contract: metaValue(db, 'ledger_contract'), memory_version: metaValue(db, 'memory_version') };
  const built = stored.contract !== null || stored.memory_version !== null;
  if (built && (stored.contract !== LEDGER_CONTRACT || stored.memory_version !== String(MEMORY_VERSION))) {
    db.exec(`drop table if exists ${MEMORY_TABLE}`);
  }
  db.exec(`create table if not exists ${MEMORY_TABLE}(namespace text not null, kind text not null, ref text not null, ordinal integer not null default 0, doc text not null, primary key(namespace, kind, ref))`);
  setMeta(db, 'ledger_contract', LEDGER_CONTRACT);
  setMeta(db, 'memory_version', String(MEMORY_VERSION));
  return db;
}

/**
 * Einen Stand aus dem INDEX in den Ledger holen — verlustfrei, atomar, idempotent.
 *
 * Der Index wird READ-ONLY geoeffnet (`openIndex` wuerde fehlende Tabellen
 * anlegen und einen fremden Index neu bauen — ein Migrationslauf darf die Quelle
 * nicht anfassen). Kopiert wird in EINER Transaktion; faellt etwas um, bleibt
 * der Ledger leer statt halb gefuellt.
 *
 * Idempotent ist es, weil VOR dem Schreiben geprueft wird, ob der Ledger den
 * Namensraum schon hat: der zweite Aufruf tut nichts. Nichts wird geloescht — die
 * Zeilen des Index bleiben stehen, sie sind die Sicherung (und der naechste
 * Index-Neuaufbau raeumt sie ohnehin selbst weg).
 */
export function migrateMemory(db, { fromFile, namespace, expectedRoot = '' }) {
  if (!existsSync(fromFile)) return { migrated: 0, reason: 'kein Index vorhanden' };
  if (readMemory(db, namespace) !== null) return { migrated: 0, reason: 'Ledger traegt den Stand bereits' };
  let source = null;
  try {
    source = new DatabaseSync(fromFile, { readOnly: true });
  } catch (error) {
    return { migrated: 0, reason: `Index nicht lesbar (${error?.message ?? error})`, error: 'INDEX_UNREADABLE' };
  }
  // S1: eine Migration darf keinen FREMDEN Workspace importieren. Der Ledger ist
  // Nutzerzustand und fuer alle Projekte derselbe — ohne diese Pruefung koennte
  // ein untergeschobener Index die Urteile eines anderen Projekts einschleusen.
  if (typeof expectedRoot === 'string' && expectedRoot.trim() !== '') {
    const want = fingerprintRoot(expectedRoot);
    let storedRoot = null;
    let storedId = null;
    try {
      storedRoot = source.prepare("select value from meta where key = 'root'").get()?.value ?? null;
      storedId = source.prepare("select value from meta where key = 'root_id'").get()?.value ?? null;
    } catch {
      // Ein Index ohne meta-Tabelle macht keine Aussage ueber seine Root; dann
      // gilt die alte Regel (kopieren), weil der Pfad pro Projekt gebildet wird.
    }
    const gotId = storedId ?? (typeof storedRoot === 'string' && storedRoot !== '' ? fingerprintRoot(storedRoot).rootId : null);
    if (gotId !== null && gotId !== want.rootId) {
      return { migrated: 0, reason: `Index von ${storedRoot ?? 'unbekannt'} gilt nicht fuer ${want.root}`, error: 'FOREIGN_ROOT' };
    }
  }
  try {
    let rows;
    try {
      rows = source.prepare(`select kind, ref, ordinal, doc from ${MEMORY_TABLE} where namespace = ? order by kind asc, ordinal asc, ref asc`).all(namespace);
    } catch (error) {
      const detail = String(error?.message ?? error);
      // ZWEI Faelle, die nicht dasselbe sind:
      //   a) Der Index ist da, aber kein SQLite (Text, halb geschrieben): dann
      //      wissen wir NICHT, ob dort ein Stand liegt — das ist ein Fehler und
      //      keine Leere. Ein stilles „nichts da" waere hier eine Datenluege.
      //   b) Der Index ist lesbar, kennt die Ablage aber nicht (aeltere Fassung,
      //      fremdes Schema): dann gibt es nichts zu holen.
      if (/not a database|malformed|disk image/i.test(detail)) {
        return { migrated: 0, reason: `Index unlesbar (${detail})`, error: 'INDEX_UNREADABLE' };
      }
      return { migrated: 0, reason: 'Index ohne Ablage-Tabelle' };
    }
    if (rows.length === 0) return { migrated: 0, reason: 'Index hat keinen Stand fuer diesen Namensraum' };
    db.exec('begin');
    try {
      const insert = db.prepare(`insert or ignore into ${MEMORY_TABLE}(namespace, kind, ref, ordinal, doc) values (?, ?, ?, ?, ?)`);
      let migrated = 0;
      for (const row of rows) {
        insert.run(namespace, row.kind, row.ref, row.ordinal, row.doc);
        migrated += 1;
      }
      setMeta(db, 'migrated_from', fromFile);
      setMeta(db, 'migrated_rows', String(migrated));
      db.exec('commit');
      return { migrated, reason: `aus ${fromFile}` };
    } catch (error) {
      db.exec('rollback');
      return { migrated: 0, reason: `Migration abgebrochen (${error?.message ?? error})` };
    }
  } finally {
    source.close();
  }
}

/**
 * Den Index oeffnen, das Schema anlegen und die Fassung festhalten.
 *
 * Ein vorhandener Index mit fremdem Vertrag oder fremder Schemafassung wird
 * verworfen und neu angelegt: ein stillschweigend weiterbenutzter Index mit
 * anderer Bedeutung waere schlimmer als ein Neuaufbau.
 */
export function openIndex(file, options = {}) {
  const db = openDatabase(file);

  const stored = {
    contract: metaValue(db, 'contract'),
    schema_version: metaValue(db, 'schema_version'),
    indexer_version: metaValue(db, 'indexer_version'),
    memory_version: metaValue(db, 'memory_version'),
  };
  // Ein LEERER Index ist kein fremder Index: geprueft wird nur, was schon gebaut war.
  const built = stored.contract !== null || stored.schema_version !== null;

  // S1: Root-Bindung. Wer eine erwartete Root nennt, bekommt einen Index mit
  // FREMDER Identitaet nicht zu sehen — er wird wie eine unpassende Fassung
  // verworfen und leer neu angelegt. Die Identitaet ist der Fingerabdruck, nicht
  // der Pfad-String: zwei Schreibweisen desselben Ordners sind derselbe
  // Workspace, zwei Ordner mit gleichen relativen Pfaden sind es nicht.
  // Alte Indexe tragen nur `root`; daraus wird dieselbe Identitaet gerechnet.
  const expected = typeof options?.expectedRoot === 'string' && options.expectedRoot.trim() !== ''
    ? fingerprintRoot(options.expectedRoot)
    : null;
  const storedRootPath = metaValue(db, 'root');
  const storedRootId = metaValue(db, 'root_id') ?? (typeof storedRootPath === 'string' && storedRootPath !== '' ? fingerprintRoot(storedRootPath).rootId : null);
  const foreignRoot = built && expected !== null && storedRootId !== null && storedRootId !== expected.rootId;

  const incompatible =
    foreignRoot ||
    (built &&
      (stored.contract !== CONTRACT ||
        stored.schema_version !== String(SCHEMA_VERSION) ||
        stored.indexer_version !== String(INDEXER_VERSION)));
  const rebuilt = incompatible;
  if (incompatible) {
    for (const table of [FTS_TABLE, SECRET_TABLE, ...PRIMARY_TABLES]) db.exec(`drop table if exists "${table}"`);
  }

  // Die Ablage wird NUR von ihrer eigenen Fassung verworfen. Der Neuaufbau oben
  // trifft sie ausdruecklich nicht: was aus dem Projekt wieder herstellbar ist,
  // darf ein Fassungssprung kosten — was der Mensch geurteilt hat, nicht.
  if (stored.memory_version !== null && stored.memory_version !== String(MEMORY_VERSION)) {
    db.exec(`drop table if exists ${MEMORY_TABLE}`);
  }
  for (const statement of SCHEMA) db.exec(statement);
  // Eine Datei, die gerade Tabellen verloren hat, traegt deren Bytes noch. Der
  // Index ist abgeleitete Kopie — ein Neuzusammenzug kostet hier nur Zeit.
  if (rebuilt) db.exec('vacuum');
  const metas = [
    ['schema_version', String(SCHEMA_VERSION)],
    ['indexer_version', String(INDEXER_VERSION)],
    ['memory_version', String(MEMORY_VERSION)],
    ['contract', CONTRACT],
  ];
  // Eine genannte Root schlaegt sich auch im (leeren) Index nieder: der naechste
  // Leser kann die Bindung pruefen, statt sie anzunehmen.
  if (expected !== null) {
    metas.push(['root', expected.root], ['root_id', expected.rootId], ['workspace_contract', WORKSPACE_CONTRACT]);
  }
  setMetaMany(db, metas);
  return db;
}

/** Die Kopffelder des Index — die kleinste Auskunft, die ein Leser braucht. */
export function indexMeta(db) {
  return {
    contract: metaValue(db, 'contract'),
    schema_version: metaValue(db, 'schema_version'),
    indexer_version: metaValue(db, 'indexer_version'),
    memory_version: metaValue(db, 'memory_version'),
    root: metaValue(db, 'root'),
    root_id: metaValue(db, 'root_id'),
    workspace_contract: metaValue(db, 'workspace_contract'),
    symbols_digest: metaValue(db, 'symbols_digest'),
    updated_at_ms: metaValue(db, 'updated_at_ms'),
  };
}

/** Zaehlung je Tabelle — die kleinste ehrliche Auskunft ueber den Index. */
export function indexStats(db) {
  const count = (table) => db.prepare(`select count(*) as n from "${table}"`).get().n;
  const stats = {};
  for (const table of PRIMARY_TABLES) stats[table] = count(table);
  stats[FTS_TABLE] = count(FTS_TABLE);
  stats[SECRET_TABLE] = count(SECRET_TABLE);
  return stats;
}

/**
 * Die Fundstellen ausgeschriebener Werte — Pfad, Zeile und Art. Der WERT steht
 * nicht in der Datenbank und kann deshalb auch nicht zurueckgegeben werden; wer
 * den Wert braucht, liest die Datei selbst.
 */
export function secretFindings(db, path) {
  const sql = `select path, line, kind from ${SECRET_TABLE}${path === undefined ? '' : ' where path = ?'} order by path, line`;
  return path === undefined ? db.prepare(sql).all() : db.prepare(sql).all(path);
}

/**
 * Die Ablage EINES Namensraums lesen — `null`, wenn dort nichts steht.
 *
 * Drei Zusagen halten den Unterschied zwischen „leer" und „kaputt":
 *
 *   keine Zeile   `null`. Kein erfundenes leeres Protokoll: "hier war noch
 *                 nichts" ist eine andere Aussage als "hier stand nichts mehr".
 *   kaputte Zeile GEZAEHLT und uebergangen (`broken`), nicht geworfen: ein
 *                 einzelner unlesbarer Eintrag darf die ganze Ablage nicht
 *                 unbrauchbar machen — und still verschwinden darf er auch
 *                 nicht. Der Aufrufer nennt die Zahl im Protokoll.
 *   Reihenfolge   folgt `ordinal`, nicht der Einfuegereihenfolge: dieselbe
 *                 Folge von Signalen ergibt dieselbe Tafel, auch ueber einen
 *                 Neustart hinweg.
 *
 * Was ein Dokument BEDEUTET, weiss diese Funktion nicht — sie liefert die drei
 * Arten getrennt zurueck und ueberlaesst das Lesen dem Aufrufer.
 */
export function readMemory(db, namespace) {
  const rows = db
    .prepare(`select kind, ref, ordinal, doc from ${MEMORY_TABLE} where namespace = ? order by kind asc, ordinal asc, ref asc`)
    .all(namespace);
  if (rows.length === 0) return null;
  const records = [];
  const memos = [];
  let summary = null;
  let broken = 0;
  for (const row of rows) {
    let doc;
    try {
      doc = JSON.parse(row.doc);
    } catch {
      broken += 1;
      continue;
    }
    if (row.kind === 'record') records.push({ ordinal: row.ordinal, doc });
    else if (row.kind === 'memo') memos.push(doc);
    else if (row.kind === 'summary') summary = doc;
    else broken += 1;
  }
  return {
    records: records.sort((a, b) => a.ordinal - b.ordinal).map((entry) => entry.doc),
    memos,
    scorecard: summary?.scorecard ?? null,
    notes: typeof summary?.notes === 'number' ? summary.notes : 0,
    blockWeights: summary?.blockWeights ?? {}, blockAttributions: Array.isArray(summary?.blockAttributions) ? summary.blockAttributions : [],
    broken,
  };
}

/**
 * Die Ablage EINES Namensraums schreiben — ein Aufruf, eine Transaktion.
 *
 * Der Aufruf ERSETZT den Namensraum: was nicht mehr in `state` steht, ist
 * danach nicht mehr da. Genau das braucht ein Widerruf — die Zeile faellt weg,
 * und niemand rechnet daneben ein Gegen-Delta. Faellt irgendetwas um, rollt die
 * Transaktion zurueck: ein halb geschriebener Stand waere schlimmer als der
 * alte, weil er wie ein ganzer aussieht.
 *
 * Die drei Arten bleiben `record`, `memo` und `summary`; darin liegen nun auch
 * Gewichte/Attributionsbelege. Alte Summary-Zeilen lesen ohne Lernfelder leer,
 * ein Versionswechsel ist nicht noetig.
 */
export function writeMemory(db, namespace, state = {}) {
  const records = Array.isArray(state?.records) ? state.records : [], memos = Array.isArray(state?.memos) ? state.memos : [];
  const summary = { scorecard: state?.scorecard ?? null, notes: typeof state?.notes === 'number' ? state.notes : 0, blockWeights: state?.blockWeights ?? {}, blockAttributions: Array.isArray(state?.blockAttributions) ? state.blockAttributions : [] };
  db.exec('begin');
  try {
    db.prepare(`delete from ${MEMORY_TABLE} where namespace = ?`).run(namespace);
    const insert = db.prepare(`insert into ${MEMORY_TABLE}(namespace, kind, ref, ordinal, doc) values (?, ?, ?, ?, ?)`);
    let written = 0;
    records.forEach((record, index) => {
      insert.run(namespace, 'record', String(index), index, JSON.stringify(record ?? null));
      written += 1;
    });
    memos.forEach((memo, index) => {
      insert.run(namespace, 'memo', String(memo?.id ?? index), index, JSON.stringify(memo ?? null));
      written += 1;
    });
    insert.run(namespace, 'summary', '', 0, JSON.stringify(summary));
    written += 1;
    db.exec('commit');
    return written;
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}

/**
 * Die FTS5-Suche: Pfade mit Trefferzahl, absteigend. Ein Suchausdruck, den FTS5
 * nicht annimmt (etwa ein alleinstehendes `AND`), liefert eine leere Liste statt
 * eines Abbruchs — ein unbrauchbarer Suchausdruck darf keinen Agentenschritt
 * brechen.
 */
export function searchChunks(db, query, limit = 10) {
  try {
    return db.prepare(`select path, count(*) as hits from "${FTS_TABLE}" where "${FTS_TABLE}" match ? group by path order by hits desc, path asc limit ?`)
      .all(query, limit);
  } catch {
    return [];
  }
}