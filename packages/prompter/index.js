import { readFileSync, readdirSync } from 'node:fs';
import z from '@deepseek-ai/schemastery';
import { isAbsolute, join } from 'node:path';
import { parseNote, renderStand, reviewNotes, selectNotes, tokens } from './assets/note-core.js';
import { resolveWorkspaceRoot, fingerprintRoot } from './assets/workspace.js';
import {
  createIndex,
  loadIndex as loadRuntimeIndex,
  saveIndex as saveRuntimeIndex,
  indexDirectory as autoIndexDirectory,
  getContext as runtimeGetContext,
  matchIntent as runtimeMatchIntent,
  writeJsonFile,
  RUNTIME_INDEX_CONTRACT as RUNTIME_INDEX_CONTRACT_NAME,
} from './assets/index-manager.js';

// ── Die Module dieses Pakets ────────────────────────────────────────────────
// Der Modulschnitt hat die Innenflaeche geteilt, nicht die Aussenflaeche: die
// oeffentlichen Namen unten sind dieselben wie vorher, und `index.js` bleibt die
// Host-Haelfte (Mount, Listener, Kontextbeschaffung, Index-Pflege).
import { CONTEXT_CONTRACT, CONTEXT_SOURCES_RUNTIME, CONTEXT_STATES, CONTEXT_TAG, CONTRACT, DECISION_CHANNEL, INDEX_BUDGET_TOKENS, INDEX_CONTRACT, INDEX_SERVICE, INTENT_CLASSES, MODES, MODE_CAPABILITIES, MODE_DELTAS, NOTES_DIR_DEFAULT, NOTE_RULES_CONTRACT, NOTE_RULES_PATH, NOT_SUPPLIED, OPERATION_LABELS, POLICIES, PRE_STEP_EVENT, REQUIREMENT_OPERATIONS, SCORING_SERVICE, SCORING_SERVICE_CONTRACT, SKILLS_DIR_DEFAULT, SKILL_RULES_CONTRACT, SKILL_RULES_PATH, STAND_CONTRACT, UNTRUSTED_RULE, assertVocabulary, contextLabel, noContext, resolveMode, withContext } from './assets/mode-core.js';
import { Config as _imported_config_schema, ContextSchema, ResultSchema } from './assets/schema.js';
import { OUTCOME_EFFECTS, acceptance, contextTokens, parseResult, resolveReferences } from './assets/result-contract.js';
import { renderContext, renderSkillsBlock } from './assets/render-context.js';
import { loadContext, loadJsonContract, loadNoteRules, loadSkillRules, notesDir, readNotes, readSkills, selectSkills } from './assets/prompt-files.js';
import { readTone, standFor, standTrace } from './assets/stand.js';
import { buildEnhancerRequest, collectStream, enhanceGuarded, replacePrompt } from './assets/enhancer.js';
import { BLOCKS_CONTRACT, BLOCKS_PATH, WEIGHTS_CONTRACT, WEIGHTS_SERVICE, decisionBlocks, selectBlocks, validateRegistry } from './assets/block-select.js';
import { LEARNED_CONTRACT, PROPOSE_CONTRACT, PROPOSE_SERVICE, duplicateVsBlocks, mergeLearnedBlocks, validateBlockCore, validateLearnedFile, validateProposalShell } from './assets/block-review.js';

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

