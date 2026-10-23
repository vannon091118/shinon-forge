#!/usr/bin/env node
/**
 * scripts/gate/tests/provided-seams.test.mjs — jede angebotene Naht hat einen Leser.
 *
 * Der Befund (Audit, Konflikt #23, „tote Dienstfläche"): zehn Dienste wurden per
 * `ctx.provide` angeboten, und vier davon hatten im ganzen Baum keinen Abnehmer —
 * `shinon_goal_micro_state` (task-router), `shinon_block_propose` (prompter),
 * `shinon_persona_review` und `shinon_persona_relation` (persona). Ein Dienst
 * ohne Leser ist keine Fähigkeit, sondern eine ausgestellte Vollmacht: er sieht
 * aus wie eine Naht und ist keine.
 *
 * Entschieden am 2026-10-23, je Naht einzeln:
 *
 *   ENTFERNT — `shinon_persona_review`, `shinon_persona_relation`. Die lebende
 *   Naht war längst die Route (`REVIEW_ROUTE` GET/POST, `RELATION_ROUTE` GET/POST)
 *   samt `REVIEW_GLOBAL`/`UI_STATE_GLOBAL` und dem SSE-Ereignis `review`. Der
 *   Dienst war ein zweiter Zugang zum SELBEN Objekt, den niemand öffnete.
 *
 *   VERDRAHTET — `shinon_block_propose`, `shinon_goal_micro_state`: ihr Abnehmer
 *   ist der AGENT, und der erreicht sie nur über ein Modell-Werkzeug. Beide
 *   tragen jetzt eines mit eigenem `output` (`assets/propose-tool.js`,
 *   `assets/micro-state-tool.js`), gepinnt von `tool-seams.test.mjs`; die Zeilen
 *   stehen deshalb unten als LESER, nicht als Erklärung.
 *
 *   DEKLARIERT — `shinon_codingmon_store`: sein Abnehmer liegt außerhalb dieses
 *   Baums. Ein Client-Beitrag kann sich nicht selbst montieren
 *   (`@deepseek-ai/dsh-api-remotes` hält eine kompilierte Liste) — eine Etappe,
 *   keine Zeile. Bis dahin steht hier der Grund und die Fähigkeit
 *   (`capabilities.json`); still ist nichts.
 *
 * Der Test hält beides: die vollständige Liste der angebotenen Dienste (aus dem
 * Quelltext gelesen, nicht gepflegt), je Eintrag den LESER (Datei plus Name) oder
 * die Erklärung, und die zwei entfernten Türen mit ihrer lebenden Route. Eine
 * neue Naht ohne Leser, ein verschwundener Leser oder ein wieder angebotener
 * entfernter Dienst ist rot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly, stripComments } from '../../lib/source-scan.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** Jede angebotene Naht: wo sie angeboten wird, wer sie liest. */
const PROVIDED = [
  {
    service: 'shinon_index_query',
    provider: 'packages/project-index/index.js',
    reader: { file: 'packages/prompter/assets/mode-core.js', symbol: 'INDEX_SERVICE' },
  },
  {
    service: 'shinon_index_store',
    provider: 'packages/project-index/index.js',
    // Der gemeinsame Index-Store: die Naht steht in `seams`, gelesen wird sie
    // von Prompter, Scoring und Persona (`ctx.get(INDEX_STORE_SERVICE)`).
    reader: { file: 'packages/seams/assets/seams.js', symbol: 'INDEX_STORE_SERVICE' },
  },
  {
    service: 'shinon_facts_snapshot',
    provider: 'packages/project-index/index.js',
    reader: { file: 'packages/prompter/assets/mode-core.js', symbol: 'FACTS_SNAPSHOT_SERVICE' },
  },
  {
    service: 'shinon_scoring_state',
    provider: 'packages/scoring/index.js',
    reader: { file: 'packages/prompter/assets/pre-step.js', symbol: 'SCORING_SERVICE' },
  },
  {
    service: 'shinon_block_weights',
    provider: 'packages/scoring/index.js',
    reader: { file: 'packages/prompter/assets/pre-step.js', symbol: 'WEIGHTS_SERVICE' },
  },
  {
    // Der Leser ist das Modell-Werkzeug: es ruft `proposeService.propose`, also
    // genau die Funktion, die der Dienst anbietet (`assets/propose-tool.js`).
    service: 'shinon_block_propose',
    provider: 'packages/prompter/index.js',
    reader: { file: 'packages/prompter/assets/propose-tool.js', symbol: 'PROPOSE_SERVICE' },
  },
  {
    // Dasselbe fuer §18: das Werkzeug ruft `state(agent)` auf dem Dienstobjekt
    // (`assets/micro-state-tool.js`), ohne eigenen Zustand.
    service: 'shinon_goal_micro_state',
    provider: 'packages/task-router/index.js',
    reader: { file: 'packages/task-router/assets/micro-state-tool.js', symbol: 'MICRO_STATE_SERVICE' },
  },
];

