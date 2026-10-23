/**
 * repo-pakete.mjs — Eigentümer: Paket-Entdeckung und Paket-Prüfung.
 *
 * Loader-Patch lesen, Manifest-/Vertrags-/Patch-/Index-/Client-Regeln,
 * Ressourcen, Artefakt, Paketgraph und Profil-Komposition.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { PACKAGES_DIR, ROOT, RUNTIME_FILES, SHARED_DEPS, isObject, read, readJSON, readYaml, readRoot } from './repo-basis.mjs';

/**
 * Teilschema der DSH-Loader-Patch-Dateien (`@deepseek-ai/cordis-plugin-include`
 * `PatchOptions`), abgeleitet aus `@deepseek-ai/dsh-app-boot` und dem Schema von
 * `dsh --profile <name> --dump-config-schema`. Unbekannte Felder lehnt DSH nicht
 * ab, wir schon: ein Tippfehler würde sonst still ignoriert.
 */
const PATCH_KEYS = ['id', 'name', 'config', 'group', 'disabled', 'inject', 'intercept', 'isolate', 'insert'];
const ENTRY_KEYS = ['id', 'name', 'config', 'group', 'disabled', 'inject', 'intercept', 'isolate'];
/**
 * Manifest-Felder unter `dsh`, die dieses Repo liest: `bundle`/`client` liest DSH
 * selbst, `inactive` nur das Gate (`dead-package`) — ein Paket erklärt damit im
 * eigenen Manifest, dass es bewusst noch nicht im Profil steht, statt dass eine
 * zentrale Liste im Gate jedes neue Paket nachgetragen braucht.
 */
const MANIFEST_DSH_KEYS = ['bundle', 'client', 'inactive'];

/** Erste Abweichung zwischen zwei Namen (leer, wenn gleich). */
const nameIssue = (label, actual, want) => (actual === want ? null : `${label} "${actual}" ≠ "${want}"`);

export function expected(dir, root = readRoot()) {
  const scope = root.name.split('/')[0];
  return { name: `${scope}/${dir}`, id: `${scope.slice(1)}-${dir}` };
}

export function discover(root = readRoot()) {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
    .map((dir) => {
      const base = join(PACKAGES_DIR, dir);
      const manifestPath = join(base, 'package.json');
      return {
        dir,
        base,
        manifestPath,
        manifest: existsSync(manifestPath) ? readJSON(manifestPath) : null,
        patch: parsePatchFile(join(base, 'cordis.patch.yml')),
        want: expected(dir, root),
      };
    });
}
/**
 * Eine Patch-Datei lesen und gegen das Loader-Schema prüfen.
 * @returns {{ patches: object[], issues: string[] }}
 */
export function parsePatchFile(file) {
  if (!existsSync(file)) return { patches: [], issues: [`${relative(ROOT, file)} fehlt`] };

  let document;
  try {
    document = readYaml(file);
  } catch (e) {
    return { patches: [], issues: [`kein gültiges YAML: ${e.reason ?? e.message}`] };
  }
  if (!Array.isArray(document)) return { patches: [], issues: ['top-level muss ein YAML-Array von Patch-Einträgen sein'] };

  const issues = [];
  document.forEach((patch, index) => {
    const at = `Eintrag ${index + 1}`;
    if (!isObject(patch)) {
      issues.push(`${at}: muss ein Mapping sein`);
      return;
    }
    const unknown = Object.keys(patch).filter((key) => !PATCH_KEYS.includes(key));
    if (unknown.length) issues.push(`${at}: unbekannte Felder ${unknown.join(', ')}`);
    if (patch.name !== undefined && typeof patch.name !== 'string') issues.push(`${at}: name muss ein String sein`);
    if (patch.disabled !== undefined && typeof patch.disabled !== 'boolean') issues.push(`${at}: disabled muss ein Boolean sein`);
    if (patch.id !== undefined && typeof patch.id !== 'string') issues.push(`${at}: id muss ein String sein`);
    if (patch.id === undefined && patch.insert === undefined) issues.push(`${at}: braucht id (Ziel) oder insert (Liste)`);
    if (patch.insert === undefined) return;
    if (!Array.isArray(patch.insert)) {
      issues.push(`${at}: insert muss eine Liste sein`);
      return;
    }
    patch.insert.forEach((entry, position) => {
      const row = `${at} insert[${position + 1}]`;
      if (!isObject(entry)) {
        issues.push(`${row}: muss ein Mapping sein`);
        return;
      }
      const stray = Object.keys(entry).filter((key) => !ENTRY_KEYS.includes(key));
      if (stray.length) issues.push(`${row}: unbekannte Felder ${stray.join(', ')}`);
      for (const key of ['id', 'name']) {
        if (typeof entry[key] !== 'string' || entry[key] === '') issues.push(`${row}: ${key} fehlt oder ist kein String`);
      }
    });
  });
  return { patches: document.filter(isObject), issues };
}

export function syntaxIssues(file) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    return [];
  } catch (e) {
    return [`Syntaxfehler: ${String(e.stderr).split('\n').find(Boolean) ?? 'unbekannt'}`];
  }
}

