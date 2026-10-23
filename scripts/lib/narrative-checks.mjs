/**
 * narrative-checks.mjs — Eigentümer: die Prüfungen des Gate-Plugins `narrative`.
 *
 * Das Plugin `scripts/gate/plugins/narrative.mjs` ist die Fassade: es nennt
 * `id` und gibt `check` und die geprüfte Fläche weiter. Die Richtung ist
 * Fassade → Teil; diese Datei importiert das Plugin nie.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findForbidden, findMissing } from './source-scan.mjs';
import { EVENT_TYPES as SPINE_EVENT_TYPES } from './events-spine-checks.mjs';


/** Vertragsname des Zustands (Daten, nicht Code) — gepinnt in beiden Paketen. */
export const NARRATIVE_CONTRACT_ID = 'shinon.narrative/v1';

/** Der EINE Ausgang des Pakets. */
export const STATE_CHANNEL = 'shinon/narrative/state';

/** Die Felder, die der Composite nach außen trägt (aus dem Vertrag). */
export const COMPOSITE_FIELDS = ['seq', 'mood', 'narrator', 'arc_id', 'relationship_state'];

/** Die Evidenzlevel, die ein Übergang nennen darf (Spiegel des Kerns). */
export const EVIDENCE_LEVELS = ['EVENT_TYPE', 'EXPLICIT_PAYLOAD', 'NONE'];

/**
 * Der ABNEHMER. Bis Zug 6 war diese Liste leer — und das Gate hätte die Lücke
 * benannt, statt sie zu überspringen.
 *
 * Ein Abnehmer ist: eine Host-Hälfte, die den Kanal aus `@shinon/seams/core`
 * IMPORTIERT, ihn wirklich abonniert (`ctx.on` auf genau diesen Namen) und
 * aus dem Composite etwas PRÜFBARES macht — einen Datensatz in der
 * Entscheidungsspur, den eine Prüfung finden kann. Prompt-Elemente sind kein
 * Nachweis: der Veredler trägt keine Narrative-Lage mehr im Stand-Block,
 * die Persona keinen Narrativ-Abschnitt im Prompt. Was bleibt, ist die Spur.
 *
 * Der Name hat EINE Definition (`@shinon/seams`); hier wird geprüft, dass
 * daraus auch ein Abnehmer wird.
 */
export const CONSUMERS = [
  {
    dir: 'prompter',
    file: 'index.js',
    label: 'Entscheidungsspur des Veredlers (MAX)',
    evidence: 'narrative: stand.narrative',
    evidenceFile: 'assets/stand.js',
    contractFile: null,
  },
];

/** Pflicht-Token im Laufzeitcode (die Fähigkeit existiert, nicht ihre Qualität). */
export const REQUIRED_TOKENS = ['STATE_CHANNEL', 'ctx.emit', 'bus.route', 'advance', 'initialState'];

/** Pflicht-Token im Kern: die sechs reinen Bausteine der Ableitung. */
export const REQUIRED_CORE_TOKENS = ['deriveComposite', 'deriveMood', 'deriveNarrator', 'relationshipState', 'createArc', 'appendChronicle'];

/** Verbotene Module: Importnamen werden auch in Strings erkannt. */
export const FORBIDDEN_MODULES = ['child_process'];

/**
 * Verbotene Aufrufe: die Narrative liest und meldet — sie würfelt nicht, liest
 * keine Uhr, spricht nicht mit dem Netz, startet nichts und schreibt nichts.
 * `Date.now`/`new Date(` sind hier besonders wichtig: der Kern hat die Uhr
 * ausdrücklich verloren (der fehlende Zeitstempel bleibt `null`), und eine
 * wieder eingeführte Uhr wäre still nicht reproduzierbar.
 */
export const FORBIDDEN_TOKENS = [
  'djb2',
  'Math.random',
  'Date.now',
  'new Date(',
  'writeFile',
  'writeFileSync',
  'mkdirSync',
  'rmSync',
  'unlinkSync',
  'execSync',
  'spawn(',
  'fetch(',
  'http.request',
  'process.exit',
  'ctx.agents',
  'ctx.llm',
  'ctx.shell',
  'ctx.tools',
  'ctx.set(',
  'ctx.provide',
];

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isList = (value, each = isText) => Array.isArray(value) && value.length > 0 && value.every(each);

