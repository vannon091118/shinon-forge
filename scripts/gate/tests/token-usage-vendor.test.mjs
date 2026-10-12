#!/usr/bin/env node
/**
 * token-usage-vendor.test.mjs — die Kopie gegen DSHs EIGENE Funktionen.
 *
 * Warum diese Datei existiert: `packages/token-usage/assets/token-core.js` ist
 * eine Nachbildung zweier DSH-Regeln (Prozent-Text, Turn-Faltung). Eine Kopie,
 * die nur gegen die eigenen Erwartungen geprüft wird, ist eine Behauptung: die
 * frühere Fassung gab 136 von 45.531 Paaren als `100 %` aus, wo DSH `99.5`
 * schreibt, und ging mit ihrer eigenen Testtabelle grün durch. Dieser Test
 * vergleicht deshalb gegen den GELIEFERTEN Code selbst:
 *
 *   1. `formatCacheHitPercent` gegen die Funktion aus dem Bundle
 *      `@deepseek-ai/dsh-client-ui-chat` (Region
 *      `lib/types/client/chat/token-format.js`) — über den ganzen Wertebereich,
 *      beide Nachkommastellen. JEDE Abweichung ist rot.
 *   2. `deriveTurnUsage` gegen `deriveTurnTokenUsage` aus
 *      `@deepseek-ai/dsh-token-meter/client` — über vollständige, verstümmelte
 *      und zufällig erzeugte Ereignisfolgen (deterministisch, kein Zufall aus
 *      der Uhr).
 *   3. Die Client-Hälfte trägt DIESELBE Region (bytegleich): was hier für den
 *      Besitzer grün ist, gilt damit auch für das ausgelieferte Bundle.
 *
 * Braucht `node_modules` und überspringt ohne sie SICHTBAR (Grund im Testnamen) —
 * dieselbe Regel wie der Store- und der Übergabe-Test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  deriveTurnUsage,
  formatCacheHitPercent as ourFormatCacheHitPercent,
} from '../../../packages/token-usage/assets/token-core.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);

/** Die Region, in der die Client-Hälfte die Regel des Besitzers spiegelt. */
const REGION = 'zwilling:token-turn';

/** Den Text zwischen `// #region <marker>` und `// #endregion <marker>` (wie scripts/lib/repo.mjs). */
function regionOf(text, marker) {
  const start = text.indexOf(`// #region ${marker}`);
  const end = text.indexOf(`// #endregion ${marker}`);
  if (start < 0 || end < 0 || end < start) return null;
  return text.slice(start, end + `// #endregion ${marker}`.length);
}

/**
 * Dieselbe Region im GELIEFERTEN Bundle: dort heißen die Marken `//#region` /
 * `//#endregion` (ohne Leerzeichen), und das Ende ist die nächste Endmarke.
 */
function vendorRegionOf(text, marker) {
  const start = text.indexOf(`//#region ${marker}`);
  if (start < 0) return null;
  const end = text.indexOf('//#endregion', start);
  if (end < 0) return null;
  return text.slice(start, end + '//#endregion'.length);
}

// ── Die gelieferten Funktionen holen (oder sichtbar überspringen) ───────────

let vendorFormat = null;
let vendorFold = null;
let missing = '';

if (missing === '') {
  try {
    const mod = await import('@deepseek-ai/dsh-token-meter/client');
    vendorFold = mod.deriveTurnTokenUsage;
    if (typeof vendorFold !== 'function') missing = '@deepseek-ai/dsh-token-meter/client exportiert deriveTurnTokenUsage nicht';
  } catch (error) {
    missing = `@deepseek-ai/dsh-token-meter/client nicht auflösbar: ${error.message}`;
  }
}

if (missing === '') {
  try {
    const bundlePath = require.resolve('@deepseek-ai/dsh-client-ui-chat/client');
    const source = readFileSync(bundlePath, 'utf8');
    const region = vendorRegionOf(source, 'lib/types/client/chat/token-format.js');
    if (region === null) {
      missing = `die Region lib/types/client/chat/token-format.js fehlt in ${bundlePath} — die gelieferte Fassung hat sich bewegt`;
    } else {
      const context = vm.createContext({});
      new vm.Script(`${region}\nglobalThis.__vendorFormat = formatCacheHitPercent;`, { filename: bundlePath }).runInContext(context);
      vendorFormat = context.__vendorFormat;
      if (typeof vendorFormat !== 'function') missing = `${bundlePath}: formatCacheHitPercent liess sich nicht laden`;
    }
  } catch (error) {
    missing = `@deepseek-ai/dsh-client-ui-chat/client nicht auflösbar: ${error.message}`;
  }
}

const skip = vendorFormat === null || vendorFold === null ? `uebersprungen (Grund: ${missing})` : false;

