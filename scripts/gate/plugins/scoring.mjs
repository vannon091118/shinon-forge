/**
 * scoring — Scorecard, Decay, Relation, Tendenz. Lesen, nie schreiben.
 *
 * DIE ZUSAGE, ehrlich formuliert (Zug 3): der Scoring-Laufzeitcode LIEST. Sein
 * einziger Ausgang ist der Signal-Anhang im Index — EINE Operation (`save`) auf
 * dem einen schmalen Dienst, den der Projekt-Index anbietet; dazu genau EIN
 * `load` beim Start. Alles andere, was diese Schicht hervorbringt (Tafel,
 * Tendenz, Injektion), ist HERGELEITET und geht nirgendwohin. Frühere Fassungen
 * dieses Kopfes sprachen von „drei Zusagen" und von einer Schreib-Scope-Grenze,
 * die den Host nicht nannte: die Weitergabe an die Ablage ist ein Ausgang, und
 * ein Gate, das ihn verschweigt, prüft ihn auch nicht.
 *
 * Sieben Prüfungen:
 *   1. Schreib-Scope: der Scoring-Laufzeitcode enthält keinen einzigen
 *      Schreib-/Ausführungs-/Netz-/Modellaufruf, und jede Pfad-Angabe im Code
 *      bleibt im eigenen Paket auf bekannte Dateien beschränkt. Was nicht
 *      schreiben KANN, schreibt auch nicht daneben.
 *   2. Trigger-Vertrag fail-closed: kein Trigger feuert ins Leere — jede
 *      Dimension existiert, jede Relationsstufe ist benannt, jeder Skill steht
 *      im Technik-Profil, jeder Event-Typ kommt aus dem Spine, und die
 *      erwartete Nutzlast ist die, die der Spine liefert. Eine Lücke ist ein
 *      Fehler, kein stilles Überspringen.
 *   3. Konservativ bleibt konservativ: Decay klein, Kühlen mindestens zwei
 *      Signale, Triggerzahl gedeckelt — gegen Reward-Sparsität gebaut, nicht
 *      gegen sie getestet.
 *   4. Aktivierung: das Profil muss das Bundle laden, sonst läuft das
 *      Scoring nie (dieselbe Regel wie beim Persona-Gate).
 *   5. Signal-Vertrag (K5, fail-closed): die Signaltabelle trägt genau die
 *      sieben Zeilen, jede beobachtbare Zeile nennt eine Quelle, die es im
 *      Spine wirklich gibt und die er wirklich erreicht, jede nicht
 *      beobachtbare Zeile nennt ihren Grund, keine Zeile verspricht ein Signal
 *      ohne Zulieferer — und die Quelle eines Signals ist ein NATIVER DSH-Typ,
 *      den der Carrier abbildet. Kein Deckel, kein Zähler-Limit, keine
 *      Sekundenregel in den Daten.
 *   6. Tendenz-Vertrag (Zug 3): die Tendenz-Regeln tragen ihren Vertragsnamen,
 *      ihre KLASSEN decken jedes beobachtbare Signal genau einmal ab und kein
 *      Signal zwei Pole, ihre Stufen sind absteigend und enden bei 0, ihre
 *      Haltungen sind geordnete Bedingungen über benannte Klassen und Stufen
 *      (die letzte bedingungslos), die Mindestevidenz ist eine ganze Zahl ≥ 1 —
 *      und jeder der drei Mechanismen (Faktor, Widerruf, Vergessen) nennt einen
 *      ORT, der im Vertrag wirklich auflöst. Eine Tendenz ohne Herkunft wäre
 *      eine Behauptung; ein Mechanismus ohne Ort wäre eine Absichtserklärung.
 *   7. Ausgang: genau EIN `save` auf dem Dienst der Ablage (der Signal-Anhang)
 *      und genau EIN `load` beim Start — kein zweites Schreibverb, kein zweiter
 *      Weg. Das ist die Zusage aus dem Kopf, als Prüfung.
 *
 * Die reinen Funktionen sind ohne node_modules testbar; die Tests liegen in
 * scripts/gate/tests/scoring.test.mjs.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly, findForbidden } from '../../lib/source-scan.mjs';

export const id = 'scoring';

export const SCORING_CONTRACT_ID = 'shinon.scoring-state/v1';
export const PROFILE_CONTRACT_ID = 'shinon.technical-profile/v1';
export const TRIGGERS_CONTRACT_ID = 'shinon.skill-triggers/v1';
export const SIGNAL_RULES_CONTRACT_ID = 'shinon.signal-rules/v1';
export const TENDENCY_RULES_CONTRACT_ID = 'shinon.tendency-rules/v1';

/** Die zwei Pole, die eine Tendenz-Klasse tragen darf. */
export const TENDENCY_POLES = ['negative', 'positive'];

/**
 * Die drei Mechanismen der Rechnung (§4 des Konzepts) und die Datei, in der ihr
 * Ort liegen muss. Mehr gibt es nicht: Trust-Ceiling und Rate-Limit sind
 * ersetzt, weil sie ungemessene Erfindungen waren.
 */
export const TENDENCY_MECHANISMS = {
  weight: 'signal-rules.json',
  retract: 'signal-rules.json',
  forget: 'scoring-state.json',
};

