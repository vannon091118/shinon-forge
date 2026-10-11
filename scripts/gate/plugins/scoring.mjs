/**
 * scoring — Scorecard, Decay, Relation. Lesen, nie schreiben.
 *
 * Drei Zusagen, drei Prüfungen:
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
 *
 * Die reinen Funktionen sind ohne node_modules testbar; die Tests liegen in
 * scripts/gate/tests/scoring.test.mjs.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findForbidden } from '../../lib/source-scan.mjs';

export const id = 'scoring';

export const SCORING_CONTRACT_ID = 'shinon.scoring-state/v1';
export const PROFILE_CONTRACT_ID = 'shinon.technical-profile/v1';
export const TRIGGERS_CONTRACT_ID = 'shinon.skill-triggers/v1';
export const SIGNAL_RULES_CONTRACT_ID = 'shinon.signal-rules/v1';

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
];

/** Die sieben Signale der Plan-Tabelle — genau diese, keine mehr. */
export const SIGNAL_IDS = ['adopt', 'accept', 'copy', 'dismiss', 'nextq', 'rephrase', 'selffix'];

/** Die drei Arten, die eine Quelle haben kann: werten, zurücknehmen, nur notieren. */
export const SOURCE_KINDS = ['note', 'retract', 'score'];

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

/** Lesbar zusätzlich: der reine Kern und die eingefrorene Replay-Fixture. */
export const READABLE_ASSETS = [...WRITABLE_ASSETS, 'assets/scoring-core.js', 'assets/replay/scoring-demo.json'];

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
    if (source.kind === 'note' && claims.length > 0) {
      issues.push(at(`sources.${type} ist nur eine Notiz und darf kein Signal beanspruchen`));
    }
    for (const claim of claims) {
      const signal = claim.includes(' ') ? claim.split(' ')[0] : claim;
      referenced.add(signal);
      const definition = signals[signal];
      if (definition === undefined) {
        issues.push(at(`sources.${type} nennt ${JSON.stringify(claim)} — dieses Signal gibt es nicht`));
      } else if (definition.observable !== true) {
        issues.push(at(`sources.${type} nennt ${signal}, das die Tabelle als nicht beobachtbar führt`));
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
