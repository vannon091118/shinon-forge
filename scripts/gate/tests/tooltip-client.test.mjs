#!/usr/bin/env node
/**
 * scripts/gate/tests/tooltip-client.test.mjs — die Tooltip-Skin greift an den Token, nicht an eine Klasse.
 *
 * Der Befund, der diese Datei nötig gemacht hat: die Client-Hälfte injizierte
 * eine Regel für `.dsh-tooltip` — eine Klasse, die im Baum NIEMAND setzt (kein
 * Shinon-Client, und `dsh-tooltip` kommt in `node_modules/@deepseek-ai/**` nicht
 * vor). Die Regel war toter Text, der wie Gestaltung aussah. Wirksam ist nur,
 * was die Oberfläche selbst liest: DSH zeichnet die Tooltip-Blase mit
 * `var(--dsw-alias-tooltip-bg)`, die Tasten-Hülle mit
 * `var(--dsw-alias-tooltip-key-bg)` (Themeschicht `body` bzw.
 * `body[data-ds-dark-theme]`). Genau diese Aliase überschreibt die Hälfte.
 *
 * Warum ein Test das pinnt, obwohl CSS keinen Fehler wirft: ein Tippfehler in
 * einem Eigenschaftsnamen ist in CSS KEIN Fehler, die Deklaration wird
 * stillschweigend ignoriert. Ein Skin, der nichts färbt, sieht aus wie ein
 * Skin, der nichts zu färben hat.
 *
 * Vier Zusagen, jede mit Mutationsprobe:
 *   1. EIN Stylesheet, zwei Blöcke (`body`, `body[data-ds-dark-theme]`), sonst
 *      gewinnt im dunklen Theme die DSH-Themeschicht und der Skin ist weg.
 *   2. Jedes gesetzte Token existiert in der installierten Themen-Schicht
 *      (sichtbarer Skip ohne `node_modules` — CI hat keine).
 *   3. Werte sind volle Hex-Farben, und der dunkle Block ist DUNKLER als der
 *      helle; sonst ist „dark" nur ein Selektor.
 *   4. Keine eigene Klasse: `.dsh-tooltip` kommt in der Skin nicht mehr vor.
 *
 * Geprüft wird der TEXT, den das Bundle wirklich einfügt (das Style-Element im
 * Attrappen-`document.head`) — nicht die Absicht im Quelltext. Ob der Browser
 * ihn genau so anwendet, entscheidet erst ein lebender Boot; die Spezifität ist
 * hier als Konvention gepinnt (`body[data-ds-dark-theme]` schlägt `:root`, weil
 * die Themeschicht dieselben Selektoren setzt und die spätere Einfügung gewinnt).
 */
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadClientBundle, requireStub } from './helpers/client-sandbox.mjs';

const THEME = new URL('../../../node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js', import.meta.url);
const themeSource = existsSync(THEME) ? readFileSync(THEME, 'utf8') : null;

/** Die Hälfte laden und den Style-Knoten holen, den sie selbst ins Dokument hängt. */
function skin() {
  const { registration, sandbox } = loadClientBundle('tooltip');
  const page = sandbox.sandbox;
  // `factory` ist der Punkt, an dem die Hälfte ihr Stylesheet einfügt — erst
  // danach hat `document.head` den Knoten, den der Test lesen will.
  const plugin = registration.factory(requireStub());
  const styles = page.document.head.children.filter((child) => child.tagName === 'STYLE');
  return { plugin, page, styles, css: styles[0]?.textContent ?? '' };
}

/**
 * Das Stylesheet als { light, dark } → Map(Token, Wert), plus die Zeilen, die
 * keine Deklaration sind. Diese dritte Rückgabe ist der Grund für den Parser:
 * ein Tippfehler, der eine Zeile unlesbar macht, darf nicht verschwinden.
 */
function declarations(css) {
  const blocks = new Map();
  const stray = [];
  let current = null;
  for (const line of String(css).split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed === '/*' || trimmed.startsWith('/*')) continue;
    if (trimmed === 'body {') {
      current = 'light';
      blocks.set(current, new Map());
      continue;
    }
    if (trimmed === 'body[data-ds-dark-theme] {') {
      current = 'dark';
      blocks.set(current, new Map());
      continue;
    }
    if (trimmed === '}') {
      current = null;
      continue;
    }
    const match = /^(--[\w-]+):\s*(#[0-9A-Fa-f]{6});$/.exec(trimmed);
    if (match !== null && current !== null) {
      blocks.get(current).set(match[1], match[2]);
      continue;
    }
    stray.push(trimmed);
  }
  return { blocks, stray };
}

/** Relative Helligkeit (WCAG-Formel, nur zum Vergleich zweier Themes). */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const linear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Die Skin prüfen. `theme` ist die Themen-Schicht oder `null` (dann entfällt
 * NUR die Existenzprüfung der Namen — der Rest gilt immer).
 */
