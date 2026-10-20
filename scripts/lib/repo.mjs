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
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadYaml } from './yaml.mjs';
import { idiomIssues } from './plugin-idioms.mjs';
import { stripComments } from './source-scan.mjs';
import { PRUNE_DIRS, isPruned } from './scan.mjs';

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
/**
 * Manifest-Felder unter `dsh`, die dieses Repo liest: `bundle`/`client` liest DSH
 * selbst, `inactive` nur das Gate (`dead-package`) — ein Paket erklärt damit im
 * eigenen Manifest, dass es bewusst noch nicht im Profil steht, statt dass eine
 * zentrale Liste im Gate jedes neue Paket nachgetragen braucht.
 */
const MANIFEST_DSH_KEYS = ['bundle', 'client', 'inactive'];

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

/**
 * Alle Dateien eines Verzeichnisses, rekursiv — mit der gemeinsamen
 * Early-Pruning-Regel (`scan.mjs`): Fremdbaum, Cache, Laufzeitdaten und Symlinks
 * werden VOR der Rekursion verworfen, nicht nach dem Lesen ihrer Einträge.
 */
function walkFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || isPruned(entry.name)) continue;
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
 * pnpm-Reste: dieses Repo ruft pnpm nirgends auf und traegt keine pnpm-Datei
 * (PLAN.md Schritt 3.5/A1). Der Befund ist nicht theoretisch — UPSTREAMs
 * `initProfile` (`@deepseek-ai/dsh-app-boot`) legt bei `dsh plugin add` selbst eine
 * `pnpm-workspace.yaml` im Profilverzeichnis an, und ein `pnpm pack`/`pnpm install`
 * gerät leicht wieder in ein Skript.
 *
 * Deshalb hat die Invariante hier EINEN Eigentuemer mit praezisen Mustern statt eines
 * `grep pnpm` ueber Dateinamen: geprueft werden die zwei echten pnpm-Artefakte, ein
 * echter Prozess-/Script-Aufruf und die Script-Eintraege des Root-Manifests. Ein
 * Wortvorkommen in Kommentar oder Dokument ist kein Befund.
 */
export const PNPM_ARTIFACTS = ['pnpm-workspace.yaml', 'pnpm-lock.yaml'];
/**
 * Ein echter Aufruf: Prozess- oder Script-Start mit `pnpm` als Kommando — auch die
 * Sync-Varianten (`execFileSync`, `spawnSync`), die ein festes Kommandoliteral nehmen.
 */
const PNPM_CALL = /(?:exec|spawn|fork|run)[A-Za-z]*\(\s*['"`]pnpm['"`]/;
/** `pnpm` an einer Kommandogrenze im Script-Wert eines Manifests. */
const PNPM_SCRIPT = /(?:^|[\s&|;(])pnpm(?:\s|$)/;
const CODE_EXTENSIONS = ['.js', '.mjs', '.cjs'];
/** Verzeichnisse des eigenen Codes, in denen ein pnpm-Aufruf verboten ist. */
const CODE_DIRS = ['scripts', 'bin', 'packages'];
/**
 * Nie durchsucht: Fremdbaum, Git-Interna, generierte Artefakte, Laufzeitdaten —
 * die Liste kommt aus `scan.mjs` (EINE Regel für alle Baumläufe dieses Repos),
 * plus `attachments`, das nur hier vorkommt. Symlinks werden nie betreten.
 */
const SKIP_DIRS = new Set([...PRUNE_DIRS, 'attachments']);

/** Alle Dateien ab `dir`, ohne Fremdbaum, Git-Interna und generierte Artefakte. */
function walkRepo(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkRepo(path, found);
    else found.push(path);
  }
  return found;
}

/**
 * Verstoesse gegen die pnpm-Invariante (leer = invariant haelt).
 * @param {string} root - Wurzel, in der gesucht wird.
 * @returns {string[]}
 */
export function pnpmIssues(root = ROOT) {
  const issues = [];
  for (const path of walkRepo(root)) {
    const base = path.split(sep).pop();
    if (PNPM_ARTIFACTS.includes(base)) issues.push(`pnpm-Datei im Baum: ${relative(root, path)}`);
  }
  for (const dir of CODE_DIRS) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const path of walkRepo(base)) {
      if (CODE_EXTENSIONS.some((extension) => path.endsWith(extension)) && PNPM_CALL.test(read(path))) {
        issues.push(`pnpm-Aufruf: ${relative(root, path)}`);
      }
    }
  }
  for (const [name, command] of Object.entries(readJSON(join(root, 'package.json')).scripts ?? {})) {
    if (PNPM_SCRIPT.test(command)) issues.push(`package.json scripts.${name} ruft pnpm`);
  }
  return issues;
}

