#!/usr/bin/env node
/**
 * Die drei Verdrahtungen, die am 2026-10-21 tot waren — geprüft durch den
 * ECHTEN Event-Spine, nicht durch einen nachgebauten Kanal.
 *
 * Der Spine (`packages/events`) ist das eine Stück, das rohe DSH-Ereignisse
 * (`session/event`, `(session, event)`, Text als Blockliste) in normalisierte
 * Envelopes (`shinon/event`, `message.received`, `turn.end`, …) übersetzt. Die
 * drei Befunde waren genau hier:
 *
 *   1. Persona las den Text nur als String. Ein `user/message` trägt ihn als
 *      Blockliste — User-Lage, Anrede und Gedächtnis-Relevanz fielen aus.
 *   2. Der Skill-Lebenszyklus hörte auf `shinon/event`, verglich aber mit den
 *      ROHEN Namen (`turn/end`, `feedback/message-put`) — er feuerte nie.
 *   3. Für `relation.updated` gab es Konsumenten, aber keinen Produzenten.
 *
 * Jeder Test fährt den Pfad, den der Host fährt: echtes Bundle, echte `apply()`,
 * echte Normalisierung. Kein DSH, kein Browser, kein Modell (der einzige
 * Modellaufruf ist der Fake des Skill-Lebenszyklus).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { quiet } from './helpers/console.mjs';
import { waitFor } from './helpers/wait.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SESSION = { id: 'sess-spine-1' };
const PACKAGES = ['events', 'persona', 'prompter', 'narrative'];

/** Die Pakete als Kopie laden — mit Schemastery-Stub und echtem Naht-Kern. */
async function loadBundles() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-spine-wiring-'));
  const stub = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-stub', type: 'module', exports: { '.': './index.js' } }));
  // Der Stub muss nur Konstruktion und Aufrufe aushalten; die Tests rufen
  // `apply()` mit einem PLAINEN Config-Objekt, nicht mit `Config(...)`.
  writeFileSync(join(stub, 'index.js'), 'const p = new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : p), apply: () => p, construct: () => p });\nexport default p;\n');
  for (const name of PACKAGES) cpSync(join(ROOT, 'packages', name), join(work, 'packages', name), { recursive: true });
  provideSeamCore(work);
  const loaded = {};
  for (const name of PACKAGES) loaded[name] = await import(pathToFileURL(join(work, 'packages', name, 'index.js')).href);
  process.on('exit', () => {
    try { rmSync(work, { recursive: true, force: true }); } catch { /* Aufraeumen ist Beiwerk */ }
  });
  return loaded;
}

const loaded = await loadBundles();

/**
 * Ein Host mit EINEM Bus — dieselbe Bauform wie `scoring-signals.test.mjs`.
 * `provide` legt den Dienst zugleich als Eigenschaft ab (`ctx.llm`), weil der
 * Prompter ihn so liest; `inject` ruft nur, wenn alle Dienste da sind.
 */
function createHost(services = {}) {
  const handlers = new Map();
  const provided = new Map(Object.entries(services));
  const disposers = [];
  const api = {
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) ?? []).filter((entry) => entry !== handler));
    },
    emit(name, ...args) {
      for (const handler of [...(handlers.get(name) ?? [])]) handler(...args);
    },
    get(name) {
      return provided.get(name);
    },
    provide(name, service) {
      provided.set(name, service);
      api[name] = service;
      return () => provided.delete(name);
    },
    effect(cb) {
      const disposer = cb();
      if (typeof disposer === 'function') disposers.push(disposer);
      return disposer;
    },
    inject(names, cb) {
      if (!names.every((name) => provided.has(name))) return undefined;
      const child = Object.create(api);
      for (const name of names) child[name] = provided.get(name);
      return cb(child);
    },
  };
  for (const [name, service] of provided) api[name] = service;
  return {
    ctx: api,
    handlers,
    provided,
    dispose: () => {
      for (const dispose of disposers.splice(0)) {
        try { dispose(); } catch { /* schon weg */ }
      }
    },
  };
}

