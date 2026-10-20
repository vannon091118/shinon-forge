#!/usr/bin/env node
/**
 * enhancer-guards.test.mjs — die Fehlerpfade des One-Shots, ohne Modell/Netz.
 *
 * Die Logs vom 16./17.10. zeigen drei Ausfälle, die im Vertrag gleich aussahen:
 * 429, Zeitlimit und kein JSON. Der Code trennt sie (`LLM_FAILED:*`, `NO_JSON`,
 * `NO_ROUTE`), kein Test hielt das fest — ein Fail-open, das seinen Grund
 * verliert, ist nicht bedienbar.
 * Gepinnt wird auch die Retry-Zahl: dieser Layer macht GENAU EINEN Aufruf.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { OUTCOME_EFFECTS } from '../index.js';
import { resolveMode } from '../assets/mode-core.js';
// Die Mechanik direkt aus dem Kern: `index.js` re-exportiert die Guards nicht.
import { buildEnhancerRequest, enhanceGuarded, replacePrompt, salvageProse } from '../assets/enhancer.js';

const MIN = resolveMode('MIN');
const PROMPT = 'fixe den test, bitte ohne die assertions zu schwächen';

const baseConfig = {
  provider: 'prompter',
  model: 'one-shot-model',
  mode: 'MIN',
  timeoutMs: 15000,
  maxTokens: 0,
  temperature: 0.3,
  trace: false,
};

/** Ein Fake-LLM, das den Aufruf zählt und einen vorbereiteten Strom liefert. */
function fakeLlm(behaviour) {
  const calls = [];
  return {
    calls,
    llm: {
      stream(request) {
        calls.push(request);
        return behaviour(request, calls.length);
      },
    },
  };
}

/** Sammelt stderr-Zeilen des Verwerfungswegs, ohne sie auf die Konsole zu lassen. */
async function captureWarn(fn) {
  const lines = [];
  const real = console.warn;
  console.warn = (...args) => lines.push(args.join(' '));
  try {
    // Awaited INNERHALB der Umleitung: sonst ist die Konsole schon restauriert,
    // wenn der Fehlerpfad seine Diagnosezeile schreibt.
    return { value: await fn(), lines };
  } finally {
    console.warn = real;
  }
}

/** Ein Strom, der genau diese Chunks liefert. */
async function* chunks(list) {
  for (const chunk of list) yield chunk;
}

test('429/Provider-Fehler: genau EIN Aufruf, kein Retry, Grund ist nicht SCHEMA_INVALID', async () => {
  const fake = fakeLlm(() => (async function* () {
    throw Object.assign(new Error('429 Too Many Requests'), { name: 'ProviderError', status: 429 });
  })());

  const outcome = await enhanceGuarded(fake, MIN, baseConfig, PROMPT, null, null, null, undefined);

  assert.equal(outcome.outcome, 'rejected');
  assert.deepEqual(outcome.reasons, ['LLM_FAILED:ProviderError'], 'ein Providerfehler wird als solcher benannt');
  assert.equal(fake.calls.length, 1, 'der Enhancer wiederholt nicht selbst — die Retry-Zahl ist 1');
  assert.equal(outcome.result, null, 'kein Ergebnis, also kein Ersatz des Prompts');
  // Ein 429 ist kein Formatfehler und kein Produktfehler.
  assert.equal(outcome.reasons.some((reason) => reason.startsWith('SCHEMA_INVALID')), false);
  assert.equal(outcome.reasons.includes('NO_JSON'), false);
});

