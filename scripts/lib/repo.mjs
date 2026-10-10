/**
 * repo.mjs - eine Quelle für Discovery und Validierung des Repositories.
 *
 * Genutzt von scripts/dsh-test.mjs (Gate), scripts/build.mjs (Pipeline) und
 * scripts/validate-test.mjs (Regel-Fixtures), damit alle dieselben Verträge
 * prüfen und nicht auseinanderdriften.
 *
 * Namensvertrag - alle Quellen müssen denselben Namen führen:
 *
 *   Quelle                                  Feld    erwarteter Wert
 *   packages/<dir>/package.json             name    @shinon/<dir>
 *   packages/<dir>/cordis.patch.yml         id      shinon-<dir>
 *   packages/<dir>/cordis.patch.yml         name    @shinon/<dir>
 *   packages/<dir>/client.js                id      @shinon/<dir>   (ModuleLoader)
 *   profiles/<profil>/package.json          bundles @shinon/<dir> je aktiviertem Paket
 *
 * Geprüfte Regeln:
 *   Manifest    Exports-Ziele, dsh.bundle.patch, dsh.client.platform, peer+dev,
 *               unbekannte dsh-Felder
 *   Patch       YAML-Schema der DSH-Loader-Patches: Struktur, Typen, required
 *               keys, unbekannte Keys (näher an DSH als die frühere Regex-Prüfung)
 *   Ressourcen  jede Referenz aus Manifest und Patch-Config existiert, ist eine
 *               Datei, liegt im Paket und parst in ihrem Format
 *   Komposition Profil-Manifest, doppelte insert-ids über alle Layer, azyklischer
 *               Paketgraph
 *   Idiome      generierte Plugin-Bausteine deckungsgleich mit ihrer einen Quelle
 *               (scripts/lib/plugin-idioms.mjs) — und keine Kopie daneben
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { loadYaml } from './yaml.mjs';
import { idiomIssues } from './plugin-idioms.mjs';

// Generierte Plugin-Bausteine (settings-Registrierung, Locale-Fallback): sie stehen
// EINMAL in scripts/lib/plugin-idioms.mjs und liegen als markierte Ableitung in den
// Paketen. Wer die Quelle ändert, schreibt mit `npm run idioms` nach; geprüft wird hier.
export { idiomIssues };

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PACKAGES_DIR = join(ROOT, 'packages');
export const PROFILES_DIR = join(ROOT, 'profiles');

/** Host-shared Abhängigkeiten: müssen als peerDependency UND devDependency deklariert sein. */
export const SHARED_DEPS = ['@deepseek-ai/schemastery'];

/** Dateien, die das Artefakt jedes Pakets enthält. */
export const RUNTIME_FILES = ['package.json', 'index.js', 'client.js', 'cordis.patch.yml', 'assets'];

/**
 * Teilschema der DSH-Loader-Patch-Dateien (`@deepseek-ai/cordis-plugin-include`
 * `PatchOptions`), abgeleitet aus `@deepseek-ai/dsh-app-boot` und dem Schema von
 * `dsh --profile <name> --dump-config-schema`. Unbekannte Felder lehnt DSH nicht
 * ab, wir schon: ein Tippfehler würde sonst still ignoriert.
 */
const PATCH_KEYS = ['id', 'name', 'config', 'group', 'disabled', 'inject', 'intercept', 'isolate', 'insert'];
const ENTRY_KEYS = ['id', 'name', 'config', 'group', 'disabled', 'inject', 'intercept', 'isolate'];
/** Manifest-Felder unter `dsh`, die DSH liest. */
const MANIFEST_DSH_KEYS = ['bundle', 'client'];

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Erste Abweichung zwischen zwei Namen (leer, wenn gleich). */
const nameIssue = (label, actual, want) => (actual === want ? null : `${label} "${actual}" ≠ "${want}"`);

export const read = (file) => readFileSync(file, 'utf8');
export const readJSON = (file) => JSON.parse(read(file));
export const readYaml = (file) => loadYaml(read(file));

export function readRoot() {
  return readJSON(join(ROOT, 'package.json'));
}

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
        if (known.has(name)) targets.add(name);
        else issues.push(`${pkg.dir}: ${field}["${name}"] → kein Paket unter packages/`);
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
      } else if (!state.has(next)) {
        walk(next);
      }
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

