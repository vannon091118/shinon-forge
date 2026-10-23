#!/usr/bin/env node
/**
 * Abnahmetest des persistenten Projektindex (@shinon/project-index) — Phase 3
 * (Plan §9 Primärdaten, §10 Indexdateien, §11 inkrementelles Indexing, §12
 * SQLite und Worker).
 *
 * Vier Ebenen, bewusst getrennt:
 *   1. Die reine Extraktion (Zeilenheuristik) gegen Fixtures UND gegen echte
 *      Dateien dieses Repos — die Grenze wird gemessen, nicht behauptet.
 *   2. Das Schema: die Primärdaten aus Plan §9, namentlich und zählbar, plus die
 *      gemessene Tatsache, dass `references` ein SQLite-Schlüsselwort ist.
 *   3. Ein echter Lauf gegen ein Fixture-Projekt: Vollauf, unveränderter zweiter
 *      Lauf, geänderter Inhalt, gelöschte Datei, zu große Datei, FTS5.
 *   4. Der Host-Pfad: der Lauf im Worker und im Host liefern denselben Index,
 *      der Mount startet den Lauf und blockiert den Start nicht, und ein
 *      scheiternder Worker wird protokolliert statt geworfen.
 *
 * Warum ein Fixture-Projekt und nicht nur dieses Repo: nur so sind „unverändert",
 * „gelöscht" und „zu groß" deterministisch herstellbar. Gegen die echten Dateien
 * dieses Repos läuft zusätzlich die Extraktion, damit die Zusage an echtem Text
 * hängt und nicht an erfundenen Beispielen.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz,
 * kein Modell, kein node_modules im Repo (`dsh` muss im PATH liegen — wie beim
 * Profiltest, weil das echte Schemastery aus der DSH-Installation kommt).
 */
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

/**
 * Als root (uid 0) ignoriert der Kernel Dateirechte: `chmod 000` sperrt nichts,
 * und die beiden Rechte-Tests wuerden ohne eigenen Befund rot. Sie werden dann
 * SICHTBAR uebersprungen — ein Skip mit Grund, kein stilles Gruen.
 */
export const AS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
export const ROOT_SKIP = AS_ROOT ? 'als root (uid 0) greifen Dateirechte nicht' : false;

export const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/project-index/', import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const INDEX_FILE = join(PACKAGE_DIR, 'index.js');
// Der Kern besteht seit T2-5 aus fuenf Eigentuemer-Dateien; `index-core.js` ist
// nur noch das Barrel, das dieselben Namen namentlich re-exportiert. Die
// statischen Pruefungen unten meinen den KERN, nicht eine bestimmte Datei —
// deshalb lesen sie alle Teile zusammen, in Dateinamen-Reihenfolge.
export const CORE_FILES = readdirSync(join(PACKAGE_DIR, 'assets'))
  .filter((name) => name === 'index-core.js' || /^index-[a-z]+\.js$/.test(name))
  .sort()
  .map((name) => join(PACKAGE_DIR, 'assets', name));
/** Der ganze Kern als EIN Text — fuer die Zeichenpruefungen, nicht fuer den Lauf. */
export const readCore = () => CORE_FILES.map((file) => readFileSync(file, 'utf8')).join('\n');

export const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
export const require = createRequire(join(root, 'package.json'));

/** Das Bundle isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation. */
export async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-index-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  provideSeamCore(join(work, 'pkg'));
  const shim = join(work, 'pkg/node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  return { bundle: await import(pathToFileURL(join(work, 'pkg/index.js')).href), work };
}

export const { bundle, work: bundleWork } = await loadBundle();
export const { DatabaseSync } = await import('node:sqlite');

/**
 * Ausgaben einsammeln statt sie zu zeigen. Anders als ein synchrones
 * `capture(fn)` deckt der Sammler auch das ab, was NACH dem Mount passiert —
 * der Indexlauf ist asynchron, sein Bericht kommt also später.
 */
