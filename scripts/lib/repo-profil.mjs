/**
 * repo-profil.mjs — Eigentümer: Profil- und Bundle-Auflösung.
 *
 * Aktives Profil, Bundle-Ziele, DSH-Instanz, Auflösung, Installation.
 */
import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGES_DIR, PROFILES_DIR, ROOT, isObject, read, readJSON, readRoot } from './repo-basis.mjs';
import { composeIssues, dependencyIssues, parsePatchFile } from './repo-pakete.mjs';

/** Profilname aus scripts.dev (die eine Quelle für das aktive Profil). */
export function activeProfile(root = readRoot()) {
  return (root.scripts?.dev ?? '').match(/--profile\s+(\S+)/)?.[1] ?? null;
}

/**
 * Das aktive Profil als echtes DSH-Profil auflösen.
 *
 * DSH-Definition, abgeleitet aus @deepseek-ai/dsh-app-boot (loadProfile /
 * loadProfileDirectory): ein Profil ist das Verzeichnis <DSH_HOME>/profiles/<name>
 * mit
 *   package.json         dsh.profile.bundles - die Bundle-Patch-Layer in Reihenfolge
 *   cordis.patch.yml     die User-Ebene (top-level YAML-Array von Patch-Einträgen)
 * (eine `pnpm-workspace.yaml` legt UPSTREAMs initProfile bei Bedarf selbst an, wenn ein
 * Profil `dsh plugin add` nutzt; dieses Repo trackt keine — Schritt 3.5/A1)
 * Bundles sind Pakete mit dsh.bundle.patch; das Repo-Root ist ein gültiges
 * DSH_HOME, weil es profiles/ enthält.
 *
 * `bundles` sind alle Bundle-Namen, `entries` nur die Bundles aus diesem Repo
 * (Scope-Pakete). Fremde Bundles wie @deepseek-ai/dsh-base stehen nur in `bundles`.
 */
/** Liegt `target` in `dir` (oder ist es `dir` selbst)? */
function isInside(dir, target) {
  return target === dir || target.startsWith(dir.endsWith(sep) ? dir : `${dir}${sep}`);
}

/**
 * Ist ein Bundle fremd — lebt es bewusst ausserhalb von `packages/`?
 *
 * Entscheidend ist nicht der NAME, sondern das ZIEL: das Profil-Manifest fuehrt
 * jedes Bundle als Abhaengigkeit. Ein `link:../../packages/<dir>` zeigt in dieses
 * Repo (lokal, muss existieren); ein Ziel ausserhalb `packages/` (absoluter Pfad
 * oder aus dem Repo heraus) ist ein fremdes Bundle — wie die `@deepseek-ai/*`-
 * Eintraege, die schon immer erlaubt waren.
 *
 * Kein Eintrag, kein `link:`/`file:`-Ziel → `null`: ein unbekannter `@shinon/*`-
 * Name ohne Ziel bleibt ein Fehler (Tippfehler-Schutz bleibt fail-closed).
 *
 * @param {string} name - Bundle-Name aus `dsh.profile.bundles`.
 * @param {object|null} manifest - das Profil-Manifest.
 * @param {string} profileDir - Verzeichnis des Profils (Bezug fuer relative Ziele).
 * @returns {string|null} das aufgeloeste Ziel, wenn es fremd ist, sonst `null`.
 */
export function foreignBundleTarget(name, manifest, profileDir) {
  const spec = manifest?.dependencies?.[name];
  if (typeof spec !== 'string') return null;
  const found = /^(?:link|file):(.+)$/.exec(spec);
  if (found === null) return null;
  const target = resolve(profileDir, found[1]);
  return isInside(PACKAGES_DIR, target) ? null : target;
}

/**
 * Der installierte Link eines Bündels im Profil — ohne zu werfen.
 *
 * Drei Fälle, die sich unterscheiden MÜSSEN, weil sie drei Auskünfte sind:
 *   `null`     nichts installiert (ein frischer Klon hat kein node_modules)
 *   `link`     ein Symlink; `target` ist sein aufgelöstes Ziel
 *   `broken`   ein Symlink ins Leere; `target` ist sein ROHTEXT (er zeigt irgendwohin)
 *   `real`     kein Symlink, sondern eine echte Kopie — sie folgt dem Manifest nicht
 *
 * @param {string} file - Pfad des erwarteten Eintrags.
 * @returns {{kind: 'link'|'broken'|'real', target: string}|null}
 */
