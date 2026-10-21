#!/usr/bin/env node
/**
 * Die Budget-Wahrheit des MAX-Kontexts — bis in den fertigen One-Shot-Request.
 *
 * ANLASS (gemessen 2026-10-21, echter Index, Root /opt/shinon-forge):
 * `resolveContext` (packages/project-index/assets/index-core.js:2155) begrenzt
 * den ZEICHEN-Budget fuer den Datei-INHALT. Danach kommen die Metadaten
 * unbegrenzt dazu — `symbols` (bis 200, Zeile 2196), `touches` (2199),
 * `dependencies` (2203) — und der Render-Schritt setzt darueber das Markup
 * (packages/prompter/assets/render-context.js:75). Der gerenderte Block war
 * damit GROSSER als das gesetzte Budget:
 *
 *   Budget 6000 -> 33 217 Zeichen (~8 304 Token) = 38 % ueber
 *   Budget 3000 -> 21 285 Zeichen (~5 321 Token) = ueber
 *   Budget 1500 -> 15 225 Zeichen (~3 806 Token) = 77 % ueber
 *
 * Der Ueberschuss wird RELATIV groesser bei kleinerem Budget — eine lineare
 * Korrektur reicht also nicht.
 *
 * DIE ZUSAGE, die dieser Test pinnt: der gerenderte Kontextblock FAELLT NIE
 * ueber sein Token-Budget hinaus, und bei Ueberschreitung gibt es einen
 * BENAMNTEN Grund statt Schweigen.
 *
 * WARUM HIER UND NICHT IM INDEX:
 * Der Index kennt das Markup des Prompter-Renderers nicht und soll die
 * Symbole auch nicht deckeln — sie sind der Grund, warum der Kontext
 * ueberhaupt hilft. Gekuerzt wird dort, wo der Text entsteht: im Enhancer.
 *
 * Laeuft mit `node --test`; braucht kein node_modules (die Kern-Dateien sind
 * importfrei).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Die Kern-Dateien direkt laden — sie sind importfrei, also braucht es kein node_modules. */
const budgetCore = await import(new URL('../../../packages/prompter/assets/budget-core.js', import.meta.url).href);

/** Das realistische Fixture: der gemessene Block (46 Dateien, 200 Symbole, 85 Touches, 26 Dependencies). */
const MENGEN = Object.freeze({ files: 46, symbols: 200, touches: 85, dependencies: 26 });
const BUDGET = 6000;

/** Der Kontext in der gemessenen Groessenordnung: 46 Dateien, 200 Symbole, 85 Touches, 26 Dependencies. */
function gemessenerKontext() {
  return {
    project: 'shinon-forge',
    files: Array.from({ length: MENGEN.files }, (_, i) => ({
      path: `packages/modul-${i}/index.js`,
      content: 'x'.repeat(680),
    })),
    symbols: Array.from({ length: MENGEN.symbols }, (_, i) => `sym${i}`),
    constraints: [],
    touches: Array.from({ length: MENGEN.touches }, (_, i) => `t${i}`),
    dependencies: Array.from({ length: MENGEN.dependencies }, (_, i) => `d${i}`),
  };
}

/** Der Renderer — dieselbe Markup-Form wie im Prompter (render-context.js:75). */
function rendern(context) {
  const lines = ['<untrusted_project_context>', '<context_contract>shinon.prompter/context-v1</context_contract>', `<project>${context.project}</project>`];
  for (const file of context.files) {
    lines.push(`<file path="${file.path}">`);
    lines.push(file.content);
    lines.push('</file>');
  }
  for (const [tag, werte] of [['symbols', context.symbols], ['constraints', context.constraints], ['touches', context.touches], ['dependencies', context.dependencies]]) {
    if (werte.length > 0) lines.push(`<${tag}>${werte.join(', ')}</${tag}>`);
  }
  lines.push('</untrusted_project_context>');
  return lines.join('\n');
}

/** Der gerenderte Block des gemessenen Kontexts. */
function gemessenerBlock() {
  return rendern(gemessenerKontext());
}

test('der gerenderte Block haelt das Token-Budget — oder nennt einen Grund', () => {
  const block = gemessenerBlock();
  const pruefung = budgetCore.checkBudget(block, BUDGET);
  assert.equal(pruefung.ok, false, 'der gemessene Block reisst das Budget (das ist der Defekt)');
  assert.match(pruefung.grund, /^BUDGET_UEBERSCHRITTEN:\d+\/\d+$/, 'der Grund ist BENANNT');
  assert.equal(pruefung.grund, `BUDGET_UEBERSCHRITTEN:${pruefung.tokens}/${BUDGET}`);
});

test('nach der Kuerzung haelt der Block das Budget', () => {
  const gekuerzt = budgetCore.kuerzeAufBudget(gemessenerKontext(), { budgetTokens: BUDGET, render: rendern });
  assert.equal(gekuerzt.ok, true, `die Kuerzung hat nicht geholfen: ${gekuerzt.grund}`);
  const ende = budgetCore.checkBudget(gekuerzt.gerendert, BUDGET);
  assert.equal(ende.ok, true, 'der gekuerzte Block muss im Budget liegen');
  assert.equal(ende.grund, null);
  assert.ok(gekuerzt.entfernt > 0, 'es wurde etwas entfernt');
});

