/**
 * scripts/lib/dsh-home.mjs — das DSH-Home aus dem Arbeitsbaum SEEDEN.
 *
 * `$DSH_HOME/AGENTS.md` ist bei DSH die benutzerglobale Anweisungsdatei und lief
 * mit dem Repo als Home in JEDER fremden Sitzung mit (gemessen 2026-10-17). Hier
 * wird das getrennte Home aus dem Baum gefüllt: Profil, Sitzungen, Schlüssel.
 * Dieselbe Regel wie `profile-links`: ein FEHLENDER Link ist kein Befund, ein
 * vorhandener, der woandershin zeigt, ist einer — und wird nie überschrieben.
 *
 * Zwei Regeln, die zusammengehören:
 *   1. Ein fremder Link (etwa in ein Verzeichnis des Benutzers) wird gemeldet
 *      und NICHT überschrieben.
 *   2. Ein Link, der in einen QUELLBAUM dieses Programms zeigt, ist OURS: der
 *      Seeder hat ihn für einen früheren Lauf gesetzt. Das Home ist zwischen
 *      Installationen geteilt — AppImage-Mount, /opt-Installat, Arbeitsbaum
 *      sind drei Quellen für dasselbe Home. Wer die Quelle wechselt, muss das
 *      Home umhängen dürfen; sonst bleibt der Start auf einem toten oder
 *      falschen Pfad stehen (gemessen 2026-10-21: der Start des AppImage
 *      scheiterte an Links, die ein früherer .deb-Lauf hinterlassen hatte).
 */
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isInside } from './paths.mjs';

/**
 * Der Mount-Pfad eines AppImage (`/tmp/.mount_<name>XXXXXX`) ist je Lauf neu.
 * Ein Link dorthin stammt also von einem früheren Start dieses Programms und
 * ist beim nächsten Start tot — er gehört uns, nicht einem Fremden.
 */
const APPIMAGE_MOUNT = /(^|\/)\.mount_[^/]+(\/|$)/;

/**
 * Die Dateien, die dem HOME gehören, nicht der Quelle.
 *
 * `cordis.yml` schreibt DSH bei JEDEM Start (`prepareProfile` in
 * @deepseek-ai/dsh: `writeFileSync(join(profile.dir, …))`). `cordis.patch.yml`
 * schreibt der `config-editor` der UI — die Modellwahl des Benutzers landet
 * dort (gemessen 2026-10-21: `provider: openrouter` stand in der Datei des
 * Homes, nicht in der der Quelle).
 *
 * Beide müssen im Home ECHTE Dateien sein: ein Link dorthin trägt den
 * Schreibzugriff in den Quellbaum — bei einem gepackten Build (AppImage,
 * /opt) scheitert er mit EROFS, im Entwicklerbaum schreibt er in die
 * versionierte Datei des Repos. Und weil DSH schreibt, darf der Seeder sie
 * auch nicht als „fremder Eintrag" melden.
 */
const DSH_REWRITES = 'cordis.yml';
const PROFILE_LAYER = 'cordis.patch.yml';

/**
 * Der Stempel im Home: aus welchem Quellbaum es zuletzt gefüllt wurde.
 *
 * Er beantwortet die Eigentumsfrage auch dann, wenn der alte Quellbaum nicht
 * mehr existiert (abgeräumtes /opt-Installat, alter Mount): einen toten Pfad
 * kann man nicht ansehen, einen Stempel schon.
 */
const SOURCE_STAMP = '.shinon-source.json';

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
 * Trägt der Ordner `profiles/<name>/cordis.patch.yml`?
 *
 * Das ist die FORM eines Quellbaums dieses Programms — sie unterscheidet
 * Arbeitsbaum, AppImage-Mount und /opt-Installat von einem fremden Verzeichnis,
 * das einem Benutzer gehört.
 */
function looksLikeSourceTree(dir) {
  const profiles = join(dir, 'profiles');
  if (!existsSync(profiles)) return false;
  try {
    return readdirSync(profiles, { withFileTypes: true })
      .some((entry) => entry.isDirectory() && existsSync(join(profiles, entry.name, 'cordis.patch.yml')));
  } catch {
    return false;
  }
}

/**
 * Der Quellbaum, in den ein Pfad zeigt — oder null.
 *
 * Der Pfad selbst kann ein EINTRAG sein (der Link zeigt auf `package.json`),
 * deshalb wird die Kette der Vorfahren geprüft.
 */