function installedBundle(file) {
  let stats;
  try {
    stats = lstatSync(file);
  } catch {
    return null;
  }
  if (!stats.isSymbolicLink()) return { kind: stats.isDirectory() ? 'real' : 'file', target: file };
  try {
    return { kind: 'link', target: realpathSync(file) };
  } catch {
    return { kind: 'broken', target: readlinkSync(file) };
  }
}

/**
 * Jedes `@deepseek-ai/*`-Paket genau EINMAL im Baum — die Regel für Modul-Identität.
 *
 * Warum: `dsh-agent-loop` holt den Tool-Scheduler über ein MODULWEITES Symbol aus
 * `@deepseek-ai/dsh-tools` (`ctx.tools[TOOL_RUNTIME_SCHEDULER]`). Zwei Kopien sind
 * zwei Symbole; dann ist der Scheduler `undefined` und JEDER Tool-Call stirbt mit
 * `reading 'prepare'`, während alle statischen Gates grün bleiben (gemessen
 * 2026-10-18: zehn Kopien im Lock, `npm dedupe` macht daraus eine).
 */
export function dshInstanceIssues(base = ROOT, options = {}) {
  const scope = options.scope ?? '@deepseek-ai';
  const modules = options.modulesDir ?? join(base, 'node_modules');
  const show = (file) => {
    const rel = relative(base, file);
    return rel === '' || rel === '..' || rel.startsWith(`..${sep}`) ? file : rel;
  };
  if (!existsSync(modules)) return { issues: [], status: 'not-applicable', detail: 'kein node_modules — nichts installiert' };

  const found = new Map();
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      if (entry.name === 'node_modules') {
        walk(path, depth + 1);
        continue;
      }
      if (entry.name.startsWith('@')) {
        walk(path, depth + 1);
        continue;
      }
      if (dir.endsWith(scope)) {
        if (!found.has(entry.name)) found.set(entry.name, []);
        found.get(entry.name).push(path);
      }
      if (existsSync(join(path, 'node_modules'))) walk(join(path, 'node_modules'), depth + 1);
    }
  };
  walk(modules, 0);

  const duplicates = [...found.entries()].filter(([, paths]) => paths.length > 1);
  const issues = duplicates.map(
    ([name, paths]) =>
      `${scope}/${name} liegt ${paths.length}× im Baum (${paths.map(show).join(', ')}) — ` +
      'Abhilfe: npm dedupe (ein Modul, ein Symbol)',
  );
  return {
    issues,
    status: issues.length === 0 ? 'pass' : 'fail',
    detail: `${found.size} ${scope}-Pakete geprüft`,
  };
}

/**
 * Die Bündel-Auflösung des aktiven Profils — die EINE Regel für Gate und Doctor.
 *
 * Warum es diese Funktion gibt: ein `shinon`-Start löst jedes Bündel über
 * `profiles/<name>/node_modules` auf. Ein dort liegender Link, der aus `packages/`
 * herauszeigt, BESCHATTET das Repo-Paket — Node lädt dann fremden Code, ohne dass
 * irgendein Gate es merkt (gemessen 2026-10-17: `@shinon/traceability` zeigte auf
 * `../../../Projekt Type/traceability-proto`, dessen `Config = {}` den Boot mit
 * `... (reading 'validate')` abriss). Deshalb prüft diese Funktion die Naht, an der
 * die Beschattung entsteht, und nicht das Paket.
 *
 * Geprüft wird, was da ist. Ein FEHLENDER Eintrag ist kein Fehler — ein frischer
 * Klon hat kein `profiles/<name>/node_modules`, und DSH installiert ihn beim Start
 * aus dem Manifest. Ein vorhandener Eintrag dagegen muss dem Manifest folgen.
 *
 * @param {object} root - Root-Manifest (nur `name` wird gelesen: der Scope).
 * @param {{profileName?: string, profilesDir?: string, packagesDir?: string, base?: string}} [options]
 *   Übersteuerungen für Tests (Miniatur-Baum) und Doctor (fremde Wurzel).
 * @returns {string[]} Befunde; jeder nennt Quelle, aufgelöstes Ziel und Abhilfe.
 */
