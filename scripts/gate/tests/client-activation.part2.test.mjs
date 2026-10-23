/** Teil 2/2 von client-activation.test.mjs — Fixtures stehen in `client-activation-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly, stripComments } from '../../lib/source-scan.mjs';
import { browserSandbox, loadClientBundle as loadBundle, node, requireStub } from './helpers/client-sandbox.mjs';
import { DECISION_CHANNEL as HOST_PROMPTER_DECISION } from '../../../packages/prompter/assets/mode-core.js';
import { ROOT, PACKAGES, require, CORDIS_SURFACE, bundles, sourceOf, flatten, render, injected, serviceReads, slotsService, localeService, clientRoot, mount, stubContext, PANELLIST_LABELS, cordis, missing, skip } from './client-activation-fixtures.mjs';

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
test('prompter-client: das Kanal-Literal ist der Host-Kanal (kein Drift)', () => {
  const match = /const DECISION_CHANNEL = '([^']+)'/.exec(sourceOf('prompter'));
  assert.ok(match !== null, 'client.js trägt kein DECISION_CHANNEL-Literal — ein Drift wäre still');
  assert.equal(match[1], HOST_PROMPTER_DECISION, 'Client-Kanal ≠ Host-Kanal: das Abo liefe ins Leere');
});
test('prompter: Fenster-Global und Live-Route heißen auf beiden Seiten gleich', () => {
  // Der Client kann das Host-Modul nicht importieren (eigenes Bündel), also sind
  // beide Namen Literale. Gemessen 2026-10-17: Host schrieb
  // `__SHINON_PROMPTER_TRACE__`, das Panel las `__shinonPrompterTrace` — der
  // Puffer war da und die Anzeige trotzdem leer. Dieser Test pinnt die Paare.
  const host = readFileSync(fileURLToPath(new URL('packages/prompter/index.js', ROOT)), 'utf8');
  const globalName = /export const TRACE_GLOBAL = '([^']+)'/.exec(host);
  const endpoint = /export const TRACE_ENDPOINT = '([^']+)'/.exec(host);
  assert.ok(globalName !== null, 'Host deklariert TRACE_GLOBAL nicht');
  assert.ok(endpoint !== null, 'Host deklariert TRACE_ENDPOINT nicht');
  const client = stripComments(sourceOf('prompter'));
  assert.ok(
    client.includes(`window.${globalName[1]}`),
    `Client liest window.${globalName[1]} nicht — das Panel bliebe leer`,
  );
  assert.ok(
    client.includes(`'${endpoint[1]}'`),
    `Client fragt ${endpoint[1]} nicht ab — es gäbe keinen Live-Kanal`,
  );
});
test('prompter-client: eine Kanal-Entscheidung landet im Fenster-Spiegel', () => {
  const { registration, sandbox } = loadBundle('prompter');
  const seen = {};
  const fake = {
    slots: {
      inject: (_key, callback) => { callback(); return () => {}; },
      register: () => () => {},
    },
    effect: () => () => {},
    on: (channel, handler) => { seen[channel] = handler; return () => {}; },
  };
  registration.factory(requireStub()).apply(fake);
  const handler = seen[HOST_PROMPTER_DECISION];
  assert.equal(typeof handler, 'function', 'kein Abo auf dem Host-Kanal — das Panel bliebe ewig leer');
  handler({
    outcome: 'rejected',
    mode: 'MAX',
    reasons: ['NO_JSON'],
    context_source: 'runtime',
    session_id: 's1',
    // Die Abbruchquote reist im Datensatz; das Panel liest sie aus dem Spiegel.
    abort: { id: 'KEIN_JSON', label: 'Keine JSON-Antwort' },
    abort_counts: { KEIN_JSON: 1 },
    abort_quote: { contract: 'shinon.prompter/abort-v1', turns: 9, aborts: 5, quote: 5 / 9, top: 'KEIN_JSON', topLabel: 'Keine JSON-Antwort', counts: { KEIN_JSON: 3 } },
  });
  const trace = sandbox.sandbox.__shinonPrompterTrace;
  assert.equal(Array.isArray(trace), true, 'kein Spiegel im Fenster');
  assert.equal(trace.length, 1);
  assert.equal(trace[0].outcome, 'rejected');
  assert.equal(trace[0].mode, 'MAX');
  assert.equal(trace[0].context_source, 'runtime');
  assert.deepEqual([...trace[0].reasons], ['NO_JSON']);
  // Was das Panel BRAUCHT, muss den Kanal überstehen: die Zahlen und die zwei
  // Gründe. Mehr Felder trägt der Spiegel nicht (der volle Datensatz bleibt auf
  // dem Kanal) — ein Panel, das `counts` läse, läse dort nichts.
  assert.deepEqual({ ...trace[0].abort_quote }, {
    turns: 9, aborts: 5, quote: 5 / 9, top: 'KEIN_JSON', topLabel: 'Keine JSON-Antwort',
  }, 'die Abbruchquote fällt auf dem Weg über den Kanal weg');
});
test('prompter-panel: Quote und häufigster Grund stehen im Klartext', () => {
  // Der Host schreibt den Fensterspiegel; hier steht er VOR dem Mounten (der
  // geladene Stand, nicht der Live-Kanal). Gerendert wird das ausgelieferte
  // Bundle — die Zahl im Text und der Grund im Tooltip.
  const { registration, sandbox } = loadBundle('prompter');
  sandbox.sandbox.__shinonPrompterTrace = [{
    outcome: 'rejected',
    mode: 'MAX',
    intent: 'UNDEFINED',
    context_source: 'runtime',
    reasons: ['NO_JSON'],
    abort: { id: 'KEIN_JSON', label: 'Keine JSON-Antwort' },
    abort_counts: { KEIN_JSON: 1 },
    abort_quote: { contract: 'shinon.prompter/abort-v1', turns: 9, aborts: 5, quote: 5 / 9, top: 'KEIN_JSON', topLabel: 'Keine JSON-Antwort', counts: { KEIN_JSON: 3 } },
  }];
  const captured = [];
  const fake = {
    slots: {
      inject: (_key, callback) => { callback(); return () => {}; },
      register: (options, component) => { captured.push({ options, component }); return () => {}; },
    },
    effect: () => () => {},
    on: () => () => {},
  };
  // Ein React, das den Initialisierer von `useState` AUSFÜHRT — die Attrappe aus
  // dem Helfer reicht sie durch, und dann wäre `trace` eine Funktion.
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: () => {},
    Fragment: Symbol('react.fragment'),
  };
  const requireWith = (specifier) => {
    if (specifier === 'react') return react;
    throw new Error(`unerwartetes require('${specifier}')`);
  };
  registration.factory(requireWith).apply(fake);
  const panel = captured.find((item) => item.options.name === 'main');
  assert.ok(panel !== undefined, 'das Panel registriert sich nicht im main-Slot');
  const nodes = flatten(render(panel.component({})));
  const text = nodes.map((element) => (Array.isArray(element.children) ? element.children.filter((child) => typeof child === 'string').join('') : '')).join(' ');
  // Roh-Token sind ersetzt: die Quote steht als Satz da, der Grund daneben statt im zweiten Tooltip.
  assert.match(text, /Abbrüche: 5 von 9 · häufigster Grund: Keine JSON-Antwort/, 'die Quote steht nicht im Klartext');
  assert.ok(!text.includes('abbr=') && !text.includes('mode=MAX'), 'die Roh-Token sind wieder da');
  assert.match(text, /Modus MAX/, 'der Modus wird nicht als Wort genannt');
});
