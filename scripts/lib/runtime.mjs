/**
 * runtime.mjs — die EINE Auflösung der Node-Laufzeit, geprüft statt angenommen.
 *
 * Warum es diese Datei gibt: `goodNode()` in dsh.mjs akzeptierte jede laufende
 * Hauptversion ≥ 22. Damit war Node 23 zulässig (obwohl `engines` es nicht
 * erlaubt) und Node 22.0–22.18 ebenso (obwohl `^22.19.0` erst ab 22.19 gilt) —
 * und `node:sqlite` fehlt in zu alten Fassungen ganz, sodass der Fehler nicht
 * hier, sondern tief im Index auftrat. Außerdem standen zwei Heimpfade fest im
 * Code (`~/.local/opt/node-v22.23.3-…`, `~/.nvm/…/v24.21.0`): auf einem anderen
 * Rechner ist das keine Auflösung, sondern eine Behauptung.
 *
 * DIE RANGE IST EINE QUELLE: `engines.node` im Root-Manifest. Dieses Modul
 * liest sie und schreibt keine zweite Liste — wer die unterstützte Fassung
 * ändert, ändert sie dort. Die exakte Fassung, mit der dieses Repo gemessen ist,
 * steht weiterhin in der Zahlendatei (`docs/ZAHLEN.md` §1) und NICHT als zweite
 * Konstante im Code.
 *
 * Ein Kandidat gilt nur, wenn er ZWEI Proben besteht:
 *   1. `--version` passt zur Range (nicht nur die Hauptversion),
 *   2. der `node:sqlite`-Rauchtest: DatabaseSync(':memory:'), `select 1`, close.
 * Netz und Modellschlüssel sind dafür nicht nötig.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { WORKSPACE_ROOT } from './paths.mjs';

/** Der Rauchtest des SQLite-Builtins — als Quelltext, damit er im Kindprozess läuft. */
export const SQLITE_SMOKE = [
  "import { DatabaseSync } from 'node:sqlite';",
  "const db = new DatabaseSync(':memory:');",
  "const row = db.prepare('select 1 as n').get();",
  "db.close();",
  "if (row.n !== 1) throw new Error('select 1 lieferte ' + String(row.n));",
  "console.log(JSON.stringify({ sqlite: process.versions.sqlite ?? null }));",
].join('\n');

/** Die unterstützte Node-Range aus dem Root-Manifest (`engines.node`). */
export function engineRange(root = WORKSPACE_ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const range = manifest?.engines?.node;
  if (typeof range !== 'string' || range.trim() === '') {
    throw new Error(`engines.node fehlt im Root-Manifest (${join(root, 'package.json')}) — ohne Range ist keine Runtime prüfbar`);
  }
  return range.trim();
}

/** `1.2.3` oder `1.2.3-pre` zerlegen (`null` bei unbekannter Form). */
export function parseSemver(version) {
  const found = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(version ?? '').trim());
  if (found === null) return null;
  return { major: Number(found[1]), minor: Number(found[2]), patch: Number(found[3]), pre: found[4] ?? null };
}

/**
 * Semver-Vergleich (-1/0/1): Kern zuerst, dann Release > Prerelease,
 * Prerelease-Teile numerisch gegen numerisch, Zahl < Text (Semver §11).
 */
export function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (a === null || b === null) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  const partsA = a.pre.split('.');
  const partsB = b.pre.split('.');
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    if (partsA[i] === undefined) return -1;
    if (partsB[i] === undefined) return 1;
    const numA = /^\d+$/.test(partsA[i]) ? Number(partsA[i]) : null;
    const numB = /^\d+$/.test(partsB[i]) ? Number(partsB[i]) : null;
    if (numA !== null && numB !== null && numA !== numB) return numA < numB ? -1 : 1;
    if ((numA === null) !== (numB === null)) return numA === null ? 1 : -1;
    if (partsA[i] !== partsB[i]) return partsA[i] < partsB[i] ? -1 : 1;
  }
  return 0;
}

/** Obergrenze einer Tilde-Range: gleicher Major/Minor, naechster Minor. */
function tildeCeiling(base) {
  return `${base.major}.${base.minor + 1}.0`;
}

/** Obergrenze einer Caret-Range (0.x zaehlt wie npm: 0.b.c bindet den Minor). */
function caretCeiling(base) {
  if (base.major > 0) return `${base.major + 1}.0.0`;
  if (base.minor > 0) return `0.${base.minor + 1}.0`;
  return `0.0.${base.patch + 1}`;
}

