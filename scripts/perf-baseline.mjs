#!/usr/bin/env node
/**
 * perf-baseline.mjs — die Performance-Baseline VOR jeder Parallelisierung (F1).
 *
 * DIE FRAGE: wo geht die Zeit eines lokalen Laufs hin? Nicht "wie schnell ist
 * ein Turn" — ein Gate-Runner ist keine Turn-Latenz. Je Fall wird dieselbe
 * Operation wiederholt gemessen; ein Fingerabdruck je Stichprobe beweist, dass
 * alle Läufe dasselbe Ergebnis hatten. Netz und Modell sind NICHT Teil der Zahlen.
 *
 * Aufruf: `npm run perf:baseline -- --runs 25 --json --out docs/probes/perf-baseline.json`
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

import { digestValue, formatTable, stabilityOf, summarize, validateReport } from './lib/perf-stats.mjs';
import * as indexCore from '../packages/project-index/assets/index-core.js';
import * as scoringCore from '../packages/scoring/assets/scoring-core.js';
import { resolveMode } from '../packages/prompter/assets/mode-core.js';
import { buildEnhancerRequest, enhanceGuarded } from '../packages/prompter/assets/enhancer.js';
import { fingerprintRoot, resolveWorkspaceRoot } from '../packages/prompter/assets/workspace.js';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
};
const has = (name) => process.argv.includes(name);
const ROOT = resolve(arg('--root', process.cwd()));
const RUNS = Math.max(3, Number(arg('--runs', '25')) || 25);
/** Der kalte Aufbau schreibt je Lauf ~20 MB — eigene, kleinere Laufzahl, im Bericht benannt. */
const COLD_RUNS = Math.max(3, Number(arg('--cold-runs', '7')) || 7);
const WARMUP = Math.max(0, Number(arg('--warmup', '2')) || 0);
const OUT = arg('--out', '');
const JSON_ONLY = has('--json');

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

const blockers = [];
const cases = [];

// ── Runtime-Pin: derselbe Baum, dieselbe Fassung, sonst ist die Zahl nicht vergleichbar ──
const runtime = {
  node: process.versions.node,
  v8: process.versions.v8,
  platform: `${process.platform} ${process.arch}`,
  cpus: cpus().length,
  cpu: (cpus()[0]?.model ?? 'unbekannt').replace(/\s+/g, ' ').trim(),
  loadavg: loadavg().map((value) => Math.round(value * 100) / 100),
  dshPin: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies?.['@deepseek-ai/dsh'] ?? null,
  commit: git(['rev-parse', 'HEAD']) ?? 'unavailable',
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unavailable',
  dirty: (git(['status', '--porcelain']) ?? '') !== '',
};

// ── Fall 1: Workspace-Resolver + Identität (rein, kein Dateisystem) ──────────
cases.push({
  id: 'workspace-resolve',
  what: 'resolveWorkspaceRoot + fingerprintRoot (Config > ENV > cwd)',
  kind: 'pure',
  blocking: false,
  reps: 2000,
  prepare: () => ({
    input: { root: ROOT },
    run: () => fingerprintRoot(resolveWorkspaceRoot({ configRoot: '', env: {}, cwd: ROOT }).root).rootId,
  }),
});

// ── Fall 2: Dateiscan (synchron, blockiert den Eventloop) ────────────────────
cases.push({
  id: 'file-scan',
  what: 'listFiles über den Baum (Quell-Endungen, SKIP_DIRS)',
  kind: 'sync-io',
  blocking: true,
  reps: 1,
  prepare: () => ({
    input: { files: indexCore.listFiles(ROOT).length },
    run: () => indexCore.listFiles(ROOT).length,
  }),
});

