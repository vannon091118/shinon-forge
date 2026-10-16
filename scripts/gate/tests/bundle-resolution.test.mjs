#!/usr/bin/env node
/**
 * scripts/gate/tests/bundle-resolution.test.mjs — der Ladepfad der Bündel.
 *
 * Warum diese Datei existiert: der Boot des aktiven Profils starb mit
 * `TypeError: Cannot read properties of undefined (reading 'validate')`. Der Grund
 * lag nicht im Paket, sondern in der AUFLÖSUNG: `profiles/shinon/node_modules/@shinon/traceability`
 * ist ein Link auf einen Prototyp AUSSERHALB dieses Repos
 * (`../../../../../Projekt Type/traceability-proto`). Node lädt für einen
 * Profil-Import zuerst `profiles/<name>/node_modules` — das Repo-Paket
 * `packages/traceability` wurde also nie geladen, sondorn beschattet. Der Prototyp
 * exportiert `Config = {}` (dokumentiert in seiner eigenen Zeile 78), Cordis liest
 * beim Mounten aber `Config['~standard'].validate` — und stirbt.
 *
 * Alle bisherigen Suiten waren grün, weil keine von ihnen den ECHTEN Ladepfad
 * ging: sie importierten `packages/<dir>/index.js` direkt (hook-pre-step,
 * prompter-contract, …) und sahen den Link nie. Ein frischer Klon hat umgekehrt
 * gar kein `profiles/<name>/node_modules` — deshalb war auch das Gate grün.
 *
 * Deshalb prüft diese Datei DREI Dinge am selben Gegenstand, und zwar in dieser
 * Reihenfolge der Härte:
 *
 *   1. STATIK (ohne node_modules, immer): `repo.bundleResolutionIssues()` ist
 *      leer. Die Regel ist EINE Quelle (`scripts/lib/repo.mjs`) und wird vom
 *      Gate-Plugin `bundle-resolution` und von `shinon doctor` gelesen — ein
 *      Befund nennt Quelle, aufgelöstes Ziel und Abhilfe.
 *   2. AUFLÖSUNG (braucht eine Installation, sonst sichtbarer Skip): jedes
 *      Bündel des aktiven Profils löst aus dem PROFILVERZEICHNIS
 *      (`createRequire(profiles/<name>/package.json)`) in `packages/` auf — die
 *      Auflösung, die ein echter `shinon`-Start nimmt.
 *   3. MOUNT (braucht Installation und Cordis, sonst sichtbarer Skip): das
 *      aufgelöste Modul wird mit GENAU der installierten Profil-Config
 *      (`profiles/shinon/cordis.patch.yml`, Eintrag `shinon-traceability`) durch
 *      echtes Cordis validiert und aktiviert; die Auslieferung über
 *      `webserver/index-inject` trägt danach `{enabled: true, maxVisible: 3,
 *      duration: 4000}`. Eine Config OHNE Schema (`Config = {}`) durch DENSELBEN
 *      Weg muss genau den belegten Fehler werfen — der Fix darf den Fehler nicht
 *      verstecken, er muss ihn im Prototyp belassen und hier nachweisen.
 *
 * Was diese Datei NICHT beweist: kein `dsh --profile shinon` über die CLI, kein
 * Browser, kein Modellaufruf. Sie beantwortet genau eine Frage: löst ein
 * Profil-Start jedes Bündel in DIESES Repo auf, und trägt es die Profilwerte?
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as repo from '../../lib/repo.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGES = join(ROOT, 'packages');
const PROFILE_NAME = repo.activeProfile();
const PROFILE_DIR = join(ROOT, 'profiles', PROFILE_NAME);

/** Die Naht, über die der Host die Zeilen aller Hälften einsammelt. */
const INDEX_INJECT = 'webserver/index-inject';
/** Der Vertragsname des Datensatzes (Besitzer: packages/traceability/index.js). */
const TOAST_CONTRACT = 'shinon.traceability/toast-v1';
const TRACE_GLOBAL = '__SHINON_TRACEABILITY_CONFIG__';
/** Das Bündel, an dem der Defekt gemessen wurde. */
const TRACEABILITY = '@shinon/traceability';

const rootRequire = createRequire(join(ROOT, 'package.json'));
/** Die Auflösung des ECHTEN Starts: aus dem Profilverzeichnis, nicht aus dem Repo-Root. */
const profileRequire = createRequire(join(PROFILE_DIR, 'package.json'));

/** Ein Modul aus dem Profil auflösen — `null`, wenn es nicht auflösbar ist. */
function fromProfile(name) {
  try {
    return realpathSync(profileRequire.resolve(name));
  } catch {
    return null;
  }
}

/** Die wirksame Profil-Config eines Patch-Eintrags (die ENTSCHEIDUNG, nicht der Default). */
function installedConfig(id) {
  const { patches, issues } = repo.parsePatchFile(join(PROFILE_DIR, 'cordis.patch.yml'));
  assert.deepEqual(issues, [], 'das Profil ist nicht lesbar');
  const entry = patches.find((patch) => patch.id === id);
  assert.ok(entry !== undefined, `das Profil hat keinen ${id}-Eintrag`);
  return entry;
}

