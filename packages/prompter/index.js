import { readFileSync } from 'node:fs';
// Der host-half-Block verlangt diesen Import (Gate `host-half`); das Schema
// selbst liegt in `./assets/schema.js`.
import z from '@deepseek-ai/schemastery';
import { isAbsolute, join } from 'node:path';
import { parseNote, renderStand, reviewNotes, selectNotes, tokens } from './assets/note-core.js';
import { resolveWorkspaceRoot, fingerprintRoot } from './assets/workspace.js';

// ── Die Module dieses Pakets ────────────────────────────────────────────────
// Der Modulschnitt hat die Innenflaeche geteilt, nicht die Aussenflaeche: die
// oeffentlichen Namen unten sind dieselben wie vorher, und `index.js` bleibt die
// Host-Haelfte (Mount, Listener, Kontextbeschaffung, Index-Abfrage).
import { CONTEXT_CONTRACT, CONTEXT_STATES, CONTEXT_TAG, CONTRACT, DECISION_CHANNEL, INDEX_BUDGET_TOKENS, INDEX_CONTRACT, INDEX_SERVICE, INTENT_CLASSES, MODES, MODE_CAPABILITIES, MODE_DELTAS, NOTES_DIR_DEFAULT, NOTE_RULES_CONTRACT, NOTE_RULES_PATH, NOT_SUPPLIED, OPERATION_LABELS, POLICIES, PRE_STEP_EVENT, REQUIREMENT_OPERATIONS, SCORING_SERVICE, SCORING_SERVICE_CONTRACT, SKILLS_DIR_DEFAULT, SKILL_RULES_CONTRACT, SKILL_RULES_PATH, STAND_CONTRACT, UNTRUSTED_RULE, assertVocabulary, contextLabel, noContext, resolveMode, withContext } from './assets/mode-core.js';
import { Config as _imported_config_schema, ContextSchema, ResultSchema } from './assets/schema.js';
import { OUTCOME_EFFECTS, acceptance, contextTokens, parseResult, resolveReferences } from './assets/result-contract.js';
import { UNDEFINED, expandPrompt, resolveIntent } from './assets/intent-resolver.js';
import { addTurnDuration, decay, emptyMemory, feedback, feedbackOf, memorySummary, observe, semanticProfile, validateMemory, weightsFrom } from './assets/intent-memory.js';
import { renderContext, renderSkillsBlock } from './assets/render-context.js';
import { loadContext, loadJsonContract, loadNoteRules, loadSkillRules, notesDir, readNotes, readSkills, selectSkills } from './assets/prompt-files.js';
import { writeJsonFile } from './assets/learned-store.js';
import { readTone, standFor, standTrace } from './assets/stand.js';
import { buildEnhancerRequest, collectStream, enhanceGuarded, replacePrompt } from './assets/enhancer.js';
import { BLOCKS_CONTRACT, BLOCKS_PATH, WEIGHTS_CONTRACT, WEIGHTS_SERVICE, decisionBlocks, selectBlocks, validateRegistry } from './assets/block-select.js';
import { LEARNED_CONTRACT, PROPOSE_CONTRACT, PROPOSE_SERVICE, duplicateVsBlocks, mergeLearnedBlocks, validateBlockCore, validateLearnedFile, validateProposalShell } from './assets/block-review.js';

/** Das Global, in das der Host die letzten Entscheidungen legt (der Client liest es). */
export const TRACE_GLOBAL = '__shinonPrompterTrace';

/** Die Naht, ueber die dsh-host-webserver die Zeilen aller Haelften einsammelt. */
export const INDEX_INJECT = 'webserver/index-inject';

/** Der Live-Kanal des Trace-Panels (Server-Sent Events, gleiche Herkunft). */
export const TRACE_ENDPOINT = '/shinon/prompter/trace';

/** Kanal und Vertragsname der Narrative Engine (Zug 6). Literale Spiegel von `@shinon/narrative` (Naht, drift-geprueft). */
const NARRATIVE_CHANNEL = 'shinon/narrative/state';
const NARRATIVE_CONTRACT = 'shinon.narrative/v1';

/**
 * Der Zettel-Kern wird RE-EXPORTIERT, nicht nachgebaut: die reinen Funktionen
 * (lesen, waehlen, pruefen, rendern) sind ohne node_modules testbar, die
 * Host-Anbindung (Verzeichnis lesen) bleibt hier. Dieselbe Teilung wie bei
 * `@shinon/scoring` (Kern + Host) — die oeffentlichen Namen bleiben dieselben.
 */
export { parseNote, renderStand, reviewNotes, selectNotes, tokens };

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
 * → Kanon: docs/COMMENT-KANON.md#k-f4c0e94d7ce6
 */

/**
 * Die Dienste, die dieser Host braucht. Ohne deklarierte Injektion verweigert
 * Cordis den Zugriff auf `ctx.llm` (live gemessen im echten Boot: „cannot get
 * property \"llm\" without inject"). Der Fehler wurde korrekt zu einem
 * Verwerfen — der Host lief weiter und der Roh-Prompt galt —, aber der Enhancer
 * hat nie etwas veredelt, und ohne sichtbaren Lauf waere das nicht aufgefallen.
 * Genau so deklarieren es die mitgelieferten Hostplugins (dsh-agent-instructions
 * exportiert `inject` neben `Config` und `apply`).
 * → Kanon: docs/COMMENT-KANON.md#k-914a925b339b
 */

export const inject = ['llm'];

// #region zwilling:letzte-menschliche-nachricht — Besitzer: packages/prompter/index.js
/**
 * Die letzte MENSCHLICHE Nachricht mit Text — oder null.
 *
 * `source.kind === 'user'` ist der Unterschied zwischen Eingabe und Harness: der
 * Batch eines Schritts besteht oft AUSSCHLIESSLICH aus erzeugtem Kontext (Zeit,
 * Terminal, Instruktionen, Erinnerungen, Werkzeug-Feedback). Ohne diesen Test
 * waere die jeweils letzte Nachricht irgendein Harness-Text — und der wuerde
 * veredelt und ersetzt (Enhancer) bzw. als Auftrag gelesen (Router). Fremde
 * → Kanon: docs/COMMENT-KANON.md#k-b7a8cb95e475
 */
