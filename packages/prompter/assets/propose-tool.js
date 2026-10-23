/**
 * @shinon/prompter — propose-tool.js (der Abnehmer der Naht `shinon_block_propose`).
 *
 * BEFUND (Audit-Konflikt #23): `bus.provide(PROPOSE_SERVICE, …)` stand im
 * Host-Eintrag, und im ganzen Baum las sie niemand. Ein Dienst ohne Leser ist
 * eine ausgestellte Vollmacht, keine Fähigkeit. Der Abnehmer ist der AGENT: er
 * schlägt aus Erfahrung einen Baustein vor, und der Vorschlag muss denselben
 * Prüfweg gehen wie jeder andere (`reviewNotes`, `duplicateVsBlocks`,
 * `validateBlockCore` im Veredler). Deshalb ist dieses Werkzeug KEIN zweiter
 * Zugang: es ruft die Funktion, die der Dienst anbietet (`proposeService.propose`),
 * und der Eintrag reicht sie herein.
 *
 * WARUM DIE DEFINITION DATEN IST (kein `defineTool`): `@deepseek-ai/dsh-tools`
 * verlangt bei `tools.register` zwingend `output = { schema, render }` und
 * prüft `schema` gegen seine Teilmenge (type/properties/required/items/enum/
 * const/additionalProperties + Annotationen). Diese Hälfte bleibt darum beim
 * rohen JSON-Schema und zwei reinen Funktionen — ohne bare Imports, damit der
 * Abnahmetest ohne installierte `node_modules` laufen kann.
 *
 * DIE ARGUMENTE SIND ABSICHTLICH SCHMAL: `ausloeser` wird nicht als freies
 * Objekt durchgereicht, sondern aus `haystack`, `intentKlassen` und
 * `ohneAnlass` gebaut — genau die drei Achsen, die `matchBlock` liest. Ein
 * Modell, das einen Schlüssel erfindet, den niemand auswertet, schriebe einen
 * Baustein, der nie lädt. `quelle` ist fest `gelernt`: ein Vorschlag IST ein
 * gelernter Baustein, keine Behauptung über eine fremde Quelle.
 */
import {
  BLOCK_LAGEN,
  BLOCK_MODI,
  MAX_BLOCK_BUDGET,
  PROPOSE_CONTRACT,
  PROPOSE_SERVICE,
} from './block-review.js';

/** Die Quelle eines vorgeschlagenen Bausteins — fest, nicht modellgewählt. */
export const PROPOSE_TOOL_QUELLE = 'gelernt';

/**
 * Der Ausgabe-Vertrag des Werkzeugs: der Vertrag der Naht, kein zweiter Name.
 * `contract` ist eine Konstante im Schema — ein Werkzeug, das einen anderen
 * Vertrag zurückgibt als den, den es zusagt, ist rot, bevor es jemand liest.
 */
export const PROPOSE_TOOL_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contract: { type: 'string', const: PROPOSE_CONTRACT },
    ok: { type: 'boolean' },
    blockId: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['contract', 'ok', 'blockId', 'findings'],
};

/** Die Argumente, die das Modell setzen darf — jede Achse mit ihrem Warum. */
const PROPOSE_TOOL_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    thema: { type: 'string', description: 'Themenmarke des Bausteins, kein Satz.' },
    bei: { type: 'string', description: 'Der Anlass in Worten: wann der Baustein greifen soll.' },
    immer: { type: 'string', description: 'Die Anweisung, die der Baustein in den Prompt legt.' },
    weil: { type: 'string', description: 'Warum das hilft — die Begründung.' },
    beleg: { type: 'string', description: 'Woher die Erfahrung stammt (Datei, Lauf, Beobachtung).' },
    id: { type: 'string', description: 'Eindeutige Kennung, kleingeschrieben (z. B. `stand-fehlerpfad`).' },
    lage: { type: 'string', enum: [...BLOCK_LAGEN], description: 'Wo der Baustein im Prompt steht.' },
    budgetTokens: { type: 'integer', description: `Harte Obergrenze in Tokens (1 bis ${MAX_BLOCK_BUDGET}); der Veredler lehnt alles andere ab.` },
    haystack: { type: 'array', items: { type: 'string' }, description: 'Begriffe (klein, ohne Satzzeichen), die den Baustein auslösen.' },
    modus: { type: 'array', items: { type: 'string', enum: [...BLOCK_MODI] }, description: 'Erlaubte Modi; ohne Angabe alle drei.' },
    intentKlassen: { type: 'array', items: { type: 'string' }, description: 'Intent-Klassen, die den Baustein zusätzlich auslösen.' },
    ohneAnlass: { type: 'boolean', description: 'true: der Baustein lädt in jedem Schritt, ohne Anlass (Auslöser `immer`).' },
  },
  required: ['thema', 'bei', 'immer', 'weil', 'beleg', 'id', 'lage', 'budgetTokens', 'haystack'],
};