/** Cordis-Ausgaben stumm schalten: das Mounten loggt, die Zusage nicht. */
async function quietly(run) {
  const { log, warn, error } = console;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
}

/**
 * Ein Bündel so mounten, wie der Host es tut: ein ECHTER Cordis-Context, das
 * Modul als Plugin-Objekt. Cordis validiert dabei `Config` (`resolveConfig` in
 * `@deepseek-ai/cordis/lib/index.js`) — genau die Zeile, an der der Prototyp
 * starb.
 */
function mount(cordis, plugin, config) {
  const root = new cordis.Context();
  return quietly(() => root.plugin(plugin, config)).then(() => root);
}

// ── 1. Statik: die Regel selbst (ohne Installation, immer) ──────────────────

test('die Bündel-Auflösung des aktiven Profils ist fehlerfrei', () => {
  const issues = repo.bundleResolutionIssues();
  assert.deepEqual(issues, [], issues.join('\n'));
});

// ── 2. Auflösung: der Weg, den ein echter Start nimmt ───────────────────────

const installed = existsSync(join(PROFILE_DIR, 'node_modules')) || existsSync(join(ROOT, 'node_modules'));
const skipResolution = installed
  ? false
  : `uebersprungen (Grund: nichts installiert — ${relative(ROOT, PROFILE_DIR)}/node_modules und node_modules/ fehlen)`;

test('jedes Profil-Bündel löst aus dem Profil nach packages/ auf', { skip: skipResolution }, () => {
  const profile = repo.resolveProfile(PROFILE_NAME, repo.discover());
  assert.deepEqual(profile.issues, [], 'das aktive Profil muss aufloesen');
  assert.ok(profile.entries.length >= 15, `nur ${profile.entries.length} lokale Bundles — der Scan greift ins Leere`);

  const packagesReal = realpathSync(PACKAGES);
  for (const entry of profile.entries) {
    const resolved = fromProfile(entry.name);
    assert.ok(resolved !== null, `${entry.name} löst aus ${relative(ROOT, PROFILE_DIR)} nicht auf`);
    assert.ok(
      resolved.startsWith(`${packagesReal}${sep}`),
      `${entry.name} → ${resolved} liegt ausserhalb von packages/ — eine fremde Quelle beschattet das Repo-Paket`,
    );
    assert.equal(
      realpathSync(dirname(resolved)),
      realpathSync(join(PACKAGES, entry.dir)),
      `${entry.name} zeigt nicht auf dieses Repo-Paket`,
    );
  }

  // Der belegte Fall separat: er ist der Grund, warum es diese Datei gibt.
  const traceability = fromProfile(TRACEABILITY);
  assert.ok(traceability !== null, '@shinon/traceability löst aus dem Profil nicht auf');
  assert.equal(
    realpathSync(dirname(traceability)),
    realpathSync(join(PACKAGES, 'traceability')),
    `@shinon/traceability → ${traceability} ist nicht das Repo-Paket (der externe Prototyp exportiert Config = {})`,
  );
});

// ── 3. Mount: die wirksame Config durch echtes Cordis ───────────────────────

let cordis = null;
let cordisReason = '';
try {
  cordis = await import(pathToFileURL(rootRequire.resolve('@deepseek-ai/cordis')).href);
} catch (error) {
  cordisReason = error.message;
}
const skipCordis = cordis === null ? `uebersprungen (Grund: @deepseek-ai/cordis nicht auflösbar — ${cordisReason})` : false;

test('das aufgelöste Bündel mountet am echten Cordis mit der installierten Profil-Config', { skip: skipCordis || skipResolution }, async () => {
  const entry = installedConfig('shinon-traceability');
  assert.deepEqual(
    entry.config,
    { enabled: true, maxVisible: 3, duration: 4000 },
    'die wirksamen Grenzen des Profils sind nicht die gemessenen',
  );

  const resolved = fromProfile(TRACEABILITY);
  assert.ok(resolved !== null, `${TRACEABILITY} löst aus dem Profil nicht auf`);
  const bundle = await import(pathToFileURL(resolved).href);

  const delivered = [];
  const root = await mount(cordis, { name: TRACEABILITY, Config: bundle.Config, apply: bundle.apply }, entry.config);
  root.emit(INDEX_INJECT, delivered);

  const row = delivered.find((candidate) => candidate.name === TRACE_GLOBAL);
  assert.ok(row !== undefined, `keine Auslieferung über ${INDEX_INJECT} — der Mount trug die Grenzen nicht`);
  assert.deepEqual(row.value, {
    contract: TOAST_CONTRACT,
    enabled: true,
    maxVisible: 3,
    duration: 4000,
  });
});

