/**
 * @shinon/prompter — pre-step.js (Eigentuemer: LAUF)
 *
 * Der eine Schritt: Prompt lesen, Intent aufloesen, Kontext beschaffen, den
 * Stand bauen, den One-Shot fahren, die Entscheidung durchreichen und den
 * Datensatz schreiben. Alles, was hier passiert, ist EIN Durchlauf und stirbt
 * mit ihm; was er sich merkt, schreibt `runtime-state.js`.
 *
 * Warum das ein eigenes Modul ist: der Lauf ist die einzige Stelle, die
 * `next()` ruft, und die einzige, die aus einem Ausgang einen Datensatz macht.
 * Vorher stand diese Schleife in `index.js` zwischen Mount-Code und
 * Trace-Ausgabe — drei Zustaendigkeiten, die einander nur ueber `runtime`
 * beruehrten.
 *
 * Richtung: `index.js` (Verdrahtung) → `onPreStep` → `runtime-state` (merken)
 * und `trace-report` (erzaehlen). Kein Modul ruft zurueck.
 */
import { join } from 'node:path';
import { abortRecord } from './abort-core.js';
import { WEIGHTS_CONTRACT, WEIGHTS_SERVICE, decisionBlocks, selectBlocks } from './block-select.js';
import { CAPABILITIES_CONTRACT, briefRecord, matchCapability, renderTaskBrief, taskBrief } from './capability-map.js';
import { knowledgeTrace, renderKnowledgeBlock } from './knowledge-block.js';
import { enhanceGuarded, replacePrompt } from './enhancer.js';
import { addTurnDuration, memorySummary, semanticProfile, weightsFrom } from './intent-memory.js';
import { UNDEFINED, expandPrompt, isQuestion, normalizeIntentText, resolveIntent } from './intent-resolver.js';
import { CONTRACT, DECISION_CHANNEL, FACTS_SNAPSHOT_CONTRACT, FACTS_SNAPSHOT_SERVICE, INDEX_CONTRACT, INDEX_SERVICE, NOT_SUPPLIED, SCORING_SERVICE, SCORING_SERVICE_CONTRACT, contextLabel, noContext, resolveMode, withContext } from './mode-core.js';
import { PROVENANCE_CONTRACT, provenanceRecord } from './provenance.js';
import { OUTCOME_EFFECTS } from './result-contract.js';
import { ContextSchema } from './schema.js';
import { readTone, standFor, standTrace } from './stand.js';
import { NARRATIVE_STATE_CHANNEL, NARRATIVE_STATE_CONTRACT, lastHumanMessage } from '@shinon/seams/core';
import { countSalvage, journalRejectedAnswer, persistIntentMemory, recordIntent } from './runtime-state.js';
import { reportTrace } from './trace-report.js';

/**
 * Den Wissens-Snapshot beim Projekt-Index holen. Kein `inject`: fehlt der
 * Dienst, laeuft der Schritt ohne Block weiter (dieselbe Regel wie beim Index).
 * Ein kaputter Dienst ist ein geloggter Befund und kein Grund, den Turn zu
 * brechen — der Block ist eine Verstaerkung, keine Bedingung.
 */
function readKnowledgeSnapshot(ctx, runtime) {
  let service;
  try {
    service = typeof ctx?.get === 'function' ? ctx.get(FACTS_SNAPSHOT_SERVICE) : undefined;
  } catch {
    service = undefined;
  }
  if (!service || typeof service.snapshot !== 'function' || service.contract !== FACTS_SNAPSHOT_CONTRACT) return null;
  try {
    const snapshot = service.snapshot({ intent: runtime?.turn?.resolution?.classification ?? 'UNBEKANNT' });
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  } catch (error) {
    console.warn(`[shinon-prompter] Wissens-Snapshot nicht lesbar (${error?.message ?? error}) — Schritt ohne Block`);
    return null;
  }
}

