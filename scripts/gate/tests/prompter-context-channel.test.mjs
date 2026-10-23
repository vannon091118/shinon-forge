#!/usr/bin/env node
/**
 * Der Projektkontext als RUNTIME-CONTEXT — unabhaengig vom Veredler.
 *
 * ANLASS (gemessen 2026-10-21, echter Turn am DSH-Host):
 *   [shinon-prompter] MAX-Kontext aus dem Index (Budget 6000 Token)
 *   [shinon-prompter] verworfene One-Shot-Antwort (NO_JSON), 171 Zeichen
 *   [shinon-prompter] verworfen (NO_JSON) — Roh-Prompt gilt
 *
 * Der Index hatte 502 Dateien, 3926 Symbole, 2710 Chunks. Der One-Shot
 * antwortete mit Prosa statt JSON, der Verwerfer verweigerte korrekt, den
 * Prompt damit zu ersetzen — und damit fiel der ganze Kontext weg.
 *
 * DIE ZUSAGE, die dieser Test pinnt:
 *   (a) der Kontext erscheint im Runtime-Context des echten Dienstes,
 *   (b) er ist LEER, wenn es keinen Kontext gibt (kein leerer Snapshot),
 *   (c) er nennt seinen Vertrag und die Herkunft jeder Angabe.
 *
 * Laeuft mit `node --test`; der Kern ist importfrei, der Dienst-Test braucht
 * das installierte DSH (wie die anderen Tests ebenfalls).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';

const channel = await import(new URL('../../../packages/prompter/assets/context-channel.js', import.meta.url).href);

/** Der gemessene Kontext: 46 Dateien, 200 Symbole, 85 Touches, 26 Abhaengigkeiten. */
const KONTEXT = {
  project: 'shinon-forge',
  files: Array.from({ length: 46 }, (_, i) => ({ path: `packages/modul-${i}/index.js`, content: 'x'.repeat(680) })),
  symbols: Array.from({ length: 200 }, (_, i) => `sym${i}`),
  constraints: [],
  touches: Array.from({ length: 85 }, (_, i) => `t${i}`),
  dependencies: Array.from({ length: 26 }, (_, i) => `d${i}`),
};

test('der Block nennt den Vertrag und die Herkunft jeder Angabe', () => {
  const text = channel.renderContextBlock(KONTEXT);
  assert.notEqual(text, '');
  assert.match(text, /<shinon\.prompter\/context-v1>/);
  assert.match(text, /<\/shinon\.prompter\/context-v1>$/);
  assert.match(text, /Projekt: shinon-forge/);
  assert.match(text, /Dateien \(46\):/);
  assert.match(text, /Symbole \(200\):/);
  assert.match(text, /Touches \(85\):/);
  assert.match(text, /Abhaengigkeiten \(26\):/);
  // Die Anzahl steht DA — nicht eine Behauptung "viele Dateien".
  assert.match(text, /packages\/modul-0\/index\.js/);
});

test('ein leerer Kontext ergibt KEINEN Block — kein leerer Snapshot', () => {
  assert.equal(channel.renderContextBlock(null), '');
  assert.equal(channel.renderContextBlock(undefined), '');
  assert.equal(channel.renderContextBlock({}), '');
  // Auch ein Kontext ohne Datei/Symbol/Touch/Abhaengigkeit traegt nichts.
  assert.equal(channel.renderContextBlock({ project: 'x', files: [], symbols: [], touches: [], dependencies: [] }), '');
});

test('der Block ist kuerzer als der Kontext — er ist eine Uebersicht, kein Dump', () => {
  const text = channel.renderContextBlock(KONTEXT);
  // 46 Dateien mit je 680 Zeichen Inhalt waeren ~31 000 Zeichen. Der Block
  // listet Pfade, Symbole und Herkunft — er traegt den Inhalt NICHT.
  assert.ok(text.length < 4000, `der Block ist ${text.length} Zeichen (zu gross)`);
  assert.ok(text.length < KONTEXT.files.length * 680);
});

