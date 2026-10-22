/**
 * Der Lauf — inkrementell fortschreiben, im Host oder im Worker.
 *
 * Eigentuemer dieser Datei ist der FORTSCHRITT: was sich seit dem letzten Lauf
 * geaendert hat, wird gelesen, redigiert, geschrieben; was verschwunden ist,
 * wird entfernt. Der Worker-Quelltext steht hier, weil er genau diesen `runIndex`
 * aufruft — ein zweiter Codepfad waere ein zweiter Wahrheitsbegriff.
 */

import { WORKSPACE_CONTRACT, fingerprintRoot } from './workspace.js';
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { REFERENCABLE_KINDS, chunkText, createReferenceMatcher, errorCodeOf, extractEdges, extractSymbols, indexPath, inodeStamp, languageOf, listFiles, readText, readTextWithReason, toProjectPath } from './index-extract.js';
import { DEFAULT_INDEX_ROOT, FTS_TABLE, PRIMARY_TABLES, SECRET_TABLE, SOURCE_EXTENSIONS, protectedReason, redactSecrets } from './index-format.js';
import { metaValue, openIndex, setMeta } from './index-store.js';

/**
 * Eine Datei aus allen Tabellen entfernen, bevor sie neu geschrieben wird —
 * und ebenso, wenn sie geschuetzt ist oder verschwindet. Die Fundstellen gehen
 * mit: bleibt eine Datei geschuetzt, darf ihr Befund nicht stehen bleiben, sonst
 * waere er ein Hinweis ohne Gegenstand.
 */
export function forgetFile(db, path) {
  for (const table of [FTS_TABLE, SECRET_TABLE, ...PRIMARY_TABLES]) {
    db.prepare(`delete from "${table}" where path = ?`).run(path);
  }
}

/**
 * Eine Datei vollstaendig indexieren: Dateizeile, Symbole, Kanten, Chunks und
 * die FTS-Spiegelung. Gibt die Kanten zurueck — der Aufrufer loest daraus die
 * Touches auf, weil dafuer die Kenntnis aller Dateien noetig ist.
 *
 * Der Text wird VOR der ersten Zeile redigiert (Plan §13: der Schutz greift vor
 * der persistierten Speicherung). Danach gibt es keinen Pfad mehr, auf dem
 * Rohinhalt in die Datenbank kommt: Symbole, Kanten, Chunks und FTS lesen den
 * redigierten Text.
 *
 * Der digest bleibt der Hash des ROHEN Inhalts: er entscheidet, ob sich eine
 * Datei geaendert hat, und ein Hash ist kein Geheimnis. Wuerde er aus dem
 * redigierten Text gebildet, saehe ein Lauf eine Aenderung nicht, die nur einen
 * bereits ersetzten Wert betrifft.
 */
export function indexFile(db, root, absolute, file, options) {
  const path = toProjectPath(root, absolute);
  const language = languageOf(path) ?? 'text';
  const digest = createHash('sha256').update(file.text).digest('hex');
  const safe = redactSecrets(file.text);
  // Nur eine Datei mit Vorzeilen kann gelöschte Zeilen haben; auf einer frischen
  // Datei sind neun Deletes gegen eine wachsende FTS-Tabelle Wegwerfzeit
  // (gemessen ~1,0 s je Kaltlauf, docs/probes/index-cold-breakdown.json).
  if (options.known !== false) forgetFile(db, path);

  db.prepare('insert or replace into files(path, language, bytes, mtime_ms, digest, indexed_at_ms, stamp) values (?, ?, ?, ?, ?, ?, ?)')
    .run(path, language, file.bytes, file.mtimeMs, digest, Date.now(), options.stamp ?? null);

  // Die Fundstelle wird festgehalten, der Wert nicht.
  const insertFinding = db.prepare(`insert or ignore into ${SECRET_TABLE}(path, line, kind) values (?, ?, ?)`);
  for (const finding of safe.findings) insertFinding.run(path, finding.line, finding.kind);

  // Die Extraktion richtet sich nach dem Dateityp (Parser-Registry), nicht nach
  // einer Annahme: eine Markdown-Datei wird anders gelesen als ein Modul.
  const insertSymbol = db.prepare('insert or ignore into symbols(path, name, kind, line) values (?, ?, ?, ?)');
  for (const symbol of extractSymbols(safe.text, language)) insertSymbol.run(path, symbol.name, symbol.kind, symbol.line);

  const edges = extractEdges(safe.text, language);
  const insertEdge = db.prepare('insert or ignore into edges(path, kind, target) values (?, ?, ?)');
  for (const edge of edges) insertEdge.run(path, edge.kind, edge.target);

  const insertChunk = db.prepare('insert or ignore into chunks(path, start_line, end_line, body) values (?, ?, ?, ?)');
  const insertFts = db.prepare(`insert into "${FTS_TABLE}"(path, body) values (?, ?)`);
  for (const chunk of chunkText(safe.text, options.chunkLines)) {
    insertChunk.run(path, chunk.startLine, chunk.endLine, chunk.body);
    insertFts.run(path, chunk.body);
  }

  return { path, absolute, edges, findings: safe.findings.length };
}