export function manifestIssues(pkg) {
  if (!pkg.manifest) return ['package.json fehlt'];
  const issues = [];
  const exports = pkg.manifest.exports ?? {};
  const wants = { '.': './index.js', './client': './client.js', './cordis.patch.yml': './cordis.patch.yml' };
  for (const [key, want] of Object.entries(wants)) {
    const issue = nameIssue(`exports["${key}"]`, exports[key], want);
    if (issue) issues.push(issue);
  }
  if (pkg.manifest.dsh?.bundle?.patch !== './cordis.patch.yml') issues.push('dsh.bundle.patch ≠ ./cordis.patch.yml');
  if (pkg.manifest.dsh?.client?.platform !== 'web') issues.push('dsh.client.platform ≠ web');
  for (const key of Object.keys(pkg.manifest.dsh ?? {})) {
    if (!MANIFEST_DSH_KEYS.includes(key)) issues.push(`unbekanntes Feld dsh.${key}`);
  }
  for (const dep of SHARED_DEPS) {
    if (!pkg.manifest.peerDependencies?.[dep]) issues.push(`peerDependencies["${dep}"] fehlt (host-shared)`);
    if (!pkg.manifest.devDependencies?.[dep]) issues.push(`devDependencies["${dep}"] fehlt (host-shared)`);
  }
  return issues;
}

export function contractIssues(pkg) {
  const issues = [];
  if (pkg.manifest?.name !== pkg.want.name) issues.push(`package.json name "${pkg.manifest?.name}" ≠ "${pkg.want.name}"`);

  const entry = pkg.patch?.patches?.[0]?.insert?.[0];
  if (!isObject(entry)) {
    issues.push('kein insert-Eintrag im Patch');
  } else {
    for (const [label, value, want] of [['Patch-id', entry.id, pkg.want.id], ['Patch-name', entry.name, pkg.want.name]]) {
      // Formatfehler (fehlend/falscher Typ) meldet patchIssues.
      if (typeof value !== 'string') continue;
      const issue = nameIssue(label, value, want);
      if (issue) issues.push(issue);
    }
  }

  const clientFile = join(pkg.base, 'client.js');
  if (!existsSync(clientFile)) {
    issues.push('client.js fehlt');
  } else {
    const loaderId = read(clientFile).match(/__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/)?.[1];
    const issue = nameIssue('ModuleLoader-id', loaderId, pkg.want.name);
    if (issue) issues.push(issue);
  }
  return issues;
}

export function patchIssues(pkg) {
  const issues = [...(pkg.patch?.issues ?? [])];
  if (issues.length) return issues;
  const patches = pkg.patch.patches;
  if (patches.length !== 1) return [`${patches.length} Patch-Einträge statt 1`];
  if (!Array.isArray(patches[0].insert) || patches[0].insert.length !== 1) return ['genau ein insert-Eintrag erwartet'];
  return [];
}

export function indexIssues(pkg) {
  const file = join(pkg.base, 'index.js');
  if (!existsSync(file)) return ['index.js fehlt'];
  const issues = syntaxIssues(file);
  const content = read(file);
  if (!content.includes('@deepseek-ai/schemastery')) issues.push('Schemastery-Import fehlt');
  if (!content.includes('export const Config')) issues.push('Config-Export fehlt');
  if (!content.includes('export function apply')) issues.push('apply() fehlt');
  return issues;
}

export function clientIssues(pkg) {
  const file = join(pkg.base, 'client.js');
  if (!existsSync(file)) return ['client.js fehlt'];
  const issues = syntaxIssues(file);
  if (!read(file).includes('__ModuleLoader__')) issues.push('ModuleLoader fehlt');
  return issues;
}

/**
 * Ressourcen-Referenzen eines Pakets: Manifest-Pfadfelder (immer pflichtig) und
 * Patch-Config-Werte, die als relativer Pfad geschrieben sind (`./…`, `../…`).
 */