/** Der echte `getSectionOrder`/`section`-Vertrag des System-Prompts, minimal. */
function systemPromptHub() {
  const entries = new Map();
  const contexts = new Map();
  return {
    getSectionOrder(name) {
      return name === 'DEPLOYMENT_PERSONA_PREFIX' ? 0 : 9000;
    },
    section(entry) {
      entries.set(entry.name, entry);
      return () => {
        if (entries.get(entry.name) === entry) entries.delete(entry.name);
      };
    },
    // Der Live-Zustand ist RUNTIME-CONTEXT, kein Abschnitt: eigener Kanal.
    context(entry) {
      contexts.set(entry.name, entry);
      return () => {
        if (contexts.get(entry.name) === entry) contexts.delete(entry.name);
      };
    },
    rawContext(name) {
      const entry = contexts.get(name);
      if (!entry) return null;
      return { ...entry, text: typeof entry.text === 'function' ? entry.text(ASSEMBLY) : entry.text };
    },
    raw(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      // Der Vertrag erlaubt `text` als Funktion (bei jeder Assembly neu
      // ausgewertet); der Test will den Text dieser Assembly sehen.
      return { ...entry, text: typeof entry.text === 'function' ? entry.text(ASSEMBLY) : entry.text };
    },
    render(context) {
      return [...entries.values()]
        .sort((left, right) => left.order - right.order)
        .map((entry) => ({
          name: entry.name,
          order: entry.order,
          text: typeof entry.text === 'function' ? entry.text(context) : entry.text,
        }))
        .filter((entry) => typeof entry.text === 'string' && entry.text.trim() !== '');
    },
  };
}

/** Die Assembly-Sicht der laufenden Sitzung: der cwd entscheidet den Scope. */
const ASSEMBLY = { agent: { session: { header: { cwd: ROOT } } } };

/** Logs der Bundles sind Teil ihres Verhaltens, nicht des Tests. */
const EVENTS_CONFIG = {
  schemaPath: './assets/event-spine.json',
  replayPath: './assets/replay/session-created.json',
  emitChannel: 'shinon/event',
  defaultSessionId: '',
  clock: '2026-10-21T00:00:00.000Z',
};

const PERSONA_CONFIG = {
  workspaceRoot: ROOT,
  // Ohne den Zustandsvertrag ist `relation` leer und die Stufenpruefung
  // koennte gar nicht greifen — der Pfad ist relativ zum Paket.
  statePath: './assets/persona-state.json',
  identity: 'PERSONA-MARKE',
  alwaysKnowIdentity: false,
  projectContextPath: '',
  selfModelNamespace: '',
  identityScope: 'workspace',
  eventsChannel: 'shinon/event',
};

/** Ein echtes DSH-Sitzungsereignis — `(session, event)`, Text als Blockliste. */
const sessionEvent = (type, data, seq = 1) => ({ type, seq, time: 1792550000000, data });
const humanMessage = (text, id = 'm-1') => sessionEvent('user/message', {
  id,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
});

const GOOD = {
  name: 'spine-whitelist-regel',
  thema: 'gate',
  description: 'Nutzen wenn eine neue Datendatei im assets-Ordner eines Pakets entsteht, damit das Gate sie kennt.',
  bei: 'Eine neue Datendatei kommt in den assets-Ordner eines Pakets',
  immer: 'den Dateinamen in die Whitelist des Gate-Plugins eintragen',
  weil: 'das Gate prueft jede Datei gegen eine feste Liste',
};
// ── 1. Persona liest die Blockliste ─────────────────────────────────────────

