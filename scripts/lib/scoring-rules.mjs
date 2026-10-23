/**
 * scoring-rules.mjs — Eigentümer: die Schreib-Scope-Seite des Scoring-Gates.
 *
 * `staticIssues`, `scopeIssues` und `outcomeIssues` prüfen denselben
 * Laufzeitcode von drei Seiten: was er NICHT darf (Schreiben, Netz, Modell),
 * welche Pfade er nennt, und ob ein Schreibverb auf einem Dienst statt auf
 * einer lokalen Buchhaltung landet. Vertrags-, Signal- und Tendenzprüfungen
 * liegen in `scoring-contracts.mjs`; das Plugin
 * `scripts/gate/plugins/scoring.mjs` ist die Fassade, die beide zusammenführt
 * und die Fläche für Tests unverändert lässt.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { codeOnly, findForbidden } from './source-scan.mjs';

export const SCORING_CONTRACT_ID = 'shinon.scoring-state/v1';
export const PROFILE_CONTRACT_ID = 'shinon.technical-profile/v1';
export const TRIGGERS_CONTRACT_ID = 'shinon.skill-triggers/v1';
export const SIGNAL_RULES_CONTRACT_ID = 'shinon.signal-rules/v1';
export const TENDENCY_RULES_CONTRACT_ID = 'shinon.tendency-rules/v1';

/** Die zwei Pole, die eine Tendenz-Klasse tragen darf. */
export const TENDENCY_POLES = ['negative', 'positive'];

/**
 * Die drei Mechanismen der Rechnung (§4 des Konzepts) und die Datei, in der ihr
 * Ort liegen muss. Mehr gibt es nicht: Trust-Ceiling und Rate-Limit sind
 * ersetzt, weil sie ungemessene Erfindungen waren.
 */
export const TENDENCY_MECHANISMS = {
  weight: 'signal-rules.json',
  retract: 'signal-rules.json',
  forget: 'scoring-state.json',
};

/**
 * Die Verben, die den EINEN Ausgang der Schicht verletzen würden. `load` und
 * `save` sind das erlaubte Paar (lesen beim Start, anhängen eines Signals);
 * jedes andere Schreibverb wäre ein zweiter Weg in die Ablage.
 */
export const STORE_VERBS = ['append', 'delete', 'remove', 'insert', 'update', 'put', 'write', 'truncate'];

/**
 * Die vier Dateien, die der Scoring-Code beschreiben darf — alle anderen nicht.
 * `signal-rules.json` ist die Signaltabelle (K5); ohne sie hier wäre der Pfad
 * im Host-Code ein Befund, obwohl er der Vertrag ist.
 */
export const WRITABLE_ASSETS = [
  'assets/scoring-state.json',
  'assets/technical-profile.json',
  'assets/skill-triggers.json',
  'assets/signal-rules.json',
  'assets/tendency-rules.json',
];

/** Die sieben Signale der Plan-Tabelle — genau diese, keine mehr. */
export const SIGNAL_IDS = ['adopt', 'accept', 'copy', 'dismiss', 'nextq', 'rephrase', 'selffix'];

/** Die vier Arten einer Quelle: werten, zurücknehmen, notieren — und `observe` (SH-LEARN-01: gezaehlt, nie gewertet). */
export const SOURCE_KINDS = ['note', 'observe', 'retract', 'score'];

/** Die Stärken, die die Tabelle führt (Faktor = Vielfaches des Basis-Deltas). */
export const STRENGTH_IDS = ['high', 'low', 'medium'];

/**
 * Regeln, die hier NICHT stehen dürfen.
 *
 * Ein Vertrauens-Deckel (0.8), ein Zähler-Limit pro Sitzung oder eine
 * Sekunden-Regel sind Grenzen, die niemand gesetzt hat — sie stünden der
 * Absicht entgegen, dass Vertrauen mit der Laufzeit aus Ergebnissen wächst und
 * dass der INHALT entscheidet, nicht die Uhr. Das Gate prüft die Abwesenheit,
 * weil eine Zahl in einer Datendatei sonst still wieder eingeführt wird.
 */
export const FORBIDDEN_RULE_KEYS = [
  'trustCeiling',
  'trustCap',
  'rateLimit',
  'maxPublishedSignalsPerSession',
  'maxSignalsPerSession',
  'maxSignals',
  'windowSeconds',
  'maxSeconds',
  'maxAgeSeconds',
];

/**
 * Lesbar zusätzlich: die reinen Kerne, der Lern-Kern und die Replay-Fixture —
 * derselbe Host liest sie, also gehören sie in dieselbe Whitelist.
 */
export const READABLE_ASSETS = [
  ...WRITABLE_ASSETS,
  'assets/scoring-core.js',
  'assets/signal-translate.js',
  'assets/block-weights.js',
  'assets/replay/scoring-demo.json',
];

/** Verbotene Module: Importnamen werden auch in Strings erkannt. */
export const FORBIDDEN_MODULES = ['child_process'];