/**
 * Den Vertrag prüfen: Name, Rolle, Vollständigkeit der Ableitung.
 *
 * Fail-closed heißt hier: eine Mood-Tabelle ohne Pool, eine Erzähler-Regel ohne
 * Rückfall, eine Arc-Themenliste ohne Eintrag oder eine Beziehungsregel ohne
 * Stufen sind je ein Befund. Ohne diese Daten RÄT der Kern — und Raten ist in
 * diesem Paket ausdrücklich der Zustand, der 2026-10-11 entfernt wurde.
 */
export function contractIssues(contract, file) {
  const issues = [];
  const at = (detail) => `${file}: ${detail}`;
  if (typeof contract !== 'object' || contract === null) return [at('kein Objekt')];
  if (contract.contract !== NARRATIVE_CONTRACT_ID) {
    issues.push(at(`contract muss "${NARRATIVE_CONTRACT_ID}" sein (ist ${JSON.stringify(contract.contract)})`));
  }
  // Die DOKI-Regel: abgeleitet ist nicht autoritativ. Die Engine sagt das selbst.
  if (contract.authority !== 'NONE') {
    issues.push(at(`authority muss "NONE" sein (ist ${JSON.stringify(contract.authority)}) — abgeleitet ist nicht autoritativ`));
  }
  if (!isText(contract.role)) issues.push(at('role fehlt (was diese Schicht ist)'));

  const fields = contract.fields;
  if (!isList(fields, (entry) => isText(entry?.name) && isText(entry?.type))) {
    issues.push(at('fields fehlt oder ist unvollständig (jedes Feld braucht name und type)'));
  }

  const derivation = contract.derivation;
  if (typeof derivation !== 'object' || derivation === null) {
    return [...issues, at('derivation fehlt — ohne Ableitung gibt es keinen Takt')];
  }

  // Der Composite: die Felder, die nach außen gehen, müssen benannt sein.
  const composite = derivation.composite;
  if (!isList(composite?.output, isText)) {
    issues.push(at('derivation.composite.output fehlt oder ist leer'));
  } else {
    for (const field of COMPOSITE_FIELDS) {
      if (!composite.output.includes(field)) issues.push(at(`derivation.composite.output nennt ${field} nicht`));
    }
  }

  // Die Regeln: explizit, versioniert und vollständig — sonst rät der Kern.
  const rules = contract.rules;
  if (typeof rules !== 'object' || rules === null) {
    return [...issues, at('rules fehlt — ohne explizite Regeln gibt es keine Ableitung')];
  }
  if (!Number.isInteger(rules.version) || rules.version < 2) {
    issues.push(at('rules.version muss eine ganze Zahl ≥ 2 sein (v2 = explizite Regeln statt Hash)'));
  }
  const pool = rules.moodPool;
  if (!isList(pool, isText)) issues.push(at('rules.moodPool fehlt oder ist leer'));
  const themes = rules.arcThemes;
  if (!isList(themes, isText)) issues.push(at('rules.arcThemes fehlt oder ist leer'));

  const moodByEvidence = rules.moodByEvidence;
  if (typeof moodByEvidence !== 'object' || moodByEvidence === null || Object.keys(moodByEvidence).length === 0) {
    issues.push(at('rules.moodByEvidence fehlt oder ist leer — dann wird der Mood geraten'));
  } else {
    for (const [type, entry] of Object.entries(moodByEvidence)) {
      if (!SPINE_EVENT_TYPES.includes(type)) {
        issues.push(at(`rules.moodByEvidence nennt ${type} — den Typ kennt der Spine nicht, der Takt klingt nie`));
      }
      if (typeof entry !== 'object' || entry === null) {
        issues.push(at(`rules.moodByEvidence.${type} ist kein Objekt (mood, reason, evidence)`));
        continue;
      }
      if (!isText(entry.mood)) issues.push(at(`rules.moodByEvidence.${type}.mood fehlt`));
      else if (Array.isArray(pool) && !pool.includes(entry.mood)) {
        issues.push(at(`rules.moodByEvidence.${type}.mood = ${JSON.stringify(entry.mood)} steht nicht in moodPool`));
      }
      if (!isText(entry.reason)) issues.push(at(`rules.moodByEvidence.${type}.reason fehlt — jeder Übergang braucht einen Grund`));
      if (!EVIDENCE_LEVELS.includes(entry.evidence) || entry.evidence === 'NONE') {
        issues.push(at(`rules.moodByEvidence.${type}.evidence muss EVENT_TYPE oder EXPLICIT_PAYLOAD sein`));
      }
    }
  }

  const themeByEvent = rules.themeByEvent;
  if (typeof themeByEvent !== 'object' || themeByEvent === null || Object.keys(themeByEvent).length === 0) {
    issues.push(at('rules.themeByEvent fehlt oder ist leer — dann hat der Arc kein Thema'));
  } else {
    for (const [type, theme] of Object.entries(themeByEvent)) {
      if (!SPINE_EVENT_TYPES.includes(type)) issues.push(at(`rules.themeByEvent nennt ${type} — den Typ kennt der Spine nicht`));
      if (!isText(theme)) issues.push(at(`rules.themeByEvent.${type} ist kein Thema`));
      else if (Array.isArray(themes) && !themes.includes(theme)) {
        issues.push(at(`rules.themeByEvent.${type} = ${JSON.stringify(theme)} steht nicht in arcThemes`));
      }
    }
    for (const type of Object.keys(moodByEvidence ?? {})) {
      if (!Object.hasOwn(themeByEvent, type)) {
        issues.push(at(`rules.themeByEvent fehlt für ${type} — ein semantischer Takt ohne Arc-Thema`));
      }
    }
  }

  // Erzähler: Rückfall benannt, Zuordnung ausdrücklich.
  const narrator = rules.narrator ?? {};
  if (!isText(narrator.default)) issues.push(at('rules.narrator.default fehlt (wer erzählt, wenn nichts passt)'));
  if (narrator.byEvent !== undefined) {
    if (typeof narrator.byEvent !== 'object' || narrator.byEvent === null) {
      issues.push(at('rules.narrator.byEvent muss ein Objekt sein'));
    } else {
      for (const [type, who] of Object.entries(narrator.byEvent)) {
        if (!SPINE_EVENT_TYPES.includes(type)) issues.push(at(`rules.narrator.byEvent nennt ${type} — unbekannter Typ`));
        if (!isText(who)) issues.push(at(`rules.narrator.byEvent.${type} ist kein Erzähler`));
      }
    }
  }

  const states = rules.relationshipStates;
  if (!isList(states, isText)) issues.push(at('rules.relationshipStates fehlt oder ist leer'));
  const transitions = rules.relationshipTransitions;
  if (transitions !== undefined && !Array.isArray(transitions)) {
    issues.push(at('rules.relationshipTransitions muss eine Liste sein'));
  } else {
    const seen = new Set();
    for (const [index, transition] of (transitions ?? []).entries()) {
      const where = `rules.relationshipTransitions[${index}]`;
      if (typeof transition !== 'object' || transition === null) {
        issues.push(at(`${where} ist kein Objekt`));
        continue;
      }
      if (!SPINE_EVENT_TYPES.includes(transition.event)) {
        issues.push(at(`${where}.event ${JSON.stringify(transition.event)} kennt der Spine nicht`));
      }
      if (!isText(transition.reason)) issues.push(at(`${where}.reason fehlt`));
      if (!EVIDENCE_LEVELS.includes(transition.evidence) || transition.evidence === 'NONE') {
        issues.push(at(`${where}.evidence muss EVENT_TYPE oder EXPLICIT_PAYLOAD sein`));
      }
      if (Array.isArray(states) && (!states.includes(transition.from) || !states.includes(transition.to))) {
        issues.push(at(`${where}: from/to müssen Zustände aus relationshipStates sein`));
      }
      if (transition.from === transition.to) issues.push(at(`${where}: from und to sind gleich`));
      if (transition.field !== undefined) {
        if (!isText(transition.field) || !isList(transition.when, isText)) {
          issues.push(at(`${where}: field braucht when (Liste von Werten)`));
        }
        if (transition.evidence !== 'EXPLICIT_PAYLOAD') {
          issues.push(at(`${where}: ein Payload-Feld ist EXPLICIT_PAYLOAD, nicht ${JSON.stringify(transition.evidence)}`));
        }
      }
      const key = `${transition.event}|${transition.from}`;
      if (seen.has(key)) issues.push(at(`${where}: zweite Transition für ${key} — welcher gilt, wäre nicht entscheidbar`));
      seen.add(key);
    }
  }
  return issues;
}