test('persona: der Text einer echten user/message-Blockliste erreicht User-Lage, Anrede und Gedaechtnis', async () => {
  const hub = systemPromptHub();
  const stamp = '2026-10-21T00:00:00.000Z';
  const memory = {
    contract: 'shinon.persona-memory/v1',
    version: 1,
    seq: 1,
    firstSeen: stamp,
    lastSeen: stamp,
    entries: [{
      id: 'evidence|root|alles-schief',
      kind: 'evidence',
      scope: ROOT,
      subject: 'alles schief',
      detail: 'ein Beleg aus einem frueheren Lauf',
      evidence: 1,
      strength: 1,
      firstSeen: stamp,
      lastSeen: stamp,
      seq: 1,
    }],
    proposals: [],
  };
  const store = {
    contract: loaded.persona.INDEX_STORE_CONTRACT,
    load: (namespace) => (namespace === loaded.persona.MEMORY_NAMESPACE
      ? { ok: true, state: { memos: [{ id: loaded.persona.MEMORY_MEMO_ID, memory }] } }
      : { ok: true, state: { memos: [] } }),
    save: () => ({ ok: true, rows: 1 }),
  };
  const host = createHost({ systemPrompt: hub, [loaded.persona.INDEX_STORE_SERVICE]: store });
  quiet(() => loaded.events.apply(host.ctx, EVENTS_CONFIG));
  quiet(() => loaded.persona.apply(host.ctx, { ...PERSONA_CONFIG, memoryNamespace: loaded.persona.MEMORY_NAMESPACE }));
  const disposePersona = host.dispose;

  // Vor dem Ereignis: keine Reaktion -> kein Beleg im Gedaechtnisblock.
  assert.equal((hub.rawContext('shinon:persona-live')?.text ?? '').includes('Besondere Reaktion'), false, 'Reaktion ohne Ereignis');
  assert.equal(hub.render(ASSEMBLY).some((section) => section.name === 'shinon:memory'), false, 'Beleg ohne Prompt-Text');

  host.ctx.emit('session/event', SESSION, humanMessage('Boah, heute laeuft alles schief, ich bin genervt. Wer bist du?'));

  const live = hub.rawContext('shinon:persona-live');
  assert.ok(live, 'Live-Kanal fehlt — der Blocklisten-Text kam nicht an');
  assert.match(live.text, /Besondere Reaktion: der Mensch ist genervt/);
  const trigger = hub.raw('shinon:identity-trigger');
  assert.ok(trigger, 'Anrede fehlt — der Blocklisten-Text kam nicht an');
  assert.match(trigger.text, /wer bist du/i);
  const memorySection = hub.render(ASSEMBLY).find((section) => section.name === 'shinon:memory');
  assert.ok(memorySection, 'Gedaechtnis-Abschnitt fehlt');
  assert.match(memorySection.text, /Beleg: alles schief/);

  disposePersona();
});

// ── 2. Die Lernpruefung hoert auf die normalisierten Namen ──────────────────