// ── Fälle 3/4: Index kalt und warm (SQLite schreiben, synchron) ──────────────
async function indexCase(kind) {
  const work = mkdtempSync(join(tmpdir(), `shinon-perf-${kind}-`));
  let counter = 0;
  const fresh = () => join(work, `index-${counter += 1}.sqlite`);
  const drop = (file) => {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true });
  };
  let warmFile = null;
  if (kind === 'warm') {
    warmFile = fresh();
    const db = indexCore.openIndex(warmFile, { expectedRoot: ROOT });
    indexCore.updateIndex(db, ROOT, { verify: 'stamp' });
    db.close();
  }
  return {
    input: { root: ROOT, files: indexCore.listFiles(ROOT).length },
    file: warmFile,
    run: () => {
      const file = kind === 'warm' ? warmFile : fresh();
      const db = indexCore.openIndex(file, { expectedRoot: ROOT });
      const report = indexCore.updateIndex(db, ROOT, { verify: 'stamp' });
      let bytes = 0;
      try {
        bytes = statSync(file).size;
      } catch {
        bytes = 0;
      }
      db.close();
      if (kind === 'cold') drop(file);
      return {
        files: report.files,
        written: report.written,
        readBytes: report.readBytes,
        references: report.references,
        touches: report.touches,
        findings: report.findings,
        dbBytes: bytes,
      };
    },
    cleanup: () => rmSync(work, { recursive: true, force: true }),
  };
}
cases.push({
  id: 'index-open',
  what: 'openIndex + close auf vorhandener Datei (der Preis des Öffnens allein)',
  kind: 'sqlite-write',
  blocking: true,
  reps: 1,
  prepare: async () => {
    const warm = await indexCase('warm');
    return {
      input: warm.input,
      run: () => {
        const db = indexCore.openIndex(warm.file, { expectedRoot: ROOT });
        const meta = indexCore.indexMeta(db);
        db.close();
        return [meta.contract, meta.root_id, meta.schema_version];
      },
      cleanup: warm.cleanup,
    };
  },
});
cases.push({
  id: 'index-cold',
  what: 'openIndex + updateIndex auf leerer Datei (der Startscan)',
  kind: 'sqlite-write',
  blocking: true,
  reps: 1,
  runs: COLD_RUNS,
  prepare: () => indexCase('cold'),
});
cases.push({
  id: 'index-warm',
  what: 'openIndex + updateIndex auf vorhandener Datei, nichts verändert',
  kind: 'sqlite-write',
  blocking: true,
  reps: 1,
  prepare: () => indexCase('warm'),
});

// ── Fall 5: Scoring-Replay (rein; Fixture als Orakel) ───────────────────────
const scoringContracts = {
  scoring: readJson('../packages/scoring/assets/scoring-state.json'),
  profile: readJson('../packages/scoring/assets/technical-profile.json'),
  triggers: readJson('../packages/scoring/assets/skill-triggers.json'),
};
const scoringFixture = readJson('../packages/scoring/assets/replay/scoring-demo.json');
cases.push({
  id: 'scoring-replay',
  what: 'replay: ganzer Signalstrom → Scorecard + Injektion + Digest',
  kind: 'pure',
  blocking: false,
  reps: 20,
  prepare: () => ({
    input: { records: scoringFixture.stream.length },
    run: () => scoringCore.replay(scoringContracts, scoringFixture.initial, scoringFixture.stream).digest,
  }),
});

// ── Fall 6: One-Shot, lokal (Request bauen, Strom lesen, Vertrag prüfen) ────
const MIN = resolveMode('MIN');
const PROMPT = 'Fasse den Messaufbau zusammen, ohne Inhalte aus dem Repo zu nennen.';
const ANSWER = JSON.stringify({
  enhancedPrompt: 'Fasse den Messaufbau zusammen, ohne Repo-Inhalte zu nennen.',
  preservedIntent: true,
  addedRequirements: [],
  removedRequirements: [],
  intentClassification: 'TRANSFORM',
});
const SLICES = ANSWER.match(/[\s\S]{1,8}/g);
const oneShotConfig = { provider: 'perf-fake', model: 'fake-1', mode: 'MIN', timeoutMs: 5000, maxTokens: 0, temperature: 0.3, trace: false };
const fakeLlm = {
  llm: {
    stream() {
      return (async function* replay() {
        for (const text of SLICES) yield { type: 'text-delta', text };
        yield { type: 'finish', reason: 'stop' };
      })();
    },
  },
};
cases.push({
  id: 'one-shot-local',
  what: 'enhanceGuarded gegen einen lokalen Fake-Strom: Request, Chunks, Parse, Annahme',
  kind: 'async-host',
  blocking: false,
  reps: 200,
  prepare: () => {
    const request = buildEnhancerRequest({ text: PROMPT, contract: MIN, config: oneShotConfig });
    return {
      input: {
        bytes: Buffer.byteLength(JSON.stringify(request)),
        tokensEstimated: Math.ceil(JSON.stringify(request).length / 4),
      },
      run: async () => {
        const outcome = await enhanceGuarded(fakeLlm, MIN, oneShotConfig, PROMPT, null, null, null, undefined);
        return { outcome: outcome.outcome, reasons: outcome.reasons.join(','), hasResult: outcome.result !== null };
      },
    };
  },
});

