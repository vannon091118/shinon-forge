#!/usr/bin/env node
/**
 * dsh-update.mjs - DSH Upstream Update Script
 *
 * Vergleicht die installierte DSH-Fassung mit der Registry und installiert
 * bei einem echten Update die Bundles in das KANONISCHE Profil (nicht `web`).
 *
 * Ehrlichkeitsregeln dieser Datei (keine Scheinaussagen):
 * - Die Versionsaussage stammt aus einer gemessenen Registry-Abfrage
 *   (`npm view @deepseek-ai/dsh versions --json`, Maximum nach Semver).
 * - Ist die Registry nicht erreichbar, lautet die Antwort UNGEPRÜFT —
 *   niemals „keine Updates“.
 * - Alle Pfade und Namen sind abgeleitet (`lib/dsh.mjs`-Auflösung,
 *   `activeProfile()` aus dem dev-Skript): keine hartcodierten Heimpfade,
 *   kein fest verdrahtetes Profil, kein `dsh`-Aufruf über den bloßen PATH-Namen.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dshBinary } from './lib/dsh.mjs';
import * as repo from './lib/repo.mjs';

/**
 * Aktuelle DSH-Version: das entdeckte Binary (`dshBinary()` aus lib/dsh.mjs)
 * nach `--version` fragen. `unknown`, wenn nichts auflöst.
 */
function getDshVersion() {
  try {
    const binary = dshBinary();
    if (binary === null) return 'unknown';
    return execFileSync(binary[0], [...binary.slice(1), '--version'], { encoding: 'utf8' })
      .trim()
      .split('\n')[0];
  } catch {
    return 'unknown';
  }
}

/** `1.2.3` oder `1.2.3-prerelease` zerlegen (`null` bei unbekannter Form). */
function parseSemver(version) {
  const found = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(version ?? '').trim());
  if (found === null) return null;
  return { major: Number(found[1]), minor: Number(found[2]), patch: Number(found[3]), pre: found[4] ?? null };
}

/**
 * Semver-Vergleich (-1/0/1): numerischer Kern zuerst, dann gilt Release >
 * Prerelease; Prerelease-Teile numerisch gegen numerisch, Zahl < Text
 * (Semver §11), längere Restfolge gewinnt bei gleichem Präfix.
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

/**
 * Echte Update-Prüfung gegen die Registry.
 * @returns {{ status: 'current'|'update'|'unchecked', current, latest, count, reason }}
 * `update`/`current` sind gemessen (Fassungsliste + Maximum); `unchecked`
 * heißt: keine Aussage möglich (Registry unerreichbar, npm fehlt, Antwort
 * unlesbar) — der Aufrufer meldet das ausdrücklich statt „keine Updates“.
 */
export function checkForUpdates() {
  const current = getDshVersion();
  let versions;
  try {
    versions = JSON.parse(
      execFileSync('npm', ['view', '@deepseek-ai/dsh', 'versions', '--json'], {
        encoding: 'utf8',
        timeout: 45000,
      }),
    );
  } catch (error) {
    return { status: 'unchecked', current, latest: null, count: 0, reason: error.message.split('\n')[0] };
  }
  const list = (Array.isArray(versions) ? versions : [versions]).filter((v) => parseSemver(v) !== null);
  if (list.length === 0 || parseSemver(current) === null) {
    return { status: 'unchecked', current, latest: null, count: list.length, reason: 'Registry-Antwort ohne auswertbare Fassung' };
  }
  const latest = list.reduce((best, v) => (compareSemver(v, best) > 0 ? v : best), list[0]);
  const cmp = compareSemver(current, latest);
  return { status: cmp < 0 ? 'update' : 'current', current, latest, count: list.length, reason: null };
}

/** Alle Bundles in das kanonische Profil installieren (Profil aus dem dev-Skript). */
function installBundles(profile) {
  const binary = dshBinary();
  if (binary === null) {
    console.warn('   ⚠️  Kein lauffähiges dsh gefunden — Bundles nicht installiert');
    return;
  }
  console.log('📦 Installiere Bundles...');
  const packages = [
    '@shinon/core',
    '@shinon/locale-de',
    '@shinon/tooltip',
    '@shinon/dashboard',
    '@shinon/better-errors',
    '@shinon/token-usage',
  ];
  for (const pkg of packages) {
    try {
      console.log(`   Installiere ${pkg}...`);
      execFileSync(
        binary[0],
        [...binary.slice(1), '--profile', profile, 'plugin_manager', 'install_bundle', pkg],
        { stdio: 'inherit' },
      );
    } catch (e) {
      console.warn(`   ⚠️  Failed to install ${pkg}: ${e.message}`);
    }
  }
}

/**
 * Profil vor dem Update sichern: die Repo-Profilschicht nach tmpdir kopieren
 * (nie ins Repo — dort würde ein Backup-Verzeichnis Zählungen und Gates stören).
 * @returns {string} Backup-Pfad.
 */
function backupProfile(profile) {
  const target = mkdtempSync(join(tmpdir(), 'shinon-profile-backup-'));
  cpSync(join(repo.ROOT, 'profiles', profile), join(target, profile), { recursive: true });
  return join(target, profile);
}

/** Profil neu laden (HMR läuft über den DSH-Prozess bzw. Browser-Reload). */
function reloadProfile() {
  console.log('🔄 Lade Profil neu...');
  console.log('   Bitte Browser neu laden oder HMR nutzen');
}

/** Hauptfunktion (beratend: Exit 0 in allen Ausgängen, die Aussage steht im Text). */
function main() {
  try {
    run();
  } catch (error) {
    console.error(`\n💥 Updater-Fehler: ${error.message}\n`);
  }
}

function run() {
  console.log('═══════════════════════════════════════');
  console.log('  Shinon Forge Updater');
  console.log('═══════════════════════════════════════\n');

  // 1. Echte Prüfung (gemessen, nicht behauptet)
  console.log('🔍 Prüfe DSH Updates...');
  const { status, current, latest, count, reason } = checkForUpdates();
  console.log(`   Aktuelle DSH Version: ${current}`);
  if (status === 'unchecked') {
    console.log(`\n⚠️  Update-Prüfung UNGEPRÜFT: ${reason ?? 'unbekannter Grund'} — keine Aussage über Updates\n`);
    console.log('\n✨ Fertig!\n');
    return;
  }
  console.log(`   Neueste Registry-Fassung: ${latest} (gemessen: ${count} Fassungen)`);

  const profile = repo.activeProfile();
  if (profile === null) {
    console.error('\n💥 Kein --profile im dev-Skript (package.json) gefunden — Abbruch\n');
    process.exitCode = 2;
    return;
  }

  if (status === 'current') {
    console.log('\n✅ Keine Updates verfügbar\n');
  } else {
    console.log(`\n📥 Update verfügbar: ${current} → ${latest}\n`);

    // 2. Backup (abgeleitetes Profil, Ablage außerhalb des Repos)
    console.log('💾 Erstelle Backup...');
    console.log(`   Profilschicht gesichert: ${backupProfile(profile)}`);

    // 3. Update DSH (Installationsmodell: globales Update, wie bisher)
    console.log('📦 Aktualisiere DSH...');
    execFileSync('npm', ['update', '-g', '@deepseek-ai/dsh'], { stdio: 'inherit' });

    // 4. Installiere Bundles (kanonisches Profil, aufgelöstes Binary)
    installBundles(profile);

    // 5. Reload
    reloadProfile();
  }

  console.log('\n✨ Fertig!\n');
}

// Nur als CLI ausführen, nicht beim Import (Tests importieren die reinen Funktionen).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