/** Laufzeitgrenze: lesen und melden ja, handeln nein. Kommentare zählen nicht. */
export function staticIssues(sources) {
  const issues = [];
  for (const { file, source } of sources) {
    for (const token of findForbidden(source, FORBIDDEN_MODULES, { mode: 'module' })) {
      issues.push(`${file}: verbotener Modulimport ${token} — die Narrative beobachtet, sie handelt nicht`);
    }
    for (const token of findForbidden(source, FORBIDDEN_TOKENS)) {
      issues.push(`${file}: verbotener Aufruf ${token} — die Narrative beobachtet, sie handelt nicht`);
    }
  }
  return issues;
}

/**
 * Den ABNEHMER prüfen — die Zusage, die bis Zug 6 fehlte.
 *
 * Geprüft wird nicht, dass irgendwo "narrative" steht, sondern die drei Dinge,
 * die einen Abnehmer ausmachen: der Kanalname als IMPORT aus dem Naht-Kern
 * (`'@shinon/seams/core'`), ein `ctx.on` auf diesen Namen, und ein Datensatz,
 * der aus dem Composite entsteht. Ein Abnehmer, der den Kanalnamen falsch
 * schreibt, sieht aus wie "es gibt keine Narrative" — deshalb ist die
 * Buchstabenfolge hier keine Stilfrage, sondern der Befund. Die Prüfung
 * läuft über die Liste CONSUMERS, an den Abnehmer selbst werden die beiden
 * Quelltexte gereicht.
 *
 * @param consumer - Eintrag aus CONSUMERS.
 * @param sources - `{ main, evidence }`; `null`, wo die Datei fehlt.
 * @param stateContract - geparster Zustandsvertrag des Abnehmers (nur Persona).
 */