/**
 * Die Verben, die den EINEN Ausgang der Schicht verletzen würden. `load` und
 * `save` sind das erlaubte Paar (lesen beim Start, anhängen eines Signals);
 * jedes andere Schreibverb wäre ein zweiter Weg in die Ablage.
 */
export const STORE_VERBS = ['append', 'delete', 'remove', 'insert', 'update', 'put', 'write', 'truncate'];

/**
 * Die vier Dateien, die der Scoring-Code beschreiben darf — alle anderen nicht.
 * `signal-rules.json` ist die Signaltabelle (K5); ohne sie hier wäre der Pfad
 * im Host-Code ein Befund, obwohl er der Vertrag ist.
 */
export const WRITABLE_ASSETS = [
  'assets/scoring-state.json',
  'assets/technical-profile.json',
  'assets/skill-triggers.json',
  'assets/signal-rules.json',
  'assets/tendency-rules.json',
];

/** Die sieben Signale der Plan-Tabelle — genau diese, keine mehr. */
export const SIGNAL_IDS = ['adopt', 'accept', 'copy', 'dismiss', 'nextq', 'rephrase', 'selffix'];

/** Die vier Arten einer Quelle: werten, zurücknehmen, notieren — und `observe` (SH-LEARN-01: gezaehlt, nie gewertet). */
export const SOURCE_KINDS = ['note', 'observe', 'retract', 'score'];

/** Die Stärken, die die Tabelle führt (Faktor = Vielfaches des Basis-Deltas). */
export const STRENGTH_IDS = ['high', 'low', 'medium'];

/**
 * Regeln, die hier NICHT stehen dürfen.
 *
 * Ein Vertrauens-Deckel (0.8), ein Zähler-Limit pro Sitzung oder eine
 * Sekunden-Regel sind Grenzen, die niemand gesetzt hat — sie stünden der
 * Absicht entgegen, dass Vertrauen mit der Laufzeit aus Ergebnissen wächst und
 * dass der INHALT entscheidet, nicht die Uhr. Das Gate prüft die Abwesenheit,
 * weil eine Zahl in einer Datendatei sonst still wieder eingeführt wird.
 */
export const FORBIDDEN_RULE_KEYS = [
  'trustCeiling',
  'trustCap',
  'rateLimit',
  'maxPublishedSignalsPerSession',
  'maxSignalsPerSession',
  'maxSignals',
  'windowSeconds',
  'maxSeconds',
  'maxAgeSeconds',
];

/**
 * Lesbar zusätzlich: die reinen Kerne, der Lern-Kern und die Replay-Fixture —
 * derselbe Host liest sie, also gehören sie in dieselbe Whitelist.
 */
export const READABLE_ASSETS = [
  ...WRITABLE_ASSETS,
  'assets/scoring-core.js',
  'assets/signal-translate.js',
  'assets/block-weights.js',
  'assets/replay/scoring-demo.json',
];

/** Verbotene Module: Importnamen werden auch in Strings erkannt. */
export const FORBIDDEN_MODULES = ['child_process'];

/** Verbotene Aufrufe: das Scoring liest — es schreibt, ruft und würfelt nicht. */
export const FORBIDDEN_TOKENS = [
  'writeFile',
  'writeFileSync',
  'mkdirSync',
  'rmSync',
  'unlinkSync',
  'execSync',
  'spawn(',
  'fetch(',
  'http.request',
  'Math.random',
  'Date.now',
  'process.exit',
  'ctx.agents',
  'ctx.llm',
  'ctx.shell',
  'ctx.tools',
  'ctx.set(',
];

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** Laufzeitgrenze: lesen ja, schreiben/handel nein. Kommentare zählen nicht. */
export function staticIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    for (const token of findForbidden(source, FORBIDDEN_MODULES, { mode: 'module' })) {
      issues.push(`${file}: verbotener Modulimport ${token} — das Scoring liest, es handelt nicht`);
    }
    for (const token of findForbidden(source, FORBIDDEN_TOKENS)) {
      issues.push(`${file}: verbotener Aufruf ${token} — das Scoring liest, es schreibt nicht`);
    }
  }
  return issues;
}

/**
 * Pfad-Scope: jede Pfad-Angabe im Scoring-Code bleibt im eigenen Paket auf
 * bekannten Dateien. Ein `./assets/andere.json` wäre ein Schreiben außerhalb
 * der drei Vertragsdateien; ein `../` ein Ausbruch aus dem Paket.
 */
export function scopeIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    const literals = [
      ...source.matchAll(/['"]((?:\.\/)?assets\/[^'"]+)['"]/g),
      ...source.matchAll(/['"](\.\.\/[^'"]+)['"]/g),
    ].map((match) => match[1]);
    for (const literal of literals) {
      const normalized = literal.startsWith('./') ? literal.slice(2) : literal;
      if (normalized.startsWith('../')) {
        issues.push(`${file}: Pfad ${JSON.stringify(literal)} verlässt das Paket`);
      } else if (!READABLE_ASSETS.includes(normalized)) {
        issues.push(`${file}: Pfad ${JSON.stringify(literal)} ist keine bekannte Scoring-Datei`);
      }
    }
  }
  return issues;
}

/**
 * Trigger-Vertrag fail-closed: Dimensionen, Stufen, Skills, Event-Typen und
 * Nutzlasten müssen auf beiden Seiten existieren — sonst feuert ein Trigger
 * auf etwas, das es nicht gibt.
 */