test('eine Config ohne Schema wirft am selben Weg (der belegte Fehler)', { skip: skipCordis }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'shinon-config-fixture-'));
  writeFileSync(join(work, 'index.js'), "export const Config = {};\nexport function apply() {}\n");
  try {
    const fixture = await import(pathToFileURL(join(work, 'index.js')).href);
    assert.deepEqual(
      Object.keys(fixture.Config),
      [],
      'die Fixture trägt genau die Form des externen Prototyps (Config = {})',
    );
    await assert.rejects(
      () => mount(cordis, { name: 'fixture', Config: fixture.Config, apply: fixture.apply }, { enabled: true }),
      /reading 'validate'/,
      'eine Config ohne Schema muss am echten Cordis sterben — sonst prüft der Mount oben etwas anderes',
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// ── 4. Refusals: fremde Quelle, fehlendes Ziel, Link nach aussen ────────────

/**
 * Ein Miniatur-Repo mit einem Profil: `packages/<dir>`, das Profil-Manifest und
 * — wahlweise — ein installierter Link. Damit lässt sich jede Verweigerung
 * einzeln zeigen, ohne den echten Baum anzufassen.
 */
function tempRepo({ spec = 'link:../../packages/traceability', link = null, target = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-bundle-resolution-'));
  const packages = join(root, 'packages');
  const profileDir = join(root, 'profiles', 'shinon');
  mkdirSync(join(packages, 'traceability'), { recursive: true });
  if (target) {
    writeFileSync(
      join(packages, 'traceability', 'package.json'),
      JSON.stringify({ name: '@shinon/traceability', version: '1.0.0', type: 'module' }),
    );
  }
  mkdirSync(profileDir, { recursive: true });
  const dependencies = spec === null ? {} : { '@shinon/traceability': spec };
  writeFileSync(
    join(profileDir, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-shinon', private: true, dependencies, dsh: { profile: { bundles: ['@shinon/traceability'] } } }),
  );
  if (link !== null) {
    const entry = join(profileDir, 'node_modules', '@shinon');
    mkdirSync(entry, { recursive: true });
    symlinkSync(link, join(entry, 'traceability'), 'dir');
  }
  const outside = join(root, 'draussen', 'traceability-proto');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'package.json'), JSON.stringify({ name: '@shinon/traceability' }));
  return {
    root,
    packages,
    profileDir,
    outside,
    issues: (options = {}) =>
      repo.bundleResolutionIssues(
        { name: '@shinon/forge' },
        { profileName: 'shinon', profilesDir: join(root, 'profiles'), packagesDir: packages, ...options },
      ),
  };
}

test('Refusals: eine fremde Quelle, ein fehlendes Ziel und ein Link nach aussen werden benannt', () => {
  // (a) Der deklarierte Pfad führt aus `packages/` heraus — der Fall des Prototyps.
  const outward = tempRepo({ spec: 'link:../../draussen/traceability-proto' });
  const outwardIssues = outward.issues();
  assert.equal(outwardIssues.length, 1, `erwartet: ein Befund, bekommen: ${JSON.stringify(outwardIssues)}`);
  assert.ok(outwardIssues[0].includes('profiles/shinon/package.json'), `die Quelle fehlt: ${outwardIssues[0]}`);
  assert.ok(outwardIssues[0].includes(outward.outside), `das aufgelöste Ziel fehlt: ${outwardIssues[0]}`);
  assert.ok(outwardIssues[0].includes('profile-links.mjs'), `die Abhilfe fehlt: ${outwardIssues[0]}`);

  // (b) Kein Eintrag in `dependencies`: die Herkunft ist unbekannt, nicht egal.
  const undeclared = tempRepo({ spec: null });
  const undeclaredIssues = undeclared.issues();
  assert.equal(undeclaredIssues.length, 1, JSON.stringify(undeclaredIssues));
  assert.ok(undeclaredIssues[0].includes('@shinon/traceability'), undeclaredIssues[0]);

  // (c) Das deklarierte Ziel fehlt im Repo.
  const missing = tempRepo({ target: false });
  const missingIssues = missing.issues();
  assert.equal(missingIssues.length, 1, JSON.stringify(missingIssues));
  assert.ok(missingIssues[0].includes(join(missing.packages, 'traceability')), missingIssues[0]);

  // (d) Der INSTALLIERTE Link führt aus `packages/` heraus — der belegte Defekt.
  const shadowed = tempRepo({ link: '../../../../draussen/traceability-proto' });
  const shadowedIssues = shadowed.issues();
  assert.equal(shadowedIssues.length, 1, JSON.stringify(shadowedIssues));
  const [shadowedIssue] = shadowedIssues;
  assert.ok(shadowedIssue.includes('profiles/shinon/node_modules/@shinon/traceability'), `die Quelle fehlt: ${shadowedIssue}`);
  assert.ok(shadowedIssue.includes(realpathSync(join(shadowed.root, 'draussen', 'traceability-proto'))), `das aufgelöste Ziel fehlt: ${shadowedIssue}`);
  assert.ok(shadowedIssue.includes('profile-links.mjs'), `die Abhilfe fehlt: ${shadowedIssue}`);

  // (e) Der richtige Link und „noch nichts installiert" sind beide grün.
  assert.deepEqual(tempRepo({ link: '../../../../packages/traceability' }).issues(), [], 'ein Link in packages/ ist grün');
  assert.deepEqual(tempRepo().issues(), [], 'nichts installiert ist kein Fehler (ein frischer Klon hat kein node_modules)');
});