export function consumerIssues(consumer, sources, stateContract) {
  const issues = [];
  const file = `packages/${consumer.dir}/${consumer.file}`;
  const { main, evidence } = sources;
  if (main === null) {
    issues.push(`${file}: fehlt — der Kanal ${STATE_CHANNEL} hat hier keinen Abnehmer`);
    return issues;
  }
  if (!/import\s*\{[^}]*NARRATIVE_STATE_CHANNEL[^}]*\}\s*from\s*'@shinon\/seams\/core'/.test(main)) {
    issues.push(`${file}: importiert NARRATIVE_STATE_CHANNEL nicht aus '@shinon/seams/core' — der Kanalname ist eine Definition, keine Kopie`);
  }
  if (main.includes(`'${STATE_CHANNEL}'`)) {
    issues.push(`${file}: trägt den Kanalnamen '${STATE_CHANNEL}' wieder als Literal — das ist die Kopie, die der Naht-Kern ersetzt hat`);
  }
  if (!/(?:ctx\.on|bus\.route)\(\s*NARRATIVE_CHANNEL/.test(main)) {
    issues.push(`${file}: kein \`bus.route(NARRATIVE_CHANNEL, …)\` — der Composite geht ins Leere`);
  }
  const evidenceFile = `packages/${consumer.dir}/${consumer.evidenceFile}`;
  if (evidence === null) {
    issues.push(`${evidenceFile}: fehlt (${consumer.label} nicht nachweisbar)`);
  } else if (!evidence.includes(consumer.evidence)) {
    issues.push(`${evidenceFile}: ${consumer.evidence} fehlt — der Composite wird nicht als ${consumer.label} sichtbar`);
  }
  if (consumer.contractFile !== null) {
    if (stateContract === null) {
      issues.push(`packages/${consumer.dir}/${consumer.contractFile} fehlt (der Abnehmer braucht die Beschriftung aus Daten)`);
    } else {
      const narrative = stateContract.narrative;
      if (typeof narrative !== 'object' || narrative === null) {
        issues.push(`packages/${consumer.dir}/${consumer.contractFile}: narrative-Block fehlt — eine Sektion ohne Beschriftung`);
      } else {
        if (!isText(narrative.heading)) issues.push(`packages/${consumer.dir}/${consumer.contractFile}: narrative.heading fehlt`);
        if (!isList(Object.keys(narrative.fields ?? {}), isText)) {
          issues.push(`packages/${consumer.dir}/${consumer.contractFile}: narrative.fields fehlt oder ist leer`);
        }
      }
    }
  }
  return issues;
}

