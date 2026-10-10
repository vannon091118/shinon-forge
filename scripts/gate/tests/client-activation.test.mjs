#!/usr/bin/env node
/**
 * scripts/gate/tests/client-activation.test.mjs — Aktivierungs-Wache der Client-Hälften.
 *
 * Warum diese Datei existiert: beim Web-Boot fielen `@shinon/markers`,
 * `@shinon/dashboard` und `@shinon/codingmon` als „did not activate“ heraus, obwohl
 * alle übrigen Suiten grün waren. Der Grund lag nicht in der Logik, sondern im
 * Zugriff: die drei Hälften lesen `ctx.locale`, deklarieren aber `inject: ['slots']`.
 * Ein Cordis-Context ist ein PROXY; ein direkter Dienst-Zugriff ohne Deklaration
 * wirft (`cannot get property "locale" without inject`) und kostet die ganze
 * Aktivierung. Die bis dahin einzigen Client-Tests hängten die Bundles an ein
 * PLATTES Attrappen-`ctx` an — ein flaches Objekt kann nicht werfen, also war der
 * Fehler unsichtbar (docs/testing.md: „test the real entry path“).
 *
 * Zwei Wachen, absichtlich mit verschiedenem Geltungsbereich (der Vertrag, den sie
 * prüfen, steht in der ausgelieferten Fassung: `dsh-cordis-client-runner/lib/client.js`
 * — „`ctx.get(name)` performs optional lookup; direct `ctx.serviceName` access is
 * gated by the fiber's `inject` declaration“):
 *
 *   1. STATIK (keine Abhängigkeiten, läuft auch in CI ohne Install): jede
 *      `packages/<dir>/client.js` darf `ctx.<dienst>` nur lesen, wenn `<dienst>` in
 *      ihrer `inject`-Liste steht oder eine dokumentierte Cordis-Fläche ist
 *      (`ctx.effect` aus `fiber.d.ts`, `ctx.on`/`ctx.emit` aus `events.d.ts`, …).
 *      Kommentare und Strings zählen nicht — der Scan läuft über `codeOnly`
 *      (`scripts/lib/source-scan.mjs`). Geprüft werden **nur** die Client-Hälften:
 *      die Host-Hälften lesen ihre Dienste in `ctx.inject([...], (ctx) => …)`-
 *      Rückrufen, wo der verschachtelte Context seine eigene Deklaration hat —
 *      ein statischer Scan kann das nicht verfolgen (gemessen: `key-router`,
 *      `prompter`, `shinon-forge`, `narrative`, `codingmon` `index.js` wären
 *      Fehlalarme), und der Host-Boot hat seine eigene Diagnose (`dsh-app-boot`).
 *   2. DYNAMIK (braucht `node_modules`, sonst sichtbarer Skip): jedes Bundle wird in
 *      einem vm-Kontext mit Browser-Attrappen geladen und über `ctx.plugin(...)` an
 *      eine ECHTE Cordis-Wurzel gehängt, die `slots` und `locale` aus einer
 *      Plugin-Fiber anbietet — dieselbe Komposition wie im Client. Zusage: `apply`
 *      läuft, wirft nicht, und das Menü-Label kommt aus der Registry
 *      (`@shinon/locale-de`s Wörterbuch), ohne Locale-Dienst aus der deutschen
 *      Tabelle — beides ohne Wurf.
 *
 *   3. MARKE (statisch + dynamisch): drei sichtbare Regressionen, gemessen am
 *      ausgelieferten Bundle statt am Augenschein. (a) Das Background-Branding
 *      hing am Hero-Slot und lag damit INNEN in der 34px-Hitbox der Hero-Zeile —
 *      `position:absolute; inset:0` deckte dort nur die Hitbox, das Fenster sah
 *      nichts. Es gehört in `shell.overlay` (kind list, scope root), den der
 *      ui-layout-`AppFrame` frame-weit rendert. (b) Die Laufanzeige („Arbeitet“)
 *      trug DSHs Wal als CSS-Maske; Shinons Zeichen, seine Palette und seine
 *      Bewegung müssen das ersetzen. (c) Die Marken-Slots der Sidebar und des
 *      Hero sind Single-Slots MIT Fallback — gibt ein Besetzer auf, haengt dort
 *      wieder DSHs Fisch. Deshalb genau EIN Besetzer je Slot, und das eigene
 *      Zeichen ist aus Kurven gebaut, nicht aus Pixeln.
 *
 * Was der Test NICHT beweist (ehrlich): der Locale-Dienst ist eine Attrappe mit
 * derselben Schnittstelle (`addLanguage`/`register`/`bind`), nicht der echte
 * DSH-Dienst; ein voller `dsh --profile shinon`-Boot ist hier nicht möglich (die
 * CLI ist nicht installiert). React, DOM und Uhr sind Attrappen. Die CSS-Regeln
 * werden als Text geprueft — ob der Browser sie GENAU so anwendet, zeigt erst
 * ein lebender Boot (Spezifitaet: Attribut + Klasse schlaegt die gelieferte
 * Klassen-Regel; die Konvention steht hier als Zusage, nicht als Messung).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly, stripComments } from '../../lib/source-scan.mjs';

const ROOT = new URL('../../../', import.meta.url);
const PACKAGES = fileURLToPath(new URL('packages/', ROOT));
const require = createRequire(new URL('../../../package.json', import.meta.url));

/** Flächen, die Cordis selbst auf `ctx` mischt (kein Dienst, kein `inject` nötig). */
const CORDIS_SURFACE = new Set([
  // context.d.ts — eigene Eigenschaften und Methoden des Context-Proxy
  'root', 'baseUrl', 'fiber', 'events', 'logger', 'reflect', 'registry',
  'extend', 'isolate', 'intercept',
  // reflect.d.ts — „ctx.get, ctx.provide“ (context.d.ts)
  'get', 'provide',
  // registry.d.ts — auf ctx gemischt
  'plugin', 'inject',
  // events.d.ts — „Its methods are also mixed onto ctx (ctx.on, ctx.emit, …)“
  'on', 'off', 'emit', 'parallel', 'bail',
  // fiber.d.ts — `interface Context extends Pick<Fiber, 'effect'>`
  'effect',
]);

