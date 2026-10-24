#!/usr/bin/env node
/**
 * Abnahmetest des Prompt Enhancers (@shinon/prompter) — Phase 2 und 3.
 *
 * Gates:
 *   Phase 2  „Paket wird korrekt geladen und kann einen validierten
 *            Prompt-Resultatvertrag liefern."
 *   Phase 3  „MIN/MID ändern keine Anforderungen; MAX akzeptiert einen
 *            definierten Context-Input."
 *
 * Vier Ebenen, bewusst getrennt:
 *   1. Der Vertrag (Plan §7) als reine Funktionen: Parsen, Schema, Annahme-Policy.
 *   2. Der Modus-Vertrag als Daten: Fähigkeiten, erzeugte Prompts, Verbote.
 *   3. Der echte Durchlauf: das Bundle hängt über seine apply()-Schnittstelle an
 *      einem ECHTEN Cordis-Context, gefahren wird der echte Waterfall
 *      `agent/pre-step` mit dem Default-Downstream des Agent-Loops.
 *   4. Die Isolation: der Aufruf trägt keine Fähigkeit.
 *
 * Der Modell-Provider ist zwangsläufig eine Attrappe (extern, braucht
 * Zugangsdaten); alles andere — Dispatcher, Waterfall, next()-Kette,
 * Message-Identität, Schema, Kontextdatei — ist echt. Die Attrappe zählt die
 * Aufrufe und reicht die Optionen zur Prüfung heraus, damit die Isolation und
 * der Kontextblock an einem echten Aufruf belegt sind.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein
 * node_modules im Repo, kein Netz, kein Modell.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { codeOnly, findForbidden } from '../../lib/source-scan.mjs';
// Bevölkerung des Eigenschaftstests: dieselben Funktionen, die der Index beim
// Sammeln benutzt (listFiles + protectedReason) — kein eigener Walker, der
// still von der Indexregel abweichen könnte.
import { listFiles, protectedReason, toProjectPath } from '../../../packages/project-index/assets/index-core.js';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { quiet } from './helpers/console.mjs';

export const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/prompter/', import.meta.url));
export const INDEX_FILE = join(PACKAGE_DIR, 'index.js');

export const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
export const require = createRequire(join(root, 'package.json'));

/** Verzeichnis der geladenen Paketkopie — fuer Pfade, die am Paket aufgeloest werden. */
export let bundleDir = '';

/** Das Bundle isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation. */
export async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-prompter-test-'));
  bundleDir = join(work, 'pkg');
  cpSync(PACKAGE_DIR, bundleDir, { recursive: true });
  provideSeamCore(join(work, 'pkg'));
  const shim = join(work, 'pkg/node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

export const bundle = await loadBundle();
export const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
/** Ein Ergebnis, das den Vertrag erfuellt; einzelne Felder werden je Fall ersetzt. */
export const goodResult = (over = {}) => ({
  enhancedPrompt: 'Mach das schnell.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  uncertainties: [],
  references: [],
  ...over,
});

export const reply = (obj) => JSON.stringify(obj);

/** Nutzer-Nachricht in der Form, die der Loop fuehrt (TextBlock + id + source). */
export const userMessage = (text = 'mach  das  schnell') => ({
  id: 'm-1',
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
});

export const stepPayload = (messages) => ({ agent: { session: { id: 'sess-1' } }, messages, turn: 1, step: 1, signal: new AbortController().signal });

/**
 * Bundle an einen echten Cordis-Context haengen. Der Dispatcher ist echt; nur
 * `llm` ist eine Attrappe, weil der Provider extern ist.
 */
export function connect(config = {}, { llm, services } = {}) {
  const ctx = new Context();
  const records = [];
  ctx.on(bundle.DECISION_CHANNEL, (record) => records.push(record));
  const host = {
    on: (...args) => ctx.on(...args),
    emit: (...args) => ctx.emit(...args),
    // Optionale Faehigkeiten (Scoring-Ton, Zettel): der Host sieht sie ueber
    // `get` — genau wie der echte Profil-Host. Fehlt `services`, gibt es keine.
    ...(services === undefined ? {} : { get: (name) => services[name] }),
    ...(llm === undefined ? {} : { llm }),
  };
  // `notesPath: ''` und `skillsPath: ''` als Harness-Vorgabe: diese Datei prueft
  // Modus-Vertrag, Annahme-Regeln und Isolation, und deren Aufrufe tragen ihren
  // Block genau. Wer die Zettel pruefen will, gibt einen eigenen Pfad mit
  // (Abschnitt 7). Wer Skills prueft, gibt `skillsPath` mit (Zug 6).
  // Kein Probe-Journal im Test: sonst schriebe jeder Verwerfungsfall in den
  // Baum. Wer das Journal prueft, gibt einen absoluten Pfad mit.
  const resolved = bundle.Config({ notesPath: '', skillsPath: '', probeJournalPath: '', ...config });
  const dispose = quiet(() => bundle.apply(host, resolved));
  return { ctx, records, config: resolved, dispose };
}

/**
 * Eine LLM-Attrappe. `behaviour` ist der Antworttext, ein Error (wird geworfen)
 * oder eine Funktion, die den Text liefert bzw. wirft.
 */
export function fakeLlm(behaviour) {
  const calls = [];
  return {
    calls,
    stream(options) {
      calls.push(options);
      const text = typeof behaviour === 'function' ? behaviour(options) : behaviour;
      if (text instanceof Error) throw text;
      return (async function* streamChunks() {
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text };
      })();
    },
  };
}

