/**
 * desktop-entry.mjs — EINE Quelle fuer die Desktop-Eintraege von Shinon Forge.
 *
 * WARUM EINE EIGENE DATEI: es gab zwei Erzeuger — `scripts/desktop-launcher.mjs`
 * (der Entwicklerbaum) und das Setup (das Nutzer-Installat) — und jeder hatte
 * seine eigene Liste der Ziele, seine eigene Exec-Zeile und seine eigene
 * Ausgabe. Zwei Erzeuger bedeuten: ein Icon, das an der einen Stelle startet
 * und an der anderen in einen fremden Pfad zeigt. Diese Datei ist die eine
 * Regel; die Erzeuger rufen sie auf.
 *
 * WAS EIN EINTRAG TRAGT (und was nicht):
 *   - `Exec` zeigt auf die VERIFIZIERTE Laufzeit und auf das Startskript des
 *     jeweiligen Baums. Nicht auf `process.execPath` des Aufrufers: ein
 *     .desktop-Eintrag ueberlebt den Aufruf, der ihn geschrieben hat.
 *   - `Path` ist das Arbeitsverzeichnis des Baums.
 *   - `Icon` verweist auf das Icon des Baums, wenn es eines gibt.
 *   - `Terminal=false` ist die Zusage: ein Klick startet die App ohne Fenster.
 *
 * DIE ZIELE: das App-Menue (und damit Dock/Pancake) bekommt einen Eintrag, die
 * Desktop-Varianten von Cinnamon einen zweiten. Cinnamon blendet nur Eintraege
 * aus `~/Desktop` oder `~/.config/cinnamon/desktop/` auf dem Schreibtisch ein —
 * beides wird bedient, weil beide Wege in der Wildnis benutzt werden.
 *
 * Alles hier ist dateibasiert und idempotent: dieselbe Eingabe ergibt
 * denselben Text, und ein Schreiben ohne Aenderung wird als "unveraendert"
 * gemeldet, nicht als Erfolg verkleidet.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Die App-Kennung — der Dateiname ohne Endung. */
export const APP_ID = 'shinon-forge';

/** Der sichtbare Name. */
export const APP_NAME = 'Shinon Forge';

/** Die Desktop-Varianten, die den Eintrag auf dem Schreibtisch zeigen. */
export const DESKTOP_FLAVORS = Object.freeze(['cinnamon', 'cinnamon-desktop-icons', 'spices']);

/**
 * Der Text eines .desktop-Eintrags. Die Reihenfolge der Zeilen ist Teil des
 * Vertrags: derselbe Inhalt ergibt denselben Text, damit "unveraendert" eine
 * ehrliche Meldung bleibt.
 * @param {{name?: string, genericName?: string, comment?: string, exec: string, path?: string, icon?: string|null, keywords?: string, extra?: string[]}} spec
 * @returns {string}
 */
export function desktopEntryText(spec) {
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${spec.name ?? APP_NAME}`,
  ];
  if (spec.genericName) lines.push(`GenericName=${spec.genericName}`);
  if (spec.comment) lines.push(`Comment=${spec.comment}`);
  lines.push(`Exec=${spec.exec}`);
  if (spec.path) lines.push(`Path=${spec.path}`);
  lines.push('Terminal=false');
  lines.push('StartupNotify=true');
  if (spec.icon) lines.push(`Icon=${spec.icon}`);
  lines.push('Categories=Development;IDE;');
  lines.push(`Keywords=${spec.keywords ?? 'shinon;dsh;ai;agent;'}`);
  for (const line of spec.extra ?? []) lines.push(line);
  lines.push('');
  return lines.join('\n');
}

/**
 * Die Ziele eines Eintrags: App-Menue/Dock und die Desktop-Varianten.
 * @param {{home?: string, appId?: string}} [options]
 * @returns {{path: string, label: string}[]}
 */
export function desktopTargets(options = {}) {
  const home = options.home ?? homedir();
  const appId = options.appId ?? APP_ID;
  const targets = [{
    path: join(home, '.local', 'share', 'applications', `${appId}.desktop`),
    label: 'App-Menü/Dock',
  }];
  for (const flavor of DESKTOP_FLAVORS) {
    targets.push({
      path: join(home, '.config', flavor, 'desktop', `${appId}.desktop`),
      label: `${flavor}/Desktop`,
    });
  }
  return targets;
}

/**
 * Die Eintraege schreiben. Idempotent: ein unveraenderter Eintrag wird
 * nicht neu geschrieben (und nicht als Neuanlage gemeldet).
 * @param {{content: string, home?: string, appId?: string}} options
 * @returns {{created: string[], updated: string[], unchanged: string[]}}
 */
export function writeDesktopEntries(options) {
  const result = { created: [], updated: [], unchanged: [] };
  for (const target of desktopTargets(options)) {
    mkdirSync(dirname(target.path), { recursive: true });
    const before = existsSync(target.path) ? readFileSync(target.path, 'utf8') : null;
    if (before === options.content) {
      result.unchanged.push(target.path);
      continue;
    }
    writeFileSync(target.path, options.content, 'utf8');
    chmodSync(target.path, 0o755); // .desktop muss ausführbar + trusted sein
    if (before === null) result.created.push(target.path);
    else result.updated.push(target.path);
  }
  return result;
}

/**
 * Die Eintraege entfernen (Deinstallation).
 * @param {{home?: string, appId?: string}} [options]
 * @returns {{removed: string[], missing: string[]}}
 */
export function removeDesktopEntries(options = {}) {
  const result = { removed: [], missing: [] };
  for (const target of desktopTargets(options)) {
    if (!existsSync(target.path)) {
      result.missing.push(target.path);
      continue;
    }
    rmSync(target.path);
    result.removed.push(target.path);
  }
  return result;
}

/**
 * Die Eintraege pruefen: welche fehlen, welche sind veraltet.
 * @param {{content: string, home?: string, appId?: string}} options
 * @returns {{missing: string[], stale: string[], current: string[]}}
 */
export function checkDesktopEntries(options) {
  const result = { missing: [], stale: [], current: [] };
  for (const target of desktopTargets(options)) {
    if (!existsSync(target.path)) {
      result.missing.push(target.path);
      continue;
    }
    if (readFileSync(target.path, 'utf8') === options.content) result.current.push(target.path);
    else result.stale.push(target.path);
  }
  return result;
}

/**
 * Das Desktop-Icon eines INSTALLATS erzeugen — der Schritt, den das Setup
 * nach einer Abnahme macht. Der Einstieg ist der eigene Launcher des Baums
 * (`scripts/desktop-launcher.mjs`): er kennt Laufzeit, Profil und Icon des
 * Installats, in dem er liegt. Diese Funktion startet ihn nur — die Regel
 * fuer den Inhalt bleibt an EINER Stelle (dieser Datei).
 * @param {{prefix: string, node?: string}} options
 * @returns {{written: boolean, reason?: string, output?: string}}
 */
export function writeInstallDesktopIcon(options) {
  const launcher = join(options.prefix, 'scripts', 'desktop-launcher.mjs');
  if (!existsSync(launcher)) return { written: false, reason: `kein Launcher unter ${launcher}` };
  const done = spawnSync(options.node ?? process.execPath, [launcher], { encoding: 'utf8' });
  if (done.status !== 0) {
    return { written: false, reason: `Launcher endete mit Exit ${done.status}`, output: done.stderr ?? '' };
  }
  return { written: true, output: done.stdout ?? '' };
}