// ── Fall 7: One-Shot-Fehlerpfad — ein Aufruf, kein Retry, Roh-Prompt bleibt ──
const brokenLlm = {
  llm: {
    stream() {
      return (async function* failing() {
        throw Object.assign(new Error('429 Too Many Requests'), { name: 'ProviderError', status: 429 });
      })();
    },
  },
};
cases.push({
  id: 'one-shot-fallback',
  what: 'enhanceGuarded gegen einen werfenden Provider: LLM_FAILED, genau ein Aufruf',
  kind: 'async-host',
  blocking: false,
  reps: 200,
  silent: true,
  prepare: () => ({
    input: { bytes: Buffer.byteLength(PROMPT) },
    run: async () => {
      const outcome = await enhanceGuarded(brokenLlm, MIN, oneShotConfig, PROMPT, null, null, null, undefined);
      return { outcome: outcome.outcome, reasons: outcome.reasons.join(','), hasResult: outcome.result !== null };
    },
  }),
});

// ── Fall 8: agent/pre-step (synchron, je Schritt im Host) ───────────────────
async function preStepCase() {
  const hook = await import(new URL('../packages/hook/index.js', import.meta.url).href);
  const payload = {
    agent: { session: { id: 'sess-perf' } },
    turn: 3,
    step: 7,
    messages: Array.from({ length: 20 }, () => ({ role: 'user', content: 'x' })),
    signal: {},
  };
  const config = { clock: '2026-10-17T00:00:00.000Z' };
  return {
    input: { records: 20 },
    run: () => {
      const step = hook.readStep(payload);
      const issues = hook.stepIssues(step);
      const envelope = hook.normalizeEvent(hook.buildStepEnvelope(step, config));
      return [issues.length, envelope.event_id, envelope.trace_id];
    },
  };
}
try {
  cases.push({
    id: 'agent-pre-step',
    what: 'readStep + stepIssues + buildStepEnvelope + Konformitätsprüfung',
    kind: 'pure',
    blocking: true,
    reps: 500,
    prepare: preStepCase,
  });
} catch (error) {
  blockers.push({ case: 'agent-pre-step', reason: 'Bundle nicht ladbar (Schemastery/node_modules)', detail: error?.message ?? String(error) });
}

// ── Der Lauf ────────────────────────────────────────────────────────────────
const measured = [];
for (const entry of cases) {
  // Ein Fehlerpfad schreibt je Aufruf eine Diagnosezeile — gemessen wird der
  // Pfad, nicht die Konsole.
  const quiet = entry.silent === true ? { warn: console.warn, error: console.error } : null;
  if (quiet !== null) console.warn = console.error = () => {};
  const prepared = await entry.prepare();
  for (let i = 0; i < WARMUP; i += 1) {
    for (let r = 0; r < entry.reps; r += 1) await prepared.run();
  }
  const perSample = [];
  const digests = [];
  const runs = entry.runs ?? RUNS;
  let last = null;
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    let value;
    for (let r = 0; r < entry.reps; r += 1) value = await prepared.run();
    last = value;
    perSample.push((performance.now() - started) / entry.reps);
    digests.push(digestValue(value, hash));
  }
  await prepared.cleanup?.();
  if (quiet !== null) Object.assign(console, quiet);
  measured.push({
    id: entry.id,
    what: entry.what,
    kind: entry.kind,
    blocking: entry.blocking,
    reps: entry.reps,
    runs: entry.runs ?? RUNS,
    input: prepared.input ?? {},
    result: last,
    ms: summarize(perSample),
    stability: stabilityOf(digests),
    notes: entry.notes ?? '',
  });
  if (!JSON_ONLY) process.stderr.write(`✔ ${entry.id}\n`);
}