export function bundleResolutionIssues(root = readRoot(), options = {}) {
  const packagesDir = options.packagesDir ?? PACKAGES_DIR;
  const profilesDir = options.profilesDir ?? PROFILES_DIR;
  const base = options.base ?? dirname(packagesDir);
  const show = (file) => {
    const rel = relative(base, file);
    return rel === '' || rel === '..' || rel.startsWith(`..${sep}`) ? file : rel;
  };
  const remedy = 'Abhilfe: node scripts/profile-links.mjs (setzt die Links aus den deklarierten link:-Zielen neu)';

  const profileName = options.profileName ?? activeProfile(root);
  if (profileName === null) return ['kein --profile in scripts.dev — kein Profil zu prüfen'];
  const profileDir = join(profilesDir, profileName);
  const manifestFile = join(profileDir, 'package.json');
  if (!existsSync(manifestFile)) return [`${show(manifestFile)} fehlt — kein Profil zu prüfen`];

  let manifest;
  try {
    manifest = readJSON(manifestFile);
  } catch (error) {
    return [`${show(manifestFile)} ist kein gültiges JSON: ${error.message}`];
  }
  const bundles = manifest?.dsh?.profile?.bundles;
  if (!Array.isArray(bundles) || bundles.length === 0) {
    return [`${show(manifestFile)}: dsh.profile.bundles fehlt oder ist leer`];
  }

  const scope = String(root?.name ?? '').split('/')[0];
  const source = show(manifestFile);
  const issues = [];
  for (const bundle of bundles) {
    if (typeof bundle !== 'string' || !bundle.startsWith(`${scope}/`)) continue;
    const spec = manifest.dependencies?.[bundle];
    if (typeof spec !== 'string') {
      issues.push(`${bundle}: kein Eintrag in dependencies (Quelle: ${source}) — die Herkunft ist unbekannt; ${remedy}`);
      continue;
    }
    const declared = /^(?:link|file):(.+)$/.exec(spec);
    if (declared === null) {
      issues.push(`${bundle}: "${spec}" ist kein link:/file:-Ziel (Quelle: ${source}); ${remedy}`);
      continue;
    }
    const target = resolve(profileDir, declared[1]);
    if (!isInside(packagesDir, target)) {
      issues.push(
        `${bundle} → ${target} zeigt aus ${show(packagesDir)} heraus (Quelle: ${source}: "${spec}") — eine fremde Quelle statt des Repo-Pakets; ${remedy}`,
      );
      continue;
    }
    const targetManifest = join(target, 'package.json');
    if (!existsSync(targetManifest)) {
      issues.push(`${bundle} → ${target} fehlt (Quelle: ${source}: "${spec}"); ${remedy}`);
      continue;
    }
    let targetName = null;
    try {
      targetName = readJSON(targetManifest).name;
    } catch {
      targetName = null;
    }
    if (targetName !== bundle) {
      issues.push(
        `${bundle} → ${target} deklariert sich als "${targetName}" (Quelle: ${source}: "${spec}") — fremde Quelle unter erwartetem Pfad`,
      );
      continue;
    }

    const installed = join(profileDir, 'node_modules', ...bundle.split('/'));
    const entry = installedBundle(installed);
    if (entry === null) continue; // nichts installiert — kein Fehler
    if (entry.kind === 'broken') {
      issues.push(`${show(installed)} → ${entry.target} zeigt ins Leere (Quelle: ${source}: "${spec}"); ${remedy}`);
      continue;
    }
    if (entry.kind === 'real' || entry.kind === 'file') {
      issues.push(
        `${show(installed)} ist keine Verknüpfung, sondern eine ${entry.kind === 'file' ? 'Datei' : 'echte Kopie'} — sie folgt dem Manifest nicht (Quelle: ${source}); ${remedy}`,
      );
      continue;
    }
    if (!isInside(packagesDir, entry.target)) {
      issues.push(
        `${show(installed)} → ${entry.target} liegt ausserhalb von ${show(packagesDir)} und beschattet ${bundle} (Quelle: ${source}: "${spec}"); ${remedy}`,
      );
      continue;
    }
    if (entry.target !== realpathSync(target)) {
      issues.push(
        `${show(installed)} → ${entry.target} zeigt nicht auf ${realpathSync(target)} (Quelle: ${source}: "${spec}"); ${remedy}`,
      );
    }
  }
  return issues;
}

