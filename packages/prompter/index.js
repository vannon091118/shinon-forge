import z from '@deepseek-ai/schemastery';

/**
 * shinon-prompter — der interne One-Shot Prompt Enhancer (Phase 2).
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
 *   2. Kein `purpose`-Wert für diesen Aufruf. `purpose` kennt genau zwei Werte
 *      ('compaction', 'session-title'); ein eigener würde die Typgrenze brechen.
 *      Der Aufruf lässt `purpose` deshalb ungesetzt.
 *
 * CAPABILITY-ISOLATION (die eigentliche Sicherheitsgrenze): der One-Shot-Child
 * bekommt **kein `tools`-Feld**. Es gibt keinen Werkzeugkatalog, den man
 * einschränken könnte — die Liste ist leer, weil sie nicht existiert. Damit
 * fehlen Dateisystem, Shell, Subprozess, Terminal, Browser, beliebige Tools und
 * verschachtelte Agent-Steuerung nicht durch eine Policy, sondern durch
 * Abwesenheit. Ein XML-Tag wäre keine Grenze; das ist eine.
 *
 * Der Enhancer ist kein Tool des Hauptagenten: es gibt keinen Aufrufweg in
 * diesem Paket, der zu ihm führt. Er hängt am Schritt.
 */

/** Vertragsname der One-Shot-Antwort. */
export const CONTRACT = 'shinon.prompter/result-v1';

/** Der Waterfall-Punkt, an dem der Enhancer hängt. */
export const PRE_STEP_EVENT = 'agent/pre-step';

/** Kanal, auf dem Entscheidungen den Host verlassen (Provenienz, ohne Prompt-Text). */
export const DECISION_CHANNEL = 'shinon/prompter/decision';

/** Prompt-Modi aus dem Implementierungsplan. */
export const MODES = ['MIN', 'MID', 'MAX'];

/** Modi, die ohne Project Index arbeiten können. */
export const AVAILABLE_MODES = ['MIN', 'MID'];

/** Intent-Klassen (Plan §16) — Vokabular des Resultatvertrags. */
export const INTENT_CLASSES = ['CHAT', 'LOOKUP', 'TRANSFORM', 'MULTI_STEP_TASK', 'LONG_RUNNING_GOAL'];

/**
 * Der Resultatvertrag (Plan §7), wörtlich.
 *
 * `required()` ist hier keine Formalie, sondern trägt die Sicherheit: in
 * Schemastery sind Objekt-Schlüssel **optional**, und ein fehlendes `z.array()`
 * wird still mit `[]` gefüllt. Ohne `required()` würde ein Modell, das
 * `addedRequirements` einfach weglässt, als "nichts hinzugefügt" durchgehen —
 * die Lücke sähe genau wie Compliance aus. Mit `required()` ist ein fehlendes
 * Feld ein Schemafehler und führt zum Roh-Prompt.
 *
 * `intentClassification` ist keine Empfehlung an das Modell, sondern Daten: nur
 * diese fünf Werte passieren. Eine unbekannte Klasse wird verworfen.
 */
export const ResultSchema = z.object({
  enhancedPrompt: z.string().min(1, 'enhancedPrompt darf nicht leer sein').required(),
  preservedIntent: z.boolean().required(),
  addedRequirements: z.array(z.string()).required(),
  removedRequirements: z.array(z.string()).required(),
  uncertainties: z.array(z.string()).required(),
  references: z.array(z.string()).required(),
  intentClassification: z.union([
    z.const('CHAT'),
    z.const('LOOKUP'),
    z.const('TRANSFORM'),
    z.const('MULTI_STEP_TASK'),
    z.const('LONG_RUNNING_GOAL'),
  ]).required(),
});

