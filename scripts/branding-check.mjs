#!/usr/bin/env node
/**
 * scripts/branding-check.mjs — die Wirkungs-Messung des Brandings.
 *
 * Warum eine eigene Datei: der Gate-Test (scripts/gate/tests/client-activation.test.mjs)
 * belegt STATISCH, dass unsere Regeln im Bundle stehen — er kann nicht sagen, ob sie im
 * Browser GEWINNEN. Genau das ist die offene Frage: Shinons Overrides treffen gehashte
 * Vendor-Klassen (`EvIC1a_runningWhaleAnimated`, `hHd-Xa_railMark`, `pXSMma_fishHitbox`),
 * und das gelieferte CSS-Modul steht je nach Ladereihenfolge VOR oder NACH unserem
 * Style-Tag. Ein Test, der nur unseren eigenen Text liest, kann das nicht entscheiden.
 *
 * Aufbau: das Skript zieht die CSS-Bloecke der gelieferten Bundles
 * (`node_modules/@deepseek-ai/<pkg>/lib/client.js` — dieselben Strings, die der Browser
 * bekommt, inklusive der Wal-APNG-Maske), baut damit und mit dem AUSGELIEFERTEN
 * `dist/packages/core/client.js` eine eigenstaendige Seite, haengt das Vendor-CSS
 * ABSICHTLICH ZWEIMAL ein (einmal vor, einmal nach unseren Styles — der unguenstigste
 * Fall fuer die Quellreihenfolge) und misst im echten Chromium:
 *
 *   1. Spezifitaet/Quellreihenfolge: computed `mask`, `background`, `animation` der
 *      Laufanzeige, `display` des gelieferten Wal-SVGs.
 *   2. Sichtbarkeit des Hintergrunds: dekodiert das WebP, deckt es den Rahmen, ist es
 *      dezent und click-through, erreicht ein Klick die UI darunter?
 *   3. Die drei Marken-Stellen: Zeichen sichtbar, Groesse aus dem Slot, Fallback weg.
 *   4. Paintbarkeit: laden die beiden Data-URIs (Maske, Persona) als Bild?
 *
 * Exit 0 = jede Zusage gemessen und erfuellt; Exit 1 = mindestens eine Messung widerlegt
 * sie (gemessene Werte im Klartext). Laeuft ohne Install und ohne Server: `--dump-dom`
 * liefert die Seite nach dem Skriptlauf zurueck.
 *
 * Nutzung: node scripts/branding-check.mjs [--keep] [--browser <pfad>]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VENDOR = join(ROOT, 'node_modules/@deepseek-ai');
const BUNDLE = join(ROOT, 'dist/packages/core/client.js');
const WORK = join(ROOT, 'dist/.branding-check');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const browserArg = argv.indexOf('--browser');

const CHROME_CANDIDATES = [
  browserArg === -1 ? null : argv[browserArg + 1],
  process.env.SHINON_CHROME,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  ...(() => {
    const cache = join(process.env.HOME ?? '/root', '.cache/ms-playwright');
    if (!existsSync(cache)) return [];
    return readdirSync(cache, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium'))
      .map((entry) => join(cache, entry.name, 'chrome-linux64/chrome'));
  })(),
].filter((path) => path !== null && existsSync(path));

function fail(problem) {
  console.error(`\n❌ Branding-Messung abgebrochen: ${problem}`);
  process.exit(1);
}

if (!existsSync(BUNDLE)) {
  fail(`${BUNDLE} fehlt — zuerst \`npm run build\` laufen lassen (gemessen wird das AUSGELIEFERTE Bundle)`);
}
if (CHROME_CANDIDATES.length === 0) fail('kein Chrome/Chromium gefunden (--browser <pfad> oder SHINON_CHROME setzen)');
const BROWSER = CHROME_CANDIDATES[0];

// ── 1. Das echte Vendor-CSS einsammeln ───────────────────────────────────────
/**
 * Alle String-Literale einer Datei, exakt wie JS sie sieht (`vm` loest Escapes).
 * Templates mit `${…}` fallen raus — dort steht Code, kein CSS.
 */
