/**
 * @shinon/prompter — enhancer.js
 *
 * Die One-Shot-Mechanik: Aufruf bauen, Strom einsammeln, Ergebnis annehmen oder
 * verwerfen — hier steht die Capability-Isolation (der Aufruf traegt kein `tools`).
 * Kein Dateisystem, kein Netz, kein Prozess-Exit (der Isolationstest pinnt das).
 */
import { resolveMode } from './mode-core.js';
import { renderContext } from './render-context.js';
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
export function buildEnhancerRequest({ text, mode, contract, config, context = null, stand = null, signal }) {
  // Beide Aufrufwege sind erlaubt: der Lauf uebergibt den bereits aufgeloesten
  // Modus, ein Einzeltest den Namen. Der Name wird hier genau einmal aufgeloest.
  const resolved = contract ?? resolveMode(mode);
  const content = [{ type: 'text', text }];
  if (resolved.needsContext && context !== null) content.push({ type: 'text', text: renderContext(context) });
  // Der Stand ist ein EIGENER Block neben dem Kontext (Zug 4/5): der Kontext
  // sind Dateien, der Stand sind die passenden Zettel. Zwei Marken, weil es
  // zwei Fragen sind — und weil ein leerer Stand gar nicht erst angehaengt
  // wird (renderStand gibt dann null zurueck, wenn kein Zettel passt).
  // Skills stehen NICHT hier: der Veredler redigiert Text, die ausfuehrbaren
  // Skill-Inhalte bleiben der nativen DSH-Skill-Discovery des Hauptagenten.
  if (resolved.needsContext && stand !== null && stand.block !== null) {
    content.push({ type: 'text', text: stand.block });
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
/**
 * EIGENE Textbloecke an eine Nachricht anhaengen — ohne ihren Text zu
 * veraendern.
 *
 * WOFUER: der Projektkontext ist Wissen ueber das Projekt, keine Veredelung
 * des Auftrags. Er muss auch dann ankommen, wenn der Veredler den Auftrag
 * NICHT zurueckgibt (NO_JSON, abgelehntes Ergebnis) — ueber den Auftragstext
 * allein verliert er ihn dann.
 *
 * Der Auftragstext bleibt unangetastet: `content[0]` ist weiterhin der
 * Auftrag, die zusaetzlichen Bloecke kommen DANACH. Das haelt den Vertrag
 * "Roh-Prompt bleibt erhalten" (prompter-contract.test.mjs) und gibt dem
 * Modell trotzdem den Kontext.
 *
 * @param {unknown[]} messages die Nachrichtenliste
 * @param {object} original die Nachricht, an die angehaengt wird
 * @param {string[]} bloecke die Kontext-Bloecke (in Reihenfolge)
 * @param {string} [wissen] der Wissensblock (haengt am Prompt-Text)
 * @returns {unknown[]|null} die neue Liste, oder null wenn die Nachricht fehlt
 */
export function appendBlocks(messages, original, bloecke, wissen = '') {
  if (!Array.isArray(messages)) return null;
  const index = messages.indexOf(original);
  if (index === -1) return null;
  const message = messages[index];
  const inhalt = Array.isArray(message.content) ? message.content : [];
  // Der Wissensblock gehoert ans ENDE des Auftragstexts (er ergaenzt die
  // Aufgabe); der Kontext ist ein eigener Block DANEBEN.
  const text = wissen === '' ? null : `${ersterText(inhalt) ?? ''}\n\n${wissen}`;
  const content = [];
  let ersterTextGebraucht = text !== null;
  for (const block of inhalt) {
    if (block?.type === 'text') {
      if (ersterTextGebraucht) {
        content.push({ ...block, text });
        ersterTextGebraucht = false;
        continue;
      }
      content.push(block);
      continue;
    }
    content.push(block);
  }
  for (const eigener of bloecke) content.push({ type: 'text', text: eigener });
  const next = messages.slice();
  next[index] = { ...message, content };
  return next;
}

/** Der Text des ersten Textblocks — oder null, wenn es keinen gibt. */
function ersterText(inhalt) {
  for (const block of inhalt) {
    if (block?.type === 'text' && typeof block.text === 'string') return block.text;
  }
  return null;
}

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
 * Eine Prosa-Antwort KLASSIFIZIEREN — als Befund, nicht als Vorschlag.
 *
 * Fruher war das ein Rettungspfad: der Text der Antwort ersetzte den Auftrag
 * des Menschen. Seit 2026-10-23 nicht mehr. Der Grund ist gemessen und war
 * reproduzierbar: eine Antwort ausserhalb des Vertrags ist eine ANTWORT, und
 * wenn sie erklaert, wie der Veredler arbeitet, stand die interne Anweisung
 * danach als Nutzernachricht in der Sitzung — und der Scoring-Merkzettel fuehrte
 * sie als vorherige FRAGE des Menschen. Ein Text, der den Auftrag nicht belegt
 * weiterfuehrt, darf den Auftrag nicht werden; er wird benannt (`SALVAGED_PROSE`),
 * gezaehlt und verworfen, und der Roh-Prompt gilt.
 *
 * Was die Funktion noch tut: aus der Antwort den Kern schaelen, damit der Grund
 * eine Zeichenzahl traegt und die Diagnose nicht die Vorrede mitzaehlt. Sie gibt
 * weiterhin `null` zurueck, wenn die Antwort keine Prosa ueber den Auftrag ist.
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
/*
 * Der zweite Fall: ein Füllwort OHNE Vorrede ("Klar. Baue …"). Er wurde
 * gemessen 2026-10-19: `PROSE_PREAMBLE` verlangt eine Vorrede, also blieb das
 * Füllwort stehen und der Anker-Check nahm die ganze Antwort an — die Plauderei
 * wurde zum Prompt. Hier fällt nur eine ANERKENNUNG am Satzanfang weg, nie ein
 * Inhaltswort: die enge Liste lässt `gut`, `also` und `nun` bewusst aus, weil
 * diese Wörter auch einen echten Auftrag beginnen können ("Gut. Prüfe …").
 */
const PROSE_ACK = '(?:sure|okay|ok|klar|gerne|gern|natürlich|natuerlich|sicher|of course|certainly|alright|all right)';
const PROSE_LEAD = new RegExp(
  '^(?:' + PROSE_ACK + '[\\s,.;:!?—–-]+){1,4}',
  'iu',
);

/*
 * Eine ANTWORT ist kein Vorschlag. Gemessen 2026-10-19 an den echten
 * Assistenten-Antworten der Sitzungslogs: 18 von 93 Antworten gingen als
 * GANZER Text durch, weil der Anker-Check bei kurzen Auftraegen fast alles
 * findet. Diese Formen verraten die Antwort, bevor der Anker sie rettet:
 * Markdown-Kopf, Tabelle, Berichtslabel ("Gemacht/Gefunden/Risiko/Tests/Offen")
 * und die direkte Anrede ("Nö.", "Hast du …", "Schon beantwortet",
 * "Kurze Antwort", "Tamam", "Verstanden"). Fail-closed: dann gilt der Roh-Prompt.
 */
/** `\b` kennt nur ASCII: neben `ö` in "Nö." gäbe es keine Wortgrenze. */
const END_WORD = '(?![\\p{L}\\p{N}])';
const ANSWER_OPEN = [
  /^#{1,6}\s/u,
  /^\|/u,
  new RegExp(`^\\*{0,2}(?:gemacht|gefunden|risiko|tests|offen|antwort)${END_WORD}`, 'iu'),
  new RegExp(`^(?:nö|no|nein|ja|doch|genau|stimmt|tamam|verstanden|hast du|schon beantwortet|die nachricht wirkt|kurze antwort)${END_WORD}`, 'iu'),
  new RegExp(`^alles klar${END_WORD}`, 'iu'),
  /^kurz\s*[,:.!]/iu,
];

/** Frageformen — eine Antwort auf eine Frage ist keine Veredelung. */
const QUESTION_OPEN = /^\s*(?:was|wie|wer|wo|wann|warum|wieso|weshalb|welche[rsnm]?|welchen|welchem|kann|kannst|können|könntest|ist|sind|war|hat|haben|gibt es|darf|soll|sollte|what|how|who|where|when|which|why|can|could|is|are|do|does|did|should|would)(?![\p{L}\p{N}])/iu;

/**
 * Antwortlänge: eine Veredelung bleibt in der Größenordnung des Auftrags.
 * Eine Frage verträgt weniger Zuwachs als ein knapper Auftrag (3× statt 5×),
 * weil die Antwort auf eine Frage ein Text ÜBER sie ist — nie ihr Prompt.
 */
const looksLikeAnswer = (body, rawPrompt) => {
  const raw = rawPrompt.trim();
  if (raw === '') return false;
  const question = /\?\s*$/.test(raw) || QUESTION_OPEN.test(raw);
  return body.length > Math.max(240, raw.length * (question ? 3 : 5));
};

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
  body = body.replace(PROSE_LEAD, '').trim();
  body = body.replace(/^["'„“]([\s\S]*)["'“”]$/, '$1').trim();
  if (body.length < 8 || !/\p{L}/u.test(body)) return null;
  // Antwortform und Antwortlänge sind Ausschlussgründe, keine Kürzung: was
  // nach Bericht oder Gegenrede aussieht, ist kein Prompt, den man vorne
  // abschneiden könnte — der Rest wäre immer noch die Antwort.
  if (ANSWER_OPEN.some((pattern) => pattern.test(body))) return null;
  if (looksLikeAnswer(body, rawPrompt)) return null;
  // ANKER: eine echte Veredelung nennt den Auftrag weiter. Eine ANTWORT auf die
  // Frage traegt andere Woerter — sie darf den Prompt nicht ersetzen.
  const words = (value) => new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []));
  const anchor = words(rawPrompt);
  // OHNE Anker gibt es keinen Beleg, dass der Text den Auftrag weiterfuehrt:
  // ein Ein-Wort-Auftrag ("nn") ist kein Freibrief fuer beliebige Prosa.
  if (anchor.size === 0) return null;
  const candidate = words(body);
  const shared = [...anchor].filter((word) => candidate.has(word)).length;
  if (shared / anchor.size < 0.35) return null;
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

/**
 * Der Host bekommt jede verworfene Antwort ueber `onReject` — fuer das
 * Probe-Journal. Der Enhancer selbst schreibt NIE eine Datei (Isolationstest).
 * Ein Fehler des Journals darf den Schritt nicht brechen.
 */
function journalRejection(onReject, config, prompt, outcome, text = null) {
  // Nur eine echte ANTWORT ist ein Beleg: ein Provider-Fehler ohne Text haette
  // im Journal nichts zu zeigen (er steht schon auf stderr).
  if (typeof onReject !== 'function' || typeof text !== 'string') return outcome;
  try {
    onReject({
      contract: 'shinon.prompter/one-shot-journal-v1',
      reasons: outcome.reasons,
      mode: config.mode,
      provider: config.provider,
      model: config.model,
      prompt: typeof prompt === 'string' ? prompt.slice(0, 4000) : '',
      answer: typeof text === 'string' ? text.slice(0, 6000) : null,
      answerChars: typeof text === 'string' ? text.length : 0,
    });
  } catch { /* Journal ist Diagnose, kein Vertrag */ }
  return outcome;
}

export async function enhance(ctx, contract, config, prompt, context, stand, signal, onReject = null) {
  if (typeof config.provider !== 'string' || config.provider === '' || typeof config.model !== 'string' || config.model === '') {
    return journalRejection(onReject, config, prompt, { outcome: 'unavailable', reasons: ['NO_ROUTE'], result: null });
  }
  if (typeof ctx?.llm?.stream !== 'function') {
    return journalRejection(onReject, config, prompt, { outcome: 'unavailable', reasons: ['NO_LLM_SERVICE'], result: null });
  }

  // `timeoutMs === 0` heisst KEIN Deckel (Dev-Betrieb: ausreizen und messen).
  // Negative Werte bleiben der Fehlerpfad: AbortSignal.timeout wirft dort
  // RangeError, und das wird zu einem benannten Verwerfen statt zu einem Wurf.
  const timeout = config.timeoutMs === 0 ? null : AbortSignal.timeout(config.timeoutMs);
  const combined = timeout === null
    ? signal
    : (signal === undefined ? timeout : AbortSignal.any([signal, timeout]));

  const request = buildEnhancerRequest({ text: prompt, contract, config, context, stand, signal: combined });

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
    // Der Fehler selbst reist als DATEN mit: die Klassifikation (Timeout,
    // Abbruch, Netzfehler) ist Sache von `abort-core.js`, nicht dieser Datei.
    return journalRejection(onReject, config, prompt, {
      outcome: 'rejected',
      reasons: [`LLM_FAILED:${error?.name ?? 'Error'}`],
      failure: { name: error?.name ?? 'Error', message: brief(error?.message ?? error) },
      result: null,
    });
  }
  const elapsedMs = Date.now() - started;

  // Eine Antwort ohne ein einziges Zeichen ist eine EIGENE Ursache. Sie landete
  // bisher als `NO_JSON` im Datensatz — derselbe Grund wie eine falsch
  // formatierte Antwort, obwohl hier gar keine Antwort war. `failure.finish`
  // reist mit, damit ein abgebrochener Strom weiterhin als `TIMEOUT` zählt und
  // nicht als leerer Strom (`abort-reasons.json` prüft in dieser Reihenfolge).
  if (text.trim() === '') {
    logRejectedAnswer(['EMPTY_STREAM'], text, counts, finish, usage, request, elapsedMs);
    return journalRejection(onReject, config, prompt, {
      outcome: 'rejected',
      reasons: ['EMPTY_STREAM'],
      failure: { finish: finish?.reason ?? null },
      result: null,
    }, text);
  }

  const parsed = parseResult(text, { mode: config.mode });
  if (!parsed.ok) {
    // Ein Ergebnis ausserhalb des Vertrags ERSETZT NICHTS. Die Antwort wird
    // klassifiziert (`SALVAGED_PROSE`), damit der Grund nachpruefbar bleibt —
    // uebernommen wird sie nicht. Die Alternative war gemessen: nach einem
    // One-Shot, der die eigene Veredler-Anweisung wiederholte, stand diese
    // Anweisung als Nutzernachricht in der Sitzung und als vorherige Frage im
    // Scoring-Merkzettel. Ein fehlerhaftes Ergebnis ist ein Befund, kein Prompt.
    const salvageable = parsed.reasons.some((reason) => reason === 'NO_JSON' || reason === 'INVALID_JSON');
    const salvaged = salvageable ? salvageProse(text, prompt) : null;
    const applied = false;
    const reasons = salvaged === null ? parsed.reasons : [...parsed.reasons, 'SALVAGED_PROSE'];
    if (salvaged !== null) {
      console.warn(
        `[shinon-prompter] Prosa NICHT uebernommen (SALVAGED_PROSE: ${parsed.reasons.join(', ')}, ${salvaged.length} von ${text.length} Zeichen) — Roh-Prompt gilt; ${renderStreamEnd(finish, usage, request, elapsedMs)}`,
      );
    }
    logRejectedAnswer(reasons, text, counts, finish, usage, request, elapsedMs);
    // Ein abgebrochener Stream ist KEIN Formatfehler: `finish.reason` nennt den
    // Abbruch (`{kind:'aborted', failure:{message:'Request was aborted'}}`), und
    // ohne dieses Feld wäre "Timeout" im Datensatz nicht mehr zu erkennen.
    return journalRejection(onReject, config, prompt, {
      outcome: 'rejected',
      reasons,
      // Die Prosa reist als BEFUND mit, nicht als Prompt: `applied: false` sagt
      // ausdruecklich, dass sie nirgends angekommen ist.
      salvage: salvaged === null
        ? null
        : { reason: parsed.reasons.join('+'), chars: salvaged.length, answerChars: text.length, applied },
      failure: { finish: finish?.reason ?? null },
      result: null,
    }, text);
  }

  // `strictFacts` kommt aus dem Aufrufer und gilt NUR fuer den wissensgebundenen
  // Weg (Zug 4). Ohne die Angabe bleibt das Verhalten des Standardwegs gleich.
  const decision = acceptance(parsed.result, { needsContext: contract.needsContext, context, strictFacts: config.strictFacts === true });
  if (!decision.accepted) {
    logRejectedAnswer(decision.reasons, text, counts, finish, usage, request, elapsedMs);
    return journalRejection(onReject, config, prompt, { outcome: 'rejected', reasons: decision.reasons, result: parsed.result }, text);
  }
  // Auch der ANGENOMMENE Lauf wird gemessen: Ausgang, Tokens und Dauer sind die
  // Zahlen der Auslastungsmessung (`scripts/dev/auslastung.mjs` liest diese Zeile).
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
export async function enhanceGuarded(ctx, contract, config, prompt, context, stand, signal, onReject = null) {
  try {
    return await enhance(ctx, contract, config, prompt, context, stand, signal, onReject);
  } catch (error) {
    const name = error?.constructor?.name ?? 'Error';
    // Der Grund bleibt kurz (INTERNAL_ERROR:<Name>), die Ursache steht im Log:
    // ein fail-open-Pfad, der nicht sagt, WAS scheiterte, ist nicht bedienbar.
    console.error(`[shinon-prompter] interner Fehler (${name}: ${error?.message ?? error}) — Roh-Prompt gilt`);
    return journalRejection(onReject, config, prompt, { outcome: 'rejected', reasons: [`INTERNAL_ERROR:${name}`], result: null });
  }
}


