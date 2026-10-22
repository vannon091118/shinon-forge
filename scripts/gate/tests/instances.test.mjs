#!/usr/bin/env node
/**
 * instances.test.mjs — „laeuft da noch etwas?" ist eine MESSUNG, keine Annahme.
 *
 * WARUM DIESE DATEI EXISTIERT: `auto --now` beendet Prozesse und startet sie
 * wieder. Beides darf nicht geraten sein — die Liste ist eine /proc-Auswertung,
 * das Beenden ein Signal mit Wartezeit, der Neustart derselbe Aufruf. Ein Test,
 * der nur die Funktionen importiert, wuerde keinen dieser drei Schritte
 * belegen; deshalb startet er ECHTE Prozesse und sieht ihnen zu.
 *
 * Der Test beendet nur, was er selbst gestartet hat: das Wurzelverzeichnis ist
 * ein frisches Temp-Verzeichnis, und jede Kommandozeile traegt es als Argument.
 * Andere Prozesse koennen nicht hineingeraten.
 *
 * Nur Linux: /proc gibt es sonst nicht. Auf anderen Plattformen meldet der Test
 * sich sichtbar ab (Grund im Namen), statt still zu bestehen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { instancesUsing, isAlive, restartInstances, stopInstances } from '../../lib/instances.mjs';
import { waitFor } from './helpers/wait.mjs';

const LINUX = process.platform === 'linux';

/** Ein Temp-Ort, der in jeder Kommandozeile steht (und sonst nirgends). */
function sandbox() {
  return mkdtempSync(join(tmpdir(), 'shinon-instances-'));
}

/** Einen schlafenden Prozess starten, dessen cmdline das Verzeichnis traegt. */
function sleeper(dir) {
  return spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', dir], { cwd: dir, stdio: 'ignore' });
}

/** Warten, bis eine Bedingung gilt — mit Grenze, nicht mit Hoffnung. */
test('eine Instanz wird an ihrer Kommandozeile erkannt — und nur sie', { skip: LINUX ? false : 'nur Linux (/proc)' }, async () => {
  const dir = sandbox();
  const child = sleeper(dir);
  try {
    assert.ok(Boolean(await waitFor(() => instancesUsing(dir).some((hit) => hit.pid === child.pid), { timeoutMs: 4000, stepMs: 50 })), 'der eigene Prozess wurde nicht gefunden');
    const hit = instancesUsing(dir).find((entry) => entry.pid === child.pid);
    assert.ok(hit.cmdline.includes(dir), 'die Kommandozeile des Treffers nennt das Verzeichnis nicht');
    const fremd = instancesUsing(join(dir, 'gibt-es-nicht'));
    assert.equal(fremd.length, 0, 'ein fremdes Verzeichnis liefert Treffer');
  } finally {
    child.kill('SIGKILL');
  }
});

test('beenden heisst: nach dem Warten laeuft der Prozess nicht mehr', { skip: LINUX ? false : 'nur Linux (/proc)' }, async () => {
  const dir = sandbox();
  const child = sleeper(dir);
  await waitFor(() => instancesUsing(dir).length > 0, { timeoutMs: 4000, stepMs: 50 });
  const hits = instancesUsing(dir);
  const stopped = await stopInstances(hits, { timeoutMs: 4000 });
  assert.equal(stopped.length, hits.length, 'ein Prozess liess sich nicht beenden');
  assert.ok(Boolean(await waitFor(() => !isAlive(child.pid), { timeoutMs: 4000, stepMs: 50 })), 'der Prozess lebt nach dem Beenden weiter');
  assert.equal(instancesUsing(dir).length, 0, 'die Liste nennt einen beendeten Prozess');
});

test('der Neustart nimmt DENSELBEN Aufruf, nicht einen erfundenen', { skip: LINUX ? false : 'nur Linux (/proc)' }, async () => {
  const dir = sandbox();
  const child = sleeper(dir);
  let restarted = [];
  try {
    await waitFor(() => instancesUsing(dir).length > 0, { timeoutMs: 4000, stepMs: 50 });
    const hits = instancesUsing(dir);
    await stopInstances(hits, { timeoutMs: 4000 });
    restarted = restartInstances(hits, { cwd: dir });
    assert.equal(restarted.length, hits.length);
    assert.equal(restarted[0].error, null, restarted[0].error ?? '');
    assert.ok(Boolean(await waitFor(() => instancesUsing(dir).some((hit) => hit.pid === restarted[0].pid), { timeoutMs: 4000, stepMs: 50 })), 'der Neustart laeuft nicht mit derselben Kommandozeile');
    const wieder = instancesUsing(dir).find((hit) => hit.pid === restarted[0].pid);
    assert.equal(wieder.cmdline, hits[0].cmdline, 'die Kommandozeile hat sich beim Neustart geaendert');
  } finally {
    child.kill('SIGKILL');
    for (const entry of restarted) {
      if (entry.pid === undefined) continue;
      try { process.kill(entry.pid, 'SIGKILL'); } catch { /* schon weg */ }
    }
  }
});
