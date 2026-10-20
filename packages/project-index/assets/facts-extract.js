/**
 * Extraktoren (Wissens-Runtime, Zug 2). Quellenspezifisch und deterministisch:
 * dieselbe Quelle mit derselben Revision ergibt dieselben Fakten in derselben
 * Reihenfolge, und derselbe Inhalt ergibt denselben Extraktions-Hash.
 *
 * Es gibt KEINEN generischen Fallback. Eine unbekannte Quelle ist ein Befund
 * (QUELLE_UNBEKANNT), keine Zeile-für-Zeile-Zerlegung von Text. Grenzen sind
 * hart und laut: ein zu langer Wert wird mit WERT_ZU_LANG abgelehnt, nie
 * abgeschnitten; eine Quelle über dem Fakten-Budget meldet den Rest als
 * BUDGET_ERSCHOEPFT, statt ihn still fallen zu lassen.
 */
import { factId } from './facts-core.js';

export const EXTRACTOR_VERSION = 1;
export const MAX_VALUE_CHARS = 400;
export const MAX_FACTS_PER_SOURCE = 40;

/** Quellen, die dieser Stand kennt. Eine neue Quelle ist eine neue Zeile hier. */
export const SOURCE_KINDS = Object.freeze(['contract', 'commit', 'symbols']);

const DERIVED = 'DERIVED';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Vertragsdatei: der Status wird zum Fakt, jede Regel zu einem abgeleiteten
 * Fakt mit ihrer `positive`-Aussage. Eine Datei ohne `rules` ist kein Vertrag
 * und ergibt einen Befund — nicht null Fakten und keinen Erfolg.
 */
function fromContract(source) {
  let parsed;
  try {
    parsed = JSON.parse(source.content);
  } catch {
    return { facts: [], error: 'QUELLE_UNLESBAR' };
  }
  if (!Array.isArray(parsed?.rules) || parsed.rules.length === 0) {
    return { facts: [], error: 'QUELLE_OHNE_REGELN' };
  }
  const facts = [];
  const status = text(parsed.status);
  if (status !== '') {
    facts.push({
      scope: source.path,
      subject: 'vertrag',
      predicate: 'status',
      value: status,
      kind: 'FACT',
    });
  }
  parsed.rules.forEach((rule, index) => {
    const positive = text(rule?.positive);
    if (positive === '') return;
    facts.push({
      scope: source.path,
      subject: `regel-${index + 1}`,
      predicate: 'positive',
      value: positive,
      kind: DERIVED,
    });
  });
  return { facts };
}

/**
 * Commit-Nachricht: der Vannon-Trailer und die verbotenen Fußzeilen sind die
 * Aussagen, die das Repo prüft. Andere Zeilen werden nicht zu Fakten — Prosa
 * ist keine Tatsache über den Code.
 */
function fromCommit(source) {
  const lines = String(source.content).split('\n').map((line) => line.trim());
  const facts = [];
  const trailer = lines.find((line) => /^created by VANNON — /.test(line));
  if (trailer) {
    facts.push({
      scope: source.path,
      subject: 'commit',
      predicate: 'trailer',
      value: trailer,
      kind: 'FACT',
    });
  }
  const footers = lines.filter((line) => /^(co-authored-by|generated with|powered by)\b/i.test(line));
  if (footers.length > 0) {
    facts.push({
      scope: source.path,
      subject: 'commit',
      predicate: 'verbotene-fusszeile',
      value: footers.join(' | '),
      kind: 'FACT',
    });
  }
  return { facts };
}

/**
 * Index-Symbole: die Ausgabe des Projektindex als JSON-Liste
 * [{ path, name, kind }]. Jedes Symbol wird ein abgeleiteter Fakt; sortiert
 * nach Pfad und Name, damit die Reihenfolge nicht von der Eingabe abhängt.
 */
function fromSymbols(source) {
  let rows;
  try {
    rows = JSON.parse(source.content);
  } catch {
    return { facts: [], error: 'QUELLE_UNLESBAR' };
  }
  if (!Array.isArray(rows)) return { facts: [], error: 'QUELLE_FORM' };
  const facts = [];
  for (const row of rows) {
    const path = text(row?.path);
    const name = text(row?.name);
    if (path === '' || name === '') continue;
    facts.push({
      scope: path,
      subject: name,
      predicate: 'symbol',
      value: text(row?.kind) || 'symbol',
      kind: DERIVED,
    });
  }
  facts.sort((a, b) => (a.scope + a.subject).localeCompare(b.scope + b.subject));
  return { facts };
}

const EXTRACTORS = Object.freeze({
  contract: fromContract,
  commit: fromCommit,
  symbols: fromSymbols,
});

/**
 * Zerlegt eine Quelle in Fakten. Rückgabe:
 *   { ok, facts, dropped, error? }  — `dropped` nennt Index und Grund.
 * `facts` tragen noch keine Kennung; der Aufrufer bildet sie mit factId.
 */
export function extractFacts(source) {
  if (!source || typeof source !== 'object') return { ok: false, facts: [], dropped: [], error: 'QUELLE_FEHLT' };
  if (typeof source.path !== 'string' || source.path.trim() === '') {
    return { ok: false, facts: [], dropped: [], error: 'QUELLE_OHNE_PFAD' };
  }
  if (typeof source.rev !== 'string' || source.rev.trim() === '') {
    return { ok: false, facts: [], dropped: [], error: 'QUELLE_OHNE_REVISION' };
  }
  const extractor = EXTRACTORS[source.kind];
  if (!extractor) return { ok: false, facts: [], dropped: [], error: 'QUELLE_UNBEKANNT' };

  const result = extractor(source);
  if (result.error) return { ok: false, facts: [], dropped: [], error: result.error };

  const facts = [];
  const dropped = [];
  for (const [index, fact] of result.facts.entries()) {
    if (facts.length >= MAX_FACTS_PER_SOURCE) {
      dropped.push({ index, reason: 'BUDGET_ERSCHOEPFT' });
      continue;
    }
    if (fact.value.length > MAX_VALUE_CHARS) {
      dropped.push({ index, reason: 'WERT_ZU_LANG' });
      continue;
    }
    // Die Herkunft gehört zur Extraktion: jeder Fakt trägt Quelle und Revision
    // der Quelle, aus der er stammt, und startet als DISCOVERED. Damit ist die
    // Ausgabe direkt einfügbar und kann keine Quelle erfinden.
    facts.push({
      ...fact,
      status: 'DISCOVERED',
      sources: [{ pointer: source.path, rev: source.rev }],
    });
  }
  return { ok: true, facts, dropped };
}

/**
 * Der Extraktions-Hash: ein Fingerabdruck über die sortierten Aussagen, nicht
 * über die Kennungen. Er beantwortet die Frage der Revalidierung: hat sich der
 * WISSENSINHALT der Quelle geändert oder nur ihr Zeitstempel?
 */
export function extractionHash(facts) {
  const lines = facts
    .map((fact) => [fact.scope, fact.subject, fact.predicate, fact.value, fact.kind].join('\u0000'))
    .sort();
  return factId({ scope: 'extraction', subject: `v${EXTRACTOR_VERSION}`, predicate: 'hash', value: lines.join('\n') });
}
