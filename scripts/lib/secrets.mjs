/**
 * secrets.mjs — Export und Wiederherstellung der Zugangsdateien eines Installats.
 *
 * Warum es diese Datei gibt: eine Deinstallation, die `.env` mitlöscht, kostet den
 * Arbeits-Schlüssel, und jede Wiederinstallation beginnt bei Null. Der Tresor trennt
 * beides: die Dateien gehen in EINE Datei mit Modus 0600, die Wiederherstellung
 * setzt sie zurück, ohne je einen vorhandenen Wert zu überschreiben.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-6853494eb81f
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Die Zugangsdateien, die ein Installat tragen kann (Reihenfolge = Wiederherstellung). */
export const SECRET_NAMES = ['.env', '.env.local', '.credentials.yaml'];

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
