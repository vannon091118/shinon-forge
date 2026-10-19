/**
 * shinon-token-usage - Token-Anzeige (Client-Hälfte)
 *
 * DIE NAHT, aus der diese Anzeige ihre Zahl nimmt (gemessen, nicht erfunden):
 *  1. **Je Turn** — DSH führt das Ereignisfenster der offenen Sitzung als
 *     `SessionEventSource` („Observable contiguous Session event window") an der
 *     Sitzungs-Bindung. Aus den dauerhaften Ereignissen eines Turns
 *     (`turn/start` … `turn/end`) rechnet DSHs eigenes Chat-Bundle seine Zeile
 *     „Usage 18.5K tok" mit `deriveTurnTokenUsage`. Diese Hälfte liest DIESES
 *     Fenster (`ctx.get?.('sessions')` → `binding(id).eventSource`) und faltet
 *     die Turn-Ereignisse mit derselben Regel — sie erfindet kein Ereignis und
 *     keinen Projektionsschlüssel.
 *  2. **Je Sitzung** — die Sitzungs-Projektion `tokenUsage`
 *     (`@deepseek-ai/dsh-token-meter`), im Browser über
 *     `binding.session.projections.faceOf(key)` gelesen (der Weg, den
 *     `useProjection` nennt). Sie steht im Titel und ist der sichtbare Rückfall,
 *     wenn für keinen Turn eine Beweislage vorliegt.
 *  Welche Sitzung gezeigt wird, sagt die Vorgabe-Bindung des Renderers
 *  (`ctx.get?.('uiSession')` → `adapter.current`).
 *
 * Die Regel selbst (Faltung, Prozent, Form) steht NICHT hier als zweite Quelle:
 * sie ist eine **bytegleiche Region** mit `packages/token-usage/assets/token-core.js`.
 * Deshalb beginnen diese Zeilen in der Region ohne Einrückung — die
 * Zwillings-Regel in `scripts/lib/repo.mjs` (`SOURCE_TWINS`) vergleicht sie
 * zeichengenau, und `npm run idioms:check` / Gate / Build lassen Drift auffallen.
 *
 * 'sidebar.footer.action' ist eine list und verlangt daher options.id.
 */
