/**
 * scripts/lib/dsh-home.mjs — das DSH-Home aus dem Arbeitsbaum SEEDEN.
 *
 * `$DSH_HOME/AGENTS.md` ist bei DSH die benutzerglobale Anweisungsdatei und lief
 * mit dem Repo als Home in JEDER fremden Sitzung mit (gemessen 2026-10-17). Hier
 * wird das getrennte Home aus dem Baum gefüllt: Profil, Sitzungen, Schlüssel.
 * Dieselbe Regel wie `profile-links`: ein FEHLENDER Link ist kein Befund, ein
 * vorhandener, der woandershin zeigt, ist einer — und wird nie überschrieben.
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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

/**
 * Das Home vorbereiten: Ordner anlegen, die deklarierten Pfade verlinken.
 *
 * @param {string} home - das DSH-Home (wird angelegt).
 * @param {string} source - der Arbeitsbaum, aus dem geseedet wird.
 * @returns {{ created: string[], kept: string[], issues: string[] }}
 *   `created`/`kept` sind Meldungen für den Start, `issues` blockieren ihn.
 */
export function seedDshHome(home, source) {
  const created = [];
  const kept = [];
  const issues = [];
  if (typeof home !== 'string' || home === '' || typeof source !== 'string' || source === '') {
    return { created, kept, issues: ['seedDshHome: Home und Quelle müssen benannt sein'] };
  }
  if (resolve(home) === resolve(source)) {
    return { created, kept, issues: [`seedDshHome: ${home} ist der Arbeitsbaum selbst — das Home muss getrennt liegen`] };
  }
  try {
    mkdirSync(home, { recursive: true });
  } catch (error) {
    return { created, kept, issues: [`seedDshHome: ${home} nicht anlegbar (${error.message})`] };
  }

  for (const link of LINKS) {
    const target = join(source, link.name);
    const path = join(home, link.name);
    if (!existsSync(target)) continue; // frischer Klon: nichts zu zeigen, kein Befund
    const current = linkTarget(path);
    if (current !== null) {
      if (current === resolve(target)) kept.push(link.name);
      else issues.push(`${path} zeigt auf ${current} statt auf ${target} — ${link.what} wäre sonst falsch; bitte von Hand entfernen`);
      continue;
    }
    if (existsSync(path)) {
      issues.push(`${path} ist keine Verknüpfung, sondern ein eigener Eintrag — ${link.what} läge dann doppelt; bitte von Hand entfernen`);
      continue;
    }
    try {
      symlinkSync(target, path, linkType(link.kind));
      created.push(link.name);
    } catch (error) {
      issues.push(`${path} nicht verlinkbar (${error.message}) — ${link.what}`);
    }
  }
  return { created, kept, issues };
}