// ── Die Ereignisse, mit denen der Fold verglichen wird ──────────────────────

/** Ein dauerhafter Eintrag in der Form des gelieferten Clients. */
const durable = (type, seq, data) => ({ type: 'event', event: { type, seq, time: 1_760_000_000_000 + seq, data } });
const usage = (inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, extra = {}) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  ...extra,
});
const message = (turn, step, patch = {}) => durable('assistant/message', 0, {
  turn,
  step,
  message: { source: { provider: 'agnes', model: 'agnes-3.0-flash' } },
  usage: usage(1000, 500, 3000, 200, { totalTokens: 4700 }),
  stream: [],
  ...patch,
});
const attempt = (turn, step, sample) => durable('assistant/attempt', 0, {
  turn,
  step,
  attemptId: `a${turn}-${step}`,
  stream: [{ type: 'chunk', chunk: { type: 'usage', usage: sample } }],
});

/** Vollständige, gültige Lebensläufe — plus jede einzelne Verstümmelung davon. */
const BASES = [
  [
    durable('turn/start', 1, { turn: 1 }),
    durable('step/start', 2, { turn: 1, step: 1 }),
    message(1, 1),
    durable('step/end', 3, { turn: 1, step: 1 }),
    durable('turn/end', 4, { turn: 1, reason: { kind: 'stop' } }),
  ],
  [
    durable('turn/start', 1, { turn: 7 }),
    durable('step/start', 2, { turn: 7, step: 1 }),
    attempt(7, 1, usage(10, 5, 0, 0)),
    durable('llm/retry', 3, { turn: 7, step: 1 }),
    durable('llm/retry-started', 4, { turn: 7, step: 1 }),
    attempt(7, 1, usage(20, 5, 0, 0)),
    durable('step/end', 5, { turn: 7, step: 1 }),
    durable('turn/end', 6, { turn: 7, reason: { kind: 'stop' } }),
  ],
  [
    durable('turn/start', 1, { turn: 2 }),
    durable('step/start', 2, { turn: 2, step: 1 }),
    message(2, 1, { usage: usage(1000, 500, 3000, 200, { reasoningTokens: 100, totalTokens: 4700 }) }),
    durable('step/end', 3, { turn: 2, step: 1 }),
    durable('step/start', 4, { turn: 2, step: 2 }),
    message(2, 2, { usage: usage(0, 20, 0, 0, { totalTokens: 20 }) }),
    durable('step/end', 5, { turn: 2, step: 2 }),
    durable('turn/end', 6, { turn: 2, reason: { kind: 'stop' } }),
  ],
];