/** Text aus einem Argument: getrimmt, nie `undefined`. */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Eine Liste aus Argumenten: nur nicht-leere Zeichenketten, getrimmt. */
function list(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter((entry) => entry !== '');
}

/**
 * Argumente → Vorschlag. Rein und ohne Urteil: die Form prüft der Veredler
 * (`validateProposalShell`, `validateBlockCore`), hier wird nur übersetzt.
 * Was fehlt, bleibt leer und fällt dort mit benanntem Grund durch — statt
 * hier still einen Wert zu erfinden.
 */
export function buildProposal(args) {
  const a = args !== null && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const ausloeser = {};
  const haystack = list(a.haystack);
  if (haystack.length > 0) ausloeser.haystack = haystack;
  const intentKlassen = list(a.intentKlassen);
  if (intentKlassen.length > 0) ausloeser.intentKlassen = intentKlassen;
  if (a.ohneAnlass === true) ausloeser.immer = true;
  const modus = list(a.modus);
  return {
    thema: text(a.thema),
    bei: text(a.bei),
    immer: text(a.immer),
    weil: text(a.weil),
    beleg: text(a.beleg),
    block: {
      id: text(a.id),
      quelle: PROPOSE_TOOL_QUELLE,
      lage: text(a.lage),
      modus: modus.length > 0 ? modus : [...BLOCK_MODI],
      budgetTokens: Number.isInteger(a.budgetTokens) ? a.budgetTokens : 0,
      ausloeser,
    },
  };
}

/**
 * Das Ergebnis der Naht in den Ausgabe-Vertrag übersetzen — total, damit ein
 * fremd geformtes Ergebnis nicht als Schema-Bruch aus dem Werkzeug fällt.
 * Ein abgelehnter Vorschlag nennt seinen Befund; ein angenommener nennt seinen
 * Block. Beides ist die Aussage, die der Agent braucht; die Kennung fällt auf
 * die angefragte id zurück, wenn die Naht sie nicht zurückgibt.
 */
export function proposeToolValue(result, proposal = null) {
  const answer = result !== null && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const requested = typeof proposal?.block?.id === 'string' ? proposal.block.id : '';
  const answered = typeof answer.block === 'string' ? answer.block : '';
  const findings = Array.isArray(answer.findings)
    ? answer.findings.map((finding) => String(finding)).filter((finding) => finding !== '')
    : ['OHNE_BEFUND'];
  return {
    contract: PROPOSE_CONTRACT,
    ok: answer.ok === true,
    blockId: answered !== '' ? answered : requested,
    findings,
  };
}

/** Der Text, den das Modell liest — Kopf, dann die Befundliste. */
export function renderProposeValue(value) {
  const head = value.ok
    ? `Baustein ${value.blockId} ist aktiv (Vertrag ${value.contract}).`
    : `Vorschlag ${value.blockId === '' ? 'ohne Kennung' : value.blockId} abgelehnt (Vertrag ${value.contract}).`;
  const findings = value.findings.length > 0 ? value.findings : ['ohne Befund'];
  return [head, ...findings.map((finding) => `- ${finding}`)].join('\n');
}

/**
 * Das fertige Werkzeug. `propose` ist die Funktion der Naht (nicht ihr Name):
 * derselbe Code, den `shinon_block_propose` anbietet, mit demselben
 * fail-closed Urteil. Ein Wurf ist ein Befund, kein Absturz des Werkzeugs.
 */
export function createProposeTool(propose) {
  return {
    name: PROPOSE_SERVICE,
    description:
      'Schlägt einen neuen Prompt-Baustein vor und prüft ihn im selben Aufruf: Hülle (Thema, Anlass, Anweisung, Begründung, Beleg), Block-Kern und Duplikat gegen aktive Bausteine. Nur ein sauberer Vorschlag wird in .shinon/blocks.learned.json aktiviert; jeder Befund nennt seinen Grund. Marker in `haystack` sind einzelne Begriffe, keine Sätze.',
    parameters: PROPOSE_TOOL_PARAMETERS,
    output: {
      schema: PROPOSE_TOOL_OUTPUT,
      render: (_args, value) => [{ type: 'text', text: renderProposeValue(value) }],
    },
    async execute(args) {
      const proposal = buildProposal(args);
      if (typeof propose !== 'function') {
        return proposeToolValue({ ok: false, findings: ['KEINE_NAHT'] }, proposal);
      }
      try {
        return proposeToolValue(await propose(proposal), proposal);
      } catch (error) {
        return proposeToolValue({ ok: false, findings: [`FEHLER:${error?.message ?? error}`] }, proposal);
      }
    },
  };
}