// #region zwilling:letzte-menschliche-nachricht — Besitzer: packages/prompter/index.js
/**
 * Die letzte MENSCHLICHE Nachricht mit Text — oder null.
 *
 * `source.kind === 'user'` ist der Unterschied zwischen Eingabe und Harness: der
 * Batch eines Schritts besteht oft AUSSCHLIESSLICH aus erzeugtem Kontext (Zeit,
 * Terminal, Instruktionen, Erinnerungen, Werkzeug-Feedback). Ohne diesen Test
 * waere die jeweils letzte Nachricht irgendein Harness-Text — und der wuerde
 * veredelt und ersetzt (Enhancer) bzw. als Auftrag gelesen (Router). Fremde
 * Herkunft heisst deshalb: nicht anfassen.
 *
 * Die Nachricht kommt MIT zurueck, weil ein Aufrufer sie ueber ihre Identitaet
 * wiederfinden muss — ueber einen Index zu raten waere ein stiller Fehler. Der
 * Text ist UNGETRIMMT; was ein Aufrufer davon will, entscheidet er.
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
 * Den MAX-Kontext aus dem Project Index holen.
 *
 * Die Faehigkeit ist OPTIONAL und ihre Antwort ist eine Behauptung, bis sie
 * geprueft ist. Deshalb vier Richtungen, jede mit eigenem Grund:
 *
 *   kein Dienst        `MODE_NEEDS_CONTEXT` — es gibt keine Quelle. Das ist der
 *                      Normalfall in einem Profil ohne Project Index, kein Fehler.
 *   falscher Vertrag   `CONTEXT_INVALID` — wer unter diesem Namen etwas anderes
 *                      anbietet, liefert keine Projektkenntnis.
 *   `null`             `MODE_NEEDS_INDEX` — der Index ist noch nicht da. Eine
 *                      eigene Ursache, weil sie sich von selbst behebt: der
 *                      naechste Schritt hat ihn.
 *   unbrauchbar        `CONTEXT_INVALID` — Wurf oder Formverstoss. Geprueft wird
 *                      gegen DENSELBEN `ContextSchema` wie die Datei, damit es
 *                      fuer MAX genau eine gueltige Form gibt.
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
 * Fallback: Wenn der Project Index nicht verfuegbar ist, aber der
 * Runtime-Index geladen wurde, wird dieser genutzt.
 */