/**
 * Zwillings-Regeln: EINE Regel, die als KOPIE in zwei Dateien liegen MUSS.
 *
 * Seit 2026-10-20 gilt das nur noch fuer CLIENT-HAELFTEN. Die sechs
 * Host↔Host-Regeln (Digest, Workspace-Identitaet, letzte menschliche Nachricht,
 * Narrative-Kanal/-Vertrag, Entscheidungskanal) sind fort: sie importieren
 * `@shinon/seams/core`, und der Kern ist importfrei (`node:`-Module), also kostet
 * der Import NICHT die Eigenstaendigkeit, die die Kopie einmal begruendet hat.
 * Was einstimmig war, muss nicht geprueft werden.
 *
 * Warum die Client-Kopien bleiben (Stufe 2, absichtlich hier): ein
 * selbststaendiges Client-Bundle zieht React per `require` und kann keine
 * Host-Datei laden — es gibt fuer diese Haelfte keinen Importweg. Der Transport
 * ist deshalb eine Zwillingsregel mit EINEM Besitzer; Drift kann nicht landen,
 * weil Gate und Build jede Regel bei jedem Lauf pruefen.
 *
 *   kind 'region'    Beide Seiten tragen den Regeltext zwischen zwei Markern,
 *                    BYTEGLEICH. Der Besitzer steht im Marker und in dieser Liste.
 *   kind 'literals'  Der Spiegel kann keinen Text teilen: ausgewaehlte WERTE des
 *                    Besitzers muessen als Literal im Spiegel stehen.
 *
 * Ein `mirror`, der keine `client.js` ist, waere ein zurueckgekehrter
 * Host-Spiegel — `hostMirrorIssues()` macht ihn rot, und zwar unabhaengig davon,
 * ob er hier eingetragen wurde.
 *
 * Diese Liste ist die Besitzer-Erklaerung des Repos — nicht die Datei, die
 * zufaellig zuerst da war.
 */