test('skills: die Lernpruefung feuert auf turn.end durch den echten Spine und schreibt den Skill', async () => {
  const project = mkdtempSync(join(tmpdir(), 'shinon-spine-skills-'));
  mkdirSync(join(project, '.agents', 'skills'), { recursive: true });
  const previous = process.cwd();
  process.chdir(project);
  const calls = [];
  // Die Antwort des Reviewers: ein Skill, mit einer Quelle, die im Digest stand.
  const answer = { decision: 'skill', reason: 'Der Zug zeigt einen wiederverwendbaren Ablauf.', sources: ['message:msg-1'], candidate: GOOD };
  const llm = {
    stream(request) {
      calls.push(request);
      return (async function* chunks() {
        yield { type: 'text-delta', index: 0, text: JSON.stringify(answer) };
      })();
    },
  };
  const host = createHost({ llm });
  let disposePrompter = null;
  try {
    quiet(() => loaded.events.apply(host.ctx, EVENTS_CONFIG));
    disposePrompter = quiet(() => loaded.prompter.apply(host.ctx, {
      observeEvents: ['agent/pre-step'],
      mode: 'MAX',
      provider: 'prompter',
      model: 'fake-model',
      skillsPath: '.agents/skills',
      // SH-LEARN-03/04: die Lernpruefung, Skill-Schreibfreigabe aus (der
      // eindeutige Fall gilt automatisch). Die Pfade sind Projektzustand.
      learningReview: { enabled: true, skillWriteApproval: false, registryPath: '.shinon/learning-proposals.json', usagePath: '.shinon/skill-usage.json' },
      notesPath: '',
      eventsChannel: 'shinon/event',
      workspaceRoot: project,
      trace: false,
    }));

    const send = (type, data) => host.ctx.emit('session/event', SESSION, sessionEvent(type, data));
    // Kennungen sind Pflicht: der Digest nennt Quellen NUR mit echter Id.
    send('user/message', { role: 'user', message: { id: 'msg-1' }, content: [{ type: 'text', text: 'Bitte pruefe die neue Gate-Datei.' }], source: { kind: 'user' } });
    send('assistant/message', { message: { id: 'msg-2', content: [{ type: 'text', text: 'Die Gate-Datei ist geprueft.' }] } });
    // Der Reviewer prueft ohne Korrektur erst nach drei abgeschlossenen Zuegen
    // (`nudgeTurns`) — und ruft das Modell dann GENAU EINMAL.
    for (const turn of [1, 2, 3]) send('turn/end', { turn, reason: { kind: 'completed' } });

    const file = join(project, '.agents', 'skills', GOOD.name, 'SKILL.md');
    const written = await waitFor(() => existsSync(file), { timeoutMs: 3000, stepMs: 10 });
    assert.equal(written, true, 'kein Skill geschrieben — die Lernpruefung hat das normalisierte turn.end nicht gehoert');
    assert.match(readFileSync(file, 'utf8'), /den Dateinamen in die Whitelist des Gate-Plugins eintragen/);
    assert.equal(calls.length, 1, 'genau ein Modellaufruf fuer drei Zuege');

    // Die zweite Ausloeser-Art: die rohe negative Bewertung (`feedback/message-put`)
    // muss als `feedback.rated` ankommen, sonst entsteht nie eine Korrektur.
    send('feedback/message-put', { sessionId: SESSION.id, item: { messageId: 'msg-9', rating: 'negative' } });
    send('feedback/record', { text: 'Nein, die Whitelist war nicht der Punkt.' });
    const corrected = await waitFor(() => calls.length === 2, { timeoutMs: 5000, stepMs: 10 });
    assert.equal(corrected, true, 'keine Korrektur — die Lernpruefung hat feedback.rated nicht gehoert');
    assert.match(calls[1].messages[0].content[0].text, /Nein, die Whitelist war nicht der Punkt\./);
  } finally {
    if (typeof disposePrompter === 'function') disposePrompter();
    host.dispose();
    process.chdir(previous);
    rmSync(project, { recursive: true, force: true });
  }
});

// ── 3. Ein Produzent für die Beziehungsstufe ────────────────────────────────