/**
 * Interne Kanten aufloesen: aus `./x.js` wird ein Touch auf die Datei, die es
 * im Projekt wirklich gibt. Nur aufloesbare Ziele werden eingetragen — ein
 * unaufloesbares Ziel waere eine Behauptung ueber eine Datei, die es nicht gibt.
 */
export function resolveTouches(root, entry, known) {
  const touches = [];
  for (const edge of entry.edges) {
    if (!edge.target.startsWith('.')) continue;
    const base = dirname(entry.absolute);
    for (const candidate of [`${edge.target}.js`, `${edge.target}.mjs`, edge.target, join(edge.target, 'index.js')]) {
      const target = toProjectPath(root, resolve(base, candidate));
      if (!known.has(target) || target === entry.path) continue;
      touches.push({ path: entry.path, target, kind: edge.kind });
      break;
    }
  }
  return touches;
}

/**
 * Einen Indexlauf fahren — inkrementell nach Plan §11:
 *
 *   stat -> mtime+size gleich?  ja: nicht einmal lesen (unchanged)
 *                             und mit verify=stamp zusaetzlich: Stempel gleich?
 *        -> sonst lesen und sha256 vergleichen (hashed)
 *             gleicher Hash: nur die Dateizeile auffrischen (rehashed)
 *             neuer Hash:    neu parsen und die Primaerdaten ersetzen (written)
 *
 * Damit ist 'kein vollstaendiger Rebuild' ZAEHLBAR statt behauptet: der Bericht
 * nennt, wie viele Dateien gelesen (hashed) und wie viele neu geparst (written)
 * wurden, und wie viele BYTES dabei gelesen wurden (readBytes) — die Kosten
 * stehen im Bericht, nicht nur in einem Messskript. Ein zweiter Lauf ohne
 * Dateiaenderung hat hashed = 0, written = 0 und readBytes = 0.
 *
 * VERIFY (Umgang mit Zeitstempel-Problemen, §11) — drei Politiken, die sich in
 * dem unterscheiden, was sie ueber eine Datei ANNEHMEN:
 *
 *   'stamp'   (Standard) glaubt Groesse und mtime NICHT allein. Stimmen beide,
 *             wird zusaetzlich der Inode-Stempel verglichen (inodeStamp): ctime
 *             und Identitaet schliessen die Luecke, ohne dass eine unveraenderte
 *             Datei gelesen wird. Ein verdaechtiger Stempel kostet EINEN
 *             Lesevorgang; stellt sich der Inhalt als gleich heraus, ist das ein
 *             gezaehlter Fehlalarm (falseAlarms) und der Stempel wird mit
 *             aufgefrischt, damit er sich nicht wiederholt.
 *   'changed' vertraut mtime+size. Benannte Luecke: gleiche Groesse, geaenderter
 *             Inhalt, zurueckgesetzte mtime bleibt unentdeckt.
 *   'all'     liest und hasht jede Datei. Nimmt nichts an — und kostet ein
 *             vollstaendiges Lesen je Lauf.
 *
 * Alle drei sind FAIL-CLOSED in derselben Richtung: was nicht sicher gleich ist,
 * wird gelesen. 'stamp' ist strenger als 'changed' und billiger als 'all'.
 *
 * Der Lauf wirft nicht wegen einer einzelnen Datei; er gibt einen Bericht
 * zurueck. Der Referenzdurchgang laeuft nur, wenn sich die Menge der
 * Referenzziele geaendert hat (sonst nur fuer die neu geschriebenen Dateien), und
 * die Touch-Aufloesung raeumt Ziele weg, die es nicht mehr gibt.
 */