export function contractIssues(scoring, profile, triggers, spine, file) {
  const issues = [];
  const at = (detail) => `${file}: ${detail}`;
  if (typeof scoring !== 'object' || scoring === null) return [at('kein Objekt')];
  if (scoring.contract !== SCORING_CONTRACT_ID) {
    issues.push(at(`contract muss "${SCORING_CONTRACT_ID}" sein (ist ${JSON.stringify(scoring.contract)})`));
  }
  if (typeof profile !== 'object' || profile === null) return [...issues, at('Technik-Profil fehlt')];
  if (typeof triggers !== 'object' || triggers === null) return [...issues, at('Skill-Trigger fehlen')];
  if (profile.contract !== PROFILE_CONTRACT_ID) {
    issues.push(at(`Profil-contract muss "${PROFILE_CONTRACT_ID}" sein (ist ${JSON.stringify(profile.contract)})`));
  }
  if (triggers.contract !== TRIGGERS_CONTRACT_ID) {
    issues.push(at(`Trigger-contract muss "${TRIGGERS_CONTRACT_ID}" sein (ist ${JSON.stringify(triggers.contract)})`));
  }

  const dimensions = scoring.dimensions ?? {};
  if (Object.keys(dimensions).length === 0) issues.push(at('dimensions fehlt oder ist leer'));
  for (const [name, dimension] of Object.entries(dimensions)) {
    for (const key of ['initial', 'min', 'max']) {
      if (typeof dimension?.[key] !== 'number') issues.push(at(`dimensions.${name}.${key} muss eine Zahl sein`));
    }
  }

  const spineEvents = spine?.events ?? {};
  for (const [type, definition] of Object.entries(scoring.events ?? {})) {
    // Kein erfundener Signaltyp: was der Spine nie emittiert, darf das Scoring
    // nicht erwarten — sonst läuft das Replay auf Luft.
    if (!spineEvents[type]) {
      issues.push(at(`Event-Typ ${type} steht nicht im Spine — ein Trigger auf ihn feuert nie`));
      continue;
    }
    // Dieselbe Nutzlast auf beiden Seiten: der Spine liefert, was das Scoring liest.
    const want = spineEvents[type].payload ?? [];
    const have = definition?.payload ?? [];
    if (JSON.stringify([...have].sort()) !== JSON.stringify([...want].sort())) {
      issues.push(at(`${type}.payload ${JSON.stringify(have)} ≠ Spine ${JSON.stringify(want)}`));
    }
  }

  const rate = scoring.decay?.rate;
  if (typeof rate !== 'number' || !(rate > 0 && rate <= 0.05)) {
    issues.push(at(`decay.rate muss konservativ sein (0 < rate ≤ 0.05, ist ${JSON.stringify(rate)})`));
  }
  const interval = scoring.cooling?.interval;
  if (!Number.isInteger(interval) || interval < 2) {
    issues.push(at(`cooling.interval muss mindestens 2 Signale tragen (ist ${JSON.stringify(interval)})`));
  }

  const levels = scoring.relation?.levels ?? [];
  if (levels.length === 0 || levels.some((level) => !isText(level))) {
    issues.push(at('relation.levels fehlt oder ist leer'));
  } else if (!levels.includes(scoring.relation?.initial)) {
    issues.push(at(`relation.initial ${JSON.stringify(scoring.relation?.initial)} steht nicht in relation.levels`));
  }

  if (!Array.isArray(profile.skills) || profile.skills.length === 0 || profile.skills.some((skill) => !isText(skill))) {
    issues.push(at('Technik-Profil skills fehlt oder ist leer'));
  }
  const maxTriggers = profile.limits?.maxTriggers;
  const list = triggers.triggers ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    issues.push(at('triggers fehlt oder ist leer'));
  } else {
    if (Number.isInteger(maxTriggers) && list.length > maxTriggers) {
      issues.push(at(`${list.length} Trigger übersteigen limits.maxTriggers ${maxTriggers}`));
    }
    const ids = new Set();
    for (const [index, trigger] of list.entries()) {
      const where = `triggers[${index + 1}]`;
      if (!isText(trigger?.id)) issues.push(at(`${where}.id fehlt`));
      else if (ids.has(trigger.id)) issues.push(at(`${where}.id ${JSON.stringify(trigger.id)} ist doppelt`));
      else ids.add(trigger.id);
      const hasDimension = typeof trigger?.dimension === 'string';
      const hasRelation = typeof trigger?.relation === 'string';
      if (!hasDimension && !hasRelation) issues.push(at(`${where} nennt weder dimension noch relation`));
      if (hasDimension && !dimensions[trigger.dimension]) {
        issues.push(at(`${where}.dimension ${JSON.stringify(trigger.dimension)} steht nicht in dimensions`));
      }
      if (hasDimension && trigger.op !== 'below' && trigger.op !== 'above') {
        issues.push(at(`${where}.op muss below oder above sein (ist ${JSON.stringify(trigger.op)})`));
      }
      if (hasDimension && typeof trigger.threshold !== 'number') {
        issues.push(at(`${where}.threshold muss eine Zahl sein`));
      }
      if (hasRelation && !levels.includes(trigger.relation)) {
        issues.push(at(`${where}.relation ${JSON.stringify(trigger.relation)} steht nicht in relation.levels`));
      }
      // Kein Skill außerhalb des Technik-Profils: sonst wird eine Injektion
      // versprochen, die die Schicht nie auslösen darf.
      if (!isText(trigger?.skill)) issues.push(at(`${where}.skill fehlt`));
      else if (!(profile.skills ?? []).includes(trigger.skill)) {
        issues.push(at(`${where}.skill ${JSON.stringify(trigger.skill)} steht nicht im Technik-Profil`));
      }
      if (!isText(trigger?.text)) issues.push(at(`${where}.text fehlt (eine Injektion ohne Text)`));
    }
  }
  return issues;
}

