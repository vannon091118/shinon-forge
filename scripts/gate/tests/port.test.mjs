#!/usr/bin/env node
/**
 * port.test.mjs — Abnahmetest der dynamischen Port-Wahl (scripts/lib/port.mjs).
 *
 * Warum diese Datei existiert: der Wrapper hatte den Port als Konstante. War die
 * Nummer belegt, brach der Boot ab, bevor die READY-Zeile kam — und der Fehler
 * sah aus wie ein kaputtes Profil. Die Port-Wahl ist deshalb jetzt eine geprüfte
 * Zusage: eine ungültige Angabe wird gemeldet statt geraten, ein belegter Port
 * wird ÜBERSPRUNGEN, und ein volles Fenster endet in einem Abbruch statt in
 * einem stillen Rückfall auf einen belegten Port.
 *
 * Geprüft wird mit injizierter Probe (deterministisch, kein Socket) UND einmal
 * gegen einen echten Listener auf 127.0.0.1 — die Probe muss einen wirklich
 * belegten Port erkennen, sonst beweist sie nichts.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz
 * nach außen, kein Modell, kein node_modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { DEFAULT_PORT_BASE, isPortFree, parsePort, pickFreePort } from '../../lib/port.mjs';

test('parsePort: keine Angabe heißt wählen, 0 heißt Betriebssystem', () => {
  assert.deepEqual(parsePort(undefined), { ok: true, port: null });
  assert.deepEqual(parsePort(null), { ok: true, port: null });
  assert.deepEqual(parsePort('0'), { ok: true, port: 0 });
  assert.deepEqual(parsePort('3081'), { ok: true, port: 3081 });
  assert.deepEqual(parsePort(' 3082 '), { ok: true, port: 3082 });
  assert.deepEqual(parsePort('65535'), { ok: true, port: 65535 });
  assert.deepEqual(parsePort(3083), { ok: true, port: 3083 });
});

test('parsePort: keine Portnummer wird gemeldet, nicht geraten', () => {
  for (const value of ['65536', '3081a', 'abc', '-1', '', ' ', '1.5', '0x10']) {
    assert.equal(parsePort(value).ok, false, `"${value}" ist keine Portnummer`);
  }
  assert.equal(parsePort(3.5).ok, false);
  assert.equal(parsePort(-1).ok, false);
});

test('pickFreePort: überspringt belegte Kandidaten (injizierte Probe)', async () => {
  const probed = [];
  const probe = async (port) => {
    probed.push(port);
    return port === 4002;
  };
  assert.equal(await pickFreePort({ base: 4000, tries: 5, probe }), 4002);
  assert.deepEqual(probed, [4000, 4001, 4002], 'jeder Kandidat wird genau einmal geprüft, der Treffer beendet die Suche');
});

test('pickFreePort: nimmt den ersten Kandidaten, wenn er frei ist', async () => {
  assert.equal(await pickFreePort({ base: 3081, probe: async () => true }), 3081);
  assert.equal(DEFAULT_PORT_BASE, 3081, 'die Basis bleibt 3081 — EINE Quelle für Wrapper und Meldung');
});

test('pickFreePort: volles Fenster bricht ab, statt auf einen belegten Port zurückzufallen', async () => {
  await assert.rejects(
    () => pickFreePort({ base: 5000, tries: 3, probe: async () => false }),
    /kein freier Port in 5000\.\.5002/,
  );
});

test('pickFreePort: ungültiges Fenster ist ein Fehler, keine stille Suche', async () => {
  await assert.rejects(() => pickFreePort({ base: 0 }), /ungültige Basis/);
  await assert.rejects(() => pickFreePort({ base: 3081, tries: 0 }), /ungültiges Fenster/);
  await assert.rejects(() => pickFreePort({ base: 3081.5 }), /ungültige Basis/);
});

test('isPortFree: erkennt einen wirklich belegten Port und gibt ihn danach frei', async () => {
  const occupied = createServer();
  const port = await new Promise((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(0, '127.0.0.1', () => resolve(occupied.address().port));
  });
  try {
    assert.equal(await isPortFree(port), false, 'ein echter Listener auf dem Port heißt: nicht frei');
    const chosen = await pickFreePort({ base: port, tries: 10 });
    assert.notEqual(chosen, port, 'die Wahl überspringt den belegten Port');
    assert.ok(chosen > port, 'und sucht oberhalb, nicht darunter');
    assert.equal(await isPortFree(chosen), true, 'der gewählte Port ist wirklich frei');
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
  assert.equal(await isPortFree(port), true, 'nach dem Schließen ist derselbe Port wieder frei — die Probe misst, sie blockiert nicht');
});
