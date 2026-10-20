/**
 * @shinon/prompter — trace-report.js (Eigentuemer: AUSGANG der Spur)
 *
 * Was mit einem gefallenen Urteil passiert: Log-Zeile, Puffer, offene
 * SSE-Panels, `DECISION_CHANNEL` und — nur im In-Prozess-Fall — der
 * Fensterspiegel `window.__shinonPrompterTrace`. Der Lauf entscheidet, dieses
 * Modul erzaehlt es weiter; es liest keinen Zustand ausser `runtime.trace`.
 *
 * Warum getrennt: die Zahl der Zuschauer ist eine andere Verantwortung als die
 * Entscheidung, und ein werfender Zuhoerer darf die Entscheidung nie
 * mitreissen (siehe die `try`-Bloecke unten). Beides steht hier zusammen, damit
 * die Grenze zwischen Urteil und Zuschauer an einer Stelle zu lesen ist.
 */
import { join } from 'node:path';
import { abortLabel, abortSummary } from './abort-core.js';
import { UNDEFINED } from './intent-resolver.js';
import { DECISION_CHANNEL } from './mode-core.js';
import { provenanceLabel, provenanceSummary } from './provenance.js';

/** Entscheidung emittieren und in die Fenster-Konvention schreiben. */
export function reportTrace(ctx, config, runtime, record) {
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
  const provenance = provenanceLabel(record.provenance);
  const brief = record.brief?.id ?? record.brief_reason ?? '-';
  // Der Puffer ist die Quelle des Panels UND die Grundlage der Quote: die
  // Entscheidung trägt ihre eigenen Zähler, der Puffer summiert sie. Ohne
  // Puffer bleibt die Quote dieses Turns leer statt geraten.
  const trace = runtime?.trace;
  const traceEntry = {
    outcome: record.outcome,
    abort: record.abort ?? null,
    abort_counts: record.abort_counts ?? {},
  };
  const abortQuote = abortSummary([traceEntry, ...(Array.isArray(trace) ? trace : [])], runtime?.abortTable ?? null);
  const emitted = { ...record, abort_quote: abortQuote };
  const abortLine = abortLabel(abortQuote);
  console.log(`[shinon-prompter] Trace: ${emitted.outcome} intent=${emitted.intentClassification ?? 'UNDEFINED'} pattern=${pattern} bias=${bias} sem=${semantic} features=${features} brief=${brief}${abortLine === '' ? '' : ` ${abortLine}`}${provenance === '' ? '' : ` ${provenance}`} raw=${JSON.stringify(emitted.raw_prompt ?? '')}${salvage}`);
  if (Array.isArray(trace)) {
    trace.unshift({
      outcome: emitted.outcome,
      abort: emitted.abort ?? null,
      abort_counts: emitted.abort_counts ?? {},
      abort_quote: abortQuote,
      mode: emitted.mode,
      reasons: emitted.reasons,
      context_source: emitted.context_source ?? null,
      provenance: provenanceSummary(emitted.provenance),
      brief: emitted.brief ?? null,
      brief_reason: emitted.brief_reason ?? null,
      intent: emitted.intentClassification ?? 'UNDEFINED',
      intent_pattern: emitted.intentMatch ?? null,
      intent_bias: emitted.intentBias ?? null,
      intent_semantic: emitted.intentSemantic ?? 0,
      intent_features: emitted.intentFeatures ?? [],
      raw_prompt: emitted.raw_prompt ?? null,
      salvage: emitted.salvage ?? null,
      at: Date.now(),
    });
    trace.length = Math.min(trace.length, 20);
    // Live an die offenen Panels; ohne Verbindung bleibt der Puffer die Quelle.
    const sse = runtime?.sse;
    if (sse !== undefined) for (const response of sse) {
      try { response.write(`data: ${JSON.stringify(trace)}\n\n`); } catch { /* Verbindung weg */ }
    }
  }
  if (emitted.outcome !== 'accepted') {
    const detail = emitted.reasons.join(', ');
    if (emitted.outcome === 'unavailable') console.warn(`[shinon-prompter] nicht verfuegbar (${detail}) — Roh-Prompt gilt`);
    else console.warn(`[shinon-prompter] verworfen (${detail}) — Roh-Prompt gilt`);
  }
  try {
    if (typeof ctx?.emit === 'function') ctx.emit(DECISION_CHANNEL, emitted);
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
        outcome: emitted.outcome,
        abort: emitted.abort ?? null,
        abort_counts: emitted.abort_counts ?? {},
        abort_quote: abortQuote,
        mode: emitted.mode,
        reasons: emitted.reasons?.slice(0, 5) ?? [],
        context_source: emitted.context_source ?? null,
        provenance: provenanceSummary(emitted.provenance),
        // Dieselben Felder wie im Puffer oben: zwei Spiegel mit verschiedenen
        // Formen waeren zwei Wahrheiten ohne Drift-Test.
        brief: emitted.brief ?? null,
        brief_reason: emitted.brief_reason ?? null,
        salvage: emitted.salvage ?? null,
        at: emitted.session_id ? Date.now() : null,
      });
      w.__shinonPrompterTrace = list.slice(0, 20);
    }
  } catch { /* die Spur ist Nebensache; das Fenster darf den Schritt nicht brechen */ }
}

