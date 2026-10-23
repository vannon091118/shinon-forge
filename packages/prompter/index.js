/**
 * @shinon/prompter — index.js (Eigentuemer: NAHT / EINSTIEG)
 *
 * Die Host-Haelfte des Pakets und NUR die Verdrahtung: die oeffentlichen Namen,
 * der Plugin-Vertrag (`Config`, `inject`, `apply`), die Registrierung am Seam
 * `agent/pre-step`, die Trace-Route und das Dispose. Was ein Lauf tut, steht in
 * `assets/pre-step.js`; was er sich merkt, in `assets/runtime-state.js`; was er
 * erzaehlt, in `assets/trace-report.js`.
 *
 * Der Schnitt (2026-10-20) hat die INNENflaeche geteilt, nicht die Aussenflaeche:
 * jeder Name, den andere Pakete, das Gate und die Tests aus diesem Paket lesen,
 * steht hier unveraendert — die Re-Exporte unten sind die Zusage.
 *
 *     index.js  (Naht: Namen, Registrierung, Dispose)
 *        |
 *        +--> assets/pre-step.js      Lauf: ein Schritt, ein Datensatz
 *        +--> assets/runtime-state.js Zustand: Mount, Gedaechtnis, Ablage
 *        |         ^                      ^
 *        +--> assets/trace-report.js  Ausgang: Log, Puffer, SSE, Kanal
 *                  ^
 *                  |  (pre-step ruft runtime-state und trace-report, nie zurueck)
 */
import z from '@deepseek-ai/schemastery';
import { NARRATIVE_STATE_CHANNEL, NARRATIVE_STATE_CONTRACT } from '@shinon/seams/core';
import { Config as _imported_config_schema } from './assets/schema.js';
import { FACTS_SNAPSHOT_CONTRACT, FACTS_SNAPSHOT_SERVICE, INDEX_CONTRACT, INDEX_SERVICE, PRE_STEP_EVENT, resolveMode } from './assets/mode-core.js';
import { PROPOSE_CONTRACT, PROPOSE_SERVICE } from './assets/block-review.js';
import { notesDir } from './assets/prompt-files.js';
import { loadRuntime, proposeBlock } from './assets/runtime-state.js';
import { onPreStep } from './assets/pre-step.js';
import { renderKnowledgeBlock } from './assets/knowledge-block.js';
import { registerContext } from './assets/context-channel.js';
import { createSkillLifecycle, loadLifecycleRules } from './assets/skill-lifecycle.js';
/** Das Global, in das der Host die letzten Entscheidungen legt (der Client liest es). */
export const TRACE_GLOBAL = '__shinonPrompterTrace';

/** Die Naht, ueber die dsh-host-webserver die Zeilen aller Haelften einsammelt. */
export const INDEX_INJECT = 'webserver/index-inject';

/** Der Live-Kanal des Trace-Panels (Server-Sent Events, gleiche Herkunft). */
export const TRACE_ENDPOINT = '/shinon/prompter/trace';

/**
 * Kanal und Vertragsname der Narrative Engine (Zug 6) — aus `@shinon/seams`,
 * nicht als Literal. Bis 2026-10-20 standen beide Namen hier als Spiegel von
 * `@shinon/narrative` und wurden von `SOURCE_TWINS` verglichen; ein falscher
 * Name hätte nur bewirkt, dass der Arc im MAX-Kontext nie erscheint.
 */
const NARRATIVE_CHANNEL = NARRATIVE_STATE_CHANNEL;
const NARRATIVE_CONTRACT = NARRATIVE_STATE_CONTRACT;

/**
 * Der Zettel-Kern wird RE-EXPORTIERT, nicht nachgebaut: die reinen Funktionen
 * (lesen, waehlen, pruefen, rendern) sind ohne node_modules testbar, die
 * Host-Anbindung (Verzeichnis lesen) bleibt hier. Dieselbe Teilung wie bei
 * `@shinon/scoring` (Kern + Host) — die oeffentlichen Namen bleiben dieselben.
 */
export { parseNote, renderStand, reviewNotes, selectNotes, tokens } from './assets/note-core.js';

