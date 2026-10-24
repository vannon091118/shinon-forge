#!/usr/bin/env node
/**
 * Skill-Entdeckung durch den GEPINNTEN DSH — Ende zu Ende (Zug 7).
 *
 * Belegt, was niemand von Hand bauen muss:
 *   1. Der native Provider (`@deepseek-ai/dsh-skill-filesystem`, im Dienst
 *      `skills` des installierten DSH) entdeckt `<Projekt>/.agents/skills/<n>/SKILL.md`.
 *   2. Die Lernpruefung (`learning-review.js`) schreibt ueber den Skill-Writer
 *      eine neue Datei in genau diesen Root, nachdem Zuege abgeschlossen sind
 *      und das Modell einen belastbaren Ablauf erkannt hat.
 *   3. Der Provider sieht den neuen Skill beim naechsten Abruf des Katalogs.
 *      Die Zeit bis dahin wird GEMESSEN und ausgegeben, nicht behauptet.
 *
 * Ohne installierte DSH-Pakete (`node_modules`) laeuft der Test NICHT: er
 * meldet das sichtbar als Skip mit Grund. Ein Skip ist kein Erfolg.
 *
 * Das Modell ist ein Fake; der Test prueft Entdeckung und Sichtbarkeit, keine
 * Modellqualitaet. Laufen mit `node --test scripts/gate/tests/skill-discovery.test.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { waitFor } from './helpers/wait.mjs';

const repo = new URL('../../../', import.meta.url);
const reviewPath = new URL('packages/prompter/assets/learning-review.js', repo);
const writerPath = new URL('packages/prompter/assets/skill-lifecycle.js', repo);
const noteRulesPath = new URL('packages/prompter/assets/note-rules.json', repo);

let dsh = null;
let dshReason = '';
try {
  const cordis = await import('@deepseek-ai/cordis');
  const registry = await import('@deepseek-ai/dsh-skill');
  const filesystem = await import('@deepseek-ai/dsh-skill-filesystem');
  dsh = { Context: cordis.Context, SkillRegistry: registry.SkillRegistry, filesystem };
} catch (error) {
  dshReason = `DSH-Pakete nicht installiert (${error?.code ?? error?.message ?? 'Fehler'}) — npm ci ausfuehren`;
}

const GOOD = {
  name: 'entdeckter-skill',
  thema: 'entdeckung',
  description: 'Nutzen wenn eine Korrektur einen neuen Lernstoff zeigt, damit der Katalog ihn kennt.',
  bei: 'Eine Korrektur zeigt einen wiederverwendbaren Lernstoff',
  immer: 'den Lernstoff als Skill im Projekt festhalten',
  weil: 'der Katalog des Modells nur veroeffentlichte Skills kennt',
};

/** Die Antwort des Reviewers: ein Skill, mit Quelle aus dem Digest. */
const ANSWER = {
  decision: 'skill',
  reason: 'Der Zug zeigt einen wiederverwendbaren Ablauf.',
  sources: ['message:m1'],
  candidate: GOOD,
};
test('DSH entdeckt einen vom Lebenszyklus geschriebenen Skill im Projekt-Root', { skip: dsh === null ? dshReason : false }, async () => {
  const previousCwd = process.cwd();
  const work = mkdtempSync(join(tmpdir(), 'dsh-skill-discovery-'));
  const project = join(work, 'projekt');
  mkdirSync(join(project, '.git'), { recursive: true });
  mkdirSync(join(project, '.agents', 'skills', 'vorhanden'), { recursive: true });
  writeFileSync(join(project, '.agents', 'skills', 'vorhanden', 'SKILL.md'), '---\nname: vorhanden\ndescription: "Nutzen vorhanden fuer den Test."\n---\n\n# Vorhanden\n');
  process.chdir(project);

  const ctx = new dsh.Context();
  let lifecycle = null;
  try {
    ctx.plugin(dsh.SkillRegistry, {});
    ctx.plugin(dsh.filesystem, {
      dshHome: join(work, 'dsh-home'),
      agentsHome: join(work, 'agents-home'),
      includeDefaultRoots: true,
      watch: true,
    });

    // Die Plugins montiert Cordis asynchron: erst warten, bis der Dienst und der
    // Provider den vorhandenen Skill sehen (Bereitschaft, kein Raten).
    const ready = Boolean(await waitFor(async () => ctx.skills !== undefined && (await ctx.skills.list({ cwd: project })).some((skill) => skill.name === 'vorhanden'), { timeoutMs: 6000 }));
    assert.equal(ready, true, 'der Dienst skills und der Provider sind bereit');
    const before = await ctx.skills.list({ cwd: project });
    assert.ok(before.some((skill) => skill.name === 'vorhanden' && skill.source === 'project-agents'), 'der vorhandene Skill wird nativ entdeckt');

    // Der Reviewer schreibt ueber den Skill-Writer; der Fake liefert die Entscheidung.
    const { createLearningReview, loadLearningRules } = await import(pathToFileURL(reviewPath.pathname).href);
    const { createSkillWriter, loadLifecycleRules } = await import(pathToFileURL(writerPath.pathname).href);
    const noteRules = JSON.parse(readFileSync(noteRulesPath, 'utf8'));
    const skillRules = loadLifecycleRules();
    const base = loadLearningRules();
    const rules = {
      ...base,
      review: { ...base.review, nudgeTurns: 1, nudgeToolCalls: 0, cooldownMs: 0, maxPerSession: 4, timeoutMs: 4000, minEvidenceForAuto: 1 },
    };
    const llm = {
      stream() {
        return (async function* () {
          yield { type: 'text-delta', index: 0, text: JSON.stringify(ANSWER) };
        })();
      },
    };
    const lines = [];
    const quietLog = { log: (m) => lines.push(m), warn: (m) => lines.push(m) };
    const writer = createSkillWriter({ rules: skillRules, noteRules, root: project, log: { log: () => {}, warn: () => {} } });
    lifecycle = createLearningReview({
      ctx: { llm },
      config: { provider: 'p', model: 'm', skillWriteApproval: false, memoryWriteApproval: true, registryPath: '.shinon/learning-proposals.json', usagePath: '.shinon/skill-usage.json' },
      rules,
      skillRules,
      noteRules,
      writer,
      route: { provider: 'p', model: 'm' },
      workspaceRoot: project,
      log: quietLog,
    });

    const started = performance.now();
    lifecycle.observe({ event_type: 'message.received', session_id: 'probe' }, { data: { source: { kind: 'user' }, message: { id: 'm1' }, content: [{ type: 'text', text: 'Bitte pruefe das Gate.' }] } });
    lifecycle.observe({ event_type: 'turn.end', session_id: 'probe' }, { data: { reason: { kind: 'completed' }, turn: 1 } });
    // Gemessen wird der KATALOG-Pfad, den das Modell sieht: snapshot() mit Cache.
    // Dessen Ungueltigmachung kommt vom Datei-Watcher des Providers.
    let catalogComplete = false;
    const visible = Boolean(await waitFor(async () => {
      const snapshot = await ctx.skills.snapshot({ cwd: project });
      catalogComplete = snapshot.complete;
      return snapshot.skills.some((skill) => skill.name === GOOD.name);
    }, { timeoutMs: 6000 }));
    const elapsedMs = Math.round(performance.now() - started);
    assert.equal(visible, true, `der neue Skill muss im Katalog erscheinen; Log: ${lines.join(' | ')}`);
    assert.ok(lines.some((line) => line.includes('->')), 'der Reviewer hat den Skill ueber den Writer geschrieben');
    assert.equal(catalogComplete, true, 'die Entdeckung ist vollstaendig (kein Teilkatalog)');
    console.log(`[skill-discovery] neuer Skill im Katalog (snapshot) sichtbar nach ${elapsedMs} ms`);

    const loaded = await ctx.skills.get(GOOD.name, { cwd: project });
    assert.ok(loaded, 'der Skill laesst sich laden');
    assert.match(loaded.content, /den Lernstoff als Skill im Projekt festhalten/);
    assert.equal(loaded.invocation.modelInvocable, true, 'der Skill ist fuer das Modell aufrufbar');
    assert.equal(loaded.provider, 'filesystem', 'entdeckt vom nativen Provider');
  } finally {
    lifecycle?.dispose();
    process.chdir(previousCwd);
    rmSync(work, { recursive: true, force: true });
  }
});
