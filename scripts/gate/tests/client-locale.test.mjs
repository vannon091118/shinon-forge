#!/usr/bin/env node
/**
 * Abnahmetest für Schritt 2.6 (F-l / F-m): kein werfender Dienstzugriff in den
 * Client-Hälften, und keine zweite Sprachtabelle ohne Besitzer.
 *
 * Warum diese Datei existiert: zwei Fehler derselben Familie haben die
 * Oberfläche schon einmal gekostet — ein direkter Dienstzugriff (`ctx.locale`,
 * `ctx[name]`) am Cordis-Proxy wirft ohne `inject`
 * ('cannot get property "locale" without inject'), und die Fallback-Texte der
 * Hälften waren neben dem Wörterbuch von @shinon/locale-de eine zweite Wahrheit.
 * Beides ist statisch prüfbar, also wird es geprüft statt erinnert:
 *
 *   1. `ctx.locale` darf NUR in `@shinon/locale-de` stehen (der Besitzerin des
 *      Namensraums); jede andere Hälfte liest `ctx.get?.('locale')`.
 *   2. `ctx[<name>]` (Klammerzugriff auf einen Dienst) kommt in keiner
 *      Client-Hälfte vor — das ist derselbe direkte Zugriff in anderer Schreibweise.
 *   3. Jeder Fallback-Schlüssel der generierten Bausteine existiert als Schlüssel
 *      im `shinon`-Wörterbuch von `locale-de` — keine Texte ohne Besitzer.
 *
 * Geprüft wird CODE (Kommentare und String-Inhalte zählen nicht, siehe
 * scripts/lib/source-scan.mjs): die Blöcke ERKLÄREN den Fehler, den sie vermeiden.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml), in der
 * Gate-Suite `npm run gate:test`. Kein Netz, kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly, stripComments } from '../../lib/source-scan.mjs';
import { regionsOf } from '../../lib/plugin-idioms.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OWNER = 'locale-de';

const clientFiles = () =>
  readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

test('nur die Besitzerin liest `ctx.locale` direkt — alle anderen über `ctx.get?.()`', () => {
  const offenders = [];
  for (const dir of clientFiles()) {
    if (dir === OWNER) continue;
    const code = codeOnly(readFileSync(join(ROOT, 'packages', dir, 'client.js'), 'utf8'));
    if (code.includes('ctx.locale')) offenders.push(`packages/${dir}/client.js`);
  }
  assert.deepEqual(offenders, [], 'direkter Locale-Zugriff ohne inject (F-l)');
});

test('kein Klammerzugriff `ctx[…]` in Client-Hälften (F-m)', () => {
  const offenders = [];
  for (const dir of clientFiles()) {
    const code = codeOnly(readFileSync(join(ROOT, 'packages', dir, 'client.js'), 'utf8'));
    if (/\bctx\s*\[/.test(code)) offenders.push(`packages/${dir}/client.js`);
  }
  assert.deepEqual(offenders, [], '`ctx[name]` ist ein direkter Dienstzugriff und wirft ohne inject');
});

test('jeder Fallback-Schlüssel hat GENAU EINEN Eintrag im Wörterbuch von locale-de', () => {
  // Hier OHNE String-Leerung: die Schlüssel SIND Strings (stripComments lässt sie stehen).
  const dictionary = stripComments(readFileSync(join(ROOT, 'packages', OWNER, 'client.js'), 'utf8'));
  const keys = regionsOf('client.js')
    .map((region) => region.params?.key)
    .filter((key) => typeof key === 'string');
  assert.ok(keys.length >= 5, `erwartet mindestens 5 Fallback-Schlüssel, gefunden ${keys.length}`);
  for (const key of new Set(keys)) {
    const wanted = `'${key}':`;
    assert.equal(
      dictionary.split(wanted).length - 1,
      1,
      `"${key}" muss genau einmal im Wörterbuch von @shinon/${OWNER} stehen (E6: eine Tabelle, keine zweite, wortgleiche Hälfte)`,
    );
  }
});

test('das Wörterbuch ist EINE Tabelle, die beide Sprachslots bekommt (E6)', () => {
  // Mit Strings (stripComments): der Namespace-Name ist ein String-Literal.
  const code = stripComments(readFileSync(join(ROOT, 'packages', OWNER, 'client.js'), 'utf8'));
  assert.ok(
    /locale\.register\(\s*'shinon'\s*,\s*\{\s*en:\s*TEXTS\s*,\s*de:\s*TEXTS\s*\}\s*\)/.test(code),
    'beide Sprachslots müssen dieselbe Tabelle bekommen: register(\'shinon\', { en: TEXTS, de: TEXTS })',
  );
});
