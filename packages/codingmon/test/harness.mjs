#!/usr/bin/env node
/**
 * packages/codingmon/test/harness.mjs — die Attrappe fuer das echte Bundle.
 *
 * WARUM EINE EIGENE DATEI: der Durchstich brauchte die Attrappe zuerst allein,
 * aber jede weitere Pruefung (Praesentation, Zustaende, Vertragsdrifte) muss
 * dasselbe fahren — ein zweiter Kopie-Aufbau wuerde zwei Wahrheiten erzeugen:
 * ein Test, der gruen ist, weil seine Attrappe anders ist als die des
 * Durchstichs, beweist nichts. Deshalb liegt die Attrappe hier und der
 * Durchstich holt sie sich von hier.
 *
 * WAS DIE ATTRAPPE NICHT BEWEIST (ehrlich): die Wartezeit laeuft in einer
 * Attrappen-Uhr, nicht in einem echten Browser; React, Layout und Compositor
 * sind Attrappen. Bewiesen ist der VERTRAG des Bundles.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function makeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = (seq += 1); timers.set(id, { at: now + Math.max(0, Math.round(ms) || 0), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    pending: () => [...timers.entries()].map(([id, timer]) => ({ id, at: timer.at })),
    /** Alle faelligen Timer bis `ms` in Zeitreihenfolge ausfuehren. */
    advance(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 500; guard += 1) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        const [id, timer] = due[0];
        timers.delete(id);
        now = timer.at;
        timer.fn();
      }
      now = target;
    },
    /** Einen bestimmten Timer ausloesen, auch wenn er nicht faellig ist (Probe). */
    fire(id) {
      const timer = timers.get(id);
      if (timer === undefined) return false;
      timers.delete(id);
      now = timer.at;
      timer.fn();
      return true;
    },
  };
}

const el = () => ({
  className: '', style: {}, dataset: {}, children: [], innerText: '',
  append() {}, appendChild() {}, setAttribute() {}, remove() {},
  classList: { add() {}, contains: () => false },
});

function boot({ save = null, bodyText = '', activity = null } = {}) {
  const clock = makeClock();
  const storage = {
    data: new Map(),
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
    setItem(key, value) { this.data.set(key, String(value)); },
  };
  if (save !== null) storage.setItem('shinon.codingmon/v1', typeof save === 'string' ? save : JSON.stringify(save));
  let random = () => 0.5;
  const document = {
    head: el(), body: { ...el(), innerText: bodyText }, documentElement: el(),
    createElement: () => el(), querySelector: () => null, addEventListener() {},
  };
  const react = {
    useState: (value) => [value, () => {}],
    useEffect: (fn) => { fn(); },
    createElement: (type, props, ...kids) => ({
      type,
      props: { ...(props ?? {}), ...(kids.length === 0 ? {} : { children: kids.length === 1 ? kids[0] : kids }) },
    }),
  };
  const events = [];
  let intervalSeq = 0;
  const intervals = new Map();
  const disposers = [];
  const sandbox = {
    document, console: { log() {}, warn() {}, error() {} }, Date,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (id) => clock.clearTimeout(id),
    setInterval: (fn, ms) => { const id = (intervalSeq += 1); intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => intervals.delete(id),
    localStorage: storage,
  };
  sandbox.window = sandbox;
  sandbox.window.__ModuleLoader__ = { load: (definition) => { sandbox.__plugin = definition; } };
  sandbox.dispatchEvent = (event) => events.push(event);
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => random();

  vm.runInContext(CLIENT, vm.createContext(sandbox), { filename: 'codingmon-client.js' });
  const plugin = sandbox.__plugin;
  const slots = [];
  const ctx = {
    get(name) {
      if (name === 'remote.codingmon') return activity === null ? undefined : { readActivity: activity };
      return undefined;
    },
    remote: activity === null ? {} : { codingmon: { readActivity: activity } },
    slots: {
      inject: (name, register) => register(),
      register: (options, component) => { slots.push({ options, component }); return () => {}; },
    },
    effect: (fn) => { const dispose = fn(); disposers.push(dispose); return dispose; },
  };
  const mod = plugin.factory(() => react);
  mod.apply(ctx);
  return {
    clock, storage, sandbox, plugin, slots, events, disposers, intervals, api: sandbox.window.__codingmon,
    setRandom: (fn) => { random = fn; },
    saved: () => JSON.parse(storage.getItem('shinon.codingmon/v1')),
  };
}

/** Komponenten aufloesen und den Text einsammeln (wie in der Dashboard-Attrappe). */
const flatten = (node) => {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(flatten);
  if (typeof node.type === 'function') return flatten(node.type(node.props ?? {}));
  return {
    type: node.type,
    props: Object.fromEntries(Object.entries(node.props ?? {}).filter(([key]) => key !== 'children')),
    children: flatten(node.props?.children ?? null),
  };
};
const collectText = (node, out = []) => {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((child) => collectText(child, out)); return out; }
  collectText(node.children, out);
  return out;
};

export { makeClock, boot, flatten, collectText };