function tokenIssues(css, theme = null) {
  const issues = [];
  const { blocks, stray } = declarations(css);
  for (const line of stray) issues.push(`unlesbare Zeile im Skin: ${line}`);
  const light = blocks.get('light');
  const dark = blocks.get('dark');
  if (light === undefined) issues.push('der helle Block (`body`) fehlt');
  if (dark === undefined) issues.push('der dunkle Block (`body[data-ds-dark-theme]`) fehlt');
  if (light === undefined || dark === undefined) return issues;

  if (light.size === 0) issues.push('der helle Block setzt kein Token');
  for (const name of light.keys()) {
    if (!dark.has(name)) issues.push(`"${name}" fehlt im dunklen Block`);
  }
  for (const [themeName, tokens] of blocks) {
    for (const [name, value] of tokens) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(value)) issues.push(`${themeName}: "${name}" ist keine volle Hex-Farbe (${value})`);
      if (theme !== null && !theme.includes(name.slice(2))) issues.push(`"${name}" kommt in der Themen-Schicht der DSH-Fassung nicht vor (Tippfehler?)`);
    }
  }
  for (const name of light.keys()) {
    const lightValue = light.get(name);
    const darkValue = dark.get(name);
    if (!lightValue || !darkValue) continue;
    if (!(luminance(darkValue) < luminance(lightValue))) {
      issues.push(`"${name}" ist im dunklen Theme nicht dunkler (${lightValue} → ${darkValue})`);
    }
  }
  if (/\.dsh-tooltip\b/.test(css)) issues.push('die Skin gestaltet wieder eine Klasse (.dsh-tooltip), die niemand setzt');
  return issues;
}

test('tooltip: EIN Stylesheet mit beiden Theme-Blöcken', () => {
  const half = skin();
  assert.equal(half.styles.length, 1, 'die Hälfte fügt mehr oder weniger als ein Stylesheet ein');
  assert.equal(half.styles[0].dataset.pluginCss, '@shinon/tooltip/tooltip-tokens.css');
  assert.equal(half.styles[0].dataset.plugin, '@shinon/tooltip');
  const { blocks, stray } = declarations(half.css);
  assert.deepEqual(stray, [], `unlesbare Zeilen: ${stray.join(' | ')}`);
  assert.deepEqual([...blocks.keys()], ['light', 'dark']);
  assert.deepEqual(tokenIssues(half.css, themeSource), []);
});

test('tooltip: jedes Token existiert in der Themen-Schicht der DSH-Fassung', { skip: themeSource === null ? 'uebersprungen (Grund: @deepseek-ai/dsh-client-ui-theme nicht installiert)' : false }, () => {
  const { blocks } = declarations(skin().css);
  const names = [...(blocks.get('light')?.keys() ?? [])];
  assert.ok(names.length >= 2, 'die Skin setzt weniger Token als die beiden Tooltip-Aliase');
  for (const name of names) {
    assert.ok(themeSource.includes(name.slice(2)), `${name} ist in der Themeschicht unbekannt — die Deklaration würde still ignoriert`);
  }
  // Die Klasse, die früher hier stand, ist in der ausgelieferten Oberfläche nirgends gesetzt.
  assert.ok(!themeSource.includes('dsh-tooltip'), 'die Erklärung im Kopf der Hälfte stimmt nicht mehr: DSH setzt .dsh-tooltip');
});

test('tooltip: der dunkle Block ist dunkler und der Skin erfindet keine Klasse', () => {
  const { plugin, css } = skin();
  assert.equal(plugin.inject.length, 0, 'die Hälfte deklariert einen Dienst, den sie nicht benutzt');
  assert.ok(!css.includes('.dsh-tooltip'), 'die tote Klasse ist zurück');
  const { blocks } = declarations(css);
  for (const [name, value] of blocks.get('light')) {
    assert.ok(luminance(blocks.get('dark').get(name)) < luminance(value), `${name} ist im dunklen Theme nicht dunkler`);
  }
});

test('tooltip: Tippfehler, fehlender Dark-Block und tote Klasse sind je rot (Mutationsprobe)', () => {
  const css = skin().css;
  assert.deepEqual(tokenIssues(css, themeSource), [], 'die echte Skin ist nicht sauber');

  const typo = css.replace('--dsw-alias-tooltip-bg', '--dsw-alias-tooltip-background');
  assert.ok(tokenIssues(typo, themeSource).some((issue) => issue.includes('--dsw-alias-tooltip-background')), 'ein Token-Tippfehler bleibt unbemerkt');

  const withoutDark = css.replace(/body\[data-ds-dark-theme\] \{[\s\S]*?\n\s*\}/, '');
  assert.ok(tokenIssues(withoutDark, themeSource).some((issue) => issue.includes('dunkle Block')), 'ein fehlender Dark-Block bleibt unbemerkt');

  const deadClass = `${css}\n        .dsh-tooltip { background: #000000; }`;
  assert.ok(tokenIssues(deadClass, themeSource).some((issue) => issue.includes('.dsh-tooltip')), 'die tote Klasse bleibt unbemerkt');

  const brighter = css.replace('#1C1030', '#FFFFFF').replace('#2E1B4D', '#F5F5F5');
  assert.ok(tokenIssues(brighter, themeSource).some((issue) => issue.includes('nicht dunkler')), 'ein hellerer Dark-Wert bleibt unbemerkt');
});