function sourceTreeOf(path) {
  let dir = resolve(path);
  for (;;) {
    if (looksLikeSourceTree(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Gehört der Linktarget uns?
 *
 * "Uns" heißt: der Seeder hat ihn für einen früheren Lauf gesetzt. Vier
 * Merkmale sagen das:
 *   1. er zeigt in den aktuellen Quellbaum,
 *   2. er zeigt in einen anderen lebenden Quellbaum (an seiner FORM erkannt),
 *   3. er zeigt in einen AppImage-Mount — auch einen toten, denn der Mount-Pfad
 *      ändert sich bei jedem Start,
 *   4. er zeigt unter den Quellbaum, den der Stempel im Home nennt.
 * Alles andere ist fremd: gemeldet, nie überschrieben.
 */
function isOurs(target, source, stamped) {
  const path = resolve(target);
  if (isInside(resolve(source), path)) return true;
  if (APPIMAGE_MOUNT.test(path)) return true;
  if (stamped !== null && isInside(resolve(stamped), path)) return true;
  return sourceTreeOf(path) !== null;
}

/** Der zuletzt geseedete Quellbaum — oder null, wenn das Home keinen Stempel trägt. */
function readStamp(home) {
  try {
    const raw = JSON.parse(readFileSync(join(home, SOURCE_STAMP), 'utf8'));
    return typeof raw?.source === 'string' ? raw.source : null;
  } catch {
    return null;
  }
}

/** Den Stempel schreiben — der Grund, warum das Home sich selbst heilt. */
function writeStamp(home, source) {
  try {
    writeFileSync(join(home, SOURCE_STAMP), `${JSON.stringify({
      source: resolve(source),
      seededAt: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8');
  } catch {
    // Der Stempel ist eine Bequemlichkeit, kein Pflichtbestandteil: sein Fehlen
    // kostet die Selbstheilung über einen TOTEN Quellbaum, nicht den Start.
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

  const stamped = readStamp(home);

  for (const link of LINKS) {
    const target = join(source, link.name);
    const path = join(home, link.name);
    if (!existsSync(target)) continue; // frischer Klon: nichts zu zeigen, kein Befund
    if (link.name === 'profiles' && !isWritable(target)) {
      seedWritableProfiles(home, source, state, stamped);
      continue;
    }
    const current = linkTarget(path);
    if (current !== null) {
      if (current === resolve(target)) {
        state.kept.push(link.name);
      } else if (isOurs(current, source, stamped)) {
        // Ein alter Quellbaum (Mount, /opt-Installat, Arbeitsbaum): der Link ist
        // UNSERER und wird auf die aktuelle Quelle umgehängt.
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
  if (state.issues.length === 0) writeStamp(home, source);
  return state;
}

/**
 * Die Profile aus einer SCHREIBGESCHÜTZTEN Quelle ins Home: pro Profil ein
 * eigener, beschreibbarer Ordner, dessen Einträge Verknüpfungen auf die Quelle
 * sind. Ausnahme ist `DSH_REWRITES` — die wird als Kopie angelegt, weil DSH sie
 * ohnehin überschreibt. Ein Link auf den Quell-Ordner selbst wäre hier falsch.
 */
function seedWritableProfiles(home, source, state, stamped) {
  const root = join(home, 'profiles');
  const sourceRoot = join(source, 'profiles');
  let changed = false;

  // Ein Link auf einen Quellbaum (auch einen toten Mount) wird durch einen
  // eigenen Ordner ersetzt: die Quelle ist schreibgeschützt, und ein Link
  // dorthin kann DSHs Schreibzugriff auf `cordis.yml` nicht tragen.
  const rootLink = linkTarget(root);
  if (rootLink !== null) {
    if (!isOurs(rootLink, source, stamped)) {
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
      if (!isOurs(profileLink, source, stamped)) {
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
      // Die Profilschicht gehört dem HOME: DSH schreibt sie. Sie wird als
      // Kopie angelegt (nie als Link) und, wenn sie schon existiert, in
      // Ruhe gelassen — dort steht die Modellwahl des Benutzers.
      if (entry === DSH_REWRITES || entry === PROFILE_LAYER) {
        const current = linkTarget(dst);
        if (current !== null) {
          unlinkSync(dst); // ein Link dorthin würde den Schreibzugriff in die Quelle tragen
          changed = true;
        } else if (present(dst)) {
          continue; // die eigene Datei bleibt (DSH und der Benutzer schreiben hier)
        }
        copyFileSync(src, dst);
        changed = true;
        continue;
      }
      const current = linkTarget(dst);
      if (current !== null) {
        if (current === resolve(src)) continue; // zeigt schon auf die Quelle
        if (!isOurs(current, source, stamped)) {
          state.issues.push(`${dst} zeigt auf ${current} statt auf ${src} — das Profil wäre sonst falsch; bitte von Hand entfernen`);
          continue;
        }
        // Ein alter Quellbaum: der Link ist UNSERER und wird umgehängt.
        unlinkSync(dst);
      } else if (present(dst)) {
        state.issues.push(`${dst} ist ein eigener Eintrag — das Profil wäre sonst falsch; bitte von Hand entfernen`);
        continue;
      }
      symlinkSync(src, dst);
      changed = true;
    }
  }
  (changed ? state.created : state.kept).push('profiles');
}