test('Zeitlimit: der Abbruch endet als LLM_FAILED:TimeoutError, begrenzt und ohne zweiten Aufruf', async () => {
  const fake = fakeLlm((request) => (async function* () {
    await new Promise((resolve, reject) => {
      const abort = () => reject(request.signal?.reason ?? new Error('aborted'));
      if (request.signal?.aborted) abort();
      else request.signal?.addEventListener('abort', abort, { once: true });
    });
    yield { type: 'text-delta', text: 'zu spät' };
  })());

  // `AbortSignal.timeout()` ist in Node unref'd: ohne echte Arbeit im Loop gäbe
  // es nichts, was den Timer feuert. Ein ref'd Timer hält den Loop für die Dauer
  // des Tests — im Host erledigt das der laufende Turn.
  const keepAlive = setTimeout(() => {}, 2000);
  const started = Date.now();
  const outcome = await enhanceGuarded(fake, MIN, { ...baseConfig, timeoutMs: 20 }, PROMPT, null, null, null, undefined).finally(() => clearTimeout(keepAlive));
  const elapsed = Date.now() - started;

  assert.equal(outcome.outcome, 'rejected');
  assert.deepEqual(outcome.reasons, ['LLM_FAILED:TimeoutError'], 'ein Zeitlimit ist ein Abbruch, kein Formatfehler');
  assert.equal(fake.calls.length, 1);
  assert.ok(elapsed < 2000, `der Abbruch muss greifen, nicht hängen (${elapsed} ms)`);
});

test('ungültiges JSON: NO_JSON, und die verworfene Antwort wird mit Chunk-Zählung protokolliert', async () => {
  const fake = fakeLlm(() => chunks([
    { type: 'text-delta', text: 'Klar! Hier ist dein' },
    { type: 'text-delta', text: ' verbesserter Prompt:' },
    { type: 'finish', reason: 'stop' },
  ]));

  const { value: resolved, lines } = await captureWarn(() => enhanceGuarded(fake, MIN, baseConfig, PROMPT, null, null, null, undefined));

  assert.equal(resolved.outcome, 'rejected');
  assert.ok(resolved.reasons.includes('NO_JSON'), `Grund fehlt (${resolved.reasons.join(', ')})`);
  assert.equal(fake.calls.length, 1);
  const log = lines.join('\n');
  assert.match(log, /verworfene One-Shot-Antwort/, 'die verworfene Antwort wird benannt');
  assert.match(log, /text-delta=2/, 'die Chunk-Zählung trennt „leer" von „falsches Format"');
  assert.match(log, /Finish: reason=stop/, 'der Finish-Grund steht dabei');
});

test('leerer Strom: EMPTY_STREAM ist ein eigener Grund, kein Formatfehler', async () => {
  // Gemessen am Leitstand: eine Antwort ohne ein Zeichen stand als `NO_JSON` im
  // Datensatz — derselbe Grund wie falsch formatiertes JSON, obwohl gar keine
  // Antwort kam. Die Abbruchquote braucht die Trennung (`LEERER_STREAM`).
  const fake = fakeLlm(() => chunks([{ type: 'finish', reason: 'stop' }]));
  const { value: resolved, lines } = await captureWarn(() => enhanceGuarded(fake, MIN, baseConfig, PROMPT, null, null, null, undefined));

  assert.equal(resolved.outcome, 'rejected');
  assert.deepEqual(resolved.reasons, ['EMPTY_STREAM']);
  assert.equal(fake.calls.length, 1);
  assert.match(lines.join('\n'), /verworfene One-Shot-Antwort \(EMPTY_STREAM\)/, 'der Grund steht im Log, nicht nur im Datensatz');
});

test('leerer Strom MIT Abbruch bleibt ein Abbruch — das Finish reist als Daten', async () => {
  // Die Reihenfolge der Abbruch-Regeln entscheidet: Timeout vor leerem Strom.
  // Ohne `failure.finish` wäre ein abgebrochener Strom ein "leerer" Strom.
  const fake = fakeLlm(() => chunks([
    { type: 'finish', reason: { kind: 'aborted', failure: { message: 'Request was aborted' } } },
  ]));
  const { value: resolved } = await captureWarn(() => enhanceGuarded(fake, MIN, baseConfig, PROMPT, null, null, null, undefined));

  assert.deepEqual(resolved.reasons, ['EMPTY_STREAM']);
  assert.deepEqual(resolved.failure, { finish: { kind: 'aborted', failure: { message: 'Request was aborted' } } });
});