/**
 * Angeboten, aber der Abnehmer liegt außerhalb des Baums. Jeder Eintrag nennt
 * den Grund und die Fähigkeit, deren Antwort die Naht ist — eine stille
 * Ausnahme gibt es nicht.
 */
const DECLARED_EXTERNAL = [
  {
    service: 'shinon_codingmon_store',
    provider: 'packages/codingmon/index.js',
    capability: 'pet-und-begleiter',
    reason: 'Client→Host-Beitrag (`petRemoteContribution`), montiert von einer Client-Komposition außerhalb des Baums — die gemessene Grenze steht in AGENTS.md',
  },
];

/** Entfernt am 2026-10-23: der Dienst war die zweite Tür zur schon offenen Route. */
const REMOVED = [
  { service: 'shinon_persona_review', provider: 'packages/persona/index.js', route: 'REVIEW_ROUTE' },
  { service: 'shinon_persona_relation', provider: 'packages/persona/index.js', route: 'RELATION_ROUTE' },
];

/** Alle Paket-Quellen einmal einlesen (ohne Tests: die lesen, sie bieten nicht an). */
const PACKAGE_FILES = readdirSync(join(ROOT, 'packages'), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.parentPath.includes('node_modules'))
  .map((entry) => ({ path: join(entry.parentPath, entry.name), rel: join(entry.parentPath, entry.name).slice(ROOT.length).replaceAll('\\', '/') }))
  .map((entry) => ({ ...entry, source: readFileSync(entry.path, 'utf8') }));

/** Der Wert einer Konstanten — egal in welcher Datei des Pakets sie steht. */
function literalOf(symbol) {
  for (const file of PACKAGE_FILES) {
    const match = new RegExp(`(?:export )?const ${symbol} = '([^']+)'`).exec(stripComments(file.source));
    if (match !== null) return { literal: match[1], file: file.rel };
  }
  return null;
}