function stringLiterals(file) {
  const text = readFileSync(join(VENDOR, file), 'utf8');
  const out = [];
  const skipped = [];
  for (const match of text.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\[\s\S])*)`/g)) {
    const raw = match[0];
    if (raw.includes('${')) continue;
    try {
      out.push(vm.runInNewContext(raw));
    } catch (error) {
      // Nicht verschweigen: ein Literal, das hier scheitert, fehlt der Messung.
      skipped.push(`${raw.slice(0, 40)}… (${error.message.slice(0, 40)})`);
    }
  }
  return { literals: out, skipped };
}

/**
 * ALLE CSS-Bloecke einer Datei — nicht nur die zu einem Suchtoken (siehe unten): ein Modul kann
 * mehrere Strings haben (`const css = "…"` und `const css$1 = "…"`), und eine Regel
 * fuer `runningWhaleAnimated` steht in einer ANDEREN Zelle als der Klassenname daneben.
 * Was der Browser bekommt, ist die Summe — die Summe misst dieser Nachbau.
 */
function cssBlocks(file) {
  const { literals, skipped } = stringLiterals(file);
  const blocks = literals.filter((value) => typeof value === 'string'
    && value.includes('{') && /\.[A-Za-z_-]/.test(value) && value.includes('}'));
  if (blocks.length === 0) {
    fail(`kein CSS-Block in ${file} — ${literals.length} Literale gelesen`
      + (skipped.length > 0 ? `, ${skipped.length} uebersprungen: ${skipped.slice(0, 2).join(' | ')}` : ''));
  }
  return { blocks, skipped, literalCount: literals.length };
}

/**
 * Den gehashten Klassennamen zu einem logischen Namen finden — im CSS SEINES Pakets,
 * ueber exakten Suffix mit Trenner davor (die Praefixe selbst enthalten `_`, z. B.
 * `pI_x6G_sidebarCol`, deshalb ist ein Split am ersten `_` falsch) und dem kuerzesten
 * Kandidaten (das ist die Klasse selbst, nicht ein laengerer Name mit gleichem Suffix).
 */
function cls(name, css, owner) {
  const tokens = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((match) => match[1]));
  const candidates = [...tokens]
    .filter((token) => token.endsWith(name) && token.length > name.length && /[_-]/.test(token[token.length - name.length - 1]))
    .sort((left, right) => left.length - right.length);
  if (candidates.length === 0) fail(`Klasse zu "${name}" steht nicht im CSS von ${owner}`);
  return candidates[0];
}

const chat = cssBlocks('dsh-client-ui-chat/lib/client.js');
const hero = cssBlocks('dsh-client-ui-conversation/lib/client.js');
const sidebar = cssBlocks('dsh-client-ui-sidebar/lib/client.js');
const layout = cssBlocks('dsh-client-ui-layout/lib/client.js');

const vendorCss = [...sidebar.blocks, ...hero.blocks, ...chat.blocks, ...layout.blocks].join('\n');
// Die Wal-Maske ist ein APNG, ausgeliefert unter der Mediatype `image/png`.
if (!/mask:url\(data:image\/png;base64,/.test(vendorCss)) {
  fail('die Wal-Maske (data:image/png, APNG) steht nicht mehr in diesem CSS — der Test misst dann die falsche Fassung');
}
const layoutCss = layout.blocks.join('\n');
const sidebarCss = sidebar.blocks.join('\n');
const heroCss = hero.blocks.join('\n');
const chatCss = chat.blocks.join('\n');
const C = {
  frame: cls('frame', layoutCss, 'ui-layout'),
  sidebarCol: cls('sidebarCol', layoutCss, 'ui-layout'),
  overlayLayer: cls('overlayLayer', layoutCss, 'ui-layout'),
  toggle: cls('toggle', sidebarCss, 'ui-sidebar'),
  railMark: cls('railMark', sidebarCss, 'ui-sidebar'),
  brandMark: cls('brandMark', sidebarCss, 'ui-sidebar'),
  brandIdentity: cls('brandIdentity', sidebarCss, 'ui-sidebar'),
  fishHitbox: cls('fishHitbox', heroCss, 'ui-conversation'),
  fish: cls('fish', heroCss, 'ui-conversation'),
  headline: cls('headline', heroCss, 'ui-conversation'),
  running: cls('running', chatCss, 'ui-chat'),
  runningIcon: cls('runningIcon', chatCss, 'ui-chat'),
  runningWhaleAnimated: cls('runningWhaleAnimated', chatCss, 'ui-chat'),
  runningWhaleStill: cls('runningWhaleStill', chatCss, 'ui-chat'),
};

// ── 2. Die Seite bauen ───────────────────────────────────────────────────────
const bundleSource = readFileSync(BUNDLE, 'utf8');

const harness = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Shinon Branding-Messung</title>
<style id="vendor-before">${vendorCss}</style>
</head>
<body>
<div id="frame-host"></div>
<pre id="report">{"status":"nicht gelaufen"}</pre>
<script>
  // Der Modul-Loader MUSS vor dem Bundle stehen: das Bundle ruft ihn beim Laden.
  window.__pageErrors = [];
  window.onerror = (message) => { window.__pageErrors.push(String(message)); };
  window.__loaded = null;
  window.__ModuleLoader__ = { load: (definition) => { window.__loaded = definition; } };
<\/script>
<script>${bundleSource}<\/script>
<script>
(() => {
  try {
  // Die gehashten Klassennamen der gelieferten CSS-Module (aus ihrem eigenen CSS gelesen).
  const C = ${JSON.stringify(C)};
  const react_stub = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    Fragment: Symbol('react.fragment'),
  };
  const SVG_TAGS = new Set(['svg', 'defs', 'linearGradient', 'stop', 'path', 'g', 'circle', 'rect', 'line', 'polygon']);
  const ATTR = { stopColor: 'stop-color', strokeWidth: 'stroke-width', strokeLinejoin: 'stroke-linejoin', strokeLinecap: 'stroke-linecap', fillOpacity: 'fill-opacity' };
  const errors = window.__pageErrors;
  window.addEventListener('unhandledrejection', (event) => { errors.push('unhandled: ' + String(event.reason)); });
  if (window.__loaded === null) errors.push('das Bundle hat sich nicht beim Loader angemeldet');

  function toDom(element) {
    if (element === null || element === undefined || element === false || element === true) return null;
    if (Array.isArray(element)) return element.map(toDom).filter((node) => node !== null);
    if (typeof element === 'string' || typeof element === 'number') return document.createTextNode(String(element));
    if (typeof element.type === 'function') return toDom(element.type(element.props ?? {}));
    if (typeof element.type === 'symbol') return toDom(element.children);
    const node = SVG_TAGS.has(element.type)
      ? document.createElementNS('http://www.w3.org/2000/svg', element.type)
      : document.createElement(element.type);
    for (const [key, value] of Object.entries(element.props ?? {})) {
      if (value === null || value === undefined || value === false || key === 'children') continue;
      node.setAttribute(key === 'className' ? 'class' : (ATTR[key] ?? key), String(value));
    }
    for (const child of toDom(element.children)) node.appendChild(child);
    return node;
  }

  // Das ausgelieferte Bundle starten, wie der Client es tut.
  const registration = window.__loaded;
  const plugin = registration.factory((specifier) => {
    if (specifier === 'react') return react_stub;
    throw new Error('unerwartetes require(' + specifier + ')');
  });
  const entries = [];
  plugin.apply({
    slots: {
      inject: (_key, callback) => {
        const result = callback();
        if (result !== null && typeof result === 'object' && typeof result[Symbol.iterator] === 'function') {
          for (const _ of result) { /* Generator-Form ausfuehren */ }
        }
        return () => {};
      },
      register: (options, component) => { entries.push({ options, component }); return () => {}; },
    },
    get: () => undefined,
    effect: () => () => {},
  });

  // Der Nachbau der echten Stellen: Sidebar (Rail im Toggle-Button + Logo-Zeile),
  // Hero-Hitbox, Laufanzeige, Overlay-Layer als letztes Kind des Rahmens.
  const host = document.getElementById('frame-host');
  host.innerHTML = \`
    <div class="\${C.sidebarCol}">
      <button class="\${C.toggle}" type="button" aria-label="Sidebar">
        <span class="\${C.railMark}" aria-hidden="true"><svg class="\${C.fish}" viewBox="0 0 16 16" width="24" height="20"><path d="M2 8h12" fill="currentColor"/></svg></span>
      </button>
      <div class="\${C.brandIdentity}">
        <span class="\${C.brandMark}"><svg class="\${C.fish}" viewBox="0 0 16 16" width="24" height="20"><path d="M2 8h12" fill="currentColor"/></svg></span>
        <span>DeepSeek</span>
      </div>
    </div>
    <div id="center" style="min-height:600px;padding:12px">
      <div class="\${C.headline}" style="display:flex;align-items:center;gap:8px">
        <span class="\${C.fishHitbox}"><svg class="\${C.fish}" viewBox="0 0 16 16" width="34" height="20"><path d="M2 8h12" fill="currentColor"/></svg></span>
        <span>Into the Unknown</span>
      </div>
      <div class="\${C.running}" data-chat-running="true">
        <span class="\${C.runningIcon}"><span class="\${C.runningWhaleAnimated}"></span><svg class="\${C.runningWhaleStill}" viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h12" stroke="currentColor" fill="none"/></svg></span>
      </div>
    </div>
  \`;
  const frame = document.createElement('div');
  frame.className = 'shell-frame';
  frame.style.cssText = 'position:relative;display:grid;grid-template-columns:260px 1fr 0px;min-height:700px;background:#0b0f14;color:#e0e7ff';
  while (host.firstChild) frame.appendChild(host.firstChild);
  const overlay = document.createElement('div');
  overlay.className = C.overlayLayer;
  overlay.setAttribute('data-shell-overlay', 'true');
  frame.appendChild(overlay);
  host.appendChild(frame);

  const place = (name, id, parent, props) => {
    const item = entries.find((entry) => entry.options.name === name && (id === undefined || entry.options.id === id));
    if (item === undefined) { errors.push('Bundle meldet ' + name + (id === undefined ? '' : '#' + id) + ' nicht an'); return; }
    for (const node of [].concat(toDom(item.component(props)))) if (node !== null) parent.appendChild(node);
  };
  place('sidebar.brand.mark', undefined, frame.querySelector('.' + C.railMark), { size: 24 });
  place('sidebar.brand.mark', undefined, frame.querySelector('.' + C.brandMark), { size: 24 });
  place('conversation.hero.brand.mark', undefined, frame.querySelector('.' + C.fishHitbox), { size: 34, className: C.fish });
  place('shell.overlay', 'shinon-background', overlay, {});

  // Der unguenstigste Fall fuer unsere Spezifitaet: das gelieferte CSS ein ZWEITES Mal,
  // diesmal NACH unseren Styles (der Loader haengt je nach Bundle-Reihenfolge so ein).
  const late = document.createElement('style');
  late.id = 'vendor-after';
  late.textContent = document.getElementById('vendor-before').textContent;
  document.head.appendChild(late);

  // KONTROLLE fuer den Durchklick: versteht elementFromPoint ueberhaupt
  // 'pointer-events: none'? Ein Knopf unter einer nicht-klickbaren Ebene muss den
  // Treffer bekommen — sonst waere "der Klick erreicht die UI" nur eine Annahme.
  // Sie liegt am Body (position:fixed, sichtbarer Bereich) und ruehrt den Rahmen nicht an.
  const controlHost = document.createElement('div');
  controlHost.style.cssText = 'position:fixed;left:8px;top:8px;width:120px;height:40px;z-index:500';
  const controlButton = document.createElement('button');
  controlButton.type = 'button';
  controlButton.textContent = 'Kontrolle';
  controlButton.style.cssText = 'position:absolute;left:0;top:0;width:120px;height:40px';
  const controlOverlay = document.createElement('div');
  controlOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  const controlChild = document.createElement('div');
  controlChild.style.cssText = 'position:absolute;inset:0';
  controlOverlay.appendChild(controlChild);
  controlHost.append(controlButton, controlOverlay);
  document.body.appendChild(controlHost);
  const controlRect = controlButton.getBoundingClientRect();
  const controlHit = document.elementFromPoint(controlRect.left + 20, controlRect.top + 20);

  const style = (node, property) => (node === null ? null : getComputedStyle(node)[property] ?? getComputedStyle(node).getPropertyValue(property));
  const animated = document.querySelector('.' + C.runningWhaleAnimated);
  const still = document.querySelector('.' + C.runningWhaleStill);
  const persona = document.querySelector('.shinon-bg__persona');
  const railFallback = frame.querySelector('.' + C.railMark + ' > svg:not(.shinon-mark)');
  const heroFallback = frame.querySelector('.' + C.fishHitbox + ' > svg:not(.shinon-mark)');
  const signRail = frame.querySelector('.' + C.railMark + ' > .shinon-mark');
  const signHero = frame.querySelector('.' + C.fishHitbox + ' > .shinon-mark');
  const frameRect = frame.getBoundingClientRect();
  const personaRect = persona === null ? null : persona.getBoundingClientRect();
  const hit = document.elementFromPoint(frameRect.left + 40, frameRect.top + 120);
  const clipAncestors = [];
  if (persona !== null) {
    for (let node = persona.parentElement; node !== null; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.height < personaRect.height - 1 || rect.width < personaRect.width - 1) clipAncestors.push(node.className || node.tagName);
    }
  }
  const report = {
    errors,
    vendor: {
      cssBlocks: { sidebar: ${sidebar.blocks.length}, hero: ${hero.blocks.length}, chat: ${chat.blocks.length}, layout: ${layout.blocks.length} },
      skippedLiterals: ${sidebar.skipped.length + hero.skipped.length + chat.skipped.length + layout.skipped.length},
    },
    running: {
      mask: animated === null ? null : (getComputedStyle(animated).maskImage || getComputedStyle(animated).webkitMaskImage),
      maskMode: animated === null ? null : getComputedStyle(animated).maskMode,
      background: animated === null ? null : getComputedStyle(animated).backgroundImage,
      animation: animated === null ? null : getComputedStyle(animated).animationName,
      display: style(animated, 'display'),
      width: animated === null ? 0 : animated.getBoundingClientRect().width,
      height: animated === null ? 0 : animated.getBoundingClientRect().height,
      stillDisplay: style(still, 'display'),
    },
    background: persona === null ? null : {
      naturalWidth: persona.naturalWidth,
      naturalHeight: persona.naturalHeight,
      complete: persona.complete,
      opacity: style(persona, 'opacity'),
      visibility: style(persona, 'visibility'),
      pointerEvents: style(persona, 'pointerEvents'),
      // Der Wert, den unser CSS setzt, steht am Container — Kinder erben ihn.
      layerPointerEvents: style(document.querySelector('.shinon-bg'), 'pointerEvents'),
      layerZIndex: style(document.querySelector('.shinon-bg'), 'zIndex'),
      mixBlendMode: style(persona, 'mixBlendMode'),
      maskImage: style(persona, 'maskImage'),
      width: personaRect.width,
      height: personaRect.height,
      coversFrame: frameRect.width > 0 && personaRect.width >= frameRect.width * 0.95 && personaRect.height >= frameRect.height * 0.95,
      clipAncestors,
    },
    layer: {
      zIndex: style(overlay, 'zIndex'),
      position: style(overlay, 'position'),
      pointerEvents: style(overlay, 'pointerEvents'),
      // Die gelieferte AppFrame rendert die Spalten und danach den Overlay-Layer
      // (DocumentTitle, Sidebar, Spalten, bottomRow, overlayLayer) — die Mal-Reihenfolge
      // entscheidet ueber "darueber", nicht ein z-index allein.
      afterColumns: overlay.compareDocumentPosition(frame.querySelector('#' + 'center')) & Node.DOCUMENT_POSITION_PRECEDING ? true : false,
    },
    marks: {
      railFallbackDisplay: railFallback === null ? 'kein Fallback im DOM' : style(railFallback, 'display'),
      heroFallbackDisplay: heroFallback === null ? 'kein Fallback im DOM' : style(heroFallback, 'display'),
      signRailWidth: signRail === null ? 0 : signRail.getBoundingClientRect().width,
      signRailHeight: signRail === null ? 0 : signRail.getBoundingClientRect().height,
      signHeroWidth: signHero === null ? 0 : signHero.getBoundingClientRect().width,
      signRailDisplay: style(signRail, 'display'),
      signRailPaths: signRail === null ? 0 : signRail.querySelectorAll('path').length,
      signRailStroke: signRail === null ? null : style(signRail.querySelector('path'), 'stroke'),
      signRailRects: signRail === null ? -1 : signRail.querySelectorAll('rect').length,
    },
    clickThrough: hit === null ? null : {
      tag: hit.tagName,
      inOverlay: hit === overlay || overlay.contains(hit),
      className: String(hit.className),
    },
    paint: { mask: null, persona: null },
  };

  // Laden die Data-URIs wirklich als Bild? Eine Maske, die nicht laedt, malt nichts —
  // und ein Bild, das nicht dekodiert, hat Breite 0.
  const probe = (source) => new Promise((resolve) => {
    if (typeof source !== 'string' || source === '' || source === 'none') { resolve({ status: 'keine Quelle' }); return; }
    const match = /^url[(](['"]?)([^'")]+)/.exec(source);
    const url = (match === null ? source : match[2].trim());
    if (url === '' || url === 'none') { resolve({ status: 'keine Quelle' }); return; }
    const image = new Image();
    image.onload = () => resolve({ status: 'geladen', width: image.naturalWidth, height: image.naturalHeight, isSvg: url.startsWith('data:image/svg+xml'), length: url.length });
    image.onerror = () => resolve({ status: 'FEHLER', url: url.slice(0, 80) });
    image.src = url;
  });

  Promise.all([
    probe(animated === null ? '' : style(animated, 'maskImage')),
    probe(persona === null ? '' : String(persona.getAttribute('src'))),
  ]).then(([mask, personaProbe]) => {
    report.paint.mask = mask;
    report.paint.persona = personaProbe;
    // JETZT erst Geometrie: vor dem Dekodieren hat das Bild Breite 0 und jede
    // Aussage ueber Sichtbarkeit waere ein Artefakt der Messung.
    const liveRect = frame.getBoundingClientRect();
    if (persona !== null) {
      const rect = persona.getBoundingClientRect();
      report.background.width = rect.width;
      report.background.height = rect.height;
      report.background.naturalWidth = persona.naturalWidth;
      report.background.naturalHeight = persona.naturalHeight;
      report.background.complete = persona.complete;
      report.background.insideFrame = rect.top >= liveRect.top - 1 && rect.bottom <= liveRect.bottom + 1
        && rect.left >= liveRect.left - 1 && rect.right <= liveRect.right + 1;
      report.background.centeredY = Math.abs((rect.top + rect.height / 2) - (liveRect.top + liveRect.height / 2)) <= 2;
      report.background.left = rect.left;
      report.background.top = rect.top;
      report.background.clipAncestors = [];
      for (let node = persona.parentElement; node !== null; node = node.parentElement) {
        const ancestor = node.getBoundingClientRect();
        if (ancestor.height < rect.height - 1 || ancestor.width < rect.width - 1) report.background.clipAncestors.push(node.className || node.tagName);
      }
    }
    const pointX = liveRect.left + 40;
    const pointY = liveRect.top + 120;
    const hit = document.elementFromPoint(pointX, pointY);
    report.clickThrough = hit === null ? null : { tag: hit.tagName, inOverlay: hit === overlay || overlay.contains(hit), className: String(hit.className) };
    // Der ganze Treffer-Stapel an derselben Stelle: er zeigt, ob die Hintergrund-Ebene
    // ueberhaupt in der Trefferliste steht (elementFromPoint allein sagt das nicht).
    report.hitStack = document.elementsFromPoint(pointX, pointY).slice(0, 5).map((node) => node.tagName + '.' + String(node.className));
    // Die DRITTE Marken-Stelle: die breite Sidebar (Logo-Zeile) statt des Rails.
    const signWide = frame.querySelector('.' + C.brandMark + ' > .shinon-mark');
    report.marks.signWideWidth = signWide === null ? 0 : signWide.getBoundingClientRect().width;
    report.marks.signWideDisplay = style(signWide, 'display');
    report.marks.fallbacksHidden = [...frame.querySelectorAll('.' + C.railMark + ' > svg:not(.shinon-mark), .' + C.brandMark + ' > svg:not(.shinon-mark), .' + C.fishHitbox + ' > svg:not(.shinon-mark)')]
      .map((node) => style(node, 'display'));
    report.control = { hitTag: controlHit === null ? null : controlHit.tagName, hitIsButton: controlHit === controlButton };
    report.viewport = { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio };
    // Fuer den Pixel-Vergleich: dieselbe Seite ohne den Hintergrund (?nobg=1).
    if (location.search.indexOf('nobg') !== -1) {
      const layer = document.querySelector('.shinon-bg');
      if (layer !== null) layer.style.display = 'none';
      report.background.hidden = true;
    }
    document.getElementById('report').textContent = JSON.stringify(report);
  });
  } catch (error) {
    // Der Messaufbau meldet seinen EIGENEN Fehler, statt einen Platzhalter zu lassen.
    document.getElementById('report').textContent = JSON.stringify({
      status: 'Fehler',
      error: String(error && error.message ? error.message : error),
      stack: String(error && error.stack ? error.stack : '').split(String.fromCharCode(10)).slice(0, 4).join(' | '),
    });
  }
})();
<\/script>
</body></html>
`;

