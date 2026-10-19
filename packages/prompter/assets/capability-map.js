/**
 * @shinon/prompter — capability-map.js
 *
 * Die Fähigkeitskarte als Daten und als reiner Kern (`shinon.capabilities/v1`):
 * welche Frage gehört welchem Paket, über welche Naht, mit welcher Grenze.
 *
 * WARUM DAS EINE KARTE IST UND KEIN ZWEITER INDEX: die Karte beantwortet nicht
 * „was steht im Projekt", sondern „wer ist für diese Frage zuständig". Sie
 * trägt keine Dateiinhalte, keinen Rang und keine Meinung — nur Adressen. Der
 * Project Index bleibt der eine Index; die Karte ist die Landkarte darüber.
 *
 * DER AUFGABENBRIEF ist die Übersetzung für den Main-Agenten: fünf Felder
 * (Frage, Ort, Fähigkeit, Grenze, Beleg), keine Prosa, kein Modellaufruf. Er
 * wird an den veredelten Prompt gehängt, nicht in ihn hineingeschrieben — der
 * Veredler bleibt der Veredler.
 *
 * KEINE IMPORTE AUSSER DEM EIGENEN KERN. Dieselbe Regel wie `provenance.js`:
 * nur dann läuft der Test in CI ohne `node_modules`. Die Zeigerprüfung kommt
 * aus `provenance.js` (kein zweiter Pfadbegriff).
 *
 * GENAU EIN EIGENTÜMER. Die Karte wird nicht nur zur Laufzeit gelesen, sondern
 * von `scripts/gate/tests/capabilities.test.mjs` geprüft: jede Frage genau
 * einmal, jeder Begriff genau einer Frage zugeordnet, jedes Paket mindestens
 * einmal genannt, jede Naht wörtlich im Eigentümer-Paket vorhanden. Ein
 * doppelter Begriff ist kein Detail, sondern eine zweite Zuständigkeit.
 */
import { parsePointer } from './provenance.js';

/** Vertragsname der Karte. */
export const CAPABILITIES_CONTRACT = 'shinon.capabilities/v1';

/** Erlaubte Nahtformen. `null` heißt: keine Naht (Oberfläche, Konfiguration). */
export const SEAM_KINDS = ['service', 'contract', 'channel', 'global', 'event'];

/** Obergrenze eines Aufgabenbriefs in Zeichen (Vorgabe, die Karte darf sie senken). */
export const MAX_BRIEF_CHARS = 700;

/** Kürzeste Begriffslänge — kürzere Begriffe treffen zu viel. */
export const MIN_TERM_LENGTH = 3;

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const OWNER_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Kommt der Begriff als WORT im Text vor?
 *
 * `includes` allein wäre falsch: „pet" steckt in „competition", „ton" in
 * „Kontrolle". Die Grenze ist ein Zeichen, das weder Buchstabe noch Ziffer
 * noch Unterstrich ist; Umlaute zählen als Buchstaben.
 */
export function containsTerm(haystack, term) {
  if (typeof haystack !== 'string' || typeof term !== 'string' || term === '') return false;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(term, from);
    if (index === -1) return false;
    const before = index === 0 ? '' : haystack[index - 1];
    const after = index + term.length >= haystack.length ? '' : haystack[index + term.length];
    if ((before === '' || !WORD_CHAR.test(before)) && (after === '' || !WORD_CHAR.test(after))) return true;
    from = index + 1;
  }
}

/**
 * Die Karte prüfen — Form, nicht Wahrheit.
 *
 * Geprüft wird, was ohne Dateisystem prüfbar ist: Vertragsname, eindeutige IDs
 * und Fragen, eindeutige Begriffe, Zeigerform der Belege, Nahtform. Dass der
 * Eigentümer existiert und die Naht wirklich anbietet, prüft der Gate-Test —
 * dafür braucht es den Baum, nicht die Karte.
 *
 * @param {unknown} map - die geladene Karte.
 * @returns {string[]} Befunde; leer heißt gültig.
 */