/** Alle Pakete mit einer Client-Hälfte, alphabetisch. */
const bundles = readdirSync(PACKAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((dir) => {
    try {
      readFileSync(`${PACKAGES}${dir}/client.js`);
      return true;
    } catch {
      return false;
    }
  })
  .sort();

const sourceOf = (dir) => readFileSync(`${PACKAGES}${dir}/client.js`, 'utf8');

/** Alle Elemente eines React-Element-Baums (die Attrappe ist `{type, props, children}`). */
function flatten(tree, out = []) {
  if (Array.isArray(tree)) {
    for (const item of tree) flatten(item, out);
    return out;
  }
  if (tree === null || typeof tree !== 'object') return out;
  if (tree.type !== undefined) out.push(tree);
  if (tree.children !== undefined) flatten(tree.children, out);
  return out;
}

/**
 * Funktionale Komponenten ausfuehren, wie React es taete — ohne sie bliebe
 * `h(ForgeSigil, …)` ein Element mit einem Funktions-`type` und der Baum waere
 * leer. Fragmente werden aufgeloest (nur Kinder).
 */
function render(tree) {
  if (Array.isArray(tree)) return tree.map((item) => render(item));
  if (tree === null || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return render(tree.type(tree.props ?? {}));
  if (typeof tree.type === 'symbol') return render(tree.children);
  return tree;
}

/** Die deklarierte Abhängigkeitsliste einer Client-Hälfte. */
function injected(dir) {
  const match = /inject\s*:\s*\[([^\]]*)\]/.exec(sourceOf(dir));
  if (match === null) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter((entry) => entry !== '');
}

/** Jeder `ctx.<name>`-Zugriff im CODE (Kommentare und Strings zählen nicht). */
function serviceReads(dir) {
  const names = [...codeOnly(sourceOf(dir)).matchAll(/\bctx\s*\??\s*\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  return [...new Set(names)].sort();
}

// ── Attrappen: Browser-Fläche ────────────────────────────────────────────────

const node = () => ({
  className: '', textContent: '', style: {}, dataset: {}, children: [], innerText: '',
  appendChild(child) { this.children.push(child); return child; },
  append() {}, setAttribute() {}, removeAttribute() {}, remove() {},
  addEventListener() {}, removeEventListener() {},
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  getAttribute: () => null, focus() {}, blur() {}, click() {},
});

/** Der `require`-Vertrag des Modul-Loaders: nur React, sonst ein Befund. */
function requireStub() {
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

/** Ein vm-Kontext mit genau der Fläche, die die Client-Hälften anfassen. */
function browserSandbox() {
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

/** Lädt eine Client-Hälfte so, wie der Loader sie lädt: über `__ModuleLoader__`. */
function loadBundle(dir) {
  const sandbox = browserSandbox();
  vm.runInContext(readFileSync(`${PACKAGES}${dir}/client.js`, 'utf8'), vm.createContext(sandbox.sandbox), {
    filename: `${dir}/client.js`,
  });
  const registration = sandbox.registration();
  assert.ok(registration !== null, `${dir}/client.js: hat sich nicht über __ModuleLoader__.load registriert`);
  assert.equal(registration.id, `@shinon/${dir}`, `${dir}/client.js: Registrierungs-id driftet`);
  return { registration, sandbox };
}

// ── Attrappen: die beiden Dienste, die die Client-Hälften anfassen ───────────

/** Der `slots`-Dienst: `inject(key, cb)` ruft den Rückruf, `register` sammelt. */
function slotsService(entries) {
  return {
    inject(_key, callback) {
      const result = callback();
      // `@shinon/core` reicht hier einen Generator herein (`function*`).
      if (result !== null && typeof result === 'object' && typeof result[Symbol.iterator] === 'function') {
        for (const _ of result) { /* Generator-Form ausführen */ }
      }
      return () => {};
    },
    register(options, component) {
      entries.push({ options, component });
      return () => {};
    },
  };
}

/**
 * Der `locale`-Dienst mit genau den drei Methoden, die die Client-Hälften
 * wirklich aufrufen (gemessen: `addLanguage`, `register(namespace, {en, de})`,
 * `bind(namespace) -> key -> text`) und einem Protokoll, das belegt, ob der
 * Registry-Weg genommen wurde. Fehlt ein Schlüssel, liefert `bind` den Schlüssel
 * selbst zurück — genauso, wie die Hälften es erwarten.
 */
function localeService() {
  const dictionaries = new Map();
  const lookups = [];
  return {
    lookups,
    addLanguage() {},
    register(namespace, dictionaries2) { dictionaries.set(namespace, dictionaries2); },
    bind(namespace) {
      return (key) => {
        lookups.push(`${namespace}.${key}`);
        const table = dictionaries.get(namespace) ?? {};
        return table.de?.[key] ?? table.en?.[key] ?? key;
      };
    },
  };
}

/** Eine echte Cordis-Wurzel mit optionalem `locale` — dieselbe Form wie im Client. */
async function clientRoot(cordis, { locale = true } = {}) {
  const entries = [];
  const service = localeService();
  const root = new cordis.Context();
  await root.plugin({
    name: 'shinon-test-services',
    apply: (ctx) => {
      ctx.provide('slots', slotsService(entries));
      if (locale) ctx.provide('locale', service);
    },
  });
  return { root, entries, locale: service };
}

/**
 * Hängt eine Client-Hälfte wie der Client-Runner an die Wurzel: das Bundle-Objekt
 * bleibt unverändert (samt `inject`), nur der Eintritt in `apply` wird notiert.
 */
async function mount(root, registration) {
  const plugin = registration.factory(requireStub());
  assert.ok(plugin !== null && typeof plugin === 'object', `${registration.id}: factory lieferte kein Plugin-Objekt`);
  let entered = false;
  let failure = null;
  try {
    await root.plugin({
      name: registration.id,
      inject: plugin.inject ?? [],
      apply(ctx) { entered = true; return plugin.apply(ctx); },
    });
  } catch (error) {
    failure = error;
  }
  return { plugin, entered, failure };
}

// ── Wache 1: statisch, ohne Abhängigkeiten (läuft in CI) ─────────────────────

test('keine Client-Hälfte liest einen Dienst, den sie nicht injectet', () => {
  assert.ok(bundles.length >= 15, `nur ${bundles.length} Client-Hälften gefunden — der Scan greift ins Leere`);
  for (const name of ['core', 'dashboard', 'markers', 'codingmon', 'popup', 'token-usage']) {
    assert.ok(bundles.includes(name), `@shinon/${name} fehlt in der gefundenen Liste`);
  }
  const findings = [];
  for (const dir of bundles) {
    const declared = injected(dir);
    for (const name of serviceReads(dir)) {
      if (CORDIS_SURFACE.has(name) || declared.includes(name)) continue;
      findings.push(`@shinon/${dir}/client.js liest ctx.${name}, ohne es zu injecten (inject: [${declared.map((d) => `'${d}'`).join(', ')}])`);
    }
  }
  assert.deepEqual(findings, [], 'ein nicht deklarierter Dienst-Zugriff wirft am echten Cordis-Proxy und kostet die Aktivierung');
});

/**
 * Der Context, den die repo-eigenen Attrappen benutzen (durchstich/uebergabe):
 * ein PLATTES Objekt mit `slots` und `effect` — es hat kein `get`. Die Hälften
 * müssen auch dort ihr deutsches Label liefern, statt in einen TypeError zu
 * laufen; sonst bricht die nächste Attrappe, die ein Label rendert.
 */
function stubContext(entries) {
  return {
    slots: {
      inject: (_key, callback) => { callback(); return () => {}; },
      register: (options, component) => { entries.push({ options, component }); return () => {}; },
    },
    effect: () => () => {},
  };
}

test('das Menü-Label trägt auch an einem Context ohne `get` (repo-eigene Attrappen)', () => {
  const expected = { dashboard: 'Shinon Dashboard', markers: 'Shinon Marker', codingmon: 'Codingmon', popup: 'Shinon Popup' };
  const problems = [];
  for (const [dir, expected2] of Object.entries(expected)) {
    const entries = [];
    const { registration } = loadBundle(dir);
    const plugin = registration.factory(requireStub());
    try {
      plugin.apply(stubContext(entries));
      const entry = entries.find((item) => item.options.name === 'sidebar.panellist');
      if (entry === undefined) problems.push(`@shinon/${dir}: keine sidebar.panellist-Anmeldung`);
      else if (typeof entry.options.label !== 'function') problems.push(`@shinon/${dir}: Label ist keine Funktion`);
      else if (entry.options.label() !== expected2) problems.push(`@shinon/${dir}: Label = ${JSON.stringify(entry.options.label())}`);
    } catch (error) {
      problems.push(`@shinon/${dir}: apply warf am Attrappen-Context — ${error.message}`);
    }
  }
  // Die Token-Anzeige liegt auf demselben Weg (sie rendert `t` erst später).
  try {
    const entries = [];
    const { registration } = loadBundle('token-usage');
    registration.factory(requireStub()).apply(stubContext(entries));
    const entry = entries.find((item) => item.options.name === 'sidebar.footer.action');
    if (entry === undefined) problems.push('@shinon/token-usage: keine sidebar.footer.action-Anmeldung');
    else {
      const rendered = entry.component({ wide: false });
      if (rendered?.props?.title !== 'Token: --') problems.push(`@shinon/token-usage: title = ${JSON.stringify(rendered?.props?.title)}`);
    }
  } catch (error) {
    problems.push(`@shinon/token-usage: warf am Attrappen-Context — ${error.message}`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

// ── Wache 3a: Marke, Hintergrund und Laufanzeige im ausgelieferten Bundle ────

test('der Hintergrund ist Shinons Asset und die Laufanzeige traegt Shinons Zeichen', () => {
  const source = sourceOf('core');
  const { registration, sandbox } = loadBundle('core');
  // `insertStyles` laeuft in der Fabrik (wie beim Loader), nicht in `apply`.
  registration.factory(requireStub());
  const css = sandbox.sandbox.document.head.children.map((element) => element.textContent).join('\n');
  assert.ok(css.length > 500, `nur ${css.length} Zeichen CSS gefunden — der Scan greift ins Leere`);

  // (a) Das Persona-Asset: der Data-URI IST die ausgelieferte Datei, Byte fuer Byte.
  const persona = /const PERSONA_SRC = 'data:image\/webp;base64,([A-Za-z0-9+/=]+)';/.exec(source);
  assert.ok(persona !== null, 'PERSONA_SRC fehlt — ohne Asset kein Hintergrund');
  const inline = Buffer.from(persona[1], 'base64');
  const asset = readFileSync(fileURLToPath(new URL('packages/core/assets/persona.webp', ROOT)));
  assert.equal(inline.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.equal(inline.subarray(8, 12).toString('latin1'), 'WEBP');
  assert.equal(inline.length, asset.length, 'der eingebettete Data-URI ist nicht die ausgelieferte Datei');
  assert.ok(inline.equals(asset), 'Data-URI und packages/core/assets/persona.webp driften');

  // (b) Die Laufanzeige: die Wal-Maske ist ersetzt, der statische Wal versteckt.
  const rule = /\[data-chat-running\] \[class\*="runningWhaleAnimated"\]\s*\{([^}]+)\}/.exec(css);
  assert.ok(rule !== null, 'die Laufanzeige des Clients hat keinen Shinon-Override');
  assert.match(rule[1], /background:\s*var\(--shinon-gradient\)/);
  assert.match(rule[1], /animation:\s*shinon-running-drift/);
  assert.match(css, /@keyframes shinon-running-drift/);
  assert.match(css, /\[data-chat-running\] \[class\*="runningWhaleStill"\]\s*\{\s*display:\s*none/);
  assert.match(css, /prefers-reduced-motion[\s\S]{0,200}runningWhaleAnimated[^}]*animation:\s*none/);
  const mask = /mask:\s*url\("data:image\/svg\+xml,([^"]+)"\)/.exec(rule[1]);
  assert.ok(mask !== null, 'die Maske der Laufanzeige ist nicht ersetzt');
  const maskSvg = decodeURIComponent(mask[1]);
  assert.ok(!/apng|whale|FISH_LOGO/i.test(maskSvg), `die Maske traegt noch das Fremd-Asset: ${maskSvg.slice(0, 80)}`);
  // Dieselbe Geometrie wie die Marke — beide aus DEMSELBEN MARK-Objekt.
  const markBlock = /const MARK = \{([\s\S]*?)\n    \};/.exec(source);
  assert.ok(markBlock !== null, 'MARK fehlt');
  const paths = [...markBlock[1].matchAll(/:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.equal(paths.length, 4, `MARK traegt ${paths.length} Pfade, erwartet 4`);
  for (const path of paths) assert.ok(maskSvg.includes(`d="${path}"`), `Maske und Marke driften: ${path}`);

  // (c) Der gelieferte Fisch als Fallback: die Marken-Stellen lassen nur Shinons
  // Zeichen stehen (sonst zeigt ein abgedankter Besetzer wieder DSHs Marke).
  for (const place of ['railMark', 'brandMark', 'fishHitbox']) {
    assert.ok(
      css.includes(`[class*="${place}"] > svg:not(.shinon-mark)`),
      `kein Fallback-Schutz an ${place} — dort kann DSHs Fisch stehen`,
    );
  }

  // (d) Das Zeichen selbst ist gezeichnet: kein <rect> im Laufzeitcode des Pakets
  // (Kommentare zaehlen nicht — dort darf erklaert werden, was NICHT gebaut wird).
  assert.ok(!stripComments(source).includes('<rect'), 'die Marke enthaelt ein <rect>');
  assert.ok(!/h\(\s*'rect'/.test(stripComments(source)), 'die Marke baut ein <rect>-Element');
});

// ── Wache 2: dynamisch, am echten Cordis-Context ─────────────────────────────

let cordis = null;
let missing = '';
try {
  cordis = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
} catch (error) {
  missing = `@deepseek-ai/cordis nicht auflösbar: ${error.message}`;
}
const skip = cordis === null ? `uebersprungen (Grund: ${missing})` : false;

test('jede Client-Hälfte aktiviert an einer echten Cordis-Wurzel', { skip }, async () => {
  const problems = [];
  for (const dir of bundles) {
    const { registration } = loadBundle(dir);
    const { root, entries } = await clientRoot(cordis);
    const { entered, failure } = await mount(root, registration);
    if (failure !== null) problems.push(`@shinon/${dir}: apply warf — ${failure.message}`);
    else if (!entered) problems.push(`@shinon/${dir}: apply lief nicht (parkt auf inject?)`);
    else if (entries.length === 0 && ['core', 'dashboard', 'markers', 'codingmon', 'popup', 'token-usage'].includes(dir)) {
      problems.push(`@shinon/${dir}: keine Slot-Anmeldung angekommen`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('das Menü-Label kommt aus der Registry — und ohne Locale-Dienst aus der deutschen Tabelle', { skip }, async () => {
  // Der Eigentümer des Wörterbuchs ist @shinon/locale-de: es registriert zuerst.
  const registerLocale = async (root) => {
    const { registration } = loadBundle('locale-de');
    const mounted = await mount(root, registration);
    assert.equal(mounted.failure, null, `@shinon/locale-de aktiviert nicht: ${mounted.failure?.message}`);
    assert.equal(mounted.entered, true);
  };
  const labelOf = (entries, dir) => {
    const entry = entries.find((item) => item.options.name === 'sidebar.panellist');
    assert.ok(entry !== undefined, `@shinon/${dir}: keine sidebar.panellist-Anmeldung`);
    assert.equal(typeof entry.options.label, 'function', `@shinon/${dir}: Label ist keine Funktion`);
    return entry.options.label();
  };
  const expected = { dashboard: 'Shinon Dashboard', markers: 'Shinon Marker', codingmon: 'Codingmon', popup: 'Shinon Popup' };

  // Mit Locale-Dienst: der Wert kommt aus dem Wörterbuch des Eigentümers.
  for (const [dir, expected2] of Object.entries(expected)) {
    const { registration } = loadBundle(dir);
    const { root, entries, locale } = await clientRoot(cordis);
    await registerLocale(root);
    const mounted = await mount(root, registration);
    assert.equal(mounted.failure, null, `@shinon/${dir} aktiviert mit Locale-Dienst nicht: ${mounted.failure?.message}`);
    assert.equal(labelOf(entries, dir), expected2, `@shinon/${dir}: Label weicht vom Wörterbuch ab`);
    assert.ok(
      locale.lookups.some((lookup) => lookup.startsWith('shinon.')),
      `@shinon/${dir}: der Registry-Weg wurde nicht genommen (lookups=${JSON.stringify(locale.lookups)})`,
    );
    // Der Blick passiert pro Label-Aufbau, nicht einmal in `apply`: nur so kommt
    // ein später geladener (oder gewechselter) Dienst noch an. Zwei Aufrufe
    // müssen zwei Abfragen ergeben.
    const before = locale.lookups.length;
    labelOf(entries, dir);
    assert.ok(
      locale.lookups.length > before,
      `@shinon/${dir}: das Label wurde in apply eingefroren statt pro Aufbau gelesen`,
    );
  }

  // Ohne Locale-Dienst: derselbe deutsche Text, kein Wurf. Genau hier starb der Boot.
  for (const [dir, expected2] of Object.entries(expected)) {
    const { registration } = loadBundle(dir);
    const { root, entries } = await clientRoot(cordis, { locale: false });
    const mounted = await mount(root, registration);
    assert.equal(mounted.failure, null, `@shinon/${dir} aktiviert ohne Locale-Dienst nicht: ${mounted.failure?.message}`);
    assert.equal(mounted.entered, true, `@shinon/${dir}: apply lief ohne Locale-Dienst nicht`);
    assert.equal(labelOf(entries, dir), expected2, `@shinon/${dir}: deutscher Fallback fehlt`);
  }

  // Reihenfolge: der Dienst taucht erst NACH dem Bundle auf. Vorher gilt der
  // deutsche Fallback, danach muss die Registry greifen — eine in `apply`
  // eingefrorene Bindung (oder ein eingefrorener Text) fällt hier durch.
  const late = localeService();
  const lateText = { dashboard: 'SPAET-Dashboard', markers: 'SPAET-Marker', codingmon: 'SPAET-Codingmon', popup: 'SPAET-Popup' };
  late.register('shinon', { de: Object.fromEntries(Object.entries(lateText).map(([dir, text]) => [`menu.${dir}`, text])), en: {} });
  for (const [dir, expected2] of Object.entries(expected)) {
    const { registration } = loadBundle(dir);
    const { root, entries } = await clientRoot(cordis, { locale: false });
    const mounted = await mount(root, registration);
    assert.equal(mounted.failure, null, `@shinon/${dir}: ${mounted.failure?.message}`);
    assert.equal(labelOf(entries, dir), expected2, `@shinon/${dir}: Fallback vor dem Dienst fehlt`);
    await root.plugin({ name: 'late-locale', apply: (ctx) => { ctx.provide('locale', late); } });
    assert.equal(labelOf(entries, dir), lateText[dir], `@shinon/${dir}: der später geladene Dienst wird nicht gelesen`);
  }
});

// ── Wache 3b: Marke, Hintergrund und Besetzer am echten Context ──────────────

test('der Hintergrund haengt am frame-weiten Overlay und je Marken-Slot besetzt genau einer', { skip }, async () => {
  const { root, entries } = await clientRoot(cordis);

  const core = loadBundle('core');
  const mountedCore = await mount(root, core.registration);
  assert.equal(mountedCore.failure, null, `@shinon/core aktiviert nicht: ${mountedCore.failure?.message}`);
  assert.equal(mountedCore.entered, true, '@shinon/core: apply lief nicht');

  // Das Pet laedt mit: es ist der zweite Bewerber um die Marken-Slots.
  const pet = loadBundle('codingmon');
  const mountedPet = await mount(root, pet.registration);
  assert.equal(mountedPet.failure, null, `@shinon/codingmon aktiviert nicht: ${mountedPet.failure?.message}`);

  // (a) Der Hintergrund: eigener Eintrag im frame-weiten Overlay-Layer.
  const overlays = entries.filter((entry) => entry.options.name === 'shell.overlay');
  assert.equal(overlays.length, 1, `shell.overlay hat ${overlays.length} Eintraege`);
  assert.equal(overlays[0].options.id, 'shinon-background');
  assert.equal(overlays[0].options.order, 0);
  const background = flatten(render(overlays[0].component({})));
  const persona = background.find((element) => element.type === 'img');
  assert.ok(persona !== undefined, 'der Hintergrund rendert kein Bild');
  assert.equal(persona.props.className, 'shinon-bg__persona');
  assert.match(String(persona.props.src), /^data:image\/webp;base64,/);
  assert.equal(persona.props.alt, '', 'der Hintergrund ist dekorativ und braucht ein leeres alt');
  assert.equal(background[0].props['aria-hidden'], 'true', 'die Hintergrund-Ebene ist dekorativ');

  // (b) Die Marken-Slots: genau ein Besetzer, und der rendert ein ZEICHEN.
  for (const [slot, size] of [['sidebar.brand.mark', 24], ['conversation.hero.brand.mark', 34]]) {
    const occupants = entries.filter((entry) => entry.options.name === slot);
    assert.equal(occupants.length, 1, `${slot}: ${occupants.length} Besetzer statt einem`);
    const nodes = flatten(render(occupants[0].component({ size, className: 'slot-class' })));
    assert.ok(
      !nodes.some((element) => element.type === 'img'),
      `${slot}: die Marke rendert ein Bild — hier hing der Hintergrund und deckte nur die Hitbox`,
    );
    assert.ok(
      !nodes.some((element) => element.type === 'rect'),
      `${slot}: die Marke ist aus <rect>-Pixeln gebaut statt gezeichnet`,
    );
    const svg = nodes.find((element) => element.type === 'svg');
    assert.ok(svg !== undefined, `${slot}: die Marke rendert kein SVG`);
    assert.match(String(svg.props.className), /shinon-mark/);
    assert.equal(svg.props.width, size, `${slot}: die Marke ignoriert die vorgegebene Kantenlaenge`);
    assert.equal(nodes.filter((element) => element.type === 'path').length, 4, `${slot}: das Zeichen ist unvollstaendig`);
  }
});