/** Was beide Modi gemeinsam zusagen: Format, Grenze, Ausgabe. */
const RESULT_BRIEF = [
  'Du bist ein Prompt-Veredler. Du veraenderst die Formulierung, nicht die Aufgabe.',
  '',
  'Antworte ausschliesslich mit genau einem JSON-Objekt, ohne Erklaerung, ohne Markdown-Zaun:',
  '{"enhancedPrompt":"…","preservedIntent":true,"addedRequirements":[],"removedRequirements":[],"uncertainties":[],"references":[],"intentClassification":"CHAT"}',
  '',
  'Regeln:',
  '- preservedIntent ist true, solange du die Absicht des Nutzers nicht aenderst.',
  '- addedRequirements und removedRequirements sind leer, solange du keine Anforderung',
  '  hinzufuegst oder entfernst. Wenn du meinst, dass eine fehlt: nicht erfinden, sondern',
  '  in uncertainties benennen.',
  '- uncertainties nennt echte Unklarheiten des Originals, in eigenen Worten.',
  '- references bleibt leer. Du hast keinen Projektzugriff.',
  '- intentClassification ist genau einer von: ' + INTENT_CLASSES.join(', ') + '.',
].join('\n');

/** Modus-Policy (Plan §6). MIN und MID unterscheiden sich nur in der Erlaubnis. */
export const POLICIES = {
  MIN: [
    RESULT_BRIEF,
    '',
    'Erlaubt: Rechtschreibung, Grammatik, Zeichensetzung, minimale Strukturverbesserung.',
    'Verboten: neue Anforderungen, entfernte Anforderungen, Bedeutungsaenderung, fachliche Ergaenzungen.',
    'Der enhancedPrompt ist so nah am Original wie moeglich.',
  ].join('\n'),
  MID: [
    RESULT_BRIEF,
    '',
    'Erlaubt: bessere Struktur, klarere Formulierungen, explizite Constraints, Ambiguitaetsreduktion —',
    'zusaetzlich zu Rechtschreibung, Grammatik und Zeichensetzung.',
    'Verboten: neue fachliche Anforderungen. Du darfst die Aufgabe praeziser fassen, nicht erweitern.',
  ].join('\n'),
};

/**
 * Hook-Konfiguration (Schemastery).
 *
 * `provider`/`model` sind der Route-Schluessel des One-Shots und kommen aus dem
 * Profil, nicht aus dem Paket. Bleiben sie leer, gibt es keinen Aufrufweg — das
 * wird gemeldet (`NO_ROUTE`), nicht stillschweigend als Erfolg verbucht.
 */
export const Config = z.object({
  /** DSH-Event-Namen, auf die sich der Enhancer registriert. */
  observeEvents: z.array(z.string()).default(['agent/pre-step']),
  /** Prompt-Modus. MAX braucht den Project Index und wird ohne ihn abgelehnt. */
  mode: z.union([z.const('MIN'), z.const('MID'), z.const('MAX')]).default('MIN'),
  /** LLM-Route des One-Shot-Childs (leer = nicht konfiguriert). */
  provider: z.string().default(''),
  /** Modell des One-Shot-Childs (leer = nicht konfiguriert). */
  model: z.string().default(''),
  /** Obergrenze der Antwort. Die Antwort ist ein JSON-Objekt, kein Aufsatz. */
  maxTokens: z.number().default(1200),
  /** Deterministisch: derselbe Prompt soll denselben Vorschlag ergeben. */
  temperature: z.number().default(0),
  /** Harte Obergrenze des One-Shots. Danach gilt der Roh-Prompt. */
  timeoutMs: z.number().default(15000),
  /** Entscheidungen auf `DECISION_CHANNEL` emittieren. */
  trace: z.boolean().default(true),
});

/**
 * Den zu verbessernden Prompt aus der Nutzlast holen: die letzte
 * Nutzer-Nachricht mit Text. Gibt die Nachricht MIT zurück, weil sie später
 * ueber ihre Identitaet wiedergefunden werden muss — ueber einen Index zu
 * raten waere ein stiller Fehler.
 */
export function readPrompt(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    const blocks = Array.isArray(message.content) ? message.content : [];
    const text = blocks
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
    if (text.trim() === '') continue;
    return { message, text, index };
  }
  return null;
}

/**
 * Die Modellausgabe in den Resultatvertrag ueberfuehren. Reine Funktion, kein
 * Netz. Der erste `{` bis zum letzten `}` wird genommen, damit ein Zaun oder
 * ein Satz Vorrede nicht toedlich ist — danach entscheidet das Schema.
 */
