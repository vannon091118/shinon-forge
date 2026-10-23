import z from '@deepseek-ai/schemastery';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { emptySelfModel, observeDecision, observeError, decaySelfModel, selfModelSummary, selfModelView, validateSelfModel } from './assets/self-model.js';
import { MEMORY_CONTRACT, acceptedCommitments, decideProposal, decayMemory, emptyMemory, memoryView, proposeFromMemory, rememberDecision, rememberEvent, renderCommitments, renderMemory, selectMemories, validateMemory } from './assets/memory-core.js';
// Das Lesen einer MENSCHLICHEN Nachricht und der explizite Beziehungs-Produzent
// liegen im importfreien Kern: dieselbe Rechnung im Host, im Test ohne
// node_modules und in der Probe gegen den echten Spine.
import { RELATION_CONTRACT, RELATION_ROUTE, RELATION_SERVICE, RELATION_SIGNAL, TRIGGERS, beobachten, createPromptText, createRelationService, detectUserMood, matchTrigger, renderTriggerContext, sectionApplies, textOf } from './assets/interaction-core.js';
// Der Live-Zustand der Persona geht als RUNTIME-CONTEXT in die Nachrichtenliste,
// nicht nur als System-Prompt-Abschnitt: so ersetzt der Stand pro Schritt den
// vorherigen (statt sich neben ihm zu stapeln) und traegt den Anti-Drift-Satz
// "This snapshot supersedes earlier runtime-context snapshots".
import { registerLiveContext, renderLiveContext } from './assets/live-context.js';
// Der Arbeitsablauf als EIN zusammenhaengender Baustein: die Reihenfolge der
// Schritte und der Umgang mit Zweifel, Blockern, Fehlern und Abbruch.
import { WORKFLOW, renderWorkflow } from './assets/workflow.js';
// Die Modell-Texte der Persona liegen als Daten in ./assets/prompts.json
// (Vertrag shinon.prompts/v1). Die Config-Vorgaben LESEN sie; ein leeres Feld
// bleibt ein leerer Abschnitt. Metadaten (Lage, Sektion, Modus, Budget) stehen
// in packages/prompter/assets/blocks.json.
import { promptText } from './assets/prompt-text.js';

const DEFAULTS = Object.freeze({
  identity: promptText('persona-identity'),
  epistemic: promptText('persona-epistemic'),
  changeClasses: promptText('persona-change-classes'),
  determinism: promptText('persona-determinism'),
  report: promptText('persona-report'),
  workaround: promptText('persona-workaround'),
  identityOverview: promptText('persona-identity-overview'),
});
// Der Projekt-Kontext (aus dem Sitzungs-Workspace) wird im importfreien Kern gelesen.
import { readProjectContext } from './assets/project-context.js';
// Die Host-Nähte (Narrative-Kanal, Entscheidungskanal, kanonischer I/O-Pfad)
// haben EINE Definition: `@shinon/seams`.
import {
  NARRATIVE_STATE_CHANNEL,
  NARRATIVE_STATE_CONTRACT,
  PROMPTER_DECISION_CHANNEL as PROMPTER_DECISION_CHANNEL_CORE,
  INDEX_STORE_SERVICE, INDEX_STORE_CONTRACT,
  fingerprintRoot,
  logEventRead,
} from '@shinon/seams/core';

/**
 * Die Naht Persona -> Core-UI: der Zustand der Persona als Global und live.
 *
 * Ein Client-Bundle kann kein Host-File importieren, also traegt jede Seite den
 * Namen als LITERAL — geprueft als Zwilling in `scripts/lib/repo.mjs`. Drift
 * waere hier still: ein falscher Name hiesse nur, dass die Leiste weiter ihren
 * Platzhalter zeigt, und das saehe aus wie „kein Zustand vorhanden“.
 */
export const UI_STATE_GLOBAL = '__shinonPersonaState';
export const UI_STATE_ROUTE = '/shinon/persona/state';
/** Die Pruef-Naht als HTTP-Flaeche: GET zeigt, POST entscheidet. */
export const REVIEW_ROUTE = '/shinon/persona/review';
/** Der Startstand fuer das Panel — der Host legt ihn in die Seite, wie den Zustand. */
export const REVIEW_GLOBAL = '__shinonPersonaReview';
/** Deckel fuer den Entscheidungs-Body: zwei Felder, nie ein Dokument. */
const REVIEW_BODY_LIMIT = 8192;
export const UI_STATE_CONTRACT = 'shinon.persona-ui/v1';

/**
 * Kanal des Veredlers — aus `@shinon/seams`, nicht als Literal.
 *
 * Bis 2026-10-20 stand hier ein Literal mit der Begruendung „`@shinon/prompter`
 * ist nicht importierbar": der Enhancer haette eine ganze Engine mitgebracht, nur
 * um einen String zu lesen. Der Naht-Kern ist die kleinste gemeinsame
 * Abhaengigkeit — und der Kanal hat damit eine Definition statt vier.
 */
export const PROMPTER_DECISION_CHANNEL = PROMPTER_DECISION_CHANNEL_CORE;

/** Die Naht des Webservers, ueber die Globals in die Seite kommen. */
export const INDEX_INJECT = 'webserver/index-inject';

/** Gemeinsamer Project Index Store; Persona nutzt nur ihren eigenen Namensraum. */
export { INDEX_STORE_SERVICE, INDEX_STORE_CONTRACT };

/** Der Namensraum des Selbstmodells: ein Projekt, ein Stand. */
export const SELF_MODEL_NAMESPACE = 'shinon.persona-self/v1';

/**
 * Das Langzeitgedächtnis: eigene Ablage, eigener Namensraum.
 *
 * Nicht derselbe Raum wie das Selbstmodell: das Modell zählt Ausgänge, das
 * Gedächtnis trägt Ereignisse und Belege. Ein gemeinsames Dokument würde beim
 * Schreiben das jeweils andere überschreiben.
 */
export const MEMORY_NAMESPACE = 'shinon.persona-memory/v1';
export const MEMORY_MEMO_ID = 'memory';

/** Die Naht für die Prüfung: ansehen und ausdrücklich annehmen — sonst nichts. */
export const REVIEW_SERVICE = 'shinon_persona_review';
export const REVIEW_CONTRACT = 'shinon.persona-review/v1';

/**
 * Die Id des Dokuments IN der Ablage.
 *
 * Die Ablage haelt Dokumente (memos), keine freien Objekte: `save` schreibt nur
 * records/memos/scorecard/notes, alles andere faellt still weg. Das Selbstmodell
 * reist deshalb als EIN Dokument unter dieser Id — geprueft wird es trotzdem
 * gegen seinen EIGENEN Vertrag.
 */
export const SELF_MODEL_MEMO_ID = 'self-model';

/**
 * Der Workspace, den die LAUFENDE Sitzung beansprucht — pro Turn, nicht pro Prozess.
 *
 * `SHINON_WORKSPACE_ROOT` gilt für den ganzen Boot; ein Host, der in Shinon startet,
 * bedient damit auch fremde Sitzungen. Der Instruktions-Loader liest stattdessen
 * `agent.session.header.cwd` (`dsh-agent-instructions/lib/index.js:912`). Derselbe
 * Wert entscheidet hier, im Kontext des Schritts (AsyncLocalStorage statt globalem
 * Schalter — zwei Sitzungen im selben Prozess überschreiben sich nicht).
 */
const sessionRoot = new AsyncLocalStorage();

