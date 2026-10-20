/**
 * Invalidierung (Wissens-Runtime, Zug 2). Rein, ohne Datenbank und ohne Uhr.
 *
 * Die Kante `a → b` in `fact_deps` heißt: a hängt von b ab. Ändert sich b, wird
 * a stale — und alles, was von a abhängt. Die Kaskade läuft deshalb über die
 * UMKEHRKANTEN: von der geänderten Quelle zu ihren direkten Fakten, von dort zu
 * den Fakten, die auf ihnen stehen.
 *
 * Zwei Zusagen:
 *  - Determinismus: die Reihenfolge der Rückgabe hängt nur vom Graphen ab
 *    (sortiert je Stufe), nicht von der Einfügereihenfolge.
 *  - Fail-closed: ein Zyklus ist ein Befund. Die Kaskade läuft dann nicht,
 *    statt in einer Endlosschleife zu kreisen oder willkürlich zu stoppen.
 */

/** Dreht die Kanten: von „hängt ab von" zu „wird ungültig, wenn". */
export function reverseEdges(edges) {
  const reverse = new Map();
  for (const [factId, dependencies] of edges) {
    for (const dependency of dependencies) {
      if (!reverse.has(dependency)) reverse.set(dependency, []);
      reverse.get(dependency).push(factId);
    }
  }
  for (const list of reverse.values()) list.sort();
  return reverse;
}

/** Findet einen Zyklus im Graphen und nennt seinen ersten Weg. */
export function findCycle(edges) {
  const state = new Map();
  const path = [];
  const visit = (node) => {
    const current = state.get(node);
    if (current === 'active') {
      const start = path.indexOf(node);
      return [...path.slice(start), node];
    }
    if (current === 'done') return null;
    state.set(node, 'active');
    path.push(node);
    for (const next of edges.get(node) ?? []) {
      const found = visit(next);
      if (found) return found;
    }
    path.pop();
    state.set(node, 'done');
    return null;
  };
  for (const node of [...edges.keys()].sort()) {
    const found = visit(node);
    if (found) return found;
  }
  return null;
}

/**
 * Die Menge der Fakten, die durch `direct` ungültig werden: die direkten
 * selbst und danach stufenweise alles, was auf ihnen steht.
 *
 * Rückgabe: { ok, stale: [...], reason } — `stale` ist sortiert und enthält
 * jede Kennung genau einmal.
 */
export function staleClosure(edges, direct) {
  const cycle = findCycle(edges);
  if (cycle) return { ok: false, stale: [], reason: 'ZYKLUS', cycle };
  const dependents = reverseEdges(edges);
  const stale = new Set();
  let frontier = [...new Set(direct)].sort();
  for (const id of frontier) stale.add(id);
  while (frontier.length > 0) {
    const next = new Set();
    for (const id of frontier) {
      for (const dependent of dependents.get(id) ?? []) {
        if (!stale.has(dependent)) next.add(dependent);
      }
    }
    frontier = [...next].sort();
    for (const id of frontier) stale.add(id);
  }
  return { ok: true, stale: [...stale].sort(), reason: '' };
}

/**
 * Revalidierung: derselbe Extraktions-Hash heißt „der Inhalt hat sich nicht
 * geändert", also darf der Fakt wieder gelten. Ein FEHLENDER oder abweichender
 * Hash heißt nicht „gleich" — dann bleibt es bei STALE.
 */
export function mayRevalidate(previousHash, currentHash) {
  if (typeof previousHash !== 'string' || previousHash === '') return { ok: false, reason: 'KEIN_VORHERIGER_HASH' };
  if (typeof currentHash !== 'string' || currentHash === '') return { ok: false, reason: 'KEIN_NEUER_HASH' };
  if (previousHash !== currentHash) return { ok: false, reason: 'INHALT_GEAENDERT' };
  return { ok: true, reason: '' };
}