export function updateIndex(db, root, options = {}) {
  const chunkLines = options.chunkLines ?? 40;
  const maxFileBytes = options.maxFileBytes ?? 262144;
  const verify = options.verify ?? 'stamp';
  /** Jeder Ausschluss MIT Pfad und Grund — die Liste, nicht nur ihre Laenge. */
  const scanErrors = [];
  const files = listFiles(root, options.extensions ?? SOURCE_EXTENSIONS, (entry) => {
    scanErrors.push({ path: toProjectPath(root, entry.path), reason: entry.reason, detail: entry.detail });
  });
  const report = {
    root: resolve(root),
    verify,
    files: files.length,
    unchanged: 0,
    /** Ueber den vollen Stempel vertraut, ohne zu lesen (nur verify=stamp). */
    stamped: 0,
    /** Verdaechtig: Groesse UND mtime gleich, der Stempel nicht — die §11-Luecke. */
    suspicious: 0,
    /** Davon mit identischem Inhalt: der Preis des Signals, gezaehlt statt still. */
    falseAlarms: 0,
    /** Gelesene Bytes — die Kosten des Laufs, im Bericht nachpruefbar. */
    readBytes: 0,
    hashed: 0,
    rehashed: 0,
    written: 0,
    skipped: 0,
    /**
     * Die Ausschluesse im Einzelnen: `{ path, reason, detail }`.
     *
     * `skipped` bleibt die Zahl (sie steht im Bericht und in Zusagen), aber eine
     * Zahl ohne Grund ist keine Auskunft. Diese Liste macht aus „1 uebersprungen"
     * den Satz „`src/x.mjs` war nicht lesbar (EACCES)" — und den Ordner, dessen
     * Teilbaum fehlt, sichtbar statt still.
     */
    scanErrors,
    removed: 0,
    /** Dateien, die als Zugangsdatentraeger erkannt und nie gelesen wurden. */
    protected: 0,
    protectedKinds: {},
    /** Davon welche, die eine fruehere Fassung schon indexiert hatte. */
    purged: 0,
    /** Fundstellen ausgeschriebener Werte — die Zahl, nicht der Wert. */
    findings: 0,
    references: 0,
    touches: 0,
    symbolsChanged: false,
  };

  const previous = new Map(db.prepare('select path, bytes, mtime_ms, digest, stamp from files').all().map((row) => [row.path, row]));

  db.exec('begin');
  try {
    const written = [];
    const seen = new Set();
    for (const absolute of files) {
      const path = toProjectPath(root, absolute);
      seen.add(path);
      // Schicht 1 (Plan §13): ein Zugangsdatentraeger wird nicht einmal
      // geoeffnet — kein stat, kein Lesen, kein digest. Hatte eine fruehere
      // Fassung ihn schon indexiert, verschwinden seine Zeilen hier.
      const protection = protectedReason(path);
      if (protection !== null) {
        if (previous.delete(path)) {
          forgetFile(db, path);
          // Ein Zugangsdatentraeger, den eine FRUEHERE Fassung schon geschrieben
          // hatte: die Zeilen gehen jetzt, die Bytes beim Zusammenzug unten.
          report.purged += 1;
        }
        report.protected += 1;
        report.protectedKinds[protection] = (report.protectedKinds[protection] ?? 0) + 1;
        continue;
      }
      let info;
      try {
        info = statSync(absolute);
      } catch (error) {
        // Zwischen Auflisten und Lesen verschwunden: ein Befund mit Namen.
        report.skipped += 1;
        report.scanErrors.push({ path, reason: 'VERSCHWUNDEN', detail: errorCodeOf(error) });
        continue;
      }
      const before = previous.get(path);
      const untouched = before !== undefined && before.bytes === info.size && before.mtime_ms === Math.round(info.mtimeMs);
      // Der Stempel wird nur genommen, wenn er gebraucht wird: `verify: 'changed'`
      // soll fuer eine unveraenderte Datei genau EINEN stat kosten — so wie vor
      // der Stempelspalte. GEMESSEN war das die eine Stelle, an der 'changed'
      // langsamer wurde, ohne etwas davon zu haben.
      let stamp = null;
      let suspicious = false;
      if (untouched && verify === 'changed') {
        report.unchanged += 1;
        continue;
      }
      if (untouched && verify === 'stamp') {
        // Der eigentliche Gewinn: Groesse und mtime stimmen, und der Stempel sagt
        // "dieselbe Datei, unangetastet" — dann wird kein Byte gelesen.
        stamp = inodeStamp(absolute, Math.round(info.mtimeMs));
        if (stamp !== null && before.stamp === stamp) {
          report.unchanged += 1;
          report.stamped += 1;
          continue;
        }
        // Kein brauchbarer Stempel (nicht lesbar) oder ein anderer: dieser Fall
        // ist genau die §11-Luecke, und er wird gelesen, nicht geraten.
        if (stamp !== null) {
          suspicious = true;
          report.suspicious += 1;
        }
      }
      // VOR dem Lesen: aendert sich die Datei waehrend des Lesens, bleibt der
      // gespeicherte Stempel der alte und der naechste Lauf liest erneut —
      // fail-closed statt still veraltet.
      if (stamp === null) stamp = inodeStamp(absolute, Math.round(info.mtimeMs));
      const read = readTextWithReason(absolute, maxFileBytes);
      if (!read.ok) {
        // Eine uebersprungene Datei darf keine alten Zeilen stehen lassen.
        if (before !== undefined) forgetFile(db, path);
        report.skipped += 1;
        report.scanErrors.push({ path, reason: read.reason, detail: read.detail });
        continue;
      }
      const file = read;
      report.hashed += 1;
      report.readBytes += file.bytes;
      const digest = createHash('sha256').update(file.text).digest('hex');
      if (before !== undefined && before.digest === digest) {
        db.prepare('update files set language = ?, bytes = ?, mtime_ms = ?, stamp = ?, indexed_at_ms = ? where path = ?')
          .run(languageOf(path) ?? 'text', file.bytes, file.mtimeMs, stamp, Date.now(), path);
        report.rehashed += 1;
        if (suspicious) report.falseAlarms += 1;
        continue;
      }
      // Der Durchgang weiß, ob die Datei Zeilen hatte: nur dann kann forgetFile
      // etwas finden. Auf der geänderten Datei bleibt das Leeren unangetastet.
      written.push(indexFile(db, root, absolute, file, { chunkLines, stamp, known: before !== undefined }));
      report.written += 1;
    }

    for (const path of previous.keys()) {
      if (seen.has(path)) continue;
      forgetFile(db, path);
      report.removed += 1;
    }

    // Referenzen: die Menge der Referenzziele entscheidet, ob ALLE Dateien neu
    // geprueft werden. Referenzziel ist nur, was ein Bezeichner sein kann —
    // Ueberschriften und Textdateien zaehlen nicht.
    const names = [
      ...new Set(
        db.prepare('select distinct name, kind from symbols').all()
          .filter((row) => REFERENCABLE_KINDS.has(row.kind))
          .map((row) => row.name),
      ),
    ].sort();
    const digest = createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 16);
    report.symbolsChanged = metaValue(db, 'symbols_digest') !== digest;
    // EIN Matcher je Lauf, nicht je Datei (PERF-BASELINE §5: Kompilierung war
    // je Datei 400 ms; Semantik bleibt die der Legacy-Suche).
    const matcher = createReferenceMatcher(names);
    const rescanned = report.symbolsChanged ? db.prepare('select path from files order by path').all().map((row) => row.path) : written.map((entry) => entry.path);
    for (const path of rescanned) {
      db.prepare('delete from "references" where path = ?').run(path);
      const file = readText(resolve(root, path), maxFileBytes);
      if (file === null) continue;
      // Auch der Referenzdurchgang liest nur redigierten Text: eine Referenz
      // traegt Namen und Zeile, nie einen Wert — und der Wert soll auch nicht
      // auf einem Umweg ueber diese Schleife in die Datenbank kommen.
      const insert = db.prepare('insert or ignore into "references"(path, name, line) values (?, ?, ?)');
      for (const reference of matcher.scan(redactSecrets(file.text).text)) {
        report.references += insert.run(path, reference.name, reference.line).changes;
      }
    }

    const insertTouch = db.prepare('insert or ignore into touches(path, target, kind) values (?, ?, ?)');
    for (const entry of written) {
      report.findings += entry.findings;
      for (const touch of resolveTouches(root, entry, seen)) {
        report.touches += insertTouch.run(touch.path, touch.target, touch.kind).changes;
      }
    }
    // Touches auf Dateien, die es nicht mehr gibt, sind keine Touches.
    db.prepare('delete from touches where target not in (select path from files)').run();

    setMeta(db, 'symbols_digest', digest);
    setMeta(db, 'root', resolve(root));
    setMeta(db, 'root_id', fingerprintRoot(root).rootId);
    setMeta(db, 'workspace_contract', WORKSPACE_CONTRACT);
    setMeta(db, 'updated_at_ms', String(Date.now()));
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }

  // Nur wenn Zeilen WEGEN DES SCHUTZES oder durch Verschwinden entfernt wurden:
  // dann traegt die Datei freigegebene Seiten mit altem Inhalt und wird neu
  // zusammengezogen. Ein gewoehnlicher Lauf zahlt das nicht.
  if (report.purged > 0 || report.removed > 0) db.exec('vacuum');

  return report;
}

