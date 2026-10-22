/**
 * dsh-versions.mjs — EINE Sollquelle, EIN Prüfer für alle Fassungen.
 *
 * Die Matrix ist die einzige Autorität. Geprüft werden Manifeste, Lock (auch
 * verschachtelt), Vendor, Installat, CLI und ein zweiter Versionsliteral im
 * Quelltext; Befunde werden gesammelt, den Exit-Code setzt der Aufrufer.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { dshBinary } from './dsh.mjs';
import { compareSemver, parseSemver, satisfiesRange } from './runtime.mjs';
export { compareSemver, parseSemver, satisfiesRange } from './runtime.mjs';
import { tokenize } from './source-scan.mjs';

/** Die Sollquelle — relativ zum Repo-Root. */
export const MATRIX_FILE = 'scripts/dsh-target-versions.json';

/** Die fünf Zielpakete. Mehr kennt die Matrix nicht; ein sechster Schlüssel ist ein Befund. */
export const TARGET_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-storage-domain',
  '@deepseek-ai/dsh-storage-json',
  '@deepseek-ai/dsh-typert-protocol',
]);

/** Eine exakte Fassung — keine Range, kein Tag, kein `latest`. */
const VERSION_SHAPE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Verzeichnisse, die Quelltext tragen und deshalb auf Versionsliterale geprüft werden. */
const SOURCE_ROOTS = ['bin', 'scripts', 'packages', 'profiles'];
const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.yml', '.yaml'];
const SOURCE_SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.shinon']);

/** Befund mit Soll, Ist und Fundstelle — die Form, die der CLI ausgibt. */
function issue(code, where, pkg, expected, actual, message) {
  return { code, where, package: pkg, expected, actual, message };
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Kommentare durch Leerzeichen ersetzen, Zeilenumbrüche stehen lassen: eine
 * Fassung in der Prosa ist keine Konstante, und die Fundstelle bleibt die
 * echte Zeile (ein Blockkommentar darf die Zählung nicht verschieben).
 */
function maskComments(source) {
  return tokenize(source)
    .map((segment) => (segment.kind === 'comment' ? segment.text.replace(/[^\n]/g, ' ') : segment.text))
    .join('');
}

/**
 * Die Matrix lesen und selbst prüfen: Objekt, genau die fünf Zielpakete,
 * jede Fassung exakt. Ein Tippfehler in einem Schlüssel darf nicht als
 * „nicht zutreffend" durchgehen.
 * @returns {{ targets: Record<string,string>, issues: object[] }}
 */
export function loadMatrix(root) {
  const path = join(root, MATRIX_FILE);
  const issues = [];
  if (!existsSync(path)) {
    return { targets: {}, issues: [issue('MATRIX_MISSING', MATRIX_FILE, null, 'Datei', null, `Sollquelle fehlt: ${MATRIX_FILE}`)] };
  }
  let parsed;
  try {
    parsed = readJson(path);
  } catch (error) {
    return { targets: {}, issues: [issue('MATRIX_UNREADABLE', MATRIX_FILE, null, 'JSON', null, `nicht lesbar: ${error.message}`)] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { targets: {}, issues: [issue('MATRIX_SHAPE', MATRIX_FILE, null, 'Objekt', typeof parsed, 'die Matrix ist kein Objekt')] };
  }
  const targets = {};
  for (const pkg of TARGET_PACKAGES) {
    const value = parsed[pkg];
    if (value === undefined) {
      issues.push(issue('MATRIX_ENTRY_MISSING', MATRIX_FILE, pkg, 'exakte Fassung', null, `${pkg} fehlt in der Sollquelle`));
    } else if (typeof value !== 'string' || !VERSION_SHAPE.test(value)) {
      issues.push(issue('MATRIX_ENTRY_INVALID', MATRIX_FILE, pkg, 'exakte Fassung', String(value), `${pkg} ist keine exakte Fassung (Range/Tag sind als Ziel unzulässig)`));
    } else {
      targets[pkg] = value;
    }
  }
  for (const key of Object.keys(parsed)) {
    if (!TARGET_PACKAGES.includes(key)) {
      issues.push(issue('MATRIX_ENTRY_UNKNOWN', MATRIX_FILE, key, TARGET_PACKAGES.join(', '), key, `${key} ist kein Zielpaket — ein Tippfehler würde sonst nichts prüfen`));
    }
  }
  return { targets, issues };
}

/** Alle Workspace-Manifeste aus dem `workspaces`-Feld des Root-Manifests. */
function workspaceManifests(root) {
  const paths = [];
  let rootManifest;
  try {
    rootManifest = readJson(join(root, 'package.json'));
  } catch {
    return paths;
  }
  for (const pattern of rootManifest.workspaces ?? []) {
    const text = String(pattern);
    if (!text.endsWith('/*')) {
      if (existsSync(join(root, text, 'package.json'))) paths.push(`${text}/package.json`);
      continue;
    }
    const base = text.slice(0, -2);
    if (!existsSync(join(root, base))) continue;
    for (const name of readdirSync(join(root, base))) {
      if (existsSync(join(root, base, name, 'package.json'))) paths.push(`${base}/${name}/package.json`);
    }
  }
  return paths.sort();
}

/** Alle Quelldateien der erlaubten Wurzelverzeichnisse. */
function sourceFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SOURCE_SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  };
  for (const dir of SOURCE_ROOTS) {
    const full = join(root, dir);
    if (existsSync(full)) walk(full);
  }
  return files;
}