export const route = { provider: 'test-route', model: 'test-model' };
export const loopDefault = (claimed) => () => Promise.resolve({ kind: 'enter', messages: claimed });

/** Ein Dummy-Kontext in der Form von ContextSchema — in Phase 3 der Ersatz für den Index. */
export const dummyContext = {
  project: 'shinon-forge',
  files: [
    { path: 'packages/prompter/index.js', content: 'export function apply(ctx, config) { return () => {}; }' },
    { path: 'packages/hook/index.js', content: 'const dispose = ctx.on(PRE_STEP_EVENT, handler);' },
  ],
  symbols: ['apply', 'buildEnhancerRequest'],
  constraints: ['keine neuen Anforderungen'],
  touches: ['packages/prompter/index.js'],
  dependencies: ['@deepseek-ai/schemastery'],
};

export const contextDir = mkdtempSync(join(tmpdir(), 'shinon-prompter-ctx-'));
export function contextFile(name, value) {
  const file = join(contextDir, name);
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}
export const dummyContextPath = contextFile('dummy-context.json', dummyContext);

// ── 1. Der Resultatvertrag (Plan §7) ────────────────────────────────────────






// ── 2. Der Modus-Vertrag als Daten ─────────────────────────────────────────





// ── 3. Gate: MIN/MID aendern keine Anforderungen — in keinem Modus ─────────


// ── 4. Gate: MAX akzeptiert einen definierten Context-Input ────────────────






/**
 * Dieselbe Datei, zwei Schreibweisen — die Luecke, die der Profil-Lauf am
 * 2026-10-16 gezeigt hat.
 *
 * Der Pruefstand oben liefert RELATIVE Pfade (`packages/prompter/index.js`), der
 * Runtime-Index im echten Betrieb ABSOLUTE. Ein Modell nennt eine Datei aber so,
 * wie ein Mensch sie nennt — mit dem Ergebnis, dass die Referenz auf genau die
 * Datei, ueber die der Prompt ging, als "unbekannt" protokolliert und verworfen
 * wurde. Die Regel verlangt einen Treffer an der Verzeichnisgrenze, damit eine
 * andere Datei gleichen Namens nicht durchrutscht.
 */






/**
 * §15 am Randfall: der INHALT traegt die Marken des Blocks selbst. Das ist kein
 * konstruierter Fall — die Plan-Datei und die §15-Probe dieses Repos tragen genau
 * diese Zeichenfolgen, und der Resolver liefert sie auf einen Prompt, der sie
 * nennt. Die Markierung ist keine Sicherheitsgrenze (die Grenze ist die fehlende
 * Faehigkeit), aber sie ist die einzige Auskunft darueber, was Daten sind: ein
 * Inhalt, der sie schliessen oder verdoppeln kann, hebt genau diese Auskunft auf.
 */

/**
 * Der Patch nennt `contextPath` relativ zum Paket — genau so wird es jemand
 * eintragen. Die anderen Faelle nutzen absolute Pfade und wuerden diese Zusage
 * nicht pruefen.
 */



// ── 5. Isolation: der One-Shot-Child ist keine Faehigkeit ──────────────────


