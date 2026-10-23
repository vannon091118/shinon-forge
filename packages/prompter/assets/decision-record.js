/**
 * @shinon/prompter — decision-record.js (Eigentuemer: DATENSATZ)
 *
 * Was ein Schritt nach aussen bezeugt: die Entscheidung, ihre Gruende, die
 * Herkunft von Kontext und Anfrage — ohne den Prompt-Text zu kopieren. Der
 * Datensatz ist ein VERTRAG (er geht auf den Entscheidungskanal und in den
 * Trace), deshalb steht seine Form hier und nicht im Lauf, der ihn fuellt.
 *
 * SH-LEARN-01 (2026-10-23): `prompt_source` trennt die urspruengliche
 * Nutzernachricht (`user`) von der Anfrage, die wirklich ans Hauptmodell ging
 * (`refined`, wenn der Vorschlag uebernommen wurde). Nur die Herkunft reist
 * mit, nie der Text — und ein Lernsignal kann damit nie den internen Prompt
 * als Nutzerkorrektur lesen.
 */
import { memorySummary } from './intent-memory.js';
import { CONTRACT, contextLabel } from './mode-core.js';
import { countSalvage } from './runtime-state.js';

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
export function decisionRecord(contract, runtime, outcome, rawLength, sessionId, contextSource = 'none', contextUsed = false, promptSource = 'user') {
  const result = outcome.result;
  // Jeder Prosafall zaehlt, auch der verworfene (`applied: false`, siehe enhancer.js).
  const salvage = outcome.salvage !== null && typeof outcome.salvage === 'object'
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
    // SH-LEARN-01: WELCHER Text ging als Anfrage an das Hauptmodell? `user` ist
    // der Auftrag des Menschen, `refined` der uebernommene Vorschlag. Ohne diese
    // Angabe waeren "Nachricht des Menschen" und "gesendete Anfrage" im Trace
    // nicht zu unterscheiden — und ein Lernsignal koennte den falschen Text
    // treffen. Der Text selbst reist NICHT mit, nur die Herkunft.
    prompt_source: promptSource,
    prompt_applied: promptSource === 'refined',
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
