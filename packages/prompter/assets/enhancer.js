/**
 * @shinon/prompter — enhancer.js
 *
 * Die One-Shot-Mechanik: Aufruf bauen, Strom einsammeln, Ergebnis annehmen oder
 * verwerfen — hier steht die Capability-Isolation (der Aufruf traegt kein `tools`).
 * Kein Dateisystem, kein Netz, kein Prozess-Exit (der Isolationstest pinnt das).
 */
import { resolveMode } from './mode-core.js';
import { renderContext, renderSkillsBlock } from './render-context.js';
import { acceptance, parseResult } from './result-contract.js';

/**
 * Den One-Shot-Aufruf bauen.
 *
 * Hier steht die Capability-Isolation: es gibt kein `tools`-Feld. Dazu kommen
 * nur die Felder, die `GenerateOptions` wirklich kennt — `purpose` bleibt
 * ungesetzt, weil DSH dort keine passende Klasse fuehrt.
 *
 * Der Kontextblock landet in der Nutzer-Nachricht, nicht im System-Prompt: er
 * ist Daten, und das Modell soll ihn als Daten lesen. MIN und MID bekommen ihn
 * gar nicht — ihr Modus kennt keine Projektkenntnis.
 */
export function buildEnhancerRequest({ text, mode, contract, config, context = null, stand = null, skills = null, signal }) {
  // Beide Aufrufwege sind erlaubt: der Lauf uebergibt den bereits aufgeloesten
  // Modus, ein Einzeltest den Namen. Der Name wird hier genau einmal aufgeloest.
  const resolved = contract ?? resolveMode(mode);
  const content = [{ type: 'text', text }];
  if (resolved.needsContext && context !== null) content.push({ type: 'text', text: renderContext(context) });
  // Der Stand ist ein EIGENER Block neben dem Kontext (Zug 4/5): der Kontext
  // sind Dateien, der Stand ist, was Shinon ueber sich weiss. Zwei Marken, weil
  // es zwei Fragen sind — und weil ein leerer Stand gar nicht erst angehaengt
  // wird (renderStand gibt dann null zurueck).
  if (resolved.needsContext && stand !== null && stand.block !== null) {
    content.push({ type: 'text', text: stand.block });
  }
  // Skills werden IMMER injiziert (Zug 6): unabhaengig vom Modus, unabhaengig
  // vom Kontext. Sie geben dem Modell Zugriff auf projekspezifisches Wissen.
  if (skills !== null && skills.length > 0) {
    const skillBlock = renderSkillsBlock(skills);
    if (skillBlock !== null) content.push({ type: 'text', text: skillBlock });
  }

  return {
    provider: config.provider,
    model: config.model,
    system: resolved.system,
    messages: [{ role: 'user', content }],
    // `maxTokens: 0` = kein Limit (unbegrenzte Thinking-Tokens). Das Feld
    // fehlt aus der GenerateOptions-Datei, wenn 0 steht — die LLM-Route
    // liest es nicht, sondern lässt die Antwort frei laufen.
    ...(config.maxTokens > 0 ? { maxTokens: config.maxTokens } : {}),
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
/**
 * Den Stream EINMAL zählen UND sammeln — der Diagnose-Zähler für die
 * NO_JSON-Ursache, ohne den öffentlichen `collectStream`-Vertrag anzutasten.
 *
 * „0 Zeichen“ allein unterscheidet nicht zwischen drei Ursachen: leerer
 * Provider-Stream, nur Reasoning-Chunks (Antwort nie begonnen) oder ein
 * text-delta-Chunks, dessen Textfeld anders heißt als erwartet (Fassungs-
 * Drift). Die Chunks-Zählung je Typ trennt genau diese drei Fälle.
 */
export async function collectStreamStats(stream) {
  let text = '';
  const counts = {};
  let finish = null;
  let usage = null;
  for await (const chunk of stream) {
    const type = typeof chunk?.type === 'string' ? chunk.type : '(ohne Typ)';
    counts[type] = (counts[type] ?? 0) + 1;
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
    // Der Finish-Grund und der Token-Zaehler sind der letzte Rest einer
    // antwortlosen Antwort: „usage=1, finish=1 ohne text-delta“ waere ohne sie
    // nicht unterscheidbar zwischen provider-seitigem Abbruch und Filter.
    if (chunk?.type === 'finish') finish = { reason: chunk.reason ?? '(ohne Grund)' };
    if (chunk?.type === 'usage') usage = chunk.usage ?? null;
  }
  return { text, counts, finish, usage };
}

/**
 * Einen beliebigen Wert lesbar machen — Objekte als JSON, nie als `[object Object]`.
 *
 * Gemessen am 2026-10-16: der Finish-Grund kam als `[object Object]` ins Log, und
 * damit war die letzte Information, die eine antwortlose Antwort noch trug, genau
 * unlesbar. Ein Diagnose-Log, das den Grund verschluckt, ist keiner.
 */
export function brief(value, limit = 400) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    let json;
    try { json = JSON.stringify(value); } catch { return `(${typeof value}, nicht serialisierbar)`; }
    if (typeof json !== 'string') return `(${typeof value})`;
    return json.length > limit ? `${json.slice(0, limit)}…` : json;
  }
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Die Chunks-Zählung als kurze, feste Zeile im Rohtext-Log. */
export function renderChunkCounts(counts) {
  const entries = Object.entries(counts ?? {});
  if (entries.length === 0) return 'Chunks: keine';
  return `Chunks: ${entries.map(([type, n]) => `${type}=${n}`).join(', ')}`;
}

/**
 * Was wir ueberhaupt gefragt haben — ohne diese Zeile ist ein leerer Stream nicht
 * von einer leeren ANFRAGE zu unterscheiden (Modell, Prompt-Groesse, Limit).
 */
export function describeRequest(request) {
  if (request === null || typeof request !== 'object') return 'Anfrage: (keine)';
  const first = Array.isArray(request.messages) ? request.messages[0] : undefined;
  const content = first?.content;
  const userChars = typeof content === 'string'
    ? content.length
    : Array.isArray(content)
      ? content.reduce((sum, block) => sum + (typeof block?.text === 'string' ? block.text.length : 0), 0)
      : 0;
  return [
    `Anfrage: ${brief(request.provider)}/${brief(request.model)}`,
    `System=${typeof request.system === 'string' ? request.system.length : 0}Z`,
    `Nutzer=${userChars}Z`,
    `maxTokens=${request.maxTokens === undefined ? 'keins' : brief(request.maxTokens)}`,
    `temperature=${request.temperature === undefined ? 'keine' : brief(request.temperature)}`,
  ].join(', ');
}

/** Finish-Grund + Token-Stand — die Diagnosezeile bei antwortlosem Stream. */
export function renderStreamEnd(finish, usage, request, elapsedMs) {
  const reason = finish === null ? '(kein finish-chunk)' : `reason=${brief(finish.reason)}`;
  const tokens = usage === null || typeof usage !== 'object'
    ? '(kein usage-chunk)'
    : `usage=${brief(usage)}`;
  const took = typeof elapsedMs === 'number' ? `; Dauer=${elapsedMs}ms` : '';
  return `Finish: ${reason}; Tokens: ${tokens}${took}; ${describeRequest(request)}`;
}

/**
 * Aus einer Prosa-Antwort den Vorschlag retten — statt ihn wegzuwerfen.
 *
 * Der gemessene Fall (2026-10-18): das Modell antwortet auf Deutsch statt mit
 * JSON, der One-Shot wird verworfen und der Roh-Prompt gilt. Damit greift der
 * Prompter praktisch nie. Gerettet wird nur der TEXT, nie ein Feld: Absicht,
 * Anforderungen und Referenzen bleiben unangetastet. Was nach Satzzeichen der
 * Antwort aussieht (Zaun, Vorrede, Anfuehrungszeichen), wird entfernt; ist der
 * Rest leer oder identisch mit dem Original, bleibt es beim Verwerfen.
 */
/** Bedienprosa vor der Vorrede ("Klar, gerne.") — nie Teil des Prompts. */
const PROSE_FILLER = '(?:sure|okay|ok|klar|gerne|gern|natürlich|natuerlich|sicher|also|nun|gut|well|alright|all right|of course|certainly)';
/** Die Vorrede, optional von bis zu vier Fuellwoertern angefuehrt, nur am Anfang. */
const PROSE_PREAMBLE = new RegExp(
  '^(?:' + PROSE_FILLER + '[^\\p{L}\\p{N}]*){0,4}'
    + '(?:sure|okay|ok|gerne|gern|hier ist|hier sind|here is|the improved prompt|verbesserter prompt|verbesserte fassung)'
    + '[^\\n]{0,80}:\\s*',
  'iu',
);

export function salvageProse(text, rawPrompt = '') {
  if (typeof text !== 'string') return null;
  let body = text.trim();
  if (body === '') return null;
  // Sieht die Antwort nach einem VERSUCHTEN JSON aus, ist sie kein Prompt:
  // ein kaputter Objekttext als Veredelung waere schlimmer als der Roh-Prompt.
  if (/^[{[]/.test(body)) return null;
  if (/^```/.test(body)) {
    // Die ganze Antwort ist ein Zaun — auch ohne schliessende Marke (abgeschnitten).
    // Ohne diesen Schritt passiert ein halbes JSON die Sperre oben als "Prosa".
    body = body
      .replace(/^```[a-z0-9_-]*[ \t]*\r?\n?/i, '')
      .replace(/\r?\n?```[ \t]*$/i, '')
      .trim();
    if (/^[{[]/.test(body)) return null;
  } else {
    const fence = /```[a-z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/i.exec(body);
    if (fence !== null) {
      body = fence[1].trim();
      // Nach dem Auspacken dieselbe Sperre: JSON im Zaun ist kein Prompt.
      if (/^[{[]/.test(body)) return null;
    }
  }
  body = body.replace(PROSE_PREAMBLE, '').trim();
  body = body.replace(/^["'„“]([\s\S]*)["'“”]$/, '$1').trim();
  if (body.length < 8 || !/\p{L}/u.test(body)) return null;
  // ANKER: eine echte Veredelung nennt den Auftrag weiter. Eine ANTWORT auf die
  // Frage traegt andere Woerter — sie darf den Prompt nicht ersetzen.
  const words = (value) => new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []));
  const anchor = words(rawPrompt);
  if (anchor.size > 0) {
    const candidate = words(body);
    const shared = [...anchor].filter((word) => candidate.has(word)).length;
    if (shared / anchor.size < 0.35) return null;
  }
  return body;
}

/**
 * Die verworfene One-Shot-Antwort mitschreiben — die eine Quelle fuer die
 * NO_JSON-Diagnose.
 *
 * Vorher fiel der Rohtext bei JEDEM Verwerfen still weg: der Sitzungsverlauf
 * nannte den Grund (NO_JSON), aber nie, was das Modell tatsaechlich geantwortet
 * hatte — die Ursache blieb damit undiagnostizierbar (gemessen am Fehlerfall
 * 2026-10-16). Deshalb steht hier der volle Text auf stderr, NUR auf dem seltenen
 * Verwerfungsweg (kein Dauer-Log im Normalbetrieb). Kein Dateischreiben: der
 * Isolationstest verbietet writeFile im Laufzeitcode dieses Pakets, und die
 * Spur ueber DECISION_CHANNEL traegt bewusst keinen Prompt-Text.
 * Länge begrenzt (6000 Zeichen), damit eine unerwartet riesige Antwort den
 * Terminal-Log nicht sprengt — der Anfang ist immer vollstaendig sichtbar.
 */
export function logRejectedAnswer(reasons, text, counts, finish, usage, request, elapsedMs) {
  const body = typeof text === 'string' ? text : '';
  const shown = body.length > 6000
    ? `${body.slice(0, 6000)} …[+${body.length - 6000} Zeichen abgeschnitten]`
    : body;
  console.warn(
    `[shinon-prompter] verworfene One-Shot-Antwort (${reasons.join(', ')}), ${body.length} Zeichen — ${renderChunkCounts(counts)}; ${renderStreamEnd(finish, usage, request, elapsedMs)}:\n${shown === '' ? '(leere Antwort — kein einziges text-delta-Chunk mit Text?)' : shown}`,
  );
}

export async function enhance(ctx, contract, config, prompt, context, stand, skills, signal) {
  if (typeof config.provider !== 'string' || config.provider === '' || typeof config.model !== 'string' || config.model === '') {
    return { outcome: 'unavailable', reasons: ['NO_ROUTE'], result: null };
  }
  if (typeof ctx?.llm?.stream !== 'function') {
    return { outcome: 'unavailable', reasons: ['NO_LLM_SERVICE'], result: null };
  }

  // `timeoutMs === 0` heisst KEIN Deckel (Dev-Betrieb: ausreizen und messen).
  // Negative Werte bleiben der Fehlerpfad: AbortSignal.timeout wirft dort
  // RangeError, und das wird zu einem benannten Verwerfen statt zu einem Wurf.
  const timeout = config.timeoutMs === 0 ? null : AbortSignal.timeout(config.timeoutMs);
  const combined = timeout === null
    ? signal
    : (signal === undefined ? timeout : AbortSignal.any([signal, timeout]));

  const request = buildEnhancerRequest({ text: prompt, contract, config, context, stand, skills, signal: combined });

  let text;
  let counts;
  let finish;
  let usage;
  const started = Date.now();
  try {
    ({ text, counts, finish, usage } = await collectStreamStats(ctx.llm.stream(request)));
  } catch (error) {
    // Ein werfender Aufruf ist die vierte Ursache fuer „kein Ergebnis" und war
    // bisher stumm: Abort (Zeitlimit/Signal), Netzfehler und Provider-Fehler
    // sehen hier alle gleich aus, deshalb Name, Text und Dauer mit ins Log.
    console.warn(
      `[shinon-prompter] One-Shot fehlgeschlagen (LLM_FAILED:${error?.name ?? 'Error'}) nach ${Date.now() - started}ms: ${brief(error?.message ?? error)}; ${describeRequest(request)}`,
    );
    return { outcome: 'rejected', reasons: [`LLM_FAILED:${error?.name ?? 'Error'}`], result: null };
  }
  const elapsedMs = Date.now() - started;

  const parsed = parseResult(text, { mode: config.mode });
  if (!parsed.ok) {
    // Kein JSON ist kein Grund, den Vorschlag wegzuwerfen: der Text der Antwort
    // wird uebernommen (SALVAGED_PROSE), sofern er sich vom Original unterscheidet.
    const salvageable = parsed.reasons.some((reason) => reason === 'NO_JSON' || reason === 'INVALID_JSON');
    const salvaged = salvageable ? salvageProse(text, prompt) : null;
    if (salvaged !== null && salvaged !== prompt.trim()) {
      console.log(`[shinon-prompter] One-Shot: Ergebnis angenommen (SALVAGED_PROSE:${parsed.reasons.join(', ')}), ${salvaged.length} Zeichen — ${renderStreamEnd(finish, usage, request, elapsedMs)}`);
      return {
        outcome: 'accepted',
        reasons: ['SALVAGED_PROSE'],
        // Die Messung reist mit: warum gerettet (NO_JSON/INVALID_JSON), wie
        // viele Zeichen uebernommen wurden und wie lang die ganze Antwort war.
        salvage: { reason: parsed.reasons.join('+'), chars: salvaged.length, answerChars: text.length },
        result: { enhancedPrompt: salvaged, preservedIntent: true, addedRequirements: [], removedRequirements: [], uncertainties: [], references: [] },
      };
    }
    logRejectedAnswer(parsed.reasons, text, counts, finish, usage, request, elapsedMs);
    return { outcome: 'rejected', reasons: parsed.reasons, result: null };
  }

  const decision = acceptance(parsed.result, { needsContext: contract.needsContext, context });
  if (!decision.accepted) {
    logRejectedAnswer(decision.reasons, text, counts, finish, usage, request, elapsedMs);
    return { outcome: 'rejected', reasons: decision.reasons, result: parsed.result };
  }
  // Auch der ANGENOMMENE Lauf wird gemessen: Ausgang, Tokens und Dauer sind die
  // Zahlen der Auslastungsmessung (`.shinon/dev/auslastung.mjs` liest diese Zeile).
  console.log(`[shinon-prompter] One-Shot: Ergebnis angenommen, ${text.length} Zeichen — ${renderStreamEnd(finish, usage, request, elapsedMs)}`);
  return { outcome: 'accepted', reasons: [], result: parsed.result };
}

/**
 * Den One-Shot fahren, ohne dass ein Fehler in UNSEREM Code den Schritt bricht.
 *
 * `enhance` soll nie werfen — aber „soll" ist keine Zusage, und der Fall ist
 * nicht theoretisch: die Signal-Konstruktion im Aufruf wirft bei kaputter
 * Konfiguration (gemessen: `timeoutMs: -1` → RangeError ERR_OUT_OF_RANGE,
 * `NaN` → RangeError, ein fremdes Signal → TypeError) und liegt VOR dem try des
 * Modellaufrufs. Ein werfender Aufruf waere kein Fallback, sondern ein kaputter
 * Nutzer-Schritt: der Loop saehe den Enhancer, den es nicht geben darf. Deshalb
 * wird jeder solche Fall zu einem benannten Verwerfen — Roh-Prompt gilt, Grund steht.
 *
 * Die Grenze ist bewusst schmal: Fehler von `next()` sind NICHT unsere Fehler
 * und werden hier nicht gefangen (siehe onPreStep).
 */
export async function enhanceGuarded(ctx, contract, config, prompt, context, stand, skills, signal) {
  try {
    return await enhance(ctx, contract, config, prompt, context, stand, skills, signal);
  } catch (error) {
    const name = error?.constructor?.name ?? 'Error';
    // Der Grund bleibt kurz (INTERNAL_ERROR:<Name>), die Ursache steht im Log:
    // ein fail-open-Pfad, der nicht sagt, WAS scheiterte, ist nicht bedienbar.
    console.error(`[shinon-prompter] interner Fehler (${name}: ${error?.message ?? error}) — Roh-Prompt gilt`);
    return { outcome: 'rejected', reasons: [`INTERNAL_ERROR:${name}`], result: null };
  }
}


