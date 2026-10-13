/**
 * narrative — die Narrative Engine: lesen, ableiten, melden. Sie handelt nicht.
 *
 * WARUM DIESES GATE EXISTIERT (gemessen, nicht behauptet): `@shinon/narrative`
 * ist seit Zug 5 im Profil aktiv und rechnet bei jedem Spines-Ereignis einen
 * Composite (Arc, Erzähler, Beziehungsstufe, eigener Mood). Emittiert wurde er
 * auf `shinon/narrative/state` — und diesen Kanal hatte NIEMAND abonniert. Die
 * Engine war ein Radiosender ohne Empfänger: sie rechnete, und kein Gerät in der
 * Wohnung hatte ein Programm eingestellt. Das Paket hatte Unit-Tests für seine
 * Mathematik und kein Gate für seine VERDRAHTUNG — genau die Lücke, durch die
 * der Composite ins Leere gehen konnte.
 *
 * Fünf Zusagen, fünf Prüfungen:
 *   1. Der Vertrag (assets/narrative-state.json) trägt seinen Namen und ist
 *      vollständig: Mood-Tabelle, Erzähler-Regel, Arc-Themen, Beziehungsstufen.
 *      Jeder Ereignistyp der Mood-Tabelle ist ein Typ des Spines — eine Zeile
 *      auf ein Ereignis, das es nicht gibt, wäre ein Takt, der nie klingt.
 *   2. Die Ableitung ist deterministisch und uhrfrei: kein Zufall, keine Uhr,
 *      kein Modell, kein Tool, kein Schreiben — im Laufzeitcode UND im Kern.
 *   3. Der Ausgang ist genau EINER: der Composite geht als Ereignis
 *      (`STATE_CHANNEL`) hinaus. Es gibt keinen zweiten Weg — ein `ctx.provide`
 *      eines Zustands wäre der „tote Dienst" von vorher, und der ist entfernt.
 *   4. Der KANAL HAT ABNEHMER. Das ist die Zusage, die bis Zug 6 fehlte: die
 *      Persona trägt den Kanalnamen als Literal und registriert daraus einen
 *      Prompt-Abschnitt, der Veredler trägt ihn ebenso und baut daraus das
 *      Element `<narrative>` seines Stand-Blocks (der in den MAX-Aufruf geht).
 *      Ohne diese Prüfung darf das Gate nicht grün sein — ein Sender ohne
 *      Empfänger ist kein Feature.
 *   5. Das Profil aktiviert das Bundle, sonst läuft die Engine nie (dieselbe
 *      Regel wie beim Persona- und beim Scoring-Gate).
 *
 * Die reinen Funktionen des Pakets sind schon ohne node_modules getestet
 * (packages/narrative/test/narrative.test.mjs). Dieses Gate prüft die
 * VERDRAHTUNG, die ein Pakettest von innen nicht sehen kann.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findForbidden, findMissing } from '../../lib/source-scan.mjs';
import { EVENT_TYPES as SPINE_EVENT_TYPES } from './events-spine.mjs';

export const id = 'narrative';

/** Vertragsname des Zustands (Daten, nicht Code) — gepinnt in beiden Paketen. */
export const NARRATIVE_CONTRACT_ID = 'shinon.narrative/v1';

/** Der EINE Ausgang des Pakets. */
export const STATE_CHANNEL = 'shinon/narrative/state';

/** Die Felder, die der Composite nach außen trägt (aus dem Vertrag). */
export const COMPOSITE_FIELDS = ['seq', 'mood', 'narrator', 'arc_id', 'relationship_state'];

/**
 * Die ABNEHMER. Bis Zug 6 war diese Liste leer — und das Gate hätte die Lücke
 * benannt, statt sie zu überspringen.
 *
 * Ein Abnehmer ist: ein Paket, das den Kanalnamen als LITERAL trägt (es kann
 * `index.js` nicht importieren), den Kanal wirklich abonniert (`ctx.on` auf genau
 * diesen Namen) und aus dem Composite etwas SICHTBARES macht — ein Element, das
 * eine Prüfung finden kann. Es sind zwei, und sie lesen denselben Composite in
 * zwei verschiedene Ausgänge:
 *
 *   persona   den System-Prompt-Abschnitt `shinon:narrative-arc`
 *   prompter  das Element `<narrative>` im Stand-Block, den MAX als eigenen
 *             Block in den Modellaufruf hängt
 *
 * Beide Spiegel werden von `scripts/lib/repo.mjs` (SOURCE_TWINS) gegen den einen
 * Besitzer gepinnt; hier wird geprüft, dass daraus auch ein Abnehmer wird.
 */
