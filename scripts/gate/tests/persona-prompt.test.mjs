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
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { quiet } from './helpers/console.mjs';

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
  provideSeamCore(dir);
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
async function systemPromptWith(projectContextPath, overrides = {}, { sessionCwd, prepare } = {}) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  // Eine Ablage VOR dem Bundle: der echte Context muss sie ueber `get` liefern.
  if (typeof prepare === 'function') prepare(ctx);
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

test('Selbstmodell: belegte Spuren stehen im ECHTEN System-Prompt — ohne Ablage bleibt der Abschnitt leer', async () => {
  // Der Weg, den der Nutzer sieht: Ablage -> Persona -> echter
  // System-Prompt-Dienst -> gerenderter Prompt. Eine registrierte Sektion ohne
  // Text waere nur die Haelfte; hier steht der Satz mit Zahl und Grenze.
  const model = {
    contract: 'shinon.self-model/v1',
    version: 1,
    runs: 4,
    accepted: 3,
    rejected: 1,
    unavailable: 0,
    errors: 0,
    reasons: { 'zu breit': 3 },
    classes: { auftrag: 4 },
    questions: { 'welcher Workspace?': 2 },
    firstSeen: '2026-10-18T20:00:00.000Z',
    lastSeen: '2026-10-18T21:00:00.000Z',
  };
  const { prompt } = await systemPromptWith('', {}, {
    sessionCwd: REPO_ROOT,
    prepare: (ctx) => ctx.provide(bundle.INDEX_STORE_SERVICE, {
      contract: bundle.INDEX_STORE_CONTRACT,
      load: () => ({ ok: true, state: { memos: [{ id: bundle.SELF_MODEL_MEMO_ID, model }] } }),
      save: () => ({ ok: true, rows: 1 }),
    }),
  });
  assert.match(prompt, /Läufe: 4 \(3 angenommen, 1 verworfen/);
  assert.match(prompt, /Wiederkehrende Grenze: zu breit \(3×\)/);
  assert.match(prompt, /Offene Frage \(2×\): welcher Workspace\?/);

  // Gegenprobe: dieselbe Lage ohne Ablage — kein erfundener Satz.
  const ohne = await systemPromptWith('', {}, { sessionCwd: REPO_ROOT });
  assert.equal(ohne.prompt.includes('Selbstmodell'), false, 'ohne Beleg kein Selbstmodell im Prompt');
});

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
    const { prompt, withText } = await systemPromptWith(path);
    // Der Abschnitt ist ein Getter (Sitzungs-Scope): registriert, aber ohne Text.
    assert.equal(withText.some((section) => section.name === 'shinon:project-context'), false, `${name}: kein Text`);
    assert.equal(prompt.includes(CONTEXT_MARK), false, `${name}: kein Kontext im Prompt`);
    assert.ok(prompt.includes(IDENTITY_MARK), `${name}: die Persona bleibt`);
  }
});

test('Projektscope: OHNE deklarierten Root entscheidet die Sitzung — nicht der Boot', async () => {
  // Der gemessene Ausfall 2026-10-18: das Profil setzt keinen `workspaceRoot`,
  // also brach der Mount ab und die Persona stand in keinem einzigen Prompt.
  // Jetzt gilt: Sitzung im Shinon-Repo → Persona; Sitzung fremd → nichts.
  const eigen = await systemPromptWith('', { workspaceRoot: '' }, { sessionCwd: REPO_ROOT });
  assert.ok(eigen.prompt.includes(IDENTITY_MARK), 'Sitzung im Repo bekommt die Identity');

  const fremd = mkdtempSync(join(tmpdir(), 'shinon-prompt-ohne-root-'));
  writeFileSync(join(fremd, 'package.json'), JSON.stringify({ name: 'fremdes-projekt' }));
  const other = await systemPromptWith('', { workspaceRoot: '' }, { sessionCwd: fremd });
  assert.equal(other.prompt.includes(IDENTITY_MARK), false, 'fremde Sitzung bleibt stumm');
  assert.deepEqual(
    other.withText.filter((section) => section.name.startsWith('shinon:')).map((section) => section.name),
    [],
    'kein Shinon-Text in fremder Sitzung',
  );
});

