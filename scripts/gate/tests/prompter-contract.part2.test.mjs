/** Teil 2/4 von prompter-contract.test.mjs — Fixtures stehen in `prompter-contract-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { codeOnly, findForbidden, stripComments } from '../../lib/source-scan.mjs';
import { listFiles, protectedReason, toProjectPath } from '../../../packages/project-index/assets/index-core.js';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { quiet } from './helpers/console.mjs';
import { PACKAGE_DIR, INDEX_FILE, root, require, bundleDir, loadBundle, bundle, Context, goodResult, reply, userMessage, stepPayload, connect, fakeLlm, route, loopDefault, dummyContext, contextDir, contextFile, dummyContextPath, runtimeModules, harnessMessage, REGION_MARK, regionHits, isOneRegion, MARKEN_AUSREISSER } from './prompter-contract-fixtures.mjs';
import { notesRoot, note, notesFor, contextProject, toneService, toneState } from './prompter-contract-fixtures-b.mjs';

test('Kontextvertrag: ein relativer contextPath wird am Paket aufgeloest', async () => {
  const name = 'test-context.json';
  writeFileSync(join(bundleDir, name), JSON.stringify(dummyContext));
  try {
    assert.equal(bundle.loadContext(`./${name}`).project, 'shinon-forge');

    const llm = fakeLlm(reply(goodResult()));
    const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: `./${name}` }, { llm });
    const claimed = [userMessage()];

    await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

    assert.equal(records[0].outcome, 'accepted', 'ein relativer Pfad muss bis in den Aufruf tragen');
    assert.equal(records[0].context, 'used');
    assert.ok(llm.calls[0].messages[0].content[1].text.includes('<file path="packages/prompter/index.js">'));
    dispose();
  } finally {
    rmSync(join(bundleDir, name), { force: true });
  }
});
test('Kontextvertrag: ein fehlender relativer Pfad sperrt MAX, statt zu raten', async () => {
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route, mode: 'MAX', contextPath: './gibt-es-nicht.json' }, { llm });
  const claimed = [userMessage()];
  const downstream = { kind: 'enter', messages: claimed };

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

  assert.equal(decision, downstream);
  assert.equal(llm.calls.length, 0);
  assert.deepEqual(records[0].reasons, ['CONTEXT_INVALID']);
  dispose();
});
test('Kontextvertrag: unvollstaendige Kontexte werden abgelehnt', () => {
  const cases = [
    { name: 'fehlendes project', value: { ...dummyContext, project: undefined } },
    { name: 'fehlende files', value: { ...dummyContext, files: undefined } },
    { name: 'Datei ohne Inhalt', value: { ...dummyContext, files: [{ path: 'a.js' }] } },
    { name: 'Datei mit leerem Pfad', value: { ...dummyContext, files: [{ path: '', content: 'x' }] } },
    { name: 'touches keine Liste', value: { ...dummyContext, touches: 'x' } },
  ];
  for (const { name, value } of cases) {
    assert.throws(() => bundle.ContextSchema(value), name);
  }
  assert.equal(bundle.ContextSchema(dummyContext).project, 'shinon-forge');
});
test('Isolation: der One-Shot-Aufruf traegt keine Tools und keine erfundenen Felder', () => {
  const request = bundle.buildEnhancerRequest({ text: 'roh', mode: 'MIN', config: bundle.Config({ ...route }), signal: undefined });

  assert.deepEqual(
    Object.keys(request).sort(),
    ['maxTokens', 'messages', 'model', 'provider', 'signal', 'system', 'temperature'],
  );
  assert.equal('tools' in request, false, 'kein tools-Feld — Abwesenheit ist die Grenze');
  assert.equal('purpose' in request, false, 'purpose kennt nur compaction|session-title');
  assert.equal('sessionId' in request, false, 'kein One-Shot beansprucht Loop-Identitaet');
  // RequestUserInput: role 'user', content-Bloecke, keine durable Identitaet.
  assert.deepEqual(request.messages, [{ role: 'user', content: [{ type: 'text', text: 'roh' }] }]);
  assert.equal('id' in request.messages[0], false);
  assert.equal('source' in request.messages[0], false);
  assert.equal(request.system, bundle.POLICIES.MIN);
});
test('Isolation: der Laufzeitcode oeffnet weder Dateisystem noch Netz und gibt keine Tools', () => {
  const forbidden = ['child_process', 'writeFile', 'mkdirSync', 'rmSync', 'unlinkSync', 'execSync', 'spawn(', 'fetch(', 'process.exit', 'ctx.agents', 'ctx.subagents', 'ctx.shell', 'ctx.set('];
  const modules = runtimeModules();
  // Der Scan muss die Module des One-Shot-Pfads wirklich treffen — sonst waere
  // die Zusage nur noch eine Aussage ueber die Host-Haelfte.
  for (const required of ['index.js', 'assets/enhancer.js', 'assets/mode-core.js', 'assets/render-context.js', 'assets/result-contract.js', 'assets/schema.js']) {
    assert.ok(modules.includes(join(PACKAGE_DIR, required)), `${required} fehlt im Isolationstest`);
  }
  for (const file of modules) {
    const source = readFileSync(file, 'utf8');
    assert.deepEqual(findForbidden(source, forbidden, { mode: 'module' }), [], `${file}: Werkzeug im Laufzeitcode`);
    assert.deepEqual(findForbidden(source, forbidden), [], `${file}: Werkzeug im Laufzeitcode (Textlauf)`);
    // Die Grenze selbst: nirgends wird ein Werkzeugkatalog gebaut oder uebergeben.
    //
    // EINE benannte Ausnahme seit 2026-10-23: der Host-Eintrag GIBT ein Werkzeug
    // (das Modell-Werkzeug der Naht `shinon_block_propose`, `assets/propose-tool.js`)
    // — ein Werkzeug im KATALOG ist nicht ein Werkzeug im One-Shot-Aufruf, und die
    // Zeile darueber haelt fest, dass der Aufruf weiterhin keins traegt. Erlaubt
    // ist genau die Registrierungsform; jeder andere `tools`-Code im Eintrag
    // waere ein zweiter Katalog und bleibt rot.
    const toolLines = codeOnly(source).split('\n').filter((line) => /\btools\b/.test(line));
    if (file === INDEX_FILE) {
      // Nur der ZUGRIFF auf den Dienst ist Code; der Dienstname in
      // `bus.demand(['tools']` ist ein String und wird hier nicht gezaehlt.
      const access = /child\.tools\.register\(/;
      for (const line of toolLines) {
        assert.match(line, access, `${file}: Werkzeug-Code ausserhalb der Registrierung: ${line.trim()}`);
      }
      assert.ok(toolLines.length >= 1, `${file}: keine Werkzeug-Registrierung fuer die Naht`);
      assert.ok(
        stripComments(source).includes("bus.demand(['tools']"),
        `${file}: der tools-Dienst wird nicht angefordert`,
      );
    } else {
      assert.equal(toolLines.length, 0, `kein tools-Feld im Laufzeitcode (${file})`);
    }
  }
});
test('Laden: das Bundle registriert sich am echten Waterfall', async () => {
  const llm = fakeLlm(reply(goodResult()));
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage()];

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls.length, 1, 'genau ein One-Shot-Aufruf');
  assert.equal(decision.kind, 'enter');
  assert.equal(decision.messages[0].content[0].text, 'Mach das schnell.', 'der uebernommene Prompt ersetzt den Roh-Prompt');
  assert.equal(records.length, 1, 'genau ein Provenienz-Datensatz pro Schritt');
  assert.equal(records[0].outcome, 'accepted');
  assert.equal(records[0].contract, bundle.CONTRACT);
  // Die Klasse stammt aus dem Text und dem Resolver. `mach  das  schnell` ist
  // kein Muster — also steht dort ausdruecklich UNDEFINED, keine geratene Klasse.
  assert.equal(records[0].intentClassification, 'UNDEFINED');
  assert.equal(records[0].intentReason, 'NO_MATCH', 'die Enthaltung nennt ihren Grund');
  assert.equal(records[0].context, 'not-applicable');
  // Die Sitzung traegt die Zuordnung fuer §17: der Task Router muss die
  // Klassifikation einem LEBENDEN Agenten zuordnen koennen, und das geht nur
  // ueber die Sitzung — nicht ueber die Reihenfolge der Nachrichten.
  assert.equal(records[0].session_id, 'sess-1');
  dispose();
});
test('Laden: der Host mountet ueber Cordis und deklariert die llm-Injektion', async () => {
  // Regression fuer einen Fehler, den NUR der echte Boot zeigt: ohne
  // `inject: ['llm']` verweigert Cordis den Zugriff auf ctx.llm („cannot get
  // property \"llm\" without inject"). Unser Schutz fing das korrekt ab — der
  // Host lief weiter, der Roh-Prompt galt — aber der Enhancer veredelte nie
  // etwas. Mit einem selbstgebauten Host-Objekt (connect()) faellt das nicht
  // auf: dort liegt kein Cordis-Proxy zwischen Aufrufer und Dienst.
  assert.deepEqual(bundle.inject, ['llm'], 'der Host muss den llm-Dienst deklarieren');

  const ctx = new Context();
  const llm = fakeLlm(reply(goodResult()));
  ctx.provide('llm', llm);
  const records = [];
  ctx.on(bundle.DECISION_CHANNEL, (record) => records.push(record));
  await quiet(() => ctx.plugin(bundle, { ...route }));
  const claimed = [userMessage()];

  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(llm.calls.length, 1, 'der Aufruf geht durch den echten Dienstzugriff');
  assert.equal(records[0].outcome, 'accepted');
  assert.equal(decision.messages[0].content[0].text, 'Mach das schnell.');
});
test('Laden: nach dispose und ohne passenden Event-Namen wird nicht registriert', async () => {
  for (const { name, config, disposeFirst } of [
    { name: 'nach dispose', config: { ...route }, disposeFirst: true },
    { name: 'observeEvents ohne den Event-Namen', config: { ...route, observeEvents: ['session.created'] }, disposeFirst: false },
  ]) {
    const llm = fakeLlm(reply(goodResult()));
    const { ctx, dispose } = connect(config, { llm });
    const claimed = [userMessage()];
    if (disposeFirst) dispose();

    const downstream = { kind: 'enter', messages: claimed };
    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(decision, downstream, name);
    assert.equal(llm.calls.length, 0, name);
    dispose();
  }
});
test('Roh-Prompt: jeder Fehlschlag laesst die Entscheidung unberuehrt', async () => {
  const cases = [
    { name: 'Antwort mit kaputtem JSON', behaviour: '{"enhancedPrompt": }' },
    { name: 'Antwort verletzt das Schema', behaviour: reply({ enhancedPrompt: 'x' }) },
    { name: 'Absicht nicht erhalten', behaviour: reply(goodResult({ preservedIntent: false })) },
    { name: 'Anforderung hinzugefuegt', behaviour: reply(goodResult({ addedRequirements: ['mehr'] })) },
    { name: 'Provider wirft', behaviour: new Error('Provider kaputt') },
  ];
  for (const { name, behaviour } of cases) {
    const llm = fakeLlm(behaviour);
    const { ctx, records, dispose } = connect({ ...route }, { llm });
    const claimed = [userMessage()];
    const downstream = { kind: 'enter', messages: claimed };

    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), () => Promise.resolve(downstream));

    assert.equal(decision, downstream, `${name}: die Entscheidung muss unveraendert sein`);
    assert.equal(records.length, 1, `${name}: genau ein Datensatz`);
    assert.ok(records[0].outcome !== 'accepted', `${name}: ${records[0].outcome}`);
    assert.ok(records[0].reasons.length > 0, `${name}: ein Verwerfen braucht einen Grund`);
    dispose();
  }
});
test('SALVAGED_PROSE: Prosa wird benannt und VERWORFEN — der Rohtext bleibt stehen', async () => {
  const prose = 'Bitte baue die zwoelf neuen Module und teste sie danach gruendlich.';
  const llm = fakeLlm(prose);
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage('baue module und teste')];
  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));

  assert.equal(records[0].outcome, 'rejected', 'eine Prosa-Antwort ist ein Befund, kein Prompt');
  assert.deepEqual(records[0].reasons, ['NO_JSON', 'SALVAGED_PROSE']);
  assert.equal(decision.messages[0].content[0].text, 'baue module und teste', 'der Roh-Prompt gilt unveraendert');
  assert.equal(records[0].raw_prompt, 'baue module und teste', 'die Eingabe bleibt im Trace sichtbar');
  assert.equal(records[0].salvage.applied, false, 'die Prosa ist nicht angekommen');
  assert.equal(records[0].salvage.chars > 0, true, 'die Zeichenzahl bleibt als Befund');
  dispose();
});
test('SALVAGED_PROSE: Zaun und Vorrede fallen weg, kaputtes JSON wird kein Prompt', async () => {
  const fenced = 'Hier ist der verbesserte Prompt:\n```text\nBaue die Module und teste sie danach.\n```';
  const llm = fakeLlm(fenced);
  const { ctx, records, dispose } = connect({ ...route }, { llm });
  const claimed = [userMessage('baue module')];
  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
  assert.equal(records[0].outcome, 'rejected', 'auch eine aufgeraeumte Prosa bleibt ein Fehlerfall');
  assert.deepEqual(records[0].reasons, ['NO_JSON', 'SALVAGED_PROSE']);
  assert.equal(decision.messages[0].content[0].text, 'baue module', 'der Roh-Prompt gilt');
  dispose();

  // Ein kaputter Objekttext ist kein Prompt: dort bleibt der Roh-Prompt.
  const broken = connect({ ...route }, { llm: fakeLlm('{"enhancedPrompt": }') });
  const claimed2 = [userMessage('baue module')];
  const unchanged = await broken.ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed2), loopDefault(claimed2));
  assert.equal(unchanged.messages[0].content[0].text, 'baue module');
  assert.equal(broken.records[0].outcome, 'rejected');
  broken.dispose();
});
test('SALVAGED_PROSE: ein Fuellwort vor der Vorrede laesst nicht die ganze Antwort durch', async () => {
  const refined = 'Baue die Module und teste sie danach.';
  for (const answer of [
    `Klar, gerne. Hier ist der verbesserte Prompt: ${refined}`,
    `Also, hier ist der verbesserte Prompt: ${refined}`,
    // Zweiter Fall (gemessen 2026-10-19): Fuellwort OHNE Vorrede.
    `Klar. ${refined}`,
    `Gerne! ${refined}`,
  ]) {
    const { ctx, records, dispose } = connect({ ...route }, { llm: fakeLlm(answer) });
    const claimed = [userMessage('baue module und teste sie danach')];
    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
    assert.equal(records[0].outcome, 'rejected');
    assert.deepEqual(records[0].reasons, ['NO_JSON', 'SALVAGED_PROSE']);
    assert.equal(decision.messages[0].content[0].text, 'baue module und teste sie danach', `Roh-Prompt gilt: ${answer.slice(0, 20)}`);
    assert.notEqual(decision.messages[0].content[0].text, refined, 'auch der herausgeschaekte Kernsatz ersetzt nichts');
    dispose();
  }
});
test('SALVAGED_PROSE: eine ANTWORT auf den Auftrag ersetzt den Prompt nicht', async () => {
  const raw = 'baue module und teste sie danach';
  const answer = '**Gemacht:** die Module sind gebaut, ich teste sie danach.\n\n**Gefunden:** nichts Auffälliges.';
  const { ctx, records, dispose } = connect({ ...route }, { llm: fakeLlm(answer) });
  const claimed = [userMessage(raw)];
  const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
  assert.equal(records[0].outcome, 'rejected');
  assert.equal(decision.messages[0].content[0].text, raw, 'die Antwort hat den Prompt ersetzt');
  assert.notEqual(decision.messages[0].content[0].text, answer);
  dispose();
});
test('Probe-Journal: eine verworfene Antwort steht als JSONL-Zeile im Journal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-prompter-journal-'));
  const journal = join(dir, 'journal.jsonl');
  const raw = 'baue module und teste sie danach';
  const answer = '**Gemacht:** die Module sind gebaut, ich teste sie danach.';
  const { ctx, records, dispose } = connect({ ...route, probeJournalPath: journal }, { llm: fakeLlm(answer) });
  const claimed = [userMessage(raw)];
  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
  assert.equal(records[0].outcome, 'rejected');

  const lines = readFileSync(journal, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1, 'genau eine Zeile je Verwerfung');
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.contract, 'shinon.prompter/one-shot-journal-v1');
  assert.deepEqual(entry.reasons, ['NO_JSON']);
  assert.equal(entry.mode, 'MIN');
  assert.equal(entry.prompt, raw, 'der Auftrag reist mit — sonst ist die Antwort nicht messbar');
  assert.equal(entry.answer, answer);
  assert.ok(typeof entry.at === 'string' && entry.at.includes('T'), 'der Zeitpunkt fehlt');
  dispose();
  rmSync(dir, { recursive: true, force: true });
});
test('Probe-Journal: eine angenommene Antwort schreibt nichts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-prompter-journal-'));
  const journal = join(dir, 'journal.jsonl');
  const { ctx, dispose } = connect({ ...route, probeJournalPath: journal }, { llm: fakeLlm(reply(goodResult())) });
  const claimed = [userMessage('mach das schnell')];
  await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
  assert.throws(() => readFileSync(journal, 'utf8'), 'ein angenommener Lauf legt kein Journal an');
  dispose();
  rmSync(dir, { recursive: true, force: true });
});
test('SALVAGED_PROSE: Grund, Zeichenzahl und Fallzahl stehen im Datensatz und im Trace — je Sitzung', async () => {
  const refined = 'Baue die Module und teste sie danach.';
  const answer = `Klar, gerne. Hier ist der verbesserte Prompt: ${refined}`;
  const { ctx, records, dispose } = connect({ ...route }, { llm: fakeLlm(answer) });

  const logs = [];
  const real = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    for (let i = 0; i < 2; i += 1) {
      const claimed = [userMessage('baue module und teste sie danach')];
      await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
    }
  } finally {
    console.log = real;
  }

  assert.equal(records.length, 2);
  assert.deepEqual(records[0].salvage, {
    reason: 'NO_JSON',
    chars: refined.length,
    answer_chars: answer.length,
    applied: false,
    count: 1,
  });
  assert.equal(records[1].salvage.count, 2, 'zwei Faelle derselben Sitzung werden gezaehlt');
  assert.equal(records[1].salvage.chars, refined.length, 'die Zeichenzahl meint den uebernommenen Text');
  const trace = logs.filter((line) => line.includes('Trace:'));
  assert.ok(
    trace.some((line) => line.includes(`salvage=NO_JSON chars=${refined.length} n=2`)),
    `Trace nennt Grund, Zeichenzahl und Fallzahl: ${trace.at(-1) ?? '(keine Trace-Zeile)'}`,
  );
  // EINE Zeile je Turn: ohne sie standen NO_JSON und TIMEOUT nur in getrennten
  // Teil-Logs, und ein Turn mit Formatfehler war im Verlauf nicht zu finden.
  const turnLines = logs.filter((line) => line.includes('[shinon-prompter] Turn '));
  assert.ok(turnLines.length >= 2, `eine Zeile je Turn: ${turnLines.length}`);
  assert.ok(
    turnLines.every((line) => line.includes('rejected') && line.includes('NO_JSON') && line.includes('SALVAGED_PROSE')),
    `Turn-Zeile nennt Ausgang und Gruende: ${turnLines.at(-1) ?? '(keine)'}`,
  );
  dispose();

  // Eine andere Sitzung beginnt fuer sich bei 1 — der Zaehler ist kein Globus.
  const other = connect({ ...route }, { llm: fakeLlm(answer) });
  const claimed = [userMessage('baue module und teste sie danach')];
  await other.ctx.waterfall(
    bundle.PRE_STEP_EVENT,
    { ...stepPayload(claimed), agent: { session: { id: 'sess-2' } } },
    loopDefault(claimed),
  );
  assert.equal(other.records[0].salvage.count, 1, 'Sitzungen zaehlen getrennt');
  other.dispose();
});
test('SALVAGED_PROSE: die Fallzahl ueberlebt einen Neustart — und trennt Sitzungen', async () => {
  const refined = 'Baue die Module und teste sie danach.';
  const answer = `Klar, gerne. Hier ist der verbesserte Prompt: ${refined}`;
  // Eine Ablage, die wirklich haelt: Map als "Platte", der echte Dienst hat
  // load/save — nur ohne SQLite, weil dieser Test den Host nicht braucht.
  const memory = new Map();
  const written = [];
  const store = {
    contract: bundle.INDEX_STORE_CONTRACT,
    load: (namespace) => ({ ok: true, state: memory.get(namespace) ?? null }),
    save: (namespace, state) => {
      memory.set(namespace, state);
      written.push(namespace);
      return { ok: true, rows: 1 };
    },
  };
  const services = { [bundle.INDEX_STORE_SERVICE]: store };
  const fire = async (connection, sessionId = 'sess-1') => {
    const claimed = [userMessage('baue module und teste sie danach')];
    await connection.ctx.waterfall(
      bundle.PRE_STEP_EVENT,
      { ...stepPayload(claimed), agent: { session: { id: sessionId } } },
      loopDefault(claimed),
    );
    return connection.records.at(-1);
  };

  const first = connect({ ...route }, { llm: fakeLlm(answer), services });
  assert.equal((await fire(first)).salvage.count, 1);
  assert.equal((await fire(first)).salvage.count, 2);
  first.dispose();
  assert.deepEqual([...new Set(written)], [bundle.SALVAGE_NAMESPACE], 'genau der eigene Raum, kein fremder');

  // Neustart: neuer Context, neuer Prozesszaehler, DIESELBE Ablage.
  const second = connect({ ...route }, { llm: fakeLlm(answer), services });
  const afterRestart = await fire(second);
  assert.equal(afterRestart.salvage.count, 3, 'die Zahl kommt aus der Ablage, nicht aus dem Prozess');
  // Eine andere Sitzung beginnt fuer sich bei 1 und liegt im selben Raum daneben.
  assert.equal((await fire(second, 'sess-2')).salvage.count, 1, 'Sitzungen zaehlen getrennt');
  second.dispose();

  const persisted = memory.get(bundle.SALVAGE_NAMESPACE)?.memos?.find((memo) => memo?.id === bundle.SALVAGE_MEMO_ID)?.salvage;
  assert.ok(persisted, 'nichts in der Ablage');
  assert.equal(persisted.contract, bundle.SALVAGE_CONTRACT);
  assert.equal(persisted.sessions['sess-1'].count, 3);
  assert.equal(persisted.sessions['sess-1'].byReason.NO_JSON, 3);
  assert.equal(persisted.sessions['sess-2'].count, 1);
});
test('SALVAGED_PROSE: leerer Namensraum schreibt nicht, fremder Stand wird verworfen', async () => {
  const refined = 'Baue die Module und teste sie danach.';
  const answer = `Klar, gerne. Hier ist der verbesserte Prompt: ${refined}`;
  const memory = new Map();
  let saves = 0;
  const store = {
    contract: bundle.INDEX_STORE_CONTRACT,
    load: (namespace) => ({ ok: true, state: memory.get(namespace) ?? null }),
    save: (namespace, state) => { saves += 1; memory.set(namespace, state); return { ok: true, rows: 1 }; },
  };
  const services = { [bundle.INDEX_STORE_SERVICE]: store };
  const fire = async (connection, sessionId = 'sess-1') => {
    const claimed = [userMessage('baue module und teste sie danach')];
    await connection.ctx.waterfall(
      bundle.PRE_STEP_EVENT,
      { ...stepPayload(claimed), agent: { session: { id: sessionId } } },
      loopDefault(claimed),
    );
    return connection.records.at(-1);
  };

  const off = connect({ ...route, salvageNamespace: '' }, { llm: fakeLlm(answer), services });
  assert.equal((await fire(off)).salvage.count, 1);
  assert.equal(saves, 0, 'leerer Namensraum heisst AUS, nicht Vorgabe');
  off.dispose();

  // Ein Stand mit fremdem Vertrag: der Zaehler faengt bei 1 an, statt ihn zu deuten.
  memory.set(bundle.SALVAGE_NAMESPACE, {
    memos: [{ id: bundle.SALVAGE_MEMO_ID, salvage: { contract: 'fremd/v1', sessions: { 'sess-1': { count: 99 } } } }],
  });
  const foreign = connect({ ...route }, { llm: fakeLlm(answer), services });
  assert.equal((await fire(foreign)).salvage.count, 1, 'fremder Vertrag zaehlt nicht als Historie');
  foreign.dispose();
});
test('SALVAGED_PROSE: ein JSON im Zaun (auch abgeschnitten) ersetzt den Prompt nicht', async () => {
  const cases = [
    '```json\n{"enhancedPrompt": "Analysiere im Shinon-Forge-Repo, wo Fallbacks",',
    '```json\n{"enhancedPrompt": "Analysiere im Shinon-Forge-Repo, wo Fallbacks und Eskalationen"}\n```',
    '```json\n[1, 2, 3',
  ];
  for (const answer of cases) {
    const { ctx, records, dispose } = connect({ ...route }, { llm: fakeLlm(answer) });
    const claimed = [userMessage('analysiere fallbacks')];
    const decision = await ctx.waterfall(bundle.PRE_STEP_EVENT, stepPayload(claimed), loopDefault(claimed));
    assert.equal(decision.messages[0].content[0].text, 'analysiere fallbacks', `Rohtext bleibt: ${answer.slice(0, 24)}`);
    assert.equal(records[0].outcome, 'rejected', `JSON ist kein Prompt: ${answer.slice(0, 24)}`);
    assert.ok(records[0].reasons.length > 0);
    dispose();
  }
});
