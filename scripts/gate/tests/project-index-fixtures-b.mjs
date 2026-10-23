import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { codeOnly, findForbidden, findMissing } from '../../lib/source-scan.mjs';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { AS_ROOT, ROOT_SKIP, PACKAGE_DIR, REPO_ROOT, INDEX_FILE, CORE_FILES, readCore, root, require, loadBundle, bundle, bundleWork, DatabaseSync, collector, works, workDir, afterAllCleanup, fixtureProject, bigProject, fixtureIndex, rows, one, observeLoop, CANARY } from './project-index-fixtures.mjs';


/** Der Inhalt der einen Quelldatei, die einen Wert AUSGESCHRIEBEN enthält. */
export const CONFIG_LINES = [
  'export const sauber = 0;',
  `export const endpoint = '${CANARY.connection}';`,
  `export const schluessel = '${CANARY.anthropic}';`,
  `export const marke = '${CANARY.jwt}';`,
  `SHINON_CANARY_API_KEY = '${CANARY.assigned}';`,
  `export const zweiter = '${CANARY.github}';`,
  '',
];

/**
 * Ein Projekt mit beiden Sorten: Dateien, die Zugangsdaten SIND, und Dateien,
 * die Zugangsdaten nur ENTHALTEN — plus die Gegenproben, die indexiert bleiben
 * müssen.
 */
export function secretProject(label) {
  const dir = join(workDir(label), 'projekt');
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'keys'), { recursive: true });
  mkdirSync(join(dir, 'tief/verschachtelt'), { recursive: true });
  mkdirSync(join(dir, '.ssh'), { recursive: true });

  // Schicht 1 — diese Dateien werden nie gelesen.
  mkdirSync(join(dir, 'settings'), { recursive: true });
  writeFileSync(join(dir, '.env'), `SHINON_CANARY_API_KEY=${CANARY.dotenv}\n`);
  writeFileSync(join(dir, 'tief/verschachtelt/.env.production'), `SHINON_CANARY_API_KEY=${CANARY.dotenv}\n`);
  writeFileSync(join(dir, 'settings/.env.yaml'), `SHINON_CANARY_API_KEY: ${CANARY.dotenv}\n`);
  writeFileSync(join(dir, '.credentials.yaml'), `refs:\n  SHINON_CANARY_API_KEY: ${CANARY.credentials}\n`);
  writeFileSync(join(dir, 'credentials.json'), `{\n  "token": "${CANARY.credentials}"\n}\n`);
  writeFileSync(join(dir, 'secrets.yml'), `token: ${CANARY.credentials}\n`);
  writeFileSync(join(dir, 'keys/server.pem'), `-----BEGIN RSA PRIVATE KEY-----\n${CANARY.dotenv}\n-----END RSA PRIVATE KEY-----\n`);
  writeFileSync(join(dir, '.ssh/id_rsa'), `${CANARY.dotenv}\n`);

  // Schicht 2 — indexiert, aber der Wert wird ersetzt.
  writeFileSync(join(dir, 'src/config.mjs'), CONFIG_LINES.join('\n'));

  // Gegenproben: kein Geheimnis, und ein NAME, der nur danach klingt.
  writeFileSync(join(dir, 'src/clean.mjs'), 'export const sauber = 1;\n// hier steht kein Geheimnis\n');
  writeFileSync(join(dir, 'src/secrets.mjs'), 'export const liste = ["a"];\n');
  return dir;
}

/**
 * Die naive Messung zeigte drei Filter, nicht einen — und nur einer davon ist
 * Phase 8. Damit der Test nicht zwei Dinge verwechselt, sind sie getrennt:
 *
 *   ENDUNGS_LISTE      Dateien wie `.env` oder `*.pem` werden nie BETRACHTET,
 *                      weil `listFiles` nur Textendungen aufnimmt. Sie sind
 *                      deshalb auch ohne Schutz nie im Index — der Grund, warum
 *                      die Musterliste aus Plan §13 zu einem Teil redundant ist.
 *   SCHUTZ_REGELN      Dateien MIT indexierbarer Endung, die Zugangsdaten sind.
 *                      Genau hier lag der echte Fund: `.credentials.yaml`.
 */
export const EXCLUDED_BY_EXTENSION = ['.env', 'tief/verschachtelt/.env.production', 'keys/server.pem', '.ssh/id_rsa'];
export const PROTECTED_LISTED = ['.credentials.yaml', 'credentials.json', 'secrets.yml', 'settings/.env.yaml', 'src/secrets.mjs'];
export const PROTECTED_TOTAL = PROTECTED_LISTED.length;

/** Die Dateien, die einen Kanarienvogel tragen — für die Gegenprobe des Tests. */
export const CANARY_FILES = [...EXCLUDED_BY_EXTENSION, '.credentials.yaml', 'credentials.json', 'secrets.yml', 'settings/.env.yaml'];

/** Alle Bytes im Indexverzeichnis — die Grundlage des Gates. */
export function indexBytes(indexRoot) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else out.push([relative(indexRoot, absolute), readFileSync(absolute)]);
    }
  };
  walk(indexRoot);
  return out;
}

/** Wo ein Kanarienvogel im Index steht — leer heißt: nirgends. */
export function canaryHits(indexRoot, ...needles) {
  const bytes = indexBytes(indexRoot);
  const hits = [];
  for (const needle of needles) {
    for (const [name, buffer] of bytes) if (buffer.includes(needle)) hits.push(`${needle.slice(0, 12)}… in ${name}`);
  }
  return hits;
}

