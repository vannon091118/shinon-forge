/**
 * perf-stats.mjs — die Statistik der Performance-Baseline, ohne Messung.
 *
 * Getrennt von `scripts/perf-baseline.mjs`, weil dieses Skript beim Import
 * messen würde: hier stehen nur reine Funktionen, die ein Unit-Test ohne
 * Repo-Scan, ohne DSH und ohne Modell prüfen kann. Die Zahlen selbst kommen
 * aus dem Lauf, nicht aus diesem Modul.
 */

/** Ein Perzentil mit linearer Interpolation zwischen den beiden Nachbar-Rängen. */
export function percentile(sorted, p) {
  if (!Array.isArray(sorted) || sorted.length === 0) return null;
  if (!Number.isFinite(p)) return null;
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const weight = rank - low;
  return sorted[low] + (sorted[high] - sorted[low]) * weight;
}

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * Kennzahlen EINER Messreihe (ms je Operation, schon durch `reps` geteilt).
 * `n` ist die Zahl der Stichproben, nicht die Zahl der Operationen.
 */
export function summarize(values) {
  const clean = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  const mean = clean.reduce((total, value) => total + value, 0) / clean.length;
  const variance = clean.reduce((total, value) => total + (value - mean) ** 2, 0) / clean.length;
  return {
    n: clean.length,
    min: round(sorted[0]),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    max: round(sorted[sorted.length - 1]),
    mean: round(mean),
    sd: round(Math.sqrt(variance)),
  };
}

/** Ein kurzer, stabiler Fingerabdruck eines Ergebnisses — für die Determinismus-Prüfung. */
export function digestValue(value, hash) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return hash(text);
}

/**
 * Sind alle Stichproben dasselbe Ergebnis? Ein wechselnder Wert heißt: die
 * Messung enthält Zustand (Cache, mtime, Zufall) — dann ist die Zahl keine
 * Baseline, sondern eine Stichprobe aus mehreren Welten.
 */
export function stabilityOf(digests) {
  const list = (Array.isArray(digests) ? digests : []).map(String);
  const distinct = [...new Set(list)].sort();
  return {
    stable: distinct.length === 1,
    distinct: distinct.length,
    samples: list.length,
    values: distinct.slice(0, 4),
  };
}

/** Pflichtfälle: fehlt einer, ist die Baseline nicht die Baseline aus F1. */
export const REQUIRED_CASES = [
  'workspace-resolve',
  'file-scan',
  'index-cold',
  'index-warm',
  'scoring-replay',
  'one-shot-local',
];

/**
 * Die Form des Berichts prüfen — nicht die Zahlen. Geprüft wird, dass jede
 * Zahlenreihe monoton ist (min ≤ p50 ≤ p95 ≤ max), dass `n` zur Laufzahl passt
 * und dass die Pflichtfälle da sind. Ein Bericht, der das nicht erfüllt, ist
 * ein Tippfehler mit Zeitstempel.
 */
export function validateReport(report, { required = REQUIRED_CASES } = {}) {
  const issues = [];
  if (report === null || typeof report !== 'object') return { ok: false, issues: ['kein Bericht'] };
  if (report.schema !== 'shinon.perf-baseline/v1') issues.push(`Schema: ${report.schema}`);
  if (typeof report.runtime?.commit !== 'string' || report.runtime.commit === '') issues.push('runtime.commit fehlt');
  if (!Number.isInteger(report.method?.runs) || report.method.runs < 3) issues.push('method.runs fehlt oder < 3');
  const cases = Array.isArray(report.cases) ? report.cases : [];
  if (cases.length === 0) issues.push('keine Fälle');
  const ids = new Set(cases.map((entry) => entry?.id));
  for (const id of required) {
    if (!ids.has(id)) issues.push(`Pflichtfall fehlt: ${id}`);
  }
  for (const entry of cases) {
    const ms = entry?.ms;
    if (ms === null || typeof ms !== 'object') {
      issues.push(`${entry?.id}: ms fehlt`);
      continue;
    }
    for (const key of ['n', 'min', 'p50', 'p95', 'max', 'mean', 'sd']) {
      if (!Number.isFinite(ms[key])) issues.push(`${entry.id}: ms.${key} ist keine Zahl`);
    }
    if (Number.isFinite(ms.min) && Number.isFinite(ms.max)) {
      if (!(ms.min <= ms.p50 && ms.p50 <= ms.p95 && ms.p95 <= ms.max)) {
        issues.push(`${entry.id}: min/p50/p95/max nicht monoton`);
      }
    }
    const expected = Number.isInteger(entry.runs) ? entry.runs : report.method?.runs;
    if (ms.n !== expected) issues.push(`${entry.id}: n=${ms.n} statt ${expected}`);
    if (entry.stability?.stable !== true) issues.push(`${entry.id}: Ergebnis nicht deterministisch`);
  }
  return { ok: issues.length === 0, issues };
}

const ms = (value) => (value >= 10 ? value.toFixed(1) : value.toFixed(3));

/** Die Tabelle, die ein Mensch liest. `unit` schaltet nur die Anzeige um. */
export function formatTable(report) {
  const lines = [];
  lines.push(`Baseline ${report.runtime.commit ?? '?'} (${report.runtime.branch ?? '?'}${report.runtime.dirty ? ', schmutzig' : ''})`);
  lines.push(`Node ${report.runtime.node} · ${report.runtime.cpus}x ${report.runtime.cpu}`);
  lines.push(`${report.method.runs} Läufe je Fall, ${report.method.warmup} Aufwärmläufe, Einheit: ms je Operation`);
  lines.push('');
  lines.push('Fall                 |    n |   min |   p50 |   p95 |   max |    sd | Größe');
  lines.push('---------------------|------|-------|-------|-------|-------|-------|------');
  for (const entry of report.cases) {
    const size = entry.input?.files !== undefined ? `${entry.input.files} Dateien`
      : entry.input?.bytes !== undefined ? `${(entry.input.bytes / 1024).toFixed(0)} KiB`
        : entry.input?.records !== undefined ? `${entry.input.records} Datensätze`
          : '—';
    lines.push(
      `${entry.id.padEnd(20)} | ${String(entry.ms.n).padStart(4)} | ${ms(entry.ms.min).padStart(5)} | ` +
        `${ms(entry.ms.p50).padStart(5)} | ${ms(entry.ms.p95).padStart(5)} | ${ms(entry.ms.max).padStart(5)} | ` +
        `${ms(entry.ms.sd).padStart(5)} | ${size}`,
    );
  }
  for (const entry of Array.isArray(report.diagnostics) ? report.diagnostics : []) {
    lines.push('');
    lines.push(`Diagnose ${entry.id}: p50 ${ms(entry.ms.p50)} ms (n=${entry.ms.n}, min ${ms(entry.ms.min)}, max ${ms(entry.ms.max)})`);
    if (entry.compare?.ms) {
      lines.push(`  Vergleich ${entry.compare.id}: p50 ${ms(entry.compare.ms.p50)} ms (n=${entry.compare.ms.n})`);
    }
    lines.push(`  ${entry.what}`);
  }
  if (Array.isArray(report.blockers) && report.blockers.length > 0) {
    lines.push('');
    for (const blocker of report.blockers) lines.push(`NICHT GEMESSEN — ${blocker.case}: ${blocker.reason}`);
  }
  return lines.join('\n');
}
