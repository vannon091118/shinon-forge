/** Teil 1/2 von client-activation.test.mjs — Fixtures stehen in `client-activation-fixtures.mjs`. */
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
test('das Menü-Label trägt auch an einem Context ohne `get` (repo-eigene Attrappen)', () => {
  const problems = [];
  const run = (dir, fn) => {
    try { fn(); } catch (error) { problems.push(`@shinon/${dir}: apply warf am Attrappen-Context — ${error.message}`); }
  };
  for (const dir of ['markers', 'popup']) {
    const entries = [];
    run(dir, () => loadBundle(dir).registration.factory(requireStub()).apply(stubContext(entries)));
    if (entries.some((item) => item.options.name === 'sidebar.panellist')) problems.push(`@shinon/${dir}: sidebar.panellist-Anmeldung ist entfernt, aber noch da`);
  }
  for (const [dir, label] of Object.entries(PANELLIST_LABELS)) {
    const entries = [];
    run(dir, () => {
      loadBundle(dir).registration.factory(requireStub()).apply(stubContext(entries));
      const entry = entries.find((item) => item.options.name === 'sidebar.panellist');
      if (entry === undefined) problems.push(`@shinon/${dir}: keine sidebar.panellist-Anmeldung`);
      else if (typeof entry.options.label !== 'function' || entry.options.label() !== label) problems.push(`@shinon/${dir}: Label falsch`);
    });
  }
  // Token-Anzeige: rendert `t` erst später, daher nur der Titel-Fallback.
  run('token-usage', () => {
    const entries = [];
    loadBundle('token-usage').registration.factory(requireStub()).apply(stubContext(entries));
    const entry = entries.find((item) => item.options.name === 'sidebar.footer.action');
    if (entry?.component({ wide: false })?.props?.title !== 'Token: --') problems.push('@shinon/token-usage: Titel falsch oder fehlt');
  });
  assert.deepEqual(problems, [], problems.join('\n'));
});
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
  const expected = PANELLIST_LABELS;

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