export const SOURCE_TWINS = [
  {
    // Die zweite Richtung derselben Beziehung: die Persona schiebt ihren Zustand
    // in die Seite. Ohne den Namen als Zwilling zeigt die Leiste weiter ihren
    // Platzhalter, obwohl der Host den echten Zustand laengst hat.
    rule: 'Naht Persona -> Core-UI (Zustandsglobal + Live-Route)',
    kind: 'literals',
    owner: 'packages/persona/index.js',
    mirror: 'packages/core/client.js',
    values: [
      { export: 'UI_STATE_GLOBAL', literal: 'string' },
      { export: 'UI_STATE_ROUTE', literal: 'string' },
    ],
  },
  {
    // Die Pruef-Naht zeigt in BEIDE Richtungen: der Host legt den Startstand ins
    // Fenster und oeffnet die Route, das Panel liest beides. Ein falscher Name
    // hiesse nur, dass das Panel leer aussieht — wie „nichts zu entscheiden“.
    rule: 'Naht Persona-Pruefung (Panel <-> Host)',
    kind: 'literals',
    owner: 'packages/persona/index.js',
    mirror: 'packages/persona/client.js',
    values: [
      { export: 'REVIEW_ROUTE', literal: 'string' },
      { export: 'REVIEW_GLOBAL', literal: 'string' },
      { export: 'REVIEW_CONTRACT', literal: 'string' },
      // Das Panel haengt an der BESTEHENDEN Zustands-Route (SSE), nicht an einem
      // zweiten Kanal: derselbe Name, derselbe Strom.
      { export: 'UI_STATE_ROUTE', literal: 'string' },
    ],
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
  {
    // Der Schluessel, unter dem DSH die berechneten Token je Sitzung fuehrt
    // (Sitzungs-Projektion `tokenUsage` aus @deepseek-ai/dsh-token-meter). Der
    // Besitzer der Rechnung ist das assets-Core; die Client-Haelfte kann es
    // nicht importieren und traegt den Namen als Literal. Drift waere hier
    // teuer: eine Anzeige mit falschem Schluessel faellt still auf den
    // Ersatztext zurueck und sieht aus wie "keine Daten".
    rule: 'Projektions-Schluessel der Token-Anzeige',
    kind: 'literals',
    owner: 'packages/token-usage/assets/token-core.js',
    mirror: 'packages/token-usage/client.js',
    values: [{ export: 'TOKEN_USAGE_KEY', literal: 'string' }],
  },
  {
    // Der Slot, an dem das Popup-Overlay haengt: der Host kennt ihn als
    // Schema-Default + Profilwert, die Client-Haelfte muss ihn (als eigenes
    // Bundle ohne `import`) als Literal tragen. Drift waere still und teuer: die
    // Haelfte registrierte sich in einem Slot, den niemand rendert — das Overlay
    // existierte und waere unsichtbar, genau der Zustand, den dieses Paket
    // hinter sich hat.
    rule: 'Slot des Popup-Overlays',
    kind: 'literals',
    owner: 'packages/popup/index.js',
    mirror: 'packages/popup/client.js',
    values: [{ export: 'DEFAULT_SLOT', literal: 'string' }],
  },
  {
    // Dasselbe Muster für das Popup-Overlay: die Faltung des Sitzungsfensters
    // steht im Core (unit-testbar in CI, ohne node_modules) und als bytegleiche
    // Region in der Client-Hälfte, die den Core nicht importieren kann. Drift
    // wäre hier still und teuer: eine Anzeige, die andere Ereignisarten liest,
    // zeigt entweder nichts oder den falschen Vorgang — und beides sieht aus wie
    // "keine Daten".
    rule: 'Regel des Popup-Overlays (Faltung des Sitzungsfensters, Lesart)',
    kind: 'region',
    marker: 'zwilling:popup-trajectory',
    owner: 'packages/popup/assets/trajectory-core.js',
    mirror: 'packages/popup/client.js',
  },
  {
    // Die Rechnung der Token-Anzeige selbst: die Faltung der Turn-Ereignisse,
    // die Prozent-Regel und die Form. Sie steht im Core (unit-testbar, ohne
    // node_modules) und als bytegleiche Region in der Client-Haelfte, die das
    // Core nicht importieren kann (ein Client-Bundle zieht React per `require`).
    // Ein Test gegen DSHs eigene Funktionen kann nur die Kopie im Core pruefen —
    // diese Region ist der Beweis, dass die Haelfte im Browser dieselbe ist.
    rule: 'Regel der Token-Anzeige (Turn-Faltung, Prozent, Form)',
    kind: 'region',
    marker: 'zwilling:token-turn',
    owner: 'packages/token-usage/assets/token-core.js',
    mirror: 'packages/token-usage/client.js',
  },
  {
    // Die Rechnung der Toast-Anzeige selbst: die Faltung des Ereignisfensters
    // steht im Core (unit-testbar, ohne node_modules) und als bytegleiche Region
    // in der Client-Hälfte, die den Core nicht importieren kann. Drift wäre hier
    // STILL und teuer: eine Anzeige, die andere Record-Typen liest oder die
    // Schließung ueber callId verliert, zeigt dauerhaft dasselbe — und das sieht
    // aus wie "der Toast funktioniert nicht".
    rule: 'Regel der Traceability-Toasts (Faltung des Ereignisfensters)',
    kind: 'region',
    marker: 'zwilling:trace-toasts',
    owner: 'packages/traceability/assets/trace-core.js',
    mirror: 'packages/traceability/client.js',
  },
  {
    // Die Naht Host -> Browser: der Name des Globals, in das der Host die
    // WIRKSAMEN Grenzen legt (`webserver/index-inject`, dieselbe Naht wie die
    // Marker-Grenzen), und der Vertragsname, den der Client liest, um fremde
    // Datensätze zu verwerfen. Beides kann die Client-Hälfte nicht importieren.
    // Drift wäre STILL und teuer: die Seite trüge keinen Datensatz (Rückfall auf
    // den Vertrag) oder wirfe ihn als fremd weg — beides sähe aus wie "die
    // Profilwerte wirken nicht", und niemand bekäme eine Meldung.
    rule: 'Naht Host -> Browser (Traceability-Grenzen)',
    kind: 'literals',
    owner: 'packages/traceability/index.js',
    mirror: 'packages/traceability/client.js',
    values: [
      { export: 'TRACE_GLOBAL', literal: 'string' },
      { export: 'TOAST_CONTRACT', literal: 'string' },
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

/**
 * Ein `export const NAME = '…'` als Wert (oder null).
 *
 * Die zweite, gleichwertige Schreibweise zaehlt mit: eine Deklaration
 * `const NAME = '…'`, die die Datei in einer `export { … }`-Liste herausgibt.
 * Beide verlangen dieselbe Zusage (der Name ist deklariert UND ausgeliefert),
 * und der Grund fuer die zweite ist real: derselbe Text steht als Region auch im
 * Client-Bundle in einem Funktionsrumpf, wo `export` ein Syntaxfehler waere. Ein
 * fehlendes `export` bleibt ein Issue — die Liste wird mitgeprueft.
 */
function exportedString(text, name) {
  const direct = new RegExp(`export const ${name} = '([^']*)'`).exec(text);
  if (direct !== null) return direct[1];
  const declared = new RegExp(`(?:^|\\n)const ${name} = '([^']*)'`).exec(text);
  if (declared === null) return null;
  return new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\}`).test(text) ? declared[1] : null;
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
/**
 * Der Spiegeltext eines Zwillings. `mirrorScope: 'package'` liest das ganze
 * Runtime-Paket (index.js + assets/*.js): ein Modulschnitt verschiebt einen
 * Namen, er ändert die Zusage nicht. Ohne den Scope bleibt es bei der einen
 * Datei — die enge Vorgabe gilt weiter, wo sie steht.
 */
function mirrorTextOf(twin, root) {
  const file = join(root, twin.mirror);
  if (twin.mirrorScope !== 'package') return read(file);
  const texts = [read(file)];
  const assets = join(dirname(file), 'assets');
  if (existsSync(assets)) {
    for (const entry of readdirSync(assets, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) texts.push(read(join(assets, entry.name)));
    }
  }
  return texts.join('\n');
}

/**
 * Die Zwillings-Regeln prüfen. Ein fehlender Besitzer, ein fehlender Spiegel,
 * eine fehlende oder abweichende Region und ein fehlendes Literal sind je ein
 * Issue — Drift fällt damit im Gate (`scripts/shinon-test.mjs`) und im Build
 * (`scripts/build.mjs`) auf, nicht erst im Betrieb.
 * @param {string} root - Wurzel, in der die deklarierten Pfade gesucht werden.
 * @param {Array} twins - die zu prüfenden Regeln (Default: `SOURCE_TWINS`);
 *   der Parameter existiert für Mutationsproben an einem Miniatur-Baum.
 * @returns {string[]} Verstoesse (leer = alle Zwillinge stimmen).
 */
export function twinIssues(root = ROOT, twins = SOURCE_TWINS) {
  const issues = [];
  for (const twin of twins) {
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
    const mirrorText = mirrorTextOf(twin, root);

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

/** Der Host-Naht-Kern — die EINE Definition der sechs importierten Regeln. */
export const SEAM_CORE = 'packages/seams/assets/seams.js';
/** Das Inventar, gegen das geprueft wird (Daten, kein zweiter Regelsatz). */
export const SEAM_INVENTORY = 'packages/seams/assets/seams.json';

/** Alle Host-Runtime-Dateien: `index.js` je Paket plus jede `.js` unter `assets/`. */
function hostRuntimeFiles(root) {
  const files = [];
  let dirs = [];
  try {
    dirs = readdirSync(join(root, 'packages'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return files;
  }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  for (const entry of dirs) {
    const base = join(root, 'packages', entry.name);
    if (existsSync(join(base, 'index.js'))) files.push(join(base, 'index.js'));
    if (existsSync(join(base, 'assets'))) walk(join(base, 'assets'));
  }
  return files;
}

/**
 * Der Riegel gegen zurueckkehrende HOST-Spiegel.
 *
 * Die sechs Host↔Host-Naehte stehen seit 2026-10-20 EINMAL (`@shinon/seams`).
 * Eine Zwillings-Regel kann das nicht mehr sichern — eine Kopie ohne Marker
 * waere fuer `twinIssues` unsichtbar. Dieser Schritt prueft deshalb das
 * Gegenteil: dass die Definition NIRGENDS sonst steht.
 *
 * Vier Zusagen, jede mit eigenem Befund:
 *   1. Jede `SOURCE_TWINS`-Regel spiegelt in eine `client.js`. Ein Host-Ziel
 *      waere ein zurueckgekehrter Host-Spiegel.
 *   2. Keine Host-Haelfte traegt eine `zwilling:`-Region. Regionen sind das
 *      Transportmittel der Kopie — im Host gibt es nichts zu transportieren.
 *   3. Jede Funktion des Inventars wird in genau EINER Host-Datei definiert.
 *   4. Jedes Literal des Inventars steht in keiner anderen Host-Datei.
 *
 * Client-Haelften sind ausgenommen (Stufe 2, `SOURCE_TWINS`) — die Pruefung liest
 * nur `index.js` und die `.js`-Dateien unter `assets/`.
 *
 * @returns {string[]} Befunde; leer heisst: der Kern ist die einzige Quelle.
 */
export function hostMirrorIssues(root = ROOT) {
  const issues = [];
  const coreFile = join(root, SEAM_CORE);

  for (const twin of SOURCE_TWINS) {
    if (!twin.mirror.endsWith('client.js')) {
      issues.push(`${twin.rule}: Spiegel ${twin.mirror} ist keine Client-Haelfte (Host-Spiegel zurueck?)`);
    }
  }

  let inventory;
  try {
    inventory = JSON.parse(read(join(root, SEAM_INVENTORY)));
  } catch (error) {
    return [...issues, `Naht-Inventar ${SEAM_INVENTORY} fehlt oder parst nicht (${error.message})`];
  }
  const functions = inventory.functions ?? [];
  const literals = inventory.literals ?? [];
  const others = hostRuntimeFiles(root).filter((file) => file !== coreFile);
  // Ein Besitzer einer CLIENT-Regel darf im Host stehen (der Popup-Kern haelt die
  // Faltung, die Client-Haelfte spiegelt sie). Nur ein Host, der selbst NICHTS
  // besitzt, darf keine Region tragen — dort waere sie eine zweite Wahrheit.
  const owners = new Set(SOURCE_TWINS.map((twin) => twin.owner));

  for (const file of others) {
    const text = read(file);
    const rel = relative(root, file).split(sep).join('/');
    if (text.includes('// #region zwilling:') && !owners.has(rel)) {
      issues.push(`${rel}: zwilling-Region in einer Host-Haelfte — Host-Regeln werden importiert, nicht kopiert`);
    }
    const code = stripComments(text);
    for (const name of functions) {
      if (new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?function\\s+${name}\\s*\\(`).test(code)) {
        issues.push(`${rel}: definiert ${name}() — die Definition steht in ${SEAM_CORE}`);
      }
    }
    for (const { name, value } of literals) {
      if (code.includes(`'${value}'`)) {
        issues.push(`${rel}: traegt ${name} ("${value}") als Literal statt aus ${SEAM_CORE}`);
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
