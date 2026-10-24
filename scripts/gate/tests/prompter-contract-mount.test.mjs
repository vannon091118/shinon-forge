/**
 * Laden und Isolation: das Bundle haengt am ECHTEN Waterfall und traegt keine
 * Faehigkeit.
 *
 * Eigener Eigentuemer (Schnitt 2026-10-24): hier wird nicht der Vertrag geprueft
 * (das tut `prompter-contract.part2.test.mjs`), sondern die MONTAGE — dass der
 * Host ueber Cordis mountet, `inject: ['llm']` deklariert, nach `dispose` nichts
 * mehr registriert und dass kein Laufzeitmodul Dateisystem, Netz oder einen
 * Werkzeugkatalog oeffnet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly, findForbidden, stripComments } from '../../lib/source-scan.mjs';
import { quiet } from './helpers/console.mjs';
import { PACKAGE_DIR, INDEX_FILE, bundle, Context, goodResult, reply, userMessage, stepPayload, connect, fakeLlm, route, loopDefault, runtimeModules } from './prompter-contract-fixtures.mjs';

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