export function resolveProfile(profileName, packages, root = readRoot()) {
  const scope = root.name.split('/')[0];
  if (!profileName) {
    return { dir: null, manifest: null, overlay: [], bundles: [], entries: [], issues: ['kein --profile in scripts.dev'] };
  }

  const dir = join(PROFILES_DIR, profileName);      const empty = { dir, manifest: null, overlay: [], bundles: [], entries: [], foreign: [] };
  const manifestFile = join(dir, 'package.json');
  if (!existsSync(manifestFile)) return { ...empty, issues: [`${relative(ROOT, manifestFile)} fehlt`] };

  let manifest;
  try {
    manifest = readJSON(manifestFile);
  } catch (e) {
    return { ...empty, issues: [`${relative(ROOT, manifestFile)} ist kein gültiges JSON: ${e.message}`] };
  }

  const issues = [];
  for (const key of Object.keys(manifest.dsh ?? {})) if (key !== 'profile') issues.push(`unbekanntes Feld dsh.${key}`);
  const profileField = manifest.dsh?.profile;
  if (!isObject(profileField)) {
    issues.push('dsh.profile fehlt');
  } else {
    for (const key of Object.keys(profileField)) if (key !== 'bundles') issues.push(`unbekanntes Feld dsh.profile.${key}`);
  }

  const bundles = profileField?.bundles;
  if (!Array.isArray(bundles) || bundles.length === 0 || bundles.some((name) => typeof name !== 'string' || name === '')) {
    issues.push('dsh.profile.bundles muss eine nicht-leere Liste von Paketnamen sein');
    return { ...empty, manifest, issues };
  }

  const overlay = parsePatchFile(join(dir, 'cordis.patch.yml'));
  issues.push(...overlay.issues);
  const duplicates = [...new Set(bundles.filter((name, index) => bundles.indexOf(name) !== index))];
  if (duplicates.length) issues.push(`doppelte Bundles: ${duplicates.join(', ')}`);

  const entries = [];
  const foreign = [];
  for (const name of bundles) {
    if (!name.startsWith(`${scope}/`)) continue;
    const pkg = packages.find((candidate) => candidate.want.name === name);
    if (pkg) {
      entries.push({ id: pkg.want.id, name, dir: pkg.dir });
      continue;
    }
    // Kein lokales Paket: entweder ein Tippfehler ODER ein Bundle, das bewusst
    // ausserhalb dieses Repos liegt (die Profil-Abhangigkeit zeigt aus `packages/`
    // heraus). Nur der erste Fall ist ein Fehler; der zweite ist fremd wie
    // @deepseek-ai/dsh-base, wird sichtbar gemeldet und verlangt kein lokales
    // Paket. Ohne Abhangigkeits-Eintrag bleibt es fail-closed ein Fehler.
    const target = foreignBundleTarget(name, manifest, dir);
    if (target !== null) {
      foreign.push({ name, target });
      continue;
    }
    issues.push(`${name} → packages/${name.slice(scope.length + 1)} fehlt`);
  }
  if (entries.length === 0) issues.push('kein Paket-Bundle im Profil');

  return { dir, manifest, overlay: overlay.patches, bundles, entries, foreign, issues };
}

/**
 * Der Cordis-Config-Vertrag: `Config` muss ein Schemastery-Schema sein, nicht
 * nur ein Objekt. Geprüft wird die EIGENSCHAFT, die Cordis liest —
 * `~standard.validate` als Funktion — am geladenen Modul, nicht am Quelltext.
 *
 * Genau diese Prüfung hätte den Fremd-Link vom 2026-10-17 abgefangen: dessen
 * `Config = {}` fiel erst im Boot als `reading 'validate'` auf. Ohne
 * installiertes Schemastery ist die Prüfung nicht durchführbar und meldet das
 * (fail-closed) — ein stiller Skip wäre die Lücke wieder.
 * @returns {Promise<string[]>} Befunde (leer = alle Configs sind Schemata).
 */
