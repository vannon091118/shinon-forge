// Der statische Vertrag jeder Host-Hälfte (`indexIssues` in
// `scripts/lib/repo-pakete.mjs`) verlangt in DIESER Datei das Literal
// `@deepseek-ai/schemastery` und `export const Config`: das Plugin-Schema muss
// an der Host-Hälfte sichtbar sein. Gebaut wird es im Eigentuemer
// (`assets/schema.js`); der Import bleibt als benannte Grenze stehen —
// dieselbe Form wie `@shinon/prompter`.
import z from '@deepseek-ai/schemastery';
import { AsyncLocalStorage } from 'node:async_hooks';
import { acceptedCommitments } from './assets/memory-core.js';
import { decideProposal } from './assets/memory-proposals.js';
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
import { RELATION_CONTRACT, RELATION_ROUTE, RELATION_SIGNAL, TRIGGERS, createPromptText, createRelationService, detectUserMood, matchTrigger, renderTriggerContext, textOf } from './assets/interaction-core.js';
// Der Live-Zustand der Persona geht als RUNTIME-CONTEXT in die Nachrichtenliste,
// nicht nur als System-Prompt-Abschnitt: so ersetzt der Stand pro Schritt den
// vorherigen (statt sich neben ihm zu stapeln) und traegt den Anti-Drift-Satz
// "This snapshot supersedes earlier runtime-context snapshots".
import { renderLiveContext } from './assets/live-context.js';
// Panel-Daten und Routen (Globals, SSE, Review, Beziehung) haben einen eigenen
// Eigentuemer: der Eintrag baut die Flaeche, die Flaeche kennt die HTTP-Form.
import { createUiSurface } from './assets/ui-surface.js';
import { installMemoryProposalSeam } from './assets/memory-proposal-seam.js';
import { createEventReaction } from './assets/event-reaction.js';
import { mountPromptSections } from './assets/prompt-mount.js';
// Welche Abschnitte es gibt und wie sie am Prompt haengen: eigener Eigentuemer.
// Fuer WEN die Persona in diesem Schritt spricht: eigener Eigentuemer.
import { createSessionScope, declaredWorkspaceRoot } from './assets/session-scope.js';
// Der Arbeitsablauf als EIN zusammenhaengender Baustein: die Reihenfolge der
// Schritte und der Umgang mit Zweifel, Blockern, Fehlern und Abbruch.
import { renderWorkflow } from './assets/workflow.js';
// Der Plugin-Vertrag (Felder + Vorgaben) hat einen eigenen Eigentuemer:
// `assets/schema.js`. Vorgaben sind DATEN (Texte aus ./assets/prompts.json,
// Vertrag shinon.prompts/v1; Workflow aus ./assets/workflow.js; Namensraeume
// aus dem Zustand), ein leeres Feld bleibt ein leerer Abschnitt. Metadaten
// (Lage, Sektion, Modus, Budget) stehen in packages/prompter/assets/blocks.json.
import { Config as _imported_config_schema } from './assets/schema.js';
// Der Projekt-Kontext (aus dem Sitzungs-Workspace) wird im importfreien Kern gelesen.
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

/**
 * Der Vertrag der Prüfung: ansehen und ausdrücklich annehmen — sonst nichts.
 * Der DIENSTNAME ging am 2026-10-23 mit dem Dienst (`shinon_persona_review`
 * hatte keinen Leser, die Route `REVIEW_ROUTE` ist die Naht) — ein
 * stehengebliebener Name lüde zu einem `ctx.get` ein, das `undefined` liefert.
 */
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
export { RELATION_CONTRACT, RELATION_ROUTE, TRIGGERS, matchTrigger, detectUserMood, textOf, renderLiveContext };

/**
 * Die Materialübersicht. Sie beschreibt, WAS da ist — und schreibt
 * ausdruecklich NICHT vor, was geantwortet wird. Die Antwortform ist narrativ:
 * eine Person, die angesprochen wird, kein Datenblatt, das abgefragt wird.
 */