mkdirSync(WORK, { recursive: true });
const harnessPath = join(WORK, 'harness.html');
writeFileSync(harnessPath, harness);

// Die erzeugte Seite parst? Sonst meldet der Browser einen Syntaxfehler und der
// Bericht bleibt ein Platzhalter — genau das soll dieses Werkzeug nicht zulassen.
for (const [index, block] of [...harness.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  try {
    new vm.Script(block[1], { filename: `harness.html[script ${index + 1}]` });
  } catch (error) {
    fail(`die erzeugte Seite hat einen Syntaxfehler in Skript ${index + 1}: ${error.message}`);
  }
}

// ── 3. Im echten Chromium laufen lassen ──────────────────────────────────────
let dumped = '';
try {
  dumped = execFileSync(BROWSER, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--window-size=1280,800',
    '--virtual-time-budget=5000',
    '--dump-dom',
    `file://${harnessPath}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
} catch (error) {
  fail(`Chromium (${BROWSER}) konnte die Seite nicht laden: ${error.message}`);
}

const match = /<pre id="report">([\s\S]*?)<\/pre>/.exec(dumped);
if (match === null) fail('die Seite hat keinen Bericht geschrieben (Skriptfehler?)');
let report;
try {
  report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
} catch (error) {
  fail(`Bericht nicht lesbar: ${error.message} — ${match[1].slice(0, 300)}`);
}
if (report.status === 'Fehler') fail(`der Messaufbau warf: ${report.error} (${report.stack})`);

// ── 4. Bewerten (jede Zusage einzeln, mit dem gemessenen Wert im Klartext) ───
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

check('die Seite lief fehlerfrei', report.errors.length === 0, report.errors.join(' | ') || 'keine Fehler');
check('Laufanzeige: Shinons Maske gewinnt gegen das gelieferte CSS', String(report.running.mask).includes('data:image/svg+xml'), `mask = ${String(report.running.mask).slice(0, 90)}`);
check('Laufanzeige: die gelieferte Wal-Maske ist verdrängt', !String(report.running.mask).includes('data:image/png'), `mask = ${String(report.running.mask).slice(0, 60)}`);
check('Laufanzeige: die Maske ist ein ladendes Bild', report.paint.mask?.status === 'geladen' && report.paint.mask?.isSvg === true, JSON.stringify(report.paint.mask));
check('Laufanzeige: Shinons Verlauf als Fuellung', /linear-gradient/.test(String(report.running.background)), String(report.running.background).slice(0, 90));
check('Laufanzeige: eigene Bewegung', report.running.animation === 'shinon-running-drift', `animation-name = ${report.running.animation}`);
check('Laufanzeige: sichtbar und bemessen', report.running.display !== 'none' && report.running.width > 0 && report.running.height > 0, `display = ${report.running.display}, ${report.running.width}×${report.running.height}px`);
check('Laufanzeige: der statische Wal ist aus', report.running.stillDisplay === 'none', `display = ${report.running.stillDisplay}`);
if (report.background === null) check('Hintergrund: gerendert', false, 'kein .shinon-bg__persona im DOM');
else {
  check('Hintergrund: das WebP ist dekodiert', report.background.naturalWidth > 0 && report.background.complete, `naturalWidth = ${report.background.naturalWidth}, complete = ${report.background.complete}, Probe = ${JSON.stringify(report.paint.persona)}`);
  // Bewusst NICHT 'deckt den Rahmen': das CSS dieses Hintergrunds verspricht 78% Hoehe,
  // zentriert (`height: min(78%, 620px)`). Verlangt ist, dass die Persona in ihrer
  // Groesse sichtbar ist und nirgends abgeschnitten wird — nicht, dass sie den Rahmen fuellt.
  check('Hintergrund: vollstaendig im Rahmen, nicht abgeschnitten', report.background.insideFrame === true && report.background.centeredY === true, `insideFrame = ${report.background.insideFrame}, zentriert = ${report.background.centeredY}, ${Math.round(report.background.width)}×${Math.round(report.background.height)}px`);
  check('Hintergrund: von keinem Vorfahren beschnitten', report.background.clipAncestors.length === 0, report.background.clipAncestors.join(', ') || 'kein Clip');
  check('Hintergrund: dezent und sichtbar', Number(report.background.opacity) > 0 && Number(report.background.opacity) < 0.5 && report.background.visibility === 'visible', `opacity = ${report.background.opacity}, visibility = ${report.background.visibility}`);
  // Gemessen wird die Kette: unser Container UND der Wert, den das Kind erbt.
  // (Der gelieferte Layer setzt '.overlayLayer>*{pointer-events:auto}' — genau dagegen
  // steht unsere hoeher spezifische Regel.)
  check('Hintergrund: click-through', report.background.layerPointerEvents === 'none' && report.background.pointerEvents === 'none', `Container = ${report.background.layerPointerEvents}, Persona = ${report.background.pointerEvents}`);
  check('Hintergrund: steht im Treffer-Stapel nicht ueber der UI', Array.isArray(report.hitStack) && report.hitStack.every((entry) => !entry.includes('shinon-bg')), `Stapel = ${JSON.stringify(report.hitStack)}`);
}
check('Overlay-Layer: nach den Spalten im Baum und selbst nicht klickbar', report.layer.zIndex === '20' && report.layer.pointerEvents === 'none' && report.layer.afterColumns === true, `z-index = ${report.layer.zIndex}, pointer-events = ${report.layer.pointerEvents}, nach den Spalten = ${report.layer.afterColumns}`);
check('die Durchklick-Messung ist belastbar (Kontrolle)', report.control?.hitIsButton === true, `Kontrolle: ${report.control?.hitTag} — ein Knopf unter einer pointer-events:none-Ebene muss den Treffer bekommen`);
check('der Klick erreicht die UI, nicht die Hintergrund-Ebene', report.clickThrough !== null && report.clickThrough.inOverlay === false, report.clickThrough === null ? 'kein Element unter dem Punkt' : `${report.clickThrough.tag}.${report.clickThrough.className}`);
check('Marke (Sidebar-Rail): Zeichen sichtbar', Number(report.marks.signRailWidth) > 0 && report.marks.signRailDisplay !== 'none', `${report.marks.signRailWidth}px, display = ${report.marks.signRailDisplay}`);
check('Marke (breite Sidebar): Zeichen sichtbar', Number(report.marks.signWideWidth) > 0 && report.marks.signWideDisplay !== 'none', `${report.marks.signWideWidth}px, display = ${report.marks.signWideDisplay}`);
check('alle drei Marken-Stellen: gelieferter Fisch/Wal ist versteckt', report.marks.fallbacksHidden.length === 3 && report.marks.fallbacksHidden.every((value) => value === 'none'), JSON.stringify(report.marks.fallbacksHidden));
check('Marke: Groesse kommt aus dem Slot', Math.round(Number(report.marks.signRailWidth)) === 24 && Math.round(Number(report.marks.signHeroWidth)) === 34, `Rail = ${report.marks.signRailWidth}px, Hero = ${report.marks.signHeroWidth}px`);
check('Marke: gezeichnet, nicht aus Pixeln', report.marks.signRailRects === 0 && report.marks.signRailPaths === 4, `${report.marks.signRailPaths} Pfade, ${report.marks.signRailRects} <rect>`);
check('Marke: der Ring wird gestrichen', report.marks.signRailStroke !== 'none' && report.marks.signRailStroke !== null, `stroke = ${report.marks.signRailStroke}`);
check('Marke: Fallback-Fisch der Sidebar ist versteckt', report.marks.railFallbackDisplay === 'none', `display = ${report.marks.railFallbackDisplay}`);
check('Marke: Fallback-Wal im Hero ist versteckt', report.marks.heroFallbackDisplay === 'none', `display = ${report.marks.heroFallbackDisplay}`);

// ── 5. Pixel-Beleg: wird der Hintergrund wirklich GEMALT? ────────────────────
// computed styles sagen, dass nichts ihn verbietet — nicht, dass Farbe ankommt.
// Deshalb derselbe Aufbau zweimal fotografiert (mit und ohne Hintergrund) und die
// Bilder im Persona-Bereich verglichen.
function png(buffer) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let depth = 0;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('latin1', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0 || depth !== 8) throw new Error(`PNG-Format nicht unterstuetzt (colorType ${colorType}, depth ${depth})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const current = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? current[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      }
      current[x] = value & 0xff;
    }
    current.copy(pixels, y * stride);
    previous = current;
  }
  return { width, height, channels, pixels };
}

