/**
 * secrets.mjs — Export und Wiederherstellung der Zugangsdateien eines Installats.
 *
 * Warum es diese Datei gibt: eine Deinstallation, die `.env` mitlöscht, kostet den
 * Arbeits-Schlüssel, und jede Wiederinstallation beginnt bei Null. Der Tresor trennt
 * beides: die Dateien gehen in EINE Datei mit Modus 0600, die Wiederherstellung
 * setzt sie zurück, ohne je einen vorhandenen Wert zu überschreiben.
 *
 * Ein Tresor nennt nur DATEINAMEN und Bytes, nie Werte. Ein Bericht über den
 * Tresor ist damit teilbar; der Inhalt ist es nicht.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Die Zugangsdateien, die ein Installat tragen kann (Reihenfolge = Wiederherstellung). */
export const SECRET_NAMES = ['.env', '.env.local', '.credentials.yaml'];

/**
 * Die Schluessel, deren ANWESENHEIT gemeldet wird — nie deren Wert.
 *
 * Der Name steht hier und nicht im Doctor, weil ihn zwei Leser brauchen: die
 * Diagnose (`scripts/doctor.mjs`) und der Startbericht (`bin/shinon.mjs
 * --check`). Zwei Listen waeren zwei Antworten auf dieselbe Frage.
 */
export const PRESENCE_KEYS = ['AGNES_API_KEY', 'PROMPTER_API_KEY'];

/**
 * Die Schlüsselnamen aus dem Zugangsspeicher von DSH (`$DSH_HOME/.credentials.yaml`).
 *
 * WARUM DIESE DRITTE QUELLE: `.env` in diesem Repo ist eine VORLAGE — sie
 * deklariert die Namen mit leeren Werten. Der Schlüssel, mit dem der Start
 * wirklich läuft, liegt im Zugangsspeicher des DSH-Homes unter `refs:`; DSH
 * löst `apiKeyEnv` beim Request dagegen auf. Ein Bericht, der nur Umgebung und
 * `.env` liest, meldet dort "fehlt", wo der Start längst einen Schlüssel hat.
 *
 * Gelesen werden NUR die Namen unter `refs:` (zwei Leerzeichen Einrückung,
 * Schlüssel vor dem Doppelpunkt). Der Wert erscheint in dieser Datei nirgends:
 * kein Rückgabewert, keine Länge, kein Präfix.
 */
export function credentialNames(file) {
  const names = new Set();
  if (typeof file !== 'string' || file === '' || !existsSync(file)) return names;
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return names;
  }
  let inRefs = false;
  for (const raw of text.split(String.fromCharCode(10))) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    if (indent === 0) {
      inRefs = /^refs\s*:/.test(raw.trim());
      continue;
    }
    if (!inRefs || indent !== 2) continue;
    const match = /^\s{2}([A-Za-z0-9_./-]+)\s*:\s*(.*)$/.exec(raw);
    if (match === null) continue;
    // Ein leerer Wert ist kein Schlüssel — dieselbe Regel wie in `envNames`.
    if (match[2].replace(/^(['"])(.*)\1$/, '$2').trim() !== '') names.add(match[1]);
  }
  return names;
}

/**
 * Die Anwesenheit je Schlüsselname, aus DREI Quellen — ohne einen Wert zu lesen.
 *
 * Reihenfolge = Nähe zum Prozess: exportierte Umgebung, dann die Datei, die
 * `dsh` beim Start selbst liest, dann der Zugangsspeicher des Homes. Zurück
 * kommt je Name `present` plus die QUELLE (`env`, `env-file`, `credentials`);
 * der Wert verlässt diese Datei nie.
 */
export function keyPresence(env = process.env, file = null, credentialsFile = null) {
  const names = envNames(file);
  const refs = credentialNames(credentialsFile);
  const out = {};
  for (const name of PRESENCE_KEYS) {
    const raw = env[name];
    const fromEnv = typeof raw === 'string' && raw.trim() !== '';
    const fromFile = names.has(name);
    const fromStore = refs.has(name);
    out[name] = {
      present: fromEnv || fromFile || fromStore,
      source: fromEnv ? 'env' : fromFile ? 'env-file' : fromStore ? 'credentials' : null,
    };
  }
  return out;
}

/**
 * Die NAMEN, die eine Zugangsdatei setzt — keine Werte, keine Laengen.
 *
 * WARUM ES DIESE FUNKTION GIBT: `dsh` liest `.env` beim Start selbst, und der
 * Startseeder verlinkt die Datei ins DSH-Home (`scripts/lib/dsh-home.mjs`). Ein
 * Bericht, der nur `process.env` liest, sagt deshalb "fehlt", waehrend der
 * Start den Schluessel sehr wohl bekommt — die falsche Antwort auf die Frage,
 * ob ein Modell-Turn moeglich ist. Gelesen wird ausschliesslich der Teil vor
 * dem `=`: derselbe Vertrag wie beim Tresor (Namen und Bytes, nie Inhalte).
 *
 * Eine Zeile ohne `NAME=` (Kommentar, Leerzeile, fremde Syntax) wird
 * uebersprungen; `export NAME=…` ist erlaubt, weil Shell-Nutzer es schreiben.
 * Ein LEERER Wert zaehlt nicht: `NAME=` ist derselbe Fall wie eine fehlende
 * Variable (DSH und `dsh` behandeln ihn so). Ob der Wert leer ist, wird dabei
 * geprueft, aber nicht weitergegeben — die Funktion gibt nur Namen zurueck.
 * Fehlende oder unlesbare Datei ist kein Fehler, sondern eine leere Menge.
 */
export function envNames(file) {
  const names = new Set();
  if (typeof file !== 'string' || file === '' || !existsSync(file)) return names;
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return names;
  }
  for (const raw of text.split(String.fromCharCode(10))) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    if (value !== '') names.add(match[1]);
  }
  return names;
}