/**
 * Die Laufzeit messen: installierte Paketfassungen und die CLI-Ausgabe.
 * Fehlt etwas, steht das als `null` im Ergebnis — der Prüfer wertet das als
 * Befund, nicht als „nicht zutreffend".
 */
export function probeRuntime(root, { binary = null } = {}) {
  // Installierte Kopien stehen nicht zwingend oben: npm legt ein Paket dorthin,
  // wo es zuerst gebraucht wird (gemessen: dsh-storage-domain lag nur unter
  // dsh/node_modules). Die Lock-Pfade sind die belegten Orte — sie werden
  // gelesen, statt den ganzen Baum zu durchsuchen.
  const lock = existsSync(join(root, 'package-lock.json')) ? readJson(join(root, 'package-lock.json')) : null;
  const packages = {};
  for (const pkg of TARGET_PACKAGES) {
    const candidates = [
      `node_modules/${pkg}`,
      ...Object.keys(lock?.packages ?? {}).filter((path) => path.endsWith(`node_modules/${pkg}`)),
    ];
    let found = null;
    for (const candidate of candidates) {
      const manifest = join(root, candidate, 'package.json');
      if (!existsSync(manifest)) continue;
      found = readJson(manifest).version ?? null;
      break;
    }
    packages[pkg] = found;
  }
  let cli = null;
  const resolved = binary ?? dshBinary();
  if (resolved !== null) {
    try {
      cli = execFileSync(resolved[0], [...resolved.slice(1), '--version'], { encoding: 'utf8', timeout: 30000 })
        .trim().split('\n')[0].trim();
    } catch {
      cli = null;
    }
  }
  return { packages, cli };
}

/**
 * Der eine Prüfer. Nimmt jeden Wurzelpfad (Tests bauen ihre eigene Kopie) und
 * liefert alle Befunde statt des ersten.
 * @param {string} root
 * @param {{ runtime?: { packages: Record<string,string|null>, cli: string|null }, skipSourceScan?: boolean }} [options]
 */
