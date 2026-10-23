import z from '@deepseek-ai/schemastery';
import { AsyncLocalStorage } from 'node:async_hooks';
import { acceptedCommitments, decideProposal } from './assets/memory-core.js';
// Der Zustand der Persona (Selbstmodell und Langzeitgedaechtnis) hat EINEN
// Eigentuemer: `assets/persona-runtime-state.js`. Die Namensraeume und Dokument-Ids, die der
// Eintrag als oeffentliche Namen weitergibt, stehen dort.
import {
  EMPTY_CONTRACT,
  createPersonaState,
  loadStateContract,
} from './assets/state-machine.js';
import {
  MEMORY_MEMO_ID,
  MEMORY_NAMESPACE,
  SELF_MODEL_MEMO_ID,
  SELF_MODEL_NAMESPACE,
  createPersonaRuntime,
} from './assets/persona-runtime-state.js';
// Das Lesen einer MENSCHLICHEN Nachricht und der explizite Beziehungs-Produzent
// liegen im importfreien Kern: dieselbe Rechnung im Host, im Test ohne
// node_modules und in der Probe gegen den echten Spine.
import { RELATION_CONTRACT, RELATION_ROUTE, RELATION_SERVICE, RELATION_SIGNAL, TRIGGERS, beobachten, createPromptText, createRelationService, detectUserMood, matchTrigger, renderTriggerContext, textOf } from './assets/interaction-core.js';
// Der Live-Zustand der Persona geht als RUNTIME-CONTEXT in die Nachrichtenliste,
// nicht nur als System-Prompt-Abschnitt: so ersetzt der Stand pro Schritt den
// vorherigen (statt sich neben ihm zu stapeln) und traegt den Anti-Drift-Satz
// "This snapshot supersedes earlier runtime-context snapshots".
import { renderLiveContext } from './assets/live-context.js';
// Panel-Daten und Routen (Globals, SSE, Review, Beziehung) haben einen eigenen
// Eigentuemer: der Eintrag baut die Flaeche, die Flaeche kennt die HTTP-Form.
import { createUiSurface } from './assets/ui-surface.js';
// Welche Abschnitte es gibt und wie sie am Prompt haengen: eigener Eigentuemer.
import { buildSectionPlan, registerSections } from './assets/prompt-sections.js';
// Fuer WEN die Persona in diesem Schritt spricht: eigener Eigentuemer.
import { createSessionScope, declaredWorkspaceRoot } from './assets/session-scope.js';
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
  createOrchestrator,
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

/**
 * Die Namensraeume der Persona — definiert in `assets/persona-runtime-state.js`, hier nur
 * weitergereicht: der Eintrag bleibt die oeffentliche Flaeche des Pakets.
 *
 * Der Namensraum des Selbstmodells ist ein Projekt, ein Stand; das
 * Langzeit-Gedaechtnis liegt in einem EIGENEN Raum, weil das Modell Ausgaenge
 * zaehlt und das Gedaechtnis Ereignisse traegt — ein gemeinsames Dokument wuerde
 * beim Schreiben das jeweils andere ueberschreiben.
 */
export { MEMORY_MEMO_ID, MEMORY_NAMESPACE, SELF_MODEL_MEMO_ID, SELF_MODEL_NAMESPACE };

/** Die Naht für die Prüfung: ansehen und ausdrücklich annehmen — sonst nichts. */
export const REVIEW_SERVICE = 'shinon_persona_review';
export const REVIEW_CONTRACT = 'shinon.persona-review/v1';

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



/**
 * Die Zustandsmaschine hat einen eigenen Eigentuemer (`assets/state-machine.js`):
 * Vertrag laden, Uebergang rechnen, Verlauf halten. Der Eintrag bleibt die
 * oeffentliche Flaeche des Pakets und reicht die Namen unveraendert weiter.
 */
export {
  EMPTY_CONTRACT,
  loadStateContract,
  initialState,
  deriveState,
  createPersonaState,
  eventTypeOf,
} from './assets/state-machine.js';