// --- Host-Hälfte: Plugin-Vertrag (Config, inject, apply).
// Den Config-Defaults besitzt genau diese Datei, weil sie die eine Quelle des
// Config-Schemas ist (Host-Hälfte laut Moduldatei-Form).
const _config_schema = _imported_config_schema;
export const Config = _config_schema;

/**
 * shinon-prompter — der interne One-Shot Prompt Enhancer.
 *
 *   agent/pre-step
 *     → dieser Hook
 *     → One-Shot-Child  (ctx.llm.stream, KEINE Tools)
 *     → strukturiertes Ergebnis
 *     → Host-Validierung (Schema + Policy)
 *     → übernommener oder verworfener Prompt
 *
 * Verifizierte Grundlage — installiertes DSH 0.2.0-rc.2, nichts davon geraten:
 *
 *   LLM           ctx.llm: LlmRuntime (@deepseek-ai/dsh-llm)
 *                 stream(options: GenerateOptions): AsyncIterable<StreamChunk>
 *                 GenerateOptions: provider, model, messages: RequestMessage[],
 *                 system?, tools?, temperature?, maxTokens?, stop?, signal?,
 *                 sessionId?, purpose?: 'compaction' | 'session-title'
 *   One-Shot      RequestUserInput = { role: 'user', content, id?: never, source?: never }
 *                 Die Doku nennt den Fall ausdrücklich: „a hand-built one-shot may
 *                 include identity-free user inputs."
 *   Stream        StreamChunk u. a. { type: 'text-delta', index, text }
 *   Seam          agent/pre-step, @mode waterfall (siehe @shinon/hook für die
 *                 vollständige Signatur-Verifikation)
 *
 * ZWEI DINGE, DIE DSH NICHT HAT — und die deshalb hier liegen, statt erfunden
 * zu werden:
 *
 *   1. Kein Structured Output. Es gibt in der ganzen Installation kein
 *      `json_schema`, `response_format` oder `generateObject`. Die
 *      Schema-Durchsetzung ist damit zwangsläufig host-seitig: extrahieren,
 *      parsen, validieren, sonst verwerfen.
 *   2. Keine Modus-Semantik für Prompts. MIN/MID/MAX sind keine DSH-Konzepte,
 *      sondern unser Vertrag. Er steht deshalb als DATEN in MODE_CAPABILITIES,
 *      und die System-Prompts werden daraus ERZEUGT (policyFor). Ein separater
 *      Prompt-Text könnte von der Fähigkeitsliste abdriften; ein erzeugter
 *      nicht. Was dieser Vertrag NICHT behauptet: dass ein Modell sich daran
 *      hält. Prüfbar sind die Fähigkeitsliste, der erzeugte Text und die
 *      Annahme-Regeln — nicht der Gehorsam eines Modells.
 *
 * WER IST DER MENSCH? — der Seam liefert NICHT nur Nutzereingaben. Gemessen in
 * DSH 0.2.0-rc.2 reisen mindestens zwanzig Harness-Produzenten als
 * `role: 'user'`-Nachricht durch denselben Batch (`user-approval`,
 * `time-context`, `agent-instructions`, `repeat-tool-reminder`, `ptc-mode` …; die
 * Werkzeug-Kontexte kommen ueber `additionalContexts` der Werkzeuge). Die
 * Menschen erkennt man an `source.kind === 'user'` — genau diesen Test benutzt
 * DSH selbst (der API-Session-Controller raeumt Datei-Uploads damit auf, und der
 * UI-Weg setzt `{ kind: 'user', rpcId, clientTimeZone }`). Ohne die Pruefung
 * haelt der Enhancer Harness-Text fuer die Nutzereingabe und ersetzt ihn: eine
 * umformulierte Freigabe-Antwort („ja") ist eine geaenderte Entscheidung, keine
 * Stilfrage.
 *
 * CAPABILITY-ISOLATION (die eigentliche Sicherheitsgrenze): der One-Shot-Child
 * bekommt **kein `tools`-Feld**. Es gibt keinen Werkzeugkatalog, den man
 * einschränken könnte — die Liste ist leer, weil sie nicht existiert. Damit
 * fehlen Dateisystem, Shell, Subprozess, Terminal, Browser, beliebige Tools und
 * verschachtelte Agent-Steuerung nicht durch eine Policy, sondern durch
 * Abwesenheit. Ein XML-Tag wäre keine Grenze; das ist eine. Die
 * `<untrusted_project_context>`-Markierung aus Plan §15 ist ausdrücklich KEINE
 * Sicherheitsgrenze — sie sagt dem Modell, was Daten sind. Die Grenze bleibt die
 * fehlende Fähigkeit.
 */

