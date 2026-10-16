#!/usr/bin/env node
/**
 * Der Projekt-Kontext der Persona — bis in den fertigen System-Prompt geprüft.
 *
 * ANLASS (gemessen 2026-10-16 im echten Profil-Lauf): in
 * `packages/persona/index.js` wurde `isAbsolute` benutzt, aber nie aus
 * `node:path` importiert. Der ReferenceError fiel in das try/catch des Blocks
 * und wurde zu einer Warnung:
 *
 *   [shinon-persona] Projekt-Kontext nicht lesbar (isAbsolute is not defined)
 *
 * Die Persona startete also OHNE den Projekt-Kontext — in JEDEM Lauf, weil das
 * Profil `projectContextPath: .shinon/project-context.md` setzt und damit genau
 * den relativen Zweig nimmt. Der Fehler war nur deswegen leise, weil eine
 * fehlende Datei und ein kaputter Import dieselbe Warnung ergaben.
 *
 * WARUM HIER UND NICHT AM FAKE-HOST: `persona-state.test.mjs` prüft das
 * Paketverhalten ohne node_modules und sieht nur die Abschnittsliste. DIESER
 * Test hängt dasselbe Bundle an den ECHTEN Dienst
 * `@deepseek-ai/dsh-system-prompt` aus der gepinnten Installation und liest den
 * zusammengebauten Prompt über dessen öffentliche Schnittstelle
 * (`assemble()` + `renderPrompt()`). Erst damit ist „der Inhalt landet im
 * System-Prompt" gemessen statt behauptet.
 *
 * Läuft mit `node --test`; braucht `dsh` im PATH (wie prompter-contract).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';

const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/persona/', import.meta.url));

const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');
const require = createRequire(join(root, 'package.json'));

/** Das Bundle isoliert laden, mit dem ECHTEN Schemastery der DSH-Installation. */
async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-persona-prompt-'));
  const dir = join(work, 'pkg');
  cpSync(PACKAGE_DIR, dir, { recursive: true });
  const shim = join(dir, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    join(shim, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-shim', type: 'module', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(shim, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href)};\n`);
  return import(pathToFileURL(join(dir, 'index.js')).href);
}

const bundle = await loadBundle();
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const systemPromptModule = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')).href);
const { default: SystemPrompt, renderPrompt } = systemPromptModule;

function quiet(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

/** Die Marker, an denen der Aufbau erkennbar ist — kurz und eindeutig. */
const IDENTITY_MARK = 'PERSONA-IDENTITY-MARKE';
const CONTEXT_MARK = 'PROJEKT-KONTEXT-MARKE';

const contextDir = mkdtempSync(join(tmpdir(), 'shinon-persona-prompt-ctx-'));
const contextFixture = (name, value) => {
  const file = join(contextDir, name);
  writeFileSync(file, value);
  return file;
};

/**
 * Den ECHTEN System-Prompt bauen: echter Dienst, echtes Bundle, echter Cordis
 * Root. Nur die abhängigen Dienste (Events, Scoring) fehlen — die sind
 * optional und ändern an diesem Abschnitt nichts.
 */
async function systemPromptWith(projectContextPath) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await quiet(() => ctx.plugin(bundle, {
    projectContextPath,
    identity: IDENTITY_MARK,
    // Die uebrigen Abschnitte bleiben aus: dieser Test misst EINEN Abschnitt.
    includeAugenhoehe: false,
    alwaysKnowIdentity: false,
  }));
  const assembly = await ctx.systemPrompt.assemble({});
  const prompt = quiet(() => renderPrompt(assembly));
  return { prompt, sections: assembly.sections.map((section) => section.name) };
}

test('Projekt-Kontext: der echte System-Prompt-Dienst traegt den Dateiinhalt — auch bei RELATIVEM Pfad', async () => {
  const file = contextFixture('relativ.md', `# Kontext\n${CONTEXT_MARK} gilt nur im Shinon-Projekt\n`);
  const { prompt, sections } = await systemPromptWith(relative(process.cwd(), file));

  assert.ok(sections.includes('shinon:project-context'), `Abschnitt fehlt (${sections.join(', ')})`);
  assert.ok(prompt.includes(CONTEXT_MARK), 'der Dateiinhalt steht im System-Prompt');
  assert.ok(prompt.includes(IDENTITY_MARK), 'und die Persona steht weiterhin daneben');
  // Der Kontext ist ein Zusatz HINTER der Persona, kein Ersatz.
  assert.ok(
    prompt.indexOf(IDENTITY_MARK) < prompt.indexOf(CONTEXT_MARK),
    'der Projekt-Kontext steht hinter der Identity',
  );
});

test('Projekt-Kontext: ein ABSOLUTER Pfad traegt denselben Inhalt in den Prompt', async () => {
  const file = contextFixture('absolut.md', `${CONTEXT_MARK}-ABSOLUT\n`);
  const { prompt } = await systemPromptWith(file);
  assert.ok(prompt.includes(`${CONTEXT_MARK}-ABSOLUT`), 'der Dateiinhalt steht im System-Prompt');
});

test('Projekt-Kontext: fehlende, leere oder nicht konfigurierte Datei laesst den Prompt ohne diesen Abschnitt', async () => {
  const cases = [
    ['fehlend', relative(process.cwd(), join(contextDir, 'gibt-es-nicht.md'))],
    ['leer', relative(process.cwd(), contextFixture('leer.md', '   \n\n'))],
    ['nicht konfiguriert', ''],
  ];
  for (const [name, path] of cases) {
    const { prompt, sections } = await systemPromptWith(path);
    assert.equal(sections.includes('shinon:project-context'), false, `${name}: kein Abschnitt`);
    assert.equal(prompt.includes(CONTEXT_MARK), false, `${name}: kein Kontext im Prompt`);
    assert.ok(prompt.includes(IDENTITY_MARK), `${name}: die Persona bleibt`);
  }
});