/** Jeden Schlüsselnamen im Dokument sammeln (auch verschachtelt). */
function keyPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object') return [];
  const found = [];
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    found.push(path);
    found.push(...keyPaths(entry, path));
  }
  return found;
}

/**
 * Die Signaltabelle prüfen (K5): genau sieben Zeilen, jede mit einem
 * erreichbaren Zulieferer oder einem benannten Grund, und keine erfundene
 * Quelle.
 *
 * Was hier fail-closed heißt: eine Zeile, die `observable: true` sagt und deren
 * Signaltyp nicht im Scorecard-Vertrag steht, wäre ein Wert, den niemand
 * berechnen kann. Eine Zeile, deren natives Ereignis der Spine nicht abbildet,
 * wäre ein Signal, das nie entstehen kann. Beides ist ein Befund, kein
 * stiller Ausfall.
 */
export function signalRuleIssues(rules, scoring, spine, file) {
  const issues = [];
  const at = (detail) => `${file}: ${detail}`;
  if (typeof rules !== 'object' || rules === null) return [at('kein Objekt')];
  if (rules.contract !== SIGNAL_RULES_CONTRACT_ID) {
    issues.push(at(`contract muss "${SIGNAL_RULES_CONTRACT_ID}" sein (ist ${JSON.stringify(rules.contract)})`));
  }
  if (typeof scoring !== 'object' || scoring === null) return [...issues, at('Scorecard-Vertrag fehlt')];

  // Kein Deckel, kein Limit, keine Sekundenregel — benannt, nicht weggelassen.
  for (const path of keyPaths(rules)) {
    const leaf = path.split('.').pop();
    if (FORBIDDEN_RULE_KEYS.includes(leaf)) issues.push(at(`${path} ist verboten: Deckel, Zähler-Limit und Sekundenregeln gehören nicht in die Signaltabelle`));
  }

  const strengths = rules.limits?.strengths ?? {};
  for (const id of STRENGTH_IDS) {
    const factor = strengths[id];
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) {
      issues.push(at(`limits.strengths.${id} muss eine Zahl > 0 sein (ist ${JSON.stringify(factor)})`));
    }
  }

  const reading = rules.reading ?? {};
  if (!isText(reading.humanMarker?.path) || !isText(reading.humanMarker?.equals)) {
    issues.push(at('reading.humanMarker braucht path und equals — ohne Marke wäre Harness-Text eine Nachricht'));
  }
  if (!isText(reading.textBlocks?.path)) issues.push(at('reading.textBlocks.path fehlt'));
  const similarity = reading.similarity ?? {};
  for (const key of ['minShared', 'minRatio', 'minTokenLength']) {
    if (typeof similarity[key] !== 'number' || !Number.isFinite(similarity[key])) {
      issues.push(at(`reading.similarity.${key} muss eine Zahl sein`));
    }
  }

  // Die sieben Zeilen — genau diese, keine mehr und keine weniger.
  const signals = rules.signals ?? {};
  const ids = Object.keys(signals);
  if (ids.length !== SIGNAL_IDS.length) {
    issues.push(at(`signals muss genau ${SIGNAL_IDS.length} Zeilen tragen (ist ${ids.length}: ${ids.join(', ')})`));
  }
  for (const id of SIGNAL_IDS) {
    if (signals[id] === undefined) issues.push(at(`Signal ${id} fehlt in signals`));
  }
  for (const id of ids) {
    if (!SIGNAL_IDS.includes(id)) issues.push(at(`Signal ${id} steht nicht in der Plan-Tabelle`));
  }

  const spineEvents = spine?.events ?? {};
  const reachable = new Set([
    ...Object.values(spine?.signals ?? {}),
    ...Object.values(spine?.carrier?.typeMap ?? {}),
  ]);

  const referenced = new Set();
  for (const [id, definition] of Object.entries(signals)) {
    if (definition === null || typeof definition !== 'object') {
      issues.push(at(`signals.${id} ist kein Objekt`));
      continue;
    }
    if (typeof definition.observable !== 'boolean') issues.push(at(`signals.${id}.observable muss ein Boolean sein`));
    if (definition.observable === false) {
      if (!isText(definition.reason)) issues.push(at(`signals.${id} ist nicht beobachtbar, nennt aber keinen Grund`));
      if (definition.type !== undefined || definition.strength !== undefined) {
        issues.push(at(`signals.${id} ist nicht beobachtbar und darf trotzdem keinen Typ/keine Stärke nennen`));
      }
      continue;
    }
    if (definition.observable !== true) continue;
    if (!isText(definition.source)) issues.push(at(`signals.${id}.source fehlt`));
    if (!isText(definition.label)) issues.push(at(`signals.${id}.label fehlt (ein Signal ohne Text im Scorecard-Ereignis)`));
    if (!isText(definition.subject)) issues.push(at(`signals.${id}.subject fehlt`));
    if (!isText(definition.type) || scoring.events?.[definition.type] === undefined) {
      issues.push(at(`signals.${id}.type ${JSON.stringify(definition.type)} steht nicht im Scorecard-Vertrag`));
    }
    if (!STRENGTH_IDS.includes(definition.strength)) {
      issues.push(at(`signals.${id}.strength muss eine der Stärken sein (${STRENGTH_IDS.join(', ')})`));
    }
  }

  for (const [type, source] of Object.entries(rules.sources ?? {})) {
    if (source === null || typeof source !== 'object') {
      issues.push(at(`sources.${type} ist kein Objekt`));
      continue;
    }
    // Nur ein Ereignis, das der Spine kennt UND erreicht: sonst feuert die Regel nie.
    if (spineEvents[type] === undefined) {
      issues.push(at(`Quelle ${type} steht nicht im Spine — eine Regel auf ein Ereignis, das es nicht gibt`));
    } else if (!reachable.has(type)) {
      issues.push(at(`Quelle ${type} hat keinen Signal-/Carrier-Pfad im Spine — sie kann nie entstehen`));
    }
    if (!isText(source.native)) {
      issues.push(at(`sources.${type}.native fehlt (der native DSH-Typ muss benannt sein)`));
    } else if (spine?.carrier?.typeMap?.[source.native] === undefined) {
      issues.push(at(`sources.${type}.native ${JSON.stringify(source.native)} ist im Carrier nicht abgebildet`));
    }
    if (!SOURCE_KINDS.includes(source.kind)) {
      issues.push(at(`sources.${type}.kind muss ${SOURCE_KINDS.join(' | ')} sein`));
      continue;
    }
    const claims = [];
    if (typeof source.signal === 'string') claims.push(source.signal);
    for (const map of ['byRating', 'byReason']) {
      if (source[map] === undefined) continue;
      if (source[map] === null || typeof source[map] !== 'object') {
        issues.push(at(`sources.${type}.${map} muss ein Objekt sein`));
        continue;
      }
      for (const [key, signal] of Object.entries(source[map])) claims.push(`${signal} (${map}.${key})`);
    }
    if (source.kind === 'score' && claims.length === 0) {
      issues.push(at(`sources.${type} wertet, sagt aber nicht welches Signal`));
    }
    if (source.kind === 'retract' && !isText(source.subjectPath)) {
      issues.push(at(`sources.${type} nimmt zurück, nennt aber keinen subjectPath`));
    }
    // `note`/`observe` nennen ihre Beobachtung, kein gewertetes Signal (SH-LEARN-01).
    const observing = source.kind === 'note' || source.kind === 'observe';
    for (const claim of claims) {
      const signal = claim.includes(' ') ? claim.split(' ')[0] : claim;
      const definition = signals[signal];
      if (definition === undefined) issues.push(at(`sources.${type} nennt ${JSON.stringify(claim)} — dieses Signal gibt es nicht`));
      else if (observing) {
        if (definition.observable !== false) issues.push(at(`sources.${type} beobachtet nur, nennt aber ${signal}, das gewertet wird`));
      } else {
        referenced.add(signal);
        if (definition.observable !== true) issues.push(at(`sources.${type} nennt ${signal}, das die Tabelle als nicht beobachtbar führt`));
      }
    }
  }

  // Keine Zeile ohne Zulieferer: ein beobachtbares Signal, das niemand erzeugt,
  // sieht im Vertrag wie eine Fähigkeit aus und ist in Wahrheit toter Text.
  for (const id of SIGNAL_IDS) {
    if (signals[id]?.observable === true && !referenced.has(id)) {
      issues.push(at(`Signal ${id} ist als beobachtbar geführt, aber keine Quelle erzeugt es`));
    }
  }
  return issues;
}