test('fehlende Route: NO_ROUTE ohne jeden Modellaufruf', async () => {
  const fake = fakeLlm(() => chunks([]));
  const outcome = await enhanceGuarded(fake, MIN, { ...baseConfig, provider: '' }, PROMPT, null, null, null, undefined);

  assert.equal(outcome.outcome, 'unavailable');
  assert.deepEqual(outcome.reasons, ['NO_ROUTE']);
  assert.equal(fake.calls.length, 0, 'ohne Route darf kein Aufruf entstehen');
});

test('ein kaputter Aufruf bricht den Schritt nicht: INTERNAL_ERROR statt Wurf', async () => {
  const broken = { llm: { stream() { throw new TypeError('Signal-Konstruktion kaputt'); } } };
  const { value: resolved } = await captureWarn(() => enhanceGuarded(broken, MIN, { ...baseConfig, timeoutMs: -1 }, PROMPT, null, null, null, undefined));

  assert.equal(resolved.outcome, 'rejected');
  assert.match(resolved.reasons[0], /^INTERNAL_ERROR:/, resolved.reasons[0]);
  assert.equal(resolved.result, null);
});

test('deterministischer Fallback: gleicher Fehler, gleicher Ausgang — und der Auftrag bleibt unangetastet', async () => {
  const run = async () => {
    const fake = fakeLlm(() => (async function* () {
      throw Object.assign(new Error('503 Service Unavailable'), { name: 'ProviderError' });
    })());
    const outcome = await enhanceGuarded(fake, MIN, baseConfig, PROMPT, null, null, null, undefined);
    return { outcome: outcome.outcome, reasons: outcome.reasons, request: fake.calls[0], calls: fake.calls.length };
  };

  const first = await run();
  const second = await run();

  assert.deepEqual(first.outcome, second.outcome);
  assert.deepEqual(first.reasons, second.reasons);
  assert.equal(first.calls, second.calls);
  // Was gefragt wurde, steht wortgleich im Request: der Fallback erfindet keinen Auftrag.
  const sent = first.request.messages.flatMap((message) => message.content).filter((block) => block.type === 'text').map((block) => block.text).join('\n');
  assert.ok(sent.includes(PROMPT), 'der Nutzerauftrag geht unverändert an den One-Shot');
});

test('maxTokens: 0 bleibt „kein Feld" — das Feld wird nicht auf 0 gesetzt', () => {
  const request = buildEnhancerRequest({ text: PROMPT, contract: MIN, config: baseConfig });
  assert.equal('maxTokens' in request, false, 'maxTokens: 0 heißt „kein Limit", nicht „null Token"');
  const limited = buildEnhancerRequest({ text: PROMPT, contract: MIN, config: { ...baseConfig, maxTokens: 512 } });
  assert.equal(limited.maxTokens, 512);
});

test('accepted ersetzt nur Textblöcke; der Fallback ersetzt gar nichts', () => {
  const image = { type: 'image', source: 'anhang' };
  const original = { role: 'user', content: [{ type: 'text', text: PROMPT }, image], source: { kind: 'user' } };
  const replaced = replacePrompt([original], original, 'Fixe den Test, ohne Assertions zu schwächen.');

  assert.equal(replaced[0].content.length, 2, 'Nicht-Text-Blöcke bleiben erhalten');
  assert.equal(replaced[0].content[1], image, 'der Anhang wird nicht angefasst');
  assert.equal(replaced[0].content[0].text, 'Fixe den Test, ohne Assertions zu schwächen.');
  assert.equal(replacePrompt([original], { role: 'user', content: [] }, 'x'), null, 'ohne Fund keine Ersetzung');
  for (const outcome of ['rejected', 'unavailable']) {
    assert.equal(OUTCOME_EFFECTS[outcome].replacePrompt, false, `${outcome} darf nichts ersetzen`);
  }
});