/** Mutationen, die die Grenzen des Falters treffen sollen. */
function mutations(base) {
  const out = [];
  for (let index = 0; index < base.length; index += 1) {
    out.push(base.filter((_entry, position) => position !== index)); // fehlende Grenze
    out.push([...base.slice(0, index), base[index], ...base.slice(index)]); // doppelte Grenze
  }
  for (let index = 0; index + 1 < base.length; index += 1) {
    const swapped = [...base];
    [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    out.push(swapped);
  }
  const bumpTurn = (delta, stepDelta) => base.map((entry) => ({
    ...entry,
    event: {
      ...entry.event,
      data: typeof entry.event.data?.turn === 'number'
        ? { ...entry.event.data, turn: entry.event.data.turn + delta, ...(typeof entry.event.data.step === 'number' ? { step: entry.event.data.step + stepDelta } : {}) }
        : entry.event.data,
    },
  }));
  out.push(bumpTurn(1, 0)); // fremder Turn
  out.push(bumpTurn(0, 1)); // fremder Schritt
  out.push([...base, durable('step/start', 99, { turn: 1, step: 1 })]); // Ereignis nach dem Ende
  out.push([durable('turn/start', 0, { turn: 1 }), ...base]); // zwei turn/start
  // Usage-Varianten: ohne Summe, halbe Buckets, Widerspruch, unsicher, Denken zu gross.
  const withUsage = (sample) => base.map((entry) => (entry.event.type === 'assistant/message'
    ? { ...entry, event: { ...entry.event, data: { ...entry.event.data, usage: sample } } }
    : entry));
  out.push(withUsage(usage(1000, 500, 3000, 200)));
  out.push(withUsage({ inputTokens: 1000, outputTokens: 500 }));
  out.push(withUsage(usage(1000, 500, 3000, 200, { totalTokens: 9999 })));
  out.push(withUsage(usage(-1, 500, 3000, 200)));
  out.push(withUsage(usage(1000, 500, 3000, 200, { reasoningTokens: 501 })));
  out.push(withUsage(usage(Number.MAX_SAFE_INTEGER, 1, 1, 1)));
  return out;
}

/** Deterministische Folge (LCG) — Zufall aus dem Test, nicht aus der Uhr. */
function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Zufällige, oft kaputte Lebensläufe aus denselben Bausteinen. */
function randomStreams(count) {
  const next = lcg(20261012);
  const streams = [];
  for (let index = 0; index < count; index += 1) {
    const turn = 1 + Math.floor(next() * 3);
    const step = 1 + Math.floor(next() * 2);
    const pool = [
      () => durable('turn/start', 1, { turn }),
      () => durable('turn/start', 1, { turn: turn + (next() < 0.2 ? 1 : 0) }),
      () => durable('step/start', 2, { turn, step }),
      () => durable('step/start', 2, { turn, step: step + (next() < 0.3 ? 1 : 0) }),
      () => attempt(turn, step, usage(Math.floor(next() * 1000), Math.floor(next() * 100), 0, 0)),
      () => attempt(turn, step, usage(Math.floor(next() * 1000), 10, 5, 5)),
      () => message(turn, step),
      () => message(turn, step, { usage: usage(1, 1, 1, 1, { totalTokens: next() < 0.5 ? 3 : 7 }) }),
      () => durable('llm/retry', 3, { turn, step }),
      () => durable('llm/retry-started', 4, { turn, step }),
      () => durable('step/end', 5, { turn, step }),
      () => durable('step/end', 5, { turn: turn + 1, step }),
      () => durable('turn/end', 6, { turn, reason: { kind: 'stop' } }),
      () => durable('assistant/live-chunk', 6, { attemptId: 'a', turn, step, chunk: { type: 'text', text: 'live' } }),
      () => ({ type: 'transient', event: { type: 'assistant/live-chunk', seq: 7, time: 1, data: { attemptId: 'a', turn, step, chunk: { type: 'text', text: 'live' } } } }),
    ];
    const length = 1 + Math.floor(next() * 7);
    const stream = [];
    for (let position = 0; position < length; position += 1) stream.push(pool[Math.floor(next() * pool.length)]());
    streams.push(stream);
  }
  return streams;
}

// ── 1. Prozent-Regel über den ganzen Wertebereich ───────────────────────────

test('der Prozent-Text stimmt ueber den ganzen Wertebereich mit DSHs eigener Funktion ueberein', { skip }, () => {
  const mismatches = [];
  let compared = 0;
  const check = (cacheReadTokens, promptTokens) => {
    for (const decimalPlaces of [0, 1]) {
      compared += 1;
      const mine = ourFormatCacheHitPercent(cacheReadTokens, promptTokens, decimalPlaces);
      const vendor = vendorFormat(cacheReadTokens, promptTokens, decimalPlaces);
      if (mine !== vendor) mismatches.push(`cacheRead=${cacheReadTokens} prompt=${promptTokens} places=${decimalPlaces}: kopie=${JSON.stringify(mine)} dsh=${JSON.stringify(vendor)}`);
    }
  };
  // Der volle Wertebereich kleiner Prompts — dort sassen die 136 Lügen der alten Kopie.
  for (let promptTokens = 0; promptTokens <= 640; promptTokens += 1) {
    for (let cacheReadTokens = 0; cacheReadTokens <= promptTokens; cacheReadTokens += 1) check(cacheReadTokens, promptTokens);
  }
  // Grosse und krumme Prompts, dicht am Volltreffer und quer durch die Skalen.
  const prompts = [999, 1000, 1001, 4096, 9999, 10000, 10001, 65535, 65536, 123457, 999999, 1000000, 1234567, 100000000];
  for (const promptTokens of prompts) {
    for (let missed = 1; missed <= 64; missed += 1) check(promptTokens - missed, promptTokens);
    for (const fraction of [0, 0.001, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.995, 0.9999]) {
      check(Math.floor(promptTokens * fraction), promptTokens);
    }
  }
  // Derselbe Sweep wie die frühere Messung: 45.531 Paare aus dem Krumm-Bereich.
  const next = lcg(45531);
  for (let index = 0; index < 45531; index += 1) {
    const promptTokens = 1 + Math.floor(next() * 200000);
    const cacheReadTokens = Math.floor(promptTokens * (0.9 + next() * 0.1));
    check(Math.min(cacheReadTokens, promptTokens), promptTokens);
  }
  assert.ok(compared > 500000, `nur ${compared} Paare verglichen — der Sweep greift ins Leere`);
  assert.deepEqual(mismatches.slice(0, 10), [], `${mismatches.length} von ${compared} Paaren weichen ab`);
  // Und der Rand, den die alte Kopie falsch beantwortete, steht namentlich da.
  assert.equal(ourFormatCacheHitPercent(9950, 10000, 1), '99.5');
  assert.equal(ourFormatCacheHitPercent(10000, 10000, 0), '100');
});

// ── 2. Die Faltung eines Turns gegen DSHs eigene ───────────────────────────

/** Ein Vergleich, der `undefined` von einem Objekt unterscheidet und Schlüsselreihenfolge ignoriert. */
const canonical = (value) => (value === undefined
  ? 'undefined'
  : JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1)))));

