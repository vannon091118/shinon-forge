#!/usr/bin/env node
/**
 * Tests der Persona (Identity, State, Voice).
 *
 * Zwei Ebenen wie beim Event-Spine: (1) Vertrag + reine Ableitung, (2) der
 * echte Bundle-Pfad (Kopie + Schemastery-Stub) an einem Fake-Host, der nur
 * `on` und `inject` kennt. Damit ist die Nicht-Aktions-Grenze nicht behauptet,
 * sondern erzwungen: jeder andere Zugriff wuerde werfen.
 *
 * Läuft mit `node --test` — kein node_modules, kein DSH, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fingerprintRoot } from '../../../packages/seams/assets/seams.js';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import {
  EVENT_TYPES as SPINE_EVENTS,
} from '../plugins/events-spine.mjs';
import {
  PERSONA_EVENT_TYPES,
  STATE_FIELDS,
  stateContractIssues,
  staticIssues,
} from '../plugins/persona.mjs';
import { quiet } from './helpers/console.mjs';

export const PACKAGE_DIR = fileURLToPath(new URL('../../../packages/persona/', import.meta.url));
/** Die Wurzel des Repos, in dem dieses Paket liegt — der EINE erlaubte Persona-Scope. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ASSET_FILE = join(PACKAGE_DIR, 'assets/persona-state.json');

export const contract = JSON.parse(readFileSync(ASSET_FILE, 'utf8'));
export const clone = (value) => JSON.parse(JSON.stringify(value));

/** Bundle isoliert laden: Kopie + Schemastery-Stub (nur Config-Konstruktion). */
export async function loadBundle() {
  const work = mkdtempSync(join(tmpdir(), 'shinon-persona-test-'));
  cpSync(PACKAGE_DIR, join(work, 'pkg'), { recursive: true });
  provideSeamCore(work);
  const stub = join(work, 'node_modules/@deepseek-ai/schemastery');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-test-stub', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(stub, 'index.js'), 'const p = new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : p), apply: () => p, construct: () => p });\nexport default p;\n');
  return import(pathToFileURL(join(work, 'pkg/index.js')).href);
}

export const bundle = await loadBundle();

/**
 * Fake-Host: kennt ausschließlich `on` (Events) und `inject` (System-Prompt).
 * Jeder Zugriff auf etwas anderes wirft — genau das ist die Grenze.
 */