/**
 * Prüft EINE Range gegen EINE Fassung. Unterstützt genau die Formen, die in
 * diesem Repo vorkommen: exakt, `~`, `^`, `>=`, `>`, `<=`, `<`, `*` und
 * `||`-Alternativen. Prerelease-Regel wie npm: eine Vorabfassung erfüllt nur
 * eine Range, die selbst eine Vorabfassung desselben Kerns nennt.
 */
export function satisfiesRange(range, version) {
  const wanted = parseSemver(version);
  if (wanted === null) return false;
  const text = String(range ?? '').trim();
  if (text === '' || text === 'latest') return false;
  if (text === '*') return wanted.pre === null;

  const alternatives = text.split('||').map((part) => part.trim()).filter((part) => part !== '');
  if (alternatives.length === 0) return false;

  const prereleaseAllowed = (part) => {
    const base = parseSemver(part.replace(/^[~^]=?/, '').replace(/^(>=|<=|>|<|=)\s*/, ''));
    return base !== null && base.pre !== null
      && base.major === wanted.major && base.minor === wanted.minor && base.patch === wanted.patch;
  };

  return alternatives.some((part) => {
    if (wanted.pre !== null && !prereleaseAllowed(part)) return false;
    const comparators = part.split(/\s+/).filter((token) => token !== '');
    const compareTo = (bound) => parseSemver(bound) === null ? null : compareSemver(version, bound);
    let ok = true;
    for (const token of comparators) {
      if (token.startsWith('~')) {
        const base = parseSemver(token.slice(1));
        if (base === null) return false;
        ok = ok && compareSemver(version, `${base.major}.${base.minor}.${base.patch}${base.pre === null ? '' : `-${base.pre}`}`) >= 0
          && compareSemver(version, tildeCeiling(base)) < 0;
      } else if (token.startsWith('^')) {
        const base = parseSemver(token.slice(1));
        if (base === null) return false;
        ok = ok && compareSemver(version, `${base.major}.${base.minor}.${base.patch}${base.pre === null ? '' : `-${base.pre}`}`) >= 0
          && compareSemver(version, caretCeiling(base)) < 0;
      } else if (token.startsWith('>=')) {
        const compared = compareTo(token.slice(2).trim());
        if (compared === null) return false;
        ok = ok && compared >= 0;
      } else if (token.startsWith('<=')) {
        const compared = compareTo(token.slice(2).trim());
        if (compared === null) return false;
        ok = ok && compared <= 0;
      } else if (token.startsWith('>')) {
        const compared = compareTo(token.slice(1).trim());
        if (compared === null) return false;
        ok = ok && compared > 0;
      } else if (token.startsWith('<')) {
        const compared = compareTo(token.slice(1).trim());
        if (compared === null) return false;
        ok = ok && compared < 0;
      } else {
        const compared = compareTo(token.replace(/^=/, ''));
        if (compared === null) return false;
        ok = ok && compared === 0;
      }
      if (!ok) return false;
    }
    return ok;
  });
}

/**
 * Die UNTERGRENZE einer Range — die Fassung, die ein mitgeliefertes Node sein
 * MUSS, damit es in der Range liegt.
 *
 * Warum das hier steht und nicht als Zahl im Manifest: `engines.node` ist die
 * eine Quelle der unterstuetzten Fassung. Ein mitgeliefertes Node (im .deb, im
 * Windows-Archiv) muss in diese Range passen, sonst startet der Forge nicht
 * und der Fehler erscheint nicht beim Installieren, sondern beim ersten
 * Klick. Die Untergrenze ist damit die EINZIGE Fassung, die die Range selbst
 * nennt — `22.19.0` fuer `^22.19.0 || >=24.0.0`.
 *
 * Fail-closed: ein Ausdruck, den diese Rechnung nicht versteht, ist ein
 * Fehler und keine geratene Fassung. Das Ergebnis wird gegengeprueft (es
 * muss die Range erfuellen), sonst stimmt die Rechnung nicht.
 * @param {string} range die Range aus `engines.node`
 * @returns {string} die Fassung, z.B. `22.19.0`
 */
