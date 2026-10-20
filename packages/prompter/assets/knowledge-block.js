/**
 * Wissensblock (Wissens-Runtime, Zug 3). Rein und importfrei: aus einem
 * Snapshot wird Text für den Hauptagenten, und aus nichts wird nichts.
 *
 * Der Block ist bewusst schlicht: eine Zeile je Fakt, eine Zeile je Constraint,
 * eine Zeile je ungelöstem Konflikt. Er nennt die Kennung und die Revision,
 * damit der Hauptagent etwas prüfen kann, statt einer Behauptung zu glauben.
 *
 * Die Namen der Verträge sind LITERALE auf beiden Seiten (der Kompilator liegt
 * im Projekt-Index, dieses Paket darf ihn nicht importieren); die Drift prüft
 * `packages/prompter/test/knowledge-block.test.mjs` gegen den Vertrag.
 */

export const KNOWLEDGE_CONTRACT = 'shinon.facts/snapshot-v1';
export const KNOWLEDGE_TAG_FACTS = 'project_facts';
export const KNOWLEDGE_TAG_CONSTRAINTS = 'constraints';

function line(parts) {
  return parts.filter((part) => typeof part === 'string' && part !== '').join(' ');
}

/**
 * Rendert den Block. Rückgabe: { text, facts, constraints, conflicts, hash, reason }.
 * `text` ist leer, wenn weder Fakten noch Constraints noch Konflikte vorliegen —
 * ein leerer Block wäre eine Behauptung über Wissen, das nicht da ist.
 */
export function renderKnowledgeBlock(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object') {
    return { text: '', facts: 0, constraints: 0, conflicts: 0, hash: null, reason: 'KEIN_SNAPSHOT' };
  }
  if (snapshot.contract !== KNOWLEDGE_CONTRACT) {
    return { text: '', facts: 0, constraints: 0, conflicts: 0, hash: null, reason: 'FREMDER_VERTRAG' };
  }

  const facts = [...(snapshot.facts ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const constraints = [...(snapshot.constraints ?? [])].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const conflicts = [...(snapshot.conflicts ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (facts.length === 0 && constraints.length === 0 && conflicts.length === 0) {
    return { text: '', facts: 0, constraints: 0, conflicts: 0, hash: snapshot.hash ?? null, reason: 'LEER' };
  }

  const parts = [];
  if (facts.length > 0) {
    const lines = facts.map((fact) => line([
      '-',
      `[${fact.scope}]`,
      `${fact.subject} ${fact.predicate}:`,
      fact.value,
      `(${fact.id}${(fact.revisions ?? []).length > 0 ? ` @ ${fact.revisions.join(', ')}` : ''})`,
    ]));
    parts.push(`<${KNOWLEDGE_TAG_FACTS} contract="${KNOWLEDGE_CONTRACT}">\n${lines.join('\n')}\n</${KNOWLEDGE_TAG_FACTS}>`);
  }
  if (constraints.length > 0 || conflicts.length > 0) {
    const lines = [
      ...constraints.map((entry) => `- ${entry.key}: ${entry.text}`),
      ...conflicts.map((entry) => `- konflikt: ${entry.id}${entry.sources.length > 0 ? ` (${entry.sources.join(', ')})` : ''} — ungelöst`),
    ];
    parts.push(`<${KNOWLEDGE_TAG_CONSTRAINTS}>\n${lines.join('\n')}\n</${KNOWLEDGE_TAG_CONSTRAINTS}>`);
  }

  return {
    text: parts.join('\n\n'),
    facts: facts.length,
    constraints: constraints.length,
    conflicts: conflicts.length,
    hash: snapshot.hash ?? null,
    reason: '',
  };
}

/**
 * Die Spur des Blocks für den Entscheidungsdatensatz: Zahlen und Hash, kein
 * Text. Ein Blocktext im Ereignis wäre derselbe Fehler wie ein Prompt-Text im
 * Provenienz-Datensatz.
 */
export function knowledgeTrace(rendered) {
  return {
    contract: KNOWLEDGE_CONTRACT,
    facts: rendered?.facts ?? 0,
    constraints: rendered?.constraints ?? 0,
    conflicts: rendered?.conflicts ?? 0,
    hash: rendered?.hash ?? null,
    reason: rendered?.reason ?? 'KEIN_SNAPSHOT',
  };
}