/**
 * Alle Runtime-Artefakte, die den alten Namespace nicht mehr nennen dürfen.
 *
 * Gesucht wird in JEDER ausgelieferten Code-/Konfigurationsdatei des Pakets, nicht
 * nur in den vier Vertragsdateien: seit Pakete Unterverzeichnisse mitbringen
 * (`assets/`, etwa der Kern des Project Index), wäre eine feste Dateiliste ein Tor
 * mit offener Lücke — der Legacy-String dürfte dann genau dort stehen.
 */
export const LEGACY_SCAN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.yml', '.yaml'];

/** Alle Dateien eines Verzeichnisses, rekursiv, ohne node_modules. */
function walkFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(path));
    else if (LEGACY_SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) found.push(path);
  }
  return found;
}

export function legacyHits(packages) {
  const hits = [];
  for (const pkg of packages) {
    for (const path of walkFiles(pkg.base)) {
      if (read(path).includes('dsh-mod')) hits.push(relative(ROOT, path));
    }
  }
  if (existsSync(PROFILES_DIR)) {
    for (const profile of readdirSync(PROFILES_DIR)) {
      for (const file of ['cordis.patch.yml', 'package.json']) {
        const path = join(PROFILES_DIR, profile, file);
        if (existsSync(path) && read(path).includes('dsh-mod')) hits.push(relative(ROOT, path));
      }
    }
  }
  return hits;
}

/**
 * Zwillings-Regeln: EINE Regel, die in zwei Paketen liegen MUSS.
 *
 * Warum die Dopplung ueberhaupt existiert (gemessen, nicht behauptet): Pakete
 * dieses Repos duerfen einander zur Laufzeit nicht importieren, und jedes Bundle
 * reist eigenstaendig (ein Host mit nur EINEM der beiden Pakete darf nicht am
 * fehlenden anderen scheitern; kein Paket erklaert ein `@shinon/*`-Paket als
 * Abhaengigkeit). Ein `import` ueber die Paketgrenze waere der einzige Weg zu
 * EINER Datei — und der kostet genau diese Eigenstaendigkeit.
 *
 * Der Transport ist deshalb eine Zwillingsregel mit EINEM Besitzer. Die Dopplung
 * ist damit nicht weg, aber Drift kann nicht mehr landen: Gate und Build pruefen
 * jede Regel bei jedem Lauf.
 *
 *   kind 'region'    Beide Seiten tragen den Regeltext zwischen zwei Markern,
 *                    BYTEGLEICH. Der Besitzer steht im Marker und in dieser Liste.
 *   kind 'literals'  Der Spiegel kann keinen Text teilen (ein selbststaendiges
 *                    Client-Bundle zieht kein `import`): ausgewaehlte WERTE des
 *                    Besitzers muessen als Literal im Spiegel stehen.
 *
 * Diese Liste ist die Besitzer-Erklaerung des Repos — nicht die Datei, die
 * zufaellig zuerst da war.
 */
export const SOURCE_TWINS = [
  {
    rule: 'sha256-Digest',
    kind: 'region',
    marker: 'zwilling:sha256-digest',
    owner: 'packages/events/index.js',
    mirror: 'packages/hook/index.js',
  },
  {
    rule: 'letzte menschliche Nachricht mit Text',
    kind: 'region',
    marker: 'zwilling:letzte-menschliche-nachricht',
    owner: 'packages/prompter/index.js',
    mirror: 'packages/task-router/index.js',
  },
  {
    rule: 'Naht-Namen Client -> Host',
    kind: 'literals',
    owner: 'packages/codingmon/assets/uebergabe.js',
    mirror: 'packages/codingmon/client.js',
    values: [
      { export: 'UEBERGABE_NAMESPACE', literal: 'string' },
      { export: 'UEBERGABE_METHOD', literal: 'string' },
    ],
  },
  {
    rule: 'Marker-Nutzlast-Format und -Grenzen',
    kind: 'literals',
    owner: 'packages/markers/assets/marker-model.json',
    mirror: 'packages/markers/client.js',
    values: [
      { jsonPath: 'payload.line', literal: 'string' },
      { jsonPath: 'payload.comment', literal: 'string' },
      { jsonPath: 'limits.text', literal: 'number' },
      { jsonPath: 'limits.comment', literal: 'number' },
      // Die Markenmenge ist seit Schritt 2.3 nicht mehr nur eine Vertragszahl: sie
      // kommt aus den wirksamen Grenzen der Seite. Die Vertragsgabe steht als
      // Rueckfall im Client und muss dort bleiben.
      { jsonPath: 'limits.marks', literal: 'number' },
      // Und der Vertragsname: der Client verwirft einen Datensatz aus einem fremden
      // Vertrag — dafuer muss er den eigenen Namen als Literal tragen (er kann
      // index.js nicht importieren).
      { jsonPath: 'contract', literal: 'string' },
    ],
  },
];