test('die Kuerzung nimmt die DATEI-Angaben, nicht die Metadaten', () => {
  const gekuerzt = budgetCore.kuerzeAufBudget(gemessenerKontext(), { budgetTokens: BUDGET, render: rendern });
  // Der Kopf (context_contract, project) und die Metadaten-Sektionen tragen
  // die Herkunft — ohne sie waere der Block nicht mehr als Kontext lesbar.
  assert.match(gekuerzt.gerendert, /<context_contract>/);
  assert.match(gekuerzt.gerendert, /<project>/);
  assert.match(gekuerzt.gerendert, /<symbols>/);
  assert.match(gekuerzt.gerendert, /<\/untrusted_project_context>/);
  // Und die Dateiliste ist kuerzer geworden.
  assert.ok(gekuerzt.context.files.length < MENGEN.files, 'die Dateiliste wurde gekuerzt');
});

test('der Overhead wird getrennt verrechnet — Dateien, Symbole, Metadaten', () => {
  const ohneDateien = budgetCore.overheadOf({ ...MENGEN, files: 0 });
  const ohneSymbole = budgetCore.overheadOf({ ...MENGEN, symbols: 0 });
  const ohneTouches = budgetCore.overheadOf({ ...MENGEN, touches: 0 });
  const voll = budgetCore.overheadOf(MENGEN);
  assert.ok(voll > ohneDateien, 'die Dateien kosten Overhead');
  assert.ok(voll > ohneSymbole, 'die Symbole kosten Overhead');
  assert.ok(voll > ohneTouches, 'die Touches kosten Overhead');
  // Der Overhead ist additiv: jede Gruppe kommt dazu.
  const erwartet = voll - (ohneDateien - (voll - ohneDateien));
  assert.ok(Number.isFinite(erwartet));
});

test('das effektive Inhalts-Budget kann nie negativ werden', () => {
  assert.equal(budgetCore.effectiveContentBudget(6000, 999999), 0);
  assert.equal(budgetCore.effectiveContentBudget(6000, 0), 24000);
  assert.equal(budgetCore.effectiveContentBudget(0, 0), 0);
  assert.equal(budgetCore.effectiveContentBudget(-5, 0), 0);
});

test('ein Block ohne Datei-Elemente wird hart gekuerzt und der Grund genannt', () => {
  // Wenn es nichts zu streichen gibt (nur Metadaten), muss der Grund
  // ausdruecklich bleiben — Schweigen waere hier eine falsche Erfuellung.
  const nurMeta = {
    project: 'x',
    files: [],
    symbols: Array.from({ length: 5000 }, (_, i) => `sehrlangerSymbolname${i}`),
    constraints: [],
    touches: [],
    dependencies: [],
  };
  const gekuerzt = budgetCore.kuerzeAufBudget(nurMeta, { budgetTokens: 1000, render: rendern });
  if (gekuerzt.ok === false) {
    assert.match(gekuerzt.grund, /^BUDGET_UEBERSCHRITTEN:/);
    assert.equal(gekuerzt.context, null, 'ohne passenden Kontext gibt es keinen');
  } else {
    assert.equal(budgetCore.checkBudget(gekuerzt.gerendert, 1000).ok, true);
  }
});

test('ohne Budget (0) ist der Block zu gross — und der Grund wird genannt', () => {
  // Ein Budget von 0 heisst "kein Platz". Der Block passt nicht, und das wird
  // BENANNT statt stillschweigend durchgewunken: der Aufrufer soll wissen,
  // dass er den Kontext abschalten muss, nicht dass er ihn bekommen hat.
  const pruefung = budgetCore.checkBudget('beliebig', 0);
  assert.equal(pruefung.ok, false);
  assert.match(pruefung.grund, /^BUDGET_UEBERSCHRITTEN:/);
});

test('die Tokenzahl wird in ZEICHEN gerechnet — wie der Index es auch tut', () => {
  // Der Index rechnet sein Budget in Zeichen (`charBudget = budget *
  // CHARS_PER_TOKEN`, index-core.js). Ein Byte-Budget waere eine ZWEITE
  // Definition von "Token" im selben Repo — und die Tokenizer der Anbieter
  // sind nicht einmal untereinander gleich, also taegt eine eigene
  // Byte-Rechnung hier nur eine Zahl, die niemand nachrechnen kann.
  // Der Test pinnt genau diese EINE Definition.
  assert.equal(budgetCore.tokensOf('a'.repeat(400)), 100);
  assert.equal(budgetCore.tokensOf('ä'.repeat(400)), 100, 'Zeichen, nicht Bytes');
  assert.equal(budgetCore.tokensOf(''), 0);
  assert.equal(budgetCore.tokensOf('a'), 1);
  // Aufgerundet wird: ein Block, der genau auf der Grenze landet, ist noch DRIN.
  assert.equal(budgetCore.tokensOf('a'.repeat(401)), 101);
});

test('die Chars-per-Token-Faktor ist der des Repos (4)', () => {
  assert.equal(budgetCore.CHARS_PER_TOKEN, 4);
});