export async function configShapeIssues(packages) {
  const issues = [];
  for (const pkg of packages) {
    const file = join(pkg.base, 'index.js');
    if (!existsSync(file) || !/export const Config\b/.test(read(file))) continue;
    let module;
    try {
      module = await import(pathToFileURL(file).href);
    } catch (error) {
      issues.push(`${pkg.dir}: index.js nicht ladbar (${error.code ?? error.message})`);
      continue;
    }
    if (typeof module?.Config?.['~standard']?.validate !== 'function') {
      issues.push(`${pkg.dir}: Config ist kein Schemastery-Schema (~standard.validate fehlt)`);
    }
  }
  return issues;
}

/**
 * Die INSTALLIERTE Profil-Ebene prüfen — die Naht, an der eine Beschattung
 * entsteht, bevor irgendein Paketcode läuft.
 *
 * Zwei Befunde, beide gemessen bzw. benannt:
 *   1. Ein `profiles/<name>/node_modules/@shinon/<pkg>`-Eintrag, dessen
 *      `realpath` NICHT unter `<root>/packages/` liegt, beschattet das Repo-Paket.
 *      Gemessen am 2026-10-17 zeigte `@shinon/traceability` auf einen externen
 *      Prototyp; der Boot starb an `Config = {}` mit `reading 'validate'`. Ein
 *      toter Link wird ebenfalls gemeldet, nicht still übersprungen.
 *   2. pnpm-Reste (`.pnpm`, `.modules.yaml`, `.pnpm-workspace-state-v1.json`)
 *      unter `profiles/<name>/node_modules`: dieses Repo installiert mit npm; ein
 *      `dsh plugin add` (Upstream) darf sie anlegen, wir committen sie nie.
 *
 * Ein FEHLENDES `node_modules` ist kein Befund — ein frischer Klon hat keins.
 * @returns {string[]} Befunde (leer = die installierte Ebene ist sauber).
 */
export function profileInstallIssues(root = ROOT, options = {}) {
  const packagesDir = options.packagesDir ?? join(ROOT, 'packages');
  const profilesDir = options.profilesDir ?? join(ROOT, 'profiles');
  if (!existsSync(profilesDir)) return [];
  const scope = String(root?.name ?? readRoot().name).split('/')[0];
  const base = options.base ?? dirname(packagesDir);
  const issues = [];
  const label = (path) => relative(base, path);

  for (const profile of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!profile.isDirectory()) continue;
    const modules = join(profilesDir, profile.name, 'node_modules');
    if (!existsSync(modules)) continue;
    for (const remnant of ['.pnpm', '.modules.yaml', '.pnpm-workspace-state-v1.json']) {
      if (existsSync(join(modules, remnant))) {
        issues.push(`${label(join(modules, remnant))}: pnpm-Rest — dieses Repo installiert mit npm`);
      }
    }
    const scopeDir = join(modules, scope);
    if (!existsSync(scopeDir)) continue;
    for (const entry of readdirSync(scopeDir)) {
      const file = join(scopeDir, entry);
      let real;
      try {
        real = realpathSync(file);
      } catch {
        issues.push(`${label(file)}: toter Link (${readlinkSync(file)})`);
        continue;
      }
      if (!isInside(packagesDir, real)) {
        issues.push(`${label(file)}: zeigt aus packages/ heraus (${real}) — Abhilfe: npm run profile:links`);
      }
    }
  }
  return issues;
}

/** Repository-weite Regeln (Paketgraph + Komposition) plus das aktive Profil. */
export function repoIssues(packages, root = readRoot()) {
  const profileName = activeProfile(root);
  const profile = resolveProfile(profileName, packages, root);
  return {
    profileName,
    profile,
    issues: [...dependencyIssues(packages, root.name.split('/')[0]), ...composeIssues(profileName, profile, packages)],
  };
}