function lastHumanMessage(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (message?.role !== 'user') continue;
    if (message.source?.kind !== 'user') continue;
    const text = (Array.isArray(message.content) ? message.content : [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
    if (text.trim() === '') continue;
    return { message, text, index };
  }
  return null;
}
// #endregion zwilling:letzte-menschliche-nachricht

/**
 * Den zu verbessernden Prompt aus der Nutzlast holen: Nachricht, Text und Index
 * der letzten menschlichen Nachricht. Die Regel selbst steht in der
 * Zwillings-Region direkt darueber — bytegleich mit @shinon/task-router, geprueft
 * von `scripts/lib/repo.mjs` (SOURCE_TWINS) im Gate und im Build.
 */
export function readPrompt(payload) {
  return lastHumanMessage(payload?.messages);
}

/**
 * Die Abfrage-Faehigkeit einmal benennen, dann nicht mehr. Ein Fehler in einer
 * OPTIONALEN Quelle darf den Schritt nicht mit Warnungen fluten — aber einmal
 * gesagt werden muss er, sonst waere der stille Verzicht auf MAX unsichtbar.
 */
function warnIndex(runtime, detail) {
  if (runtime.indexWarned) return;
  runtime.indexWarned = true;
  console.error(`[shinon-prompter] Index-Kontext nicht nutzbar (${detail}) — MAX bleibt gesperrt`);
}

/**
 * Das Intent-Gedächtnis schreiben — der EINE Schreibweg des Hosts.
 *
 * Ein Schreibfehler darf den Schritt nie brechen: das Gedächtnis ist Erfahrung,
 * kein Vertrag. Er wird EINMAL gemeldet, damit ein kaputter Pfad sichtbar bleibt.
 */
function persistIntentMemory(runtime, path, memory) {
  if (typeof path !== 'string' || path === '' || memory === null) return;
  try {
    writeJsonFile(path, memory);
  } catch (error) {
    if (!runtime.intentWriteWarned) {
      runtime.intentWriteWarned = true;
      console.warn(`[shinon-prompter] Intent-Gedächtnis nicht schreibbar (${error?.message}) — Zählung nur im Speicher`);
    }
  }
}

/**
 * EINEN Turn ins Gedächtnis verbuchen — Beobachtung, Folge-Rückmeldung, Ablage.
 *
 * Die Rückmeldung kommt aus dem NÄCHSTEN Text derselben Sitzung: „passt" hebt
 * das vorige Pattern, „falsch" senkt es. So wird jede Interaktion Information,
 * ohne dass ein Modell befragt oder der Prompt-Text gespeichert wird.
 */
function recordIntent(config, runtime, promptText, resolution, sessionId, promptIndex) {
  if (runtime.intentMemory === null) return;
  const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '(ohne sitzung)';
  const previous = runtime.intentLast.get(key) ?? null;
  // EIN Input, EINE Beobachtung: der Hook feuert je SCHRITT, nicht je Turn —
  // ein Werkzeug-Loop saehe denselben Text sonst zehnmal. Die Position der
  // Nachricht ist der stabile Schluessel innerhalb eines Turns; zwischen Turns
  // waechst sie. Gemessen (2026-10-18): 6 Eingaben zaehlten als 26 Laeufe.
  const sameInput = previous !== null
    && previous.index === promptIndex
    && previous.text === promptText
    && Number.isInteger(promptIndex);
  if (sameInput) return;
  const polarity = previous !== null && previous.patternId !== null && previous.patternId !== undefined
    ? feedbackOf(promptText)
    : null;

  let memory = observe(runtime.intentMemory, {
    classification: resolution.classification,
    patternId: resolution.matched ? resolution.patternId : null,
    score: resolution.score ?? 0,
    features: Array.isArray(resolution.features) ? resolution.features : [],
    // Der TEXT geht in das Gedächtnis, nicht in die Ablage: `observe` liest nur
    // die Begriffe und schreibt sie als Klassen-Zählung. Kein Prompt wird gespeichert.
    text: promptText,
  }, new Date().toISOString());
  if (polarity !== null && previous !== null) memory = feedback(memory, previous.patternId, polarity);

  runtime.intentMemory = memory;
  runtime.intentLast.set(key, {
    patternId: resolution.matched ? resolution.patternId : null,
    classification: resolution.classification,
    index: Number.isInteger(promptIndex) ? promptIndex : -1,
    text: promptText,
  });
  persistIntentMemory(runtime, runtime.intentMemoryPath, memory);
}

/**
 * Den MAX-Kontext aus dem Project Index holen.
 *
 * Die Faehigkeit ist OPTIONAL und ihre Antwort ist eine Behauptung, bis sie
 * geprueft ist. Deshalb vier Richtungen, jede mit eigenem Grund:
 *
 *   kein Dienst        `MODE_NEEDS_CONTEXT` — es gibt keine Quelle. Das ist der
 *                      Normalfall in einem Profil ohne Project Index, kein Fehler.
 * → Kanon: docs/COMMENT-KANON.md#k-cf83279e4d43
 */
function indexContext(ctx, config, text, runtime) {
  let service;
  try {
    service = typeof ctx?.get === 'function' ? ctx.get(INDEX_SERVICE) : undefined;
  } catch {
    // Ein dienstloser Kontext wirft je nach Fassung statt `undefined` zu liefern.
    // Das ist die Abwesenheit, die hier gemeint ist — kein Grund zum Abbruch.
    service = undefined;
  }
  if (service === undefined || service === null) return noContext('MODE_NEEDS_CONTEXT');
  if (service.contract !== INDEX_CONTRACT || typeof service.resolveContext !== 'function') {
    warnIndex(runtime, `${INDEX_SERVICE} verletzt den Vertrag ${INDEX_CONTRACT}`);
    return noContext('CONTEXT_INVALID');
  }

  let raw;
  try {
    raw = service.resolveContext(text, { budgetTokens: config.indexBudgetTokens });
  } catch (error) {
    warnIndex(runtime, `${INDEX_SERVICE}: ${error?.message ?? error}`);
    return noContext('CONTEXT_INVALID');
  }
  if (raw === null || raw === undefined) return noContext('MODE_NEEDS_INDEX');

  try {
    const context = ContextSchema(raw);
    if (!runtime.indexSeen) {
      runtime.indexSeen = true;
      console.log(`[shinon-prompter] MAX-Kontext aus dem Index (${INDEX_SERVICE}, Budget ${config.indexBudgetTokens} Token)`);
    }
    return withContext(context, 'index');
  } catch (error) {
    warnIndex(runtime, `${INDEX_SERVICE}: ${error?.message ?? error}`);
    return noContext('CONTEXT_INVALID');
  }
}

/**
 * Woher der MAX-Kontext dieses Schritts kommt — genau eine Quelle, benannt.
 *
 * Eine konfigurierte Datei geht dem Index vor (sie ist die ausdrueckliche
 * Angabe), eine KAPUTTE Datei sperrt MAX vollstaendig statt auf den Index
 * auszuweichen: wer eine Quelle benennt, bekommt sie oder einen Grund.
 *
 * Der Index ist der Project Index — EIN Index fuer den Baum, kein zweiter.
 */
function maxContext(ctx, config, runtime, prompt) {
  if (runtime.contextState === 'invalid') return noContext('CONTEXT_INVALID');
  if (runtime.contextState === 'loaded') {
    runtime.lastBudgetTokens = config.indexBudgetTokens;
    runtime.lastContextChars = (runtime.context?.files ?? []).reduce((s, f) => s + (f?.content?.length ?? 0), 0);
    runtime.lastContextFiles = (runtime.context?.files ?? []).map((f) => f?.path);
    return withContext(runtime.context, 'file');
  }

  const projectResult = indexContext(ctx, config, prompt.text, runtime);
  if (projectResult.source !== 'none') return projectResult;

  return noContext('MODE_NEEDS_CONTEXT');
}

/**
 * Provenienz-Datensatz: was entschieden wurde, ohne den Prompt-Text zu kopieren.
 * Genau einer pro Schritt — auch im Randfall, damit die Spur nicht doppelt laeuft.
 *
 * `session_id` traegt die Zuordnung, nicht den Inhalt: der Task Router (§17) muss
 * die Klassifikation einem LEBENDEN Agenten zuordnen, und `ctx.goals` akzeptiert
 * nur die exakte Instanz der Registry — ueber die Sitzung ist sie eindeutig.
 * Ohne dieses Feld waere die Zuordnung ein Raten nach Reihenfolge.
 * → Kanon: docs/COMMENT-KANON.md#k-7bf397ab7eeb
 */
/**
 * Einen SALVAGED_PROSE-Fall zaehlen — je Sitzung, im Prozess.
 *
 * Der Zaehler ist die Messung fuer „zu oft": Grund, Zeichenzahl und der
 * wievielte Fall reisen mit dem Datensatz. Nach einem Host-Neustart beginnt
 * die Sitzung wieder bei 1; persistiert wird die Zahl absichtlich nicht —
 * sie beschreibt den Lauf, nicht den Workspace.
 */
function countSalvage(runtime, sessionId, salvage) {
  const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '(ohne sitzung)';
  const counts = runtime?.salvageCounts instanceof Map ? runtime.salvageCounts : null;
  const count = counts === null ? 1 : (counts.get(key) ?? 0) + 1;
  if (counts !== null) counts.set(key, count);
  return {
    reason: typeof salvage?.reason === 'string' && salvage.reason !== '' ? salvage.reason : 'NO_JSON',
    chars: Number.isInteger(salvage?.chars) ? salvage.chars : 0,
    answer_chars: Number.isInteger(salvage?.answerChars) ? salvage.answerChars : 0,
    count,
  };
}

function decisionRecord(contract, runtime, outcome, rawLength, sessionId, contextSource = 'none', contextUsed = false) {
  const result = outcome.result;
  // Nur ein ANGENOMMENER Prosafall zaehlt: ein zurueckgenommener Treffer
  // (missingMessage) ist keine Veredelung und darf „zu oft" nicht aufblaehen.
  const salvage = outcome.outcome === 'accepted' && outcome.salvage !== null && typeof outcome.salvage === 'object'
    ? countSalvage(runtime, sessionId, outcome.salvage)
    : null;
  const turn = runtime?.turn ?? null;
  // S1-Provenienz: Workspace-Identität, Quelle, Pfade, Budget, Gründe. Der
  // ROHE Nutzertext steht als `raw_prompt` ausdruecklich dabei — er ist die
  // Eingabe, deren Veredelung der Trace zeigen soll; Schluesselwerte nie.
  const ws = runtime?.workspace ?? null;
  return {
    contract: CONTRACT,
    session_id: typeof sessionId === 'string' ? sessionId : '',
    mode: contract.mode,
    outcome: outcome.outcome,
    reasons: outcome.reasons,
    context: contextLabel(contract.needsContext, runtime.contextState, contextUsed),
    context_source: contextSource,
    workspace: ws === null ? null : { root: ws.root, rootId: ws.rootId, source: ws.source },
    workspace_contract: ws === null ? null : ws.contract,
    context_budget_tokens: runtime?.lastBudgetTokens ?? null,
    context_chars: runtime?.lastContextChars ?? null,
    context_files: runtime?.lastContextFiles ?? null,
    // Die KLASSE ist Runtime-Eigentum: der Resolver hat sie aus dem Text
    // abgeleitet, bevor das Modell ueberhaupt gefragt wurde. Das Modell kann sie
    // nicht setzen — `intentClassification` ist kein Feld seines Vertrags mehr.
    intentClassification: turn?.resolution?.classification ?? null,
    intentReason: turn?.resolution?.reason ?? null,
    raw_prompt: turn?.rawPrompt ?? null,
    uncertainties: result?.uncertainties ?? [],
    references: result?.references ?? [],
    rawLength,
    enhancedLength: result?.enhancedPrompt?.length ?? 0,
    // Intent-Erweiterung (Zug 8): nur wenn aktiviert.
    expansion: runtime?.expansion ?? null,
    intentMatch: turn?.intentMatch ?? null,
    // Die Erfahrung als ZAHL: der gelernte Faktor, der auf das Pattern wirkte,
    // und die Merkmale, die den Treffer belegt haben. Kein Prompt-Text.
    intentBias: turn?.intentBias ?? null,
    // Der gelernte Semantik-Anteil dieses Textes: der zweite, dynamische Teil
    // des Gewichts neben der Rückmeldung — als Zahl, nie als Prompt-Inhalt.
    intentSemantic: turn?.intentSemantic ?? 0,
    intentFeatures: Array.isArray(turn?.intentFeatures) ? turn.intentFeatures : [],
    intentMemory: runtime?.intentMemory === null || runtime?.intentMemory === undefined
      ? null
      : memorySummary(runtime.intentMemory),
    // Prosa-Rettung: Grund, Zeichenzahl, Fallzahl — null, wenn keine Rettung.
    salvage,
  };
}

/**
 * Die gelernten Gewichte lesen — optional wie der Ton: kein `inject`, damit
 * der Veredler auch ohne Scoring montiert. Fremd oder unlesbar heißt still
 * null (fail-open); die Auswahl rechnet dann ohne Lernen weiter.
 */
function readBlockWeights(ctx) {
  let service;
  try {
    service = typeof ctx?.get === 'function' ? ctx.get(WEIGHTS_SERVICE) : undefined;
  } catch {
    service = undefined;
  }
  if (service === undefined || service === null) return null;
  if (service.contract !== WEIGHTS_CONTRACT || typeof service.read !== 'function') return null;
  try {
    const weights = service.read();
    return weights ?? null;
  } catch {
    return null;
  }
}

/**
 * Die WIRKSAME Route des One-Shots — einmal beim Mounten entschieden (Phase 5).
 *
 * Der eigene Schluessel (Namen-Feld `providerKeyEnv`, nie ein Wert) erlaubt dem
 * One-Shot eine getrennte Route und Abrechnung. Fehlt die Variable, faellt die
 * Route auf die konfigurierte Alternative zurueck — sonst waere der Enhancer
 * tot, obwohl ein Schluessel fuer die Haupt-Route da ist. Fehlt BEIDES, giltt
 * die Primärroute: dann meldet der Enhancer `NO_ROUTE` und der Roh-Prompt gilt
 * (fail-open, unveraendert). Rein: config + Umgebung, kein Modell, kein Netz.
 */
export function effectiveRoute(config) {
  const primary = { provider: config.provider, model: config.model };
  if (typeof config.providerKeyEnv !== 'string' || config.providerKeyEnv === '') return primary;
  const ownKey = process.env[config.providerKeyEnv];
  if (typeof ownKey === 'string' && ownKey !== '') return primary;
  if (typeof config.providerFallback !== 'string' || config.providerFallback === '') return primary;
  return {
    provider: config.providerFallback,
    model: typeof config.modelFallback === 'string' && config.modelFallback !== '' ? config.modelFallback : config.model,
  };
}

/**
 * Die Baustein-Auswahl dieses Schritts — fail-open, ohne Modell, ohne Text.
 *
 * Haystack aus Prompttext plus aufgelöstem Kontext, Intent-Klasse aus der
 * Expansion, Haltung aus dem Scoring-Ton, Gewichte aus dem Ledger. Fehlt die
 * Registry oder wirft die Auswahl, gibt es keinen Anteil statt eines falschen —
 * der Schritt läuft unverändert. Der Anteil nennt nur Baustein-Ids und Gründe.
 */
function blockSelection(ctx, config, runtime, contract, promptText, context, stance) {
  if (runtime.blocks === null) return null;
  try {
    return selectBlocks(runtime.blocks, {
      mode: contract.mode,
      promptText,
      context,
      intentClass: runtime.turn?.intentMatchClass ?? null,
      stance,
      weights: readBlockWeights(ctx),
      available: {
        contextPresent: context !== null,
        notesOn: runtime.noteRules !== null && config.notesPath !== '',
        skillsOn: runtime.skillRules !== null && config.skillsPath !== '',
        intentOn: runtime.intentRules !== null,
        narrative: runtime.narrative !== null,
        recentEvents: [],
      },
    });
  } catch {
    return null;
  }
}

/**
 * EINEN Baustein vorschlagen, prüfen, aktivieren (Phase 4) — fail-closed.
 *
 * Der Agent schlägt aus Erfahrung vor (Zettel-Hülle + Block-Kern); der Host
 * prüft die Hülle wie jeden Zettel (`parseNote` + `reviewNotes`: zu spitz mit
 * Datum/Sitzung/Absolutpfad, zu breit, doppelt) und den Kern gegen aktive
 * Bausteine (bekannte id, geteilte Begriffe plus Themenmarke). Nur was beides
 * besteht, landet in der Projekt-Ablage und mischt sich neu ein. Jeder Fehler
 * ist ein Befund, nie ein Wurf — die Aktivierung bleibt aus, statt zu raten.
 */
function proposeBlock(config, runtime, proposal) {
  try {
    const shell = validateProposalShell(proposal);
    if (!shell.ok) return { ok: false, findings: [shell.reason] };
    const core = validateBlockCore(proposal?.block);
    if (!core.ok) return { ok: false, findings: [core.reason] };
    const active = runtime.blocks?.blocks ?? [];
    if (active.some((entry) => entry.id === core.block.id)) {
      return { ok: false, findings: [`DOPPELT:bekannte-id:${core.block.id}`] };
    }
    if (runtime.noteRules === null) return { ok: false, findings: ['KEINE_REGELN'] };
    const parsed = parseNote(
      JSON.stringify({ contract: 'shinon.skill-note/v1', version: 1, ...shell.shell }),
      runtime.noteRules.format,
    );
    if (!parsed.ok) return { ok: false, findings: [`FORM_FEHLER:${parsed.reason}`] };
    const review = reviewNotes([{ file: `vorschlag:${core.block.id}`, note: parsed.note }], runtime.noteRules);
    const findings = [
      ...review.map((finding) => `${finding.finding}: ${finding.detail}`),
      ...duplicateVsBlocks(shell.shell, active, runtime.noteRules.review?.duplicate ?? {}),
    ];
    if (findings.length > 0) return { ok: false, findings };
    const path = runtime.learnedPath;
    if (typeof path !== 'string' || path === '') {
      return { ok: false, findings: ['KEINE_ABLAGE'] };
    }
    // Dieselbe Regel wie Zettel und Skills: ein absoluter Pfad bleibt absolut.
    const file = isAbsolute(path) ? path : join(process.cwd(), path);
    let current = [];
    try {
      current = validateLearnedFile(JSON.parse(readFileSync(file, 'utf8'))).blocks;
    } catch {
      current = [];
    }
    const next = [...current.filter((entry) => entry.id !== core.block.id), core.block];
    // Der eine Schreibweg (assets/learned-store.js): die Host-Komposition
    // bleibt frei von Dateisystem-Aufrufen, und die Zusage hat eine Adresse.
    writeJsonFile(file, { contract: LEARNED_CONTRACT, blocks: next });
    if (runtime.blocks !== null) {
      const merged = mergeLearnedBlocks(runtime.blocks.blocks, next);
      const check = validateRegistry({ contract: BLOCKS_CONTRACT, blocks: merged });
      if (!check.ok) return { ok: false, findings: [`ZUSAMMENFUEHRUNG_UNGUELTIG:${check.reason}`] };
      runtime.blocks = { ...runtime.blocks, blocks: merged };
    }
    console.log(`[shinon-prompter] Baustein gelernt: ${core.block.id}`);
    return { ok: true, findings: [], block: core.block.id };
  } catch (error) {
    return { ok: false, findings: [`FEHLER:${error?.message ?? error}`] };
  }
}

/** Der registrierte Listener. Genau ein `next()` — Durchreichen ist der Normalfall. */
async function onPreStep(ctx, config, runtime, payload, next) {
  // Die Uhr laeuft ab dem Hook-Eintritt: die Dauer je Pattern ist gemessen,
  // nicht geschaetzt — sie geht als Gesamtlaufzeit ins Intent-Gedächtnis.
  const turnStarted = Date.now();
  const prompt = readPrompt(payload);
  if (prompt === null) return next();
  const sessionId = payload?.agent?.session?.id;
  if (process.env.SHINON_INTENT_DEBUG === '1') {
    const header = payload?.agent?.session?.header ?? {};
    console.log(`[shinon-intent-debug] sid=${sessionId} header=${JSON.stringify(Object.keys(header))} source=${JSON.stringify(prompt.message?.source ?? null)} text=${JSON.stringify(prompt.text.slice(0, 40))}`);
  }

  // EIN aufgeloester Modus je Lauf: Faehigkeiten, Verbote, Kontextbedarf und
  // System-Prompt kommen aus einer Struktur statt aus fuenf `mode`-Vergleichen.
  const contract = resolveMode(config.mode);

  // Intent-Klassifikation (Zug 8, P2): der RUNTIME-RESOLVER entscheidet aus dem
  // Text, in JEDEM Modus und ohne Modellaufruf — auch wenn der One-Shot spaeter
  // scheitert, steht die Klasse im Datensatz. Die Expansion ist ein eigenes
  // Angebot und bleibt auf den Kontext-Modus begrenzt.
  //
  // Zu Beginn jedes Turns werden alle drei Felder neu gesetzt: kein Treffer des
  // vorigen Schritts darf stehen bleiben (gemessen als stale intentMatchClass).
  // P1: JEDER Turn bekommt ein frisches, isoliertes Turn-Objekt. Der Roh-Text
  // des Menschen steht darin, damit er im Trace verfuegbar ist; Treffer und
  // Klasse des vorigen Schritts koennen nicht stehen bleiben.
  runtime.turn = { rawPrompt: prompt.text, resolution: null, intentMatch: null, intentMatchClass: null, intentBias: null, intentSemantic: 0, intentFeatures: [] };
  let expandedText = prompt.text;
  if (runtime.intentRules !== null) {
    // Die GEWICHTE kommen aus der Gesamtlaufzeit: ein Pattern, das oft daneben
    // lag, braucht mehr Belege. Ohne Gedächtnis ist die Karte leer — dann
    // verhält sich der Resolver exakt wie vorher.
    const weights = runtime.intentMemory === null ? null : weightsFrom(runtime.intentMemory);
    // Das gelernte Begriffsprofil: welcher Begriff deutet auf welche Klasse.
    // Es ist die zweite Quelle des Gewichts und wirkt auf JEDEN Turn, auch ohne
    // Rückmeldung — damit wird jede Eingabe nutzbar, nicht nur die bestätigte.
    const lexicon = runtime.intentMemory === null ? null : semanticProfile(runtime.intentMemory);
    const resolution = resolveIntent(prompt.text, runtime.intentRules, { weights, lexicon });
    runtime.turn.resolution = resolution;
    runtime.turn.intentMatch = resolution.matched ? resolution.patternId : null;
    // UNDEFINED ist eine Aussage, keine Klasse: die Baustein-Auswahl bleibt leer.
    runtime.turn.intentMatchClass = resolution.classification === UNDEFINED ? null : resolution.classification;
    runtime.turn.intentBias = resolution.matched ? resolution.bias : null;
    runtime.turn.intentSemantic = resolution.semantic ?? 0;
    runtime.turn.intentFeatures = Array.isArray(resolution.features) ? resolution.features : [];
    // Jeder Input ist Information — auch der ohne Treffer (unmatched).
    recordIntent(config, runtime, prompt.text, resolution, payload?.agent?.session?.id, prompt.index);
    if (contract.needsContext && resolution.expansion !== '') {
      expandedText = expandPrompt(prompt.text, resolution);
      console.log(`[shinon-prompter] Intent erkannt: ${resolution.label} (${resolution.classification}) — Expansion angewendet`);
    } else if (resolution.matched) {
      console.log(`[shinon-prompter] Intent erkannt: ${resolution.label} (${resolution.classification}) — keine Expansion`);
    }
  }

  // EINE Quelle je Schritt, einmal aufgeloest: der Beleg nennt dieselbe Quelle,
  // die den Prompt veredelt hat. Zwei Abfragen koennten zwei Antworten geben.
  const supply = contract.needsContext
    ? maxContext(ctx, config, runtime, { ...prompt, text: expandedText })
    : NOT_SUPPLIED;

  if (contract.needsContext && supply.context === null) {
    // MAX ohne Kontext gibt es nicht: Code-Referenzen und Touches waeren
    // erfunden. Also wird der Modus abgelehnt, nicht weichgespuelt.
    const outcome = { outcome: 'unavailable', reasons: [supply.reason], result: null };
    report(ctx, config, runtime, { ...decisionRecord(contract, runtime, outcome, prompt.text.length, sessionId), stand: null, blocks: decisionBlocks(blockSelection(ctx, config, runtime, contract, expandedText, null, null)) });
    return next();
  }

  const contextUsed = contract.needsContext;
  // Der Stand wird aus dem AUFGELOESTEN Kontext gebaut — dieselbe Naht, die den
  // Kontext geliefert hat, kein zweiter Weg. Ohne Kontext kein Stand (dann hat
  // kein Zettel einen Anlass, und die Thema-Marke waere geraten). Der Ton kommt
  // aus der zweiten schmalen Faehigkeit (Scoring); fehlt sie, fehlt der Ton,
  // nicht der Stand.
  const toneState = readTone(ctx, runtime);
  const stance = toneState?.tone?.stance ?? null;
  const selection = blockSelection(ctx, config, runtime, contract, expandedText, supply.context, stance);
  const stand = contextUsed ? standFor(config, runtime, expandedText, supply.context, toneState) : null;

  // Skills werden IMMER gelesen (Zug 6): unabhaengig vom Modus, unabhaengig vom
  // Kontext. Sie geben dem Modell Zugriff auf projekspezifisches Wissen.
  let skills = [];
  if (runtime.skillRules !== null) {
    try {
      const skillRead = readSkills(config, runtime.skillRules);
      if (skillRead.skills.length > 0) {
        // `explicitText` ist der NUTZERTEXT, nicht `expandedText`: die
        // Intent-Erweiterung stammt aus `assets/intent-rules.json`, also aus
        // einer Regeldatei. Ein Skill-Name, der nur dort steht, ist keine
        // ausdrückliche Nennung durch den Menschen — er darf nicht den
        // Prioritätsrang vor besser passenden Skills bekommen. `stand.js`
        // übergibt aus demselben Grund `promptText`; beide Stellen antworten
        // auf dieselbe Frage und müssen dieselbe Antwort geben.
        const selected = selectSkills(skillRead.skills, [expandedText], {
          ...(runtime.skillRules.reading ?? {}),
          explicitText: prompt.text,
        });
        skills = selected.loaded;
        if (skills.length > 0) {
          console.log(`[shinon-prompter] Skills injiziert: ${skills.map((s) => s.name).join(', ')}`);
        }
      }
    } catch (error) {
      console.warn(`[shinon-prompter] Skills konnten nicht gelesen werden (${error?.message})`);
    }
  }

  // Aktions-Check (P3): klare CHAT- und LOOKUP-Turns brauchen keine Veredelung.
  // Sie werden DIREKT durchgereicht — der Prompter greift (er entscheidet und
  // protokolliert), ohne einen Modellaufruf zu bezahlen und ohne das Modell zu
  // bitten, eine Antwort zu schreiben, die dann den Prompt ersetzen wuerde.
  const direct = contract.mode !== undefined && runtime.turn?.resolution !== null
    && runtime.turn?.resolution !== undefined
    && ['CHAT', 'LOOKUP'].includes(runtime.turn.resolution.classification);
  const outcome = direct
    ? {
      outcome: 'accepted',
      reasons: ['NO_ENHANCEMENT_NEEDED'],
      result: { enhancedPrompt: prompt.text, preservedIntent: true, addedRequirements: [], removedRequirements: [], uncertainties: [], references: [] },
    }
    : await enhanceGuarded(ctx, contract, { ...config, ...runtime.route }, expandedText, supply.context, stand, skills, payload.signal);
  if (direct) console.log(`[shinon-prompter] Direkt durchgereicht (${runtime.turn.resolution.classification}) — kein One-Shot`);

  // Ab hier gehoert der Ablauf dem Loop: ein Fehler von next() bleibt SEIN Fehler
  // und darf nicht in einen zweiten next() umgedeutet werden.
  const decision = await next();

  // Ein Ausgang ausserhalb der Tabelle kann nur aus unserem eigenen Code kommen;
  // der Rueckfall ist die Durchreiche, damit ein solcher Fall nie den Schritt
  // bricht — dieselbe Fail-Richtung wie im ganzen Paket.
  const effect = OUTCOME_EFFECTS[outcome.outcome] ?? OUTCOME_EFFECTS.rejected;
  const messages = effect.replacePrompt
    ? replacePrompt(decision?.messages, prompt.message, outcome.result.enhancedPrompt)
    : null;

  // Ersetzen kann nur, wer die Nachricht findet. Hier wird aus einem ANGENOMMENEN
  // Ergebnis ein `rejected`-Datensatz — die einzige Stelle, an der sich der
  // Ausgang nachtraeglich aendert, und der Grund dafuer ist der TABELLEN-Wert
  // `missingMessage` (nicht ein zweites Verwerfen des Modells). Am Prompt-Text
  // aendert das nichts: ohne gefundene Nachricht wird nichts geschrieben.
  const recorded = effect.replacePrompt && messages === null
    ? { ...outcome, outcome: 'rejected', reasons: effect.missingMessage }
    : outcome;
  // Die zweite Hälfte der Gesamtlaufzeit: die Dauer fällt erst nach dem Turn an
  // und hängt an demselben Pattern, das die Beobachtung verbucht hat.
  if (runtime.intentMemory !== null && runtime.turn?.intentMatch) {
    runtime.intentMemory = addTurnDuration(runtime.intentMemory, runtime.turn.intentMatch, Date.now() - turnStarted);
    persistIntentMemory(runtime, runtime.intentMemoryPath, runtime.intentMemory);
  }
  report(ctx, config, runtime, { ...decisionRecord(contract, runtime, recorded, prompt.text.length, sessionId, supply.source, contextUsed), stand: standTrace(stand), blocks: decisionBlocks(selection) });

  // Nur ein gefundenes akzeptiertes Ergebnis ersetzt die Nutzernachricht. In
  // JEDEM anderen Fall geht die Entscheidung unveraendert weiter — der Roh-Prompt
  // bleibt stehen, und der Grund steht im Entscheidungsdatensatz
  // (DECISION_CHANNEL). Diese Funktion haengt nie einen eigenen Prompt ein.
  return messages === null ? decision : { ...decision, messages };
}

/** Entscheidung emittieren und in die Fenster-Konvention schreiben. */
function report(ctx, config, runtime, record) {
  if (!config.trace) return;
  // Der ROHE Nutzertext gehoert in den Trace: ohne ihn ist nicht nachvollziehbar,
  // WAS veredelt wurde. JSON.stringify haelt die Zeile einzeilig und vollstaendig.
  // Pattern, Erfahrungsfaktor und Merkmale stehen mit in der Zeile: ohne sie ist
  // ein Lauf mit und ohne Gedächtnis nicht unterscheidbar (gemessen am E2E-Lauf).
  const pattern = record.intentMatch ?? '-';
  const bias = record.intentBias === null || record.intentBias === undefined ? '-' : record.intentBias;
  const features = Array.isArray(record.intentFeatures) && record.intentFeatures.length > 0
    ? record.intentFeatures.join('+')
    : '-';
  const semantic = record.intentSemantic === null || record.intentSemantic === undefined ? '-' : record.intentSemantic;
  const salvage = record.salvage === null || record.salvage === undefined
    ? ''
    : ` salvage=${record.salvage.reason} chars=${record.salvage.chars} n=${record.salvage.count}`;
  console.log(`[shinon-prompter] Trace: ${record.outcome} intent=${record.intentClassification ?? 'UNDEFINED'} pattern=${pattern} bias=${bias} sem=${semantic} features=${features} raw=${JSON.stringify(record.raw_prompt ?? '')}${salvage}`);
  // Der Puffer ist die Quelle des Panels: der Kanal allein erreicht den Browser
  // nicht (Host-Events ueberqueren den Carrier nicht), also legt der Host die
  // letzten Entscheidungen als Global in die naechste index.html.
  const trace = runtime?.trace;
  if (Array.isArray(trace)) {
    trace.unshift({
      outcome: record.outcome,
      mode: record.mode,
      reasons: record.reasons,
      context_source: record.context_source ?? null,
      intent: record.intentClassification ?? 'UNDEFINED',
      intent_pattern: record.intentMatch ?? null,
      intent_bias: record.intentBias ?? null,
      intent_semantic: record.intentSemantic ?? 0,
      intent_features: record.intentFeatures ?? [],
      raw_prompt: record.raw_prompt ?? null,
      salvage: record.salvage ?? null,
      at: Date.now(),
    });
    trace.length = Math.min(trace.length, 20);
    // Live an die offenen Panels; ohne Verbindung bleibt der Puffer die Quelle.
    const sse = runtime?.sse;
    if (sse !== undefined) for (const response of sse) {
      try { response.write(`data: ${JSON.stringify(trace)}\n\n`); } catch { /* Verbindung weg */ }
    }
  }
  if (record.outcome !== 'accepted') {
    const detail = record.reasons.join(', ');
    if (record.outcome === 'unavailable') console.warn(`[shinon-prompter] nicht verfuegbar (${detail}) — Roh-Prompt gilt`);
    else console.warn(`[shinon-prompter] verworfen (${detail}) — Roh-Prompt gilt`);
  }
  try {
    if (typeof ctx?.emit === 'function') ctx.emit(DECISION_CHANNEL, record);
  } catch (error) {
    // Gemessen: ein werfender Zuhoerer kommt bis hierher durch. Die Entscheidung
    // ist gefallen, die Spur ist Nebensache — sie darf den Schritt nicht mitreissen.
    console.error(`[shinon-prompter] Spur nicht zustellbar (${error?.message}) — Entscheidung bleibt`);
  }
  // Fenster-Konvention (NUR In-Prozess-Fall): die letzten Entscheidungen in
  // `window.__shinonPrompterTrace` spiegeln. Das trägt genau dann, wenn Host
  // und Panel dieselbe Realm teilen — in Produktion (Host in Node) ist hier
  // kein `window`, und die Seite lebt vom `DECISION_CHANNEL`-Abo der
  // Client-Hälfte (`packages/prompter/client.js`). Fail-open.
  try {
    const w = globalThis?.window;
    if (w !== undefined) {
      const list = Array.isArray(w.__shinonPrompterTrace) ? w.__shinonPrompterTrace : [];
      list.unshift({
        outcome: record.outcome,
        mode: record.mode,
        reasons: record.reasons?.slice(0, 5) ?? [],
        context_source: record.context_source ?? null,
        salvage: record.salvage ?? null,
        at: record.session_id ? Date.now() : null,
      });
      w.__shinonPrompterTrace = list.slice(0, 20);
    }
  } catch { /* die Spur ist Nebensache; das Fenster darf den Schritt nicht brechen */ }
}

/**
 * Registriert den Enhancer. Ohne `ctx.on` oder ohne den Event-Namen: keine
 * Registrierung, laut.
 *
 * Der Kontext wird EINMAL beim Mounten geladen und validiert. Ein unlesbarer
 * Kontext sperrt MAX, statt es mit halben Daten zu betreiben. Die
 * Index-Faehigkeit wird hier NICHT geprueft: sie wird je Schritt ueber `ctx.get`
 * geholt (§17: Dienste erscheinen in Fiber-Reihenfolge, ein Blick beim Mounten
 * saehe sie faelschlich als abwesend).
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

  let context = null;
  let contextState = 'absent';
  if (config.contextPath !== '') {
    try {
      context = loadContext(config.contextPath);
      contextState = 'loaded';
    } catch (error) {
      contextState = 'invalid';
      console.error(`[shinon-prompter] Kontext nicht verwendbar (${error?.message}) — MAX bleibt gesperrt`);
    }
  }

  // Der Zustand wird hier EINMAL gegen sein Vokabular geprueft: danach ist
  // `contextState` ein bekannter Wert, und `contextLabel` braucht keinen Fallback.
  // Die Zettel-Regeln werden EINMAL beim Mounten geladen (wie der Kontext):
  // eine fehlende Regeldatei sperrt das Lesen der Zettel, nicht den Enhancer.
  // Was sie nicht sperrt, ist ein Zettel: ohne Regeln laedt keiner.
  let noteRules = null;
  if (config.notesPath !== '') {
    try {
      noteRules = loadNoteRules();
    } catch (error) {
      console.error(`[shinon-prompter] Zettel-Regeln nicht verwendbar (${error?.message}) — es wird kein Zettel geladen`);
    }
  }

  // Die Skill-Regeln werden ebenfalls EINMAL beim Mounten geladen. Ein fehlendes
  // .agents/skills/ ist KEIN Defekt: Skills gehören dem Projekt, nicht dem
  // Enhancer, und ein Projekt ohne Skills läuft einfach ohne Skill-Block (fail-open).
  let skillRules = null;
  if (config.skillsPath !== '') {
    try {
      skillRules = loadSkillRules();
    } catch (error) {
      console.error(`[shinon-prompter] Skill-Regeln nicht verwendbar (${error?.message}) — kein Skill wird geladen`);
    }
  }

  // S1: DIE EINE Workspace-Identität — explizite Config > Env > cwd.
  // Prompter und Project Index hängen am selben aktiven Workspace; cwd allein
  // bestimmt nie still die Projektidentität. Quelle, Pfad und Budget stehen im
  // Mount-Log und in jedem Entscheidungsdatensatz (Provenienz ohne Inhalte).
  const _ws = resolveWorkspaceRoot({ configRoot: config.workspaceRoot ?? '', env: process.env });
  const _fp = fingerprintRoot(_ws.root);
  const workspace = { ..._fp, source: _ws.source };
  console.log(`[shinon-prompter] Workspace: ${workspace.root} (id ${workspace.rootId}, quelle ${workspace.source})`);

  // MAX-Quellen (S1): konfigurierte Datei > Project Index. Der Project Index
  // traegt den Baum ohnehin (eigener Host, eigener Dienst); ein zweiter Index
  // im Prompter waere dieselbe Arbeit mit anderem Speicherformat.

  // Intent-Patterns (Zug 8): Trigger → Expansion, nur wenn aktiviert.
  let intentRules = null;
  if (config.intentPatternsPath !== '') {
    try {
      intentRules = loadJsonContract(config.intentPatternsPath, 'shinon.intent-rules/v1', (parsed) => parsed);
      console.log(`[shinon-prompter] Intent-Patterns geladen (${intentRules.patterns.length} Patterns)`);
    } catch (error) {
      console.warn(`[shinon-prompter] Intent-Patterns nicht ladbar (${error?.message}) — keine Expansion`);
    }
  }

  assertVocabulary('context state', contextState, CONTEXT_STATES);
  // Narrative-Lage (Zug 6): der Composite der Narrative Engine kommt auf einem
  // EIGENEN Kanal. Der Prompter hält den letzten und gibt ihn in den Stand;
  // ohne Composite kein <narrative>-Element. Er interpretiert ihn nicht um.
  // Baustein-Registry (Phase 1/2): reine Daten, einmal beim Mounten geladen
  // und geprüft. Fehlt sie, fehlt die Auswahl — nicht der Enhancer (fail-open).
  let blocks = null;
  try {
    const loaded = loadJsonContract(BLOCKS_PATH, BLOCKS_CONTRACT, (parsed) => parsed);
    const check = validateRegistry(loaded);
    if (!check.ok) {
      console.error(`[shinon-prompter] Baustein-Registry unbrauchbar (${check.reason}) — ohne Auswahl`);
    } else {
      blocks = loaded;
      console.log(`[shinon-prompter] Baustein-Registry geladen (${blocks.blocks.length} Bausteine)`);
    }
  } catch (error) {
    console.warn(`[shinon-prompter] Baustein-Registry nicht ladbar (${error?.message}) — ohne Auswahl`);
  }

  // Gelernte Bausteine (Phase 4): Projekt-Ablage über der Paket-Registry.
  // Fehlt sie, steht die Registry wie ausgeliefert; ist sie kaputt, fällt sie
  // mit Zählung weg statt zu raten (fail-closed, wie überall in dieser Schicht).
  let learnedBlocks = [];
  if (typeof config.blocksLearnedPath === 'string' && config.blocksLearnedPath !== '') {
    try {
      const learnedFile = isAbsolute(config.blocksLearnedPath)
        ? config.blocksLearnedPath
        : join(process.cwd(), config.blocksLearnedPath);
      const raw = readFileSync(learnedFile, 'utf8');
      const checked = validateLearnedFile(JSON.parse(raw));
      if (checked.foreign) {
        console.warn(`[shinon-prompter] Gelernte Bausteine fremd (${config.blocksLearnedPath}) — ohne Gelernte`);
      } else {
        learnedBlocks = checked.blocks;
        if (checked.dropped > 0) {
          console.warn(`[shinon-prompter] ${checked.dropped} unlesbare gelernte Bausteine uebergangen`);
        }
        if (learnedBlocks.length > 0) console.log(`[shinon-prompter] Gelernte Bausteine geladen (${learnedBlocks.length})`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[shinon-prompter] Gelernte Bausteine nicht lesbar (${error?.message}) — ohne Gelernte`);
      }
    }
  }
  if (blocks !== null && learnedBlocks.length > 0) {
    const merged = mergeLearnedBlocks(blocks.blocks, learnedBlocks);
    const check = validateRegistry({ contract: BLOCKS_CONTRACT, blocks: merged });
    if (!check.ok) {
      console.error(`[shinon-prompter] Zusammenführung unbrauchbar (${check.reason}) — ohne Gelernte`);
    } else {
      blocks = { ...blocks, blocks: merged };
    }
  }

  // Route (Phase 5): eigener Schluessel des One-Shots, sonst Fallback — EINMAL
  // beim Mounten entschieden, nicht je Schritt (die Umgebung ist beim Start die
  // Quelle, nicht waehrend des Laufs).
  const route = effectiveRoute(config);
  const ownKeyMissing = config.providerKeyEnv !== '' && process.env[config.providerKeyEnv] === undefined && route.provider !== config.provider;
  if (ownKeyMissing) {
    console.warn(`[shinon-prompter] Eigener Schluessel fehlt (${config.providerKeyEnv}) — One-Shot faellt auf ${route.provider}/${route.model} zurueck`);
  }

  // Intent-Gedächtnis: einmal beim Mounten geladen, je Turn verbucht, nach dem
  // Turn geschrieben. Fehlt die Datei, ist das kein Fehler — der erste Lauf
  // legt sie an. Ein fremder Vertrag wird nicht übernommen (fail-closed).
  let intentMemory = null;
  let intentMemoryPath = '';
  if (typeof config.intentMemoryPath === 'string' && config.intentMemoryPath !== '') {
    intentMemoryPath = isAbsolute(config.intentMemoryPath) ? config.intentMemoryPath : join(workspace.root, config.intentMemoryPath);
    try {
      const checked = validateMemory(JSON.parse(readFileSync(intentMemoryPath, 'utf8')));
      if (checked.foreign) {
        console.warn(`[shinon-prompter] Intent-Gedächtnis fremd (${config.intentMemoryPath}) — neuer Stand`);
        intentMemory = emptyMemory(new Date().toISOString());
      } else {
        intentMemory = decay(checked.memory);
        if (checked.dropped > 0) console.warn(`[shinon-prompter] ${checked.dropped} unlesbare Intent-Einträge übergangen`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[shinon-prompter] Intent-Gedächtnis nicht lesbar (${error?.message}) — neuer Stand`);
      }
      intentMemory = emptyMemory(new Date().toISOString());
    }
  }

  const runtime = { context, contextState, noteRules, skillRules, intentRules, intentMemory, intentMemoryPath, intentLast: new Map(), intentWriteWarned: false, turn: null, trace: [], blocks, learnedPath: config.blocksLearnedPath ?? '', route, narrative: null, narrativeContract: NARRATIVE_CONTRACT, workspace, lastBudgetTokens: null, lastContextChars: null, lastContextFiles: null, salvageCounts: new Map() };
  if (intentMemory !== null) {
    const summary = memorySummary(intentMemory);
    console.log(`[shinon-prompter] Intent-Gedächtnis: ${summary.runs} Läufe, ${summary.matched} Treffer, ${summary.patterns} Patterns, ${summary.unmatched} ohne Treffer, Lexikon ${summary.terms} Begriffe (${summary.classifiedTerms} eingeordnet), ${summary.unclaimed} unbeansprucht`);
  }
  const dispose = ctx.on(PRE_STEP_EVENT, (payload, next) => onPreStep(ctx, config, runtime, payload, next));
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

  const routeLabel = route.provider === '' || route.model === '' ? 'ohne Route (inaktiv)' : `${route.provider}/${route.model}`;
  const mode = resolveMode(config.mode);
  const contextInfo = mode.needsContext ? `context=${contextState}` : `context=${contextState} (${mode.mode} nutzt ihn nicht)`;
  const notesInfo = config.notesPath === '' ? 'notes=off' : `notes=${notesDir(config)}${noteRules === null ? ' (ohne Regeln)' : ''}`;
  const intentInfo = intentRules !== null
    ? `intent=${intentRules.patterns.length}Patterns`
    : 'intent=off';
  const blocksInfo = blocks !== null
    ? `blocks=${blocks.blocks.length}Bausteine`
    : 'blocks=off';
  console.log(`[shinon-prompter] Aktiviert — registriert auf ${PRE_STEP_EVENT} (mode=${config.mode}, route=${routeLabel}, ${contextInfo}, ${notesInfo}, ${intentInfo}, ${blocksInfo})`);

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

  return () => {
    if (typeof dispose === 'function') dispose();
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
export { CONTEXT_CONTRACT, CONTEXT_TAG, CONTRACT, DECISION_CHANNEL, INDEX_BUDGET_TOKENS, INDEX_CONTRACT, INDEX_SERVICE, INTENT_CLASSES, MODES, MODE_CAPABILITIES, MODE_DELTAS, NOTES_DIR_DEFAULT, NOTE_RULES_CONTRACT, NOTE_RULES_PATH, OPERATION_LABELS, POLICIES, PRE_STEP_EVENT, REQUIREMENT_OPERATIONS, SCORING_SERVICE, SCORING_SERVICE_CONTRACT, SKILLS_DIR_DEFAULT, SKILL_RULES_CONTRACT, SKILL_RULES_PATH, STAND_CONTRACT, UNTRUSTED_RULE };
export { ContextSchema, ResultSchema };
export { OUTCOME_EFFECTS, acceptance, contextTokens, parseResult, resolveReferences };
export { renderContext, renderSkillsBlock };
export { loadContext, loadNoteRules, loadSkillRules, readNotes, readSkills, selectSkills };
export { standFor, standTrace };
export { buildEnhancerRequest, collectStream, replacePrompt };
export { BLOCKS_CONTRACT, BLOCKS_PATH, DEFAULT_TOTAL_BUDGET, SELF_QUESTION_MARKERS, WEIGHTS_CONTRACT, WEIGHTS_SERVICE, buildHaystack, candidateBlocks, decisionBlocks, matchBlock, selectBlocks, validateRegistry, tokens as blockSelectTokens } from './assets/block-select.js';
export { LEARNED_CONTRACT, LEARNED_DEFAULT_PATH, PROPOSE_CONTRACT, PROPOSE_SERVICE, duplicateVsBlocks, mergeLearnedBlocks, validateBlockCore, validateLearnedFile, validateProposalShell } from './assets/block-review.js';
export { MAX_UNCERTAINTY, MIN_UNCERTAINTY, SELECTION_CONTRACT, parseSelection, renderCandidates, selectionSystemBrief } from './assets/selection.js';