/**
 * Den zu verbessernden Prompt aus der Nutzlast holen: Nachricht, Text und Index
 * der letzten menschlichen Nachricht. Die Regel selbst steht in
 * `@shinon/seams` (`lastHumanMessage`) — bis 2026-10-20 stand sie hier als
 * Zwillings-Region, bytegleich mit `@shinon/task-router`.
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
    // Dieselben Spurfelder wie beim Datei-Kontext: vorher nannte der Datensatz
    // fuer den Index weder Dateien noch Zeichen (gemessen im Leitstand). Die
    // Provenienz braucht die Pfade ohnehin — zwei Quellen fuer dieselbe Zahl
    // waeren eine zweite Wahrheit.
    runtime.lastBudgetTokens = config.indexBudgetTokens;
    runtime.lastContextChars = (context.files ?? []).reduce((sum, file) => sum + (file?.content?.length ?? 0), 0);
    runtime.lastContextFiles = (context.files ?? []).map((file) => file?.path);
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
 * Die Einträge der Provenienz-Leiter fuer diesen Turn.
 *
 * Nur was WIRKLICH in den Prompt gereist ist, bekommt einen Eintrag. Deshalb
 * haengt der Kontext an `record.context === 'used'` und nicht daran, ob eine
 * Datei geladen wurde: MIN/MID laden den Kontext, nutzen ihn aber nicht. Ein
 * Eintrag fuer ungenutzten Text waere eine Behauptung ueber den Prompt, die
 * niemand nachpruefen kann.
 *
 * Die Zuordnung ist absichtlich grob und benannt:
 *
 *   Index-Treffer   DERIVED, Zeiger ist der Pfad (Stand: Indexlauf)
 *   Datei-Kontext   FACT, Zeiger ist der Pfad (beim Mounten geladen)
 *   Scoring-Ton     JUDGEMENT, Zeiger ist der Vertrag
 *   Narrative       NARRATIVE, Zeiger ist der Vertrag
 *   One-Shot       PROPOSAL, Zeiger ist der Ergebnisvertrag
 *
 * Der direkte Durchreicher (`NO_ENHANCEMENT_NEEDED`) ist KEIN Vorschlag: er
 * gibt den Roh-Prompt zurueck. Ihn als PROPOSAL zu fuehren wuerde behaupten,
 * das Modell habe etwas vorgeschlagen.
 */
function provenanceFor(record, context) {
  const entries = [];
  const source = record?.context_source;
  if (record?.context === 'used' && (source === 'index' || source === 'file')) {
    // Der Kontext kommt aus dem AUFGELOESTEN Angebot des Schritts, nicht aus
    // `runtime.context`: das ist der beim Mounten geladene Datei-Kontext und
    // beim Index leer. Genau diese Verwechslung liess den Index-Fall ohne
    // Eintrag (gemessen im Trace-Test).
    const files = Array.isArray(context?.files) ? context.files : [];
    for (const file of files) {
      if (typeof file?.path !== 'string') continue;
      entries.push({
        class: source === 'index' ? 'DERIVED' : 'FACT',
        pointer: file.path,
        source: source === 'index' ? INDEX_SERVICE : 'prompter.contextPath',
      });
    }
  }
  const stance = record?.stand?.stance;
  if (typeof stance === 'string' && stance !== '') {
    entries.push({ class: 'JUDGEMENT', pointer: SCORING_SERVICE_CONTRACT, source: SCORING_SERVICE });
  }
  if (record?.stand?.narrative !== null && record?.stand?.narrative !== undefined) {
    entries.push({ class: 'NARRATIVE', pointer: NARRATIVE_STATE_CONTRACT, source: NARRATIVE_STATE_CHANNEL });
  }
  const reasons = Array.isArray(record?.reasons) ? record.reasons : [];
  if (record?.outcome === 'accepted' && !reasons.includes('NO_ENHANCEMENT_NEEDED')) {
    entries.push({ class: 'PROPOSAL', pointer: CONTRACT, source: 'one-shot' });
  }
  // Der Aufgabenbrief ist aus der Karte ABGELEITET: er sagt, wer zustaendig ist,
  // nicht ob die Antwort stimmt. Genau deshalb DERIVED und nicht FACT — und der
  // Zeiger ist der Vertrag, keine Datei.
  if (record?.brief !== null && record?.brief !== undefined) {
    entries.push({ class: 'DERIVED', pointer: CAPABILITIES_CONTRACT, source: 'prompter.capabilityMap' });
  }
  return provenanceRecord(entries);
}