/**
 * Die Runtime-Module des Pakets: `index.js` plus die `assets/`-Kerne.
 *
 * EINE benannte Ausnahme: `learned-store.js` schreibt die gelernten Bausteine
 * (writeFileSync/mkdirSync) — das ist das Propose-Seam, kein Leck. Mit dem
 * zweiten Index fiel die alte Ausnahme weg. Alles andere, insbesondere der
 * One-Shot-Pfad, bleibt ohne Dateisystem, Netz und Prozess-Exit.
 */
export function runtimeModules() {
  const assets = join(PACKAGE_DIR, 'assets');
  // Ausgenommen sind die SCHREIBENDEN Pfade, die NICHT im One-Shot-Aufruf
  // liegen: gelernte Bausteine, der Skill-Writer, das Lernregister und der
  // Curator schreiben Dateien, weil ein Eigentuemer sie dazu aufruft. Ihre
  // Grenzen pruefen ihre eigenen Tests (kein `tools`-Feld im Lernaufruf,
  // genau ein Modellaufruf je Auftrag, Ziel innerhalb der Wurzel).
  const writers = new Set(['learned-store.js', 'skill-lifecycle.js', 'learning-store.js', 'learning-curator.js']);
  return [
    INDEX_FILE,
    ...readdirSync(assets).sort().filter((name) => name.endsWith('.js') && !writers.has(name)).map((name) => join(assets, name)),
  ];
}


// ── 6. Das Paket laedt und haengt am Schritt ───────────────────────────────




// ── 7. Bei Verwerfen gilt der Roh-Prompt unveraendert ─────────────────────


/**
 * Prosa statt JSON ist der gemessene Regelfall (2026-10-18) — sie ist aber ein
 * FEHLERFALL, kein Vorschlag. Seit 2026-10-23 wird sie benannt (`SALVAGED_PROSE`),
 * gezaehlt und verworfen; der Auftrag des Menschen bleibt stehen. Der Grund fuer
 * die Verschaerfung ist gemessen: eine Antwort, die die interne Veredler-Anweisung
 * wiederholte, wurde als Nutzernachricht in die Sitzung geschrieben und vom
 * Scoring als vorherige Frage des Menschen gelesen.
 */


/**
 * Der gemessene Leak (2026-10-19): das Modell leitet seine Prosa mit einem
 * Fuellwort ein ("Klar, gerne. Hier ist der verbesserte Prompt: …"). Der
 * Vorrede-Schnitt greift, das Fuellwort davor bleibt — und damit passiert die
 * GESAMTE Antwort als Veredelung, obwohl nur der Satz danach der Prompt ist.
 * Zweiter Fall derselben Ursache: das Fuellwort steht OHNE Vorrede am Anfang
 * ("Klar. Baue …"). Auch dann beginnt der Prompt beim ersten Inhaltssatz.
 * Gepinnt wird der gerenderte Prompt, nicht die Absicht: das Fuellwort darf in
 * `decision.messages` nicht mehr auftauchen.
 */

/**
 * Dieselbe Grenze, andere Form (Sitzungslogs 2026-10-19): eine ANTWORT auf den
 * Auftrag (Berichtslabel, Tabelle, direkte Gegenrede) ist kein Vorschlag. Sie
 * wird verworfen, nicht vorne gekuerzt — sonst stuende die Antwort im Prompt.
 */

/**
 * Das Probe-Journal sammelt die VERWORFENEN Antworten des echten One-Shots —
 * damit die Prosa-Rettung spaeter gegen Enhancer-Antworten messbar wird, nicht
 * gegen fremde Assistenten-Antworten. Eine Zeile je Verwerfung, angehaengt.
 */


/**
 * „Zu oft" muss messbar sein, nicht fuehlbar: der Datensatz traegt Grund,
 * Zeichenzahl und den wievielten SALVAGED_PROSE-Fall DIESER Sitzung — und die
 * Trace-Zeile nennt dieselben drei Werte. OHNE Ablage bleibt es beim Zaehler
 * im Prozess; dafuer steht der Neustart-Fall direkt unter diesem Test.
 */

/**
 * Die Anfrage dahinter: die Haeufigkeit soll auch einen NEUSTART ueberleben.
 * Hier wird genau das gemessen — zwei Prozesse, eine Ablage. Der zweite kennt
 * den ersten nicht, liest den Stand aber und schreibt bei 3 weiter; die Zahl
 * steht im Entscheidungsdatensatz, damit „zu oft" nachpruefbar bleibt.
 *
 * Der Raum ist der EIGENE des Prompters: derselbe Dienst, nicht derselbe
 * Stand wie Scoring oder Persona (das pinnt `context-wiring`).
 */

