#!/usr/bin/env node
/**
 * profile-config-override — die Falle, die den Prompter drei Wochen stilllegte.
 *
 * BEFUND: eine id-gezielte Config in `profiles/<profil>/cordis.patch.yml` ERSETZT
 * die Config des Bundle-Eintrags, sie mischt nicht. Der Prompter hatte in
 * `packages/prompter/cordis.patch.yml` `mode: MAX` und eine Route; das Profil
 * fasste denselben Eintrag an, um `skillsPath` zu setzen — und damit fiel alles
 * auf Schema-Defaults zurueck (MIN, leere Route). Der Enhancer mountete, meldete
 * `NO_ROUTE` und veredelte nie etwas. Kein Fehler, keine Warnung, kein roter Test:
 * die Werte sahen wirksam aus und waren es nie.
 *
 * DREI ZUSAGEN, aufsteigend scharf:
 *
 *   1. KLASSE — keine id traegt ihre Config in BEIDEN Ebenen. Genau diese
 *      Doppelung produziert die stille Ersetzung, egal welches Paket sie trifft.
 *   2. SUBSTANZ — die id-gezielte Config im Profil ist nicht leer. Ohne diese
 *      Zusage waere Zusage 1 durch Loeschen aller Werte erfuellbar: die Falle
 *      waere weg und der Prompter trotzdem tot (fail-open).
 *   3. RUNTIME — `dsh --profile <p> --dump-config` liefert fuer den Prompter
 *      genau die Werte, die das Profil nennt. Das ist der Beweis am echten
 *      Resolver statt an einer Datei. Braucht `dsh`; ohne es wird sichtbar
 *      uebersprungen (dieselbe Regel wie beim Store- und Uebergabetest).
 *
 * Zusage 3 ist die einzige, die den Fehler AUCH am laufenden Profil gefunden
 * haette. Sie ist bewusst dabei und bewusst nicht die einzige: ein Test, der
 * ohne `dsh` schweigt, darf die anderen Zusagen nicht mitnehmen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, activeProfile, parsePatchFile } from '../../lib/repo.mjs';
import { dshRoot } from '../../lib/yaml.mjs';

const profilePatch = (name) => join(ROOT, 'profiles', name, 'cordis.patch.yml');

/** Die Eintraege des Profils, die eine id ZIELEN und dabei Config setzen. */
function profileTargets(name) {
  const file = profilePatch(name);
  if (!existsSync(file)) return { missing: file, targets: new Map(), issues: ['Profil-Patch fehlt'] };
  const { patches, issues } = parsePatchFile(file);
  const targets = new Map();
  for (const patch of patches) {
    // `insert` ist die Bring-Seite (neue Eintraege), `id` die Ziel-Seite
    // (aendert einen bestehenden Eintrag). Nur die Ziel-Seite ersetzt Config.
    if (typeof patch.id !== 'string' || patch.config === undefined) continue;
    targets.set(patch.id, patch.config);
  }
  return { missing: null, targets, issues };
}

/** Alle Paket-Patches mit ihrer Insert-Config, nach id. */
function bundleConfigs() {
  const found = new Map();
  const dir = join(ROOT, 'packages');
  for (const entry of readdirSync(dir).sort()) {
    const file = join(dir, entry, 'cordis.patch.yml');
    if (!existsSync(file)) continue;
    const { patches } = parsePatchFile(file);
    for (const patch of patches) {
      for (const row of Array.isArray(patch.insert) ? patch.insert : []) {
        if (typeof row?.id !== 'string') continue;
        found.set(row.id, { file: `packages/${entry}/cordis.patch.yml`, config: row.config });
      }
    }
  }
  return found;
}

const PROFILE = activeProfile();
assert.ok(PROFILE, 'aktives Profil nicht bestimmbar (scripts.dev ohne --profile)');

