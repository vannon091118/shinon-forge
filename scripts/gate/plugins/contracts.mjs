/**
 * contracts — 7-Punkt-Vertragsform (propsa-Prinzip, nativ).
 *
 * Eine Fähigkeit ist erst implementiert, wenn sie falsifizierbar ist. Jeder
 * Vertrag in docs/contracts/*.json muss die sieben Punkte tragen; ein Vertrag
 * mit Lücken ist eine Behauptung, kein Vertrag.
 *
 * Zustände (propsa): IMPLEMENTED | STUB | NOT_IMPLEMENTED | NOT_VERIFIED
 *   STUB          = die Entscheidung, es nicht zu bauen, ist getroffen.
 *   NOT_VERIFIED  = gebaut, aber niemand hat es geprüft.
 * Beides ist ehrlich, aber es führt zu verschiedenen Entscheidungen.
 *
 * Fehlt docs/contracts/ komplett, meldet das Gate das — nicht als Fehler,
 * sondern als offenen Posten (es gibt dann nichts zu prüfen).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'contracts';

export const GATE_POINTS = ['positive', 'forbidden', 'fallback', 'error', 'trace', 'replay', 'invariant'];
export const STATUS_VALUES = ['IMPLEMENTED', 'STUB', 'NOT_IMPLEMENTED', 'NOT_VERIFIED'];

export function contractIssues(contract, file) {
  const issues = [];
  if (typeof contract !== 'object' || contract === null) return [`${file}: kein Objekt`];
  if (typeof contract.name !== 'string' || contract.name === '') issues.push(`${file}: name fehlt`);
  if (!STATUS_VALUES.includes(contract.status)) {
    issues.push(`${file}: status "${contract.status}" ∉ {${STATUS_VALUES.join(', ')}}`);
  }
  if (!Array.isArray(contract.rules) || contract.rules.length === 0) {
    issues.push(`${file}: rules fehlt oder leer`);
    return issues;
  }
  contract.rules.forEach((rule, i) => {
    const missing = GATE_POINTS.filter((point) => typeof rule?.[point] !== 'string' || rule[point].trim() === '');
    if (missing.length > 0) {
      issues.push(`${file}: Regel ${i + 1} ohne ${missing.join(', ')}`);
    }
  });
  return issues;
}

export function check(ctx) {
  const dir = join(ctx.repo.ROOT, 'docs', 'contracts');
  if (!existsSync(dir)) return [];

  const issues = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const full = join(dir, file);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch (error) {
      issues.push(`${file}: ungültiges JSON (${error.message})`);
      continue;
    }
    issues.push(...contractIssues(parsed, file));
  }
  return issues;
}