function readIfPresent(path, file, issues) {
  if (!existsSync(path)) {
    issues.push(`${file} fehlt`);
    return null;
  }
  return readFileSync(path, 'utf8');
}

export function check(ctx) {
  const issues = [];
  const pkg = ctx.packages.find((candidate) => candidate.dir === 'narrative');
  if (!pkg) return ['packages/narrative/ fehlt (Narrative-Schicht nicht vorhanden)'];

  const sources = [];
  const indexSource = readIfPresent(join(pkg.base, 'index.js'), 'packages/narrative/index.js', issues);
  if (indexSource !== null) {
    sources.push({ file: 'packages/narrative/index.js', source: indexSource });
    for (const token of findMissing(indexSource, REQUIRED_TOKENS)) {
      issues.push(`packages/narrative/index.js: ${token} fehlt (Host-Hälfte unvollständig)`);
    }
  }

  const coreSource = readIfPresent(join(pkg.base, 'assets/narrative-core.js'), 'packages/narrative/assets/narrative-core.js', issues);
  if (coreSource !== null) {
    sources.push({ file: 'packages/narrative/assets/narrative-core.js', source: coreSource });
    for (const token of findMissing(coreSource, REQUIRED_CORE_TOKENS)) {
      issues.push(`packages/narrative/assets/narrative-core.js: ${token} fehlt (Kern unvollständig)`);
    }
    if (/^\s*import\b/m.test(coreSource)) {
      issues.push('packages/narrative/assets/narrative-core.js: Import gefunden — der Kern muss importfrei bleiben (CI ohne node_modules)');
    }
  }

  issues.push(...staticIssues(sources));

  // Der Vertrag.
  const contractPath = join(pkg.base, 'assets/narrative-state.json');
  if (!existsSync(contractPath)) {
    issues.push('packages/narrative/assets/narrative-state.json fehlt (Zustandsvertrag)');
  } else {
    try {
      issues.push(...contractIssues(JSON.parse(readFileSync(contractPath, 'utf8')), 'assets/narrative-state.json'));
    } catch (error) {
      issues.push(`assets/narrative-state.json ist kein gültiges JSON: ${error.message}`);
    }
  }

  // Die Abnehmer (die Zusage, die bis Zug 6 fehlte).
  for (const consumer of CONSUMERS) {
    const consumerPkg = ctx.packages.find((candidate) => candidate.dir === consumer.dir);
    if (!consumerPkg) {
      issues.push(`packages/${consumer.dir}/ fehlt — der Kanal ${STATE_CHANNEL} hat hier keinen Abnehmer`);
      continue;
    }
    const sources = {
      main: readIfPresent(join(consumerPkg.base, consumer.file), `packages/${consumer.dir}/${consumer.file}`, []),
      evidence: readIfPresent(join(consumerPkg.base, consumer.evidenceFile), `packages/${consumer.dir}/${consumer.evidenceFile}`, []),
    };
    let stateContract = null;
    if (consumer.contractFile !== null) {
      const statePath = join(consumerPkg.base, consumer.contractFile);
      if (existsSync(statePath)) {
        try {
          stateContract = JSON.parse(readFileSync(statePath, 'utf8'));
        } catch (error) {
          issues.push(`packages/${consumer.dir}/${consumer.contractFile} ist kein gültiges JSON: ${error.message}`);
        }
      }
    }
    issues.push(...consumerIssues(consumer, sources, stateContract));
  }

  // Das Profil muss das Bundle aktivieren, sonst läuft die Engine nie.
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
    if (!(profile.bundles ?? []).includes('@shinon/narrative')) {
      issues.push(`Profil ${profileName}: @shinon/narrative ist nicht in dsh.profile.bundles`);
    }
  }

  return issues;
}