/**
 * Der Workspace, für den die Persona spricht — AUSDRÜCKLICH benannt, nie geraten.
 *
 * Gemessen 2026-10-17: `process.cwd()` ist der HOST (bei `DSH_HOME=$PWD` also das
 * Shinon-Repo), nicht der Workspace der Session. Wer daraus den Projektscope
 * ableitet, injiziert Shinon-Persona in fremde Projekte. Deshalb: explizite Config
 * (`workspaceRoot`) oder `SHINON_WORKSPACE_ROOT`; fehlt beides, ist der Scope
 * UNKLAR und die Persona bleibt aus (fail-closed, nicht fail-open).
 *
 * WARUM DER ANDERE NAME: `@shinon/seams` hat die EINE Workspace-Auflösung
 * (`resolveWorkspaceRoot`) — die faellt auf `cwd` zurück, weil Prompter und
 * Project Index den Projektbaum BRAUCHEN. Hier ist der Rückfall genau der
 * Fehler (fremde Persona in fremden Projekten), also ist das eine andere Regel
 * mit anderem Ergebnis. Zwei Regeln tragen nicht denselben Namen: ein Gate-Schritt
 * (`hostMirrorIssues`) macht eine zweite `resolveWorkspaceRoot`-Definition rot.
 */
function declaredWorkspaceRoot(config) {
  const declared = typeof config.workspaceRoot === 'string' ? config.workspaceRoot.trim() : '';
  if (declared !== '') return isAbsolute(declared) ? declared : join(process.cwd(), declared);
  const fromEnv = (process.env.SHINON_WORKSPACE_ROOT ?? '').trim();
  if (fromEnv !== '') return isAbsolute(fromEnv) ? fromEnv : null;
  return null;
}

/**
 * @shinon/persona — Identity, State, Voice.
 *
 * Zwei Hälften, eine Grenze:
 *   Identity  statische Abschnitte im System-Prompt (Config-Werte).
 *   State     abgeleitet aus den emittierten Events des Spines: kein Raten, kein Modell.
 *   Voice     eine Stimme je Mood, aus dem Zustandsvertrag — Kontext, keine Aktion.
 *
 *   session/event ──▶ @shinon/events ──▶ shinon/event ──▶ Persona State ──▶ System Context ──▶ Modell
 *
 * Die Persona entscheidet nichts: sie liest Events, hält einen Zustand und
 * schreibt ihn als Prompt-Abschnitt. Sie ruft kein Modell, startet kein Tool,
 * schreibt keine Datei, mutiert keinen fremden State. Das Gate prüft diese
 * Grenze statisch (scripts/gate/plugins/persona.mjs).
 *
 * Der Zustandsvertrag liegt als Daten in ./assets/persona-state.json — ein
 * neuer Mood oder Übergang ist zuerst eine Datenänderung, kein Code-Umbau.
 *
 * WICHTIG: Die Persoenlichkeit ist global — jeder zugewiesene Workspace
 * bekommt sie (Haltung, Ton, Beziehung, Erinnerungen). Der PROJEKT-Kontext
 * (Projektdatei, projektspezifische Erinnerungen und Auflagen, Selbstmodell)
 * bleibt je Workspace und reist nie mit. Still bleibt die Persona nur ohne
 * jeden Bereich (fail-closed).
 */



/** Leerer Vertrag: die Persona läuft dann mit Baseline, aber ohne Voice-Texte. */
const EMPTY_CONTRACT = {
  contract: 'shinon.persona-state/unloaded',
  identity: 'Shinon',
  baseline: { stance: 'critical', uncertainty: 'explicit', mood: 'idle', capabilities: [], limitations: [] },
  transitions: {},
  voice: {},
  limits: { maxEvents: 25, maxLimitations: 8 },
};

/** Zustandsvertrag aus dem Paket laden. */
export function loadStateContract(relPath) {
  return JSON.parse(readFileSync(new URL(relPath, import.meta.url), 'utf8'));
}

/** Initialer Zustand: die Baseline aus dem Vertrag. Reine Funktion. */
export function initialState(contract) {
  const baseline = contract.baseline ?? {};
  return {
    identity: contract.identity ?? 'Shinon',
    stance: baseline.stance ?? 'critical',
    uncertainty: baseline.uncertainty ?? 'explicit',
    mood: baseline.mood ?? 'idle',
    capabilities: [...(baseline.capabilities ?? [])],
    limitations: [...(baseline.limitations ?? [])],
    relation: baseline.relation ?? contract.relation?.initial ?? 'known',
  };
}

/** Die Felder, die einen Persona-Zustand ausmachen — die Grundlage des Vergleichs. */
const STATE_FIELDS = ['identity', 'stance', 'uncertainty', 'mood', 'capabilities', 'limitations', 'relation'];

/**
 * Grenze fuer das Zaehl-Woerterbuch unbekannter Event-Typen. Ein Typ mit Pfad oder Parameter
 * im Namen darf den Speicher nicht ueber die Sitzungsdauer wachsen lassen; alles darueber
 * laeuft in EINEN benannten Ueberlauf-Eimer, damit die Zahl sichtbar bleibt statt zu verschwinden.
 */
const IGNORED_TYPE_LIMIT = 64;
const IGNORED_OVERFLOW_KEY = '<overflow>';

/**
 * Zwei Zustände feldweise vergleichen. Gleich heißt: jedes der sechs Felder ist
 * gleich, Listen elementweise und in der Reihenfolge.
 */
function sameState(left, right) {
  for (const field of STATE_FIELDS) {
    if (Array.isArray(left[field]) || Array.isArray(right[field])) {
      const a = Array.isArray(left[field]) ? left[field] : [];
      const b = Array.isArray(right[field]) ? right[field] : [];
      if (a.length !== b.length || a.some((value, index) => value !== b[index])) return false;
    } else if (left[field] !== right[field]) {
      return false;
    }
  }
  return true;
}

/**
 * Ein Event, ein Übergang. Deterministisch und rein — kein Modell, keine Zeit, kein Zufall.
 * Unbekannte Events ändern nichts (fail-closed: kein Raten).
 *
 * `changed` ist ein Messergebnis, keine Behauptung: der berechnete Zustand wird
 * feldweise gegen den vorigen geprüft. Ein Übergang, der nichts verschiebt (etwa
 * eine Limitation, die schon gesetzt war), meldet damit `false` — kein
 * History-Eintrag, kein neuer Prompt-Abschnitt für eine Nicht-Änderung.
 */
export function deriveState(contract, state, eventType, event) {
  const transition = contract.transitions?.[eventType];
  if (!transition) return { state, changed: false, reason: 'UNKNOWN_EVENT' };

  // relation.updated trägt die Stufe im Event (Nutzlastfeld relation) — kein
  // statischer Übergang. Unbenannt heißt: nichts ändern (fail-closed, kein Raten).
  // Nur lesend: die Persona setzt die Stufe aus dem Event, schreibt aber nie eine.
  let relation = state.relation ?? contract.baseline?.relation ?? contract.relation?.initial ?? 'known';
  if (eventType === 'relation.updated') {
    const level = event !== null && typeof event === 'object' ? event.relation : undefined;
    const levels = contract.relation?.levels ?? [];
    if (typeof level !== 'string' || !levels.includes(level)) {
      return { state, changed: false, reason: 'UNKNOWN_RELATION' };
    }
    relation = level;
  }

  const base = transition.reset ? initialState(contract) : state;
  if (transition.reset) relation = base.relation;
  const limitations = new Set(base.limitations ?? []);
  for (const item of transition.removeLimitations ?? []) limitations.delete(item);
  for (const item of transition.addLimitations ?? []) limitations.add(item);
  const maxLimitations = contract.limits?.maxLimitations ?? 8;

  const next = {
    identity: contract.identity ?? state.identity,
    stance: transition.stance ?? base.stance,
    uncertainty: transition.uncertainty ?? base.uncertainty,
    mood: transition.mood ?? base.mood,
    capabilities: [...(contract.baseline?.capabilities ?? state.capabilities)],
    limitations: [...limitations].slice(-maxLimitations),
    relation,
  };

  return { state: next, changed: !sameState(state, next), reason: eventType };
}