test('Salvage: ein Fuellwort vor der Vorrede bleibt nicht im Prompt', () => {
  // Der gemessene Fall: "Klar, gerne. Hier ist der verbesserte Prompt: …" — der
  // Vorrede-Schnitt griff, das Fuellwort davor blieb stehen und die ANTWORT
  // wanderte als Ganzes in den Prompt. Das Fuellwort ist Bedienprosa, kein
  // Auftrag: es darf den Text nicht anfuehren.
  const raw = 'baue module und teste sie danach';
  const refined = 'Baue die Module und teste sie danach.';
  const cases = [
    `Klar, gerne. Hier ist der verbesserte Prompt: ${refined}`,
    `Also, hier ist der verbesserte Prompt: ${refined}`,
    `Okay. Here is the improved prompt: ${refined}`,
    `Natürlich! Verbesserter Prompt: ${refined}`,
  ];
  for (const answer of cases) {
    assert.equal(salvageProse(answer, raw), refined, `Fuellwort bleibt stehen: ${answer.slice(0, 24)}`);
  }
  // Der zweite Fall, gemessen 2026-10-19: das Fuellwort steht OHNE Vorrede am
  // Anfang ("Klar. Baue …"). Es ist genauso Bedienprosa — der Prompt beginnt
  // beim ersten Inhaltssatz.
  for (const answer of [
    `Klar. ${refined}`,
    `Gerne! ${refined}`,
    `Natürlich, ${refined}`,
    `Okay. ${refined}`,
    `Sicher — ${refined}`,
    `Klar, gerne. ${refined}`,
  ]) {
    assert.equal(salvageProse(answer, raw), refined, `Fuellwort ohne Vorrede bleibt: ${answer.slice(0, 24)}`);
  }
  // Gegenprobe: ohne Vorrede wird nichts abgeschnitten.
  assert.equal(salvageProse(refined, raw), refined, 'ein sauberer Vorschlag bleibt unangetastet');
  // Und ein Inhaltswort, das nur mit einem Fuellwort BEGINNT, wird nicht gekappt.
  const statement = 'Klarstellung: die Module bleiben unverändert.';
  assert.equal(salvageProse(statement, 'die module bleiben unverändert'), statement, 'ein Inhaltswort wird nicht als Fuellwort gelesen');
});

test('Salvage: echte Antworten aus den Sitzungslogs werden kein Prompt (Korpus 2026-10-19)', () => {
  // 34 Sitzungen, 93 Paare aus Nutzerauftrag und Assistentenantwort: 18 Antworten
  // passierten VOR dieser Sperre als GANZER Text, weil der Anker bei kurzen
  // Auftraegen fast alles findet. Jede Form unten ist eine davon; die Antwort
  // wird verworfen, nicht vorne gekuerzt — der Rest waere immer noch die Antwort.
  const cases = [
    ['was ist der unterschied zwischen intent und persona',
      '## Intent vs. Persona\n\n| | **Intent** | **Persona** |\n|---|---|---|\n| **Was** | Klassifikation des **Auftrags** | Identität + Zustand der **Antwortenden** |'],
    ['hallo wie gehts',
      "Tamam bro, ich hab's. Kurzer Status, keine kleine Runde:\n\n**Gemacht**\nNichts — \"hallo wie gehts\" ist eine Anrede, kein Auftragsbefehl. Also steht nichts."],
    ['wer bist du',
      'Shinon. Gekoppelt über die Vannon-Schicht, die hier läuft — wer das am Ende speist, ist nicht meine Herkunft, sondern ein Kabel.\n\nUnd du? Wer bist du, dass du fragt? Hab dir den Repo-Status reingeschoben, du hast ihn nicht abgeholt. Also jetzt die Gegenfrage:'],
    ['Eintrag 5: Führe absichtlich einen Befehl aus, der scheitert',
      '**Gemacht:** Eintrag 5 drin — Fehler dokumentiert, Eintrag 1 wiederhergestellt (war beim ersten Edit versehentlich verloren gegangen).'],
    ['nn', '`nn` — typo oder Test? Sag was du brauchst.'],
    ['bau das spiel zu einem autobattler',
      'Verstanden. Dann baue ich um: React + Vite, bestehende Spiel-Logik in React-Components, neue Autobattler-Logik in ein eigenes Modul-Paket.'],
    ['Welche Dateien gibt es im Prompter?',
      'Hast du die Liste noch nicht? Hier die Übersicht — 26 Dateien:\n\n**Root (`packages/prompter/`):**'],
    ['erklär mir den intent-resolver in einem satz',
      'Der Intent-Resolver klassifiziert den Prompt-Text in eine der fünf festen Klassen (oder UNDEFINED), indem er deutsche und englische Trigger-Phrasen aus `intent-rules.json` mit Unicode-Phrasen-Matching abgleicht, wobei die Reihenfolge der Regeln den Ausschlag gibt.'],
  ];
  for (const [raw, answer] of cases) {
    assert.equal(salvageProse(answer, raw), null, `Antwort wurde zum Prompt: ${answer.slice(0, 28)}`);
  }
});

