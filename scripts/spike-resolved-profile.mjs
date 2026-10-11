#!/usr/bin/env node
/**
 * spike-resolved-profile.mjs — Spike zu PLAN.md Schritt 3.3 (D3).
 *
 * Frage: bootet das Produkt mit einem Profil, das **nicht** unter
 * `$DSH_HOME/profiles/<name>` liegt? Die Antwort ist die Vorbedingung dafür,
 * dass `profiles/` überhaupt aus dem Repo verschwinden kann (Schritt 3.6).
 *
 * Der Weg des Spikes ist ausdrücklich nicht der benannte Profilweg:
 *
 *   benannt   `runProfile({ profile: '<name>' })`  → `loadProfile(name, …, home)`
 *             → `resolveProfileDir(name, $DSH_HOME)` = `$DSH_HOME/profiles/<name>`
 *   Spike     `loadProfileDirectory(dir, installAnchor)` — Upstreams eigener
 *             Weg für „application-owned profiles whose package project and
 *             lifecycle belong to that application“ — plus
 *             `runProfile({ resolvedProfile: { profile, installAnchor } })`.
 *
 * Was der Spike beweist (jede Zusage ist am Ende eine Behauptung, die beim
 * kleinsten Zweifel rot wird — fail-closed, Exit 2):
 *
 *   1. Die Bündel-Liste kommt aus CODE (BUNDLES unten), nicht aus einer Datei
 *      unter `profiles/`. Der Spike schreibt das Profil-Verzeichnis selbst.
 *   2. `profile.dir` liegt NICHT unter `<Repo>/profiles/` und nicht unter
 *      `$DSH_HOME/profiles/` — beides wird vorher geprüft, nicht gehofft.
 *   3. Alle Bündel lösen auf (`layers`), keines wird übersprungen
 *      (`skippedBundles` leer).
 *   4. Die Bündel MOUNTEN wirklich: jede Client-freie Host-Hälfte schreibt beim
 *      `apply()` genau eine Zeile. Der Spike fängt sie ab, statt sie nur
 *      durchlaufen zu lassen — `[shinon-events]` liest dabei zusätzlich seine
 *      FASSUNG aus dem Profil-Patch und sein `assets/`-Dokument aus dem Paket,
 *      also die ganze Kette Config → Plugin → Asset.
 *   5. Der Lauf bleibt schlüsselfrei: kein Wert einer Umgebungsvariable, deren
 *      NAME nach Geheimnis klingt (KEY/TOKEN/SECRET/PASSWORD), darf in der
 *      Ausgabe vorkommen. Der Snapshot ist leer — es gibt nichts zu leaken.
 *   6. Der Abbau läuft (`shutdown`) und der Baum ist vorher aktiv
 *      (`ctx.fiber.state === 2`, `loader` vorhanden).
 *
 * Was der Spike NICHT beweist: keinen Modellaufruf, keinen Browser, kein
 * `dsh --profile` über die CLI, und keine der drei UI-Hälften der Bündel (die
 * laufen im Client). Er beantwortet genau eine Frage: trägt der Bootpfad ein
 * Profil aus dem eigenen Verzeichnis?
 *
 * Aufruf:  node scripts/spike-resolved-profile.mjs [--dir <pfad>]
 * Exit:    0 = belegt · 2 = widerlegt (eine Zusage ist rot) · 3 = Aufbau
 *          gescheitert (Bündel nicht auflösbar, Node zu alt, kein dsh)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { format } from 'node:util';
import { ROOT, dshRoot } from './lib/dsh.mjs';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import { loadProfileDirectory, resolveProfileDir } from '@deepseek-ai/dsh-app-boot';
import { runProfile } from '@deepseek-ai/dsh/profile-boot';

const BIN = 'shinon-forge';
const PROFILE_NAME = 'product';

/**
 * Das Profil — HIER, im Code, nicht in `profiles/<name>/package.json`.
 *
 * Drei Bündel, gewählt nach einer harten Eigenschaft: ihre Host-Hälften
 * brauchen keinen Dienst, rufen kein Modell, starten keinen Server und
 * schreiben nichts. `better-errors` und `token-usage` registrieren nur und
 * loggen; `events` lädt seinen Vertrag aus `assets/` und emittiert — hier
 * niemandes Ereignis. Wer diese Liste erweitert, prüft dieselben vier
 * Eigenschaften neu: der Spike darf keinen fremden Boot und keine Sitzung
 * anfassen.
 */
