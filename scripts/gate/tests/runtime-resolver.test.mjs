/**
 * runtime-resolver.test.mjs — die Node-Laufzeit wird GEPRÜFT, nicht angenommen.
 *
 * Warum es diesen Test gibt (gemessen 2026-10-17): `goodNode()` akzeptierte jede
 * laufende Hauptversion ≥ 22. Damit war Node 23 zulässig, obwohl `engines` es
 * ausschließt, und Node 22.0–22.18 ebenso, obwohl `^22.19.0` erst ab 22.19 gilt.
 * Der Fehler fiel nicht hier auf, sondern tief im Index (`node:sqlite` fehlt).
 *
 * Gepinnt wird:
 *   1. die Range kommt aus dem Root-Manifest (eine Quelle, keine zweite Liste),
 *   2. `satisfiesRange` weist 21/22.18/23 ab und lässt 22.19+/24 zu,
 *   3. ein Kandidat gilt nur mit bestandenem `node:sqlite`-Rauchtest,
 *   4. `SHINON_NODE` auf ein untaugliches Binary ⇒ fail-closed mit Grund,
 *   5. der Kind-Umgebungsblock trägt den verifizierten Node VORN im PATH —
 *      das ist die Ursache des `spawn node ENOENT` (geprüft mit leerem PATH).
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { delimiter, dirname, join } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  SQLITE_SMOKE,
  engineRange,
  resetRuntimeCache,
  resolveRuntime,
  runtimeCandidates,
  runtimeFailure,
  satisfiesRange,
  verifyRuntime,
} from '../../lib/runtime.mjs';
import { childEnv, pathWith } from '../../lib/paths.mjs';
import { WORKSPACE_ROOT } from '../../lib/paths.mjs';

// ── 1. Die Range: EINE Quelle ────────────────────────────────────────────────

test('runtime: die unterstützte Range steht im Root-Manifest, nicht im Code', () => {
  // Gelesen wird genau das Manifest, das der Resolver liest.
  const manifest = JSON.parse(readFileSync(join(WORKSPACE_ROOT, 'package.json'), 'utf8'));
  assert.equal(engineRange(), manifest.engines.node, 'die Range kommt aus engines.node');
  assert.match(engineRange(), /22\.19\.0/, 'die Untergrenze der 22er-Reihe ist Teil der Zusage');
});

test('runtime: veraltete und unerlaubte Fassungen werden abgewiesen', () => {
  const range = engineRange();
  // Der Befund: genau diese drei galten vorher als tauglich.
  assert.equal(satisfiesRange('v22.18.0', range), false, '22.18 liegt unter ^22.19.0');
  assert.equal(satisfiesRange('v23.1.0', range), false, '23 ist von der Range ausgeschlossen');
  assert.equal(satisfiesRange('v21.7.3', range), false, '21 liegt unter 22');
  // Und die zugelassenen Fassungen bleiben zugelassen.
  assert.equal(satisfiesRange('v22.19.0', range), true, 'die Untergrenze selbst gilt');
  assert.equal(satisfiesRange('v22.23.3', range), true, 'die gemessene Fassung gilt');
  assert.equal(satisfiesRange('v24.0.0', range), true, '>=24.0.0 gilt');
  // Ein unbekannter Ausdruck lässt nichts durch (fail-closed).
  assert.equal(satisfiesRange('v22.19.0', 'unsinn'), false);
});

// ── 2. Die Proben am echten Binary ───────────────────────────────────────────

test('runtime: der verifizierte Kandidat besteht Version UND node:sqlite-Rauchtest', () => {
  resetRuntimeCache();
  const resolved = resolveRuntime();
  assert.ok(resolved.binary !== null, `kein Kandidat: ${runtimeFailure(resolved)}`);
  assert.equal(satisfiesRange(resolved.version, resolved.range), true, `${resolved.version} gegen ${resolved.range}`);
  assert.ok(existsSync(resolved.binary), `Binary existiert: ${resolved.binary}`);

  // Die Probe noch einmal einzeln, damit der Test nicht nur dem Resolver glaubt.
  const probe = verifyRuntime(resolved.binary);
  assert.equal(probe.ok, true, probe.reason ?? '');
  assert.equal(probe.version, resolved.version);
  assert.match(SQLITE_SMOKE, /DatabaseSync/, 'der Rauchtest prüft wirklich das Builtin');

  // Ein untaugliches Binary wird gemeldet, nicht angenommen. `/bin/true` gibt 0
  // zurück, führt den Rauchtest aber gar nicht aus — genau diese Lücke muss die
  // Probe schließen (sonst gälte jedes Programm, das 0 zurückgibt).
  const broken = verifyRuntime('/bin/true');
  assert.equal(broken.ok, false, '/bin/true führt den Rauchtest nicht aus');
  assert.ok(String(broken.reason).length > 0, 'ein Fehler ohne Text wäre ein Befund ohne Spur');
});

test('runtime: der Rückfall scannt die Versionsmanager, höchste Fassung zuerst', () => {
  // Eine künstliche HOME: der Test hängt nicht an der Installation dieses Rechners.
  // Geprüft wird die REIHENFOLGE (deterministisch, absteigend) und dass die drei
  // dokumentierten Orte überhaupt gelesen werden — nicht, welche Fassung hier liegt.
  const home = mkdtempSync(join(tmpdir(), 'shinon-node-'));
  const binary = process.platform === 'win32' ? 'node.exe' : 'node';
  const plant = (rel) => {
    const dir = join(home, rel, 'bin');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, binary), '');
  };
  try {
    plant('.local/opt/shinon-forge/node/current');
    plant('.local/share/mise/installs/node/22.19.0');
    plant('.local/share/mise/installs/node/24.1.0');
    plant('.local/share/mise/installs/node/21.7.0');
    plant('.nvm/versions/node/v22.23.3');
    const found = runtimeCandidates({ HOME: home, PATH: '' })
      .filter((entry) => entry.source === 'Versionsmanager')
      .map((entry) => entry.binary);
    assert.equal(found.length, 5, `alle fünf Binaries werden gelesen (${found.join(', ')})`);
    assert.equal(found[0], join(home, '.local/opt/shinon-forge/node/current/bin', binary), 'der dokumentierte Opt-Pfad steht zuerst');
    assert.equal(found[1], join(home, '.local/share/mise/installs/node/24.1.0/bin', binary), 'höchste Fassung vor 22.19');
    assert.equal(found[2], join(home, '.local/share/mise/installs/node/22.19.0/bin', binary), '22.19 vor 21');
    assert.equal(found[3], join(home, '.local/share/mise/installs/node/21.7.0/bin', binary), 'auch die zu alte Fassung wird geprüft — verworfen wird sie erst von den Proben');
    assert.equal(found[4], join(home, '.nvm/versions/node/v22.23.3/bin', binary), 'nvm ist der letzte Rückfall');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('runtime: SHINON_NODE auf ein untaugliches Binary ist ein Fehler mit Grund', () => {
  resetRuntimeCache();
  const resolved = resolveRuntime({ env: { SHINON_NODE: '/bin/true', PATH: '' } });
  assert.equal(resolved.binary, null, 'kein stiller Rückfall auf ein anderes Node');
  assert.equal(resolved.tried.length, 1, 'genau der ausdrücklich gewünschte Kandidat wurde geprüft');
  assert.match(resolved.tried[0].reason, /--version|sqlite/, 'der Grund wird benannt');
  assert.match(runtimeFailure(resolved), /SHINON_NODE|taugliche Node-Laufzeit/, 'die Meldung ist handlungsfähig');
  resetRuntimeCache();
});

// ── 3. Der PATH für Kindprozesse: die Ursache von spawn node ENOENT ──────────

test('runtime: der Kind-PATH führt den verifizierten Node auch bei leerem PATH', () => {
  resetRuntimeCache();
  const resolved = resolveRuntime();
  const env = childEnv(resolved, { PATH: '', SHINON_HOME_IGNORED: 'x' });
  const parts = env.PATH.split(delimiter);
  assert.equal(parts[0], dirname(resolved.binary), 'das Node-Verzeichnis steht vorn');
  assert.ok(parts.includes(join(WORKSPACE_ROOT, 'node_modules', '.bin')), 'und node_modules/.bin (dort liegt dsh)');
  assert.ok(existsSync(join(parts[0], 'node')), 'dort liegt wirklich ein node-Binary');
  assert.equal(env.SHINON_HOME_IGNORED, 'x', 'die übrige Umgebung bleibt erhalten');
  // Und die Orte aus dem Pfaddienst stehen mit drin (eine Quelle).
  assert.equal(typeof env.DSH_HOME, 'string');
  assert.equal(typeof env.SHINON_LEDGER_FILE, 'string');
});

test('runtime: pathWith entdoppelt und wirft leere Einträge weg', () => {
  const merged = pathWith(['/a', '', '/a', '/b'], { PATH: '/b:/c' });
  assert.equal(merged, ['/a', '/b', '/c'].join(delimiter));
  assert.equal(pathWith([], { PATH: '' }), '');
});