export const CONSUMERS = [
  {
    dir: 'persona',
    file: 'index.js',
    label: 'System-Prompt-Abschnitt',
    evidence: "'shinon:narrative-arc'",
    evidenceFile: 'index.js',
    contractFile: 'assets/persona-state.json',
  },
  {
    dir: 'prompter',
    file: 'index.js',
    label: 'Stand-Block des Veredlers (MAX)',
    evidence: '<narrative',
    evidenceFile: 'assets/note-core.js',
    contractFile: null,
  },
];

/** Pflicht-Token im Laufzeitcode (die Fähigkeit existiert, nicht ihre Qualität). */
export const REQUIRED_TOKENS = ['STATE_CHANNEL', 'ctx.emit', 'ctx.on', 'advance', 'initialState'];

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

  // Mood: Pool + Ereignistabelle, jeder Typ ein Typ des Spines.
  const mood = derivation.mood ?? {};
  const pool = mood.pool;
  if (!isList(pool, isText)) {
    issues.push(at('derivation.mood.pool fehlt oder ist leer (die Anti-Wiederholung braucht eine Liste)'));
  }
  const byEvent = mood.by_event;
  if (typeof byEvent !== 'object' || byEvent === null || Object.keys(byEvent).length === 0) {
    issues.push(at('derivation.mood.by_event fehlt oder ist leer — dann wird der Mood geraten'));
  } else {
    for (const [type, value] of Object.entries(byEvent)) {
      if (!SPINE_EVENT_TYPES.includes(type)) {
        issues.push(at(`derivation.mood.by_event nennt ${type} — den Typ kennt der Spine nicht, der Takt klingt nie`));
      }
      if (!isText(value)) issues.push(at(`derivation.mood.by_event.${type} ist kein Mood`));
      else if (Array.isArray(pool) && !pool.includes(value)) {
        issues.push(at(`derivation.mood.by_event.${type} = ${JSON.stringify(value)} steht nicht in mood.pool`));
      }
    }
  }

  // Erzähler: Rückfall benannt.
  const narrator = derivation.narrator ?? {};
  if (!isText(narrator.default)) issues.push(at('derivation.narrator.default fehlt (wer erzählt, wenn nichts passt)'));

  // Arc: Themenliste, sonst hat der Arc kein Thema.
  if (!isList(derivation.arc?.themes, isText)) {
    issues.push(at('derivation.arc.themes fehlt oder ist leer'));
  }

  // Beziehung: Stufen von oben nach unten — die Schwellenrechnung braucht sie.
  if (!isList(derivation.relationship?.states, isText)) {
    issues.push(at('derivation.relationship.states fehlt oder ist leer'));
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
 * die einen Abnehmer ausmachen: der Kanalname als LITERAL (das Paket kann
 * `@shinon/narrative` nicht importieren), ein `ctx.on` auf diesen Namen, und ein
 * Element, das aus dem Composite entsteht. Ein Abnehmer, der den Kanalnamen
 * falsch schreibt, sieht aus wie "es gibt keine Narrative" — deshalb ist die
 * Buchstabenfolge hier keine Stilfrage, sondern der Befund. Und es sind ZWEI
 * Abnehmer: die Prüfung läuft über die Liste CONSUMERS, an den Abnehmer selbst
 * werden die beiden Quelltexte gereicht.
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
  if (!main.includes(`'${STATE_CHANNEL}'`)) {
    issues.push(`${file}: trägt den Kanalnamen '${STATE_CHANNEL}' nicht als Literal — kein Abnehmer für den Composite`);
  }
  if (!/ctx\.on\(\s*NARRATIVE_CHANNEL/.test(main)) {
    issues.push(`${file}: kein \`ctx.on(NARRATIVE_CHANNEL, …)\` — der Composite geht ins Leere`);
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