test('relation: der ausdrueckliche Akt erreicht den Zustand — nicht den Prompt', async () => {
  const hub = systemPromptHub();
  const routes = [];
  const webServer = {
    register(route) {
      routes.push(route);
      return () => {};
    },
  };
  const host = createHost({ systemPrompt: hub, webServer });
  quiet(() => loaded.events.apply(host.ctx, EVENTS_CONFIG));
  quiet(() => loaded.persona.apply(host.ctx, {
    ...PERSONA_CONFIG,
    identityScope: 'global',
    memoryNamespace: '',
  }));
  quiet(() => loaded.narrative.apply(host.ctx, { stateNamespace: '', eventsChannel: 'shinon/event' }));

  // KEIN Dienst mehr (2026-10-23): die Naht ist die Route; das Dienst-Angebot
  // hatte keinen Leser. Gelesen wird der Vertrag jetzt über GET auf derselben
  // Route, die das Panel benutzt.
  const route = routes.find((entry) => entry.path === loaded.persona.RELATION_ROUTE);
  assert.ok(route, 'die Beziehungs-Route fehlt');
  const get = async () => {
    const res = { status: 0, body: '', writeHead(status) { this.status = status; }, end(value) { this.body = value; } };
    const req = Readable.from([]);
    req.method = 'GET';
    await route.handler(req, res);
    return { status: res.status, body: JSON.parse(res.body) };
  };
  const listed = await get();
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.levels, ['stranger', 'known', 'trusted', 'anchor']);
  const post = async (payload) => {
    const res = { status: 0, body: '', writeHead(status) { this.status = status; }, end(value) { this.body = value; } };
    const req = Readable.from([Buffer.from(JSON.stringify(payload))]);
    req.method = 'POST';
    await route.handler(req, res);
    return { status: res.status, body: JSON.parse(res.body) };
  };

  // Vor dem ersten Ereignis kennt der Host keine Sitzung — fail-closed.
  const early = await post({ level: 'trusted' });
  assert.equal(early.status, 400, 'ohne Sitzung setzt die Route eine Stufe');
  assert.equal(early.body.error, 'MISSING_SESSION');

  // Danach: das Panel schickt NUR die Stufe; die Sitzung kommt aus dem Ereignis,
  // das die Persona zuletzt gesehen hat (Route -> Dienst -> Signal -> Spine).
  host.ctx.emit('session/event', SESSION, humanMessage('Wir arbeiten schon lange zusammen.'));
  const res = await post({ level: 'trusted' });

  assert.equal(res.status, 200, `Route antwortete ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.level, 'trusted');

  // Der Startstand des Panels (dieselbe Naht wie der Banner): Stufen aus dem
  // Vertrag, Stand aus dem Zustand — ohne ihn zeigt das Panel nichts an.
  const table = [];
  host.ctx.emit(loaded.persona.INDEX_INJECT, table);
  const injected = table.find((entry) => entry.kind === 'global' && entry.name === loaded.persona.UI_STATE_GLOBAL);
  assert.ok(injected, 'der Zustands-Global fehlt');
  assert.deepEqual(injected.value.relation, { levels: ['stranger', 'known', 'trusted', 'anchor'], current: 'trusted' });
  // Der Prompt behauptet den Akt NICHT: Beziehungsstufe und Narrative sind
  // Metadaten. Was bleibt, ist der Zustand (UI-Global) — und kein Abschnitt.
  const rendered = hub.render(ASSEMBLY).map((section) => section.name);
  assert.equal(rendered.includes('shinon:state'), false, 'kein Zustands-Abschnitt mehr');
  assert.equal(rendered.includes('shinon:narrative-arc'), false, 'kein Narrativ-Abschnitt mehr');
  assert.equal((hub.rawContext('shinon:persona-live')?.text ?? '').includes('trusted'), false, 'keine Stufe im Live-Block');

  // Fail-closed: eine erfundene Stufe aendert nichts, ein fremder Koerper auch nicht.
  const invented = await post({ level: 'erfunden' });
  assert.equal(invented.status, 400, 'die Route setzt eine erfundene Stufe');
  assert.equal(invented.body.error, 'UNKNOWN_RELATION');

  // Und der naechste ausdrueckliche Akt hebt die Stufe weiter — ohne einen zweiten Weg.
  const next = await post({ level: 'anchor' });
  assert.equal(next.status, 200, `Route antwortete ${next.status}: ${JSON.stringify(next.body)}`);
  const later = [];
  host.ctx.emit(loaded.persona.INDEX_INJECT, later);
  const after = later.find((entry) => entry.kind === 'global' && entry.name === loaded.persona.UI_STATE_GLOBAL);
  assert.equal(after.value.relation.current, 'anchor', 'der naechste Akt hebt die Stufe');

  host.dispose();
});
