/**
 * Die Tests des Versionsspiegels.
 *
 * ZWEI Ebenen, und sie werden getrennt geprueft:
 *   - die Formel (assets/version-state.js) rechnet ohne Dateisystem und ohne
 *     Netz — hier laufen die Faelle durch, die im Betrieb nicht warten:
 *     unbekannte SHAs, gleiche SHAs, halbe Angaben.
 *   - der Bau-Schatten (assets/version-probe.js) wird an einem echten, im
 *     Test gebauten Verzeichnis gelesen — dort, wo eine kaputte Datei sonst
 *     still "unbekannt" ergaebe.
 *
 * Der Test laeuft ohne node_modules: das Paket haengt an keinem Fremdpaket.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  VERSION_CONTRACT,
  badgeLine,
  badgeTitle,
  compare,
  shortSha,
  updateLine,
} from '../assets/version-state.js';
import { BUILD_STAMP, readStamp } from '../assets/version-probe.js';

test('shortSha kürzt einen SHA und verweigert alles andere', () => {
  assert.equal(shortSha('e480c73386126b24c1f6e09fd705d66a3a700e3f'), 'e480c73');
  assert.equal(shortSha('e480c73386126b24c1f6e09fd705d66a3a700e3f', 12), 'e480c7338612');
  assert.equal(shortSha(null), '???????');
  assert.equal(shortSha('kein-sha'), '???????');
  assert.equal(shortSha(''), '???????');
});

test('compare kennt nur gemessene Zahlen', () => {
  assert.deepEqual(compare({ installed: 'a', latest: 'a' }), { behind: 0, ahead: 0, upToDate: true, known: true });
  const offen = compare({ installed: 'a', latest: 'b' });
  assert.equal(offen.known, true);
  assert.equal(offen.upToDate, false);
  assert.equal(offen.behind, null, 'ohne Messung ist die Zahl null — nicht 0');
  const unbekannt = compare({ installed: null, latest: 'b' });
  assert.equal(unbekannt.known, false);
  assert.equal(unbekannt.behind, null);
});

test('badgeLine nennt neuesten, installierten Commit und den Abstand', () => {
  const gleich = badgeLine({ installed: 'a'.repeat(40), latest: 'a'.repeat(40) });
  assert.match(gleich, /aktuell/);
  const abstand = badgeLine({ installed: 'a'.repeat(40), latest: 'b'.repeat(40), behind: 3, ahead: 1 });
  assert.match(abstand, /-3/);
  assert.match(abstand, /\+1/);
  assert.ok(abstand.length < 40, `die Badge-Zeile bleibt kurz: ${abstand}`);
});

test('badgeLine und badgeTitle sagen "unbekannt", statt zu raten', () => {
  const zeile = badgeLine({ installed: null, latest: null });
  assert.match(zeile, /unbekannt/);
  const titel = badgeTitle({ installed: null, latest: null });
  assert.match(titel, /nicht vergleichen/);
});

test('badgeTitle erklaert den Abstand in Worten', () => {
  const titel = badgeTitle({ installed: 'a'.repeat(40), latest: 'b'.repeat(40), behind: 2, ahead: 0 });
  assert.match(titel, /2 Commits hinter main/);
  assert.match(titel, /Klick/);
});

test('updateLine nennt den Grund, wenn es kein Update gibt', () => {
  const ohne = updateLine({ canUpdate: false, updateHint: 'Kein Git-Baum.' });
  assert.equal(ohne, 'Kein Git-Baum.');
  const mit = updateLine({ canUpdate: true, installed: 'a'.repeat(40), latest: 'b'.repeat(40), behind: 1, ahead: 0 });
  assert.match(mit, /Kandidat/);
  const aktuell = updateLine({ canUpdate: true, installed: 'a'.repeat(40), latest: 'a'.repeat(40) });
  assert.match(aktuell, /Bereits aktuell/);
});

test('der Vertragsname ist eine Konstante', () => {
  assert.equal(VERSION_CONTRACT, 'shinon.version/state-v1');
});

test('der Bau-Schatten wird gelesen — und eine kaputte Datei ist "kein Schatten"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-version-'));
  writeFileSync(join(dir, BUILD_STAMP), JSON.stringify({ commit: 'a'.repeat(40), builtAt: '2026-10-21T00:00:00Z' }));
  const stamp = readStamp(dir);
  assert.equal(stamp.commit, 'a'.repeat(40));
  assert.equal(stamp.builtAt, '2026-10-21T00:00:00Z');

  writeFileSync(join(dir, BUILD_STAMP), '{ kaputt');
  assert.equal(readStamp(dir), null);

  writeFileSync(join(dir, BUILD_STAMP), JSON.stringify({ commit: 'kein-sha' }));
  assert.equal(readStamp(dir), null);

  assert.equal(readStamp(join(dir, 'gibtsnicht')), null);
});