export function capabilityIssues(map) {
  const issues = [];
  if (map === null || typeof map !== 'object' || Array.isArray(map)) return ['Karte: kein Objekt'];
  if (map.contract !== CAPABILITIES_CONTRACT) issues.push(`Karte: contract ${JSON.stringify(map.contract)} ≠ ${CAPABILITIES_CONTRACT}`);
  const maxBrief = map.maxBriefChars;
  if (maxBrief !== undefined && (!Number.isInteger(maxBrief) || maxBrief < 200 || maxBrief > 2000)) {
    issues.push('Karte: maxBriefChars muss eine Ganzzahl zwischen 200 und 2000 sein');
  }
  if (!Array.isArray(map.capabilities) || map.capabilities.length === 0) {
    issues.push('Karte: capabilities fehlt oder ist leer');
    return issues;
  }

  const ids = new Set();
  const questions = new Set();
  const terms = new Map();
  map.capabilities.forEach((entry, index) => {
    const label = entry?.id ?? `#${index + 1}`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push(`${label}: kein Objekt`);
      return;
    }
    if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) issues.push(`${label}: id ist kein Kleinbuchstaben-Slug`);
    else if (ids.has(entry.id)) issues.push(`${label}: id doppelt`);
    else ids.add(entry.id);

    if (typeof entry.frage !== 'string' || entry.frage.trim() === '') issues.push(`${label}: frage fehlt`);
    else {
      const key = entry.frage.trim().toLowerCase();
      if (questions.has(key)) issues.push(`${label}: frage doppelt (${entry.frage})`);
      questions.add(key);
    }

    if (typeof entry.owner !== 'string' || !OWNER_PATTERN.test(entry.owner)) issues.push(`${label}: owner ist kein Paket-Slug`);

    if (!Array.isArray(entry.terms) || entry.terms.length === 0) issues.push(`${label}: terms fehlt oder ist leer`);
    else {
      for (const term of entry.terms) {
        if (typeof term !== 'string' || term.length < MIN_TERM_LENGTH) {
          issues.push(`${label}: Begriff ${JSON.stringify(term)} ist zu kurz`);
          continue;
        }
        if (term !== term.toLowerCase()) issues.push(`${label}: Begriff ${JSON.stringify(term)} ist nicht klein geschrieben`);
        const owner = terms.get(term);
        if (owner !== undefined) issues.push(`${label}: Begriff ${JSON.stringify(term)} gehört schon ${owner}`);
        else terms.set(term, entry.id);
      }
    }

    if (!Array.isArray(entry.notAnswers) || entry.notAnswers.length === 0) {
      issues.push(`${label}: notAnswers fehlt oder ist leer — eine Grenze ist Pflicht`);
    } else if (entry.notAnswers.some((value) => typeof value !== 'string' || value.trim() === '')) {
      issues.push(`${label}: notAnswers enthält einen leeren Wert`);
    }

    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      issues.push(`${label}: evidence fehlt oder ist leer`);
    } else {
      for (const pointer of entry.evidence) {
        const parsed = parsePointer(pointer);
        if (!parsed.ok || parsed.kind !== 'file') issues.push(`${label}: Beleg ${JSON.stringify(pointer)} ist kein Dateizeiger`);
      }
    }

    if (entry.seam !== null && entry.seam !== undefined) {
      if (typeof entry.seam !== 'object' || Array.isArray(entry.seam)) {
        issues.push(`${label}: seam ist weder null noch Objekt`);
      } else {
        if (!SEAM_KINDS.includes(entry.seam.kind)) issues.push(`${label}: seam.kind ${JSON.stringify(entry.seam.kind)} unbekannt`);
        if (typeof entry.seam.name !== 'string' || entry.seam.name.trim() === '') issues.push(`${label}: seam.name fehlt`);
        if (entry.seam.contract !== undefined && (typeof entry.seam.contract !== 'string' || entry.seam.contract.trim() === '')) {
          issues.push(`${label}: seam.contract ist leer`);
        }
      }
    }
  });
  return issues;
}

/**
 * Die Frage eines Textes genau einer Fähigkeit zuordnen.
 *
 * Drei Ausgänge, jeder benannt:
 *
 *   ok            genau ein bester Treffer; `hits` nennt die Begriffe.
 *   KEIN_TREFFER  kein Begriff kommt vor — dann gibt es keinen Brief.
 *   MEHRDEUTIG    zwei Fähigkeiten treffen gleich gut. Es wird NICHT
 *                 alphabetisch entschieden: ein geratener Eigentümer wäre
 *                 schlimmer als kein Brief.
 *
 * Die Reihenfolge der Karte entscheidet nichts; der Vergleich läuft über den
 * Rang (Zahl der Treffer), nicht über die Position.
 */
export function matchCapability(text, map) {
  if (map === null || typeof map !== 'object' || !Array.isArray(map.capabilities)) {
    return { ok: false, reason: 'KARTE_FEHLT' };
  }
  const haystack = String(text ?? '').toLowerCase();
  if (haystack.trim() === '') return { ok: false, reason: 'KEIN_TREFFER' };

  let best = 0;
  const scored = [];
  for (const capability of map.capabilities) {
    const hits = (Array.isArray(capability?.terms) ? capability.terms : []).filter((term) => containsTerm(haystack, term));
    if (hits.length === 0) continue;
    scored.push({ capability, hits, score: hits.length });
    if (hits.length > best) best = hits.length;
  }
  if (scored.length === 0) return { ok: false, reason: 'KEIN_TREFFER' };
  const top = scored.filter((entry) => entry.score === best);
  if (top.length > 1) {
    return {
      ok: false,
      reason: 'MEHRDEUTIG',
      candidates: top.map((entry) => entry.capability.id).sort(),
    };
  }
  return { ok: true, capability: top[0].capability, hits: top[0].hits, score: best };
}