export function resourceRefs(pkg) {
  const refs = [];
  const addRelative = (value, kind) => {
    if (typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'))) refs.push({ value, kind });
  };
  if (!pkg.manifest) return refs;
  for (const [key, target] of Object.entries(pkg.manifest.exports ?? {})) addRelative(target, `exports["${key}"]`);
  addRelative(pkg.manifest.dsh?.bundle?.patch, 'dsh.bundle.patch');
  addRelative(pkg.manifest.icon, 'icon');

  for (const patch of pkg.patch?.patches ?? []) {
    for (const [key, value] of Object.entries(patch.config ?? {})) addRelative(value, `config.${key}`);
    for (const entry of patch.insert ?? []) {
      for (const [key, value] of Object.entries(entry.config ?? {})) addRelative(value, `config.${key}`);
    }
  }
  return refs;
}

/** Jede Referenz muss existieren, eine Datei sein, im Paket liegen und parsen. */
export function resourceIssues(pkg) {
  const issues = [];
  for (const { value, kind } of resourceRefs(pkg)) {
    const path = resolve(pkg.base, value);
    if (path !== pkg.base && !path.startsWith(pkg.base + sep)) {
      issues.push(`${kind} "${value}" zeigt aus dem Paket heraus`);
    } else if (!existsSync(path)) {
      issues.push(`${kind} "${value}" fehlt`);
    } else if (!statSync(path).isFile()) {
      issues.push(`${kind} "${value}" ist keine Datei`);
    } else if (/\.(ya?ml|json)$/i.test(path)) {
      try {
        const document = readYaml(path);
        if (document === undefined || document === null) issues.push(`${kind} "${value}" ist leer`);
      } catch (e) {
        issues.push(`${kind} "${value}" parst nicht: ${e.reason ?? e.message}`);
      }
    }
  }
  return issues;
}

/** Dateien, die das Artefakt des Pakets enthalten muss: Runtime-Dateien + Ressourcen. */
/**
 * Was NICHT ins Artefakt (dist/) geht: die Quellteile eines generierten
 * Bundles. `assets/` wird als Ganzes kopiert, weil es Runtime-Helfer traegt —
 * `assets/client/` traegt aber Quelltext, den `client.js` bereits enthaelt.
 * Er gehoert ins Repo (dort wird er geprueft) und nicht in die Auslieferung.
 */
export const ARTIFACT_SKIP = ['assets/client'];

/**
 * Die Artefaktdateien eines Pakets nach `dest` kopieren — dieselbe Liste wie
 * `artifactFiles()`, ohne die Quellteile. EINE Kopierregel fuer Build und
 * jeden, der sie sonst braucht: zwei Kopierschleifen waeren der naechste Ort,
 * an dem ein Ordner in `dist/` landet, den niemand ausliefern will.
 */
export function copyArtifacts(pkg, dest) {
  const skip = (abs) => {
    const rel = relative(pkg.base, abs).split(sep).join('/');
    return ARTIFACT_SKIP.some((sub) => rel === sub || rel.startsWith(sub + '/'));
  };
  for (const file of artifactFiles(pkg)) {
    const src = join(pkg.base, file);
    if (!existsSync(src)) continue;
    cpSync(src, join(dest, file), { recursive: true, filter: (from) => !skip(from) });
  }
}

export function artifactFiles(pkg) {
  const extra = resourceRefs(pkg)
    .map(({ value }) => value.replace(/^\.\//, ''))
    .filter((rel) => !RUNTIME_FILES.some((file) => rel === file || rel.startsWith(`${file}/`)));
  return [...RUNTIME_FILES, ...new Set(extra)];
}

/** Paketgraph: @shinon/*-Kanten aus dependencies/peerDependencies, unbekannte Ziele und Zyklen. */
export function dependencyIssues(packages, scope = readRoot().name.split('/')[0]) {
  const issues = [];
  const known = new Set(packages.map((pkg) => pkg.want.name));
  const edges = new Map();
  for (const pkg of packages) {
    const targets = new Set();
    for (const field of ['dependencies', 'peerDependencies']) {
      for (const name of Object.keys(pkg.manifest?.[field] ?? {})) {
        if (!name.startsWith(`${scope}/`)) continue;
        if (!known.has(name)) { issues.push(`${pkg.dir}: ${field}["${name}"] → kein Paket unter packages/`); continue; }
        // Nur der importfreie Host-Seam ist eine erlaubte Kante; jede andere wäre eine zweite Wahrheit.
        if (name !== `${scope}/seams`) issues.push(`${pkg.dir}: ${field}["${name}"] → Pakete referenzieren einander nicht (Ausnahme: ${scope}/seams)`);
        targets.add(name);
      }
    }
    edges.set(pkg.want.name, [...targets]);
  }

  const state = new Map();
  const path = [];
  const walk = (name) => {
    state.set(name, 'offen');
    path.push(name);
    for (const next of edges.get(name) ?? []) {
      if (state.get(next) === 'offen' && !issues.some((issue) => issue.startsWith('Zyklus'))) {
        issues.push(`Zyklus im Paketgraph: ${[...path.slice(path.indexOf(next)), next].join(' → ')}`);
      } else if (!state.has(next)) walk(next);
    }
    path.pop();
    state.set(name, 'fertig');
  };
  for (const name of edges.keys()) if (!state.has(name)) walk(name);
  return issues;
}

/** Doppelte insert-ids über alle Layer der Komposition (Bundle-Patches + User-Ebene). */
export function composeIssues(profileName, profile, packages) {
  const issues = [];
  const seen = new Map();
  const layers = [];
  for (const entry of profile.entries) {
    const pkg = packages.find((candidate) => candidate.dir === entry.dir);
    for (const inserted of pkg?.patch?.patches?.flatMap((patch) => patch.insert ?? []) ?? []) {
      layers.push({ id: inserted.id, source: entry.name });
    }
  }
  for (const inserted of profile.overlay.flatMap((patch) => patch.insert ?? [])) {
    layers.push({ id: inserted.id, source: `profiles/${profileName}/cordis.patch.yml` });
  }
  for (const { id, source } of layers) {
    if (seen.has(id)) issues.push(`doppelte patch-id "${id}" (${seen.get(id)} und ${source})`);
    else seen.set(id, source);
  }
  return issues;
}