/**
 * Den Pol eines Signals aus dem VERTRAG lesen — nicht aus seinem Namen.
 *
 * Der Pol ist die Richtung, in die das Signal die Dimensionen schiebt, und die
 * steht als Vorzeichen im Delta der Scorecard. Ein Signal ohne Delta (oder mit
 * einem Delta, das sich zu 0 aufhebt) hat keinen Pol — dann darf keine Klasse
 * ihn für sich beanspruchen.
 * @returns 'positive' | 'negative' | null
 */
export function poleOfSignal(scoring, definition) {
  const deltas = scoring?.events?.[definition?.type]?.delta;
  if (deltas === null || typeof deltas !== 'object') return null;
  const sum = Object.values(deltas).reduce((total, value) => total + (typeof value === 'number' ? value : 0), 0);
  if (!Number.isFinite(sum) || sum === 0) return null;
  return sum > 0 ? 'positive' : 'negative';
}

/**
 * Einen Mechanismus-Ort auflösen: `datei#pfad` muss im benannten Vertrag einen
 * Wert tragen. Was nicht auflöst, ist eine Absichtserklärung — kein Mechanismus.
 */
export function resolveMechanism(where, docs) {
  if (typeof where !== 'string' || !where.includes('#')) return undefined;
  const [target, path] = where.split('#');
  const source = docs?.[target];
  if (source === undefined || source === null) return undefined;
  return resolvePath(source, path);
}