/** Verbotene Aufrufe: das Scoring liest — es schreibt, ruft und würfelt nicht. */
export const FORBIDDEN_TOKENS = [
  'writeFile',
  'writeFileSync',
  'mkdirSync',
  'rmSync',
  'unlinkSync',
  'execSync',
  'spawn(',
  'fetch(',
  'http.request',
  'Math.random',
  'Date.now',
  'process.exit',
  'ctx.agents',
  'ctx.llm',
  'ctx.shell',
  'ctx.tools',
  'ctx.set(',
];

export const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** Laufzeitgrenze: lesen ja, schreiben/handel nein. Kommentare zählen nicht. */
export function staticIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    for (const token of findForbidden(source, FORBIDDEN_MODULES, { mode: 'module' })) {
      issues.push(`${file}: verbotener Modulimport ${token} — das Scoring liest, es handelt nicht`);
    }
    for (const token of findForbidden(source, FORBIDDEN_TOKENS)) {
      issues.push(`${file}: verbotener Aufruf ${token} — das Scoring liest, es schreibt nicht`);
    }
  }
  return issues;
}

/**
 * Pfad-Scope: jede Pfad-Angabe im Scoring-Code bleibt im eigenen Paket auf
 * bekannten Dateien. Ein `./assets/andere.json` wäre ein Schreiben außerhalb
 * der drei Vertragsdateien; ein `../` ein Ausbruch aus dem Paket.
 */
export function scopeIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    const literals = [
      ...source.matchAll(/['"]((?:\.\/)?assets\/[^'"]+)['"]/g),
      ...source.matchAll(/['"](\.\.\/[^'"]+)['"]/g),
    ].map((match) => match[1]);
    for (const literal of literals) {
      const normalized = literal.startsWith('./') ? literal.slice(2) : literal;
      if (normalized.startsWith('../')) {
        issues.push(`${file}: Pfad ${JSON.stringify(literal)} verlässt das Paket`);
      } else if (!READABLE_ASSETS.includes(normalized)) {
        issues.push(`${file}: Pfad ${JSON.stringify(literal)} ist keine bekannte Scoring-Datei`);
      }
    }
  }
  return issues;
}


/**
 * Ein Schreibverb zählen — lokale Map/Set-Aufräumarbeit ist KEIN Dienst-Ausgang.
 *
 * `sessionBlocks.delete(sessionId)` leert eine Map im Speicher, wenn eine
 * Sitzung neu beginnt; das ist dieselbe Buchhaltung wie `splice`, kein zweiter
 * Weg in die Ablage. Der Scan unterscheidet deshalb nach dem EMPFÄNGER: ein
 * `delete` auf einer hier als `new Map(...)`/`new Set(...)` gebundenen Variablen
 * zählt nicht, `store.delete('x')` schon. Die Zusage bleibt dieselbe — der eine
 * Ausgang ist der Signal-Anhang, jedes andere Schreibverb auf einem Dienst ist
 * ein Befund.
 */
function storeVerbHits(code, verb, localCollections) {
  const receiver = new RegExp(`([A-Za-z_$][\\w$]*)\\.${verb}\\s*\\(`, 'g');
  let hits = 0;
  for (const match of code.matchAll(receiver)) {
    if (!localCollections.has(match[1])) hits += 1;
  }
  return hits;
}

/**
 * Den EINEN Ausgang prüfen (Zusage aus dem Kopf dieser Datei).
 *
 * Der Host hängt ein Signal an: ein `save` auf dem Dienst der Ablage. Genau eines
 * — und genau ein `load` beim Start. Jedes weitere Schreibverb auf einem Dienst
 * wäre ein zweiter Weg, und ein zweiter Weg wäre eine Zusage, die niemand liest.
 * Der Kern (assets/*.js) wird hier nicht geprüft: er hat keinen Dienst und keine
 * Datei (dafür steht `staticIssues`).
 */
export function outcomeIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    if (!file.endsWith('index.js')) continue;
    const code = codeOnly(source);
    // Lokale Speicher-Aufräumer (Map/Set) sind keine Dienste. Sie werden aus
    // DEMSELBEN Quelltext gelesen, damit die Ausnahme nicht geraten ist.
    const localCollections = new Set();
    for (const match of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:Map|Set)\s*\(/g)) {
      localCollections.add(match[1]);
    }
    const count = (pattern) => (code.match(pattern) ?? []).length;
    const saves = count(/\.save\s*\(/g);
    if (saves !== 1) issues.push(`${file}: die Zusage ist EIN Ausgang — erwartet genau 1 \`save\`, gefunden ${saves}`);
    const loads = count(/\.load\s*\(/g);
    if (loads !== 1) issues.push(`${file}: erwartet genau 1 \`load\` beim Start, gefunden ${loads}`);
    for (const verb of STORE_VERBS) {
      const hits = storeVerbHits(code, verb, localCollections);
      if (hits > 0) {
        issues.push(`${file}: \`${verb}\` auf einem Dienst — der einzige Ausgang ist der Signal-Anhang (\`save\`)`);
      }
    }
  }
  return issues;
}

export function readSources(base) {
  const files = ['index.js', 'client.js'];
  const assetsDir = join(base, 'assets');
  if (existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) files.push(`assets/${entry.name}`);
    }
  }
  return files
    .filter((file) => existsSync(join(base, file)))
    .map((file) => ({ file: `packages/scoring/${file}`, source: readFileSync(join(base, file), 'utf8') }));
}