/** Die tatsächlich angebotenen Dienste — aus `bus.provide(<NAME>, …)` gelesen. */
function providedServices() {
  const found = new Map();
  for (const file of PACKAGE_FILES.filter((entry) => entry.rel.endsWith('/index.js'))) {
    // Kommentare zählen nicht: der Kopf der Persona NENNT die entfernte Tür,
    // angeboten wird sie nicht mehr.
    const source = stripComments(file.source);
    for (const match of source.matchAll(/(?:bus|ctx)\.provide\(\s*([A-Za-z_$][\w$]*)\s*,/g)) {
      const resolved = literalOf(match[1]);
      if (resolved !== null) found.set(resolved.literal, file.rel);
    }
  }
  return found;
}

/** Die Naht, auf die ein Eintrag zeigt: Literal ODER Symbol muss im Leser stehen. */
function readerIssues(entry) {
  const issues = [];
  if (entry.reader === null || entry.reader === undefined) {
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') issues.push(`${entry.service}: weder Leser noch Grund`);
    return issues;
  }
  if (!existsSync(join(ROOT, entry.reader.file))) {
    issues.push(`${entry.service}: Leser ${entry.reader.file} fehlt`);
    return issues;
  }
  const source = read(entry.reader.file);
  // Das Symbol ist Code (`ctx.get(SCORING_SERVICE)`), das Literal steht im
  // String — beide Formen zählen, aber jede an ihrem Ort.
  const symbol = entry.reader.symbol;
  const namesSymbol = typeof symbol === 'string' && new RegExp(`\\b${symbol}\\b`).test(codeOnly(source));
  const namesLiteral = source.includes(entry.service);
  if (!namesSymbol && !namesLiteral) {
    issues.push(`${entry.service}: Leser ${entry.reader.file} nennt ${symbol ?? entry.service} nicht mehr`);
  }
  return issues;
}

test('jede angebotene Naht steht in der Tabelle — und jede Tabellenzeile wird angeboten', () => {
  const provided = providedServices();
  const declared = new Set([...PROVIDED, ...DECLARED_EXTERNAL].map((entry) => entry.service));
  assert.deepEqual([...provided.keys()].sort(), [...declared].sort(), 'Angebot und Tabelle laufen auseinander');
  for (const entry of [...PROVIDED, ...DECLARED_EXTERNAL]) {
    assert.equal(provided.get(entry.service), entry.provider, `${entry.service}: Provider ist ${provided.get(entry.service)}, nicht ${entry.provider}`);
  }
});

test('jede deklarierte Naht nennt Grund und Fähigkeit, und die Fähigkeit existiert', () => {
  const map = JSON.parse(read('packages/prompter/assets/capabilities.json'));
  const ids = new Set(map.capabilities.map((capability) => capability.id));
  for (const entry of DECLARED_EXTERNAL) {
    assert.ok(entry.reason.trim().length >= 40, `${entry.service}: der Grund ist eine Floskel`);
    assert.ok(ids.has(entry.capability), `${entry.service}: Fähigkeit ${entry.capability} fehlt in capabilities.json`);
  }
});

test('jede angebotene Naht mit Leser wird wirklich gelesen', () => {
  const issues = PROVIDED.flatMap((entry) => readerIssues(entry));
  assert.deepEqual(issues, [], issues.join('\n'));
});

test('die zwei entfernten Dienste sind weg — und ihre Route steht noch', () => {
  const provided = providedServices();
  for (const entry of REMOVED) {
    assert.equal(provided.has(entry.service), false, `${entry.service} wird wieder angeboten`);
    const source = read(entry.provider);
    // Die Route hat ihren Eigentümer (`ui-surface.js`/`interaction-core.js`); der
    // Eintrag reicht sie weiter. Gepinnt wird: der Name ist öffentlich, und der
    // Client kennt denselben Pfad.
    assert.match(source, new RegExp(`\\b${entry.route}\\b`), `${entry.service}: ${entry.route} fehlt im Eintrag`);
    const route = literalOf(entry.route);
    assert.ok(route !== null, `${entry.service}: ${entry.route} hat keinen Pfad`);
    const client = read(entry.provider.replace('index.js', 'client.js'));
    assert.ok(client.includes(route.literal), `${entry.service}: der Client kennt die Route ${route.literal} nicht mehr`);
  }
});

test('ein neuer Dienst ohne Leser wird gemeldet (Mutationsprobe)', () => {
  const table = new Map([...PROVIDED, ...DECLARED_EXTERNAL].map((entry) => [entry.service, entry]));
  const provided = new Map(providedServices());
  provided.set('shinon_niemand_liest_mich', 'packages/prompter/index.js');
  const missing = [...provided.keys()].filter((name) => !table.has(name));
  assert.deepEqual(missing, ['shinon_niemand_liest_mich']);

  // Und ein Eintrag, dessen Leser die Naht nicht mehr nennt, wird rot.
  const broken = { service: 'shinon_scoring_state', reader: { file: 'packages/tooltip/client.js', symbol: 'SCORING_SERVICE' } };
  assert.ok(readerIssues(broken).length > 0, 'ein verschwundener Leser bleibt unbemerkt');
});