/**
 * Einen Punktpfad auflösen — und dabei SCHLÜSSEL MIT PUNKT treffen.
 *
 * Die Signaltabelle führt ihre Quellen unter `sources["feedback.rated"]`: der
 * Punkt gehört zum Schlüssel, nicht zum Pfad. Ein naives `split('.')` findet
 * diesen Ort nie und würde einen Mechanismus als „löst nicht auf" melden,
 * obwohl er dasteht. Deshalb wird an jeder Stufe zuerst der GANZE Rest als
 * Schlüssel versucht und erst dann geteilt.
 */
function resolvePath(value, path) {
  if (value === null || typeof value !== 'object') return undefined;
  const remaining = String(path);
  if (remaining === '') return value;
  if (Object.prototype.hasOwnProperty.call(value, remaining)) return value[remaining];
  const index = remaining.indexOf('.');
  if (index < 0) return undefined;
  return resolvePath(value[remaining.slice(0, index)], remaining.slice(index + 1));
}

/**
 * Die Tendenz-Regeln prüfen (Zug 3): Vertrag, Klassen, Herkünfte.
 *
 * „Klassen und Herkünfte" heißt hier konkret: jede Klasse nennt ihren POL, jedes
 * von ihr beanspruchte Signal muss es geben, beobachtbar sein und DENSELBEN Pol
 * im Vertrag tragen (das Vorzeichen seines Deltas, nicht sein Name), kein Signal
 * darf zwei Klassen speisen, und kein beobachtbares Signal darf übrig bleiben —
 * sonst rechnet die Tendenz an ihm vorbei. Dazu die Stufen (absteigend, Ende bei
 * 0), die Haltungen (geordnet, benannte Klasse + Stufe, letzte bedingungslos),
 * die Mindestevidenz — und die drei Mechanismen mit auflösendem Ort.
 *
 * @param tendency - der Vertrag `assets/tendency-rules.json`.
 * @param rules - die Signaltabelle (Herkunft jedes Signals).
 * @param scoring - der Scorecard-Vertrag (Pol über das Delta, Vergessen über decay).
 * @param file - Anzeigename für Befunde.
 */