export function floorVersion(range) {
  const alternatives = String(range)
    .split('||')
    .map((part) => part.trim().split(/\s+/).filter((term) => term !== ''))
    .filter((terms) => terms.length > 0);
  if (alternatives.length === 0) {
    throw new Error(`floorVersion: die Range "${range}" nennt keine Alternative`);
  }
  const floors = alternatives.map((terms) => {
    let floor = [0, 0, 0];
    for (const term of terms) {
      const match = /^(\^|~|>=|<=|>|<|=)?\s*v?(\d+)\.(\d+)\.(\d+)$/.exec(term.trim());
      if (match === null) {
        throw new Error(`floorVersion: Ausdruck "${term}" in der Range "${range}" ist nicht lesbar — Abbruch statt Raten`);
      }
      const [, operator = '=', major, minor, patch] = match;
      const value = [Number(major), Number(minor), Number(patch)];
      // ">X.Y.Z" heisst: mindestens X.Y.(Z+1). "<" und "<=" nennen keine
      // Untergrenze, lassen die Alternative aber nach unten offen.
      if (operator === '>') value[2] += 1;
      if (compareSemver(value.join('.'), floor.join('.')) > 0) floor = value;
    }
    return floor;
  });
  const lowest = floors.reduce((left, right) => (
    compareSemver(right.join('.'), left.join('.')) < 0 ? right : left
  ));
  const version = lowest.join('.');
  if (!satisfiesRange(range, version)) {
    throw new Error(`floorVersion: die Untergrenze ${version} erfuellt die Range "${range}" nicht — Abbruch`);
  }
  return version;
}

/**
 * Eine Fassung als Daten prüfen: Version UND `node:sqlite`-Rauchtest.
 * @returns {{ ok: boolean, version: string|null, sqlite: string|null, reason: string|null }}
 */