export function collector() {
  const lines = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...args) => lines.push(args.join(' '));
  return {
    lines,
    restore: () => Object.assign(console, saved),
    /** Auf eine Zeile warten, ohne den Test an eine feste Uhrzeit zu binden. */
    waitFor: async (needle, timeoutMs = 20000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline && !lines.some((line) => line.includes(needle))) await new Promise((resolve) => setTimeout(resolve, 50));
      return lines.some((line) => line.includes(needle));
    },
  };
}

export const works = [bundleWork];
/** Ein frisches Arbeitsverzeichnis, das am Ende der Datei aufgeräumt wird. */
export function workDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `shinon-index-${label}-`));
  works.push(dir);
  return dir;
}

afterAllCleanup();
export function afterAllCleanup() {
  process.on('exit', () => {
    for (const dir of works) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* Aufräumen ist Beiwerk */
      }
    }
  });
}

/**
 * Ein Fixture-Projekt mit genau den Formen, die der Index zusagt, und mit den
 * Formen, die er ignorieren muss: Fremdverzeichnis, unbekannte Endung.
 */
export function fixtureProject(label) {
  const dir = join(workDir(label), 'projekt');
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  mkdirSync(join(dir, 'node_modules/fremd'), { recursive: true });
  // S1: Skills liegen unter `.agents/` und sind eine EIGENE Quelle (eigene
  // Auswahl, eigenes Budget). Als gewoehnlicher Quelltext indexiert, stuende
  // derselbe Skill zweimal im Kontext — einmal als Datei, einmal als Block.
  mkdirSync(join(dir, '.agents/skills/s'), { recursive: true });
  writeFileSync(join(dir, '.agents/skills/s/SKILL.md'), '# skill\n');
  writeFileSync(
    join(dir, 'src/a.mjs'),
    [
      "import { bThing } from './b.mjs';",
      '',
      '/**',
      ' * apply(ctx) — dieser Aufruf steht in einem Kommentar und ist kein Symbol.',
      ' */',
      '// Siehe Notizen — Prosa aus einer Ueberschrift, kein Referenzziel.',
      'export const alpha = 1;',
      'function aRun() {',
      '  if (alpha > 0) {',
      '    for (const item of [1]) {',
      '      bThing(item);',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(join(dir, 'src/b.mjs'), ['export function bThing(value) {', '  return value;', '}', '', 'const beta = 2;', ''].join('\n'));
  writeFileSync(join(dir, 'docs/notes.md'), '# Notizen\n\nDie Schleife nutzt alpha und bThing.\n\n```js\n# Das ist ein Beispiel in einem Code-Fence und keine Struktur.\n```\n');
  writeFileSync(join(dir, 'config.yml'), 'name: fixture\n');
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'fixture', dependencies: { '@deepseek-ai/schemastery': '~3.18.4', yaml: '^2.0.0' }, devDependencies: { yaml: '^2.0.0' } }, null, 2)}\n`,
  );
  writeFileSync(join(dir, 'ignored.txt'), 'diese Endung wird nicht indexiert\n');
  writeFileSync(join(dir, 'node_modules/fremd/index.js'), 'export const fremd = 1;\n');
  return dir;
}

/**
 * Ein Projekt, das lange genug laeuft, um den Eventloop zu beobachten: viele
 * Dateien mit vielen Symbolen. Gemessen (150 Dateien, 30 Zeilen): der Lauf im
 * Host dauert rund 1,6 s und bedient dabei KEINEN Timer, derselbe Lauf im
 * Worker rund 1,9 s und laesst 187 Timer feuern.
 */
export function bigProject(label, files = 150, lines = 30) {
  const dir = join(workDir(label), 'projekt');
  mkdirSync(join(dir, 'src'), { recursive: true });
  for (let index = 0; index < files; index += 1) {
    const body = Array.from({ length: lines }, (_, line) => `export const wert${index}_${line} = ${line};`).join('\n');
    writeFileSync(join(dir, 'src', `datei${index}.mjs`), `${body}\n`);
  }
  writeFileSync(join(dir, 'package.json'), '{"name":"gross"}\n');
  return dir;
}

/** Der Index eines Fixture-Projekts, ausserhalb des Projekts. */
export function fixtureIndex(project, label) {
  const indexRoot = join(workDir(label), 'indexes');
  return { indexRoot, file: bundle.indexPath(indexRoot, project) };
}

/** Zeilen als schlichte Objekte: node:sqlite liefert Objekte ohne Prototyp. */
export const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((row) => ({ ...row }));
export const one = (db, sql, ...args) => ({ ...db.prepare(sql).get(...args) });

// ── Zusage: die Extraktion erkennt genau die benannten Formen ────────────────


/**
 * Regressionstest — der Grund, warum es diese Liste gibt.
 *
 * Gemessen auf diesem Repo, vor der Liste: `for` war mit 126 Treffern der
 * HAÜFIGSTE „Symbolname" des Projekts, `if` folgte mit 71. Jede Schleife wäre
 * damit eine Referenz auf ein Symbol gewesen.
 */



// ── Zusage: der Index liegt außerhalb des Projekts ──────────────────────────


// ── Zusage: das Schema trägt genau die Primärdaten aus Plan §9 ───────────────


/**
 * Regressionstest — im Live-Boot gefunden, nicht im Kopf ausgedacht.
 *
 * Der Lauf ist inkrementell: eine unveränderte Datei wird nie neu geparst. Wird
 * die EXTRAKTION geändert, bleiben ihre Zeilen deshalb auf dem alten Stand; der
 * Live-Boot zeigte danach 643 statt der gemessenen rund 1030 Symbole. Also trägt
 * der Index die Fassung seiner Extraktion, und eine andere Fassung verwirft ihn.
 */

/**
 * Regressionstest — gemessene Runtime-Tatsache.
 *
 * `create table references(...)` ist in SQLite 3.51.3 ein Syntaxfehler, weil
 * REFERENCES ein Schlüsselwort ist. Die Tabelle trägt deshalb exakt den Namen aus
 * Plan §9, aber überall gequotet. Fällt das Quoting weg, bricht jeder Lauf.
 */

/**
 * Ein Index mit fremdem Vertrag ist keine Grundlage: er wird verworfen, statt
 * stillschweigend weiterbenutzt zu werden.
 */

/**
 * S1 — der Index gehoert EINEM Workspace.
 *
 * Der Pfad allein bindet nicht (ein kopierter Index liegt am richtigen Pfad).
 * Geprueft wird deshalb die IDENTITAET: ein Index unter fremder Root wird
 * verworfen und leer neu angelegt — mit irgendeiner anderen Antwort wuerde ein
 * Prompt den Kontext eines anderen Projekts lesen. Die Ablage (Nutzerurteile)
 * ist kein abgeleiteter Index und ueberlebt den Neuaufbau.
 */

/**
 * S1 — auch die EINMALIGE Migration (Index-Ablage in den Ledger) darf keinen
 * fremden Workspace importieren. Der Ledger ist fuer alle Projekte derselbe;
 * ein untergeschobener Index waere sonst ein Weg, fremde Urteile einzuschleusen.
 * Schreiben in den Ledger bleibt erlaubt: er ist die eigene Ablage.
 */


/**
 * S1 — ein Link aus dem Workspace heraus ist kein Quelltext.
 *
 * Der Lauf nimmt nur echte Dateien (`Dirent.isFile()`); ein Symlink wird damit
 * gar nicht erst geoeffnet. Geprueft wird der INHALT, nicht nur der Pfad: ohne
 * diese Probe waere „nichts indexiert" auch bei einem kaputten Lauf gruen.
 */

// ── Zusage: der Lauf indiziert und bleibt inkrementell (Plan §11) ────────────





// ── Zusage: die Parser-Strategie folgt dem Dateityp ────────────────────────

/**
 * Die Registry benennt, WELCHER Parser traegt — die Zuordnung ist gemessen
 * (docs/probes/project-index-parserstrategie.json), nicht behauptet: fuer
 * JavaScript existiert in dieser Runtime keiner, fuer JSON gibt es den
 * eingebauten, fuer YAML keinen, der aus diesem Paket erreichbar waere.
 */




// ── Zusage: das Gate der Phase 7 ───────────────────────────────────────────

/**
 * GATE AUS PHASE 7 (wörtlich): „Zweimaliger Indexlauf ohne Dateiänderung erzeugt
 * keinen vollständigen Rebuild."
 *
 * Geführt wird das nicht über Zusicherungen an einer Stelle, sondern über einen
 * vollständigen Schnappschuss ALLER Tabellen vor und nach dem zweiten Lauf: wäre
 * irgendetwas neu geschrieben worden, müsste sich mindestens eine Zeile ändern.
 * Dazu die Zählung aus dem Bericht: der zweite Lauf liest KEINE Datei (hashed 0)
 * und parst nichts (written 0).
 */

/**
 * §11 verlangt, den Umgang mit Zeitstempel-Problemen über Tests abzusichern. Die
 * Lücke wird hier als Tatsache gepinnt, und zwar für die Politik, zu der sie
 * gehoert: `verify: 'changed'` liest eine Datei mit gleicher Grösse und
 * zurueckgesetzter mtime nicht — sie bleibt unentdeckt. `verify: 'all'` schliesst
 * sie, und `verify: 'stamp'` schliesst sie OHNE den Baum zu lesen (naechster Test).
 */

/**
 * §11 nennt eine Luecke: gleiche Groesse, anderer Inhalt, zurueckgesetzte mtime.
 * `verify: 'stamp'` schliesst sie OHNE den Baum zu lesen. Verglichen wird der
 * Stempel des Inodes — Geraet, Inode, Groesse, mtime und die ctime. Eine
 * Inhaltsaenderung bewegt die ctime auch dann, wenn mtime und Groesse danach
 * wiederhergestellt werden; ein Ersatz der Datei bewegt den Inode.
 *
 * Die Kostenaussage steckt im Bericht selbst (`readBytes`), nicht nur in einem
 * Messskript: der stillste Lauf liest null Bytes, und der Lauf, der die Luecke
 * schliesst, liest genau die eine verdaechtige Datei.
 */

/**
 * Ein Metadaten-Signal kann auch ohne Inhaltsaenderung ausschlagen: chmod bewegt
 * die ctime, der Inhalt bleibt. Der Preis ist ein Lesevorgang, und er wird
 * GEZAEHLT statt verschwiegen — ein Signal ohne Fehlalarmzahlen waere eine
 * Behauptung. Entscheidend ist zweitens, dass der Fehlalarm sich nicht wiederholt:
 * die Auffrischung schreibt den neuen Stempel mit.
 */

/**
 * Die zweite Form derselben Luecke: die Datei wird ERSETZT (Kopie, Checkout,
 * Restore) und traegt danach dieselbe Groesse und dieselbe mtime. mtime und
 * Groesse sind hier nutzlos; die Identitaet des Inodes verraet es.
 */

/**
 * Der Stempel ist eine Zeile, die man lesen kann: Geraet, Inode, Groesse, mtime
 * (Millisekunden — dieselbe Groesse wie `mtime_ms`) und ctime (Nanosekunden).
 * Und er ist eine NEUE Spalte: ein Index der alten Fassung wird verworfen und neu
 * gebaut, statt Stempelluecken zu erben.
 */

/**
 * Die zwei Signale aus §11, die die uebrigen Faelle nicht treffen: eine GROESSE
 * ohne mtime-Aenderung und eine mtime, die RUECKWAERTS laeuft. Beide sind echte
 * Zeitstempel-Probleme — Kopie, Checkout, Restore — und beide gehen kaputt, wenn
 * nur eine der beiden Angaben verglichen wird oder wenn man eine ORDNUNG
 * annimmt statt Gleichheit. Der Vergleich muss „gleich" sein, nicht „neuer".
 */

// ── Zusage: das Projekt bleibt unberührt ────────────────────────────────────


// ── Zusage: das Öffnen zahlt EINEN Commit, nicht sieben (F1-Baseline) ────────


// ── Zusage: eine neue Datei wird nicht vorher geleert; eine bekannte schon ───



// ── Zusage: der Lauf steht im Worker, der Mount blockiert nicht (Plan §12) ───



/**
 * Ein scheiternder Worker ist ein Befund, kein Absturz: der Mount bleibt heil,
 * die Ursache steht im Protokoll, und derselbe Lauf wird im Host versucht.
 */

// ══ Indexdateien (Plan §10) ══════════════════════════════════════════════════
//
// Plan §10 nennt fuenf Angaben je Datei — path, language, size, mtime, sha256 —
// und sagt: „SHA wird nicht fuer jeden unveraenderten Start erneut unnoetig
// berechnet."
//
// Dieses Schema nennt Groesse und Hash `bytes` und `digest`: §10 nennt die
// ANGABEN, kein SQL. Die Tests pinnen deshalb die Bedeutung und nicht die
// Schreibweise — Groesse und mtime gegen das Dateisystem, der Digest als sha256
// des ROHEN Inhalts. Dass der Digest nicht dem redigierten Text folgt, ist kein
// Detail: er entscheidet, ob sich eine Datei geaendert hat.



// ══ SQLite und Worker (Plan §12) ══════════════════════════════════════════════
//
// §12 hat zwei Zusagen, die man messen kann statt sie zu glauben: der Lauf im
// Worker darf den kritischen Agent-Eventloop NICHT blockieren — und die
// Verfuegbarkeit und Version von node:sqlite muss gegen die laufende Runtime
// geprueft sein, nicht gegen eine Annahme im Kopf.

/**
 * Der Eventloop wird beobachtet, nicht beschrieben: ein 10-ms-Timer zaehlt
 * waehrend des Laufs, und die groesste Luecke zwischen zwei Ticks verraet eine
 * Blockade auch dann, wenn es davor und danach genug Ticks gibt.
 */
export async function observeLoop(start) {
  let ticks = 0;
  let worst = 0;
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    ticks += 1;
    worst = Math.max(worst, now - last);
    last = now;
  }, 10);
  const began = Date.now();
  try {
    return { ...(await start()), ms: Date.now() - began, ticks, worst };
  } finally {
    clearInterval(timer);
  }
}



// ══ Secret Protection (Plan §13) ═════════════════════════════════════════════
//
// Das Gate der Phase lautet wörtlich: Test-Secrets erscheinen nicht als
// ungeschützter Secret-Inhalt im Index. Deshalb prüfen die Zusagen unten nicht
// eine Zählung, sondern die BYTES der Indexdateien: kein Kanarienvogel darf
// darin vorkommen — in keiner Tabelle, auch nicht in der FTS-Spiegelung und
// nicht im WAL.

/**
 * Kanarienvögel: erfunden, aber in der FORM echter Zugangsdaten. Sie stehen in
 * Quellen, die absichtlich so gebaut sind, dass sie wie Zugangsdaten aussehen —
 * niemand kann sie mit einem echten Schlüssel verwechseln.
 */
export const CANARY = {
  dotenv: 'CANARY_DOTENV_WERT_04f2a1',
  credentials: 'CANARY_CREDENTIALS_WERT_77b31c',
  anthropic: 'sk-ant-canary0123456789abcdef0123456789',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.canarysignatur0123456789',
  connection: 'postgres://canary-nutzer:canary-passwort@localhost:5432/canary-db',
  assigned: 'canary-zugewiesener-wert-0123456789',
  github: 'ghp_canary0123456789012345678901',
};
