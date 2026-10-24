/** Teil 3/5 von prompter-contract.test.mjs — Fixtures stehen in `prompter-contract-fixtures.mjs`. */
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

test('SALVAGED_PROSE: ein offener Prosa-Zaun wird erkannt, aber nicht uebernommen', async () => {
  const answer = '```text\nBaue die Module und teste sie danach.';
  const { ctx, records, dispose } = connect({ ...route }, { llm: fakeLlm(answer) });
  const claimed = [userMessage('baue module')];
  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
  assert.equal(records[0].outcome, 'rejected');
  assert.deepEqual(records[0].reasons, ['NO_JSON', 'SALVAGED_PROSE']);
  assert.equal(decision.messages[0].content[0].text, 'baue module');
  assert.equal(records[0].salvage.chars, 'Baue die Module und teste sie danach.'.length);
  dispose();
});
test('Roh-Prompt: jede Fallback-Regel aus Plan §7 greift', async () => {
  // `kept` unterscheidet die zwei Arten des Verwerfens: gab es keine
  // schema-gueltige Antwort (kept: false), ist der Datensatz leer; hat das
  // Modell geantwortet und die Policy hat sie verworfen (kept: true), bleibt die
  // Antwort im Datensatz NACHVOLLZIEHBAR — verwendet wird sie trotzdem nicht.
  const cases = [
    { name: 'invalid JSON (kaputt)', behaviour: '{"enhancedPrompt": }', reason: 'INVALID_JSON', kept: false },
    { name: 'schema invalid (Pflichtfeld fehlt)', behaviour: reply({ enhancedPrompt: 'x' }), reason: 'SCHEMA_INVALID', kept: false },
    { name: 'schema invalid (null statt Liste)', behaviour: reply(goodResult({ addedRequirements: null })), reason: 'SCHEMA_INVALID', kept: false },
    { name: 'schema invalid (leerer Prompt)', behaviour: reply(goodResult({ enhancedPrompt: '' })), reason: 'SCHEMA_INVALID', kept: false },
    { name: 'schema invalid (references kein Array)', behaviour: reply(goodResult({ references: 'nein' })), reason: 'SCHEMA_INVALID', kept: false },
    { name: 'preservedIntent != true', behaviour: reply(goodResult({ preservedIntent: false })), reason: 'INTENT_NOT_PRESERVED', kept: true },
    { name: 'addedRequirements != []', behaviour: reply(goodResult({ addedRequirements: ['mehr'] })), reason: 'ADDED_REQUIREMENTS', kept: true },
    { name: 'removedRequirements != []', behaviour: reply(goodResult({ removedRequirements: ['weniger'] })), reason: 'REMOVED_REQUIREMENTS', kept: true },
  ];
  for (const { name, behaviour, reason, kept } of cases) {
    const llm = fakeLlm(behaviour);
    const { ctx, records, dispose } = connect({ ...route }, { llm });
    const claimed = [userMessage()];
    const downstream = { kind: 'enter', messages: claimed };

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(decision, downstream, `${name}: der Roh-Prompt muss gelten`);
    assert.equal(llm.calls.length, 1, `${name}: genau ein One-Shot-Aufruf`);
    assert.equal(records.length, 1, `${name}: genau ein Datensatz`);
    assert.equal(records[0].outcome, 'rejected', name);
    // Nur der Praefix wird gepinnt: die Wortwahl der Bibliothek ist nicht unser Vertrag.
    assert.ok(records[0].reasons[0].startsWith(reason), `${name}: ${records[0].reasons[0]}`);
    assert.equal(records[0].enhancedLength > 0, kept, `${name}: nachvollziehbar, aber nicht verwendet`);
    dispose();
  }
});
test('Roh-Prompt: derselbe ungueltige Ausgang faellt dreimal gleich aus', async () => {
  // Der Gate-Satz verlangt Determinismus, nicht nur Ablehnung. Dreimal gefahren,
  // weil ein Zustand, der beim ersten Mal nicht auffaellt, beim zweiten sichtbar
  // wird — und die Nutzlast des Roh-Prompts dabei unberuehrt bleiben muss.
  const runs = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const llm = fakeLlm(reply(goodResult({ removedRequirements: ['ohne Tests'] })));
    const { ctx, records, dispose } = connect({ ...route }, { llm });
    const claimed = [userMessage()];
    const before = JSON.stringify(claimed);

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

    assert.equal(JSON.stringify(claimed), before, 'der Roh-Prompt wird nicht mutiert');
    runs.push(JSON.stringify([decision.messages[0].content, records[0].outcome, records[0].reasons]));
    dispose();
  }
  assert.equal(new Set(runs).size, 1, `drei Laeufe, ein Ausgang: ${runs.join(' | ')}`);
});
test('Roh-Prompt: kein interner Fehler bricht den Schritt', async () => {
  // Die Signal-Konstruktion (AbortSignal.timeout/any) steht VOR dem Aufruf und
  // wirft bei kaputter Konfiguration — ein Fehler in UNSEREM Code. Er darf nicht
  // zum kaputten Schritt werden: der Loop darf nie sehen, dass der Enhancer da war.
  const cases = [
    { name: 'timeoutMs negativ', config: { ...route, timeoutMs: -1 } },
    { name: 'timeoutMs keine Zahl', config: { ...route, timeoutMs: NaN } },
    { name: 'Signal des Schritts ist kein AbortSignal', config: { ...route }, payload: { signal: {} } },
  ];
  for (const { name, config, payload: patch } of cases) {
    const llm = fakeLlm(reply(goodResult()));
    const { ctx, records, dispose } = connect(config, { llm });
    const claimed = [userMessage()];
    const downstream = { kind: 'enter', messages: claimed };
    const payload = { ...stepPayload(claimed), ...(patch ?? {}) };

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, payload, () => Promise.resolve(downstream));

    assert.equal(decision, downstream, `${name}: der Schritt laeuft weiter`);
    assert.equal(records.length, 1, `${name}: genau ein Datensatz`);
    assert.equal(records[0].outcome, 'rejected', name);
    assert.ok(records[0].reasons[0].startsWith('INTERNAL_ERROR'), `${name}: ${records[0].reasons[0]}`);
    dispose();
  }
});
test('Roh-Prompt: ein Fehler des Loops bleibt der Fehler des Loops', async () => {
  // Die Gegenprobe zum internen Fehler: wer next() mitfaengt, verschiebt den
  // Downstream-Fehler nur und ruft den Loop ein zweites Mal.
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];
  let calls = 0;

  await assert.rejects(
    ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => {
      calls += 1;
      return Promise.reject(new Error('Loop kaputt'));
    }),
    /Loop kaputt/,
  );
  assert.equal(calls, 1, 'next() genau einmal — kein zweiter Anlauf');
  dispose();
});
test('Roh-Prompt: ein Abbruch des Loops wird nicht zu einem Eintritt umgedeutet', async () => {
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];
  const downstream = { kind: 'reject' };

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

  assert.equal(decision, downstream, 'ohne messages wird nicht geraten');
  assert.equal(records[0].outcome, 'rejected');
  assert.deepEqual(records[0].reasons, ['MESSAGE_NOT_FOUND']);
  assert.equal(records[0].enhancedLength > 0, true, 'die verworfene Antwort bleibt nachvollziehbar');
  dispose();
});
test('Roh-Prompt: eine werfende Spur aendert die Entscheidung nicht', async () => {
  // Die Spur ist Nebensache, die Entscheidung ist die Sache: ein Zuhoerer auf
  // DECISION_CHANNEL darf den Schritt nicht mitreissen.
  const llm = fakeLlm(reply(goodResult()));
  const ctx = new Context();
  ctx.on(bundle.DECISION_CHANNEL, () => {
    throw new Error('Zuhoerer kaputt');
  });
  const host = { on: (...args) => ctx.on(...args), emit: (...args) => ctx.emit(...args), llm };
  const dispose = quiet(() => bundle.apply(host, bundle.Config({ ...route })));
  const claimed = [userMessage()];

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(decision.messages[0].content[0].text, 'Mach das schnell.', 'die uebernommene Antwort gilt trotzdem');
  dispose();
});
test('Mindestvertrag: zusaetzliche Felder sind erlaubt — die Intent-Klasse ist KEIN Feld', () => {
  // Plan §7 nennt einen MINDESTvertrag. Gemessen in Schemastery 3.18.4: ein
  // unbekannter Schluessel laeuft durch. Das ist hier gewollt, aber es darf
  // keine Wirkung haben: das Modell kann `intentClassification` senden, der
  // Datensatz traegt danach trotzdem die Klasse des Runtime-Resolvers.
  const parsed = bundle.parseResult(reply({ ...goodResult(), hinweis: 'extra', confidence: 0.9, intentClassification: 'VIBE' }));

  assert.equal(parsed.ok, true);
  assert.equal(parsed.result.enhancedPrompt, 'Mach das schnell.');
  // Schemastery laesst den fremden Schluessel durch (Mindestvertrag) — gelesen
  // wird er NIRGENDS: der Datensatz der Provenienz nimmt die Runtime-Klasse.
  assert.equal(parsed.result.intentClassification, 'VIBE', 'das Modellwort reist ungeprueft als Extra mit');
  assert.equal(bundle.POLICIES.MAX.includes('intentClassification'), false, 'der System-Prompt fordert es nicht mehr an');
});
test('Roh-Prompt: ohne Route und ohne LLM-Dienst wird gar nicht erst aufgerufen', async () => {
  const cases = [
    { name: 'ohne Route', config: { provider: '', model: '' }, withLlm: true, reason: 'NO_ROUTE' },
    { name: 'ohne llm-Dienst', config: { ...route }, withLlm: false, reason: 'NO_LLM_SERVICE' },
  ];
  for (const { name, config, withLlm, reason } of cases) {
    const double = fakeLlm(reply(goodResult()));
    const { ctx, records, dispose } = connect(config, withLlm ? { llm: double } : {});
    const claimed = [userMessage()];
    const downstream = { kind: 'enter', messages: claimed };

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(decision, downstream, name);
    assert.equal(double.calls.length, 0, name);
    assert.equal(records[0].outcome, 'unavailable', name);
    assert.deepEqual(records[0].reasons, [reason], name);
    dispose();
  }
});
test('Klassifikation: mit `alwaysEnhance: false` kommen CHAT und LOOKUP ohne Modellaufruf aus', async () => {
  // Der Kern des Passes: die Klasse ist Runtime-Eigentum. Hier laeuft der
  // One-Shot NIE (keine Route UND Kurzweg ausdruecklich gewaehlt) — der
  // Datensatz traegt trotzdem die Klasse, die der Resolver aus dem Text gelesen
  // hat; unklare Eingabe ist UNDEFINED. Die Vorgabe ist `alwaysEnhance: true`;
  // dieser Test pinnt den ausdruecklichen Kurzweg.
  const cases = [
    { text: 'hallo wie gehts', expected: 'CHAT', pattern: 'chat', outcome: 'accepted' },
    { text: 'erklär mir den code', expected: 'LOOKUP', pattern: 'read-code', outcome: 'accepted' },
    { text: 'schreib tests fuer scoring', expected: 'MULTI_STEP_TASK', pattern: 'tests', outcome: 'unavailable' },
    { text: 'mach was', expected: 'UNDEFINED', pattern: null, outcome: 'unavailable' },
  ];
  for (const { text, expected, pattern, outcome } of cases) {
    const double = fakeLlm(reply(goodResult()));
    const { ctx, records, dispose } = connect({ ...route, provider: '', model: '', alwaysEnhance: false }, { llm: double });
    const claimed = [userMessage(text)];

    await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

    assert.equal(double.calls.length, 0, `${text}: kein Modellaufruf`);
    assert.equal(records[0].outcome, outcome, text);
    assert.equal(records[0].intentClassification, expected, text);
    assert.equal(records[0].intentMatch, pattern, `${text}: der Treffer nennt sein Pattern`);
    assert.equal(records[0].raw_prompt, text, `${text}: der Rohtext steht im Trace`);
    dispose();
  }
});
test('Ersetzung: nur der Text wird ersetzt, Identitaet und Fremdbloecke bleiben', () => {
  const image = { type: 'image', ref: 'bild-1' };
  const original = { id: 'm-1', role: 'user', content: [image, { type: 'text', text: 'alt' }, { type: 'text', text: 'noch aelter' }], source: { kind: 'user' } };
  const other = { id: 'm-0', role: 'user', content: [{ type: 'text', text: 'frueher' }], source: { kind: 'user' } };
  const messages = [other, original];

  const replaced = bundle.replacePrompt(messages, original, 'neu');

  assert.equal(replaced[0], other, 'unbeteiligte Nachrichten bleiben dieselben Objekte');
  assert.equal(replaced[1].id, 'm-1', 'die Identitaet der Nachricht bleibt');
  assert.equal(replaced[1].source, original.source);
  assert.deepEqual(replaced[1].content, [image, { type: 'text', text: 'neu' }], 'der Bildblock bleibt, beide Textbloecke werden einer');
  assert.equal(messages[1], original, 'die Eingabe wird nicht mutiert');
});
test('Ersetzung: keine Nachrichtenform bringt die Ersetzung zum Werfen', () => {
  // Die Ersetzung ist TOTAL: unbrauchbare Formen ergeben null (= Roh-Prompt)
  // statt eines Wurfs. Genau darum braucht der Listener um sie herum keinen
  // Schutz-Zweig — ein solcher Zweig waere ein unerreichbarer Zweig.
  const withoutText = { id: 'm-1', role: 'user', content: [{ type: 'image', ref: 'bild-1' }] };
  const stringContent = { id: 'm-2', role: 'user', content: 'roher Text' };
  const cases = [
    { name: 'messages fehlt', args: [undefined, userMessage(), 'neu'] },
    { name: 'messages ist keine Liste', args: ['keine Liste', userMessage(), 'neu'] },
    { name: 'Nachricht nicht in der Liste', args: [[userMessage()], { id: 'fremd' }, 'neu'] },
    { name: 'Nachricht ohne Textblock', args: [[withoutText], withoutText, 'neu'] },
    { name: 'content ist ein String statt Liste', args: [[stringContent], stringContent, 'neu'] },
  ];
  for (const { name, args } of cases) {
    assert.equal(bundle.replacePrompt(...args), null, name);
  }
});
test('Ersetzung: eine nicht auffindbare Nachricht fuehrt zum Roh-Prompt', async () => {
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];
  const fremd = { kind: 'enter', messages: [userMessage()] };

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(fremd));

  // Der Ausgang des Enhancers war ANGENOMMEN: genau ein Modellaufruf, und die
  // Antwort steht mit ihrer Laenge im Datensatz. Erst die fehlende Nachricht macht
  // daraus `rejected` (der TABELLEN-Wert `missingMessage`, kein zweites Verwerfen
  // des Modells). Der Test kann deshalb nur ueber diese Umdeutung bestehen und
  // nicht schon dadurch, dass gar nichts veredelt wurde.
  assert.equal(llm.calls.length, 1, 'der One-Shot lief genau einmal');
  assert.equal(records[0].outcome, 'rejected');
  assert.deepEqual(records[0].reasons, ['MESSAGE_NOT_FOUND']);
  assert.ok(records[0].enhancedLength > 0, 'die angenommene Antwort bleibt im Datensatz nachvollziehbar');
  // Die Entscheidung geht unveraendert durch: kein Prompt wird eingehaengt.
  assert.equal(decision, fremd, 'Roh-Prompt bleibt erhalten, nicht ersetzt');
  assert.equal(decision.messages[0].content[0].text, claimed[0].content[0].text, 'der Text der Nachricht ist unveraendert');
  dispose();
});
test('Abbruch: das Signal des Schritts erreicht den One-Shot', async () => {
  const llm = fakeLlm((options) => {
    assert.ok(options.signal instanceof AbortSignal, 'der Aufruf braucht ein Signal');
    return reply(goodResult());
  });
  const { ctx, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];

  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls.length, 1);
  assert.equal(llm.calls[0].signal.aborted, false);
  dispose();
});
test('Abbruch: ein abgebrochener One-Shot gilt als verworfen', async () => {
  const controller = new AbortController();
  const llm = fakeLlm(() => {
    controller.abort();
    const error = new Error('aborted');
    error.name = 'AbortError';
    return error;
  });
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];
  const payload = { ...stepPayload(claimed), signal: controller.signal };
  const downstream = { kind: 'enter', messages: claimed };

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, payload, () => Promise.resolve(downstream));

  // Verhaltensänderung: Verworfen wird nicht mehr zu einem Eskalations-Prompt
  // umgedeutet. Ein abgebrochener One-Shot lässt die Entscheidung unverändert
  // — der Roh-Prompt geht weiter.
  assert.equal(decision, downstream, 'Roh-Prompt bleibt erhalten');
  assert.equal(records[0].outcome, 'rejected');
  assert.deepEqual(records[0].reasons, ['LLM_FAILED:AbortError']);
  dispose();
});
test('Konfiguration: die Defaults rufen nichts auf und lassen den Ablauf unberuehrt', () => {
  const parsed = bundle.Config({});
  assert.deepEqual(parsed, {
    observeEvents: ['agent/pre-step'],
    mode: 'MIN',
    provider: '',
    model: '',
    // Phase 5: eigener Schluesselname + Fallback-Route. NUR Namen, nie Werte;
    // leer heisst: die Primaerroute traegt ihren Schluessel selbst.
    providerKeyEnv: '',
    providerFallback: '',
    modelFallback: '',
    contextPath: '',
    // S1: die EINE Workspace-Identität (explizit > Env > cwd). Leer heißt:
    // kein expliziter Root, die Auflösung entscheidet — nie still das cwd.
    workspaceRoot: '',
    // Neu mit der Naht zum Project Index: das Budget des MAX-Kontexts. Der
    // Vorgabewert ist DERSELBE wie der des Index (`DEFAULT_CONTEXT_BUDGET`),
    // deshalb ist er hier gepinnt und nicht nur behauptet.
    indexBudgetTokens: 6000,
    // Neu mit den Zetteln (Zug 4): das Verzeichnis, aus dem der Veredler liest.
    // Vorgabe als Konstante des Pakets, GEPINNT — ein Wechsel waere ein Lauf ohne Lessons.
    notesPath: bundle.NOTES_DIR_DEFAULT,
    // Neu mit der Skill-Selektion (Zug 6): Projektverzeichnis der Skills, GEPINNT.
    // Ein stiller Wechsel des Ordners waere ein Lauf ohne seine Skills.
    skillsPath: bundle.SKILLS_DIR_DEFAULT,
    skillLifecycle: false,
    // Die Lernpruefung (SH-LEARN-03/04). `enabled: false` ist die Vorgabe: ohne
    // Profilentscheidung laeuft KEIN Hintergrundmodell. Die beiden Freigabe-
    // schalter stehen auf `true` (jede Aenderung wird bereitgestellt), die
    // Pfade sind leer und fallen auf die Regeldatei zurueck.
    learningReview: {
      enabled: false,
      provider: '',
      model: '',
      memoryWriteApproval: true,
      skillWriteApproval: true,
      registryPath: '',
      usagePath: '',
    },
    eventsChannel: 'shinon/event',
    maxTokens: 1200,
    temperature: 0,
    timeoutMs: 15000,
    // Der Veredler ist in der Regel IMMER aktiv (Nutzerentscheidung
    // 2026-10-19); der Kurzweg bleibt ein ausdruecklicher Profil-Schalter.
    alwaysEnhance: true,
    // Budget-Regel (2026-10-23): ab dieser Zeichenzahl lohnt der One-Shot.
    // Vorgabe 0 = AUS — die wirksame Zahl (120) steht im Profil, weil sie eine
    // Wirkentscheidung des Profils ist und keine Verhaltensaenderung des Pakets.
    minEnhanceChars: 0,
    // Probe-Journal der verworfenen One-Shot-Antworten: Projektzustand unter
    // `.shinon/`, gitignoriert, nicht Teil des Tarballs.
    probeJournalPath: '.shinon/one-shot-journal.jsonl',
    trace: true,
    intentPatternsPath: './assets/intent-rules.json',
    // Fassung 2: das Intent-Gedächtnis gehört wie die gelernten Bausteine dem
    // PROJEKT (relativ zum Workspace). Ein leerer Pfad schaltet es ab; der
    // Vorgabewert ist hier GEPINNT, damit ein stiller Pfadwechsel auffällt.
    intentMemoryPath: '.shinon/intent-memory.json',
    // Der dauerhafte SALVAGED_PROSE-Zaehler liegt im EIGENEN Raum der Ablage
    // (Lauf, nicht Workspace). Der Vorgabewert ist die Konstante des Pakets;
    // leer schaltet ihn ab, und das ist der einzige Weg dazu.
    salvageNamespace: bundle.SALVAGE_NAMESPACE,
    // Phase 4: die gelernte Baustein-Ablage gehoert dem PROJEKT. Der Vorgabewert
    // ist die eine Konstante des Pakets, nicht ein zweites Literal.
    blocksLearnedPath: bundle.LEARNED_DEFAULT_PATH,
    // SHINON.md: die EINZIGE Anweisungsdatei aus dem Projekt (statt AGENTS.md).
    // Der Vorgabewert ist hier GEPINNT — ein stiller Namenswechsel wuerde die
    // Datei des Projekts verfehlen und den Pflichtblock kosten.
    shinonMdPath: 'SHINON.md',
  });
});