export const VAULT_KIND = 'shinon.secrets/v1';
const VAULT_VERSION = 1;

/** Liegt dort eine Zugangsdatei mit Inhalt? */
const present = (file) => existsSync(file) && statSync(file).isFile() && statSync(file).size > 0;

/**
 * Die vorhandenen Zugangsdateien aus einem Verzeichnis, als `{ Name: Inhalt }`.
 * Ein fehlender Name ist kein Fehler — ein Installat ohne `.env` ist gültig.
 */
export function collectSecrets(dir) {
  const files = {};
  for (const name of SECRET_NAMES) {
    const file = join(dir, name);
    if (!present(file)) continue;
    files[name] = readFileSync(file, 'utf8');
  }
  return files;
}

/** Eine lesbare Beschreibung ohne Werte: Name und Bytes. */
export function describeSecrets(files) {
  return Object.entries(files).map(([name, text]) => `${name} (${Buffer.byteLength(text, 'utf8')} B)`);
}

/** Schreibt den Tresor mit Modus 0600; gibt den Pfad zurück. */
export function writeVault(target, { source, files, now = new Date() }) {
  mkdirSync(dirname(target), { recursive: true });
  const body = {
    schemaVersion: VAULT_VERSION,
    kind: VAULT_KIND,
    exportedAt: now.toISOString(),
    source,
    files,
  };
  writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  chmodSync(target, 0o600);
  return target;
}

/** Liest und prüft einen Tresor; `null` bei fehlender Datei, Fehler bei fremdem Inhalt. */
export function readVault(file) {
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (parsed?.kind !== VAULT_KIND) throw new Error(`${file}: kein ${VAULT_KIND}`);
  if (parsed.schemaVersion !== VAULT_VERSION) throw new Error(`${file}: unbekannte Fassung ${parsed.schemaVersion}`);
  if (typeof parsed.files !== 'object' || parsed.files === null) throw new Error(`${file}: files fehlt`);
  const files = {};
  for (const [name, text] of Object.entries(parsed.files)) {
    if (!SECRET_NAMES.includes(name)) throw new Error(`${file}: unbekannter Eintrag "${name}"`);
    if (typeof text !== 'string') throw new Error(`${file}: Eintrag "${name}" ist kein Text`);
    files[name] = text;
  }
  return { ...parsed, files };
}

/**
 * Setzt die Zugangsdateien zurück. Vorhandene Dateien bleiben UNANGETASTET (ein
 * neuerer Schlüssel wird nie von einem älteren Backup überschrieben) und stehen im
 * Ergebnis unter `skipped`.
 */
export function restoreSecrets(dir, vault) {
  const restored = [];
  const skipped = [];
  for (const [name, text] of Object.entries(vault.files ?? {})) {
    const target = join(dir, name);
    if (existsSync(target)) { skipped.push(name); continue; }
    writeFileSync(target, text, { mode: 0o600 });
    chmodSync(target, 0o600);
    restored.push(name);
  }
  return { restored, skipped };
}