export function parseResult(text) {
  const source = typeof text === 'string' ? text : '';
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end <= start) return { ok: false, reasons: ['NO_JSON'] };

  let parsed;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch {
    return { ok: false, reasons: ['INVALID_JSON'] };
  }

  try {
    return { ok: true, result: ResultSchema(parsed) };
  } catch (error) {
    return { ok: false, reasons: [`SCHEMA_INVALID:${error?.message}`] };
  }
}

/**
 * Annahme-Policy (Plan §7). Das Modellergebnis wird nie direkt uebernommen:
 * jedes der genannten Kriterien verwirft und laesst den Roh-Prompt gelten.
 */
export function acceptance(result) {
  const reasons = [];
  if (result?.preservedIntent !== true) reasons.push('INTENT_NOT_PRESERVED');
  if (result.addedRequirements.length > 0) reasons.push('ADDED_REQUIREMENTS');
  if (result.removedRequirements.length > 0) reasons.push('REMOVED_REQUIREMENTS');
  return { accepted: reasons.length === 0, reasons };
}

/**
 * Den One-Shot-Aufruf bauen.
 *
 * Hier steht die Capability-Isolation: es gibt kein `tools`-Feld. Dazu kommen
 * nur die Felder, die `GenerateOptions` wirklich kennt — `purpose` bleibt
 * ungesetzt, weil DSH dort keine passende Klasse fuehrt.
 */
export function buildEnhancerRequest({ text, mode, config, signal }) {
  return {
    provider: config.provider,
    model: config.model,
    system: POLICIES[mode],
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    signal,
  };
}

/** Einen StreamChunk-Strom zu Text zusammensetzen. */
export async function collectStream(stream) {
  let text = '';
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
  }
  return text;
}

/**
 * Den Prompt in einem Nachrichtenarray ersetzen — ueber Identitaet, nicht ueber
 * Index. Alle Textbloecke dieser Nachricht werden zu einem einzigen
 * `enhancedPrompt`; Nicht-Text-Bloecke (Bilder, Dateien) bleiben erhalten.
 * Gibt `null` zurueck, wenn die Nachricht nicht gefunden wird: dann gilt der
 * Roh-Prompt, statt dass an der falschen Stelle geschrieben wird.
 */
export function replacePrompt(messages, original, text) {
  if (!Array.isArray(messages)) return null;
  const index = messages.indexOf(original);
  if (index === -1) return null;

  const message = messages[index];
  const content = [];
  let injected = false;
  for (const block of Array.isArray(message.content) ? message.content : []) {
    if (block?.type === 'text') {
      if (!injected) {
        content.push({ ...block, text });
        injected = true;
      }
      continue;
    }
    content.push(block);
  }
  if (!injected) return null;

  const next = messages.slice();
  next[index] = { ...message, content };
  return next;
}

/**
 * Den One-Shot fahren. Wirft nie: jeder Fehler ist ein Grund fuer den Roh-Prompt.
 * Gibt den Ausgang zurueck statt ihn zu werfen, damit der Aufrufer genau eine
 * Fail-Richtung hat.
 */
async function enhance(ctx, config, prompt, signal) {
  if (typeof config.provider !== 'string' || config.provider === '' || typeof config.model !== 'string' || config.model === '') {
    return { outcome: 'unavailable', reasons: ['NO_ROUTE'], result: null };
  }
  if (typeof ctx?.llm?.stream !== 'function') {
    return { outcome: 'unavailable', reasons: ['NO_LLM_SERVICE'], result: null };
  }

  const timeout = AbortSignal.timeout(config.timeoutMs);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);

  let text;
  try {
    text = await collectStream(ctx.llm.stream(buildEnhancerRequest({ text: prompt, mode: config.mode, config, signal: combined })));
  } catch (error) {
    return { outcome: 'rejected', reasons: [`LLM_FAILED:${error?.name ?? 'Error'}`], result: null };
  }

  const parsed = parseResult(text);
  if (!parsed.ok) return { outcome: 'rejected', reasons: parsed.reasons, result: null };

  const decision = acceptance(parsed.result);
  if (!decision.accepted) return { outcome: 'rejected', reasons: decision.reasons, result: parsed.result };
  return { outcome: 'accepted', reasons: [], result: parsed.result };
}

