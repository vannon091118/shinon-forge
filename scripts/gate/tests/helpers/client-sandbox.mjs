/**
 * scripts/gate/tests/helpers/client-sandbox.mjs — Browser-Attrappe und Lader
 * für Client-Hälften.
 *
 * Warum das eine eigene Datei ist: `scripts/gate/tests/client-activation.test.mjs`
 * und `scripts/gate/tests/markers.test.mjs` prüfen BEIDE das echte Bundle in einem
 * `vm`-Kontext (der eine die Aktivierung, der andere die wirksamen Grenzen aus der
 * Seite). Zwei Kopien derselben Attrappe würden driften und genau den Fehler
 * wiederholen, den die Tests finden sollen. Diese Datei ist KEIN Test (sie liegt
 * nicht im Glob `scripts/gate/tests/*.test.mjs`) und läuft in CI ohne node_modules.
 *
 * Sie liefert eine Fläche, die bewusst nur das trägt, was die Hälften anfassen:
 * `document`, `localStorage`/`sessionStorage` (dieselbe Attrappe — ein zweiter
 * Speicher fällt im Vertragstest auf), eine Uhr ohne echte Timer, `CSS.escape`,
 * `matchMedia` und den `require`-Vertrag des Loaders (`react` oder Befund).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = new URL('../../../../', import.meta.url);
const PACKAGES = fileURLToPath(new URL('packages/', ROOT));

/** Ein DOM-Knoten mit genau den Feldern, die die Hälften lesen/schreiben. */
export const node = () => ({
  className: '', textContent: '', style: {}, dataset: {}, children: [], innerText: '',
  appendChild(child) { this.children.push(child); return child; },
  append() {}, setAttribute() {}, removeAttribute() {}, remove() {},
  addEventListener() {}, removeEventListener() {},
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  getAttribute: () => null, focus() {}, blur() {}, click() {},
});

/** Der `require`-Vertrag des Modul-Loaders: nur React, sonst ein Befund. */
export function requireStub() {
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    Fragment: Symbol('react.fragment'),
  };
  return (specifier) => {
    if (specifier === 'react') return react;
    throw new Error(`unerwartetes require('${specifier}') — der Test kennt nur 'react'`);
  };
}

/**
 * Ein vm-Kontext mit genau der Fläche, die die Client-Hälften anfassen.
 * @param {Record<string, unknown>} globals — Startwerte der Seite, z. B. das
 *   Global der wirksamen Grenzen (`__DSH_MARKERS_CONFIG__`) VOR dem Mounten.
 */
export function browserSandbox(globals = {}) {
  const document = {
    head: node(), body: node(), documentElement: node(),
    createElement: (tag) => {
      const element = node();
      element.tagName = String(tag).toUpperCase();
      return element;
    },
    createElementNS: () => node(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {}, removeEventListener() {}, execCommand: () => false,
  };
  const storage = {
    data: new Map(),
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
    setItem(key, value) { this.data.set(key, String(value)); },
    removeItem(key) { this.data.delete(key); },
    clear() { this.data.clear(); },
  };
  // Attrappen-Uhr: keine echten Timer, damit der Lauf keine Handles offen lässt.
  const timers = new Map();
  let timerSeq = 0;
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    document, localStorage: storage, sessionStorage: storage,
    navigator: { userAgent: 'shinon-client-activation', language: 'de-DE', clipboard: { writeText: async () => {} } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type, init) { this.type = type; this.bubbles = init?.bubbles === true; } },
    KeyboardEvent: class { constructor(type, init) { this.type = type; this.key = init?.key; } },
    MouseEvent: class { constructor(type, init) { this.type = type; } },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    location: { href: 'http://127.0.0.1:3085/', origin: 'http://127.0.0.1:3085', pathname: '/', search: '', hash: '' },
    performance: { now: () => 0 },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    fetch: async () => ({ ok: false, status: 599, json: async () => ({}), text: async () => '' }),
    setTimeout: (fn) => { const id = (timerSeq += 1); timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { const id = (timerSeq += 1); timers.set(id, fn); return id; },
    clearInterval: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => { const id = (timerSeq += 1); timers.set(id, fn); return id; },
    cancelAnimationFrame: (id) => timers.delete(id),
    CSS: { supports: () => true, escape: (value) => String(value) },
    ...globals,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  let registration = null;
  sandbox.__ModuleLoader__ = { load: (definition) => { registration = definition; } };
  sandbox.dispatchEvent = () => true;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  return { sandbox, registration: () => registration };
}

/**
 * Lädt eine Client-Hälfte so, wie der Loader sie lädt: über `__ModuleLoader__`.
 * @param {string} dir — Paketordner unter `packages/`.
 * @param {Record<string, unknown>} globals — Startwerte der Seite (siehe oben).
 */
export function loadClientBundle(dir, globals = {}) {
  const sandbox = browserSandbox(globals);
  vm.runInContext(readFileSync(`${PACKAGES}${dir}/client.js`, 'utf8'), vm.createContext(sandbox.sandbox), {
    filename: `${dir}/client.js`,
  });
  const registration = sandbox.registration();
  assert.ok(registration !== null, `${dir}/client.js: hat sich nicht über __ModuleLoader__.load registriert`);
  assert.equal(registration.id, `@shinon/${dir}`, `${dir}/client.js: Registrierungs-id driftet`);
  return { registration, sandbox };
}