window.__ModuleLoader__.load({
  id: '@shinon/token-usage',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/token-usage';

    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/token.css`, `
      .dsh-token-display {
        transition: all 0.2s ease;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
    `);

    // ---------------------------------------------------------------------
    // Die Regel: bytegleiche Zwillings-Region mit
    // packages/token-usage/assets/token-core.js (Besitzer steht dort).
    // ---------------------------------------------------------------------
// #region zwilling:token-turn — Besitzer: packages/token-usage/assets/token-core.js; Spiegel: packages/token-usage/client.js (bytegleich, scripts/lib/repo.mjs)
const TOKEN_USAGE_KEY = 'tokenUsage';

/** Der letzte rohe Chunk einer nie gepackten Art (Port von `lastAssistantStreamChunk`). */
function lastAssistantStreamChunk(stream, type) {
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (record.type === 'chunk' && record.chunk.type === type) return record.chunk;
  }
  return undefined;
}

/** Port von `isCount` (`dsh-token-meter/lib/types/turn-usage.js`). */
function isCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Port von `safeSum`: eine Summe jenseits sicherer Ganzzahlen ist keine Zahl. */
function safeSum(values) {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) return undefined;
  }
  return total;
}

/** Port von `messageRoute`: nur eine vollständige Anbieter/Modell-Angabe zählt. */
function messageRoute(message) {
  const { provider, model } = message.source;
  return provider.length > 0 && model.length > 0 ? { provider, model } : undefined;
}

/** Port von `streamUsage`: die Usage des letzten `usage`-Chunks eines Versuchs. */
function streamUsage(stream) {
  return lastAssistantStreamChunk(stream, 'usage')?.usage;
}

/** Port von `normalizeUsage`: eine unsichere oder widersprüchliche Probe fällt ganz weg. */
function normalizeUsage(usage, route) {
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens } = usage;
  if (!isCount(inputTokens) || !isCount(outputTokens)) return undefined;
  if (cacheReadTokens !== undefined && !isCount(cacheReadTokens)) return undefined;
  if (cacheWriteTokens !== undefined && !isCount(cacheWriteTokens)) return undefined;
  if (reasoningTokens !== undefined && (!isCount(reasoningTokens) || reasoningTokens > outputTokens)) return undefined;
  const knownPrompt = safeSum([
    inputTokens,
    ...(cacheReadTokens === undefined ? [] : [cacheReadTokens]),
    ...(cacheWriteTokens === undefined ? [] : [cacheWriteTokens]),
  ]);
  if (knownPrompt === undefined) return undefined;
  let exactTotal;
  if (totalTokens !== undefined) {
    if (!isCount(totalTokens)) return undefined;
    const exactPrompt = totalTokens - outputTokens;
    if (!isCount(exactPrompt) || exactPrompt < knownPrompt) return undefined;
    if (cacheReadTokens !== undefined && cacheWriteTokens !== undefined && exactPrompt !== knownPrompt) return undefined;
    exactTotal = totalTokens;
  } else {
    if (cacheReadTokens === undefined || cacheWriteTokens === undefined) return undefined;
    const derivedTotal = safeSum([knownPrompt, outputTokens]);
    if (derivedTotal === undefined) return undefined;
    exactTotal = derivedTotal;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens: exactTotal,
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(route === undefined ? {} : { route }),
  };
}

/** Port von `aggregateAttempts`: optionale Buckets nur, wenn JEDER Versuch sie meldet. */
function aggregateAttempts(attempts) {
  if (attempts.length === 0) return undefined;
  const inputTokens = safeSum(attempts.map((attempt) => attempt.inputTokens));
  const outputTokens = safeSum(attempts.map((attempt) => attempt.outputTokens));
  const totalTokens = safeSum(attempts.map((attempt) => attempt.totalTokens));
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) return undefined;
  const cacheRead = attempts.map((attempt) => attempt.cacheReadTokens);
  const cacheWrite = attempts.map((attempt) => attempt.cacheWriteTokens);
  const reasoning = attempts.map((attempt) => attempt.reasoningTokens);
  const cacheReadTokens = cacheRead.every(isCount) ? safeSum(cacheRead) : undefined;
  const cacheWriteTokens = cacheWrite.every(isCount) ? safeSum(cacheWrite) : undefined;
  const reasoningTokens = reasoning.every(isCount) ? safeSum(reasoning) : undefined;
  let routes;
  const attributed = attempts.map((attempt) => attempt.route);
  if (attributed.every((route) => route !== undefined)) {
    const unique = new Map();
    for (const route of attributed) unique.set(`${route.provider}\0${route.model}`, route);
    routes = [...unique.values()];
  }
  return {
    uncachedInputTokens: inputTokens,
    outputTokens,
    totalTokens,
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(routes === undefined ? {} : { routes }),
  };
}

/** Port von `sameAttempt`. */
function sameAttempt(state, turn, step) {
  return state.turn === turn && state.step === step;
}

/**
 * Port von `deriveTurnTokenUsage`: faltet den Versuchs-Lebenslauf EINES Turns zu
 * exakten Anbieter-Zahlen.
 *
 * Kein Versuch wird aus einer Usage-Probe geschlossen. Fehlt eine
 * Lebenslauf-Grenze, ist eine Usage unvollständig oder widerspricht die exakte
 * Summe den Buckets, ist die ganze Offenlegung nicht verfügbar (`undefined`) —
 * die Anzeige fällt dann sichtbar auf ihren Stand zurück statt zu schätzen.
 * @param events - turn-lokale dauerhafte Ereignisse von `turn/start` bis `turn/end`.
 * @returns exakte Aggregat-Usage oder undefined, wenn sie nicht beweisbar ist.
 */
function deriveTurnUsage(events) {
  let state = { kind: 'idle' };
  const attempts = [];
  let turn;
  let sawEnd = false;
  let invalid = false;
  const closeOpen = (route) => {
    if (state.kind !== 'open' || state.sample === undefined) return false;
    const normalized = normalizeUsage(state.sample, route);
    if (normalized === undefined) return false;
    attempts.push(normalized);
    return true;
  };
  for (const event of events) {
    if (invalid) break;
    if (event.type === 'turn/start') {
      if (turn !== undefined || state.kind !== 'idle') invalid = true;
      else turn = event.data.turn;
      continue;
    }
    if (turn === undefined) {
      invalid = true;
      break;
    }
    if (event.type === 'turn/end') {
      if (event.data.turn !== turn || state.kind !== 'idle' || sawEnd) invalid = true;
      else sawEnd = true;
      continue;
    }
    if (sawEnd) {
      invalid = true;
      break;
    }
    if (event.type === 'step/start') {
      if (event.data.turn !== turn || state.kind !== 'idle') invalid = true;
      else state = { kind: 'open', turn, step: event.data.step };
      continue;
    }
    if (event.type === 'llm/retry-started') {
      if (event.data.turn !== turn || state.kind !== 'settled' || state.by !== 'retry' || !sameAttempt(state, event.data.turn, event.data.step)) invalid = true;
      else state = { kind: 'open', turn, step: event.data.step };
      continue;
    }
    if (event.type === 'assistant/attempt') {
      if (event.data.turn !== turn || state.kind !== 'open' || !sameAttempt(state, event.data.turn, event.data.step)) {
        invalid = true;
        continue;
      }
      const sample = streamUsage(event.data.stream) ?? state.sample;
      state = { kind: 'open', turn, step: event.data.step, ...(sample === undefined ? {} : { sample }) };
      if (!closeOpen()) invalid = true;
      else state = { kind: 'finishClosed', turn, step: event.data.step };
      continue;
    }
    if (event.type === 'assistant/message') {
      if (event.data.turn !== turn || state.kind !== 'open' || !sameAttempt(state, event.data.turn, event.data.step)) {
        invalid = true;
        continue;
      }
      const sample = event.data.usage ?? streamUsage(event.data.stream);
      if (sample !== undefined) state = { ...state, sample };
      if (!closeOpen(messageRoute(event.data.message))) invalid = true;
      else state = { kind: 'settled', turn, step: event.data.step, by: 'message' };
      continue;
    }
    if (event.type === 'llm/retry') {
      if (event.data.turn !== turn || state.kind === 'idle' || !sameAttempt(state, event.data.turn, event.data.step)) {
        invalid = true;
        continue;
      }
      if (state.kind === 'settled' || (state.kind === 'open' && !closeOpen())) invalid = true;
      if (!invalid) state = { kind: 'settled', turn, step: event.data.step, by: 'retry' };
      continue;
    }
    if (event.type === 'step/end') {
      if (event.data.turn !== turn || state.kind === 'idle' || !sameAttempt(state, event.data.turn, event.data.step)) {
        invalid = true;
        continue;
      }
      if (state.kind === 'open' && !closeOpen()) invalid = true;
      if (!invalid) state = { kind: 'idle' };
    }
  }
  return invalid || !sawEnd || state.kind !== 'idle' ? undefined : aggregateAttempts(attempts);
}

/**
 * Der jüngste VOLLSTÄNDIGE Turn im Ereignisfenster: sein `turn/end` und der
 * dazugehörige `turn/start`. Nur client-only Zeilen (`transient`) werden
 * verworfen — sie sind keine dauerhaften Ereignisse.
 * @param entries - `SessionEventWindow.entries` der Sitzungs-Bindung.
 * @returns { turn, events } oder undefined, solange kein Turn beweisbar ist.
 */
function turnSliceOf(entries) {
  const events = [];
  for (const entry of entries ?? []) {
    if (entry !== null && typeof entry === 'object' && entry.type === 'event' && entry.event !== undefined) events.push(entry.event);
  }
  for (let end = events.length - 1; end >= 0; end -= 1) {
    const closing = events[end];
    if (closing.type !== 'turn/end') continue;
    for (let start = end; start >= 0; start -= 1) {
      const opening = events[start];
      if (opening.type === 'turn/start' && opening.data.turn === closing.data.turn) {
        return { turn: closing.data.turn, events: events.slice(start, end + 1) };
      }
    }
  }
  return undefined;
}

/** Port von `billedInputTokens`: die drei disjunkten prompt-seitigen Buckets der Projektion. */
function billedInputTokens(usage) {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

/** Port von `roundedPercentUnits`: exakte Ganzzahl-Rundung, halbe Werte auf. */
function roundedPercentUnits(cacheReadTokens, denominator, decimalPlaces) {
  const scale = (decimalPlaces === 0 ? 1 : 10) * 100;
  const doubledScale = scale * 2;
  const denominatorQuotient = Math.floor(denominator / doubledScale);
  const denominatorRemainder = denominator % doubledScale;
  let lower = 0;
  let upper = scale;
  while (lower < upper) {
    const candidate = Math.floor((lower + upper + 1) / 2);
    const factor = candidate * 2 - 1;
    if (cacheReadTokens >= factor * denominatorQuotient + Math.ceil((factor * denominatorRemainder) / doubledScale)) lower = candidate;
    else upper = candidate - 1;
  }
  return lower;
}

/** Port von `displayPercentUnits`. */
function displayPercentUnits(units, decimalPlaces) {
  if (decimalPlaces === 0) return String(units);
  const whole = Math.floor(units / 10);
  const tenths = units % 10;
  return tenths === 0 ? String(whole) : `${whole}.${tenths}`;
}

/**
 * Port von `formatCacheHitPercent`: der Cache-Anteil als Text.
 *
 * `100` steht NUR für einen exakten Volltreffer. Ein Teil-Treffer, der auf 100
 * runden würde, bekommt genug zusätzliche Stellen, um unter 100 zu bleiben
 * (`99.5`, `99.99`, `99.9991`, …) — DSH verkauft einen verfehlten Treffer nie
 * als perfekten.
 * @param cacheReadTokens - exakte, aus dem Cache bediente Prompt-Token.
 * @param promptTokens - exakte Prompt-Token insgesamt.
 * @param decimalPlaces - 0 für die Sitzungs-Pille, 1 für die Turn-Offenlegung.
 * @returns Prozent-Text oder null, wenn es keinen Prompt-Token gab.
 */
function formatCacheHitPercent(cacheReadTokens, promptTokens, decimalPlaces = 0) {
  if (promptTokens === 0) return null;
  const missedInputTokens = promptTokens - cacheReadTokens;
  if (missedInputTokens === 0) return '100';
  const roundedUnits = roundedPercentUnits(cacheReadTokens, promptTokens, decimalPlaces);
  if (roundedUnits < (decimalPlaces === 0 ? 100 : 1e3)) return displayPercentUnits(roundedUnits, decimalPlaces);
  let distinguishingPlaces = 1;
  let scaledDoubleGap = missedInputTokens * 200;
  const denominatorTens = Math.floor(promptTokens / 10);
  while (scaledDoubleGap <= denominatorTens) {
    scaledDoubleGap *= 10;
    distinguishingPlaces += 1;
  }
  const denominatorOnes = promptTokens % 10;
  let roundedLoss = 5;
  for (let loss = 1; loss < 5; loss += 1) {
    const factor = loss * 2 + 1;
    const threshold = factor * denominatorTens + Math.floor((factor * denominatorOnes) / 10);
    if (scaledDoubleGap <= threshold) {
      roundedLoss = loss;
      break;
    }
  }
  return `99.${'9'.repeat(distinguishingPlaces - 1)}${10 - roundedLoss}`;
}

/** Kompakte Token-Zahl der Oberfläche: `999`, `18.5K`, `1.2M`. */
function formatTokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value < 1000) return String(value);
  const scaled = (candidate) => (candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10));
  return value < 1e6 ? `${scaled(value / 1000)}K` : `${scaled(value / 1e6)}M`;
}

/** Ganze Zahl mit deutschen Tausenderpunkten. */
function groupedDigits(value) {
  const digits = String(Math.trunc(Math.max(0, value)));
  const groups = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return groups.join('.');
}

/** Die Prompt-Seite eines Werts als Text, nur mit den Buckets, die wirklich gemeldet sind. */
function promptDetail(usage, promptTokens) {
  const parts = [];
  if (usage.cacheReadTokens !== undefined) parts.push(`${groupedDigits(usage.cacheReadTokens)} aus dem Cache`);
  parts.push(`${groupedDigits(usage.uncachedInputTokens)} neue Eingabe`);
  if (usage.cacheWriteTokens !== undefined && usage.cacheWriteTokens > 0) parts.push(`${groupedDigits(usage.cacheWriteTokens)} Cache-Schreiben`);
  return `${groupedDigits(promptTokens)} Prompt (${parts.join(', ')})`;
}

/**
 * Die Anzeige eines TURNS: exakte Zahl, Cache-Anteil mit einer Nachkommastelle
 * (dieselbe Regel wie DSHs Turn-Offenlegung).
 * @param usage - Ergebnis von {@link deriveTurnUsage}.
 * @param turn - Turn-Nummer für den Titel.
 * @returns { totalTokens, cacheHitPercent, label, detail } oder null.
 */
function turnReading(usage, turn) {
  if (usage === undefined || usage === null || !isCount(usage.totalTokens) || usage.totalTokens <= 0) return null;
  const promptTokens = usage.totalTokens - usage.outputTokens;
  const hit = usage.cacheReadTokens === undefined ? null : formatCacheHitPercent(usage.cacheReadTokens, promptTokens, 1);
  const compact = formatTokens(usage.totalTokens);
  const routes = usage.routes?.map((route) => `${route.provider}/${route.model}`).join(', ');
  return {
    totalTokens: usage.totalTokens,
    cacheHitPercent: hit,
    label: hit === null ? `${compact} tok` : `${compact} tok · ${hit} % aus Cache`,
    detail:
      `Turn ${turn}: ${groupedDigits(usage.totalTokens)} insgesamt · ` +
      `${promptDetail(usage, promptTokens)} · ${groupedDigits(usage.outputTokens)} Ausgabe` +
      (usage.reasoningTokens === undefined ? '' : ` · ${groupedDigits(usage.reasoningTokens)} davon Denken`) +
      (routes === undefined || routes === '' ? '' : ` · ${routes}`),
  };
}

/**
 * Die Anzeige der SITZUNG (Sitzungs-Projektion `tokenUsage`) — Rückfall, wenn
 * kein Turn beweisbar ist, und immer im Titel. Cache-Anteil ohne
 * Nachkommastelle, wie DSHs eigene Fuß-Pille.
 * @param usage - Wert der Projektion `tokenUsage` oder null.
 * @returns { totalTokens, cacheHitPercent, label, detail } oder null.
 */
function sessionReading(usage) {
  if (usage === undefined || usage === null) return null;
  const promptTokens = billedInputTokens(usage);
  const total = promptTokens + usage.outputTokens;
  if (!isCount(total) || total <= 0) return null;
  const hit = formatCacheHitPercent(usage.cacheReadTokens, promptTokens, 0);
  const compact = formatTokens(total);
  return {
    totalTokens: total,
    cacheHitPercent: hit,
    label: hit === null ? `${compact} tok · Sitzung` : `${compact} tok · ${hit} % aus Cache · Sitzung`,
    detail:
      `Sitzung: ${groupedDigits(total)} insgesamt · ` +
      `${groupedDigits(usage.cacheReadTokens)} aus dem Cache · ` +
      `${groupedDigits(usage.uncachedInputTokens)} neue Eingabe · ` +
      `${groupedDigits(usage.outputTokens)} Ausgabe`,
  };
}
// #endregion zwilling:token-turn

    // ---------------------------------------------------------------------
    // Die Naht: welche Sitzung gezeigt wird, ihr Ereignisfenster, ihre Sitzungssumme.
    // ---------------------------------------------------------------------

    /**
     * Die Sitzungs-Bindung der Sitzung, die die Oberfläche zeigt. Welche das ist,
     * sagt die Vorgabe-Bindung des Renderers (`SlotScopeAdapter.current`); die
     * Bindung selbst kommt aus dem Sitzungs-Dienst (`ClientSessions.binding`).
     */
    function seamOf(ctx) {
      const shown = ctx.get?.('uiSession')?.adapter?.current?.getSnapshot?.();
      const sessionId = shown?.key ?? shown?.props?.sessionId;
      if (sessionId === undefined) return undefined;
      return ctx.get?.('sessions')?.binding?.(sessionId);
    }

    /** Der jüngste vollständige Turn (aus seinen eigenen Ereignissen) und die Sitzungssumme. */
    function readPanelOf(ctx) {
      const binding = seamOf(ctx);
      const slice = turnSliceOf(binding?.eventSource?.getSnapshot?.()?.entries);
      const turn = slice === undefined ? null : turnReading(deriveTurnUsage(slice.events), slice.turn);
      const session = sessionReading(binding?.session?.projections?.faceOf?.(TOKEN_USAGE_KEY)?.getSnapshot?.());
      return { turn: turn ?? null, session: session ?? null };
    }

    /**
     * Meldet jede Änderung: neue dauerhafte Ereignisse (das Fenster wächst) und
     * ein Sitzungswechsel (dann hängt das Abo an einer anderen Bindung, wird also
     * neu angehängt).
     */
    function subscribePanelOf(ctx, listener) {
      let stopWindow = () => {};
      const attachWindow = () => {
        stopWindow();
        stopWindow = () => {};
        const source = seamOf(ctx)?.eventSource;
        if (typeof source?.subscribe === 'function') {
          const off = source.subscribe(listener);
          stopWindow = () => off?.();
        }
      };
      attachWindow();
      const shown = ctx.get?.('uiSession')?.adapter?.current;
      const stopShown =
        typeof shown?.subscribe === 'function' ? shown.subscribe(() => { attachWindow(); listener(); }) : () => {};
      return () => {
        stopShown?.();
        stopWindow();
      };
    }

    /** In `apply()` an den echten ctx gebunden; vorher liest die Anzeige nichts. */
    let readPanel = () => ({ turn: null, session: null });
    let subscribePanel = () => () => {};

    // Fallback-Text aus der Registry (Besitzer: @shinon/locale-de); ohne
    // Locale-Dienst gilt der deutsche statische Wert. 't' wird in apply()
    // gebunden, weil erst dort ein ctx existiert; die Komponente liest pro
    // Rendern und folgt so dem aktiven Locale ohne Re-Registrierung.
    // >>> shinon:dsh-idiom locale-fallback/static — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"TOKEN_DE","key":"token.fallback","label":"Token: --"}
    const TOKEN_DE = { 'token.fallback': 'Token: --' };
    let t = (key) => TOKEN_DE[key] ?? key;
    // <<< shinon:dsh-idiom locale-fallback/static

    /**
     * Bei jedem Rendern neu gelesen (wie das Locale), damit auch ein später
     * geladener Dienst von selbst folgt; das Abo stößt das nächste Rendern an,
     * sobald DSH neue Ereignisse oder einen Sitzungswechsel meldet.
     */
    function usePanel() {
      const [, setRevision] = React.useState(0);
      const reading = readPanel();
      React.useEffect(() => subscribePanel(() => setRevision((value) => value + 1)), []);
      return reading;
    }

    /** Die Sidebar übergibt "wide"; in der schmalen Leiste bricht der Text sonst um. */
    function TokenDisplay({ wide }) {
      const panel = usePanel();
      const primary = panel.turn ?? panel.session;
      // Der Ersatztext steht nur, wenn WEDER ein Turn noch eine Sitzungssumme
      // beweisbar ist; die Turn-Zahl nennt die Sitzungssumme im Titel, damit
      // beide Zahlen sichtbar bleiben und keine für die andere gehalten wird.
      const label = primary === null ? t('token.fallback') : primary.label;
      const title =
        primary === null
          ? t('token.fallback')
          : panel.turn !== null && panel.session !== null
            ? `${panel.turn.detail} · ${panel.session.detail}`
            : primary.detail;
      const style = {
        fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary)',
        borderBottom: '1px solid var(--dsw-alias-border-l1)'
      };
      if (wide !== true) {
        return h('div', {
          className: 'dsh-token-display',
          title,
          'aria-label': title,
          style: { ...style, padding: '8px', textAlign: 'center' }
        }, '📊');
      }
      return h('div', { className: 'dsh-token-display', title, 'aria-label': title, style: { ...style, padding: '8px 12px' } }, '📊 ' + label);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        readPanel = () => readPanelOf(ctx);
        subscribePanel = (listener) => subscribePanelOf(ctx, listener);

        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/token-usage', { label: 'Token-Nutzung', kind: 'client', panel: 'shinon-token-usage' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/token-usage' } }));

        // >>> shinon:dsh-idiom locale-fallback/bind — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"TOKEN_DE"}
        // Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter
        // Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft
        // ('cannot get property "locale" without inject') — das kostete dieser
        // Hälfte die Aktivierung. Der Blick passiert bei jedem Rendern, damit die
        // Anzeige auch einem später geladenen Dienst folgt; fehlt er (oder fehlt
        // `get`, wie an den repo-eigenen Attrappen), gilt TOKEN_DE.
        t = (key) => {
          const locale = ctx.get?.('locale');
          const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;
          return hit === undefined || hit === key ? (TOKEN_DE[key] ?? key) : hit;
        };
        // <<< shinon:dsh-idiom locale-fallback/bind

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'shinon-token-usage',
          order: 100
        }, TokenDisplay));
      }
    };
  }
});