/**
 * Provenienz-Datensatz: was entschieden wurde, ohne den Prompt-Text zu kopieren.
 * Genau einer pro Schritt — auch im Randfall, damit die Spur nicht doppelt laeuft.
 */
function decisionRecord(config, outcome, rawLength) {
  const result = outcome.result;
  return {
    contract: CONTRACT,
    mode: config.mode,
    outcome: outcome.outcome,
    reasons: outcome.reasons,
    intentClassification: result?.intentClassification ?? null,
    uncertainties: result?.uncertainties ?? [],
    rawLength,
    enhancedLength: result?.enhancedPrompt?.length ?? 0,
  };
}

/** Der registrierte Listener. Genau ein `next()` — Durchreichen ist der Normalfall. */
async function onPreStep(ctx, config, payload, next) {
  const prompt = readPrompt(payload);
  if (prompt === null) return next();

  if (!AVAILABLE_MODES.includes(config.mode)) {
    // MAX braucht den Project Index (Plan §6/§7). Ohne ihn gibt es keine
    // aufloesbaren Referenzen — also wird der Modus abgelehnt, nicht weichgespuelt.
    report(ctx, config, { ...decisionRecord(config, { outcome: 'unavailable', reasons: ['MODE_NEEDS_INDEX'], result: null }, prompt.text.length) });
    return next();
  }

  const outcome = await enhance(ctx, config, prompt.text, payload.signal);
  const decision = await next();

  const messages = outcome.outcome === 'accepted'
    ? replacePrompt(decision?.messages, prompt.message, outcome.result.enhancedPrompt)
    : null;

  if (outcome.outcome === 'accepted' && messages !== null) {
    report(ctx, config, decisionRecord(config, outcome, prompt.text.length));
    return { ...decision, messages };
  }

  // Verworfen, nicht verfuegbar oder die Nachricht war nicht auffindbar: der
  // Roh-Prompt gilt unveraendert.
  const rejected = messages === null && outcome.outcome === 'accepted'
    ? { ...outcome, outcome: 'rejected', reasons: ['MESSAGE_NOT_FOUND'] }
    : outcome;
  report(ctx, config, decisionRecord(config, rejected, prompt.text.length));
  return decision;
}

/** Entscheidung emittieren. Einzige Wirkung des Listeners neben der Prompt-Ersetzung. */
function report(ctx, config, record) {
  if (!config.trace) return;
  if (record.outcome !== 'accepted') {
    const detail = record.reasons.join(', ');
    if (record.outcome === 'unavailable') console.warn(`[shinon-prompter] nicht verfuegbar (${detail}) — Roh-Prompt gilt`);
    else console.warn(`[shinon-prompter] verworfen (${detail}) — Roh-Prompt gilt`);
  }
  if (typeof ctx?.emit === 'function') ctx.emit(DECISION_CHANNEL, record);
}

/** Registriert den Enhancer. Ohne `ctx.on` oder ohne den Event-Namen: keine Registrierung, laut. */
export function apply(ctx, config) {
  if (typeof ctx?.on !== 'function') {
    console.error(`[shinon-prompter] ctx.on fehlt — ${PRE_STEP_EVENT} wurde NICHT registriert (BLOCKED)`);
    return () => {};
  }
  if (!config.observeEvents.includes(PRE_STEP_EVENT)) {
    console.log(`[shinon-prompter] ${PRE_STEP_EVENT} nicht in observeEvents — bewusst nicht registriert`);
    return () => {};
  }

  const dispose = ctx.on(PRE_STEP_EVENT, (payload, next) => onPreStep(ctx, config, payload, next));
  const route = config.provider === '' || config.model === '' ? 'ohne Route (inaktiv)' : `${config.provider}/${config.model}`;
  console.log(`[shinon-prompter] Aktiviert — registriert auf ${PRE_STEP_EVENT} (mode=${config.mode}, ${route})`);

  return () => {
    if (typeof dispose === 'function') dispose();
    console.log('[shinon-prompter] Deaktiviert — Listener abgemeldet');
  };
}