/**
 * Die Dienste, die dieser Host braucht. Ohne deklarierte Injektion verweigert
 * Cordis den Zugriff auf `ctx.llm` (live gemessen im echten Boot: „cannot get
 * property \"llm\" without inject"). Der Fehler wurde korrekt zu einem
 * Verwerfen — der Host lief weiter und der Roh-Prompt galt —, aber der Enhancer
 * hat nie etwas veredelt, und ohne sichtbaren Lauf waere das nicht aufgefallen.
 * Genau so deklarieren es die mitgelieferten Hostplugins (dsh-agent-instructions
 * exportiert `inject` neben `Config` und `apply`).
 *
 * Nebenwirkung, die dazugehoert: ohne `llm`-Dienst wird dieser Host gar nicht
 * erst montiert — er kann ohne ihn nichts tun. Der Hook bleibt unabhaengig davon.
 */

export const inject = ['llm'];


/**
 * Registriert den Enhancer. Ohne `ctx.on` oder ohne den Event-Namen: keine
 * Registrierung, laut.
 *
 * Der Zustand wird EINMAL beim Mounten aufgebaut (`loadRuntime`), hier aber
 * nicht mehr gelesen: die Verdrahtung kennt nur die Naht, nicht die Felder.
 */
export function apply(ctx, config) {
  if (typeof ctx?.on !== 'function') {
    console.error(`[shinon-prompter] ctx.on fehlt — ${PRE_STEP_EVENT} wurde NICHT registriert (BLOCKED)`);
    return () => {};
  }
  if (!config.observeEvents.includes(PRE_STEP_EVENT)) {
    console.log(`[shinon-prompter] ${PRE_STEP_EVENT} nicht in observeEvents — bewusst nicht registriert`);
    return () => {};
  }

  const runtime = loadRuntime(ctx, config);
  // Kanal und Vertrag der Narrative Engine bleiben HIER gebunden (Naht-Namen,
  // nicht Code): der Lauf liest sie als Zeiger fuer die Provenienz-Leiter.
  runtime.narrativeChannel = NARRATIVE_CHANNEL;
  runtime.narrativeContract = NARRATIVE_CONTRACT;

  const dispose = ctx.on(PRE_STEP_EVENT, (payload, next) => onPreStep(ctx, config, runtime, payload, next));
  // DER HAKEN FUER DEN KONTEXT: `agent/inbox/claimed` feuert VOR der Assembly
  // (agent-loop:906 `claim()` vor :907 `assemble()`). Der Runtime-Context wird in
  // der Assembly projiziert — der Kontext muss also VORHER im Runtime stehen,
  // sonst waere der Block leer.
  //
  // GEMESSEN (2026-10-21, echter Turn): ohne diesen Haken kam der Projekt-
  // kontext nicht an, obwohl der Index 502 Dateien, 3926 Symbole und 2710
  // Chunks hatte — der Kanal lief, war aber leer.
  const disposeClaimed = ctx.on('agent/inbox/claimed', (payload) => {
    const message = payload?.message;
    if (message?.role !== 'user') return;
    const text = (Array.isArray(message.content) ? message.content : [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
    if (text.trim() !== '') runtime.lastPromptText = text;
  });
  // Der RUNTIME-CONTEXT-KANAL: der Projektkontext und das Wissen kommen als
  // EIGENE Nachricht beim Modell an — unabhaengig davon, was der Veredler
  // zurueckgibt. Ohne diesen Kanal fiel der Kontext bei jedem verworfenen
  // One-Shot weg (gemessen 2026-10-21: 502 Dateien, 3926 Symbole, 2710 Chunks
  // im Index, nichts davon beim Modell).
  if (typeof ctx.inject === 'function') {
    ctx.inject(['systemPrompt'], (child) => {
      const sp = child.systemPrompt;
      const disposeContext = registerContext(sp, {
        // Der Index-Dienst wird HIER gefragt, nicht im Pre-Step: die Assembly
        // laeuft vor dem Pre-Step (agent-loop:907 vor :909), der Kontext waere
        // zur Assembly-Zeit noch nicht im Runtime. Der letzte Auftragstext
        // dient als Auswahlfrage — er ist der, um den es geht.
        context: () => {
          const service = typeof ctx.get === 'function' ? ctx.get(INDEX_SERVICE) : undefined;
          if (service === undefined || service === null) return null;
          if (service.contract !== INDEX_CONTRACT || typeof service.resolveContext !== 'function') return null;
          try {
            return service.resolveContext(runtime.lastPromptText ?? '', { budgetTokens: config.indexBudgetTokens });
          } catch {
            // Ein dienstloser oder defekter Dienst ist kein Grund, den Kanal zu
            // beschaedigen: der Block faellt weg, der Schritt laeuft weiter.
            return null;
          }
        },
        // Der AUFGABENBRIEF wird HIER gelesen, aus dem Runtime: der Pre-Step
        // legt ihn nach der Entscheidung ab (`runtime.lastBriefText`), und die
        // naechste Assembly projiziert ihn — unabhaengig davon, ob der
        // Veredler den Prompt ersetzt hat. Nur bei eindeutigem Treffer steht
        // er da; sonst entfaellt er, und der Grund steht im Datensatz.
        brief: () => {
          const brief = runtime.lastBriefText ?? null;
          return typeof brief === 'string' && brief !== '' ? brief : null;
        },
        // SHINON.md reist als Pflichtblock — gelesen, geprueft und komprimiert
        // beim Mounten (`runtime.lastShinonText`); fehlt die Datei, faellt der
        // Block weg, statt eine Anweisung zu behaupten.
        shinon: () => runtime.lastShinonText ?? null,
        // Der WISSENSBLOCK wird HIER gelesen, nicht aus dem Runtime: der
        // Snapshot-Dienst ist der Besitzer, und der Pre-Step laeuft NACH der
        // Assembly (agent-loop:907 vor :909) — dort waere der Block noch leer.
        // Das ist derselbe Weg wie der Index-Kontext: der Kanal fragt den
        // Dienst selbst.
        wissen: () => {
          if (runtime.lastKnowledgeText !== null && runtime.lastKnowledgeText !== undefined) return runtime.lastKnowledgeText;
          const dienst = typeof ctx.get === 'function' ? ctx.get(FACTS_SNAPSHOT_SERVICE) : undefined;
          if (dienst === undefined || dienst === null) return null;
          if (dienst.contract !== FACTS_SNAPSHOT_CONTRACT || typeof dienst.snapshot !== 'function') return null;
          try {
            const snapshot = dienst.snapshot({ intent: runtime.turn?.resolution?.classification ?? 'UNBEKANNT' });
            if (snapshot === null || typeof snapshot !== 'object') return null;
            const block = renderKnowledgeBlock(snapshot);
            return block.text === '' ? null : block.text;
          } catch {
            // Ein defekter Dienst darf den Kanal nicht beschaedigen: der Block
            // faellt weg, der Schritt laeuft weiter.
            return null;
          }
        },
      });
      runtime.disposeContext = disposeContext;
    });
  }
  // Das Panel liest den Puffer beim Laden: dieselbe Naht wie Marker/Traceability.
  const disposeInject = ctx.on(INDEX_INJECT, (table) => {
    if (Array.isArray(table)) table.push({ kind: 'global', name: TRACE_GLOBAL, value: runtime.trace });
  });
  // Und LIVE: eine schmale SSE-Route. Der Entscheidungs-Kanal erreicht den
  // Browser nicht, also schiebt der Host neue Eintraege ueber diese Verbindung.
  runtime.sse = new Set();
  let disposeRoute = null;
  const mountTraceRoute = (webCtx) => {
    const webServer = typeof webCtx?.get === 'function' ? webCtx.get('webServer') : undefined;
    if (typeof webServer?.register !== 'function') {
      console.log('[shinon-prompter] webServer ohne register — Trace nur beim Laden der Seite, nicht live');
      return;
    }
    disposeRoute = webServer.register({
      kind: 'exact',
      path: TRACE_ENDPOINT,
      handler: (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(runtime.trace)}\n\n`);
        runtime.sse.add(res);
        req.on('close', () => runtime.sse.delete(res));
      },
    });
    // Die Route haengt am Fiber, nicht am Prozess: mit dem Dienst verschwindet sie.
    webCtx.effect?.(() => () => { try { disposeRoute?.(); } catch { /* schon weg */ } });
  };
  // `ctx.get` allein saehe den Dienst nicht: Zugriff verlangt eine Deklaration,
  // und die Reihenfolge der Fiber ist nicht die Reihenfolge der Dienste.
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mountTraceRoute);
  else mountTraceRoute(ctx);
  const disposeNarrative = ctx.on(NARRATIVE_CHANNEL, (composite) => {
    runtime.narrative = composite ?? null;
  });

  const route = runtime.route;
  const routeLabel = route.provider === '' || route.model === '' ? 'ohne Route (inaktiv)' : `${route.provider}/${route.model}`;
  const mode = resolveMode(config.mode);
  const contextInfo = mode.needsContext ? `context=${runtime.contextState}` : `context=${runtime.contextState} (${mode.mode} nutzt ihn nicht)`;
  const notesInfo = config.notesPath === '' ? 'notes=off' : `notes=${notesDir(config)}${runtime.noteRules === null ? ' (ohne Regeln)' : ''}`;
  const intentInfo = runtime.intentRules !== null
    ? `intent=${runtime.intentRules.patterns.length}Patterns`
    : 'intent=off';
  const blocksInfo = runtime.blocks !== null
    ? `blocks=${runtime.blocks.blocks.length}Bausteine`
    : 'blocks=off';
  // Ein unbegrenzter One-Shot ist eine ENTSCHEIDUNG, keine Vorgabe: `0` heisst
  // „kein Deckel" — und das steht beim Mounten mit Grund im Log, statt sich als
  // stilles „laeuft ja" zu verstecken. `timeoutMs` begrenzt dabei NUR diesen
  // einen Aufruf; der Hauptmodellstrom des Turns hat sein eigenes Regiment.
  if (!(config.maxTokens > 0)) {
    console.warn('[shinon-prompter] maxTokens=0 — One-Shot ohne Token-Deckel; der Mainstream ist davon unberuehrt (wirksamer Wert steht im Profil)');
  }
  if (!(config.timeoutMs > 0)) {
    console.warn('[shinon-prompter] timeoutMs=0 — One-Shot ohne Zeitdeckel; dieselbe Grenze gilt NICHT fuer den Hauptstrom');
  }
  console.log(`[shinon-prompter] Aktiviert — registriert auf ${PRE_STEP_EVENT} (mode=${config.mode}, route=${routeLabel}, maxTokens=${config.maxTokens > 0 ? config.maxTokens : 'kein Deckel'}, ${contextInfo}, ${notesInfo}, ${intentInfo}, ${blocksInfo})`);

  // Der fünfte Dienst (Phase 4): Vorschläge einreichen — prüfen und
  // aktivieren in einem Aufruf, fail-closed mit Befundliste. Wie der Ton und
  // die Gewichte: optionales Anbieten, gepruefter Vertragsname lesend, keine
  // Injektionspflicht für den Veredler selbst.
  const proposeService = {
    contract: PROPOSE_CONTRACT,
    propose: (proposal) => proposeBlock(config, runtime, proposal),
  };
  const canProvide = typeof ctx?.provide === 'function';
  const releasePropose = canProvide ? ctx.provide(PROPOSE_SERVICE, proposeService) : null;

  // Skill-Lebenszyklus (Zug 7): Ereignisse hoeren, Kandidaten im Hintergrund
  // pruefen, Skills nach .agents/skills schreiben (der Root, den DSH nativ
  // entdeckt). Fail-closed: ohne gueltige Regeln gibt es keinen Lebenszyklus.
  let lifecycle = null;
  let disposeLifecycle = null;
  if (config.skillLifecycle && config.eventsChannel !== '') {
    try {
      lifecycle = createSkillLifecycle({ ctx, rules: loadLifecycleRules(), noteRules: runtime.noteRules ?? {}, route });
      disposeLifecycle = ctx.on(config.eventsChannel, (envelope, payload) => lifecycle.observe(envelope, payload));
      console.log(`[shinon-prompter] Skill-Lebenszyklus aktiv — Ereignisse auf ${config.eventsChannel}, Ablage ${lifecycle.skillsRoot}`);
    } catch (error) {
      console.error(`[shinon-prompter] Skill-Lebenszyklus NICHT angebunden (${error?.message ?? error})`);
    }
  }

  return () => {
    lifecycle?.dispose();
    if (typeof disposeLifecycle === 'function') disposeLifecycle();
    if (typeof dispose === 'function') dispose();
    if (typeof disposeClaimed === 'function') disposeClaimed();
    if (typeof runtime.disposeContext === 'function') runtime.disposeContext();
    if (typeof disposeInject === 'function') disposeInject();
    if (typeof disposeRoute === 'function') disposeRoute();
    for (const response of runtime.sse ?? []) { try { response.end(); } catch { /* weg */ } }
    runtime.sse?.clear();
    if (typeof disposeNarrative === 'function') disposeNarrative();
    if (typeof releasePropose === 'function') releasePropose();
    console.log('[shinon-prompter] Deaktiviert — Listener abgemeldet');
  };
}
// ── Oeffentliche Aussenflaeche (unveraendert) ───────────────────────────────
export { ABORT_CONTRACT } from './assets/abort-core.js';
export { CAPABILITIES_CONTRACT } from './assets/capability-map.js';
export { CONTEXT_CONTRACT, CONTEXT_TAG, CONTRACT, DECISION_CHANNEL, INDEX_BUDGET_TOKENS, INDEX_CONTRACT, INDEX_SERVICE, INDEX_STORE_CONTRACT, INDEX_STORE_SERVICE, INTENT_CLASSES, MODES, MODE_CAPABILITIES, MODE_DELTAS, NOTES_DIR_DEFAULT, NOTE_RULES_CONTRACT, NOTE_RULES_PATH, OPERATION_LABELS, POLICIES, PRE_STEP_EVENT, REQUIREMENT_OPERATIONS, SCORING_SERVICE, SCORING_SERVICE_CONTRACT, SKILLS_DIR_DEFAULT, SKILL_RULES_CONTRACT, SKILL_RULES_PATH, STAND_CONTRACT, UNTRUSTED_RULE } from './assets/mode-core.js';
export { PROVENANCE_CONTRACT } from './assets/provenance.js';
export { ContextSchema, ResultSchema } from './assets/schema.js';
export { OUTCOME_EFFECTS, acceptance, contextTokens, parseResult, resolveReferences } from './assets/result-contract.js';
export { renderContext, renderSkillsBlock } from './assets/render-context.js';
export { loadContext, loadNoteRules, loadSkillRules, readNotes, readSkills, selectSkills } from './assets/prompt-files.js';
export { standFor, standTrace } from './assets/stand.js';
export { buildEnhancerRequest, collectStream, replacePrompt } from './assets/enhancer.js';
export { BLOCKS_CONTRACT, BLOCKS_PATH, DEFAULT_TOTAL_BUDGET, SELF_QUESTION_MARKERS, WEIGHTS_CONTRACT, WEIGHTS_SERVICE, buildHaystack, candidateBlocks, decisionBlocks, matchBlock, selectBlocks, validateRegistry, tokens as blockSelectTokens } from './assets/block-select.js';
export { LEARNED_CONTRACT, LEARNED_DEFAULT_PATH, PROPOSE_CONTRACT, PROPOSE_SERVICE, duplicateVsBlocks, mergeLearnedBlocks, validateBlockCore, validateLearnedFile, validateProposalShell } from './assets/block-review.js';
export { MAX_SALVAGE_SESSIONS, SALVAGE_CONTRACT, SALVAGE_MEMO_ID, SALVAGE_NAMESPACE, emptySalvage, salvageCountOf, validateSalvage, withSalvageCount } from './assets/salvage-store.js';
export { MAX_UNCERTAINTY, MIN_UNCERTAINTY, SELECTION_CONTRACT, parseSelection, renderCandidates, selectionSystemBrief } from './assets/selection.js';

// Die beiden Namen, die frueher in dieser Datei definiert waren: sie bleiben
// hier oeffentlich, weil Abnehmer sie ueber `@shinon/prompter` lesen — der
// Eigentuemer ist jetzt das Modul, das sie braucht.
export { readPrompt } from './assets/pre-step.js';
export { effectiveRoute } from './assets/runtime-state.js';