/**
 * Die Pfadregeln treffen ganze NAMEN, nicht Präfixe.
 *
 * Der Grund steht in docs/probes/secret-protection.json: `.credentials.yaml`
 * liegt in der Wurzel dieses Repos und trägt drei echte Schlüssel — `credentials*`
 * trifft sie nicht, weil dem Namen ein Punkt vorangeht. Die Tabelle prüft beide
 * Richtungen, damit die Regeln weder blind noch übermäßig breit sind.
 */

/**
 * Das Gate der Phase — in beiden Schichten, geprüft an den BYTES des Index.
 */

/**
 * Das Muster, das vor dem Bau blind war.
 *
 * Gemessen (docs/probes/secret-protection.json): eine Fassung mit Lookbehind auf
 * Bezeichnerzeichen lieferte 0 Treffer, weil in `SHINON_API_KEY` vor `API_KEY`
 * ein Unterstrich steht — blind genau für die häufigste Schreibweise. Die Tabelle
 * hält die Formen fest, die tragen, und die Gegenfälle, die nicht tragen dürfen.
 */

/**
 * Remediation — der Fall, der wirklich vorlag.
 *
 * Der Live-Index dieses Repos enthielt `.credentials.yaml` samt drei echten
 * Schlüsseln, geschrieben von der Fassung VOR Phase 8. Weil die Datei unverändert
 * ist, hätte der inkrementelle Lauf sie nie wieder angefasst; ein Schutz ohne
 * Bereinigungspfad hätte die Werte für immer stehen gelassen. Der Test stellt
 * genau diesen Zustand her und verlangt, dass der nächste Lauf ihn räumt.
 */

/**
 * Genau der Weg, der den ECHTEN Index dieses Repos bereinigt hat.
 *
 * Der Live-Index war von der Fassung vor Phase 8 geschrieben und stand auf einer
 * anderen indexer_version; `openIndex` verwirft und baut neu auf. Ein Neubau der
 * Tabellen lässt die BYTES der alten Zeilen aber in der Datei stehen — gemessen:
 * ohne `secure_delete` und ohne einen Zusammenzug der Datei steht der Wert weiter
 * darin, auch wenn `select` ihn nicht mehr findet. Der Test hält das fest.
 */

/**
 * Der Schutz ist keine Option, sondern eine Eigenschaft des Index — und er steht
 * im Protokoll, weil eine ausgeschlossene Datei keine Zählung verändert.
 */

// ── Zusage: der Scan ist deterministisch und benennt seine Ausschlüsse ───────

/**
 * Die Reihenfolge ist eine Funktion der DateiMENGE, nicht des Durchlaufs.
 *
 * Geprüft wird nicht „es ist sortiert" (das wäre eine Momentaufnahme), sondern
 * die Eigenschaft, die zählt: zweimal auflisten ergibt dieselbe Folge, und sie
 * ist gleich der Sortierung der Menge — also unabhängig davon, in welcher
 * Reihenfolge die Dateien ANGELEGT wurden und wie der Baum durchlaufen wird.
 * Die Anlage ist deshalb absichtlich durchmischt (tiefe Pfade zuerst).
 */

/**
 * Ein unlesbarer Ordner ist ein BEFUND, kein Nichts.
 *
 * Vor dieser Änderung kehrte der Durchlauf dort wortlos um: der ganze Teilbaum
 * fehlte im Index, und der Bericht sah danach genauso aus wie ein Projekt ohne
 * diesen Ordner. Der Test stellt das mit `chmod 000` her (läuft als Nicht-root —
 * als root greifen Dateirechte nicht, dann wäre die Probe leer) und verlangt
 * Pfad UND Grund.
 */

/**
 * Eine unlesbare DATEI trägt denselben Befund an der Stelle, an der bisher nur
 * eine Zahl stand: `skipped` bleibt (die Zusage, die andere Tests lesen), aber
 * daneben steht, welche Datei und warum. Der Unterschied ist der ganze Punkt —
 * „1 übersprungen" konnte eine bewusste Obergrenze sein oder ein Rechtefehler.
 */

/**
 * Die Haltbarkeitspolitik steht fest, statt geerbt zu werden.
 *
 * „Kontrollierte Persistenz" heißt hier: der Index benennt seine Politiken selbst
 * und ein Leser kann sie nachsehen. WAL trägt den laufenden Betrieb, `secure_delete`
 * entfernt den Inhalt gelöschter Zellen aus den freigegebenen Seiten (ohne ihn stand
 * ein gelöschter Wert weiterhin in der Datei — gemessen, siehe oben), und
 * `synchronous = full` (Wert 2) macht einen Commit dauerhaft, bevor er als fertig gilt.
 */

/**
 * „Sichtbar" heißt: die Zeile, die der Host schreibt, nennt Grund UND Pfad.
 *
 * Der Bericht ist die einzige Stelle, an der ein Ausschluss überhaupt bemerkt
 * werden kann — er läuft nach dem Mount und im Worker, also sieht ihn niemand
 * außer im Protokoll. Deshalb wird hier nicht die Berichtsstruktur geprüft,
 * sondern die gerenderte Zeile: Grund, Pfad, und (weil eine Obergrenze eine
 * Entscheidung ist und kein Fehler) weiterhin die Zahl des Ausschlusses.
 */

// ── Zusage: der Referenz-Matcher ist einmal je Lauf wortgleich mit findReferences ──
//
// F-Messung (PERF-BASELINE §5): findReferences baute je DATEI einen
// Alternations-Regex ueber bis zu 1757 Namen (Kompilierung 403 ms, Scan 4,9 s).
// Der Matcher wird je UPDATE-Lauf EINMAL gebaut und muss dieselben
// {name, line}-Eintraege liefern wie die Legacy-Funktion — in derselben
// Reihenfolge, mit derselben Vorbehandlung (Slice auf MAX_REFERENCE_NAMES,
// RESERVED_WORDS raus) — die Tabelle "references" darf sich um nichts aendern.