test('Langzeitgedächtnis: Erinnerung und angenommene Selbstauflage stehen im ECHTEN System-Prompt', async () => {
  // Der Beweis, den die Anfrage verlangt: nicht „die Persona haette Zugriff",
  // sondern der gerenderte Prompt traegt Identitaet, Erinnerung und Auflage.
  const memory = {
    contract: 'shinon.persona-memory/v1',
    version: 1,
    seq: 4,
    firstSeen: '2026-10-18T20:00:00.000Z',
    lastSeen: '2026-10-19T02:00:00.000Z',
    entries: [
      {
        id: 'limit|global|prompter:nojson',
        kind: 'limit',
        scope: 'global',
        subject: 'prompter:nojson',
        detail: 'NO_JSON',
        evidence: 3,
        strength: 3,
        firstSeen: '2026-10-18T20:00:00.000Z',
        lastSeen: '2026-10-19T02:00:00.000Z',
        seq: 3,
      },
      {
        id: 'preference|global|korrektur:kurzer',
        kind: 'preference',
        scope: 'global',
        subject: 'korrektur:kurzer',
        detail: 'nicht so lang',
        evidence: 2,
        strength: 2,
        firstSeen: '2026-10-18T20:00:00.000Z',
        lastSeen: '2026-10-19T02:00:00.000Z',
        seq: 4,
      },
    ],
    proposals: [
      {
        id: 'p:limit|global|prompter:nojson',
        kind: 'commitment',
        claim: 'Bei "prompter:nojson" zuerst die Ursache prüfen, bevor der nächste Lauf startet.',
        evidence: 3,
        status: 'accepted',
        createdAt: '2026-10-19T01:00:00.000Z',
        decidedAt: '2026-10-19T02:00:00.000Z',
        source: 'limit|global|prompter:nojson',
      },
    ],
  };

  const { prompt, sections } = await systemPromptWith('', {}, {
    sessionCwd: REPO_ROOT,
    prepare: (ctx) => ctx.provide(bundle.INDEX_STORE_SERVICE, {
      contract: bundle.INDEX_STORE_CONTRACT,
      load: (namespace) => ({
        ok: true,
        state: { memos: namespace === bundle.MEMORY_NAMESPACE ? [{ id: bundle.MEMORY_MEMO_ID, memory }] : [] },
      }),
      save: () => ({ ok: true, rows: 1 }),
    }),
  });

  assert.ok(sections.includes('shinon:identity'), 'Identitaet fehlt');
  assert.ok(sections.includes('shinon:memory'), 'Gedaechtnis-Abschnitt fehlt');
  assert.ok(sections.includes('shinon:commitments'), 'Selbstauflagen-Abschnitt fehlt');
  assert.ok(prompt.includes(IDENTITY_MARK), 'Identitaet steht nicht im Prompt');
  assert.match(prompt, /## Erinnerungen \(belegt, nicht behauptet\)/);
  assert.match(prompt, /Grenze: prompter:nojson \(3×\) — NO_JSON/);
  assert.match(prompt, /Korrektur: korrektur:kurzer \(2×\) — nicht so lang/);
  assert.match(prompt, /## Selbstauflagen \(geprüft und angenommen\)/);
  assert.ok(
    prompt.indexOf('## Erinnerungen') < prompt.indexOf('## Selbstauflagen'),
    'Erlebnisse stehen vor den daraus abgeleiteten Auflagen',
  );
});

// ── Der Arbeitsablauf (shinon:workflow) ──────────────────────────────────────
//
// Der Baustein beantwortet eine Frage, die die acht Haltungsabschnitte nicht
// beantworten: WIE hier gearbeitet wird — die Reihenfolge der Schritte und der
// Umgang mit Zweifel, Blockern, Fehlern und Abbruch. Die Haltung steht weiterhin
// in EPISTEMIC, DISCIPLINE und REPORT; der Ablauf VERWEIST auf sie.

test('Workflow: der Ablauf steht im gerenderten System-Prompt — mit den fuenf Schritten in Reihenfolge', async () => {
  // Der Weg, den das Modell sieht: Boot -> gerenderter System-Prompt.
  const { prompt, sections, withText } = await systemPromptWith('');
  assert.ok(sections.includes('shinon:workflow'), `Abschnitt fehlt (${sections.join(', ')})`);
  const abschnitt = withText.find((section) => section.name === 'shinon:workflow');
  assert.ok(abschnitt, 'der Workflow-Abschnitt traegt keinen Text');
  const text = String(abschnitt.text);
  assert.match(text, /## Der Arbeitsablauf/);
  assert.match(prompt, /## Der Arbeitsablauf/);
  // Die REIHENFOLGE ist der Inhalt des Bausteins: LAGE, PLAN, HANDELN, PRÜFEN,
  // BERICHTEN. Sie wird am Abschnittstext geprüft, nicht am ganzen Prompt — dort
  // stuenden dieselben Woerter aus anderen Abschnitten dazwischen.
  const reihenfolge = ['1. LAGE', '2. PLAN', '3. HANDELN', '4. PRÜFEN', '5. BERICHTEN'];
  let position = -1;
  for (const schritt of reihenfolge) {
    const gefunden = text.indexOf(schritt);
    assert.ok(gefunden > position, `${schritt} steht nicht nach dem vorherigen Schritt`);
    position = gefunden;
  }
  // Die Sonderfaelle, fuer die es vorher keinen Abschnitt gab.
  for (const sonderfall of ['ZWEIFEL', 'BLOCKER', 'FEHLER', 'ABBRUCH']) {
    assert.ok(text.includes(sonderfall), `der Sonderfall ${sonderfall} fehlt`);
  }
  // Die Platzierung: der Ablauf steht hinter der Identitaet und vor dem Zustand
  // und dem Bericht — er ist der Weg, nicht die Lage.
  assert.ok(prompt.indexOf(IDENTITY_MARK) < prompt.indexOf('## Der Arbeitsablauf'), 'der Ablauf steht nicht nach der Identitaet');
  assert.ok(prompt.indexOf('## Der Arbeitsablauf') < prompt.indexOf('## Persona-Zustand'), 'der Ablauf steht nicht vor dem Zustand');
});

test('Workflow: der Baustein verweist auf die Haltung, statt sie zu wiederholen', async () => {
  const { withText } = await systemPromptWith('');
  const abschnitt = withText.find((section) => section.name === 'shinon:workflow');
  const text = String(abschnitt.text);
  // Die Verweise SIND da: der Text benennt die Abschnitte, statt sie zu kopieren.
  for (const verweis of ['Zuständigkeit, Parallelität, Git', 'Epistemischen Haltung', 'Berichtsstil', 'Blockiert heißt nicht Endstation']) {
    assert.ok(text.includes(verweis), `der Verweis auf "${verweis}" fehlt`);
  }
  // Und die Listen der Haltung stehen NICHT im Ablauf: sonst stuende derselbe
  // Text zweimal im Prompt — und der Prompt ist das teuerste Gut der Persona.
  for (const satz of [
    'Bleib in deinem Auftrag',
    'Akzeptiere keine Behauptung ohne Beleg',
    'Widerspruch ist ein normaler Zustand',
    'Kurze Endberichte',
  ]) {
    assert.ok(!text.includes(satz), `der Ablauf wiederholt die Haltung: "${satz}"`);
  }
});

test('Workflow: in einem fremden Workspace bleibt der Ablauf leer', async () => {
  // Ein fremder WORKSPACE: der Mount bricht ab — es wird gar kein Abschnitt
  // registriert, also steht der Ablauf auch nicht im Prompt.
  const fremd = mkdtempSync(join(tmpdir(), 'shinon-prompt-workflow-fremd-'));
  writeFileSync(join(fremd, 'package.json'), JSON.stringify({ name: 'fremdes-projekt' }));
  const fremdes = await systemPromptWith('', { workspaceRoot: fremd });
  assert.equal(fremdes.sections.includes('shinon:workflow'), false, 'der Workflow ist im fremden Workspace registriert');
  assert.equal(fremdes.prompt.includes('## Der Arbeitsablauf'), false, 'der Ablauf steht im fremden Prompt');

  // Eine fremde SITZUNG unter Shinon-Boot: der Abschnitt IST registriert (der
  // Ablauf gilt in jedem Modus), traegt aber keinen Text — `gated` gibt '' zurueck.
  // Genau diese Trennung ist die Zusage: vorhanden, aber stumm.
  const sitzung = await systemPromptWith('', {}, { sessionCwd: fremd });
  assert.ok(sitzung.sections.includes('shinon:workflow'), 'der Abschnitt fehlt — er muss auch fremd registriert sein');
  assert.deepEqual(
    sitzung.withText.filter((section) => section.name === 'shinon:workflow'),
    [],
    'der Workflow traegt in fremder Sitzung Text',
  );
  assert.equal(sitzung.prompt.includes('## Der Arbeitsablauf'), false, 'der Ablauf steht im fremden Prompt');
});

test('Workflow: der Renderer gibt einen leeren Text fuer einen leeren Auftrag', async () => {
  // Der Kern ist importfrei — er laeuft ohne node_modules.
  const kern = await import(new URL('../../../packages/persona/assets/workflow.js', import.meta.url).href);
  assert.equal(kern.renderWorkflow(''), '');
  assert.equal(kern.renderWorkflow('   '), '');
  assert.equal(kern.renderWorkflow(null), '');
  assert.equal(kern.renderWorkflow(undefined), '');
  // Ein konfigurierter Text ohne Ueberschrift bekommt die des Bausteins; mit
  // Ueberschrift bleibt er unveraendert — so liest sich jeder Abschnitt gleich.
  const ohne = kern.renderWorkflow('Mein eigener Ablauf.');
  assert.match(ohne, /^## Der Arbeitsablauf/);
  assert.match(ohne, /Mein eigener Ablauf\./);
  const mit = '## Mein Ablauf\n\nText.';
  assert.equal(kern.renderWorkflow(mit), mit);
});