/**
 * Die Ton-Faehigkeit des Scorings (Zug 5) — optional, wie beim Veredler.
 *
 * Die Persona ist LESEND: sie holt die Haltung ueber dasselbe optionale `get`
 * und rendert daraus einen Abschnitt. Fehlt der Dienst, fehlt der Abschnitt —
 * geraten wird kein Ton. Die Namen sind mit `@shinon/scoring` gepinnt
 * (`scripts/gate/tests/context-wiring.test.mjs`).
 */
export const SCORING_SERVICE = 'shinon_scoring_state';
export const SCORING_SERVICE_CONTRACT = 'shinon.scoring-state/read-v1';

/**
 * Den Ton beim Scoring lesen — optional und mit geprueftem Vertrag.
 *
 * Dieselben vier Richtungen wie beim Veredler, aus demselben Grund: kein Dienst
 * ist der Normalfall (ein Profil ohne Scoring), ein Fremder unter diesem Namen
 * ist ein Fehler und wird einmal gemeldet, `null` heisst „es gibt nichts zu
 * sagen", und alles andere ist der Ton.
 */
export function readTone(ctx, warn = () => {}) {
  let service;
  try {
    service = typeof ctx?.get === 'function' ? ctx.get(SCORING_SERVICE) : undefined;
  } catch {
    service = undefined;
  }
  if (service === undefined || service === null) return null;
  if (service.contract !== SCORING_SERVICE_CONTRACT || typeof service.read !== 'function') {
    warn(`${SCORING_SERVICE} verletzt den Vertrag ${SCORING_SERVICE_CONTRACT}`);
    return null;
  }
  try {
    const read = service.read();
    return read === undefined ? null : read;
  } catch (error) {
    warn(`Ton nicht lesbar (${error?.message ?? error})`);
    return null;
  }
}

/**
 * Die Naht zur Narrative Engine (Zug 6) — beide Namen aus `@shinon/seams`.
 *
 * Warum nicht mehr als Literal: bis 2026-10-20 standen sie hier als Spiegel von
 * `@shinon/narrative`, gehalten von `SOURCE_TWINS` (kind `literals`). Der Besitzer
 * der Naht bleibt die Narrative Engine — sie exportiert `STATE_CHANNEL` und
 * `STATE_CONTRACT` unter denselben Namen weiter; die DEFINITION ist jetzt der
 * Naht-Kern, den beide Hälften importieren.
 */
export const NARRATIVE_CHANNEL = NARRATIVE_STATE_CHANNEL;
export const NARRATIVE_CONTRACT = NARRATIVE_STATE_CONTRACT;

/**
 * Zustandsmaschine. Beobachtet Event-Typen, hält den Zustand, meldet Änderungen.
 * Kein Speicher auf Platte: der DSH-Session-Log ist der Audit, nicht die Persona.
 */
export function createPersonaState(contract, options = {}) {
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
  const maxEvents = contract.limits?.maxEvents ?? 25;
  let state = initialState(contract);
  const history = [];
  const stats = { events: 0, changes: 0, ignored: 0, ignoredTypes: {} };

  function snapshot() {
    return {
      identity: state.identity,
      stance: state.stance,
      uncertainty: state.uncertainty,
      mood: state.mood,
      capabilities: [...state.capabilities],
      limitations: [...state.limitations],
      relation: state.relation,
    };
  }

  function observe(eventType, event) {
    if (typeof eventType !== 'string' || eventType.trim() === '') {
      stats.ignored += 1;
      return null;
    }
    stats.events += 1;
    const result = deriveState(contract, state, eventType, event);
    if (!result.changed) {
      stats.ignored += 1;
      if (stats.ignoredTypes[eventType] !== undefined || Object.keys(stats.ignoredTypes).length < IGNORED_TYPE_LIMIT) {
        stats.ignoredTypes[eventType] = (stats.ignoredTypes[eventType] ?? 0) + 1;
      } else {
        stats.ignoredTypes[IGNORED_OVERFLOW_KEY] = (stats.ignoredTypes[IGNORED_OVERFLOW_KEY] ?? 0) + 1;
      }
      return null;
    }
    state = result.state;
    stats.changes += 1;
    history.push({ type: eventType, mood: state.mood, limitations: [...state.limitations] });
    if (history.length > maxEvents) history.shift();
    onChange(snapshot());
    return { state: snapshot() };
  }

  return { observe, snapshot, history: () => [...history], stats };
}

/** Event-Envelope → Event-Typ. Nur Lesen, nichts wird weitergereicht. */
export function eventTypeOf(payload) {
  if (typeof payload === 'string') return payload;
  if (payload !== null && typeof payload === 'object' && typeof payload.event_type === 'string') return payload.event_type;
  return null;
}

// Die Lese-Regeln (Trigger, Stimmung, Text aus Blocklisten) und ihre
// oeffentlichen Namen kommen aus `assets/interaction-core.js`. Sie bleiben hier
// als Paket-Aussenflaeche sichtbar — Abnehmer und Tests lesen sie unveraendert
// ueber `@shinon/persona`.
export { RELATION_CONTRACT, RELATION_ROUTE, RELATION_SERVICE, TRIGGERS, matchTrigger, detectUserMood, textOf, renderLiveContext };

/**
 * Die Materialübersicht. Sie beschreibt, WAS da ist — und schreibt
 * ausdruecklich NICHT vor, was geantwortet wird. Die Antwortform ist narrativ:
 * eine Person, die angesprochen wird, kein Datenblatt, das abgefragt wird.
 */

