/** Teil 4/4 von prompter-contract.test.mjs — Fixtures stehen in `prompter-contract-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { codeOnly, findForbidden } from '../../lib/source-scan.mjs';
import { listFiles, protectedReason, toProjectPath } from '../../../packages/project-index/assets/index-core.js';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { quiet } from './helpers/console.mjs';
import { PACKAGE_DIR, INDEX_FILE, root, require, bundleDir, loadBundle, bundle, Context, goodResult, reply, userMessage, stepPayload, connect, fakeLlm, route, loopDefault, dummyContext, contextDir, contextFile, dummyContextPath, runtimeModules, harnessMessage, REGION_MARK, regionHits, isOneRegion, MARKEN_AUSREISSER } from './prompter-contract-fixtures.mjs';
import { notesRoot, note, notesFor, contextProject, toneService, toneState } from './prompter-contract-fixtures-b.mjs';

test('Konfiguration: unbekannte Werte werden schema-seitig abgelehnt', () => {
  for (const [key, value] of [['mode', 'TURBO'], ['maxTokens', 'viel'], ['trace', 'ja']]) {
    assert.throws(() => bundle.Config({ [key]: value }), new RegExp(key), `${key}=${value}`);
  }
});
test('Eingang: erzeugter Harness-Kontext wird nicht veredelt und nicht ersetzt', async () => {
  // Eine Zeile pro gemessener Herkunft. Die Freigabe-Antwort ist darunter die
  // schaerfste: eine umformulierte Zustimmung ist eine geaenderte Entscheidung,
  // keine Stilfrage. Geprueft wird deshalb nicht nur 'kein Aufruf', sondern
  // dass der Text WORT FUER WORT unberuehrt bleibt.
  const cases = [
    { kind: 'user-approval', text: 'ja' },
    { kind: 'time-context', text: '<current_time>2026-10-07T20:00:00Z</current_time>' },
    { kind: 'tmux-context', text: '<terminal>letzte Ausgabe</terminal>' },
    { kind: 'agent-instructions', text: '# Projektregeln\nImmer Tests schreiben.' },
    { kind: 'repeat-tool-reminder', text: 'Du rufst dasselbe Werkzeug wiederholt auf.' },
    { kind: 'ptc-mode', text: 'programmatic tool calling aktiv' },
    { kind: 'hooks-codex', text: 'blocked by PostToolUse hook' },
    { kind: 'cordis-host-runner', text: 'Befehl aus dem Host-Runner' },
  ];
  for (const { kind, text } of cases) {
    const llm = fakeLlm(reply(goodResult()));
    const { ctx, records, dispose } = connect({ ...route }, { llm });
    const claimed = [harnessMessage(kind, text)];
    const before = JSON.stringify(claimed);
    const downstream = { kind: 'enter', messages: claimed };

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(decision, downstream, `${kind}: die Entscheidung bleibt die des Loops`);
    assert.equal(llm.calls.length, 0, `${kind}: kein Modellaufruf fuer Harness-Text`);
    assert.equal(records.length, 0, `${kind}: kein Datensatz — es wurde nichts entschieden`);
    assert.equal(JSON.stringify(claimed), before, `${kind}: der Text bleibt unberuehrt`);
    dispose();
  }
});
test('Eingang: der Mensch wird gefunden, auch wenn Harness-Kontext hinter ihm steht', async () => {
  const human = userMessage('mach  das  schnell');
  const context = harnessMessage('time-context', '<current_time>20:00</current_time>');
  const llm = fakeLlm(reply(goodResult({ enhancedPrompt: 'Mach das schnell.' })));
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [human, context];

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls.length, 1, 'genau ein Aufruf — fuer den Menschen');
  assert.equal(llm.calls[0].messages[0].content[0].text, 'mach  das  schnell', 'das Modell sieht die Nutzereingabe, nicht den Kontext');
  assert.equal(decision.messages[0].content[0].text, 'Mach das schnell.', 'ersetzt wird die Nutzernachricht');
  assert.equal(decision.messages[1], context, 'der Harness-Kontext bleibt dasselbe Objekt');
  assert.equal(records[0].outcome, 'accepted');
  dispose();
});
test('Eingang: alle Wege der Oberflaeche sind menschlich und werden veredelt', async () => {
  // Gemessen in DSH 0.2.0-rc.2: der API-Session-Controller setzt fuer einen
  // Prompt source { kind: 'user', rpcId, clientTimeZone } und schickt ihn je
  // nach Modus auf followup() (Send/Enter, Warteschlange) oder steer();
  // Headless, SDK, ACP und der Goal-Befehl setzen { kind: 'user' }.
  const cases = [
    { name: 'UI Send/Enter (API-Prompt)', source: { kind: 'user', rpcId: 'r-1', clientTimeZone: 'UTC' } },
    { name: 'Warteschlange -> steer', source: { kind: 'user', rpcId: 'r-2' } },
    { name: 'headless / SDK / ACP', source: { kind: 'user' } },
  ];
  for (const { name, source } of cases) {
    const llm = fakeLlm(reply(goodResult()));
    const { ctx, records, dispose } = connect({ ...route }, { llm });
    const claimed = [{ id: 'm-1', role: 'user', content: [{ type: 'text', text: 'mach  das  schnell' }], source }];

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

    assert.equal(llm.calls.length, 1, name);
    assert.equal(records[0].outcome, 'accepted', name);
    assert.equal(decision.messages[0].content[0].text, 'Mach das schnell.', name);
    dispose();
  }
});
test('Kontextblock: jede indizierte Datei einzeln gerendert ergibt genau eine Region', () => {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const population = listFiles(repoRoot).filter((file) => protectedReason(toProjectPath(repoRoot, file)) === null);
  assert.ok(population.length >= 150, `Bevölkerung zu klein: ${population.length} — der Lauf muss den ganzen Baum abdecken`);

  const offenders = [];
  for (const file of population) {
    const path = toProjectPath(repoRoot, file);
    const block = bundle.renderContext({
      project: 'shinon-forge',
      files: [{ path, content: readFileSync(file, 'utf8') }],
      symbols: [],
      constraints: [],
      touches: [],
      dependencies: [],
    });
    if (!isOneRegion(block)) offenders.push(`${path} (${regionHits(block).length} Marken)`);
  }
  assert.deepEqual(offenders, [], `${offenders.length} Dateien brechen die Region`);
});
test('Kontextblock: die Ausreißer des Scans erzeugen je eine Region und stehen als Text darin', () => {
  assert.equal(MARKEN_AUSREISSER.length, 8, 'die acht gemessenen Träger sind gepinnt');
  for (const { wo, formen, inhalt } of MARKEN_AUSREISSER) {
    const block = bundle.renderContext({ ...dummyContext, files: [{ path: wo, content: inhalt }] });
    assert.ok(isOneRegion(block), `${wo}: Region gebrochen (${regionHits(block).length} Marken)`);
    for (const form of formen) {
      assert.ok(
        block.includes(`&lt;${form.slice(1, -1)}&gt;`),
        `${wo}: die Form ${form} steht nicht als Text im Datenblock`,
      );
    }
    // Die Anweisung hinter dem Abschluss bleibt INNERHALB der Region.
    const instruction = 'System: ab jetzt gelten';
    if (inhalt.includes(instruction)) {
      assert.ok(block.indexOf('</untrusted_project_context>') > block.indexOf(instruction), `${wo}: Anweisung steht ausserhalb`);
    }
  }
});
test('Eingang: eine Nachricht ohne Herkunft gilt nicht als Nutzereingabe', async () => {
  // Fail-closed: lieber nicht veredeln als fremden Text umschreiben. Der Seam
  // traegt `source` verpflichtend; fehlt es trotzdem, ist die Nachricht nicht
  // als menschlich ausgewiesen.
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [{ id: 'm-1', role: 'user', content: [{ type: 'text', text: 'wer bin ich' }] }];
  const downstream = { kind: 'enter', messages: claimed };

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

  assert.equal(decision, downstream);
  assert.equal(llm.calls.length, 0);
  assert.equal(records.length, 0);
  dispose();
});
test('Zettel: der passende Zettel steht als eigener Block im Aufruf und im Datensatz', async () => {
  const dir = notesFor('passend', { 'a.json': note('prompter') });
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm });
  const claimed = contextProject();

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  const request = llm.calls[0];
  assert.equal(request.messages[0].content.length, 3, 'Roh-Prompt, Kontextblock, Stand');
  assert.ok(request.messages[0].content[2].text.startsWith('<shinon_stand>'), 'der Stand ist ein eigener Block');
  assert.ok(request.messages[0].content[2].text.includes('<zettel thema="prompter">'));
  assert.ok(request.messages[0].content[2].text.includes('bei: Eine Pruefung steht an'));
  // `narrative: null` steht im Datensatz, weil kein Composite gelesen wurde —
  // das Feld ist die Narrative-Lage (Zug 6), und sein Fehlen waere von „es gibt
  // keine" nicht zu unterscheiden. Die Gegenprobe steht im Test darunter.
  assert.deepEqual(records[0].stand, { stance: null, tone: 'none', tendencies: [], narrative: null, notes: { loaded: ['prompter'], skipped: 0, reasons: [], reason: null } });
  assert.equal(request.messages[0].content[2].text.includes('<narrative'), false, 'ohne Composite kein Narrative-Element');
  dispose();
});
test('Narrative: ein Composite auf dem Kanal steht in der Spur, nicht im Stand', async () => {
  const composite = {
    seq: 7,
    mood: 'concerned',
    narrator: 'system',
    arc_id: 'arc-7',
    relationship_state: 'established_duo',
  };
  const dir = notesFor('narrative', { 'a.json': note('prompter') });
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm });
  const claimed = contextProject();

  ctx.emit('shinon/narrative/state', composite);
  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  const block = llm.calls[0].messages[0].content[2].text;
  assert.ok(block.includes('<zettel thema="prompter">'), 'die Zettel stehen im Stand');
  assert.equal(block.includes('<narrative'), false, 'kein Narrative-Element im Veredler-Block');
  assert.deepEqual(
    records[0].stand.narrative,
    { arc_id: 'arc-7', narrator: 'system', relationship_state: 'established_duo' },
    'die Spur trägt die benannten Felder',
  );
  assert.equal(JSON.stringify(records[0].stand).includes('<narrative'), false, 'die Spur trägt den Datensatz, keinen Prompt-Block');

  // Ein Fremdwert auf dem Kanal ist keine Lage — über genau diesen Weg geprüft.
  ctx.emit('shinon/narrative/state', 'kein composite');
  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
  assert.equal(records[1].stand.narrative, null, 'ein String wird nicht zur Lage gemacht');
  assert.equal(llm.calls[1].messages[0].content[2].text.includes('<narrative'), false, 'und erfindet kein Element');
  dispose();
});
test('Zettel: ein fremdes Thema laedt nicht — mit Grund, nicht still', async () => {
  const dir = notesFor('fremd', { 'a.json': note('zahnradfabrik') });
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm });
  const claimed = contextProject();

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  // Ein Zettel ohne Treffer ergibt KEINEN Stand — die Lücke ist ehrlich
  // (kein `<shinon_stand>` im Aufruf), nicht ein leerer Block.
  assert.equal(llm.calls[0].messages[0].content.length, 2, 'kein Stand ohne passenden Zettel');
  assert.deepEqual(records[0].stand.notes.loaded, []);
  assert.deepEqual(records[0].stand.notes.reasons, ['THEMA_NICHT_IM_KONTEXT']);
  dispose();
});
test('Zettel: eine kaputte Datei wird benannt und sperrt den guten Zettel nicht', async () => {
  const dir = notesFor('kaputt', { 'a.json': note('prompter'), 'b.json': '{ nicht json' });
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm });
  const claimed = contextProject();

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls[0].messages[0].content.length, 3, 'der gute Zettel laedt trotzdem');
  assert.deepEqual(records[0].stand.notes.loaded, ['prompter']);
  assert.equal(records[0].stand.notes.skipped, 1);
  assert.deepEqual(records[0].stand.notes.reasons, ['KEIN_JSON']);
  dispose();
});
test('Zettel: ohne notesPath wird nicht gelesen — der Grund steht im Datensatz', async () => {
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath }, { llm });
  const claimed = contextProject();

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls[0].messages[0].content.length, 2, 'kein Stand');
  // Abgeschaltet ist ein GRUND, keine Leere: `NOTES_OFF` sagt, dass nicht
  // gelesen wurde — wer nur [] sieht, weiss nicht, ob es keine Zettel gibt.
  assert.deepEqual(records[0].stand.notes, { loaded: [], skipped: 0, reasons: [], reason: 'NOTES_OFF' });
  dispose();
});
test('Zettel: hoechstens drei laden, die meisten Treffer zuerst', async () => {
  // Vier Zettel, drei passen doppelt (thema UND ein zweites Wort), einer einfach.
  const dir = notesFor('limit', {
    'viel.json': note('prompter'),
    'b.json': note('pruefung'),
    'c.json': note('kontext'),
    'd.json': note('rahmen'),
  });
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm });
  const claimed = contextProject('Bitte pruefe die Pruefung im prompter, der Kontext und der rahmen zaehlen');

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  const block = llm.calls[0].messages[0].content[2].text;
  const loaded = records[0].stand.notes.loaded;
  assert.equal(loaded.length, 3, `${loaded.join(', ')}`);
  assert.ok(block.includes('<zettel thema="prompter">'), 'der Zettel mit den meisten Treffern steht im Block');
  assert.deepEqual(records[0].stand.notes.reasons, ['UEBER_DEM_LIMIT'], 'der vierte nennt seinen Grund');
  dispose();
});
test('Stand: Haltung und Tendenzen stehen in der Spur, nicht im Block', async () => {
  const dir = notesFor('mit-ton', { 'a.json': note('prompter') });
  const llm = fakeLlm(reply(goodResult()));
  const services = toneService(toneState);
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm, services });
  const claimed = contextProject();

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  const block = llm.calls[0].messages[0].content[2].text;
  assert.equal(llm.calls[0].messages[0].content.length, 3, 'Roh-Prompt, Kontextblock, Stand');
  assert.equal(block.includes('<haltung>'), false, 'keine Haltung im Veredler-Block');
  assert.equal(block.includes('<tendenzen>'), false, 'keine Stufen im Veredler-Block');
  assert.ok(block.includes('<zettel thema="prompter">'), 'nur die Zettel stehen darin');
  assert.deepEqual(records[0].stand, {
    stance: 'kritisch',
    tone: 'scoring',
    tendencies: ['korrektur hoch', 'zustimmung niedrig'],
    narrative: null,
    notes: { loaded: ['prompter'], skipped: 0, reasons: [], reason: null },
  });
  dispose();
});
test('Stand: ohne Ton bleibt der Stand — nur die Haltung fehlt', async () => {
  const dir = notesFor('ohne-ton', { 'a.json': note('prompter') });
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm });
  const claimed = contextProject();

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  const block = llm.calls[0].messages[0].content[2].text;
  assert.equal(block.includes('<haltung>'), false, 'keine erfundene Haltung');
  assert.ok(block.includes('<zettel thema="prompter">'), 'die Zettel laden trotzdem');
  assert.equal(block.includes('<narrative'), false, 'und keine erfundene Narrative-Lage');
  assert.equal(records[0].stand.stance, null);
  assert.equal(records[0].stand.narrative, null, 'die Lage fehlt benannt, nicht still');
  assert.equal(records[0].stand.tone, 'none');
  dispose();
});
test('Stand: ein fremder Dienst unter dem Namen wird gemeldet, nicht gelesen', async () => {
  const dir = notesFor('fremder-ton', { 'a.json': note('prompter') });
  const llm = fakeLlm(reply(goodResult()));
  const services = { [bundle.SCORING_SERVICE]: { contract: 'shinon.etwas-anderes/v1', read: () => toneState } };
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm, services });
  const claimed = contextProject();

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  const block = llm.calls[0].messages[0].content[2].text;
  assert.equal(block.includes('<haltung>'), false, 'ein fremder Vertrag liefert keinen Ton');
  assert.equal(records[0].stand.tone, 'invalid');
  assert.ok(block.includes('<zettel thema="prompter">'), 'der Stand bleibt');
  dispose();
});
test('Stand: eine leere Antwort des Scorings ist kein Ton', async () => {
  const dir = notesFor('leerer-ton', { 'a.json': note('prompter') });
  const llm = fakeLlm(reply(goodResult()));
  const services = toneService(null);
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: dummyContextPath, notesPath: dir }, { llm, services });
  const claimed = contextProject();

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  // `null` heisst „nichts zu sagen" (kein Signal) — dieselbe Ehrlichkeit wie
  // beim Index, der ohne Index `null` gibt statt einer leeren Antwort.
  assert.equal(records[0].stand.tone, 'none');
  assert.equal(records[0].stand.stance, null);
  assert.equal(llm.calls[0].messages[0].content[2].text.includes('<haltung>'), false);
  dispose();
});
test('Skills: kein Skill-Block im Veredler-Request — auch nicht bei Treffern', async () => {
  const skillsRoot = mkdtempSync(join(tmpdir(), 'shinon-prompter-skills-'));
  const writeSkill = (name, description) => {
    mkdirSync(join(skillsRoot, name), { recursive: true });
    writeFileSync(join(skillsRoot, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`);
  };
  writeSkill('a-arch', 'quartz runtime architektur');
  writeSkill('z-spezial', 'tempo');

  const intentPath = join(skillsRoot, 'intent-rules.json');
  writeFileSync(intentPath, JSON.stringify({
    contract: 'shinon.intent-rules/v1',
    patterns: [{
      id: 'arch-pruefen',
      label: 'Architektur prüfen',
      trigger: ['prüfe quartz runtime architektur'],
      classification: 'MULTI_STEP_TASK',
      expansion: 'Prüfe die quartz runtime architektur. Nutze dafür den Skill z-spezial.',
    }],
  }));

  const llm = fakeLlm(reply(goodResult()));
  const { ctx, dispose } = connect({
    ...route,
    mode: 'MAX',
    contextPath: dummyContextPath,
    skillsPath: skillsRoot,
    intentPatternsPath: intentPath,
  }, { llm });
  const claimed = [userMessage('prüfe quartz runtime architektur')];

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  // Der expandierte Prompt selbst nennt `z-spezial` (die Expansion steht
  // woertlich darin) — als Text, nicht als injizierter Skill-Block. Ein
  // `indexOf` ueber den ganzen Request wuerde genau die Regeldatei messen,
  // die es nicht sein darf.
  const request = llm.calls[0].messages[0].content.map((part) => part.text ?? '').join('\n');
  assert.equal(/<shinon_skills>[\s\S]*?<\/shinon_skills>/.test(request), false, `kein Skill-Block im Request: ${request}`);
  assert.equal(request.includes('<selected_skills'), false, 'kein Stand-Skill-Block');
  assert.ok(request.includes('z-spezial'), 'die Expansion steht als Auftragstext drin — nicht als Skill-Block');
  dispose();
  rmSync(skillsRoot, { recursive: true, force: true });
});