/**
 * Den Aufgabenbrief fuer diesen Turn bauen — oder den Grund, warum keiner reist.
 *
 * Gematcht wird gegen die KARTE, nicht gegen ein Modell: dieselbe Frage ergibt in
 * jedem Lauf denselben Eigentuemer. Ein Gleichstand wird nicht alphabetisch
 * entschieden (MEHRDEUTIG), und ein Brief ueber der Grenze wird verweigert statt
 * gekuerzt — ein halber Brief waere eine halbe Zustaendigkeit.
 */
function briefFor(runtime, text) {
  // EINE FRAGE WIRD NIE ERWEITERT: ein Aufgabenbrief sagt „so lautet die Aufgabe" —
  // bei „Wer bist du?" wäre das eine erfundene (gemessen 2026-10-22 im Host: ein
  // task_brief über Eigentum und Vorschlags-Review). Klassifiziert wird sie
  // weiterhin; der Trace nennt den Grund `FRAGE`.
  if (isQuestion(normalizeIntentText(text))) return { reason: 'FRAGE' };
  const read = runtime?.capabilityMap;
  if (read === undefined || read === null || read.map === null) return { reason: read?.reason ?? 'KARTE_FEHLT' };
  const match = matchCapability(text, read.map);
  if (!match.ok) return { reason: match.reason };
  const rendered = renderTaskBrief(
    taskBrief(match.capability, { workspace: runtime?.workspace?.root ?? null }),
    { maxChars: read.map.maxBriefChars },
  );
  if (!rendered.ok) return { reason: rendered.reason, chars: rendered.chars };
  return { rendered, record: briefRecord(match.capability, rendered) };
}

/** Den Entscheidungsdatensatz um die Leiter ergaenzen (ein neuer Datensatz, keine Mutation). */
function withProvenance(record, context) {
  return { ...record, provenance_contract: PROVENANCE_CONTRACT, provenance: provenanceFor(record, context) };
}

/**
 * Den Entscheidungsdatensatz um die Abbruchklassifikation ergänzen.
 *
 * HIER STEHT NUR DIE ÜBERGABE: `abortRecord` klassifiziert und zählt, diese
 * Funktion hängt das Ergebnis an. Kein Grund wird hier genannt — sonst wäre ein
 * neuer Grund eine Codeänderung.
 */
function withAbort(record, runtime) {
  const info = abortRecord(record, runtime?.abortTable ?? null);
  return { ...record, abort: info.abort, abort_counts: info.abort_counts };
}