function maxContext(ctx, config, runtime, prompt) {
  if (runtime.contextState === 'invalid') return noContext('CONTEXT_INVALID');
  if (runtime.contextState === 'loaded') {
    runtime.lastBudgetTokens = config.indexBudgetTokens;
    runtime.lastContextChars = (runtime.context?.files ?? []).reduce((s, f) => s + (f?.content?.length ?? 0), 0);
    runtime.lastContextFiles = (runtime.context?.files ?? []).map((f) => f?.path);
    return withContext(runtime.context, 'file');
  }

  // Runtime-Index zuerst: der Prompter pflegt seinen eigenen Index, der
  // hash-basiert und session-lokal ist. Project-Index nur als Fallback,
  // wenn der Runtime-Index noch leer ist (noch nichts indexiert wurde).
  if (runtime.runtimeIndex !== null && runtime.runtimeIndex.entries.size > 0) {
    try {
      // Das Budget gilt HIER genauso wie im Project-Index-Pfad: gemessen am
      // 2026-10-16 baute dieser Aufruf ohne Grenze eine 1.46-MB-Nachricht und
      // lief damit in sein eigenes 15-s-Limit (NO_JSON fuer jeden Prompt).
      const ctxData = runtimeGetContext(runtime.runtimeIndex, prompt.text, {
        maxFiles: config.indexMaxFiles,
        budgetTokens: config.indexBudgetTokens,
      });
      const context = ContextSchema({
        project: 'Shinon-forge',
        files: ctxData.files,
        symbols: ctxData.symbols ?? [],
        constraints: [],
        touches: [],
        dependencies: [],
      });
      // S1: Budget-Provenienz am tatsächlichen Request — Zeichen-Näherung
      // (Token ≈ Zeichen/4), Dateizahl, Quelle. Das Budget gilt VOR dem
      // Modellaufruf; was es reißt, steht im Datensatz, nicht im Text.
      runtime.lastBudgetTokens = config.indexBudgetTokens;
      runtime.lastContextChars = ctxData.chars;
      runtime.lastContextFiles = ctxData.files.map((f) => f.path);
      if (!runtime.runtimeIndexSeen) {
        runtime.runtimeIndexSeen = true;
        console.log(`[shinon-prompter] MAX-Kontext aus Runtime-Index (${ctxData.count}/${ctxData.totalEntries} Dateien, ${ctxData.chars} Zeichen, Budget ${config.indexBudgetTokens} Token)`);
      }
      return withContext(context, 'runtime');
    } catch (error) {
      console.error(`[shinon-prompter] Runtime-Index-Kontext fehlerhaft (${error?.message})`);
      return noContext('CONTEXT_INVALID');
    }
  }

  // Project-Index als Fallback: wenn Runtime-Index nicht geladen oder leer.
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
 *
 * `context_source` nennt die QUELLE, die den Kontext geliefert hat (`index` |
 * `file` | `none`), waehrend `context` sagt, wie es ihr erging. Zwei Felder, weil
 * es zwei Fragen sind: „hat MAX einen Kontext benutzt" und „woher kam er".
 * Ohne das zweite waere ein Indexkontext von einer Datei nicht zu unterscheiden,
 * und die Naht nicht nachpruefbar.
 */
function decisionRecord(contract, runtime, outcome, rawLength, sessionId, contextSource = 'none', contextUsed = false) {
  const result = outcome.result;
  // S1-Provenienz: Workspace-Identität, Quelle, Pfade, Budget, Gründe — aber
  // nie der Prompt-Text (nur Längen) und nie Schlüsselwerte (die Route trägt
  // nur Provider/Modell-Namen).
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
    intentClassification: result?.intentClassification ?? null,
    uncertainties: result?.uncertainties ?? [],
    references: result?.references ?? [],
    rawLength,
    enhancedLength: result?.enhancedPrompt?.length ?? 0,
    // Runtime-Index + Intent-Erweiterung (Zug 7/8): nur wenn aktiviert.
    expansion: runtime?.expansion ?? null,
    intentMatch: runtime?.intentMatch ?? null,
    indexHits: runtime?.indexHits ?? null,
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
      intentClass: runtime.intentMatchClass ?? null,
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
    // Der eine Schreibweg (index-manager.js): die Host-Komposition bleibt frei
    // von Dateisystem-Aufrufen, und die Isolation-Zusage hat eine Adresse.
    writeJsonFile(path, { contract: LEARNED_CONTRACT, blocks: next });
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
  const prompt = readPrompt(payload);
  if (prompt === null) return next();
  const sessionId = payload?.agent?.session?.id;

  // EIN aufgeloester Modus je Lauf: Faehigkeiten, Verbote, Kontextbedarf und
  // System-Prompt kommen aus einer Struktur statt aus fuenf `mode`-Vergleichen.
  const contract = resolveMode(config.mode);

  // Intent-Erweiterung (Zug 8): Kurz-Prompt → Full-Task, bevor Kontext geladen
  // wird. Nur in MAX, nur wenn Patterns geladen sind, nur bei aktivem Match.
  // Der erweiterte Text ersetzt prompt.text im One-Shot; der Roh-Text bleibt
  // in decisionRecord.rawLength erhalten (Originallaenge).
  let expandedText = prompt.text;
  if (contract.needsContext && runtime.intentRules !== null) {
    const match = runtimeMatchIntent(prompt.text, runtime.intentRules);
    if (match !== null) {
      runtime.intentMatch = match.patternId;
      runtime.intentMatchClass = match.classification ?? null;
      // Eine Frage/Lookup-Klassifikation hat KEINE Expansion. Dann bleibt der
      // Prompt unangetastet: der Agent soll antworten, nicht eine Aufgabe
      // erfinden (die Erweiterung ist ein Angebot, keine Umdeutung).
      if (match.expansion !== '') {
        expandedText = `${prompt.text}\n\n# Aufgabe\n${match.expansion}`;
        console.log(`[shinon-prompter] Intent erkannt: ${match.label} (${match.classification}) — Expansion angewendet`);
      } else {
        console.log(`[shinon-prompter] Intent erkannt: ${match.label} (${match.classification}) — keine Expansion`);
      }
    } else {
      // Kein Treffer heißt kein Treffer: Treffer UND Klasse des VORIGEN Schritts
      // dürfen nicht stehen bleiben (gemessen als stale intentMatchClass).
      runtime.intentMatch = null;
      runtime.intentMatchClass = null;
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
    report(ctx, config, { ...decisionRecord(contract, runtime, outcome, prompt.text.length, sessionId), stand: null, blocks: decisionBlocks(blockSelection(ctx, config, runtime, contract, expandedText, null, null)) });
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

  // Die Route entscheidet der Mount (eigener Schluessel oder Fallback) — hier
  // nur angewandt. `enhanceGuarded` baut die Anfrage aus diesem Config-Stueck.
  const outcome = await enhanceGuarded(ctx, contract, { ...config, ...runtime.route }, expandedText, supply.context, stand, skills, payload.signal);

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
  report(ctx, config, { ...decisionRecord(contract, runtime, recorded, prompt.text.length, sessionId, supply.source, contextUsed), stand: standTrace(stand), blocks: decisionBlocks(selection) });

  // Nur ein gefundenes akzeptiertes Ergebnis ersetzt die Nutzernachricht. In
  // JEDEM anderen Fall geht die Entscheidung unveraendert weiter — der Roh-Prompt
  // bleibt stehen, und der Grund steht im Entscheidungsdatensatz
  // (DECISION_CHANNEL). Diese Funktion haengt nie einen eigenen Prompt ein.
  return messages === null ? decision : { ...decision, messages };
}

/** Entscheidung emittieren und in die Fenster-Konvention schreiben. */
function report(ctx, config, record) {
  if (!config.trace) return;
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

  // Runtime-Index (Zug 7): eigenhaend verwaltet, hash-basiert, JSON-persistiert.
  // Fehlt er, faellt MAX auf den Project Index zurueck (oder bleibt gesperrt).
  // Rangfolge der MAX-Quellen (S1): konfigurierte Datei > root-gebundener
  // Runtime-Index > Project Index. Eine Runtime-Datei mit Einträgen gewinnt
  // NICHT allein durch Inhalt — erst die Root-Bindung macht sie zur Quelle.
  let runtimeIndex = null;
  if (config.indexStoragePath !== '') {
    try {
      runtimeIndex = loadRuntimeIndex(config.indexStoragePath, { expectedRoot: workspace.root });
      if (runtimeIndex === null) {
        runtimeIndex = createIndex(workspace.root);
        console.log(`[shinon-prompter] Runtime-Index erstellt (neu, ${config.indexStoragePath})`);
      } else {
        console.log(`[shinon-prompter] Runtime-Index geladen (${runtimeIndex.entries.size} Eintraege)`);
      }
    } catch (error) {
      // FOREIGN_ROOT eingeschlossen: ein fremder Index wird abgelehnt und neu
      // aufgebaut, nie als Kontext geliefert.
      console.error(`[shinon-prompter] Runtime-Index nicht ladbar (${error?.message}) — startet leer`);
      runtimeIndex = createIndex(workspace.root);
    }
    // Auto-Index: beim Mount alle Dateien des Source-Verzeichnisses einlesen.
    if (config.autoIndex && config.indexSourcePath !== '') {
      try {
        const source = isAbsolute(config.indexSourcePath) ? config.indexSourcePath : join(workspace.root, config.indexSourcePath);
        const result = autoIndexDirectory(runtimeIndex, source, null, Date.now(), { root: workspace.root });
        // Ausgeschlossenes wird beim Namen genannt: ein Index, der Dateien
        // verschweigt, ohne es zu sagen, lügt über seine Abdeckung.
        const counts = new Map();
        for (const item of result.excluded ?? []) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
        const summary = [...counts.entries()].map(([reason, n]) => `${n}× ${reason}`).join(', ');
        const sample = (result.excluded ?? []).slice(0, 5).map((item) => `${item.path} (${item.reason})`).join('; ');
        const rest = (result.excluded ?? []).length > 5 ? ` (+${(result.excluded ?? []).length - 5} weitere)` : '';
        console.log(
          `[shinon-prompter] Auto-Index: ${result.indexed} neu, ${result.skipped} uebersprungen, ${result.errors.length} Fehler${summary === '' ? '' : `, ausgeschlossen: ${summary}`}${sample === '' ? '' : ` — ${sample}${rest}`}`,
        );
        if (config.indexStoragePath !== '') saveRuntimeIndex(runtimeIndex, config.indexStoragePath);
      } catch (error) {
        console.error(`[shinon-prompter] Auto-Index fehlgeschlagen (${error?.message})`);
      }
    }
  }

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

  const runtime = { context, contextState, noteRules, skillRules, runtimeIndex, intentRules, intentMatchClass: null, blocks, learnedPath: config.blocksLearnedPath ?? '', route, narrative: null, narrativeContract: NARRATIVE_CONTRACT, workspace, lastBudgetTokens: null, lastContextChars: null, lastContextFiles: null };
  const dispose = ctx.on(PRE_STEP_EVENT, (payload, next) => onPreStep(ctx, config, runtime, payload, next));
  const disposeNarrative = ctx.on(NARRATIVE_CHANNEL, (composite) => {
    runtime.narrative = composite ?? null;
  });

  const routeLabel = route.provider === '' || route.model === '' ? 'ohne Route (inaktiv)' : `${route.provider}/${route.model}`;
  const mode = resolveMode(config.mode);
  const contextInfo = mode.needsContext ? `context=${contextState}` : `context=${contextState} (${mode.mode} nutzt ihn nicht)`;
  const notesInfo = config.notesPath === '' ? 'notes=off' : `notes=${notesDir(config)}${noteRules === null ? ' (ohne Regeln)' : ''}`;
  const runtimeInfo = runtimeIndex !== null
    ? `runtimeIndex=${runtimeIndex.entries.size}Eintraege`
    : 'runtimeIndex=off';
  const intentInfo = intentRules !== null
    ? `intent=${intentRules.patterns.length}Patterns`
    : 'intent=off';
  const blocksInfo = blocks !== null
    ? `blocks=${blocks.blocks.length}Bausteine`
    : 'blocks=off';
  console.log(`[shinon-prompter] Aktiviert — registriert auf ${PRE_STEP_EVENT} (mode=${config.mode}, route=${routeLabel}, ${contextInfo}, ${notesInfo}, ${runtimeInfo}, ${intentInfo}, ${blocksInfo})`);

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
    if (typeof disposeNarrative === 'function') disposeNarrative();
    if (typeof releasePropose === 'function') releasePropose();
    console.log('[shinon-prompter] Deaktiviert — Listener abgemeldet');
  };
}

// ── Oeffentliche Aussenflaeche (unveraendert) ───────────────────────────────
export { CONTEXT_CONTRACT, CONTEXT_SOURCES_RUNTIME, CONTEXT_TAG, CONTRACT, DECISION_CHANNEL, INDEX_BUDGET_TOKENS, INDEX_CONTRACT, INDEX_SERVICE, INTENT_CLASSES, MODES, MODE_CAPABILITIES, MODE_DELTAS, NOTES_DIR_DEFAULT, NOTE_RULES_CONTRACT, NOTE_RULES_PATH, OPERATION_LABELS, POLICIES, PRE_STEP_EVENT, REQUIREMENT_OPERATIONS, SCORING_SERVICE, SCORING_SERVICE_CONTRACT, SKILLS_DIR_DEFAULT, SKILL_RULES_CONTRACT, SKILL_RULES_PATH, STAND_CONTRACT, UNTRUSTED_RULE };
export { ContextSchema, ResultSchema };
export { OUTCOME_EFFECTS, acceptance, contextTokens, parseResult, resolveReferences };
export { renderContext, renderSkillsBlock };
export { loadContext, loadNoteRules, loadSkillRules, readNotes, readSkills, selectSkills };
export { standFor, standTrace };
export { buildEnhancerRequest, collectStream, replacePrompt };
export { BLOCKS_CONTRACT, BLOCKS_PATH, DEFAULT_TOTAL_BUDGET, SELF_QUESTION_MARKERS, WEIGHTS_CONTRACT, WEIGHTS_SERVICE, buildHaystack, candidateBlocks, decisionBlocks, matchBlock, selectBlocks, validateRegistry, tokens as blockSelectTokens } from './assets/block-select.js';
export { LEARNED_CONTRACT, LEARNED_DEFAULT_PATH, PROPOSE_CONTRACT, PROPOSE_SERVICE, duplicateVsBlocks, mergeLearnedBlocks, validateBlockCore, validateLearnedFile, validateProposalShell } from './assets/block-review.js';
export { MAX_UNCERTAINTY, MIN_UNCERTAINTY, SELECTION_CONTRACT, parseSelection, renderCandidates, selectionSystemBrief } from './assets/selection.js';