export const Config = z.object({
  /** Identität + Ton. Leer = Abschnitt entfällt. */
  identity: z.string().default(DEFAULTS.identity),
  /** Epistemische Haltung (Evidenz, Widerspruch, Unsicherheit). */
  epistemic: z.string().default(DEFAULTS.epistemic),
  /** Änderungsklassen + Golden-Test-Disziplin. */
  changeClasses: z.string().default(DEFAULTS.changeClasses),
  /** Determinismus-Regeln für Seed-/RNG-Systeme. */
  determinism: z.string().default(DEFAULTS.determinism),
  /** Reportformat. */
  report: z.string().default(DEFAULTS.report),
  /** Blockiert heißt nicht Endstation — Workaround-Haltung. */
  workaround: z.string().default(DEFAULTS.workaround),
  /** Der Arbeitsablauf — LAGE, PLAN, HANDELN, PRUEFEN, BERICHTEN. */
  workflow: z.string().default(WORKFLOW),
  /** Materialübersicht fuer Selbstauskünfte. Nie die Antwort selbst. */
  identityOverview: z.string().default(DEFAULTS.identityOverview),
  /** Triggerwoerter, die eine Selbstauskunft auslösen. */
  identityTriggers: z.array(z.string()).default([...TRIGGERS]),
  /** Selbstauskunft-Übersicht dauerhaft in den Prompt legen. */
  alwaysKnowIdentity: z.boolean().default(true),
  /** Zustandsvertrag (Baseline, Übergänge, Stimmen). */
  statePath: z.string().default('./assets/persona-state.json'),
  /** Kanal, auf dem der Event-Spine seine Envelopes emittiert. */
  eventsChannel: z.string().default('shinon/event'),
  /**
   * Pfad zur Projekt-Kontextdatei (relativ zum ARBEITSVERZEICHNIS).
   *
   * Diese Datei enthält projekt-spezifische Kontextinformationen aus dem
   * Workspace der laufenden Sitzung. Sie wird als separater Abschnitt
   * injiziert — Workspace-Daten, keine Anweisung. Leer = nicht laden.
   */
  projectContextPath: z.string().default(''),
  /**
   * Der Workspace, in dessen Namen die Persona spricht (absolut oder relativ zu
   * `process.cwd()`). Leer = aus `SHINON_WORKSPACE_ROOT`, sonst unklar = keine Persona.
   */
  workspaceRoot: z.string().default(''),
  /**
   * Der Namensraum des Selbstmodells in der dauerhaften Ablage des Project
   * Index (`shinon_index_store`). Leer = kein Gedaechtnis ueber Neustarts: das
   * Modell lebt dann nur im Prozess, und die Ablage bekommt keine Zeile.
   */
  selfModelNamespace: z.string().default(SELF_MODEL_NAMESPACE),
  /**
   * Der Namensraum des Langzeitgedaechtnisses (Ereignisse, Belege, Vorschlaege).
   * Leer = kein Gedaechtnis: die Persona bleibt dann bei Identitaet und Zustand.
   */
  memoryNamespace: z.string().default(MEMORY_NAMESPACE),
  /**
   * Wo die IDENTITAET spricht: `workspace` (Vorgabe, jede zugewiesene
   * Sitzung und jeder deklarierte Boot) oder `global` (zusaetzlich auch
   * ohne jede Zuweisung — die Entscheidung des Deployments). Projekt-Kontext
   * und projektspezifische Daten bleiben in beiden Faellen am Sitzungs-
   * Workspace und werden nie global.
   */
  identityScope: z.union([z.const('workspace'), z.const('global')]).default('workspace'),
});