test('profile-config-override: keine id traegt ihre Config in beiden Ebenen', () => {
  const { targets, issues } = profileTargets(PROFILE);
  assert.deepEqual(issues, [], 'Profil-Patch ist nicht lesbar');
  const bundles = bundleConfigs();

  const doubled = [];
  for (const [id, config] of targets) {
    const bundle = bundles.get(id);
    if (bundle === undefined || bundle.config === undefined) continue;
    doubled.push(`${id}: Profil ${PROFILE}/cordis.patch.yml UND ${bundle.file} setzen beide config — die Profil-Ebene ERSETZT die Paket-Config, sie mischt nicht. Werte ins Profil, Config aus dem Paket-Patch entfernen.`);
  }
  assert.deepEqual(doubled, [], doubled.join('\n'));
});

test('profile-config-override: eine id-gezielte Config im Profil ist nie leer', () => {
  const { targets } = profileTargets(PROFILE);
  assert.ok(targets.size > 0, 'das Profil zielt keine einzige id an — dann pruefen die Zusagen oben nichts');
  for (const [id, config] of targets) {
    assert.ok(
      config !== null && typeof config === 'object' && Object.keys(config).length > 0,
      `${id}: leere Config im Profil — eine Falle gegen ein leeres Versprechen getauscht`,
    );
  }
});

test('profile-config-override: der Prompter steht mit MAX, Route und Skill-Pfad im Profil', () => {
  const { targets } = profileTargets(PROFILE);
  const config = targets.get('shinon-prompter');
  assert.ok(config, 'shinon-prompter wird vom Profil nicht mehr gezielt — die Regel galt fuer ihn zuletzt');
  assert.equal(config.mode, 'MAX', 'mode muss MAX sein: nur MAX fragt den Project Index');
  assert.equal(typeof config.provider, 'string', 'provider fehlt — ohne Route kein Aufruf');
  assert.notEqual(config.provider, '', 'leerer provider heisst NO_ROUTE: der Enhancer tut dann nichts');
  assert.equal(typeof config.model, 'string', 'model fehlt — ohne Route kein Aufruf');
  assert.notEqual(config.model, '', 'leeres model heisst NO_ROUTE: der Enhancer tut dann nichts');
  assert.equal(config.skillsPath, '.agents/skills', 'skillsPath muss die Skill-Selektion erreichbar halten');
  assert.equal(config.contextPath, undefined, 'contextPath bleibt leer: eine gesetzte, kaputte Datei sperrt MAX fail-closed vor der Index-Abfrage');
});

test('profile-config-override: das Paket traegt keine wirksame Config mehr', () => {
  const text = readFileSync(join(ROOT, 'packages/prompter/cordis.patch.yml'), 'utf8');
  const parsed = parsePatchFile(join(ROOT, 'packages/prompter/cordis.patch.yml'));
  const inserted = parsed.patches.flatMap((patch) => (Array.isArray(patch.insert) ? patch.insert : []));
  assert.equal(inserted.length, 1, 'genau EIN Insert-Eintrag');
  assert.equal(inserted[0].config, undefined, 'der Paket-Patch darf keine Config tragen — sie waere nicht wirksam und wuerde die Ersetzung verschleiern');
  assert.match(text, /id:\s*shinon-prompter/);
});

test('profile-config-override: das aufgeloeste Profil traegt die Werte wirklich (dsh noetig)', (t) => {
  if (dshRoot() === null) {
    t.skip('dsh nicht im PATH — der echte Resolver ist nicht erreichbar');
    return;
  }
  const { targets } = profileTargets(PROFILE);
  const declared = targets.get('shinon-prompter');
  const bin = join(ROOT, 'node_modules/.bin/dsh');
  const command = existsSync(bin) ? bin : 'dsh';
  const dumped = execFileSync(process.execPath, [command, '--profile', PROFILE, '--dump-config'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: ROOT },
    maxBuffer: 32 * 1024 * 1024,
  });
  const block = dumped.slice(dumped.indexOf('# == @shinon/prompter'));
  const body = block.slice(0, block.indexOf('\n# =='));
  for (const key of ['mode', 'provider', 'model', 'skillsPath']) {
    assert.match(
      body,
      new RegExp(`^\\s*${key}:\\s*${String(declared[key]).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'm'),
      `das aufgeloeste Profil traegt ${key} nicht mit dem Wert aus dem Profil-Patch`,
    );
  }
  assert.doesNotMatch(body, /^\s*maxTokens:\s*1200\s*$/m, 'maxTokens steht auf dem Schema-Default statt auf dem Profilwert');
});