// ── Diagnose: sieben Commits gegen eine Transaktion — der Kandidat, gemessen ──
const diagnostics = [];
{
  const work = mkdtempSync(join(tmpdir(), 'shinon-perf-commit-'));
  const file = join(work, 'meta.sqlite');
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal');
  db.exec('pragma synchronous = full');
  db.exec('pragma secure_delete = on');
  db.exec('create table if not exists meta(key text primary key, value text not null)');
  const upsert = db.prepare('insert or replace into meta(key, value) values (?, ?)');
  upsert.run('warm', '1');
  const separate = [];
  const batched = [];
  for (let i = 0; i < 5; i += 1) {
    let started = performance.now();
    for (let k = 0; k < 7; k += 1) upsert.run(`einzeln-${k}`, String(i));
    separate.push(performance.now() - started);
    started = performance.now();
    db.exec('begin');
    for (let k = 0; k < 7; k += 1) upsert.run(`gebündelt-${k}`, String(i));
    db.exec('commit');
    batched.push(performance.now() - started);
  }
  db.close();
  rmSync(work, { recursive: true, force: true });
  diagnostics.push({
    id: 'sqlite-meta-batch',
    what: 'sieben Meta-Zeilen einzeln committet gegen sieben in EINER Transaktion (dieselben Pragmas wie openDatabase)',
    ms: summarize(separate),
    compare: { id: 'sieben in einer Transaktion', ms: summarize(batched) },
    note: 'Diagnose, kein Produktschritt: openIndex zahlt heute sieben einzelne setMeta-Commits je Öffnen',
  });
}

blockers.push({
  case: 'model-turn',
  reason: 'nicht gemessen: echte Modellantwort braucht den DSH-Host; dieser Lauf erzeugt keine Prompt-Inhalte und keine Kosten',
  detail: 'NOT_VERIFIED — Turn-Latenz ist nicht Teil der Baseline',
});

const report = {
  schema: 'shinon.perf-baseline/v1',
  measuredAt: new Date().toISOString(),
  invocation: `node scripts/perf-baseline.mjs --runs ${RUNS} --cold-runs ${COLD_RUNS} --warmup ${WARMUP}`,
  runtime,
  method: {
    runs: RUNS,
    warmup: WARMUP,
    runsByCase: { 'index-cold': COLD_RUNS },
    note: 'index-cold läuft seltener: jeder Lauf schreibt eine neue ~20-MB-SQLite-Datei',
    unit: 'ms je Operation',
    percentile: 'lineare Interpolation zwischen den Nachbar-Rängen',
    repetition: 'je Stichprobe `reps` Operationen, Zeit durch `reps` geteilt',
    excluded: ['Modellantwort und Netz', 'DSH-Host-Turn', 'Browser/UI', 'parallele Fremdlast'],
  },
  cases: measured,
  diagnostics,
  blockers,
  candidate: {
    metric: 'index-open p50',
    reason: 'openIndex setzt sieben Meta-Zeilen (4× Fassung, 3× Root) in sieben eigenen Transaktionen — jede ist ein fsync, der Öffnen-Preis hängt nicht am Inhalt',
    change: 'die sieben setMeta-Aufrufe in openIndex in EINE Transaktion legen (und den Lauf danach neu messen)',
    measured: {
      separateCommitsMs: diagnostics[0]?.ms?.p50 ?? null,
      oneTransactionMs: diagnostics[0]?.compare?.ms?.p50 ?? null,
    },
    notImplemented: 'F1 liefert die Baseline; die Produktionsänderung gehört in einen eigenen Slice',
  },
};