// Der Ton ist eine eigene Naht (`assets/tone.js`): die Persona liest ihn, sie
// setzt ihn nicht. Die Namen bleiben hier die oeffentliche Flaeche.
import { readTone } from './assets/tone.js';
export { SCORING_SERVICE, SCORING_SERVICE_CONTRACT } from './assets/tone.js';
export { readTone };

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
  // Jede Registrierung dieses Pakets läuft über den einen Orchestrator: der
  // Befund nennt das Paket, und der Gate-Vertrag (`shinon.turn/v1`) sieht die
  // Kanäle. Die Hülle ändert kein Verhalten — sie nennt nur, was passiert.
  const bus = createOrchestrator(ctx, { owner: 'persona' });
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

  // ── Die Halter des Schritts ───────────────────────────────────────────────
  // Zuletzt erkanntes Triggerwort. Bleibt stehen, damit die Form nicht mitten
  // im Gespräch wieder in die Abfrage-Haltung zurückkippt.
  let lastTrigger = null;
  let renderTrigger = () => {};
  // Die zuletzt ERKANNTE User-Stimmung — sie steht im Live-Block, nicht in einem Abschnitt.
  let lastUserMood = null;
  // Das Selbstmodell: ein Modell JE ROOT — die Ablage gehoert dem Projekt, nicht
  // dem Prozess. `lastDecision` ist die zuletzt erkannte Auftragsklasse.
  let lastDecision = null;
  // Der Text der letzten Menschen-Nachricht: Gedaechtnis und Gate lesen denselben Halter.
  const promptText = createPromptText();
  const persona = createPersonaState(contract);

  // Der Sitzungs-Scope hat einen eigenen Eigentuemer (`assets/session-scope.js`):
  // er entscheidet je Assembly, fuer wen die Persona spricht. Der Eintrag haelt
  // nur die Halter, die auch der Event-Zweig liest.
  const scope = createSessionScope({
    declaredRoot,
    globalIdentity,
    sessionRoot,
    contract,
    promptText,
    getDecision: () => lastDecision,
  });
  const { rootOfAssembly, speaksForRoot, speaksForSession, projectsForSession, gated } = scope;

  // Ein fremder Dienst unter dem Ton-Namen wird EINMAL gemeldet: sonst flutete
  // jede Zustandsaenderung dieselbe Warnung.
  let toneWarned = false;
  const warnedTone = (message) => {
    if (toneWarned) return;
    toneWarned = true;
    console.error(`[shinon-persona] ${message} — kein Ton im Zustand`);
  };

  // ── Die Flaeche: Panel-Daten und Routen ───────────────────────────────────
  // Sie hat einen eigenen Eigentuemer (`assets/ui-surface.js`): hier stehen nur
  // die Getter, weil die Runtime und der Beziehungs-Produzent erst unten gebaut
  // werden. Die Namen bleiben in diesem Eintrag definiert.
  const surface = createUiSurface({
    names: {
      uiContract: UI_STATE_CONTRACT,
      reviewContract: REVIEW_CONTRACT,
      uiRoute: UI_STATE_ROUTE,
      reviewRoute: REVIEW_ROUTE,
      relationRoute: RELATION_ROUTE,
      relationContract: RELATION_CONTRACT,
      bodyLimit: REVIEW_BODY_LIMIT,
    },
    contract,
    persona,
    runtime: () => runtime,
    root: () => sessionRoot.getStore()?.root || declaredRoot,
    tone: () => readTone(ctx, warnedTone),
    userMood: () => lastUserMood,
    decision: () => lastDecision,
    relation: () => relationService,
    review: { accepted: acceptedCommitments, decide: decideProposal },
    log: (message) => console.log(`[shinon-persona] ${message}`),
  });
  const uiSnapshot = surface.snapshot;
  const publishUi = surface.publish;
  const reviewService = surface.reviewService;

  // Das Gedaechtnis hat seinen eigenen Eigentuemer (assets/persona-runtime-state.js): hier
  // steht nur, WER es baut und WELCHE Entscheidungen es mitbekommt. Der
  // Zustand selbst (einmal je Root laden, im Prozess halten, einmal schreiben)
  // liegt dort — der Eintrag liest ihn nur noch ab.
  const runtime = createPersonaRuntime({
    config,
    ctx,
    sessionRoot,
    declaredRoot,
    speaksForRoot,
    speaksForSession,
    rootOfAssembly,
    promptText,
    onChange: () => publishUi(),
  });

  // TODO: [DSH-Refactor] - Die Registrierung steckt in vier verschachtelten Closures (inject →
  // effect → renderPrompt → renderTrigger) mit handgefuehrtem Disposer-Stack; nicht ablesbar
  // ist, welcher Disposer zu welchem Abschnitt gehoert. Ziel: eine Funktion mit EINER
  // Aufraeumliste. (Der Absturzpfad selbst ist geschlossen: der Dienst wird vor dem ersten
  // Aufruf geprueft — siehe unten.)
  bus.demand(['systemPrompt'], (child) => {
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

    // Die Liste der Abschnitte und ihre Registrierung haben einen eigenen
    // Eigentuemer (`assets/prompt-sections.js`): hier stehen nur die Teile, die
    // aus Config, Runtime und Workspace kommen.
    const contextPath = typeof config.projectContextPath === 'string' ? config.projectContextPath : '';
    const projectContextText = contextPath === '' ? null : (() => {
      const cache = new Map();
      return (assemblyCtx) => {
        if (!projectsForSession(assemblyCtx)) return '';
        return readProjectContext({
          contextPath,
          root: () => rootOfAssembly(assemblyCtx) || declaredRoot,
          declaredRoot,
          cache,
          warn: (message) => console.warn(`[shinon-persona] ${message}`),
          log: (message) => console.log(`[shinon-persona] ${message}`),
        });
      };
    })();
    const sections = buildSectionPlan({
      atPrefix,
      atSuffix,
      config,
      workflowText: renderWorkflow(config.workflow),
      gated,
      runtime,
      projectContextText,
    });

    child.effect(() => {
      const registered = registerSections(sp, sections, {
        gated,
        atPrefix,
        contract,
        persona,
        tone: () => readTone(ctx, warnedTone),
        userMood: () => lastUserMood,
        spricht: (assemblyCtx) => speaksForSession(assemblyCtx),
        triggerText: () => (lastTrigger === null ? null : renderTriggerContext(lastTrigger)),
      });
      renderTrigger = registered.renderTrigger;
      return registered.dispose;
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
    if (gelesen.sessionId !== null) runtime.lastSessionId = gelesen.sessionId;
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
    runtime.remember('event', { type: gelesen.eventType, payload: gelesen.eventPayload });
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
  const disposer = bus.route(config.eventsChannel, handler);

  // ── Die Belege: echte Laufzeitspuren, nicht Selbsteinschaetzung ───────────
  // Der Veredler meldet JEDE Entscheidung (Ausgang, Gruende, offene Fragen, die
  // Klasse des Auftrags); der Loop meldet jeden Fehler. Beides wird gezaehlt,
  // beides kann zu einer belegten Grenze bzw. offenen Frage werden — und beides
  // faellt wieder weg, wenn es nicht mehr auftritt.
  const decisionDisposer = bus.route(PROMPTER_DECISION_CHANNEL, (record) => {
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
        runtime.observe('decision', record);
        runtime.remember('decision', record);
  });
  const errorDisposer = bus.route('agent/error', (payload) => runtime.observe('error', payload?.error ?? payload));
  // Beim Laden der Seite steht der aktuelle Zustand im Global; ab dann schiebt
  // die SSE-Route jede Aenderung nach.
  const uiInjectDisposer = bus.route(INDEX_INJECT, (table) => {
        if (!Array.isArray(table)) return;
        table.push({ kind: 'global', name: UI_STATE_GLOBAL, value: uiSnapshot() });
        // Das Panel soll beim Laden schon die offenen Vorschlaege zeigen; ohne
        // diesen Startstand waere es bis zum ersten Abruf leer.
        table.push({ kind: 'global', name: REVIEW_GLOBAL, value: reviewService.review() });
  });
  if (!bus.demand(['webServer'], (webCtx) => surface.mount(webCtx))) surface.mount(ctx);

  const releaseReview = bus.provide(REVIEW_SERVICE, reviewService);
  if (releaseReview === null) {
    console.warn(`[shinon-persona] ${REVIEW_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`);
  }

  // ── Der Produzent der Beziehungsstufe: Stufe pruefen -> Signal, im Kern ────
  // Vorher gab es KONSUMENTEN (`relation.updated`), aber keinen Produzenten.
  const relationService = createRelationService(
    contract,
    typeof ctx?.emit === 'function' ? (signal, payload) => ctx.emit(signal, payload) : null,
  );
  const releaseRelation = bus.provide(RELATION_SERVICE, relationService);
  if (releaseRelation === null) {
    console.warn(`[shinon-persona] ${RELATION_SERVICE} NICHT angeboten (der Host hat kein ctx.provide)`);
  }

  // Der Sitzungs-Scope: `agent/pre-step` umschließt den ganzen Schritt, also auch
  // die Assembly des System-Prompts. Was hier gesetzt wird, gilt nur für diesen
  // Schritt und nur in diesem Async-Kontext.
  const sessionDisposer = bus.route('agent/pre-step', (payload, next) => {
    const cwd = payload?.agent?.session?.header?.cwd;
    return sessionRoot.run({ root: typeof cwd === 'string' ? cwd : '' }, () =>
      typeof next === 'function' ? next() : undefined,
    );
  });

  return () => {
    if (typeof disposer === 'function') disposer();
    if (typeof sessionDisposer === 'function') sessionDisposer();
    if (typeof decisionDisposer === 'function') decisionDisposer();
    if (typeof errorDisposer === 'function') errorDisposer();
    if (typeof uiInjectDisposer === 'function') uiInjectDisposer();
    if (typeof releaseReview === 'function') releaseReview();
    if (typeof releaseRelation === 'function') releaseRelation();
    surface.close();
    console.log('[shinon-persona] Deaktiviert');
  };
}