/** Der Text zwischen `// #region <marker>` und `// #endregion <marker>` (oder null). */
function regionOf(text, marker) {
  const start = text.indexOf(`// #region ${marker}`);
  const end = text.indexOf(`// #endregion ${marker}`);
  if (start < 0 || end < 0 || end < start) return null;
  return text.slice(start, end + `// #endregion ${marker}`.length);
}

/** Ein String, wie er als einfaches JS-Literal im Quelltext steht. */
const jsLiteral = (value) => `'${value
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\r/g, '\\r')
  .replace(/\n/g, '\\n')
  .replace(/\t/g, '\\t')}'`;

/** Ein `export const NAME = '…'` als Wert (oder null). */
function exportedString(text, name) {
  const found = new RegExp(`export const ${name} = '([^']*)'`).exec(text);
  return found === null ? null : found[1];
}

/** Ein Punktpfad in geparsten Vertragsdaten. */
function dotPath(value, path) {
  return path.split('.').reduce((current, key) => (isObject(current) ? current[key] : undefined), value);
}

/**
 * Die Zwillings-Regeln pruefen. Ein fehlender Besitzer, ein fehlender Spiegel,
 * eine fehlende oder abweichende Region und ein fehlendes Literal sind je ein
 * Issue — Drift faellt damit im Gate (`scripts/dsh-test.mjs`) und im Build
 * (`scripts/build.mjs`) auf, nicht erst im Betrieb.
 * @param {string} root - Wurzel, in der die deklarierten Pfade gesucht werden.
 * @returns {string[]} Verstoesse (leer = alle Zwillinge stimmen).
 */
export function twinIssues(root = ROOT) {
  const issues = [];
  for (const twin of SOURCE_TWINS) {
    const ownerFile = join(root, twin.owner);
    const mirrorFile = join(root, twin.mirror);
    if (!existsSync(ownerFile)) {
      issues.push(`${twin.rule}: Besitzer ${twin.owner} fehlt`);
      continue;
    }
    if (!existsSync(mirrorFile)) {
      issues.push(`${twin.rule}: Spiegel ${twin.mirror} fehlt`);
      continue;
    }
    const ownerText = read(ownerFile);
    const mirrorText = read(mirrorFile);

    if (twin.kind === 'region') {
      const ownerRegion = regionOf(ownerText, twin.marker);
      const mirrorRegion = regionOf(mirrorText, twin.marker);
      if (ownerRegion === null) issues.push(`${twin.rule}: Region ${twin.marker} fehlt in ${twin.owner}`);
      if (mirrorRegion === null) issues.push(`${twin.rule}: Region ${twin.marker} fehlt in ${twin.mirror}`);
      if (ownerRegion !== null && mirrorRegion !== null && ownerRegion !== mirrorRegion) {
        issues.push(`${twin.rule}: Region ${twin.marker} in ${twin.mirror} ist nicht bytegleich zu ${twin.owner}`);
      }
      continue;
    }

    let parsed = null;
    if (twin.owner.endsWith('.json')) {
      try {
        parsed = JSON.parse(ownerText);
      } catch (error) {
        issues.push(`${twin.rule}: Besitzer ${twin.owner} ist kein gueltiges JSON (${error.message})`);
        continue;
      }
    }
    for (const spec of twin.values ?? []) {
      const value = spec.jsonPath === undefined ? exportedString(ownerText, spec.export) : dotPath(parsed, spec.jsonPath);
      const label = spec.jsonPath ?? spec.export;
      if (value === undefined || value === null || String(value) === '') {
        issues.push(`${twin.rule}: Besitzer ${twin.owner} liefert ${label} nicht`);
        continue;
      }
      const wanted = spec.literal === 'number' ? new RegExp(`\\b${String(value)}\\b`) : null;
      const present = wanted === null ? mirrorText.includes(jsLiteral(String(value))) : wanted.test(mirrorText);
      if (!present) {
        issues.push(`${twin.rule}: ${twin.mirror} spiegelt ${label} (${JSON.stringify(value)}) nicht`);
      }
    }
  }
  return issues;
}

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