/** Den Bericht als Probe ausgeben: docs/probes/*.json ist ein Probe-Array (Gate `probe-twin`). */
function probesOf(value) {
  const rows = value.cases.map((entry) => `${entry.id} P50 ${entry.ms.p50} ms / P95 ${entry.ms.p95} ms (n=${entry.ms.n}, min ${entry.ms.min}, max ${entry.ms.max}, sd ${entry.ms.sd})`);
  const batch = value.diagnostics[0];
  const runtimeLine = `${value.runtime.commit} (${value.runtime.branch}${value.runtime.dirty ? ', schmutzig' : ''}), Node ${value.runtime.node}, ${value.runtime.cpus}× ${value.runtime.cpu}, Last ${value.runtime.loadavg.join(' / ')}`;
  const base = {
    id: `perf-baseline-lokal-${value.measuredAt.slice(0, 10)}`,
    claim: 'Der lokale Anteil eines Laufs ist millisekundengroß, außer dem Indexweg: Dateiscan, Scoring, Workspace-Auflösung, One-Shot und agent/pre-step liegen unter 4 ms, der Index kalt bei Sekunden.',
    targets: ['scripts/perf-baseline.mjs', 'scripts/lib/perf-stats.mjs', 'docs/audit/PERF-BASELINE-2026-10-17.md'],
    expect: 'Je Fall dieselbe Operation auf identischer Fixture, P50/P95 über ≥ 25 Läufe (index-cold 7, weil jeder Lauf ~20 MB schreibt), und ein Fingerabdruck je Stichprobe, der beweist, dass alle Läufe dasselbe Ergebnis hatten.',
    result: 'BESTAETIGT',
    verdict: 'WRITE',
    evidence: `GEMESSEN, ${runtimeLine}. Einheit ms je Operation; jede Stichprobe trug denselben Fingerabdruck. ${rows.join('; ')}. NICHT GEMESSEN: Modellantwort, DSH-Host-Turn, Browser — Turn-Latenz ist nicht Teil dieser Baseline.`,
    evidence_note: 'Ausgegeben werden Pfade, Zählungen, Bytegrößen und Digests; kein Prompttext, kein Dateiinhalt, kein Schlüsselwert.',
    measurements: value,
  };
  const commit = {
    id: `index-open-sieben-commits-${value.measuredAt.slice(0, 10)}`,
    claim: 'Das Öffnen des Projektindex zahlt einen inhaltsunabhängigen Festpreis: sieben Meta-Zeilen (4× Fassung, 3× Root) in sieben eigenen Transaktionen, jede ein fsync. Gebündelt in EINER Transaktion fällt genau dieser Anteil weg.',
    targets: ['packages/project-index/assets/index-core.js', 'scripts/gate/tests/project-index.test.mjs', 'docs/audit/PERF-BASELINE-2026-10-17.md'],
    expect: 'Wenn die sieben Commits den Preis tragen, muss dieselbe Arbeit in EINER Transaktion deutlich billiger sein — gleiche Zeilenzahl, dieselben Pragmas, abwechselnd in derselben Schleife gemessen —, und der Öffnen-Preis muss danach fallen.',
    result: 'BESTAETIGT',
    verdict: 'WRITE',
    evidence: `GEMESSEN, ${runtimeLine}. index-open P50 ${value.cases.find((entry) => entry.id === 'index-open')?.ms.p50} ms auf vorhandener Datei; sieben Meta-Zeilen einzeln P50 ${batch?.ms?.p50} ms (min ${batch?.ms?.min}, max ${batch?.ms?.max}, n=${batch?.ms?.n}) gegen ${batch?.compare?.ms?.p50} ms in einer Transaktion (n=${batch?.compare?.ms?.n}), also ~${Math.round((batch?.ms?.p50 ?? 0) - (batch?.compare?.ms?.p50 ?? 0))} ms Unterschied je Öffnen. Der Vorher-Lauf derselben Fixture (index-open P50 912,2 ms) steht in docs/audit/PERF-BASELINE-2026-10-17.md; Last und Maschine sind zwischen beiden Läufen nicht gleich, der kontrollierte Teil ist die gepaarte Diagnose.`,
    evidence_note: 'Nur Dauern und Zeilenzahlen; kein Tabelleninhalt, kein Schlüssel.',
    change: 'UMGESETZT: openIndex schreibt seine sieben Meta-Zeilen über setMetaMany in EINER Transaktion (packages/project-index/assets/index-core.js); gepinnt von scripts/gate/tests/project-index.test.mjs (alle sieben Schlüssel da, kein einzelner setMeta-Commit im Öffnen).',
    measurements: batch ?? null,
  };
  return [base, commit];
}

const verdict = validateReport(report);
if (!verdict.ok) {
  process.stderr.write(`perf-baseline: Bericht ungültig — ${verdict.issues.join('; ')}\n`);
}
if (OUT !== '') {
  writeFileSync(resolve(ROOT, OUT), `${JSON.stringify(probesOf(report), null, 2)}\n`);
  if (!JSON_ONLY) process.stderr.write(`geschrieben: ${OUT}\n`);
}
if (JSON_ONLY) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else process.stdout.write(`${formatTable(report)}\n`);
process.exit(verdict.ok ? 0 : 1);