function shoot(url, out) {
  execFileSync(BROWSER, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=1280,800', '--virtual-time-budget=5000',
    `--screenshot=${out}`, url,
  ], { stdio: 'ignore', timeout: 120000 });
  return readFileSync(out);
}

try {
  const withBg = png(shoot(`file://${harnessPath}`, join(WORK, 'with-background.png')));
  const withoutBg = png(shoot(`file://${harnessPath}?nobg=1`, join(WORK, 'without-background.png')));
  const box = report.background;
  const scale = withBg.width / (report.viewport?.width ?? withBg.width);
  const x0 = Math.max(0, Math.round(box.left * scale));
  const y0 = Math.max(0, Math.round(box.top * scale));
  const x1 = Math.min(withBg.width, Math.round((box.left + box.width) * scale));
  const y1 = Math.min(withBg.height, Math.round((box.top + box.height) * scale));
  let changed = 0;
  let total = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumDelta = 0;
  let sumBaseB = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * withBg.width + x) * withBg.channels;
      total += 1;
      const dr = Math.abs(withBg.pixels[i] - withoutBg.pixels[i]);
      const dg = Math.abs(withBg.pixels[i + 1] - withoutBg.pixels[i + 1]);
      const db = Math.abs(withBg.pixels[i + 2] - withoutBg.pixels[i + 2]);
      sumDelta += Math.max(dr, dg, db);
      sumBaseB += withoutBg.pixels[i + 2];
      if (Math.max(dr, dg, db) > 8) {
        changed += 1;
        sumR += withBg.pixels[i];
        sumG += withBg.pixels[i + 1];
        sumB += withBg.pixels[i + 2];
      }
    }
  }
  const ratio = total === 0 ? 0 : changed / total;
  const mean = changed === 0 ? { r: 0, g: 0, b: 0 } : { r: sumR / changed, g: sumG / changed, b: sumB / changed };
  const meanDelta = total === 0 ? 0 : sumDelta / total;
  const baseB = total === 0 ? 0 : sumBaseB / total;
  check('der Hintergrund veraendert wirklich Pixel (Screenshot-Vergleich)', ratio > 0.2, `${changed}/${total} Pixel im Persona-Bereich (${Math.round(ratio * 100)}%), Bild ${withBg.width}×${withBg.height}`);
  // Kein erfundener Helligkeitswert: gemessen wird die RICHTUNG (Violett hebt den
  // Blaukanal ueber den Grundwert) — die Deckkraft ist Absicht, 17%.
  check('die gemalten Pixel heben Violett (Blau > Rot > Gruen, ueber dem Grundwert)', mean.b > mean.r && mean.r > mean.g && mean.b > baseB + 5, `Mittel der geaenderten Pixel rgb(${Math.round(mean.r)}, ${Math.round(mean.g)}, ${Math.round(mean.b)}), Grund-Blau ${Math.round(baseB)}`);
  check('der Hintergrund bleibt dezent (deckt die UI nicht zu)', meanDelta < 40, `mittlere Aenderung ${meanDelta.toFixed(1)} von 255 je Kanal`);
} catch (error) {
  check('Screenshot-Vergleich moeglich', false, `Chromium-Screenshot nicht auswertbar: ${error.message}`);
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n🌐 Branding-Messung im echten Chromium (${BROWSER})`);
console.log(`   Seite:      ${harnessPath.replace(ROOT, '')}`);
console.log(`   Bundle:     ${BUNDLE.replace(ROOT, '')} (ausgeliefert)`);
console.log(`   Vendor-CSS: ${sidebar.blocks.length + hero.blocks.length + chat.blocks.length + layout.blocks.length} Bloecke (Sidebar ${sidebar.blocks.length}/Hero ${hero.blocks.length}/Chat ${chat.blocks.length}/Layout ${layout.blocks.length}), zweimal eingehaengt: VOR und NACH unseren Styles\n`);
for (const entry of checks) console.log(`  ${entry.ok ? '✅' : '❌'} ${entry.name}${entry.ok ? '' : ` — gemessen: ${entry.detail}`}`);
console.log(`\n═══════════════════════════════════════`);
console.log(`  Ergebnisse: ${checks.length - failed.length} bestanden, ${failed.length} fehlgeschlagen`);
console.log(`═══════════════════════════════════════`);
console.log(`(Mess-Seite: ${harnessPath.replace(ROOT, '')}${KEEP ? ' — bleibt stehen' : ''})\n`);
if (failed.length > 0) {
  console.log(`Gemessener Bericht:\n${JSON.stringify(report, null, 2)}\n`);
  process.exit(1);
}