export function createHost(services = {}) {
  const handlers = new Map();
  const sections = [];
  const contexts = [];
  const calls = [];
  const provided = {};
  const child = {
    // Der echte Cordis-Kontext kann lesen (`get`); die Persona nutzt das NUR,
    // um den `webServer` fuer ihre Routen zu holen — nie zum Handeln.
    get(name) {
      calls.push(`child.get:${name}`);
      return services[name];
    },
    effect(run) {
      calls.push('effect');
      const dispose = run();
      return () => dispose?.();
    },
    systemPrompt: {
      getSectionOrder(name) {
        calls.push(`getSectionOrder:${name}`);
        return name === 'DEPLOYMENT_PERSONA_PREFIX' ? 10 : 9000;
      },
      section({ name, order, text }) {
        calls.push(`section:${name}`);
        // Der echte Dienst loest `text` bei JEDER Assembly neu auf; der Fake
        // tut dasselbe ueber einen Getter — sonst saehe ein Test den alten Text.
        const entry = {
          name,
          order,
          get text() { return typeof text === 'function' ? text({}) : text; },
        };
        sections.push(entry);
        return () => {
          const at = sections.indexOf(entry);
          if (at >= 0) sections.splice(at, 1);
        };
      },
      // Der dynamische Zustand ist RUNTIME-CONTEXT, kein Abschnitt: er ERSETZT
      // pro Schritt den vorherigen Stand statt sich daneben zu stapeln.
      context({ name, order, text }) {
        calls.push(`context:${name}`);
        const entry = { name, order, get text() { return typeof text === 'function' ? text({}) : text; } };
        contexts.push(entry);
        return () => {
          const at = contexts.indexOf(entry);
          if (at >= 0) contexts.splice(at, 1);
        };
      },
    },
  };
  const ctx = {
    on(name, handler) {
      calls.push(`on:${name}`);
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    inject(names, callback) {
      calls.push(`inject:${names.join(',')}`);
      callback(child);
    },
    // Die EINE optionale Leseabfrage, die der echte Host auch hat (Zug 5: der
    // Ton des Scorings). Sie ist LESEND und nur da, wenn ein Test etwas anbietet:
    // ohne Dienste gibt es nichts zu holen, und kein Test kann darueber handeln.
    get(name) {
      calls.push(`get:${name}`);
      return services[name];
    },
    // Die Pruef-Naht wird vom Host angeboten, nicht von aussen gesetzt.
    provide(name, service) {
      calls.push(`provide:${name}`);
      provided[name] = service;
      return () => { delete provided[name]; };
    },
  };
  const dispatch = (channel, payload) => {
    const handler = handlers.get(channel);
    if (handler) handler(payload);
    return handler !== undefined;
  };
  const liveContext = () => contexts.find((entry) => entry.name === 'shinon:persona-live');
  const liveOf = () => liveContext()?.text ?? '';
  return { ctx, handlers, sections, contexts, calls, provided, dispatch, liveContext, liveOf };
}
/** Die Config, die jeder Aufbau teilt — ein Test kann einzelne Werte ersetzen. */
export const baseConfig = {
  statePath: './assets/persona-state.json',
  eventsChannel: 'shinon/event',
  identity: 'IDENT',
  epistemic: 'EPI',
  changeClasses: 'CC',
  determinism: 'DET',
  report: 'REP',
  // Scope ausdrücklich benannt: die Tests laufen IM Shinon-Repo, nicht „irgendwo“.
  workspaceRoot: REPO_ROOT,
};

export const connect = (services = {}, overrides = {}) =>
  quiet(() => {
    const host = createHost(services);
    const dispose = bundle.apply(host.ctx, { ...baseConfig, ...overrides });
    return { ...host, dispose };
  });

// ── 1. Vertrag ───────────────────────────────────────────────────────────────








// ── 2. Nicht-Aktions-Grenze ──────────────────────────────────────────────────





// ── 3. Reine Ableitung ───────────────────────────────────────────────────────








// ── 4. Der echte Bundle-Pfad: Event → State → System-Context ────────────────





/**
 * Die Ablage ECHT: dieselben Schreib-/Lesefunktionen wie der Project Index.
 *
 * Eine Attrappe, die beliebiges JSON zurueckgibt, haette den Fehler verdeckt,
 * den diese Naht hat: die Ablage haelt NUR Dokumente (memos) und ein paar
 * Kopfzeilen — ein freies Objekt faellt still weg. Genau das wird hier gemessen.
 */
export const storeCore = await import(new URL('../../../packages/project-index/assets/index-core.js', import.meta.url));
export function fakeStore() {
  const db = storeCore.openLedger(':memory:');
  return {
    contract: bundle.INDEX_STORE_CONTRACT,
    load: (namespace) => {
      const state = storeCore.readMemory(db, namespace);
      return state === null ? { ok: true, state: null } : { ok: true, state };
    },
    save: (namespace, state) => ({ ok: true, rows: storeCore.writeMemory(db, namespace, state) }),
    close: () => db.close(),
  };
}

/** Drei angenommene Entscheidungen mit demselben Grund — belegte Wiederkehr. */
export const decision = (outcome = 'accepted') => ({
  outcome,
  intentClassification: 'auftrag',
  intentMatch: 'umbauen',
  reasons: ['zu breit'],
  uncertainties: ['welcher Workspace?'],
});





// ── 5. Die Tendenz (Zug 5) ───────────────────────────────────────────────────
//
// Die Haltung kommt vom Scoring, der Klang steht im Zustandsvertrag. Hier wird
// beides geprueft: die Uebersetzung selbst, die Gleichheit der Haltungs-Namen
// ueber die Paketgrenze — und der echte Weg in den System-Prompt.

/** Die Haltungen, die das Scoring wirklich erzeugen kann (seine eigene Tabelle). */
export const scoringTendency = JSON.parse(
  readFileSync(join(PACKAGE_DIR, '../scoring/assets/tendency-rules.json'), 'utf8'),
);





// ── 6. Der Projekt-Kontext (Zug 9) ──────────────────────────────────────────

/**
 * GEMESSEN im echten Profil-Lauf 2026-10-16: JEDER Start meldete
 * `[shinon-persona] Projekt-Kontext nicht lesbar (isAbsolute is not defined)`.
 * `isAbsolute` wurde benutzt, aber nie aus `node:path` importiert; der
 * ReferenceError fiel in das try/catch dieses Blocks, das ihn in eine Warnung
 * verwandelt — die Persona startete also ohne Projekt-Kontext und sagte es nur
 * leise. Das Profil setzt `projectContextPath: .shinon/project-context.md`, der
 * RELATIVE Zweig ist damit der, der in jedem Lauf genommen wird.
 *
 * Der Prüfstand ist derselbe wie oben: echter Bundle-Pfad, Fake-Host, und die
 * registrierten Abschnitte sind von außen lesbar. Ein fehlender Import läßt den
 * Abschnitt verschwinden — dieser Test wird dann rot.
 */
export const contextDir = mkdtempSync(join(tmpdir(), 'shinon-persona-ctx-'));
export const contextFixture = (name, value) => {
  const file = join(contextDir, name);
  writeFileSync(file, value);
  return file;
};
export const projectSection = (host) => host.sections.find((entry) => entry.name === 'shinon:project-context');





// ── 7. Der Projektscope (P0, gemessen 2026-10-17) ───────────────────────────
//
// Der Fehler war der BESITZER der Identität: `isShinonProject()` las
// `process.cwd()/package.json`. Bei `DSH_HOME=$PWD` ist der CWD der HOST (dieses
// Repo), nicht der Workspace der Session — ein fremdes Projekt bekam damit die
// Shinon-Persona. Der Scope kommt jetzt aus einer ausdrücklichen Angabe.
// Trennung 2026-10-23: kein Repo-Namen-Check mehr — der BEREICH entscheidet.

/** Ein frisches Fremdprojekt mit eigenem Manifest. */
export function foreignProject(name = 'fremdes-projekt') {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-fremd-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  return dir;
}

/** Ohne Env-Variable messen, was die Config allein sagt — und den Zustand zurückgeben. */
export function withoutEnv(name, fn) {
  const saved = process.env[name];
  delete process.env[name];
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}





// ── 8. Die User-Lage (jede Interaktion wirkt) ───────────────────────────────
//
// Der Enhancer normalisiert den Ton weg, also traegt die Persona die erkannte
// Stimmung als EINE Zeile im Live-Block — kein eigener Abschnitt.



// ── 9. Das Langzeitgedächtnis (Zug 10) ──────────────────────────────────────
//
// Die Schleife, die die Anfrage verlangt: Ereignis → belegte Erinnerung →
// Vorschlag → ausdrückliche Annahme → Selbstauflage im Prompt. Jede Stufe wird
// am echten Bundle-Pfad gemessen, nicht an einer Kopie der Regeln.




/** Eine Route so aufrufen, wie Node sie aufruft: Request mit Listenern, Response mit Feldern. */
export function routeRequest(route, { method = 'GET', body = null } = {}) {
  const res = {
    status: 0,
    headers: null,
    payload: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(chunk) { this.payload += chunk; },
    end(chunk) { if (chunk !== undefined) this.payload += chunk; },
  };
  const listeners = new Map();
  const req = { method, on(name, fn) { listeners.set(name, fn); }, emit(name, arg) { listeners.get(name)?.(arg); } };
  const done = route.handler(req, res);
  if (body !== null) {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }
  return Promise.resolve(done).then(() => ({ status: res.status, json: () => JSON.parse(res.payload) }));
}


/** Eine SSE-Route verbinden: der Handler schreibt, der Client sammelt nur. */
export function sseRequest(route) {
  const res = {
    chunks: [],
    writeHead() {},
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk !== undefined) this.chunks.push(String(chunk)); },
  };
  route.handler({ method: 'GET', on() {} }, res);
  return res;
}