test('der Name und die Reihenfolge des Kanals sind benannt', () => {
  assert.equal(channel.CONTEXT_NAME, 'shinon.project-context');
  assert.equal(channel.CONTEXT_CONTRACT, 'shinon.prompter/context-v1');
  // Der Anker liegt ueber den DSH-Ankern (WORKING_DIRECTORY 100, ... 210) und
  // unter dem Harness — sonst kaeme der Kontext vor der Arbeitsumgebung.
  assert.ok(channel.CONTEXT_ORDER > 210, `der Anker ${channel.CONTEXT_ORDER} liegt nicht ueber dem DSH-Bereich`);
  assert.ok(channel.CONTEXT_ORDER < 1000, 'der Anker liegt zu weit hinten');
});

test('der Kanal am ECHTEN systemPrompt-Dienst: der Kontext erscheint als Nachricht', async () => {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
  const require = createRequire(join(root, 'package.json'));
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
  const { default: SystemPrompt } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')).href);

  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  const sp = ctx.get('systemPrompt');

  // Der Kanal wird registriert und liest den Kontext aus einer Quellfunktion.
  const dispose = channel.registerContext(sp, {
    context: () => KONTEXT,
    wissen: () => null,
  });

  try {
    const assembly = await sp.assemble({});
    const namen = assembly.contexts.map((c) => c.name);
    assert.ok(namen.includes(channel.CONTEXT_NAME), `der Kanal fehlt: ${namen.join(', ')}`);
    const eintrag = assembly.contexts.find((c) => c.name === channel.CONTEXT_NAME);
    const text = typeof eintrag.text === 'function' ? eintrag.text(assembly) : eintrag.text;
    assert.match(String(text), /Projekt: shinon-forge/, 'der Kontext steht im Runtime-Context');
    assert.match(String(text), /Dateien \(46\)/);
  } finally {
    dispose();
  }
});

test('der Aufgabenbrief reist als eigener Block — nicht im Nutzertext', async () => {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen');
  const require = createRequire(join(root, 'package.json'));
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
  const { default: SystemPrompt } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')).href);

  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  const sp = ctx.get('systemPrompt');
  const brief = '<task_brief contract="shinon.capabilities/v1" class="DERIVED">\nFrage: Wo wird der Kontext gefunden?\n</task_brief>';
  const dispose = channel.registerContext(sp, {
    context: () => KONTEXT,
    wissen: () => null,
    brief: () => brief,
  });
  try {
    const assembly = await sp.assemble({});
    const eintrag = assembly.contexts.find((c) => c.name === channel.CONTEXT_NAME);
    const text = typeof eintrag.text === 'function' ? eintrag.text(assembly) : eintrag.text;
    // Der Brief steht NEBEN dem Kontext, im selben Runtime-Context — und er
    // kommt aus dem Runtime, nicht aus dem ersetzten Nutzertext.
    assert.match(String(text), /<task_brief contract="shinon\.capabilities\/v1"/);
    assert.match(String(text), /Frage: Wo wird der Kontext gefunden\?/);
    assert.equal(String(text).includes('Bitte pruefe src/a.mjs.'), false, 'kein Nutzertext im Kanal');
  } finally {
    dispose();
  }
});

test('ohne Kontext ist der Kanal LEER — der Snapshot behauptet nichts', async () => {
  const root = dshRoot();
  assert.ok(root !== null, 'dsh muss im PATH liegen');
  const require = createRequire(join(root, 'package.json'));
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
  const { default: SystemPrompt } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')).href);

  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  const sp = ctx.get('systemPrompt');
  const dispose = channel.registerContext(sp, { context: () => null, wissen: () => null });
  try {
    const assembly = await sp.assemble({});
    const eintrag = assembly.contexts.find((c) => c.name === channel.CONTEXT_NAME);
    const text = typeof eintrag.text === 'function' ? eintrag.text(assembly) : eintrag.text;
    assert.equal(String(text), '', 'ohne Kontext gibt es keinen Block');
  } finally {
    dispose();
  }
});

test('der Kanal braucht einen Dienst mit context() — ohne ihn wird es gemeldet, nicht still', () => {
  // Ein fremder Dienst ohne context() darf keinen halb registrierten Kanal
  // hinterlassen: der Fehler wird benannt.
  const gemeldet = [];
  const saved = console.error;
  console.error = (...args) => gemeldet.push(args.join(' '));
  try {
    const dispose = channel.registerContext({}, { context: () => KONTEXT });
    assert.equal(typeof dispose, 'function');
    assert.equal(gemeldet.length, 1, 'der fehlende Dienst wird gemeldet');
    assert.match(gemeldet[0], /context\(\)/);
  } finally {
    console.error = saved;
  }
});
