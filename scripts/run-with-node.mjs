#!/usr/bin/env node
/**
 * run-with-node.mjs — der selbstheilende Test-/Gate-Wrapper.
 *
 * WARUM: Agenten-Subshells starten regelmäßig mit einem nackten `/usr/bin/node`
 * (Node 18, ohne `node:sqlite`) und ohne `./node_modules/.bin` im PATH. Dann
 * scheitert `node --test` tief im Project Index mit
 * `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`, und `gate:test` findet kein `dsh`.
 * Beides ist kein Code-Fehler, sondern eine Umgebungsfalle — und eine Falle,
 * → Kanon: docs/COMMENT-KANON.md#k-db3c1f71444c
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineRange, resolveRuntime, runtimeFailure, satisfiesRange } from './lib/runtime.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(SELF, '..', '..');

/** PATH mit dem lokalen `.bin` zuerst — dieselbe Reihenfolge wie in `docs/ZAHLEN.md` §3. */
function localPath(env) {
  const bin = join(ROOT, 'node_modules', '.bin');
  const parts = [bin, ...String(env.PATH ?? '').split(delimiter).filter((part) => part !== '' && part !== bin)];
  return parts.join(delimiter);
}

const baseEnv = { ...process.env, PATH: localPath(process.env) };

/** `*`-Muster expandieren (sortiert, nur Dateien) — erst nach der Node-Prüfung sicher. */
async function expandGlobs(args) {
  const { globSync } = await import('node:fs');
  if (typeof globSync !== 'function') return args;
  return args.flatMap((arg) => {
    if (!arg.includes('*')) return [arg];
    const found = globSync(arg).sort();
    return found.length > 0 ? found : [arg];
  });
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.error('Aufruf: node scripts/run-with-node.mjs <node|skript> [...args]');
  console.error('        node scripts/run-with-node.mjs --runtime');
  process.exit(args.length === 0 ? 2 : 0);
}

if (args[0] === '--runtime') {
  const resolved = resolveRuntime({ env: baseEnv });
  if (resolved.binary === null) {
    console.error(runtimeFailure(resolved));
    process.exit(1);
  }
  console.log(JSON.stringify({
    binary: resolved.binary,
    version: resolved.version,
    sqlite: resolved.sqlite,
    source: resolved.source,
    range: resolved.range,
  }, null, 2));
  process.exit(0);
}

// Die laufende Fassung gilt nur, wenn sie die deklarierte Range erfüllt. Die
// exakte Range steht im Manifest (eine Quelle), nicht als zweite Zahl hier.
const running = `v${process.versions.node}`;
const inRange = satisfiesRange(running, engineRange(ROOT));

let binary = process.execPath;
if (!inRange) {
  if (process.env.SHINON_RUN_WITH_NODE === '1') {
    console.error(`💥 run-with-node: auch der re-exec-Lauf meldet ${running} — keine taugliche Node-Laufzeit gefunden`);
    process.exit(1);
  }
  const resolved = resolveRuntime({ env: baseEnv });
  if (resolved.binary === null) {
    console.error('💥 run-with-node: keine taugliche Node-Laufzeit gefunden — der Lauf startet NICHT mit einem untauglichen Node.');
    console.error(runtimeFailure(resolved));
    process.exit(1);
  }
  console.error(`↻ run-with-node: ${running} erfüllt engines.node nicht — wechsle auf ${resolved.version} (${resolved.source}): ${resolved.binary}`);
  const child = spawnSync(resolved.binary, [SELF, ...args], {
    stdio: 'inherit',
    env: { ...baseEnv, SHINON_RUN_WITH_NODE: '1' },
  });
  process.exit(child.status ?? 1);
}

const [command, ...rest] = args;
const targetArgs = command === 'node' ? rest : [command, ...rest];
const expanded = await expandGlobs(targetArgs);

// Ein fehlendes Skript ist ein Bedienfehler, kein Testfehler — früh und klar.
const script = expanded[0];
if (command !== 'node' && script !== undefined && !script.startsWith('-') && !existsSync(script)) {
  console.error(`💥 run-with-node: Skript nicht gefunden: ${script}`);
  process.exit(2);
}

const child = spawnSync(binary, expanded, { stdio: 'inherit', env: baseEnv });
if (child.error !== undefined) {
  console.error(`💥 run-with-node: Start fehlgeschlagen (${child.error.message})`);
  process.exit(1);
}
process.exit(child.status ?? 1);