/**
 * Entscheidungsdatensatz: was entschieden wurde, ohne den Prompt-Text zu kopieren.
 * (Die Provenienz-Leiter daneben ist etwas anderes: sie sagt, WELCHE ART Aussage
 * im Prompt stand. Hier steht die Workspace-Herkunft des Schritts.)
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
        intentOn: runtime.intentRules !== null,
        narrative: runtime.narrative !== null,
        recentEvents: [],
      },
    });
  } catch {
    return null;
  }
}

/** Der registrierte Listener. Genau ein `next()` — Durchreichen ist der Normalfall. */
export async function onPreStep(ctx, config, runtime, payload, next) {
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
    reportTrace(ctx, config, runtime, withAbort(withProvenance({ ...decisionRecord(contract, runtime, outcome, prompt.text.length, sessionId), stand: null, blocks: decisionBlocks(blockSelection(ctx, config, runtime, contract, expandedText, null, null)), brief: null, brief_reason: 'KEIN_LAUF' }, null), runtime));
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

  // Skills liest der Veredler NICHT: er redigiert Text, und die ausfuehrbaren
  // Skill-Inhalte bleiben der nativen DSH-Skill-Discovery des Hauptagenten.
  // Auch die Baustein-Auswahl kennt keine Skill-Quelle mehr — der Baustein
  // `skills-block` ist mit dem Injektionsweg aus der Registry verschwunden.

  // Aktions-Check (P3) — seit 2026-10-19 ein OPTIONALER Kurzweg, nicht die
  // Vorgabe: der Veredler laeuft fuer JEDEN Schritt, auch fuer "hallo" und fuer
  // Fragen. Nur eine ausdrueckliche Profil-Angabe `alwaysEnhance: false` nimmt
  // klare CHAT-/LOOKUP-Turns wieder aus (dann kostet Smalltalk keinen
  // One-Shot). Der Kurzweg reicht den Text DIREKT durch und protokolliert ihn.
  const journalRejected = (entry) => journalRejectedAnswer(runtime, entry);
  const direct = config.alwaysEnhance === false
    && contract.mode !== undefined && runtime.turn?.resolution !== null
    && runtime.turn?.resolution !== undefined
    && ['CHAT', 'LOOKUP'].includes(runtime.turn.resolution.classification);
  // Der Snapshot wird VOR dem One-Shot gelesen: nur so weiss der Aufruf, ob der
  // wissensgebundene Weg gilt (strenge Ergebnispruefung), und der Block haengt
  // danach unabhaengig vom Ausgang am Prompt.
  const knowledgeSnapshot = readKnowledgeSnapshot(ctx, runtime);
  const outcome = direct
    ? {
      outcome: 'accepted',
      reasons: ['NO_ENHANCEMENT_NEEDED'],
      result: { enhancedPrompt: prompt.text, preservedIntent: true, addedRequirements: [], removedRequirements: [], uncertainties: [], references: [] },
    }
    : await enhanceGuarded(ctx, contract, { ...config, ...runtime.route, strictFacts: knowledgeSnapshot !== null }, expandedText, supply.context, stand, payload.signal, journalRejected);
  if (direct) console.log(`[shinon-prompter] Direkt durchgereicht (${runtime.turn.resolution.classification}) — kein One-Shot`);

  // Ab hier gehoert der Ablauf dem Loop: ein Fehler von next() bleibt SEIN Fehler
  // und darf nicht in einen zweiten next() umgedeutet werden.
  const decision = await next();

  // Ein Ausgang ausserhalb der Tabelle kann nur aus unserem eigenen Code kommen;
  // der Rueckfall ist die Durchreiche, damit ein solcher Fall nie den Schritt
  // bricht — dieselbe Fail-Richtung wie im ganzen Paket.
  const effect = OUTCOME_EFFECTS[outcome.outcome] ?? OUTCOME_EFFECTS.rejected;
  // Der Aufgabenbrief haengt NICHT an der ersetzten Nutzernachricht:
  // Routing-Metadaten gehoeren in den Runtime-Context (`registerContext`
  // liest `runtime.lastBriefText`) — und nur bei EINDEUTIGEM Treffer. Bei
  // uneindeutigem Treffer entfaellt der Brief; der Grund steht im Datensatz
  // (`brief_reason`), nicht im Prompt. Der direkte Kurzweg bleibt unberuehrt
  // (sein Versprechen ist: keine Aenderung).
  const briefState = !direct ? briefFor(runtime, expandedText) : { reason: 'DIREKT' };
  runtime.lastBriefText = briefState.rendered?.text ?? null;
  // `outcome.result` ist bei jedem nicht angenommenen Ausgang `null` — und dann
  // wird nichts ersetzt. Der Zugriff steht deshalb hinter derselben Bedingung
  // wie der Ersatz selbst, nicht davor.
  // Der Wissensblock kommt aus der Runtime, nicht aus dem Modell: er haengt am
  // Ende des Prompts, gleich ob der One-Shot angenommen, abgelehnt oder
  // uebersprungen wurde und gleich ob der Veredler lief. Ohne Snapshot bleibt
  // der Text unveraendert — ein leerer Block waere eine Behauptung.
  const knowledge = renderKnowledgeBlock(knowledgeSnapshot);
  // Der Wissensblock geht ebenfalls in den RUNTIME-CONTEXT: er ist Wissen,
  // keine Veredelung. Vorher hing er am Auftragstext — und fiel damit weg,
  // sobald der Verwerfer den Auftrag unangetastet liess.
  runtime.lastKnowledgeText = knowledge.text === '' ? null : knowledge.text;
  // DER PROJEKTKONTEXT HAENGT AM PROMPT, NICHT AN DER MODELLANTWORT.
  //
  // GEMESSEN (2026-10-21, echter Turn): der One-Shot antwortete mit Prosa
  // statt JSON ("Ich arbeite schrittweise und systematisch: …") — der Grund
  // NO_JSON. Der Verwerfer arbeitet RICHTIG: er erkennt die Antwort und
  // verweigert, den Prompt damit zu ersetzen. Aber damit fiel der ganze
  // Projektkontext weg — 502 Dateien, 3926 Symbole, 2710 Chunks, gemessen
  // vom Index, und nichts davon kam beim Modell an.
  //
  // Der Kontext ist KEINE Veredelung: er ist Wissen ueber das Projekt. Deshalb
  // kommt er aus der Runtime und nicht aus dem Veredler. Der Veredler darf ihn
  // zusaetzlich einbauen; dass er es nicht tut, darf den Kontext nicht kosten.
  //
  // Die Reihenfolge: der Kontext steht VOR dem Wissensblock — er ist groesser
  // und gehoert naeher an den Auftrag.
  // DER KONTEXT GEHOERT NUR AUF DEN ROH-PFAD.
  //
  // Wird der Prompt vom One-Shot ERSETZT, hat das Modell den Kontext schon
  // gesehen (es stand im Request) und (nach dem Vertrag) eingebaut. Haengt
  // man ihn dann noch einmal an, steht er doppelt im Prompt — und der Prompt
  // ist das teuerste Gut.
  //
  // Wird der Prompt NICHT ersetzt (Direktweg, abgelehnter One-Shot), faellt der
  // Kontext sonst GANZ weg — das ist der gemessene Fall vom 2026-10-21: 502
  // Dateien, 3926 Symbole, 2710 Chunks im Index, und nichts davon beim Modell.
  // Genau DORT gehoert er hin.
  const withKnowledge = (text) => (knowledge.text === '' ? text : `${text}\n\n${knowledge.text}`);
  // Der Kontext als EIGENER TEXTBLOCK — nicht im Prompt-Text.
  //
  // Der Repo-Vertrag sagt: bei einem verworfenen One-Shot geht der Roh-Prompt
  // UNVERAENDERT weiter (prompter-contract.test.mjs, "Roh-Prompt bleibt
  // erhalten"). Der Kontext darf ihn deshalb nicht veraendern — er kommt als
  // zusaetzlicher Block in dieselbe Nachricht. `content[0]` bleibt der Auftrag,
  // `content[1]` ist der Kontext: das Modell sieht beides, der Auftrag bleibt
  // unangetastet, und der Vertrag haelt.
  const replacement = effect.replacePrompt && typeof outcome.result?.enhancedPrompt === 'string'
    ? withKnowledge(outcome.result.enhancedPrompt)
    : null;
  // Kein Ersatz heisst NICHT "kein Wissen": auf dem Direktpfad und nach einem
  // abgelehnten One-Shot wird der Roh-Prompt um den Block ergaenzt, ueber
  // dieselbe Identitaets-Ersetzung wie oben. Findet sie die Nachricht nicht,
  // bleibt der Schritt unveraendert (dieselbe Fail-Richtung wie im Paket).
  // Der Kontext haengt am RUNTIME-CONTEXT, nicht an dieser Nachricht. Der
  // Vertrag sagt: bei einem verworfenen One-Shot geht die Entscheidung
  // UNVERAENDERT weiter (decision === downstream) — der Auftrag bleibt, wie er
  // war. Also wird er hier nicht angefasst.
  //
  // Vorher kam der Kontext nur ueber den One-Shot-Request. Verwarf der
  // Veredler (NO_JSON, gemessen am 2026-10-21), fiel der ganze Kontext weg:
  // 502 Dateien, 3926 Symbole, 2710 Chunks im Index, nichts davon beim Modell.
  // Der Runtime-Context ist der Weg, der unabhaengig vom Veredler laeuft.
  // DER VERWERFUNGSFALL: die Nachricht bleibt, wie sie ist.
  //
  // Der Vertrag: "Ein Fehler im Enhancer darf den urspruenglichen Auftrag nicht
  // ueberschreiben — der Roh-Prompt geht unveraendert weiter" (prompter-
  // contract.test.mjs). Der Verwerfer arbeitet RICHTIG; er verweigert nur, die
  // Antwort zum Prompt zu machen. Deshalb wird hier NICHTS geschrieben.
  //
  // Der Kontext und der Wissensblock kommen ueber den Runtime-Context — der
  // Kanal, der unabhaengig vom Veredler laeuft (registerContext unten).
  // Der WISSENSBLOCK gehoert an den Roh-Prompt, auch wenn der One-Shot
  // verworfen wurde: er kommt aus der Runtime, nicht aus dem Modell.
  // Der PROJEKTKONTEXT gehoert NICHT hierher — der kommt ueber den
  // Runtime-Context-Kanal (context-channel.js), unabhaengig vom Veredler.
  const messages = effect.replacePrompt
    ? replacePrompt(decision?.messages, prompt.message, replacement)
    : (knowledge.text === ''
      ? null
      : replacePrompt(decision?.messages, prompt.message, withKnowledge(prompt.text)));

  // Ersetzen kann nur, wer die Nachricht findet. Hier wird aus einem ANGENOMMENEN
  // Ergebnis ein `rejected`-Datensatz — die einzige Stelle, an der sich der
  // Ausgang nachtraeglich aendert, und der Grund dafuer ist der TABELLEN-Wert
  // `missingMessage` (nicht ein zweites Verwerfen des Modells). Am Prompt-Text
  // aendert das nichts: ohne gefundene Nachricht wird nichts geschrieben.
  const recorded = effect.replacePrompt && messages === null
    ? { ...outcome, outcome: 'rejected', reasons: effect.missingMessage }
    : outcome;
  const brief = briefState.record !== undefined
    ? { record: briefState.record, reason: null }
    : { record: null, reason: briefState.reason ?? 'KEIN_BRIEF' };
  // Die zweite Hälfte der Gesamtlaufzeit: die Dauer fällt erst nach dem Turn an
  // und hängt an demselben Pattern, das die Beobachtung verbucht hat.
  if (runtime.intentMemory !== null && runtime.turn?.intentMatch) {
    runtime.intentMemory = addTurnDuration(runtime.intentMemory, runtime.turn.intentMatch, Date.now() - turnStarted);
    persistIntentMemory(runtime, runtime.intentMemoryPath, runtime.intentMemory);
  }
  reportTrace(ctx, config, runtime, withAbort(withProvenance({ ...decisionRecord(contract, runtime, recorded, prompt.text.length, sessionId, supply.source, contextUsed), stand: standTrace(stand), blocks: decisionBlocks(selection), brief: brief.record, brief_reason: brief.reason, knowledge: knowledgeTrace(knowledge) }, supply.context), runtime));

  // Nur ein gefundenes akzeptiertes Ergebnis ersetzt die Nutzernachricht. In
  // JEDEM anderen Fall geht die Entscheidung unveraendert weiter — der Roh-Prompt
  // bleibt stehen, und der Grund steht im Entscheidungsdatensatz
  // (DECISION_CHANNEL). Diese Funktion haengt nie einen eigenen Prompt ein.
  return messages === null ? decision : { ...decision, messages };
}