export function apply(ctx, config) {
  // Projektscope: die Persoenlichkeit ist global, der Projekt-Kontext bleibt
  // je Workspace.
  // GEMESSEN 2026-10-18 (Root Cause): die Profil-Config setzt nur
  // `projectContextPath`, keinen `workspaceRoot`. Der Mount brach deshalb VOR
  // jeder Registrierung ab — Persona, Ton und Selbstbezug fehlten in JEDEM
  // Prompt, waehrend der Prozess weiterlief. Der Scope ist aber eine Eigenschaft
  // der SITZUNG, nicht des Boots: `agent/pre-step` legt `header.cwd` in
  // `sessionRoot` ab, und `speaksForSession` entscheidet je Abschnitt. Der Mount
  // registriert also immer; ein fremder Workspace bekommt weiterhin leere
  // Abschnitte (fail-closed bleibt fail-closed).
  const declaredRoot = declaredWorkspaceRoot(config);
  // Ein BEKANNT fremder Scope bleibt ein harter Aus: dort wird weder gelesen noch
  // gelauscht (kein Abschnitt, kein Handler). Nur der UNBEKANNTE Scope wartet auf
  // die Sitzung — sonst wäre der Boot wieder die Autorität, die er nicht ist.
  // `global` ist eine ENTSCHEIDUNG des Deployments, nicht die Vorgabe: die
  // Identitaet spricht dann in jeder Sitzung, projektspezifische Daten nicht.
  const globalIdentity = config.identityScope === 'global';
  if (declaredRoot === null) {
    console.log('[shinon-persona] Kein workspaceRoot deklariert — der Sitzungs-cwd entscheidet je Schritt');
  }

  let contract = EMPTY_CONTRACT;
  try {
    contract = loadStateContract(config.statePath);
  } catch (error) {
    console.warn(`[shinon-persona] Zustandsvertrag nicht lesbar (${config.statePath}): ${error.message}`);
  }

  /**
   * Spricht die Persona für die Sitzung dieses Schritts? Ohne Sitzungsangabe
   * (Tests, direkte Assembly) gilt die Freigabe des Boots; mit Sitzung entscheidet
   * deren CWD — liegt er außerhalb der Wurzel, bleibt jeder Abschnitt leer.
   */
  // GEMESSEN 2026-10-18 in `@deepseek-ai/dsh-agent-loop/lib/index.js:907`:
  // `systemPrompt.assemble(...)` läuft VOR dem Wasserfall `agent/pre-step`. Der
  // AsyncLocalStorage aus dem Pre-Step kann die Assembly deshalb NIE erreichen —
  // der Abschnittstext wird schon vorher ausgewertet. Die Assembly übergibt ihr
  // `context` aber an jede Textfunktion (`section.text(context)`, Quelle:
  // dsh-system-prompt `assemble`), und darin steht der Agent samt Sitzung. Das
  // ist der belastbare Weg: der cwd kommt aus der Assembly, nicht aus der Zeit.
  const rootOfAssembly = (assemblyCtx) => {
    const agent = assemblyCtx?.agent;
    const fromAgent = agent?.session?.header?.cwd ?? agent?.session?.cwd;
    if (typeof fromAgent === 'string' && fromAgent !== '') return fromAgent;
    const fromStore = sessionRoot.getStore()?.root;
    if (typeof fromStore === 'string' && fromStore !== '') return fromStore;
    return null;
  };
  let spokenFor = null;
  /** Spricht die Persona fuer diesen Root? Jeder zugewiesene Root ja — die
   * Persoenlichkeit ist global, nur der Projekt-Kontext bleibt je Workspace. */
  const speaksForRoot = (root) => typeof root === 'string' && root !== '';
  /** Projekt-Kontext kommt aus dem Sitzungs-Workspace — dessen eigene Datei, nie global. */
  const projectsForSession = (assemblyCtx) => {
    const root = rootOfAssembly(assemblyCtx) ?? declaredRoot ?? '';
    return typeof root === 'string' && root !== '';
  };
  const speaksForSession = (assemblyCtx) => {
    const root = rootOfAssembly(assemblyCtx);
    if (root !== null) {
      if (spokenFor !== root) {
        spokenFor = root;
        console.log(`[shinon-persona] Sitzung ${root} — Persona aktiv`);
      }
      return true;
    }
    // Ohne Sitzungsangabe (Tests, direkte Assembly) gilt die Deklaration —
    // und im globalen Deployment die Entscheidung des Deployments.
    if (globalIdentity) return true;
    return declaredRoot !== null;
  };
  // Gate: ein fachlicher Abschnitt steht nur, wenn die Nachricht seine Marken nennt (fail-open).
  const gated = (text, name = null) => (assemblyCtx) => (
    speaksForSession(assemblyCtx) && (name === null || sectionApplies(contract, name, promptText.valueFor(assemblyCtx), lastDecision?.classification ?? null)) ? text : ''
  );

  // Ein fremder Dienst unter dem Ton-Namen wird EINMAL gemeldet: sonst flutete
  // jede Zustandsaenderung dieselbe Warnung.
  let toneWarned = false;
  const warnedTone = (message) => {
    if (toneWarned) return;
    toneWarned = true;
    console.error(`[shinon-persona] ${message} — kein Ton im Zustand`);
  };
  // Zuletzt erkanntes Triggerwort. Bleibt stehen, damit die Form nicht mitten
  // im Gespräch wieder in die Abfrage-Haltung zurückkippt.
  let lastTrigger = null;
  let renderTrigger = () => {};
  // Die zuletzt ERKANNTE User-Stimmung — sie steht im Live-Block, nicht in einem Abschnitt.
  let lastUserMood = null;
  // Der Text der letzten Menschen-Nachricht: Gedaechtnis und Gate lesen denselben Halter.
  const promptText = createPromptText();
  const persona = createPersonaState(contract);

  // ── Das Selbstmodell: Laufzeitspuren -> Prompt und UI ─────────────────────
  // Ein Modell JE ROOT: die Ablage gehoert dem Projekt, nicht dem Prozess. Die
  // Belege kommen aus den echten Entscheidungen des Veredlers und den Fehlern
  // des Laufs; geschrieben wird nach jeder Aenderung, gelesen einmal je Root.
  const selfModels = new Map();
  const uiClients = new Set();
  let lastDecision = null;

  /** Der Zustandsdatensatz der UI — Zahlen und Namen, nie ein Prompt-Text. */
  const uiSnapshot = () => {
    const root = sessionRoot.getStore()?.root || declaredRoot;
    const entry = typeof root === 'string' && root !== '' ? selfModels.get(root) ?? null : null;
    const state = persona.snapshot();
    const tone = readTone(ctx, warnedTone);
    return {
      contract: UI_STATE_CONTRACT,
      updatedAt: Date.now(),
      workspace: typeof root === 'string' && root !== '' ? root : null,
      state: {
        identity: state.identity,
        stance: state.stance,
        uncertainty: state.uncertainty,
        mood: state.mood,
        relation: state.relation,
        capabilities: [...state.capabilities],
        limitations: [...state.limitations],
      },
      userMood: lastUserMood,
      // Fuer das Panel: Stufen aus dem Vertrag (dieselbe Liste wie der Produzent), Stand aus dem Zustand.
      relation: { levels: [...(contract.relation?.levels ?? [])], current: state.relation },
      // Der KLANG kommt aus dem Vertrag: „Ruhig und bereit" ist das Panel-Etikett
      // zu „idle"; der Prompt traegt den Arbeitsmodus aus MOOD_MODUS, keinen Namen.
      voice: contract.voice?.[state.mood] ?? null,
      tone: tone === null ? null : { stance: tone.stance ?? null, ready: tone.ready === true },
      self: entry === null ? null : selfModelView(entry.model),
      memory: memoryView(ensureMemory(null)),
      proposals: (ensureMemory(null).proposals ?? []).filter((proposal) => proposal.status === 'proposed').length,
      intent: lastDecision,
    };
  };

  /*
   * Die offenen Panels bekommen jede Aenderung sofort — sonst nur beim Laden.
   * Der Pruef-Stand reist als EIGENES Ereignis (`review`): das Zustands-Panel
   * liest weiter das unbenannte `data`, das Pruef-Panel haengt an `review` und
   * braucht keinen Abruf-Timer. Beide Ereignisse tragen JSON, nie Prompt-Text.
   */
  const reviewEvent = () => `event: review\ndata: ${JSON.stringify(reviewService.review())}\n\n`;
  const publishUi = () => {
    const payload = `data: ${JSON.stringify(uiSnapshot())}\n\n`;
    const review = reviewEvent();
    for (const response of uiClients) {
      try {
        response.write(payload);
        response.write(review);
      } catch {
        uiClients.delete(response);
      }
    }
  };

  let storeWarned = false;

  /** Die Ablage holen: EIN Dienst, EIN Vertrag — sonst kein Gedaechtnis. */
  const warnStoreOnce = (reason) => {
    if (storeWarned) return;
    storeWarned = true;
    console.warn(`[shinon-persona] Selbstmodell nur im Speicher: ${reason}`);
  };

  const resolveStore = () => {
    let found = null;
    try {
      found = typeof ctx?.get === 'function' ? ctx.get(INDEX_STORE_SERVICE) ?? null : null;
    } catch (error) {
      warnStoreOnce(`Ablage nicht abfragbar (${error?.message ?? error})`);
      return null;
    }
    if (found === null) return null;
    if (
      found.contract !== INDEX_STORE_CONTRACT ||
      typeof found.load !== 'function' ||
      typeof found.save !== 'function'
    ) {
      warnStoreOnce(`fremder Dienst unter ${INDEX_STORE_SERVICE} (Vertrag ${String(found?.contract)})`);
      return null;
    }
    return found;
  };

  // Ein FEHLENDES Feld heisst "Vorgabe", ein LEERES heisst "aus". Der
  // Unterschied zaehlt: sonst schaltete ein Profil ohne den Schluessel das
  // Gedaechtnis still ab, und niemand saehe den Grund.
  const selfModelNamespace = (root = declaredRoot) => { const base = typeof config.selfModelNamespace === 'string' ? config.selfModelNamespace : SELF_MODEL_NAMESPACE;
    return base === '' || typeof root !== 'string' || root === '' ? base : `${base}/${fingerprintRoot(root).rootId}`; };

  /** Den Stand EINMAL schreiben — dieselbe Ablage wie das Scoring, eigener Raum. */
  const persistSelfModel = (entry) => {
    if (entry.namespace === '') return;
    const store = resolveStore();
    if (store === null) {
      warnStoreOnce('kein Index-Dienst');
      return;
    }
    let answer;
    try {
      answer = store.save(entry.namespace, {
        memos: [{ id: SELF_MODEL_MEMO_ID, model: entry.model }],
      });
    } catch (error) {
      warnStoreOnce(`nicht beschreibbar (${error?.message ?? error})`);
      return;
    }
    if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
      warnStoreOnce(`nicht beschreibbar (${answer?.error ?? 'unbekannte Antwort'})`);
    }
  };

  /** Das Modell eines Roots laden — einmal je Root, danach aus dem Speicher. */
  const selfModelOf = (root) => {
    const known = selfModels.get(root);
    if (known !== undefined) return known;
    const namespace = selfModelNamespace(root);
    let model = emptySelfModel(new Date().toISOString());
    if (namespace !== '') {
      const store = resolveStore();
      if (store === null) warnStoreOnce('kein Index-Dienst');
      else {
        let answer;
        try {
          answer = store.load(namespace);
        } catch (error) {
          warnStoreOnce(`nicht lesbar (${error?.message ?? error})`);
        }
        const ok = answer !== null && typeof answer === 'object' && answer.ok === true;
        const memos = ok && Array.isArray(answer.state?.memos) ? answer.state.memos : [];
        const raw = memos.find((memo) => memo?.id === SELF_MODEL_MEMO_ID)?.model ?? null;
        if (raw !== null) {
          const checked = validateSelfModel(raw);
          if (checked.foreign) console.warn(`[shinon-persona] Selbstmodell fremd (${namespace}) — neuer Stand`);
          else {
            model = decaySelfModel(checked.model);
            if (checked.dropped > 0) console.warn(`[shinon-persona] ${checked.dropped} unlesbare Selbstmodell-Eintraege uebergangen`);
          }
        } else if (!ok && answer !== null && answer !== undefined) {
          warnStoreOnce(`nicht lesbar (${answer?.error ?? 'unbekannte Antwort'})`);
        }
      }
    }
    const entry = { model, namespace };
    selfModels.set(root, entry);
    const view = selfModelView(model);
    if (view !== null && view.runs > 0) {
      console.log(`[shinon-persona] Selbstmodell geladen: ${view.runs} Laeufe, ${view.limits.length} Grenzen, ${view.questions.length} offene Fragen`);
    }
    return entry;
  };

  /** EINEN Beleg verbuchen — die einzige Stelle, die das Modell veraendert. */
  const observeInto = (kind, payload) => {
    const root = sessionRoot.getStore()?.root || declaredRoot;
    if (!speaksForRoot(root)) return;
    const entry = selfModelOf(root);
    const now = new Date().toISOString();
    entry.model = kind === 'decision'
      ? observeDecision(entry.model, payload, now)
      : observeError(entry.model, payload, now);
    persistSelfModel(entry);
    publishUi();
  };

  /** Der Abschnittstext: belegt, begrenzt — leer, solange nichts belegt ist. */
  const selfModelText = (assemblyCtx) => {
    if (!speaksForSession(assemblyCtx)) return '';
    const root = rootOfAssembly(assemblyCtx) || declaredRoot;
    if (typeof root !== 'string' || root === '') return '';
    if (selfModelNamespace(root) === '') return '';
    return selfModelSummary(selfModelOf(root).model) ?? '';
  };

  // ── Das Langzeitgedächtnis ────────────────────────────────────────────────
  // Ereignisse und Entscheidungen werden zu belegten Erinnerungen. Die Ablage
  // ist dieselbe wie beim Selbstmodell, der Namensraum ein eigener: ein
  // gemeinsames Dokument wuerde beim Schreiben das jeweils andere ersetzen.
  const memoryNamespace = () => (
    typeof config.memoryNamespace === 'string' ? config.memoryNamespace : MEMORY_NAMESPACE
  );
  let memoryDoc = null;
  // Die Sitzung des zuletzt gesehenen Ereignisses — das Panel kennt keine Id.
  let lastSessionId = '';
  let memoryWarned = false;
  const warnMemoryOnce = (reason) => {
    if (memoryWarned) return;
    memoryWarned = true;
    console.warn(`[shinon-persona] Gedaechtnis nur im Speicher: ${reason}`);
  };

  /** Das Gedaechtnis EINMAL laden — danach lebt es im Prozess, bis der Host endet. */
  const ensureMemory = (now = null) => {
    if (memoryDoc !== null) return memoryDoc;
    memoryDoc = emptyMemory(now);
    if (memoryNamespace() === '') return memoryDoc;
    const store = resolveStore();
    if (store === null) { warnMemoryOnce('kein Index-Dienst'); return memoryDoc; }
    let answer;
    try {
      answer = store.load(memoryNamespace());
    } catch (error) {
      warnMemoryOnce(`nicht lesbar (${error?.message ?? error})`);
      return memoryDoc;
    }
    const ok = answer !== null && typeof answer === 'object' && answer.ok === true;
    const memos = ok && Array.isArray(answer.state?.memos) ? answer.state.memos : [];
    const raw = memos.find((memo) => memo?.id === MEMORY_MEMO_ID)?.memory ?? null;
    if (raw !== null) {
      const checked = validateMemory(raw);
      if (checked.foreign) console.warn(`[shinon-persona] Gedaechtnis fremd (${memoryNamespace()}) — neuer Stand`);
      else {
        memoryDoc = decayMemory(checked.memory).memory;
        if (checked.dropped > 0) console.warn(`[shinon-persona] ${checked.dropped} unlesbare Gedaechtnis-Eintraege uebergangen`);
        const view = memoryView(memoryDoc);
        if (view !== null && view.entries > 0) {
          console.log(`[shinon-persona] Gedaechtnis geladen: ${view.entries} Erinnerungen, ${view.limits} Grenzen, ${view.proposals} offene Vorschlaege`);
        }
      }
    } else if (!ok && answer !== null && answer !== undefined) {
      warnMemoryOnce(`nicht lesbar (${answer?.error ?? 'unbekannte Antwort'})`);
    }
    return memoryDoc;
  };

  const persistMemoryDoc = () => {
    if (memoryNamespace() === '' || memoryDoc === null) return;
    const store = resolveStore();
    if (store === null) { warnMemoryOnce('kein Index-Dienst'); return; }
    let answer;
    try {
      answer = store.save(memoryNamespace(), { memos: [{ id: MEMORY_MEMO_ID, memory: memoryDoc }] });
    } catch (error) {
      warnMemoryOnce(`nicht beschreibbar (${error?.message ?? error})`);
      return;
    }
    if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
      warnMemoryOnce(`nicht beschreibbar (${answer?.error ?? 'unbekannte Antwort'})`);
    }
  };

  /** EIN Ereignis oder EINE Entscheidung — die einzige Stelle, die Erinnerungen schreibt. */
  const rememberInto = (kind, record) => {
    const root = sessionRoot.getStore()?.root || declaredRoot;
    if (!speaksForRoot(root) || memoryNamespace() === '') return;
    const now = new Date().toISOString();
    const scope = typeof root === 'string' && root !== '' ? root : 'global';
    const doc = ensureMemory(now);
    const result = kind === 'decision'
      ? rememberDecision(doc, record, { scope, now })
      : rememberEvent(doc, record, { scope, now });
    if (!result.changed) return;
    // Alterung und Vorschlag gehoeren in DENSELBEN Schreibvorgang: sonst laege
    // ein Beleg ohne Alterung in der Ablage und ein Vorschlag ohne Beleg.
    const aged = decayMemory(result.memory);
    const proposed = proposeFromMemory(aged.memory, { now });
    memoryDoc = { ...proposed.memory, lastSeen: now };
    persistMemoryDoc();
    publishUi();
  };

  const memoryText = (assemblyCtx) => {
    if (!speaksForSession(assemblyCtx) || memoryNamespace() === '') return '';
    const root = rootOfAssembly(assemblyCtx) || declaredRoot;
    const doc = ensureMemory(null);
    const entries = selectMemories(doc, { scope: typeof root === 'string' ? root : 'global', prompt: promptText.value() });
    return renderMemory(doc, { entries }) ?? '';
  };

  const commitmentsText = (assemblyCtx) => {
    if (!speaksForSession(assemblyCtx) || memoryNamespace() === '') return '';
    const root = rootOfAssembly(assemblyCtx) || declaredRoot;
    const scope = typeof root === 'string' && root !== '' ? root : 'global';
    return renderCommitments(ensureMemory(null), scope) ?? '';
  };

  // TODO: [DSH-Refactor] - Die Registrierung steckt in vier verschachtelten Closures (inject →
  // effect → renderPrompt → renderTrigger) mit handgefuehrtem Disposer-Stack; nicht ablesbar
  // ist, welcher Disposer zu welchem Abschnitt gehoert. Ziel: eine Funktion mit EINER
  // Aufraeumliste. (Der Absturzpfad selbst ist geschlossen: der Dienst wird vor dem ersten
  // Aufruf geprueft — siehe unten.)
  ctx.inject(['systemPrompt'], (child) => {
    const sp = child.systemPrompt;
    // Fail-loud statt Throw im inject-Callback: ein fremder Dienst ohne die beiden Methoden
    // wuerde hier sonst werfen, und der Fehler faellt INNERHALB des Callbacks an, nicht beim
    // Abschnitt. Kein Abschnitt ist besser als ein halb registrierter Prompt.
    if (typeof sp?.getSectionOrder !== 'function' || typeof sp?.section !== 'function') {
      console.error('[shinon-persona] systemPrompt-Dienst ohne getSectionOrder/section — Abschnitte NICHT registriert');
      return;
    }
    const atPrefix = sp.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX');
    const atSuffix = sp.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX');

    // TODO: [DSH-Refactor] - Die Anker sind Zahlenrauschen (Literale neben
    // atPrefix/atSuffix); `sections` ist die Datenliste, die Anker brauchen Namen.
    const sections = [
      ['shinon:identity', atPrefix, config.identity],
      ['shinon:epistemic', atPrefix + 1, config.epistemic],
      ['shinon:change-classes', 1000, gated(config.changeClasses, 'changeClasses')],
      ['shinon:determinism', 1100, gated(config.determinism, 'determinism')],
      ['shinon:workaround', 1300, config.workaround],
      ['shinon:report', atSuffix - 1, config.report],
    ];
    if (config.alwaysKnowIdentity) sections.push(['shinon:identity-overview', atPrefix + 3, config.identityOverview]);
    // Der Arbeitsablauf beschreibt, WIE gearbeitet wird — darum steht er in JEDEM Modus.
    sections.push(['shinon:workflow', atPrefix + 5, renderWorkflow(config.workflow)]);
    // Das Selbstmodell steht HINTER der Identitaet: gelernte Selbstkenntnis.
    if (selfModelNamespace() !== '') sections.push(['shinon:self-model', atSuffix - 6, selfModelText]);
    // Das Gedaechtnis steht VOR dem Selbstmodell: erst was ich erlebt habe, dann
    // was ich daraus belegt weiss. Beide fallen weg, wenn es nichts zu sagen gibt.
    if (memoryNamespace() !== '') {
      sections.push(['shinon:memory', atSuffix - 8, memoryText]);
      sections.push(['shinon:commitments', atSuffix - 7, commitmentsText]);
    }

    // Projekt-Kontext (Zug 9): projektspezifische Daten aus dem Sitzungs-
    // Workspace. Das Lesen mit Cache steht im Kern.
    const contextPath = typeof config.projectContextPath === 'string' ? config.projectContextPath : '';
    if (contextPath !== '') {
      const cache = new Map();
      sections.push(['shinon:project-context', atPrefix + 10, (assemblyCtx) => {
        if (!projectsForSession(assemblyCtx)) return '';
        return readProjectContext({
          contextPath,
          root: () => rootOfAssembly(assemblyCtx) || declaredRoot,
          declaredRoot,
          cache,
          warn: (message) => console.warn(`[shinon-persona] ${message}`),
          log: (message) => console.log(`[shinon-persona] ${message}`),
        });
      }]);
    }

    child.effect(() => {
      const disposers = [];
      for (const [name, order, text] of sections) {
        // Eine Funktion wird erst bei der Assembly ausgewertet und bringt ihren
        // Scope selbst mit; ein String wird durch `gated` geschuetzt.
        if (typeof text === 'function') {
          disposers.push(sp.section({ name, order, text }));
          continue;
        }
        if (typeof text !== 'string' || text.trim() === '') continue;
        disposers.push(sp.section({ name, order, text: gated(text) }));
      }
      let triggerDisposer = null;
      renderTrigger = () => {
        if (typeof triggerDisposer === 'function') triggerDisposer();
        triggerDisposer = lastTrigger === null
          ? null
          : sp.section({ name: 'shinon:identity-trigger', order: atPrefix + 4, text: gated(renderTriggerContext(lastTrigger)) });
      };
      renderTrigger();

      // Der EINZIGE dynamische Zustand: eine Runtime-Context-Nachricht, die pro Schritt
      // den vorherigen Stand ERSETZT (Anti-Drift-Satz des DSH) — Stimmung, Ton, User-Lage.
      disposers.push(registerLiveContext(sp, {
        contract,
        state: () => persona.snapshot(),
        tone: () => readTone(ctx, warnedTone),
        userMood: () => lastUserMood,
        spricht: (assemblyCtx) => speaksForSession(assemblyCtx),
      }));

      disposers.push(() => {
        if (typeof triggerDisposer === 'function') triggerDisposer();
      });
      return () => {
        for (const dispose of disposers) dispose();
      };
    });

    console.log(
      `[shinon-persona] ${sections.length} Prompt-Abschnitte registriert; der dynamische Zustand steht einmal im Live-Block`,
    );
  });

  // Beobachtung: die Persona antwortet nie auf ein Event, sie aktualisiert
  // ausschliesslich ihren eigenen Kontext.
  const handler = (envelope, payload) => {
    // Das Lesen des Ereignisses ist Rechnung und liegt im Kern.
    const gelesen = beobachten(envelope, payload, {
      triggers: config.identityTriggers,
      letzterTrigger: lastTrigger,
      letzteStimmung: lastUserMood,
    });
    if (gelesen === null) return;
    if (gelesen.sessionId !== null) lastSessionId = gelesen.sessionId;
    // Der LESEZWEIG laeuft ueber den kanonischen I/O-Pfad (eine Zeile je Kind, trace_id korreliert).
    logEventRead({
      quelle: config.eventsChannel,
      ziel: `persona:${gelesen.eventType}`,
      umfang: gelesen.eventPayload === null || gelesen.eventPayload === undefined ? 0 : 1,
      trace_id: gelesen.traceId,
    });
    if (gelesen.eventType === 'message.received') {
      promptText.remember(gelesen.sessionId, gelesen.text);
      lastDecision = null; // neue Nachricht, neuer Turn — die alte Klasse oeffnet nichts
    }
    // Jedes relevante Ereignis geht in das Langzeitgedaechtnis.
    rememberInto('event', { type: gelesen.eventType, payload: gelesen.eventPayload });
    persona.observe(gelesen.eventType, gelesen.eventPayload);
    if (gelesen.triggerGewechselt) {
      lastTrigger = gelesen.trigger;
      renderTrigger();
      console.log(`[shinon-persona] Anrede erkannt (${gelesen.trigger}) — narrative Selbstauskunft aktiv`);
    }
    if (gelesen.stimmungGewechselt) {
      lastUserMood = gelesen.stimmung;
      if (gelesen.stimmung !== null) console.log(`[shinon-persona] User-Lage erkannt (${gelesen.stimmung})`);
    }
  };
  const disposer = typeof ctx?.on === 'function' ? ctx.on(config.eventsChannel, handler) : () => {};

  // ── Die Belege: echte Laufzeitspuren, nicht Selbsteinschaetzung ───────────
  // Der Veredler meldet JEDE Entscheidung (Ausgang, Gruende, offene Fragen, die
  // Klasse des Auftrags); der Loop meldet jeden Fehler. Beides wird gezaehlt,
  // beides kann zu einer belegten Grenze bzw. offenen Frage werden — und beides
  // faellt wieder weg, wenn es nicht mehr auftritt.
  const decisionDisposer = typeof ctx?.on === 'function'
    ? ctx.on(PROMPTER_DECISION_CHANNEL, (record) => {
        if (record === null || typeof record !== 'object') return;
        // `UNDEFINED` ist die Aussage „keine Klasse", kein Klassenname: in der
        // UI und im Selbstmodell darf sie nicht wie ein Auftrag aussehen.
        const classification = typeof record.intentClassification === 'string' ? record.intentClassification : null;
        lastDecision = {
          outcome: typeof record.outcome === 'string' ? record.outcome : null,
          classification: classification === 'UNDEFINED' ? null : classification,
          pattern: typeof record.intentMatch === 'string' ? record.intentMatch : null,
          semantic: typeof record.intentSemantic === 'number' ? record.intentSemantic : 0,
          reasons: Array.isArray(record.reasons) ? record.reasons.slice(0, 4) : [],
          memory: record.intentMemory ?? null,
        };
        observeInto('decision', record);
        rememberInto('decision', record);
      })
    : () => {};
  const errorDisposer = typeof ctx?.on === 'function'
    ? ctx.on('agent/error', (payload) => observeInto('error', payload?.error ?? payload))
    : () => {};
  // Beim Laden der Seite steht der aktuelle Zustand im Global; ab dann schiebt
  // die SSE-Route jede Aenderung nach.
  const uiInjectDisposer = typeof ctx?.on === 'function'
    ? ctx.on(INDEX_INJECT, (table) => {
        if (!Array.isArray(table)) return;
        table.push({ kind: 'global', name: UI_STATE_GLOBAL, value: uiSnapshot() });
        // Das Panel soll beim Laden schon die offenen Vorschlaege zeigen; ohne
        // diesen Startstand waere es bis zum ersten Abruf leer.
        table.push({ kind: 'global', name: REVIEW_GLOBAL, value: reviewService.review() });
      })
    : () => {};
  const routeDisposers = [];
  /** Einen JSON-Body lesen — gedeckelt, fail-closed, ohne den Request zu haengen. */
  const readJsonBody = (req) => new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > REVIEW_BODY_LIMIT) { resolve({ ok: false, error: 'BODY_TOO_LARGE' }); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        resolve({ ok: false, error: 'INVALID_JSON' });
      }
    });
    req.on('error', () => resolve({ ok: false, error: 'BODY_UNREADABLE' }));
  });

  /** Eine JSON-Antwort — ein Weg fuer alle schreibenden Routen. */
  const sendJson = (res, status, value) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
  };

  const mountUiRoute = (webCtx) => {
    const webServer = typeof webCtx?.get === 'function' ? webCtx.get('webServer') : undefined;
    if (typeof webServer?.register !== 'function') return;
    routeDisposers.push(webServer.register({
      kind: 'exact',
      path: UI_STATE_ROUTE,
      handler: (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(uiSnapshot())}\n\n`);
        // Der Startstand des Pruef-Panels kommt auf derselben Verbindung — ein
        // zweiter Kanal waere ein zweites Fenster auf denselben Zustand.
        res.write(reviewEvent());
        uiClients.add(res);
        req.on('close', () => uiClients.delete(res));
      },
    }));
    // Jede Entscheidung ist ein ausdruecklicher Akt: GET zeigt die Belege,
    // POST nimmt genau eine `accepted`/`rejected`-Entscheidung entgegen.
    routeDisposers.push(webServer.register({
      kind: 'exact',
      path: REVIEW_ROUTE,
      handler: async (req, res) => {
        if (req.method === 'GET') { sendJson(res, 200, reviewService.review()); return; }
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }
        const body = await readJsonBody(req);
        if (!body.ok) { sendJson(res, 400, { ok: false, error: body.error }); return; }
        const id = typeof body.value?.id === 'string' ? body.value.id : '';
        const decision = body.value?.decision;
        if (id === '' || (decision !== 'accepted' && decision !== 'rejected')) {
          sendJson(res, 400, { ok: false, error: 'INVALID_REQUEST' });
          return;
        }
        const result = reviewService.decide(id, decision);
        sendJson(res, result.ok ? 200 : 409, result);
      },
    }));
    // Die Beziehungsstufe ist ein AUSDRUECKLICHER Akt des Menschen, kein
    // abgeleitetes Urteil: GET zeigt Stufen und Stand, POST setzt genau eine.
    // Der Handler emittiert das Signal; den Rest (Validierung, `relation.updated`)
    // machen Spine, Persona-Zustand und Narrative Engine.
    routeDisposers.push(webServer.register({
      kind: 'exact',
      path: RELATION_ROUTE,
      handler: async (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, 200, {
            contract: RELATION_CONTRACT,
            levels: relationService.levels(),
            current: persona.snapshot().relation,
          });
          return;
        }
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }
        const body = await readJsonBody(req);
        if (!body.ok) { sendJson(res, 400, { ok: false, error: body.error }); return; }
        // Das Panel schickt nur die Stufe; die Sitzung ist die, in der die
        // Persona zuletzt gesehen wurde. Ein Aufrufer MIT Sitzung gewinnt.
        const result = relationService.set({
          level: body.value?.level,
          sessionId: body.value?.sessionId || lastSessionId,
        });
        if (result.ok) publishUi();
        sendJson(res, result.ok ? 200 : 400, result);
      },
    }));
    // Die Routen haengen am Fiber, nicht am Prozess.
    webCtx.effect?.(() => () => {
      for (const dispose of routeDisposers.splice(0)) {
        try { dispose?.(); } catch { /* schon weg */ }
      }
    });
  };
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mountUiRoute);
  else mountUiRoute(ctx);

  // ── Die Prüf-Naht: ansehen und ausdrücklich entscheiden ────────────────────
  // Kein Vorschlag wird hier angenommen, weil er plausibel klingt. `review()`
  // zeigt Belege, `decide()` ist der EINE Akt, der eine Selbstauflage erzeugt.
  const reviewService = {
    contract: REVIEW_CONTRACT,
    review: () => ({
      contract: REVIEW_CONTRACT,
      memory: memoryView(ensureMemory(null)),
      proposals: (ensureMemory(null).proposals ?? []).map((proposal) => ({
        id: proposal.id,
        claim: proposal.claim,
        evidence: proposal.evidence,
        status: proposal.status,
        decidedAt: proposal.decidedAt,
      })),
      commitments: acceptedCommitments(ensureMemory(null)).map((proposal) => ({ id: proposal.id, claim: proposal.claim, evidence: proposal.evidence })),
    }),
    decide: (id, decision) => {
      const now = new Date().toISOString();
      const result = decideProposal(ensureMemory(now), id, decision, now);
      if (!result.ok) return { ok: false, error: result.error };
      memoryDoc = result.memory;
      persistMemoryDoc();
      publishUi();
      console.log(`[shinon-persona] Vorschlag ${id} ${decision === 'accepted' ? 'angenommen' : 'abgelehnt'}`);
      return { ok: true, proposal: result.proposal };
    },
  };
  const releaseReview = typeof ctx.provide === 'function' ? ctx.provide(REVIEW_SERVICE, reviewService) : null;
  if (releaseReview === null) {
    console.warn(`[shinon-persona] ${REVIEW_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`);
  }

  // ── Der Produzent der Beziehungsstufe: Stufe pruefen -> Signal, im Kern ────
  // Vorher gab es KONSUMENTEN (`relation.updated`), aber keinen Produzenten.
  const relationService = createRelationService(
    contract,
    typeof ctx?.emit === 'function' ? (signal, payload) => ctx.emit(signal, payload) : null,
  );
  const releaseRelation = typeof ctx.provide === 'function' ? ctx.provide(RELATION_SERVICE, relationService) : null;
  if (releaseRelation === null) {
    console.warn(`[shinon-persona] ${RELATION_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`);
  }

  // Der Sitzungs-Scope: `agent/pre-step` umschließt den ganzen Schritt, also auch
  // die Assembly des System-Prompts. Was hier gesetzt wird, gilt nur für diesen
  // Schritt und nur in diesem Async-Kontext.
  const sessionDisposer = typeof ctx?.on === 'function'
    ? ctx.on('agent/pre-step', (payload, next) => {
        const cwd = payload?.agent?.session?.header?.cwd;
        return sessionRoot.run({ root: typeof cwd === 'string' ? cwd : '' }, () =>
          typeof next === 'function' ? next() : undefined,
        );
      })
    : () => {};

  return () => {
    if (typeof disposer === 'function') disposer();
    if (typeof sessionDisposer === 'function') sessionDisposer();
    if (typeof decisionDisposer === 'function') decisionDisposer();
    if (typeof errorDisposer === 'function') errorDisposer();
    if (typeof uiInjectDisposer === 'function') uiInjectDisposer();
    if (typeof releaseReview === 'function') releaseReview();
    if (typeof releaseRelation === 'function') releaseRelation();
    for (const response of uiClients) { try { response.end(); } catch { /* weg */ } }
    uiClients.clear();
    console.log('[shinon-persona] Deaktiviert');
  };
}
