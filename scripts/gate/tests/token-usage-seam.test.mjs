#!/usr/bin/env node
/**
 * token-usage-seam.test.mjs — die Naht der Token-Anzeige, am echten Bundle.
 *
 * Warum diese Datei existiert: `@shinon/token-usage` stand als „📊 --" in der
 * Sidebar, obwohl DSH die Zahl längst führt; danach zeigte es die SITZUNGS-Summe,
 * während der Auftrag die Zahl EINES Turns verlangt. Beide Zahlen sind da, sie
 * kommen aus zwei benachbarten Wegen der gelieferten Fassung:
 *
 *   TURN    — die dauerhaften Ereignisse des Turns (`turn/start` … `turn/end`) im
 *             Ereignisfenster der Sitzung: `binding.eventSource`, ein
 *             `SessionEventSource` mit den Einträgen
 *             `{ type: 'event', event }` (dauerhaft) bzw.
 *             `{ type: 'transient', event }` (client-only Live-Chunk). Genau diese
 *             Einträge faltet DSHs Chat-Bundle (die Zahl seiner Turn-Zeile); die
 *             Regel selbst ist als Region bytegleich mit dem Besitzer —
 *             verglichen mit DSHs eigener Funktion in `token-usage-vendor.test.mjs`.
 *   SITZUNG — die Sitzungs-Projektion `tokenUsage`, im Browser über
 *             `binding.session.projections.faceOf(key)` gelesen. Dieser Ausdruck
 *             IST der Weg, den `dsh-client-ui-session` als
 *             `keyedHooks: { projection: (key) => binding.session.projections.faceOf(key) }`
 *             anbietet (gemessen an der gelieferten Fassung).
 *   WELCHE  — die Vorgabe-Bindung des Renderers: `ctx.get?.('uiSession')` →
 *             `adapter.current` (eine Quelle mit `getSnapshot`), deren Sitzungs-id
 *             über `ctx.get?.('sessions')?.binding?.(id)` zur Bindung führt.
 *
 * Geprüft wird das ECHTE Bundle in einem `vm`-Kontext mit den echten Formen dieser
 * drei Wege; der beim Mounten gerenderte Wert wird gegen den Besitzer gestellt, und
 * das Abo wird über einen Sitzungswechsel gefahren (anhängen, ablösen, aufräumen).
 *
 * Was der Test NICHT beweist (ehrlich): React und die Uhren sind Attrappen, und
 * dass der echte Client die Zahl LIVE nachzieht, zeigt erst ein lebender Boot.
 * GEMESSEN (2026-10-12, `DSH_HOME=$PWD dsh --profile shinon --no-open --port 3099`,
 * echter Modell-Turn „Antworte mit genau einem Wort: drei" auf einer Sitzung mit
 * drei Turns) — Panel gegen DSHs eigene Offenlegung DESSELBEN Turns:
 *
 *   Panel (breit)  `📊 18.6K tok · 66 % aus Cache`
 *   Panel (Titel)  `Turn 3: 18.615 insgesamt · 18.612 Prompt (12.288 aus dem Cache,
 *                   6.324 neue Eingabe) · 3 Ausgabe · agnes/agnes-3.0-flash ·
 *                   Sitzung: 55.507 insgesamt · 36.864 aus dem Cache · 18.634 neue Eingabe · 9 Ausgabe`
 *   DSH Zeile      `Usage 18.6K tok`   (Turn 3)
 *   DSH Dialog     `18,615 tok · agnes/agnes-3.0-flash · Cache hit 66% ·
 *                   Uncached input 6,324 tok · Cached input 12,288 tok · Output 3 tok`
 *   DSH Fußpille   `55.5K tok·Cache hit 66%`   (= die Sitzung im Titel)
 *
 * Feld für Feld gleich; die Sitzungszeile ist als solche benannt und wird nicht für
 * die Turn-Zahl gehalten.
 *
 * ZWEITE MESSUNG, ohne Browser — die aufgezeichnete Sitzung selbst zurückgespielt
 * (`sessions/<workspace>/session-<id>/session.v4.jsonl.zstd`, Turn 3):
 *
 *   zstd -dc <log> > /tmp/session.jsonl   # dann die Ereignisse als
 *   { type: 'event', event } in `turnSliceOf` und beide Faltungen darauf anwenden
 *
 *   meine Faltung == DSH Faltung == { uncachedInputTokens: 6324, outputTokens: 3,
 *                                     totalTokens: 18615, cacheReadTokens: 12288,
 *                                     routes: [agnes/agnes-3.0-flash] }
 *
 * Die echten Ereignisse tragen genau die Felder, die gelesen werden (`turn/start`:
 * `turn`; `step/start`: `turn, step`; `assistant/message`: `turn, step, message,
 * stream, usage`; `turn/end`: `turn, reason`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../../lib/source-scan.mjs';
import { loadClientBundle } from './helpers/client-sandbox.mjs';
import {
  TOKEN_USAGE_KEY,
  deriveTurnUsage,
  sessionReading,
  turnReading,
  turnSliceOf,
} from '../../../packages/token-usage/assets/token-core.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Ein dauerhafter Eintrag in der Form der gelieferten Fassung. */
const durable = (type, seq, data) => ({ type: 'event', event: { type, seq, time: 1_760_000_000_000 + seq, data } });

