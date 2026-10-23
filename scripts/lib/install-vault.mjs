/**
 * install-vault.mjs — Eigentümer: der Tresor der Zugangsdateien.
 *
 * Ein Installat trägt `.env` und Zugangsdateien. Wer es entfernt, sichert sie
 * vorher in einen Tresor (Modus 0600) und setzt sie bei der nächsten
 * Installation zurück, ohne Vorhandenes zu überschreiben. Meldet Namen, nie
 * Werte.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as paths from './paths.mjs';
import { readVault, restoreSecrets } from './secrets.mjs';

/** Den Tresor an EINE Config binden; der Zustand kommt von `install-state`. */
export function createVault(env, { readState }) {
  /** Ziel des Tresors: `--export-secrets`, sonst ein fester Ort im Zustand. */
  function vaultTarget() {
    return resolve(env.flag('export-secrets', join(paths.stateDir(), 'secrets-backup.json')));
  }
  
  /**
   * Setzt einen vorhandenen Tresor in das (neue) Installat zurück. Vorhandene
   * Dateien bleiben unberührt — ein neuerer Schlüssel gewinnt gegen ein älteres
   * Backup. Meldet nur Namen, nie Werte.
   */
  function restoreSecretsIfAvailable() {
    const state = readState();
    const candidates = [state?.secretsVault, join(paths.stateDir(), 'secrets-backup.json')].filter(Boolean);
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      let vault;
      try {
        vault = readVault(file);
      } catch (error) {
        env.warn(`Tresor ${file} nicht lesbar: ${error.message}`);
        return;
      }
      if (vault === null) return;
      const { restored, skipped } = restoreSecrets(env.prefix, vault);
      if (restored.length > 0) env.say(`   🔐 Zugangsdateien wiederhergestellt: ${restored.join(', ')}`);
      if (skipped.length > 0) env.say(`   🔐 bereits vorhanden, unberührt: ${skipped.join(', ')}`);
      return;
    }
  }
  return { vaultTarget, restoreSecretsIfAvailable };
}
