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
 * Fehler unsichtbar (Regel: „test the real entry path“).
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
// Browser-Attrappe und Lader: EINE Quelle für beide vm-Tests (client-activation, markers).
import { browserSandbox, loadClientBundle as loadBundle, node, requireStub } from './helpers/client-sandbox.mjs';
import { DECISION_CHANNEL as HOST_PROMPTER_DECISION } from '../../../packages/prompter/assets/mode-core.js';

export const ROOT = new URL('../../../', import.meta.url);
export const PACKAGES = fileURLToPath(new URL('packages/', ROOT));
export const require = createRequire(new URL('../../../package.json', import.meta.url));

/** Flächen, die Cordis selbst auf `ctx` mischt (kein Dienst, kein `inject` nötig). */
export const CORDIS_SURFACE = new Set([
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
export const bundles = readdirSync(PACKAGES, { withFileTypes: true })
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

export const sourceOf = (dir) => readFileSync(`${PACKAGES}${dir}/client.js`, 'utf8');

/** Alle Elemente eines React-Element-Baums (die Attrappe ist `{type, props, children}`). */
export function flatten(tree, out = []) {
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
export function render(tree) {
  if (Array.isArray(tree)) return tree.map((item) => render(item));
  if (tree === null || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return render(tree.type(tree.props ?? {}));
  if (typeof tree.type === 'symbol') return render(tree.children);
  return tree;
}

/** Die deklarierte Abhängigkeitsliste einer Client-Hälfte. */
export function injected(dir) {
  const match = /inject\s*:\s*\[([^\]]*)\]/.exec(sourceOf(dir));
  if (match === null) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter((entry) => entry !== '');
}

/** Jeder `ctx.<name>`-Zugriff im CODE (Kommentare und Strings zählen nicht). */
export function serviceReads(dir) {
  const names = [...codeOnly(sourceOf(dir)).matchAll(/\bctx\s*\??\s*\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  return [...new Set(names)].sort();
}

// ── Attrappen: die beiden Dienste, die die Client-Hälften anfassen ───────────

/** Der `slots`-Dienst: `inject(key, cb)` ruft den Rückruf, `register` sammelt. */
export function slotsService(entries) {
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
export function localeService() {
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
export async function clientRoot(cordis, { locale = true } = {}) {
  const entries = [];
  const service = localeService();
  const root = new cordis.Context();
  await root.plugin({
    name: 'shinon-test-services',
    apply: (ctx) => {
      ctx.provide('slots', slotsService(entries));
      if (locale) ctx.provide('locale', service);
      // `remote` (mit `remote.commands`) gehoert seit 2026-10-23 zum Vertrag der
      // Veredelungs-Knopf-Oberflaeche: eine Client-Haelfte, die ein Kommando
      // ausloest, deklariert es und bekommt es hier — dieselbe Form wie im
      // echten Client-Runner, statt einer stillen Parkposition.
      // Der Client-Runner bietet beide Namen an: `remote` als Objekt und den
      // verschachtelten Dienst `remote.commands`, den `inject` verlangt.
      const commands = { execute: async () => ({ kind: 'success', text: '' }) };
      ctx.provide('remote', { commands });
      ctx.provide('remote.commands', commands);
    },
  });
  return { root, entries, locale: service };
}

/**
 * Hängt eine Client-Hälfte wie der Client-Runner an die Wurzel: das Bundle-Objekt
 * bleibt unverändert (samt `inject`), nur der Eintritt in `apply` wird notiert.
 */
export async function mount(root, registration) {
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


/**
 * Der Context, den die repo-eigenen Attrappen benutzen (durchstich/uebergabe):
 * ein PLATTES Objekt mit `slots` und `effect` — es hat kein `get`. Die Hälften
 * müssen auch dort ihr deutsches Label liefern, statt in einen TypeError zu
 * laufen; sonst bricht die nächste Attrappe, die ein Label rendert.
 */
export function stubContext(entries) {
  return {
    slots: {
      inject: (_key, callback) => { callback(); return () => {}; },
      register: (options, component) => { entries.push({ options, component }); return () => {}; },
    },
    effect: () => () => {},
  };
}

// Seit 2026-10-22 hat markers/popup keinen sidebar.panellist-Eintrag mehr (Zahl steht im Widget).
export const PANELLIST_LABELS = { dashboard: 'Shinon Dashboard', codingmon: 'Codingmon' };


// ── Wache 3a: Marke, Hintergrund und Laufanzeige im ausgelieferten Bundle ────


// ── Wache 2: dynamisch, am echten Cordis-Context ─────────────────────────────

export let cordis = null;
export let missing = '';
try {
  cordis = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
} catch (error) {
  missing = `@deepseek-ai/cordis nicht auflösbar: ${error.message}`;
}
export const skip = cordis === null ? `uebersprungen (Grund: ${missing})` : false;



// ── Wache 3b: Marke, Hintergrund und Besetzer am echten Context ──────────────


// ── Wache: die Prompter-Trace kommt vom Kanal auf die Seite ─────────────────
// Gemessen 2026-10-17: `verworfen (NO_JSON)` im Terminal, „Keine Entscheidungen"
// im Panel. Der Host schrieb die Spur in sein eigenes (in Produktion nicht
// vorhandenes) `window`, statt sie über den Kanal zu schicken — der Client
// hörte nie zu. Seit dem Fix abonniert die Client-Hälfte den Kanal wie
// @shinon/task-router und spiegelt nach `window.__shinonPrompterTrace`.