/** Die Sitzungssumme, wie DSH sie in der Projektion `tokenUsage` führt. */
const SESSION_USAGE = { uncachedInputTokens: 5700, cacheReadTokens: 12200, cacheWriteTokens: 300, outputTokens: 512 };

/** Ein vollständiger Turn: 4.700 Token, 3.000 davon aus dem Cache (71,4 %). */
const TURN_ONE = [
  durable('turn/start', 1, { turn: 1 }),
  durable('step/start', 2, { turn: 1, step: 1 }),
  durable('assistant/message', 3, {
    turn: 1,
    step: 1,
    message: { source: { provider: 'agnes', model: 'agnes-3.0-flash' } },
    usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 3000, cacheWriteTokens: 200, totalTokens: 4700 },
    stream: [],
  }),
  durable('step/end', 4, { turn: 1, step: 1 }),
  durable('turn/end', 5, { turn: 1, reason: { kind: 'stop' } }),
];

/** Ein zweiter, kleinerer Turn (für den Sitzungswechsel). */
const TURN_TWO = [
  durable('turn/start', 6, { turn: 2 }),
  durable('step/start', 7, { turn: 2, step: 1 }),
  durable('assistant/message', 8, {
    turn: 2,
    step: 1,
    message: { source: { provider: 'agnes', model: 'agnes-3.0-flash' } },
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 850, cacheWriteTokens: 50, totalTokens: 1050 },
    stream: [],
  }),
  durable('step/end', 9, { turn: 2, step: 1 }),
  durable('turn/end', 10, { turn: 2, reason: { kind: 'stop' } }),
];

/** Eine Quelle in der Form der Client-Dienste: `getSnapshot` + `subscribe` + `set`. */
function observable(value) {
  const listeners = new Set();
  const source = {
    value,
    getSnapshot: () => source.value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(next) {
      source.value = next;
      for (const listener of [...listeners]) listener();
    },
    get listeners() { return listeners.size; },
  };
  return source;
}

/** Eine Sitzungs-Bindung in der Form des Session-Controllers: `{ sessionId, session, eventSource, ctx }`. */
function sessionBinding(id, entries, sessionUsage) {
  const faces = new Map();
  return {
    sessionId: id,
    ctx: {},
    eventSource: observable({ entries, hasMore: false, revision: 1, change: { kind: 'replace', entries } }),
    session: {
      projections: {
        faceOf: (key) => {
          if (!faces.has(key)) faces.set(key, observable(key === TOKEN_USAGE_KEY ? sessionUsage : undefined));
          return faces.get(key);
        },
      },
    },
  };
}

/**
 * Eine React-Attrappe, die `useEffect` NICHT selbst ausführt — der Test entscheidet,
 * wann gemountet wird (sonst hinge das Abo an der Zahl der Renderings).
 */
function reactStub() {
  const effects = [];
  return {
    effects,
    react: {
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
      useState: (value) => [value, () => {}],
      useEffect: (fn) => { effects.push(fn); },
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useCallback: (fn) => fn,
      Fragment: Symbol('react.fragment'),
    },
  };
}