export function checkVersions(root, options = {}) {
  const { targets, issues } = loadMatrix(root);
  const runtime = options.runtime ?? probeRuntime(root);
  const checks = { manifests: 0, lockEntries: 0, sourceFiles: 0 };
  if (issues.length > 0) return { ok: false, targets, issues, checks };

  const lock = existsSync(join(root, 'package-lock.json')) ? readJson(join(root, 'package-lock.json')) : null;
  if (lock === null) {
    issues.push(issue('LOCK_MISSING', 'package-lock.json', null, 'Datei', null, 'ohne Lockfile ist keine aufgelöste Fassung prüfbar'));
  }

  // 1. Deklarationen: Root und jedes Workspace-Manifest.
  const manifests = ['package.json', ...workspaceManifests(root)];
  for (const rel of manifests) {
    let manifest;
    try {
      manifest = readJson(join(root, rel));
    } catch (error) {
      issues.push(issue('MANIFEST_UNREADABLE', rel, null, 'JSON', null, error.message));
      continue;
    }
    checks.manifests += 1;
    for (const pkg of TARGET_PACKAGES) {
      const wanted = targets[pkg];
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        const declared = manifest[field]?.[pkg];
        if (declared === undefined) continue;
        if (declared !== wanted) {
          const code = declared.includes(wanted) || /^[~^]/.test(declared) ? 'DECLARED_NOT_EXACT' : 'DECLARED_MISMATCH';
          issues.push(issue(code, `${rel} ${field}`, pkg, wanted, declared,
            `${field} nennt ${declared}; die Sollquelle verlangt exakt ${wanted}`));
        }
      }
      const peer = manifest.peerDependencies?.[pkg];
      if (peer !== undefined && !satisfiesRange(peer, wanted)) {
        issues.push(issue('PEER_INCOMPATIBLE', `${rel} peerDependencies`, pkg, wanted, peer,
          `der Peer-Bereich ${peer} schließt die Sollfassung ${wanted} nicht ein`));
      }
    }
    // `engines.dsh` gilt fuer das Laufzeitpaket, nicht je Zielpaket: DSH prueft
    // den Bereich beim Mounten (dsh-app-boot/plugin-compatibility), ein
    // ausschliessender Bereich verhindert das Laden des Plugins.
    const engines = manifest.engines?.dsh;
    if (engines !== undefined && !satisfiesRange(engines, targets['@deepseek-ai/dsh'])) {
      issues.push(issue('ENGINES_INCOMPATIBLE', `${rel} engines.dsh`, '@deepseek-ai/dsh', targets['@deepseek-ai/dsh'], engines,
        `engines.dsh ${engines} schließt die laufende Sollfassung nicht ein`));
    }
  }

  // 2. Aufgelöste Fassungen: jeder Lock-Eintrag, auch verschachtelt.
  const locked = new Map(TARGET_PACKAGES.map((pkg) => [pkg, 0]));
  if (lock !== null) {
    for (const [path, entry] of Object.entries(lock.packages ?? {})) {
      for (const pkg of TARGET_PACKAGES) {
        const suffix = `node_modules/${pkg}`;
        if (path !== suffix && !path.endsWith(`/${suffix}`)) continue;
        checks.lockEntries += 1;
        locked.set(pkg, locked.get(pkg) + 1);
        const wanted = targets[pkg];
        if (entry?.version !== wanted) {
          issues.push(issue('LOCK_MISMATCH', `package-lock.json ${path}`, pkg, wanted, entry?.version ?? null,
            `das Lock löst ${entry?.version ?? 'nichts'} auf, die Sollquelle verlangt ${wanted}`));
        }
        const resolved = String(entry?.resolved ?? '');
        if (resolved !== '' && !resolved.endsWith(`/-/${pkg.split('/')[1]}-${String(entry?.version)}.tgz`)) {
          issues.push(issue('LOCK_TARBALL', `package-lock.json ${path}`, pkg, `${pkg.split('/')[1]}-${entry?.version}.tgz`, resolved,
            'der Lock-Eintrag zeigt nicht auf den Tarball seiner eigenen Fassung'));
        }
        if (typeof entry?.integrity !== 'string' || !/^sha512-/.test(entry.integrity)) {
          issues.push(issue('LOCK_INTEGRITY', `package-lock.json ${path}`, pkg, 'sha512-…', entry?.integrity ?? null,
            'ohne Integrität ist der Tarball nicht belegt'));
        }
      }
    }
    for (const [pkg, count] of locked) {
      if (count === 0) {
        issues.push(issue('LOCK_ENTRY_MISSING', 'package-lock.json', pkg, `Eintrag node_modules/${pkg}`, null,
          'das Lock löst das Zielpaket gar nicht auf — eine fehlende Angabe ist ein Befund'));
      }
    }
  }

  // 3. Vendor-Metadaten: Fassung, Tarball-URL, Integrität gegen das Lock.
  const dshTarget = targets['@deepseek-ai/dsh'];
  const manifestPath = 'vendor/dsh/MANIFEST.json';
  if (existsSync(join(root, manifestPath))) {
    let vendor = null;
    try {
      vendor = readJson(join(root, manifestPath));
    } catch (error) {
      issues.push(issue('VENDOR_UNREADABLE', manifestPath, '@deepseek-ai/dsh', 'JSON', null, `nicht lesbar: ${error.message}`));
    }
    if (vendor !== null && vendor.version !== dshTarget) {
      issues.push(issue('VENDOR_VERSION_MISMATCH', manifestPath, '@deepseek-ai/dsh', dshTarget, vendor.version ?? null,
        `die vendorte Fassung ist ${vendor.version}, die Sollquelle verlangt ${dshTarget}`));
    }
    const vendorPackage = 'vendor/dsh/package.json';
    if (vendor !== null && existsSync(join(root, vendorPackage))) {
      const vendored = readJson(join(root, vendorPackage));
      if (vendored.version !== dshTarget) {
        issues.push(issue('VENDOR_PACKAGE_MISMATCH', vendorPackage, '@deepseek-ai/dsh', dshTarget, vendored.version ?? null,
          `vendor/dsh/package.json nennt ${vendored.version}, die Sollquelle ${dshTarget}`));
      }
    }
    if (vendor !== null && !String(vendor.source?.tarball ?? '').endsWith(`/-/dsh-${dshTarget}.tgz`)) {
      issues.push(issue('VENDOR_TARBALL_MISMATCH', manifestPath, '@deepseek-ai/dsh', `dsh-${dshTarget}.tgz`, vendor.source?.tarball ?? null,
        'die Tarball-URL im Manifest trägt nicht die Sollfassung'));
    }
    const locked = lock?.packages?.['node_modules/@deepseek-ai/dsh'];
    if (vendor !== null && locked !== undefined && vendor.source?.integrity !== locked.integrity) {
      issues.push(issue('VENDOR_INTEGRITY_MISMATCH', manifestPath, '@deepseek-ai/dsh', locked.integrity ?? null, vendor?.source?.integrity ?? null,
        'Manifest und Lock beschreiben verschiedene Tarballs'));
    }
  } else {
    issues.push(issue('VENDOR_MISSING', manifestPath, '@deepseek-ai/dsh', 'Datei', null, 'die vendorte CLI ist nicht belegt'));
  }

  // 4. Laufzeit: installierte Pakete und die CLI-Ausgabe.
  for (const pkg of TARGET_PACKAGES) {
    const actual = runtime.packages?.[pkg] ?? null;
    if (actual === null) {
      issues.push(issue('INSTALLED_MISSING', `node_modules/${pkg}`, pkg, targets[pkg], null, `${pkg} ist nicht installiert`));
    } else if (actual !== targets[pkg]) {
      issues.push(issue('INSTALLED_MISMATCH', `node_modules/${pkg}`, pkg, targets[pkg], actual, `installiert ist ${actual}`));
    }
  }
  if (runtime.cli === null) {
    issues.push(issue('CLI_UNVERIFIED', 'dsh --version', '@deepseek-ai/dsh', targets['@deepseek-ai/dsh'], null,
      'die CLI-Ausgabe war nicht messbar — eine unbelegte Fassung ist keine bestätigte'));
  } else if (runtime.cli !== targets['@deepseek-ai/dsh']) {
    issues.push(issue('CLI_MISMATCH', 'dsh --version', '@deepseek-ai/dsh', targets['@deepseek-ai/dsh'], runtime.cli,
      `die CLI meldet ${runtime.cli}`));
  }

  // 5. Keine zweite Sollversion im Quelltext: wer eine Fassung braucht, liest die Matrix.
  if (options.skipSourceScan !== true) {
    for (const file of sourceFiles(root)) {
      const rel = relative(root, file).split(sep).join('/');
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      checks.sourceFiles += 1;
      const lines = maskComments(text).split('\n');
      for (const pkg of TARGET_PACKAGES) {
        const literal = targets[pkg];
        const at = lines.findIndex((line) => line.includes(literal));
        if (at !== -1) {
          issues.push(issue('TARGET_LITERAL_IN_SOURCE', `${rel}:${at + 1}`, pkg, 'aus der Matrix gelesen', literal,
            `eine eigene Zielversionskonstante (${literal}) — dieses Skript muss ${MATRIX_FILE} lesen`));
        }
      }
    }
  }

  return { ok: issues.length === 0, targets, issues, checks };
}

/** Kurzform für Aufrufer, die nur „ist es die Sollfassung?" brauchen. */
export function isTargetVersion(root, pkg, version) {
  const { targets } = loadMatrix(root);
  return targets[pkg] !== undefined && targets[pkg] === version;
}