/**
 * Einen vollstaendigen Lauf in EINEM Aufruf: oeffnen, fortschreiben, schliessen.
 * Der Index wird als Datei uebergeben, nicht als offene Verbindung — damit kann
 * derselbe Lauf im Host oder in einem Worker stehen.
 */
export function runIndex(options) {
  const root = resolve(options.root);
  const indexRoot = resolve(options.indexRoot ?? DEFAULT_INDEX_ROOT);
  // Die Root wird auch hier genannt: ein untergeschobener Index am richtigen
  // Pfad wird verworfen, statt als Index dieses Projekts weiterzuleben.
  const db = openIndex(indexPath(indexRoot, root), { expectedRoot: root });
  try {
    return updateIndex(db, root, { maxFileBytes: options.maxFileBytes, chunkLines: options.chunkLines, verify: options.verify });
  } finally {
    db.close();
  }
}

/**
 * Der Worker-Quelltext.
 *
 * Er wird mit `eval: true` uebergeben, statt als eigene Datei: der Bundle-Vertrag
 * dieses Repos ist genau vier Dateien je Paket. Der Worker laedt dieses Modul
 * ueber seine URL und ruft denselben `runIndex` — es gibt also keinen zweiten
 * Codepfad, der auseinanderdriften koennte, nur einen zweiten Ort fuer denselben.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
import(workerData.module).then(
  (mod) => {
    try {
      parentPort.postMessage({ ok: true, report: mod.runIndex(workerData.options) });
    } catch (error) {
      parentPort.postMessage({ ok: false, error: String(error && error.message ? error.message : error) });
    }
  },
  (error) => parentPort.postMessage({ ok: false, error: String(error && error.message ? error.message : error) }),
);
`;

/**
 * Den Lauf in einen Worker legen (Plan §12: der Index-Build darf den kritischen
 * Agent-Eventloop nicht blockieren). Gibt IMMER ein Ergebnis zurueck, nie eine
 * Ausnahme: ein nicht startbarer oder sterbender Worker ist ein Befund, den der
 * Aufrufer protokolliert und mit dem Lauf im Host beantwortet.
 */
export function runIndexInWorker(options) {
  return new Promise((resolvePromise) => {
    let worker;
    try {
      worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { module: import.meta.url, options } });
    } catch (error) {
      resolvePromise({ ok: false, error: String(error?.message ?? error) });
      return;
    }
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    };
    worker.on('message', (message) => {
      settle(message?.ok === true ? { ok: true, report: message.report } : { ok: false, error: message?.error ?? 'unbekannter Workerfehler' });
      worker.terminate();
    });
    worker.on('error', (error) => settle({ ok: false, error: String(error?.message ?? error) }));
    worker.on('exit', (code) => settle({ ok: false, error: `Worker endete ohne Bericht (Code ${code})` }));
  });
}