const BUNDLES = ['@shinon/better-errors', '@shinon/token-usage', '@shinon/events'];

/** Je Bündel die Zeile, die seinen Mount beweist (aus dem `apply()` des Pakets). */
const MARKS = [
  { bundle: '@shinon/better-errors', mark: '[shinon-better-errors] Aktiviert:' },
  { bundle: '@shinon/token-usage', mark: '[shinon-token-usage] Aktiviert:' },
  { bundle: '@shinon/events', mark: 'Signale + Carrier gebunden' },
];

/** Geheimnis-verdächtige Variablennamen — WERTE werden nie gedruckt, nur geprüft. */
const SECRET_NAME = /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i;

/** Profilverzeichnis des Spikes: im Repo (sonst lösen `@shinon/*` nicht auf), aber nicht unter `profiles/`. */
const dirIndex = process.argv.indexOf('--dir');
const PROFILE_DIR = dirIndex === -1 ? join(ROOT, 'dist', '.spike-3-3') : process.argv[dirIndex + 1];

/** Alle Ausgaben mitschneiden: die Zusagen werden am ECHTEN Log geprüft, nicht an einer Annahme. */
const captured = [];
for (const method of ['log', 'warn', 'error', 'info']) {
  const real = console[method].bind(console);
  console[method] = (...args) => {
    captured.push(format(...args));
    real(...args);
  };
}
const said = (needle) => captured.some((line) => line.includes(needle));

// ── Aufbau ──────────────────────────────────────────────────────────────────

const nodeMajor = Number((process.versions.node ?? '0').split('.')[0]);
if (nodeMajor < 22) {
  console.error(`💥 spike: Node ${process.versions.node} ist zu alt (verlangt: ≥ 22, ` +
    '`node:sqlite` und `parseEnv` sterben sonst schon beim Import)');
  process.exit(3);
}

const appRoot = dshRoot();
if (appRoot === null) {
  console.error('💥 spike: kein dsh-Installat gefunden (Repo-node_modules, Vendor, PATH)');
  process.exit(3);
}
const installAnchor = join(appRoot, 'package.json');
if (!existsSync(installAnchor)) {
  console.error(`💥 spike: kein installAnchor unter ${installAnchor}`);
  process.exit(3);
}

// Die Bedingung, die der Spike überhaupt erst prüfen soll: NICHT der benannte Weg.
const namedPath = resolveProfileDir(PROFILE_NAME, process.env.DSH_HOME ?? ROOT);
const underProfiles = (path) => !relative(join(ROOT, 'profiles'), path).startsWith('..');
if (underProfiles(PROFILE_DIR)) {
  console.error(`💥 spike: ${PROFILE_DIR} liegt unter profiles/ — genau das soll der Spike vermeiden`);
  process.exit(3);
}

mkdirSync(PROFILE_DIR, { recursive: true });
writeFileSync(join(PROFILE_DIR, 'package.json'), `${JSON.stringify(
  { name: `${BIN}-product-profile`, private: true, dsh: { profile: { bundles: [...BUNDLES] } } },
  null,
  2,
)}\n`);
// Der Profil-Root ist leer: die ganze Komposition sind Patch-Ebenen. Die Datei
// existiert, weil der Loader einen echten Include-Root braucht; `runProfile`
// schreibt sie beim Start ohnehin neu.
writeFileSync(join(PROFILE_DIR, 'cordis.yml'), '# Spike 3.3 — leerer Wurzeleintrag; die Komposition sind Patch-Ebenen.\n[]\n');
// Eigene Nutzer-Ebene: im Spike leer. Sie ist der Ort, an dem später die
// wirksamen Werte aus `profiles/shinon/cordis.patch.yml` landen (Schritt 3.6).
writeFileSync(join(PROFILE_DIR, 'cordis.patch.yml'),
  '# Spike 3.3 — eigene Nutzer-Ebene, bewusst leer (wirksame Werte folgen in 3.6).\n[]\n');

console.log('─'.repeat(78));
console.log(`Spike 3.3 — Produktprofil ohne $DSH_HOME/profiles/${PROFILE_NAME}`);
console.log('─'.repeat(78));
console.log(`  Node:            ${process.versions.node}`);
console.log(`  Repo:            ${ROOT}`);
console.log(`  dsh-Installat:   ${appRoot}`);
console.log(`  installAnchor:   ${installAnchor}`);
console.log(`  DSH_HOME:        ${process.env.DSH_HOME ?? '(nicht gesetzt)'}`);
console.log(`  Profil (Spike):  ${PROFILE_DIR}   ← ${existsSync(namedPath) ? 'existiert' : 'existiert NICHT'}`);
console.log(`  benannter Weg:   ${namedPath}   ← würde der Spike hier booten, wäre es kein Spike`);
console.log(`  Bündel:          ${BUNDLES.length} (${BUNDLES.join(', ')})`);
console.log('');