/**
 * Den Aufgabenbrief als Datensatz bauen — fünf Felder, keine Prosa.
 *
 * `question` ist die kanonische Frage der Karte, nicht der Nutzertext: der
 * Nutzertext steht bereits im Prompt. Der Brief sagt, WER die Frage
 * beantwortet, WO der Beleg liegt und WAS die Grenze ist.
 */
export function taskBrief(capability, options = {}) {
  const owner = typeof capability?.owner === 'string' ? capability.owner : '';
  const seam = capability?.seam ?? null;
  const where = Array.isArray(capability?.evidence) ? capability.evidence.slice() : [];
  const boundary = Array.isArray(capability?.notAnswers) ? capability.notAnswers.slice() : [];
  let ability = `@shinon/${owner} — kein Dienst (Oberfläche oder Konfiguration)`;
  if (seam !== null && typeof seam === 'object') {
    const suffix = typeof seam.contract === 'string' && seam.contract !== '' ? ` (${seam.contract})` : '';
    const read = seam.read === true ? ', gelesen' : '';
    const label = seam.kind === 'service' ? 'Dienst' : seam.kind === 'contract' ? 'Vertrag' : seam.kind === 'channel' ? 'Kanal' : seam.kind === 'global' ? 'Global' : 'Ereignis';
    ability = `@shinon/${owner} — ${label} ${seam.name}${suffix}${read}`;
  }
  return {
    contract: CAPABILITIES_CONTRACT,
    id: capability?.id ?? '',
    question: capability?.frage ?? '',
    where,
    ability,
    boundary,
    // Die Karte ist abgeleitetes Wissen: sie sagt, wer zuständig ist, nicht ob
    // die Antwort stimmt. Der Zeiger ist der Vertrag selbst.
    evidence: { class: 'DERIVED', pointer: CAPABILITIES_CONTRACT },
    workspace: typeof options.workspace === 'string' && options.workspace !== '' ? options.workspace : null,
  };
}

/**
 * Den Brief rendern — kurz, markiert, ohne Dateiinhalt.
 *
 * Die Marke ist Absicht: der Main-Agent soll den Block als Hinweis lesen, nicht
 * als Regel. Er trägt `class="DERIVED"` und den Satz „abgeleitet, keine
 * Wahrheit" im Beleg. Über der Grenze wird NICHT gekürzt (fail loud): der
 * Aufrufer lässt den Brief dann weg und nennt den Grund im Log.
 */
export function renderTaskBrief(brief, options = {}) {
  const maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0 ? options.maxChars : MAX_BRIEF_CHARS;
  const text = [
    `<task_brief contract="${CAPABILITIES_CONTRACT}" class="DERIVED">`,
    `Frage: ${brief.question}`,
    `Ort: ${brief.where.join(', ')}`,
    `Fähigkeit: ${brief.ability}`,
    `Grenze: ${brief.boundary.join('; ')}`,
    `Beleg: ${CAPABILITIES_CONTRACT} (abgeleitet, keine Wahrheit)`,
    '</task_brief>',
  ].join('\n');
  if (text.length > maxChars) return { ok: false, reason: 'BRIEF_ZU_LANG', chars: text.length, maxChars };
  return { ok: true, text, chars: text.length };
}

/** Den Brief an einen Prompt hängen — als eigener Block, nicht hineinmontiert. */
export function appendTaskBrief(text, rendered) {
  if (typeof text !== 'string' || rendered?.ok !== true || typeof rendered.text !== 'string') return text;
  return `${text}\n\n${rendered.text}`;
}

/**
 * Die Kurzform für den Entscheidungsdatensatz: Adresse und Länge, kein Text.
 *
 * Der Brief selbst reist in den Prompt; die Spur nennt nur, WELCHER Brief es
 * war. Ein Blocktext im Ereignis wäre derselbe Fehler wie ein Prompt-Text im
 * Provenienz-Datensatz.
 */
export function briefRecord(capability, rendered) {
  return {
    contract: CAPABILITIES_CONTRACT,
    id: capability?.id ?? '',
    owner: capability?.owner ?? '',
    chars: Number.isInteger(rendered?.chars) ? rendered.chars : 0,
  };
}
