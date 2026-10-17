#!/usr/bin/env node
/**
 * Abnahmetest der Performance-Baseline (F1) — die Statistik und der Bericht.
 *
 * Geprüft wird NICHT die Laufzeit (die ist Maschine und Last), sondern dass die
 * Zahlenreihe die Form einer Baseline hat: monotone Perzentile, `n` gleich der
 * Laufzahl, ein stabiles Ergebnis je Fall und die Pflichtfälle aus F1. Dazu der
 * gemessene Bericht auf der Platte: keine Prompt-Inhalte, keine Schlüssel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  REQUIRED_CASES,
  formatTable,
  percentile,
  stabilityOf,
  summarize,
  validateReport,
} from '../../lib/perf-stats.mjs';

const REPORT = fileURLToPath(new URL('../../../docs/probes/perf-baseline.json', import.meta.url));
const BREAKDOWN = fileURLToPath(new URL('../../../docs/probes/index-cold-breakdown.json', import.meta.url));

const validReport = () => {
  const cases = REQUIRED_CASES.map((id) => ({
    id,
    // Der kalte Fall hat eine eigene, kleinere Laufzahl — `runs` steht am Fall.
    ...(id === 'index-cold' ? { runs: 3 } : {}),
    ms: { n: id === 'index-cold' ? 3 : 5, min: 1, p50: 2, p95: 3, max: 4, mean: 2, sd: 1 },
    stability: { stable: true, distinct: 1, samples: 5, values: ['x'] },
  }));
  cases.push({ id: 'index-open', ms: { n: 5, min: 1, p50: 2, p95: 3, max: 4, mean: 2, sd: 1 }, stability: { stable: true } });
  return {
    schema: 'shinon.perf-baseline/v1',
    runtime: { commit: 'a'.repeat(40), branch: 'main', dirty: false, node: '22.0.0', cpus: 4, cpu: 'x' },
    method: { runs: 5, warmup: 1, runsByCase: { 'index-cold': 3 } },
    cases,
    diagnostics: [],
    blockers: [],
  };
};

test('Perzentil: leer ist null, Ränder sind min/max, Mitte interpoliert', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([7], 95), 7);
  assert.equal(percentile([1, 2, 3], 50), 2);
  assert.equal(percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0), 0);
  assert.equal(percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 100), 9);
  assert.equal(Math.round(percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 95) * 1000) / 1000, 8.55);
  assert.equal(percentile([1, 2, 3], Number.NaN), null);
});

test('summarize: n, Monotonie und Streuung — ohne die Reihenfolge der Eingabe zu erben', () => {
  const summary = summarize([3, 1, 2]);
  assert.equal(summary.n, 3);
  assert.equal(summary.min, 1);
  assert.equal(summary.p50, 2);
  assert.equal(summary.max, 3);
  assert.equal(summary.mean, 2);
  assert.ok(summary.min <= summary.p50 && summary.p50 <= summary.p95 && summary.p95 <= summary.max);
  assert.equal(summary.sd, 0.816, 'die Streuung wird aus allen Werten gerechnet, nicht aus zweien');
  assert.equal(summarize([]), null);
  assert.equal(summarize([1, Number.NaN, null, 'x']).n, 1, 'Nicht-Zahlen zählen nicht als Stichprobe');
});

test('Stabilität: gleiche Fingerabdrücke sind stabil, ein anderer macht den Fall unbrauchbar', () => {
  assert.equal(stabilityOf(['a', 'a', 'a']).stable, true);
  const mixed = stabilityOf(['a', 'b', 'a']);
  assert.equal(mixed.stable, false);
  assert.equal(mixed.distinct, 2);
  assert.deepEqual(mixed.values, ['a', 'b']);
});

test('validateReport: der gültige Bericht besteht, jede Verdrehung wird benannt', () => {
  const good = validReport();
  assert.deepEqual(validateReport(good), { ok: true, issues: [] }, validateReport(good).issues.join('; '));

  const brokenOrder = validReport();
  brokenOrder.cases[0].ms.p50 = 9;
  assert.equal(validateReport(brokenOrder).ok, false, 'p50 über max ist kein Messwert');

  const missingCase = validReport();
  missingCase.cases = missingCase.cases.filter((entry) => entry.id !== 'scoring-replay');
  assert.match(validateReport(missingCase).issues.join(' '), /scoring-replay/);

  const wrongCount = validReport();
  wrongCount.cases[0].ms.n = 4;
  assert.match(validateReport(wrongCount).issues.join(' '), /n=4 statt 5/);

  const unstable = validReport();
  unstable.cases[1].stability = { stable: false, distinct: 2 };
  assert.match(validateReport(unstable).issues.join(' '), /nicht deterministisch/);

  const ownRuns = validReport();
  ownRuns.cases[1].runs = 3;
  ownRuns.cases[1].ms.n = 3;
  assert.equal(validateReport(ownRuns).ok, true, 'ein Fall mit eigener Laufzahl (runs) ist erlaubt');
});

test('formatTable nennt Lauf, Streuung und die nicht gemessenen Fälle', () => {
  const report = validReport();
  report.blockers = [{ case: 'model-turn', reason: 'kein Host' }];
  report.diagnostics = [{ id: 'sqlite-first-commit', what: 'eine Zeile', ms: { n: 3, min: 1, p50: 2, p95: 3, max: 3 } }];
  const text = formatTable(report);
  assert.match(text, /5 Läufe je Fall/);
  assert.match(text, /workspace-resolve/);
  assert.match(text, /NICHT GEMESSEN — model-turn: kein Host/);
  assert.match(text, /Diagnose sqlite-first-commit/);
});

test('Kaltlauf-Zerlegung: die Anteile erklären den Lauf, keine Phase ist negativ', () => {
  const probes = JSON.parse(readFileSync(BREAKDOWN, 'utf8'));
  assert.equal(probes.length, 3, 'Zerlegung, FTS-Befund und Doppelarbeit sind drei Proben');
  const report = probes[0].measurements;
  assert.equal(report.schema, 'shinon.index-cold-cost/v1');
  const sum = report.groups.reduce((total, group) => total + group.ms, 0) + report.rest.ms;
  assert.ok(Math.abs(sum - report.total) / report.total < 0.02, `Summe ${sum} gegen Gesamt ${report.total}`);
  const shareSum = report.groups.reduce((total, group) => total + group.share, 0) + report.rest.share;
  assert.ok(Math.abs(shareSum - 100) < 2.5, `Anteile summieren sich auf ${shareSum}`);
  for (const group of [...report.groups, ...report.sqlite, ...report.js]) {
    assert.ok(Number.isFinite(group.ms) && group.ms >= 0, `${group.label}: ${group.ms}`);
  }
  assert.ok(report.diagnostics[0].separateMs > report.diagnostics[0].batchedMs, 'einzeln committet muss teurer sein');
});

test('der gemessene Bericht: Pflichtfälle, monotone Zahlen, keine Inhalte', () => {
  const text = readFileSync(REPORT, 'utf8');
  const probes = JSON.parse(text);
  assert.ok(Array.isArray(probes) && probes.length >= 2, 'docs/probes ist ein Probe-Array (Gate probe-twin)');
  for (const probe of probes) {
    assert.ok(probe.id && probe.claim && probe.expect && probe.evidence, `Probe unvollständig: ${probe.id}`);
    assert.ok(Array.isArray(probe.targets) && probe.targets.length > 0, `${probe.id}: targets fehlen`);
    assert.equal(probe.result, 'BESTAETIGT', `${probe.id}: Ergebnis`);
  }
  const probe = probes.find((entry) => entry.id.startsWith('perf-baseline-lokal-'));
  assert.ok(probe, 'die Baseline-Probe fehlt');
  const report = probe.measurements;
  const verdict = validateReport(report);
  assert.deepEqual(verdict, { ok: true, issues: [] }, verdict.issues.join('; '));
  assert.match(report.runtime.commit, /^[0-9a-f]{40}$|^unavailable$/, 'der SHA ist der Bezugspunkt der Baseline');
  assert.ok(report.method.runs >= 3, 'weniger als drei Läufe sind keine Streuung');
  const ids = report.cases.map((entry) => entry.id);
  for (const id of REQUIRED_CASES) assert.ok(ids.includes(id), `Pflichtfall fehlt: ${id}`);
  assert.equal(text.includes('AGNES_API_KEY'), false, 'kein Schlüsselname im Bericht');
  assert.equal(/sk-[A-Za-z0-9]{16,}/.test(text), false, 'kein Schlüsselwert im Bericht');
  const cold = report.cases.find((entry) => entry.id === 'index-cold');
  assert.deepEqual(Object.keys(cold.input).sort(), ['files', 'root'], 'der Indexfall nennt nur Pfad und Zahl, keinen Inhalt');
  assert.equal(typeof cold.result.readBytes, 'number', 'die gelesene Menge ist eine Zahl, kein Text');
});