/**
 * Das Bundle an einen Attrappen-Context mit den echten Formen hängen.
 * @param options.withServices — `false` heißt: kein `uiSession`/`sessions`-Dienst.
 * @param options.withBinding — `false` heißt: der Dienst kennt die Sitzung nicht (undefined).
 */
function harness({ entries = TURN_ONE, sessionUsage = SESSION_USAGE, withServices = true, withBinding = true } = {}) {
  const { registration } = loadClientBundle('token-usage');
  const { react, effects } = reactStub();
  const sessions = new Map();
  const shown = observable(withServices ? { key: 'session-1', props: { sessionId: 'session-1' }, hooks: {}, keyedHooks: {} } : undefined);
  const register = (id, window, usage) => {
    const binding = sessionBinding(id, window, usage);
    sessions.set(id, binding);
    return binding;
  };
  register('session-1', entries, sessionUsage);
  const registrations = [];
  const ctx = {
    slots: {
      inject: (_name, callback) => { callback(); return () => {}; },
      register: (options, component) => { registrations.push({ options, component }); return () => {}; },
    },
    get: (name) => {
      if (!withServices) return undefined;
      if (name === 'uiSession') return { adapter: { current: shown } };
      if (name === 'sessions') return { binding: (id) => (withBinding ? sessions.get(id) : undefined) };
      return undefined;
    },
  };
  const require = (specifier) => {
    if (specifier === 'react') return react;
    throw new Error(`unerwartetes require('${specifier}') — der Test kennt nur 'react'`);
  };
  const plugin = registration.factory(require);
  plugin.apply(ctx);
  const entry = registrations.find((item) => item.options.name === 'sidebar.footer.action');
  assert.ok(entry !== undefined, '@shinon/token-usage: keine sidebar.footer.action-Anmeldung');
  assert.equal(entry.options.id, 'shinon-token-usage', 'der Zell-Schlüssel der Anzeige driftet');
  return {
    Panel: entry.component,
    effects,
    shown,
    register,
    bindingOf: (id) => sessions.get(id),
  };
}

/** Die Effekte ausführen, die ein Mount auslösen würde; gibt die Aufräumer zurück. */
function mountEffects(effects) {
  const cleanups = effects.splice(0, effects.length).map((effect) => effect());
  return () => { for (const cleanup of cleanups.reverse()) if (typeof cleanup === 'function') cleanup(); };
}

test('das Panel zeigt die Zahl EINES Turns — nicht die Sitzungssumme', () => {
  const { Panel } = harness();
  const folded = deriveTurnUsage(TURN_ONE.map((entry) => entry.event));
  const turn = turnReading(folded, 1);
  const session = sessionReading(SESSION_USAGE);
  assert.equal(turn.label, '4.7K tok · 71.4 % aus Cache');
  const wide = Panel({ wide: true });
  assert.equal(wide.children.join(''), `📊 ${turn.label}`, 'die Kopfzeile traegt nicht die Turn-Zahl');
  // Der Titel nennt BEIDE Zahlen — keine wird fuer die andere gehalten.
  assert.equal(wide.props.title, `${turn.detail} · ${session.detail}`);
  assert.equal(wide.props['aria-label'], wide.props.title);
  const rail = Panel({ wide: false });
  assert.equal(rail.children.join(''), '📊');
  assert.equal(rail.props.title, wide.props.title, 'die schmale Leiste verschweigt die Zahl');
});

test('ohne beweisbaren Turn steht die Sitzungssumme — sichtbar als solche', () => {
  const session = sessionReading(SESSION_USAGE);
  assert.equal(session.label, '18.7K tok · 67 % aus Cache · Sitzung');
  const openTurn = [durable('turn/start', 1, { turn: 1 }), durable('step/start', 2, { turn: 1, step: 1 })];
  for (const [name, entries] of [
    ['noch kein Turn', []],
    ['Turn ohne turn/end', openTurn],
  ]) {
    const { Panel } = harness({ entries });
    const rendered = Panel({ wide: true });
    assert.equal(rendered.children.join(''), `📊 ${session.label}`, `${name}: Sitzungszeile fehlt`);
    assert.equal(rendered.props.title, session.detail, `${name}: Titel ist nicht die Sitzung`);
    assert.equal(turnSliceOf(entries), undefined, `${name}: der Slice behauptet einen Turn`);
  }
});