// Die Aussenflaeche bleibt derselbe NAME: der Eintrag bietet das Schema an,
// gebaut wird es im Eigentuemer. Abnehmer und Tests lesen unveraendert
// `Config` aus `@shinon/persona`.
const _config_schema = _imported_config_schema;
export const Config = _config_schema;

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
  // Was die Persona in DIESEM Turn gelesen hat: der Kern zaehlt, der Eintrag
  // haelt den Zaehler und setzt ihn am Turn-Ende zurueck (`turnSummary`).
  const turnTally = { events: 0, human: 0 };

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
    onChange: () => surface.publish(),
  });

  const disposeProposal = installMemoryProposalSeam({ bus, runtime });

  // Die Registrierung hat einen eigenen Eigentuemer (`assets/prompt-mount.js`);
  // der Eintrag reicht nur die Getter hinein, die aus Config und Runtime kommen.
  // Der Callback gibt NICHTS zurueck: Cordis nimmt den Rueckgabewert von
  // `ctx.inject` als Aufraeumfunktion und raeumt sonst sofort auf (gemessen:
  // der Live-Kontext verschwand, waehrend die Abschnitte stehen blieben).
  bus.demand(['systemPrompt'], (child) => { mountPromptSections(child, {
    config,
    contract,
    persona,
    runtime,
    gated,
    projectsForSession,
    rootOfAssembly,
    declaredRoot,
    workflowText: renderWorkflow(config.workflow),
    tone: () => readTone(ctx, warnedTone),
    userMood: () => lastUserMood,
    spricht: (assemblyCtx) => speaksForSession(assemblyCtx),
    triggerText: () => (lastTrigger === null ? null : renderTriggerContext(lastTrigger)),
    onRenderTrigger: (render) => { renderTrigger = render; },
  }); });

  // Beobachtung: die Persona antwortet nie auf ein Event, sie aktualisiert
  // ausschliesslich ihren eigenen Kontext. Die Reaktion hat einen eigenen
  // Eigentuemer (`assets/event-reaction.js`); hier steht nur die Registrierung.
  const handler = createEventReaction({
    triggers: config.identityTriggers,
    channel: config.eventsChannel,
    getTrigger: () => lastTrigger,
    getMood: () => lastUserMood,
    setTrigger: (value) => { lastTrigger = value; renderTrigger(); },
    setMood: (value) => { lastUserMood = value; },
    resetDecision: () => { lastDecision = null; },
    runtime,
    persona,
    promptText,
    tally: turnTally,
  });
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
        table.push({ kind: 'global', name: UI_STATE_GLOBAL, value: surface.snapshot() });
        // Das Panel soll beim Laden schon die offenen Vorschlaege zeigen; ohne
        // diesen Startstand waere es bis zum ersten Abruf leer.
        table.push({ kind: 'global', name: REVIEW_GLOBAL, value: surface.reviewService.review() });
  });
  if (!bus.demand(['webServer'], (webCtx) => surface.mount(webCtx))) surface.mount(ctx);

  // KEIN `bus.provide('shinon_persona_review', …)` (2026-10-23): der Dienst hatte keinen
  // Leser im Baum — weder ein Host-Paket noch ein Client. Die lebende Naht ist
  // die Route (`REVIEW_ROUTE`, GET und POST) samt `REVIEW_GLOBAL` und dem
  // SSE-Ereignis `review`; ein zweiter Zugang zum selben Objekt wäre eine zweite
  // Tür, die niemand öffnet. Auch der NAME ist gegangen.

  // ── Der Produzent der Beziehungsstufe: Stufe pruefen -> Signal, im Kern ────
  // Vorher gab es KONSUMENTEN (`relation.updated`), aber keinen Produzenten.
  const relationService = createRelationService(
    contract,
    typeof ctx?.emit === 'function' ? (signal, payload) => ctx.emit(signal, payload) : null,
  );
  // Auch die Beziehung wird NICHT als Dienst angeboten (2026-10-23): gelesen
  // wird sie über `UI_STATE_GLOBAL` (Feld `relation`) und gesetzt über
  // `RELATION_ROUTE`; der Produzent (`relationService`) bleibt der eine Ort der
  // Prüfung. Ein Dienst ohne Abnehmer wäre eine ausgestellte Vollmacht.

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
    // Eine Liste, eine Regel: jede Registrierung wird genau einmal geloest.
    for (const dispose of [disposeProposal, disposer, sessionDisposer, decisionDisposer, errorDisposer, uiInjectDisposer]) {
      if (typeof dispose === 'function') dispose();
    }
    surface.close();
    console.log('[shinon-persona] Deaktiviert');
  };
}
