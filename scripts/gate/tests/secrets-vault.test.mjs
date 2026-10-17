#!/usr/bin/env node
/**
 * secrets-vault — der Tresor sichert Zugangsdateien, ohne Werte zu protokollieren,
 * und überschreibt bei der Wiederherstellung nie einen neueren Stand.
 *
 * Warum das ein eigener Test ist: die Deinstallation ist der einzige Weg, auf dem
 * `.env` verschwinden kann. Ein Fehler hier kostet den Schlüssel des Nutzers —
 * und wäre im Log nicht zu sehen, weil Werte dort nie stehen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectSecrets, describeSecrets, readVault, restoreSecrets, writeVault } from '../../lib/secrets.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'shinon-vault-'));

test('collectSecrets nimmt nur vorhandene Zugangsdateien, leere zählen nicht', () => {
  const base = dir();
  writeFileSync(join(base, '.env'), 'AGNES_API_KEY=wert\n');
  writeFileSync(join(base, '.env.local'), '');
  writeFileSync(join(base, 'package.json'), '{}');
  const files = collectSecrets(base);
  assert.deepEqual(Object.keys(files), ['.env'], 'leere Datei und fremde Namen sind keine Secrets');
  assert.equal(files['.env'], 'AGNES_API_KEY=wert\n');
});

test('describeSecrets nennt Namen und Bytes, niemals Werte', () => {
  const lines = describeSecrets({ '.env': 'AGNES_API_KEY=geheim\n' });
  assert.deepEqual(lines, ['.env (21 B)']);
  assert.equal(lines.join(' ').includes('geheim'), false, 'der Wert darf im Bericht nicht auftauchen');
});

test('der Tresor liegt mit Modus 0600 auf der Platte', () => {
  const base = dir();
  const target = join(base, 'nested', 'secrets.json');
  writeVault(target, { source: '/ein/installat', files: { '.env': 'A=1\n' } });
  assert.equal(statSync(target).mode & 0o777, 0o600);
  const vault = readVault(target);
  assert.equal(vault.kind, 'shinon.secrets/v1');
  assert.equal(vault.source, '/ein/installat');
  assert.deepEqual(vault.files, { '.env': 'A=1\n' });
});

test('readVault verweigert fremde Inhalte fail-closed', () => {
  const base = dir();
  const target = join(base, 'fremd.json');
  writeFileSync(target, JSON.stringify({ kind: 'etwas-anderes', schemaVersion: 1, files: {} }));
  assert.throws(() => readVault(target), /kein shinon\.secrets\/v1/);
  writeFileSync(target, JSON.stringify({ kind: 'shinon.secrets/v1', schemaVersion: 1, files: { 'fremd.txt': 'x' } }));
  assert.throws(() => readVault(target), /unbekannter Eintrag/);
  assert.equal(readVault(join(base, 'gibtsnicht.json')), null, 'fehlender Tresor ist kein Fehler');
});

test('die Wiederherstellung setzt fehlende Dateien und lässt vorhandene unberührt', () => {
  const base = dir();
  const target = join(base, 'vault.json');
  writeVault(target, { source: '/alt', files: { '.env': 'ALT=1\n', '.credentials.yaml': 'alt: wahr\n' } });
  writeFileSync(join(base, '.env'), 'NEU=2\n');
  const { restored, skipped } = restoreSecrets(base, readVault(target));
  assert.deepEqual(restored, ['.credentials.yaml'], 'nur das Fehlende kommt zurück');
  assert.deepEqual(skipped, ['.env'], 'der neuere Stand gewinnt');
  assert.equal(readFileSync(join(base, '.env'), 'utf8'), 'NEU=2\n');
  assert.equal(statSync(join(base, '.credentials.yaml')).mode & 0o777, 0o600);
});

test('ein zweiter Lauf ist idempotent und meldet alles als vorhanden', () => {
  const base = dir();
  const target = join(base, 'vault.json');
  writeVault(target, { source: '/alt', files: { '.env': 'A=1\n' } });
  const vault = readVault(target);
  assert.deepEqual(restoreSecrets(base, vault).restored, ['.env']);
  const again = restoreSecrets(base, vault);
  assert.deepEqual(again.restored, []);
  assert.deepEqual(again.skipped, ['.env']);
  assert.ok(existsSync(join(base, '.env')));
});