test('ohne Dienst, ohne Sitzung und ohne Projektionswert steht der Ersatztext — kein Wurf', () => {
  for (const [name, options] of [
    ['kein uiSession-Dienst', { withServices: false }],
    ['unbekannte Sitzung', { withBinding: false }],
    // `null` heisst: DSH hat noch keinen Stand gemeldet (die Projektion traegt nichts).
    ['kein Projektionswert', { sessionUsage: null, entries: [] }],
  ]) {
    const { Panel } = harness(options);
    const rendered = Panel({ wide: true });
    assert.equal(rendered.children.join(''), '📊 Token: --', `${name}: Ersatztext fehlt`);
    assert.equal(rendered.props.title, 'Token: --', `${name}: Titel ist nicht der Ersatztext`);
  }
});

test('das Abo wandert beim Sitzungswechsel mit und wird aufgeräumt', () => {
  const { Panel, effects, shown, bindingOf, register } = harness();
  const first = bindingOf('session-1');
  Panel({ wide: true });
  const unmount = mountEffects(effects);
  assert.equal(first.eventSource.listeners, 1, 'das Abo hängt nicht am Ereignisfenster der Sitzung');

  const second = register('session-2', TURN_TWO, SESSION_USAGE);
  shown.set({ key: 'session-2', props: { sessionId: 'session-2' }, hooks: {}, keyedHooks: {} });
  assert.equal(first.eventSource.listeners, 0, 'das Abo der alten Sitzung wurde nicht gelöst');
  assert.equal(second.eventSource.listeners, 1, 'das Abo hängt nicht an der neuen Sitzung');
  // Und die Anzeige liest jetzt die andere Sitzung — derselbe Turn-Text, andere Zahl.
  const turn = turnReading(deriveTurnUsage(TURN_TWO.map((entry) => entry.event)), 2);
  assert.equal(Panel({ wide: true }).children.join(''), `📊 ${turn.label}`);

  unmount();
  assert.equal(second.eventSource.listeners, 0, 'das Aufräumen löst das Abo nicht');
  assert.equal(shown.listeners, 0, 'das Aufräumen löst den Sitzungsblick nicht');
});

test('die Naht bleibt die dokumentierte: kein erfundener Weg, kein Fremdschluessel', () => {
  const source = readFileSync(`${ROOT}packages/token-usage/client.js`, 'utf8');
  assert.match(source, /ctx\.get\?\.\('uiSession'\)/, 'die Sitzungs-Auswahl kommt nicht mehr ueber den Client-Dienst');
  assert.match(source, /adapter\?\.current/, 'die Vorgabe-Bindung des Renderers fehlt');
  assert.match(source, /ctx\.get\?\.\('sessions'\)\?\.binding\?\.\(sessionId\)/, 'die Bindung kommt nicht mehr aus dem Sitzungs-Dienst');
  assert.match(source, /eventSource\?\.getSnapshot\?\.\(\)\?\.entries/, 'die Anzeige liest nicht mehr das Ereignisfenster');
  assert.match(source, /projections\?\.faceOf\?\.\(TOKEN_USAGE_KEY\)/, 'die Sitzungssumme kommt nicht mehr aus der Projektion');
  assert.match(source, /entry\.type === 'event' && entry\.event !== undefined/, 'die dauerhaften Eintraege werden nicht mehr von den Live-Zeilen getrennt');
  assert.equal(TOKEN_USAGE_KEY, 'tokenUsage', 'der Schluessel des Besitzers driftet');
  const core = readFileSync(`${ROOT}packages/token-usage/assets/token-core.js`, 'utf8');
  assert.match(core, /const TOKEN_USAGE_KEY = 'tokenUsage'/, 'der Besitzer traegt den Schluessel nicht mehr');
});

test('keine Uhr und kein Zufall in den Laufzeitdateien', () => {
  for (const file of ['packages/token-usage/client.js', 'packages/token-usage/assets/token-core.js', 'packages/token-usage/index.js']) {
    const code = codeOnly(readFileSync(`${ROOT}${file}`, 'utf8'));
    assert.ok(!/Math\.random/.test(code), `${file} zieht Math.random`);
    assert.ok(!/Date\.now/.test(code), `${file} liest die Uhr`);
  }
});