export function tendencyRuleIssues(tendency, rules, scoring, file) {
  const issues = [];
  const at = (detail) => `${file}: ${detail}`;
  if (typeof tendency !== 'object' || tendency === null) return [at('kein Objekt')];
  if (tendency.contract !== TENDENCY_RULES_CONTRACT_ID) {
    issues.push(at(`contract muss "${TENDENCY_RULES_CONTRACT_ID}" sein (ist ${JSON.stringify(tendency.contract)})`));
  }
  if (typeof rules !== 'object' || rules === null || typeof scoring !== 'object' || scoring === null) {
    return [...issues, at('Signaltabelle oder Scorecard-Vertrag fehlt — ohne Herkunft keine Tendenz')];
  }

  // Kein Deckel, kein Limit, keine Sekundenregel — auch hier nicht.
  for (const path of keyPaths(tendency)) {
    const leaf = path.split('.').pop();
    if (FORBIDDEN_RULE_KEYS.includes(leaf)) {
      issues.push(at(`${path} ist verboten: Deckel, Zähler-Limit und Sekundenregeln gehören nicht in die Tendenz-Regeln`));
    }
  }

  // Die drei Mechanismen — und ihr Ort.
  const mechanisms = tendency.mechanisms ?? {};
  const docs = { 'signal-rules.json': rules, 'scoring-state.json': scoring };
  for (const [id, expected] of Object.entries(TENDENCY_MECHANISMS)) {
    const entry = mechanisms[id];
    if (entry === null || typeof entry !== 'object') {
      issues.push(at(`mechanisms.${id} fehlt (${id} lebt in ${expected})`));
      continue;
    }
    if (!isText(entry.label)) issues.push(at(`mechanisms.${id}.label fehlt`));
    if (!isText(entry.where)) {
      issues.push(at(`mechanisms.${id}.where fehlt — ein Mechanismus ohne Ort ist eine Behauptung`));
      continue;
    }
    const [target] = entry.where.split('#');
    if (target !== expected) {
      issues.push(at(`mechanisms.${id}.where nennt ${JSON.stringify(target)}, erwartet wird ${expected}`));
      continue;
    }
    if (resolveMechanism(entry.where, docs) === undefined) {
      issues.push(at(`mechanisms.${id}.where ${JSON.stringify(entry.where)} löst im Vertrag nicht auf`));
    }
  }
  for (const id of Object.keys(mechanisms)) {
    if (id === 'note') continue;
    if (TENDENCY_MECHANISMS[id] === undefined) {
      issues.push(at(`mechanisms.${id} ist kein benannter Mechanismus (${Object.keys(TENDENCY_MECHANISMS).join(', ')})`));
    }
  }

  // Klassen: Pol, Wort, Herkunft — und keine Lücke, kein Doppel.
  const signals = rules.signals ?? {};
  const classes = tendency.classes;
  if (!Array.isArray(classes) || classes.length === 0) issues.push(at('classes fehlt oder ist leer'));
  const classIds = new Set();
  const claimed = new Set();
  for (const [index, klass] of (Array.isArray(classes) ? classes : []).entries()) {
    const where = `classes[${index + 1}]`;
    if (!isText(klass?.id)) {
      issues.push(at(`${where}.id fehlt`));
      continue;
    }
    if (classIds.has(klass.id)) issues.push(at(`${where}.id ${JSON.stringify(klass.id)} ist doppelt`));
    else classIds.add(klass.id);
    if (!TENDENCY_POLES.includes(klass.pole)) {
      issues.push(at(`${where}.pole muss ${TENDENCY_POLES.join(' | ')} sein (ist ${JSON.stringify(klass.pole)})`));
    }
    if (!isText(klass.label)) issues.push(at(`${where}.label fehlt (eine Klasse ohne Wort)`));
    if (!Array.isArray(klass.signals) || klass.signals.length === 0) {
      issues.push(at(`${where}.signals fehlt oder ist leer`));
      continue;
    }
    for (const signalId of klass.signals) {
      const definition = signals[signalId];
      if (definition === undefined) {
        issues.push(at(`${where} nennt ${JSON.stringify(signalId)} — dieses Signal gibt es nicht`));
        continue;
      }
      if (definition.observable !== true) {
        issues.push(at(`${where} nennt ${signalId}, das die Tabelle als nicht beobachtbar führt`));
        continue;
      }
      if (claimed.has(signalId)) {
        issues.push(at(`${where} nennt ${signalId} ein zweites Mal — ein Signal trägt genau EINEN Pol`));
        continue;
      }
      claimed.add(signalId);
      const pole = poleOfSignal(scoring, definition);
      if (pole === null) {
        issues.push(at(`${signalId} hat kein Delta im Scorecard-Vertrag — ohne Vorzeichen kein Pol`));
      } else if (pole !== klass.pole) {
        issues.push(at(`${where} trägt den Pol ${klass.pole}, aber ${signalId} schiebt ${pole} (${definition.type})`));
      }
    }
  }
  for (const [signalId, definition] of Object.entries(signals)) {
    if (definition?.observable === true && !claimed.has(signalId)) {
      issues.push(at(`Signal ${signalId} speist keine Klasse — die Tendenz rechnet daran vorbei`));
    }
  }

  // Stufen: absteigend, eindeutig, Ende bei 0.
  const levels = tendency.levels;
  if (!Array.isArray(levels) || levels.length === 0) issues.push(at('levels fehlt oder ist leer'));
  const levelIds = new Set();
  let previous = Infinity;
  for (const [index, level] of (Array.isArray(levels) ? levels : []).entries()) {
    const where = `levels[${index + 1}]`;
    if (!isText(level?.id)) {
      issues.push(at(`${where}.id fehlt`));
      continue;
    }
    if (levelIds.has(level.id)) issues.push(at(`${where}.id ${JSON.stringify(level.id)} ist doppelt`));
    else levelIds.add(level.id);
    if (typeof level.minShare !== 'number' || !(level.minShare >= 0 && level.minShare <= 1)) {
      issues.push(at(`${where}.minShare muss zwischen 0 und 1 liegen (ist ${JSON.stringify(level.minShare)})`));
      continue;
    }
    if (level.minShare > previous) issues.push(at(`${where}.minShare steigt — die Stufen müssen absteigend stehen`));
    previous = level.minShare;
  }
  if (Array.isArray(levels) && levels.length > 0 && levels[levels.length - 1]?.minShare !== 0) {
    issues.push(at('die letzte Stufe muss bei 0 liegen — sonst bleibt ein Anteil ohne Wort'));
  }

  // Haltungen: geordnet, benannte Klasse UND Stufe, letzte bedingungslos.
  const stances = tendency.stances;
  if (!Array.isArray(stances) || stances.length === 0) issues.push(at('stances fehlt oder ist leer'));
  for (const [index, stance] of (Array.isArray(stances) ? stances : []).entries()) {
    const where = `stances[${index + 1}]`;
    if (!isText(stance?.id)) issues.push(at(`${where}.id fehlt`));
    const when = stance?.when;
    if (when === undefined) continue;
    if (when === null || typeof when !== 'object') {
      issues.push(at(`${where}.when muss ein Objekt sein`));
      continue;
    }
    for (const [classId, levelId] of Object.entries(when)) {
      if (!classIds.has(classId)) issues.push(at(`${where}.when nennt die Klasse ${JSON.stringify(classId)}, die es nicht gibt`));
      if (!levelIds.has(levelId)) issues.push(at(`${where}.when nennt die Stufe ${JSON.stringify(levelId)}, die es nicht gibt`));
    }
  }
  const last = Array.isArray(stances) && stances.length > 0 ? stances[stances.length - 1] : undefined;
  if (last !== undefined && last?.when !== undefined) {
    issues.push(at('die letzte Haltung muss bedingungslos sein — sonst gibt es Lagen ohne Haltung'));
  }

  // Mindestevidenz: darunter wird nichts behauptet.
  if (!Number.isInteger(tendency.minSignals) || tendency.minSignals < 1) {
    issues.push(at(`minSignals muss eine ganze Zahl ≥ 1 sein (ist ${JSON.stringify(tendency.minSignals)})`));
  }
  return issues;
}

/**
 * Ein Schreibverb zählen — lokale Map/Set-Aufräumarbeit ist KEIN Dienst-Ausgang.
 *
 * `sessionBlocks.delete(sessionId)` leert eine Map im Speicher, wenn eine
 * Sitzung neu beginnt; das ist dieselbe Buchhaltung wie `splice`, kein zweiter
 * Weg in die Ablage. Der Scan unterscheidet deshalb nach dem EMPFÄNGER: ein
 * `delete` auf einer hier als `new Map(...)`/`new Set(...)` gebundenen Variablen
 * zählt nicht, `store.delete('x')` schon. Die Zusage bleibt dieselbe — der eine
 * Ausgang ist der Signal-Anhang, jedes andere Schreibverb auf einem Dienst ist
 * ein Befund.
 */