test('der Turn-Fold stimmt mit DSHs eigener Faltung ueberein — gueltig wie verstimmt', { skip }, () => {
  const streams = [];
  for (const base of BASES) {
    streams.push(base);
    streams.push(...mutations(base));
  }
  streams.push(...randomStreams(2000));
  const mismatches = [];
  for (const stream of streams) {
    const mine = canonical(deriveTurnUsage(stream.map((entry) => entry.event)));
    const vendor = canonical(vendorFold(stream.map((entry) => entry.event)));
    if (mine !== vendor) mismatches.push(`kopie=${mine} dsh=${vendor} bei ${JSON.stringify(stream.map((entry) => entry.event.type))}`);
  }
  assert.ok(streams.length > 2000, `nur ${streams.length} Folgen im Korpus — der Sweep greift ins Leere`);
  assert.deepEqual(mismatches.slice(0, 5), [], `${mismatches.length} von ${streams.length} Folgen weichen ab`);
  // Die gültigen Folgen muessen auch wirklich eine Offenlegung ergeben (sonst
  // vergleicht der Sweep nur zwei `undefined`).
  const proved = streams.filter((stream) => deriveTurnUsage(stream.map((entry) => entry.event)) !== undefined).length;
  assert.ok(proved >= BASES.length, `nur ${proved} Folgen ergaben eine Offenlegung — der Korpus beweist zu wenig`);
  assert.deepEqual(deriveTurnUsage(BASES[0].map((entry) => entry.event)), {
    uncachedInputTokens: 1000,
    outputTokens: 500,
    totalTokens: 4700,
    cacheReadTokens: 3000,
    cacheWriteTokens: 200,
    routes: [{ provider: 'agnes', model: 'agnes-3.0-flash' }],
  });
});

// ── 3. Die gelesene Naht ist überhaupt noch die der gelieferten Fassung ───

test('die Naht, die die Anzeige liest, steht unverändert in der gelieferten Fassung', { skip }, () => {
  // (a) Der Weg zur Sitzungssumme: genau dieser Ausdruck ist der des Clients.
  const sessionClient = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-session/client'), 'utf8');
  assert.match(
    sessionClient,
    /keyedHooks: \{ projection: \(key\) => binding\.session\.projections\.faceOf\(key\) \}/,
    'der Projektions-Weg des Clients hat sich bewegt — die Anzeige liest einen Pfad, den es nicht mehr gibt',
  );
  // (b) Die Form der Fenster-Einträge: `{ type: 'event', event }` bzw. `{ type: 'transient', event }`.
  //     Danach trennt die Anzeige dauerhafte Ereignisse von den Live-Zeilen.
  const roots = [`${ROOT}node_modules/@deepseek-ai`];
  const copies = [];
  for (const root of roots) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copies.push(`${root}/${entry.name}/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/client/contract/events.js`);
    }
  }
  const found = copies.filter((file) => existsSync(file));
  assert.ok(found.length > 0, 'keine Kopie des Session-Contracts gefunden — der Scan greift ins Leere');
  for (const file of found) {
    const contract = readFileSync(file, 'utf8');
    assert.match(contract, /['"]transient['"]/, `${file}: die Live-Zeilen heissen nicht mehr 'transient'`);
    assert.match(contract, /get entries\(\)/, `${file}: das Fenster traegt keine 'entries' mehr`);
    assert.match(contract, /kind: 'append'/, `${file}: die Aenderungsart des Fensters hat sich bewegt`);
  }
});

// ── 4. Die Client-Hälfte trägt dieselbe Region ────────────────────────────

test('die Client-Haelfte spiegelt die geprueften Regeln bytegleich', () => {
  const owner = readFileSync(`${ROOT}packages/token-usage/assets/token-core.js`, 'utf8');
  const mirror = readFileSync(`${ROOT}packages/token-usage/client.js`, 'utf8');
  const ownerRegion = regionOf(owner, REGION);
  const mirrorRegion = regionOf(mirror, REGION);
  assert.ok(ownerRegion !== null, `die Region ${REGION} fehlt im Besitzer`);
  assert.ok(mirrorRegion !== null, `die Region ${REGION} fehlt in der Client-Haelfte`);
  assert.equal(mirrorRegion, ownerRegion, 'die Regel im Bundle driftet vom geprueften Besitzer');
  // Beide Haelften nennen den Projektions-Schluessel als Literal (kein Import moeglich).
  assert.match(owner, /const TOKEN_USAGE_KEY = 'tokenUsage'/);
  assert.match(mirror, /const TOKEN_USAGE_KEY = 'tokenUsage'/);
});
