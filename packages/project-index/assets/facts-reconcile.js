/**
 * Reconciliation und Post-Checks (Wissens-Runtime, Zug 4). Rein wie die übrigen
 * Kerne: keine Datenbank, keine Uhr, keine Datei.
 *
 * Zwei Aufgaben:
 *
 * 1. GLEICHES ZUSAMMENFÜHREN. Zwei Fakten mit derselben Aussage (Scope,
 *    Subjekt, Prädikat, Wert) sind EINE Aussage mit mehreren Quellen. Zwei
 *    Fakten mit demselben Schlüssel und VERSCHIEDENEM Wert sind ein
 *    Widerspruch — der wird nicht aufgelöst, sondern sichtbar gemacht.
 *
 * 2. PRÜFUNGEN ABLEITEN. Aus Auftrag und Änderungsbereich folgen gezielte
 *    Checks; ihr Ergebnis wird ein Fakt der Klasse JUDGEMENT mit Beleg. Das ist
 *    eine begrenzte Aussage über eine Prüfung, nie eine absolute Wahrheit.
 */

/**
 * Autorität einer Quelle, abgeleitet aus dem Pfad — nicht aus der Zeit.
 * Soll-Zustand (bestätigter Vertrag/Entscheidung) steht über dem Ist-Zustand
 * (Code), der über der Prosa steht. Das ist die Tabelle aus `contracts/facts.json`.
 */
export function authorityRank(pointer) {
  const path = String(pointer ?? '');
  if (path.startsWith('docs/contracts/')) return 3;
  if (path.startsWith('packages/') || path.startsWith('scripts/') || path.startsWith('bin/')) return 2;
  if (path.startsWith('docs/')) return 1;
  return 0;
}

function keyOf(fact) {
  return [fact.scope, fact.subject, fact.predicate].join('\u0000');
}

function authorityOf(fact) {
  return Math.max(0, ...(fact.sources ?? []).map((entry) => authorityRank(entry?.pointer ?? entry)));
}

/**
 * Führt Fakten zusammen.
 *
 * Rückgabe: { ok, merged, conflicts, unchanged }
 *   merged    — je Schlüssel eine Aussage; gleiche Werte sind EIN Eintrag mit
 *               allen Quellen und Revisionen
 *   conflicts — je Schlüssel mit mehreren Werten ein Eintrag mit allen Seiten,
 *               sortiert nach Autorität (höchste zuerst), dann nach Wert
 */
export function reconcile(facts) {
  const groups = new Map();
  for (const fact of [...(facts ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const key = keyOf(fact);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fact);
  }

  const merged = [];
  const conflicts = [];
  for (const [key, group] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const values = [...new Set(group.map((fact) => fact.value))];
    if (values.length === 1) {
      const [scope, subject, predicate] = key.split('\u0000');
      merged.push({
        key,
        scope,
        subject,
        predicate,
        value: values[0],
        ids: group.map((fact) => fact.id).sort(),
        sources: group.flatMap((fact) => fact.sources ?? []).map((entry) => `${entry.pointer}@${entry.rev}`).sort(),
      });
      continue;
    }
    const sides = values
      .map((value) => {
        const side = group.filter((fact) => fact.value === value);
        return {
          value,
          ids: side.map((fact) => fact.id).sort(),
          authority: Math.max(...side.map(authorityOf)),
          sources: side.flatMap((fact) => fact.sources ?? []).map((entry) => `${entry.pointer}@${entry.rev}`).sort(),
        };
      })
      .sort((a, b) => b.authority - a.authority || (a.value < b.value ? -1 : 1));
    conflicts.push({ key, sides, highest: sides[0].authority, resolved: false });
  }
  return { ok: conflicts.length === 0, merged, conflicts, unchanged: merged.length + conflicts.length };
}

/**
 * Gezielte Post-Checks aus Auftrag und Änderungsbereich. Determinismus vor
 * Vollständigkeit: dieselben Eingaben ergeben dieselbe Liste, sortiert.
 */
export function deriveChecks({ intent = 'UNBEKANNT', changedPaths = [], gates = [] } = {}) {
  const checks = [];
  const packages = [...new Set(
    changedPaths
      .filter((path) => path.startsWith('packages/'))
      .map((path) => path.split('/')[1])
      .filter(Boolean),
  )].sort();
  for (const name of packages) {
    checks.push({ id: `paket:${name}`, kind: 'gate', target: name, reason: 'Paket geändert' });
  }
  if (changedPaths.some((path) => path.startsWith('docs/contracts/'))) {
    checks.push({ id: 'gate:contracts', kind: 'gate', target: 'contracts', reason: 'Vertrag geändert' });
  }
  if (changedPaths.some((path) => path.startsWith('profiles/') || path === 'package.json')) {
    checks.push({ id: 'gate:profile', kind: 'gate', target: 'profile', reason: 'Profil oder Manifest geändert' });
  }
  if (intent === 'MULTI_STEP_TASK' && packages.length > 0) {
    checks.push({ id: 'tests:pakete', kind: 'tests', target: packages.join(','), reason: 'mehrschrittiger Auftrag an Paketen' });
  }
  for (const gate of [...(gates ?? [])].sort()) {
    checks.push({ id: `gate:${gate}`, kind: 'gate', target: gate, reason: 'vom Aufrufer genannt' });
  }
  return checks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Das Urteil als Fakt. `verdict` ist bewusst ein begrenzter Wert
 * (`BESTANDEN`/`VERLETZT`/`UNGEKLAERT`) mit Beleg, kein Wahrheitsanspruch.
 */
export function judgementFact({ check, verdict, evidencePointer, rev, at }) {
  return {
    scope: 'post-check',
    subject: check.id,
    predicate: 'urteil',
    value: `${verdict} @ ${String(at)} — ${check.reason ?? ''}`.trim(),
    kind: 'JUDGEMENT',
    status: 'DISCOVERED',
    sources: [{ pointer: evidencePointer, rev }],
  };
}
