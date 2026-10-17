#!/usr/bin/env node
/**
 * Der Projekt-Kontext der Persona — bis in den fertigen System-Prompt geprüft.
 *
 * ANLASS (gemessen 2026-10-16 im echten Profil-Lauf): in
 * `packages/persona/index.js` wurde `isAbsolute` benutzt, aber nie aus
 * `node:path` importiert. Der ReferenceError fiel in das try/catch des Blocks
 * und wurde zu einer Warnung:
 *
 * → Kanon: docs/COMMENT-KANON.md#k-97fdc6865b4a
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
/** Die Repo-Wurzel — der eine erlaubte Persona-Scope (die Persona spricht nur benannt). */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

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
async function systemPromptWith(projectContextPath, overrides = {}, { sessionCwd } = {}) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await quiet(() => ctx.plugin(bundle, {
    projectContextPath,
    workspaceRoot: REPO_ROOT,
    ...overrides,
    identity: IDENTITY_MARK,
    // Die uebrigen Abschnitte bleiben aus: dieser Test misst EINEN Abschnitt.
    includeAugenhoehe: false,
    alwaysKnowIdentity: false,
  }));
  // Eine echte Sitzung kommt über `agent/pre-step`; der Hook umschließt den
  // Schritt, also auch die Assembly. Ohne Sitzung bleibt der direkte Weg (Boot).
  const assembly = sessionCwd === undefined
    ? await ctx.systemPrompt.assemble({})
    : await ctx.waterfall(ctx, 'agent/pre-step', { agent: { session: { header: { cwd: sessionCwd } } } }, () =>
        ctx.systemPrompt.assemble({}),
      );
  const prompt = quiet(() => renderPrompt(assembly));
  // `sections` ist die Registrierung; `withText` das, was wirklich Text beiträgt.
  const withText = assembly.sections.filter((section) => String(section.text).trim() !== '');
  return { prompt, sections: assembly.sections.map((section) => section.name), withText };
}

test('Projekt-Kontext: der echte System-Prompt-Dienst traegt den Dateiinhalt — auch bei RELATIVEM Pfad', async () => {
  const file = contextFixture('relativ.md', `# Kontext\n${CONTEXT_MARK} gilt nur im Shinon-Projekt\n`);
  const { prompt, sections } = await systemPromptWith(relative(REPO_ROOT, file));

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

test('Projektscope: ein fremder Workspace bekommt weder Persona noch Projekt-Kontext in den Prompt', async () => {
  // Der Nutzerbefund vom 13.–17.10.: Shinon-internes Material landete in fremden
  // Projekten. Hier steht der Host-CWD auf diesem Repo (der Test laeuft darin) und
  // der Workspace ist ein anderes Projekt — genau die Lage, in der das alte
  // `process.cwd()` die Persona freischaltete.
  const fremd = mkdtempSync(join(tmpdir(), 'shinon-prompt-fremd-'));
  writeFileSync(join(fremd, 'package.json'), JSON.stringify({ name: 'fremdes-projekt' }));
  const file = contextFixture('fremd-kontext.md', `${CONTEXT_MARK}-FREMD\n`);

  const { prompt, sections } = await systemPromptWith('.shinon/project-context.md', {
    workspaceRoot: fremd,
    includeAugenhoehe: false,
    alwaysKnowIdentity: false,
  });
  // Nur UNSERE Abschnitte zaehlen: `harness:identity` und `deployment:persona-*`
  // kommen vom System-Prompt-Dienst selbst und sind nicht Shinon-Inhalt.
  const eigene = sections.filter((name) => name.startsWith('shinon:'));
  assert.deepEqual(eigene, [], `kein Shinon-Abschnitt im Fremdprojekt (${eigene.join(', ')})`);
  assert.equal(prompt.includes(IDENTITY_MARK), false, 'keine Identity im fremden Prompt');
  assert.equal(prompt.includes(CONTEXT_MARK), false, 'kein Projekt-Kontext im fremden Prompt');
  // Und der Pfad wird auch nicht gegen den Host-CWD aufgeloest: die Fixture liegt
  // im Repo, wird aber nicht gelesen.
  assert.ok(file.startsWith(contextDir));
});

test('Projektscope: eine fremde SITZUNG unter Shinon-Boot bekommt keine Persona-Abschnitte', async () => {
  // Der P0 aus Batch 0: der Boot sagt „Shinon", die Sitzung arbeitet woanders.
  // `SHINON_WORKSPACE_ROOT` gilt prozessweit; entscheidend ist der CWD der Sitzung.
  const fremd = mkdtempSync(join(tmpdir(), 'shinon-prompt-session-fremd-'));
  writeFileSync(join(fremd, 'package.json'), JSON.stringify({ name: 'fremdes-projekt' }));

  const foreign = await systemPromptWith('.shinon/project-context.md', {}, { sessionCwd: fremd });
  const eigene = foreign.withText.filter((section) => section.name.startsWith('shinon:')).map((section) => section.name);
  assert.deepEqual(eigene, [], `kein Shinon-Abschnitt mit Text in fremder Sitzung (${eigene.join(', ')})`);
  assert.equal(foreign.prompt.includes(IDENTITY_MARK), false, 'keine Identity in fremder Sitzung');
  assert.equal(foreign.prompt.includes(CONTEXT_MARK), false, 'kein Projekt-Kontext in fremder Sitzung');

  // Gegenprobe: dieselbe Boot-Freigabe, Sitzung IM Repo — die Persona bleibt.
  const own = await systemPromptWith('.shinon/project-context.md', {}, { sessionCwd: REPO_ROOT });
  assert.ok(own.sections.includes('shinon:identity'), `Abschnitt fehlt (${own.sections.join(', ')})`);
  assert.ok(own.prompt.includes(IDENTITY_MARK));
});

test('Projekt-Kontext: fehlende, leere oder nicht konfigurierte Datei laesst den Prompt ohne diesen Abschnitt', async () => {
  const cases = [
    ['fehlend', relative(REPO_ROOT, join(contextDir, 'gibt-es-nicht.md'))],
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