/**
 * Die Gegenprobe: ein LEERER Namensraum schaltet die Ablage ab (dieselbe Regel
 * wie beim Selbstmodell der Persona), ein FREMDER Stand wird nicht uebernommen.
 * Beides muss fail-closed sein — sonst behauptete eine Zahl eine Historie, die
 * niemand geschrieben hat.
 */

/**
 * Der gemessene Leak (2026-10-19): das Modell antwortet mit einem JSON im Zaun,
 * die Antwort ist abgeschnitten — `parseResult` scheitert an INVALID_JSON, der
 * Zaun wurde aber als Prosa gerettet, und der Nutzer sah ein halbes Objekt
 * (`{"enhancedPrompt": "…`) statt seines Prompts. Ein JSON — auch im Zaun, auch
 * abgeschnitten — ist kein Prompt; der Rohtext bleibt stehen.
 */

/**
 * Gegenprobe zur Sperre: ein Prosatext im Zaun, dem die schliessende Marke fehlt,
 * wird als Prosa ERKANNT (Grund und Zeichenzahl stimmen) — und trotzdem nicht
 * uebernommen. Die Erkennung bleibt, die Wirkung ist weg.
 */

/**
 * Diagnose-Luecke, gemessen am NO_JSON-Fehlerfall 2026-10-16: der Verwerfungs-
 * grund landete im Sitzungsverlauf, die TATSAECHLICHE Modellantwort nie — die
 * Ursache war damit undiagnostizierbar. Der Rohtext muss deshalb auf stderr
 * stehen, sobald verworfen wird (vollstaendig genug zur Diagnose), und bei
 * leerer Antwort ausdruecklich als leer benannt werden.
 */

/**
 * Die im Profil-Lauf GEMESSENE antwortlose Form (2026-10-16): der Provider
 * lieferte `usage` + `finish` und kein einziges content-Chunk, der Grund kam als
 * Objekt. Vorher stand im Log `reason=[object Object]` — die eine Information,
 * die eine antwortlose Antwort noch trug, war unlesbar. Diese Attrappe stellt
 * genau diese Form her und pinnt, dass sie jetzt vollstaendig dasteht.
 */

/**
 * Der vierte Weg zu „kein Ergebnis“: der Aufruf WIRFT (Zeitlimit, Netzfehler,
 * Provider-Fehler). Vorher war er voellig stumm — nur ein Grundkuerzel landete im
 * Datensatz. Jetzt muss Name, Meldung und Dauer dastehen, sonst ist ein Abbruch
 * durch unser eigenes Zeitlimit nicht von einem Providerfehler zu trennen.
 */

/**
 * Das Gate dieses Blocks, Regel fuer Regel aus Plan §7. Die Tabelle ist die
 * Zusage: jede ungueltige oder intent-veraendernde Ausgabe endet beim
 * Roh-Prompt — und zwar mit GENAU einem Aufruf, GENAU einem Datensatz und einer
 * benannten Ursache. Eine Zeile pro Regel, damit eine fehlende Regel auffaellt.
 */









// ── 8. Die Ersetzung ist chirurgisch ──────────────────────────────────────




// ── 9. Der Abbruch des Schritts wirkt ─────────────────────────────────────



// ── 10. Konfiguration ────────────────────────────────────────────────────



// ── 11. Einheitlicher Eingang: nur der Mensch wird veredelt ───────────────

/**
 * Eine vom Harness erzeugte `role: 'user'`-Nachricht. Solche Nachrichten reisen
 * durch denselben Seam wie die Nutzereingabe — gemessen in DSH 0.2.0-rc.2 gibt
 * es dafuer mindestens zwanzig Produzenten. Der Unterschied ist `source.kind`.
 */
export const harnessMessage = (kind, text = 'Kontext des Harness') => ({
  id: `h-${kind}`,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind },
});




// ── 12. Eigenschaftstest: jede indizierte Datei, genau eine Region ─────────

export { REGION_MARK, regionHits, isOneRegion, MARKEN_AUSREISSER } from './prompter-contract-fixtures-c.mjs';