function storeVerbHits(code, verb, localCollections) {
  const receiver = new RegExp(`([A-Za-z_$][\\w$]*)\\.${verb}\\s*\\(`, 'g');
  let hits = 0;
  for (const match of code.matchAll(receiver)) {
    if (!localCollections.has(match[1])) hits += 1;
  }
  return hits;
}

/**
 * Den EINEN Ausgang prüfen (Zusage aus dem Kopf dieser Datei).
 *
 * Der Host hängt ein Signal an: ein `save` auf dem Dienst der Ablage. Genau eines
 * — und genau ein `load` beim Start. Jedes weitere Schreibverb auf einem Dienst
 * wäre ein zweiter Weg, und ein zweiter Weg wäre eine Zusage, die niemand liest.
 * Der Kern (assets/*.js) wird hier nicht geprüft: er hat keinen Dienst und keine
 * Datei (dafür steht `staticIssues`).
 */
export function outcomeIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    if (!file.endsWith('index.js')) continue;
    const code = codeOnly(source);
    // Lokale Speicher-Aufräumer (Map/Set) sind keine Dienste. Sie werden aus
    // DEMSELBEN Quelltext gelesen, damit die Ausnahme nicht geraten ist.
    const localCollections = new Set();
    for (const match of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:Map|Set)\s*\(/g)) {
      localCollections.add(match[1]);
    }
    const count = (pattern) => (code.match(pattern) ?? []).length;
    const saves = count(/\.save\s*\(/g);
    if (saves !== 1) issues.push(`${file}: die Zusage ist EIN Ausgang — erwartet genau 1 \`save\`, gefunden ${saves}`);
    const loads = count(/\.load\s*\(/g);
    if (loads !== 1) issues.push(`${file}: erwartet genau 1 \`load\` beim Start, gefunden ${loads}`);
    for (const verb of STORE_VERBS) {
      const hits = storeVerbHits(code, verb, localCollections);
      if (hits > 0) {
        issues.push(`${file}: \`${verb}\` auf einem Dienst — der einzige Ausgang ist der Signal-Anhang (\`save\`)`);
      }
    }
  }
  return issues;
}

function readSources(base) {
  const files = ['index.js', 'client.js'];
  const assetsDir = join(base, 'assets');
  if (existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) files.push(`assets/${entry.name}`);
    }
  }
  return files
    .filter((file) => existsSync(join(base, file)))
    .map((file) => ({ file: `packages/scoring/${file}`, source: readFileSync(join(base, file), 'utf8') }));
}

export function check(ctx) {
  const pkg = ctx.packages.find((candidate) => candidate.dir === 'scoring');
  if (!pkg) return ['packages/scoring/ fehlt (Scoring-Schicht nicht vorhanden)'];

  const issues = [];
  const load = (full, display, label) => {
    if (!existsSync(full)) {
      issues.push(`${display} fehlt (${label})`);
      return null;
    }
    try {
      return JSON.parse(readFileSync(full, 'utf8'));
    } catch (error) {
      issues.push(`${display} ist kein gültiges JSON: ${error.message}`);
      return null;
    }
  };
  const own = (rel, label) => load(join(pkg.base, rel), `packages/scoring/${rel}`, label);

  const scoring = own('assets/scoring-state.json', 'Scorecard-Vertrag');
  const profile = own('assets/technical-profile.json', 'Technik-Profil');
  const triggerDoc = own('assets/skill-triggers.json', 'Skill-Trigger');
  const rules = own('assets/signal-rules.json', 'Signaltabelle (K5)');
  const tendencyRules = own('assets/tendency-rules.json', 'Tendenz-Regeln (Zug 3)');
  const eventsPkg = ctx.packages.find((candidate) => candidate.dir === 'events');
  let spine = null;
  if (!eventsPkg) {
    issues.push('packages/events/ fehlt (Spine als Referenz fehlt)');
  } else {
    spine = load(join(eventsPkg.base, 'assets/event-spine.json'), 'packages/events/assets/event-spine.json', 'Spine-Vertrag');
  }

  const sources = readSources(pkg.base);
  if (!sources.some((entry) => entry.file.endsWith('index.js'))) {
    issues.push('packages/scoring/index.js fehlt');
  } else {
    issues.push(...staticIssues(sources));
    issues.push(...scopeIssues(sources));
  }

  if (scoring && profile && triggerDoc && spine) {
    issues.push(...contractIssues(scoring, profile, triggerDoc, spine, 'assets/scoring-state.json'));
  }

  if (spine && rules && scoring) {
    issues.push(...signalRuleIssues(rules, scoring, spine, 'assets/signal-rules.json'));
  }

  if (tendencyRules && rules && scoring) {
    issues.push(...tendencyRuleIssues(tendencyRules, rules, scoring, 'assets/tendency-rules.json'));
  }

  issues.push(...outcomeIssues(sources));

  // Profil muss das Bundle aktivieren, sonst läuft das Scoring nie.
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const resolved = ctx.repo.resolveProfile(profileName, ctx.packages);
    if (!(resolved.bundles ?? []).includes('@shinon/scoring')) {
      issues.push(`Profil ${profileName}: @shinon/scoring ist nicht in dsh.profile.bundles`);
    }
  }

  return issues;
}