export function verifyRuntime(binary) {
  let version;
  try {
    version = execFileSync(binary, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return { ok: false, version: null, sqlite: null, reason: `--version scheiterte an ${binary}: ${error.message}` };
  }
  let smoke;
  try {
    // Die Experimental-Warnung von node:sqlite steht auf stderr und ist kein Fehler.
    smoke = execFileSync(binary, ['--input-type=module', '-e', SQLITE_SMOKE], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = String(error.stderr ?? error.message ?? '').trim().split('\n')[0];
    return { ok: false, version, sqlite: null, reason: `node:sqlite-Rauchtest scheiterte an ${binary}: ${detail}` };
  }
  // Die Ausgabe ist der BEWEIS des Rauchtests, nicht Beiwerk: ein Binary, das
  // den Code gar nicht ausführt (etwa `/bin/true`), liefert hier nichts und ist
  // damit kein Kandidat — sonst gälte jedes Programm, das 0 zurückgibt.
  let parsed;
  try {
    parsed = JSON.parse(String(smoke).trim().split('\n').pop());
  } catch {
    return { ok: false, version, sqlite: null, reason: `node:sqlite-Rauchtest lieferte keine Auskunft an ${binary}` };
  }
  if (typeof parsed !== 'object' || parsed === null || !('sqlite' in parsed)) {
    return { ok: false, version, sqlite: null, reason: `node:sqlite-Rauchtest lieferte kein Ergebnis an ${binary}` };
  }
  return { ok: true, version, sqlite: parsed.sqlite ?? null, reason: null };
}

/**
 * Node-Binaries aus den üblichen Versionsmanagern — als RÜCKFALL, nicht als
 * feste Wahrheit. Der PATH bleibt die erste Wahl (dort löst mise/nvm/volta
 * bereits auf); diese Liste greift nur, wenn eine Shell mit nacktem `/usr/bin`
 * startet und der PATH deshalb kein ≥ 22 kennt. Die Versionen werden ABSTEIGEND
 * sortiert, damit „die höchste passende Fassung" deterministisch ist; was die
 * Proben nicht besteht, fällt danach trotzdem raus (`verifyRuntime`).
 */
function managedNodeBinaries(env = process.env) {
  const home = typeof env.HOME === 'string' && env.HOME !== '' ? env.HOME : homedir();
  const binary = process.platform === 'win32' ? 'node.exe' : 'node';
  const found = [];
  const current = join(home, '.local', 'opt', 'shinon-forge', 'node', 'current', 'bin', binary);
  if (existsSync(current)) found.push(current);
  const versioned = (base) => {
    if (!existsSync(base)) return [];
    return readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => {
        const a = parseSemver(left);
        const b = parseSemver(right);
        if (a === null || b === null) return right.localeCompare(left);
        return compareSemver(right, left);
      })
      .map((name) => join(base, name, 'bin', binary))
      .filter((path) => existsSync(path));
  };
  found.push(...versioned(join(home, '.local', 'share', 'mise', 'installs', 'node')));
  found.push(...versioned(join(home, '.nvm', 'versions', 'node')));
  return found;
}

/**
 * Kandidaten in fester Reihenfolge — kein fest verdrahteter Heimpfad:
 *   1. `SHINON_NODE` (ausdrücklicher Wunsch, geprüft),
 *   2. der laufende Prozess (`process.execPath`) — meist das Richtige,
 *   3. `node` aus dem PATH (dort löst der Versionsmanager auf: mise, nvm, volta),
 *   4. die Versionsmanager-Verzeichnisse als Rückfall (mise, nvm, das
 *      dokumentierte `~/.local/opt/shinon-forge/node/current`), höchste Fassung
 *      zuerst.
 * Was nicht verifiziert, fällt raus; die Gründe bleiben erhalten.
 */
export function runtimeCandidates(env = process.env) {
  const candidates = [];
  const add = (binary, source) => {
    if (typeof binary === 'string' && binary !== '' && !candidates.some((entry) => entry.binary === binary)) {
      candidates.push({ binary, source });
    }
  };
  // EIN ausdrücklicher Wunsch wird NICHT durch einen Fund ersetzt: wer
  // `SHINON_NODE` setzt, bekommt entweder dieses Binary oder einen Fehler mit
  // Grund. Eine stille Rückkehr auf ein anderes Node wäre genau das, was die
  // Mission „keine stille Rückkehr auf /usr/bin/node" nennt.
  if (typeof env.SHINON_NODE === 'string' && env.SHINON_NODE.trim() !== '') {
    return [{ binary: env.SHINON_NODE.trim(), source: 'SHINON_NODE' }];
  }
  add(process.execPath, 'laufender Prozess');
  for (const part of String(env.PATH ?? '').split(delimiter)) {
    if (part === '') continue;
    const binary = join(part, process.platform === 'win32' ? 'node.exe' : 'node');
    if (existsSync(binary)) add(binary, 'PATH');
  }
  for (const binary of managedNodeBinaries(env)) add(binary, 'Versionsmanager');
  return candidates;
}

/**
 * Die verifizierte Laufzeit. `null` heißt: kein Kandidat bestand die Proben —
 * der Aufrufer meldet dann die Gründe (fail-closed, kein stiller Rückfall auf
 * einen untauglichen `/usr/bin/node`).
 */
/** Merker: die Verifikation kostet zwei Kindprozesse — pro Prozess und Umgebung einmal. */
let cached = null;

/** Den Merker leeren (Tests, die die Umgebung wechseln). */
export function resetRuntimeCache() {
  cached = null;
}

export function resolveRuntime({ env = process.env, root = WORKSPACE_ROOT, range = engineRange(root) } = {}) {
  const key = `${range}|${root}|${env.SHINON_NODE ?? ''}|${env.PATH ?? ''}`;
  if (cached !== null && cached.key === key) return cached.value;
  const value = resolveUncached({ env, root, range });
  cached = { key, value };
  return value;
}

function resolveUncached({ env, root, range }) {
  const tried = [];
  for (const { binary, source } of runtimeCandidates(env)) {
    const probe = verifyRuntime(binary);
    if (!probe.ok) {
      tried.push({ ...probe, binary, source });
      continue;
    }
    if (!satisfiesRange(range, probe.version)) {
      tried.push({ ...probe, ok: false, binary, source, reason: `${probe.version} passt nicht zu engines.node "${range}"` });
      continue;
    }
    return { binary, version: probe.version, sqlite: probe.sqlite, source, range, tried };
  }
  return { binary: null, version: null, sqlite: null, source: null, range, tried };
}

/** Eine lesbare Begründung, wenn kein Kandidat taugt — mit jedem geprüften Pfad. */
export function runtimeFailure(resolved) {
  const lines = [`keine taugliche Node-Laufzeit gefunden (verlangt: ${resolved.range})`];
  if (resolved.tried.length === 0) lines.push('  kein Kandidat geprüft (SHINON_NODE, laufender Prozess, PATH leer?)');
  for (const entry of resolved.tried) {
    lines.push(`  ${entry.binary} (${entry.source}): ${entry.reason}`);
  }
  return lines.join('\n');
}

/**
 * Ein Node-Kindprozess mit dem VERIFIZIERTEN Binary. Eigene Skripte laufen damit
 * nie über einen fremden Interpreter, und `spawn` braucht keinen PATH-Treffer.
 */
export function nodeArgs(resolved, script, args = []) {
  return [resolved.binary, [script, ...args]];
}
