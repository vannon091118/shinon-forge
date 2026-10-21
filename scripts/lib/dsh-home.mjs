/**
 * scripts/lib/dsh-home.mjs — das DSH-Home aus dem Arbeitsbaum SEEDEN.
 *
 * `$DSH_HOME/AGENTS.md` ist bei DSH die benutzerglobale Anweisungsdatei und lief
 * mit dem Repo als Home in JEDER fremden Sitzung mit (gemessen 2026-10-17). Hier
 * wird das getrennte Home aus dem Baum gefüllt: Profil, Sitzungen, Schlüssel.
 * Dieselbe Regel wie `profile-links`: ein FEHLENDER Link ist kein Befund, ein
 * vorhandener, der woandershin zeigt, ist einer — und wird nie überschrieben.
 */
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Der Mount-Pfad eines AppImage (`/tmp/.mount_<name>XXXXXX`) ist je Lauf neu.
 * Ein Link dorthin stammt also von einem früheren Start dieses Programms und
 * ist beim nächsten Start tot — er gehört uns, nicht einem Fremden.
 */
const APPIMAGE_MOUNT = /(^|\/)\.mount_[^/]+(\/|$)/;

/**
 * Die Datei, die DSH bei JEDEM Start in den Profilordner schreibt
 * (`prepareProfile` in @deepseek-ai/dsh: `writeFileSync(join(profile.dir, …))`).
 * Sie muss im Home eine echte Datei sein, sonst scheitert der Start auf einer
 * schreibgeschützten Quelle (AppImage-Mount, /opt) mit EROFS/EACCES.
 */
const DSH_REWRITES = 'cordis.yml';

/** Was aus dem Arbeitsbaum ins Home zeigt: Verzeichnisse und Dateien. */
const LINKS = [
  { name: 'profiles', kind: 'dir', what: 'das Profil (DSH liest `$DSH_HOME/profiles/<name>`)' },
  { name: 'sessions', kind: 'dir', what: 'die Sitzungen (Verlauf bleibt sichtbar)' },
  { name: 'logs', kind: 'dir', what: 'die Protokolle' },
  { name: '.env', kind: 'file', what: 'der Arbeitsschlüssel' },
  { name: '.credentials.yaml', kind: 'file', what: 'die Zugangsdateien' },
];

/** Der Link-Typ je Plattform: Windows braucht für Verzeichnisse `junction`. */
function linkType(kind, platform = process.platform) {
  if (platform !== 'win32') return kind === 'dir' ? 'dir' : 'file';
  return kind === 'dir' ? 'junction' : 'file';
}

/** Das Ziel eines vorhandenen Links, oder null, wenn es kein Link ist. */
function linkTarget(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isSymbolicLink()) return null;
    return resolve(dirname(path), readlinkSync(path));
  } catch {
    return null;
  }
}