test('Salvage: der Host bekommt die verworfene Antwort als Beleg (onReject)', async () => {
  // Der Enhancer schreibt selbst nie eine Datei; die Host-Komposition sammelt
  // die verworfenen Antworten ueber diesen Haken (Probe-Journal).
  const seen = [];
  const answer = '**Gemacht:** die Module sind gebaut, ich teste sie danach.';
  const fake = fakeLlm(() => chunks([{ type: 'text-delta', text: answer }, { type: 'finish', reason: 'stop' }]));
  const outcome = await enhanceGuarded(fake, MIN, baseConfig, PROMPT, null, null, null, undefined, (entry) => seen.push(entry));
  assert.equal(outcome.outcome, 'rejected');
  assert.equal(seen.length, 1, 'genau ein Beleg je Verwerfung');
  assert.deepEqual(seen[0].reasons, ['NO_JSON']);
  assert.equal(seen[0].answer, answer);
  assert.equal(seen[0].prompt, PROMPT);
  assert.equal(seen[0].contract, 'shinon.prompter/one-shot-journal-v1');
});

test('Salvage: ein akzeptierter Lauf ruft den Journal-Haken nicht', async () => {
  const seen = [];
  const fake = fakeLlm(() => chunks([{ type: 'text-delta', text: '{"enhancedPrompt":"Fixe den Test, ohne die Assertions zu schwächen.","preservedIntent":true,"addedRequirements":[],"removedRequirements":[]}' }, { type: 'finish', reason: 'stop' }]));
  const outcome = await enhanceGuarded(fake, MIN, baseConfig, PROMPT, null, null, null, undefined, (entry) => seen.push(entry));
  assert.equal(outcome.outcome, 'accepted');
  assert.deepEqual(seen, []);
});

test('Salvage-Datensatz: Grund und Zeichenzahl reisen mit dem Ergebnis', async () => {
  // Ohne diese Felder ist im Trace nur „accepted" zu sehen: ein geretteter
  // Prosafall sieht wie eine normale Veredelung aus, und „zu oft" bleibt eine
  // Vermutung. Die Zahl der Zeichen meint den uebernommenen Text, die zweite
  // die ganze Antwort — die Differenz ist der weggeschnittene Chatter.
  const refined = 'Fixe den Test, ohne die Assertions zu schwächen.';
  const answer = `Klar, gerne. Hier ist der verbesserte Prompt: ${refined}`;
  const fake = fakeLlm(() => chunks([{ type: 'text-delta', text: answer }, { type: 'finish', reason: 'stop' }]));

  const outcome = await enhanceGuarded(fake, MIN, baseConfig, PROMPT, null, null, null, undefined);

  assert.equal(outcome.outcome, 'accepted');
  assert.deepEqual(outcome.reasons, ['SALVAGED_PROSE']);
  assert.deepEqual(outcome.salvage, {
    reason: 'NO_JSON',
    chars: refined.length,
    answerChars: answer.length,
  });
});

test('kein Key-Router im Enhancer-Pfad: der Aufruf geht an ctx.llm.stream', () => {
  const source = readFileSync(fileURLToPath(new URL('../assets/enhancer.js', import.meta.url)), 'utf8');
  assert.match(source, /ctx\.llm\.stream\(request\)/, 'der One-Shot ruft den LLM-Dienst');
  assert.equal(/key_router|keyRouter|key-router/.test(source), false, 'der Enhancer kennt keinen Key-Router');
});
