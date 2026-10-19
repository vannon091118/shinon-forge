/**
 * probe-twin — Probe/Twin-Contract (Falsify_Me-Prinzip, nativ).
 *
 * Trennung, die trägt:
 *   - Der STRUKTUR-Prüfer (Validator) sieht nur Form: gibt es Proben, haben
 *     sie Ziele, sind IDs eindeutig? Er urteilt NICHT über Wahrheit.
 *   - Der SEMANTIK-Executor (Twin) führt aus und liefert Evidenz.
 *   - Das Gate entscheidet aus tatsächlichen Ergebnissen, nie aus Prosa.
 *
 * Dieses Gate ist der Validator: es prüft die Probe-Definitionen in
 * docs/probes/*.json strukturell. Es führt nichts aus (kein Netz, kein
 * Modell) — Ausführung ist der Twin, und der gehört nicht in ein Gate.
 *
 * Vokabular (Falsify_Me): BESTAETIGT | WIDERSPRUCH | UNKLAR
 * Verdicts:                 PLAN | RESEARCH | ASK | WRITE
 *
 * Anti-Vakuum: eine Probe ohne Ziel oder ohne erwartetes Ergebnis ist keine
 * Probe. „Wiederholung ist kein Beweis" — eine leere Probe bestätigt nichts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'probe-twin';

export const PROBE_RESULTS = ['BESTAETIGT', 'WIDERSPRUCH', 'UNKLAR'];
export const VERDICTS = ['PLAN', 'RESEARCH', 'ASK', 'WRITE'];

/**
 * `nachtrag` — die standardisierte Nachmessung.
 *
 * Warum es das Feld gibt und warum es eine FORM hat: eine Probe wird nicht
 * nachträglich aktuell gemacht (`docs/INDEX.md` §2), aber eine Aussage kann durch
 * eine spätere Messung teilweise überholt sein. Statt den Belegtext still zu
 * überschreiben, trägt die Probe einen Nachtrag mit DATUM und GELTUNGSBEREICH —
 * maschinenlesbar, damit er nicht zur Prosa wird, die niemand prüft.
 *
 * @param {unknown} nachtrag
 * @param {string} file
 */
export function nachtragIssues(nachtrag, file) {
  const issues = [];
  if (typeof nachtrag !== 'object' || nachtrag === null || Array.isArray(nachtrag)) {
    return [`${file}: nachtrag muss ein Objekt {date, scope, note} sein`];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nachtrag.date ?? '')) {
    issues.push(`${file}: nachtrag.date fehlt oder ist kein YYYY-MM-DD`);
  }
  if (typeof nachtrag.scope !== 'string' || nachtrag.scope.trim() === '') {
    issues.push(`${file}: nachtrag.scope fehlt (welche Aussage gilt nicht mehr?)`);
  }
  if (typeof nachtrag.note !== 'string' || nachtrag.note.trim() === '') {
    issues.push(`${file}: nachtrag.note fehlt`);
  }
  return issues;
}

export function probeIssues(probe, file) {
  const issues = [];
  if (typeof probe !== 'object' || probe === null) return [`${file}: kein Objekt`];
  if (probe.nachtrag !== undefined) issues.push(...nachtragIssues(probe.nachtrag, file));
  if (typeof probe.id !== 'string' || probe.id === '') issues.push(`${file}: id fehlt`);
  if (typeof probe.claim !== 'string' || probe.claim.trim() === '') {
    issues.push(`${file}: claim fehlt (ohne Behauptung keine Falsifikation)`);
  }
  if (!Array.isArray(probe.targets) || probe.targets.length === 0) {
    issues.push(`${file}: targets fehlt (Anti-Vakuum: Probe ohne Ziel)`);
  }
  if (typeof probe.expect !== 'string' || probe.expect.trim() === '') {
    issues.push(`${file}: expect fehlt (Anti-Vakuum: Probe ohne Erwartung)`);
  }
  if (probe.result !== undefined && !PROBE_RESULTS.includes(probe.result)) {
    issues.push(`${file}: result "${probe.result}" ∉ {${PROBE_RESULTS.join(', ')}}`);
  }
  if (probe.verdict !== undefined && !VERDICTS.includes(probe.verdict)) {
    issues.push(`${file}: verdict "${probe.verdict}" ∉ {${VERDICTS.join(', ')}}`);
  }
  return issues;
}

export function check(ctx) {
  const dir = join(ctx.repo.ROOT, 'docs', 'probes');
  if (!existsSync(dir)) return [];

  const issues = [];
  const seen = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      issues.push(`${file}: ungültiges JSON (${error.message})`);
      continue;
    }
    const probes = Array.isArray(parsed) ? parsed : [parsed];
    probes.forEach((probe, i) => {
      const label = Array.isArray(parsed) ? `${file}[${i}]` : file;
      issues.push(...probeIssues(probe, label));
      if (probe?.id) {
        if (seen.has(probe.id)) issues.push(`${label}: doppelte Probe-id "${probe.id}"`);
        seen.add(probe.id);
      }
    });
  }
  return issues;
}