/** Existiert der Pfad als Eintrag — auch als toter Link? */
function present(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Ist das Verzeichnis beschreibbar? Ein Mount oder /opt meldet hier nein. */
export function writableDir(path) {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Das Home vorbereiten: Ordner anlegen, die deklarierten Pfade verlinken.
 *
 * @param {string} home - das DSH-Home (wird angelegt).
 * @param {string} source - der Arbeitsbaum, aus dem geseedet wird.
 * @param {{ isWritable?: (path: string) => boolean }} [options] - Schreibprüfung
 *   der Quelle; Vorgabe: der echte Zugriff. Tests setzen sie, um eine
 *   schreibgeschützte Quelle zu simulieren.
 * @returns {{ created: string[], kept: string[], issues: string[] }}
 *   `created`/`kept` sind Meldungen für den Start, `issues` blockieren ihn.
 */
export function seedDshHome(home, source, { isWritable = writableDir } = {}) {
  const state = { created: [], kept: [], issues: [] };
  if (typeof home !== 'string' || home === '' || typeof source !== 'string' || source === '') {
    return { ...state, issues: ['seedDshHome: Home und Quelle müssen benannt sein'] };
  }
  if (resolve(home) === resolve(source)) {
    return { ...state, issues: [`seedDshHome: ${home} ist der Arbeitsbaum selbst — das Home muss getrennt liegen`] };
  }
  try {
    mkdirSync(home, { recursive: true });
  } catch (error) {
    return { ...state, issues: [`seedDshHome: ${home} nicht anlegbar (${error.message})`] };
  }

  for (const link of LINKS) {
    const target = join(source, link.name);
    const path = join(home, link.name);
    if (!existsSync(target)) continue; // frischer Klon: nichts zu zeigen, kein Befund
    if (link.name === 'profiles' && !isWritable(target)) {
      seedWritableProfiles(home, source, state);
      continue;
    }
    const current = linkTarget(path);
    if (current !== null) {
      if (current === resolve(target)) {
        state.kept.push(link.name);
      } else if (APPIMAGE_MOUNT.test(current)) {
        // Veralteter Link eines früheren AppImage-Starts: auf den Lauf umhängen.
        unlinkSync(path);
        symlinkSync(target, path, linkType(link.kind));
        state.created.push(link.name);
      } else state.issues.push(`${path} zeigt auf ${current} statt auf ${target} — ${link.what} wäre sonst falsch; bitte von Hand entfernen`);
      continue;
    }
    if (present(path)) {
      state.issues.push(`${path} ist keine Verknüpfung, sondern ein eigener Eintrag — ${link.what} läge dann doppelt; bitte von Hand entfernen`);
      continue;
    }
    try {
      symlinkSync(target, path, linkType(link.kind));
      state.created.push(link.name);
    } catch (error) {
      state.issues.push(`${path} nicht verlinkbar (${error.message}) — ${link.what}`);
    }
  }
  return state;
}

/**
 * Die Profile aus einer SCHREIBGESCHÜTZTEN Quelle ins Home: pro Profil ein
 * eigener, beschreibbarer Ordner, dessen Einträge Verknüpfungen auf die Quelle
 * sind. Ausnahme ist `DSH_REWRITES` — die wird als Kopie angelegt, weil DSH sie
 * ohnehin überschreibt. Ein Link auf den Quell-Ordner selbst wäre hier falsch.
 */
function seedWritableProfiles(home, source, state) {
  const root = join(home, 'profiles');
  const sourceRoot = join(source, 'profiles');
  let changed = false;

  // Ein Link auf den Quell-Ordner (oder ein totes Mount) wird durch einen Ordner ersetzt.
  const rootLink = linkTarget(root);
  if (rootLink !== null) {
    if (rootLink !== resolve(sourceRoot) && !APPIMAGE_MOUNT.test(rootLink)) {
      state.issues.push(`${root} zeigt auf ${rootLink} statt auf ${sourceRoot} — das Profil wäre sonst falsch; bitte von Hand entfernen`);
      return;
    }
    unlinkSync(root);
    changed = true;
  }
  mkdirSync(root, { recursive: true });

  for (const profile of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!profile.isDirectory()) continue;
    const from = join(sourceRoot, profile.name);
    const to = join(root, profile.name);
    const profileLink = linkTarget(to);
    if (profileLink !== null) {
      if (profileLink !== resolve(from) && !APPIMAGE_MOUNT.test(profileLink)) {
        state.issues.push(`${to} zeigt auf ${profileLink} statt auf ${from} — das Profil wäre sonst falsch; bitte von Hand entfernen`);
        continue;
      }
      unlinkSync(to);
      changed = true;
    }
    mkdirSync(to, { recursive: true });

    for (const entry of readdirSync(from)) {
      const src = join(from, entry);
      const dst = join(to, entry);
      const current = linkTarget(dst);
      if (current !== null && current === resolve(src)) continue;
      if (current !== null && APPIMAGE_MOUNT.test(current)) {
        unlinkSync(dst);
      } else if (present(dst) && !(entry === DSH_REWRITES && lstatSync(dst).isFile())) {
        state.issues.push(`${dst} ist ein eigener Eintrag bzw. zeigt woandershin — das Profil wäre sonst falsch; bitte von Hand entfernen`);
        continue;
      } else if (present(dst)) {
        continue; // die eigene Kopie von cordis.yml bleibt
      }
      if (entry === DSH_REWRITES) copyFileSync(src, dst);
      else symlinkSync(src, dst);
      changed = true;
    }
  }
  (changed ? state.created : state.kept).push('profiles');
}