const profile = loadProfileDirectory(BIN, PROFILE_DIR, installAnchor, { userLayer: true });

console.log('  Profil geladen (loadProfileDirectory):');
console.log(`    name:      ${profile.name}`);
console.log(`    dir:       ${profile.dir}`);
console.log(`    patchPath: ${profile.patchPath} (eigene Ebene: ${profile.patches.length} Einträge)`);
console.log(`    skipped:   ${profile.skippedBundles.length}`);
for (const layer of profile.layers) {
  console.log(`    ✓ ${layer.packageName}`);
  console.log(`        dir:     ${layer.packageDir}`);
  console.log(`        patches: ${layer.patchPaths.map((p) => relative(ROOT, p)).join(', ')} (${layer.patches.length} Einträge)`);
}
for (const skipped of profile.skippedBundles) {
  console.log(`    ✗ ${skipped.packageName}: ${skipped.reason}`);
}
console.log('');

// ── Boot ────────────────────────────────────────────────────────────────────

const environment = createLaunchEnvironmentSnapshot([]); // leer: es gibt keinen Umgebungswert, der leaken könnte
const booted = await runProfile({
  environment,
  profile: PROFILE_NAME,
  resolvedProfile: { profile, installAnchor },
  patchFiles: [],
  args: [`--spike-3-3`],
});
const { ctx, shutdown } = booted;
const profileContext = ctx.profileContext;

console.log('');
console.log('  Baum gebootet:');
console.log(`    fiber.state:        ${ctx.fiber.state} (2 = aktiv)`);
console.log(`    loader vorhanden:   ${ctx.get('loader') !== undefined}`);
console.log(`    profileContext.dir: ${profileContext?.dir}`);
console.log(`    profileContext.name:${profileContext?.name}`);
console.log(`    startedBundles:     ${profileContext?.startedBundles?.join(', ')}`);
console.log(`    installAnchor:      ${profileContext?.installAnchor}`);
console.log('');

// ── Zusagen prüfen (fail-closed) ─────────────────────────────────────────────

const claims = [
  ['Profil-Verzeichnis ist nicht der benannte Weg', PROFILE_DIR !== namedPath],
  ['Profil-Verzeichnis liegt nicht unter profiles/', !underProfiles(PROFILE_DIR)],
  ['alle Bündel gelöst, keines übersprungen',
    profile.layers.length === BUNDLES.length && profile.skippedBundles.length === 0],
  ['Baum ist aktiv und hat einen Loader', ctx.fiber.state === 2 && ctx.get('loader') !== undefined],
  ['der Boot nutzte genau diesen installAnchor', profileContext?.installAnchor === installAnchor],
  ['der Boot nutzte das Spike-Verzeichnis', profileContext?.dir === PROFILE_DIR],
  ['kein Bündel blieb beim Start ungenannt',
    BUNDLES.every((name) => profileContext?.startedBundles?.includes(name) === true)],
  ...MARKS.map(({ bundle, mark }) => [`${bundle} hat sich beim Mounten gemeldet`, said(mark)]),
  ['die Ausgabe trägt keinen Wert einer geheimnis-verdächtigen Variablen',
    Object.entries(process.env)
      .filter(([name, value]) => SECRET_NAME.test(name) && typeof value === 'string' && value.length >= 8)
      .every(([, value]) => !captured.some((line) => line.includes(value)))],
];

console.log('  Zusagen:');
let failed = 0;
for (const [claim, ok] of claims) {
  if (!ok) failed += 1;
  console.log(`    ${ok ? '✅' : '❌'} ${claim}`);
}
console.log('');
console.log(failed === 0
  ? `✅ Spike belegt: das Profil aus ${relative(ROOT, PROFILE_DIR)} bootet ohne profiles/${PROFILE_NAME}.`
  : `❌ Spike widerlegt: ${failed} von ${claims.length} Zusagen sind rot.`);

await shutdown.shutdown(failed === 0 ? 0 : 2);
// `shutdown` beendet den Prozess selbst; diese Zeile greift nur, wenn er es nicht tut.
process.exit(failed === 0 ? 0 : 2);
